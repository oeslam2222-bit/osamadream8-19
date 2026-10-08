import type { Product } from '../types';

/**
 * مفتاح هوية الصنف — **الكود لوحده**.
 *
 * الكود هو مفتاح العمل الحقيقي، وده مش قرار ours: جدول products على السيرفر
 * عليه `CREATE UNIQUE INDEX products_code_unique_idx ON products (lower(trim(code)))`
 * (supabase/production-hardening.sql). يعني قاعدة البيانات نفسها بتقول إن
 * الصنف = الكود، وإن صنفين بنفس الكود مستحيل وجودهم مع بعض.
 *
 * كان المفتاح `code + color + size`، وده كان سبب التكرار اللي المستخدم شايفه:
 * الشيت بيجيب نفس الكود بأكثر من صف، والصفوف دي بتختلف في اللون/الحجم فعلياً
 * (صف فاضي، صف فيه مسافة زيادة، صف بالحجم بس)، فالمفتاح المركّب كان بيعاملها
 * كأنها أصناف مختلفة — والكتالوج كان بيكبر بعد كل رفع بدل ما يدمج.
 *
 * اللون والحجم **attributes** للصنف مش جزء من هويته: لو اتغيّروا للصنف اللي
 * موجود، التحديث يغيّر الصنف نفسه — مش يعمل واحد جديد.
 *
 * الدالة دي **مرجع واحد** لكل حاجة بتهتم بهوية الصنف:
 *   - `deduplicateProductArray` (شيل التكرار بعد الاستيراد)
 *   - `sanitizeProducts` (اللي بيستدعيه فوق)
 *   - `importProductsList` في AppContext (مطابقة الشيت بالكتالوج الحالي)
 *
 * لازم يبقوا كلهم على نفس الدالة: لو الدمج استخدم مفتاح والفلترة استخدمت
 * تاني، الدمج بيعرف إن الصنف موجود والفلترة بتعتبره جديد، فالصف بيفضل في
 * الكتالوج من غير ما حد ياخد باله.
 */
export const normalizeProductCodeKey = (raw?: string | number | null): string => {
  if (raw === undefined || raw === null) return '';
  let value = String(raw).trim();
  if (!value) return '';
  // الأرقام العربية (٠-٩) → أرقام لاتينية. الشيت بيجيب أكواد بالكتابة دي،
  // وسطر واحد ممكن يكون لاتيني في شيت تاني — من غير التحويل دول هيبقى صنفين
  // مختلفين لنفس الصنف في نفس الكتالوج.
  value = value.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  // فواصل الآلاف والمسافات (شامل الـnon-breaking) جوّه الرقم.
  value = value.replace(/[,_\s\u00a0]/g, '');
  // إكسل بيكتب الأرقام العشرية .0 في آخر الكود.
  value = value.replace(/\.0+$/, '');
  // البادئة أو اللاحقة # اللي شيتات التصدير بتضيفها (مثل 1005741 # أو #1005741).
  value = value.replace(/^#+/, '').replace(/#+$/, '');
  return value.toLowerCase();
};

export const productIdentityKey = (p: Product): string => {
  const code = normalizeProductCodeKey(p.code);
  if (code) return `code:${code}`;

  // مفيش كود: نرجع للمفتاح المركّب (الاسم/الكود الموحد/الباركود/اللون/الحجم)
  // عشان الصفوف اللي بتتكرر بنفس الوصف تدمج مع بعض، والصفوف المختلفة تفضل
  // متفرقة. وده أحسن من الرجوع للـid، لأن الـid بيتغيّر بتغيّر ترتيب الشيت.
  const name = (p.name || '').toString().trim().toLowerCase();
  const unified = normalizeProductCodeKey(p.unifiedCode);
  const barcode = (p.barcode || '').toString().trim().toLowerCase();
  const color = (p.color || '').toString().trim().toLowerCase();
  const size = (p.size || '').toString().trim().toLowerCase();
  if (name || unified) {
    return `composite:${name}|${unified}|${barcode}|${color}|${size}`;
  }

  // مفيش أي مفتاح عمل خالص: نرجع للـid عشان الصفوف المختلفة تفضل متفرقة
  // بدل ما تنطمي في صف واحد ونضيّع أصناف.
  const id = (p.id || '').toString().trim().toLowerCase();
  return `id:${id || barcode || String(p)}`;
};

/**
 * عدّ الصفوف المكرّرة في قائمة منتجات، بنفس تعريف الدمج.
 *
 * بيستخدمه الاستيراد عشان يقدر يقول للمستخدم «اتقرأ 5,800 صف ودمجناهم في
 * 4,508 صنف» — بدل ما الرقم الكبير يخلّيه يفتكر إن التطبيق ضاع منه حاجة.
 */
export function countDuplicateProductRows(products: Product[]): {
  duplicateRows: number;
  uniqueCount: number;
} {
  const seen = new Set<string>();
  let duplicateRows = 0;
  products.forEach((p) => {
    if (!p) return;
    const key = productIdentityKey(p);
    if (seen.has(key)) duplicateRows += 1;
    else seen.add(key);
  });
  return { duplicateRows, uniqueCount: seen.size };
}
