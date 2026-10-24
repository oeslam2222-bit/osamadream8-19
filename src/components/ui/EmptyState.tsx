import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className = ''
}) => (
  <div
    className={`flex flex-col items-center justify-center text-center gap-3 py-10 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 ${className}`}
  >
    <div className="w-12 h-12 rounded-2xl bg-white text-slate-400 flex items-center justify-center shadow-sm">
      {icon ?? <Inbox className="w-6 h-6" />}
    </div>
    <div className="space-y-1 max-w-sm">
      <div className="font-bold text-sm text-slate-700">{title}</div>
      {description && <p className="text-xs text-slate-500 leading-relaxed">{description}</p>}
    </div>
    {action && <div className="mt-1">{action}</div>}
  </div>
);

export default EmptyState;
