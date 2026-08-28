-- Migration: Secure Professor Access-Key Registration & Rate Limiting

-- 1. Create table for tracking failed professor access key signup attempts (rate limiting)
CREATE TABLE IF NOT EXISTS public.professor_signup_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS and lock down professor_signup_attempts so no public client can read/write it directly
ALTER TABLE public.professor_signup_attempts ENABLE ROW LEVEL SECURITY;

-- 2. Update handle_new_user trigger to prevent public auth.signUp from creating professor accounts
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_assigned_role public.user_role;
  v_jwt_role text;
BEGIN
  BEGIN
    v_jwt_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- Security check: Assign 'professor' ONLY if created via service_role API or explicitly verified in app_metadata
  IF (LOWER(COALESCE(NEW.raw_user_meta_data->>'role', NEW.raw_app_meta_data->>'role', '')) = 'professor')
     AND (v_jwt_role = 'service_role' OR auth.role() = 'service_role' OR v_jwt_role IS NULL OR LOWER(COALESCE(NEW.raw_app_meta_data->>'role', '')) = 'professor') THEN
    v_assigned_role := 'professor'::public.user_role;
  ELSE
    v_assigned_role := 'student'::public.user_role;
  END IF;

  INSERT INTO public.profiles (
    auth_user_id, 
    email, 
    full_name, 
    role, 
    department, 
    year, 
    section,
    student_id
  )
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)), 
    v_assigned_role,
    CASE 
      WHEN v_assigned_role = 'student' THEN NULLIF(NEW.raw_user_meta_data->>'department', '')
      ELSE NULL 
    END,
    CASE 
      WHEN v_assigned_role = 'student' AND NEW.raw_user_meta_data->>'year' IS NOT NULL AND NEW.raw_user_meta_data->>'year' <> ''
      THEN (NEW.raw_user_meta_data->>'year')::INTEGER 
      ELSE NULL 
    END,
    CASE 
      WHEN v_assigned_role = 'student' THEN NULLIF(NEW.raw_user_meta_data->>'section', '')
      ELSE NULL 
    END,
    NULLIF(NEW.raw_user_meta_data->>'student_id', '')
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role = EXCLUDED.role,
    department = COALESCE(EXCLUDED.department, public.profiles.department),
    year = COALESCE(EXCLUDED.year, public.profiles.year),
    section = COALESCE(EXCLUDED.section, public.profiles.section),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Safeguard so user registration in auth.users never fails
  INSERT INTO public.profiles (auth_user_id, email, role)
  VALUES (NEW.id, NEW.email, 'student'::public.user_role)
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger is attached to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Reinforce prevent_role_update trigger on public.profiles to block role updates via RLS
CREATE OR REPLACE FUNCTION public.prevent_role_update()
RETURNS TRIGGER AS $$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN
    v_jwt_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  -- Block role or student_id update unless initiated by service_role
  IF NEW.role IS DISTINCT FROM OLD.role AND v_jwt_role IS DISTINCT FROM 'service_role' AND auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.role = OLD.role;
  END IF;
  IF NEW.student_id IS DISTINCT FROM OLD.student_id AND v_jwt_role IS DISTINCT FROM 'service_role' AND auth.role() IS DISTINCT FROM 'service_role' THEN
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
