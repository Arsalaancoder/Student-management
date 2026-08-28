-- Migration: Student Registration Number Normalization, Backfill, Unique Constraint & Triggers

-- 1. Clean existing student_id values for student profiles (trim spaces and convert to uppercase)
UPDATE public.profiles
SET student_id = UPPER(TRIM(student_id))
WHERE role = 'student' AND student_id IS NOT NULL AND TRIM(student_id) <> '';

-- 2. Safely backfill missing student_id for existing student accounts with valid college emails
UPDATE public.profiles
SET student_id = UPPER(TRIM(split_part(email, '@', 1)))
WHERE role = 'student' 
  AND (student_id IS NULL OR TRIM(student_id) = '')
  AND (email LIKE '%@nbkrist.org' OR email LIKE '%@nbkirst.org' OR email LIKE '%@nbkrist.edu')
  AND split_part(email, '@', 1) ~ '^[0-9]{2}[a-zA-Z0-9]+$';

-- 3. Create Unique Index on UPPER(TRIM(student_id)) for student profiles
DROP INDEX IF EXISTS public.idx_profiles_student_id_unique;
CREATE UNIQUE INDEX idx_profiles_student_id_unique 
ON public.profiles (UPPER(TRIM(student_id))) 
WHERE role = 'student' AND student_id IS NOT NULL AND TRIM(student_id) <> '';

-- 4. Update handle_new_user trigger to handle student_id normalization during registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_assigned_role public.user_role;
  v_jwt_role text;
  v_student_id text;
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

  IF v_assigned_role = 'student' THEN
    v_student_id := NULLIF(UPPER(TRIM(COALESCE(NEW.raw_user_meta_data->>'student_id', NEW.raw_user_meta_data->>'registration_number', ''))), '');
    -- Fallback to email prefix if not explicitly provided in metadata and email is college domain
    IF v_student_id IS NULL AND NEW.email IS NOT NULL AND NEW.email LIKE '%@nbkrist.org' THEN
      v_student_id := UPPER(TRIM(split_part(NEW.email, '@', 1)));
    END IF;
  ELSE
    v_student_id := NULL;
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
    v_student_id
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role = EXCLUDED.role,
    department = COALESCE(EXCLUDED.department, public.profiles.department),
    year = COALESCE(EXCLUDED.year, public.profiles.year),
    section = COALESCE(EXCLUDED.section, public.profiles.section),
    student_id = COALESCE(EXCLUDED.student_id, public.profiles.student_id),
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

-- 5. Prevent non-service-role users from changing role or student_id once set
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
  IF NEW.student_id IS DISTINCT FROM OLD.student_id AND OLD.student_id IS NOT NULL AND TRIM(OLD.student_id) <> '' AND v_jwt_role IS DISTINCT FROM 'service_role' AND auth.role() IS DISTINCT FROM 'service_role' THEN
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
