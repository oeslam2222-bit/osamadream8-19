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
  Scale,
  X
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  doesCustomerBelongToRep,
  isArabicNameMatch,
  normalizeArabicText,
  sanitizeAndDeduplicateUsers,
} from '../services/arabicMatchingService';
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
    mergeDuplicateUsers,
  } = useApp();

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('الكل');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('الكل');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [syncModalData, setSyncModalData] = useState<{ open: boolean; result?: any } | null>(null);
  const [isMergingDuplicates, setIsMergingDuplicates] = useState<boolean>(false);
  const [mergeModalData, setMergeModalData] = useState<{ open: boolean; message: string; details: string[] } | null>(null);
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
      bg: 'tint-navy',
      border: 'border-[rgba(16,43,78,.22)]',
      text: 'text-[var(--app-navy)]',
      activeRing: 'border-[var(--app-navy)] bg-[rgba(16,43,78,.06)]',
      icon: ShieldAlert,
      desc: 'صلاحيات الإدارة والرقابة الشاملة الكاملة: حذف وتعديل أي فواتير نهائياً، تعديل وحذف الأصناف والعملاء، إدارة الموظفين، والتحكم بالفروع والمخازن.'
    },
    developer: {
      label: 'المطور (الدعم التقني)',
      shortLabel: 'المطور',
      bg: 'tint-navy',
      border: 'border-[rgba(16,43,78,.22)]',
      text: 'text-[var(--app-navy)]',
      activeRing: 'border-[var(--app-navy)] bg-[rgba(16,43,78,.06)]',
      icon: Code,
      desc: 'صلاحيات برمجية وإدارية شاملة (مطابقة للآدمن): حذف وتعديل أي فواتير أو أصناف نهائياً، الربط السحابي، فحص وتطوير المنظومة بالكامل.'
    },
    branch_manager: {
      label: 'مدير الفرع',
      shortLabel: 'مدير الفرع',
      bg: 'bg-[var(--app-blue-soft)]',
      border: 'border-[rgba(30,95,157,.24)]',
      text: 'text-[var(--app-blue)]',
      activeRing: 'border-[var(--app-blue)] bg-[var(--app-blue-soft)]',
      icon: Building,
      desc: 'إدارة كاملة لمخزن الفرع: طلب تحويلات بضاعة من مخزن أكتوبر، اعتماد وصرف وتجهيز طلبيات المناديب بالفرع، ومتابعة حركات التوريد والمخزون.'
    },
    supervisor: {
      label: 'مشرف المناديب',
      shortLabel: 'مشرف المناديب',
      bg: 'tint-brass',
      border: 'border-[rgba(201,154,67,.35)]',
      text: 'app-ink-brass',
      activeRing: 'border-[rgba(201,154,67,.6)] bg-[rgba(201,154,67,.12)]',
      icon: UserCheck,
      desc: 'الإشراف على مناديب الفرع: مراجعة وتدقيق واعتماد الطلبيات أو إرسالها لمدير الفرع، طلب تحويلات من أكتوبر، ومتابعة المستهدفات وعدد الكراتين.'
    },
    sales_rep: {
      label: 'المندوب',
      shortLabel: 'المندوب',
      bg: 'bg-slate-light',
      border: 'border-[var(--app-line)]',
      text: 'text-slate',
      activeRing: 'border-[var(--app-navy)] bg-[rgba(16,43,78,.06)]',
      icon: Smartphone,
      desc: 'مندوب مبيعات ميداني: إنشاء وتجهيز طلبيات البيع لعملائه المسجلين وإرسالها (لا يوافق على الطلبيات ولا ينفذ تحويلات مخزنية بنفسه).'
    },
    warehouse_keeper: {
      label: 'أمين المخزن',
      shortLabel: 'أمين مخزن',
      bg: 'bg-[var(--app-ok-tint)]',
      border: 'border-[var(--app-ok-line)]',
      text: 'text-[var(--app-ok-text)]',
      activeRing: 'border-[var(--app-ok)] bg-[var(--app-ok-tint)]',
      icon: Building,
      desc: 'مسؤول المخزن: استلام وتوريد البضائع، مراقبة المخزون الفعلي، وصرف وتجهيز طلبيات الفروع ومخزن أكتوبر.'
    },
    legal_advisor: {
      label: 'المستشار القانوني',
      shortLabel: 'مستشار قانوني',
      bg: 'bg-[var(--app-navy-tint)]',
      border: 'border-[var(--app-navy-line)]',
      text: 'text-[var(--app-navy-text)]',
      activeRing: 'border-[var(--app-navy)] bg-[var(--app-navy-tint)]',
      icon: Scale,
      desc: 'الإدارة القانونية والتحصيل القضائي: كشوفات العملاء المتعثرين، صياغة ومتابعة الإنذارات الرسمية، تسويات وجدولة الديون، وإدارة محفظة الشيكات وإيصالات الأمانة.'
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
    email TEXT UNIQUE,
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
    sector: 'home', // القطاع الافتراضي: منزلي
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
      sector: formData.sector || 'home',
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
  const pendingUsers = useMemo(() => users.filter((u) => {
    if (u.approvalStatus !== 'pending_approval') return false;
    if (isSuperAdminOrDev) return true;
    if (currentUser?.role === 'branch_manager') {
      return u.branchName === currentUser.branchName;
    }
    return currentUser?.role === 'supervisor' &&
      u.role === 'sales_rep' &&
      u.branchName === currentUser.branchName;
  }), [users, isSuperAdminOrDev, currentUser?.role, currentUser?.branchName]);

  // Active users are filtered once, then rendered in small pages to keep the table responsive.
  const activeUsers = useMemo(() => users.filter((u) => {
    if (u.approvalStatus === 'pending_approval') return false;

    // Admin/developer see everyone; branch managers see their branch; supervisors see branch sales reps only.
    if (!isSuperAdminOrDev) {
      if (u.branchName !== currentUser?.branchName) return false;
      if (currentUser?.role === 'supervisor' && u.role !== 'sales_rep') return false;
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

  // High-performance single-pass customer count map for all sales reps
  const repCustomerCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (customers.length === 0 || users.length === 0) return map;

    const repUsers = users.filter((u) => u.role === 'sales_rep');
    const idToRepId = new Map<string, string>();
    const normNameToRepId = new Map<string, string>();

    for (const rep of repUsers) {
      map.set(rep.id, 0);
      idToRepId.set(rep.id, rep.id);
      if (rep.username) idToRepId.set(rep.username.toLowerCase(), rep.id);
      const norm = normalizeArabicText(rep.name);
      if (norm) normNameToRepId.set(norm, rep.id);
    }

    for (const c of customers) {
      let matchedRepId: string | undefined;

      if (c.repId) {
        matchedRepId = idToRepId.get(c.repId) || idToRepId.get(c.repId.toLowerCase());
      }

      if (!matchedRepId) {
        const rawName = (c.salesRepName || c.repName || '').trim();
        if (rawName && rawName !== 'مندوب المبيعات' && rawName !== 'المندوب') {
          const norm = normalizeArabicText(rawName);
          matchedRepId = normNameToRepId.get(norm);
          if (!matchedRepId) {
            for (const rep of repUsers) {
              if (isArabicNameMatch(rawName, rep.name)) {
                matchedRepId = rep.id;
                break;
              }
            }
          }
        }
      }

      if (matchedRepId && map.has(matchedRepId)) {
        map.set(matchedRepId, (map.get(matchedRepId) || 0) + 1);
      }
    }

    return map;
  }, [users, customers]);

  // Real-time audit for duplicated accounts
  const duplicateCheck = useMemo(() => {
    return sanitizeAndDeduplicateUsers(users);
  }, [users]);

  const handleMergeDuplicates = async () => {
    try {
      setIsMergingDuplicates(true);
      const res = await mergeDuplicateUsers();
      setMergeModalData({
        open: true,
        message: res.message,
        details: res.details,
      });
      setSyncToast(res.message);
      setTimeout(() => setSyncToast(null), 5000);
    } catch {
      setSyncToast('حدث خطأ أثناء فحص ودمج الحسابات.');
    } finally {
      setIsMergingDuplicates(false);
    }
  };

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
    setUserFormError(null);
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
    setUserFormError(null);
    setShowAddUserModal(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);
    if (!formData.name?.trim() || !isSuperAdminOrDev) return;

    const requestedUsername = formData.username?.trim().toLowerCase() || '';
    const fallbackUsername = normalizeArabicText(formData.name).replace(/\s+/g, '') || `user_${Date.now()}`;
    const cleanUsername = requestedUsername || fallbackUsername;
    const enteredEmail = formData.email?.trim().toLowerCase() || '';
    const cleanEmail = enteredEmail.includes('@') ? enteredEmail : `${enteredEmail || cleanUsername}@dream.com`;
    const identityKey = (value: string) => normalizeArabicText(value).replace(/\s+/g, '');
    const duplicateUser = users.find((user) => {
      if (editingUser && user.id === editingUser.id) return false;
      return identityKey(user.username) === identityKey(cleanUsername) || identityKey(user.email) === identityKey(cleanEmail);
    });
    if (duplicateUser) {
      const sameUsername = identityKey(duplicateUser.username) === identityKey(cleanUsername);
      setUserFormError(sameUsername
        ? 'اسم المستخدم مستخدم بالفعل، اختر اسمًا مختلفًا.'
        : 'البريد الإلكتروني مستخدم بالفعل، اختر بريدًا مختلفًا.');
      return;
    }

    const assignedBranch = (formData.role === 'admin' || formData.role === 'developer')
      ? 'جميع الفروع والمخزن المركزي (6 أكتوبر)'
      : (formData.branchName || currentUser?.branchName || 'فرع القاهرة');

    if (editingUser) {
      updateUser({
        ...editingUser,
        ...formData,
        name: formData.name.trim(),
        email: cleanEmail,
        username: cleanUsername,
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
        sector: formData.sector || 'home',
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
    <div className="tantawy-screen space-y-6 pb-20 max-w-none mx-auto px-2 sm:px-4">
      
      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-xs border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[rgba(16,43,78,.10)] text-[var(--app-navy)] border border-[rgba(16,43,78,.22)] flex items-center justify-center font-black shrink-0">
              <ShieldCheck className="w-6 h-6 text-[var(--app-navy)]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-900">
                  إدارة الموظفين والصلاحيات والهيكل الإداري
                </h2>
                <span className="bg-[rgba(201,154,67,.13)] text-warn text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-[rgba(201,154,67,.3)] app-num">
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
                onClick={handleMergeDuplicates}
                disabled={isMergingDuplicates}
                className="app-btn app-btn-ghost px-3 text-xs active:scale-95"
                title="فحص حسابات الموظفين والمناديب المكررة ودمجها وتوحيد السجلات"
              >
                <Sparkles className={`w-3.5 h-3.5 text-[var(--app-ok)] ${isMergingDuplicates ? 'animate-spin' : ''}`} />
                <span>{isMergingDuplicates ? 'جاري الفحص والدمج...' : 'فحص ودمج الحسابات المكررة'}</span>
              </button>
            )}

            {isSuperAdminOrDev && (
              <button
                onClick={() => {
                  const res = refreshCustomerRepLinks();
                  setSyncModalData({ open: true, result: res });
                  setSyncToast(`تم فحص ومزامنة العملاء بنجاح! تم تحديث وربط ${res.updatedCount} عميل بالمناديب.`);
                  setTimeout(() => setSyncToast(null), 4000);
                }}
                className="app-btn app-btn-ghost px-3 text-xs active:scale-95"
                title="إعادة فحص وربط العملاء بالمناديب وفقاً للأسماء والفروع وعرض تقرير المطابقة"
              >
                <RefreshCw className="w-3.5 h-3.5 app-ink-brass" />
                <span>مزامنة وربط العملاء بالمناديب</span>
              </button>
            )}

            {isSuperAdminOrDev ? (
              <button
                onClick={handleOpenAddModal}
                className="app-btn app-btn-primary px-5 text-xs sm:text-sm active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة موظف جديد +</span>
              </button>
            ) : (
              <div className="panel-warn px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                <span>إضافة وتعديل الموظفين مقتصرة على الآدمن والمطور فقط</span>
              </div>
            )}
          </div>
        </div>

        {syncToast && (
          <div className="mt-3 p-3 panel-ok rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{syncToast}</span>
          </div>
        )}

        {duplicateCheck.mergedCount > 0 && isSuperAdminOrDev && (
          <div className="mt-4 panel-warn border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl tint-brass border border-[rgba(201,154,67,.35)] flex items-center justify-center font-black shrink-0">
                <Sparkles className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">
                  تم رصد <span className="app-num">{duplicateCheck.mergedCount}</span> حساب مكرر في النظام (تكرار نفس المندوب أو المشرف)
                </p>
                <p className="text-xs text-slate-600 mt-0.5 font-medium">
                  {duplicateCheck.mergedPairs.map((p) => `[${p.keptUser.name} - ${p.keptUser.branchName || 'العام'}]`).join(' • ')}
                </p>
              </div>
            </div>
            <button
              onClick={handleMergeDuplicates}
              disabled={isMergingDuplicates}
              className="app-btn app-btn-primary px-5 py-2.5 text-xs shrink-0 active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>{isMergingDuplicates ? 'جاري الدمج والتنظيف...' : 'دمج الحسابات المكررة الآن'}</span>
            </button>
          </div>
        )}
      </div>


      {/* PENDING APPROVALS SECTION (Requests from register page) */}
      {pendingUsers.length > 0 && (
        <div className="panel-warn rounded-3xl border p-5 shadow-xs space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[var(--app-accent)] animate-ping"></span>
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>طلبات تسجيل الحسابات بانتظار تفعيل الإدارة (<span className="app-num">{pendingUsers.length}</span>)</span>
              </h3>
            </div>
            <span className="tint-warn text-[11px] font-bold px-2.5 py-1 rounded-full border border-[rgba(155,112,39,.25)]">
              تفعيل واعتماد مباشر
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {pendingUsers.map((pUser) => {
              return (
                <div
                  key={pUser.id}
                  className="bg-white p-4 rounded-2xl border border-[var(--app-line)] shadow-xs space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-black text-sm text-slate-900">{pUser.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">@{pUser.username} • {pUser.email}</div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full app-badge ${roleConfigs[pUser.role]?.bg || 'bg-slate-light'} ${roleConfigs[pUser.role]?.border || 'border-[var(--app-line)]'} ${roleConfigs[pUser.role]?.text || 'text-slate'}`}>
                        {roleConfigs[pUser.role]?.shortLabel || pUser.role}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-slate-600 space-y-1 bg-slate-light p-2 rounded-xl">
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

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-border-soft">
                    <button
                      onClick={() => handleOpenApproveModal(pUser)}
                      className="app-btn app-btn-ok flex-1 py-2 text-xs active:scale-95"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>اعتماد وتخصيص المشرف</span>
                    </button>
                    <button
                      onClick={() => rejectUser(pUser.id)}
                      className="chip-btn danger p-2 text-xs"
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
                  ? 'border-[var(--app-navy)] bg-[rgba(16,43,78,.05)] shadow-[inset_0_-3px_0_var(--app-accent)]'
                  : 'border-[var(--app-line)] hover:border-slate-border'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className={`w-8 h-8 rounded-xl ${cfg.bg} ${cfg.border} border flex items-center justify-center`}>
                    <RoleIcon className={`w-4 h-4 ${cfg.text}`} />
                  </div>
                  <span className="font-black text-sm text-slate-900 app-num">{count} <span className="text-[11px] font-bold text-slate-400">موظف</span></span>
                </div>
                <div className="mt-2.5 font-black text-xs text-slate-900">{cfg.label}</div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">
                  {cfg.desc}
                </p>
              </div>

              <div className="pt-2 mt-2 border-t border-slate-border-soft flex items-center justify-between text-[10px] text-slate-400 font-bold">
                <span className={selectedRoleFilter === roleKey ? 't-navy' : ''}>{selectedRoleFilter === roleKey ? 'تصفية مفعلة' : 'انقر للتصفية'}</span>
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
              <span className="tint-brass text-xs font-black px-2.5 py-0.5 rounded-full app-num">
                {activeUsers.length}
              </span>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Branch Filter */}
              <div className="flex items-center gap-1.5 bg-white border border-[var(--app-line)] rounded-xl px-2.5 py-1.5 text-xs">
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
              <div className="flex items-center gap-1.5 bg-white border border-[var(--app-line)] rounded-xl px-2.5 py-1.5 text-xs">
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
                  <option value="legal_advisor">المستشار القانوني</option>
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
              className="w-full pl-3 pr-10 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs transition"
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

        <div className="flex items-center justify-between gap-3 border-t border-slate-border-soft px-4 py-3 text-xs">
    <span className="font-bold text-slate-500 app-num">عرض {visibleUsers.length} من {activeUsers.length} مستخدم</span>
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setUsersPage((page) => Math.max(1, page - 1))} disabled={usersPage === 1} className="app-pill px-3 py-1.5 text-xs">السابق</button>
      <span className="font-black text-slate-700 app-num">{usersPage} / {totalUsersPages}</span>
      <button type="button" onClick={() => setUsersPage((page) => Math.min(totalUsersPages, page + 1))} disabled={usersPage === totalUsersPages} className="app-pill px-3 py-1.5 text-xs">التالي</button>
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
              <div key={user.id} className={`p-4 space-y-3 ${isCurrent ? 'row-brass' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--app-navy)] text-[var(--app-accent)] flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                        <span>{user.name}</span>
                        {isCurrent && (
                          <span className="tint-brass text-[10px] font-black px-1.5 py-0.2 rounded-full border border-[rgba(201,154,67,.35)]">
                            أنت
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">@{user.username}</div>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${cfg.bg} ${cfg.border} ${cfg.text} flex items-center gap-1`}>
                    <RoleIcon className="w-3 h-3" />
                    <span>{cfg.label}</span>
                  </span>
                </div>

                {/* Details Grid */}
                <div className="bg-slate-light p-2.5 rounded-2xl text-xs space-y-1.5 border border-slate-border-soft">
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
                        className="app-pill px-2.5 py-1 rounded-full text-[10px] app-num"
                        title="عرض قائمة العملاء والمديونيات والحد الائتماني لهذا المندوب"
                      >
                        {repCustCount} عميل (عرض التفاصيل)
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
                    className="app-btn app-btn-ghost flex-1 py-2 text-xs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedCredentials === user.id ? 'تم النسخ!' : 'نسخ بيانات الدخول'}</span>
                  </button>

                  <button
                    onClick={() => loginAs(user.id)}
                    className={`px-3 py-2 text-xs font-black flex items-center gap-1 ${
                      isCurrent ? 'tint-brass border border-[rgba(201,154,67,.4)] app-ink-brass rounded-[10px]' : 'app-btn app-btn-primary'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>{isCurrent ? 'حسابك الحالي' : 'تبديل الحساب'}</span>
                  </button>

                  {isSuperAdminOrDev && (
                    <button
                      onClick={() => handleOpenEditModal(user)}
                      className="chip-btn p-2"
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
                  <tr key={user.id} className={`transition ${isCurrent ? 'row-brass' : ''}`}>
                    
                    {/* Name & Avatar */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-[var(--app-navy)] text-[var(--app-accent)] flex items-center justify-center font-black text-sm shrink-0 border border-[rgba(16,43,78,.3)]">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                            <span>{user.name}</span>
                            {isCurrent && (
                              <span className="tint-brass text-[10px] font-black px-1.5 py-0.2 rounded-full border border-[rgba(201,154,67,.35)]">
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
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
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
                            className="app-pill px-2.5 py-1 rounded-full text-[11px] app-num"
                            title="عرض قائمة العملاء والمديونيات والحد الائتماني لهذا المندوب"
                          >
                            {repCustCount} عميل مسند (عرض)
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
                          className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none"
                        >
                          <option value="">-- بدون مشرف محدد --</option>
                          {branchSupervisors.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : user.role === 'supervisor' ? (
                        <span className="text-[11px] app-ink-brass tint-brass px-2.5 py-1 rounded-lg app-num">
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
                          className="chip-btn p-2 cursor-pointer"
                          title="نسخ بيانات تسجيل الدخول للموظف"
                        >
                          {copiedCredentials === user.id ? <Check className="w-3.5 h-3.5 text-[var(--app-ok)]" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        {/* Switch account for testing */}
                        <button
                          onClick={() => loginAs(user.id)}
                          className={`px-2.5 py-1 rounded-[10px] text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                            isCurrent
                              ? 'tint-brass app-ink-brass border border-[rgba(201,154,67,.4)] font-black'
                              : 'app-pill'
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
                            className="chip-btn p-2 cursor-pointer"
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
                            className="chip-btn danger p-2 cursor-pointer"
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
            <div className="flex items-center justify-between border-b border-slate-border-soft pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl icon-brass-dark border border-[rgba(201,154,67,.35)] flex items-center justify-center font-black shrink-0">
                  <UserPlus className="w-5 h-5" />
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
                className="chip-btn w-8 h-8 min-h-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              {userFormError && (
                <div className="tint-risk rounded-xl px-3 py-2.5 font-bold text-xs">
                  {userFormError}
                </div>
              )}
              
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
                            ? 'border-[var(--app-navy)] bg-[var(--app-navy)] text-white shadow-md shadow-[inset_0_-3px_0_var(--app-accent)]'
                            : 'border-[var(--app-line)] bg-white hover:border-slate-border text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <RoleIcon className={`w-4 h-4 ${isSelected ? 'text-[var(--app-accent)]' : 'text-slate-500'}`} />
                          {isSelected && <Check className="w-3.5 h-3.5 text-[var(--app-accent)]" />}
                        </div>
                        <div className="font-black text-xs">{cfg.shortLabel}</div>
                      </button>
                    );
                  })}
                </div>
                {/* Active Role Description */}
                <div className="bg-slate-light p-2.5 rounded-xl border border-[var(--app-line)] text-slate-600 text-[11px] flex items-center gap-2">
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
                    الاسم بالكامل (اسم المندوب / الموظف المربوط بالعملاء وفواتير البيع) <span className="t-risk">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: أسامة الشناوي"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 transition text-xs sm:text-sm"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    هذا الاسم سيظهر تلقائياً للعملاء على الفواتير وشيتات الإكسل وأوامر الشغل.
                  </p>
                </div>

                {/* Email (Primary Login) & Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      البريد الإلكتروني لتسجيل الدخول (Login Email) <span className="t-risk">*</span>
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
                      يستخدمه الموظف لتسجيل الدخول في النظام مباشرة.
                    </p>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      اسم المستخدم <span className="t-risk">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.username || ''}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="مثال: ahmed.sales"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-xs"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      يجب أن يكون مختلفًا عن جميع المستخدمين الحاليين.
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
                  {/* Sector Selector (منزلي / كهربائي) */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      القطاع (نوع البيانات) *
                    </label>
                    <select
                      value={String(formData.sector || 'home')}
                      onChange={(e) => setFormData({ ...formData, sector: e.target.value as 'home' | 'electrical' | 'both' | 'all' })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-xs cursor-pointer"
                    >
                      <option value="home">منزلي (البيانات الخاصة بالمنزلي)</option>
                      <option value="electrical">كهربائي (البيانات الخاصة بالكهرباء)</option>
                      <option value="both">كلا القطاعين (منزلي + كهربائي)</option>
                      <option value="all">كل البيانات (إدارة عامة)</option>
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      يحدد أي قاعدة بيانات سيشاهدها هذا المستخدم: منزلي، كهربائي، أو كليهما
                    </p>
                  </div>

                  {/* Branch Selector */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {formData.role === 'admin' || formData.role === 'developer'
                        ? 'نطاق الصلاحية الجغرافية'
                        : 'الفرع التابع له *'}
                    </label>
                    {formData.role === 'admin' || formData.role === 'developer' ? (
                      <div className="p-2.5 panel-navy border rounded-xl font-black text-xs flex items-center gap-2">
                        <span>الرابط</span>
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
                <div className="bg-[var(--app-navy)] text-white p-3.5 rounded-2xl border border-deep3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--app-accent)] text-deep-navy font-black flex items-center justify-center text-sm shrink-0">
                      {formData.name?.charAt(0) || '؟'}
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-100">{formData.name || 'اسم الموظف'}</div>
                      <div className="text-[10px] text-amber font-mono">{formData.email || 'user@dream.com'} • {formData.branchName}</div>
                    </div>
                  </div>
                  <span className="badge-brass-dark text-[10px] font-black px-2.5 py-1 rounded-xl">
                    {roleConfigs[formData.role || 'sales_rep']?.label}
                  </span>
                </div>

                {formData.role === 'sales_rep' && formData.name?.trim() && (
                  <div className="panel-ok border p-2.5 rounded-xl text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 shrink-0" />
                      <span>
                        قاعدة بيانات العملاء: تم رصد <strong>{matchingCustomerCount} عميل</strong> مسجل باسم ({formData.name}) في ({formData.branchName || 'الفرع'})
                      </span>
                    </div>
                    <span className="bg-[rgba(46,125,91,.16)] text-[var(--app-ok)] text-[10px] font-black px-2 py-0.5 rounded-md shrink-0">
                      ربط تلقائي بالسيستم
                    </span>
                  </div>
                )}
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-border-soft">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="app-btn app-btn-ghost px-5 py-2.5 text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="app-btn app-btn-primary px-7 py-2.5 text-xs sm:text-sm active:scale-95"
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
            <div className="flex items-center justify-between border-b border-slate-border-soft pb-3">
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[var(--app-ok)]" />
                <span>تفعيل حساب وتخصيص المشرف والفرع</span>
              </h3>
              <button onClick={() => setApprovingUser(null)} className="chip-btn w-8 h-8 min-h-0 p-0">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="bg-slate-light p-3 rounded-2xl border border-[var(--app-line)] text-xs space-y-1">
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
                  <option value="legal_advisor">المستشار القانوني (الإدارة القانونية)</option>
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

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-border-soft">
              <button
                type="button"
                onClick={() => setApprovingUser(null)}
                className="app-btn app-btn-ghost px-4 py-2 text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmApproval}
                className="app-btn app-btn-ok px-6 py-2 text-xs active:scale-95"
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
            <div className="p-4 sm:p-5 navy-panel text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[var(--app-accent)] text-deep-navy flex items-center justify-center font-black text-base shadow-sm">
                  {viewingRepUser.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base flex items-center gap-2">
                    <span>عملاء المندوب: {viewingRepUser.name}</span>
                    <span className="text-[10px] badge-brass-dark px-2 py-0.5 rounded-full font-bold">
                      {viewingRepUser.branchName}
                    </span>
                  </h3>
                  <p className="text-[11px] text-blue-soft3 font-mono mt-0.5">
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
                  className="btn-brass px-3.5 py-2 text-xs"
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
                  className="text-blue-soft3 hover:text-white p-2 rounded-xl cursor-pointer"
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
                    <div className="bg-slate-light p-3.5 rounded-2xl border border-[var(--app-line)]">
                      <div className="text-[11px] text-slate-500 font-bold">إجمالي العملاء المسندين</div>
                      <div className="text-lg font-black text-slate-900 mt-1 dream-amt">{repCustomers.length} <span className="text-xs text-slate-400 font-normal">عميل</span></div>
                    </div>
                    <div className="bg-red-light p-3.5 rounded-2xl border border-[rgba(179,74,74,.25)]">
                      <div className="text-[11px] text-[var(--app-risk)] font-bold">إجمالي مديونيات العملاء</div>
                      <div className="text-lg font-black text-[var(--app-risk)] mt-1 dream-amt">{formatCurrency(totalDebts)}</div>
                    </div>
                    <div className="bg-[var(--app-blue-soft)] p-3.5 rounded-2xl border border-[rgba(30,95,157,.24)]">
                      <div className="text-[11px] text-[var(--app-blue)] font-bold">إجمالي الحدود الائتمانية</div>
                      <div className="text-lg font-black text-[var(--app-blue)] mt-1 dream-amt">{formatCurrency(totalLimits)}</div>
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
                      className="w-full pl-3 pr-10 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold"
                    />
                  </div>

                  {/* Customer Table */}
                  {filtered.length === 0 ? (
                    <div className="p-8 text-center bg-slate-light rounded-2xl border border-dashed border-slate-300 text-slate-500 text-xs">
                      {repCustomers.length === 0
                        ? `لا يوجد عملاء مسندين حالياً للمندوب (${viewingRepUser.name}) في فرع (${viewingRepUser.branchName}). يمكنك مزامنة الشيت أو تعديل مندوب العميل.`
                        : 'لا توجد نتائج مطابقة لبحثك في عملاء المندوب.'}
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-[var(--app-line)] rounded-2xl">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-900 text-slate-200 font-black sticky top-0">
                          <tr>
                            <th className="p-3">#</th>
                            <th className="p-3">كود العميل</th>
                            <th className="p-3">اسم العميل / المحل</th>
                            <th className="p-3">الفرع</th>
                            <th className="p-3">المديونية (ج.م)</th>
                            <th className="p-3">الحد الائتماني</th>
                            <th className="p-3">المتاح من الائتمان</th>
                            <th className="p-3">الهاتف</th>
                            <th className="p-3">العنوان</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y border-slate-border-soft font-semibold text-slate-800">
                          {filtered.map((c, idx) => {
                            const debt = c.currentBalance || c.balance || 0;
                            const limit = c.creditLimit || 0;
                            const available = limit > 0 ? Math.max(0, limit - debt) : null;

                            return (
                              <tr key={c.id}>
                                <td className="p-3 text-slate-400 font-bold">{idx + 1}</td>
                                <td className="p-3 font-mono font-bold app-ink-brass">{c.code || '---'}</td>
                                <td className="p-3">
                                  <div className="font-black text-slate-900">{c.name}</div>
                                  {c.storeName && (
                                    <div className="text-[10px] text-slate-500">{c.storeName}</div>
                                  )}
                                </td>
                                <td className="p-3 text-slate-600">
                                  <span className="inline-block px-2 py-0.5 rounded bg-slate-light text-slate font-bold text-[11px]">
                                    {c.branchName || viewingRepUser.branchName}
                                  </span>
                                </td>
                                <td className="p-3 dream-amt t-risk">
                                  {debt > 0 ? formatCurrency(debt) : <span className="text-slate-400">0 ج.م</span>}
                                </td>
                                <td className="p-3 dream-amt text-[var(--app-blue)]">
                                  {limit > 0 ? formatCurrency(limit) : <span className="text-slate-400">غير محدد</span>}
                                </td>
                                <td className="p-3 dream-amt t-ok">
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
            <div className="p-4 bg-slate-light border-t border-[var(--app-line)] flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setViewingRepUser(null);
                  setRepCustomerSearchTerm('');
                }}
                className="app-btn app-btn-ghost px-5 py-2 text-xs"
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
            <div className="p-4 sm:p-5 navy-panel text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[var(--app-accent)] text-deep-navy flex items-center justify-center font-black">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base">تقرير مطابقة ومزامنة العملاء بالمناديب</h3>
                  <p className="text-xs text-blue-soft3">تم فحص قاعدة البيانات وتحديث ربط العملاء بحسابات المناديب</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSyncModalData(null);
                  setAutoCreateFeedback(null);
                }}
                className="text-blue-soft3 hover:text-white p-2 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto text-xs">
              {/* Feedback alert */}
              {autoCreateFeedback && (
                <div className="p-3 panel-ok rounded-2xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{autoCreateFeedback}</span>
                </div>
              )}

              {/* Stats overview */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-light p-3 rounded-2xl border border-[var(--app-line)]">
                  <span className="text-slate-500 font-bold">إجمالي العملاء:</span>
                  <div className="text-lg font-black text-slate-900 mt-0.5 dream-amt">{customers.length} عميل</div>
                </div>
                <div className="panel-ok p-3 rounded-2xl border">
                  <span className="font-bold">تم ربطهم بالمندوب:</span>
                  <div className="text-lg font-black mt-0.5 dream-amt">
                    {customers.filter((c) => c.repId || c.salesRepName || c.repName).length} عميل
                  </div>
                </div>
                <div className="tint-brass p-3 rounded-2xl border border-[rgba(201,154,67,.35)]">
                  <span className="font-bold">المناديب المسجلين:</span>
                  <div className="text-lg font-black mt-0.5 dream-amt">
                    {users.filter((u) => u.role === 'sales_rep').length} مندوب
                  </div>
                </div>
              </div>

              {/* Reps Breakdown Table */}
              <div className="space-y-2">
                <h4 className="font-black text-slate-900 text-xs sm:text-sm">
                  توزيع العملاء والمديونيات على حسابات المناديب المسجلة:
                </h4>
                <div className="border border-[var(--app-line)] rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-900 text-slate-200 font-black sticky top-0">
                      <tr>
                        <th className="p-2.5">المندوب</th>
                        <th className="p-2.5">الفرع</th>
                        <th className="p-2.5 text-center">العملاء التابعين</th>
                        <th className="p-2.5">إجمالي المديونية</th>
                        <th className="p-2.5 text-center">معاينة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y border-slate-border-soft font-semibold">
                      {syncRepBreakdown.map(({ rep, count, debts }) => (
                        <tr key={rep.id}>
                          <td className="p-2.5 font-black text-slate-900">{rep.name}</td>
                          <td className="p-2.5 text-slate-600">{rep.branchName}</td>
                          <td className="p-2.5 text-center">
                            <span className="app-badge ok app-num">
                              {count} عميل
                            </span>
                          </td>
                          <td className="p-2.5 dream-amt t-risk">{formatCurrency(debts)}</td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSyncModalData(null);
                                setViewingRepUser(rep);
                              }}
                              className="app-link text-[11px]"
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
                  <div className="panel-warn p-4 rounded-2xl border space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <div>
                          <h5 className="font-black text-slate-900 text-xs">
                            تم رصد (<span className="app-num">{unmatched.length}</span>) اسم مندوب بالشيت غير مسجلين في المنظومة:
                          </h5>
                          <p className="text-[11px] mt-0.5">
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
                        className="app-btn app-btn-primary px-3.5 py-2 text-xs shrink-0 active:scale-95"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>إنشاء وتفعيل الحسابات الآن</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {unmatched.map((item: any, idx: number) => (
                        <span
                          key={idx}
                          className="bg-white border border-[rgba(201,154,67,.35)] app-ink-brass px-2.5 py-1 rounded-xl text-[11px] font-bold shadow-2xs"
                        >
                          {item.repName} ({item.branchName}) • {item.count} عميل
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-light border-t border-[var(--app-line)] flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const res = refreshCustomerRepLinks();
                  setSyncModalData({ open: true, result: res });
                  setAutoCreateFeedback(`تمت إعادة الفحص وتحديث الربط بنجاح! تم تحديث ${res.updatedCount} عميل.`);
                }}
                className="app-btn app-btn-ghost px-4 py-2 text-xs"
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
                className="app-btn app-btn-ghost px-5 py-2 text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DUPLICATE MERGE RESULTS */}
      {mergeModalData?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 navy-panel text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[rgba(46,125,91,.25)] text-teal-soft5 flex items-center justify-center font-black">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-base text-white">تقرير فحص ودمج الحسابات المكررة</h3>
                  <p className="text-xs text-blue-soft3 mt-0.5">تنظيف وتوحيد سجلات الموظفين والمناديب</p>
                </div>
              </div>
              <button
                onClick={() => setMergeModalData(null)}
                className="w-8 h-8 min-h-0 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="p-4 panel-ok border rounded-2xl flex items-center gap-3">
                <Check className="w-5 h-5 shrink-0" />
                <span className="text-sm font-black text-slate-900">{mergeModalData.message}</span>
              </div>

              {mergeModalData.details.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-700">تفاصيل الحسابات التي تم دمجها وتوحيدها:</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {mergeModalData.details.map((detail, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-light border border-[var(--app-line)] rounded-xl text-xs font-medium text-slate-800 flex items-start gap-2"
                      >
                        <span className="w-5 h-5 min-h-0 rounded-full tint-brass text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-light border-t border-[var(--app-line)] flex items-center justify-end">
              <button
                type="button"
                onClick={() => setMergeModalData(null)}
                className="app-btn app-btn-primary px-6 py-2.5 text-xs active:scale-95"
              >
                تم، إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
