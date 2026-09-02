let pipeline = null;
let featureExtractor = null;

// Lazy load @xenova/transformers if available, else fallback to high-quality local feature embedding
async function getFeatureExtractor() {
  if (featureExtractor !== null) return featureExtractor;
  try {
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    // Load lightweight ONNX MiniLM model
    featureExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    return featureExtractor;
  } catch (err) {
    console.warn('Local transformer pipeline fallback enabled (ONNX model loading skipped or package initializing):', err.message);
    featureExtractor = false;
    return false;
  }
}

/**
 * Generate 384-dimensional vector embedding for text chunk.
 * Uses @xenova/transformers MiniLM if ready, or high-dimensional TF-IDF character/word n-gram vector fallback.
 */
export async function generateChunkEmbedding(text, tokens) {
  const extractor = await getFeatureExtractor();
  if (extractor && typeof extractor === 'function') {
    try {
      const output = await extractor(text.substring(0, 1000), { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (e) {
      console.warn('Extractor inference warning, fallback to vector generation:', e.message);
    }
  }

  // Fallback high-dimensional dense vector representation (384 dimensions)
  // Deterministic hashing of word n-grams into normalized unit vector
  const dims = 384;
  const vec = new Float64Array(dims);
  if (!tokens || tokens.length === 0) return Array.from(vec);

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    let hash = 5381;
    for (let c = 0; c < word.length; c++) {
      hash = ((hash << 5) + hash) + word.charCodeAt(c);
    }
    const idx = Math.abs(hash) % dims;
    vec[idx] += 1;

    // 2-gram feature hashing
    if (i < tokens.length - 1) {
      const bigram = word + '_' + tokens[i + 1];
      let bHash = 5381;
      for (let c = 0; c < bigram.length; c++) {
        bHash = ((bHash << 5) + bHash) + bigram.charCodeAt(c);
      }
      const bIdx = Math.abs(bHash) % dims;
      vec[bIdx] += 1.5;
    }
  }

  // L2 Normalize vector
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
 * ALGORITHM A: TF-IDF + Cosine Similarity
 * Computes exact TF-IDF vectors across the corpus of target doc + comparison docs for same assignment.
 */
export function computeTfidfCosineSimilarity(targetTokens, targetDocId, candidateDocs) {
  if (!targetTokens || targetTokens.length === 0 || !candidateDocs || candidateDocs.length === 0) {
    return { overallTfidfScore: 0, scoresMap: new Map() };
  }

  // All documents in corpus
  const allDocs = [
    { id: targetDocId, tokens: targetTokens },
    ...candidateDocs.map(c => ({ id: c.submission_id || c.id, tokens: c.tokens || [] }))
  ];

  const N = allDocs.length;
  const docFreqMap = new Map();
  const docTermFreqs = new Map();

  // Compute Term Frequencies and Document Frequencies
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

  // Compute IDF
  const idfMap = new Map();
  for (const [term, df] of docFreqMap.entries()) {
    // Smoothed IDF formula
    const idf = Math.log(1 + (N / df));
    idfMap.set(term, idf);
  }

  // Compute TF-IDF vectors
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
    const cosine = (targetMag > 0 && candMag > 0) ? (dot / (targetMag * candMag)) : 0;
    const scorePct = Math.round(Math.max(0, Math.min(100, cosine * 100)));

    console.log(`[TFIDF DEBUG] candId: ${candId} | targetTokens: ${targetTokens.length} | candTokens: ${(cand.tokens||[]).length} | targetMag: ${targetMag} | candMag: ${candMag} | dot: ${dot} | cosine: ${cosine} | scorePct: ${scorePct}`);

    scoresMap.set(candId, scorePct);
    if (scorePct > maxTfidfScore) maxTfidfScore = scorePct;
  }

  return { overallTfidfScore: maxTfidfScore, scoresMap };
}

/**
 * ALGORITHM B: Word N-Gram Jaccard Similarity (4-grams default)
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
  const scorePct = Math.round(Math.max(0, Math.min(100, jaccard * 100)) * 10) / 10;

  return { score: scorePct, matchedNGrams };
}

/**
 * ALGORITHM C & PARAGRAPH OVERRIDE: Chunk / Paragraph Vector & Phrase Matching
 */
export async function compareChunksSemanticAndNgram(targetChunks, candidateChunks, candidateDocId) {
  let maxSemanticChunkScore = 0;
  let maxNGramChunkScore = 0;
  const chunkMatches = [];

  for (let i = 0; i < targetChunks.length; i++) {
    const tChunk = targetChunks[i];
    const tTokens = tChunk.tokens || (tChunk.normalizedText || tChunk.rawText || '').toLowerCase().split(/\s+/).filter(Boolean);
    const tEmb = tChunk.embedding || [];

    for (let j = 0; j < candidateChunks.length; j++) {
      const cChunk = candidateChunks[j];
      const cTokens = cChunk.tokens || (cChunk.normalizedText || cChunk.rawText || '').toLowerCase().split(/\s+/).filter(Boolean);
      const cEmb = cChunk.embedding || [];

      // Semantic Cosine between chunk embeddings
      const semCos = calculateVectorCosine(tEmb, cEmb);
      const semPct = Math.round(semCos * 100);

      // Paragraph n-gram Jaccard
      const nGramRes = computeNGramSimilarity(tTokens, cTokens, 3);
      const nGramPct = nGramRes.score;

      const combinedChunkScore = Math.round((semPct * 0.5) + (nGramPct * 0.5));

      if (semPct > maxSemanticChunkScore) maxSemanticChunkScore = semPct;
      if (nGramPct > maxNGramChunkScore) maxNGramChunkScore = nGramPct;

      const wordCount = tChunk.wordCount || tTokens.length;

      // Strong chunk match criteria
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

  chunkMatches.sort((a, b) => b.similarity_score - a.similarity_score);

  return {
    maxSemanticChunkScore,
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
  assignmentId,
  assignmentConfig,
  candidateFeatures // Array of pre-extracted document features from submission_document_features
}) {
  const reviewThreshold = Number(assignmentConfig.plagiarism_review_threshold ?? 20);
  const blockThreshold = Number(assignmentConfig.plagiarism_block_threshold ?? 30);
  const isEnabled = assignmentConfig.plagiarism_enabled ?? true;

  if (!isEnabled) {
    return {
      status: 'passed',
      finalScore: 0,
      tfidfScore: 0,
      ngramScore: 0,
      semanticScore: 0,
      wordCount: targetWordCount,
      highestMatchSubmissionId: null,
      highestMatchStudentId: null,
      matches: [],
      candidateMatches: []
    };
  }

  // Filter candidates: SAME assignment, EXCLUDE target student's own submissions
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
      tokens: tokens || []
    };
  }).filter(cand => {
    if (cand.assignment_id !== assignmentId) return false;
    if (cand.student_id === targetStudentId) return false; // Exclude self
    return true;
  });

  if (validCandidates.length === 0) {
    return {
      status: 'passed',
      finalScore: 0,
      tfidfScore: 0,
      ngramScore: 0,
      semanticScore: 0,
      wordCount: targetWordCount,
      highestMatchSubmissionId: null,
      highestMatchStudentId: null,
      matches: [],
      candidateMatches: []
    };
  }

  // 1. TF-IDF Cosine Similarity across corpus
  const tfidfResult = computeTfidfCosineSimilarity(targetTokens, 'TARGET_SUBMISSION', validCandidates);

  let highestFinalScore = 0;
  let highestTfidfScore = 0;
  let highestNgramScore = 0;
  let highestSemanticScore = 0;
  let highestMatchSubmissionId = null;
  let highestMatchStudentId = null;
  const allStoredMatches = [];
  const candidateMatchesSummary = [];

  // 2. Compare target against each candidate document
  for (const candidate of validCandidates) {
    const candId = candidate.submission_id || candidate.id;
    const candTfidfScore = tfidfResult.scoresMap.get(candId) || 0;

    // N-gram Similarity (4-grams)
    const ngramRes = computeNGramSimilarity(targetTokens, candidate.tokens, 4);

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
    
    const candNgramScore = Math.max(ngramRes.score, chunkRes.maxNGramChunkScore);
    const candSemanticScore = chunkRes.maxSemanticChunkScore;

    // Formula: (tfidf × 0.25) + (ngram × 0.35) + (semantic × 0.40)
    let candidateFinalScore = (candTfidfScore * 0.25) + (candNgramScore * 0.35) + (candSemanticScore * 0.40);

    // High phrase or semantic overlap override
    if (candNgramScore >= 60 || candSemanticScore >= 60) {
      candidateFinalScore = Math.max(candidateFinalScore, candNgramScore, candSemanticScore);
    }

    // Paragraph-Level Copying Override:
    if (chunkRes.strongMatches.length > 0) {
      const topParagraphScore = chunkRes.strongMatches[0].similarity_score;
      if (topParagraphScore >= 75) {
        candidateFinalScore = Math.max(candidateFinalScore, topParagraphScore * 0.90);
      }
    }

    candidateFinalScore = Math.round(Math.max(0, Math.min(100, candidateFinalScore)) * 10) / 10;

    if (candidateFinalScore > 0) {
      candidateMatchesSummary.push({
        matching_submission_id: candidate.submission_id,
        matching_student_id: candidate.student_id,
        similarity_percentage: candidateFinalScore,
        tfidf_score: candTfidfScore,
        ngram_score: candNgramScore,
        semantic_score: candSemanticScore,
        strong_matches_count: chunkRes.strongMatches.length,
        top_match_preview: chunkRes.strongMatches[0]?.source_text?.substring(0, 300) || targetNormalizedText.substring(0, 300)
      });
    }

    if (chunkRes.strongMatches.length > 0) {
      allStoredMatches.push(...chunkRes.strongMatches);
    }

    if (candidateFinalScore > highestFinalScore) {
      highestFinalScore = candidateFinalScore;
      highestTfidfScore = candTfidfScore;
      highestNgramScore = candNgramScore;
      highestSemanticScore = candSemanticScore;
      highestMatchSubmissionId = candidate.submission_id;
      highestMatchStudentId = candidate.student_id;
    }
  }

  // Sort candidates by similarity
  candidateMatchesSummary.sort((a, b) => b.similarity_percentage - a.similarity_percentage);
  allStoredMatches.sort((a, b) => b.similarity_score - a.similarity_score);

  // Decision Threshold Logic:
  // 0 - reviewThreshold %: PASS
  // reviewThreshold - blockThreshold %: FLAG
  // >= blockThreshold %: BLOCK
  let decisionStatus = 'passed';
  if (highestFinalScore >= blockThreshold) {
    decisionStatus = 'blocked';
  } else if (highestFinalScore >= reviewThreshold) {
    decisionStatus = 'flagged';
  }

  return {
    status: decisionStatus,
    finalScore: highestFinalScore,
    tfidfScore: highestTfidfScore,
    ngramScore: highestNgramScore,
    semanticScore: highestSemanticScore,
    wordCount: targetWordCount,
    highestMatchSubmissionId,
    highestMatchStudentId,
    matches: allStoredMatches.slice(0, 20), // Top 20 paragraph matches
    candidateMatches: candidateMatchesSummary
  };
}
