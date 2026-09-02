import { createClient } from '@supabase/supabase-js';
import { finalizePlagiarismCheckRecords } from '../server/services/plagiarismService.js';

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

  const { checkId, submissionId, targetFeaturesData, matchesToInsert, finalScore, status } = req.body || {};

  console.log('[PLAG] 11 finalize', { checkId, submissionId, finalScore, status });

  if (!submissionId) {
    console.error('[PLAG ERROR]', {
      stage: '11 finalize',
      message: 'submissionId is required',
      code: 'VALIDATION_ERROR'
    });
    return res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', error: 'submissionId is required.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://lrnjkezowdhwnsysgzgt.supabase.co";
  const supabaseKey = getServiceRoleKey();

  if (!supabaseUrl || !supabaseKey) {
    console.error('[PLAG ERROR]', {
      stage: '11 finalize env',
      message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on server environment',
      code: 'SERVER_CONFIG_ERROR'
    });
    return res.status(500).json({ success: false, errorCode: 'SERVER_CONFIG_ERROR', error: 'Originality service is temporarily unavailable. Please try again shortly.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const timeoutGuard = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Finalize operation timed out')), 15000)
  );

  try {
    await Promise.race([
      (async () => {
        await finalizePlagiarismCheckRecords({
          checkId,
          submissionId,
          targetFeaturesData,
          matchesToInsert,
          supabaseClient: supabase
        });

        console.log('[PLAG] 12 features persisted', { checkId, submissionId });

        if (finalScore !== undefined) {
          const { error: rptError } = await supabase.from('plagiarism_reports').upsert({
            submission_id: submissionId,
            similarity_percentage: finalScore,
            status: 'completed',
            report_data: {
              finalScore,
              status: status || 'passed',
              analyzed_at: new Date().toISOString()
            }
          }, { onConflict: 'submission_id' });

          if (rptError) {
            console.error('[PLAG ERROR]', { stage: 'plagiarism_reports_upsert', code: rptError.code, message: rptError.message });
          }

          const { error: subUpdateError } = await supabase.from('submissions').update({
            similarity_score: finalScore,
            status: 'submitted',
            updated_at: new Date().toISOString()
          }).eq('id', submissionId);

          if (subUpdateError) {
            console.error('[PLAG ERROR]', { stage: 'submissions_update', code: subUpdateError.code, message: subUpdateError.message });
          }
        }
      })(),
      timeoutGuard
    ]);

    return res.status(200).json({ success: true, message: 'Plagiarism check records finalized successfully.' });
  } catch (err) {
    console.error('[PLAG ERROR]', {
      stage: 'finalize_uncaught_exception',
      name: err?.name,
      message: err?.message,
      code: err?.code || 'FINALIZE_FAILED'
    });
    return res.status(500).json({ success: false, errorCode: 'FINALIZE_FAILED', error: err.message || 'Failed to finalize plagiarism check.' });
  }
}
