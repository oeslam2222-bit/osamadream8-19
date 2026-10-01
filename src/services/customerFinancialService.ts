import type { Customer } from '../types';
import { normalizeArabicText } from './arabicMatchingService';

export interface CustomerFinancials {
  sales2026: number;
  collections2026: number;
  returns2026: number;
  balance: number;
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
 * SIGN RULE FOR COLLECTIONS — read this before touching any collections code.
 *
 * The sheet records a collection as a NEGATIVE entry (money coming in reduces the
 * customer's debt) and a return/مردودة as a POSITIVE entry. So a collections figure
 * is always a NET: net = collections - returns.
 *
 * Two rules follow, and every screen depends on them:
 *   1. NEVER take Math.abs() of a single cell. That turns a return into extra
 *      "collected" money, so the 12 months stop adding up to the year.
 *   2. Only the FINAL net may be shown as a magnitude, at the display layer.
 *
 * Totals are the sum of the per-customer nets, then the magnitude of that sum.
 * Summing nets lets returns offset collections; summing per-customer absolute
 * values does not, and that is what produced the ~500k error.
 */
export function sumNetCollections(monthly?: Record<number, number> | undefined): number {
  if (!monthly) return 0;
  let sum = 0;
  for (let m = 1; m <= 12; m++) {
    sum += parseCleanNumber(monthly[m]);
  }
  return sum;
}

/**
 * Canonical signed net collections for one customer, in strict priority order:
 * the sheet's own total column first, then the sum of the monthly columns.
 * Returns the NET with the sheet's sign. No Math.abs, no Math.max.
 */
export function resolveNetCollections(c: Partial<Customer> | undefined | null): number {
  if (!c) return 0;
  const explicit = [c.collections2026, c.totalMonthlyCollections, c.totalOverallCollections]
    .map((v) => (v === undefined || v === null ? undefined : parseCleanNumber(v)))
    .find((v): v is number => v !== undefined && v !== 0 && isFinite(v));
  if (explicit !== undefined) return explicit;
  return sumNetCollections(c.monthlyCollections2026);
}

/**
 * Display magnitude of a customer's net collections. Use this only where a single
 * customer's amount is displayed; company totals must sum nets first.
 */
export function resolveCollectionsMagnitude(c: Partial<Customer> | undefined | null): number {
  return Math.abs(resolveNetCollections(c));
}

/**
 * Universal Single Source of Truth for Customer Financial Calculations.
 * Replaces arbitrary Math.max guessing with strict priority and exact sheet mirroring.
 */
export function calculateCustomerFinancials(
  c: Customer,
  selectedMonth: number | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'ALL' = 'ALL'
): CustomerFinancials {
  // 1. Monthly Maps (1 to 12) — signed, so 12 months sum to the year figure.
  const monthlySales: Record<number, number> = {};
  const monthlyCollections: Record<number, number> = {};
  let monthlySalesSum = 0;

  for (let m = 1; m <= 12; m++) {
    const sVal = parseCleanNumber(c.monthlySales2026?.[m]);
    // Keep the sheet's sign on each month: a return is positive and must offset
    // the collection next to it. Taking Math.abs() here inflated every month
    // that contains a مردودة and broke the year total.
    const cVal = parseCleanNumber(c.monthlyCollections2026?.[m]);
    monthlySales[m] = sVal;
    monthlyCollections[m] = cVal;
    monthlySalesSum += sVal;
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

  // 3. Collections 2026: the NET the sheet reports, kept signed.
  const collections2026 = resolveNetCollections(c);

  const returns2026 = 0;

  // 4. Balances and Debt
  const balance = parseCleanNumber(c.currentBalance ?? c.balance ?? 0);
  const overdue = parseCleanNumber(
    c.totalOverdueAndDue ?? c.overdueBalance ?? c.totalOverdue ?? c.dueUntilPeriod ?? 0
  );
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

  // 7. Deal Eligibility (قابل / غير قابل للتعامل)
  //
  // The sheet's "قابل /غير" column is the source of truth. Some sheets put all
  // three classifications in the one متعامل/غير column instead, so when that
  // column is blank we read "غير قابل" from there before falling back to the
  // app's own status and debt rules. A value the user typed always wins.
  const eligNorm = normalizeArabicText(c.dealEligibility || '');
  const dealtNorm = normalizeArabicText(c.dealt2026 || '');
  const stNorm = normalizeArabicText(c.status2026 || '');
  const debtNorm = normalizeArabicText(c.debtStatus || '');

  let isExplicitIneligible = false;
  let ineligibilityReason: string | undefined = undefined;

  const reasonFrom = (text: string): string | undefined => {
    if (text.includes('موقوف')) return 'موقوف';
    if (text.includes('ممتنع')) return 'ممتنع';
    if (text.includes('مستبعد')) return 'مستبعد';
    // "غير قابل" only — a bare "غير متعامل" means the customer simply did not
    // buy, which is a dealt flag, not an eligibility block.
    if (text.includes('غير') && text.includes('قابل')) return 'غير قابل للتعامل';
    return undefined;
  };

  if (eligNorm) {
    ineligibilityReason = reasonFrom(eligNorm);
    isExplicitIneligible = ineligibilityReason !== undefined;
  } else if (dealtNorm) {
    // Single combined column: متعامل / غير متعامل / غير قابل
    ineligibilityReason = reasonFrom(dealtNorm);
    isExplicitIneligible = ineligibilityReason !== undefined;
  } else if (stNorm === 'blocked' || stNorm.includes('موقوف')) {
    isExplicitIneligible = true;
    ineligibilityReason = 'موقوف';
  } else if (debtNorm.includes('متعثر')) {
    isExplicitIneligible = true;
    ineligibilityReason = 'متعثر';
  }

  const isEligible = !isExplicitIneligible;
  const eligibilityStatusLabel: 'قابل للتعامل' | 'غير قابل للتعامل' = isEligible ? 'قابل للتعامل' : 'غير قابل للتعامل';

  // 8. Deal Status (متعامل / غير متعامل)
  //
  // Business rule: "متعامل" means the customer BOUGHT from us — sales only.
  // Collections and returns must never create a dealt customer, otherwise the
  // monthly count changes meaning depending on who paid and who returned.
  //
  // For the whole year the sheet's own columns decide it (متعامل 2026 /
  // قابل /غير), because those are the accounting's record. For a selected month
  // or quarter the count is recomputed from that period's sales, so it is a
  // variable number per month, per rep and per branch.
  let isDealtCustomer = false;
  if (selectedMonth === 'ALL') {
    if (c.dealt2026 === 'متعامل') {
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
  };
}
