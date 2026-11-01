import React, { useCallback, useState } from 'react';
import { Bell, X, ChevronRight, AlertCircle, Info, CheckCircle2, ShieldAlert, Clock } from 'lucide-react';

export type NotificationType = 'system' | 'task' | 'warning' | 'info' | 'success';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications?: NotificationItem[];
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onDelete?: (id: string) => void;
  onNotificationClick?: (notification: NotificationItem) => void;
}

const TYPE_CONFIG: Record<NotificationType, { icon: React.ReactNode; color: string; bg: string }> = {
  system: { icon: <ShieldAlert className="w-5 h-5" />, color: 'text-blue-600', bg: 'bg-blue-50' },
  task: { icon: <Clock className="w-5 h-5" />, color: 'text-amber-600', bg: 'bg-amber-50' },
  warning: { icon: <AlertCircle className="w-5 h-5" />, color: 'text-rose-600', bg: 'bg-rose-50' },
  info: { icon: <Info className="w-5 h-5" />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  success: { icon: <CheckCircle2 className="w-5 h-5" />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications = [],
  onMarkRead,
  onMarkAllRead,
  onDelete,
  onNotificationClick,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'system' | 'task' | 'warning' | 'info' | 'success'>('all');

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  const handleMarkRead = useCallback((id: string) => {
    onMarkRead?.(id);
  }, [onMarkRead]);

  const handleMarkAllRead = useCallback(() => {
    onMarkAllRead?.();
  }, [onMarkAllRead]);

  const handleDelete = useCallback((id: string) => {
    onDelete?.(id);
  }, [onDelete]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="مركز الإشعارات"
      onClick={onClose}
    >
      <div className="absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 bg-surface rounded-3xl border border-border-primary shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-in mi-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 sm:p-8 border-b border-border-primary flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-blue-soft text-blue-600 flex items-center justify-center font-bold shadow-sm">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-primary text-lg">مركز الإشعارات</h3>
              <p className="text-secondary text-xs">{unreadCount} إشعار غير مقروء</p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button type="button" onClick={handleMarkAllRead} className="text-xs font-bold text-link hover:underline transition" aria-label="تحديد الكل كمقروء">
              تحديد الكل كمقروء
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="border-b border-border-primary/50 px-6 sm:p-8 overflow-x-auto pb-2">
          <div className="flex gap-2 no-scrollbar">
            <button type="button" onClick={() => setFilter('all')} className={`px-3 py-2 rounded-xl text-xs font-bold transition ${filter === 'all' ? 'bg-navy text-white shadow-sm' : 'text-muted hover:text-primary'}`}>
              الكل
            </button>
            <button type="button" onClick={() => setFilter('unread')} className={`px-3 py-2 rounded-xl text-xs font-bold transition ${filter === 'unread' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'text-muted hover:text-primary'}`}>
              غير مقروء
            </button>
            <button type="button" onClick={() => setFilter('system')} className={`px-3 py-2 rounded-xl text-xs font-bold transition ${filter === 'system' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-muted hover:text-primary'}`}>
              نظام
            </button>
            <button type="button" onClick={() => setFilter('task')} className={`px-3 py-2 rounded-xl text-xs font-bold transition ${filter === 'task' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'text-muted hover:text-primary'}`}>
              مهام
            </button>
            <button type="button" onClick={() => setFilter('warning')} className={`px-3 py-2 rounded-xl text-xs font-bold transition ${filter === 'warning' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'text-muted hover:text-primary'}`}>
              تحذير
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="overflow-y-auto max-h-[60vh] px-4 sm:px-6">
          {filteredNotifications.length === 0 ? (
            <div className="p-8 text-center text-secondary">
              <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-medium text-primary">لا توجد إشعارات</p>
              <p className="text-xs mt-1">سيتم عرض الإشعارات هنا عند حدوث تنبيهات النظام أو المهام الجديدة.</p>
            </div>
          ) : (
            <div className="divide-y divide-border-primary/50">
              {filteredNotifications.map((notification) => (
                <div key={notification.id} className={`p-4 sm:p-5 flex items-start gap-3 transition hover:bg-surface-hover cursor-pointer border-b border-border-primary/50 last:border-0 ${!notification.read ? 'bg-surface-alt' : ''}`} onClick={() => { if (!notification.read) handleMarkRead(notification.id); onNotificationClick?.(notification); }}>
                  <div className={`shrink-0 mt-0.5 p-1.5 rounded-lg ${TYPE_CONFIG[notification.type].bg} ${TYPE_CONFIG[notification.type].color}`}>{TYPE_CONFIG[notification.type].icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`font-black text-sm ${!notification.read ? 'text-primary' : 'text-secondary'}`}>{notification.title}</h4>
                      <span className="text-[10px] text-muted font-medium">{notification.time}</span>
                    </div>
                    <p className="text-secondary text-xs mt-1 leading-relaxed">{notification.message}</p>
                    {notification.actionLabel && notification.actionUrl && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onNotificationClick?.(notification); }} className="mt-2 text-xs font-bold text-link hover:underline flex items-center gap-1">
                        {notification.actionLabel} <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    {!notification.read && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleMarkRead(notification.id); }} className="p-1 text-muted hover:text-primary transition" aria-label="تحديد كمقروء">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(notification.id); }} className="p-1 text-muted hover:text-rose-600 transition" aria-label="حذف الإشعار">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border-primary/50 p-4 sm:p-6 bg-surface-alt rounded-b-3xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted font-bold">إجمالي {notifications.length} إشعار · غير مقروء {unreadCount}</span>
            <button type="button" onClick={onClose} className="text-xs font-bold text-primary hover:text-link transition px-3 py-1.5 rounded-lg hover:bg-surface-hover">إغلاق</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;