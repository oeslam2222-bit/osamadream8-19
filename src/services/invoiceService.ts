import { COMPANY_INFO } from '../data/mockData';
import { Invoice } from '../types';

/**
 * Format Egyptian Pound currency with clean, standard legible digits (e.g. 31,958.00 ج.م)
 */
export function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || isNaN(amount)) return '0.00 ج.م';
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
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
📄 *فاتورة مبيعات إلكترونية رقم:* \`${invoice.invoiceNumber}\`
📅 *التاريخ:* ${invoice.date} ${invoice.time}
🏢 *الفرع:* ${invoice.branchName}
👤 *المندوب:* ${invoice.repName}

━━━━━━━━━━━━━━━━━━━
🏬 *بيانات العميل:*
• الاسم: *${invoice.customerName}*
• الهاتف: ${invoice.customerPhone || '---'}
• العنوان: ${invoice.customerAddress || '---'}
• الرقم الضريبي: ${invoice.customerTaxNumber || 'غير مسجل'}

━━━━━━━━━━━━━━━━━━━
🛒 *تفاصيل الأصناف والطلبية:*
${itemsText}

━━━━━━━━━━━━━━━━━━━
📊 *الملخص المالي والتقديري:*
📦 إجمالي الكراتين: *${invoice.totalCartons}* كرتونة
🏷️ إجمالي القطع المنفردة: *${invoice.totalPieces}* قطعة
💵 المجموع الفرعي: ${formatCurrency(invoice.subtotal)}
🏷️ الخصم الممنوح (${invoice.discountPercentage}%): -${formatCurrency(invoice.discountAmount)}
🏛️ ضريبة القيمة المضافة (${invoice.taxPercentage}%): +${formatCurrency(invoice.taxAmount)}
━━━━━━━━━━━━━━━━━━━
✨ *إجمالي الفاتورة التقديرية النهائي:* 
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
