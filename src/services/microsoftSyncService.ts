import { Invoice, Branch } from '../types';
import { generateInvoiceExcelBase64 } from './excelService';
import { generateInvoicePDFBase64 } from './pdfService';
import { resolveCustomerFinancials, isBranchMatch, normalizeBranchName } from './arabicMatchingService';

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

// In-memory cache to prevent duplicate automatic dispatches within 25 seconds
const recentDispatches = new Map<string, number>();

export function isRecentlyDispatched(invoiceId: string, windowMs = 25000): boolean {
  if (!invoiceId) return false;
  const lastTime = recentDispatches.get(invoiceId);
  if (!lastTime) return false;
  return Date.now() - lastTime < windowMs;
}

export function markInvoiceDispatched(invoiceId: string): void {
  if (invoiceId) {
    recentDispatches.set(invoiceId, Date.now());
  }
}

export interface MicrosoftOrderPayload {
  // Direct Power Automate Schema keys (exact matching trigger expressions)
  branch_name: string;
  salesman_name: string;
  customer_name: string;
  customer_code: string;
  debt: number | string;
  due_amount: number | string;
  total_amount: number | string;
  approved_by: string;

  // Email Routing & Attachments
  branch_email: string;
  notification_emails: string;
  email_subject: string;
  email_body: string;
  pdf_name: string;
  pdf_content: string;
  excel_name: string;
  excel_content: string;

  // Compatibility & extended fields
  submitted_by?: string;
  approver_name?: string;
  customer_balance_before?: number | string;
  customer_due?: number | string;
  debt_amount?: number | string;
  customer_phone?: string;
  customer_address?: string;
  customer_credit_limit?: number | string;
  customer_overdue?: number | string;
  payment_method?: string;
  invoice_number?: string;
  invoice_date?: string;
  invoice_time?: string;
  total_cartons?: number | string;
  total_pieces?: number | string;
  subtotal?: number | string;
  discount_amount?: number | string;
  tax_amount?: number | string;
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
 * Uses smart Arabic normalization to match branches like "فرع ديمشلت" with "ديمشلت".
 * Falls back to the company-level email if the branch has none.
 */
export function getBranchEmails(branchName: string, branches: Branch[], companyEmail?: string): string[] {
  const emails: string[] = [];

  // 1. Check custom saved branch settings (from CompanySettingsModal)
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dream_dist_branch_company_info_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        const norm = normalizeBranchName(branchName);
        const branchCustom = parsed[norm] || parsed[branchName];
        if (branchCustom) {
          if (Array.isArray(branchCustom.notificationEmails)) {
            for (const ne of branchCustom.notificationEmails) {
              if (ne && typeof ne === 'string' && ne.includes('@') && !emails.includes(ne.trim())) {
                emails.push(ne.trim());
              }
            }
          }
          const customEmail = branchCustom.email;
          if (customEmail && typeof customEmail === 'string' && customEmail.includes('@') && !emails.includes(customEmail.trim())) {
            emails.push(customEmail.trim());
          }
        }
      }
    }
  } catch {
    // ignore parse error
  }

  // 2. Check branches list
  if (branchName) {
    const branch = branches.find((b) => 
      b.name === branchName || 
      isBranchMatch(b.name, branchName, { allowUnassigned: false })
    );

    if (branch?.notificationEmails && branch.notificationEmails.length > 0) {
      for (const ne of branch.notificationEmails) {
        if (ne && ne.includes('@') && !emails.includes(ne.trim())) {
          emails.push(ne.trim());
        }
      }
    }
    if (branch?.email && branch.email.includes('@') && !emails.includes(branch.email.trim())) {
      emails.push(branch.email.trim());
    }
  }

  // 3. Fallback to company level email if nothing found
  if (emails.length === 0 && companyEmail && companyEmail.includes('@')) {
    emails.push(companyEmail.trim());
  }

  return emails;
}

/**
 * Builds the exact Arabic HTML body requested by the user for Power Automate email notification.
 * Note: Approval Date is intentionally omitted as requested.
 */
function buildEmailContent(
  invoice: Invoice,
  approver: string,
  customerCode: string,
  debtAmount: number,
  dueAmount: number,
  totalAmount: number
): { subject: string; body: string } {
  const subject = `اعتماد طلبية بيع #${invoice.invoiceNumber} - ${invoice.customerName} - ${invoice.branchName}`;

  const body = `<div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1e293b; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; background-color: #ffffff;">
  <p style="font-size: 16px; margin-bottom: 16px;">السلام عليكم ورحمة الله وبركاته،</p>
  <p style="font-size: 14px; color: #475569; margin-bottom: 20px;">تم اعتماد طلب العميل بنجاح، وفيما يلي تفاصيل الطلب:</p>
  
  <!-- بيانات العميل -->
  <div style="background-color: #f8fafc; border-right: 4px solid #2563eb; padding: 12px 16px; margin-bottom: 16px; border-radius: 4px;">
    <h3 style="margin: 0 0 8px 0; color: #1e40af; font-size: 15px;">👤 بيانات العميل</h3>
    <p style="margin: 4px 0; font-size: 14px;"><strong>اسم العميل:</strong> ${invoice.customerName || 'عميل عام'}</p>
    <p style="margin: 4px 0; font-size: 14px;"><strong>كود العميل:</strong> ${customerCode || 'غير محدد'}</p>
    <p style="margin: 4px 0; font-size: 14px;"><strong>الفرع:</strong> ${invoice.branchName || 'الفرع الرئيسي'}</p>
    <p style="margin: 4px 0; font-size: 14px;"><strong>المندوب:</strong> ${invoice.repName || 'مندوب المبيعات'}</p>
  </div>

  <!-- البيانات المالية -->
  <div style="background-color: #f8fafc; border-right: 4px solid #059669; padding: 12px 16px; margin-bottom: 16px; border-radius: 4px;">
    <h3 style="margin: 0 0 8px 0; color: #065f46; font-size: 15px;">💰 البيانات المالية</h3>
    <p style="margin: 4px 0; font-size: 14px;"><strong>المديونية:</strong> ${debtAmount.toLocaleString('ar-EG')} جنيه</p>
    <p style="margin: 4px 0; font-size: 14px;"><strong>المبلغ المستحق:</strong> ${dueAmount.toLocaleString('ar-EG')} جنيه</p>
    <p style="margin: 4px 0; font-size: 14px;"><strong>الإجمالي:</strong> ${totalAmount.toLocaleString('ar-EG')} جنيه</p>
  </div>

  <!-- بيانات الاعتماد -->
  <div style="background-color: #f8fafc; border-right: 4px solid #d97706; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="margin: 0 0 8px 0; color: #92400e; font-size: 15px;">✅ بيانات الاعتماد</h3>
    <p style="margin: 4px 0; font-size: 14px;"><strong>تمت الموافقة بواسطة:</strong> ${approver || 'الإدارة'}</p>
  </div>

  <div style="font-size: 13px; background-color: #eff6ff; color: #1d4ed8; padding: 10px 14px; border-radius: 6px; text-align: center; margin-bottom: 16px;">
    📎 <strong>تم إرفاق الملفات الخاصة بالطلب:</strong> ملف PDF وملف Excel
  </div>

  <p style="font-size: 14px; color: #475569;">برجاء مراجعة المرفقات واتخاذ ما يلزم.</p>
  
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
  <p style="font-size: 13px; color: #64748b; margin: 0;">مع خالص التحية،<br><strong>شركة دريم للتجارة والتوزيع</strong></p>
</div>`;

  return { subject, body };
}

/**
 * Dispatches an approved order directly to Microsoft 365 Power Automate
 * - Resolves customer code, debt, due amount accurately
 * - Prevents duplicate automatic dispatches
 * - Generates PDF (base64) and Excel (base64) in-memory
 */
export async function sendOrderToMicrosoft365(
  invoice: Invoice,
  submittedBy?: string,
  branches: Branch[] = [],
  companyEmail?: string,
  options?: { force?: boolean }
): Promise<MicrosoftSyncResponse> {
  const webhookUrl = getMicrosoftWebhookUrl();
  if (!webhookUrl) {
    return {
      success: false,
      message: 'رابط مايكروسوفت Webhook غير مهيأ',
      error: 'Missing webhook URL',
    };
  }

  if (!invoice) {
    return {
      success: false,
      message: 'بيانات الفاتورة غير صحيحة.',
    };
  }

  // Prevent duplicate automated notifications within 25 seconds unless forced
  if (!options?.force && isRecentlyDispatched(invoice.id)) {
    console.info(`[Power Automate] Invoice #${invoice.invoiceNumber} already dispatched recently. Skipping duplicate.`);
    return {
      success: true,
      message: `تم إرسال إشعار الفاتورة #${invoice.invoiceNumber} مسبقاً (تم منع التكرار التلقائي).`,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const safeInvNum = invoice.invoiceNumber || 'INV';
    const safeCust = (invoice.customerName || 'عميل').replace(/[^\w\u0621-\u064A]/g, '_');
    const approver = safeStr(submittedBy || invoice.supervisorName, 'الإدارة');

    // Resolve true customer code & financials
    const financials = resolveCustomerFinancials(invoice);
    const resolvedCustomerCode = (
      invoice.customerCode?.trim() ||
      financials.matchedCustomer?.code?.trim() ||
      invoice.customerId?.trim() ||
      'غير محدد'
    );

    const debtNum = Number(
      invoice.customerBalanceBefore !== undefined && invoice.customerBalanceBefore !== null
        ? invoice.customerBalanceBefore
        : financials.debtBefore ?? 0
    );

    const totalNum = Number(invoice.estimatedGrandTotal || 0);

    const dueNum = Number(
      invoice.customerBalanceAfter !== undefined && invoice.customerBalanceAfter !== null
        ? invoice.customerBalanceAfter
        : financials.debtAfter ?? (debtNum + totalNum)
    );

    // Resolve branch notification emails
    const emails = getBranchEmails(invoice.branchName, branches || [], companyEmail);
    const branchEmail = emails.length > 0 ? emails[0] : (companyEmail || '');
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

    // 3. Build email content using requested template
    const { subject, body } = buildEmailContent(
      invoice,
      approver,
      resolvedCustomerCode,
      debtNum,
      dueNum,
      totalNum
    );

    // 4. Prepare payload adhering strictly to Power Automate Trigger Schema & Flow Expressions
    const payload: MicrosoftOrderPayload = {
      // Primary keys expected in triggerBody()?['...']
      branch_name: safeStr(invoice.branchName, 'الفرع الرئيسي'),
      salesman_name: safeStr(invoice.repName, 'مندوب المبيعات'),
      customer_name: safeStr(invoice.customerName, 'عميل عام'),
      customer_code: resolvedCustomerCode,
      debt: debtNum,
      due_amount: dueNum,
      total_amount: totalNum,
      approved_by: approver,

      // Routing & attachments
      branch_email: branchEmail,
      notification_emails: allEmails,
      email_subject: subject,
      email_body: body,
      pdf_name: pdfName,
      pdf_content: cleanBase64(pdfContent),
      excel_name: excelName,
      excel_content: cleanBase64(excelContent),

      // Aliases for maximum compatibility with any Power Automate step variations
      submitted_by: approver,
      approver_name: approver,
      customer_balance_before: debtNum,
      customer_due: dueNum,
      debt_amount: debtNum,
      customer_phone: safeStr(invoice.customerPhone),
      customer_address: safeStr(invoice.customerAddress),
      customer_credit_limit: financials.creditLimit || 0,
      customer_overdue: financials.overdue || 0,
      payment_method: safeStr(invoice.paymentMethod, 'نقدي (كاش)'),
      invoice_number: safeInvNum,
      invoice_date: safeStr(invoice.date),
      invoice_time: safeStr(invoice.time),
      total_cartons: Number(invoice.totalCartons || 0),
      total_pieces: Number(invoice.totalPieces || 0),
      subtotal: Number(invoice.subtotal || 0),
      discount_amount: Number(invoice.discountAmount || 0),
      tax_amount: Number(invoice.taxAmount || 0),
    };

    // Mark as dispatched before fetch to prevent double hits
    markInvoiceDispatched(invoice.id);

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
      debt: '0',
      due_amount: '0',
      approved_by: 'مسؤول النظام',
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
