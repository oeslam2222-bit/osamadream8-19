import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { formatCurrency } from '../../services/invoiceService';
import {
  buildItemSalesAggregates,
  fetchItemSalesAggregates,
  ItemSalesAggDoc,
  ItemSalesSector,
  saveItemSalesAggregates,
} from '../../services/itemSalesAggregateService';
import { MONTH_NAMES_MAP } from '../../services/customerItemSalesService';
import { CustomerItemSaleRecord } from '../../types';

interface MonthlyAggregateCardProps {
  sector: 'all' | 'home' | 'electrical';
  /** الصفوف المحلية — بتستخدم لبناء الملخص مرة واحدة، مش بتنزّل حاجة من السيرفر. */
  records: CustomerItemSaleRecord[];
  resolveSector: (record: CustomerItemSaleRecord) => ItemSalesSector;
}

/**
 * ملخص مبيعات الأصناف بالشهر من طبقة التجميع.
 *
 * بتقرأ صف أو اتنين لكل شهر (20-80KB) بدل ما الصفحة تنزّل الجدول الخام
 * (~100 ألف صف). الأرقام هنا نفس أرقام الكروت لأنها من نفس المصدر.
 */
export const MonthlyAggregateCard: React.FC<MonthlyAggregateCardProps> = ({ sector, records, resolveSector }) => {
  const [docs, setDocs] = useState<ItemSalesAggDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuilding, setIsBuilding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchItemSalesAggregates(sector === 'all' ? undefined : { sector });
      setDocs(res.docs);
      if (!res.success && res.error) setMessage(res.error);
    } finally {
      setIsLoading(false);
    }
  }, [sector]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBuild = async () => {
    if (records.length === 0) {
      setMessage('مفيش صفوف محلية لبناء الملخص. استورد الشيت أو اجلب البيانات الأول.');
      return;
    }
    setIsBuilding(true);
    setMessage(null);
    try {
      const built = buildItemSalesAggregates(records, {
        resolveSector,
        maxCustomers: 400,
      });
      const filtered = sector === 'all' ? built : built.filter((doc) => doc.sector === sector);
      const res = await saveItemSalesAggregates(filtered);
      if (res.success) {
        setMessage(`تم تحديث الملخص: ${res.saved} شهر/قطاع (${filtered.reduce((sum, doc) => sum + doc.rows, 0).toLocaleString('ar-EG')} صف تم تجميعه).`);
        await load();
      } else {
        setMessage(res.error || 'فشل حفظ الملخص');
      }
    } finally {
      setIsBuilding(false);
    }
  };

  const totals = docs.reduce(
    (acc, doc) => ({
      amount: acc.amount + doc.totals.a,
      pieces: acc.pieces + doc.totals.p,
      rows: acc.rows + doc.rows,
    }),
    { amount: 0, pieces: 0, rows: 0 }
  );

  return (
    <section className="bg-white rounded-2xl border border-[var(--tg-line)] shadow-[0_2px_10px_rgba(15,43,56,0.04)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--tg-line)] flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] inline-flex items-center justify-center">
            <BarChart3 className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-900">ملخص الشهور (مجموع مسبقًا)</h3>
            <p className="text-[11px] font-bold text-[var(--tg-muted)]">
              أرقام مجمّعة لكل شهر — بتُقرأ من السيرفر كملخص صغير بدل تنزيل كل الصفوف.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleBuild}
          disabled={isBuilding || isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black border border-[var(--tg-line)] bg-slate-50 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBuilding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span>تحديث الملخص من البيانات المحلية</span>
        </button>
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-xs font-bold text-[var(--tg-muted)]">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          جارٍ قراءة الملخص…
        </div>
      ) : docs.length === 0 ? (
        <div className="p-6 text-center space-y-1">
          <div className="text-xs font-black text-slate-700">مفيش ملخص محفوظ لسه</div>
          <div className="text-[11px] font-bold text-[var(--tg-muted)]">
            اضغط «تحديث الملخص» بعد استيراد الشيت — بعدها أي جهاز يفتح الصفحة بيقرأ الملخص الصغير فقط.
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-slate-50 text-[10px] sm:text-[11px] font-black text-slate-500">
                  <th className="px-3 py-2">الشهر</th>
                  <th className="px-3 py-2">القطاع</th>
                  <th className="px-3 py-2">عدد العملاء</th>
                  <th className="px-3 py-2">إجمالي القطع</th>
                  <th className="px-3 py-2">إجمالي المبلغ</th>
                  <th className="px-3 py-2">عدد الأصناف</th>
                  <th className="px-3 py-2">أعلى صنف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--tg-line)]">
                {docs.map((doc) => {
                  const topItem = doc.items[0];
                  return (
                    <tr key={`${doc.sector}-${doc.month}`} className="text-[11px] sm:text-xs">
                      <td className="px-3 py-2 font-black text-slate-800">
                        {MONTH_NAMES_MAP[doc.month] || `شهر ${doc.month}`}
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-600">
                        {doc.sector === 'electrical' ? 'كهرباء' : 'منزلي'}
                      </td>
                      <td className="px-3 py-2 tg-num font-bold text-slate-700">{doc.totals.cu.toLocaleString('ar-EG')}</td>
                      <td className="px-3 py-2 tg-num font-bold text-slate-700">{Math.round(doc.totals.p).toLocaleString('ar-EG')}</td>
                      <td className="px-3 py-2 tg-num font-black text-slate-900">{formatCurrency(doc.totals.a)}</td>
                      <td className="px-3 py-2 tg-num font-bold text-slate-700">{doc.items.length.toLocaleString('ar-EG')}</td>
                      <td className="px-3 py-2 font-bold text-slate-600 max-w-[220px] truncate" title={topItem?.n || ''}>
                        {topItem ? `${topItem.n} — ${formatCurrency(topItem.a)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 text-[11px] font-black text-slate-700">
                  <td className="px-3 py-2" colSpan={3}>الإجمالي ({totals.rows.toLocaleString('ar-EG')} صف مجمّع)</td>
                  <td className="px-3 py-2 tg-num">{Math.round(totals.pieces).toLocaleString('ar-EG')}</td>
                  <td className="px-3 py-2 tg-num">{formatCurrency(totals.amount)}</td>
                  <td className="px-3 py-2" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          {message && (
            <div className="px-4 py-2 text-[11px] font-bold text-[var(--tg-muted)] border-t border-[var(--tg-line)]">
              {message}
            </div>
          )}
        </>
      )}
    </section>
  );
};
