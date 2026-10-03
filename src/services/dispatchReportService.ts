import type { Invoice, InvoiceItem, Product } from '../types';
import {
  APPROVED_AND_EXECUTED_INVOICE_STATUSES,
  cleanProductCode,
  normalizeExcelBranchName,
} from './excelService';

/**
 * The daily shortage / approved dispatch pack.
 *
 * This is the sheet the supervisor hands to the October warehouse and the sheet the
 * branch manager hands to their own storekeeper, so it has to do two different jobs at
 * once:
 *
 *   • "gather everything" - one row per product with the total cartons and pieces the
 *     warehouse has to find, which is the only form anyone actually works from;
 *   • "exactly like an invoice" - one row per invoice line in the identical 25-column
 *     ERP layout the app already produces for a single invoice, so the file can be
 *     loaded into their system without any manual reshaping.
 *
 * Both are emitted, in the same workbook, because both are needed and building them by
 * hand from one into the other is where mistakes happen.
 */

/** Statuses that mean the request is settled and must not be requested again. */
const CLOSED_SHORTAGE_STATUSES: string[] = [
  'تم التسليم',
  'إغلاق الطلبية',
  'ملغاة',
  'مرفوضة / ملغاة',
];

/**
 * The ERP column layout, copied from the single-invoice export so the two files are
 * byte-compatible. Changing this list changes what their system receives, so it must
 * stay in step with excelService.
 */
const ERP_HEADERS = [
  'رقم الفاتورة',
  'تاريخ الفاتورة',
  'كود المندوب',
  'اسم المندوب',
  'اسم الفرع',
  'كود العميل',
  'اسم العميل',
  'رقم هاتف العميل',
  'كود الصنف',
  'الكود الموحد (#)',
  'اسم الصنف',
  'اللون',
  'شدة الكرتونة',
  'عدد الكراتين',
  'قطع فردية',
  'إجمالي القطع',
  'سعر الكرتونة',
  'سعر القطعة',
  'الإجمالي قبل الخصم',
  'نسبة خصم الفاتورة %',
  'قيمة الخصم للصنف',
  'الصافي النهائي',
  'مصدر الصرف',
  'طريقة الدفع',
  'حالة الفاتورة',
];

const MAIN_WAREHOUSE_LABEL = 'مخزن مركزي - 6 أكتوبر';

export type DispatchScope = 'shortage' | 'approved' | 'both';

export interface DispatchFilter {
  /** Inclusive YYYY-MM-DD bounds on invoice.date. */
  from?: string;
  to?: string;
  scopeLabel?: string;
  scope?: DispatchScope;
}

export interface ShortageItem {
  productKey: string;
  productCode: string;
  unifiedCode: string;
  productName: string;
  itemGroup: string;
  familyName: string;
  cartonFactor: number;
  cartons: number;
  pieces: number;
  totalPieces: number;
  /** What the central warehouse can cover right now. */
  mainWarehouseAvailable: number;
  /** Request minus availability, never below zero. */
  netToRequest: number;
  invoiceCount: number;
  repNames: string[];
  branchNames: string[];
}

export interface DispatchRow {
  invoiceNumber: string;
  date: string;
  repId: string;
  repName: string;
  branchName: string;
  customerCode: string;
  customerName: string;
  customerPhone: string;
  productCode: string;
  unifiedCode: string;
  productName: string;
  color: string;
  cartonFactor: number;
  cartons: number;
  pieces: number;
  totalPieces: number;
  pricePerCarton: number;
  pricePerPiece: number;
  totalBeforeTax: number;
  invoiceDiscountPercent: number;
  discountAmount: number;
  netTotal: number;
  source: string;
  paymentMethod: string;
  status: string;
}

export interface DispatchSummaryRow {
  label: string;
  invoices: number;
  products: number;
  cartons: number;
  pieces: number;
}

export interface DispatchReport {
  from: string;
  to: string;
  scopeLabel: string;
  scope: DispatchScope;
  shortageInvoiceCount: number;
  approvedInvoiceCount: number;
  productCount: number;
  totalCartons: number;
  totalPieces: number;
  shortageSummary: ShortageItem[];
  shortageLines: DispatchRow[];
  approvedLines: DispatchRow[];
  byRep: DispatchSummaryRow[];
  byBranch: DispatchSummaryRow[];
  totals: DispatchSummaryRow[];
}

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeKey = (value: string): string =>
  (value || '').replace(/^#/, '').replace(/\s+/g, '').toLowerCase();

const isShortageInvoice = (invoice: Invoice): boolean =>
  Boolean(
    invoice.isShortageInvoice ||
      (invoice.invoiceNumber && invoice.invoiceNumber.endsWith('-NQ'))
  );

const isOpenShortage = (invoice: Invoice): boolean =>
  isShortageInvoice(invoice) && !CLOSED_SHORTAGE_STATUSES.includes(invoice.status);

const isApprovedOrExecuted = (invoice: Invoice): boolean =>
  APPROVED_AND_EXECUTED_INVOICE_STATUSES.includes(invoice.status);

/** A line the central warehouse has to supply, whether it came from a -NQ invoice or is
 *  flagged per line on an ordinary order. */
const isShortageLine = (item: InvoiceItem): boolean =>
  Boolean(item.fulfillFromMainWarehouse) || item.fulfilledFrom === 'main_warehouse';

const itemCartonFactor = (item: InvoiceItem): number =>
  toNumber(item.cartonQuantity || item.product?.cartonQuantity || item.product?.factor) || 1;

const itemTotalPieces = (item: InvoiceItem): number =>
  toNumber(item.totalPieces ?? item.totalUnits) ||
  (toNumber(item.cartonCount) * itemCartonFactor(item) + toNumber(item.pieceCount));

/** Turns one invoice line into the flat ERP row shape. */
function toDispatchRow(invoice: Invoice, item: InvoiceItem, product?: Product): DispatchRow {
  const factor = itemCartonFactor(item);
  return {
    invoiceNumber: invoice.invoiceNumber || invoice.id,
    date: invoice.date,
    repId: invoice.repId || '',
    repName: invoice.repName || 'غير محدد',
    branchName: normalizeExcelBranchName(invoice.branchName) || 'عام',
    customerCode: cleanProductCode(invoice.customerCode) || '---',
    customerName: invoice.customerName || '---',
    customerPhone: invoice.customerPhone || '',
    productCode: cleanProductCode(item.productCode || product?.code),
    unifiedCode: item.unifiedCode || product?.unifiedCode || '---',
    productName: item.productName || product?.name || 'صنف',
    color: item.color || product?.color || '',
    cartonFactor: factor,
    cartons: toNumber(item.cartonCount),
    pieces: toNumber(item.pieceCount),
    totalPieces: itemTotalPieces(item),
    pricePerCarton: toNumber(item.appliedPrice || item.pricePerCarton || item.unitPrice),
    pricePerPiece: toNumber(item.pricePerPiece),
    totalBeforeTax: toNumber(item.totalBeforeTax),
    invoiceDiscountPercent: toNumber(invoice.discountPercentage),
    discountAmount: toNumber(item.discountAmount),
    netTotal: toNumber(item.netTotal),
    source: isShortageLine(item) ? MAIN_WAREHOUSE_LABEL : invoice.branchName,
    paymentMethod: String(invoice.paymentMethod || ''),
    status: invoice.status || '',
  };
}

const erpRowArray = (row: DispatchRow): (string | number)[] => [
  row.invoiceNumber,
  row.date,
  row.repId,
  row.repName,
  row.branchName,
  row.customerCode,
  row.customerName,
  row.customerPhone,
  row.productCode,
  row.unifiedCode,
  row.productName,
  row.color,
  row.cartonFactor,
  row.cartons,
  row.pieces,
  row.totalPieces,
  row.pricePerCarton,
  row.pricePerPiece,
  row.totalBeforeTax,
  row.invoiceDiscountPercent,
  row.discountAmount,
  row.netTotal,
  row.source,
  row.paymentMethod,
  row.status,
];

const groupSummary = (
  lines: DispatchRow[],
  key: 'repName' | 'branchName'
): DispatchSummaryRow[] => {
  const map = new Map<string, DispatchSummaryRow & { productKeys: Set<string>; invoiceKeys: Set<string> }>();
  lines.forEach((line) => {
    const label = line[key] || 'غير محدد';
    const entry = map.get(label) || {
      label,
      invoices: 0,
      products: 0,
      cartons: 0,
      pieces: 0,
      productKeys: new Set<string>(),
      invoiceKeys: new Set<string>(),
    };
    entry.cartons += line.cartons;
    entry.pieces += line.pieces;
    entry.productKeys.add(normalizeKey(line.unifiedCode || line.productCode));
    entry.invoiceKeys.add(line.invoiceNumber);
    map.set(label, entry);
  });
  return Array.from(map.values())
    .map(({ productKeys, invoiceKeys, ...rest }) => ({
      ...rest,
      invoices: invoiceKeys.size,
      products: productKeys.size,
    }))
    .sort((a, b) => b.cartons - a.cartons || b.pieces - a.pieces);
};

/**
 * Gathers the shortage request and the approved orders for a period.
 *
 * `invoices` should already be scoped to what the signed-in role may see, so a
 * supervisor's pack contains his own reps and a branch manager's contains only their
 * branch without this function needing to know the rules.
 */
export function buildDispatchReport(
  invoices: Invoice[],
  products: Product[],
  filter: DispatchFilter = {}
): DispatchReport {
  const from = filter.from || '';
  const to = filter.to || '';
  const scope = filter.scope || 'both';

  const inPeriod = (date: string) => {
    if (from && (!date || date < from)) return false;
    if (to && (!date || date > to)) return false;
    return true;
  };

  const productByKey = new Map<string, Product>();
  products.forEach((p) => {
    const key = normalizeKey(p.unifiedCode || p.code || p.id);
    if (key) productByKey.set(key, p);
  });

  const wantShortage = scope === 'shortage' || scope === 'both';
  const wantApproved = scope === 'approved' || scope === 'both';

  const shortageLines: DispatchRow[] = [];
  const approvedLines: DispatchRow[] = [];
  const shortageInvoiceKeys = new Set<string>();
  const approvedInvoiceKeys = new Set<string>();
  const summaryMap = new Map<string, ShortageItem>();

  invoices.forEach((invoice) => {
    if (!inPeriod(invoice.date)) return;

    // Shortage: an open -NQ invoice, or any invoice line the rep marked as central.
    if (wantShortage && isOpenShortage(invoice)) {
      shortageInvoiceKeys.add(invoice.id || invoice.invoiceNumber);
      (invoice.items || []).forEach((item) => {
        const product = productByKey.get(normalizeKey(item.unifiedCode || item.productCode));
        shortageLines.push(toDispatchRow(invoice, item, product));

        const cartons = toNumber(item.cartonCount);
        const pieces = toNumber(item.pieceCount);
        if (cartons <= 0 && pieces <= 0) return;

        const key = normalizeKey(item.unifiedCode || item.productCode);
        const available =
          toNumber(product?.mainWarehouseActual) + toNumber(product?.mainWarehouseReserved);
        const line = summaryMap.get(key) || {
          productKey: key,
          productCode: item.productCode || product?.code || '---',
          unifiedCode: item.unifiedCode || product?.unifiedCode || '---',
          productName: item.productName || product?.name || '---',
          itemGroup: item.itemGroup || product?.itemGroup || product?.department || 'عام',
          familyName: item.familyName || product?.familyName || 'عام',
          cartonFactor: itemCartonFactor(item),
          cartons: 0,
          pieces: 0,
          totalPieces: 0,
          mainWarehouseAvailable: available,
          netToRequest: 0,
          invoiceCount: 0,
          repNames: [],
          branchNames: [],
        };
        line.cartons += cartons;
        line.pieces += pieces;
        line.totalPieces += itemTotalPieces(item);
        line.invoiceCount += 1;
        const repName = invoice.repName || 'غير محدد';
        const branchName = normalizeExcelBranchName(invoice.branchName) || 'عام';
        if (!line.repNames.includes(repName)) line.repNames.push(repName);
        if (!line.branchNames.includes(branchName)) line.branchNames.push(branchName);
        summaryMap.set(key, line);
      });
    }

    // Approved / executed orders, for the branch manager's own dispatch.
    if (wantApproved && isApprovedOrExecuted(invoice)) {
      approvedInvoiceKeys.add(invoice.id || invoice.invoiceNumber);
      (invoice.items || []).forEach((item) => {
        const product = productByKey.get(normalizeKey(item.unifiedCode || item.productCode));
        approvedLines.push(toDispatchRow(invoice, item, product));
      });
    }
  });

  const shortageSummary = Array.from(summaryMap.values())
    .map((line) => ({
      ...line,
      netToRequest: Math.max(0, line.cartons - line.mainWarehouseAvailable),
    }))
    .sort((a, b) => b.netToRequest - a.netToRequest || b.cartons - a.cartons);

  const totalCartons = shortageSummary.reduce((sum, l) => sum + l.cartons, 0);
  const totalPieces = shortageSummary.reduce((sum, l) => sum + l.totalPieces, 0);

  return {
    from,
    to,
    scopeLabel: filter.scopeLabel || 'الكل',
    scope,
    shortageInvoiceCount: shortageInvoiceKeys.size,
    approvedInvoiceCount: approvedInvoiceKeys.size,
    productCount: shortageSummary.length,
    totalCartons,
    totalPieces,
    shortageSummary,
    shortageLines,
    approvedLines,
    byRep: groupSummary(shortageLines, 'repName'),
    byBranch: groupSummary(shortageLines, 'branchName'),
    totals: [
      { label: 'إجمالي طلب النواقص', invoices: shortageInvoiceKeys.size, products: shortageSummary.length, cartons: totalCartons, pieces: totalPieces },
      { label: 'الطلبيات المعتمدة المنفذة', invoices: approvedInvoiceKeys.size, products: new Set(approvedLines.map((l) => normalizeKey(l.unifiedCode || l.productCode))).size, cartons: approvedLines.reduce((s, l) => s + l.cartons, 0), pieces: approvedLines.reduce((s, l) => s + l.totalPieces, 0) },
    ],
  };
}

const NAVY = '0F172A';
const BORDER = 'CBD5E1';
const PALE = 'F1F5F9';

type Sheet = Record<string, any>;

const border = {
  top: { style: 'thin', color: { rgb: BORDER } },
  bottom: { style: 'thin', color: { rgb: BORDER } },
  left: { style: 'thin', color: { rgb: BORDER } },
  right: { style: 'thin', color: { rgb: BORDER } },
};

const TITLE_STYLE = {
  font: { name: 'Segoe UI', bold: true, sz: 13, color: { rgb: NAVY } },
  fill: { fgColor: { rgb: 'FEF3C7' } },
  alignment: { horizontal: 'right', vertical: 'center' },
};

const HEADER_STYLE = {
  font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
  fill: { fgColor: { rgb: NAVY } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border,
};

const SUBTITLE_STYLE = {
  font: { name: 'Segoe UI', bold: true, sz: 9.5, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '334155' } },
  alignment: { horizontal: 'right', vertical: 'center' },
};

const dataStyle = (rowIndex: number) => ({
  font: { name: 'Segoe UI', sz: 9.5, color: { rgb: '1E293B' } },
  fill: rowIndex % 2 === 0 ? { fgColor: { rgb: PALE } } : undefined,
  alignment: { vertical: 'center' },
  border,
});

let XLSX: typeof import('xlsx-js-style');

/**
 * Builds and downloads the workbook. The Excel engine is imported on demand so the
 * ~870 KB library only loads when a dispatch sheet is actually exported.
 */
export async function downloadDispatchReport(report: DispatchReport): Promise<void> {
  XLSX = XLSX || (await import('xlsx-js-style'));
  const wb = XLSX.utils.book_new();
  const titleRows = (title: string, subtitle: string) => [
    [title],
    [subtitle],
    [],
  ];

  /**
   * One sheet = a title band, an optional subtitle band, the real column headers, then
   * the data. Styling is applied per band rather than per whole sheet so the title stays
   * readable when the file is opened in their system.
   */
  const addSheet = (
    name: string,
    titleRows: string[][],
    columnHeaders: (string | number)[][],
    dataRows: (string | number)[][],
    widths: number[]
  ) => {
    const sheet = XLSX.utils.aoa_to_sheet([...titleRows, ...columnHeaders, ...dataRows]);
    sheet['!views'] = [{ RTL: true }];
    sheet['!sheetView'] = [{ rightToLeft: true }];
    sheet['!cols'] = widths.map((wch) => ({ wch }));

    const headerRowIndex = titleRows.length;
    for (let r = 0; r < headerRowIndex + columnHeaders.length + dataRows.length; r++) {
      for (let c = 0; c < widths.length; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        if (r === 0) cell.s = TITLE_STYLE;
        else if (r < headerRowIndex) cell.s = SUBTITLE_STYLE;
        else if (r === headerRowIndex) cell.s = HEADER_STYLE;
        else cell.s = dataStyle(r - headerRowIndex - 1);
      }
    }
    XLSX.utils.book_append_sheet(wb, sheet, name);
  };

  const period =
    report.from && report.to
      ? `من ${report.from} إلى ${report.to}`
      : 'كل الفترات';
  const scopeLine = `${report.scopeLabel} — ${period}`;
  const title = (sheetTitle: string) => [
    [sheetTitle],
    [`النطاق: ${scopeLine}`],
    [`عدد الفواتير: ${report.shortageInvoiceCount} نواقص / ${report.approvedInvoiceCount} معتمدة — إجمالي الكراتين: ${report.totalCartons}`],
    [],
  ];

  // 1. The working sheet: one row per product with the quantities to be supplied.
  addSheet(
    'طلب_النواقص_مجمع',
    title('طلب النواقص للمخزن المركزي - 6 أكتوبر'),
    [[
      '#', 'كود المنتج', 'الكود الموحد', 'اسم الصنف', 'المجموعة', 'العائلة',
      'شدة الكرتونة', 'إجمالي الكراتين المطلوبة', 'إجمالي القطع الفردية',
      'إجمالي القطع', 'رصيد المخزن المركزي', 'الصافي المطلوب من المخزن',
      'عدد الفواتير', 'المناديب', 'الفروع',
    ]],
    report.shortageSummary.map((line, index) => [
      index + 1,
      line.productCode,
      line.unifiedCode,
      line.productName,
      line.itemGroup,
      line.familyName,
      line.cartonFactor,
      line.cartons,
      line.pieces,
      line.totalPieces,
      line.mainWarehouseAvailable,
      line.netToRequest,
      line.invoiceCount,
      line.repNames.join(' + '),
      line.branchNames.join(' + '),
    ]),
    [5, 15, 15, 34, 16, 16, 12, 20, 18, 14, 18, 20, 12, 24, 24]
  );

  // 2. The same shortage lines in the exact ERP invoice layout, for their system.
  if (report.shortageLines.length > 0) {
    addSheet(
      'بيانات_النواقص_ERP',
      title('بيانات النواقص - فورمات السيستم'),
      [ERP_HEADERS],
      report.shortageLines.map(erpRowArray),
      [16, 14, 12, 20, 18, 15, 26, 15, 14, 16, 34, 12, 12, 12, 12, 13, 13, 12, 18, 16, 16, 14, 24, 14, 16]
    );
  }

  // 3. Human-readable per-invoice view of the shortage request.
  if (report.shortageLines.length > 0) {
    addSheet(
      'تفاصيل_فواتير_النواقص',
      title('تفاصيل فواتير النواقص'),
      [['رقم الفاتورة', 'التاريخ', 'الفرع', 'المندوب', 'العميل', 'كود الصنف', 'اسم الصنف', 'الكراتين', 'القطع', 'الحالة']],
      report.shortageLines.map((line) => [
        line.invoiceNumber, line.date, line.branchName, line.repName, line.customerName,
        line.productCode, line.productName, line.cartons, line.pieces, line.status,
      ]),
      [16, 12, 16, 20, 26, 14, 34, 10, 10, 18]
    );
  }

  // 4. Approved / executed orders, for the branch manager's own store.
  if (report.approvedLines.length > 0) {
    addSheet(
      'الطلبيات_المعتمدة',
      title('الطلبيات المعتمدة / المنفذة'),
      [ERP_HEADERS],
      report.approvedLines.map(erpRowArray),
      [16, 14, 12, 20, 18, 15, 26, 15, 14, 16, 34, 12, 12, 12, 12, 13, 13, 12, 18, 16, 16, 14, 24, 14, 16]
    );
  }

  // 5. Per-rep and per-branch quantities.
  if (report.byRep.length > 0) {
    addSheet(
      'ملخص_المناديب',
      title('ملخص النواقص حسب المندوب'),
      [['المندوب', 'عدد الفواتير', 'عدد الأصناف', 'إجمالي الكراتين', 'إجمالي القطع']],
      report.byRep.map((r) => [r.label, r.invoices, r.products, r.cartons, r.pieces]),
      [24, 14, 14, 16, 14]
    );
  }
  if (report.byBranch.length > 0) {
    addSheet(
      'ملخص_الفروع',
      title('ملخص النواقص حسب الفرع'),
      [['الفرع', 'عدد الفواتير', 'عدد الأصناف', 'إجمالي الكراتين', 'إجمالي القطع']],
      report.byBranch.map((r) => [r.label, r.invoices, r.products, r.cartons, r.pieces]),
      [24, 14, 14, 16, 14]
    );
  }

  // 6. Totals header, so the first thing anyone opens is the number they were asked for.
  addSheet(
    'الملخص',
    title('ملخص الطلب'),
    [['البند', 'عدد الفواتير', 'عدد الأصناف', 'الكراتين', 'القطع']],
    report.totals.map((t) => [t.label, t.invoices, t.products, t.cartons, t.pieces]),
    [34, 14, 14, 14, 14]
  );

  const safeScope = (report.scopeLabel || 'الكل').replace(/[\\/:*?"<>|]/g, '');
  const range = report.from && report.to ? `${report.from}_${report.to}` : 'كل_الفترات';
  XLSX.writeFile(wb, `طلب_النواقص_${safeScope}_${range}.xlsx`);
}
