import { Invoice } from '../types';
import { generateInvoiceExcelBase64 } from './excelService';
import { generateInvoicePDFBase64 } from './pdfService';

const POWER_AUTOMATE_URL = import.meta.env.VITE_POWER_AUTOMATE_URL as string | undefined;

export interface PowerAutomateAttachment {
  name: string;
  contentBytes: string;
  contentType: string;
}

export interface PowerAutomateOrderPayload {
  invoiceNumber: string;
  customerName: string;
  customerCode?: string;
  branchName: string;
  repName: string;
  date: string;
  time?: string;
  total: number;
  paymentMethod: string;
  status: string;
  invoice: Invoice;
  attachments: PowerAutomateAttachment[];
}

function cleanBase64(str: string | null | undefined): string {
  if (!str) return '';
  const trimmed = String(str).trim();
  return trimmed.includes(',') ? trimmed.split(',')[1] : trimmed;
}

export async function sendInvoiceToPowerAutomate(invoice: Invoice): Promise<void> {
  if (!POWER_AUTOMATE_URL) {
    console.info('[Power Automate] VITE_POWER_AUTOMATE_URL is not configured; skipping notification.');
    return;
  }

  const safeCustomer = (invoice.customerName || 'عميل').replace(/[^\w\u0621-\u064A]/g, '_');
  const [pdfBase64, excelBase64] = await Promise.all([
    generateInvoicePDFBase64(invoice),
    Promise.resolve(generateInvoiceExcelBase64(invoice)),
  ]);

  const payload: PowerAutomateOrderPayload = {
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    customerCode: invoice.customerCode || invoice.customerId,
    branchName: invoice.branchName,
    repName: invoice.repName,
    date: invoice.date,
    time: invoice.time,
    total: invoice.estimatedGrandTotal,
    paymentMethod: invoice.paymentMethod,
    status: invoice.status,
    invoice,
    attachments: [
      {
        name: `فاتورة_دريم_${invoice.invoiceNumber}_${safeCustomer}.pdf`,
        contentBytes: cleanBase64(pdfBase64),
        contentType: 'application/pdf',
      },
      {
        name: `فاتورة_دريم_${invoice.invoiceNumber}_${safeCustomer}.xlsx`,
        contentBytes: cleanBase64(excelBase64),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
  };

  const response = await fetch(POWER_AUTOMATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Power Automate request failed with status ${response.status}`);
  }
}

export function isPowerAutomateConfigured(): boolean {
  return Boolean(POWER_AUTOMATE_URL);
}
