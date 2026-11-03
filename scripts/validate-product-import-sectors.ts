/**
 * فحص استيراد الأصناف من الشيت:
 *  1) دمج تبويبات الملف (منزلي/كهرباء) بدل قراءة أول تبويب بس.
 *  2) قراءة عمود «القطاع» صح لكل صف.
 *  3) إن الدمج بقى على الكود فقط — الصفوف اللي بتشترك في «كود موحد»
 *     بألوان/مقاسات مختلفة لازم تفضل أصناف مستقلة (مش تدمج وتضيّع).
 *
 * التشغيل: bun scripts/validate-product-import-sectors.ts
 */
import { combineProductSheets, parseRawRowsToProducts } from '../src/services/excelService';
import { deduplicateProductArray, countDuplicateProductRows, upsertProductsByIdentity } from '../src/services/productIdentity';

const fail: string[] = [];
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
  if (!ok) fail.push(name);
};

const HEADER = ['كود المنتج', 'اسم المنتج', 'القطاع'];

// تبويب «منزلي» وتبويب «كهرباء» في نفس الملف
const homeTab = [
  ['تقرير المخزون - قطاع الأدوات المنزلية'], // سطر عنوان فوق الجدول
  HEADER,
  ['H-001', 'طقم صيني', 'منزلي'],
  ['H-002', 'كوب زجاج', 'منزلي'],
];
const electricalTab = [
  HEADER,
  ['E-001', 'لمبة ليد 9 وات', 'كهرباء'],
  ['E-002', 'مفتاح كهرباء', 'كهرباء'],
  ['E-003', 'كابل 2 مم', 'كهرباء'],
];
const notAProductsTab = [
  ['اسم المندوب', 'الشهر', 'التارجت'],
  ['أحمد', 'يناير', 100000],
];

const combined = combineProductSheets([homeTab, electricalTab, notAProductsTab]);
check('عدد صفوف الدمج (1 عنوان + 5 أصناف)', combined.length, 6);
check('العنوان واحد بس', combined[0], HEADER);

const parsed = parseRawRowsToProducts(combined);
check('عدد الأصناف المقروءة', parsed.products.length, 5);
check(
  'أكواد الأصناف',
  parsed.products.map((p) => p.code),
  ['H-001', 'H-002', 'E-001', 'E-002', 'E-003']
);
check(
  'قطاع كل صنف',
  parsed.products.map((p) => p.sector),
  ['home', 'home', 'electrical', 'electrical', 'electrical']
);

// صنفين بنفس «الكود الموحد» و«اللون/المقاس» مختلف (كود مختلف) => صنفين مستقلين
const sharedUnified = parseRawRowsToProducts([
  ['كود المنتج', 'الكود الموحد', 'اسم المنتج', 'اللون', 'القطاع'],
  ['A-1', '900', 'طقم صيني', 'أبيض', 'منزلي'],
  ['A-2', '900', 'طقم صيني', 'أحمر', 'منزلي'],
]).products;
check('صفين بكود موحد واحد = صنفين', sharedUnified.length, 2);
check('الدمج على الكود مش الكود الموحد', deduplicateProductArray(sharedUnified).length, 2);
check(
  'الدمج بيحصل للكود المكرر بس',
  deduplicateProductArray(sharedUnified).length,
  countDuplicateProductRows(sharedUnified).uniqueCount
);

const existingCatalog = sharedUnified.map((product, index) => ({
  ...product,
  id: `stable-product-${index}`,
  branchStockActual: 2,
  piecePrice: 10,
}));
const refreshedSheet = existingCatalog.map((product) => ({
  ...product,
  id: `reimported-product-${product.code}`,
  branchStockActual: 8,
  piecePrice: 25,
}));
const legacyDuplicate = { ...existingCatalog[0], id: 'legacy-duplicate', branchStockActual: 3 };
const firstMerge = upsertProductsByIdentity([...existingCatalog, legacyDuplicate], refreshedSheet);
const repeatedMerge = upsertProductsByIdentity(firstMerge, refreshedSheet);
check('إعادة رفع الشيت لا تكرر الأصناف', repeatedMerge.length, existingCatalog.length);
check('المتغيرات المختلفة تظل محفوظة', repeatedMerge.map((product) => product.code), ['A-1', 'A-2']);
check('الرصيد والسعر يتحدثان عند إعادة الرفع', repeatedMerge.map((product) => [product.branchStockActual, product.piecePrice]), [[8, 25], [8, 25]]);
check('معرفات الأصناف تظل ثابتة', repeatedMerge.map((product) => product.id), ['stable-product-0', 'stable-product-1']);

const duplicated = parseRawRowsToProducts([
  ['كود المنتج', 'اسم المنتج', 'القطاع'],
  ['D-1', 'طقم صيني', 'منزلي'],
  ['D-1', 'طقم صيني', 'منزلي'],
]).products;
check('صف مكرر بنفس الكود بيتحسب تكرار', countDuplicateProductRows(duplicated).duplicateRows, 1);
check('صف مكرر بنفس الكود بيتدمج لصنف واحد', deduplicateProductArray(duplicated).length, 1);

console.log(fail.length === 0 ? '\nكل الفحوصات نجحت ✅' : `\nفشل ${fail.length}: ${fail.join(' | ')}`);
if (fail.length > 0) process.exit(1);
