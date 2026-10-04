import type {
  CollectionForecastRecord,
  Customer,
  CustomerCommentKind,
  CustomerCommentRecord,
  ForecastMonthPlan,
  ForecastStatus,
  ForecastWeek,
  TargetRecord,
  User,
  UserRole,
} from '../types';
import { isArabicNameMatch, doesCustomerBelongToBranch, doesCustomerBelongToRep } from './arabicMatchingService';
import { calculateCustomerFinancials, classifyEligibilityColumn } from './customerFinancialService';
import { resolveCustomerDuesValue } from './customerDues';

/* ============================================================
   1) حساب الشهر والأسابيع
   ============================================================ */

export const AR_MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** '2026-09' */
export function monthKeyOf(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function parseMonthKey(monthKey: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(monthKey || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function toISODate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return toISODate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

export function daysBetween(fromISO: string, toISODateISO: string): number {
  const a = new Date(fromISO).getTime();
  const b = new Date(toISODateISO).getTime();
  return Math.round((b - a) / 86400000);
}

/** الشهر بيقسم على 4 أسابيع لو 28 يوم أو أقل، وإلا 5. */
export function suggestedWeekCount(year: number, month: number): number {
  return daysInMonth(year, month) > 28 ? 5 : 4;
}

/**
 * تقسيم مقترح للـ ISO: كل أسبوع 7 أيام وال之日نقسمو بالتساوي.
 * الإدارة تقدر تعدّل أي بداية/نهاية بعد كده.
 */
export function buildSuggestedWeeks(year: number, month: number): ForecastWeek[] {
  const last = daysInMonth(year, month);

  // Weeks are 7-day blocks, so day 1→7 is week 1 and day 8→14 is week 2.
  // A 30-day month ends with a short 3-day week 5; a 31-day month a 4-day one.
  // The admin can still move any boundary afterwards.
  const weeks: ForecastWeek[] = [];
  let cursor = 1;
  let index = 1;
  while (cursor <= last) {
    const end = Math.min(last, cursor + 6);
    weeks.push({
      index,
      start: toISODate(year, month, cursor),
      end: toISODate(year, month, end),
    });
    cursor = end + 1;
    index++;
  }
  return weeks;
}

export function buildDefaultMonthPlan(year: number, month: number, createdBy?: string): ForecastMonthPlan {
  return {
    id: monthKeyOf(year, month),
    year,
    month,
    monthStart: toISODate(year, month, 1),
    monthEnd: toISODate(year, month, daysInMonth(year, month)),
    weeks: buildSuggestedWeeks(year, month),
    isClosed: false,
    createdBy,
    createdAt: new Date().toISOString(),
  };
}

/** يوم reopen يقع في أنهي أسبوع (1..n)، أو null لو خارج الشهر. */
export function weekIndexForDate(plan: ForecastMonthPlan, isoDate: string): number | null {
  if (!plan) return null;
  const target = new Date(isoDate).getTime();
  if (isNaN(target)) return null;
  for (const w of plan.weeks) {
    const a = new Date(w.start).getTime();
    const b = new Date(w.end).getTime();
    if (target >= a && target <= b) return w.index;
  }
  return null;
}

export function todayISO(): string {
  const d = new Date();
  return toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** الشهر الحالي بصيغة المفتاح. */
export function currentMonthKey(): string {
  const d = new Date();
  return monthKeyOf(d.getFullYear(), d.getMonth() + 1);
}

export function formatMonthLabel(monthKey: string): string {
  const p = parseMonthKey(monthKey);
  if (!p) return monthKey;
  return `${AR_MONTH_NAMES[p.month - 1]} ${p.year}`;
}

export function formatWeekRange(week: ForecastWeek): string {
  const strip = (iso: string) => iso.split('-')[2] || '';
  return `${strip(week.start)} - ${strip(week.end)}`;
}

/** يتحقق إن تقسيم الأسابيع سليم: مرتب، متجاور، جواه الشهر. */
export function validateMonthPlan(plan: ForecastMonthPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!plan.weeks.length) errors.push('لازم أسبوع واحد على الأقل');
  const monthStart = new Date(plan.monthStart).getTime();
  const monthEnd = new Date(plan.monthEnd).getTime();
  if (isNaN(monthStart) || isNaN(monthEnd)) {
    errors.push('تواريخ الشهر غير صحيحة');
    return { valid: false, errors };
  }
  if (monthEnd < monthStart) errors.push('نهاية الشهر قبل بدايته');

  let previousEnd = 0;
  plan.weeks.forEach((w, i) => {
    const s = new Date(w.start).getTime();
    const e = new Date(w.end).getTime();
    if (isNaN(s) || isNaN(e)) {
      errors.push(`تواريخ الأسبوع ${w.index} غير صحيحة`);
      return;
    }
    if (e < s) {
      errors.push(`نهاية الأسبوع ${w.index} قبل بدايته`);
      return;
    }
    if (s < monthStart) errors.push(`الأسبوع ${w.index} بيبدأ قبل بداية الشهر`);
    if (e > monthEnd) errors.push(`الأسبوع ${w.index} بيعدّي نهاية الشهر`);
    if (i > 0 && s <= previousEnd) errors.push(`الأسبوع ${w.index} بيتقاطع مع اللي قبله أو مش متجاور`);
    if (daysBetween(w.start, w.end) > 10) errors.push(`الأسبوع ${w.index} طويل أوي (أكتر من 10 أيام)`);
    previousEnd = e;
  });

  if (plan.weeks.length && !errors.some((e) => e.includes('الأسبوع'))) {
    const firstStart = new Date(plan.weeks[0].start).getTime();
    const lastEnd = new Date(plan.weeks[plan.weeks.length - 1].end).getTime();
    if (firstStart > monthStart + 86400000) errors.push('في أيام في أول الشهر مش مغطاة');
    if (lastEnd < monthEnd - 86400000) errors.push('في أيام في آخر الشهر مش مغطاة');
  }

  return { valid: errors.length === 0, errors };
}

/* ============================================================
   2) الصلاحيات — نفس نظام الأدوار الموجود في التطبيق
   ============================================================ */

export function canManageForecasts(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'developer';
}

/** المشرف ومدير الفرع والإدارة كلهم بيعتمدوا. */
export function canApproveForecasts(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'developer' || user.role === 'supervisor' || user.role === 'branch_manager';
}

/** الإدارة لوحدها بتحدد تواريخ الأسابيع وتقفل الشهر. */
export function canEditMonthPlan(user: User | null): boolean {
  return canManageForecasts(user);
}

/**
 * هل المندوب ده تحت إشراف هذا المشرف؟
 *
 * لازم نلاقي سجل المستخدم للمندوب الأول. لو السجل ده عليه supervisorId، لازم
 * يبقى المشرف الحالي بالظبط — غير كده المشرف التاني في نفس الفرع هيقدر يعدّل
 * في أرقام مندوب زميله. لو السجل مفيهوش supervisorId، نرجع لفرع المشرف.
 */
function isRepUnderSupervisor(
  supervisor: User,
  allUsers: User[],
  repId: string,
  repName: string
): boolean {
  const repUser = allUsers.find(
    (u) => (repId && u.id === repId) || isArabicNameMatch(u.name, repName)
  );
  if (!repUser) return false;
  if (!repUser.supervisorId) return true; // غير مسنَد: rely on the branch check
  return repUser.supervisorId === supervisor.id || isArabicNameMatch(repUser.supervisorId, supervisor.id);
}

/**
 * مين يعدّل في سطر التوقع ده.
 * المندوب بيكتب أرقام نفسه بس، والمشرف ومدير الفرع يعدّلوا ويبنوا — كل واحد
 * في نطاقه (مندوبيه / فرعه) — والإدارة في أي مكان.
 */
export function canWriteOwnForecast(
  user: User | null,
  record: CollectionForecastRecord,
  allUsers: User[] = []
): boolean {
  if (!user) return false;
  if (canManageForecasts(user)) return true;
  if (user.role === 'sales_rep') return record.repId === user.id || isArabicNameMatch(record.repName, user.name);
  if (user.role === 'supervisor' || user.role === 'branch_manager') {
    return isSameScope(user, record.branchName, record.repId, record.repName, allUsers);
  }
  return false;
}

function isSameScope(
  user: User,
  branchName: string,
  repId: string,
  repName: string,
  allUsers: User[] = []
): boolean {
  if (user.role === 'branch_manager') return doesCustomerBelongToBranch({ branchName } as Customer, user.branchName);
  if (user.role === 'supervisor') {
    if (user.branchName && branchName && !isArabicNameMatch(branchName, user.branchName)) return false;
    // A supervisor also fills in their own row, the same way they do in Targets.
    if (repId === user.id) return true;
    return isRepUnderSupervisor(user, allUsers, repId, repName);
  }
  return repId === user.id;
}

/** مين يشوف مين. */
export function canSeeRepForecasts(
  user: User | null,
  allUsers: User[],
  branchName: string,
  repId: string,
  repName: string
): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'developer') return true;
  if (user.role === 'sales_rep') return repId === user.id || isArabicNameMatch(repName, user.name);
  if (user.role === 'branch_manager') return doesCustomerBelongToBranch({ branchName } as Customer, user.branchName);
  if (user.role === 'supervisor') {
    if (user.branchName && branchName && !isArabicNameMatch(branchName, user.branchName)) return false;
    if (repId === user.id) return true;
    return isRepUnderSupervisor(user, allUsers, repId, repName);
  }
  return false;
}

/** الأرقام المقفولة: بعد الاعتماد محدش يعدّل غير بطلب تعديل. */
export function isLockedForEditing(record: CollectionForecastRecord, user: User | null): boolean {
  if (!user) return true;
  if (canApproveForecasts(user)) return false;
  return record.status === 'approved';
}

/* ============================================================
   3) قراءة التوقعات
   ============================================================ */

export function filterForecastsForUser(
  records: CollectionForecastRecord[],
  user: User | null,
  allUsers: User[] = []
): CollectionForecastRecord[] {
  if (!user) return [];
  if (user.role === 'admin' || user.role === 'developer') return records;
  return records.filter((r) => canSeeRepForecasts(user, allUsers, r.branchName, r.repId, r.repName));
}

export function emptyForecastId(monthKey: string, weekIndex: number, customerId: string): string {
  return `fc_${monthKey}_w${weekIndex}_${customerId}`;
}

export function makeForecastRecord(
  monthKey: string,
  weekIndex: number,
  customer: Customer,
  repId: string,
  repName: string,
  existing?: CollectionForecastRecord
): CollectionForecastRecord {
  if (existing) return existing;
  return {
    id: emptyForecastId(monthKey, weekIndex, customer.id),
    monthKey,
    weekIndex,
    repId,
    repName,
    branchName: customer.branchName || '',
    customerId: customer.id,
    customerCode: customer.code || '',
    customerName: customer.name || '',
    collectionForecast: 0,
    salesForecast: 0,
    status: 'draft',
  };
}

/* ============================================================
   4) تجميع الأرقام
   ============================================================ */

export interface RepForecastRow {
  repId: string;
  repName: string;
  branchName: string;
  weekCollection: Record<number, number>;
  weekSales: Record<number, number>;
  totalCollection: number;
  totalSales: number;
  submittedWeeks: number;
  approvedWeeks: number;
  changeRequestedWeeks: number;
  customerCount: number;
}

export function aggregateByRep(
  records: CollectionForecastRecord[],
  weekCount: number
): RepForecastRow[] {
  const map = new Map<string, RepForecastRow>();

  records.forEach((r) => {
    const week = Math.floor(r.weekIndex);
    let row = map.get(r.repId);
    if (!row) {
      row = {
        repId: r.repId,
        repName: r.repName,
        branchName: r.branchName,
        weekCollection: {},
        weekSales: {},
        totalCollection: 0,
        totalSales: 0,
        submittedWeeks: 0,
        approvedWeeks: 0,
        changeRequestedWeeks: 0,
        customerCount: 0,
      };
      map.set(r.repId, row);
    }
    row.weekCollection[week] = (row.weekCollection[week] || 0) + Number(r.collectionForecast || 0);
    row.weekSales[week] = (row.weekSales[week] || 0) + Number(r.salesForecast || 0);
    row.totalCollection += Number(r.collectionForecast || 0);
    row.totalSales += Number(r.salesForecast || 0);
  });

  // A week's status is the weakest status any of its customers is in, so one
  // unapproved line keeps the whole week open for the supervisor.
  const weekStatus = new Map<string, Set<ForecastStatus>>();
  records.forEach((r) => {
    const key = `${r.repId}::${Math.floor(r.weekIndex)}`;
    const set = weekStatus.get(key) || new Set<ForecastStatus>();
    set.add(r.status);
    weekStatus.set(key, set);
  });

  const rows = Array.from(map.values());
  const customerKeys = new Set(records.map((r) => `${r.repId}::${r.customerId}`));
  rows.forEach((row) => {
    row.customerCount = Array.from(customerKeys).filter((k) => k.startsWith(`${row.repId}::`)).length;
    for (let w = 1; w <= weekCount; w++) {
      const statuses = weekStatus.get(`${row.repId}::${w}`);
      if (!statuses) continue;
      // Weakest status in the week wins: one draft line keeps the whole week open.
      if (statuses.has('change_requested')) row.changeRequestedWeeks++;
      else if (statuses.has('draft')) continue;
      else if (statuses.has('submitted')) row.submittedWeeks++;
      else if (statuses.has('approved')) row.approvedWeeks++;
    }
  });

  return rows.sort((a, b) => b.totalCollection - a.totalCollection);
}

export interface ForecastProgressRow {
  repId: string;
  repName: string;
  branchName: string;
  forecastCollection: number;
  forecastSales: number;
  targetCollection: number;
  targetSales: number;
  actualCollection: number;
  actualSales: number;
  collectionCoverage: number;   // المتوقع ÷ الهدف  %
  collectionVsTarget: number;   // فائض / عجز
  status: 'ahead' | 'on_track' | 'behind' | 'no_target';
}

export function buildProgress(
  forecasts: CollectionForecastRecord[],
  targets: TargetRecord[],
  weekCount: number
): ForecastProgressRow[] {
  const monthForecasts = forecasts;
  const rows = aggregateByRep(monthForecasts, weekCount);
  const targetByRep = new Map<string, TargetRecord>();
  targets.forEach((t) => {
    const prev = targetByRep.get(t.repName);
    if (!prev) targetByRep.set(t.repName, t);
  });

  return rows.map((r) => {
    const t = targetByRep.get(r.repName);
    const targetCollection = Number(t?.collectionTarget || 0);
    const targetSales = Number(t?.salesTarget || 0);
    const coverage = targetCollection > 0 ? Math.round((r.totalCollection / targetCollection) * 100) : 0;
    const diff = r.totalCollection - targetCollection;
    const status: ForecastProgressRow['status'] =
      targetCollection <= 0 ? 'no_target' : coverage >= 100 ? 'ahead' : coverage >= 80 ? 'on_track' : 'behind';
    return {
      repId: r.repId,
      repName: r.repName,
      branchName: r.branchName,
      forecastCollection: r.totalCollection,
      forecastSales: r.totalSales,
      targetCollection,
      targetSales,
      actualCollection: Number(t?.collectionAchieved || 0),
      actualSales: Number(t?.salesAchieved || 0),
      collectionCoverage: coverage,
      collectionVsTarget: diff,
      status,
    };
  });
}

/* ============================================================
   5) التنبيهات
   ============================================================ */

export interface ForecastAlert {
  id: string;
  severity: 'high' | 'medium' | 'low';
  kind: 'not_submitted' | 'change_requested' | 'behind_target' | 'customer_return' | 'customer_defaulted' | 'no_comment' | 'over_limit';
  title: string;
  detail: string;
  branchName: string;
  repId: string;
  customerCode?: string;
}

/** تنبيهات المتابعة — للكل، ومفلترة بالصلاحية. */
export function buildAlerts(input: {
  plan: ForecastMonthPlan | null;
  forecasts: CollectionForecastRecord[];
  progress: ForecastProgressRow[];
  comments: CustomerCommentRecord[];
  customers: Customer[];
  returnsByCustomerCode?: Map<string, { count: number; amount: number; lastDate: string }>;
  today?: string;
}): ForecastAlert[] {
  const { plan, forecasts, progress, comments, customers, returnsByCustomerCode, today } = input;
  if (!plan) return [];
  const now = today || todayISO();
  const currentWeek = weekIndexForDate(plan, now);
  const alerts: ForecastAlert[] = [];
  const weekCount = plan.weeks.length;

  progress.forEach((p) => {
    if (currentWeek && p.status === 'behind') {
      alerts.push({
        id: `behind_${p.repId}`,
        severity: 'high',
        kind: 'behind_target',
        title: `${p.repName} متأخر عن التارجت`,
        detail: `المتوقع ${Math.round(p.forecastCollection).toLocaleString()} ج.م مقابل هدف ${Math.round(p.targetCollection).toLocaleString()} ج.م (${p.collectionCoverage}%)`,
        branchName: p.branchName,
        repId: p.repId,
      });
    }
  });

  const weekStatuses = new Map<string, Set<ForecastStatus>>();
  forecasts.forEach((f) => {
    const key = `${f.repId}::${f.weekIndex}`;
    const set = weekStatuses.get(key) || new Set<ForecastStatus>();
    set.add(f.status);
    weekStatuses.set(key, set);
  });

  const repNames = new Map(forecasts.map((f) => [f.repId, { repName: f.repName, branchName: f.branchName }]));
  const eligibleWeeks = plan.weeks.filter((w) => new Date(w.start).getTime() <= new Date(now).getTime() + 6 * 86400000);
  eligibleWeeks.forEach((w) => {
    repNames.forEach((info, repId) => {
      const statuses = weekStatuses.get(`${repId}::${w.index}`);
      if (!statuses || statuses.size === 0) {
        alerts.push({
          id: `miss_${repId}_${w.index}`,
          severity: 'high',
          kind: 'not_submitted',
          title: `${info.repName} لم يكتب توقع الأسبوع ${w.index}`,
          detail: `الأسبوع ${w.index} (${formatWeekRange(w)}) — التوقع مطلوب قبل بداية الأسبوع`,
          branchName: info.branchName,
          repId,
        });
      } else if (statuses.has('change_requested')) {
        alerts.push({
          id: `chg_${repId}_${w.index}`,
          severity: 'medium',
          kind: 'change_requested',
          title: `${info.repName} مطلوب منه تعديل توقع الأسبوع ${w.index}`,
          detail: `المشرف رجّع التوقع — ${formatWeekRange(w)}`,
          branchName: info.branchName,
          repId,
        });
      } else if (!statuses.has('approved') && !statuses.has('submitted')) {
        alerts.push({
          id: `draft_${repId}_${w.index}`,
          severity: 'low',
          kind: 'not_submitted',
          title: `${info.repName} لسه بيكتب توقع الأسبوع ${w.index}`,
          detail: `الأسبوع ${w.index} (${formatWeekRange(w)}) — لسه مسودة`,
          branchName: info.branchName,
          repId,
        });
      }
    });
  });

  const commentedCodes = new Set(comments.map((c) => c.customerCode));
  customers.forEach((c) => {
    const fin = calculateCustomerFinancials(c, 'ALL');
    const ret = returnsByCustomerCode?.get(c.code || '');
    if (ret && ret.count > 0) {
      alerts.push({
        id: `ret_${c.code || c.id}`,
        severity: 'high',
        kind: 'customer_return',
        title: `${c.name} عنده مرتجع`,
        detail: `${ret.count} إذن مرتجع بإجمالي ${Math.round(ret.amount).toLocaleString()} ج.م — آخر مرة ${ret.lastDate}${commentedCodes.has(c.code || '') ? '' : ' — مفيش كومنت مسجل'}`,
        branchName: c.branchName || '',
        repId: '',
        customerCode: c.code,
      });
    }
    const overdue = resolveCustomerDuesValue(c);
    if (overdue > 0 && !fin.isEligible && !commentedCodes.has(c.code || '')) {
      alerts.push({
        id: `def_${c.code || c.id}`,
        severity: 'medium',
        kind: 'customer_defaulted',
        title: `${c.name} متأخر ومفيش عليه كومنت`,
        detail: `مستحقات ${Math.round(overdue).toLocaleString()} ج.م — تصنيفه «${fin.eligibilityStatusLabel}»`,
        branchName: c.branchName || '',
        repId: '',
        customerCode: c.code,
      });
    }
    if (fin.isOverLimit && !commentedCodes.has(c.code || '')) {
      alerts.push({
        id: `lim_${c.code || c.id}`,
        severity: 'medium',
        kind: 'over_limit',
        title: `${c.name} تعدّى الحد الائتماني`,
        detail: `المديونية ${Math.round(fin.balance).toLocaleString()} ج.م والحد ${Math.round(fin.creditLimit).toLocaleString()} ج.م`,
        branchName: c.branchName || '',
        repId: '',
        customerCode: c.code,
      });
    }
  });

  const order: Record<ForecastAlert['severity'], number> = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ============================================================
   6) الكومنتات
   ============================================================ */

export const COMMENT_KIND_LABELS: Record<CustomerCommentKind, string> = {
  defaulted: 'عميل متعثر',
  return: 'مرتجع',
  note: 'ملاحظة',
};

export const COMMENT_KIND_COLORS: Record<CustomerCommentKind, string> = {
  defaulted: 'bg-rose-100 text-rose-800 border-rose-300',
  return: 'bg-red-100 text-red-900 border-red-400',
  note: 'bg-slate-100 text-slate-700 border-slate-300',
};

export function commentId(customerCode: string): string {
  return `cc_${customerCode || Date.now()}`;
}

export function canEditComment(user: User | null, comment: CustomerCommentRecord): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'developer') return true;
  if (user.role === 'sales_rep') return comment.repName === user.name;
  if (user.role === 'branch_manager') return isArabicNameMatch(comment.branchName, user.branchName || '');
  if (user.role === 'supervisor') return isArabicNameMatch(comment.branchName, user.branchName || '');
  return false;
}

/* ============================================================
   7) شارة العميل في صفحة التوقعات
   ============================================================ */

export type CustomerBadgeTone = 'normal' | 'cheque' | 'returned';

export interface CustomerBadgeResult {
  tone: CustomerBadgeTone;
  paymentLabel: string;
  isCheque: boolean;
  hasReturn: boolean;
  eligibilityLabel: string;
  isDealt: boolean;
  lastVisitDate?: string;
}

/**
 * شارة لون العميل: شيكات = أصفر، مرتجع = أحمر.
 * طرق الدفع بتتقري من الضمان لأن طريقة الدفع الشيت نص حر ومفيهوش تطبيع ثابت.
 */
export function buildCustomerBadge(
  customer: Customer,
  hasReturn: boolean,
  lastVisitDate?: string
): CustomerBadgeResult {
  const guaranteeAmount = Number(customer.guaranteeAmount || 0);
  const guaranteeText = (customer.guaranteeDocs || '').trim();
  const hasCheque =
    guaranteeAmount > 0 ||
    (!!guaranteeText && !/^(لا يوجد|بدون|0|-|مش ماضي)/.test(guaranteeText) && /شيك|كمبيال|ضمان|رهن|إيصال|ايصال/.test(guaranteeText));

  const terms = (customer.paymentTerms || '').toLowerCase();
  const termsCheque = terms.includes('شيك');
  const isCheque = hasCheque || termsCheque;

  const paymentLabel = isCheque ? 'شيكات' : 'نقدي';

  const fin = calculateCustomerFinancials(customer, 'ALL');
  const eligibilityLabel = fin.sheetClassificationLabel || (fin.isEligible ? 'قابل للتعامل' : 'غير قابل');

  return {
    tone: hasReturn ? 'returned' : isCheque ? 'cheque' : 'normal',
    paymentLabel,
    isCheque,
    hasReturn,
    eligibilityLabel,
    isDealt: fin.isDealtCustomer,
    lastVisitDate: lastVisitDate || customer.lastVisitDate,
  };
}

/** تقرير التصدير: كل عميل مع تقديره وتصنيفه وأرقامه. */
export function buildForecastExportRows(input: {
  forecasts: CollectionForecastRecord[];
  comments: CustomerCommentRecord[];
  customers: Customer[];
  returnsByCustomerCode?: Map<string, { count: number; amount: number; lastDate: string }>;
  lastVisitByCustomerId?: Map<string, string>;
}) {
  const { forecasts, comments, customers, returnsByCustomerCode, lastVisitByCustomerId } = input;
  const commentByCode = new Map(comments.map((c) => [c.customerCode, c]));

  return customers.map((c) => {
    const fin = calculateCustomerFinancials(c, 'ALL');
    const badge = buildCustomerBadge(c, !!returnsByCustomerCode?.get(c.code || '')?.count, lastVisitByCustomerId?.get(c.id));
    const mine = forecasts.filter((f) => f.customerId === c.id);
    const comment = commentByCode.get(c.code || '');
    const ret = returnsByCustomerCode?.get(c.code || '');

    return {
      'كود العميل': c.code || '---',
      'اسم العميل': c.name || '',
      'الفرع': c.branchName || '',
      'المندوب': c.salesRepName || c.repName || '',
      'متعامل': badge.isDealt ? 'نعم' : 'لا',
      'تصنيف القابلية': badge.eligibilityLabel,
      'قابل للتعامل': fin.isEligible ? 'نعم' : 'لا',
      'طريقة الدفع': badge.paymentLabel,
      'مرتجع': badge.hasReturn ? 'نعم' : 'لا',
      'عدد المرتجعات': ret?.count || 0,
      'إجمالي المرتجعات (ج.م)': ret?.amount || 0,
      'آخر مرتجع': ret?.lastDate || '---',
      'المديونية (ج.م)': fin.balance,
      'إجمالي المستحقات (ج.م)': fin.overdue,
      'الحد الائتماني (ج.م)': fin.creditLimit,
      'تجاوز الحد': fin.isOverLimit ? 'نعم' : 'لا',
      'متوقع التحصيل الشهري (ج.م)': mine.reduce((s, f) => s + (Number(f.collectionForecast) || 0), 0),
      'متوقع البيع الشهري (ج.م)': mine.reduce((s, f) => s + (Number(f.salesForecast) || 0), 0),
      'عدد أسابيع متوقع فيها': mine.filter((f) => Number(f.collectionForecast) > 0).length,
      'آخر زيارة': badge.lastVisitDate || '---',
      'الكومنت': comment?.body || '',
      'نوع الكومنت': comment ? COMMENT_KIND_LABELS[comment.kind] : '---',
      'كاتب الكومنت': comment?.authorName || '---',
    };
  });
}