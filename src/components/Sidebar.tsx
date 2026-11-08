import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Package, ShoppingCart, Receipt, Wallet, Users,
  UserCheck, FileSpreadsheet, BarChart3, CalendarCheck, RotateCcw,
  Settings, LogOut, ShieldCheck, Target, MapPin, ChevronRight, ChevronLeft,
  Bell,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/themeContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenCart: () => void;
  notificationCount: number;
  onOpenNotificationCenter: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab, setActiveTab, isCollapsed, onToggleCollapse,
  onOpenCart, notificationCount, onOpenNotificationCenter,
}) => {
  const { currentUser, logout, getCartSummary } = useApp();
  const { isDark, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const cartSummary = getCartSummary();

  const navItems = [
    { id: 'home', label: 'الرئيسية', icon: LayoutDashboard },
    { id: 'catalog', label: 'الكتالوج', icon: Package },
    { id: 'all_customers', label: 'العملاء', icon: Users },
    { id: 'dashboard', label: 'التقارير الإشرافية', icon: BarChart3 },
    { id: 'invoices', label: 'الفواتير', icon: Receipt },
    { id: 'visits', label: 'الزيارات', icon: MapPin },
    { id: 'returns', label: 'المرتجعات', icon: RotateCcw },
    { id: 'targets', label: 'التارجت', icon: Target },
    { id: 'users', label: 'إدارة المستخدمين', icon: UserCheck },
    { id: 'legal_advisor', label: 'المستشار القانوني', icon: ShieldCheck },
    { id: 'excel', label: 'الإكسل والمزامنة', icon: FileSpreadsheet },
  ];

  const handleNavClick = (id: string) => { setActiveTab(id); if (mobileOpen) setMobileOpen(false); };
  const handleLogout = () => { logout(); if (mobileOpen) setMobileOpen(false); };
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;

  useEffect(() => {
    const handleResize = () => setMobileOpen(false);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleScroll = useCallback(() => setScrollPosition(window.scrollY), []);
  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const sectionColor: Record<string, string> = {
    home: '#0D9488', catalog: '#2563EB', all_customers: '#16A34A', dashboard: '#7C3AED',
    invoices: '#0D9488', visits: '#2563EB', returns: '#DC2626', targets: '#F59E0B',
    users: '#0F2B38', legal_advisor: '#1E3A8A', excel: '#F59E0B',
  };

  return (
    <>
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      {!isMobile && (
        <aside className={`fixed right-0 top-16 bottom-0 z-40 flex flex-col ${isCollapsed ? 'w-16' : 'w-64'} border-l border-slate-200 dark:border-[#26364D] bg-white dark:bg-[#0B1220] shadow-xl transition-all duration-300 flex-shrink-0`} aria-label="القائمة الرئيسية">
          <div className={`flex items-center gap-2 px-4 py-5 border-b border-slate-200 dark:border-[#26364D] ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0D9488] to-[#2563EB] flex items-center justify-center text-white font-black shadow-lg">T</div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <div className="font-black text-[#0F172A] dark:text-[#F1F5F9] text-sm leading-tight">طنطاوي جروب</div>
                <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold tracking-wider uppercase">Dream Tantawy</div>
              </div>
            )}
            <button type="button" onClick={onToggleCollapse} className="ml-auto p-2 text-slate-400 hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors" aria-label="طي القائمة">{isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}</button>
          </div>

          {!isCollapsed && currentUser && (
            <div className="px-4 py-4 border-b border-slate-200 dark:border-[#26364D]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#17243A] flex items-center justify-center text-slate-600 dark:text-[#94A3B8] font-black text-sm">{currentUser.name?.charAt(0) || 'U'}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-[#0F172A] dark:text-[#F1F5F9] truncate">{currentUser.name}</div>
                  <div className="text-xs text-slate-500 dark:text-[#94A3B8] truncate">{currentUser.role}</div>
                  <div className="text-[10px] text-[#0D9488] dark:text-[#2DD4BF] font-bold mt-0.5">{currentUser.branchName || 'الفرع الرئيسي'}</div>
                </div>
                <button type="button" onClick={toggleTheme} className="p-2 text-slate-400 hover:text-[#0F172A] dark:hover:text-[#F1F5F9] transition-colors" aria-label="تغيير السمة">{isDark ? <span className="w-4 h-4" /> : <span className="w-4 h-4" />}</button>
              </div>
            </div>
          )}

          <nav className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-2' : 'px-4'} py-3 space-y-0.5`}>
            <div className="px-2 text-[10px] font-black text-slate-400 dark:text-[#64748B] mb-3 uppercase tracking-wider">{isCollapsed ? 'الأقسام' : 'أقسام النظام'}</div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const color = sectionColor[item.id] || '#0D9488';
              return (
                <button key={item.id} type="button" onClick={() => handleNavClick(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 ${isActive ? `bg-${color}-50 text-${color}-700 dark:bg-${color}-900/30 dark:text-${color}-300 border border-${color}-100 dark:border-${color}-500/30 shadow-sm` : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#17243A] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'} ${isCollapsed ? 'justify-center' : 'justify-start'}`} aria-current={isActive ? 'page' : undefined}>
                  <div className={`w-6 h-6 flex items-center justify-center shrink-0 ${isActive ? 'bg-white dark:bg-[#111C2E] shadow-sm' : 'bg-slate-100 dark:bg-[#17243A]'} rounded-lg text-slate-600 dark:text-slate-300`}><Icon aria-hidden="true" className="w-4 h-4" /></div>
                  {!isCollapsed && <span className="font-bold text-sm">{item.label}</span>}
                </button>
              );
            })}
          </nav>

          <div className={`border-t border-slate-200 dark:border-[#26364D] px-3 py-3 space-y-2`}>
            <button type="button" onClick={onOpenCart} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left bg-[#F59E0B] text-white font-bold text-sm shadow-md hover:bg-[#D97706] transition-colors"><ShoppingCart className="w-4 h-4" />{!isCollapsed && <span>الطلبية ({cartSummary.itemCount})</span>}</button>
            <button type="button" onClick={onOpenNotificationCenter} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-[#17243A] transition-colors relative"><Bell className="w-4 h-4" /><span className="font-bold text-sm">{notificationCount > 0 ? `إشعارات (${notificationCount})` : 'الإشعارات'}</span>{notificationCount > 0 && <span className="absolute top-1 left-1 w-2.5 h-2.5 bg-[#DC2626] rounded-full text-[10px] flex items-center justify-center text-white font-black">{notificationCount > 9 ? '9+' : notificationCount}</span>}</button>
            {!isCollapsed && (
              <button type="button" onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-[#DC2626] dark:text-[#F87171] font-bold text-sm hover:bg-[#FEF2F2] dark:hover:bg-[#17243A]/50 transition-colors border border-[#DC2626]/20 dark:border-[#DC2626]/30"><LogOut className="w-4 h-4" /><span>تسجيل الخروج</span></button>
            )}
          </div>
        </aside>
      )}

      {isMobile && (
        <button type="button" onClick={() => setMobileOpen(true)} className="fixed right-4 top-20 z-50 bg-[#0D9488] text-white p-2.5 rounded-xl shadow-lg text-slate-900 hover:bg-[#0B796E] transition-colors md:hidden" aria-label="فتح القائمة"><span className="sr-only">القائمة الرئيسية</span><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
      )}
    </>
  );
};

export default Sidebar;
