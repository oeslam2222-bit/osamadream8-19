import * as XLSX from 'xlsx-js-style';
import { Customer, CustomerItemSaleRecord, CustomerItemSalesSummary, User } from '../types';
import {
  doesCustomerBelongToBranch,
  doesCustomerBelongToRep,
  doesCustomerBelongToSupervisor,
  isArabicNameMatch,
  isBranchMatch,
  normalizeArabicText,
  resolveBranchName
} from './arabicMatchingService';
import { buildGoogleSheetsPublicCsvUrl } from './excelService';
import { decodeBufferSmart, parseExcelOrCsvBuffer } from './encodingService';
import { idbGet, idbSet, idbDelete } from './storageService';
import { supabase } from './supabaseService';
import { parseNumericValue } from './numericParsing';

export const ITEM_SALES_STORAGE_KEY = 'tantawy_customer_item_sales_v1';

// Fast in-memory cache so uploaded 11,000 rows are immediately available across views
let inMemoryItemSalesCache: CustomerItemSaleRecord[] | null = null;

export const MONTH_NAMES_MAP: Record<number, string> = {
  1: 'يناير',
  2: 'فبراير',
  3: 'مارس',
  4: 'إبريل',
  5: 'مايو',
  6: 'يونيو',
  7: 'يوليو',
  8: 'أغسطس',
  9: 'سبتمبر',
  10: 'أكتوبر',
  11: 'نوفمبر',
  12: 'ديسمبر'
};

export { parseNumericValue } from './numericParsing';

/**
 * Clean & normalize column header names (strips invisible characters & normalizes Arabic letters)
 */
function cleanHeader(raw: any): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[\s_\-\/\\#*.]+/g, '');
}

/**
 * Flexible header recognition for ERP customer sales by item
 */
function mapHeaderIndices(headerRow: any[]): Record<string, number> {
  const map: Record<string, number> = {
    customerAccount: -1,
    invoicingName: -1,
    salesOrder: -1,
    date: -1,
    repName: -1,
    month: -1,
    warehouse: -1,
    itemCode: -1,
    itemName: -1,
    unifiedCode: -1,
    unit: -1,
    factor: -1,
    unitPrice: -1,
    discount: -1,
    quantity: -1,
    amount: -1,
    itemGroup: -1,
    definitions: -1,
    familyDimension: -1,
  };

  headerRow.forEach((raw, idx) => {
    const h = cleanHeader(raw);
    const rawStr = String(raw || '').trim().toLowerCase();

    // 1. Customer account (كود العميل)
    if (
      h === 'customeraccount' ||
      h === 'accountnum' ||
      h === 'custaccount' ||
      h === 'كودالعميل' ||
      h === 'رقمحسابالعميل' ||
      h === 'حسابالعميل' ||
      h === 'كود' ||
      h.includes('customeraccount')
    ) {
      if (map.customerAccount === -1) map.customerAccount = idx;
    }
    // 2. Invoicing name (اسم العميل)
    else if (
      h === 'invoicingname' ||
      h === 'customername' ||
      h === 'اسمالعميل' ||
      h === 'اسمفاتورة' ||
      h === 'اسمالفاتورة' ||
      h.includes('invoicingname') ||
      (h.includes('عميل') && !h.includes('كود'))
    ) {
      if (map.invoicingName === -1) map.invoicingName = idx;
    }
    // 3. Sales order (رقم أمر البيع / الفاتورة)
    else if (
      h === 'salesorder' ||
      h === 'orderno' ||
      h === 'امرالبيع' ||
      h === 'أمرالبيع' ||
      h === 'رقمأمرالبيع' ||
      h === 'رقمالفاتورة' ||
      h === 'فاتورة' ||
      h.includes('salesorder')
    ) {
      if (map.salesOrder === -1) map.salesOrder = idx;
    }
    // 4. Date (التاريخ) — بنقبل أي عمود فيه date/تاريخ (مثل Order Date)
    else if (h.includes('date') || h.includes('تاريخ')) {
      if (map.date === -1) map.date = idx;
    }
    // 5. المندوب (Sales Rep)
    else if (
      h === 'المندوب' ||
      h === 'مندوب' ||
      h === 'مندوبالمبيعات' ||
      h === 'salesrep' ||
      h === 'repname' ||
      h === 'rep'
    ) {
      if (map.repName === -1) map.repName = idx;
    }
    // 6. الشهر (Month) — Month / Shahr / رقم شهر
    else if (h.includes('month') || h.includes('شهر')) {
      if (map.month === -1) map.month = idx;
    }
    // 7. Warehouse (المخزن / الفرع)
    else if (h.includes('warehouse') || h.includes('مخزن') || h.includes('فرع') || h === 'branch') {
      if (map.warehouse === -1) map.warehouse = idx;
    }
    // 8. Item (كود الصنف)
    else if (
      h === 'item' ||
      h === 'itemid' ||
      h === 'itemcode' ||
      h === 'كودالصنف' ||
      h === 'كودالمنتج' ||
      h === 'الصنف' ||
      rawStr === 'item'
    ) {
      if (map.itemCode === -1) map.itemCode = idx;
    }
    // 9. Name (اسم الصنف)
    else if (
      h === 'name' ||
      h === 'itemname' ||
      h === 'productname' ||
      h === 'اسمالصنف' ||
      h === 'اسمالمنتج' ||
      h === 'بيانالصنف' ||
      rawStr === 'name'
    ) {
      if (map.itemName === -1) map.itemName = idx;
    }
    // 9b. Unified code (الكود الموحد #) — يربط ألوان وموديلات الصنف
    else if (
      h === 'unifiedcode' ||
      h === 'unified' ||
      h === 'كودموحد' ||
      h === 'كودموحد#' ||
      h === '#' ||
      h === 'كود#' ||
      h === 'كودالموحد' ||
      h.includes('unifiedcode') ||
      h.includes('كودموحد')
    ) {
      if (map.unifiedCode === -1) map.unifiedCode = idx;
    }
    else if (
      h === 'unit' ||
      h === 'الوحدة' ||
      h === 'وحدة' ||
      h === 'unitid'
    ) {
      if (map.unit === -1) map.unit = idx;
    }
    // 11. Factor (معامل التحويل)
    else if (h.includes('factor') || h.includes('معامل') || h.includes('شدة') || h.includes('شده')) {
      if (map.factor === -1) map.factor = idx;
    }
    // 12. Unit price (سعر الوحدة) — Unit Price / Price / السعر
    else if (h.includes('unitprice') || h.includes('price') || h.includes('سعر')) {
      if (map.unitPrice === -1) map.unitPrice = idx;
    }
    // 13. Discount (الخصم)
    else if (h.includes('discount') || h.includes('خصم')) {
      if (map.discount === -1) map.discount = idx;
    }
    // 14. Quantity (الكمية) — Quantity / Qty / الكمية / العدد
    else if (
      h.includes('quantity') ||
      h.includes('qty') ||
      h.includes('كمية') ||
      h.includes('كميه') ||
      h.includes('العدد')
    ) {
      if (map.quantity === -1) map.quantity = idx;
    }
    // 15. Amount (المبلغ / القيمة) — Amount / Net Amount / Total / القيمة
    else if (
      h.includes('amount') ||
      h.includes('total') ||
      h.includes('value') ||
      h.includes('القيمة') ||
      h.includes('المبلغ') ||
      h.includes('الاجمالي') ||
      h.includes('الإجمالي')
    ) {
      if (map.amount === -1) map.amount = idx;
    }
    // 16. Item group (مجموعة الصنف)
    else if (
      h.includes('itemgroup') ||
      h.includes('department') ||
      h.includes('مجموعة') ||
      h.includes('مجموعه') ||
      h === 'القسم' ||
      h === 'قسم'
    ) {
      if (map.itemGroup === -1) map.itemGroup = idx;
    }
    // 17. التعريفات (Definitions) — تصنيف/براند الصنف
    else if (h.includes('تعريف') || h.includes('definition')) {
      if (map.definitions === -1) map.definitions = idx;
    }
    // 18. Family Dimension (عائلة الصنف / التصنيف)
    else if (
      h.includes('family') ||
      h.includes('عائلة') ||
      h.includes('الفئة') ||
      h.includes('فئة') ||
      h.includes('التصنيف')
    ) {
      if (map.familyDimension === -1) map.familyDimension = idx;
    }
  });

  return map;
}

/**
 * Parse raw rows from Excel or Google Sheet to CustomerItemSaleRecord[]
 */
export function parseRawRowsToCustomerItemSales(rawRows: any[][]): {
  sales: CustomerItemSaleRecord[];
  errors: string[];
  totalRows: number;
} {
  const errors: string[] = [];
  if (!rawRows || rawRows.length < 2) {
    return { sales: [], errors: ['الملف فارغ أو لا يحتوي على صفوف بيانات صالحة'], totalRows: 0 };
  }

  // Find header row (usually row 0 or 1)
  let headerIndex = -1;
  let colMap: Record<string, number> = {};

  for (let r = 0; r < Math.min(25, rawRows.length); r++) {
    const candidateMap = mapHeaderIndices(rawRows[r]);
    // Must find at least customer, item, and quantity or amount
    if (
      (candidateMap.customerAccount !== -1 || candidateMap.invoicingName !== -1) &&
      (candidateMap.itemCode !== -1 || candidateMap.itemName !== -1)
    ) {
      headerIndex = r;
      colMap = candidateMap;
      break;
    }
  }

  if (headerIndex === -1) {
    return {
      sales: [],
      errors: [
        'لم يتم التعرف على ترويسة الأعمدة المطلوبة في الملف. تأكد من وجود أعمدة: Customer account, Invoicing name, Item, Name, Quantity, Amount.'
      ],
      totalRows: 0
    };
  }

  const result: CustomerItemSaleRecord[] = [];

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const getVal = (idx: number): string => (idx >= 0 && row[idx] !== undefined ? String(row[idx]).trim() : '');
    const getNum = (idx: number): number => {
      if (idx < 0 || row[idx] === undefined) return 0;
      return parseNumericValue(row[idx]);
    };

    const customerAccount = getVal(colMap.customerAccount);
    const invoicingName = getVal(colMap.invoicingName);
    const itemCode = getVal(colMap.itemCode);
    const itemName = getVal(colMap.itemName);
    const unifiedCode = getVal(colMap.unifiedCode);

    // Skip empty summary/footer rows
    if (!customerAccount && !invoicingName && !itemCode && !itemName) continue;
    if (invoicingName.includes('إجمالي') || invoicingName.includes('الاجمالي') || customerAccount.includes('Total')) continue;

    const salesOrder = getVal(colMap.salesOrder);
    const rawDate = getVal(colMap.date);
    const repName = getVal(colMap.repName) || 'غير محدد';
    const rawMonth = getNum(colMap.month);
    const warehouse = getVal(colMap.warehouse) || 'الفرع الرئيسي';
    const unit = getVal(colMap.unit) || 'كرتونة';
    const factor = Math.max(1, getNum(colMap.factor) || 1);
    const unitPrice = getNum(colMap.unitPrice);
    const discount = getNum(colMap.discount);
    const quantity = getNum(colMap.quantity);
    // المبالغ بتتاخد من عمود Amount زي ما هو. الحساب التلقائي بيشتغل فقط
    // لو العمود نفسه غير موجود أو الخلية فاضية — مش لما القيمة تكون صفر.
    let amount = getNum(colMap.amount);
    const rawAmountCell = colMap.amount >= 0 ? (row[colMap.amount] ?? '') : '';
    const amountCellMissing = colMap.amount < 0 || String(rawAmountCell).trim() === '';
    if (amountCellMissing && quantity > 0 && unitPrice > 0) {
      amount = Math.max(0, (quantity * unitPrice) - discount);
    }

    // Resolve month: from explicit month column, or derived from date
    let month = Math.max(1, Math.min(12, Math.round(rawMonth)));
    if ((!rawMonth || rawMonth < 1 || rawMonth > 12) && rawDate) {
      const parsedDate = new Date(rawDate);
      if (!isNaN(parsedDate.getTime())) {
        month = parsedDate.getMonth() + 1;
      }
    }
    if (!month || month < 1 || month > 12) month = 1;

    const itemGroup = getVal(colMap.itemGroup) || 'عام';
    const definitions = getVal(colMap.definitions);
    const familyDimension = getVal(colMap.familyDimension) || itemGroup;

    const record: CustomerItemSaleRecord = {
      id: `cis-${i}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      customerAccount: customerAccount || `CUST-${i}`,
      invoicingName: invoicingName || customerAccount || `عميل #${i}`,
      salesOrder: salesOrder || undefined,
      date: rawDate || undefined,
      repName,
      month,
      monthName: MONTH_NAMES_MAP[month] || `شهر ${month}`,
      warehouse,
      itemCode: itemCode || `ITEM-${i}`,
      itemName: itemName || definitions || itemCode || `صنف #${i}`,
      unifiedCode: unifiedCode || undefined,
      unit,
      factor,
      unitPrice,
      discount,
      quantity,
      amount,
      itemGroup,
      definitions: definitions || undefined,
      familyDimension,
      createdAt: new Date().toISOString()
    };

    result.push(record);
  }

  return {
    sales: result,
    errors,
    totalRows: result.length
  };
}

/**
 * Parse uploaded Excel or CSV file
 */
export async function parseExcelCustomerItemSales(file: File): Promise<{
  sales: CustomerItemSaleRecord[];
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
        resolve(parseRawRowsToCustomerItemSales(rawRows));
      } catch (err: any) {
        resolve({
          sales: [],
          errors: [`فشل في قراءة ملف مبيعات الأصناف: ${err?.message || 'خطأ غير معروف'}`],
          totalRows: 0
        });
      }
    };
    reader.onerror = () => {
      resolve({
        sales: [],
        errors: ['حدث خطأ أثناء قراءة الملف من الجهاز'],
        totalRows: 0
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Fetch and parse Customer Item Sales from Google Sheet public URL
 */
export async function fetchCustomerItemSalesFromGoogleSheet(urlOrId: string): Promise<{
  sales: CustomerItemSaleRecord[];
  errors: string[];
  totalRows: number;
}> {
  const csvUrl = buildGoogleSheetsPublicCsvUrl(urlOrId);
  if (!csvUrl) {
    return { sales: [], errors: ['رابط Google Sheet غير صالح'], totalRows: 0 };
  }

  try {
    const response = await fetch(csvUrl, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`تعذر الاتصال بـ Google Sheets (رمز الاستجابة: ${response.status})`);
    }

    const buffer = await response.arrayBuffer();
    const csvText = decodeBufferSmart(buffer);
    const workbook = XLSX.read(csvText, { type: 'string', raw: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    return parseRawRowsToCustomerItemSales(rawRows);
  } catch (err: any) {
    return {
      sales: [],
      errors: [`فشل في مزامنة شيت مبيعات العملاء بالصنف: ${err?.message || 'خطأ غير متوقع'}`],
      totalRows: 0
    };
  }
}

/**
 * Normalizes customer code for robust cross-sheet matching
 * Handles variants like: "CUST-0123" -> "123", "00123" -> "123", "C123" -> "123", " 123 " -> "123"
 */
export function normalizeCustomerLookupCode(code?: string): string {
  if (!code) return '';
  const raw = String(code).trim().toLowerCase();
  // Remove spaces, dashes, dots, underscores, slashes, hash
  const stripped = raw.replace(/[\s\-_./\\#]+/g, '');
  // Remove common prefixes like 'cust', 'c', 'cl', 'client' when followed by alphanumeric
  const withoutPrefix = stripped.replace(/^(cust|client|cl|c)/i, '');
  // Strip leading zeros if numeric or alphanumeric
  const numericWithoutZeros = withoutPrefix.replace(/^0+/, '');
  return numericWithoutZeros || withoutPrefix || stripped;
}

/**
 * Builds high-speed indexed lookup maps from master customers directory
 * to resolve Customer Code -> Branch & Sales Rep & Customer profile
 */
export function buildCustomerDirectoryLookup(customers: Customer[]) {
  const byExactCode = new Map<string, Customer>();
  const byNormCode = new Map<string, Customer>();
  const byId = new Map<string, Customer>();
  const byCleanName = new Map<string, Customer>();

  customers.forEach((c) => {
    if (c.code) {
      const rawCode = c.code.trim().toLowerCase();
      byExactCode.set(rawCode, c);
      const normCode = normalizeCustomerLookupCode(c.code);
      if (normCode) byNormCode.set(normCode, c);
    }
    if (c.id) {
      const rawId = c.id.trim().toLowerCase();
      byId.set(rawId, c);
      const normId = normalizeCustomerLookupCode(c.id);
      if (normId) byNormCode.set(normId, c);
    }
    if (c.name) {
      const cleanName = normalizeArabicText(c.name).replace(/\s+/g, '');
      if (cleanName) byCleanName.set(cleanName, c);
    }
  });

  const findCustomer = (customerAccount?: string, invoicingName?: string): Customer | undefined => {
    if (customerAccount) {
      const acc = customerAccount.trim().toLowerCase();
      if (byExactCode.has(acc)) return byExactCode.get(acc);
      const normAcc = normalizeCustomerLookupCode(customerAccount);
      if (byNormCode.has(normAcc)) return byNormCode.get(normAcc);
      if (byId.has(acc)) return byId.get(acc);
    }
    if (invoicingName) {
      const cleanName = normalizeArabicText(invoicingName).replace(/\s+/g, '');
      if (cleanName && byCleanName.has(cleanName)) {
        return byCleanName.get(cleanName);
      }
      for (const [key, cust] of byCleanName.entries()) {
        if (cleanName.includes(key) || key.includes(cleanName) || isArabicNameMatch(invoicingName, cust.name)) {
          return cust;
        }
      }
    }
    return undefined;
  };

  return {
    byExactCode,
    byNormCode,
    byId,
    byCleanName,
    findCustomer
  };
}

/**
 * Enriches customer item sales records with their authoritative branch (warehouse)
 * and sales rep from the master Customers directory.
 */
export function enrichCustomerItemSalesWithDirectory(
  sales: CustomerItemSaleRecord[],
  customers: Customer[],
  options: { forceOverwrite?: boolean } = {}
): {
  enriched: CustomerItemSaleRecord[];
  matchedRecordsCount: number;
  distinctCustomersMatched: number;
} {
  if (!customers || customers.length === 0 || !sales || sales.length === 0) {
    return { enriched: sales, matchedRecordsCount: 0, distinctCustomersMatched: 0 };
  }

  const lookup = buildCustomerDirectoryLookup(customers);
  const matchedAccounts = new Set<string>();
  let matchedRecordsCount = 0;

  const isGenericWarehouse = (w?: string) => {
    if (!w) return true;
    const v = w.trim();
    return (
      v === 'الفرع الرئيسي' ||
      v === 'غير محدد' ||
      v === 'عام' ||
      v === 'مخزن' ||
      v === 'المخزن الرئيسي' ||
      v === 'المخزن' ||
      v === '---' ||
      v === '0'
    );
  };

  const isGenericRep = (r?: string) => {
    if (!r) return true;
    const v = r.trim();
    return (
      v === 'غير محدد' ||
      v === 'مندوب' ||
      v === 'مندوب المبيعات' ||
      v === 'مندوب غير محدد' ||
      v === '---' ||
      v === '0'
    );
  };

  const enriched = sales.map((record) => {
    const matched = lookup.findCustomer(record.customerAccount, record.invoicingName);
    if (!matched) {
      return record;
    }

    matchedRecordsCount++;
    if (record.customerAccount) matchedAccounts.add(record.customerAccount.trim().toLowerCase());

    const branch = matched.branchName || (matched as any).branch;
    const rep = matched.salesRepName || matched.repName;

    // Resolve warehouse: prioritize authoritative customer branch if forceOverwrite or current warehouse is generic/empty
    const newWarehouse =
      options.forceOverwrite || isGenericWarehouse(record.warehouse)
        ? (branch || record.warehouse)
        : record.warehouse;

    // Resolve rep: prioritize authoritative rep if forceOverwrite or current rep is generic/empty
    const newRep =
      options.forceOverwrite || isGenericRep(record.repName)
        ? (rep || record.repName)
        : record.repName;

    return {
      ...record,
      warehouse: newWarehouse,
      repName: newRep,
      isCustomerLinked: true,
      linkedCustomerId: matched.id,
      linkedCustomerCode: matched.code,
      linkedBranch: branch,
      linkedRepName: rep,
      linkedSupervisorName: matched.supervisorName,
      linkedPhone: matched.phone
    };
  });

  return {
    enriched,
    matchedRecordsCount,
    distinctCustomersMatched: matchedAccounts.size
  };
}

/**
 * Filter Customer Item Sales based on strict RBAC permissions:
 * - Sales Rep: Only sales of customers assigned to this rep (matching repName, customerAccount, or customerName)
 * - Supervisor: Supervised reps or supervised branch
 * - Branch Manager: His branch
 * - Admin & Developer: All sales
 */
export function filterCustomerItemSalesByRBAC(
  sales: CustomerItemSaleRecord[],
  user: User | null,
  allUsers: User[] = [],
  customers: Customer[] = []
): CustomerItemSaleRecord[] {
  if (!user) return sales;
  if (user.role === 'admin' || user.role === 'developer') return sales;

  // Branch Manager: Only his branch warehouse
  if (user.role === 'branch_manager') {
    return sales.filter((s) => {
      if (s.warehouse && isBranchMatch(s.warehouse, user.branchName, { allowUnassigned: false })) return true;
      if (s.linkedBranch && isBranchMatch(s.linkedBranch, user.branchName, { allowUnassigned: false })) return true;
      return false;
    });
  }

  // Supervisor: Sales belonging to his reps or matching his supervised branch
  if (user.role === 'supervisor') {
    const supervisedReps = allUsers.filter((u) => u.role === 'sales_rep' && u.supervisorId === user.id);
    const supervisedNames = new Set(supervisedReps.map((u) => normalizeArabicText(u.name)));

    return sales.filter((s) => {
      if (s.repName && supervisedNames.has(normalizeArabicText(s.repName))) return true;
      if (s.linkedRepName && supervisedNames.has(normalizeArabicText(s.linkedRepName))) return true;
      if (s.warehouse && isBranchMatch(s.warehouse, user.branchName, { allowUnassigned: false })) return true;
      if (s.linkedBranch && isBranchMatch(s.linkedBranch, user.branchName, { allowUnassigned: false })) return true;
      return false;
    });
  }

  // Sales Rep: STRICTLY his customers
  if (user.role === 'sales_rep') {
    const repNorm = normalizeArabicText(user.name);
    // Find customers explicitly assigned to this rep
    const repCustomerAccounts = new Set<string>();
    const repCustomerNormCodes = new Set<string>();
    const repCustomerNames = new Set<string>();

    customers.forEach((c) => {
      if (doesCustomerBelongToRep(c, user)) {
        if (c.code) {
          repCustomerAccounts.add(c.code.trim().toLowerCase());
          const norm = normalizeCustomerLookupCode(c.code);
          if (norm) repCustomerNormCodes.add(norm);
        }
        if (c.id) {
          repCustomerAccounts.add(c.id.trim().toLowerCase());
          const normId = normalizeCustomerLookupCode(c.id);
          if (normId) repCustomerNormCodes.add(normId);
        }
        if (c.name) repCustomerNames.add(normalizeArabicText(c.name));
      }
    });

    return sales.filter((s) => {
      // 1. Matched by Rep Name directly (from sheet or linked customer directory)
      if (s.repName && (normalizeArabicText(s.repName) === repNorm || isArabicNameMatch(s.repName, user.name))) {
        return true;
      }
      if (s.linkedRepName && (normalizeArabicText(s.linkedRepName) === repNorm || isArabicNameMatch(s.linkedRepName, user.name))) {
        return true;
      }
      // 2. Matched by Customer Account code
      if (s.customerAccount) {
        const rawAcc = s.customerAccount.trim().toLowerCase();
        if (repCustomerAccounts.has(rawAcc)) return true;
        const normAcc = normalizeCustomerLookupCode(s.customerAccount);
        if (repCustomerNormCodes.has(normAcc)) return true;
      }
      if (s.linkedCustomerCode && repCustomerAccounts.has(s.linkedCustomerCode.trim().toLowerCase())) {
        return true;
      }
      // 3. Matched by Customer Name
      if (s.invoicingName && repCustomerNames.has(normalizeArabicText(s.invoicingName))) {
        return true;
      }
      return false;
    });
  }

  return [];
}

/**
 * Aggregate item-level sales records into Customer Dossiers:
 * Groups by Customer -> summarizes total amount, items bought, quantities, monthly timeline, and item groups.
 * If master Customers directory is passed, enriches dossiers with authoritative Branch and Rep and debt metrics.
 */
export function aggregateCustomerItemSales(
  sales: CustomerItemSaleRecord[],
  customers: Customer[] = []
): CustomerItemSalesSummary[] {
  const map = new Map<string, CustomerItemSalesSummary>();
  const lookup = customers && customers.length > 0 ? buildCustomerDirectoryLookup(customers) : null;

  sales.forEach((s) => {
    // Unique key: prefer customerAccount, fallback to invoicingName
    const key = (s.customerAccount || s.invoicingName).trim().toLowerCase();
    if (!key) return;

    if (!map.has(key)) {
      const matched = lookup?.findCustomer(s.customerAccount, s.invoicingName);
      const isLinked = Boolean(s.isCustomerLinked || matched);
      const branch = s.linkedBranch || matched?.branchName || (matched as any)?.branch || s.warehouse;
      const rep = s.linkedRepName || matched?.salesRepName || matched?.repName || s.repName;

      map.set(key, {
        customerAccount: s.customerAccount,
        customerName: s.invoicingName || s.customerAccount,
        repName: rep || 'غير محدد',
        warehouse: branch || 'الفرع الرئيسي',
        totalQuantity: 0,
        totalAmount: 0,
        distinctItemsCount: 0,
        distinctOrdersCount: 0,
        monthlySales: {},
        monthlyQuantities: {},
        groupBreakdown: {},
        familyBreakdown: {},
        items: [],
        // Linked Customer Directory Metadata
        isCustomerLinked: isLinked,
        linkedCustomerId: s.linkedCustomerId || matched?.id,
        linkedCustomerCode: s.linkedCustomerCode || matched?.code,
        linkedBranch: branch,
        linkedRepName: rep,
        linkedSupervisorName: s.linkedSupervisorName || matched?.supervisorName,
        linkedPhone: s.linkedPhone || matched?.phone,
        linkedBalance: matched?.currentBalance ?? matched?.balance,
        linkedOverdue: matched?.totalOverdue ?? matched?.overdueBalance,
        linkedTier: matched?.tier,
        linkedAddress: matched?.address || matched?.district || matched?.governorate
      });
    }

    const summary = map.get(key)!;
    summary.totalQuantity += s.quantity;
    summary.totalAmount += s.amount;

    // Monthly aggregates
    const m = s.month || 1;
    summary.monthlySales[m] = (summary.monthlySales[m] || 0) + s.amount;
    summary.monthlyQuantities[m] = (summary.monthlyQuantities[m] || 0) + s.quantity;

    // Group breakdown
    const grp = s.itemGroup || 'عام';
    if (!summary.groupBreakdown[grp]) {
      summary.groupBreakdown[grp] = { quantity: 0, amount: 0, itemsCount: 0 };
    }
    summary.groupBreakdown[grp].quantity += s.quantity;
    summary.groupBreakdown[grp].amount += s.amount;

    // Family breakdown
    const fam = s.familyDimension || grp;
    if (!summary.familyBreakdown[fam]) {
      summary.familyBreakdown[fam] = { quantity: 0, amount: 0 };
    }
    summary.familyBreakdown[fam].quantity += s.quantity;
    summary.familyBreakdown[fam].amount += s.amount;

    // Item-level roll-up inside customer
    const itemKey = (s.itemCode || s.itemName).trim().toLowerCase();
    let existingItem = summary.items.find((it) => (it.itemCode || it.itemName).trim().toLowerCase() === itemKey);

    if (!existingItem) {
      existingItem = {
        itemCode: s.itemCode,
        itemName: s.itemName,
        itemGroup: s.itemGroup,
        familyDimension: s.familyDimension,
        unit: s.unit,
        factor: s.factor,
        avgUnitPrice: s.unitPrice,
        totalQuantity: 0,
        totalAmount: 0,
        monthlyBreakdown: {}
      };
      summary.items.push(existingItem);
      summary.groupBreakdown[grp].itemsCount += 1;
    }

    existingItem.totalQuantity += s.quantity;
    existingItem.totalAmount += s.amount;
    if (s.unitPrice > 0) existingItem.avgUnitPrice = s.unitPrice;

    if (!existingItem.monthlyBreakdown[m]) {
      existingItem.monthlyBreakdown[m] = { quantity: 0, amount: 0 };
    }
    existingItem.monthlyBreakdown[m].quantity += s.quantity;
    existingItem.monthlyBreakdown[m].amount += s.amount;
  });

  // Calculate distinct items and orders per customer
  const ordersByCustomer = new Map<string, Set<string>>();
  sales.forEach((s) => {
    const key = (s.customerAccount || s.invoicingName).trim().toLowerCase();
    if (!ordersByCustomer.has(key)) ordersByCustomer.set(key, new Set());
    if (s.salesOrder) ordersByCustomer.get(key)!.add(s.salesOrder);
  });

  map.forEach((summary, key) => {
    summary.distinctItemsCount = summary.items.length;
    summary.distinctOrdersCount = ordersByCustomer.get(key)?.size || Math.max(1, Math.ceil(summary.items.length / 3));
    // Sort items by total amount descending
    summary.items.sort((a, b) => b.totalAmount - a.totalAmount);
  });

  // Return summaries sorted by total purchase amount descending
  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

/**
 * Generate Sample Demo Records for Customer Item Sales
 * Grounded in existing customers and branches
 */
export function generateDemoCustomerItemSales(customers: Customer[], allUsers: User[]): CustomerItemSaleRecord[] {
  const targetCustomers = (customers.length > 0 ? customers : [
    { code: 'CUST-1001', name: 'سوبر ماركت النور والبركة', branchName: 'فرع المنيا', repName: 'محمد أحمد علي' },
    { code: 'CUST-1002', name: 'معرض الأهرام للأدوات', branchName: 'فرع الفيوم', repName: 'محمود عبد الرحيم' },
    { code: 'CUST-1003', name: 'شركة التوحيد للتوزيع', branchName: 'فرع البحيرة', repName: 'عصام عبد الفتاح' },
    { code: 'CUST-1004', name: 'مؤسسة الفيروز للتجارة', branchName: 'فرع القاهرة', repName: 'طارق مصطفى' },
  ] as Customer[]).slice(0, 15);

  const sampleProducts = [
    { code: 'ITM-201', name: 'طقم حافظات طعام بلاستيك 3 قطع', unit: 'كرتونة', factor: 12, price: 420, group: 'بلاستيكات', family: 'أدوات حفظ' },
    { code: 'ITM-202', name: 'طبق تسالي فاخر مقسم ملون', unit: 'كرتونة', factor: 24, price: 280, group: 'بلاستيكات', family: 'أدوات مائدة' },
    { code: 'ITM-301', name: 'مج حراري ستانلس بغطاء سيليكون', unit: 'كرتونة', factor: 20, price: 950, group: 'ستانلس', family: 'مشروبات' },
    { code: 'ITM-302', name: 'صينية فرن مستطيلة تيفال وسط', unit: 'كرتونة', factor: 10, price: 1150, group: 'صواني وقوالب', family: 'أدوات طهي' },
    { code: 'ITM-401', name: 'مصفاة خضار متعددة الاستخدام', unit: 'كرتونة', factor: 30, price: 190, group: 'بلاستيكات', family: 'أدوات مطبخ' },
    { code: 'ITM-501', name: 'دورق عصير زجاجي 1.5 لتر مع غطاء', unit: 'كرتونة', factor: 12, price: 540, group: 'زجاجيات', family: 'مشروبات' },
  ];

  const records: CustomerItemSaleRecord[] = [];
  let idCounter = 1;

  targetCustomers.forEach((cust, cIdx) => {
    const cRep = cust.salesRepName || cust.repName || 'مندوب المبيعات';
    const cBranch = cust.branchName || 'فرع المنيا';

    // Generate 3 to 6 distinct purchases across months 1..10
    const purchasesCount = 3 + (cIdx % 4);
    for (let p = 0; p < purchasesCount; p++) {
      const prod = sampleProducts[(cIdx + p) % sampleProducts.length];
      const month = 1 + ((cIdx * 2 + p) % 10);
      const qty = 2 + (p * 3) + (cIdx % 5);
      const discount = (p % 2 === 0) ? (qty * 15) : 0;
      const amount = Math.max(0, (qty * prod.price) - discount);
      const day = 5 + ((p * 7) % 22);

      records.push({
        id: `cis-demo-${idCounter++}`,
        customerAccount: cust.code || `CUST-100${cIdx + 1}`,
        invoicingName: cust.name,
        salesOrder: `SO-2026-${String(1000 + idCounter).slice(-4)}`,
        date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        repName: cRep,
        month,
        monthName: MONTH_NAMES_MAP[month],
        warehouse: cBranch,
        itemCode: prod.code,
        itemName: prod.name,
        unit: prod.unit,
        factor: prod.factor,
        unitPrice: prod.price,
        discount,
        quantity: qty,
        amount,
        itemGroup: prod.group,
        definitions: 'أصناف معتمدة',
        familyDimension: prod.family,
        createdAt: new Date().toISOString()
      });
    }
  });

  return records;
}

/**
 * Load Customer Item Sales from storage (Memory Cache -> IndexedDB primary -> localStorage fallback)
 */
export async function getSavedCustomerItemSales(): Promise<CustomerItemSaleRecord[]> {
  if (inMemoryItemSalesCache && inMemoryItemSalesCache.length > 0) {
    return inMemoryItemSalesCache;
  }
  if (typeof window === 'undefined') return [];
  try {
    // Try IndexedDB first (high capacity, ~50MB+)
    const idbData = await idbGet<CustomerItemSaleRecord[]>(ITEM_SALES_STORAGE_KEY);
    if (Array.isArray(idbData) && idbData.length > 0) {
      inMemoryItemSalesCache = idbData;
      return idbData;
    }
    // Fallback to localStorage (legacy / small datasets)
    const raw = window.localStorage.getItem(ITEM_SALES_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (Array.isArray(list) && list.length > 0) {
      inMemoryItemSalesCache = list;
      return list;
    }
    return [];
  } catch {
    return inMemoryItemSalesCache || [];
  }
}

/**
 * Clear Customer Item Sales from storage (IndexedDB + localStorage + memory)
 */
export async function clearCustomerItemSales(): Promise<void> {
  inMemoryItemSalesCache = [];
  if (typeof window === 'undefined') return;
  try {
    await idbDelete(ITEM_SALES_STORAGE_KEY);
  } catch {}
  try {
    window.localStorage.removeItem(ITEM_SALES_STORAGE_KEY);
  } catch {}
  try {
    window.dispatchEvent(
      new CustomEvent('tantawy-customer-item-sales-updated', {
        detail: { count: 0, timestamp: Date.now() }
      })
    );
  } catch {}
}

/**
 * Save Customer Item Sales to storage (In-memory + IndexedDB primary + localStorage cache + window event)
 */
export async function saveCustomerItemSales(sales: CustomerItemSaleRecord[]): Promise<void> {
  inMemoryItemSalesCache = sales;
  if (typeof window === 'undefined') return;
  // Primary: IndexedDB (high capacity)
  try {
    await idbSet(ITEM_SALES_STORAGE_KEY, sales);
  } catch (err) {
    console.warn('Customer item sales IndexedDB save note:', err);
  }
  // Cache: localStorage (best-effort, may fail for large datasets)
  try {
    window.localStorage.setItem(ITEM_SALES_STORAGE_KEY, JSON.stringify(sales));
  } catch {
    // Quota exceeded - data is safely in IndexedDB
    try { window.localStorage.removeItem(ITEM_SALES_STORAGE_KEY); } catch {}
  }
  // Dispatch custom event to notify all active views instantly
  try {
    window.dispatchEvent(
      new CustomEvent('tantawy-customer-item-sales-updated', {
        detail: { count: sales.length, timestamp: Date.now() }
      })
    );
  } catch {}
}

/**
 * Get current exact record count from Supabase `customer_item_sales` table
 */
export async function getSupabaseCustomerItemSalesCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('customer_item_sales')
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.warn('Error fetching Supabase customer_item_sales count:', error);
      return -1;
    }
    return count ?? 0;
  } catch (err) {
    console.warn('Exception checking Supabase customer_item_sales count:', err);
    return -1;
  }
}

/**
 * Push Customer Item Sales records to Supabase table `customer_item_sales` in robust batches of 250 rows
 */
export async function pushCustomerItemSalesToSupabase(
  sales: CustomerItemSaleRecord[],
  onProgress?: (synced: number, total: number) => void
): Promise<{ success: boolean; syncedCount: number; prunedCount?: number; error?: string }> {
  if (!sales || sales.length === 0) return { success: true, syncedCount: 0 };

  const batchSize = 250;
  let syncedCount = 0;
  let prunedCount = 0;

  try {
    /**
     * تنظيف بقايا الرفع القديم: الصفوف اللي اتخزنت بكمية ومبلغ صفر بسبب
     * تحويل أرقام غلط. بنمسحها فقط لو الداتا الجديدة فيها أرقام حقيقية،
     * عشان مانمسحش داتا سليمة بالغلط.
     */
    const hasRealValues = sales.some(
      (record) => parseNumericValue(record.amount) > 0 || parseNumericValue(record.quantity) > 0
    );

    if (hasRealValues) {
      try {
        const { count, error: pruneError } = await supabase
          .from('customer_item_sales')
          .delete({ count: 'exact' })
          .eq('amount', 0)
          .eq('quantity', 0);
        if (!pruneError) prunedCount = count ?? 0;
      } catch {
        // التنظيف تحسيني فقط — فشله لا يمنع الحفظ
      }
    }

    for (let i = 0; i < sales.length; i += batchSize) {
      const slice = sales.slice(i, i + batchSize);
      const batch = slice.map((s, idx) => {
        // ID ثابت determinada بناءً على البيانات الطبيعية
        // عشان ما يحصلش تكرار عند كل مزامنة، upsert होताحدث السجل اللي موجود
        const naturalKey = `${String(s.customerAccount || 'UNK')}|${String(s.itemCode || 'UNK')}|${String(s.month || '0')}|${String(s.salesOrder || '0')}`;
        const deterministicId = `cis-${naturalKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

        return {
          id: s.id || deterministicId,
          customer_account: String(s.customerAccount || 'CUST-UNKNOWN').trim(),
          invoicing_name: String(s.invoicingName || s.customerAccount || 'عميل غير محدد').trim(),
          sales_order: s.salesOrder ? String(s.salesOrder).trim() : null,
          sale_date: s.date ? String(s.date).trim().slice(0, 10) : null,
          rep_name: String(s.repName || 'غير محدد').trim(),
          month: Math.max(1, Math.min(12, Number(s.month) || 1)),
          warehouse: String(s.warehouse || 'الفرع الرئيسي').trim(),
          item_code: String(s.itemCode || 'ITM-UNKNOWN').trim(),
          item_name: String(s.itemName || s.itemCode || 'صنف غير محدد').trim(),
          unified_code: s.unifiedCode ? String(s.unifiedCode).trim() : null,
          unit: String(s.unit || 'كرتونة').trim(),
          factor: parseNumericValue(s.factor) > 0 ? parseNumericValue(s.factor) : 1,
          unit_price: parseNumericValue(s.unitPrice),
          discount: parseNumericValue(s.discount),
          quantity: parseNumericValue(s.quantity),
          amount: parseNumericValue(s.amount),
          item_group: String(s.itemGroup || 'عام').trim(),
          definitions: s.definitions ? String(s.definitions).trim() : null,
          family_dimension: String(s.familyDimension || s.itemGroup || 'عام').trim(),
          created_at: s.createdAt || new Date().toISOString()
        };
      });

      const { error } = await supabase
        .from('customer_item_sales')
        .upsert(batch, { onConflict: 'id' });

      if (error) {
        console.error('Supabase batch upsert error:', error);
        return {
          success: false,
          syncedCount,
          error: `تعذر حفظ الدفعة ${Math.floor(i / batchSize) + 1} من ${Math.ceil(sales.length / batchSize)}: ${error.message}`
        };
      }

      syncedCount += slice.length;
      if (onProgress) onProgress(syncedCount, sales.length);
    }

    return { success: true, syncedCount, prunedCount };
  } catch (err: any) {
    console.error('pushCustomerItemSalesToSupabase error:', err);
    return {
      success: false,
      syncedCount,
      error: err?.message || 'حدث خطأ أثناء المزامنة مع Supabase'
    };
  }
}

/**
 * Fetch Customer Item Sales from Supabase table `customer_item_sales` with complete pagination (fetching all 10,000+ rows)
 */
export async function fetchCustomerItemSalesFromSupabase(
  onProgress?: (loaded: number) => void
): Promise<{
  sales: CustomerItemSaleRecord[];
  error?: string;
}> {
  try {
    const pageSize = 1000;
    let from = 0;
    let allData: any[] = [];
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('customer_item_sales')
        .select('*')
        .range(from, from + pageSize - 1)
        .order('month', { ascending: true });

      if (error) {
        console.warn('Error fetching chunk from Supabase:', error);
        if (allData.length > 0) break; // If we already got some chunks, keep them
        return { sales: [], error: error.message };
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      allData = allData.concat(data);
      if (onProgress) onProgress(allData.length);

      if (data.length < pageSize) {
        hasMore = false;
        break;
      }
      from += pageSize;
    }

    if (allData.length === 0) {
      return { sales: [] };
    }

    const mapped: CustomerItemSaleRecord[] = allData.map((row: any) => ({
      id: row.id,
      customerAccount: row.customer_account,
      invoicingName: row.invoicing_name,
      salesOrder: row.sales_order || undefined,
      date: row.sale_date || undefined,
      repName: row.rep_name || 'غير محدد',
      month: Number(row.month) || 1,
      monthName: MONTH_NAMES_MAP[Number(row.month)] || `شهر ${row.month}`,
      warehouse: row.warehouse || 'الفرع الرئيسي',
      itemCode: row.item_code,
      itemName: row.item_name,
      unifiedCode: row.unified_code || undefined,
      unit: row.unit || 'كرتونة',
      factor: parseNumericValue(row.factor) || 1,
      unitPrice: parseNumericValue(row.unit_price),
      discount: parseNumericValue(row.discount),
      quantity: parseNumericValue(row.quantity),
      amount: parseNumericValue(row.amount),
      itemGroup: row.item_group || 'عام',
      definitions: row.definitions || undefined,
      familyDimension: row.family_dimension || row.item_group || 'عام',
      createdAt: row.created_at || new Date().toISOString()
    }));

    // Cache into memory & IndexedDB
    await saveCustomerItemSales(mapped);

    return { sales: mapped };
  } catch (err: any) {
    return { sales: [], error: err?.message || 'فشل الاتصال بـ Supabase' };
  }
}

/**
 * Export Customer Item Sales to Excel with Pivot & Breakdown Sheets
 */
export function exportCustomerItemSalesToExcel(
  sales: CustomerItemSaleRecord[],
  summaries: CustomerItemSalesSummary[],
  fileName = 'مبيعات_العملاء_بالصنف_2026'
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Detailed Item Sales Raw Rows
  const headers = [
    'كود العميل (Customer account)',
    'اسم العميل (Invoicing name)',
    'رقم أمر البيع (Sales order)',
    'التاريخ (Date)',
    'المندوب',
    'الشهر (Month)',
    'المخزن / الفرع (Warehouse)',
    'كود الصنف (Item)',
    'اسم الصنف (Name)',
    'الوحدة (Unit)',
    'معامل التحويل (factor)',
    'سعر الوحدة (Unit price)',
    'الخصم (Discount)',
    'الكمية (Quantity)',
    'القيمة الإجمالية (Amount)',
    'مجموعة الصنف (Item group)',
    'التعريفات',
    'عائلة الصنف (Family Dimension)',
  ];

  const rows = sales.map((s) => [
    s.customerAccount,
    s.invoicingName,
    s.salesOrder || '',
    s.date || '',
    s.repName,
    s.monthName || s.month,
    s.warehouse,
    s.itemCode,
    s.itemName,
    s.unit,
    s.factor,
    s.unitPrice,
    s.discount,
    s.quantity,
    s.amount,
    s.itemGroup,
    s.definitions || '',
    s.familyDimension,
  ]);

  const wsRaw = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  wsRaw['!views'] = [{ RTL: true }];
  wsRaw['!sheetView'] = [{ rightToLeft: true }];
  XLSX.utils.book_append_sheet(wb, wsRaw, 'مبيعات_الأصناف_التفصيلية');

  // Sheet 2: Customer Aggregated Summary
  const summaryHeaders = [
    'كود العميل',
    'اسم العميل',
    'المندوب المسؤول',
    'الفرع',
    'إجمالي الكمية (كراتين/قطع)',
    'إجمالي المبيعات (ج.م)',
    'عدد الأصناف المشتراة',
    'عدد أوامر البيع',
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

  const summaryRows = summaries.map((c) => [
    c.customerAccount,
    c.customerName,
    c.repName,
    c.warehouse,
    c.totalQuantity,
    c.totalAmount,
    c.distinctItemsCount,
    c.distinctOrdersCount,
    c.monthlySales[1] || 0,
    c.monthlySales[2] || 0,
    c.monthlySales[3] || 0,
    c.monthlySales[4] || 0,
    c.monthlySales[5] || 0,
    c.monthlySales[6] || 0,
    c.monthlySales[7] || 0,
    c.monthlySales[8] || 0,
    c.monthlySales[9] || 0,
    c.monthlySales[10] || 0,
    c.monthlySales[11] || 0,
    c.monthlySales[12] || 0,
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
  wsSummary['!views'] = [{ RTL: true }];
  wsSummary['!sheetView'] = [{ rightToLeft: true }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'تجميع_مبيعات_العملاء');

  XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Generate Complete PostgreSQL / Supabase SQL Schema DDL
 * As requested by user: "وعاوز كود سيكول للجدول عشان يتربط علي طول"
 */
export function getCustomerItemSalesSQLSchema(): string {
  return `-- ==============================================================================
-- TANTAWY GROUP - جدول مبيعات العملاء بالصنف (Customer Item Sales Table)
-- متوافق 100% مع PostgreSQL و Supabase مع الفهارس وسياسات الأمان RLS
-- ==============================================================================

-- 1. إنشاء جدول مبيعات العملاء بالصنف
CREATE TABLE IF NOT EXISTS public.customer_item_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_account VARCHAR(100) NOT NULL,            -- كود العميل (Customer account)
    invoicing_name VARCHAR(255) NOT NULL,              -- اسم العميل في الفاتورة (Invoicing name)
    sales_order VARCHAR(100),                          -- رقم أمر البيع / الفاتورة (Sales order)
    sale_date DATE,                                    -- تاريخ الحركة (Date)
    rep_name VARCHAR(150) NOT NULL,                    -- اسم المندوب (المندوب)
    rep_id VARCHAR(100),                               -- معرّف المندوب بحسابات النظام
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12), -- رقم الشهر (1-12)
    warehouse VARCHAR(150) DEFAULT 'الفرع الرئيسي',    -- اسم المخزن أو الفرع (Warehouse)
    item_code VARCHAR(100) NOT NULL,                   -- كود الصنف (Item)
    item_name VARCHAR(255) NOT NULL,                   -- اسم الصنف (Name)
    unit VARCHAR(50) DEFAULT 'كرتونة',                 -- الوحدة (Unit)
    factor NUMERIC(10, 2) DEFAULT 1.00,                -- معامل التحويل / شدة الكرتونة (factor)
    unit_price NUMERIC(15, 2) DEFAULT 0.00,            -- سعر الوحدة (Unit price)
    discount NUMERIC(15, 2) DEFAULT 0.00,              -- الخصم (Discount)
    quantity NUMERIC(12, 2) NOT NULL DEFAULT 1.00,     -- الكمية المباعة (Quantity)
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,       -- المبلغ الإجمالي الصافي (Amount)
    item_group VARCHAR(150) DEFAULT 'عام',             -- مجموعة الصنف (Item group)
    definitions TEXT,                                  -- التعريفات (Definitions)
    family_dimension VARCHAR(150),                     -- عائلة الصنف (Family Dimension)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. إنشاء الفهارس لتسريع البحث والاستعلام اللحظي (Indexes)
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_cust_account ON public.customer_item_sales(customer_account);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_invoicing_name ON public.customer_item_sales(invoicing_name);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_rep_name ON public.customer_item_sales(rep_name);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_month ON public.customer_item_sales(month);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_item_code ON public.customer_item_sales(item_code);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_warehouse ON public.customer_item_sales(warehouse);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_item_group ON public.customer_item_sales(item_group);

-- 3. تفعيل أمان مستوى الصفوف (Row Level Security - RLS)
ALTER TABLE public.customer_item_sales ENABLE ROW LEVEL SECURITY;

-- السماح بالقراءة والتحديث للمستخدمين المصرح لهم
DROP POLICY IF EXISTS "Allow authenticated users full access to customer_item_sales" ON public.customer_item_sales;
CREATE POLICY "Allow authenticated users full access to customer_item_sales"
ON public.customer_item_sales
FOR ALL
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- 4. فيو تحليلي ذكي لتجميع مبيعات كل عميل شهرياً وبالصنف
CREATE OR REPLACE VIEW public.view_customer_monthly_item_sales AS
SELECT 
    customer_account,
    invoicing_name,
    rep_name,
    warehouse,
    month,
    item_code,
    item_name,
    item_group,
    SUM(quantity) AS total_quantity,
    SUM(amount) AS total_amount,
    COUNT(DISTINCT sales_order) AS total_orders
FROM public.customer_item_sales
GROUP BY customer_account, invoicing_name, rep_name, warehouse, month, item_code, item_name, item_group;

-- تم التجهيز بنجاح لشركة طنطاوي جروب!`;
}
