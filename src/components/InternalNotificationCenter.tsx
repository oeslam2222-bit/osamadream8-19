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

const STORAGE_KEY = 'tantawy_notif_last_seen_v1';

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
  const [lastSeen, setLastSeen] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
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

  // بصمة البيانات الحالية — تتغير لما تظهر تنبيهات جديدة
  const signature = useMemo(
    () => notifications.map((n) => `${n.id}:${n.title}`).join('|'),
    [notifications]
  );
  const hasUnread = signature !== '' && signature !== lastSeen;

  const markAllRead = () => {
    setLastSeen(signature);
    try {
      localStorage.setItem(STORAGE_KEY, signature);
    } catch {
      /* ignore */
    }
  };

  const handleOpen = () => {
    setIsOpen((v) => !v);
  };

  const handleAction = (tab: string) => {
    setIsOpen(false);
    onNavigateToTab?.(tab);
  };

  const highCount = notifications.filter((n) => n.priority === 'high').length;

  return (
    <div className="relative">
      {/* زر الجرس */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="الإشعارات"
        aria-expanded={isOpen}
        className="relative w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition active:scale-95"
      >
        {hasUnread ? (
          <BellRing className="w-4 h-4" />
        ) : (
          <Bell className="w-4 h-4" />
        )}
        {notifications.length > 0 && (
          <span
            className={`absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center shadow ${
              highCount > 0 ? 'bg-rose-500' : 'bg-amber-500'
            }`}
          >
            {notifications.length}
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
            className="fixed z-50 inset-x-2 top-16 max-h-[70vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col md:inset-x-auto md:right-0 md:top-12 md:w-[380px]"
          >
            {/* الترويسة */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
                  <BellRing className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-black text-slate-800">مركز الإشعارات</div>
                  <div className="text-[10px] font-bold text-slate-500">
                    {notifications.length} تنبيه نشط • {currentUser?.branchName || 'كل الفروع'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {hasUnread && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1.5 rounded-lg cursor-pointer transition"
                    title="تعيين الكل كمقروء"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    مقروء
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

            {/* القائمة */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {notifications.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCheck className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                  <div className="text-[12px] font-black text-slate-600">لا توجد تنبيهات نشطة</div>
                  <p className="text-[10px] text-slate-400 mt-1">كل شيء تحت السيطرة</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = n.icon;
                  return (
                    <div
                      key={n.id}
                      className={`rounded-xl border p-3 ${priorityStyles[n.priority]}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${n.iconBg}`}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[n.priority]}`} />
                            <span className="text-[12px] font-black text-slate-800 leading-tight">
                              {n.title}
                            </span>
                          </div>
                          <p className="text-[11px] font-medium text-slate-600 mt-1 leading-snug">
                            {n.detail}
                          </p>
                          {n.actionTab && n.actionLabel && (
                            <button
                              type="button"
                              onClick={() => handleAction(n.actionTab as string)}
                              className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-black text-amber-700 underline underline-offset-2 cursor-pointer"
                            >
                              {n.actionLabel}
                              <ChevronDown className="w-3 h-3 -rotate-90" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* التذييل */}
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
              <span className="text-[9px] font-bold text-slate-400 truncate">
                طنطاوي دريم جروب • إشعارات داخية خفيفة
              </span>
              <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 shrink-0">
                <TrendingUp className="w-3 h-3" />
                بدون صور • استهلاك منخفض
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default InternalNotificationCenter;
