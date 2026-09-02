-- Migration: Real Plagiarism Detection System Schema
-- Date: 2026-09-02

-- 1. Extend Assignments Table
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS plagiarism_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS plagiarism_review_threshold NUMERIC NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS plagiarism_block_threshold NUMERIC NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS template_text TEXT NULL;

-- 2. Plagiarism Checks Table
CREATE TABLE IF NOT EXISTS public.plagiarism_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  submission_id UUID NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  word_count INTEGER NOT NULL DEFAULT 0,
  tfidf_score NUMERIC NOT NULL DEFAULT 0,
  ngram_score NUMERIC NOT NULL DEFAULT 0,
  semantic_score NUMERIC NOT NULL DEFAULT 0,
  final_score NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('checking', 'passed', 'flagged', 'blocked', 'failed')),
  highest_match_submission_id UUID NULL REFERENCES public.submissions(id) ON DELETE SET NULL,
  highest_match_student_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Plagiarism Matches Table
CREATE TABLE IF NOT EXISTS public.plagiarism_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plagiarism_check_id UUID NOT NULL REFERENCES public.plagiarism_checks(id) ON DELETE CASCADE,
  matched_submission_id UUID NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  source_chunk_index INTEGER NOT NULL DEFAULT 0,
  matched_chunk_index INTEGER NOT NULL DEFAULT 0,
  source_text TEXT NOT NULL,
  matched_text TEXT NOT NULL,
  similarity_score NUMERIC NOT NULL DEFAULT 0,
  match_type TEXT NOT NULL CHECK (match_type IN ('tfidf', 'ngram', 'semantic', 'combined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Extracted Submission Document Features Table
CREATE TABLE IF NOT EXISTS public.submission_document_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  plagiarism_check_id UUID NULL REFERENCES public.plagiarism_checks(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  normalized_text TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  ngram_features JSONB NOT NULL DEFAULT '[]'::jsonb,
  chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
  chunk_embeddings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Create Indexes
CREATE INDEX IF NOT EXISTS idx_plagiarism_checks_assignment ON public.plagiarism_checks(assignment_id);
CREATE INDEX IF NOT EXISTS idx_plagiarism_checks_student ON public.plagiarism_checks(student_id);
CREATE INDEX IF NOT EXISTS idx_plagiarism_checks_submission ON public.plagiarism_checks(submission_id);
CREATE INDEX IF NOT EXISTS idx_plagiarism_matches_check ON public.plagiarism_matches(plagiarism_check_id);
CREATE INDEX IF NOT EXISTS idx_doc_features_assignment ON public.submission_document_features(assignment_id);
CREATE INDEX IF NOT EXISTS idx_doc_features_student ON public.submission_document_features(student_id);
CREATE INDEX IF NOT EXISTS idx_doc_features_submission ON public.submission_document_features(submission_id);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.plagiarism_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plagiarism_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_document_features ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for plagiarism_checks
DROP POLICY IF EXISTS "Students can view own plagiarism checks" ON public.plagiarism_checks;
CREATE POLICY "Students can view own plagiarism checks"
  ON public.plagiarism_checks FOR SELECT
  TO authenticated
  USING (student_id = public.user_profile_id());

DROP POLICY IF EXISTS "Professors can view plagiarism checks for their assignments" ON public.plagiarism_checks;
CREATE POLICY "Professors can view plagiarism checks for their assignments"
  ON public.plagiarism_checks FOR ALL
  TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM public.assignments WHERE created_by = public.user_profile_id() OR subject_id IN (
        SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
      )
    )
  );

-- 8. RLS Policies for plagiarism_matches
DROP POLICY IF EXISTS "Students can view matches for their checks" ON public.plagiarism_matches;
CREATE POLICY "Students can view matches for their checks"
  ON public.plagiarism_matches FOR SELECT
  TO authenticated
  USING (
    plagiarism_check_id IN (
      SELECT id FROM public.plagiarism_checks WHERE student_id = public.user_profile_id()
    )
  );

DROP POLICY IF EXISTS "Professors can view matches for their assignments" ON public.plagiarism_matches;
CREATE POLICY "Professors can view matches for their assignments"
  ON public.plagiarism_matches FOR ALL
  TO authenticated
  USING (
    plagiarism_check_id IN (
      SELECT id FROM public.plagiarism_checks WHERE assignment_id IN (
        SELECT id FROM public.assignments WHERE created_by = public.user_profile_id() OR subject_id IN (
          SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
        )
      )
    )
  );

-- 9. RLS Policies for submission_document_features (Strictly protected)
DROP POLICY IF EXISTS "Professors can view document features for their assignments" ON public.submission_document_features;
CREATE POLICY "Professors can view document features for their assignments"
  ON public.submission_document_features FOR ALL
  TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM public.assignments WHERE created_by = public.user_profile_id() OR subject_id IN (
        SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
      )
    )
  );

DROP POLICY IF EXISTS "Students can view own document features" ON public.submission_document_features;
CREATE POLICY "Students can view own document features"
  ON public.submission_document_features FOR SELECT
  TO authenticated
  USING (student_id = public.user_profile_id());
