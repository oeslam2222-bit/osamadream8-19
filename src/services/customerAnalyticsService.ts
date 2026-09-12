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
 * Safe numeric cleaner
 */
export function cleanNumber(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  let str = String(val).trim();
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    str = str.split(arabicNumerals[i]).join(String(i));
  }
  str = str.replace(/,/g, '').replace(/٬/g, '').replace(/٫/g, '.');
  const clean = str.replace(/[^\d.-]/g, '');
  if (!clean) return fallback;
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Parse rich raw rows from Excel or Google Sheet to Customer models
 * Supporting 2025/2026 totals, monthly 1-12 sales and collections, regions, and visits
 */
export function parseRowsToDetailedCustomers(rawRows: any[][]): {
  customers: Customer[];
  errors: string[];
  totalRows: number;
} {
  const errors: string[] = [];
  if (!rawRows || rawRows.length < 2) {
    return { customers: [], errors: ['الملف فارغ أو لا يحتوي على صفوف صالحة.'], totalRows: 0 };
  }

  // 1. Locate header row
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r];
    if (!row) continue;
    const joined = row.map((c) => normalizeArabicText(String(c || ''))).join(' ');
    if (
      joined.includes('عميل') ||
      joined.includes('اسم') ||
      joined.includes('كود') ||
      joined.includes('مديون') ||
      joined.includes('مبيعات') ||
      joined.includes('رصيد')
    ) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) headerRowIdx = 0;
  const headers = rawRows[headerRowIdx].map((h) => normalizeArabicText(String(h || '')));

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
    sales2025: -1,
    sales2026: -1,
    collections2025: -1,
    collections2026: -1,
    hasDealt2026: -1,
    lastVisitDate: -1,
    visitCount: -1,
    monthlySales: {} as Record<number, number>, // month 1-12
    monthlyCollections: {} as Record<number, number>, // month 1-12
  };

  headers.forEach((h, idx) => {
    if (!h) return;

    // Month detection for Sales & Collections
    for (let m = 1; m <= 12; m++) {
      const arMonth = normalizeArabicText(MONTH_NAMES_AR[m - 1]);
      // Sales month check
      if (
        (h.includes('بيع') || h.includes('مبيعات')) &&
        (h.includes(arMonth) || h.includes(`شهر ${m}`) || h.includes(`ش ${m}`) || h.endsWith(` ${m}`))
      ) {
        colMap.monthlySales[m] = idx;
      }
      // Collections month check
      else if (
        (h.includes('تحصيل') || h.includes('سداد') || h.includes('سدادات')) &&
        (h.includes(arMonth) || h.includes(`شهر ${m}`) || h.includes(`ش ${m}`) || h.endsWith(` ${m}`))
      ) {
        colMap.monthlyCollections[m] = idx;
      }
    }

    // Code
    if (
      colMap.code === -1 &&
      (h.includes('كود العميل') || h.includes('كود') || h === 'الكود' || h.includes('code') || h === 'id')
    ) {
      colMap.code = idx;
    }
    // Name
    else if (
      colMap.name === -1 &&
      (h.includes('اسم العميل') || h.includes('اسم المحل') || h.includes('العميل') || h === 'الاسم' || h.includes('customer') || h.includes('client'))
    ) {
      colMap.name = idx;
    }
    // Phone
    else if (
      colMap.phone === -1 &&
      (h.includes('تليفون') || h.includes('هاتف') || h.includes('موبايل') || h.includes('محمول') || h.includes('phone') || h.includes('mobile'))
    ) {
      colMap.phone = idx;
    }
    // Region / Area
    else if (
      colMap.region === -1 &&
      (h.includes('منطقة') || h.includes('منطقه') || h.includes('حي') || h.includes('حي') || h.includes('مركز') || h.includes('region') || h.includes('area') || h.includes('zone'))
    ) {
      colMap.region = idx;
    }
    // Address
    else if (
      colMap.address === -1 &&
      (h.includes('عنوان') || h.includes('العنوان') || h.includes('address') || h.includes('شارع'))
    ) {
      colMap.address = idx;
    }
    // Governorate
    else if (
      colMap.governorate === -1 &&
      (h.includes('محافظة') || h.includes('محافظه') || h.includes('gov'))
    ) {
      colMap.governorate = idx;
    }
    // Branch
    else if (
      colMap.branch === -1 &&
      (h.includes('فرع') || h.includes('الفرع') || h.includes('branch'))
    ) {
      colMap.branch = idx;
    }
    // Rep
    else if (
      colMap.rep === -1 &&
      (h.includes('مندوب') || h.includes('المندوب') || h.includes('بائع') || h.includes('مسؤول البيع') || h.includes('sales rep') || h.includes('rep'))
    ) {
      colMap.rep = idx;
    }
    // Supervisor
    else if (
      colMap.supervisor === -1 &&
      (h.includes('مشرف') || h.includes('المشرف') || h.includes('supervisor'))
    ) {
      colMap.supervisor = idx;
    }
    // 2025 Sales
    else if (
      colMap.sales2025 === -1 &&
      (h.includes('2025') && (h.includes('بيع') || h.includes('مبيعات')))
    ) {
      colMap.sales2025 = idx;
    }
    // 2026 Sales
    else if (
      colMap.sales2026 === -1 &&
      (h.includes('2026') && (h.includes('بيع') || h.includes('مبيعات')))
    ) {
      colMap.sales2026 = idx;
    }
    // 2025 Collections
    else if (
      colMap.collections2025 === -1 &&
      (h.includes('2025') && (h.includes('تحصيل') || h.includes('سداد')))
    ) {
      colMap.collections2025 = idx;
    }
    // 2026 Collections
    else if (
      colMap.collections2026 === -1 &&
      (h.includes('2026') && (h.includes('تحصيل') || h.includes('سداد')))
    ) {
      colMap.collections2026 = idx;
    }
    // Debt / Balance
    else if (
      colMap.currentBalance === -1 &&
      (h.includes('مديونية') || h.includes('مديونيه') || h.includes('رصيد') || h.includes('مستحق') || h.includes('balance') || h.includes('debt'))
    ) {
      colMap.currentBalance = idx;
    }
    // Credit Limit
    else if (
      colMap.creditLimit === -1 &&
      (h.includes('حد ائتماني') || h.includes('الائتمان') || h.includes('credit limit'))
    ) {
      colMap.creditLimit = idx;
    }
    // Visit Date
    else if (
      colMap.lastVisitDate === -1 &&
      (h.includes('تاريخ الزيارة') || h.includes('اخر زيارة') || h.includes('الزيارة') || h.includes('visit date'))
    ) {
      colMap.lastVisitDate = idx;
    }
    // Visit Count
    else if (
      colMap.visitCount === -1 &&
      (h.includes('عدد الزيارات') || h.includes('مرات الزيارة') || h.includes('زيارات'))
    ) {
      colMap.visitCount = idx;
    }
    // Dealing Status in 2026
    else if (
      colMap.hasDealt2026 === -1 &&
      (h.includes('تعامل 2026') || h.includes('نشط') || h.includes('حالة العميل') || h.includes('حاله العميل'))
    ) {
      colMap.hasDealt2026 = idx;
    }
  });

  const getCellStr = (row: any[], cIdx: number) => {
    if (cIdx === -1 || cIdx >= row.length) return '';
    const v = row[cIdx];
    return v !== null && v !== undefined ? String(v).trim() : '';
  };

  const customers: Customer[] = [];
  let processedRows = 0;

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
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

    // Skip blank rows without name or code
    if (!rawName && !rawCode && !rawPhone) continue;

    const assignedCode = rawCode || `CUST-${1000 + customers.length + 1}`;
    const cleanCode = assignedCode.toLowerCase().trim();

    // Financials
    const balance = colMap.currentBalance !== -1 ? cleanNumber(row[colMap.currentBalance]) : 0;
    const creditLimit = colMap.creditLimit !== -1 ? cleanNumber(row[colMap.creditLimit]) : 0;
    const s2025 = colMap.sales2025 !== -1 ? cleanNumber(row[colMap.sales2025]) : 0;
    const c2025 = colMap.collections2025 !== -1 ? cleanNumber(row[colMap.collections2025]) : 0;

    // Monthly 2026 breakdown
    const monthlySales: Record<number, number> = {};
    const monthlyCollections: Record<number, number> = {};
    let computedSales2026 = 0;
    let computedCollections2026 = 0;

    for (let m = 1; m <= 12; m++) {
      if (colMap.monthlySales[m] !== undefined && colMap.monthlySales[m] > -1) {
        const val = cleanNumber(row[colMap.monthlySales[m]]);
        monthlySales[m] = val;
        computedSales2026 += val;
      }
      if (colMap.monthlyCollections[m] !== undefined && colMap.monthlyCollections[m] > -1) {
        const val = cleanNumber(row[colMap.monthlyCollections[m]]);
        monthlyCollections[m] = val;
        computedCollections2026 += val;
      }
    }

    const explicitSales2026 = colMap.sales2026 !== -1 ? cleanNumber(row[colMap.sales2026]) : 0;
    const finalSales2026 = explicitSales2026 > 0 ? explicitSales2026 : computedSales2026;

    const explicitCollections2026 = colMap.collections2026 !== -1 ? cleanNumber(row[colMap.collections2026]) : 0;
    const finalCollections2026 = explicitCollections2026 > 0 ? explicitCollections2026 : computedCollections2026;

    // Dealings status
    const rawDealt = colMap.hasDealt2026 !== -1 ? getCellStr(row, colMap.hasDealt2026).toLowerCase() : '';
    const hasDealtIn2026 =
      finalSales2026 > 0 ||
      finalCollections2026 > 0 ||
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

    const safeId = `cust-analytics-${cleanCode.replace(/[^a-zA-Z0-9_-]/g, '_')}_r${r}`;

    const customerObj: Customer = {
      id: safeId,
      code: assignedCode,
      name: rawName || `عميل رقم ${assignedCode}`,
      storeName: rawName || `محل ${assignedCode}`,
      phone: rawPhone,
      address: rawAddress,
      region: rawRegion || rawGov || '',
      governorate: rawGov || '',
      branchName: rawBranch || 'الفرع الرئيسي',
      repName: rawRep || '',
      salesRepName: rawRep || '',
      supervisorName: rawSupervisor || '',
      balance: balance,
      currentBalance: balance,
      totalOverdueAndDue: balance,
      creditLimit: creditLimit,
      sales2025: s2025,
      sales2026: finalSales2026,
      collections2025: c2025,
      collections2026: finalCollections2026,
      monthlySales2026: monthlySales,
      monthlyCollections2026: monthlyCollections,
      hasPreviousDeals: hasPreviousDeals,
      hasDealtIn2026: hasDealtIn2026,
      status2026: status2026,
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

    customers.push(customerObj);
  }

  return {
    customers,
    errors,
    totalRows: processedRows,
  };
}

/**
 * Fetch and parse detailed customers live from Google Sheets URL
 */
export async function fetchDetailedCustomersFromGoogleSheet(urlOrId: string): Promise<{
  customers: Customer[];
  errors: string[];
  totalRows: number;
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
    'الحد الائتماني (ج.م)',
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
      c.creditLimit || 0,
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
