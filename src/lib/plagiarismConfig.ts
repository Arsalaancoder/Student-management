/**
 * Central Configuration for Plagiarism & Similarity Detection System
 * Do NOT hardcode thresholds across the application.
 */

export const PLAGIARISM_CONFIG = {
  // Configurable Similarity Thresholds (Percentage 0-100)
  REVIEW_THRESHOLD: 30, // >= 30% requires teacher review
  HIGH_THRESHOLD: 70,   // >= 70% flagged as high similarity

  // Scoring Weights for Combined Score
  LEXICAL_WEIGHT: 0.5,
  SEMANTIC_WEIGHT: 0.5,

  // Default Status Labels
  STATUS_LABELS: {
    LOW: "Low Similarity",
    REVIEW: "Needs Review",
    HIGH: "High Similarity Detected",
    FAILED: "Analysis Failed",
    PROCESSING: "Processing..."
  },

  // Student Facing Messages (Non-accusatory)
  STUDENT_MESSAGES: {
    PROCESSING: "Similarity analysis is processing...",
    LOW: "Similarity check completed — no significant similarity detected.",
    REVIEW: "Similarity check completed — some similar content was detected.",
    HIGH: "Similarity check completed — high similarity with another submission was detected.",
    FAILED: "Submission received, but similarity analysis could not be completed. Professor can retry.",
    DUPLICATE: "Duplicate submission detected (matches your previous submission version)."
  }
} as const;

export type SimilarityStatus = 'low' | 'review' | 'high' | 'failed' | 'processing' | 'duplicate';

export function getSimilarityStatus(percentage: number | null | undefined, isFailed = false): SimilarityStatus {
  if (isFailed) return 'failed';
  if (percentage === null || percentage === undefined) return 'processing';
  if (percentage >= PLAGIARISM_CONFIG.HIGH_THRESHOLD) return 'high';
  if (percentage >= PLAGIARISM_CONFIG.REVIEW_THRESHOLD) return 'review';
  return 'low';
}

export function getSimilarityStatusBadge(status: SimilarityStatus) {
  switch (status) {
    case 'high':
      return {
        label: PLAGIARISM_CONFIG.STATUS_LABELS.HIGH,
        colorClass: "bg-red-100 text-red-700 border-red-200",
        badgeColor: "bg-red-500",
        textColor: "text-red-700"
      };
    case 'review':
      return {
        label: PLAGIARISM_CONFIG.STATUS_LABELS.REVIEW,
        colorClass: "bg-amber-100 text-amber-800 border-amber-200",
        badgeColor: "bg-amber-500",
        textColor: "text-amber-700"
      };
    case 'low':
      return {
        label: PLAGIARISM_CONFIG.STATUS_LABELS.LOW,
        colorClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
        badgeColor: "bg-emerald-500",
        textColor: "text-emerald-700"
      };
    case 'duplicate':
      return {
        label: "Self Duplicate",
        colorClass: "bg-blue-100 text-blue-800 border-blue-200",
        badgeColor: "bg-blue-500",
        textColor: "text-blue-700"
      };
    case 'failed':
      return {
        label: PLAGIARISM_CONFIG.STATUS_LABELS.FAILED,
        colorClass: "bg-gray-100 text-gray-700 border-gray-200",
        badgeColor: "bg-gray-400",
        textColor: "text-gray-600"
      };
    default:
      return {
        label: PLAGIARISM_CONFIG.STATUS_LABELS.PROCESSING,
        colorClass: "bg-blue-50 text-blue-700 border-blue-200",
        badgeColor: "bg-blue-400",
        textColor: "text-blue-600"
      };
  }
}
