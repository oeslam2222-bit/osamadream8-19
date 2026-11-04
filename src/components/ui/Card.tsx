import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  padding = 'md',
  hover = false,
  className = '',
  ...props
}) => {
  const paddingStyles: Record<string, string> = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
  };

  return (
    <div
      {...props}
      className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-soft ${hover ? 'hover:shadow-soft-lg transition-shadow duration-200' : ''} ${paddingStyles[padding]} ${className}`}
    >
      {children}
    </div>
  );
};