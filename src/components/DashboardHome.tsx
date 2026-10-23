import React, { useMemo } from 'react';
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
  YAxis
} from 'recharts';
import { Boxes, Receipt, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { Invoice } from '../types';

interface DashboardHomeProps {
  onNavigateToTab: (tab: string) => void;
  onViewInvoice?: (invoice: Invoice) => void;
}

const NAVY = '#102b4e';
const GOLD = '#c99a43';
const PIE_COLORS = [NAVY, GOLD, '#1e5f9d', '#b9c4d8'];

const EXCLUDED_FROM_SALES = ['مسودة', 'مرفوضة / ملغاة', 'ملغاة'];
const PENDING_STATUSES = ['قيد مراجعة المشرف', 'معلقة بانتظار اعتماد الفرع', 'قيد المراجعة'];
const DONE_STATUSES = ['معتمدة ومصروفة من المخزن', 'معتمدة', 'تم التسليم', 'إغلاق الطلبية'];
const BAD_STATUSES = ['مرتجع', 'مرتجع جزئي', 'مرفوضة / ملغاة', 'ملغاة'];

const MASK = '••••••';

const invoiceTotal = (inv: Invoice): number =>
  inv.estimatedGrandTotal || inv.subtotal - (inv.discountAmount || 0) + (inv.taxAmount || 0) || 0;

// Local calendar day key (YYYY-MM-DD) for an invoice, tolerant to the different date formats in the data.
const dayKey = (inv: Invoice): string => {
  const raw = inv.createdAt || inv.timestamp || inv.date || '';
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime()) && raw.length > 10) {
    return toLocalKey(parsed);
  }
  const normalized = (inv.date || raw).slice(0, 10).replace(/\//g, '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const fallback = new Date(inv.date || raw);
  return isNaN(fallback.getTime()) ? '' : toLocalKey(fallback);
};

const toLocalKey = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const statusTone = (status: string): string => {
  if (DONE_STATUSES.includes(status)) return 'bg-emerald-100 text-emerald-800';
  if (PENDING_STATUSES.includes(status)) return 'bg-amber-100 text-amber-800';
  if (BAD_STATUSES.includes(status)) return 'bg-rose-100 text-rose-800';
  return 'bg-sky-100 text-sky-800';
};

export const DashboardHome: React.FC<DashboardHomeProps> = ({ onNavigateToTab, onViewInvoice }) => {
  const { currentUser, products, getVisibleInvoices, isPrivacyMode } = useApp();

  const invoices = useMemo(() => getVisibleInvoices(), [getVisibleInvoices]);
  const salesInvoices = useMemo(
    () => invoices.filter((inv) => !EXCLUDED_FROM_SALES.includes(inv.status)),
    [invoices]
  );

  const stats = useMemo(() => {
    const todayKey = toLocalKey(new Date());
    const pending = invoices.filter((inv) => PENDING_STATUSES.includes(inv.status));
    const stockValue = products.reduce(
      (sum, p) => sum + (p.cartonPrice || 0) * Math.max(0, p.branchStockActual || 0),
      0
    );
    return {
      totalSales: salesInvoices.reduce((sum, inv) => sum + invoiceTotal(inv), 0),
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, inv) => sum + invoiceTotal(inv), 0),
      todayCount: invoices.filter((inv) => dayKey(inv) === todayKey).length,
      stockValue
    };
  }, [invoices, salesInvoices, products]);

  const weekData = useMemo(() => {
    const days: { key: string; label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        key: toLocalKey(d),
        label: d.toLocaleDateString('ar-EG', { weekday: 'short' }),
        value: 0
      });
    }
    salesInvoices.forEach((inv) => {
      const slot = days.find((d) => d.key === dayKey(inv));
      if (slot) slot.value += invoiceTotal(inv);
    });
    return days;
  }, [salesInvoices]);

  const weekMax = Math.max(...weekData.map((d) => d.value), 0);

  const departmentData = useMemo(() => {
    const map = new Map<string, number>();
    salesInvoices.forEach((inv) => {
      inv.items?.forEach((item) => {
        const name = item.itemGroup || item.product?.department || item.product?.category || 'غير مصنف';
        map.set(name, (map.get(name) || 0) + (item.netTotal || item.totalPrice || 0));
      });
    });
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 3).map(([name, value]) => ({ name, value }));
    const rest = sorted.slice(3).reduce((sum, [, v]) => sum + v, 0);
    if (rest > 0) top.push({ name: 'أخرى', value: rest });
    return top;
  }, [salesInvoices]);

  const departmentTotal = departmentData.reduce((sum, d) => sum + d.value, 0);

  const latestInvoices = useMemo(
    () =>
      [...invoices]
        .sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''))
        .slice(0, 6),
    [invoices]
  );

  const money = (n: number) => (isPrivacyMode ? MASK : formatCurrency(n));
  const compact = (n: number) =>
    isPrivacyMode
      ? MASK
      : n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000
          ? `${(n / 1_000).toFixed(0)}K`
          : String(Math.round(n));

  const today = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const kpis = [
    {
      label: 'إجمالي المبيعات',
      value: money(stats.totalSales),
      icon: TrendingUp,
      tint: 'bg-blue-50',
      color: 'text-blue-700'
    },
    {
      label: 'طلبيات قيد المراجعة',
      value: `${stats.pendingCount} طلبية`,
      sub: money(stats.pendingAmount),
      icon: ShoppingCart,
      tint: 'bg-amber-50',
      color: 'text-amber-700'
    },
    {
      label: 'فواتير اليوم',
      value: `${stats.todayCount} فاتورة`,
      icon: Receipt,
      tint: 'bg-emerald-50',
      color: 'text-emerald-700'
    },
    {
      label: 'قيمة مخزون الفرع',
      value: money(stats.stockValue),
      icon: Boxes,
      tint: 'bg-violet-50',
      color: 'text-violet-700'
    }
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">لوحة التحكم</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            أهلاً {currentUser?.name}، هذه نظرة عامة على نشاطك
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-600">
          {today}
        </div>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="min-w-0 rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex flex-col gap-3"
            >
              <div className={`w-10 h-10 rounded-xl ${k.tint} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <div className="min-w-0">
                <div className="text-sm text-slate-500">{k.label}</div>
                <div className="text-lg sm:text-xl font-black text-slate-900 truncate">{k.value}</div>
                {k.sub ? <div className="text-xs text-slate-500 mt-0.5">{k.sub}</div> : null}
              </div>
            </div>
          );
        })}
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 min-w-0 rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-black text-slate-900">المبيعات خلال آخر 7 أيام</h2>
            <span className="text-xs text-slate-500">بالجنيه</span>
          </div>
          <div className="h-60 min-w-0" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e7ebf2" />
                <XAxis
                  dataKey="label"
                  reversed
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: '#5b6577' }}
                />
                <YAxis
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 11, fill: '#5b6577' }}
                  tickFormatter={(v) => (isPrivacyMode ? '' : compact(Number(v)))}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(16,43,78,0.05)' }}
                  formatter={(value) => [money(Number(value)), 'المبيعات']}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={44}>
                  {weekData.map((d) => (
                    <Cell key={d.key} fill={d.value > 0 && d.value === weekMax ? GOLD : '#b9c7e2'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
          <h2 className="text-base sm:text-lg font-black text-slate-900 mb-3">توزيع المبيعات حسب الأقسام</h2>
          {departmentData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">
              لا توجد مبيعات بعد
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-40 h-40" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={departmentData}
                      dataKey="value"
                      innerRadius={50}
                      outerRadius={76}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {departmentData.map((d, i) => (
                        <Cell key={d.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-black text-slate-900">{compact(departmentTotal)}</span>
                  <span className="text-[11px] text-slate-500">الإجمالي</span>
                </div>
              </div>
              <ul className="w-full space-y-2">
                {departmentData.map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2 text-[13px]">
                    <span
                      className="w-3 h-3 rounded-[3px] shrink-0"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="text-slate-700 truncate flex-1">{d.name}</span>
                    <span className="font-black text-slate-900">
                      {departmentTotal > 0 ? Math.round((d.value / departmentTotal) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Latest invoices */}
      <section className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-amber-600" />
            أحدث الفواتير
          </h2>
          <button
            type="button"
            onClick={() => onNavigateToTab('invoices')}
            className="text-[13px] font-bold text-blue-800 hover:underline cursor-pointer"
          >
            عرض الكل
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-right text-sm">
            <thead>
              <tr className="bg-slate-100 text-[13px] text-slate-700 font-bold">
                <th className="px-3 py-2.5 rounded-s-lg">رقم الفاتورة</th>
                <th className="px-3 py-2.5">العميل</th>
                <th className="px-3 py-2.5">التاريخ</th>
                <th className="px-3 py-2.5">الإجمالي</th>
                <th className="px-3 py-2.5 rounded-e-lg">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {latestInvoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                    لا توجد فواتير بعد
                  </td>
                </tr>
              ) : (
                latestInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => onViewInvoice?.(inv)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-3 py-3 font-bold text-slate-900">{inv.invoiceNumber}</td>
                    <td className="px-3 py-3 text-slate-700">{inv.customerName}</td>
                    <td className="px-3 py-3 text-slate-500">{inv.date}</td>
                    <td className="px-3 py-3 font-bold text-slate-900">{money(invoiceTotal(inv))}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-block rounded-full px-3 py-0.5 text-xs font-bold ${statusTone(inv.status)}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default DashboardHome;
