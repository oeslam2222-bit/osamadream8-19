import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { Invoice } from '../types';
import { COMPANY_INFO } from '../data/mockData';
import { resolveCustomerFinancials } from './arabicMatchingService';

/**
 * Render and construct pixel-perfect jsPDF Document for Dream Distribution
 */
export async function createInvoicePDFDocument(invoice: Invoice, customCompanyInfo?: Record<string, any>): Promise<jsPDF> {
  const comp = {
    nameArabic: customCompanyInfo?.nameArabic || COMPANY_INFO.nameArabic,
    nameEnglish: customCompanyInfo?.nameEnglish || COMPANY_INFO.nameEnglish,
    taxNumber: customCompanyInfo?.taxNumber || COMPANY_INFO.taxNumber,
    commercialRegister: customCompanyInfo?.commercialRegister || COMPANY_INFO.commercialRegister,
    customerService: customCompanyInfo?.customerService || COMPANY_INFO.customerService,
    activity: customCompanyInfo?.activity || COMPANY_INFO.activity,
    headquarters: customCompanyInfo?.headquarters || COMPANY_INFO.headquarters,
  };

  const isShortage = Boolean(
    invoice.isShortageInvoice ||
    (invoice.invoiceNumber && invoice.invoiceNumber.endsWith('-NQ')) ||
    invoice.notes?.includes('نواقص')
  );

  const container = document.createElement('div');
  container.id = 'temp-pdf-export-container';
  container.style.position = 'fixed';
  container.style.left = '0px';
  container.style.top = '0px';
  container.style.width = '794px';
  container.style.minWidth = '794px';
  container.style.maxWidth = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = 'Cairo, Tajawal, "Segoe UI", Tahoma, Arial, sans-serif';
  container.style.direction = 'rtl';
  container.style.textAlign = 'right';
  container.style.padding = '20px 24px';
  container.style.boxSizing = 'border-box';
  container.style.zIndex = '9999999';
  container.style.opacity = '1';
  container.style.pointerEvents = 'none';

  const itemsHtml = invoice.items.map((item, idx) => {
    const cartonQty = item.cartonQuantity || 1;
    const cCount = item.cartonCount || 0;
    const pCount = item.pieceCount || 0;
    const totalUnits = item.totalUnits || item.totalPieces || (cCount * cartonQty + pCount);
    const piecePrice = item.pricePerPiece || (cartonQty > 0 ? Math.round((item.appliedPrice || item.pricePerCarton) / cartonQty) : 0);
    const cartonPrice = item.appliedPrice || item.pricePerCarton || 0;
    const unifiedCode = item.unifiedCode || (item.product as any)?.unifiedCode || '';

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;'}">
        <td style="padding: 6px 8px; text-align: center; font-weight: bold; font-size: 11px; color: #64748b; width: 30px;">${idx + 1}</td>
        <td style="padding: 6px 8px; font-weight: 800; font-size: 11px; color: #0f172a; white-space: nowrap; width: 85px;">
          ${item.productCode}
        </td>
        <td style="padding: 6px 8px; font-weight: 700; font-size: 11px; color: #4338ca; white-space: nowrap; width: 80px;">
          ${unifiedCode ? `<span style="background: #e0e7ff; color: #3730a3; padding: 2px 5px; border-radius: 4px;">#${unifiedCode.replace('#', '')}</span>` : '<span style="color: #94a3b8;">---</span>'}
        </td>
        <td style="padding: 6px 8px; font-weight: 800; font-size: 11.5px; color: #0f172a; line-height: 1.4;">
          ${item.productName}
          ${item.fulfilledFrom === 'main_warehouse' ? '<span style="display: inline-block; background: #fef3c7; color: #92400e; font-size: 9.5px; font-weight: bold; padding: 1px 4px; border-radius: 4px; margin-right: 4px;">مخزن 6 أكتوبر</span>' : ''}
        </td>
        <td style="padding: 6px 8px; text-align: center; font-size: 11px; color: #475569; width: 50px;">${cartonQty}</td>
        <td style="padding: 6px 8px; text-align: center; font-weight: 700; font-size: 11px; color: #0f172a; width: 55px;">${cCount} ك</td>
        <td style="padding: 6px 8px; text-align: center; font-weight: 700; font-size: 11px; color: #0f172a; width: 55px;">${pCount} ق</td>
        <td style="padding: 6px 8px; text-align: center; font-weight: 800; font-size: 11px; color: #b45309; width: 65px; background: #fffbeb;">${totalUnits} ق</td>
        <td style="padding: 6px 8px; text-align: left; font-size: 11px; color: #334155; width: 75px;">${cartonPrice.toLocaleString()} ج.م</td>
        <td style="padding: 6px 8px; text-align: left; font-weight: 800; font-size: 11.5px; color: #0f172a; width: 85px;">${(item.netTotal || item.totalBeforeTax || 0).toLocaleString()} ج.م</td>
      </tr>
    `;
  }).join('');

  const {
    debtBefore,
    debtAfter,
    creditLimit,
    isExceeded,
    requiredDown,
  } = resolveCustomerFinancials(invoice);

  container.innerHTML = `
    <div style="border: 2px solid #0f172a; border-radius: 12px; padding: 18px; background: #ffffff;">
      
      <!-- Top Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="background: #f59e0b; color: #000; font-weight: 900; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 18px;">D</div>
            <div>
              <div style="font-size: 18px; font-weight: 900; color: #0f172a;">${comp.nameArabic}</div>
              <div style="font-size: 10px; font-weight: bold; color: #64748b;">${comp.nameEnglish}</div>
            </div>
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 5px;">${comp.activity} • ${comp.headquarters}</div>
          <div style="display: flex; gap: 12px; font-size: 10.5px; color: #334155; margin-top: 4px;">
            <span>س.ت: <strong>${comp.commercialRegister}</strong></span>
            <span>ب.ض: <strong>${comp.taxNumber}</strong></span>
            <span>الخط الساخن: <strong>${comp.customerService}</strong></span>
          </div>
        </div>

        <div style="text-align: left;">
          <div style="display: inline-block; background: ${isShortage ? '#4f46e5' : '#0f172a'}; color: #fef08a; font-weight: 900; font-size: 11px; padding: 4px 10px; border-radius: 6px;">
            ${isShortage ? 'فاتورة نواقص معتمدة (صرف من أكتوبر)' : 'فاتورة مبيعات معتمدة (صرف من الفرع)'}
          </div>
          <div style="font-size: 15px; font-weight: 900; color: #0f172a; margin-top: 4px; font-family: monospace;">${invoice.invoiceNumber}</div>
          <div style="font-size: 10px; color: #64748b;">التاريخ: ${invoice.date} ${invoice.time ? `(${invoice.time})` : ''}</div>
          <div style="font-size: 10px; color: #475569; font-weight: bold;">الحالة: ${invoice.status}</div>
        </div>
      </div>

      <!-- Notice Banner for Shortage Split -->
      ${isShortage ? `
        <div style="margin-top: 10px; background: #e0e7ff; border: 1px solid #818cf8; border-radius: 8px; padding: 6px 12px; font-size: 11px; font-weight: 800; color: #312e81; display: flex; justify-content: space-between;">
          <span>📦 بيان نواقص: محولة للصرف والاستلام من المخزن المركزي بمدينة 6 أكتوبر</span>
          ${invoice.parentInvoiceNumber ? `<span>الفاتورة الأصلية: <strong>${invoice.parentInvoiceNumber}</strong></span>` : ''}
        </div>
      ` : invoice.hasShortageSplit ? `
        <div style="margin-top: 10px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 6px 12px; font-size: 11px; font-weight: 800; color: #92400e; display: flex; justify-content: space-between;">
          <span>✅ فاتورة الأصناف المتوفرة بالفرع. تم إنشاء فاتورة نواقص منفصلة للأصناف المتبقية</span>
          ${invoice.shortageInvoiceNumber ? `<span>فاتورة النواقص: <strong>${invoice.shortageInvoiceNumber}</strong></span>` : ''}
        </div>
      ` : ''}

      <!-- Customer & Order Meta Grid -->
      <div style="margin-top: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
        <div>
          <div>اسم العميل: <strong style="color: #0f172a; font-size: 12px;">${invoice.customerName}</strong></div>
          <div style="margin-top: 3px; color: #475569;">كود العميل: <strong>${invoice.customerCode || '---'}</strong> • هاتف: <strong>${invoice.customerPhone || '---'}</strong></div>
          <div style="margin-top: 3px; color: #475569;">العنوان: <strong>${invoice.customerAddress || '---'}</strong> ${invoice.customerTaxNumber ? `• ب.ض: <strong>${invoice.customerTaxNumber}</strong>` : ''}</div>
        </div>
        <div>
          <div>الفرع المنفذ: <strong style="color: #0f172a;">${invoice.branchName}</strong></div>
          <div style="margin-top: 3px; color: #475569;">المندوب المسؤول: <strong>${invoice.repName}</strong> ${invoice.supervisorName ? `• المشرف: <strong>${invoice.supervisorName}</strong>` : ''}</div>
          <div style="margin-top: 3px; color: #475569;">طريقة السداد: <strong style="color: #047857;">${invoice.paymentMethod}</strong> • إجمالي الكراتين: <strong>${invoice.totalCartons} ك</strong></div>
        </div>
      </div>

      <!-- Items Table -->
      <div style="margin-top: 12px;">
        <table style="width: 100%; border-collapse: collapse; text-align: right;">
          <thead>
            <tr style="background: #0f172a; color: #ffffff; font-size: 10.5px;">
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #0f172a;">م</th>
              <th style="padding: 6px 8px; border: 1px solid #0f172a;">كود الصنف</th>
              <th style="padding: 6px 8px; border: 1px solid #0f172a;">الكود الموحد</th>
              <th style="padding: 6px 8px; border: 1px solid #0f172a;">اسم الصنف والبيان</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #0f172a;">شدة</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #0f172a;">كرتون</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #0f172a;">قطع</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #0f172a;">إجمالي</th>
              <th style="padding: 6px 8px; text-align: left; border: 1px solid #0f172a;">سعر كرتونة</th>
              <th style="padding: 6px 8px; text-align: left; border: 1px solid #0f172a;">الصافي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <!-- Financial Totals & Balance -->
      <div style="margin-top: 12px; display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; align-items: start;">
        
        <!-- Customer Balance Position -->
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font-size: 10.5px;">
          <div style="font-weight: 800; color: #0f172a; margin-bottom: 5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; display: flex; justify-content: space-between; align-items: center;">
            <span>📊 موقف حساب العميل المالي والائتماني:</span>
            <span style="font-size: 9px; padding: 1px 6px; border-radius: 4px; ${isExceeded ? 'background: #fee2e2; color: #991b1b; font-weight: 800;' : (creditLimit > 0 ? 'background: #ecfdf5; color: #065f46; font-weight: 700;' : 'background: #f1f5f9; color: #475569; font-weight: 700;')}">
              ${isExceeded ? '⚠️ تجاوز الائتمان' : (creditLimit > 0 ? '✅ ائتمان سليم' : 'سداد نقدي')}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #475569;">المديونية السابقة للعميل:</span>
            <strong style="font-family: monospace;">${debtBefore.toLocaleString()} ج.م</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #475569;">قيمة هذه الفاتورة:</span>
            <strong style="font-family: monospace;">${invoice.estimatedGrandTotal.toLocaleString()} ج.م</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px; color: #b45309; font-weight: bold;">
            <span>إجمالي المديونية بعد الفاتورة:</span>
            <strong style="font-family: monospace; color: ${isExceeded ? '#dc2626' : '#b45309'};">${debtAfter.toLocaleString()} ج.م</strong>
          </div>
          <div style="display: flex; justify-content: space-between; color: #475569;">
            <span>الحد الائتماني المعتمد:</span>
            <strong style="font-family: monospace; color: #1e40af;">
              ${creditLimit > 0 ? `${creditLimit.toLocaleString()} ج.م` : 'لا يوجد حد ائتماني (نقدي)'}
            </strong>
          </div>
          ${isExceeded ? `
            <div style="margin-top: 5px; padding: 4px 6px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; color: #b91c1c; font-size: 9.5px; font-weight: bold;">
              ⚠️ تجاوز الحد الائتماني — دفعة نقدية مطلوبة: <span style="font-family: monospace;">${requiredDown.toLocaleString()} ج.م</span>
            </div>
          ` : ''}
        </div>

        <!-- Invoice Calculation Summary -->
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span style="color: #475569;">إجمالي البضاعة قبل الخصم:</span>
            <strong>${invoice.subtotal.toLocaleString()} ج.م</strong>
          </div>
          ${invoice.discountPercentage > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 3px; color: #b91c1c;">
              <span>قيمة الخصم (${invoice.discountPercentage}%):</span>
              <strong>-${invoice.discountAmount.toLocaleString()} ج.م</strong>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; padding-top: 5px; border-top: 2px solid #f59e0b; font-size: 13px; font-weight: 900; color: #0f172a;">
            <span>الصافي المطلوب سداده:</span>
            <span style="color: #b45309;">${invoice.estimatedGrandTotal.toLocaleString()} ج.م</span>
          </div>
        </div>
      </div>

      <!-- Notes -->
      ${invoice.notes ? `
        <div style="margin-top: 8px; font-size: 10px; color: #475569; background: #f1f5f9; padding: 5px 8px; border-radius: 6px;">
          <strong>ملاحظات:</strong> ${invoice.notes}
        </div>
      ` : ''}

      <!-- Signatures Footer -->
      <div style="margin-top: 18px; pt: 10px; border-top: 1px dashed #94a3b8; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center; font-size: 10.5px;">
        <div>
          <div style="font-weight: bold; color: #475569; margin-bottom: 25px;">توقيع واستلام العميل / المفوض:</div>
          <div style="border-top: 1px dotted #94a3b8; padding-top: 3px; color: #64748b;">(الاسم / التوقيع / الختم)</div>
        </div>
        <div>
          <div style="font-weight: bold; color: #475569; margin-bottom: 25px;">مندوب التسليم:</div>
          <div style="border-top: 1px dotted #94a3b8; padding-top: 3px; color: #0f172a; font-weight: bold;">${invoice.repName}</div>
        </div>
        <div>
          <div style="font-weight: bold; color: #475569; margin-bottom: 25px;">اعتماد الفرع / أمين المخزن:</div>
          <div style="border-top: 1px dotted #94a3b8; padding-top: 3px; color: #64748b;">(مستودع الصرف والتسليم)</div>
        </div>
      </div>

      <!-- Bottom Thank You Message -->
      <div style="margin-top: 12px; text-align: center; font-size: 10px; font-weight: bold; color: #64748b;">
        ✨ شكرًا لثقتكم بشركة دريم للتجارة والتوزيع - مجموعة الطنطاوي ❤️
      </div>

    </div>
  `;

  document.body.appendChild(container);

  try {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // ignore font loading error
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    const totalHeight = container.scrollHeight || container.offsetHeight || 1000;

    const canvas = await html2canvas(container, {
      scale: 1.5,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      width: 794,
      height: totalHeight,
      windowWidth: 794,
      windowHeight: totalHeight + 50,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.96);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 6;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const printableHeight = pageHeight - margin * 2;

    if (imgHeight <= printableHeight) {
      pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    } else {
      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
      heightLeft -= printableHeight;

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
        heightLeft -= printableHeight;
      }
    }

    return pdf;
  } catch (err) {
    console.error('Failed to generate high-res canvas PDF, falling back to direct PDF file generation:', err);
    try {
      const fallbackPdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      fallbackPdf.setFontSize(16);
      fallbackPdf.text(`DREAM TRADING - INVOICE ${invoice.invoiceNumber}`, 14, 20);
      fallbackPdf.setFontSize(11);
      fallbackPdf.text(`Customer: ${invoice.customerName || '---'}`, 14, 28);
      fallbackPdf.text(`Date: ${invoice.date} ${invoice.time || ''}`, 14, 35);
      fallbackPdf.text(`Branch: ${invoice.branchName}`, 14, 42);
      fallbackPdf.text(`Sales Rep: ${invoice.repName}`, 14, 49);
      fallbackPdf.text(`Payment: ${invoice.paymentMethod}`, 14, 56);
      fallbackPdf.text(`Cartons: ${invoice.totalCartons} | Pieces: ${invoice.totalPieces}`, 14, 63);
      fallbackPdf.text(`Total: ${invoice.estimatedGrandTotal.toLocaleString()} EGP`, 14, 70);
      fallbackPdf.text(`Status: ${invoice.status}`, 14, 77);

      let y = 88;
      fallbackPdf.setFontSize(9);
      fallbackPdf.text('--- INVOICE ITEMS ---', 14, y);
      y += 6;
      invoice.items.forEach((item, idx) => {
        const itemLine = `${idx + 1}. [${item.productCode}] ${item.productName} | ${item.cartonCount} Ctn / ${item.totalUnits} Pcs = ${(item.netTotal || 0).toLocaleString()} EGP`;
        fallbackPdf.text(itemLine.slice(0, 95), 14, y);
        y += 5.5;
        if (y > 275) {
          fallbackPdf.addPage();
          y = 20;
        }
      });

      return fallbackPdf;
    } catch (fallbackError) {
      console.error('All PDF generation mechanisms failed:', fallbackError);
      throw fallbackError;
    }
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * Generate and download ultra-high-resolution PDF invoice to device
 */
export async function downloadInvoicePDF(invoice: Invoice, customCompanyInfo?: Record<string, any>): Promise<void> {
  const pdf = await createInvoicePDFDocument(invoice, customCompanyInfo);
  const safeCustomer = (invoice.customerName || 'عميل').replace(/[^\w\u0621-\u064A]/g, '_');
  const fileName = `فاتورة_دريم_${invoice.invoiceNumber}_${safeCustomer}.pdf`;

  const pdfBlob = pdf.output('blob');
  const blobUrl = URL.createObjectURL(pdfBlob);
  const downloadLink = document.createElement('a');
  downloadLink.href = blobUrl;
  downloadLink.download = fileName;
  downloadLink.style.display = 'none';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  setTimeout(() => {
    if (document.body.contains(downloadLink)) {
      document.body.removeChild(downloadLink);
    }
    URL.revokeObjectURL(blobUrl);
  }, 2500);
}

/**
 * Generate Base64 string of the PDF invoice for Microsoft Power Automate / Webhook sync
 */
export async function generateInvoicePDFBase64(invoice: Invoice, customCompanyInfo?: Record<string, any>): Promise<string> {
  const pdf = await createInvoicePDFDocument(invoice, customCompanyInfo);
  const dataUri = pdf.output('datauristring');
  return dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
}
