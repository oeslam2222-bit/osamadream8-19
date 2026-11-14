import React, { useState, useEffect } from 'react';
import type { InstallPromptEvent } from '../types';
import {
  Download,
  Smartphone,
  CheckCircle2,
  Share,
  PlusSquare,
  MoreVertical,
  X,
  Sparkles,
  Zap,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  ExternalLink,
  Layers,
  Info
} from 'lucide-react';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  installPromptEvent: InstallPromptEvent | null;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({
  isOpen,
  onClose,
  installPromptEvent
}) => {
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isChrome, setIsChrome] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [installStatusMsg, setInstallStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const iOSDevice = /iphone|ipad|ipod/.test(userAgent);
      const androidDevice = /android/.test(userAgent);
      const chromeBrowser = /chrome|crios/.test(userAgent) && !/edge|opr|brave/.test(userAgent);

      setIsIOS(iOSDevice);
      setIsAndroid(androidDevice);
      setIsChrome(chromeBrowser);

      // Check if already running as standalone PWA
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsInstalled(!!isStandalone);
    }
  }, []);

  if (!isOpen) return null;

  const handleNativeInstall = async () => {
    if (installPromptEvent && typeof installPromptEvent.prompt === 'function') {
      try {
        setInstallStatusMsg('جاري فتح نافذة التثبيت الرسمية من المتصفح...');
        await installPromptEvent.prompt();
        const choice = await installPromptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          setInstallStatusMsg('تم قبول التثبيت بنجاح! يتم الآن تنزيل التطبيق على هاتفك بأيقونة الطنطاوي الأصلية بدون علامة كروم.');
          setIsInstalled(true);
          setTimeout(() => onClose(), 2500);
        } else {
          setInstallStatusMsg('تم إلغاء التثبيت. يمكنك إعادة المحاولة في أي وقت.');
        }
      } catch (err) {
        console.warn('Native install prompt notice:', err);
        setInstallStatusMsg('يرجى اتباع خطوات التثبيت الموضحة بالأسفل من قائمة المتصفح.');
      }
    } else {
      setShowTroubleshooting(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div
        className="bg-[#0f2b38] border border-[var(--app-accent)] text-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header with Luxury Brand Emblem & Status */}
        <div className="relative bg-gradient-to-b from-[#0f2b38] via-[#0f2b38] to-[#0a1c30] p-6 text-center border-b border-[#1b4676]">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/80 border border-slate-700 transition cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Luxury App Icon Preview with Standalone Badge */}
          <div className="relative w-24 h-24 mx-auto mb-3">
            <div className="w-full h-full rounded-2xl bg-[#15345c] border-2 border-[var(--app-accent)] p-1 shadow-2xl shadow-[0_0_20px_rgba(0,148,136,0.15)] flex items-center justify-center overflow-hidden">
              <img
                src="/pwa-512x512.png"
                alt="مجموعة الطنطاوي"
                className="w-full h-full object-contain filter drop-shadow"
              />
            </div>
            {/* Green Clean Native Badge */}
            <div className="absolute -bottom-2 -left-2 bg-[var(--app-ok)] text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full border border-white shadow flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-slate-950" />
              <span>أيقونة نقية</span>
            </div>
          </div>

          <h3 className="text-xl font-black text-white tracking-tight">تثبيت تطبيق الطنطاوي على هاتفك</h3>
          <p className="text-xs text-slate-300 mt-1.5 max-w-sm mx-auto leading-relaxed">
            أضف أيقونة التطبيق إلى شاشة هاتفك كبرنامج حقيقي، بدون شريط المتصفح وبأيقونة مجموعة الطنطاوي الصافية.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
          
          {/* Important Explanation: Chrome Badge Solution Box */}
          <div className="bg-[#15345c]/60 border border-[#1b4676]/50 rounded-2xl p-4 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-[#60a5fa] font-black text-sm">
              <AlertTriangle className="w-4 h-4 text-[#60a5fa] shrink-0" />
              <span>كيفية إظهار الأيقونة الأصلية دون علامة كروم</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              إذا ظهرت أيقونة التطبيق مع علامة متصفح صغيرة، فهذا يعني أنك اخترت سابقاً <strong className="text-white">"إضافة إلى الشاشة الرئيسية"</strong> كإختصار ويب بدلاً من التثبيت الفعلي.
            </p>
            <div className="bg-[#0a1c30]/50 rounded-xl p-3 border border-[#1b4676]/40 space-y-2 text-[11px] text-slate-200">
              <div className="flex items-center gap-2 text-[#60a5fa] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>الخطوات الصحيحة:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 pr-1">
                <li><strong className="text-[#ef4444]">احذف الإختصار القديم</strong> الذي يظهر عليه علامة كروم من شاشتك.</li>
                <li>اضغط زر <strong className="text-white">«تثبيت التطبيق الآن»</strong> بالأسفل.</li>
                <li>اختر دائماً <strong className="text-[#60a5fa]">«تثبيت» (Install)</strong> وليس مجرد إضافة رابط.</li>
              </ol>
            </div>
          </div>

          {/* Quick Features Highlight */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-[#15345c]/40 p-2.5 rounded-2xl border border-[#1b4676]/40">
              <Zap className="w-5 h-5 text-[#60a5fa] mx-auto mb-1.5" />
              <div className="text-[11px] font-black text-white">سرعة فائقة</div>
              <div className="text-[9px] text-slate-400">فتح مباشر دون تحميل</div>
            </div>
            <div className="bg-[#15345c]/40 p-2.5 rounded-2xl border border-[#1b4676]/40">
              <ShieldCheck className="w-5 h-5 text-[#60a5fa] mx-auto mb-1.5" />
              <div className="text-[11px] font-black text-white">توفير الباقة</div>
              <div className="text-[9px] text-slate-400">تخزين الصور في الهاتف</div>
            </div>
            <div className="bg-[#15345c]/40 p-2.5 rounded-2xl border border-[#1b4676]/40">
              <Smartphone className="w-5 h-5 text-[#60a5fa] mx-auto mb-1.5" />
              <div className="text-[11px] font-black text-white">شاشة كاملة</div>
              <div className="text-[9px] text-slate-400">بدون شريط المتصفح</div>
            </div>
          </div>

          {/* Status Message if user triggered install */}
          {installStatusMsg && (
            <div className="p-3 bg-[#15345c]/60 border border-[#1b4676]/50 text-[#60a5fa] rounded-xl text-xs font-bold text-center animate-in fade-in">
              {installStatusMsg}
            </div>
          )}

          {/* Native 1-Click Install Button (When installPromptEvent is primed) */}
          {installPromptEvent && !isInstalled && (
            <button
              onClick={handleNativeInstall}
              className="w-full py-4 bg-gradient-to-r from-[var(--app-accent)] to-teal-700 hover:from-[#00827a] hover:to-[#006d62] text-white font-black rounded-2xl shadow-xl shadow-[0_0_20px_rgba(0,148,136,0.25)] text-sm flex items-center justify-center gap-2.5 transition transform active:scale-98 cursor-pointer border border-[var(--app-accent)]"
            >
              <Download className="w-5 h-5 animate-bounce" />
              <span>تثبيت التطبيق الرسمي الآن (بدون علامة متصفح)</span>
            </button>
          )}

          {/* Detailed Step-by-Step Instructions based on Device */}
          <div className="space-y-3">
            <div className="text-xs font-black text-slate-300 flex items-center justify-between">
              <span>خطوات التثبيت من المتصفح:</span>
              <span className="text-[10px] text-[#60a5fa] font-bold">لضمان إزالة علامة كروم</span>
            </div>

            {/* Android Chrome Instructions */}
            {(!isIOS || isAndroid) && (
              <div className="bg-[#0a1c30]/50 p-4 rounded-2xl border border-[#1b4676]/40 space-y-3 text-xs">
                <div className="font-black text-[#60a5fa] flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#60a5fa]" />
                  <span>خطوات التثبيت على هواتف أندرويد (سامسونج، شاومي، أوبو، فيفو...):</span>
                </div>
                
                <div className="space-y-2.5 text-slate-300 leading-relaxed text-[11px]">
                  <div className="flex items-start gap-2.5 bg-[#15345c]/40 p-2 rounded-xl border border-[#1b4676]/40">
                    <span className="w-5 h-5 rounded-full bg-[#0d9488] text-white font-black flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                    <div>
                      <span>اضغط على قائمة <strong>الخيارات (الثلاث نقاط)</strong> <MoreVertical className="w-3.5 h-3.5 inline text-[#60a5fa] mx-0.5" /> بأعلى شاشة متصفح Google Chrome.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 bg-[#15345c]/40 p-2 rounded-xl border border-[#1b4676]/40">
                    <span className="w-5 h-5 rounded-full bg-[#0d9488] text-white font-black flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                    <div>
                      <span>ابحث عن خيار <strong className="text-[#0d9488]">"تثبيت التطبيق" (Install app)</strong> <Download className="w-3.5 h-3.5 inline text-[#0d9488] mx-0.5" />.</span>
                      <p className="text-[10px] text-[#60a5fa] font-semibold mt-0.5">
                        ⚠️ ملحوظة: تجنب خيار "إضافة إلى الشاشة الرئيسية" واختر دائماً "تثبيت التطبيق".
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 bg-[#15345c]/40 p-2 rounded-xl border border-[#1b4676]/40">
                    <span className="w-5 h-5 rounded-full bg-[#0d9488] text-white font-black flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                    <div>
                      <span>اضغط <strong>تثبيت (Install)</strong> لتأكيد التثبيت.</span>
                      <p className="text-[10px] text-[#0d9488] font-bold mt-0.5">
                        ✓ سينزل التطبيق في درج التطبيقات (App Drawer) وعلى شاشتك بأيقونة ذهبية نقية بدون أي علامة لكروم!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* iOS Safari Instructions */}
            {isIOS && (
              <div className="bg-[#0a1c30]/50 p-4 rounded-2xl border border-[#1b4676]/40 space-y-3 text-xs">
                <div className="font-black text-[#60a5fa] flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#60a5fa]" />
                  <span>خطوات التثبيت على الآيفون والآيباد (iPhone / iPad - Safari):</span>
                </div>
                <div className="space-y-2 text-slate-300 leading-relaxed text-[11px]">
                  <div className="flex items-center gap-2.5 bg-[#15345c]/40 p-2 rounded-xl border border-[#1b4676]/40">
                    <span className="w-5 h-5 rounded-full bg-[#0d9488] text-white font-black flex items-center justify-center text-[10px] shrink-0">1</span>
                    <span>اضغط على زر <strong>المشاركة (Share)</strong> <Share className="w-3.5 h-3.5 inline text-[#60a5fa] mx-1" /> في أسفل متصفح Safari.</span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-[#15345c]/40 p-2 rounded-xl border border-[#1b4676]/40">
                    <span className="w-5 h-5 rounded-full bg-[#0d9488] text-white font-black flex items-center justify-center text-[10px] shrink-0">2</span>
                    <span>مرر لأسفل واختر <strong>"إضافة إلى الصفحة الرئيسية" (Add to Home Screen)</strong> <PlusSquare className="w-3.5 h-3.5 inline text-[#0d9488] mx-1" />.</span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-[#15345c]/40 p-2 rounded-xl border border-[#1b4676]/40">
                    <span className="w-5 h-5 rounded-full bg-[#0d9488] text-white font-black flex items-center justify-center text-[10px] shrink-0">3</span>
                    <span>اضغط على <strong>إضافة (Add)</strong> بالأعلى. ستظهر أيقونة التطبيق الفخمة فوراً بدون علامة متصفح.</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Toggle Troubleshooting / FAQ */}
          <div className="pt-2">
            <button
              onClick={() => setShowTroubleshooting(!showTroubleshooting)}
              className="w-full text-right text-xs text-[#60a5fa] hover:text-[#60a5fa] font-bold flex items-center justify-between p-2.5 bg-[#0a1c30]/40 rounded-xl border border-[#1b4676]/40 transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-[#60a5fa]" />
                <span>ما زالت علامة كروم ظاهرة على الأيقونة؟ اضغط هنا للحل</span>
              </span>
              <span className="text-slate-400">{showTroubleshooting ? '▲' : '▼'}</span>
            </button>

            {showTroubleshooting && (
              <div className="mt-2 p-3 bg-[#0a1c30]/40 rounded-xl border border-[#1b4676]/40 text-[11px] text-slate-300 space-y-2 leading-relaxed">
                <p>
                  <strong>1. تأكد من فتح الرابط داخل تطبيق Chrome مباشرة:</strong> إذا فتحت الرابط من داخل واتساب، اضغط على الثلاث نقاط بالأعلى واختر <em>"فتح في متصفح Chrome"</em> أولاً.
                </p>
                <p>
                  <strong>2. احذف الاختصار القديم:</strong> اضغط مطولاً على الأيقونة القديمة ذات علامة كروم واختر <em>"إزالة من الشاشة"</em>.
                </p>
                <p>
                  <strong>3. التثبيت كـ WebAPK:</strong> عند الضغط على الثلاث نقاط داخل Chrome واختيار <em>"تثبيت التطبيق"</em>، يقوم نظام أندرويد تلقائياً بإنشاء حزمة تطبيق مستقلة تظهر في قائمة التطبيقات الرئيسية باسم <strong>الطنطاوي</strong> بدون أي شعار متصفح.
                </p>
              </div>
            )}
          </div>

          {/* Close Action Button */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-[#1b4676] hover:bg-[#15345c] text-white font-bold rounded-2xl text-xs transition cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
