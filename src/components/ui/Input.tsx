import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon,
  className = '',
  ...props
}) => {
  return (
    <div className="w-full space-y-1">
      {label && (
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 rtl:pl-3 ltr:pr-3 flex items-center pointer-events-none text-slate-400">
            {icon}
          </div>
        )}
        <input
          {...props}
          className={`w-full touch-target bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all ${error ? 'border-red-500 focus:ring-red-500' : ''} ${icon ? 'pl-10' : 'pl-4'} ${className}`}
        />
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
      )}
    </div>
  );
};