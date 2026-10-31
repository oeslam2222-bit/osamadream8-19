/**
 * تحقق من مسار استيراد الشيت: الأسعار المكتوبة بأشكال مختلفة، الشدة (ق/ك)،
 * وكلمة blank اللي مش المفروض توصل للكتالوج.
 *
 * التشغيل:  bun run scripts/validate-excel-pricing-import.ts
 */
import { DREAM_INVENTORY_EXCEL_COLUMNS, parseRawRowsToProducts } from '../src/services/excelService';
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
];

const fail: string[] = [];
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
  if (!ok) fail.push(name);
};

const { products, errors } = parseRawRowsToProducts(rows);
const byCode = (code: string) => products.find((p) => p.code === code)!;

check('rows imported', products.length, 5);
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
