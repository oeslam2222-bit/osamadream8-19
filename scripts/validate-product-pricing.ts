/**
 * تحقق من قاعدة التسعير الواحدة: سعر القطعة × الشدة = سعر الكرتونة،
 * وإن الشدة = 1 معناها الصنف بيتباع بالقطعة.
 *
 * التشغيل:  bun run scripts/validate-product-pricing.ts
 */
import {
  detectSaleUnit,
  parseCartonFactor,
  resolveDisplayPrice,
  resolveProductPricing,
  stripPlaceholderText,
} from '../src/services/productPricing';

const fail: string[] = [];
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
  if (!ok) fail.push(name);
};

// 1. كلمة blank مش بيانات — بتتشال من النص نفسه.
check('blank ((blank))', stripPlaceholderText('((blank))'), '');
check('blank (blank)', stripPlaceholderText('(blank)'), '');
check('blank bare', stripPlaceholderText('blank'), '');
check('blank inside text', stripPlaceholderText('أحمر (blank)'), 'أحمر');
check('blank between words', stripPlaceholderText('أحمر - (blank) - كبير'), 'أحمر - كبير');
check('blank null input', stripPlaceholderText(null), '');
check('blank normal text untouched', stripPlaceholderText('كراسة ٦٥ ورقة'), 'كراسة ٦٥ ورقة');
check('blank keeps real name', stripPlaceholderText('طبق تسالي فاخر'), 'طبق تسالي فاخر');

// 2. الوحدة المكتوبة جوّه الخلية.
check('unit /كرتونة', detectSaleUnit('3,080 ج.م / كرتونة'), 'carton');
check('unit /قطعة', detectSaleUnit('770 ج.م / قطعة'), 'piece');
check('unit none', detectSaleUnit('3,080 ج.م'), null);
check('unit factor text', detectSaleUnit('4 ق/ك'), null);

// 3. الشدة.
check('factor 4 ق/ك', parseCartonFactor('4 ق/ك'), 4);
check('factor arabic digit', parseCartonFactor('٤'), 4);
check('factor long text', parseCartonFactor('4 قطع بالكرتونة'), 4);
check('factor blank', parseCartonFactor('(blank)'), 1);
check('factor empty', parseCartonFactor(''), 1);
check('factor zero', parseCartonFactor(0), 1);
check('factor one piece', parseCartonFactor('1 قطعة'), 1);

// 4. الأسعار.
const sheetPiece = resolveProductPricing({ piecePrice: 770, cartonPrice: 0, factor: 4 });
check('sheet piece → carton', [sheetPiece.piecePrice, sheetPiece.cartonPrice, sheetPiece.unit], [770, 3080, 'carton']);

const cartonCell = resolveProductPricing({
  piecePrice: '3,080 ج.م / كرتونة',
  factor: 4,
  pieceUnitHint: detectSaleUnit('3,080 ج.م / كرتونة'),
});
check('cell says /كرتونة wins', [cartonCell.piecePrice, cartonCell.cartonPrice], [770, 3080]);

const cartonCol = resolveProductPricing({
  cartonPrice: '3,080 ج.م / كرتونة',
  factor: '4 ق/ك',
  cartonUnitHint: detectSaleUnit('3,080 ج.م / كرتونة'),
});
check('carton column', [cartonCol.piecePrice, cartonCol.cartonPrice], [770, 3080]);

const pieceInCartonColumn = resolveProductPricing({
  cartonPrice: '770 ج.م / قطعة',
  factor: 4,
  cartonUnitHint: detectSaleUnit('770 ج.م / قطعة'),
});
check('piece in carton column', [pieceInCartonColumn.piecePrice, pieceInCartonColumn.cartonPrice], [770, 3080]);

const single = resolveProductPricing({ piecePrice: 25, factor: 1 });
check('factor 1 → piece only', [single.piecePrice, single.cartonPrice, single.unit, single.isSinglePiece], [25, 25, 'piece', true]);

const singleFromCarton = resolveProductPricing({ cartonPrice: '40 ج.م / كرتونة', factor: '1' });
check('factor 1 from price cell', [singleFromCarton.piecePrice, singleFromCarton.cartonPrice], [40, 40]);

const noFactor = resolveProductPricing({ piecePrice: 12.5, factor: '(blank)' });
check('blank factor = 1', [noFactor.factor, noFactor.piecePrice, noFactor.cartonPrice], [1, 12.5, 12.5]);

const empty = resolveProductPricing({});
check('no prices', [empty.piecePrice, empty.cartonPrice], [0, 0]);

const rounding = resolveProductPricing({ piecePrice: 33.333, factor: 3 });
check('rounding', [rounding.piecePrice, rounding.cartonPrice], [33.33, 100]);

const arabic = resolveProductPricing({ cartonPrice: '١٢ ج.م / كرتونة', factor: '٦' });
check('arabic digits', [arabic.piecePrice, arabic.cartonPrice], [2, 12]);

// 5. السعر المعروض في الواجهة.
const displaySingle = resolveDisplayPrice({ piecePrice: 25, factor: 1 });
check('display piece', [displaySingle.displayPrice, displaySingle.unitLabel], [25, 'قطعة']);
const displayCarton = resolveDisplayPrice({ piecePrice: 770, factor: 4 });
check('display carton', [displayCarton.displayPrice, displayCarton.unitLabel], [3080, 'كرتونة']);
const displayMissing = resolveDisplayPrice({ factor: 6 });
check('display missing', [displayMissing.displayPrice, displayMissing.unitLabel], [0, 'كرتونة']);

if (fail.length > 0) {
  console.error(`\n${fail.length} check(s) failed: ${fail.join(', ')}`);
  process.exit(1);
}
console.log('\nAll product pricing checks passed.');
