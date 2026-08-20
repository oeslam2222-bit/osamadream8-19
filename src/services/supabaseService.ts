import { createClient } from '@supabase/supabase-js';
import { Branch, Invoice, Product, User, UserRole } from '../types';

export const SUPABASE_URL = 'https://kjdpayvavaarlcochzgt.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZHBheXZhdmFhcmxjb2Noemd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4OTg2MDIsImV4cCI6MjA4NTQ3NDYwMn0.Y6Vmn7zJZrdzVZMGupPTzDPdCh7yJmdzTbea_CRLM-g';

// Helper to normalize Supabase role strings to supported UserRole
export function normalizeUserRole(rawRole: any, isAdminFlag?: boolean): UserRole {
  if (isAdminFlag) return 'admin';
  if (!rawRole) return 'sales_rep';
  const r = String(rawRole).toLowerCase().trim();
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
  lastSyncTime?: string;
  error?: string;
}

/**
 * Test connectivity with Supabase project and check available tables
 */
export async function testSupabaseConnection(): Promise<SupabaseSyncStatus> {
  try {
    // Try fetching from users or profiles or products table
    let foundTable = '';
    let usersCount = 0;
    let productsCount = 0;
    let invoicesCount = 0;

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

    return {
      connected: true,
      tableFound: foundTable.trim() || 'متصل بنجاح بقاعدة البيانات',
      usersCount,
      productsCount,
      invoicesCount,
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
 * Fetch all users from Supabase (checking 'users' or 'profiles' or 'app_users')
 */
export async function fetchUsersFromSupabase(): Promise<{ success: boolean; users?: User[]; error?: string }> {
  try {
    // Try 'users'
    const { data: usersData, error: uErr } = await supabase.from('users').select('*');
    if (!uErr && usersData && usersData.length > 0) {
      const mapped: User[] = usersData.map((u: any, idx: number) => ({
        id: u.id || `sup-u-${idx + 1}`,
        name: u.name || u.full_name || u.username || 'مستخدم',
        username: u.username || u.email?.split('@')[0] || `user_${idx + 1}`,
        email: u.email || '',
        password: u.password || '123',
        role: normalizeUserRole(u.role, u.is_admin),
        branchName: u.branch_name || u.branchName || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
        supervisorId: u.supervisor_id || u.supervisorId,
        phone: u.phone || u.mobile || '',
        commissionRate: u.commission_rate || u.commissionRate || 2.5,
        isActive: u.is_active !== undefined ? u.is_active : true,
        approvalStatus: u.approval_status || u.approvalStatus || 'active',
        createdAt: u.created_at || u.createdAt || new Date().toISOString(),
      }));
      return { success: true, users: mapped };
    }

    // Try 'profiles'
    const { data: profData, error: pErr } = await supabase.from('profiles').select('*');
    if (!pErr && profData && profData.length > 0) {
      const mapped: User[] = profData.map((u: any, idx: number) => ({
        id: u.id || `sup-p-${idx + 1}`,
        name: u.name || u.full_name || u.username || 'مستخدم',
        username: u.username || u.email?.split('@')[0] || `user_${idx + 1}`,
        email: u.email || '',
        password: u.password || '123',
        role: normalizeUserRole(u.role, u.is_admin),
        branchName: u.branch_name || u.branchName || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
        supervisorId: u.supervisor_id || u.supervisorId,
        phone: u.phone || u.mobile || '',
        commissionRate: u.commission_rate || u.commissionRate || 2.5,
        isActive: u.is_active !== undefined ? u.is_active : true,
        approvalStatus: u.approval_status || u.approvalStatus || 'active',
        createdAt: u.created_at || u.createdAt || new Date().toISOString(),
      }));
      return { success: true, users: mapped };
    }

    return { success: false, error: 'لم يتم العثور على سجلات في جدول users أو profiles' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'خطأ في جلب المستخدمين من Supabase' };
  }
}

/**
 * Upsert / Save user into Supabase
 */
export async function saveUserToSupabase(user: User): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      password: user.password,
      role: user.role,
      branch_name: user.branchName,
      supervisor_id: user.supervisorId || null,
      phone: user.phone || '',
      commission_rate: user.commissionRate || 2.5,
      is_active: user.isActive,
      approval_status: user.approvalStatus,
      updated_at: new Date().toISOString(),
    };

    // Try saving to 'users' table
    const { error: err1 } = await supabase.from('users').upsert(payload);
    if (!err1) return { success: true };

    // Fallback to 'profiles'
    const { error: err2 } = await supabase.from('profiles').upsert(payload);
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
      customer_phone: invoice.customerPhone,
      customer_address: invoice.customerAddress,
      rep_id: invoice.repId,
      rep_name: invoice.repName,
      supervisor_name: invoice.supervisorName,
      branch_name: invoice.branchName,
      status: invoice.status,
      payment_method: invoice.paymentMethod,
      total_cartons: invoice.totalCartons,
      total_pieces: invoice.totalPieces,
      estimated_grand_total: invoice.estimatedGrandTotal,
      discount_amount: invoice.discountAmount,
      items: invoice.items,
      created_at: invoice.date ? `${invoice.date} ${invoice.time || ''}`.trim() : new Date().toISOString(),
    };

    const { error } = await supabase.from('invoices').upsert(payload);
    if (error) {
      // Also try 'orders'
      const { error: ordErr } = await supabase.from('orders').upsert(payload);
      if (ordErr) return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}
