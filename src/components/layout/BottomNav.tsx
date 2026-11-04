import { Home, Package, Receipt, Users, Truck } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (screen: string) => void;
  allowedScreens?: string[];
}

const navItems = [
  { id: 'dashboard', label: 'الرئيسية', icon: Home, color: 'bg-amber-500 text-amber-600' },
  { id: 'catalog', label: 'الكتالوج', icon: Package, color: 'bg-blue-500 text-blue-600' },
  { id: 'invoices', label: 'الفواتير', icon: Receipt, color: 'bg-emerald-500 text-emerald-600' },
  { id: 'customers', label: 'العملاء', icon: Users, color: 'bg-indigo-500 text-indigo-600' },
  { id: 'neworder', label: 'فاتورة جديدة', icon: Truck, color: 'bg-rose-500 text-rose-600' },
];

export function BottomNav({ activeTab, onTabChange, allowedScreens }: BottomNavProps) {
  const items = allowedScreens ? navItems.filter(i => allowedScreens.includes(i.id)) : navItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[50] h-20 bg-white/95 backdrop-blur-xl border-t border-slate-200 dark:bg-slate-950/95 dark:border-slate-800">
      <div className="flex items-center justify-around h-full px-2 sm:px-4">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const [bg, text] = item.color.split(' ');

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center justify-center gap-1 w-full h-full px-2 py-1.5 rounded-2xl transition-all duration-200 ${
                isActive
                  ? `${bg}/20 ${text} shadow-[0_0_20px_rgba(0,0,0,0.08)]`
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? '' : 'opacity-60'}`} />
              <span className={`text-[10px] font-black leading-none ${isActive ? '' : 'opacity-70'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}