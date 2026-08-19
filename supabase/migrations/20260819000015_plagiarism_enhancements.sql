-- Migration: Plagiarism system enhancements and security policies

-- 1. Ensure indexes for high performance querying
CREATE INDEX IF NOT EXISTS idx_plagiarism_reports_submission_id ON public.plagiarism_reports(submission_id);
CREATE INDEX IF NOT EXISTS idx_plagiarism_reports_status ON public.plagiarism_reports(status);

-- 2. Refactor RLS Policies for plagiarism_reports

DROP POLICY IF EXISTS "Professors can read plagiarism reports for their subjects" ON public.plagiarism_reports;
DROP POLICY IF EXISTS "Students can read own plagiarism reports" ON public.plagiarism_reports;
DROP POLICY IF EXISTS "Professors can manage plagiarism reports for their assignments" ON public.plagiarism_reports;

-- Policy: Students can view plagiarism reports for their own submissions only
CREATE POLICY "Students can read own plagiarism reports"
ON public.plagiarism_reports
FOR SELECT
TO authenticated
USING (
  submission_id IN (
    SELECT id FROM public.submissions WHERE student_id = public.user_profile_id()
  )
);

-- Policy: Professors can read/manage plagiarism reports for assignments in their subjects/assignments
CREATE POLICY "Professors can manage plagiarism reports for their assignments"
ON public.plagiarism_reports
FOR ALL
TO authenticated
USING (
  submission_id IN (
    SELECT id FROM public.submissions WHERE assignment_id IN (
      SELECT id FROM public.assignments WHERE created_by = public.user_profile_id() OR subject_id IN (
        SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
      )
    )
  )
)
WITH CHECK (
  submission_id IN (
    SELECT id FROM public.submissions WHERE assignment_id IN (
      SELECT id FROM public.assignments WHERE created_by = public.user_profile_id() OR subject_id IN (
        SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
      )
    )
  )
);
