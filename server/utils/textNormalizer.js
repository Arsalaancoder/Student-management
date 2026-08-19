/**
 * Text Normalization & Similarity Utility for Server-Side Processing
 */

export function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .toLowerCase()
    .replace(/[\r\t\f\v]/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeText(text) {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(' ').filter(word => word.length > 0) : [];
}

export function generateNGrams(tokens, n = 3) {
  const ngrams = new Set();
  if (!tokens || tokens.length < n) return ngrams;
  
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

export function calculateJaccardSimilarity(setA, setB) {
  if (!setA || !setB || (setA.size === 0 && setB.size === 0)) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Cosine similarity using TF-IDF term frequency vectors
 */
export function calculateCosineSimilarity(textA, textB) {
  const tokensA = tokenizeText(textA);
  const tokensB = tokenizeText(textB);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const freqA = {};
  const freqB = {};
  const allWords = new Set();

  tokensA.forEach(w => {
    freqA[w] = (freqA[w] || 0) + 1;
    allWords.add(w);
  });

  tokensB.forEach(w => {
    freqB[w] = (freqB[w] || 0) + 1;
    allWords.add(w);
  });

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  allWords.forEach(w => {
    const valA = freqA[w] || 0;
    const valB = freqB[w] || 0;
    dotProduct += valA * valB;
    magA += valA * valA;
    magB += valB * valB;
  });

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}
