import React from 'react';

interface FooterProps {
  isDark?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ isDark = false }) => {
  return (
    <footer
      className={`bg-slate-900 text-slate-300 border-t border-slate-800 mt-auto py-4 px-4 text-center ${
        isDark ? 'bg-slate-950 text-slate-400' : ''
      }`}
    >
      <div className="max-w-md mx-auto space-y-2">
        <div className="flex items-center justify-center gap-2 text-xs font-medium">
          <span className="text-slate-300">نظام إدارة المبيعات والمخازن والربط السحابي وتوفير الباقة</span>
          <span className="text-slate-500">|</span>
          <span className="text-amber-400">مجموعة الطنطاوي للتجارة والتوزيع</span>
        </div>
        <div className="text-[10px] text-slate-500">
          مستند للفاتورة الإلكترونية المصرية • يدعم العمل بدون إنترنت وتثبيت التطبيق PWA
        </div>
      </div>
    </footer>
  );
};

export default Footer;