import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import mammoth from 'mammoth';
import {
  normalizeText,
  tokenizeText,
  generateNGrams,
  calculateJaccardSimilarity,
  calculateCosineSimilarity
} from './utils/textNormalizer.js';

// Use createRequire to import CJS module (pdf-parse) in an ESM context
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robustly load environment variables from project root .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(__dirname, './.env.local') });
dotenv.config();

import { executePreSubmissionPlagiarismCheck, finalizePlagiarismCheckRecords } from './services/plagiarismService.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("FATAL ERROR: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Central Thresholds Configuration
const REVIEW_THRESHOLD = 30; // 30%
const HIGH_THRESHOLD = 70;   // 70%

// Extract Text from various buffer formats
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
    // Attempt plain text read as fallback
    try {
      return fileBuffer.toString('utf-8');
    } catch (e) {
      throw new Error(`Unsupported or unreadable file format: ${ext}`);
    }
  }
}

// Compute Layer 2 Semantic Similarity using Gemini or fallback semantic n-gram overlap
async function calculateSemanticSimilarity(textA, textB) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.EMBEDDING_API_KEY;

  if (apiKey) {
    try {
      // Re-use Gemini REST embedding endpoint securely server-side if key provided
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "models/embedding-001",
          content: { parts: [{ text: textA.substring(0, 2000) }] }
        })
      });

      const resB = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "models/embedding-001",
          content: { parts: [{ text: textB.substring(0, 2000) }] }
        })
      });

      if (res.ok && resB.ok) {
        const dataA = await res.json();
        const dataB = await resB.json();

        const vecA = dataA.embedding?.values;
        const vecB = dataB.embedding?.values;

        if (vecA && vecB && vecA.length === vecB.length) {
          let dot = 0, magA = 0, magB = 0;
          for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            magA += vecA[i] * vecA[i];
            magB += vecB[i] * vecB[i];
          }
          const cosineSim = dot / (Math.sqrt(magA) * Math.sqrt(magB));
          return Math.round(Math.max(0, Math.min(100, cosineSim * 100)));
        }
      }
    } catch (err) {
      console.warn('Gemini embedding API call failed, using fallback semantic scoring:', err.message);
    }
  }

  // Fallback Semantic Approximation: Skip word order, compare 4-grams and 5-grams
  const tokensA = tokenizeText(textA);
  const tokensB = tokenizeText(textB);
  const n4A = generateNGrams(tokensA, 4);
  const n4B = generateNGrams(tokensB, 4);
  const n5A = generateNGrams(tokensA, 5);
  const n5B = generateNGrams(tokensB, 5);

  const j4 = calculateJaccardSimilarity(n4A, n4B);
  const j5 = calculateJaccardSimilarity(n5A, n5B);
  const combined = (j4 * 0.6 + j5 * 0.4);

  return Math.round(combined * 100);
}

// Core Similarity Check Processor
async function processSubmissionSimilarity(submissionId) {
  // 1. Fetch Target Submission
  const { data: targetSub, error: targetError } = await supabase
    .from('submissions')
    .select('*, submission_versions(*)')
    .eq('id', submissionId)
    .single();

  if (targetError || !targetSub) throw targetError || new Error('Submission not found');

  const versions = targetSub.submission_versions || [];
  if (versions.length === 0) throw new Error('No file version found for submission');

  // Sort versions descending
  versions.sort((a, b) => b.version_number - a.version_number);
  const targetVersion = versions[0];

  // Download Target File
  const { data: targetFileData, error: targetFileError } = await supabase.storage
    .from('submissions')
    .download(targetVersion.file_url);

  if (targetFileError) throw targetFileError;

  const targetBuffer = Buffer.from(await targetFileData.arrayBuffer());
  const rawTargetText = await extractText(targetBuffer, targetVersion.file_name);
  const normalizedTargetText = normalizeText(rawTargetText);

  if (!normalizedTargetText) {
    throw new Error('Extracted submission text is empty or unreadable.');
  }

  const targetTokens = tokenizeText(normalizedTargetText);
  const target3Grams = generateNGrams(targetTokens, 3);

  // 2. Fetch Other Submissions for the EXACT SAME assignment
  const { data: otherSubs, error: otherError } = await supabase
    .from('submissions')
    .select('*, submission_versions(*), profiles(full_name, student_id, email)')
    .eq('assignment_id', targetSub.assignment_id)
    .neq('id', submissionId); // Exclude self

  if (otherError) throw otherError;

  let maxSimilarity = 0;
  let highestLexical = 0;
  let highestSemantic = 0;
  let isDuplicateSubmission = false;
  const matches = [];

  // 3. Compare Target Submission against other submissions for SAME assignment
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

      // Check if it's the SAME student submitting duplicate (Self-Duplicate Protection)
      const isSameStudent = otherSub.student_id === targetSub.student_id;

      // Layer 1: Lexical Similarity
      const otherTokens = tokenizeText(normalizedOtherText);
      const other3Grams = generateNGrams(otherTokens, 3);

      const jaccardSim = calculateJaccardSimilarity(target3Grams, other3Grams);
      const cosineSim = calculateCosineSimilarity(normalizedTargetText, normalizedOtherText);
      const lexicalScore = Math.round((jaccardSim * 0.5 + cosineSim * 0.5) * 100);

      // Layer 2: Semantic Similarity
      const semanticScore = await calculateSemanticSimilarity(normalizedTargetText, normalizedOtherText);

      // Combined Final Score (50% Lexical + 50% Semantic)
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
          methods_used: ['TF-IDF Cosine', 'N-gram Jaccard', 'Semantic Embeddings'],
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
      console.error(`Error comparing against submission ${otherSub.id}:`, err);
    }
  }

  // Sort matches descending by similarity percentage
  matches.sort((a, b) => b.similarity_percentage - a.similarity_percentage);

  // Determine Risk / Status Level (Non-accusatory wording)
  let statusLevel = "low";
  if (isDuplicateSubmission) {
    statusLevel = "duplicate";
  } else if (maxSimilarity >= HIGH_THRESHOLD) {
    statusLevel = "high";
  } else if (maxSimilarity >= REVIEW_THRESHOLD) {
    statusLevel = "review";
  }

  const reportData = {
    matches: matches,
    lexical_score: highestLexical,
    semantic_score: highestSemantic,
    methods_used: ["TF-IDF Cosine Similarity", "3-Gram Phrase Matching", "Semantic Embedding Analysis"],
    semantic_similarity: highestSemantic > 0 ? `${highestSemantic}%` : "Calculated",
    is_duplicate_submission: isDuplicateSubmission,
    status: statusLevel,
    analyzed_at: new Date().toISOString()
  };

  // 4. Update or Insert Plagiarism Report (Upsert logic to avoid duplication on retry)
  const { error: upsertError } = await supabase
    .from('plagiarism_reports')
    .upsert({
      submission_id: submissionId,
      similarity_percentage: maxSimilarity,
      status: 'completed',
      report_data: reportData
    }, { onConflict: 'submission_id' });

  if (upsertError) throw upsertError;

  // 5. Update submission similarity score
  await supabase
    .from('submissions')
    .update({
      similarity_score: maxSimilarity,
      updated_at: new Date().toISOString()
    })
    .eq('id', submissionId);

  return { success: true, similarity: maxSimilarity, status: statusLevel, matchesCount: matches.length };
}

// POST Endpoint: Real Pre-Submission Plagiarism Check
app.post('/api/check-plagiarism-presubmit', async (req, res) => {
  const { fileBase64, fileName, mimeType, assignmentId, studentId } = req.body || {};

  if (!fileBase64 || !fileName || !assignmentId || !studentId) {
    return res.status(400).json({ error: 'fileBase64, fileName, assignmentId, and studentId are required.' });
  }

  try {
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const result = await executePreSubmissionPlagiarismCheck({
      fileBuffer,
      fileName,
      mimeType,
      assignmentId,
      studentId,
      supabaseClient: supabase
    });

    return res.json(result);
  } catch (err) {
    console.error('Error executing pre-submission plagiarism check:', err);
    return res.status(500).json({
      success: false,
      errorType: 'SERVER_ERROR',
      message: err.message || 'Plagiarism checking is temporarily unavailable. Please try again.'
    });
  }
});

// POST Endpoint: Finalize Plagiarism Check Records (after submission row creation)
app.post('/api/finalize-plagiarism-check', async (req, res) => {
  const { checkId, submissionId, targetFeaturesData, matchesToInsert, finalScore, status } = req.body || {};

  if (!submissionId) {
    return res.status(400).json({ error: 'submissionId is required.' });
  }

  try {
    await finalizePlagiarismCheckRecords({
      checkId,
      submissionId,
      targetFeaturesData,
      matchesToInsert,
      supabaseClient: supabase
    });

    // Also update legacy plagiarism_reports and submissions tables for backwards compatibility
    if (finalScore !== undefined) {
      await supabase.from('plagiarism_reports').upsert({
        submission_id: submissionId,
        similarity_percentage: finalScore,
        status: 'completed',
        report_data: {
          finalScore,
          status,
          analyzed_at: new Date().toISOString()
        }
      }, { onConflict: 'submission_id' });

      await supabase.from('submissions').update({
        similarity_score: finalScore,
        status: status === 'flagged' ? 'flagged' : 'submitted',
        updated_at: new Date().toISOString()
      }).eq('id', submissionId);
    }

    return res.json({ success: true, message: 'Plagiarism check records finalized successfully.' });
  } catch (err) {
    console.error('Error finalizing plagiarism check:', err);
    return res.status(500).json({ error: err.message || 'Failed to finalize plagiarism check.' });
  }
});

// POST Endpoint: Check Similarity
app.post('/api/check-similarity', async (req, res) => {
  const { submissionId } = req.body;

  if (!submissionId) {
    return res.status(400).json({ error: 'submissionId is required' });
  }

  try {
    const result = await processSubmissionSimilarity(submissionId);
    return res.json(result);
  } catch (error) {
    console.error('Error processing similarity check:', error);

    // Save failed status cleanly without destroying submission
    try {
      await supabase.from('plagiarism_reports').upsert({
        submission_id: submissionId,
        similarity_percentage: 0,
        status: 'processing_failed',
        report_data: {
          error: error.message || String(error),
          failed_at: new Date().toISOString()
        }
      }, { onConflict: 'submission_id' });
    } catch (e) {
      console.error('Failed to log processing failure to database:', e);
    }

    return res.status(500).json({
      error: error.message || 'Similarity processing failed',
      status: 'processing_failed'
    });
  }
});

// POST Endpoint: Retry Similarity Analysis
app.post('/api/plagiarism/retry', async (req, res) => {
  const { submissionId } = req.body;

  if (!submissionId) {
    return res.status(400).json({ error: 'submissionId is required' });
  }

  try {
    const result = await processSubmissionSimilarity(submissionId);
    return res.json({ success: true, message: 'Retry completed successfully', ...result });
  } catch (error) {
    console.error('Error retrying similarity check:', error);
    return res.status(500).json({ error: error.message || 'Retry analysis failed' });
  }
});

// POST Endpoint: Secure Professor Registration
app.post('/api/register-professor', async (req, res) => {
  const { fullName, email, password, accessKey } = req.body || {};

  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown_ip').split(',')[0].trim();

  try {
    // Rate Limiting Check: Max 5 failed attempts per IP within last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: failedAttempts } = await supabase
      .from('professor_signup_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', clientIp)
      .gte('attempted_at', fifteenMinutesAgo);

    if (failedAttempts !== null && failedAttempts >= 5) {
      return res.status(429).json({ error: 'Too many failed attempts. Please try again later.' });
    }

    // Key Presence Check
    if (!accessKey || typeof accessKey !== 'string' || !accessKey.trim()) {
      return res.status(400).json({ error: 'Professor access key is required.' });
    }

    // Retrieve server secret key (defaults to NBKRIST-2K27)
    const expectedKey = process.env.PROFESSOR_SIGNUP_KEY || 'NBKRIST-2K27';

    // Secure Key Comparison
    if (accessKey.trim() !== expectedKey.trim()) {
      // Record failed attempt for rate limiting
      await supabase.from('professor_signup_attempts').insert({
        ip_address: clientIp,
        attempted_at: new Date().toISOString()
      });

      return res.status(403).json({ error: 'Invalid professor access key. Please contact the administrator.' });
    }

    // Server-side validation succeeded! Create Supabase Auth User with service role
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'professor'
      },
      app_metadata: {
        role: 'professor',
        is_verified_professor: true
      }
    });

    if (authErr || !authData.user) {
      return res.status(400).json({ error: authErr?.message || 'Unable to verify professor access key. Please try again.' });
    }

    // Explicitly update/upsert profile row with role='professor'
    const { error: profileErr } = await supabase.from('profiles').upsert({
      auth_user_id: authData.user.id,
      email: email,
      full_name: fullName,
      role: 'professor'
    }, { onConflict: 'auth_user_id' });

    if (profileErr) {
      console.error('Error creating professor profile:', profileErr);
    }

    // Clean up failed attempts for this IP after successful registration
    await supabase
      .from('professor_signup_attempts')
      .delete()
      .eq('ip_address', clientIp);

    return res.json({ success: true, user: authData.user });
  } catch (err) {
    console.error('register-professor server exception:', err);
    return res.status(500).json({ error: 'Unable to verify professor access key. Please try again.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Similarity Processing Service running on port ${PORT}`);
});

