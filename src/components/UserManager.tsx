import {
  AlertCircle,
  Building,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cloud,
  CloudDownload,
  CloudUpload,
  Code,
  Copy,
  Database,
  Edit2,
  Eye,
  EyeOff,
  Key,
  Lock,
  Percent,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  Wrench,
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
  const [copiedCredentials, setCopiedCredentials] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('الكل');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('الكل');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const isSuperAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  // Role metadata with updated clean titles requested by the user
  const roleConfigs: Record<UserRole, {
    label: string;
    shortLabel: string;
    bg: string;
    border: string;
    text: string;
    activeRing: string;
    icon: any;
    desc: string;
  }> = {
    admin: {
      label: 'الآدمن (الإدارة العامة)',
      shortLabel: 'الآدمن',
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      text: 'text-rose-800',
      activeRing: 'ring-rose-500 border-rose-500 bg-rose-50/50',
      icon: ShieldAlert,
      desc: 'صلاحيات الإدارة والرقابة الشاملة: إدارة الموظفين، اعتماد الحسابات، مراجعة فروع الشركة والمخازن، ورفع كشوفات الإكسل.'
    },
    developer: {
      label: 'المطور (الدعم التقني)',
      shortLabel: 'المطور',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-800',
      activeRing: 'ring-amber-500 border-amber-500 bg-amber-50/50',
      icon: Code,
      desc: 'صلاحيات الدعم والبرمجة: الربط السحابي مع Supabase، فحص ومزامنة البيانات، وصيانة وتطوير ميزات المنظومة.'
    },
    branch_manager: {
      label: 'مدير الفرع',
      shortLabel: 'مدير الفرع',
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      text: 'text-purple-800',
      activeRing: 'ring-purple-500 border-purple-500 bg-purple-50/50',
      icon: Building,
      desc: 'إدارة مستودع الفرع، متابعة حركات المخزون، اعتماد وتجهيز طلبيات المناديب الصادرة من مخزن الفرع.'
    },
    supervisor: {
      label: 'مشرف المناديب',
      shortLabel: 'مشرف المناديب',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      activeRing: 'ring-blue-500 border-blue-500 bg-blue-50/50',
      icon: UserCheck,
      desc: 'الإشراف الميداني على المناديب التابعين له بالفرع، مراجعة وتدقيق الفواتير، ومتابعة المستهدفات وعدد الكراتين.'
    },
    sales_rep: {
      label: 'المندوب',
      shortLabel: 'المندوب',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-800',
      activeRing: 'ring-emerald-500 border-emerald-500 bg-emerald-50/50',
      icon: Smartphone,
      desc: 'مندوب المبيعات الميداني: إنشاء الفواتير وإرسالها بالواتساب، ومتابعة عملاء خط السير ومخزون الفرع.'
    }
  };

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
    password TEXT,
    role TEXT DEFAULT 'sales_rep',
    branch_name TEXT,
    supervisor_id TEXT,
    phone TEXT,
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

  const handleSyncSupabase = async (direction: 'fetch' | 'push' | 'both') => {
    setSyncFeedback(null);
    const res = await syncWithSupabase(direction);
    setSyncFeedback(res.message);
    setTimeout(() => {
      setSyncFeedback(null), 6000;
    });
  };

  // Form State
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'sales_rep',
    branchName: 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
    supervisorId: '',
    phone: '',
    commissionRate: 2.5,
    isActive: true,
    approvalStatus: 'active',
  });

  // Approval modal state
  const [approvingUser, setApprovingUser] = useState<User | null>(null);
  const [approvalSupervisorId, setApprovalSupervisorId] = useState<string>('');
  const [approvalBranchName, setApprovalBranchName] = useState<string>('');
  const [approvalRole, setApprovalRole] = useState<UserRole>('sales_rep');

  // Pending users waiting for approval
  const pendingUsers = users.filter((u) => u.approvalStatus === 'pending_approval');

  // Active users filtered
  const activeUsers = users.filter((u) => {
    if (u.approvalStatus === 'pending_approval') return false;
    if (selectedBranchFilter !== 'الكل' && u.branchName !== selectedBranchFilter) return false;
    if (selectedRoleFilter !== 'الكل' && u.role !== selectedRoleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchName = u.name.toLowerCase().includes(q);
      const matchUser = u.username.toLowerCase().includes(q);
      const matchPhone = (u.phone || '').includes(q);
      const matchEmail = (u.email || '').toLowerCase().includes(q);
      if (!matchName && !matchUser && !matchPhone && !matchEmail) return false;
    }
    return true;
  });

  const handleOpenApproveModal = (user: User) => {
    setApprovingUser(user);
    setApprovalBranchName(user.branchName || branches[0]?.name || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)');
    setApprovalRole(user.role || 'sales_rep');
    setApprovalSupervisorId(user.supervisorId || '');
  };

  const handleConfirmApproval = () => {
    if (!approvingUser || !isSuperAdminOrDev) return;
    approveUser(approvingUser.id, approvalSupervisorId || undefined, approvalBranchName, approvalRole);
    setApprovingUser(null);
  };

  // Smart Auto-Generator for Username & Email based on name
  const handleAutoGenerateCredentials = (fullName: string, role: UserRole = formData.role || 'sales_rep') => {
    if (!fullName.trim()) return;

    // Convert Arabic or English name to slug
    const cleaned = fullName
      .trim()
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF]/g, '')
      .split(/\s+/)
      .slice(0, 2);

    let prefix = 'rep';
    if (role === 'admin') prefix = 'admin';
    else if (role === 'developer') prefix = 'dev';
    else if (role === 'branch_manager') prefix = 'mgr';
    else if (role === 'supervisor') prefix = 'sup';

    let suggestedUsername = '';
    if (/^[a-zA-Z0-9_]+$/.test(cleaned.join(''))) {
      suggestedUsername = `${prefix}_${cleaned.join('_')}`;
    } else {
      // Romanize or numeric deterministic hash
      const hash = Math.floor(1000 + Math.random() * 9000);
      suggestedUsername = `${prefix}_${cleaned[0] || 'user'}_${hash}`;
    }

    const suggestedEmail = `${suggestedUsername.replace(/[^a-zA-Z0-9_]/g, '')}@dream-dist.com`;

    setFormData((prev) => ({
      ...prev,
      username: suggestedUsername,
      email: suggestedEmail,
    }));
  };

  const handleOpenAddModal = () => {
    setEditingUser(null);
    setShowPassword(false);
    setFormData({
      name: '',
      username: '',
      email: '',
      password: '',
      role: 'sales_rep',
      branchName: branches[0]?.name || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
      supervisorId: '',
      phone: '',
      commissionRate: 2.5,
      isActive: true,
      approvalStatus: 'active',
    });
    setShowAddUserModal(true);
  };

  const handleOpenEditModal = (user: User) => {
    setEditingUser(user);
    setShowPassword(false);
    setFormData({
      ...user,
      password: user.password || '',
      commissionRate: user.commissionRate || 2.5,
    });
    setShowAddUserModal(true);
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
        username: (formData.username || '').trim().toLowerCase(),
        email: formData.email || `${formData.username}@dream-dist.com`,
        password: formData.password || '',
        role: formData.role || 'sales_rep',
        branchName: formData.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
        supervisorId: formData.role === 'sales_rep' ? (formData.supervisorId || undefined) : undefined,
        phone: formData.phone || '',
        avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80`,
        commissionRate: formData.commissionRate || 2.5,
        isActive: formData.isActive ?? true,
        approvalStatus: 'active',
      };
      addUser(newUser);
    }

    setShowAddUserModal(false);
  };

  const handleCopyUserCredentials = (user: User) => {
    const credText = `بيانات الدخول لمنظومة شركة دريم:
الاسم: ${user.name}
الصفة: ${roleConfigs[user.role]?.label || user.role}
الفرع: ${user.branchName}
اسم المستخدم: ${user.username}
كلمة المرور: ${user.password || '(كلمة المرور الخاصة بالمستخدم)'}
رابط التطبيق: ${window.location.origin}`;

    navigator.clipboard.writeText(credText);
    setCopiedCredentials(user.id);
    setTimeout(() => setCopiedCredentials(null), 3000);
  };

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto px-2 sm:px-4">
      
      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-xs border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-900 border border-amber-500/30 flex items-center justify-center font-black shrink-0">
              <ShieldCheck className="w-6 h-6 text-amber-700" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-900">
                  إدارة الموظفين والصلاحيات والهيكل الإداري
                </h2>
                <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-slate-200">
                  {users.length} موظف مسجل
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                إضافة المناديب والمشرفين • توزيع المناديب على المشرفين في كل فرع • سرية تامة وتحديد الصلاحيات
              </p>
            </div>
          </div>

          {isSuperAdminOrDev ? (
            <button
              onClick={handleOpenAddModal}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black px-5 py-3 rounded-2xl text-xs sm:text-sm shadow-md transition transform active:scale-95 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة موظف جديد +</span>
            </button>
          ) : (
            <div className="bg-amber-50 text-amber-800 border border-amber-200 px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>إضافة وتعديل الموظفين مقتصرة على الآدمن والمطور فقط</span>
            </div>
          )}
        </div>
      </div>

      {/* Supabase Database Connection & Cloud Sync Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white rounded-3xl p-5 shadow-lg border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-slate-100">قاعدة بيانات Supabase السحابية الموحدة</span>
                <span className="bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>متصل لحظياً</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono pt-1">
                rxthpgmlcsfckstpqhqf.supabase.co • جداول الموظفين، الفواتير، الأصناف، والعملاء
              </p>
            </div>
          </div>

          {/* Sync Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowSqlSchemaModal(true)}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              title="عرض ونسخ كود SQL لإنشاء وتجهيز الجداول في Supabase"
            >
              <Code className="w-3.5 h-3.5 text-amber-400" />
              <span>كود SQL للجداول 📋</span>
            </button>
            <button
              onClick={() => handleSyncSupabase('fetch')}
              disabled={isSupabaseSyncing}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSupabaseSyncing ? 'animate-spin' : ''}`} />
              <span>مزامنة الموظفين من السحابة</span>
            </button>
            <button
              onClick={() => handleSyncSupabase('push')}
              disabled={isSupabaseSyncing}
              className="bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              <span>حفظ التعديلات بالسحابة</span>
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

      {/* PENDING APPROVALS SECTION (Requests from register page) */}
      {pendingUsers.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent rounded-3xl p-5 border-2 border-amber-500/30 shadow-xs space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping"></span>
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>طلبات تسجيل الحسابات بانتظار تفعيل الإدارة ({pendingUsers.length})</span>
              </h3>
            </div>
            <span className="text-xs text-amber-800 font-bold bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300">
              تفعيل واعتماد مباشر
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {pendingUsers.map((pUser) => {
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
                        {roleConfigs[pUser.role]?.shortLabel || pUser.role}
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
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleOpenApproveModal(pUser)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs transition flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>اعتماد وتخصيص المشرف</span>
                    </button>
                    <button
                      onClick={() => rejectUser(pUser.id)}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold p-2 rounded-xl text-xs transition border border-rose-200 cursor-pointer"
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

      {/* 5 Official Roles Matrix Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {(Object.keys(roleConfigs) as UserRole[]).map((roleKey) => {
          const cfg = roleConfigs[roleKey];
          const count = users.filter((u) => u.role === roleKey && u.approvalStatus === 'active').length;
          const RoleIcon = cfg.icon;

          return (
            <div
              key={roleKey}
              onClick={() => setSelectedRoleFilter(selectedRoleFilter === roleKey ? 'الكل' : roleKey)}
              className={`bg-white rounded-3xl p-4 border transition-all cursor-pointer shadow-xs flex flex-col justify-between ${
                selectedRoleFilter === roleKey
                  ? 'border-slate-900 ring-2 ring-slate-900 bg-slate-50/70'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className={`w-8 h-8 rounded-xl ${cfg.bg} ${cfg.border} border flex items-center justify-center`}>
                    <RoleIcon className={`w-4 h-4 ${cfg.text}`} />
                  </div>
                  <span className="font-black text-sm text-slate-900">{count} موظف</span>
                </div>
                <div className="mt-2.5 font-black text-xs text-slate-900">{cfg.label}</div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">
                  {cfg.desc}
                </p>
              </div>

              <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-bold">
                <span>{selectedRoleFilter === roleKey ? 'تصفية مفعلة ✓' : 'انقر للتصفية'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Employees Directory: Filter Bar + Card / Table Views */}
      <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden">
        
        {/* Top Control Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-700" />
              <h3 className="font-black text-sm sm:text-base text-slate-900">
                قائمة الموظفين المفعلين في المنظومة
              </h3>
              <span className="bg-amber-100 text-amber-900 text-xs font-black px-2.5 py-0.5 rounded-full">
                {activeUsers.length}
              </span>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Branch Filter */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
                <span className="text-slate-400 font-bold">الفرع:</span>
                <select
                  value={selectedBranchFilter}
                  onChange={(e) => setSelectedBranchFilter(e.target.value)}
                  className="bg-transparent font-black text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="الكل">جميع الفروع ({branches.length})</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Role Filter */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
                <span className="text-slate-400 font-bold">الصلاحية:</span>
                <select
                  value={selectedRoleFilter}
                  onChange={(e) => setSelectedRoleFilter(e.target.value)}
                  className="bg-transparent font-black text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="الكل">كل الصلاحيات</option>
                  <option value="admin">الآدمن (الإدارة العامة)</option>
                  <option value="developer">المطور (الدعم التقني)</option>
                  <option value="branch_manager">مدير الفرع</option>
                  <option value="supervisor">مشرف المناديب</option>
                  <option value="sales_rep">المندوب</option>
                </select>
              </div>
            </div>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم، اسم المستخدم، رقم الهاتف، أو البريد..."
              className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs focus:ring-2 focus:ring-amber-400 focus:bg-white transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                مسح
              </button>
            )}
          </div>
        </div>

        {/* 1. Mobile Cards View (Hidden on Tablet / Desktop) */}
        <div className="block sm:hidden divide-y divide-slate-100">
          {activeUsers.map((user) => {
            const cfg = roleConfigs[user.role] || roleConfigs.sales_rep;
            const isCurrent = currentUser?.id === user.id;
            const branchSupervisors = getSupervisorsInBranch(user.branchName);
            const RoleIcon = cfg.icon;

            return (
              <div key={user.id} className={`p-4 space-y-3 ${isCurrent ? 'bg-amber-50/40' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                        <span>{user.name}</span>
                        {isCurrent && (
                          <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded">
                            أنت
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">@{user.username}</div>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black border ${cfg.bg} ${cfg.border} ${cfg.text} flex items-center gap-1`}>
                    <RoleIcon className="w-3 h-3" />
                    <span>{cfg.label}</span>
                  </span>
                </div>

                {/* Details Grid */}
                <div className="bg-slate-50 p-2.5 rounded-2xl text-xs space-y-1.5 border border-slate-100">
                  <div className="flex justify-between">
                    <span className="text-slate-400">الفرع:</span>
                    <span className="font-bold text-slate-800">{user.branchName}</span>
                  </div>
                  {user.role === 'sales_rep' && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">المشرف:</span>
                      <select
                        value={user.supervisorId || ''}
                        onChange={(e) => assignSupervisor(user.id, e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800 focus:outline-none"
                      >
                        <option value="">بدون مشرف مباشر</option>
                        {branchSupervisors.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {user.phone && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">الهاتف:</span>
                      <span className="font-mono text-slate-800">{user.phone}</span>
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    onClick={() => handleCopyUserCredentials(user)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedCredentials === user.id ? 'تم النسخ! ✓' : 'نسخ بيانات الدخول'}</span>
                  </button>

                  <button
                    onClick={() => loginAs(user.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-black transition flex items-center gap-1 ${
                      isCurrent ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-white'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>{isCurrent ? 'حسابك الحالي' : 'تبديل الحساب'}</span>
                  </button>

                  {isSuperAdminOrDev && (
                    <button
                      onClick={() => handleOpenEditModal(user)}
                      className="p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 2. Desktop Full Table View (Hidden on Mobile) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-900 text-white font-bold">
              <tr>
                <th className="p-3.5">الموظف</th>
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
                const cfg = roleConfigs[user.role] || roleConfigs.sales_rep;
                const isCurrent = currentUser?.id === user.id;
                const branchSupervisors = getSupervisorsInBranch(user.branchName);
                const RoleIcon = cfg.icon;

                return (
                  <tr key={user.id} className={`hover:bg-amber-50/25 transition ${isCurrent ? 'bg-amber-50/60 font-medium' : ''}`}>
                    
                    {/* Name & Avatar */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center font-black text-sm shrink-0 border border-slate-700">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                            <span>{user.name}</span>
                            {isCurrent && (
                              <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded">
                                أنت
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            كود: {user.id}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Username & Email */}
                    <td className="p-3.5">
                      <div className="font-bold text-slate-800 font-mono">{user.username}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{user.email}</div>
                    </td>

                    {/* Role Badge */}
                    <td className="p-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                        <RoleIcon className="w-3.5 h-3.5" />
                        <span>{cfg.label}</span>
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
                          className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">-- بدون مشرف محدد --</option>
                          {branchSupervisors.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : user.role === 'supervisor' ? (
                        <span className="text-[11px] text-blue-700 font-bold bg-blue-50 px-2.5 py-1 rounded-lg">
                          مشرف قطاع ({users.filter((u) => u.supervisorId === user.id).length} مناديب)
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
                        
                        {/* Copy Credentials */}
                        <button
                          onClick={() => handleCopyUserCredentials(user)}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          title="نسخ بيانات تسجيل الدخول للموظف"
                        >
                          {copiedCredentials === user.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        {/* Switch account for testing */}
                        <button
                          onClick={() => loginAs(user.id)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                            isCurrent
                              ? 'bg-amber-500 text-slate-950 font-black'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                          title="تجربة بيئة وصلاحيات هذا الموظف"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{isCurrent ? 'الحالي' : 'تجربة'}</span>
                        </button>

                        {/* Edit (Admin & Dev only) */}
                        {isSuperAdminOrDev && (
                          <button
                            onClick={() => handleOpenEditModal(user)}
                            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                            title="تعديل بيانات الموظف"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete (Admin & Dev only, if not self) */}
                        {isSuperAdminOrDev && !isCurrent && (
                          <button
                            onClick={() => {
                              if (window.confirm(`هل أنت متأكد من حذف حساب "${user.name}"؟`)) {
                                deleteUser(user.id);
                              }
                            }}
                            className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                            title="حذف الحساب"
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

      {/* ========================================================================= */}
      {/* MODERN RESPONSIVE ADD / EDIT EMPLOYEE MODAL (متناسق مع كافة الشاشات) */}
      {/* ========================================================================= */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-2xl w-full p-5 sm:p-7 space-y-5 shadow-2xl border border-slate-200 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-900 border border-amber-500/30 flex items-center justify-center font-black shrink-0">
                  <UserPlus className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg text-slate-900">
                    {editingUser ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد لهيكل الشركة'}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500">
                    تحديد الصلاحية، ربط الفرع، وتعيين المشرف المباشر للتحكم التام
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              
              {/* 1. VISUAL ROLE SELECTOR CARDS */}
              <div className="space-y-2">
                <label className="block font-black text-slate-800 text-xs sm:text-sm">
                  1. اختر الدور والصلاحية الرسمية *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(Object.keys(roleConfigs) as UserRole[]).map((rKey) => {
                    const cfg = roleConfigs[rKey];
                    const isSelected = formData.role === rKey;
                    const RoleIcon = cfg.icon;

                    return (
                      <button
                        type="button"
                        key={rKey}
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, role: rKey }));
                          if (formData.name) handleAutoGenerateCredentials(formData.name, rKey);
                        }}
                        className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                          isSelected
                            ? `border-slate-900 ring-2 ring-slate-900 bg-slate-900 text-white shadow-md`
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <RoleIcon className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-slate-600'}`} />
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                        <div className="font-black text-xs">{cfg.shortLabel}</div>
                      </button>
                    );
                  })}
                </div>
                {/* Active Role Description */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-600 text-[11px] flex items-center gap-2">
                  <span className="font-bold text-slate-900 shrink-0">مهام الصلاحية:</span>
                  <span>{roleConfigs[formData.role || 'sales_rep']?.desc}</span>
                </div>
              </div>

              {/* 2. EMPLOYEE DETAILS (Name, Auto Generator) */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="font-black text-slate-800 text-xs sm:text-sm">
                    2. البيانات الشخصية وبيانات الدخول *
                  </label>
                  {formData.name && (
                    <button
                      type="button"
                      onClick={() => handleAutoGenerateCredentials(formData.name || '', formData.role)}
                      className="text-amber-700 hover:text-amber-800 font-black text-[11px] flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      <span>توليد تلقائي للاسم والبريد</span>
                    </button>
                  )}
                </div>

                {/* Full Name */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الاسم بالكامل *</label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setFormData({ ...formData, name: newName });
                    }}
                    placeholder="مثال: أحمد عبد الله الشناوي"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:bg-white transition text-xs sm:text-sm"
                  />
                </div>

                {/* Username + Password in responsive grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      اسم المستخدم الموحد (Login Username) <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.username || ''}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                      placeholder="rep_ahmed"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-xs"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      💡 اسم المستخدم موحد لربط حساب المندوب بعملائه وفواتيره في النظام.
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="font-bold text-slate-700">كلمة المرور *</label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[10px] text-slate-500 hover:text-slate-800 font-bold flex items-center gap-0.5"
                      >
                        {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showPassword ? 'إخفاء' : 'إظهار'}</span>
                      </button>
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password || ''}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="أدخل كلمة مرور قوية"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-xs"
                    />
                  </div>
                </div>

                {/* Email + Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">البريد الإلكتروني (اختياري للدخول)</label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="ahmed@dream-dist.com"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 text-xs"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      يستطيع الموظف تسجيل الدخول باسم المستخدم أو البريد أو الهاتف.
                    </p>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">رقم الهاتف (للتواصل والواتساب والدخول)</label>
                    <input
                      type="tel"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="010XXXXXXXX"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* 3. BRANCH & SUPERVISOR ASSIGNMENT */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="block font-black text-slate-800 text-xs sm:text-sm">
                  3. التوزيع الجغرافي والفرع والمشرف المباشر *
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Branch Selector */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">الفرع التابع له *</label>
                    <select
                      value={formData.branchName}
                      onChange={(e) => setFormData({ ...formData, branchName: e.target.value, supervisorId: '' })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs cursor-pointer"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Supervisor Selector (If Sales Rep) */}
                  {formData.role === 'sales_rep' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        المشرف المباشر للمندوب في هذا الفرع
                      </label>
                      <select
                        value={formData.supervisorId || ''}
                        onChange={(e) => setFormData({ ...formData, supervisorId: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs cursor-pointer"
                      >
                        <option value="">بدون مشرف مباشر (عام على الفرع)</option>
                        {getSupervisorsInBranch(formData.branchName || '').map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.branchName})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. LIVE EMPLOYEE BADGE PREVIEW */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block font-black text-slate-800 text-[11px] mb-2 text-slate-500">
                  معاينة بطاقة الموظف المباشرة:
                </label>
                <div className="bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm shrink-0">
                      {formData.name?.charAt(0) || '؟'}
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-100">{formData.name || 'اسم الموظف'}</div>
                      <div className="text-[10px] text-amber-300 font-mono">@{formData.username || 'username'} • {formData.branchName}</div>
                    </div>
                  </div>
                  <span className="bg-amber-500/20 border border-amber-400 text-amber-300 text-[10px] font-black px-2.5 py-1 rounded-xl">
                    {roleConfigs[formData.role || 'sales_rep']?.label}
                  </span>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-7 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 rounded-2xl font-black shadow-md text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingUser ? 'حفظ التعديلات' : 'إنشاء وحفظ الحساب سحابياً'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  <option value="sales_rep">المندوب (مندوب مبيعات وتوزيع)</option>
                  <option value="supervisor">مشرف المناديب</option>
                  <option value="branch_manager">مدير الفرع</option>
                  <option value="developer">المطور (الدعم التقني)</option>
                  <option value="admin">الآدمن (الإدارة العامة)</option>
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
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>اعتماد وتفعيل الحساب فوراً</span>
              </button>
            </div>
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
