import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Invoice } from '../types';

/**
 * Generate and download ultra-high-resolution, beautifully styled PDF invoice for Dream Distribution
 */
export async function downloadInvoicePDF(invoice: Invoice): Promise<void> {
  const printableElement = document.getElementById('printable-invoice');

  if (printableElement) {
    try {
      // Temporarily ensure high contrast & standard rendering for html2canvas
      const canvas = await html2canvas(printableElement, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1200,
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
      const margin = 8; // 8mm margin
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pageHeight - margin * 2) {
        pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
      } else {
        // Multi-page slicing
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

      const fileName = `فاتورة_دريم_${invoice.invoiceNumber}_${(invoice.customerName || 'عميل').replace(/[^\w\u0621-\u064A]/g, '_')}.pdf`;
      pdf.save(fileName);
      return;
    } catch (err) {
      console.error('Canvas PDF export error, falling back:', err);
    }
  }

  // Fallback print dialog
  window.print();
}
