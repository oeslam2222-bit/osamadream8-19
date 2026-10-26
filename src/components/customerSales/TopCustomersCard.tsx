import { ArrowDownRight, ArrowUpRight, ChevronLeft, Download, Minus, Plus, Users } from 'lucide-react';
import React from 'react';
import { CustomerSalesInsight, formatGrowth } from '../../services/customerItemSalesInsights';
import { formatCurrency } from '../../services/invoiceService';

interface TopCustomersCardProps {
  customers: CustomerSalesInsight[];
  selectedAccount: string | null;
  onSelectCustomer: (account: string) => void;
  onStartOrder?: (account: string) => void;
  onOpenAll: () => void;
  onExport: () => void;
}

const GrowthCell: React.FC<{ growth: number | null }> = ({ growth }) => {
  const Icon = growth === null ? Minus : growth >= 0 ? ArrowUpRight : ArrowDownRight;
  const tone =
    growth === null ? 'text-slate-400' : growth >= 0 ? 'text-emerald-600' : 'text-rose-600';
  return (
    <span className={`inline-flex items-center gap-0.5 font-black font-mono text-[10px] ${tone}`}>
      <Icon className="w-3 h-3" />
      {formatGrowth(growth)}
    </span>
  );
};

export const TopCustomersCard: React.FC<TopCustomersCardProps> = ({
  customers,
  selectedAccount,
  onSelectCustomer,
  onStartOrder,
  onOpenAll,
  onExport
}) => {
  const visible = customers.slice(0, 8);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)]">
      <div className="p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-500" />
            أعلى العملاء في الفترة
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">
            {customers.length.toLocaleString('ar-EG')} عميل متعامل • اضغط على أي عميل لعرض ملفه
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-[10px] font-bold transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            تصدير
          </button>
          <button
            type="button"
            onClick={onOpenAll}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-[10px] font-bold transition cursor-pointer"
          >
            كل العملاء
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="p-10 text-center text-xs text-slate-400 font-bold border-t border-slate-100">
          لا توجد مبيعات مطابقة للفلاتر الحالية
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[11px]">
            <thead className="bg-slate-50 text-slate-500 border-y border-slate-100">
              <tr>
                <th className="px-3 py-2.5 font-black w-10">#</th>
                <th className="px-3 py-2.5 font-black">العميل</th>
                <th className="px-3 py-2.5 font-black text-center whitespace-nowrap">الفواتير</th>
                <th className="px-3 py-2.5 font-black whitespace-nowrap">قيمة المبيعات</th>
                <th className="px-3 py-2.5 font-black whitespace-nowrap">% من الإجمالي</th>
                <th className="px-3 py-2.5 font-black text-center whitespace-nowrap">نمو الشهر</th>
                <th className="px-3 py-2.5 font-black text-center w-14">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((customer, index) => {
                const isSelected = selectedAccount === customer.customerAccount;
                return (
                  <tr
                    key={customer.customerAccount}
                    onClick={() => onSelectCustomer(customer.customerAccount)}
                    className={`cursor-pointer transition ${
                      isSelected ? 'bg-amber-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <span
                        className={`w-6 h-6 inline-flex items-center justify-center rounded-lg text-[10px] font-black ${
                          index === 0
                            ? 'bg-amber-100 text-amber-900'
                            : index === 1
                              ? 'bg-slate-200 text-slate-700'
                              : index === 2
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 min-w-[170px]">
                      <div className="font-black text-slate-900 truncate max-w-[220px]">
                        {customer.customerName}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{customer.customerAccount || '---'}</span>
                        <span>•</span>
                        <span className="font-sans">{customer.warehouse}</span>
                        {customer.repName && (
                          <>
                            <span>•</span>
                            <span className="font-sans">{customer.repName}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-black text-slate-700 font-mono">
                      {customer.ordersAvailable ? customer.invoicesCount : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-black text-slate-900 font-mono">
                        {formatCurrency(customer.amount)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 min-w-[110px]">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#c99a43]"
                            style={{ width: `${Math.min(100, Math.max(2, customer.sharePct))}%` }}
                          />
                        </div>
                        <span className="font-black text-slate-700 font-mono text-[10px]">
                          {customer.sharePct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <GrowthCell growth={customer.growthPct} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {onStartOrder && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onStartOrder(customer.customerAccount);
                          }}
                          title="إنشاء طلب جديد"
                          className="p-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
