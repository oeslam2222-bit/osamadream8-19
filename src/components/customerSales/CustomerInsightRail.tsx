import {
  ArrowLeft,
  BellRing,
  Building2,
  Plus,
  Search,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  UserRound,
  Wallet,
  X
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  CustomerAlert,
  CustomerOrderInsight,
  CustomerSalesInsight,
  MONTH_LABELS
} from '../../services/customerItemSalesInsights';
import { formatCurrency } from '../../services/invoiceService';

interface CustomerFinancialSnapshot {
  currentBalance: number;
  overdue: number;
  collections: number;
  creditLimit: number;
  lastCollectionDate?: string;
  lastCollectionAmount: number;
}

interface CustomerInsightRailProps {
  customers: CustomerSalesInsight[];
  selected: CustomerSalesInsight | null;
  alerts: CustomerAlert[];
  recentOrders: CustomerOrderInsight[];
  selectedMonth: number | 'all';
  monthlyAmounts: Record<number, number>;
  financial: CustomerFinancialSnapshot | null;
  onSelectCustomer: (account: string) => void;
  onStartOrder?: (account: string) => void;
  onOpenDetails: (account: string) => void;
}

const StatBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-1.5 text-center">
    <div className="text-[9px] text-slate-400 font-bold">{label}</div>
    <div className="text-[11px] font-black text-slate-900 font-mono mt-0.5 truncate">{value}</div>
  </div>
);

const CustomerCard: React.FC<{
  customer: CustomerSalesInsight;
  selectedMonth: number | 'all';
  monthlyAmounts: Record<number, number>;
  onStartOrder?: (account: string) => void;
  onOpenDetails: (account: string) => void;
}> = ({ customer, selectedMonth, monthlyAmounts, onStartOrder, onOpenDetails }) => {
  const monthly = monthlyAmounts;
  const maxAmount = Math.max(...Object.values(monthly).map((value) => Number(value) || 0), 1);
  const highlightMonth =
    selectedMonth === 'all'
      ? Object.entries(monthly)
          .map(([month, amount]) => ({ month: Number(month), amount: Number(amount) || 0 }))
          .sort((a, b) => b.amount - a.amount)[0]?.month
      : selectedMonth;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-[#102b4e] text-amber-300 flex items-center justify-center font-black text-base shrink-0">
          {(customer.customerName || 'ع').trim().charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-slate-900 truncate" title={customer.customerName}>
            {customer.customerName}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              {customer.customerAccount || '---'}
            </span>
            <span>•</span>
            <span className="font-sans inline-flex items-center gap-1 font-bold text-blue-900">
              <Building2 className="w-2.5 h-2.5 text-blue-600 shrink-0" />
              {customer.summary.linkedBranch || customer.warehouse}
            </span>
            {customer.summary.isCustomerLinked && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                مربوط ✓
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-600 font-bold mt-1 inline-flex items-center gap-1">
            <UserRound className="w-2.5 h-2.5 text-slate-500 shrink-0" />
            المندوب: <span className="text-slate-900 font-black">{customer.summary.linkedRepName || customer.repName || 'غير محدد'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <StatBox label="إجمالي المبيعات" value={formatCurrency(customer.amount)} />
        <StatBox label="الأصناف" value={`${customer.itemsCount} صنف`} />
        <StatBox
          label="الفواتير"
          value={customer.ordersAvailable ? `${customer.invoicesCount}` : '—'}
        />
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1.5">
          <span>المبيعات الشهرية</span>
          {highlightMonth && <span className="text-slate-400">{MONTH_LABELS[highlightMonth]}</span>}
        </div>
        <div className="flex items-end gap-1 h-10" dir="rtl">
          {Array.from({ length: 12 }, (_, index) => {
            const month = index + 1;
            const amount = Number(monthly[month]) || 0;
            const height = amount > 0 ? Math.max(12, Math.round((amount / maxAmount) * 100)) : 4;
            const isActive = highlightMonth === month;
            return (
              <div key={month} className="flex-1 flex flex-col items-center gap-1" title={`${MONTH_LABELS[month]}: ${formatCurrency(amount)}`}>
                <div className="w-full h-8 flex items-end">
                  <div
                    className={`w-full rounded-sm transition-all ${
                      isActive ? 'bg-[#c99a43]' : amount > 0 ? 'bg-[#102b4e]/70' : 'bg-slate-200'
                    }`}
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className={`text-[8px] font-bold ${isActive ? 'text-amber-700' : 'text-slate-400'}`}>
                  {MONTH_LABELS[month].slice(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenDetails(customer.customerAccount)}
          className="flex-1 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold transition cursor-pointer inline-flex items-center justify-center gap-1"
        >
          عرض الملف الكامل
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        {onStartOrder && (
          <button
            type="button"
            onClick={() => onStartOrder(customer.customerAccount)}
            className="h-9 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black transition cursor-pointer inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            طلب
          </button>
        )}
      </div>
    </div>
  );
};

export const CustomerInsightRail: React.FC<CustomerInsightRailProps> = ({
  customers,
  selected,
  alerts,
  recentOrders,
  selectedMonth,
  monthlyAmounts,
  financial,
  onSelectCustomer,
  onStartOrder,
  onOpenDetails
}) => {
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return customers
      .filter(
        (customer) =>
          customer.customerName.toLowerCase().includes(term) ||
          (customer.customerAccount || '').toLowerCase().includes(term) ||
          (customer.repName || '').toLowerCase().includes(term)
      )
      .slice(0, 6);
  }, [customers, query]);

  const topItems = useMemo(() => {
    if (!selected) return [];
    return [...selected.summary.items].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5);
  }, [selected]);

  const maxItemAmount = topItems[0]?.totalAmount || 1;

  return (
    <aside className="space-y-4">
      {/* البحث السريع عن عميل */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4">
        <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5 mb-2.5">
          <Search className="w-3.5 h-3.5 text-amber-500" />
          بحث عن عميل
        </h3>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="اسم العميل أو الكود..."
            className="w-full h-9 pr-8 pl-8 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {query && (
          <div className="mt-2 space-y-1 max-h-52 overflow-y-auto">
            {searchResults.length === 0 ? (
              <p className="text-[10px] text-slate-400 font-bold text-center py-3">
                لا يوجد عميل مطابق
              </p>
            ) : (
              searchResults.map((customer) => (
                <button
                  key={customer.customerAccount}
                  type="button"
                  onClick={() => {
                    onSelectCustomer(customer.customerAccount);
                    setQuery('');
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl hover:bg-amber-50 transition text-right cursor-pointer"
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] font-black text-slate-800 truncate">
                      {customer.customerName}
                    </span>
                    <span className="block text-[9px] text-slate-400 font-mono">
                      {customer.customerAccount || '---'} • {customer.warehouse}
                    </span>
                  </span>
                  <span className="text-[10px] font-black text-emerald-700 font-mono shrink-0">
                    {formatCurrency(customer.amount)}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selected ? (
        <>
          <CustomerCard
            customer={selected}
            selectedMonth={selectedMonth}
            monthlyAmounts={monthlyAmounts}
            onStartOrder={onStartOrder}
            onOpenDetails={onOpenDetails}
          />

          {financial && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                  الموقف المالي
                </h3>
                {financial.overdue > 0 && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                    متأخرات
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-1.5">
                  <div className="text-[9px] text-slate-400 font-bold">المديونية الحالية</div>
                  <div className="text-[11px] font-black text-slate-900 font-mono mt-0.5">
                    {formatCurrency(financial.currentBalance)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-1.5">
                  <div className="text-[9px] text-slate-400 font-bold">المتأخرات والمستحق</div>
                  <div
                    className={`text-[11px] font-black font-mono mt-0.5 ${
                      financial.overdue > 0 ? 'text-rose-600' : 'text-slate-900'
                    }`}
                  >
                    {formatCurrency(financial.overdue)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-1.5">
                  <div className="text-[9px] text-slate-400 font-bold">إجمالي التحصيلات</div>
                  <div className="text-[11px] font-black text-emerald-700 font-mono mt-0.5">
                    {formatCurrency(financial.collections)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-1.5">
                  <div className="text-[9px] text-slate-400 font-bold">الحد الائتماني</div>
                  <div className="text-[11px] font-black text-slate-900 font-mono mt-0.5">
                    {financial.creditLimit > 0 ? formatCurrency(financial.creditLimit) : '—'}
                  </div>
                </div>
              </div>
              {(financial.lastCollectionDate || financial.lastCollectionAmount > 0) && (
                <div className="mt-2 pt-2 border-t border-dashed border-slate-100 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 font-bold">آخر تحصيل</span>
                  <span className="font-mono font-black text-slate-800">
                    {formatCurrency(financial.lastCollectionAmount)}
                    {financial.lastCollectionDate ? ` • ${financial.lastCollectionDate}` : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4">
            <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5 mb-3">
              <ShoppingBag className="w-3.5 h-3.5 text-violet-500" />
              أعلى أصناف العميل
            </h3>
            {topItems.length === 0 ? (
              <p className="text-[10px] text-slate-400 font-bold text-center py-2">
                لا توجد أصناف في الفترة المحددة
              </p>
            ) : (
              <div className="space-y-2.5">
                {topItems.map((item) => (
                  <div key={item.itemCode || item.itemName}>
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-slate-700 truncate" title={item.itemName}>
                        {item.itemName}
                      </span>
                      <span className="font-black text-slate-900 font-mono shrink-0">
                        {formatCurrency(item.totalAmount)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-[#c99a43] to-[#102b4e]"
                        style={{ width: `${Math.max(4, (item.totalAmount / maxItemAmount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {recentOrders.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4">
              <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5 mb-3">
                <BellRing className="w-3.5 h-3.5 text-sky-500" />
                آخر أوامر البيع
              </h3>
              <div className="space-y-2">
                {recentOrders.map((order) => (
                  <div
                    key={order.salesOrder}
                    className="flex items-center justify-between gap-2 text-[10px] border-b border-dashed border-slate-100 pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <span className="block font-black text-slate-800 font-mono">
                        {order.salesOrder}
                      </span>
                      <span className="block text-slate-400">
                        {order.date || 'بدون تاريخ'} • {order.itemsCount} صنف
                      </span>
                    </div>
                    <span className="font-black text-emerald-700 font-mono">
                      {formatCurrency(order.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <BellRing className="w-3.5 h-3.5 text-rose-500" />
                متابعة مطلوبة
              </h3>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                {alerts.length} تنبيه
              </span>
            </div>
            {alerts.length === 0 ? (
              <p className="text-[10px] text-slate-400 font-bold text-center py-2">
                لا توجد تنبيهات — كل العملاء مستقرون
              </p>
            ) : (
              <div className="space-y-1.5">
                {alerts.map((alert) => {
                  const isPositive = alert.kind === 'rising';
                  const isConcentration = alert.kind === 'concentration';
                  const Icon = isPositive ? TrendingUp : TrendingDown;
                  return (
                    <button
                      key={`${alert.account}-${alert.kind}`}
                      type="button"
                      onClick={() => onSelectCustomer(alert.account)}
                      className="w-full text-right rounded-xl border border-slate-100 hover:border-amber-200 hover:bg-amber-50/50 px-2.5 py-2 transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black text-slate-800 truncate">
                          {alert.customerName}
                        </span>
                        <span
                          className={`text-[9px] font-black inline-flex items-center gap-0.5 ${
                            isPositive
                              ? 'text-emerald-600'
                              : isConcentration
                                ? 'text-amber-600'
                                : 'text-rose-600'
                          }`}
                        >
                          {!isConcentration && <Icon className="w-3 h-3" />}
                          {alert.title}
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5">{alert.detail}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-center space-y-2">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <UserRound className="w-5 h-5" />
          </div>
          <p className="text-[11px] font-black text-slate-700">اختر عميلاً من الجدول</p>
          <p className="text-[10px] text-slate-400">
            هتشوف هنا ملفه المختصر، أعلى أصنافه، وآخر أوامر البيع والتنبيهات.
          </p>
        </div>
      )}
    </aside>
  );
};

