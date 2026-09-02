import { createClient } from '@supabase/supabase-js';
import { executePreSubmissionPlagiarismCheck } from '../server/services/plagiarismService.js';

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

  const { fileBase64, fileName, mimeType, assignmentId, studentId } = req.body || {};

  if (!fileBase64 || !fileName || !assignmentId || !studentId) {
    return res.status(400).json({ error: 'fileBase64, fileName, assignmentId, and studentId are required.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://lrnjkezowdhwnsysgzgt.supabase.co";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxybmprZXpvd2Rod25zeXNnemd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMjAyODIsImV4cCI6MjEwMjU5NjI4Mn0.AQ1gQ5v4WQuqRxc1r4YT2iZvAeyWsL_giXw48QbVtOQ";

  const supabase = createClient(supabaseUrl, supabaseKey);

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
}

