import {
  Bell,
  BellRing,
  Boxes,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  Flame,
  Package,
  ShieldAlert,
  Target,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import type { LucideIcon } from 'lucide-react';

interface AppNotification {
  id: string;
  kind: 'target' | 'visit' | 'customer' | 'product';
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  actionTab?: string;
  actionLabel?: string;
}

interface InternalNotificationCenterProps {
  onNavigateToTab?: (tab: string) => void;
}

const todayKey = (): string => {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
};

const priorityOrder: Record<AppNotification['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const priorityStyles: Record<AppNotification['priority'], string> = {
  high: 'border-rose-200 bg-rose-50',
  medium: 'border-amber-200 bg-amber-50',
  low: 'border-slate-200 bg-white',
};

const priorityDot: Record<AppNotification['priority'], string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
};

const STORAGE_KEY = 'tantawy_notifications_read_v3';

export const InternalNotificationCenter: React.FC<InternalNotificationCenterProps> = ({
  onNavigateToTab,
}) => {
  const {
    currentUser,
    invoices,
    visits,
    customers,
    targets,
    products,
    getVisibleInvoices,
    getVisibleVisits,
    getVisibleCustomers,
    getVisibleTargets,
    getVisibleProducts,
  } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<'unread' | 'all'>('unread');
  const [readNotifMap, setReadNotifMap] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const notifications = useMemo<AppNotification[]>(() => {
    const list: AppNotification[] = [];
    const visibleInvoices = getVisibleInvoices ? getVisibleInvoices() : invoices;
    const visibleVisits = getVisibleVisits ? getVisibleVisits() : visits;
    const visibleCustomers = getVisibleCustomers ? getVisibleCustomers() : customers;
    const visibleTargets = getVisibleTargets ? getVisibleTargets() : targets;
    const visibleProducts = getVisibleProducts ? getVisibleProducts() : products;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;
    const today = todayKey();

    // ===== التارجت: متبقي البيع والتحصيل =====
    const monthTargets = visibleTargets.filter(
      (t) => t.year === currentYear && t.month === currentMonthNum
    );
    const salesTarget = monthTargets.reduce((s, t) => s + (t.salesTarget || 0), 0);
    const salesAchieved = monthTargets.reduce((s, t) => s + (t.salesAchieved || 0), 0);
    const collectionTarget = monthTargets.reduce((s, t) => s + (t.collectionTarget || 0), 0);
    const collectionAchieved = monthTargets.reduce((s, t) => s + (t.collectionAchieved || 0), 0);
    const remainingSales = Math.max(0, salesTarget - salesAchieved);
    const remainingCollection = Math.max(0, collectionTarget - collectionAchieved);
    const salesRate = salesTarget > 0 ? Math.round((salesAchieved / salesTarget) * 100) : 0;

    if (remainingSales > 0 || remainingCollection > 0) {
      list.push({
        id: 'target-remaining',
        kind: 'target',
        priority: salesRate < 50 ? 'high' : salesRate < 75 ? 'medium' : 'low',
        title: `متبقي التارجت: ${formatCurrency(remainingSales)}`,
        detail: `إنجاز البيع ${salesRate}% • متبقي للتحصيل ${formatCurrency(remainingCollection)}`,
        icon: Target,
        accent: 'text-lime-700',
        iconBg: 'bg-lime-100 text-lime-700',
        actionTab: 'targets',
        actionLabel: 'التارجت',
      });
    }

    // ===== زيارات مجدولة غير منفذة (متأخرة + اليوم) =====
    const overdueVisits = visibleVisits.filter(
      (v) => v.status === 'مجدولة' && (v.date || '') < today
    );
    const todayVisits = visibleVisits.filter(
      (v) => v.status === 'مجدولة' && v.date === today
    );
    const pendingVisitCount = overdueVisits.length + todayVisits.length;
    if (pendingVisitCount > 0) {
      list.push({
        id: 'unperformed-visits',
        kind: 'visit',
        priority: overdueVisits.length > 0 ? 'high' : 'medium',
        title: `${pendingVisitCount} زيارة مجدولة غير منفذة`,
        detail:
          overdueVisits.length > 0
            ? `${overdueVisits.length} متأخرة عن موعدها • ${todayVisits.length} مجدولة اليوم`
            : `${todayVisits.length} مجدولة اليوم`,
        icon: CalendarClock,
        accent: 'text-rose-700',
        iconBg: 'bg-rose-100 text-rose-700',
        actionTab: 'visits',
        actionLabel: 'الزيارات',
      });
    }

    // ===== عملاء تجاوزوا حد الائتمان =====
    const overLimit = visibleCustomers.filter((c) => {
      const bal = Number(c.currentBalance ?? c.balance ?? 0);
      const limit = Number(c.creditLimit ?? 0);
      return limit > 0 && bal > limit;
    });
    if (overLimit.length > 0) {
      list.push({
        id: 'over-limit',
        kind: 'customer',
        priority: 'high',
        title: `${overLimit.length} عميل تجاوز حد الائتمان`,
        detail: 'راجع كشوف حسابهم قبل إنشاء طلبيات جديدة',
        icon: ShieldAlert,
        accent: 'text-rose-700',
        iconBg: 'bg-rose-100 text-rose-700',
        actionTab: 'all_customers',
        actionLabel: 'العملاء',
      });
    }

    // ===== إجمالي المديونيات =====
    const totalDebt = visibleCustomers.reduce(
      (s, c) => s + Number(c.currentBalance ?? c.balance ?? 0),
      0
    );
    const debtorsCount = visibleCustomers.filter(
      (c) => Number(c.currentBalance ?? c.balance ?? 0) > 0
    ).length;
    if (totalDebt > 0) {
      list.push({
        id: 'total-debt',
        kind: 'customer',
        priority: 'low',
        title: `إجمالي المديونيات: ${formatCurrency(totalDebt)}`,
        detail: `${debtorsCount} عميل عليه رصيد مستحق`,
        icon: Wallet,
        accent: 'text-indigo-700',
        iconBg: 'bg-indigo-100 text-indigo-700',
        actionTab: 'all_customers',
        actionLabel: 'العملاء',
      });
    }

    // ===== أصناف ناقصة =====
    const shortage = visibleProducts.filter((p) => p.status === 'نواقص');
    if (shortage.length > 0) {
      list.push({
        id: 'shortage',
        kind: 'product',
        priority: 'medium',
        title: `${shortage.length} صنف ناقص (نواقص)`,
        detail: 'أصناف تحتاج توريدًا من المخزن الرئيسي',
        icon: Package,
        accent: 'text-amber-700',
        iconBg: 'bg-amber-100 text-amber-700',
        actionTab: 'inventory',
        actionLabel: 'المخزون',
      });
    }

    // ===== أصناف بعرض ترويجي (جديدة/مميزة) =====
    const promo = visibleProducts.filter((p) => p.status === 'عرض ترويجي');
    if (promo.length > 0) {
      list.push({
        id: 'promo',
        kind: 'product',
        priority: 'low',
        title: `${promo.length} صنف بعرض ترويجي`,
        detail: 'أصناف مميزة بأسعار خاصة — روّج لها للعملاء',
        icon: Flame,
        accent: 'text-orange-700',
        iconBg: 'bg-orange-100 text-orange-700',
        actionTab: 'catalog',
        actionLabel: 'الكتالوج',
      });
    }

    // ===== أصناف راكدة =====
    const slow = visibleProducts.filter((p) => p.status === 'راكد');
    if (slow.length > 0) {
      list.push({
        id: 'slow',
        kind: 'product',
        priority: 'low',
        title: `${slow.length} صنف راكد`,
        detail: 'أصناف بطيئة الحركة — فكّر في عروض لتنشيطها',
        icon: Boxes,
        accent: 'text-slate-600',
        iconBg: 'bg-slate-100 text-slate-600',
        actionTab: 'catalog',
        actionLabel: 'الكتالوج',
      });
    }

    return list.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }, [
    invoices, visits, customers, targets, products,
    getVisibleInvoices, getVisibleVisits, getVisibleCustomers,
    getVisibleTargets, getVisibleProducts,
  ]);

  // تحديد الإشعارات غير المقروءة بدقة استناداً للذاكرة المحلية
  const isNotificationRead = (n: AppNotification): boolean => {
    return Boolean(readNotifMap[`${n.id}__${n.title}`] || readNotifMap[n.id]);
  };

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !isNotificationRead(n)),
    [notifications, readNotifMap]
  );

  const unreadCount = unreadNotifications.length;
  const highUnreadCount = unreadNotifications.filter((n) => n.priority === 'high').length;
  const hasUnread = unreadCount > 0;

  // تعيين كافة الإشعارات الحالية كمقروءة (زي الفيسبوك — يختفي الرقم والإشعارات من غير المقروءة)
  const markAllRead = () => {
    setReadNotifMap((prev) => {
      const updated = { ...prev };
      notifications.forEach((n) => {
        updated[`${n.id}__${n.title}`] = true;
        updated[n.id] = true;
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      return updated;
    });
  };

  // تعيين إشعار فردي محدد كمقروء
  const markSingleRead = (n: AppNotification) => {
    setReadNotifMap((prev) => {
      const updated = {
        ...prev,
        [`${n.id}__${n.title}`]: true,
        [n.id]: true,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      return updated;
    });
  };

  const handleOpen = () => {
    setIsOpen((v) => !v);
  };

  const handleAction = (tab: string, n?: AppNotification) => {
    if (n) {
      markSingleRead(n);
    }
    setIsOpen(false);
    onNavigateToTab?.(tab);
  };

  const displayedNotifications = filterMode === 'unread' ? unreadNotifications : notifications;

  return (
    <div className="relative">
      {/* زر الجرس — مثل فيسبوك: يظهر الرقم فقط إذا كانت هناك إشعارات غير مقروءة، ويختفي تماماً عند القراءة */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="الإشعارات"
        aria-expanded={isOpen}
        className="relative w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition active:scale-95"
      >
        {hasUnread ? (
          <BellRing className="w-4 h-4 text-amber-600 animate-pulse" />
        ) : (
          <Bell className="w-4 h-4 text-slate-500" />
        )}
        {hasUnread && (
          <span
            className={`absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center shadow-md animate-in zoom-in ${
              highUnreadCount > 0 ? 'bg-rose-500 ring-2 ring-white' : 'bg-amber-500 ring-2 ring-white'
            }`}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* اللوحة */}
      {isOpen && (
        <>
          {/* خلفية للإغلاق */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="مركز الإشعارات"
            className="fixed z-50 inset-x-2 top-16 max-h-[75vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col md:inset-x-auto md:right-0 md:top-12 md:w-[410px] animate-in fade-in zoom-in-95"
          >
            {/* الترويسة الرئيسية */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/80 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-xs">
                    <BellRing className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-black text-slate-800">مركز الإشعارات والتنبيهات</div>
                    <div className="text-[10px] font-bold text-slate-500">
                      {hasUnread ? `${unreadCount} تنبيه جديد غير مقروء` : 'جميع التنبيهات مقروءة بالكامل'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {hasUnread && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-black px-2.5 py-1.5 rounded-xl cursor-pointer transition shadow-xs active:scale-95"
                      title="تعيين كافة الإشعارات كمقروءة وإخفاء علامة التنبيه"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>تم قراءة الكل</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition"
                    aria-label="إغلاق"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* تبويبات الفرز على طريقة فيسبوك: غير المقروءة والكل */}
              <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-200/60">
                <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-xl text-[10.5px] font-black flex-1">
                  <button
                    type="button"
                    onClick={() => setFilterMode('unread')}
                    className={`flex-1 py-1 rounded-lg transition text-center cursor-pointer ${
                      filterMode === 'unread'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    غير المقروءة ({unreadCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`flex-1 py-1 rounded-lg transition text-center cursor-pointer ${
                      filterMode === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    كل الإشعارات ({notifications.length})
                  </button>
                </div>

                {hasUnread && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200/60 shrink-0">
                    ⚡ مباشر
                  </span>
                )}
              </div>
            </div>

            {/* قائمة الإشعارات */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {displayedNotifications.length === 0 ? (
                <div className="text-center py-12 px-4 space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                    <CheckCheck className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div className="text-sm font-black text-slate-800">
                    {filterMode === 'unread' ? 'تمت قراءة جميع الإشعارات بنجاح ✅' : 'لا توجد تنبيهات حالياً'}
                  </div>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                    {filterMode === 'unread'
                      ? 'مثل فيسبوك تماماً؛ تم تفريغ الإشعارات المقروءة ولن يظهر الرقم على الجرس حتى وصول أي تنبيه جديد.'
                      : 'كافة أمور الحسابات والمخزون والزيارات منتظمة تماماً.'}
                  </p>
                  {filterMode === 'unread' && notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterMode('all')}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-4 pt-1 cursor-pointer block mx-auto"
                    >
                      استعراض الإشعارات السابقة ({notifications.length})
                    </button>
                  )}
                </div>
              ) : (
                displayedNotifications.map((n) => {
                  const Icon = n.icon;
                  const isRead = isNotificationRead(n);

                  return (
                    <div
                      key={n.id}
                      className={`rounded-xl border p-3 transition relative group ${
                        isRead
                          ? 'border-slate-200 bg-slate-50/70 opacity-75'
                          : priorityStyles[n.priority]
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${n.iconBg}`}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {!isRead ? (
                                <span className={`w-2 h-2 rounded-full shrink-0 ${priorityDot[n.priority]} ring-2 ring-white`} title="غير مقروء" />
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400 shrink-0">✓</span>
                              )}
                              <span className="text-[12px] font-black text-slate-800 leading-tight truncate">
                                {n.title}
                              </span>
                            </div>

                            {/* زر تم القراءة الفردي مثل فيسبوك */}
                            {!isRead && (
                              <button
                                type="button"
                                onClick={() => markSingleRead(n)}
                                className="text-[10px] font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg shrink-0 cursor-pointer transition active:scale-95"
                                title="تحديد هذا الإشعار كمقروء"
                              >
                                تم القراءة ✓
                              </button>
                            )}
                          </div>

                          <p className="text-[11px] font-medium text-slate-600 mt-1 leading-snug">
                            {n.detail}
                          </p>

                          <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-slate-100/80">
                            {n.actionTab && n.actionLabel ? (
                              <button
                                type="button"
                                onClick={() => handleAction(n.actionTab as string, n)}
                                className="inline-flex items-center gap-1 text-[10.5px] font-black text-amber-800 hover:text-amber-900 underline underline-offset-2 cursor-pointer"
                              >
                                {n.actionLabel}
                                <ChevronDown className="w-3 h-3 -rotate-90" />
                              </button>
                            ) : <span />}

                            {isRead && (
                              <span className="text-[9.5px] font-bold text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded">
                                مقروء
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* التذييل */}
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
              <span className="text-[9.5px] font-bold text-slate-400 truncate">
                طنطاوي دريم جروب • إشعارات ذكية
              </span>
              <span className="flex items-center gap-1 text-[9.5px] font-bold text-slate-400 shrink-0">
                <TrendingUp className="w-3 h-3" />
                تحفظ القراءة محلياً
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default InternalNotificationCenter;
