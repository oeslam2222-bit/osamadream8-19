import React, { useState } from 'react';
import { Search, Users, Phone, MapPin, Plus } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone: string;
  city: string;
  balance: string;
  status: 'active' | 'due' | 'blocked';
}

const customers: Customer[] = [
  { id: '1', name: 'أحمد محمد علي', phone: '01012345678', city: 'القاهرة', balance: '1,250', status: 'active' },
  { id: '2', name: 'سارة أحمد', phone: '01123456789', city: 'الجيزة', balance: '3,400', status: 'due' },
  { id: '3', name: 'محمد سالم', phone: '01234567890', city: 'الإسكندرية', balance: '0', status: 'active' },
  { id: '4', name: 'فاطمة حسن', phone: '01098765432', city: 'الفيوم', balance: '850', status: 'blocked' },
  { id: '5', name: 'خالد سعيد', phone: '01287654321', city: 'المنصورة', balance: '2,100', status: 'due' },
];

const statusConfig = {
  active: { label: 'نشط', color: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' },
  due: { label: 'مدين', color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' },
  blocked: { label: 'موقوف', color: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' },
};

export const CustomersScreen: React.FC = () => {
  const [search, setSearch] = useState('');
  const filtered = customers.filter((c) => c.name.includes(search) || c.phone.includes(search));

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h1 className="font-arabic-display font-bold text-xl text-slate-900 dark:text-white">العملاء</h1>
          </div>
          <button className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center active:scale-95">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ابحث بالاسم أو الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-10 pl-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      <div className="px-4 space-y-2.5">
        {filtered.map((c) => {
          const cfg = statusConfig[c.status];
          return (
            <div key={c.id} className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">
                {c.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{c.name}</p>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${cfg.color}`}>{cfg.label}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.city}</span>
                </div>
              </div>
              <div className="text-left">
                <p className="text-[10px] text-slate-500 dark:text-slate-400">الرصيد</p>
                <p className="text-sm font-black text-slate-900 dark:text-white">{c.balance}</p>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">لا يوجد عملاء</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomersScreen;
