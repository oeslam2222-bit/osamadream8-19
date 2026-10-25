import { COMPANY_INFO } from '../data/mockData';
import { Invoice } from '../types';

/**
 * Format Egyptian Pound currency as standard monetary amount.
 * Whole numbers display cleanly with thousand commas (e.g. 50,000 ج.م),
 * while numbers with fractions display 2 decimal places (e.g. 50,000.50 ج.م).
 */
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

/**
 * Format number with comma separators without currency suffix (e.g. 50,000 or 50,000.50).
 */
export function formatDecimalAmount(amount: number | undefined): string {
  if (amount === undefined || isNaN(amount)) return '0';
  const rounded = Math.round(amount * 100) / 100;
  const hasFraction = Math.abs(rounded % 1) > 0.001;
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Format Arabic date & time
 */
export function formatArabicDate(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr;
}

/**
 * Generate formatted WhatsApp message for fast sharing with customer or management
 */
export function generateWhatsAppMessage(invoice: Invoice): string {
  const itemsText = invoice.items
    .map((item, i) => {
      const cartonsStr = item.cartonCount > 0 ? `${item.cartonCount} كرتونة` : '';
      const piecesStr = item.pieceCount > 0 ? `${item.pieceCount} قطعة` : '';
      const qtyStr = [cartonsStr, piecesStr].filter(Boolean).join(' + ');
      return `🔹 *${i + 1}. ${item.productName}* (${item.productCode})\n   📦 الكمية: ${qtyStr} (إجمالي ${item.totalUnits} ق)\n   💰 السعر: ${formatCurrency(item.netTotal)}`;
    })
    .join('\n\n');

  return `🌟 *${COMPANY_INFO.nameArabic}* 🌟
📄 *فاتورة مبيعات معتمدة رقم:* \`${invoice.invoiceNumber}\`
📅 *التاريخ:* ${invoice.date} ${invoice.time}
🏢 *الفرع:* ${invoice.branchName}
👤 *المندوب:* ${invoice.repName}

✨ *شكراً لأنك أصبحت جزءاً من شركة دريم للتجارة والتوزيع ❤️*

━━━━━━━━━━━━━━━━━━━
🏬 *بيانات العميل:*
• الاسم: *${invoice.customerName}*
• الهاتف: ${invoice.customerPhone || '---'}
• العنوان: ${invoice.customerAddress || '---'}

━━━━━━━━━━━━━━━━━━━
🛒 *تفاصيل الأصناف والطلبية:*
${itemsText}

━━━━━━━━━━━━━━━━━━━
📊 *الملخص المالي للفاتورة:*
📦 إجمالي الكراتين: *${invoice.totalCartons}* كرتونة
💵 ${invoice.discountAmount > 0 ? `المجموع قبل الخصم: ${formatCurrency(invoice.subtotal)}` : `إجمالي الفاتورة: ${formatCurrency(invoice.subtotal)}`}
${invoice.discountAmount > 0 ? `🏷️ الخصم التجاري الممنوح (${invoice.discountPercentage}%): -${formatCurrency(invoice.discountAmount)}\n` : ''}━━━━━━━━━━━━━━━━━━━
✨ *إجمالي الفاتورة الصافي النهائي:* 
👉 *${formatCurrency(invoice.estimatedGrandTotal)}*
💳 طريقة الدفع: *${invoice.paymentMethod}*
📌 حالة الفاتورة: *${invoice.status}*

${invoice.notes ? `📝 *ملاحظات:* ${invoice.notes}\n` : ''}
📞 للشكاوى وخدمة العملاء: ${COMPANY_INFO.customerService}
🌐 موقع الشركة: ${COMPANY_INFO.website}
━━━━━━━━━━━━━━━━━━━
_تم إصدار الفاتورة عبر المنظومة السحابية لشركة دريم للتجارة والتوزيع_`;
}

/**
 * Share invoice directly via WhatsApp Web / App
 */
export function shareInvoiceViaWhatsApp(invoice: Invoice, targetPhone?: string): void {
  const text = generateWhatsAppMessage(invoice);
  const encodedText = encodeURIComponent(text);
  
  let cleanPhone = (targetPhone || invoice.customerPhone || '').replace(/[^\d+]/g, '');
  if (cleanPhone.startsWith('01')) {
    cleanPhone = '20' + cleanPhone.substring(1); // Format Egyptian mobile to international
  }

  const url = cleanPhone 
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`;

  window.open(url, '_blank');
}

/**
 * Use Web Share API if available, fallback to clipboard
 */
export async function shareInvoiceNative(invoice: Invoice): Promise<boolean> {
  const text = generateWhatsAppMessage(invoice);
  if (navigator.share) {
    try {
      await navigator.share({
        title: `فاتورة دريم رقم ${invoice.invoiceNumber} - ${invoice.customerName}`,
        text: text,
      });
      return true;
    } catch (e) {
      // user cancelled or share failed, fallback to copy
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    return false;
  }
}
