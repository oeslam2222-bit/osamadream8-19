import { Customer } from '../types';
import { classifyEligibilityColumn } from './customerFinancialService';

/**
 * شروط فلترة شاشة العملاء في مكان واحد.
 *
 * الهدف: نفس الشرط يُستخدم في:
 *  1) خط الفلترة الأساسي في AllCustomersAnalyticsView
 *  2) عدّادات الشرائح السريعة (Chips) في شريط الفلترة
 *
 * قبل كده كان كل عدّاد بيكرر الشرط لوحده، وأي تعديل في شرط واحد
 * كان بيخلي الرقم المعروض في الشريحة مختلف عن عدد النتائج الفعلي.
 */

export type EligibilityFilter = 'ALL' | 'قابل' | 'غير قابل';
export type DebtFilter = 'ALL' | 'has_debt' | 'zero_debt' | 'over_limit' | 'has_overdue';
export type ActivityFilter = 'ALL' | 'active_2026' | 'inactive_2026' | 'churn_risk' | 'new_customer';
export type OrderFilter = 'ALL' | 'has_order' | 'active_order' | 'no_order';
export type VisitFilter = 'ALL' | 'visited_2026' | 'not_visited';
export type CollectionRateFilter = 'ALL' | 'high_80' | 'medium_30_79' | 'low_zero';

export interface CustomerOrderSummaryLike {
  hasOrder: boolean;
  hasActiveOrder: boolean;
}

/** الرصيد الحالي (بيدعم الحقلين القديم والجديد). */
export const getCustomerBalance = (c: Customer): number => c.currentBalance ?? c.balance ?? 0;

/** إجمالي المتأخرات والمستحق. */
export const getCustomerOverdue = (c: Customer): number =>
  c.totalOverdueAndDue ?? c.overdueBalance ?? 0;

/**
 * كفاءة التحصيل = التحصيلات ÷ المبيعات.
 * نفس المعادلة المستخدمة في عمود كفاءة التحصيل وفي الفلتر الأصلي.
 */
export const getCustomerCollectionRate = (c: Customer): number => {
  const sales = c.sales2026 || c.totalMonthlySales || 0;
  const collected = Math.max(
    Math.abs(Number(c.collections2026) || 0),
    Math.abs(Number(c.totalMonthlyCollections) || 0),
    Math.abs(Number(c.totalOverallCollections) || 0)
  );
  if (sales > 0) return (collected / sales) * 100;
  return collected > 0 ? 100 : 0;
};

/**
 * قابل للتعامل / غير قابل — من عامود «قابل / غير» في الشيت فقط.
 * ما فيش تخمين تاني: لو العامود فاضي أو فيه «غير متعامل قابل للتعامل»
 * (قابل للتعامل طالما العميل غير ممنوع) بيبقى قابل للتعامل.
 */
export const matchesEligibilityFilter = (c: Customer, filter: EligibilityFilter): boolean => {
  if (filter === 'ALL') return true;
  const info = classifyEligibilityColumn(c.dealEligibility);
  if (!info) return false;
  return filter === 'غير قابل' ? !info.eligible : info.eligible;
};

export const matchesDebtFilter = (c: Customer, filter: DebtFilter): boolean => {
  if (filter === 'ALL') return true;
  const balance = getCustomerBalance(c);

  if (filter === 'has_debt') return balance > 0;
  if (filter === 'zero_debt') return balance <= 0;
  if (filter === 'over_limit') {
    const limit = c.creditLimit || 0;
    return limit > 0 && balance > limit;
  }
  if (filter === 'has_overdue') return getCustomerOverdue(c) > 0;
  return true;
};

export const matchesActivityFilter = (c: Customer, filter: ActivityFilter): boolean => {
  if (filter === 'ALL') return true;
  const sales2026 = c.sales2026 || 0;
  const sales2025 = c.sales2025 || 0;

  if (filter === 'active_2026') return !!c.hasDealtIn2026 || sales2026 > 0;
  if (filter === 'inactive_2026') return !c.hasDealtIn2026 && sales2026 === 0;
  if (filter === 'churn_risk') return c.status2026 === 'churn_risk' || (sales2025 > 0 && sales2026 === 0);
  if (filter === 'new_customer') return c.status2026 === 'new_customer' || (sales2026 > 0 && sales2025 === 0);
  return true;
};

export const matchesOrderFilter = (
  filter: OrderFilter,
  summary: CustomerOrderSummaryLike
): boolean => {
  if (filter === 'ALL') return true;
  if (filter === 'has_order') return summary.hasOrder;
  if (filter === 'active_order') return summary.hasActiveOrder;
  if (filter === 'no_order') return !summary.hasOrder;
  return true;
};

export const matchesCollectionRateFilter = (
  c: Customer,
  filter: CollectionRateFilter
): boolean => {
  if (filter === 'ALL') return true;
  const rate = getCustomerCollectionRate(c);
  if (filter === 'high_80') return rate >= 80;
  if (filter === 'medium_30_79') return rate >= 30 && rate < 80;
  if (filter === 'low_zero') return rate < 30;
  return true;
};

export const hasCustomerVisit = (c: Customer): boolean =>
  !!c.lastVisitDate || (c.visitCount2026 || 0) > 0;

export const matchesVisitFilter = (c: Customer, filter: VisitFilter): boolean => {
  if (filter === 'ALL') return true;
  if (filter === 'visited_2026') return hasCustomerVisit(c);
  if (filter === 'not_visited') return !hasCustomerVisit(c);
  return true;
};

/* -------------------------------------------------------------------------- */
/*                     متعامل / غير متعامل + توصيف الحالة                     */
/* -------------------------------------------------------------------------- */

export type DealtFilter = 'ALL' | 'dealt_2026' | 'not_dealt_2026';

/**
 * «متعامل» = سحب طلبية في 2026 أو اتسجل له تعامل صريح في شيت العملاء.
 * الفلتر القديم كان بيعتمد على activityFilter؛ ده بُعد مستقل عشان عمود
 * «التعامل» يبقى واضح ومباشر زي ما الشاشة المرجعية بتطلب.
 */
export const isDealtCustomer = (c: Customer): boolean => {
  if (c.hasDealtIn2026) return true;
  if ((c.sales2026 || 0) > 0) return true;
  const flag = (c.dealt2026 || '').trim();
  return flag === 'متعامل' || flag === 'نعم';
};

export const matchesDealtFilter = (c: Customer, filter: DealtFilter): boolean => {
  if (filter === 'ALL') return true;
  return filter === 'dealt_2026' ? isDealtCustomer(c) : !isDealtCustomer(c);
};

export type CustomerTone = 'ok' | 'warn' | 'risk' | 'muted';

/** لون واسم حالة السداد الموحّد للجدول ولوحة التفاصيل. */
export const getCustomerStatusBadge = (
  c: Customer
): { label: string; tone: CustomerTone } => {
  const raw = (c.debtStatus || '').trim();
  const overdue = getCustomerOverdue(c);

  if (/متعثر|متأخر|تأخر/.test(raw)) return { label: raw, tone: 'risk' };
  if (/متابعة|بحاجة/.test(raw)) return { label: raw, tone: 'warn' };
  if (/منتظم|منظم/.test(raw)) return { label: raw, tone: 'ok' };
  if (raw) return { label: raw, tone: overdue > 0 ? 'risk' : 'muted' };
  return overdue > 0 ? { label: 'متأخر', tone: 'risk' } : { label: 'منتظم', tone: 'ok' };
};

/** نسبة استخدام الحد الائتماني (0 لملوش حد). */
export const getCreditUsagePercent = (c: Customer): number => {
  const limit = c.creditLimit || 0;
  if (limit <= 0) return 0;
  return Math.min(999, Math.round((getCustomerBalance(c) / limit) * 100));
};

/**
 * تصنيف التعامل (قابل / غير قابل) — من عامود «قابل / غير» مباشرة.
 * `label` هو نص الخلية نفسه من الشيت، و `tone` مبني على eligible فقط
 * (موقوف/غير قابل = risk، أي شيء قابل = ok).
 */
export const getEligibilityBadge = (c: Customer): { label: string; tone: CustomerTone } => {
  const info = classifyEligibilityColumn(c.dealEligibility);
  if (!info) return { label: 'غير محدد', tone: 'muted' };
  return { label: info.raw, tone: info.eligible ? 'ok' : 'risk' };
};

/**
 * حالة التعامل مشتقة من عمود «قابل / غير» في الشيت:
 *   قابل للتعامل  → متعامل
 *   غير قابل/موقوف → غير متعامل
 *   فاضي           → غير محدد
 * بنرجّع كمان النص الأصلي (raw) عشان يظهر جنب الحالة ومايضيعش تفصيل من الشيت.
 */
export const getCustomerDealtBadge = (
  c: Customer
): { label: string; tone: CustomerTone; raw: string } => {
  const info = classifyEligibilityColumn(c.dealEligibility);
  if (!info) return { label: 'غير محدد', tone: 'muted', raw: '' };
  if (info.dealt === false) return { label: 'غير متعامل', tone: 'risk', raw: info.raw };
  if (info.dealt === true) return { label: 'متعامل', tone: 'ok', raw: info.raw };
  // العامود بيقول فقط "قابل" أو "غير قابل" من غير حكم على الشراء — نخزن eligible فقط.
  return { label: info.eligible ? 'قابل للتعامل' : 'غير قابل', tone: info.eligible ? 'ok' : 'risk', raw: info.raw };
};
