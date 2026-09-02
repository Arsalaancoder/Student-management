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
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { checkId, submissionId, targetFeaturesData, matchesToInsert, finalScore, status } = req.body || {};

  if (!submissionId) {
    return res.status(400).json({ success: false, error: 'submissionId is required.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://lrnjkezowdhwnsysgzgt.supabase.co";
  const supabaseKey = getServiceRoleKey();

  if (!supabaseUrl || !supabaseKey) {
    console.error('[Finalize API] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on server environment');
    return res.status(500).json({ success: false, error: 'Originality service is temporarily unavailable. Please try again shortly.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const timeoutGuard = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Finalize operation timed out')), 15000)
  );

  console.log('[PLAGIARISM] 15 finalize_handler_started', { checkId, submissionId });

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

          console.log('[SUBMISSION] Finalizing submission status:', { submissionId, submissionStatus: 'submitted', plagiarismStatus: status });

          const { error: subUpdateError } = await supabase.from('submissions').update({
            similarity_score: finalScore,
            status: 'submitted',
            updated_at: new Date().toISOString()
          }).eq('id', submissionId);

          if (subUpdateError) console.warn('[Finalize] Submission update warning:', subUpdateError.message);
        }
      })(),
      timeoutGuard
    ]);

    console.log('[PLAGIARISM] 20 finalize_response_sent', { httpStatus: 200, checkId, submissionId });
    return res.status(200).json({ success: true, message: 'Plagiarism check records finalized successfully.' });
  } catch (err) {
    console.error('Error finalizing plagiarism check:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to finalize plagiarism check.' });
  }
}
