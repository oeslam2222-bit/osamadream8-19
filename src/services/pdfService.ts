import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Invoice } from '../types';
import { COMPANY_INFO } from '../data/mockData';
import { formatCurrency } from './invoiceService';

/**
 * Generate and download high-resolution PDF invoice for Dream Distribution
 */
export async function downloadInvoicePDF(invoice: Invoice): Promise<void> {
  const printableElement = document.getElementById('printable-invoice');

  if (printableElement) {
    try {
      const canvas = await html2canvas(printableElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20; // 10mm margins
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pageHeight - 20) {
        pdf.addImage(imgData, 'JPEG', 10, 10, imgWidth, imgHeight);
      } else {
        // Multi-page handling if invoice has dozens of items
        let heightLeft = imgHeight;
        let position = 10;

        pdf.addImage(imgData, 'JPEG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
          position = heightLeft - imgHeight + 10;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 10, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
      }

      pdf.save(`فاتورة_دريم_${invoice.invoiceNumber}.pdf`);
      return;
    } catch (err) {
      console.warn('Canvas PDF export fallback to vector jsPDF', err);
    }
  }

  // Pure jsPDF Vector Fallback
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Box
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 90, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(COMPANY_INFO.nameArabic, pageWidth / 2, 35, { align: 'center' });

  doc.setFontSize(11);
  doc.setTextColor(251, 191, 36); // Amber 400
  doc.text(`فاتورة مبيعات معتمدة #${invoice.invoiceNumber}`, pageWidth / 2, 55, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`${invoice.date} | الفرع: ${invoice.branchName} | المندوب: ${invoice.repName}`, pageWidth / 2, 75, { align: 'center' });

  // Customer Info Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(30, 105, pageWidth - 60, 65, 6, 6, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(30, 105, pageWidth - 60, 65, 6, 6, 'S');

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.text(`اسم العميل: ${invoice.customerName}`, pageWidth - 45, 125, { align: 'right' });
  doc.text(`الهاتف: ${invoice.customerPhone || '---'}`, pageWidth - 45, 142, { align: 'right' });
  doc.text(`العنوان: ${invoice.customerAddress || '---'}`, pageWidth - 45, 158, { align: 'right' });

  doc.text(`طريقة السداد: ${invoice.paymentMethod}`, 45, 125, { align: 'left' });
  doc.text(`الحالة: ${invoice.status}`, 45, 142, { align: 'left' });

  // Items Summary Table Header
  let y = 195;
  doc.setFillColor(30, 41, 59);
  doc.rect(30, y, pageWidth - 60, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text('#', pageWidth - 45, y + 16, { align: 'right' });
  doc.text('الصنف والبيان', pageWidth - 70, y + 16, { align: 'right' });
  doc.text('الكراتين', pageWidth / 2, y + 16, { align: 'center' });
  doc.text('سعر الكرتونة', 140, y + 16, { align: 'left' });
  doc.text('الإجمالي', 45, y + 16, { align: 'left' });

  y += 24;

  // Table rows
  invoice.items.forEach((item, index) => {
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(30, y, pageWidth - 60, 20, 'F');
    }
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(9);
    doc.text(String(index + 1), pageWidth - 45, y + 14, { align: 'right' });
    const cleanName = item.productName.length > 35 ? item.productName.substring(0, 35) + '...' : item.productName;
    doc.text(`${cleanName} (${item.productCode})`, pageWidth - 70, y + 14, { align: 'right' });
    doc.text(`${item.cartonCount} كرتونة`, pageWidth / 2, y + 14, { align: 'center' });
    doc.text(`${formatCurrency(item.pricePerCarton)}`, 140, y + 14, { align: 'left' });
    doc.text(`${formatCurrency(item.netTotal)}`, 45, y + 14, { align: 'left' });
    y += 20;
  });

  // Totals Box
  y += 15;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(pageWidth - 250, y, 220, 85, 6, 6, 'F');
  doc.setTextColor(203, 213, 225);
  doc.setFontSize(9);
  doc.text(`إجمالي الكراتين: ${invoice.totalCartons} كرتونة`, pageWidth - 45, y + 20, { align: 'right' });
  doc.text(`المجموع قبل الخصم: ${formatCurrency(invoice.subtotal)}`, pageWidth - 45, y + 36, { align: 'right' });
  doc.text(`الخصم التجاري (${invoice.discountPercentage}%): -${formatCurrency(invoice.discountAmount)}`, pageWidth - 45, y + 52, { align: 'right' });
  doc.setFontSize(12);
  doc.setTextColor(251, 191, 36);
  doc.text(`الصافي النهائي: ${formatCurrency(invoice.estimatedGrandTotal)}`, pageWidth - 45, y + 74, { align: 'right' });

  // Stamp & Signatures
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([3, 3], 0);
  doc.roundedRect(30, y + 10, 110, 60, 4, 4, 'S');
  doc.roundedRect(160, y + 10, 110, 60, 4, 4, 'S');
  doc.setLineDashPattern([], 0);

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text('ختم شركة دريم واعتماد المشرف', 85, y + 80, { align: 'center' });
  doc.text('توقيع واستلام العميل', 215, y + 80, { align: 'center' });

  // Customer appreciation note
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.text('شكراً لأنك أصبحت جزءاً من عائلة شركة دريم للتجارة والتوزيع', pageWidth / 2, y + 115, { align: 'center' });

  doc.save(`فاتورة_دريم_${invoice.invoiceNumber}.pdf`);
}
