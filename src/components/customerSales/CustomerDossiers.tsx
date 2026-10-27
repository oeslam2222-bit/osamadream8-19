import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Phone,
  Plus,
  Tag,
  UserRound,
  Users
} from 'lucide-react';
import React from 'react';
import { MONTH_NAMES_MAP } from '../../services/customerItemSalesService';
import { formatCurrency } from '../../services/invoiceService';
import { CustomerItemSalesSummary } from '../../types';

interface CustomerDossiersProps {
  summaries: CustomerItemSalesSummary[];
  yearlySummaries: Map<string, CustomerItemSalesSummary>;
  displayLimit: number;
  expandedAccounts: Set<string>;
  selectedMonth: number | 'all';
  onToggle: (account: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onChangeLimit: (limit: number) => void;
  onSelectMonth: (month: number | 'all') => void;
  onStartOrder?: (account: string, itemCode?: string) => void;
}

export const CustomerDossiers: React.FC<CustomerDossiersProps> = ({
  summaries,
  yearlySummaries,
  displayLimit,
  expandedAccounts,
  selectedMonth,
  onToggle,
  onExpandAll,
  onCollapseAll,
  onChangeLimit,
  onSelectMonth,
  onStartOrder
}) => {
  if (summaries.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300 space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <Users className="w-6 h-6" />
        </div>
        <h3 className="text-base font-black text-slate-900">لا توجد مبيعات أصناف مطابقة</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          غيّر الشهر أو مجموعة الصنف، أو حدّث شيت مبيعات العملاء بالصنف من Google Sheets.
        </p>
      </div>
    );
  }

  const visible = summaries.slice(0, displayLimit);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-xs text-slate-600 font-bold">
          إجمالي <strong className="text-slate-900">{summaries.length}</strong> عميل مطابق
          {displayLimit < summaries.length && (
            <span className="text-amber-700"> • يتم عرض أول {displayLimit} عميل لسرعة التصفح</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={displayLimit}
            onChange={(event) => onChangeLimit(Number(event.target.value))}
            aria-label="عدد بطاقات العملاء المعروضة"
            className="h-9 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value={2}>عرض أول عميلين</option>
            <option value={5}>عرض أول 5 عملاء</option>
            <option value={10}>عرض أول 10 عملاء</option>
            <option value={25}>عرض أول 25 عميل</option>
            <option value={1000}>عرض الكل ({summaries.length})</option>
          </select>

          <button
            type="button"
            onClick={onExpandAll}
            className="h-9 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-[11px] font-bold transition cursor-pointer"
          >
            توسيع الكل
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            className="h-9 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-[11px] font-bold transition cursor-pointer"
          >
            طي الكل
          </button>
        </div>
      </div>

      {visible.map((summary, index) => {
        const isExpanded = expandedAccounts.has(summary.customerAccount);
        const yearly =
          yearlySummaries.get(summary.customerAccount) ||
          yearlySummaries.get(summary.customerName) ||
          summary;
        return (
          <div
            key={summary.customerAccount || index}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:border-slate-300 transition"
          >
            <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-200">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-slate-900 text-amber-300 flex items-center justify-center font-black text-sm shrink-0">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-black text-slate-900">{summary.customerName}</h3>
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300" title="كود العميل">
                        كود: {summary.customerAccount || '---'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-900 border border-blue-200 font-bold inline-flex items-center gap-1" title="الفرع المعتمد">
                        <Building2 className="w-3 h-3 text-blue-700 shrink-0" />
                        {summary.linkedBranch || summary.warehouse || 'الفرع الرئيسي'}
                      </span>
                      {summary.isCustomerLinked ? (
                        <span className="text-[9px] px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                          مربوط بقاعدة العملاء
                        </span>
                      ) : (
                        <span className="text-[9px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 font-medium border border-slate-200">
                          غير مسجل بقاعدة العملاء
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 text-[11px] text-slate-500 mt-1 flex-wrap font-medium">
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="w-3 h-3 text-slate-500 shrink-0" />
                        المندوب المعتمد: <strong className="text-slate-900">{summary.linkedRepName || summary.repName || 'غير محدد'}</strong>
                      </span>
                      {summary.linkedSupervisorName && (
                        <>
                          <span>•</span>
                          <span>المشرف: <strong className="text-slate-700">{summary.linkedSupervisorName}</strong></span>
                        </>
                      )}
                      {summary.linkedPhone && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 font-mono text-slate-600">
                            <Phone className="w-2.5 h-2.5 text-slate-400" />
                            {summary.linkedPhone}
                          </span>
                        </>
                      )}
                      <span>•</span>
                      <span>
                        الأصناف: <strong className="text-slate-800">{summary.distinctItemsCount}</strong>
                      </span>
                      {summary.linkedBalance !== undefined && summary.linkedBalance !== 0 && (
                        <>
                          <span>•</span>
                          <span className="text-amber-800 font-bold">
                            المديونية: <span className="font-mono">{formatCurrency(summary.linkedBalance)}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-between lg:justify-end">
                  <div className="bg-white border border-slate-200 px-4 py-2 rounded-2xl text-center">
                    <div className="text-[9px] text-slate-500 font-bold">إجمالي المشتريات</div>
                    <div className="text-sm font-black text-emerald-700 font-mono">
                      {formatCurrency(summary.totalAmount)}
                    </div>
                    <div className="text-[9px] text-slate-400">
                      {summary.totalQuantity.toLocaleString('ar-EG')} وحدة
                    </div>
                  </div>

                  {onStartOrder && (
                    <button
                      type="button"
                      onClick={() => onStartOrder(summary.customerAccount)}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3 py-2 rounded-xl text-[11px] flex items-center gap-1 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      طلب جديد
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onToggle(summary.customerAccount)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-3 py-2 rounded-xl text-[11px] flex items-center gap-1 transition cursor-pointer"
                  >
                    {isExpanded ? 'طي الأصناف' : 'عرض الأصناف'}
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-2">
                <span>توزيع المبيعات الشهرية</span>
                <span className="text-slate-400 font-normal">اضغط على الشهر للتصفية</span>
              </div>

              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 text-center">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                  const amount = yearly.monthlySales[month] || 0;
                  const quantity = yearly.monthlyQuantities[month] || 0;
                  const hasSales = amount > 0;
                  const isActive = selectedMonth === month;

                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => onSelectMonth(isActive ? 'all' : month)}
                      className={`p-2 rounded-xl border text-[10px] transition cursor-pointer ${
                        isActive
                          ? 'bg-[#102b4e] text-white border-[#102b4e]'
                          : hasSales
                            ? 'bg-white border-amber-300 hover:border-amber-500'
                            : 'bg-slate-100/60 border-transparent opacity-60'
                      }`}
                    >
                      <div className={isActive ? 'text-amber-300 font-bold' : 'text-slate-500 font-bold'}>
                        {MONTH_NAMES_MAP[month]}
                      </div>
                      <div
                        className={`font-black mt-0.5 font-mono ${
                          hasSales ? (isActive ? 'text-white' : 'text-emerald-700') : 'text-slate-400'
                        }`}
                      >
                        {hasSales ? `${Math.round(amount / 1000)}k` : '---'}
                      </div>
                      {hasSales && (
                        <div className={isActive ? 'text-slate-300' : 'text-slate-400'}>{quantity} ك</div>
                      )}
                    </button>
                  );
                })}
              </div>

              {Object.keys(summary.groupBreakdown).length > 0 && (
                <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="font-bold text-slate-600">مجموعات الأصناف:</span>
                  {Object.entries(summary.groupBreakdown).map(([group, data]) => (
                    <span
                      key={group}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium"
                    >
                      <Tag className="w-3 h-3 text-amber-500" />
                      <strong>{group}</strong>
                      <span className="text-emerald-600 font-bold">({formatCurrency(data.amount)})</span>
                      <span className="text-slate-400 text-[10px]">{data.quantity} كرتونة</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {isExpanded && (
              <div className="overflow-x-auto p-4 sm:p-5 border-t border-slate-100 animate-in fade-in">
                <table className="w-full text-right text-[11px]">
                  <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">كود الصنف</th>
                      <th className="p-2.5">اسم الصنف</th>
                      <th className="p-2.5">المجموعة / العائلة</th>
                      <th className="p-2.5">الوحدة</th>
                      <th className="p-2.5">معامل التحويل</th>
                      <th className="p-2.5 text-emerald-800">الكمية</th>
                      <th className="p-2.5 text-emerald-800">المبلغ</th>
                      <th className="p-2.5 text-center">أشهر الشراء</th>
                      <th className="p-2.5 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {summary.items.map((item, itemIndex) => {
                      const activeMonths = Object.keys(item.monthlyBreakdown)
                        .map(Number)
                        .sort((a, b) => a - b);

                      return (
                        <tr key={item.itemCode || itemIndex} className="hover:bg-amber-50/40 transition">
                          <td className="p-2.5 text-slate-400 font-mono">{itemIndex + 1}</td>
                          <td className="p-2.5 font-mono font-bold text-amber-900">{item.itemCode}</td>
                          <td className="p-2.5 font-black text-slate-900 min-w-[150px]">{item.itemName}</td>
                          <td className="p-2.5 text-slate-600">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold">
                              {item.itemGroup}
                            </span>
                            {item.familyDimension && item.familyDimension !== item.itemGroup && (
                              <span className="block text-[9px] text-slate-400 mt-0.5">
                                {item.familyDimension}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 font-bold text-slate-700">{item.unit || 'كرتونة'}</td>
                          <td className="p-2.5 font-mono text-slate-700">{item.factor} قطعة</td>
                          <td className="p-2.5 font-mono font-black text-emerald-700">
                            {item.totalQuantity.toLocaleString('ar-EG')}
                          </td>
                          <td className="p-2.5 font-mono font-black text-emerald-800">
                            {formatCurrency(item.totalAmount)}
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="flex items-center justify-center gap-1 flex-wrap max-w-xs">
                              {activeMonths.map((month) => (
                                <span
                                  key={month}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold border border-emerald-200"
                                  title={`${MONTH_NAMES_MAP[month]}: ${item.monthlyBreakdown[month]?.quantity} كرتونة`}
                                >
                                  {MONTH_NAMES_MAP[month]}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-2.5 text-center">
                            {onStartOrder && (
                              <button
                                type="button"
                                onClick={() => onStartOrder(summary.customerAccount, item.itemCode)}
                                title="طلب هذا الصنف للعميل"
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
      })}
    </div>
  );
};
