import { parseNumericValue } from './numericParsing';

/**
 * قاعدة التسعير الواحدة للتطبيق كله: سعر القطعة × شدة الكرتونة = سعر الكرتونة.
 *
 * الشيت بيوصل بأشكال مختلفة:
 *   - "3,080 ج.م / كرتونة"  → السعر ده للكرتونة، يبقى سعر القطعة = 3,080 ÷ الشدة
 *   - "770 ج.م / قطعة"       → السعر ده للقطعة، يبقى سعر الكرتونة = 770 × الشدة
 *   - "3,080 ج.م"            → مفيش وحدة مكتوبة، نرجع لمعنى عمود الشيت
 *   - "4 ق/ك" / "٤" / "4 قطع بالكرتونة" → الشدة = 4
 *   - "((blank))"            → خلية فاضية، مش قيمة
 *
 * كل حاجة بتقرأ أسعار الأصناف (الاستيراد، sanitizeProducts، الكتالوج) لازم
 * تعدّي من هنا، وإلا كل مكان هيحسب بقاعدة مختلفة والكتالوج هيقول رقم والفاتورة رقم تاني.
 */

/** وحدة البيع اللي السعر بيتحسب بيها. */
export type SaleUnit = 'piece' | 'carton';

const NON_NEGATIVE = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/** تقريب مبلغ لقرشين — نفس دقة formatCurrency. */
export const roundMoney = (value: number): number => {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.round(safe * 100) / 100;
};

/**
 * كلمات بتوصل من الشيت/قاعدة البيانات وهي **مش بيانات**: `(blank)`، `((blank))`،
 * `(null)`، `n/a`، `undefined`. المستخدم طلب صريح إنها متظهرش خالص، فبنشيلها
 * من النص نفسه بدل ما نخبيها وقت العرض — كده مبتتخزنش أصلًا في الكتالوج.
 */
const PARENTHESISED_PLACEHOLDER = /\(+\s*(?:blank|null|none|nil|undefined|n\/?a)\s*\)+/gi;
const BARE_PLACEHOLDER = /(?:^|[\s\-_/|,•·])(?:blank|null|none|nil|undefined|n\/?a)(?=$|[\s\-_/|,•·])/gi;
const EDGE_JUNK = /^[\s\-_/|,•·]+|[\s\-_/|,•·]+$/g;

/**
 * يشيل كلمة blank (وأخواتها) من أي نص جاي من الشيت أو من الداتا القديمة.
 * بيرجع `''` لو الخلية كانت مجرد placeholder، عشان الكود اللي بيستخدمها
 * يعتبرها "مفيش قيمة" بدل ما يطبعها.
 */
export function stripPlaceholderText(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let text = String(raw);
  if (!text.trim()) return '';

  text = text.replace(PARENTHESISED_PLACEHOLDER, ' ');
  text = text.replace(BARE_PLACEHOLDER, ' ');
  text = text.replace(/\u00A0/g, ' ');
  text = text.replace(/\s{2,}/g, ' ');
  // "أحمر - (blank) - كبير" بعد الشيل بيسيب فاصلين ورا بعض — بنلمّهم في فاصل واحد.
  text = text.replace(/(?:[-|,•·]\s*){2,}/g, (run) => `${run.trim().charAt(0)} `);
  text = text.replace(/\s{2,}/g, ' ');
  text = text.replace(EDGE_JUNK, '');

  return text.trim();
}

const CARTON_UNIT_RE = /كرتون|كراتين|carton|box/i;
const PIECE_UNIT_RE = /(?:^|[\s/|(])(?:قطعة|قطعه|قطع|piece|pieces|pcs|pc)(?=$|[\s/|)])/i;

/**
 * بيقرأ الوحدة من نص الخلية نفسها: "ج.م / كرتونة" → carton، "ج.م / قطعة" → piece.
 * لو الخلية مفيهاش وحدة مكتوبة بيرجع `null`، وساعتها معنى العمود هو اللي يحكم.
 */
export function detectSaleUnit(raw: unknown): SaleUnit | null {
  if (raw === null || raw === undefined) return null;
  const text = stripPlaceholderText(String(raw));
  if (!text) return null;
  if (CARTON_UNIT_RE.test(text)) return 'carton';
  if (PIECE_UNIT_RE.test(text)) return 'piece';
  return null;
}

/**
 * شدة الكرتونة (Factor / ق/ك). أي حاجة مش رقم صالح أو أقل من 1 بتترجع `fallback`
 * (افتراضيًا 1) — وشدة 1 معناها إن الصنف بيتباع بالقطعة، مش إن الكرتونة فاضية.
 */
export function parseCartonFactor(raw: unknown, fallback = 1): number {
  const value = parseNumericValue(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, roundMoney(value));
}


export interface ProductPricingInput {
  /** السعر اللي في عمود "سعر القطعة" (أو أي عمود سعره الافتراضي للقطعة). */
  piecePrice?: unknown;
  /** السعر اللي في عمود "سعر الكرتونة" (أو أي عمود سعره الافتراضي للكرتونة). */
  cartonPrice?: unknown;
  /** شدة الكرتونة. */
  factor?: unknown;
  /** الوحدة المكتوبة جوّه خلية سعر القطعة، لو موجودة. */
  pieceUnitHint?: SaleUnit | null;
  /** الوحدة المكتوبة جوّه خلية سعر الكرتونة، لو موجودة. */
  cartonUnitHint?: SaleUnit | null;
}

export interface ResolvedProductPricing {
  factor: number;
  piecePrice: number;
  cartonPrice: number;
  /** الوحدة اللي السعر المعروض بيتحسب بيها. */
  unit: SaleUnit;
  /** شدة 1 ⇒ الصنف بيتباع بالقطعة، مفيش "كرتونة" تتكلم عنها. */
  isSinglePiece: boolean;
}

/**
 * بيحوّل أي شكل أسعار جاي من الشيت لزوج متسق (سعر قطعة، سعر كرتونة).
 *
 * ترتيب الحسم:
 *   1. الوحدة المكتوبة في الخلية بتغلب معنى العمود (لو الشيت بيقول "/ كرتونة" يبقى رقم كرتونة).
 *   2. شدة = 1 ⇒ سعر القطعة = سعر الكرتونة = الرقم اللي موجود، والوحدة "قطعة".
 *   3. عندنا سعر قطعة ⇒ سعر الكرتونة = سعر القطعة × الشدة.
 *   4. عندنا سعر كرتونة بس ⇒ سعر القطعة = سعر الكرتونة ÷ الشدة.
 */
export function resolveProductPricing(input: ProductPricingInput): ResolvedProductPricing {
  const factor = parseCartonFactor(input.factor);
  let piecePrice = NON_NEGATIVE(parseNumericValue(input.piecePrice));
  let cartonPrice = NON_NEGATIVE(parseNumericValue(input.cartonPrice));
  const pieceUnitHint = input.pieceUnitHint ?? null;
  const cartonUnitHint = input.cartonUnitHint ?? null;

  // 1. الوحدة المكتوبة في الخلية أدق من عنوان العمود.
  if (pieceUnitHint === 'carton') {
    if (cartonPrice <= 0) cartonPrice = piecePrice;
    piecePrice = 0;
  } else if (cartonUnitHint === 'piece') {
    if (piecePrice <= 0) piecePrice = cartonPrice;
    cartonPrice = 0;
  }

  // 2. صنف بالقطعة (Factor = 1): مفيش كرتونة، السعر هو سعر القطعة.
  if (factor <= 1) {
    const price = piecePrice > 0 ? piecePrice : cartonPrice;
    return {
      factor: 1,
      piecePrice: roundMoney(price),
      cartonPrice: roundMoney(price),
      unit: 'piece',
      isSinglePiece: true,
    };
  }

  // 3. سعر القطعة هو المصدر: الكرتونة = القطعة × الشدة.
  if (piecePrice > 0) {
    return {
      factor,
      piecePrice: roundMoney(piecePrice),
      cartonPrice: roundMoney(piecePrice * factor),
      unit: 'carton',
      isSinglePiece: false,
    };
  }

  // 4. سعر الكرتونة بس: القطعة = الكرتونة ÷ الشدة.
  if (cartonPrice > 0) {
    return {
      factor,
      piecePrice: roundMoney(cartonPrice / factor),
      cartonPrice: roundMoney(cartonPrice),
      unit: 'carton',
      isSinglePiece: false,
    };
  }

  return { factor, piecePrice: 0, cartonPrice: 0, unit: 'carton', isSinglePiece: false };
}

/** اسم الوحدة اللي بيتكتب جنب السعر في الواجهات. */
export const saleUnitLabel = (unit: SaleUnit): string => (unit === 'piece' ? 'قطعة' : 'كرتونة');

/**
 * بيختار السعر اللي المفروض يتعرض للعميل:
 *   - صنف كرتونة ⇒ سعر الكرتونة
 *   - صنف قطعة (Factor = 1) ⇒ سعر القطعة (نفس الرقم، بس المسمى بيختلف)
 */
export function resolveDisplayPrice(input: ProductPricingInput): ResolvedProductPricing & {
  displayPrice: number;
  unitLabel: string;
} {
  const pricing = resolveProductPricing(input);
  return {
    ...pricing,
    displayPrice: pricing.unit === 'piece' ? pricing.piecePrice : pricing.cartonPrice,
    unitLabel: saleUnitLabel(pricing.unit),
  };
}
