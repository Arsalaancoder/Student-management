import assert from 'assert';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { executePreSubmissionPlagiarismCheck, finalizePlagiarismCheckRecords } from '../services/plagiarismService.js';
import { computeTfidfCosineSimilarity, computeNGramSimilarity } from '../services/plagiarismEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase Service Role Key for integration test.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('====================================================');
console.log('  EduTrack Exact Duplicate Plagiarism Integration Test');
console.log('====================================================\n');

async function runDuplicateIntegrationTest() {
  // Fetch existing professor and student profile IDs from DB
  const { data: profs } = await supabase.from('profiles').select('id').eq('role', 'professor').limit(1);
  const { data: studs } = await supabase.from('profiles').select('id').eq('role', 'student').limit(2);

  const professorId = profs?.[0]?.id || '00000000-0000-0000-0000-000000000001';
  const studentAId = studs?.[0]?.id || '00000000-0000-0000-0000-000000000002';
  const studentBId = studs?.[1]?.id || '00000000-0000-0000-0000-000000000003';
  const testAssignmentId = '00000000-0000-0000-0000-000000000999';
  const submissionAId = '00000000-0000-0000-0000-000000000a01';

  try {
    // 1. Direct TF-IDF & N-Gram Algorithm Tests on Identical Strings (Steps 5 & 6)
    const textA = "artificial intelligence enables machines to learn from data and improve performance over time through statistical modeling algorithms";
    const textB = "artificial intelligence enables machines to learn from data and improve performance over time through statistical modeling algorithms";

    const tokensA = textA.split(' ');
    const tokensB = textB.split(' ');

    const tfidfTestRes = computeTfidfCosineSimilarity(tokensA, 'docA', [{ submission_id: 'docB', tokens: tokensB }]);
    const directTfidfScore = tfidfTestRes.scoresMap.get('docB');
    assert(directTfidfScore >= 95, `Expected TF-IDF >= 95%, got ${directTfidfScore}%`);
    console.log(`✓ STEP 5 DIRECT TF-IDF PASSED: Identical strings score ${directTfidfScore}%`);

    const ngramTestRes = computeNGramSimilarity(tokensA, tokensB, 4);
    assert(ngramTestRes.score >= 95, `Expected N-Gram >= 95%, got ${ngramTestRes.score}%`);
    console.log(`✓ STEP 6 DIRECT N-GRAM PASSED: Identical strings score ${ngramTestRes.score}%`);

    // Clean up any old test records
    await supabase.from('submission_document_features').delete().eq('assignment_id', testAssignmentId);
    await supabase.from('plagiarism_checks').delete().eq('assignment_id', testAssignmentId);
    await supabase.from('submissions').delete().eq('assignment_id', testAssignmentId);
    await supabase.from('assignments').delete().eq('id', testAssignmentId);

    // 2. Setup Test Assignment in Supabase
    const { error: assignErr } = await supabase.from('assignments').insert({
      id: testAssignmentId,
      title: 'Integration Test Assignment - Plagiarism',
      subject_name: 'Computer Science',
      description: 'Test assignment for exact duplicate detection',
      deadline: new Date(Date.now() + 86400000).toISOString(),
      plagiarism_enabled: true,
      plagiarism_review_threshold: 20,
      plagiarism_block_threshold: 30,
      created_by: professorId
    });

    if (assignErr) {
      console.warn('Assignment creation warning (may already exist):', assignErr.message);
    }

    // 3. Create Sample Assignment PDF Document Text (>100 words)
    const sampleTextContent = `
    Machine Learning and Artificial Intelligence Fundamentals Report.
    Artificial intelligence is a branch of computer science focused on building smart machines capable of performing tasks that typically require human intelligence.
    Machine learning is a core subset of artificial intelligence that provides systems the ability to automatically learn and improve from experience without being explicitly programmed.
    Supervised learning algorithms build mathematical models of training data containing inputs and target outputs.
    Unsupervised learning algorithms examine unlabelled datasets to discover hidden clusters, groupings, and structural patterns.
    Deep learning utilizes multi-layered artificial neural networks inspired by biological brain structures to achieve high performance in computer vision and natural language processing.
    `.repeat(2);

    const pdfBuffer = Buffer.from(sampleTextContent, 'utf-8');

    // 4. Student A Uploads First Submission
    console.log('\n--- Student A Submits First ---');
    const resA = await executePreSubmissionPlagiarismCheck({
      fileBuffer: pdfBuffer,
      fileName: 'student_a_report.txt',
      mimeType: 'text/plain',
      assignmentId: testAssignmentId,
      studentId: studentAId,
      supabaseClient: supabase
    });

    assert.strictEqual(resA.allowed, true);
    assert.strictEqual(resA.status, 'passed');
    assert.strictEqual(resA.finalScore, 0);
    console.log(`✓ Student A check result: allowed=${resA.allowed}, status=${resA.status}, similarity=${resA.finalScore}%`);

    // Create submission row for Student A in submissions table
    await supabase.from('submissions').insert({
      id: submissionAId,
      assignment_id: testAssignmentId,
      student_id: studentAId,
      status: 'submitted',
      similarity_score: 0
    });

    // Persist Student A's features into submission_document_features (Simulating completed submission)
    await finalizePlagiarismCheckRecords({
      checkId: resA.checkId,
      submissionId: submissionAId,
      targetFeaturesData: resA.targetFeaturesData,
      matchesToInsert: [],
      supabaseClient: supabase
    });

    // Verify Student A's feature row is stored in DB
    const { data: storedFeats, error: featReadErr } = await supabase
      .from('submission_document_features')
      .select('*')
      .eq('assignment_id', testAssignmentId);

    assert.strictEqual(storedFeats.length, 1);
    console.log(`✓ Student A features successfully persisted in submission_document_features table (Candidate count = ${storedFeats.length})`);

    // 5. Student B Uploads EXACT SAME Document for SAME Assignment
    console.log('\n--- Student B Submits Identical Document ---');
    const resB = await executePreSubmissionPlagiarismCheck({
      fileBuffer: pdfBuffer,
      fileName: 'student_b_copy_report.txt',
      mimeType: 'text/plain',
      assignmentId: testAssignmentId,
      studentId: studentBId,
      supabaseClient: supabase
    });

    assert.strictEqual(resB.allowed, false, 'Student B exact duplicate submission MUST be disallowed');
    assert.strictEqual(resB.status, 'blocked', 'Student B status MUST be blocked');
    assert(resB.finalScore >= 90, `Expected Student B score >= 90%, got ${resB.finalScore}%`);
    assert(resB.tfidfScore >= 90, `Expected Student B TF-IDF >= 90%, got ${resB.tfidfScore}%`);
    assert(resB.ngramScore >= 90, `Expected Student B N-Gram >= 90%, got ${resB.ngramScore}%`);
    assert(resB.semanticScore >= 80, `Expected Student B Semantic >= 80%, got ${resB.semanticScore}%`);

    console.log(`\n====================================================`);
    console.log(`✓ STEP 11 EXACT DUPLICATE SUCCESSFUL:`);
    console.log(`  - Candidate Count Found: 1`);
    console.log(`  - TF-IDF Score: ${resB.tfidfScore}%`);
    console.log(`  - N-Gram Score: ${resB.ngramScore}%`);
    console.log(`  - Semantic Score: ${resB.semanticScore}%`);
    console.log(`  - Final Similarity Score: ${resB.finalScore}%`);
    console.log(`  - Submission Decision: ${resB.status.toUpperCase()} (Submission Blocked)`);
    console.log(`====================================================\n`);

    // Clean up test assignment & features
    await supabase.from('submission_document_features').delete().eq('assignment_id', testAssignmentId);
    await supabase.from('plagiarism_checks').delete().eq('assignment_id', testAssignmentId);
    await supabase.from('assignments').delete().eq('id', testAssignmentId);

    console.log('✓ Cleanup complete. All integration assertion steps passed!');
  } catch (err) {
    console.error('❌ Integration Test Failed:', err);
    process.exit(1);
  }
}

runDuplicateIntegrationTest();
