import {
  Bell,
  Boxes,
  Building,
  CheckCircle,
  CloudLightning,
  FileSpreadsheet,
  Layers,
  LogOut,
  Receipt,
  Server,
  ShieldCheck,
  ShoppingCart,
  User,
  UserCheck,
  Users,
  Wifi,
  WifiOff
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { UserRole } from '../types';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenCart: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onOpenCart }) => {
  const { currentUser, logout, users, branches, isOffline, getCartSummary, selectedBranchFilter, setSelectedBranchFilter } = useApp();
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

  const supervisorName = currentUser.supervisorId
    ? users.find((u) => u.id === currentUser.supervisorId)?.name
    : null;

  const supervisedRepsCount = currentUser.role === 'supervisor'
    ? users.filter((u) => u.supervisorId === currentUser.id).length
    : 0;

  const navItems = [
    { id: 'catalog', label: 'كتالوج الأصناف والبيع', icon: Boxes, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep'] },
    { id: 'invoices', label: 'الفواتير والطلبيات', icon: Receipt, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep'] },
    { id: 'inventory', label: 'المخزون والرصيد', icon: Layers, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep'] },
    { id: 'excel', label: 'شيتات Google Sheets والإكسل', icon: FileSpreadsheet, roles: ['admin', 'branch_manager', 'supervisor'] },
    { id: 'cloudinary', label: 'صور Cloudinary السحابية', icon: CloudLightning, roles: ['admin', 'branch_manager'] },
    { id: 'users', label: 'المستخدمين والصلاحيات', icon: Users, roles: ['admin', 'branch_manager'] },
    { id: 'accounting', label: 'الربط المحاسبي (ERP)', icon: Server, roles: ['admin', 'branch_manager'] },
  ];

  const filteredNavItems = navItems.filter((item) => item.roles.includes(currentUser.role));

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-lg border-b border-slate-800">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        
        {/* Brand & Logo */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 flex items-center justify-center shadow-md shadow-amber-500/20 text-slate-950 font-black text-xl tracking-wider">
            D
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-base sm:text-lg tracking-tight text-white">
                شركة دريم للتجارة والتوزيع
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold bg-amber-400/20 text-amber-300 rounded border border-amber-400/30">
                منظومة المبيعات
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Dream Trading & Distribution • ربط المخزون والصور السحابية والفواتير
            </p>
          </div>
        </div>

        {/* Status Indicators, User Info, & Actions */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          
          {/* Offline / Online Status Badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            isOffline ? 'bg-amber-950/80 text-amber-300 border-amber-700' : 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
          }`}>
            {isOffline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                <span>أوفلاين (بدون إنترنت)</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden xs:inline">متصل بالسحابة</span>
              </>
            )}
          </div>

          {/* Pending Users Notification for Admin */}
          {currentUser.role === 'admin' && pendingApprovalsCount > 0 && (
            <button
              onClick={() => setActiveTab('users')}
              className="flex items-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 px-2.5 py-1 rounded-lg text-xs font-bold transition animate-pulse"
              title="يوجد طلبات انضمام جديدة بانتظار التفعيل"
            >
              <Bell className="w-3.5 h-3.5 text-rose-400" />
              <span>{pendingApprovalsCount} طلب تفعيل جديد</span>
            </button>
          )}

          {/* Branch Filter for Admin OR Branch Indicator for Rep */}
          {currentUser.role === 'admin' ? (
            <div className="relative">
              <select
                aria-label="تصفية الفرع"
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="bg-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-amber-400 font-medium"
              >
                <option value="الكل">🏢 كل الفروع والمخازن</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-1.5 bg-slate-800/90 border border-slate-750 px-2.5 py-1 rounded-lg text-xs text-slate-300">
              <Building className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">فرع:</span>
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
                    <div className={`mt-1 inline-block text-[10px] px-2 py-0.5 rounded-md border font-bold ${roleNames[currentUser.role]?.bg} ${roleNames[currentUser.role]?.text}`}>
                      {roleNames[currentUser.role]?.label}
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

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    logout();
                  }}
                  className="mt-2.5 w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold py-2 rounded-xl text-xs transition flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>تسجيل الخروج الآمن</span>
                </button>
              </div>
            )}
          </div>

          {/* Floating Cart Button */}
          <button
            id="open-cart-btn"
            onClick={onOpenCart}
            className="relative flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-3 sm:px-4 py-1.5 rounded-xl shadow-md transition transform active:scale-95"
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden xs:inline text-xs">الطلبية / الفاتورة</span>
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

      {/* Navigation Tabs Bar */}
      <div className="bg-slate-950/60 border-t border-slate-800/80 px-2 sm:px-6 overflow-x-auto no-scrollbar">
        <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 py-1.5">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-amber-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
