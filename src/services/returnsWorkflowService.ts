import type { CustomerVisit } from '../types';

/**
 * مراحل دورة المرتجع.
 *
 * الترتيب هنا هو ترتيب العمل الفعلي:
 *   المندوب يفتح الإذن → المشرف يوافق → أمين المخزن ينسّق ويرسل السيارة
 *   → الاستلام بالمخزن → التصفية → الإغلاق.
 */
export type ReturnStage =
  | 'بانتظار المشرف'
  | 'مرفوض'
  | 'تم التحويل لأمين المخزن'
  | 'بانتظار التنسيق'
  | 'تم إرسال السيارة'
  | 'جاري الاستلام'
  | 'استلام جزئي'
  | 'تعذر الاستلام'
  | 'تم الاستلام بالمخزن'
  | 'جاري تصفية المرتجع'
  | 'مغلق';

/** كل المراحل بالترتيب الزمني (للتقارير والفلاتر). */
export const RETURN_STAGE_ORDER: ReturnStage[] = [
  'بانتظار المشرف',
  'تم التحويل لأمين المخزن',
  'بانتظار التنسيق',
  'تم إرسال السيارة',
  'جاري الاستلام',
  'استلام جزئي',
  'تعذر الاستلام',
  'تم الاستلام بالمخزن',
  'جاري تصفية المرتجع',
  'مغلق',
  'مرفوض',
];

/** مراحل دورة المخزن — بتبدأ من لحظة تحويل المرتجع لأمين المخزن. */
export const WAREHOUSE_STAGES: ReturnStage[] = [
  'تم التحويل لأمين المخزن',
  'بانتظار التنسيق',
  'تم إرسال السيارة',
  'جاري الاستلام',
  'استلام جزئي',
  'تعذر الاستلام',
  'تم الاستلام بالمخزن',
  'جاري تصفية المرتجع',
  'مغلق',
];

/** مكان المرتجع وقت الفتح. */
export type ReturnLocation = 'عند العميل' | 'بالمخزن';
export const RETURN_LOCATIONS: ReturnLocation[] = ['عند العميل', 'بالمخزن'];

/**
 * بيانات إضافية لدورة المرتجع (الموقع، الكميات المستلمة، التسوية).
 *
 * بتتخزن جوه `returnNote` كـ JSON بعد بادئة ثابتة عشان:
 *   - ما نضيفش أعمدة جديدة على جدول الزيارات في Supabase (مفيش خطورة على المزامنة)
 *   - تبقى البيانات organised ومقروءة للواجهة
 * الحقول القديمة (return_status / return_handled_by / return_handled_at) هي اللي
 * بتتحفظ فعلياً في قاعدة البيانات.
 */
export interface ReturnWorkflowMeta {
  location?: ReturnLocation;
  receivedCartons?: number;
  receivedPieces?: number;
  settlement?: string;
  carDispatchedAt?: string;
  receivedAt?: string;
}

const META_PREFIX = '[RW]';

export function parseReturnNote(note?: string): { text: string; meta: ReturnWorkflowMeta } {
  if (!note) return { text: '', meta: {} };
  const trimmed = String(note).trim();
  if (!trimmed.startsWith(META_PREFIX)) return { text: note, meta: {} };
  const end = trimmed.indexOf(']');
  if (end < 0) return { text: note, meta: {} };
  const raw = trimmed.slice(META_PREFIX.length, end);
  const text = trimmed.slice(end + 1).trim();
  try {
    const parsed = JSON.parse(raw);
    return { text, meta: parsed && typeof parsed === 'object' ? (parsed as ReturnWorkflowMeta) : {} };
  } catch {
    return { text: note, meta: {} };
  }
}

export function buildReturnNote(text: string, meta: ReturnWorkflowMeta): string {
  const clean: ReturnWorkflowMeta = {};
  if (meta.location) clean.location = meta.location;
  if (typeof meta.receivedCartons === 'number') clean.receivedCartons = meta.receivedCartons;
  if (typeof meta.receivedPieces === 'number') clean.receivedPieces = meta.receivedPieces;
  if (meta.settlement) clean.settlement = meta.settlement;
  if (meta.carDispatchedAt) clean.carDispatchedAt = meta.carDispatchedAt;
  if (meta.receivedAt) clean.receivedAt = meta.receivedAt;
  return `${META_PREFIX}${JSON.stringify(clean)}${text ? ' ' + text : ''}`;
}

/** مدة المرحلة الحالية بالمللي ثانية (من وقت تحويل المرحلة). */
export function elapsedMs(from?: string): number {
  if (!from) return 0;
  const time = new Date(from).getTime();
  if (!time || Number.isNaN(time)) return 0;
  return Math.max(0, Date.now() - time);
}

/** مدة مقروءة بالعربي: "3 يوم و 4 ساعة". */
export function formatElapsed(ms: number): string {
  if (!ms || ms <= 0) return 'الآن';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} يوم${hours % 24 ? ` و ${hours % 24} ساعة` : ''}`;
  if (hours > 0) return `${hours} ساعة${minutes % 60 ? ` و ${minutes % 60} دقيقة` : ''}`;
  return `${minutes} دقيقة`;
}

/** المدة المستهدفة لكل مرحلة (بالساعات) — بتحددها الإدارة فقط. */
export type StageTargets = Partial<Record<ReturnStage, number>>;

const TARGETS_STORAGE_KEY = 'tantawy_return_stage_targets_v1';

export function getStageTargets(): StageTargets {
  try {
    const raw = localStorage.getItem(TARGETS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StageTargets) : {};
  } catch {
    return {};
  }
}

export function saveStageTargets(targets: StageTargets): void {
  try {
    localStorage.setItem(TARGETS_STORAGE_KEY, JSON.stringify(targets));
  } catch {
    /* التخزين المحلي غير متاح — نكمل بدون حفظ */
  }
}

/** هل المرحلة تجاوزت المدة المستهدفة؟ */
export function isStageOverdue(stage: ReturnStage, startedAt?: string, targets?: StageTargets): boolean {
  const map = targets ?? getStageTargets();
  const hours = map[stage];
  if (!hours || !startedAt) return false;
  return elapsedMs(startedAt) > hours * 3600 * 1000;
}

export function stageOf(visit: CustomerVisit): ReturnStage {
  return (visit.returnStatus as ReturnStage) || 'بانتظار المشرف';
}

export function isWarehouseStage(stage: ReturnStage): boolean {
  return WAREHOUSE_STAGES.includes(stage);
}

export function isClosedStage(stage: ReturnStage): boolean {
  return stage === 'مغلق' || stage === 'مرفوض';
}

export interface ReturnAction {
  stage: ReturnStage;
  label: string;
  tone: 'primary' | 'success' | 'warn' | 'danger';
  needsReceipt?: boolean;
  needsSettlement?: boolean;
}

/** الإجراءات المتاحة للمسؤول في كل مرحلة. */
export function nextActionsFor(stage: ReturnStage): ReturnAction[] {
  switch (stage) {
    case 'تم التحويل لأمين المخزن':
      return [
        { stage: 'بانتظار التنسيق', label: 'بدء التنسيق', tone: 'primary' },
        { stage: 'تعذر الاستلام', label: 'تعذر الاستلام', tone: 'danger' },
      ];
    case 'بانتظار التنسيق':
      return [
        { stage: 'تم إرسال السيارة', label: 'تم إرسال السيارة', tone: 'primary' },
        { stage: 'تعذر الاستلام', label: 'تعذر الاستلام', tone: 'danger' },
      ];
    case 'تم إرسال السيارة':
      return [{ stage: 'جاري الاستلام', label: 'جاري الاستلام', tone: 'primary' }];
    case 'جاري الاستلام':
      return [
        { stage: 'تم الاستلام بالمخزن', label: 'تسجيل الاستلام بالمخزن', tone: 'success', needsReceipt: true },
        { stage: 'استلام جزئي', label: 'استلام جزئي', tone: 'warn', needsReceipt: true },
        { stage: 'تعذر الاستلام', label: 'تعذر الاستلام', tone: 'danger' },
      ];
    case 'استلام جزئي':
    case 'تم الاستلام بالمخزن':
      return [{ stage: 'جاري تصفية المرتجع', label: 'بدء التصفية', tone: 'primary' }];
    case 'جاري تصفية المرتجع':
      return [{ stage: 'مغلق', label: 'إغلاق المرتجع', tone: 'success', needsSettlement: true }];
    default:
      return [];
  }
}

/** تدرّج لوني ثابت لكل حالة عشان الشكل يبقى موحّد في كل الشاشات. */
export const STAGE_STYLES: Record<ReturnStage, { badge: string; dot: string; label: string }> = {
  'بانتظار المشرف': { badge: 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border-[var(--app-warn-line)]', dot: 'bg-[var(--app-warn)]', label: 'بانتظار المشرف' },
  'تم التحويل لأمين المخزن': { badge: 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] border-[var(--app-navy-line)]', dot: 'bg-[var(--app-navy)]', label: 'تم التحويل للمخزن' },
  'بانتظار التنسيق': { badge: 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] border-[var(--app-navy-line)]', dot: 'bg-[var(--app-navy)]', label: 'بانتظار التنسيق' },
  'تم إرسال السيارة': { badge: 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] border-[var(--app-navy-line)]', dot: 'bg-[var(--app-navy)]', label: 'تم إرسال السيارة' },
  'جاري الاستلام': { badge: 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border-[var(--app-ok-line)]', dot: 'bg-[var(--app-ok)]', label: 'جاري الاستلام' },
  'استلام جزئي': { badge: 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border-[var(--app-warn-line)]', dot: 'bg-[var(--app-warn)]', label: 'استلام جزئي' },
  'تعذر الاستلام': { badge: 'bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] border-[var(--app-risk-line)]', dot: 'bg-[var(--app-risk)]', label: 'تعذر الاستلام' },
  'تم الاستلام بالمخزن': { badge: 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border-[var(--app-ok-line)]', dot: 'bg-[var(--app-ok)]', label: 'تم الاستلام بالمخزن' },
  'جاري تصفية المرتجع': { badge: 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] border-[var(--app-navy-line)]', dot: 'bg-[var(--app-navy)]', label: 'جاري التصفية' },
  'مغلق': { badge: 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border-[var(--app-ok-line)]', dot: 'bg-[var(--app-ok)]', label: 'مغلق' },
  'مرفوض': { badge: 'bg-slate-200 text-slate-700 border-slate-300', dot: 'bg-slate-400', label: 'مرفوض' },
};
