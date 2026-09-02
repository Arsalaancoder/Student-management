import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import mammoth from 'mammoth';
import crypto from 'crypto';

let pdfParse;
try {
  pdfParse = require('pdf-parse/lib/pdf-parse.js');
} catch (e) {
  try { pdfParse = require('pdf-parse'); } catch (err) {}
}

function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.toLowerCase().replace(/[\r\t\f\v]/g, ' ').replace(/\n+/g, ' ').replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function tokenizeText(text) {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(' ').filter(word => word.length > 0) : [];
}

function generateNGrams(tokens, n = 4) {
  const ngrams = new Set();
  if (!tokens || tokens.length < n) return ngrams;
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function calculateJaccardSimilarity(setA, setB) {
  if (!setA || !setB || (setA.size === 0 && setB.size === 0)) return 0;
  let intersectionCount = 0;
  setA.forEach(x => { if (setB.has(x)) intersectionCount++; });
  const unionSize = setA.size + setB.size - intersectionCount;
  return unionSize > 0 ? intersectionCount / unionSize : 0;
}

function calculateCosineSimilarity(textA, textB) {
  const tokensA = tokenizeText(textA);
  const tokensB = tokenizeText(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const freqA = {}, freqB = {}, allWords = new Set();
  tokensA.forEach(w => { freqA[w] = (freqA[w] || 0) + 1; allWords.add(w); });
  tokensB.forEach(w => { freqB[w] = (freqB[w] || 0) + 1; allWords.add(w); });

  let dot = 0, magA = 0, magB = 0;
  allWords.forEach(w => {
    const valA = freqA[w] || 0, valB = freqB[w] || 0;
    dot += valA * valB;
    magA += valA * valA;
    magB += valB * valB;
  });

  return (magA === 0 || magB === 0) ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function extractText(fileBuffer, fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') {
    try {
      if (typeof pdfParse === 'function') {
        const data = await pdfParse(fileBuffer);
        return data.text || '';
      } else if (pdfParse && typeof pdfParse.PDFParse === 'function') {
        const parser = new pdfParse.PDFParse({ data: fileBuffer });
        const result = await parser.getText();
        return typeof result === 'string' ? result : (result?.text || '');
      } else if (pdfParse && typeof pdfParse.default === 'function') {
        const data = await pdfParse.default(fileBuffer);
        return data.text || '';
      }
      return fileBuffer.toString('utf-8');
    } catch (pdfErr) {
      return fileBuffer.toString('utf-8');
    }
  } else if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value || '';
  } else {
    return fileBuffer.toString('utf-8');
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { submissionId } = req.body || {};
  if (!submissionId) {
    return res.status(400).json({ error: 'submissionId is required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[PLAG ERROR]', {
      stage: '2 env verified',
      errorCode: 'SERVER_CONFIG_ERROR',
      missingSupabaseUrl: !supabaseUrl,
      missingServiceRoleKey: !serviceRoleKey,
      vercelEnv: process.env.VERCEL_ENV
    });
    return res.status(500).json({ success: false, errorCode: 'SERVER_CONFIG_ERROR', error: 'Originality service is temporarily unavailable. Please try again shortly.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: targetSub, error: targetError } = await supabase
      .from('submissions')
      .select('*, submission_versions(*)')
      .eq('id', submissionId)
      .single();

    if (targetError || !targetSub) throw targetError || new Error('Submission not found');

    const versions = targetSub.submission_versions || [];
    if (versions.length === 0) throw new Error('No file version found');

    versions.sort((a, b) => b.version_number - a.version_number);
    const targetVersion = versions[0];

    const { data: targetFileData, error: targetFileError } = await supabase.storage
      .from('submissions')
      .download(targetVersion.file_url);

    if (targetFileError) throw targetFileError;

    const targetBuffer = Buffer.from(await targetFileData.arrayBuffer());
    const rawTargetText = await extractText(targetBuffer, targetVersion.file_name);
    const normalizedTargetText = normalizeText(rawTargetText);

    if (!normalizedTargetText || normalizedTargetText.split(/\s+/).length < 100) {
      return res.json({
        success: false,
        status: 'failed',
        message: 'Unable to extract enough readable text from this document.'
      });
    }

    const targetContentHash = crypto.createHash('sha256').update(normalizedTargetText).digest('hex');
    const targetTokens = tokenizeText(normalizedTargetText);
    const target4Grams = generateNGrams(targetTokens, 4);

    // FETCH CANDIDATES: SAME assignment, EXCLUDE target student's own submissions
    const { data: otherSubs, error: otherError } = await supabase
      .from('submissions')
      .select('*, submission_versions(*), profiles(full_name, student_id, email)')
      .eq('assignment_id', targetSub.assignment_id)
      .neq('student_id', targetSub.student_id);

    if (otherError) throw otherError;

    if (!otherSubs || otherSubs.length === 0) {
      return res.json({
        success: true,
        similarity: 0,
        status: 'no_candidates',
        comparisonCount: 0,
        matchesCount: 0,
        message: 'Originality check passed. No previous submissions were available for comparison.'
      });
    }

    let maxSimilarity = 0;
    let highestLexical = 0;
    let highestSemantic = 0;
    const matches = [];

    for (const otherSub of otherSubs) {
      if (!otherSub.submission_versions || otherSub.submission_versions.length === 0) continue;
      const otherVersions = [...otherSub.submission_versions].sort((a, b) => b.version_number - a.version_number);
      const otherVersion = otherVersions[0];

      try {
        const { data: otherFileData, error: otherFileError } = await supabase.storage
          .from('submissions')
          .download(otherVersion.file_url);

        if (otherFileError) continue;

        const otherBuffer = Buffer.from(await otherFileData.arrayBuffer());
        const rawOtherText = await extractText(otherBuffer, otherVersion.file_name);
        const normalizedOtherText = normalizeText(rawOtherText);

        if (!normalizedOtherText) continue;

        const candidateContentHash = crypto.createHash('sha256').update(normalizedOtherText).digest('hex');
        if (targetContentHash === candidateContentHash) {
          maxSimilarity = 100;
          highestLexical = 100;
          highestSemantic = 100;
          const studentProfile = otherSub.profiles || {};
          const studentDisplayName = studentProfile.full_name || studentProfile.email || `Student (${studentProfile.student_id || 'ID'})`;
          matches.push({
            matching_submission_id: otherSub.id,
            student_name: studentDisplayName,
            similarity_percentage: 100,
            lexical_score: 100,
            semantic_score: 100,
            match_type: 'exact',
            methods_used: ['Exact Content Hash (SHA-256)'],
            target_text_preview: rawTargetText.substring(0, 600),
            matched_text_preview: rawOtherText.substring(0, 600)
          });
          break;
        }

        const otherTokens = tokenizeText(normalizedOtherText);
        const other4Grams = generateNGrams(otherTokens, 4);

        const jaccardSim = calculateJaccardSimilarity(target4Grams, other4Grams);
        const cosineSim = calculateCosineSimilarity(normalizedTargetText, normalizedOtherText);
        const lexicalScore = Math.round((cosineSim * 0.40 + jaccardSim * 0.60) * 100);
        const semanticScore = Math.round(jaccardSim * 100);

        const combinedScore = Math.round((lexicalScore * 0.50) + (semanticScore * 0.50));

        if (combinedScore > 20) {
          const studentProfile = otherSub.profiles || {};
          const studentDisplayName = studentProfile.full_name || studentProfile.email || `Student (${studentProfile.student_id || 'ID'})`;

          matches.push({
            matching_submission_id: otherSub.id,
            student_name: studentDisplayName,
            similarity_percentage: combinedScore,
            lexical_score: lexicalScore,
            semantic_score: semanticScore,
            match_type: combinedScore >= 85 ? 'exact' : combinedScore >= 60 ? 'near_exact' : 'semantic',
            methods_used: ['TF-IDF Cosine', '4-Gram Jaccard'],
            target_text_preview: rawTargetText.substring(0, 600),
            matched_text_preview: rawOtherText.substring(0, 600)
          });
        }

        if (combinedScore > maxSimilarity) maxSimilarity = combinedScore;
        if (lexicalScore > highestLexical) highestLexical = lexicalScore;
        if (semanticScore > highestSemantic) highestSemantic = semanticScore;

      } catch (err) {
        console.error(`Error comparing against ${otherSub.id}:`, err);
      }
    }

    matches.sort((a, b) => b.similarity_percentage - a.similarity_percentage);

    let statusLevel = "passed";
    if (maxSimilarity >= 30) statusLevel = "blocked";
    else if (maxSimilarity >= 20) statusLevel = "flagged";

    const reportData = {
      matches,
      lexical_score: highestLexical,
      semantic_score: highestSemantic,
      methods_used: ["TF-IDF Cosine Similarity", "4-Gram Phrase Matching"],
      status: statusLevel,
      analyzed_at: new Date().toISOString()
    };

    await supabase.from('plagiarism_reports').upsert({
      submission_id: submissionId,
      similarity_percentage: maxSimilarity,
      status: 'completed',
      report_data: reportData
    }, { onConflict: 'submission_id' });

    await supabase.from('submissions').update({
      similarity_score: maxSimilarity,
      updated_at: new Date().toISOString()
    }).eq('id', submissionId);

    return res.json({
      success: true,
      similarity: maxSimilarity,
      status: statusLevel,
      comparisonCount: otherSubs.length,
      matchesCount: matches.length
    });

  } catch (error) {
    console.error('Error in check-similarity handler:', error);
    return res.status(500).json({ error: error.message || 'Similarity check failed' });
  }
}
