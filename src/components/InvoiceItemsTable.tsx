import React from 'react';
import { Package } from 'lucide-react';
import '../styles/invoice-items.css';
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
    <div className={`ord-items ${bare ? 'p-3 sm:p-4 space-y-3' : 'tg-card p-3 sm:p-4 space-y-3'}`} dir="rtl">
      <div className="ord-items__head">
        <h4 className="ord-items__title">
          <span className="ord-items__ico" aria-hidden="true"><Package className="w-4 h-4" /></span>
          <span>الأصناف والمنتجات</span>
        </h4>
        <div className="ord-items__stats">
          <span className="ord-stat"><em>الأصناف</em><b>{items.length}</b></span>
          <span className="ord-stat"><em>القيمة</em><b>{formatCurrency(itemsTotal)}</b></span>
          {itemsDiscount > 0 && <span className="ord-stat ord-stat--disc"><em>الخصم</em><b>{formatCurrency(itemsDiscount)}</b></span>}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="p-4 text-center text-xs font-bold text-[var(--tg-muted)] border border-dashed border-[var(--tg-line)] rounded-xl">
          لا توجد أصناف مسجلة في هذه الفاتورة
        </div>
      ) : (
        <div className="ord-items__wrap">
          <table className="tg-table ord-items__table w-full text-right text-xs" dir="rtl">
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
        <div className="ord-items__sum">
          <span className="ord-sum">
            <em>إجمالي الفاتورة</em> <b className="tabular-nums">{formatCurrency(grandTotal)}</b>
          </span>
          <span className="ord-sum">
            <em>مجموع الأصناف</em> <b className="tabular-nums">{formatCurrency(itemsTotal)}</b>
          </span>
        </div>
      )}
    </div>
  );
};

export default InvoiceItemsTable;
