import { ChevronDown, Package } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { formatCurrency } from '../../services/invoiceService';
import { MONTH_NAMES_MAP } from '../../services/customerItemSalesService';
import { resolveItemGroup } from '../../services/itemSalesAnalytics';
import type { CustomerItemSaleRecord } from '../../types';

type SectorKey = 'home' | 'electrical';

interface ItemSalesRowsTableProps {
  records: CustomerItemSaleRecord[];
  resolveSector: (record: CustomerItemSaleRecord) => SectorKey;
}

const PAGE_SIZE = 40;

const SECTOR_BADGE: Record<SectorKey, { label: string; className: string }> = {
  home: {
    label: 'منزلي',
    className:
      'bg-[var(--app-primary-tint)] text-[var(--app-primary-text)] border-[var(--app-primary-border)]'
  },
  electrical: {
    label: 'كهربائي',
    className:
      'bg-[var(--app-violet-tint)] text-[var(--app-violet-text)] border-[var(--app-violet-border)]'
  }
};

/**
 * جدول تفصيلي لكل صفوف المبيعات بالصنف (كل الأصناف، وليس أعلى 10 فقط):
 * كود العميل · الشهر · الصنف · الصنف بالعائلة · القطاع · عدد القطع · المبلغ.
 * الألوان من متغيّرات الثيم، فيشتغل في الوضع النهاري والليلي.
 */
export const ItemSalesRowsTable: React.FC<ItemSalesRowsTableProps> = ({
  records,
  resolveSector
}) => {
  const [visible, setVisible] = useState(PAGE_SIZE);

  const rows = useMemo(() => {
    return records
      .map((record) => ({
        key:
          record.id ||
          `${record.customerAccount}-${record.unifiedCode || record.itemCode}-${record.month}-${record.amount}`,
        customerCode: record.customerAccount || '—',
        customerName: record.invoicingName || record.customerAccount || 'عميل غير محدد',
        // 0 = شهر غير معروف (يظهر «غير محدد» بدل يناير)
        month: Math.min(12, Math.max(0, Number(record.month) || 0)),
        // الكود الموحد فريد لكل لون؛ كود المنتج ممكن يتكرر.
        itemCode: record.unifiedCode || record.itemCode || '—',
        unifiedCode: record.unifiedCode || '',
        itemName: record.itemName || record.itemCode || 'صنف غير محدد',
        productCode: record.itemCode || '',
        family: resolveItemGroup(record) || record.familyDimension || record.itemGroup || 'عام',
        sector: resolveSector(record),
        quantity: Number(record.quantity) || 0,
        amount: Number(record.amount) || 0
      }))
      .sort((a, b) => a.month - b.month || b.amount - a.amount);
  }, [records, resolveSector]);

  const totals = useMemo(() => {
    const items = new Set<string>();
    const customers = new Set<string>();
    let quantity = 0;
    let amount = 0;
    rows.forEach((row) => {
      quantity += row.quantity;
      amount += row.amount;
      items.add(row.itemCode);
      customers.add(row.customerCode);
    });
    return { quantity, amount, items: items.size, customers: customers.size };
  }, [rows]);

  if (rows.length === 0) return null;

  const shown = rows.slice(0, visible);
  const remaining = rows.length - shown.length;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] inline-flex items-center justify-center">
            <Package className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-900">مبيعات الأصناف بالتفصيل</h3>
            <p className="text-[11px] font-bold text-slate-500">
              كود العميل · الشهر · الصنف · الصنف بالعائلة · القطاع · عدد القطع · المبلغ
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-black">
          <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
            {rows.length.toLocaleString('ar-EG')} صف
          </span>
          <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
            {totals.items.toLocaleString('ar-EG')} صنف
          </span>
          <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
            {totals.customers.toLocaleString('ar-EG')} عميل
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 text-[10px] sm:text-[11px] font-black text-slate-500">
              <th className="px-3 py-2">كود العميل</th>
              <th className="px-3 py-2">اسم العميل</th>
              <th className="px-3 py-2">الشهر</th>
              <th className="px-3 py-2">الصنف (الكود الموحد)</th>
              <th className="px-3 py-2">الصنف بالعائلة</th>
              <th className="px-3 py-2">القطاع</th>
              <th className="px-3 py-2">عدد القطع</th>
              <th className="px-3 py-2">المبلغ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((row) => {
              const badge = SECTOR_BADGE[row.sector];
              return (
                <tr key={row.key} className="text-[11px] sm:text-xs hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono font-bold text-slate-600">
                    {row.customerCode}
                  </td>
                  <td
                    className="px-3 py-2 font-bold text-slate-800 max-w-[180px] truncate"
                    title={row.customerName}
                  >
                    {row.customerName}
                  </td>
                  <td className="px-3 py-2 font-black text-slate-700">
                    {MONTH_NAMES_MAP[row.month] || 'غير محدد'}
                  </td>
                  <td
                    className="px-3 py-2 font-bold text-slate-800 max-w-[220px] truncate"
                    title={`${row.itemName} — موحد ${row.unifiedCode || row.itemCode}${
                      row.unifiedCode && row.productCode ? ` · منتج ${row.productCode}` : ''
                    }`}
                  >
                    {row.itemName}
                    <span className="block text-[9px] text-slate-400 font-mono">
                      {row.unifiedCode ? `موحد ${row.unifiedCode}` : row.itemCode}
                      {row.unifiedCode && row.productCode ? ` · منتج ${row.productCode}` : ''}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2 font-bold text-slate-600 max-w-[140px] truncate"
                    title={row.family}
                  >
                    {row.family}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-black ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono font-bold text-slate-700">
                    {Math.round(row.quantity).toLocaleString('ar-EG')}
                  </td>
                  <td className="px-3 py-2 font-mono font-black text-slate-900">
                    {formatCurrency(row.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 text-[11px] font-black text-slate-700">
              <td className="px-3 py-2" colSpan={6}>
                الإجمالي (كل الصفوف المطابقة للفلاتر)
              </td>
              <td className="px-3 py-2 font-mono">
                {Math.round(totals.quantity).toLocaleString('ar-EG')}
              </td>
              <td className="px-3 py-2 font-mono">{formatCurrency(totals.amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {remaining > 0 && (
        <div className="px-4 py-3 border-t border-slate-200 text-center">
          <button
            type="button"
            onClick={() => setVisible((value) => value + PAGE_SIZE)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-black text-slate-700 transition cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            عرض المزيد ({remaining.toLocaleString('ar-EG')} صف متبقي)
          </button>
        </div>
      )}
    </section>
  );
};
