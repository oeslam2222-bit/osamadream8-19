import {
  BookOpen,
  FileSpreadsheet,
  Settings,
  Terminal,
  UserCheck,
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { UserManager } from './UserManager';
import { ExcelImportExport } from './ExcelImportExport';
import { SystemWorkflowGuide } from './SystemWorkflowGuide';
import { AccountingSyncView } from './AccountingSyncView';

interface UnifiedSystemAdminHubProps {
  initialSubTab?: 'users' | 'excel' | 'guide' | 'developer';
  onNavigateToTab?: (tab: string) => void;
}

export const UnifiedSystemAdminHub: React.FC<UnifiedSystemAdminHubProps> = ({
  initialSubTab = 'users',
  onNavigateToTab,
}) => {
  const { currentUser } = useApp();
  const isDev = currentUser?.role === 'developer';

  const [subTab, setSubTab] = useState<'users' | 'excel' | 'guide' | 'developer'>(initialSubTab);

  return (
    <div className="space-y-4">
      {/* Top Header Hub Navigation Pills */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 sm:p-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--app-warn)] text-slate-950 flex items-center justify-center font-black">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white">إدارة المنظومة وفريق العمل والشيتات</h2>
            <p className="text-[10.5px] text-slate-400">
              حسابات الموظفين والصلاحيات، ربط ومزامنة شيتات جوجل، والأدوات التقنية
            </p>
          </div>
        </div>

        {/* Sub-tab pills */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('users')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'users'
                ? 'bg-[var(--app-warn)] text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>فريق العمل والموظفين 👥</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('excel')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'excel'
                ? 'bg-[var(--app-warn)] text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>شيتات Google Sheets 📊</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('guide')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'guide'
                ? 'bg-[var(--app-warn)] text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>دليل دورة العمل 📖</span>
          </button>

          {isDev && (
            <button
              type="button"
              onClick={() => setSubTab('developer')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-black transition cursor-pointer whitespace-nowrap ${
                subTab === 'developer'
                  ? 'bg-[var(--app-navy)] text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>صفحة المطور والربط 💻</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Panels */}
      {subTab === 'users' && (
        <div className="animate-in fade-in duration-200">
          <UserManager />
        </div>
      )}

      {subTab === 'excel' && (
        <div className="animate-in fade-in duration-200">
          <ExcelImportExport />
        </div>
      )}

      {subTab === 'guide' && (
        <div className="animate-in fade-in duration-200">
          <SystemWorkflowGuide onNavigateToTab={onNavigateToTab} />
        </div>
      )}

      {subTab === 'developer' && isDev && (
        <div className="animate-in fade-in duration-200">
          <AccountingSyncView />
        </div>
      )}
    </div>
  );
};
