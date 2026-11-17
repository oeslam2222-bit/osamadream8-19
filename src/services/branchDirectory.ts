/**
 * دليل الفروع الثابتة اللي الإدارة بتشتغل عليها.
 *
 * الشيتات وقاعدة العملاء بيكتبوا الفرع بأشكال مختلفة
 * («فرع ديمشلت» / «ديمشلت» / «المنوفية» / «فرع المنيا»)، وده بيوحّدهم
 * في قائمة واحدة عشان فلتر الفرع في التحليلات يطلع صح.
 */
export const CANONICAL_BRANCHES = [
  'الفيوم',
  'ديمشلت',
  'منوف',
  'منيا القمح',
  'القاهرة',
  'البحيرة',
  'المنيا'
] as const;

export type CanonicalBranch = (typeof CANONICAL_BRANCHES)[number];

export const UNKNOWN_BRANCH = 'غير محدد';

const BRANCH_PATTERNS: Array<{ branch: CanonicalBranch; needles: string[] }> = [
  // لازم تتفحص قبل «المنيا» لأن الاسم بيحتوي «منيا»
  { branch: 'منيا القمح', needles: ['منياالقمح', 'منيالقمح', 'مالقمح', 'القمح'] },
  { branch: 'ديمشلت', needles: ['ديمشلت'] },
  { branch: 'منوف', needles: ['منوف'] },
  { branch: 'الفيوم', needles: ['الفيوم', 'فيوم', '16'] },
  { branch: 'القاهرة', needles: ['القاهره', 'قاهرة', 'cairo'] },
  { branch: 'البحيرة', needles: ['البحيره', 'بحيرة'] },
  { branch: 'المنيا', needles: ['المنيا', 'منيا'] }
];

function normalizeBranchText(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/(فرع|مخزن|منطقه|منطقة|مركز)/g, ' ')
    .replace(/[\s_\-\\/.,]+/g, '');
}

/** يرجّع الفرع المعتمد من أي نص، أو null لو النص مش تابع لفرع معروف. */
export function normalizeBranchName(raw?: string | null): CanonicalBranch | null {
  const text = normalizeBranchText(raw);
  if (!text) return null;
  const hit = BRANCH_PATTERNS.find((pattern) =>
    pattern.needles.some((needle) => text.includes(needle))
  );
  return hit ? hit.branch : null;
}

/** اسم الفرع النهائي للعرض/الفلترة (مع «غير محدد» كبديل). */
export function resolveBranchLabel(raw?: string | null): CanonicalBranch | string {
  return normalizeBranchName(raw) || UNKNOWN_BRANCH;
}
