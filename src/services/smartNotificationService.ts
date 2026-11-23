import { currentUserRef } from './currentUserRef';
import type { UserRole, SectorType } from '../types';

/**
 * Smart Notification Service
 * 
 * Per-role notification mapping:
 * - admin: everything
 * - branch_manager: team performance, targets, inventory alerts, customer updates, returns
 * - supervisor: team visits, targets, inventory alerts
 * - sales_rep: own tasks/visits, own customers, own targets
 * - warehouse_keeper: inventory/low-stock only, returns
 * - legal_advisor: customer/contract updates, legal docs, promotions
 * - technical_support: everything (cross-sector access via permissions)
 * - developer: everything
 * 
 * Sector isolation: NO role sees other sector's data without explicit permission
 * from technical_support/developer via SectorPermissionService.
 */

export type NotificationType = 
  | 'inventory'    // تحديث المخزون
  | 'targets'      // تحديث التارجت
  | 'customers'    // تحديث قاعدة العملاء
  | 'promotions'   // عروض/إعلانات جديدة
  | 'system'       // نظام
  | 'task'         // مهام/زيارات
  | 'returns'      // مرتجعات
  | 'legal';       // شؤون قانونية/عقود

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
 * Map: Role -> NotificationTypes they receive
 * هذا يضمن كل دور يشوف بس الإشعارات اللي تهمه
 */
const ROLE_NOTIFICATION_MAP: Record<UserRole, NotificationType[]> = {
  admin: ['inventory', 'targets', 'customers', 'promotions', 'system', 'task', 'returns', 'legal'],
  developer: ['inventory', 'targets', 'customers', 'promotions', 'system', 'task', 'returns', 'legal'],
  technical_support: ['inventory', 'targets', 'customers', 'promotions', 'system', 'task', 'returns', 'legal'],
  branch_manager: ['inventory', 'targets', 'customers', 'promotions', 'task', 'returns'],
  supervisor: ['targets', 'task', 'inventory'],
  sales_rep: ['task', 'customers', 'targets'],
  warehouse_keeper: ['inventory', 'returns'],
  legal_advisor: ['customers', 'legal', 'promotions'],
};

/**
 * يتحقق هل الدور يستقبل هذا النوع من الإشعارات
 */
function doesRoleReceiveType(role: UserRole, type: NotificationType): boolean {
  const allowed = ROLE_NOTIFICATION_MAP[role] || [];
  return allowed.includes(type);
}

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
  const parts: string[] = [type];
  if (scope?.branch) parts.push(`branch:${scope.branch}`);
  if (scope?.sector) parts.push(`sector:${scope.sector}`);
  if (scope?.repId) parts.push(`rep:${scope.repId}`);
  return parts.join('|');
}

/**
 * فحص صارم لعزل القطاع - لا دور يشوف قطاع تاني إلا بصلاحية صريحة
 * يستخدم SectorPermissionService لضمان الاتساق
 */
function canUserSeeSector(user: { role: UserRole; sector?: SectorType; branchName?: string }, notifSector?: string): boolean {
  // الإدارة والدعم الفني والمطور: يشوفوا كل القطاعات
  if (user.role === 'admin' || user.role === 'developer' || user.role === 'technical_support') {
    return true;
  }
  
  // المستشار القانوني: ممكن يشوف القطاعين لو في عقود
  if (user.role === 'legal_advisor') {
    return true; // بيتم فلترة أدق في shouldNotifyUser
  }
  
  // أمين المخزن: يشوف القطاع اللي تبعه (مخزنه)
  if (user.role === 'warehouse_keeper') {
    if (!notifSector || notifSector === 'both' || notifSector === 'all') return true;
    return user.sector === notifSector || user.sector === 'both' || user.sector === 'all';
  }
  
  // باقي الأدوار: قطاعهم بس
  if (!notifSector || notifSector === 'both' || notifSector === 'all') return true;
  return user.sector === notifSector || user.sector === 'both' || user.sector === 'all';
}

/**
 * يتحقق هل المستخدم يرى هذا الإشعار (فلترة دور + قطاع + فرع)
 */
function shouldNotifyUser(notif: SmartNotification): boolean {
  const user = currentUserRef.current;
  if (!user) return false;

  // 1. فلترة حسب نوع الإشعار والدور
  if (!doesRoleReceiveType(user.role, notif.type)) return false;

  // 2. فلترة صارمة حسب القطاع (عزل قطاعات)
  const notifSector = notif.metadata?.sector;
  if (!canUserSeeSector(user, notifSector)) return false;

  // 3. فلترة حسب الفرع (للمندوبين والمشرفين ومديري الفروع)
  if (user.role === 'sales_rep') {
    // المندوب: فرعهم فقط + مهامهم فقط
    if (notif.metadata?.branch && notif.metadata.branch !== user.branchName) return false;
    if (notif.type === 'task' && notif.metadata?.repId && notif.metadata.repId !== user.id) return false;
    return true;
  }

  if (user.role === 'supervisor' || user.role === 'branch_manager') {
    // المشرف/مدير الفرع: فرعهم فقط
    if (notif.metadata?.branch && notif.metadata.branch !== user.branchName) return false;
    return true;
  }

  if (user.role === 'warehouse_keeper') {
    // أمين المخزن: مخزنه/فرعه فقط
    if (notif.metadata?.branch && notif.metadata.branch !== user.branchName) return false;
    return true;
  }

  if (user.role === 'legal_advisor') {
    // المستشار القانوني: ممكن يشوف عقود/عملاء عبر القطاعات لكن بس لما يكون في صلاحية
    // الفلترة الدقيقة بتتم وقت إنشاء الإشعار (في notifyLegalUpdate)
    return true;
  }

  // admin, developer, technical_support: كل حاجة
  return true;
}

/**
 * يضيف إشعار ذكي (مع deduplication + فلترة دور/قطاع)
 */
export function addSmartNotification(notif: Omit<SmartNotification, 'id' | 'timestamp' | 'read' | 'groupKey' | 'changeHash'> & {
  scope?: { branch?: string; sector?: string; repId?: string };
  deduplicate?: boolean; // افتراضي true
}): SmartNotification | null {
  try {
    const user = currentUserRef.current;
    if (!user) return null;

    // فلترة مبكرة: لو الدور ما يستقبلش النوع ده، ما نكملمش
    if (!doesRoleReceiveType(user.role, notif.type)) return null;

    // بناء الإشعار المؤقت للفلترة
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
        existing.timestamp = now;
        saveNotifications(notifications);
        return null;
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
 * يجلب الإشعارات للمستخدم الحالي (مفلترة حسب الدور + القطاع)
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
 * دوال مساعدة لإنشاء إشعارات محددة لكل دور
 */

// 📦 مخزون - للـ admin, branch_manager, supervisor, warehouse_keeper, technical_support, developer
export function notifyInventoryUpdate(params: {
  branch: string;
  sector: SectorType;
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

// 🎯 تارجت - للـ admin, branch_manager, supervisor, sales_rep, technical_support, developer
export function notifyTargetsUpdate(params: {
  branch: string;
  sector: SectorType;
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

// 👥 عملاء - للـ admin, branch_manager, sales_rep, legal_advisor, technical_support, developer
export function notifyCustomersUpdate(params: {
  branch: string;
  sector: SectorType;
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

// 🎁 عروض - للـ admin, branch_manager, legal_advisor, technical_support, developer
export function notifyPromotionsUpdate(params: {
  title: string;
  description: string;
  sector?: SectorType;
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

// 📋 مهام - للـ admin, branch_manager, supervisor, sales_rep, technical_support, developer
export function notifyTaskAssigned(params: {
  repId: string;
  repName: string;
  branch: string;
  sector: SectorType;
  taskType: 'visit' | 'order' | 'collection';
  details: string;
}): void {
  addSmartNotification({
    type: 'task',
    title: '📋 مهمة جديدة',
    message: `${params.taskType === 'visit' ? 'زيارة' : params.taskType === 'order' ? 'طلب' : 'تحصيل'} لـ ${params.details} في ${params.branch}.`,
    priority: 'high',
    scope: { branch: params.branch, sector: params.sector, repId: params.repId },
    metadata: { ...params, taskType: params.taskType },
    actionUrl: '/visits',
    actionLabel: 'عرض المهام',
    deduplicate: false, // المهام ما تتدوبلش
  });
}

// 🔄 مرتجعات - للـ admin, branch_manager, warehouse_keeper, technical_support, developer
export function notifyReturnsUpdate(params: {
  branch: string;
  sector: SectorType;
  count: number;
  action: 'created' | 'approved' | 'rejected' | 'received';
}): void {
  const actionText = {
    created: 'إنشاء',
    approved: 'اعتماد',
    rejected: 'رفض',
    received: 'استلام'
  }[params.action];
  
  addSmartNotification({
    type: 'returns',
    title: `🔄 مرتجعات - ${actionText}`,
    message: `تم ${actionText} ${params.count} طلب مرتجع في فرع ${params.branch} (${params.sector}).`,
    priority: 'medium',
    scope: { branch: params.branch, sector: params.sector },
    metadata: { branch: params.branch, sector: params.sector, count: params.count, action: params.action },
    actionUrl: '/returns',
    actionLabel: 'عرض المرتجعات',
  });
}

// ⚖️ شؤون قانونية/عقود - للـ admin, legal_advisor, technical_support, developer
export function notifyLegalUpdate(params: {
  title: string;
  description: string;
  customerName?: string;
  branch?: string;
  sector?: SectorType;
  contractType?: 'contract' | 'agreement' | 'dispute' | 'compliance';
}): void {
  // للمستشار القانوني: نفلتر حسب القطاع اللي معه صلاحية
  const user = currentUserRef.current;
  if (user?.role === 'legal_advisor' && params.sector) {
    const allowed = canUserSeeSector(user, params.sector);
    if (!allowed) return; // ما ننشئش الإشعار أصلاً
  }

  addSmartNotification({
    type: 'legal',
    title: `⚖️ ${params.title}`,
    message: params.description + (params.customerName ? ` — العميل: ${params.customerName}` : ''),
    priority: 'high',
    scope: { branch: params.branch, sector: params.sector },
    metadata: { 
      branch: params.branch, 
      sector: params.sector, 
      customerName: params.customerName,
      contractType: params.contractType 
    },
    actionUrl: '/legal_advisor',
    actionLabel: 'عرض الشؤون القانونية',
  });
}

/**
 * فحص دوري للتحديثات (يتم استدعاؤه من AppContext كل 30 دقيقة)
 * كل دور بيستدعي الفحوصات اللي تهمه بس — صفر تحميل زائد
 */
export async function checkForDataUpdates(lastCheckKey: string): Promise<void> {
  try {
    const lastCheck = Number(localStorage.getItem(lastCheckKey) || 0);
    const now = Date.now();
    
    // نفحص كل 30 دقيقة على الأقل
    if (now - lastCheck < 30 * 60 * 1000) return;
    
    const user = currentUserRef.current;
    if (!user || !user.role) return;

    // لكل دور: نفحص بس البيانات اللي تهمه — لا استعلامات زائدة
    const roleChecks = getRoleSpecificChecks(user);
    await roleChecks();
    
    localStorage.setItem(lastCheckKey, String(now));
    cleanupOldNotifications();
  } catch {
    // فشل صامت - ما نكسرش التطبيق
  }
}

/**
 * يحدد الفحوصات المطلوبة لكل دور — صفر بيانات غير ضرورية
 */
function getRoleSpecificChecks(user: { role: UserRole; branchName?: string; sector?: SectorType; id?: string }): () => Promise<void> {
  const branch = user.branchName || '';
  const sector = user.sector || 'home';
  const repId = user.id || '';

  // المسار المشترك: دالة ترجع البروميسز المطلوبة
  return async () => {
    const promises: Promise<void>[] = [];

    // 📦 مخزون: للأدوار اللي مهتمة بالمخزون
    if (doesRoleReceiveType(user.role, 'inventory')) {
      promises.push(checkInventory(branch, sector));
    }

    // 🎯 تارجت: للأدوار اللي مهتمة بالتارجت
    if (doesRoleReceiveType(user.role, 'targets')) {
      promises.push(checkTargets(branch, sector));
    }

    // 👥 عملاء: للأدوار اللي مهتمة بالعملاء
    if (doesRoleReceiveType(user.role, 'customers')) {
      promises.push(checkCustomers(branch, sector));
    }

    // 🎁 عروض: للأدوار اللي مهتمة بالعروض
    if (doesRoleReceiveType(user.role, 'promotions')) {
      promises.push(checkPromotions());
    }

    // 📋 مهام: للمندوبين والمشرفين ومديري الفروع
    if (doesRoleReceiveType(user.role, 'task')) {
      promises.push(checkTasks(repId, branch, sector));
    }

    // 🔄 مرتجعات: لأمين المخزن ومدير الفرع
    if (doesRoleReceiveType(user.role, 'returns')) {
      promises.push(checkReturns(branch, sector));
    }

    // ⚖️ قانونية: للمستشار القانوني
    if (doesRoleReceiveType(user.role, 'legal')) {
      promises.push(checkLegal(branch, sector));
    }

    await Promise.allSettled(promises);
  };
}

// Import supabase lazily to avoid circular dependency
let supabase: any = null;
async function getSupabase() {
  if (!supabase) {
    const { supabase: s } = await import('../services/supabaseService');
    supabase = s;
  }
  return supabase;
}

// Internal check functions using lazy-loaded supabase
async function checkInventory(branch: string, sector: string): Promise<void> {
  try {
    const sb = await getSupabase();
    let q = sb
      .from('products')
      .select('id, branch_name, sector, branch_stock_actual')
      .eq('branch_name', branch)
      .lt('branch_stock_actual', 10);
    if (sector === 'home' || sector === 'electrical') {
      q = q.or(`sector.in.(${sector},both,all),sector.is.null`);
    }
    const { data } = await q.limit(100);
    if (data && data.length > 0) {
      notifyInventoryUpdate({
        branch,
        sector: sector as any,
        productCount: data.length,
        changedProducts: data.map((p: any) => String(p.id)),
        isLowStock: true,
      });
    }
  } catch {}
}

async function checkTargets(branch: string, sector: string): Promise<void> {
  try {
    const sb = await getSupabase();
    const monthKey = new Date().toISOString().slice(0, 7);
    let q = sb
      .from('targets')
      .select('id, branch, rep_name, month_key, sector')
      .eq('month_key', monthKey)
      .eq('branch', branch);
    if (sector === 'home' || sector === 'electrical') {
      q = q.or(`sector.in.(${sector},both,all),sector.is.null`);
    }
    const { data } = await q.limit(200);
    if (data && data.length > 0) {
      const repNames: string[] = Array.from(
        new Set<string>(
          data
            .map((t: any) => t.rep_name)
            .filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0)
        )
      );
      notifyTargetsUpdate({
        branch,
        sector: sector as any,
        month: parseInt(monthKey.split('-')[1], 10),
        repNames,
      });
    }
  } catch {}
}

async function checkCustomers(branch: string, sector: string): Promise<void> {
  try {
    const sb = await getSupabase();
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    let q = sb
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('branch_name', branch)
      .gte('updated_at', since);
    if (sector === 'home' || sector === 'electrical') {
      q = q.or(`sector.in.(${sector},both,all),sector.is.null`);
    }
    const { count } = await q;
    if (count && count > 0) {
      notifyCustomersUpdate({
        branch,
        sector: sector as any,
        count,
        action: 'updated',
      });
    }
  } catch {}
}

async function checkPromotions(): Promise<void> {
  try {
    const sb = await getSupabase();
    const { data } = await sb
      .from('orders')
      .select('items, updated_at')
      .eq('id', 'dream_dist_promotions_manifest')
      .limit(1);
    if (data && data[0]?.items) {
      const stamp = data[0].items as any;
      const lastSeen = localStorage.getItem('dream_dist_promotions_stamp_v1');
      if (!lastSeen || lastSeen !== JSON.stringify({ updatedAt: stamp.updatedAt, total: stamp.total })) {
        notifyPromotionsUpdate({
          title: 'عروض جديدة',
          description: 'تم تحديث العروض والإعلانات من الإدارة.',
        });
        localStorage.setItem('dream_dist_promotions_stamp_v1', JSON.stringify({ updatedAt: stamp.updatedAt, total: stamp.total }));
      }
    }
  } catch {}
}

async function checkTasks(repId: string, branch: string, sector: string): Promise<void> {
  // المهام بتتولد من assignTask مش من polling
  return;
}

async function checkReturns(branch: string, sector: string): Promise<void> {
  try {
    const sb = await getSupabase();
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count } = await sb
      .from('returns')
      .select('id', { count: 'exact', head: true })
      .eq('branch_name', branch)
      .gte('updated_at', since);
    if (count && count > 0) {
      notifyReturnsUpdate({
        branch,
        sector: sector as any,
        count,
        action: 'created',
      });
    }
  } catch {}
}

async function checkLegal(branch: string, sector: string): Promise<void> {
  // قانونية بتتولد من events مش polling
  return;
}

export { NOTIF_STORAGE_KEY, NOTIF_SEEN_HASHES_KEY };