import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface StatGridProps {
  /** How many cards stay visible; the rest are folded behind a toggle button. */
  visible?: number;
  /** The original grid classes (columns, gaps...) of the cards container. */
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
  /** "dark" for buttons that sit on a navy / dark panel. */
  tone?: 'light' | 'dark';
  children: React.ReactNode;
}

/**
 * Shows the most important stat cards and folds the remaining ones.
 * Drop-in replacement for a `<div className="grid ...">` that contains many KPI cards.
 */
export const StatGrid: React.FC<StatGridProps> = ({
  visible = 4,
  className = 'grid grid-cols-2 lg:grid-cols-4 gap-3',
  moreLabel = 'عرض باقي المؤشرات',
  lessLabel = 'إخفاء المؤشرات الإضافية',
  tone = 'light',
  children
}) => {
  const [open, setOpen] = useState(false);
  const items = React.Children.toArray(children);
  const hiddenCount = Math.max(0, items.length - visible);
  const shown = open ? items : items.slice(0, visible);

  const buttonTone =
    tone === 'dark'
      ? 'border-white/15 bg-white/10 text-slate-100 hover:bg-white/15'
      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50';

  return (
    <>
      {shown.length > 0 && <div className={className}>{shown}</div>}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`mx-auto flex items-center justify-center gap-1.5 rounded-xl border px-4 text-xs font-bold transition cursor-pointer ${buttonTone}`}
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span>{open ? lessLabel : `${moreLabel} (${hiddenCount})`}</span>
        </button>
      )}
    </>
  );
};

export default StatGrid;
