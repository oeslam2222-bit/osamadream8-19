import React, { useCallback, useState } from 'react';

interface LazyPDFDownloadProps {
  invoice: any;
  className?: string;
  disabled?: boolean;
  label?: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

/**
 * زر تحميل PDF كسول — لا تُحمّل مكتبة jspdf/html2canvas إلا عند الضغطة الأولى.
 * هذا يخفّص حجم الحزمة الأساسية (~700 كيلو بايت) عن الموبايل والويب.
 */
export const LazyPDFDownload: React.FC<LazyPDFDownloadProps> = ({
  invoice,
  className = '',
  disabled = false,
  label = 'تحميل PDF',
  onSuccess,
  onError,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = useCallback(async () => {
    if (disabled || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { downloadInvoicePDF } = await import('../../services/pdfService');
      await downloadInvoicePDF(invoice);
      onSuccess?.();
    } catch (err: any) {
      const msg = err?.message || 'فشل تحميل ملف PDF';
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [invoice, disabled, onSuccess, onError]);

  if (error) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          handleDownload();
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
      onClick={handleDownload}
      disabled={disabled || loading}
      className={`text-xs font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg transition ${className}`}
    >
      {loading ? 'جاري التحميل…' : label}
    </button>
  );
};
