CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_role text;
  profile_name text;
BEGIN
  profile_role := NEW.raw_user_meta_data ->> 'role';
  IF profile_role NOT IN ('passenger', 'driver') THEN
    profile_role := 'passenger';
  END IF;

  profile_name := NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), '');

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, profile_name, profile_role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'buddyride_handle_new_user'
      AND tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER buddyride_handle_new_user
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;