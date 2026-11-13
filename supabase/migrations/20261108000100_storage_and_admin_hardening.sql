-- 1. Delete all public tables
DO $$ DECLARE r RECORD; BEGIN
FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public') LOOP
EXECUTE 'DROP TABLE IF EXISTS public.'||quote_ident(r.tablename)||' CASCADE';
END LOOP;
END $$;

-- 2. Delete types
DROP TYPE IF EXISTS public.user_role CASCADE;
DROP TYPE IF EXISTS public.ride_status CASCADE;
DROP TYPE IF EXISTS public.verification_status CASCADE;

-- 3. Delete all storage files
DELETE FROM storage.objects WHERE bucket_id IN ('driver-documents','safety-selfies','profile-photos','passenger-photos','passenger-ids','vehicle-documents','avatars');