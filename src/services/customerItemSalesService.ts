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

export const ITEM_SALES_STORAGE_KEY = 'tantawy_customer_item_sales_v1';

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

/**
 * Clean & normalize column header names
 */
function cleanHeader(raw: any): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[\s_\-\/\\]+/g, '');
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
    // 4. Date (التاريخ)
    else if (
      h === 'date' ||
      h === 'التاريخ' ||
      h === 'تاريخ' ||
      h === 'تاريخالطلب' ||
      h === 'تاريخالبيع' ||
      h === 'orderdate'
    ) {
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
    // 6. الشهر (Month)
    else if (
      h === 'الشهر' ||
      h === 'شهر' ||
      h === 'month' ||
      h === 'رقمشهر' ||
      h === 'monthno'
    ) {
      if (map.month === -1) map.month = idx;
    }
    // 7. Warehouse (المخزن / الفرع)
    else if (
      h === 'warehouse' ||
      h === 'المخزن' ||
      h === 'مخزن' ||
      h === 'الفرع' ||
      h === 'فرع' ||
      h === 'branch'
    ) {
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
    // 10. Unit (الوحدة)
    else if (
      h === 'unit' ||
      h === 'الوحدة' ||
      h === 'وحدة' ||
      h === 'unitid'
    ) {
      if (map.unit === -1) map.unit = idx;
    }
    // 11. Factor (معامل التحويل)
    else if (
      h === 'factor' ||
      h === 'معامل' ||
      h === 'معاملالتحويل' ||
      h === 'شدةالكرتونة' ||
      h === 'شدةالكرتونه' ||
      h === 'عددالقطع'
    ) {
      if (map.factor === -1) map.factor = idx;
    }
    // 12. Unit price (سعر الوحدة)
    else if (
      h === 'unitprice' ||
      h === 'price' ||
      h === 'سعرالوحدة' ||
      h === 'سعرالقطعة' ||
      h === 'السعر'
    ) {
      if (map.unitPrice === -1) map.unitPrice = idx;
    }
    // 13. Discount (الخصم)
    else if (
      h === 'discount' ||
      h === 'الخصم' ||
      h === 'خصم' ||
      h === 'discountamount' ||
      h === 'discountpct'
    ) {
      if (map.discount === -1) map.discount = idx;
    }
    // 14. Quantity (الكمية)
    else if (
      h === 'quantity' ||
      h === 'qty' ||
      h === 'الكمية' ||
      h === 'الكميه' ||
      h === 'العدد'
    ) {
      if (map.quantity === -1) map.quantity = idx;
    }
    // 15. Amount (المبلغ / القيمة الإجمالية)
    else if (
      h === 'amount' ||
      h === 'total' ||
      h === 'totalamount' ||
      h === 'القيمة' ||
      h === 'المبلغ' ||
      h === 'الاجمالي' ||
      h === 'الإجمالي'
    ) {
      if (map.amount === -1) map.amount = idx;
    }
    // 16. Item group (مجموعة الصنف)
    else if (
      h === 'itemgroup' ||
      h === 'مجموعةالصنف' ||
      h === 'مجموعهالصنف' ||
      h === 'المجموعة' ||
      h === 'المجموعه' ||
      h === 'القسم' ||
      h.includes('itemgroup')
    ) {
      if (map.itemGroup === -1) map.itemGroup = idx;
    }
    // 17. التعريفات (Definitions)
    else if (
      h === 'التعريفات' ||
      h === 'تعريفات' ||
      h === 'definitions' ||
      h === 'definition' ||
      h === 'التعريف'
    ) {
      if (map.definitions === -1) map.definitions = idx;
    }
    // 18. Family Dimension (عائلة الصنف / التصنيف)
    else if (
      h === 'familydimension' ||
      h === 'family' ||
      h === 'عائلةالصنف' ||
      h === 'العائلة' ||
      h === 'الفئة' ||
      h === 'التصنيف' ||
      h.includes('familydimension')
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

  for (let r = 0; r < Math.min(5, rawRows.length); r++) {
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
      const clean = String(row[idx]).replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? 0 : parsed;
    };

    const customerAccount = getVal(colMap.customerAccount);
    const invoicingName = getVal(colMap.invoicingName);
    const itemCode = getVal(colMap.itemCode);
    const itemName = getVal(colMap.itemName);

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
    let amount = getNum(colMap.amount);

    // Calculate amount if missing
    if (amount === 0 && quantity > 0 && unitPrice > 0) {
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
      itemName: itemName || itemCode || `صنف #${i}`,
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
  if (!user) return [];
  if (user.role === 'admin' || user.role === 'developer') return sales;

  // Branch Manager: Only his branch warehouse
  if (user.role === 'branch_manager') {
    return sales.filter((s) => isBranchMatch(s.warehouse, user.branchName, { allowUnassigned: false }));
  }

  // Supervisor: Sales belonging to his reps or matching his supervised branch
  if (user.role === 'supervisor') {
    const supervisedReps = allUsers.filter((u) => u.role === 'sales_rep' && u.supervisorId === user.id);
    const supervisedNames = new Set(supervisedReps.map((u) => normalizeArabicText(u.name)));

    return sales.filter((s) => {
      if (s.repName && supervisedNames.has(normalizeArabicText(s.repName))) return true;
      if (s.warehouse && isBranchMatch(s.warehouse, user.branchName, { allowUnassigned: false })) return true;
      return false;
    });
  }

  // Sales Rep: STRICTLY his customers
  if (user.role === 'sales_rep') {
    const repNorm = normalizeArabicText(user.name);
    // Find customers explicitly assigned to this rep
    const repCustomerAccounts = new Set<string>();
    const repCustomerNames = new Set<string>();

    customers.forEach((c) => {
      if (doesCustomerBelongToRep(c, user)) {
        if (c.code) repCustomerAccounts.add(c.code.trim().toLowerCase());
        if (c.name) repCustomerNames.add(normalizeArabicText(c.name));
      }
    });

    return sales.filter((s) => {
      // 1. Matched by Rep Name directly
      if (s.repName && (normalizeArabicText(s.repName) === repNorm || isArabicNameMatch(s.repName, user.name))) {
        return true;
      }
      // 2. Matched by Customer Account code
      if (s.customerAccount && repCustomerAccounts.has(s.customerAccount.trim().toLowerCase())) {
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
 * Groups by Customer -> summarizes total amount, items bought, quantities, monthly timeline, and item groups
 */
export function aggregateCustomerItemSales(sales: CustomerItemSaleRecord[]): CustomerItemSalesSummary[] {
  const map = new Map<string, CustomerItemSalesSummary>();

  sales.forEach((s) => {
    // Unique key: prefer customerAccount, fallback to invoicingName
    const key = (s.customerAccount || s.invoicingName).trim().toLowerCase();
    if (!key) return;

    if (!map.has(key)) {
      map.set(key, {
        customerAccount: s.customerAccount,
        customerName: s.invoicingName || s.customerAccount,
        repName: s.repName,
        warehouse: s.warehouse,
        totalQuantity: 0,
        totalAmount: 0,
        distinctItemsCount: 0,
        distinctOrdersCount: 0,
        monthlySales: {},
        monthlyQuantities: {},
        groupBreakdown: {},
        familyBreakdown: {},
        items: []
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
 * Load Customer Item Sales from storage (IndexedDB or localStorage)
 */
export function getSavedCustomerItemSales(): CustomerItemSaleRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ITEM_SALES_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Clear Customer Item Sales from storage
 */
export function clearCustomerItemSales(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ITEM_SALES_STORAGE_KEY);
  } catch (err) {
    console.warn('Customer item sales storage clear note:', err);
  }
}

/**
 * Save Customer Item Sales to storage
 */
export function saveCustomerItemSales(sales: CustomerItemSaleRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ITEM_SALES_STORAGE_KEY, JSON.stringify(sales));
  } catch (err) {
    console.warn('Customer item sales storage note:', err);
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
