import React from 'react';
import { Bell, Package, Wallet, Users, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'success' | 'warning' | 'info' | 'task';
  unread: boolean;
}

const notifications: Notification[] = [
  { id: '1', title: 'تم اعتماد الفاتورة #INV-003', message: 'تم اعتماد فاتورة محمد علي بقيمة 780 ج.م', time: 'منذ 5 دقائق', type: 'success', unread: true },
  { id: '2', title: 'مخزون منخفض', message: 'صنف أكواب ورقية أقل من الحد الأدنى (18 قطعة)', time: 'منذ 20 دقيقة', type: 'warning', unread: true },
  { id: '3', title: 'تحصيل جديد', message: 'تم تحصيل 450 ج.م من العميل أحمد محمد', time: 'منذ ساعة', type: 'info', unread: false },
  { id: '4', title: 'مهمة زيارة', message: 'لديك 5 عملاء مقرر زيارتهم اليوم', time: 'منذ 3 ساعات', type: 'task', unread: false },
];

const typeConfig = {
  success: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  task: { icon: Package, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
};

export const NotificationsScreen: React.FC = () => {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h1 className="font-arabic-display font-bold text-xl text-slate-900 dark:text-white">الإشعارات</h1>
        </div>
        <button className="text-[11px] text-blue-600 dark:text-blue-400 font-bold">تحديد الكل كمقروء</button>
      </div>

      <div className="px-4 space-y-2.5">
        {notifications.map((n) => {
          const cfg = typeConfig[n.type];
          const Icon = cfg.icon;
          return (
            <div key={n.id} className={`rounded-2xl p-3.5 shadow-sm border flex items-start gap-3 ${n.unread ? 'bg-white dark:bg-slate-800 border-blue-100 dark:border-blue-900' : 'bg-white/70 dark:bg-slate-800/70 border-slate-100 dark:border-slate-700'}`}>
              <div className={`w-9 h-9 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{n.title}</p>
                  {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{n.message}</p>
                <p className="text-[10px] text-slate-400 mt-1">{n.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationsScreen;
