/**
 * تحقق من مسار استيراد الشيت: الأسعار المكتوبة بأشكال مختلفة، الشدة (ق/ك)،
 * وكلمة blank اللي مش المفروض توصل للكتالوج.
 *
 * التشغيل:  bun run scripts/validate-excel-pricing-import.ts
 */
import { DREAM_INVENTORY_EXCEL_COLUMNS, parseRawRowsToProducts, productSheetPiecePrice } from '../src/services/excelService';
import { sanitizeProducts } from '../src/context/appContextHelpers';

const blankRow = new Array(DREAM_INVENTORY_EXCEL_COLUMNS.length).fill('');
const buildRow = (values: Record<number, string>) => {
  const row = [...blankRow];
  Object.entries(values).forEach(([idx, value]) => {
    row[Number(idx)] = value;
  });
  return row;
};

// [0]=الكود الموحد [1]=كود المنتج [2]=الاسم [3]=الحجم [4]=عدد القطع
// [5]=سعر الكرتونه [6]=Item group [7]=Family Name [8]=اللون
const rows: any[][] = [
  [...DREAM_INVENTORY_EXCEL_COLUMNS],
  buildRow({ 0: '#1001', 1: '1001', 2: 'صنف كرتونة', 3: '60 ق', 4: '4 ق/ك', 5: '3,080 ج.م / كرتونة', 6: 'بلاستيك', 7: 'أطباق', 8: 'أحمر' }),
  buildRow({ 0: '#1002', 1: '1002', 2: 'صنف قطعة', 3: '—', 4: '1', 5: '25 ج.م / كرتونة', 6: 'بلاستيك', 7: 'أطباق', 8: '((blank))' }),
  buildRow({ 0: '#1003', 1: '1003', 2: 'صنف فاكتور فاضي', 3: '', 4: '(blank)', 5: '12.5 ج.م / قطعة', 6: 'ستانلس', 7: 'مشروبات', 8: '(blank)' }),
  buildRow({ 0: '#1004', 1: '1004', 2: '(blank)', 3: '', 4: '3', 5: '90 ج.م / كرتونة', 6: 'بلاستيك', 7: 'تخزين', 8: '(blank)' }),
  // شدة مكتوبة صح لكن السعر في عمود الكرتونة مكتوب "/ قطعة" — الوحدة هي اللي تحكم
  buildRow({ 0: '#1005', 1: '1005', 2: 'صنف وحدة القطعة', 3: '', 4: '6', 5: '٥٠ ج.م / قطعة', 6: 'ورقيات', 7: 'كراسات', 8: '' }),
  // رقم مجرد من غير أي وحدة ⇒ سعر قطعة (الأساس) والكرتونة بتتحسب × الشدة
  buildRow({ 0: '#1006', 1: '1006', 2: 'صنف رقم مجرد', 3: '', 4: '4', 5: '770', 6: 'بلاستيك', 7: 'أطباق', 8: '' }),
  // نفس الرقم المجرد لكن تحت عنوان قديم "سعر الكرتونه" — برضه سعر قطعة
  buildRow({ 0: '#1007', 1: '1007', 2: 'صنف عنوان قديم', 3: '', 4: '4', 5: '770', 6: 'بلاستيك', 7: 'أطباق', 8: '' }),
];

const fail: string[] = [];
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
  if (!ok) fail.push(name);
};

const { products, errors } = parseRawRowsToProducts(rows);
const byCode = (code: string) => products.find((p) => p.code === code)!;

check('rows imported', products.length, 7);
check('no unexpected import errors', errors.filter((e) => e.includes('فشل')), []);

const cartonProduct = byCode('1001');
check('carton: factor', cartonProduct.cartonQuantity, 4);
check('carton: piece price from /كرتونة cell', cartonProduct.piecePrice, 770);
check('carton: carton price', cartonProduct.cartonPrice, 3080);

const singleProduct = byCode('1002');
check('single piece: factor', singleProduct.cartonQuantity, 1);
check('single piece: piece price', singleProduct.piecePrice, 25);
check('single piece: carton price equals piece', singleProduct.cartonPrice, 25);
check('single piece: blank color dropped', singleProduct.color, '');

const blankFactor = byCode('1003');
check('blank factor → 1', blankFactor.cartonQuantity, 1);
check('blank factor: piece price', blankFactor.piecePrice, 12.5);
check('blank factor: carton price', blankFactor.cartonPrice, 12.5);

const blankName = byCode('1004');
check('blank name replaced', /blank/i.test(blankName.name), false);
check('blank name fallback text', blankName.name.length > 0, true);
check('blank name: carton price', blankName.cartonPrice, 90);
check('blank name: piece price', blankName.piecePrice, 30);

const pieceUnitProduct = byCode('1005');
check('unit says /قطعة → piece price', pieceUnitProduct.piecePrice, 50);
check('unit says /قطعة → carton = piece × factor', pieceUnitProduct.cartonPrice, 300);

// الأساس سعر القطعة: رقم مجرد في عمود السعر = سعر قطعة، والكرتونة = × الشدة.
const plainPrice = byCode('1006');
check('plain number is the piece price', [plainPrice.piecePrice, plainPrice.cartonPrice], [770, 3080]);

// حتى لو عنوان العمود قديم "سعر الكرتونه" — القطعة هي الأساس.
const legacyHeaderRows = [rows[0].map((h, i) => (i === 5 ? 'سعر الكرتونه' : h)), rows[rows.length - 1]];
const legacyParsed = parseRawRowsToProducts(legacyHeaderRows).products[0];
check('legacy header still piece base', [legacyParsed.piecePrice, legacyParsed.cartonPrice], [770, 3080]);

// قالب التصدير نفسه بيعلن إن العمود سعر قطعة.
check('template header', DREAM_INVENTORY_EXCEL_COLUMNS[5], 'سعر القطعة');

// Round-trip: الرقم اللي التصدير بيكتبه (سعر القطعة) بيرجع يتقرأ بنفس القيم.
const exportedRow = [...blankRow];
exportedRow[0] = '#1008';
exportedRow[1] = '1008';
exportedRow[2] = 'صنف تصدير';
exportedRow[4] = 4;
exportedRow[5] = productSheetPiecePrice(cartonProduct);
const roundTrip = parseRawRowsToProducts([[...DREAM_INVENTORY_EXCEL_COLUMNS], exportedRow]).products[0];
check('export writes piece price', exportedRow[5], 770);
check('round-trip piece price', roundTrip.piecePrice, 770);
check('round-trip carton price', roundTrip.cartonPrice, 3080);

// نفس القاعدة على الداتا المحفوظة (sanitizeProducts) — بتتنضّف عند التحميل
// فالصناف القديمة اللي فيها blank بتتصلّح من غير إعادة رفع للشيت.
const stored = sanitizeProducts([
  {
    ...cartonProduct,
    id: 'stored-1',
    name: 'صنف قديم (blank)',
    color: '((blank))',
    size: '(blank)',
    piecePrice: 770,
    cartonPrice: 0,
    cartonQuantity: 4,
    factor: 4,
  },
  {
    ...singleProduct,
    id: 'stored-2',
    name: '(blank)',
    color: 'أحمر',
    piecePrice: 20,
    cartonPrice: 20,
    cartonQuantity: 1,
    factor: 1,
  },
]);

check('stored: price recalculated', [stored[0].piecePrice, stored[0].cartonPrice], [770, 3080]);
check('stored: blank trimmed from name', stored[0].name, 'صنف قديم');
check('stored: blank color/size empty', [stored[0].color, stored[0].size], ['', '']);
check('stored: single piece stays piece', [stored[1].piecePrice, stored[1].cartonPrice, stored[1].cartonQuantity], [20, 20, 1]);
check('stored: blank-only name replaced', /blank/i.test(stored[1].name), false);

if (fail.length > 0) {
  console.error(`\n${fail.length} check(s) failed: ${fail.join(', ')}`);
  process.exit(1);
}
console.log('\nAll Excel pricing import checks passed.');
