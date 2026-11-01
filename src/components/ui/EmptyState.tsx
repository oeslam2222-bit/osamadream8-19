import React from 'react';
import { Inbox, Package, Users, Receipt, ShoppingCart, ArrowRight } from 'lucide-react';

export type EmptyStateType = 'customers' | 'invoices' | 'products' | 'visits' | 'returns' | 'general';

interface EmptyStateProps {
  title: string;
  description?: string;
  type?: EmptyStateType;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

const TYPE_CONFIG: Record<EmptyStateType, { icon: React.ReactNode; accent: string }> = {
  customers: { icon: <Users className="w-6 h-6" />, accent: 'text-blue-600 bg-blue-50' },
  invoices: { icon: <Receipt className="w-6 h-6" />, accent: 'text-teal-600 bg-teal-50' },
  products: { icon: <Package className="w-6 h-6" />, accent: 'text-amber-600 bg-amber-50' },
  visits: { icon: <ShoppingCart className="w-6 h-6" />, accent: 'text-purple-600 bg-purple-50' },
  returns: { icon: <ArrowRight className="w-6 h-6" />, accent: 'text-rose-600 bg-rose-50' },
  general: { icon: <Inbox className="w-6 h-6" />, accent: 'text-slate-600 bg-slate-100' },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  type = 'general',
  icon,
  action,
  className = '',
}) => {
  const config = TYPE_CONFIG[type];
  const displayIcon = icon ?? config.icon;

  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-3 py-12 px-6 rounded-3xl border border-dashed border-border-primary bg-surface-alt ${className}`}
    >
      <div className={`w-16 h-16 rounded-3xl ${config.accent} flex items-center justify-center shadow-sm shrink-0`}>
        {displayIcon}
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="font-black text-primary text-sm sm:text-base">{title}</h3>
        {description && (
          <p className="text-secondary text-xs sm:text-sm leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

export default EmptyState;
