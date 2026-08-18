-- 1a. Privilege Escalation Fix
-- Prevent users from updating their own role or student_id
CREATE OR REPLACE FUNCTION public.prevent_role_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role = OLD.role;
  END IF;
  IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
    NEW.student_id = OLD.student_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_role_update ON public.profiles;
CREATE TRIGGER no_role_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_role_update();

-- 1b. Grades RLS Bug Fix
-- Drop the existing unsafe policy
DROP POLICY IF EXISTS "Professors can manage grades for their subjects" ON public.grades;

-- Create the new safe policy without the `OR professor_id = public.user_profile_id()` loophole
CREATE POLICY "Professors can manage grades for their subjects" ON public.grades FOR ALL USING (
  submission_id IN (
    SELECT id FROM public.submissions 
    WHERE assignment_id IN (
      SELECT id FROM public.assignments 
      WHERE subject_id IN (
        SELECT id FROM public.subjects 
        WHERE professor_id = public.user_profile_id()
      )
    )
  )
);

-- 1c. Recreate grade_submission RPC securely
CREATE OR REPLACE FUNCTION public.grade_submission(
  p_submission_id UUID,
  p_professor_id UUID,
  p_marks DECIMAL,
  p_credits DECIMAL,
  p_feedback TEXT,
  p_status TEXT,
  p_return_reason TEXT,
  p_rubric_scores JSONB DEFAULT NULL,
  p_is_draft BOOLEAN DEFAULT FALSE
) RETURNS void AS $$
DECLARE
  v_caller_profile_id UUID;
  v_is_authorized BOOLEAN;
  v_grade_id UUID;
  v_final_status TEXT;
BEGIN
  -- Get the caller's profile ID securely
  SELECT id INTO v_caller_profile_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  
  -- Verify authorization: Caller must be the professor of the subject the submission belongs to
  SELECT EXISTS (
    SELECT 1 FROM public.submissions sub
    JOIN public.assignments a ON sub.assignment_id = a.id
    JOIN public.subjects s ON a.subject_id = s.id
    WHERE sub.id = p_submission_id AND s.professor_id = v_caller_profile_id
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: You are not the professor for this submission.';
  END IF;

  v_final_status := p_status;

  -- Insert or update the grade record if marks are provided
  IF p_marks IS NOT NULL OR p_rubric_scores IS NOT NULL THEN
    INSERT INTO public.grades (submission_id, professor_id, marks, credits, feedback, graded_at)
    VALUES (p_submission_id, v_caller_profile_id, p_marks, p_credits, p_feedback, now())
    ON CONFLICT (submission_id) 
    DO UPDATE SET 
      marks = EXCLUDED.marks,
      credits = EXCLUDED.credits,
      feedback = EXCLUDED.feedback,
      professor_id = v_caller_profile_id,
      graded_at = now()
    RETURNING id INTO v_grade_id;
  END IF;

  -- Update submission status
  UPDATE public.submissions 
  SET status = v_final_status, updated_at = now()
  WHERE id = p_submission_id;

  -- Handle credits insertion only if not a draft and status is graded
  IF p_status = 'graded' AND p_is_draft = FALSE AND p_credits > 0 THEN
    -- Delete existing credit transaction for this submission if it exists
    DELETE FROM public.credit_transactions WHERE submission_id = p_submission_id;
    
    INSERT INTO public.credit_transactions (student_id, submission_id, credits, reason)
    SELECT student_id, p_submission_id, p_credits, 'Assignment Graded'
    FROM public.submissions
    WHERE id = p_submission_id;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 1d. Notifications RLS Bug Fix
-- Drop the existing policy
DROP POLICY IF EXISTS "Users can manage own notifications" ON public.notifications;

-- Create separated policies
CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT USING (user_id = public.user_profile_id());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (user_id = public.user_profile_id());
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE USING (user_id = public.user_profile_id());
-- Allow any authenticated user to insert a notification (cross-user)
CREATE POLICY "Authenticated users can insert notifications" ON public.notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');


-- 1e. Storage Security
-- Create submissions bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('submissions', 'submissions', false, 52428800, ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'])
ON CONFLICT (id) DO UPDATE SET 
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];

-- Drop existing storage policies if any
DROP POLICY IF EXISTS "Students can upload to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Students can read their own submissions" ON storage.objects;
DROP POLICY IF EXISTS "Professors can read submissions for their subjects" ON storage.objects;

-- Students can upload to their own folder (Path: student_id/assignment_id/filename)
CREATE POLICY "Students can upload to their own folder" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'submissions' AND (storage.foldername(name))[1] = (SELECT id::text FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1)
);

-- Students can read their own submissions
CREATE POLICY "Students can read their own submissions" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'submissions' AND (storage.foldername(name))[1] = (SELECT id::text FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1)
);

-- Professors can read submissions for their subjects
CREATE POLICY "Professors can read submissions for their subjects" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'submissions' AND EXISTS (
    SELECT 1 FROM public.submissions sub
    JOIN public.assignments a ON sub.assignment_id = a.id
    JOIN public.subjects s ON a.subject_id = s.id
    WHERE sub.student_id::text = (storage.foldername(name))[1] 
    AND a.id::text = (storage.foldername(name))[2]
    AND s.professor_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1)
  )
);
