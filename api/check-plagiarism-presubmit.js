import { createClient } from '@supabase/supabase-js';
import { executePreSubmissionPlagiarismCheck } from '../server/services/plagiarismService.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fileBase64, fileName, mimeType, assignmentId, studentId } = req.body || {};

  if (!fileBase64 || !fileName || !assignmentId || !studentId) {
    return res.status(400).json({ error: 'fileBase64, fileName, assignmentId, and studentId are required.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing Supabase credentials' });
  }

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
