import React, { useMemo, useState } from 'react';
import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { Customer } from '../../types';
import {
  ActivityFilter,
  CollectionRateFilter,
  DealtFilter,
  DebtFilter,
  EligibilityFilter,
  OrderFilter,
  VisitFilter,
} from '../../services/customerFilterPredicates';

export interface CustomerFilterBarState {
  searchQuery: string;
  selectedBranch: string;
  selectedSupervisor: string;
  selectedRep: string;
  selectedRegion: string;
  eligibilityFilter: EligibilityFilter;
  debtStatusFilter: string;
  dealtFilter: DealtFilter;
  debtFilter: DebtFilter;
  activityFilter: ActivityFilter;
  orderFilter: OrderFilter;
  visitFilter: VisitFilter;
  collectionRateFilter: CollectionRateFilter;
}

export interface CustomerFilterBarOptions {
  branches: string[];
  supervisors: string[];
  reps: string[];
  regions: string[];
  debtStatuses: string[];
}

interface CustomerFilterBarProps {
  value: CustomerFilterBarState;
  onChange: (patch: Partial<CustomerFilterBarState>) => void;
  onReset: () => void;
  options: CustomerFilterBarOptions;
  canFilterBranch: boolean;
  canFilterRep: boolean;
  canFilterSupervisor: boolean;
  sortValue: string;
  onSortChange: (value: string) => void;
  resultCount: number;
  scopedCount: number;
  suggestions?: CustomerSearchSuggestion[];
  onSelectSuggestion?: (customer: Customer) => void;
  debtCustomersCount?: number;
}

export interface CustomerSearchSuggestion {
  id: string;
  code: string;
  name: string;
  phone?: string;
  region?: string;
  balanceLabel: string;
  status: { label: string; tone: 'ok' | 'warn' | 'risk' | 'muted' };
  customer: Customer;
}

const DEBT_LABELS: Record<string, string> = {
  has_debt: 'عليه مديونية',
  zero_debt: 'خالص الرصيد',
  over_limit: 'متجاوز الحد الائتماني',
  has_overdue: 'مستحقات واجبة السداد',
};

const ACTIVITY_LABELS: Record<string, string> = {
  active_2026: 'نشط 2026',
  inactive_2026: 'غير متعامل 2026',
  churn_risk: 'مهدد بالتوقف',
  new_customer: 'عميل جديد',
};

const ORDER_LABELS: Record<string, string> = {
  has_order: 'لديه طلبية',
  active_order: 'طلبية نشطة',
  no_order: 'بدون طلبيات',
};

const VISIT_LABELS: Record<string, string> = {
  visited_2026: 'تمت زيارته',
  not_visited: 'لم يُزَر',
};

const DEALT_LABELS: Record<string, string> = {
  dealt_2026: 'متعامل 2026',
  not_dealt_2026: 'غير متعامل',
};

const COLLECTION_LABELS: Record<string, string> = {
  high_80: 'تحصيل ممتاز (≥80%)',
  medium_30_79: 'تحصيل متوسط (30%-79%)',
  low_zero: 'تحصيل ضعيف (<30%)',
};

const SORT_OPTIONS = [
  { value: 'balance:desc', label: 'الأكثر مديونية' },
  { value: 'balance:asc', label: 'الأقل مديونية' },
  { value: 'overdue:desc', label: 'الأكثر تأخراً' },
  { value: 'lastVisit:desc', label: 'الأحدث تحديثاً' },
  { value: 'name:asc', label: 'الاسم (أ - ي)' },
];

/**
 * شريط فلترة العملاء (نسخة واحدة تعمل على الموبايل والديسكتوب).
 * كل الشروط بتتغيّر من هنا، والفلاتر المتقدمة مطوية افتراضياً
 * عشان الشاشة تفضل نظيفة والشرائح السريعة تكون أول حاجة قدام المستخدم.
 */
export const CustomerFilterBar: React.FC<CustomerFilterBarProps> = ({
  value,
  onChange,
  onReset,
  options,
  canFilterBranch,
  canFilterRep,
  canFilterSupervisor,
  sortValue,
  onSortChange,
  resultCount,
  scopedCount,
  suggestions = [],
  onSelectSuggestion,
  debtCustomersCount,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const advancedCount = [
    value.selectedBranch,
    value.selectedSupervisor,
    value.selectedRep,
    value.selectedRegion,
    value.eligibilityFilter,
  ].filter((item) => item !== 'ALL').length;

  const activeTags = useMemo(() => {
    const tags: Array<{ key: keyof CustomerFilterBarState; label: string }> = [];
    if (value.searchQuery.trim()) tags.push({ key: 'searchQuery', label: `بحث: ${value.searchQuery.trim()}` });
    if (value.selectedBranch !== 'ALL') tags.push({ key: 'selectedBranch', label: `الفرع: ${value.selectedBranch}` });
    if (value.selectedSupervisor !== 'ALL') tags.push({ key: 'selectedSupervisor', label: `المشرف: ${value.selectedSupervisor}` });
    if (value.selectedRep !== 'ALL') tags.push({ key: 'selectedRep', label: `المندوب: ${value.selectedRep}` });
    if (value.selectedRegion !== 'ALL') tags.push({ key: 'selectedRegion', label: `المنطقة: ${value.selectedRegion}` });
    if (value.eligibilityFilter !== 'ALL') tags.push({ key: 'eligibilityFilter', label: `التصنيف: ${value.eligibilityFilter}` });
    if (value.debtStatusFilter !== 'ALL') tags.push({ key: 'debtStatusFilter', label: `حالة السداد: ${value.debtStatusFilter}` });
    if (value.dealtFilter !== 'ALL') tags.push({ key: 'dealtFilter', label: DEALT_LABELS[value.dealtFilter] || value.dealtFilter });
    if (value.debtFilter !== 'ALL') tags.push({ key: 'debtFilter', label: DEBT_LABELS[value.debtFilter] || value.debtFilter });
    if (value.activityFilter !== 'ALL') tags.push({ key: 'activityFilter', label: ACTIVITY_LABELS[value.activityFilter] || value.activityFilter });
    if (value.orderFilter !== 'ALL') tags.push({ key: 'orderFilter', label: ORDER_LABELS[value.orderFilter] || value.orderFilter });
    if (value.visitFilter !== 'ALL') tags.push({ key: 'visitFilter', label: VISIT_LABELS[value.visitFilter] || value.visitFilter });
    if (value.collectionRateFilter !== 'ALL') {
      tags.push({
        key: 'collectionRateFilter',
        label: COLLECTION_LABELS[value.collectionRateFilter] || value.collectionRateFilter,
      });
    }
    return tags;
  }, [value]);

  const hasAnyFilter = activeTags.length > 0;

  return (
    <section className="cf-bar" aria-label="فلترة العملاء">
      {/* رأس الشريط */}
      <div className="cf-bar-head">
        <div className="cf-bar-title">
          <span className="cf-bar-icon" aria-hidden="true">
            <SlidersHorizontal className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="cf-bar-h">فلترة ذكية للعملاء</h2>
            <p className="cf-bar-sub">
              <strong className="app-num">{resultCount.toLocaleString()}</strong>
              <span> من {scopedCount.toLocaleString()} عميل داخل صلاحياتك</span>
            </p>
          </div>
        </div>

        <div className="cf-bar-actions">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
            aria-controls="customer-advanced-filters"
            className={`app-btn px-3 py-2 text-xs ${advancedOpen ? 'app-btn-primary' : 'app-btn-ghost'}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>فلاتر متقدمة</span>
            {advancedCount > 0 && <span className="cf-badge">{advancedCount}</span>}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onReset}
            disabled={!hasAnyFilter}
            className="app-btn app-btn-ghost px-3 py-2 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>مسح الكل</span>
          </button>
        </div>
      </div>

      {/* البحث الفوري */}
      <div className="cf-search">
        <Search className="cf-search-ico" aria-hidden="true" />
        <input
          type="search"
          value={value.searchQuery}
          onChange={(event) => onChange({ searchQuery: event.target.value })}
          placeholder="ابحث بالاسم، كود العميل، الهاتف، المنطقة، المندوب أو أوراق الضمان..."
          aria-label="البحث في العملاء"
          autoComplete="off"
          onFocus={() => setSearchFocused(true)}
          onBlur={() => window.setTimeout(() => setSearchFocused(false), 140)}
        />
        {value.searchQuery && (
          <button
            type="button"
            onClick={() => onChange({ searchQuery: '' })}
            className="cf-search-clear"
            aria-label="مسح البحث"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {searchFocused && value.searchQuery.trim() && suggestions.length > 0 && (
          <ul className="cf-suggest" role="listbox" aria-label="اقتراحات العملاء">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  role="option"
                  className="cf-suggest-item"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelectSuggestion?.(suggestion.customer);
                    setSearchFocused(false);
                  }}
                >
                  <span className="cf-suggest-avatar" aria-hidden="true">
                    {suggestion.name.slice(0, 1)}
                  </span>
                  <span className="cf-suggest-text">
                    <span className="cf-suggest-name">{suggestion.name}</span>
                    <span className="cf-suggest-meta">
                      {suggestion.code}
                      {suggestion.region ? ` • ${suggestion.region}` : ''}
                    </span>
                  </span>
                  <span className="cf-suggest-side">
                    <span className={`pill pill-${suggestion.status.tone}`}>{suggestion.status.label}</span>
                    <span className="cf-suggest-amount app-num">{suggestion.balanceLabel}</span>
                  </span>
                </button>
              </li>
            ))}
            <li className="cf-suggest-hint">أول 5 نتائج مطابقة — اضغط أي عميل لعرض ملفه</li>
          </ul>
        )}
      </div>

      {/* الترتيب + إظهار المديونيات فقط */}
      <div className="cf-quick">
        <label className="cf-field cf-field-quick">
          <span>الترتيب</span>
          <select value={sortValue} onChange={(event) => onSortChange(event.target.value)}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className={`cf-switch ${value.debtFilter === 'has_debt' ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={value.debtFilter === 'has_debt'}
            onChange={(event) => onChange({ debtFilter: event.target.checked ? 'has_debt' : 'ALL' })}
          />
          <span className="cf-switch-track" aria-hidden="true">
            <span className="cf-switch-thumb" />
          </span>
          <span className="cf-switch-text">
            <strong>
              إظهار المديونيات فقط
              {typeof debtCustomersCount === 'number' && (
                <span className="cf-switch-count app-num">{debtCustomersCount.toLocaleString()}</span>
              )}
            </strong>
            <small>العملاء اللي عليهم رصيد مدين أكبر من صفر</small>
          </span>
        </label>
      </div>

      {/* الفلاتر المتقدمة */}
      {advancedOpen && (
        <div id="customer-advanced-filters" className="cf-advanced">
          <div className="cf-grid">
            {canFilterBranch && options.branches.length > 0 && (
              <label className="cf-field">
                <span>الفرع</span>
                <select
                  value={value.selectedBranch}
                  onChange={(event) => onChange({ selectedBranch: event.target.value, selectedRep: 'ALL' })}
                >
                  <option value="ALL">جميع الفروع</option>
                  {options.branches.map((branch) => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
              </label>
            )}

            {canFilterSupervisor && options.supervisors.length > 0 && (
              <label className="cf-field">
                <span>المشرف</span>
                <select
                  value={value.selectedSupervisor}
                  onChange={(event) => onChange({ selectedSupervisor: event.target.value })}
                >
                  <option value="ALL">جميع المشرفين</option>
                  {options.supervisors.map((supervisor) => (
                    <option key={supervisor} value={supervisor}>{supervisor}</option>
                  ))}
                </select>
              </label>
            )}

            {canFilterRep && (
              <label className="cf-field">
                <span>المندوب</span>
                <select
                  value={value.selectedRep}
                  onChange={(event) => onChange({ selectedRep: event.target.value })}
                >
                  <option value="ALL">جميع المناديب</option>
                  {options.reps.map((rep) => (
                    <option key={rep} value={rep}>{rep}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="cf-field">
              <span>التصنيف</span>
              <select
                value={value.eligibilityFilter}
                onChange={(event) => onChange({ eligibilityFilter: event.target.value as EligibilityFilter })}
              >
                <option value="ALL">الكل</option>
                <option value="قابل">قابل للتعامل</option>
                <option value="غير قابل">غير قابل / موقوف</option>
              </select>
            </label>

          </div>
        </div>
      )}

      {/* الفلاتر النشطة */}
      {activeTags.length > 0 && (
        <div className="cf-tags" aria-label="الفلاتر النشطة">
          <span className="cf-tags-label">فلاتر نشطة:</span>
          {activeTags.map((tag) => (
            <button
              key={tag.key}
              type="button"
              onClick={() =>
                onChange({
                  [tag.key]: tag.key === 'searchQuery' ? '' : 'ALL',
                } as Partial<CustomerFilterBarState>)
              }
              className="cf-tag"
              title="إزالة هذا الفلتر"
            >
              <span className="truncate max-w-[190px]">{tag.label}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
          <button type="button" onClick={onReset} className="cf-tag cf-tag-reset">
            مسح الكل
          </button>
        </div>
      )}
    </section>
  );
};

export default CustomerFilterBar;
