-- Removes readable passwords from the database and stops the public anon key from
-- being able to read the credential column at all.
--
-- Run ONCE in the Supabase SQL Editor, AFTER deploying the client that ships
-- src/services/passwordService.ts. Take a backup first (Table Editor -> users).
--
-- Why this is safe with the current client:
--   * Login verifies a salted digest that is also stored on the device, so it
--     keeps working with no network.
--   * Legacy plaintext rows are migrated here in one pass, so nobody has to log
--     in first for the leak to stop.
--
-- Digest format (must match src/services/passwordService.ts):
--   sha256$<iterations>$<salt base64>$<hash base64>
-- where the hash is base64( SHA-256 iterated <iterations> times over
-- (salt || ':' || utf8(password)) ). 10000 iterations, 16-byte random salt.
--
-- ORDER MATTERS: run this AFTER production-hardening.sql.

-- ---------------------------------------------------------------------------
-- 1. Make sure pgcrypto is available for digest()/gen_random_bytes().
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 2. Back up the current credentials so a bad run can be rolled back.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password'
  ) THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.users_password_backup AS
             SELECT id, password, created_at FROM public.users';
    RAISE NOTICE 'users_password_backup is up to date';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Convert every plaintext credential into a salted digest.
--    Already-migrated rows (sha256$...) are left untouched.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  row_record RECORD;
  new_salt TEXT;
  new_digest BYTEA;
  digest_text TEXT;
  iteration_no INT := 10000;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password'
  ) THEN
    RAISE NOTICE 'public.users has no password column - nothing to migrate';
    RETURN;
  END IF;

  FOR row_record IN
    SELECT id, password FROM public.users
    WHERE password IS NOT NULL
      AND trim(password) <> ''
      AND password NOT LIKE 'sha256$%'
  LOOP
    new_salt := encode(gen_random_bytes(16), 'base64');
    -- The digest must run over the RAW salt bytes, not over its base64 text:
    -- that is what src/services/passwordService.ts feeds into SHA-256.
    new_digest := digest(decode(new_salt, 'base64') || convert_to(':', 'UTF8')
                         || convert_to(row_record.password, 'UTF8'), 'sha256');
    FOR i IN 2..iteration_no LOOP
      new_digest := digest(new_digest, 'sha256');
    END LOOP;
    digest_text := 'sha256$' || iteration_no || '$' || new_salt || '$' || encode(new_digest, 'base64');

    UPDATE public.users SET password = digest_text WHERE id = row_record.id;
  END LOOP;

  RAISE NOTICE 'Migrated plaintext credentials to salted digests';
END $$;

-- ---------------------------------------------------------------------------
-- 4. Stop the public anon key from reading the credential column.
--    The app still lists users (names, roles, branches) and still logs in from
--    the device copy, but a leaked anon key can no longer harvest credentials.
--    Note: PostgREST "select=*" will now fail, which is the point - the client
--    already fetches an explicit column list.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.users FROM anon';
    EXECUTE 'REVOKE ALL ON public.app_users FROM anon';
    EXECUTE 'GRANT SELECT (id, name, username, email, role, branch_name, supervisor_id,
                          phone, commission_rate, is_active, approval_status, created_at)
              ON public.users TO anon';
    RAISE NOTICE 'anon can no longer read users.password';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Optional hardening: only reach these two tables from a trusted network.
--    Uncomment to lock writes behind the service_role key. After this, the app
--    can read but not push, and every write must go through the dashboard or
--    the service_role key. Test carefully before enabling in production.
-- ---------------------------------------------------------------------------
-- ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY users_no_anon_write ON public.users
--   FOR INSERT TO anon WITH CHECK (false);
-- CREATE POLICY users_no_anon_update ON public.users
--   FOR UPDATE TO anon USING (false) WITH CHECK (false);
-- CREATE POLICY users_no_anon_delete ON public.users
--   FOR DELETE TO anon USING (false);

-- ---------------------------------------------------------------------------
-- 6. Verification queries (read-only, safe to run any time):
-- ---------------------------------------------------------------------------
-- SELECT count(*) FILTER (WHERE password LIKE 'sha256$%')  AS hashed,
--        count(*) FILTER (WHERE password IS NULL OR trim(password) = '') AS empty,
--        count(*) FILTER (WHERE password NOT LIKE 'sha256$%' AND coalesce(trim(password),'') <> '') AS still_plain
--   FROM public.users;
-- Expect: hashed > 0, still_plain = 0.
--
-- After deploying the new client, every user should also be migrated on first
-- login, so this count only grows.