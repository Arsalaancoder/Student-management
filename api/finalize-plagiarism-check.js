import { createClient } from '@supabase/supabase-js';
import { finalizePlagiarismCheckRecords } from '../server/services/plagiarismService.js';

function getServiceRoleKey() {
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  console.log('[PLAGIARISM] 13 finalize_request_received', { checkId, submissionId, finalScore, status });

  if (!submissionId) {
    console.error('[PLAGIARISM] 13_error missing_submission_id');
    return res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', error: 'submissionId is required.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://lrnjkezowdhwnsysgzgt.supabase.co";
  const supabaseKey = getServiceRoleKey();

  if (!supabaseUrl || !supabaseKey) {
    console.error('[PLAGIARISM] 13_error missing_server_env', { hasSupabaseUrl: !!supabaseUrl, hasServiceRoleKey: !!supabaseKey });
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
            console.error('[PLAGIARISM] 14_error plagiarism_reports_upsert_failed', { errorCode: rptError.code, message: rptError.message });
          }

          console.log('[SUBMISSION] Finalizing submission status:', { submissionId, submissionStatus: 'submitted', plagiarismStatus: status });

          const { error: subUpdateError } = await supabase.from('submissions').update({
            similarity_score: finalScore,
            status: 'submitted',
            updated_at: new Date().toISOString()
          }).eq('id', submissionId);

          if (subUpdateError) {
            console.error('[PLAGIARISM] 14_error submissions_update_failed', { errorCode: subUpdateError.code, message: subUpdateError.message });
          }
        }
      })(),
      timeoutGuard
    ]);

    console.log('[PLAGIARISM] 15 finalize_completed', { httpStatus: 200, checkId, submissionId });
    return res.status(200).json({ success: true, message: 'Plagiarism check records finalized successfully.' });
  } catch (err) {
    console.error('[PLAGIARISM] 15_error finalize_uncaught_exception', {
      stage: 'finalize_handler',
      errorMessage: err.message,
      errorCode: err.code || 'FINALIZATION_ERROR'
    });
    return res.status(500).json({ success: false, errorCode: 'FINALIZATION_ERROR', error: err.message || 'Failed to finalize plagiarism check.' });
  }
}
