import { createRequire } from 'module';
import mammoth from 'mammoth';
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * Compute SHA256 file binary hash
 */
export function computeFileHash(buffer) {
  if (!buffer || buffer.length === 0) return '';
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute SHA256 content text hash
 */
export function computeContentHash(normalizedText) {
  if (!normalizedText || typeof normalizedText !== 'string' || normalizedText.trim().length === 0) return '';
  return crypto.createHash('sha256').update(normalizedText.trim()).digest('hex');
}

/**
 * Validate document file attributes before extraction.
 */
export function validateDocumentFile(buffer, fileName, mimeType) {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'The uploaded file is empty.' };
  }

  // 50MB limit
  if (buffer.length > 50 * 1024 * 1024) {
    return { valid: false, error: 'File size exceeds the 50MB limit.' };
  }

  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  const allowedExts = ['pdf', 'docx', 'doc', 'txt'];
  if (!allowedExts.includes(ext)) {
    return { valid: false, error: `Unsupported file format: .${ext}. Please upload a PDF, DOCX, or TXT file.` };
  }

  // Check magic bytes / signatures to prevent extension spoofing
  if (ext === 'pdf') {
    const magic = buffer.toString('ascii', 0, 5);
    if (!magic.startsWith('%PDF-')) {
      return { valid: false, error: 'Corrupted or invalid PDF file structure.' };
    }
  } else if (ext === 'docx') {
    // DOCX files are ZIP archives starting with PK\x03\x04
    const magic = buffer.toString('hex', 0, 4);
    if (magic !== '504b0304') {
      return { valid: false, error: 'Corrupted or invalid DOCX file structure.' };
    }
  }

  return { valid: true };
}

/**
 * Extract raw text from file buffer based on extension and magic bytes.
 */
export async function extractRawText(buffer, fileName) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase();

  try {
    if (ext === 'pdf') {
      let pdfData;
      if (typeof pdfParse === 'function') {
        pdfData = await pdfParse(buffer);
      } else if (pdfParse && typeof pdfParse.PDFParse === 'function') {
        const parser = new pdfParse.PDFParse({ data: buffer });
        const res = await parser.getText();
        pdfData = { text: typeof res === 'string' ? res : (res?.text || '') };
      } else if (pdfParse && typeof pdfParse.default === 'function') {
        pdfData = await pdfParse.default(buffer);
      } else {
        pdfData = { text: buffer.toString('utf-8') };
      }

      const extractedText = (pdfData?.text || '').trim();
      if (!extractedText || extractedText.length < 5) {
        throw new Error('SCANNED_PDF_NO_TEXT');
      }
      return extractedText;

    } else if (ext === 'docx' || ext === 'doc') {
      const result = await mammoth.extractRawText({ buffer });
      const extractedText = (result.value || '').trim();
      if (!extractedText || extractedText.length < 5) {
        throw new Error('EMPTY_DOCX_TEXT');
      }
      return extractedText;

    } else if (ext === 'txt') {
      const text = buffer.toString('utf-8').trim();
      if (!text) throw new Error('EMPTY_TXT_FILE');
      return text;

    } else {
      throw new Error(`Unsupported format .${ext}`);
    }
  } catch (err) {
    if (err.message === 'SCANNED_PDF_NO_TEXT') {
      throw new Error('Unable to extract readable text from this document. Please upload a searchable PDF or DOCX.');
    }
    if (err.message === 'EMPTY_DOCX_TEXT' || err.message === 'EMPTY_TXT_FILE') {
      throw new Error('Unable to extract readable text from this document. The file contains no readable content.');
    }
    console.error('Error during text extraction:', err);
    throw new Error('Unable to extract readable text from this document. Please upload a searchable PDF or DOCX.');
  }
}

/**
 * Normalize extracted text:
 * - Lowercase & Unicode normalization (NFC)
 * - Remove headers/footers & page numbers (e.g. Page 1 of 5, Page 3)
 * - Preserve paragraph and sentence structure for chunking
 */
export function normalizeTextPipeline(rawText, templateText = null) {
  if (!rawText || typeof rawText !== 'string') {
    return { normalizedFullText: '', tokens: [], chunks: [], wordCount: 0 };
  }

  // 1. Unicode normalization
  let cleaned = rawText.normalize('NFC');

  // 2. Remove common header/footer page numbers and academic metadata boilerplate
  cleaned = cleaned.replace(/page\s+\d+(\s+of\s+\d+)?/gi, ' ');
  cleaned = cleaned.replace(/^\d+\s*\|\s*Page/gim, ' ');
  cleaned = cleaned.replace(/(student\s+name|reg(istration)?\s+no|roll\s+no|department|subject|course|assignment\s+\d+|submitted\s+by|submitted\s+to|instructor|professor|university|college|date)\s*:?[^\n]*/gi, ' ');
  cleaned = cleaned.replace(/answer\s+the\s+following\s+questions?/gi, ' ');
  cleaned = cleaned.replace(/question\s+\d+\s*:?/gi, ' ');
  cleaned = cleaned.replace(/\r\n/g, '\n');

  // 3. Extract paragraph chunks (split by single/double newlines or sentence blocks)
  let rawParagraphs = cleaned
    .split(/\n+/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.split(' ').length >= 8);

  if (rawParagraphs.length === 0 && cleaned.trim().length > 50) {
    rawParagraphs = [cleaned.replace(/\s+/g, ' ').trim()];
  }

  // 4. Tokenize and normalize full text
  let lowerNormalized = cleaned
    .toLowerCase()
    .replace(/[\r\t\f\v]/g, ' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 5. Exclude assignment template / question paper content if provided
  if (templateText && typeof templateText === 'string' && templateText.trim().length > 10) {
    const lowerTemplate = templateText
      .toLowerCase()
      .replace(/[\r\t\f\v]/g, ' ')
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Remove long exact matching phrases from template
    const templateWords = lowerTemplate.split(' ').filter(w => w.length > 0);
    for (let i = 0; i <= templateWords.length - 6; i++) {
      const phrase = templateWords.slice(i, i + 6).join(' ');
      if (phrase.length > 15 && lowerNormalized.includes(phrase)) {
        lowerNormalized = lowerNormalized.split(phrase).join(' ');
      }
    }
    lowerNormalized = lowerNormalized.replace(/\s+/g, ' ').trim();
  }

  const tokens = lowerNormalized.split(' ').filter(w => w.length > 0);
  const wordCount = tokens.length;

  // Process paragraph chunks
  const chunks = rawParagraphs.map((paraText, index) => {
    const normPara = paraText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const paraTokens = normPara.split(' ').filter(w => w.length > 0);
    return {
      index,
      rawText: paraText,
      normalizedText: normPara,
      tokens: paraTokens,
      wordCount: paraTokens.length
    };
  }).filter(c => c.wordCount >= 5);

  return {
    normalizedFullText: lowerNormalized,
    tokens,
    chunks,
    wordCount
  };
}

/**
 * Enforce minimum word count (>= 100 words)
 */
export function validateMinimumWordCount(wordCount, minLimit = 100) {
  if (wordCount < minLimit) {
    return {
      valid: false,
      error: 'Unable to extract enough readable text from this document. Please upload a searchable PDF or DOCX file.'
    };
  }
  return { valid: true };
}
