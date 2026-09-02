import { createClient } from '@supabase/supabase-js';
import {
  validateDocumentFile,
  extractRawText,
  normalizeTextPipeline,
  validateMinimumWordCount
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
      errorType: 'VALIDATION_ERROR',
      message: fileVal.error
    };
  }

  // 2. Fetch Assignment Configuration (Thresholds, Plagiarism Toggle, Template Text)
  let assignmentData = null;
  const { data: fullAssign, error: assignErr } = await supabaseClient
    .from('assignments')
    .select('*')
    .eq('id', assignmentId)
    .maybeSingle();

  if (assignErr || !fullAssign) {
    const { data: basicAssign } = await supabaseClient
      .from('assignments')
      .select('id, title, description, deadline, created_by')
      .eq('id', assignmentId)
      .maybeSingle();

    if (!basicAssign) {
      throw new Error(`Assignment not found: ${assignErr?.message || assignmentId}`);
    }
    assignmentData = basicAssign;
  } else {
    assignmentData = fullAssign;
  }

  const assignment = {
    ...assignmentData,
    plagiarism_enabled: assignmentData.plagiarism_enabled ?? true,
    plagiarism_review_threshold: Number(assignmentData.plagiarism_review_threshold ?? 20),
    plagiarism_block_threshold: Number(assignmentData.plagiarism_block_threshold ?? 30),
    template_text: assignmentData.template_text || null
  };

  // 3. Extract Raw Text
  let rawText = '';
  try {
    rawText = await extractRawText(fileBuffer, fileName);
  } catch (extractErr) {
    console.error(`[PLAGIARISM ENGINE] Text extraction failed for ${fileName}:`, extractErr);
    return {
      success: false,
      status: 'failed',
      errorType: 'EXTRACTION_ERROR',
      message: 'Unable to extract readable text from this document. Please upload a searchable PDF or DOCX.'
    };
  }

  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    console.error(`[PLAGIARISM ENGINE] Extracted text is empty for ${fileName}`);
    return {
      success: false,
      status: 'failed',
      errorType: 'EXTRACTION_ERROR',
      message: 'Unable to extract readable text from this document. Please upload a searchable PDF or DOCX.'
    };
  }

  // 4. Normalize Text Pipeline & Exclude Assignment Template Text
  const templateText = assignment.template_text || null;
  const normData = normalizeTextPipeline(rawText, templateText);

  console.log(`[PLAGIARISM DEBUG] File: ${fileName} | Extracted Char Count: ${rawText.length} | Word Count: ${normData.wordCount}`);
  console.log(`[PLAGIARISM DEBUG] First 300 chars: ${rawText.substring(0, 300)}`);

  // 5. Validate Minimum Word Count (Default >= 100 words)
  const wordVal = validateMinimumWordCount(normData.wordCount, 100);
  if (!wordVal.valid) {
    return {
      success: false,
      status: 'failed',
      errorType: 'INSUFFICIENT_CONTENT',
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

  // 7. Retrieve Candidate Document Features for the SAME assignment_id (Excluding current student)
  const { data: candidates, error: candErr } = await supabaseClient
    .from('submission_document_features')
    .select('*')
    .eq('assignment_id', assignmentId)
    .neq('student_id', studentId);

  if (candErr) {
    console.error(`[PLAGIARISM ENGINE] Database error fetching document features for assignment ${assignmentId}:`, candErr);
    return {
      success: false,
      status: 'failed',
      errorType: 'DATABASE_ERROR',
      message: 'Plagiarism checking is temporarily unavailable due to a database query error.'
    };
  }

  const candidateCount = candidates ? candidates.length : 0;
  console.log(`[PLAGIARISM DEBUG] CURRENT assignment_id: ${assignmentId} | CURRENT student_id: ${studentId} | candidateCount: ${candidateCount}`);

  // 8. Execute Plagiarism Engine
  const analysisResult = await runPlagiarismCheck({
    targetNormalizedText: normData.normalizedFullText,
    targetTokens: normData.tokens,
    targetChunks: chunksWithEmbeddings,
    targetWordCount: normData.wordCount,
    targetStudentId: studentId,
    assignmentId: assignmentId,
    assignmentConfig: assignment,
    candidateFeatures: candidates || []
  });

  const {
    status,
    finalScore,
    tfidfScore,
    ngramScore,
    semanticScore,
    highestMatchSubmissionId,
    highestMatchStudentId,
    matches,
    candidateMatches
  } = analysisResult;

  // 9. Record Plagiarism Check Attempt in Database (For Auditability)
  const { data: checkRow, error: checkErr } = await supabaseClient
    .from('plagiarism_checks')
    .insert({
      assignment_id: assignmentId,
      submission_id: null, // Assigned after submission creation
      student_id: studentId,
      word_count: normData.wordCount,
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
    console.error('Error inserting plagiarism_checks record:', checkErr);
  }

  const checkId = checkRow?.id;

  // If BLOCK: Return block response immediately. DO NOT create final submission!
  if (status === 'blocked') {
    return {
      success: true,
      allowed: false,
      status: 'blocked',
      finalScore,
      tfidfScore,
      ngramScore,
      semanticScore,
      reviewThreshold: assignment.plagiarism_review_threshold,
      blockThreshold: assignment.plagiarism_block_threshold,
      checkId,
      message: `Submission Blocked. Similarity detected: ${finalScore}%. Significant similarity was found with an existing submission. Please revise your work and submit again.`
    };
  }

  // If PASS or FLAG: Return allowed status along with extracted features ready to be saved upon submission completion
  return {
    success: true,
    allowed: true,
    status: status, // 'passed' or 'flagged'
    finalScore,
    tfidfScore,
    ngramScore,
    semanticScore,
    reviewThreshold: assignment.plagiarism_review_threshold,
    blockThreshold: assignment.plagiarism_block_threshold,
    checkId,
    targetFeaturesData: {
      plagiarism_check_id: checkId,
      assignment_id: assignmentId,
      student_id: studentId,
      normalized_text: normData.normalizedFullText,
      word_count: normData.wordCount,
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
    message: status === 'flagged'
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
      // 1. Update check row with submission_id
      await supabaseClient
        .from('plagiarism_checks')
        .update({ submission_id: submissionId, updated_at: new Date().toISOString() })
        .eq('id', checkId);
    }

    if (targetFeaturesData && submissionId) {
      // 2. Insert document features
      await supabaseClient
        .from('submission_document_features')
        .insert({
          ...targetFeaturesData,
          submission_id: submissionId
        });
    }

    if (matchesToInsert && matchesToInsert.length > 0) {
      // 3. Insert plagiarism matches
      await supabaseClient
        .from('plagiarism_matches')
        .insert(matchesToInsert);
    }
  } catch (err) {
    console.error('Error finalizing plagiarism check records:', err);
  }
}
