import type { Customer, CustomerVisit, Product, TargetRecord, User } from '../types';
import { inferBranchFromText, normalizeArabicText } from '../services/arabicMatchingService';
import { deduplicateAndMergeCustomers } from '../services/customerDeduplicationService';
import { calculateCustomerFinancials, isSummaryOrTotalRow } from '../services/customerFinancialService';
import { resolveCustomerDuesValue } from '../services/customerDues';
import { productIdentityKey, deduplicateProductArray, normalizeProductCodeKey, normalizeVariantCodeKey } from '../services/productIdentity';
import { resolveProductPricing, stripPlaceholderText } from '../services/productPricing';

export const STORAGE_KEYS = {
  PRODUCTS: 'dream_dist_products_v9',

  INVOICES: 'dream_dist_invoices_v9',
  USERS: 'dream_dist_users_v10',
  BRANCHES: 'dream_dist_branches_v9',
  CUSTOMERS: 'dream_dist_customers_v9',
  VISITS: 'dream_dist_customer_visits_v1',
  CLOUDINARY: 'dream_dist_cloudinary_v9',
  CURRENT_USER_ID: 'dream_dist_current_user_v9',
  CURRENT_USER_DATA: 'dream_dist_current_user_session_v10',
  IS_AUTH: 'dream_dist_is_auth_v9',
  ACCOUNTING_LOGS: 'dream_dist_acc_logs_v9',
  CART: 'dream_dist_cart_v9',
  DELETED_INVOICE_IDS: 'dream_dist_deleted_invoices_v1',
  DELETED_VISIT_IDS: 'dream_dist_deleted_visits_v1',
  PENDING_INVOICES: 'dream_dist_pending_invoices_v1',
  TARGETS: 'dream_dist_targets_v1',
  FORECASTS: 'dream_dist_forecasts_v1',
  FORECAST_PLANS: 'dream_dist_forecast_plans_v1',
  CUSTOMER_COMMENTS: 'dream_dist_customer_comments_v1',
  PRIVACY_MODE: 'dream_privacy_mode_v1',
};

export const getDeletedInvoiceIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_INVOICE_IDS);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
};

export const markInvoiceAsDeletedInStorage = (id: string, invoiceNumber?: string) => {
  try {
    const current = getDeletedInvoiceIds();
    if (id) current.add(id);
    if (invoiceNumber) current.add(invoiceNumber);
    localStorage.setItem(STORAGE_KEYS.DELETED_INVOICE_IDS, JSON.stringify(Array.from(current)));
  } catch {}
};

export const getDeletedVisitIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_VISIT_IDS);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
};

export const markVisitAsDeletedInStorage = (visitId: string) => {
  try {
    const current = getDeletedVisitIds();
    if (visitId) current.add(visitId);
    localStorage.setItem(STORAGE_KEYS.DELETED_VISIT_IDS, JSON.stringify(Array.from(current)));
  } catch {}
};

/**
 * اقرأ مرآة الزيارات القديمة في localStorage — مرة واحدة وقت الإقلاع بس.
 *
 * التطبيق كان بيخزّن نسخة كاملة من سجل الزيارات (~1MB عند 4,000 زيارة) في
 * localStorage جنب IndexedDB. الـcopy دي اتشالت، لكن الأجهزة اللي كانت شغالة
 * قبل الإصدار ده ممكن يكون عندها زيارات موجودة في المرآة دي فقط — فبنقراها
 * مرة وندمجها قبل ما المفتاح يتمسح، وبعدين `clearLegacyVisitsMirror()`.
 */
export const readLegacyVisitsMirror = (): CustomerVisit[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VISITS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** امسح المرآة القديمة بعد ما يتقرأ وiddy merge. بيحرّر ~1MB من الـquota. */
export const clearLegacyVisitsMirror = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.VISITS);
  } catch {}
};

export const firstNumber = (...values: (number | undefined | null)[]): number | undefined => {
  for (const v of values) {
    const n = Number(v);
    if (v !== undefined && v !== null && !isNaN(n)) return n;
