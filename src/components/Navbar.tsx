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
  PackageSearch
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
  ];

  const filteredNavItems = navItems.filter((item) => item.roles.includes(currentUser.role));

  return (
    <>
      <header className="tantawy-topbar sticky top-0 z-40 border-b border-[var(--app-line)] bg-gradient-to-r from-[#09111a] via-[#111c2a] to-[#0f1f2d] text-slate-100 shadow-[0_12px_30px_rgba(2,6,23,0.25)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-2 py-2 sm:px-6 sm:py-2.5">
          <div className="hidden rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-slate-200 shadow-inner lg:block">
            {todayLabel}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="القائمة الرئيسية"
              title="القائمة الرئيسية"
              className="flex h-10 items-center gap-1.5 rounded-xl border border-[#3dd8b0]/40 bg-[#0f2b38] px-2.5 text-[11px] font-black text-[#5eead4] shadow-lg shadow-[#0f2b38]/30 transition hover:bg-[#163b45]"
            >
              <Menu className="h-4 w-4 shrink-0" />
              <span>القائمة</span>
            </button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-[#3dd8b0]/80 bg-[#0f2b38] p-1 shadow-md shadow-[#3dd8b0]/20 sm:h-10 sm:w-10">
              <img src="/icon.svg" alt="طنطاوي جروب - Tantawy Group" className="h-full w-full object-contain" />
            </div>
            <div>
              <h1 className="flex items-center gap-1 text-sm font-black tracking-tight text-white sm:text-base">
                <span>طنطاوي جروب</span>
              </h1>
              <p className="hidden text-[10px] text-slate-300 sm:block">تطبيق المبيعات</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            
            {/* Offline / Online Status Badge */}
            <div className={`flex h-11 items-center gap-1 rounded-full border px-2.5 text-xs font-bold shadow-inner ${
              isOffline ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            }`}>
              {isOffline ? (
                <>
                  <WifiOff className="h-3.5 w-3.5 animate-pulse text-amber-300" />
                  <span className="text-[11px] font-black">أوفلاين</span>
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-300" />
                  <span className="hidden md:inline">متصل</span>
                </>
              )}
            </div>

            <button
              id="navbar-settings-and-about-btn"
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-100 transition hover:bg-white/10 active:scale-95"
              title="الإعدادات، السياسة والخصوصية، معلومات المنظومة، والقائمين على الفكرة"
            >
              <Settings className="h-4 w-4 text-slate-200" />
              <span className="hidden sm:inline">الإعدادات</span>
            </button>

            {/* Notifications Button */}
            {onOpenNotificationCenter && (
              <button
                type="button"
                onClick={onOpenNotificationCenter}
                className="group relative flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-100 transition hover:bg-white/10 active:scale-95"
                title={`الإشعارات (${notificationCount} غير مقروء)`}
                aria-label="مركز الإشعارات"
              >
                <Bell className={`h-4 w-4 shrink-0 ${notificationCount > 0 ? 'animate-bounce text-rose-400' : 'text-slate-200'}`} />
                {notificationCount > 0 && (
                  <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0f172a] bg-rose-500"></span>
                )}
                <span className="hidden sm:inline">الإشعارات</span>
              </button>
            )}

            {/* Dark mode toggle */}
            <button
              id="navbar-dark-mode-toggle"
              type="button"
              onClick={toggleTheme}
              className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-black text-slate-100 transition hover:bg-white/10 active:scale-95"
              title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
            >
              {isDark ? (
                <>
                  <Sun className="h-4 w-4 shrink-0 text-[#f4d48c]" />
                  <span className="hidden sm:inline">النهاري</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 shrink-0 text-indigo-300" />
                  <span className="hidden sm:inline">الليلي</span>
                </>
              )}
            </button>

            {/* Pending Invoices Sync Button for Offline/Queued Orders */}
            {pendingInvoicesCount > 0 && (
              <button
                type="button"
                onClick={() => flushPendingInvoices()}
                className="flex items-center justify-center gap-1.5 bg-[var(--app-accent)] hover:brightness-95 text-white px-3 h-11 rounded-xl text-xs font-black transition cursor-pointer shadow-sm animate-pulse border border-[var(--app-accent)]"
                title="فواتير مسجلة أوفلاين بانتظار المزامنة مع السيرفر"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>مزامنة ({pendingInvoicesCount})</span>
              </button>
            )}

            {/* Pending Users Notification for Admin / Developer (Hidden for reps/supervisors) */}
            {(currentUser.role === 'admin' || currentUser.role === 'developer') && pendingApprovalsCount > 0 && (
              <button
                onClick={() => setActiveTab('users')}
                className="flex items-center justify-center gap-1 bg-[rgba(179,74,74,.08)] hover:bg-[rgba(179,74,74,.14)] border border-[rgba(179,74,74,.3)] text-[var(--app-risk)] px-2.5 h-11 rounded-xl text-xs font-bold transition animate-pulse"
                title="يوجد طلبات انضمام جديدة بانتظار التفعيل"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>{pendingApprovalsCount}</span>
              </button>
            )}

            {/* Branch Filter for Admin & Developer (Desktop only) */}
            {(currentUser.role === 'admin' || currentUser.role === 'developer') && (
              <div className="relative hidden lg:block">
                <select
                  aria-label="تصفية الفرع"
                  value={selectedBranchFilter}
                  onChange={(e) => setSelectedBranchFilter(e.target.value)}
                  className="bg-white text-slate-700 text-xs rounded-xl px-2.5 h-11 border border-[var(--app-line)] focus:outline-none focus:border-[var(--app-accent)] font-bold"
                >
                  <option value="الكل">كل الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}



            {/* User Profile Menu with Logout */}
            {/* User Profile Menu with Logout */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 bg-white hover:bg-slate-50 active:bg-slate-100 px-3 h-11 rounded-2xl border border-[var(--app-line)] transition cursor-pointer shadow-2xs"
                title="الملف الشخصي والحساب"
              >
                <span
                  aria-hidden="true"
                  className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-tr from-slate-900 to-[var(--app-accent)] text-white text-xs font-black flex items-center justify-center shadow-xs"
                >
                  {((currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أ').charAt(0)}
                </span>
                <div className="text-right hidden md:block">
                  <div className="text-xs font-black text-slate-900 flex items-center gap-1">
                    {(currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أسامة'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold">
                    {roleNames[currentUser.role]?.label || currentUser.role}
                  </div>
                </div>
                <span className="text-xs text-slate-400 mr-0.5">▼</span>
              </button>

              {/* Profile Card Popup */}
              {showProfileMenu && (
                <div className="fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:left-0 mt-2 w-auto sm:w-80 bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl p-4 z-[60] animate-in fade-in zoom-in-95 text-xs text-white">
                  
                  {/* Profile Header */}
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-800/80">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[var(--app-accent)] to-teal-700 text-white flex items-center justify-center font-black text-lg shadow-md">
                        {((currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أ').charAt(0)}
                      </div>
                      <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-[var(--app-ok)] rounded-full border-2 border-slate-950" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="font-black text-sm text-white truncate">
                        {(currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أسامة'}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {currentUser.email || 'Osama@dream.com'}
                      </div>
                      <div className="mt-1.5 inline-block text-[10px] px-2.5 py-0.5 rounded-full font-black bg-[var(--app-accent)] text-white border border-[var(--app-accent)]">
                        {roleNames[currentUser.role]?.label || currentUser.role || 'المطور التقني'}
                      </div>
                    </div>
                  </div>

                  {/* Account Information Rows */}
                  <div className="py-3 space-y-2 text-[11px] border-b border-slate-800/80 text-slate-300">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold">الفرع المخصص:</span>
                      <span className="font-black text-[#5eead4] truncate max-w-[180px]">
                        {currentUser.branchName || 'الفرع الرئيسي - 6 أكتوبر'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold">القطاع المسؤول:</span>
                      <span className="font-black text-[#0d9488]">
                        {currentUser.sector === 'electrical' ? 'القطاع الكهربائي' : currentUser.sector === 'both' ? 'منزلي + كهرباء' : 'القطاع المنزلي'}
                      </span>
                    </div>

                    {supervisorName && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-bold">المشرف المباشر:</span>
                        <span className="font-black text-[#60a5fa]">{supervisorName}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold">حالة الحساب:</span>
                      <span className="text-[#0d9488] font-black flex items-center gap-1">
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
                      className="w-full bg-[var(--app-risk)] hover:bg-[var(--app-risk)] active:scale-98 text-white font-black py-2.5 rounded-2xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <LogOut className="w-4 h-4 text-white" />
                      <span className="font-black">تسجيل الخروج الآمن</span>
                    </button>
                  </div>

                </div>
              )}
            </div>

            {/* Dark mode toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? 'الوضع الفاتح (نهار)' : 'الوضع الليلي (ظلام)'}
              aria-label={isDark ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الليلي'}
              className="flex items-center justify-center w-12 h-12 shrink-0 rounded-xl border-2 border-[var(--app-line)] bg-white text-[var(--app-navy)] hover:bg-slate-50 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              <span className="text-xl font-bold">{isDark ? '☀️' : '🌙'}</span>
              <span className="hidden sm:inline text-[10px] font-black ml-1">{isDark ? 'نهار' : 'ليل'}</span>
            </button>

            {/* Notification Center */}
            <InternalNotificationCenter onNavigateToTab={setActiveTab} />

            {/* Mobile-only quick logout — visible affordance for phone users */}
            <button
              type="button"
              onClick={() => logout()}
              title="تسجيل الخروج"
              aria-label="تسجيل الخروج من التطبيق"
              className="lg:hidden flex items-center justify-center w-11 h-11 shrink-0 rounded-xl border border-[var(--app-line)] bg-white text-[var(--app-risk)] hover:bg-red-soft2 active:scale-95 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Top Bar Cart Button — desktop only; mobile uses bottom nav */}
            <button
              id="open-cart-btn"
              onClick={onOpenCart}
              className="relative hidden lg:flex items-center justify-center gap-1.5 bg-[var(--app-navy)] hover:bg-blue-deep5 text-white font-black px-3 h-11 rounded-xl shadow-md transition transform active:scale-95 cursor-pointer min-w-[44px]"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden xs:inline text-xs">الطلبية</span>
              {cartSummary.itemCount > 0 && (
                <span className="bg-[var(--app-accent)] text-deep-navy text-xs px-1.5 py-0.2 rounded-full font-black min-w-[20px] text-center">
                  {cartSummary.itemCount}
                </span>
              )}
              {cartSummary.grandTotal > 0 && (
                <span className="hidden lg:inline text-xs bg-white/15 px-1.5 py-0.5 rounded text-white font-extrabold">
                  {formatCurrency(cartSummary.grandTotal)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar (Desktop and Tablets) */}
        <div className="hidden bg-slate-950/60 border-t border-slate-800/80 px-2 sm:px-6 overflow-x-auto no-scrollbar">
          <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 py-1.5">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-[var(--app-accent)] text-white shadow-sm font-bold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#5eead4]'}`} />
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                        isActive ? 'bg-slate-950 text-[#5eead4]' : 'bg-[var(--app-risk)] text-white'
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

      <aside className={`tantawy-sidebar print:hidden ${effectiveSidebarCollapsed ? 'is-collapsed' : ''}`} aria-label="التنقل الرئيسي">
        {effectiveSidebarCollapsed ? (
          /* Collapsed Smart Mini Rail (Allows maximum screen space for Catalog) */
          <div className="flex flex-col items-center h-full">
            {/* Expand Toggle Button & Logo */}
            <div className="pb-4 border-b border-white/10 w-full flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleToggleSidebar}
                title="توسيع القائمة الجانبية"
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-[#5eead4] flex items-center justify-center transition cursor-pointer active:scale-95 shadow-2xs"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <img src="/icon.svg" alt="طنطاوي جروب" className="w-9 h-9 rounded-xl object-contain shadow-xs border border-[var(--app-ok)]" />
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
                        ? 'bg-[var(--app-accent)] text-white font-black shadow-md'
                        : 'text-blue-soft3 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-blue-soft2 group-hover:text-[#5eead4]'}`} />
                    {item.badge && item.badge > 0 ? (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[var(--app-risk)] px-1 text-center text-[9px] font-black text-white flex items-center justify-center shadow-xs">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            {/* Mini User Avatar at Bottom */}
            <div className="pt-4 border-t border-white/10 w-full flex flex-col items-center">
              <div
                title={`${currentUser.name} (${roleNames[currentUser.role]?.label || currentUser.role}) - ${currentUser.branchName}`}
                className="w-9 h-9 rounded-full bg-[var(--app-accent)] text-white font-black text-xs flex items-center justify-center cursor-pointer shadow-xs"
              >
                {(currentUser.name || '').trim().charAt(0)}
              </div>
            </div>
          </div>
        ) : (
          /* Full Expanded Sidebar */
          <>
            <div className="flex items-center justify-between pb-4 border-b border-white/10 px-1">
              <div className="flex items-center gap-2.5">
                <img src="/icon.svg" alt="طنطاوي جروب" className="w-10 h-10 rounded-xl object-contain shrink-0 border border-[var(--app-ok)] shadow-xs" />
                <div>
                  <div className="font-black text-sm text-white">طنطاوي جروب</div>
                  <div className="text-[10px] text-[#0d9488] font-semibold">Tantawy Group</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleSidebar}
                title="تصغير القائمة لتوسيع مساحة عرض المنتجات"
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-[#5eead4] flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="px-2 pt-4 pb-2 text-[10px] font-bold text-[#60a5fa]">
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
                    className={`relative w-full flex items-center gap-3 px-3 rounded-xl text-right text-sm transition cursor-pointer ${
                      isActive ? 'bg-white/[0.08] text-white font-semibold' : 'text-blue-soft3 hover:bg-white/[0.08] hover:text-white font-medium'
                    }`}
                  >
                    <Icon className={`w-[19px] h-[19px] shrink-0 ${isActive ? 'text-[var(--app-accent)]' : 'text-blue-soft2'}`} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <span className="min-w-5 rounded-full bg-[var(--app-risk)] px-1.5 text-center text-[10px] font-black text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 border-t border-white/10 pt-4 px-2 text-[11px] leading-6 text-[#60a5fa]">
              <div className="font-bold text-white">{currentUser.name}</div>
              <div>{roleNames[currentUser.role]?.label || currentUser.role}</div>
              <div className="mt-0.5 text-[#5eead4]">{currentUser.branchName}</div>
            </div>
          </>
        )}
      </aside>

      <nav className="tantawy-mobile-nav lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0c1e33] text-white border-t border-[#1a385c] flex items-center justify-around py-2 px-2.5 pb-4 shadow-2xl safe-area-inset-bottom print:hidden" aria-label="التنقل">
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
                      ? 'bg-[#009488] text-white font-black shadow-lg shadow-teal-950/50 scale-[1.02]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5 font-bold hover:scale-[1.02]'
                  }`}
                >
                  <div className="relative">
                    <Icon className={`w-5 h-5 mb-0.5 transition-transform ${isActive ? 'scale-110 text-white stroke-[2.5]' : 'stroke-[2] text-slate-400'}`} />
                    {item.badge && item.badge > 0 ? (
                      <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-rose-500 text-white font-black text-[9px] flex items-center justify-center px-1 shadow-sm shadow-rose-500/30">
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
              className="relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition cursor-pointer min-h-[48px] rounded-2xl text-slate-400 hover:text-white hover:bg-white/5 font-bold"
            >
              <div className="relative">
                <Menu className="w-5 h-5 mb-0.5 stroke-[2.2] text-teal-300" />
                {pendingApprovalsCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-rose-500 text-white font-black text-[9px] flex items-center justify-center px-1 shadow-sm shadow-rose-500/30">
                    {pendingApprovalsCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight truncate font-black text-slate-200">القائمة</span>
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
          <div className="relative w-full max-w-xs sm:max-w-sm bg-navy-deep text-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src="/icon.svg" alt="طنطاوي جروب" className="w-9 h-9 rounded-xl object-contain border border-[var(--app-ok)] shadow-xs" />
                <div>
                  <div className="font-black text-sm text-white">طنطاوي جروب</div>
                  <div className="text-[10px] text-teal-300 font-extrabold">القائمة الرئيسية والتطبيقات</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer"
                title="إغلاق القائمة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Profile Summary - High Contrast */}
            <div className="px-4 py-4 bg-gradient-to-b from-[#0c1e33] to-[#0a1626] border-b border-[#1a385c] flex items-center justify-between">
              <div>
                <div className="font-black text-sm text-white tracking-tight">{currentUser.name}</div>
                <div className="text-[11px] text-teal-400 font-bold">{roleNames[currentUser.role]?.label || currentUser.role}</div>
                <div className="text-[11px] text-slate-300 font-bold">{currentUser.branchName}</div>
              </div>
              <div className="w-11 h-11 rounded-full bg-[var(--app-accent)] text-white font-black text-sm flex items-center justify-center shadow-lg shadow-teal-500/40">
                {(currentUser.name || '').trim().charAt(0)}
              </div>
            </div>

            {/* Nav Items List - Ordered by Priority (Sales First) */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1 pb-6">
              <div className="text-[10px] font-black text-teal-400 px-2 pb-2 uppercase tracking-wider">الأقسام المتاحة لحسابك</div>
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
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl text-right text-xs font-bold transition cursor-pointer ${
                      isActive
                        ? 'bg-[#009488] text-white font-black shadow-lg ring-1 ring-teal-300/40 border border-teal-300/50'
                        : 'text-white hover:bg-white/15 bg-white/[0.05] border border-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-teal-300'}`} />
                      <span className="text-[13px] font-black">{item.label}</span>
                    </div>
                    {item.badge && item.badge > 0 ? (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        isActive ? 'bg-slate-950 text-teal-300' : 'bg-rose-500 text-white shadow-xs'
                      }`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Drawer Footer Actions - With Bottom Spacing */}
            <div className="p-4 border-t border-white/10 space-y-2 bg-[#091b29] pb-8">
              <button
                type="button"
                onClick={() => {
                  setIsSettingsModalOpen(true);
                  setIsMobileDrawerOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer shadow-sm"
              >
                <Settings className="w-4 h-4 text-teal-300" />
                <span>إعدادات النظام والخصوصية</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-rose-500/20 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 text-xs font-bold transition cursor-pointer shadow-sm"
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

