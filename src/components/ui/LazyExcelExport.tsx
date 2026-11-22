import React, { useCallback, useState } from 'react';

interface LazyExcelExportProps {
  data: any[];
  fileName: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

/**
 * زر تصدير Excel كسول — لا تُحمّل مكتبة xlsx-js-style (~870 كيلو بايت) إلا عند الضغطة.
 * يُستخدم في شاشات التقارير والتصدير فقط، فالتحميل الكسول يخفّض حجم الحملة الأساسية
 * للموبايل والويب بشكل ملحوظ.
 */
export const LazyExcelExport: React.FC<LazyExcelExportProps> = ({
  data,
  fileName,
  className = '',
  disabled = false,
  label = 'تصدير Excel',
  onSuccess,
  onError,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    if (disabled || loading) return;
    setLoading(true);
    setError(null);
    try {
      const XLSX = await import('xlsx-js-style');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        Object.keys(data[0] || {}),
        ...data.map((row) => Object.values(row)),
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'بيانات');
      XLSX.writeFile(wb, fileName);
      onSuccess?.();
    } catch (err: any) {
      const msg = err?.message || 'فشل تصدير ملف Excel';
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [data, fileName, disabled, onSuccess, onError]);

  if (error) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          handleExport();
        }}
        disabled={disabled}
        className={`text-xs font-bold text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition ${className}`}
      >
        إعادة المحاولة
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled || loading || !data?.length}
      className={`text-xs font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg transition ${className}`}
    >
      {loading ? 'جاري التصدير…' : label}
    </button>
  );
};
