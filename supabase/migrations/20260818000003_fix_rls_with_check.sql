-- Migration: Fix all FOR ALL RLS policies missing WITH CHECK clauses
-- Root cause: PostgreSQL FOR ALL policies without WITH CHECK block INSERT operations,
-- causing "new row violates row-level security policy" errors on assignment creation,
-- subject creation, submission uploads, and grading.

-- 1. assignments — fix professor insert
DROP POLICY IF EXISTS "Professors can manage assignments for their subjects" ON public.assignments;
CREATE POLICY "Professors can manage assignments for their subjects"
ON public.assignments
FOR ALL
USING (
  subject_id IN (
    SELECT id FROM public.subjects
    WHERE professor_id = public.user_profile_id()
  )
)
WITH CHECK (
  subject_id IN (
    SELECT id FROM public.subjects
    WHERE professor_id = public.user_profile_id()
  )
);

-- 2. subjects — fix professor insert
DROP POLICY IF EXISTS "Professors can manage own subjects" ON public.subjects;
CREATE POLICY "Professors can manage own subjects" ON public.subjects
FOR ALL
USING (professor_id = public.user_profile_id())
WITH CHECK (professor_id = public.user_profile_id());

-- 3. submissions — fix student insert
DROP POLICY IF EXISTS "Students can manage own submissions" ON public.submissions;
CREATE POLICY "Students can manage own submissions" ON public.submissions
FOR ALL
USING (student_id = public.user_profile_id())
WITH CHECK (student_id = public.user_profile_id());

-- 4. submission_versions — fix student insert
DROP POLICY IF EXISTS "Students can manage own submission versions" ON public.submission_versions;
CREATE POLICY "Students can manage own submission versions" ON public.submission_versions
FOR ALL
USING (
  submission_id IN (SELECT id FROM public.submissions WHERE student_id = public.user_profile_id())
)
WITH CHECK (
  submission_id IN (SELECT id FROM public.submissions WHERE student_id = public.user_profile_id())
);

-- 5. grades — fix professor insert
DROP POLICY IF EXISTS "Professors can manage grades for their subjects" ON public.grades;
CREATE POLICY "Professors can manage grades for their subjects" ON public.grades
FOR ALL
USING (
  submission_id IN (
    SELECT id FROM public.submissions
    WHERE assignment_id IN (
      SELECT id FROM public.assignments
      WHERE subject_id IN (
        SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
      )
    )
  )
)
WITH CHECK (
  submission_id IN (
    SELECT id FROM public.submissions
    WHERE assignment_id IN (
      SELECT id FROM public.assignments
      WHERE subject_id IN (
        SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
      )
    )
  )
);

-- 6. credit_transactions — fix professor insert
DROP POLICY IF EXISTS "Professors can manage credits for their subjects" ON public.credit_transactions;
CREATE POLICY "Professors can manage credits for their subjects" ON public.credit_transactions
FOR ALL
USING (
  submission_id IN (
    SELECT id FROM public.submissions
    WHERE assignment_id IN (
      SELECT id FROM public.assignments
      WHERE subject_id IN (
        SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
      )
    )
  )
)
WITH CHECK (
  submission_id IN (
    SELECT id FROM public.submissions
    WHERE assignment_id IN (
      SELECT id FROM public.assignments
      WHERE subject_id IN (
        SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
      )
    )
  )
);

-- 7. notifications — drop old blanket policy and replace with targeted policies
DROP POLICY IF EXISTS "Users can manage own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (user_id = public.user_profile_id());

CREATE POLICY "Authenticated users can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE
  USING (user_id = public.user_profile_id())
  WITH CHECK (user_id = public.user_profile_id());

CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE USING (user_id = public.user_profile_id());
