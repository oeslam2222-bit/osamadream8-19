import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Bell,
  BookOpen,
  Building2,
  Calendar,
  ChevronDown,
  Clock,
  Filter,
  MapPin,
  Moon,
  Plus,
  Search,
  ShoppingCart,
  Sun,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { useTheme } from '../context/themeContext';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';

interface MainDashboardProps {
  onNavigateToTab?: (tab: string) => void;
}

const statCards = [
  {
    label: 'إجمالي المبيعات',
    value: '1,245',
    change: '+12%',
    icon: ShoppingCart,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    iconBg: 'bg-blue-100 dark:bg-blue-900',
  },
  {
    label: 'إجمالي الطلبات',
    value: '23,489',
    change: '+8%',
    icon: Wallet,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900',
  },
  {
    label: 'إجمالي الإيرادات',
    value: '2,468,750 ج.م',
    change: '+15%',
    icon: BookOpen,
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    iconBg: 'bg-purple-100 dark:bg-purple-900',
  },
  {
    label: 'عدد العملاء المشتركين',
    value: '486',
    change: '+6%',
    icon: Users,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/30',
    iconBg: 'bg-orange-100 dark:bg-orange-900',
  },
];

const pieCategories = [
  { name: 'أدوات منزلية', value: 28 },
  { name: 'أجهزة كهربائية', value: 20 },
  { name: 'الزيوت والصابون', value: 15 },
  { name: 'المعجنات', value: 12 },
  { name: 'الأدوات الصحية', value: 10 },
  { name: 'أخرى', value: 8 },
  { name: 'أدوات تنظيف', value: 7 },
];

const pieColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];

const barMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const barSales = [
  65, 58, 80, 81, 56, 55, 40, 95, 85, 70, 60, 75,
];

const tableHeaders = ['م', 'العميل', 'الفاتورة', 'التاريخ', 'المبلغ', 'الحالة'];

const tableRows = [
  { id: 1, customer: 'محمد أحمد علي', invoice: 'فاتورة 26 يناير', date: '2026/01/29', amount: 320450, status: 'مكتملة' },
  { id: 2, customer: 'أحمد محمود سعيد', invoice: 'فاتورة 28 يناير', date: '2026/01/28', amount: 275600, status: 'مكتملة' },
  { id: 3, customer: 'علي محمد حسن', invoice: 'فاتورة 27 يناير', date: '2026/01/27', amount: 198750, status: 'قيد المراجعة' },
  { id: 4, customer: 'سعيد أحمد مصطفى', invoice: 'فاتورة 26 يناير', date: '2026/01/26', amount: 165300, status: 'مكتملة' },
  { id: 5, customer: 'محمود علي فرج', invoice: 'فاتورة 25 يناير', date: '2026/01/25', amount: 142600, status: 'معلقة' },
];

export const MainDashboard: React.FC<MainDashboardProps> = ({ onNavigateToTab }) => {
  const { isDark, toggleTheme } = useTheme();
  const { currentUser } = useApp();

  const [activeNav, setActiveNav] = useState('الرئيسية');

  const topCustomers = useMemo(
    () => [...tableRows].sort((a, b) => b.amount - a.amount).slice(0, 5),
    []
  );

  return (
    <div className="tantawy-shell min-h-[100dvh] flex flex-col text-slate-900 dark:text-slate-100 font-sans antialiased" dir="rtl">
      <header className="sticky top-0 z-40 flex flex-col gap-1">
        <div className="flex items-center justify-between px-4 sm:px-6 md:px-8 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white font-black shadow-lg">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-black text-slate-900 dark:text-white text-sm leading-tight">لوحة التحكم الرئيسية</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">مرحباً، {currentUser?.name || 'المدير'} — عرض مؤشرات الأداء والمبيعات</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="بحث في المبيعات والعملاء..."
                className="pl-9 pr-3 py-1.5 rounded-xl text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none w-48 sm:w-64 transition"
              />
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="التبديل بين الوضع النهاري والليلي"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              {isDark ? (
                <Sun className="w-5 h-5 text-amber-500" />
              ) : (
                <Moon className="w-5 h-5 text-indigo-500" />
              )}
            </button>
            <button type="button" className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 dark:bg-rose-400 border-2 border-white dark:border-slate-900" />
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 md:px-8 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          <div className="flex gap-2 no-scrollbar">
            <button className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-sm">الكل</button>
            <button className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition">يوم</button>
            <button className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition">أسبوع</button>
            <button className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition">شهر</button>
            <button className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition">سنة</button>
            <Filter className="w-4 h-4 ml-1.5 text-slate-400" />
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-x-auto">
        <div className="px-4 sm:px-6 md:px-8 py-6">
          {/* بطاقات المؤشرات (KPI Cards) */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
            {statCards.map((card, i) => (
              <div
                key={i}
                className={`rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm ${card.bg} flex flex-col`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${card.color} ${card.iconBg}`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400">
                    ▲
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1">{card.label}</p>
                <div className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{card.value}</div>
                <div className="text-[10px] font-bold text-green-600 dark:text-green-400 mt-0.5">{card.change}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* القطاع الأيسر: الرسم البياني الدائري + القائمة */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-slate-900 dark:text-white text-sm">توزيع مبيعات الأقسام</h3>
                  <select className="text-[10px] bg-transparent text-slate-600 dark:text-slate-400 border-none focus:ring-0 cursor-pointer">
                    <option>الشهرية</option>
                    <option>الأسبوعية</option>
                    <option>اليومية</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <div className="w-48 h-48 mx-auto relative">
                    <PieChart width={200} height={200}>
                      <Pie
                        data={pieCategories}
                        dataKey="value"
                        nameKey="name"
                        cx={100}
                        cy={100}
                        outerRadius={70}
                        label
                      >
                        {pieCategories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={pieColors[index]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #ddd', color: '#333', fontSize: '11px', fontFamily: 'Cairo' }} />
                    </PieChart>
                  </div>
                  <div className="ml-4 space-y-2">
                    <div className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">2,468,750</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">إجمالي المبلغ المسجل</div>
                  </div>
                </div>
                <div className="mt-5 space-y-2">
                  {pieCategories.map((cat, i) => (
                    <div key={cat.name} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: pieColors[i] }} />
                        <span className="text-slate-600 dark:text-slate-400 font-medium">{cat.name}</span>
                      </div>
                      <span className="font-black text-slate-900 dark:text-white">{cat.value}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                <h3 className="font-black text-slate-900 dark:text-white text-sm mb-3">أفضل العملاء أداءً</h3>
                <div className="space-y-3">
                  {topCustomers.map((row) => (
                    <div key={row.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[9px] font-black text-slate-600 dark:text-slate-300">
                          {row.id}
                        </div>
                        <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">{row.customer}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{formatCurrency(row.amount)}</div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full text-[color:var(--brand-teal)] bg-[rgba(0,148,136,.12)] dark:bg-[rgba(0,148,136,.2)]">{row.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* القطاع الأيمن: الرسم البياني الشريطي + الجدول + بطاقة المميز */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-slate-900 dark:text-white text-sm">المبيعات الشهرية (قيمة)</h3>
                  <div className="flex gap-2">
                    <button className="w-6 h-6 rounded-full border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">الشهرية</button>
                    <button className="w-6 h-6 rounded-full border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">السنوية</button>
                  </div>
                </div>
                <div className="h-64">
                  <BarChart width={600} height={300} data={barMonths.map((m, i) => ({ name: m, sales: barSales[i] }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #ddd', color: '#333', fontSize: '11px', fontFamily: 'Cairo' }} />
                    <Bar dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-black text-slate-900 dark:text-white text-sm">آخر المبيعات المُسجّلة</h3>
                    <button onClick={() => onNavigateToTab?.('invoices')} className="text-[10px] font-bold text-[color:var(--brand-teal)] hover:underline cursor-pointer">عرض الكل</button>
                  </div>
                  <div className="overflow-hidden">
                    <table className="w-full text-left text-[10px]">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800">
                          {tableHeaders.map((h) => (
                            <th key={h} className="pt-2 pb-1 font-black text-slate-500 dark:text-slate-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {tableRows.map((row) => (
                          <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                            <td className="py-2 text-slate-500 dark:text-slate-400 font-medium">{row.id}</td>
                            <td className="py-2 text-slate-700 dark:text-slate-300 font-medium">{row.customer}</td>
                            <td className="py-2 text-slate-700 dark:text-slate-300">{row.invoice}</td>
                            <td className="py-2 text-slate-500 dark:text-slate-400 tabular-nums">{row.date}</td>
                            <td className="py-2 font-black text-slate-900 dark:text-white tabular-nums">{formatCurrency(row.amount)}</td>
                            <td className="py-2 text-center">
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex flex-col justify-between min-h-[220px]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 dark:text-white text-sm">أكثر منتج مبيعاً هذا الشهر</h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">زيوت الطبخ — لتر 1 لتر</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">320,450</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">ج.م — إجمالي المبيعات</div>
                    <div className="text-[10px] font-bold text-green-600 dark:text-green-400 mt-1">▲ 13% عن الشهر الماضي</div>
                  </div>
                  <button type="button" className="mt-4 w-full py-2 bg-[color:var(--brand-teal)] hover:bg-teal-700 dark:hover:bg-teal-600 text-white rounded-xl text-xs font-bold transition shadow-xs">
                    <Plus className="w-3.5 h-3.5" /> <span>عرض التفاصيل الكاملة</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-3 px-4 text-center text-[10px] text-slate-400 dark:text-slate-500">
        مجموعة الطنطاوي للتجارة والتوزيع (TANTAWY GROUP) — نظام إدارة المبيعات والمخازن
      </footer>
    </div>
  );
};

export default MainDashboard;