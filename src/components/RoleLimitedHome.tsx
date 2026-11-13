import React, { useMemo } from 'react';
import {
  Scale,
  RotateCcw,
  ChevronLeft,
  ShieldCheck,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Building,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getLegalCases, subscribeToLegalCases } from '../services/legalAffairsService';
import { formatCurrency } from '../services/invoiceService';
import type { LegalCase } from '../services/legalAffairsService';

interface RoleLimitedHomeProps {
  onGoTab?: (tab: string) => void;
}

export const RoleLimitedHome: React.FC<RoleLimitedHomeProps> = ({ onGoTab }) => {
  const { currentUser } = useApp();
  const role = currentUser?.role || 'warehouse_keeper';
  const isLegal = role === 'legal_advisor';

  const [legalCases, setLegalCases] = React.useState<LegalCase[]>(() => getLegalCases());
  React.useEffect(() => {
    if (!isLegal) return;
    const unsub = subscribeToLegalCases((c) => setLegalCases(c));
    setLegalCases(getLegalCases());
    return unsub;
  }, [isLegal]);

  const openCases = useMemo(
    () => legalCases.filter((c) => c.status !== 'تم سداد كامل المديونية وإغلاق الملف'),
    [legalCases]
  );
  const totalOverdue = useMemo(
    () => openCases.reduce((s, c) => s + (c.overdueAmount || 0), 0),
    [openCases]
  );
  const pendingApproval = useMemo(
    () => openCases.filter((c) => c.status === 'بانتظار اعتماد مدير الفرع').length,
    [openCases]
  );

  const displayName = (currentUser?.name || 'مستخدم').replace(/\s*\([^)]*\)/g, '').trim() || 'مستخدم';

  if (isLegal) {
    return (
      <div dir="rtl" className="space-y-5 animate-in fade-in duration-200">
        {/* Hero */}
        <div className="bg-gradient-to-l from-[#0f233d] via-[#162f52] to-[#1a3861] text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-[rgba(201,154,67,.3)] relative overflow-hidden">
          <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-lg shrink-0 text-2xl">
              <Scale className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  أهلاً بك، {displayName} 👋
                </h1>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black px-2.5 py-0.5 rounded-full">
                  المستشار القانوني
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 font-medium max-w-2xl leading-relaxed">
                صفحة خاصة بدورك فقط — لا تعرض مبيعات ولا تارجت ولا بيانات المحافظ الأخرى، لسرية المنظومة.
              </p>
            </div>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="tg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-extrabold text-slate-500">القضايا المفتوحة</div>
              <Scale className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 text-3xl font-black text-[#0b2337] tabular-nums">{openCases.length}</div>
            <div className="mt-1 text-[11px] text-slate-500 font-bold">ملفات تحويل نشطة</div>
          </div>
          <div className="tg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-extrabold text-slate-500">المتأخرات القانونية</div>
              <ClipboardList className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-black text-rose-700 tabular-nums">{formatCurrency(totalOverdue)}</div>
            <div className="mt-1 text-[11px] text-slate-500 font-bold">إجمالي المتأخرات قيد المتابعة</div>
          </div>
          <div className="tg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-extrabold text-slate-500">بانتظار الاعتماد</div>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 text-3xl font-black text-amber-700 tabular-nums">{pendingApproval}</div>
            <div className="mt-1 text-[11px] text-slate-500 font-bold">ملفات لم يعتمدها مدير الفرع بعد</div>
          </div>
        </div>

        {/* My cases */}
        <div className="tg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-black text-[#0b2337] text-sm sm:text-base">ملفاتك (العملاء المتحولين للشؤون القانونية)</h2>
            {onGoTab && (
              <button
                type="button"
                onClick={() => onGoTab('legal_advisor')}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl bg-[#0F2B38] text-white text-xs font-black hover:bg-[#123554] transition cursor-pointer"
              >
                <span>إدارة الشؤون القانونية</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          {openCases.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/60">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">لا توجد قضايا مفتوحة عليك الآن.</p>
              <p className="text-[11px] text-slate-500 mt-1">المحاكم والإنذارات تُدار من شاشة الإدارة القانونية.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {openCases.slice(0, 6).map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-[#0b2337] text-sm truncate">
                      {c.transferIcon && <span className="ml-1">{c.transferIcon}</span>}
                      {c.customerName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {c.branchName} • {c.id}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="font-black text-rose-700 text-sm tabular-nums">{formatCurrency(c.overdueAmount)}</div>
                    <div className="text-[10px] font-bold text-amber-700">{c.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------- أمين المخزن ---------- */
  return (
    <div dir="rtl" className="space-y-5 animate-in fade-in duration-200">
      <div className="bg-gradient-to-l from-[#0f2f24] via-[#14532d] to-[#166534] text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-[rgba(16,185,129,.3)] relative overflow-hidden">
        <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black shadow-lg shrink-0 text-2xl">
            <Building className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                أهلاً بك، {displayName} 👋
              </h1>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-black px-2.5 py-0.5 rounded-full">
                أمين المخزن
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-200 mt-1 font-medium max-w-2xl leading-relaxed">
              صفحة خاصة بدورك فقط — متابعة المرتجعات والمخزون المكلف بتسليمه. لا تعرض بيانات المبيعات أو العملاء أو التارجت لسرية المنظومة.
            </p>
          </div>
        </div>
      </div>

      <div className="tg-card p-6 sm:p-8 flex flex-col items-center text-center gap-4">
        <div className="w-20 h-20 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <ClipboardList className="w-10 h-10" />
        </div>
        <div>
          <h2 className="font-black text-[#0b2337] text-lg">مهام أمين المخزن</h2>
          <p className="text-sm text-slate-600 mt-2 max-w-md leading-relaxed">
            تختص بمرتجعات العملاء واستلامها وتسعيرها وتسوية الكميات في المخزن.
            كل باقي الشاشات (المبيعات، التارجت، العملاء، التقارير) غير متاحة لك لضمان سرية بيانات المنظومة.
          </p>
        </div>
        {onGoTab && (
          <button
            type="button"
            onClick={() => onGoTab('returns')}
            className="inline-flex items-center gap-2 px-6 h-12 rounded-2xl bg-[#14532d] hover:bg-[#166534] text-white text-sm font-black transition cursor-pointer shadow-lg"
          >
            <RotateCcw className="w-5 h-5" />
            <span>الذهاب لشاشة المرتجعات</span>
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="inline-flex items-center gap-2 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 mt-2">
          <ShieldCheck className="w-4 h-4" />
          <span>دورك محدد بصلاحيات المخزن فقط</span>
        </div>
      </div>
    </div>
  );
};

export default RoleLimitedHome;
