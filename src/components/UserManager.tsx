import {
  AlertCircle,
  Building,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  CloudDownload,
  CloudUpload,
  Code,
  Copy,
  Database,
  Edit2,
  Key,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { User, UserApprovalStatus, UserRole } from '../types';

export const UserManager: React.FC = () => {
  const {
    users,
    branches,
    currentUser,
    addUser,
    updateUser,
    deleteUser,
    approveUser,
    rejectUser,
    assignSupervisor,
    getSupervisorsInBranch,
    loginAs,
    supabaseStatus,
    isSupabaseSyncing,
    syncWithSupabase,
  } = useApp();

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showSqlSchemaModal, setShowSqlSchemaModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('الكل');
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const supabaseSqlScript = `-- ==========================================
-- كود إنشاء وتجهيز جداول Supabase السحابية
-- شركة دريم للتجارة والتوزيع (Dream Distribution)
-- ==========================================

-- 1. جدول المستخدمين والصلاحيات (users)
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password TEXT DEFAULT '123',
    role TEXT DEFAULT 'sales_rep',
    branch_name TEXT,
    supervisor_id TEXT,
    phone TEXT,
    commission_rate NUMERIC DEFAULT 2.5,
    is_active BOOLEAN DEFAULT TRUE,
    approval_status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول المنتجات والكتالوج والمخزون (products)
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    sales_priority TEXT DEFAULT 'عادي',
    status TEXT DEFAULT 'متاح',
    carton_quantity NUMERIC DEFAULT 1,
    size TEXT,
    color TEXT,
    branch_stock_actual NUMERIC DEFAULT 0,
    branch_stock_reserved NUMERIC DEFAULT 0,
    main_warehouse_actual NUMERIC DEFAULT 0,
    main_warehouse_reserved NUMERIC DEFAULT 0,
    department TEXT,
    category TEXT,
    classification TEXT,
    piece_price NUMERIC DEFAULT 0,
    carton_price NUMERIC DEFAULT 0,
    promo_price NUMERIC,
    branch_name TEXT,
    image_url TEXT,
    cloudinary_public_id TEXT,
    barcode TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول الفواتير والطلبيات (invoices)
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_code TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    customer_tax_number TEXT,
    rep_id TEXT,
    rep_name TEXT,
    supervisor_name TEXT,
    branch_name TEXT,
    status TEXT DEFAULT 'قيد مراجعة المشرف',
    payment_method TEXT DEFAULT 'نقدي (كاش)',
    total_cartons NUMERIC DEFAULT 0,
    total_pieces NUMERIC DEFAULT 0,
    subtotal NUMERIC DEFAULT 0,
    discount_percentage NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    estimated_grand_total NUMERIC DEFAULT 0,
    notes TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    synced_to_accounting BOOLEAN DEFAULT FALSE,
    has_shortage_split BOOLEAN DEFAULT FALSE,
    shortage_invoice_number TEXT,
    is_shortage_invoice BOOLEAN DEFAULT FALSE,
    parent_invoice_id TEXT,
    parent_invoice_number TEXT,
    qr_payload TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول العملاء (customers)
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    branch_name TEXT,
    rep_name TEXT,
    rep_id TEXT,
    tax_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- تفعيل التحديث اللحظي (Realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;`;

  const isSuperAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const handleSyncSupabase = async (direction: 'fetch' | 'push' | 'both') => {
    setSyncFeedback(null);
    const res = await syncWithSupabase(direction);
    setSyncFeedback(res.message);
    setTimeout(() => {
      setSyncFeedback(null);
    }, 6000);
  };

  // Approval modal state
  const [approvingUser, setApprovingUser] = useState<User | null>(null);
  const [approvalSupervisorId, setApprovalSupervisorId] = useState<string>('');
  const [approvalBranchName, setApprovalBranchName] = useState<string>('');
  const [approvalRole, setApprovalRole] = useState<UserRole>('sales_rep');

  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    username: '',
    email: '',
    password: '123',
    role: 'sales_rep',
    branchName: 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
    supervisorId: '',
    phone: '',
    commissionRate: 2.5,
    isActive: true,
    approvalStatus: 'active',
  });

  const roleConfigs: Record<UserRole, { label: string; bg: string; text: string; desc: string }> = {
    developer: {
      label: 'المطور التقني (Developer)',
      bg: 'bg-amber-100 border-amber-300',
      text: 'text-amber-800',
      desc: 'صلاحيات تقنية وإدارية كاملة: إدارة قاعدة البيانات Supabase، استعلامات SQL، النسخ الاحتياطي، وإدارة المنظومة بالكامل.'
    },
    admin: {
      label: 'المطور التقني والإداري (Developer Admin)',
      bg: 'bg-rose-100 border-rose-300',
      text: 'text-rose-800',
      desc: 'صلاحيات مطلقة: إنشاء وتعديل المستخدمين، رفع شيتات الإكسل، إدارة ربط Cloudinary، والاطلاع على كل الفروع والفواتير ومزامنة الحسابات.'
    },
    branch_manager: {
      label: 'مشرف الفرع (Branch Supervisor)',
      bg: 'bg-purple-100 border-purple-300',
      text: 'text-purple-800',
      desc: 'إدارة مخزون الفرع والطلبيات الواردة من المناديب، اعتماد الفواتير، ومتابعة مبيعات الفرع وطلب تحويلات المخزون من أكتوبر.'
    },
    supervisor: {
      label: 'مشرف قطاع المناديب (Sales Supervisor)',
      bg: 'bg-blue-100 border-blue-300',
      text: 'text-blue-800',
      desc: 'متابعة فريق المناديب المخصصين له فقط، مراقبة أداء الفواتير وإجمالي المبالغ وعدد الكراتين الصادرة لمجموعته لحظياً.'
    },
    sales_rep: {
      label: 'مندوب مبيعات (Field Sales Rep)',
      bg: 'bg-emerald-100 border-emerald-300',
      text: 'text-emerald-800',
      desc: 'سرية تامة: يرى فقط مخزون فرعه والمخزن المركزي، ولا يرى إلا فواتيره وعملاءه فقط. إنشاء الفواتير وإرسالها بالواتساب والإكسل.'
    }
  };

  // Pending users waiting for approval
  const pendingUsers = users.filter((u) => u.approvalStatus === 'pending_approval');

  // Active users filtered
  const activeUsers = users.filter((u) => {
    if (u.approvalStatus === 'pending_approval') return false;
    if (selectedBranchFilter !== 'الكل' && u.branchName !== selectedBranchFilter) return false;
    return true;
  });

  const handleOpenApproveModal = (user: User) => {
    setApprovingUser(user);
    setApprovalBranchName(user.branchName || branches[0]?.name || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)');
    setApprovalRole(user.role || 'sales_rep');
    setApprovalSupervisorId(user.supervisorId || '');
  };

  const handleConfirmApproval = () => {
    if (!approvingUser || !isSuperAdminOrDev) return;
    approveUser(approvingUser.id, approvalSupervisorId || undefined, approvalBranchName, approvalRole);
    setApprovingUser(null);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username || !isSuperAdminOrDev) return;

    if (editingUser) {
      updateUser({ ...editingUser, ...formData } as User);
      setEditingUser(null);
    } else {
      const newUser: User = {
        id: `u-${Date.now()}`,
        name: formData.name || '',
        username: formData.username || '',
        email: formData.email || `${formData.username}@dream-dist.com`,
        password: formData.password || '123',
        role: formData.role || 'sales_rep',
        branchName: formData.branchName || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
        supervisorId: formData.role === 'sales_rep' ? (formData.supervisorId || undefined) : undefined,
        phone: formData.phone || '',
        avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80`,
        commissionRate: formData.commissionRate || 2.5,
        isActive: true,
        approvalStatus: 'active',
      };
      addUser(newUser);
    }

    setShowAddUserModal(false);
  };

  return (
    <div className="space-y-6 pb-16">
      
      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-black">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">إدارة المستخدمين والصلاحيات وهيكل الإشراف</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                تفعيل حسابات المناديب والمشرفين • تقسيم المناديب على المشرفين في كل فرع • سرية تامة للبيانات
              </p>
            </div>
          </div>

          {isSuperAdminOrDev ? (
            <button
              onClick={() => {
                setEditingUser(null);
                setFormData({
                  name: '',
                  username: '',
                  email: '',
                  password: '123',
                  role: 'sales_rep',
                  branchName: 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
                  supervisorId: '',
                  phone: '',
                  commissionRate: 2.5,
                  isActive: true,
                  approvalStatus: 'active',
                });
                setShowAddUserModal(true);
              }}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs shadow-md transition transform active:scale-95 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>إنشاء حساب جديد (صلاحية الإدارة والمطور)</span>
            </button>
          ) : (
            <div className="bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600" />
              <span>إضافة وتعديل المستخدمين مقتصرة على المطور والمدير العام (Admin) فقط</span>
            </div>
          )}
        </div>
      </div>

      {/* Supabase Database Connection & Cloud Sync Card */}
      <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-950 text-white rounded-3xl p-5 shadow-lg border border-emerald-500/30 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm">قاعدة بيانات Supabase السحابية الرسمية</span>
                <span className="bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>متصل ومربوط بنجاح ⚡</span>
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/80 font-mono pt-0.5">
                rxthpgmlcsfckstpqhqf.supabase.co • قاعدة بيانات شركة دريم الموحدة (أصناف + فواتير + مستخدمين + عملاء)
              </p>
            </div>
          </div>

          {/* Sync Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowSqlSchemaModal(true)}
              className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
              title="عرض ونسخ كود SQL لإنشاء وتجهيز الجداول في Supabase"
            >
              <Code className="w-3.5 h-3.5" />
              <span>كود SQL لإنشاء الجداول 📋</span>
            </button>
            <button
              onClick={() => handleSyncSupabase('fetch')}
              disabled={isSupabaseSyncing}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSupabaseSyncing ? 'animate-spin' : ''}`} />
              <span>جلب ومزامنة اليوزرات</span>
            </button>
            <button
              onClick={() => handleSyncSupabase('push')}
              disabled={isSupabaseSyncing}
              className="bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              <span>رفع الحسابات لـ Supabase</span>
            </button>
          </div>
        </div>

        {/* Sync Toast Feedback */}
        {syncFeedback && (
          <div className="bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
        )}
      </div>

      {/* PENDING APPROVALS SECTION (Requests from login/register page) */}
      {pendingUsers.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent rounded-3xl p-5 border-2 border-amber-500/30 shadow-sm space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping"></span>
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>طلبات تسجيل الحسابات الجديدة بانتظار تفعيل الإدارة ({pendingUsers.length})</span>
              </h3>
            </div>
            <span className="text-xs text-amber-800 font-bold bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300">
              تفعيل مباشر بدون تأكيد بريد
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {pendingUsers.map((pUser) => {
              const branchSupervisors = getSupervisorsInBranch(pUser.branchName);
              return (
                <div
                  key={pUser.id}
                  className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-black text-sm text-slate-900">{pUser.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">@{pUser.username} • {pUser.email}</div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                        {pUser.role === 'supervisor' ? 'مشرف' : pUser.role === 'branch_manager' ? 'مدير فرع' : 'مندوب'}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-slate-600 space-y-1 bg-slate-50 p-2 rounded-xl">
                      <div className="flex justify-between">
                        <span className="text-slate-400">الفرع المطلوب:</span>
                        <span className="font-bold text-slate-800">{pUser.branchName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">الهاتف:</span>
                        <span className="font-mono text-slate-800">{pUser.phone}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">تاريخ الطلب:</span>
                        <span>{pUser.registrationDate || 'اليوم'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleOpenApproveModal(pUser)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs transition flex items-center justify-center gap-1 shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>تفعيل وتخصيص المشرف</span>
                    </button>
                    <button
                      onClick={() => rejectUser(pUser.id)}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold p-2 rounded-xl text-xs transition border border-rose-200"
                      title="رفض الطلب"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Role Hierarchy Matrix Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(roleConfigs) as UserRole[]).map((roleKey) => {
          const cfg = roleConfigs[roleKey] || {
            label: roleKey,
            bg: 'bg-slate-100 border-slate-300',
            text: 'text-slate-800',
            desc: ''
          };
          const count = users.filter((u) => u.role === roleKey && u.approvalStatus === 'active').length;

          return (
            <div key={roleKey} className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-black px-2 py-0.5 rounded-md border ${cfg.bg} ${cfg.text}`}>
                    {cfg.label.split('(')[0]}
                  </span>
                  <span className="font-extrabold text-xs text-slate-900">{count} مستخدم</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  {cfg.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Users List Table with Supervisor & Branch Assignment */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-700" />
            <span>المستخدمين والمناديب المفعلين في المنظومة ({activeUsers.length})</span>
          </h3>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-bold">تصفية الفرع:</span>
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none"
            >
              <option value="الكل">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-900 text-white font-bold">
              <tr>
                <th className="p-3.5">المستخدم</th>
                <th className="p-3.5">اسم الدخول / البريد</th>
                <th className="p-3.5">الدور والصلاحية</th>
                <th className="p-3.5">الفرع المرتبط</th>
                <th className="p-3.5">المشرف المباشر</th>
                <th className="p-3.5">الهاتف</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeUsers.map((user) => {
                const cfg = roleConfigs[user.role] || {
                  label: user.role || 'مندوب مبيعات',
                  bg: 'bg-emerald-100 border-emerald-300',
                  text: 'text-emerald-800',
                  desc: ''
                };
                const isCurrent = currentUser?.id === user.id;
                const branchSupervisors = getSupervisorsInBranch(user.branchName);

                return (
                  <tr key={user.id} className={`hover:bg-amber-50/30 transition ${isCurrent ? 'bg-amber-50/60 font-medium' : ''}`}>
                    
                    {/* Name & Avatar */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={user.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&auto=format&fit=crop&q=80'}
                          alt={user.name}
                          className="w-8 h-8 rounded-full object-cover border border-slate-300"
                        />
                        <div>
                          <div className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                            <span>{user.name}</span>
                            {isCurrent && (
                              <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded">
                                أنت
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Username & Email */}
                    <td className="p-3.5">
                      <div className="font-bold text-slate-800 font-mono">{user.username}</div>
                      <div className="text-[10px] text-slate-400">{user.email}</div>
                    </td>

                    {/* Role Badge */}
                    <td className="p-3.5">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-black border ${cfg.bg} ${cfg.text}`}>
                        {cfg.label.split('(')[0]}
                      </span>
                    </td>

                    {/* Branch */}
                    <td className="p-3.5 font-bold text-slate-800">
                      {user.branchName}
                    </td>

                    {/* Supervisor Assignment Dropdown */}
                    <td className="p-3.5">
                      {user.role === 'sales_rep' ? (
                        <select
                          value={user.supervisorId || ''}
                          onChange={(e) => assignSupervisor(user.id, e.target.value)}
                          className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">-- بدون مشرف محدد --</option>
                          {branchSupervisors.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : user.role === 'supervisor' ? (
                        <span className="text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded">
                          مشرف فرع ({users.filter((u) => u.supervisorId === user.id).length} مناديب)
                        </span>
                      ) : (
                        <span className="text-slate-400">---</span>
                      )}
                    </td>

                    {/* Phone */}
                    <td className="p-3.5 text-slate-600 font-mono">
                      {user.phone || '---'}
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        
                        {/* Switch account for testing */}
                        <button
                          onClick={() => loginAs(user.id)}
                          className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                            isCurrent
                              ? 'bg-amber-500 text-slate-950 font-black'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                          title="تجربة بيئة وصلاحيات هذا المستخدم"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{isCurrent ? 'الحالي' : 'تجربة'}</span>
                        </button>

                        {/* Edit (Admin & Dev only) */}
                        {isSuperAdminOrDev && (
                          <button
                            onClick={() => {
                              setEditingUser(user);
                              setFormData(user);
                              setShowAddUserModal(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                            title="تعديل المستخدم (صلاحية الإدارة والمطور)"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete (Admin & Dev only, if not self) */}
                        {isSuperAdminOrDev && !isCurrent && (
                          <button
                            onClick={() => {
                              if (window.confirm(`هل أنت متأكد من حذف المستخدم "${user.name}"؟`)) {
                                deleteUser(user.id);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                            title="حذف المستخدم"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* APPROVAL & SUPERVISOR ASSIGNMENT MODAL */}
      {approvingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>تفعيل حساب وتخصيص المشرف والفرع</span>
              </h3>
              <button onClick={() => setApprovingUser(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl text-xs space-y-1">
              <div className="font-bold text-slate-900 text-sm">{approvingUser.name}</div>
              <div className="text-slate-500 font-mono">@{approvingUser.username} • {approvingUser.email}</div>
              <div className="text-slate-500">الهاتف: {approvingUser.phone}</div>
            </div>

            <div className="space-y-3 text-xs">
              {/* Branch */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">الفرع المخصص</label>
                <select
                  value={approvalBranchName}
                  onChange={(e) => setApprovalBranchName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Role */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">الدور والصلاحية</label>
                <select
                  value={approvalRole}
                  onChange={(e) => setApprovalRole(e.target.value as UserRole)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="sales_rep">مندوب مبيعات وتوزيع</option>
                  <option value="supervisor">مشرف قطاع المناديب</option>
                  <option value="branch_manager">مشرف الفرع والمخزن</option>
                  <option value="developer">المطور التقني (Developer)</option>
                  <option value="admin">المطور والمسؤول التقني (Admin)</option>
                </select>
              </div>

              {/* Supervisor selection for Reps */}
              {approvalRole === 'sales_rep' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    تعيين المشرف المباشر (لتقسيم المناديب في الفرع)
                  </label>
                  <select
                    value={approvalSupervisorId}
                    onChange={(e) => setApprovalSupervisorId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="">بدون مشرف مباشر (عام على الفرع)</option>
                    {getSupervisorsInBranch(approvalBranchName).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.branchName})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setApprovingUser(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmApproval}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow text-xs flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>اعتماد وتفعيل الحساب فوراً</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-base text-slate-900">
                {editingUser ? 'تعديل بيانات المستخدم' : 'إنشاء حساب جديد لمنظومة دريم'}
              </h3>
              <button onClick={() => setShowAddUserModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">الاسم بالكامل *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: أحمد سامي الشناوي"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم المستخدم (Login) *</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="rep_ahmed"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">كلمة المرور</label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="123"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">البريد الإلكتروني الرسمي (@dream.com)</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="osama@dream.com"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="010XXXXXXXX"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الدور والصلاحية *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="sales_rep">مندوب مبيعات وتوزيع</option>
                    <option value="supervisor">مشرف قطاع المناديب</option>
                    <option value="branch_manager">مشرف الفرع والمخزن</option>
                    <option value="developer">المطور التقني (Developer)</option>
                    <option value="admin">المطور والمسؤول التقني (Admin كامل)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الفرع المرتبط به *</label>
                  <select
                    value={formData.branchName}
                    onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* If sales rep, supervisor selector */}
              {formData.role === 'sales_rep' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المشرف المباشر للمندوب</label>
                  <select
                    value={formData.supervisorId || ''}
                    onChange={(e) => setFormData({ ...formData, supervisorId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="">بدون مشرف (عام)</option>
                    {getSupervisorsInBranch(formData.branchName).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black shadow"
                >
                  حفظ المستخدم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SQL Schema Preview & Copy Modal */}
      {showSqlSchemaModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-slate-900 text-white rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-800 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
                  <Code className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-100">كود SQL لإنشاء جداول Supabase</h3>
                  <p className="text-[11px] text-slate-400">انسخ الكود وشغله في محرر SQL بـ Supabase بضغطة واحدة</p>
                </div>
              </div>
              <button onClick={() => setShowSqlSchemaModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex-1 overflow-y-auto font-mono text-xs text-emerald-400 dir-ltr text-left select-all">
              <pre className="whitespace-pre-wrap">{supabaseSqlScript}</pre>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                الجداول: users, products, invoices, customers
              </span>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(supabaseSqlScript);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 2500);
                  } catch (e) {}
                }}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
              >
                {copiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSql ? 'تم النسخ بنجاح! ✅' : 'نسخ كود SQL بالكامل 📋'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
