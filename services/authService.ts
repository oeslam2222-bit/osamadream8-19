import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseService';

/**
 * طبقة المصادقة المزدوجة — Supabase Auth فوق الوضع القديم.
 *
 * الوضع القديم بيقارن كلمة المرور في المتصفح (passwordService.verifyPassword)،
 * فأي حد يفتح DevTools يعدّل حالة React ويدخل من غير كلمة سر. Supabase Auth
 * بيحط التحقق على السيرفر، والسياسات (RLS) هي اللي بتقرر مين يشوف إيه.
 *
 * التحويل دلوقتي كان هيكسر النظام لو اتعمل مرة واحدة، لأن الـ 72 حساب
 * موجود في جدول users ببصمة sha256 (مش bcrypt اللي Supabase بيقبل)،
 * والأدوار والموافقة متخزنة في نفس الجدول، ومفيش RLS على customers/visits.
 *
 * فالحل تدرّجي ومش كاسر لشيء:
 *   legacy → سلوك النهارده بالظبط (افتراضي)
 *   hybrid → يجرّب Supabase Auth الأول، لو مش متاح يرجع للقديم تلقائياً
 *   server → Supabase Auth بس
 *
 * جدول users يفضل المصدر الوحيد للأدوار والموافقة والفرع — Supabase Auth
 * واقف مكان التحقق من كلمة المرور بس، وده اللي يخلّي الانتقال تدريجي.
 */

export type ServerAuthOutcome =
  | { kind: 'success'; authUserId: string; email: string | null }
  | { kind: 'wrong-credentials' }
  | { kind: 'no-server-account' }
  | { kind: 'unavailable'; reason?: string };

export type AuthMode = 'legacy' | 'hybrid' | 'server';

export const AUTH_MODE_STORAGE_KEY = 'dream_dist_auth_mode_v1';

function readEnvMode(): AuthMode {
  const raw = (import.meta.env.VITE_AUTH_MODE || '').toString().trim().toLowerCase();
  if (raw === 'server' || raw === 'hybrid' || raw === 'legacy') return raw;
  return 'hybrid';
}

/**
 * الوضع الحالي. الافتراضي hybrid وده المقصود: قبل ما حد ينفّذ migration الـ SQL
 * في Supabase، كل النداءات بترجع unavailable والـ login بيشتغل زي ما هو بالظبط.
 */
export function getAuthMode(): AuthMode {
  try {
    const stored = window.localStorage.getItem(AUTH_MODE_STORAGE_KEY);
    if (stored === 'server' || stored === 'hybrid' || stored === 'legacy') return stored;
  } catch {}
  return readEnvMode();
}

export function setAuthMode(mode: AuthMode): void {
  try {
    window.localStorage.setItem(AUTH_MODE_STORAGE_KEY, mode);
  } catch {}
}

export function isServerAuthEnabled(): boolean {
  return getAuthMode() !== 'legacy';
}

function isConfigured(): boolean {
  try {
    return Boolean(supabase.auth);
  } catch {
    return false;
  }
}

/**
 * Supabase Auth ما بيقبلش تسجيل دخول باسم المستخدم، بس postal يوزرنيم
 * بنرجع له كـ unavailable والوضع القديم يكمّل شغله.
 */
function toAuthEmail(identifier: string): string | null {
  const raw = (identifier || '').trim();
  if (!raw) return null;
  return raw.includes('@') ? raw.toLowerCase() : null;
}

/**
 * محاولة تسجيل الدخول عبر Supabase Auth.
 *
 * الدالة ما بترميش استثناء أبداً وما بتوقفش الـ login. أي مشكلة (شبكة،
 * إعدادات ناقصة، حساب مش موجود) بترجع unavailable أو no-server-account
 * والتطبيق بيرجع للطريقة القديمة.
 */
export async function tryServerSignIn(identifier: string, password: string): Promise<ServerAuthOutcome> {
  if (getAuthMode() === 'legacy') return { kind: 'unavailable', reason: 'legacy-mode' };
  if (!isConfigured()) return { kind: 'unavailable', reason: 'client-not-configured' };

  const email = toAuthEmail(identifier);
  if (!email) return { kind: 'unavailable', reason: 'identifier-not-an-email' };
  if (!password) return { kind: 'unavailable', reason: 'empty-password' };

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      const notFound =
        msg.includes('invalid login credentials') ||
        msg.includes('user not found') ||
        msg.includes('does not exist');
      // مهم: بنرجع unavailable مش wrong-credentials. الحساب ممكن يكون
      // كلمة مروره صح في جدول users (الوضع القديم) وما يكونش أصلاً
      // في Supabase Auth — والرجوع لـ wrong-credentials كان هيقفل
      // الدخول على المندوب بالكامل.
      return notFound ? { kind: 'no-server-account' } : { kind: 'unavailable', reason: error.message };
    }

    const authUser = data?.user || null;
    if (!authUser) return { kind: 'unavailable', reason: 'no-user-in-response' };

    return { kind: 'success', authUserId: authUser.id, email: authUser.email || email };
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof Error ? e.message : String(e) };
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

/**
 * تسجيل الخروج من السيرفر. لو Supabase Auth مش متاح، الـ logout القديم في
 * AppContext بيكمل شغله فمفيش خسارة.
 */
export async function signOutServer(): Promise<void> {
  try {
    if (!isConfigured()) return;
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('Server sign-out notice:', e);
  }
}

/**
 * ربط صف الـ user بـ auth uid بتاعه عشان الـ RLS يربط auth.uid()
 * بالصف الصح. بيرجع false بهدوء لو العمود لسه مش موجود (قبل الـ migration).
 */
export async function linkAuthUserToProfile(authUserId: string, email: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ auth_user_id: authUserId, auth_email: email.toLowerCase() })
      .eq('email', email.toLowerCase());
    if (error) {
      console.warn('Could not link auth uid to profile:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Could not link auth uid to profile:', e);
    return false;
  }
}