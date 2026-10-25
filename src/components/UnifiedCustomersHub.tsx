import {
  CalendarCheck,
  Users,
  ArrowLeft,
} from 'lucide-react';
import React, { useState } from 'react';
import { Customer } from '../types';
import { AllCustomersAnalyticsView } from './AllCustomersAnalyticsView';
import { VisitsDashboard } from './VisitsDashboard';

interface UnifiedCustomersHubProps {
  initialSubTab?: 'customers' | 'visits';
  onOpenNewOrderForCustomer?: (customer: Customer) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const UnifiedCustomersHub: React.FC<UnifiedCustomersHubProps> = ({
  initialSubTab = 'customers',
  onOpenNewOrderForCustomer,
  onNavigateToTab,
}) => {
  const [subTab, setSubTab] = useState<'customers' | 'visits'>(initialSubTab);

  return (
    <div className="space-y-4">
      {/* Top Header Hub Navigation Pills */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 sm:p-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateToTab?.('home')}
            className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition flex items-center justify-center cursor-pointer"
            title="رجوع"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-purple-500 text-white flex items-center justify-center font-black">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white">مركز العملاء والزيارات الميدانية</h2>
            <p className="text-[10.5px] text-slate-400">
              سجل العملاء، الأرصدة والمديونيات، ومتابعة الزيارات والخطط اليومية
            </p>
          </div>
        </div>

        {/* Sub-tab pills */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('customers')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'customers'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>سجل العملاء والتحليل المالي 👥</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('visits')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'visits'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            <span>الزيارات الميدانية والمتابعة 📍</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {subTab === 'customers' && (
        <div className="animate-in fade-in duration-200">
          <AllCustomersAnalyticsView
            onOpenNewOrderForCustomer={onOpenNewOrderForCustomer}
          />
        </div>
      )}

      {subTab === 'visits' && (
        <div className="animate-in fade-in duration-200">
          <VisitsDashboard />
        </div>
      )}
    </div>
  );
};
