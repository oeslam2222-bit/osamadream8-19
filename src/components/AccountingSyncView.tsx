import {
  Activity,
  CheckCircle2,
  Clock,
  Code,
  Database,
  FileSpreadsheet,
  Layers,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  TrendingUp,
  Wifi
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { COMPANY_INFO } from '../data/mockData';
import { formatCurrency } from '../services/invoiceService';

export const AccountingSyncView: React.FC = () => {
  const { invoices, accountingLogs, syncToAccounting, isOffline } = useApp();

  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const unsyncedInvoices = invoices.filter((i) => !i.syncedToAccounting);
  const syncedInvoices = invoices.filter((i) => i.syncedToAccounting);

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    let count = 0;
    for (const inv of unsyncedInvoices) {
      await syncToAccounting(inv.id);
      count++;
    }
    setIsSyncingAll(false);
    setSyncStatusMsg(`تم بنجاح ترحيل ${count} فاتورة إلى نظام الحسابات المركزي والقيود اليومية!`);
    setTimeout(() => setSyncStatusMsg(null), 5000);
  };

  return (
    <div className="space-y-5 pb-16">
      
      {/* Toast Alert */}
      {syncStatusMsg && (
        <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between text-xs sm:text-sm animate-in fade-in">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5" />
            <span>{syncStatusMsg}</span>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center font-black">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black">منظومة الربط المحاسبي المركزي (ERP & Accounting Sync)</h2>
              <p className="text-xs sm:text-sm text-slate-300">
                ترحيل الفواتير تلقائياً إلى حسابات العملاء، قيود المبيعات، ومخزون الفروع
              </p>
            </div>
          </div>

          <button
            disabled={isSyncingAll || unsyncedInvoices.length === 0}
            onClick={handleSyncAll}
            className="flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs shadow-md transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingAll ? 'animate-spin' : ''}`} />
            <span>ترحيل كل الفواتير المعلقة ({unsyncedInvoices.length})</span>
          </button>
        </div>
      </div>

      {/* Status KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs text-slate-500 font-bold">حالة الاتصال بنظام المحاسبة</span>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-3 h-3 rounded-full ${isOffline ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="font-extrabold text-sm text-slate-900">
              {isOffline ? 'وضع عدم الاتصال (تخزين مؤقت)' : 'متصل بالخادم المركزي'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            عند انقطاع الإنترنت يتم تسجيل الفواتير محلياً وترحيلها تلقائياً فور عودة الاتصال.
          </p>
        </div>

        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs text-slate-500 font-bold">الفواتير المرحلة والمثبتة في الدفاتر</span>
          <div className="text-xl font-black text-emerald-700">
            {syncedInvoices.length} فاتورة
          </div>
          <span className="text-[10px] text-slate-400">سندات قيد يومية مسجلة برقم إلكتروني</span>
        </div>

        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-1">
          <span className="text-xs text-slate-500 font-bold">فواتير قيد الانتظار للترحيل</span>
          <div className="text-xl font-black text-amber-700">
            {unsyncedInvoices.length} فاتورة
          </div>
          <span className="text-[10px] text-slate-400">بانتظار المزامنة مع برنامج الحسابات</span>
        </div>

      </div>

      {/* Sync Logs Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden space-y-3">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            <span>سجل المعاملات والترحيل المحاسبي (Sync Logs)</span>
          </h3>
        </div>

        {accountingLogs.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            لم يتم تسجيل أي عمليات ترحيل محاسبي حتى الآن
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-white font-bold">
                <tr>
                  <th className="p-3">الوقت</th>
                  <th className="p-3">رقم الفاتورة</th>
                  <th className="p-3">النظام المستهدف</th>
                  <th className="p-3">استجابة السيرفر</th>
                  <th className="p-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accountingLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-500 font-mono">{log.timestamp}</td>
                    <td className="p-3 font-bold font-mono text-slate-900">{log.invoiceNumber}</td>
                    <td className="p-3 text-slate-700 font-medium">{log.systemName}</td>
                    <td className="p-3 text-slate-600">{log.responseMessage}</td>
                    <td className="p-3 text-center">
                      <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
