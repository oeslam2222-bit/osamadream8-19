import React, { useState, useEffect } from 'react';
import {
  Download,
  Smartphone,
  Tablet,
  Laptop,
  CheckCircle2,
  Share,
  PlusSquare,
  MoreVertical,
  X,
  Sparkles,
  Zap,
  ShieldCheck
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
  const [activeTab, setActiveTab] = useState<'mobile' | 'desktop'>('mobile');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const iOSDevice = /iphone|ipad|ipod/.test(userAgent);
      const androidDevice = /android/.test(userAgent);
      setIsIOS(iOSDevice);
      setIsAndroid(androidDevice);

      // Check if already running as standalone PWA
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      setIsInstalled(!!isStandalone);
    }
  }, []);

  if (!isOpen) return null;

  const handleNativeInstall = async () => {
    if (installPromptEvent) {
      installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setTimeout(() => onClose(), 2000);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div
        className="bg-slate-900 border border-amber-500/30 text-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header with Luxury Brand Emblem */}
        <div className="relative bg-gradient-to-b from-amber-500/20 via-slate-900 to-slate-900 p-6 text-center border-b border-slate-800">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/80 border border-slate-700 transition"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Luxury App Icon Preview */}
          <div className="w-20 h-20 mx-auto rounded-2xl bg-slate-950 border-2 border-amber-400 p-1.5 shadow-xl shadow-amber-500/10 mb-3 flex items-center justify-center">
            <img src="/icon.svg" alt="دريم طنطاوي" className="w-full h-full object-contain" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[11px] font-bold mb-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>تطبيق دريم طنطاوي الرسمي</span>
          </div>

          <h3 className="text-xl font-black text-white">تثبيت التطبيق على الشاشة الرئيسية</h3>
          <p className="text-xs text-slate-300 mt-1">
            تجربة تطبيق حقيقي سريع بدون شريط المتصفح، يعمل بدون إنترنت مع توفير كامل للباقة!
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Features Highlights */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800">
              <Zap className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <div className="text-[11px] font-bold text-white">سرعة فائقة</div>
              <div className="text-[9px] text-slate-400">فتح فوري في ثانية</div>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800">
              <ShieldCheck className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <div className="text-[11px] font-bold text-white">توفير الباقة</div>
              <div className="text-[9px] text-slate-400">حفظ الصور في الهاتف</div>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800">
              <Smartphone className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <div className="text-[11px] font-bold text-white">شاشة كاملة</div>
              <div className="text-[9px] text-slate-400">كتالوج وفواتير مرنة</div>
            </div>
          </div>

          {/* Native 1-Click Install Button (When browser supports prompt) */}
          {installPromptEvent && !isInstalled && (
            <button
              onClick={handleNativeInstall}
              className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black rounded-2xl shadow-lg shadow-amber-500/20 text-sm flex items-center justify-center gap-2 transition transform active:scale-98 cursor-pointer"
            >
              <Download className="w-5 h-5" />
              <span>تثبيت التطبيق الآن بضغطة واحدة (Install)</span>
            </button>
          )}

          {/* Step-by-Step Instructions based on OS */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
              <span>طريقة التثبيت اليدوي:</span>
            </div>

            {/* iOS Safari Instructions */}
            {isIOS && (
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  <span>خطوات التثبيت على الآيفون والآيباد (iPhone / iPad):</span>
                </div>
                <div className="space-y-2 text-slate-300 leading-relaxed text-[11px]">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-bold flex items-center justify-center text-[10px] shrink-0">1</span>
                    <span>اضغط على زر <strong>المشاركة (Share)</strong> <Share className="w-3.5 h-3.5 inline text-blue-400 mx-1" /> في أسفل متصفح Safari.</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-bold flex items-center justify-center text-[10px] shrink-0">2</span>
                    <span>مرر لأسفل واختر <strong>"إضافة إلى الصفحة الرئيسية" (Add to Home Screen)</strong> <PlusSquare className="w-3.5 h-3.5 inline text-emerald-400 mx-1" />.</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-bold flex items-center justify-center text-[10px] shrink-0">3</span>
                    <span>اضغط على <strong>إضافة (Add)</strong> في أعلى الزاوية. سيظهر رمز تطبيق دريم طنطاوي الفاخر على شاشتك فوراً.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Android Chrome Instructions */}
            {(!isIOS || isAndroid) && (
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  <span>خطوات التثبيت على أجهزة أندرويد (سامسونج، شاومي، هواوي):</span>
                </div>
                <div className="space-y-2 text-slate-300 leading-relaxed text-[11px]">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-bold flex items-center justify-center text-[10px] shrink-0">1</span>
                    <span>اضغط على قائمة <strong>الخيارات (الثلاث نقاط)</strong> <MoreVertical className="w-3.5 h-3.5 inline text-slate-300 mx-1" /> بأعلى المتصفح.</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-bold flex items-center justify-center text-[10px] shrink-0">2</span>
                    <span>اختر <strong>"تثبيت التطبيق" (Install App)</strong> أو <strong>"الإضافة للشاشة الرئيسية"</strong>.</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-bold flex items-center justify-center text-[10px] shrink-0">3</span>
                    <span>اضغط تأكيد، وسيتم تثبيته كتطبيق مستقل بأيقونة دريم طنطاوي.</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {isInstalled && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-2xl text-xs flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>أنت تستخدم التطبيق المثبت حالياً بكامل المزايا وسرعة الاستجابة!</span>
            </div>
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
