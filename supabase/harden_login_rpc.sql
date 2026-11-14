-- =============================================================================
--  تحقّق كلمة المرور عبر دالة على السيرفر (بدل قراءة بصمة الباسورد بالمفتاح العام)
-- =============================================================================
--
-- المشكلة:
--   التطبيق بيتحقق من كلمة المرور على العميل، فمحتاج يقرأ عمود `password`.
--   المفتاح publishable موجود في ملف الـJS للجميع، وبالتالي أي حد عنده
--   الرابط يقدر (لو الصلاحية مفتوحة) ينزّل كل البصمات ويعمل عليها هجوم
--   قاموس offline. بصمة sha256 بـ10000 تكرار أسرع بكتير من bcrypt/argon2.
--
-- الحل:
--   دالة `security definer` بتقارن الباسورد جوه قاعدة البيانات وترجّع
--   نتيجة true/false بس — البصمة نفسها ما بتخرجش أبدًا للعميل.
--
-- التنفيذ:  Supabase Dashboard → SQL Editor → الصق الملف كامل → Run
-- =============================================================================

create extension if not exists pgcrypto;

create or replace function public.verify_user_credentials(
  p_username text,
  p_password text
)
returns table (
  user_id text,
  matched boolean,
  needs_upgrade boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u record;
  parts text[];
  iters integer;
  salt bytea;
  stored_hash text;
  computed bytea;
  i integer;
  ident text;
begin
  ident := lower(regexp_replace(coalesce(trim(p_username), ''), '\s+', '', 'g'));
  if ident = '' then
    return query select null::text, false, false;
    return;
  end if;

  select * into u
    from public.users
   where lower(regexp_replace(coalesce(username, ''), '\s+', '', 'g')) = ident
      or lower(trim(coalesce(email, ''))) = ident
   limit 1;

  if not found then
    return query select null::text, false, false;
    return;
  end if;

  parts := string_to_array(regexp_replace(coalesce(u.password, ''), '\s+', '', 'g'), '$');

  if array_length(parts, 1) = 4 and parts[1] = 'sha256' then
    iters := greatest(1, least(coalesce(parts[2]::integer, 10000), 200000));
    salt := decode(parts[3], 'base64');
    stored_hash := parts[4];

    computed := digest(salt || ':'::bytea || convert_to(coalesce(p_password, ''), 'UTF8'), 'sha256');
    for i in 2..iters loop
      computed := digest(computed, 'sha256');
    end loop;

    return query
      select u.id::text,
             (encode(computed, 'base64') = stored_hash),
             false;
    return;
  end if;

  -- صفوف قديمة بكلمة سر نص صريح — نقارنها مرة واحدة وبعدين تتحدّث من التطبيق.
  return query
    select u.id::text,
           (coalesce(u.password, '') = coalesce(p_password, '')),
           true;
  return;
end;
$$;

grant execute on function public.verify_user_credentials(text, text) to anon, authenticated;

comment on function public.verify_user_credentials(text, text) is
  'يتحقق من كلمة مرور المستخدم داخل قاعدة البيانات ولا يرجّع البصمة أبدًا.';

-- =============================================================================
--  (اختياري — نفّذه بعد ما تتأكد إن نشر التطبيق اللي بيستخدم الدالة خلص)
--
--  بعد كده البصمات مش هتكون قابلة للقراءة بالمفتاح العام:
--
--    revoke select (password) on public.users from anon, authenticated;
--    revoke select (password) on public.app_users from anon, authenticated;
--
--  التطبيق هيستخدم الدالة أولاً، ولو مش موجودة بيرجع للقراءة المباشرة.
-- =============================================================================
