import {
  Bell,
  Boxes,
  Building,
  CheckCircle,
  CloudLightning,
  Download,
  FileSpreadsheet,
  Layers,
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
    admin: { label: 'مدير النظام العام (Admin)', bg: 'bg-rose-500/20 border-rose-500/40', text: 'text-rose-300' },
    branch_manager: { label: 'مدير الفرع (Branch Mgr)', bg: 'bg-purple-500/20 border-purple-500/40', text: 'text-purple-300' },
    supervisor: { label: 'مشرف مبيعات (Supervisor)', bg: 'bg-blue-500/20 border-blue-500/40', text: 'text-blue-300' },
    sales_rep: { label: 'مندوب مبيعات (Sales Rep)', bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-300' },
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
    { id: 'catalog', label: 'كتالوج الأصناف والبيع', icon: Boxes, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep'] },
    { id: 'invoices', label: 'الفواتير والطلبيات', icon: Receipt, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep'], badge: pendingOrdersCount },
    { id: 'inventory', label: 'إدارة المخزون والاعتمادات', icon: Layers, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep'], badge: pendingOrdersCount },
    { id: 'excel', label: 'شيتات Google Sheets والإكسل', icon: FileSpreadsheet, roles: ['admin', 'branch_manager', 'supervisor'] },
    { id: 'users', label: 'المستخدمين والصلاحيات', icon: Users, roles: ['admin', 'branch_manager'], badge: pendingApprovalsCount },
    { id: 'accounting', label: 'الربط المحاسبي (ERP)', icon: Server, roles: ['admin', 'branch_manager'] },
  ];

  const filteredNavItems = navItems.filter((item) => item.roles.includes(currentUser.role));

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-lg border-b border-slate-800">
        {/* Top Banner */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          
          {/* Brand & Logo */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-slate-950 p-1 border-2 border-amber-400/80 shadow-md shadow-amber-500/20 flex items-center justify-center shrink-0">
              <img src="/icon.svg" alt="دريم طنطاوي" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-base sm:text-lg tracking-tight text-white flex items-center gap-1.5">
                  <span>شركة دريم طنطاوي</span>
                  <span className="text-amber-400 text-xs sm:text-sm font-bold">للتجارة والتوزيع</span>
                </h1>
                <span className="hidden md:inline-block px-2 py-0.5 text-[10px] font-extrabold bg-amber-400/20 text-amber-300 rounded-md border border-amber-400/30">
                  DREAM TANTAWY
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                المنظومة الشاملة للمبيعات والمخزون • ربط الصور السحابية وتوفير الباقة
              </p>
            </div>
          </div>

          {/* Status Indicators, User Info, & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
            
            {/* PWA Install Button (Mobile & Desktop) */}
            <button
              type="button"
              onClick={() => setIsInstallModalOpen(true)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 hover:from-amber-500/30 hover:to-yellow-500/30 text-amber-300 border border-amber-400/40 px-2.5 py-1 rounded-xl text-xs font-black transition shadow-sm cursor-pointer"
              title="تثبيت التطبيق على الموبايل أو الكمبيوتر"
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden xs:inline">تثبيت التطبيق</span>
              <span className="xs:hidden">تثبيت</span>
            </button>

            {/* Data Saver Mode Toggle Button */}
            <button
              type="button"
              onClick={toggleDataSaverMode}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border transition cursor-pointer ${
                dataSaverMode
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title={dataSaverMode ? 'وضع توفير الباقة مفعل (تحميل صور خفيفة وسريعة)' : 'تفعيل وضع توفير الباقة للمناديب'}
            >
              {dataSaverMode ? (
                <>
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">توفير الباقة:</span>
                  <span className="text-emerald-300 font-black">مفعّل ⚡</span>
                </>
              ) : (
                <>
                  <ZapOff className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">توفير الباقة: معطل</span>
                  <span className="sm:hidden">الباقة</span>
                </>
              )}
            </button>

            {/* Offline / Online Status Badge */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${
              isOffline ? 'bg-amber-950/80 text-amber-300 border-amber-700' : 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
            }`}>
              {isOffline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                  <span>أوفلاين</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden lg:inline">متصل</span>
                </>
              )}
            </div>

            {/* Pending Users Notification for Admin */}
            {currentUser.role === 'admin' && pendingApprovalsCount > 0 && (
              <button
                onClick={() => setActiveTab('users')}
                className="flex items-center gap-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 px-2 py-1 rounded-lg text-xs font-bold transition animate-pulse"
                title="يوجد طلبات انضمام جديدة بانتظار التفعيل"
              >
                <Bell className="w-3.5 h-3.5 text-rose-400" />
                <span>{pendingApprovalsCount}</span>
              </button>
            )}

            {/* Branch Filter for Admin OR Branch Indicator for Rep */}
            {currentUser.role === 'admin' ? (
              <div className="relative hidden sm:block">
                <select
                  aria-label="تصفية الفرع"
                  value={selectedBranchFilter}
                  onChange={(e) => setSelectedBranchFilter(e.target.value)}
                  className="bg-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1.5 border border-slate-700 focus:outline-none focus:border-amber-400 font-medium"
                >
                  <option value="الكل">🏢 كل الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-1.5 bg-slate-800/90 border border-slate-750 px-2 py-1 rounded-lg text-xs text-slate-300">
                <Building className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold text-amber-300">{currentUser.branchName}</span>
              </div>
            )}

            {/* User Profile Menu with Logout */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-750 px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
              >
                <img
                  src={currentUser.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&auto=format&fit=crop&q=80'}
                  alt={currentUser.name}
                  className="w-6 h-6 rounded-full object-cover border border-amber-400"
                />
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-bold text-slate-100 flex items-center gap-1">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-amber-400 font-medium">
                    {roleNames[currentUser.role]?.label || currentUser.role}
                  </div>
                </div>
                <span className="text-xs text-slate-400 mr-1">▼</span>
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
                        setIsInstallModalOpen(true);
                      }}
                      className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold py-1.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>📱 تثبيت تطبيق دريم طنطاوي</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('هل تريد تنظيف الذاكرة المؤقتة لتسريع أداء المتصفح والتطبيق؟')) {
                          localStorage.removeItem('dream_dist_acc_logs_v5');
                          window.location.reload();
                        }
                      }}
                      className="w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold py-1.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>⚡ تسريع التطبيق وتنظيف الذاكرة</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        logout();
                      }}
                      className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold py-1.5 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>تسجيل الخروج الآمن</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Floating Cart Button */}
            <button
              id="open-cart-btn"
              onClick={onOpenCart}
              className="relative flex items-center gap-1.5 sm:gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black px-2.5 sm:px-4 py-1.5 rounded-xl shadow-md transition transform active:scale-95 cursor-pointer"
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

      {/* Mobile Bottom Navigation Bar (Smartphones & Small Screens) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800/90 flex items-center justify-around py-1.5 px-1 shadow-2xl safe-area-inset-bottom">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex flex-col items-center justify-center p-1 rounded-xl transition cursor-pointer ${
            activeTab === 'catalog' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Boxes className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">الكتالوج</span>
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`relative flex flex-col items-center justify-center p-1 rounded-xl transition cursor-pointer ${
            activeTab === 'invoices' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Receipt className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">الفواتير</span>
          {pendingOrdersCount > 0 && (
            <span className="absolute top-0 right-1 w-2 h-2 bg-amber-400 rounded-full"></span>
          )}
        </button>

        {/* Center Cart Trigger */}
        <button
          onClick={onOpenCart}
          className="relative -top-3 bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 text-slate-950 p-3 rounded-2xl shadow-xl shadow-amber-500/30 flex items-center justify-center transform active:scale-90 transition border-2 border-slate-900 cursor-pointer"
        >
          <ShoppingCart className="w-5 h-5" />
          {cartSummary.itemCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black min-w-[18px] text-center border border-white">
              {cartSummary.itemCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`relative flex flex-col items-center justify-center p-1 rounded-xl transition cursor-pointer ${
            activeTab === 'inventory' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">المخزون</span>
          {pendingOrdersCount > 0 && (
            <span className="absolute top-0 right-1 w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>
          )}
        </button>

        <button
          onClick={() => setIsInstallModalOpen(true)}
          className="flex flex-col items-center justify-center p-1 rounded-xl text-amber-400 hover:text-amber-300 transition cursor-pointer"
        >
          <Smartphone className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">تثبيت 📱</span>
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

