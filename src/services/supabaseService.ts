import { createClient } from '@supabase/supabase-js';
import { Branch, Customer, Invoice, Product, User, UserRole, CustomerVisit } from '../types';
import { withHashedCredential } from './passwordService';
import { pickUserColumns, sanitizeSupervisorId } from './userRowPayload';
import { resolveCustomerBalanceValue, resolveCustomerDuesValue } from './customerDues';
import { normalizeArabicText } from './arabicMatchingService';
import { classifyError, handleSupabaseError, withRetry, NetworkErrorType } from './networkErrorHandler';
import {
  encodeCustomerNotesWithGeo,
  extractCustomerGeoFromNotes,
  encodeVisitGeoVerificationTag,
  extractVisitGeoFromNotes,
} from './geoVerificationService';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  /^https?:\/\//i.test(SUPABASE_URL) &&
  !SUPABASE_URL.includes('YOUR-PROJECT')
);

/**
 * منع تكرار نفس الطلب في نفس اللحظة (In-flight dedupe)
 * ------------------------------------------------------------------
 * المشكلة: عند تحميل التطبيق أو أول مزامنة، عدة مكونات تنادي نفس
 * الفetcher في نفس الوقت (زيارات/عملاء/منتجات/فواتير) → نفس البيانات
 * بتتنزّل أكتر من مرة من Supabase = استهلاك egress مضاعف ممكن يوصل
 * لحد الـ5 جيجا بسرعة مع 500 مستخدم.
 *
 * الحل: أي طلب بنفس المفتاح أثناء تنفيذ طلب سابق بيستخدم نفس النتيجة
 * بدون طلب إضافي. مفيش أي تأثير على حداثة البيانات (مفيش كاش طويل).
 */
const inFlightRequests = new Map<string, Promise<unknown>>();

export function dedupeInFlightRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const pending = inFlightRequests.get(key);
  if (pending) return pending as Promise<T>;
  const promise = fetcher().finally(() => {
    if (inFlightRequests.get(key) === promise) {
      inFlightRequests.delete(key);
    }
  });
  inFlightRequests.set(key, promise);
  return promise;
}

/** تصفير يدوي عند الحاجة (مثلاً بعد تعديل جوهري) */
export function clearSupabaseInFlightCache(): void {
  inFlightRequests.clear();
}

const offlineSafeFetch: typeof fetch = async () =>
  new Response(
    JSON.stringify({ message: 'Supabase is not configured in this environment', code: 'OFFLINE_NO_CONFIG' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );

// Helper to normalize Supabase role strings to supported UserRole
export function normalizeUserRole(rawRole: any, isAdminFlag?: boolean): UserRole {
  if (isAdminFlag) return 'admin';
  if (!rawRole) return 'sales_rep';
  const r = String(rawRole).toLowerCase().trim();
  if (r === 'developer' || r.includes('dev')) return 'developer';
  if (r === 'admin' || r.includes('super_admin') || r.includes('superadmin')) return 'admin';
  if (r === 'branch_manager' || r.includes('manager') || r.includes('branch')) return 'branch_manager';
  if (r === 'supervisor' || r.includes('supervis')) return 'supervisor';
  if (r === 'sales_rep' || r.includes('rep') || r.includes('sales')) return 'sales_rep';
  return 'sales_rep';
}

// Initialize Supabase Client (safe fallback when env vars are not provisioned)
export const supabase = createClient(
  isSupabaseConfigured ? SUPABASE_URL : 'https://offline-local.supabase.co',
  isSupabaseConfigured ? SUPABASE_ANON_KEY : 'offline-local-anon-key',
  {
    ...(isSupabaseConfigured ? {} : { global: { fetch: offlineSafeFetch } }),
    auth: {
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      detectSessionInUrl: isSupabaseConfigured,
    },
  }
);

// Note: BFCache realtime reconnection is handled selectively in AppContext
// so sales_rep devices do not reopen unnecessary WebSocket connections.

export interface SupabaseSyncStatus {
  connected: boolean;
  tableFound?: string;
  usersCount?: number;
  productsCount?: number;
  invoicesCount?: number;
  customersCount?: number;
  visitsCount?: number;
  targetsCount?: number;
  pingMs?: number;
  /**
   * حالة جدول الفواتير نفسه.
   *
   * production-hardening.sql فعّل RLS على invoices وربطه بـ auth.uid()، و
   * users.id في المشروع نص مش UUID، فالسياسة مش هتطابق أبداً. النتيجة:
   * الجدول مقفول على الكل (بترجع 0 صفوف من غير error) والتطبيق شغال على
   * جدول orders بدله — وده السبب إن كل الفواتير محفوظة في orders.
   *
   * الفحص هنا بيخلّي الوضع يبان بدل ما حد يبني عليه من غير ما يعرف.
   */
  invoicesTableState?: 'live' | 'blocked-by-rls' | 'missing';
  lastSyncTime?: string;
  error?: string;
}

/**
 * يفرق بين جدول فواتير فاضي فعلاً، وجدول مقفول بسبب RLS.
 *
 * الـ RLS بيرجع HTTP 200 مع 0 صفوف، يعني مفيش error نتعرف عليه — العلامة
 * الوحيدة إن orders فيها بيانات. لو получа كده، التطبيق بيشتغل صح على
 * orders بس جدول invoices ميت ومحتاج المرحلة الثانية من
   * add_server_auth_rls.sql عشان يرجع.
 */
function resolveInvoicesTableState(
  invoicesCount: number | null,
  ordersCount: number | null
): 'live' | 'blocked-by-rls' | 'missing' {
  if (invoicesCount === null) return 'missing';
  if (invoicesCount > 0) return 'live';
  return ordersCount !== null && ordersCount > 0 ? 'blocked-by-rls' : 'live';
}

/**
 * Test connectivity with Supabase project and check available tables
 */
export async function testSupabaseConnection(): Promise<SupabaseSyncStatus> {
  if (!isSupabaseConfigured) {
    return {
      connected: false,
      pingMs: 0,
      error: 'لم يتم ضبط إعدادات الاتصال بـ Supabase (يعمل النظام محلياً)',
    };
  }
  const startTime = Date.now();
  try {
    let foundTable = '';
    let usersCount = 0;
    let productsCount = 0;
    let invoicesCount = 0;
    let customersCount = 0;
    let visitsCount = 0;
    let targetsCount = 0;

    const countTable = async (table: string): Promise<number | null> => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const { count, error } = await supabase
          .from(table)
          .select('id', { count: 'estimated', head: true })
          .abortSignal(controller.signal);
        clearTimeout(timeout);
        return error || typeof count !== 'number' ? null : count;
      } catch {
        return null;
      }
    };

    // Fast parallel probe with 2.0s maximum ceiling
    const [usersResult, productsResult, invoicesResult, customersResult, ordersResult, visitsResult, targetsResult] = await Promise.all([
      countTable('users'),
      countTable('products'),
      countTable('invoices'),
      countTable('customers'),
      countTable('orders'),
      countTable('visits'),
      countTable('targets'),
    ]);

    const pingMs = Math.max(1, Date.now() - startTime);

    if (usersResult !== null) {
      foundTable += 'المستخدمين ';
      usersCount = usersResult;
    } else {
      const profilesResult = await countTable('profiles');
      if (profilesResult !== null) {
        foundTable += 'profiles ';
        usersCount = profilesResult;
      }
    }
    if (productsResult !== null) {
      foundTable += 'الأصناف ';
      productsCount = productsResult;
    }
    if (invoicesResult !== null || ordersResult !== null) {
      foundTable += 'الطلبيات ';
      invoicesCount = (invoicesResult || 0) + (ordersResult || 0);
    }
    if (customersResult !== null) {
      foundTable += 'العملاء ';
      customersCount = customersResult;
    }
    if (visitsResult !== null) {
      foundTable += 'الزيارات ';
      visitsCount = visitsResult;
    }
    if (targetsResult !== null) {
      foundTable += 'الأهداف ';
      targetsCount = targetsResult;
    }

    return {
      connected: true,
      tableFound: foundTable.trim() ? `متصل بنجاح بالسيرفر السحابي (${foundTable.trim()})` : 'متصل بنجاح بقاعدة البيانات السحابية (Supabase PostgreSQL)',
      usersCount,
      productsCount,
      invoicesCount,
      customersCount,
      visitsCount,
      targetsCount,
      pingMs,
      invoicesTableState: resolveInvoicesTableState(invoicesResult, ordersResult),
      lastSyncTime: new Date().toLocaleTimeString('ar-EG'),
    };
  } catch (err: any) {
    return {
      connected: false,
      pingMs: Date.now() - startTime,
      error: err?.message || 'فشل الاتصال بقاعدة بيانات Supabase',
    };
  }
}

export interface TableWriteProbe {
  table: string;
  ok: boolean;
  code?: string;
  message?: string;
  note?: string;
}

/**
 * فحص صلاحية الكتابة الفعلية على الجداول.
 *
 * فحص الاتصال العادي بيعدّ صفوف بس (قراءة) — عشان كده الشاشة تقول «متصل»
 * والكتابة تفشل من غير أي رسالة: سياسة RLS بتفلتر الصف في التحديث وترجع
 * 204 بدون error، والحاجة نفسها بتحصل لو العمود أو القيد مرفوض.
 *
 * هنا بنعمل تحديث بنفس القيمة ونطلب الصفوف الراجعة بـ .select('id'):
 *  - error  → الكتابة مرفوضة (بنعرض كود Postgres والرسالة).
 *  - 0 صفوف → الكتابة متفلترة بسياسة RLS (مفيش error بس مفيش حفظ).
 *  - صف راجع → الكتابة شغالة فعلاً.
 * التحديث بنفس القيمة مش بيغيّر أي بيانات.
 */
export async function probeWriteAccess(): Promise<TableWriteProbe[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const tables = ['users', 'customers', 'products', 'orders', 'targets', 'visits'];
  const probes: TableWriteProbe[] = [];

  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        probes.push({ table, ok: false, code: error.code, message: error.message, note: 'تعذرت القراءة' });
        continue;
      }
      if (!data || data.length === 0) {
        probes.push({ table, ok: true, note: 'الجدول فاضي — مفيش صف لاختبار الكتابة' });
        continue;
      }

      const row = data[0];
      const column = Object.keys(row).find(
        (key) =>
          key !== 'id' &&
          (typeof row[key] === 'string' || typeof row[key] === 'number' || row[key] === null)
      );
      if (!column) {
        probes.push({ table, ok: true, note: 'مفيش عمود بسيط للاختبار' });
        continue;
      }

      const { data: updatedRows, error: writeError } = await supabase
        .from(table)
        .update({ [column]: row[column] })
        .eq('id', row.id)
        .select('id');

      if (writeError) {
        probes.push({
          table,
          ok: false,
          code: writeError.code,
          message: writeError.message,
          note: `فشل التحديث على (${column})`,
        });
      } else if (!updatedRows || updatedRows.length === 0) {
        probes.push({
          table,
          ok: false,
          code: 'RLS',
          message: 'التحديث رجع 0 صفوف بدون خطأ — الكتابة متفلترة بسياسة RLS',
          note: `العمود ${column}`,
        });
      } else {
        probes.push({ table, ok: true, note: `الكتابة متاحة (${column})` });
      }
    } catch (e: any) {
      probes.push({ table, ok: false, message: e?.message || 'خطأ غير معروف' });
    }
  }

  return probes;
}

/**
 * Which slice of the customer base a device is allowed to download.
 *
 * The table holds 3,400+ rows and every column is genuinely used by the financial
 * reports, so the only meaningful reduction is fewer rows. Admins and developers
 * keep the full base; everyone else pulls the branches they actually work in,
 * which is exactly what the UI already lets them see.
 */
export interface CustomerFetchScope {
  branchNames?: string[];
  /** أسماء فروع تُطابق جزئيًا (للقطاعات اللي بتتعرّف من كلمة زي «كهرب»). */
  branchNameContains?: string[];
  /** أسماء مندوبين: بنطابقها داخل عمود rep_name (العميل ممكن يكون متسجل باسم المندوب). */
  repNames?: string[];
  /** أكواد/معرّفات المندوبين في عمود rep_id. */
  repIds?: string[];
  /** عملاء بدون فرع مسجّل — بيظهرون للمشرف/المدير بعد الاستنتاج من العنوان. */
  includeUnassignedBranch?: boolean;
  /** للمندوب: عدم السقوط لقراءة قاعدة الشركة كاملة إذا لم يطابق النطاق صفوفاً. */
  strictNoFullFallback?: boolean;
  /** تقليص الأعمدة الثقيلة (مثل visit_history و guarantee_docs) لأجهزة المناديب الميدانيين. */
  slimFieldColumns?: boolean;
}

/**
 * Which slice of the visits table a device is allowed to download.
 */
export interface VisitFetchScope {
  branchNames?: string[];
  branchNameContains?: string[];
  repNames?: string[];
  repIds?: string[];
  includeUnassignedBranch?: boolean;
  /** حد أدنى للتاريخ (YYYY-MM-DD): الزيارات الأقدم مش محمولة على الموبايل. */
  sinceDate?: string;
  /** للمندوب: عدم السقوط لقراءة جدول الزيارات بالكامل إذا لم يطابق النطاق صفوفاً. */
  strictNoFullFallback?: boolean;
}

/**
 * يقتبس قيمة جوه تعبير or= بتاع PostgREST.
 * الأقواس والفواصل جوه القيمة بتكسر الصيغة، فبنشيلها.
 */
function quoteOrValue(value: string): string {
  const clean = String(value).replace(/["(),]/g, ' ').trim();
  return `"${clean}"`;
}

/**
 * يبني شروط القراءة المحدودة كتعبير or واحد.
 *
 * PostgREST مش بيعرف يعمل OR بين أعمدة مختلفة غير بتعبير واحد، ولو عملنا
 * فلترين منفصلين (branch و rep_name) بيتحوّلوا لـ AND — يعني مندوب في فرع
 * والعميل متسجل باسمه في فرع تاني كان هيختفي. التعبير الواحد ده بيضمن إن
 * أي عميل بيخص المندوب (بالفرع أو بالاسم أو بالكود) بيتنزّل.
 */
function buildScopeOrClauses(scope?: {
  branchNames?: string[];
  branchNameContains?: string[];
  repNames?: string[];
  repIds?: string[];
  includeUnassignedBranch?: boolean;
}): string[] {
  const clauses: string[] = [];
  const branches = (scope?.branchNames || []).filter((b) => b && b.trim().length > 0);
  if (branches.length > 0) {
    clauses.push(`branch_name.in.(${branches.map(quoteOrValue).join(',')})`);
  }
  (scope?.branchNameContains || []).filter(Boolean).forEach((needle) => {
    clauses.push(`branch_name.ilike.${quoteOrValue(`*${needle}*`)}`);
  });
  (scope?.repIds || []).filter(Boolean).forEach((id) => {
    clauses.push(`rep_id.eq.${quoteOrValue(id)}`);
  });
  (scope?.repNames || []).filter(Boolean).forEach((name) => {
    clauses.push(`rep_name.ilike.${quoteOrValue(`*${name}*`)}`);
  });
  if (scope?.includeUnassignedBranch) clauses.push('branch_name.is.null');
  return clauses;
}

/** هل فيه أي فلتر فعلي؟ (تستخدمه مسارات القراءة عشان تعرف تعمل fallback ولا لأ) */
function hasScopeFilters(scope?: CustomerFetchScope | VisitFetchScope): boolean {
  return buildScopeOrClauses(scope).length > 0;
}

/** يطبّق نطاق القراءة على أي query من Supabase. */
function applyScopeToQuery(query: any, scope?: CustomerFetchScope | VisitFetchScope): any {
  const clauses = buildScopeOrClauses(scope);
  return clauses.length > 0 ? query.or(clauses.join(',')) : query;
}

/** أربعين ألف صف: حدّ أمان ضد جدول مش متوقع، مش رقم تشغيل. */
const MAX_VISIT_PAGES = 40;

const isMissingColumnError = (err: any): boolean => {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return code === '42703' || code === 'PGRST204' || (msg.includes('column') && msg.includes('does not exist')) || msg.includes('could not find');
};

const CUSTOMERS_FULL_SELECT_COLUMNS = [
  'id', 'code', 'name', 'store_name', 'phone', 'address', 'region', 'city', 'governorate',
  'branch_name', 'sector', 'rep_name', 'rep_id', 'tax_number', 'tier', 'credit_limit',
  'balance', 'current_balance', 'notes', 'last_visit_date', 'visit_count_2026', 'visit_history',
  'created_at', 'updated_at', 'sales_2026', 'total_monthly_sales', 'total_overall_sales',
  'collections_2026', 'total_monthly_collections', 'total_overall_collections',
  'monthly_sales_2026', 'monthly_collections_2026', 'sales_2025', 'collections_2025',
  'overdue_2025', 'overdue_2026', 'due_until_period', 'opening_balance_2026',
  'total_overdue', 'total_overdue_and_due', 'overdue_balance', 'due_balance',
  'deal_eligibility', 'dealt_2026', 'dealt_in_2026', 'has_dealt_in_2026',
  'activity_type', 'client_type', 'payment_terms', 'guarantee_docs', 'guarantee_amount',
  'last_collection_date', 'last_collection_amount',
].join(',');

// نسخة مخففة للمناديب الميدانيين: تحذف الحقول النصية/الـJSON الضخمة غير المطلوبة ميدانياً (مثل visit_history و guarantee_docs)
const CUSTOMERS_FIELD_SELECT_COLUMNS = [
  'id', 'code', 'name', 'store_name', 'phone', 'address', 'region', 'city', 'governorate',
  'branch_name', 'sector', 'rep_name', 'rep_id', 'tax_number', 'tier', 'credit_limit',
  'balance', 'current_balance', 'notes', 'last_visit_date', 'visit_count_2026',
  'created_at', 'updated_at', 'sales_2026', 'total_monthly_sales', 'total_overall_sales',
  'collections_2026', 'total_monthly_collections', 'total_overall_collections',
  'monthly_sales_2026', 'monthly_collections_2026', 'sales_2025', 'collections_2025',
  'overdue_2025', 'overdue_2026', 'due_until_period', 'opening_balance_2026',
  'total_overdue', 'total_overdue_and_due', 'overdue_balance', 'due_balance',
  'deal_eligibility', 'dealt_2026', 'dealt_in_2026', 'has_dealt_in_2026',
  'activity_type', 'client_type', 'payment_terms', 'guarantee_amount',
  'last_collection_date', 'last_collection_amount',
].join(',');

/**
 * Supabase REST returns at most 1,000 rows per request by default.
 * Read the table in pages so imports and role-specific counts include the full dataset.
 */
async function fetchAllRows(
  table: 'customers' | 'clients',
  scope?: CustomerFetchScope,
  updatedSince?: string
): Promise<{ data: any[]; error: any }> {
  const pageSize = 1000;
  const rows: any[] = [];
  let selectCols =
    table === 'customers'
      ? scope?.slimFieldColumns
        ? CUSTOMERS_FIELD_SELECT_COLUMNS
        : CUSTOMERS_FULL_SELECT_COLUMNS
      : '*';

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(selectCols);
    query = applyScopeToQuery(query, scope);
    // ترتيب ثابت ضروري لصفحات `.range()` — من غيره الصفحات ممكن تكرر
    // أو تتخطى صفوف لو السيرفر رجّعهم بترتيب مختلف بين الطلبات.
    query = query.order('id', { ascending: true });
    // مزامنة تدريجية: بنجيب بس الصفوف اللي اتغيرت بعد آخر مزامنة ناجحة
    // بدل تنزيل نطاق العملاء كامل عند أي تعديل. `gte` مش `gt` عشان صفوف
    // اللحظة الحدودية ترجع تاني بدل ما تتخطى (الدمج بالـ id idempotent).
    if (updatedSince) {
      query = query.gte('updated_at', updatedSince);
    }
    let { data, error } = await query.range(from, from + pageSize - 1);

    if (error && selectCols !== '*' && isMissingColumnError(error)) {
      selectCols = '*';
      let fallbackQuery = supabase.from(table).select('*');
      fallbackQuery = applyScopeToQuery(fallbackQuery, scope).order('id', { ascending: true });
      if (updatedSince) fallbackQuery = fallbackQuery.gte('updated_at', updatedSince);
      ({ data, error } = await fallbackQuery.range(from, from + pageSize - 1));
    }

    if (error) return { data: rows, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return { data: rows, error: null };
}

/**
 * Fetch all customers from Supabase (checking 'customers' or 'clients')
 */
export function fetchCustomersFromSupabase(
  scope?: CustomerFetchScope,
  options?: { updatedSince?: string }
): Promise<{ success: boolean; customers?: Customer[]; error?: string; scoped?: boolean }> {
  return dedupeInFlightRequest(
    `customers:${JSON.stringify(scope ?? null)}:${options?.updatedSince ?? ''}`,
    () => fetchCustomersFromSupabaseImpl(scope, options)
  );
}

async function fetchCustomersFromSupabaseImpl(
  scope?: CustomerFetchScope,
  options?: { updatedSince?: string }
): Promise<{ success: boolean; customers?: Customer[]; error?: string; scoped?: boolean }> {
  try {
    const updatedSince = options?.updatedSince?.trim() || undefined;
    let rawCustomers: any[] | null = null;
    let scopedUsed = hasScopeFilters(scope);
    let { data: custData, error: cErr } = await fetchAllRows('customers', scope, updatedSince);
    if (!cErr && !updatedSince && scopedUsed && custData.length === 0 && !scope?.strictNoFullFallback) {
      // Branch names are free-text Arabic, so a narrow read that matches nothing
      // degrades to the full base for managers/supervisors - but strict field reps
      // stay scoped to avoid downloading 5,400+ company rows unnecessarily.
      console.warn('Scoped customer fetch matched no rows; falling back to the full base.');
      scopedUsed = false;
      const fallback = await fetchAllRows('customers');
      if (!fallback.error && fallback.data.length > 0) {
        custData = fallback.data;
        cErr = null;
      }
    }
    if (!cErr && custData.length > 0) {
      rawCustomers = custData;
    } else if (!updatedSince && !scope?.strictNoFullFallback) {
      const { data: clientData, error: clErr } = await fetchAllRows('clients', scope);
      if (!clErr && clientData.length > 0) {
        rawCustomers = clientData;
      }
    }

    if (rawCustomers && rawCustomers.length > 0) {
      const mapped: Customer[] = rawCustomers.map((c: any, idx: number) => {
        const parseMonthlyMap = (raw: any): Record<number, number> | undefined => {
          if (!raw) return undefined;
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (parsed && typeof parsed === 'object') return parsed;
          } catch {}
          return undefined;
        };
        const { cleanNotes, meta: geoMeta } = extractCustomerGeoFromNotes(c.notes);
        const resolvedLat = c.latitude !== undefined && c.latitude !== null ? Number(c.latitude) : geoMeta?.lat;
        const resolvedLng = c.longitude !== undefined && c.longitude !== null ? Number(c.longitude) : geoMeta?.lng;
        return {
          id: c.id || `cust-${idx + 1}`,
          code: c.code || c.customer_code || `CUST-${1000 + idx + 1}`,
          name: c.name || c.customer_name || 'عميل بدون اسم',
          storeName: c.store_name || c.storeName || c.name || '',
          phone: c.phone || c.mobile || '',
          address: c.address || c.region || c.city || '',
          governorate: c.governorate || '',
          branchName: c.branch_name || c.branchName || 'فرع القاهرة',
          sector: ['home', 'electrical', 'both', 'all'].includes(c.sector) ? c.sector : undefined,
          repName: c.rep_name || c.repName || 'مندوب المبيعات',
          salesRepName: c.rep_name || c.repName || 'مندوب المبيعات',
          repId: c.rep_id || c.repId || '',
          taxNumber: c.tax_number || c.taxNumber || '',
          tier: c.tier || 'متوسط',
          creditLimit: Number(c.credit_limit ?? c.creditLimit ?? 0),
          balance: Number(c.balance ?? c.current_balance ?? 0),
          currentBalance: Number(c.current_balance ?? c.balance ?? 0),
          notes: cleanNotes,
          latitude: resolvedLat,
          longitude: resolvedLng,
          locationAddress: c.location_address || geoMeta?.addr || undefined,
          locationCapturedAt: c.location_captured_at || geoMeta?.at || undefined,
          locationCapturedBy: c.location_captured_by || geoMeta?.by || undefined,
          locationLocked: c.location_locked !== undefined ? Boolean(c.location_locked) : Boolean(geoMeta?.locked),
          locationApprovedBy: c.location_approved_by || geoMeta?.appBy || undefined,
          locationApprovedAt: c.location_approved_at || geoMeta?.appAt || undefined,
          locationPhotoUrl: c.location_photo_url || geoMeta?.photo || undefined,
          locationAccuracy: geoMeta?.acc,
          lastVisitDate: c.last_visit_date || c.lastVisitDate || undefined,
          visitCount2026: c.visit_count_2026 !== undefined ? Number(c.visit_count_2026) : undefined,
          visitHistory: c.visit_history ? (typeof c.visit_history === 'string' ? JSON.parse(c.visit_history) : c.visit_history) : undefined,
          createdAt: c.created_at || new Date().toISOString(),
          // Sales & Collections analytics (mapped back so totals are not lost on sync)
          sales2026: Number(c.sales_2026 || c.sales2026 || 0),
          totalMonthlySales: Number(c.total_monthly_sales || c.totalMonthlySales || c.sales_2026 || 0),
          totalOverallSales: Number(c.total_overall_sales || c.totalOverallSales || 0),
          collections2026: Number(c.collections_2026 || c.collections2026 || 0),
          totalMonthlyCollections: Number(c.total_monthly_collections || c.totalMonthlyCollections || c.collections_2026 || 0),
          totalOverallCollections: Number(c.total_overall_collections || c.totalOverallCollections || 0),
          monthlySales2026: parseMonthlyMap(c.monthly_sales_2026 || c.monthlySales2026),
          monthlyCollections2026: parseMonthlyMap(c.monthly_collections_2026 || c.monthlyCollections2026),
          sales2025: c.sales_2025 !== undefined && c.sales_2026 !== undefined ? Number(c.sales_2025) : (c.sales2025 !== undefined ? Number(c.sales2025) : undefined),
          collections2025: c.collections_2025 !== undefined ? Number(c.collections_2025) : (c.collections2025 !== undefined ? Number(c.collections2025) : undefined),
          overdue2025: c.overdue_2025 !== undefined ? Number(c.overdue_2025) : (c.overdue2025 !== undefined ? Number(c.overdue2025) : undefined),
          overdue2026: c.overdue_2026 !== undefined ? Number(c.overdue_2026) : (c.overdue2026 !== undefined ? Number(c.overdue2026) : undefined),
          dueUntilPeriod: c.due_until_period !== undefined && c.due_until_period !== null ? Number(c.due_until_period) : (c.dueUntilPeriod !== undefined ? Number(c.dueUntilPeriod) : undefined),
          openingBalance2026: c.opening_balance_2026 !== undefined ? Number(c.opening_balance_2026) : (c.openingBalance2026 !== undefined ? Number(c.openingBalance2026) : undefined),
          // Dues / receivables are stored in their own columns so that a signed-in
          // supervisor never falls back to the debt balance for المستحقات.
          totalOverdue: c.total_overdue !== undefined && c.total_overdue !== null ? Number(c.total_overdue) : undefined,
          totalOverdueAndDue: c.total_overdue_and_due !== undefined && c.total_overdue_and_due !== null ? Number(c.total_overdue_and_due) : undefined,
          overdueBalance: c.overdue_balance !== undefined && c.overdue_balance !== null ? Number(c.overdue_balance) : undefined,
          dueBalance: c.due_balance !== undefined && c.due_balance !== null ? Number(c.due_balance) : undefined,
          // Authoritative قابل / غير قابل classification from the sheet.
          dealEligibility: c.deal_eligibility || undefined,
          dealt2026: c.dealt_2026 || undefined,
          hasDealtIn2026: c.dealt_in_2026 !== undefined && c.dealt_in_2026 !== null
            ? Boolean(c.dealt_in_2026)
            : (c.has_dealt_in_2026 !== undefined && c.has_dealt_in_2026 !== null
                ? Boolean(c.has_dealt_in_2026)
                : undefined),
          // Sheet slicer columns restored so the analytics slicers stay dynamic.
          activityType: c.activity_type || c.activityType || undefined,
          clientType: c.client_type || c.clientType || undefined,
          paymentTerms: c.payment_terms || c.paymentTerms || undefined,
          guaranteeDocs: c.guarantee_docs || c.guaranteeDocs || undefined,
          guaranteeAmount: c.guarantee_amount !== undefined && c.guarantee_amount !== null
            ? Number(c.guarantee_amount)
            : (c.guaranteeAmount !== undefined ? Number(c.guaranteeAmount) : undefined),
          region: c.region || undefined,
          lastCollectionDate: c.last_collection_date || c.lastCollectionDate || undefined,
          lastCollectionAmount: c.last_collection_amount !== undefined && c.last_collection_amount !== null
            ? Number(c.last_collection_amount)
            : (c.lastCollectionAmount !== undefined ? Number(c.lastCollectionAmount) : undefined),
        };
      });
      return { success: true, customers: mapped, scoped: scopedUsed };
    }

    return { success: true, customers: [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'خطأ في جلب قاعدة بيانات العملاء' };
  }
}

/**
 * بصمة محتوى جدول العملاء — صف واحد بدل 3,400 صف.
 *
 * الـ heartbeat كان بينزّل الجدول كامل (3,400 صف × ~60 عمود ≈ 3-8MB) كل 60
 * ثانية على كل جهاز عشان يشوف الإدارة عدّلت أرقام ولا لأ. مع 300 موظف ده
 * كان بياكل ~27GB في الساعة ضد حد 5GB في الشهر.
 *
 * البصمة هنا بترجّع عمودين بس: عدد الصفوف (بييجي من هيدر content-range عبر
* count=exact من غير ما يتبعت في الـ body)، وآخر updated_at على الجدول. لو
 * الاتنين ماتغيّروش مفيش داعي نحمّل حاجة — والتطبيق بيفصل التنزيل الكامل
 * ويكتفي بالبصمة.
 *
 * updated_at بيتحدّث في كل حفظ (saveCustomersToSupabase بيكتبه صريح)،
 * فأي تعديل إداري بيتغيّر معاه. لو التعديل حصل بطريقة تانية (SQL مباشر
 * مثلاً) الـ count بيساعد، وفي كل الأحوال في شبكة أمان كاملة في
 * AppContext بتشتغل كل ربع ساعة.
 */
export interface CustomerContentStamp {
  count: number | null;
  maxUpdatedAt: string | null;
}

export async function fetchCustomerContentStamp(
  scope?: CustomerFetchScope
): Promise<CustomerContentStamp | null> {
  try {
    let query = supabase
      .from('customers')
      .select('updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1);
    query = applyScopeToQuery(query, scope);

    const { data, error, count } = await query;
    if (error) return null;

    const maxUpdatedAt = data && data.length > 0 ? data[0]?.updated_at ?? null : null;
    return {
      count: typeof count === 'number' ? count : null,
      maxUpdatedAt: maxUpdatedAt ? String(maxUpdatedAt) : null,
    };
  } catch {
    return null;
  }
}

export interface VisitContentStamp {
  count: number | null;
  maxUpdatedAt: string | null;
}

/**
 * بصمة جدول الأهداف (عدد الصفوف + أحدث updated_at) — صف واحد فقط.
 *
 * التارجت بيتغيّر مرة أو مرتين في الشهر، لكن التطبيق كان بينزّل الـ572 صف
 * (~30KB مضغوطة) مع **كل فتح**. البصمة دي بتخلّي الفتح العادي يكلّف ~0.5KB.
 */
export interface TargetFetchScope {
  branchNames?: string[];
  repNames?: string[];
}

function applyTargetScope(query: any, scope?: TargetFetchScope): any {
  if (!scope) return query;
  const clauses: string[] = [];
  const branches = (scope.branchNames || []).map((b) => String(b).trim()).filter(Boolean);
  if (branches.length > 0) {
    clauses.push(`branch.in.(${branches.map(quoteOrValue).join(',')})`);
    branches.forEach((b) => {
      const shortBranch = b.replace(/فرع/g, '').replace(/\([^)]*\)/g, '').trim();
      if (shortBranch.length >= 3) {
        clauses.push(`branch.ilike.${quoteOrValue(`*${shortBranch}*`)}`);
      }
    });
  }
  (scope.repNames || []).map((n) => String(n).trim()).filter(Boolean).forEach((name) => {
    clauses.push(`rep_name.ilike.${quoteOrValue(`*${name}*`)}`);
  });
  return clauses.length > 0 ? query.or(clauses.join(',')) : query;
}

export interface TargetContentStamp {
  count: number | null;
  maxUpdatedAt: string | null;
}

export async function fetchTargetContentStamp(
  scope?: TargetFetchScope
): Promise<TargetContentStamp | null> {
  try {
    let query = supabase
      .from('targets')
      .select('updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1);
    query = applyTargetScope(query, scope);
    const { data, error, count } = await query;
    if (error) return null;
    const maxUpdatedAt = data && data.length > 0 ? (data[0] as any)?.updated_at ?? null : null;
    return {
      count: typeof count === 'number' ? count : null,
      maxUpdatedAt: maxUpdatedAt ? String(maxUpdatedAt) : null,
    };
  } catch {
    return null;
  }
}

/**
 * بصمة محتوى جدول الزيارات (عدد الصفوف + أحدث تعديل) — صف واحد فقط.
 *
 * كل فتح للتطبيق كان بينزّل جدول الزيارات كامل (3,700+ صف) لكل الأجهزة،
 * وده كان أكبر بند استهلاك بعد العملاء. البصمة دي بتخلّي الجهاز يسأل
 * «في جديد؟» بس، وما ينزّلش الجدول غير لما يكون فيه تغيير فعلي.
 */
export async function fetchVisitContentStamp(
  scope?: VisitFetchScope
): Promise<VisitContentStamp | null> {
  try {
    const buildQuery = (column: 'updated_at' | 'created_at') => {
      let query = supabase
        .from('visits')
        .select(column, { count: 'exact' })
        .order(column, { ascending: false, nullsFirst: false })
        .limit(1);
      query = applyScopeToQuery(query, scope);
      if (scope?.sinceDate?.trim()) {
        query = query.gte('date', scope.sinceDate.trim());
      }
      return query;
    };

    let result = await buildQuery('updated_at');
    let column: 'updated_at' | 'created_at' = 'updated_at';
    if (result.error) {
      // الجدول القديم ممكن يكون من غير updated_at — بنستخدم created_at.
      result = await buildQuery('created_at');
      column = 'created_at';
    }
    if (result.error) return null;

    const row = result.data && result.data.length > 0 ? (result.data[0] as any) : null;
    const latest = row ? row[column] ?? null : null;
    return {
      count: typeof result.count === 'number' ? result.count : null,
      maxUpdatedAt: latest ? String(latest) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Single source of truth for إجمالي المستحقات (dues).
 *
 * The logic itself now lives in customerFinancialService so the value written
 * here is literally the same function every screen reads back — there is no
 * second copy of the priority chain that can drift out of sync.
 */
export function resolveCustomerDues(c: Customer): number {
  return resolveCustomerDuesValue(c);
}

/**
 * Save / Upsert Customers into Supabase
 */
export async function saveCustomersToSupabase(customers: Customer[]): Promise<{ success: boolean; error?: string }> {
  try {
    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    const payload = customers.map((c) => {
      const stableSeed = c.code ? `cust-${c.code}` : `cust-${c.name}-${c.phone || ''}`;
      const safeId = c.id && isUuid(c.id) ? c.id : stringToUuid(stableSeed);
      // Persist a concrete dues number. Writing null made every other role fall
      // back to the debt balance, which is why المديونية and المستحقات matched.
      const persistedDues = resolveCustomerDues(c);
      return {
        id: safeId,
        code: c.code || null,
        name: c.name || 'عميل بدون اسم',
        store_name: c.storeName || c.name || null,
        phone: c.phone || '',
        address: c.address || '',
        governorate: c.governorate || null,
        branch_name: c.branchName || 'الفرع الرئيسي',
        sector: c.sector || null,
        rep_name: c.repName || c.salesRepName || 'مندوب المبيعات',
        rep_id: c.repId || null,
        tax_number: c.taxNumber || null,
        tier: c.tier || 'متوسط',
        credit_limit: Number(c.creditLimit || 0),
        balance: resolveCustomerBalanceValue(c),
        current_balance: resolveCustomerBalanceValue(c),
        notes: encodeCustomerNotesWithGeo(c) || null,
        last_visit_date: c.lastVisitDate || null,
        visit_count_2026: Number(c.visitCount2026 || 0),
        visit_history: (c.visitHistory || []).length > 0 ? JSON.stringify(c.visitHistory) : null,
        // Sales & Collections analytics (to prevent totals disappearing after sync)
        sales_2026: Number(c.sales2026 || 0),
        total_monthly_sales: Number(c.totalMonthlySales || 0),
        total_overall_sales: Number(c.totalOverallSales || 0),
        collections_2026: Number(c.collections2026 || 0),
        total_monthly_collections: Number(c.totalMonthlyCollections || 0),
        total_overall_collections: Number(c.totalOverallCollections || 0),
        monthly_sales_2026: c.monthlySales2026 ? JSON.stringify(c.monthlySales2026) : null,
        monthly_collections_2026: c.monthlyCollections2026 ? JSON.stringify(c.monthlyCollections2026) : null,
        sales_2025: c.sales2025 !== undefined ? Number(c.sales2025) : null,
        collections_2025: c.collections2025 !== undefined ? Number(c.collections2025) : null,
        overdue_2025: c.overdue2025 !== undefined ? Number(c.overdue2025) : null,
        overdue_2026: c.overdue2026 !== undefined ? Number(c.overdue2026) : null,
        due_until_period: c.dueUntilPeriod !== undefined ? Number(c.dueUntilPeriod) : null,
        opening_balance_2026: c.openingBalance2026 !== undefined ? Number(c.openingBalance2026) : null,
        has_dealt_in_2026: c.hasDealtIn2026 || false,
        // Dues / receivables persist separately from the debt balance
        total_overdue: c.totalOverdue !== undefined ? Number(c.totalOverdue) : persistedDues,
        total_overdue_and_due: persistedDues,
        overdue_balance: c.overdueBalance !== undefined ? Number(c.overdueBalance) : persistedDues,
        due_balance: c.dueBalance !== undefined ? Number(c.dueBalance) : null,
        // قابل / غير قابل and the dealt label drive the dashboard classification.
        deal_eligibility: c.dealEligibility || null,
        dealt_2026: c.dealt2026 || null,
        dealt_in_2026: c.hasDealtIn2026 || false,
        // Sheet slicer columns. These power the whole "بيانات تجارية وائتمانية"
        // section in the analytics view; without them every slicer reads 0.
        activity_type: c.activityType || null,
        client_type: c.clientType || null,
        payment_terms: c.paymentTerms || null,
        guarantee_docs: c.guaranteeDocs || null,
        guarantee_amount: Number(c.guaranteeAmount || 0),
        region: c.region || c.district || c.route || null,
        last_collection_date: c.lastCollectionDate || null,
        last_collection_amount: Number(c.lastCollectionAmount || 0),
        updated_at: new Date().toISOString(),
      };
    });

    const dedupedPayload = Array.from(new Map(payload.map((r) => [r.id, r])).values());
    const failures: string[] = [];
    const OMITTABLE_COLUMNS = [
      'total_overdue_and_due', 'overdue_balance', 'due_balance', 'total_overdue',
      'deal_eligibility', 'dealt_2026', 'dealt_in_2026',
    ];

    for (let i = 0; i < dedupedPayload.length; i += 100) {
      const chunk = dedupedPayload.slice(i, i + 100);
      // tyto أعمدة قد تكون غير موجودة في جدول العملاء لدى العميل (لا يوجد migration)،
      // لذلك تُحذف قبل الإرسال لمنع خطأ 400 وتكمل عملية الرفع بالأعمدة المتاحة فقط.
      const cleanChunk = chunk.map((row: any) => {
        const rest: any = { ...row };
        OMITTABLE_COLUMNS.forEach((k) => delete rest[k]);
        return rest;
      });
      const { error: err1 } = await supabase.from('customers').upsert(cleanChunk);
      if (err1) {
        failures.push(err1.message);
      }
    }

    // Report the truth. Returning success here while every chunk failed made the
    // UI claim a sync that never happened, so the next heartbeat pulled the old
    // server copy and correct data appeared to "revert" on its own.
    if (failures.length > 0) {
      return {
        success: false,
        error: `فشل حفظ ${failures.length} من المجموعات: ${failures[0]}`,
      };
    }
    return { success: true };
  } catch (e: any) {
    console.error('Supabase customer save exception:', e);
    const { message } = handleSupabaseError(e, "saveUsersToSupabase");
    return { success: false, error: message };
  }
}

/**
 * Save single Customer into Supabase
 */
export async function saveCustomerToSupabase(customer: Customer): Promise<{ success: boolean; error?: string }> {
  return saveCustomersToSupabase([customer]);
}

/**
 * Delete a single customer from Supabase. Used by the offline outbox so a
 * deletion made without a network is replayed once the device reconnects.
 */
export async function deleteCustomerFromSupabase(
  customerId: string
): Promise<{ success: boolean; removed: number; error?: string }> {
  try {
    const safeId = (customerId || '').trim();
    if (!safeId) return { success: false, removed: 0, error: 'معرّف العميل غير صالح' };

    const { data, error } = await supabase.from('customers').delete().eq('id', safeId).select('id');
    if (error) {
      return { success: false, removed: 0, error: error.message };
    }
    const removed = Array.isArray(data) ? data.length : 0;
    if (removed === 0) {
      // Already absent remotely: treat as done so the queue does not retry forever.
      return { success: true, removed: 0 };
    }
    return { success: true, removed };
  } catch (e: any) {
    return { success: false, removed: 0, error: e?.message || 'تعذر حذف العميل من قاعدة البيانات' };
  }
}

/**
 * Authoritative full replacement of the customers table.
 *
 * Plain upserts keep old rows alive forever: a customer whose id/code changed
 * between imports is inserted again, so every admin sync doubled the database.
 * This writes the whole authoritative list, then removes every remote row that
 * is not part of it, so all reps / supervisors / managers read exactly the same
 * numbers with zero duplicates.
 */
export async function replaceCustomersInSupabase(
  customers: Customer[]
): Promise<{ success: boolean; removed: number; error?: string; verified?: boolean }> {
  try {
    if (!customers || customers.length === 0) {
      return { success: false, removed: 0, error: 'قائمة العملاء فارغة - تم إيقاف المزامنة لمنع حذف البيانات' };
    }

    const saveRes = await saveCustomersToSupabase(customers);
    if (!saveRes.success) {
      return { success: false, removed: 0, error: saveRes.error };
    }

    const keepIds = new Set(
      customers.map((c) => (c.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id)
        ? c.id
        : stringToUuid(c.code ? `cust-${c.code}` : `cust-${c.name}-${c.phone || ''}`)))
    );

    const { data: remoteRows, error: readErr } = await fetchAllRows('customers');
    if (readErr || !remoteRows) {
      return { success: true, removed: 0, verified: false, error: 'تم التحديث لكن تعذر تنظيف السجلات القديمة' };
    }

    const orphans = remoteRows
      .map((r: any) => String(r.id || ''))
      .filter((id: string) => id && !keepIds.has(id));

    let removed = 0;
    for (let i = 0; i < orphans.length; i += 200) {
      const chunk = orphans.slice(i, i + 200);
      const { error: delErr } = await supabase.from('customers').delete().in('id', chunk);
      if (delErr) {
        console.warn('Supabase orphan customer cleanup notice:', delErr.message);
      } else {
        removed += chunk.length;
      }
    }

    // Verify the server really holds the numbers we just sent. Without this the
    // client showed "synced" while the server kept the previous values, and the
    // next heartbeat silently restored the old figures.
    const { data: verifyRows } = await supabase
      .from('customers')
      .select('id, balance, current_balance, total_overdue_and_due')
      .limit(5000);
    const expectedById = new Map(
      customers.map((c) => [
        c.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id)
          ? c.id
          : stringToUuid(c.code ? `cust-${c.code}` : `cust-${c.name}-${c.phone || ''}`),
        Number(c.currentBalance ?? c.balance ?? 0),
      ])
    );
    const mismatches = (verifyRows || []).filter((r: any) => {
      const expected = expectedById.get(String(r.id));
      if (expected === undefined) return false;
      return Math.abs(Number(r.current_balance ?? r.balance ?? 0) - expected) > 0.5;
    }).length;

    if (mismatches > 0) {
      return {
        success: false,
        removed,
        verified: false,
        error: `تعذر تأكيد الحفظ على السيرفر (${mismatches} عميل مختلف). راجع صلاحيات الجدول customers في Supabase.`,
      };
    }

    return { success: true, removed, verified: true };
  } catch (e: any) {
    console.error('Supabase customer replace exception:', e);
    return { success: false, removed: 0, error: e?.message };
  }
}

const CATALOG_SYNC_STORE_ID = '00000000-0000-0000-0000-000000000001';

/**
 * سجل الإصدار العام (`dataVersionService`) بيتخزّن كصف في جدول orders نفسه.
 * معرّفه معرّف هنا مش في dataVersionService عشان 서비스 دي بتستورد supabase
 * من الملف ده — لو_cur كان معرّفه هناك كان هيعمل circular import، والـ
 * استيراد في cycle بيدي undefined في وقت البناء.
 * dataVersionService بيعمل re-export للاسم فأي حد مستورده من هناك بيفضل شغال.
 */
export const GLOBAL_SYNC_VERSION_RECORD_ID = 'dream_app_global_sync_version_v1';

/**
 * أقصى عدد صفحات (1,000 صف كل صفحة) بنجيبه من جدول products.
 * حدّ حماية ضد حلقة لا نهائية بس — الكتالوج الحالي 5,444 صنف، فـ 60 صفحة
 * (60,000 صنف) أوسع من المحتاج بكتير. لو وصلنا هنا فالمشكلة في البيانات مش
 * في الكود، والـ console.warn بيقول ذلك بصراحة بدل ما نقصّ السعر في صمت.
 */
const MAX_PRODUCT_PAGES = 60;
export const USER_SYNC_STORE_ID = '00000000-0000-0000-0000-000000000002';

/** خمسين ألف صف تارجت ≈ 125 شهر لكل مندوب (10 سنين). */
const MAX_TARGET_PAGES = 50;

const TARGETS_FETCH_COLUMNS = [
  'id', 'branch', 'rep_name', 'sales_target', 'sales_achieved', 'sales_percentage',
  'collection_target', 'collection_achieved', 'collection_percentage',
  'target_date', 'month', 'year', 'quarter', 'remaining_sales', 'remaining_collection',
  'notes', 'updated_at',
].join(',');

/**
 * جلب التارجت لآخر N شهر بس — يقلل الـ egress على الفتح الأول.
 * الصف الواحد صغير، لكن عشرات الاف الصفوف تتراكم بسرعة على كل جهاز.
 */
export async function fetchTargetsRecentMonths(
  monthCount = 24,
  scope?: TargetFetchScope
): Promise<{ success: boolean; targets?: any[]; error?: string; count?: number }> {
  try {
    const now = new Date();
    const latestYear = now.getFullYear();
    const latestMonth = now.getMonth() + 1;
    // حساب أقدم شهر ضمن النافذة المطلوبة
    let minYear = latestYear;
    let minMonth = latestMonth - (monthCount - 1);
    while (minMonth <= 0) { minMonth += 12; minYear -= 1; }

    const pageSize = 1000;
    const rows: any[] = [];
    let selectCols = TARGETS_FETCH_COLUMNS;
    for (let page = 0; page < MAX_TARGET_PAGES; page++) {
      const from = page * pageSize;
      const makeTargetQuery = (cols: string) => {
        let q = supabase
          .from('targets')
          .select(cols)
          .gte('year', minYear)
          .order('year', { ascending: false })
          .order('month', { ascending: true });
        return applyTargetScope(q, scope);
      };

      let { data, error }: { data: any[] | null; error: any } = await makeTargetQuery(selectCols).range(
        from,
        from + pageSize - 1
      );
      if (error && selectCols !== '*' && isMissingColumnError(error)) {
        selectCols = '*';
        ({ data, error } = await makeTargetQuery('*').range(from, from + pageSize - 1));
      }
      if (error) return { success: false, error: error.message };
      const list = (data || []).filter((r: any) => {
        const y = Number(r.year);
        const m = Number(r.month);
        if (!y || !m) return false;
        return y > minYear || (y === minYear && m >= minMonth);
      });
      rows.push(...list);
      if (!data || data.length < pageSize) break;
      // لو عدّينا النافذة بالكامل نوقف بدل ما نجيب صفوف قديمة
      const oldest = data[data.length - 1] as any;
      const oy = Number(oldest?.year);
      if (oy && oy < minYear) break;
      if (page === MAX_TARGET_PAGES - 1) {
        console.warn(`Stopgap: targets recent-months read hit the ${MAX_TARGET_PAGES}-page cap.`);
      }
    }
    return { success: true, targets: rows, count: rows.length };
  } catch (error: any) {
    const { message } = handleSupabaseError(error, 'fetchTargetsRecentMonths');
    return { success: false, error: message };
  }
}

export function fetchTargetsFromSupabase(
  scope?: TargetFetchScope
): Promise<{ success: boolean; targets?: any[]; error?: string }> {
  return dedupeInFlightRequest(
    `targets:${JSON.stringify(scope ?? null)}`,
    () => fetchTargetsFromSupabaseImpl(scope)
  );
}

async function fetchTargetsFromSupabaseImpl(
  scope?: TargetFetchScope
): Promise<{ success: boolean; targets?: any[]; error?: string }> {
  try {
    const pageSize = 1000;
    const rows: any[] = [];
    let selectCols = TARGETS_FETCH_COLUMNS;
    for (let page = 0; page < MAX_TARGET_PAGES; page++) {
      const from = page * pageSize;
      const buildQuery = (cols: string) => {
        let q = supabase
          .from('targets')
          .select(cols)
          .order('year', { ascending: false })
          .order('month', { ascending: true });
        return applyTargetScope(q, scope);
      };
      let { data, error } = await buildQuery(selectCols).range(from, from + pageSize - 1);
      if (error && selectCols !== '*' && isMissingColumnError(error)) {
        selectCols = '*';
        ({ data, error } = await buildQuery('*').range(from, from + pageSize - 1));
      }
      if (error) return { success: false, error: error.message };
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
      if (page === MAX_TARGET_PAGES - 1) {
        console.warn(
          `Stopgap: targets read hit the ${MAX_TARGET_PAGES}-page cap (${MAX_TARGET_PAGES * pageSize} rows). ` +
            'Older months were not loaded — check the data, not the code.'
        );
      }
    }
    return { success: true, targets: rows };
  } catch (error: any) {
    const { message } = handleSupabaseError(error, 'fetchTargetsFromSupabase');
    return { success: false, error: message };
  }
}

export async function saveTargetsToSupabase(targets: any[]): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = targets.map((target) => ({
      id: target.id,
      branch: target.branch,
      rep_name: target.repName,
      sales_target: Number(target.salesTarget || 0),
      sales_achieved: Number(target.salesAchieved || 0),
      sales_percentage: Number(target.salesPercentage || 0),
      collection_target: Number(target.collectionTarget || 0),
      collection_achieved: Number(target.collectionAchieved || 0),
      collection_percentage: Number(target.collectionPercentage || 0),
      target_date: target.date,
      month: Number(target.month),
      year: Number(target.year),
      quarter: target.quarter,
      remaining_sales: Number(target.remainingSales || 0),
      remaining_collection: Number(target.remainingCollection || 0),
      notes: target.notes || null,
      updated_at: new Date().toISOString(),
    }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from('targets').upsert(payload.slice(i, i + 500), { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل حفظ التارجت المشترك' };
  }
}

let cachedUsersResponse: { data: User[]; timestamp: number } | null = null;
const USERS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes memory cache for 500-user scale
let activeUsersFetchPromise: Promise<{ success: boolean; users?: User[]; error?: string }> | null = null;

/**
 * pagination لجدول المستخدمين.
 */
const USER_PAGE_SIZE = 1000;
const MAX_USER_PAGES = 5;

const USER_SELECT_BY_TABLE: Record<'users' | 'app_users' | 'profiles', string> = {
  users: 'id,name,username,email,password,role,branch_name,supervisor_id,phone,commission_rate,is_active,approval_status',
  app_users: 'id,name,username,email,password,role,branch_name,phone,is_active,approval_status',
  profiles: 'id,full_name,username,email,role,branch_name,phone,is_active,approval_status',
};

const USER_PUBLIC_SELECT_BY_TABLE: Record<'users' | 'app_users' | 'profiles', string> = {
  users: 'id,name,username,email,role,branch_name,supervisor_id,phone,commission_rate,is_active,approval_status',
  app_users: 'id,name,username,email,role,branch_name,phone,is_active,approval_status',
  profiles: 'id,full_name,username,email,role,branch_name,phone,is_active,approval_status',
};

export function invalidateUsersCache() {
  cachedUsersResponse = null;
}

/**
 * Fetch all users from Supabase (prioritizing 'users', falling back to 'app_users'/'profiles'/snapshot ONLY if 'users' is empty)
 */
export async function fetchUsersFromSupabase(
  forceRefresh: boolean = false,
  options?: { includeCredentials?: boolean }
): Promise<{ success: boolean; users?: User[]; error?: string }> {
  const includeCredentials = options?.includeCredentials ?? true;
  const now = Date.now();
  if (!forceRefresh && cachedUsersResponse && (now - cachedUsersResponse.timestamp < USERS_CACHE_TTL_MS)) {
    return { success: true, users: cachedUsersResponse.data };
  }

  if (activeUsersFetchPromise && !forceRefresh) {
    return activeUsersFetchPromise;
  }

  activeUsersFetchPromise = (async () => {
    try {
      const byId = new Map<string, User>();
      const byEmail = new Map<string, User>();

      const mapUser = (u: any, tbl: string, idx: number): User => {
        const rawEmail = String(u.email || '').trim();
        const emailPrefix = rawEmail ? rawEmail.split('@')[0] : '';
        return {
          id: String(u.id || `sup-${tbl}-${idx + 1}`),
          name: u.name || u.full_name || u.display_name || emailPrefix || 'مستخدم',
          username: String(u.username || u.user_name || emailPrefix || `user_${idx + 1}`).trim().toLowerCase(),
          email: rawEmail,
          password: String(u.password || u.pass || '').trim(),
          role: normalizeUserRole(u.role, u.is_admin),
          branchName: u.branch_name || u.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
          supervisorId: u.supervisor_id || u.supervisorId,
          phone: u.phone || u.mobile || u.tel || '',
          commissionRate: Number(u.commission_rate || u.commissionRate || 2.5),
          isActive: u.is_active !== undefined ? Boolean(u.is_active) : true,
          approvalStatus: u.approval_status || u.approvalStatus || 'active',
        };
      };

      const readUserRows = async (table: 'users' | 'app_users' | 'profiles'): Promise<any[] | null> => {
        const rows: any[] = [];
        const colsMap = includeCredentials ? USER_SELECT_BY_TABLE : USER_PUBLIC_SELECT_BY_TABLE;
        let selectCols = colsMap[table] || '*';
        for (let page = 0; page < MAX_USER_PAGES; page++) {
          const from = page * USER_PAGE_SIZE;
          let { data, error } = await supabase
            .from(table)
            .select(selectCols)
            .range(from, from + USER_PAGE_SIZE - 1);
          if (error && selectCols !== '*' && isMissingColumnError(error)) {
            selectCols = '*';
            ({ data, error } = await supabase
              .from(table)
              .select('*')
              .range(from, from + USER_PAGE_SIZE - 1));
          }
          if (error) return null;
          rows.push(...(data || []));
          if (!data || data.length < USER_PAGE_SIZE) break;
          if (page === MAX_USER_PAGES - 1) {
            console.warn(
              `Stopgap: users read from "${table}" hit the ${MAX_USER_PAGES}-page cap ` +
                `(${MAX_USER_PAGES * USER_PAGE_SIZE} accounts). Check the data, not the code.`
            );
          }
        }
        return rows;
      };

      try {
        const data = await readUserRows('users');
        if (data && data.length > 0) {
          data.forEach((row: any, idx: number) => {
            const user = mapUser(row, 'users', idx);
            byId.set(user.id, user);
            if (user.email) byEmail.set(user.email.toLowerCase(), user);
          });
        }
      } catch {
        // Continue to secondary tables if needed
      }

      // Query fallback tables ONLY when primary 'users' table returned 0 records (saves 3 roundtrips & egress per refresh)
      if (byId.size === 0) {
        for (const tbl of ['app_users', 'profiles'] as const) {
          try {
            const data = await readUserRows(tbl);
            if (!data) continue;
            data.forEach((row: any, idx: number) => {
              const user = mapUser(row, tbl, idx);
              const existing = byId.get(user.id) || (user.email && byEmail.get(user.email.toLowerCase()));
              const mergedPassword = (user.password && user.password.trim().length > 0)
                ? user.password.trim()
                : (existing?.password || '');
              const mergedPhone = (user.phone && user.phone.trim().length > 0)
                ? user.phone.trim()
                : (existing?.phone || '');
              const mergedUser: User = {
                ...existing,
                ...user,
                password: mergedPassword,
                phone: mergedPhone,
                branchName: (user.branchName && user.branchName.trim().length > 0)
                  ? user.branchName
                  : (existing?.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)'),
              };
              byId.set(mergedUser.id, mergedUser);
              if (mergedUser.email) byEmail.set(mergedUser.email.toLowerCase(), mergedUser);
            });
          } catch {
            // Continue
          }
        }
      }

      // Check central snapshot ONLY if primary tables yielded zero users
      if (byId.size === 0) {
        try {
          const { data } = await supabase.from('orders').select('items').eq('id', USER_SYNC_STORE_ID).limit(1);
          const items = data?.[0]?.items;
          const snapshot = Array.isArray(items) ? items : typeof items === 'string' ? JSON.parse(items) : [];
          snapshot.forEach((row: any, idx: number) => {
            const user = mapUser(row, 'snapshot', idx);
            const existing = byId.get(user.id) || (user.email && byEmail.get(user.email.toLowerCase()));
            if (!existing) {
              byId.set(user.id, user);
              if (user.email) byEmail.set(user.email.toLowerCase(), user);
            } else if ((!existing.password || existing.password.trim().length === 0) && user.password && user.password.trim().length > 0) {
              existing.password = user.password.trim();
            }
          });
        } catch {
          // snapshot optional
        }
      }

      const users = Array.from(byId.values());
      if (users.length > 0) {
        cachedUsersResponse = { data: users, timestamp: Date.now() };
        return { success: true, users };
      }
      return { success: false, error: 'لم يتم العثور على مستخدمين في أي من الجداول' };
    } catch (err: any) {
      const { type, message } = handleSupabaseError(err, 'fetchUsersFromSupabase');
      return { success: false, error: message };
    } finally {
      activeUsersFetchPromise = null;
    }
  })();

  return activeUsersFetchPromise;
}

/**
 * Helper to sanitize email and identifier strings by stripping parentheses, brackets, and extra spaces
 */
export function sanitizeIdentifier(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[()[\]{}<>"'`\\/]/g, '').trim();
}

export function sanitizeEmail(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[()[\]{}<>"'`\\/]/g, '').replace(/\s+/g, '').trim().toLowerCase();
}

/**
 * Find a specific user in Supabase by email, username, name, or phone safely
 * Checks both freshly fetched cache and direct queries against 'app_users', 'users', and 'profiles'
 */
export async function findUserInSupabase(identifier: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const rawClean = sanitizeIdentifier(identifier);
    const cleanLower = rawClean.toLowerCase();
    const cleanEmail = sanitizeEmail(identifier);
    const asciiDigits = identifier.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).replace(/\D/g, '').trim();
    const normInput = normalizeArabicText(identifier).replace(/\s+/g, '');

    if (!rawClean && !normInput && !asciiDigits) {
      return { success: false, error: 'المعرف فارغ' };
    }

    // 1. Direct targeted 1-row lookup on 'users' / 'app_users' / 'profiles' FIRST
    // Saves fetching all 500 user rows on every employee login.
    const targetTables = ['users', 'app_users', 'profiles'] as const;
    const escapedClean = cleanLower.replace(/[,()]/g, ' ').trim();
    for (const tbl of targetTables) {
      try {
        let selectCols = USER_SELECT_BY_TABLE[tbl] || '*';
        const buildUserLookupQuery = (cols: string) => {
          let qb = supabase.from(tbl).select(cols);
          if (cleanEmail.includes('@')) {
            qb = qb.ilike('email', cleanEmail);
          } else if (asciiDigits.length >= 8) {
            qb = qb.ilike('phone', `%${asciiDigits.slice(-8)}%`);
          } else if (escapedClean) {
            qb = qb.or(
              `username.ilike.${quoteOrValue(escapedClean)},email.ilike.${quoteOrValue(`${escapedClean}%`)},name.ilike.${quoteOrValue(`*${escapedClean}*`)}`
            );
          } else {
            return null;
          }
          return qb.limit(1);
        };

        const firstQuery = buildUserLookupQuery(selectCols);
        if (!firstQuery) continue;
        let { data: rows, error: qErr } = await firstQuery;
        if (qErr && selectCols !== '*' && isMissingColumnError(qErr)) {
          const fbQuery = buildUserLookupQuery('*');
          if (fbQuery) ({ data: rows, error: qErr } = await fbQuery);
        }

        if (!qErr && rows && rows.length > 0) {
          const rawRow = rows[0] as any;
          const rawEmail = String(rawRow.email || '').trim();
          const emailPrefix = rawEmail ? rawEmail.split('@')[0] : '';
          let password = String(rawRow.password || rawRow.pass || '').trim();

          // If profiles was matched and has no password, attempt immediate lookup from users
          if (!password && tbl === 'profiles' && rawRow.id) {
            try {
              const { data: uRows } = await supabase.from('users').select('password').eq('id', rawRow.id).limit(1);
              if (uRows?.[0]?.password) password = String(uRows[0].password).trim();
            } catch {}
          }

          const user: User = {
            id: String(rawRow.id || `sup-${tbl}-1`),
            name: rawRow.name || rawRow.full_name || rawRow.display_name || emailPrefix || 'مستخدم',
            username: String(rawRow.username || rawRow.user_name || emailPrefix || 'user').trim().toLowerCase(),
            email: rawEmail,
            password,
            role: normalizeUserRole(rawRow.role, rawRow.is_admin),
            branchName: rawRow.branch_name || rawRow.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
            supervisorId: rawRow.supervisor_id || rawRow.supervisorId,
            phone: rawRow.phone || rawRow.mobile || rawRow.tel || '',
            commissionRate: Number(rawRow.commission_rate || rawRow.commissionRate || 2.5),
            isActive: rawRow.is_active !== undefined ? Boolean(rawRow.is_active) : true,
            approvalStatus: rawRow.approval_status || rawRow.approvalStatus || 'active',
          };
          return { success: true, user };
        }
      } catch {
        // try next table
      }
    }

    // 2. Fallback to cached/directory match ONLY if targeted 1-row lookup missed (e.g., Arabic normalized name or snapshot)
    const remoteRes = await fetchUsersFromSupabase(false, { includeCredentials: true });
    if (remoteRes.success && remoteRes.users && remoteRes.users.length > 0) {
      const found = remoteRes.users.find((u) => {
        const uEmail = sanitizeEmail(u.email || '');
        const uUser = sanitizeIdentifier(u.username || '').toLowerCase();
        const uName = sanitizeIdentifier(u.name || '').toLowerCase();
        const uNameNorm = normalizeArabicText(u.name || '').replace(/\s+/g, '');
        const uPhoneDigits = (u.phone || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()).replace(/\D/g, '').trim();

        if (cleanEmail && (uEmail === cleanEmail || uEmail.startsWith(cleanLower) || (cleanEmail.includes('@') && uEmail === cleanEmail))) return true;
        if (!cleanEmail.includes('@') && uEmail === `${cleanLower}@dream.com`) return true;
        if (cleanLower && (uUser === cleanLower || normalizeArabicText(u.username || '').replace(/\s+/g, '') === normInput)) return true;
        if (cleanLower && (uName === cleanLower || uNameNorm === normInput)) return true;
        if (normInput.length >= 3 && (uNameNorm.includes(normInput) || normInput.includes(uNameNorm))) return true;
        if (asciiDigits.length >= 7 && uPhoneDigits.length >= 7) {
          if (uPhoneDigits === asciiDigits || uPhoneDigits.endsWith(asciiDigits) || asciiDigits.endsWith(uPhoneDigits)) return true;
        }
        if (cleanLower && String(u.id).toLowerCase() === cleanLower) return true;
        return false;
      });

      if (found) {
        return { success: true, user: found };
      }
    }

    return { success: false, error: 'لم يتم العثور على المستخدم في أي جدول بقاعدة البيانات' };
  } catch (err: any) {
    const { message } = handleSupabaseError(err, 'findUserInSupabase');
    return { success: false, error: message };
  }
}

/**
 * Save all users into Supabase central store snapshot and tables safely
 */
export async function saveUsersToSupabase(users: User[]): Promise<{ success: boolean; error?: string }> {
  try {
    invalidateUsersCache();
    if (users.length === 0) return { success: true };

    let firstError = '';
    const securedUsers = await Promise.all(users.map((u) => withHashedCredential(u)));
    const knownIds = new Set(securedUsers.map((u) => u.id));

    const usersPayload = securedUsers.map((u) =>
      sanitizeSupervisorId(
        {
          id: u.id,
          name: u.name,
          username: u.username,
          email: u.email,
          password: u.password || '',
          role: u.role,
          branch_name: u.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
          supervisor_id: u.supervisorId || null,
          phone: u.phone || '',
          commission_rate: u.commissionRate || 2.5,
          is_active: u.isActive ?? true,
          approval_status: u.approvalStatus || 'active',
          created_at: u.registrationDate || new Date().toISOString(),
        },
        knownIds
      )
    );

    // 1) الجدول الأساسي: بدون ON CONFLICT نهائيًا — بنفصل الموجود عن الجديد
    //    ونعمل update / insert مباشر، فمفيش أي 409 مهما كان شكل قيود الجدول.
    const dedupedPayloads = Array.from(
      new Map(usersPayload.map((payload) => [String(payload.id), payload])).values()
    );

    const { data: existingRows } = await supabase.from('users').select('id, username, email');
    const existingIds = new Set((existingRows || []).map((row: any) => String(row.id)));

    // خرائط الهوية: جدول users عليه قيد فريد على اسم المستخدم/الإيميل كمان،
    // فمحاولة إدخال صف جديد بنفس الاسم بمعرّف مختلف بترجع 409 (23505)
    // والصف ما بيتحفظش خالص. بنطابق الهوية الأول ونحدّث الصف الموجود.
    const idByUsername = new Map<string, string>();
    const idByEmail = new Map<string, string>();
    (existingRows || []).forEach((row: any) => {
      const id = String(row.id || '');
      if (!id) return;
      const uname = normalizeUsernameKey(row.username);
      const email = normalizeEmailKey(row.email);
      if (uname) idByUsername.set(uname, id);
      if (email) idByEmail.set(email, id);
    });

    // صفوف بنفس اسم المستخدم/الإيميل جوه نفس الدفعة بتضرب 409 برضه،
    // فبنحتفظ بأول واحد بس (الأخير كان هيغطي على الأول بنفس القيد).
    const seenUsernames = new Set<string>();
    const seenEmails = new Set<string>();
    const uniquePayloads = dedupedPayloads.filter((payload) => {
      const uname = normalizeUsernameKey(payload.username);
      const email = normalizeEmailKey(payload.email);
      if ((uname && seenUsernames.has(uname)) || (email && seenEmails.has(email))) return false;
      if (uname) seenUsernames.add(uname);
      if (email) seenEmails.add(email);
      return true;
    });

    const rowsToUpdate: { targetId: string; payload: Record<string, any> }[] = [];
    const rowsToInsert: Record<string, any>[] = [];
    const adoptedIdentities: string[] = [];

    uniquePayloads.forEach((payload) => {
      const localId = String(payload.id || '');
      if (!localId) return;

      if (existingIds.has(localId)) {
        rowsToUpdate.push({ targetId: localId, payload });
        return;
      }

      const uname = normalizeUsernameKey(payload.username);
      const email = normalizeEmailKey(payload.email);
      const existingIdByIdentity = (uname && idByUsername.get(uname)) || (email && idByEmail.get(email)) || '';

      if (existingIdByIdentity) {
        // نفس المستخدم موجود على السيرفر بمعرّف تاني: بنحدّثه بدل ما نعمل صف مكرر.
        adoptedIdentities.push(`${uname || email} → ${existingIdByIdentity}`);
        rowsToUpdate.push({ targetId: existingIdByIdentity, payload });
        return;
      }

      rowsToInsert.push(payload);
    });

    const blockedUpdates: string[] = [];

    for (let i = 0; i < rowsToUpdate.length; i += 20) {
      const batch = rowsToUpdate.slice(i, i + 20);
      const results = await Promise.allSettled(
        batch.map(async ({ targetId, payload }) => {
          const { id: _ignoredId, ...changes } = pickUserColumns('users', payload);
          if (!targetId || Object.keys(changes).length === 0) return null;
          // .select('id') مقصود: تحديث مقفول بسياسة RLS بيرجع 204 من غير أي error،
          // فبنشوف الصفوف الراجعة عشان نعرف إن الكتابة عدّت فعلاً.
          const res = await supabase.from('users').update(changes).eq('id', targetId).select('id');
          if (res.error) {
            if (!firstError) firstError = res.error.message;
          } else if (!res.data || res.data.length === 0) {
            blockedUpdates.push(targetId);
          }
          return res;
        })
      );
      results.forEach((result) => {
        if (result.status === 'rejected' && !firstError) {
          firstError = String((result as PromiseRejectedResult).reason || 'فشل تحديث المستخدمين');
        }
      });
    }

    for (let i = 0; i < rowsToInsert.length; i += 50) {
      const chunk = rowsToInsert
        .slice(i, i + 50)
        .map((payload) => pickUserColumns('users', payload));

      // upsert صريح على المفتاح الأساسي: لو السجل موجود يتحدّث، ولو جديد يُضاف —.
      const { error } = await supabase.from('users').upsert(chunk, { onConflict: 'id' });
      if (!error) continue;

      // لو الإدخال اتضرب بقيد فريد/خارجي، بنحاول صف صف بمسار آمن.
      for (const row of chunk) {
        const result = await writeUserRowSafely('users', row, 'upsert');
        if (result.error && !firstError) firstError = result.error;
      }
    }

    if (adoptedIdentities.length > 0) {
      console.info(
        '[Supabase][users] تم تحديث صفوف موجودة بنفس اسم المستخدم/الإيميل بدل إدخال صفوف مكررة (منع 409):',
        adoptedIdentities
      );
    }
    if (blockedUpdates.length > 0) {
      console.warn(
        '[Supabase][users] تحديثات رجعت 0 صفوف بدون خطأ — الكتابة على جدول users مقفولة بسياسة RLS:',
        blockedUpdates
      );
    }

    // 2) المرايا القديمة: تحديث الموجود فقط (بدون إدخال → بدون 409)
    await Promise.allSettled([
      syncMirrorRows('app_users', usersPayload),
      syncMirrorRows(
        'profiles',
        usersPayload.map((payload) => ({ ...payload, full_name: payload.name }))
      ),
    ]);

    // 3) Snapshot سحابي لاسترجاع الحسابات لو الجداول ناقصة
    try {
      await supabase.from('orders').upsert({
        id: USER_SYNC_STORE_ID,
        status: 'users_sync_snapshot',
        total: users.length,
        items: users as any,
      });
    } catch (storeErr) {
      console.warn('Users snapshot save note:', storeErr);
    }

    return firstError ? { success: false, error: firstError } : { success: true };
  } catch (e: any) {
    const { message } = handleSupabaseError(e, "saveUsersToSupabase");
    return { success: false, error: message };
  }
}

type UserMirrorTable = import('./userRowPayload').UserTableName;

/** معرفات المستخدمين المعروفة — أساس التحقق من صلاحية المشرف قبل الكتابة. */
function collectKnownUserIds(usersList?: User[]): Set<string> {
  const source = usersList && usersList.length > 0 ? usersList : cachedUsersResponse?.data || [];
  return new Set(source.map((user) => user.id));
}

/**
 * كتابة صف مستخدم بدون أي طلب متوقع فشله:
 * بنسأل الأول هل الصف موجود، وبناءً عليه update أو insert.
 * ولو مفيش صف بنفس الـid، بندور على نفس الهوية (إيميل/اسم مستخدم) بمعرّف
 * تاني ونحدّثها — فالطلب ده بيمنع 409 تمامًا بدل ما يتعالج بعد ما يحصل.
 */
async function writeUserRowSafely(
  table: UserMirrorTable,
  payload: Record<string, any>,
  mode: 'upsert' | 'update-only'
): Promise<{ error: string | null; skipped?: boolean }> {
  const row = pickUserColumns(table, payload);
  if (!row.id) return { error: 'معرّف المستخدم مطلوب' };

  const { data: existingRows, error: readError } = await supabase
    .from(table)
    .select('id')
    .eq('id', row.id)
    .limit(1);

  if (readError) return { error: readError.message };

  const exists = Boolean(existingRows && existingRows.length > 0);
  if (!exists && mode === 'update-only') return { error: null, skipped: true };

  const { id, ...changes } = row;
  if (Object.keys(changes).length === 0) return { error: null, skipped: true };

  // قبل أي INSERT: لو نفس الهوية (إيميل/اسم مستخدم) موجودة بمعرّف تاني،
  // نحدّث الصف الموجود بدل ما نرسل INSERT مضمون يضرب 409 (قيد فريد على
  // username/email) — المتصفح بيسجل الـ409 في الـconsole حتى لو الكود بيعالجه بعدين.
  let targetId = id;
  let rowExists = exists;
  if (!exists && mode === 'upsert') {
    const identityId = await findRowIdByIdentity(table, row);
    if (identityId) {
      targetId = identityId;
      rowExists = true;
    }
  }

  const write = rowExists
    ? await supabase.from(table).update(changes).eq('id', targetId)
    : await supabase.from(table).insert(row);

  if (!write.error) return { error: null };

  // صف اتعمل بين القراءة والكتابة (سباق نادر) → نعيدها كتحديث.
  if (!rowExists && (write.error.code === '23505' || write.error.code === '409')) {
    const retry = await supabase.from(table).update(changes).eq('id', id);
    if (!retry.error) return { error: null };

    // قيد فريد على الإيميل/اسم المستخدم مش على الـid (زي profiles.username)
    // → بنحدّث الصف الموجود بنفس الهوية بدل ما نضرب 409 كل مرة.
    const existingId = await findRowIdByIdentity(table, row);
    if (existingId && existingId !== id) {
      const identityUpdate = await supabase.from(table).update(changes).eq('id', existingId);
      if (!identityUpdate.error) return { error: null };
    }
    return { error: write.error.message };
  }

  return { error: write.error.message };
}

/**
 * تطبيع هوية المستخدم بنفس منطق الفهارس الفريدة في قاعدة البيانات:
 *   username → lower(regexp_replace(trim(username), '\s+', '', 'g'))
 *   email    → lower(trim(email))
 * لو المطابقة مختلفة، الإدخال بيرجع 409 (23505) حتى لو الاسم شكله مختلف بمسافة واحدة.
 */
function normalizeUsernameKey(value?: string | null): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeEmailKey(value?: string | null): string {
  return String(value ?? '').trim().toLowerCase();
}

/** البحث عن صف بنفس الإيميل أو اسم المستخدم (بنفس تطبيع فهارس قاعدة البيانات). */
async function findRowIdByIdentity(
  table: UserMirrorTable,
  row: Record<string, any>
): Promise<string | null> {
  const usernameKey = normalizeUsernameKey(row.username);
  const emailKey = normalizeEmailKey(row.email);

  if (table === 'users' && (usernameKey || emailKey)) {
    // الفهرس الفريد على users.username بيشيل كل المسافات، والـilike مش بيعمل كده
    // فكان بيفوّت التطابق ويبعت INSERT مضمون يضرب 409. بنقارن القيم في الكود.
    const { data } = await supabase.from('users').select('id, username, email');
    const match = (data || []).find((candidate: any) => {
      if (usernameKey && normalizeUsernameKey(candidate.username) === usernameKey) return true;
      if (emailKey && normalizeEmailKey(candidate.email) === emailKey) return true;
      return false;
    });
    if (match?.id) return String(match.id);
  }

  const candidates: Array<[string, string]> = [];
  if (row.email) candidates.push(['email', String(row.email).trim()]);
  if (row.username) candidates.push(['username', String(row.username).trim()]);
  if (table === 'profiles' && row.full_name) {
    candidates.push(['full_name', String(row.full_name).trim()]);
  }

  for (const [column, value] of candidates) {
    const { data } = await supabase
      .from(table)
      .select('id')
      .ilike(column, value.replace(/[%_]/g, (match) => `\\${match}`))
      .limit(1);
    if (data && data.length > 0) return String(data[0].id);
  }
  return null;
}

/**
 * تحديث صفوف النسخ الاحتياطية (app_users / profiles) للمستخدمين الموجودين فقط.
 * الجداول دي مرايا قديمة، و`profiles.id` ممكن يكون مربوط بـ auth.users،
 * فمحاولة إدخال مستخدم جديد فيها بتضرب foreign key (409) من غير أي فايدة.
 */
async function syncMirrorRows(
  table: Exclude<UserMirrorTable, 'users'>,
  payloads: Record<string, any>[]
): Promise<number> {
  if (payloads.length === 0) return 0;
  const { data, error } = await supabase.from(table).select('id');
  if (error || !data) return 0;

  const existingIds = new Set(data.map((row: any) => String(row.id)));
  const targets = payloads.filter((payload) => existingIds.has(String(payload.id)));

  const results = await Promise.allSettled(
    targets.map(async (payload) => {
      const { id, ...changes } = pickUserColumns(table, payload);
      if (!id || Object.keys(changes).length === 0) return;
      await supabase.from(table).update(changes).eq('id', id);
    })
  );

  return results.filter((result) => result.status === 'fulfilled').length;
}

/**
 * Upsert / Save single user into Supabase directly
 */
export async function saveUserToSupabase(user: User, currentUsersList?: User[]): Promise<{ success: boolean; error?: string }> {
  try {
    invalidateUsersCache();
    const securedUser = await withHashedCredential(user);
    const knownIds = collectKnownUserIds(currentUsersList);
    const basePayload = {
      id: securedUser.id,
      name: securedUser.name,
      username: securedUser.username,
      email: securedUser.email,
      password: securedUser.password || '',
      role: securedUser.role,
      branch_name: securedUser.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
      phone: user.phone || '',
      is_active: user.isActive ?? true,
      approval_status: user.approvalStatus || 'active',
      created_at: user.registrationDate || new Date().toISOString(),
    };

    // 1) الجدول الأساسي users — هو مصدر الحقيقة، وفشله هو اللي يهم الـ offline queue.
    const usersPayload = sanitizeSupervisorId(
      {
        ...basePayload,
        supervisor_id: user.supervisorId || null,
        commission_rate: user.commissionRate || 2.5,
      },
      knownIds
    );

    const primary = await writeUserRowSafely('users', usersPayload, 'upsert');

    // 2) المرايا القديمة: تحديث صف موجود فقط، بدون إدخال → مفيش 409 خالص.
    const mirrorWrites: Promise<unknown>[] = [
      syncMirrorRows('app_users', [usersPayload]),
      syncMirrorRows('profiles', [
        {
          ...basePayload,
          full_name: securedUser.name,
        }
      ])
    ];

    if (currentUsersList && currentUsersList.length > 0) {
      const map = new Map<string, User>();
      currentUsersList.forEach((u) => map.set(u.id, u));
      map.set(user.id, user);
      const updatedList = Array.from(map.values());
      mirrorWrites.push(
        Promise.resolve(
          supabase.from('orders').upsert({
            id: USER_SYNC_STORE_ID,
            status: 'users_sync_snapshot',
            total: updatedList.length,
            items: updatedList as any,
          })
        )
      );
    }

    await Promise.allSettled(mirrorWrites);

    return primary.error ? { success: false, error: primary.error } : { success: true };
  } catch (e: any) {
    const { message } = handleSupabaseError(e, "saveUsersToSupabase");
    return { success: false, error: message };
  }
}

/**
 * Delete a user from Supabase tables and snapshot permanently
 */
export async function deleteUserFromSupabase(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    invalidateUsersCache();
    // 1. Delete directly from tables
    try {
      await supabase.from('users').delete().eq('id', userId);
    } catch (e) {
      console.warn('Delete from users table notice:', e);
    }
    try {
      await supabase.from('profiles').delete().eq('id', userId);
    } catch (e) {}
    try {
      await supabase.from('app_users').delete().eq('id', userId);
    } catch (e) {}

    // 2. Update snapshot store so user doesn't reappear on refresh
    try {
      const current = await fetchUsersFromSupabase();
      if (current.success && current.users) {
        const filtered = current.users.filter((u) => u.id !== userId);
        await supabase.from('orders').upsert({
          id: USER_SYNC_STORE_ID,
          status: 'users_sync_snapshot',
          total: filtered.length,
          items: filtered as any,
        });
      }
    } catch (e) {
      console.warn('Snapshot delete notice:', e);
    }

    return { success: true };
  } catch (e: any) {
    const { message } = handleSupabaseError(e, "saveUsersToSupabase");
    return { success: false, error: message };
  }
}

/**
 * Save invoice / order into Supabase with automatic schema tolerance
 */
export async function saveInvoiceToSupabase(invoice: Invoice): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      customer_name: invoice.customerName,
      customer_code: invoice.customerCode || null,
      customer_phone: invoice.customerPhone || '',
      customer_address: invoice.customerAddress || '',
      customer_tax_number: invoice.customerTaxNumber || null,
      rep_id: invoice.repId,
      rep_name: invoice.repName,
      supervisor_name: invoice.supervisorName,
      branch_name: invoice.branchName,
      status: invoice.status,
      payment_method: invoice.paymentMethod,
      total_cartons: invoice.totalCartons,
      total_pieces: invoice.totalPieces,
      subtotal: invoice.subtotal,
      discount_percentage: invoice.discountPercentage,
      discount_amount: invoice.discountAmount,
      estimated_grand_total: invoice.estimatedGrandTotal,
      notes: invoice.notes,
      items: invoice.items,
      synced_to_accounting: invoice.syncedToAccounting,
      has_shortage_split: invoice.hasShortageSplit,
      shortage_invoice_number: invoice.shortageInvoiceNumber || null,
      is_shortage_invoice: invoice.isShortageInvoice || false,
      parent_invoice_id: invoice.parentInvoiceId || null,
      parent_invoice_number: invoice.parentInvoiceNumber || null,
      qr_payload: invoice.qrPayload || null,
      created_at: invoice.date ? `${invoice.date} ${invoice.time || ''}`.trim() : new Date().toISOString(),
    };

    /**
     * مسار الحفظ.
     *
     * الشكل القديم كان 4 محاولات: `invoices` بالـpayload الكامل، وبعدين
     * `invoices` بـpayload مصغّر، وبعدين `invoices` بـأقل أعمدة، وأخيرًا
     * `orders`. المحاولات الـ3 الأولى بتقع دايمًا بـ42501 على السيرفر الحالي
     * لأن جدول invoices عليه RLS مربوط بـauth.uid() والتطبيق شغال بمفتاح
     * publishable — يعني 3 طلبات ضايعة **لكل فاتورة** قبل ما البيانات تكتب
     * فعلاً، وبيتضاعفوا مع كل مزامنة جماعية على 400 جهاز.
     *
     * واليوم مسار الحفظ 3 محاولات مش 4:
     *   1. invoices بالـpayload الكامل (المحاولة الوحيدة على الجدول الغني).
     *   2. orders بالـpayload الكامل — مش المصغّر. الـorders ميت用它 في كل
     *      مشروع، فلازم ياخد كل الأعمدة (QR، النواقص، الفاتورة الأم) عشان
     *      ما نخسرش بيانات لو جدول invoices رجع يوم.
     *   3. orders بأقل أعمدة — للشيمات اللي مالهاش الأعمدة الحديثة دي.
     */
    const { error: invErr } = await supabase.from('invoices').upsert(payload);
    if (!invErr) return { success: true };

    const { error: ordFullErr } = await supabase.from('orders').upsert(payload);
    if (!ordFullErr) return { success: true };

    // 3. orders بأقل الأعمدة (fallback لشيم قديم مالهاش الأعمدة الحديثة).
    const minimalPayload = {
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      customer_name: invoice.customerName,
      customer_phone: invoice.customerPhone || '',
      rep_name: invoice.repName,
      branch_name: invoice.branchName,
      status: invoice.status,
      total_cartons: invoice.totalCartons,
      total_pieces: invoice.totalPieces,
      estimated_grand_total: invoice.estimatedGrandTotal,
      items: typeof invoice.items === 'string' ? invoice.items : JSON.stringify(invoice.items),
      created_at: invoice.date ? `${invoice.date} ${invoice.time || ''}`.trim() : new Date().toISOString(),
    };

    const { error: ordMinErr } = await supabase.from('orders').upsert(minimalPayload);
    if (!ordMinErr) return { success: true };

    console.warn('Supabase Invoice Save Notice:', invErr?.message || ordFullErr?.message || ordMinErr?.message);
    return { success: false, error: invErr?.message || ordFullErr?.message || ordMinErr?.message };
  } catch (e: any) {
    console.warn('Supabase Invoice Save Exception:', e);
    const { message } = handleSupabaseError(e, "saveUsersToSupabase");
    return { success: false, error: message };
  }
}

/**
 * Save multiple invoices into Supabase in optimized batches
 * Reduces API roundtrips by up to 95%, eliminates UI freezing, and strictly protects Supabase Free Tier quotas.
 */
export async function saveInvoicesToSupabase(
  invoices: Invoice[]
): Promise<{ success: boolean; savedCount: number; error?: string }> {
  if (!invoices || invoices.length === 0) return { success: true, savedCount: 0 };
  try {
    let savedCount = 0;
    const CHUNK_SIZE = 30;

    for (let i = 0; i < invoices.length; i += CHUNK_SIZE) {
      const chunk = invoices.slice(i, i + CHUNK_SIZE);
      const payload = chunk.map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoiceNumber,
        customer_id: inv.customerId || null,
        customer_code: inv.customerCode || null,
        customer_name: inv.customerName,
        customer_phone: inv.customerPhone || '',
        customer_address: inv.customerAddress || '',
        customer_tax_number: inv.customerTaxNumber || '',
        rep_id: inv.repId || 'u-rep',
        rep_name: inv.repName,
        supervisor_name: inv.supervisorName || '',
        branch_name: inv.branchName,
        status: inv.status,
        total_cartons: inv.totalCartons,
        total_pieces: inv.totalPieces,
        subtotal: inv.subtotal,
        discount_percentage: inv.discountPercentage,
        discount_amount: inv.discountAmount,
        estimated_grand_total: inv.estimatedGrandTotal,
        payment_method: inv.paymentMethod,
        notes: inv.notes || '',
        synced_to_accounting: inv.syncedToAccounting || false,
        has_shortage_split: inv.hasShortageSplit || false,
        shortage_invoice_number: inv.shortageInvoiceNumber || null,
        is_shortage_invoice: inv.isShortageInvoice || false,
        parent_invoice_id: inv.parentInvoiceId || null,
        parent_invoice_number: inv.parentInvoiceNumber || null,
        qr_payload: inv.qrPayload || null,
        items: inv.items,
        created_at: inv.date ? `${inv.date} ${inv.time || ''}`.trim() : new Date().toISOString(),
      }));

      // invoices الأول بالـpayload الكامل. على السيرفر الحالي ده بيفشل بـ42501
      // (RLS مربوط بـauth.uid() والمفتاح publishable)، بس بنحاوله عادي: لو
      // الجدول رجع يوم، ده بيبقى المسار الغني صح.
      const { error: invErr } = await supabase.from('invoices').upsert(payload, { onConflict: 'id' });
      if (!invErr) {
        savedCount += chunk.length;
      } else {
        // Fallback: نفس الـpayload الكامل على orders مش الحقول المصغّرة.
        // الحقول المصغّرة كانت بتضيّع QR والنواقص والفاتورة الأم لو الجدول
        // الغني ميت — يعني البيانات بتتسجل ناقصة من غير ما حد ياخد باله.
        const { error: ordFullErr } = await supabase.from('orders').upsert(payload, { onConflict: 'id' });
        if (!ordFullErr) {
          savedCount += chunk.length;
          continue;
        }
        // آخر محاولة: أقل الأعمدة، للشيم اللي مالهاش الأعمدة الحديثة.
        const minPayload = chunk.map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoiceNumber,
          customer_name: inv.customerName,
          customer_phone: inv.customerPhone || '',
          rep_name: inv.repName,
          branch_name: inv.branchName,
          status: inv.status,
          total_cartons: inv.totalCartons,
          total_pieces: inv.totalPieces,
          estimated_grand_total: inv.estimatedGrandTotal,
          items: typeof inv.items === 'string' ? inv.items : JSON.stringify(inv.items),
          created_at: inv.date ? `${inv.date} ${inv.time || ''}`.trim() : new Date().toISOString(),
        }));
        const { error: ordErr } = await supabase.from('orders').upsert(minPayload, { onConflict: 'id' });
        if (!ordErr) {
          savedCount += chunk.length;
        } else {
          console.warn('Batch invoice save notice:', invErr.message || ordFullErr.message || ordErr.message);
        }
      }
    }

    return { success: true, savedCount };
  } catch (err: any) {
    console.warn('saveInvoicesToSupabase exception:', err);
    return { success: false, savedCount: 0, error: err?.message };
  }
}

/**
 * Fetch invoices / orders from Supabase (capped to latest 150 by default to save Egress bandwidth)
 *
 * ملاحظة مهمة عن جدول `invoices`: هو مقفول بسبب RLS من ساعه،
 * فبيجيب 0 صفوف مع إن مفيش error (RLS بيرجع 200 بـ 0 صفوف). كل الفواتير
 * الحقيقية متخزنة في جدول `orders` — والكتابة كمان بتروح هناك
 * (saveInvoicesToSupabase). فالجواب هنا هو orders دايماً، والدالة اللي فوق
 * مجرد محاولة أولى ضايعة.
 *
 * تصحيح الجدول بيحتاج المرحلة 2.1 من supabase/add_server_auth_rls.sql بعد
 * ما كل الحسابات تتربط بـ Supabase Auth. قبل كده سيبها ميت أحسن من إنها
 * تفتح وتكشف بيانات.
 */
/**
 * نطاق جلب الفواتير بالدور — كل جهاز بيحمل فواتيره هو
 * بس بدل فواتير كل الفروع (اللي كانت 500 سطر × جدولين
 * في كل إقلاع). المندوب بيحمل فواتيره، المشرف فواتير
 * مناديبه، مدير الفرع فواتير فرعه، والإدارة الكل.
 */
export interface InvoiceFetchScope {
  repIds?: string[];
  limit?: number;
}

export function fetchInvoicesFromSupabase(
  limitOrScope: number | InvoiceFetchScope = 150,
  options?: { updatedSince?: string; stampColumn?: 'updated_at' | 'created_at' }
): Promise<{ success: boolean; invoices?: Invoice[]; error?: string }> {
  return dedupeInFlightRequest(
    `invoices:${JSON.stringify(limitOrScope ?? null)}:${JSON.stringify(options ?? null)}`,
    () => fetchInvoicesFromSupabaseImpl(limitOrScope, options)
  );
}

async function fetchInvoicesFromSupabaseImpl(
  limitOrScope: number | InvoiceFetchScope = 150,
  options?: { updatedSince?: string; stampColumn?: 'updated_at' | 'created_at' }
): Promise<{ success: boolean; invoices?: Invoice[]; error?: string }> {
  try {
    const scope: InvoiceFetchScope =
      typeof limitOrScope === 'number' ? { limit: limitOrScope } : limitOrScope || {};
    const limit = Math.max(1, Math.min(1000, scope.limit ?? 150));
    const repIds = (scope.repIds || [])
      .map((r) => String(r).trim())
      .filter(Boolean);
    const updatedSince = options?.updatedSince?.trim() || '';
    const sinceCol: 'updated_at' | 'created_at' = options?.stampColumn || 'created_at';

    // لو السكوب سدّي طلب فواتير على مجموعة مندوبين فاضية (مثلاً مدير فرع
    // مسجل من غير مناديب في الفريق بعد تحديث دورة المستخدمين) — ما نسترجعش
    // فواتير بدون فلتر (اللي كانت بتجيب آخر limit فواتيرة من كل الشركة).
    if (Array.isArray(scope.repIds) && repIds.length === 0) {
      return { success: true, invoices: [] };
    }

    const INVOICES_SELECT_COLUMNS = [
      'id', 'invoice_number', 'customer_code', 'customer_name', 'customer_phone',
      'customer_address', 'customer_tax_number', 'date', 'time', 'created_at',
      'rep_id', 'rep_name', 'supervisor_name', 'branch_name', 'items',
      'total_cartons', 'total_pieces', 'subtotal', 'discount_percentage',
      'discount_amount', 'estimated_grand_total', 'payment_method', 'status', 'notes',
      'synced_to_accounting', 'has_shortage_split', 'shortage_invoice_number',
      'is_shortage_invoice', 'parent_invoice_id', 'parent_invoice_number', 'qr_payload',
    ].join(',');

    const buildQuery = async (table: 'invoices' | 'orders') => {
      const makeQuery = (selectCols: string, filterCol: 'updated_at' | 'created_at' | null) => {
        let query = supabase
          .from(table)
          .select(selectCols)
          .order('created_at', { ascending: false })
          .limit(limit) as any;
        query = query.not('id', 'like', 'dream_%');
        query = query.neq('id', USER_SYNC_STORE_ID);
        query = query.not('status', 'ilike', 'catalog_sync%');
        if (repIds.length > 0) {
          query = query.in('rep_id', repIds);
        }
        if (updatedSince && filterCol) {
          query = query.gte(filterCol, updatedSince);
        }
        return query;
      };
      let first = await makeQuery(INVOICES_SELECT_COLUMNS, updatedSince ? sinceCol : null);
      if (first?.error && updatedSince && sinceCol === 'updated_at' && isMissingColumnError(first.error)) {
        first = await makeQuery(INVOICES_SELECT_COLUMNS, 'created_at');
      }
      if (first?.error && isMissingColumnError(first.error)) {
        return makeQuery('*', updatedSince ? 'created_at' : null);
      }
      return first;
    };

    // Query 'orders' directly as it is the primary production table for invoices.
    // Falls back to legacy 'invoices' only if orders query fails or is empty,
    // cutting egress and API calls in half.
    let rawInvoices: any[] | null = null;
    const ordResult = await buildQuery('orders');
    if (!ordResult?.error && ordResult?.data && ordResult.data.length > 0) {
      rawInvoices = ordResult.data;
    } else {
      const invResult = await buildQuery('invoices');
      if (!invResult?.error && invResult?.data && invResult.data.length > 0) {
        rawInvoices = invResult.data;
      }
    }

    const invoiceRows = (rawInvoices || []).filter((row: any) => {
      const id = String(row?.id || '');
      const status = String(row?.status || '').toLowerCase();
      return id !== 'dream_catalog_manifest' &&
        !id.startsWith('dream_catalog_chunk_') &&
        !status.startsWith('catalog_sync');
    });

    if (invoiceRows.length > 0) {
      const mapped: Invoice[] = invoiceRows.map((i: any) => ({
        id: i.id || `inv-${Date.now()}`,
        invoiceNumber: i.invoice_number || i.invoiceNumber || 'DRM-INV',
        customerCode: i.customer_code || i.customerCode || undefined,
        customerName: i.customer_name || i.customerName || 'عميل',
        customerPhone: i.customer_phone || i.customerPhone || '',
        customerAddress: i.customer_address || i.customerAddress || '',
        customerTaxNumber: i.customer_tax_number || i.customerTaxNumber || '',
        date: i.date || (i.created_at ? i.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)),
        time: i.time || (i.created_at ? i.created_at.slice(11, 19) : ''),
        repId: i.rep_id || i.repId || 'u-rep',
        repName: i.rep_name || i.repName || 'مندوب المبيعات',
        supervisorName: i.supervisor_name || i.supervisorName || 'مشرف الفرع',
        branchName: i.branch_name || i.branchName || 'الفرع الرئيسي',
        items: Array.isArray(i.items) ? i.items : typeof i.items === 'string' ? JSON.parse(i.items) : [],
        totalCartons: i.total_cartons || i.totalCartons || 0,
        totalPieces: i.total_pieces || i.totalPieces || 0,
        subtotal: i.subtotal || i.estimated_grand_total || 0,
        discountPercentage: i.discount_percentage || 0,
        discountAmount: i.discount_amount || i.discountAmount || 0,
        taxPercentage: 0,
        taxAmount: 0,
        estimatedGrandTotal: i.estimated_grand_total || i.estimatedGrandTotal || 0,
        paymentMethod: i.payment_method || i.paymentMethod || 'نقدي (كاش)',
        status: i.status || 'قيد مراجعة المشرف',
        notes: i.notes || '',
        syncedToAccounting: i.synced_to_accounting || false,
        hasShortageSplit: i.has_shortage_split || false,
        shortageInvoiceNumber: i.shortage_invoice_number,
        isShortageInvoice: i.is_shortage_invoice || false,
        parentInvoiceId: i.parent_invoice_id,
        parentInvoiceNumber: i.parent_invoice_number,
        qrPayload: i.qr_payload,
      }));
      return { success: true, invoices: mapped };
    }

    return { success: true, invoices: [] };
  } catch (err: any) {
    const { message } = handleSupabaseError(err, 'fetchInvoicesFromSupabase');
    return { success: false, error: message };
  }
}

/**
 * بصمة جدول الفواتير — استعلام صف واحد + count، بدل تنزيل آخر 150–500 فاتورة
 * مع كل عودة للتطبيق كل 5 دقائق.
 *
 * الجدول مالوش `updated_at` موثوق، فالبصمة بتعتمد على (عدد الصفوف في النطاق +
 * أحدث created_at). لو الاتنين ماتغيّروش مفيش داعي نعيد تنزيل الفواتير —
 * و Realtime بيفضل مسؤول عن تعديلات الحالة/الموافقات الفورية.
 */
export interface InvoiceContentStamp {
  count: number | null;
  maxCreatedAt: string | null;
  table: 'orders' | 'invoices';
  stampColumn?: 'updated_at' | 'created_at';
}

export interface SalesSummaryKpis {
  sales: number;
  orders: number;
  customers: number;
  cartons: number;
}
export interface SalesSummaryDaily {
  day: string;
  sales: number;
  orders: number;
}
export interface SalesSummaryNamed {
  name: string | null;
  sales: number;
  orders: number;
}
export interface SalesSummaryProduct {
  product_name: string;
  sales: number;
  cartons: number;
}
export interface SalesSummaryMonth {
  month: string;
  sales: number;
  orders: number;
}
export interface SalesSummaryMonthNamed {
  month: string;
  name: string | null;
  sales: number;
  orders: number;
}
export interface SalesSummaryRecent {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  branch_name: string | null;
  rep_name: string | null;
  status: string | null;
  estimated_grand_total: number;
  date: string;
}
export interface SalesSummary {
  generated_at?: string;
  days: number;
  from?: string;
  kpis: SalesSummaryKpis;
  daily: SalesSummaryDaily[];
  by_branch: SalesSummaryNamed[];
  by_rep: SalesSummaryNamed[];
  top_products: SalesSummaryProduct[];
  top_customers: SalesSummaryNamed[];
  recent: SalesSummaryRecent[];
  by_month: SalesSummaryMonth[];
  by_branch_month: SalesSummaryMonthNamed[];
  by_rep_month: SalesSummaryMonthNamed[];
  by_customer_month: SalesSummaryMonthNamed[];
}

export async function fetchSalesSummaryFromSupabase(
  days = 30
): Promise<{ success: boolean; summary?: SalesSummary; error?: string; unavailable?: boolean }> {
  try {
    const { data, error } = await supabase.rpc('get_sales_summary', { p_days: days });
    if (error) {
      const code = String((error as any)?.code || '');
      const msg = String(error.message || '');
      const unavailable =
        code === '42883' || code === '404' || msg.includes('does not exist') || msg.includes('schema cache');
      return { success: false, error: msg, unavailable };
    }
    if (!data || typeof data !== 'object') return { success: false, error: 'استجابة غير متوقعة' };
    return { success: true, summary: data as unknown as SalesSummary };
  } catch (err: any) {
    return { success: false, error: err?.message || 'فشل تجميع المبيعات' };
  }
}

export async function fetchInvoiceContentStamp(
  scope?: InvoiceFetchScope
): Promise<InvoiceContentStamp | null> {
  const repIds = (scope?.repIds || []).map((r) => String(r).trim()).filter(Boolean);
  const probe = async (table: 'orders' | 'invoices', col: 'updated_at' | 'created_at') => {
    let query = supabase
      .from(table)
      .select(col, { count: 'exact' })
      .order(col, { ascending: false, nullsFirst: false })
      .limit(1) as any;
    query = query.not('id', 'like', 'dream_%');
    query = query.neq('id', USER_SYNC_STORE_ID);
    query = query.not('status', 'ilike', 'catalog_sync%');
    if (repIds.length > 0) query = query.in('rep_id', repIds);
    return query;
  };

  try {
    let table: 'orders' | 'invoices' = 'orders';
    let stampColumn: 'updated_at' | 'created_at' = 'updated_at';
    let res = await probe('orders', 'updated_at');
    if (res.error) {
      stampColumn = 'created_at';
      res = await probe('orders', 'created_at');
    }
    if (res.error || !res.data || res.data.length === 0) {
      table = 'invoices';
      stampColumn = 'updated_at';
      res = await probe('invoices', 'updated_at');
      if (res.error) {
        stampColumn = 'created_at';
        res = await probe('invoices', 'created_at');
      }
    }
    if (res.error) return null;
    const maxVal = res.data && res.data.length > 0 ? (res.data[0] as any)?.[stampColumn] ?? null : null;
    return {
      count: typeof res.count === 'number' ? res.count : null,
      maxCreatedAt: maxVal != null ? String(maxVal) : null,
      table,
      stampColumn,
    };
  } catch {
    return null;
  }
}

/**
 * Delete invoice / order from Supabase permanently
 */
export async function deleteInvoiceFromSupabase(
  invoiceId: string,
  invoiceNumber?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const errors: string[] = [];
    let atLeastOneTableSucceeded = false;
    const safeInvoiceId = invoiceId.trim();
    const safeInvoiceNumber = invoiceNumber?.trim();

    if (!safeInvoiceId && !safeInvoiceNumber) {
      return { success: false, error: 'معرّف الفاتورة غير صالح' };
    }

    // Prefer the unique invoice id. Only use the invoice number as a legacy fallback;
    // deleting by both values could remove duplicate invoices with the same number.
    const invoiceResult = safeInvoiceId
      ? await supabase.from('invoices').delete().eq('id', safeInvoiceId)
      : await supabase.from('invoices').delete().eq('invoice_number', safeInvoiceNumber!);
    if (invoiceResult.error) errors.push(invoiceResult.error.message);
    else atLeastOneTableSucceeded = true;

    const orderResult = safeInvoiceId
      ? await supabase.from('orders').delete().eq('id', safeInvoiceId)
      : await supabase.from('orders').delete().eq('invoice_number', safeInvoiceNumber!);
    if (orderResult.error) errors.push(orderResult.error.message);
    else atLeastOneTableSucceeded = true;

    if (!atLeastOneTableSucceeded) {
      return { success: false, error: errors.join(' | ') || 'تعذر حذف الفاتورة من قاعدة البيانات' };
    }
    return { success: true, error: errors.length > 0 ? errors.join(' | ') : undefined };
  } catch (e: any) {
    console.warn('Supabase delete invoice exception:', e);
    const { message } = handleSupabaseError(e, "saveUsersToSupabase");
    return { success: false, error: message };
  }
}

/**
 * الصفوف اللي جدول orders بيستخدمها كـ"سجل نظام" مش كفاتورة.
 *
 * المشروع بيخزّن الكتالوج ونسخة المستخدمين ورقم الإصدار العام جوّه جدول
 * الفواتير نفسه (صف واحد لكل واحد فيهم). أي مسح شامل لازم يتخطّاهم، وإلا
 * أول مسح هيمسح سجل الإصدار العام `dream_app_global_sync_version_v1` والكتالوج
 * كله وكل المستخدمين — وكل الأجهزة التانية مش هتلاقي فايمة أبداً.
 */
export const NON_INVOICE_ORDER_IDS: readonly string[] = [
  GLOBAL_SYNC_VERSION_RECORD_ID,
  USER_SYNC_STORE_ID,
  CATALOG_SYNC_STORE_ID,
];

/** بادئات صفحات الكتالوج في جدول orders (manifest + chunks). */
const CATALOG_ORDER_ID_PATTERN = 'dream_catalog_chunk_%';

const CATALOG_MANIFEST_ORDER_ID = 'dream_catalog_manifest';

export async function deleteAllInvoicesFromSupabase(): Promise<{ success: boolean; error?: string }> {
  try {
    const errors: string[] = [];
    const invoiceResult = await supabase.from('invoices').delete().not('id', 'is', null);
    if (invoiceResult.error) errors.push(invoiceResult.error.message);

    let orderQuery = supabase.from('orders').delete().not('id', 'is', null);
    for (const protectedId of [...NON_INVOICE_ORDER_IDS, CATALOG_MANIFEST_ORDER_ID]) {
      orderQuery = orderQuery.neq('id', protectedId);
    }
    const orderResult = await orderQuery.not('id', 'like', CATALOG_ORDER_ID_PATTERN);
    if (orderResult.error) errors.push(orderResult.error.message);
    return errors.length > 0 ? { success: false, error: errors.join(' | ') } : { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'تعذر مسح الفواتير من قاعدة البيانات' };
  }
}

/**
 * Delete visit from Supabase permanently
 */
export async function deleteVisitFromSupabase(
  visitId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const errors: string[] = [];
    let atLeastOneSucceeded = false;
    const safeVisitId = visitId.trim();

    if (!safeVisitId) {
      return { success: false, error: 'معرّف الزيارة غير صالح' };
    }

    const { error } = await supabase.from('visits').delete().eq('id', safeVisitId);
    if (error) errors.push(error.message);
    else atLeastOneSucceeded = true;

    if (!atLeastOneSucceeded) {
      return { success: false, error: errors.join(' | ') || 'تعذر حذف الزيارة من قاعدة البيانات' };
    }
    return { success: true, error: errors.length > 0 ? errors.join(' | ') : undefined };
  } catch (e: any) {
    console.warn('Supabase delete visit exception:', e);
    const { message } = handleSupabaseError(e, "saveUsersToSupabase");
    return { success: false, error: message };
  }
}

export async function deleteAllVisitsFromSupabase(): Promise<{ success: boolean; error?: string }> {
  try {
    const errors: string[] = [];
    const result = await supabase.from('visits').delete().not('id', 'is', null);
    if (result.error) errors.push(result.error.message);
    return errors.length > 0 ? { success: false, error: errors.join(' | ') } : { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'تعذر مسح الزيارات من قاعدة البيانات' };
  }
}

function stringToUuid(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const part2 = Math.abs((hash * 31) | 0).toString(16).padStart(4, '0').slice(-4);
  const part3 = '4' + Math.abs((hash * 17) | 0).toString(16).padStart(3, '0').slice(-3);
  const part4 = '8' + Math.abs((hash * 13) | 0).toString(16).padStart(3, '0').slice(-3);
  const part5 = Math.abs((hash * 7) | 0).toString(16).padStart(12, '0').slice(-12);
  return `${hex}-${part2}-${part3}-${part4}-${part5}`;
}

const CATALOG_CHUNK_PREFIX = 'dream_catalog_chunk_';
const CATALOG_MANIFEST_ID = 'dream_catalog_manifest';
const CHUNK_SIZE = 400;

/**
 * Save / Upsert full products catalog into Supabase
 * Uses chunked snapshot in shared store for 100% full rich sync (including Fayoum & all branch stocks)
 * + standard products table upsert
 */
export async function saveProductsToSupabase(
  products: Product[],
  options?: { snapshot?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!products || products.length === 0) return { success: true };

    // Index products by their unique ID to preserve all 5500+ rows
    const idMap = new Map<string, Product>();
    products.forEach((product) => {
      idMap.set(product.id, product);
    });
    const uniqueProducts = Array.from(idMap.values());

    // 1. (اختياري) كتالوج الـ snapshot الغني داخل orders — للمستندين القدامى بس.
    //    كان بيتكتب على كل تعديل (‏~3.5MB رفع لكل دفعة) — دلوقتي بيتكتب فقط
    //    مع الاستيراد الكامل/المزامنة اليدوية الكاملة (options.snapshot === true).
    //    القراءة الحديثة بتفضّل جدول products الغني (انظر fetchProductsFromSupabase).
    if (options?.snapshot === true) {
      const totalChunks = Math.ceil(uniqueProducts.length / CHUNK_SIZE);
      try {
        // Save manifest first — mode=products_table_v2 يعني القراء الجدد يفضلوا الجدول.
        await supabase.from('orders').upsert({
          id: CATALOG_MANIFEST_ID,
          status: 'catalog_sync_manifest',
          total: uniqueProducts.length,
          items: {
            totalChunks,
            totalProducts: uniqueProducts.length,
            updatedAt: new Date().toISOString(),
            mode: 'products_table_v2',
          } as any,
        });

        // Save each chunk
        for (let i = 0; i < totalChunks; i++) {
          const chunk = uniqueProducts.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await supabase.from('orders').upsert({
            id: `${CATALOG_CHUNK_PREFIX}${i}`,
            status: 'catalog_sync_chunk',
            total: chunk.length,
            items: chunk as any,
          });
        }
      } catch (storeErr) {
        console.warn('Catalog snapshot chunk store fallback:', storeErr);
      }
    }

    /**
     * بناء الـ payload: غني (كل أعمدة add_products_rich_columns.sql) أو
     * قديم (7 أعمدة) — المحاولة الغنية الأول، ولو أعمدة الجدول ناقصة
     * (الميجريشن لسه ما اتنفذش) نرجع للقديم بدل ما فشل الحفظ كله.
     */
    const buildPayload = (rich: boolean) =>
      uniqueProducts.map((p) => {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id);
        const safeId = isUuid ? p.id : stringToUuid(p.id);
        const cartonQuantity = Math.max(1, Number(p.cartonQuantity || p.factor) || 1);
        const piecePrice = Number(p.piecePrice || p.salesPrice || 0) ||
          (Number(p.cartonPrice || 0) > 0 ? Math.round((Number(p.cartonPrice) / cartonQuantity) * 100) / 100 : 0);
        const branchActual = Number(p.branchStockActual) || 0;
        const base = {
          id: safeId,
          code: p.code?.trim() || null,
          name: p.name,
          category: p.itemGroup || p.department || p.category || 'عام',
          price: piecePrice,
          stock: branchActual,
          image_url: p.imageUrl || null,
        };
        if (!rich) return base;
        return {
          ...base,
          sales_priority: p.salesPriority || 'عادي',
          status: p.status || 'متاح',
          carton_quantity: cartonQuantity,
          size: p.size || null,
          color: p.color || null,
          branch_stock_actual: branchActual,
          branch_stock_reserved:
            typeof p.branchStockReserved === 'number' ? p.branchStockReserved : branchActual,
          main_warehouse_actual: Number(p.mainWarehouseActual) || 0,
          main_warehouse_reserved:
            typeof p.mainWarehouseReserved === 'number' ? p.mainWarehouseReserved : Number(p.mainWarehouseActual) || 0,
          item_group: p.itemGroup || p.department || 'عام',
          department: p.department || 'عام',
          family_name: p.familyName || 'أصناف عامة',
          classification: p.classification || 'أصناف عامة',
          piece_price: piecePrice,
          carton_price:
            Number(p.cartonPrice) || Math.round(piecePrice * cartonQuantity * 100) / 100,
          cloudinary_public_id: p.cloudinaryPublicId || null,
          barcode: p.barcode || null,
          unified_code: p.unifiedCode || null,
          branch_stocks: p.branchStocks ?? {},
          sector: p.sector ?? null,
          branch_name: p.branchName || null,
        };
      });

    // The products table treats a normalized code as unique, even when imported
    // rows have different IDs. Keep only the last row for each code in this save.
    const dedupePayload = <T extends { id: string; code: string | null }>(payload: T[]): T[] => {
      const productsByKey = new Map<string, T>();
      payload.forEach((product) => {
        const key = product.code
          ? `code:${product.code.toLowerCase()}`
          : `id:${product.id}`;
        productsByKey.set(key, product);
      });
      return Array.from(productsByKey.values());
    };

    let saveError: string | undefined;
    let usedRichPayload = false;

    const saveChunks = async (
      rows: { id: string; code: string | null }[],
      onConflict: 'code' | 'id'
    ) => {
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { error } = await supabase.from('products').upsert(chunk as any, { onConflict });
        if (error) {
          console.warn('Direct products chunk save notice:', error.message);
          saveError ??= error.message;
          return false;
        }
      }
      return true;
    };

    const isMissingColumn = (msg: string) =>
      /does not exist|could not find the|schema cache/i.test(msg);

    // محاولة غنية أولًا — وبعد فشل "عمود مش موجود" نرجع للـ payload القديم.
    const richRows = dedupePayload(buildPayload(true));
    const richWithCode = richRows.filter((product) => product.code);
    const richWithoutCode = richRows.filter((product) => !product.code);
    const richOk =
      (await saveChunks(richWithCode, 'code')) &&
      (await saveChunks(richWithoutCode, 'id')) &&
      !saveError;

    if (!richOk && saveError && isMissingColumn(saveError)) {
      saveError = undefined;
      const minimalRows = dedupePayload(buildPayload(false));
      const minimalWithCode = minimalRows.filter((product) => product.code);
      const minimalWithoutCode = minimalRows.filter((product) => !product.code);
      await saveChunks(minimalWithCode, 'code');
      await saveChunks(minimalWithoutCode, 'id');
    } else if (richOk) {
      usedRichPayload = true;
    }

    if (saveError) return { success: false, error: saveError };

    // كتالوج snapshot قديم مش متحدث + الجدول الرسمي اتحدث غني → القراء القدامى
    // بيشوفوا بيانات قديمة لحد ما الجهاز ده يتحدث — مقبول (تحديث موحد للفريق)
    // ومن غير الدي كان كل تعديل بيدفع 3.5MB رفع.
    if (usedRichPayload) {
      console.info(
        `Supabase rich products save: ${richRows.length} rows (no snapshot rewrite).`
      );
    }

    return { success: true };
  } catch (e: any) {
    console.error('Supabase products save error:', e);
    const { message } = handleSupabaseError(e, "saveUsersToSupabase");
    return { success: false, error: message };
  }
}

/**
 * حذف صنف من جدول products على السيرفر — ضروري بعد ما بقى الجدول هو المصدر،
 * لأن الـ upsert لوحده كان بيسيب الصف المحذوف محذوف محليًا وحي على السيرفر.
 */
export async function deleteProductFromSupabase(
  productId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!productId) return { success: false, error: 'معرف الصنف مفقود' };
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    const safeId = isUuid ? productId : stringToUuid(productId);
    const { error } = await supabase.from('products').delete().eq('id', safeId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e: any) {
    console.error('Supabase product delete error:', e);
    return { success: false, error: e?.message };
  }
}

/**
 * هل جدول المنتجات الرسمي الغني هو المصدر المتفق عليه؟
 * بقرأ صف الماني فست بس (صف واحد صغير) — بيستخدم عشان نقرر نستخدم
 * السحب التدريجي (fetchProductsIncremental) ولا لا. قبل أول استيراد
 * كامل بعد الميجريشن، الجدول لسه مش مكتمل فبنرجع لمسار الـ chunks.
 */
export async function isProductsTableAuthoritative(): Promise<boolean> {
  try {
    const { data: manifestRows } = await supabase
      .from('orders')
      .select('items')
      .eq('id', CATALOG_MANIFEST_ID)
      .limit(1);
    const rawManifest = (manifestRows && manifestRows[0]?.items) as any;
    return typeof rawManifest?.mode === 'string' && rawManifest.mode === 'products_table_v2';
  } catch {
    return false;
  }
}

/**
 * Fetch products catalog from Supabase
 * Safely fetches all products without being capped at Supabase's default 1,000 row limit
 */
/**
 * نطاق قطاع الكتالوج على مستوى السيرفر.
 *
 * جدول products فيه عمود sector («home» منزلي / «electrical» كهربا) وبيتعبّى
 * من سكربت backfill_products_sector.mjs من قيم كتالوج الـ chunks المصدرية.
 * قبل كده الفلترة كانت بتتم في الواجهة بعد نزّول الكتالوج كامل — دلوقتي
 * القيد بيتنقل لاستعلام PostgREST نفسه فالجهاز بينزّل قطاعه بس.
 */
export type ProductSectorScope = 'home' | 'electrical' | undefined;

/**
 * يطبّق قيد القطاع على استعلام products.
 *
 * الصفوف اللي الـ sector فيها فاضي/مجهول بنسيبها تعدي للجميع احتياط —
 * حجب صنف المندوب محتاجه أخطر من تنزيل صف زيادة (نفس مبدأ `matchesSector`
 * في الواجهة: القيمة الفاضية شفافة للكل).
 */
export function applyProductSectorScope(query: any, sector: ProductSectorScope): any {
  if (!sector) return query;
  // القيم المسموحة: قطاع الجهاز + «both» (القطاعين) + «all» + الفاضي (مجهول).
  return query.or(`sector.in.(${sector},both,all),sector.is.null`);
}

/** فلترة القطاع على الـ client — للمسارات اللي بترجّع JSON جاهز (chunks) مش استعلام صفوف. */
export function filterProductsBySectorClient(products: Product[], sector: ProductSectorScope): Product[] {
  if (!sector) return products;
  return products.filter((p) => {
    const s = (p as any)?.sector;
    return !s || s === sector || s === 'both' || s === 'all';
  });
}

/** نفس قاعدة القطاع لكن على الصفوف الخام (snake_case) قبل الـ mapping. */
function sectorRowOk(sector: NonNullable<ProductSectorScope>) {
  return (row: any) => {
    const s = row?.sector;
    return !s || s === sector || s === 'both' || s === 'all';
  };
}

export function fetchProductsFromSupabase(
  options?: { sector?: ProductSectorScope }
): Promise<{ success: boolean; products?: Product[]; error?: string }> {
  const sector = options?.sector;
  return dedupeInFlightRequest(`products:${sector ?? 'all'}`, () => fetchProductsFromSupabaseImpl(sector));
}

async function fetchProductsFromSupabaseImpl(
  sector?: ProductSectorScope
): Promise<{ success: boolean; products?: Product[]; error?: string }> {
  try {
    // 0. بصمة الماني فست — بتحدد المصدر المتفق عليه. items.mode='products_table_v2'
    //    يعني الجدول الرسمي الغني هو المصدر (بيتكتب مع أول استيراد/مزامنة كاملة
    //    بعد ميجريشن supabase/add_products_rich_columns.sql).
    const { data: manifestRows } = await supabase
      .from('orders')
      .select('items')
      .eq('id', CATALOG_MANIFEST_ID)
      .limit(1);
    const rawManifest = (manifestRows && manifestRows[0]?.items) as any;
    const snapshotMode = typeof rawManifest?.mode === 'string' ? rawManifest.mode : null;
    const totalChunks = typeof rawManifest?.totalChunks === 'number' ? rawManifest.totalChunks : 0;

    // 1. الجدول الرسمي الغني: ~416KB بدل ~3.5MB من صفوف catalog_sync_chunk.
    if (snapshotMode === 'products_table_v2') {
      const rich = await readRichProductsTable(sector);
      if (rich.ok) return { success: true, products: rich.products };
      // أعمدة ناقصة (الميجريشن ما اتنفذش) أو جدول فاضي → نكمل بالمسار القديم كشبكة أمان.
    }

    // 2. Fallback: chunked rich catalog snapshot (المسار القديم)
    if (totalChunks > 0) {
        const chunkPromises: Promise<any>[] = [];
        for (let i = 0; i < totalChunks; i++) {
          chunkPromises.push(
            Promise.resolve(
              supabase.from('orders').select('items').eq('id', `${CATALOG_CHUNK_PREFIX}${i}`).limit(1)
            )
          );
        }
        const chunkResults = await Promise.allSettled(chunkPromises);
        const allItems: Product[] = [];
        chunkResults.forEach((res) => {
          if (res.status === 'fulfilled' && res.value?.data && res.value.data.length > 0) {
            const raw = res.value.data[0].items;
            const list: Product[] = Array.isArray(raw)
              ? raw
              : typeof raw === 'string'
              ? JSON.parse(raw)
              : [];
            allItems.push(...list);
          }
        });
        if (allItems.length > 0) {
          return { success: true, products: filterProductsBySectorClient(allItems, sector) };
        }
    }

    // 2. Fallback: Check if single catalog snapshot exists
    const { data: snapshotData, error: snapErr } = await supabase
      .from('orders')
      .select('items')
      .eq('id', CATALOG_SYNC_STORE_ID)
      .limit(1);

    if (!snapErr && snapshotData && snapshotData.length > 0 && snapshotData[0].items) {
      const rawItems = snapshotData[0].items;
      const itemsList: Product[] = Array.isArray(rawItems)
        ? rawItems
        : typeof rawItems === 'string'
        ? JSON.parse(rawItems)
        : [];
      if (itemsList.length > 0) {
        return { success: true, products: filterProductsBySectorClient(itemsList, sector) };
      }
    }

    // 3. Fallback: Paginated select from standard products table (overcomes default 1,000 row cap)
    const pageSize = 1000;
    let page = 0;
    const allProdData: any[] = [];
    let selectCols = PRODUCTS_SELECT_COLUMNS.replace(',updated_at', '');

    while (true) {
      let { data: chunk, error: pErr } = await supabase
        .from('products')
        .select(selectCols)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (pErr && selectCols !== '*' && isMissingColumnError(pErr)) {
        selectCols = '*';
        ({ data: chunk, error: pErr } = await supabase
          .from('products')
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1));
      }

      if (pErr || !chunk || chunk.length === 0) break;
      // قيد القطاع على الصفوف الخام (عمود sector) قبل الـ mapping — عشان
      // pipeline الـ mapping في الآخر ما يتكررش مرتين.
      allProdData.push(...(sector ? chunk.filter(sectorRowOk(sector)) : chunk));
      if (chunk.length < pageSize) break;
      page++;
      // The old `if (page >= 35) break` cut the catalog off at 35,000 rows with
      // no error and no warning — prices would silently vanish from the screen.
      // 35,000 products is far past anything this catalog can reach (5,444 SKUs
      // today), so the guard only ever mattered as a runaway-loop brake. It now
      // warns loudly instead of truncating quietly.
      if (page >= MAX_PRODUCT_PAGES) {
        console.warn(
          `Product fetch stopped at ${allProdData.length} rows after ${page} pages. ` +
          'The catalog is larger than expected; some products may be missing.'
        );
        break;
      }
    }

    if (allProdData.length > 0) {
      return { success: true, products: allProdData.map(mapProductTableRow) };
    }

    return { success: true, products: [] };
  } catch (err: any) {
    const { message } = handleSupabaseError(err, 'fetchProductsFromSupabase');
    return { success: false, error: message };
  }
}

/** تحويل صف جدول products إلى كائن Product الغني (مشترك بين القراءة الغنية والقديمة). */
function mapProductTableRow(p: any): Product {
  const cartonQuantity = Math.max(1, Number(p.carton_quantity ?? p.cartonQuantity ?? p.factor) || 1);
  const rawPiecePrice = Number(p.piece_price ?? p.sales_price ?? p.salesPrice ?? p.piecePrice ?? p.price ?? 0);
  let cartonPrice = Math.round(rawPiecePrice * cartonQuantity * 100) / 100;
  let piecePrice = rawPiecePrice;

  if (piecePrice === 0 && Number(p.carton_price ?? p.cartonPrice ?? 0) > 0) {
    cartonPrice = Number(p.carton_price ?? p.cartonPrice);
    piecePrice = Math.round((cartonPrice / cartonQuantity) * 100) / 100;
  }

  return {
    id: p.id,
    code: p.code || p.name?.slice(0, 8) || 'PRD',
    name: p.name || 'صنف دريم',
    salesPriority: p.sales_priority || p.salesPriority || 'عادي',
    status: p.status || 'متاح',
    cartonQuantity,
    factor: cartonQuantity,
    size: p.size || '',
    color: p.color || '',
    branchStockActual: Number(p.stock ?? p.branch_stock_actual ?? 50),
    branchStockReserved: Number(p.branch_stock_reserved ?? p.stock ?? p.branch_stock_actual ?? 50),
    mainWarehouseActual: Number(p.main_warehouse_actual ?? 500),
    mainWarehouseReserved: Number(p.main_warehouse_reserved ?? p.main_warehouse_actual ?? 500),
    department: p.item_group || p.itemGroup || p.category || p.department || 'عام',
    category: p.item_group || p.itemGroup || p.category || 'عام',
    itemGroup: p.item_group || p.itemGroup || p.category || p.department || 'عام',
    familyName: p.family_name || p.familyName || p.classification || 'أصناف عامة',
    classification: p.classification || 'أصناف عامة',
    piecePrice,
    cartonPrice,
    branchName: p.branch_name || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
    imageUrl: p.image_url || undefined,
    cloudinaryPublicId: p.cloudinary_public_id || undefined,
    barcode: p.barcode || undefined,
    unifiedCode: p.unified_code || p.unifiedCode || undefined,
    branchStocks: p.branch_stocks || p.branchStocks || undefined,
    sector: p.sector || (
      `${p.item_group || ''} ${p.category || ''} ${p.department || ''} ${p.family_name || ''} ${p.name || ''}`.includes('كهرب')
        ? 'electrical'
        : 'home'
    ),
  };
}

/** قراءة جدول products الغني (بعد ميجريشن add_products_rich_columns.sql) على دفعات. */
async function readRichProductsTable(sector?: ProductSectorScope): Promise<{ ok: boolean; products: Product[] }> {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
    let query = supabase
      .from('products')
      .select(PRODUCTS_SELECT_COLUMNS)
      .order('id', { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    query = applyProductSectorScope(query, sector);
    const { data, error } = await query;
    if (error) return { ok: false, products: [] };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return { ok: rows.length > 0, products: rows.map(mapProductTableRow) };
}

/**
 * Fetch all visits from Supabase (visits table)
 *
 * بتتقري على دفعات. الاستعلام القديم كان `select('*')` من غير حد، وPostgREST
 * بيرجّع 1,000 صف بحد أقصى وبس — يعني على السيرفر الحالي (3,774 زيارة) التطبيق
 * كان شايف 1,000 منهم **من غير أي رسالة خطأ**. الـ 2,774 الباقيين كان بيختفيوا
 * من صفحة الزيارات ومن تقرير المرتجعات ومن التحليلات من غير ما حد ياخد باله.
 *
 * نفس باترن `fetchAllRows` بتاع العملاء: `.range()` بالدفعات لحد ما الجدول يخلص.
 */
export function fetchVisitsFromSupabase(
  scope?: VisitFetchScope,
  options?: { updatedSince?: string }
): Promise<{ success: boolean; visits?: CustomerVisit[]; error?: string; scoped?: boolean }> {
  return dedupeInFlightRequest(
    `visits:${JSON.stringify(scope ?? null)}:${options?.updatedSince ?? ''}`,
    () => fetchVisitsFromSupabaseImpl(scope, options)
  );
}

async function fetchVisitsFromSupabaseImpl(
  scope?: VisitFetchScope,
  options?: { updatedSince?: string }
): Promise<{ success: boolean; visits?: CustomerVisit[]; error?: string; scoped?: boolean }> {
  try {
    const pageSize = 1000;
    const sinceDate = scope?.sinceDate?.trim() || '';
    const updatedSince = options?.updatedSince?.trim() || '';

    /**
     * بتقرأ جدول الزيارات بالدفعات وتطبّق الـscope على السيرفر.
     *
     * الـscope بيرجع صفر صف على النطاق الضيق (أسماء الفروع نص عربي حر)،
     * فالسلوك هنا زي العملاء بالظبط: نرجع للقراءة الكاملة بدل ما نرجع
     * صفحة زيارات فاضية على موبايل المندوب.
     */
    const VISITS_SELECT_COLUMNS = [
      'id', 'customer_id', 'customer_name', 'customer_code', 'date', 'time',
      'rep_id', 'rep_name', 'branch_name', 'supervisor_id', 'supervisor_name',
      'status', 'type', 'outcome', 'collected_amount', 'notes', 'location',
      'latitude', 'longitude', 'check_in_time', 'check_out_time', 'duration_minutes',
      'store_stock_status', 'competitor_notes', 'customer_rating', 'next_visit_date',
      'order_created_id', 'order_amount', 'is_return', 'return_value', 'return_reason',
      'return_status', 'return_handled_by', 'return_handled_at', 'return_note',
      'created_by', 'created_at', 'updated_at', 'review_status',
      'reviewed_by_name', 'review_note', 'reviewed_at',
    ].join(',');

    const readPages = async (useScope: boolean) => {
      const rows: any[] = [];
      let selectCols = VISITS_SELECT_COLUMNS;
      for (let page = 0; page < MAX_VISIT_PAGES; page++) {
        const from = page * pageSize;
        const makeQuery = (cols: string) => {
          let query = supabase
            .from('visits')
            .select(cols)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true });
          if (useScope) {
            query = applyScopeToQuery(query, scope);
          }
          if (useScope && sinceDate) {
            query = query.gte('date', sinceDate);
          }
          if (updatedSince) {
            query = query.gte('updated_at', updatedSince);
          }
          return query;
        };

        let { data, error } = await makeQuery(selectCols).range(from, from + pageSize - 1);
        if (error && selectCols !== '*' && isMissingColumnError(error)) {
          selectCols = '*';
          ({ data, error } = await makeQuery('*').range(from, from + pageSize - 1));
        }

        if (error) return { data: rows, error };
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
        if (page === MAX_VISIT_PAGES - 1) {
          console.warn(
            `Stopgap: visits read hit the ${MAX_VISIT_PAGES}-page cap (${MAX_VISIT_PAGES * pageSize} rows). ` +
              'Older rows were not loaded — check the data, not the code.'
          );
        }
      }
      return { data: rows, error: null as any };
    };

    let scopedUsed = hasScopeFilters(scope) || Boolean(sinceDate);
    let { data: rows, error } = await readPages(scopedUsed);
    if (!error && !updatedSince && scopedUsed && rows.length === 0 && !scope?.strictNoFullFallback) {
      console.warn('Scoped visits fetch matched no rows; falling back to the full table.');
      scopedUsed = false;
      const fallback = await readPages(false);
      if (!fallback.error) {
        rows = fallback.data;
        error = null;
      }
    }
    if (error) return { success: false, error: error.message };

    if (rows.length === 0) return { success: true, visits: [], scoped: scopedUsed };

    const mapped: CustomerVisit[] = rows.map((v: any) => {
      const { cleanNotes, parsedCoords, geoVerification: parsedGeo } = extractVisitGeoFromNotes(v.notes);
      const locObj =
        v.location ||
        (v.latitude && v.longitude
          ? {
              latitude: Number(v.latitude),
              longitude: Number(v.longitude),
              accuracy: v.location_accuracy !== undefined ? Number(v.location_accuracy) : undefined,
              mapUrl: `https://maps.google.com/?q=${v.latitude},${v.longitude}`,
            }
          : parsedCoords
          ? {
              latitude: parsedCoords.latitude,
              longitude: parsedCoords.longitude,
              accuracy: parsedGeo?.accuracyMeters,
              mapUrl: `https://maps.google.com/?q=${parsedCoords.latitude},${parsedCoords.longitude}`,
            }
          : undefined);
      const resolvedGeo = v.geo_status
        ? {
            status: v.geo_status,
            distanceMeters: v.geo_distance_meters !== undefined ? Number(v.geo_distance_meters) : parsedGeo?.distanceMeters,
            accuracyMeters: v.location_accuracy !== undefined ? Number(v.location_accuracy) : parsedGeo?.accuracyMeters,
            flags: Array.isArray(v.geo_flags) ? v.geo_flags : parsedGeo?.flags,
            proofPhotoUrl: v.geo_proof_photo || parsedGeo?.proofPhotoUrl,
            verifiedAt: parsedGeo?.verifiedAt,
          }
        : parsedGeo;

      return {
        id: v.id || `visit-${v.created_at}-${v.customer_id}`,
        customerId: v.customer_id || v.customerId || '',
        customerName: v.customer_name || v.customerName || '',
        customerCode: v.customer_code || v.customerCode || '',
        date: v.date || '',
        time: v.time || '',
        repId: v.rep_id || v.repId || '',
        repName: v.rep_name || v.repName || 'المندوب',
        branchName: v.branch_name || v.branchName || '',
        supervisorId: v.supervisor_id || v.supervisorId || '',
        supervisorName: v.supervisor_name || v.supervisorName || '',
        status: v.status || 'مجدولة',
        type: v.type || 'زيارة دورية',
        outcome: v.outcome || '',
        collectedAmount: Number(v.collected_amount ?? v.collectedAmount ?? 0),
        notes: cleanNotes,
        location: locObj,
        geoVerification: resolvedGeo,
        checkInTime: v.check_in_time || v.checkInTime,
        checkOutTime: v.check_out_time || v.checkOutTime,
        durationMinutes: v.duration_minutes || v.durationMinutes,
        storeStockStatus: v.store_stock_status || v.storeStockStatus,
        competitorNotes: v.competitor_notes || v.competitorNotes,
        customerRating: v.customer_rating || v.customerRating,
        nextVisitDate: v.next_visit_date || v.nextVisitDate,
        orderCreatedId: v.order_created_id || v.orderCreatedId,
        orderAmount: v.order_amount || v.orderAmount,
        isReturn: v.is_return !== undefined ? Boolean(v.is_return) : (v.isReturn !== undefined ? Boolean(v.isReturn) : false),
        returnValue: v.return_value !== undefined && v.return_value !== null ? Number(v.return_value) : (v.returnValue !== undefined ? Number(v.returnValue) : undefined),
        returnReason: v.return_reason || v.returnReason || undefined,

        returnStatus: v.return_status || v.returnStatus || undefined,
        returnHandledBy: v.return_handled_by || v.returnHandledBy || undefined,
        returnHandledAt: v.return_handled_at || v.returnHandledAt || undefined,
        returnNote: v.return_note || v.returnNote || undefined,
        syncStatus: 'synced',
        createdBy: v.created_by || v.createdBy || '',
        createdAt: v.created_at || v.createdAt || new Date().toISOString(),
        updatedAt: v.updated_at || v.updatedAt,
        reviewStatus: v.review_status || v.reviewStatus || undefined,
        reviewedByName: v.reviewed_by_name || v.reviewedByName || undefined,
        reviewNote: v.review_note || v.reviewNote || undefined,
        reviewedAt: v.reviewed_at || v.reviewedAt || undefined,
      };
    });

    return { success: true, visits: mapped, scoped: scopedUsed };
  } catch (err: any) {
    const { message } = handleSupabaseError(err, 'fetchVisitsFromSupabase');
    return { success: false, error: message };
  }
}

/**
 * Save/Upsert visits into Supabase
 *
 * بيتكتب على دفعات 100 — نفس باترن العملاء (سطر 440) والفواتير (سطر 1079).
 * كان الـ upsert بيتبعت المصفوفة كلها في طلب واحد، ومع 4,000+ زيارة كل صف
 * فيها ملاحظات وGPS ومراجعات، ده بيوصل لحدود حجم جسم الطلب في PostgREST
 * ويفشل الحفظ كله.
 */
export async function saveVisitsToSupabase(visits: CustomerVisit[]): Promise<{ success: boolean; savedCount: number; error?: string }> {
  try {
    if (!visits || visits.length === 0) return { success: true, savedCount: 0 };

    const payload = visits.map((v) => {
      let enhancedNotes = (v.notes || '').replace(/\n?\[GEO_VERIFY:[^\]]+\]/g, '').trim();
      if (v.location?.latitude && !enhancedNotes.includes('[موقع GPS:')) {
        enhancedNotes += `\n[موقع GPS: ${v.location.latitude.toFixed(6)}, ${v.location.longitude.toFixed(6)}]`;
      }
      if (v.checkInTime && !enhancedNotes.includes('[حضور:')) {
        enhancedNotes += `\n[حضور: ${v.checkInTime}${v.checkOutTime ? ` - انصراف: ${v.checkOutTime}` : ''}${v.durationMinutes ? ` (${v.durationMinutes} دقيقة)` : ''}]`;
      }
      if (v.storeStockStatus && !enhancedNotes.includes('[حالة المخزون بالمتجر:')) {
        enhancedNotes += `\n[حالة المخزون بالمتجر: ${v.storeStockStatus}]`;
      }
      if (v.competitorNotes && !enhancedNotes.includes('[بضاعة وأسعار المنافسين:')) {
        enhancedNotes += `\n[بضاعة وأسعار المنافسين: ${v.competitorNotes}]`;
      }
      if (v.customerRating && !enhancedNotes.includes('[تقييم تجاوب العميل:')) {
        enhancedNotes += `\n[تقييم تجاوب العميل: ${v.customerRating}/5 ⭐]`;
      }
      if (v.nextVisitDate && !enhancedNotes.includes('[الزيارة القادمة المتفق عليها:')) {
        enhancedNotes += `\n[الزيارة القادمة المتفق عليها: ${v.nextVisitDate}]`;
      }
      const geoTag = encodeVisitGeoVerificationTag(v);
      if (geoTag) {
        enhancedNotes += `\n${geoTag}`;
      }

      return {
        id: v.id || `visit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        customer_id: v.customerId || '',
        customer_name: v.customerName || '',
        customer_code: v.customerCode || '',
        date: v.date || '',
        time: v.time || '',
        rep_id: v.repId || '',
        rep_name: v.repName || '',
        branch_name: v.branchName || '',
        supervisor_id: v.supervisorId || '',
        supervisor_name: v.supervisorName || '',
        status: v.status || 'مجدولة',
        type: v.type || 'زيارة دورية',
        outcome: v.outcome || '',
        collected_amount: v.collectedAmount ?? 0,
        notes: enhancedNotes.trim(),
        // Returns (مرتجع) — kept as real columns, not folded into notes, so the
        // supervisor can alert on them and record the handover to the warehouse.
        is_return: Boolean(v.isReturn),
        return_value: v.returnValue ?? null,
        return_reason: v.returnReason || null,

        return_status: v.isReturn ? (v.returnStatus || 'بانتظار المشرف') : null,
        return_handled_by: v.returnHandledBy || null,
        return_handled_at: v.returnHandledAt || null,
        return_note: v.returnNote || null,
        review_status: v.reviewStatus || null,
        reviewed_by_name: v.reviewedByName || null,
        review_note: v.reviewNote || null,
        reviewed_at: v.reviewedAt || null,
        created_by: v.createdBy || '',
        created_at: v.createdAt || new Date().toISOString(),
        updated_at: v.updatedAt || new Date().toISOString(),
      };
    });

    const dedupedPayload = Array.from(new Map(payload.map((v) => [v.id, v])).values());
    const CHUNK_SIZE = 100;
    let savedCount = 0;

    for (let i = 0; i < dedupedPayload.length; i += CHUNK_SIZE) {
      const chunk = dedupedPayload.slice(i, i + CHUNK_SIZE);
      // .select() متشال عن قصد: الـ data راجع مش بيستخدم، وطلبه بيرجّع
      // الصفوف كلها تاني — وحدّ PostgREST في الاستجابة 1,000 صف، فكان
      // ممكن يفشل الدفعات الكبيرة من غير سبب واضح.
      const { error } = await supabase.from('visits').upsert(chunk, { onConflict: 'id' });
      if (error) {
        if (/review_status|reviewed_by_name|review_note|reviewed_at/i.test(error.message)) {
          console.warn('Supabase visit review columns are missing:', error.message);
          return { success: false, savedCount, error: 'شغّل migration مراجعة الزيارات على Supabase أولاً' };
        }
        // The return columns require add_visit_return_columns.sql. Retry without
        // them so a missing migration never blocks saving a visit.
        if (/column .*(is_return|return_value|return_reason|return_difficulty|return_status|return_handled_by|return_handled_at|return_note)|schema cache/i.test(error.message)) {
          const legacyPayload = chunk.map((row: any) => {
            const {
              is_return, return_value, return_reason, return_difficulty,
              return_status, return_handled_by, return_handled_at, return_note,
              ...rest
            } = row;
            // Keep the return visible in the notes as a degraded fallback.
            return {
              ...rest,
              notes: row.is_return
                ? `${rest.notes}\n[مرتجع بقيمة ${row.return_value ?? 0} - ${row.return_reason || ''} - ${row.return_status || 'بانتظار المشرف'}]`.trim()
                : rest.notes,
            };
          });
          const { error: retryErr } = await supabase.from('visits').upsert(legacyPayload, { onConflict: 'id' });
          if (retryErr) {
            console.warn('Supabase upsert visits retry note:', retryErr.message);
            return { success: false, savedCount, error: retryErr.message };
          }
          savedCount += chunk.length;
          continue;
        }
        console.warn('Supabase upsert visits note:', error.message);
        return { success: false, savedCount, error: error.message };
      }
      savedCount += chunk.length;
    }

    return { success: true, savedCount };
  } catch (err: any) {
    return { success: false, savedCount: 0, error: err?.message };
  }
}

/* ============================================================
   توقع التحصيلات — مزامنة مشتركة لكل الأدوار
   ----------------------------------------------------------------
   لازم الجداول دي تكون موجودة في Supabase. الـ SQL في أول تعليق.
   لو الجدول مش موجود، الكود بيرجع بـ success:false والبنية
   بتفضل شغالة من localStorage — يعني مفيش lost data.
   ============================================================ */

/*
-- week_index: 1..MAX_WEEKS_PER_MONTH = فترة حقيقية من تقسيم الشهر (مش لازم 4)
--              0                   = التوقع الشهري المستقل
CREATE TABLE collection_forecasts (
  id text PRIMARY KEY,
  month_key text NOT NULL,
  week_index int NOT NULL,
  rep_id text, rep_name text, branch_name text,
  customer_id text, customer_code text, customer_name text,
  collection_forecast numeric DEFAULT 0,
  sales_forecast numeric DEFAULT 0,
  status text DEFAULT 'draft',
  submitted_at text, approved_by text, approved_at text,
  change_request_note text, change_requested_by text, change_requested_at text,
  updated_by text, updated_at text
);

CREATE TABLE forecast_month_plans (
  id text PRIMARY KEY,             -- 'YYYY-MM'
  year int, month int,
  month_start text, month_end text,
  weeks jsonb,
  is_closed boolean DEFAULT false,
  created_by text, created_at text,
  updated_by text, updated_at text
);

CREATE TABLE customer_comments (
  id text PRIMARY KEY,
  customer_id text, customer_code text, customer_name text,
  branch_name text, rep_name text,
  kind text, body text,
  author_name text, created_at text, updated_at text
);
*/

/**
 * قراءة بالدفعات لجداول التوقعات والتعليقات.
 *
 * نفس سبب `fetchAllRows`: `select('*')` من غير range بياقص عند 1,000 صف
 * بصمت. الجداول دي مفهومة الحجم (شهر واحد لكل مندوب × 8 فترات)، فالحد
 * الأقصى هنا حماية ضد جدول مش متوقع مش رقم تشغيل.
 */
export interface ForecastFetchScope {
  branchNames?: string[];
  repIds?: string[];
  repNames?: string[];
}

export interface ContentStampMeta {
  count: number | null;
  maxUpdatedAt: string | null;
}

const FORECAST_SELECT_COLUMNS = [
  'id',
  'month_key',
  'week_index',
  'rep_id',
  'rep_name',
  'branch_name',
  'customer_id',
  'customer_code',
  'customer_name',
  'collection_forecast',
  'sales_forecast',
  'status',
  'submitted_at',
  'approved_by',
  'approved_at',
  'change_request_note',
  'change_requested_by',
  'change_requested_at',
  'updated_by',
  'updated_at',
].join(',');

const FORECAST_PLAN_SELECT_COLUMNS = [
  'id',
  'year',
  'month',
  'month_start',
  'month_end',
  'weeks',
  'is_closed',
  'created_by',
  'created_at',
  'updated_by',
  'updated_at',
].join(',');

const CUSTOMER_COMMENTS_SELECT_COLUMNS = [
  'id',
  'customer_id',
  'customer_code',
  'customer_name',
  'branch_name',
  'rep_name',
  'kind',
  'body',
  'author_name',
  'created_at',
  'updated_at',
  'is_archived',
  'archived_at',
  'archived_by',
].join(',');

function applyForecastScope(query: any, scope?: ForecastFetchScope): any {
  if (!scope) return query;
  const clauses: string[] = [];
  const branches = (scope.branchNames || []).map((b) => String(b).trim()).filter(Boolean);
  if (branches.length > 0) {
    clauses.push(`branch_name.in.(${branches.map(quoteOrValue).join(',')})`);
  }
  (scope.repIds || []).map((id) => String(id).trim()).filter(Boolean).forEach((id) => {
    clauses.push(`rep_id.eq.${quoteOrValue(id)}`);
  });
  (scope.repNames || []).map((name) => String(name).trim()).filter(Boolean).forEach((name) => {
    clauses.push(`rep_name.ilike.${quoteOrValue(`*${name}*`)}`);
  });
  return clauses.length > 0 ? query.or(clauses.join(',')) : query;
}

function applyCommentsScope(query: any, scope?: ForecastFetchScope): any {
  if (!scope) return query;
  const clauses: string[] = [];
  const branches = (scope.branchNames || []).map((b) => String(b).trim()).filter(Boolean);
  if (branches.length > 0) {
    clauses.push(`branch_name.in.(${branches.map(quoteOrValue).join(',')})`);
  }
  (scope.repNames || []).map((name) => String(name).trim()).filter(Boolean).forEach((name) => {
    clauses.push(`rep_name.ilike.${quoteOrValue(`*${name}*`)}`);
  });
  return clauses.length > 0 ? query.or(clauses.join(',')) : query;
}

/**
 * قراءة بالدفعات لجداول التوقعات والتعليقات مع تحديد الأعمدة المطلوبة فقط.
 */
async function fetchAllRowsPaged(
  table: 'collection_forecasts' | 'customer_comments',
  maxPages: number,
  scope?: ForecastFetchScope,
  options?: { updatedSince?: string }
): Promise<{ data: any[]; error: any }> {
  const pageSize = 1000;
  const rows: any[] = [];
  let selectCols =
    table === 'collection_forecasts' ? FORECAST_SELECT_COLUMNS : CUSTOMER_COMMENTS_SELECT_COLUMNS;
  let updatedSince = options?.updatedSince?.trim() || '';

  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const buildQuery = (cols: string, since: string) => {
      let q = supabase.from(table).select(cols);
      q = table === 'collection_forecasts' ? applyForecastScope(q, scope) : applyCommentsScope(q, scope);
      if (since) q = q.gte('updated_at', since);
      return q;
    };

    let { data, error } = await buildQuery(selectCols, updatedSince).range(from, from + pageSize - 1);

    if (error && updatedSince && isMissingColumnError(error)) {
      updatedSince = '';
      ({ data, error } = await buildQuery(selectCols, '').range(from, from + pageSize - 1));
    }

    if (error && selectCols !== '*' && isMissingColumnError(error)) {
      selectCols = '*';
      ({ data, error } = await buildQuery('*', updatedSince).range(from, from + pageSize - 1));
    }

    if (error) return { data: rows, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    if (page === maxPages - 1) {
      console.warn(
        `Stopgap: ${table} read hit the ${maxPages}-page cap (${maxPages * pageSize} rows). ` +
          'Check the data, not the code.'
      );
    }
  }
  return { data: rows, error: null };
}

/**
 * 50 ألف سطر توقع ≈ 400 مندوب × 9 فترات × 14 شهر. أكبر من المحتاج.
 */
const MAX_FORECAST_PAGES = 50;

/** 20 ألف تعليق: تعليق لكل عميل بسعر فاضي. */
const MAX_COMMENT_PAGES = 20;

export async function fetchForecastMonthStamp(
  monthKey: string,
  scope?: ForecastFetchScope
): Promise<ContentStampMeta | null> {
  try {
    let query = supabase
      .from('collection_forecasts')
      .select('updated_at', { count: 'exact' })
      .eq('month_key', monthKey)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1);
    query = applyForecastScope(query, scope);
    const { data, error, count } = await query;
    if (error) return null;
    const maxUpdatedAt = data && data.length > 0 ? (data[0] as any)?.updated_at ?? null : null;
    return {
      count: typeof count === 'number' ? count : null,
      maxUpdatedAt: maxUpdatedAt ? String(maxUpdatedAt) : null,
    };
  } catch {
    return null;
  }
}

export async function fetchForecastPlansStamp(): Promise<ContentStampMeta | null> {
  try {
    const { data, error, count } = await supabase
      .from('forecast_month_plans')
      .select('updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) return null;
    const maxUpdatedAt = data && data.length > 0 ? (data[0] as any)?.updated_at ?? null : null;
    return {
      count: typeof count === 'number' ? count : null,
      maxUpdatedAt: maxUpdatedAt ? String(maxUpdatedAt) : null,
    };
  } catch {
    return null;
  }
}

export async function fetchCustomerCommentsStamp(
  scope?: ForecastFetchScope
): Promise<ContentStampMeta | null> {
  try {
    const buildStampQuery = (col: 'updated_at' | 'created_at') => {
      let query = supabase
        .from('customer_comments')
        .select(col, { count: 'exact' })
        .order(col, { ascending: false, nullsFirst: false })
        .limit(1);
      return applyCommentsScope(query, scope);
    };

    let res = await buildStampQuery('updated_at');
    let usedCol: 'updated_at' | 'created_at' = 'updated_at';
    if (res.error) {
      res = await buildStampQuery('created_at');
      usedCol = 'created_at';
    }
    if (res.error) return null;
    const row = res.data && res.data.length > 0 ? (res.data[0] as any) : null;
    const latest = row ? row[usedCol] ?? null : null;
    return {
      count: typeof res.count === 'number' ? res.count : null,
      maxUpdatedAt: latest ? String(latest) : null,
    };
  } catch {
    return null;
  }
}

export function fetchForecastsFromSupabase(
  scope?: ForecastFetchScope
): Promise<{ success: boolean; forecasts?: any[]; error?: string }> {
  return dedupeInFlightRequest(
    `forecasts:${JSON.stringify(scope ?? null)}`,
    () => fetchForecastsFromSupabaseImpl(scope)
  );
}

async function fetchForecastsFromSupabaseImpl(
  scope?: ForecastFetchScope
): Promise<{ success: boolean; forecasts?: any[]; error?: string }> {
  try {
    const { data, error } = await fetchAllRowsPaged('collection_forecasts', MAX_FORECAST_PAGES, scope);
    if (error) return { success: false, error: error.message };
    return { success: true, forecasts: data };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل تحميل التوقعات المشتركة' };
  }
}

/**
 * توقعات شهر واحد فقط — الفلترة على السيرفر بدل تحميل كل الشهور.
 */
const MAX_MONTH_FORECAST_PAGES = 10;

export async function fetchForecastsByMonthFromSupabase(
  monthKey: string,
  scope?: ForecastFetchScope,
  options?: { updatedSince?: string }
): Promise<{ success: boolean; forecasts?: any[]; error?: string }> {
  try {
    const pageSize = 1000;
    const rows: any[] = [];
    let selectCols = FORECAST_SELECT_COLUMNS;
    let updatedSince = options?.updatedSince?.trim() || '';

    for (let page = 0; page < MAX_MONTH_FORECAST_PAGES; page++) {
      const from = page * pageSize;
      const buildQuery = (cols: string, since: string) => {
        let query = supabase
          .from('collection_forecasts')
          .select(cols)
          .eq('month_key', monthKey);
        query = applyForecastScope(query, scope);
        if (since) query = query.gte('updated_at', since);
        return query;
      };
      let { data, error } = await buildQuery(selectCols, updatedSince).range(from, from + pageSize - 1);

      if (error && updatedSince && isMissingColumnError(error)) {
        updatedSince = '';
        ({ data, error } = await buildQuery(selectCols, '').range(from, from + pageSize - 1));
      }

      if (error && selectCols !== '*' && isMissingColumnError(error)) {
        selectCols = '*';
        ({ data, error } = await buildQuery('*', updatedSince).range(from, from + pageSize - 1));
      }

      if (error) return { success: false, error: error.message };
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return { success: true, forecasts: rows };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل تحميل توقعات الشهر' };
  }
}

/**
 * توقعات سنة كاملة (لوحة الإدارة). month_key نص 'YYYY-MM'.
 */
export async function fetchForecastsByYearFromSupabase(
  year: number,
  scope?: ForecastFetchScope
): Promise<{ success: boolean; forecasts?: any[]; error?: string }> {
  try {
    const pageSize = 1000;
    const rows: any[] = [];
    let selectCols = FORECAST_SELECT_COLUMNS;

    for (let page = 0; page < MAX_FORECAST_PAGES; page++) {
      const from = page * pageSize;
      let query = supabase
        .from('collection_forecasts')
        .select(selectCols)
        .gte('month_key', `${year}-01`)
        .lt('month_key', `${year + 1}-01`);
      query = applyForecastScope(query, scope);
      let { data, error } = await query.range(from, from + pageSize - 1);

      if (error && selectCols !== '*' && isMissingColumnError(error)) {
        selectCols = '*';
        let fbQuery = supabase
          .from('collection_forecasts')
          .select('*')
          .gte('month_key', `${year}-01`)
          .lt('month_key', `${year + 1}-01`);
        fbQuery = applyForecastScope(fbQuery, scope);
        ({ data, error } = await fbQuery.range(from, from + pageSize - 1));
      }

      if (error) return { success: false, error: error.message };
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return { success: true, forecasts: rows };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل تحميل توقعات السنة' };
  }
}

export async function saveForecastsToSupabase(forecasts: any[]): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = forecasts.map((f) => ({
      id: f.id,
      month_key: f.monthKey,
      week_index: Number(f.weekIndex || 0),
      rep_id: f.repId,
      rep_name: f.repName,
      branch_name: f.branchName,
      customer_id: f.customerId,
      customer_code: f.customerCode,
      customer_name: f.customerName,
      collection_forecast: Number(f.collectionForecast || 0),
      sales_forecast: Number(f.salesForecast || 0),
      status: f.status,
      submitted_at: f.submittedAt || null,
      approved_by: f.approvedBy || null,
      approved_at: f.approvedAt || null,
      change_request_note: f.changeRequestNote || null,
      change_requested_by: f.changeRequestedBy || null,
      change_requested_at: f.changeRequestedAt || null,
      updated_by: f.updatedBy || null,
      updated_at: f.updatedAt || new Date().toISOString(),
    }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from('collection_forecasts').upsert(payload.slice(i, i + 500), { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل حفظ التوقعات المشتركة' };
  }
}

export async function deleteForecastFromSupabase(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('collection_forecasts').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل حذف التوقع' };
  }
}

export async function fetchForecastMonthPlansFromSupabase(): Promise<{ success: boolean; plans?: any[]; error?: string }> {
  try {
    // صف واحد لكل شهر مُدار. حتى 20 سنة = 240 صف، فحد 5 آلاف أكثر من اللازم.
    const pageSize = 1000;
    const rows: any[] = [];
    let selectCols = FORECAST_PLAN_SELECT_COLUMNS;

    for (let page = 0; page < 5; page++) {
      const from = page * pageSize;
      let { data, error } = await supabase
        .from('forecast_month_plans')
        .select(selectCols)
        .range(from, from + pageSize - 1);

      if (error && selectCols !== '*' && isMissingColumnError(error)) {
        selectCols = '*';
        ({ data, error } = await supabase
          .from('forecast_month_plans')
          .select('*')
          .range(from, from + pageSize - 1));
      }

      if (error) return { success: false, error: error.message };
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return { success: true, plans: rows };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل تحميل خطط الأسابيع المشتركة' };
  }
}

export async function saveForecastMonthPlanToSupabase(plan: any): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('forecast_month_plans').upsert(
      {
        id: plan.id,
        year: Number(plan.year),
        month: Number(plan.month),
        month_start: plan.monthStart,
        month_end: plan.monthEnd,
        weeks: plan.weeks,
        is_closed: !!plan.isClosed,
        created_by: plan.createdBy || null,
        created_at: plan.createdAt || new Date().toISOString(),
        updated_by: plan.updatedBy || null,
        updated_at: plan.updatedAt || new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل حفظ خطة الأسابيع' };
  }
}

export function fetchCustomerCommentsFromSupabase(
  scope?: ForecastFetchScope,
  options?: { updatedSince?: string }
): Promise<{ success: boolean; comments?: any[]; error?: string }> {
  return dedupeInFlightRequest(
    `comments:${JSON.stringify(scope ?? null)}:${options?.updatedSince ?? ''}`,
    () => fetchCustomerCommentsFromSupabaseImpl(scope, options)
  );
}

async function fetchCustomerCommentsFromSupabaseImpl(
  scope?: ForecastFetchScope,
  options?: { updatedSince?: string }
): Promise<{ success: boolean; comments?: any[]; error?: string }> {
  try {
    const { data, error } = await fetchAllRowsPaged('customer_comments', MAX_COMMENT_PAGES, scope, options);
    if (error) return { success: false, error: error.message };
    return { success: true, comments: data };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل تحميل كومنتات العملاء' };
  }
}

export async function saveCustomerCommentsToSupabase(comments: any[]): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = comments.map((c) => ({
      id: c.id,
      customer_id: c.customerId,
      customer_code: c.customerCode,
      customer_name: c.customerName,
      branch_name: c.branchName,
      rep_name: c.repName,
      kind: c.kind,
      body: c.body,
      author_name: c.authorName,
      created_at: c.createdAt,
      updated_at: c.updatedAt || c.createdAt,
      // حالة الأرشفة كانت بتتخزن على الجهاز بس وبتتنضف أول ما السيرفر يردّ
      // على أي عميل جديد (AppContext بيعيد بناء التعليقات من السيرفر).
      // الأعمدة دي بتتطلب supabase/fix_forecast_rls.sql — من غيرها الـupsert
      // بيرجع عمود مش موجود، ونرجع للـfallback بدل ما نضيع الأرشفة تاني.
      is_archived: !!c.isArchived,
      archived_at: c.archivedAt || null,
      archived_by: c.archivedBy || null,
    }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await supabase.from('customer_comments').upsert(payload.slice(i, i + 500), { onConflict: 'id' });
      if (error) {
        // شيم ناقصة الأعمدة الجديدة: نعيد المحاولة بدون أعمدة الأرشفة عشان
        // التعليقات نفسها متحفظش، والأرشفة بس ترجع لوضع الجهاز.
        const legacyPayload = payload.slice(i, i + 500).map(({ is_archived, archived_at, archived_by, ...rest }) => rest);
        const { error: legacyErr } = await supabase.from('customer_comments').upsert(legacyPayload, { onConflict: 'id' });
        if (legacyErr) return { success: false, error: error.message };
        console.warn(
          'customer_comments archive columns are missing on the server. ' +
            'Run supabase/fix_forecast_rls.sql to persist archiving; comments saved without it.'
        );
        continue;
      }
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل حفظ كومنتات العملاء' };
  }
}

export async function deleteCustomerCommentFromSupabase(commentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('customer_comments').delete().eq('id', commentId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل حذف كومنت العميل' };
  }
}

/* ============================================================
   INCREMENTAL CUSTOMER SYNC — يمنع إعادة تحميل 5000 عميل في كل مزامنة
   يستخدم updated_at كـ cursor: يسحب فقط العملاء الجدد أو اللي اتعدلوا
   بعد آخر مزامنة ناجحة، ويحدثهم محلياً (Upsert) بدلًا من استبدال الكل.
   ============================================================ */

const CUSTOMER_LAST_SYNC_KEY = 'dream_dist_customers_last_sync_ts_v1';

export function getLastCustomerSyncTs(): string | null {
  try {
    return localStorage.getItem(CUSTOMER_LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

export function setLastCustomerSyncTs(ts: string): void {
  try {
    localStorage.setItem(CUSTOMER_LAST_SYNC_KEY, ts);
  } catch {}
}

export const CUSTOMER_SELECT_COLUMNS = [
  'id', 'code', 'name', 'store_name', 'phone', 'address', 'governorate',
  'branch_name', 'sector', 'rep_name', 'rep_id', 'tax_number', 'tier',
  'credit_limit', 'balance', 'current_balance', 'notes', 'last_visit_date',
  'visit_count_2026', 'visit_history', 'sales_2026', 'total_monthly_sales',
  'total_overall_sales', 'collections_2026', 'total_monthly_collections',
  'total_overall_collections', 'monthly_sales_2026', 'monthly_collections_2026',
  'sales_2025', 'collections_2025', 'overdue_2025', 'overdue_2026',
  'due_until_period', 'opening_balance_2026', 'has_dealt_in_2026',
  'activity_type', 'client_type', 'payment_terms', 'guarantee_docs',
  'guarantee_amount', 'region', 'last_collection_date', 'last_collection_amount',
  'updated_at', 'created_at',
].join(',');


export async function fetchCustomersIncremental(
  scope?: CustomerFetchScope
): Promise<{
  success: boolean;
  customers?: Customer[];
  error?: string;
  isFullFetch?: boolean;
  maxUpdatedAt?: string | null;
}> {
  try {
    const cursor = getSyncCursor('customers');
    const isFullFetch = !cursor;

    const MINIMAL_CUSTOMER_COLUMNS = 'id, code, name, phone, branch_name, updated_at';
    const scopeDecorator = (query: any) => applyScopeToQuery(query, scope);

    let read = await readRowsPaged('customers', CUSTOMER_SELECT_COLUMNS, cursor?.ts, scopeDecorator);

    if (read.error) {
      // لو جداول العملاء ناقصة أعمدة (total_overdue, deal_eligibility ...)،
      // إعادة المحاولة بأعمدة أساسية فقط لتحميل البيانات بدلاً من حظر الصفحة نهائياً.
      read = await readRowsPaged('customers', MINIMAL_CUSTOMER_COLUMNS, cursor?.ts, scopeDecorator);
    }

    if (read.error) return { success: false, error: read.error.message };

    const rows = read.rows || [];
    // صفوف اللحظة الحدودية بترجع تاني مع `gte`، فبنشيل اللي اتزامن قبل كده.
    const changedRows = cursor ? rows.filter((r: any) => isRowAfterCursor(r, cursor)) : rows;
    if (changedRows.length === 0) {
      return { success: true, customers: [], isFullFetch, maxUpdatedAt: cursor?.ts ?? null };
    }

    // المؤشر بيتقدّم على آخر صف **اتقرأ** — حتى لو اتفلتر — بأمان.
    let nextCursor: SyncCursor | null = cursor;
    for (const r of rows) nextCursor = advanceSyncCursor(nextCursor, r);
    const maxUpdatedAt = nextCursor?.ts ?? null;

    const mapped: Customer[] = changedRows.map((c: any, idx: number) => {
      const { cleanNotes, meta: geoMeta } = extractCustomerGeoFromNotes(c.notes);
      const resolvedLat = c.latitude !== undefined && c.latitude !== null ? Number(c.latitude) : geoMeta?.lat;
      const resolvedLng = c.longitude !== undefined && c.longitude !== null ? Number(c.longitude) : geoMeta?.lng;
      return {
        id: c.id || `cust-${idx + 1}`,
        code: c.code || `CUST-${1000 + idx + 1}`,
        name: c.name || '',
        storeName: c.store_name || c.storeName || c.name || '',
        phone: c.phone || c.mobile || '',
        address: c.address || c.region || c.city || '',
        governorate: c.governorate || '',
        branchName: c.branch_name || c.branchName || '',
        sector: ['home', 'electrical', 'both', 'all'].includes(c.sector) ? c.sector : undefined,
        repName: c.rep_name || c.repName || '',
        salesRepName: c.rep_name || c.repName || '',
        repId: c.rep_id || c.repId || '',
        taxNumber: c.tax_number || c.taxNumber || '',
        tier: c.tier || 'نشيط',
        creditLimit: Number(c.credit_limit ?? c.creditLimit ?? 0),
        balance: Number(c.balance ?? c.current_balance ?? 0),
        currentBalance: Number(c.current_balance ?? c.balance ?? 0),
        notes: cleanNotes,
        latitude: resolvedLat,
        longitude: resolvedLng,
        locationAddress: c.location_address || geoMeta?.addr || undefined,
        locationCapturedAt: c.location_captured_at || geoMeta?.at || undefined,
        locationCapturedBy: c.location_captured_by || geoMeta?.by || undefined,
        locationLocked: c.location_locked !== undefined ? Boolean(c.location_locked) : Boolean(geoMeta?.locked),
        locationApprovedBy: c.location_approved_by || geoMeta?.appBy || undefined,
        locationApprovedAt: c.location_approved_at || geoMeta?.appAt || undefined,
        locationPhotoUrl: c.location_photo_url || geoMeta?.photo || undefined,
        locationAccuracy: geoMeta?.acc,
        lastVisitDate: c.last_visit_date || c.lastVisitDate || undefined,
        visitCount2026: c.visit_count_2026 !== undefined ? Number(c.visit_count_2026) : undefined,
        visitHistory: c.visit_history
          ? typeof c.visit_history === 'string'
            ? JSON.parse(c.visit_history)
            : c.visit_history
          : undefined,
        createdAt: c.created_at || new Date().toISOString(),
        sales2026: Number(c.sales_2026 || c.sales2026 || 0),
        totalMonthlySales: Number(c.total_monthly_sales || c.totalMonthlySales || c.sales_2026 || 0),
        totalOverallSales: Number(c.total_overall_sales || c.totalOverallSales || 0),
        collections2026: Number(c.collections_2026 || c.collections2026 || 0),
        totalMonthlyCollections: Number(c.total_monthly_collections || c.totalMonthlyCollections || 0),
        totalOverallCollections: Number(c.total_overall_collections || c.totalOverallCollections || 0),
        sales2025: c.sales_2025 !== undefined ? Number(c.sales_2025) : null,
        collections2025: c.collections_2025 !== undefined ? Number(c.collections_2025) : null,
        overdue2025: c.overdue_2025 !== undefined ? Number(c.overdue_2025) : null,
        overdue2026: c.overdue_2026 !== undefined ? Number(c.overdue_2026) : null,
        dueUntilPeriod: c.due_until_period !== undefined ? Number(c.due_until_period) : null,
        openingBalance2026: c.opening_balance_2026 !== undefined ? Number(c.opening_balance_2026) : null,
        hasDealtIn2026: c.has_dealt_in_2026 !== undefined ? Boolean(c.has_dealt_in_2026) : undefined,
        totalOverdue: c.total_overdue !== undefined ? Number(c.total_overdue) : 0,
        totalOverdueAndDue: c.total_overdue_and_due !== undefined ? Number(c.total_overdue_and_due) : undefined,
        overdueBalance: c.overdue_balance !== undefined ? Number(c.overdue_balance) : undefined,
        dueBalance: c.due_balance !== undefined ? Number(c.due_balance) : undefined,
        dealEligibility: c.deal_eligibility || undefined,
        dealt2026: c.dealt_2026 || null,
        dealtIn2026: c.dealt_in_2026 !== undefined ? Boolean(c.dealt_in_2026) : undefined,
        activityType: c.activity_type || null,
        clientType: c.client_type || null,
        paymentTerms: c.payment_terms || null,
        guaranteeDocs: c.guarantee_docs || null,
        guaranteeAmount: Number(c.guarantee_amount || 0),
        region: c.region || c.district || c.route || null,
        lastCollectionDate: c.last_collection_date || null,
        lastCollectionAmount: Number(c.last_collection_amount || 0),
      };
    });

    if (nextCursor) {
      setSyncCursor('customers', nextCursor.ts, nextCursor.id);
      setLastCustomerSyncTs(nextCursor.ts);
    }

    return {
      success: true,
      customers: mapped,
      isFullFetch,
      maxUpdatedAt,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'فشل في المزامنة التراكمية للعملاء',
    };
  }
}

export function mergeCustomersIncremental(
  existing: Customer[],
  incoming: Customer[]
): Customer[] {
  const byId = new Map<string, Customer>();
  existing.forEach((c) => byId.set(c.id, c));
  incoming.forEach((c) => byId.set(c.id, c));
  return Array.from(byId.values());
}

/* ============================================================
   GENERIC INCREMENTAL SYNC HELPERS (targets / products / sales)
   يستخدم updated_at كـ cursor: يسجل آخر وقت مزامنة لكل كيان في
   localStorage، ويسحب فقط الصفوف اللي اتعدلوا أو أُضيفت من ذلك الوقت.
   ============================================================ */

const SYNC_LS_PREFIX = 'dream_dist_last_sync_v1::';

export function getLastSyncTs(entity: string): string | null {
  try {
    return localStorage.getItem(`${SYNC_LS_PREFIX}${entity}`);
  } catch {
    return null;
  }
}

export function setLastSyncTs(entity: string, ts: string): void {
  try {
    localStorage.setItem(`${SYNC_LS_PREFIX}${entity}`, ts);
  } catch {}
}

export type SyncResultMeta = {
  success: boolean;
  entity: string;
  count: number;
  isFullFetch: boolean;
  maxUpdatedAt: string | null;
  error?: string;
};

/* ============================================================
   مؤشر مزامنة آمن (updated_at + id) + Pagination
   ------------------------------------------------------------
   المشكلة القديمة: الاستعلام كان `.gt(updated_at, lastTs)` من غير `.range()`،
   وPostgREST بيرجّع 1,000 صف بالحد الأقصى. يعني أي جدول أكبر من كده كان
   بيتزامن جزئيًا من غير أي خطأ. وكمان لو أكتر من صف ليهم نفس `updated_at`
   على حدود الصفحة، الـ`.gt` في المزامنة اللي بعدها كان بيتخطاهم.

   الحل هنا:
   • المزامنة التدريجية بتقرأ `.gte(updated_at, cursor.ts)` مرتّبة بـ
     `updated_at, id` — يعني صفوف اللحظة الحدودية بترجع تاني بدل ما تتخطى.
   • بعد القراءة بنفلتر بمقارنة `(updated_at, id)` مع المؤشر المحفوظ، فمفيش
     تكرار ولا فقدان.
   • Pagination حقيقي بـ`.range()` لحد ما الجدول يخلص.
   • المؤشر بيتقدّم لآخر صف **اتقرأ فعلًا**، فمفيش قفزة فوق صفوف لسه ما وصلتش.
   ============================================================ */

const SYNC_CURSOR_PREFIX = 'dream_dist_sync_cursor_v2::';
const INCREMENTAL_PAGE_SIZE = 1000;
/** سقف أمان: 200 ألف صف في المزامنة الواحدة (حماية من حلقة لا نهائية). */
const INCREMENTAL_MAX_PAGES = 200;

export interface SyncCursor {
  ts: string;
  id: string | null;
}

export function getSyncCursor(entity: string): SyncCursor | null {
  try {
    const raw = localStorage.getItem(`${SYNC_CURSOR_PREFIX}${entity}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.ts === 'string' && parsed.ts) {
        return { ts: parsed.ts, id: parsed.id != null ? String(parsed.id) : null };
      }
    }
  } catch {}
  // توافق مع المؤشر القديم (ts فقط) — نكمّل منه بأمان.
  const legacy = getLastSyncTs(entity);
  return legacy ? { ts: legacy, id: null } : null;
}

export function setSyncCursor(entity: string, ts: string, id: string | null): void {
  try {
    localStorage.setItem(`${SYNC_CURSOR_PREFIX}${entity}`, JSON.stringify({ ts, id: id ?? null }));
  } catch {}
  setLastSyncTs(entity, ts);
}

/** مقارنة ids: رقمي لو الاتنين أرقام (جداول bigint)، وإلا نصي (uuid/text). */
function compareRowIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (a.trim() !== '' && b.trim() !== '' && Number.isFinite(na) && Number.isFinite(nb)) {
    return na === nb ? 0 : na > nb ? 1 : -1;
  }
  return a === b ? 0 : a > b ? 1 : -1;
}

/** هل الصف أحدث من المؤشر؟ الصفوف اللي عند نفس اللحظة الحدودية بترجع بالـ id. */
function isRowAfterCursor(row: any, cursor: SyncCursor): boolean {
  const ts = row?.updated_at ? String(row.updated_at) : '';
  if (!ts) return false;
  if (ts > cursor.ts) return true;
  if (ts < cursor.ts) return false;
  // مؤشر قديم بدون id: بنرجّع صفوف اللحظة الحدودية (الدمج idempotent).
  if (!cursor.id) return true;
  const id = row?.id != null ? String(row.id) : '';
  return compareRowIds(id, cursor.id) > 0;
}

/** يقدّم المؤشر لآخر صف فعلي في الصفحة (ترتيب تصاعدي updated_at ثم id). */
function advanceSyncCursor(cursor: SyncCursor | null, row: any): SyncCursor | null {
  const ts = row?.updated_at ? String(row.updated_at) : '';
  if (!ts) return cursor;
  const id = row?.id != null ? String(row.id) : null;
  if (!cursor) return { ts, id };
  if (ts > cursor.ts) return { ts, id };
  if (ts < cursor.ts) return cursor;
  if (!cursor.id) return { ts, id: id ?? null };
  if (!id) return cursor;
  return compareRowIds(id, cursor.id) > 0 ? { ts, id } : cursor;
}

/**
 * يقرأ كل الصفوف المتغيرة بعد المؤشر على دفعات 1000.
 * `gte` مش `gt` مطلوبة: الصفوف اللي عند نفس لحظة المؤشر لازم ترجع تاني
 * وبعدين تتفلتر client-side بالـ id، وإلا تبقى عرضة للتخطي.
 */
async function readRowsPaged(
  table: string,
  columns: string,
  cursorTs?: string,
  decorate?: (query: any) => any
): Promise<{ rows: any[]; error: any }> {
  const rows: any[] = [];
  for (let page = 0; page < INCREMENTAL_MAX_PAGES; page++) {
    let query = supabase
      .from(table)
      .select(columns)
      .order('updated_at', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });
    if (cursorTs) query = query.gte('updated_at', cursorTs);
    if (decorate) query = decorate(query);
    const from = page * INCREMENTAL_PAGE_SIZE;
    const { data, error } = await query.range(from, from + INCREMENTAL_PAGE_SIZE - 1);
    if (error) return { rows, error };
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < INCREMENTAL_PAGE_SIZE) return { rows, error: null };
  }
  return { rows, error: null };
}

/* ---------- Targets (التارجت) ---------- */
const TARGETS_SELECT_COLUMNS = [
  'id', 'branch', 'rep_name', 'sales_target', 'sales_achieved', 'sales_percentage',
  'collection_target', 'collection_achieved', 'collection_percentage',
  'target_date', 'month', 'year', 'quarter', 'remaining_sales', 'remaining_collection',
  'notes', 'updated_at',
].join(',');

export async function fetchTargetsIncremental(
  scope?: TargetFetchScope
): Promise<{
  success: boolean;
  targets?: any[];
  error?: string;
  isFullFetch?: boolean;
  maxUpdatedAt?: string | null;
  count?: number;
  entity?: string;
}> {
  try {
    const scopeKey = scope
      ? `targets::${[...(scope.branchNames || []), ...(scope.repNames || [])].sort().join('|') || 'scoped'}`
      : 'targets';
    const cursor = getSyncCursor(scopeKey);
    const isFullFetch = !cursor;
    const read = await readRowsPaged('targets', TARGETS_SELECT_COLUMNS, cursor?.ts, (q) =>
      applyTargetScope(q, scope)
    );
    if (read.error) {
      return { success: false, error: read.error.message, entity: 'targets', count: 0, isFullFetch, maxUpdatedAt: cursor?.ts ?? null };
    }
    const rows = read.rows || [];
    const changedRows = cursor ? rows.filter((r: any) => isRowAfterCursor(r, cursor)) : rows;
    if (changedRows.length === 0) {
      return { success: true, targets: [], entity: 'targets', count: 0, isFullFetch, maxUpdatedAt: cursor?.ts ?? null };
    }
    let nextCursor: SyncCursor | null = cursor;
    for (const r of rows) nextCursor = advanceSyncCursor(nextCursor, r);
    if (nextCursor) setSyncCursor(scopeKey, nextCursor.ts, nextCursor.id);
    return {
      success: true,
      targets: changedRows,
      entity: 'targets',
      count: changedRows.length,
      isFullFetch,
      maxUpdatedAt: nextCursor?.ts ?? null,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'فشل في المزامنة التراكمية للأهداف', entity: 'targets', count: 0, isFullFetch: false, maxUpdatedAt: null };
  }
}

export function mergeTargetsIncremental(existing: any[], incoming: any[]): any[] {
  const byId = new Map<string, any>();
  existing.forEach((t) => { if (t && t.id) byId.set(String(t.id), t); });
  incoming.forEach((t) => { if (t && t.id) byId.set(String(t.id), t); });
  return Array.from(byId.values());
}

/* ---------- Products (الأصناف / العروض) ---------- */
const PRODUCTS_SELECT_COLUMNS = [
  'id', 'code', 'name', 'sales_priority', 'status', 'carton_quantity', 'size', 'color',
  'stock', 'branch_stock_actual', 'branch_stock_reserved', 'main_warehouse_actual',
  'main_warehouse_reserved', 'item_group', 'category', 'department', 'family_name',
  'classification', 'piece_price', 'carton_price', 'image_url', 'cloudinary_public_id',
  'barcode', 'unified_code', 'branch_stocks', 'sector', 'branch_name', 'updated_at', 'created_at',
].join(',');

export async function fetchProductsIncremental(
  sector?: ProductSectorScope
): Promise<{
  success: boolean;
  products?: any[];
  error?: string;
  isFullFetch?: boolean;
  maxUpdatedAt?: string | null;
  count?: number;
  entity?: string;
}> {
  try {
    // مؤشر المزامنة محفوظ لكل قطاع على حدة، بس المؤشر القديم (غير المقيّد)
    // صالح فورًا: الترتيب بيتم على updated_at على مستوى الجدول كله، فأي صف
    // جديد في أي قطاع كان هيبقى بعد المؤشر برضه. بنهجّر الكتالوج الكامل
    // اللي كان هيحصل لو غيّرنا المفتاح من غير ما ننقل المؤشر.
    const scopeKey = sector ? `products::${sector}` : 'products';
    const cursor = getSyncCursor(scopeKey) || (sector ? getSyncCursor('products') : null);
    const isFullFetch = !cursor;
    const read = await readRowsPaged('products', PRODUCTS_SELECT_COLUMNS, cursor?.ts, (q) =>
      applyProductSectorScope(q, sector)
    );
    if (read.error) {
      if (String(read.error.message || '').includes('updated_at')) {
        const all: any[] = [];
        let fallbackCols = PRODUCTS_SELECT_COLUMNS.replace(',updated_at', '');
        for (let page = 0; page < INCREMENTAL_MAX_PAGES; page++) {
          const from = page * INCREMENTAL_PAGE_SIZE;
          let baseQuery = supabase
            .from('products')
            .select(fallbackCols)
            .order('id', { ascending: true });
          baseQuery = applyProductSectorScope(baseQuery, sector);
          let { data, error: allErr } = await baseQuery.range(from, from + INCREMENTAL_PAGE_SIZE - 1);
          if (allErr && fallbackCols !== '*' && isMissingColumnError(allErr)) {
            let fbQuery = supabase
              .from('products')
              .select('*')
              .order('id', { ascending: true });
            fbQuery = applyProductSectorScope(fbQuery, sector);
            ({ data, error: allErr } = await fbQuery.range(from, from + INCREMENTAL_PAGE_SIZE - 1));
          }
          if (allErr) {
            if (all.length === 0) {
              return { success: false, error: allErr.message, entity: 'products', count: 0, isFullFetch: true, maxUpdatedAt: null };
            }
            break;
          }
          const batch = data || [];
          all.push(...batch);
          if (batch.length < INCREMENTAL_PAGE_SIZE) break;
        }
        // مفيش updated_at يعني مفيش مزامنة تدريجية ممكنة — منسجّلش مؤشر.
        return { success: true, products: all.map(mapProductTableRow), entity: 'products', count: all.length, isFullFetch: true, maxUpdatedAt: null };
      }
      return { success: false, error: read.error.message, entity: 'products', count: 0, isFullFetch, maxUpdatedAt: null };
    }
    const rows = read.rows || [];
    const changedRows = cursor ? rows.filter((r: any) => isRowAfterCursor(r, cursor)) : rows;
    if (changedRows.length === 0) {
      return { success: true, products: [], entity: 'products', count: 0, isFullFetch, maxUpdatedAt: cursor?.ts ?? null };
    }
    let nextCursor: SyncCursor | null = cursor;
    for (const r of rows) nextCursor = advanceSyncCursor(nextCursor, r);
    if (nextCursor) setSyncCursor(scopeKey, nextCursor.ts, nextCursor.id);
    return {
      success: true,
      // صفوف الـ snake_case من قاعدة البيانات بتتحول لـ Product الغني قبل الدمج —
      // mergeProductsIncremental بيدمجها في الحالة مباشرة فلازم تكون mapped.
      products: changedRows.map(mapProductTableRow),
      entity: 'products',
      count: changedRows.length,
      isFullFetch,
      maxUpdatedAt: nextCursor?.ts ?? null,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'فشل في المزامنة التراكمية للأصناف', entity: 'products', count: 0, isFullFetch: false, maxUpdatedAt: null };
  }
}

export function mergeProductsIncremental(existing: any[], incoming: any[]): any[] {
  const byId = new Map<string, any>();
  existing.forEach((p) => { const k = p && (p.id || p.code); if (k) byId.set(String(k), p); });
  incoming.forEach((p) => { const k = p && (p.id || p.code); if (k) byId.set(String(k), p); });
  return Array.from(byId.values());
}

/* ---------- Customer Item Sales (مبيعات الأصناف) ---------- */
const CUSTOMER_ITEM_SALES_SELECT_COLUMNS = [
  'id', 'customer_account', 'invoicing_name', 'sales_order', 'sale_date', 'rep_name',
  'month', 'item_code', 'item_name', 'quantity', 'amount', 'warehouse', 'updated_at',
  // أعمدة التحليل — لازم تفضل موجودة في المزامنة التدريجية وإلا السجلات
  // المحدّثة تفقد الوحدة/المعامل/السعر/الخصم/الكود الموحد.
  'unit', 'factor', 'unit_price', 'discount', 'unified_code',
].join(',');

export async function fetchCustomerItemSalesIncremental(scope?: {
  repNames?: string[];
  warehouses?: string[];
}): Promise<{
  success: boolean;
  sales?: any[];
  error?: string;
  isFullFetch?: boolean;
  maxUpdatedAt?: string | null;
  count?: number;
  entity?: string;
}> {
  try {
    const scopeKey = scope
      ? `customer_item_sales::${[...(scope.repNames || []), ...(scope.warehouses || [])].sort().join('|') || 'scoped'}`
      : 'customer_item_sales';
    const cursor = getSyncCursor(scopeKey);
    const isFullFetch = !cursor;
    const applyScope = (q: any) => {
      if (!scope) return q;
      const clauses: string[] = [];
      (scope.repNames || []).map((n) => String(n).trim()).filter((n) => n.length >= 2).forEach((name) => {
        clauses.push(`rep_name.ilike.${quoteOrValue(`*${name}*`)}`);
      });
      (scope.warehouses || []).map((w) => String(w).trim()).filter((w) => w.length >= 2).forEach((wh) => {
        clauses.push(`warehouse.ilike.${quoteOrValue(`*${wh}*`)}`);
      });
      return clauses.length > 0 ? q.or(clauses.join(',')) : q;
    };
    const read = await readRowsPaged(
      'customer_item_sales',
      CUSTOMER_ITEM_SALES_SELECT_COLUMNS,
      cursor?.ts,
      scope ? applyScope : undefined
    );
    if (read.error) {
      return { success: false, error: read.error.message, entity: 'customer_item_sales', count: 0, isFullFetch, maxUpdatedAt: cursor?.ts ?? null };
    }
    const rows = read.rows || [];
    const changedRows = cursor ? rows.filter((r: any) => isRowAfterCursor(r, cursor)) : rows;
    if (changedRows.length === 0) {
      return { success: true, sales: [], entity: 'customer_item_sales', count: 0, isFullFetch, maxUpdatedAt: cursor?.ts ?? null };
    }
    let nextCursor: SyncCursor | null = cursor;
    for (const r of rows) nextCursor = advanceSyncCursor(nextCursor, r);
    if (nextCursor) setSyncCursor(scopeKey, nextCursor.ts, nextCursor.id);
    return {
      success: true,
      sales: changedRows,
      entity: 'customer_item_sales',
      count: changedRows.length,
      isFullFetch,
      maxUpdatedAt: nextCursor?.ts ?? null,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'فشل في المزامنة التراكمية لمبيعات الأصناف', entity: 'customer_item_sales', count: 0, isFullFetch: false, maxUpdatedAt: null };
  }
}

export function mergeCustomerItemSalesIncremental(existing: any[], incoming: any[]): any[] {
  const byId = new Map<string, any>();
  existing.forEach((s) => { if (s && s.id) byId.set(String(s.id), s); });
  incoming.forEach((s) => { if (s && s.id) byId.set(String(s.id), s); });
  return Array.from(byId.values());
}
