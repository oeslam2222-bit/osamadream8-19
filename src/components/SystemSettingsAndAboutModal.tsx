import React, { useState } from 'react';
import {
  Settings,
  Info,
  Shield,
  Eye,
  EyeOff,
  Zap,
  ZapOff,
  Download,
  Smartphone,
  Users,
  CheckCircle2,
  Sparkles,
  Lock,
  Globe,
  Database,
  Building,
  Code2,
  X,
  Share2,
  RefreshCw,
  Award,
  Layers
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cacheProductImages, getCachedImagesStats, clearCachedImages } from '../services/imageCacheService';
import { getCandidateImageUrls } from '../services/cloudinaryService';

interface SystemSettingsAndAboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'settings' | 'team' | 'about' | 'install' | 'privacy';
}

export const SystemSettingsAndAboutModal: React.FC<SystemSettingsAndAboutModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'team'
}) => {
  const {
    isPrivacyMode,
    togglePrivacyMode,
    dataSaverMode,
    toggleDataSaverMode,
    triggerInstallPrompt,
    installPromptEvent,
    setIsInstallModalOpen,
    currentUser,
    products,
    cloudinaryConfig
  } = useApp();

  const [activeTab, setActiveTab] = useState<'settings' | 'team' | 'about' | 'install' | 'privacy'>(defaultTab);
  const [isCaching, setIsCaching] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<{ count: number; estimatedSizeMB: number }>({ count: 0, estimatedSizeMB: 0 });

  React.useEffect(() => {
    if (isOpen) {
      getCachedImagesStats().then((st) => setCacheStats(st));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunCache = async () => {
    setIsCaching(true);
    setCacheMessage(null);
    try {
      const allUrls: string[] = [];
      products.forEach((p) => {
        const urls = getCandidateImageUrls(p, cloudinaryConfig);
        allUrls.push(...urls);
      });
      const res = await cacheProductImages(allUrls);
      const st = await getCachedImagesStats();
      setCacheStats(st);
      setCacheMessage(`تم ضغط وتحميل ${res.cached} صورة للعمل أوفلاين بنجاح! ✅`);
    } catch {
      setCacheMessage('حدث خطأ أثناء تحميل الصور.');
    } finally {
      setIsCaching(false);
    }
  };

  const handleClearCache = async () => {
    try {
      await clearCachedImages();
      setCacheStats({ count: 0, estimatedSizeMB: 0 });
      setCacheMessage('تم إفراغ الذاكرة المؤقتة للصور بنجاح.');
    } catch {}
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-[var(--app-line)] space-y-5 my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--app-line)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#0f233d] text-amber-400 flex items-center justify-center font-black shadow-md shrink-0">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                الإعدادات ومعلومات المنظومة
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                مجموعة الطنطاوي للتجارة والتوزيع • TANTAWY GROUP
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 border-b border-[var(--app-line)] pb-2 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('team')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
              activeTab === 'team'
                ? 'bg-[#0f233d] text-amber-300 shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>القائمين على الفكرة</span>
          </button>

          <button
            onClick={() => setActiveTab('about')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
              activeTab === 'about'
                ? 'bg-[#0f233d] text-amber-300 shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>عن المنظومة</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-[#0f233d] text-amber-300 shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>إعدادات العرض والباقة</span>
          </button>

          <button
            onClick={() => setActiveTab('install')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
              activeTab === 'install'
                ? 'bg-[#0f233d] text-amber-300 shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>تثبيت التطبيق</span>
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'bg-[#0f233d] text-amber-300 shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>السياسة والخصوصية</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {/* TAB 1: TEAM & LEADERSHIP */}
          {activeTab === 'team' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">
                    رؤية التحول الرقمي والتطوير المستمر
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    تم بناء وهندسة هذه المنظومة خصيصاً لمجموعة الطنطاوي للتجارة والتوزيع لميكنة وتسهيل كافة عمليات البيع الميداني، إحكام المخزون ومنع الحجز المزدوج، وسرعة الربط بين الفروع والمخزن المركزي.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Lead Developer Card */}
                <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 space-y-2 hover:border-amber-400/50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0f233d] text-amber-300 flex items-center justify-center font-black shrink-0">
                      <Code2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-900">أسامة إسلام</div>
                      <div className="text-[11px] font-bold text-amber-700">المطور التقني وقائد التحول الرقمي</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                    المسؤول عن التصميم المعماري للبرمجيات، هندسة قواعد بيانات Supabase، تكامل PWA بدون إنترنت، وربط تجربة الموبايل والويب.
                  </p>
                </div>

                {/* Management Card */}
                <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 space-y-2 hover:border-amber-400/50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0">
                      <Building className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-900">إدارة مجموعة الطنطاوي</div>
                      <div className="text-[11px] font-bold text-slate-600">مجلس الإدارة وإدارة المبيعات والتوزيع</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                    القيادة والتخطيط الاستراتيجي، تحديد احتياجات الفروع والمخازن، ودعم التطوير التكنولوجي لخدمة عملاء الجملة والتجزئة.
                  </p>
                </div>
              </div>

              {/* Field Team Honor Card */}
              <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="leading-relaxed">
                  <div className="font-black text-slate-900">فريق العمل الميداني والتنفيذي</div>
                  <div className="text-[11px] text-slate-600">
                    مناديب المبيعات الميدانيين، مشرفي القطاعات، مديري الفروع، وأمناء مخازن 6 أكتوبر والفروع الإقليمية.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ABOUT APP */}
          {activeTab === 'about' && (
            <div className="space-y-3.5 animate-in fade-in">
              <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)]">
                <img src="/tantawy-brand-logo.svg" alt="Tantawy Group" className="w-14 h-14 object-contain" />
                <div>
                  <h3 className="font-black text-base text-slate-900">منظومة مجموعة الطنطاوي المتكاملة</h3>
                  <div className="text-[11px] text-amber-700 font-bold">الإصدار: v2.4.2 Enterprise Pro Edition</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Tantawy Group ERP & Field Sales Distribution System</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-black text-slate-900 text-xs">أبرز قدرات المنظومة:</h4>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                  <li className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-[var(--app-line)]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>كتالوج منتجات سريع فائق الخفة وضغط صور جوجل درايف للعمل بدون استهلاك باقة.</span>
                  </li>
                  <li className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-[var(--app-line)]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>سلة تسوق ذكية مستوحاة من أمازون ونون للمكتب، وتاجر ورنين للموبايل.</span>
                  </li>
                  <li className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-[var(--app-line)]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>إحكام المخزون اللحظي ومنع الحجز المزدوج بين المناديب.</span>
                  </li>
                  <li className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-[var(--app-line)]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>دورة اعتماد هرمية: مندوب ⬅️ مشرف فني ⬅️ مدير فرع ⬅️ صرف المخزن.</span>
                  </li>
                  <li className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-[var(--app-line)]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>متابعة مديونيات العملاء والتحصيل القضائي تحت إشراف المستشار القانوني.</span>
                  </li>
                  <li className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-xl border border-[var(--app-line)]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>توليد وتصدير الفواتير الإلكترونية المعتمدة وإكسل و PDF بلمسة زر.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: SETTINGS & DISPLAY PREFERENCES */}
          {activeTab === 'settings' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Privacy Mode Switch */}
              <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0 ${
                    isPrivacyMode ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {isPrivacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">وضع سرية البيانات المالية (Privacy Mode)</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      عند التفعيل يتم إخفاء أرقام المبيعات الحساسة، أرصدة العملاء، وهوامش الربح واستبدالها بنقاط (••••••) أثناء عرض الشاشة أمام التجار أو العملاء.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={togglePrivacyMode}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
                    isPrivacyMode
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-white border border-[var(--app-line)] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isPrivacyMode ? 'مفعّل حالياً' : 'معطّل (اضغط للتفعيل)'}
                </button>
              </div>

              {/* Data Saver Mode Switch */}
              <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0 ${
                    dataSaverMode ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {dataSaverMode ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">وضع توفير باقة الموبايل (Data Saver)</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      يقلل استهلاك الإنترنت للمندوب بنسبة تصل إلى 90% عن طريق ضغط الصور والاعتماد على الذاكرة المحلية للجهاز.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleDataSaverMode}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
                    dataSaverMode
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white border border-[var(--app-line)] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {dataSaverMode ? 'مفعّل حالياً' : 'معطّل (اضغط للتفعيل)'}
                </button>
              </div>

              {/* Offline Image Cache Manager */}
              <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">إدارة صور الكتالوج بدون إنترنت (Offline Cache)</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      المحفوظ بالجهاز حالياً: <strong className="text-emerald-700">{cacheStats.count} صورة</strong> (~{cacheStats.estimatedSizeMB} ميجابايت)
                    </p>
                  </div>
                </div>

                {cacheMessage && (
                  <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl font-bold border border-emerald-200">
                    {cacheMessage}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleRunCache}
                    disabled={isCaching}
                    className="bg-[#0f233d] hover:bg-[#1a3861] disabled:opacity-50 text-amber-300 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    {isCaching ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>جاري التحميل والضغط...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>تحميل وتحديث كل الصور أوفلاين</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleClearCache}
                    className="bg-white hover:bg-slate-100 text-slate-600 border border-[var(--app-line)] font-bold px-3 py-2 rounded-xl text-xs cursor-pointer"
                  >
                    تفريغ الذاكرة
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: INSTALL PWA */}
          {activeTab === 'install' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src="/pwa-192x192.png" alt="الطنطاوي" className="w-12 h-12 rounded-2xl border border-slate-300 shadow-sm shrink-0" />
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">تثبيت التطبيق على الموبايل أو اللابتوب</h4>
                    <p className="text-[11px] text-slate-600">
                      يمنحك أيقونة نقية وشاشة كاملة سريعة بدون شريط المتصفح ويعمل بنمط الأوفلاين السريع.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (installPromptEvent && typeof installPromptEvent.prompt === 'function') {
                      triggerInstallPrompt();
                    } else if (setIsInstallModalOpen) {
                      setIsInstallModalOpen(true);
                    } else {
                      alert('يمكنك تثبيت التطبيق عبر النقر على زر المشاركة أو الإعدادات في متصفحك واختيار "إضافة إلى الشاشة الرئيسية".');
                    }
                  }}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shrink-0 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>تثبيت الآن</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-2">
                  <div className="font-black text-slate-900 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-amber-600" />
                    <span>لهواتف iPhone (متصفح Safari)</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11px] leading-relaxed">
                    <li>افتح الرابط في متصفح Safari.</li>
                    <li>اضغط على زر المشاركة <strong>(Share / مربع به سهم للأعلى)</strong>.</li>
                    <li>اختر <strong>"إضافة إلى الصفحة الرئيسية" (Add to Home Screen)</strong>.</li>
                  </ol>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-2">
                  <div className="font-black text-slate-900 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span>لهواتف Android (متصفح Chrome)</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-600 text-[11px] leading-relaxed">
                    <li>افتح الرابط في Google Chrome.</li>
                    <li>اضغط على القائمة <strong>(الثلاث نقاط في أعلى اليسار)</strong>.</li>
                    <li>اختر <strong>"تثبيت التطبيق" (Install App)</strong> أو إضافة للشاشة.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PRIVACY & SECURITY */}
          {activeTab === 'privacy' && (
            <div className="space-y-3 animate-in fade-in leading-relaxed text-slate-700">
              <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-2">
                <div className="font-black text-slate-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600" />
                  <span>أمان البيانات والصلاحيات الهرمية (RBAC)</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  جميع بيانات العملاء، الفواتير، وأرصدة المخزون محمية بتشفير عالي وصلاحيات دقيقة: كل مندوب يطلع فقط على عملائه المسندين إليه، بينما يتابع المشرف ومدير الفرع والإدارة والمستشار القانوني نطاقاتهم المحددة بكل سرية.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-2">
                <div className="font-black text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <span>التخزين السحابي وقواعد البيانات</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  تعتمد المنظومة على سيرفرات سحابية مع دعم كامل للتشغيل دون انقطاع، وسجل تدقيق تفصيلي (Audit Trail) يوثق كل اعتماد أو حركة صرف مخزني لحماية أموال الشركة ومنع التلاعب.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[var(--app-line)] flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400 font-bold">
            مجموعة الطنطاوي للتجارة والتوزيع © 2026
          </div>
          <button
            onClick={onClose}
            className="bg-[#0f233d] hover:bg-[#1a3861] text-amber-300 font-black px-5 py-2 rounded-xl text-xs transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
