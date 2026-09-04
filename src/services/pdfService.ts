import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Invoice } from '../types';
import { COMPANY_INFO } from '../data/mockData';

/**
 * Generate and download ultra-high-resolution, beautifully styled PDF invoice for Dream Distribution
 * Works from anywhere (Dashboard, Invoices Manager, Order Builder, or Modal)
 * Renders an off-screen, pixel-perfect A4 invoice template with full Arabic text & typography
 */
export async function downloadInvoicePDF(invoice: Invoice, customCompanyInfo?: Record<string, any>): Promise<void> {
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
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '820px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = 'Cairo, Tajawal, "Segoe UI", Tahoma, Arial, sans-serif';
  container.style.direction = 'rtl';
  container.style.textAlign = 'right';
  container.style.padding = '24px 30px';
  container.style.boxSizing = 'border-box';
  container.style.zIndex = '-1000';

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

  const debtBefore = invoice.customerBalanceBefore || 0;
  const debtAfter = invoice.customerBalanceAfter || (debtBefore + invoice.estimatedGrandTotal);
  const creditLimit = invoice.customerCreditLimit || 50000;

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
          <div style="font-weight: 800; color: #0f172a; margin-bottom: 5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">
            📊 موقف حساب العميل المالي والائتماني:
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span>المديونية السابقة:</span>
            <strong>${debtBefore.toLocaleString()} ج.م</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span>قيمة هذه الفاتورة:</span>
            <strong>${invoice.estimatedGrandTotal.toLocaleString()} ج.م</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px; color: #b45309; font-weight: bold;">
            <span>إجمالي المديونية بعد الفاتورة:</span>
            <strong>${debtAfter.toLocaleString()} ج.م</strong>
          </div>
          <div style="display: flex; justify-content: space-between; color: #475569;">
            <span>الحد الائتماني المعتمد:</span>
            <strong>${creditLimit.toLocaleString()} ج.م</strong>
          </div>
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
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1000,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= pageHeight - margin * 2) {
      pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    } else {
      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
    }

    const safeCustomer = (invoice.customerName || 'عميل').replace(/[^\w\u0621-\u064A]/g, '_');
    const fileName = `فاتورة_دريم_${invoice.invoiceNumber}_${safeCustomer}.pdf`;
    pdf.save(fileName);
  } catch (err) {
    console.error('Failed to generate high-res PDF via canvas, using fallback print:', err);
    window.print();
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}
