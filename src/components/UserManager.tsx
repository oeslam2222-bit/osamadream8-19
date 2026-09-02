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
  Link,
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
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { doesCustomerBelongToRep } from '../services/arabicMatchingService';
import { formatCurrency } from '../services/invoiceService';
import { User, UserApprovalStatus, UserRole } from '../types';

export const UserManager: React.FC = () => {
  const {
    users,
    branches,
    customers,
    currentUser,
    addUser,
    updateUser,
    deleteUser,
    approveUser,
    rejectUser,
    assignSupervisor,
    getSupervisorsInBranch,
    loginAs,
    refreshCustomerRepLinks,
    autoCreateMissingRepsFromCustomers,
  } = useApp();

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('الكل');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('الكل');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [syncModalData, setSyncModalData] = useState<{ open: boolean; result?: any } | null>(null);
  const [viewingRepUser, setViewingRepUser] = useState<User | null>(null);
  const [repCustomerSearchTerm, setRepCustomerSearchTerm] = useState<string>('');
  const [autoCreateFeedback, setAutoCreateFeedback] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const USERS_PER_PAGE = 25;

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
      desc: 'صلاحيات الإدارة والرقابة الشاملة الكاملة: حذف وتعديل أي فواتير نهائياً، تعديل وحذف الأصناف والعملاء، إدارة الموظفين، والتحكم بالفروع والمخازن.'
    },
    developer: {
      label: 'المطور (الدعم التقني)',
      shortLabel: 'المطور',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-800',
      activeRing: 'ring-amber-500 border-amber-500 bg-amber-50/50',
      icon: Code,
      desc: 'صلاحيات برمجية وإدارية شاملة (مطابقة للآدمن): حذف وتعديل أي فواتير أو أصناف نهائياً، الربط السحابي، فحص وتطوير المنظومة بالكامل.'
    },
    branch_manager: {
      label: 'مدير الفرع',
      shortLabel: 'مدير الفرع',
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      text: 'text-purple-800',
      activeRing: 'ring-purple-500 border-purple-500 bg-purple-50/50',
      icon: Building,
      desc: 'إدارة كاملة لمخزن الفرع: طلب تحويلات بضاعة من مخزن أكتوبر، اعتماد وصرف وتجهيز طلبيات المناديب بالفرع، ومتابعة حركات التوريد والمخزون.'
    },
    supervisor: {
      label: 'مشرف المناديب',
      shortLabel: 'مشرف المناديب',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      activeRing: 'ring-blue-500 border-blue-500 bg-blue-50/50',
      icon: UserCheck,
      desc: 'الإشراف على مناديب الفرع: مراجعة وتدقيق واعتماد الطلبيات أو إرسالها لمدير الفرع، طلب تحويلات من أكتوبر، ومتابعة المستهدفات وعدد الكراتين.'
    },
    sales_rep: {
      label: 'المندوب',
      shortLabel: 'المندوب',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-800',
      activeRing: 'ring-emerald-500 border-emerald-500 bg-emerald-50/50',
      icon: Smartphone,
      desc: 'مندوب مبيعات ميداني: إنشاء وتجهيز طلبيات البيع لعملائه المسجلين وإرسالها (لا يوافق على الطلبيات ولا ينفذ تحويلات مخزنية بنفسه).'
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

  const matchingCustomerCount = useMemo(() => {
    if (!showAddUserModal || !formData.name?.trim() || formData.role !== 'sales_rep') return 0;
    const tempUser: User = {
      id: editingUser?.id || 'temp-id',
      name: formData.name.trim(),
      username: formData.username?.trim() || '',
      email: formData.email || '',
      phone: formData.phone || '',
      branchName: formData.branchName || '',
      role: formData.role || 'sales_rep',
      approvalStatus: 'active',
      isActive: true,
    };
    return customers.filter((c) => doesCustomerBelongToRep(c, tempUser)).length;
  }, [showAddUserModal, formData.name, formData.username, formData.email, formData.phone, formData.branchName, formData.role, editingUser, customers]);

  // Approval modal state
  const [approvingUser, setApprovingUser] = useState<User | null>(null);
  const [approvalSupervisorId, setApprovalSupervisorId] = useState<string>('');
  const [approvalBranchName, setApprovalBranchName] = useState<string>('');
  const [approvalRole, setApprovalRole] = useState<UserRole>('sales_rep');

  // Pending users waiting for approval (Memoized)
  const pendingUsers = useMemo(() => users.filter((u) => u.approvalStatus === 'pending_approval'), [users]);

  // Active users are filtered once, then rendered in small pages to keep the table responsive.
  const activeUsers = useMemo(() => users.filter((u) => {
    if (u.approvalStatus === 'pending_approval') return false;

    // Strict Branch Filter: Admin & Dev can see all branches, while Supervisor / Branch Manager / Rep only see their own branch
    if (!isSuperAdminOrDev) {
      if (u.branchName !== currentUser?.branchName) return false;
    } else {
      if (selectedBranchFilter !== 'الكل' && u.branchName !== selectedBranchFilter) return false;
    }

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
  }), [users, isSuperAdminOrDev, currentUser?.branchName, selectedBranchFilter, selectedRoleFilter, searchQuery]);

  const totalUsersPages = Math.max(1, Math.ceil(activeUsers.length / USERS_PER_PAGE));
  const visibleUsers = useMemo(() => {
    return activeUsers.slice((usersPage - 1) * USERS_PER_PAGE, usersPage * USERS_PER_PAGE);
  }, [activeUsers, usersPage]);

  // Fast memoized customer count map for the visible reps (computed in microseconds for max 25 users)
  const repCustomerCountMap = useMemo(() => {
    const map = new Map<string, number>();
    const repUsers = visibleUsers.filter((u) => u.role === 'sales_rep');
    if (repUsers.length === 0 || customers.length === 0) return map;

    for (const rep of repUsers) {
      let count = 0;
      for (const c of customers) {
        if (doesCustomerBelongToRep(c, rep)) {
          count++;
        }
      }
      map.set(rep.id, count);
    }
    return map;
  }, [visibleUsers, customers]);

  // Fast memoized supervisors per branch map
  const supervisorsByBranchMap = useMemo(() => {
    const map = new Map<string, User[]>();
    for (const u of users) {
      if (
        (u.role === 'supervisor' || u.role === 'branch_manager' || u.role === 'admin' || u.role === 'developer') &&
        u.isActive &&
        u.approvalStatus === 'active'
      ) {
        const branch = u.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
        const list = map.get(branch) || [];
        list.push(u);
        map.set(branch, list);
      }
    }
    return map;
  }, [users]);

  // Fast memoized count of reps under each supervisor
  const supervisorRepCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) {
      if (u.supervisorId) {
        map.set(u.supervisorId, (map.get(u.supervisorId) || 0) + 1);
      }
    }
    return map;
  }, [users]);

  // Fast memoized active count per role
  const roleCountsMap = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      if (u.approvalStatus === 'active') {
        counts[u.role] = (counts[u.role] || 0) + 1;
      }
    }
    return counts;
  }, [users]);

  // Memoized breakdown of sales reps and customer debts for the sync report modal
  const syncRepBreakdown = useMemo(() => {
    if (!syncModalData?.open) return [];
    return users
      .filter((u) => u.role === 'sales_rep')
      .map((rep) => {
        const repCusts = customers.filter((c) => doesCustomerBelongToRep(c, rep));
        const repDebts = repCusts.reduce((sum, c) => sum + (c.currentBalance || c.balance || 0), 0);
        return {
          rep,
          count: repCusts.length,
          debts: repDebts,
        };
      });
  }, [syncModalData?.open, users, customers]);

  // Memoized rep customer data for modal
  const viewingRepData = useMemo(() => {
    if (!viewingRepUser) return { repCustomers: [], totalDebts: 0, totalLimits: 0, filtered: [] };
    const repCustomers = customers.filter((c) => doesCustomerBelongToRep(c, viewingRepUser));
    const totalDebts = repCustomers.reduce((sum, c) => sum + (c.currentBalance || c.balance || 0), 0);
    const totalLimits = repCustomers.reduce((sum, c) => sum + (c.creditLimit || 0), 0);

    const q = repCustomerSearchTerm.toLowerCase().trim();
    const filtered = !q
      ? repCustomers
      : repCustomers.filter((c) => {
          return (
            c.name.toLowerCase().includes(q) ||
            (c.code && c.code.toLowerCase().includes(q)) ||
            (c.phone && c.phone.includes(q)) ||
            (c.storeName && c.storeName.toLowerCase().includes(q)) ||
            (c.address && c.address.toLowerCase().includes(q))
          );
        });

    return { repCustomers, totalDebts, totalLimits, filtered };
  }, [viewingRepUser, customers, repCustomerSearchTerm]);

  useEffect(() => {
    setUsersPage(1);
  }, [selectedBranchFilter, selectedRoleFilter, searchQuery]);

  useEffect(() => {
    if (usersPage > totalUsersPages) setUsersPage(totalUsersPages);
  }, [usersPage, totalUsersPages]);

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

  const handleOpenAddModal = () => {
    setEditingUser(null);
    setShowPassword(false);
    setFormData({
      name: '',
      username: '',
      email: '',
      password: '',
      role: 'sales_rep',
      branchName: isSuperAdminOrDev ? (branches[0]?.name || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)') : (currentUser?.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)'),
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
    if (!formData.name?.trim() || !formData.email?.trim() || !isSuperAdminOrDev) return;

    const cleanEmail = formData.email.trim().toLowerCase();
    const cleanUsername = cleanEmail.includes('@') ? cleanEmail.split('@')[0] : cleanEmail;

    const assignedBranch = (formData.role === 'admin' || formData.role === 'developer')
      ? 'جميع الفروع والمخزن المركزي (6 أكتوبر)'
      : (formData.branchName || currentUser?.branchName || 'فرع القاهرة');

    if (editingUser) {
      updateUser({
        ...editingUser,
        ...formData,
        name: formData.name.trim(),
        email: cleanEmail,
        username: formData.username?.trim() || cleanUsername,
        branchName: assignedBranch,
      } as User);
      setEditingUser(null);
    } else {
      const newUser: User = {
        id: `u-${Date.now()}`,
        name: formData.name.trim(),
        username: cleanUsername,
        email: cleanEmail,
        password: formData.password || '',
        role: formData.role || 'sales_rep',
        branchName: assignedBranch,
        supervisorId: formData.role === 'sales_rep' ? (formData.supervisorId || undefined) : undefined,
        phone: formData.phone || '',
        avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80`,
        commissionRate: formData.commissionRate || 2.5,
        isActive: formData.isActive ?? true,
        approvalStatus: 'active',
      };
      addUser(newUser);
    }

    // Immediately trigger rep linking
    setTimeout(() => {
      refreshCustomerRepLinks();
    }, 100);

    setShowAddUserModal(false);
  };

  const handleCopyUserCredentials = (user: User) => {
    const credText = `بيانات الدخول لمنظومة شركة دريم للتجارة والتوزيع:
الاسم المعتمد: ${user.name}
الصفة: ${roleConfigs[user.role]?.label || user.role}
الفرع: ${user.branchName}
البريد الإلكتروني لتسجيل الدخول: ${user.email}
كلمة المرور: ${user.password || '(كلمة المرور الخاصة بالمستخدم)'}
رابط المنظومة: ${window.location.origin}`;

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

          <div className="flex items-center flex-wrap gap-2">
            {isSuperAdminOrDev && (
              <button
                onClick={() => {
                  const res = refreshCustomerRepLinks();
                  setSyncModalData({ open: true, result: res });
                  setSyncToast(`تم فحص ومزامنة العملاء بنجاح! تم تحديث وربط ${res.updatedCount} عميل بالمناديب.`);
                  setTimeout(() => setSyncToast(null), 4000);
                }}
                className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-black px-4 py-3 rounded-2xl text-xs shadow-md transition active:scale-95 cursor-pointer border border-slate-700"
                title="إعادة فحص وربط العملاء بالمناديب وفقاً للأسماء والفروع وعرض تقرير المطابقة"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                <span>مزامنة وربط العملاء بالمناديب</span>
              </button>
            )}

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

        {syncToast && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncToast}</span>
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
          const count = roleCountsMap[roleKey] || 0;
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
                  <option value="الكل">الفروع التشغيلية (7)</option>
                  {branches.filter((b) => !b.isMainWarehouse).map((b) => (
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

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs">
    <span className="font-bold text-slate-500">عرض {visibleUsers.length} من {activeUsers.length} مستخدم</span>
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setUsersPage((page) => Math.max(1, page - 1))} disabled={usersPage === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:cursor-not-allowed disabled:opacity-40">السابق</button>
      <span className="font-black text-slate-700">{usersPage} / {totalUsersPages}</span>
      <button type="button" onClick={() => setUsersPage((page) => Math.min(totalUsersPages, page + 1))} disabled={usersPage === totalUsersPages} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:cursor-not-allowed disabled:opacity-40">التالي</button>
    </div>
  </div>

  {/* 1. Mobile Cards View (Hidden on Tablet / Desktop) */}
        <div className="block sm:hidden divide-y divide-slate-100">
          {visibleUsers.map((user) => {
            const cfg = roleConfigs[user.role] || roleConfigs.sales_rep;
            const isCurrent = currentUser?.id === user.id;
            const branchSupervisors = supervisorsByBranchMap.get(user.branchName || '') || supervisorsByBranchMap.get('الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)') || [];
            const repCustCount = repCustomerCountMap.get(user.id) || 0;
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
                      <span className="text-slate-400">العملاء المسندين:</span>
                      <button
                        type="button"
                        onClick={() => setViewingRepUser(user)}
                        className="bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-bold px-2 py-0.5 rounded text-[10px] cursor-pointer transition flex items-center gap-1 active:scale-95"
                        title="عرض قائمة العملاء والمديونيات والحد الائتماني لهذا المندوب"
                      >
                        👥 {repCustCount} عميل (عرض التفاصيل)
                      </button>
                    </div>
                  )}
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
              {visibleUsers.map((user) => {
                const cfg = roleConfigs[user.role] || roleConfigs.sales_rep;
                const isCurrent = currentUser?.id === user.id;
                const branchSupervisors = supervisorsByBranchMap.get(user.branchName || '') || supervisorsByBranchMap.get('الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)') || [];
                const repCustCount = repCustomerCountMap.get(user.id) || 0;
                const supervisedRepsCount = supervisorRepCountMap.get(user.id) || 0;
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

                    {/* Branch & Assigned Customers */}
                    <td className="p-3.5">
                      <div className="font-bold text-slate-800">{user.branchName}</div>
                      {user.role === 'sales_rep' && (
                        <div className="mt-1">
                          <button
                            type="button"
                            onClick={() => setViewingRepUser(user)}
                            className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-1 rounded-xl text-[11px] font-black cursor-pointer transition shadow-2xs active:scale-95"
                            title="عرض قائمة العملاء والمديونيات والحد الائتماني لهذا المندوب"
                          >
                            👥 {repCustCount} عميل مسند (عرض)
                          </button>
                        </div>
                      )}
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
                          مشرف قطاع ({supervisedRepsCount} مناديب)
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
                        onClick={() => setFormData((prev) => ({ ...prev, role: rKey }))}
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

              {/* 2. EMPLOYEE DETAILS (Name, Login Email, Password) */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="block font-black text-slate-800 text-xs sm:text-sm">
                  2. البيانات الشخصية وبيانات الدخول *
                </label>

                {/* Full Name */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    الاسم بالكامل (اسم المندوب / الموظف المربوط بالعملاء وفواتير البيع) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: أسامة الشناوي"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:bg-white transition text-xs sm:text-sm"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    💡 هذا الاسم سيظهر تلقائياً للعملاء على الفواتير وشيتات الإكسل وأوامر الشغل.
                  </p>
                </div>

                {/* Email (Primary Login) & Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      البريد الإلكتروني لتسجيل الدخول (Login Email) <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="مثال: osama@dream.com"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-xs"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      🔐 يستخدمه الموظف لتسجيل الدخول في النظام مباشرة.
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
                      placeholder="أدخل كلمة مرور الحساب"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-xs"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الهاتف / الواتساب</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="مثال: 010XXXXXXXX"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                  />
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
                    <label className="block font-bold text-slate-700 mb-1">
                      {formData.role === 'admin' || formData.role === 'developer'
                        ? 'نطاق الصلاحية الجغرافية'
                        : 'الفرع التابع له *'}
                    </label>
                    {formData.role === 'admin' || formData.role === 'developer' ? (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl font-black text-amber-950 text-xs flex items-center gap-2">
                        <span>🌐</span>
                        <span>جميع الفروع (7) + المخزن المركزي (6 أكتوبر)</span>
                      </div>
                    ) : (
                      <select
                        value={formData.branchName}
                        onChange={(e) => setFormData({ ...formData, branchName: e.target.value, supervisorId: '' })}
                        disabled={!isSuperAdminOrDev}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs cursor-pointer disabled:opacity-70 disabled:bg-slate-100"
                      >
                        {branches.filter((b) => !b.isMainWarehouse).map((b) => (
                          <option key={b.id} value={b.name}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    )}
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

              {/* 4. LIVE EMPLOYEE BADGE & MATCHED CUSTOMER PREVIEW */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="block font-black text-slate-800 text-[11px] text-slate-500">
                  معاينة بطاقة الموظف والعملاء المرتبطين به:
                </label>
                <div className="bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm shrink-0">
                      {formData.name?.charAt(0) || '؟'}
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-100">{formData.name || 'اسم الموظف'}</div>
                      <div className="text-[10px] text-amber-300 font-mono">{formData.email || 'user@dream.com'} • {formData.branchName}</div>
                    </div>
                  </div>
                  <span className="bg-amber-500/20 border border-amber-400 text-amber-300 text-[10px] font-black px-2.5 py-1 rounded-xl">
                    {roleConfigs[formData.role || 'sales_rep']?.label}
                  </span>
                </div>

                {formData.role === 'sales_rep' && formData.name?.trim() && (
                  <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-emerald-950 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        قاعدة بيانات العملاء: تم رصد <strong>{matchingCustomerCount} عميل</strong> مسجل باسم ({formData.name}) في ({formData.branchName || 'الفرع'})
                      </span>
                    </div>
                    <span className="bg-emerald-200 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded-md shrink-0">
                      ربط تلقائي بالسيستم
                    </span>
                  </div>
                )}
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
                  {branches.filter((b) => !b.isMainWarehouse).map((b) => (
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

      {/* VIEWING REP CUSTOMERS MODAL */}
      {viewingRepUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-base shadow-sm">
                  {viewingRepUser.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base flex items-center gap-2">
                    <span>عملاء المندوب: {viewingRepUser.name}</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
                      {viewingRepUser.branchName}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300 font-mono mt-0.5">
                    كود: {viewingRepUser.id} • هاتف: {viewingRepUser.phone || 'غير مسجل'} • @{viewingRepUser.username}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    loginAs(viewingRepUser.id);
                    setViewingRepUser(null);
                  }}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3.5 py-1.5 rounded-xl text-xs shadow transition flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>دخول كـ المندوب</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewingRepUser(null);
                    setRepCustomerSearchTerm('');
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Rep Summary Stats & Search */}
            {(() => {
              const { repCustomers, totalDebts, totalLimits, filtered } = viewingRepData;

              return (
                <div className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto">
                  {/* Stat Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-bold">👥 إجمالي العملاء المسندين</div>
                      <div className="text-lg font-black text-slate-900 mt-1">{repCustomers.length} <span className="text-xs text-slate-400 font-normal">عميل</span></div>
                    </div>
                    <div className="bg-rose-50/60 p-3.5 rounded-2xl border border-rose-200">
                      <div className="text-[11px] text-rose-700 font-bold">💰 إجمالي مديونيات العملاء</div>
                      <div className="text-lg font-black text-rose-700 mt-1">{formatCurrency(totalDebts)}</div>
                    </div>
                    <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-200">
                      <div className="text-[11px] text-blue-700 font-bold">🛡️ إجمالي الحدود الائتمانية</div>
                      <div className="text-lg font-black text-blue-700 mt-1">{formatCurrency(totalLimits)}</div>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={repCustomerSearchTerm}
                      onChange={(e) => setRepCustomerSearchTerm(e.target.value)}
                      placeholder="ابحث في عملاء المندوب بالاسم، الكود، الهاتف، أو العنوان..."
                      className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-amber-400 focus:bg-white"
                    />
                  </div>

                  {/* Customer Table */}
                  {filtered.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-xs">
                      {repCustomers.length === 0
                        ? `لا يوجد عملاء مسندين حالياً للمندوب (${viewingRepUser.name}) في فرع (${viewingRepUser.branchName}). يمكنك مزامنة الشيت أو تعديل مندوب العميل.`
                        : 'لا توجد نتائج مطابقة لبحثك في عملاء المندوب.'}
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-black sticky top-0">
                          <tr>
                            <th className="p-3">#</th>
                            <th className="p-3">كود العميل</th>
                            <th className="p-3">اسم العميل / المحل</th>
                            <th className="p-3">الفرع</th>
                            <th className="p-3 text-rose-700">المديونية (ج.م)</th>
                            <th className="p-3 text-blue-700">الحد الائتماني</th>
                            <th className="p-3 text-emerald-700">المتاح من الائتمان</th>
                            <th className="p-3">الهاتف</th>
                            <th className="p-3">العنوان</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                          {filtered.map((c, idx) => {
                            const debt = c.currentBalance || c.balance || 0;
                            const limit = c.creditLimit || 0;
                            const available = limit > 0 ? Math.max(0, limit - debt) : null;

                            return (
                              <tr key={c.id} className="hover:bg-amber-50/40">
                                <td className="p-3 text-slate-400 font-bold">{idx + 1}</td>
                                <td className="p-3 font-mono font-bold text-amber-900">{c.code || '---'}</td>
                                <td className="p-3">
                                  <div className="font-black text-slate-900">{c.name}</div>
                                  {c.storeName && (
                                    <div className="text-[10px] text-slate-500">{c.storeName}</div>
                                  )}
                                </td>
                                <td className="p-3 text-slate-600">
                                  <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[11px]">
                                    {c.branchName || viewingRepUser.branchName}
                                  </span>
                                </td>
                                <td className="p-3 font-mono font-bold text-rose-600">
                                  {debt > 0 ? formatCurrency(debt) : <span className="text-slate-400">0 ج.م</span>}
                                </td>
                                <td className="p-3 font-mono font-bold text-blue-700">
                                  {limit > 0 ? formatCurrency(limit) : <span className="text-slate-400">غير محدد</span>}
                                </td>
                                <td className="p-3 font-mono font-bold text-emerald-700">
                                  {available !== null ? formatCurrency(available) : <span className="text-slate-400">مفتوح</span>}
                                </td>
                                <td className="p-3 font-mono text-slate-600">{c.phone || '---'}</td>
                                <td className="p-3 text-slate-500 text-[11px]">{c.address || c.governorate || '---'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setViewingRepUser(null);
                  setRepCustomerSearchTerm('');
                }}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SYNC & MATCHING REPORT MODAL */}
      {syncModalData?.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base">تقرير مطابقة ومزامنة العملاء بالمناديب</h3>
                  <p className="text-xs text-slate-300">تم فحص قاعدة البيانات وتحديث ربط العملاء بحسابات المناديب</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSyncModalData(null);
                  setAutoCreateFeedback(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto text-xs">
              {/* Feedback alert */}
              {autoCreateFeedback && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{autoCreateFeedback}</span>
                </div>
              )}

              {/* Stats overview */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <span className="text-slate-500 font-bold">إجمالي العملاء:</span>
                  <div className="text-lg font-black text-slate-900 mt-0.5">{customers.length} عميل</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200">
                  <span className="text-emerald-800 font-bold">تم ربطهم بالمندوب:</span>
                  <div className="text-lg font-black text-emerald-800 mt-0.5">
                    {customers.filter((c) => c.repId || c.salesRepName || c.repName).length} عميل
                  </div>
                </div>
                <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200">
                  <span className="text-amber-800 font-bold">المناديب المسجلين:</span>
                  <div className="text-lg font-black text-amber-900 mt-0.5">
                    {users.filter((u) => u.role === 'sales_rep').length} مندوب
                  </div>
                </div>
              </div>

              {/* Reps Breakdown Table */}
              <div className="space-y-2">
                <h4 className="font-black text-slate-900 text-xs sm:text-sm">
                  توزيع العملاء والمديونيات على حسابات المناديب المسجلة:
                </h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-black sticky top-0">
                      <tr>
                        <th className="p-2.5">المندوب</th>
                        <th className="p-2.5">الفرع</th>
                        <th className="p-2.5 text-center">العملاء التابعين</th>
                        <th className="p-2.5">إجمالي المديونية</th>
                        <th className="p-2.5 text-center">معاينة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {syncRepBreakdown.map(({ rep, count, debts }) => (
                        <tr key={rep.id} className="hover:bg-amber-50/40">
                          <td className="p-2.5 font-black text-slate-900">{rep.name}</td>
                          <td className="p-2.5 text-slate-600">{rep.branchName}</td>
                          <td className="p-2.5 text-center">
                            <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[11px]">
                              {count} عميل
                            </span>
                          </td>
                          <td className="p-2.5 font-mono font-bold text-rose-600">{formatCurrency(debts)}</td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSyncModalData(null);
                                setViewingRepUser(rep);
                              }}
                              className="text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg transition cursor-pointer"
                            >
                              عرض العملاء
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Unmatched Reps in Customers */}
              {(() => {
                const unmatched = syncModalData?.result?.unmatchedRepNames || [];
                if (unmatched.length === 0) return null;

                return (
                  <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                        <div>
                          <h5 className="font-black text-amber-950 text-xs">
                            تم رصد ({unmatched.length}) اسم مندوب بالشيت غير مسجلين في المنظومة:
                          </h5>
                          <p className="text-[11px] text-amber-800 mt-0.5">
                            يمكنك إنشاء وتفعيل حسابات دخول فورية لهم بضغطة واحدة ليتم ربط عملائهم تلقائياً.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const res = autoCreateMissingRepsFromCustomers();
                          setAutoCreateFeedback(res.message);
                          const updated = refreshCustomerRepLinks();
                          setSyncModalData({ open: true, result: updated });
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-3.5 py-1.5 rounded-xl text-xs shadow transition flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>إنشاء وتفعيل الحسابات الآن</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {unmatched.map((item: any, idx: number) => (
                        <span
                          key={idx}
                          className="bg-white border border-amber-200 text-amber-900 px-2.5 py-1 rounded-xl text-[11px] font-bold shadow-2xs"
                        >
                          👤 {item.repName} ({item.branchName}) • {item.count} عميل
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const res = refreshCustomerRepLinks();
                  setSyncModalData({ open: true, result: res });
                  setAutoCreateFeedback(`تمت إعادة الفحص وتحديث الربط بنجاح! تم تحديث ${res.updatedCount} عميل.`);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-black px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة الفحص الآن</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSyncModalData(null);
                  setAutoCreateFeedback(null);
                }}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
