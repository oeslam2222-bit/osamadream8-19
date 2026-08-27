import {
  Bell,
  BookOpen,
  Boxes,
  Building,
  CheckCircle,
  CloudLightning,
  Download,
  FileSpreadsheet,
  Layers,
  LayoutDashboard,
  LogOut,
  Receipt,
  Server,
  ShieldCheck,
  Smartphone,
  ShoppingCart,
  User,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  Zap,
  ZapOff
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { UserRole } from '../types';
import { InstallAppModal } from './InstallAppModal';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenCart: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onOpenCart }) => {
  const {
    currentUser,
    logout,
    users,
    branches,
    invoices,
    isOffline,
    getCartSummary,
    selectedBranchFilter,
    setSelectedBranchFilter,
    dataSaverMode,
    toggleDataSaverMode,
    triggerInstallPrompt,
    installPromptEvent,
    isInstallModalOpen,
    setIsInstallModalOpen
  } = useApp();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const cartSummary = getCartSummary();

  if (!currentUser) return null;

  const roleNames: Record<UserRole, { label: string; bg: string; text: string }> = {
    admin: { label: 'الآدمن (الإدارة العامة)', bg: 'bg-rose-500/20 border-rose-500/40', text: 'text-rose-300' },
    developer: { label: 'المطور (الدعم التقني)', bg: 'bg-amber-500/20 border-amber-500/40', text: 'text-amber-300' },
    branch_manager: { label: 'مدير الفرع', bg: 'bg-purple-500/20 border-purple-500/40', text: 'text-purple-300' },
    supervisor: { label: 'مشرف المناديب', bg: 'bg-blue-500/20 border-blue-500/40', text: 'text-blue-300' },
    sales_rep: { label: 'المندوب', bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-300' },
  };

  const pendingApprovalsCount = users.filter((u) => u.approvalStatus === 'pending_approval').length;
  
  const pendingOrdersCount = invoices.filter((i) =>
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

  const navItems = [
    { id: 'catalog', label: 'كتالوج الأصناف والبيع', icon: Boxes, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'dashboard', label: 'لوحة المشرف والمتابعة 📊', icon: LayoutDashboard, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'invoices', label: 'الفواتير والطلبيات', icon: Receipt, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'], badge: pendingOrdersCount },
    { id: 'inventory', label: 'إدارة المخزون والاعتمادات', icon: Layers, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'], badge: pendingOrdersCount },
    { id: 'excel', label: 'شيتات Google Sheets والإكسل', icon: FileSpreadsheet, roles: ['admin', 'developer'] },
    { id: 'audit', label: 'سجل العمليات (Audit Log)', icon: ShieldCheck, roles: ['admin', 'developer'] },
    { id: 'guide', label: 'دليل دورة العمل 📖', icon: BookOpen, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
    { id: 'users', label: 'المستخدمين والصلاحيات', icon: Users, roles: ['admin', 'developer'], badge: pendingApprovalsCount },
  ];

  const filteredNavItems = navItems.filter((item) => item.roles.includes(currentUser.role));

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-lg border-b border-slate-800">
        {/* Top Banner - Compact on mobile with large touch controls */}
        <div className="max-w-7xl mx-auto px-2 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2">
          
          {/* Brand & Logo */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl sm:rounded-2xl bg-slate-950 p-1 border-2 border-amber-400 shadow-md shadow-amber-500/20 flex items-center justify-center shrink-0">
              <img src="/icon.svg" alt="دريم طنطاوي" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-black text-sm sm:text-lg tracking-tight text-white flex items-center gap-1">
                  <span>دريم طنطاوي</span>
                  <span className="text-amber-400 text-xs sm:text-sm font-bold hidden xs:inline">للتوزيع</span>
                </h1>
                <span className="hidden md:inline-block px-2 py-0.5 text-[10px] font-extrabold bg-amber-400/20 text-amber-300 rounded-md border border-amber-400/30">
                  DREAM TANTAWY
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-300 hidden sm:block">
                المنظومة الذكية للمبيعات والمخزون والفواتير
              </p>
            </div>
          </div>

          {/* Status Indicators, User Info, & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            
            {/* PWA Install Button (Compact & Large Touch Target) */}
            <button
              type="button"
              onClick={() => setIsInstallModalOpen(true)}
              className="flex items-center justify-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 text-amber-300 border border-amber-400/50 px-2.5 h-9 sm:h-10 rounded-xl text-xs font-black transition cursor-pointer"
              title="تثبيت التطبيق على الموبايل أو الكمبيوتر"
            >
              <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">تثبيت</span>
            </button>

            {/* Data Saver Mode Toggle Button */}
            <button
              type="button"
              onClick={toggleDataSaverMode}
              className={`flex items-center justify-center gap-1 px-2.5 h-9 sm:h-10 rounded-xl text-xs font-black border transition cursor-pointer ${
                dataSaverMode
                  ? 'bg-emerald-900/90 text-emerald-200 border-emerald-400 shadow-sm'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title={dataSaverMode ? 'وضع توفير الباقة مفعل' : 'تفعيل وضع توفير الباقة'}
            >
              {dataSaverMode ? (
                <>
                  <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="hidden sm:inline">باقة:</span>
                  <span className="text-emerald-300 font-black">مفعّل</span>
                </>
              ) : (
                <>
                  <ZapOff className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="hidden sm:inline">توفير الباقة</span>
                  <span className="sm:hidden text-[11px]">باقة</span>
                </>
              )}
            </button>

            {/* Offline / Online Status Badge (Visible everywhere with high contrast) */}
            <div className={`flex items-center gap-1 px-2 h-9 sm:h-10 rounded-xl text-xs font-bold border ${
              isOffline ? 'bg-amber-900 text-amber-200 border-amber-500' : 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
            }`}>
              {isOffline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                  <span className="text-[11px] font-black">أوفلاين</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden md:inline">متصل</span>
                </>
              )}
            </div>

            {/* Pending Users Notification for Admin / Developer (Hidden for reps/supervisors) */}
            {(currentUser.role === 'admin' || currentUser.role === 'developer') && pendingApprovalsCount > 0 && (
              <button
                onClick={() => setActiveTab('users')}
                className="flex items-center justify-center gap-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 px-2.5 h-9 sm:h-10 rounded-xl text-xs font-bold transition animate-pulse"
                title="يوجد طلبات انضمام جديدة بانتظار التفعيل"
              >
                <Bell className="w-3.5 h-3.5 text-rose-400" />
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
                  className="bg-slate-800 text-slate-200 text-xs rounded-xl px-2.5 h-10 border border-slate-700 focus:outline-none focus:border-amber-400 font-bold"
                >
                  <option value="الكل">🏢 كل الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* User Profile Menu with Logout */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 px-2.5 h-9 sm:h-10 rounded-xl border border-slate-700 transition cursor-pointer"
              >
                <img
                  src={currentUser.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&auto=format&fit=crop&q=80'}
                  alt={currentUser.name}
                  className="w-6 h-6 rounded-full object-cover border border-amber-400"
                />
                <div className="text-right hidden md:block">
                  <div className="text-xs font-bold text-slate-100 flex items-center gap-1">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-amber-400 font-medium">
                    {roleNames[currentUser.role]?.label || currentUser.role}
                  </div>
                </div>
                <span className="text-xs text-slate-400 mr-0.5">▼</span>
              </button>

              {/* Profile Popup Menu */}
              {showProfileMenu && (
                <div className="absolute left-0 sm:right-0 mt-2 w-80 bg-slate-900 border border-slate-750 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2 text-xs">
                  <div className="flex items-center gap-3 p-2 bg-slate-950 rounded-xl border border-slate-800 mb-2.5">
                    <img
                      src={currentUser.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&auto=format&fit=crop&q=80'}
                      alt={currentUser.name}
                      className="w-10 h-10 rounded-full object-cover border-2 border-amber-400"
                    />
                    <div>
                      <div className="font-bold text-sm text-white">{currentUser.name}</div>
                      <div className="text-[11px] text-slate-400">{currentUser.email}</div>
                      <div className={`mt-1 inline-block text-[10px] px-2 py-0.5 rounded-md border font-bold ${roleNames[currentUser.role]?.bg || 'bg-slate-700/40 border-slate-600'} ${roleNames[currentUser.role]?.text || 'text-slate-300'}`}>
                        {roleNames[currentUser.role]?.label || currentUser.role || 'مستخدم'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 py-1 text-[11px] text-slate-300 border-b border-slate-800 pb-2.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">الفرع المخصص:</span>
                      <span className="font-semibold text-amber-300">{currentUser.branchName}</span>
                    </div>
                    {supervisorName && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">المشرف المباشر:</span>
                        <span className="font-semibold text-blue-300">{supervisorName}</span>
                      </div>
                    )}
                    {currentUser.role === 'supervisor' && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">عدد المناديب التابعين:</span>
                        <span className="font-semibold text-emerald-300">{supervisedRepsCount} مندوب مبيعات</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">حالة الحساب:</span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> مفعّل ونشط
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setActiveTab('guide');
                      }}
                      className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold py-2 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>📖 دليل دورة العمل والتشغيل</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        logout();
                      }}
                      className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold py-2 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer min-h-[40px]"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>تسجيل الخروج الآمن</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Top Bar Cart Button */}
            <button
              id="open-cart-btn"
              onClick={onOpenCart}
              className="relative flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black px-3 h-9 sm:h-10 rounded-xl shadow-md transition transform active:scale-95 cursor-pointer min-w-[40px]"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden xs:inline text-xs">الطلبية</span>
              {cartSummary.itemCount > 0 && (
                <span className="bg-slate-950 text-amber-300 text-xs px-1.5 py-0.2 rounded-full font-black min-w-[20px] text-center border border-amber-300">
                  {cartSummary.itemCount}
                </span>
              )}
              {cartSummary.grandTotal > 0 && (
                <span className="hidden lg:inline text-xs bg-amber-400/50 px-1.5 py-0.5 rounded text-slate-950 font-extrabold">
                  {formatCurrency(cartSummary.grandTotal)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar (Desktop and Tablets) */}
        <div className="bg-slate-950/60 border-t border-slate-800/80 px-2 sm:px-6 overflow-x-auto no-scrollbar">
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

      {/* Mobile Bottom Navigation Bar (Smartphones & Small Screens - High Contrast & Large Touch Targets) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/98 backdrop-blur border-t border-slate-800 flex items-center justify-around py-1.5 px-2 shadow-2xl safe-area-inset-bottom">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex flex-col items-center justify-center min-w-[52px] min-h-[52px] px-1 rounded-xl transition active:scale-95 cursor-pointer ${
            activeTab === 'catalog' ? 'text-amber-400 font-black' : 'text-slate-300 hover:text-white font-bold'
          }`}
        >
          <Boxes className={`w-5 h-5 ${activeTab === 'catalog' ? 'text-amber-400 stroke-[2.5]' : 'text-slate-300'}`} />
          <span className="text-[11px] mt-0.5 font-bold">الكتالوج</span>
        </button>

        <button
          onClick={() => setActiveTab('dashboard')}
          className={`relative flex flex-col items-center justify-center min-w-[52px] min-h-[52px] px-1 rounded-xl transition active:scale-95 cursor-pointer ${
            activeTab === 'dashboard' ? 'text-amber-400 font-black' : 'text-slate-300 hover:text-white font-bold'
          }`}
        >
          <LayoutDashboard className={`w-5 h-5 ${activeTab === 'dashboard' ? 'text-amber-400 stroke-[2.5]' : 'text-slate-300'}`} />
          <span className="text-[11px] mt-0.5 font-bold">المتابعة</span>
        </button>

        {/* Center Cart Trigger (High Prominence & Large Touch Area) */}
        <button
          onClick={onOpenCart}
          className="relative -top-3.5 bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 text-slate-950 w-13 h-13 rounded-2xl shadow-xl shadow-amber-500/40 flex items-center justify-center transform active:scale-90 transition border-2 border-slate-950 cursor-pointer shrink-0"
          aria-label="فتح سلة الطلبية"
        >
          <ShoppingCart className="w-6 h-6 stroke-[2.5]" />
          {cartSummary.itemCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[11px] px-1.5 py-0.5 rounded-full font-black min-w-[20px] text-center border-2 border-white shadow-sm">
              {cartSummary.itemCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`relative flex flex-col items-center justify-center min-w-[52px] min-h-[52px] px-1 rounded-xl transition active:scale-95 cursor-pointer ${
            activeTab === 'invoices' ? 'text-amber-400 font-black' : 'text-slate-300 hover:text-white font-bold'
          }`}
        >
          <Receipt className={`w-5 h-5 ${activeTab === 'invoices' ? 'text-amber-400 stroke-[2.5]' : 'text-slate-300'}`} />
          <span className="text-[11px] mt-0.5 font-bold">الفواتير</span>
          {pendingOrdersCount > 0 && (
            <span className="absolute top-1 right-2 w-2.5 h-2.5 bg-amber-400 rounded-full border border-slate-950"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`relative flex flex-col items-center justify-center min-w-[52px] min-h-[52px] px-1 rounded-xl transition active:scale-95 cursor-pointer ${
            activeTab === 'inventory' ? 'text-amber-400 font-black' : 'text-slate-300 hover:text-white font-bold'
          }`}
        >
          <Layers className={`w-5 h-5 ${activeTab === 'inventory' ? 'text-amber-400 stroke-[2.5]' : 'text-slate-300'}`} />
          <span className="text-[11px] mt-0.5 font-bold">المخزون</span>
          {pendingOrdersCount > 0 && (
            <span className="absolute top-1 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping"></span>
          )}
        </button>
      </div>

      {/* PWA Install Modal */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        installPromptEvent={installPromptEvent}
      />
    </>
  );
};

