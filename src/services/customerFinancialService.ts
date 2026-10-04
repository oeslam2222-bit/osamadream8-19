import type { Customer } from '../types';
import { normalizeArabicText } from './arabicMatchingService';
import { resolveCustomerBalanceValue, resolveCustomerDuesValue } from './customerDues';

export { resolveCustomerBalanceValue, resolveCustomerDuesValue };

// The three classifications the sheet's "قابل /غير" column carries, in one
// place so the counters can never disagree with each other.
export type SheetClassification =
  | 'dealt_eligible'   // متعامل قابل للتعامل
  | 'idle_eligible'    // غير متعامل قابل للتعامل
  | 'ineligible';      // غير قابل

export interface SheetClassificationInfo {
  eligible: boolean;
  /** true / false when the column names the deal status, undefined when it only says قابل. */
  dealt?: boolean;
  bucket: SheetClassification;
  label: string;
  /** The cell's own text, verbatim — this is what the screen shows. */
  raw: string;
}

/**
 * Reads the three classifications out of one "قابل /غير" cell.
 *
 * The order matters: "غير قابل" is checked first so it is never mistaken for
 * "قابل", and "غير متعامل" is checked before "متعامل" so a non-buyer is not
 * counted as a buyer. Returns undefined for a blank cell so the caller can fall
 * back to the other sheet columns.
 */
export function classifyEligibilityColumn(value: string | undefined): SheetClassificationInfo | undefined {
  const raw = (value || '').trim();
  const t = normalizeArabicText(raw);
  if (!t) return undefined;

  if (t.includes('موقوف') || t.includes('ممتنع') || t.includes('مستبعد') || t.includes('غير قابل')) {
    // "غير قابل" only blocks dealing; it says nothing about whether the customer
    // ever bought. Leaving dealt undefined lets the متعامل 2026 column answer,
    // so a blocked customer is not silently dropped from the dealt count.
    return { eligible: false, dealt: undefined, bucket: 'ineligible', label: 'غير قابل', raw };
  }
  if (t.includes('غير متعامل')) {
    return { eligible: true, dealt: false, bucket: 'idle_eligible', label: 'غير متعامل قابل للتعامل', raw };
  }
  if (t.includes('متعامل')) {
    return { eligible: true, dealt: true, bucket: 'dealt_eligible', label: 'متعامل قابل للتعامل', raw };
  }
  // A bare "قابل" carries no deal information — only eligibility.
  return { eligible: true, dealt: undefined, bucket: 'idle_eligible', label: 'قابل', raw };
}

export interface CustomerFinancials {
  sales2026: number;
  collections2026: number;
  returns2026: number;
  balance: number;
  netBalance: number;
  overdue: number;
  dueBalance: number;
  creditLimit: number;
  isOverLimit: boolean;
  collectionRate: number;
  monthlySales: Record<number, number>;
  monthlyCollections: Record<number, number>;
  periodSales: number;
  periodCollections: number;
  isDealtCustomer: boolean;
  isExplicitIneligible: boolean;
  isEligible: boolean;
  dealtStatusLabel: 'متعامل' | 'غير متعامل';
  eligibilityStatusLabel: 'قابل للتعامل' | 'غير قابل للتعامل';
  ineligibilityReason?: string;
  /** The sheet's own classification from the "قابل /غير" column — one of three. */
  sheetClassification: SheetClassification;
  sheetClassificationLabel: string;
}

/**
 * Checks if a customer or raw row is an Excel summary / total row
 * (e.g., "الإجمالي", "المجموع", "Total", "Grand Total")
 * that must be excluded so it doesn't inflate company collections by millions.
 */
export function isSummaryOrTotalRow(
  name?: string,
  code?: string,
  branch?: string,
  rep?: string
): boolean {
  const rawName = (name || '').trim();
  const rawCode = (code || '').trim();
  const normName = normalizeArabicText(rawName);
  const normCode = normalizeArabicText(rawCode);
  const combined = `${rawName} ${rawCode}`.toLowerCase();

  // 1. Direct Arabic total terms
  const totalKeywords = [
    'اجمالي',
    'إجمالي',
    'الاجمالي',
    'الإجمالي',
    'مجموع',
    'المجموع',
    'المجموعالكلي',
    'المجموعالعام',
    'اجماليالمبيعات',
    'اجماليالتحصيلات',
    'اجماليالعملاء',
    'اجماليالفروع',
    'اجماليعام',
    'إجماليعام',
    'كلالعملاء',
    'العددالكلي',
    'اجماليالحسابات',
    'مجموععام',
    'مجموعالفروع',
  ];

  if (totalKeywords.includes(normName) || totalKeywords.includes(normCode)) {
    return true;
  }

  // 2. English total terms
  if (
    combined.includes('grand total') ||
    combined.includes('sub total') ||
    combined.includes('subtotal') ||
    combined === 'total' ||
    combined === 'totals' ||
    combined.startsWith('total ') ||
    combined.endsWith(' total')
  ) {
    return true;
  }

  // 3. Name starts with summary words and has no individual code/rep
  if (
    normName.startsWith('اجمالي') ||
    normName.startsWith('إجمالي') ||
    normName.startsWith('مجموع')
  ) {
    if (!rawCode || normCode.startsWith('اجمالي') || normCode === 'total' || !rep) {
      return true;
    }
  }

  return false;
}

/**
 * Clean numeric parser that handles comma, Arabic digits, and negative signs cleanly
 */
export function parseCleanNumber(val: any): number {
  if (typeof val === 'number') {
    return isFinite(val) ? val : 0;
  }
  if (!val) return 0;
  let str = String(val).trim();
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    str = str.split(arabicNumerals[i]).join(String(i));
  }
  const isNegative = /^\s*\(.*\)\s*$/.test(str) || /-\s*$/.test(str) || /^\s*-/.test(str);
  str = str.replace(/,/g, '').replace(/٬/g, '').replace(/\.(?=\d{3})/g, '').replace(/٫/g, '.');
  const clean = str.replace(/[^\d.]/g, '');
  if (!clean) return 0;
  const num = parseFloat(clean);
  if (isNaN(num) || !isFinite(num)) return 0;
  return isNegative ? -num : num;
}

/**
 * SIGN & MAGNITUDE RULE FOR COLLECTIONS:
 * In Excel/Google Sheets, collections may be recorded as positive amounts (e.g. 50,000)
 * or negative credit amounts (e.g. -50,000 or (50,000)).
 * Both positive and negative numbers represent REAL money collected and MUST be included
 * in the total company collections. Never drop or exclude positive numbers!
 */
export function sumNetCollections(monthly?: Record<number, number> | undefined): number {
  if (!monthly) return 0;
  let sum = 0;
  for (let m = 1; m <= 12; m++) {
    sum += Math.abs(parseCleanNumber(monthly[m]));
  }
  return sum;
}

/**
 * Canonical collections for one customer: sums all collected amounts whether entered
 * as positive or negative, prioritizing the sheet's explicit total column first,
 * then falling back to the sum of monthly collections.
 */
export function resolveNetCollections(c: Partial<Customer> | undefined | null): number {
  if (!c) return 0;
  const explicit = [c.collections2026, c.totalMonthlyCollections, c.totalOverallCollections]
    .map((v) => (v === undefined || v === null ? undefined : Math.abs(parseCleanNumber(v))))
    .find((v): v is number => v !== undefined && v !== 0 && isFinite(v));
  if (explicit !== undefined) return explicit;
  return sumNetCollections(c.monthlyCollections2026);
}

/**
 * Display magnitude of a customer's collections.
 */
export function resolveCollectionsMagnitude(c: Partial<Customer> | undefined | null): number {
  return resolveNetCollections(c);
}

/**
 * Universal Single Source of Truth for Customer Financial Calculations.
 * Replaces arbitrary Math.max guessing with strict priority and exact sheet mirroring.
 */
export function calculateCustomerFinancials(
  c: Customer,
  selectedMonth: number | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'ALL' = 'ALL'
): CustomerFinancials {
  // 1. Monthly Maps (1 to 12) — sums all collection amounts (positive and negative)
  const monthlySales: Record<number, number> = {};
  const monthlyCollections: Record<number, number> = {};
  let monthlySalesSum = 0;
  let monthlyColsSum = 0;

  for (let m = 1; m <= 12; m++) {
    const sVal = parseCleanNumber(c.monthlySales2026?.[m]);
    const cVal = Math.abs(parseCleanNumber(c.monthlyCollections2026?.[m]));
    monthlySales[m] = sVal;
    monthlyCollections[m] = cVal;
    monthlySalesSum += sVal;
    monthlyColsSum += cVal;
  }

  // 2. Sales 2026: Single Source of Truth with strict priority order (NO Math.max)
  let sales2026 = 0;
  if (c.sales2026 !== undefined && c.sales2026 !== null && !isNaN(Number(c.sales2026)) && Number(c.sales2026) > 0) {
    sales2026 = Number(c.sales2026);
  } else if (c.totalMonthlySales !== undefined && c.totalMonthlySales !== null && !isNaN(Number(c.totalMonthlySales)) && Number(c.totalMonthlySales) > 0) {
    sales2026 = Number(c.totalMonthlySales);
  } else if (monthlySalesSum > 0) {
    sales2026 = monthlySalesSum;
  } else if (c.totalOverallSales !== undefined && c.totalOverallSales !== null && !isNaN(Number(c.totalOverallSales)) && Number(c.totalOverallSales) > 0) {
    sales2026 = Number(c.totalOverallSales);
  }

  // 3. Collections 2026: Mirrors sheet collections accurately (all collected amounts counted)
  let collections2026 = resolveNetCollections(c);
  if (collections2026 === 0 && monthlyColsSum > 0) {
    collections2026 = monthlyColsSum;
  }

  const returns2026 = 0;

  // 4. Balances and Debt — both figures come from the canonical resolvers so the
  // main table, the Power BI tabs and the Excel export can never disagree.
  const balance = resolveCustomerBalanceValue(c);
  const overdue = resolveCustomerDuesValue(c);
  const dueBalance = c.dueBalance !== undefined ? parseCleanNumber(c.dueBalance) : overdue;
  const creditLimit = Math.max(0, parseCleanNumber(c.creditLimit || 0));
  const isOverLimit = creditLimit > 0 && balance > creditLimit;

  // 5. Collection Rate % — the rate is a ratio, so it uses the magnitude of the
  // net. A negative net means returns exceeded collections in that period.
  const collectionsMagnitude = Math.abs(collections2026);
  const collectionRate = sales2026 > 0
    ? Math.min(100, Math.round((collectionsMagnitude / sales2026) * 100))
    : (collectionsMagnitude > 0 ? 100 : 0);

  // 6. Period-specific sales and collections (driven by the month / quarter slicer)
  let periodSales = sales2026;
  let periodCollections = collections2026;

  if (selectedMonth === 'Q1') {
    periodSales = monthlySales[1] + monthlySales[2] + monthlySales[3];
    periodCollections = monthlyCollections[1] + monthlyCollections[2] + monthlyCollections[3];
  } else if (selectedMonth === 'Q2') {
    periodSales = monthlySales[4] + monthlySales[5] + monthlySales[6];
    periodCollections = monthlyCollections[4] + monthlyCollections[5] + monthlyCollections[6];
  } else if (selectedMonth === 'Q3') {
    periodSales = monthlySales[7] + monthlySales[8] + monthlySales[9];
    periodCollections = monthlyCollections[7] + monthlyCollections[8] + monthlyCollections[9];
  } else if (selectedMonth === 'Q4') {
    periodSales = monthlySales[10] + monthlySales[11] + monthlySales[12];
    periodCollections = monthlyCollections[10] + monthlyCollections[11] + monthlyCollections[12];
  } else if (typeof selectedMonth === 'number' && selectedMonth >= 1 && selectedMonth <= 12) {
    periodSales = monthlySales[selectedMonth] || 0;
    periodCollections = monthlyCollections[selectedMonth] || 0;
  }


const reasonFrom = (text: string): string | undefined => {
  if (text.includes('موقوف')) return 'موقوف';
  if (text.includes('ممتنع')) return 'ممتنع';
  if (text.includes('مستبعد')) return 'مستبعد';
  // "غير قابل" only — a bare "غير متعامل" means the customer simply did not
  // buy, which is a dealt flag, not an eligibility block.
  if (text.includes('غير') && text.includes('قابل')) return 'غير قابل للتعامل';
  return undefined;
};

// 7. Deal Classification (متعامل قابل / غير متعامل قابل / غير قابل)
  //
  // The two halves come from two different places and must never be mixed:
  //   • eligibility  → the "قابل /غير" column, which is the whole point of it
  //   • dealt flag   → whichever column actually names متعامل / غير متعامل
  // Reading eligibility from the متعامل column is what previously made a
  // "غير قابل" customer come out as eligible again.
  const sheetClass = classifyEligibilityColumn(c.dealEligibility);
  const dealtClass = classifyEligibilityColumn(c.dealt2026);
  const stNorm = normalizeArabicText(c.status2026 || '');
  const debtNorm = normalizeArabicText(c.debtStatus || '');

  const eligibleFromSheet = sheetClass?.eligible ?? dealtClass?.eligible;
  const isEligible =
    eligibleFromSheet !== undefined
      ? eligibleFromSheet
      : !(debtNorm.includes('متعثر') || stNorm === 'blocked' || stNorm.includes('موقوف'));

  // The bucket is whichever column carried a real classification value.
  const sheetClassification: SheetClassification =
    sheetClass?.bucket ?? dealtClass?.bucket ?? 'idle_eligible';
  // Show the sheet's own wording — never a reworded version of it.
  const sheetClassificationLabel: string =
    sheetClass?.raw || dealtClass?.raw || (isEligible ? 'قابل' : 'غير قابل');

  // The deal status is independent: "غير قابل" does not mean the customer never
  // bought, so this falls through to the other column when the first is silent.
  const dealtFromSheet: boolean | undefined = sheetClass?.dealt ?? dealtClass?.dealt;

  const isExplicitIneligible = !isEligible;
  const ineligibilityReason: string | undefined = isExplicitIneligible
    ? (sheetClass?.raw || dealtClass?.raw || 'غير قابل')
    : undefined;

  const eligibilityStatusLabel: 'قابل للتعامل' | 'غير قابل للتعامل' = isEligible ? 'قابل للتعامل' : 'غير قابل للتعامل';

  // 8. Deal Status (متعامل / غير متعامل)
  //
  // Business rule: "متعامل" means the customer BOUGHT from us — sales only.
  // Collections and returns must never create a dealt customer, otherwise the
  // monthly count changes meaning depending on who paid and who returned.
  //
  // For the whole year the sheet's own columns decide it. For a selected month or
  // quarter the count is recomputed from that period's sales, so it is a
  // variable number per month, per rep and per branch.
  let isDealtCustomer = false;
  if (selectedMonth === 'ALL') {
    if (dealtFromSheet !== undefined) {
      isDealtCustomer = dealtFromSheet;
    } else if (c.dealt2026 === 'متعامل') {
      isDealtCustomer = true;
    } else if (c.dealt2026 === 'غير متعامل') {
      isDealtCustomer = false;
    } else if (c.hasDealtIn2026 !== undefined) {
      isDealtCustomer = Boolean(c.hasDealtIn2026);
    } else {
      isDealtCustomer = sales2026 > 0;
    }
  } else {
    // Sales in that period only — a collection or a return is not a purchase.
    isDealtCustomer = periodSales > 0;
  }

  const dealtStatusLabel: 'متعامل' | 'غير متعامل' = isDealtCustomer ? 'متعامل' : 'غير متعامل';

  return {
    sales2026,
    collections2026,
    returns2026,
    balance,
    netBalance: balance,
    overdue,
    dueBalance,
    creditLimit,
    isOverLimit,
    collectionRate,
    monthlySales,
    monthlyCollections,
    periodSales,
    periodCollections,
    isDealtCustomer,
    isExplicitIneligible,
    isEligible,
    dealtStatusLabel,
    eligibilityStatusLabel,
    ineligibilityReason,
    sheetClassification,
    sheetClassificationLabel,
  };
}
