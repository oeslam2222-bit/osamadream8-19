export interface VisitTypeConfigItem {
  id: 'تحصيل' | 'طلب بيع' | 'متابعة' | 'دورية';
  label: string;
  hint: string;
  requiredFields: Array<'customerId' | 'collectedAmount'>;
}

export const VISIT_TYPE_CONFIG: VisitTypeConfigItem[] = [
  {
    id: 'تحصيل',
    label: 'تحصيل',
    hint: 'أدخل المبلغ المحصل الفعلي وتأكد من مطابقة موقع المحل أو إرفاق صورة الكاميرا.',
    requiredFields: ['customerId', 'collectedAmount'],
  },
  {
    id: 'طلب بيع',
    label: 'طلب بيع',
    hint: 'سجّل أصناف الاحتياج وملاحظات العرض أو انتقل لإنشاء أمر البيع بعد التوثيق.',
    requiredFields: ['customerId'],
  },
  {
    id: 'متابعة',
    label: 'متابعة',
    hint: 'وثّق حالة المخزون لدى العميل وموعد التحصيل أو الطلبية المتوقعة.',
    requiredFields: ['customerId'],
  },
  {
    id: 'دورية',
    label: 'دورية',
    hint: 'مراجعة دورية لعرض المنتجات، جرد الأرفف، وتقييم التزام العميل.',
    requiredFields: ['customerId'],
  },
];

export const COMPLETION_STATUS_LABELS: Record<'completed' | 'partial' | 'postponed' | 'failed', string> = {
  completed: 'منفذة / مكتملة',
  partial: 'منفذة جزئيًا',
  postponed: 'مؤجلة',
  failed: 'لم تتم',
};

export const POSTPONEMENT_REASONS: string[] = [
  'العميل غير متواجد بالمحل حاليًا',
  'المسؤول المالي / صاحب المحل غير موجود',
  'طلب العميل تأجيل السداد لموعد لاحق',
  'المحل مغلق مؤقتًا وقت المرور',
  'مراجعة كشف الحساب قبل التحصيل أو الطلب',
  'أخرى (موضحة في الملاحظات)',
];

export const FAILURE_REASONS: string[] = [
  'المحل مغلق نهائيًا أو متوقف عن النشاط',
  'رفض العميل المقابلة أو التعامل',
  'عنوان العميل غير صحيح أو غير موجود',
  'تعذر الوصول للمنطقة لأسباب طارئة',
  'نزاع مالي أو إحالة للشؤون القانونية',
  'أخرى (موضحة في الملاحظات)',
];

export function getRequiredVisitFields(visitType: string): Array<'customerId' | 'collectedAmount'> {
  const matched = VISIT_TYPE_CONFIG.find((item) => item.id === visitType || item.label === visitType);
  if (matched) return matched.requiredFields;
  if (visitType.includes('تحصيل')) return ['customerId', 'collectedAmount'];
  return ['customerId'];
}

export function getVisitTypeHint(visitType: string): string {
  const matched = VISIT_TYPE_CONFIG.find((item) => item.id === visitType || item.label === visitType);
  return matched?.hint || '';
}
