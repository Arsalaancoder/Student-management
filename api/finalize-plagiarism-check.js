import { createClient } from '@supabase/supabase-js';
import { finalizePlagiarismCheckRecords } from '../server/services/plagiarismService.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { checkId, submissionId, targetFeaturesData, matchesToInsert, finalScore, status } = req.body || {};

  if (!submissionId) {
    return res.status(400).json({ error: 'submissionId is required.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing Supabase credentials' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    await finalizePlagiarismCheckRecords({
      checkId,
      submissionId,
      targetFeaturesData,
      matchesToInsert,
      supabaseClient: supabase
    });

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
}
