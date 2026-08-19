-- Migration: Fix all RLS infinite recursion across assignments, assignment_sections, submissions, and grades

-- 1. Helper Functions (SECURITY DEFINER to prevent RLS recursion)

CREATE OR REPLACE FUNCTION public.is_assignment_owner(p_assignment_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments
    WHERE id = p_assignment_id AND created_by = public.user_profile_id()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_professor_view_submission(p_assignment_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = p_assignment_id
      AND (a.created_by = public.user_profile_id() OR a.subject_id IN (
        SELECT s.id FROM public.subjects s WHERE s.professor_id = public.user_profile_id()
      ))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_professor_manage_grade(p_submission_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.submissions sub
    JOIN public.assignments a ON sub.assignment_id = a.id
    WHERE sub.id = p_submission_id
      AND (a.created_by = public.user_profile_id() OR a.subject_id IN (
        SELECT s.id FROM public.subjects s WHERE s.professor_id = public.user_profile_id()
      ))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- 2. Refactor Policies for assignment_sections

DROP POLICY IF EXISTS "Anyone authenticated can read assignment sections" ON public.assignment_sections;
DROP POLICY IF EXISTS "Professors can manage assignment sections" ON public.assignment_sections;

CREATE POLICY "Authenticated users can select assignment sections"
ON public.assignment_sections
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Professors can insert assignment sections"
ON public.assignment_sections
FOR INSERT
TO authenticated
WITH CHECK (public.is_assignment_owner(assignment_id));

CREATE POLICY "Professors can update assignment sections"
ON public.assignment_sections
FOR UPDATE
TO authenticated
USING (public.is_assignment_owner(assignment_id))
WITH CHECK (public.is_assignment_owner(assignment_id));

CREATE POLICY "Professors can delete assignment sections"
ON public.assignment_sections
FOR DELETE
TO authenticated
USING (public.is_assignment_owner(assignment_id));


-- 3. Refactor Policies for assignments

DROP POLICY IF EXISTS "Professors can manage own assignments" ON public.assignments;
DROP POLICY IF EXISTS "Students can read targeted assignments" ON public.assignments;

CREATE POLICY "Professors can manage own assignments"
ON public.assignments
FOR ALL
TO authenticated
USING (created_by = public.user_profile_id())
WITH CHECK (created_by = public.user_profile_id());

CREATE POLICY "Students can read targeted assignments"
ON public.assignments
FOR SELECT
TO authenticated
USING (
  created_by = public.user_profile_id()
  OR public.user_profile_role() = 'professor'
  OR (
    (target_branch IS NULL OR target_branch = public.user_profile_department())
    AND (target_year IS NULL OR target_year = public.user_profile_year())
    AND (COALESCE(all_sections, true) = true OR EXISTS (
      SELECT 1 FROM public.assignment_sections 
      WHERE assignment_sections.assignment_id = assignments.id 
        AND assignment_sections.section = public.user_profile_section()
    ))
  )
);


-- 4. Refactor Policies for submissions

DROP POLICY IF EXISTS "Professors can read submissions for their assignments" ON public.submissions;
DROP POLICY IF EXISTS "Students can manage own submissions" ON public.submissions;

CREATE POLICY "Students can manage own submissions"
ON public.submissions
FOR ALL
TO authenticated
USING (student_id = public.user_profile_id())
WITH CHECK (student_id = public.user_profile_id());

CREATE POLICY "Professors can read submissions for their assignments"
ON public.submissions
FOR SELECT
TO authenticated
USING (public.can_professor_view_submission(assignment_id));


-- 5. Refactor Policies for grades

DROP POLICY IF EXISTS "Professors can manage grades for their assignments" ON public.grades;
DROP POLICY IF EXISTS "Students can read own grades" ON public.grades;

CREATE POLICY "Students can read own grades"
ON public.grades
FOR SELECT
TO authenticated
USING (
  submission_id IN (
    SELECT id FROM public.submissions WHERE student_id = public.user_profile_id()
  )
);

CREATE POLICY "Professors can manage grades for their assignments"
ON public.grades
FOR ALL
TO authenticated
USING (public.can_professor_manage_grade(submission_id))
WITH CHECK (public.can_professor_manage_grade(submission_id));
