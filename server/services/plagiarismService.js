import { createClient } from '@supabase/supabase-js';
import {
  validateDocumentFile,
  extractRawText,
  normalizeTextPipeline,
  validateMinimumWordCount,
  computeFileHash,
  computeContentHash
} from './textProcessor.js';
import {
  generateChunkEmbedding,
  runPlagiarismCheck
} from './plagiarismEngine.js';

/**
 * Perform server-side pre-submission plagiarism check and handle database persistence.
 */
export async function executePreSubmissionPlagiarismCheck({
  fileBuffer,
  fileName,
  mimeType,
  assignmentId,
  studentId,
  supabaseClient
}) {
  if (!fileBuffer || !fileName || !assignmentId || !studentId) {
    throw new Error('Missing required arguments for plagiarism check.');
  }

  // 1. Validate File Attributes
  const fileVal = validateDocumentFile(fileBuffer, fileName, mimeType);
  if (!fileVal.valid) {
    return {
      success: false,
      allowed: false,
      status: 'failed',
      errorType: 'VALIDATION_ERROR',
      message: fileVal.error
    };
  }

  console.log('[PLAGIARISM] 01 validation_complete', { assignmentId, studentId });

  // 2. Fetch Assignment Configuration (Optional - fallback defaults if missing)
  let assignmentData = null;
  try {
    const { data: fullAssign } = await supabaseClient
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .maybeSingle();
    assignmentData = fullAssign;
  } catch (e) {
    console.warn('[PLAGIARISM] Assignment query warning (using default config):', e.message);
  }

  const assignment = {
    id: assignmentId,
    plagiarism_enabled: assignmentData?.plagiarism_enabled ?? true,
    plagiarism_review_threshold: Number(assignmentData?.plagiarism_review_threshold ?? 20),
    plagiarism_block_threshold: Number(assignmentData?.plagiarism_block_threshold ?? 30),
    template_text: assignmentData?.template_text || null
  };

  // 3. Extract Raw Text
  console.log('[PLAG] 3 file parsed', { fileName, fileSize: fileBuffer.length });
  let rawText = '';
  try {
    rawText = await extractRawText(fileBuffer, fileName);
  } catch (extractErr) {
    console.error('[PLAG ERROR]', {
      stage: '4 text extracted',
      name: extractErr?.name,
      message: extractErr?.message,
      code: 'TEXT_EXTRACTION_FAILED'
    });
    return {
      success: false,
      allowed: false,
      status: 'failed',
      errorType: 'TEXT_EXTRACTION_FAILED',
      errorCode: 'TEXT_EXTRACTION_FAILED',
      message: 'Unable to extract enough readable text from this document. Please upload a searchable PDF or DOCX file.'
    };
  }

  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    console.error('[PLAG ERROR]', {
      stage: '4 text extracted',
      message: 'Extracted text is empty',
      code: 'TEXT_EXTRACTION_FAILED'
    });
    return {
      success: false,
      allowed: false,
      status: 'failed',
      errorType: 'TEXT_EXTRACTION_FAILED',
      errorCode: 'TEXT_EXTRACTION_FAILED',
      message: 'Unable to extract enough readable text from this document. Please upload a searchable PDF or DOCX file.'
    };
  }

  console.log('[PLAG] 4 text extracted', { rawLength: rawText.length });

  // 4. Normalize Text Pipeline & Compute Hashes
  const templateText = assignment.template_text || null;
  const normData = normalizeTextPipeline(rawText, templateText);
  const fileHash = computeFileHash(fileBuffer);
  const contentHash = computeContentHash(normData.normalizedFullText);

  console.log('[PLAG] 5 hashes generated', {
    wordCount: normData.wordCount,
    normalizedTextLength: normData.normalizedFullText.length,
    contentHashPrefix: contentHash.substring(0, 8)
  });

  // 5. Validate Minimum Word Count (Default >= 30 words)
  const wordVal = validateMinimumWordCount(normData.wordCount, 30);
  if (!wordVal.valid) {
    console.error('[PLAG ERROR]', {
      stage: '5 min word count',
      message: wordVal.error,
      code: 'INSUFFICIENT_CONTENT'
    });
    return {
      success: false,
      allowed: false,
      status: 'failed',
      errorType: 'INSUFFICIENT_CONTENT',
      errorCode: 'INSUFFICIENT_CONTENT',
      message: wordVal.error
    };
  }

  // 6. Generate Embeddings for Paragraph Chunks
  const chunksWithEmbeddings = [];
  for (const chunk of normData.chunks) {
    const emb = await generateChunkEmbedding(chunk.rawText, chunk.tokens);
    chunksWithEmbeddings.push({
      ...chunk,
      embedding: emb
    });
  }

  // 7. Retrieve Candidate Document Features for SAME assignment_id (EXCLUDING current student)
  console.log('[PLAG] 6 candidate query', { assignmentId, excludingStudent: studentId });

  const { data: candidates, error: candErr } = await supabaseClient
    .from('submission_document_features')
    .select('*')
    .eq('assignment_id', assignmentId)
    .neq('student_id', studentId);

  if (candErr) {
    console.error('[PLAG ERROR]', {
      stage: '6 candidate query',
      name: candErr?.name,
      message: candErr?.message,
      code: candErr?.code
    });
    return {
      success: false,
      allowed: false,
      status: 'failed',
      errorType: 'CANDIDATE_QUERY_FAILED',
      errorCode: 'CANDIDATE_QUERY_FAILED',
      message: 'Originality service is temporarily unavailable. Your assignment has not been submitted. Please try again shortly.'
    };
  }

  const candidateCount = candidates ? candidates.length : 0;
  console.log('[PLAG] 7 candidate query success', { candidateCount });

  // 8. Execute Plagiarism Engine
  const analysisResult = await runPlagiarismCheck({
    targetNormalizedText: normData.normalizedFullText,
    targetTokens: normData.tokens,
    targetChunks: chunksWithEmbeddings,
    targetWordCount: normData.wordCount,
    targetStudentId: studentId,
    targetContentHash: contentHash,
    targetFileHash: fileHash,
    assignmentId: assignmentId,
    assignmentConfig: assignment,
    candidateFeatures: candidates || []
  });

  console.log('[PLAG] 8 similarity complete', {
    status: analysisResult.status,
    allowed: analysisResult.allowed,
    finalScore: analysisResult.finalScore
  });

  const {
    status,
    allowed,
    comparisonCount,
    finalScore,
    tfidfScore,
    ngramScore,
    semanticScore,
    highestMatchSubmissionId,
    highestMatchStudentId,
    matches,
    candidateMatches,
    message
  } = analysisResult;

  console.log('[PLAGIARISM] 04 similarity_check_complete', {
    status,
    allowed,
    comparisonCount,
    finalScore,
    contentHashPrefix: contentHash.substring(0, 8)
  });

  // 9. Record Plagiarism Check Attempt in Database (For Audit Trail)
  let checkId = null;
  try {
    const { data: checkRow, error: checkErr } = await supabaseClient
      .from('plagiarism_checks')
      .insert({
        assignment_id: assignmentId,
        submission_id: null,
        student_id: studentId,
        word_count: normData.wordCount,
        file_hash: fileHash,
        content_hash: contentHash,
        tfidf_score: tfidfScore,
        ngram_score: ngramScore,
        semantic_score: semanticScore,
        final_score: finalScore,
        status: status,
        highest_match_submission_id: highestMatchSubmissionId,
        highest_match_student_id: highestMatchStudentId,
        error_message: null
      })
      .select()
      .single();

    if (checkErr) {
      console.warn('Warning inserting plagiarism_checks record:', checkErr.message);
    } else {
      checkId = checkRow?.id;
    }
  } catch (e) {
    console.warn('Non-fatal error creating plagiarism_checks audit row:', e);
  }

  // If BLOCK: Return block response immediately. DO NOT create final submission!
  if (status === 'blocked' || allowed === false) {
    return {
      success: true,
      allowed: false,
      status: 'blocked',
      comparisonCount,
      finalScore,
      tfidfScore,
      ngramScore,
      semanticScore,
      reviewThreshold: assignment.plagiarism_review_threshold,
      blockThreshold: assignment.plagiarism_block_threshold,
      checkId,
      // Debug Response Fields (Safe prefixes only)
      candidateCount,
      currentStudentId: studentId,
      currentWordCount: normData.wordCount,
      currentContentHashPrefix: contentHash.substring(0, 8),
      exactHashMatchFound: analysisResult.exactMatchFound ?? false,
      message: message || `Submission Blocked. Similarity detected: ${finalScore}%. Significant similarity was found with an existing submission. Please revise your work and submit again.`
    };
  }

  // If PASS, FLAG, or NO_CANDIDATES: Return allowed status along with extracted features ready to be saved upon submission completion
  return {
    success: true,
    allowed: true,
    status: status, // 'no_candidates', 'passed', or 'flagged'
    comparisonCount,
    candidateCount,
    finalScore,
    tfidfScore,
    ngramScore,
    semanticScore,
    reviewThreshold: assignment.plagiarism_review_threshold,
    blockThreshold: assignment.plagiarism_block_threshold,
    checkId,
    // Debug Response Fields (Safe prefixes only)
    currentStudentId: studentId,
    currentWordCount: normData.wordCount,
    currentContentHashPrefix: contentHash.substring(0, 8),
    exactHashMatchFound: false,

    targetFeaturesData: {
      plagiarism_check_id: checkId,
      assignment_id: assignmentId,
      student_id: studentId,
      file_hash: fileHash,
      content_hash: contentHash,
      normalized_text: normData.normalizedFullText,
      word_count: normData.wordCount,
      finalized: true,
      ngram_features: normData.tokens.slice(0, 500),
      chunks: normData.chunks.map(c => ({ index: c.index, rawText: c.rawText, wordCount: c.wordCount })),
      chunk_embeddings: chunksWithEmbeddings.map(c => ({ index: c.index, embedding: c.embedding }))
    },
    matchesToInsert: (matches || []).map(m => ({
      plagiarism_check_id: checkId,
      matched_submission_id: m.matched_submission_id,
      source_chunk_index: m.source_chunk_index,
      matched_chunk_index: m.matched_chunk_index,
      source_text: m.source_text,
      matched_text: m.matched_text,
      similarity_score: m.similarity_score,
      match_type: m.match_type
    })),
    candidateMatchesSummary: candidateMatches,
    message: status === 'no_candidates'
      ? 'Originality check passed. No previous submissions were available for comparison.'
      : status === 'flagged'
        ? `Similarity detected: ${finalScore}%. Your submission has been accepted but marked for professor review.`
        : `Originality Check Passed. Similarity: ${finalScore}%.`
  };
}

/**
 * Persist final submission document features and matches after submission record is created.
 */
export async function finalizePlagiarismCheckRecords({
  checkId,
  submissionId,
  targetFeaturesData,
  matchesToInsert,
  supabaseClient
}) {
  try {
    if (checkId && submissionId) {
      const { error: checkErr } = await supabaseClient
        .from('plagiarism_checks')
        .update({ submission_id: submissionId, updated_at: new Date().toISOString() })
        .eq('id', checkId);

      if (checkErr) console.warn('Warning updating plagiarism_checks submission_id:', checkErr.message);
    }

    if (targetFeaturesData && submissionId) {
      console.log('[PLAGIARISM] features_insert_started', { checkId, submissionId, wordCount: targetFeaturesData?.word_count });

      const { error: featErr } = await supabaseClient
        .from('submission_document_features')
        .insert({
          ...targetFeaturesData,
          submission_id: submissionId,
          finalized: true
        });

      if (featErr) console.error('Error inserting submission_document_features:', featErr);
      else console.log('[PLAGIARISM] features_insert_finished', { submissionId, success: true });
    }

    if (Array.isArray(matchesToInsert) && matchesToInsert.length > 0 && checkId) {
      const validMatches = matchesToInsert.map(m => ({ ...m, plagiarism_check_id: checkId }));
      const { error: matchErr } = await supabaseClient
        .from('plagiarism_matches')
        .insert(validMatches);

      if (matchErr) console.warn('Warning inserting plagiarism_matches:', matchErr.message);
    }
  } catch (err) {
    console.error('Error finalizing plagiarism check records:', err);
  }
}
