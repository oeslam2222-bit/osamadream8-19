import React from 'react';
import { Package } from 'lucide-react';
import { Invoice, InvoiceItem } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { cleanProductCode } from '../services/excelService';

interface InvoiceItemsTableProps {
  invoice: Invoice | null;
  /** عند true الشاشة بتستخدم الكرت نفسه (مثلاً داخل كرت موبايل أو داخل بطاقة) */
  bare?: boolean;
}

const itemTotalValue = (item: InvoiceItem): number =>
  Number(item.netTotal || item.totalPrice || item.totalBeforeTax || 0) || 0;

const itemQuantityLabel = (item: InvoiceItem): string => {
  const cartons = Number(item.cartonCount || 0);
  const pieces = Number(item.pieceCount || 0);
  const label = [
    cartons > 0 ? `${cartons} كرتونة` : null,
    pieces > 0 ? `${pieces} قطعة` : null,
  ].filter(Boolean).join(' + ');
  return label || item.quantityDescription || '—';
};

/**
 * جدول الأصناف (المنتجات) بتاع الفاتورة/الأمر — الأعمدة:
 * الكود · الكود الموحد · اسم الصنف · الكمية/القطع · الكرتونة ·
 * السعر/القطعة · السعر/الكرتونة · إجمالي الفاتورة · الخصم
 *
 * الوضع بين فل كرت وغامق مالوش مشكلة — كل الأسطح والنصوص من توكنز الثيم.
 */
export const InvoiceItemsTable: React.FC<InvoiceItemsTableProps> = ({ invoice, bare = false }) => {
  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  const grandTotal = Number(invoice?.estimatedGrandTotal || invoice?.totalAmount || 0) || 0;
  const itemsTotal = items.reduce((sum, item) => sum + itemTotalValue(item), 0);
  const itemsDiscount = items.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0);

  return (
    <div className={bare ? 'p-3 sm:p-4 space-y-2' : 'tg-card p-3 sm:p-4 space-y-2'} dir="rtl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-xs sm:text-sm font-black text-[var(--tg-ink)] flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-[var(--tg-muted)]" />
          <span>الأصناف والمنتجات</span>
        </h4>
        <span className="text-[10.5px] font-bold text-[var(--tg-muted)]">
          {items.length} صنف • القيمة {formatCurrency(itemsTotal)}
          {itemsDiscount > 0 ? ` • الخصم ${formatCurrency(itemsDiscount)}` : ''}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="p-4 text-center text-xs font-bold text-[var(--tg-muted)] border border-dashed border-[var(--tg-line)] rounded-xl">
          لا توجد أصناف مسجلة في هذه الفاتورة
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--tg-line)] tg-card">
          <table className="tg-table w-full text-right text-xs" dir="rtl">
            <thead>
              <tr>
                <th className="p-2.5 text-center whitespace-nowrap">الكود</th>
                <th className="p-2.5 text-center whitespace-nowrap">الكود الموحد</th>
                <th className="p-2.5 text-right whitespace-nowrap">اسم الصنف</th>
                <th className="p-2.5 text-center whitespace-nowrap">الكمية/القطع</th>
                <th className="p-2.5 text-center whitespace-nowrap">الكرتونة</th>
                <th className="p-2.5 text-center whitespace-nowrap">السعر/القطعة</th>
                <th className="p-2.5 text-center whitespace-nowrap">السعر/الكرتونة</th>
                <th className="p-2.5 text-center whitespace-nowrap">إجمالي الفاتورة</th>
                <th className="p-2.5 text-center whitespace-nowrap">الخصم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[var(--tg-line)]">
              {items.map((item, idx) => {
                const cartons = Number(item.cartonCount || 0);
                const pieces = Number(item.pieceCount || 0);
                const pricePerCarton =
                  Number(item.pricePerCarton ?? item.appliedPrice ?? item.unitPrice ?? 0) || 0;
                return (
                  <tr key={`${item.productCode || ''}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition">
                    <td className="p-2.5 text-center font-mono font-bold text-[var(--tg-ink)]">
                      {cleanProductCode(item.productCode || '')}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-[var(--tg-ink)]">
                      {item.unifiedCode || item.product?.unifiedCode || '—'}
                    </td>
                    <td className="p-2.5 font-black text-[var(--tg-ink)]">{item.productName || 'صنف غير مسمى'}</td>
                    <td className="p-2.5 text-center font-bold text-[var(--tg-ink)] tabular-nums whitespace-nowrap">
                      {itemQuantityLabel(item)}
                    </td>
                    <td className="p-2.5 text-center font-bold text-[var(--tg-ink)] tabular-nums">
                      {cartons > 0 ? cartons : '—'}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-[var(--tg-ink)] tabular-nums">
                      {item.pricePerPiece ? formatCurrency(item.pricePerPiece) : '—'}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-[var(--tg-ink)] tabular-nums">
                      {pricePerCarton ? formatCurrency(pricePerCarton) : '—'}
                    </td>
                    <td className="p-2.5 text-center font-black text-[var(--tg-ink)] tabular-nums">
                      {formatCurrency(itemTotalValue(item))}
                    </td>
                    <td className="p-2.5 text-center font-bold text-rose-600 tabular-nums">
                      {item.discountAmount ? formatCurrency(item.discountAmount) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ملخص سريع للفاتورة من الأصناف نفسها */}
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] font-bold text-[var(--tg-muted)]">
          <span>
            إجمالي الفاتورة: <b className="text-[var(--tg-ink)] tabular-nums">{formatCurrency(grandTotal)}</b>
          </span>
          <span>
            مجموع الأصناف: <b className="text-[var(--tg-ink)] tabular-nums">{formatCurrency(itemsTotal)}</b>
          </span>
        </div>
      )}
    </div>
  );
};

export default InvoiceItemsTable;
