/**
 * تحويل أي قيمة رقمية قادمة من Excel/Supabase إلى رقم فعلي.
 *
 * الملفات الحقيقية بتيجي بأرقام عربية (٠١٢٣)، أو فواصل آلاف (1,234.50)،
 * أو عملة ("1,234 ج.م"). `Number()` المباشر بيرجّع NaN → 0، وده اللي خلّى
 * كل الكميات والمبالغ في Supabase أصفار رغم إن الصفوف نفسها صحيحة.
 */
export function parseNumericValue(raw: any): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;

  let text = String(raw).trim();
  if (!text) return 0;

  // أرقام عربية/فارسية → لاتينية + توحيد الفاصلة العشرية العربية
  text = text
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, ',')
    .replace(/[^\d.,-]/g, '');

  if (!text) return 0;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  if (lastComma > lastDot) {
    const decimals = text.length - lastComma - 1;
    // "1,234" فواصل آلاف، لكن "1,5" أو "1,2345" علامة عشرية
    if (decimals === 3 && text.indexOf(',') === lastComma) {
      text = text.replace(/,/g, '');
    } else {
      text = text.replace(/\./g, '').replace(',', '.');
    }
  } else {
    text = text.replace(/,/g, '');
  }

  const parsed = parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
}
