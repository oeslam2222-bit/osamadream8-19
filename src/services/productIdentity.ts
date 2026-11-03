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

/**
 * مفتاح الكود الفرعي كما يأتي من الشيت، مع الحفاظ على علامة المتغير (#).
 *
 * مهم: `1000` و`1000#` ليسا نفس الصنف. الأول كود أساسي، والثاني متغير
 * تابع له. إزالة # هنا كانت تدمج المتغيرات الخمسة في صف واحد قبل أن تصل
 * لمرحلة التجميع، فتضيع الألوان والمقاسات والرصيد الخاص بكل متغير.
 */
export const normalizeVariantCodeKey = (raw?: string | number | null): string => {
  if (raw === undefined || raw === null) return '';
  let value = String(raw).trim();
  if (!value) return '';
  value = value.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  value = value.replace(/[,_\s\u00a0]/g, '');
  value = value.replace(/\.0+$/, '');
  return value.toLowerCase();
};

const normalizeTextKey = (value?: string | number | null): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u0640\u064B-\u0652]/g, '')
    .replace(/\s+/g, ' ');


export const productIdentityKey = (p: Product): string => {
  // هوية الصنف = الكود الأساسي + الكود الموحد.
  // الكود الأساسي قد يتكرر 10 مرات بنفس الاسم ولكن بكود موحد / لون / حجم / مخزون مختلف.
  // كل صف في الشيت يبقى صنف مستقل في الكتالوج — لا دمج، لا حذف.
  const code = normalizeVariantCodeKey(p.code);
  const unified = normalizeVariantCodeKey(p.unifiedCode);
  if (code && unified) return `c:${code}|u:${unified}`;
  if (code && !unified) return `c:${code}|u:none`;
  if (!code && unified) return `c:none|u:${unified}`;

  // مفيش كود أساس ولا كود موحد: نرجع للون + الحجم + الاسم كهوية.
  const color = normalizeTextKey(p.color);
  const size = normalizeTextKey(p.size);
  const name = normalizeTextKey(p.name);
  const barcode = normalizeTextKey(p.barcode);
  return `c:none|u:none|${name}|${color}|${size}|${barcode}`;
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

export const deduplicateProductArray = (list: Product[]): Product[] => {
  const map = new Map<string, number>();
  const distinct: Product[] = [];
  list.forEach((p) => {
    if (!p) return;
    const key = productIdentityKey(p);
    const existingIdx = map.get(key);
    if (existingIdx === undefined) {
      map.set(key, distinct.length);
      distinct.push(p);
    } else {
      const existing = distinct[existingIdx];
      distinct[existingIdx] = {
        ...existing,
        ...p,
        id: existing.id || p.id,
        branchStockReserved: existing.branchStockReserved,
        mainWarehouseReserved: existing.mainWarehouseReserved,
        branchStocks: existing.branchStocks,
        branchStockActual: existing.branchStockActual,
        mainWarehouseActual: existing.mainWarehouseActual,
      };
    }
  });
  return distinct;
};

export const upsertProductsByIdentity = (existing: Product[], incoming: Product[]): Product[] => {
  const products: Product[] = [];
  const indexById = new Map<string, number>();
  const indexByIdentity = new Map<string, number>();

  [...existing, ...incoming].forEach((product) => {
    const identity = productIdentityKey(product);
    const index = indexById.get(product.id) ?? indexByIdentity.get(identity);

    if (index === undefined) {
      const newIndex = products.push(product) - 1;
      indexById.set(product.id, newIndex);
      indexByIdentity.set(identity, newIndex);
      return;
    }

    const previous = products[index];
    const previousIdentity = productIdentityKey(previous);
    if (indexByIdentity.get(previousIdentity) === index) indexByIdentity.delete(previousIdentity);
    products[index] = { ...previous, ...product, id: previous.id || product.id };
    indexById.set(product.id, index);
    indexById.set(products[index].id, index);
    indexByIdentity.set(productIdentityKey(products[index]), index);
  });

  return products;
};

/**
 * دeduplicate منتجات بناءً على الكود الموحد (unifiedCode) أولاً.
 * لو نفس الكود الموحد بألوان/أحجام مختلفة → تدمج كمنتج واحد مع تعدد الألوان.
 * لو مفيش كود موحد → ترجع للكود العادي (code).
 */
export const deduplicateProductsByUnifiedCode = (list: Product[]): Product[] => {
  if (!Array.isArray(list)) return [];

  const byUnifiedCode = new Map<string, Product[]>();
  const noUnifiedCode: Product[] = [];

  list.forEach((p) => {
    if (!p) return;
    const uCode = normalizeProductCodeKey(p.unifiedCode);
    if (uCode) {
      const arr = byUnifiedCode.get(uCode) || [];
      arr.push(p);
      byUnifiedCode.set(uCode, arr);
    } else {
      noUnifiedCode.push(p);
    }
  });

  const result: Product[] = [];

  // كل مجموعة ذات كود موحد واحد → منتج واحد مع تعدد الألوان/المقاسات
  byUnifiedCode.forEach((products, uCode) => {
    const first = products[0];
    const merged: Product = {
      ...first,
      unifiedCode: uCode,
      // نجمع الألوان والمقاسات المختلفة في notas أو نتركها كما هي
      // هنا نأخذ أول صنف كنموذج ونحدث معلوماته من باقي الصفوف
    };

    // دمج الألوان والمقاسات المختلفة في notas إذا كانت مختلفة
    const colors = new Set(products.map((p) => p.color).filter(Boolean));
    const sizes = new Set(products.map((p) => p.size).filter(Boolean));
    if (colors.size > 1 || sizes.size > 1) {
      merged.color = [...colors].join('، ');
      merged.size = [...sizes].join('، ');
    }

    result.push(merged);
  });

  // المنتجات اللي مفيش لها كود موحد → نطبق عليها الدالة العادية
  if (noUnifiedCode.length > 0) {
    result.push(...deduplicateProductArray(noUnifiedCode));
  }

  return result;
};
