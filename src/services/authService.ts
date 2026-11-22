import type { Session } from '@supabase/supabase-js';
import type { User } from '../types';
import { supabase } from './supabaseService';

/**
 * المصادقة المركزية — Supabase Auth فقط.
 *
 * القرار الأمني (P0):
 *   - العميل لا يقرأ عمود `password` ولا يقارن أي بصمة. التحقق كله على السيرفر.
 *   - مفيش أوضاع legacy/hybrid بعد اليوم: أي مسار بيرجع لتحقق محلي اتشال،
 *     لأن أي تحقق في المتصفح قابل للتجاوز بـ DevTools.
 *   - اسم المستخدم (بدون @) بيتحوّل لإيميل عبر دالة RPC مقيدة
 *     `lookup_login_email` (ترجع الإيميل فقط، ولا ترجع أي بيانات سرية)،
 *     وبعدها signInWithPassword.
 *
 * المتطلبات على قاعدة البيانات: نفّذ `supabase/p0_auth_lockdown.sql`.
 */

export type ServerAuthOutcome =
  | { kind: 'success'; authUserId: string; email: string | null }
  | { kind: 'wrong-credentials' }
  | { kind: 'no-server-account' }
  | { kind: 'unavailable'; reason?: string };

/** الوضع الوحيد المتاح. مُبقى للتوافق مع واجهات الإعدادات القديمة. */
export type AuthMode = 'server';

export function getAuthMode(): AuthMode {
  return 'server';
}

export function isServerAuthEnabled(): boolean {
  return true;
}

function isConfigured(): boolean {
  try {
    return Boolean(supabase.auth);
  } catch {
    return false;
  }
}

/**
 * يحوّل اسم المستخدم/الهاتف/الاسم لإيميل تسجيل الدخول عبر RPC.
 * مع كاش محلي (7 أيام) لتسريع الدخول المتكرر.
 * ترجع rpcMissing=true لو الدالة لسه ما اتنفذتش على القاعدة (لرسالة واضحة).
 */
const LOGIN_EMAIL_CACHE_KEY = 'tantawy_login_email_cache_v1';
const LOGIN_EMAIL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 أيام

export async function resolveLoginEmail(
  identifier: string
): Promise<{ email: string | null; rpcMissing: boolean }> {
  const raw = (identifier || '').trim();
  if (!raw) return { email: null, rpcMissing: false };
  if (raw.includes('@')) return { email: raw.toLowerCase(), rpcMissing: false };

  // --- Fast path: localStorage cache ---
  try {
    const cached = localStorage.getItem(LOGIN_EMAIL_CACHE_KEY);
    if (cached) {
      const { map, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < LOGIN_EMAIL_CACHE_TTL && map[raw]) {
        return { email: map[raw], rpcMissing: false };
      }
    }
  } catch {}

  try {
    const { data, error } = await supabase.rpc('lookup_login_email', { p_identifier: raw });
    if (error) {
      const status = Number((error as any)?.status || 0);
      const code = String((error as any)?.code || '');
      const rpcMissing =
        status === 404 || code === 'PGRST202' || /could not find the function/i.test(error.message || '');
      if (rpcMissing) {
        console.warn('[auth] lookup_login_email is missing — run supabase/p0_auth_lockdown.sql');
      }
      return { email: null, rpcMissing };
    }

    const first = Array.isArray(data) ? data[0] : data;
    const emailValue = typeof first === 'string' ? first : first?.email;
    const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : '';

    // --- Update cache ---
    if (email) {
      try {
        const cached = localStorage.getItem(LOGIN_EMAIL_CACHE_KEY);
        const map = cached ? JSON.parse(cached).map : {};
        map[raw] = email;
        localStorage.setItem(LOGIN_EMAIL_CACHE_KEY, JSON.stringify({ map, timestamp: Date.now() }));
      } catch {}
    }

    return { email: email || null, rpcMissing: false };
  } catch {
    return { email: null, rpcMissing: false };
  }
}

/**
 * تسجيل الدخول عبر Supabase Auth. لا يوجد أي fallback محلي:
 * لو السيرفر مش متاح، الدخول بيتوقف بدل ما يتحول لتحقق قابل للتجاوز.
 */
export async function tryServerSignIn(
  identifier: string,
  password: string
): Promise<ServerAuthOutcome> {
  if (!isConfigured()) return { kind: 'unavailable', reason: 'client-not-configured' };
  if (!identifier.trim() || !password) return { kind: 'wrong-credentials' };

  const { email, rpcMissing } = await resolveLoginEmail(identifier);
  if (rpcMissing) return { kind: 'unavailable', reason: 'lookup-rpc-missing' };
  if (!email) return { kind: 'no-server-account' };

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      const status = Number((error as any)?.status || 0);
      // Supabase لا يقول صراحةً إن الحساب غير موجود (منع تعداد الحسابات):
      // invalid login credentials قد تعني حساب Auth غير منشأ أو كلمة مرور خاطئة.
      if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
        return { kind: 'no-server-account' };
      }
      if (status === 0 || status >= 500) return { kind: 'unavailable', reason: error.message };
      if (msg.includes('invalid login credentials')) return { kind: 'wrong-credentials' };
      return { kind: 'unavailable', reason: error.message };
    }

    const authUser = data?.user || null;
    if (!authUser) return { kind: 'unavailable', reason: 'no-user-in-response' };

    return { kind: 'success', authUserId: authUser.id, email: authUser.email || email };
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * يقرأ ملف الموظف الخاص بالجلسة الحالية عبر دالة security definer.
 *
 * ليه RPC وليس select عادي؟ لأن أول دخول قبل ربط `auth_user_id` بيخلي
 * سياسة "self select" ترجع صفر صفوف، فيبدو كأن الحساب غير موجود
 * (وده كان هيكسر الدخول لحظة تفعيل RLS). الدالة بترجع صف صاحب الجلسة فقط
 * بأعمدة غير حساسة، من غير أي اعتماد على سياسات الصفوف.
 */
export async function fetchMyProfile(): Promise<User | null> {
  try {
    const { data, error } = await supabase.rpc('get_my_profile');
    if (error) return null;
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      username: row.username,
      email: row.email,
      role: row.role,
      branchName: row.branch_name,
      sector: row.sector,
      supervisorId: row.supervisor_id,
      phone: row.phone,
      commissionRate: row.commission_rate,
      isActive: row.is_active,
      approvalStatus: row.approval_status,
      auth_user_id: row.auth_user_id,
    } as User;
  } catch {
    return null;
  }
}

export async function getServerSessionAsync(): Promise<Session | null> {
  try {
    if (!isConfigured()) return null;
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  } catch {
    return null;
  }
}

export async function signOutServer(): Promise<void> {
  try {
    if (!isConfigured()) return;
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('Server sign-out notice:', e);
  }
}

/**
 * يربط صف المستخدم بـ auth uid بتاعه. كله على السيرفر بسياسة
 * "self link" (auth_user_id IS NULL) — العميل لا يغيّر إلا صفّه هو.
 */
export async function linkAuthUserToProfile(authUserId: string, email: string): Promise<boolean> {
  try {
    // لا نرسل أي تحديث إلا لو الـuid ده فعلاً بتاع الجلسة الحالية.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user?.id !== authUserId) return false;

    const { error } = await supabase
      .from('users')
      .update({ auth_user_id: authUserId, auth_email: email.toLowerCase() })
      .eq('email', email.toLowerCase());
    if (error) {
      console.warn('Could not link auth uid to profile:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Could not link auth uid to profile:', e);
    return false;
  }
}

/** إنشاء مستخدم كامل (Auth + users) من التطبيق — للإدارة/المطور فقط. */
export interface CreateUserPayload {
  name: string;
  username: string;
  email: string;
  password: string;
  phone?: string;
  branchName?: string;
  role?: string;
  sector?: 'home' | 'electrical';
  supervisorId?: string;
}

export async function createFullUser(
  payload: CreateUserPayload
): Promise<{ success: boolean; message: string; user?: any }> {
  try {
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: payload,
    });
    if (error) return { success: false, message: error.message || 'فشل إنشاء المستخدم' };
    if (data?.error) return { success: false, message: data.error };
    return { success: true, message: 'تم إنشاء المستخدم بنجاح', user: data };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * تغيير كلمة مرور الحساب الحالي مباشرة من داخل التطبيق بدون إرسال أي بريد إلكتروني.
 * يتحقق من كلمة المرور الحالية أولاً ثم يحدّث كلمة المرور عبر جلسة Supabase Auth النشطة.
 */
export async function changeOwnPassword(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string }> {
  if (!isConfigured()) {
    return { success: false, message: 'الاتصال بالخادم غير مهيأ.' };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, message: 'يلزم الاتصال بالإنترنت لتحديث كلمة المرور.' };
  }

  const currentPass = (params.currentPassword || '').trim();
  const nextPass = (params.newPassword || '').trim();

  if (!currentPass) {
    return { success: false, message: 'يرجى إدخال كلمة المرور الحالية أولاً.' };
  }
  if (nextPass.length < 6) {
    return { success: false, message: 'كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف.' };
  }
  if (currentPass === nextPass) {
    return { success: false, message: 'كلمة المرور الجديدة مطابقة للحالية، اختر كلمة مرور مختلفة.' };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionEmail = sessionData?.session?.user?.email?.trim().toLowerCase();
    if (!sessionData?.session || !sessionEmail) {
      return { success: false, message: 'لا توجد جلسة دخول نشطة. سجّل الدخول أولاً.' };
    }

    // التحقق من كلمة المرور الحالية وتنشيط الجلسة قبل التحديث
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: sessionEmail,
      password: currentPass,
    });
    if (verifyErr) {
      const msg = (verifyErr.message || '').toLowerCase();
      if (msg.includes('invalid login credentials')) {
        return { success: false, message: 'كلمة المرور الحالية غير صحيحة.' };
      }
      return { success: false, message: verifyErr.message || 'تعذر التحقق من كلمة المرور الحالية.' };
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: nextPass,
    });
    if (updateErr) {
      return { success: false, message: updateErr.message || 'تعذر تحديث كلمة المرور.' };
    }

    return {
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح دون الحاجة لأي بريد إلكتروني — يمكنك الدخول بها فوراً.',
    };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'حدث خطأ غير متوقع.' };
  }
}

export const ADMIN_PASSWORD_RESET_SQL_SNIPPET = `CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_target_user_id text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_temp
AS $$
DECLARE
  v_caller_uid uuid := auth.uid();
  v_caller_role text;
  v_caller_active boolean;
  v_caller_status text;
  v_clean_password text := trim(COALESCE(p_new_password, ''));
  v_target_row public.users%ROWTYPE;
  v_target_auth_id uuid;
  v_target_email text;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً.';
  END IF;

  SELECT u.role, COALESCE(u.is_active, true), COALESCE(u.approval_status, 'active')
    INTO v_caller_role, v_caller_active, v_caller_status
    FROM public.users u WHERE u.auth_user_id = v_caller_uid LIMIT 1;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'developer') OR NOT v_caller_active OR v_caller_status <> 'active' THEN
    RAISE EXCEPTION 'غير مصرح: مقتصرة على الإدارة والمطور فقط.';
  END IF;

  IF length(v_clean_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن لا تقل عن 6 أحرف.';
  END IF;

  SELECT * INTO v_target_row FROM public.users u WHERE u.id = p_target_user_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'الموظف غير موجود.'; END IF;

  v_target_auth_id := v_target_row.auth_user_id;
  v_target_email := lower(trim(COALESCE(NULLIF(v_target_row.auth_email, ''), v_target_row.email, '')));

  IF v_target_auth_id IS NULL AND v_target_email <> '' THEN
    SELECT au.id INTO v_target_auth_id FROM auth.users au WHERE lower(trim(au.email)) = v_target_email LIMIT 1;
    IF v_target_auth_id IS NOT NULL THEN
      UPDATE public.users SET auth_user_id = v_target_auth_id, auth_email = v_target_email WHERE id = v_target_row.id;
    END IF;
  END IF;

  IF v_target_auth_id IS NULL THEN RAISE EXCEPTION 'الحساب غير مربوط بـ Auth بعد.'; END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(v_clean_password, gen_salt('bf')),
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         updated_at = now()
   WHERE id = v_target_auth_id;

  RETURN jsonb_build_object('success', true, 'user_id', v_target_row.id, 'email', v_target_email);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_user_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(text, text) TO authenticated;`;

/**
 * تعيين / تغيير كلمة مرور أي موظف بواسطة الإدارة مباشرة من التطبيق بدون إيميل.
 * - يستدعي دالة RPC المحمية بصلاحية admin/developer على السيرفر.
 * - وإذا لم تكن الدالة مضافة بعد وكان الآدمن يعدّل حسابه الحالي نفسه، يحدّث عبر الجلسة النشطة فوراً.
 */
export async function adminResetUserPassword(params: {
  targetUserId: string;
  targetEmail?: string;
  targetAuthUserId?: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string; rpcMissing?: boolean }> {
  if (!isConfigured()) {
    return { success: false, message: 'الاتصال بالخادم غير مهيأ.' };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, message: 'يلزم الاتصال بالإنترنت لتعيين كلمة المرور.' };
  }

  const nextPass = (params.newPassword || '').trim();
  if (nextPass.length < 6) {
    return { success: false, message: 'كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف.' };
  }

  try {
    const { error } = await supabase.rpc('admin_reset_user_password', {
      p_target_user_id: params.targetUserId,
      p_new_password: nextPass,
    });

    if (!error) {
      return {
        success: true,
        message: 'تم تعيين كلمة المرور الجديدة بنجاح بدون أي بريد إلكتروني — جاهزة للدخول فوراً.',
      };
    }

    const status = Number((error as any)?.status || 0);
    const code = String((error as any)?.code || '');
    const rpcMissing =
      status === 404 ||
      code === 'PGRST202' ||
      /could not find the function/i.test(error.message || '');

    if (rpcMissing) {
      // لو الآدمن بيغيّر كلمة مرور حسابه الحالي المسجّل بالجلسة دلوقتي، يقدر يحدّثها مباشرة بدون RPC
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData?.session?.user;
      const isSelf =
        Boolean(sessionUser) &&
        ((params.targetAuthUserId && sessionUser?.id === params.targetAuthUserId) ||
          (params.targetEmail && sessionUser?.email?.toLowerCase() === params.targetEmail.trim().toLowerCase()));

      if (isSelf) {
        const { error: selfErr } = await supabase.auth.updateUser({ password: nextPass });
        if (!selfErr) {
          return {
            success: true,
            message: 'تم تغيير كلمة مرور حسابك بنجاح بدون إيميل — يمكنك الدخول بها فوراً.',
          };
        }
        return { success: false, message: selfErr.message || 'تعذر تحديث كلمة المرور.' };
      }

      return {
        success: false,
        rpcMissing: true,
        message: 'ميزة تغيير كلمة مرور الموظفين الآخرين من التطبيق تحتاج تشغيل كود التفعيل (SQL) لمرة واحدة فقط في Supabase.',
      };
    }

    return { success: false, message: error.message || 'تعذر تغيير كلمة المرور.' };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'حدث خطأ أثناء تغيير كلمة المرور.' };
  }
}

