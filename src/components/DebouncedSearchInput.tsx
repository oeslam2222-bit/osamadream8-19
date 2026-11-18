import React, { useEffect, useRef, useState } from 'react';

/**
 * خانة بحث معزولة بأداء موبايل — تُستخدم في كل الصفحات التقيلة.
 *
 * المشكلة اللي بتحلها: لما حالة البحث تكون في الصفحة نفسها، كل حرف
 * بيكتبه المستخدم بيعيد رسم الصفحة كاملة (جداول + KPIs + فلاتر على
 * آلاف السجلات) وده بيهنّج الموبايل.
 *
 * الحل: الكتابة فورية في state محلي، والتعديل بيوصل للصفحة مرة واحدة
 * بعد توقّف الكتابة (debounce — افتراضي 300ms). ولو الصفحة غيّرت القيمة
 * من بره (Reset أو استرجاع فلاتر محفوظة) بنعتمد التغيير فورًا.
 */
interface DebouncedSearchInputProps {
  /** القيمة المتحكم بها من الصفحة (مصدر الحقيقة النهائي) */
  value: string;
  /** بيوصَل له بعد توقّف الكتابة — مش مع كل حرف */
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /** زمن الانتظار بالمللي ثانية قبل تمرير القيمة للصفحة */
  delay?: number;
  type?: string;
  autoComplete?: string;
  dir?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const DebouncedSearchInput: React.FC<DebouncedSearchInputProps> = ({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
  delay = 300,
  type = 'search',
  autoComplete = 'off',
  dir,
  onFocus,
  onBlur,
}) => {
  const [local, setLocal] = useState(value);
  const lastSentRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // اعتماد التغييرات الخارجية فورًا (Reset / استرجاع فلاتر / مسح من بره)
  useEffect(() => {
    if (value !== lastSentRef.current) {
      lastSentRef.current = value;
      setLocal(value);
    }
  }, [value]);

  // تنظيف المؤقت عند الإزالة
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <input
      type={type}
      value={local}
      dir={dir}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          lastSentRef.current = v;
          onChange(v);
        }, delay);
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoComplete={autoComplete}
      className={className}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
};
