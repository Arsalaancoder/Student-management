import { createClient } from '@supabase/supabase-js';
import { finalizePlagiarismCheckRecords } from '../server/services/plagiarismService.js';

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

  const { checkId, submissionId, targetFeaturesData, matchesToInsert, finalScore, status } = req.body || {};

  if (!submissionId) {
    return res.status(400).json({ error: 'submissionId is required.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://lrnjkezowdhwnsysgzgt.supabase.co";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxybmprZXpvd2Rod25zeXNnemd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzAyMDI4MiwiZXhwIjoyMTAyNTk2MjgyfQ.haIHjC1lL7OSjfKPd5rogCd2_bvF73n_s69DMqDPB1U";

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
