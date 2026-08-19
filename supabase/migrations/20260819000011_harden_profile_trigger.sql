-- Migration: Harden handle_new_user trigger and profiles creation

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
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
    COALESCE(
      CASE 
        WHEN LOWER(NEW.raw_user_meta_data->>'role') = 'professor' THEN 'professor'::public.user_role
        WHEN LOWER(NEW.raw_user_meta_data->>'role') = 'student' THEN 'student'::public.user_role
        ELSE NULL
      END,
      'student'::public.user_role
    ),
    CASE 
      WHEN LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'student')) = 'student' THEN NULLIF(NEW.raw_user_meta_data->>'department', '')
      ELSE NULL 
    END,
    CASE 
      WHEN LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'student')) = 'student' AND NEW.raw_user_meta_data->>'year' IS NOT NULL AND NEW.raw_user_meta_data->>'year' <> ''
      THEN (NEW.raw_user_meta_data->>'year')::INTEGER 
      ELSE NULL 
    END,
    CASE 
      WHEN LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'student')) = 'student' THEN NULLIF(NEW.raw_user_meta_data->>'section', '')
      ELSE NULL 
    END,
    NULLIF(NEW.raw_user_meta_data->>'student_id', '')
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role = COALESCE(EXCLUDED.role, public.profiles.role),
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
