import { Invoice, Branch } from '../types';
import { sendOrderToMicrosoft365, getMicrosoftWebhookUrl } from './microsoftSyncService';

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
  submittedBy?: string,
  branches?: Branch[],
  companyEmail?: string,
  options?: { force?: boolean }
): Promise<void> {
  const result = await sendOrderToMicrosoft365(invoice, submittedBy, branches, companyEmail, options);
  if (!result.success) {
    throw new Error(result.message);
  }
}

export function isPowerAutomateConfigured(): boolean {
  return Boolean(getMicrosoftWebhookUrl());
}

