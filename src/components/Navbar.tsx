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
  Target,
  CalendarCheck,
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
  ChevronLeft,
  ChevronRight,
  Menu,
  RotateCcw,
  PackageSearch
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/themeContext';
import { formatCurrency } from '../services/invoiceService';
import { UserRole } from '../types';
import { CompanySettingsModal } from './CompanySettingsModal';
import { InstallAppModal } from './InstallAppModal';
import { SystemSettingsAndAboutModal } from './SystemSettingsAndAboutModal';
import { InternalNotificationCenter } from './InternalNotificationCenter';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenCart: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenCart,
  isSidebarCollapsed = false,
  onToggleSidebar
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
    triggerInstallPrompt,
    installPromptEvent,
    isInstallModalOpen,
    setIsInstallModalOpen,
    login
  } = useApp();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(!!standalone);
      const dismissed = localStorage.getItem('tantawy_pwa_banner_dismissed');
      if (!standalone && !dismissed) {
        setShowInstallBanner(true);
      }
    }
  }, []);

  const cartSummary = getCartSummary();
  const todayLabel = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  if (!currentUser) return null;

  const roleNames: Record<UserRole, { label: string; bg: string; text: string }> = {
    admin: { label: 'الآدمن (الإدارة العامة)', bg: 'bg-rose-500/20 border-rose-500/40', text: 'text-rose-300' },
    developer: { label: 'المطور (الدعم التقني)', bg: 'bg-amber-500/20 border-amber-500/40', text: 'text-amber-300' },
    branch_manager: { label: 'مدير الفرع', bg: 'bg-purple-500/20 border-purple-500/40', text: 'text-purple-300' },
    supervisor: { label: 'مشرف المناديب', bg: 'bg-blue-500/20 border-blue-500/40', text: 'text-blue-300' },
    sales_rep: { label: 'المندوب', bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-300' },
    warehouse_keeper: { label: 'أمين المخزن', bg: 'bg-teal-500/20 border-teal-500/40', text: 'text-teal-300' },
    legal_advisor: { label: 'الشؤون القانونية', bg: 'bg-indigo-500/20 border-indigo-500/40', text: 'text-indigo-300' }, // صفحة معطلة
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
    { id: 'catalog', label: 'الكتالوج', icon: Boxes, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper'] },
    { id: 'all_customers', label: 'العملاء', icon: Users, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'invoices', label: 'الفواتير والاعتمادات', icon: Receipt, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'], badge: pendingOrdersCount },
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
      {/* Smart Mobile PWA Install Banner */}
      {showInstallBanner && !isStandalone && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 px-3 py-1.5 text-xs font-bold flex items-center justify-between shadow-md print:hidden border-b border-amber-600/30">
          <div className="flex items-center gap-2 overflow-hidden">
            <img src="/pwa-192x192.png" alt="الطنطاوي" className="w-6 h-6 rounded-lg border border-slate-900/30 shadow-sm shrink-0" />
            <div className="leading-tight truncate">
              <span className="font-black text-[11px] sm:text-xs block text-slate-950 truncate">تثبيت تطبيق مجموعة الطنطاوي</span>
              <span className="text-[9px] sm:text-[10px] text-slate-900/80 font-bold block truncate">أيقونة نقية بدون علامة كروم وبدون شريط متصفح</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                if (installPromptEvent && typeof installPromptEvent.prompt === 'function') {
                  triggerInstallPrompt();
                } else {
                  setIsInstallModalOpen(true);
                }
              }}
              className="bg-slate-950 hover:bg-slate-900 active:scale-95 text-amber-300 px-2.5 py-1 rounded-lg text-[11px] font-black shadow transition cursor-pointer whitespace-nowrap"
            >
              تثبيت الآن
            </button>
            <button
              onClick={() => {
                setShowInstallBanner(false);
                try { localStorage.setItem('tantawy_pwa_banner_dismissed', 'true'); } catch {}
              }}
              className="p-1 text-slate-950/70 hover:text-slate-950 rounded-md transition"
              title="إغلاق الإشعار"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <header className="tantawy-topbar sticky top-0 z-40 bg-white text-slate-900 shadow-sm border-b border-[var(--app-line)]">
        {/* Top Banner - Compact on mobile with large touch controls */}
        <div className="max-w-7xl mx-auto px-2 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2">
          
          {/* Date pill (desktop: the brand lives in the sidebar) */}
          <div className="hidden lg:block rounded-xl border border-[var(--app-line)] bg-white px-3.5 py-2 text-sm font-semibold text-slate-600">
            {todayLabel}
          </div>

          {/* Brand & Logo + Mobile Menu Trigger (mobile / tablet) */}
          <div className="flex items-center gap-2 sm:gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="القائمة الرئيسية"
              title="القائمة الرئيسية"
              className="h-10 px-2.5 rounded-xl bg-navy-deep hover:bg-blue-deep4 text-amber-300 flex items-center gap-1.5 font-black text-xs shadow-xs cursor-pointer border border-teal-500/30"
            >
              <Menu className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-[11px]">القائمة</span>
            </button>
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-2xl bg-navy-deep p-1 border-2 border-teal-500 shadow-md shadow-teal-500/20 flex items-center justify-center shrink-0 overflow-hidden">
              <img src="/icon.svg" alt="طنطاوي جروب - Tantawy Group" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-black text-sm sm:text-base tracking-tight text-slate-900 flex items-center gap-1">
                  <span>طنطاوي جروب</span>
                </h1>
              </div>
              <p className="text-[10px] text-slate-500 hidden sm:block">
                تطبيق المبيعات
              </p>
            </div>
          </div>

          {/* Status Indicators, User Info, & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            
            {/* Offline / Online Status Badge */}
            <div className={`flex items-center gap-1 px-2.5 h-11 rounded-full text-xs font-bold border ${
              isOffline ? 'panel-warn' : 'panel-ok'
            }`}>
              {isOffline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 animate-pulse text-[var(--app-warn)]" />
                  <span className="text-[11px] font-black">أوفلاين</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[var(--app-ok)]" />
                  <span className="hidden md:inline">متصل</span>
                </>
              )}
            </div>

            {/* Settings, About & Privacy Modal Trigger Button */}
            <button
              id="navbar-settings-and-about-btn"
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3 h-11 rounded-xl text-xs font-black border border-[var(--app-line)] bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer shadow-2xs active:scale-95"
              title="الإعدادات، السياسة والخصوصية، معلومات المنظومة، والقائمين على الفكرة"
            >
              <Settings className="w-4 h-4 text-amber-600" />
              <span className="hidden sm:inline">الإعدادات وعن النظام</span>
            </button>

            {/* Pending Invoices Sync Button for Offline/Queued Orders */}
            {pendingInvoicesCount > 0 && (
              <button
                type="button"
                onClick={() => flushPendingInvoices()}
                className="flex items-center justify-center gap-1.5 bg-[var(--app-warn)] hover:brightness-95 text-white px-3 h-11 rounded-xl text-xs font-black transition cursor-pointer shadow-sm animate-pulse border border-[rgba(155,112,39,.35)]"
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
                  className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-tr from-slate-900 to-amber-500 text-white text-xs font-black flex items-center justify-center shadow-xs"
                >
                  {((currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أ').charAt(0)}
                </span>
                <div className="text-right hidden md:block">
                  <div className="text-xs font-black text-slate-900 flex items-center gap-1">
                    {(currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أسامة'}
                  </div>
                  <div className="text-[10px] text-amber-600 font-bold">
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
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 flex items-center justify-center font-black text-lg shadow-md">
                        {((currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أ').charAt(0)}
                      </div>
                      <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-950" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="font-black text-sm text-white truncate">
                        {(currentUser.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أسامة'}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {currentUser.email || 'Osama@dream.com'}
                      </div>
                      <div className="mt-1.5 inline-block text-[10px] px-2.5 py-0.5 rounded-full font-black bg-amber-400/20 text-amber-300 border border-amber-400/40">
                        {roleNames[currentUser.role]?.label || currentUser.role || 'المطور التقني'}
                      </div>
                    </div>
                  </div>

                  {/* Account Information Rows */}
                  <div className="py-3 space-y-2 text-[11px] border-b border-slate-800/80 text-slate-300">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold">الفرع المخصص:</span>
                      <span className="font-black text-amber-300 truncate max-w-[180px]">
                        {currentUser.branchName || 'الفرع الرئيسي - 6 أكتوبر'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold">القطاع المسؤول:</span>
                      <span className="font-black text-cyan-300">
                        {currentUser.sector === 'electrical' ? 'القطاع الكهربائي' : currentUser.sector === 'both' ? 'منزلي + كهرباء' : 'القطاع المنزلي'}
                      </span>
                    </div>

                    {supervisorName && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-bold">المشرف المباشر:</span>
                        <span className="font-black text-blue-300">{supervisorName}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-bold">حالة الحساب:</span>
                      <span className="text-emerald-400 font-black flex items-center gap-1">
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
                      className="w-full bg-rose-500/10 hover:bg-rose-500/20 active:scale-98 text-rose-300 border border-rose-500/30 font-black py-2.5 rounded-2xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>تسجيل الخروج الآمن</span>
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
                      ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-amber-400'}`} />
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                        isActive ? 'bg-slate-950 text-amber-300' : 'bg-rose-600 text-white'
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
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-amber-300 flex items-center justify-center transition cursor-pointer active:scale-95 shadow-2xs"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <img src="/icon.svg" alt="طنطاوي جروب" className="w-9 h-9 rounded-xl object-contain shadow-xs border border-teal-500/30" />
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
                        ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                        : 'text-blue-soft3 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-slate-950' : 'text-blue-soft2 group-hover:text-amber-300'}`} />
                    {item.badge && item.badge > 0 ? (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-rose-500 px-1 text-center text-[9px] font-black text-white flex items-center justify-center shadow-xs">
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
                className="w-9 h-9 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center cursor-pointer shadow-xs"
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
                <img src="/icon.svg" alt="طنطاوي جروب" className="w-10 h-10 rounded-xl object-contain shrink-0 border border-teal-500/30 shadow-xs" />
                <div>
                  <div className="font-black text-sm text-white">طنطاوي جروب</div>
                  <div className="text-[10px] text-teal-300 font-semibold">Tantawy Group</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleSidebar}
                title="تصغير القائمة لتوسيع مساحة عرض المنتجات"
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-amber-300 flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="px-2 pt-4 pb-2 text-[10px] font-bold text-blue-200/70">
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
                      <span className="min-w-5 rounded-full bg-rose-500 px-1.5 text-center text-[10px] font-black text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 border-t border-white/10 pt-4 px-2 text-[11px] leading-6 text-blue-100/70">
              <div className="font-bold text-white">{currentUser.name}</div>
              <div>{roleNames[currentUser.role]?.label || currentUser.role}</div>
              <div className="mt-0.5 text-amber-300/90">{currentUser.branchName}</div>
            </div>
          </>
        )}
      </aside>

      <nav className="tantawy-mobile-nav lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 flex items-center justify-around py-1.5 px-1 shadow-xl safe-area-inset-bottom print:hidden" aria-label="التنقل">
        <>
            {[
              { id: 'home', label: 'الرئيسية', icon: Home },
              { id: 'all_customers', label: 'العملاء', icon: Users },
              { id: 'invoices', label: 'الفواتير', icon: Receipt },
              { id: 'catalog', label: 'الكتالوج', icon: Boxes, badge: cartSummary.itemCount },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id || (item.id === 'all_customers' && activeTab === 'customers');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 transition cursor-pointer min-h-[44px] ${
                    isActive ? 'text-[color:var(--brand-teal)] font-black' : 'text-slate-400 hover:text-slate-600 font-bold'
                  }`}
                >
                  <div className="relative">
                    <Icon className={`w-5 h-5 mb-0.5 transition-transform ${isActive ? 'scale-110 text-[color:var(--brand-teal)] stroke-[2.5]' : 'stroke-[1.8]'}`} />
                    {item.badge && item.badge > 0 ? (
                      <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-[color:var(--brand-amber)] text-slate-950 font-black text-[9px] flex items-center justify-center px-1">
                        {item.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[10px] tracking-tight truncate">{item.label}</span>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--brand-teal)] mt-0.5" />
                  )}
                </button>
              );
            })}

            {/* Mobile Drawer Open Button */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="القائمة الكاملة"
              className="relative flex flex-col items-center justify-center flex-1 py-1 px-1 transition cursor-pointer min-h-[44px] text-amber-700 hover:text-amber-800 font-bold"
            >
              <div className="relative">
                <Menu className="w-5 h-5 mb-0.5 stroke-[2.2]" />
                {pendingApprovalsCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-rose-500 text-white font-black text-[9px] flex items-center justify-center px-1">
                    {pendingApprovalsCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight truncate font-black">القائمة</span>
            </button>
          </>
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
                <img src="/icon.svg" alt="طنطاوي جروب" className="w-9 h-9 rounded-xl object-contain border border-teal-500/40 shadow-xs" />
                <div>
                  <div className="font-black text-sm text-white">طنطاوي جروب</div>
                  <div className="text-[10px] text-teal-300 font-semibold">القائمة الرئيسية والتطبيقات</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                title="إغلاق القائمة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Profile Summary */}
            <div className="px-4 py-3 bg-black/20 border-b border-white/5 flex items-center justify-between">
              <div>
                <div className="font-black text-xs text-white">{currentUser.name}</div>
                <div className="text-[10px] text-amber-300 font-bold">{roleNames[currentUser.role]?.label || currentUser.role}</div>
                <div className="text-[10px] text-slate-300">{currentUser.branchName}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center shadow-xs">
                {(currentUser.name || '').trim().charAt(0)}
              </div>
            </div>

            {/* Nav Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="text-[10px] font-bold text-teal-300/80 px-2 pb-1">أقسام النظام المتاحة لحسابك:</div>
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
                        ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                        : 'text-slate-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-slate-950' : 'text-teal-400'}`} />
                      <span className="text-[13px]">{item.label}</span>
                    </div>
                    {item.badge && item.badge > 0 ? (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        isActive ? 'bg-slate-950 text-amber-300' : 'bg-rose-500 text-white'
                      }`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-white/10 space-y-2 bg-navy-dark3">
              <button
                type="button"
                onClick={() => {
                  setIsSettingsModalOpen(true);
                  setIsMobileDrawerOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-bold transition cursor-pointer"
              >
                <Settings className="w-4 h-4 text-amber-300" />
                <span>إعدادات النظام والخصوصية</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold border border-rose-500/30 transition cursor-pointer"
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

      {/* Company Header & Identity Settings Modal */}
      {isCompanyModalOpen && (
        <CompanySettingsModal
          isOpen={isCompanyModalOpen}
          onClose={() => setIsCompanyModalOpen(false)}
        />
      )}

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

