import { COMPANY_INFO } from '../data/mockData';
import { Invoice } from '../types';

export function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || isNaN(amount)) return '0 ج.م';
  const rounded = Math.round(amount * 100) / 100;
  const hasFraction = Math.abs(rounded % 1) > 0.001;
  const formatted = rounded.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ج.م`;
}

export function formatArabicDate(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr;
}

export function generateWhatsAppMessage(invoice: Invoice): string {
  const itemsText = invoice.items
    .map((item, i) => {
      const cartonsStr = item.cartonCount > 0 ? `${item.cartonCount} كرتونة` : '';
      const piecesStr = item.pieceCount > 0 ? `${item.pieceCount} قطعة` : '';
      const qtyStr = [cartonsStr, piecesStr].filter(Boolean).join(' + ');
      return `🔹 *${i + 1}. ${item.productName}* (${item.productCode})\n   📦 الكمية: ${qtyStr} (إجمالي ${item.totalUnits} ق)\n   💰 السعر: ${formatCurrency(item.netTotal)}`;
    })
    .join('\n\n');

  return `🌟 *${COMPANY_INFO.nameArabic}* 🌟\n📄 *فاتورة مبيعات معتمدة رقم:* \`${invoice.invoiceNumber}\`\n📅 *التاريخ:* ${invoice.date} ${invoice.time}\n🏢 *الفرع:* ${invoice.branchName}\n👤 *المندوب:* ${invoice.repName}\n\n✨ *شكراً لأنك أصبحت جزءاً من شركة ${COMPANY_INFO.nameArabic} للتجارة والتوزيع ❤️}*\n\n━━━━━━━━━━━━━━━━━━━\n🏬 *بيانات العميل:*\n• الاسم: *${invoice.customerName}*\n• الهاتف: ${invoice.customerPhone || '---'}\n• العنوان: ${invoice.customerAddress || '---'}\n\n━━━━━━━━━━━━━━━━━━━\n🛒 *تفاصيل الأصناف والطلبية:*\n${itemsText}\n\n━━━━━━━━━━━━━━━━━━━\n📊 *الملخص المالي للفاتورة:*\n📦 إجمالي الكراتين: *${invoice.totalCartons}* كرتونة\n💵 ${invoice.discountAmount > 0 ? `المجموع قبل الخصم: ${formatCurrency(invoice.subtotal)}` : `إجمالي الفاتورة: ${formatCurrency(invoice.subtotal)}`}\n${invoice.discountAmount > 0 ? `🏷️ الخصم التجاري الممنوح (${invoice.discountPercentage}%): -${formatCurrency(invoice.discountAmount)}\n` : ''}━━━━━━━━━━━━━━━━━━━\n✨ *إجمالي الفاتورة الصافي النهائي:* \r\n👉 *${formatCurrency(invoice.estimatedGrandTotal)}*\n💳 طريقة الدفع: *${invoice.paymentMethod}*\n📌 حالة الفاتورة: *${invoice.status}*\n`;
}

export interface RepLink {
  repCode: string;
  uniqueLink: string;
  createdAt: Date;
  usageCount: number;
  lastUsed?: Date;
}

export function generateRepLink(repCode: string): RepLink {
  const uniqueLink = `https://app.tantawygroup.com/rep/${repCode}`;
  return {
    repCode,
    uniqueLink,
    createdAt: new Date(),
    usageCount: 0,
  };
}

export function calculateOutstandingBalance(invoice: Invoice, payments: any[]): number {
  const total = invoice.estimatedGrandTotal;
  const paid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  return Math.max(0, total - paid);
}

export function getPaymentStatusText(outstanding: number, total: number): string {
  if (outstanding === 0) return '已结清';
  if (outstanding === total) return 'لا يوجد دفعة';
  return ` المتبقي: ${formatCurrency(outstanding)} من ${formatCurrency(total)}`;
}
