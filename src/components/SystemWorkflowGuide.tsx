import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Building,
  CalendarCheck,
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
  Target,
  TrendingUp,
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

/**
 * خطوة واحدة في أي دورة عمل.
 *
 * الشكل واحد سواء كانت دورة الفاتورة ولا دورة التوقعات، عشان كارد العرض
 * والشرائط يتشغلوا على أي دورة من غير تكرار.
 */
interface GuideStep {
  step: number;
  id: string;
  title: string;
  subtitle: string;
  executedBy: string;
  badge: string;
  badgeColor: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  summary: string;
  whatHappens: string[];
  tip: string;
}

/** ألوان الدورة — الكارت والشريط بياخدوا اللون من هنا مش من جوّاهم. */
interface GuideAccent {
  barOn: string;
  barOff: string;
  /** صندوق الملخّص */
  softBg: string;
  softBorder: string;
  softText: string;
  /* عنوان صندوق التفاصيل */
  detailHeading: string;
  /* لون نص الملاحظة في الصندوق الأخير */
  noteText: string;
  noteIcon: string;
  prevBtn: string;
  nextBtn: string;
}

/**
 * عنصر واحد في سلسلة الإشراف.
 *
 * الاسم والصفة بالحرفي زي ما هم مكتوبين في مصفوفة البيانات. مفيش أي وصف
 * ولا تفسير متضاف هنا — أي كلام زي «الإشراف العام على...» لازم يتكتب في
 * البيانات نفسها لو حابب يظهر، مش من عن_component.
 */
interface ChainEntry {
  name: string;
  role: string;
  initial: string;
  /** تدرّج لون الشارة الدائرية */
  badge: string;
  /** لون نص الصفة */
  roleColor: string;
  /** لون نقطة الصفة */
  roleDot: string;
  /** حلقة ملوّنة حول الكارت */
  ring: string;
  /** ترقيم تقني بالنظام الست عشري */
  tag: string;
}

/**
 * سلسلة الإشراف.
 *
 * معروضة من فوق لتحت بنفس ترتيب البيانات، وخط الرابط بين المستويات على
 * اليمين لأن الصفحة كلها RTL. الكارت بيعرض الاسم والصفة وبس.
 */
const SupervisionChain: React.FC<{ entries: ChainEntry[] }> = ({ entries }) => (
  <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-xl">
    {/* شبكة تقنية خفيفة في الخلفية */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-40"
      style={{
        backgroundImage:
          'linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
      }}
    />
    {/* توهّج علوي */}
    <div
      aria-hidden
      className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-2/3 rounded-full blur-3xl"
      style={{ background: 'radial-gradient(closest-side, rgba(56,189,248,0.16), transparent)' }}
    />

    <div className="relative p-4 sm:p-5">
      {entries.map((entry, idx) => {
        const last = idx === entries.length - 1;
        return (
          <div key={entry.name} className="flex items-stretch gap-3 sm:gap-4">
            {/* خط الرابط: على اليمين لأن الاتجاه RTL */}
            <div className="flex flex-col items-center w-8 sm:w-10 shrink-0">
              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br ${entry.badge} text-slate-950 flex items-center justify-center font-black text-base sm:text-lg shrink-0 ring-1 ring-white/10`}
              >
                {entry.initial}
              </div>
              {!last && (
                <div className="flex-1 w-px bg-gradient-to-b from-slate-600 to-slate-800 my-1" />
              )}
            </div>

            {/* الكارت: الاسم والصفة وبس */}
            <div
              className={`flex-1 min-w-0 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xs p-4 shadow-lg ${entry.ring} mb-3`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <span className="text-base sm:text-lg font-black text-white tracking-tight">
                    {entry.name}
                  </span>
                  <span className="flex items-center gap-1.5 mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${entry.roleDot}`} />
                    <span className={`text-[11px] font-bold ${entry.roleColor}`}>{entry.role}</span>
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-500 bg-slate-950/70 border border-slate-800 rounded-lg px-2 py-1 shrink-0">
                  {entry.tag}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
/**
 * أعمدة شريط الخطوات حسب عددها.
 *
 * لازم تكون أسماء الـclasses كاملة مكتوبة حرفياً هنا: Tailwind بيبني الـCSS
 * لما يمسح الملفات، فلو بنينا الاسم بسلسلة `sm:grid-cols-${n}` مش هيلاقيه ومش
 * هيعمل الأعمدة صح على الموبايل.
 */
const STEP_STRIP_COLUMNS: Record<number, string> = {
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-5',
};

const INVOICE_ACCENT: GuideAccent = {
  barOn: 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold',
  barOff: 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border-slate-700',
  softBg: 'bg-amber-50/60',
  softBorder: 'border-amber-200/80',
  softText: 'text-amber-950',
  detailHeading: 'ماذا يحدث في النظام والمخزون خلال هذه المرحلة؟',
  noteText: 'text-amber-300',
  noteIcon: 'text-amber-400',
  prevBtn: 'bg-slate-800 hover:bg-slate-700',
  nextBtn: 'bg-amber-500 hover:bg-amber-400 text-slate-950',
};

const FORECAST_ACCENT: GuideAccent = {
  barOn: 'bg-teal-600 text-white border-teal-500 shadow-md font-bold',
  barOff: 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border-slate-700',
  softBg: 'bg-teal-50/60',
  softBorder: 'border-teal-200/80',
  softText: 'text-teal-950',
  detailHeading: 'ماذا يحدث في النظام خلال هذه المرحلة؟',
  noteText: 'text-teal-300',
  noteIcon: 'text-teal-400',
  prevBtn: 'bg-slate-800 hover:bg-slate-700',
  nextBtn: 'bg-teal-600 hover:bg-teal-500 text-white',
};

/**
 * شريط اختيار الخطوات.
 *
 * مبني على مصفوفة الخطوات بدل مربعات مكتوبة بإيدها، عشان يقدر يشتغل على أي عدد
 * دورات وأي عدد خطوات من غير ما يتكرر الكود.
 */
const StepStrip: React.FC<{
  steps: GuideStep[];
  active: number;
  onSelect: (n: number) => void;
  accent: GuideAccent;
}> = ({ steps, active, onSelect, accent }) => (
  <div
    className={`grid ${STEP_STRIP_COLUMNS[steps.length] || STEP_STRIP_COLUMNS[5]} gap-2 pt-5 border-t border-slate-700/80`}
  >
    {steps.map((step) => {
      const Icon = step.icon;
      const isSelected = active === step.step;
      return (
        <button
          key={step.step}
          onClick={() => onSelect(step.step)}
          className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between ${
            isSelected ? accent.barOn : accent.barOff
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
);

/** كارت تفاصيل الخطوة المختارة مع تنقّل السابق/التالي. */
const StepDetailCard: React.FC<{
  steps: GuideStep[];
  active: number;
  onSelect: (n: number) => void;
  accent: GuideAccent;
}> = ({ steps, active, onSelect, accent }) => {
  const current = steps.find((s) => s.step === active) || steps[0];
  if (!current) return null;
  const Icon = current.icon;
  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 p-5 sm:p-7 space-y-6">
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

      <div className={`${accent.softBg} p-4 rounded-2xl border ${accent.softBorder} text-xs sm:text-sm text-slate-800 leading-relaxed`}>
        <div className={`font-black ${accent.softText} mb-1 flex items-center gap-1.5`}>
          <Info className={`w-4 h-4 ${accent.softText}`} />
          <span>ملخص الإجراء:</span>
        </div>
        {current.summary}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Zap className={`w-4 h-4 ${accent.noteIcon}`} />
          <span>{accent.detailHeading}</span>
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

      <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className={`w-5 h-5 ${accent.noteIcon} shrink-0`} />
          <div>
            <span className={`${accent.noteText} font-black`}>ملاحظة أمان وتشغيل: </span>
            <span className="text-slate-200">{current.tip}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            disabled={active === steps[0].step}
            onClick={() => onSelect(Math.max(steps[0].step, active - 1))}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-40 transition cursor-pointer ${accent.prevBtn}`}
          >
            السابق
          </button>
          <button
            disabled={active === steps[steps.length - 1].step}
            onClick={() => onSelect(Math.min(steps[steps.length - 1].step, active + 1))}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black disabled:opacity-40 transition cursor-pointer ${accent.nextBtn}`}
          >
            التالي
          </button>
        </div>
      </div>
    </div>
  );
};

export const SystemWorkflowGuide: React.FC<SystemWorkflowGuideProps> = ({ onNavigateToTab }) => {
  const { currentUser } = useApp();
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<number>(1);
  // كل دورة ليها مؤشر مستقل، عشان ماشي وأنا في دورة التوقع ما يغيّرش
  // الخطوة المعروضة في دورة الفاتورة والعكس.
  const [activeForecastStep, setActiveForecastStep] = useState<number>(1);
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

  /**
   * دورة التوقعات الشهرية.
   *
   * منفصلة عن دورة الفاتورة تماماً: الفاتورة شغل تنفيذ، والتوقع شغل
   * تخطيط. مكتوبة بنفس حقول دورة الفاتورة عشان الكارت المشترك يعرضها
   * بنفس الشكل بالظبط.
   */
  const forecastSteps: GuideStep[] = [
    {
      step: 1,
      id: 'forecast-monthly',
      title: '1. التوقع الشهري المستقل (رقم المندوب بنفسه 📅)',
      subtitle: 'الرقم الإجمالي المتوقع تحصيله من العميل خلال الشهر كله',
      executedBy: 'مندوب المبيعات (يكتب) — المشرف ومدير الفرع والإدارة يعدّلوا في نطاقهم',
      badge: 'شهري مستقل',
      badgeColor: 'bg-teal-100 text-teal-900 border-teal-300',
      icon: CalendarCheck,
      iconBg: 'bg-teal-600 text-white',
      summary:
        'كل مندوب يكتب لكل عميل رقماً واحداً يمثّل التحصيل المتوقّع منه خلال الشهر كله. الرقم ده مستقل تماماً وما بيتحسبش من أرقام الفترات — لأن المجموع أحياناً يخالف نية المندوب، مثلاً عميل سداده اتأخر وخرج من الشهر أصلاً.',
      whatHappens: [
        'الرقم بيتخزن في نفس جدول التوقعات تحت اسم «شهري»، والنظاميميّزه عن أرقام الفترات لوحده من غير أي عمود إضافي.',
        'لما المندوب ما يكونش كتب رقم، النظام بيعرض مجموع الفترات في نفس الخانة بلون مختلف وكلمة «محسوب من الفترات» عشان ما يختلطش الرقم المستقل بالمحسوب.',
        'الرقم الشهري هو اللي بيتقارن بهدف الشهر في كارت نسبة التغطية.',
        'مش لازم الشهر يتقسم لفترات أصلاً — من غير تقسيم، التوقع الشهري لوحده هو الشغل كله والجدول بيفتح عادي.'
      ],
      tip: 'اكتب الرقم اللي انت متوقعه فعلاً مش المحسوب؛ لو عايز تقارن، الفرق بينه وبين «مجموع الفترات» باين جنب بعض في نفس الصف.'
    },
    {
      step: 2,
      id: 'forecast-periods',
      title: '2. التوقع لكل فترة (لو الإدارة قسمت الشهر 📆)',
      subtitle: 'توزيع التحصيل المتوقع على فترات الشهر',
      executedBy: 'مندوب المبيعات (يكتب) — الإدارة وحدها بتحدد التقسيم وتسمّيه',
      badge: 'أسبوعي / بالفترة',
      badgeColor: 'bg-sky-100 text-sky-900 border-sky-300',
      icon: Layers,
      iconBg: 'bg-sky-600 text-white',
      summary:
        'لو الإدارة قسمت الشهر لفترات، كل عميل بياخد عمود لكل فترة والمندوب يكتب المتوقّع في كل فترة لوحدها. ولو ما فيش تقسيم خالص، العمود ده مش بيظهر والجدول بيبقى على التوقع الشهري بس.',
      whatHappens: [
        'تقسيم الشهر بياخده الأدمن وحده: يختار أي عدد فترات من 1 لغاية 8، أو صفر يعني «بلا تقسيم»، وبيقدر يسمي كل فترة باسم يفهمه الفريق زي «نص الشهر».',
        'مش مطلوب الفترات تغطّي أيام الشهر كلها — ممكن فترة في نص الشهر والباقي مفتوح، وده اختيار مشروع في شهر بيبدأ التحصيل فيه متأخر.',
        'كل فترة ليها نفس دورة الاعتماد لوحدها: مسودة ← بعث للمشرف ← معتمدة أو راجعة للتعديل.',
        'لو غيّرت التقسيم بعد ما أرقام كتبت، الأرقام القديمة بتفضل محفوظة، بس بتظهر كـ«أرقام معلّقة» لإشعار الأدمن ومش بتتحسب في أي رقم على الصفحة.'
      ],
      tip: 'تسمية الفترات بNames واضحة («نص الشهر» بدل «أسبوع 2») بتوفّر على الفريق كلام كتير وقت الاعتماد.'
    },
    {
      step: 3,
      id: 'forecast-approval',
      title: '3. الإرسال والاعتماد (مسودة ← بعث ← معتمد 🔁)',
      subtitle: 'دورة مراجعة المشرف لأرقام التوقع',
      executedBy: 'مندوب (يبعت) ← مشرف القطاع أو مدير الفرع أو الإدارة (يعتمد أو يرجّع)',
      badge: 'مراجعة واعتماد',
      badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      icon: ShieldCheck,
      iconBg: 'bg-indigo-600 text-white',
      summary:
        'لما المندوب يخلص أرقامه بيبعتها للمشرف. المشرف بيبص عليها ويعتمدها فتقفل، أو يرجّعها للمندوب بتعديل مطلوب مع سبب مكتوب.',
      whatHappens: [
        'كل فترة ليها حالة مستقلة — يمكن المندوب يكون خلص الفترة الأولى ولسه في التانية.',
        'أضعف حالة في الفترة هي اللي بتفتحها: لو في عميل واحد لسه مسودة، الفترة كلها بتفضل مفتوحة عند المشرف.',
        'الاعتماد بيقفل الأرقام: محدش يعدّل بعدها إلا بطلب تعديل من المشرف.',
        'الرجوع للتعديل بيتسجل سببه واسم المشرف وتوقيته، والمندوب بيشوف السبب تحت الخانة.'
      ],
      tip: 'المشرف بيقدر يعتمد فترة ويرجّع تانية في نفس اليوم — الموافقة مش لازم تكون على الشهر كله مرة واحدة.'
    },
    {
      step: 4,
      id: 'forecast-lock',
      title: '4. قفل الشهر ومراجعة التغطية (🔒 + 📊)',
      subtitle: 'تثبيت الأرقام ومقارنتها بهدف الشهر',
      executedBy: 'الأدمن والمطور فقط',
      badge: 'مقفل',
      badgeColor: 'bg-rose-100 text-rose-900 border-rose-300',
      icon: Target,
      iconBg: 'bg-rose-600 text-white',
      summary:
        'لما الشهر يخلص الأدمن بيقفله فبتقف الكتابة. وقبل القفل أو بعده، الصفحة بتقارن التوقع الشهري بهدف الشهر بتطلع نسبة التغطية لكل مندوب وحالة كل فترة.',
      whatHappens: [
        'نسبة التغطية = (التوقع الشهري ÷ هدف الشهر) × 100، ولو ما كتبش حد رقم شهري النظام بيرجع لمجموع الفترات.',
        'أربع حالات: متوقع مسبق (100% وفوق)، على المسار (80–99%)، متأخر (أقل من 80%)، ومفيش هدف متسجل.',
        'القفل بيحمي الأرقام المحسوبة بس، والأدمن بيقدر يفتح الشهر تاني في أي وقت — مفيش قفل نهائي من غير مخرج.',
        'شريط حالة الفترات بيوضح لكل مندوب كام فترة معتمدة وكام مبعوتة وكام رجعت.'
      ],
      tip: 'القفل بيقفل الكتابة مش القراءة — كل الأرقام والتقارير بتفضل متاحة للكل في نطاق صلاحياته.'
    }
  ];

  /**
   * سلسلة الإشراف — بالترتيب من أعلى إلى تحت.
   *
   * البيانات هنا مش من جدول المستخدمين عن قصد: دي بلوك تعريف بالمنظومة
   * (مين يشرف على مين)، مش بيانات تشغيل بتتغير. كل مستوى ليه تدرّج لوني
   * مختلف عشان التمييز يكون بالعين من غير ما يقرأ.
   */
  /**
   * سلسلة الإشراف — بالترتيب من أعلى إلى تحت.
   *
   * الأسماء والأوصفات بالحرفي، زي ما هي مكتوبة فوق. متضيفش هنا أي وصف أو
   * تفسير من عنا: لو حبيت تضيف جملة تحت أي اسم، ضيفها في `role` نفسها.
   */
  const supervisionChain: ChainEntry[] = [
    {
      name: 'الأستاذ محمد محمود',
      role: 'المشرف علي المنظومة والتقارير',
      initial: 'م',
      badge: 'from-amber-300 to-amber-500',
      roleColor: 'text-amber-300',
      roleDot: 'bg-amber-400',
      ring: 'ring-1 ring-amber-500/25',
      tag: '0x01',
    },
    {
      name: 'الأستاذ أحمد محمود',
      role: 'المشرف علي المنظومة والتقارير',
      initial: 'أ',
      badge: 'from-sky-300 to-sky-500',
      roleColor: 'text-sky-300',
      roleDot: 'bg-sky-400',
      ring: 'ring-1 ring-sky-500/25',
      tag: '0x02',
    },
    {
      name: 'أسامة إسلام',
      role: 'مطور الموقع',
      initial: 'أ',
      badge: 'from-teal-300 to-emerald-500',
      roleColor: 'text-teal-300',
      roleDot: 'bg-teal-400',
      ring: 'ring-1 ring-teal-500/25',
      tag: '0x03',
    },
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
        'كتابة التوقع الشهري المستقل لكل عميل، وكتابة التوقع في كل فترة لو الشهر متقسم.',
        'مشاركة الفواتير الإلكترونية مع العملاء عبر الواتساب والـ PDF.',
        'العمل بدون إنترنت (Offline Mode) مع المزامنة التلقائية.'
      ],
      cannot: [
        'لا يستطيع اعتماد أو صرف المخزون بنفسه دون موافقة المشرف.',
        'لا يستطيع تعديل أرصدة المخازن أو توريدات المصنع.',
        'لا يستطيع رؤية فواتير أو أرقام مناديب الفروع الأخرى.',
        'لا يستطيع تقسيم الشهر لفترات ولا قفل الشهر — دي صلاحيات الإدارة فقط.'
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
        'مراجعة توقعات مناديبه وإرسالها أو اعتمادها أو الرجوع بها للتعديل.',
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
        'تفعيل واعتماد حسابات المناديب الجدد للفرع.',
        'اعتماد توقعات كل مندوبي الفرع ومتابعة نسبة التغطية مقابل هدف الشهر.'
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
        'مسح أو تصدير سجلات التدقيق والتقارير المالية الشاملة.',
        'تقسيم الشهر على أي عدد فترات (أو بلا تقسيم) وتسميات الفترات وتواريخها.',
        'قفل الشهر وفتحه بعد اعتمادات المشرفين.'
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
    },
    {
      q: 'ما الفرق بين «التوقع الشهري المستقل» و«مجموع الفترات»؟',
      a: 'التوقع الشهري المستقل رقم بيكتبه المندوب بنفسه ويمثّل رأيه في تحصيل العميل خلال الشهر كله، وما بيتحسبش من الفترات. أمّا «مجموع الفترات» ورق آلي بيجمع أرقام الفترات بس. ولو ما كتبش المندوب رقماً شهرياً، النظام بيعرض مجموع الفترات في نفس الخانة بلون مختلف وكلمة «محسوب من الفترات» عشان ما يختلطش الرقم المستقل بالمحسوب.'
    },
    {
      q: 'لماذا تقسيم الشهر إلى فترات اختياري؟ وليش مش لازم يغطي كل الأيام؟',
      a: 'لأن إدارة الشهر قرار إداري مش قالب ثابت. الأدمن يختار أي عدد فترات من 1 لغاية 8 (أو صفر يعني بلا تقسيم)، وبيقدر يسمي كل فترة باسم يفهمه الفريق مثل «نص الشهر». تغطية الشهر كلها مش شرط: ممكن فترة في نص الشهر والباقي مفتوح، وده مشروع في شهر بيبدأ التحصيل فيه متأخر أو بيخلص بدري. الشيء الوحيد اللي النظام يرفضه هو تداخل فترتين في نفس اليوم، لأن كده اليوم بيتحسب مرتين.'
    },
    {
      q: 'ماذا يحدث للأرقام إذا غيّرت تقسيم الشهر بعد ما المندوبين كتبوا توقعاتهم؟',
      a: 'الأرقام بتفضل محفوظة في قاعدة البيانات وما بتتمسحش. لكن أي سطر فترة خرج من التقسيم الجديد بيظهر كـ«أرقام معلّقة» في تنبيه أعلى الصفحة، ومش بيتحسب في أي رقم (لا مجموع الفترات ولا نسبة التغطية) — عشان ما يظهرش رقم في مكان ما يشوفش مصدره. ولو عايز ترجّع الأرقام دي، افتح «تقسيم الفترات» ووسّع الشهر تاني.'
    },
    {
      q: 'ماذا يعني «قفل الشهر» في التوقعات؟',
      a: 'القفل بيوقف الكتابة في أرقام التوقع لكل المندوبين والمشرفين، ومينفعش حد يعدّل لحد ما الإدارة تفتح الشهر تاني. القفل بيحمي الأرقام المحسوبة بس — القراءة والتقارير بتفضل متاحة للكل في نطاق صلاحياته، والأدمن عنده مخرج دايماً يفتح بيه الشهر.'
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
                شرح تفصيلي لدورة حياة الفاتورة من إنشاء المندوب إلى اعتماد وصرف المشرف والتسليم أو الإلغاء واسترجاع المخزون — بالإضافة إلى دورة التوقعات الشهرية (التوقع الشهري، التقسيم الاختياري بالفترات، الاعتماد، وقفل الشهر).
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
        <StepStrip
          steps={workflowSteps}
          active={activeWorkflowStep}
          onSelect={setActiveWorkflowStep}
          accent={INVOICE_ACCENT}
        />
      </div>

      {/* Interactive Step Details Card */}
      <StepDetailCard
        steps={workflowSteps}
        active={activeWorkflowStep}
        onSelect={setActiveWorkflowStep}
        accent={INVOICE_ACCENT}
      />

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

      {/* ========================================================================= */}
      {/* دورة التوقعات الشهرية — محتوى بس، من غير مخطط بصري                   */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-slate-900 text-white p-5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-teal-500/25">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">دورة التوقعات الشهرية</h2>
                <span className="hidden sm:inline-block text-[11px] px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold">
                  Forecast Workflow
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                من رقم المندوب للشهر، مروراً بالفترات واعتماد المشرف، لحد قفل الشهر ومقارنة التوقع بهدفه.
              </p>
            </div>
          </div>

          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('forecast')}
              className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <TrendingUp className="w-4 h-4" />
              <span>فتح صفحة التوقعات</span>
            </button>
          )}
        </div>

        <StepStrip
          steps={forecastSteps}
          active={activeForecastStep}
          onSelect={setActiveForecastStep}
          accent={FORECAST_ACCENT}
        />
      </div>

      <StepDetailCard
        steps={forecastSteps}
        active={activeForecastStep}
        onSelect={setActiveForecastStep}
        accent={FORECAST_ACCENT}
      />

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
              الأسئلة الشائعة حول الفواتير والمخزون والتوقعات
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

      {/* سلسلة الإشراف */}
      <SupervisionChain entries={supervisionChain} />

    </div>
  );
};
