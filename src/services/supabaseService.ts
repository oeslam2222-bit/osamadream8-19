import { createClient } from '@supabase/supabase-js';
import { Branch, Customer, Invoice, Product, User, UserRole, CustomerVisit } from '../types';
import { withHashedCredential } from './passwordService';
import { resolveCustomerBalanceValue, resolveCustomerDuesValue } from './customerDues';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://rxthpgmlcsfckstpqhqf.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4dGhwZ21sY3NmY2tzdHBxaHFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDIwMzgsImV4cCI6MjEwMzIxODAzOH0.2v4eRUKQjLM0xDomaE9HAiy_qTJ6NoijNuwC3JV1ZUA';

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

// Initialize Supabase Client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    // Version checks must never be served from a browser/CDN cache.
    headers: {
      'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
      Pragma: 'no-cache',
    },
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export interface SupabaseSyncStatus {
  connected: boolean;
  tableFound?: string;
  usersCount?: number;
  productsCount?: number;
  invoicesCount?: number;
  customersCount?: number;
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
  try {
    let foundTable = '';
    let usersCount = 0;
    let productsCount = 0;
    let invoicesCount = 0;
    let customersCount = 0;

    const countTable = async (table: string): Promise<number | null> => {
      try {
        const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
        return error || typeof count !== 'number' ? null : count;
      } catch (error) {
        console.warn(`Could not query ${table} table in Supabase:`, error);
        return null;
      }
    };

    // These independent head-only count requests can run together instead of
    // making app startup wait for each network round trip in sequence.
    const [usersResult, productsResult, invoicesResult, customersResult, ordersResult] = await Promise.all([
      countTable('users'),
      countTable('products'),
      countTable('invoices'),
      countTable('customers'),
      countTable('orders'),
    ]);

    if (usersResult !== null) {
      foundTable += 'users ';
      usersCount = usersResult;
    } else {
      const profilesResult = await countTable('profiles');
      if (profilesResult !== null) {
        foundTable += 'profiles ';
        usersCount = profilesResult;
      }
    }
    if (productsResult !== null) {
      foundTable += 'products ';
      productsCount = productsResult;
    }
    if (invoicesResult !== null) {
      foundTable += 'invoices ';
      invoicesCount = invoicesResult;
    }
    if (customersResult !== null) {
      foundTable += 'customers ';
      customersCount = customersResult;
    }

    return {
      connected: true,
      tableFound: foundTable.trim() || 'متصل بنجاح بقاعدة البيانات السحابية (Supabase)',
      usersCount,
      productsCount,
      invoicesCount,
      customersCount,
      invoicesTableState: resolveInvoicesTableState(invoicesResult, ordersResult),
      lastSyncTime: new Date().toLocaleTimeString('ar-EG'),
    };
  } catch (err: any) {
    return {
      connected: false,
      error: err?.message || 'فشل الاتصال بقاعدة بيانات Supabase',
    };
  }
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
}

/**
 * Which slice of the visits table a device is allowed to download.
 *
 * نفس منطق العملاء بالظبط: جدول الزيارات بيVOLUME كبير (آلاف الصفوف)،
 * والمندوب شغال في فرع واحد بس. سحب السجل كامل onto كل جهاز =_payload
 * بيدفع فاتورة الاستضافة على 400 جهاز لمحتوى مش هيتشاف أصلاً.
 *
 * الأدمن والمطور بيسحبوا كل حاجة عشان تقرير المرتجعات وحالات الديون
 * على مستوى الشركة محتاجها.
 */
export interface VisitFetchScope {
  branchNames?: string[];
  /** حد أدنى للتاريخ (YYYY-MM-DD): الزيارات الأقدم مش محمولة على الموبايل. */
  sinceDate?: string;
}

/** أربعين ألف صف: حدّ أمان ضد جدول مش متوقع، مش رقم تشغيل. */
const MAX_VISIT_PAGES = 40;

/**
 * Supabase REST returns at most 1,000 rows per request by default.
 * Read the table in pages so imports and role-specific counts include the full dataset.
 */
async function fetchAllRows(
  table: 'customers' | 'clients',
  scope?: CustomerFetchScope
): Promise<{ data: any[]; error: any }> {
  const pageSize = 1000;
  const rows: any[] = [];
  const branchFilter = scope?.branchNames?.filter((b) => b && b.trim().length > 0) || [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select('*');
    if (branchFilter.length > 0) {
      query = query.in('branch_name', branchFilter);
    }
    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) return { data: rows, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return { data: rows, error: null };
}

/**
 * Fetch all customers from Supabase (checking 'customers' or 'clients')
 */
export async function fetchCustomersFromSupabase(
  scope?: CustomerFetchScope
): Promise<{ success: boolean; customers?: Customer[]; error?: string; scoped?: boolean }> {
  try {
    let rawCustomers: any[] | null = null;
    let scopedUsed = Boolean(scope?.branchNames?.length);
    let { data: custData, error: cErr } = await fetchAllRows('customers', scope);
    if (!cErr && scopedUsed && custData.length === 0) {
      // Branch names are free-text Arabic, so a narrow read that matches nothing
      // must degrade to the full base - never to an empty customer list on a
      // rep's phone. Worst case here is "downloads more than needed".
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
    } else {
      const { data: clientData, error: clErr } = await fetchAllRows('clients');
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
        return {
          id: c.id || `cust-${idx + 1}`,
          code: c.code || c.customer_code || `CUST-${1000 + idx + 1}`,
          name: c.name || c.customer_name || 'عميل بدون اسم',
          storeName: c.store_name || c.storeName || c.name || '',
          phone: c.phone || c.mobile || '',
          address: c.address || c.region || c.city || '',
          governorate: c.governorate || '',
          branchName: c.branch_name || c.branchName || 'فرع القاهرة',
          repName: c.rep_name || c.repName || 'مندوب المبيعات',
          salesRepName: c.rep_name || c.repName || 'مندوب المبيعات',
          repId: c.rep_id || c.repId || '',
          taxNumber: c.tax_number || c.taxNumber || '',
          tier: c.tier || 'متوسط',
          creditLimit: Number(c.credit_limit ?? c.creditLimit ?? 0),
          balance: Number(c.balance ?? c.current_balance ?? 0),
          currentBalance: Number(c.current_balance ?? c.balance ?? 0),
          notes: c.notes || '',
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
          // Row timestamp for conflict resolution (newer updated_at wins on sync).
          updatedAt: c.updated_at || c.updatedAt || undefined,
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
    const branchFilter = scope?.branchNames?.filter((b) => b && b.trim().length > 0) || [];

    let query = supabase
      .from('customers')
      .select('updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1);
    if (branchFilter.length > 0) {
      query = query.in('branch_name', branchFilter);
    }

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
        rep_name: c.repName || c.salesRepName || 'مندوب المبيعات',
        rep_id: c.repId || null,
        tax_number: c.taxNumber || null,
        tier: c.tier || 'متوسط',
        credit_limit: Number(c.creditLimit || 0),
        balance: resolveCustomerBalanceValue(c),
        current_balance: resolveCustomerBalanceValue(c),
        notes: c.notes || null,
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

    const failures: string[] = [];
    for (let i = 0; i < payload.length; i += 100) {
      const chunk = payload.slice(i, i + 100);
      const { error: err1 } = await supabase.from('customers').upsert(chunk);
      if (err1) {
        // The dues columns require add_customer_financial_columns.sql. Retry the
        // chunk without them so a missing migration degrades the dues figure
        // instead of blocking the entire customer sync.
        if (/column .*(total_overdue_and_due|overdue_balance|due_balance|total_overdue|deal_eligibility|dealt_2026|dealt_in_2026)|schema cache/i.test(err1.message)) {
          const legacyChunk = chunk.map((row: any) => {
            const {
              total_overdue_and_due, overdue_balance, due_balance, total_overdue,
              deal_eligibility, dealt_2026, dealt_in_2026,
              ...rest
            } = row;
            return rest;
          });
          const { error: retryErr } = await supabase.from('customers').upsert(legacyChunk);
          if (retryErr) {
            failures.push(retryErr.message);
          }
        } else {
          failures.push(err1.message);
        }
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
    return { success: false, error: e?.message };
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

export async function fetchTargetsFromSupabase(): Promise<{ success: boolean; targets?: any[]; error?: string }> {
  try {
    /**
     * بيتقرأ بالدفعات مش `select('*')` من غير حد.
     *
     * `select('*')` من غير range بيرجع أول 1,000 صف بصمت، فكان أول ما عدد
     * المندوبين يعدّي 1,000 صف التارجت بيبدأ ينقص من غير رسالة خطأ.
     * الترتيب موجود أصلاً (year desc, month asc) والـrange بيشتغل معاه عادي.
     *
     * الحد الأقصى 50 ألف صف ≈ صف لكل مندوب × ~125 شهر (10 سنين). أقدم من
     * كده نادر، والـconsole.warn بيقولها صراحةً لو وصلنا.
     */
    const pageSize = 1000;
    const rows: any[] = [];
    for (let page = 0; page < MAX_TARGET_PAGES; page++) {
      const from = page * pageSize;
      const { data, error } = await supabase
        .from('targets')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: true })
        .range(from, from + pageSize - 1);
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
    return { success: false, error: error?.message || 'فشل تحميل التارجت المشترك' };
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
const USERS_CACHE_TTL_MS = 60 * 1000; // 60 seconds memory cache
let activeUsersFetchPromise: Promise<{ success: boolean; users?: User[]; error?: string }> | null = null;

/**
 * pagination لجدول المستخدمين.
 *
 * الحجم المستهدف 400 موظف، والصفحة 1,000 صف — يعني في الواقع قراءة واحدة.
 * الحد موجود عشان لو الجدول كبر فجأة (نسخة تانية من الشركة، بيانات تجريبية)
 * التطبيق ما يفترضش إن 1,000 صف = الجدول كله.
 */
const USER_PAGE_SIZE = 1000;
const MAX_USER_PAGES = 5;

export function invalidateUsersCache() {
  cachedUsersResponse = null;
}

/**
 * Columns the anon key may read on public.users after
 * secure_user_credentials.sql. `select=*` fails there by design
 * (the password column is revoked from anon), so the client
 * read must name the granted columns explicitly.
 */
const USER_READ_COLUMNS = [
  'id', 'name', 'username', 'email', 'role', 'branch_name',
  'supervisor_id', 'phone', 'commission_rate', 'is_active',
  'approval_status', 'created_at', 'auth_user_id', 'auth_email',
].join(',');

/**
 * Fetch all users from Supabase (checking 'users', 'app_users', 'profiles' and central snapshot)
 * Optimized with in-memory caching and request deduplication to accelerate loading
 */
export async function fetchUsersFromSupabase(forceRefresh: boolean = false): Promise<{ success: boolean; users?: User[]; error?: string }> {
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
      const tableCandidates = ['users', 'app_users', 'profiles'];

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

      // 1. Prioritize querying the primary 'users' table first
      // بيتقرأ بالدفعات: `select('*')` من غير range بيرجع أول 1,000 صف بس
      // بصمت. جدول المستخدمين كله ~400 صف دلوقتي، بس ده بالظبط الرقم اللي
      // ركبنا عليه، وأول ما يعدّيه التطبيق هيتعطل لعدد مندوبين على manuals.
      const readUserRows = async (table: string): Promise<any[] | null> => {
        const rows: any[] = [];
        for (let page = 0; page < MAX_USER_PAGES; page++) {
          const from = page * USER_PAGE_SIZE;
          // After secure_user_credentials.sql the anon key cannot
          // read `users` with select('*') — the password column is
          // revoked, and a star select requests it. Naming the
          // granted columns keeps the primary read working. The
          // legacy fallback tables keep '*' (their schemas are
          // unknown, and they are only read when users is empty).
          const selectList = table === 'users' ? USER_READ_COLUMNS : '*';
          const { data, error } = await supabase
            .from(table)
            .select(selectList)
            .range(from, from + USER_PAGE_SIZE - 1);
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

      // 2. Only check secondary candidates if primary 'users' table is empty or has very few records
      if (byId.size === 0) {
        for (const tbl of ['app_users', 'profiles']) {
          try {
            const data = await readUserRows(tbl);
            if (!data) continue;
            data.forEach((row: any, idx: number) => {
              const user = mapUser(row, tbl, idx);
              const existing = byId.get(user.id) || (user.email && byEmail.get(user.email.toLowerCase()));
              byId.set(user.id, { ...existing, ...user });
              if (user.email) byEmail.set(user.email.toLowerCase(), { ...existing, ...user });
            });
          } catch {
            // Continue
          }
        }

        // Check central snapshot as fallback
        try {
          const { data } = await supabase.from('orders').select('items').eq('id', USER_SYNC_STORE_ID).limit(1);
          const items = data?.[0]?.items;
          const snapshot = Array.isArray(items) ? items : typeof items === 'string' ? JSON.parse(items) : [];
          snapshot.forEach((row: any, idx: number) => {
            const user = mapUser(row, 'snapshot', idx);
            if (!byId.has(user.id) && (!user.email || !byEmail.has(user.email.toLowerCase()))) byId.set(user.id, user);
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
      return { success: false, error: 'لم يتم العثور على مستخدمين' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'خطأ في جلب المستخدمين من Supabase' };
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
 * Find a specific user in Supabase by email, username, or phone safely
 */
export async function findUserInSupabase(identifier: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const rawClean = sanitizeIdentifier(identifier);
    const cleanLower = rawClean.toLowerCase();
    const cleanEmail = sanitizeEmail(identifier);

    if (!rawClean) {
      return { success: false, error: 'المعرف فارغ' };
    }

    // Fetch remote users and match accurately in memory without fragile PostgREST URL syntax errors
    const remoteRes = await fetchUsersFromSupabase();
    if (remoteRes.success && remoteRes.users && remoteRes.users.length > 0) {
      const found = remoteRes.users.find(
        (u) =>
          (u.email && sanitizeEmail(u.email) === cleanEmail) ||
          (u.username && sanitizeIdentifier(u.username).toLowerCase() === cleanLower) ||
          (u.phone && sanitizeIdentifier(u.phone) === rawClean) ||
          (u.name && sanitizeIdentifier(u.name).toLowerCase() === cleanLower)
      );
      if (found) {
        return { success: true, user: found };
      }
    }

    return { success: false, error: 'لم يتم العثور على المستخدم' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'تعذر البحث عن المستخدم في السحابة' };
  }
}

/**
 * Save all users into Supabase central store snapshot and tables safely
 */
export async function saveUsersToSupabase(users: User[]): Promise<{ success: boolean; error?: string }> {
  try {
    invalidateUsersCache();
    let firstError = '';
    const securedUsers = await Promise.all(users.map((u) => withHashedCredential(u)));
    const usersPayload = securedUsers.map((u) => ({
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
    }));

    // 1. Upsert into 'users' table directly
    for (let i = 0; i < usersPayload.length; i += 50) {
      const chunk = usersPayload.slice(i, i + 50);
      try {
        const { error: uErr } = await supabase.from('users').upsert(chunk);
        if (uErr) {
          const minChunk = chunk.map((c) => ({
            id: c.id,
            name: c.name,
            username: c.username,
            email: c.email,
            password: c.password,
            role: c.role,
            branch_name: c.branch_name,
          }));
          const { error: fallbackError } = await supabase.from('users').upsert(minChunk);
          if (fallbackError && !firstError) firstError = fallbackError.message;
        }
      } catch (err) {
        if (!firstError) firstError = err instanceof Error ? err.message : 'تعذر حفظ المستخدمين';
        console.warn('Upsert chunk into users note:', err);
      }
    }

    // 2. Also update snapshot in orders table
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
    return { success: false, error: e?.message };
  }
}

/**
 * Upsert / Save single user into Supabase directly
 */
export async function saveUserToSupabase(user: User, currentUsersList?: User[]): Promise<{ success: boolean; error?: string }> {
  try {
    invalidateUsersCache();
    const securedUser = await withHashedCredential(user);
    const userPayload = {
      id: securedUser.id,
      name: securedUser.name,
      username: securedUser.username,
      email: securedUser.email,
      password: securedUser.password || '',
      role: securedUser.role,
      branch_name: securedUser.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
      supervisor_id: user.supervisorId || null,
      phone: user.phone || '',
      commission_rate: user.commissionRate || 2.5,
      is_active: user.isActive ?? true,
      approval_status: user.approvalStatus || 'active',
      created_at: user.registrationDate || new Date().toISOString(),
    };

    // 1. Parallel fast upsert to tables
    const tablePromises: Promise<any>[] = [
      Promise.resolve(supabase.from('users').upsert(userPayload)),
      Promise.resolve(
        supabase.from('profiles').upsert({
          id: user.id,
          full_name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          branch_name: user.branchName,
          phone: user.phone,
        })
      ),
    ];

    // 2. Snapshot store update without blocking
    if (currentUsersList && currentUsersList.length > 0) {
      const map = new Map<string, User>();
      currentUsersList.forEach((u) => map.set(u.id, u));
      map.set(user.id, user);
      const updatedList = Array.from(map.values());
      tablePromises.push(
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

    await Promise.allSettled(tablePromises);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message };
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
    return { success: false, error: e?.message };
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
    return { success: false, error: e?.message };
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
export async function fetchInvoicesFromSupabase(limit = 150): Promise<{ success: boolean; invoices?: Invoice[]; error?: string }> {
  try {
    /**
     * الاتنين بيتقرؤوا **مع بعض** مش واحد ورا التاني.
     *
     * المنطق زي ما كان بالظبط (جدول invoices الأول، و orders fallback لو
     * رجع فاضي)، بس الكود كان مستني invoices يخلص ثم يطلب orders، يعني
     * كل قراءة فاتورتين ورا بعض. ده بيتكرر عند 5 مواضع في الإقلاع والمزامنة،
     * وكل واحد منهم = طلب زائد على الشبكة.
     *
     * `Promise.allSettled` مش بيعمل فشلش: لو واحد فيهم وقع، التاني بيفضل
     * شغال. وترتيب الاختيار بيفضل زي ما كان — invoices لو فيها صف، غير كده
     * orders.
     */
    const [invoicesRead, ordersRead] = await Promise.allSettled([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(limit),
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(limit),
    ]);

    const invResult = invoicesRead.status === 'fulfilled' ? invoicesRead.value : null;
    const ordResult = ordersRead.status === 'fulfilled' ? ordersRead.value : null;

    let rawInvoices: any[] | null = null;
    if (!invResult?.error && invResult?.data && invResult.data.length > 0) {
      rawInvoices = invResult.data;
    } else if (!ordResult?.error && ordResult?.data && ordResult.data.length > 0) {
      rawInvoices = ordResult.data;
    }
    if (invoicesRead.status === 'rejected' || ordersRead.status === 'rejected') {
      console.warn(
        'Supabase invoice read warning:',
        invoicesRead.status === 'rejected' ? invoicesRead.reason : ordersRead.status === 'rejected' ? ordersRead.reason : null
      );
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
        // Row timestamp for conflict resolution (newer updated_at wins on sync).
        updatedAt: i.updated_at || i.updatedAt || undefined,
      }));
      return { success: true, invoices: mapped };
    }

    return { success: true, invoices: [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'خطأ في جلب الفواتير من Supabase' };
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
    return { success: false, error: e?.message };
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
    return { success: false, error: e?.message };
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
export async function saveProductsToSupabase(products: Product[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (!products || products.length === 0) return { success: true };

    // Index products by their unique ID to preserve all 5500+ rows
    const idMap = new Map<string, Product>();
    products.forEach((product) => {
      idMap.set(product.id, product);
    });
    const uniqueProducts = Array.from(idMap.values());

    // 1. Save rich chunked snapshot into shared store so all 5000+ items and branch stocks are 100% preserved
    const totalChunks = Math.ceil(uniqueProducts.length / CHUNK_SIZE);
    try {
      // Save manifest first
      await supabase.from('orders').upsert({
        id: CATALOG_MANIFEST_ID,
        status: 'catalog_sync_manifest',
        total: uniqueProducts.length,
        items: { totalChunks, totalProducts: uniqueProducts.length, updatedAt: new Date().toISOString() } as any,
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

    // 2. Also upsert into standard products table in chunks
    const payload = uniqueProducts.map((p) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id);
      const safeId = isUuid ? p.id : stringToUuid(p.id);
      const cartonQuantity = Math.max(1, Number(p.cartonQuantity || p.factor) || 1);
      const piecePrice = Number(p.piecePrice || p.salesPrice || 0) ||
        (Number(p.cartonPrice || 0) > 0 ? Math.round((Number(p.cartonPrice) / cartonQuantity) * 100) / 100 : 0);
      return {
        id: safeId,
        code: p.code?.trim() || null,
        name: p.name,
        category: p.itemGroup || p.department || p.category || 'عام',
        price: piecePrice,
        stock: p.branchStockActual || 0,
        image_url: p.imageUrl || null,
      };
    });

    // The products table treats a normalized code as unique, even when imported
    // rows have different IDs. Keep only the last row for each code in this save.
    const productsByKey = new Map<string, (typeof payload)[number]>();
    payload.forEach((product) => {
      const key = product.code
        ? `code:${product.code.toLowerCase()}`
        : `id:${product.id}`;
      productsByKey.set(key, product);
    });
    const deduplicatedPayload = Array.from(productsByKey.values());
    const productsWithCode = deduplicatedPayload.filter((product) => product.code);
    const productsWithoutCode = deduplicatedPayload.filter((product) => !product.code);
    let saveError: string | undefined;

    const saveChunks = async (
      rows: typeof payload,
      onConflict: 'code' | 'id'
    ) => {
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { error } = await supabase.from('products').upsert(chunk, { onConflict });
        if (error) {
          console.warn('Direct products chunk save notice:', error.message);
          saveError ??= error.message;
        }
      }
    };

    await saveChunks(productsWithCode, 'code');
    await saveChunks(productsWithoutCode, 'id');

    if (saveError) return { success: false, error: saveError };

    return { success: true };
  } catch (e: any) {
    console.error('Supabase products save error:', e);
    return { success: false, error: e?.message };
  }
}

/**
 * Fetch products catalog from Supabase
 * Safely fetches all products without being capped at Supabase's default 1,000 row limit
 */
export async function fetchProductsFromSupabase(): Promise<{ success: boolean; products?: Product[]; error?: string }> {
  try {
    // 1. Check if chunked rich catalog snapshot exists
    const { data: manifestData, error: manErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', CATALOG_MANIFEST_ID)
      .limit(1);

    if (!manErr && manifestData && manifestData.length > 0 && manifestData[0].items) {
      const rawManifest = manifestData[0].items as any;
      const totalChunks = rawManifest?.totalChunks;
      if (typeof totalChunks === 'number' && totalChunks > 0) {
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
          return { success: true, products: allItems };
        }
      }
    }

    // 2. Fallback: Check if single catalog snapshot exists
    const { data: snapshotData, error: snapErr } = await supabase
      .from('orders')
      .select('*')
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
        return { success: true, products: itemsList };
      }
    }

    // 3. Fallback: Paginated select from standard products table (overcomes default 1,000 row cap)
    const pageSize = 1000;
    let page = 0;
    const allProdData: any[] = [];

    while (true) {
      const { data: chunk, error: pErr } = await supabase
        .from('products')
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (pErr || !chunk || chunk.length === 0) break;
      allProdData.push(...chunk);
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
      const mapped: Product[] = allProdData.map((p: any) => {
        const cartonQuantity = Math.max(1, Number(p.carton_quantity ?? p.cartonQuantity ?? p.factor) || 1);
        const piecePrice = Number(p.piece_price ?? p.price ?? 0);
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
          cartonPrice: Math.round(piecePrice * cartonQuantity * 100) / 100,
          branchName: p.branch_name || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
          imageUrl: p.image_url || undefined,
          cloudinaryPublicId: p.cloudinary_public_id || undefined,
          barcode: p.barcode || undefined,
        };
      });
      return { success: true, products: mapped };
    }

    return { success: true, products: [] };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
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
export async function fetchVisitsFromSupabase(
  scope?: VisitFetchScope
): Promise<{ success: boolean; visits?: CustomerVisit[]; error?: string; scoped?: boolean }> {
  try {
    const pageSize = 1000;
    const branchFilter = scope?.branchNames?.filter((b) => b && b.trim().length > 0) || [];
    const sinceDate = scope?.sinceDate?.trim() || '';

    /**
     * بتقرأ جدول الزيارات بالدفعات وتطبّق الـscope على السيرفر.
     *
     * الـscope بيرجع صفر صف على النطاق الضيق (أسماء الفروع نص عربي حر)،
     * فالسلوك هنا زي العملاء بالظبط: نرجع للقراءة الكاملة بدل ما نرجع
     * صفحة زيارات فاضية على موبايل المندوب.
     */
    const readPages = async (useScope: boolean) => {
      const rows: any[] = [];
      for (let page = 0; page < MAX_VISIT_PAGES; page++) {
        const from = page * pageSize;
        let query = supabase.from('visits').select('*').order('created_at', { ascending: false });
        if (useScope && branchFilter.length > 0) {
          query = query.in('branch_name', branchFilter);
        }
        if (useScope && sinceDate) {
          query = query.gte('date', sinceDate);
        }
        const { data, error } = await query.range(from, from + pageSize - 1);

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

    let scopedUsed = branchFilter.length > 0 || Boolean(sinceDate);
    let { data: rows, error } = await readPages(scopedUsed);
    if (!error && scopedUsed && rows.length === 0) {
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

    const mapped: CustomerVisit[] = rows.map((v: any) => ({
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
      notes: v.notes || '',
      location: v.location || (v.latitude && v.longitude ? { latitude: Number(v.latitude), longitude: Number(v.longitude), mapUrl: `https://maps.google.com/?q=${v.latitude},${v.longitude}` } : undefined),
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
    }));

    return { success: true, visits: mapped, scoped: scopedUsed };
  } catch (err: any) {
    return { success: false, error: err?.message };
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
      let enhancedNotes = v.notes || '';
      if (v.location?.latitude) {
        enhancedNotes += `\n[موقع GPS: ${v.location.latitude.toFixed(6)}, ${v.location.longitude.toFixed(6)}]`;
      }
      if (v.checkInTime) {
        enhancedNotes += `\n[حضور: ${v.checkInTime}${v.checkOutTime ? ` - انصراف: ${v.checkOutTime}` : ''}${v.durationMinutes ? ` (${v.durationMinutes} دقيقة)` : ''}]`;
      }
      if (v.storeStockStatus) {
        enhancedNotes += `\n[حالة المخزون بالمتجر: ${v.storeStockStatus}]`;
      }
      if (v.competitorNotes) {
        enhancedNotes += `\n[بضاعة وأسعار المنافسين: ${v.competitorNotes}]`;
      }
      if (v.customerRating) {
        enhancedNotes += `\n[تقييم تجاوب العميل: ${v.customerRating}/5 ⭐]`;
      }
      if (v.nextVisitDate) {
        enhancedNotes += `\n[الزيارة القادمة المتفق عليها: ${v.nextVisitDate}]`;
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

    const CHUNK_SIZE = 100;
    let savedCount = 0;

    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE);
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
async function fetchAllRowsPaged(
  table: 'collection_forecasts' | 'customer_comments',
  maxPages: number
): Promise<{ data: any[]; error: any }> {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1);
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

export async function fetchForecastsFromSupabase(): Promise<{ success: boolean; forecasts?: any[]; error?: string }> {
  try {
    const { data, error } = await fetchAllRowsPaged('collection_forecasts', MAX_FORECAST_PAGES);
    if (error) return { success: false, error: error.message };
    return { success: true, forecasts: data };
  } catch (error: any) {
    return { success: false, error: error?.message || 'فشل تحميل التوقعات المشتركة' };
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
    for (let page = 0; page < 5; page++) {
      const from = page * pageSize;
      const { data, error } = await supabase.from('forecast_month_plans').select('*').range(from, from + pageSize - 1);
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

export async function fetchCustomerCommentsFromSupabase(): Promise<{ success: boolean; comments?: any[]; error?: string }> {
  try {
    const { data, error } = await fetchAllRowsPaged('customer_comments', MAX_COMMENT_PAGES);
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
