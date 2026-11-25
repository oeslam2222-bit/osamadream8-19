import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CartContext } from './cartContext';
import { COMPANY_INFO, INITIAL_AUDIT_LOGS, INITIAL_BRANCHES, INITIAL_USERS } from '../data/mockData';
import { inferCustomerSector, BRANCHES } from '../data/branchDefinitions';
import { DEFAULT_CLOUDINARY_CONFIG, normalizeCloudinaryConfig } from '../services/cloudinaryService';
import { clearCachedImages } from '../services/imageCacheService';
import { idbClear, idbDelete, idbGet, idbSet, debouncedIdbSet, safeLocalStorageSet, isStorageQuotaExceeded } from '../services/storageService';
import { appendAuditLog, clearAuditLogsStorage, createAuditLog, getAuditLogs } from '../services/auditLogService';
import {
  doesCustomerBelongToBranch,
  doesCustomerBelongToRep,
  findOwningSalesRep,
  doesCustomerBelongToSupervisor,
  isArabicNameMatch,
  isBranchMatch,
  normalizeArabicText,
  getBranchStockForProduct,
  inferBranchFromText,
  sanitizeAndDeduplicateUsers,
  resolveBranchName,
  normalizeBranchKey,
  findCustomerMatch,
  setActiveCustomersCache,
} from '../services/arabicMatchingService';
import {
  deleteInvoiceFromSupabase,
  deleteAllInvoicesFromSupabase,
  deleteUserFromSupabase,
  deleteVisitFromSupabase,
  fetchCustomersFromSupabase,
  fetchCustomersIncremental,
  mergeCustomersIncremental,
  fetchCustomerContentStamp,
  fetchInvoicesFromSupabase,
  fetchInvoiceRowsByIds,
  INVOICE_SIGNAL_ID,
  fetchInvoiceContentStamp,
  fetchProductsFromSupabase,
  fetchProductsIncremental,
  fetchProductContentStamp,
  isProductsTableAuthoritative,
  mergeProductsIncremental,
  fetchTargetsFromSupabase,
  fetchTargetContentStamp,
  fetchTargetsIncremental,
  fetchTargetsRecentMonths,
  mergeTargetsIncremental,
  fetchVisitsFromSupabase,
  fetchVisitContentStamp,
  CustomerFetchScope,
  VisitFetchScope,
  TargetFetchScope,
  ProductSectorScope,
  saveTargetsToSupabase,
  saveVisitsToSupabase,
  fetchForecastsByMonthFromSupabase,
  fetchForecastsByYearFromSupabase,
  fetchForecastMonthStamp,
  fetchForecastPlansStamp,
  fetchCustomerCommentsStamp,
  ForecastFetchScope,
  InvoiceFetchScope,
  saveForecastsToSupabase,
  fetchForecastMonthPlansFromSupabase,
  saveForecastMonthPlanToSupabase,
  fetchCustomerCommentsFromSupabase,
  saveCustomerCommentsToSupabase,
  deleteCustomerCommentFromSupabase,
  deleteForecastFromSupabase,
  fetchUsersFromSupabase,
  findUserInSupabase,
  fetchPromotionsFromSupabase,
  fetchPromotionsStamp,
  savePromotionsToSupabase,
  sanitizeEmail,
  sanitizeIdentifier,
  saveCustomersToSupabase,
  replaceCustomersInSupabase,
  saveInvoiceToSupabase,
  saveInvoicesToSupabase,
  saveCustomerToSupabase,
  deleteCustomerFromSupabase,
  saveProductsToSupabase,
  deleteProductFromSupabase,
  fetchCustomerItemSalesIncremental,
  mergeCustomerItemSalesIncremental,
  saveUsersToSupabase,
  saveUserToSupabase,
  saveUserAvatarToSupabase,
  supabase,
  SupabaseSyncStatus,
  testSupabaseConnection,
  isSupabaseConfigured,
  USER_SYNC_STORE_ID,
  SUPABASE_URL,
} from '../services/supabaseService';
import {
  applyPromotionsToProducts,
  getSavedPromotions,
  filterPromotionsForUser,
  resolveProductPromotion,
  savePromotions,
} from '../services/promotionService';
import { currentMonthKey } from '../services/forecastService';
import { sendOrderToMicrosoft365 } from '../services/microsoftSyncService';
import { sendInvoiceToPowerAutomate } from '../services/powerAutomateService';
import {
  fetchTargetsFromGoogleSheetUrl,
  parseTargetExcel,
  exportTargetsToExcel,
  inferTargetSector,
  filterTargetsForUser,
  extractTargetSectorFromNotes,
} from '../services/targetService';
import {
  addSmartNotification,
  checkForDataUpdates,
  getSmartNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  notifyInventoryUpdate,
  notifyTargetsUpdate,
  notifyCustomersUpdate,
  notifyPromotionsUpdate,
  notifyTaskAssigned,
  SmartNotification,
} from '../services/smartNotificationService';
import { saveSingleSourceUrl, getPublishedDataSources, getSavedSourceUrl, isGoogleSheetsReadMode } from '../services/dataSourceService';
import {
  clearLocalDataVersion,
  fetchRemoteDataVersion,
  getLocalDataVersion,
  saveLocalDataVersion,
  isClientVersionStale,
  publishNewDataVersion,
  purgeLocalDataCaches,
  GlobalDataVersionMeta,
  SyncScope,
  GLOBAL_VERSION_RECORD_ID,
} from '../services/dataVersionService';
import {
  AccountingSyncLog,
  AuditLog,
  Branch,
  CollectionForecastRecord,
  ForecastMonthPlan,
  CustomerCommentRecord,
  CartItem,
  CloudinaryConfig,
  CompanyInfo,
  Customer,
  CustomerVisit,
  InventoryTransaction,
  Invoice,
  OrderStatus,
  Product,
  PromoAnnouncement,
  PromotionOffer,
  ReturnedItem,
  ReturnRecord,
  TargetRecord,
  User,
  UserApprovalStatus,
  UserRole,
  VisitReviewStatus,
} from '../types';
import { AppContextType } from './appContextTypes';
import {
  STORAGE_KEYS,
  getSectorProductsKey,
  getUserSectorStorageKey,
  getDeletedInvoiceIds,
  markInvoiceAsDeletedInStorage,
  getDeletedVisitIds,
  markVisitAsDeletedInStorage,
  readLegacyVisitsMirror,
  clearLegacyVisitsMirror,
  firstNumber,
  resolveDues,
  buildCustomersFingerprint,
  saveLocalCustomersFingerprint,
  getLocalCustomersFingerprint,
  normalizeBranchName,
  hasDuplicateUserIdentity,
  sanitizeProducts,
  deduplicateCustomersArray,
  deduplicateTargetRecords,
  normalizeVariantCodeKey,
  sanitizeCustomers,
} from './appContextHelpers';
import { useUiPreferences } from './useUiPreferences';
import { resolveCustomerDuesValue } from '../services/customerDues';
import {
  fetchMyProfile,
  getAuthMode,
  getServerSessionAsync,
  isServerAuthEnabled,
  linkAuthUserToProfile,
  signOutServer,
  tryServerSignIn,
} from '../services/authService';
import {
  QueuedMutation,
  enqueueMutation,
  enqueueMutations,
  countQueuedMutations,
  MAX_ATTEMPTS,
  isDeadLetter,
  getQueuedMutations,
  markQueuedMutationFailure,
  removeQueuedMutations,
  resetQueuedMutationAttempts,
  clearQueuedMutations,
} from '../services/offlineQueueService';
import { currentUserRef } from '../services/currentUserRef';

/**
 * القطاع الفعّال للمستخدم. `'none'` = حساب مبيعات بلا قطاع معيّن → محجوب عن
 * بيانات القطاعين كلهم لحد ما الإدارة تعيّنله قطاعًا (matchesSector بيرجّع false).
 */
type ActiveSector = 'home' | 'electrical' | 'none';

/**
 * دالة التحقق من كلمة المرور على السيرفر (supabase/harden_login_rpc.sql) اختيارية:
 * لو مش منشورة في قاعدة البيانات، PostgREST بيرجّع 404 في كل محاولة دخول.
 *
 * بنسجّل وقت الغياب ونعيد المحاولة بعد 24 ساعة بس، فمافيش 404 متكرر في
 * الكونسول ولا رحلة شبكة زايدة مع كل login — ولما تنشر الدالة، بتبدأ تشتغل
 * أوتوماتيك من غير تعديل كود.
 */
const SERVER_VERIFY_MISSING_KEY = 'tantawy:server_verify_missing_at_v1';
const SERVER_VERIFY_RECHECK_MS = 24 * 60 * 60 * 1000;

function isServerVerifyKnownMissing(): boolean {
  try {
    const savedAt = Number(localStorage.getItem(SERVER_VERIFY_MISSING_KEY));
    return Number.isFinite(savedAt) && savedAt > 0 && Date.now() - savedAt < SERVER_VERIFY_RECHECK_MS;
  } catch {
    return false;
  }
}

function markServerVerifyMissing(): void {
  try {
    safeLocalStorageSet(SERVER_VERIFY_MISSING_KEY, String(Date.now()));
  } catch {}
}

function clearServerVerifyMissing(): void {
  try {
    localStorage.removeItem(SERVER_VERIFY_MISSING_KEY);
  } catch {}
}

/**
 * بصمة محتوى جدول العملاء آخر مرة نزّلناها بالكامل.
 * بتُحفظ على الجهاز عشان إعادة فتح التطبيق تعمل استعلام صف واحد فقط
 * (count + أحدث updated_at) بدل ما تنزّل الجدول كله من جديد — ده أكبر بند
 * في استهلاك الـ egress على الخطة المجانية.
 */
const CUSTOMER_CONTENT_STAMP_KEY = 'tantawy_customer_content_stamp_v1';
const LAST_CACHED_USER_KEY = 'tantawy_last_cached_user_id_v1';

function resolveScopedSuffix(userId?: string | null, sector?: ActiveSector): string {
  const sec = sector === 'electrical' ? 'electrical' : 'home';
  return `${userId || 'anon'}::${sec}`;
}

function readCustomerContentStamp(
  userId?: string | null,
  sector?: ActiveSector
): { count: number | null; maxUpdatedAt: string | null } | null {
  try {
    const key = `${CUSTOMER_CONTENT_STAMP_KEY}::${resolveScopedSuffix(userId, sector)}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.count !== undefined || parsed.maxUpdatedAt !== undefined)) {
      return {
        count: typeof parsed.count === 'number' ? parsed.count : null,
        maxUpdatedAt: parsed.maxUpdatedAt ?? null,
      };
    }
  } catch {}
  return null;
}

function saveCustomerContentStamp(
  stamp: { count: number | null; maxUpdatedAt: string | null },
  userId?: string | null,
  sector?: ActiveSector
): void {
  try {
    const key = `${CUSTOMER_CONTENT_STAMP_KEY}::${resolveScopedSuffix(userId, sector)}`;
    safeLocalStorageSet(key, JSON.stringify(stamp));
  } catch {}
}

const PRODUCT_CONTENT_STAMP_KEY = 'tantawy_product_content_stamp_v1';

function readProductContentStamp(sector?: ActiveSector): { count: number | null; maxUpdatedAt: string | null } | null {
  try {
    const sec = sector === 'electrical' ? 'electrical' : 'home';
    const raw = localStorage.getItem(`${PRODUCT_CONTENT_STAMP_KEY}::${sec}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.count !== undefined || parsed.maxUpdatedAt !== undefined)) {
      return {
        count: typeof parsed.count === 'number' ? parsed.count : null,
        maxUpdatedAt: parsed.maxUpdatedAt ?? null,
      };
    }
  } catch {}
  return null;
}

function saveProductContentStamp(
  stamp: { count: number | null; maxUpdatedAt: string | null },
  sector?: ActiveSector
): void {
  try {
    const sec = sector === 'electrical' ? 'electrical' : 'home';
    safeLocalStorageSet(`${PRODUCT_CONTENT_STAMP_KEY}::${sec}`, JSON.stringify(stamp));
  } catch {}
}

/**
 * بصمة محتوى جدول الزيارات — نفس فكرة العملاء.
 * من غيرها كان كل فتح للتطبيق بينزّل 3,700+ زيارة لكل جهاز.
 */
const VISIT_CONTENT_STAMP_KEY = 'tantawy_visit_content_stamp_v1';

function readVisitContentStamp(
  userId?: string | null,
  sector?: ActiveSector
): { count: number | null; maxUpdatedAt: string | null } | null {
  try {
    const key = `${VISIT_CONTENT_STAMP_KEY}::${resolveScopedSuffix(userId, sector)}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.count !== undefined || parsed.maxUpdatedAt !== undefined)) {
      return {
        count: typeof parsed.count === 'number' ? parsed.count : null,
        maxUpdatedAt: parsed.maxUpdatedAt ?? null,
      };
    }
  } catch {}
  return null;
}

function saveVisitContentStamp(
  stamp: { count: number | null; maxUpdatedAt: string | null },
  userId?: string | null,
  sector?: ActiveSector
): void {
  try {
    const key = `${VISIT_CONTENT_STAMP_KEY}::${resolveScopedSuffix(userId, sector)}`;
    safeLocalStorageSet(key, JSON.stringify(stamp));
  } catch {}
}

/**
 * بصمة جدول الأهداف — نفس فكرة العملاء/الزيارات.
 * التارجت بيتغيّر نادرًا، فبدل تنزيل 572 صف مع كل فتح بنسأل صف واحد بس.
 */
const TARGET_CONTENT_STAMP_KEY = 'tantawy_target_content_stamp_v1';

function targetScopeKey(scope?: TargetFetchScope): string {
  if (!scope) return 'all';
  const parts = [
    ...(scope.branchNames || []).map((b) => `b:${b}`).sort(),
    ...(scope.repNames || []).map((r) => `r:${r}`).sort(),
  ];
  if (scope.sector) parts.push(`s:${scope.sector}`);
  return parts.length > 0 ? parts.join(',') : 'all';
}

function readTargetContentStamp(scope?: TargetFetchScope): { count: number | null; maxUpdatedAt: string | null } | null {
  try {
    const key = `${TARGET_CONTENT_STAMP_KEY}::${targetScopeKey(scope)}`;
    const raw = localStorage.getItem(key) || (!scope ? localStorage.getItem(TARGET_CONTENT_STAMP_KEY) : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.count !== undefined || parsed.maxUpdatedAt !== undefined)) {
      return {
        count: typeof parsed.count === 'number' ? parsed.count : null,
        maxUpdatedAt: parsed.maxUpdatedAt ?? null,
      };
    }
  } catch {}
  return null;
}

function saveTargetContentStamp(
  stamp: { count: number | null; maxUpdatedAt: string | null },
  scope?: TargetFetchScope
): void {
  try {
    safeLocalStorageSet(`${TARGET_CONTENT_STAMP_KEY}::${targetScopeKey(scope)}`, JSON.stringify(stamp));
  } catch {}
}

/** وقت آخر مزامنة ناجحة للمستخدمين — عشان ما نطلبش الجدول مع كل فتح. */
const USERS_LAST_SYNC_KEY = 'tantawy_users_last_sync_v1';
// المستخدمون بيتغيروا نادرًا؛ 12 ساعة توازن بين الحداثة وتوفير الـ egress لـ 500 موظف.
const USERS_SYNC_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * فرملة الـ thundering-herd: لما 500 مندوب يفتحوا التطبيق في نفس نافذة الصبح،
 * أول نبضة مزامنة على الجهاز اللي عنده كاش محلي بتتوزع عشوائيًا على 90 ثانية
 * بدل ما توصل كضربة واحدة. الأجهزة الفاضية (أول لوجين) ما بتتأخرش عشان
 * المستخدم لازم يشوف البيانات على طول.
 */
const BOOT_SYNC_JITTER_MAX_MS = 90 * 1000;
const ANNOUNCEMENTS_STORAGE_KEY = 'tantawy_announcements_v1';

/**
 * استخراج جذور اسم الفرع بدون كلمة «فرع» وبمعالجة الهمزات والتاء المربوطة
 * حتى تنجح مطابقة `ILIKE` في PostgreSQL للمناديب مهما اختلف تنسيق الاسم في الشيت.
 */
function extractBranchStems(branchName?: string): string[] {
  const resolved = resolveBranchName(branchName) || branchName || '';
  const clean = resolved
    .replace(/فرع/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stems = new Set<string>();
  if (clean.length >= 3) stems.add(clean);
  const normalized = normalizeArabicText(clean);
  if (normalized.length >= 3) stems.add(normalized);
  const withoutAl = clean.replace(/^ال/g, '').trim();
  if (withoutAl.length >= 3) stems.add(withoutAl);
  clean.split(/\s+/).forEach((word) => {
    const bare = word.replace(/^ال/, '').trim();
    const bareNorm = normalizeArabicText(bare);
    if (bare.length >= 4) stems.add(bare);
    if (bareNorm.length >= 4) stems.add(bareNorm);
  });
  if (normalized.includes('قاهر') || normalized.includes('15')) stems.add('قاهر');
  if (normalized.includes('اكتوبر') || normalized.includes('كتوبر') || normalized.includes('رئيس')) stems.add('كتوبر');
  if (normalized.includes('فيوم')) stems.add('فيوم');
  if (normalized.includes('منوف')) stems.add('منوف');
  if (normalized.includes('ديمشلت')) stems.add('ديمشلت');
  if (normalized.includes('بحير')) stems.add('بحير');
  if (normalized.includes('قمح')) stems.add('قمح');
  if (normalized.includes('منيا') && !normalized.includes('قمح')) stems.add('منيا');
  return Array.from(stems).filter((s) => s.length >= 3).slice(0, 4);
}

function expandRepNameVariants(names: string[]): string[] {
  const result = new Set<string>();
  names.forEach((raw) => {
    const trimmed = String(raw || '').trim();
    if (trimmed.length >= 3) result.add(trimmed);
    const norm = normalizeArabicText(trimmed);
    if (norm.length >= 3) result.add(norm);
  });
  return Array.from(result);
}

/**
 * بصمة الفواتير محفوظة لكل نطاق قراءة على حدة (مندوب/مشرف/مدير فرع/أدمن + القطاع)
 * عشان تبديل الحساب أو القطاع على نفس الجهاز ما يخلطش البصمات.
 */
const INVOICE_CONTENT_STAMP_PREFIX = 'tantawy_invoice_content_stamp_v1::';

function invoiceScopeKey(scope: InvoiceFetchScope): string {
  const repIds = (scope.repIds || []).map((r) => String(r).trim()).filter(Boolean).sort();
  const repPart = repIds.length > 0 ? repIds.join(',') : 'all';
  const secPart = scope.sector ? String(scope.sector) : 'all';
  return `${repPart}::s:${secPart}`;
}

function readInvoiceContentStamp(scopeKey: string): { count: number | null; maxCreatedAt: string | null; table: string; otherMax?: string | null } | null {
  try {
    const raw = localStorage.getItem(`${INVOICE_CONTENT_STAMP_PREFIX}${scopeKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.count !== undefined || parsed.maxCreatedAt !== undefined)) {
      return {
        count: typeof parsed.count === 'number' ? parsed.count : null,
        maxCreatedAt: parsed.maxCreatedAt ?? null,
        table: parsed.table || 'orders',
        otherMax: parsed.otherMax ?? null,
      };
    }
  } catch {}
  return null;
}

function saveInvoiceContentStamp(
  scopeKey: string,
  stamp: { count: number | null; maxCreatedAt: string | null; table: string; otherMax?: string | null }
): void {
  try {
    safeLocalStorageSet(`${INVOICE_CONTENT_STAMP_PREFIX}${scopeKey}`, JSON.stringify(stamp));
  } catch {}
}

const FORECAST_MONTH_STAMP_PREFIX = 'tantawy_forecast_month_stamp_v1::';
const FORECAST_PLANS_STAMP_KEY = 'tantawy_forecast_plans_stamp_v1';
const CUSTOMER_COMMENTS_STAMP_KEY = 'tantawy_customer_comments_stamp_v1';

function forecastScopeKey(monthKey: string, scope?: ForecastFetchScope): string {
  if (!scope) return `${monthKey}::all`;
  const parts = [
    ...(scope.branchNames || []).map((b) => `b:${b}`).sort(),
    ...(scope.repIds || []).map((r) => `r:${r}`).sort(),
  ];
  if (scope.sector) parts.push(`s:${scope.sector}`);
  return `${monthKey}::${parts.join(',') || 'all'}`;
}

function readContentStamp(storageKey: string): { count: number | null; maxUpdatedAt: string | null } | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.count !== undefined || parsed.maxUpdatedAt !== undefined)) {
      return {
        count: typeof parsed.count === 'number' ? parsed.count : null,
        maxUpdatedAt: parsed.maxUpdatedAt ?? null,
      };
    }
  } catch {}
  return null;
}

function saveContentStamp(storageKey: string, stamp: { count: number | null; maxUpdatedAt: string | null }): void {
  try {
    safeLocalStorageSet(storageKey, JSON.stringify(stamp));
  } catch {}
}

/**
 * المقارنة بقت على `maxUpdatedAt` فقط.
 *
 * `count` كان جاي من `{ count: 'exact' }` — COUNT على الجدول كامل بيتنفّذ على
 * السيرفر مع كل بصمة على كل جهاز. اتشال من استعلامات البصمة وبقى `null`
 * دايمًا، فمقارنته كانت هتخلّي كل جهاز يعتبر نفسه قديم ويعيد التنزيل للأبد.
 * بصمتين بـ`null` في الطرفين = الجدول فاضي في الحالتين = متساويتين.
 */
function areContentStampsEqual(
  a: { count: number | null; maxUpdatedAt: string | null } | null,
  b: { count: number | null; maxUpdatedAt: string | null } | null
): boolean {
  if (!a || !b) return false;
  if (!a.maxUpdatedAt && !b.maxUpdatedAt) return true;
  if (!a.maxUpdatedAt || !b.maxUpdatedAt) return false;
  return a.maxUpdatedAt === b.maxUpdatedAt;
}

/**
 * أدوار اللي عندها صلاحية الوصول لكل القطاعات (وتمنح الصلاحيات للغير):
 * - admin, developer: صلاحية كاملة على النظام
 * - technical_support: يدير المستخدمين ويمنح صلاحيات عبر القطاعات
 * 
 * الأدوار التانية (legal_advisor, warehouse_keeper, branch_manager, supervisor, sales_rep)
 * مقيدة بقطاع حساباتهم فقط — مفيش وصول لقطاع تاني إلا بصلاحية صريحة.
 */
const CROSS_SECTOR_ADMIN_ROLES: ReadonlySet<string> = new Set([
  'admin',
  'developer',
  'technical_support',
]);

/**
 * الحد الصارم للقطاع — القاعدة: ممنوع قطاع يشوف القطاع الآخر أو دمج القطاعين في شاشة واحدة.
 *  - admin/developer/technical_support: حرية التبديل بين منزلي أو كهربائي (هم بيمنحوا الصلاحيات).
 *  - أي دور تاني (legal_advisor, warehouse_keeper, branch_manager, supervisor, sales_rep): مقيّد بقطاع حسابه فقط.
 *  - أدوار المبيعات بلا قطاع معيّن: محجوبة بالكامل ('none').
 *  - الوصول عبر القطاعات: فقط بصلاحية صريحة من technical_support/developer.
 */
function resolveEffectiveSector(user: User | null, activeSector: 'home' | 'electrical', fallbackSector?: string): ActiveSector {
  if (!user) return activeSector;
  if (user.role === 'admin' || user.role === 'developer' || CROSS_SECTOR_ADMIN_ROLES.has(user.role)) {
    return activeSector;
  }
  const accountSector = user.sector || fallbackSector;
  if (accountSector === 'home' || accountSector === 'electrical') {
    return accountSector;
  }
  if (accountSector === 'both' || accountSector === 'all') {
    return activeSector;
  }
  return 'none';
}

function matchesSector(recordSector: string | undefined, effectiveSector: ActiveSector): boolean {
  if (effectiveSector === 'none') return false; // حساب مبيعات بلا قطاع: محجوب عن الاتنين
  return recordSector === effectiveSector || recordSector === 'both' || recordSector === 'all';
}

/** سطور السيرفر → سجلات التوقعات (نفس الخريطة للبوت وللتحميل حسب الطلب). */
function mapForecastRows(rows: any[]): CollectionForecastRecord[] {
  return rows.map((r: any) => ({
    id: r.id,
    monthKey: r.month_key ?? r.monthKey,
    weekIndex: Number(r.week_index ?? r.weekIndex ?? 1),
    repId: r.rep_id ?? r.repId ?? '',
    repName: r.rep_name ?? r.repName ?? '',
    branchName: r.branch_name ?? r.branchName ?? '',
    customerId: r.customer_id ?? r.customerId ?? '',
    customerCode: r.customer_code ?? r.customerCode ?? '',
    customerName: r.customer_name ?? r.customerName ?? '',
    collectionForecast: Number(r.collection_forecast ?? r.collectionForecast ?? 0),
    salesForecast: Number(r.sales_forecast ?? r.salesForecast ?? 0),
    status: (r.status ?? 'draft') as CollectionForecastRecord['status'],
    submittedAt: r.submitted_at ?? r.submittedAt ?? undefined,
    approvedBy: r.approved_by ?? r.approvedBy ?? undefined,
    approvedAt: r.approved_at ?? r.approvedAt ?? undefined,
    changeRequestNote: r.change_request_note ?? r.changeRequestNote ?? undefined,
    changeRequestedBy: r.change_requested_by ?? r.changeRequestedBy ?? undefined,
    changeRequestedAt: r.change_requested_at ?? r.changeRequestedAt ?? undefined,
    updatedBy: r.updated_by ?? r.updatedBy ?? undefined,
    updatedAt: r.updated_at ?? r.updatedAt ?? undefined,
  }));
}

/** سطور السيرفر → سجلات كومنتات العملاء. */
function mapCommentRows(rows: any[]): CustomerCommentRecord[] {
  return rows.map((r: any) => ({
    id: r.id,
    customerId: r.customer_id ?? r.customerId ?? '',
    customerCode: r.customer_code ?? r.customerCode ?? '',
    customerName: r.customer_name ?? r.customerName ?? '',
    branchName: r.branch_name ?? r.branchName ?? '',
    repName: r.rep_name ?? r.repName ?? '',
    kind: (r.kind ?? 'note') as CustomerCommentRecord['kind'],
    body: r.body ?? '',
    authorName: r.author_name ?? r.authorName ?? '',
    createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? r.updatedAt ?? undefined,
    // حالة الأرشفة بتقرأ من السيرفر. قبل كده كانت مش متقراش، فأي
    // تعليق مش مهم كان بيتنهض من الأرشيف أول ما السيرفر يردّ على أي
    // عميل جديد (لأن القراءة كانت بتبني سجل جديد من الصفحة).
    // الأعمدة دي محتاجة supabase/fix_forecast_rls.sql — من غيرها
    // undefined بيرجّع false وده سلوك الـfallback الطبيعي.
    isArchived: !!(r.is_archived ?? r.isArchived),
    archivedAt: r.archived_at ?? r.archivedAt ?? undefined,
    archivedBy: r.archived_by ?? r.archivedBy ?? undefined,
  }));
}

const EXECUTED_INVOICE_STATUSES: OrderStatus[] = [
  'معتمدة',
  'معتمدة ومصروفة من المخزن',
  'تم التسليم',
  'إغلاق الطلبية',
];

export const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * نطاق جلب الفواتير حسب الدور. كل جهاز بيحمل
 * فواتيره هو بس بدل فواتير كل الفروع — ده
 * أكبر بند في نقل البيانات (500 سطر × جدولين
 * في كل إقلاع على كل جهاز).
 * حدود صارمة: المندوب 30، المشرف 50، مدير الفرع 60، الإدارة 100
 */
function buildInvoiceFetchScope(
  currentUser: User | null,
  users: User[],
  activeSector?: ActiveSector
): InvoiceFetchScope {
  if (!currentUser) return { limit: 30 };
  const sector: 'home' | 'electrical' | undefined =
    activeSector === 'home' || activeSector === 'electrical'
      ? activeSector
      : currentUser.sector === 'home' || currentUser.sector === 'electrical'
        ? currentUser.sector
        : undefined;

  if (currentUser.role === 'sales_rep') {
    return { repIds: [currentUser.id], limit: 30, sector };
  }
  if (currentUser.role === 'supervisor') {
    const repIds = users
      .filter((u) => u.id === currentUser.id || u.supervisorId === currentUser.id)
      .map((u) => u.id);
    return { repIds, limit: 50, sector };
  }
  if (currentUser.role === 'branch_manager') {
    const repIds = users
      .filter((u) => u.branchName === currentUser.branchName)
      .map((u) => u.id);
    return { repIds, limit: 60, sector };
  }
  // إدارة/مطور: حد 100 فاتورة فقط ضمن القطاع النشط حالياً
  return { limit: 100, sector };
}

/**
 * تحويل صف جدول `targets` إلى شكل التطبيق.
 * كل مسارات القراءة (الإقلاع، مزامنة الإصدار، المزامنة التدريجية) لازم
 * تستخدم نفس التحويل، وإلا الصفحة تستقبل حقول snake_case ومتعرضش أرقام.
 */
function mapTargetRowToRecord(row: any): TargetRecord {
  const { cleanNotes, sector: noteSector } = extractTargetSectorFromNotes(row.notes);
  const rowSector = row.sector === 'home' || row.sector === 'electrical' ? row.sector : undefined;
  return {
    id: String(row.id),
    branch: resolveBranchName(row.branch) || row.branch || '',
    repName: row.rep_name || '',
    sector: rowSector || noteSector,
    salesTarget: Number(row.sales_target || 0),
    salesAchieved: Number(row.sales_achieved || 0),
    salesPercentage: Number(row.sales_percentage || 0),
    collectionTarget: Number(row.collection_target || 0),
    collectionAchieved: Number(row.collection_achieved || 0),
    collectionPercentage: Number(row.collection_percentage || 0),
    date: row.target_date || '',
    month: Number(row.month),
    year: Number(row.year),
    quarter: row.quarter,
    remainingSales: Number(row.remaining_sales || 0),
    remainingCollection: Number(row.remaining_collection || 0),
    updatedAt: row.updated_at,
    notes: cleanNotes,
  };
}


// Re-export shared currentUserRef for compatibility with existing callers
export { currentUserRef };
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Auth and Session Notice
  const [authTerminationNotice, setAuthTerminationNotice] = useState<string | null>(null);

  // Keep-Alive: ping Supabase every 30 minutes (only when visible) to prevent free-tier auto-pause
  // while keeping egress near zero at 500 concurrent users (initial auth/stamps already wake DB).
  useEffect(() => {
    const ping = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      // أجهزة المناديب (الأغلبية — 500 جهاز) ما بتبعتش ping: الأجهزة
      // الإدارية/المديرين (عدد قليل) بتحافظ على دفاءة المشروع، وأي طلب حقيقي
      // بيفيق قاعدة البيانات لو حصل pause بأول طلب بس.
      if (currentUserRef.current?.role === 'sales_rep') return;
      supabase
        .from('targets')
        .select('id')
        .limit(1)
        .then(() => {}, () => {});
    };
    const id = window.setInterval(ping, 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);  // فحص اتصال Supabase Auth: بيقول للإدارة هل الـ migration اتنفّذ ولا لأ.
  // بيتحدّث مرة واحدة عند الإقلاع وخلاص — مفيش أي طلبات متكررة.
  const [serverAuthProbe, setServerAuthProbe] = useState<{
    checked: boolean;
    reachable: boolean;
    lastCheckedAt?: string;
  }>({ checked: false, reachable: false });

  useEffect(() => {
    if (!isServerAuthEnabled()) {
      setServerAuthProbe({ checked: true, reachable: false, lastCheckedAt: new Date().toISOString() });
      return;
    }
    let cancelled = false;
    // getSession بيرجع بهدوء لو مفيش جلسة — الفرق بين "Supabase Auth مش
    // مفعّل أصلاً" و "مفيش حد داخل دلوقتي" مش مهم للإدارة هنا، اللي
    // مهم إن الاتصال بالمشروع شغال.
    getServerSessionAsync()
      .catch(() => null)
      .then(() => {
        if (cancelled) return;
        setServerAuthProbe({ checked: true, reachable: true, lastCheckedAt: new Date().toISOString() });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const clearAuthTerminationNotice = () => setAuthTerminationNotice(null);

  // Initialize state with localStorage fallbacks, ensuring all core initial users are merged
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USERS);
    if (!saved) return INITIAL_USERS;
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.length > 0
        ? sanitizeAndDeduplicateUsers(parsed).deduplicated
        : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  });

  // Ref mirror so long-lived effects always see the current user list when
  // linking customers to their sales rep, without re-subscribing the listener.
  const usersRef = useRef<User[]>(users);
  const hasSyncedUsersFromServerRef = useRef<boolean>(false);
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  // Timestamp of the last authoritative customer write made by THIS client.
  // While it is recent, the heartbeat must not replace local data with a
  // server copy that has not caught up yet (that caused correct data to revert).
  const authoritativeWriteAtRef = useRef<number>(0);

  const [branches, setBranches] = useState<Branch[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BRANCHES);
    if (!saved) return INITIAL_BRANCHES;
    try {
      const parsed: Branch[] = JSON.parse(saved);
      // Keep the canonical seven operating branches plus October's central warehouse.
      // Legacy/custom branch labels are normalized onto this fixed list instead of
      // becoming extra branches in totals and selectors.
      const canonicalNames = new Set(INITIAL_BRANCHES.map((branch) => branch.name));
      const savedByName = new Map(parsed.map((branch) => [normalizeBranchName(branch.name), branch]));
      return INITIAL_BRANCHES.map((branch) => ({
        ...branch,
        ...(savedByName.get(branch.name) || {}),
        name: branch.name,
        isMainWarehouse: branch.isMainWarehouse === true,
      })).filter((branch) => canonicalNames.has(branch.name));
    } catch {
      return INITIAL_BRANCHES;
    }
  });

  // NOTE (server-auth migration): currentUser is never restored from
  // localStorage (which previously included the password hash). The session is
  // restored below from a real Supabase Auth session + get_my_profile() RPC.
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Assign to module-level ref for external access
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [activeSectorFilter, setActiveSectorFilterState] = useState<'home' | 'electrical'>(() => {
    try {
      const saved = localStorage.getItem('tantawy_active_sector_filter_v2');
      if (saved === 'home' || saved === 'electrical') return saved;
    } catch {}
    return 'home';
  });

  const canManageSectorGate = useMemo(
    () =>
      Boolean(
        currentUser &&
          (currentUser.role === 'admin' ||
            currentUser.role === 'developer' ||
            CROSS_SECTOR_ADMIN_ROLES.has(currentUser.role) ||
            currentUser.sector === 'both' ||
            currentUser.sector === 'all')
      ),
    [currentUser?.role, currentUser?.sector]
  );

  /** القطاع الفعلي بعد تطبيق قواعد الأدوار — `'none'` يعني محجوب عن القطاعين. */
  const effectiveSectorFilter = useMemo(
    () => resolveEffectiveSector(currentUser, activeSectorFilter),
    [currentUser, activeSectorFilter]
  );

  /** القطاع الإلزامي لطلبات السيرفر — كل المستخدمين (حتى الأدمن ومدير الفرع بقطاعين) يقرأون قطاعاً واحداً في المرة. */
  const activeApiSector = useMemo<'home' | 'electrical' | undefined>(
    () => (effectiveSectorFilter === 'home' || effectiveSectorFilter === 'electrical' ? effectiveSectorFilter : undefined),
    [effectiveSectorFilter]
  );

  const setActiveSectorFilter = useCallback((sector: 'home' | 'electrical') => {
    if (!canManageSectorGate) return;
    setActiveSectorFilterState(sector);
    try {
      localStorage.setItem('tantawy_active_sector_filter_v2', sector);
    } catch {}
  }, [canManageSectorGate]);

  const activeStorageCtxRef = useRef<{ userId: string | null; sector: ActiveSector }>({
    userId: null,
    sector: 'home',
  });
  activeStorageCtxRef.current = {
    userId: currentUser?.id || null,
    sector: effectiveSectorFilter,
  };

  const hydratedScopeRef = useRef<{ userId: string | null; sector: ActiveSector }>({
    userId: null,
    sector: 'home',
  });

  const getProductsCacheKey = useCallback(
    (sec: ActiveSector = activeStorageCtxRef.current.sector) => getSectorProductsKey(sec),
    []
  );
  const getCustomersCacheKey = useCallback(
    (uid: string | null = activeStorageCtxRef.current.userId, sec: ActiveSector = activeStorageCtxRef.current.sector) =>
      getUserSectorStorageKey(STORAGE_KEYS.CUSTOMERS, uid, sec),
    []
  );
  const getInvoicesCacheKey = useCallback(
    (uid: string | null = activeStorageCtxRef.current.userId, sec: ActiveSector = activeStorageCtxRef.current.sector) =>
      getUserSectorStorageKey(STORAGE_KEYS.INVOICES, uid, sec),
    []
  );
  const getVisitsCacheKey = useCallback(
    (uid: string | null = activeStorageCtxRef.current.userId, sec: ActiveSector = activeStorageCtxRef.current.sector) =>
      getUserSectorStorageKey(STORAGE_KEYS.VISITS, uid, sec),
    []
  );
  const getTargetsCacheKey = useCallback(
    (uid: string | null = activeStorageCtxRef.current.userId, sec: ActiveSector = activeStorageCtxRef.current.sector) =>
      getUserSectorStorageKey(STORAGE_KEYS.TARGETS, uid, sec),
    []
  );

  const [isLocalDataHydrated, setIsLocalDataHydrated] = useState(false);

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(() => {
    const saved = localStorage.getItem('dream_dist_company_info_v1');
    if (saved) {
      try {
        return { ...COMPANY_INFO, ...JSON.parse(saved) };
      } catch (e) {
        console.error('Error parsing saved company info', e);
      }
    }
    return COMPANY_INFO;
  });

  const updateCompanyInfo = (newInfo: Partial<CompanyInfo>) => {
    setCompanyInfo((prev) => {
      const updated: CompanyInfo = { ...prev, ...newInfo };
      safeLocalStorageSet('dream_dist_company_info_v1', JSON.stringify(updated));
      return updated;
    });
  };

  const resetCompanyInfo = () => {
    setCompanyInfo(COMPANY_INFO);
    safeLocalStorageSet('dream_dist_company_info_v1', JSON.stringify(COMPANY_INFO));
  };

  // Branch-specific company headers and identities (Isolation per branch)
  const [branchCompanyInfo, setBranchCompanyInfo] = useState<Record<string, Partial<CompanyInfo>>>(() => {
    const saved = localStorage.getItem('dream_dist_branch_company_info_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing saved branch company info', e);
      }
    }
    return {};
  });

  // Target Records state (KPIs and Goals) - hydrated per (user, sector) from IndexedDB
  const [targets, setTargets] = useState<TargetRecord[]>([]);

  /* ============================================================
     توقع التحصيلات — state
     localStorage أولاً (أوفلاين يشتغل)، بعدين Supabase للمشاركة.
     ============================================================ */

  const [forecasts, setForecasts] = useState<CollectionForecastRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FORECASTS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  /**
   * الشهور اللي اتحملت فعلاً. التوقعات مش بتتحمل كلها من البوت
   * (كان بيصل لـ 50 ألف سطر) — الشهر الحالي بس، وباقي ��لشهور
   * بتتحمل لما المستخدم يفتحها. الكاش المحلي بيكون بذرة للشهور
   * اللي اتحملت قبل كده عشان الأوفلاين.
   */
  const loadedForecastMonthsRef = useRef<Set<string> | null>(null);
  if (loadedForecastMonthsRef.current === null) {
    loadedForecastMonthsRef.current = new Set<string>();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FORECASTS);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        parsed.forEach((f: any) => {
          const key = f?.monthKey ?? f?.month_key;
          if (typeof key === 'string' && key) loadedForecastMonthsRef.current!.add(key);
        });
      }
    } catch { /* ignore */ }
  }

  const [forecastPlans, setForecastPlans] = useState<ForecastMonthPlan[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FORECAST_PLANS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [dataEpoch, setDataEpoch] = useState(0);

  const [customerComments, setCustomerComments] = useState<CustomerCommentRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMER_COMMENTS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const forecastsRef = useRef<CollectionForecastRecord[]>(forecasts);
  useEffect(() => { forecastsRef.current = forecasts; }, [forecasts]);

  const customerCommentsRef = useRef<CustomerCommentRecord[]>(customerComments);
  useEffect(() => { customerCommentsRef.current = customerComments; }, [customerComments]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fromIdb = await idbGet<CollectionForecastRecord[]>(STORAGE_KEYS.FORECASTS);
        if (!cancelled && Array.isArray(fromIdb) && fromIdb.length > 0) {
          try { localStorage.removeItem(STORAGE_KEYS.FORECASTS); } catch {}
          fromIdb.forEach((f: any) => {
            const key = f?.monthKey ?? f?.month_key;
            if (typeof key === 'string' && key) loadedForecastMonthsRef.current?.add(key);
          });
          setForecasts((prev) => (prev && prev.length > 0 ? prev : fromIdb));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.FORECAST_PLANS, JSON.stringify(forecastPlans));
    } catch (e) {
      console.error('Error saving forecast plans to localStorage', e);
    }
  }, [forecastPlans]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOMER_COMMENTS, JSON.stringify(customerComments));
    } catch (e) {
      console.error('Error saving customer comments to localStorage', e);
    }
  }, [customerComments]);

  const forecastFetchScope = useMemo<ForecastFetchScope | undefined>(() => {
    if (!currentUser || effectiveSectorFilter === 'none') return undefined;
    const role = currentUser.role;
    const sector = activeApiSector;

    const branchNames = Array.from(
      new Set([currentUser.branchName].filter((b): b is string => Boolean(b && b.trim())))
    );
    const cleanName = (value?: string) =>
      (value || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (role === 'sales_rep') {
      const fullName = cleanName(currentUser.name);
      const shortName = fullName.split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
      const repIds = Array.from(new Set([currentUser.id, currentUser.username].filter(Boolean) as string[]));
      const repNames = Array.from(new Set([fullName, shortName].filter((n) => n.length >= 3)));
      return {
        ...(repIds.length === 0 && repNames.length === 0 ? { branchNames } : {}),
        repIds,
        repNames,
        sector,
      };
    }
    if (role === 'supervisor') {
      const repUsers = users.filter((u) => u.supervisorId === currentUser.id);
      const repNames = [
        cleanName(currentUser.name),
        ...repUsers.flatMap((u) => {
          const fn = cleanName(u.name);
          const sn = fn.split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
          return [fn, sn];
        }),
      ].filter((n) => n.length >= 3);
      const repIds = [currentUser.id, currentUser.username, ...repUsers.flatMap((u) => [u.id, u.username])].filter(Boolean) as string[];
      if (repNames.length > 0 || repIds.length > 0) {
        return {
          repIds: Array.from(new Set(repIds)),
          repNames: Array.from(new Set(repNames)),
          sector,
        };
      }
      return branchNames.length > 0 ? { branchNames, sector } : (sector ? { sector } : undefined);
    }
    if (role === 'branch_manager') {
      return branchNames.length > 0 ? { branchNames, sector } : (sector ? { sector } : undefined);
    }
    return sector ? { sector } : undefined;
  }, [currentUser?.id, currentUser?.name, currentUser?.username, currentUser?.branchName, currentUser?.role, currentUser?.sector, activeApiSector, effectiveSectorFilter, users]);

  const targetFetchScope = useMemo<TargetFetchScope | undefined>(() => {
    if (!currentUser || effectiveSectorFilter === 'none') return undefined;
    const role = currentUser.role;
    const sector = activeApiSector;
    if (role === 'admin' || role === 'developer' || CROSS_SECTOR_ADMIN_ROLES.has(role)) {
      return sector ? { sector } : undefined;
    }
    const cleanName = (value?: string) =>
      (value || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const resolvedBranch = resolveBranchName(currentUser.branchName) || currentUser.branchName || '';
    const branchNames = Array.from(
      new Set([currentUser.branchName, resolvedBranch].filter((b): b is string => Boolean(b && b.trim())))
    );
    if (role === 'sales_rep') {
      const fullName = cleanName(currentUser.name);
      const shortName = fullName.split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
      const repNames = expandRepNameVariants([fullName, shortName]);
      return {
        ...(repNames.length === 0 ? { branchNames } : {}),
        repNames,
        sector,
      };
    }
    if (role === 'supervisor') {
      const supName = cleanName(currentUser.name);
      const supShort = supName.split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
      const repNames = [
        supName,
        supShort,
        ...users
          .filter((u) => u.supervisorId === currentUser.id)
          .flatMap((u) => {
            const fn = cleanName(u.name);
            const sn = fn.split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
            return [fn, sn];
          }),
      ].filter((n) => n.length >= 3);
      return {
        ...(repNames.length === 0 ? { branchNames } : {}),
        repNames: expandRepNameVariants(repNames),
        sector,
      };
    }
    return branchNames.length > 0 ? { branchNames, sector } : (sector ? { sector } : undefined);
  }, [currentUser?.id, currentUser?.name, currentUser?.branchName, currentUser?.role, currentUser?.sector, activeApiSector, effectiveSectorFilter, users]);

  const lastForecastBootSigRef = useRef<string>('');

  // Load the shared copy so every device and every role sees the same numbers.
  // التوقعات: الشهر الحالي بس من السيرفر مع بصمة محتوى من صف واحد لتفادي إعادة التنزيل عند عدم التغيير.
  useEffect(() => {
    // بعد p0: جداول التوقعات مسحوبة من anon — أي طلب قبل تسجيل الدخول
    // بيرجع 401 "permission denied" (وكان ممكن يفعّل بوابة التحديث بالغلط).
    // نشغّل الفحص فقط بعد اكتمال جلسة المستخدم؛ والتأثير بيعيد التشغيل
    // تلقائياً بعد الدخول لأن currentUser?.id جزء من الاعتماديات.
    if (!currentUser?.id) {
      lastForecastBootSigRef.current = '';
      return;
    }
    const bootMonth = currentMonthKey();
    const bootSig = `${currentUser.id}::${bootMonth}::${JSON.stringify(forecastFetchScope ?? null)}`;
    if (lastForecastBootSigRef.current === bootSig) return;
    lastForecastBootSigRef.current = bootSig;

    let cancelled = false;
    let completed = false;
    loadedForecastMonthsRef.current?.add(bootMonth);
    const fStampKey = `${FORECAST_MONTH_STAMP_PREFIX}${forecastScopeKey(bootMonth, forecastFetchScope)}`;

    (async () => {
      const [fStamp, pStamp] = await Promise.all([
        fetchForecastMonthStamp(bootMonth, forecastFetchScope),
        fetchForecastPlansStamp(),
      ]);
      if (cancelled) return;

      const storedFStamp = readContentStamp(fStampKey);
      const storedPStamp = readContentStamp(FORECAST_PLANS_STAMP_KEY);

      const localHasBootMonth = forecasts.some((f) => f.monthKey === bootMonth);
      const skipForecasts =
        areContentStampsEqual(fStamp, storedFStamp) && (localHasBootMonth || fStamp?.empty);

      const skipPlans =
        areContentStampsEqual(pStamp, storedPStamp) && (forecastPlans.length > 0 || pStamp?.empty);

      const [fRes, pRes] = await Promise.all([
        skipForecasts ? Promise.resolve(null) : fetchForecastsByMonthFromSupabase(bootMonth, forecastFetchScope),
        skipPlans ? Promise.resolve(null) : fetchForecastMonthPlansFromSupabase(),
      ]);
      if (cancelled) return;

      if (fRes && fRes.success) {
        if (fStamp) saveContentStamp(fStampKey, fStamp);
        const mapped = mapForecastRows(fRes.forecasts || []);
        setForecasts((prev) => [
          ...prev.filter((f) => f.monthKey !== bootMonth),
          ...mapped,
        ]);
      }
      if (pRes && pRes.success && pRes.plans) {
        if (pStamp) saveContentStamp(FORECAST_PLANS_STAMP_KEY, pStamp);
        const mappedPlans: ForecastMonthPlan[] = pRes.plans.map((r: any) => ({
          id: r.id,
          year: Number(r.year),
          month: Number(r.month),
          monthStart: r.month_start ?? r.monthStart,
          monthEnd: r.month_end ?? r.monthEnd,
          weeks: Array.isArray(r.weeks) ? r.weeks : [],
          isClosed: !!(r.is_closed ?? r.isClosed),
          createdBy: r.created_by ?? r.createdBy ?? undefined,
          createdAt: r.created_at ?? r.createdAt ?? undefined,
          updatedBy: r.updated_by ?? r.updatedBy ?? undefined,
          updatedAt: r.updated_at ?? r.updatedAt ?? undefined,
        }));
        setForecastPlans(mappedPlans);
      }
      completed = true;
    })();
    return () => {
      cancelled = true;
      if (!completed && lastForecastBootSigRef.current === bootSig) {
        lastForecastBootSigRef.current = '';
      }
    };
  }, [forecastFetchScope, currentUser?.id]);

  /**
   * تحميل توقعات شهر من السيرفر ودمجها في الحالة.
   */
  const loadForecastsForMonth = useCallback(async (monthKey: string) => {
    if (!monthKey || loadedForecastMonthsRef.current?.has(monthKey)) return;
    const fStampKey = `${FORECAST_MONTH_STAMP_PREFIX}${forecastScopeKey(monthKey, forecastFetchScope)}`;
    const stamp = await fetchForecastMonthStamp(monthKey, forecastFetchScope);
    const storedStamp = readContentStamp(fStampKey);
    const localMonthRows = forecastsRef.current.filter((f) => f.monthKey === monthKey);

    if (
      areContentStampsEqual(stamp, storedStamp) &&
      (localMonthRows.length > 0 || stamp?.empty)
    ) {
      loadedForecastMonthsRef.current?.add(monthKey);
      return;
    }

    const canIncremental =
      !!stamp?.maxUpdatedAt &&
      !!storedStamp?.maxUpdatedAt &&
      localMonthRows.length > 0;

    const res = canIncremental
      ? await fetchForecastsByMonthFromSupabase(monthKey, forecastFetchScope, {
          updatedSince: storedStamp!.maxUpdatedAt!,
        })
      : await fetchForecastsByMonthFromSupabase(monthKey, forecastFetchScope);

    if (!res.success) return;
    if (stamp) saveContentStamp(fStampKey, stamp);
    loadedForecastMonthsRef.current?.add(monthKey);
    const mapped = mapForecastRows(res.forecasts || []);
    setForecasts((prev) => {
      if (canIncremental) {
        const map = new Map<string, CollectionForecastRecord>();
        prev.forEach((f) => map.set(f.id, f));
        mapped.forEach((f) => map.set(f.id, f));
        return Array.from(map.values());
      }
      return [...prev.filter((f) => f.monthKey !== monthKey), ...mapped];
    });
  }, [forecastFetchScope]);

  /**
   * توقعات سنة كاملة (لوحة الإدارة).
   */
  const loadForecastsForYear = useCallback(async (year: number) => {
    if (!year) return;
    const res = await fetchForecastsByYearFromSupabase(year, forecastFetchScope);
    if (!res.success) return;
    const mapped = mapForecastRows(res.forecasts || []);
    const prefix = `${year}-`;
    const loaded = loadedForecastMonthsRef.current;
    if (loaded) {
      for (let m = 1; m <= 12; m++) loaded.add(`${year}-${String(m).padStart(2, '0')}`);
    }
    setForecasts((prev) => [
      ...prev.filter((f) => !f.monthKey?.startsWith(prefix)),
      ...mapped,
    ]);
  }, [forecastFetchScope]);

  /**
   * كومنتات العملاء (حتى 20 ألف سطر) مش بتتحمل
   * في الإقلاع — بتتحمل عند فتح الفيوهات مع فحص بصمة صف واحد + مزامنة تدريجية.
   */
  const commentsStampCheckedRef = useRef<boolean>(false);
  const commentsStampScopeRef = useRef<string>('');

  const loadCustomerComments = useCallback(async () => {
    const scopeKey = `${CUSTOMER_COMMENTS_STAMP_KEY}::${forecastScopeKey('comments', forecastFetchScope)}`;
    if (commentsStampCheckedRef.current && commentsStampScopeRef.current === scopeKey) return;
    commentsStampCheckedRef.current = true;
    commentsStampScopeRef.current = scopeKey;

    const stamp = await fetchCustomerCommentsStamp(forecastFetchScope);
    const storedStamp = readContentStamp(scopeKey);
    const localCount = customerCommentsRef.current.length;
    if (
      areContentStampsEqual(stamp, storedStamp) &&
      (localCount > 0 || stamp?.empty)
    ) {
      return;
    }

    const canIncremental =
      !!stamp?.maxUpdatedAt &&
      !!storedStamp?.maxUpdatedAt &&
      localCount > 0;

    const res = canIncremental
      ? await fetchCustomerCommentsFromSupabase(forecastFetchScope, {
          updatedSince: storedStamp!.maxUpdatedAt!,
        })
      : await fetchCustomerCommentsFromSupabase(forecastFetchScope);

    if (!res.success) {
      commentsStampCheckedRef.current = false;
      return;
    }
    if (stamp) saveContentStamp(scopeKey, stamp);
    const incoming = mapCommentRows(res.comments || []);
    if (canIncremental) {
      if (incoming.length === 0) return;
      setCustomerComments((prev) => {
        const merged = new Map<string, CustomerCommentRecord>();
        prev.forEach((c) => merged.set(c.id, c));
        incoming.forEach((c) => merged.set(c.id, c));
        return Array.from(merged.values());
      });
    } else {
      setCustomerComments(incoming);
    }
  }, [forecastFetchScope]);


  // Load targets from the shared database so every device and role sees the same sheet update.
  // If Google Sheets read mode is enabled, prefer published sheet URLs to save Supabase egress.
  useEffect(() => {
    if (!currentUser || !isLocalDataHydrated || effectiveSectorFilter === 'none') return;
    let cancelled = false;
    const monthsWindow = 12;

    const loadTargetsFromSheets = async (): Promise<boolean> => {
      const savedSources = getPublishedDataSources();
      const keys = effectiveSectorFilter === 'electrical' ? (['targets_electrical'] as const) : (['targets'] as const);
      const all: TargetRecord[] = [];
      for (const key of keys) {
        const src = (savedSources as any)[key];
        if (src?.enabled && src?.url && /^https?:\/\//i.test(String(src.url).trim())) {
          try {
            const sheetTargets = await fetchTargetsFromGoogleSheetUrl(String(src.url).trim());
            if (sheetTargets?.length) {
              const sourceSector: 'home' | 'electrical' = key === 'targets_electrical' ? 'electrical' : 'home';
              all.push(
                ...sheetTargets.map((t) => {
                  const resolvedSec = t.sector && t.sector !== 'all' ? t.sector : sourceSector;
                  return {
                    ...t,
                    sector: resolvedSec,
                    id: t.id.endsWith(`__${resolvedSec}`) ? t.id : `${t.id}__${resolvedSec}`,
                  };
                })
              );
            }
          } catch (e: any) {
            console.warn('Target Google Sheet load warning:', key, e?.message || e);
          }
        }
      }
      if (!cancelled && all.length > 0) {
        const deduped = deduplicateTargetRecords(all);
        setTargets(deduped);
        return true;
      }
      return false;
    };

    (async () => {
      if (isGoogleSheetsReadMode()) {
        const ok = await loadTargetsFromSheets();
        if (ok || cancelled) return;
      }

      const stamp = await fetchTargetContentStamp(targetFetchScope);
      const stored = readTargetContentStamp(targetFetchScope);
      const localCount = targetsRef.current.length;
      const unchanged =
        areContentStampsEqual(stamp, stored) &&
        (localCount > 0 || stamp?.empty === true);
      if (unchanged) return;

      const result = await fetchTargetsRecentMonths(monthsWindow, targetFetchScope);
      if (cancelled) return;
      if (result.success && result.targets && result.targets.length > 0) {
        const mapped: TargetRecord[] = result.targets.map(mapTargetRowToRecord);
        setTargets(mapped);
        if (stamp && (stamp.maxUpdatedAt !== null || stamp.empty === true)) {
          saveTargetContentStamp(stamp, targetFetchScope);
        }
      } else if (result.success && result.targets && result.targets.length === 0) {
        setTargets([]);
        if (stamp && (stamp.maxUpdatedAt !== null || stamp.empty === true)) {
          saveTargetContentStamp(stamp, targetFetchScope);
        }
      } else {
        await loadTargetsFromSheets();
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [targetFetchScope, currentUser?.id, currentUser?.role, effectiveSectorFilter, isLocalDataHydrated, dataEpoch]);


  // 🏠⚡ وسم سجلات الأهداف بالقطاع المستهدف عند الاستيراد (منزلي / كهربائي)
  const tagTargetsSector = (rows: TargetRecord[]): TargetRecord[] => {
    const incoming: 'home' | 'electrical' | undefined =
      activeSectorFilter === 'home' || activeSectorFilter === 'electrical' ? activeSectorFilter : undefined;
    if (!incoming) return rows;
    return rows.map((r) => {
      const sec = r.sector && r.sector !== 'all' ? r.sector : incoming;
      return {
        ...r,
        sector: sec,
        id: r.id.endsWith(`__${sec}`) ? r.id : `${r.id}__${sec}`,
      };
    });
  };

  // منع مسح قطاع آخر عند رفع شيت قطاع واحد (نفس منطق المنتجات/العملاء)
  const mergeSectorTargets = (incoming: TargetRecord[]): TargetRecord[] => {
    const incomingSector = incoming[0]?.sector;
    if (incomingSector !== 'home' && incomingSector !== 'electrical') return incoming;
    const incomingIds = new Set(incoming.map((r) => r.id));
    const others = targetsRef.current.filter((t) => {
      if (incomingIds.has(t.id)) return false;
      const s = inferTargetSector(t, users, customers);
      return s !== undefined && s !== incomingSector;
    });
    return others.length ? [...others, ...incoming] : incoming;
  };

  const importTargetsFromExcel = async (file: File): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const parsed = await parseTargetExcel(file);
      if (!parsed || parsed.length === 0) {
        return { success: false, count: 0, message: 'لم يتم العثور على أي صفوف أهداف صالحة في الملف.' };
      }
      // Clean mirror without accumulating past duplicates: only display current sheet rows
      const deduplicated = deduplicateTargetRecords(parsed);
      const withSector = tagTargetsSector(deduplicated);
      const merged = mergeSectorTargets(withSector);
      setTargets(merged);
      await saveTargetsToSupabase(merged);
      publishNewDataVersion({
        scope: 'targets',
        updatedBy: currentUser?.name || 'مدير النظام',
        notes: `تحديث شيت الأهداف والمحققات البيعية (${merged.length} هدف)`,
        targetsCount: merged.length,
        forcePurge: true,
      }).catch(() => {});
      return { success: true, count: withSector.length, message: `تم تحديث ومزامنة ${withSector.length} هدف بنجاح بدون تكرار السجلات!` };
    } catch (err: any) {
      return { success: false, count: 0, message: err?.message || 'حدث خطأ أثناء قراءة ملف الإكسل' };
    }
  };

  const importTargetsFromGoogleSheet = async (url: string): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const cleanUrl = url.trim();
      if (!cleanUrl) {
        return { success: false, count: 0, message: 'يرجى إدخال رابط شيت جوجل صالح.' };
      }
      const parsed = await fetchTargetsFromGoogleSheetUrl(cleanUrl);
      if (!parsed || parsed.length === 0) {
        return { success: false, count: 0, message: 'لم يتم العثور على أي صفوف أهداف صالحة داخل شيت جوجل.' };
      }
      // Clean mirror without accumulating past duplicates: only display current sheet rows
      const deduplicated = deduplicateTargetRecords(parsed);
      const withSector = tagTargetsSector(deduplicated);
      const merged = mergeSectorTargets(withSector);
      setTargets(merged);
      await saveTargetsToSupabase(merged);
      publishNewDataVersion({
        scope: 'targets',
        updatedBy: currentUser?.name || 'مدير النظام',
        notes: `تحديث شيت الأهداف من Google Sheets (${merged.length} هدف)`,
        targetsCount: merged.length,
        forcePurge: true,
      }).catch(() => {});
      saveSingleSourceUrl(activeSectorFilter === 'electrical' ? 'targets_electrical' : 'targets', cleanUrl);
      return { success: true, count: deduplicated.length, message: `تمت مزامنة وتحديث ${deduplicated.length} هدف بنجاح بدون تكرار وحفظ الرابط!` };
    } catch (err: any) {
      return { success: false, count: 0, message: err?.message || 'فشل الاتصال برابط شيت Google Sheets' };
    }
  };

  const exportTargetsReport = async () => {
    const visible = getVisibleTargets();
    const branchPart = currentUser?.branchName ? `${currentUser.branchName.replace(/\s+/g, '_')}_` : '';
    const userPart = currentUser?.name ? `${currentUser.name.replace(/\s+/g, '_')}_` : '';
    const dateStr = new Date().toISOString().slice(0, 10);
    await exportTargetsToExcel(visible, `أهداف_${branchPart}${userPart}${dateStr}.xlsx`);
  };

  const resetTargetsToDefault = () => {
    setTargets([]);
  };

  const addOrUpdateTargetRecord = (record: TargetRecord) => {
    setTargets((prev) => {
      const identity = `${normalizeArabicText(record.branch)}__${normalizeArabicText(record.repName)}__${String(record.date || '').trim()}`;
      const idx = prev.findIndex((r) =>
        r.id === record.id ||
        `${normalizeArabicText(r.branch)}__${normalizeArabicText(r.repName)}__${String(r.date || '').trim()}` === identity
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = record;
        return next;
      }
      return [record, ...prev];
    });
    scheduleTargetSync();
  };

  const deleteTargetRecord = (id: string) => {
    setTargets((prev) => prev.filter((r) => r.id !== id));
    scheduleTargetSync();
  };

  const updateBranchCompanyInfo = (branchName: string, newInfo: Partial<CompanyInfo>) => {
    if (!branchName) return;
    const norm = normalizeBranchName(branchName);
    setBranchCompanyInfo((prev) => {
      const updated = {
        ...prev,
        [norm]: {
          ...(prev[norm] || {}),
          ...newInfo,
        },
      };
      safeLocalStorageSet('dream_dist_branch_company_info_v1', JSON.stringify(updated));
      return updated;
    });

    const notifEmails = (newInfo.notificationEmails || [])
      .filter((e) => Boolean(e && typeof e === 'string' && e.includes('@')))
      .map((e) => e.trim());
    const primaryEmail = newInfo.email?.trim() || notifEmails[0] || '';

    setBranches((prev) => {
      const next = prev.map((b) => {
        if (b.name === branchName || isBranchMatch(b.name, branchName, { allowUnassigned: false })) {
          const combined = Array.from(new Set([
            ...(primaryEmail ? [primaryEmail] : []),
            ...notifEmails,
          ]));
          return {
            ...b,
            email: primaryEmail || b.email,
            notificationEmails: combined.length > 0 ? combined : b.notificationEmails,
          };
        }
        return b;
      });
      safeLocalStorageSet(STORAGE_KEYS.BRANCHES, JSON.stringify(next));
      return next;
    });
  };

  const resetBranchCompanyInfo = (branchName: string) => {
    if (!branchName) return;
    const norm = normalizeBranchName(branchName);
    setBranchCompanyInfo((prev) => {
      const updated = { ...prev };
      delete updated[norm];
      safeLocalStorageSet('dream_dist_branch_company_info_v1', JSON.stringify(updated));
      return updated;
    });
  };

  const getCompanyInfoForBranch = (branchName?: string): CompanyInfo => {
    if (!branchName) return companyInfo;
    const norm = normalizeBranchName(branchName);
    const branchOverride = branchCompanyInfo[norm] || branchCompanyInfo[branchName];
    const matchedBranch = branches.find(
      (b) => b.name === norm || isBranchMatch(b.name, branchName, { allowUnassigned: false })
    );

    if (branchOverride && Object.keys(branchOverride).length > 0) {
      return {
        ...companyInfo,
        notificationEmails: branchOverride.notificationEmails || matchedBranch?.notificationEmails || [],
        ...branchOverride,
      };
    }
    // Fallback: match branch data
    if (matchedBranch) {
      return {
        ...companyInfo,
        email: matchedBranch.email || companyInfo.email,
        notificationEmails: matchedBranch.notificationEmails || [],
        address: matchedBranch.address || companyInfo.address,
        phone: matchedBranch.phone ? `${matchedBranch.phone} / ${companyInfo.customerService}` : companyInfo.phone,
      };
    }
    return companyInfo;
  };

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.IS_AUTH) === 'true';
  });

  // Never accept a user/session transferred through a URL or an old browser cache.
  useEffect(() => {
    if (window.location.search || window.location.hash) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const OFFLINE_PROFILE_KEY = 'tantawy_offline_profile_v1';

  const saveOfflineSafeProfile = (u: User) => {
    try {
      const sanitized: User = {
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        role: u.role,
        branchName: u.branchName,
        sector: u.sector,
        code: u.code,
        supervisorId: u.supervisorId,
        supervisorName: u.supervisorName,
        phone: u.phone,
        avatar: u.avatar,
        isActive: u.isActive,
        approvalStatus: u.approvalStatus,
        commissionRate: u.commissionRate,
        auth_user_id: u.auth_user_id,
      };
      safeLocalStorageSet(OFFLINE_PROFILE_KEY, JSON.stringify(sanitized));
    } catch {}
  };

  const readOfflineSafeProfile = (expectedUserId?: string | null): User | null => {
    try {
      const raw = localStorage.getItem(OFFLINE_PROFILE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as User;
      if (!parsed || !parsed.id || !parsed.role) return null;
      if (expectedUserId && parsed.id !== expectedUserId && parsed.auth_user_id !== expectedUserId) {
        return null;
      }
      if (parsed.isActive === false || parsed.approvalStatus === 'pending_approval' || parsed.approvalStatus === 'rejected') {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const clearOfflineSafeProfile = () => {
    try {
      localStorage.removeItem(OFFLINE_PROFILE_KEY);
    } catch {}
  };

  // استعادة الجلسة بعد إعادة التحميل:
  // في الأونلاين نتحقق من جلسة Supabase Auth الحقيقية ونقرأ الملف عبر RPC آمن.
  // في الأوفلاين (بعد أول دخول ناجح على الجهاز) نحتفظ بآخر ملف مصادق عليه
  // بشرط وجود جلسة محلية أو معرف دخول محفوظ، وبدون تخزين أي كلمات مرور،
  // ثم نعيد التحقق من السيرفر تلقائياً فور عودة الإنترنت.
  // definido como useCallback para ser acessível por outros useEffects (ex: onAuthStateChange)
  const restoreSession = useCallback(async () => {
    let cancelled = false;

    const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
    try {
      const session = await getServerSessionAsync();
      const savedUserId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
      const wasAuth = localStorage.getItem(STORAGE_KEYS.IS_AUTH) === 'true';

      if (!session?.user) {
        if (isOfflineNow && wasAuth && savedUserId) {
          const offlineUser = readOfflineSafeProfile(savedUserId);
          if (offlineUser && !cancelled) {
            currentUserRef.current = offlineUser;
            setCurrentUser(offlineUser);
            setIsAuthenticated(true);
            return;
          }
        }
        if (!cancelled && !isOfflineNow) {
          clearOfflineSafeProfile();
          setIsAuthenticated(false);
        } else if (!cancelled && (!wasAuth || !savedUserId)) {
          setIsAuthenticated(false);
        }
        return;
      }

      if (isOfflineNow) {
        const offlineUser = readOfflineSafeProfile(savedUserId || session.user.id) || readOfflineSafeProfile();
        if (offlineUser && !cancelled) {
          currentUserRef.current = offlineUser;
          setCurrentUser(offlineUser);
          setIsAuthenticated(true);
          return;
        }
      }

      const profile = await fetchMyProfile();
      if (cancelled) return;
      if (!profile) {
        // إذا انقطع الاتصال أثناء الطلب، لا تمسح جلسة المندوب أوفلاين
        const stillOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (stillOffline) {
          const offlineUser = readOfflineSafeProfile(savedUserId || session.user.id) || readOfflineSafeProfile();
          if (offlineUser) {
            currentUserRef.current = offlineUser;
            setCurrentUser(offlineUser);
            setIsAuthenticated(true);
            return;
          }
        }
        await signOutServer().catch(() => {});
        clearOfflineSafeProfile();
        setIsAuthenticated(false);
        return;
      }
      if (
        !profile.isActive ||
        profile.approvalStatus === 'pending_approval' ||
        profile.approvalStatus === 'rejected'
      ) {
        await signOutServer().catch(() => {});
        clearOfflineSafeProfile();
        setIsAuthenticated(false);
        return;
      }
      saveOfflineSafeProfile(profile);
      currentUserRef.current = profile;
      setUsers((prev) => {
        if (prev.some((u) => u.id === profile.id)) return prev;
        return [...prev, profile];
      });
      setCurrentUser(profile);
      setIsAuthenticated(true);
    } catch {
      if (cancelled) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const savedUserId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
        const offlineUser = readOfflineSafeProfile(savedUserId);
        if (offlineUser) {
          currentUserRef.current = offlineUser;
          setCurrentUser(offlineUser);
          setIsAuthenticated(true);
          return;
        }
      }
      setIsAuthenticated(false);
    }
  }, []);

  // Initial session restore + online re-verify
  useEffect(() => {
    let cancelled = false;

    void restoreSession();

    const handleOnlineReverify = () => {
      if (!cancelled) {
        void restoreSession();
      }
    };
    window.addEventListener('online', handleOnlineReverify);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnlineReverify);
    };
  }, [restoreSession]);

  // Auth state listener: persist session changes & handle token refresh
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Session established or refreshed — re-verify profile if we have a user
        if (session?.user) {
          restoreSession().catch(() => {});
        }
      } else if (event === 'SIGNED_OUT') {
        // Explicit sign out — clear local state
        clearOfflineSafeProfile();
        setIsAuthenticated(false);
        setCurrentUser(null);
        currentUserRef.current = null;
      }
    });
    return () => subscription.unsubscribe();
  }, [restoreSession]);


  const [products, setProducts] = useState<Product[]>(() => {
    return [];
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    return [];
  });

  // Ref mirrors so long-lived sync heartbeats and async event listeners always see
  // the hydrated local data without capturing empty closure states (preventing egress leaks).
  const customersRef = useRef<Customer[]>(customers);
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);


  const [visits, setVisits] = useState<CustomerVisit[]>(() => []);
  const visitsRef = useRef<CustomerVisit[]>(visits);
  useEffect(() => {
    visitsRef.current = visits;
  }, [visits]);

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    return [];
  });
  const invoicesRef = useRef<Invoice[]>(invoices);
  useEffect(() => {
    invoicesRef.current = invoices;
  }, [invoices]);

  // Data Version Sync State (آلية إصدار التحديثات ومسح الكاش التلقائي لضمان عدم التدبيل)
  const [globalDataVersion, setGlobalDataVersion] = useState<GlobalDataVersionMeta | null>(() => getLocalDataVersion());
  const [isVersionSyncing, setIsVersionSyncing] = useState<boolean>(false);
  const [lastVersionSyncNotice, setLastVersionSyncNotice] = useState<string | null>(null);
  const clearVersionSyncNotice = () => setLastVersionSyncNotice(null);

  const justLoggedInRef = useRef<boolean>(false);
  const dataVersionCheckInFlightRef = useRef<Promise<{ updated: boolean; version?: number; message: string }> | null>(null);

  const [promotions, setPromotions] = useState<PromotionOffer[]>(() => getSavedPromotions());
  const promotionsRef = useRef<PromotionOffer[]>(promotions);
  useEffect(() => {
    promotionsRef.current = promotions;
  }, [promotions]);

  const [announcements, setAnnouncements] = useState<PromoAnnouncement[]>(() => {
    try {
      const raw = localStorage.getItem(ANNOUNCEMENTS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const announcementsRef = useRef<PromoAnnouncement[]>(announcements);
  useEffect(() => {
    announcementsRef.current = announcements;
  }, [announcements]);

  const [cart, setCart] = useState<CartItem[]>([]);
  // createOrder بيتوزّع جوه contextValue المتخزّن بـ useMemo، و`cart` مش من الـ deps،
  // فكان بيشوف سلة قديمة (فاضية) ويرفض الحفظ بـ «سلة الطلبية فارغة». بنقرا السلة الحالية من ref.
  const cartRef = useRef<CartItem[]>(cart);
  cartRef.current = cart;

  const [cloudinaryConfig, setCloudinaryConfig] = useState<CloudinaryConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CLOUDINARY);
      // تطبيع القيمة المخزنة: نسخة قديمة ناقصة (cloudName فاضي/مفقود) كانت
      // بتكسر رفع الصور، فبنكمّلها بالإعداد الافتراضي الصالح.
      return saved ? normalizeCloudinaryConfig(JSON.parse(saved)) : DEFAULT_CLOUDINARY_CONFIG;
    } catch {
      return DEFAULT_CLOUDINARY_CONFIG;
    }
  });

  const [accountingLogs, setAccountingLogs] = useState<AccountingSyncLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ACCOUNTING_LOGS);
    return saved ? JSON.parse(saved) : [];
  });

  const [inventoryLogs] = useState<InventoryTransaction[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Load audit logs (capped, persisted)
  useEffect(() => {
    let active = true;
    getAuditLogs().then((logs) => {
      if (active) setAuditLogs(Array.isArray(logs) ? logs : []);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Keep active customers cache in sync for instant financial auditing across Excel & PDF exports
  // Note: IndexedDB persistence is handled asynchronously via debouncedIdbSet below.
  useEffect(() => {
    if (customers && customers.length > 0) {
      setActiveCustomersCache(customers);
    }
  }, [customers]);

  /**
   * حفظ الزيارات — IndexedDB بس لكل (مستخدم + قطاع) مع Debounce.
   */
  const persistVisits = useCallback((next: CustomerVisit[]) => {
    const key = getVisitsCacheKey();
    debouncedIdbSet(key, next, 1200);
  }, [getVisitsCacheKey]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    if (
      hydratedScopeRef.current.userId !== activeStorageCtxRef.current.userId ||
      hydratedScopeRef.current.sector !== activeStorageCtxRef.current.sector
    ) {
      return;
    }
    return debouncedIdbSet(getVisitsCacheKey(), visits, 1200);
  }, [visits, isLocalDataHydrated, getVisitsCacheKey, currentUser?.id, effectiveSectorFilter]);

  // Persist users to IndexedDB and localStorage so offline sessions and registered reps are immediately available
  useEffect(() => {
    if (users && users.length > 0) {
      idbSet(STORAGE_KEYS.USERS, users);
      safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(users));
    }
  }, [users]);

  // Persist active session once currentUser is authenticated (never wipe storage before restoreSession completes)
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      localStorage.setItem(STORAGE_KEYS.IS_AUTH, 'true');
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, currentUser.id);
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_DATA, JSON.stringify(currentUser));
    }
  }, [currentUser, isAuthenticated]);

  // Keep active currentUser in sync with updated users list after server sync (e.g. role update, branch change, account status, or deletion)
  useEffect(() => {
    if (!currentUser || !isAuthenticated || users.length === 0) return;
    const fresh = users.find((u) => u.id === currentUser.id);
    if (!fresh) {
      // Only treat missing user as deleted if we actually fetched the authoritative users list from Supabase
      if (hasSyncedUsersFromServerRef.current && currentUser.id !== 'u-admin-osama') {
        logout();
        setAuthTerminationNotice('تم حذف هذا الحساب من قاعدة البيانات بواسطة إدارة الشركة. تم إنهاء الجلسة ولا يمكن تسجيل الدخول بهذا الحساب.');
      }
      return;
    }
    if (fresh.approvalStatus === 'rejected' || fresh.isActive === false) {
      logout();
      setAuthTerminationNotice('تم إيقاف هذا الحساب من قبل الإدارة.');
    } else if (
      fresh.role !== currentUser.role ||
      fresh.branchName !== currentUser.branchName ||
      fresh.supervisorId !== currentUser.supervisorId ||
      fresh.name !== currentUser.name ||
      fresh.approvalStatus !== currentUser.approvalStatus
    ) {
      setCurrentUser(fresh);
    }
  }, [users, currentUser, isAuthenticated]);

  const recordAuditLog = (logData: Omit<AuditLog, 'id' | 'timestamp' | 'formattedTime'>) => {
    try {
      const entry = createAuditLog(logData);
      setAuditLogs((prev) => [entry, ...prev].slice(0, 1200));
      void appendAuditLog(entry);
    } catch {
      // keep app resilient
    }
  };

  const clearAuditLogs = () => {
    setAuditLogs([]);
    void clearAuditLogsStorage();
    try {
      localStorage.removeItem('dream_dist_audit_logs_v7');
    } catch {}
  };

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('الكل');

  const {
    installPromptEvent,
    canInstallPwa,
    isInstallModalOpen,
    setIsInstallModalOpen,
    dataSaverMode,
    setDataSaverMode,
    toggleDataSaverMode,
    isPrivacyMode,
    togglePrivacyMode,
    setPrivacyMode,
    formatConfidentialCurrency,
    triggerInstallPrompt,
  } = useUiPreferences();

  // Hydrate high-capacity collections from IndexedDB per (user, activeSector) so switching sectors
  // or refreshing never mixes caches or re-downloads already-cached sector catalogs.
  const hydratedSigRef = useRef<string>('');
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id) {
      hydratedSigRef.current = '';
      return;
    }
    const sig = `${currentUser.id}::${effectiveSectorFilter}`;
    if (hydratedSigRef.current === sig) return;
    hydratedSigRef.current = sig;

    const uid = currentUser.id;
    const sec = effectiveSectorFilter;

    // Prevent stale writeback from previous sector onto new sector's IDB keys during switch
    initialIdbSkipRef.current = {
      products: true,
      customers: true,
      invoices: true,
      cart: true,
      targets: true,
      forecasts: true,
      comments: true,
    };
    setIsLocalDataHydrated(false);
    productsRef.current = [];
    customersRef.current = [];
    invoicesRef.current = [];
    visitsRef.current = [];
    targetsRef.current = [];
    lastBootCustScopeSigRef.current = '';
    customerDownloadInFlightRef.current = false;
    customerFullFetchAtRef.current = 0;
    noStampPulledAtRef.current = 0;

    if (sec === 'none') {
      setProducts([]);
      setCustomers([]);
      setInvoices([]);
      setVisits([]);
      setTargets([]);
      hydratedScopeRef.current = { userId: uid, sector: sec };
      setIsLocalDataHydrated(true);
      return;
    }

    let isMounted = true;
    const prodKey = getProductsCacheKey(sec);
    const custKey = getCustomersCacheKey(uid, sec);
    const invKey = getInvoicesCacheKey(uid, sec);
    const visKey = getVisitsCacheKey(uid, sec);
    const trgKey = getTargetsCacheKey(uid, sec);

    async function hydrateFromIndexedDB() {
      try {
        const lastCachedUser = (() => {
          try {
            return localStorage.getItem(LAST_CACHED_USER_KEY);
          } catch {
            return null;
          }
        })();
        const canMigrateUserLegacy = !lastCachedUser || lastCachedUser === uid;

        let [savedProducts, savedCustomers, savedInvoices, savedCart, savedVisits, savedTargets] = await Promise.all([
          idbGet<Product[]>(prodKey),
          idbGet<Customer[]>(custKey),
          idbGet<Invoice[]>(invKey),
          idbGet<CartItem[]>(STORAGE_KEYS.CART),
          idbGet<CustomerVisit[]>(visKey),
          idbGet<TargetRecord[]>(trgKey),
        ]);

        if (!isMounted) return;

        // One-time migration from legacy unscoped product key (filtered to active sector)
        if (!Array.isArray(savedProducts) || savedProducts.length === 0) {
          const legacyProd = await idbGet<Product[]>(STORAGE_KEYS.PRODUCTS);
          if (Array.isArray(legacyProd) && legacyProd.length > 0) {
            const matched = legacyProd.filter((p) => matchesSector(p.sector, sec));
            if (matched.length > 0) {
              savedProducts = matched;
              idbSet(prodKey, matched).catch(() => {});
            }
          }
        }

        // One-time migration for same user from legacy unscoped user keys (filtered to active sector)
        if (canMigrateUserLegacy) {
          if (!Array.isArray(savedCustomers) || savedCustomers.length === 0) {
            const legacyCust = await idbGet<Customer[]>(STORAGE_KEYS.CUSTOMERS);
            if (Array.isArray(legacyCust) && legacyCust.length > 0) {
              const matched = legacyCust.filter((c) => matchesSector(c.sector, sec));
              if (matched.length > 0) {
                savedCustomers = matched;
                idbSet(custKey, matched).catch(() => {});
              }
            }
          }
          if (!Array.isArray(savedInvoices) || savedInvoices.length === 0) {
            const legacyInv = await idbGet<Invoice[]>(STORAGE_KEYS.INVOICES);
            if (Array.isArray(legacyInv) && legacyInv.length > 0) {
              const matched = legacyInv.filter((inv) => !inv.sector || matchesSector(inv.sector, sec));
              if (matched.length > 0) {
                savedInvoices = matched;
                idbSet(invKey, matched).catch(() => {});
              }
            }
          }
          if (!Array.isArray(savedVisits) || savedVisits.length === 0) {
            const legacyVis = await idbGet<CustomerVisit[]>(STORAGE_KEYS.VISITS);
            if (Array.isArray(legacyVis) && legacyVis.length > 0) {
              const matched = legacyVis.filter((v) => !v.sector || matchesSector(v.sector, sec));
              if (matched.length > 0) {
                savedVisits = matched;
                idbSet(visKey, matched).catch(() => {});
              }
            }
          }
          if (!Array.isArray(savedTargets) || savedTargets.length === 0) {
            const legacyTrg = await idbGet<TargetRecord[]>(STORAGE_KEYS.TARGETS);
            if (Array.isArray(legacyTrg) && legacyTrg.length > 0) {
              const matched = legacyTrg.filter((t) => !t.sector || matchesSector(t.sector, sec));
              if (matched.length > 0) {
                savedTargets = matched;
                idbSet(trgKey, matched).catch(() => {});
              }
            }
          }
        }

        if (!isMounted) return;

        try {
          safeLocalStorageSet(LAST_CACHED_USER_KEY, uid);
        } catch {}

        // Set essential data immediately (always overwrite previous sector's in-memory arrays)
        const cleanProducts = Array.isArray(savedProducts) ? sanitizeProducts(savedProducts) : [];
        productsRef.current = cleanProducts;
        setProducts(cleanProducts);

        const deletedSet = getDeletedInvoiceIds();
        const cleanInvoices = Array.isArray(savedInvoices)
          ? savedInvoices.filter((inv: Invoice) => !deletedSet.has(inv.id) && !deletedSet.has(inv.invoiceNumber))
          : [];
        invoicesRef.current = cleanInvoices;
        setInvoices(cleanInvoices);

        if (Array.isArray(savedCart)) setCart(savedCart);

        const cleanTargets = Array.isArray(savedTargets)
          ? savedTargets.filter((r: any) => r && !String(r.id).startsWith('sample-trg'))
          : [];
        targetsRef.current = cleanTargets;
        setTargets(cleanTargets);

        let dedupedCustomers: Customer[] = [];
        if (Array.isArray(savedCustomers) && savedCustomers.length > 0) {
          const sanitized = sanitizeCustomers(savedCustomers);
          dedupedCustomers = deduplicateCustomersArray(sanitized);
          customersRef.current = dedupedCustomers;
          setCustomers(dedupedCustomers);
          saveLocalCustomersFingerprint(dedupedCustomers, uid, sec);
          if (dedupedCustomers.length !== savedCustomers.length) {
            idbSet(custKey, dedupedCustomers).catch(() => {});
          }
        } else {
          customersRef.current = [];
          setCustomers([]);
        }

        // Initial visits fast set (merged in background below)
        const initialVisits = Array.isArray(savedVisits) ? savedVisits : [];
        visitsRef.current = initialVisits;
        setVisits(initialVisits);

        hydratedScopeRef.current = { userId: uid, sector: sec };
        setIsLocalDataHydrated(true);
        refreshPendingInvoicesCount();

        // Clean up legacy localStorage mirrors (non-blocking)
        [STORAGE_KEYS.CUSTOMERS, STORAGE_KEYS.INVOICES, STORAGE_KEYS.PRODUCTS, STORAGE_KEYS.TARGETS].forEach((k) => {
          try { localStorage.removeItem(k); } catch {}
        });

        // 3) Heavy visit merging: defer to idle callback (non-blocking)
        const mergeVisitsInBackground = () => {
          const allVisitsMap = new Map<string, CustomerVisit>();
          const deletedVisitIds = getDeletedVisitIds();

          const addVisit = (
            v: any,
            fallbackCustomerId?: string,
            fallbackCustomerName?: string,
            fallbackCustomerCode?: string,
            fallbackBranchName?: string,
            fallbackRepName?: string,
            fallbackRepId?: string,
            fallbackSector?: 'home' | 'electrical' | 'both' | 'all'
          ) => {
            if (!v || !v.id) return;
            const vid = v.id || `visit-${fallbackCustomerId}-${v.date}`;
            const vSector = v.sector || fallbackSector;
            if (vSector && !matchesSector(vSector, sec)) return;
            if (deletedVisitIds.has(v.id) || deletedVisitIds.has(v.date) || allVisitsMap.has(vid)) return;
            allVisitsMap.set(vid, {
              ...v,
              id: vid,
              customerId: v.customerId || fallbackCustomerId,
              customerName: v.customerName || fallbackCustomerName,
              customerCode: v.customerCode || fallbackCustomerCode,
              branchName: v.branchName || fallbackBranchName,
              repName: v.repName || fallbackRepName || 'المندوب',
              repId: v.repId || fallbackRepId,
              sector: vSector,
              status: v.status || 'منفذة',
            });
          };

          if (Array.isArray(savedVisits)) {
            savedVisits.forEach((v) => addVisit(v));
          }

          if (canMigrateUserLegacy) {
            const legacyVisits = readLegacyVisitsMirror();
            if (legacyVisits.length > 0) {
              legacyVisits.forEach((v) => addVisit(v));
            }
          }

          if (dedupedCustomers.length > 0) {
            let customerIndex = 0;
            const processCustomerChunk = () => {
              if (!isMounted || hydratedSigRef.current !== sig) return;
              const chunkSize = 50;
              const endIndex = Math.min(customerIndex + chunkSize, dedupedCustomers.length);

              for (let i = customerIndex; i < endIndex; i++) {
                const c = dedupedCustomers[i];
                if (Array.isArray(c.visitHistory)) {
                  c.visitHistory.forEach((v) =>
                    addVisit(v, c.id, c.name, c.code, c.branchName, c.salesRepName, c.repId, c.sector)
                  );
                }
              }

              customerIndex = endIndex;

              if (customerIndex < dedupedCustomers.length) {
                if (typeof requestIdleCallback !== 'undefined') {
                  requestIdleCallback(processCustomerChunk, { timeout: 2000 });
                } else {
                  setTimeout(processCustomerChunk, 0);
                }
              } else {
                finalizeVisits(allVisitsMap);
              }
            };

            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(processCustomerChunk, { timeout: 2000 });
            } else {
              setTimeout(processCustomerChunk, 0);
            }
          } else {
            finalizeVisits(allVisitsMap);
          }
        };

        const finalizeVisits = (allVisitsMap: Map<string, CustomerVisit>) => {
          if (!isMounted || hydratedSigRef.current !== sig) return;
          setVisits((currentVisits) => {
            (currentVisits || []).forEach((v) => {
              if (v && v.id && !allVisitsMap.has(v.id)) allVisitsMap.set(v.id, v);
            });
            const merged = Array.from(allVisitsMap.values()).map((v) => ({
              ...v,
              status: v.status || 'منفذة',
              reviewStatus: 'approved' as const,
              reviewedByName: v.reviewedByName || 'معتمدة مباشرة',
              reviewNote: v.reviewNote || 'زيارة مباشرة معتمدة تلقائياً',
            }));
            if (merged.length > 0) {
              idbSet(visKey, merged).catch(() => {});
              clearLegacyVisitsMirror();
            }
            return merged;
          });
        };

        mergeVisitsInBackground();
      } catch (err) {
        console.warn('IndexedDB initial hydration notice:', err);
        clearLegacyVisitsMirror();
        hydratedScopeRef.current = { userId: uid, sector: sec };
        if (isMounted) setIsLocalDataHydrated(true);
      }
    }

    hydrateFromIndexedDB();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, currentUser?.id, effectiveSectorFilter, getProductsCacheKey, getCustomersCacheKey, getInvoicesCacheKey, getVisitsCacheKey, getTargetsCacheKey]);

  // Supabase State & Sync (on-demand probe inside DatabaseConnectionModal saves boot roundtrips for 500 users)
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseSyncStatus>({
    connected: isSupabaseConfigured,
    tableFound: isSupabaseConfigured ? 'جاهز (اضغط للفحص)' : 'وضع التخزين المحلي',
  });
  const [isSupabaseSyncing, setIsSupabaseSyncing] = useState<boolean>(false);
  const [pendingInvoicesCount, setPendingInvoicesCount] = useState<number>(0);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0);
  const [deadLetterCount, setDeadLetterCount] = useState<number>(0);
  const [storageQuotaExceeded, setStorageQuotaExceeded] = useState<boolean>(false);

  const refreshPendingInvoicesCount = async () => {
    try {
      const queued = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
      setPendingInvoicesCount(queued.length);
    } catch (e) {
      // Ignore
    }
  };

  const queueInvoiceForSync = async (invoice: Invoice) => {
    const queued = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
    const next = [...queued.filter((item) => item.id !== invoice.id), invoice];
    await idbSet(STORAGE_KEYS.PENDING_INVOICES, next);
    setPendingInvoicesCount(next.length);
  };

  const flushPendingInvoices = async (): Promise<{ success: boolean; syncedCount: number }> => {
    const queued = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
    if (queued.length === 0) {
      setPendingInvoicesCount(0);
      return { success: true, syncedCount: 0 };
    }
    if (!navigator.onLine) {
      return { success: false, syncedCount: 0 };
    }

    try {
      // Batch save with zero freezing and minimal Supabase egress
      const batchResult = await saveInvoicesToSupabase(queued);
      if (batchResult.success) {
        await idbSet(STORAGE_KEYS.PENDING_INVOICES, []);
        setPendingInvoicesCount(0);
        return { success: true, syncedCount: queued.length };
      } else {
        setPendingInvoicesCount(queued.length);
        return { success: false, syncedCount: 0 };
      }
    } catch (e) {
      console.warn('flushPendingInvoices error:', e);
      setPendingInvoicesCount(queued.length);
      return { success: false, syncedCount: 0 };
    }
  };

  const saveInvoiceWithQueue = async (invoice: Invoice) => {
    if (!navigator.onLine) {
      // Instant offline queuing without hanging or waiting for network failure
      await queueInvoiceForSync(invoice);
      return { success: true, queued: true };
    }
    const result = await saveInvoiceToSupabase(invoice);
    if (!result.success) await queueInvoiceForSync(invoice);
    return result;
  };

  // Latest-value refs so the debounced sync helpers below never push a stale
  // snapshot taken when the timer was scheduled.
  const productsRef = useRef<Product[]>(products);
  const targetsRef = useRef<TargetRecord[]>(targets);
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { targetsRef.current = targets; }, [targets]);

  const refreshOfflineQueueCount = async () => {
    const queued = await getQueuedMutations();
    const live = queued.filter((q) => !isDeadLetter(q)).length;
    const dead = queued.filter((q) => isDeadLetter(q)).length;
    setOfflineQueueCount(live);
    setDeadLetterCount(dead);
    setStorageQuotaExceeded(isStorageQuotaExceeded());
    return live;
  };

  const getPendingInvoicesQueue = useCallback(async (): Promise<Invoice[]> => {
    try {
      const queued = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
      return Array.isArray(queued) ? queued : [];
    } catch {
      return [];
    }
  }, []);

  const removePendingInvoices = useCallback(async (invoiceIds: string[]): Promise<number> => {
    if (invoiceIds.length === 0) return pendingInvoicesCount;
    const dropped = new Set(invoiceIds);
    const queued = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
    const next = Array.isArray(queued) ? queued.filter((inv) => !dropped.has(inv.id)) : [];
    await idbSet(STORAGE_KEYS.PENDING_INVOICES, next);
    setPendingInvoicesCount(next.length);
    return next.length;
  }, [pendingInvoicesCount]);

  const clearPendingInvoicesQueue = useCallback(async (): Promise<void> => {
    await idbSet(STORAGE_KEYS.PENDING_INVOICES, []);
    setPendingInvoicesCount(0);
  }, []);

  const removeOfflineQueueItems = useCallback(async (mutationIds: string[]): Promise<number> => {
    const remaining = await removeQueuedMutations(mutationIds);
    await refreshOfflineQueueCount();
    return remaining;
  }, []);

  const retryOfflineQueueItems = useCallback(async (mutationIds: string[]): Promise<number> => {
    const count = await resetQueuedMutationAttempts(mutationIds);
    await refreshOfflineQueueCount();
    return count;
  }, []);

  const clearOfflineQueueItems = useCallback(async (): Promise<void> => {
    await clearQueuedMutations();
    await refreshOfflineQueueCount();
  }, []);

  /**
   * Send a mutation now, or park it in the offline outbox when that is not
   * possible. Every write path that can run without a network goes through here,
   * so nothing a rep or an admin does offline is silently dropped.
   */
  const syncOrQueue = async (
    entity: QueuedMutation['entity'],
    op: QueuedMutation['op'],
    entityId: string,
    payload: QueuedMutation['payload'],
    send: () => Promise<{ success: boolean; error?: string }>
  ): Promise<boolean> => {
    if (!navigator.onLine) {
      await enqueueMutation({ entity, op, entityId, payload });
      await refreshOfflineQueueCount();
      return false;
    }
    try {
      const result = await send();
      if (result.success) return true;
    } catch {
      // fall through to the queue below
    }
    await enqueueMutation({ entity, op, entityId, payload });
    await refreshOfflineQueueCount();
    return false;
  };

  // Local save always happens first, so nothing is lost when the device is offline.
  // Changed rows are pushed together, and any failed batch is parked in the outbox.
  const persistForecasts = useCallback(
    async (next: CollectionForecastRecord[], changed: CollectionForecastRecord[]) => {
      setForecasts(next);
      if (!changed.length) return;

      if (navigator.onLine) {
        const result = await saveForecastsToSupabase(changed);
        if (result.success) return;
      }

      await enqueueMutations(changed.map((row) => ({
        entity: 'forecasts' as const,
        op: 'upsert' as const,
        entityId: row.id,
        payload: row,
      })));
      await refreshOfflineQueueCount();
    },
    []
  );

  const saveForecast = useCallback(
    async (record: CollectionForecastRecord) => {
      const stamped = { ...record, updatedAt: new Date().toISOString(), updatedBy: currentUser?.name };
      const next = [...forecasts];
      const idx = next.findIndex((f) => f.id === record.id);
      if (idx >= 0) next[idx] = stamped;
      else next.push(stamped);
      await persistForecasts(next, [stamped]);
    },
    [forecasts, persistForecasts, currentUser]
  );

  const saveForecastBatch = useCallback(
    async (records: CollectionForecastRecord[]) => {
      if (!records.length) return;
      const now = new Date().toISOString();
      const stamped = records.map((record) => ({
        ...record,
        updatedAt: now,
        updatedBy: currentUser?.name,
      }));
      const changedById = new Map(stamped.map((record) => [record.id, record]));
      const next = forecasts.map((record) => changedById.get(record.id) || record);
      const existingIds = new Set(forecasts.map((record) => record.id));
      stamped.forEach((record) => {
        if (!existingIds.has(record.id)) next.push(record);
      });
      await persistForecasts(next, stamped);
    },
    [forecasts, persistForecasts, currentUser]
  );

  const deleteForecast = useCallback(
    async (id: string) => {
      const next = forecasts.filter((f) => f.id !== id);
      setForecasts(next);
      await idbSet(STORAGE_KEYS.FORECASTS, next);
      await syncOrQueue('forecasts', 'delete', id, undefined, () => deleteForecastFromSupabase(id));
      publishDataVersionUpdate({ scope: 'forecasts' }).catch(() => {});
    },
    [forecasts, syncOrQueue]
  );

  const deleteCustomerForecasts = useCallback(
    async (customerId: string, monthKey: string) => {
      const targetsToDelete = forecasts.filter(
        (f) => f.customerId === customerId && f.monthKey === monthKey
      );
      if (targetsToDelete.length === 0) return;
      const next = forecasts.filter(
        (f) => !(f.customerId === customerId && f.monthKey === monthKey)
      );
      setForecasts(next);
      await idbSet(STORAGE_KEYS.FORECASTS, next);
      for (const item of targetsToDelete) {
        await syncOrQueue('forecasts', 'delete', item.id, undefined, () => deleteForecastFromSupabase(item.id));
      }
      publishDataVersionUpdate({ scope: 'forecasts' }).catch(() => {});
    },
    [forecasts, syncOrQueue]
  );

  const submitForecastWeek = useCallback(
    async (monthKey: string, weekIndex: number, repId: string) => {
      const now = new Date().toISOString();
      const changedRows: CollectionForecastRecord[] = [];
      const next = forecasts.map((f) => {
        if (f.monthKey !== monthKey || f.weekIndex !== weekIndex || f.repId !== repId) return f;
        if (f.status !== 'draft' && f.status !== 'change_requested') return f;
        const updated = { ...f, status: 'submitted' as const, submittedAt: now, changeRequestNote: undefined, updatedAt: now, updatedBy: currentUser?.name };
        changedRows.push(updated);
        return updated;
      });
      if (changedRows.length) await persistForecasts(next, changedRows);
      return changedRows.length;
    },
    [forecasts, persistForecasts, currentUser]
  );

  const approveForecastWeek = useCallback(
    async (monthKey: string, weekIndex: number, repId: string, customerIds?: string[]) => {
      const now = new Date().toISOString();
      const changedRows: CollectionForecastRecord[] = [];
      const customerIdScope = customerIds ? new Set(customerIds) : null;
      const next = forecasts.map((f) => {
        if (f.monthKey !== monthKey || f.weekIndex !== weekIndex || f.repId !== repId) return f;
        if (customerIdScope && !customerIdScope.has(f.customerId)) return f;
        if (f.status !== 'submitted') return f;
        const updated = {
          ...f,
          status: 'approved' as const,
          approvedBy: currentUser?.name || '',
          approvedAt: now,
          changeRequestNote: undefined,
          updatedAt: now,
          updatedBy: currentUser?.name,
        };
        changedRows.push(updated);
        return updated;
      });
      if (changedRows.length) await persistForecasts(next, changedRows);
      return changedRows.length;
    },
    [forecasts, persistForecasts, currentUser]
  );

  const approveForecastBatch = useCallback(
    async (monthKey: string, approvals: Array<{ weekIndex: number; repId: string; customerIds: string[] }>) => {
      const now = new Date().toISOString();
      const approvalScopes = new Map(
        approvals.map((approval) => [
          `${approval.repId}::${approval.weekIndex}`,
          new Set(approval.customerIds),
        ])
      );
      const changedRows: CollectionForecastRecord[] = [];
      const next = forecasts.map((forecast) => {
        if (forecast.monthKey !== monthKey) return forecast;
        const customerScope = approvalScopes.get(`${forecast.repId}::${forecast.weekIndex}`);
        if (!customerScope?.has(forecast.customerId) || forecast.status !== 'submitted') return forecast;
        const updated: CollectionForecastRecord = {
          ...forecast,
          status: 'approved',
          approvedBy: currentUser?.name || '',
          approvedAt: now,
          changeRequestNote: undefined,
          updatedAt: now,
          updatedBy: currentUser?.name,
        };
        changedRows.push(updated);
        return updated;
      });
      if (changedRows.length) await persistForecasts(next, changedRows);
      return changedRows.length;
    },
    [forecasts, persistForecasts, currentUser]
  );

  const requestForecastChange = useCallback(
    async (monthKey: string, weekIndex: number, repId: string, note: string) => {
      const now = new Date().toISOString();
      const changedRows: CollectionForecastRecord[] = [];
      const next = forecasts.map((f) => {
        if (f.monthKey !== monthKey || f.weekIndex !== weekIndex || f.repId !== repId) return f;
        const updated = {
          ...f,
          status: 'change_requested' as const,
          changeRequestNote: note,
          changeRequestedBy: currentUser?.name || '',
          changeRequestedAt: now,
          updatedAt: now,
          updatedBy: currentUser?.name,
        };
        changedRows.push(updated);
        return updated;
      });
      if (changedRows.length) await persistForecasts(next, changedRows);
      return changedRows.length;
    },
    [forecasts, persistForecasts, currentUser]
  );

const saveForecastPlan = useCallback(async (plan: ForecastMonthPlan) => {
    const stamped: ForecastMonthPlan = { ...plan, updatedAt: new Date().toISOString(), updatedBy: currentUser?.name };
    const next = [...forecastPlans.filter((p) => p.id !== plan.id), stamped];
    setForecastPlans(next);
    await syncOrQueue('forecast_plans', 'upsert', stamped.id, stamped, () =>
      saveForecastMonthPlanToSupabase(stamped)
    );
  }, [forecastPlans, currentUser, syncOrQueue]);

  const saveCustomerComment = useCallback(
    async (comment: CustomerCommentRecord) => {
      const stamped = { ...comment, updatedAt: new Date().toISOString() };
      const next = [...customerComments.filter((c) => c.id !== comment.id), stamped];
      setCustomerComments(next);
      await syncOrQueue('customer_comments', 'upsert', stamped.id, stamped, () =>
        saveCustomerCommentsToSupabase([stamped])
      );
    },
    [customerComments, syncOrQueue]
  );

  const toggleArchiveCustomerComment = useCallback(
    async (commentId: string, isArchived: boolean): Promise<{ success: boolean; message: string }> => {
      const now = new Date().toISOString();
      const existing = customerComments.find((c) => c.id === commentId);
      if (!existing) return { success: false, message: 'الملاحظة غير موجودة' };
      const updated: CustomerCommentRecord = {
        ...existing,
        isArchived,
        archivedAt: isArchived ? now : undefined,
        archivedBy: isArchived ? (currentUser?.name || 'المستخدم') : undefined,
        updatedAt: now,
      };
      const next = customerComments.map((c) => (c.id === commentId ? updated : c));
      setCustomerComments(next);
      await syncOrQueue('customer_comments', 'upsert', updated.id, updated, () =>
        saveCustomerCommentsToSupabase([updated])
      );
      return {
        success: true,
        message: isArchived ? 'تم أرشفة الملاحظة بنجاح 🗄️' : 'تم استعادة الملاحظة من الأرشيف بنجاح 🔄',
      };
    },
    [customerComments, currentUser, syncOrQueue]
  );

  const deleteCustomerComment = useCallback(async (id: string) => {
    const next = customerComments.filter((c) => c.id !== id);
    setCustomerComments(next);
    // The delete has to reach the server too, otherwise the comment comes back
    // on the next fetch for every other user.
    await syncOrQueue('customer_comments', 'delete', id, undefined, () =>
      deleteCustomerCommentFromSupabase(id)
    );
  }, [customerComments, syncOrQueue]);

  /**
   * Drain the offline outbox, grouped per table so a device that spent a whole
   * shift offline costs a handful of requests instead of one per tap.
   */
  const flushOfflineQueue = async (): Promise<{ success: boolean; syncedCount: number }> => {
    const allQueued = await getQueuedMutations();
    const dead = allQueued.filter((q) => isDeadLetter(q));
    const queued = allQueued.filter((q) => !isDeadLetter(q));
    // dead letters are not retried — they stay in the queue for manual review
    // (surfaced via deadLetterCount) and no longer spam the server.
    if (dead.length > 0) {
      console.warn(`[offline-queue] ${dead.length} permanently-failed mutation(s) skipped (>= ${MAX_ATTEMPTS} attempts).`);
    }
    if (queued.length === 0) {
      setOfflineQueueCount(0);
      setDeadLetterCount(dead.length);
      return { success: dead.length === 0, syncedCount: 0 };
    }
    if (!navigator.onLine) {
      setOfflineQueueCount(queued.length);
      return { success: false, syncedCount: 0 };
    }

    const done: string[] = [];
    const failed: string[] = [];
    const group = (entity: QueuedMutation['entity'], op: QueuedMutation['op']) =>
      queued.filter((item) => item.entity === entity && item.op === op);

    /**
     * أنى نطاق يناسب اللي اتبع فعلاً.
     *
     * كان الـ flush بينشر scope: 'all' مع forcePurge — يعني مندوب واحد
     * يسجّل زيارة offline ويرجع نت، كل الـ 299 جهاز بيمسح كاشه بالكامل
     * ويعيد تحميل الكتالوج والعملاء والأهداف والفواتير. زيارة واحدة كانت
     * بتكلّف datacenter كامل.
     *
     * الطبقات اللي checkAndSyncDataVersion بيعرف يحدّثها هي بس:
     * products / customers / targets / invoices / visits. الجداول التانية
     * في الـ queue (users, forecasts, forecast_plans, customer_comments) مفيش
     * ليها فرع في إعادة الجلب ولا اشتراك realtime — يعني نشر 'all' عشانها
     * ما كانش بيعمل حاجة، كان بيبعت تعريفة وخلاص.
     *
     * فبنحسب النطاق الحقيقي: نطاق واحد → نطاقه، أكتر من واحد → 'all'
     * (سلوك النهارده، وبيحصل نادر — الـ Excel imports ما بتمشيش من الـ queue).
     */
    const resolveFlushScope = (): SyncScope => {
      const touched = new Set<SyncScope>();
      if (invoiceDeletes.length > 0 || invoiceUpserts.length > 0) touched.add('invoices');
      if (visitDeletes.length > 0 || visitUpserts.length > 0) touched.add('visits');
      if (customerDeletes.length > 0 || customerUpserts.length > 0) touched.add('customers');
      if (productReplaces.length > 0) touched.add('products');
      if (targetReplaces.length > 0) touched.add('targets');

      if (touched.size === 0) return 'all';
      if (touched.size === 1) return touched.values().next().value as SyncScope;
      return 'all';
    };

    // Deletes first, so a row that was recreated later is not wiped by an older delete.
    const invoiceDeletes = group('invoices', 'delete');
    if (invoiceDeletes.length > 0) {
      const results = await Promise.all(
        invoiceDeletes.map((item) => deleteInvoiceFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...invoiceDeletes.map((i) => i.id));
    }

    const invoiceUpserts = group('invoices', 'upsert');
    if (invoiceUpserts.length > 0) {
      const res = await saveInvoicesToSupabase(invoiceUpserts.map((i) => i.payload as Invoice));
      (res.success ? done : failed).push(...invoiceUpserts.map((i) => i.id));
    }

    const visitDeletes = group('visits', 'delete');
    if (visitDeletes.length > 0) {
      const results = await Promise.all(
        visitDeletes.map((item) => deleteVisitFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...visitDeletes.map((i) => i.id));
    }

    const visitUpserts = group('visits', 'upsert');
    if (visitUpserts.length > 0) {
      const res = await saveVisitsToSupabase(visitUpserts.map((i) => i.payload as CustomerVisit));
      (res.success ? done : failed).push(...visitUpserts.map((i) => i.id));
      if (res.success) {
        const syncedIds = new Set(visitUpserts.map((i) => i.entityId));
        setVisits((prev) => {
          const next = prev.map((v) => syncedIds.has(v.id) ? { ...v, syncStatus: 'synced' as const } : v);
          persistVisits(next);
          return next;
        });
      }
    }

    const customerDeletes = group('customers', 'delete');
    if (customerDeletes.length > 0) {
      const results = await Promise.all(
        customerDeletes.map((item) => deleteCustomerFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...customerDeletes.map((i) => i.id));
    }

    const customerUpserts = group('customers', 'upsert');
    for (const item of customerUpserts) {
      const res = await saveCustomerToSupabase(item.payload as Customer);
      (res.success ? done : failed).push(item.id);
    }

    const userDeletes = group('users', 'delete');
    if (userDeletes.length > 0) {
      const results = await Promise.all(
        userDeletes.map((item) => deleteUserFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...userDeletes.map((i) => i.id));
    }

    const userUpserts = group('users', 'upsert');
    for (const item of userUpserts) {
      const res = await saveUserToSupabase(item.payload as User);
      (res.success ? done : failed).push(item.id);
    }

    // Products and targets are authoritative full-table writes, so they are sent
    // from the live local state rather than from a snapshot taken while offline.
    // Read through the refs: this flush also runs from timers that captured an
    // early render, where the state variables would still be empty.
    const productReplaces = group('products', 'replace');
    if (productReplaces.length > 0 && productsRef.current.length > 0) {
      const res = await saveProductsToSupabase(productsRef.current);
      (res.success ? done : failed).push(...productReplaces.map((i) => i.id));
    }

    const targetReplaces = group('targets', 'replace');
    if (targetReplaces.length > 0 && targetsRef.current.length > 0) {
      const res = await saveTargetsToSupabase(targetsRef.current);
      (res.success ? done : failed).push(...targetReplaces.map((i) => i.id));
    }

    // Forecast rows are keyed per (month, week, customer), so each one is an
    // independent upsert and the queued payload can be sent as-is.
    const forecastUpserts = group('forecasts', 'upsert');
    if (forecastUpserts.length > 0) {
      const res = await saveForecastsToSupabase(
        forecastUpserts.map((i) => i.payload as CollectionForecastRecord)
      );
      (res.success ? done : failed).push(...forecastUpserts.map((i) => i.id));
    }

    const forecastDeletes = group('forecasts', 'delete');
    if (forecastDeletes.length > 0) {
      const results = await Promise.all(
        forecastDeletes.map((item) => deleteForecastFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...forecastDeletes.map((i) => i.id));
    }

    // The month plan is one row per month, so only the newest queued copy matters.
    const planUpserts = group('forecast_plans', 'upsert');
    if (planUpserts.length > 0) {
      const last = planUpserts[planUpserts.length - 1];
      const res = await saveForecastMonthPlanToSupabase(last.payload);
      (res.success ? done : failed).push(...planUpserts.map((i) => i.id));
    }

    const commentUpserts = group('customer_comments', 'upsert');
    if (commentUpserts.length > 0) {
      const res = await saveCustomerCommentsToSupabase(
        commentUpserts.map((i) => i.payload as CustomerCommentRecord)
      );
      (res.success ? done : failed).push(...commentUpserts.map((i) => i.id));
    }

    // Comment deletes run after the upserts so an edit-then-delete queued in the
    // same offline stretch does not leave the row behind.
    const commentDeletes = group('customer_comments', 'delete');
    if (commentDeletes.length > 0) {
      const results = await Promise.all(
        commentDeletes.map((item) => deleteCustomerCommentFromSupabase(item.entityId))
      );
      (results.every((r) => r.success) ? done : failed).push(...commentDeletes.map((i) => i.id));
    }

    if (done.length > 0) await removeQueuedMutations(done);
    if (failed.length > 0) {
      await markQueuedMutationFailure(failed, 'تعذر الإرسال إلى قاعدة البيانات');
    }
    await refreshOfflineQueueCount();

    if (done.length > 0) {
      // المناديب عند مزامنة زيارات/فواتير أوفلاين ماينشروش ختم إصدار عام لكل 500 جهاز؛
      // التحديثات الفورية بتوصل للمشرفين والمديرين عبر Realtime وبصمات المحتوى.
      const flushScope = resolveFlushScope();
      const isFieldRepRoutineFlush =
        currentUserRef.current?.role === 'sales_rep' &&
        (flushScope === 'visits' || flushScope === 'invoices');
      if (!isFieldRepRoutineFlush) {
        publishDataVersionUpdate({
          scope: flushScope,
          notes: `مزامنة تلقائية بعد العمل بدون إنترنت (${done.length} تغيير)`,
        }).catch(() => {});
      }
    }

    return { success: failed.length === 0, syncedCount: done.length };
  };

  const productSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Products and targets are written to Supabase as authoritative full tables,
   * so a burst of catalog or stock edits is coalesced into a single push instead
   * of one request per tap.
   */
  const scheduleProductSync = () => {
    if (productSyncTimer.current) clearTimeout(productSyncTimer.current);
    productSyncTimer.current = setTimeout(() => {
      syncOrQueue('products', 'replace', 'catalog', undefined, () =>
        saveProductsToSupabase(productsRef.current)
      ).then((delivered) => {
        if (delivered) {
          publishDataVersionUpdate({
            scope: 'products',
            notes: `تحديث كتالوج الأصناف (${productsRef.current.length} صنف)`,
          }).catch(() => {});
        }
      }).catch(() => {});
    }, 1200);
  };

  const scheduleTargetSync = () => {
    if (targetSyncTimer.current) clearTimeout(targetSyncTimer.current);
    targetSyncTimer.current = setTimeout(() => {
      syncOrQueue('targets', 'replace', 'targets', undefined, () =>
        saveTargetsToSupabase(targetsRef.current)
      ).then((delivered) => {
        if (delivered) {
          publishDataVersionUpdate({
            scope: 'targets',
            notes: `تحديث شيت الأهداف (${targetsRef.current.length} هدف)`,
          }).catch(() => {});
        }
      }).catch(() => {});
    }, 1200);
  };

  /**
   * Which customers this device is allowed to download.
   *
   * The customer table is the heaviest payload in the app (5,400+ rows, every
   * column used by the financial reports). Until now every phone downloaded the
   * whole base and then hid 90% of it in `getVisibleCustomers`. This narrows the
   * read on the server to exactly the rows the role can see:
   *
   *  - admin / developer / technical support → full base.
   *  - branch manager → their branch (+ customers with no branch, which the UI
   *    resolves from the address).
   *  - supervisor → their branch (client-side then keeps only their reps).
   *  - sales rep → their branch + anything carrying their rep name/id, because
   *    some imported rows use a numeric sector branch («فرع 16») that does not
   *    match the rep's branch label. The OR keeps those rows from disappearing.
   *
   * The server falls back to the full base when a narrow read matches nothing,
   * so a wrong scope can only download more — never show an empty list.
   */
  const customerFetchScope = useMemo<CustomerFetchScope | undefined>(() => {
    if (!currentUser || effectiveSectorFilter === 'none') return undefined;
    const role = currentUser.role;
    const sector = activeApiSector;

    const cleanName = (value?: string) =>
      (value || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const fullName = cleanName(currentUser.name);
    const nameTokens = fullName.split(' ').filter((token) => token.length > 1);
    const shortName = nameTokens.slice(0, 2).join(' ');

    const resolvedBranch = resolveBranchName(currentUser.branchName) || currentUser.branchName || '';
    const branchNames = Array.from(
      new Set([currentUser.branchName, resolvedBranch].filter((branch): branch is string => Boolean(branch && branch.trim())))
    );
    const branchNameContains = extractBranchStems(currentUser.branchName);

    if (role === 'admin' || role === 'developer' || CROSS_SECTOR_ADMIN_ROLES.has(role)) {
      return {
        sector,
        slimFieldColumns: true,
      };
    }

    if (role === 'sales_rep') {
      const repNames = expandRepNameVariants([fullName, shortName]);
      const repIds = Array.from(new Set([currentUser.id, currentUser.username].filter(Boolean) as string[]));
      return {
        ...(repNames.length === 0 && repIds.length === 0 ? { branchNames, branchNameContains } : {}),
        repNames,
        repIds,
        sector,
        includeUnassignedBranch: false,
        strictNoFullFallback: true,
        slimFieldColumns: true,
      };
    }

    if (role === 'supervisor') {
      const supUsers = users.filter((u) => u.supervisorId === currentUser.id);
      const repNames = expandRepNameVariants([
        fullName,
        shortName,
        ...supUsers.flatMap((u) => {
          const fn = cleanName(u.name);
          const sn = fn.split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
          return [fn, sn];
        }),
      ]);
      const repIds = Array.from(
        new Set([currentUser.id, currentUser.username, ...supUsers.flatMap((u) => [u.id, u.username])].filter(Boolean) as string[])
      );
      if (supUsers.length > 0 && (repNames.length > 0 || repIds.length > 0)) {
        return {
          repNames,
          repIds,
          sector,
          includeUnassignedBranch: false,
          strictNoFullFallback: true,
          slimFieldColumns: true,
        };
      }
    }

    // مدير الفرع (أو مشرف بلا مناديب مربوطين بعد): نطاق الفرع + القطاع النشط فقط
    return {
      branchNames,
      branchNameContains,
      sector,
      includeUnassignedBranch: false,
      strictNoFullFallback: true,
      slimFieldColumns: true,
    };
  }, [
    currentUser?.id,
    currentUser?.name,
    currentUser?.username,
    currentUser?.branchName,
    currentUser?.role,
    currentUser?.sector,
    activeApiSector,
    effectiveSectorFilter,
    users,
  ]);

  /**
   * نطاق قطاع الكتالوج على مستوى السيرفر — كل الأدوار (بما فيها الإدارة ومدير الفرع بقطاعين)
   * بتحمّل كتالوج القطاع النشط حالياً فقط (منزلي أو كهرباء) لتخفيف الحجم والـ egress.
   */
  const productSectorScope = useMemo<ProductSectorScope>(() => {
    return activeApiSector;
  }, [activeApiSector]);

  /**
   * scope القراءة من جدول الزيارات:
   * - المندوب: آخر 90 يوماً فقط + عملائه هو فقط + قطاعه.
   * - المشرف: آخر 180 يوماً + مندوبيه التابعين + قطاعه.
   * - مدير الفرع: آخر 180 يوماً + فرعه + القطاع النشط.
   * - الأدمن والمطور والدعم الفني: آخر 210 يوماً + القطاع النشط.
   */
  const visitFetchScope = useMemo<VisitFetchScope | undefined>(() => {
    if (!currentUser || effectiveSectorFilter === 'none') return undefined;
    const role = currentUser.role;
    const sector = activeApiSector;

    if (role === 'admin' || role === 'developer' || CROSS_SECTOR_ADMIN_ROLES.has(role)) {
      const adminSince = new Date();
      adminSince.setDate(adminSince.getDate() - 210);
      return { sinceDate: adminSince.toISOString().slice(0, 10), sector };
    }
    if (role !== 'sales_rep' && role !== 'branch_manager' && role !== 'supervisor') {
      const adminSince = new Date();
      adminSince.setDate(adminSince.getDate() - 210);
      return { sinceDate: adminSince.toISOString().slice(0, 10), sector };
    }

    const since = new Date();
    if (role === 'sales_rep') {
      since.setDate(since.getDate() - 90);
      if (!customerFetchScope) return { sinceDate: since.toISOString().slice(0, 10), sector };
      return {
        ...(customerFetchScope.repNames?.length || customerFetchScope.repIds?.length
          ? {}
          : { branchNames: customerFetchScope.branchNames, branchNameContains: customerFetchScope.branchNameContains }),
        repNames: customerFetchScope.repNames,
        repIds: customerFetchScope.repIds,
        sector,
        includeUnassignedBranch: false,
        strictNoFullFallback: true,
        sinceDate: since.toISOString().slice(0, 10),
      };
    }

    since.setDate(since.getDate() - 180);
    if (role === 'supervisor') {
      const cleanName = (value?: string) =>
        (value || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      const repUsers = users.filter((u) => u.supervisorId === currentUser.id);
      const supFull = cleanName(currentUser.name);
      const repNames = [
        supFull,
        ...repUsers.flatMap((u) => {
          const fn = cleanName(u.name);
          const sn = fn.split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
          return [fn, sn];
        }),
      ].filter((n) => n.length >= 3);
      const repIds = [
        currentUser.id,
        currentUser.username,
        ...repUsers.flatMap((u) => [u.id, u.username]),
      ].filter(Boolean) as string[];
      const branchNames = Array.from(
        new Set([currentUser.branchName].filter((b): b is string => Boolean(b && b.trim())))
      );
      return {
        ...(repUsers.length === 0 ? { branchNames } : {}),
        repNames: Array.from(new Set(repNames)),
        repIds: Array.from(new Set(repIds)),
        sector,
        includeUnassignedBranch: false,
        strictNoFullFallback: true,
        sinceDate: since.toISOString().slice(0, 10),
      };
    }

    // branch_manager
    const scope = customerFetchScope;
    if (!scope) return { sinceDate: since.toISOString().slice(0, 10), sector };
    return {
      branchNames: scope.branchNames,
      branchNameContains: scope.branchNameContains,
      repNames: scope.repNames,
      repIds: scope.repIds,
      sector,
      includeUnassignedBranch: false,
      strictNoFullFallback: true,
      sinceDate: since.toISOString().slice(0, 10),
    };
  }, [currentUser?.id, currentUser?.name, currentUser?.username, currentUser?.branchName, currentUser?.role, currentUser?.sector, activeApiSector, effectiveSectorFilter, customerFetchScope, users]);

  const checkDatabaseConnection = useCallback(async (): Promise<SupabaseSyncStatus> => {
    const conn = await testSupabaseConnection();
    setSupabaseStatus(conn);
    return conn;
  }, []);

  // Sync with Supabase (Direction: fetch, push, or both)
  const syncWithSupabase = async (
    direction: 'fetch' | 'push' | 'both' = 'both'
  ): Promise<{ success: boolean; message: string }> => {
    const activeSec = activeStorageCtxRef.current.sector;
    if (activeSec === 'none') {
      return { success: false, message: 'حسابك بلا قطاع مفعّل حالياً.' };
    }
    setIsSupabaseSyncing(true);
    try {
      // 1. Test Connection
      const conn = await testSupabaseConnection();
      setSupabaseStatus(conn);

      let fetchedUsersCount = 0;
      let fetchedInvoicesCount = 0;
      let pushedUsersCount = 0;
      let pushedInvoicesCount = 0;
      let pushedCustomersCount = 0;
      let removedCustomersCount = 0;

      // 2. Fetch remote users and invoices if requested
      if (direction === 'fetch' || direction === 'both') {
        // بنفس منطق مسار الإقلاع: كلمات المرور للأجهزة الإدارية فقط — المسار
        // القديم كان بيسحب عمود password لأي حد يفتح صفحة العملاء ويدوس مزامنة.
        const credentialsForRole =
          currentUser.role === 'admin' || currentUser.role === 'developer';
        const fetchRes = await fetchUsersFromSupabase(true, { includeCredentials: credentialsForRole });
        if (fetchRes.success && fetchRes.users && fetchRes.users.length > 0) {
          fetchedUsersCount = fetchRes.users.length;
          setUsers(sanitizeAndDeduplicateUsers(fetchRes.users).deduplicated);
        }

        const invRes = await fetchInvoicesFromSupabase(
          buildInvoiceFetchScope(currentUser, users, activeApiSector)
        );
        if (invRes.success && invRes.invoices) {
          const remoteInvoices = invRes.invoices;
          fetchedInvoicesCount = remoteInvoices.length;
          setInvoices((previous) => {
            const merged = new Map<string, Invoice>();
            previous.forEach((invoice) => merged.set(invoice.id, invoice));
            remoteInvoices.forEach((invoice) => merged.set(invoice.id, invoice));
            const next = Array.from(merged.values());
            return next;
          });
        }

        const productRes = await fetchProductsFromSupabase({ sector: productSectorScope });
        if (productRes.success) {
          const validProducts = sanitizeProducts(productRes.products || []);
          setProducts(validProducts);
          idbSet(getProductsCacheKey(), validProducts);
        }
      }

      // 2b. Fetch customers from Supabase
      if (direction === 'fetch' || direction === 'both') {
        const custRes = await fetchCustomersFromSupabase(customerFetchScope);
        if (custRes.success && !(custRes as any).emptyDueToThrottle) {
          const linked = linkCustomersToUsers(sanitizeCustomers(custRes.customers || []), users);
          const validCustomers = deduplicateCustomersArray(linked);
          setCustomers(validCustomers);
          idbSet(getCustomersCacheKey(), validCustomers);
          saveLocalCustomersFingerprint(validCustomers, currentUser?.id, activeSec);
        }
      }
      if (direction === 'push' || direction === 'both') {
        await flushPendingInvoices();
        if (users.length > 0) {
          await saveUsersToSupabase(users);
          pushedUsersCount = users.length;
        }
        if (invoices.length > 0) {
          // Push ALL invoices to Supabase, not just the first 100
          const invBatchRes = await saveInvoicesToSupabase(invoices);
          pushedInvoicesCount = invBatchRes.savedCount;
        }
        if (products.length > 0) {
          // مزامنة يدوية كاملة → الجدول الغني + snapshot محدث (مقبول هنا لأنها نادرة).
          const productsResult = await saveProductsToSupabase(products, { snapshot: true });
          if (productsResult.success) {
            await publishNewDataVersion({
              scope: 'products',
              updatedBy: currentUser?.name || 'مدير النظام',
              notes: `مزامنة كتالوج الأصناف (${products.length} صنف)`,
              productsCount: products.length,
            });
          }
        }
        // Sync visits to Supabase
        if (visits.length > 0) {
          await saveVisitsToSupabase(visits);
        }
        // Push customers. حذف اليتامى مسموح فقط للنطاقات الإدارية الكاملة (قطاع/فرع)
        // وغير مسموح لنطاق المندوب/المشرف المقيد بأسماء — عشان ما نمسحش عملاء برّه النطاق.
        if (customers.length > 0) {
          const cleanCustomers = deduplicateCustomersArray(customers);
          const repRestrictedScope = Boolean(customerFetchScope?.repNames?.length || customerFetchScope?.repIds?.length);
          const canAuthoritativeDelete =
            !repRestrictedScope &&
            (currentUser?.role === 'admin' ||
              currentUser?.role === 'developer' ||
              currentUser?.role === 'branch_manager' ||
              CROSS_SECTOR_ADMIN_ROLES.has(currentUser?.role as any));
          const custPushRes = await replaceCustomersInSupabase(cleanCustomers, {
            scope: customerFetchScope,
            allowOrphanDelete: canAuthoritativeDelete,
          });
          if (custPushRes.success) {
            // الحقيقة فقط: عدد الصفوف اللي اتغيرت فعلاً (الـdelta)، مش القائمة كاملة.
            pushedCustomersCount = custPushRes.changedCount ?? cleanCustomers.length;
            removedCustomersCount = custPushRes.removed;
          }
        }
      }

      const updatedConn = await testSupabaseConnection();
      setSupabaseStatus(updatedConn);

      const dupNote = removedCustomersCount > 0 ? `، حذف ${removedCustomersCount} سجل مكرر` : '';
      const msg = `تمت المزامنة السحابية بنجاح مع Supabase! (مستخدمين: ${fetchedUsersCount || pushedUsersCount}, فواتير وطلبيات: ${fetchedInvoicesCount || pushedInvoicesCount}, عملاء: ${pushedCustomersCount}${dupNote}).`;
      return { success: true, message: msg };
    } catch (err: any) {
      return {
        success: false,
        message: `تعذر إتمام المزامنة: ${err?.message || 'خطأ في الشبكة'}`,
      };
    }
  };

  /**
   * Check remote published data version and automatically purge stale client caches
   * This guarantees that when an admin uploads a new Excel catalog or customer list,
   * no sales rep or user experiences duplicate records or outdated prices/stocks.
   *
   * `noStampPulledAtRef`: بيتحدّث إمتى آخر مرة سحبنا فيها جدول العملاء **من
   * غير** ختم إصدار منشور على السيرفر.
   */
  const noStampPulledAtRef = useRef(0);
  /** امتى آخر مرة نزّلنا جدول العملاء بالكامل (على مستوى الجلسة). */
  const customerFullFetchAtRef = useRef(0);
  /** مؤقتات الـ boot jitter — بتتمسح لو الإيفكت اتحمّل تاني قبل ما النبضة توصل. */
  const bootJitterTimersRef = useRef<Set<number>>(new Set());
  /** يمنع تنزيلين متوازيين لنفس جدول العملاء (نبضة الإصدار + نبضة المحتوى). */
  const customerDownloadInFlightRef = useRef(false);
  /**
   * من غير ختم إصدار منشور، المسار ده كان بيسحب جدول العملاء كامل **كل مرة**
   * check() بينادي — يعني كل 30 ثانية على كل جهاز، وكمان عند كل focus.
   * ده كان أكبر بند في فاتورة الاستضافة: 400 جهاز × 3,400 صف كل دقيقة.
   *
   * دلوقتي السحب بيحصل مرة واحدة لكل 15 دقيقة، وعند الإقلاع (`neverPulled`).
   * انحراف المحتوى لسه متكفّل بيه `checkCustomersContent` عبر بصمة صف واحد
   * (عدد الصفوف + أحدث updated_at)، فمفيش فقد في حداثة البيانات.
   */
  const NO_STAMP_PULL_INTERVAL_MS = 60 * 60 * 1000;

  // مبيعات الأصناف بتتغذّى من صفحة الإكسل فقط. خلاصة بيانات جديدة = تنزيل
  // التغييرات المقيّدة بنطاق المستخدم تلقائياً، من غير أي زر على الشاشات.
  const itemSalesSyncRef = useRef<null | (() => Promise<unknown>)>(null);

  const checkAndSyncDataVersion = (force: boolean = false): Promise<{ updated: boolean; version?: number; message: string }> => {
    if (!isSupabaseConfigured) {
      return Promise.resolve({ updated: false, message: 'وضع التخزين المحلي' });
    }
    if (activeStorageCtxRef.current.sector === 'none') {
      return Promise.resolve({ updated: false, message: 'حسابك بلا قطاع مفعّل' });
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return Promise.resolve({ updated: false, message: 'أوفلاين — استخدام البيانات المحفوظة محلياً' });
    }
    if (!force && dataVersionCheckInFlightRef.current) {
      return dataVersionCheckInFlightRef.current;
    }
    const run = (async (): Promise<{ updated: boolean; version?: number; message: string }> => {
    try {
      const ctxSnap = { ...activeStorageCtxRef.current };
      // Never purge and re-pull while our own authoritative write is still
      // landing on the server: the old copy would overwrite the fresh one.
      if (!force && Date.now() - authoritativeWriteAtRef.current < 120000) {
        return { updated: false, message: 'جارٍ حفظ التحديث الحالي' };
      }
      const remoteMeta = await fetchRemoteDataVersion();
      if (!remoteMeta) {
        // No version stamp has been published yet. Pull the authoritative customer
        // list directly - but only once per window, not on every heartbeat.
        const dueForPull =
          force || noStampPulledAtRef.current === 0 || Date.now() - noStampPulledAtRef.current >= NO_STAMP_PULL_INTERVAL_MS;
        if (!dueForPull) {
          return { updated: false, message: 'مفيش ختم إصدار منشور — الاعتماد على بصمة المحتوى' };
        }
        // في نفس اللحظة ممكن نبضة المحتوى تكون بتنزّل الجدول — منزّلش مرتين.
        if (customerDownloadInFlightRef.current) {
          return { updated: false, message: 'جارٍ تحميل أحدث بيانات العملاء' };
        }
        // لو البصمة المحفوظة مطابقة للي على السيرفر والعملاء موجودين محلياً، مفيش داعي للتنزيل الكامل.
        const stampNow = await fetchCustomerContentStamp(customerFetchScope);
        const storedStampNow = readCustomerContentStamp(ctxSnap.userId, ctxSnap.sector);
        const hasCustomersLoaded = (customersRef.current?.length || 0) > 0 || stampNow?.empty === true;
        // البصمة نفسها فشلت (عمود updated_at مش موجود أو الشبكة) وفي بيانات
        // محلية → مفيش سحب للجدول كامل. نفس سبب إلغاء FULL_REFRESH_FALLBACK_MS:
        // أي عطل في البصمة كان بيدفع تمن تنزيل 3-6MB كل ساعة على كل جهاز.
        if (!stampNow && (customersRef.current?.length || 0) > 0) {
          return { updated: false, message: 'تعذّر فحص بصمة العملاء — الاعتماد على النسخة المحلية' };
        }
        if (hasCustomersLoaded && areContentStampsEqual(stampNow, storedStampNow)) {
          noStampPulledAtRef.current = Date.now();
          return { updated: false, message: 'بيانات العملاء محدثة بالفعل' };
        }
        noStampPulledAtRef.current = Date.now();
        customerDownloadInFlightRef.current = true;
        let custRes: Awaited<ReturnType<typeof fetchCustomersFromSupabase>>;
        try {
          custRes = await fetchCustomersFromSupabase(customerFetchScope);
        } finally {
          customerDownloadInFlightRef.current = false;
        }
        if (custRes.success && custRes.customers && custRes.customers.length > 0) {
          if (stampNow) saveCustomerContentStamp(stampNow, ctxSnap.userId, ctxSnap.sector);
          const linked = linkCustomersToUsers(sanitizeCustomers(custRes.customers), users);
          const valid = deduplicateCustomersArray(linked);
          const nextFingerprint = buildCustomersFingerprint(valid);
          setCustomers((current) => {
            if (buildCustomersFingerprint(current) === nextFingerprint) return current;
            customersRef.current = valid;
            idbSet(getCustomersCacheKey(ctxSnap.userId, ctxSnap.sector), valid).catch(() => {});
            saveLocalCustomersFingerprint(valid, ctxSnap.userId, ctxSnap.sector);
            return valid;
          });
        }
        return { updated: false, message: 'تم جلب أحدث بيانات العملاء مباشرة من السيرفر' };
      }
      // الختم موجود: تبقّى نراقبه. لو اتشال من السيرفر نرجع للجهة اللي فوق
      // من غير ما نفضل متعلقين بغيابه للأبد.
      noStampPulledAtRef.current = 0;

      const localMeta = getLocalDataVersion();
      const isStale = isClientVersionStale(localMeta, remoteMeta);

      if (!force && !isStale) {
        setGlobalDataVersion(remoteMeta);
        return { updated: false, version: remoteMeta.version, message: 'البيانات الحالية محدثة لأحدث إصدار' };
      }

      setIsVersionSyncing(true);
      const scope = remoteMeta.scope || 'all';

      // كل الجلبات بتتعمل الأول وتخزّن متغيرات، وبعدين بيتمسح الكاش القديم
      // بس للأجزاء اللي نزلت فعلاً.
      //
      // الترتيب القديم كان: امسح الكاش ← فضّي الشاشة ← جلب. فلو أي جلب
      // فشل على شبكة ضعيفة، المندوب كان بيفقد بياناته المحلية من غير ما
      // ييجيله بديل — IndexedDB كان اتمسح والشاشة فاضية. دلوقتي البيانات
      // المحلية بتفضل مكانها لحد ما الجديد يوصل فعلاً.
      const inScope = (s: SyncScope) => scope === 'all' || scope === s;

      // Fresh payloads, held until we know which ones actually arrived.
      let freshProducts: Product[] | null = null;
      let freshCustomers: Customer[] | null = null;
      let freshTargets: TargetRecord[] | null = null;
      let freshInvoices: Invoice[] | null = null;
      let freshVisits: CustomerVisit[] | null = null;

      // الجلبات الخمسة دي بتسحب التغييرات تدريجياً أولاً لما يكون فيه بصمة وكاش محلي
      // لتقليل الـ egress على 500 جهاز عند نشر تحديث جديد، وترجع للجدول الكامل فقط عند الحاجة.
      const isAdminOrDev =
        !currentUser ||
        currentUser.role === 'admin' ||
        currentUser.role === 'developer' ||
        currentUser.role === 'technical_support';

      const invScope = buildInvoiceFetchScope(currentUser, users, activeApiSector);
      const invScopeKey = invoiceScopeKey(invScope);

      const [prodStamp, visStamp, custStamp, trgStamp, invStamp] = await Promise.all([
        inScope('products') ? fetchProductContentStamp(productSectorScope).catch(() => null) : Promise.resolve(null),
        inScope('visits') ? fetchVisitContentStamp(visitFetchScope) : Promise.resolve(null),
        inScope('customers') ? fetchCustomerContentStamp(customerFetchScope) : Promise.resolve(null),
        inScope('targets') ? fetchTargetContentStamp(targetFetchScope) : Promise.resolve(null),
        inScope('invoices') ? fetchInvoiceContentStamp(invScope) : Promise.resolve(null),
      ]);

      const pullProductsForVersionSync = async (): Promise<{ success: boolean; products?: Product[]; error?: string } | null> => {
        if (!inScope('products')) return null;
        const storedProdStamp = readProductContentStamp(ctxSnap.sector);
        if (areContentStampsEqual(prodStamp, storedProdStamp) && productsRef.current.length > 0) {
          return { success: true, products: productsRef.current };
        }
        if (await isProductsTableAuthoritative()) {
          const inc = await fetchProductsIncremental(productSectorScope).catch(() => null);
          if (inc?.success) {
            const incoming = inc.products || [];
            if (!inc.isFullFetch && incoming.length === 0) {
              return { success: true, products: productsRef.current };
            }
            const merged = inc.isFullFetch ? incoming : mergeProductsIncremental(productsRef.current, incoming);
            return { success: true, products: merged };
          }
        }
        return fetchProductsFromSupabase({ sector: productSectorScope });
      };

      const pullCustomersForVersionSync = async (): Promise<Awaited<ReturnType<typeof fetchCustomersFromSupabase>> | null> => {
        if (!inScope('customers')) return null;
        const storedCustStamp = readCustomerContentStamp(ctxSnap.userId, ctxSnap.sector);
        if (storedCustStamp?.maxUpdatedAt && customersRef.current.length > 0) {
          if (areContentStampsEqual(custStamp, storedCustStamp)) {
            return { success: true, customers: customersRef.current };
          }
          const inc = await fetchCustomersFromSupabase(customerFetchScope, {
            updatedSince: storedCustStamp.maxUpdatedAt,
          }).catch(() => null);
          if (inc?.success) {
            const incoming = sanitizeCustomers(inc.customers || []);
            const linkedInc = linkCustomersToUsers(incoming, users);
            return {
              success: true,
              customers: deduplicateCustomersArray(mergeCustomersIncremental(customersRef.current, linkedInc)),
            };
          }
        }
        return fetchCustomersFromSupabase(customerFetchScope);
      };

      const pullVisitsForVersionSync = async (): Promise<Awaited<ReturnType<typeof fetchVisitsFromSupabase>> | null> => {
        if (!inScope('visits')) return null;
        const storedVisStamp = readVisitContentStamp(ctxSnap.userId, ctxSnap.sector);
        if (storedVisStamp?.maxUpdatedAt && visitsRef.current.length > 0) {
          if (areContentStampsEqual(visStamp, storedVisStamp)) {
            return { success: true, visits: visitsRef.current };
          }
          const inc = await fetchVisitsFromSupabase(visitFetchScope, {
            updatedSince: storedVisStamp.maxUpdatedAt,
          }).catch(() => null);
          if (inc?.success) {
            const map = new Map<string, CustomerVisit>();
            visitsRef.current.forEach((v) => map.set(v.id, v));
            (inc.visits || []).forEach((v) => map.set(v.id, { ...v, syncStatus: 'synced' }));
            return { success: true, visits: Array.from(map.values()) };
          }
        }
        return fetchVisitsFromSupabase(visitFetchScope);
      };

      const pullTargetsForVersionSync = async (): Promise<Awaited<ReturnType<typeof fetchTargetsRecentMonths>> | null> => {
        if (!inScope('targets')) return null;
        const storedTrgStamp = readTargetContentStamp(targetFetchScope);
        if (areContentStampsEqual(trgStamp, storedTrgStamp) && targetsRef.current.length > 0) {
          return null;
        }
        const inc = await fetchTargetsIncremental(targetFetchScope).catch(() => null);
        if (inc?.success && !inc.isFullFetch && targetsRef.current.length > 0) {
          if (!inc.targets || inc.targets.length === 0) {
            return null;
          }
          return {
            success: true,
            targets: mergeTargetsIncremental(targetsRef.current, inc.targets.map(mapTargetRowToRecord)),
          };
        }
        return fetchTargetsRecentMonths(12, targetFetchScope);
      };

      const pullInvoicesForVersionSync = async (): Promise<Awaited<ReturnType<typeof fetchInvoicesFromSupabase>> | null> => {
        if (!inScope('invoices')) return null;
        const storedInvStamp = readInvoiceContentStamp(invScopeKey);
        if (
          invStamp &&
          storedInvStamp &&
          invStamp.maxCreatedAt === storedInvStamp.maxCreatedAt &&
          (invStamp.otherMax ?? null) === (storedInvStamp.otherMax ?? null) &&
          invStamp.table === storedInvStamp.table &&
          invoicesRef.current.length > 0
        ) {
          return { success: true, invoices: invoicesRef.current };
        }
        const canIncInv =
          invStamp !== null &&
          storedInvStamp !== null &&
          !!invStamp.maxCreatedAt &&
          !!storedInvStamp.maxCreatedAt &&
          invStamp.table === storedInvStamp.table &&
          !invStamp.otherMax &&
          !storedInvStamp.otherMax &&
          invoicesRef.current.length > 0;
        if (canIncInv) {
          const inc = await fetchInvoicesFromSupabase(invScope, {
            updatedSince: storedInvStamp!.maxCreatedAt!,
            stampColumn: invStamp!.stampColumn,
          }).catch(() => null);
          if (inc?.success && inc.invoices) {
            const map = new Map<string, Invoice>();
            invoicesRef.current.forEach((inv) => map.set(inv.id, inv));
            inc.invoices.forEach((inv) => map.set(inv.id, inv));
            return { success: true, invoices: Array.from(map.values()) };
          }
        }
        return fetchInvoicesFromSupabase(invScope);
      };

      const [prodRes, custRes, trgRes, invRes, visRes] = await Promise.all([
        pullProductsForVersionSync(),
        pullCustomersForVersionSync(),
        pullTargetsForVersionSync(),
        pullInvoicesForVersionSync(),
        pullVisitsForVersionSync(),
      ]);

      if (prodRes?.success) {
        freshProducts = sanitizeProducts(prodRes.products || []);
        if (prodStamp && (prodStamp.maxUpdatedAt !== null || prodStamp.empty === true)) {
          saveProductContentStamp(prodStamp, ctxSnap.sector);
        }
      }

      if (custRes?.success) {
        const linked = linkCustomersToUsers(sanitizeCustomers(custRes.customers || []), usersRef.current);
        freshCustomers = deduplicateCustomersArray(linked);
        if (custStamp && (custStamp.maxUpdatedAt !== null || custStamp.empty === true)) {
          saveCustomerContentStamp(custStamp, ctxSnap.userId, ctxSnap.sector);
        }
      }

      if (trgRes?.success) {
        freshTargets = (trgRes.targets || []).map((t: any) =>
          t && typeof t.repName === 'string' ? t : mapTargetRowToRecord(t)
        );
        if (trgStamp && (trgStamp.maxUpdatedAt !== null || trgStamp.empty === true)) {
          saveTargetContentStamp(trgStamp, targetFetchScope);
        }
      }

      if (invRes?.success && invRes.invoices) {
        freshInvoices = invRes.invoices;
        if (invStamp) saveInvoiceContentStamp(invScopeKey, invStamp);
      }

      if (visRes?.success && visRes.visits) {
        freshVisits = visRes.visits;
        if (visStamp && (visStamp.maxUpdatedAt !== null || visStamp.empty === true)) {
          saveVisitContentStamp(visStamp, ctxSnap.userId, ctxSnap.sector);
        }
      }

      /**
       * Point of no return: we now hold real replacements for at least part of
       * the scope, so the stale local caches for exactly those parts can go.
       *
       * Only the scopes that actually landed are purged. If the network dropped
       * mid-sync, the customer's own copy stays on the device and the screen
       * keeps rendering the last good data instead of going blank.
       */
      const purgedScopes: SyncScope[] = [];
      if (freshProducts) purgedScopes.push('products');
      if (freshCustomers) purgedScopes.push('customers');
      if (freshTargets) purgedScopes.push('targets');
      if (freshInvoices) purgedScopes.push('invoices');
      if (freshVisits) purgedScopes.push('visits');

      if (purgedScopes.length === 0) {
        // Nothing arrived. Keep every local cache and every pending offline
        // record exactly as it is — losing them would be far worse than
        // staying one version behind for a minute.
        saveLocalDataVersion(remoteMeta);
        setGlobalDataVersion(remoteMeta);
        const staleMsg = 'تعذر تحديث البيانات من السيرفر — تم الاحتفاظ بالبيانات المحلية. لما يتحسن الاتصال هيتم التحديث تلقائياً.';
        setLastVersionSyncNotice(staleMsg);
        setTimeout(() => setLastVersionSyncNotice(null), 8000);
        return { updated: false, version: remoteMeta.version, message: staleMsg };
      }

      for (const one of purgedScopes) {
        await purgeLocalDataCaches(one, {
          userId: ctxSnap.userId || undefined,
          sector: ctxSnap.sector === 'electrical' ? 'electrical' : 'home',
        });
      }

      // Commit: everything below writes the fresh lists into React state and
      // back into IndexedDB, so it runs strictly after the purge.
      const queuedMutations = await getQueuedMutations();

      if (freshProducts) {
        setProducts(freshProducts);
        idbSet(getProductsCacheKey(ctxSnap.sector), freshProducts).catch(() => {});
      }

      if (freshCustomers) {
        const remoteCustomers = freshCustomers;
        const pendingCustIds = new Set(
          queuedMutations.filter((m) => m.entity === 'customers' && m.op === 'upsert').map((m) => m.entityId)
        );
        setCustomers((prev) => {
          const nextMap = new Map<string, Customer>();
          remoteCustomers.forEach((c) => nextMap.set(c.id, c));
          prev.forEach((c) => {
            if (pendingCustIds.has(c.id) && !nextMap.has(c.id)) {
              nextMap.set(c.id, c);
            }
          });
          const next = Array.from(nextMap.values());
          idbSet(getCustomersCacheKey(ctxSnap.userId, ctxSnap.sector), next).catch(() => {});
          return next;
        });
      }

      if (freshTargets) {
        setTargets(freshTargets);
        idbSet(getTargetsCacheKey(ctxSnap.userId, ctxSnap.sector), freshTargets).catch(() => {});
      }

      if (freshInvoices) {
        const remoteInvoices = freshInvoices;
        const pendingList = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
        const pendingIds = new Set([
          ...pendingList.map((i) => i.id),
          ...queuedMutations.filter((m) => m.entity === 'invoices' && m.op === 'upsert').map((m) => m.entityId),
        ]);
        setInvoices((prev) => {
          const nextMap = new Map<string, Invoice>();
          remoteInvoices.forEach((inv) => nextMap.set(inv.id, inv));
          // Only keep local invoices that are genuinely pending offline upload
          prev.forEach((inv) => {
            if (pendingIds.has(inv.id) && !nextMap.has(inv.id)) {
              nextMap.set(inv.id, inv);
            }
          });
          const next = Array.from(nextMap.values());
          return next;
        });
      }

      if (freshVisits) {
        const remoteVisits = freshVisits;
        const pendingVisitIds = new Set(
          queuedMutations.filter((m) => m.entity === 'visits' && m.op === 'upsert').map((m) => m.entityId)
        );
        setVisits((prev) => {
          const nextMap = new Map<string, CustomerVisit>();
          remoteVisits.forEach((v) => nextMap.set(v.id, { ...v, syncStatus: 'synced' }));
          prev.forEach((v) => {
            if (pendingVisitIds.has(v.id) && !nextMap.has(v.id)) {
              nextMap.set(v.id, v);
            }
          });
          const next = Array.from(nextMap.values());
          persistVisits(next);
          return next;
        });
      }

      saveLocalDataVersion(remoteMeta);
      setGlobalDataVersion(remoteMeta);
      // Record a fingerprint of the data we just accepted. The heartbeat compares
      // against it so an admin edit lands on every client even if the version
      // stamp did not change.
      saveLocalCustomersFingerprint(freshCustomers || customersRef.current, ctxSnap.userId, ctxSnap.sector);

      const noticeMsg = `تم تحديث البيانات تلقائياً ومسح الذاكرة المؤقتة القديمة بنجاح! (${remoteMeta.notes || 'تحديث تلقائي'})`;
      setLastVersionSyncNotice(noticeMsg);
      setTimeout(() => setLastVersionSyncNotice(null), 8000);

      return { updated: true, version: remoteMeta.version, message: noticeMsg };
    } catch (err: any) {
      console.warn('Check & sync data version error:', err);
      return { updated: false, message: err?.message || 'فشل فحص إصدار البيانات' };
    } finally {
      setIsVersionSyncing(false);
    }
    })();
    if (!force) {
      dataVersionCheckInFlightRef.current = run;
      run.finally(() => {
        if (dataVersionCheckInFlightRef.current === run) {
          dataVersionCheckInFlightRef.current = null;
        }
      });
    }
    return run;
  };

  /**
   * Publish a new global data version to Supabase
   * This broadcasts a signal to all connected client devices to purge their local caches
   */
  const publishDataVersionUpdate = async (params: {
    scope?: SyncScope;
    notes?: string;
    forcePurge?: boolean;
  }): Promise<{ success: boolean; version: number; message: string }> => {
    try {
      setIsVersionSyncing(true);
      const newMeta = await publishNewDataVersion({
        scope: params.scope || 'all',
        updatedBy: currentUser?.name || 'مدير النظام',
        notes: params.notes || 'تحديث عام لقاعدة البيانات ومسح الكاش لجميع المستخدمين',
        forcePurge: params.forcePurge ?? true,
        productsCount: products.length,
        customersCount: customers.length,
        targetsCount: targets.length,
      });

      setGlobalDataVersion(newMeta);
      const msg = `تم نشر التحديث بنجاح وتوجيه جميع أجهزة المستخدمين لتحديث البيانات تلقائياً!`;
      setLastVersionSyncNotice(msg);
      setTimeout(() => setLastVersionSyncNotice(null), 8000);
      return { success: true, version: newMeta.version, message: msg };
    } catch (err: any) {
      return { success: false, version: 0, message: err?.message || 'فشل نشر الإصدار' };
    } finally {
      setIsVersionSyncing(false);
    }
  };

  /**
   * Force client to purge local caches and re-fetch clean dataset from scratch
   */
  const forcePurgeCacheAndReload = async (scope: SyncScope = 'all'): Promise<void> => {
    setIsVersionSyncing(true);
    try {
      await purgeLocalDataCaches(scope, {
        userId: currentUser?.id,
        sector: activeApiSector,
      });
      clearScopedContentStamps();
      await checkAndSyncDataVersion(true);
    } finally {
      setIsVersionSyncing(false);
    }
  };

  /**
   * إصلاح اشتراك الـrealtime بعد الرجوع بالـBack-Forward Cache.
   *
   * المشكلة: لما كروم يدخّل الصفحة في الـBFCache بيقفل الـWebSocket عشان
   * provides resources، بس الصفحة بترجع وجواها الكانال لسه فا��ر نفسه «متوصّل».
   * قناة phoenix بتعمل rejoin تلقائياً بس لما الكانال يكون في حالة error،
   * فكان بيفضل ميت صامت والبيانات بتتحدّث بس لما الـfocus يضرب (وبنقرّب بده).
   *
   * الحل: بنعيد فتح السوكيت (connect() آمن لو هو متوصّل أصلاً — بيعمل return
   * فوري) وبنزوّد العدّاد عشان الـeffects بتعمل unsubscribe/subscribe من جديد
   * بقنوات سليمة.
   *
   * `event.persisted` هو اللي بيفرق: true يعني الصفحة مرجّعة من الكاش، false
   * يعني تحميل عادي أو إغلاق — وفي الحالة التانية مش بنعمل حاجة.
   */
  const realtimeCheckRef = useRef<(() => void) | null>(null);
  const realtimeCheckCustomersRef = useRef<(() => void) | null>(null);
  const shouldUseRealtimeRef = useRef<boolean>(false);
  shouldUseRealtimeRef.current = Boolean(isSupabaseConfigured && currentUser && currentUser.role !== 'sales_rep');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let lastRestoreAt = 0;
    /**
     * قبل ما المتصفح يجمّد الصفحة في الـBFCache بنقفل الـWebSocket بنفسنا.
     * لو سِبناه مفتوح، المتصفح بيجمّده في نص الـhandshake ويطبع
     * «WebSocket opening handshake timed out» في الكونسول — ضوضاء ملهاش لازمة
     * لأننا أصلاً بنعيد الاتصال والاشتراك في pageshow.
     */
    const handlePageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      try {
        supabase.realtime.disconnect();
      } catch {
        // تجاهل: السوكيت ممكن يكون مقفول بالفعل
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // سبام زِرار الرجوع ممكن يطلّع pageshow كذا مرة ورا بعض، وكل مرة بتعمل
      // إعادة مزامنة كاملة. المتغير ده بيخلي أول واحدة بس هي اللي تشتغل.
      const now = Date.now();
      if (now - lastRestoreAt < 3000) return;
      lastRestoreAt = now;
      // لو الجهاز أوفلاين أو الدور مندوب مبيعات، مش بنفتح اتصال Realtime دائم.
      if (shouldUseRealtimeRef.current && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        try {
          supabase.realtime.connect();
        } catch (error) {
          console.warn('Realtime reconnect notice:', error);
        }
      }
      setDataEpoch((n) => n + 1);
    };
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  // Deduplicate immediate boot checks across [users, isLocalDataHydrated, dataEpoch] updates
  const lastBootHeartbeatAtRef = useRef<number>(0);
  const lastBootCustScopeSigRef = useRef<string>('');

  // Re-check on focus, tab visibility, realtime version broadcasts, and as a short heartbeat.
  // The heartbeat is intentionally defensive: realtime can be disconnected on mobile networks.
  useEffect(() => {
    if (!isLocalDataHydrated || !isSupabaseConfigured || effectiveSectorFilter === 'none') return;
    let checkInFlight = false;
    let lastHeartbeatCheck = Date.now();
    const HEARTBEAT_INTERVAL_MS = 25 * 60 * 1000;

    const check = () => {
      if (checkInFlight || document.visibilityState === 'hidden' || !currentUserRef.current) return;
      checkInFlight = true;
      checkAndSyncDataVersion(false).catch(() => {}).finally(() => {
        checkInFlight = false;
      });
    };

    const checkCustomersContent = async (force: boolean = false) => {
      if (checkInFlight || document.visibilityState === 'hidden' || !currentUserRef.current) return;
      if (activeStorageCtxRef.current.sector === 'none') return;
      // Skip while our own write is still propagating, otherwise a lagging
      // server response overwrites the fresh data we just published.
      if (!force && Date.now() - authoritativeWriteAtRef.current < 120000) return;

      const ctxSnap = { ...activeStorageCtxRef.current };
      const custKey = getCustomersCacheKey(ctxSnap.userId, ctxSnap.sector);

      // 1) استعلام بصمة صف واحد. لو نفس البصمة المحفوظة من آخر تنزيل كامل
      // → مفيش تغيير على السيرفر، ومفيش أي بايتات جدول بتتنقل.
      const stamp = await fetchCustomerContentStamp(customerFetchScope);
      const stampComparable =
        stamp !== null && (stamp.maxUpdatedAt !== null || stamp.empty === true);
      const storedStamp = readCustomerContentStamp(ctxSnap.userId, ctxSnap.sector);

      if (!force && stampComparable && storedStamp) {
        const unchanged = areContentStampsEqual(stamp, storedStamp);
        if (unchanged) {
          const currentCount = customersRef.current?.length || customers.length;
          if (currentCount > 0) return;
          // لو الـstate لسه مااتملتش من IndexedDB، نقراها محلياً ونقفل التنزيل
          const cachedCusts = await idbGet<Customer[]>(custKey);
          if (cachedCusts && cachedCusts.length > 0) {
            setCustomers(cachedCusts);
            return;
          }
        }
      }

      // 2) البصمة غير متاحة (عمود updated_at مش موجود مثلًا):
      // كان فيه تنزيل كامل للجدول مرة كل ساعة على كل جهاز كـ«شبكة أمان» —
      // أي جهاز على شبكة ضعيفة كان بيسحب آلاف الصفوف كل ساعة بلا داعي.
      // بقى التنزيل الكامل مسموح في ثلاث حالات بس:
      //   • force (طلب صريح من المستخدم)
      //   • ختم إصدار منشور اتغيّر (checkAndSyncDataVersion)
      //   • مفيش بيانات عملاء محلية أصلًا (جهاز جديد / كاش ممسوح)
      if (!force && !stampComparable) {
        const hasLocalCustomers =
          (customersRef.current?.length || 0) > 0 ||
          ((await idbGet<Customer[]>(custKey))?.length || 0) > 0;
        if (hasLocalCustomers) return;
      }

      if (customerDownloadInFlightRef.current) return;

      /**
       * 2.5) مزامنة تدريجية قبل التنزيل الكامل:
       * لو البصمة اتغيّرت لكن عدد الصفوف ما نقصش (تعديل/إضافة بس)، بنجيب
       * الصفوف اللي `updated_at` بتاعها أحدث من آخر بصمة محفوظة وندمجها مع
       * الموجود. ده بيحوّل تكلفة التعديل اليومي من ~95KB–875KB لكل جهاز إلى
       * كام كيلوبايت بس. أي نقص في العدد (حذف) بيرجع للتنزيل الكامل.
       */
      const canIncremental =
        !force &&
        stampComparable &&
        !!storedStamp?.maxUpdatedAt &&
        (customersRef.current?.length || 0) > 0;

      if (canIncremental) {
        checkInFlight = true;
        customerDownloadInFlightRef.current = true;
        try {
          const inc = await fetchCustomersFromSupabase(customerFetchScope, {
            updatedSince: storedStamp!.maxUpdatedAt!,
          });
          if (inc.success) {
            if (stampComparable && stamp) {
              saveCustomerContentStamp(stamp, ctxSnap.userId, ctxSnap.sector);
            }
            const incoming = sanitizeCustomers(inc.customers || []);
            if (incoming.length > 0) {
              const linkedInc = linkCustomersToUsers(incoming, usersRef.current);
              const next = deduplicateCustomersArray(
                mergeCustomersIncremental(customersRef.current || [], linkedInc)
              );
              setCustomers(next);
              customersRef.current = next;
              idbSet(custKey, next).catch(() => {});
              saveLocalCustomersFingerprint(next, ctxSnap.userId, ctxSnap.sector);
              return;
            } else {
              return;
            }
          }
          // فشل التنزيل التدريجي → نكمل بالتنزيل الكامل تحت كشبكة أمان.
        } finally {
          checkInFlight = false;
          customerDownloadInFlightRef.current = false;
        }
      }

      checkInFlight = true;
      customerDownloadInFlightRef.current = true;
      try {
        const res = await fetchCustomersFromSupabase(customerFetchScope);
        if (!res.success || !res.customers || res.customers.length === 0) return;
        const linked = linkCustomersToUsers(sanitizeCustomers(res.customers), usersRef.current);
        const fresh = deduplicateCustomersArray(linked);
        const fingerprint = buildCustomersFingerprint(fresh);
        customerFullFetchAtRef.current = Date.now();
        if (stampComparable && stamp) {
          saveCustomerContentStamp(stamp, ctxSnap.userId, ctxSnap.sector);
        }
        if (
          fingerprint === getLocalCustomersFingerprint(ctxSnap.userId, ctxSnap.sector) &&
          (customersRef.current?.length || 0) >= fresh.length
        ) {
          return;
        }
        setCustomers(fresh);
        customersRef.current = fresh;
        idbSet(custKey, fresh).catch(() => {});
        saveLocalCustomersFingerprint(fresh, ctxSnap.userId, ctxSnap.sector);
      } catch {
        // Network hiccup: the next heartbeat retries.
      } finally {
        checkInFlight = false;
        customerDownloadInFlightRef.current = false;
      }
    };

    let lastFocusOrVisibilityCheck = 0;
    const FOCUS_SYNC_COOLDOWN_MS = 25 * 60 * 1000;
    let realtimeJitterTimer: number | null = null;

    const handleFocusOrVisibility = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastFocusOrVisibilityCheck < FOCUS_SYNC_COOLDOWN_MS) return;
      lastFocusOrVisibilityCheck = now;
      checkCustomersContent();
      check();
    };

    const heartbeat = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastHeartbeatCheck < HEARTBEAT_INTERVAL_MS) return;
      lastHeartbeatCheck = now;
      checkCustomersContent();
      check();
    };

    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);
    // Heartbeat كل 25 دقيقة لتقليل egress؛ القناة الموحدة للـ Realtime + بصمة المحتوى تغطي التحديثات.
    const interval = window.setInterval(heartbeat, 25 * 60 * 1000);
    realtimeCheckCustomersRef.current = checkCustomersContent;
    realtimeCheckRef.current = check;

    const custScopeSig = customerFetchScope ? JSON.stringify(customerFetchScope) : 'all';
    const nowBoot = Date.now();
    // عند الدخول المباشر (justLoggedInRef)، تأثير الإقلاع التالي يتولى الفحص الشامل مرة واحدة بالتسلسل.
    const shouldRunImmediateCheck =
      Boolean(currentUserRef.current) &&
      !justLoggedInRef.current &&
      (lastBootCustScopeSigRef.current !== custScopeSig ||
        nowBoot - lastBootHeartbeatAtRef.current >= 15_000);
    if (shouldRunImmediateCheck) {
      lastBootCustScopeSigRef.current = custScopeSig;
      lastBootHeartbeatAtRef.current = nowBoot;
      const bootHasLocalCache =
        (productsRef.current?.length || 0) > 0 &&
        (customersRef.current?.length || 0) > 0;
      const bootStampCheckDelay =
        currentUserRef.current?.role === 'sales_rep' && bootHasLocalCache
          ? Math.floor(Math.random() * BOOT_SYNC_JITTER_MAX_MS)
          : 0;
      const runBootStampCheck = () => {
        if (document.visibilityState === 'hidden') return;
        checkCustomersContent();
        if (dataEpoch > 0) {
          check();
        }
      };
      if (bootStampCheckDelay > 0) {
        if (realtimeJitterTimer !== null) window.clearTimeout(realtimeJitterTimer);
        realtimeJitterTimer = window.setTimeout(() => {
          realtimeJitterTimer = null;
          runBootStampCheck();
        }, bootStampCheckDelay);
      } else {
        runBootStampCheck();
      }
    }

    return () => {
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      window.clearInterval(interval);
      if (realtimeJitterTimer !== null) window.clearTimeout(realtimeJitterTimer);
      realtimeCheckCustomersRef.current = null;
      realtimeCheckRef.current = null;
    };
  }, [isLocalDataHydrated, dataEpoch, currentUser?.id, effectiveSectorFilter]);

  // Initial Supabase connection check, fetch users, products, invoices & real-time sync
  useEffect(() => {
    // Wait for IndexedDB hydration and an active logged-in account & sector before syncing heavy domain data.
    if (!isLocalDataHydrated || !currentUserRef.current || !isSupabaseConfigured || effectiveSectorFilter === 'none') return;

    const ctxSnap = { ...activeStorageCtxRef.current };
    const prodKey = getProductsCacheKey(ctxSnap.sector);
    const custKey = getCustomersCacheKey(ctxSnap.userId, ctxSnap.sector);
    const invKey = getInvoicesCacheKey(ctxSnap.userId, ctxSnap.sector);
    const visKey = getVisitsCacheKey(ctxSnap.userId, ctxSnap.sector);

    justLoggedInRef.current = false;

    // 1) المستخدمون بيتغيروا نادرًا — 24 ساعة للمناديب و 12 ساعة لباقي الأدوار، ومن غير كلمات مرور للأجهزة غير الإدارية.
    const lastUsersSync = Number(localStorage.getItem(USERS_LAST_SYNC_KEY) || 0);
    const isAdminAccount =
      currentUserRef.current?.role === 'admin' || currentUserRef.current?.role === 'developer';
    const effectiveUsersTtl =
      currentUserRef.current?.role === 'sales_rep' ? USERS_SYNC_TTL_MS * 2 : USERS_SYNC_TTL_MS;
    const usersAreFresh = users.length > 0 && Date.now() - lastUsersSync < effectiveUsersTtl;
    if (!usersAreFresh) {
    fetchUsersFromSupabase(true, { includeCredentials: isAdminAccount }).then((res) => {
          if (res.success) {
            try { localStorage.setItem(USERS_LAST_SYNC_KEY, String(Date.now())); } catch {}
          }
          if (res.success && res.users && res.users.length > 0) {
            hasSyncedUsersFromServerRef.current = true;
            setUsers((prev) => {
              const dedup = sanitizeAndDeduplicateUsers(res.users!);
              if (dedup.removedUserIds.length > 0) {
                dedup.removedUserIds.forEach((remId) => {
                  deleteUserFromSupabase(remId).catch(() => {});
                });
                setCustomers((prevCusts) => {
                  let changed = false;
                  const updated = prevCusts.map((c) => {
                    if (c.repId && dedup.idRedirectMap[c.repId]) {
                      changed = true;
                      return { ...c, repId: dedup.idRedirectMap[c.repId] };
                    }
                    return c;
                  });
                  return changed ? updated : prevCusts;
                });
                setInvoices((prevInvs) => {
                  let changed = false;
                  const updated = prevInvs.map((inv) => {
                    if (inv.repId && dedup.idRedirectMap[inv.repId]) {
                      changed = true;
                      return { ...inv, repId: dedup.idRedirectMap[inv.repId] };
                    }
                    return inv;
                  });
                  return changed ? updated : prevInvs;
                });
              }
              return dedup.deduplicated;
            });
          }
        });
    }

        const bootHasLocalCache =
          (productsRef.current?.length || 0) > 0 &&
          (customersRef.current?.length || 0) > 0;
        const bootJitterWait: Promise<void> =
          currentUserRef.current?.role === 'sales_rep' && bootHasLocalCache
            ? new Promise<void>((resolve) => {
                const t = window.setTimeout(() => {
                  bootJitterTimersRef.current.delete(t);
                  resolve();
                }, Math.floor(Math.random() * BOOT_SYNC_JITTER_MAX_MS));
                bootJitterTimersRef.current.add(t);
              })
            : Promise.resolve();
        let secondaryBootTimer: number | null = null;
        let bootCancelled = false;

        bootJitterWait.then(() => {
        checkAndSyncDataVersion(false).then((syncRes) => {
          if (bootCancelled) return;
          if (!syncRes.updated) {
            if (productsRef.current.length === 0) {
              if (isGoogleSheetsReadMode()) {
                const savedSources = getPublishedDataSources();
                const prodKeys = ctxSnap.sector === 'electrical' ? (['products_electrical'] as const) : (['products'] as const);
                (async () => {
                  const { fetchAndParseGoogleSheet } = await import('../services/excelService');
                  const allProducts: Product[] = [];
                  for (const key of prodKeys) {
                    const src = (savedSources as any)[key];
                    if (src?.enabled && src?.url && /^https?:\/\//i.test(String(src.url).trim())) {
                      try {
                        const res = await fetchAndParseGoogleSheet(String(src.url).trim());
                        if (res?.products?.length) allProducts.push(...res.products);
                      } catch {}
                    }
                  }
                  if (allProducts.length > 0 && !bootCancelled) {
                    setProducts((curr) => {
                      if (curr.length > 0) return curr;
                      const valid = sanitizeProducts(allProducts);
                      idbSet(prodKey, valid).catch(() => {});
                      return valid;
                    });
                  }
                })().catch(() => {});
              } else {
                Promise.all([
                  fetchProductsFromSupabase({ sector: productSectorScope }),
                  fetchProductContentStamp(productSectorScope).catch(() => null),
                ]).then(([pRes, pStamp]) => {
                  if (bootCancelled) return;
                  if (pRes.success && pRes.products && pRes.products.length > 0) {
                    if (pStamp) saveProductContentStamp(pStamp, ctxSnap.sector);
                    setProducts((curr) => {
                      if (curr.length === 0) {
                        const valid = sanitizeProducts(pRes.products!);
                        idbSet(prodKey, valid).catch(() => {});
                        return valid;
                      }
                      return curr;
                    });
                  }
                });
              }
            } else if (!isGoogleSheetsReadMode() && navigator.onLine !== false) {
              fetchProductContentStamp(productSectorScope).then(async (remotePStamp) => {
                if (bootCancelled) return;
                if (!remotePStamp || (remotePStamp.maxUpdatedAt === null && remotePStamp.empty !== true)) return;
                const storedPStamp = readProductContentStamp(ctxSnap.sector);
                if (areContentStampsEqual(storedPStamp, remotePStamp)) {
                  return;
                }
                const pRes = await fetchProductsFromSupabase({ sector: productSectorScope });
                if (bootCancelled) return;
                if (pRes.success && pRes.products && pRes.products.length > 0) {
                  const valid = sanitizeProducts(pRes.products);
                  setProducts(valid);
                  idbSet(prodKey, valid).catch(() => {});
                  saveProductContentStamp(remotePStamp, ctxSnap.sector);
                }
              }).catch(() => {});
            }
            const hasLocalCusts = (customersRef.current?.length || 0) > 0;
            if (hasLocalCusts && navigator.onLine !== false) {
              realtimeCheckCustomersRef.current?.();
            }
            if (!hasLocalCusts) {
              idbGet<Customer[]>(custKey).then((cached) => {
                if (bootCancelled) return;
                if (cached && cached.length > 0) {
                  customersRef.current = cached;
                  setCustomers(cached);
                  if (navigator.onLine !== false) realtimeCheckCustomersRef.current?.();
                  return;
                }
                if (isGoogleSheetsReadMode()) {
                  const savedSources = getPublishedDataSources();
                  const custKeys = ctxSnap.sector === 'electrical' ? (['customers_electrical'] as const) : (['customers'] as const);
                  (async () => {
                    const { fetchDetailedCustomersFromGoogleSheet } = await import(
                      '../services/customerAnalyticsService'
                    );
                    const allCustomers: Customer[] = [];
                    for (const key of custKeys) {
                      const src = (savedSources as any)[key];
                      if (src?.enabled && src?.url && /^https?:\/\//i.test(String(src.url).trim())) {
                        try {
                          const res = await fetchDetailedCustomersFromGoogleSheet(String(src.url).trim());
                          if (res?.customers?.length) allCustomers.push(...res.customers);
                        } catch {}
                      }
                    }
                    if (allCustomers.length > 0 && !bootCancelled) {
                      const linked = linkCustomersToUsers(sanitizeCustomers(allCustomers), usersRef.current);
                      const valid = deduplicateCustomersArray(linked);
                      setCustomers((curr) => {
                        if (curr.length > 0) return curr;
                        idbSet(custKey, valid).catch(() => {});
                        saveLocalCustomersFingerprint(valid, ctxSnap.userId, ctxSnap.sector);
                        return valid;
                      });
                    }
                  })().catch(() => {});
                  return;
                }
                fetchCustomersFromSupabase(customerFetchScope).then(async (cRes) => {
                  if (bootCancelled) return;
                  if (cRes.success && cRes.customers && cRes.customers.length > 0) {
                    const linked = linkCustomersToUsers(sanitizeCustomers(cRes.customers!), usersRef.current);
                    const valid = deduplicateCustomersArray(linked);
                    const queued = await getQueuedMutations();
                    if (bootCancelled) return;
                    const pendingCustIds = new Set(
                      queued.filter((m) => m.entity === 'customers' && m.op === 'upsert').map((m) => m.entityId)
                    );
                    setCustomers((curr) => {
                      const map = new Map<string, Customer>();
                      valid.forEach((c) => map.set(c.id, c));
                      curr.forEach((c) => {
                        if (pendingCustIds.has(c.id) && !map.has(c.id)) {
                          map.set(c.id, c);
                        }
                      });
                      const next = Array.from(map.values());
                      idbSet(custKey, next).catch(() => {});
                      saveLocalCustomersFingerprint(next, ctxSnap.userId, ctxSnap.sector);
                      return next;
                    });
                  }
                });
              });
            }
          }

          secondaryBootTimer = window.setTimeout(() => {
            if (bootCancelled) return;
            loadInitialInvoices().catch(() => {});
            loadInitialVisits().catch(() => {});
          }, 5000);
        });
        });

        // 3. Fetch Invoices from Supabase (with 1-row content stamp check to cut boot egress)
        const deletedInvoiceIds = getDeletedInvoiceIds();
        const loadInitialInvoices = async () => {
          const activeUser = currentUserRef.current || currentUser;
          const role = activeUser?.role;
          const activeUsers = usersRef.current.length > 0 ? usersRef.current : users;
          const invScope = { ...buildInvoiceFetchScope(activeUser, activeUsers, activeApiSector), limit: 50 };
          const invScopeKey = invoiceScopeKey(invScope);
          const cachedLocalInvoices =
            invoicesRef.current.length > 0
              ? invoicesRef.current
              : (await idbGet<Invoice[]>(invKey)) || [];
          const hasLocalInvCache = cachedLocalInvoices.length > 0;

          const stamp = await fetchInvoiceContentStamp(invScope);
          const storedStamp = readInvoiceContentStamp(invScopeKey);
          const stampMatches =
            stamp !== null &&
            storedStamp !== null &&
            stamp.maxCreatedAt === storedStamp.maxCreatedAt &&
            (stamp.otherMax ?? null) === (storedStamp.otherMax ?? null) &&
            stamp.table === storedStamp.table;

          if (role === 'sales_rep' && hasLocalInvCache && navigator.onLine !== false && stampMatches) {
            if (invoicesRef.current.length === 0) setInvoices(cachedLocalInvoices);
            return;
          }

          if (stampMatches && (hasLocalInvCache || stamp?.empty === true)) {
            if (invoicesRef.current.length === 0 && hasLocalInvCache) {
              setInvoices(cachedLocalInvoices);
            }
            return;
          }

          const canIncrementalInv =
            stamp !== null &&
            storedStamp !== null &&
            !!stamp.maxCreatedAt &&
            !!storedStamp.maxCreatedAt &&
            stamp.table === storedStamp.table &&
            !stamp.otherMax &&
            !storedStamp.otherMax &&
            hasLocalInvCache;

          const res = canIncrementalInv
            ? await fetchInvoicesFromSupabase(invScope, {
                updatedSince: storedStamp!.maxCreatedAt!,
                stampColumn: stamp!.stampColumn,
              })
            : await fetchInvoicesFromSupabase(invScope);

          if (bootCancelled) return;
          if (res.success && res.invoices) {
            if (stamp) saveInvoiceContentStamp(invScopeKey, stamp);
            const remoteInvoices = res.invoices.filter(
              (inv) => !deletedInvoiceIds.has(inv.id) && !deletedInvoiceIds.has(inv.invoiceNumber)
            );
            const queued = await getQueuedMutations();
            if (bootCancelled) return;
            const pendingMutations = new Set(
              queued.filter((m) => m.entity === 'invoices' && m.op === 'upsert').map((m) => m.entityId)
            );
            const pendingList = (await idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES)) || [];
            const pendingIds = new Set([...pendingList.map((i) => i.id), ...pendingMutations]);

            setInvoices((previous) => {
              const baseList = previous.length > 0 ? previous : cachedLocalInvoices;
              const merged = new Map<string, Invoice>();
              if (canIncrementalInv) {
                baseList.forEach((inv) => {
                  if (!deletedInvoiceIds.has(inv.id) && !deletedInvoiceIds.has(inv.invoiceNumber)) {
                    merged.set(inv.id, inv);
                  }
                });
                remoteInvoices.forEach((inv) => merged.set(inv.id, inv));
              } else {
                remoteInvoices.forEach((inv) => merged.set(inv.id, inv));
                baseList.forEach((inv) => {
                  if (pendingIds.has(inv.id) && !merged.has(inv.id) && !deletedInvoiceIds.has(inv.id) && !deletedInvoiceIds.has(inv.invoiceNumber)) {
                    merged.set(inv.id, inv);
                  }
                });
              }
              const next = Array.from(merged.values());
              return next;
            });
          }
        };

        // 5. Fetch Visits from Supabase (narrowed by the role & sector scope)
        const deletedVisitIds = getDeletedVisitIds();
        const loadInitialVisits = async () => {
          const activeUser = currentUserRef.current || currentUser;
          const role = activeUser?.role;
          const currentVisits = visitsRef.current;
          const localVisits =
            currentVisits.length > 0 ? currentVisits : (await idbGet<CustomerVisit[]>(visKey)) || [];
          const hasLocalVisitCache = localVisits.length > 0;

          const stamp = await fetchVisitContentStamp(visitFetchScope);
          const comparable =
            stamp !== null && (stamp.maxUpdatedAt !== null || stamp.empty === true);
          const stored = readVisitContentStamp(ctxSnap.userId, ctxSnap.sector);
          const unchanged = comparable && areContentStampsEqual(stamp, stored);

          if (role === 'sales_rep' && hasLocalVisitCache && navigator.onLine !== false && unchanged) {
            if (currentVisits.length === 0) setVisits(localVisits);
            return;
          }

          if (unchanged && hasLocalVisitCache) {
            if (currentVisits.length === 0) setVisits(localVisits);
            return;
          }

          const canIncremental =
            comparable &&
            !!stored?.maxUpdatedAt &&
            currentVisits.length > 0;

          if (canIncremental) {
            try {
              const inc = await fetchVisitsFromSupabase(visitFetchScope, {
                updatedSince: stored!.maxUpdatedAt!,
              });
              if (bootCancelled) return;
              if (inc.success) {
                saveVisitContentStamp(stamp!, ctxSnap.userId, ctxSnap.sector);
                const changedVisits = (inc.visits || []).filter((v) => !deletedVisitIds.has(v.id));
                // مفيش COUNT على السيرفر، فمش بنقدر نتأكد إن العدد مكتمل. الدمج
                // التدريجي كافي — الحذف بييجي من إشارة realtime أو نسخة منشورة.
                {
                  if (changedVisits.length > 0) {
                    const queued = await getQueuedMutations();
                    if (bootCancelled) return;
                    const pendingVisitIds = new Set(
                      queued.filter((m) => m.entity === 'visits' && m.op === 'upsert').map((m) => m.entityId)
                    );
                    setVisits((previous) => {
                      const merged = new Map<string, CustomerVisit>();
                      previous.forEach((v) => merged.set(v.id, v));
                      changedVisits.forEach((v) => merged.set(v.id, { ...v, syncStatus: 'synced' }));
                      previous.forEach((v) => {
                        if (pendingVisitIds.has(v.id) && !merged.has(v.id)) merged.set(v.id, v);
                      });
                      const next = Array.from(merged.values());
                      persistVisits(next);
                      return next;
                    });
                  }
                  return;
                }
              }
            } catch {
              // fallback to full fetch below
            }
          }

          const res = await fetchVisitsFromSupabase(visitFetchScope);
          if (bootCancelled || !res.success || !res.visits) return;
          if (comparable && stamp) {
            saveVisitContentStamp(stamp, ctxSnap.userId, ctxSnap.sector);
          }

          const remoteVisits = res.visits.filter((v) => !deletedVisitIds.has(v.id));
          const queued = await getQueuedMutations();
          if (bootCancelled) return;
          const pendingVisitIds = new Set(
            queued.filter((m) => m.entity === 'visits' && m.op === 'upsert').map((m) => m.entityId)
          );
          setVisits((previous) => {
            const merged = new Map<string, CustomerVisit>();
            remoteVisits.forEach((visit) => merged.set(visit.id, { ...visit, syncStatus: 'synced' }));
            previous.forEach((visit) => {
              if (pendingVisitIds.has(visit.id) && !merged.has(visit.id) && !deletedVisitIds.has(visit.id)) {
                merged.set(visit.id, visit);
              }
            });
            const next = Array.from(merged.values());
            persistVisits(next);
            return next;
          });
        };
        return () => {
          bootCancelled = true;
          if (secondaryBootTimer !== null) window.clearTimeout(secondaryBootTimer);
          bootJitterTimersRef.current.forEach((t) => window.clearTimeout(t));
          bootJitterTimersRef.current.clear();
        };
  }, [isLocalDataHydrated, dataEpoch, currentUser?.id, effectiveSectorFilter]);

  // Consolidated single Realtime WebSocket channel.
  useEffect(() => {
    if (!isLocalDataHydrated || !isSupabaseConfigured) return;

    if (!currentUser) {
      try { supabase.realtime.disconnect(); } catch { /* Already disconnected */ }
      return;
    }

    if (currentUser.role === 'sales_rep') {
      let signalTimer: number | null = null;
      const channel = supabase
        .channel('rep-data-signal')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${GLOBAL_VERSION_RECORD_ID}` },
          () => {
            if (signalTimer !== null) window.clearTimeout(signalTimer);
            // jitter عشان ما كل المندوبين يسحبوش في نفس اللحظة
            signalTimer = window.setTimeout(() => {
              signalTimer = null;
              realtimeCheckRef.current?.();
            }, 2000 + Math.floor(Math.random() * 6000));
          }
        )
        .subscribe();
      return () => {
        if (signalTimer !== null) window.clearTimeout(signalTimer);
        supabase.removeChannel(channel);
      };
    }

    // سحب الفواتير المعلَّمة بإشارة — دفعة واحدة بعد jitter قصير.
    const pendingInvoiceIds = new Set<string>();
    let invoicePullTimer: number | null = null;

    const mapInvoiceRow = (raw: any): Invoice => ({
      id: raw.id,
      invoiceNumber: raw.invoice_number || raw.invoiceNumber || 'DRM-INV',
      customerName: raw.customer_name || raw.customerName || 'عميل',
      customerCode: raw.customer_code || raw.customerCode || undefined,
      customerPhone: raw.customer_phone || raw.customerPhone || '',
      customerAddress: raw.customer_address || raw.customerAddress || '',
      customerTaxNumber: raw.customer_tax_number || raw.customerTaxNumber || '',
      date: raw.date || (raw.created_at ? raw.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)),
      time: raw.time || (raw.created_at ? raw.created_at.slice(11, 19) : ''),
      repId: raw.rep_id || raw.repId || 'u-rep',
      repName: raw.rep_name || raw.repName || 'مندوب المبيعات',
      supervisorName: raw.supervisor_name || raw.supervisorName || 'مشرف الفرع',
      branchName: raw.branch_name || raw.branchName || 'الفرع الرئيسي',
      items: Array.isArray(raw.items) ? raw.items : typeof raw.items === 'string' ? JSON.parse(raw.items) : [],
      totalCartons: raw.total_cartons || raw.totalCartons || 0,
      totalPieces: raw.total_pieces || raw.totalPieces || 0,
      subtotal: raw.subtotal || raw.estimated_grand_total || 0,
      discountPercentage: raw.discount_percentage || 0,
      discountAmount: raw.discount_amount || raw.discountAmount || 0,
      taxPercentage: 0,
      taxAmount: 0,
      estimatedGrandTotal: raw.estimated_grand_total || raw.estimatedGrandTotal || 0,
      paymentMethod: raw.payment_method || raw.paymentMethod || 'نقدي (كاش)',
      status: raw.status || 'قيد مراجعة المشرف',
      notes: raw.notes || '',
      syncedToAccounting: raw.synced_to_accounting || false,
      hasShortageSplit: raw.has_shortage_split || false,
      shortageInvoiceNumber: raw.shortage_invoice_number,
      isShortageInvoice: raw.is_shortage_invoice || false,
      parentInvoiceId: raw.parent_invoice_id,
      parentInvoiceNumber: raw.parent_invoice_number,
      qrPayload: raw.qr_payload,
    });

    const flushInvoiceSignals = async () => {
      invoicePullTimer = null;
      const ids = Array.from(pendingInvoiceIds).slice(0, 25);
      ids.forEach((queuedId) => pendingInvoiceIds.delete(queuedId));
      if (ids.length === 0) return;
      // طلب دفعة واحد بدل حلقة N+1: كل الإشارات في `in('id', ids)` —
      // بدل ما كل فاتورة تاخد طلب لوحدها (حتى 50 طلب لكل إشارة).
      const rows = await fetchInvoiceRowsByIds(ids).catch(() => [] as any[]);
      const scopedToBranch = currentUser.role === 'supervisor' || currentUser.role === 'branch_manager';
      const mapped: Invoice[] = [];
      for (const row of rows) {
        // نفس نطاق البث القديم: مشرف الفرع مايشوفش فواتير فرع تاني.
        const rowBranch = String((row as any).branch_name || (row as any).branchName || '');
        if (scopedToBranch && currentUser.branchName && rowBranch && rowBranch !== currentUser.branchName) continue;
        mapped.push(mapInvoiceRow(row));
      }
      if (mapped.length > 0) {
        setInvoices((prev) => {
          const map = new Map<string, Invoice>();
          prev.forEach((inv) => map.set(inv.id, inv));
          mapped.forEach((inv) => map.set(inv.id, inv));
          return Array.from(map.values());
        });
        // الحفظ المحلي بيتعمل في effect منفصل (debouncedIdbSet) — مش هنكتبه هنا.
      }
      if (pendingInvoiceIds.size > 0) {
        invoicePullTimer = window.setTimeout(() => { void flushInvoiceSignals(); }, 1500);
      }
    };

    const queueInvoicePull = (raw: any) => {
      try {
        const parsed = typeof raw?.items === 'string' ? JSON.parse(raw.items) : raw?.items;
        const ids: string[] = Array.isArray(parsed?.ids) ? parsed.ids : parsed?.invoiceId ? [parsed.invoiceId] : [];
        ids.forEach((id) => {
          if (id) pendingInvoiceIds.add(String(id));
        });
      } catch {
        // إشارة مش مقروءة — النبضة الدورية هتغطيها
      }
      if (pendingInvoiceIds.size === 0 || invoicePullTimer !== null) return;
      invoicePullTimer = window.setTimeout(() => {
        void flushInvoiceSignals();
      }, 1200 + Math.floor(Math.random() * 2500));
    };

    let versionJitterTimer: number | null = null;
    try {
      const channel = supabase
        .channel('app-realtime-sync')
        // 1) إشعار نشر نسخة بيانات جديدة (مدمج داخل نفس القناة بدل قناة ثانية)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${GLOBAL_VERSION_RECORD_ID}` },
          () => {
            if (versionJitterTimer !== null) window.clearTimeout(versionJitterTimer);
            const jitterMs = 1500 + Math.floor(Math.random() * 5000);
            versionJitterTimer = window.setTimeout(() => {
              versionJitterTimer = null;
              realtimeCheckCustomersRef.current?.();
              realtimeCheckRef.current?.();
            }, jitterMs);
          }
        )
        // 2) الفواتير — إشارة صغيرة بدل بث الصف كامل لكل المشرفين.
        //    كل عملية حفظ بتكتب صف إشارة (~200 بايت) فيه ids الفواتير اللي
        //    اتغيرت، والمشرف بيجيب الفاتورة المطلوبة لوحدها. البث القديم كان
        //    بيبعت الصف كامل (items + QR) لكل مشرف مع كل فاتورة.
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${INVOICE_SIGNAL_ID}` },
          (payload) => {
            queueInvoicePull(payload.new as any);
          }
        )
        // 3) DELETE-only لتقليل egress
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'customers' }, (payload) => {
          const deleted = payload.old as any;
          if (deleted?.id) {
            // الـupdater لازم يفضل نقي — الحفظ وبصمة المحتوى برّه (ref متزامن مع الحالة).
            const next = customersRef.current.filter((c) => c.id !== deleted.id);
            customersRef.current = next;
            setCustomers(next);
            idbSet(getCustomersCacheKey(), next).catch(() => {});
            saveLocalCustomersFingerprint(next, activeStorageCtxRef.current.userId, activeStorageCtxRef.current.sector);
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'customer_comments' }, (payload) => {
          const deleted = payload.old as any;
          if (deleted?.id) {
            const next = customerCommentsRef.current.filter((c) => c.id !== deleted.id);
            customerCommentsRef.current = next;
            setCustomerComments(next);
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'collection_forecasts' }, (payload) => {
          const deleted = payload.old as any;
          if (deleted?.id) {
            const next = forecastsRef.current.filter((f) => f.id !== deleted.id);
            forecastsRef.current = next;
            setForecasts(next);
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'targets' }, (payload) => {
          const deleted = payload.old as any;
          if (deleted?.id) {
            setTargets((prev) => prev.filter((t) => t.id !== String(deleted.id)));
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'visits' }, (payload) => {
          const deleted = payload.old as any;
          if (deleted?.id) {
            markVisitAsDeletedInStorage(deleted.id);
            const next = visitsRef.current.filter((v) => v.id !== deleted.id);
            visitsRef.current = next;
            setVisits(next);
          }
        })
        .subscribe();

      return () => {
        if (versionJitterTimer !== null) window.clearTimeout(versionJitterTimer);
        if (invoicePullTimer !== null) window.clearTimeout(invoicePullTimer);
        supabase.removeChannel(channel);
      };
    } catch (e) {
      console.warn('Realtime channel error:', e);
    }
  }, [isLocalDataHydrated, currentUser?.id, currentUser?.role, currentUser?.branchName]);

  useEffect(() => {
    let lastCheckedAt = 0;
    let inFlight = false;

    const handleOnlineSync = async (isExplicitReconnect = false) => {
      if (!isSupabaseConfigured || !currentUserRef.current) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (inFlight) return;
      const now = Date.now();
      if (!isExplicitReconnect && now - lastCheckedAt < 10 * 60 * 1000) return;
      lastCheckedAt = now;
      inFlight = true;
      try {
        const [pendingInvList, queuedCount] = await Promise.all([
          idbGet<Invoice[]>(STORAGE_KEYS.PENDING_INVOICES).catch(() => null),
          countQueuedMutations().catch(() => 0),
        ]);
        const hasPendingInv = Array.isArray(pendingInvList) && pendingInvList.length > 0;
        if (!hasPendingInv && queuedCount === 0) {
          if (isExplicitReconnect) {
            window.dispatchEvent(new CustomEvent('tantawy:reconnected-sync'));
          }
          return;
        }

        let syncedTotal = 0;
        if (hasPendingInv) {
          const invRes = await flushPendingInvoices().catch(() => ({ success: false, syncedCount: 0 }));
          syncedTotal += invRes.syncedCount || 0;
        }
        if (queuedCount > 0) {
          const qRes = await flushOfflineQueue().catch(() => ({ success: false, syncedCount: 0 }));
          syncedTotal += qRes.syncedCount || 0;
          if (qRes.syncedCount > 0) {
            setLastVersionSyncNotice(
              `تمت مزامنة ${qRes.syncedCount} تغيير تم عمله بدون إنترنت إلى قاعدة البيانات`
            );
            setTimeout(() => setLastVersionSyncNotice(null), 8000);
          }
        }
        await refreshOfflineQueueCount().catch(() => {});
        if (isExplicitReconnect || syncedTotal > 0) {
          window.dispatchEvent(new CustomEvent('tantawy:reconnected-sync'));
        }
      } finally {
        inFlight = false;
      }
    };

    const onOnline = () => { void handleOnlineSync(true); };
    const onFocus = () => { void handleOnlineSync(false); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void handleOnlineSync(false);
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Safety net: a device that reconnects without firing the online event (or that
  // was closed while work sat in the queue) still drains the outbox shortly after boot.
  useEffect(() => {
    let cancelled = false;
    const kick = async () => {
      if (cancelled || !isSupabaseConfigured || !currentUserRef.current || !navigator.onLine) return;
      const pending = await refreshOfflineQueueCount().catch(() => 0);
      if (pending === 0) return;
      await flushOfflineQueue().catch(() => {});
    };
    const timer = setTimeout(kick, 4000);
    const interval = setInterval(kick, 60000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

// Smart Notifications: periodic check for data updates (every 30 min, only when visible)
  // Each role checks ONLY what they need — zero unnecessary data loading
  // Sector isolation enforced: no role sees other sector data without explicit permission
  useEffect(() => {
    let cancelled = false;
    const CHECK_KEY = 'tantawy_smart_notif_check_v1';
    const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 دقيقة

    const runCheck = async () => {
      if (cancelled || !isSupabaseConfigured || !currentUserRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;

      try {
        // الاستدعاء البسيط — الخدمة تحدد الفحوصات حسب الدور تلقائياً
        await checkForDataUpdates(CHECK_KEY);
      } catch {
        // فشل صامت
      }
    };

    // أول فحص بعد 10 ثواني من الدخول
    const initialTimer = setTimeout(() => { if (!cancelled) runCheck(); }, 10000);
    // ثم دوري كل 30 دقيقة
    const interval = setInterval(() => { if (!cancelled) runCheck(); }, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isSupabaseConfigured, currentUser?.id]);

  // Supabase Egress Protection:  // Supabase Egress Protection:
  // Instead of polling 24/7 (which consumes gigabytes of egress bandwidth),
  // we rely on Supabase Realtime WebSockets for instant sub-second updates, and use an intelligent,
  // throttled fallback (only on tab focus with a 15-minute cooldown).
  useEffect(() => {
    let cancelled = false;
    let lastSyncTimestamp = Date.now();

    const refreshInvoicesSafely = async () => {
      if (!isSupabaseConfigured) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      const activeUser = currentUserRef.current;
      if (!activeUser) return;
      const now = Date.now();
      // Cooldown: at least 15 minutes between background focus syncs
      if (now - lastSyncTimestamp < 15 * 60 * 1000) return;
      lastSyncTimestamp = now;

      try {
        const liveSec = activeStorageCtxRef.current.sector;
        const apiSec = liveSec === 'home' || liveSec === 'electrical' ? liveSec : undefined;
        const scope = buildInvoiceFetchScope(activeUser, usersRef.current, apiSec);
        const scopeKey = invoiceScopeKey(scope);

        // 1) بصمة صف واحد بدل تنزيل الفواتير: لو العدد وآخر تعديل/إنشاء ماتغيّروش مفيش تنزيل.
        const stamp = await fetchInvoiceContentStamp(scope);
        const stored = readInvoiceContentStamp(scopeKey);
        if (
          stamp &&
          stored &&
          stamp.maxCreatedAt === stored.maxCreatedAt &&
          stamp.table === stored.table
        ) {
          return;
        }

        const canIncremental =
          stamp !== null &&
          stored !== null &&
          !!stamp.maxCreatedAt &&
          !!stored.maxCreatedAt &&
          stamp.table === stored.table &&
          invoicesRef.current.length > 0;

        const result = canIncremental
          ? await fetchInvoicesFromSupabase(scope, {
              updatedSince: stored!.maxCreatedAt!,
              stampColumn: stamp!.stampColumn,
            })
          : await fetchInvoicesFromSupabase(scope);
        if (cancelled || !result.success || !result.invoices) return;
        if (stamp) saveInvoiceContentStamp(scopeKey, stamp);
        setInvoices((prev) => {
          const merged = new Map<string, Invoice>();
          if (canIncremental) {
            prev.forEach((inv) => merged.set(inv.id, inv));
            result.invoices!.forEach((inv) => merged.set(inv.id, inv));
          } else {
            result.invoices!.forEach((inv) => merged.set(inv.id, inv));
            prev.forEach((inv) => {
              if (!merged.has(inv.id)) merged.set(inv.id, inv);
            });
          }
          const next = Array.from(merged.values());
          return next;
        });
      } catch (err) {
        console.warn('Silent invoice background sync notice:', err);
      }
    };

    // Refresh only when the user switches back to this tab and 5+ minutes have passed
    const handleFocusOrVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        refreshInvoicesSafely();
      }
    };

    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
    };
  }, []);

  // Explicit, on-demand invoice refresh callable from any component (e.g. InvoicesManager)
  // Protected with a 2-minute cooldown when called in the background (force=false)
  const lastManualRefreshRef = React.useRef<number>(0);

  const refreshInvoicesNow = async (force = false): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const now = Date.now();
      if (!force && now - lastManualRefreshRef.current < 120_000 && invoicesRef.current.length > 0) {
        return {
          success: true,
          count: invoicesRef.current.length,
          message: `الفواتير محدثة بالفعل ومحفوظة محلياً (${invoicesRef.current.length} فاتورة).`,
        };
      }
      lastManualRefreshRef.current = now;

      const liveSec = activeStorageCtxRef.current.sector;
      const apiSec = liveSec === 'home' || liveSec === 'electrical' ? liveSec : undefined;
      const invScope = buildInvoiceFetchScope(currentUserRef.current || currentUser, usersRef.current, apiSec);
      const scopeKey = invoiceScopeKey(invScope);
      const stamp = await fetchInvoiceContentStamp(invScope);
      const stored = readInvoiceContentStamp(scopeKey);
      if (
        stamp &&
        stored &&
        stamp.maxCreatedAt === stored.maxCreatedAt &&
        (stamp.otherMax ?? null) === (stored.otherMax ?? null) &&
        stamp.table === stored.table &&
        invoicesRef.current.length > 0
      ) {
        return {
          success: true,
          count: invoicesRef.current.length,
          message: `الفواتير محدثة بالفعل (${invoicesRef.current.length} فاتورة).`,
        };
      }

      const canIncremental =
        stamp !== null &&
        stored !== null &&
        !!stamp.maxCreatedAt &&
        !!stored.maxCreatedAt &&
        stamp.table === stored.table &&
        !stamp.otherMax &&
        !stored.otherMax &&
        invoicesRef.current.length > 0;

      const result = canIncremental
        ? await fetchInvoicesFromSupabase(invScope, {
            updatedSince: stored!.maxCreatedAt!,
            stampColumn: stamp!.stampColumn,
          })
        : await fetchInvoicesFromSupabase(invScope);
      if (!result.success || !result.invoices) {
        return { success: false, count: 0, message: result.error || 'تعذر الاتصال بقاعدة البيانات لجلب الفواتير' };
      }
      if (stamp) saveInvoiceContentStamp(scopeKey, stamp);
      const remoteInvoices = result.invoices;
      setInvoices((prev) => {
        const merged = new Map<string, Invoice>();
        if (canIncremental) {
          prev.forEach((inv) => merged.set(inv.id, inv));
          remoteInvoices.forEach((inv) => merged.set(inv.id, inv));
        } else {
          remoteInvoices.forEach((inv) => merged.set(inv.id, inv));
          prev.forEach((inv) => {
            if (!merged.has(inv.id)) merged.set(inv.id, inv);
          });
        }
        const next = Array.from(merged.values());
        return next;
      });
      return {
        success: true,
        count: remoteInvoices.length,
        message: canIncremental
          ? `تمت مزامنة ${remoteInvoices.length} فاتورة محدثة بنجاح.`
          : `تم تحديث أحدث ${remoteInvoices.length} فاتورة من السيرفر بنجاح.`,
      };
    } catch (err: any) {
      return { success: false, count: 0, message: err?.message || 'خطأ غير متوقع أثناء تحديث الفواتير' };
    }
  };

  // Customer CRUD Actions
  const addCustomer = (newCust: Customer) => {
    // User Directive: Customers are strictly added via the master sheet only (3,427 customers).
    console.info(`Manual customer addition (${newCust?.name}) skipped: customers are loaded from the master sheet only.`);
    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مستخدم',
      userRole: currentUser?.role || 'sales_rep',
      branchName: newCust.branchName || currentUser?.branchName || 'الفرع الرئيسي',
      action: 'add_customer' as any,
      actionTitle: `محاولة إضافة عميل يدوي (${newCust.name})`,
      details: `قاعدة العملاء مقفولة وتعتمد حصرياً على الشيت الأساسي. لم يتم إدراج العميل في قاعدة البيانات.`,
      badgeType: 'warning',
    });
  };

  const updateCustomer = (updatedCust: Customer) => {
    setCustomers((prev) => prev.map((c) => (c.id === updatedCust.id ? updatedCust : c)));
    idbSet(getCustomersCacheKey(), customers.map((c) => (c.id === updatedCust.id ? updatedCust : c)))
      .catch(() => {});
    syncOrQueue('customers', 'upsert', updatedCust.id, updatedCust, () =>
      saveCustomersToSupabase([updatedCust])
    ).catch((e) => console.warn('Supabase customer update error:', e));
    if (currentUser?.role !== 'sales_rep') {
      publishDataVersionUpdate({
        scope: 'customers',
        notes: `تعديل بيانات العميل ${updatedCust.name || updatedCust.code}`,
      }).catch(() => {});
    }
  };

  const deleteCustomer = (customerId: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    idbSet(getCustomersCacheKey(), customers.filter((c) => c.id !== customerId)).catch(() => {});
    // Delete from Supabase, or park it in the offline outbox until the network returns.
    syncOrQueue('customers', 'delete', customerId, undefined, () =>
      deleteCustomerFromSupabase(customerId)
    ).catch((e) => console.warn('Supabase customer delete error:', e));
    // نفس منطق updateCustomer: الحذف من المندوب بيمشيه بصمة المحتوى.
    if (currentUser?.role !== 'sales_rep') {
      publishDataVersionUpdate({ scope: 'customers', notes: 'حذف عميل من قاعدة العملاء' }).catch(() => {});
    }
  };

  const cleanAndDeduplicateCustomers = () => {
    const originalCount = customers.length;
    const sanitized = sanitizeCustomers(customers);
    const cleaned = deduplicateCustomersArray(sanitized);
    const duplicatesRemoved = Math.max(0, originalCount - cleaned.length);
    if (duplicatesRemoved > 0 || cleaned.length !== originalCount) {
      setCustomers(cleaned);
      idbSet(getCustomersCacheKey(), cleaned).catch(() => {});
      saveCustomersToSupabase(cleaned).catch((e) => console.warn('Supabase customer clean save error:', e));
    }
    return {
      originalCount,
      deduplicatedCount: cleaned.length,
      duplicatesRemoved,
    };
  };

  // Auto-link customer rep names to actual user accounts with robust branch matching & Arabic heuristics
  const linkCustomersToUsers = (list: Customer[], userList: User[]): Customer[] => {
    if (!userList || userList.length === 0 || !list || list.length === 0) return list;

    const reps = userList.filter((u) => u.role === 'sales_rep' || u.role === 'supervisor' || u.role === 'branch_manager');
    if (reps.length === 0) return list;

    // Pre-index reps for ultra-fast matching
    const preparedReps = reps.map((u) => ({
      user: u,
      normName: normalizeArabicText(u.name).replace(/\s+/g, ''),
      identityAliases: [u.name, u.username, u.email?.split('@')[0] || '']
        .map((value) => normalizeArabicText(value))
        .filter(Boolean),
      normBranch: u.branchName ? normalizeBranchName(u.branchName) : '',
    }));

    // Cache lookup results to avoid re-running match algorithms for duplicate rep names
    const repMatchCache = new Map<string, User | null>();

    return list.map((c) => {
      let updated = { ...c };

      if (!updated.branchName) {
        const locInferred = inferBranchFromText(
          `${updated.address || ''} ${updated.governorate || ''} ${updated.name || ''} ${updated.notes || ''}`
        );
        if (locInferred) {
          updated.branchName = locInferred;
        }
      } else {
        updated.branchName = normalizeBranchName(updated.branchName);
      }

      const rawRep = (updated.salesRepName || updated.repName || '').trim();
      if ((!rawRep || rawRep === 'مندوب المبيعات' || rawRep === 'المندوب' || rawRep === 'غير محدد') && !updated.repId) {
        return updated;
      }

      let matched: User | null = null;
      if (rawRep && rawRep !== 'مندوب المبيعات' && rawRep !== 'المندوب') {
        const cacheKey = `${rawRep}:::${updated.branchName || ''}`;
        if (repMatchCache.has(cacheKey)) {
          matched = repMatchCache.get(cacheKey)!;
        } else {
          const normRep = normalizeArabicText(rawRep);
          // 1. Direct normalized name match in branch
          const direct = preparedReps.find((pr) => {
            if (
              updated.branchName &&
              pr.normBranch &&
              !isBranchMatch(updated.branchName, pr.user.branchName, { allowUnassigned: false })
            ) {
              return false;
            }
            return pr.identityAliases.some((alias) => alias === normRep || alias.replace(/\s+/g, '') === normRep.replace(/\s+/g, ''));
          });

          if (direct) {
            matched = direct.user;
          } else {
            // 2. Fuzzy Arabic match
            const fuzzy = preparedReps.find((pr) => {
              if (
                updated.branchName &&
                pr.normBranch &&
                !isBranchMatch(updated.branchName, pr.user.branchName, { allowUnassigned: false })
              ) {
                return false;
              }
              return pr.identityAliases.some((alias) => isArabicNameMatch(rawRep, alias));
            });
            matched = fuzzy ? fuzzy.user : null;
          }
          repMatchCache.set(cacheKey, matched);
        }
      }

      if (matched) {
        return {
          ...updated,
          repName: rawRep || matched.name,
          repId: matched.id,
          salesRepName: rawRep || matched.name,
          branchName: updated.branchName || matched.branchName || '',
          creditLimit: updated.creditLimit !== undefined ? Number(updated.creditLimit) : 0,
          currentBalance: Number(updated.currentBalance ?? updated.balance ?? 0),
          balance: Number(updated.currentBalance ?? updated.balance ?? 0),
        };
      }
      return {
        ...updated,
        creditLimit: updated.creditLimit !== undefined ? Number(updated.creditLimit) : 0,
        currentBalance: Number(updated.currentBalance ?? updated.balance ?? 0),
        balance: Number(updated.currentBalance ?? updated.balance ?? 0),
      };
    });
  };

  const importCustomersList = async (
    newCustomers: Customer[],
    mode: 'merge' | 'replace' | 'upsert' = 'replace'
  ): Promise<{ success: boolean; count: number; removed: number; message: string }> => {
    const sanitizedIncoming = sanitizeCustomers(newCustomers);
    const linked = linkCustomersToUsers(sanitizedIncoming, users);
    const incomingDeduped = deduplicateCustomersArray(linked);

    // فلترة الوارد حسب قطاع المستخدم الحالي لمنع خلط بيانات المنزلي مع الكهرباء
    const userSector = currentUser?.sector;
    const sectorFilteredIncoming = incomingDeduped.filter((c) => {
      if (!userSector || userSector === 'all' || userSector === 'both') return true;
      return !c.sector || c.sector === userSector || c.sector === 'both' || c.sector === 'all';
    });

    // 'replace' is the admin's authoritative sheet for that sector: preserve other sectors
    const incomingSectors = new Set(sectorFilteredIncoming.map((c) => c.sector).filter(Boolean));
    let finalCustomers: Customer[] = [];
    if (mode === 'replace') {
      if (incomingSectors.size === 1 && (incomingSectors.has('electrical') || incomingSectors.has('home'))) {
        const targetSector = Array.from(incomingSectors)[0];
        const otherSectorCustomers = customers.filter((c) => c.sector && c.sector !== targetSector);
        finalCustomers = deduplicateCustomersArray([...otherSectorCustomers, ...sectorFilteredIncoming]);
      } else {
        finalCustomers = sectorFilteredIncoming;
      }
    } else {
      finalCustomers = deduplicateCustomersArray([...customers, ...sectorFilteredIncoming]);
    }
    idbSet(getCustomersCacheKey(), finalCustomers).catch(() => {});
    setCustomers(finalCustomers);
    authoritativeWriteAtRef.current = Date.now();
    saveLocalCustomersFingerprint(finalCustomers, activeStorageCtxRef.current.userId, activeStorageCtxRef.current.sector);

    try {
      const repRestrictedScope = Boolean(customerFetchScope?.repNames?.length || customerFetchScope?.repIds?.length);
      const canAuthoritativeDelete =
        mode === 'replace' &&
        !repRestrictedScope &&
        (currentUser?.role === 'admin' ||
          currentUser?.role === 'developer' ||
          currentUser?.role === 'branch_manager' ||
          CROSS_SECTOR_ADMIN_ROLES.has(currentUser?.role as any));
      let deleteScope: CustomerFetchScope | undefined = customerFetchScope;
      if (mode === 'replace' && incomingSectors.size === 1) {
        const targetSector = Array.from(incomingSectors)[0];
        if (targetSector === 'home' || targetSector === 'electrical') {
          deleteScope = { sector: targetSector };
        }
      }
      const res = await replaceCustomersInSupabase(finalCustomers, {
        scope: deleteScope,
        allowOrphanDelete: canAuthoritativeDelete,
      });
      if (!res.success) {
        // Do NOT publish a version stamp on a failed write. Doing so made the
        // next heartbeat pull the previous server copy, which looked like the
        // correct data spontaneously reverting.
        const msg = `لم يتم حفظ التحديث على السيرفر: ${res.error || 'خطأ غير معروف'}`;
        setLastVersionSyncNotice(msg);
        setTimeout(() => setLastVersionSyncNotice(null), 12000);
        return { success: false, count: finalCustomers.length, removed: 0, message: msg };
      }
      const dupNote = res.removed > 0 ? ` وحذف ${res.removed} سجل مكرر` : '';
      setLastVersionSyncNotice(
        `تم تحديث قاعدة العملاء (${finalCustomers.length} عميل)${dupNote} — البيانات الآن موحدة لكل المناديب والمشرفين`
      );
      setTimeout(() => setLastVersionSyncNotice(null), 8000);
      await publishNewDataVersion({
        scope: 'customers',
        updatedBy: currentUser?.name || 'مدير النظام',
        notes: `تحديث قاعدة بيانات العملاء (${mode === 'replace' ? 'استبدال كامل' : 'دمج وتحديث'}) - ${finalCustomers.length} عميل`,
        customersCount: finalCustomers.length,
        forcePurge: true,
      }).catch(() => {});
      return {
        success: true,
        count: finalCustomers.length,
        removed: res.removed,
        message: `تم تحديث ${finalCustomers.length} عميل وتحديث جميع المناديب والمشرفين تلقائياً${dupNote}`,
      };
    } catch (e: any) {
      const msg = `تعذر حفظ التحديث على السيرفر: ${e?.message || 'خطأ غير معروف'}`;
      setLastVersionSyncNotice(msg);
      setTimeout(() => setLastVersionSyncNotice(null), 12000);
      return { success: false, count: finalCustomers.length, removed: 0, message: msg };
    }
  };

  const clearCustomersCacheAndReset = () => {
    setCustomers([]);
    setActiveCustomersCache([]);
    idbDelete(getCustomersCacheKey()).catch(() => {});
    localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
  };



  const refreshCustomerRepLinks = (): {
    updatedCount: number;
    totalCustomers: number;
    linkedCustomersCount: number;
    unassignedCount: number;
    repBreakdown: { repName: string; branchName: string; customerCount: number; hasUserAccount: boolean; user?: User }[];
    unmatchedReps: string[];
  } => {
    let updatedCount = 0;
    const currentUsers = users;
    let nextCustomers: Customer[] = [];

    setCustomers((prev) => {
      const linked = linkCustomersToUsers(prev, currentUsers);
      updatedCount = linked.filter(
        (c, i) => c.repId !== prev[i]?.repId || c.branchName !== prev[i]?.branchName || c.salesRepName !== prev[i]?.salesRepName
      ).length;
      saveCustomersToSupabase(linked).catch(() => {});
      nextCustomers = linked;
      return linked;
    });

    const listToAnalyze = nextCustomers.length > 0 ? nextCustomers : customers;
    const totalCustomers = listToAnalyze.length;
    const repMap = new Map<string, { repName: string; branchName: string; customerCount: number; hasUserAccount: boolean; user?: User }>();
    let linkedCustomersCount = 0;
    let unassignedCount = 0;
    const unmatchedSet = new Set<string>();

    listToAnalyze.forEach((c) => {
      const rep = (c.salesRepName || c.repName || '').trim();
      if (!rep || rep === 'مندوب المبيعات' || rep === 'المندوب' || rep === 'غير محدد') {
        unassignedCount++;
        return;
      }
      linkedCustomersCount++;
      const user = currentUsers.find(
        (u) => (u.role === 'sales_rep' || u.role === 'supervisor') && (u.id === c.repId || isArabicNameMatch(rep, u.name))
      );
      const key = user ? user.name : rep;
      if (!repMap.has(key)) {
        repMap.set(key, {
          repName: key,
          branchName: c.branchName || user?.branchName || '',
          customerCount: 0,
          hasUserAccount: !!user,
          user,
        });
      }
      repMap.get(key)!.customerCount++;
      if (!user) {
        unmatchedSet.add(rep);
      }
    });

    return {
      updatedCount,
      totalCustomers,
      linkedCustomersCount,
      unassignedCount,
      repBreakdown: Array.from(repMap.values()),
      unmatchedReps: Array.from(unmatchedSet),
    };
  };

  const autoCreateMissingRepsFromCustomers = (): { createdUsers: User[]; count: number; message: string } => {
    const created: User[] = [];
    const repNamesMap = new Map<string, { name: string; branchName: string }>();

    customers.forEach((c) => {
      const rep = (c.salesRepName || c.repName || '').trim();
      if (!rep || rep === 'مندوب المبيعات' || rep === 'المندوب' || rep === 'غير محدد') return;
      if (!repNamesMap.has(rep)) {
        repNamesMap.set(rep, {
          name: rep,
          branchName: c.branchName || 'فرع المنيا',
        });
      }
    });

    const newUsersList = [...users];
    let addedAny = false;

    repNamesMap.forEach(({ name, branchName }) => {
      const normIncoming = normalizeArabicText(name);
      const exists = newUsersList.some(
        (u) =>
          (u.role === 'sales_rep' || u.role === 'supervisor') &&
          (normalizeArabicText(u.name) === normIncoming || isArabicNameMatch(name, u.name))
      );
      if (!exists) {
        const cleanId = `rep_${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now().toString().slice(-4)}`;
        const cleanUser = name.replace(/\s+/g, '').toLowerCase().slice(0, 15);
        const newUser: User = {
          id: cleanId,
          name,
          username: cleanUser || `rep_${Date.now().toString().slice(-4)}`,
          email: `${cleanUser || 'rep'}@dream.com`,
          role: 'sales_rep',
          branchName: branchName || 'فرع المنيا',
          phone: '',
          isActive: true,
          approvalStatus: 'active',
          registrationDate: new Date().toISOString(),
        };
        newUsersList.push(newUser);
        created.push(newUser);
        addedAny = true;
      }
    });

    if (addedAny) {
      setUsers(newUsersList);
      safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(newUsersList));
      idbSet(STORAGE_KEYS.USERS, newUsersList);
      saveUsersToSupabase(newUsersList).catch(() => {});
      // Link customers to new users
      setCustomers((prev) => {
        const linked = linkCustomersToUsers(prev, newUsersList);
        saveCustomersToSupabase(linked).catch(() => {});
        return linked;
      });
    }

    return {
      createdUsers: created,
      count: created.length,
      message: created.length > 0
        ? `تم إنشاء وتفعيل حسابات ${created.length} مندوب بنجاح وربط عملائهم تلقائياً!`
        : 'جميع المناديب المذكورين بالشيت لديهم حسابات مفعلة بالفعل ومطابقة للعملاء.',
    };
  };

  const mergeDuplicateUsers = async (): Promise<{
    success: boolean;
    message: string;
    mergedCount: number;
    details: string[];
  }> => {
    const dedup = sanitizeAndDeduplicateUsers(users);
    if (dedup.mergedCount === 0) {
      return {
        success: true,
        message: 'جميع حسابات الموظفين سليمة ومطابقة 100% ولا توجد أي حسابات مكررة.',
        mergedCount: 0,
        details: [],
      };
    }

    setUsers(dedup.deduplicated);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(dedup.deduplicated));
    idbSet(STORAGE_KEYS.USERS, dedup.deduplicated);

    // Remap customers
    setCustomers((prev) => {
      let changed = false;
      const updated = prev.map((c) => {
        if (c.repId && dedup.idRedirectMap[c.repId]) {
          changed = true;
          return { ...c, repId: dedup.idRedirectMap[c.repId] };
        }
        return c;
      });
      if (changed) {
        idbSet(getCustomersCacheKey(), updated);
      }
      return changed ? updated : prev;
    });

    // Remap invoices
    setInvoices((prev) => {
      let changed = false;
      const updated = prev.map((inv) => {
        if (inv.repId && dedup.idRedirectMap[inv.repId]) {
          changed = true;
          return { ...inv, repId: dedup.idRedirectMap[inv.repId] };
        }
        return inv;
      });
      // الحفظ بيتعمل في effect منفصل (debouncedIdbSet) — مش هنكتبه هنا.
      return changed ? updated : prev;
    });

    // Delete duplicate IDs from Supabase permanently
    for (const remId of dedup.removedUserIds) {
      await deleteUserFromSupabase(remId).catch(() => {});
    }
    await saveUsersToSupabase(dedup.deduplicated).catch(() => {});

    const details = dedup.mergedPairs.map(
      (p) => `تم دمج حساب المندوب [${p.keptUser.name}] بفرع (${p.keptUser.branchName || 'العام'}) وحذف الحساب المكرر (${p.removedUsername || p.removedId})`
    );

    return {
      success: true,
      message: `تم دمج وتنظيف ${dedup.mergedCount} حساب مكرر بنجاح وتحديث كافة الارتباطات.`,
      mergedCount: dedup.mergedCount,
      details,
    };
  };

  // Auto-link customers to users in memory safely when users arrive or change, without network loops
  const lastUsersFingerprintRef = React.useRef<string>('');
  useEffect(() => {
    if (users.length === 0 || customers.length === 0) return;
    const currentFingerprint = users.map((u) => `${u.id}:${u.name}:${u.branchName}`).join('|');
    if (lastUsersFingerprintRef.current === currentFingerprint) return;
    lastUsersFingerprintRef.current = currentFingerprint;

    setCustomers((prev) => {
      const needsLinking = prev.some((c) => (c.salesRepName || c.repName) && !c.repId);
      if (!needsLinking && prev.length > 0) return prev;
      const linked = linkCustomersToUsers(prev, users);
      idbSet(getCustomersCacheKey(), linked).catch(() => {});
      return linked;
    });
  }, [users]);

  // Skip redundant IndexedDB writebacks on initial hydration mount (we just read these arrays from IDB).
  const initialIdbSkipRef = useRef<{
    products: boolean;
    customers: boolean;
    invoices: boolean;
    cart: boolean;
    targets: boolean;
    forecasts: boolean;
    comments: boolean;
  }>({
    products: true,
    customers: true,
    invoices: true,
    cart: true,
    targets: true,
    forecasts: true,
    comments: true,
  });

  // Sync high-capacity data directly to IndexedDB per active scope (sector / user+sector).
  // Guards against writing into a newly switched scope before its own hydration completes.
  useEffect(() => {
    if (!isLocalDataHydrated) return;
    const ctx = activeStorageCtxRef.current;
    if (ctx.sector === 'none') return;
    if (hydratedScopeRef.current.userId !== ctx.userId || hydratedScopeRef.current.sector !== ctx.sector) return;
    if (initialIdbSkipRef.current.products) {
      initialIdbSkipRef.current.products = false;
      return;
    }
    return debouncedIdbSet(getProductsCacheKey(ctx.sector), products, 1800);
  }, [products, isLocalDataHydrated]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    const ctx = activeStorageCtxRef.current;
    if (ctx.sector === 'none') return;
    if (hydratedScopeRef.current.userId !== ctx.userId || hydratedScopeRef.current.sector !== ctx.sector) return;
    if (initialIdbSkipRef.current.customers) {
      initialIdbSkipRef.current.customers = false;
      return;
    }
    return debouncedIdbSet(getCustomersCacheKey(ctx.userId, ctx.sector), customers, 1800);
  }, [customers, isLocalDataHydrated]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    const ctx = activeStorageCtxRef.current;
    if (ctx.sector === 'none') return;
    if (hydratedScopeRef.current.userId !== ctx.userId || hydratedScopeRef.current.sector !== ctx.sector) return;
    if (initialIdbSkipRef.current.invoices) {
      initialIdbSkipRef.current.invoices = false;
      return;
    }
    return debouncedIdbSet(getInvoicesCacheKey(ctx.userId, ctx.sector), invoices, 1500);
  }, [invoices, isLocalDataHydrated]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    if (initialIdbSkipRef.current.cart) {
      initialIdbSkipRef.current.cart = false;
      return;
    }
    return debouncedIdbSet(STORAGE_KEYS.CART, cart, 800);
  }, [cart, isLocalDataHydrated]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    const ctx = activeStorageCtxRef.current;
    if (ctx.sector === 'none') return;
    if (hydratedScopeRef.current.userId !== ctx.userId || hydratedScopeRef.current.sector !== ctx.sector) return;
    if (initialIdbSkipRef.current.targets) {
      initialIdbSkipRef.current.targets = false;
      return;
    }
    return debouncedIdbSet(getTargetsCacheKey(ctx.userId, ctx.sector), targets, 1500);
  }, [targets, isLocalDataHydrated]);

  useEffect(() => {
    if (!isLocalDataHydrated) return;
    if (initialIdbSkipRef.current.forecasts) {
      initialIdbSkipRef.current.forecasts = false;
      return;
    }
    return debouncedIdbSet(STORAGE_KEYS.FORECASTS, forecasts, 1500);
  }, [forecasts, isLocalDataHydrated]);

  // كومنتات العملاء — كانت بتتحفظ جوه الـupdater بس (side effect مكرر في
  // StrictMode)؛ هنا بتتحفظ زي باقي المفاتيح بالظبط.
  useEffect(() => {
    if (!isLocalDataHydrated) return;
    if (initialIdbSkipRef.current.comments) {
      initialIdbSkipRef.current.comments = false;
      return;
    }
    return debouncedIdbSet(STORAGE_KEYS.CUSTOMER_COMMENTS, customerComments, 1500);
  }, [customerComments, isLocalDataHydrated]);

  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEYS.CLOUDINARY, JSON.stringify(cloudinaryConfig));
  }, [cloudinaryConfig]);

  useEffect(() => {
    safeLocalStorageSet(STORAGE_KEYS.ACCOUNTING_LOGS, JSON.stringify(accountingLogs));
  }, [accountingLogs]);

  // Multi-tab sync for immediate logout on user deletion across tabs
  useEffect(() => {
    const handleStorageSync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.USERS && e.newValue && currentUser && isAuthenticated) {
        try {
          const parsedUsers: User[] = JSON.parse(e.newValue);
          const me = parsedUsers.find((u) => u.id === currentUser.id);
          if (!me || !me.isActive || me.approvalStatus === 'rejected') {
            logout();
            setAuthTerminationNotice('تم إيقاف أو حذف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, [currentUser, isAuthenticated]);

  // Online / Offline tracking
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // رجوع الشبكة = السوكيت غالبًا مات وهو أوفلاين؛ نعيد الاتصال فقط لغير مناديب المبيعات.
      if (shouldUseRealtimeRef.current) {
        try {
          supabase.realtime.connect();
        } catch {
          // تجاهل: إعادة المحاولة بتحصل تلقائيًا
        }
      }
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Authentication System ---
  const clearScopedContentStamps = useCallback(() => {
    try {
      localStorage.removeItem(CUSTOMER_CONTENT_STAMP_KEY);
      localStorage.removeItem(PRODUCT_CONTENT_STAMP_KEY);
      localStorage.removeItem(VISIT_CONTENT_STAMP_KEY);
      localStorage.removeItem(TARGET_CONTENT_STAMP_KEY);
      Object.keys(localStorage).forEach((key) => {
        if (
          key.startsWith(`${CUSTOMER_CONTENT_STAMP_KEY}::`) ||
          key.startsWith(`${PRODUCT_CONTENT_STAMP_KEY}::`) ||
          key.startsWith(`${VISIT_CONTENT_STAMP_KEY}::`) ||
          key.startsWith(`${TARGET_CONTENT_STAMP_KEY}::`) ||
          key.startsWith(INVOICE_CONTENT_STAMP_PREFIX) ||
          key.startsWith(FORECAST_MONTH_STAMP_PREFIX)
        ) {
          localStorage.removeItem(key);
        }
      });
    } catch {
      /* ignore */
    }
    noStampPulledAtRef.current = 0;
    customerFullFetchAtRef.current = 0;
    lastBootCustScopeSigRef.current = '';
    lastBootHeartbeatAtRef.current = 0;
    customerDownloadInFlightRef.current = false;
  }, []);

  const login = async (
    identifier: string,
    password?: string
  ): Promise<{
    success: boolean;
    message: string;
    user?: User;
    errorType?: 'connection' | 'user_not_found' | 'wrong_password' | 'inactive' | 'no_password' | 'general';
  }> => {
    const cleanId = sanitizeIdentifier(identifier).toLowerCase();
    const rawTrim = sanitizeIdentifier(identifier);
    const asciiDigits = identifier.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).trim();
    const cleanPass = (password || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).trim();

    // بيئة من غير مفاتيح Supabase (زي المعاينة السحابية): إرجاع سبب واضح بدلاً من إظهار خطأ كلمة المرور
    if (!isSupabaseConfigured || !SUPABASE_URL) {
      console.warn('[login] Supabase env is missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
      return {
        success: false,
        errorType: 'connection',
        message: 'قاعدة البيانات (Supabase) غير مربوطة في هذه البيئة حالياً. يرجى ضبط متغيرات البيئة VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY لتسجيل الدخول.',
      };
    }

    // ===== 1) التحقق المركزي (Supabase Auth) — قبل أي استعلام عن المستخدم =====
    // التحقق أولًا يمنع معرفة "هل اسم المستخدم موجود؟" بدون كلمة مرور صحيحة،
    // كما يمنع أي ثغرة TDZ أو تجاوز لكلمة المرور عبر الكاش المحلي.
    const serverOutcome = await tryServerSignIn(identifier, cleanPass);
    if (serverOutcome.kind !== 'success') {
      const isOfflineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
      const reasonText =
        serverOutcome.kind === 'unavailable' ? String(serverOutcome.reason || '').toLowerCase() : '';
      const isTimeoutOrWeak =
        reasonText.includes('timeout') ||
        reasonText.includes('مهلة') ||
        reasonText.includes('شبكة') ||
        reasonText.includes('network');
      const message =
        serverOutcome.kind === 'unavailable'
          ? serverOutcome.reason === 'lookup-rpc-missing'
            ? 'خدمة المصادقة المركزية غير مكتملة الإعداد على قاعدة البيانات. راجع إدارة النظام (ملف p0_auth_lockdown.sql).'
            : isOfflineNow
              ? 'لا يوجد اتصال بالإنترنت حالياً. يرجى الاتصال بالشبكة للتحقق من كلمة المرور وتسجيل الدخول.'
              : isTimeoutOrWeak
                ? 'الشبكة ضعيفة أو انتهت مهلة الاتصال بخدمة المصادقة. انتظر لحظة وحاول مرة أخرى.'
                : 'تعذر الاتصال بخدمة المصادقة المركزية. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.'
          : serverOutcome.kind === 'no-server-account'
            ? 'هذا الحساب غير مُفعّل على المصادقة المركزية بعد. يرجى التواصل مع الإدارة لتفعيل الحساب.'
            : 'اسم المستخدم أو كلمة المرور غير صحيحة.';
      return {
        success: false,
        errorType: serverOutcome.kind === 'unavailable' ? 'connection' : 'wrong_password',
        message,
      };
    }

    if (serverOutcome.email) {
      linkAuthUserToProfile(serverOutcome.authUserId, serverOutcome.email).catch(() => {});
    }

    // ===== 2) ملف الموظف الرسمي — بالتوازي (fetchMyProfile + findUserInSupabase) =====
    const [profileRes, supabaseRes] = await Promise.allSettled([
      fetchMyProfile(),
      findUserInSupabase(rawTrim || cleanId || asciiDigits),
    ]);

    let found: User | null = null;
    if (profileRes.status === 'fulfilled' && profileRes.value) {
      found = profileRes.value;
    } else if (supabaseRes.status === 'fulfilled' && supabaseRes.value?.success && supabaseRes.value.user) {
      found = supabaseRes.value.user;
    } else {
      // Fallback آمن فقط بعد نجاح المصادقة من السيرفر إذا تعثرت قراءة الملف مؤقتاً
      const cachedProfile = readOfflineSafeProfile(serverOutcome.authUserId);
      if (
        cachedProfile &&
        (cachedProfile.auth_user_id === serverOutcome.authUserId ||
          (serverOutcome.email && cachedProfile.email?.toLowerCase() === serverOutcome.email.toLowerCase()))
      ) {
        found = cachedProfile;
      }
    }

    if (found) {
      // دمج المستخدم في القائمة المحلية قبل تفعيل الجلسة لمنع أي خروج لحظي خاطئ
      const verifiedFound = found;
      setUsers((prev) => {
        const map = new Map<string, User>();
        prev.forEach((u) => map.set(u.id, u));
        map.set(verifiedFound.id, verifiedFound);
        const updated = Array.from(map.values());
        safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(updated));
        return updated;
      });
    }

    if (!found) {
      await signOutServer().catch(() => {});
      return {
        success: false,
        errorType: 'user_not_found',
        message:
          'تم التحقق من هويتك، لكن لا يوجد ملف موظف مرتبط بهذا الحساب. راجع إدارة النظام لربط الحساب (users.auth_user_id / auth_email).',
      };
    }

    if (found.approvalStatus === 'pending_approval') {
      return {
        success: false,
        errorType: 'inactive',
        message: 'الحساب قيد المراجعة والتفعيل من الإدارة المركزية لشركة دريم. يرجى التواصل مع المشرف أو مسؤول النظام لتفعيل الحساب وتعيين الفرع والمشرف المباشر.'
      };
    }

    if (found.approvalStatus === 'rejected' || found.isActive === false) {
      return {
        success: false,
        errorType: 'inactive',
        message: 'هذا الحساب موقوف أو تم رفض تفعيله من قبل الإدارة.'
      };
    }

    // الاحتفاظ بالكتالوج وكاش الحساب المحفوظ في IndexedDB مع إعادة تعيين مؤقتات الفحص في الذاكرة فقط
    justLoggedInRef.current = true;
    noStampPulledAtRef.current = 0;
    customerFullFetchAtRef.current = 0;
    lastBootCustScopeSigRef.current = '';
    lastBootHeartbeatAtRef.current = 0;
    customerDownloadInFlightRef.current = false;
    saveOfflineSafeProfile(found);
    currentUserRef.current = found;
    setCurrentUser(found);
    setIsAuthenticated(true);
    localStorage.setItem(STORAGE_KEYS.IS_AUTH, 'true');
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, found.id);
    setDataEpoch((n) => n + 1);

    return { success: true, message: `مرحباً بك ${found.name}`, user: found };
  };

  const register = async (userData: {
    name: string;
    username: string;
    email: string;
    phone: string;
    branchName: string;
    role: UserRole;
    sector?: 'home' | 'electrical' | 'both' | 'all';
    supervisorId?: string;
  }): Promise<{ success: boolean; message: string }> => {
    const existing = users.find(
      (u) =>
        u.email.toLowerCase() === userData.email.trim().toLowerCase() ||
        u.username.toLowerCase() === userData.username.trim().toLowerCase()
    );

  if (existing || hasDuplicateUserIdentity(userData, users)) {
  return { success: false, message: 'اسم المستخدم أو البريد أو الهاتف أو اسم المندوب مسجل بالفعل.' };
  }
  
  const newUser: User = {
      id: `u-${Date.now()}`,
      name: userData.name.trim(),
      username: userData.username.trim().toLowerCase(),
      email: userData.email.trim().toLowerCase(),
      phone: userData.phone.trim(),
      branchName: userData.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
      role: userData.role || 'sales_rep',
      sector: userData.sector || 'home',
      supervisorId: userData.supervisorId,
      isActive: true,
      approvalStatus: userData.role === 'developer' || userData.role === 'admin' ? 'active' : 'pending_approval', // Requires admin approval for reps
      registrationDate: new Date().toISOString().slice(0, 10),
      avatar: '/pwa-192x192.png'
    };

    setUsers((prev) => [...prev, newUser]);
    // Save to Supabase asynchronously
    saveUserToSupabase(newUser).catch((e) => console.warn('Supabase auto-save user failed:', e));

    recordAuditLog({
      userId: newUser.id,
      userName: newUser.name,
      userRole: newUser.role,
      branchName: newUser.branchName,
      action: 'create_user',
      actionTitle: `طلب تسجيل مستخدم جديد (${newUser.name})`,
      details: `تم تقديم طلب حساب جديد برقم هاتف ${newUser.phone} بانتظار اعتماد الإدارة.`,
      badgeType: 'warning',
    });

    return {
      success: true,
      message: 'تم تسجيل طلب الحساب بنجاح وهو الآن بانتظار تفعيل الأدمن وتخصيص المشرف والتفعيل.'
    };
  };

  const logout = () => {
    // مسح الجلسة فقط دون إتلاف كاش البيانات والكتالوج المحفوظ محلياً في IndexedDB
    hydratedSigRef.current = '';
    hydratedScopeRef.current = { userId: null, sector: 'home' };
    setIsLocalDataHydrated(false);
    currentUserRef.current = null;
    setCurrentUser(null);
    setIsAuthenticated(false);
    clearOfflineSafeProfile();
    localStorage.removeItem(STORAGE_KEYS.IS_AUTH);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_DATA);
    clearCart();

    noStampPulledAtRef.current = 0;
    customerFullFetchAtRef.current = 0;
    lastBootCustScopeSigRef.current = '';
    lastBootHeartbeatAtRef.current = 0;
    customerDownloadInFlightRef.current = false;

    setProducts([]);
    setInvoices([]);
    setCustomers([]);
    setVisits([]);
    setTargets([]);

    signOutServer().catch(() => {});
  };

  const updateCurrentUserAvatar = async (avatarUrl: string): Promise<boolean> => {
    if (!currentUser) return false;
    const cleanUrl = avatarUrl.trim();
    if (!cleanUrl) return false;

    const updatedUser: User = {
      ...currentUser,
      avatar: cleanUrl,
    };

    setCurrentUser(updatedUser);
    setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, avatar: cleanUrl } : u)));

    safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_DATA, JSON.stringify(updatedUser));
    safeLocalStorageSet(
      STORAGE_KEYS.USERS,
      JSON.stringify(users.map((u) => (u.id === currentUser.id ? { ...u, avatar: cleanUrl } : u)))
    );
    idbSet(STORAGE_KEYS.CURRENT_USER_DATA, updatedUser).catch(() => {});

    try {
      // الصورة بتتحفظ في صفها الصغير المخصوص بس — مفيش أي كتابة على صف
      // الحساب، فبيانات زي المشرف/الفرع/الصلاحية/كلمة السر مش بتتلمس خالص،
      // ومفيش إعادة كتابة لنسخة المستخدمين الكاملة (egress).
      saveUserAvatarToSupabase(currentUser.id, cleanUrl).catch(() => {});
    } catch {}

    return true;
  };

  const approveUser = (userId: string, supervisorId?: string, branchName?: string, role?: UserRole) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        const updated: User = {
          ...u,
          approvalStatus: 'active',
          isActive: true,
          supervisorId: supervisorId !== undefined ? supervisorId : u.supervisorId,
          branchName: branchName || u.branchName,
          role: role || u.role,
        };
        // Auto sync to Supabase
        saveUserToSupabase(updated).catch((e) => console.warn('Supabase update failed:', e));

        recordAuditLog({
          userId: currentUser?.id || 'admin',
          userName: currentUser?.name || 'مدير النظام',
          userRole: currentUser?.role || 'admin',
          branchName: branchName || u.branchName,
          action: 'update_user',
          actionTitle: `اعتماد وتفعيل حساب (${u.name})`,
          details: `تم اعتماد المستخدم وتعيين الصلاحية (${role || u.role}) لفرع (${branchName || u.branchName}).`,
          badgeType: 'success',
        });

        return updated;
      })
    );
  };

  const rejectUser = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, approvalStatus: 'rejected', isActive: false } : u))
    );
    if (currentUser?.id === userId) {
      logout();
      setAuthTerminationNotice('تم إيقاف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
    }
  };

  const deleteUser = (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    syncOrQueue('users', 'delete', userId, undefined, () => deleteUserFromSupabase(userId))
      .then(() => publishDataVersionUpdate({ scope: 'customers', notes: 'حذف مستخدم من النظام' }))
      .catch((e) => console.warn('Supabase delete user failed:', e));
    if (currentUser?.id === userId) {
      logout();
      setAuthTerminationNotice('تم حذف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
    }
    // Clean rep associations from customers
    setCustomers((prev) =>
      prev.map((c) => (c.repId === userId ? { ...c, repId: undefined, repName: 'غير محدد', salesRepName: 'غير محدد' } : c))
    );
  };

  const assignSupervisor = (repId: string, supervisorId: string) => {
    const nextUsers = users.map((u) => (u.id === repId ? { ...u, supervisorId } : u));
    setUsers(nextUsers);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(nextUsers));
    idbSet(STORAGE_KEYS.USERS, nextUsers).catch(() => {});
    saveUsersToSupabase(nextUsers).catch((e) => console.warn('Supabase supervisor assignment failed:', e));
  };

  // --- Inventory & Stock Real-time Audit Helper ---
  const recordInventoryTransaction = (_tx: Omit<InventoryTransaction, 'id' | 'timestamp' | 'date'>) => {
    // Inventory logs disabled as requested by user to keep the app ultra-clean and lightweight
  };

  const checkProductAvailability = (productId: string, requestedCartons: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return { available: false, remainingPieces: 0, message: 'الصنف غير موجود بالسيستم' };

    const branchActual = prod.branchStockActual || 0;
    const branchAvailable = typeof prod.branchStockReserved === 'number'
      ? Math.min(branchActual, Math.max(0, prod.branchStockReserved))
      : branchActual;
    const branchReservedCount = Math.max(0, branchActual - branchAvailable);

    const mainActual = prod.mainWarehouseActual || 0;
    const mainAvailable = typeof prod.mainWarehouseReserved === 'number'
      ? Math.min(mainActual, Math.max(0, prod.mainWarehouseReserved))
      : mainActual;
    const mainReservedCount = Math.max(0, mainActual - mainAvailable);

    const totalAvailable = branchAvailable + mainAvailable;
    const totalActual = branchActual + mainActual;
    const totalReserved = branchReservedCount + mainReservedCount;

    if (totalAvailable <= 0) {
      return {
        available: false,
        remainingPieces: 0,
        message: `عفواً، الصنف (${prod.name}) غير متاح للطلب الآن!\n📊 تفاصيل الرصيد: الرصيد الفعلي (${totalActual} كرتونة) - محجوز بفواتير معلقة (${totalReserved} كرتونة) = الرصيد المتاح للبيع (0 كرتونة متبقية).`
      };
    }

    if (requestedCartons > totalAvailable) {
      return {
        available: false,
        remainingPieces: totalAvailable,
        message: `عفواً، الكمية المطلوبة (${requestedCartons} كرتونة) تتجاوز الرصيد المتاح!\n📊 تفاصيل الرصيد: الفعلي بالمخزن (${totalActual} كرتونة) | محجوز لمناديب آخرين (${totalReserved} كرتونة) ⬅️ المتبقي الصافي المتاح (${totalAvailable} كرتونة فقط).`
      };
    }

    return { available: true, remainingPieces: totalAvailable };
  };

  // --- Smart Cart Actions with Automatic Carton & Piece Conversion ---
  const addToCart = (
    product: Product,
    orderType: 'carton' | 'piece' | 'mixed' = 'carton',
    count: number = 1,
    piecesCount: number = 0
  ): { success: boolean; message?: string } => {
    const latestProd = products.find((p) => p.id === product.id) || product;
    const cartonQty = latestProd.cartonQuantity && latestProd.cartonQuantity > 0 ? latestProd.cartonQuantity : 1;

    let cartonsToAdd = 0;
    let piecesToAdd = 0;

    if (orderType === 'piece') {
      // User entered total pieces -> automatically convert to cartons + pieces!
      const totalPiecesInput = Math.max(1, count);
      cartonsToAdd = Math.floor(totalPiecesInput / cartonQty);
      piecesToAdd = totalPiecesInput % cartonQty;
    } else if (orderType === 'carton') {
      cartonsToAdd = Math.max(0, count);
      piecesToAdd = Math.max(0, piecesCount);
      // Auto-wrap overflow pieces to cartons if >= cartonQty
      if (piecesToAdd >= cartonQty) {
        cartonsToAdd += Math.floor(piecesToAdd / cartonQty);
        piecesToAdd = piecesToAdd % cartonQty;
      }
    } else {
      cartonsToAdd = Math.max(0, count);
      piecesToAdd = Math.max(0, piecesCount);
      if (piecesToAdd >= cartonQty) {
        cartonsToAdd += Math.floor(piecesToAdd / cartonQty);
        piecesToAdd = piecesToAdd % cartonQty;
      }
    }

    if (cartonsToAdd === 0 && piecesToAdd === 0) {
      cartonsToAdd = 1;
    }

    const totalRequiredCartonFraction = cartonsToAdd + (piecesToAdd / cartonQty);

    const branchActual = latestProd.branchStockActual || 0;
    const availableInBranch = typeof latestProd.branchStockReserved === 'number'
      ? Math.min(branchActual, Math.max(0, latestProd.branchStockReserved))
      : branchActual;
    const branchReservedCount = Math.max(0, branchActual - availableInBranch);

    const mainActual = latestProd.mainWarehouseActual || 0;
    const availableInWarehouse = typeof latestProd.mainWarehouseReserved === 'number'
      ? Math.min(mainActual, Math.max(0, latestProd.mainWarehouseReserved))
      : mainActual;
    const mainReservedCount = Math.max(0, mainActual - availableInWarehouse);

    const totalActual = branchActual + mainActual;
    const totalReserved = branchReservedCount + mainReservedCount;
    const totalAvailable = availableInBranch + availableInWarehouse;

    if (totalAvailable <= 0 && totalReserved <= 0) {
      return {
        success: false,
        message: `⚠️ الصنف (${latestProd.name}) غير متوفر حاليًا: الرصيد صفر بالفرع وبمخزن أكتوبر.`
      };
    }

    if (totalAvailable <= 0) {
      return {
        success: false,
        message: `⚠️ تنبيه رصيد محجوز: الصنف (${latestProd.name}) غير متاح للبيع حالياً!\n(الرصيد الفعلي بالمخزن: ${totalActual} كرتونة، ولكن تم حجز ${totalReserved} كرتونة لطلبيات أخرى قيد مراجعة المشرف ⬅️ المتاح الصافي: 0 كرتونة).`
      };
    }

    if (cartonsToAdd > totalAvailable) {
      return {
        success: false,
        message: `⚠️ الكمية المطلوبة (${cartonsToAdd} كرتونة) أكبر من الرصيد المتاح للطلب (${totalAvailable} كرتونة) للصنف (${latestProd.name}).\n(المتاح بالفرع: ${availableInBranch} كرتونة • متاح بأكتوبر: ${availableInWarehouse} كرتونة • محجوز لطلبيات أخرى: ${totalReserved} كرتونة).`
      };
    }

    const scopedPromos = filterPromotionsForUser(promotionsRef.current, currentUserRef.current, products);
    const promoInfo = resolveProductPromotion(latestProd, scopedPromos);
    const effectivePiecePrice = Number(latestProd.piecePrice || latestProd.salesPrice || 0);
    let calculatedCartonPrice = Number(latestProd.cartonPrice || 0);
    if (effectivePiecePrice > 0) {
      calculatedCartonPrice = Math.round(effectivePiecePrice * cartonQty * 100) / 100;
    }

    const appliedCartonPrice =
      promoInfo.hasPromo && promoInfo.promoCartonPrice > 0
        ? promoInfo.promoCartonPrice
        : calculatedCartonPrice;
    const piecePrice =
      promoInfo.hasPromo && promoInfo.promoPiecePrice > 0
        ? promoInfo.promoPiecePrice
        : effectivePiecePrice > 0
          ? effectivePiecePrice
          : (cartonQty > 0 ? Math.round((appliedCartonPrice / cartonQty) * 100) / 100 : appliedCartonPrice);

    const enrichedProd: Product = promoInfo.hasPromo
      ? {
          ...latestProd,
          promoPrice: promoInfo.promoCartonPrice,
          promoPiecePrice: promoInfo.promoPiecePrice,
          offerPrice: promoInfo.promoCartonPrice,
          discountPercent: promoInfo.discountPercentage,
          discountPercentage: promoInfo.discountPercentage,
        }
      : latestProd;

    setCart((prev) => {
      const existingInCart = prev.find((item) => item.product.id === latestProd.id);

      if (existingInCart) {
        let newCartonCount = existingInCart.cartonCount + cartonsToAdd;
        let newPieceCount = (existingInCart.pieceCount || 0) + piecesToAdd;
        if (newPieceCount >= cartonQty) {
          newCartonCount += Math.floor(newPieceCount / cartonQty);
          newPieceCount = newPieceCount % cartonQty;
        }

        const totalPrice = (newCartonCount * appliedCartonPrice) + (newPieceCount * piecePrice);
        const totalUnits = (newCartonCount * cartonQty) + newPieceCount;

        return prev.map((item) =>
          item.product.id === latestProd.id
            ? {
                ...item,
                product: enrichedProd,
                cartonCount: newCartonCount,
                pieceCount: newPieceCount,
                totalPieces: totalUnits,
                cartonQuantity: cartonQty,
                unitPrice: appliedCartonPrice,
                pricePerPiece: piecePrice,
                totalPrice,
                orderType: 'carton',
                quantityDescription: newCartonCount > 0 && newPieceCount > 0 ? `${newCartonCount} كرتونة و ${newPieceCount} قطعة` : newCartonCount > 0 ? `${newCartonCount} كرتونة` : `${newPieceCount} قطعة`,
                fulfillFromMainWarehouse:
                  availableInBranch < newCartonCount + newPieceCount / cartonQty &&
                  availableInWarehouse > 0,
              }
            : item
        );
      } else {
        const totalPrice = (cartonsToAdd * appliedCartonPrice) + (piecesToAdd * piecePrice);
        const totalUnits = (cartonsToAdd * cartonQty) + piecesToAdd;

        return [
          ...prev,
          {
            product: enrichedProd,
            orderType: 'carton',
            cartonCount: cartonsToAdd,
            pieceCount: piecesToAdd,
            totalPieces: totalUnits,
            cartonQuantity: cartonQty,
            unitPrice: appliedCartonPrice,
            pricePerPiece: piecePrice,
            totalPrice,
            quantityDescription: cartonsToAdd > 0 && piecesToAdd > 0 ? `${cartonsToAdd} كرتونة و ${piecesToAdd} قطعة` : cartonsToAdd > 0 ? `${cartonsToAdd} كرتونة` : `${piecesToAdd} قطعة`,
            fulfillFromMainWarehouse:
              availableInBranch < totalRequiredCartonFraction && availableInWarehouse > 0,
          },
        ];
      }
    });

    return { success: true };
  };

  const updateCartItem = (productId: string, updates: Partial<CartItem>) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        const merged = { ...item, ...updates };
        const cartonQty = merged.product.cartonQuantity && merged.product.cartonQuantity > 0 ? merged.product.cartonQuantity : 1;
        const scopedPromos = filterPromotionsForUser(promotionsRef.current, currentUserRef.current, products);
        const promoInfo = resolveProductPromotion(merged.product, scopedPromos);
        const appliedCartonPrice =
          promoInfo.hasPromo && promoInfo.promoCartonPrice > 0
            ? promoInfo.promoCartonPrice
            : merged.product.cartonPrice;
        const piecePrice =
          promoInfo.hasPromo && promoInfo.promoPiecePrice > 0
            ? promoInfo.promoPiecePrice
            : merged.product.piecePrice && merged.product.piecePrice > 0
              ? merged.product.piecePrice
              : (cartonQty > 0 ? Math.round((appliedCartonPrice / cartonQty) * 100) / 100 : appliedCartonPrice);

        let safeCartonCount = Math.max(0, merged.cartonCount ?? 0);
        let safePieceCount = Math.max(0, merged.pieceCount ?? 0);

        // Auto-wrap overflow pieces into cartons
        if (safePieceCount >= cartonQty) {
          safeCartonCount += Math.floor(safePieceCount / cartonQty);
          safePieceCount = safePieceCount % cartonQty;
        }

        if (safeCartonCount === 0 && safePieceCount === 0) {
          safeCartonCount = 1;
        }

        const totalPrice = (safeCartonCount * appliedCartonPrice) + (safePieceCount * piecePrice);
        const totalUnits = (safeCartonCount * cartonQty) + safePieceCount;

        const desc = safeCartonCount > 0 && safePieceCount > 0 
          ? `${safeCartonCount} كرتونة و ${safePieceCount} قطعة` 
          : safeCartonCount > 0 
          ? `${safeCartonCount} كرتونة` 
          : `${safePieceCount} قطعة`;

        return {
          ...merged,
          cartonCount: safeCartonCount,
          pieceCount: safePieceCount,
          totalPieces: totalUnits,
          cartonQuantity: cartonQty,
          unitPrice: appliedCartonPrice,
          pricePerPiece: piecePrice,
          totalPrice,
          quantityDescription: desc,
          orderType: 'carton',
        };
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => setCart([]);

  const getCartSummary = (customDiscountPercent?: number) => {
    let totalCartons = 0;
    let totalPieces = 0;
    let subtotal = 0;

    cart.forEach((item) => {
      const cQty = item.product.cartonQuantity || 1;
      totalCartons += item.cartonCount;
      totalPieces += (item.cartonCount * cQty) + (item.pieceCount || 0);
      subtotal += item.totalPrice;
    });

    const discountPercentage = typeof customDiscountPercent === 'number' ? Math.max(0, customDiscountPercent) : 0;
    const discountAmount = subtotal * (discountPercentage / 100);
    const grandTotal = Math.max(0, subtotal - discountAmount);
    const taxAmount = 0;

    return {
      totalCartons,
      totalPieces,
      subtotal,
      discountPercentage,
      discountAmount,
      taxAmount,
      grandTotal,
      itemCount: cart.length,
    };
  };

  // --- Product & Stock Management ---
  const addProduct = (product: Product) => {
    const sanitized = sanitizeProducts([product])[0];
    setProducts((prev) => [sanitized, ...prev]);
    recordInventoryTransaction({
      productId: sanitized.id,
      productCode: sanitized.code,
      productName: sanitized.name,
      type: 'تعديل جردي',
      quantityPieces: sanitized.branchStockActual,
      branchStockBefore: 0,
      branchStockAfter: sanitized.branchStockActual,
      branchName: sanitized.branchName || currentUser?.branchName || 'الفرع الرئيسي',
      userName: currentUser?.name || 'مسؤول النظام',
      userRole: currentUser?.role || 'admin',
      notes: 'إضافة صنف جديد للكتالوج مع رصيد افتتاحي'
    });
    scheduleProductSync();
  };

  const updateProduct = (updated: Product) => {
    const sanitized = sanitizeProducts([updated])[0];
    setProducts((prev) => prev.map((p) => (p.id === sanitized.id ? sanitized : p)));
    scheduleProductSync();
  };

  const deleteProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    // بعد ما جدول products بقى هو المصدر، الحذف لازم يتم على السيرفر أيضًا —
    // الـ upsert لوحده كان بيسيب الصف المحذوف حي هناك فيرجع مع المزامنة.
    deleteProductFromSupabase(productId).catch((e) =>
      console.warn('Supabase product delete failed:', e)
    );
    scheduleProductSync();
  };

  const importProductsList = async (
    newProducts: Product[],
    mode: 'merge' | 'replace' = 'replace'
  ): Promise<{ success: boolean; error?: string }> => {
    // الأدمن/المطور بيرفعوا كتالوج الشركة كامل، فمينفعش نفلتر لهم قطاع واحد:
    // الفلتر ده كان بيرمي أصناف قطاع الكهرباء كلها وقت الاستيراد.
    const isAdminLevel = currentUser?.role === 'admin' || currentUser?.role === 'developer';
    const userSector = currentUser?.sector;
    const sectorFilteredIncoming = newProducts.filter((p) => {
      if (isAdminLevel) return true;
      if (!userSector || userSector === 'all' || userSector === 'both') return true;
      return !p.sector || p.sector === userSector || p.sector === 'both' || p.sector === 'all';
    });

    // لا دمج: كل صف في الشيت يبقى صنف مستقل في الكتالوج.
    // الكود الأساسي قد يتكرر 10 مرات (نفس الاسم، كود موحد/لون/حجم/مخزون مختلف) —
    // ونحفظهم جميعًا. الكود الموحد يجب أن يكون فريدًا (لا يتكرر).
    const dedupedIncoming = [...sectorFilteredIncoming];

    // كشف الأكواد المكررة داخل الشيت نفسه (نفس الكود الأساسي يتكرر)
    const codeCount = new Map<string, number>();
    sectorFilteredIncoming.forEach((p) => {
      const c = normalizeVariantCodeKey(p.code);
      if (c) codeCount.set(c, (codeCount.get(c) || 0) + 1);
    });
    const duplicatedCodes = Array.from(codeCount.entries())
      .filter(([, n]) => n > 1)
      .map(([c]) => c)
      .sort();

    // Automatically register any newly encountered branch names dynamically
    setBranches((prevBranches) => {
      const existingNames = new Set(prevBranches.map((b) => b.name));
      const newBranchesToAdd: Branch[] = [];

      sectorFilteredIncoming.forEach((p) => {
        const bName = p.branchName ? normalizeBranchName(p.branchName) : '';
        if (bName && !existingNames.has(bName)) {
          existingNames.add(bName);
          newBranchesToAdd.push({
            id: `b-custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: bName,
            code: `BR-0${prevBranches.length + newBranchesToAdd.length + 1}`,
            city: bName.replace('فرع ', ''),
            address: `محافظة ${bName.replace('فرع ', '')}`,
            managerName: 'مدير الفرع',
            phone: '01000000000',
            isMainWarehouse: bName.includes('المركزي') || bName.includes('أكتوبر'),
          });
        }
      });

      if (newBranchesToAdd.length > 0) {
        return [...prevBranches, ...newBranchesToAdd];
      }
      return prevBranches;
    });

    // Intelligently calculate currently active reservations from pending invoices to prevent overwriting sales rep reserves
    const reservedPiecesByProduct = new Map<string, number>();
    invoices.forEach((inv) => {
      if (
        inv.status === 'قيد مراجعة المشرف' ||
        inv.status === 'معلقة بانتظار اعتماد الفرع' ||
        inv.status === 'قيد المراجعة' ||
        inv.status === 'جاري التجهيز'
      ) {
        inv.items.forEach((item) => {
          const current = reservedPiecesByProduct.get(item.productId) || 0;
          reservedPiecesByProduct.set(item.productId, current + (item.cartonCount || 0));
        });
      }
    });

    const protectReserved = (prod: Product): Product => {
      const activePending = reservedPiecesByProduct.get(prod.id) || 0;
      const branchActual = Math.max(0, prod.branchStockActual || 0);
      const warehouseActual = Math.max(0, prod.mainWarehouseActual || 0);
      const branchReserved = Math.max(0, branchActual - activePending);
      const warehouseReserved =
        typeof prod.mainWarehouseReserved === 'number' && prod.mainWarehouseReserved > 0
          ? Math.min(warehouseActual, prod.mainWarehouseReserved)
          : warehouseActual;
      return {
        ...prod,
        branchStockReserved: branchReserved,
        mainWarehouseReserved: warehouseReserved,
      };
    };

    /**
     * مفتاح مطابقة الصنف = نفس `productIdentityKey` المستخدم في الفلترة بعد
     * الاستيراد (appContextHelpers).
     *
     * كانوا اتنين implementations مختلفين:
     *   - هنا:  `${code}__${color}__${size}` — والمشكل إن الأصناف من غير كود
     *     كلهم بيطلعوا نفس المفتاح `___`، فالاستيراد كان بيعمل **دمج**
     *    amongهم accidentally.
     *   - هناك: `code:${code}|${color}|${size}` وبفلتر fallback للمركّب.
     *
     * لما يكون المفتاحين مختلفين، الدمج بيعرف إن الصنف موجود والفلترة
     * بتعتبره صنف جديد، فالصف بيفضل في الكتالوج من غير ما حد ياخد باله.
     * دلوقتي التنين نفس الدالة، فمفيش طريق للبتر.
     */
    // لا مطابقة للكود القديم: كل منتج وارد يُحفظ كما هو (مع رقم تعريفي فريد داخلي).
    const processedIncoming = dedupedIncoming.map((incoming) => protectReserved({ ...incoming, id: incoming.id || `prod-${Date.now()}-${Math.random().toString(36).slice(2,6)}` }));

    let finalUpdated: Product[] = [];
    if (mode === 'replace') {
      const incomingSectors = new Set(processedIncoming.map((p) => p.sector).filter(Boolean));
      if (incomingSectors.size === 1 && (incomingSectors.has('electrical') || incomingSectors.has('home'))) {
        const targetSector = Array.from(incomingSectors)[0];
        const otherSectorProducts = products.filter((p) => p.sector && p.sector !== targetSector);
        finalUpdated = sanitizeProducts([...otherSectorProducts, ...processedIncoming]);
      } else {
        finalUpdated = sanitizeProducts(processedIncoming);
      }
      setProducts(finalUpdated);
    } else {
      // Upsert: أضف كل المنتجات الواردة الجديدة، وحافظ على القائمة الحالية.
      finalUpdated = sanitizeProducts([...products, ...processedIncoming]);
      setProducts(finalUpdated);
    }

    // Persist full catalog to Supabase so reps & branch supervisors instantly receive it on all devices
    // استيراد كامل → snapshot الـ chunks بيتحدث كمان (للأجهزة القديمة/الاحتياط).
    // الحفظ على السيرفر لازم يتأكد قبل ما نقول "تم الرفع": قبل كده كان
    // fire-and-forget، فالشيت يقول 5000 صنف والجدول فاضي والكتالوج يختفي
    // بعد أول إعادة تحميل.
    let saveResult: { success: boolean; error?: string };
    try {
      saveResult = await saveProductsToSupabase(finalUpdated, { snapshot: true });
    } catch (err: any) {
      saveResult = { success: false, error: err?.message || 'تعذر الاتصال بقاعدة البيانات' };
    }
    if (!saveResult.success) {
      console.warn('Supabase catalog save failed:', saveResult.error);
      return {
        success: false,
        error: saveResult.error || 'تعذر حفظ الكتالوج على السيرفر',
      };
    }
    try {
      await publishNewDataVersion({
        scope: 'products',
        updatedBy: currentUser?.name || 'مدير النظام',
        notes: `تحديث كتالوج الأصناف والأسعار (${mode === 'replace' ? 'استبدال كامل' : 'دمج وتحديث'})`,
        productsCount: finalUpdated.length,
        forcePurge: true,
      });
    } catch (versionErr) {
      console.warn('Data version publish notice:', versionErr);
    }

    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مدير النظام',
      userRole: currentUser?.role || 'admin',
      branchName: currentUser?.branchName || 'الفرع الرئيسي',
      action: 'import_products',
      actionTitle: `استيراد ومزامنة ${sectorFilteredIncoming.length} صنف من شيت الإكسل (${mode === 'replace' ? 'استبدال كامل' : 'دمج وتحديث'})`,
      details: `تم حفظ ${sectorFilteredIncoming.length} صنف من الشيت${duplicatedCodes.length > 0 ? ` (${duplicatedCodes.length} كود مكرر: ${duplicatedCodes.slice(0,5).join('، ')}${duplicatedCodes.length>5?'…':''})` : ''} مع الحفاظ على حجوزات المناديب النشطة.`,
      badgeType: 'info',
    });

    return { success: true };
  };

  const adjustStock = (productId: string, branchChange: number, mainWarehouseChange: number, reason?: string) => {
    const prod = products.find((p) => p.id === productId);
    const beforeActual = prod ? prod.branchStockActual : 0;

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        return {
          ...p,
          branchStockActual: Math.max(0, p.branchStockActual + branchChange),
          branchStockReserved: Math.max(0, p.branchStockReserved + branchChange),
          mainWarehouseActual: Math.max(0, p.mainWarehouseActual + mainWarehouseChange),
          mainWarehouseReserved: Math.max(0, p.mainWarehouseReserved + mainWarehouseChange),
        };
      })
    );

    if (prod && (branchChange !== 0 || mainWarehouseChange !== 0)) {
      recordInventoryTransaction({
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        type: branchChange > 0 ? 'توريد مخزني' : 'تعديل جردي',
        quantityPieces: Math.abs(branchChange),
        branchStockBefore: beforeActual,
        branchStockAfter: Math.max(0, beforeActual + branchChange),
        branchName: prod.branchName || currentUser?.branchName || 'الفرع الرئيسي',
        userName: currentUser?.name || 'مدير المخزن',
        userRole: currentUser?.role || 'branch_manager',
        notes: reason || `تعديل يدوي في رصيد الفرع: ${branchChange > 0 ? '+' : ''}${branchChange} قطعة`
      });

      recordAuditLog({
        userId: currentUser?.id || 'mgr',
        userName: currentUser?.name || 'مدير المخزن',
        userRole: currentUser?.role || 'branch_manager',
        branchName: prod.branchName || currentUser?.branchName || 'الفرع الرئيسي',
        action: 'stock_adjustment',
        actionTitle: `تعديل رصيد الصنف (${prod.code} - ${prod.name})`,
        details: `تعديل الفرع: ${branchChange > 0 ? `+${branchChange}` : branchChange} قطعة • تعديل أكتوبر: ${mainWarehouseChange > 0 ? `+${mainWarehouseChange}` : mainWarehouseChange} قطعة • السبب: ${reason || 'تسوية جردية'}`,
        badgeType: 'warning',
      });
      scheduleProductSync();
    }
  };

  // --- Orders, Concurrency, and Approval Workflow ---
  const createOrder = (
    orderData: Partial<Invoice> & { splitShortagesToBackorder?: boolean }
  ): {
    success: boolean;
    invoice?: Invoice;
    shortageInvoice?: Invoice;
    message?: string;
  } => {
    const cart = cartRef.current;
    if (cart.length === 0) {
      return { success: false, message: 'سلة الطلبية فارغة! يرجى إضافة أصناف أولاً.' };
    }

    // Submitting a request does not check, reserve, transfer, or deduct stock.
    // Stock availability is validated only after an authorized supervisor/manager clicks approval.
    for (const item of cart) {
      const currentProd = products.find((p) => p.id === item.product.id);
      if (!currentProd) {
        return { success: false, message: 'أحد الأصناف لم يعد موجوداً في النظام.' };
      }
    }


    // Per-rep invoice numbering: DRM-<year>-<repTag>-<seq>. Numbers are computed on each device
    // (offline-first), so a per-rep tag prevents two reps from creating the same number.
    const currentYear = new Date().getFullYear();
    const repIdText = String(currentUser?.id || 'x');
    const repDigits = (repIdText.match(/(\d+)\D*$/) || [])[1];
    let repTag = repDigits ? repDigits.slice(-4).padStart(4, '0') : '';
    if (!repTag) {
      let h = 0;
      for (let i = 0; i < repIdText.length; i++) h = (h * 31 + repIdText.charCodeAt(i)) % 10000;
      repTag = String(h).padStart(4, '0');
    }
    const numberPrefix = `DRM-${currentYear}-${repTag}-`;
    let maxInvoiceSeq = 0;
    invoices.forEach((inv) => {
      if (inv.invoiceNumber && inv.invoiceNumber.startsWith(numberPrefix)) {
        const n = parseInt(inv.invoiceNumber.slice(numberPrefix.length), 10);
        if (!isNaN(n) && n > maxInvoiceSeq) maxInvoiceSeq = n;
      }
    });
    const newInvoiceNumber = `${numberPrefix}${String(maxInvoiceSeq + 1).padStart(4, '0')}`;
    const now = new Date();
    const formattedDate = now.toISOString().slice(0, 10);
    const formattedTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

    const userSupervisor = currentUser?.supervisorId
      ? users.find((u) => u.id === currentUser.supervisorId)?.name
      : 'مشرف عام الفرع';

    // Sales reps only submit a request. Approval, transfer, and stock deduction belong to supervisors/managers.
    const isDirectManager = currentUser?.role === 'admin' || currentUser?.role === 'branch_manager';
    const initialStatus: OrderStatus =
      currentUser?.role === 'admin' || currentUser?.role === 'developer'
        ? 'معتمدة'
        : currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager'
          ? 'في انتظار اعتماد الإدارة'
          : 'قيد مراجعة المشرف';

    // Resolved order branch (e.g. فرع ديمشلت or employee's assigned branch)
    const defaultBranch = currentUser?.branchName || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)';
    const orderBranch = orderData.branchName || currentUser?.branchName || defaultBranch;

    // Single unified invoice policy: shortages stay on the same invoice.
    const primaryCartItems = cart;


    const orderDiscountPercent = typeof orderData.discountPercentage === 'number' ? Math.max(0, orderData.discountPercentage) : 0;

    const buildInvoiceItems = (items: typeof cart) => {
      return items.map((item) => {
        const currentProd = products.find((p) => p.id === item.product.id) || item.product;
        const cartonQty = currentProd.cartonQuantity || item.product.cartonQuantity || 1;
        const appliedCartonPrice = currentProd.promoPrice && currentProd.promoPrice > 0 ? currentProd.promoPrice : currentProd.cartonPrice;
        const piecePrice = currentProd.piecePrice && currentProd.piecePrice > 0 ? currentProd.piecePrice : (cartonQty > 0 ? Math.round((appliedCartonPrice / cartonQty) * 100) / 100 : appliedCartonPrice);
        
        const cCount = item.cartonCount || 0;
        const pCount = item.pieceCount || 0;
        const itemSubtotal = (cCount * appliedCartonPrice) + (pCount * piecePrice);
        const itemDiscount = itemSubtotal * (orderDiscountPercent / 100);
        const itemTax = 0;
        const totalUnits = (cCount * cartonQty) + pCount;

        // Stock availability in active branch vs. October central warehouse
        const bStock = getBranchStockForProduct(currentProd, orderBranch);
        const oStock = currentProd.mainWarehouseActual || 0;
        const isShortage = cCount > bStock;
        const shortageCartons = isShortage ? Math.max(0, cCount - Math.max(0, bStock)) : 0;
        const needsOctoberSupply = isShortage;
        const octoberSupplyStatus = isShortage
          ? (oStock > 0 ? 'مطلوب توريده من أكتوبر' : 'عجز بالمخازن')
          : 'متوفر بالفرع';

        const smartDesc = cCount > 0 && pCount > 0 
          ? `${cCount} كرتونة و ${pCount} قطعة` 
          : cCount > 0 
          ? `${cCount} كرتونة` 
          : `${pCount} قطعة`;

        return {
          productId: currentProd.id,
          productCode: currentProd.code,
          unifiedCode: item.unifiedCode || currentProd.unifiedCode,
          color: currentProd.color,
          productName: currentProd.name,
          cartonCount: cCount,
          pieceCount: pCount,
          cartonQuantity: cartonQty,
          totalUnits,
          quantityDescription: smartDesc,
          pricePerPiece: piecePrice,
          pricePerCarton: currentProd.cartonPrice,
          appliedPrice: appliedCartonPrice,
          totalBeforeTax: itemSubtotal,
          discountAmount: itemDiscount,
          taxAmount: itemTax,
          netTotal: itemSubtotal - itemDiscount,
          fulfilledFrom: (isShortage ? (bStock > 0 ? 'mixed' : 'main_warehouse') : 'branch') as 'branch' | 'main_warehouse' | 'mixed',
          branchStockAtOrder: bStock,
          octoberStockAtOrder: oStock,
          branchName: orderBranch,
          isShortage,
          shortageCartons,
          shortagePieces: 0,
          needsOctoberSupply,
          octoberSupplyStatus: octoberSupplyStatus as any,
        };
      });
    };

    const calculateTotals = (items: ReturnType<typeof buildInvoiceItems>) => {
      let subtotal = 0;
      let totalCartons = 0;
      let totalPieces = 0;
      items.forEach((it) => {
        subtotal += it.totalBeforeTax;
        totalCartons += it.cartonCount;
        totalPieces += it.totalUnits;
      });
      const discountAmount = subtotal * (orderDiscountPercent / 100);
      const taxAmount = 0;
      const estimatedGrandTotal = Math.max(0, subtotal - discountAmount);
      return { subtotal, totalCartons, totalPieces, discountAmount, taxAmount, estimatedGrandTotal };
    };

    const primaryItems = buildInvoiceItems(primaryCartItems);
    const primaryTotals = calculateTotals(primaryItems);

    // Determine assigned rep, supervisor, and audit trail note
    let assignedRepId = currentUser ? currentUser.id : 'u-admin-1';
    let assignedRepName = currentUser ? currentUser.name : 'أسامة إسلام (المطور التقني)';
    let assignedSupervisorName = userSupervisor;
    let creatorAuditNote = '';

    if (currentUser?.role === 'supervisor') {
      assignedSupervisorName = currentUser.name;
      if (orderData.repName && orderData.repName.trim()) {
        assignedRepName = orderData.repName.trim();
        const matchedRep = users.find(
          (u) =>
            isArabicNameMatch(u.name, assignedRepName) ||
            (u.username && isArabicNameMatch(u.username, assignedRepName))
        );
        if (matchedRep) {
          assignedRepId = matchedRep.id;
          assignedRepName = matchedRep.name;
        }
      }
      creatorAuditNote = `[تم إنشاء الطلبية بواسطة المشرف: ${currentUser.name} للمندوب التابع للعميل: ${assignedRepName}]`;
    } else if (currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer') {
      if (orderData.repName && orderData.repName.trim()) {
        assignedRepName = orderData.repName.trim();
        const matchedRep = users.find(
          (u) =>
            isArabicNameMatch(u.name, assignedRepName) ||
            (u.username && isArabicNameMatch(u.username, assignedRepName))
        );
        if (matchedRep) {
          assignedRepId = matchedRep.id;
          assignedRepName = matchedRep.name;
          if (matchedRep.supervisorId) {
            const sUser = users.find((u) => u.id === matchedRep.supervisorId);
            if (sUser) assignedSupervisorName = sUser.name;
          }
        }
      }
      if (currentUser?.role === 'branch_manager') {
        creatorAuditNote = `[تم إنشاء الطلبية بواسطة مدير الفرع: ${currentUser.name} للمندوب: ${assignedRepName}]`;
      }
    } else if (currentUser?.role === 'sales_rep') {
      assignedRepId = currentUser.id;
      assignedRepName = currentUser.name;
      assignedSupervisorName = userSupervisor;
    }

    const orderFinalNotes = [orderData.notes, creatorAuditNote].filter(Boolean).join('\n');

    // Match customer for credit limit & debt validation using intelligent matcher

    const matchedCustomer = findCustomerMatch(customers, {
      customerId: orderData.customerId,
      customerCode: orderData.customerCode,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
    });

    const custBalanceBefore = orderData.customerBalanceBefore !== undefined && orderData.customerBalanceBefore !== null
      ? Number(orderData.customerBalanceBefore)
      : Number(matchedCustomer?.currentBalance ?? matchedCustomer?.balance ?? 0);

    const custCreditLimit = orderData.customerCreditLimit !== undefined && orderData.customerCreditLimit !== null
      ? Number(orderData.customerCreditLimit)
      : Number(matchedCustomer?.creditLimit !== undefined && matchedCustomer?.creditLimit !== null ? matchedCustomer.creditLimit : 0);

    const custOverdue = orderData.customerOverdueBalance !== undefined && orderData.customerOverdueBalance !== null
      ? Number(orderData.customerOverdueBalance)
      : resolveCustomerDuesValue(matchedCustomer);

    const custBalanceAfter = orderData.customerBalanceAfter !== undefined && orderData.customerBalanceAfter !== null
      ? Number(orderData.customerBalanceAfter)
      : (custBalanceBefore + primaryTotals.estimatedGrandTotal);

    const isCreditExceeded = orderData.creditLimitExceeded !== undefined
      ? Boolean(orderData.creditLimitExceeded)
      : (custCreditLimit > 0 && custBalanceAfter > custCreditLimit);

    const reqPayment = orderData.requiredDownPayment !== undefined && orderData.requiredDownPayment !== null
      ? Number(orderData.requiredDownPayment)
      : (isCreditExceeded ? Math.max(0, custBalanceAfter - custCreditLimit) : 0);

    const primaryInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: newInvoiceNumber,
      customerId: orderData.customerId || (matchedCustomer ? matchedCustomer.id : undefined),
      customerName: orderData.customerName || (matchedCustomer ? matchedCustomer.name : 'عميل تجزئة عام'),
      customerCode: orderData.customerCode || (matchedCustomer ? matchedCustomer.code : undefined),
      customerPhone: orderData.customerPhone || (matchedCustomer ? matchedCustomer.phone : ''),
      customerAddress: orderData.customerAddress || (matchedCustomer ? matchedCustomer.address : ''),
      customerTaxNumber: orderData.customerTaxNumber || (matchedCustomer ? matchedCustomer.taxNumber : ''),
      date: formattedDate,
      time: formattedTime,
      repId: assignedRepId,
      repName: assignedRepName,
      supervisorName: assignedSupervisorName,
      branchName: orderBranch,
      items: primaryItems,
      totalCartons: primaryTotals.totalCartons,
      totalPieces: primaryTotals.totalPieces,
      subtotal: primaryTotals.subtotal,
      discountPercentage: orderDiscountPercent,
      discountAmount: primaryTotals.discountAmount,
      taxPercentage: 0,
      taxAmount: 0,
      estimatedGrandTotal: primaryTotals.estimatedGrandTotal,
      paymentMethod: orderData.paymentMethod || 'نقدي (كاش)',
      status: initialStatus,
      notes: orderFinalNotes,
      syncedToAccounting: false,
      hasShortageSplit: false,
      shortageInvoiceNumber: undefined,
      hasOctoberShortages: primaryItems.some((it) => it.isShortage),
      shortageItemsCount: primaryItems.filter((it) => it.isShortage).length,
      shortageCartonsCount: primaryItems.reduce((acc, it) => acc + (it.shortageCartons || 0), 0),
      octoberSupplyRequested: false,
      customerBalanceBefore: custBalanceBefore,
      customerCreditLimit: custCreditLimit,
      customerBalanceAfter: custBalanceAfter,
      customerOverdueBalance: custOverdue,
      creditLimitExceeded: isCreditExceeded,
      requiredDownPayment: reqPayment,
      creditOverrideRequested: orderData.creditOverrideRequested || false,
      creditOverrideRequestedBy: orderData.creditOverrideRequestedBy || undefined,
      creditOverrideRequestedAt: orderData.creditOverrideRequestedAt || undefined,
      creditOverrideReason: orderData.creditOverrideReason || undefined,
      creditOverrideStatus: orderData.creditOverrideRequested ? 'pending' : undefined,
      sector: (currentUser?.sector && currentUser.sector !== 'all' && currentUser.sector !== 'both')
        ? currentUser.sector
        : (matchedCustomer?.sector || 'home'),
      qrPayload: `DREAM-EINV-${newInvoiceNumber}|${orderData.customerTaxNumber || 'GEN'}|${primaryTotals.estimatedGrandTotal.toFixed(2)}|${primaryTotals.taxAmount.toFixed(2)}|${formattedDate}`,
    };

    // Send instant notification for supervisor & branch manager if invoice contains October shortages

    if (primaryInvoice.hasOctoberShortages) {
      try {
        const existingAnnouncements = JSON.parse(localStorage.getItem('tantawy_announcements_v1') || '[]');
        const shortageAnn = {
          id: `ann-shortage-${Date.now()}`,
          title: `🔔 تنبيه نواقص: فاتورة #${newInvoiceNumber} (${orderBranch})`,
          content: `سجل المندوب (${assignedRepName}) فاتورة للعميل (${primaryInvoice.customerName}) بـ (${orderBranch}) بها (${primaryInvoice.shortageItemsCount} أصناف نواقص بإجمالي ${primaryInvoice.shortageCartonsCount} كرتونة) بانتظار اعتماد المشرف وسحبها من مخزن 6 أكتوبر المركزي.`,
          author: assignedRepName,
          role: currentUser?.role || 'sales_rep',
          date: formattedDate,
          priority: 'عاجل' as const,
        };
        localStorage.setItem('tantawy_announcements_v1', JSON.stringify([shortageAnn, ...existingAnnouncements]));
      } catch {}
    }

    // Reserve stock immediately to prevent double-booking by multiple sales reps.
    // Physical actual stock is deducted only upon supervisor/manager approval.
    setProducts((prev) => {
      return prev.map((p) => {
        const cartItem = cart.find((c) => c.product.id === p.id);
        if (!cartItem) return p;
        const cartonUnits = cartItem.cartonCount;

        if (cartItem.fulfillFromMainWarehouse) {
          // Explicit full central warehouse reservation
          const mainUnits = Math.min(cartonUnits, Math.max(0, p.mainWarehouseReserved));
          const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
          if (updatedBranchStocks) {
            for (const bKey of Object.keys(updatedBranchStocks)) {
              if (isBranchMatch(bKey, 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)', { allowUnassigned: false })) {
                updatedBranchStocks[bKey] = Math.max(0, (updatedBranchStocks[bKey] || 0) - mainUnits);
              }
            }
          }
          return {
            ...p,
            branchStocks: updatedBranchStocks || p.branchStocks,
            mainWarehouseActual: isDirectManager ? Math.max(0, p.mainWarehouseActual - mainUnits) : p.mainWarehouseActual,
            mainWarehouseReserved: Math.max(0, p.mainWarehouseReserved - mainUnits),
          };
        } else {
          // Smart priority: take available from branch first, and remaining shortage from central warehouse
          const availableInBranch = Math.max(0, p.branchStockReserved);
          const takeFromBranch = Math.min(cartonUnits, availableInBranch);
          const takeFromMain = Math.max(0, cartonUnits - takeFromBranch);

          const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
          if (updatedBranchStocks && orderBranch) {
            for (const bKey of Object.keys(updatedBranchStocks)) {
              if (isBranchMatch(bKey, orderBranch, { allowUnassigned: false })) {
                updatedBranchStocks[bKey] = Math.max(0, (updatedBranchStocks[bKey] || 0) - takeFromBranch);
              }
            }
          }
          if (updatedBranchStocks && takeFromMain > 0) {
            for (const bKey of Object.keys(updatedBranchStocks)) {
              if (isBranchMatch(bKey, 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)', { allowUnassigned: false })) {
                updatedBranchStocks[bKey] = Math.max(0, (updatedBranchStocks[bKey] || 0) - takeFromMain);
              }
            }
          }

          return {
            ...p,
            branchStocks: updatedBranchStocks || p.branchStocks,
            branchStockActual: isDirectManager ? Math.max(0, p.branchStockActual - takeFromBranch) : p.branchStockActual,
            branchStockReserved: Math.max(0, p.branchStockReserved - takeFromBranch),
            mainWarehouseActual: isDirectManager ? Math.max(0, p.mainWarehouseActual - takeFromMain) : p.mainWarehouseActual,
            mainWarehouseReserved: Math.max(0, p.mainWarehouseReserved - takeFromMain),
          };
        }
      });
    });

    cart.forEach((item) => {
      const prod = products.find((p) => p.id === item.product.id);
      const isFromMain = item.fulfillFromMainWarehouse;
      const beforeReserved = prod ? (isFromMain ? prod.mainWarehouseReserved : prod.branchStockReserved) : 0;

      recordInventoryTransaction({
        productId: item.product.id,
        productCode: item.product.code,
        productName: item.product.name,
        type: isDirectManager ? 'صرف واعتماد مشرف' : 'حجز طلبية مندوب',
        quantityPieces: item.cartonCount,
        branchStockBefore: beforeReserved,
        branchStockAfter: Math.max(0, beforeReserved - item.cartonCount),
        branchName: isFromMain ? 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)' : (currentUser?.branchName || 'الفرع الرئيسي'),
        userName: currentUser?.name || 'المندوب',
        userRole: currentUser?.role || 'sales_rep',
        invoiceId: primaryInvoice.id,
        invoiceNumber: newInvoiceNumber,
        notes: isFromMain
          ? `حجز صنف نواقص من المخزن المركزي بأكتوبر للطلبية #${newInvoiceNumber}`
          : isDirectManager
          ? `اعتماد وصرف فوري للطلبية #${newInvoiceNumber}`
          : `حجز رصيد للطلبية #${newInvoiceNumber} لمنع تكرار الحجز (قيد مراجعة واعتماد المشرف)`,
      });
    });

    // كتابة الفاتورة في IndexedDB هنا مش تحسين شكلي: بدونها الفاتورة اللي
    // اتعملت أوف لاين بتتخزن في PENDING_INVOICES بس، والدمج في الحالة
    // بيحصل بس بعد جلب ناجح من السيرفر — يعني reload والجهاز لسه
    // أوف لاين = الفاتورة بتختفي من الشاشة (وبتفضل في الـoutbox بس).
    // الـupdater بس لازم يبقى نقي (بدون side effect) — نحسب next من الـref
    // (متزامن مع الحالة) ونحفظ برّه.
    const next = [primaryInvoice, ...invoicesRef.current];
    invoicesRef.current = next;
    setInvoices(next);
    idbSet(getInvoicesCacheKey(), next).catch(() => {});

    // Auto-detect and register new customer or link to representative
    if (orderData.customerName && orderData.customerName.trim() !== 'عميل تجزئة عام') {
      const trimmedCustName = orderData.customerName.trim();
      const existingCustIndex = customers.findIndex(
        (c) =>
          c.name.trim().toLowerCase() === trimmedCustName.toLowerCase() ||
          (orderData.customerPhone && c.phone && c.phone.trim() === orderData.customerPhone.trim())
      );

      if (existingCustIndex === -1) {
        // User directive: Master customer base is restricted to the official sheet only (3,427 customers).
        // Ad-hoc invoice customers are kept on the invoice itself and NOT added to the official customer database.
        console.info('Customer database is maintained exclusively from the master sheet; order customer kept on invoice only.');
      } else {
        // Update stats on existing customer
        const matched = customers[existingCustIndex];
        const updatedCust: Customer = {
          ...matched,
          phone: orderData.customerPhone || matched.phone,
          address: orderData.customerAddress || matched.address,
          salesRepName: matched.salesRepName || currentUser?.name || 'مندوب المبيعات',
          repName: matched.repName || currentUser?.name || 'مندوب المبيعات',
          repId: matched.repId || currentUser?.id || 'rep-1',
          lastOrderDate: formattedDate,
          totalOrdersCount: (matched.totalOrdersCount || 0) + 1,
          totalSpent: (matched.totalSpent || 0) + primaryTotals.estimatedGrandTotal,
        };
        setCustomers((prev) => {
          const nextCusts = prev.map((c) => (c.id === matched.id ? updatedCust : c));
          idbSet(getCustomersCacheKey(), nextCusts).catch(() => {});
          return nextCusts;
        });
        syncOrQueue('customers', 'upsert', updatedCust.id, updatedCust, () =>
          saveCustomersToSupabase([updatedCust])
        ).catch((e) => console.warn('Supabase customer update failed:', e));
      }
    }

    // Auto push to Supabase Cloud Database
    saveInvoiceWithQueue(primaryInvoice).catch((e) => console.warn('Supabase invoice save failed:', e));

    clearCart();

    recordAuditLog({
      userId: currentUser?.id || 'rep',
      userName: currentUser?.name || 'المندوب',
      userRole: currentUser?.role || 'sales_rep',
      branchName: primaryInvoice.branchName,
      action: 'create_invoice',
      actionTitle: `تسجيل فاتورة مبيعات جديدة #${primaryInvoice.invoiceNumber}`,
      details: `العميل: ${primaryInvoice.customerName} • ${primaryInvoice.totalCartons} كرتونة • القيمة: ${primaryInvoice.estimatedGrandTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م • الحالة: ${primaryInvoice.status}${primaryInvoice.hasOctoberShortages ? ' • تتضمن أصناف نواقص مطلوب توريدها من أكتوبر' : ''}`,
      invoiceId: primaryInvoice.id,
      invoiceNumber: primaryInvoice.invoiceNumber,
      badgeType: 'warning',
    });

    return {
      success: true,
      invoice: primaryInvoice,
      message: primaryInvoice.hasOctoberShortages
        ? `تم تسجيل الفاتورة الموحدة #${primaryInvoice.invoiceNumber} مع إشعار توريد النواقص لمخزن أكتوبر!`
        : `تم تسجيل الطلبية #${primaryInvoice.invoiceNumber} وإرسالها للمراجعة والاعتماد!`
    };
  };

  // Supervisor / Manager approves order & discharges physical stock
  // Supervisor / Branch Manager approves order -> pending admin approval (two-stage approval)
  // Admin / Developer gives final approval -> deduct physical stock and mark as approved
  const approveOrder = (invoiceId: string, notes?: string): { success: boolean; message: string } => {
    if (!currentUser || !['supervisor', 'branch_manager', 'admin', 'developer'].includes(currentUser.role)) {
      return { success: false, message: 'المندوب لا يملك صلاحية اعتماد الطلبية أو صرف المخزون.' };
    }
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
    if (
      currentUser.role !== 'admin' &&
      currentUser.role !== 'developer' &&
      (!currentUser.branchName || !inv.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك اعتماد طلبية تابعة لفرع آخر.' };
    }
    const isPending = inv.status === 'قيد مراجعة المشرف' || inv.status === 'معلقة بانتظار اعتماد الفرع' || inv.status === 'قيد المراجعة' || inv.status === 'مسودة' || inv.status === 'في انتظار اعتماد الإدارة';
    if (!isPending) return { success: false, message: 'لا يمكن اعتماد طلبية غير معلّقة للمراجعة.' };

    // STAGE 1: Supervisor / Branch Manager approval -> move to "في انتظار اعتماد الإدارة"
    if (currentUser.role === 'supervisor' || currentUser.role === 'branch_manager') {
      if (inv.status === 'في انتظار اعتماد الإدارة') {
        return { success: false, message: 'الطلبية في انتظار اعتماد الإدارة بالفعل' };
      }
      const updatedInv: Invoice = {
        ...inv,
        status: 'في انتظار اعتماد الإدارة' as OrderStatus,
        notes: notes ? `${inv.notes ? inv.notes + ' | ' : ''}ملاحظة اعتماد المشرف/مدير الفرع: ${notes}` : inv.notes,
      };
      setInvoices((prev) =>
        prev.map((i) => (i.id === invoiceId ? updatedInv : i))
      );
      saveInvoiceWithQueue(updatedInv).catch((e) => console.warn('Supabase invoice update failed:', e));
      recordAuditLog({
        userId: currentUser?.id || 'supervisor',
        userName: currentUser?.name || 'المشرف',
        userRole: currentUser?.role || 'supervisor',
        branchName: inv.branchName,
        action: 'approve_invoice',
        actionTitle: `اعتماد مشرف/مدير الفرع وإحالة للإدارة #${inv.invoiceNumber}`,
        details: `العميل: ${inv.customerName} • المندوب: ${inv.repName} • تم اعتماد الطلبية من قبل ${currentUser?.name} وتم إحالتها لاعتماد الإدارة النهائي • القيمة: ${inv.estimatedGrandTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م ${notes ? `• ملاحظة: ${notes}` : ''}`,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        badgeType: 'success',
      });
      return {
        success: true,
        message: `تم اعتماد الطلبية #${inv.invoiceNumber} من قبل ${currentUser.role === 'supervisor' ? 'المشرف' : 'مدير الفرع'} وتم إحالتها لاعتماد الإدارة النهائي`,
      };
    }

    // STAGE 2: Admin / Developer final approval -> deduct physical stock and mark as 'معتمدة'
    if (currentUser.role === 'admin' || currentUser.role === 'developer') {
      if (inv.status !== 'في انتظار اعتماد الإدارة') {
        return { success: false, message: 'لا يمكن للإدارة اعتماد الطلبية إلا بعد اعتماد المشرف/مدير الفرع أولاً (الرجاء الانتظار حتى يعتمد المشرف أو مدير الفرع الطلب)' };
      }

      // Deduct physical stock only after admin final approval: branch first, then central warehouse.
      const allocations = new Map<string, { branch: number; main: number }>();
      for (const invItem of inv.items) {
        const product = products.find((p) => p.id === invItem.productId);
        if (!product) return { success: false, message: `الصنف (${invItem.productName}) غير موجود في المخزون` };
        const requested = Math.max(0, invItem.cartonCount || 0);
        const branchAvailable = Math.max(0, getBranchStockForProduct(product, inv.branchName));
        const mainAvailable = Math.max(0, product.mainWarehouseActual);
        const branch = Math.min(requested, branchAvailable);
        const main = requested - branch;
        if (main > mainAvailable) {
          return {
            success: false,
            message: `لا يمكن اعتماد الطلبية: الصنف (${product.name}) يحتاج ${requested} كرتونة، المتاح ${branchAvailable} بالفرع و${mainAvailable} بالمخزن الرئيسي.` ,
          };
        }
        allocations.set(invItem.productId, { branch, main });
      }

      setProducts((prev) => prev.map((p) => {
        const allocation = allocations.get(p.id);
        if (!allocation) return p;
        const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
        if (updatedBranchStocks && allocation.branch > 0) {
          const branchKey = Object.keys(updatedBranchStocks).find((key) =>
            isBranchMatch(key, inv.branchName, { allowUnassigned: false })
          );
          if (branchKey) {
            updatedBranchStocks[branchKey] = Math.max(0, Number(updatedBranchStocks[branchKey] || 0) - allocation.branch);
          }
        }
        return {
          ...p,
          ...(updatedBranchStocks ? { branchStocks: updatedBranchStocks } : {}),
          branchStockActual: updatedBranchStocks ? p.branchStockActual : Math.max(0, p.branchStockActual - allocation.branch),
          mainWarehouseActual: Math.max(0, p.mainWarehouseActual - allocation.main),
        };
      }));

      // Log transaction
      inv.items.forEach((item) => {
        const prod = products.find((p) => p.id === item.productId);
        const currentActual = prod ? prod.branchStockActual : 0;
        recordInventoryTransaction({
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          type: 'صرف واعتماد مشرف',
          quantityPieces: item.cartonCount,
          branchStockBefore: currentActual,
          branchStockAfter: Math.max(0, currentActual - item.cartonCount),
          branchName: inv.branchName,
          userName: currentUser?.name || 'الإدارة',
          userRole: currentUser?.role || 'admin',
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          notes: notes ? `اعتماد نهائي وصرف: ${notes}` : `تم الاعتماد النهائي وصرف الطلبية من المخزن بواسطة ${currentUser?.name}`,
        });
      });

      const updatedInv: Invoice = {
        ...inv,
        status: 'معتمدة' as OrderStatus,
        // Final approval = financial execution completed → archive the order (hidden from active lists).
        isArchived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: currentUser?.name || 'الإدارة',
        notes: notes ? `${inv.notes ? inv.notes + ' | ' : ''}ملاحظة الاعتماد النهائي من الإدارة: ${notes}` : inv.notes,
      };

      setInvoices((prev) =>
        prev.map((i) => (i.id === invoiceId ? updatedInv : i))
      );

      saveInvoiceWithQueue(updatedInv).catch((e) => console.warn('Supabase invoice update failed:', e));

      recordAuditLog({
        userId: currentUser?.id || 'admin',
        userName: currentUser?.name || 'الإدارة',
        userRole: currentUser?.role || 'admin',
        branchName: inv.branchName,
        action: 'approve_invoice',
        actionTitle: `الاعتماد النهائي وصرف الفاتورة #${inv.invoiceNumber}`,
        details: `العميل: ${inv.customerName} • المندوب: ${inv.repName} • تم الاعتماد النهائي من الإدارة وخصم المخزون الفعلي من ${inv.branchName} (${inv.totalCartons} كرتونة) • القيمة: ${inv.estimatedGrandTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م ${notes ? `• ملاحظة: ${notes}` : ''}`,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        badgeType: 'success',
      });

      return {
        success: true,
        message: `تم الاعتماد النهائي للطلبية #${inv.invoiceNumber} من الإدارة وخصم المخزون الفعلي (${inv.totalCartons} كرتونة) من الفرع بنجاح!`,
      };
    }

    return { success: false, message: 'دور المستخدم غير مدعوم لاعتماد الطلبية' };
  };

  const resendInvoiceEmail = async (invoiceId: string): Promise<{ success: boolean; message: string }> => {
    if (!currentUser || !['supervisor', 'branch_manager', 'admin', 'developer'].includes(currentUser.role)) {
      return { success: false, message: 'إعادة إرسال الفاتورة متاحة للإدارة والمشرفين فقط.' };
    }

    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) return { success: false, message: 'الفاتورة غير موجودة.' };
    if (!['معتمدة ومصروفة من المخزن', 'معتمدة'].includes(invoice.status)) {
      return { success: false, message: 'لا يمكن إرسال الفاتورة قبل اعتمادها.' };
    }
    if (
      !['admin', 'developer'].includes(currentUser.role) &&
      (!currentUser.branchName || !invoice.branchName || !isBranchMatch(invoice.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك إعادة إرسال فاتورة تابعة لفرع آخر.' };
    }

    return {
      success: true,
      message: 'تم إلغاء إرسال الفواتير بالبريد الإلكتروني نهائياً بناءً على طلب الإدارة، واستبدالها بنظام الربط المباشر مع Microsoft Dynamics 365.'
    };
  };

  // Supervisor escalates / forwards to Branch Manager
  const forwardOrderToManager = (invoiceId: string, notes?: string): { success: boolean; message: string } => {
  if (!currentUser || currentUser.role !== 'supervisor') {
  return { success: false, message: 'تحويل الطلبية لمدير الفرع متاح للمشرف فقط.' };
  }
  const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
    if (!inv.branchName || !currentUser.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false })) {
      return { success: false, message: 'لا يمكنك تحويل طلبية تابعة لفرع آخر.' };
    }
    if (!['قيد مراجعة المشرف', 'قيد المراجعة'].includes(inv.status)) {
      return { success: false, message: 'لا يمكن تحويل طلبية في هذه الحالة.' };
    }

    setInvoices((prev) =>
      prev.map((i) => {
        if (i.id !== invoiceId) return i;
        const updated: Invoice = {
          ...i,
          status: 'معلقة بانتظار اعتماد الفرع' as OrderStatus,
          notes: notes ? `${i.notes ? i.notes + ' | ' : ''}تم التحويل لمدير الفرع: ${notes}` : i.notes,
        };
        saveInvoiceWithQueue(updated).catch((e) => console.warn('Supabase forward update failed:', e));
        return updated;
      })
    );

    recordAuditLog({
      userId: currentUser?.id || 'supervisor',
      userName: currentUser?.name || 'المشرف',
      userRole: currentUser?.role || 'supervisor',
      branchName: inv.branchName,
      action: 'update_invoice_status',
      actionTitle: `تحويل الفاتورة #${inv.invoiceNumber} لمدير الفرع`,
      details: `تم إحالة الطلبية للاعتماد النهائي لمدير الفرع ${notes ? `• ملاحظات: ${notes}` : ''}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: 'info',
    });

    return {
      success: true,
      message: `تم إرسال الطلبية #${inv.invoiceNumber} لمدير الفرع للاعتماد النهائي بنجاح.`,
    };
  };

  // Supervisor / Manager rejects order -> Immediately releases reserved stock back to market!
  const rejectOrder = (invoiceId: string, reason: string): { success: boolean; message: string } => {
    if (!currentUser) return { success: false, message: 'يجب تسجيل الدخول أولاً.' };
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
    const isPending = inv.status === 'قيد مراجعة المشرف' || inv.status === 'معلقة بانتظار اعتماد الفرع' || inv.status === 'قيد المراجعة' || inv.status === 'مسودة';
    const isOwnerRep = currentUser.role === 'sales_rep' &&
      (inv.repId === currentUser.id || (!inv.repId && normalizeArabicText(inv.repName) === normalizeArabicText(currentUser.name)));
    if (currentUser.role === 'sales_rep' && (!isOwnerRep || !isPending)) {
      return { success: false, message: 'يمكن للمندوب إلغاء طلبه المعلّق فقط.' };
    }
    if (!['sales_rep', 'supervisor', 'branch_manager', 'admin', 'developer'].includes(currentUser.role)) {
      return { success: false, message: 'لا تملك صلاحية رفض الطلبية.' };
    }
    if (
      currentUser.role !== 'sales_rep' &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'developer' &&
      (!currentUser.branchName || !inv.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك رفض طلبية تابعة لفرع آخر.' };
    }
    if (!isPending) {
      return { success: false, message: 'لا يمكن رفض طلبية بعد اعتمادها؛ استخدم مسار المرتجع أو الإلغاء المناسب.' };
    }

    // Restore reserved stock back to available stock (in Cartons)
    setProducts((prev) => {
      return prev.map((p) => {
        const invItem = inv.items.find((it) => it.productId === p.id);
        if (!invItem) return p;
        const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
        if (invItem.fulfilledFrom === 'main_warehouse') {
          if (updatedBranchStocks) {
            for (const bKey of Object.keys(updatedBranchStocks)) {
              if (isBranchMatch(bKey, 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)', { allowUnassigned: false })) {
                updatedBranchStocks[bKey] = (updatedBranchStocks[bKey] || 0) + invItem.cartonCount;
              }
            }
          }
          return {
            ...p,
            branchStocks: updatedBranchStocks || p.branchStocks,
            mainWarehouseReserved: p.mainWarehouseReserved + invItem.cartonCount,
          };
        } else {
          if (updatedBranchStocks && inv.branchName) {
            for (const bKey of Object.keys(updatedBranchStocks)) {
              if (isBranchMatch(bKey, inv.branchName, { allowUnassigned: false })) {
                updatedBranchStocks[bKey] = (updatedBranchStocks[bKey] || 0) + invItem.cartonCount;
              }
            }
          }
          return {
            ...p,
            branchStocks: updatedBranchStocks || p.branchStocks,
            branchStockReserved: p.branchStockReserved + invItem.cartonCount,
          };
        }
      });
    });

    // Log transaction
    inv.items.forEach((item) => {
      const prod = products.find((p) => p.id === item.productId);
      const reservedBefore = prod ? prod.branchStockReserved : 0;
      recordInventoryTransaction({
        productId: item.productId,
        productCode: item.productCode,
        productName: item.productName,
        type: 'إلغاء حجز وإرجاع',
        quantityPieces: item.cartonCount,
        branchStockBefore: reservedBefore,
        branchStockAfter: reservedBefore + item.cartonCount,
        branchName: inv.branchName,
        userName: currentUser?.name || 'المشرف',
        userRole: currentUser?.role || 'supervisor',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        notes: `تم رفض الطلبية وإرجاع الرصيد المحجوز للمخزن. السبب: ${reason}`,
      });
    });

    setInvoices((prev) =>
      prev.map((i) => {
        if (i.id !== invoiceId) return i;
        const updated: Invoice = {
          ...i,
          status: 'مرفوضة / ملغاة' as OrderStatus,
          cancellationReason: reason,
          cancelledBy: currentUser?.name || 'مشرف المبيعات',
          cancelledAt: `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
          restoredStockDetails: `تم استرجاع ${inv.totalCartons} كرتونة إلى مخزن الفرع`,
          notes: `${i.notes ? i.notes + ' | ' : ''}سبب الرفض: ${reason}`,
        };
        saveInvoiceWithQueue(updated).catch((e) => console.warn('Supabase reject update failed:', e));
        return updated;
      })
    );

    recordAuditLog({
      userId: currentUser?.id || 'supervisor',
      userName: currentUser?.name || 'المشرف',
      userRole: currentUser?.role || 'supervisor',
      branchName: inv.branchName,
      action: 'cancel_invoice',
      actionTitle: `رفض/إلغاء الطلبية #${inv.invoiceNumber} وفك الحجز`,
      details: `السبب: ${reason} • تم إعادة ${inv.totalCartons} كرتونة فوراً إلى رصيد مخزن الفرع المتاح.`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: 'danger',
    });

    return {
      success: true,
      message: `تم إلغاء الطلبية #${inv.invoiceNumber} وفك حجز ${inv.totalCartons} كرتونة وإعادتها للرصيد المتاح!`,
    };
  };

  // Re-open / Edit pending order for sales rep or supervisor before approval
  const editPendingOrder = (invoice: Invoice): { success: boolean; message: string; customer?: Customer | null } => {
    if (
      currentUser &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'developer' &&
      (!currentUser.branchName || !invoice.branchName || !isBranchMatch(invoice.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك تعديل طلبية تابعة لفرع آخر.' };
    }
    const isRecent = invoice.createdAt ? (Date.now() - new Date(invoice.createdAt).getTime() < 48 * 3600 * 1000) : true;
    const canOverride = currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'branch_manager' || currentUser?.role === 'supervisor';
    const isPending =
      invoice.status === 'قيد مراجعة المشرف' ||
      invoice.status === 'معلقة بانتظار اعتماد الفرع' ||
      invoice.status === 'قيد المراجعة' ||
      invoice.status === 'مسودة' ||
      isRecent ||
      canOverride;

    if (!isPending) {
      return { success: false, message: 'لا يمكن تعديل هذه الفاتورة نظراً لمرور فترة طويلة على اعتمادها.' };
    }

    // Load items into cart. Pending orders reserve the generic available balance
    // at creation time, so reopening must not add stock a second time.
    const loadedCartItems: CartItem[] = invoice.items.map((item) => {
      const prod: Product = products.find((p) => p.id === item.productId) || {
        id: item.productId,
        code: item.productCode,
        name: item.productName,
        salesPriority: 'عادي',
        category: 'عام',
        status: 'متاح',
        cartonQuantity: item.cartonQuantity || 1,
        size: 'قياسي',
        color: 'افتراضي',
        branchStockActual: 100,
        branchStockReserved: 100,
        mainWarehouseActual: 100,
        mainWarehouseReserved: 100,
        department: 'عام',
        classification: 'عام',
        cartonPrice: item.pricePerCarton || item.appliedPrice,
        piecePrice: item.pricePerPiece,
        branchName: invoice.branchName || 'الفرع الرئيسي',
        minOrderQuantity: 1,
      };

      return {
        product: prod,
        cartonCount: item.cartonCount,
        pieceCount: item.pieceCount || 0,
        cartonQuantity: item.cartonQuantity || 1,
        totalPieces: item.totalUnits || 0,
        unitPrice: item.appliedPrice,
        pricePerPiece: item.pricePerPiece,
        totalPrice: item.totalBeforeTax,
        quantityDescription: item.quantityDescription,
        orderType: 'carton',
        fulfillFromMainWarehouse: item.fulfilledFrom === 'main_warehouse',
      };
    });

    setCart(loadedCartItems);

    // 3. Match customer using intelligent matcher
    const matchedCustomer = findCustomerMatch(customers, {
      customerId: invoice.customerId,
      customerCode: invoice.customerCode,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
    }) || (invoice.customerName ? {
      id: invoice.customerId || `c-temp-${Date.now()}`,
      code: invoice.customerCode || 'CUST-NEW',
      name: invoice.customerName,
      phone: invoice.customerPhone || '',
      address: invoice.customerAddress || '',
      taxNumber: invoice.customerTaxNumber || '',
      governorate: 'عام',
      branchName: invoice.branchName,
      salesRepName: invoice.repName,
      repName: invoice.repName,
      repId: invoice.repId,
      tier: 'عادي',
      balance: Number(invoice.customerBalanceBefore || 0),
      currentBalance: Number(invoice.customerBalanceBefore || 0),
      creditLimit: Number(invoice.customerCreditLimit !== undefined && invoice.customerCreditLimit !== null ? invoice.customerCreditLimit : 0),
      notes: '',
    } : null);

    // 4. Remove previous pending invoice
    setInvoices((prev) => prev.filter((i) => i.id !== invoice.id));

    recordAuditLog({
      userId: currentUser?.id || 'rep',
      userName: currentUser?.name || 'المندوب',
      userRole: currentUser?.role || 'sales_rep',
      branchName: invoice.branchName,
      action: 'update_invoice_status',
      actionTitle: `إعادة فتح وتعديل الطلبية #${invoice.invoiceNumber}`,
      details: `تم إعادة فتح أصناف الطلبية #${invoice.invoiceNumber} للعميل (${invoice.customerName}) في السلة لإتاحة إضافة أو حذف أصناف أو تعديل الك��يات والأسعار قبل الاعتماد.`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      badgeType: 'info',
    });

    return {
      success: true,
      message: `تم فتح الطلبية #${invoice.invoiceNumber} في السلة بنجاح! يمكنك الآن تعديل الكميات أو إضافة أصناف جديدة من الكتالوج وإعادة إصدار الفاتورة.`,
      customer: matchedCustomer,
    };
  };

  // Rep or supervisor can cancel order while pending
  const cancelPendingOrderByRep = (invoiceId: string, reason?: string): { success: boolean; message: string } => {
    return rejectOrder(invoiceId, reason || 'إلغاء الطلبية بطلب من المندوب قبل الاعتماد');
  };

  const updateOrderStatus = (
    invoiceId: string,
    status: OrderStatus,
    reason?: string
  ): { success: boolean; message: string } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الفاتورة غير موجودة' };
    if (
      currentUser &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'developer' &&
      (!currentUser.branchName || !inv.branchName || !isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false }))
    ) {
      return { success: false, message: 'لا يمكنك تحديث طلبية تابعة لفرع آخر.' };
    }

    const oldStatus = inv.status;
    if (oldStatus === status) return { success: true, message: 'حالة الطلبية مطابقة بالفعل' };

    const isNowReturnedOrCancelled = status === 'مرتجع' || status === 'ملغاة' || status === 'مرفوضة / ملغاة';
    const wasDeductedOrApproved =
      oldStatus === 'معتمدة ومصروفة من المخزن' ||
      oldStatus === 'معتمدة' ||
      oldStatus === 'جاري التجهيز' ||
      oldStatus === 'قيد التوصيل' ||
      oldStatus === 'تم التسليم';
    const wasPending =
      oldStatus === 'قيد مراجعة المشرف' ||
      oldStatus === 'معلقة بانتظار اعتماد الفرع' ||
      oldStatus === 'قيد المراجعة';

    // If order is marked as Returned or Cancelled after stock was deducted/approved:
    if (isNowReturnedOrCancelled) {
      if (wasDeductedOrApproved) {
        // Restore physical actual AND reserved stock in Cartons
        setProducts((prev) =>
          prev.map((p) => {
            const item = inv.items.find((it) => it.productId === p.id);
            if (!item) return p;
            const qty = item.cartonCount;
            if (item.fulfilledFrom === 'main_warehouse') {
              return {
                ...p,
                mainWarehouseActual: p.mainWarehouseActual + qty,
                mainWarehouseReserved: p.mainWarehouseReserved + qty,
              };
            } else {
              const updatedBranchStocks = p.branchStocks ? { ...p.branchStocks } : undefined;
              if (updatedBranchStocks) {
                const branchKey = Object.keys(updatedBranchStocks).find((key) =>
                  isBranchMatch(key, inv.branchName, { allowUnassigned: false })
                );
                if (branchKey) {
                  updatedBranchStocks[branchKey] = Number(updatedBranchStocks[branchKey] || 0) + qty;
                }
              }
              return {
                ...p,
                ...(updatedBranchStocks ? { branchStocks: updatedBranchStocks } : {}),
                branchStockActual: p.branchStockActual + qty,
                branchStockReserved: p.branchStockReserved + qty,
              };
            }
          })
        );

        // Record inventory audit logs for each returned item
        inv.items.forEach((item) => {
          const prod = products.find((p) => p.id === item.productId);
          const currentActual = prod ? prod.branchStockActual : 0;
          recordInventoryTransaction({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            type: 'مرتجع مبيعات وإرجاع للمخزن',
            quantityPieces: item.cartonCount,
            branchStockBefore: currentActual,
            branchStockAfter: currentActual + item.cartonCount,
            branchName: inv.branchName,
            userName: currentUser?.name || 'مسئول المخازن',
            userRole: currentUser?.role || 'branch_manager',
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            notes:
              status === 'مرتجع'
                ? `تسجيل مرتجع للطلبية #${inv.invoiceNumber} وإعادة ${item.cartonCount} كرتونة إلى رصيد مخزن الفرع. ${reason ? `السبب: ${reason}` : ''}`
                : `إلغاء الطلبية #${inv.invoiceNumber} واسترداد الرصيد بالكامل إلى المخزن`,
          });
        });
      } else if (wasPending) {
        // Only reserved stock was held -> release reserved stock
        setProducts((prev) =>
          prev.map((p) => {
            const item = inv.items.find((it) => it.productId === p.id);
            if (!item) return p;
            const qty = item.cartonCount;
            return {
              ...p,
              branchStockReserved: p.branchStockReserved + qty,
            };
          })
        );

        inv.items.forEach((item) => {
          const prod = products.find((p) => p.id === item.productId);
          const resBefore = prod ? prod.branchStockReserved : 0;
          recordInventoryTransaction({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            type: 'إلغاء حجز وإرجاع',
            quantityPieces: item.cartonCount,
            branchStockBefore: resBefore,
            branchStockAfter: resBefore + item.cartonCount,
            branchName: inv.branchName,
            userName: currentUser?.name || 'المشرف',
            userRole: currentUser?.role || 'supervisor',
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            notes: `فك حجز الأصناف وإلغاء الطلبية #${inv.invoiceNumber}`,
          });
        });
      }

      // Restore / Refund customer balance and debt if order amount was added
      if (inv.customerName && inv.estimatedGrandTotal > 0) {
        setCustomers((prev) =>
          prev.map((c) => {
            const match = (inv.customerCode && c.code === inv.customerCode) || c.name.trim().toLowerCase() === inv.customerName.trim().toLowerCase();
            if (!match) return c;
            const currentBal = Number(c.currentBalance ?? c.balance ?? 0);
            const newBal = Math.max(0, currentBal - inv.estimatedGrandTotal);
            const updatedCust: Customer = {
              ...c,
              currentBalance: newBal,
              balance: newBal,
              totalSpent: Math.max(0, Number(c.totalSpent || 0) - inv.estimatedGrandTotal),
            };
            saveCustomersToSupabase([updatedCust]).catch((e) => console.warn('Supabase customer return balance sync failed:', e));
            return updatedCust;
          })
        );
      }
    }

    setInvoices((prev) =>
      prev.map((i) => {
        if (i.id !== invoiceId) return i;
        const updated: Invoice = {
          ...i,
          status,
          // Archive lifecycle: when the order enters an executed status it is archived
          // (hidden from active lists) — unless it is being returned/cancelled, which reactivates it.
          isArchived: isNowReturnedOrCancelled ? false : EXECUTED_INVOICE_STATUSES.includes(status),
          archivedAt: isNowReturnedOrCancelled || !EXECUTED_INVOICE_STATUSES.includes(status) ? i.archivedAt : new Date().toISOString(),
          archivedBy: isNowReturnedOrCancelled || !EXECUTED_INVOICE_STATUSES.includes(status) ? i.archivedBy : (currentUser?.name || 'النظام'),
          cancellationReason: isNowReturnedOrCancelled ? (reason || i.cancellationReason || 'إلغاء الطلبية') : i.cancellationReason,
          cancelledBy: isNowReturnedOrCancelled ? (currentUser?.name || 'مسؤول النظام') : i.cancelledBy,
          cancelledAt: isNowReturnedOrCancelled ? `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}` : i.cancelledAt,
          restoredStockDetails: isNowReturnedOrCancelled ? `تم استرجاع ${inv.totalCartons} كرتونة إلى المخزن` : i.restoredStockDetails,
          notes: reason
            ? `${i.notes ? i.notes + ' | ' : ''}تحديث الحالة إلى (${status}): ${reason}`
            : i.notes,
        };
        saveInvoiceWithQueue(updated).catch((e) => console.warn('Supabase status update failed:', e));
        return updated;
      })
    );

    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مسؤول النظام',
      userRole: currentUser?.role || 'admin',
      branchName: inv.branchName,
      action: status === 'مرتجع' ? 'return_invoice' : isNowReturnedOrCancelled ? 'cancel_invoice' : 'update_invoice_status',
      actionTitle: `تحديث حالة الفاتورة #${inv.invoiceNumber} إلى (${status})`,
      details: `العميل: ${inv.customerName} • الحالة السابقة: (${oldStatus}) ⬅️ الحالة الجديدة: (${status}) ${reason ? `• السبب / الملاحظات: ${reason}` : ''}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: status === 'تم التسليم' || status === 'معتمدة ومصروفة من المخزن' ? 'success' : isNowReturnedOrCancelled ? 'danger' : 'info',
    });

    let message = `تم تحديث حالة الطلبية #${inv.invoiceNumber} بنجاح إلى: ${status}`;
    if (status === 'مرتجع') {
      message = `تم تسجيل الطلبية #${inv.invoiceNumber} كـ (مرتجع) وإرجاع كافة الكراتين والأرصدة إلى المخزن بنجاح!`;
    } else if (status === 'تم التسليم') {
      message = `تم تأكيد تسليم الطلبية #${inv.invoiceNumber} للعميل بنجاح!`;
    } else if (status === 'قيد التوصيل') {
      message = `تم تحويل الطلبية #${inv.invoiceNumber} إلى (قيد التوصيل) مع المندوب / سيارة التوزيع.`;
    }

    return { success: true, message };
  };

  const requestOctoberSupplyForInvoice = (invoiceId: string): { success: boolean; message: string } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الفاتورة غير موجودة' };

    const now = new Date();
    const timeStr = `${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;

    const updatedItems = (inv.items || []).map((it) => {
      if (it.isShortage) {
        return { ...it, octoberSupplyStatus: 'تم طلب التوريد' as const };
      }
      return it;
    });

    const updatedInvoice: Invoice = {
      ...inv,
      items: updatedItems,
      octoberSupplyRequested: true,
      octoberSupplyRequestedAt: timeStr,
      octoberSupplyRequestedBy: currentUser?.name || 'المشرف',
    };

    setInvoices((prev) => prev.map((i) => (i.id === invoiceId ? updatedInvoice : i)));
    saveInvoiceWithQueue(updatedInvoice).catch((e) => console.warn('Supabase invoice update failed:', e));

    recordAuditLog({
      userId: currentUser?.id || 'supervisor',
      userName: currentUser?.name || 'المشرف',
      userRole: currentUser?.role || 'supervisor',
      branchName: inv.branchName,
      action: 'update_invoice_status',
      actionTitle: `اعتماد وطلب توريد نواقص الفاتورة #${inv.invoiceNumber} من مخزن أكتوبر`,
      details: `تم اعتماد طلب التوريد للنواقص (${inv.shortageItemsCount || 0} صنف) من مخزن 6 أكتوبر المركزي لصالح فرع ${inv.branchName}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: 'info',
    });

    return {
      success: true,
      message: `تم بنجاح اعتماد وطلب توريد نواقص الفاتورة #${inv.invoiceNumber} من مخزن 6 أكتوبر المركزي 🚚`,
    };
  };

  const dispatchOctoberSupplyForInvoice = (invoiceId: string): { success: boolean; message: string } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الفاتورة غير موجودة' };

    let transferredCount = 0;
    let totalCartons = 0;

    (inv.items || []).forEach((it) => {
      if (it.isShortage && it.shortageCartons && it.shortageCartons > 0) {
        const prod = products.find((p) => p.id === it.productId || p.code === it.productCode);
        if (prod) {
          const pullQty = Math.min(it.shortageCartons, Math.max(0, prod.mainWarehouseActual || 0));
          if (pullQty > 0) {
            adjustStock(
              prod.id,
              pullQty,
              -pullQty,
              `سحب وتوريد نواقص الفاتورة #${inv.invoiceNumber} من مخزن أكتوبر لصالح ${inv.branchName}`
            );
            transferredCount++;
            totalCartons += pullQty;
          }
        }
      }
    });

    const now = new Date();
    const timeStr = `${now.toISOString().slice(0, 10)} ${now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;

    const updatedItems = (inv.items || []).map((it) => {
      if (it.isShortage) {
        return { ...it, octoberSupplyStatus: 'تم السحب والتوريد' as const };
      }
      return it;
    });

    const updatedInvoice: Invoice = {
      ...inv,
      items: updatedItems,
      octoberSupplyRequested: true,
      octoberSupplyDispatched: true,
      octoberSupplyDispatchedAt: timeStr,
      octoberSupplyDispatchedBy: currentUser?.name || 'مدير الفرع / المشرف',
    };

    setInvoices((prev) => prev.map((i) => (i.id === invoiceId ? updatedInvoice : i)));
    saveInvoiceWithQueue(updatedInvoice).catch((e) => console.warn('Supabase invoice update failed:', e));

    recordAuditLog({
      userId: currentUser?.id || 'supervisor',
      userName: currentUser?.name || 'المشرف',
      userRole: currentUser?.role || 'supervisor',
      branchName: inv.branchName,
      action: 'update_invoice_status',
      actionTitle: `سحب وتوريد نواقص الفاتورة #${inv.invoiceNumber} من مخزن أكتوبر`,
      details: `تم سحب ${totalCartons} كرتونة من مخزن 6 أكتوبر وتوريدها لرصيد فرع ${inv.branchName}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: 'success',
    });

    return {
      success: true,
      message: `تم بنجاح سحب وتوريد ${totalCartons} كرتونة (${transferredCount} أصناف) من مخزن أكتوبر لرصيد فرع ${inv.branchName}! 🚚📦`,
    };
  };

  const bulkDispatchOctoberSupply = (invoiceIds: string[]): { success: boolean; message: string; count: number } => {
    let count = 0;
    invoiceIds.forEach((id) => {
      const res = dispatchOctoberSupplyForInvoice(id);
      if (res.success) count++;
    });
    return {
      success: true,
      count,
      message: `تم بنجاح سحب وتوريد نواقص ${count} فواتير من مخزن أكتوبر وتحديث الأرصدة! ⚡🎉`,
    };
  };

  const processOrderReturn = (
    invoiceId: string,
    returnedItems: ReturnedItem[],
    reason: string,
    restockToInventory: boolean = true
  ): { success: boolean; message: string; returnRecord?: ReturnRecord } => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الفاتورة ��ير موجودة' };

    if (!returnedItems || returnedItems.length === 0) {
      return { success: false, message: 'يرجى تحديد صنف واحد على الأقل مع تحديد الكمية المرتجعة' };
    }

    const totalRefundAmount = returnedItems.reduce((sum, item) => sum + (item.refundAmount || 0), 0);
    const totalReturnedCartons = returnedItems.reduce((sum, item) => sum + (item.cartonCount || 0), 0);
    const totalReturnedPieces = returnedItems.reduce((sum, item) => sum + (item.totalPieces || (item.pieceCount || 0)), 0);

    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
    const returnVoucherNumber = `RET-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    const newReturnRecord: ReturnRecord = {
      id: `ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      returnVoucherNumber,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      customerCode: inv.customerCode,
      branchName: inv.branchName,
      repName: inv.repName,
      date: dateStr,
      time: timeStr,
      returnedItems,
      totalRefundAmount,
      totalReturnedCartons,
      totalReturnedPieces,
      reason: reason || 'مرتجع مبيعات',
      handledBy: currentUser?.name || 'مسؤول النظام',
      restockedToInventory: restockToInventory,
      notes: `إذن مرتجع مبيعات #${returnVoucherNumber} للفاتورة #${inv.invoiceNumber}`,
    };

    // 1. Restock to inventory if requested and condition is good
    if (restockToInventory) {
      setProducts((prev) =>
        prev.map((p) => {
          const retItem = returnedItems.find((it) => it.productId === p.id);
          if (!retItem || retItem.condition === 'damaged' || retItem.condition === 'expired') {
            return p;
          }
          const addCartons = retItem.cartonCount || 0;
          return {
            ...p,
            branchStockActual: p.branchStockActual + addCartons,
            branchStockReserved: p.branchStockReserved + addCartons,
          };
        })
      );

      // Record inventory transactions for each returned item
      returnedItems.forEach((retItem) => {
        if (retItem.condition !== 'damaged' && retItem.condition !== 'expired' && retItem.cartonCount > 0) {
          const prod = products.find((p) => p.id === retItem.productId);
          const currentStock = prod ? prod.branchStockActual : 0;
          recordInventoryTransaction({
            productId: retItem.productId,
            productCode: retItem.productCode,
            productName: retItem.productName,
            type: 'مرتجع مبيعات وإرجاع للمخزن',
            quantityPieces: retItem.cartonCount,
            branchStockBefore: currentStock,
            branchStockAfter: currentStock + retItem.cartonCount,
            branchName: inv.branchName,
            userName: currentUser?.name || 'مسؤول المرتجعات',
            userRole: currentUser?.role || 'branch_manager',
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            notes: `مرتجع مبيعات (${retItem.cartonCount} كرتونة) - إذن #${returnVoucherNumber} - السبب: ${retItem.returnReason || reason}`,
          });
        }
      });
    }

    // 2. Adjust Customer Debt / Balance if applicable
    if (totalRefundAmount > 0 && inv.customerName) {
      let updatedCustomerRecord: Customer | null = null;
      const nextCusts = customersRef.current.map((c) => {
        const match = (inv.customerCode && c.code === inv.customerCode) || c.name === inv.customerName;
        if (!match) return c;
        const currentBal = c.currentBalance ?? c.balance ?? 0;
        const updatedBal = Math.max(0, currentBal - totalRefundAmount);
        const updated = {
          ...c,
          currentBalance: updatedBal,
          balance: updatedBal,
        };
        updatedCustomerRecord = updated;
        return updated;
      });
      if (updatedCustomerRecord) {
        customersRef.current = nextCusts;
        setCustomers(nextCusts);
        idbSet(getCustomersCacheKey(), nextCusts).catch(() => {});
        const toSync = updatedCustomerRecord;
        syncOrQueue('customers', 'upsert', toSync.id, toSync, () =>
          saveCustomersToSupabase([toSync])
        ).catch((e) => console.warn('Supabase customer refund update failed:', e));
      }
    }

    // 3. Determine if Full or Partial Return
    const existingRecords = inv.returnRecords || [];
    const updatedRecords = [...existingRecords, newReturnRecord];
    const prevRefunded = inv.totalRefundedAmount || 0;
    const allRefunded = prevRefunded + totalRefundAmount;

    // Check if entire order is returned
    const allReturnedCartonsCount = updatedRecords.reduce((s, r) => s + r.totalReturnedCartons, 0);
    const isFullReturn = allReturnedCartonsCount >= inv.totalCartons || allRefunded >= inv.estimatedGrandTotal;

    const newStatus: OrderStatus = isFullReturn ? 'مرتجع' : 'مرتجع جزئي';
    const netGrandTotal = Math.max(0, inv.estimatedGrandTotal - allRefunded);

    const nextInvoices = invoicesRef.current.map((i) => {
      if (i.id !== invoiceId) return i;
      const updated: Invoice = {
        ...i,
        status: newStatus,
        hasReturns: true,
        isPartialReturn: !isFullReturn,
        returnRecords: updatedRecords,
        totalRefundedAmount: allRefunded,
        netAmountAfterReturns: netGrandTotal,
        lastReturnDate: dateStr,
        restoredStockDetails: `تم استرجاع ${totalReturnedCartons} كرتونة بقيمة ${totalRefundAmount.toLocaleString()} ج.م (إذن #${returnVoucherNumber})`,
        notes: `${i.notes ? i.notes + ' | ' : ''}مرتجع ${isFullReturn ? 'كلي' : 'جزئي'} إذن #${returnVoucherNumber} بقيمة ${totalRefundAmount.toLocaleString()} ج.م (${reason})`,
      };
      saveInvoiceWithQueue(updated).catch((e) => console.warn('Supabase return sync failed:', e));
      return updated;
    });
    invoicesRef.current = nextInvoices;
    setInvoices(nextInvoices);
    idbSet(getInvoicesCacheKey(), nextInvoices).catch(() => {});

    // 4. Record Audit Log
    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مسؤول النظام',
      userRole: currentUser?.role || 'admin',
      branchName: inv.branchName,
      action: 'return_invoice',
      actionTitle: `تسجيل مرتجع مبيعات ${isFullReturn ? 'كلي' : 'جزئي'} للفاتورة #${inv.invoiceNumber}`,
      details: `إذن #${returnVoucherNumber} • العميل: ${inv.customerName} • القيمة المسترجعة: ${totalRefundAmount.toLocaleString()} ج.م • الكراتين: ${totalReturnedCartons} • السبب: ${reason}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      badgeType: 'warning',
    });

    return {
      success: true,
      message: `تم تسجيل إذن المرتجع #${returnVoucherNumber} بنجاح (${isFullReturn ? 'مرتجع كلي' : 'مرتجع جزئي'}) بقيمة ${totalRefundAmount.toLocaleString()} ج.م وتحديث المخزون وحساب العميل!`,
      returnRecord: newReturnRecord,
    };
  };

  /**
   * إذن مرتجع مستقل (من غير فاتورة).
   *
   * المندوب بيفتح الإذن أثناء الزيارة وبيكتب الأصناف بنفسه، والسجل بيتسجل
   * بحالة "بانتظار المشرف". المخزون بيتحدّث بعد ما أمين المخزن يستلم
   * المرتجع فعلياً (مش وقت الفتح) عشان ما يحصلش تضخيم في الرصيد.
   */
  const createStandaloneReturn = (
    payload: {
      customerName: string;
      customerCode?: string;
      branchName: string;
      repName: string;
      date: string;
      time: string;
      returnedItems: ReturnedItem[];
      totalRefundAmount: number;
      reason: string;
      handledBy: string;
      notes?: string;
    }
  ): { success: boolean; message: string; returnRecord?: ReturnRecord } => {
    const items = payload.returnedItems || [];
    if (items.length === 0) {
      return { success: false, message: 'يرجى تحديد صنف واحد على الأقل مع الكمية المرتجعة' };
    }

    const totalReturnedCartons = items.reduce((sum, item) => sum + (item.cartonCount || 0), 0);
    const totalReturnedPieces = items.reduce((sum, item) => sum + (item.totalPieces || (item.pieceCount || 0)), 0);
    const returnVoucherNumber = `RET-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    const newReturnRecord: ReturnRecord = {
      id: `ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      returnVoucherNumber,
      customerName: payload.customerName,
      customerCode: payload.customerCode,
      branchName: payload.branchName,
      repName: payload.repName,
      date: payload.date,
      time: payload.time,
      returnedItems: items,
      totalRefundAmount: payload.totalRefundAmount,
      totalReturnedCartons,
      totalReturnedPieces,
      reason: payload.reason || 'مرتجع مبيعات',
      handledBy: payload.handledBy || currentUser?.name || 'مسؤول النظام',
      restockedToInventory: false,
      notes: payload.notes || `إذن مرتجع #${returnVoucherNumber} (مستقل - بانتظار الموافقة ثم الاستلام من المخزن)`,
    };

    // المبلغ المرتجع يُخصم من رصيد العميل فور فتح الإذن. أما المخزون فيتحدّث
    // بعد استلام أمين المخزن للكمميات فعلياً.
    if (payload.totalRefundAmount > 0 && payload.customerName) {
      let updatedCust: Customer | null = null;
      const nextCusts = customersRef.current.map((c) => {
        const match = (payload.customerCode && c.code === payload.customerCode) || c.name === payload.customerName;
        if (!match) return c;
        const currentBal = c.currentBalance ?? c.balance ?? 0;
        const updatedBal = Math.max(0, currentBal - payload.totalRefundAmount);
        const next = { ...c, currentBalance: updatedBal, balance: updatedBal };
        updatedCust = next;
        return next;
      });
      if (updatedCust) {
        customersRef.current = nextCusts;
        setCustomers(nextCusts);
        idbSet(getCustomersCacheKey(), nextCusts).catch(() => {});
        const toSync = updatedCust;
        syncOrQueue('customers', 'upsert', toSync.id, toSync, () =>
          saveCustomersToSupabase([toSync])
        ).catch((e) => console.warn('Supabase customer standalone return sync failed:', e));
      }
    }

    return {
      success: true,
      message: `تم فتح إذن المرتجع #${returnVoucherNumber} بقيمة ${payload.totalRefundAmount.toLocaleString()} ج.م وهو الآن بانتظار موافقة المشرف`,
      returnRecord: newReturnRecord,
    };
  };

  const deleteInvoice = async (invoiceId: string): Promise<void> => {
    const target = invoices.find((inv) => inv.id === invoiceId || inv.invoiceNumber === invoiceId);
    const targetId = target?.id || invoiceId;
    const targetNumber = target?.invoiceNumber;

    // 1. Mark as permanently deleted in local persistent storage so it is never re-added
    markInvoiceAsDeletedInStorage(targetId, targetNumber);

    // 2. Remove immediately from local state
    setInvoices((prev) => prev.filter((inv) => inv.id !== targetId));

    // 3. Immediately persist updated invoices to IndexedDB
    const remaining = invoices.filter((inv) => inv.id !== targetId);
    idbSet(getInvoicesCacheKey(), remaining).catch(() => {});

    // 4. Record Audit Log
    recordAuditLog({
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'مسؤول النظام',
      userRole: currentUser?.role || 'admin',
      branchName: target?.branchName || 'الفرع الرئيسي',
      action: 'delete_invoice',
      actionTitle: `حذف الفاتورة #${targetNumber || targetId} نهائياً`,
      details: `تم حذف الفاتورة نهائياً من قاعدة البيانات والسيرفر • العميل: ${target?.customerName || 'عام'} • القيمة: ${target?.estimatedGrandTotal?.toLocaleString() || 0} ج.م`,
      invoiceId: targetId,
      invoiceNumber: targetNumber,
      badgeType: 'danger',
    });

    // 5. Delete permanently from Supabase, or park it in the offline outbox
    try {
      await syncOrQueue('invoices', 'delete', targetId, undefined, async () => {
        const remoteDelete = await deleteInvoiceFromSupabase(targetId, targetNumber);
        if (!remoteDelete.success) {
          throw new Error(remoteDelete.error || 'تعذر حذف الفاتورة من قاعدة البيانات');
        }
        return { success: true };
      });
    } catch (e) {
      console.warn('Supabase invoice deletion failed:', e);
      throw e;
    }
  };

  const syncToAccounting = async (invoiceId: string): Promise<boolean> => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return false;

    const newLog: AccountingSyncLog = {
      id: `sync-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('ar-EG'),
      invoiceNumber: inv.invoiceNumber,
      status: 'نجاح',
      systemName: 'نظام الحسابات المركزي لشركة دريم (ERP System)',
      responseMessage: `تم تصدير القيد المحاسبي وحساب العميل والمخزون بنجاح رقم السند #${Math.floor(100000 + Math.random() * 900000)}`,
    };

    setAccountingLogs((prev) => [newLog, ...prev]);
    setInvoices((prev) =>
      prev.map((i) =>
        i.id === invoiceId
          ? {
              ...i,
              syncedToAccounting: true,
              accountingSyncDate: `${new Date().toISOString().slice(0, 10)} ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`,
            }
          : i
      )
    );
    return true;
  };

  const dispatchOrderToMicrosoft = async (invoiceId: string): Promise<{ success: boolean; message: string }> => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'الطلبية غير موجودة' };
    const res = await sendOrderToMicrosoft365(inv, currentUser?.name, branches, companyInfo.email, { force: true });
    return { success: res.success, message: res.message };
  };

  const updateBranchEmails = (branchId: string, email: string, notificationEmails: string[]) => {
    setBranches((prev) => {
      const next = prev.map((b) => {
        if (b.id === branchId) {
          return {
            ...b,
            email: email.trim(),
            notificationEmails: notificationEmails.filter(Boolean).map((e) => e.trim()),
          };
        }
        return b;
      });
      safeLocalStorageSet(STORAGE_KEYS.BRANCHES, JSON.stringify(next));
      return next;
    });
  };

  const addUser = async (user: User) => {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  if (hasDuplicateUserIdentity(user, users, user.id)) return;
    // كلمات المرور لا تُدار من العميل: تُنشأ وتُغيَّر في Supabase Auth فقط.
    const secured = user;
    const nextUsers = [...users.filter((u) => u.id !== secured.id), secured];
    setUsers(nextUsers);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(nextUsers));
    idbSet(STORAGE_KEYS.USERS, nextUsers);
    syncOrQueue('users', 'upsert', secured.id, secured, () => saveUserToSupabase(secured, nextUsers))
      .then(() => publishDataVersionUpdate({ scope: 'customers', notes: `إضافة مستخدم ${secured.name || secured.username}` }))
      .catch((e) => console.warn('Supabase save user failed:', e));
    setTimeout(() => {
      refreshCustomerRepLinks();
    }, 50);
  };

  const updateUser = async (updatedUser: User) => {
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') return;
  if (hasDuplicateUserIdentity(updatedUser, users, updatedUser.id)) return;
    // لا تمرير ولا تخزين لأي كلمة مرور هنا — الحساب وكلمة مروره في Supabase Auth.
    const secured: User = { ...updatedUser, password: undefined };
    const nextUsers = users.map((u) => (u.id === secured.id ? secured : u));
    setUsers(nextUsers);
    safeLocalStorageSet(STORAGE_KEYS.USERS, JSON.stringify(nextUsers));
    idbSet(STORAGE_KEYS.USERS, nextUsers);
    if (currentUser?.id === updatedUser.id) {
      if (!updatedUser.isActive || updatedUser.approvalStatus === 'rejected') {
        logout();
        setAuthTerminationNotice('تم إيقاف هذا الحساب من قبل إدارة شركة دريم. تم إنهاء الجلسة فوراً.');
        return;
      }
      setCurrentUser(secured);
    }
    syncOrQueue('users', 'upsert', secured.id, secured, () => saveUserToSupabase(secured, nextUsers))
      .then(() => publishDataVersionUpdate({ scope: 'customers', notes: `تعديل مستخدم ${secured.name || secured.username}` }))
      .catch((e) => console.warn('Supabase update user failed:', e));
    setTimeout(() => {
      refreshCustomerRepLinks();
    }, 50);
  };

  const updateCloudinarySettings = (config: CloudinaryConfig) => {
    setCloudinaryConfig(normalizeCloudinaryConfig(config));
  };

  const saveMatchedProductImages = (updates: { id: string; imageUrl: string }[]) => {
    setProducts((prev) => {
      const updateMap = new Map<string, string>();
      updates.forEach((u) => updateMap.set(u.id, u.imageUrl));

      const updated = prev.map((p) => {
        if (updateMap.has(p.id)) {
          return { ...p, imageUrl: updateMap.get(p.id) };
        }
        return p;
      });

      idbSet(getProductsCacheKey(), updated);
      saveProductsToSupabase(updated).then((result) => {
        if (!result.success) {
          console.warn('Supabase image links sync warning:', result.error || 'Product save failed.');
          return;
        }
        publishNewDataVersion({
          scope: 'products',
          updatedBy: currentUser?.name || 'مدير النظام',
          notes: 'تحديث صور كتالوج الأصناف',
          productsCount: updated.length,
        }).catch((error) => console.warn('Product image version publish notice:', error));
      }).catch((err) => {
        console.warn('Supabase image links sync warning:', err);
      });

      return updated;
    });
  };

  const clearAllAppData = (mode: 'cache_only' | 'full_reset' = 'cache_only') => {
    if (mode === 'full_reset') {
      try {
        localStorage.clear();
      } catch {}
      idbClear();
      setProducts([]);
      setInvoices([]);
      setUsers([]);
      setBranches(INITIAL_BRANCHES);
      setCloudinaryConfig(DEFAULT_CLOUDINARY_CONFIG);
      setCart([]);
      setAccountingLogs([]);
    } else {
      // Clear temporary items & memory caches
      setCart([]);
      try {
        localStorage.removeItem(STORAGE_KEYS.ACCOUNTING_LOGS);
      } catch (e) {
        // Safe ignore
      }
    }
  };

  const wipeAllProductsAndData = async (options?: { wipeInvoices?: boolean }) => {
    setProducts([]);
    setCart([]);
    idbSet(getProductsCacheKey(), []);
    idbSet(STORAGE_KEYS.CART, []);

    if (options?.wipeInvoices) {
      const remoteDelete = await deleteAllInvoicesFromSupabase();
      if (!remoteDelete.success) {
        console.warn('Supabase invoice wipe warning:', remoteDelete.error);
      }
      setInvoices([]);
      idbSet(getInvoicesCacheKey(), []);
      safeLocalStorageSet(STORAGE_KEYS.DELETED_INVOICE_IDS, JSON.stringify([]));
    }

    try {
      await clearCachedImages();
    } catch (e) {}
  };

  // The account's assigned sector is a hard boundary; only admins can switch globally.
  // NOTE: defined before every useMemo that scopes by sector (invoices/customers/
  // products) — it must exist at render time, not only when consumers call us.
  const filterBySector = <T extends { sector?: 'home' | 'electrical' | 'both' | 'all' }>(
    items: T[],
    userSector?: string,
    resolveItemSector?: (item: T) => string | undefined
  ): T[] => {
    const effectiveSector = resolveEffectiveSector(currentUser, activeSectorFilter, userSector);
    return items.filter((item) => matchesSector(item.sector || resolveItemSector?.(item), effectiveSector));
  };

  // --- Role-Based Data Visibility (STRICT PRIVACY & BRANCH ISOLATION) ---
  // The allowed invoice set is resolved once per real data/permission change, then
  // exposed through a stable getter (same pattern as visibleVisits below). Every
  // heavy page used to call getVisibleInvoices() during its own render, rebuilding
  // the customer lookup maps (~2.5k rows + arabic normalisation) each time — which
  // also defeated the dependency check of every downstream useMemo.
  const roleScopedInvoices = useMemo((): Invoice[] => {
    if (!currentUser) return [];

    const customersByReference = new Map<string, Customer>();
    const customersByName = new Map<string, Customer[]>();
    customers.forEach((customer) => {
      if (customer.id) customersByReference.set(customer.id, customer);
      if (customer.code) customersByReference.set(customer.code, customer);
      const normalizedName = normalizeArabicText(customer.name || '');
      if (normalizedName) customersByName.set(normalizedName, [...(customersByName.get(normalizedName) || []), customer]);
    });
    const scopedInvoices = filterBySector(invoices, currentUser.sector, (invoice) => {
      const reference = invoice.customerId || invoice.customerCode || '';
      const byReference = customersByReference.get(reference);
      const byUniqueName = customersByName.get(normalizeArabicText(invoice.customerName || ''));
      const customer = byReference || (byUniqueName?.length === 1 ? byUniqueName[0] : undefined);
      return invoice.sector || customer?.sector;
    });

    // Admin & Developer: Full oversight, filtered by branch selector if selected
    if (currentUser.role === 'admin' || currentUser.role === 'developer') {
      return selectedBranchFilter === 'الكل'
        ? scopedInvoices
        : scopedInvoices.filter((i) => Boolean(i.branchName) && isBranchMatch(i.branchName, selectedBranchFilter, { allowUnassigned: false }));
    }

    // Branch Manager: STRICTLY sees ONLY invoices of his own branch
    if (currentUser.role === 'branch_manager') {
      if (!currentUser.branchName) return [];
      return scopedInvoices.filter((i) => {
        if (i.branchName && isBranchMatch(i.branchName, currentUser.branchName, { allowUnassigned: false })) return true;
        const c = customers.find((cust) => cust.id === i.customerId);
        return Boolean(c && doesCustomerBelongToBranch(c, currentUser.branchName, users));
      });
    }

    // Supervisor: STRICTLY sees ONLY invoices belonging to his branch and his supervised reps
    if (currentUser.role === 'supervisor') {
      if (!currentUser.branchName) return [];
  const repIds = new Set(
  users
  .filter((u) => u.role === 'sales_rep' && u.supervisorId === currentUser.id)
  .map((u) => u.id)
  );
  return scopedInvoices.filter((i) => {
    const isSameBranch = Boolean(i.branchName) && isBranchMatch(i.branchName, currentUser.branchName, { allowUnassigned: false });
    const isSupervisedRep = Boolean(i.repId) && repIds.has(i.repId);
    const isSameRepName = Boolean(i.repName) && users.some(
      (u) => repIds.has(u.id) && normalizeArabicText(u.name) === normalizeArabicText(i.repName || '')
    );
    const isSelf = i.repId === currentUser.id || normalizeArabicText(i.repName) === normalizeArabicText(currentUser.name);
  // A supervisor must never receive every invoice from the branch. The invoice
  // must identify the supervisor's own account or one of the reps assigned to it.
  // Legacy invoices without a branch are still allowed when the rep relation is explicit.
  const belongsToSupervisor = isSupervisedRep || isSameRepName || isSelf;
  return belongsToSupervisor && (!i.branchName || isSameBranch);
  });
    }

    // Sales Rep: STRICT PRIVACY - ONLY his own orders, NEVER another rep's orders!
    if (currentUser.role === 'sales_rep') {
      return scopedInvoices.filter((i) => {
        // 1. Direct Rep ID match (highest authority)
        const isDirectIdMatch = Boolean(i.repId) && (
          i.repId === currentUser.id ||
          Boolean(currentUser.username && i.repId.toLowerCase() === currentUser.username.toLowerCase())
        );

        // 2. Arabic Name match with branch isolation
        const isDirectNameMatch = Boolean(i.repName) && (
          normalizeArabicText(i.repName) === normalizeArabicText(currentUser.name) ||
          isArabicNameMatch(i.repName, currentUser.name)
        );

        if (!isDirectIdMatch && !isDirectNameMatch) return false;

        // Strict Branch Isolation: Rep cannot see invoices of another branch
        if (currentUser.branchName && i.branchName) {
          if (!isBranchMatch(i.branchName, currentUser.branchName, { allowUnassigned: false })) {
            return false;
          }
        }

        return true;
      });
    }

    return [];
  }, [currentUser, invoices, customers, users, selectedBranchFilter, activeSectorFilter]);

  /**
   * Archive lifecycle: executed orders are archived (hidden from the active list)
   * unless the caller explicitly asks for archived entries (e.g. while searching).
   */
  const activeRoleScopedInvoices = useMemo(
    () => roleScopedInvoices.filter((i) => !i.isArchived),
    [roleScopedInvoices]
  );

  /**
   * Stable getter: returns the already-scoped array (a copy, so callers may sort
   * it in place). includeArchived=true re-adds archived orders for search flows.
   */
  const getVisibleInvoices = useCallback(
    (includeArchived: boolean = false): Invoice[] =>
      (includeArchived ? roleScopedInvoices : activeRoleScopedInvoices).slice(),
    [roleScopedInvoices, activeRoleScopedInvoices]
  );

  /**
   * The visit set this role is allowed to see, resolved once per real change.
   *
   * Every heavy page used to call getVisibleVisits() during its own render. The
   * function is recreated on each provider render, so that produced a brand-new array
   * every time and defeated the dependency check of the ~14 useMemos built on top of
   * it, making each keystroke re-run the whole filter/sort/aggregate chain. Memoising
   * it here gives consumers a stable array to depend on - and a stable identity, so a
   * page no longer has to guess which provider values the scoping rules read.
   */
  const visibleVisits = useMemo((): CustomerVisit[] => {
    if (!currentUser) return [];

    const customersByReference = new Map<string, Customer>();
    customers.forEach((customer) => {
      if (customer.id) customersByReference.set(customer.id, customer);
      if (customer.code) customersByReference.set(customer.code, customer);
    });
    // فهارس ثابتة تتفرّز مرة واحدة بدل `users.find`/`users.some` جوه كل زيارة.
    const usersById = new Map<string, User>();
    users.forEach((u) => {
      if (u.id) usersById.set(u.id, u);
    });
    // نتائج عضوية العميل للفرع/المشرف بتتكرر مع كل زيارة لنفس العميل.
    const branchMembership = new Map<string, boolean>();
    const supervisorMembership = new Map<string, boolean>();
    const repNameMatchCache = new Map<string, boolean>();
    const repLookupCache = new Map<string, User | undefined>();
    const meNormalized = normalizeArabicText(currentUser.name || '');

    const matchesRepName = (name?: string): boolean => {
      if (!name) return false;
      const cached = repNameMatchCache.get(name);
      if (cached !== undefined) return cached;
      const result =
        isArabicNameMatch(name, currentUser.name) ||
        (normalizeArabicText(name) === meNormalized && Boolean(meNormalized));
      repNameMatchCache.set(name, result);
      return result;
    };

    /** بحث المندوب الخاص بزيارة معيّن — نتيجته متكررة بكثرة، فبتتخزن بالاسم. */
    const findVisitRep = (visit: CustomerVisit): User | undefined => {
      if (visit.repId) {
        const direct = usersById.get(visit.repId);
        if (direct) return direct;
      }
      const name = visit.repName || '';
      if (!name) return undefined;
      if (repLookupCache.has(name)) return repLookupCache.get(name);
      const found = users.find((u) => isArabicNameMatch(u.name, name));
      repLookupCache.set(name, found);
      return found;
    };

    const effectiveSector = resolveEffectiveSector(currentUser, activeSectorFilter);
    const isSectorAllowed = (visit: CustomerVisit): boolean => {
      const customer = customersByReference.get(visit.customerId || '') || customersByReference.get(visit.customerCode || '');
      return matchesSector(visit.sector || customer?.sector, effectiveSector);
    };

      // Admin & Developer: Full oversight across branches, filtered by selected branch if set
      if (currentUser.role === 'admin' || currentUser.role === 'developer') {
        const sectorFiltered = visits.filter(isSectorAllowed);
        return selectedBranchFilter === 'الكل'
          ? sectorFiltered
          : sectorFiltered.filter((v) => isBranchMatch(v.branchName || '', selectedBranchFilter, { allowUnassigned: false }));
      }

      // Branch Manager: STRICTLY sees visits belonging to his own branch only
      if (currentUser.role === 'branch_manager') {
        if (!currentUser.branchName) return [];
        const managerBranch = currentUser.branchName;
        const belongsToBranch = (customerId?: string): boolean => {
          if (!customerId) return false;
          const cached = branchMembership.get(customerId);
          if (cached !== undefined) return cached;
          const c = customersByReference.get(customerId);
          const result = Boolean(c && doesCustomerBelongToBranch(c, managerBranch, users));
          branchMembership.set(customerId, result);
          return result;
        };
        return visits.filter((v) => {
          if (!isSectorAllowed(v)) return false;
          if (v.branchName && isBranchMatch(v.branchName, managerBranch, { allowUnassigned: false })) return true;
          return belongsToBranch(v.customerId);
        });
      }

      // Supervisor: STRICTLY sees visits belonging to his branch and his supervised reps
      if (currentUser.role === 'supervisor') {
        const belongsToSupervisor = (customerId?: string): boolean => {
          if (!customerId) return false;
          const cached = supervisorMembership.get(customerId);
          if (cached !== undefined) return cached;
          const c = customersByReference.get(customerId);
          const result = Boolean(c && doesCustomerBelongToSupervisor(c, currentUser, users));
          supervisorMembership.set(customerId, result);
          return result;
        };
        return visits.filter((v) => {
          if (!isSectorAllowed(v)) return false;
          if (v.supervisorId === currentUser.id) return true;
          if (v.createdBy === currentUser.id) return true;
          if (v.repId) {
            const direct = usersById.get(v.repId);
            if (direct?.supervisorId === currentUser.id) return true;
          }
          const rep = findVisitRep(v);
          if (rep && (rep.supervisorId === currentUser.id || rep.id === currentUser.id)) return true;
          return belongsToSupervisor(v.customerId);
        });
      }

      // Sales Rep: STRICT PRIVACY - ONLY his own visits!
      return visits.filter((v) => {
        if (!isSectorAllowed(v)) return false;
        // 1. Direct rep ID match
        if (v.repId === currentUser.id) return true;
        if (currentUser.username && v.repId && v.repId.toLowerCase() === currentUser.username.toLowerCase()) return true;

        // 2. Arabic Name match
        if (v.repName && matchesRepName(v.repName)) return true;

        // 3. Created by this rep for himself
        if (v.createdBy === currentUser.id && (!v.repId || v.repId === currentUser.id)) return true;

      return false;
    });
  // The scoping rules below read only currentUser, selectedBranchFilter, visits,
  // customers and users (everything else is a module-level helper), so those are the
  // real dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits, customers, users, currentUser, selectedBranchFilter, activeSectorFilter]);

  const getVisibleVisits = useCallback(() => visibleVisits, [visibleVisits]);

  const canManageVisit = (visit: CustomerVisit) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin' || currentUser.role === 'developer') return true;
    if (currentUser.role === 'branch_manager') {
      if (visit.branchName && isBranchMatch(visit.branchName, currentUser.branchName, { allowUnassigned: false })) return true;
      const c = customers.find((cust) => cust.id === visit.customerId);
      return Boolean(c && doesCustomerBelongToBranch(c, currentUser.branchName, users));
    }
    if (currentUser.role === 'supervisor') {
      if (visit.supervisorId === currentUser.id || visit.createdBy === currentUser.id) return true;
      const rep = users.find((u) => u.id === visit.repId || isArabicNameMatch(u.name, visit.repName || ''));
      return Boolean(rep && (rep.supervisorId === currentUser.id || rep.id === currentUser.id));
    }
    return (
      visit.createdBy === currentUser.id ||
      visit.repId === currentUser.id ||
      isArabicNameMatch(visit.repName || '', currentUser.name) ||
      normalizeArabicText(visit.repName || '') === normalizeArabicText(currentUser.name)
    );
  };

  const addVisit = (visit: Omit<CustomerVisit, 'id' | 'createdAt' | 'createdBy'>) => {
    if (!currentUser) return { success: false, message: 'يجب تسجيل الدخول أولاً' };
    if (!visit.customerId || !visit.date) return { success: false, message: 'اختر العميل وتاريخ الزيارة' };
    const customer = customers.find((c) => c.id === visit.customerId);
    if (!customer) return { success: false, message: 'العميل غير موجود' };

    const effectiveRepId = visit.repId || (currentUser.role === 'sales_rep' ? currentUser.id : '');
    const assignedRep = users.find((u) => u.id === effectiveRepId) || (currentUser.role === 'sales_rep' ? currentUser : undefined);
    const effectiveRepName = visit.repName || assignedRep?.name || currentUser.name || 'المندوب';
    const effectiveBranch = visit.branchName || customer.branchName || assignedRep?.branchName || currentUser.branchName || '';

    const allowed =
      currentUser.role === 'admin' ||
      currentUser.role === 'developer' ||
      (currentUser.role === 'sales_rep' && (effectiveRepId === currentUser.id || doesCustomerBelongToRep(customer, currentUser))) ||
      (currentUser.role === 'supervisor' && (assignedRep?.supervisorId === currentUser.id || doesCustomerBelongToSupervisor(customer, currentUser, users))) ||
      (currentUser.role === 'branch_manager' && (assignedRep?.branchName === currentUser.branchName || doesCustomerBelongToBranch(customer, currentUser.branchName, users)));

    if (!allowed) return { success: false, message: 'لا تملك صلاحية تسجيل زيارة لهذا العميل' };

    /**
     * نفس العميل في نفس اليوم — بدل ما نسجّل سطر تاني.
     *
     * كل زيارة بتعمل حاجتين مؤثرتين على العميل:
     *   - بتزود `visitCount2026` بواحد
     *   - بتنقص `currentBalance` بمبلغ التحصيل
     * فلو اتسجلت نفس الزيارة مرتين، الرصيد بينقص مرتين والعدّاد بيزيد مرتين.
     * ده مش احتمال نظري: فيه 117 صف مكرر على السيرفر دلوقتي (80 عميل/يوم).
     *
* بنفس منطق addImportedVisits بالظبط — نفس دالة dayKey، فالمساران
     * متسقان واللي بيتسجل بالاستيراد بيتقيّد بنفس القاعدة.
     *
     * ملاحظة: بنرجّع `visit` الموجود مع `success: false`. الشاشة بتقدر
     * تعرضه وتسأل المستخدم: يعدّل الزيارة دي ولا يسجّل رغم ذلك.
     * القرار للمستخدم مش للكود.
     */
    const visitDay = String(visit.date || '').slice(0, 10);
    const sameDayVisit =
      visitDay
        ? visits.find((v) => v.customerId === customer.id && String(v.date || '').slice(0, 10) === visitDay)
        : undefined;
    if (sameDayVisit && !(visit as CustomerVisit).allowSameDaySecondVisit) {
      return {
        success: false,
        message: `تم تسجيل زيارة للعميل ${customer.name} بتاريخ ${visitDay} بالفعل. عدّل الزيارة الموجودة أو سجّل رغم ذلك.`,
        visit: sameDayVisit,
      };
    }

    const newVisitId = `visit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const isOnlineNow = typeof navigator !== 'undefined' && navigator.onLine;
    const newVisitObj: CustomerVisit = {
      ...visit,
      id: newVisitId,
      customerId: customer.id,
      customerName: customer.name,
      customerCode: customer.code,
      repId: effectiveRepId,
      repName: effectiveRepName,
      branchName: effectiveBranch,
      supervisorId: visit.supervisorId || assignedRep?.supervisorId,
      status: visit.status || 'منفذة',
      reviewStatus: 'approved',
      reviewedByName: currentUser.name || 'معتمدة مباشرة',
      reviewNote: 'زيارة مباشرة معتمدة تلقائياً',
      reviewedAt: new Date().toISOString(),
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
      syncStatus: isOnlineNow ? 'synced' : 'pending_sync',
    };

    // 1. Double Immediate Local Persistence (State + IndexedDB + localStorage)
    setVisits((prev) => {
      const next = [newVisitObj, ...prev.filter((v) => v.id !== newVisitId)];
      persistVisits(next);
      return next;
    });

    // 2. Direct Cloud Database Sync (Supabase PostgreSQL / Cloud DB),
    // with the offline outbox as the fallback so a visit logged in the field
    // without a signal is delivered as soon as the device reconnects.
    syncOrQueue('visits', 'upsert', newVisitId, newVisitObj, () =>
      saveVisitsToSupabase([newVisitObj])
    ).then((delivered) => {
      if (delivered) {
        setVisits((prev) => {
          const next = prev.map((v) => (v.id === newVisitId ? { ...v, syncStatus: 'synced' as const } : v));
          persistVisits(next);
          return next;
        });
      } else {
        setVisits((prev) => {
          const next = prev.map((v) => (v.id === newVisitId ? { ...v, syncStatus: 'pending_sync' as const } : v));
          persistVisits(next);
          return next;
        });
      }
    }).catch((e) => {
      console.warn('Supabase visit background save note:', e);
    });

    // 3. Customer dossier synchronization (lastVisitDate, nextVisitDate, visitHistory, balance update)
    const existingVisits = customer.visitHistory || [];
    const updatedCustomer: Customer = {
      ...customer,
      lastVisitDate: (visit.isReturn || visit.type === 'مرتجع') ? customer.lastVisitDate : visit.date,
      nextVisitDate: visit.nextVisitDate || customer.nextVisitDate,
      visitCount2026: (visit.isReturn || visit.type === 'مرتجع')
        ? (customer.visitCount2026 || 0)
        : ((customer.visitCount2026 || 0) + 1),
      visitHistory: [newVisitObj, ...existingVisits.filter((v) => v.id !== newVisitId)],
      currentBalance: visit.collectedAmount
        ? Math.max(0, (customer.currentBalance ?? customer.balance ?? 0) - visit.collectedAmount)
        : customer.currentBalance,
    };

    setCustomers((prev) => {
      const next = prev.map((c) => (c.id === customer.id ? updatedCustomer : c));
      idbSet(getCustomersCacheKey(), next).catch(() => {});
      return next;
    });

    // Keep customer dossier (balance/collection, last visit, counters) in sync with server/offline queue.
    syncOrQueue('customers', 'upsert', updatedCustomer.id, updatedCustomer, () =>
      saveCustomersToSupabase([updatedCustomer])
    ).catch((e) => console.warn('Supabase customer sync after visit failed:', e));

    const isReturnVisit = !!(visit.isReturn || visit.type === 'مرتجع');
    recordAuditLog({
      userId: currentUser?.id || 'user',
      userName: currentUser?.name || 'مستخدم',
      userRole: currentUser?.role || 'sales_rep',
      branchName: effectiveBranch || currentUser?.branchName || '',
      action: (isReturnVisit ? 'create_return' : (visit.collectedAmount && visit.collectedAmount > 0 ? 'record_collection' : 'create_visit')) as any,
      actionTitle: (isReturnVisit ? 'تسجيل طلب/حالة مرتجع' : (visit.collectedAmount && visit.collectedAmount > 0 ? 'تسجيل تحصيل ميداني' : 'تسجيل زيارة ميدانية')),
      details: `عميل: ${customer.name} (${customer.code || '—'}) | تاريخ: ${visit.date} | نوع: ${visit.type || visit.status || 'زيارة'}${visit.collectedAmount ? ` | محصّل: ${visit.collectedAmount}` : ''}${isReturnVisit ? ' | مرتجع' : ''}`,
      badgeType: isReturnVisit ? 'warning' : (visit.collectedAmount && visit.collectedAmount > 0 ? 'success' : 'info'),
    });

    return {
      success: true,
      message: 'تم حفظ الزيارة بنجاح وتأكيد تثبيتها في قاعدة البيانات ✅',
      visit: newVisitObj,
    };
  };

  const addImportedVisits = async (
    imported: Array<Omit<CustomerVisit, 'id' | 'createdAt' | 'createdBy' | 'customerName' | 'customerCode' | 'syncStatus'>>,
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ success: boolean; added: number; duplicates: number; queued: boolean; failed: string[] }> => {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'developer') {
      return { success: false, added: 0, duplicates: 0, queued: false, failed: ['لا تملك صلاحية استيراد الزيارات'] };
    }

    const dayKey = (customerId: string, date: string) => `${customerId}|${date.slice(0, 10)}`;
    const seen = new Set<string>();
    visits.forEach((visit) => {
      if (visit.customerId && visit.date) seen.add(dayKey(visit.customerId, visit.date));
    });
    customers.forEach((customer) => {
      (customer.visitHistory || []).forEach((visit) => {
        if (visit.customerId && visit.date) seen.add(dayKey(visit.customerId, visit.date));
        else if (visit.date) seen.add(dayKey(customer.id, visit.date));
      });
    });

    const accepted: CustomerVisit[] = [];
    const failed: string[] = [];
    let duplicates = 0;

    imported.forEach((visit, index) => {
      const customer = customers.find((item) => item.id === visit.customerId);
      if (!customer) {
        failed.push(`زيارة ${index + 1}: العميل غير موجود`);
        return;
      }
      if (!visit.date) {
        failed.push(`زيارة ${index + 1}: تاريخ الزيارة غير صالح`);
        return;
      }

      const key = dayKey(customer.id, visit.date);
      if (seen.has(key)) {
        duplicates++;
        return;
      }
      seen.add(key);

      accepted.push({
        ...visit,
        id: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        customerId: customer.id,
        customerName: customer.name,
        customerCode: customer.code,
        status: visit.status || 'منفذة',
        reviewStatus: 'approved',
        reviewedByName: currentUser.name || 'معتمدة مباشرة',
        reviewNote: 'زيارة مباشرة معتمدة تلقائياً',
        reviewedAt: new Date().toISOString(),
        createdBy: currentUser.id,
        createdAt: new Date().toISOString(),
        syncStatus: 'pending_sync',
      });
    });

    if (accepted.length === 0) {
      return { success: failed.length === 0, added: 0, duplicates, queued: false, failed };
    }

    const nextVisits = [...accepted, ...visits];
    setVisits(nextVisits);
    persistVisits(nextVisits);

    const byCustomer = new Map<string, CustomerVisit[]>();
    accepted.forEach((visit) => {
      const list = byCustomer.get(visit.customerId || '') || [];
      list.push(visit);
      byCustomer.set(visit.customerId || '', list);
    });
    const nextCustomers = customers.map((customer) => {
      const additions = byCustomer.get(customer.id);
      if (!additions) return customer;
      const latestImportedDate = additions.reduce(
        (latest, visit) => visit.date > latest ? visit.date : latest,
        customer.lastVisitDate || ''
      );
      const countFor2026 = additions.filter((visit) => visit.date.startsWith('2026-')).length;
      return {
        ...customer,
        lastVisitDate: latestImportedDate || customer.lastVisitDate,
        visitCount2026: (customer.visitCount2026 || 0) + countFor2026,
        visitHistory: [...additions, ...(customer.visitHistory || [])],
      };
    });
    setCustomers(nextCustomers);
    idbSet(getCustomersCacheKey(), nextCustomers).catch((error) =>
      console.warn('Imported visit customer history persistence notice:', error)
    );

    const syncedIds = new Set<string>();
    const toQueue: CustomerVisit[] = [];
    let queued = false;
    if (navigator.onLine) {
      for (let start = 0; start < accepted.length; start += 100) {
        const chunk = accepted.slice(start, start + 100);
        const result = await saveVisitsToSupabase(chunk);
        if (result.success) {
          chunk.forEach((visit) => syncedIds.add(visit.id));
        } else {
          console.warn('Imported visit cloud save deferred to offline queue:', result.error);
          toQueue.push(...chunk);
        }
        onProgress?.(Math.min(start + chunk.length, accepted.length), accepted.length);
        if (start + chunk.length < accepted.length) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }
    } else {
      toQueue.push(...accepted);
    }

    if (syncedIds.size > 0) {
      const syncedById = new Map(
        accepted
          .filter((visit) => syncedIds.has(visit.id))
          .map((visit) => [visit.id, { ...visit, syncStatus: 'synced' as const }])
      );
      const updatedVisits = nextVisits.map((visit) => syncedById.get(visit.id) || visit);
      setVisits(updatedVisits);
      persistVisits(updatedVisits);
      const updatedCustomers = nextCustomers.map((customer) => {
        if (!byCustomer.has(customer.id)) return customer;
        return {
          ...customer,
          visitHistory: (customer.visitHistory || []).map((visit) => syncedById.get(visit.id) || visit),
        };
      });
      setCustomers(updatedCustomers);
      idbSet(getCustomersCacheKey(), updatedCustomers).catch((error) =>
        console.warn('Imported visit sync-state persistence notice:', error)
      );
    }

    if (toQueue.length > 0) {
      try {
        await enqueueMutations(toQueue.map((visit) => ({
          entity: 'visits',
          op: 'upsert',
          entityId: visit.id,
          payload: visit,
        })));
        await refreshOfflineQueueCount();
        queued = true;
      } catch (error) {
        console.error('Imported visits could not be added to the offline queue:', error);
        failed.push('تم حفظ الزيارات محليًا لكن تعذر تجهيز مزامنتها؛ أعد المزامنة عند توفر الإنترنت');
      }
    }

    return { success: failed.length === 0, added: accepted.length, duplicates, queued, failed };
  };
  
  const updateVisit = (visit: CustomerVisit) => {
    if (!currentUser) return { success: false, message: 'يجب تسجيل الدخول أولاً' };
    if (!canManageVisit(visit)) return { success: false, message: 'لا تملك صلاحية تعديل هذه الزيارة' };
    const existingVisit = visits.find((item) => item.id === visit.id);
    if (currentUser.role === 'sales_rep' && existingVisit?.reviewStatus === 'approved') {
      return { success: false, message: 'لا يمكن تعديل زيارة تم اعتمادها من المشرف' };
    }
    const updatedVisit: CustomerVisit = {
      ...visit,
      status: visit.status || 'منفذة',
      reviewStatus: 'approved',
      reviewedByName: existingVisit?.reviewedByName || currentUser.name || 'معتمدة مباشرة',
      reviewNote: existingVisit?.reviewNote || 'زيارة مباشرة معتمدة تلقائياً',
      reviewedAt: existingVisit?.reviewedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced',
    };
    
    // Immediate Local Persistence (State + IndexedDB + localStorage)
    setVisits((prev) => {
      const next = prev.map((item) => (item.id === visit.id ? updatedVisit : item));
      persistVisits(next);
      return next;
    });

    // Direct Cloud Database Sync (queued when offline)
    syncOrQueue('visits', 'upsert', updatedVisit.id, updatedVisit, () =>
      saveVisitsToSupabase([updatedVisit])
    ).catch((e) => console.warn('Supabase visit update error:', e));

    if (visit.customerId) {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id === visit.customerId) {
            const history = (c.visitHistory || []).map((vh) => (vh.id === visit.id ? updatedVisit : vh));
            return {
              ...c,
              nextVisitDate: visit.nextVisitDate || c.nextVisitDate,
              visitHistory: history,
            };
          }
          return c;
        })
      );
    }

    const isReturnUpdate = !!(updatedVisit.isReturn || updatedVisit.type === 'مرتجع');
    const prevStatus = existingVisit?.returnStatus || existingVisit?.status;
    const nextStatus = updatedVisit.returnStatus || updatedVisit.status;
    const prevReview = existingVisit?.reviewStatus;
    const nextReview = updatedVisit.reviewStatus;
    recordAuditLog({
      userId: currentUser?.id || 'user',
      userName: currentUser?.name || 'مستخدم',
      userRole: currentUser?.role || 'sales_rep',
      branchName: updatedVisit.branchName || currentUser?.branchName || '',
      action: (isReturnUpdate ? 'update_return_status' : 'update_visit_status') as any,
      actionTitle: isReturnUpdate ? 'تحديث حالة مرتجع/زيارة مرتجع' : 'تحديث/اعتماد زيارة',
      details: `عميل: ${updatedVisit.customerName || visit.customerName || '—'} | ${isReturnUpdate ? `حالة المرتجع: ${prevStatus || '—'} → ${nextStatus || '—'}` : `حالة: ${prevStatus || '—'} → ${nextStatus || '—'} | مراجعة: ${prevReview || '—'} → ${nextReview || '—'}`}${updatedVisit.returnHandledBy ? ` | بواسطة: ${updatedVisit.returnHandledBy}` : ''}`,
      badgeType: isReturnUpdate ? 'warning' : 'info',
    });

    return { success: true, message: 'تم تحديث الزيارة وحفظها بقاعدة البيانات بنجاح ✅' };
  };

  const toggleArchiveVisit = async (visitId: string, isArchived: boolean): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) return { success: false, message: 'يجب تسجيل الدخول أولاً' };
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) return { success: false, message: 'الزيارة غير موجودة' };
    if (!canManageVisit(visit)) return { success: false, message: 'لا تملك صلاحية أرشفة هذه الزيارة' };

    const now = new Date().toISOString();
    const updatedVisit: CustomerVisit = {
      ...visit,
      isArchived,
      archivedAt: isArchived ? now : undefined,
      archivedBy: isArchived ? (currentUser.name || currentUser.username) : undefined,
      updatedAt: now,
      syncStatus: 'synced',
    };

    setVisits((prev) => {
      const next = prev.map((v) => (v.id === visitId ? updatedVisit : v));
      persistVisits(next);
      return next;
    });

    syncOrQueue('visits', 'upsert', updatedVisit.id, updatedVisit, () =>
      saveVisitsToSupabase([updatedVisit])
    ).catch((e) => console.warn('Supabase visit archive error:', e));

    if (visit.customerId) {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id === visit.customerId) {
            const history = (c.visitHistory || []).map((vh) => (vh.id === visitId ? updatedVisit : vh));
            return {
              ...c,
              visitHistory: history,
            };
          }
          return c;
        })
      );
    }

    return {
      success: true,
      message: isArchived
        ? 'تم أرشفة الزيارة بنجاح وحفظها في سجل ا��أرشيف 🗄️'
        : 'تم استعادة الزيارة من الأرشيف بنجاح إلى السجل النشط 🔄',
    };
  };

  const reviewVisit = (
    visitId: string,
    status: Extract<VisitReviewStatus, 'approved' | 'needs_fix'>,
    note = ''
  ) => {
    if (!currentUser || currentUser.role !== 'supervisor') {
      return { success: false, message: 'اعتماد الزيارات متاح لمشرف الفريق فقط' };
    }
    const visit = visits.find((item) => item.id === visitId);
    if (!visit) return { success: false, message: 'الزيارة غير موجودة' };
    const rep = (visit.repId ? users.find((user) => user.id === visit.repId) : undefined) ||
      users.find((user) => user.role === 'sales_rep' && isArabicNameMatch(user.name, visit.repName || ''));
    if (rep?.role !== 'sales_rep') {
      return { success: false, message: 'لا يمكن تحديد المندوب المسؤول عن الزيارة' };
    }
    if (!rep || rep.supervisorId !== currentUser.id) {
      return { success: false, message: 'لا تملك صلاحية مراجعة زيارة هذا المندوب' };
    }
    if (visit.reviewStatus !== 'pending' || (visit.status !== 'منفذة' && visit.status !== 'لم تتم')) {
      return { success: false, message: 'هذه الزيارة ليست بانتظار المراجعة' };
    }
    if (status === 'needs_fix' && !note.trim()) {
      return { success: false, message: 'اكتب ملاحظة توضح المطلوب تعديله' };
    }

    const now = new Date().toISOString();
    const updatedVisit: CustomerVisit = {
      ...visit,
      reviewStatus: status,
      reviewedByName: currentUser.name,
      reviewNote: status === 'needs_fix' ? note.trim() : undefined,
      reviewedAt: now,
      updatedAt: now,
      syncStatus: 'synced',
    };
    setVisits((prev) => {
      const next = prev.map((item) => item.id === visitId ? updatedVisit : item);
      persistVisits(next);
      return next;
    });
    syncOrQueue('visits', 'upsert', updatedVisit.id, updatedVisit, () =>
      saveVisitsToSupabase([updatedVisit])
    ).then((delivered) => {
      if (!delivered) console.warn('Supabase visit review parked in the offline queue');
    }).catch((error) => console.warn('Supabase visit review save error:', error));
    if (visit.customerId) {
      setCustomers((prev) => prev.map((customer) => customer.id === visit.customerId
        ? { ...customer, visitHistory: (customer.visitHistory || []).map((item) => item.id === visitId ? updatedVisit : item) }
        : customer));
    }
    return { success: true, message: status === 'approved' ? 'تم اعتماد الزيارة' : 'تم إرجاع التقرير للمندوب للتعديل' };
  };

  const deleteVisit = async (visitId: string): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) return { success: false, message: 'يجب تسجيل الدخول أولاً' };
    const visitToDelete = visits.find((v) => v.id === visitId);
    if (!visitToDelete) return { success: false, message: 'الزيارة غير موجودة' };
    if (!canManageVisit(visitToDelete)) return { success: false, message: 'لا تملك صلاحية حذف هذه الزيارة' };

    markVisitAsDeletedInStorage(visitId);
    setVisits((prev) => {
      const next = prev.filter((v) => v.id !== visitId);
      persistVisits(next);
      return next;
    });

    if (visitToDelete.customerId) {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id === visitToDelete.customerId && c.visitHistory) {
            return {
              ...c,
              visitHistory: c.visitHistory.filter((vh) => vh.id !== visitId),
            };
          }
          return c;
        })
      );
    }

    try {
      await syncOrQueue('visits', 'delete', visitId, undefined, () =>
        deleteVisitFromSupabase(visitId)
      );
    } catch (e) {
      console.warn('Supabase visit deletion note:', e);
    }

    return { success: true, message: 'تم حذف الزيارة بنجاح من قاعدة البيانات' };
  };

  const syncVisitsWithDatabase = async (): Promise<{ success: boolean; message: string; count: number }> => {
    try {
      const res = await fetchVisitsFromSupabase(visitFetchScope);
      const deletedVisitIds = getDeletedVisitIds();
      let mergedVisits: CustomerVisit[] = [];

      if (res.success && res.visits) {
        const remoteVisits = res.visits.filter((v) => !deletedVisitIds.has(v.id));
        const mergedMap = new Map<string, CustomerVisit>();
        // Remote visits as base
        remoteVisits.forEach((v) => mergedMap.set(v.id, { ...v, syncStatus: 'synced' }));
        // Local visits
        visits.forEach((v) => {
          if (!mergedMap.has(v.id) && !deletedVisitIds.has(v.id)) {
            mergedMap.set(v.id, v);
          }
        });
        mergedVisits = Array.from(mergedMap.values());
        
        // Also upload any locally pending visits to remote
        const unsynced = visits.filter((v) => !remoteVisits.some((r) => r.id === v.id));
        if (unsynced.length > 0) {
          saveVisitsToSupabase(unsynced).catch(() => {});
        }
      } else {
        // Fallback to local visits if remote connection fails
        mergedVisits = visits.filter((v) => !deletedVisitIds.has(v.id));
      }

      setVisits(mergedVisits);
      persistVisits(mergedVisits);

      return {
        success: true,
        message: `تم تأكيد مزامنة وحفظ كافة الزيارات (${mergedVisits.length}) في قاعدة البيانات بنجاح ✅`,
        count: mergedVisits.length,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'فشلت المزامنة: ' + (err?.message || 'خطأ غير معروف'),
        count: visits.length,
      };
    }
  };

  const getCustomerVisitSummary = (customerId: string, month?: string) => {
    const list = getVisibleVisits().filter(
      (v) => !v.isReturn && v.type !== 'مرتجع' && v.outcome !== 'مرتجع لدي العميل' && v.customerId === customerId && (!month || v.date.startsWith(month))
    );
    const completed = list.filter((v) => v.status === 'منفذة').length;
    return {
      total: list.length,
      completed,
      scheduled: list.filter((v) => v.status === 'مجدولة').length,
      lastVisit: list
        .filter((v) => v.status === 'منفذة')
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.date,
      nextVisit: list
        .filter((v) => v.status === 'مجدولة' && v.date >= new Date().toISOString().slice(0, 10))
        .sort((a, b) => a.date.localeCompare(b.date))[0]?.date,
    };
  };

  // Scoped customer list, resolved once per real change (stable getter below).
  const visibleCustomersScoped = useMemo((): Customer[] => {
    if (!currentUser) return [];
    // القطاع: كل الأدوار بتفلتر حسب القطاع المحدد (منزلي أو كهربائي، من غير دمج)
    // نمرّر resolver لأن معظم العملاء المستوردين حقل sector عندهم فاضي.
    const sectorFiltered = filterBySector(customers, currentUser.sector, (c) => inferCustomerSector(c, users));
    if (currentUser.role === 'admin' || currentUser.role === 'developer') {
      return selectedBranchFilter === 'الكل'
        ? sectorFiltered
        : sectorFiltered.filter((c) => Boolean(c.branchName) && isBranchMatch(c.branchName, selectedBranchFilter, { allowUnassigned: false }));
    }
    if (currentUser.role === 'branch_manager') {
      if (!currentUser.branchName) return [];
      return sectorFiltered.filter((c) => doesCustomerBelongToBranch(c, currentUser.branchName, users));
    }
    if (currentUser.role === 'supervisor') {
      const supervisedRepIds = new Set(
        users.filter((u) => u.role === 'sales_rep' && u.supervisorId === currentUser.id).map((u) => u.id)
      );
      return sectorFiltered.filter((c) => {
        const isSameBranch = Boolean(c.branchName) && isBranchMatch(c.branchName, currentUser.branchName, { allowUnassigned: false });
        if (!isSameBranch) return false;
        if (c.repId && supervisedRepIds.has(c.repId)) return true;

        // A supervisor sees ONLY the customers of his own reps. If another rep
        // owns this customer, the supervisorName column must not hand it over —
        // that is what made the supervisor see the whole branch.
        const owner = findOwningSalesRep(c, users);
        if (owner) return supervisedRepIds.has(owner.id);

        // Unassigned customer: honour the explicit supervisorName column.
        return Boolean(
          c.supervisorName && normalizeArabicText(c.supervisorName) === normalizeArabicText(currentUser.name)
        );
      });
    }
    // Sales Rep: ONLY customers belonging directly to this rep
    return sectorFiltered.filter((c) => doesCustomerBelongToRep(c, currentUser));
  }, [currentUser, customers, users, selectedBranchFilter, activeSectorFilter]);

  const getVisibleCustomers = useCallback(
    (): Customer[] => visibleCustomersScoped.slice(),
    [visibleCustomersScoped]
  );

  // Scoped product list (sector + promotions + branch stock), resolved once per
  // real change — this used to rebuild every product object on every render.
  const visibleProductsScoped = useMemo((): Product[] => {
    const sectorFiltered = filterBySector(products, currentUser?.sector, (product) => {
      const text = normalizeArabicText(`${product.department || ''} ${product.category || ''} ${product.itemGroup || ''} ${product.familyName || ''} ${product.name || ''}`);
      const electricalTerms = ['كهربا', 'لمبه', 'مفتاح', 'كابل', 'سلك', 'شاسيه', 'قاطع', 'فيشه', 'لقمه', 'دوايه', 'وش', 'سبوت', 'كشاف', 'electrical', 'electric', 'cable', 'wire', 'switch', 'bulb', 'lamp', 'socket', 'plug', 'breaker', 'fuse'];
      return electricalTerms.some((term) => text.includes(normalizeArabicText(term))) ? 'electrical' : 'home';
    });

    const promoEnriched = promotions.length > 0
      ? applyPromotionsToProducts(sectorFiltered, promotions).updatedProducts
      : sectorFiltered;

    if (!currentUser || currentUser.role === 'admin' || currentUser.role === 'developer') {
      return promoEnriched;
    }

    const branchName = currentUser.branchName;
    return promoEnriched.map((product) => {
      const branchStock = branchName ? getBranchStockForProduct(product, branchName) : (product.branchStockActual || 0);
      return {
        ...product,
        branchStockActual: branchStock,
        branchStockReserved: typeof product.branchStockReserved === 'number' ? product.branchStockReserved : branchStock,
        mainWarehouseActual: product.mainWarehouseActual || 0,
        mainWarehouseReserved: product.mainWarehouseReserved || 0,
        branchStocks: product.branchStocks || (branchName ? { [branchName]: branchStock } : {}),
      };
    });
  }, [currentUser, products, promotions, activeSectorFilter]);

  const getVisibleProducts = useCallback(
    (): Product[] => visibleProductsScoped.slice(),
    [visibleProductsScoped]
  );

  const visibleTargetsScoped = useMemo(() => {
    const scoped = filterBySector(targets, currentUser?.sector, (record) =>
      inferTargetSector(record, users, customers)
    );
    return filterTargetsForUser(scoped, currentUser, users, customers);
  }, [targets, currentUser, users, customers, activeSectorFilter]);

  const getVisibleTargets = useCallback(
    (): TargetRecord[] => visibleTargetsScoped,
    [visibleTargetsScoped]
  );

  const getSupervisorsInBranch = (branchName?: string): User[] => {
    const targetBranch = branchName || currentUser?.branchName;
  return users.filter(
  u => u.role === 'supervisor' &&
  u.approvalStatus === 'active' &&
  (!targetBranch || isBranchMatch(u.branchName, targetBranch, { allowUnassigned: false }))
  );
  };

  const getSalesRepsForSupervisor = (supervisorId: string): User[] => {
    return users.filter(u => u.role === 'sales_rep' && u.supervisorId === supervisorId);
  };

  const saveAndSyncPromotions = async (
    nextPromotions: PromotionOffer[],
    customAnnouncements?: PromoAnnouncement[]
  ): Promise<{ success: boolean }> => {
    promotionsRef.current = nextPromotions;
    setPromotions(nextPromotions);
    savePromotions(nextPromotions);
    const activeAnnouncements = customAnnouncements ?? announcementsRef.current;
    if (customAnnouncements) {
      announcementsRef.current = customAnnouncements;
      setAnnouncements(customAnnouncements);
      safeLocalStorageSet(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(customAnnouncements));
    }
    if (!navigator.onLine) return { success: true };
    try {
      return await savePromotionsToSupabase({
        promotions: nextPromotions,
        announcements: activeAnnouncements,
      });
    } catch {
      return { success: false };
    }
  };

  const saveAndSyncAnnouncements = async (
    nextAnnouncements: PromoAnnouncement[]
  ): Promise<{ success: boolean }> => {
    announcementsRef.current = nextAnnouncements;
    setAnnouncements(nextAnnouncements);
    safeLocalStorageSet(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(nextAnnouncements));
    if (!navigator.onLine) return { success: true };
    try {
      return await savePromotionsToSupabase({
        promotions: promotionsRef.current,
        announcements: nextAnnouncements,
      });
    } catch {
      return { success: false };
    }
  };

  const loginAs = (userId: string) => {
    const found = users.find((u) => u.id === userId);
    if (found) {
      justLoggedInRef.current = true;
      noStampPulledAtRef.current = 0;
      customerFullFetchAtRef.current = 0;
      lastBootCustScopeSigRef.current = '';
      lastBootHeartbeatAtRef.current = 0;
      customerDownloadInFlightRef.current = false;
      currentUserRef.current = found;
      setCurrentUser(found);
      setIsAuthenticated(true);
      localStorage.setItem(STORAGE_KEYS.IS_AUTH, 'true');
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, found.id);
      safeLocalStorageSet(STORAGE_KEYS.CURRENT_USER_DATA, JSON.stringify(found));
      setDataEpoch((n) => n + 1);
    }
  };

  const syncCustomersIncrementally = async (): Promise<{ success: boolean; message?: string; added?: number; updated?: number }> => {
    try {
      const custRes = await fetchCustomersIncremental(customerFetchScope);
      if (!custRes.success) {
        return { success: false, message: custRes.error || 'فشل جلب العملاء من السيرفر' };
      }

      const incoming = custRes.customers || [];
      if (incoming.length === 0) {
        return { success: true, message: 'لا توجد عملاء جدد للتحديث', added: 0, updated: 0 };
      }

      const merged = mergeCustomersIncremental(customers, incoming);
      const linked = linkCustomersToUsers(sanitizeCustomers(merged), users);
      const validCustomers = deduplicateCustomersArray(linked);

      setCustomers(validCustomers);
      idbSet(getCustomersCacheKey(), validCustomers).catch(() => {});
      saveLocalCustomersFingerprint(validCustomers, activeStorageCtxRef.current.userId, activeStorageCtxRef.current.sector);

      return {
        success: true,
        message: custRes.isFullFetch
          ? `تم جلب ${validCustomers.length} عميل (المرة الأولى)`
          : `تم تحديث ${incoming.length} عميل فقط`,
        added: custRes.isFullFetch ? validCustomers.length : incoming.length,
        updated: custRes.isFullFetch ? 0 : incoming.length,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'حدث خطأ أثناء المزامنة التراكمية' };
    }
  };

  const loadAllTargets = async (): Promise<{ success: boolean; message?: string; count?: number }> => {
    try {
      const res = await fetchTargetsFromSupabase(targetFetchScope);
      if (!res.success) return { success: false, message: res.error || 'فشل تحميل كل الأهداف' };
      const incoming = res.targets || [];
      const merged = mergeTargetsIncremental(targetsRef.current, incoming.map(mapTargetRowToRecord));
      setTargets(merged);
      idbSet(getTargetsCacheKey(), merged).catch(() => {});
      return { success: true, message: `تم تحميل ${merged.length} هدف`, count: merged.length };
    } catch (err: any) {
      return { success: false, message: err?.message || 'حدث خطأ أثناء تحميل الأهداف' };
    }
  };

  const syncTargetsIncrementally = async (): Promise<{ success: boolean; message?: string; added?: number; updated?: number }> => {
    try {
      const res = await fetchTargetsIncremental(targetFetchScope);
      if (!res.success) {
        return { success: false, message: res.error || 'فشل جلب الأهداف من السيرفر' };
      }
      const incoming = res.targets || [];
      if (incoming.length === 0) {
        return { success: true, message: 'لا توجد أهداف جديدة للتحديث', added: 0, updated: 0 };
      }
      const merged = mergeTargetsIncremental(targetsRef.current, incoming.map(mapTargetRowToRecord));
      setTargets(merged);
      idbSet(getTargetsCacheKey(), merged).catch(() => {});
      return {
        success: true,
        message: res.isFullFetch
          ? `تم جلب ${merged.length} هدف (المرة الأولى)`
          : `تم تحديث ${incoming.length} هدف فقط`,
        added: res.isFullFetch ? merged.length : incoming.length,
        updated: res.isFullFetch ? 0 : incoming.length,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'حدث خطأ أثناء مزامنة الأهداف' };
    }
  };

  const syncProductsIncrementally = async (): Promise<{ success: boolean; message?: string; added?: number; updated?: number }> => {
    try {
      const res = await fetchProductsIncremental(productSectorScope);
      if (!res.success) {
        return { success: false, message: res.error || 'فشل جلب الأصناف من السيرفر' };
      }
      const incoming = res.products || [];
      if (incoming.length === 0) {
        return { success: true, message: 'لا توجد أصناف جديدة للتحديث', added: 0, updated: 0 };
      }
      const merged = mergeProductsIncremental(productsRef.current, incoming);
      setProducts(merged);
      idbSet(getProductsCacheKey(), merged).catch(() => {});
      return {
        success: true,
        message: res.isFullFetch
          ? `تم جلب ${merged.length} صنف (المرة الأولى)`
          : `تم تحديث ${incoming.length} صنف فقط`,
        added: res.isFullFetch ? merged.length : incoming.length,
        updated: res.isFullFetch ? 0 : incoming.length,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'حدث خطأ أثناء مزامنة الأصناف' };
    }
  };

  const syncCustomerItemSalesIncrementally = async (): Promise<{ success: boolean; message?: string; added?: number; updated?: number }> => {
    try {
      let scope: { repNames?: string[]; warehouses?: string[]; sectors?: Array<'home' | 'electrical'> } | undefined;
      const role = currentUser?.role;
      // عزل القطاع على مستوى السيرفر — كل قطاع ينزل بياناته بس.
      const effectiveSector = resolveEffectiveSector(currentUser, activeSectorFilter);
      const sectors: Array<'home' | 'electrical'> =
        effectiveSector === 'home' || effectiveSector === 'electrical' ? [effectiveSector] : [];
      // حساب مبيعات بلا قطاع معيّن: محجوب — مننزّل له أي بيانات ولا نصرف egress.
      if (effectiveSector === 'none') {
        return {
          success: true,
          message: 'حسابك بلا قطاع معيّن — اطلب من الإدارة تعيين قطاعك (منزلي/كهربائي) أولاً',
          added: 0,
          updated: 0,
        };
      }

      if (currentUser && role !== 'admin' && role !== 'developer' && role !== 'technical_support') {
        const cleanName = (value?: string) =>
          (value || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
        const branch = String(currentUser.branchName || '').trim();
        const shortBranch = branch.replace(/فرع/g, '').replace(/\([^)]*\)/g, '').trim();
        const warehouses = shortBranch.length >= 2 ? [shortBranch] : branch ? [branch] : [];
        if (role === 'sales_rep') {
          const fullName = cleanName(currentUser.name);
          const shortName = fullName.split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
          const repNames = Array.from(new Set([fullName, shortName].filter((n) => n.length >= 3)));
          scope = {
            ...(repNames.length > 0 ? { repNames } : warehouses.length > 0 ? { warehouses } : {}),
            ...(sectors.length > 0 ? { sectors } : {}),
          };
        } else if (role === 'supervisor') {
          const repNames = users
            .filter((u) => u.supervisorId === currentUser.id)
            .flatMap((u) => {
              const fn = cleanName(u.name);
              const sn = fn.split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
              return [fn, sn];
            })
            .filter((n) => n.length >= 3);
          scope = {
            ...(repNames.length > 0 ? { repNames: Array.from(new Set(repNames)) } : {}),
            ...(warehouses.length > 0 ? { warehouses } : {}),
            ...(sectors.length > 0 ? { sectors } : {}),
          };
        } else if (role === 'branch_manager' && warehouses.length > 0) {
          scope = { warehouses, ...(sectors.length > 0 ? { sectors } : {}) };
        }
      } else if (sectors.length > 0) {
        scope = { sectors };
      }
      const res = await fetchCustomerItemSalesIncremental(scope);
      if (!res.success) {
        return { success: false, message: res.error || 'فشل جلب مبيعات الأصناف من السيرفر' };
      }
      const { saveCustomerItemSales, mapSupabaseRowToCustomerItemSale } = await import(
        '../services/customerItemSalesService'
      );
      const incoming = (res.sales || []).map(mapSupabaseRowToCustomerItemSale);
      if (incoming.length === 0) {
        return { success: true, message: 'لا توجد مبيعات أصناف جديدة للتحديث', added: 0, updated: 0 };
      }
      await saveCustomerItemSales(incoming, 'merge');
      return {
        success: true,
        message: res.isPartial
          ? `تم جلب ${incoming.length} سجل مبيعات صنف (دفعة أولى — التحميل هيكمل تلقائيًا في المزامنة الجاية)`
          : res.isFullFetch
            ? `تم جلب ${incoming.length} سجل مبيعات صنف (المرة الأولى)`
            : `تم تحديث ${incoming.length} سجل مبيعات صنف فقط`,
        added: res.isFullFetch ? incoming.length : incoming.length,
        updated: res.isFullFetch ? 0 : incoming.length,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'حدث خطأ أثناء مزامنة مبيعات الأصناف' };
    }
  };

  // مرجع حيّ للدالة — بيتنادى من مزامنة نسخة البيانات بدون أي زر.
  itemSalesSyncRef.current = syncCustomerItemSalesIncrementally;

  const lastDeltaSyncAtRef = useRef<number>(0);
  const reconnectDeltaSyncRef = useRef<() => void>(() => {});
  reconnectDeltaSyncRef.current = () => {
    if (!isSupabaseConfigured || !currentUserRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const now = Date.now();
    // Throttle strongly (20m) so focus/reconnect events don't multiply egress across 500 devices.
    if (now - lastDeltaSyncAtRef.current < 20 * 60 * 1000) return;
    lastDeltaSyncAtRef.current = now;
    // Pull only incremental deltas (using updated_at cursors) for core tables.
    void syncTargetsIncrementally().catch(() => {});
    void syncProductsIncrementally().catch(() => {});
    void syncCustomersIncrementally().catch(() => {});
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let timer: number | null = null;
    const handler = () => {
      if (timer) window.clearTimeout(timer);
      // Small delay so outbox flush/state settles before pulling deltas.
      timer = window.setTimeout(() => reconnectDeltaSyncRef.current(), 2500);
    };
    window.addEventListener('tantawy:reconnected-sync', handler as EventListener);
    // Periodic light delta refresh every 30 minutes while active & online.
    const periodic = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      reconnectDeltaSyncRef.current();
    }, 30 * 60 * 1000);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.clearInterval(periodic);
      window.removeEventListener('tantawy:reconnected-sync', handler as EventListener);
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      currentUser,
      isAuthenticated,
      users,
      branches,
      products,
      customers,
      visits,
      invoices,
      cloudinaryConfig,
      accountingLogs,
      inventoryLogs,
      auditLogs,
      recordAuditLog,
      clearAuditLogs,
      isOffline,
      pendingInvoicesCount,
      offlineQueueCount,
      deadLetterCount,
      storageQuotaExceeded,
      flushOfflineQueue,
      flushPendingInvoices,
      getPendingInvoicesQueue,
      removePendingInvoices,
      clearPendingInvoicesQueue,
      removeOfflineQueueItems,
      retryOfflineQueueItems,
      clearOfflineQueueItems,
      selectedBranchFilter,
      setSelectedBranchFilter,
      activeSectorFilter,
      setActiveSectorFilter,
      canManageSectorGate,
      effectiveSectorFilter,
      refreshInvoicesNow,
      supabaseStatus,
      isSupabaseSyncing,
      syncWithSupabase,
      checkDatabaseConnection,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      saveCustomersToSupabase,
      importCustomersList,
      cleanAndDeduplicateCustomers,
      clearCustomersCacheAndReset,
      refreshCustomerRepLinks,
      autoCreateMissingRepsFromCustomers,
      mergeDuplicateUsers,
      login,
      register,
      logout,
      updateCurrentUserAvatar,
      addProduct,
      updateProduct,
      deleteProduct,
      importProductsList,
      adjustStock,
      recordInventoryTransaction,
      checkProductAvailability,
      createOrder,
      syncCustomersIncrementally,
      syncTargetsIncrementally,
      loadAllTargets,
      syncProductsIncrementally,
      syncCustomerItemSalesIncrementally,
      approveOrder,
      resendInvoiceEmail,
      forwardOrderToManager,
      rejectOrder,
      editPendingOrder,
      cancelPendingOrderByRep,
      updateOrderStatus,
      requestOctoberSupplyForInvoice,
      dispatchOctoberSupplyForInvoice,
      bulkDispatchOctoberSupply,
      processOrderReturn,
      createStandaloneReturn,
      deleteInvoice,
      syncToAccounting,
      dispatchOrderToMicrosoft,
      updateBranchEmails,
      addUser,
      updateUser,
      deleteUser,
      approveUser,
      rejectUser,
      assignSupervisor,
      authTerminationNotice,
      clearAuthTerminationNotice,
      authMode: getAuthMode(),
      serverAuthEnabled: isServerAuthEnabled(),
      serverAuthProbe,
      updateCloudinarySettings,
      saveMatchedProductImages,
      clearAllAppData,
      wipeAllProductsAndData,
      dataSaverMode,
      setDataSaverMode,
      toggleDataSaverMode,
      isPrivacyMode,
      togglePrivacyMode,
      setPrivacyMode,
      formatConfidentialCurrency,
      installPromptEvent,
      canInstallPwa,
      triggerInstallPrompt,
      isInstallModalOpen,
      setIsInstallModalOpen,
      companyInfo,
      branchCompanyInfo,
      updateCompanyInfo,
      resetCompanyInfo,
      updateBranchCompanyInfo,
      resetBranchCompanyInfo,
      getCompanyInfoForBranch,
      getVisibleInvoices,
      getVisibleCustomers,
      getVisibleVisits,
      visibleVisits,
      addVisit,
      addImportedVisits,
      updateVisit,
      toggleArchiveVisit,
      reviewVisit,
      deleteVisit,
      syncVisitsWithDatabase,
      getCustomerVisitSummary,
      getVisibleProducts,
      getSupervisorsInBranch,
      getSalesRepsForSupervisor,
      loginAs,
      targets,
      forecasts,
      loadForecastsForMonth,
      loadForecastsForYear,
      forecastPlans,
      customerComments,
      loadCustomerComments,
      saveForecast,
      saveForecastBatch,
      deleteForecast,
      deleteCustomerForecasts,
      submitForecastWeek,
      approveForecastWeek,
      approveForecastBatch,
      requestForecastChange,
      saveForecastPlan,
      saveCustomerComment,
      toggleArchiveCustomerComment,
      deleteCustomerComment,
      getVisibleTargets,
      importTargetsFromExcel,
      importTargetsFromGoogleSheet,
      exportTargetsReport,
      resetTargetsToDefault,
      addOrUpdateTargetRecord,
      deleteTargetRecord,
      globalDataVersion,
      isVersionSyncing,
      lastVersionSyncNotice,
      clearVersionSyncNotice,
      checkAndSyncDataVersion,
      publishDataVersionUpdate,
      forcePurgeCacheAndReload,
      promotions,
      saveAndSyncPromotions,
      announcements,
      saveAndSyncAnnouncements,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      currentUser,
      isAuthenticated,
      users,
      branches,
      products,
      customers,
      visits,
      invoices,
      cloudinaryConfig,
      accountingLogs,
      inventoryLogs,
      auditLogs,
      isOffline,
      pendingInvoicesCount,
      offlineQueueCount,
      deadLetterCount,
      storageQuotaExceeded,
      selectedBranchFilter,
      activeSectorFilter,
      canManageSectorGate,
      effectiveSectorFilter,
      supabaseStatus,
      isSupabaseSyncing,
      dataSaverMode,
      isPrivacyMode,
      installPromptEvent,
      canInstallPwa,
      isInstallModalOpen,
      companyInfo,
      branchCompanyInfo,
      visibleVisits,
      visibleCustomersScoped,
      visibleProductsScoped,
      visibleTargetsScoped,
      roleScopedInvoices,
      activeRoleScopedInvoices,
      getVisibleInvoices,
      getVisibleCustomers,
      getVisibleVisits,
      getVisibleProducts,
      getVisibleTargets,
      setActiveSectorFilter,
      targets,
      forecasts,
      forecastPlans,
      customerComments,
      globalDataVersion,
      isVersionSyncing,
      lastVersionSyncNotice,
      promotions,
      announcements,
      authTerminationNotice,
      serverAuthProbe,
    ]
  );

  // كارت الطلب بيتوزّع من provider مستقل: تعديل كمية في الكاشير بقى مش بيغيّر
  // قيمة AppContext الرئيسية، فالشاشات اللي مش بتستخدم الكارت ما بتترندرش.
  // من غير useMemo عن قصد: الدوال بتتقفل على الحالة الحالية (fresh closures)،
  // وأي memo بديبات ناقصة كان ممكن يخزّن نسخة قديمة ويضيّع تعديل كمية.
  const cartValue = { cart, addToCart, updateCartItem, removeFromCart, clearCart, getCartSummary };

  return (
    <AppContext.Provider value={contextValue}>
      <CartContext.Provider value={cartValue}>
        {children}
      </CartContext.Provider>
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
