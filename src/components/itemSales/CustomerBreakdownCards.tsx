import { ArrowUpRight, CalendarRange, Trophy } from 'lucide-react';
import React from 'react';
import { CustomerSalesInsight, formatCompactAmount } from '../../services/customerItemSalesInsights';
import { MonthlyCustomerRow } from '../../services/itemSalesAnalytics';
import { formatCurrency } from '../../services/invoiceService';
import { CardShell, ChartEmpty, GrowthPill } from './ItemSalesPrimitives';

const initials = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0] || ''}${parts[1][0] || ''}`;
};

interface TopCustomersTableProps {
  customers: CustomerSalesInsight[];
  selectedAccount: string | null;
  onSelectCustomer: (account: string) => void;
  onOpenAll?: () => void;
  limit?: number;
}

export const TopCustomersTable: React.FC<TopCustomersTableProps> = ({
  customers,
  selectedAccount,
  onSelectCustomer,
  onOpenAll,
  limit = 6
}) => {
  const rows = customers.slice(0, limit);
  const total = customers.reduce((acc, customer) => acc + customer.amount, 0);
  const rowsTotal = rows.reduce((acc, customer) => acc + customer.amount, 0);

  return (
    <CardShell
      title="أهم العملاء شراءً"
      subtitle={`أعلى ${rows.length.toLocaleString('en-US')} عملاء في الفترة`}
      icon={<Trophy className="w-4 h-4" />}
      iconClass="bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]"
      action={
        onOpenAll ? (
          <button
            type="button"
            onClick={onOpenAll}
            className="text-[9.5px] font-black text-deep-slate hover:text-warn inline-flex items-center gap-0.5 cursor-pointer"
          >
            عرض الكل
            <ArrowUpRight className="w-3 h-3" />
          </button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty height={216} message="لا يوجد عملاء في الفترة المحددة" />
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-right border-collapse min-w-[320px]">
            <thead>
              <tr className="text-[9.5px] text-slate-400 font-black border-b border-slate-100">
                <th className="py-1.5 px-1 font-black w-6">#</th>
                <th className="py-1.5 px-1 font-black">العميل</th>
                <th className="py-1.5 px-1 font-black">المبيعات</th>
                <th className="py-1.5 px-1 font-black text-center">النمو</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((customer, index) => (
                <tr
                  key={customer.customerAccount || `${customer.customerName}-${index}`}
                  onClick={() => onSelectCustomer(customer.customerAccount)}
                  className={`border-b border-slate-50 last:border-0 cursor-pointer transition ${
                    customer.customerAccount === selectedAccount
                      ? 'bg-[var(--app-warn-tint)]'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <td className="py-1.5 px-1">
                    <span
                      className={`w-4 h-4 rounded-md text-[9px] font-black flex items-center justify-center ${
                        index === 0
                          ? 'bg-[var(--app-warn)] text-white'
                          : index === 1
                            ? 'bg-slate-300 text-slate-700'
                            : index === 2
                              ? 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]'
                              : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td className="py-1.5 px-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-navy-deep/5 text-deep-slate text-[9px] font-black flex items-center justify-center shrink-0">
                        {initials(customer.customerName)}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[10.5px] font-black text-slate-800 truncate max-w-[150px]">
                          {customer.customerName}
                        </div>
                        <div className="text-[9px] font-bold text-[var(--app-primary-text)] font-mono truncate" title={`كود العميل: ${customer.customerAccount || '—'}`}>
                          كود: {customer.customerAccount || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-1.5 px-1">
                    <div className="text-[10.5px] font-black text-slate-900 font-mono">
                      {formatCurrency(customer.amount)}
                    </div>
                    <div className="text-[8.5px] text-slate-400 font-bold">
                      {Math.round(customer.sharePct)}% من المبيعات
                    </div>
                  </td>
                  <td className="py-1.5 px-1 text-center">
                    <GrowthPill growth={customer.growthPct} emptyLabel="—" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[9.5px] font-bold text-slate-500">
            <span>إجمالي المعروضين</span>
            <span className="font-mono text-slate-700">
              {formatCompactAmount(rowsTotal)}
              {total > 0 ? ` (${Math.round((rowsTotal / total) * 100)}%)` : ''}
            </span>
          </div>
        </div>
      )}
    </CardShell>
  );
};

interface MonthlyCustomerAnalysisTableProps {
  rows: MonthlyCustomerRow[];
}

export const MonthlyCustomerAnalysisTable: React.FC<MonthlyCustomerAnalysisTableProps> = ({ rows }) => {
  const totalAmount = rows.reduce((acc, row) => acc + row.amount, 0);
  const totalQuantity = rows.reduce((acc, row) => acc + row.quantity, 0);

  return (
    <CardShell
      title="تحليل شهري للعملاء"
      subtitle="قيمة المبيعات والكمية وعدد الأصناف وعدد العملاء (بكود/اسم العميل له مبيعات في الشهر) ونسبة النمو"
      icon={<CalendarRange className="w-4 h-4" />}
      iconClass="bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]"
      action={
        <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-[var(--app-card-secondary)] text-[var(--app-text-muted)] border border-[var(--app-border)]">
          {rows.length.toLocaleString('en-US')} شهر
        </span>
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty height={220} />
      ) : (
        <div className="overflow-x-auto -mx-1 rounded-xl border border-[var(--app-border)]">
          <table className="w-full text-right border-collapse min-w-[760px]">
            <thead>
              <tr className="text-[10.5px] font-black bg-[var(--app-card-secondary)] text-[var(--app-text-muted)] border-b border-[var(--app-border)]">
                <th className="py-3 px-4 font-black whitespace-nowrap">الشهر</th>
                <th className="py-3 px-4 font-black whitespace-nowrap">إجمالي المبيعات</th>
                <th className="py-3 px-4 font-black text-center whitespace-nowrap">الكمية</th>
                <th className="py-3 px-4 font-black text-center whitespace-nowrap">عدد الأصناف</th>
                <th className="py-3 px-4 font-black text-center whitespace-nowrap">عدد العملاء</th>
                <th className="py-3 px-4 font-black text-center whitespace-nowrap">نسبة النمو</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month} className="border-b border-[var(--app-border)] last:border-0 hover:bg-[var(--app-card-hover)] transition">
                  <td className="py-3 px-4 text-[12px] font-black text-[var(--app-text)] whitespace-nowrap">{row.label}</td>
                  <td className="py-3 px-4 text-[12px] font-black text-[var(--app-text)] font-mono tabular-nums whitespace-nowrap">
                    {formatCurrency(row.amount)}
                  </td>
                  <td className="py-3 px-4 text-center text-[12px] font-black text-[var(--app-text)] font-mono tabular-nums">
                    {row.quantity.toLocaleString('en-US')}
                  </td>
                  <td className="py-3 px-4 text-center text-[12px] font-black text-[var(--app-text)] font-mono tabular-nums">
                    {row.itemsCount.toLocaleString('en-US')}
                  </td>
                  <td className="py-3 px-4 text-center text-[12px] font-black text-[var(--app-text)] font-mono tabular-nums">
                    {row.customersCount.toLocaleString('en-US')}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <GrowthPill growth={row.growthPct} emptyLabel="—" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-[12px] font-black text-[var(--app-text)] bg-[var(--app-card-secondary)]">
                <td className="py-3 px-4">الإجمالي</td>
                <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">{formatCurrency(totalAmount)}</td>
                <td className="py-3 px-4 text-center font-mono tabular-nums">{totalQuantity.toLocaleString('en-US')}</td>
                <td className="py-3 px-4 text-center text-[var(--app-text-muted)]">—</td>
                <td className="py-3 px-4 text-center text-[var(--app-text-muted)]">—</td>
                <td className="py-3 px-4 text-center text-[var(--app-text-muted)]">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </CardShell>
  );
};

