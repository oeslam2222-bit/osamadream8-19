import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  Clapperboard,
  Wallet,
  Rocket,
  User,
  Trophy,
  Star,
  X,
  RotateCcw,
} from 'lucide-react';

interface EncouragementContextType {
  showEncouragement: (type: 'visit' | 'collection' | 'order' | 'customer' | 'target' | 'general' | 'returns') => void;
  activeEncouragement: EncouragementItem | null;
}

interface EncouragementItem {
  type: 'visit' | 'collection' | 'order' | 'customer' | 'target' | 'general' | 'returns';
  title: string;
  message: string;
  icon: React.ElementType;
  color: string;
}

const EncouragementContext = createContext<EncouragementContextType>({
  showEncouragement: () => {},
  activeEncouragement: null,
});

const MESSAGES: Record<string, EncouragementItem> = {
  visit: {
    type: 'visit',
    title: 'ممتاز! زيارة ناجحة',
    message: 'كل زيارة تقربكم أكثر من تحقيق التارجت، استمروا على هذا الأداء',
    icon: Clapperboard,
    color: 'text-[var(--app-blue)] bg-[rgba(16,43,78,.08)] border-[rgba(16,43,78,.20)]',
  },
  collection: {
    type: 'collection',
    title: 'رائع! تحصيل ممتاز',
    message: 'المبلغ المحقق يقربكم من إكمال الهدف، أداء متميز',
    icon: Wallet,
    color: 'text-[var(--app-ok)] bg-[rgba(46,125,91,.10)] border-[rgba(46,125,91,.25)]',
  },
  order: {
    type: 'order',
    title: 'رائع! طلبية جديدة',
    message: 'كل طلبية تعني عملاء أكثر ومبيعات أعلى، استمروا',
    icon: Rocket,
    color: 'text-[var(--app-accent)] bg-[rgba(201,154,67,.12)] border-[rgba(201,154,67,.30)]',
  },
  customer: {
    type: 'customer',
    title: 'عميل جديد ممتاز',
    message: 'إضافة عميل جديد توسع قاعدة العملاء وتزيد الفرص',
    icon: User,
    color: 'text-[var(--app-navy)] bg-[rgba(16,43,78,.06)] border-[rgba(16,43,78,.18)]',
  },
  target: {
    type: 'target',
    title: 'مبارك! تم تحقيق التارجت',
    message: 'لقد حققتم الهدف المحدد لكم، استمروا così لتصلوا للقمة',
    icon: Trophy,
    color: 'text-[var(--app-warn)] bg-[rgba(155,112,39,.14)] border-[rgba(155,112,39,.30)]',
  },
  general: {
    type: 'general',
    title: 'أداء ممتاز',
    message: 'استمروا على هذا العطاء، أنتم تضيفون قيمة حقيقية للمنظومة',
    icon: Star,
    color: 'text-[var(--app-accent)] bg-[rgba(201,154,67,.12)] border-[rgba(201,154,67,.30)]',
  },
  returns: {
    type: 'returns',
    title: 'مرتجعات مضبوطة',
    message: 'المرتجعات اللي بتتسجل بدقة بتحافظ على هامش الربح وتكشف مشاكل الجودة بدري،استمروا بالضبط',
    icon: RotateCcw,
    color: 'text-[var(--app-warn)] bg-[rgba(155,112,39,.14)] border-[rgba(155,112,39,.30)]',
  },
};

export function EncouragementProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<EncouragementItem | null>(null);

  const showEncouragement = useCallback((type: keyof typeof MESSAGES) => {
    const item = MESSAGES[type];
    setActive(item);
    setTimeout(() => setActive(null), 5000);
  }, []);

  return (
    <EncouragementContext.Provider value={{ showEncouragement, activeEncouragement: active }}>
      {children}
      {active && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-slate-800 border border-[var(--app-line)] dark:border-slate-700 rounded-2xl p-4 shadow-2xl flex items-center gap-3 min-w-[320px] max-w-md animate-in slide-in-from-bottom duration-300 pointer-events-auto">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active.color}`}>
              <active.icon className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-slate-900 dark:text-white text-sm">{active.title}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{active.message}</div>
            </div>
            <button
              onClick={() => setActive(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-50 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </EncouragementContext.Provider>
  );
}

export function useEncouragement() {
  return useContext(EncouragementContext);
}

export function EncouragementBadge({ type, count }: { type: keyof typeof MESSAGES; count?: number }) {
  const { showEncouragement } = useEncouragement();
  const item = MESSAGES[type];
  const encouragementType = type as 'visit' | 'collection' | 'order' | 'customer' | 'target' | 'general' | 'returns';

  return (
    <button
      onClick={() => showEncouragement(encouragementType)}
      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--app-line)] bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition hover:bg-[var(--app-navy)] hover:text-white active:scale-95 cursor-pointer"
      title={`رسالة تشجيعية: ${item.title}`}
    >
      <item.icon className={`w-4 h-4 ${item.color.split(' ')[0]}`} />
      <span>{count !== undefined ? `+${count} ` : ''}{item.title.split('!')[0]}</span>
    </button>
  );
}
