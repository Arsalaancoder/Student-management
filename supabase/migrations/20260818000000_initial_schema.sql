-- 1. Custom Types
CREATE TYPE public.user_role AS ENUM ('student', 'professor');

-- 2. Tables
CREATE TABLE public.profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name TEXT,
  email TEXT,
  student_id TEXT,
  role public.user_role NOT NULL DEFAULT 'student',
  department TEXT,
  year INTEGER,
  section TEXT,
  profile_photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.subjects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  professor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(student_id, subject_id)
);

CREATE TABLE public.assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  max_marks INTEGER,
  max_credits INTEGER,
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'submitted',
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  similarity_score DECIMAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(assignment_id, student_id)
);

CREATE TABLE public.submission_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.grades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE UNIQUE,
  professor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  marks DECIMAL,
  credits DECIMAL,
  feedback TEXT,
  graded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE,
  credits DECIMAL NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.plagiarism_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES public.submissions(id) ON DELETE CASCADE UNIQUE,
  similarity_percentage DECIMAL NOT NULL,
  status TEXT DEFAULT 'completed',
  report_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Enablement
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plagiarism_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Helper functions for RLS
CREATE OR REPLACE FUNCTION public.user_profile_id()
RETURNS UUID AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles Policies
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth_user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth_user_id = auth.uid());
-- Everyone can read professors for subject lookups
CREATE POLICY "Anyone can read professor profiles" ON public.profiles FOR SELECT USING (role = 'professor');

-- Subjects Policies
CREATE POLICY "Professors can manage own subjects" ON public.subjects FOR ALL USING (professor_id = public.user_profile_id());
CREATE POLICY "Anyone can read subjects" ON public.subjects FOR SELECT USING (auth.role() = 'authenticated');

-- Enrollments Policies
CREATE POLICY "Students can read own enrollments" ON public.enrollments FOR SELECT USING (student_id = public.user_profile_id());
CREATE POLICY "Professors can read enrollments for their subjects" ON public.enrollments FOR SELECT USING (
  subject_id IN (SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id())
);

-- Assignments Policies
CREATE POLICY "Professors can manage assignments for their subjects" ON public.assignments FOR ALL USING (
  subject_id IN (SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id())
);
CREATE POLICY "Students can read assignments for their enrolled subjects" ON public.assignments FOR SELECT USING (
  subject_id IN (SELECT subject_id FROM public.enrollments WHERE student_id = public.user_profile_id())
);

-- Submissions Policies
CREATE POLICY "Students can manage own submissions" ON public.submissions FOR ALL USING (student_id = public.user_profile_id());
CREATE POLICY "Professors can read submissions for their subjects" ON public.submissions FOR SELECT USING (
  assignment_id IN (SELECT id FROM public.assignments WHERE subject_id IN (SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id()))
);

-- Submission Versions Policies
CREATE POLICY "Students can manage own submission versions" ON public.submission_versions FOR ALL USING (
  submission_id IN (SELECT id FROM public.submissions WHERE student_id = public.user_profile_id())
);
CREATE POLICY "Professors can read submission versions for their subjects" ON public.submission_versions FOR SELECT USING (
  submission_id IN (SELECT id FROM public.submissions WHERE assignment_id IN (SELECT id FROM public.assignments WHERE subject_id IN (SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id())))
);

-- Grades Policies
CREATE POLICY "Students can read own grades" ON public.grades FOR SELECT USING (
  submission_id IN (SELECT id FROM public.submissions WHERE student_id = public.user_profile_id())
);
CREATE POLICY "Professors can manage grades for their subjects" ON public.grades FOR ALL USING (
  professor_id = public.user_profile_id() OR 
  submission_id IN (SELECT id FROM public.submissions WHERE assignment_id IN (SELECT id FROM public.assignments WHERE subject_id IN (SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id())))
);

-- Credit Transactions Policies
CREATE POLICY "Students can read own credits" ON public.credit_transactions FOR SELECT USING (student_id = public.user_profile_id());
CREATE POLICY "Professors can manage credits for their subjects" ON public.credit_transactions FOR ALL USING (
  submission_id IN (SELECT id FROM public.submissions WHERE assignment_id IN (SELECT id FROM public.assignments WHERE subject_id IN (SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id())))
);

-- Plagiarism Reports Policies
CREATE POLICY "Professors can read plagiarism reports for their subjects" ON public.plagiarism_reports FOR SELECT USING (
  submission_id IN (SELECT id FROM public.submissions WHERE assignment_id IN (SELECT id FROM public.assignments WHERE subject_id IN (SELECT id FROM public.subjects WHERE professor_id = public.user_profile_id())))
);
CREATE POLICY "Students can read own plagiarism reports" ON public.plagiarism_reports FOR SELECT USING (
  submission_id IN (SELECT id FROM public.submissions WHERE student_id = public.user_profile_id())
);

-- Notifications Policies
CREATE POLICY "Users can manage own notifications" ON public.notifications FOR ALL USING (user_id = public.user_profile_id());

-- Create Trigger for new users
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, email, full_name, role)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'student'));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger to update updated_at on assignments
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();
CREATE OR REPLACE TRIGGER set_assignments_updated_at BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();
CREATE OR REPLACE TRIGGER set_submissions_updated_at BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();
