import React, { useState } from 'react';
import {
  Settings,
  Info,
  Shield,
  Zap,
  ZapOff,
  Download,
  Smartphone,
  Users,
  CheckCircle2,
  Lock,
  Building,
  X,
  Award,
  FileText,
  AlertTriangle,
  FolderDown,
  Sparkles,
  Server,
  Scale,
  Bell,
  RefreshCw,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import { useApp } from '../context/AppContext';

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
    dataSaverMode,
    toggleDataSaverMode,
    triggerInstallPrompt,
    installPromptEvent,
    setIsInstallModalOpen
  } = useApp();

  const [activeTab, setActiveTab] = useState<'settings' | 'team' | 'about' | 'install' | 'privacy'>(defaultTab);
  const [autoSyncOrders, setAutoSyncOrders] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(true);

  if (!isOpen) return null;

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
                إدارة القطاع المنزلي لمجموعة دريم طنطاوي • TANTAWY GROUP
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
            <span>إعدادات النظام والباقة</span>
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
            <span>تثبيت التطبيق على الجهاز (PWA)</span>
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
          {/* TAB 1: TEAM & LEADERSHIP - STRICTLY NO INDIVIDUAL NAMES */}
          {activeTab === 'team' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-4 flex items-start sm:items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">
                    القائمين على الفكرة والإشراف العام
                  </h4>
                  <div className="text-amber-800 font-extrabold text-xs mt-0.5">
                    إدارة القطاع المنزلي لمجموعة دريم طنطاوي
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    صاحبة الرؤية، الفكرة، والتوجيه الاستراتيجي لتأسيس هذه المنظومة البرمجية الموحدة؛ لميكنة قطاع الأدوات والأجهزة المنزلية وتنسيق حركة المبيعات والمخازن والتحصيل بأعلى معايير الدقة والسرعة.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Sector Leadership Card */}
                <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 space-y-2 hover:border-amber-400/50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0f233d] text-amber-300 flex items-center justify-center font-black shrink-0">
                      <Building className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-900">إدارة القطاع المنزلي</div>
                      <div className="text-[11px] font-bold text-amber-700">التخطيط الاستراتيجي وميكنة العمليات</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                    تحديد متطلبات السوق التجاري، ربط سياسات التسعير والخصومات، وتطوير آليات التوزيع لمواكبة حجم مبيعات فروع ومستودعات المجموعة في جميع المحافظات.
                  </p>
                </div>

                {/* Operations & Logistics Card */}
                <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 space-y-2 hover:border-amber-400/50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-900 text-blue-200 flex items-center justify-center font-black shrink-0">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-900">إدارة العمليات والتوزيع اللوجستي</div>
                      <div className="text-[11px] font-bold text-blue-700">الربط المخزني والتسليم الميداني</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                    المتابعة اللحظية لأرصدة مستودعات 6 أكتوبر والمستودعات الإقليمية، ومنع الحجز المزدوج، وسرعة تجهيز أذونات الصرف والفواتير للمناديب والعملاء.
                  </p>
                </div>

                {/* Financial & Legal Compliance */}
                <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 space-y-2 hover:border-amber-400/50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-800 text-emerald-200 flex items-center justify-center font-black shrink-0">
                      <Scale className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-900">إدارة الرقابة المالية والشؤون القانونية</div>
                      <div className="text-[11px] font-bold text-emerald-700">التدقيق المالي والحماية القانونية</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                    إحكام قيود المديونيات، التدقيق الرقمي لحركات البيع، الإشراف على المستشار القانوني للتحصيل، وحماية حقوق الشركة والتجار بصفة دورية صارمة.
                  </p>
                </div>

                {/* Field Sales & Branches Team */}
                <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 space-y-2 hover:border-amber-400/50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-900">فريق المبيعات الميدانية والفروع</div>
                      <div className="text-[11px] font-bold text-slate-700">المناديب والمشرفون ومديرو الفروع</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                    الركيزة التنفيذية في الميدان لتسجيل الطلبيات، الزيارات الدورية لتجار الجملة والتجزئة، وتقديم خدمة تسوق مميزة تلبي كافة احتياجات السوق.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ABOUT APP - RICH TANTAWY GROUP ENTERPRISE DETAILS */}
          {activeTab === 'about' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center gap-3.5 bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)]">
                <img src="/tantawy-brand-logo.svg" alt="Tantawy Group" className="w-16 h-16 object-contain shrink-0" />
                <div>
                  <h3 className="font-black text-base sm:text-lg text-slate-900">
                    مجموعة دريم طنطاوي • القطاع المنزلي والأجهزة
                  </h3>
                  <div className="text-xs text-amber-700 font-bold mt-0.5">
                    TANTAWY GROUP • منظومة التوزيع الميداني وإدارة سلاسل الإمداد
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-mono">
                    الإصدار التشغيلي: v2.5.0 Enterprise Pro • متصل بقواعد البيانات المركزية
                  </div>
                </div>
              </div>

              {/* Company & Operational Overview */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
                <h4 className="font-black text-slate-900 text-xs flex items-center gap-2">
                  <Building className="w-4 h-4 text-amber-600" />
                  <span>نبذة عن الكيان وشبكة التوزيع الميداني</span>
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  تُعد <strong>مجموعة دريم طنطاوي (Farouk Tantawy)</strong> واحدة من كبرى قلاع تجارة وتوزيع الأجهزة المنزلية، الأدوات والأواني المطبخية، ومستلزمات البيت الحديث في مصر. تغطي عمليات المجموعة أكثر من <strong>5,000 تاجر جملة وتجزئة</strong> عبر <strong>7 فروع إقليمية</strong> مدعومة بالمستودع اللوجستي المركزي بمدينة 6 أكتوبر، مع أسطول شحن وتوزيع ميداني مباشر.
                </p>
              </div>

              {/* Core Pillars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-blue-600" />
                    <span>المخزون المركزي وفروع التوزيع الـ 7</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    ربط آني بين مستودع 6 أكتوبر الرئيسي وفروع الصعيد والقاهرة والدلتا لمنع الحجز المزدوج وتوفير رؤية فورية للأرصدة المتاحة للبيع.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-emerald-600" />
                    <span>دورة الائتمان وسقف المديونيات</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    منظومة ائتمان صارمة تفحص حد كل عميل (Credit Limit)، وتتحقق من وجود أوراق ضمان (شيكات / إيصالات أمانة) قبل اعتماد الشحن.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-amber-600" />
                    <span>سلسلة الاعتماد الهرمي للطلبيات</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    مسار توثيق رقمي ثلاثي: المندوب الميداني ⬅️ اعتماد المشرف ⬅️ مصادقة مدير الفرع والمالية ⬅️ إصدار إذن الصرف المخزني.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-purple-600" />
                    <span>الفواتير وسندات القبض الإلكترونية</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    طباعة ومشاركة إيصالات بيع وسندات تحصيل معتمدة بكود QR وباركود دولي لحماية حقوق التجار والشركة ومنع أي تلاعب نقدي.
                  </p>
                </div>
              </div>

              {/* Key Features List */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-2">
                <h4 className="font-black text-slate-900 text-xs">مميزات تقنية متقدمة في هذا الإصدار:</h4>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>كتالوج بصري فائق السرعة يعمل بسلاسة على شبكات الموبايل والإنترنت الضعيف.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>تصدير شيتات إكسل متقدمة متعددة التبويبات تشمل شيت «مبيعات العملاء» والمديونيات.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>لوحة المستشار القانوني لمتابعة الجدولة، المطالبات القضائية وسندات التنفيذ.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>مزامنة مباشرة سحابية مع جداول Google Sheets وقواعد بيانات السيرفر.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: STREAMLINED SETTINGS & DATA SAVER */}
          {activeTab === 'settings' && (
            <div className="space-y-4 animate-in fade-in">
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
                      يقلل استهلاك باقة الإنترنت للمندوب بنسبة تصل إلى 90% عن طريق ضغط الصور واعتماد الكاش المحلي للجهاز في خطوط التوزيع الميداني.
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
                  {dataSaverMode ? 'مفعّل حالياً ✅' : 'معطّل (اضغط للتفعيل)'}
                </button>
              </div>

              {/* Real-time Order Sync Preference */}
              <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black shrink-0">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">المزامنة التلقائية للطلبات والفواتير</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      تحديث تلقائي لحالة اعتمادات الفروع وحركات الصرف المخزني لحظة بلحظة دون الحاجة لإعادة تحميل الصفحة.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAutoSyncOrders(!autoSyncOrders)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
                    autoSyncOrders
                      ? 'bg-[#0f233d] text-amber-300 shadow-sm'
                      : 'bg-white border border-[var(--app-line)] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {autoSyncOrders ? 'تلقائي نشط' : 'يدوي'}
                </button>
              </div>

              {/* Sound & Notification Alerts */}
              <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-black shrink-0">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">تنبيهات العمليات الميدانية</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      إصدار إشعار صوتي وتأكيد بصري عند اعتماد طلب مبيعات، تسديد دفعة، أو إضافة منتج جديد للكتالوج.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSoundAlerts(!soundAlerts)}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
                    soundAlerts
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-white border border-[var(--app-line)] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {soundAlerts ? 'مفعّل ✅' : 'صامت'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: INSTALLATION - PWA ONLY */}
          {activeTab === 'install' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src="/tantawy-brand-logo.svg" alt="الطنطاوي" className="w-12 h-12 rounded-xl bg-white/10 p-1 border border-white/20 shrink-0" />
                  <div>
                    <h4 className="font-black text-sm text-amber-400">تثبيت التطبيق على الشاشة الرئيسية (PWA)</h4>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      تثبيت فوري بدون استهلاك مساحة، يعمل كـ تطبيق أصلي بكامل الشاشة على جميع الهواتف والأجهزة.
                    </p>
                  </div>
                </div>
              </div>

              {/* Option B: Fast PWA Web App Icon */}
              <div className="bg-slate-50 border border-[var(--app-line)] rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[#0f233d] text-amber-400 flex items-center justify-center font-black shadow-md shrink-0">
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-sm">تثبيت كـ تطبيق ويب سريع (PWA - أيقونة شاشة)</h4>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                        تثبيت فوري بدون استهلاك مساحة تخزينية، يعمل على هواتف آيفون (iOS) والأندرويد والكمبيوتر، ويفتح بشاشة كاملة نقية.
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
                        alert('يمكنك تثبيت التطبيق بالنقر على زر المشاركة أو القائمة في المتصفح واختيار "إضافة إلى الشاشة الرئيسية".');
                      }
                    }}
                    className="bg-[#0f233d] hover:bg-[#1a3861] text-amber-300 font-black px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shrink-0 cursor-pointer transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>تثبيت الأيقونة الآن</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="bg-white p-3 rounded-xl border border-[var(--app-line)] space-y-1">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-800"></span>
                      <span>هواتف آبل آيفون (Safari)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      اضغط على زر المشاركة <strong>(مربع به سهم للأعلى)</strong> ⬅️ ثم اختر <strong>"إضافة إلى الصفحة الرئيسية"</strong>.
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-[var(--app-line)] space-y-1">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                      <span>أندرويد والكمبيوتر (Chrome / Edge)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      اضغط على الثلاث نقاط بالأعلى ⬅️ ثم اختر <strong>"تثبيت التطبيق"</strong> أو <strong>"Install App"</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: COMPREHENSIVE ENTERPRISE PRIVACY & POLICY */}
          {activeTab === 'privacy' && (
            <div className="space-y-3.5 animate-in fade-in leading-relaxed text-slate-700">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">
                    وثيقة السياسات والسرية والحماية الرقمية المعتمدة
                  </h4>
                  <div className="text-[11px] text-amber-800 font-bold">
                    إدارة القطاع المنزلي لمجموعة دريم طنطاوي
                  </div>
                </div>
              </div>

              {/* Clause 1: Trade Secrets & Financial Data */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-1.5">
                <div className="font-black text-slate-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>المادة الأولى: سرية وأمان البيانات التجارية والمالية</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  تُعد جميع أسعار الجملة، الخصومات الممنوحة، قوائم المنتجات، وهوامش الربحية، وحركات المخازن المركزية أسراراً تجارية مقدسة وحصرية لإدارة القطاع المنزلي لمجموعة دريم طنطاوي. يُحظر تماماً تصوير الشاشات أو استخراج البيانات أو تداولها خارج النطاق الوظيفي المصرح به.
                </p>
              </div>

              {/* Clause 2: Customer & Merchant Privacy */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-1.5">
                <div className="font-black text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>المادة الثانية: حماية خصوصية العملاء وحسابات التجار</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  يلتزم جميع المستخدمين بالحفاظ الكامل على سرية بيانات التجار والعملاء، وتشمل أرقام الهواتف، العناوين، وسجلات الذمم المالية والمديونيات. يُمنع استخدام تلك البيانات في غير المعاملات التجارية الرسمية الخاصة بالمجموعة أو تمريرها لأي جهات منافسة.
                </p>
              </div>

              {/* Clause 3: Immutable Audit Logs */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-1.5">
                <div className="font-black text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>المادة الثالثة: سجل العمليات والتدقيق الرقمي الصارم (Audit Trail)</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  تخضع كل عملية تجرى داخل المنظومة (حجز طلبيات، اعتمادات مشرفين، تعديل أسعار، سندات قبض وتحصيل، أو أذونات صرف مخزني) لسجل تدقيق رقمي فوري غير قابل للتعديل أو الحذف، مسجلاً به وقت التنفيذ وهوية المستخدم لحماية أموال الشركة وتوثيق النزاهة.
                </p>
              </div>

              {/* Clause 4: Individual Legal Accountability */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-1.5">
                <div className="font-black text-slate-900 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>المادة الرابعة: الصلاحيات والمسؤولية القانونية الفردية لمستخدم الحساب</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  يعتبر حساب الدخول بمثابة التوقيع الإلكتروني الرسمي لصاحبه. يتحمل كل مستخدم (مندوب، مشرف، مدير فرع، أمين مخزن، أو مستشار قانوني) المسؤولية القانونية والمادية الكاملة عن أي إجراء صادر من حسابه، ويُحظر مشاركة كلمات المرور أو فتح الحساب لأشخاص غير مصرح لهم.
                </p>
              </div>

              {/* Clause 5: Field Devices & Offline Conduct */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-1.5">
                <div className="font-black text-slate-900 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>المادة الخامسة: ضوابط تشغيل الأجهزة الميدانية والعمل بدون إنترنت</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  البيانات المخزنة محلياً على الهواتف والأجهزة اللوحية لتسيير العمل بدون شبكة تخضع لمعايير تشفير محلية وتفريغ تلقائي فور المزامنة مع السيرفر الرئيسي. في حال فقدان أو سرقة أي جهاز ميداني، يلتزم الموظف بإخطار الإدارة فوراً لإيقاف جلسة الدخول سحابياً.
                </p>
              </div>

              {/* Clause 6: Cloud Security & Encryption */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-1.5">
                <div className="font-black text-slate-900 flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>المادة السادسة: أمن التخزين السحابي والتشفير والنسخ الاحتياطي</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  تعتمد المنظومة على خوادم سحابية مؤمنة بأحدث بروتوكولات التشفير (HTTPS / TLS 1.3) مع نسخ احتياطي دوري متزامن لقواعد البيانات، مما يضمن استمرارية الأعمال بنسبة 99.9% وعدم ضياع أي فاتورة أو حركة مخزنية تحت أي ظرف.
                </p>
              </div>

              {/* Clause 7: Intellectual Property */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-[var(--app-line)] space-y-1.5">
                <div className="font-black text-slate-900 flex items-center gap-2">
                  <Award className="w-4 h-4 text-red-600 shrink-0" />
                  <span>المادة السابعة: حقوق الملكية الفكرية الحصرية</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  جميع الشفرات البرمجية، التصاميم، الواجهات، وتوزيعات الشاشات مخصصة ومملوكة حصرياً لـ <strong>إدارة القطاع المنزلي لمجموعة دريم طنطاوي</strong>. أي استنساخ جزئي أو كلي أو محاولة للهندسة العكسية يعرض المرتكب للملاحقة القانونية الجنائية والمدنية طبقاً لقوانين حماية الملكية الفكرية.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[var(--app-line)] flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400 font-bold">
            إدارة القطاع المنزلي لمجموعة دريم طنطاوي © 2026
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
