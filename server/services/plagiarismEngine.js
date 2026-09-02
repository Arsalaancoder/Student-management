let pipeline = null;
let featureExtractor = null;

// Lazy load @xenova/transformers if available
async function getFeatureExtractor() {
  if (featureExtractor !== null) return featureExtractor;
  try {
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    featureExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    return featureExtractor;
  } catch (err) {
    featureExtractor = false;
    return false;
  }
}

/**
 * Common English stop words and generic academic terminology to exclude from feature hashing & coverage calculations
 */
const STOP_WORDS = new Set([
  'a','about','above','after','again','against','all','am','an','and','any','are','aren\'t','as','at',
  'be','because','been','before','being','below','between','both','but','by','can','can\'t','cannot',
  'could','couldn\'t','did','didn\'t','do','does','doesn\'t','doing','don\'t','down','during','each',
  'few','for','from','further','had','hadn\'t','has','hasn\'t','have','haven\'t','having','he','he\'d',
  'he\'ll','he\'s','her','here','here\'s','hers','herself','him','himself','his','how','how\'s','i',
  'i\'d','i\'ll','i\'m','i\'ve','if','in','into','is','isn\'t','it','it\'s','its','itself','let\'s',
  'me','more','most','mustn\'t','my','myself','no','nor','not','of','off','on','once','only','or',
  'other','ought','our','ours','ourselves','out','over','own','same','shan\'t','she','she\'d','she\'ll',
  'she\'s','should','shouldn\'t','so','some','such','than','that','that\'s','the','their','theirs',
  'them','themselves','then','there','there\'s','these','they','they\'d','they\'ll','they\'re','they\'ve',
  'this','those','through','to','too','under','until','up','very','was','wasn\'t','we','we\'d','we\'ll',
  'we\'re','we\'ve','were','weren\'t','what','what\'s','when','when\'s','where','where\'s','which',
  'while','who','who\'s','whom','why','why\'s','with','won\'t','would','wouldn\'t','you','you\'d',
  'you\'ll','you\'re','you\'ve','your','yours','yourself','yourselves',
  'figure','table','chapter','section','paper','report','study','result','analysis','introduction','conclusion'
]);

/**
 * Generate 384-dimensional vector embedding for text chunk.
 */
export async function generateChunkEmbedding(text, tokens) {
  const extractor = await getFeatureExtractor();
  if (extractor && typeof extractor === 'function') {
    try {
      const output = await extractor(text.substring(0, 1000), { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (e) {
      // Fallback to local vector generation
    }
  }

  // Fallback high-dimensional dense vector representation (384 dimensions)
  // Exclude stop words to avoid false baseline similarity between unrelated texts
  const dims = 384;
  const vec = new Float64Array(dims);
  if (!tokens || tokens.length === 0) return Array.from(vec);

  const filteredTokens = tokens.filter(w => w.length > 2 && !STOP_WORDS.has(w));
  if (filteredTokens.length === 0) return Array.from(vec);

  for (let i = 0; i < filteredTokens.length; i++) {
    const word = filteredTokens[i];
    let hash = 5381;
    for (let c = 0; c < word.length; c++) {
      hash = ((hash << 5) + hash) + word.charCodeAt(c);
    }
    const idx = Math.abs(hash) % dims;
    vec[idx] += 1;

    if (i < filteredTokens.length - 1) {
      const bigram = word + '_' + filteredTokens[i + 1];
      let bHash = 5381;
      for (let c = 0; c < bigram.length; c++) {
        bHash = ((bHash << 5) + bHash) + bigram.charCodeAt(c);
      }
      const bIdx = Math.abs(bHash) % dims;
      vec[bIdx] += 1.5;
    }
  }

  let sumSq = 0;
  for (let i = 0; i < dims; i++) sumSq += vec[i] * vec[i];
  const mag = Math.sqrt(sumSq);
  if (mag > 0) {
    for (let i = 0; i < dims; i++) vec[i] /= mag;
  }
  return Array.from(vec);
}

/**
 * Cosine similarity between two numerical arrays/vectors
 */
export function calculateVectorCosine(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return Math.max(0, Math.min(1, dot / (Math.sqrt(magA) * Math.sqrt(magB))));
}

/**
 * ALGORITHM A: TF-IDF + Cosine Similarity (returns percentage 0..100)
 */
export function computeTfidfCosineSimilarity(targetTokens, targetDocId, candidateDocs) {
  if (!targetTokens || targetTokens.length === 0 || !candidateDocs || candidateDocs.length === 0) {
    return { overallTfidfScore: 0, scoresMap: new Map() };
  }

  const allDocs = [
    { id: targetDocId, tokens: targetTokens },
    ...candidateDocs.map(c => ({ id: c.submission_id || c.id, tokens: c.tokens || [] }))
  ];

  const N = allDocs.length;
  const docFreqMap = new Map();
  const docTermFreqs = new Map();

  for (const doc of allDocs) {
    const tf = new Map();
    const uniqueTerms = new Set();
    for (const term of doc.tokens) {
      tf.set(term, (tf.get(term) || 0) + 1);
      uniqueTerms.add(term);
    }
    docTermFreqs.set(doc.id, tf);
    for (const term of uniqueTerms) {
      docFreqMap.set(term, (docFreqMap.get(term) || 0) + 1);
    }
  }

  const idfMap = new Map();
  for (const [term, df] of docFreqMap.entries()) {
    const idf = Math.log(1 + (N / df));
    idfMap.set(term, idf);
  }

  function getVector(docId, docTokens) {
    const tf = docTermFreqs.get(docId) || new Map();
    const totalWords = docTokens.length || 1;
    const vec = new Map();
    for (const [term, count] of tf.entries()) {
      const tfVal = count / totalWords;
      const idfVal = idfMap.get(term) || 1;
      vec.set(term, tfVal * idfVal);
    }
    return vec;
  }

  const targetVec = getVector(targetDocId, targetTokens);
  let targetMagSq = 0;
  for (const val of targetVec.values()) targetMagSq += val * val;
  const targetMag = Math.sqrt(targetMagSq);

  const scoresMap = new Map();
  let maxTfidfScore = 0;

  for (const cand of candidateDocs) {
    const candId = cand.submission_id || cand.id;
    const candVec = getVector(candId, cand.tokens || []);
    let dot = 0;
    let candMagSq = 0;
    for (const [term, candVal] of candVec.entries()) {
      candMagSq += candVal * candVal;
      if (targetVec.has(term)) {
        dot += targetVec.get(term) * candVal;
      }
    }
    const candMag = Math.sqrt(candMagSq);
    const cosine = (targetMag > 0 && candMag > 0) ? Math.max(0, Math.min(1, dot / (targetMag * candMag))) : 0;
    const scorePct = Math.round(cosine * 100);

    scoresMap.set(candId, scorePct);
    if (scorePct > maxTfidfScore) maxTfidfScore = scorePct;
  }

  return { overallTfidfScore: maxTfidfScore, scoresMap };
}

/**
 * ALGORITHM B: Word N-Gram Jaccard Similarity (4-grams default, percentage 0..100)
 */
export function computeNGramSimilarity(targetTokens, candidateTokens, n = 4) {
  function getNGramSet(tokens) {
    const set = new Set();
    if (!tokens || tokens.length < n) return set;
    for (let i = 0; i <= tokens.length - n; i++) {
      set.add(tokens.slice(i, i + n).join(' '));
    }
    return set;
  }

  const setA = getNGramSet(targetTokens);
  const setB = getNGramSet(candidateTokens);

  if (setA.size === 0 || setB.size === 0) return { score: 0, matchedNGrams: [] };

  let intersectionCount = 0;
  const matchedNGrams = [];
  for (const gram of setA) {
    if (setB.has(gram)) {
      intersectionCount++;
      if (matchedNGrams.length < 10) matchedNGrams.push(gram);
    }
  }

  const unionSize = setA.size + setB.size - intersectionCount;
  const jaccard = unionSize > 0 ? (intersectionCount / unionSize) : 0;
  const scorePct = Math.round(Math.max(0, Math.min(1, jaccard)) * 100);

  return { score: scorePct, matchedNGrams };
}

/**
 * COVERAGE FACTOR: Compute fraction of significant target tokens present in candidate document
 */
export function computeMatchedTokenCoverage(targetTokens, candidateTokens) {
  if (!targetTokens || targetTokens.length === 0 || !candidateTokens || candidateTokens.length === 0) {
    return { coverageRatio: 0, matchedCount: 0, totalCount: 0 };
  }
  const sigTarget = targetTokens.filter(t => t.length > 2 && !STOP_WORDS.has(t));
  if (sigTarget.length === 0) return { coverageRatio: 0, matchedCount: 0, totalCount: 0 };

  const candSet = new Set(candidateTokens);
  let matchedCount = 0;
  for (const t of sigTarget) {
    if (candSet.has(t)) matchedCount++;
  }
  const coverageRatio = matchedCount / sigTarget.length;
  return { coverageRatio, matchedCount, totalCount: sigTarget.length };
}

/**
 * ALGORITHM C & PARAGRAPH OVERRIDE
 */
export async function compareChunksSemanticAndNgram(targetChunks, candidateChunks, candidateDocId) {
  let maxSemanticChunkScore = 0;
  let maxNGramChunkScore = 0;
  let sumSemanticChunkScore = 0;
  let validChunkComparisons = 0;
  const chunkMatches = [];

  for (let i = 0; i < targetChunks.length; i++) {
    const tChunk = targetChunks[i];
    const tTokens = tChunk.tokens || (tChunk.normalizedText || tChunk.rawText || '').toLowerCase().split(/\s+/).filter(Boolean);
    const tEmb = tChunk.embedding || [];

    for (let j = 0; j < candidateChunks.length; j++) {
      const cChunk = candidateChunks[j];
      const cTokens = cChunk.tokens || (cChunk.normalizedText || cChunk.rawText || '').toLowerCase().split(/\s+/).filter(Boolean);
      const cEmb = cChunk.embedding || [];

      // Semantic Cosine between chunk embeddings (0..1)
      const semCos = calculateVectorCosine(tEmb, cEmb);
      const semPct = Math.round(semCos * 100);

      // Paragraph 4-gram Jaccard (0..100)
      const nGramRes = computeNGramSimilarity(tTokens, cTokens, 4);
      const nGramPct = nGramRes.score;

      if (semCos > 0.35) {
        sumSemanticChunkScore += semCos;
        validChunkComparisons++;
      }

      if (semCos > maxSemanticChunkScore) maxSemanticChunkScore = semCos;
      if (nGramPct > maxNGramChunkScore) maxNGramChunkScore = nGramPct;

      const combinedChunkScore = Math.round((semPct * 0.5) + (nGramPct * 0.5));
      const wordCount = tChunk.wordCount || tTokens.length;

      if ((combinedChunkScore >= 70 || semPct >= 80 || nGramPct >= 75) && wordCount >= 10) {
        chunkMatches.push({
          matched_submission_id: candidateDocId,
          source_chunk_index: tChunk.index ?? i,
          matched_chunk_index: cChunk.index ?? j,
          source_text: tChunk.rawText || '',
          matched_text: cChunk.rawText || '',
          similarity_score: combinedChunkScore,
          semantic_score: semPct,
          ngram_score: nGramPct,
          match_type: semPct >= 85 ? 'semantic' : nGramPct >= 80 ? 'ngram' : 'combined'
        });
      }
    }
  }

  const meanSemanticChunkScore = validChunkComparisons > 0 ? (sumSemanticChunkScore / validChunkComparisons) : 0;
  chunkMatches.sort((a, b) => b.similarity_score - a.similarity_score);

  return {
    maxSemanticChunkScore,
    meanSemanticChunkScore,
    maxNGramChunkScore,
    strongMatches: chunkMatches
  };
}

/**
 * CORE PLAGIARISM COMPARISON & DECISION ENGINE
 */
export async function runPlagiarismCheck({
  targetNormalizedText,
  targetTokens,
  targetChunks,
  targetWordCount,
  targetStudentId,
  targetContentHash,
  targetFileHash,
  targetSubmissionId,
  targetCheckId,
  assignmentId,
  assignmentConfig,
  candidateFeatures // Array of pre-extracted document features from submission_document_features
}) {
  const reviewThreshold = Number(assignmentConfig.plagiarism_review_threshold ?? 20);
  const blockThreshold = Number(assignmentConfig.plagiarism_block_threshold ?? 30);
  const isEnabled = assignmentConfig.plagiarism_enabled ?? true;

  if (!isEnabled) {
    return {
      success: true,
      allowed: true,
      status: 'passed',
      comparisonCount: 0,
      finalScore: 0,
      tfidfScore: 0,
      ngramScore: 0,
      semanticScore: 0,
      wordCount: targetWordCount,
      highestMatchSubmissionId: null,
      highestMatchStudentId: null,
      matches: [],
      candidateMatches: [],
      message: "Originality check disabled for this assignment."
    };
  }

  // Filter candidates: SAME assignment, EXCLUDE target student's own submissions, EXCLUDE current check/submission
  const validCandidates = (candidateFeatures || []).map(c => {
    let tokens = c.tokens;
    if (!tokens || tokens.length === 0) {
      if (c.normalized_text && typeof c.normalized_text === 'string' && c.normalized_text.trim().length > 0) {
        tokens = c.normalized_text.split(/\s+/).filter(Boolean);
      } else if (c.ngram_features) {
        try {
          tokens = Array.isArray(c.ngram_features) ? c.ngram_features : JSON.parse(c.ngram_features);
        } catch (e) {
          tokens = [];
        }
      }
    }
    return {
      ...c,
      submission_id: c.submission_id || c.id,
      student_id: c.student_id,
      assignment_id: c.assignment_id,
      tokens: tokens || []
    };
  }).filter(cand => {
    if (cand.assignment_id !== assignmentId) return false;
    if (cand.student_id === targetStudentId) return false; // Exclude current student
    if (targetSubmissionId && cand.submission_id === targetSubmissionId) return false;
    if (targetCheckId && cand.plagiarism_check_id === targetCheckId) return false;
    if (cand.finalized === false) return false; // Exclude unfinalized temporary candidate rows
    return true;
  });

  const candidateCount = validCandidates.length;

  // Section O & Section A: FIRST STUDENT LOGIC
  if (candidateCount === 0) {
    return {
      success: true,
      allowed: true,
      status: 'no_candidates',
      comparisonCount: 0,
      candidateCount: 0,
      finalScore: 0,
      tfidfScore: 0,
      ngramScore: 0,
      semanticScore: 0,
      matchedTokenCoverage: 0,
      wordCount: targetWordCount,
      highestMatchSubmissionId: null,
      highestMatchStudentId: null,
      matches: [],
      candidateMatches: [],
      message: 'Originality check passed. No previous submissions were available for comparison.'
    };
  }

  // Section E: EXACT DUPLICATE RULE
  let exactMatchFound = false;
  let exactMatchReason = null;
  let exactMatchedCand = null;

  for (const cand of validCandidates) {
    if (targetContentHash && cand.content_hash && targetContentHash === cand.content_hash) {
      exactMatchFound = true;
      exactMatchReason = 'exact_content_duplicate';
      exactMatchedCand = cand;
      break;
    }
    if (targetFileHash && cand.file_hash && targetFileHash === cand.file_hash) {
      exactMatchFound = true;
      exactMatchReason = 'exact_file_duplicate';
      exactMatchedCand = cand;
      break;
    }
  }

  if (exactMatchFound && exactMatchedCand) {
    return {
      success: true,
      allowed: false,
      status: 'blocked',
      comparisonCount: candidateCount,
      candidateCount: candidateCount,
      finalScore: 100,
      tfidfScore: 100,
      ngramScore: 100,
      semanticScore: 100,
      matchedTokenCoverage: 100,
      wordCount: targetWordCount,
      exactMatchFound: true,
      decisionReason: exactMatchReason,
      highestMatchSubmissionId: exactMatchedCand.submission_id,
      highestMatchStudentId: exactMatchedCand.student_id,
      matches: [],
      candidateMatches: [{
        matching_submission_id: exactMatchedCand.submission_id,
        matching_student_id: exactMatchedCand.student_id,
        similarity_percentage: 100,
        tfidf_score: 100,
        ngram_score: 100,
        semantic_score: 100,
        matched_token_coverage: 100,
        reason: exactMatchReason
      }],
      message: 'Submission Blocked. Similarity detected: 100%. Significant similarity (exact duplicate) was found with an existing submission. Please revise your work and submit again.'
    };
  }

  // 1. TF-IDF Cosine Similarity across corpus (percentages 0..100)
  const tfidfResult = computeTfidfCosineSimilarity(targetTokens, 'TARGET_SUBMISSION', validCandidates);

  let highestFinalScorePct = 0;
  let highestTfidfPct = 0;
  let highestNgramPct = 0;
  let highestSemanticPct = 0;
  let highestCoveragePct = 0;
  let highestMatchSubmissionId = null;
  let highestMatchStudentId = null;
  const allStoredMatches = [];
  const candidateMatchesSummary = [];

  // 2. Compare target against each candidate document
  for (const candidate of validCandidates) {
    const candId = candidate.submission_id || candidate.id;
    const candTfidfPct = tfidfResult.scoresMap.get(candId) || 0; // 0..100
    const candTfidfScore = candTfidfPct / 100; // 0..1

    // N-gram Similarity (4-grams, 0..100)
    const ngramRes = computeNGramSimilarity(targetTokens, candidate.tokens, 4);
    const candNgramPct = ngramRes.score; // 0..100
    const candNgramScore = candNgramPct / 100; // 0..1

    // Coverage Factor (0..1)
    const coverage = computeMatchedTokenCoverage(targetTokens, candidate.tokens);
    const matchedTokenCoverage = coverage.coverageRatio; // 0..1

    // Semantic & Paragraph Chunk Comparisons
    const rawChunks = candidate.chunks || [];
    const rawEmbs = candidate.chunk_embeddings || [];
    let candChunks = rawChunks.map((c, idx) => {
      const embObj = rawEmbs.find(e => e.index === c.index) || rawEmbs[idx] || {};
      return {
        ...c,
        embedding: c.embedding || embObj.embedding || []
      };
    });
    if (candChunks.length === 0 && rawEmbs.length > 0) {
      candChunks = rawEmbs;
    }

    const chunkRes = await compareChunksSemanticAndNgram(targetChunks, candChunks, candId);

    // Document Semantic Similarity (Mean over valid chunk pairs weighted by coverage)
    const candSemanticScore = chunkRes.meanSemanticChunkScore; // 0..1
    const candSemanticPct = Math.round(candSemanticScore * 100);

    // Section 4: LEXICAL EVIDENCE GATING RULE
    // If lexical overlap is very low (ngram < 0.10 and tfidf < 0.15), cap semantic contribution at 0.30
    let effectiveSemantic = candSemanticScore;
    if (candNgramScore < 0.10 && candTfidfScore < 0.15) {
      effectiveSemantic = Math.min(candSemanticScore, 0.30);
    }

    // Section 2 & 3: Standardized Weighted Formula:
    // TF-IDF = 35% (0.35), N-gram = 40% (0.40), Semantic = 25% (0.25)
    let candidateFinalRaw = (candTfidfScore * 0.35) + (candNgramScore * 0.40) + (effectiveSemantic * 0.25);

    // Section 7: Paragraph Copying Override (requires high chunk match AND substantial token coverage)
    if (Array.isArray(chunkRes.strongMatches) && chunkRes.strongMatches.length > 0) {
      const topParagraphPct = chunkRes.strongMatches[0].similarity_score; // 0..100
      if (topParagraphPct >= 80 && matchedTokenCoverage >= 0.30) {
        candidateFinalRaw = Math.max(candidateFinalRaw, (topParagraphPct / 100) * 0.85);
      }
    }

    let candidateFinalScorePct = Math.round(Math.max(0, Math.min(100, candidateFinalRaw * 100)));

    if (candidateFinalScorePct > 0) {
      candidateMatchesSummary.push({
        matching_submission_id: candidate.submission_id,
        matching_student_id: candidate.student_id,
        similarity_percentage: candidateFinalScorePct,
        tfidf_score: candTfidfPct,
        ngram_score: candNgramPct,
        semantic_score: candSemanticPct,
        effective_semantic_score: Math.round(effectiveSemantic * 100),
        matched_token_coverage: Math.round(matchedTokenCoverage * 100),
        highest_chunk_score: Math.round(chunkRes.maxSemanticChunkScore * 100),
        average_chunk_score: Math.round(chunkRes.meanSemanticChunkScore * 100),
        strong_matches_count: chunkRes.strongMatches.length,
        top_match_preview: chunkRes.strongMatches[0]?.source_text?.substring(0, 300) || targetNormalizedText.substring(0, 300)
      });
    }

    if (Array.isArray(chunkRes.strongMatches) && chunkRes.strongMatches.length > 0) {
      allStoredMatches.push(...chunkRes.strongMatches);
    }

    if (candidateFinalScorePct > highestFinalScorePct) {
      highestFinalScorePct = candidateFinalScorePct;
      highestTfidfPct = candTfidfPct;
      highestNgramPct = candNgramPct;
      highestSemanticPct = candSemanticPct;
      highestCoveragePct = Math.round(matchedTokenCoverage * 100);
      highestMatchSubmissionId = candidate.submission_id;
      highestMatchStudentId = candidate.student_id;
    }
  }

  candidateMatchesSummary.sort((a, b) => b.similarity_percentage - a.similarity_percentage);
  allStoredMatches.sort((a, b) => b.similarity_score - a.similarity_score);

  // Decision Threshold Logic:
  // 0 - reviewThreshold %: PASS ('passed')
  // reviewThreshold - blockThreshold %: FLAG ('flagged')
  // >= blockThreshold %: BLOCK ('blocked')
  let decisionStatus = 'passed';
  let isAllowed = true;

  if (highestFinalScorePct >= blockThreshold) {
    decisionStatus = 'blocked';
    isAllowed = false;
  } else if (highestFinalScorePct >= reviewThreshold) {
    decisionStatus = 'flagged';
    isAllowed = true;
  }

  return {
    success: true,
    allowed: isAllowed,
    status: decisionStatus,
    comparisonCount: candidateCount,
    candidateCount: candidateCount,
    finalScore: highestFinalScorePct,
    tfidfScore: highestTfidfPct,
    ngramScore: highestNgramPct,
    semanticScore: highestSemanticPct,
    matchedTokenCoverage: highestCoveragePct,
    wordCount: targetWordCount,
    exactMatchFound: false,
    decisionReason: decisionStatus,
    highestMatchSubmissionId,
    highestMatchStudentId,
    matches: allStoredMatches.slice(0, 20),
    candidateMatches: candidateMatchesSummary
  };
}
