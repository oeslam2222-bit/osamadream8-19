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

/**
 * تاريخ من millisecond بتوقيت UTC.
 *
 * لحظة الوقت (Date.now) بيبدأ اليوم بيها، فلو حوّلناها بنفس طريقة Date
 * (getFullYear/getDate) timezone المتصفح يزيح النتيجة يوم كامل. عشان كده
 * التقسيماتCalc بتناكل الصفر UTC على YYYY-MM-DD مباشرة.
 */
function toISODateFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
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

/**
 * حدود مرونة تقسيم الشهر.
 *
 * الشهر مش مقسوم على 4 أو 5 أسابيع إجباري — الإدارة بتختار التقسيم: أسبوع واحد
 * يغطي الشهر كله، أو اتنين (نص شهر ونص)، أو 4/5، أو 6/7/8، وبعدين تقدر تزحزح
 * بداية ونهاية أي أسبوع يدوي. الحد الأعلى 8 لأنه آخر حد مفيد للتوقع الأسبوعي
 * (شهر 31 يوم ÷ 8 ≈ 4 أيام للفترة)، وأكتر من كده الرقم الأسبوعي بيبقى
 * مضلّل أكتر ما هو مفيد. الحد الأدنى أسبوع واحد — معناه إن التوقع الشهري
 * المستقل لوحده، وده مسموح ومقصود.
 */
export const MIN_WEEKS_PER_MONTH = 1;
export const MAX_WEEKS_PER_MONTH = 8;

/**
 * صفر فترات = مفيش تقسيم خالص.
 *
 * الشهر مش ملزوم يتقسم أصلاً: الإدارة ممكن تسيب الشهر على التوقع الشهري
 * المستقل لوحده، والصفحة بتفتح عادي بعمود شهري بس ومن غير أعمدة أسابيع.
 */
export const NO_WEEK_DIVISION = 0;

/** بيقرّب أي رقم arbitrary لده جوه المدى المسموح به. */
export function clampWeekCount(count: number): number {
  const rounded = Math.round(Number(count) || 0);
  if (rounded < MIN_WEEKS_PER_MONTH) return MIN_WEEKS_PER_MONTH;
  if (rounded > MAX_WEEKS_PER_MONTH) return MAX_WEEKS_PER_MONTH;
  return rounded;
}

/**
 * اقتراح مرن لتقسيم مدى على كتل 7 أيام.
 *
 * شيلنا القاعدة القديمة الثابتة (28 يوم ⇒ 4، وأكتر ⇒ 5) لأنها كانت بتفترض
 * إن الشهر 4/5 بس. دلوقتي بيعتمد على طول المدى نفسه: ceil(days / 7) مقصوص
 * بين MIN وMAX. يعني شهر 31 يوم ⇒ 5، وشهر 28 ⇒ 4، ومدى 10 أيام ⇒ 2.
 */
export function suggestedWeekCountForSpan(totalDays: number): number {
  if (!totalDays || totalDays <= 0) return MIN_WEEKS_PER_MONTH;
  return clampWeekCount(Math.ceil(totalDays / 7));
}

/** نفس الاقتراح بس من شهر تقويمي. */
export function suggestedWeekCount(year: number, month: number): number {
  return suggestedWeekCountForSpan(daysInMonth(year, month));
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

/** يحسب عدد الأيام في مدى تاريخي شامل الطرفين. */
export function spanDays(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * يوزّع مدى تاريخي على عدد أسابيع معيّن بالتساوي، من غير ما يمسّ حدود المدى.
 *
 * بنحسب من المدى اللي الأدمن حدده فعلاً مش من تقويم الشهر الطبيعي، لأن ممكن
 * يكون عمل الشهر من يوم 25 للشهر اللي بعده — ولو رجعنا للأيام التقويمية هنا
 * هنمحي المدة اللي هو حددها. باقي القسمة بيتوزّع على أول الأسابيع.
 *
 * العدد بيتقرّب لده جوه [MIN_WEEKS_PER_MONTH, MAX_WEEKS_PER_MONTH] قبل الحساب،
 * عشان رقم غلط في الواجهة (0 أو سالب أو 50) ما يبقاش سبب رفض صامت.
 */
export function buildEvenWeeks(start: string, end: string, count: number): ForecastWeek[] {
  const total = spanDays(start, end);
  if (total <= 0) return [];

  const safe = clampWeekCount(count);
  if (total < safe) return [];

  const base = Math.floor(total / safe);
  const extra = total % safe;
  const weeks: ForecastWeek[] = [];
  let cursorMs = new Date(`${start}T00:00:00`).getTime();

  for (let i = 1; i <= safe; i++) {
    const len = base + (i <= extra ? 1 : 0);
    const endMs = cursorMs + (len - 1) * 86400000;
    weeks.push({
      index: i,
      start: toISODateFromMs(cursorMs),
      end: toISODateFromMs(endMs),
    });
    cursorMs = endMs + 86400000;
  }
  return weeks;
}

/**
 * تقسيم كتل 7 أيام داخل مدى محدد — نفس فكرة buildSuggestedWeeks بس على المدى
 * اللي الأدمن حدده بدل الشهر التقويمي.
 */
export function buildBlockWeeks(start: string, end: string, blockDays = 7): ForecastWeek[] {
  const total = spanDays(start, end);
  if (total <= 0) return [];

  const weeks: ForecastWeek[] = [];
  let cursor = 0;
  let index = 1;
  while (cursor < total) {
    const len = Math.min(blockDays, total - cursor);
    weeks.push({
      index,
      start: addDays(start, cursor),
      end: addDays(start, cursor + len - 1),
    });
    cursor += len;
    index++;
  }
  return weeks;
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

/* ============================================================
   1b) التوقع الشهري المستقل
   ----------------------------------------------------------------
   المندوب بيكتب رقم السداد للشهر كله لوحده، مش محسوب من الأسابيع.
   الرقم ده بيتخزن في نفس جدول التوقعات الأسبوعية، لكن بـ week_index = 0.

   ليه 0 بالذات؟ لأن أرقام الأسابيع دايماً بتبدأ من 1 (من 1 لغاية MAX)، فمفيش
   أسبوع رقمه 0 أصلاً — يعني الفاصل بين السطر الشهري والأسابيع بيبقى مضمون
   بالبيانات نفسها، مش محتاج عمود جديد ولا migration. وأهم حاجة: كل تجميع لازم
   يتجاهل السطر الشهري لما بيجمع الأسابيع، وإلا الرقم هيتحسب مرتين.
   ============================================================ */

export const MONTH_FORECAST_INDEX = 0;

export function isMonthForecast(record: { weekIndex: number }): boolean {
  return Math.floor(Number(record.weekIndex)) === MONTH_FORECAST_INDEX;
}

export function isWeekForecast(record: { weekIndex: number }): boolean {
  return !isMonthForecast(record);
}

/** يفصل سطور الشهر عن سطور الأسابيع مرة واحدة، عشان التجميعات ما تتلغبطش. */
export function splitForecastRows<T extends { weekIndex: number }>(records: T[]): { weeks: T[]; months: T[] } {
  const weeks: T[] = [];
  const months: T[] = [];
  records.forEach((r) => {
    if (isMonthForecast(r)) months.push(r);
    else weeks.push(r);
  });
  return { weeks, months };
}

/**
 * يقصر سطور التوقع على التقسيم الحالي للشهر.
 *
 * المشكلة اللي بتحلها: لما الأدمن يصغّر الشهر من 5 أسابيع لـ 4، سطور الأسبوع
 * الخامس بتفضل موجودة في قاعدة البيانات. لو تجاهلناها هنا كانت هتعدّي في كل
 * تجميع — الخانة الأسبوعية مش ظاهرة أصلاً، بس الرقم بيفضل داخل في مجموع
 * الأسابيع وفي التوقع الشهري المحسوب وفي نسبة التغطية. يعني رقم بيظهر من
 * مكان مش موجود للعين.
 *
 * السطر الشهري (0) ما بيتأثرش أبداً لأنه مستقل عن التقسيم.
 * السطور اليتيمة بترجع للواجهة عشان الأدمن يعرف إن فيه أرقام معلقة.
 */
export function scopeForecastsToPlan<T extends { weekIndex: number }>(
  records: T[],
  weekCount: number
): { scoped: T[]; orphans: T[] } {
  const scoped: T[] = [];
  const orphans: T[] = [];
  records.forEach((r) => {
    if (isMonthForecast(r)) {
      scoped.push(r);
      return;
    }
    const w = Math.floor(Number(r.weekIndex));
    if (w >= 1 && w <= weekCount) scoped.push(r);
    else orphans.push(r);
  });
  return { scoped, orphans };
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

/**
 * اسم الفترة كما بتظهر للمستخدم.
 *
 * دي للعرض بس: المخزن والـid والربط كله على week_index، فالاسم مالوش أي
 * تأثير على البيانات. لو الإدارة مسابتش اسم، بنرجع للاسم الافتراضي
 * «أسبوع 1» عشان أي خطة قديمة من غير اسم تفضل بتتعرض زي ما هي.
 */
export function weekLabel(week: Pick<ForecastWeek, 'index' | 'label'>): string {
  const custom = (week.label || '').trim();
  return custom || `أسبوع ${week.index}`;
}

/**
 * تنظيف اسم الفترة قبل الحفظ.
 *
 * بيقصّ الطول (عشان الاسم ما يطالّعش عمود في الجدول) وبيجمّع المسافات.
 * الاسم الفاضي معناها «سيب الافتراضي» مش «اسم فاضي».
 */
export const MAX_WEEK_LABEL_LENGTH = 40;

export function normalizeWeekLabel(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_WEEK_LABEL_LENGTH);
  return text;
}

/** بيشيل المسافات الفاضية ويقصّ الطول لكل أسماء الفترات مرة واحدة. */
export function normalizeWeekLabels(weeks: ForecastWeek[]): ForecastWeek[] {
  return weeks.map((w) => {
    const label = normalizeWeekLabel(w.label);
    if (label === (w.label ?? '')) return w;
    if (label) return { ...w, label };
    const { label: _drop, ...rest } = w;
    return rest as ForecastWeek;
  });
}

/**
 * يتحقق إن التقسيم سليم لو موجود.
 *
 * القرار: التقسيم اختياري. مفيش تقسيم (صفر فترات) خطة صحيحة، والصفحة بتفتح
 * على التوقع الشهري المستقل لوحده. وحتى مع وجود تقسيم، تغطية الشهر كلها مش
 * شرط — الإدارة ممكن تغطي فترة وتسيب الباقي مفتوح، وده اختيار مشروع في
 * شهر بيبدأ التحصيل فيه متأخر أو بيخلص بدري.
 *
 * اللي بيتترفض فعلاً هو الخطأ اللي بيبوظ الحسابات: تاريخ مش صالح، فترة جوه
 * الشهر بره، أو فترتين متقاطعتين (اللي بيخلي يوم يتحسب مرتين).
 */
export function validateMonthPlan(plan: ForecastMonthPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const monthStart = new Date(plan.monthStart).getTime();
  const monthEnd = new Date(plan.monthEnd).getTime();
  if (isNaN(monthStart) || isNaN(monthEnd)) {
    errors.push('تواريخ الشهر غير صحيحة');
    return { valid: false, errors };
  }
  if (monthEnd < monthStart) errors.push('نهاية الشهر قبل بدايته');

  // مفيش تقسيم = خطة صحيحة، ومفيش أخطاء تتفحص.
  if (!plan.weeks.length) return { valid: errors.length === 0, errors };

  let previousEnd = 0;
  plan.weeks.forEach((w, i) => {
    const s = new Date(w.start).getTime();
    const e = new Date(w.end).getTime();
    if (isNaN(s) || isNaN(e)) {
      errors.push(`تواريخ الفترة ${w.index} غير صحيحة`);
      return;
    }
    if (e < s) {
      errors.push(`نهاية الفترة ${w.index} قبل بدايتها`);
      return;
    }
    if (s < monthStart) errors.push(`الفترة ${w.index} بتبدأ قبل بداية الشهر`);
    if (e > monthEnd) errors.push(`الفترة ${w.index} بتعدّي نهاية الشهر`);
    if (i > 0 && s <= previousEnd) errors.push(`الفترة ${w.index} بتقاطع اللي قبلها`);
    previousEnd = e;
  });

  if (plan.weeks.length > MAX_WEEKS_PER_MONTH) {
    errors.push(`عدد الفترات ${plan.weeks.length} أكبر من الحد المسموح (${MAX_WEEKS_PER_MONTH})`);
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
    // Supervisor sees ONLY their own row + their direct subordinates.
    // They do NOT see the whole branch (other supervisors' reps).
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
    // Supervisor sees ONLY their own row + their direct subordinates.
    // They do NOT see the whole branch (other supervisors' reps).
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

/** سطر التوقع الشهري المستقل — نفس النمط بس بـ w0 عشان ما يتعارضش مع أي أسبوع. */
export function emptyMonthForecastId(monthKey: string, customerId: string): string {
  return `fc_${monthKey}_w${MONTH_FORECAST_INDEX}_${customerId}`;
}

function baseForecastRecord(
  id: string,
  monthKey: string,
  weekIndex: number,
  customer: Customer,
  repId: string,
  repName: string
): CollectionForecastRecord {
  return {
    id,
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

export function makeForecastRecord(
  monthKey: string,
  weekIndex: number,
  customer: Customer,
  repId: string,
  repName: string,
  existing?: CollectionForecastRecord
): CollectionForecastRecord {
  if (existing) return existing;
  return baseForecastRecord(
    emptyForecastId(monthKey, weekIndex, customer.id),
    monthKey,
    weekIndex,
    customer,
    repId,
    repName
  );
}

/**
 * سطر التوقع الشهري المستقل لنفس العميل.
 *
 * مهم: لما العميل يكون لسه ماكتبش رقم شهري، بنرجع مجموع الأسابيع في
 * collectionForecast عشان الخانة تبان مقروءة. المستخدم بيكتب فوقها من غير ما
 * يعرف إن الرقم ده متحسب — وده بالظبط المطلوب، لأن التوقع الشهري المفروض
 * يكون رقم مستقل مش مجمع.
 */
export function makeMonthForecastRecord(
  monthKey: string,
  customer: Customer,
  repId: string,
  repName: string,
  weekSum: number,
  existing?: CollectionForecastRecord
): CollectionForecastRecord {
  if (existing) return existing;
  return {
    ...baseForecastRecord(
      emptyMonthForecastId(monthKey, customer.id),
      monthKey,
      MONTH_FORECAST_INDEX,
      customer,
      repId,
      repName
    ),
    collectionForecast: weekSum,
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
  /** التوقع الشهري المستقل اللي كتبه المندوب (مش محسوب من الأسابيع). */
  monthCollection: number;
  /** إجمالي عادل لكل عميل: الشهري إن وُجد، وإلا مجموع أسابيعه. */
  plannedCollectionTotal: number;
  /** مجموع الأسابيع فقط — السطر الشهري مستقل ومش داخل في الرقم ده. */
  totalCollection: number;
  totalSales: number;
  draftPeriods: number;
  submittedPeriods: number;
  approvedPeriods: number;
  changeRequestedPeriods: number;
  customerCount: number;
}

export function aggregateByRep(
  records: CollectionForecastRecord[],
  weekCount: number
): RepForecastRow[] {
  const map = new Map<string, RepForecastRow>();
  const plannedByRepAndCustomer = new Map<string, { weekly: number; monthly?: number }>();

  // السطر الشهري بيتخزن بنفس الجدول، فلازم يتشال من التجميع الأسبوعي الأول —
  // غير كده التوقع بيتحسب مرتين في كل رقم أسبوعي وفي إجمالي الشهر.
  const { weeks, months } = splitForecastRows(records);

  weeks.forEach((r) => {
    const week = Math.floor(r.weekIndex);
    let row = map.get(r.repId);
    if (!row) {
      row = {
        repId: r.repId,
        repName: r.repName,
        branchName: r.branchName,
        weekCollection: {},
        weekSales: {},
        monthCollection: 0,
        plannedCollectionTotal: 0,
        totalCollection: 0,
        totalSales: 0,
        draftPeriods: 0,
        submittedPeriods: 0,
        approvedPeriods: 0,
        changeRequestedPeriods: 0,
        customerCount: 0,
      };
      map.set(r.repId, row);
    }
    row.weekCollection[week] = (row.weekCollection[week] || 0) + Number(r.collectionForecast || 0);
    row.weekSales[week] = (row.weekSales[week] || 0) + Number(r.salesForecast || 0);
    row.totalCollection += Number(r.collectionForecast || 0);
    row.totalSales += Number(r.salesForecast || 0);
    const customerKey = `${r.repId}::${r.customerId}`;
    const customerPlanned = plannedByRepAndCustomer.get(customerKey) || { weekly: 0 };
    customerPlanned.weekly += Number(r.collectionForecast || 0);
    plannedByRepAndCustomer.set(customerKey, customerPlanned);
  });

  // التوقع الشهري بيتجمع لوحده، وده اللي بيتقارن بهدف الشهر.
  months.forEach((r) => {
    let row = map.get(r.repId);
    if (!row) {
      row = {
        repId: r.repId,
        repName: r.repName,
        branchName: r.branchName,
        weekCollection: {},
        weekSales: {},
        monthCollection: 0,
        plannedCollectionTotal: 0,
        totalCollection: 0,
        totalSales: 0,
        draftPeriods: 0,
        submittedPeriods: 0,
        approvedPeriods: 0,
        changeRequestedPeriods: 0,
        customerCount: 0,
      };
      map.set(r.repId, row);
    }
    row.monthCollection += Number(r.collectionForecast || 0);
    const customerKey = `${r.repId}::${r.customerId}`;
    const customerPlanned = plannedByRepAndCustomer.get(customerKey) || { weekly: 0 };
    customerPlanned.monthly = Number(r.collectionForecast) || 0;
    plannedByRepAndCustomer.set(customerKey, customerPlanned);
  });

  plannedByRepAndCustomer.forEach((customerPlanned, key) => {
    const separator = key.indexOf('::');
    const repId = key.slice(0, separator);
    const row = map.get(repId);
    if (row) {
      row.plannedCollectionTotal += customerPlanned.monthly !== undefined
        ? customerPlanned.monthly
        : customerPlanned.weekly;
    }
  });

  // A week's status is the weakest status any of its customers is in, so one
  // unapproved line keeps the whole week open for the supervisor.
  const periodStatus = new Map<string, Set<ForecastStatus>>();
  const customerIdsByRep = new Map<string, Set<string>>();
  [...weeks, ...months].forEach((r) => {
    const key = `${r.repId}::${Math.floor(r.weekIndex)}`;
    const set = periodStatus.get(key) || new Set<ForecastStatus>();
    set.add(r.status);
    periodStatus.set(key, set);
    const customerIds = customerIdsByRep.get(r.repId) || new Set<string>();
    customerIds.add(r.customerId);
    customerIdsByRep.set(r.repId, customerIds);
  });

  const rows = Array.from(map.values());
  rows.forEach((row) => {
    row.customerCount = customerIdsByRep.get(row.repId)?.size || 0;
    for (let w = 0; w <= weekCount; w++) {
      const statuses = periodStatus.get(`${row.repId}::${w}`);
      if (!statuses) continue;
      // Count periods by their weakest customer-row status; slot 0 is monthly.
      if (statuses.has('change_requested')) row.changeRequestedPeriods++;
      else if (statuses.has('draft')) row.draftPeriods++;
      else if (statuses.has('submitted')) row.submittedPeriods++;
      else if (statuses.has('approved')) row.approvedPeriods++;
    }
  });

  return rows.sort((a, b) => plannedCollection(b) - plannedCollection(a));
}

/**
 * الرقم اللي يتقارن بهدف الشهر.
 *
 * لو المندوب كتب رقم شهري مستقل بنستخدمه، ولو ما كتبش بنرجع لمجموع الأسابيع.
 * من غير الشرط ده المندوبين اللي مالهمش رقم شهري هيفضلوا خارج حساب التغطية
 * خالص، والصفحة هتبين أن مفيش توقعات لو الأرقام الأسبوعية موجودة.
 */
export function plannedCollection(row: RepForecastRow): number {
  return row.plannedCollectionTotal;
}

export interface ForecastProgressRow {
  repId: string;
  repName: string;
  branchName: string;
  forecastCollection: number;
  forecastSales: number;
  /** مجموع الأسابيع — بيتعرض جنب الرقم الشهري عشان تشوف الفرق. */
  weeklyCollection: number;
  /** التوقع الشهري المستقل اللي كتبه المندوب (0 لو ما كتبش). */
  monthCollection: number;
  targetCollection: number;
  targetSales: number;
  actualCollection: number;
  actualSales: number;
  collectionCoverage: number;   // المتوقع ÷ الهدف  %
  collectionVsTarget: number;   // فائض / عجز
  status: 'ahead' | 'on_track' | 'behind' | 'no_target';
  /** عدّاد الفترات الشهرية والأسبوعية حسب حالة الاعتماد. */
  draftPeriods: number;
  submittedPeriods: number;
  approvedPeriods: number;
  changeRequestedPeriods: number;
  weekCollection: Record<number, number>;
  customerCount: number;
}

export function buildProgress(
  forecasts: CollectionForecastRecord[],
  targets: TargetRecord[],
  weekCount: number
): ForecastProgressRow[] {
  const monthForecasts = forecasts;
  const rows = aggregateByRep(monthForecasts, weekCount);
  const targetsByRep = new Map<string, TargetRecord[]>();
  const targetByBranchAndRep = new Map<string, TargetRecord>();
  targets.forEach((t) => {
    const repName = t.repName.trim();
    const key = `${t.branch.trim()}::${repName}`;
    const branchRecord = targetByBranchAndRep.get(key);
    if (!branchRecord || t.updatedAt > branchRecord.updatedAt) targetByBranchAndRep.set(key, t);
    const repTargets = targetsByRep.get(repName) || [];
    repTargets.push(t);
    targetsByRep.set(repName, repTargets);
  });

  return rows.map((r) => {
    const t = targetByBranchAndRep.get(`${r.branchName.trim()}::${r.repName.trim()}`)
      || (targetsByRep.get(r.repName.trim())?.length === 1
        ? targetsByRep.get(r.repName.trim())?.[0]
        : undefined);
    const targetCollection = Number(t?.collectionTarget || 0);
    const targetSales = Number(t?.salesTarget || 0);
    // المقارنة بهدف الشهر لازم تتم على الرقم الشهري، مش على مجموع الأسابيع.
    const planned = plannedCollection(r);
    const coverage = targetCollection > 0 ? Math.round((planned / targetCollection) * 100) : 0;
    const diff = planned - targetCollection;
    const status: ForecastProgressRow['status'] =
      targetCollection <= 0 ? 'no_target' : coverage >= 100 ? 'ahead' : coverage >= 80 ? 'on_track' : 'behind';
    return {
      repId: r.repId,
      repName: r.repName,
      branchName: r.branchName,
      forecastCollection: planned,
      forecastSales: r.totalSales,
      weeklyCollection: r.totalCollection,
      monthCollection: r.monthCollection,
      targetCollection,
      targetSales,
      actualCollection: Number(t?.collectionAchieved || 0),
      actualSales: Number(t?.salesAchieved || 0),
      collectionCoverage: coverage,
      collectionVsTarget: diff,
      status,
      draftPeriods: r.draftPeriods,
      submittedPeriods: r.submittedPeriods,
      approvedPeriods: r.approvedPeriods,
      changeRequestedPeriods: r.changeRequestedPeriods,
      weekCollection: r.weekCollection,
      customerCount: r.customerCount,
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

  // خريطة حالات الأسابيع — سطور التوقع الشهري (week_index = 0) مش أسابيع،
  // فلازم ما تدخلش الخريطة دي أو هيبقى في حالة معلقة على أسبوع مش موجود.
  const weekStatuses = new Map<string, Set<ForecastStatus>>();
  splitForecastRows(forecasts).weeks.forEach((f) => {
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
          title: `${info.repName} لم يكتب توقع ${weekLabel(w)}`,
          detail: `${weekLabel(w)} (${formatWeekRange(w)}) — التوقع مطلوب قبل بداية الفترة`,
          branchName: info.branchName,
          repId,
        });
      } else if (statuses.has('change_requested')) {
        alerts.push({
          id: `chg_${repId}_${w.index}`,
          severity: 'medium',
          kind: 'change_requested',
          title: `${info.repName} مطلوب منه تعديل توقع ${weekLabel(w)}`,
          detail: `المشرف رجّع التوقع — ${weekLabel(w)} (${formatWeekRange(w)})`,
          branchName: info.branchName,
          repId,
        });
      } else if (!statuses.has('approved') && !statuses.has('submitted')) {
        alerts.push({
          id: `draft_${repId}_${w.index}`,
          severity: 'low',
          kind: 'not_submitted',
          title: `${info.repName} لسه بيكتب توقع ${weekLabel(w)}`,
          detail: `${weekLabel(w)} (${formatWeekRange(w)}) — لسه مسودة`,
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
  visitStatsByCustomer?: Map<string, { count: number; completed: number; lastDate: string }>;
}) {
  const { forecasts, comments, customers, returnsByCustomerCode, lastVisitByCustomerId, visitStatsByCustomer } = input;
  const commentByCode = new Map(comments.map((c) => [c.customerCode, c]));

  return customers.map((c) => {
    const fin = calculateCustomerFinancials(c, 'ALL');
    const badge = buildCustomerBadge(c, !!returnsByCustomerCode?.get(c.code || '')?.count, lastVisitByCustomerId?.get(c.id));
    const mine = forecasts.filter((f) => f.customerId === c.id);
    // السطر الشهري منفصل عن الأسابيع، فالتقرير لازم يوري الرقم المستقل
    // ومجموع الأسابيع في خانتين منفصلين — دمجهم بيبوظ المقارنة.
    const { weeks, months } = splitForecastRows(mine);
    const monthForecast = months.reduce((s, f) => s + (Number(f.collectionForecast) || 0), 0);
    const weeklyCollection = weeks.reduce((s, f) => s + (Number(f.collectionForecast) || 0), 0);
    const weeklySales = weeks.reduce((s, f) => s + (Number(f.salesForecast) || 0), 0);
    const comment = commentByCode.get(c.code || '');
    const ret = returnsByCustomerCode?.get(c.code || '');
    const vStats = visitStatsByCustomer?.get(c.id);
    // آخر زيارة من سجل الزيارات، ويرجع لصف العميل لو السجلات فاضية.
    const lastVisit = vStats?.lastDate || lastVisitByCustomerId?.get(c.id) || c.lastVisitDate || '';

    return {
      'كود العميل': c.code || '---',
      'اسم العميل': c.name || '',
      'الفرع': c.branchName || '',
      'المندوب': c.salesRepName || c.repName || '',
      'متعامل': badge.isDealt ? 'نعم' : 'لا',
      'التصنيف من الشيت': fin.sheetClassificationLabel || (fin.isEligible ? 'قابل' : 'غير'),
      'قابل / غير': fin.isEligible ? 'قابل' : 'غير',
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
      'التوقع الشهري المستقل (ج.م)': monthForecast,
      'مجموع التوقع الأسبوعي (ج.م)': weeklyCollection,
      'فرق الشهر على الأسابيع (ج.م)': monthForecast - weeklyCollection,
      'متوقع البيع الأسبوعي (ج.م)': weeklySales,
      'عدد أسابيع متوقع فيها': weeks.filter((f) => Number(f.collectionForecast) > 0).length,
      'عدد الزيارات المنفّذة': vStats?.completed ?? 0,
      'إجمالي الزيارات': vStats?.count ?? 0,
      'آخر زيارة': lastVisit || '---',
      'الكومنت': comment?.body || '',
      'نوع الكومنت': comment ? COMMENT_KIND_LABELS[comment.kind] : '---',
      'كاتب الكومنت': comment?.authorName || '---',
    };
  });
}