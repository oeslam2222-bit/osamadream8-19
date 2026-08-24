import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  History,
  Info,
  Layers,
  Package,
  QrCode,
  Receipt,
  RotateCcw,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Truck,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  XCircle,
  Zap
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

interface SystemWorkflowGuideProps {
  onNavigateToTab?: (tab: string) => void;
}

export const SystemWorkflowGuide: React.FC<SystemWorkflowGuideProps> = ({ onNavigateToTab }) => {
  const { currentUser } = useApp();
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<number>(1);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const workflowSteps = [
    {
      step: 1,
      id: 'step-pending',
      title: '1. حجز الطلبية (قيد مراجعة المشرف ⏳)',
      subtitle: 'إنشاء الفاتورة من المندوب في موقع العميل',
      executedBy: 'مندوب المبيعات (Sales Rep)',
      badge: 'قيد مراجعة المشرف',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
      icon: Receipt,
      iconBg: 'bg-amber-500 text-slate-950',
      summary: 'يقوم المندوب باختيار العميل والأصناف المطلوبة وتحديد نوع الدفع (كاش / آجل) ثم يضغط "حجز واعتماد الطلبية".',
      whatHappens: [
        'يقوم النظام بحجز الكميات مؤقتاً كـ (Pending) لحماية الأصناف من البيع المزدوج لمندوب آخر.',
        'يتم إرسال إشعار فوري لصفحة ولوحة المشرف التابع له المندوب.',
        'تبقى الفاتورة برقم مؤقت قيد المراجعة ولا تصرف من رصيد المخزن الفعلي حتى يعتمدها المشرف.',
        'إذا كان المندوب بدون إنترنت (Offline)، يتم حفظ الفاتورة محلياً والمزامنة فور عودة الشبكة.'
      ],
      tip: 'لا تقلق من انقطاع الإنترنت؛ الفاتورة تُحفظ في ذاكرة الموبايل فوراً.'
    },
    {
      step: 2,
      id: 'step-approved',
      title: '2. الاعتماد والصرف المخزني (معتمدة ومصروفة ✅)',
      subtitle: 'موافقة المشرف وتأكيد الخصم المباشر من المخزن',
      executedBy: 'مشرف القطاع / مدير الفرع / الأدمن',
      badge: 'معتمدة ومصروفة',
      badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      icon: CheckCircle2,
      iconBg: 'bg-emerald-600 text-white',
      summary: 'يراجع المشرف تفاصيل الطلبية وأسعار الأصناف وحد الائتمان للعميل ثم يضغط زر "اعتماد وصرف المخزون ✅".',
      whatHappens: [
        'يتم خصم الكميات نهائياً من رصيد المخزن الفعلي في الفرع وتحديث الكميات المتاحة لحظياً.',
        'تتحول حالة الفاتورة رسمياً إلى (معتمدة ومصروفة) وتدخل في حسابات مبيعات اليومية.',
        'يصدر النظام باركود ورمز QR المعتمد ورقم الفاتورة الضريبي.',
        'يتم توثيق اسم المشرف المنفذ وتوقيت العملية بالثانية في سجل التدقيق (Audit Log).'
      ],
      tip: 'يمكن للمشرف اعتماد الفواتير مفردة أو بالجملة (Bulk Approval) بضغطة واحدة.'
    },
    {
      step: 3,
      id: 'step-prep',
      title: '3. تجهيز الشحنة والتعبئة (جاري التجهيز 📦)',
      subtitle: 'تجهيز الكراتين في المخزن وتحميل سيارة التوزيع',
      executedBy: 'أمين المخزن / المشرف / مسؤول التجهيز',
      badge: 'جاري التجهيز',
      badgeColor: 'bg-blue-100 text-blue-900 border-blue-300',
      icon: Package,
      iconBg: 'bg-blue-600 text-white',
      summary: 'بعد الاعتماد، يقوم فريق المخزن بفرز البضاعة من الأرفف وطباعة إذن التحميل لسيارة التوزيع.',
      whatHappens: [
        'تتحول الحالة إلى (جاري التجهيز) لتوضيح أن الشحنة قيد التعبئة.',
        'تجهيز بوليصة الشحن مع سائق خط السير المحدد لكل منطقة ومندوب.',
        'إشعار المندوب بأن الطلبية جاهزة للخروج في خط السير.'
      ],
      tip: 'يمكن طباعة الفاتورة بحجم كاشير حراري 80mm أو A4 رسمي لتسليمها مع السائق.'
    },
    {
      step: 4,
      id: 'step-delivered',
      title: '4. تسليم العميل والتحصيل (تم التسليم للعميل 🚚)',
      subtitle: 'استلام البضاعة وتوريد النقدية أو تسجيل الآجل',
      executedBy: 'مندوب المبيعات / مسؤول التوزيع',
      badge: 'تم التسليم للعميل',
      badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      icon: Truck,
      iconBg: 'bg-indigo-600 text-white',
      summary: 'وصول الشحنة للعميل ومراجعة البضاعة والتوقيع على إيصال الاستلام وتحصيل القيمة المالية.',
      whatHappens: [
        'تأكيد استلام العميل وتحويل الحالة إلى (تم التسليم).',
        'ترحيل المبلغ المقبوض كاش إلى عهدة المندوب أو تقييد المبلغ الآجل في كشف حساب العميل.',
        'إمكانية إرسال نسخة إلكترونية بصيغة PDF وفاتورة إلكترونية عبر WhatsApp للعميل مباشرة.'
      ],
      tip: 'يستطيع المندوب مشاركة الفاتورة عبر واتساب بضغطة زر واحدة دون الحاجة لأوراق.'
    },
    {
      step: 5,
      id: 'step-cancel-return',
      title: '5. مسار الإلغاء والمرتجع (اعتذار العميل أو المرتجع ❌🔄)',
      subtitle: 'إعادة البضاعة فورياً للمخزن وتوثيق أسباب الإلغاء',
      executedBy: 'مشرف القطاع / مدير الفرع / الأدمن',
      badge: 'ملغاة / مرتجع',
      badgeColor: 'bg-rose-100 text-rose-900 border-rose-300',
      icon: RotateCcw,
      iconBg: 'bg-rose-600 text-white',
      summary: 'في حالة اعتذار العميل عن الاستلام (لظروف سيولة، خطأ في الأصناف، إلغاء الموعد)، يقوم المشرف برفض الطلبية أو تسجيل المرتجع.',
      whatHappens: [
        '♻️ إعادة فورية للمخزون: يقوم النظام تلقائياً وبأعلى دقة بإرجاع كامل كميات الفاتورة إلى الرصيد المتاح للفرع!',
        'إلغاء المديونية من حساب العميل وعدم احتسابها ضمن مبيعات المندوب المحققة.',
        'توثيق سبب الإلغاء نصياً (مثل: اعتذار العميل لظروف سيولة طارئة) واسم المشرف وتاريخ الإلغاء بالثانية في سجل العمليات.',
        'عدم إمكانية صرف الفاتورة مرة أخرى لضمان النزاهة المحاسبية.'
      ],
      tip: 'النظام يحمي المخزن بنسبة 100%؛ لن تضيع أي قطعة عند الإلغاء أو المرتجع.'
    }
  ];

  const rolesMatrix = [
    {
      role: 'مندوب المبيعات (Sales Rep)',
      color: 'border-emerald-300 bg-emerald-50/60 text-emerald-900',
      badge: 'bg-emerald-100 text-emerald-800',
      abilities: [
        'تصفح كتالوج الأصناف بالصور والأسعار والرصيد المتاح.',
        'إنشاء فواتير وحجز طلبيات العملاء نقداً أو بالآجل.',
        'متابعة فواتيره الخاصة وحالات اعتمادها (قيد المراجعة / معتمدة / ملغاة).',
        'مشاركة الفواتير الإلكترونية مع العملاء عبر الواتساب والـ PDF.',
        'العمل بدون إنترنت (Offline Mode) مع المزامنة التلقائية.'
      ],
      cannot: [
        'لا يستطيع اعتماد أو صرف المخزون بنفسه دون موافقة المشرف.',
        'لا يستطيع تعديل أرصدة المخازن أو توريدات المصنع.',
        'لا يستطيع رؤية فواتير أو أرقام مناديب الفروع الأخرى.'
      ]
    },
    {
      role: 'مشرف قطاع المناديب (Supervisor)',
      color: 'border-blue-300 bg-blue-50/60 text-blue-900',
      badge: 'bg-blue-100 text-blue-800',
      abilities: [
        'مراجعة فواتير المناديب التابعين له واعتماد صرف البضاعة.',
        'رفض أو إلغاء الطلبيات مع توثيق السبب وإرجاع المخزون آلياً.',
        'تسجيل مرتجعات المبيعات وإعادة الكميات للرصيد الصالح للبيع.',
        'متابعة مستهدفات المبيعات اليومية والشهرية لقطاعه.',
        'الاطلاع على حركة المخزون وسجل تدقيق العمليات (Audit Log).'
      ],
      cannot: [
        'لا يستطيع حذف مستخدمين أو تغيير إعدادات الربط السحابي العام.'
      ]
    },
    {
      role: 'مشرف / مدير الفرع (Branch Supervisor)',
      color: 'border-purple-300 bg-purple-50/60 text-purple-900',
      badge: 'bg-purple-100 text-purple-800',
      abilities: [
        'إدارة كامل مخزون الفرع (توريدات المصنع، تسويات الجرد، التحويلات).',
        'اعتماد كافة فواتير المناديب والمشرفين في الفرع.',
        'استيراد وتصدير الشيتات ومطابقة المخزون مع فواتير الشراء.',
        'تفعيل واعتماد حسابات المناديب الجدد للفرع.'
      ],
      cannot: [
        'التعديل على الفروع الأخرى إلا إذا كان مصرحاً له من الإدارة.'
      ]
    },
    {
      role: 'المطور والمسؤول العام (Admin & Developer)',
      color: 'border-amber-400 bg-amber-50/60 text-amber-950',
      badge: 'bg-amber-100 text-amber-900',
      abilities: [
        'صلاحيات غير مقيدة (Super Admin) على كافة الفروع والقطاعات.',
        'إدارة قاعدة البيانات والمزامنة مع Supabase وبرامج الحسابات (ERP).',
        'تفعيل حسابات المستخدمين الجدد وتحديد أدوارهم ومشرفيهم.',
        'مسح أو تصدير سجلات التدقيق والتقارير المالية الشاملة.'
      ],
      cannot: []
    }
  ];

  const faqs = [
    {
      q: 'ماذا يحدث للمخزون إذا قمت بإلغاء فاتورة معتمدة أو إذا اعتذر العميل؟',
      a: 'يقوم النظام فوراً بإلغاء الخصم وإرجاع كامل كميات الفاتورة تلقائياً إلى رصيد المخزن المتاح، مع توثيق سبب الاعتذار واسم المشرف المنفذ وتوقيت العملية في سجل التدقيق Audit Log.'
    },
    {
      q: 'هل يمكن للمندوب البيع بالآجل وما هو الضابط في ذلك؟',
      a: 'نعم، يمكن للمندوب اختيار نوع الدفع "آجل" وتحديد اسم العميل، ولكن الفاتورة تذهب للمشرف كـ (قيد مراجعة المشرف) لفحص حد الائتمان وسجل سداد العميل قبل اعتماد وصرف البضاعة.'
    },
    {
      q: 'كيف يعمل البرنامج إذا انقطع الإنترنت لدى المندوب في الشارع؟',
      a: 'البرنامج مجهز بتقنية PWA وذاكرة محلية مشفرة؛ يستطيع المندوب عمل الفواتير وحجزها أوفلاين بالكامل، وبمجرد عودة الإنترنت تظهر علامة "متصل" ويقوم النظام بمزامنة كافة الطلبيات تلقائياً مع السيرفر دون فقدان أي بيانات.'
    },
    {
      q: 'كيف نضمن عدم بيع صنف واحد لمندوبين في نفس اللحظة؟',
      a: 'فور قيام المندوب بالضغط على "حجز الطلبية"، يقوم النظام بحجز الكمية المطلوبة فورياً (Pending Reserved Quantity) وخصمها من الرصيد المتاح للبيع، بحيث يرى بقية المناديب الكمية الحقيقية المتبقية فقط.'
    },
    {
      q: 'كيف يتم الربط مع الإكسل وجوجل شيتات وبرامج المحاسبة (ERP)؟',
      a: 'يوفر النظام تصدير فواتير إلكترونية معتمدة بصيغة Excel / CSV، مع إمكانية استيراد شيتات المنتجات والمخزون بضغطة زر واحدة من قسم "شيتات الإكسل" وربط Supabase والمحاسبة من وحدة المطور.'
    }
  ];

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300 pb-16">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5 sm:p-7 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-lg shrink-0">
              <FileCheck2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  دليل دورة العمل وتشغيل منظومة دريم طنطاوي
                </h1>
                <span className="hidden sm:inline-block text-[11px] px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 font-bold">
                  Workflow Guide
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                شرح تفصيلي لدورة حياة الفاتورة من إنشاء المندوب إلى اعتماد وصرف المشرف والتسليم أو الإلغاء واسترجاع المخزون.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('catalog')}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <Boxes className="w-4 h-4" />
                <span>بدء عمل فاتورة جديدة</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Progress Indicator Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-6 pt-5 border-t border-slate-700/80">
          {workflowSteps.map((step) => {
            const Icon = step.icon;
            const isSelected = activeWorkflowStep === step.step;
            return (
              <button
                key={step.step}
                onClick={() => setActiveWorkflowStep(step.step)}
                className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold'
                    : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${isSelected ? 'bg-slate-950 text-amber-300' : 'bg-slate-900 text-slate-400'}`}>
                    خطوة {step.step}
                  </span>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-xs font-black mt-2 truncate">{step.badge}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Step Details Card */}
      {(() => {
        const current = workflowSteps.find((s) => s.step === activeWorkflowStep) || workflowSteps[0];
        const Icon = current.icon;
        return (
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 p-5 sm:p-7 space-y-6">
            
            {/* Step Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-md shrink-0 ${current.iconBg}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-black text-slate-900">{current.title}</h2>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${current.badgeColor}`}>
                      {current.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{current.subtitle}</p>
                </div>
              </div>

              <div className="bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 flex items-center gap-2 self-start sm:self-auto">
                <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="text-xs">
                  <span className="text-slate-500">المنفذ للخطوة: </span>
                  <strong className="text-slate-900 font-black">{current.executedBy}</strong>
                </div>
              </div>
            </div>

            {/* Summary Box */}
            <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 text-xs sm:text-sm text-slate-800 leading-relaxed">
              <div className="font-black text-amber-950 mb-1 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-600" />
                <span>ملخص الإجراء:</span>
              </div>
              {current.summary}
            </div>

            {/* Action Details Grid */}
            <div className="space-y-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>ماذا يحدث في النظام والمخزون خلال هذه المرحلة؟</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {current.whatHappens.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pro Tip Box */}
            <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <span className="text-amber-300 font-black">ملاحظة أمان وتشغيل: </span>
                  <span className="text-slate-200">{current.tip}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-1 shrink-0">
                <button
                  disabled={activeWorkflowStep === 1}
                  onClick={() => setActiveWorkflowStep((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] font-bold disabled:opacity-40 transition cursor-pointer"
                >
                  السابق
                </button>
                <button
                  disabled={activeWorkflowStep === workflowSteps.length}
                  onClick={() => setActiveWorkflowStep((p) => Math.min(workflowSteps.length, p + 1))}
                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-[11px] font-black disabled:opacity-40 transition cursor-pointer"
                >
                  التالي
                </button>
              </div>
            </div>

          </div>
        );
      })()}

      {/* Visual Lifecycle Flowchart */}
      <div className="bg-white p-5 sm:p-7 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-amber-600" />
            <h2 className="text-base sm:text-lg font-black text-slate-900">
              المخطط البصري لمسارات الفاتورة والمخزون
            </h2>
          </div>
          <span className="text-xs text-slate-500">اضغط على أي مرحلة للتفاصيل</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
          
          {/* Box 1 */}
          <div
            onClick={() => setActiveWorkflowStep(1)}
            className={`p-4 rounded-2xl border text-center space-y-2 cursor-pointer transition transform hover:-translate-y-0.5 ${
              activeWorkflowStep === 1 ? 'border-amber-400 bg-amber-50 shadow-md ring-2 ring-amber-400/50' : 'border-slate-200 bg-slate-50 hover:bg-white'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 mx-auto flex items-center justify-center font-black">
              1
            </div>
            <div className="font-black text-xs text-slate-900">حجز الطلبية</div>
            <span className="text-[10px] px-2 py-0.5 bg-amber-200 text-amber-900 rounded font-bold">
              قيد مراجعة المشرف ⏳
            </span>
            <p className="text-[11px] text-slate-500">حجز معلق لمنع البيع المزدوج</p>
          </div>

          {/* Box 2 */}
          <div
            onClick={() => setActiveWorkflowStep(2)}
            className={`p-4 rounded-2xl border text-center space-y-2 cursor-pointer transition transform hover:-translate-y-0.5 ${
              activeWorkflowStep === 2 ? 'border-emerald-500 bg-emerald-50 shadow-md ring-2 ring-emerald-400/50' : 'border-slate-200 bg-slate-50 hover:bg-white'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center font-black">
              2
            </div>
            <div className="font-black text-xs text-slate-900">اعتماد المشرف</div>
            <span className="text-[10px] px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded font-bold">
              معتمدة ومصروفة ✅
            </span>
            <p className="text-[11px] text-slate-500">خصم نهائي وتوليد الفاتورة</p>
          </div>

          {/* Box 3 */}
          <div
            onClick={() => setActiveWorkflowStep(3)}
            className={`p-4 rounded-2xl border text-center space-y-2 cursor-pointer transition transform hover:-translate-y-0.5 ${
              activeWorkflowStep === 3 ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-400/50' : 'border-slate-200 bg-slate-50 hover:bg-white'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 mx-auto flex items-center justify-center font-black">
              3
            </div>
            <div className="font-black text-xs text-slate-900">تجهيز المخزن</div>
            <span className="text-[10px] px-2 py-0.5 bg-blue-200 text-blue-900 rounded font-bold">
              جاري التجهيز 📦
            </span>
            <p className="text-[11px] text-slate-500">تعبئة وطباعة بوليصة التحميل</p>
          </div>

          {/* Box 4 */}
          <div
            onClick={() => setActiveWorkflowStep(4)}
            className={`p-4 rounded-2xl border text-center space-y-2 cursor-pointer transition transform hover:-translate-y-0.5 ${
              activeWorkflowStep === 4 ? 'border-indigo-500 bg-indigo-50 shadow-md ring-2 ring-indigo-400/50' : 'border-slate-200 bg-slate-50 hover:bg-white'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-800 mx-auto flex items-center justify-center font-black">
              4
            </div>
            <div className="font-black text-xs text-slate-900">التسليم والتحصيل</div>
            <span className="text-[10px] px-2 py-0.5 bg-indigo-200 text-indigo-900 rounded font-bold">
              تم التسليم 🚚
            </span>
            <p className="text-[11px] text-slate-500">تحصيل كاش أو قيد آجل</p>
          </div>

          {/* Box 5 (Return/Cancel) */}
          <div
            onClick={() => setActiveWorkflowStep(5)}
            className={`p-4 rounded-2xl border text-center space-y-2 cursor-pointer transition transform hover:-translate-y-0.5 ${
              activeWorkflowStep === 5 ? 'border-rose-500 bg-rose-50 shadow-md ring-2 ring-rose-400/50' : 'border-slate-200 bg-slate-50 hover:bg-white'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-800 mx-auto flex items-center justify-center font-black">
              5
            </div>
            <div className="font-black text-xs text-slate-900">مسار الإلغاء والمرتجع</div>
            <span className="text-[10px] px-2 py-0.5 bg-rose-200 text-rose-900 rounded font-bold">
              اعتذار / مرتجع ❌
            </span>
            <p className="text-[11px] text-slate-500">إرجاع آلي فوري لرصيد المخزن</p>
          </div>

        </div>
      </div>

      {/* Role & Permissions Matrix */}
      <div className="bg-white p-5 sm:p-7 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <Users className="w-5 h-5 text-amber-600" />
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">
              جدول الصلاحيات وتوزيع المسؤوليات
            </h2>
            <p className="text-xs text-slate-500">من ينفذ كل مهمة داخل منظومة التوزيع</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {rolesMatrix.map((rm, idx) => (
            <div key={idx} className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${rm.color}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-slate-900">{rm.role}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${rm.badge}`}>
                  صلاحية رسمية
                </span>
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-black text-slate-700 block">ما يمكنه تنفيذه:</span>
                {rm.abilities.map((ab, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{ab}</span>
                  </div>
                ))}
              </div>

              {rm.cannot.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-slate-200/60">
                  <span className="text-[11px] font-black text-slate-500 block">القيود للحماية والنزاهة:</span>
                  {rm.cannot.map((cn, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                      <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>{cn}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Frequently Asked Questions (FAQ) Accordion */}
      <div className="bg-white p-5 sm:p-7 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <HelpCircle className="w-5 h-5 text-amber-600" />
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">
              الأسئلة الشائعة حول إدارة الفواتير والمخزون
            </h2>
            <p className="text-xs text-slate-500">إجابات مباشرة على استفسارات فريق المبيعات والمشرفين</p>
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="border border-slate-200 rounded-2xl overflow-hidden transition"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-4 text-right bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between gap-3 text-xs sm:text-sm font-black text-slate-900 transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 text-xs flex items-center justify-center font-black shrink-0">
                      ؟
                    </span>
                    <span>{faq.q}</span>
                  </span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                </button>

                {isOpen && (
                  <div className="p-4 bg-white text-xs sm:text-sm text-slate-700 leading-relaxed border-t border-slate-200">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
