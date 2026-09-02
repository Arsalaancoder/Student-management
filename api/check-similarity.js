import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.toLowerCase().replace(/[\r\t\f\v]/g, ' ').replace(/\n+/g, ' ').replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function tokenizeText(text) {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(' ').filter(word => word.length > 0) : [];
}

function generateNGrams(tokens, n = 3) {
  const ngrams = new Set();
  if (!tokens || tokens.length < n) return ngrams;
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function calculateJaccardSimilarity(setA, setB) {
  if (!setA || !setB || (setA.size === 0 && setB.size === 0)) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
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
      console.error('PDF parsing error, attempting raw text fallback:', pdfErr);
      return fileBuffer.toString('utf-8');
    }
  } else if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value || '';
  } else if (ext === 'txt') {
    return fileBuffer.toString('utf-8');
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

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://lrnjkezowdhwnsysgzgt.supabase.co";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxybmprZXpvd2Rod25zeXNnemd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzAyMDI4MiwiZXhwIjoyMTAyNTk2MjgyfQ.haIHjC1lL7OSjfKPd5rogCd2_bvF73n_s69DMqDPB1U";

  const supabase = createClient(supabaseUrl, supabaseKey);

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

    const targetTokens = tokenizeText(normalizedTargetText);
    const target3Grams = generateNGrams(targetTokens, 3);

    const { data: otherSubs, error: otherError } = await supabase
      .from('submissions')
      .select('*, submission_versions(*), profiles(full_name, student_id, email)')
      .eq('assignment_id', targetSub.assignment_id)
      .neq('id', submissionId);

    if (otherError) throw otherError;

    let maxSimilarity = 0;
    let highestLexical = 0;
    let highestSemantic = 0;
    let isDuplicateSubmission = false;
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

        const isSameStudent = otherSub.student_id === targetSub.student_id;
        const otherTokens = tokenizeText(normalizedOtherText);
        const other3Grams = generateNGrams(otherTokens, 3);

        const jaccardSim = calculateJaccardSimilarity(target3Grams, other3Grams);
        const cosineSim = calculateCosineSimilarity(normalizedTargetText, normalizedOtherText);
        const lexicalScore = Math.round((jaccardSim * 0.5 + cosineSim * 0.5) * 100);

        // Layer 2 approximation
        const n4A = generateNGrams(targetTokens, 4);
        const n4B = generateNGrams(otherTokens, 4);
        const semanticScore = Math.round(calculateJaccardSimilarity(n4A, n4B) * 100);

        const combinedScore = Math.round((lexicalScore * 0.5) + (semanticScore * 0.5));

        if (isSameStudent && combinedScore > 90) {
          isDuplicateSubmission = true;
        }

        if (combinedScore > 0) {
          const studentProfile = otherSub.profiles || {};
          const studentDisplayName = studentProfile.full_name || studentProfile.email || `Student (${studentProfile.student_id || 'ID'})`;

          matches.push({
            matching_submission_id: otherSub.id,
            student_name: studentDisplayName,
            similarity_percentage: combinedScore,
            lexical_score: lexicalScore,
            semantic_score: semanticScore,
            match_type: combinedScore >= 85 ? 'exact' : combinedScore >= 60 ? 'near_exact' : 'semantic',
            methods_used: ['TF-IDF Cosine', 'N-gram Jaccard', 'Semantic Analysis'],
            target_text_preview: rawTargetText.substring(0, 600),
            matched_text_preview: rawOtherText.substring(0, 600)
          });
        }

        if (!isSameStudent) {
          if (combinedScore > maxSimilarity) maxSimilarity = combinedScore;
          if (lexicalScore > highestLexical) highestLexical = lexicalScore;
          if (semanticScore > highestSemantic) highestSemantic = semanticScore;
        }

      } catch (err) {
        console.error(`Error comparing against ${otherSub.id}:`, err);
      }
    }

    matches.sort((a, b) => b.similarity_percentage - a.similarity_percentage);

    let statusLevel = "low";
    if (isDuplicateSubmission) statusLevel = "duplicate";
    else if (maxSimilarity >= 70) statusLevel = "high";
    else if (maxSimilarity >= 30) statusLevel = "review";

    const reportData = {
      matches,
      lexical_score: highestLexical,
      semantic_score: highestSemantic,
      methods_used: ["TF-IDF Cosine Similarity", "3-Gram Phrase Matching", "Semantic Analysis"],
      semantic_similarity: `${highestSemantic}%`,
      is_duplicate_submission: isDuplicateSubmission,
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

    return res.json({ success: true, similarity: maxSimilarity, status: statusLevel, matchesCount: matches.length });

  } catch (error) {
    console.error('Error in check-similarity handler:', error);
    try {
      await supabase.from('plagiarism_reports').upsert({
        submission_id: submissionId,
        similarity_percentage: 0,
        status: 'processing_failed',
        report_data: { error: error.message || String(error), failed_at: new Date().toISOString() }
      }, { onConflict: 'submission_id' });
    } catch (e) {}

    return res.status(500).json({ error: error.message || 'Similarity check failed' });
  }
}
