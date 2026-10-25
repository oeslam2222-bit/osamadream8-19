import React, { useMemo } from 'react';
import { Check, Columns3, RotateCcw, X } from 'lucide-react';
import { CUSTOMER_COLUMNS, CustomerColumnKey } from '../../services/customerTableSchema';

interface CustomerTableSettingsProps {
  visibleColumns: CustomerColumnKey[];
  onToggleColumn: (key: CustomerColumnKey) => void;
  onResetColumns: () => void;
  onClose: () => void;
}

/**
 * إعدادات أعمدة جدول العملاء:
 * إظهار/إخفاء أي عمود، والاختيار بيتحفظ تلقائياً في إعدادات كل مستخدم.
 */
export const CustomerTableSettings: React.FC<CustomerTableSettingsProps> = ({
  visibleColumns,
  onToggleColumn,
  onResetColumns,
  onClose,
}) => {
  const groups = useMemo(() => {
    const map = new Map<string, typeof CUSTOMER_COLUMNS>();
    CUSTOMER_COLUMNS.forEach((item) => {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    });
    return Array.from(map.entries());
  }, []);

  return (
    <div className="ctl-backdrop" onClick={onClose}>
      <div
        className="ctl-modal"
        role="dialog"
        aria-modal="true"
        aria-label="إعدادات أعمدة جدول العملاء"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ctl-head">
          <div>
            <h3>إعدادات جدول العملاء</h3>
            <p>اختر الأعمدة اللي محتاج تعرضها — الاختيارات بتتحفظ تلقائياً في حسابك.</p>
          </div>
          <button type="button" className="ctl-close" onClick={onClose} aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="ctl-tabs" role="tablist">
          <span className="ctl-tab on" role="tab" aria-selected="true">
            <Columns3 className="w-4 h-4" />
            <span>الأعمدة الظاهرة</span>
            <span className="ctl-tab-count">{visibleColumns.length}</span>
          </span>
        </div>

        <div className="ctl-body">
          <div className="ctl-groups">
            {groups.map(([groupName, columns]) => (
              <section key={groupName} className="ctl-group">
                <h4>{groupName}</h4>
                <div className="ctl-columns">
                  {columns.map((item) => {
                    const checked = item.locked || visibleColumns.includes(item.key);
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
              الأعمدة المقفولة (الكود واسم العميل) بتفضل ظاهرة دائماً. اختياراتك بتنطبق فوراً على
              الجدول وبتتحفظ في إعداداتك.
            </div>
          </div>
        </div>

        <footer className="ctl-foot">
          <button type="button" className="app-btn app-btn-ghost px-3 py-2 text-xs" onClick={onResetColumns}>
            <RotateCcw className="w-3.5 h-3.5" />
            <span>الأعمدة الافتراضية</span>
          </button>
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
