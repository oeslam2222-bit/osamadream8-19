import React, { useMemo, useState } from 'react';
import { Check, Columns3, Filter, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import {
  CUSTOMER_COLUMNS,
  ColumnFilter,
  ColumnFilterOperator,
  CustomerColumnKey,
  getColumnDef,
  getOperatorsForColumn,
} from '../../services/customerTableSchema';

interface CustomerTableSettingsProps {
  visibleColumns: CustomerColumnKey[];
  onToggleColumn: (key: CustomerColumnKey) => void;
  onResetColumns: () => void;
  filters: ColumnFilter[];
  onAddFilter: (filter: Omit<ColumnFilter, 'id'>) => void;
  onRemoveFilter: (id: string) => void;
  onClearFilters: () => void;
  columnOptions?: Partial<Record<CustomerColumnKey, string[]>>;
  initialTab?: 'columns' | 'filters';
  onClose: () => void;
}

/**
 * إعدادات جدول العملاء:
 *  - اختيار الأعمدة الظاهرة (بيتحفظ لكل مستخدم).
 *  - بناء فلتر مخصص على أي عمود من أعمدة الشيت بقيم مستخرجة من البيانات نفسها.
 */
export const CustomerTableSettings: React.FC<CustomerTableSettingsProps> = ({
  visibleColumns,
  onToggleColumn,
  onResetColumns,
  filters,
  onAddFilter,
  onRemoveFilter,
  onClearFilters,
  columnOptions = {},
  initialTab = 'columns',
  onClose,
}) => {
  const [tab, setTab] = useState<'columns' | 'filters'>(initialTab);
  const [column, setColumn] = useState<CustomerColumnKey>('region');
  const [operator, setOperator] = useState<ColumnFilterOperator>('contains');
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');

  const operators = useMemo(() => getOperatorsForColumn(column), [column]);
  const activeOperator = operators.find((item) => item.value === operator) || operators[0];
  const def = getColumnDef(column);
  const options = columnOptions[column] || [];

  const groups = useMemo(() => {
    const map = new Map<string, typeof CUSTOMER_COLUMNS>();
    CUSTOMER_COLUMNS.forEach((item) => {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    });
    return Array.from(map.entries());
  }, []);

  const canAdd =
    !!def &&
    (activeOperator?.needsValue
      ? value.trim().length > 0 && (!activeOperator.needsSecondValue || value2.trim().length > 0)
      : true);

  const handleAdd = () => {
    if (!canAdd) return;
    onAddFilter({
      column,
      operator: activeOperator.value,
      value: activeOperator.needsValue ? value.trim() : '',
      value2: activeOperator.needsSecondValue ? value2.trim() : undefined,
    });
    setValue('');
    setValue2('');
  };

  const handleColumnChange = (next: CustomerColumnKey) => {
    setColumn(next);
    setValue('');
    setValue2('');
    const nextOperators = getOperatorsForColumn(next);
    setOperator(nextOperators[0].value);
  };

  return (
    <div className="ctl-backdrop" onClick={onClose}>
      <div
        className="ctl-modal"
        role="dialog"
        aria-modal="true"
        aria-label="إعدادات أعمدة وفلاتر العملاء"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ctl-head">
          <div>
            <h3>إعدادات جدول العملاء</h3>
            <p>اختر الأعمدة الظاهرة، واعمل فلتر مخصص على أي عمود من بيانات الشيت.</p>
          </div>
          <button type="button" className="ctl-close" onClick={onClose} aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="ctl-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'columns'}
            className={`ctl-tab ${tab === 'columns' ? 'on' : ''}`}
            onClick={() => setTab('columns')}
          >
            <Columns3 className="w-4 h-4" />
            <span>الأعمدة</span>
            <span className="ctl-tab-count">{visibleColumns.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'filters'}
            className={`ctl-tab ${tab === 'filters' ? 'on' : ''}`}
            onClick={() => setTab('filters')}
          >
            <Filter className="w-4 h-4" />
            <span>فلاتر مخصصة</span>
            {filters.length > 0 && <span className="ctl-tab-count">{filters.length}</span>}
          </button>
        </div>

        <div className="ctl-body">
          {tab === 'columns' && (
            <div className="ctl-groups">
              {groups.map(([groupName, columns]) => (
                <section key={groupName} className="ctl-group">
                  <h4>{groupName}</h4>
                  <div className="ctl-columns">
                    {columns.map((item) => {
                      const checked = visibleColumns.includes(item.key);
                      return (
                        <label
                          key={item.key}
                          className={`ctl-column ${checked ? 'on' : ''} ${item.locked ? 'is-locked' : ''}`}
                          title={item.locked ? 'عمود أساسي لا يمكن إخفاؤه' : item.label}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={item.locked}
                            onChange={() => onToggleColumn(item.key)}
                          />
                          <span className="ctl-check">{checked && <Check className="w-3 h-3" />}</span>
                          <span className="ctl-column-label">{item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div className="ctl-note">
                الأعمدة المقفولة (الكود واسم العميل) بتفضل ظاهرة دائماً، وكل الاختيارات بتتحفظ تلقائياً
                في إعدادات حسابك.
              </div>
            </div>
          )}

          {tab === 'filters' && (
            <div className="ctl-filters">
              <div className="ctl-builder">
                <label className="cf-field">
                  <span>العمود</span>
                  <select
                    value={column}
                    onChange={(event) => handleColumnChange(event.target.value as CustomerColumnKey)}
                  >
                    {CUSTOMER_COLUMNS.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.group} — {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="cf-field">
                  <span>العملية</span>
                  <select
                    value={activeOperator.value}
                    onChange={(event) => setOperator(event.target.value as ColumnFilterOperator)}
                  >
                    {operators.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>

                {activeOperator.needsValue && (
                  <label className="cf-field">
                    <span>{def && (def.type === 'number' || def.type === 'currency') ? 'القيمة (رقم)' : 'القيمة'}</span>
                    <input
                      type={def && (def.type === 'number' || def.type === 'currency') ? 'number' : 'text'}
                      list={options.length > 0 ? `ctl-options-${column}` : undefined}
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleAdd();
                      }}
                      placeholder={options.length > 0 ? 'اختر من قيم الشيت أو اكتب' : 'اكتب القيمة'}
                    />
                    {options.length > 0 && (
                      <datalist id={`ctl-options-${column}`}>
                        {options.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    )}
                  </label>
                )}

                {activeOperator.needsSecondValue && (
                  <label className="cf-field">
                    <span>إلى قيمة</span>
                    <input type="number" value={value2} onChange={(event) => setValue2(event.target.value)} />
                  </label>
                )}

                <button type="button" className="app-btn app-btn-primary ctl-add" onClick={handleAdd} disabled={!canAdd}>
                  <Plus className="w-4 h-4" />
                  <span>إضافة الفلتر</span>
                </button>
              </div>

              {filters.length === 0 ? (
                <div className="ctl-empty">
                  لا توجد فلاتر مخصصة. اختر عمود وقيمة من بيانات الشيت ثم اضغط «إضافة الفلتر».
                </div>
              ) : (
                <ul className="ctl-filter-list">
                  {filters.map((item) => {
                    const itemDef = getColumnDef(item.column);
                    const operatorsForItem = getOperatorsForColumn(item.column);
                    const operatorLabel =
                      operatorsForItem.find((operatorItem) => operatorItem.value === item.operator)?.label ||
                      item.operator;
                    return (
                      <li key={item.id}>
                        <span className="ctl-filter-text">
                          <strong>{itemDef?.label || item.column}</strong>
                          <em>{operatorLabel}</em>
                          {item.value && <b>{item.value}</b>}
                          {item.value2 && <b> — {item.value2}</b>}
                        </span>
                        <button
                          type="button"
                          className="ctl-filter-remove"
                          onClick={() => onRemoveFilter(item.id)}
                          aria-label="حذف الفلتر"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="ctl-foot">
          {tab === 'columns' ? (
            <button type="button" className="app-btn app-btn-ghost px-3 py-2 text-xs" onClick={onResetColumns}>
              <RotateCcw className="w-3.5 h-3.5" />
              <span>الأعمدة الافتراضية</span>
            </button>
          ) : (
            <button
              type="button"
              className="app-btn app-btn-ghost px-3 py-2 text-xs"
              onClick={onClearFilters}
              disabled={filters.length === 0}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>مسح كل الفلاتر المخصصة</span>
            </button>
          )}
          <span className="ctl-saved">يتم الحفظ تلقائياً في إعداداتك</span>
          <button type="button" className="app-btn app-btn-primary px-4 py-2 text-xs" onClick={onClose}>
            <Check className="w-3.5 h-3.5" />
            <span>تم</span>
          </button>
        </footer>
      </div>
    </div>
  );
};

export default CustomerTableSettings;
