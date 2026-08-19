-- Migration: Allow professors to read student profiles for enrolled/submitting students

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can read professor profiles" ON public.profiles;
DROP POLICY IF EXISTS "Professors can read profiles of enrolled or submitting students" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users profile select policy" ON public.profiles;

CREATE POLICY "Authenticated users profile select policy"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth_user_id = auth.uid()
  OR
  role = 'professor'
  OR
  id IN (
    SELECT student_id FROM public.submissions
    WHERE assignment_id IN (
      SELECT id FROM public.assignments
      WHERE subject_id IN (
        SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
      )
    )
  )
  OR
  id IN (
    SELECT student_id FROM public.enrollments
    WHERE subject_id IN (
      SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()
    )
  )
);
