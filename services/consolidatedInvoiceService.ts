import * as XLSX from 'xlsx-js-style';
import { Invoice, Product } from '../types';
import { getBranchStockForProduct } from './arabicMatchingService';
import { cleanProductCode } from './excelService';

export interface ConsolidatedInvoiceSource {
  invoiceNumber: string;
  customerName: string;
  repName?: string;
  cartons: number;
  pieces: number;
  date?: string;
}

export interface ConsolidatedProductLine {
  id: string;
  productKey: string;
  productCode: string;
  unifiedCode: string;
  productName: string;
  cartonFactor: number; // شدة الكرتونة
  cartonCount: number; // عدد الكرتون
  pieceCount: number; // عدد القطع
  totalPieces: number; // إجمالي القطع الكلي
  pricePerCarton: number;
  pricePerPiece: number;
  totalPrice: number;
  branchStock: number; // رصيد مخزن الفرع (بالكرتون)
  octoberStock: number; // رصيد مخزن أكتوبر المركزي (بالكرتون)
  requiredFromOctober: number; // المطلوب توريده وصرفه من مخزن أكتوبر (بالكرتون)
  supplyStatus: 'متوفر بالفرع بالكامل' | 'عجز جزئي - توريد من أكتوبر' | 'نواقص بالكامل - توريد من أكتوبر';
  octoberCoverageStatus: 'متوفر بأكتوبر ويغطي الطلب 🟢' | 'عجز بمخزن أكتوبر يتطلب تشغيل 🔴';
  invoicesCount: number;
  sources: ConsolidatedInvoiceSource[];
}

export interface ConsolidatedOrderSummary {
  invoicesCount: number;
  uniqueCustomersCount: number;
  productCount: number;
  totalCartons: number;
  totalPieces: number;
  grandTotalPieces: number;
  totalAmount: number;
  totalRequiredFromOctober: number;
  totalBranchAvailableCartons: number;
  octoberDeficitCount: number;
  branchName: string;
  dateLabel: string;
  invoiceNumbers: string[];
  lines: ConsolidatedProductLine[];
}

/**
 * Consolidates multiple invoices into a single unified aggregated order
 * and performs data analysis against branch stock and October central warehouse stock.
 */
export function buildConsolidatedInvoicesData(
  invoices: Invoice[],
  products: Product[],
  defaultBranch = 'الفرع الرئيسي'
): ConsolidatedOrderSummary {
  if (!invoices || invoices.length === 0) {
    return {
      invoicesCount: 0,
      uniqueCustomersCount: 0,
      productCount: 0,
      totalCartons: 0,
      totalPieces: 0,
      grandTotalPieces: 0,
      totalAmount: 0,
      totalRequiredFromOctober: 0,
      totalBranchAvailableCartons: 0,
      octoberDeficitCount: 0,
      branchName: defaultBranch,
      dateLabel: new Date().toLocaleDateString('ar-EG'),
      invoiceNumbers: [],
      lines: [],
    };
  }

  // Determine branch name from invoices or default
  const branchName = invoices[0]?.branchName || defaultBranch;
  const uniqueCustomers = new Set<string>();
  const invoiceNumbers: string[] = [];

  // Map to consolidate lines by normalized product code or name
  const lineMap = new Map<string, {
    productCode: string;
    unifiedCode: string;
    productName: string;
    cartonFactor: number;
    cartonCount: number;
    pieceCount: number;
    pricePerCarton: number;
    pricePerPiece: number;
    totalPrice: number;
    product?: Product;
    sources: ConsolidatedInvoiceSource[];
  }>();

  invoices.forEach((inv) => {
    invoiceNumbers.push(inv.invoiceNumber);
    if (inv.customerName) uniqueCustomers.add(inv.customerName);

    (inv.items || []).forEach((item) => {
      const code = cleanProductCode(item.product?.code || (item as any).productCode);
      const unified = (item.product?.unifiedCode || (item as any).unifiedCode || '').replace(/^#/, '').trim();
      const name = item.product?.name || (item as any).productName || 'صنف غير محدد';
      const key = (code || unified || name).toLowerCase().trim();

      // Find matched master product from products list
      const matchedProduct = products.find((p) => {
        if (code && cleanProductCode(p.code) === code) return true;
        if (unified && p.unifiedCode && p.unifiedCode.replace(/^#/, '').trim() === unified) return true;
        return p.name.trim().toLowerCase() === name.trim().toLowerCase();
      }) || item.product;

      const factor = Number(matchedProduct?.cartonQuantity || item.cartonQuantity || 12) || 12;
      const cartons = Number(item.cartonCount || 0);
      const pieces = Number(item.pieceCount || 0);
      const pricePerCarton = Number(item.pricePerCarton || (item.unitPrice ? item.unitPrice * factor : 0));
      const pricePerPiece = Number(item.pricePerPiece || (factor > 0 ? pricePerCarton / factor : 0));
      const lineTotal = Number(item.totalPrice || (cartons * pricePerCarton + pieces * pricePerPiece));

      const existing = lineMap.get(key);
      if (existing) {
        existing.cartonCount += cartons;
        existing.pieceCount += pieces;
        existing.totalPrice += lineTotal;
        if (pricePerCarton > 0 && existing.pricePerCarton === 0) existing.pricePerCarton = pricePerCarton;
        if (pricePerPiece > 0 && existing.pricePerPiece === 0) existing.pricePerPiece = pricePerPiece;
        existing.sources.push({
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerName,
          repName: inv.repName,
          cartons,
          pieces,
          date: inv.date,
        });
      } else {
        lineMap.set(key, {
          productCode: code || matchedProduct?.code || '---',
          unifiedCode: unified || (matchedProduct?.unifiedCode || '').replace(/^#/, ''),
          productName: name,
          cartonFactor: factor,
          cartonCount: cartons,
          pieceCount: pieces,
          pricePerCarton,
          pricePerPiece,
          totalPrice: lineTotal,
          product: matchedProduct,
          sources: [{
            invoiceNumber: inv.invoiceNumber,
            customerName: inv.customerName,
            repName: inv.repName,
            cartons,
            pieces,
            date: inv.date,
          }],
        });
      }
    });
  });

  // Calculate detailed analysis and required October warehouse supply
  let grandTotalCartons = 0;
  let grandTotalPieces = 0;
  let grandTotalUnits = 0;
  let grandTotalAmount = 0;
  let totalRequiredOctober = 0;
  let totalBranchAvailable = 0;
  let octoberDeficitCount = 0;

  const lines: ConsolidatedProductLine[] = [];

  lineMap.forEach((entry, key) => {
    const factor = entry.cartonFactor || 12;
    // Normalize extra pieces into cartons if pieces >= factor
    let normalizedCartons = entry.cartonCount;
    let normalizedPieces = entry.pieceCount;
    if (normalizedPieces >= factor) {
      const extraCartons = Math.floor(normalizedPieces / factor);
      normalizedCartons += extraCartons;
      normalizedPieces = normalizedPieces % factor;
    }

    const totalIndividualPieces = normalizedCartons * factor + normalizedPieces;

    // Branch stock and October stock
    const branchStock = entry.product ? getBranchStockForProduct(entry.product, branchName) : 0;
    const octoberStock = entry.product ? (entry.product.mainWarehouseActual ?? 0) : 0;

    // How much can the branch supply?
    const branchAvailable = Math.max(0, Math.min(branchStock, normalizedCartons));
    // How much must come from October central warehouse?
    const requiredFromOctober = Math.max(0, normalizedCartons - branchAvailable);

    // Fulfillment status
    let supplyStatus: ConsolidatedProductLine['supplyStatus'] = 'متوفر بالفرع بالكامل';
    if (requiredFromOctober >= normalizedCartons && normalizedCartons > 0) {
      supplyStatus = 'نواقص بالكامل - توريد من أكتوبر';
    } else if (requiredFromOctober > 0) {
      supplyStatus = 'عجز جزئي - توريد من أكتوبر';
    }

    // October coverage status
    let octoberCoverageStatus: ConsolidatedProductLine['octoberCoverageStatus'] = 'متوفر بأكتوبر ويغطي الطلب 🟢';
    if (requiredFromOctober > octoberStock) {
      octoberCoverageStatus = 'عجز بمخزن أكتوبر يتطلب تشغيل 🔴';
      octoberDeficitCount++;
    }

    grandTotalCartons += normalizedCartons;
    grandTotalPieces += normalizedPieces;
    grandTotalUnits += totalIndividualPieces;
    grandTotalAmount += entry.totalPrice;
    totalRequiredOctober += requiredFromOctober;
    totalBranchAvailable += branchAvailable;

    lines.push({
      id: key,
      productKey: key,
      productCode: entry.productCode,
      unifiedCode: entry.unifiedCode ? `#${entry.unifiedCode}` : '---',
      productName: entry.productName,
      cartonFactor: factor,
      cartonCount: normalizedCartons,
      pieceCount: normalizedPieces,
      totalPieces: totalIndividualPieces,
      pricePerCarton: entry.pricePerCarton,
      pricePerPiece: entry.pricePerPiece,
      totalPrice: entry.totalPrice,
      branchStock,
      octoberStock,
      requiredFromOctober,
      supplyStatus,
      octoberCoverageStatus,
      invoicesCount: entry.sources.length,
      sources: entry.sources,
    });
  });

  // Sort lines: Shortages first, then by carton count descending
  lines.sort((a, b) => {
    if (a.requiredFromOctober > 0 && b.requiredFromOctober === 0) return -1;
    if (b.requiredFromOctober > 0 && a.requiredFromOctober === 0) return 1;
    return b.cartonCount - a.cartonCount;
  });

  return {
    invoicesCount: invoices.length,
    uniqueCustomersCount: uniqueCustomers.size,
    productCount: lines.length,
    totalCartons: grandTotalCartons,
    totalPieces: grandTotalPieces,
    grandTotalPieces: grandTotalUnits,
    totalAmount: grandTotalAmount,
    totalRequiredFromOctober: totalRequiredOctober,
    totalBranchAvailableCartons: totalBranchAvailable,
    octoberDeficitCount,
    branchName,
    dateLabel: new Date().toLocaleDateString('ar-EG'),
    invoiceNumbers,
    lines,
  };
}

/**
 * Exports a beautifully styled Excel workbook representing the consolidated invoice
 * and October warehouse replenishment analysis with exact columns required:
 * منتجات والكود والكود الموحد وعدد الكرتون وعدد القطع وشده الكرتونه والاجمالي
 */
export function exportConsolidatedInvoiceToExcel(
  summary: ConsolidatedOrderSummary,
  options?: { exportDate?: string; customTitle?: string }
): void {
  const wb = XLSX.utils.book_new();

  const title = options?.customTitle || 'مجموعة الطنطاوي للتجارة والتوزيع — بيان دمج الفواتير وطلب توريد مخزن 6 أكتوبر';
  const exportDate = options?.exportDate || new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Header Rows
  const rows: any[][] = [
    [title],
    [`الفرع: ${summary.branchName}`, `تاريخ البيان: ${exportDate}`, `عدد الفواتير المدمجة: ${summary.invoicesCount}`, `عدد العملاء: ${summary.uniqueCustomersCount}`],
    [
      `إجمالي الكراتين المطلوبة: ${summary.totalCartons} كرتونة`,
      `إجمالي القطع: ${summary.totalPieces} قطعة`,
      `المطلوب توريده من مخزن أكتوبر: ${summary.totalRequiredFromOctober} كرتونة`,
      `الإجمالي المالي: ${summary.totalAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م`,
    ],
    [], // Blank line
    // Table Headers:
    [
      'م',
      'اسم المنتج',
      'كود الصنف',
      'الكود الموحد',
      'شدة الكرتونة',
      'عدد الكرتون',
      'عدد القطع',
      'إجمالي القطع الكلي',
      'سعر الكرتونة (ج.م)',
      'الإجمالي (ج.م)',
      'رصيد مخزن الفرع (ك)',
      'رصيد مخزن أكتوبر (ك)',
      'المطلوب توريده من مخزن أكتوبر (ك)',
      'حالة الصرف والتوريد',
      'تغطية مخزن أكتوبر',
      'عدد الفواتير',
      'بيان الفواتير والعملاء',
    ],
  ];

  // Table Body Rows
  summary.lines.forEach((line, index) => {
    const sourcesText = line.sources
      .slice(0, 4)
      .map((s) => `#${s.invoiceNumber} (${s.customerName}: ${s.cartons}ك)`)
      .join(' • ') + (line.sources.length > 4 ? ` + ${line.sources.length - 4} فواتير أخرى` : '');

    rows.push([
      index + 1,
      line.productName,
      line.productCode,
      line.unifiedCode,
      line.cartonFactor,
      line.cartonCount,
      line.pieceCount,
      line.totalPieces,
      Number(line.pricePerCarton.toFixed(2)),
      Number(line.totalPrice.toFixed(2)),
      line.branchStock,
      line.octoberStock,
      line.requiredFromOctober,
      line.supplyStatus,
      line.octoberCoverageStatus,
      line.invoicesCount,
      sourcesText,
    ]);
  });

  // Table Totals Row
  rows.push([
    'الإجمالي',
    `إجمالي الأصناف: ${summary.productCount} صنف`,
    '---',
    '---',
    '---',
    summary.totalCartons,
    summary.totalPieces,
    summary.grandTotalPieces,
    '---',
    Number(summary.totalAmount.toFixed(2)),
    summary.totalBranchAvailableCartons,
    '---',
    summary.totalRequiredFromOctober,
    summary.totalRequiredFromOctober > 0 ? `طلب توريد ${summary.totalRequiredFromOctober} ك من أكتوبر` : 'مغطى بالفرع بالكامل',
    summary.octoberDeficitCount > 0 ? `يوجد عجز في ${summary.octoberDeficitCount} صنف بأكتوبر` : 'مغطى بأكتوبر 🟢',
    summary.invoicesCount,
    `الفواتير: ${summary.invoiceNumbers.slice(0, 5).join(', ')}${summary.invoiceNumbers.length > 5 ? ' ...' : ''}`,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set Column Widths for professional readability
  ws['!cols'] = [
    { wch: 6 },  // م
    { wch: 38 }, // اسم المنتج
    { wch: 15 }, // كود الصنف
    { wch: 16 }, // الكود الموحد
    { wch: 14 }, // شدة الكرتونة
    { wch: 14 }, // عدد الكرتون
    { wch: 12 }, // عدد القطع
    { wch: 18 }, // إجمالي القطع الكلي
    { wch: 18 }, // سعر الكرتونة
    { wch: 18 }, // الإجمالي
    { wch: 18 }, // رصيد مخزن الفرع
    { wch: 20 }, // رصيد مخزن أكتوبر
    { wch: 26 }, // المطلوب توريده من مخزن أكتوبر
    { wch: 24 }, // حالة الصرف والتوريد
    { wch: 26 }, // تغطية مخزن أكتوبر
    { wch: 14 }, // عدد الفواتير
    { wch: 45 }, // بيان الفواتير
  ];

  // Set Right to Left sheet orientation for Arabic
  (ws as any)['!views'] = [{ RTL: true }];

  // Sheet 2: Summary by Rep / Invoices breakdown
  const repSummaryMap = new Map<string, { repName: string; invoicesCount: number; cartons: number; pieces: number; totalAmount: number; customers: Set<string> }>();
  summary.lines.forEach((line) => {
    line.sources.forEach((s) => {
      const rep = s.repName || 'غير محدد';
      const existing = repSummaryMap.get(rep);
      if (existing) {
        existing.cartons += s.cartons;
        existing.pieces += s.pieces;
        existing.customers.add(s.customerName);
      } else {
        repSummaryMap.set(rep, {
          repName: rep,
          invoicesCount: 1,
          cartons: s.cartons,
          pieces: s.pieces,
          totalAmount: 0,
          customers: new Set([s.customerName]),
        });
      }
    });
  });

  const repRows: any[][] = [
    ['ملخص طلبية التوريد حسب المندوبين'],
    [],
    ['م', 'اسم المندوب', 'عدد العملاء', 'إجمالي الكراتين المطلوبة', 'إجمالي القطع', 'حالة الطلب'],
  ];

  let repIdx = 1;
  repSummaryMap.forEach((rep) => {
    repRows.push([
      repIdx++,
      rep.repName,
      rep.customers.size,
      rep.cartons,
      rep.pieces,
      'مشمول في طلب التوريد الموحد',
    ]);
  });

  const wsRep = XLSX.utils.aoa_to_sheet(repRows);
  wsRep['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 25 },
  ];
  (wsRep as any)['!views'] = [{ RTL: true }];

  XLSX.utils.book_append_sheet(wb, ws, 'فاتورة مجمعة وطلب توريد أكتوبر');
  XLSX.utils.book_append_sheet(wb, wsRep, 'ملخص المناديب المشمولين');

  const fileDate = new Date().toISOString().slice(0, 10);
  const cleanBranch = summary.branchName.replace(/\s+/g, '_');
  XLSX.writeFile(wb, `فاتورة_مجمعة_وتوريد_أكتوبر_${cleanBranch}_${fileDate}.xlsx`);
}
