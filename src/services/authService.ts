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
 * ترجع rpcMissing=true لو الدالة لسه ما اتنفذتش على القاعدة (لرسالة واضحة).
 */
export async function resolveLoginEmail(
  identifier: string
): Promise<{ email: string | null; rpcMissing: boolean }> {
  const raw = (identifier || '').trim();
  if (!raw) return { email: null, rpcMissing: false };
  if (raw.includes('@')) return { email: raw.toLowerCase(), rpcMissing: false };

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
