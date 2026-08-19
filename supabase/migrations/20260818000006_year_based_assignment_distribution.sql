-- Migration: Year-based assignment distribution and student registration

-- 1. Add target_year column to public.assignments
ALTER TABLE public.assignments 
ADD COLUMN IF NOT EXISTS target_year INTEGER;

-- 2. Update trigger handle_new_user to store year for students
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, email, full_name, role, year)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'student'),
    CASE 
      WHEN (new.raw_user_meta_data->>'role') = 'student' AND (new.raw_user_meta_data->>'year') IS NOT NULL AND (new.raw_user_meta_data->>'year') <> ''
      THEN (new.raw_user_meta_data->>'year')::INTEGER 
      ELSE NULL 
    END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create SECURITY DEFINER function to fetch current user's year safely for RLS
CREATE OR REPLACE FUNCTION public.user_profile_year()
RETURNS INTEGER AS $$
  SELECT year FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4. Update RLS policy on public.assignments for student SELECT
DROP POLICY IF EXISTS "Students can read assignments for their enrolled subjects" ON public.assignments;
DROP POLICY IF EXISTS "Students can read assignments for their enrolled subjects and year" ON public.assignments;

CREATE POLICY "Students can read assignments for their enrolled subjects and year" 
ON public.assignments 
FOR SELECT 
USING (
  subject_id IN (SELECT subject_id FROM public.enrollments WHERE student_id = public.user_profile_id())
  AND
  (
    target_year IS NULL 
    OR 
    target_year = public.user_profile_year()
  )
);
