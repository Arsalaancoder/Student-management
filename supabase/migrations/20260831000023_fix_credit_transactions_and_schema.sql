-- Migration 20260831000023: Fix Credit Transactions Table, Idempotent Grading RPC, Branch Normalization & Reg No Backfill

-- 1. Create credit_transactions table if it does not exist
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
  credits NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  transaction_type TEXT NOT NULL DEFAULT 'assignment_graded',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Idempotency Constraint: Ensure one credit transaction per submission
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_submission_id_key'
  ) THEN
    ALTER TABLE public.credit_transactions 
    ADD CONSTRAINT credit_transactions_submission_id_key UNIQUE (submission_id);
  END IF;
END $$;

-- 3. Indexes for frequent lookups
CREATE INDEX IF NOT EXISTS idx_credit_transactions_student_id ON public.credit_transactions (student_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_assignment_id ON public.credit_transactions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_submission_id ON public.credit_transactions (submission_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions (created_at);

-- 4. Enable RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "Students can read own credits" ON public.credit_transactions;
CREATE POLICY "Students can read own credits" 
ON public.credit_transactions 
FOR SELECT 
TO authenticated 
USING (student_id = public.user_profile_id());

DROP POLICY IF EXISTS "Professors can manage credits for their assignments" ON public.credit_transactions;
CREATE POLICY "Professors can manage credits for their assignments" 
ON public.credit_transactions 
FOR ALL 
TO authenticated 
USING (
  created_by = public.user_profile_id() 
  OR public.user_profile_role() = 'professor'
  OR submission_id IN (
    SELECT sub.id FROM public.submissions sub
    JOIN public.assignments a ON sub.assignment_id = a.id
    WHERE a.created_by = public.user_profile_id() 
       OR a.subject_id IN (SELECT s.id FROM public.subjects s WHERE s.professor_id = public.user_profile_id())
  )
)
WITH CHECK (
  created_by = public.user_profile_id() 
  OR public.user_profile_role() = 'professor'
  OR submission_id IN (
    SELECT sub.id FROM public.submissions sub
    JOIN public.assignments a ON sub.assignment_id = a.id
    WHERE a.created_by = public.user_profile_id() 
       OR a.subject_id IN (SELECT s.id FROM public.subjects s WHERE s.professor_id = public.user_profile_id())
  )
);

-- 6. Atomic, Idempotent grade_submission RPC Function
CREATE OR REPLACE FUNCTION public.grade_submission(
  p_submission_id UUID,
  p_professor_id UUID,
  p_marks DECIMAL,
  p_credits DECIMAL,
  p_feedback TEXT,
  p_status TEXT,
  p_return_reason TEXT DEFAULT NULL,
  p_rubric_scores JSONB DEFAULT NULL,
  p_is_draft BOOLEAN DEFAULT FALSE
) RETURNS void AS $$
DECLARE
  v_caller_profile_id UUID;
  v_is_authorized BOOLEAN;
  v_student_id UUID;
  v_assignment_id UUID;
  v_final_status TEXT;
BEGIN
  -- Retrieve current user profile ID securely
  SELECT id INTO v_caller_profile_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  
  -- Fallback to parameter if caller profile isn't fetched via auth.uid() (e.g. service_role)
  IF v_caller_profile_id IS NULL THEN
    v_caller_profile_id := p_professor_id;
  END IF;

  -- Verify submission details and authorization
  SELECT student_id, assignment_id INTO v_student_id, v_assignment_id
  FROM public.submissions
  WHERE id = p_submission_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Submission % not found', p_submission_id;
  END IF;

  -- Check authorization: caller must be professor or owner of assignment/subject
  SELECT EXISTS (
    SELECT 1 FROM public.assignments a
    LEFT JOIN public.subjects s ON a.subject_id = s.id
    WHERE a.id = v_assignment_id 
      AND (a.created_by = v_caller_profile_id OR s.professor_id = v_caller_profile_id OR public.user_profile_role() = 'professor')
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: You are not permitted to grade this submission.';
  END IF;

  v_final_status := p_status;

  -- 1. Insert or Update Grade record
  IF p_marks IS NOT NULL OR p_rubric_scores IS NOT NULL OR p_credits IS NOT NULL THEN
    INSERT INTO public.grades (submission_id, professor_id, marks, credits, feedback, rubric_scores, is_draft, graded_at)
    VALUES (p_submission_id, v_caller_profile_id, p_marks, p_credits, p_feedback, p_rubric_scores, p_is_draft, now())
    ON CONFLICT (submission_id) 
    DO UPDATE SET 
      marks = EXCLUDED.marks,
      credits = EXCLUDED.credits,
      feedback = EXCLUDED.feedback,
      rubric_scores = EXCLUDED.rubric_scores,
      is_draft = EXCLUDED.is_draft,
      professor_id = v_caller_profile_id,
      graded_at = now();
  END IF;

  -- 2. Update Submission status
  UPDATE public.submissions 
  SET status = v_final_status, 
      return_reason = CASE WHEN p_status = 'returned' THEN p_return_reason ELSE return_reason END,
      updated_at = now()
  WHERE id = p_submission_id;

  -- 3. Manage Credit Transactions idempotently
  IF (p_status = 'graded' OR p_status = 'approved') AND p_is_draft = FALSE AND COALESCE(p_credits, 0) > 0 THEN
    INSERT INTO public.credit_transactions (
      student_id,
      submission_id,
      assignment_id,
      credits,
      reason,
      transaction_type,
      created_by,
      created_at
    )
    VALUES (
      v_student_id,
      p_submission_id,
      v_assignment_id,
      p_credits,
      'Assignment Graded & Published',
      'assignment_graded',
      v_caller_profile_id,
      now()
    )
    ON CONFLICT (submission_id) 
    DO UPDATE SET 
      credits = EXCLUDED.credits,
      assignment_id = EXCLUDED.assignment_id,
      reason = EXCLUDED.reason,
      created_by = EXCLUDED.created_by,
      created_at = now();
  ELSIF (p_status = 'returned' OR p_is_draft = TRUE) THEN
    -- If returned or reverted to draft, remove awarded credits
    DELETE FROM public.credit_transactions WHERE submission_id = p_submission_id;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. Normalize Existing Branch / Department values in profiles
UPDATE public.profiles
SET department = 'CSE'
WHERE role = 'student' AND (department IS NULL OR LOWER(TRIM(department)) IN ('computer science & engineering', 'computer science', 'cse', 'computer science engineering'));

UPDATE public.profiles
SET department = 'AI&DS'
WHERE role = 'student' AND LOWER(TRIM(department)) IN ('ai & ds', 'data science', 'aids', 'ai-ds', 'ai&ds', 'artificial intelligence & data science');

UPDATE public.profiles
SET department = 'AI&ML'
WHERE role = 'student' AND LOWER(TRIM(department)) IN ('ai & ml', 'aiml', 'ai-ml', 'ai&ml', 'artificial intelligence & machine learning');

UPDATE public.profiles
SET department = 'ECE'
WHERE role = 'student' AND LOWER(TRIM(department)) IN ('electronics & communication', 'ece', 'electronics & communication engineering');

UPDATE public.profiles
SET department = 'EEE'
WHERE role = 'student' AND LOWER(TRIM(department)) IN ('electrical & electronics', 'eee', 'electrical & electronics engineering');

UPDATE public.profiles
SET department = 'MECH'
WHERE role = 'student' AND LOWER(TRIM(department)) IN ('mechanical', 'mech', 'mechanical engineering');

UPDATE public.profiles
SET department = 'CIVIL'
WHERE role = 'student' AND LOWER(TRIM(department)) IN ('civil', 'civil engineering');

UPDATE public.profiles
SET department = 'IT'
WHERE role = 'student' AND LOWER(TRIM(department)) IN ('information technology', 'it');


-- 8. Repair Missing Registration Numbers (Backfill for old accounts)
UPDATE public.profiles
SET student_id = UPPER(TRIM(split_part(email, '@', 1)))
WHERE role = 'student' 
  AND (student_id IS NULL OR TRIM(student_id) = '')
  AND email IS NOT NULL AND email LIKE '%@nbkrist.org';

