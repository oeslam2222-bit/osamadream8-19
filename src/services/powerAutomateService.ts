import { Invoice } from '../types';
import { generateInvoiceExcelBase64 } from './excelService';
import { generateInvoicePDFBase64 } from './pdfService';
import { getMicrosoftWebhookUrl } from './microsoftSyncService';

function cleanBase64(str: string | null | undefined): string {
  if (!str) return '';
  const trimmed = String(str).trim();
  return trimmed.includes(',') ? trimmed.split(',')[1] : trimmed;
}

export interface PowerAutomatePayload {
  branch_name: string;
  submitted_by: string;
  salesman_name: string;
  customer_name: string;
  total_amount: string;
  pdf_name: string;
  pdf_content: string;
  excel_name: string;
  excel_content: string;
}

export async function sendInvoiceToPowerAutomate(
  invoice: Invoice,
  submittedBy?: string
): Promise<void> {
  const webhookUrl = getMicrosoftWebhookUrl();
  if (!webhookUrl) {
    console.info('[Power Automate] Webhook URL is not configured; skipping notification.');
    return;
  }

  const safeInvNum = invoice.invoiceNumber || 'INV';
  const safeCust = (invoice.customerName || 'عميل').replace(/[^\w\u0621-\u064A]/g, '_');

  const [pdfBase64, excelBase64] = await Promise.all([
    generateInvoicePDFBase64(invoice).catch(() => ''),
    Promise.resolve(generateInvoiceExcelBase64(invoice)),
  ]);

  const payload: PowerAutomatePayload = {
    branch_name: String(invoice.branchName || 'الفرع الرئيسي'),
    submitted_by: String(submittedBy || invoice.supervisorName || 'مشرف الفرع'),
    salesman_name: String(invoice.repName || 'مندوب المبيعات'),
    customer_name: String(invoice.customerName || 'عميل عام'),
    total_amount: String(invoice.estimatedGrandTotal || 0),
    pdf_name: `فاتورة_دريم_${safeInvNum}_${safeCust}.pdf`,
    pdf_content: cleanBase64(pdfBase64),
    excel_name: `فاتورة_دريم_${safeInvNum}_${safeCust}.xlsx`,
    excel_content: cleanBase64(excelBase64),
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok && response.status !== 202) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Power Automate request failed with status ${response.status}${errText ? ': ' + errText : ''}`);
  }
}

export function isPowerAutomateConfigured(): boolean {
  return Boolean(getMicrosoftWebhookUrl());
}
