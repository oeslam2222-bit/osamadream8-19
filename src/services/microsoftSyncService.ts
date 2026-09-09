import { Invoice, Branch } from '../types';
import { generateInvoiceExcelBase64 } from './excelService';
import { generateInvoicePDFBase64 } from './pdfService';

/**
 * Microsoft 365 Power Automate Official Direct Invoke Webhook URL
 * Provided for Dream Distribution Order Approval & Dispatch Flow
 */
export const DEFAULT_MICROSOFT_WEBHOOK_URL =
  'https://default18403f5514a341be950585562989bf.28.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/31/workflows/dde3e3cd8b464d71a367abfc307d0734/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=7puuyQmL-0PiJ06T_ecIyppAtA0T-k4pI5vDVQ5s7Sg';

export function getMicrosoftWebhookUrl(): string {
  try {
    const saved = localStorage.getItem('ms_power_automate_webhook_url');
    if (saved && saved.trim().startsWith('http') && saved.includes('sig=')) return saved.trim();
  } catch {
    // ignore localStorage error
  }
  const envUrl = (import.meta.env.VITE_POWER_AUTOMATE_WEBHOOK_URL || '').trim();
  if (envUrl && envUrl.includes('sig=')) return envUrl;
  if (envUrl && !envUrl.includes('sig=')) {
    console.error('Power Automate URL missing sig= signature parameter');
  }
  return DEFAULT_MICROSOFT_WEBHOOK_URL.trim();
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
  branch_email: string;
  notification_emails: string;
  submitted_by: string;
  salesman_name: string;
  customer_name: string;
  customer_code: string;
  customer_phone: string;
  customer_address: string;
  customer_balance_before: string;
  customer_credit_limit: string;
  customer_overdue: string;
  customer_due: string;
  total_amount: string;
  payment_method: string;
  invoice_number: string;
  invoice_date: string;
  invoice_time: string;
  total_cartons: string;
  total_pieces: string;
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  email_subject: string;
  email_body: string;
  pdf_name: string;
  pdf_content: string;
  excel_name: string;
  excel_content: string;
}

export function cleanBase64(str: string | null | undefined): string {
  if (!str) return '';
  const trimmed = String(str).trim();
  return trimmed.includes(',') ? trimmed.split(',')[1] : trimmed;
}

function safeStr(val: unknown, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  const s = String(val).trim();
  return s || fallback;
}

export interface MicrosoftSyncResponse {
  success: boolean;
  message: string;
  statusCode?: number;
  error?: string;
  timestamp?: string;
}

/**
 * Resolves the notification email(s) for a given branch.
 * Falls back to the company-level email if the branch has none.
 */
export function getBranchEmails(branchName: string, branches: Branch[], companyEmail?: string): string[] {
  const branch = branches.find((b) => b.name === branchName);
  if (branch?.notificationEmails && branch.notificationEmails.length > 0) {
    return branch.notificationEmails;
  }
  if (branch?.email) {
    return [branch.email];
  }
  if (companyEmail) {
    return [companyEmail];
  }
  return [];
}

/**
 * Builds the email subject and HTML body for the Power Automate email action.
 */
function buildEmailContent(invoice: Invoice, submittedBy: string): { subject: string; body: string } {
  const subject = `اعتماد طلبية بيع #${invoice.invoiceNumber} - ${invoice.customerName} - ${invoice.branchName}`;

  const rows = invoice.items.map((item) => {
    return `<tr>
      <td style="padding:6px;border:1px solid #ddd;text-align:right">${item.productCode}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:right">${item.productName}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:center">${item.cartonCount}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:center">${item.totalUnits || item.totalPieces || 0}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:left">${item.appliedPrice.toLocaleString('ar-EG')}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:left">${item.netTotal.toLocaleString('ar-EG')}</td>
    </tr>`;
  }).join('');

  const body = `<div dir="rtl" style="font-family:'Segoe UI',Tahoma,sans-serif;font-size:14px;color:#333;max-width:800px;margin:0 auto">
    <h2 style="color:#1a73e8;border-bottom:2px solid #1a73e8;padding-bottom:8px">طلبية بيع معتمدة - دريم للتوزيع</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr><td style="padding:6px;font-weight:bold;width:30%">رقم الفاتورة:</td><td style="padding:6px">${invoice.invoiceNumber}</td></tr>
      <tr><td style="padding:6px;font-weight:bold">الفرع:</td><td style="padding:6px">${invoice.branchName}</td></tr>
      <tr><td style="padding:6px;font-weight:bold">تاريخ الاعتماد:</td><td style="padding:6px">${invoice.date} ${invoice.time || ''}</td></tr>
      <tr><td style="padding:6px;font-weight:bold">تمت الموافقة بواسطة:</td><td style="padding:6px">${submittedBy}</td></tr>
      <tr><td style="padding:6px;font-weight:bold">المندوب:</td><td style="padding:6px">${invoice.repName}</td></tr>
    </table>
    <h3 style="color:#1a73e8">تفاصيل العميل</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr><td style="padding:6px;font-weight:bold;width:30%">اسم العميل:</td><td style="padding:6px">${invoice.customerName}</td></tr>
      <tr><td style="padding:6px;font-weight:bold">كود العميل:</td><td style="padding:6px">${invoice.customerCode || '—'}</td></tr>
      <tr><td style="padding:6px;font-weight:bold">رقم الهاتف:</td><td style="padding:6px">${invoice.customerPhone || '—'}</td></tr>
      <tr><td style="padding:6px;font-weight:bold">العنوان:</td><td style="padding:6px">${invoice.customerAddress || '—'}</td></tr>
      <tr><td style="padding:6px;font-weight:bold">المديونية الحالية:</td><td style="padding:6px">${(invoice.customerBalanceBefore ?? 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م</td></tr>
      <tr><td style="padding:6px;font-weight:bold">الحد الائتماني:</td><td style="padding:6px">${(invoice.customerCreditLimit ?? 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م</td></tr>
      <tr><td style="padding:6px;font-weight:bold">المتأخرات:</td><td style="padding:6px">${(invoice.customerOverdueBalance ?? 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م</td></tr>
      <tr><td style="padding:6px;font-weight:bold">المستحقات:</td><td style="padding:6px">${(invoice.customerBalanceAfter ?? 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م</td></tr>
      <tr><td style="padding:6px;font-weight:bold">طريقة الدفع:</td><td style="padding:6px">${invoice.paymentMethod}</td></tr>
    </table>
    <h3 style="color:#1a73e8">ملخص الفاتورة</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tr><td style="padding:6px;font-weight:bold;width:30%">إجمالي الكراتين:</td><td style="padding:6px">${invoice.totalCartons}</td></tr>
      <tr><td style="padding:6px;font-weight:bold">إجمالي القطع:</td><td style="padding:6px">${invoice.totalPieces}</td></tr>
      <tr><td style="padding:6px;font-weight:bold">الإجمالي قبل الضريبة:</td><td style="padding:6px">${invoice.subtotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م</td></tr>
      <tr><td style="padding:6px;font-weight:bold">قيمة الخصم:</td><td style="padding:6px">${invoice.discountAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م</td></tr>
      <tr><td style="padding:6px;font-weight:bold">قيمة الضريبة:</td><td style="padding:6px">${invoice.taxAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م</td></tr>
      <tr style="background:#e8f0fe"><td style="padding:8px;font-weight:bold;font-size:16px">الإجمالي النهائي:</td><td style="padding:8px;font-size:16px;font-weight:bold">${invoice.estimatedGrandTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م</td></tr>
    </table>
    <h3 style="color:#1a73e8">أصناف الطلبية</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:6px;border:1px solid #ddd">الكود</th>
          <th style="padding:6px;border:1px solid #ddd">الصنف</th>
          <th style="padding:6px;border:1px solid #ddd">كراتين</th>
          <th style="padding:6px;border:1px solid #ddd">قطع</th>
          <th style="padding:6px;border:1px solid #ddd">سعر الكرتونة</th>
          <th style="padding:6px;border:1px solid #ddd">الإجمالي</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#666;font-size:12px;margin-top:20px">تم إنشاء وإرسال هذا البريد تلقائياً من نظام دريم للتوزيع عند اعتماد الطلبية.</p>
  </div>`;

  return { subject, body };
}

/**
 * Dispatches an approved order directly to Microsoft 365 Power Automate
 * - Generates PDF (base64) and Excel (base64) in-memory
 * - Communicates directly with Microsoft Cloud (0 KB Supabase egress consumed!)
 */
export async function sendOrderToMicrosoft365(
  invoice: Invoice,
  submittedBy?: string,
  branches?: Branch[],
  companyEmail?: string,
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
    const approver = safeStr(submittedBy || invoice.supervisorName, 'مشرف الفرع');

    // Resolve branch notification emails
    const emails = getBranchEmails(invoice.branchName, branches || [], companyEmail);
    const branchEmail = emails.length > 0 ? emails[0] : '';
    const allEmails = emails.join(';');

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

    // 3. Build email content
    const { subject, body } = buildEmailContent(invoice, approver);

    // 4. Prepare payload strictly adhering to Power Automate Trigger Schema
    const payload: MicrosoftOrderPayload = {
      branch_name: safeStr(invoice.branchName, 'الفرع الرئيسي'),
      branch_email: branchEmail,
      notification_emails: allEmails,
      submitted_by: approver,
      salesman_name: safeStr(invoice.repName, 'مندوب المبيعات'),
      customer_name: safeStr(invoice.customerName, 'عميل عام'),
      customer_code: safeStr(invoice.customerCode),
      customer_phone: safeStr(invoice.customerPhone),
      customer_address: safeStr(invoice.customerAddress),
      customer_balance_before: safeStr(invoice.customerBalanceBefore, '0'),
      customer_credit_limit: safeStr(invoice.customerCreditLimit, '0'),
      customer_overdue: safeStr(invoice.customerOverdueBalance, '0'),
      customer_due: safeStr(invoice.customerBalanceAfter, '0'),
      total_amount: safeStr(invoice.estimatedGrandTotal, '0'),
      payment_method: safeStr(invoice.paymentMethod, 'نقدي (كاش)'),
      invoice_number: safeInvNum,
      invoice_date: safeStr(invoice.date),
      invoice_time: safeStr(invoice.time),
      total_cartons: safeStr(invoice.totalCartons, '0'),
      total_pieces: safeStr(invoice.totalPieces, '0'),
      subtotal: safeStr(invoice.subtotal, '0'),
      discount_amount: safeStr(invoice.discountAmount, '0'),
      tax_amount: safeStr(invoice.taxAmount, '0'),
      email_subject: subject,
      email_body: body,
      pdf_name: pdfName,
      pdf_content: cleanBase64(pdfContent),
      excel_name: excelName,
      excel_content: cleanBase64(excelContent),
    };

    // 5. HTTP POST to Microsoft Power Automate
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
        message: `تم إرسال الطلبية وملفات PDF و Excel إلى مايكروسوفت 365 بنجاح! 📨 (${allEmails || 'بدون بريد محدد'})`,
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
      branch_email: '',
      notification_emails: '',
      submitted_by: 'فحص الربط السحابي - مسؤول النظام',
      salesman_name: 'نظام التجربة',
      customer_name: 'شركة دريم - اختبار مايكروسوفت 365',
      customer_code: 'TEST-001',
      customer_phone: '',
      customer_address: '',
      customer_balance_before: '0',
      customer_credit_limit: '0',
      customer_overdue: '0',
      customer_due: '0',
      total_amount: '1.0',
      payment_method: 'نقدي (كاش)',
      invoice_number: 'TEST-001',
      invoice_date: new Date().toISOString().slice(0, 10),
      invoice_time: new Date().toLocaleTimeString('ar-EG'),
      total_cartons: '0',
      total_pieces: '0',
      subtotal: '1.0',
      discount_amount: '0',
      tax_amount: '0',
      email_subject: 'اختبار اتصال - نظام دريم للتوزيع',
      email_body: '<div dir="rtl"><p>هذه رسالة اختبار للتحقق من اتصال Power Automate.</p></div>',
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
