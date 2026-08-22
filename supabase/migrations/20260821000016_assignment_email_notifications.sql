-- Migration: Create assignment_notifications table for tracking email notifications sent to students

CREATE TABLE IF NOT EXISTS public.assignment_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT assignment_notifications_assignment_student_unique UNIQUE(assignment_id, student_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.assignment_notifications ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone authenticated can read notification status if they are the professor who created the assignment
DROP POLICY IF EXISTS "Professors can view notifications for their assignments" ON public.assignment_notifications;
CREATE POLICY "Professors can view notifications for their assignments"
ON public.assignment_notifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.assignments
    WHERE assignments.id = assignment_notifications.assignment_id
      AND assignments.created_by = public.user_profile_id()
  )
);

-- Policy 2: Students can view their own assignment notification logs
DROP POLICY IF EXISTS "Students can view own notifications log" ON public.assignment_notifications;
CREATE POLICY "Students can view own notifications log"
ON public.assignment_notifications
FOR SELECT
USING (
  student_id = public.user_profile_id()
);
