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
  Moon,
  Receipt,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  ShoppingCart,
  Sun,
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
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  Search
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/themeContext';
import { formatCurrency } from '../services/invoiceService';
import { UserRole } from '../types';
import { InstallAppModal } from './InstallAppModal';
import { SystemSettingsAndAboutModal } from './SystemSettingsAndAboutModal';
import { InternalNotificationCenter } from './InternalNotificationCenter';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenCart: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  notificationCount?: number;
  onOpenNotificationCenter?: () => void;
}

const DEFAULT_EXECUTIVE_AVATAR = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80';

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenCart,
  isSidebarCollapsed = false,
  onToggleSidebar,
  notificationCount = 0,
  onOpenNotificationCenter
}) => {
  const { isDark, toggleTheme } = useTheme();
  const {
    currentUser,
    logout,
    users,
    branches,
    invoices,
    getVisibleInvoices,
    isOffline,
    pendingInvoicesCount,
    flushPendingInvoices,
    getCartSummary,
    selectedBranchFilter,
    setSelectedBranchFilter,
    activeSectorFilter,
    setActiveSectorFilter,
    dataSaverMode,
    toggleDataSaverMode,
    isPrivacyMode,
    togglePrivacyMode,
    installPromptEvent,
    isInstallModalOpen,
    setIsInstallModalOpen,
    login
  } = useApp();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

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
    legal_advisor: { label: 'الشؤون القانونية', bg: 'bg-[var(--app-navy)] border-[var(--app-navy)]', text: 'text-[#60a5fa]' }, // صفحة معطلة
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
  
  const userVisibleInvoices = getVisibleInvoices();
  const pendingOrdersCount = userVisibleInvoices.filter((i) =>
    i.status === 'قيد مراجعة المشرف' ||
    i.status === 'معلقة بانتظار اعتماد الفرع' ||
    i.status === 'قيد المراجعة'
  ).length;

  const supervisorName = currentUser.supervisorId
    ? users.find((u) => u.id === currentUser.supervisorId)?.name
    : null;

  const supervisedRepsCount = currentUser.role === 'supervisor'
    ? users.filter((u) => u.supervisorId === currentUser.id).length
    : 0;

  const isFieldRole = currentUser.role === 'sales_rep' || currentUser.role === 'supervisor';

  const navItems = [
    { id: 'home', label: 'الرئيسية', icon: Home, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper'] },
    { id: 'invoices', label: 'أوامر البيع والاعتمادات', icon: Receipt, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'], badge: pendingOrdersCount },
    { id: 'catalog', label: 'الكتالوج', icon: Boxes, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper'] },
    { id: 'customers', label: 'العملاء', icon: Users, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'collection', label: 'تحصيل', icon: Wallet, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'returns', label: 'المرتجعات', icon: RotateCcw, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper'] },
    { id: 'inventory', label: 'المخزون', icon: Layers, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper'] },
    { id: 'targets', label: 'التارجت', icon: Target, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'visits', label: 'الزيارات', icon: CalendarCheck, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'excel', label: 'الإكسل', icon: FileSpreadsheet, roles: ['admin', 'developer'] },
    { id: 'guide', label: 'الدليل', icon: BookOpen, roles: isFieldRole ? [] : ['admin', 'branch_manager', 'developer', 'warehouse_keeper'] },
    { id: 'users', label: 'الفريق', icon: UserCheck, roles: ['admin', 'developer', 'branch_manager', 'supervisor'], badge: pendingApprovalsCount },
    { id: 'permissions', label: 'الصلاحيات', icon: ShieldCheck, roles: ['admin', 'developer'] },

  ];

  const filteredNavItems = navItems.filter((item) => item.roles.includes(currentUser.role));

  const displayName = (currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'مستخدم';
  const initial = displayName.charAt(0);
  const roleLabel = roleNames[currentUser.role]?.label || currentUser.role;
  const activeItem = filteredNavItems.find((i) => i.id === activeTab || (i.id === 'customers' && activeTab === 'all_customers'));

  const bottomItems = [
    { id: 'home', navId: 'home', label: 'الرئيسية', icon: Home, badge: 0 },
    { id: 'invoices', navId: 'invoices', label: 'الطلبات', icon: Receipt, badge: pendingOrdersCount },
    { id: 'customers', navId: 'all_customers', label: 'العملاء', icon: Users, badge: 0 },
    { id: 'targets', navId: 'targets', label: 'التقارير', icon: BarChart3, badge: 0 },
  ].filter((b) => filteredNavItems.some((n) => n.id === b.id || (b.id === 'targets' && filteredNavItems.some(f => f.id === 'targets' || f.id === 'dashboard'))));

  const sectionBadgeTheme: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
    home: { bg: 'bg-blue-100', text: 'text-[#2563EB]', darkBg: 'dark:bg-blue-950/60', darkText: 'dark:text-blue-300' },
    catalog: { bg: 'bg-teal-100', text: 'text-[#0D9488]', darkBg: 'dark:bg-teal-950/60', darkText: 'dark:text-teal-300' },
    invoices: { bg: 'bg-blue-100', text: 'text-[#2563EB]', darkBg: 'dark:bg-blue-950/60', darkText: 'dark:text-blue-300' },
    collection: { bg: 'bg-emerald-100', text: 'text-[#16A34A]', darkBg: 'dark:bg-emerald-950/60', darkText: 'dark:text-emerald-300' },
    customers: { bg: 'bg-indigo-100', text: 'text-[#4F46E5]', darkBg: 'dark:bg-indigo-950/60', darkText: 'dark:text-indigo-300' },
    all_customers: { bg: 'bg-indigo-100', text: 'text-[#4F46E5]', darkBg: 'dark:bg-indigo-950/60', darkText: 'dark:text-indigo-300' },
    visits: { bg: 'bg-purple-100', text: 'text-[#7C3AED]', darkBg: 'dark:bg-purple-950/60', darkText: 'dark:text-purple-300' },
    returns: { bg: 'bg-rose-100', text: 'text-[#DC2626]', darkBg: 'dark:bg-rose-950/60', darkText: 'dark:text-rose-300' },
    returns_customers: { bg: 'bg-rose-100', text: 'text-[#DC2626]', darkBg: 'dark:bg-rose-950/60', darkText: 'dark:text-rose-300' },
    inventory: { bg: 'bg-amber-100', text: 'text-[#D97706]', darkBg: 'dark:bg-amber-950/60', darkText: 'dark:text-amber-300' },
    targets: { bg: 'bg-amber-100', text: 'text-[#F59E0B]', darkBg: 'dark:bg-amber-950/60', darkText: 'dark:text-amber-300' },
    dashboard: { bg: 'bg-purple-100', text: 'text-[#7C3AED]', darkBg: 'dark:bg-purple-950/60', darkText: 'dark:text-purple-300' },
    excel: { bg: 'bg-emerald-100', text: 'text-[#16A34A]', darkBg: 'dark:bg-emerald-950/60', darkText: 'dark:text-emerald-300' },
    users: { bg: 'bg-slate-200', text: 'text-slate-700', darkBg: 'dark:bg-slate-800', darkText: 'dark:text-slate-300' },
    permissions: { bg: 'bg-blue-100', text: 'text-[#2563EB]', darkBg: 'dark:bg-blue-950/60', darkText: 'dark:text-blue-300' },
    guide: { bg: 'bg-teal-100', text: 'text-[#0D9488]', darkBg: 'dark:bg-teal-950/60', darkText: 'dark:text-teal-300' },
  };

  return (
    <>
      <aside className="ds-sidebar print:hidden" aria-label="القائمة الرئيسية" dir="rtl">
        {/* Brand Block */}
        <div className="ds-sidebar__brand">
          <img src="/icon.svg" alt="طنطاوي جروب" className="ds-sidebar__logo" />
          <div className="min-w-0 flex-1">
            <strong>طنطاوي جروب</strong>
            <span>Dream Tantawy</span>
          </div>
        </div>

        {/* User Card in Sidebar */}
        <div className="ds-sidebar__user">
          <div className="ds-sidebar__user-avatar" aria-hidden="true">
            <img
              src={currentUser.avatar || DEFAULT_EXECUTIVE_AVATAR}
              alt={displayName}
              className="w-full h-full object-cover rounded-[10px]"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span className="ds-sidebar__user-avatar-initial">{initial}</span>
          </div>
          <div className="ds-sidebar__user-meta">
            <div className="ds-sidebar__user-name">{displayName}</div>
            <div className="ds-sidebar__user-role">{roleLabel}</div>
            <div className="ds-sidebar__user-branch">{currentUser.branchName || 'الفرع الرئيسي'}</div>
          </div>
        </div>

        <div className="ds-sidebar__section">أقسام المنظومة</div>

        {/* Nav List with colored icon badges */}
        <nav className="ds-sidebar__nav">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id || (item.id === 'customers' && activeTab === 'all_customers');
            const theme = sectionBadgeTheme[item.id] || sectionBadgeTheme.home;
            return (
              <button
                key={`sidebar-${item.id}`}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className="ds-sidebar__item"
              >
                <div className={`ds-sidebar__icon-badge ${theme.bg} ${theme.text} ${theme.darkBg} ${theme.darkText}`}>
                  <Icon className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
                </div>
                <span className="ds-sidebar__label">{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span className="ds-count">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Footer with connection status and dual theme toggle */}
        <div className="ds-sidebar__footer">
          <div className="ds-sidebar__status">
            <span className="flex items-center gap-2">
              <span className="ds-status-dot" />
              <span>{isOffline ? 'وضع عدم الاتصال' : 'متصل بالخادم'}</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">V9.0</span>
          </div>

          <div className="ds-sidebar__theme-toggle" role="group" aria-label="تبديل المظهر">
            <button
              type="button"
              onClick={() => isDark && toggleTheme()}
              className={`ds-sidebar__theme-btn ${!isDark ? 'is-active text-amber-700 dark:text-amber-300' : ''}`}
            >
              <Sun className="w-4 h-4 text-amber-500" />
              <span>نهاري</span>
            </button>
            <button
              type="button"
              onClick={() => !isDark && toggleTheme()}
              className={`ds-sidebar__theme-btn ${isDark ? 'is-active text-blue-700 dark:text-blue-300' : ''}`}
            >
              <Moon className="w-4 h-4 text-blue-500" />
              <span>ليلي</span>
            </button>
          </div>
        </div>
      </aside>
      <header className="ds-topbar print:hidden">
        <div className="ds-topbar__main">
          {/* العلامة + عنوان الصفحة */}
          <div className="ds-brand">
            <img src="/icon.svg" alt="طنطاوي جروب - Tantawy Group" className="ds-brand__logo" />
            <div className="ds-brand__text">
              <div className="ds-brand__title" role="heading" aria-level={1}>{activeItem?.label && activeTab !== 'home' ? activeItem.label : 'طنطاوي جروب'}</div>
              <div className="ds-brand__sub">Dream Tantawy</div>
            </div>
          </div>

          {/* بحث سريع (لابتوب) */}
          <div className="ds-search ds-vis-ge-lg">
            <input
              type="text"
              aria-label="بحث عن عميل"
              placeholder="ابحث عن عميل بالاسم أو رقم الهاتف أو المندوب..."
              onClick={() => {
                if (activeTab !== 'customers' && activeTab !== 'all_customers') {
                  setActiveTab('customers');
                }
              }}
            />
            <Search aria-hidden="true" />
          </div>

          <div className="ds-topbar__spacer" />

          <div className="ds-actions">
            {/* حالة الاتصال */}
            <div className={`ds-status ${isOffline ? 'ds-status--off' : ''}`} title={isOffline ? 'أوفلاين' : 'متصل'}>
              {isOffline ? <WifiOff aria-hidden="true" /> : <Wifi aria-hidden="true" />}
              <span className={isOffline ? '' : 'ds-vis-ge-md'}>{isOffline ? 'أوفلاين' : 'متصل'}</span>
            </div>

            {/* مزامنة الفواتير المعلقة */}
            {pendingInvoicesCount > 0 && (
              <button
                type="button"
                onClick={() => flushPendingInvoices()}
                className="ds-iconbtn ds-iconbtn--primary"
                title="فواتير مسجلة أوفلاين بانتظار المزامنة"
              >
                <RefreshCw aria-hidden="true" />
                <span className="ds-vis-ge-md">مزامنة ({pendingInvoicesCount})</span>
                <span className="ds-count ds-count--float ds-vis-lt-md">{pendingInvoicesCount}</span>
              </button>
            )}

            {/* فلتر الفرع (أدمن / مطور) */}
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

            {/* مبدّل الوضع: لابتوب */}
            <div className="ds-theme-switch ds-vis-ge-lg" role="group" aria-label="وضع العرض">
              <button
                type="button"
                data-mode="dark"
                aria-pressed={isDark}
                onClick={() => !isDark && toggleTheme()}
                title="الوضع الليلي"
                aria-label="الوضع الليلي"
              >
                <Moon aria-hidden="true" />
              </button>
              <button
                type="button"
                data-mode="light"
                aria-pressed={!isDark}
                onClick={() => isDark && toggleTheme()}
                title="الوضع النهاري"
                aria-label="الوضع النهاري"
              >
                <Sun aria-hidden="true" />
              </button>
            </div>

            {/* مبدّل الوضع: موبايل / تابلت */}
            <button
              type="button"
              onClick={toggleTheme}
              className="ds-iconbtn ds-vis-lt-lg"
              title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
              aria-label={isDark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
            >
              {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>

            {/* الإعدادات */}
            <button
              id="navbar-settings-and-about-btn"
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="ds-iconbtn ds-vis-ge-md"
              title="الإعدادات، السياسة والخصوصية، السحابة وCloudinary"
              aria-label="الإعدادات"
            >
              <Settings aria-hidden="true" />
              <span className="ds-vis-ge-xl">الإعدادات</span>
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

            {/* الطلبية */}
            <button
              id="open-cart-btn"
              type="button"
              onClick={onOpenCart}
              className="ds-iconbtn ds-iconbtn--primary ds-vis-ge-md"
              aria-label="الطلبية"
            >
              <ShoppingCart aria-hidden="true" />
              <span className="ds-vis-ge-md">الطلبية</span>
              {cartSummary.itemCount > 0 && <span className="ds-count">{cartSummary.itemCount}</span>}
              {cartSummary.grandTotal > 0 && (
                <span className="ds-vis-ge-lg" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(cartSummary.grandTotal)}
                </span>
              )}
            </button>

            {/* الحساب (لابتوب وتابلت) */}
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
                    src={currentUser.avatar || DEFAULT_EXECUTIVE_AVATAR}
                    alt={displayName}
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
                          src={currentUser.avatar || DEFAULT_EXECUTIVE_AVATAR}
                          alt={displayName}
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
              <button type="button" className="ds-iconbtn" onClick={toggleTheme}>
                {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                <span>{isDark ? 'نهاري' : 'ليلي'}</span>
              </button>
            </div>

            <div className="ds-drawer__list">
              <div className="ds-drawer__label">أقسام النظام المتاحة لحسابك</div>
              {filteredNavItems.map((item) => {
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
                    {item.badge && item.badge > 0 ? <span className="ds-count">{item.badge}</span> : null}
                  </button>
                );
              })}
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
              <button type="button" className="ds-btn ds-btn--soft-danger" onClick={() => { setIsMobileDrawerOpen(false); logout(); }}>
                <LogOut aria-hidden="true" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PWA Install Modal */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        installPromptEvent={installPromptEvent}
      />

      {/* System Settings, About & Privacy Modal */}
      {isSettingsModalOpen && (
        <SystemSettingsAndAboutModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      )}
    </>
  );
};
