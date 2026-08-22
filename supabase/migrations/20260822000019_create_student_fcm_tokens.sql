-- Migration: Create student_fcm_tokens & fcm_notifications_log tables with RLS and indexes

CREATE TABLE IF NOT EXISTS public.student_fcm_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  fcm_token TEXT NOT NULL,
  device_id TEXT,
  platform TEXT DEFAULT 'android',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT student_fcm_token_device_unique UNIQUE(student_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_student_fcm_tokens_student_id ON public.student_fcm_tokens(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fcm_tokens_fcm_token ON public.student_fcm_tokens(fcm_token);
CREATE INDEX IF NOT EXISTS idx_student_fcm_tokens_active ON public.student_fcm_tokens(student_id, is_active);

ALTER TABLE public.student_fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view own FCM tokens" ON public.student_fcm_tokens;
CREATE POLICY "Students can view own FCM tokens"
ON public.student_fcm_tokens FOR SELECT
USING (student_id = public.user_profile_id());

DROP POLICY IF EXISTS "Students can insert own FCM tokens" ON public.student_fcm_tokens;
CREATE POLICY "Students can insert own FCM tokens"
ON public.student_fcm_tokens FOR INSERT
WITH CHECK (student_id = public.user_profile_id());

DROP POLICY IF EXISTS "Students can update own FCM tokens" ON public.student_fcm_tokens;
CREATE POLICY "Students can update own FCM tokens"
ON public.student_fcm_tokens FOR UPDATE
USING (student_id = public.user_profile_id());

DROP POLICY IF EXISTS "Students can delete own FCM tokens" ON public.student_fcm_tokens;
CREATE POLICY "Students can delete own FCM tokens"
ON public.student_fcm_tokens FOR DELETE
USING (student_id = public.user_profile_id());

-- FCM Notification Delivery Log Table
CREATE TABLE IF NOT EXISTS public.fcm_notifications_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  fcm_token TEXT,
  notification_type TEXT DEFAULT 'new_assignment',
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT fcm_notifications_assignment_student_unique UNIQUE(assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_fcm_notifications_log_assignment ON public.fcm_notifications_log(assignment_id);
CREATE INDEX IF NOT EXISTS idx_fcm_notifications_log_student ON public.fcm_notifications_log(student_id);

ALTER TABLE public.fcm_notifications_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professors can view FCM logs" ON public.fcm_notifications_log;
CREATE POLICY "Professors can view FCM logs" ON public.fcm_notifications_log FOR SELECT
USING (auth.role() = 'authenticated');
