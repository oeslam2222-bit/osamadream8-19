import React, { useMemo, useState } from 'react';
import { ClipboardList, Download, Filter, RefreshCw, Search, Shield, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

const ACTION_LABELS: Record<string, string> = {
  create_invoice: 'إنشاء أمر/فاتورة',
  update_invoice_status: 'تحديث حالة أمر',
  approve_invoice: 'اعتماد أمر',
  cancel_invoice: 'إلغاء أمر',
  return_invoice: 'مرتجع/إرجاع',
  delete_invoice: 'حذف أمر',
  import_products: 'استيراد أصناف',
  stock_adjustment: 'تسوية مخزون',
  user_login: 'تسجيل دخول',
  create_user: 'إنشاء مستخدم',
  update_user: 'تعديل مستخدم',
  add_customer: 'إضافة عميل',
  create_visit: 'تسجيل زيارة',
  update_visit_status: 'تحديث/اعتماد زيارة',
  record_collection: 'تسجيل تحصيل',
  create_return: 'إنشاء مرتجع',
  update_return_status: 'تحديث حالة مرتجع',
  permission_change: 'تغيير صلاحيات',
};

function badgeCls(t?: string) {
  switch (t) {
    case 'success': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'warning': return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'danger': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'info': return 'bg-blue-50 text-blue-700 border-blue-200';
    default: return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export const AuditLogView: React.FC = () => {
  const { auditLogs, currentUser, clearAuditLogs } = useApp();
  const [q, setQ] = useState('');
  const [action, setAction] = useState('all');
  const [userFilter, setUserFilter] = useState('all');

  const canClear = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const actions = useMemo(() => {
    const set = new Set<string>();
    (auditLogs || []).forEach((l) => { if (l.action) set.add(String(l.action)); });
    return Array.from(set).sort();
  }, [auditLogs]);

  const users = useMemo(() => {
    const set = new Set<string>();
    (auditLogs || []).forEach((l) => { const n = l.userName || l.userId; if (n) set.add(n); });
    return Array.from(set).sort((a,b)=>a.localeCompare(b,'ar'));
  }, [auditLogs]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (auditLogs || []).filter((l) => {
      if (action !== 'all' && String(l.action) !== action) return false;
      const uname = l.userName || l.userId || '';
      if (userFilter !== 'all' && uname !== userFilter) return false;
      if (!query) return true;
      const hay = [l.actionTitle, l.details, l.userName, l.userId, l.branchName, l.invoiceNumber, l.invoiceId, l.action]
        .map((v) => String(v || '').toLowerCase()).join(' ');
      return hay.includes(query);
    });
  }, [auditLogs, q, action, userFilter]);

  const exportCsv = () => {
    const headers = ['time','timestamp','user','role','branch','action','title','details','invoice'];
    const rows = filtered.map((l) => [
      l.formattedTime || '', l.timestamp || '', l.userName || l.userId || '', l.userRole || '', l.branchName || '',
      l.action || '', l.actionTitle || '', (l.details || '').replace(/\n/g,' '), l.invoiceNumber || l.invoiceId || ''
    ]);
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const csv = [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#102b4e] text-[#e8c98c] flex items-center justify-center"><ClipboardList size={20}/></div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900">سجل التدقيق والعمليات</h2>
              <p className="text-xs font-bold text-slate-500">توثيق الإجراءات الحساسة (من/متى/إجراء/تفاصيل) — محفوظ محليًا (محدود السعة) ويُحمّل عند البدء</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-black text-slate-700"><Shield size={14}/> {filtered.length} / {(auditLogs||[]).length} سجل</span>
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-extrabold text-slate-700"><Download size={14}/> تصدير CSV</button>
            {canClear && (
              <button onClick={() => { if (confirm('مسح سجل التدقيق المحلي؟')) clearAuditLogs(); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-100 text-xs font-extrabold text-rose-700"><Trash2 size={14}/> مسح السجل</button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2.5">
          <div className="md:col-span-2 relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث في التفاصيل/المستخدم/الفرع/رقم الأمر..." className="w-full h-10 pr-9 pl-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:outline-none focus:border-[#102b4e]"/>
          </div>
          <select value={action} onChange={e=>setAction(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold">
            <option value="all">كل الإجراءات</option>
            {actions.map(a => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}
          </select>
          <select value={userFilter} onChange={e=>setUserFilter(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold">
            <option value="all">كل المستخدمين</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Filter className="w-10 h-10 text-slate-300 mx-auto mb-2"/>
            <div className="font-black text-slate-700">لا توجد سجلات مطابقة</div>
            <div className="text-xs font-bold text-slate-500 mt-1">ستظهر هنا الإجراءات الحساسة بعد تنفيذها (بعد تفعيل التسجيل).</div>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-right text-slate-600">
                  <th className="px-3 py-3 font-black whitespace-nowrap">الوقت</th>
                  <th className="px-3 py-3 font-black">المستخدم</th>
                  <th className="px-3 py-3 font-black">الإجراء</th>
                  <th className="px-3 py-3 font-black">التفاصيل</th>
                  <th className="px-3 py-3 font-black">الفرع/المرجع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice(0, 500).map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70 align-top">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-extrabold text-slate-800 tabular-nums" dir="ltr">{l.formattedTime || '—'}</div>
                      <div className="text-[10px] text-slate-400 font-mono" dir="ltr">{l.timestamp ? new Date(l.timestamp).toLocaleTimeString('en-GB') : ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-black text-slate-900">{l.userName || l.userId || '—'}</div>
                      <div className="text-[10px] text-slate-500 font-bold">{l.userRole || ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg border font-extrabold ${badgeCls(l.badgeType)}`}>{ACTION_LABELS[l.action] || l.actionTitle || l.action || 'إجراء'}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-800">{l.actionTitle || '—'}</div>
                      <div className="text-[11px] text-slate-600 mt-0.5 whitespace-pre-wrap break-words">{l.details || '—'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-700">{l.branchName || '—'}</div>
                      {(l.invoiceNumber || l.invoiceId) && <div className="text-[10px] font-mono text-slate-500 mt-0.5">#{l.invoiceNumber || l.invoiceId}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 500 && <div className="p-3 text-center text-[11px] font-bold text-slate-500 border-t border-slate-100">يُعرض أحدث 500 سجل — استخدم الفلاتر للتضييق</div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogView;
