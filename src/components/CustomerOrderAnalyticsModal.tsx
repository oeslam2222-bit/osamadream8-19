import React, { useMemo } from 'react';
import {
  X,
  TrendingUp,
  BarChart3,
  Package,
  Sparkles,
  PieChart,
  ShoppingBag,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Calendar,
  Layers,
  Award
} from 'lucide-react';
import { Invoice, InvoiceItem } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { cleanProductCode } from '../services/excelService';

interface CustomerOrderAnalyticsModalProps {
  invoice: Invoice | null;
  allInvoices: Invoice[];
  isOpen: boolean;
  onClose: () => void;
}

interface ItemAnalytics {
  item: InvoiceItem;
  code: string;
  name: string;
  cartons: number;
  pieces: number;
  itemTotal: number;
  percentageOfOrder: number;
  // Historical stats for this customer
  historicalOrderCount: number;
  historicalTotalCartons: number;
  averageCartonsPerOrder: number;
  comparisonStatus: 'higher' | 'normal' | 'lower' | 'first_time';
  differencePercent: number;
}

export const CustomerOrderAnalyticsModal: React.FC<CustomerOrderAnalyticsModalProps> = ({
  invoice,
  allInvoices,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !invoice) return null;

  // Filter all prior/other invoices for this customer to understand historical patterns
  const customerPastInvoices = useMemo(() => {
    return allInvoices.filter(
      (inv) =>
        (inv.customerId === invoice.customerId || inv.customerName === invoice.customerName) &&
        inv.id !== invoice.id &&
        inv.status !== 'مرفوضة / ملغاة' &&
        inv.status !== 'ملغاة'
    );
  }, [allInvoices, invoice]);

  // Aggregate historical sales by product code for this customer
  const customerHistoricalByProduct = useMemo(() => {
    const map = new Map<
      string,
      { count: number; totalCartons: number; totalPieces: number; totalValue: number; lastDate: string }
    >();

    customerPastInvoices.forEach((inv) => {
      (inv.items || []).forEach((item) => {
        const code = cleanProductCode(item.productCode || '');
        if (!code) return;
        const existing = map.get(code) || {
          count: 0,
          totalCartons: 0,
          totalPieces: 0,
          totalValue: 0,
          lastDate: inv.date || '',
        };
        existing.count += 1;
        existing.totalCartons += Number(item.cartonCount || 0);
        existing.totalPieces += Number(item.pieceCount || 0);
        existing.totalValue += Number(item.netTotal || item.totalPrice || item.totalBeforeTax || 0);
        if (inv.date && inv.date > existing.lastDate) {
          existing.lastDate = inv.date;
        }
        map.set(code, existing);
      });
    });

    return map;
  }, [customerPastInvoices]);

  // Order item analytics
  const itemAnalyticsList: ItemAnalytics[] = useMemo(() => {
    const totalOrderAmount = Number(invoice.estimatedGrandTotal || invoice.subtotal || 0) || 1;

    return (invoice.items || []).map((item) => {
      const code = cleanProductCode(item.productCode || '');
      const cartons = Number(item.cartonCount || 0);
      const pieces = Number(item.pieceCount || 0);
      const itemTotal = Number(item.netTotal || item.totalPrice || item.totalBeforeTax || 0);
      const percentageOfOrder = Math.round((itemTotal / totalOrderAmount) * 100);

      const hist = customerHistoricalByProduct.get(code);
      const historicalOrderCount = hist ? hist.count : 0;
      const historicalTotalCartons = hist ? hist.totalCartons : 0;
      const averageCartonsPerOrder =
        historicalOrderCount > 0 ? Math.round((historicalTotalCartons / historicalOrderCount) * 10) / 10 : cartons;

      let comparisonStatus: 'higher' | 'normal' | 'lower' | 'first_time' = 'first_time';
      let differencePercent = 0;

      if (historicalOrderCount > 0 && averageCartonsPerOrder > 0) {
        differencePercent = Math.round(((cartons - averageCartonsPerOrder) / averageCartonsPerOrder) * 100);
        if (differencePercent > 15) {
          comparisonStatus = 'higher';
        } else if (differencePercent < -15) {
          comparisonStatus = 'lower';
        } else {
          comparisonStatus = 'normal';
        }
      }

      return {
        item,
        code,
        name: item.productName || 'صنف غير مسمى',
        cartons,
        pieces,
        itemTotal,
        percentageOfOrder,
        historicalOrderCount,
        historicalTotalCartons,
        averageCartonsPerOrder,
        comparisonStatus,
        differencePercent,
      };
    });
  }, [invoice, customerHistoricalByProduct]);

  // Sort items by percentage of order value descending
  const sortedItemAnalytics = useMemo(() => {
    return [...itemAnalyticsList].sort((a, b) => b.itemTotal - a.itemTotal);
  }, [itemAnalyticsList]);

  // Top all-time products for this customer
  const topFavoriteProducts = useMemo(() => {
    const items = Array.from(customerHistoricalByProduct.entries()).map(([code, stats]) => ({
      code,
      ...stats,
    }));
    return items.sort((a, b) => b.totalCartons - a.totalCartons).slice(0, 5);
  }, [customerHistoricalByProduct]);

  // Products the customer frequently buys that are MISSING in today's order
  const missingFrequentItems = useMemo(() => {
    const currentCodes = new Set(itemAnalyticsList.map((i) => i.code));
    return topFavoriteProducts.filter((item) => !currentCodes.has(item.code) && item.count >= 2);
  }, [itemAnalyticsList, topFavoriteProducts]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-[var(--app-navy)] to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-[var(--app-navy)]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--app-navy)] text-[#60a5fa] border border-[var(--app-navy)] flex items-center justify-center font-black">
              <BarChart3 className="w-6 h-6 text-[#60a5fa]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-white">
                  تحليل مسحوبات العميل ونسب الأصناف 📊
                </h3>
                <span className="bg-[var(--app-navy)] text-[#60a5fa] text-[11px] font-black px-2.5 py-0.5 rounded-full border border-[var(--app-navy)]">
                  ذكاء المبيعات
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                العميل: <strong className="text-[#d97706]">{invoice.customerName}</strong> ({invoice.branchName || 'عام'}) • فاتورة #{invoice.invoiceNumber}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-slate-800">
          
          {/* Quick KPI Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 block">إجمالي قيمة الطلبية:</span>
              <strong className="text-base sm:text-lg font-black text-slate-900 mt-0.5 block font-mono">
                {formatCurrency(invoice.estimatedGrandTotal || invoice.subtotal || 0)}
              </strong>
              <span className="text-[10px] text-slate-400 font-medium">
                {invoice.items?.length || 0} أصناف في الفاتورة
              </span>
            </div>

            <div className="bg-[var(--app-navy-tint)] p-3.5 rounded-2xl border border-[var(--app-navy-line)]">
              <span className="text-[11px] font-bold text-[var(--app-navy-text)] block">إجمالي كراتين الطلبية:</span>
              <strong className="text-base sm:text-lg font-black text-[var(--app-navy-text)] mt-0.5 block">
                {invoice.totalCartons || invoice.items?.reduce((s, i) => s + (Number(i.cartonCount || 0)), 0) || 0} كرتونة
              </strong>
              <span className="text-[10px] text-[var(--app-navy-text)] font-medium">
                توزيع على {invoice.items?.length || 0} صنف
              </span>
            </div>

            <div className="bg-[var(--app-ok-tint)] p-3.5 rounded-2xl border border-[var(--app-ok-line)]">
              <span className="text-[11px] font-bold text-[var(--app-ok-text)] block">سجل تعاملات العميل:</span>
              <strong className="text-base sm:text-lg font-black text-[var(--app-ok-text)] mt-0.5 block">
                {customerPastInvoices.length + 1} طلبية مسجلة
              </strong>
              <span className="text-[10px] text-[var(--app-ok-text)] font-medium">
                {customerPastInvoices.length > 0 ? 'عميل منتظم ومستمر' : 'أول طلبية للعميل'}
              </span>
            </div>

            <div className="bg-[var(--app-warn-tint)] p-3.5 rounded-2xl border border-[var(--app-warn-line)]">
              <span className="text-[11px] font-bold text-[var(--app-warn-text)] block">الصنف الأكبر قيمة:</span>
              <strong className="text-xs sm:text-sm font-black text-[var(--app-warn-text)] mt-0.5 block truncate" title={sortedItemAnalytics[0]?.name}>
                {sortedItemAnalytics[0]?.name || '---'}
              </strong>
              <span className="text-[10px] text-[var(--app-warn-text)] font-bold">
                يمثل {sortedItemAnalytics[0]?.percentageOfOrder || 0}% من قيمة الفاتورة
              </span>
            </div>
          </div>

          {/* Missing Frequent Items Alert (Cross-Sell Alert) */}
          {missingFrequentItems.length > 0 && (
            <div className="bg-gradient-to-r from-[var(--app-warn)] via-[var(--app-warn)] to-[var(--app-warn)] p-4 rounded-2xl border border-[var(--app-warn-line)] flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[var(--app-warn)] text-white flex items-center justify-center font-black shrink-0 mt-0.5 shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="space-y-1 leading-relaxed">
                <h4 className="text-xs sm:text-sm font-black text-[var(--app-warn-text)]">
                  فرصة زيادة مبيعات: أصناف معتادة لم يطلبها العميل اليوم! 💡
                </h4>
                <p className="text-xs text-[var(--app-warn-text)]">
                  هذا العميل يطلب الأصناف التالية باستمرار في فواتيره السابقة، ولكنها <strong>غير مضافة في طلبية اليوم</strong>:
                </p>
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {missingFrequentItems.map((item) => (
                    <span
                      key={item.code}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white text-slate-800 text-xs font-bold border border-[var(--app-warn-line)] shadow-xs"
                    >
                      <Package className="w-3.5 h-3.5 text-[var(--app-warn-text)]" />
                      <span>كود: {item.code}</span>
                      <span className="text-slate-400 font-normal">({item.totalCartons} كرتونة سابقة)</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Item Breakdown & Percentage Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-[var(--app-navy-text)]" />
                <span>تحليل تفصيلي لأصناف الطلبية ونسبة مساهمة كل صنف</span>
              </h4>
              <span className="text-xs font-bold text-slate-500">
                مرتبة حسب الأعلى مساهمة في القيمة
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-black text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">الصنف والكود</th>
                      <th className="p-3 text-center">الكمية بالطلب</th>
                      <th className="p-3 text-center">إجمالي القيمة</th>
                      <th className="p-3 text-center">نسبة المساهمة (%)</th>
                      <th className="p-3 text-center">معدل سحب العميل التاريخي</th>
                      <th className="p-3 text-center">مؤشر سحب اليوم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedItemAnalytics.map((analysis, idx) => (
                      <tr key={analysis.code || idx} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="p-3">
                          <strong className="text-slate-900 block font-black text-xs">{analysis.name}</strong>
                          <span className="text-[10px] font-mono text-slate-500">كود: {analysis.code}</span>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-800">
                          <span className="inline-block bg-slate-100 px-2.5 py-1 rounded-lg">
                            {analysis.cartons} كرتونة {analysis.pieces > 0 ? `+ ${analysis.pieces} ق` : ''}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-black text-slate-900">
                          {formatCurrency(analysis.itemTotal)}
                        </td>
                        <td className="p-3 text-center min-w-[130px]">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                              <div
                                className="bg-gradient-to-r from-[var(--app-navy)] to-[var(--app-ok)] h-full rounded-full transition-all"
                                style={{ width: `${Math.min(100, analysis.percentageOfOrder)}%` }}
                              />
                            </div>
                            <span className="font-mono font-black text-[var(--app-navy-text)] text-xs">
                              {analysis.percentageOfOrder}%
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-center text-slate-600 font-bold">
                          {analysis.historicalOrderCount > 0 ? (
                            <span className="text-[11px]">
                              متوسط {analysis.averageCartonsPerOrder} كرتونة ({analysis.historicalOrderCount} طلبية سابقة)
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--app-ok-text)] bg-[var(--app-ok-tint)] px-2 py-0.5 rounded-md font-bold">
                              أول مرة يطلب الصنف ✨
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {analysis.comparisonStatus === 'higher' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--app-ok-text)] bg-[var(--app-ok-tint)] px-2 py-1 rounded-xl border border-[var(--app-ok-line)]">
                              <ArrowUpRight className="w-3.5 h-3.5 text-[var(--app-ok-text)]" />
                              <span>+{analysis.differencePercent}% فوق المعتاد 🔥</span>
                            </span>
                          )}
                          {analysis.comparisonStatus === 'lower' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--app-warn-text)] bg-[var(--app-warn-tint)] px-2 py-1 rounded-xl border border-[var(--app-warn-line)]">
                              <ArrowDownRight className="w-3.5 h-3.5 text-[var(--app-warn-text)]" />
                              <span>{analysis.differencePercent}% أقل من المعتاد</span>
                            </span>
                          )}
                          {analysis.comparisonStatus === 'normal' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--app-navy-text)] bg-[var(--app-navy-tint)] px-2 py-1 rounded-xl border border-[var(--app-navy-line)]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--app-navy-text)]" />
                              <span>سحب طبيعي ومتطابق</span>
                            </span>
                          )}
                          {analysis.comparisonStatus === 'first_time' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-xl">
                              <span>صنف جديد للعميل</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Historical Favorites Card */}
          {topFavoriteProducts.length > 0 && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-[var(--app-warn-text)]" />
                <h4 className="text-xs sm:text-sm font-black text-slate-900">
                  أكثر 5 أصناف يطلبها هذا العميل تاريخياً:
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {topFavoriteProducts.map((p, idx) => (
                  <div key={p.code} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block">كود الصنف: {p.code}</span>
                      <span className="text-[10px] text-slate-500">طلب {p.count} مرات في فواتير سابقة</span>
                    </div>
                    <span className="font-mono font-black text-[var(--app-navy-text)] bg-[var(--app-navy-tint)] px-2 py-1 rounded-lg">
                      {p.totalCartons} كرتونة
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="font-bold">
            💡 هذا التحليل يساعد المندوب والمشرف في معرفة تركيز مشتريات العميل واقتراح النواقص والكميات المناسبة لكل زيارة.
          </span>
          <button
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
