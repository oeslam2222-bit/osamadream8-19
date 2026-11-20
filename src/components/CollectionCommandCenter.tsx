import React, { lazy, Suspense, useState } from 'react';
import { CalendarCheck, Loader2, Wallet } from 'lucide-react';

const CollectionRecoveryDashboard = lazy(() =>
  import('./CollectionRecoveryDashboard').then((m) => ({ default: m.CollectionRecoveryDashboard }))
);
const CollectionForecastView = lazy(() => import('./CollectionForecastView'));

export const CollectionCommandCenter: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'recovery' | 'forecast'>('recovery');

  return (
    <div className="space-y-4" dir="rtl">
      <section className="rounded-3xl bg-[#0b2337] text-white p-3.5 sm:p-4 shadow-xl border border-[#123a52]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-white">مركز التحصيل وتوقعات السداد</h1>
              <p className="text-[11px] text-slate-300">
                متابعة المديونيات المتأخرة، توثيق التحصيل الميداني، وإدارة خطط وتوقعات التحصيل
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-950/70 rounded-2xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setActiveSubTab('recovery')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                activeSubTab === 'recovery'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>التحصيل الميداني والمتأخرات</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('forecast')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                activeSubTab === 'forecast'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>توقعات التحصيل الأسبوعية</span>
            </button>
          </div>
        </div>
      </section>

      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
            <span className="text-xs font-black">جاري تحميل بيانات التحصيل...</span>
          </div>
        }
      >
        {activeSubTab === 'recovery' ? <CollectionRecoveryDashboard /> : <CollectionForecastView />}
      </Suspense>
    </div>
  );
};

export default CollectionCommandCenter;
