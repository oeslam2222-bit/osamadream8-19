import React, { useState, useEffect } from 'react';
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
  installPromptEvent: any;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div
        className="bg-slate-900 border border-amber-500/40 text-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header with Luxury Brand Emblem & Status */}
        <div className="relative bg-gradient-to-b from-amber-500/20 via-slate-900 to-slate-900 p-6 text-center border-b border-slate-800">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/80 border border-slate-700 transition cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Luxury App Icon Preview with Standalone Badge */}
          <div className="relative w-24 h-24 mx-auto mb-3">
            <div className="w-full h-full rounded-2xl bg-[#0f172a] border-2 border-amber-400 p-2 shadow-2xl shadow-amber-500/20 flex items-center justify-center overflow-hidden">
              <img
                src="/pwa-512x512.png"
                alt="مجموعة الطنطاوي"
                className="w-full h-full object-contain filter drop-shadow"
              />
            </div>
            {/* Green Clean Native Badge */}
            <div className="absolute -bottom-2 -left-2 bg-emerald-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full border border-white shadow flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-slate-950" />
              <span>أيقونة نقية</span>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-black mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>تثبيت تطبيق مجموعة الطنطاوي الرسمي (PWA)</span>
          </div>

          <h3 className="text-xl font-black text-white">تثبيت التطبيق على الموبايل بدون علامة كروم</h3>
          <p className="text-xs text-slate-300 mt-1 max-w-sm mx-auto leading-relaxed">
            احصل على التطبيق الأصلي كبرنامج حقيقي في شاشة التطبيقات وهاتفك بدون شريط المتصفح وبأيقونة الطنطاوي الصافية.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
          
          {/* Important Explanation: Chrome Badge Solution Box */}
          <div className="bg-amber-950/40 border border-amber-500/50 rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>سر اختفاء علامة جوجل كروم ⚠️</span>
            </div>
            <p className="text-slate-200 leading-relaxed text-[11px]">
              تظهر علامة جوجل كروم الصغيرة في زاوية الأيقونة إذا اخترت سابقاً <strong className="text-amber-300">"إضافة إلى الشاشة الرئيسية" كإختصار ويب (Shortcut)</strong>.
            </p>
            <div className="bg-slate-950/80 rounded-xl p-2.5 border border-amber-500/30 text-[11px] space-y-1 text-slate-300">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>الحل لإظهار الأيقونة الأصلية النقية 100%:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-200 pr-1">
                <li><strong className="text-rose-300">احذف الاختصار القديم</strong> الموجود على شاشتك الذي تظهر عليه علامة كروم.</li>
                <li>اضغط زر <strong className="text-amber-300">«تثبيت التطبيق الآن»</strong> بالأسفل.</li>
                <li>اختر دائماً <strong className="text-emerald-300">«تثبيت» (Install)</strong> وليس مجرد إضافة رابط.</li>
              </ol>
            </div>
          </div>

          {/* Quick Features Highlight */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
              <Zap className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <div className="text-[11px] font-black text-white">سرعة فائقة</div>
              <div className="text-[9px] text-slate-400">فتح مباشر دون تحميل</div>
            </div>
            <div className="bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
              <ShieldCheck className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <div className="text-[11px] font-black text-white">توفير الباقة</div>
              <div className="text-[9px] text-slate-400">تخزين الصور في الهاتف</div>
            </div>
            <div className="bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
              <Smartphone className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <div className="text-[11px] font-black text-white">شاشة كاملة</div>
              <div className="text-[9px] text-slate-400">بدون شريط المتصفح</div>
            </div>
          </div>

          {/* Status Message if user triggered install */}
          {installStatusMsg && (
            <div className="p-3 bg-amber-400/20 border border-amber-400/40 text-amber-200 rounded-xl text-xs font-bold text-center animate-in fade-in">
              {installStatusMsg}
            </div>
          )}

          {/* Native 1-Click Install Button (When installPromptEvent is primed) */}
          {installPromptEvent && !isInstalled && (
            <button
              onClick={handleNativeInstall}
              className="w-full py-4 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black rounded-2xl shadow-xl shadow-amber-500/25 text-sm flex items-center justify-center gap-2.5 transition transform active:scale-98 cursor-pointer border border-amber-300"
            >
              <Download className="w-5 h-5 animate-bounce" />
              <span>تثبيت التطبيق الرسمي الآن (بدون علامة كروم) ⚡</span>
            </button>
          )}

          {/* If already running in Standalone PWA */}
          {isInstalled && (
            <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 rounded-2xl text-xs flex items-center gap-2.5 font-black">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="leading-tight">
                <div>التطبيق مثبت بالفعل ويعمل كنسخة أصلية كاملة!</div>
                <div className="text-[10px] text-emerald-400/80 font-normal mt-0.5">
                  تستمتع الآن بكامل سرعة الاستجابة ووضع حفظ باقة الإنترنت.
                </div>
              </div>
            </div>
          )}

          {/* Detailed Step-by-Step Instructions based on Device */}
          <div className="space-y-3">
            <div className="text-xs font-black text-slate-300 flex items-center justify-between">
              <span>خطوات التثبيت من المتصفح:</span>
              <span className="text-[10px] text-amber-400 font-bold">لضمان إزالة علامة كروم</span>
            </div>

            {/* Android Chrome Instructions */}
            {(!isIOS || isAndroid) && (
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs">
                <div className="font-black text-amber-300 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                  <span>خطوات التثبيت على هواتف أندرويد (سامسونج، شاومي، أوبو، فيفو...):</span>
                </div>
                
                <div className="space-y-2.5 text-slate-300 leading-relaxed text-[11px]">
                  <div className="flex items-start gap-2.5 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                    <div>
                      <span>اضغط على قائمة <strong>الخيارات (الثلاث نقاط)</strong> <MoreVertical className="w-3.5 h-3.5 inline text-amber-400 mx-0.5" /> بأعلى شاشة متصفح Google Chrome.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                    <div>
                      <span>ابحث عن خيار <strong className="text-emerald-400">"تثبيت التطبيق" (Install app)</strong> <Download className="w-3.5 h-3.5 inline text-emerald-400 mx-0.5" />.</span>
                      <p className="text-[10px] text-amber-300 font-semibold mt-0.5">
                        ⚠️ ملحوظة: تجنب خيار "إضافة إلى الشاشة الرئيسية" واختر دائماً "تثبيت التطبيق".
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                    <div>
                      <span>اضغط <strong>تثبيت (Install)</strong> لتأكيد التثبيت.</span>
                      <p className="text-[10px] text-emerald-300 font-bold mt-0.5">
                        ✓ سينزل التطبيق في درج التطبيقات (App Drawer) وعلى شاشتك بأيقونة ذهبية نقية بدون أي علامة لكروم!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* iOS Safari Instructions */}
            {isIOS && (
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs">
                <div className="font-black text-amber-300 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                  <span>خطوات التثبيت على الآيفون والآيباد (iPhone / iPad - Safari):</span>
                </div>
                <div className="space-y-2 text-slate-300 leading-relaxed text-[11px]">
                  <div className="flex items-center gap-2.5 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-[10px] shrink-0">1</span>
                    <span>اضغط على زر <strong>المشاركة (Share)</strong> <Share className="w-3.5 h-3.5 inline text-blue-400 mx-1" /> في أسفل متصفح Safari.</span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-[10px] shrink-0">2</span>
                    <span>مرر لأسفل واختر <strong>"إضافة إلى الصفحة الرئيسية" (Add to Home Screen)</strong> <PlusSquare className="w-3.5 h-3.5 inline text-emerald-400 mx-1" />.</span>
                  </div>
                  <div className="flex items-center gap-2.5 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-[10px] shrink-0">3</span>
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
              className="w-full text-right text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <span>ما زالت علامة كروم ظاهرة على الأيقونة؟ اضغط هنا للحل</span>
              </span>
              <span className="text-slate-400">{showTroubleshooting ? '▲' : '▼'}</span>
            </button>

            {showTroubleshooting && (
              <div className="mt-2 p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-2 leading-relaxed">
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
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl text-xs transition cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
