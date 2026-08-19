/**
 * Text Normalization Utility for Plagiarism & Similarity Analysis
 * Standardizes raw text from documents (PDF, DOCX, TXT) before text matching.
 */

export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return text
    // Convert to lowercase
    .toLowerCase()
    // Replace non-breaking spaces and tabs with standard space
    .replace(/[\r\t\f\v]/g, ' ')
    // Replace multiple newlines with single space or newline indicator
    .replace(/\n+/g, ' ')
    // Normalize punctuation (keep alphanumeric characters and single spaces)
    .replace(/[^\w\s]/gi, ' ')
    // Collapse multiple consecutive spaces into a single space
    .replace(/\s+/g, ' ')
    // Trim leading and trailing whitespace
    .trim();
}

/**
 * Tokenize text into words array after normalization
 */
export function tokenizeText(text: string): string[] {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(' ').filter(word => word.length > 0) : [];
}

/**
 * Generate N-grams (contiguous sequences of n words)
 */
export function generateNGrams(tokens: string[], n: number = 3): Set<string> {
  const ngrams = new Set<string>();
  if (tokens.length < n) return ngrams;
  
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}
