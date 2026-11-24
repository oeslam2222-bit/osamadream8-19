import React from 'react';
import {
  Home, Package, Receipt, Users, ShieldCheck, Calendar, Settings, LogOut,
  Sun, Moon, Wallet
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface DesktopSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

const DEFAULT_EXECUTIVE_AVATAR = '/assets/rep-avatar-v2.jpg';

const roleNames: Record<string, { label: string; bg: string; text: string }> = {
  admin: { label: 'الآدمن (الإدارة العامة)', bg: 'bg-[var(--app-risk)] border-[var(--app-risk)]', text: 'text-[#ef4444]' },
  developer: { label: 'المطور (الدعم التقني)', bg: 'bg-[var(--app-accent)] border-[var(--app-accent)]', text: 'text-white' },
  branch_manager: { label: 'مدير الفرع', bg: 'bg-[var(--app-navy)] border-[var(--app-navy)]', text: 'text-[#60a5fa]' },
  supervisor: { label: 'مشرف المناديب', bg: 'bg-[var(--app-navy)] border-[var(--app-navy)]', text: 'text-[#60a5fa]' },
  sales_rep: { label: 'المندوب', bg: 'bg-[var(--app-ok)] border-[var(--app-ok)]', text: 'text-[#0d9488]' },
  warehouse_keeper: { label: 'أمين المخزن', bg: 'bg-[var(--app-ok)] border-[var(--app-ok)]', text: 'text-[#0d9488]' },
  legal_advisor: { label: 'الشؤون القانونية', bg: 'bg-[var(--app-navy)] border-[var(--app-navy)]', text: 'text-[#60a5fa]' },
  technical_support: { label: 'الدعم الفني', bg: 'bg-[var(--app-accent)] border-[var(--app-accent)]', text: 'text-white' },
};

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

const navItems: Array<{ id: string; label: string; icon: any; roles: string[]; badge?: number; promo?: boolean }> = [
  { id: 'home', label: 'الرئيسية', icon: Home, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper', 'legal_advisor'] },
  { id: 'product_sales', label: 'مبيعات الأصناف', icon: Package, roles: ['admin', 'developer', 'branch_manager', 'supervisor'] },
  { id: 'invoices', label: 'أوامر البيع والاعتمادات', icon: Receipt, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
  { id: 'catalog', label: 'الكتالوج', icon: Package, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
  { id: 'customers', label: 'العملاء', icon: Users, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
  { id: 'reps', label: 'المناديب', icon: Users, roles: ['admin', 'branch_manager', 'supervisor', 'developer'] },
  { id: 'collection', label: 'تحصيل', icon: Wallet, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
  { id: 'returns', label: 'المرتجعات', icon: Calendar, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper'] },
  { id: 'legal_advisor', label: 'المستشار القانوني', icon: ShieldCheck, roles: ['admin', 'developer', 'legal_advisor'] },
  { id: 'offers', label: 'العروض', icon: Wallet, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'], promo: true },
  { id: 'targets', label: 'التارجت', icon: ShieldCheck, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
  { id: 'visits', label: 'الزيارات', icon: Calendar, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer'] },
  { id: 'excel', label: 'الإكسل', icon: Package, roles: ['admin', 'developer'] },
  { id: 'guide', label: 'الدليل', icon: Package, roles: [] },
  { id: 'users', label: 'الفريق', icon: Users, roles: ['admin', 'developer', 'branch_manager', 'supervisor'] },
  { id: 'permissions', label: 'الصلاحيات', icon: ShieldCheck, roles: ['admin', 'developer'] },
  { id: 'pending_sync', label: 'مزامنة معلقة', icon: Wallet, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper', 'legal_advisor'] },
  { id: 'settings', label: 'الإعدادات', icon: Settings, roles: ['admin', 'branch_manager', 'supervisor', 'sales_rep', 'developer', 'warehouse_keeper', 'legal_advisor'] },
];

const navGroups: Array<{ id: string; label: string; items: string[] }> = [
  { id: 'main', label: 'الرئيسية', items: ['home'] },
  { id: 'selling', label: 'البيع والكتالوج', items: ['invoices', 'catalog', 'product_sales', 'offers'] },
  { id: 'field', label: 'العملاء والتحصيل', items: ['customers', 'collection', 'returns', 'visits'] },
  { id: 'reports', label: 'التقارير والأهداف', items: ['targets', 'reps', 'excel'] },
  { id: 'admin', label: 'الإدارة والنظام', items: ['users', 'permissions', 'pending_sync', 'guide', 'legal_advisor', 'settings'] },
];

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  setActiveTab,
  isSidebarCollapsed = false,
  onToggleSidebar,
}) => {
  const { currentUser, users, isOffline } = useApp();

  const displayName = (currentUser?.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'مستخدم';
  const initial = displayName.charAt(0);
  const roleLabel = roleNames[currentUser?.role || '']?.label || currentUser?.role || '';

  const supervisorName = currentUser?.supervisorId
    ? users.find((u) => u.id === currentUser.supervisorId)?.name
    : null;

  const supervisedRepsCount = currentUser?.role === 'supervisor'
    ? users.filter((u) => u.supervisorId === currentUser.id).length
    : 0;

  const filteredNavItems = navItems.filter((item) => item.roles.includes(currentUser?.role || ''));

  const groupedNav = navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((id) => filteredNavItems.find((item) => item.id === id))
        .filter((item): item is (typeof navItems)[number] => Boolean(item)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className="ds-sidebar print:hidden" aria-label="القائمة الرئيسية" dir="rtl">
      <div className="ds-sidebar__brand">
        <img src="/icon.svg" alt="طنطاوي جروب" className="ds-sidebar__logo" />
        <div className="min-w-0 flex-1">
          <strong>طنطاوي جروب</strong>
          <span>Dream Tantawy</span>
        </div>
      </div>

      <div className="ds-sidebar__user">
        <div className="ds-sidebar__user-avatar" aria-hidden="true">
          <img
            src={DEFAULT_EXECUTIVE_AVATAR}
            alt={displayName}
            referrerPolicy="no-referrer"
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
          <div className="ds-sidebar__user-branch">{currentUser?.branchName || 'الفرع الرئيسي'}</div>
        </div>
      </div>

      <nav className="ds-sidebar__nav" aria-label="أقسام المنظومة">
        {groupedNav.map((group) => (
          <div className="ds-sidebar__group" key={`nav-group-${group.id}`}>
            <div className="ds-sidebar__group-label">{group.label}</div>
            {group.items.map((item) => {
              const Icon: any = item.icon;
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
                  {item.promo && <span className="ds-sidebar__promo">مميز</span>}
                  {item.badge && item.badge > 0 ? (
                    <span className="ds-count">{item.badge}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="ds-sidebar__footer">
        <div className="ds-sidebar__status">
          <span className="flex items-center gap-2">
            <span className="ds-status-dot" />
            <span>{isOffline ? 'وضع عدم الاتصال' : 'متصل بالخادم'}</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">V9.0</span>
        </div>
      </div>
    </aside>
  );
};
