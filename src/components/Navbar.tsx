import {
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Building,
  Building2,
  CheckCircle,
  CloudLightning,
  Download,
  FileSpreadsheet,
  Home,
  Layers,
  LayoutDashboard,
  LogOut,
  Receipt,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  ShoppingCart,
  ShoppingBag,
  Target,
  CalendarCheck,
  Wallet,
  User,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  X,
  Zap,
  ZapOff,
  Eye,
  EyeOff,
  Lock,
  Scale,
  Settings,
  Menu,
  MoreHorizontal,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  Search,
  Camera,
  Percent,
  Moon,
  Sun,
  UploadCloud
} from 'lucide-react';
import React, { Suspense, lazy, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useCart } from '../context/cartContext';
import { useTheme } from '../context/themeContext';
import { formatCurrency } from '../services/invoiceService';
import { UserRole } from '../types';

/* الشاشات دي بتتفتح من أيقونات نادرة الاستخدام، وكانت كلها جوه الحزمة الأولى
   (~600KB زيادة على أول تحميل). بقت chunks منفصلة بتتنزّل أول مرة تتفتح فقط. */
const GlobalSearch = lazy(() =>
  import('./GlobalSearch').then((m) => ({ default: m.GlobalSearch })),
);
const InstallAppModal = lazy(() =>
  import('./InstallAppModal').then((m) => ({ default: m.InstallAppModal })),
);
const SystemSettingsAndAboutModal = lazy(() =>
  import('./SystemSettingsAndAboutModal').then((m) => ({ default: m.SystemSettingsAndAboutModal })),
);
/* تم تعطيل رفع الصورة الشخصية — الأفاتار الرسمي ثابت لكل المستخدمين */
const DatabaseConnectionModal = lazy(() =>
  import('./DatabaseConnectionModal').then((m) => ({ default: m.DatabaseConnectionModal })),
);
const SyncStatusCenter = lazy(() =>
  import('./SyncStatusCenter').then((m) => ({ default: m.SyncStatusCenter })),
);

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenCart: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  notificationCount?: number;
  onOpenNotificationCenter?: () => void;
  onGlobalNavigate?: (tab: string, query?: string) => void;
}

const DEFAULT_EXECUTIVE_AVATAR = '/assets/rep-avatar-v2.jpg';

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenCart,
  isSidebarCollapsed = false,
  onToggleSidebar,
  notificationCount = 0,
  onOpenNotificationCenter,
  onGlobalNavigate
}) => {
  const {
    currentUser,
    logout,
    users,
    branches,
    invoices,
    getVisibleInvoices,
    isOffline,
    pendingInvoicesCount,
    offlineQueueCount,
    deadLetterCount,
    flushPendingInvoices,
    selectedBranchFilter,
    setSelectedBranchFilter,
    activeSectorFilter,
    setActiveSectorFilter,
    canManageSectorGate,
    dataSaverMode,
    toggleDataSaverMode,
    isPrivacyMode,
    togglePrivacyMode,
    installPromptEvent,
    isInstallModalOpen,
    setIsInstallModalOpen,
    login,
    supabaseStatus,
    checkDatabaseConnection
  } = useApp();
  const { getCartSummary } = useCart();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  // Avatar upload disabled: official avatar is fixed for all users.
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();

  // كثافة العرض: مصغّر (المحتوى الأكتر على الشاشة) / مريح — محفوظة لكل جهاز.
  // زر التبديل اتشال بطلب المستخدم (العرض الحالي مريح ومختصر)،
  // والكثافة بتفضل زي ما هي لكل جهاز من غير تغيير مفاجئ.
  const [density] = useState<'compact' | 'comfortable'>(() => {
    try {
      return localStorage.getItem('tantawy_density') === 'comfortable' ? 'comfortable' : 'compact';
    } catch {
      return 'compact';
    }
  });

  React.useEffect(() => {
    document.documentElement.classList.toggle('tg-compact', density === 'compact');
  }, [density]);

  const [internalSidebarCollapsed, setInternalSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tantawy_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const effectiveSidebarCollapsed = isSidebarCollapsed !== undefined ? isSidebarCollapsed : internalSidebarCollapsed;

  const handleToggleSidebar = () => {
    if (onToggleSidebar) {
      onToggleSidebar();
    } else {
      setInternalSidebarCollapsed((prev) => {
        const next = !prev;
        try { localStorage.setItem('tantawy_sidebar_collapsed', String(next)); } catch {}
        return next;
      });
    }
  };

  const cartSummary = getCartSummary();
  const todayLabel = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  if (!currentUser) return null;

  const roleNames: Record<UserRole, { label: string; bg: string; text: string }> = {
    admin: { label: 'الآدمن (الإدارة العامة)', bg: 'bg-[var(--app-risk)] border-[var(--app-risk)]', text: 'text-[#ef4444]' },
    developer: { label: 'المطور (الدعم التقني)', bg: 'bg-[var(--app-accent)] border-[var(--app-accent)]', text: 'text-white' },
    branch_manager: { label: 'مدير الفرع', bg: 'bg-[var(--app-navy)] border-[var(--app-navy)]', text: 'text-[#60a5fa]' },
    supervisor: { label: 'مشرف المناديب', bg: 'bg-[var(--app-navy)] border-[var(--app-navy)]', text: 'text-[#60a5fa]' },
    sales_rep: { label: 'المندوب', bg: 'bg-[var(--app-ok)] border-[var(--app-ok)]', text: 'text-[#0d9488]' },
    warehouse_keeper: { label: 'أمين المخزن', bg: 'bg-[var(--app-ok)] border-[var(--app-ok)]', text: 'text-[#0d9488]' },
    legal_advisor: { label: 'الشؤون القانونية', bg: 'bg-[var(--app-navy)] border-[var(--app-navy)]', text: 'text-[#60a5fa]' },
    technical_support: { label: 'الدعم الفني', bg: 'bg-[var(--app-accent)] border-[var(--app-accent)]', text: 'text-white' },
  };

  const pendingApprovalsCount = users.filter((u) => {
    if (u.approvalStatus !== 'pending_approval') return false;
    if (currentUser.role === 'admin' || currentUser.role === 'developer') return true;
    if (currentUser.role === 'branch_manager') return u.branchName === currentUser.branchName;
    return currentUser.role === 'supervisor' &&
      u.role === 'sales_rep' &&
      u.branchName === currentUser.branchName;
  }).length;
  
  const userVisibleInvoices = useMemo(() => getVisibleInvoices(), [getVisibleInvoices]);
  const pendingOrdersCount = useMemo(
    () =>
      userVisibleInvoices.filter((i) => {
        const status = i.status || '';
        const lower = status.toLowerCase();
        // مطابقة الحالة الرئيسية
        if (
          status === 'قيد مراجعة المشرف' ||
          status === 'معلقة بانتظار اعتماد الفرع' ||
          status === 'قيد المراجعة'
        )
          return true;
        // مطابقةcase-insensitive fallback
        if (
          lower.includes('مراجعة') ||
          lower.includes('معتم') ||
          lower.includes('معلقة')
        )
          return true;
        return false;
      }).length,
    [userVisibleInvoices]
  );

  const supervisorName = currentUser.supervisorId
    ? users.find((u) => u.id === currentUser.supervisorId)?.name
    : null;

  const supervisedRepsCount = currentUser.role === 'supervisor'
    ? users.filter((u) => u.supervisorId === currentUser.id).length
    : 0;

  const isFieldRole = currentUser.role === 'sales_rep' || currentUser.role === 'supervisor';

  const navItems = [
    { id: 'home', label: 'الرئيسية', icon: Home, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper', 'legal_advisor'] },
    { id: 'product_sales', label: 'مبيعات الأصناف', icon: ShoppingBag, roles: ['admin', 'developer', 'branch_manager', 'supervisor'] },
    { id: 'invoices', label: 'أوامر البيع والاعتمادات', icon: Receipt, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'], badge: pendingOrdersCount },
    { id: 'catalog', label: 'الكتالوج', icon: Boxes, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'customers', label: 'العملاء', icon: Users, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'reps', label: 'المناديب', icon: UserCheck, roles: ['admin', 'branch_manager', 'supervisor', 'developer'] },
    { id: 'collection', label: 'تحصيل', icon: Wallet, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'returns', label: 'المرتجعات', icon: RotateCcw, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper'] },
    { id: 'legal_advisor', label: 'المستشار القانوني', icon: ShieldCheck, roles: ['admin', 'developer', 'legal_advisor'] },
    { id: 'offers', label: 'العروض', icon: Percent, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'], promo: true },
    { id: 'targets', label: 'التارجت', icon: Target, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'visits', label: 'الزيارات', icon: CalendarCheck, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'excel', label: 'الإكسل', icon: FileSpreadsheet, roles: ['admin', 'developer'] },
    { id: 'guide', label: 'الدليل', icon: BookOpen, roles: isFieldRole ? [] : ['admin', 'branch_manager', 'developer', 'warehouse_keeper'] },
    { id: 'users', label: 'الفريق', icon: UserCheck, roles: ['admin', 'developer', 'branch_manager', 'supervisor'], badge: pendingApprovalsCount },
    { id: 'permissions', label: 'الصلاحيات', icon: ShieldCheck, roles: ['admin', 'developer'] },
    { id: 'pending_sync', label: 'مزامنة معلقة', icon: UploadCloud, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper', 'legal_advisor'], badge: (pendingInvoicesCount || 0) + (offlineQueueCount || 0) + (deadLetterCount || 0) },
    { id: 'settings', label: 'الإعدادات', icon: Settings, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper', 'legal_advisor'] },

  ];

  const navGroups: Array<{ id: string; label: string; items: string[] }> = [
    { id: 'main', label: 'الرئيسية', items: ['home'] },
    { id: 'selling', label: 'البيع والكتالوج', items: ['invoices', 'catalog', 'product_sales', 'offers'] },
    { id: 'field', label: 'العملاء والتحصيل', items: ['customers', 'collection', 'returns', 'visits'] },
    { id: 'reports', label: 'التقارير والأهداف', items: ['targets', 'reps', 'excel'] },
    { id: 'admin', label: 'الإدارة والنظام', items: ['users', 'permissions', 'pending_sync', 'guide', 'legal_advisor', 'settings'] },
  ];

  const filteredNavItems = navItems.filter((item) => item.roles.includes(currentUser.role));

  const groupedNav = navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((id) => filteredNavItems.find((item) => item.id === id))
        .filter((item): item is (typeof navItems)[number] => Boolean(item)),
    }))
    .filter((group) => group.items.length > 0);

  const displayName = (currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'مستخدم';
  const initial = displayName.charAt(0);
  const roleLabel = roleNames[currentUser.role]?.label || currentUser.role;
  const activeItem = filteredNavItems.find((i) => i.id === activeTab || (i.id === 'customers' && activeTab === 'all_customers'));

  /**
   * الشريط السفلي: 4 أقسام + "المزيد" = 5 عناصر كحد أقصى.
   * أكتر من كده على شاشة 320–390px بيزحم اللابلز ويصغّر أهداف اللمس.
   * الأولوية للتحت بتتحدد بالترتيب، والفلترة بصلاحيات الدور — فأمين المخزن
   * مثلاً بياخد (الرئيسية + المرتجعات) والباقي من درج "المزيد".
   */
  const bottomCandidates = [
    { id: 'home', navId: 'home', label: 'الرئيسية', icon: Home, badge: 0 },
    { id: 'invoices', navId: 'invoices', label: 'الطلبات', icon: Receipt, badge: pendingOrdersCount },
    { id: 'customers', navId: 'all_customers', label: 'العملاء', icon: Users, badge: 0 },
    { id: 'targets', navId: 'targets', label: 'التارجت', icon: BarChart3, badge: 0 },
    { id: 'returns', navId: 'returns', label: 'المرتجعات', icon: RotateCcw, badge: 0 },
    { id: 'catalog', navId: 'catalog', label: 'الكتالوج', icon: Boxes, badge: 0 },
  ];

  const canOpenTab = (navId: string) =>
    filteredNavItems.some(
      (n) => n.id === navId || (navId === 'all_customers' && n.id === 'customers')
    );

  const bottomItems = bottomCandidates.filter((b) => canOpenTab(b.navId)).slice(0, 5);

  const sectionBadgeTheme: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
    home: { bg: 'bg-blue-100', text: 'text-[#2563EB]', darkBg: 'dark:bg-blue-950/60', darkText: 'dark:text-blue-300' },
    product_sales: { bg: 'bg-teal-100', text: 'text-[#0D9488]', darkBg: 'dark:bg-teal-950/60', darkText: 'dark:text-teal-300' },
    catalog: { bg: 'bg-teal-100', text: 'text-[#0D9488]', darkBg: 'dark:bg-teal-950/60', darkText: 'dark:text-teal-300' },
    offers: { bg: 'bg-amber-100', text: 'text-[#D97706]', darkBg: 'dark:bg-amber-950/60', darkText: 'dark:text-amber-300' },
    invoices: { bg: 'bg-blue-100', text: 'text-[#2563EB]', darkBg: 'dark:bg-blue-950/60', darkText: 'dark:text-blue-300' },
    collection: { bg: 'bg-emerald-100', text: 'text-[#16A34A]', darkBg: 'dark:bg-emerald-950/60', darkText: 'dark:text-emerald-300' },
    customers: { bg: 'bg-indigo-100', text: 'text-[#4F46E5]', darkBg: 'dark:bg-indigo-950/60', darkText: 'dark:text-indigo-300' },
    all_customers: { bg: 'bg-indigo-100', text: 'text-[#4F46E5]', darkBg: 'dark:bg-indigo-950/60', darkText: 'dark:text-indigo-300' },
    reps: { bg: 'bg-sky-100', text: 'text-[#0284C7]', darkBg: 'dark:bg-sky-950/60', darkText: 'dark:text-sky-300' },
    visits: { bg: 'bg-purple-100', text: 'text-[#7C3AED]', darkBg: 'dark:bg-purple-950/60', darkText: 'dark:text-purple-300' },
    returns: { bg: 'bg-rose-100', text: 'text-[#DC2626]', darkBg: 'dark:bg-rose-950/60', darkText: 'dark:text-rose-300' },
    returns_customers: { bg: 'bg-rose-100', text: 'text-[#DC2626]', darkBg: 'dark:bg-rose-950/60', darkText: 'dark:text-rose-300' },
    targets: { bg: 'bg-amber-100', text: 'text-[#F59E0B]', darkBg: 'dark:bg-amber-950/60', darkText: 'dark:text-amber-300' },
    dashboard: { bg: 'bg-purple-100', text: 'text-[#7C3AED]', darkBg: 'dark:bg-purple-950/60', darkText: 'dark:text-purple-300' },
    excel: { bg: 'bg-emerald-100', text: 'text-[#16A34A]', darkBg: 'dark:bg-emerald-950/60', darkText: 'dark:text-emerald-300' },
    users: { bg: 'bg-slate-200', text: 'text-slate-700', darkBg: 'dark:bg-slate-800', darkText: 'dark:text-slate-300' },
    permissions: { bg: 'bg-blue-100', text: 'text-[#2563EB]', darkBg: 'dark:bg-blue-950/60', darkText: 'dark:text-blue-300' },
    pending_sync: { bg: 'bg-amber-100', text: 'text-[#D97706]', darkBg: 'dark:bg-amber-950/60', darkText: 'dark:text-amber-300' },
    guide: { bg: 'bg-teal-100', text: 'text-[#0D9488]', darkBg: 'dark:bg-teal-950/60', darkText: 'dark:text-teal-300' },
  };

  return (
    <>
      <header className="ds-topbar print:hidden bg-white dark:bg-[var(--app-bg)]">
        <div className="ds-topbar__main">
          {/* العلامة + عنوان الصفحة */}
          <div className="ds-brand">
            <img src="/icon.svg" alt="طنطاوي جروب - Tantawy Group" className="ds-brand__logo" />
            <div className="ds-brand__text">
              <div className="ds-brand__title" role="heading" aria-level={1}>طنطاوي جروب</div>
              <div className="ds-brand__sub">Dream Tantawy</div>
            </div>
          </div>

          {/* بحث ذكي (حقل مرن مع الأيقونة داخل الحقل) */}
          <div className="ds-search ds-vis-ge-lg flex-1 min-w-0 relative">
            <input
              type="text"
              placeholder="ابحث عن عميل، فاتورة، صنف، مرتجع..."
              className="w-full px-3 py-2 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-[#243756] bg-slate-50/70 dark:bg-[#132542] text-slate-900 dark:text-white text-sm font-medium placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              onFocus={() => setIsGlobalSearchOpen(true)}
              onClick={(e) => e.stopPropagation()}
              readOnly
              aria-label="بحث ذكي"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          </div>

          <div className="ds-topbar__spacer" />

          <div className="ds-actions">
            {/* حالة الاتصال (صغيرة) */}
            <div className={`ds-status ${isOffline ? 'ds-status--off' : ''}`} title={isOffline ? 'أوفلاين' : 'متصل'}>
              {isOffline ? <WifiOff aria-hidden="true" /> : <Wifi aria-hidden="true" />}
              <span className={isOffline ? '' : 'ds-vis-ge-md'}>{isOffline ? 'أوفلاين' : 'متصل'}</span>
            </div>

            {/* مزامنة الفواتير المعلقة (بارز فقط لو فيه معلقات، سطح المكتب 1280px+) */}
            {pendingInvoicesCount > 0 && (
              <button
                type="button"
                onClick={() => flushPendingInvoices()}
                className="ds-iconbtn ds-iconbtn--primary ds-vis-ge-xl"
                title="فواتير مسجلة أوفلاين بانتظار المزامنة"
              >
                <RefreshCw aria-hidden="true" />
                <span className="ds-vis-ge-xl">مزامنة ({pendingInvoicesCount})</span>
                <span className="ds-count ds-count--float ds-vis-lt-md">{pendingInvoicesCount}</span>
              </button>
            )}

            {/* مزامنة مركز الحالة (سطح المكتب 1280px+) */}
            <button
              type="button"
              onClick={() => setIsSyncCenterOpen(true)}
              className="ds-iconbtn ds-vis-ge-xl"
              title="مركز حالة المزامنة والطابور"
              aria-label="مركز حالة المزامنة"
            >
              <RefreshCw aria-hidden="true" className={pendingInvoicesCount > 0 ? 'text-amber-600' : ''} />
              <span className="ds-vis-ge-xl">المزامنة</span>
              {pendingInvoicesCount > 0 && <span className="ds-count">{pendingInvoicesCount}</span>}
            </button>

            {/* قاعدة البيانات (سطح المكتب 1280px+) */}
            <button
              type="button"
              onClick={() => setIsDbModalOpen(true)}
              className="ds-iconbtn ds-vis-ge-xl"
              title="حالة قاعدة البيانات والمزامنة"
              aria-label="حالة قاعدة البيانات والمزامنة"
            >
              <CloudLightning aria-hidden="true" />
              <span className="ds-vis-ge-xl">
                {supabaseStatus?.connected === false
                  ? 'غير متصل'
                  : supabaseStatus?.customersCount != null && supabaseStatus.customersCount === 0
                    ? 'مزامنة البيانات'
                    : 'قاعدة البيانات'}
              </span>
            </button>

            {/* مبدّل القطاع (سطح المكتب 1280px+) */}
            {canManageSectorGate && (
              <div className="ds-vis-ge-xl inline-flex items-center rounded-xl border border-slate-200 dark:border-[#243756] bg-slate-100/90 dark:bg-[#132542] p-0.5 gap-0.5" role="group" aria-label="اختيار القطاع">
                <button
                  type="button"
                  onClick={() => setActiveSectorFilter('home')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer whitespace-nowrap ${
                    activeSectorFilter === 'home'
                      ? 'bg-[#102b4e] text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10'
                  }`}
                >
                  🏠 منزلي
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSectorFilter('electrical')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer whitespace-nowrap ${
                    activeSectorFilter === 'electrical'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10'
                  }`}
                >
                  ⚡ كهرباء
                </button>
              </div>
            )}

            {/* فلتر الفرع (سطح المكتب 1280px+) */}
            {(currentUser.role === 'admin' || currentUser.role === 'developer') && (
              <select
                aria-label="تصفية الفرع"
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="ds-select ds-vis-ge-xl"
              >
                <option value="الكل">كل الفروع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
            )}

            {/* تبديل الوضع الليلي (سطح المكتب 1280px+) */}
            <button
              type="button"
              onClick={toggleTheme}
              className="ds-iconbtn ds-vis-ge-xl"
              title={isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الليلي'}
              aria-label={isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الليلي'}
              aria-pressed={isDark}
            >
              {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              <span className="ds-vis-ge-xl">{isDark ? 'الوضع الفاتح' : 'الوضع الليلي'}</span>
            </button>

            {/* الإعدادات (سطح المكتب 1280px+) */}
            <button
              id="navbar-settings-and-about-btn"
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="ds-iconbtn ds-vis-ge-xl"
              title="الإعدادات، السياسة والخصوصية، السحابة وCloudinary"
              aria-label="الإعدادات"
            >
              <Settings aria-hidden="true" />
              <span className="ds-vis-ge-xl">الإعدادات</span>
            </button>

            {/* قائمة "المزيد": تظهر أقل من 1280px وتجمع الأزرار الثانوية */}
            <button
              type="button"
              onClick={() => setShowMoreMenu((p) => !p)}
              className="ds-iconbtn ds-vis-lt-xl"
              title="المزيد من الإجراءات"
              aria-label="المزيد من الإجراءات"
              aria-expanded={showMoreMenu}
            >
              <MoreHorizontal size={18} />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-[#26364D] bg-white dark:bg-[#0F1E36] shadow-xl z-50 py-2">
                {/* مزامنة مركز الحالة */}
                <button
                  type="button"
                  onClick={() => { setIsSyncCenterOpen(true); setShowMoreMenu(false); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#162542] transition-colors"
                >
                  <RefreshCw size={16} />
                  <span>مركز المزامنة</span>
                </button>
                <hr className="my-1 border-slate-100 dark:border-[#1E314E]" />
                {/* حالة قاعدة البيانات */}
                <button
                  type="button"
                  onClick={() => { setIsDbModalOpen(true); setShowMoreMenu(false); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#162542] transition-colors"
                >
                  <CloudLightning size={16} />
                  <span>قاعدة البيانات</span>
                </button>
                <hr className="my-1 border-slate-100 dark:border-[#1E314E]" />
                {/* قطاع (Admin/Dev) */}
                {canManageSectorGate && (
                  <>
                    <div className="px-4 py-1 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">القطاع</div>
                    <button
                      type="button"
                      onClick={() => { setActiveSectorFilter('home'); setShowMoreMenu(false); }}
                      className={`flex w-full items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                        activeSectorFilter === 'home'
                          ? 'bg-[#102b4e] text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10'
                      }`}
                    >
                      🏠 منزلي
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveSectorFilter('electrical'); setShowMoreMenu(false); }}
                      className={`flex w-full items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                        activeSectorFilter === 'electrical'
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/10'
                      }`}
                    >
                      ⚡ كهرباء
                    </button>
                    <hr className="my-1 border-slate-100 dark:border-[#1E314E]" />
                  </>
                )}
                {/* فرع (Admin/Dev) */}
                {(currentUser.role === 'admin' || currentUser.role === 'developer') && (
                  <>
                    <div className="px-4 py-1 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">الفرع</div>
                    <select
                      aria-label="تصفية الفرع"
                      value={selectedBranchFilter}
                      onChange={(e) => { setSelectedBranchFilter(e.target.value); setShowMoreMenu(false); }}
                      className="w-full px-3 py-2 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 bg-transparent border-0 focus:ring-0 cursor-pointer"
                    >
                      <option value="الكل">كل الفروع</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                    <hr className="my-1 border-slate-100 dark:border-[#1E314E]" />
                  </>
                )}
                {/* الوضع الليلي (سطح المكتب 1280px+ - في القائمة أكثر من ذلك) */}
                <button
                  type="button"
                  onClick={() => { toggleTheme(); setShowMoreMenu(false); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#162542] transition-colors"
                >
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                  <span>{isDark ? 'الوضع الفاتح' : 'الوضع الليلي'}</span>
                </button>
                {/* الإعدادات (سطح المكتب 1280px+ - في القائمة أكثر من ذلك) */}
                <button
                  type="button"
                  onClick={() => { setIsSettingsModalOpen(true); setShowMoreMenu(false); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#162542] transition-colors"
                >
                  <Settings size={16} />
                  <span>الإعدادات والخصوصية</span>
                </button>
              </div>
            )}

            {/* البحث (موبايل) */}
            <button
              type="button"
              onClick={() => setIsGlobalSearchOpen(true)}
              className="ds-iconbtn ds-vis-lt-lg"
              title="بحث ذكي"
              aria-label="بحث ذكي"
            >
              <Search aria-hidden="true" />
            </button>

            {/* الإشعارات */}
            {onOpenNotificationCenter && (
              <button
                type="button"
                onClick={onOpenNotificationCenter}
                className="ds-iconbtn"
                title={`الإشعارات (${notificationCount} غير مقروء)`}
                aria-label="مركز الإشعارات"
              >
                <Bell aria-hidden="true" />
                {notificationCount > 0 && <span className="ds-dot" />}
              </button>
            )}

            {/* الطلبية (أيقونة + رقم فقط علىdesktop، النص في ملف الشخصية) */}
            <button
              id="open-cart-btn"
              type="button"
              onClick={onOpenCart}
              className="ds-iconbtn ds-iconbtn--primary ds-vis-ge-md"
              aria-label="الطلبية"
            >
              <ShoppingCart aria-hidden="true" />
              {cartSummary.itemCount > 0 && <span className="ds-count">{cartSummary.itemCount}</span>}
            </button>

            {/* الحساب (لابتوب وتابلت) — الاسمostaqué يعتمد على المساحة */}
            <div className="ds-profile-wrap ds-vis-ge-md">
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="ds-profile"
                title="الملف الشخصي والحساب"
                aria-haspopup="true"
                aria-expanded={showProfileMenu}
              >
                <span className="ds-avatar" aria-hidden="true">
                  <img
                    src={DEFAULT_EXECUTIVE_AVATAR}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover rounded-full"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <span className="ds-avatar-initial">{initial}</span>
                </span>
                <span className="ds-profile__meta ds-vis-ge-lg">
                  <div className="ds-profile__name">{displayName}</div>
                  <div className="ds-profile__role">{roleLabel}</div>
                </span>
              </button>

              {showProfileMenu && (
                <>
                  <div className="ds-backdrop-clear" onClick={() => setShowProfileMenu(false)} aria-hidden="true" />
                  <div className="ds-popover" role="dialog" aria-label="الحساب">
                    <div className="ds-popover__head">
                      <span className="ds-avatar ds-popover__avatar" aria-hidden="true">
                        <img
                          src={DEFAULT_EXECUTIVE_AVATAR}
                          alt={displayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover rounded-2xl"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <span className="ds-avatar-initial">{initial}</span>
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="ds-profile__name" style={{ maxWidth: 'none', fontSize: 15 }}>{displayName}</div>
                        <div className="ds-profile__role" style={{ maxWidth: 'none' }}>{currentUser.email || ''}</div>
                        <span className="ds-chip">{roleLabel}</span>
                      </div>
                    </div>
                    <div className="ds-rows">
                      <div className="ds-row"><span>الفرع المخصص</span><span>{currentUser.branchName || '—'}</span></div>
                      <div className="ds-row">
                        <span>القطاع المسؤول</span>
                        <span>{currentUser.sector === 'electrical' ? 'القطاع الكهربائي' : currentUser.sector === 'both' ? 'منزلي + كهرباء' : 'القطاع المنزلي'}</span>
                      </div>
                      {supervisorName && <div className="ds-row"><span>المشرف المباشر</span><span>{supervisorName}</span></div>}
                      {currentUser.role === 'supervisor' && <div className="ds-row"><span>عدد المناديب</span><span>{supervisedRepsCount}</span></div>}
                      <div className="ds-row"><span>حالة الحساب</span><span style={{ color: 'var(--app-success-text)' }}>مفعّل ونشط</span></div>
                    </div>
                    <button
                      type="button"
                      className="ds-btn ds-btn--danger"
                      onClick={() => { setShowProfileMenu(false); logout(); }}
                    >
                      <LogOut aria-hidden="true" />
                      <span>تسجيل الخروج الآمن</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* زر القائمة (موبايل وتابلت) */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              className="ds-iconbtn ds-vis-lt-lg"
              aria-label="القائمة الرئيسية"
              title="القائمة الرئيسية"
            >
              <Menu aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* القائمة السفلية (موبايل) */}
      <nav className="ds-bottom print:hidden" aria-label="التنقل">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id || activeTab === item.navId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.navId)}
              aria-current={isActive ? 'page' : undefined}
              className="ds-bottom__item"
            >
              <span className="ds-bottom__icon">
                <Icon aria-hidden="true" />
                {item.badge > 0 && <span className="ds-bottom__badge">{item.badge}</span>}
              </span>
              <span className="ds-bottom__label">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setIsMobileDrawerOpen(true)}
          aria-label="القائمة الكاملة"
          className="ds-bottom__item"
        >
          <span className="ds-bottom__icon">
            <Menu aria-hidden="true" />
            {pendingApprovalsCount > 0 && <span className="ds-bottom__badge">{pendingApprovalsCount}</span>}
          </span>
          <span className="ds-bottom__label">المزيد</span>
        </button>
      </nav>

      {/* القائمة المنزلقة الكاملة (موبايل وتابلت) */}
      {isMobileDrawerOpen && (
        <div className="ds-drawer-root ds-vis-lt-lg" dir="rtl">
          <div className="ds-drawer-backdrop" onClick={() => setIsMobileDrawerOpen(false)} aria-hidden="true" />
          <div className="ds-drawer" role="dialog" aria-label="القائمة الكاملة">
            <div className="ds-drawer__head">
              <div className="ds-brand">
                <img src="/icon.svg" alt="طنطاوي جروب" className="ds-brand__logo" />
                <div className="ds-brand__text">
                  <div className="ds-brand__title">طنطاوي جروب للتوزيع</div>
                  <div className="ds-brand__sub">Dream Tantawy</div>
                </div>
              </div>
              <button type="button" className="ds-iconbtn" onClick={() => setIsMobileDrawerOpen(false)} aria-label="إغلاق القائمة">
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="ds-drawer__user">
              <div style={{ minWidth: 0 }}>
                <div className="ds-drawer__name">{displayName}</div>
                <div className="ds-drawer__role">{roleLabel}</div>
                <div className="ds-drawer__branch">{currentUser.branchName}</div>
              </div>
            </div>

            {canManageSectorGate && (
              <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                <div className="text-[10px] font-black mb-1.5" style={{ color: '#9fbdd8', letterSpacing: '0.2px' }}>
                  القطاع المعروض
                </div>
                <div
                  className="grid grid-cols-2 keep-grid gap-1 p-1 rounded-xl"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    gridTemplateColumns: '1fr 1fr',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSectorFilter('home')}
                    className="py-2 rounded-lg text-xs font-black transition cursor-pointer"
                    style={
                      activeSectorFilter === 'home'
                        ? { background: '#0f766e', color: '#ffffff', boxShadow: '0 6px 16px rgba(13,148,136,0.35)' }
                        : { background: 'transparent', color: '#cfe3f2' }
                    }
                  >
                    🏠 منزلي
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSectorFilter('electrical')}
                    className="py-2 rounded-lg text-xs font-black transition cursor-pointer"
                    style={
                      activeSectorFilter === 'electrical'
                        ? { background: '#b45309', color: '#ffffff', boxShadow: '0 6px 16px rgba(217,119,6,0.32)' }
                        : { background: 'transparent', color: '#cfe3f2' }
                    }
                  >
                    ⚡ كهرباء
                  </button>
                </div>
              </div>
            )}

            <div className="ds-drawer__list">
              {groupedNav.map((group) => (
                <div className="ds-drawer__group" key={`drawer-group-${group.id}`}>
                  <div className="ds-drawer__label">{group.label}</div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id || (item.id === 'customers' && activeTab === 'all_customers');
                    const theme = sectionBadgeTheme[item.id] || sectionBadgeTheme.home;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="ds-drawer__item"
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => { setActiveTab(item.id); setIsMobileDrawerOpen(false); }}
                      >
                        <span className={`ds-ico ${theme.bg} ${theme.text} ${theme.darkBg} ${theme.darkText}`}><Icon aria-hidden="true" /></span>
                        <span className="ds-grow">{item.label}</span>
                        {item.promo && <span className="ds-drawer__promo">مميز</span>}
                        {item.badge && item.badge > 0 ? <span className="ds-count">{item.badge}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="ds-drawer__foot">
              <button type="button" className="ds-btn" onClick={() => { onOpenCart(); setIsMobileDrawerOpen(false); }}>
                <ShoppingCart aria-hidden="true" />
                <span>الطلبية{cartSummary.itemCount > 0 ? ` (${cartSummary.itemCount})` : ''}</span>
              </button>
              <button type="button" className="ds-btn" onClick={() => { setIsSettingsModalOpen(true); setIsMobileDrawerOpen(false); }}>
                <Settings aria-hidden="true" />
                <span>إعدادات النظام والخصوصية</span>
              </button>
              {/* تغيير الصورة الشخصية معطّل — الأفاتار الرسمي ثابت */}
              <button type="button" className="ds-btn ds-btn--soft-danger" onClick={() => { setIsMobileDrawerOpen(false); logout(); }}>
                <LogOut aria-hidden="true" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* المودالات بقت lazy — بنركّبها فقط وقت الفتح */}
      {isInstallModalOpen && (
        <Suspense fallback={null}>
          <InstallAppModal
            isOpen={isInstallModalOpen}
            onClose={() => setIsInstallModalOpen(false)}
            installPromptEvent={installPromptEvent}
          />
        </Suspense>
      )}

      {/* System Settings, About & Privacy Modal */}
      {isSettingsModalOpen && (
        <Suspense fallback={null}>
          <SystemSettingsAndAboutModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
          />
        </Suspense>
      )}

      {/* رفع الصورة الشخصية معطّل — الأفاتار الرسمي ثابت */}

      {/* مودال حالة قاعدة البيانات والمزامنة */}
      {isDbModalOpen && (
        <Suspense fallback={null}>
          <DatabaseConnectionModal
            isOpen={isDbModalOpen}
            onClose={() => setIsDbModalOpen(false)}
          />
        </Suspense>
      )}
      {isSyncCenterOpen && (
        <Suspense fallback={null}>
          <SyncStatusCenter
            isOpen={isSyncCenterOpen}
            onClose={() => setIsSyncCenterOpen(false)}
            onOpenPendingSyncPage={() => {
              setIsSyncCenterOpen(false);
              setActiveTab('pending_sync');
            }}
          />
        </Suspense>
      )}

      {/* بحث ذكي عام */}
      {isGlobalSearchOpen && (
        <Suspense fallback={null}>
          <GlobalSearch
            isOpen={isGlobalSearchOpen}
            onClose={() => setIsGlobalSearchOpen(false)}
            allowedTabs={filteredNavItems.map((i) => (i.id === 'customers' ? 'all_customers' : i.id))}
            onNavigate={(tab, q) => {
              if (onGlobalNavigate) onGlobalNavigate(tab, q);
              else setActiveTab(tab);
              setIsGlobalSearchOpen(false);
            }}
          />
        </Suspense>
      )}
    </>
  );
};
