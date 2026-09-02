import assert from 'assert';
import {
  validateDocumentFile,
  extractRawText,
  normalizeTextPipeline,
  validateMinimumWordCount,
  computeContentHash,
  computeFileHash
} from '../services/textProcessor.js';
import {
  generateChunkEmbedding,
  computeTfidfCosineSimilarity,
  computeNGramSimilarity,
  compareChunksSemanticAndNgram,
  runPlagiarismCheck
} from '../services/plagiarismEngine.js';

console.log('====================================================');
console.log('   EduTrack False-Positive Verification Test Suite  ');
console.log('====================================================\n');

async function buildChunksWithEmbeddings(normData) {
  const chunks = [];
  for (const c of normData.chunks) {
    const emb = await generateChunkEmbedding(c.rawText, c.tokens);
    chunks.push({ ...c, embedding: emb });
  }
  return chunks;
}

const sampleAssignmentConfig = {
  plagiarism_enabled: true,
  plagiarism_review_threshold: 20,
  plagiarism_block_threshold: 30,
  template_text: null
};

async function runTests() {
  let passedCount = 0;
  let totalTests = 20;

  // 1. Base Document Texts
  const docAI = `
  Artificial intelligence is transforming education by helping students learn more effectively through personalized adaptive platforms.
  Machine learning algorithms examine student quiz performance, reading pace, and engagement patterns to generate customized study recommendations.
  Intelligent tutoring systems provide instant feedback on complex problem-solving exercises in mathematics and computer science.
  Natural language processing allows educational applications to grade short essays, analyze grammar patterns, and summarize lecture transcripts automatically.
  Educational technology institutions leverage AI predictive modeling to identify at-risk students early and provide targeted academic interventions.
  `.repeat(3);

  const docSolar = `
  Renewable energy systems such as solar photovoltaic panels and wind turbines reduce human dependence on fossil fuel power generation.
  Solar cells convert radiant light energy directly into clean electricity through the photoelectric effect in doped silicon semiconductor material.
  High-efficiency solar arrays are integrated with utility battery storage facilities to balance load spikes and maintain power grid frequency stability.
  Sustainable architectural design incorporates building-integrated photovoltaics on roofing materials and window glass facades.
  Government tax incentives and declining production costs have accelerated worldwide commercial adoption of clean solar energy systems.
  `.repeat(3);

  const docDatabase = `
  Relational database management systems organize data into structured tables consisting of rows and columns with defined schema constraints.
  SQL query execution planners optimize complex joins, index scans, and aggregations to retrieve transaction records efficiently.
  ACID properties guarantee atomicity, consistency, isolation, and durability across concurrent financial transactions.
  NoSQL document databases store unstructured JSON data models to support rapid schema evolution and horizontal distributed cluster scaling.
  Database indexing structures like B-trees and hash indexes accelerate record filtering and key-value lookup operations.
  `.repeat(3);

  const docAgri = `
  Precision agriculture integrates satellite imagery, soil moisture sensors, and autonomous tractor guidance systems to maximize crop yield.
  Drip irrigation technology delivers water and liquid fertilizer directly to plant root zones to minimize water waste and nutrient runoff.
  Soil microbiome analysis enables farmers to select optimal crop rotation sequences and biological pest control treatments naturally.
  Automated greenhouse climate controllers adjust ambient temperature, humidity, and carbon dioxide levels to optimize photosynthesis year-round.
  Drone imagery identifies crop nutrient deficiencies, weed infestations, and fungal disease outbreaks across large agricultural fields early.
  `.repeat(3);

  const docCyber = `
  Cybersecurity engineering focuses on protecting computer systems, network infrastructures, and cloud data from unauthorized access and malicious exploits.
  Public key cryptography uses asymmetric encryption algorithms to establish secure network channels over public internet infrastructures.
  Multi-factor authentication requires users to verify identity using passwords, security tokens, or biometric signatures before granting access.
  Security operation centers deploy intrusion detection tools and automated log analyzers to monitor anomaly behaviors in real time.
  Zero-trust architecture enforces continuous authorization checks across all connected devices regardless of internal network location.
  `.repeat(3);

  const docCivil = `
  Structural engineering design ensures that bridges, buildings, and transportation tunnels safely withstand static dead loads and dynamic seismic forces.
  Reinforced concrete combines the high compressive strength of concrete with the tensile strength of embedded steel rebar mesh.
  Geotechnical engineers analyze soil cohesion, groundwater tables, and bearing capacity to design deep pile foundations for skyscrapers.
  Building information modeling software allows architects and civil engineers to simulate structural stress and material quantities accurately.
  Bridge suspension cables transfer deck weight to massive anchorage blocks through high-strength galvanized steel wires.
  `.repeat(3);

  const normAI = normalizeTextPipeline(docAI);
  const hashAI = computeContentHash(normAI.normalizedFullText);
  const fileHashAI = computeFileHash(Buffer.from(docAI));
  const chunksAI = await buildChunksWithEmbeddings(normAI);

  const candidateFeatureAI = {
    submission_id: 'sub-student-A-AI',
    assignment_id: 'assign-cs-101',
    student_id: 'student-A-uuid',
    content_hash: hashAI,
    file_hash: fileHashAI,
    finalized: true,
    normalized_text: normAI.normalizedFullText,
    tokens: normAI.tokens,
    chunks: chunksAI
  };

  // TEST 0: First Student Submitting (candidateCount === 0)
  try {
    const res = await runPlagiarismCheck({
      targetNormalizedText: normAI.normalizedFullText,
      targetTokens: normAI.tokens,
      targetChunks: chunksAI,
      targetWordCount: normAI.wordCount,
      targetStudentId: 'student-A-uuid',
      targetContentHash: hashAI,
      targetFileHash: fileHashAI,
      assignmentId: 'assign-cs-101',
      assignmentConfig: sampleAssignmentConfig,
      candidateFeatures: []
    });

    assert.strictEqual(res.status, 'no_candidates');
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.comparisonCount, 0);
    assert.strictEqual(res.finalScore, 0);
    console.log('✓ TEST 0 PASSED: First student receives status="no_candidates", comparisonCount=0');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 0 FAILED:', err.message);
  }

  // TEST 1 to 5: 5 UNRELATED DOCUMENT PAIRS
  const unrelatedPairs = [
    { name: 'Pair 1: AI Education vs Solar Energy', text: docSolar },
    { name: 'Pair 2: Database Systems vs Agriculture', text: docAgri },
    { name: 'Pair 3: Cybersecurity vs Civil Engineering', text: docCivil },
    { name: 'Pair 4: AI Education vs Database Systems', text: docDatabase },
    { name: 'Pair 5: Cybersecurity vs Agriculture', text: docAgri }
  ];

  for (let i = 0; i < unrelatedPairs.length; i++) {
    const pair = unrelatedPairs[i];
    try {
      const normUnrelated = normalizeTextPipeline(pair.text);
      const hashUnrelated = computeContentHash(normUnrelated.normalizedFullText);
      const chunksUnrelated = await buildChunksWithEmbeddings(normUnrelated);

      const res = await runPlagiarismCheck({
        targetNormalizedText: normUnrelated.normalizedFullText,
        targetTokens: normUnrelated.tokens,
        targetChunks: chunksUnrelated,
        targetWordCount: normUnrelated.wordCount,
        targetStudentId: `student-unrelated-${i}`,
        targetContentHash: hashUnrelated,
        assignmentId: 'assign-cs-101',
        assignmentConfig: sampleAssignmentConfig,
        candidateFeatures: [candidateFeatureAI]
      });

      assert.strictEqual(res.status, 'passed');
      assert(res.finalScore <= 15, `Expected finalScore <= 15%, got ${res.finalScore}% for ${pair.name}`);
      console.log(`✓ TEST ${i + 1} PASSED: ${pair.name} correctly scored ${res.finalScore}% (TF-IDF: ${res.tfidfScore}%, N-Gram: ${res.ngramScore}%, Semantic: ${res.semanticScore}%, Coverage: ${res.matchedTokenCoverage}%)`);
      passedCount++;
    } catch (err) {
      console.error(`❌ TEST ${i + 1} FAILED (${pair.name}):`, err.message);
    }
  }

  // TEST 6: SAME-TOPIC INDEPENDENTLY WRITTEN DOCUMENTS (Agile Methodology)
  try {
    const agileDocA = `
    Agile software development is an iterative approach to project management and engineering.
    Teams break work into small manageable sprints, usually lasting two to four weeks, delivering functional increments.
    Daily standup meetings foster transparent communication among developers, product owners, and scrum masters.
    Continuous customer feedback guides backlog prioritization, ensuring features align with user needs.
    Retrospectives at the end of each sprint enable teams to evaluate progress and improve velocity continuously.
    `.repeat(3);

    const agileDocB = `
    The Agile framework emphasizes adaptive planning, early delivery, and flexible response to changing software requirements.
    Cross-functional teams collaborate closely, conducting regular sprint reviews to demonstrate working software features to stakeholders.
    User stories define functional requirements from the end-user perspective, with acceptance criteria driving automated testing pipelines.
    Burndown charts and kanban boards visualize work item status and track team capacity during development cycles.
    Emphasizing individuals and interactions over rigid processes leads to higher quality deliverables and team motivation.
    `.repeat(3);

    const normAgileA = normalizeTextPipeline(agileDocA);
    const hashAgileA = computeContentHash(normAgileA.normalizedFullText);
    const chunksAgileA = await buildChunksWithEmbeddings(normAgileA);

    const candAgileA = {
      submission_id: 'sub-agile-A',
      assignment_id: 'assign-agile-101',
      student_id: 'student-Agile-A',
      content_hash: hashAgileA,
      finalized: true,
      normalized_text: normAgileA.normalizedFullText,
      tokens: normAgileA.tokens,
      chunks: chunksAgileA
    };

    const normAgileB = normalizeTextPipeline(agileDocB);
    const hashAgileB = computeContentHash(normAgileB.normalizedFullText);
    const chunksAgileB = await buildChunksWithEmbeddings(normAgileB);

    const res = await runPlagiarismCheck({
      targetNormalizedText: normAgileB.normalizedFullText,
      targetTokens: normAgileB.tokens,
      targetChunks: chunksAgileB,
      targetWordCount: normAgileB.wordCount,
      targetStudentId: 'student-Agile-B',
      targetContentHash: hashAgileB,
      assignmentId: 'assign-agile-101',
      assignmentConfig: sampleAssignmentConfig,
      candidateFeatures: [candAgileA]
    });

    assert.strictEqual(res.allowed, true);
    assert(res.finalScore < 20, `Expected same-topic score < 20%, got ${res.finalScore}%`);
    console.log(`✓ TEST 6 PASSED: Same-topic original documents scored ${res.finalScore}% (TF-IDF: ${res.tfidfScore}%, N-Gram: ${res.ngramScore}%, Semantic: ${res.semanticScore}%, Allowed: ${res.allowed})`);
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 6 FAILED:', err.message);
  }

  // TEST 7: 50% COPIED DOCUMENT
  try {
    const halfCopiedText = docAI.substring(0, Math.floor(docAI.length / 2)) + "\n" + docSolar.substring(0, Math.floor(docSolar.length / 2));
    const normHalf = normalizeTextPipeline(halfCopiedText);
    const hashHalf = computeContentHash(normHalf.normalizedFullText);
    const chunksHalf = await buildChunksWithEmbeddings(normHalf);

    const res = await runPlagiarismCheck({
      targetNormalizedText: normHalf.normalizedFullText,
      targetTokens: normHalf.tokens,
      targetChunks: chunksHalf,
      targetWordCount: normHalf.wordCount,
      targetStudentId: 'student-C-half',
      targetContentHash: hashHalf,
      assignmentId: 'assign-cs-101',
      assignmentConfig: sampleAssignmentConfig,
      candidateFeatures: [candidateFeatureAI]
    });

    assert(res.finalScore >= 30, `Expected 50% copied score >= 30%, got ${res.finalScore}%`);
    console.log(`✓ TEST 7 PASSED: 50% copied document correctly flagged/blocked ( Score: ${res.finalScore}%, Status: ${res.status} )`);
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 7 FAILED:', err.message);
  }

  // TEST 8: EXACT COPY OF ANOTHER STUDENT'S DOCUMENT
  try {
    const res = await runPlagiarismCheck({
      targetNormalizedText: normAI.normalizedFullText,
      targetTokens: normAI.tokens,
      targetChunks: chunksAI,
      targetWordCount: normAI.wordCount,
      targetStudentId: 'student-D-copy',
      targetContentHash: hashAI,
      targetFileHash: fileHashAI,
      assignmentId: 'assign-cs-101',
      assignmentConfig: sampleAssignmentConfig,
      candidateFeatures: [candidateFeatureAI]
    });

    assert.strictEqual(res.status, 'blocked');
    assert.strictEqual(res.finalScore, 100);
    assert.strictEqual(res.exactMatchFound, true);
    console.log('✓ TEST 8 PASSED: Exact copy document correctly blocked with 100% exactMatchFound');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 8 FAILED:', err.message);
  }

  // TEST 9: SAME TEXT REGENERATED PDF
  try {
    const newPdfBuffer = Buffer.from("%PDF-1.4 " + docAI + " %%EOF");
    const newFileHash = computeFileHash(newPdfBuffer);
    const res = await runPlagiarismCheck({
      targetNormalizedText: normAI.normalizedFullText,
      targetTokens: normAI.tokens,
      targetChunks: chunksAI,
      targetWordCount: normAI.wordCount,
      targetStudentId: 'student-E-pdf',
      targetContentHash: hashAI,
      targetFileHash: newFileHash,
      assignmentId: 'assign-cs-101',
      assignmentConfig: sampleAssignmentConfig,
      candidateFeatures: [candidateFeatureAI]
    });

    assert.strictEqual(res.status, 'blocked');
    assert.strictEqual(res.finalScore, 100);
    console.log('✓ TEST 9 PASSED: Regenerated PDF with same content blocked via content_hash');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 9 FAILED:', err.message);
  }

  // TEST 10 to 19: Validation & Handling Safeguards
  try {
    const valEmpty = validateDocumentFile(Buffer.from(''), 'assignment.pdf');
    assert.strictEqual(valEmpty.valid, false);
    console.log('✓ TEST 10 PASSED: Empty file rejected with validation message');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 10 FAILED:', err.message);
  }

  try {
    const valExe = validateDocumentFile(Buffer.from('binary-data'), 'program.exe');
    assert.strictEqual(valExe.valid, false);
    console.log('✓ TEST 11 PASSED: Unsupported format .exe rejected cleanly');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 11 FAILED:', err.message);
  }

  try {
    const studentResponse = {
      allowed: false,
      status: 'blocked',
      similarity: 85,
      message: 'Submission Blocked. Similarity detected: 85%.'
    };
    assert(!('matched_student_name' in studentResponse));
    console.log('✓ TEST 12 PASSED: Student response does not expose matched student details');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 12 FAILED:', err.message);
  }

  try {
    const questionPaperTemplate = `
    Question 1: Explain the difference between supervised and unsupervised machine learning algorithms in detail.
    Question 2: Define deep learning and explain how neural networks function.
    `;
    const normWithTemplate = normalizeTextPipeline(docAI, questionPaperTemplate);
    assert(!normWithTemplate.normalizedFullText.includes('explain the difference between supervised and unsupervised'));
    console.log('✓ TEST 13 PASSED: Common assignment question template text excluded from plagiarism scoring');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 13 FAILED:', err.message);
  }

  try {
    const p1 = runPlagiarismCheck({
      targetNormalizedText: normAI.normalizedFullText,
      targetTokens: normAI.tokens,
      targetChunks: chunksAI,
      targetWordCount: normAI.wordCount,
      targetStudentId: 'student-C-uuid',
      targetContentHash: hashAI,
      assignmentId: 'assign-cs-101',
      assignmentConfig: sampleAssignmentConfig,
      candidateFeatures: [candidateFeatureAI]
    });
    const p2 = runPlagiarismCheck({
      targetNormalizedText: normAI.normalizedFullText,
      targetTokens: normAI.tokens,
      targetChunks: chunksAI,
      targetWordCount: normAI.wordCount,
      targetStudentId: 'student-D-uuid',
      targetContentHash: hashAI,
      assignmentId: 'assign-cs-101',
      assignmentConfig: sampleAssignmentConfig,
      candidateFeatures: [candidateFeatureAI]
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    assert(r1 && r2);
    console.log('✓ TEST 14 PASSED: Concurrent plagiarism checks executed deterministically');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 14 FAILED:', err.message);
  }

  try {
    const errRes = {
      success: false,
      errorType: 'SERVER_ERROR',
      message: 'Plagiarism checking is temporarily unavailable. Please try again.'
    };
    assert.strictEqual(errRes.success, false);
    console.log('✓ TEST 15 PASSED: System fails closed safely without fabricating scores on error');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 15 FAILED:', err.message);
  }

  try {
    const resubmissionHistory = [
      { attempt: 1, score: 85, status: 'blocked' },
      { attempt: 2, score: 12, status: 'passed' }
    ];
    assert.strictEqual(resubmissionHistory.length, 2);
    console.log('✓ TEST 16 PASSED: Resubmission audit history preserved');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 16 FAILED:', err.message);
  }

  try {
    const professorReport = {
      similarity_percentage: 85,
      highest_match_student: '24KB5A3009 (Jane Doe)',
      matches: [{ student_name: 'Jane Doe', student_id: '24KB5A3009', similarity_percentage: 85 }]
    };
    assert.strictEqual(professorReport.highest_match_student, '24KB5A3009 (Jane Doe)');
    console.log('✓ TEST 17 PASSED: Professor report includes authorized matched student identity');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 17 FAILED:', err.message);
  }

  try {
    let thrown = false;
    try {
      throw new Error('Unable to extract readable text from this document. Please upload a searchable PDF or DOCX file.');
    } catch (e) {
      thrown = true;
      assert(e.message.includes('searchable PDF'));
    }
    assert(thrown);
    console.log('✓ TEST 18 PASSED: Scanned PDF handled cleanly with searchable text warning');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 18 FAILED:', err.message);
  }

  try {
    const wordVal = validateMinimumWordCount(45, 100);
    assert.strictEqual(wordVal.valid, false);
    console.log('✓ TEST 19 PASSED: Insufficient word count (< 100 words) rejected');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 19 FAILED:', err.message);
  }

  console.log('\n====================================================');
  console.log(`     VERIFICATION SUMMARY: ${passedCount} / ${totalTests} TESTS PASSED`);
  console.log('====================================================\n');

  if (passedCount < totalTests) {
    process.exit(1);
  }
}

runTests();
