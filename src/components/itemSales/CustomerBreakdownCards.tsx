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
  const rowsOrders = rows.reduce(
    (acc, customer) => acc + (customer.ordersAvailable ? customer.invoicesCount : 0),
    0
  );

  return (
    <CardShell
      title="أهم العملاء شراءً"
      subtitle={`${customers.length.toLocaleString('en-US')} عميل • أعلى ${rows.length} في الفترة`}
      icon={<Trophy className="w-4 h-4" />}
      iconClass="bg-amber-50 text-amber-600"
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
          <table className="w-full text-right border-collapse min-w-[360px]">
            <thead>
              <tr className="text-[9.5px] text-slate-400 font-black border-b border-slate-100">
                <th className="py-1.5 px-1 font-black w-6">#</th>
                <th className="py-1.5 px-1 font-black">العميل</th>
                <th className="py-1.5 px-1 font-black text-center">الطلبات</th>
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
                      ? 'bg-amber-50/60'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <td className="py-1.5 px-1">
                    <span
                      className={`w-4 h-4 rounded-md text-[9px] font-black flex items-center justify-center ${
                        index === 0
                          ? 'bg-amber-500 text-white'
                          : index === 1
                            ? 'bg-slate-300 text-slate-700'
                            : index === 2
                              ? 'bg-orange-200 text-orange-800'
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
                        <div className="text-[8.5px] text-slate-400 font-bold font-mono truncate">
                          {customer.customerAccount || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-1.5 px-1 text-center text-[10px] font-bold text-slate-600 font-mono">
                    {customer.ordersAvailable ? customer.invoicesCount : '—'}
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
            <span>إجمالي المعروضين • {rowsOrders} طلب</span>
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
  const totalOrders = rows.reduce((acc, row) => acc + row.orders, 0);
  const totalQuantity = rows.reduce((acc, row) => acc + row.quantity, 0);

  return (
    <CardShell
      title="تحليل شهري للعملاء"
      subtitle="عدد الطلبات وقيمة المبيعات وعدد الأصناف ونسبة النمو لكل شهر"
      icon={<CalendarRange className="w-4 h-4" />}
      iconClass="bg-violet-50 text-violet-600"
      action={
        <span className="text-[9.5px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-500">
          {rows.length.toLocaleString('en-US')} شهر
        </span>
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty height={220} />
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-right border-collapse min-w-[580px]">
            <thead>
              <tr className="text-[9.5px] text-slate-400 font-black border-b border-slate-100">
                <th className="py-1.5 px-1.5 font-black">الشهر</th>
                <th className="py-1.5 px-1.5 font-black text-center">عدد الطلبات</th>
                <th className="py-1.5 px-1.5 font-black">إجمالي المبيعات</th>
                <th className="py-1.5 px-1.5 font-black text-center">الكمية</th>
                <th className="py-1.5 px-1.5 font-black text-center">عدد الأصناف</th>
                <th className="py-1.5 px-1.5 font-black text-center">عدد العملاء</th>
                <th className="py-1.5 px-1.5 font-black text-center">نسبة النمو</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 transition">
                  <td className="py-1.5 px-1.5 text-[10.5px] font-black text-slate-800">{row.label}</td>
                  <td className="py-1.5 px-1.5 text-center text-[10px] font-bold text-slate-600 font-mono">
                    {row.orders.toLocaleString('en-US')}
                  </td>
                  <td className="py-1.5 px-1.5 text-[10.5px] font-black text-slate-900 font-mono">
                    {formatCurrency(row.amount)}
                  </td>
                  <td className="py-1.5 px-1.5 text-center text-[10px] font-bold text-slate-600 font-mono">
                    {row.quantity.toLocaleString('en-US')}
                  </td>
                  <td className="py-1.5 px-1.5 text-center text-[10px] font-bold text-slate-600 font-mono">
                    {row.itemsCount.toLocaleString('en-US')}
                  </td>
                  <td className="py-1.5 px-1.5 text-center text-[10px] font-bold text-slate-600 font-mono">
                    {row.customersCount.toLocaleString('en-US')}
                  </td>
                  <td className="py-1.5 px-1.5 text-center">
                    <GrowthPill growth={row.growthPct} emptyLabel="—" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-[10px] font-black text-slate-700 bg-slate-50/70">
                <td className="py-1.5 px-1.5">الإجمالي</td>
                <td className="py-1.5 px-1.5 text-center font-mono">{totalOrders.toLocaleString('en-US')}</td>
                <td className="py-1.5 px-1.5 font-mono">{formatCurrency(totalAmount)}</td>
                <td className="py-1.5 px-1.5 text-center font-mono">{totalQuantity.toLocaleString('en-US')}</td>
                <td className="py-1.5 px-1.5 text-center text-slate-400">—</td>
                <td className="py-1.5 px-1.5 text-center text-slate-400">—</td>
                <td className="py-1.5 px-1.5 text-center text-slate-400">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </CardShell>
  );
};

