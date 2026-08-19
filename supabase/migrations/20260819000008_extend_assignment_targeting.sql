-- Migration: Extend assignment targeting to Branch, Year, and Section

-- 1. Add target_branch and target_section columns to public.assignments
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS target_branch TEXT;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS target_section TEXT;

-- 2. Create helper functions for user profile department and section for RLS
CREATE OR REPLACE FUNCTION public.user_profile_department()
RETURNS TEXT AS $$
  SELECT department FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_profile_section()
RETURNS TEXT AS $$
  SELECT section FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3. Update trigger handle_new_user to store year, department, and section for students
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, email, full_name, role, year, department, section)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'student'),
    CASE 
      WHEN (new.raw_user_meta_data->>'role') = 'student' AND (new.raw_user_meta_data->>'year') IS NOT NULL AND (new.raw_user_meta_data->>'year') <> ''
      THEN (new.raw_user_meta_data->>'year')::INTEGER 
      ELSE NULL 
    END,
    CASE 
      WHEN (new.raw_user_meta_data->>'role') = 'student' AND (new.raw_user_meta_data->>'department') IS NOT NULL AND (new.raw_user_meta_data->>'department') <> ''
      THEN new.raw_user_meta_data->>'department'
      ELSE NULL 
    END,
    CASE 
      WHEN (new.raw_user_meta_data->>'role') = 'student' AND (new.raw_user_meta_data->>'section') IS NOT NULL AND (new.raw_user_meta_data->>'section') <> ''
      THEN new.raw_user_meta_data->>'section'
      ELSE NULL 
    END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update Student RLS policy for reading assignments targeted to Branch, Year, and Section
DROP POLICY IF EXISTS "Students can read assignments for their target year" ON public.assignments;
DROP POLICY IF EXISTS "Students can read assignments for their enrolled subjects and year" ON public.assignments;
DROP POLICY IF EXISTS "Students can read assignments for their enrolled subjects" ON public.assignments;
DROP POLICY IF EXISTS "Students can read targeted assignments" ON public.assignments;

CREATE POLICY "Students can read targeted assignments"
ON public.assignments 
FOR SELECT 
USING (
  (target_branch IS NULL OR target_branch = public.user_profile_department())
  AND
  (target_year IS NULL OR target_year = public.user_profile_year())
  AND
  (target_section IS NULL OR target_section = public.user_profile_section())
);
