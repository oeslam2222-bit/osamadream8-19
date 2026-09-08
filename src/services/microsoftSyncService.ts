import { Invoice } from '../types';
import { generateInvoiceExcelBase64 } from './excelService';
import { generateInvoicePDFBase64 } from './pdfService';

/**
 * Microsoft 365 Power Automate Official Direct Invoke Webhook URL
 * Provided for Dream Distribution Order Approval & Dispatch Flow
 */
export const DEFAULT_MICROSOFT_WEBHOOK_URL =
  'https://default18403f5514a341be950585562989bf.28.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/31/workflows/dde3e3cd8b464d71a367abfc307d0734/triggers/manual/paths/invoke?api-version=1';

export function getMicrosoftWebhookUrl(): string {
  try {
    const saved = localStorage.getItem('ms_power_automate_webhook_url');
    if (saved && saved.trim().startsWith('http')) return saved.trim();
  } catch {
    // ignore localStorage error
  }
  return (import.meta.env.VITE_POWER_AUTOMATE_WEBHOOK_URL || DEFAULT_MICROSOFT_WEBHOOK_URL).trim();
}

export function setMicrosoftWebhookUrl(url: string): void {
  try {
    localStorage.setItem('ms_power_automate_webhook_url', url.trim());
  } catch (e) {
    console.warn('Could not save Microsoft webhook URL to localStorage:', e);
  }
}

export interface MicrosoftOrderPayload {
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

function cleanBase64(str: string | null | undefined): string {
  if (!str) return '';
  const trimmed = String(str).trim();
  return trimmed.includes(',') ? trimmed.split(',')[1] : trimmed;
}

export interface MicrosoftSyncResponse {
  success: boolean;
  message: string;
  statusCode?: number;
  error?: string;
  timestamp?: string;
}

/**
 * Dispatches an approved order directly to Microsoft 365 Power Automate
 * - Generates PDF (base64) and Excel (base64) in-memory
 * - Communicates directly with Microsoft Cloud (0 KB Supabase egress consumed!)
 */
export async function sendOrderToMicrosoft365(
  invoice: Invoice,
  submittedBy?: string
): Promise<MicrosoftSyncResponse> {
  const webhookUrl = getMicrosoftWebhookUrl();
  if (!webhookUrl) {
    return {
      success: false,
      message: 'رابط مايكروسوفت Webhook غير مهيأ',
      error: 'Missing webhook URL',
    };
  }

  try {
    const safeInvNum = invoice.invoiceNumber || 'INV';
    const safeCust = (invoice.customerName || 'عميل').replace(/[^\w\u0621-\u064A]/g, '_');

    // 1. Generate Base64 for Excel
    const excelContent = generateInvoiceExcelBase64(invoice);
    const excelName = `طلب_بيع_${safeInvNum}_${safeCust}.xlsx`;

    // 2. Generate Base64 for PDF
    let pdfContent = '';
    try {
      pdfContent = await generateInvoicePDFBase64(invoice);
    } catch (pdfErr) {
      console.warn('PDF base64 generation warning, proceeding with fallback:', pdfErr);
    }
    const pdfName = `طلب_بيع_${safeInvNum}_${safeCust}.pdf`;

    // 3. Prepare payload strictly adhering to Power Automate Trigger Schema
    const payload: MicrosoftOrderPayload = {
      branch_name: String(invoice.branchName || 'الفرع الرئيسي'),
      submitted_by: String(submittedBy || invoice.supervisorName || 'مشرف الفرع'),
      salesman_name: String(invoice.repName || 'مندوب المبيعات'),
      customer_name: String(invoice.customerName || 'عميل عام'),
      total_amount: String(invoice.estimatedGrandTotal || 0),
      pdf_name: String(pdfName),
      pdf_content: cleanBase64(pdfContent),
      excel_name: String(excelName),
      excel_content: cleanBase64(excelContent),
    };

    // 4. HTTP POST to Microsoft Power Automate
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const isOk = response.ok || response.status === 202 || response.status === 200;

    if (isOk) {
      const result: MicrosoftSyncResponse = {
        success: true,
        statusCode: response.status,
        message: 'تم إرسال الطلبية وملفات PDF و Excel إلى مايكروسوفت 365 بنجاح! 📨',
        timestamp: new Date().toLocaleTimeString('ar-EG'),
      };
      saveOrderDispatchRecord(invoice.id, true);
      return result;
    } else {
      const errText = await response.text().catch(() => '');
      const result: MicrosoftSyncResponse = {
        success: false,
        statusCode: response.status,
        message: `تعذر الإرسال إلى مايكروسوفت (كود: ${response.status})`,
        error: errText,
        timestamp: new Date().toLocaleTimeString('ar-EG'),
      };
      saveOrderDispatchRecord(invoice.id, false, `HTTP ${response.status}: ${errText}`);
      return result;
    }
  } catch (err: any) {
    console.error('Error dispatching order to Microsoft Power Automate:', err);
    const result: MicrosoftSyncResponse = {
      success: false,
      message: 'فشل الاتصال برابط مايكروسوفت Power Automate',
      error: err?.message || String(err),
      timestamp: new Date().toLocaleTimeString('ar-EG'),
    };
    saveOrderDispatchRecord(invoice.id, false, err?.message || String(err));
    return result;
  }
}

/**
 * Send a test ping to the Microsoft Webhook to verify end-to-end connectivity
 */
export async function testMicrosoftWebhookConnection(): Promise<MicrosoftSyncResponse> {
  const webhookUrl = getMicrosoftWebhookUrl();
  if (!webhookUrl) {
    return {
      success: false,
      message: 'الرابط غير موجود',
      error: 'Empty URL',
    };
  }

  try {
    const testPayload: MicrosoftOrderPayload = {
      branch_name: 'فرع_اختبار_الاتصال',
      submitted_by: 'فحص الربط السحابي - مسؤول النظام',
      salesman_name: 'نظام التجربة',
      customer_name: 'شركة دريم - اختبار مايكروسوفت 365',
      total_amount: 1.0,
      pdf_name: 'test_sample.pdf',
      pdf_content: '',
      excel_name: 'test_sample.xlsx',
      excel_content: '',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    if (response.ok || response.status === 202 || response.status === 200) {
      return {
        success: true,
        statusCode: response.status,
        message: 'تم الاتصال بمايكروسوفت بنجاح واستلام الطلب في Power Automate! 🟢',
      };
    } else {
      const errText = await response.text().catch(() => '');
      return {
        success: false,
        statusCode: response.status,
        message: `استجاب السيرفر بكود خطأ: ${response.status}`,
        error: errText,
      };
    }
  } catch (e: any) {
    return {
      success: false,
      message: 'فشل الاتصال برابط مايكروسوفت',
      error: e?.message || String(e),
    };
  }
}

function saveOrderDispatchRecord(invoiceId: string, success: boolean, error?: string): void {
  try {
    const key = `ms_dispatch_${invoiceId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        success,
        time: new Date().toISOString(),
        error,
      })
    );
  } catch {
    // ignore
  }
}

export function getOrderDispatchRecord(invoiceId: string): { success: boolean; time: string; error?: string } | null {
  try {
    const val = localStorage.getItem(`ms_dispatch_${invoiceId}`);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}
