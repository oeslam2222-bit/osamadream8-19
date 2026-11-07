import React, { useMemo, useState } from 'react';
import {
  Clock,
  Bell,
  RotateCw,
  FileText,
  Plus,
  AlertTriangle,
  ChevronDown,
  Search,
  Store,
  Users,
  Moon,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';

/* ------------------------------------------------------------------ */
/*  Small inline icons used as stat-card badges                       */
/* ------------------------------------------------------------------ */
const Gift = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 21 3 13 9 7 13 7 17 13 17 21" />
    <path d="M7 21v-6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6" />
    <rect width="4" height="12" x="10" y="4" rx="1" ry="1" />
  </svg>
);

const Heart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

type StatAccent = 'teal' | 'red' | 'amber' | 'blue';

interface StatCard {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  accent: StatAccent;
  icon: React.ElementType;
}

const STAT_CARDS: StatCard[] = [
  { label: 'مبالغ 2026', value: '21.26', sub: 'مبلغ اليوم ٢', delta: 'p₂ 21,126,351', accent: 'red', icon: Clock },
  { label: 'مبالغ 2025', value: '4.7', sub: 'مبلغ اليوم ٢', delta: 'p₂ 4,702,913', accent: 'red', icon: Bell },
  { label: 'إجمالي المصروفات', value: '116.33', sub: 'مبلغ اليوم ٢', delta: 'p₂ 116,326,721', accent: 'teal', icon: Gift },
  { label: 'الموردية', value: '41.89', sub: 'مبلغ اليوم ٢', delta: 'p₂ 41,892,473', accent: 'red', icon: AlertTriangle },
  { label: 'إجمالي المصروفات', value: '143.39', sub: 'مبلغ اليوم ٢', delta: 'p₂ 143,393,871', accent: 'teal', icon: FileText },
  { label: 'المصروفات الفرعونية', value: '763', sub: 'عدد Mozil', accent: 'teal', icon: Heart },
  { label: 'عدد الموظفين', value: '1,979', sub: 'عدد Mozil', accent: 'teal', icon: Users },
];

interface CategoryChip {
  id: string;
  label: string;
  count?: number;
}

const CATEGORY_CHIPS: CategoryChip[] = [
  { id: 'employee', label: 'الموظف' },
  { id: 'invoices', label: 'الفواتير (٥)', count: 5 },
  { id: 'gift', label: 'الهدية' },
  { id: 'gas', label: 'الغاز' },
  { id: 'paper', label: 'الورق' },
  { id: 'euro', label: 'أمر أوروبي' },
  { id: 'filter', label: 'الفلتر' },
  { id: 'warehouse', label: 'السداد للمخزن' },
];

interface TableRow {
  id: string;
  no: string;
  amount: string;
  status: 'paid' | 'pending' | 'overdue' | 'partial';
  customer: string;
  city: string;
  region: string;
  item: string;
  seller: string;
  paidAmount: string;
  paidAmountDelta?: string;
  account: string;
  accountStatus: 'active' | 'blocked';
  accountNote?: string;
  name: string;
}

const TABLE_DATA: TableRow[] = [
  {
    id: 't1',
    no: '٨٠',
    amount: '3,106,200',
    status: 'paid',
    customer: 'خارج علي%',
    city: 'محمد أيلول الأول',
    region: 'القاهرة',
    item: 'بنت القرمود',
    seller: 'Net90',
    paidAmount: '2,000,000',
    paidAmountDelta: '1,044,520',
    account: 'CUST019836',
    accountStatus: 'active',
    accountNote: 'مطارد',
    name: 'رزق حامد أحمد-عد',
  },
  {
    id: 't2',
    no: '١٠',
    amount: '2,267,540',
    status: 'paid',
    customer: 'خارج علي%',
    city: 'الغزالة',
    region: 'القاهرة',
    item: 'أمر صر倒入 بنادي%',
    seller: 'Net45',
    paidAmount: '1,000,000',
    paidAmountDelta: '1,340,854',
    account: 'CUST019342',
    accountStatus: 'active',
    accountNote: 'مطارد',
    name: 'الوالي - لورد%',
  },
  {
    id: 't3',
    no: '٠٠',
    amount: '3,304,280',
    status: 'paid',
    customer: 'خارج علي%',
    city: 'الغزالة',
    region: 'القاهرة',
    item: 'البروجي%',
    seller: 'Net90',
    paidAmount: '3,000,000',
    paidAmountDelta: '815,382',
    account: 'CUST018967',
    accountStatus: 'active',
    accountNote: 'مطارد',
    name: 'أحمد محمد عبدالعال%',
  },
  {
    id: 't4',
    no: '٠٠',
    amount: '1,280,245',
    status: 'paid',
    customer: 'خارج علي%',
    city: 'أسيوط%',
    region: 'السعدية%',
    item: 'مؤلف أحمد%',
    seller: 'Net60',
    paidAmount: '1,000,000',
    paidAmountDelta: '980,295',
    account: 'CUST015641',
    accountStatus: 'active',
    accountNote: 'مطارد',
    name: 'باهر مؤمن Bien%',
  },
];

const accentColors: Record<StatAccent, string> = {
  teal: 'border-teal-500/30 bg-teal-500/5',
  red: 'border-rose-500/30 bg-rose-500/5',
  amber: 'border-amber-500/30 bg-amber-500/5',
  blue: 'border-blue-500/30 bg-blue-500/5',
};

const statusStyles: Record<TableRow['status'], { bg: string; text: string; label: string }> = {
  paid: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400', label: 'مُسدد' },
  pending: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400', label: 'قيد الانتظار' },
  overdue: { bg: 'bg-rose-500/10 border-rose-500/20', text: 'text-rose-400', label: 'متأخر' },
  partial: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400', label: 'جزئي' },
};

export const CadreLunchDashboard: React.FC = () => {
  const { currentUser, isOffline } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('employee');

  const totalRecords = useMemo(() => TABLE_DATA.length, []);
  const totalAmount = useMemo(() => {
    return TABLE_DATA.reduce((sum, r) => sum + Number(r.amount.replace(/,/g, '')), 0);
  }, []);
  const totalPaid = useMemo(() => {
    return TABLE_DATA.reduce((sum, r) => sum + Number(r.paidAmount.replace(/,/g, '')), 0);
  }, []);

  const filteredTable = useMemo(() => {
    return TABLE_DATA.filter((row) => {
      if (searchQuery && !row.customer.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (searchQuery && !row.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [searchQuery]);

  return (
    <div className="min-h-[100dvh] w-full bg-[#0a0e1a] text-slate-200 font-sans antialiased selection:bg-teal-500/30 selection:text-white" dir="rtl">

      {/* ===== Top Bar ===== */}
      <header className="border-b border-slate-800/60 bg-[#0a0e1a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-teal-400" />
              </div>
              <span className="text-xs font-black text-slate-400 whitespace-nowrap">دكان</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition">
                <Moon className="w-4 h-4" />
              </button>
              <button className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition">
                <Bell className="w-4 h-4" />
              </button>
              <button className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition">
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <div className="hidden md:flex items-end gap-1 text-right">
              <div className="text-[10px] font-bold text-slate-500">أهلاً بك</div>
              <div className="text-xs font-black text-white leading-none">محمد سissy عبدالعزيز</div>
            </div>
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 shrink-0">
              <img
                src="/icon.svg"
                alt="الشعار"
                className="w-8 h-8 rounded-lg object-contain shrink-0"
              />
              <div className="text-right hidden sm:block min-w-0">
                <div className="text-[10px] font-bold text-slate-400 leading-none">محل نظامك</div>
                <div className="text-[9px] font-black text-teal-400 leading-none">مفعل باليات</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 min-h-[calc(100dvh-16rem)]">

        {/* ===== Page Title ===== */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <h1 className="text-sm font-black text-white tracking-tight">غداء الكوادر</h1>
            <Sparkles className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-[10px] font-bold text-slate-500 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1">
            الجاري: {new Date().toLocaleDateString('ar-EG')}
          </div>
        </div>

        {/* ===== Amount Dropdown ===== */}
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-end gap-2 text-right">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">أضفها بالمبلغ:</label>
            <div className="flex items-end gap-1">
              <span className="text-xl font-black text-white">ج.م</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              defaultValue="الكل"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-teal-500 transition cursor-pointer appearance-none"
            >
              <option>الكل</option>
              <option>محدد</option>
              <option>غير محدد</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>

        {/* ===== Category Chips ===== */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORY_CHIPS.map((chip) => {
            const isActive = selectedCategory === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setSelectedCategory(chip.id)}
                className={`flex items-center gap-1.5 shrink-0 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-teal-500 border-teal-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                    : 'bg-slate-900 border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:border-slate-600 hover:text-white'
                }`}
              >
                {chip.label}
                {chip.count !== undefined && (
                  <span className="w-5 h-5 rounded-full bg-white/10 text-[10px] font-black flex items-center justify-center text-slate-900">
                    {chip.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ===== Stat Cards ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {STAT_CARDS.map((card, idx) => {
            const AccentIcon = card.icon;
            return (
              <div
                key={card.label}
                className={`rounded-2xl border p-3.5 flex flex-col min-w-0 transition-all ${accentColors[card.accent]} hover:border-slate-600/50`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-500 leading-tight">{card.label}</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 text-slate-400">
                    <AccentIcon className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white truncate">
                  {card.value}
                </div>
                {card.sub && (
                  <div className="text-[9px] font-bold text-slate-500 mt-0.5 truncate">{card.sub}</div>
                )}
                {card.delta && (
                  <div className="mt-1 text-[9px] font-bold leading-tight">
                    <span className={card.accent === 'teal' ? 'text-emerald-400' : 'text-rose-400'}>
                      {card.delta.split(' ')[0]}
                    </span>
                    <span className="text-slate-600"> {card.delta.split(' ').slice(1).join(' ')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ===== Filter Row ===== */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[140px]">
            <label className="absolute -top-2.5 left-2 text-[10px] font-bold text-slate-500 z-10 bg-[#0a0e1a] px-1">case (الكل)</label>
            <select
              defaultValue="الكل"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-teal-500 transition cursor-pointer appearance-none"
            >
              <option>الكل</option>
              <option>مفعل</option>
              <option>معطل</option>
            </select>
          </div>
          <div className="relative flex-1 min-w-[140px]">
            <label className="absolute -top-2.5 left-2 text-[10px] font-bold text-slate-500 z-10 bg-[#0a0e1a] px-1">المدينة (الكل)</label>
            <select
              defaultValue="الكل"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-teal-500 transition cursor-pointer appearance-none"
            >
              <option>الكل</option>
              <option>القاهرة</option>
              <option>الفيوم</option>
              <option>ديمشلت</option>
            </select>
          </div>
          <div className="relative flex-1 min-w-[140px]">
            <label className="absolute -top-2.5 left-2 text-[10px] font-bold text-slate-500 z-10 bg-[#0a0e1a] px-1">المنطقة (الكل)</label>
            <select
              defaultValue="الكل"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-teal-500 transition cursor-pointer appearance-none"
            >
              <option>الكل</option>
              <option>شرق</option>
              <option>غرب</option>
              <option>وسط</option>
            </select>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="ابحث..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-teal-500 transition"
            />
          </div>
        </div>

        <div className="flex items-end justify-between gap-2">
          <span className="text-[10px] font-bold text-slate-500">
            إجمالي: {totalRecords.toLocaleString('ar-EG')}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-2 bg-emerald-500 text-slate-900 font-black px-4 py-2 rounded-xl text-xs shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-400 transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>رصيد مجمع (تحديث مباشر)</span>
          </button>
        </div>

        {/* ===== Data Table ===== */}
        <div className="rounded-2xl border border-slate-800 bg-[#0f172a]/50 overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50">
                  <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3">الرقم</th>
                  <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3">المبلغ</th>
                  <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3">الحالة</th>
                  <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3">العميل</th>
                  <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3">المنتج</th>
                  <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3">طريقة الدفع</th>
                  <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3">المبلغ المسدد</th>
                  <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3">الحساب</th>
                  <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3">حالة الحساب</th>
                  <th className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 py-3">الاسم</th>
                </tr>
              </thead>
              <tbody>
                {filteredTable.map((row) => {
                  const status = statusStyles[row.status];
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition group"
                    >
                      <td className="px-4 py-3 text-xs font-bold text-slate-300">{row.no}</td>
                      <td className="px-4 py-3 text-xs font-black text-white">{row.amount}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[10px] font-black text-slate-300">{row.customer}</td>
                      <td className="px-4 py-3 text-[10px] font-black text-slate-300">{row.item}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-300">{row.seller}</td>
                      <td className="px-4 py-3">
                        <div className="text-[10px] font-black text-white">{row.paidAmount}</div>
                        {row.paidAmountDelta && (
                          <div className="text-[9px] font-bold text-emerald-400">↑ {row.paidAmountDelta}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-black text-slate-300">{row.account}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black ${
                          row.accountStatus === 'active'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        }`}>
                          {row.accountStatus === 'active' ? 'مفعل' : 'معطل'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[10px] font-black text-slate-300 truncate max-w-[120px]">{row.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredTable.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              <p className="text-xs font-bold">لا توجد نتائج مطابقة للبحث</p>
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="mt-6 flex items-center justify-between text-[10px] text-slate-500">
          <span className="font-bold">
            حصر السجلات: {totalRecords.toLocaleString('ar-EG')} • المجموع المسدد: {formatCurrency(totalPaid)}
          </span>
          <span>{isOffline ? 'أنت تعمل أوفلاين' : 'متصل بالسيرفر'}</span>
        </div>
      </main>
    </div>
  );
};

export default CadreLunchDashboard;