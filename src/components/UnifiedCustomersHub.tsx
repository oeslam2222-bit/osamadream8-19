import {
  CalendarCheck,
  Users,
} from 'lucide-react';
import React, { useState } from 'react';
import { Customer } from '../types';
import { AllCustomersAnalyticsView } from './AllCustomersAnalyticsView';
import { VisitsDashboard } from './VisitsDashboard';

interface UnifiedCustomersHubProps {
  initialSubTab?: 'customers' | 'visits';
  onOpenNewOrderForCustomer?: (customer: Customer) => void;
}

export const UnifiedCustomersHub: React.FC<UnifiedCustomersHubProps> = ({
  initialSubTab = 'customers',
  onOpenNewOrderForCustomer,
}) => {
  const [subTab, setSubTab] = useState<'customers' | 'visits'>(initialSubTab);

  return (
    <div className="space-y-4 rounded-2xl bg-[#f4f8fc] p-2 sm:p-3">
      {/* Top Header Hub Navigation Pills */}
      <div className="bg-white border border-[#d9e5f0] rounded-xl p-3 sm:p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[0_4px_18px_rgba(15,55,92,0.08)]">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[#0d4778] text-white flex items-center justify-center font-black shadow-sm">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-[#12385c]">مركز العملاء والزيارات الميدانية</h2>
            <p className="text-[10.5px] text-slate-500">
              سجل العملاء، الأرصدة والمديونيات، ومتابعة الزيارات والخطط اليومية
            </p>
          </div>
        </div>

        {/* Sub-tab pills */}
        <div className="flex items-center bg-[#edf4fa] p-1 rounded-xl border border-[#d7e5f1] text-xs w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('customers')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'customers'
                ? 'bg-[#0d4778] text-white shadow-sm'
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
                ? 'bg-[#0d4778] text-white shadow-sm'
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
