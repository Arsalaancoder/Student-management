-- Migration: Update RLS policies for Branch + Year + Section targeting and Professor submissions management

-- 1. Ensure user_profile_* functions are SECURITY DEFINER and up-to-date
CREATE OR REPLACE FUNCTION public.user_profile_id()
RETURNS UUID AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_profile_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_profile_department()
RETURNS TEXT AS $$
  SELECT department FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_profile_year()
RETURNS INTEGER AS $$
  SELECT year FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_profile_section()
RETURNS TEXT AS $$
  SELECT section FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Update Submissions Policy for Professors (allowing created_by check)
DROP POLICY IF EXISTS "Professors can read submissions for their subjects" ON public.submissions;
DROP POLICY IF EXISTS "Professors can read submissions for their assignments" ON public.submissions;

CREATE POLICY "Professors can read submissions for their assignments"
ON public.submissions
FOR SELECT
USING (
  assignment_id IN (
    SELECT id FROM public.assignments
    WHERE created_by = public.user_profile_id()
       OR subject_id IN (SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id())
  )
);

-- 3. Update Grades Policy for Professors (allowing created_by check)
DROP POLICY IF EXISTS "Professors can manage grades for their subjects" ON public.grades;
DROP POLICY IF EXISTS "Professors can manage grades for their assignments" ON public.grades;

CREATE POLICY "Professors can manage grades for their assignments"
ON public.grades
FOR ALL
USING (
  submission_id IN (
    SELECT id FROM public.submissions
    WHERE assignment_id IN (
      SELECT id FROM public.assignments
      WHERE created_by = public.user_profile_id()
         OR subject_id IN (SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id())
    )
  )
)
WITH CHECK (
  submission_id IN (
    SELECT id FROM public.submissions
    WHERE assignment_id IN (
      SELECT id FROM public.assignments
      WHERE created_by = public.user_profile_id()
         OR subject_id IN (SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id())
    )
  )
);

-- 4. Update Profiles Select Policy so professors can view student profiles of their applicants
DROP POLICY IF EXISTS "Authenticated users profile select policy" ON public.profiles;

CREATE POLICY "Authenticated users profile select policy"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth_user_id = auth.uid()
  OR role = 'professor'::public.user_role
  OR id IN (
    SELECT student_id FROM public.submissions
    WHERE assignment_id IN (
      SELECT id FROM public.assignments
      WHERE created_by = public.user_profile_id()
         OR subject_id IN (SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id())
    )
  )
  OR id IN (
    SELECT student_id FROM public.enrollments
    WHERE subject_id IN (
      SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
    )
  )
);

-- 5. Ensure Student Assignment Read Policy is precise
DROP POLICY IF EXISTS "Students can read targeted assignments" ON public.assignments;

CREATE POLICY "Students can read targeted assignments"
ON public.assignments 
FOR SELECT 
USING (
  (target_branch IS NULL OR target_branch = public.user_profile_department())
  AND
  (target_year IS NULL OR target_year = public.user_profile_year())
  AND
  (
    COALESCE(all_sections, true) = true
    OR
    EXISTS (
      SELECT 1 FROM public.assignment_sections
      WHERE assignment_sections.assignment_id = assignments.id
        AND assignment_sections.section = public.user_profile_section()
    )
  )
);
