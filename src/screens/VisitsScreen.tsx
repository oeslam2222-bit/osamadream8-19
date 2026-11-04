import React, { useState } from 'react';
import { Calendar, MapPin, Clock, CheckCircle2, XCircle, Plus } from 'lucide-react';

interface Visit {
  id: string;
  customer: string;
  city: string;
  time: string;
  status: 'done' | 'pending' | 'missed';
}

const visits: Visit[] = [
  { id: '1', customer: 'أحمد محمد علي', city: 'القاهرة', time: '09:30 ص', status: 'done' },
  { id: '2', customer: 'سارة أحمد', city: 'الجيزة', time: '11:00 ص', status: 'done' },
  { id: '3', customer: 'محمد سالم', city: 'الإسكندرية', time: '01:00 م', status: 'pending' },
  { id: '4', customer: 'فاطمة حسن', city: 'الفيوم', time: '03:00 م', status: 'pending' },
  { id: '5', customer: 'خالد سعيد', city: 'المنصورة', time: '10:00 ص', status: 'missed' },
];

const statusConfig = {
  done: { label: 'تمت', icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
  pending: { label: 'مجدولة', icon: Clock, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  missed: { label: 'فائتة', icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
};

export const VisitsScreen: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const filtered = filter === 'all' ? visits : visits.filter((v) => v.status === filter);

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h1 className="font-arabic-display font-bold text-xl text-slate-900 dark:text-white">الزيارات</h1>
          </div>
          <button className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center active:scale-95">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'done'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-9 px-4 rounded-full text-xs font-bold transition ${filter === f ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}
            >
              {f === 'all' ? 'الكل' : f === 'pending' ? 'مجدولة' : 'تمت'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 space-y-2.5">
        {filtered.map((v) => {
          const cfg = statusConfig[v.status];
          const Icon = cfg.icon;
          return (
            <div key={v.id} className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{v.customer}</p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{v.city}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{v.time}</span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VisitsScreen;
