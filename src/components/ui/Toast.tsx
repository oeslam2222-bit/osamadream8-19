import React, { useCallback, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, Mail, Send, ShoppingCart, Receipt } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  toasts: ToastItem[];
}

const TOAST_LIMIT = 5;
const REMOVE_DELAY = 1000;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 9);
    const newToast: ToastItem = { ...toast, id, duration: toast.duration ?? 4000 };

    setToasts((prev) => {
      const next = [...prev, newToast].slice(-TOAST_LIMIT);
      return next;
    });

    // Auto remove after duration
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, newToast.duration + REMOVE_DELAY);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />;
      case 'info': return <Info className="w-5 h-5 text-blue-600 shrink-0" />;
    }
  };

  const getBg = (type: ToastType) => {
    switch (type) {
      case 'success': return 'bg-emerald-50 border-emerald-200';
      case 'error': return 'bg-rose-50 border-rose-200';
      case 'info': return 'bg-blue-50 border-blue-200';
    }
  };

  const getText = (type: ToastType) => {
    switch (type) {
      case 'success': return 'text-emerald-800';
      case 'error': return 'text-rose-800';
      case 'info': return 'text-blue-800';
    }
  };

  return (
    <>
      {children}
      {/* Toast Container - Top Right */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 w-full max-w-sm p-4 rounded-2xl border shadow-xl border-border-primary bg-surface animate-in slide-in-from-top-2 fade-in duration-200 ${
              getBg(toast.type)
            }`}
          >
            <div className="shrink-0">{getIcon(toast.type)}</div>
            <div className="flex-1 min-w-0">
              <h4 className={`font-black text-sm ${getText(toast.type)}`}>{toast.title}</h4>
              {toast.description && (
                <p className="text-secondary text-xs mt-0.5">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 p-1 hover:bg-border-primary/50 rounded-md transition text-muted"
              aria-label="إغلاق الإشعار"
            >
              <span className="w-4 h-4 flex items-center justify-center">✕</span>
            </button>
          </div>
        ))}
      </div>
    </>
  );
};

export default ToastProvider;