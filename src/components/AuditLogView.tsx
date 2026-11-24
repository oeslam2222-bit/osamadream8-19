import React, { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldAlert,
  Search,
  Trash2,
  FileSpreadsheet,
  Filter,
} from 'lucide-react';
import { useToast } from './ui/Toast';
import { useApp } from '../context/AppContext';
import type { AuditLog } from '../types';

const BADGE_META: Record<NonNullable<AuditLog['badgeType']>, { label: string; cls: string }> = {
  success: {
    label: 'ناجح',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  warning: {
    label: 'تنبيه',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  danger: {
    label: 'حرج',
    cls: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  info: {
    label: 'معلومة',
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  neutral: {
    label: 'عام',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
  },
};

export const AuditLogView: React.FC = () => {
  const { auditLogs, clearAuditLogs, currentUser } = useApp();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [badgeFilter, setBadgeFilter] = useState<string>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const canClear = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (auditLogs || []).filter((log) => {
      if (badgeFilter !== 'all' && (log.badgeType || 'neutral') !== badgeFilter) return false;
      if (!q) return true;
      return (
        log.userName?.toLowerCase().includes(q) ||
        log.branchName?.toLowerCase().includes(q) ||
        log.actionTitle?.toLowerCase().includes(q) ||
        log.details?.toLowerCase().includes(q) ||
        log.invoiceNumber?.toLowerCase().includes(q)
      );
    });
  }, [auditLogs, search, badgeFilter]);

  const counts = useMemo(() => {
    const base = { total: auditLogs.length, success: 0, warning: 0, danger: 0 };
    auditLogs.forEach((item) => {
      if (item.badgeType === 'success') base.success += 1;
      else if (item.badgeType === 'warning') base.warning += 1;
      else if (item.badgeType === 'danger') base.danger += 1;
    });
    return base;
  }, [auditLogs]);

  const handleExportExcel = () => {
    showToast({ type: 'info', title: 'تصدير Excel', description: 'متاح للفواتير فقط' });
  };

  return (
    <div className="space-y-4" dir="rtl">
      <section className="rounded-3xl bg-[#0b2337] text-white p-4 sm:p-5 shadow-xl border border-[#123a52]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/20 border border-blue-400/30 text-blue-300 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black">سجل التدقيق والرقابة</h1>
              <p className="text-xs text-slate-300">
                تتبع العمليات الحساسة واعتمادات الطلبيات وتعديلات المستخدمين والصلاحيات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-500 disabled:opacity-50 text-white text-xs font-black transition cursor-not-allowed"
              title="تصدير Excel معطل — متاح للفواتير فقط"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير Excel (مغلق)</span>
            </button>

            {canClear && auditLogs.length > 0 && (
              confirmClear ? (
                <div className="flex items-center gap-1.5 bg-rose-950/80 border border-rose-500/40 rounded-xl px-2.5 py-1.5">
                  <span className="text-[11px] font-bold text-rose-200">تأكيد مسح السجل؟</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearAuditLogs();
                      setConfirmClear(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-black cursor-pointer"
                  >
                    نعم، مسح
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-2 py-1 rounded-lg bg-slate-700 text-slate-200 text-[11px] font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-400/30 text-rose-200 text-xs font-black transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>تفريغ السجل</span>
                </button>
              )
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-[var(--app-card)] border border-[var(--app-border)] p-3.5 shadow-xs">
          <div className="text-[11px] font-bold text-[var(--app-text-muted)]">إجمالي الحركات</div>
          <div className="text-xl font-black text-[var(--app-text)] mt-1 font-mono">{counts.total}</div>
        </div>
        <div className="rounded-2xl bg-[var(--app-card)] border border-emerald-200 p-3.5 shadow-xs">
          <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> عمليات ناجحة
          </div>
          <div className="text-xl font-black text-emerald-700 mt-1 font-mono">{counts.success}</div>
        </div>
        <div className="rounded-2xl bg-[var(--app-card)] border border-amber-200 p-3.5 shadow-xs">
          <div className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> تنبيهات
          </div>
          <div className="text-xl font-black text-amber-700 mt-1 font-mono">{counts.warning}</div>
        </div>
        <div className="rounded-2xl bg-[var(--app-card)] border border-rose-200 p-3.5 shadow-xs">
          <div className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> عمليات حرجة / رفض
          </div>
          <div className="text-xl font-black text-rose-700 mt-1 font-mono">{counts.danger}</div>
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--app-card)] border border-[var(--app-border)] p-3.5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم المستخدم، الفرع، العملية، أو رقم الطلبية..."
            className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-card-2)] text-xs sm:text-sm font-bold text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={badgeFilter}
            onChange={(e) => setBadgeFilter(e.target.value)}
            className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-2)] px-3 py-2.5 text-xs font-black text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">كل التصنيفات</option>
            <option value="success">ناجح</option>
            <option value="info">معلومة</option>
            <option value="warning">تنبيه</option>
            <option value="danger">حرج</option>
            <option value="neutral">عام</option>
          </select>
        </div>
      </div>

      <div className="rounded-3xl bg-[var(--app-card)] border border-[var(--app-border)] shadow-sm overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="py-14 text-center space-y-2">
            <Info className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-sm font-black text-[var(--app-text)]">لا توجد حركات مسجلة مطابقة للبحث</div>
            <p className="text-xs text-[var(--app-text-muted)]">
              سيظهر هنا أي إنشاء أو اعتماد أو تعديل يتم داخل المنظومة
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-[#0b2337] text-white text-xs font-black">
                  <th className="py-3 px-4">التوقيت</th>
                  <th className="py-3 px-4">المستخدم / الفرع</th>
                  <th className="py-3 px-4">العملية</th>
                  <th className="py-3 px-4">التفاصيل</th>
                  <th className="py-3 px-4">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-border)] text-xs">
                {filteredLogs.map((log) => {
                  const badge = BADGE_META[log.badgeType || 'neutral'] || BADGE_META.neutral;
                  return (
                    <tr key={log.id} className="hover:bg-[var(--app-card-hover)] transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[var(--app-text-muted)] whitespace-nowrap">
                        {log.formattedTime || log.timestamp}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-black text-[var(--app-text)]">{log.userName}</div>
                        <div className="text-[11px] font-bold text-[var(--app-text-muted)]">
                          {log.branchName || 'الإدارة'}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-black text-[var(--app-text)]">
                        {log.actionTitle}
                        {log.invoiceNumber && (
                          <span className="mr-1.5 px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-mono text-[10px] border border-blue-200">
                            #{log.invoiceNumber}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[var(--app-text)] max-w-md">
                        {log.details}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-black border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogView;
