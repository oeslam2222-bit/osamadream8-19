export type VisitCompletionStatus = 'completed' | 'partial' | 'postponed' | 'failed';

export const VISIT_TYPE_CONFIG: Array<{
  id: string;
  label: string;
  requiredFields?: Array<'collectedAmount' | 'notes'>;
  hint?: string;
}> = [
  { id: 'دورية', label: 'زيارة دورية', hint: 'متابعة عامة وحالة العميل' },
  { id: 'تحصيل', label: 'زيارة تحصيل', requiredFields: ['collectedAmount'], hint: 'سجّل مبلغ التحصيل الفعلي' },
  { id: 'طلب بيع', label: 'طلب بيع وتوريد', hint: 'توثيق الطلب/الاحتياج والمتابعة' },
  { id: 'متابعة', label: 'متابعة حساب', hint: 'متابعة مديونية/التزام/تسوية' },
];

export const POSTPONEMENT_REASONS = [
  'العميل غير متواجد',
  'طلب تأجيل السداد',
  'ازدحام/انشغال العميل',
  'مشكلة في المخزون/التسليم',
  'إعادة جدولة بموافقة',
  'أخرى',
];

export const FAILURE_REASONS = [
  'المحل مغلق',
  'رفض الاستلام/المقابلة',
  'عنوان/موقع غير صحيح',
  'تعذر الوصول ضمن المسار',
  'مشكلة أمنية/طارئة',
  'أخرى',
];

export const COMPLETION_STATUS_LABELS: Record<VisitCompletionStatus, string> = {
  completed: 'منفذة/مكتملة',
  partial: 'منفذة جزئيًا',
  postponed: 'مؤجلة',
  failed: 'لم تتم',
};

export function getVisitTypeHint(type: string): string | undefined {
  return VISIT_TYPE_CONFIG.find(t => t.id === type)?.hint;
}

export function getRequiredVisitFields(type: string): Array<'collectedAmount' | 'notes'> {
  return VISIT_TYPE_CONFIG.find(t => t.id === type)?.requiredFields || [];
}
