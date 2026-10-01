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
 * Universal Single Source of Truth for Customer Financial Calculations.
 * Replaces arbitrary Math.max guessing with strict priority and exact sheet mirroring.
 */
export function calculateCustomerFinancials(
  c: Customer,
  selectedMonth: number | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'ALL' = 'ALL'
): CustomerFinancials {
  // 1. Monthly Maps (1 to 12)
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

  // 3. Collections 2026: Direct Mirror of Sheet Collections with strict priority (NO Math.max)
  // In Excel sheets, collections are recorded as positive amounts (or signed netting). We mirror the exact magnitude.
  let collections2026 = 0;
  const rawColl = c.collections2026 !== undefined && c.collections2026 !== null ? parseCleanNumber(c.collections2026) : undefined;
  const rawMonthlyColl = c.totalMonthlyCollections !== undefined && c.totalMonthlyCollections !== null ? parseCleanNumber(c.totalMonthlyCollections) : undefined;
  const rawOverallColl = c.totalOverallCollections !== undefined && c.totalOverallCollections !== null ? parseCleanNumber(c.totalOverallCollections) : undefined;

  if (rawColl !== undefined && rawColl !== 0) {
    collections2026 = Math.abs(rawColl);
  } else if (rawMonthlyColl !== undefined && rawMonthlyColl !== 0) {
    collections2026 = Math.abs(rawMonthlyColl);
  } else if (monthlyColsSum > 0) {
    collections2026 = monthlyColsSum;
  } else if (rawOverallColl !== undefined && rawOverallColl !== 0) {
    collections2026 = Math.abs(rawOverallColl);
  }

  const returns2026 = 0;

  // 4. Balances and Debt
  const balance = parseCleanNumber(c.currentBalance ?? c.balance ?? 0);
  const overdue = parseCleanNumber(
    c.totalOverdueAndDue ?? c.overdueBalance ?? c.totalOverdue ?? c.dueUntilPeriod ?? 0
  );
  const dueBalance = c.dueBalance !== undefined ? parseCleanNumber(c.dueBalance) : overdue;
  const creditLimit = Math.max(0, parseCleanNumber(c.creditLimit || 0));
  const isOverLimit = creditLimit > 0 && balance > creditLimit;

  // 5. Collection Rate %
  const collectionRate = sales2026 > 0
    ? Math.min(100, Math.round((collections2026 / sales2026) * 100))
    : (collections2026 > 0 ? 100 : 0);

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
  const eligNorm = normalizeArabicText(c.dealEligibility || '');
  const stNorm = normalizeArabicText(c.status2026 || '');
  const debtNorm = normalizeArabicText(c.debtStatus || '');

  let isExplicitIneligible = false;
  let ineligibilityReason: string | undefined = undefined;

  if (eligNorm.includes('غير') || eligNorm.includes('موقوف') || eligNorm.includes('ممتنع') || eligNorm.includes('مستبعد')) {
    isExplicitIneligible = true;
    if (eligNorm.includes('موقوف')) ineligibilityReason = 'موقوف';
    else if (eligNorm.includes('ممتنع')) ineligibilityReason = 'ممتنع';
    else if (eligNorm.includes('مستبعد')) ineligibilityReason = 'مستبعد';
    else ineligibilityReason = 'غير قابل للتعامل';
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
  // Authoritative status from the sheet: c.dealt2026 or c.hasDealtIn2026
  let isDealtCustomer = false;
  if (selectedMonth === 'ALL') {
    if (c.dealt2026 === 'متعامل') {
      isDealtCustomer = true;
    } else if (c.dealt2026 === 'غير متعامل') {
      isDealtCustomer = false;
    } else if (c.hasDealtIn2026 !== undefined) {
      isDealtCustomer = Boolean(c.hasDealtIn2026);
    } else {
      isDealtCustomer = sales2026 > 0 || collections2026 > 0;
    }
  } else {
    // For period filters (selected month/quarter), reflects activity in that period
    isDealtCustomer = periodSales > 0 || periodCollections > 0;
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
