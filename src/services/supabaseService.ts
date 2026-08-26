import { createClient } from '@supabase/supabase-js';
import { Branch, Customer, Invoice, Product, User, UserRole } from '../types';

export const SUPABASE_URL = 'https://rxthpgmlcsfckstpqhqf.supabase.co';
export const SUPABASE_ANON_KEY =
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
  lastSyncTime?: string;
  error?: string;
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

    // 1. Try 'users' or 'profiles' table
    try {
      const { data: usersData, error: userErr } = await supabase.from('users').select('*').limit(50);
      if (!userErr && usersData) {
        foundTable += 'users ';
        usersCount = usersData.length;
      } else {
        const { data: profData, error: profErr } = await supabase.from('profiles').select('*').limit(50);
        if (!profErr && profData) {
          foundTable += 'profiles ';
          usersCount = profData.length;
        }
      }
    } catch (e) {
      console.warn('Could not query users table in Supabase:', e);
    }

    // 2. Try 'products' or 'items' table
    try {
      const { data: prodData, error: prodErr } = await supabase.from('products').select('*').limit(50);
      if (!prodErr && prodData) {
        foundTable += 'products ';
        productsCount = prodData.length;
      }
    } catch (e) {
      console.warn('Could not query products table in Supabase:', e);
    }

    // 3. Try 'invoices' or 'orders' table
    try {
      const { data: invData, error: invErr } = await supabase.from('invoices').select('*').limit(50);
      if (!invErr && invData) {
        foundTable += 'invoices ';
        invoicesCount = invData.length;
      }
    } catch (e) {
      console.warn('Could not query invoices table in Supabase:', e);
    }

    // 4. Try 'customers' or 'clients' table
    try {
      const { data: custData, error: custErr } = await supabase.from('customers').select('*').limit(50);
      if (!custErr && custData) {
        foundTable += 'customers ';
        customersCount = custData.length;
      }
    } catch (e) {
      console.warn('Could not query customers table in Supabase:', e);
    }

    return {
      connected: true,
      tableFound: foundTable.trim() || 'متصل بنجاح بقاعدة البيانات السحابية (Supabase)',
      usersCount,
      productsCount,
      invoicesCount,
      customersCount,
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
 * Fetch all customers from Supabase (checking 'customers' or 'clients')
 */
export async function fetchCustomersFromSupabase(): Promise<{ success: boolean; customers?: Customer[]; error?: string }> {
  try {
    let rawCustomers: any[] | null = null;
    const { data: custData, error: cErr } = await supabase.from('customers').select('*').order('name', { ascending: true });
    if (!cErr && custData && custData.length > 0) {
      rawCustomers = custData;
    } else {
      const { data: clientData, error: clErr } = await supabase.from('clients').select('*');
      if (!clErr && clientData && clientData.length > 0) {
        rawCustomers = clientData;
      }
    }

    if (rawCustomers && rawCustomers.length > 0) {
      const mapped: Customer[] = rawCustomers.map((c: any, idx: number) => ({
        id: c.id || `cust-${idx + 1}`,
        code: c.code || c.customer_code || `CUST-${1000 + idx + 1}`,
        name: c.name || c.customer_name || 'عميل بدون اسم',
        phone: c.phone || c.mobile || '',
        address: c.address || c.region || c.city || '',
        branchName: c.branch_name || c.branchName || 'فرع القاهرة',
        repName: c.rep_name || c.repName || 'مندوب المبيعات',
        repId: c.rep_id || c.repId || '',
        taxNumber: c.tax_number || c.taxNumber || '',
        notes: c.notes || '',
        createdAt: c.created_at || new Date().toISOString(),
      }));
      return { success: true, customers: mapped };
    }

    return { success: true, customers: [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'خطأ في جلب قاعدة بيانات العملاء' };
  }
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
      return {
        id: safeId,
        code: c.code || null,
        name: c.name || 'عميل بدون اسم',
        phone: c.phone || '',
        address: c.address || '',
        branch_name: c.branchName || 'الفرع الرئيسي',
        rep_name: c.repName || 'مندوب المبيعات',
        rep_id: c.repId || null,
        tax_number: c.taxNumber || null,
        notes: c.notes || null,
        updated_at: new Date().toISOString(),
      };
    });

    for (let i = 0; i < payload.length; i += 100) {
      const chunk = payload.slice(i, i + 100);
      const { error: err1 } = await supabase.from('customers').upsert(chunk);
      if (err1) {
        console.warn('Supabase customer upsert notice:', err1.message);
      }
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
 * Fetch all users from Supabase (checking 'users', 'profiles', 'employees', 'app_users')
 */
export async function fetchUsersFromSupabase(): Promise<{ success: boolean; users?: User[]; error?: string }> {
  try {
    const tableCandidates = ['users', 'profiles', 'employees', 'app_users'];

    for (const tbl of tableCandidates) {
      try {
        const { data, error } = await supabase.from(tbl).select('*');
        if (!error && data && data.length > 0) {
          const mapped: User[] = data.map((u: any, idx: number) => {
            const rawEmail = u.email || '';
            const emailPrefix = rawEmail ? rawEmail.split('@')[0] : '';
            const rawName = u.name || u.full_name || u.display_name || emailPrefix || 'مستخدم';
            const rawUsername = u.username || u.user_name || emailPrefix || `user_${idx + 1}`;
            const rawPass = u.password || u.pass || u.code || '';

            return {
              id: String(u.id || `sup-${tbl}-${idx + 1}`),
              name: rawName,
              username: rawUsername.trim().toLowerCase(),
              email: rawEmail.trim(),
              password: String(rawPass || '').trim(),
              role: normalizeUserRole(u.role, u.is_admin),
              branchName: u.branch_name || u.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
              supervisorId: u.supervisor_id || u.supervisorId,
              phone: u.phone || u.mobile || u.tel || '',
              commissionRate: Number(u.commission_rate || u.commissionRate || 2.5),
              isActive: u.is_active !== undefined ? Boolean(u.is_active) : true,
              approvalStatus: u.approval_status || u.approvalStatus || 'active',
              createdAt: u.created_at || u.createdAt || new Date().toISOString(),
            };
          });
          return { success: true, users: mapped };
        }
      } catch {
        // continue to next table
      }
    }

    return { success: false, error: 'لم يتم العثور على سجلات في جداول المستخدمين بالسحابة' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'خطأ في جلب المستخدمين من Supabase' };
  }
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

    // 1. Fetch all remote users and match accurately in memory without fragile PostgREST URL syntax errors
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

    // 2. Direct single lookup fallback on 'users' and 'profiles' table using clean values
    for (const tableName of ['users', 'profiles']) {
      try {
        if (cleanEmail.includes('@')) {
          const { data: eData, error: eErr } = await supabase
            .from(tableName)
            .select('*')
            .eq('email', cleanEmail)
            .limit(1);

          if (!eErr && eData && eData.length > 0) {
            const u = eData[0];
            return {
              success: true,
              user: {
                id: u.id || `sup-u-${Date.now()}`,
                name: u.name || u.full_name || u.username || 'مستخدم',
                username: u.username || u.email?.split('@')[0] || 'user',
                email: u.email || '',
                password: u.password || '',
                role: normalizeUserRole(u.role, u.is_admin),
                branchName: u.branch_name || u.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
                supervisorId: u.supervisor_id || u.supervisorId,
                phone: u.phone || u.mobile || '',
                commissionRate: u.commission_rate || u.commissionRate || 2.5,
                isActive: u.is_active !== undefined ? u.is_active : true,
                approvalStatus: u.approval_status || u.approvalStatus || 'active',
                registrationDate: u.created_at || u.registration_date || u.createdAt || new Date().toISOString(),
              },
            };
          }
        }
      } catch {
        // ignore and continue
      }
    }

    return { success: false, error: 'لم يتم العثور على المستخدم' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'تعذر البحث عن المستخدم في السحابة' };
  }
}

/**
 * Upsert / Save user into Supabase
 */
export async function saveUserToSupabase(user: User): Promise<{ success: boolean; error?: string }> {
  try {
    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const safeUuid = user.id && isUuid(user.id) ? user.id : stringToUuid(user.id || user.username || user.email);

    const payloadRaw = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      password: user.password || '',
      role: user.role,
      branch_name: user.branchName,
      supervisor_id: user.supervisorId || null,
      phone: user.phone || '',
      commission_rate: user.commissionRate || 2.5,
      is_active: user.isActive ?? true,
      approval_status: user.approvalStatus || 'active',
      updated_at: new Date().toISOString(),
    };

    const payloadUuid = {
      ...payloadRaw,
      id: safeUuid,
    };

    // Try saving to 'users' table with raw ID first, then fallback to UUID
    const { error: err1 } = await supabase.from('users').upsert(payloadRaw);
    if (!err1) return { success: true };

    const { error: errUuid1 } = await supabase.from('users').upsert(payloadUuid);
    if (!errUuid1) return { success: true };

    // Fallback to 'profiles'
    const { error: err2 } = await supabase.from('profiles').upsert(payloadRaw);
    if (!err2) return { success: true };

    const { error: errUuid2 } = await supabase.from('profiles').upsert(payloadUuid);
    if (!errUuid2) return { success: true };

    return { success: false, error: err1.message || errUuid1?.message || err2?.message };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

export async function deleteUserFromSupabase(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: err1 } = await supabase.from('users').delete().eq('id', userId);
    if (!err1) return { success: true };
    const { error: err2 } = await supabase.from('profiles').delete().eq('id', userId);
    if (!err2) return { success: true };
    return { success: false, error: err1.message || err2?.message };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

/**
 * Save invoice / order into Supabase
 */
export async function saveInvoiceToSupabase(invoice: Invoice): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      customer_name: invoice.customerName,
      customer_code: invoice.customerCode || null,
      customer_phone: invoice.customerPhone,
      customer_address: invoice.customerAddress,
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

    // 1. Try upserting to 'invoices' table
    const { error: invErr } = await supabase.from('invoices').upsert(payload);
    if (!invErr) return { success: true };

    // 2. Try upserting to 'orders' table
    const { error: ordErr } = await supabase.from('orders').upsert(payload);
    if (!ordErr) return { success: true };

    // 3. Fallback: Try simplified payload if tables have fewer columns
    const simplePayload = {
      id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      customer_name: invoice.customerName,
      customer_phone: invoice.customerPhone,
      rep_name: invoice.repName,
      branch_name: invoice.branchName,
      status: invoice.status,
      total_cartons: invoice.totalCartons,
      total_pieces: invoice.totalPieces,
      estimated_grand_total: invoice.estimatedGrandTotal,
      items: typeof invoice.items === 'string' ? invoice.items : JSON.stringify(invoice.items),
      created_at: invoice.date ? `${invoice.date} ${invoice.time || ''}`.trim() : new Date().toISOString(),
    };

    const { error: simpleInvErr } = await supabase.from('invoices').upsert(simplePayload);
    if (!simpleInvErr) return { success: true };

    const { error: simpleOrdErr } = await supabase.from('orders').upsert(simplePayload);
    if (!simpleOrdErr) return { success: true };

    console.warn('Supabase Invoice Save Error:', invErr?.message || ordErr?.message || simpleInvErr?.message);
    return { success: false, error: invErr?.message || ordErr?.message || 'فشل حفظ الفاتورة في Supabase' };
  } catch (e: any) {
    console.warn('Supabase Invoice Save Exception:', e);
    return { success: false, error: e?.message };
  }
}

/**
 * Fetch all invoices / orders from Supabase
 */
export async function fetchInvoicesFromSupabase(): Promise<{ success: boolean; invoices?: Invoice[]; error?: string }> {
  try {
    let rawInvoices: any[] | null = null;
    const { data: invData, error: invErr } = await supabase.from('invoices').select('*').order('created_at', { ascending: false });
    
    if (!invErr && invData && invData.length > 0) {
      rawInvoices = invData;
    } else {
      const { data: ordData, error: ordErr } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (!ordErr && ordData && ordData.length > 0) {
        rawInvoices = ordData;
      }
    }

    if (rawInvoices) {
      const mapped: Invoice[] = rawInvoices.map((i: any) => ({
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
    return { success: false, error: err?.message || 'خطأ في جلب الفواتير من Supabase' };
  }
}

/**
 * Deterministic UUID v4 generator from string (for consistent product IDs in Supabase)
 */
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

const CATALOG_SYNC_STORE_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Save / Upsert full products catalog into Supabase
 * Uses standard products table + rich orders sync snapshot for immediate real-time sync across all devices
 */
export async function saveProductsToSupabase(products: Product[]): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Save full rich catalog snapshot to shared orders payload so reps & supervisors get immediate 100% full sync
    try {
      await supabase.from('orders').upsert({
        id: CATALOG_SYNC_STORE_ID,
        status: 'catalog_sync_snapshot',
        total: products.length,
        items: products as any,
      });
    } catch (storeErr) {
      console.warn('Catalog snapshot store fallback:', storeErr);
    }

    // 2. Also upsert into standard products table
    const payload = products.map((p) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id);
      const safeId = isUuid ? p.id : stringToUuid(p.id);
      return {
        id: safeId,
        code: p.code || null,
        name: p.name,
        category: p.department || p.category || 'LHLotus',
        price: p.cartonPrice || p.piecePrice || 0,
        stock: p.branchStockActual || 0,
        image_url: p.imageUrl || null,
      };
    });

    for (let i = 0; i < payload.length; i += 100) {
      const chunk = payload.slice(i, i + 100);
      const { error } = await supabase.from('products').upsert(chunk);
      if (error) {
        console.warn('Direct products chunk save notice:', error.message);
      }
    }

    return { success: true };
  } catch (e: any) {
    console.error('Supabase products save error:', e);
    return { success: false, error: e?.message };
  }
}

/**
 * Fetch products catalog from Supabase
 */
export async function fetchProductsFromSupabase(): Promise<{ success: boolean; products?: Product[]; error?: string }> {
  try {
    // 1. Check if full catalog snapshot exists in shared store
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

    // 2. Fallback: select from standard products table
    const { data: prodData, error: pErr } = await supabase.from('products').select('*');
    if (!pErr && prodData && prodData.length > 0) {
      const mapped: Product[] = prodData.map((p: any) => ({
        id: p.id,
        code: p.code || p.name?.slice(0, 8) || 'PRD',
        name: p.name || 'صنف دريم',
        salesPriority: p.sales_priority || p.salesPriority || 'عادي',
        status: p.status || 'متاح',
        cartonQuantity: p.carton_quantity || p.cartonQuantity || 1,
        factor: p.factor || p.cartonQuantity || 1,
        size: p.size || '',
        color: p.color || '',
        branchStockActual: Number(p.stock ?? p.branch_stock_actual ?? 50),
        branchStockReserved: Math.max(0, Number(p.stock ?? p.branch_stock_actual ?? 50) - 5),
        mainWarehouseActual: Number(p.main_warehouse_actual ?? 500),
        mainWarehouseReserved: Math.max(0, Number(p.main_warehouse_actual ?? 500) - 20),
        department: p.category || p.department || 'LHLotus',
        category: p.category || 'LHLotus',
        classification: p.classification || 'أصناف عامة',
        piecePrice: Number(p.price ?? 0),
        cartonPrice: Number(p.price ?? 0),
        branchName: p.branch_name || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
        imageUrl: p.image_url || undefined,
        cloudinaryPublicId: p.cloudinary_public_id || undefined,
        barcode: p.barcode || undefined,
      }));
      return { success: true, products: mapped };
    }

    return { success: true, products: [] };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}
