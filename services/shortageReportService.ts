import type { Invoice, Product } from '../types';

/**
 * Consolidated shortage request for the central (October) warehouse.
 *
 * When an order mixes branch stock with items the rep wants pulled from the main
 * warehouse, the app splits it: the branch portion becomes the sales invoice and
 * the warehouse portion becomes a separate "-NQ" invoice (see createOrder in
 * AppContext). Those -NQ invoices are therefore already an exact "please supply
 * this" list per order - this service only has to gather them.
 *
 * Open = the shortage invoice has not reached a closing status yet. No extra
 * per-line tracking field is involved, so a request disappears from the sheet
 * automatically once it is delivered, cancelled or rejected.
 */

// Closing statuses: the request is settled and must not be requested again.
const CLOSED_STATUSES: string[] = [
  'تم التسليم',
  'إغلاق الطلبية',
  'ملغاة',
  'مرفوضة / ملغاة',
];

export function isShortageInvoice(invoice: Invoice): boolean {
  return Boolean(
    invoice.isShortageInvoice ||
      (invoice.invoiceNumber && invoice.invoiceNumber.endsWith('-NQ'))
  );
}

export function isOpenShortage(invoice: Invoice): boolean {
  return isShortageInvoice(invoice) && !CLOSED_STATUSES.includes(invoice.status);
}

export interface ShortageFilter {
  /** Inclusive YYYY-MM-DD bounds on invoice.date. */
  from?: string;
  to?: string;
  branchName?: string;
}

export interface ShortageLine {
  productKey: string;
  productCode: string;
  unifiedCode: string;
  productName: string;
  cartonCount: number;
  pieceCount: number;
  invoiceCount: number;
  /** What the central warehouse can actually cover right now. */
  mainWarehouseAvailable: number;
  /** Request minus availability, never below zero. */
  netToRequest: number;
  branchNames: string[];
}

export interface ShortageDetailLine {
  invoiceNumber: string;
  date: string;
  branchName: string;
  repName: string;
  customerName: string;
  productCode: string;
  unifiedCode: string;
  productName: string;
  cartonCount: number;
  pieceCount: number;
  status: string;
}

export interface RepShortageLine {
  repName: string;
  branchName: string;
  invoiceCount: number;
  productCount: number;
  cartonCount: number;
  pieceCount: number;
}

export interface ShortageReport {
  from: string;
  to: string;
  scopeLabel: string;
  invoiceCount: number;
  productCount: number;
  totalCartons: number;
  totalPieces: number;
  summary: ShortageLine[];
  details: ShortageDetailLine[];
  byRep: RepShortageLine[];
}

const normalizeKey = (value: string): string =>
  (value || '').replace(/^#/, '').replace(/\s+/g, '').toLowerCase();

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const inDateRange = (date: string, from?: string, to?: string): boolean => {
  if (!date) return true;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
};

/**
 * Gathers every open shortage invoice visible to the caller and aggregates it
 * three ways: one row per product for the warehouse, one row per invoice line for
 * traceability, and one row per rep for the supervisor.
 *
 * `invoices` should already be role-scoped (getVisibleInvoices does that), so a
 * supervisor sees their team and a branch manager sees their branch without any
 * extra filtering here.
 */
export function buildShortageReport(
  invoices: Invoice[],
  products: Product[],
  filter: ShortageFilter = {}
): ShortageReport {
  // Unset bounds mean "every open shortage invoice", which is what the in-app
  // export button wants. Defaulting to today would silently ship an empty sheet.
  const from = filter.from || '';
  const to = filter.to || '';

  const stockByKey = new Map<string, number>();
  products.forEach((p) => {
    const key = normalizeKey(p.unifiedCode || p.code || p.id);
    if (!key) return;
    stockByKey.set(key, toNumber(p.mainWarehouseActual) + toNumber(p.mainWarehouseReserved));
  });
  const nameByKey = new Map<string, string>();
  products.forEach((p) => {
    const key = normalizeKey(p.unifiedCode || p.code || p.id);
    if (key && !nameByKey.has(key)) nameByKey.set(key, p.name);
  });

  const shortages = invoices.filter(
    (inv) => isOpenShortage(inv) && inDateRange(inv.date, from, to)
  );

  const summaryMap = new Map<string, ShortageLine>();
  const details: ShortageDetailLine[] = [];
  const repMap = new Map<string, RepShortageLine>();

  shortages.forEach((inv) => {
    const repName = inv.repName || 'غير محدد';
    const branchName = inv.branchName || 'غير محدد';
    const repKey = `${normalizeKey(repName)}::${normalizeKey(branchName)}`;
    const repRow = repMap.get(repKey) || {
      repName,
      branchName,
      invoiceCount: 0,
      productCount: 0,
      cartonCount: 0,
      pieceCount: 0,
    };
    repRow.invoiceCount += 1;
    const repProducts = new Set<string>();

    (inv.items || []).forEach((item) => {
      const cartons = toNumber(item.cartonCount);
      const pieces = toNumber(item.pieceCount);
      if (cartons <= 0 && pieces <= 0) return;

      const key = normalizeKey(item.unifiedCode || item.productCode || item.productId);
      const line = summaryMap.get(key) || {
        productKey: key,
        productCode: item.productCode || '---',
        unifiedCode: item.unifiedCode || '---',
        productName: item.productName || nameByKey.get(key) || '---',
        cartonCount: 0,
        pieceCount: 0,
        invoiceCount: 0,
        mainWarehouseAvailable: stockByKey.get(key) || 0,
        netToRequest: 0,
        branchNames: [],
      };
      line.cartonCount += cartons;
      line.pieceCount += pieces;
      if (!line.branchNames.includes(branchName)) line.branchNames.push(branchName);
      summaryMap.set(key, line);

      details.push({
        invoiceNumber: inv.invoiceNumber || inv.id,
        date: inv.date,
        branchName,
        repName,
        customerName: inv.customerName || '---',
        productCode: item.productCode || '---',
        unifiedCode: item.unifiedCode || '---',
        productName: item.productName || '---',
        cartonCount: cartons,
        pieceCount: pieces,
        status: inv.status,
      });

      repRow.cartonCount += cartons;
      repRow.pieceCount += pieces;
      repProducts.add(key);
    });

    repRow.productCount += repProducts.size;
    repMap.set(repKey, repRow);
  });

  const summary = Array.from(summaryMap.values())
    .map((line) => ({
      ...line,
      netToRequest: Math.max(0, line.cartonCount - line.mainWarehouseAvailable),
      branchNames: line.branchNames,
    }))
    // What the warehouse is short on first, biggest first.
    .sort((a, b) => b.netToRequest - a.netToRequest || b.cartonCount - a.cartonCount);

  return {
    from,
    to,
    scopeLabel: filter.branchName || 'الكل',
    invoiceCount: shortages.length,
    productCount: summary.length,
    totalCartons: summary.reduce((sum, l) => sum + l.cartonCount, 0),
    totalPieces: summary.reduce((sum, l) => sum + l.pieceCount, 0),
    summary,
    details,
    byRep: Array.from(repMap.values()).sort((a, b) => b.cartonCount - a.cartonCount),
  };
}

const HEADER_FILL = 'FF0F172A';

const styleSheet = (sheet: XLSXStyleSheet, widths: number[]): void => {
  const range = (sheet as unknown as { ['!ref']?: string })['!ref'];
  if (!range) return;
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  const rows = range.split(':');
  const lastColumn = rows[1] ? rows[1].replace(/[0-9]/g, '') : 'A1';
  const firstRow = rows[0].replace(/[0-9]/g, '');
  const header: Record<string, unknown> = {
    fill: { fgColor: { rgb: HEADER_FILL } },
    font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11 },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: THIN_BORDER,
  };
  for (let col = colNumber(firstRow); col <= colNumber(lastColumn); col++) {
    const key = `${colName(col)}1`;
    const existing = sheet[key] as Record<string, unknown> | undefined;
    sheet[key] = { ...(existing || {}), s: header };
  }
};

const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
};

type XLSXStyleSheet = Record<string, unknown> & { ['!ref']?: string };

const colName = (index: number): string => {
  let name = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

const colNumber = (name: string): number => {
  let n = 0;
  for (let i = 0; i < name.length; i++) n = n * 26 + (name.charCodeAt(i) - 64);
  return n;
};

/**
 * Builds and downloads the workbook. The Excel engine is imported here rather
 * than at module scope so the ~900 KB library only loads when someone actually
 * exports a shortage report.
 */
export async function downloadShortageReport(
  report: ShortageReport,
  scopeTitle: string
): Promise<void> {
  const XLSX = await import('xlsx-js-style');

  const summaryRows = report.summary.map((line, index) => ({
    '#': index + 1,
    'كود المنتج': line.productCode,
    'الكود الموحد': line.unifiedCode,
    'اسم المنتج': line.productName,
    'عدد الكراتين المطلوبة': line.cartonCount,
    'عدد القطع': line.pieceCount,
    'رصيد المخزن الرئيسي': line.mainWarehouseAvailable,
    'المطلوب فعلياً من المخزن': line.netToRequest,
    'عدد الفواتير': line.invoiceCount,
    'الفروع': line.branchNames.join(' + '),
  }));

  const detailRows = report.details.map((line, index) => ({
    '#': index + 1,
    'رقم الفاتورة': line.invoiceNumber,
    'التاريخ': line.date,
    'الفرع': line.branchName,
    'المندوب': line.repName,
    'العميل': line.customerName,
    'كود المنتج': line.productCode,
    'الكود الموحد': line.unifiedCode,
    'اسم المنتج': line.productName,
    'عدد الكراتين': line.cartonCount,
    'عدد القطع': line.pieceCount,
    'حالة الطلب': line.status,
  }));

  const repRows = report.byRep.map((line, index) => ({
    '#': index + 1,
    'المندوب': line.repName,
    'الفرع': line.branchName,
    'عدد الفواتير': line.invoiceCount,
    'عدد الأصناف الناقصة': line.productCount,
    'إجمالي الكراتين': line.cartonCount,
    'إجمالي القطع': line.pieceCount,
  }));

  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  styleSheet(summarySheet, [5, 16, 16, 40, 20, 12, 18, 22, 12, 26]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'ملخص طلب المخزن');

  if (detailRows.length > 0) {
    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    styleSheet(detailSheet, [5, 18, 12, 18, 20, 26, 16, 16, 40, 14, 12, 22]);
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'تفاصيل الفواتير');
  }

  if (repRows.length > 0) {
    const repSheet = XLSX.utils.json_to_sheet(repRows);
    styleSheet(repSheet, [5, 22, 18, 14, 20, 16, 14]);
    XLSX.utils.book_append_sheet(workbook, repSheet, 'ملخص المناديب');
  }

  const safeTitle = (scopeTitle || 'الكل').replace(/[\\\\/:*?"<>|]/g, '');
  XLSX.writeFile(
    workbook,
    `طلب_النواقص_${safeTitle}_${report.from && report.to ? `من_${report.from}_إلى_${report.to}` : 'كل_الفترات'}.xlsx`
  );
}