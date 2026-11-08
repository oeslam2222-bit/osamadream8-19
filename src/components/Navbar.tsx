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
    { id: 'cadre_lunch', label: 'غداء الكوادر', icon: LayoutDashboard, roles: ['admin', 'developer', 'branch_manager', 'supervisor', 'sales_rep', 'warehouse_keeper'] },
  ];

  const filteredNavItems = navItems.filter((item) => item.roles.includes(currentUser.role));

  return (
    <>
      <header className="tantawy-topbar sticky top-0 z-40 border-b border-slate-200 dark:border-[#26364D] bg-white/95 dark:bg-[#111C2E]/95 text-slate-900 dark:text-[#F1F5F9] shadow-sm backdrop-blur-xl transition-colors duration-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-2 py-2 sm:px-4 sm:py-2.5">
          
          {/* Mobile Header Bar */}
          <div className="flex items-center gap-2 sm:gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="القائمة الرئيسية"
              title="القائمة الرئيسية"
              className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-teal-500/30 bg-slate-100 dark:bg-[#0f2b38] px-2.5 text-[11px] font-black text-teal-700 dark:text-[#5eead4] shadow-sm transition hover:bg-slate-200 dark:hover:bg-[#163b45]"
            >
              <Menu className="h-4 w-4 shrink-0" />
              <span>القائمة</span>
            </button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-teal-500/60 bg-teal-50 dark:bg-[#0f2b38] p-1 shadow-sm">
              <img src="/icon.svg" alt="طنطاوي جروب - Tantawy Group" className="h-full w-full object-contain" />
            </div>
            <div>
              <h1 className="flex items-center gap-1 text-sm font-black tracking-tight text-slate-900 dark:text-white sm:text-base">
                <span>طنطاوي جروب</span>
              </h1>
              <p className="hidden text-[10px] text-slate-500 dark:text-slate-300 sm:block">Dream Tantawy</p>
            </div>
          </div>

          {/* Desktop Right Section: User Profile & Dual Sun/Moon Switcher (Matches Mockup) */}
          <div className="hidden lg:flex items-center gap-3">
            {/* User Profile Pill */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2.5 bg-slate-50 dark:bg-[#17243A] hover:bg-slate-100 dark:hover:bg-[#1e2f4a] active:scale-98 px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-[#26364D] transition cursor-pointer shadow-xs"
                title="الملف الشخصي والحساب"
              >
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-tr from-[#2563EB] to-teal-600 text-white text-xs font-black flex items-center justify-center shadow-xs"
                  >
                    {((currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أ').charAt(0)}
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#16A34A] rounded-full border-2 border-white dark:border-[#17243A]" />
                </div>
                <div className="text-right">
                  <div className="text-xs font-black text-slate-900 dark:text-white leading-tight">
                    {(currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أحمد محمد'}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                    {roleNames[currentUser.role]?.label || 'مدير الإدارة'}
                  </div>
                </div>
                <span className="text-xs text-slate-400 mr-0.5">▼</span>
              </button>

              {/* Profile Card Popup */}
              {showProfileMenu && (
                <div className="fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:right-0 mt-2 w-auto sm:w-80 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] rounded-3xl shadow-2xl p-4 z-[60] animate-in fade-in zoom-in-95 text-xs text-slate-900 dark:text-white">
                  {/* Profile Header */}
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-[#26364D]">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#2563EB] to-[#0D9488] text-white flex items-center justify-center font-black text-lg shadow-md">
                        {((currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أ').charAt(0)}
                      </div>
                      <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-[#16A34A] rounded-full border-2 border-white dark:border-[#111C2E]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="font-black text-sm text-slate-900 dark:text-white truncate">
                        {(currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أحمد محمد'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {currentUser.email || 'user@tantawy.com'}
                      </div>
                      <div className="mt-1.5 inline-block text-[10px] px-2.5 py-0.5 rounded-full font-black bg-[#2563EB]/15 text-[#2563EB] dark:text-[#93C5FD] border border-[#2563EB]/30">
                        {roleNames[currentUser.role]?.label || currentUser.role}
                      </div>
                    </div>
                  </div>

                  {/* Account Information Rows */}
                  <div className="py-3 space-y-2 text-[11px] border-b border-slate-200 dark:border-[#26364D] text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold">الفرع المخصص:</span>
                      <span className="font-black text-[#0D9488] dark:text-[#5eead4] truncate max-w-[180px]">
                        {currentUser.branchName || 'الفرع الرئيسي - 6 أكتوبر'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold">القطاع المسؤول:</span>
                      <span className="font-black text-[#2563EB] dark:text-[#93C5FD]">
                        {currentUser.sector === 'electrical' ? 'القطاع الكهربائي' : currentUser.sector === 'both' ? 'منزلي + كهرباء' : 'القطاع المنزلي'}
                      </span>
                    </div>

                    {supervisorName && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-bold">المشرف المباشر:</span>
                        <span className="font-black text-slate-900 dark:text-white">{supervisorName}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold">حالة الحساب:</span>
                      <span className="text-[#16A34A] dark:text-[#86EFAC] font-black flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>مفعّل ونشط</span>
                      </span>
                    </div>
                  </div>

                  {/* Clean Logout Button */}
                  <div className="pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        logout();
                      }}
                      className="w-full bg-[#DC2626] hover:bg-[#B91C1C] active:scale-98 text-white font-black py-2.5 rounded-2xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <LogOut className="w-4 h-4 text-white" />
                      <span className="font-black">تسجيل الخروج الآمن</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Dual Sun / Moon Switcher Pill (Matching the Top Header of Screenshot) */}
            <div
              className="flex items-center p-1 rounded-full border border-slate-200 dark:border-[#26364D] bg-slate-100 dark:bg-[#17243A] shadow-inner"
              title={isDark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
            >
              <button
                type="button"
                onClick={() => !isDark && toggleTheme()}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 cursor-pointer ${
                  isDark
                    ? 'bg-[#2563EB] text-white shadow-sm ring-1 ring-[#2563EB]/50 scale-105'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                aria-label="الوضع الليلي"
                title="الوضع الليلي"
              >
                <Moon className="w-4 h-4 stroke-[2.2]" />
              </button>
              <button
                type="button"
                onClick={() => isDark && toggleTheme()}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 cursor-pointer ${
                  !isDark
                    ? 'bg-[#F59E0B] text-white shadow-sm ring-1 ring-[#F59E0B]/50 scale-105'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                aria-label="الوضع النهاري"
                title="الوضع النهاري"
              >
                <Sun className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>
          </div>

          {/* Desktop Center Section: Quick Search Pill (Matching Screenshot) */}
          <div className="hidden lg:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="يبحث عن عميل بالاسم أو رقم الهاتف أو المندوب..."
                onClick={() => {
                  if (activeTab !== 'customers' && activeTab !== 'all_customers') {
                    setActiveTab('customers');
                  }
                }}
                className="w-full pl-4 pr-10 py-2 rounded-2xl bg-slate-100 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] text-slate-800 dark:text-slate-200 placeholder-slate-400 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#2563EB] transition shadow-inner"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Left Controls & Brand Block */}
          <div className="flex items-center gap-1.5 sm:gap-2">

            {/* Offline / Online Status Badge */}
            <div className={`flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-bold shadow-xs ${
              isOffline
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            }`}>
              {isOffline ? (
                <>
                  <WifiOff className="h-3.5 w-3.5 animate-pulse text-amber-500" />
                  <span className="text-[11px] font-black">أوفلاين</span>
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="hidden md:inline">متصل</span>
                </>
              )}
            </div>

            {/* Mobile Dual Theme Toggle */}
            <div className="flex lg:hidden items-center p-0.5 rounded-full border border-slate-200 dark:border-[#26364D] bg-slate-100 dark:bg-[#17243A]">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center justify-center w-8 h-8 rounded-full text-slate-700 dark:text-slate-200"
                title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
              >
                {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-500" />}
              </button>
            </div>

            {/* Settings Button */}
            <button
              id="navbar-settings-and-about-btn"
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95"
              title="الإعدادات، السياسة والخصوصية، السحابة وCloudinary"
            >
              <Settings className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              <span className="hidden xl:inline">الإعدادات</span>
            </button>

            {/* Notifications Button */}
            {onOpenNotificationCenter && (
              <button
                type="button"
                onClick={onOpenNotificationCenter}
                className="group relative flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95"
                title={`الإشعارات (${notificationCount} غير مقروء)`}
                aria-label="مركز الإشعارات"
              >
                <Bell className={`h-4 w-4 shrink-0 ${notificationCount > 0 ? 'animate-bounce text-[#DC2626]' : 'text-slate-600 dark:text-slate-300'}`} />
                {notificationCount > 0 && (
                  <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#0f172a] bg-[#DC2626]" />
                )}
                <span className="hidden xl:inline">الإشعارات</span>
              </button>
            )}

            {/* Pending Invoices Sync Button */}
            {pendingInvoicesCount > 0 && (
              <button
                type="button"
                onClick={() => flushPendingInvoices()}
                className="flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-3 h-10 rounded-xl text-xs font-black transition cursor-pointer shadow-sm animate-pulse border border-[#2563EB]"
                title="فواتير مسجلة أوفلاين بانتظار المزامنة"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>مزامنة ({pendingInvoicesCount})</span>
              </button>
            )}

            {/* Branch Filter for Admin & Developer */}
            {(currentUser.role === 'admin' || currentUser.role === 'developer') && (
              <div className="relative hidden xl:block">
                <select
                  aria-label="تصفية الفرع"
                  value={selectedBranchFilter}
                  onChange={(e) => setSelectedBranchFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-[#17243A] text-slate-800 dark:text-slate-200 text-xs rounded-xl px-2.5 h-10 border border-slate-200 dark:border-[#26364D] focus:outline-none focus:border-[#2563EB] font-bold"
                >
                  <option value="الكل">كل الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Cart Button */}
            <button
              id="open-cart-btn"
              onClick={onOpenCart}
              className="relative hidden sm:flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-black px-3.5 h-10 rounded-xl shadow-md transition transform active:scale-95 cursor-pointer min-w-[44px]"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="text-xs">الطلبية</span>
              {cartSummary.itemCount > 0 && (
                <span className="bg-amber-400 text-slate-950 text-xs px-1.5 py-0.2 rounded-full font-black min-w-[20px] text-center">
                  {cartSummary.itemCount}
                </span>
              )}
              {cartSummary.grandTotal > 0 && (
                <span className="hidden lg:inline text-xs bg-white/20 px-1.5 py-0.5 rounded text-white font-extrabold font-mono">
                  {formatCurrency(cartSummary.grandTotal)}
                </span>
              )}
            </button>

            {/* Brand Logo & Title on Desktop (Matching Screenshot top right/brand) */}
            <div className="hidden lg:flex items-center gap-2.5 pr-2 mr-1 border-r border-slate-200 dark:border-[#26364D]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-teal-500/40 bg-teal-50 dark:bg-[#0f2b38] p-1 shadow-sm">
                <img src="/icon.svg" alt="طنطاوي جروب" className="h-full w-full object-contain" />
              </div>
              <div className="text-right">
                <div className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-none">
                  طنطاوي جروب
                </div>
                <div className="text-[10px] text-[#0D9488] font-bold mt-0.5 tracking-wider">
                  Dream Tantawy
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Navigation Tabs Bar (Desktop and Tablets) */}
        <div className="hidden lg:block bg-slate-50 dark:bg-[#0B1220] border-t border-slate-200 dark:border-[#26364D] px-2 sm:px-6 overflow-x-auto no-scrollbar transition-colors">
          <div className="max-w-7xl mx-auto flex items-center gap-1.5 sm:gap-2 py-2">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-[#2563EB] text-white shadow-sm ring-1 ring-[#2563EB]/40'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#17243A] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}>
                    <Icon className="w-3.5 h-3.5 stroke-[2.2]" />
                  </div>
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                        isActive ? 'bg-white text-[#2563EB]' : 'bg-[#DC2626] text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <aside className={`tantawy-sidebar print:hidden ${effectiveSidebarCollapsed ? 'is-collapsed' : ''} bg-white dark:bg-[#111C2E] border-l border-slate-200 dark:border-[#26364D] text-slate-900 dark:text-[#F1F5F9] transition-colors`} aria-label="التنقل الرئيسي">
        {effectiveSidebarCollapsed ? (
          /* Collapsed Smart Mini Rail (Allows maximum screen space for Catalog) */
          <div className="flex flex-col items-center h-full">
            {/* Expand Toggle Button & Logo */}
            <div className="pb-4 border-b border-slate-200 dark:border-white/10 w-full flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleToggleSidebar}
                title="توسيع القائمة الجانبية"
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-[#2563EB] dark:text-[#5eead4] flex items-center justify-center transition cursor-pointer active:scale-95 shadow-2xs"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <img src="/icon.svg" alt="طنطاوي جروب" className="w-9 h-9 rounded-xl object-contain shadow-xs border border-teal-500/40" />
            </div>

            {/* Nav Icon Rail */}
            <nav className="space-y-2 pt-4 flex-1 w-full flex flex-col items-center">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition cursor-pointer group ${
                      isActive
                        ? 'bg-[#2563EB] text-white font-black shadow-md'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-[#2563EB] dark:group-hover:text-[#5eead4]'}`} />
                    {item.badge && item.badge > 0 ? (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[#DC2626] px-1 text-center text-[9px] font-black text-white flex items-center justify-center shadow-xs">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            {/* Mini User Avatar at Bottom */}
            <div className="pt-4 border-t border-slate-200 dark:border-white/10 w-full flex flex-col items-center">
              <div
                title={`${currentUser.name} (${roleNames[currentUser.role]?.label || currentUser.role}) - ${currentUser.branchName}`}
                className="w-9 h-9 rounded-full bg-[#2563EB] text-white font-black text-xs flex items-center justify-center cursor-pointer shadow-xs"
              >
                {(currentUser.name || '').trim().charAt(0)}
              </div>
            </div>
          </div>
        ) : (
          /* Full Expanded Sidebar */
          <>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10 px-1">
              <div className="flex items-center gap-2.5">
                <img src="/icon.svg" alt="طنطاوي جروب" className="w-10 h-10 rounded-xl object-contain shrink-0 border border-teal-500/40 shadow-xs" />
                <div>
                  <div className="font-black text-sm text-slate-900 dark:text-white">طنطاوي جروب</div>
                  <div className="text-[10px] text-[#0D9488] font-bold">Tantawy Group</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleSidebar}
                title="تصغير القائمة لتوسيع مساحة عرض المنتجات"
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-[#2563EB] dark:text-[#5eead4] flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="px-2 pt-4 pb-2 text-[10px] font-bold text-slate-500 dark:text-[#60a5fa]">
              <span>القائمة الرئيسية</span>
            </div>

            <nav className="space-y-1">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-xl text-right text-sm transition cursor-pointer ${
                      isActive
                        ? 'bg-[#2563EB] text-white font-bold shadow-sm'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white font-medium'
                    }`}
                  >
                    <Icon className={`w-[19px] h-[19px] shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <span className={`min-w-5 rounded-full px-1.5 text-center text-[10px] font-black ${
                        isActive ? 'bg-white text-[#2563EB]' : 'bg-[#DC2626] text-white'
                      }`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 border-t border-slate-200 dark:border-white/10 pt-4 px-2 text-[11px] leading-6 text-slate-600 dark:text-[#60a5fa]">
              <div className="font-bold text-slate-900 dark:text-white">{currentUser.name}</div>
              <div>{roleNames[currentUser.role]?.label || currentUser.role}</div>
              <div className="mt-0.5 text-[#0D9488] font-bold">{currentUser.branchName}</div>
            </div>
          </>
        )}
      </aside>

      <nav className="tantawy-mobile-nav lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#111C2E]/95 text-slate-900 dark:text-white border-t border-slate-200 dark:border-[#26364D] flex items-center justify-around py-2 px-2.5 pb-4 shadow-2xl backdrop-blur-lg safe-area-inset-bottom print:hidden transition-colors" aria-label="التنقل">
        <div className="flex w-full items-center justify-around gap-1">
            {[
              { id: 'catalog', label: 'الكتالوج', icon: Boxes, badge: cartSummary.itemCount },
              { id: 'invoices', label: 'أوامر البيع', icon: Receipt },
              { id: 'home', label: 'الرئيسية', icon: Home },
              { id: 'all_customers', label: 'العملاء', icon: Users },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id || (item.id === 'all_customers' && activeTab === 'customers');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition-all cursor-pointer min-h-[48px] rounded-2xl ${
                    isActive
                      ? 'bg-[#2563EB] text-white font-black shadow-md shadow-blue-500/20 scale-[1.02]'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 font-bold hover:scale-[1.02]'
                  }`}
                >
                  <div className="relative">
                    <Icon className={`w-5 h-5 mb-0.5 transition-transform ${isActive ? 'scale-110 text-white stroke-[2.5]' : 'stroke-[2] text-slate-500 dark:text-slate-400'}`} />
                    {item.badge && item.badge > 0 ? (
                      <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-[#DC2626] text-white font-black text-[9px] flex items-center justify-center px-1 shadow-sm">
                        {item.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[10px] tracking-tight truncate font-black">{item.label}</span>
                </button>
              );
            })}

            {/* Mobile Drawer Open Button */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="القائمة الكاملة"
              className="relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition cursor-pointer min-h-[48px] rounded-2xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 font-bold"
            >
              <div className="relative">
                <Menu className="w-5 h-5 mb-0.5 stroke-[2.2] text-[#2563EB] dark:text-teal-300" />
                {pendingApprovalsCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-[#DC2626] text-white font-black text-[9px] flex items-center justify-center px-1 shadow-sm">
                    {pendingApprovalsCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight truncate font-black text-slate-700 dark:text-slate-200">القائمة</span>
            </button>
        </div>
      </nav>

      {/* Complete Mobile Navigation Slide-Over Drawer */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end" dir="rtl">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setIsMobileDrawerOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-full max-w-xs sm:max-w-sm bg-white dark:bg-[#0B1220] text-slate-900 dark:text-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200 border-l border-slate-200 dark:border-white/10">
            {/* Drawer Header */}
            <div className="p-4 bg-slate-50 dark:bg-[#0d1d31] border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src="/icon.svg" alt="طنطاوي جروب" className="w-10 h-10 rounded-xl object-contain border border-teal-500/40 shadow-sm" />
                <div>
                  <div className="font-black text-sm text-slate-900 dark:text-white tracking-tight">طنطاوي جروب للتوزيع</div>
                  <div className="text-[10px] text-[#0D9488] font-bold">Dream Tantawy</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white flex items-center justify-center transition cursor-pointer"
                title="إغلاق القائمة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Profile Summary & Quick Theme Toggle in Drawer */}
            <div className="px-4 py-3.5 bg-slate-100/70 dark:bg-[#071220] border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div>
                <div className="font-black text-sm text-slate-900 dark:text-white">{currentUser.name}</div>
                <div className="text-[11px] text-[#2563EB] dark:text-teal-400 font-extrabold">{roleNames[currentUser.role]?.label || currentUser.role}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-300 font-medium">{currentUser.branchName}</div>
              </div>

              {/* Theme Toggle Pill in Drawer */}
              <div className="flex items-center p-1 rounded-full border border-slate-200 dark:border-[#26364D] bg-white dark:bg-[#17243A]">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-slate-800 dark:text-slate-200"
                >
                  {isDark ? (
                    <>
                      <Sun className="w-4 h-4 text-amber-400" />
                      <span>نهاري</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-4 h-4 text-blue-600" />
                      <span>ليلي</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Nav Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 pb-6">
              <div className="text-[10.5px] font-black text-[#0D9488] px-2 pb-1 uppercase tracking-wider">
                <span>أقسام النظام المتاحة لحسابك</span>
              </div>
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileDrawerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl text-right text-xs font-bold transition cursor-pointer ${
                      isActive
                        ? 'bg-[#2563EB] text-white font-black shadow-md border border-[#2563EB]'
                        : 'text-slate-800 dark:text-slate-100 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-white/[0.06] hover:bg-slate-100 dark:hover:bg-white/[0.12] border border-slate-200 dark:border-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-teal-500/15 text-slate-700 dark:text-teal-300'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[13px] font-black">{item.label}</span>
                    </div>
                    {item.badge && item.badge > 0 ? (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        isActive ? 'bg-white text-[#2563EB]' : 'bg-[#DC2626] text-white shadow-xs'
                      }`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-slate-200 dark:border-white/10 space-y-2 bg-slate-50 dark:bg-[#091b29] pb-8">
              <button
                type="button"
                onClick={() => {
                  setIsSettingsModalOpen(true);
                  setIsMobileDrawerOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-800 dark:text-white text-xs font-bold transition cursor-pointer shadow-sm"
              >
                <Settings className="w-4 h-4 text-[#0D9488]" />
                <span>إعدادات النظام والخصوصية</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-rose-50 dark:bg-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-600 text-[#DC2626] dark:text-rose-200 hover:text-white border border-rose-200 dark:border-rose-500/40 text-xs font-bold transition cursor-pointer shadow-sm"
              >
                <LogOut className="w-4 h-4" />
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

