import { createClient } from '@supabase/supabase-js';
import { executePreSubmissionPlagiarismCheck } from '../server/services/plagiarismService.js';

function getServiceRoleKey() {
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
                 process.env.SUPABASE_SERVICE_KEY ||
                 process.env.SUPABASE_SECRET_KEY ||
                 process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!envKey) return null;
  return envKey;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, errorCode: 'METHOD_NOT_ALLOWED', error: 'Method not allowed' });
  }

  const { fileBase64, fileName, mimeType, assignmentId, studentId } = req.body || {};

  console.log('[PLAG] 1 request received', { fileName, mimeType, assignmentId, studentId });

  if (!fileBase64 || !fileName || !assignmentId || !studentId) {
    console.error('[PLAG ERROR]', {
      stage: '1 request received',
      message: 'fileBase64, fileName, assignmentId, and studentId are required.',
      code: 'VALIDATION_ERROR'
    });
    return res.status(400).json({
      success: false,
      allowed: false,
      status: 'failed',
      errorCode: 'VALIDATION_ERROR',
      message: 'fileBase64, fileName, assignmentId, and studentId are required.'
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://lrnjkezowdhwnsysgzgt.supabase.co";
  const supabaseKey = getServiceRoleKey();

  if (!supabaseUrl || !supabaseKey) {
    const supabaseEnvKeys = Object.keys(process.env).filter(k => k.toLowerCase().includes('supabase'));
    console.error('[PLAG ERROR]', {
      stage: '2 env verified',
      message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on server environment',
      code: 'SERVER_CONFIG_ERROR',
      detectedSupabaseEnvKeys: supabaseEnvKeys
    });
    return res.status(500).json({
      success: false,
      allowed: false,
      status: 'failed',
      errorCode: 'SERVER_CONFIG_ERROR',
      errorType: 'SERVER_CONFIGURATION_ERROR',
      message: 'Originality service is temporarily unavailable. Your assignment has not been submitted. Please try again shortly.'
    });
  }

  console.log('[PLAG] 2 env verified', { supabaseUrlHost: supabaseUrl.replace(/https?:\/\//, '') });

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

    console.log('[PLAG] 13 response success', {
      httpStatus: 200,
      success: result.success,
      allowed: result.allowed,
      status: result.status,
      finalScore: result.finalScore,
      errorCode: result.errorType || result.errorCode
    });

    if (result.success === false || result.allowed === false) {
      return res.status(result.status === 'blocked' ? 200 : 400).json({
        errorCode: result.errorType || result.errorCode || 'PLAGIARISM_CHECK_FAILED',
        ...result
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[PLAG ERROR]', {
      stage: 'handler_uncaught_exception',
      name: err?.name,
      message: err?.message,
      code: err?.code || 'SERVER_ERROR'
    });
    return res.status(500).json({
      success: false,
      allowed: false,
      status: 'failed',
      errorCode: 'SERVER_ERROR',
      message: 'Originality service is temporarily unavailable. Your assignment has not been submitted. Please try again shortly.'
    });
  }
}
