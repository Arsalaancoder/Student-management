-- Migration: Production Hardening for Plagiarism Schema
-- Date: 2026-09-02

-- 1. Extend submission_document_features table with hash & finalization status fields
ALTER TABLE public.submission_document_features
  ADD COLUMN IF NOT EXISTS file_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS content_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS finalized BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Extend plagiarism_checks table with hash fields and update status constraint
ALTER TABLE public.plagiarism_checks
  ADD COLUMN IF NOT EXISTS file_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS content_hash TEXT NULL;

ALTER TABLE public.plagiarism_checks 
  DROP CONSTRAINT IF EXISTS plagiarism_checks_status_check;

ALTER TABLE public.plagiarism_checks 
  ADD CONSTRAINT plagiarism_checks_status_check 
  CHECK (status IN ('checking', 'no_candidates', 'passed', 'flagged', 'blocked', 'failed'));

-- 3. Create Compound Indexes for fast candidate lookups and exact duplicate matching
CREATE INDEX IF NOT EXISTS idx_doc_features_assign_student 
  ON public.submission_document_features(assignment_id, student_id);

CREATE INDEX IF NOT EXISTS idx_doc_features_assign_hash 
  ON public.submission_document_features(assignment_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_doc_features_assign_finalized 
  ON public.submission_document_features(assignment_id, finalized);
