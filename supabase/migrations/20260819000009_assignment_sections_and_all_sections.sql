-- Migration: Add all_sections to assignments and create assignment_sections table

-- 1. Add all_sections column to public.assignments
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS all_sections BOOLEAN DEFAULT true;

-- 2. Create assignment_sections table for storing specific section targeting
CREATE TABLE IF NOT EXISTS public.assignment_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  section TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(assignment_id, section)
);

-- 3. Enable RLS on assignment_sections
ALTER TABLE public.assignment_sections ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies for assignment_sections
DROP POLICY IF EXISTS "Anyone authenticated can read assignment sections" ON public.assignment_sections;
CREATE POLICY "Anyone authenticated can read assignment sections"
ON public.assignment_sections
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Professors can manage assignment sections" ON public.assignment_sections;
CREATE POLICY "Professors can manage assignment sections"
ON public.assignment_sections
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.assignments
    WHERE assignments.id = assignment_sections.assignment_id
      AND assignments.created_by = public.user_profile_id()
  )
);

-- 5. Update Student RLS policy for reading targeted assignments
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
