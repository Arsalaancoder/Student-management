-- Migration: Fix student assignment visibility RLS policy to ensure students can see created assignments

DROP POLICY IF EXISTS "Students can read targeted assignments" ON public.assignments;
DROP POLICY IF EXISTS "Professors can manage own assignments" ON public.assignments;
DROP POLICY IF EXISTS "Anyone authenticated can read assignments" ON public.assignments;
DROP POLICY IF EXISTS "Authenticated users can read assignments" ON public.assignments;

-- Allow all authenticated users (students & professors) to read assignments.
-- Application logic (isAssignmentTargetedToStudent) handles display filtering safely.
CREATE POLICY "Authenticated users can read assignments"
ON public.assignments
FOR SELECT
TO authenticated
USING (true);

-- Allow professors to manage (insert, update, delete) their own assignments.
CREATE POLICY "Professors can manage own assignments"
ON public.assignments
FOR ALL
TO authenticated
USING (created_by = public.user_profile_id())
WITH CHECK (created_by = public.user_profile_id());
