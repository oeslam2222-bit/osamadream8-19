import React from 'react';
import {
  Building2,
  CloudLightning,
  FileSpreadsheet,
  FileText,
  Layers,
  Package,
  Receipt,
  Server,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  isOffline: boolean;
  notificationCount: number;
  onOpenNotificationCenter: () => void;
  onOpenCart: () => void;
}

const navItems = [
  { key: 'home', label: 'الرئيسية', icon: Building2 },
  { key: 'catalog', label: 'الكتالوج', icon: Package },
  { key: 'invoices', label: 'الفواتير', icon: FileText },
  { key: 'customers', label: 'العملاء', icon: Users },
  { key: 'dashboard', label: 'لوحة الإشراف', icon: ShieldCheck },
  { key: 'visits', label: 'الزيارات', icon: Package },
  { key: 'inventory', label: 'المخزون', icon: Layers },
  { key: 'users', label: 'إدارة المستخدمين', icon: Server },
] as const;

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isDark,
  setIsDark,
  isOffline,
  notificationCount,
  onOpenNotificationCenter,
  onOpenCart,
}) => {
  return (
    <nav className="hidden md:flex flex-col gap-1 px-4 py-4 border-r border-slate-200 dark:border-slate-800 w-64">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-slate-800 flex items-center justify-center text-amber-500 font-black">
            <Building2 className="w-5 h-5" />
          </div>
          <span className="font-black text-slate-800 dark:text-white text-sm">طنطاوي جروب</span>
        </div>
        <button
          onClick={() => setIsDark(!isDark)}
          className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          title="الت puts بين الوضع الفاتح والداكن"
        >
          {isDark ? (
            <CloudLightning className="w-5 h-5 text-slate-600 dark:text-amber-400" />
          ) : (
            <Server className="w-5 h-5 text-slate-600" />
          )}
        </button>
      </div>

      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.key;
        return (
          <button
            key={item.key}
            onClick={() => setActiveTab(item.key)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition ${
              isActive
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-800'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
            <span>{item.label}</span>
          </button>
        );
      })}

      <div className="mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 px-4 py-2">
          {isOffline ? (
            <WifiOff className="w-4 h-4 text-amber-500 animate-pulse" />
          ) : (
            <Wifi className="w-4 h-4 text-slate-400" />
          )}
          <span className="text-xs font-medium {isOffline ? 'text-amber-600' : 'text-slate-500'}">
            {isOffline ? 'وضع عدم الاتصال' : 'متصل'}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-medium text-slate-500">إشعارات جديدة</span>
          <span className="text-xs font-bold text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
            {notificationCount}
          </span>
        </div>
        <button
          onClick={onOpenNotificationCenter}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition"
        >
          <span className="w-4 h-4 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-bell"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </span>
          <span>مركز الإشعارات</span>
        </button>
      </div>
    </nav>
  );
};

export default Sidebar;
