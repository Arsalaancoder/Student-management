-- Migration 20260831000024: Fix Overloaded grade_submission RPC Function
-- Drop all existing overloaded signatures of grade_submission to resolve PostgREST RPC ambiguity

DROP FUNCTION IF EXISTS public.grade_submission(uuid, uuid, numeric, numeric, text, text);
DROP FUNCTION IF EXISTS public.grade_submission(uuid, uuid, text, numeric, numeric, text, text, jsonb, boolean);
DROP FUNCTION IF EXISTS public.grade_submission(uuid, uuid, numeric, numeric, text, text, text, jsonb, boolean);

-- Recreate canonical, single signature of grade_submission
CREATE OR REPLACE FUNCTION public.grade_submission(
  p_submission_id UUID,
  p_professor_id UUID,
  p_marks NUMERIC DEFAULT NULL,
  p_credits NUMERIC DEFAULT NULL,
  p_feedback TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'graded',
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
