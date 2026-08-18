import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// Load environment variables from the parent directory's .env.local
dotenv.config({ path: '../.env.local' });

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("FATAL ERROR: Missing SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  console.error("Please add your Service Role Key to .env.local to bypass RLS securely for background processing.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- N-gram & Similarity Logic ---
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 0);
}

function getNGrams(tokens, n = 3) {
  const ngrams = new Set();
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function calculateJaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// Extract Text from various buffer formats
async function extractText(fileBuffer, fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  if (ext === 'pdf') {
    const data = await pdfParse(fileBuffer);
    return data.text;
  } else if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } else if (ext === 'txt') {
    return fileBuffer.toString('utf-8');
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }
}

app.post('/api/check-similarity', async (req, res) => {
  const { submissionId } = req.body;

  if (!submissionId) {
    return res.status(400).json({ error: 'submissionId is required' });
  }

  try {
    // 1. Fetch Target Submission
    const { data: targetSub, error: targetError } = await supabase
      .from('submissions')
      .select('*, submission_versions!inner(*)')
      .eq('id', submissionId)
      .single();

    if (targetError || !targetSub) throw targetError || new Error('Submission not found');

    const targetVersion = targetSub.submission_versions.sort((a,b) => b.version_number - a.version_number)[0];
    if (!targetVersion) throw new Error('No file version found for submission');

    // Download Target File
    const { data: targetFileData, error: targetFileError } = await supabase.storage
      .from('submissions')
      .download(targetVersion.file_url);
    
    if (targetFileError) throw targetFileError;
    
    const targetBuffer = Buffer.from(await targetFileData.arrayBuffer());
    const targetText = await extractText(targetBuffer, targetVersion.file_name);
    const targetTokens = tokenize(targetText);
    const targetNGrams = getNGrams(targetTokens, 3); // Trigrams

    // 2. Fetch Other Submissions for the same assignment
    const { data: otherSubs, error: otherError } = await supabase
      .from('submissions')
      .select('*, submission_versions(*), profiles(full_name)')
      .eq('assignment_id', targetSub.assignment_id)
      .neq('id', submissionId); // Exclude self

    if (otherError) throw otherError;

    let maxSimilarity = 0;
    const matches = [];

    // 3. Compare with Others
    for (const otherSub of otherSubs) {
      if (!otherSub.submission_versions || otherSub.submission_versions.length === 0) continue;
      
      const otherVersion = otherSub.submission_versions.sort((a,b) => b.version_number - a.version_number)[0];
      
      try {
        const { data: otherFileData, error: otherFileError } = await supabase.storage
          .from('submissions')
          .download(otherVersion.file_url);
        
        if (otherFileError) continue;

        const otherBuffer = Buffer.from(await otherFileData.arrayBuffer());
        const otherText = await extractText(otherBuffer, otherVersion.file_name);
        const otherTokens = tokenize(otherText);
        const otherNGrams = getNGrams(otherTokens, 3);

        const similarity = calculateJaccardSimilarity(targetNGrams, otherNGrams);
        const similarityPercentage = Math.round(similarity * 100);

        if (similarityPercentage > 0) {
          matches.push({
            matching_submission_id: otherSub.id,
            student_name: otherSub.profiles.full_name, // Backend knows this, frontend won't expose it to students
            similarity_percentage: similarityPercentage,
            method: 'N-gram similarity',
            target_text_preview: targetText.substring(0, 500),
            matched_text_preview: otherText.substring(0, 500)
          });
        }

        if (similarityPercentage > maxSimilarity) {
          maxSimilarity = similarityPercentage;
        }

      } catch (err) {
        console.error(`Error processing submission ${otherSub.id}:`, err);
      }
    }

    // Sort matches
    matches.sort((a, b) => b.similarity_percentage - a.similarity_percentage);

    // 4. Delete existing report if any
    await supabase.from('plagiarism_reports').delete().eq('submission_id', submissionId);

    // Determine Risk Level
    let riskLevel = "Low";
    if (maxSimilarity > 20 && maxSimilarity <= 50) riskLevel = "Moderate";
    else if (maxSimilarity > 50 && maxSimilarity <= 75) riskLevel = "High";
    else if (maxSimilarity > 75) riskLevel = "Very High";

    const reportData = {
      matches: matches,
      methods_used: ["Phrase matching", "N-gram similarity"],
      semantic_similarity: "unavailable",
      risk_level: riskLevel
    };

    // 5. Insert new report
    const { error: insertError } = await supabase.from('plagiarism_reports').insert({
      submission_id: submissionId,
      similarity_percentage: maxSimilarity,
      status: 'completed',
      report_data: reportData
    });

    if (insertError) throw insertError;

    // Update Submission
    await supabase.from('submissions').update({ similarity_score: maxSimilarity }).eq('id', submissionId);

    return res.json({ success: true, similarity: maxSimilarity, riskLevel });

  } catch (error) {
    console.error('Error in check-similarity:', error);
    
    // Attempt to mark as failed
    try {
      await supabase.from('plagiarism_reports').upsert({
        submission_id: submissionId,
        similarity_percentage: 0,
        status: 'processing_failed',
        report_data: { error: error.message || String(error) }
      }, { onConflict: 'submission_id' });
    } catch (e) {}

    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Similarity Processing Service running on port ${PORT}`);
});
