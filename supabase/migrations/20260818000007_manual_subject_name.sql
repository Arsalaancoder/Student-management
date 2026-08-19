-- Migration: Add subject_name column to public.assignments and update RLS policies for manual subject entry

-- 1. Add subject_name column and drop NOT NULL constraint from subject_id
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS subject_name TEXT;
ALTER TABLE public.assignments ALTER COLUMN subject_id DROP NOT NULL;

-- 2. Update Student RLS policy for reading assignments targeted to their year
DROP POLICY IF EXISTS "Students can read assignments for their enrolled subjects and year" ON public.assignments;
DROP POLICY IF EXISTS "Students can read assignments for their enrolled subjects" ON public.assignments;
DROP POLICY IF EXISTS "Students can read assignments for their target year" ON public.assignments;

CREATE POLICY "Students can read assignments for their target year"
ON public.assignments 
FOR SELECT 
USING (
  target_year IS NULL 
  OR 
  target_year = public.user_profile_year()
);

-- 3. Update Professor RLS policy for managing their own assignments
DROP POLICY IF EXISTS "Professors can manage assignments for their subjects" ON public.assignments;
DROP POLICY IF EXISTS "Professors can manage own assignments" ON public.assignments;

CREATE POLICY "Professors can manage own assignments"
ON public.assignments 
FOR ALL 
USING (
  created_by = public.user_profile_id()
);
