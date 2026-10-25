import { Customer } from '../types';
import { normalizeArabicText } from './arabicMatchingService';
import {
  getCustomerBalance,
  getCustomerCollectionRate,
  getCustomerOverdue,
  getCustomerStatusBadge,
  isDealtCustomer,
} from './customerFilterPredicates';

/**
 * مخطط أعمدة جدول العملاء + الفلاتر المخصصة.
 *
 * كل عمود هنا ليه تعريف واحد بيستخدمه:
 *  - رأس الجدول (العنوان، الترتيب، المساحة)
 *  - إعدادات الأعمدة (إظهار/إخفاء + الحفظ)
 *  - الفلتر المخصص (نوع القيمة + القيم المتاحة من بيانات الشيت)
 */

export type CustomerColumnKey =
  | 'code'
  | 'name'
  | 'region'
  | 'rep'
  | 'branch'
  | 'phone'
  | 'debt'
  | 'creditLimit'
  | 'paid'
  | 'overdue'
  | 'collectionRate'
  | 'status'
  | 'dealt'
  | 'eligibility'
  | 'paymentTerms'
  | 'activityType'
  | 'guarantee'
  | 'sales2026'
  | 'collections2026'
  | 'lastTouch'
  | 'visits'
  | 'orders';

export type CustomerColumnType = 'text' | 'number' | 'currency' | 'status';
export type CustomerSortKey =
  | 'code'
  | 'name'
  | 'balance'
  | 'overdue'
  | 'creditLimit'
  | 'sales2026'
  | 'collections2026'
  | 'lastVisit'
  | 'order';

export interface CustomerColumnDef {
  key: CustomerColumnKey;
  label: string;
  group: 'الأساسية' | 'المالية' | 'الحالة والتصنيف' | 'النشاط والمتابعة';
  type: CustomerColumnType;
  align: 'start' | 'center' | 'end';
  sortKey?: CustomerSortKey;
  defaultVisible: boolean;
  /** أعمدة أساسية لا يمكن إخفاؤها (الكود والاسم). */
  locked?: boolean;
}

export const CUSTOMER_COLUMNS: CustomerColumnDef[] = [
  { key: 'code', label: 'الكود', group: 'الأساسية', type: 'text', align: 'start', sortKey: 'code', defaultVisible: true, locked: true },
  { key: 'name', label: 'اسم العميل / المحل', group: 'الأساسية', type: 'text', align: 'start', sortKey: 'name', defaultVisible: true, locked: true },
  { key: 'region', label: 'المنطقة / الفرع', group: 'الأساسية', type: 'text', align: 'start', defaultVisible: true },
  { key: 'rep', label: 'المندوب', group: 'الأساسية', type: 'text', align: 'start', defaultVisible: true },
  { key: 'branch', label: 'الفرع', group: 'الأساسية', type: 'text', align: 'start', defaultVisible: false },
  { key: 'phone', label: 'الهاتف', group: 'الأساسية', type: 'text', align: 'start', defaultVisible: false },
  { key: 'debt', label: 'المديونية والحد الائتماني', group: 'المالية', type: 'currency', align: 'end', sortKey: 'balance', defaultVisible: true },
  { key: 'creditLimit', label: 'الحد الائتماني', group: 'المالية', type: 'currency', align: 'end', sortKey: 'creditLimit', defaultVisible: false },
  { key: 'paid', label: 'إجمالي المسدد', group: 'المالية', type: 'currency', align: 'end', sortKey: 'collections2026', defaultVisible: true },
  { key: 'overdue', label: 'المتبقي / المتأخرات', group: 'المالية', type: 'currency', align: 'end', sortKey: 'overdue', defaultVisible: true },
  { key: 'collectionRate', label: 'كفاءة التحصيل %', group: 'المالية', type: 'number', align: 'end', defaultVisible: false },
  { key: 'sales2026', label: 'مبيعات 2026', group: 'المالية', type: 'currency', align: 'end', sortKey: 'sales2026', defaultVisible: false },
  { key: 'collections2026', label: 'تحصيلات 2026', group: 'المالية', type: 'currency', align: 'end', sortKey: 'collections2026', defaultVisible: false },
  { key: 'status', label: 'حالة السداد', group: 'الحالة والتصنيف', type: 'status', align: 'center', defaultVisible: true },
  { key: 'dealt', label: 'التعامل', group: 'الحالة والتصنيف', type: 'status', align: 'center', defaultVisible: true },
  { key: 'eligibility', label: 'التصنيف (قابل / غير قابل)', group: 'الحالة والتصنيف', type: 'status', align: 'center', defaultVisible: false },
  { key: 'paymentTerms', label: 'طريقة الدفع', group: 'الحالة والتصنيف', type: 'text', align: 'start', defaultVisible: false },
  { key: 'guarantee', label: 'أوراق الضمان', group: 'الحالة والتصنيف', type: 'text', align: 'start', defaultVisible: false },
  { key: 'activityType', label: 'طبيعة النشاط', group: 'النشاط والمتابعة', type: 'text', align: 'start', defaultVisible: false },
  { key: 'lastTouch', label: 'آخر تحديث', group: 'النشاط والمتابعة', type: 'text', align: 'center', sortKey: 'lastVisit', defaultVisible: true },
  { key: 'visits', label: 'عدد الزيارات 2026', group: 'النشاط والمتابعة', type: 'number', align: 'center', defaultVisible: false },
  { key: 'orders', label: 'عدد الطلبيات', group: 'النشاط والمتابعة', type: 'number', align: 'center', sortKey: 'order', defaultVisible: false },
];

export const getColumnDef = (key: CustomerColumnKey): CustomerColumnDef | undefined =>
  CUSTOMER_COLUMNS.find((column) => column.key === key);

const monthlySalesTotal = (c: Customer): number => {
  if (!c.monthlySales2026) return 0;
  return Object.values(c.monthlySales2026).reduce((sum, value) => sum + (Number(value) || 0), 0);
};

export const getCustomerSales2026 = (c: Customer): number =>
  Math.max(c.sales2026 || 0, c.totalMonthlySales || 0, c.totalOverallSales || 0, monthlySalesTotal(c));

export const getCustomerPaid = (c: Customer): number => {
  const monthly = c.monthlyCollections2026
    ? Object.values(c.monthlyCollections2026).reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0)
    : 0;
  return Math.max(
    Math.abs(Number(c.collections2026) || 0),
    Math.abs(Number(c.totalMonthlyCollections) || 0),
    Math.abs(Number(c.totalOverallCollections) || 0),
    monthly
  );
};

/** قيمة العمود كنص أو رقم — تُستخدم في الفلترة المخصصة. */
export const getCustomerColumnValue = (
  c: Customer,
  key: CustomerColumnKey
): string | number => {
  switch (key) {
    case 'code':
      return c.code || '';
    case 'name':
      return c.name || '';
    case 'region':
      return c.region || c.district || c.branchName || '';
    case 'rep':
      return c.salesRepName || c.repName || '';
    case 'branch':
      return c.branchName || '';
    case 'phone':
      return c.phone || '';
    case 'debt':
      return getCustomerBalance(c);
    case 'creditLimit':
      return c.creditLimit || 0;
    case 'paid':
      return getCustomerPaid(c);
    case 'overdue':
      return getCustomerOverdue(c);
    case 'collectionRate':
      return Math.round(getCustomerCollectionRate(c));
    case 'status':
      return getCustomerStatusBadge(c).label;
    case 'dealt':
      return isDealtCustomer(c) ? 'متعامل' : 'غير متعامل';
    case 'eligibility':
      return (c.dealEligibility || '').trim() || 'غير محدد';
    case 'paymentTerms':
      return (c.paymentTerms || '').trim() || 'غير محدد';
    case 'activityType':
      return (c.activityType || '').trim() || 'غير محدد';
    case 'guarantee':
      return (c.guaranteeDocs || '').trim() || 'لا يوجد';
    case 'sales2026':
      return getCustomerSales2026(c);
    case 'collections2026':
      return Math.abs(Number(c.collections2026) || 0);
    case 'lastTouch':
      return c.lastVisitDate || c.lastOrderDate || c.lastCollectionDate || '';
    case 'visits':
      return c.visitCount2026 || 0;
    case 'orders':
      return c.totalOrdersCount || 0;
    default:
      return '';
  }
};

export const getCustomerColumnText = (c: Customer, key: CustomerColumnKey): string => {
  const value = getCustomerColumnValue(c, key);
  return typeof value === 'number' ? String(value) : value;
};

/* -------------------------------------------------------------------------- */
/*                            الفلاتر المخصصة                                */
/* -------------------------------------------------------------------------- */

export type ColumnFilterOperator =
  | 'contains'
  | 'equals'
  | 'notEquals'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'between'
  | 'empty'
  | 'notEmpty';

export interface ColumnFilterOperatorDef {
  value: ColumnFilterOperator;
  label: string;
  types: Array<'text' | 'number'>;
  needsValue: boolean;
  needsSecondValue?: boolean;
}

export const COLUMN_FILTER_OPERATORS: ColumnFilterOperatorDef[] = [
  { value: 'contains', label: 'يحتوي على', types: ['text'], needsValue: true },
  { value: 'equals', label: 'يساوي', types: ['text'], needsValue: true },
  { value: 'notEquals', label: 'لا يساوي', types: ['text'], needsValue: true },
  { value: 'empty', label: 'فارغ', types: ['text'], needsValue: false },
  { value: 'notEmpty', label: 'غير فارغ', types: ['text'], needsValue: false },
  { value: 'equals', label: 'يساوي', types: ['number'], needsValue: true },
  { value: 'gt', label: 'أكبر من', types: ['number'], needsValue: true },
  { value: 'gte', label: 'أكبر من أو يساوي', types: ['number'], needsValue: true },
  { value: 'lt', label: 'أقل من', types: ['number'], needsValue: true },
  { value: 'lte', label: 'أقل من أو يساوي', types: ['number'], needsValue: true },
  { value: 'between', label: 'بين', types: ['number'], needsValue: true, needsSecondValue: true },
];

export const getOperatorsForColumn = (key: CustomerColumnKey) => {
  const def = getColumnDef(key);
  const type: 'text' | 'number' =
    def && (def.type === 'currency' || def.type === 'number') ? 'number' : 'text';
  return COLUMN_FILTER_OPERATORS.filter((operator) => operator.types.includes(type));
};

export interface ColumnFilter {
  id: string;
  column: CustomerColumnKey;
  operator: ColumnFilterOperator;
  value: string;
  value2?: string;
}

const toNumber = (value: string): number | null => {
  const cleaned = value.replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

export const matchesColumnFilter = (c: Customer, filter: ColumnFilter): boolean => {
  const raw = getCustomerColumnValue(c, filter.column);
  const isNumeric = typeof raw === 'number';

  if (filter.operator === 'empty') return !isNumeric && !String(raw).trim();
  if (filter.operator === 'notEmpty') return isNumeric || !!String(raw).trim();

  if (isNumeric) {
    const target = toNumber(filter.value);
    if (target === null) return true;
    const second = filter.value2 !== undefined ? toNumber(filter.value2) : null;

    switch (filter.operator) {
      case 'equals':
        return raw === target;
      case 'gt':
        return raw > target;
      case 'gte':
        return raw >= target;
      case 'lt':
        return raw < target;
      case 'lte':
        return raw <= target;
      case 'between':
        return second === null ? raw >= target : raw >= target && raw <= second;
      default:
        return true;
    }
  }

  const text = normalizeArabicText(String(raw));
  const needle = normalizeArabicText(filter.value);

  switch (filter.operator) {
    case 'contains':
      return !needle || text.includes(needle);
    case 'equals':
      return text === needle;
    case 'notEquals':
      return text !== needle;
    default:
      return true;
  }
};

export const matchesColumnFilters = (c: Customer, filters: ColumnFilter[]): boolean =>
  filters.every((filter) => matchesColumnFilter(c, filter));

/* -------------------------------------------------------------------------- */
/*                     الحفظ في الإعدادات (لكل مستخدم)                        */
/* -------------------------------------------------------------------------- */

const COLUMNS_KEY = 'dream_customer_visible_columns_v1';
const FILTERS_KEY = 'dream_customer_column_filters_v1';

const scopedKey = (base: string, userId?: string) => `${base}:${userId || 'guest'}`;

export const getDefaultVisibleColumns = (): CustomerColumnKey[] =>
  CUSTOMER_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key);

export const loadVisibleColumns = (userId?: string): CustomerColumnKey[] => {
  try {
    const stored = localStorage.getItem(scopedKey(COLUMNS_KEY, userId));
    if (!stored) return getDefaultVisibleColumns();
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return getDefaultVisibleColumns();
    const valid = parsed.filter((key): key is CustomerColumnKey =>
      CUSTOMER_COLUMNS.some((column) => column.key === key)
    );
    // الأعمدة المقفولة بتتحافظ دائماً
    CUSTOMER_COLUMNS.filter((column) => column.locked).forEach((column) => {
      if (!valid.includes(column.key)) valid.push(column.key);
    });
    return valid;
  } catch {
    return getDefaultVisibleColumns();
  }
};

export const saveVisibleColumns = (columns: CustomerColumnKey[], userId?: string): void => {
  try {
    localStorage.setItem(scopedKey(COLUMNS_KEY, userId), JSON.stringify(columns));
  } catch {
    /* التخزين ممتلئ أو محجوب — الشاشة تفضل شغالة بالافتراضي */
  }
};

export const loadColumnFilters = (userId?: string): ColumnFilter[] => {
  try {
    const stored = localStorage.getItem(scopedKey(FILTERS_KEY, userId));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (filter: any) =>
        filter &&
        typeof filter.id === 'string' &&
        CUSTOMER_COLUMNS.some((column) => column.key === filter.column) &&
        COLUMN_FILTER_OPERATORS.some((operator) => operator.value === filter.operator)
    ) as ColumnFilter[];
  } catch {
    return [];
  }
};

export const saveColumnFilters = (filters: ColumnFilter[], userId?: string): void => {
  try {
    localStorage.setItem(scopedKey(FILTERS_KEY, userId), JSON.stringify(filters));
  } catch {
    /* تجاهل */
  }
};
