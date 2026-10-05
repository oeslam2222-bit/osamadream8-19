import type { Customer, CustomerVisit, Product, TargetRecord, User } from '../types';
import { inferBranchFromText, normalizeArabicText } from '../services/arabicMatchingService';
import { deduplicateAndMergeCustomers } from '../services/customerDeduplicationService';
import { calculateCustomerFinancials, isSummaryOrTotalRow } from '../services/customerFinancialService';
import { resolveCustomerDuesValue } from '../services/customerDues';
import { productIdentityKey } from '../services/productIdentity';

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
  }
  return undefined;
};

/**
 * Resolve إجمالي المستحقات (dues) for a customer.
 *
 * Delegates to the canonical resolver in customerFinancialService so the value
 * used here, in the main table and in the database write path is one number.
 */
export const resolveDues = (c: Customer): number => resolveCustomerDuesValue(c);

/**
 * Lightweight fingerprint of the customer data a client is currently showing.
 * Lets the heartbeat detect that an admin changed the data and pull the fresh
 * copy, instead of waiting for a manual "publish version" press.
 */
export const CUSTOMERS_FINGERPRINT_KEY = 'dream_customers_fingerprint_v1';

export const buildCustomersFingerprint = (list: Customer[]): string => {
  let debt = 0;
  let dues = 0;
  list.forEach((c) => {
    debt += Number(c.currentBalance ?? c.balance ?? 0);
    dues += resolveCustomerDuesValue(c);
  });
  return `${list.length}:${Math.round(debt)}:${Math.round(dues)}`;
};

export const saveLocalCustomersFingerprint = (list: Customer[]) => {
  try {
    window.localStorage.setItem(CUSTOMERS_FINGERPRINT_KEY, buildCustomersFingerprint(list));
  } catch {}
};

export const getLocalCustomersFingerprint = (): string => {
  try {
    return window.localStorage.getItem(CUSTOMERS_FINGERPRINT_KEY) || '';
  } catch {
    return '';
  }
};

// Helper to normalize branch names across legacy stored data
export const normalizeBranchName = (name?: string): string => {
  if (!name || !name.trim()) return 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
  const clean = name.trim();
  const inferred = inferBranchFromText(clean);
  if (inferred) return inferred;
  if (!clean.startsWith('فرع') && !clean.includes('المخزن')) {
    return `فرع ${clean}`;
  }
  return clean;
};

export const normalizeIdentity = (value?: string) => normalizeArabicText(String(value || '')).replace(/\s+/g, '');
export const hasDuplicateUserIdentity = (candidate: Partial<User>, list: User[], excludeId?: string) => {
  const username = normalizeIdentity(candidate.username);
  const email = normalizeIdentity(candidate.email);
  const phone = normalizeIdentity(candidate.phone);
  const name = normalizeIdentity(candidate.name);
  return list.some((u) => {
    if (u.id === excludeId) return false;
    return (username && normalizeIdentity(u.username) === username) ||
      (email && normalizeIdentity(u.email) === email) ||
      (phone && normalizeIdentity(u.phone) === phone) ||
      (name && normalizeIdentity(u.name) === name);
  });
};

export const sanitizeProducts = (list: Product[]): Product[] => {
  if (!Array.isArray(list)) return [];
  const usedIds = new Set<string>();

// Product code is the stable business key. Repeated imports must update the
// existing row instead of creating another catalog item.
const uniqueList = deduplicateProductArray(list.filter(Boolean));
return uniqueList.map((rawProduct, index) => {
    const p = { ...rawProduct };
    const originalId = String(p.id || '').trim();
    let rowId = originalId || `product-row-${index + 1}`;
    if (usedIds.has(rowId)) {
      rowId = `${rowId}-${index + 1}`;
    }
    usedIds.add(rowId);
    return { ...p, id: rowId };
  }).map((p) => {
    const cartonQty = p.cartonQuantity && p.cartonQuantity > 0 ? p.cartonQuantity : 1;
    const savedCartonPrice = typeof p.cartonPrice === 'number' ? p.cartonPrice : 0;
    const savedPiecePrice = Number(p.piecePrice || p.salesPrice || 0);
    const piecePrice = savedPiecePrice > 0
      ? savedPiecePrice
      : (savedCartonPrice > 0 ? Math.round((savedCartonPrice / cartonQty) * 100) / 100 : 0);

    return {
      ...p,
      cartonQuantity: cartonQty,
      cartonPrice: Math.round(piecePrice * cartonQty * 100) / 100,
      piecePrice,
    };
  });
};

// Deduplicate customers by code / phone / name to prevent 3,000 becoming 6,000 on daily updates
export const deduplicateCustomersArray = (list: Customer[]): Customer[] => {
  if (!Array.isArray(list) || list.length === 0) return [];
  return deduplicateAndMergeCustomers(list).customers;
};

// Deduplicate target records by branch + rep + date
export const deduplicateTargetRecords = (records: TargetRecord[]): TargetRecord[] => {
  const map = new Map<string, TargetRecord>();
  records.forEach((r) => {
    const branchKey = (r.branch || '').trim().toLowerCase();
    const repKey = (r.repName || '').trim().toLowerCase();
    const dateKey = (r.date || '').trim();
    const key = `${branchKey}__${repKey}__${dateKey}`;
    if (map.has(key)) {
      map.set(key, { ...map.get(key)!, ...r, id: map.get(key)!.id });
    } else {
      map.set(key, r);
    }
  });
  return Array.from(map.values());
};

/**
 * مفتاح هوية الصنف انتقل لـ`src/services/productIdentity.ts`.
 *
 * كان معرّف هنا، والخدمة دي محتاجاه كمان (عدّ التكرار وقت الاستيراد)،
 * والـimport من services لـcontext layering معكوس. فالتعريف بقى في
 * الـservice، وهنا re-export بس عشان الاستيرادات الموجودة مكانش تتكسر.
 *
 * التعريف: الصنف = الكود. راجع الملف ده للسبب (قاعدة البيانات عليها
 * `UNIQUE(lower(trim(code)))` على جدول products، فالكود هو الهوية).
 */
export { productIdentityKey, normalizeProductCodeKey } from '../services/productIdentity';

export const deduplicateProductArray = (list: Product[]): Product[] => {
  const map = new Map<string, number>();
  const distinct: Product[] = [];
  list.forEach((p) => {
    if (!p) return;
    const key = productIdentityKey(p);
    const existingIdx = map.get(key);
    if (existingIdx === undefined) {
      map.set(key, distinct.length);
      distinct.push(p);
    } else {
      const existing = distinct[existingIdx];
      distinct[existingIdx] = {
        ...existing,
        ...p,
        id: existing.id || p.id,
        branchStockReserved: existing.branchStockReserved,
        mainWarehouseReserved: existing.mainWarehouseReserved,
        branchStocks: existing.branchStocks,
        branchStockActual: existing.branchStockActual,
        mainWarehouseActual: existing.mainWarehouseActual,
      };
    }
  });
  return distinct;
};

export const sanitizeCustomers = (list: Customer[]): Customer[] => {
  if (!Array.isArray(list)) return [];
  // Strictly filter out any Excel summary / total rows ("الإجمالي", "المجموع", etc.)
  // so they never inflate company collections by 10 million!
  const cleanRows = list.filter((c) => {
    if (!c) return false;
    return !isSummaryOrTotalRow(c.name, c.code, c.branchName, c.salesRepName || c.repName);
  });

  const normalizedList = cleanRows.map((c, idx) => {
    let resolvedBranch = c.branchName || '';
    if (!resolvedBranch || resolvedBranch === 'الفرع الرئيسي') {
      const locInferred = inferBranchFromText(
        `${c.address || ''} ${c.governorate || ''} ${c.notes || ''}`
      );
      if (locInferred) resolvedBranch = locInferred;
    }
    const fin = calculateCustomerFinancials(c);
    const s26 = fin.sales2026;
    const col26 = fin.collections2026;

    // Guarantee docs logic:
    // لو كبر من صفر يبقي ماضي علي ورق ضمان بالمبلغ ده
    // لو 0 او مافيش يبق لا يوجد ورق ضمان
    let gAmount = Math.abs(Number(c.guaranteeAmount || 0));
    const rawG = String(c.guaranteeDocs || '').trim();
    if (gAmount <= 0 && rawG) {
      const cleanDigits = rawG.replace(/[^\d]/g, '');
      if (cleanDigits) {
        const parsed = parseFloat(cleanDigits);
        if (!isNaN(parsed) && parsed > 0) gAmount = parsed;
      }
    }
    let finalGDocs = 'لا يوجد ورق ضمان';
    let finalHasG = false;
    if (gAmount > 0) {
      finalGDocs = `ماضي على ورق ضمان (${gAmount.toLocaleString('en-US')} ج.م)`;
      finalHasG = true;
    } else if (
      rawG &&
      rawG !== '0' &&
      !rawG.includes('بدون') &&
      !rawG.includes('لا') &&
      !rawG.includes('مش') &&
      !rawG.includes('غير') &&
      (rawG.includes('ماضي') || rawG.includes('شيك') || rawG.includes('كمبيالة') || rawG.includes('امانة') || rawG.includes('أمانة') || rawG.includes('رهن'))
    ) {
      finalGDocs = rawG.includes('ماضي') ? rawG : `ماضي على ورق ضمان (${rawG})`;
      finalHasG = true;
    }

    // Payment terms logic: كاش او علي دفعات او شيكات
    let finalPaymentTerms = 'كاش';
    const rawPT = String(c.paymentTerms || '').trim().toLowerCase();
    if (rawPT.includes('شيك') || rawPT.includes('check') || rawPT.includes('cheque')) {
      finalPaymentTerms = 'شيكات';
    } else if (
      rawPT.includes('دفع') ||
      rawPT.includes('قسط') ||
      rawPT.includes('أقساط') ||
      rawPT.includes('اقساط') ||
      rawPT.includes('اجل') ||
      rawPT.includes('آجل') ||
      rawPT.includes('installment')
    ) {
      finalPaymentTerms = 'على دفعات';
    } else if (rawPT.includes('كاش') || rawPT.includes('نقد') || rawPT.includes('cash')) {
      finalPaymentTerms = 'كاش';
    } else if (c.paymentTerms) {
      finalPaymentTerms = c.paymentTerms;
    }

    return {
      ...c,
      id: c.id || `cust_row_${idx + 1}_${(c.code || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      name: c.name || `عميل ${c.code || idx + 1}`,
      branchName: resolvedBranch || c.branchName || '',
      currentBalance: fin.balance,
      balance: fin.balance,
      totalOverdueAndDue: fin.overdue,
      overdueBalance: c.overdueBalance !== undefined ? Number(c.overdueBalance) : fin.overdue,
      dueBalance: fin.dueBalance,
      creditLimit: fin.creditLimit,
      totalMonthlySales: s26,
      sales2026: s26,
      totalOverallSales: Number(c.totalOverallSales || s26),
      totalMonthlyCollections: col26,
      collections2026: col26,
      totalOverallCollections: Number(c.totalOverallCollections || col26),
      hasDealtIn2026: fin.isDealtCustomer,
      dealt2026: fin.dealtStatusLabel,
      // Keep the sheet's own wording, and keep it ABSENT when the source never
      // provided one. Inventing "قابل" here used to shadow the real "متعامل /
      // غير متعامل" column during classification, so every customer came out as
      // "قابل للتعامل" and the three buckets lost their real labels.
      dealEligibility: c.dealEligibility,
      guaranteeDocs: finalGDocs,
      guaranteeAmount: gAmount > 0 ? gAmount : undefined,
      hasGuarantee: finalHasG,
      paymentTerms: finalPaymentTerms,
    };
  });

  return deduplicateAndMergeCustomers(normalizedList).customers;
};
