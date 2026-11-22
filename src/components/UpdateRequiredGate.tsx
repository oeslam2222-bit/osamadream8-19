import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  APP_VERSION,
  ENV_MIN_CLIENT_VERSION,
  OUTDATED_CLIENT_EVENT,
  isVersionOlder,
  type OutdatedClientDetail,
} from '../services/clientVersion';
import { supabase } from '../services/supabaseService';

/**
 * شاشة إجبارية عند اكتشاف نسخة قديمة أو صلاحية مرفوضة.
 *
 * بتحجب التطبيق بالكامل (مفيش Login ولا بيانات) عشان تمنع "الفشل الصامت":
 * النسخة القديمة بعد تفعيل RLS بترجع بيانات فاضية بدون خطأ، والمستخدم
 * بيفتكر إن مفيش عملاء. هنا بقى في رسالة واضحة وزر تحديث.
 */
export function UpdateRequiredGate({ children }: { children: React.ReactNode }) {
  const [block, setBlock] = useState<OutdatedClientDetail | null>(() =>
    isVersionOlder(APP_VERSION, ENV_MIN_CLIENT_VERSION)
      ? { current: APP_VERSION, required: ENV_MIN_CLIENT_VERSION, reason: 'version' }
      : null
  );
  const [checking, setChecking] = useState(false);

  // الحد الأدنى المنشور من القاعدة — best-effort: لو RPC مش موجود منكمل.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('required_client_version');
        if (cancelled || error) return;
        const required = typeof data === 'string' ? data : (data as any)?.required_client_version;
        const clean = typeof required === 'string' ? required.trim() : '';
        if (clean && isVersionOlder(APP_VERSION, clean)) {
          setBlock({ current: APP_VERSION, required: clean, reason: 'version' });
        }
      } catch {
        /* لا نعطّل التطبيق لو الفحص الإضافي فشل */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onOutdated = (event: Event) => {
      const detail = (event as CustomEvent<OutdatedClientDetail>).detail;
      if (!detail) return;
      setBlock((prev) => prev ?? detail);
    };
    window.addEventListener(OUTDATED_CLIENT_EVENT, onOutdated);
    return () => window.removeEventListener(OUTDATED_CLIENT_EVENT, onOutdated);
  }, []);

  const reload = useCallback(async () => {
    setChecking(true);
    try {
      // تحديث الـService Worker أولًا عشان إعادة التحميل تجيب أحدث حزمة.
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.update().catch(() => undefined)));
      }
    } catch {
      /* ignore */
    }
    window.location.reload();
  }, []);

  if (!block) return <>{children}</>;

  const isPermission = block.reason === 'permission';

  return (
    <div
      dir="rtl"
      className="min-h-[100dvh] bg-[#0f2b38] text-white flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-required-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-7 text-center shadow-2xl backdrop-blur">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-slate-950">
          {isPermission ? <ShieldAlert className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
        </div>

        <h1 id="update-required-title" className="text-xl font-bold">
          {isPermission ? 'الوصول للبيانات مرفوض' : 'نسخة التطبيق قديمة'}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {isPermission
            ? 'تم رفض قراءة البيانات من السيرفر. غالبًا النسخة المثبتة على جهازك أقدم من التحديث الأمني الأخير.'
            : 'تم إيقاف الوصول للبيانات لحماية الحسابات. حدّث التطبيق الآن قبل متابعة العمل.'}
        </p>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
          <div className="flex items-center justify-between gap-2">
            <span>نسختك الحالية</span>
            <span className="font-mono font-bold text-white">{block.current}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span>الحد الأدنى المطلوب</span>
            <span className="font-mono font-bold text-amber-300">{block.required || '—'}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={reload}
          disabled={checking}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-teal-400 disabled:opacity-70"
        >
          <RefreshCw className={checking ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {checking ? 'جاري التحديث...' : 'تحديث التطبيق الآن'}
        </button>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
          لو التطبيق مثبّت على الشاشة الرئيسية: اقفله وافتحه من جديد بعد التحديث. وإذا استمرت
          الرسالة، تواصل مع إدارة النظام للتأكد من تفعيل حسابك على المصادقة المركزية.
        </p>
      </div>
    </div>
  );
}

export default UpdateRequiredGate;
