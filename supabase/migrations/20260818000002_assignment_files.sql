-- Migration: Add assignment_file_path to assignments, create assignments storage bucket

-- Add assignment_file_path column to assignments table
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS assignment_file_path TEXT;

-- Create assignments storage bucket (private, max 50MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assignments',
  'assignments',
  false,
  52428800,
  ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Professors can upload assignment files
CREATE POLICY "Professors can upload assignment files" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'assignments' AND
  auth.role() = 'authenticated' AND
  (SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()) = 'professor'
);

-- Storage RLS: Professors can update assignment files
CREATE POLICY "Professors can update own assignment files" ON storage.objects FOR UPDATE USING (
  bucket_id = 'assignments' AND
  auth.role() = 'authenticated' AND
  (SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()) = 'professor'
);

-- Storage RLS: Professors can delete assignment files
CREATE POLICY "Professors can delete own assignment files" ON storage.objects FOR DELETE USING (
  bucket_id = 'assignments' AND
  auth.role() = 'authenticated' AND
  (SELECT role FROM public.profiles WHERE auth_user_id = auth.uid()) = 'professor'
);

-- Storage RLS: Authenticated users can read assignment files (for students)
CREATE POLICY "Authenticated users can read assignment files" ON storage.objects FOR SELECT USING (
  bucket_id = 'assignments' AND
  auth.role() = 'authenticated'
);
