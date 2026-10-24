import React from 'react';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const sizeMap = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', label, className = '' }) => (
  <div className={`flex flex-col items-center justify-center gap-2 ${className}`} role="status" aria-live="polite">
    <Loader2 className={`${sizeMap[size]} animate-spin text-[color:var(--brand-teal)]`} />
    {label && <span className="text-xs font-bold text-slate-500">{label}</span>}
  </div>
);

export default Spinner;
