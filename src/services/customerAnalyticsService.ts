import * as XLSX from 'xlsx-js-style';
import { Customer, CustomerTier, CustomerVisit, User } from '../types';
import {
  doesCustomerBelongToBranch,
  doesCustomerBelongToRep,
  doesCustomerBelongToSupervisor,
  isArabicNameMatch,
  isBranchMatch,
  normalizeArabicText
} from './arabicMatchingService';
import { buildGoogleSheetsPublicCsvUrl } from './excelService';
import { decodeBufferSmart, parseExcelOrCsvBuffer } from './encodingService';
import { deduplicateAndMergeCustomers } from './customerDeduplicationService';

export const MONTH_NAMES_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'إبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر'
];

/**
 * Filter customers strictly according to user role and branch / rep permissions
 */
export function filterCustomersByRBAC(
  customers: Customer[],
  user: User | null,
  allUsers: User[] = []
): Customer[] {
  if (!user) return [];

  // Admin & Developer see all customers across all branches
  if (user.role === 'admin' || user.role === 'developer') {
    return customers;
  }

  // Branch Manager only sees customers in his branch
  if (user.role === 'branch_manager') {
    return customers.filter((c) =>
      doesCustomerBelongToBranch(c, user.branchName)
    );
  }

  // Supervisor sees customers in his branch and assigned to his supervised reps
  if (user.role === 'supervisor') {
    return customers.filter((c) =>
      doesCustomerBelongToSupervisor(c, user, allUsers)
    );
  }

  // Sales Rep ONLY sees his assigned customers
  if (user.role === 'sales_rep') {
    return customers.filter((c) =>
      doesCustomerBelongToRep(c, user)
    );
  }

  return [];
}

/**
 * Safe numeric cleaner with full accounting format & Arabic numerals support
 * Supports (1500), 1500-, -1500, and Arabic digits ٠-٩
 */
export function cleanNumber(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  let str = String(val).trim();
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    str = str.split(arabicNumerals[i]).join(String(i));
  }
  // Check accounting negative format: (1234), 1234-, or -1234
  const isNegative = /^\s*\(.*\)\s*$/.test(str) || /-\s*$/.test(str) || /^\s*-/.test(str);
  str = str.replace(/,/g, '').replace(/٬/g, '').replace(/٫/g, '.');
  const clean = str.replace(/[^\d.]/g, '');
  if (!clean) return fallback;
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return fallback;
  return isNegative ? -parsed : parsed;
}

const MONTH_NAMES_MAP: Record<number, string[]> = {
  1: ['يناير', 'شهر 1', 'ش 1', 'ش01', 'شهر01', 'jan', 'january', 'كانون الثاني'],
  2: ['فبراير', 'شهر 2', 'ش 2', 'ش02', 'شهر02', 'feb', 'february', 'شباط'],
  3: ['مارس', 'شهر 3', 'ش 3', 'ش03', 'شهر03', 'mar', 'march', 'اذار', 'آذار'],
  4: ['ابريل', 'إبريل', 'شهر 4', 'ش 4', 'ش04', 'شهر04', 'apr', 'april', 'نيسان'],
  5: ['مايو', 'شهر 5', 'ش 5', 'ش05', 'شهر05', 'may', 'ايار', 'أيار'],
  6: ['يونيو', 'شهر 6', 'ش 6', 'ش06', 'شهر06', 'jun', 'june', 'حزيران'],
  7: ['يوليو', 'شهر 7', 'ش 7', 'ش07', 'شهر07', 'jul', 'july', 'تموز'],
  8: ['اغسطس', 'أغسطس', 'شهر 8', 'ش 8', 'ش08', 'شهر08', 'aug', 'august', 'اب', 'آب'],
  9: ['سبتمبر', 'شهر 9', 'ش 9', 'ش09', 'شهر09', 'sep', 'september', 'ايلول', 'أيلول'],
  10: ['اكتوبر', 'أكتوبر', 'شهر 10', 'ش 10', 'ش10', 'شهر10', 'oct', 'october', 'تشرين الاول', 'تشرين الأول'],
  11: ['نوفمبر', 'شهر 11', 'ش 11', 'ش11', 'شهر11', 'nov', 'november', 'تشرين الثاني'],
  12: ['ديسمبر', 'شهر 12', 'ش 12', 'ش12', 'شهر12', 'dec', 'december', 'كانون الاول', 'كانون الأول'],
};

/**
 * Normalizes digits inside a header string (converting ٠-٩ to 0-9)
 */
function normalizeHeaderDigits(str: string): string {
  let s = str;
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    s = s.split(arabicNumerals[i]).join(String(i));
  }
  return s;
}

function hasMonthlySpecifierToken(rawDigits: string): boolean {
  const clean = rawDigits.replace(/202[4-9]/g, ' ').trim();
  for (let m = 1; m <= 12; m++) {
    const names = MONTH_NAMES_MAP[m] || [];
    if (names.some((name) => clean.includes(name))) return true;
    const mStr = String(m);
    if (new RegExp(`(?<!\\d)0?${mStr}(?!\\d)`).test(clean)) {
      return true;
    }
  }
  return false;
}

export function matchTotalSalesHeader(rawH: string): boolean {
  const h = normalizeHeaderDigits(rawH).toLowerCase();
  if (h.includes('تحصيل') || h.includes('سداد') || h.includes('coll')) return false;
  if (h.includes('2025') || h.includes('2024')) return false;

  const hasExplicitTotalWord =
    h.includes('اجمالي') ||
    h.includes('إجمالي') ||
    h.includes('اجمالى') ||
    h.includes('مجموع') ||
    h.includes('السنه') ||
    h.includes('السنة') ||
    h.includes('العام') ||
    h.includes('total') ||
    h.includes('all');

  // If header mentions a specific month (1-12 or month name) without explicit total word, it is NOT total sales
  if (hasMonthlySpecifierToken(h) && !hasExplicitTotalWord) {
    return false;
  }

  const isTotalTerm =
    hasExplicitTotalWord ||
    h.includes('صافي') ||
    h.includes('صافى') ||
    h.includes('قيمة') ||
    h.includes('قيمه');

  const isSalesTerm =
    h.includes('مبيعات') ||
    h.includes('بيعات') ||
    h.includes('مبيعة') ||
    h.includes('بيع') ||
    h.includes('sales') ||
    h.includes('sale');

  if (isTotalTerm && isSalesTerm) return true;
  if (
    h.includes('مبيعات السنه') ||
    h.includes('مبيعات السنة') ||
    h.includes('بيعات السنه') ||
    h.includes('بيعات السنة') ||
    h.includes('مبيعات 2026') ||
    h.includes('2026 مبيعات') ||
    h.includes('مبيعات 26') ||
    h.includes('26 مبيعات') ||
    h.includes('اجمالي بيعات') ||
    h.includes('إجمالي بيعات') ||
    h.includes('اجمالى بيعات') ||
    h.includes('الاجمالي بيعات') ||
    h.includes('اجمالي السنه مبيعات') ||
    h.includes('اجمالي مبيعات السنه') ||
    h.includes('اجمالي مبيعات السنة') ||
    h.includes('مبيعات العميل')
  ) {
    return true;
  }
  if (h === 'المبيعات' || h === 'مبيعات' || h === 'البيعات' || h === 'بيعات' || h === 'sales' || h === 'total sales') {
    return true;
  }
  return false;
}

export function matchTotalCollectionsHeader(rawH: string): boolean {
  const h = normalizeHeaderDigits(rawH).toLowerCase();
  if (h.includes('2025') || h.includes('2024')) return false;

  const hasExplicitTotalWord =
    h.includes('اجمالي') ||
    h.includes('إجمالي') ||
    h.includes('اجمالى') ||
    h.includes('مجموع') ||
    h.includes('السنه') ||
    h.includes('السنة') ||
    h.includes('العام') ||
    h.includes('total') ||
    h.includes('all');

  // If header mentions a specific month (1-12 or month name) without explicit total word, it is NOT total collections
  if (hasMonthlySpecifierToken(h) && !hasExplicitTotalWord) {
    return false;
  }

  const isTotalTerm =
    hasExplicitTotalWord ||
    h.includes('صافي') ||
    h.includes('صافى') ||
    h.includes('قيمة') ||
    h.includes('قيمه');

  const isColTerm =
    h.includes('تحصيل') ||
    h.includes('التحصيل') ||
    h.includes('تحصيلات') ||
    h.includes('التحصيلات') ||
    h.includes('سداد') ||
    h.includes('السداد') ||
    h.includes('سدادات') ||
    h.includes('السدادات') ||
    h.includes('المحصل') ||
    h.includes('المسدد') ||
    h.includes('محصل') ||
    h.includes('مسدد') ||
    h.includes('coll');

  if (isTotalTerm && isColTerm) return true;
  if (
    h.includes('تحصيل السنه') ||
    h.includes('تحصيل السنة') ||
    h.includes('تحصيلات السنه') ||
    h.includes('تحصيلات السنة') ||
    h.includes('تحصيل 2026') ||
    h.includes('2026 تحصيل') ||
    h.includes('تحصيلات 2026') ||
    h.includes('2026 تحصيلات') ||
    h.includes('تحصيل 26') ||
    h.includes('26 تحصيل') ||
    h.includes('سداد 2026') ||
    h.includes('2026 سداد') ||
    h.includes('اجمالي تحصيل') ||
    h.includes('إجمالي تحصيل') ||
    h.includes('اجمالى تحصيل') ||
    h.includes('الاجمالي تحصيل') ||
    h.includes('اجمالي التحصيل') ||
    h.includes('إجمالي التحصيل') ||
    h.includes('اجمالى التحصيل') ||
    h.includes('اجمالي تحصيلات') ||
    h.includes('إجمالي تحصيلات') ||
    h.includes('اجمالى تحصيلات') ||
    h.includes('اجمالي التحصيلات') ||
    h.includes('إجمالي التحصيلات') ||
    h.includes('اجمالي السنه تحصيل') ||
    h.includes('اجمالي تحصيل السنه') ||
    h.includes('اجمالي تحصيل السنة') ||
    h.includes('اجمالي السداد') ||
    h.includes('إجمالي السداد') ||
    h.includes('اجمالي سداد') ||
    h.includes('إجمالي سداد')
  ) {
    return true;
  }
  if (
    h === 'التحصيلات' ||
    h === 'تحصيلات' ||
    h === 'التحصيل' ||
    h === 'تحصيل' ||
    h === 'السداد' ||
    h === 'سداد' ||
    h === 'collections' ||
    h === 'total collections'
  ) {
    return true;
  }
  return false;
}

export function matchMonthlyCollectionHeader(rawH: string, m: number): boolean {
  if (matchTotalCollectionsHeader(rawH)) return false;

  const rawDigits = normalizeHeaderDigits(rawH).toLowerCase();
  const isColTerm =
    rawDigits.includes('تحصيل') ||
    rawDigits.includes('سداد') ||
    rawDigits.includes('سدادات') ||
    rawDigits.includes('المحصل') ||
    rawDigits.includes('المسدد') ||
    rawDigits.includes('محصل') ||
    rawDigits.includes('مسدد') ||
    rawDigits.includes('coll') ||
    rawDigits.includes('paid') ||
    rawDigits.includes('payment');
  if (!isColTerm) return false;

  // If header explicitly refers to previous years without month, skip
  if ((rawDigits.includes('2025') || rawDigits.includes('2024')) && !rawDigits.includes(String(m)) && !MONTH_NAMES_MAP[m]?.some((p) => rawDigits.includes(p))) {
    return false;
  }

  const mPatterns = MONTH_NAMES_MAP[m] || [];
  if (mPatterns.some((p) => rawDigits.includes(p))) return true;

  // Strip 4-digit years like 2026, 2025, 2024 so they don't block regex matching
  const h = rawDigits.replace(/202[4-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const mStr = String(m);

  // Regexes for combinations like:
  // "تحصيل 1", "1 تحصيل", "1تحصيل", "تحصيل1", "تحصيلات 1", "1 تحصيلات", "1تحصيلات", "تحصيل 2026 1", "تحصيلات 2026 شهر 1", "تحصيل ش1", "تحصيل ش 1", "ش 1 تحصيل", "سداد 1", "1 سداد", "1سداد"
  const numRegexes = [
    new RegExp(`(?<!\\d)0?${mStr}(?!\\d)[^\\d]*(?:تحصيل|تحصيلات|سداد|سدادات)`),
    new RegExp(`(?:تحصيل|تحصيلات|سداد|سدادات)[^\\d]*(?<!\\d)0?${mStr}(?!\\d)`),
    new RegExp(`(?:ش|شهر)\\s*0?${mStr}(?!\\d)[^\\d]*(?:تحصيل|تحصيلات|سداد|سدادات)`),
    new RegExp(`(?:تحصيل|تحصيلات|سداد|سدادات)[^\\d]*(?:ش|شهر)\\s*0?${mStr}(?!\\d)`),
    new RegExp(`(?<!\\d)0?${mStr}(?!\\d)`),
    new RegExp(`ش\\s*0?${mStr}(?!\\d)`),
    new RegExp(`شهر\\s*0?${mStr}(?!\\d)`),
    new RegExp(`m0?${mStr}(?!\\d)`),
    new RegExp(`month\\s*0?${mStr}(?!\\d)`),
  ];
  if (numRegexes.slice(0, 4).some((r) => r.test(h))) return true;

  // If it's a collection term and the only number in the string is m:
  const numbers = h.match(/\d+/g);
  if (numbers && numbers.length === 1 && parseInt(numbers[0], 10) === m) {
    return true;
  }

  return numRegexes.some((r) => r.test(h));
}

export function matchMonthlySalesHeader(rawH: string, m: number): boolean {
  if (matchTotalSalesHeader(rawH)) return false;

  const rawDigits = normalizeHeaderDigits(rawH).toLowerCase();
  if (rawDigits.includes('تحصيل') || rawDigits.includes('سداد') || rawDigits.includes('coll')) return false;

  const isSalesTerm =
    rawDigits.includes('بيع') ||
    rawDigits.includes('بيعات') ||
    rawDigits.includes('مبيعات') ||
    rawDigits.includes('مبيعة') ||
    rawDigits.includes('فواتير') ||
    rawDigits.includes('فاتورة') ||
    rawDigits.includes('sales') ||
    rawDigits.includes('sale') ||
    rawDigits.includes('inv');

  if (!isSalesTerm) return false;

  // If header explicitly refers to 2025 without month, skip
  if ((rawDigits.includes('2025') || rawDigits.includes('2024')) && !rawDigits.includes(String(m)) && !MONTH_NAMES_MAP[m]?.some((p) => rawDigits.includes(p))) {
    return false;
  }

  const mPatterns = MONTH_NAMES_MAP[m] || [];
  const hasMonthName = mPatterns.some((p) => rawDigits.includes(p));
  if (isSalesTerm && hasMonthName) return true;

  // Strip 4-digit years like 2026, 2025, 2024 so they don't block regex matching
  const h = rawDigits.replace(/202[4-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const mStr = String(m);

  // Regexes for combinations like:
  // "مبيعات 1", "1 مبيعات", "1مبيعات", "مبيعات1", "بيع 1", "1 بيع", "1بيع", "بيع1", "مبيعات ش1", "مبيعات ش 1", "ش 1 مبيعات"
  const numRegexes = [
    new RegExp(`(?<!\\d)0?${mStr}(?!\\d)[^\\d]*(?:مبيعات|بيعات|مبيعة|بيع)`),
    new RegExp(`(?:مبيعات|بيعات|مبيعة|بيع)[^\\d]*(?<!\\d)0?${mStr}(?!\\d)`),
    new RegExp(`(?:ش|شهر)\\s*0?${mStr}(?!\\d)[^\\d]*(?:مبيعات|بيعات|مبيعة|بيع)`),
    new RegExp(`(?:مبيعات|بيعات|مبيعة|بيع)[^\\d]*(?:ش|شهر)\\s*0?${mStr}(?!\\d)`),
  ];
  if (numRegexes.some((r) => r.test(h))) return true;

  // If it's a sales term and the only number in the string is m:
  const numbers = h.match(/\d+/g);
  if (numbers && numbers.length === 1 && parseInt(numbers[0], 10) === m) {
    return true;
  }

  // Standalone month name or number under a sales parent header
  const isExactMonth = mPatterns.some((p) => h === p || h === `شهر ${p}` || h === `ش ${p}`);
  if (isExactMonth) return true;

  if (isSalesTerm && (new RegExp(`شهر\\s*0?${mStr}(?!\\d)`).test(h) || new RegExp(`ش\\s*0?${mStr}(?!\\d)`).test(h))) {
    return true;
  }

  return false;
}

/**
 * Parse rich raw rows from Excel or Google Sheet to Customer models
 * Supporting 2025/2026 totals, monthly 1-12 sales and collections, regions, and visits
 */
export function parseRowsToDetailedCustomers(rawRows: any[][]): {
  customers: Customer[];
  errors: string[];
  totalRows: number;
  duplicatesCount?: number;
} {
  const errors: string[] = [];
  if (!rawRows || rawRows.length < 2) {
    return { customers: [], errors: ['الملف فارغ أو لا يحتوي على صفوف صالحة.'], totalRows: 0, duplicatesCount: 0 };
  }

  // 1. Locate header row
  let headerRowIdx = -1;
  let bestHeaderScore = 0;
  for (let r = 0; r < Math.min(rawRows.length, 12); r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row)) continue;
    let score = 0;
    row.forEach((cell) => {
      const txt = normalizeHeaderDigits(normalizeArabicText(String(cell || ''))).toLowerCase();
      if (!txt) return;
      if (txt.includes('عميل') || txt.includes('اسم') || txt.includes('customer') || txt.includes('client')) score += 5;
      if (txt.includes('كود') || txt.includes('code') || txt.includes('id')) score += 5;
      if (txt.includes('مبيعات') || txt.includes('بيع') || txt.includes('sales')) score += 4;
      if (txt.includes('تحصيل') || txt.includes('سداد') || txt.includes('collections')) score += 4;
      if (txt.includes('رصيد') || txt.includes('مديون') || txt.includes('balance') || txt.includes('debt')) score += 4;
      if (txt.includes('فرع') || txt.includes('مندوب') || txt.includes('branch') || txt.includes('rep')) score += 3;
      if (txt.includes('ضمان') || txt.includes('ائتمان') || txt.includes('دفع') || txt.includes('سداد')) score += 3;
    });
    if (score > bestHeaderScore) {
      bestHeaderScore = score;
      headerRowIdx = r;
    }
  }

  if (headerRowIdx === -1) headerRowIdx = 0;

  // Check if next row contains sub-headers (common in merged tables: Parent "المبيعات", Child "يناير" "فبراير"...)
  const mainHeaderRow = rawRows[headerRowIdx] || [];
  const nextHeaderRow = rawRows[headerRowIdx + 1] || [];
  const nextRowJoined = nextHeaderRow.map((c) => normalizeArabicText(String(c || ''))).join(' ');

  let nextRowNumericMonthsCount = 0;
  for (let m = 1; m <= 12; m++) {
    if (
      nextHeaderRow.some((c) => {
        const s = normalizeHeaderDigits(String(c || '')).trim();
        return s === String(m) || s === `0${m}` || s === `ش${m}` || s === `شهر ${m}` || MONTH_NAMES_MAP[m]?.some((name) => s.includes(name));
      })
    ) {
      nextRowNumericMonthsCount++;
    }
  }

  const hasSubHeaders =
    nextRowNumericMonthsCount >= 2 ||
    nextRowJoined.includes('يناير') ||
    nextRowJoined.includes('فبراير') ||
    nextRowJoined.includes('تحصيل') ||
    nextRowJoined.includes('مبيعات') ||
    nextRowJoined.includes('شهر');

  let activeCategory = '';
  const headers = mainHeaderRow.map((h, colIdx) => {
    let parent = normalizeHeaderDigits(normalizeArabicText(String(h || ''))).trim();
    if (parent) {
      activeCategory = parent;
    } else if (hasSubHeaders && activeCategory) {
      parent = activeCategory;
    }
    const sub = hasSubHeaders ? normalizeHeaderDigits(normalizeArabicText(String(nextHeaderRow[colIdx] || ''))).trim() : '';
    return `${parent} ${sub}`.trim();
  });

  const dataStartRow = hasSubHeaders ? headerRowIdx + 2 : headerRowIdx + 1;

  // Col indices
  const colMap = {
    code: -1,
    name: -1,
    phone: -1,
    address: -1,
    region: -1,
    governorate: -1,
    branch: -1,
    rep: -1,
    supervisor: -1,
    tier: -1,
    creditLimit: -1,
    currentBalance: -1,
    totalOverdueAndDue: -1,
    annualTarget: -1,
    openingBalance2026: -1,
    sales2025: -1,
    sales2026: -1,
    collections2025: -1,
    collections2026: -1,
    hasDealt2026: -1,
    lastVisitDate: -1,
    visitCount: -1,
    guaranteeDocs: -1,
    paymentTerms: -1,
    monthlySales: {} as Record<number, number>, // month 1-12
    monthlyCollections: {} as Record<number, number>, // month 1-12
  };

  headers.forEach((h, idx) => {
    if (!h) return;

    // Month detection for Sales & Collections (iterating from 12 down to 1 so 10, 11, 12 take precedence)
    for (let m = 12; m >= 1; m--) {
      if (colMap.monthlyCollections[m] === undefined && matchMonthlyCollectionHeader(h, m)) {
        colMap.monthlyCollections[m] = idx;
        break;
      } else if (colMap.monthlySales[m] === undefined && matchMonthlySalesHeader(h, m)) {
        colMap.monthlySales[m] = idx;
        break;
      }
    }

    // 0. Explicit Rep detection FIRST (to prevent rep name being confused with customer name)
    if (
      colMap.rep === -1 &&
      (h.includes('المندوب الحالي') ||
        h.includes('مندوب') ||
        h.includes('المندوب') ||
        h.includes('بائع') ||
        h.includes('مسؤول البيع') ||
        h.includes('مسئول البيع') ||
        h.includes('sales rep') ||
        h.includes('rep'))
    ) {
      colMap.rep = idx;
    }
    // 1. Code
    else if (
      colMap.code === -1 &&
      (h.includes('كود العميل') ||
        h.includes('كود المحل') ||
        h.includes('كود الحساب') ||
        h.includes('كود') ||
        h === 'الكود' ||
        h.includes('code') ||
        h === 'id')
    ) {
      colMap.code = idx;
    }
    // 2. Name
    else if (
      colMap.name === -1 &&
      (h.includes('account name') ||
        h.includes('customer name') ||
        h.includes('اسم العميل') ||
        h.includes('اسم المحل') ||
        h.includes('اسم الحساب') ||
        h.includes('العميل') ||
        h === 'الاسم' ||
        h.includes('customer') ||
        h.includes('client'))
    ) {
      colMap.name = idx;
    }
    // 3. Phone
    else if (
      colMap.phone === -1 &&
      (h.includes('تليفون') || h.includes('هاتف') || h.includes('موبايل') || h.includes('محمول') || h.includes('phone') || h.includes('mobile'))
    ) {
      colMap.phone = idx;
    }
    // 4. Region / Area
    else if (
      colMap.region === -1 &&
      (h.includes('منطقة') || h.includes('منطقه') || h.includes('حي') || h.includes('مركز') || h.includes('المركز') || h.includes('الخط') || h.includes('region') || h.includes('area') || h.includes('zone'))
    ) {
      colMap.region = idx;
    }
    // 5. Address
    else if (
      colMap.address === -1 &&
      (h.includes('عنوان') || h.includes('العنوان') || h.includes('address') || h.includes('شارع'))
    ) {
      colMap.address = idx;
    }
    // 6. Governorate
    else if (
      colMap.governorate === -1 &&
      (h.includes('محافظة') || h.includes('محافظه') || h.includes('gov'))
    ) {
      colMap.governorate = idx;
    }
    // 7. Branch
    else if (
      colMap.branch === -1 &&
      (h.includes('فرع') || h.includes('الفرع') || h.includes('branch'))
    ) {
      colMap.branch = idx;
    }
    // 8. Supervisor
    else if (
      colMap.supervisor === -1 &&
      (h.includes('مشرف') || h.includes('المشرف') || h.includes('supervisor'))
    ) {
      colMap.supervisor = idx;
    }
    // 9. Annual Target
    else if (
      colMap.annualTarget === -1 &&
      (h.includes('الهدف السنوي') || h.includes('الهدف') || h.includes('تارجت') || h.includes('target'))
    ) {
      colMap.annualTarget = idx;
    }
    // 10. Opening Balance 2026
    else if (
      colMap.openingBalance2026 === -1 &&
      (h.includes('اول المدة 2026') || h.includes('اول المده') || h.includes('رصيد اول المده') || h.includes('رصيد افتتاحي') || h.includes('opening balance'))
    ) {
      colMap.openingBalance2026 = idx;
    }
    // 11. Overdue & Due Total
    else if (
      colMap.totalOverdueAndDue === -1 &&
      (h.includes('اجمالي المتأخرات') ||
        h.includes('إجمالي المتأخرات') ||
        h.includes('اجمالي المتاخرات') ||
        h.includes('المتأخرات') ||
        h.includes('المتاخرات') ||
        h.includes('مستحق حتي') ||
        h.includes('مستحق حتى') ||
        h.includes('overdue'))
    ) {
      colMap.totalOverdueAndDue = idx;
    }
    // 12. 2025 Sales
    else if (
      colMap.sales2025 === -1 &&
      (h.includes('2025') && (h.includes('بيع') || h.includes('مبيعات')))
    ) {
      colMap.sales2025 = idx;
    }
    // 13. 2025 Collections
    else if (
      colMap.collections2025 === -1 &&
      (h.includes('2025') && (h.includes('تحصيل') || h.includes('سداد')))
    ) {
      colMap.collections2025 = idx;
    }
    // 14. 2026 Total Sales (Flexible: matches "اجمالي المبيعات", "اجمالي بيعات", "مبيعات 2026", "المبيعات", "مبيعات", "صافي المبيعات")
    else if (
      colMap.sales2026 === -1 &&
      !Object.values(colMap.monthlySales).includes(idx) &&
      matchTotalSalesHeader(h)
    ) {
      colMap.sales2026 = idx;
    }
    // 15. 2026 Total Collections (Flexible: matches "اجمالي التحصيلات", "اجمالي تحصيل", "تحصيلات 2026", "تحصيلات", "تحصيل")
    else if (
      colMap.collections2026 === -1 &&
      !Object.values(colMap.monthlyCollections).includes(idx) &&
      matchTotalCollectionsHeader(h)
    ) {
      colMap.collections2026 = idx;
    }
    // 16. Debt / Current Balance
    else if (
      colMap.currentBalance === -1 &&
      !h.includes('حد') &&
      !h.includes('ائتمان') &&
      (h.includes('مديونية العميل') ||
        h.includes('مديونيه العميل') ||
        h.includes('المديونيه') ||
        h.includes('المديونية') ||
        h.includes('مديونية') ||
        h.includes('مديونيه') ||
        h.includes('الرصيد الحالي') ||
        h.includes('رصيد العميل') ||
        h.includes('صافي الحساب') ||
        h.includes('current balance') ||
        h.includes('balance') ||
        h.includes('debt') ||
        h === 'الرصيد' ||
        h === 'رصيد' ||
        h === 'المستحق' ||
        h === 'عليه')
    ) {
      colMap.currentBalance = idx;
    }
    // 17. Credit Limit
    else if (
      colMap.creditLimit === -1 &&
      (h.includes('حد ائتماني') ||
        h.includes('حد الائتمان') ||
        h.includes('الحد الائتماني') ||
        h.includes('الحد الائتمانى') ||
        h.includes('الحد المسموح') ||
        h.includes('الائتمان') ||
        h.includes('credit limit'))
    ) {
      colMap.creditLimit = idx;
    }
    // 18. Visit Date
    else if (
      colMap.lastVisitDate === -1 &&
      (h.includes('تاريخ الزيارة') || h.includes('اخر زيارة') || h.includes('الزيارة') || h.includes('visit date'))
    ) {
      colMap.lastVisitDate = idx;
    }
    // 19. Visit Count
    else if (
      colMap.visitCount === -1 &&
      (h.includes('عدد الزيارات') || h.includes('مرات الزيارة') || h.includes('زيارات'))
    ) {
      colMap.visitCount = idx;
    }
    // 20. Dealing Status in 2026
    else if (
      colMap.hasDealt2026 === -1 &&
      (h.includes('متعامل 2026') || h.includes('تعامل 2026') || h.includes('متعامل') || h.includes('حالة العميل') || h.includes('حاله العميل'))
    ) {
      colMap.hasDealt2026 = idx;
    }
    // 21. Guarantee Documents (أوراق الضمان)
    else if (
      colMap.guaranteeDocs === -1 &&
      (h.includes('ضمان') ||
        h.includes('أوراق الضمان') ||
        h.includes('اوراق الضمان') ||
        h.includes('ورقة الضمان') ||
        h.includes('ورقه الضمان') ||
        h.includes('شيك') ||
        h.includes('كمبيالة') ||
        h.includes('كمبياله') ||
        h.includes('إيصال أمانة') ||
        h.includes('ايصال امانة') ||
        h.includes('رهن') ||
        h.includes('guarantee'))
    ) {
      colMap.guaranteeDocs = idx;
    }
    // 22. Payment Terms (طرق الدفع / شروط السداد)
    else if (
      colMap.paymentTerms === -1 &&
      (h.includes('طرق الدفع') ||
        h.includes('طريقة الدفع') ||
        h.includes('طريقه الدفع') ||
        h.includes('نظام الدفع') ||
        h.includes('شروط الدفع') ||
        h.includes('شروط السداد') ||
        h.includes('طريقة السداد') ||
        h.includes('طرق السداد') ||
        h.includes('payment terms') ||
        h.includes('payment method'))
    ) {
      colMap.paymentTerms = idx;
    }
  });

  const getCellStr = (row: any[], cIdx: number) => {
    if (cIdx === -1 || cIdx >= row.length) return '';
    const v = row[cIdx];
    return v !== null && v !== undefined ? String(v).trim() : '';
  };

  const rawCustomers: Customer[] = [];
  let processedRows = 0;

  for (let r = dataStartRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
      continue;
    }

    processedRows++;

    const rawCode = getCellStr(row, colMap.code);
    const rawName = getCellStr(row, colMap.name);
    const rawPhone = getCellStr(row, colMap.phone);
    const rawAddress = getCellStr(row, colMap.address);
    const rawRegion = getCellStr(row, colMap.region);
    const rawGov = getCellStr(row, colMap.governorate);
    const rawBranch = getCellStr(row, colMap.branch);
    const rawRep = getCellStr(row, colMap.rep);
    const rawSupervisor = getCellStr(row, colMap.supervisor);
    const rawLastVisit = getCellStr(row, colMap.lastVisitDate);
    const rawGuarantee = colMap.guaranteeDocs !== -1 ? getCellStr(row, colMap.guaranteeDocs) : '';

    // Skip purely blank rows without any customer data
    if (!rawName && !rawCode && !rawPhone && !rawBranch && !rawRep && !rawAddress) continue;

    const assignedCode = rawCode || `CUST-${1000 + rawCustomers.length + 1}`;
    const cleanCode = assignedCode.toLowerCase().trim();

    // Financials
    const balance = colMap.currentBalance !== -1 ? cleanNumber(row[colMap.currentBalance]) : 0;
    const creditLimit = colMap.creditLimit !== -1 ? cleanNumber(row[colMap.creditLimit]) : 0;
    const s2025 = colMap.sales2025 !== -1 ? cleanNumber(row[colMap.sales2025]) : 0;
    // Collections in accounting sheets are often negative: convert to absolute positive
    const c2025 = colMap.collections2025 !== -1 ? Math.abs(cleanNumber(row[colMap.collections2025])) : 0;
    const overdueAndDue = colMap.totalOverdueAndDue !== -1 ? cleanNumber(row[colMap.totalOverdueAndDue]) : balance;
    const annualTarget = colMap.annualTarget !== -1 ? cleanNumber(row[colMap.annualTarget]) : 0;
    const openingBalance = colMap.openingBalance2026 !== -1 ? cleanNumber(row[colMap.openingBalance2026]) : balance;

    // Monthly 2026 breakdown
    const monthlySales: Record<number, number> = {};
    const monthlyCollections: Record<number, number> = {};
    let computedSales2026 = 0;
    let computedCollections2026 = 0;

    for (let m = 1; m <= 12; m++) {
      if (colMap.monthlySales[m] !== undefined && colMap.monthlySales[m] > -1) {
        const val = cleanNumber(row[colMap.monthlySales[m]]);
        if (val > 0) {
          monthlySales[m] = val;
          computedSales2026 += val;
        }
      }
      if (colMap.monthlyCollections[m] !== undefined && colMap.monthlyCollections[m] > -1) {
        // Collections are converted to positive numbers even if negative in source
        const val = Math.abs(cleanNumber(row[colMap.monthlyCollections[m]]));
        if (val > 0) {
          monthlyCollections[m] = val;
          computedCollections2026 += val;
        }
      }
    }

    const explicitSales2026 = colMap.sales2026 !== -1 ? cleanNumber(row[colMap.sales2026]) : 0;
    const finalSales2026 = Math.max(explicitSales2026, computedSales2026);

    // Explicit collections 2026 converted to positive
    const explicitCollections2026 = colMap.collections2026 !== -1 ? Math.abs(cleanNumber(row[colMap.collections2026])) : 0;
    // Prefer the explicit sheet total when available (> 0); fall back to computed monthly sum only
    // when there is no explicit column or its value is missing/empty. This prevents the system
    // from over-calculating when monthly column matching picks up extra columns.
    const finalCollections2026 = explicitCollections2026 > 0 ? explicitCollections2026 : computedCollections2026;

    // Guarantee docs logic:
    // لو كبر من صفر يبقي ماضي علي ورق ضمان بالمبلغ ده
    // لو 0 او مافيش يبق لا يوجد ورق ضمان
    const rawGuaranteeVal = colMap.guaranteeDocs !== -1 ? row[colMap.guaranteeDocs] : '';
    const rawGuaranteeStr = getCellStr(row, colMap.guaranteeDocs);
    const parsedGuaranteeAmt = colMap.guaranteeDocs !== -1 ? Math.abs(cleanNumber(rawGuaranteeVal, 0)) : 0;

    let finalGuaranteeAmount = parsedGuaranteeAmt;
    let finalGuaranteeDocs = 'لا يوجد ورق ضمان';
    let finalHasGuarantee = false;

    if (finalGuaranteeAmount > 0) {
      finalGuaranteeDocs = `ماضي على ورق ضمان (${finalGuaranteeAmount.toLocaleString('en-US')} ج.م)`;
      finalHasGuarantee = true;
    } else {
      const numInStr = cleanNumber(rawGuaranteeStr, 0);
      if (numInStr > 0) {
        finalGuaranteeAmount = numInStr;
        finalGuaranteeDocs = `ماضي على ورق ضمان (${numInStr.toLocaleString('en-US')} ج.م)`;
        finalHasGuarantee = true;
      } else if (
        rawGuaranteeStr &&
        rawGuaranteeStr !== '0' &&
        !rawGuaranteeStr.includes('بدون') &&
        !rawGuaranteeStr.includes('لا') &&
        !rawGuaranteeStr.includes('مش') &&
        !rawGuaranteeStr.includes('غير') &&
        (rawGuaranteeStr.includes('ماضي') ||
          rawGuaranteeStr.includes('نعم') ||
          rawGuaranteeStr.includes('شيك') ||
          rawGuaranteeStr.includes('كمبيالة') ||
          rawGuaranteeStr.includes('ايصال') ||
          rawGuaranteeStr.includes('إيصال') ||
          rawGuaranteeStr.includes('رهن'))
      ) {
        finalGuaranteeDocs = rawGuaranteeStr.includes('ماضي') ? rawGuaranteeStr : `ماضي على ورق ضمان (${rawGuaranteeStr})`;
        finalHasGuarantee = true;
      } else {
        finalGuaranteeDocs = 'لا يوجد ورق ضمان';
        finalHasGuarantee = false;
        finalGuaranteeAmount = 0;
      }
    }

    // Payment terms logic: كاش او علي دفعات او شيكات
    const rawPaymentTerms = colMap.paymentTerms !== -1 ? getCellStr(row, colMap.paymentTerms).trim() : '';
    let resolvedPaymentTerms = 'كاش';
    const ptLower = rawPaymentTerms.toLowerCase();
    if (ptLower.includes('شيك') || ptLower.includes('check') || ptLower.includes('cheque')) {
      resolvedPaymentTerms = 'شيكات';
    } else if (
      ptLower.includes('دفع') ||
      ptLower.includes('قسط') ||
      ptLower.includes('أقساط') ||
      ptLower.includes('اقساط') ||
      ptLower.includes('اجل') ||
      ptLower.includes('آجل') ||
      ptLower.includes('installment')
    ) {
      resolvedPaymentTerms = 'على دفعات';
    } else if (ptLower.includes('كاش') || ptLower.includes('نقد') || ptLower.includes('cash')) {
      resolvedPaymentTerms = 'كاش';
    } else if (rawPaymentTerms) {
      resolvedPaymentTerms = rawPaymentTerms;
    }

    // Dealings status
    const rawDealt = colMap.hasDealt2026 !== -1 ? getCellStr(row, colMap.hasDealt2026).toLowerCase() : '';
    const hasDealtIn2026 =
      finalSales2026 > 0 ||
      finalCollections2026 > 0 ||
      rawDealt.includes('متعامل') ||
      rawDealt.includes('نعم') ||
      rawDealt.includes('نشط') ||
      rawDealt.includes('yes') ||
      rawDealt.includes('active');

    const hasPreviousDeals = s2025 > 0 || c2025 > 0 || hasDealtIn2026 || balance > 0;

    let status2026: 'active' | 'inactive' | 'churn_risk' | 'new_customer' = 'inactive';
    if (hasDealtIn2026 && !s2025) {
      status2026 = 'new_customer';
    } else if (hasDealtIn2026) {
      status2026 = 'active';
    } else if (s2025 > 0 && !hasDealtIn2026) {
      status2026 = 'churn_risk';
    } else {
      status2026 = 'inactive';
    }

    const visitsCount = colMap.visitCount !== -1 ? cleanNumber(row[colMap.visitCount]) : (rawLastVisit ? 1 : 0);

    const safeId = `cust-analytics-${cleanCode ? cleanCode.replace(/[^a-zA-Z0-9_-]/g, '_') : 'row'}_r${r}_${rawCustomers.length + 1}`;

    const customerObj: Customer = {
      id: safeId,
      code: assignedCode,
      name: rawName || `عميل رقم ${assignedCode}`,
      storeName: rawName || `محل ${assignedCode}`,
      phone: rawPhone,
      address: rawAddress || (rawRegion ? `${rawRegion} - ${rawGov}` : rawGov),
      region: rawRegion || rawGov || '',
      governorate: rawGov || '',
      branchName: rawBranch || 'الفرع الرئيسي',
      repName: rawRep || '',
      salesRepName: rawRep || '',
      supervisorName: rawSupervisor || '',
      balance: balance,
      currentBalance: balance,
      totalOverdueAndDue: overdueAndDue,
      overdueBalance: overdueAndDue,
      creditLimit: creditLimit,
      annualTarget: annualTarget > 0 ? annualTarget : undefined,
      openingBalance2026: openingBalance,
      sales2025: s2025 > 0 ? s2025 : undefined,
      sales2026: finalSales2026,
      totalMonthlySales: finalSales2026,
      totalOverallSales: finalSales2026,
      collections2025: c2025 > 0 ? c2025 : undefined,
      collections2026: finalCollections2026,
      totalMonthlyCollections: finalCollections2026,
      totalOverallCollections: finalCollections2026,
      monthlySales2026: Object.keys(monthlySales).length > 0 ? monthlySales : undefined,
      monthlyCollections2026: Object.keys(monthlyCollections).length > 0 ? monthlyCollections : undefined,
      hasPreviousDeals: hasPreviousDeals,
      hasDealtIn2026: hasDealtIn2026,
      dealt2026: hasDealtIn2026 ? 'متعامل' : (rawDealt.includes('غير') ? 'غير متعامل' : undefined),
      status2026: status2026,
      guaranteeDocs: finalGuaranteeDocs,
      guaranteeAmount: finalGuaranteeAmount > 0 ? finalGuaranteeAmount : undefined,
      hasGuarantee: finalHasGuarantee,
      paymentTerms: resolvedPaymentTerms,
      lastVisitDate: rawLastVisit || undefined,
      visitCount2026: visitsCount,
      visitHistory: rawLastVisit
        ? [
            {
              id: `v-${safeId}-1`,
              date: rawLastVisit,
              repName: rawRep || 'المندوب',
              type: 'زيارة دورية',
              outcome: hasDealtIn2026 ? 'تم عمل طلبية' : 'متابعة فقط',
            },
          ]
        : [],
    };

    rawCustomers.push(customerObj);
  }

  // Deduplicate by customer code to prevent duplicated customer rows on import
  const uniqueCodeMap = new Map<string, Customer>();
  const withoutCode: Customer[] = [];
  let duplicatesCount = 0;

  rawCustomers.forEach((c) => {
    const cleanCode = (c.code || '').trim().toLowerCase();
    const isAuto = !cleanCode || cleanCode === '---' || cleanCode.startsWith('cust-row-') || cleanCode.startsWith('cust_row_') || cleanCode.startsWith('cust-analytics-');
    if (!isAuto) {
      if (uniqueCodeMap.has(cleanCode)) {
        duplicatesCount++;
        const prev = uniqueCodeMap.get(cleanCode)!;
        uniqueCodeMap.set(cleanCode, {
          ...prev,
          ...c,
          id: prev.id,
          sales2026: Math.max(c.sales2026 || 0, prev.sales2026 || 0),
          collections2026: Math.max(c.collections2026 || 0, prev.collections2026 || 0),
          totalMonthlySales: Math.max(c.totalMonthlySales || 0, prev.totalMonthlySales || 0),
          totalMonthlyCollections: Math.max(c.totalMonthlyCollections || 0, prev.totalMonthlyCollections || 0),
          creditLimit: Math.max(c.creditLimit || 0, prev.creditLimit || 0),
          guaranteeDocs: c.guaranteeDocs && !c.guaranteeDocs.includes('لا يوجد') ? c.guaranteeDocs : prev.guaranteeDocs,
          guaranteeAmount: Math.max(c.guaranteeAmount || 0, prev.guaranteeAmount || 0),
          hasGuarantee: c.hasGuarantee || prev.hasGuarantee,
          paymentTerms: c.paymentTerms || prev.paymentTerms,
        });
      } else {
        uniqueCodeMap.set(cleanCode, c);
      }
    } else {
      withoutCode.push(c);
    }
  });

  const finalCustomers = [...Array.from(uniqueCodeMap.values()), ...withoutCode];

  return {
    customers: finalCustomers,
    errors,
    totalRows: processedRows,
    duplicatesCount,
  };
}

/**
 * Fetch and parse detailed customers live from Google Sheets URL
 */
export async function fetchDetailedCustomersFromGoogleSheet(urlOrId: string): Promise<{
  customers: Customer[];
  errors: string[];
  totalRows: number;
  duplicatesCount?: number;
}> {
  const csvUrl = buildGoogleSheetsPublicCsvUrl(urlOrId);
  if (!csvUrl) {
    throw new Error('رابط Google Sheets غير صالح. يرجى التأكد من نسخ رابط الشيت كاملاً.');
  }

  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(
      `تعذر جلب الشيت (كود ${response.status}). يرجى التأكد من أن الشيت متاح للعامة (Anyone with the link can view).`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const csvText = decodeBufferSmart(arrayBuffer).replace(/^\uFEFF/, '');
  if (!csvText || csvText.trim().length === 0) {
    throw new Error('تم جلب الشيت لكنه لا يحتوي على أي بيانات.');
  }

  const workbook = XLSX.read(csvText, { type: 'string', codepage: 65001 });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  return parseRowsToDetailedCustomers(rawRows);
}

/**
 * Parse Excel file directly
 */
export async function parseDetailedCustomersExcel(file: File): Promise<{
  customers: Customer[];
  errors: string[];
  totalRows: number;
  duplicatesCount?: number;
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = parseExcelOrCsvBuffer(buffer, file.name);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        resolve(parseRowsToDetailedCustomers(rawRows));
      } catch (err: any) {
        resolve({
          customers: [],
          errors: [`فشل في قراءة ملف الإكسل: ${err?.message || 'خطأ غير معروف'}`],
          totalRows: 0,
        });
      }
    };
    reader.onerror = () => {
      resolve({
        customers: [],
        errors: ['حدث خطأ أثناء قراءة ملف الإكسل من الجهاز'],
        totalRows: 0,
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Export Customer Analytics to Multi-Tab Rich Excel Report
 */
export function exportCustomerAnalyticsToExcel(
  customers: Customer[],
  fileName = 'تحليل_كافة_العملاء_2026'
): void {
  const wb = XLSX.utils.book_new();

  // Tab 1: Comprehensive Customer 360 & Monthly Breakdown
  const headers = [
    'كود العميل',
    'اسم العميل / المحل',
    'الفرع',
    'المندوب المسؤول',
    'المشرف',
    'المنطقة / الحي',
    'رقم الهاتف',
    'المديونية الحالية (ج.م)',
    'المستحقات والمتأخرات (ج.م)',
    'الحد الائتماني (ج.م)',
    'أوراق الضمان',
    'مبيعات 2025',
    'مبيعات 2026',
    'نسبة نمو المبيعات %',
    'تحصيلات 2025',
    'تحصيلات 2026',
    'نسبة التحصيل 2026 %',
    'هل تعامل في 2026؟',
    'حالة النشاط',
    'تاريخ آخر زيارة',
    'عدد الزيارات 2026',
    // Monthly Sales
    'مبيعات يناير 2026',
    'مبيعات فبراير 2026',
    'مبيعات مارس 2026',
    'مبيعات إبريل 2026',
    'مبيعات مايو 2026',
    'مبيعات يونيو 2026',
    'مبيعات يوليو 2026',
    'مبيعات أغسطس 2026',
    'مبيعات سبتمبر 2026',
    'مبيعات أكتوبر 2026',
    'مبيعات نوفمبر 2026',
    'مبيعات ديسمبر 2026',
    // Monthly Collections
    'تحصيل يناير 2026',
    'تحصيل فبراير 2026',
    'تحصيل مارس 2026',
    'تحصيل إبريل 2026',
    'تحصيل مايو 2026',
    'تحصيل يونيو 2026',
    'تحصيل يوليو 2026',
    'تحصيل أغسطس 2026',
    'تحصيل سبتمبر 2026',
    'تحصيل أكتوبر 2026',
    'تحصيل نوفمبر 2026',
    'تحصيل ديسمبر 2026',
  ];

  const rows = customers.map((c) => {
    const s25 = c.sales2025 || 0;
    const s26 = c.sales2026 || 0;
    const growth = s25 > 0 ? Math.round(((s26 - s25) / s25) * 100) : (s26 > 0 ? 100 : 0);
    const col25 = c.collections2025 || 0;
    const col26 = c.collections2026 || 0;
    const colRate = s26 > 0 ? Math.round((col26 / s26) * 100) : (col26 > 0 ? 100 : 0);

    const mSales = c.monthlySales2026 || {};
    const mCols = c.monthlyCollections2026 || {};

    return [
      c.code || '---',
      c.name,
      c.branchName || '',
      c.salesRepName || c.repName || '',
      c.supervisorName || '',
      c.region || c.governorate || '',
      c.phone || '',
      c.currentBalance ?? c.balance ?? 0,
      c.totalOverdueAndDue ?? c.overdueBalance ?? 0,
      c.creditLimit || 0,
      c.guaranteeDocs || (c.creditLimit && c.creditLimit > 0 ? 'شيك بنكي' : 'بدون ضمان'),
      s25,
      s26,
      `${growth}%`,
      col25,
      col26,
      `${colRate}%`,
      c.hasDealtIn2026 ? 'نعم' : 'لا',
      c.status2026 === 'active' ? 'نشط' : c.status2026 === 'churn_risk' ? 'مهدد بالتوقف' : c.status2026 === 'new_customer' ? 'عميل جديد' : 'متوقف',
      c.lastVisitDate || '---',
      c.visitCount2026 || 0,
      // 12 months sales
      mSales[1] || 0,
      mSales[2] || 0,
      mSales[3] || 0,
      mSales[4] || 0,
      mSales[5] || 0,
      mSales[6] || 0,
      mSales[7] || 0,
      mSales[8] || 0,
      mSales[9] || 0,
      mSales[10] || 0,
      mSales[11] || 0,
      mSales[12] || 0,
      // 12 months collections
      mCols[1] || 0,
      mCols[2] || 0,
      mCols[3] || 0,
      mCols[4] || 0,
      mCols[5] || 0,
      mCols[6] || 0,
      mCols[7] || 0,
      mCols[8] || 0,
      mCols[9] || 0,
      mCols[10] || 0,
      mCols[11] || 0,
      mCols[12] || 0,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!views'] = [{ RTL: true }];
  ws['!sheetView'] = [{ rightToLeft: true }];

  XLSX.utils.book_append_sheet(wb, ws, 'تحليل_كافة_العملاء');
  XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Generate a ready-to-fill Excel template for Customer Monthly Analysis
 */
export function downloadCustomerAnalyticsTemplate(): void {
  const sampleData: Customer[] = [
    {
      id: 'sample-cust-1',
      code: '1001',
      name: 'سوبر ماركت الإيمان والبركة',
      branchName: 'فرع المنيا',
      repName: 'محمد أحمد علي',
      region: 'بندر المنيا - حي شلبي',
      phone: '01012345678',
      currentBalance: 12500,
      creditLimit: 50000,
      sales2025: 180000,
      sales2026: 220000,
      collections2025: 175000,
      collections2026: 210000,
      hasDealtIn2026: true,
      status2026: 'active',
      lastVisitDate: '2026-02-15',
      visitCount2026: 4,
      monthlySales2026: { 1: 110000, 2: 110000 },
      monthlyCollections2026: { 1: 105000, 2: 105000 },
    },
    {
      id: 'sample-cust-2',
      code: '1002',
      name: 'معرض الأهرام للأدوات',
      branchName: 'فرع الفيوم',
      repName: 'محمود عبد الرحيم',
      region: 'شارع البحر - الفيوم',
      phone: '01198765432',
      currentBalance: 0,
      creditLimit: 35000,
      sales2025: 95000,
      sales2026: 0,
      collections2025: 95000,
      collections2026: 0,
      hasDealtIn2026: false,
      status2026: 'churn_risk',
      lastVisitDate: '2025-11-20',
      visitCount2026: 0,
      monthlySales2026: {},
      monthlyCollections2026: {},
    },
  ];

  exportCustomerAnalyticsToExcel(sampleData, 'قالب_شيت_كافة_العملاء_والتحليل');
}
