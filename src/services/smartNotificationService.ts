import { currentUserRef } from '../context/AppContext';

/**
 * Smart Notification Service
 * 
 * Problem: Current system shows all notifications to everyone, causing fatigue.
 * Solution: 
 * - Role-based filtering (rep sees only their branch/sector)
 * - Change detection (only notify on actual data changes)
 * - Deduplication (group similar updates within time window)
 * - Priority scoring (important vs routine)
 * - LocalStorage persistence for cross-session tracking
 */

export type NotificationType = 
  | 'inventory'    // تحديث المخزون
  | 'targets'      // تحديث التارجت
  | 'customers'    // تحديث قاعدة العملاء
  | 'promotions'   // عروض/إعلانات جديدة
  | 'system'       // نظام
  | 'task';        // مهام/زيارات

export interface SmartNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  timestamp: number;
  read: boolean;
  // لل deduplication
  groupKey: string;        // مثل: "inventory:home:october"
  changeHash: string;      // hash للتغيير الفعلي
  // للتنقل
  actionUrl?: string;
  actionLabel?: string;
  // للـ metadata
  metadata?: Record<string, any>;
}

// مفاتيح التخزين
const NOTIF_STORAGE_KEY = 'tantawy_smart_notifications_v1';
const NOTIF_SEEN_HASHES_KEY = 'tantawy_notif_seen_hashes_v1';
const NOTIF_LAST_CHECK_KEY = 'tantawy_notif_last_check_v1';

// نافذة تجميع الإشعارات المتشابهة (10 دقائق)
const GROUP_WINDOW_MS = 10 * 60 * 1000;
// الاحتفاظ بالهاشات المرئية لـ 7 أيام
const SEEN_HASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// حد الإشعارات المخزنة
const MAX_NOTIFICATIONS = 100;

/**
 * يحسب hash بسيط للتغيير (للكشف عن التكرار)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * يولد groupKey حسب النوع والسياق
 */
function buildGroupKey(type: NotificationType, scope?: { branch?: string; sector?: string; repId?: string }): string {
  const parts = [type];
  if (scope?.branch) parts.push(`branch:${scope.branch}`);
  if (scope?.sector) parts.push(`sector:${scope.sector}`);
  if (scope?.repId) parts.push(`rep:${scope.repId}`);
  return parts.join('|');
}

/**
 * يتحقق هل المستخدم يرى هذا النوع من الإشعارات
 */
function shouldNotifyUser(notif: SmartNotification): boolean {
  const user = currentUserRef.current;
  if (!user) return false;

  // الإدارة تشوف كل حاجة
  if (user.role === 'admin' || user.role === 'developer') return true;

  // المندوب: فرعهم وقطاعهم فقط
  if (user.role === 'sales_rep') {
    if (notif.metadata?.branch && notif.metadata.branch !== user.branchName) return false;
    if (notif.metadata?.sector && notif.metadata.sector !== user.sector) return false;
    // للمهام: مسؤوليته فقط
    if (notif.type === 'task' && notif.metadata?.repId && notif.metadata.repId !== user.id) return false;
    return true;
  }

  // المشرف/مدير الفرع: فرعهم
  if (user.role === 'supervisor' || user.role === 'branch_manager') {
    if (notif.metadata?.branch && notif.metadata.branch !== user.branchName) return false;
    return true;
  }

  return false;
}

/**
 * يضيف إشعار ذكي (مع deduplication)
 */
export function addSmartNotification(notif: Omit<SmartNotification, 'id' | 'timestamp' | 'read' | 'groupKey' | 'changeHash'> & {
  scope?: { branch?: string; sector?: string; repId?: string };
  deduplicate?: boolean; // افتراضي true
}): SmartNotification | null {
  try {
    const user = currentUserRef.current;
    if (!user) return null;

    // فلترة حسب الدور
    const tempNotif: SmartNotification = {
      ...notif,
      id: '',
      timestamp: Date.now(),
      read: false,
      groupKey: buildGroupKey(notif.type, notif.scope),
      changeHash: simpleHash(JSON.stringify(notif.metadata || {})),
    } as SmartNotification;

    if (!shouldNotifyUser(tempNotif)) return null;

    // قراءة الإشعارات الموجودة
    let notifications: SmartNotification[] = [];
    try {
      const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
      if (raw) notifications = JSON.parse(raw);
    } catch {}

    // قراءة الهاشات المرئية
    let seenHashes: Record<string, number> = {};
    try {
      const raw = localStorage.getItem(NOTIF_SEEN_HASHES_KEY);
      if (raw) seenHashes = JSON.parse(raw);
    } catch {}

    // تنظيف الهاشات القديمة
    const now = Date.now();
    Object.keys(seenHashes).forEach((key) => {
      if (now - seenHashes[key] > SEEN_HASH_TTL_MS) delete seenHashes[key];
    });

    // Deduplication: لو فيه نفس groupKey و نفس changeHash خلال النافذة، ما نضيفش
    if (notif.deduplicate !== false) {
      const existing = notifications.find(
        (n) => n.groupKey === tempNotif.groupKey && n.changeHash === tempNotif.changeHash && now - n.timestamp < GROUP_WINDOW_MS
      );
      if (existing) {
        // نحدث التوقيت فقط
        existing.timestamp = now;
        saveNotifications(notifications);
        return null; // ما نرجعهوش عشان ما يتكررش في UI
      }

      // لو الهاش مرئي قبل كده (في جلسة سابقة)، ما نضيفش
      if (seenHashes[tempNotif.changeHash]) return null;
    }

    // إضافة الإشعار الجديد
    const newNotif: SmartNotification = {
      ...tempNotif,
      id: `notif_${now}_${Math.random().toString(36).slice(2, 8)}`,
    };

    notifications.unshift(newNotif);
    if (notifications.length > MAX_NOTIFICATIONS) notifications = notifications.slice(0, MAX_NOTIFICATIONS);

    saveNotifications(notifications);

    // تسجيل الهاش كمرئي
    seenHashes[newNotif.changeHash] = now;
    saveSeenHashes(seenHashes);

    return newNotif;
  } catch {
    return null;
  }
}

function saveNotifications(notifs: SmartNotification[]): void {
  try {
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifs));
  } catch {}
}

function saveSeenHashes(hashes: Record<string, number>): void {
  try {
    localStorage.setItem(NOTIF_SEEN_HASHES_KEY, JSON.stringify(hashes));
  } catch {}
}

/**
 * يجلب الإشعارات للمستخدم الحالي (مفلترة حسب الدور)
 */
export function getSmartNotifications(): SmartNotification[] {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    const all: SmartNotification[] = raw ? JSON.parse(raw) : [];
    return all.filter(shouldNotifyUser);
  } catch {
    return [];
  }
}

/**
 * يحدد إشعار كمقروء
 */
export function markNotificationRead(id: string): void {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return;
    const all: SmartNotification[] = JSON.parse(raw);
    const updated = all.map((n) => (n.id === id ? { ...n, read: true } : n));
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * يحدد الكل كمقروء
 */
export function markAllNotificationsRead(): void {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return;
    const all: SmartNotification[] = JSON.parse(raw);
    const updated = all.map((n) => ({ ...n, read: true }));
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * يحذف إشعار
 */
export function deleteNotification(id: string): void {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return;
    const all: SmartNotification[] = JSON.parse(raw);
    const updated = all.filter((n) => n.id !== id);
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * يزيل الإشعارات القديمة (أكبر من 30 يوم)
 */
export function cleanupOldNotifications(): void {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return;
    const all: SmartNotification[] = JSON.parse(raw);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const updated = all.filter((n) => n.timestamp > cutoff);
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * دوال مساعدة لإنشاء إشعارات محددة
 */

export function notifyInventoryUpdate(params: {
  branch: string;
  sector: string;
  productCount: number;
  changedProducts: string[];
  isLowStock?: boolean;
}): void {
  addSmartNotification({
    type: 'inventory',
    title: params.isLowStock ? '⚠️ مخزون منخفض' : '📦 تحديث مخزون',
    message: `تم تحديث ${params.productCount} صنف في فرع ${params.branch} (${params.sector}). ${params.isLowStock ? 'بعض الأصناف وصلت للحد الأدنى.' : ''}`,
    priority: params.isLowStock ? 'high' : 'medium',
    scope: { branch: params.branch, sector: params.sector },
    metadata: { 
      branch: params.branch, 
      sector: params.sector, 
      productCount: params.productCount,
      changedProducts: params.changedProducts,
      isLowStock: params.isLowStock 
    },
    actionUrl: '/inventory',
    actionLabel: 'عرض المخزون',
  });
}

export function notifyTargetsUpdate(params: {
  branch: string;
  sector: string;
  month: number;
  repNames?: string[];
}): void {
  addSmartNotification({
    type: 'targets',
    title: '🎯 تحديث التارجت',
    message: `تم تحديث أهداف المبيعات لشهر ${params.month} في فرع ${params.branch} (${params.sector}).${params.repNames ? ` للمندوبين: ${params.repNames.join(', ')}` : ''}`,
    priority: 'medium',
    scope: { branch: params.branch, sector: params.sector },
    metadata: { branch: params.branch, sector: params.sector, month: params.month, repNames: params.repNames },
    actionUrl: '/targets',
    actionLabel: 'عرض التارجت',
  });
}

export function notifyCustomersUpdate(params: {
  branch: string;
  sector: string;
  count: number;
  action: 'added' | 'updated' | 'deleted';
}): void {
  const actionText = params.action === 'added' ? 'إضافة' : params.action === 'updated' ? 'تحديث' : 'حذف';
  addSmartNotification({
    type: 'customers',
    title: `👥 ${actionText} عملاء`,
    message: `تم ${actionText} ${params.count} عميل في فرع ${params.branch} (${params.sector}).`,
    priority: 'medium',
    scope: { branch: params.branch, sector: params.sector },
    metadata: { branch: params.branch, sector: params.sector, count: params.count, action: params.action },
    actionUrl: '/customers',
    actionLabel: 'عرض العملاء',
  });
}

export function notifyPromotionsUpdate(params: {
  title: string;
  description: string;
  sector?: 'home' | 'electrical' | 'both';
  branch?: string;
}): void {
  addSmartNotification({
    type: 'promotions',
    title: `🎁 ${params.title}`,
    message: params.description,
    priority: 'medium',
    scope: { sector: params.sector, branch: params.branch },
    metadata: { sector: params.sector, branch: params.branch },
    actionUrl: '/promotions',
    actionLabel: 'عرض العروض',
  });
}

export function notifyTaskAssigned(params: {
  repId: string;
  repName: string;
  branch: string;
  taskType: 'visit' | 'order' | 'collection';
  details: string;
}): void {
  addSmartNotification({
    type: 'task',
    title: '📋 مهمة جديدة',
    message: `${params.taskType === 'visit' ? 'زيارة' : params.taskType === 'order' ? 'طلب' : 'تحصيل'} لـ ${params.details} في ${params.branch}.`,
    priority: 'high',
    scope: { branch: params.branch, repId: params.repId },
    metadata: { ...params, taskType: params.taskType },
    actionUrl: '/visits',
    actionLabel: 'عرض المهام',
    deduplicate: false, // المهام ما تتدوبلش
  });
}

/**
 * فحص دوري للتحديثات (يتم استدعاؤه من AppContext)
 */
export async function checkForDataUpdates(lastCheckKey: string, checkFn: () => Promise<{
  inventory?: { branch: string; sector: string; productCount: number; changedProducts: string[]; isLowStock?: boolean }[];
  targets?: { branch: string; sector: string; month: number; repNames?: string[] }[];
  customers?: { branch: string; sector: string; count: number; action: 'added' | 'updated' | 'deleted' }[];
  promotions?: { title: string; description: string; sector?: 'home' | 'electrical' | 'both'; branch?: string }[];
}>): Promise<void> {
  try {
    const lastCheck = Number(localStorage.getItem(lastCheckKey) || 0);
    const now = Date.now();
    
    // نفحص كل 30 دقيقة على الأقل
    if (now - lastCheck < 30 * 60 * 1000) return;
    
    const updates = await checkFn();
    
    if (updates.inventory?.length) {
      updates.inventory.forEach((inv) => notifyInventoryUpdate(inv));
    }
    if (updates.targets?.length) {
      updates.targets.forEach((t) => notifyTargetsUpdate(t));
    }
    if (updates.customers?.length) {
      updates.customers.forEach((c) => notifyCustomersUpdate(c));
    }
    if (updates.promotions?.length) {
      updates.promotions.forEach((p) => notifyPromotionsUpdate(p));
    }
    
    localStorage.setItem(lastCheckKey, String(now));
    cleanupOldNotifications();
  } catch {
    // فشل صامت - ما نكسرش التطبيق
  }
}

export { NOTIF_STORAGE_KEY, NOTIF_SEEN_HASHES_KEY };