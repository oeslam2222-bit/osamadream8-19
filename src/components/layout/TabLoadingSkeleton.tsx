import React from 'react';
import { Loader2 } from 'lucide-react';

export const TabLoadingSkeleton: React.FC = () => (
  <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[350px] space-y-4 animate-in fade-in">
    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center animate-spin">
      <Loader2 className="w-6 h-6" />
    </div>
    <div className="text-center">
      <h3 className="font-black text-slate-800 text-sm">جاري تحميل البيانات...</h3>
      <p className="text-xs text-slate-500 mt-1">يتم جلب محتويات القسم وتجهيزها بأعلى سرعة</p>
    </div>
  </div>
);