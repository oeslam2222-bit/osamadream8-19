import {
  Target,
  TrendingUp,
} from 'lucide-react';
import React, { useState } from 'react';
import { TargetPerformanceDashboard } from './TargetPerformanceDashboard';
import CollectionForecastView from './CollectionForecastView';

interface UnifiedTargetsHubProps {
  initialSubTab?: 'targets' | 'forecast';
}

export const UnifiedTargetsHub: React.FC<UnifiedTargetsHubProps> = ({
  initialSubTab = 'targets',
}) => {
  const [subTab, setSubTab] = useState<'targets' | 'forecast'>(initialSubTab);

  return (
    <div className="space-y-4">
      {/* Top Header Hub Navigation Pills */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 sm:p-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--app-ok)] text-slate-950 flex items-center justify-center font-black">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white">مركز الأهداف ومتابعة التحصيلات</h2>
            <p className="text-[10.5px] text-slate-400">
              أهداف وتارجت المبيعات الميدانية، وتوقعات وجداول التحصيل النقدي الأسبوعية والشهرية
            </p>
          </div>
        </div>

        {/* Sub-tab pills */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('targets')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'targets'
                ? 'bg-[var(--app-ok)] text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>تارجت وأهداف المبيعات 🎯</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('forecast')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'forecast'
                ? 'bg-[var(--app-ok)] text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>توقعات وجداول التحصيل 📈</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      {subTab === 'targets' && (
        <div className="animate-in fade-in duration-200">
          <TargetPerformanceDashboard />
        </div>
      )}

      {subTab === 'forecast' && (
        <div className="animate-in fade-in duration-200">
          <CollectionForecastView />
        </div>
      )}
    </div>
  );
};
