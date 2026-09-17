import React, { useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, Clock3, MapPin, Plus, Save, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { CustomerVisit } from '../types';

export const VisitsDashboard: React.FC = () => {
  const { currentUser, customers, users, getVisibleVisits, addVisit, updateVisit, getCustomerVisitSummary } = useApp();
  const visible = getVisibleVisits();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [branch, setBranch] = useState('الكل');
  const [rep, setRep] = useState('الكل');
  const [showForm, setShowForm] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<any>(null);
  const [form, setForm] = useState({ customerId: '', repId: currentUser?.role === 'sales_rep' ? currentUser.id : '', date: new Date().toISOString().slice(0, 10), time: '09:00', type: 'زيارة دورية' as CustomerVisit['type'], notes: '' });
  
  // تحديد الفروع والمناديب المتاحة حسب الدور
  const branches = currentUser?.role === 'branch_manager' ? [currentUser.branchName || ''] : 
    currentUser?.role === 'supervisor' ? Array.from(new Set(users.filter((u) => u.supervisorId === currentUser.id).map((u) => u.branchName).filter(Boolean))) :
    Array.from(new Set(users.map((u) => u.branchName).filter(Boolean))) as string[];
  
  const reps = users.filter((u) => u.role === 'sales_rep' && 
    (currentUser?.role !== 'supervisor' || u.supervisorId === currentUser.id) && 
    (currentUser?.role !== 'branch_manager' || u.branchName === currentUser.branchName) &&
    (branch === 'الكل' || u.branchName === branch));
  
  const filtered = useMemo(() => visible.filter((v) => v.date.startsWith(month) && (branch === 'الكل' || v.branchName === branch) && (rep === 'الكل' || v.repId === rep)), [visible, month, branch, rep]);
  const stats = { total: filtered.length, completed: filtered.filter((v) => v.status === 'منفذة').length, scheduled: filtered.filter((v) => v.status === 'مجدولة').length, customers: new Set(filtered.map((v) => v.customerId)).size };
  
  // للمندوب: عملاء الزيارات فقط
  // للمشرف والمدير: جميع عملائهم
  const myCustomers = currentUser?.role === 'sales_rep' 
    ? customers.filter((c) => c.repId === currentUser.id || c.repName === currentUser.name)
    : currentUser?.role === 'branch_manager'
    ? customers.filter((c) => c.branchName === currentUser.branchName)
    : currentUser?.role === 'supervisor'
    ? customers.filter((c) => users.find((u) => (u.id === c.repId || u.name === c.repName) && u.supervisorId === currentUser.id))
    : customers;
  
  const submit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    const r = reps.find((u) => u.id === form.repId); 
    const c = customers.find((x) => x.id === form.customerId); 
    const result = addVisit({ ...form, repName: r?.name || currentUser?.name || '', branchName: r?.branchName || c?.branchName, supervisorId: r?.supervisorId, status: 'مجدولة' }); 
    if (result.success) { 
      setShowForm(false); 
      setForm({ ...form, customerId: '', notes: '' }); 
    } else alert(result.message); 
  };
  const statCards: { icon: React.ElementType; label: string; value: number }[] = [
    { icon: CalendarCheck, label: 'إجمالي الزيارات', value: stats.total },
    { icon: CheckCircle2, label: 'زيارات منفذة', value: stats.completed },
    { icon: Clock3, label: 'زيارات مجدولة', value: stats.scheduled },
    { icon: Users, label: 'عملاء تمت زيارتهم', value: stats.customers },
  ];

  return <main className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black text-slate-900">لوحة زيارات العملاء</h1><p className="text-sm text-slate-500 mt-1">تخطيط الزيارات وقياس التغطية مع خصوصية كاملة لكل دور</p></div><button onClick={() => setShowForm(true)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl flex items-center gap-2"><Plus className="w-4 h-4" /> جدولة زيارة</button></header>
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {statCards.map(({ icon: Icon, label, value }) => (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm" key={label}>
          <Icon className="w-5 h-5 text-amber-500 mb-2" />
          <p className="text-xs text-slate-500">{label}</p>
          <strong className="text-2xl text-slate-900">{value}</strong>
        </div>
      ))}
    </section>
    {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager') && (
      <section className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap gap-3">
        <label className="text-sm font-bold">الشهر<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="block mt-1 border rounded-lg px-3 py-2" /></label>
        {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'supervisor') && (
          <label className="text-sm font-bold">الفرع<select value={branch} onChange={(e) => setBranch(e.target.value)} className="block mt-1 border rounded-lg px-3 py-2"><option>الكل</option>{branches.map((b) => <option key={b}>{b}</option>)}</select></label>
        )}
        {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager') && (
          <label className="text-sm font-bold">المندوب<select value={rep} onChange={(e) => setRep(e.target.value)} className="block mt-1 border rounded-lg px-3 py-2"><option value="الكل">الكل</option>{reps.map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
        )}
      </section>
    )}
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-4 border-b font-black">تفاصيل الزيارات ({filtered.length})</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-right">العميل</th>
              <th className="p-3 text-right">التاريخ</th>
              {(currentUser?.role !== 'sales_rep') && <th className="p-3 text-right">المندوب</th>}
              {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && <th className="p-3 text-right">الفرع</th>}
              <th className="p-3 text-right">الحالة</th>
              <th className="p-3 text-right">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => { 
              const c = customers.find((x) => x.id === v.customerId); 
              const summary = getCustomerVisitSummary(v.customerId || '');
              return <tr className="border-t hover:bg-slate-50 cursor-pointer" key={v.id} onClick={() => setSelectedVisit(v)}>
                <td className="p-3 font-bold">{c?.name || 'عميل غير معروف'}<div className="text-xs text-slate-400">{summary.total} زيارة</div></td>
                <td className="p-3">{v.date}<div className="text-xs text-slate-400">{v.time}</div></td>
                {(currentUser?.role !== 'sales_rep') && <td className="p-3 text-sm">{v.repName}</td>}
                {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && <td className="p-3 text-sm">{v.branchName || '-'}</td>}
                <td className="p-3">
                  <select value={v.status} onChange={(e) => { e.stopPropagation(); updateVisit({ ...v, status: e.target.value as CustomerVisit['status'] }); }} className="border rounded-lg px-2 py-1 text-xs">
                    <option>مجدولة</option>
                    <option>منفذة</option>
                    <option>لم تتم</option>
                    <option>ملغاة</option>
                  </select>
                </td>
                <td className="p-3"><button onClick={(e) => { e.stopPropagation(); setSelectedVisit(v); }} className="text-amber-500 hover:text-amber-600"><MapPin className="w-4 h-4" /></button></td>
              </tr>
            })}
          </tbody>
        </table>
        {!filtered.length && <p className="p-10 text-center text-slate-500">لا توجد زيارات في الفلترة الحالية</p>}
      </div>
    </section>
    {showForm && (
      <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center p-4 z-50">
        <form onSubmit={submit} className="bg-white rounded-2xl p-5 w-full max-w-lg space-y-4" dir="rtl">
          <h2 className="text-xl font-black">جدولة زيارة جديدة</h2>
          <select required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="w-full border rounded-lg p-2">
            <option value="">اختر العميل</option>
            {myCustomers.map((c) => <option value={c.id} key={c.id}>{c.name} — {getCustomerVisitSummary(c.id, month).total} زيارة هذا الشهر</option>)}
          </select>
          <select required value={form.repId} onChange={(e) => setForm({ ...form, repId: e.target.value })} className="w-full border rounded-lg p-2">
            <option value="">اختر المندوب</option>
            {reps.map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="border rounded-lg p-2" />
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="border rounded-lg p-2" />
          </div>
          <textarea placeholder="تفاصيل الزيارة وملاحظات المشرف" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg p-2 min-h-24" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border">إلغاء</button>
            <button className="bg-amber-500 px-4 py-2 rounded-lg font-bold flex items-center gap-2"><Save className="w-4 h-4" /> حفظ الزيارة</button>
          </div>
        </form>
      </div>
    )}
    
    {selectedVisit && (
      <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center p-4 z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedVisit(null); }}>
        <div className="relative z-[60] bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-black">تفاصيل الزيارة</h2>
            <button onClick={() => setSelectedVisit(null)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">العميل</p>
              <p className="font-bold">{customers.find((x) => x.id === selectedVisit.customerId)?.name || 'غير معروف'}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">المندوب</p>
              <p className="font-bold">{selectedVisit.repName}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">التاريخ والوقت</p>
              <p className="font-bold">{selectedVisit.date} - {selectedVisit.time}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">الفرع</p>
              <p className="font-bold">{selectedVisit.branchName || '-'}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">الحالة</p>
              <p className="font-bold text-amber-600">{selectedVisit.status}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">نوع الزيارة</p>
              <p className="font-bold">{selectedVisit.type || '-'}</p>
            </div>
          </div>
          
          {selectedVisit.notes && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-4">
              <p className="text-xs text-blue-600 mb-1 font-bold">الملاحظات والتفاصيل</p>
              <p className="text-sm text-slate-700">{selectedVisit.notes}</p>
            </div>
          )}
          
          {selectedVisit.status === 'منفذة' && selectedVisit.outcome && (
            <div className="bg-green-50 border border-green-200 p-3 rounded-lg mb-4">
              <p className="text-xs text-green-600 mb-1 font-bold">نتيجة الزيارة</p>
              <p className="text-sm text-slate-700">{selectedVisit.outcome}</p>
            </div>
          )}
          
          {selectedVisit.collectedAmount && (
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg mb-4">
              <p className="text-xs text-emerald-600 mb-1 font-bold">المبلغ المحصل</p>
              <p className="text-lg font-bold text-emerald-600">{selectedVisit.collectedAmount?.toLocaleString()} ج.م</p>
            </div>
          )}
          
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setSelectedVisit(null)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200">إغلاق</button>
          </div>
        </div>
      </div>
    )}
  </main>;
};
