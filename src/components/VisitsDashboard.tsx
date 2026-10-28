import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, CheckCircle2, Clock3, Plus, Save, Users, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StatGrid } from './ui/StatGrid';
import type { CustomerVisit, ReturnedItem } from '../types';
import { buildReturnNote, ReturnLocation, RETURN_LOCATIONS } from '../services/returnsWorkflowService';

const VISIT_TYPES: CustomerVisit['type'][] = ['زيارة دورية', 'تحصيل', 'تسليم بضاعة', 'حل مشكلة', 'فتح حساب جديد', 'زيارة بيع وطلبية', 'متابعة حساب', 'زيارة مجدولة', 'زيارة مباشرة', 'مرتجع', 'أخرى'];
const OUTCOMES: CustomerVisit['outcome'][] = ['تم عمل طلبية', 'تم التحصيل', 'تأجيل سداد', 'المحل مغلق', 'متابعة فقط', 'مرتجع لدي العميل', 'أخرى'];

export const VisitsDashboard: React.FC = () => {
  const { currentUser, customers, users, getVisibleVisits, addVisit, updateVisit, deleteVisit, createStandaloneReturn } = useApp();
  const visible = getVisibleVisits();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [branch, setBranch] = useState('الكل');
  const [rep, setRep] = useState('الكل');
  const [typeFilter, setTypeFilter] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState('الكل');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<CustomerVisit | null>(null);
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const todayStr = new Date().toISOString().slice(0, 10);
  // المشرف ومدير الفرع والإدارة هم اللي بيحوّلوا المرتجع لأمين المخزن
  const canApproveReturns = currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer';
  const [form, setForm] = useState({ customerId: '', repId: currentUser?.role === 'sales_rep' ? currentUser.id : '', date: todayStr, time: '09:00', type: 'زيارة دورية' as CustomerVisit['type'], outcome: 'متابعة فقط' as CustomerVisit['outcome'], collectedAmount: 0, orderAmount: 0, returnValue: 0, returnReason: '', returnItems: [] as ReturnItemForm[], returnLocation: 'عند العميل' as ReturnLocation, notes: '', returnImages: [] as string[] });

interface ReturnItemForm {
  id: string;
  productName: string;
  quantity: number;
  unit: 'كرتونة' | 'قطعة';
  reason: string;
  condition: 'سليم' | 'تالف' | 'منتهي';
  images: string[];
}

  // Add new return item
  const addReturnItem = () => {
    const newItem: ReturnItemForm = {
      id: crypto.randomUUID(),
      productName: '',
      quantity: 1,
      unit: 'كرتونة',
      reason: '',
      condition: 'سليم',
      images: [],
    };
    setForm({ ...form, returnItems: [...form.returnItems, newItem] });
  };

  // Remove return item
  const removeReturnItem = (id: string) => {
    setForm({ ...form, returnItems: form.returnItems.filter((item) => item.id !== id) });
  };

  // Add image to specific return item
  const addReturnItemImage = (itemId: string, imgUrl: string) => {
    setForm({
      ...form,
      returnItems: form.returnItems.map((item) =>
        item.id === itemId
          ? { ...item, images: [...item.images, imgUrl] }
          : item
      ),
    });
  };

  // Remove image from specific return item
  const removeReturnItemImage = (itemId: string, imgIndex: number) => {
    setForm({
      ...form,
      returnItems: form.returnItems.map((item) =>
        item.id === itemId
          ? { ...item, images: item.images.filter((_, idx) => idx !== imgIndex) }
          : item
      ),
    });
  };

  const branches = currentUser?.role === 'branch_manager' ? [currentUser.branchName || ''] :
    currentUser?.role === 'supervisor' ? Array.from(new Set(users.filter((u) => u.supervisorId === currentUser.id).map((u) => u.branchName).filter(Boolean))) :
    Array.from(new Set(users.map((u) => u.branchName).filter(Boolean))) as string[];

  const reps = users.filter((u) => u.role === 'sales_rep' &&
    (currentUser?.role !== 'supervisor' || u.supervisorId === currentUser.id) &&
    (currentUser?.role !== 'branch_manager' || u.branchName === currentUser.branchName) &&
    (branch === 'الكل' || u.branchName === branch));

  const filtered = useMemo(() => visible.filter((v) => v.date.startsWith(month) && (branch === 'الكل' || v.branchName === branch) && (rep === 'الكل' || v.repId === rep) && (typeFilter === 'الكل' || v.type === typeFilter) && (statusFilter === 'الكل' || v.status === statusFilter) && (!search || (v.customerName || '').includes(search) || (v.customerCode || '').includes(search))).sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`)), [visible, month, branch, rep, typeFilter, statusFilter, search]);

  const myCustomers = currentUser?.role === 'sales_rep'
    ? customers.filter((c) => c.repId === currentUser.id || c.repName === currentUser.name)
    : currentUser?.role === 'branch_manager'
    ? customers.filter((c) => c.branchName === currentUser.branchName)
    : currentUser?.role === 'supervisor'
    ? customers.filter((c) => users.find((u) => (u.id === c.repId || u.name === c.repName) && u.supervisorId === currentUser.id))
    : customers;

  const stats = useMemo(() => {
    const late = filtered.filter((v) => v.date < todayStr && v.status !== 'منفذة' && v.status !== 'ملغاة');
    const visitedIds = new Set(filtered.map((v) => v.customerId).filter(Boolean));
    const unVisited = myCustomers.filter((c) => c.id && !visitedIds.has(c.id)).length;
    return {
      total: filtered.length,
      completed: filtered.filter((v) => v.status === 'منفذة').length,
      scheduled: filtered.filter((v) => v.status === 'مجدولة').length,
      upcoming: filtered.filter((v) => v.status === 'مجدولة' && v.date >= todayStr).length,
      late: late.length,
      returns: filtered.filter((v) => v.isReturn).length,
      unVisited,
    };
  }, [filtered, myCustomers, todayStr]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = reps.find((u) => u.id === form.repId);
    const c = myCustomers.find((x) => x.id === form.customerId);
    const isReturn = form.type === 'مرتجع';
    const result = addVisit({
      customerId: form.customerId,
      customerName: c?.name || '',
      customerCode: c?.code || '',
      date: form.date,
      time: form.time,
      repId: r?.id || currentUser.id,
      repName: r?.name || currentUser?.name || '',
      branchName: r?.branchName || c?.branchName || '',
      supervisorId: r?.supervisorId,
      supervisorName: r?.supervisorName || '',
      status: isReturn ? 'منفذة' : 'مجدولة',
      type: form.type,
      outcome: isReturn ? 'مرتجع لدي العميل' : form.outcome,
      collectedAmount: isReturn ? 0 : form.collectedAmount,
      orderAmount: form.orderAmount,
      notes: form.notes,
      isReturn,
      returnValue: isReturn ? form.returnValue : 0,
      returnReason: isReturn ? form.returnReason : '',
      returnItems: isReturn ? JSON.stringify(form.returnItems.map((i) => `${i.productName}: ${i.quantity} ${i.unit} (${i.condition})${i.reason ? ' - ' + i.reason : ''}`).join(' | ')) : '',
      // المرتجع يبدأ دورته فور تسجيله: بانتظار المشرف.
      returnStatus: isReturn ? 'بانتظار المشرف' : undefined,
      // مكان المرتجع (عند العميل / بالمخزن) بيتسجل جوّه returnNote عشان
      // أمين المخزن ينسّق على أساسه.
      returnNote: isReturn ? buildReturnNote('', { location: form.returnLocation }) : undefined,
      returnImages: isReturn ? form.returnImages : undefined,
      // المرتجع ممكن يتسجل في يوم فيه زيارة سابقة لنفس العميل.
      allowSameDaySecondVisit: isReturn ? true : undefined,
    });

    if (!result.success) {
      setFlash({ tone: 'error', text: result.message });
      return;
    }

    if (isReturn) {
      // الأصناف تُكتب يدوياً لحد ما يتم تحميل مبيعات العملاء بالأصناف والربط
      // بالفاتورة، فبنفتح إذن مستقل من غير فاتورة.
      const manualItems: ReturnedItem[] = form.returnItems.map((item) => ({
        productId: '',
        productCode: '',
        productName: item.productName || 'أصناف مرتجعة',
        cartonCount: item.unit === 'كرتونة' ? item.quantity : 0,
        pieceCount: item.unit === 'قطعة' ? item.quantity : 0,
        cartonQuantity: 0,
        totalPieces: item.quantity,
        pricePerCarton: 0,
        pricePerPiece: 0,
        refundAmount: form.returnValue / Math.max(form.returnItems.length, 1),
        returnReason: item.reason || form.returnReason || '',
      }));
      const created = createStandaloneReturn({
        customerName: c?.name || '',
        customerCode: c?.code,
        branchName: r?.branchName || c?.branchName || '',
        repName: r?.name || currentUser?.name || '',
        date: form.date,
        time: form.time,
        returnedItems: manualItems,
        totalRefundAmount: form.returnValue || 0,
        reason: form.returnReason || 'مرتجع مبيعات',
        handledBy: currentUser?.name || 'مسؤول النظام',
        notes: `إذن مرتجع مستقل من زيارة ${form.date} — الأصناف يدوية لحد ما يتم ربط مبيعات العملاء بالأصناف`,
      });
      if (!created.success) {
        setFlash({ tone: 'error', text: created.message });
        return;
      }
      setFlash({ tone: 'success', text: `${created.message} — تم إشعار الإدارة للمراجعة.` });
    } else {
      setFlash({ tone: 'success', text: 'تم حفظ الزيارة بنجاح ✅' });
    }

    setShowForm(false);
    setForm((f) => ({ ...f, customerId: '', notes: '' }));
  };

  const statCards: { icon: React.ElementType; label: string; value: number; sub?: string }[] = [
    { icon: CalendarCheck, label: 'إجمالي الزيارات', value: stats.total, sub: 'شهر ' + month },
    { icon: CheckCircle2, label: 'زيارات منفذة', value: stats.completed, sub: stats.scheduled + ' مجدولة' },
    { icon: CalendarCheck, label: 'زيارات مرتجعة', value: stats.returns, sub: 'بتعرض على مرحلة المتابعة' },
    { icon: Clock3, label: 'زيارات قادمة', value: stats.upcoming, sub: 'مجدولة ولم تنفذ' },
    { icon: AlertTriangle, label: 'زيارات متأخرة', value: stats.late, sub: 'تجاوز تاريخها بدون تنفيذ' },
    { icon: Users, label: 'عملاء لم تتم زيارتهم', value: stats.unVisited, sub: 'من عملائي لهذا الشهر' },
  ];

  return (
    <div className="tantawy-screen space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--app-navy)' }}>لوحة الزيارات</h1>
          <p className="text-sm text-slate-500 font-bold mt-1">متابعة الزيارات والتحصيلات والمرتجعات والمتابعات</p>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white shadow-lg" style={{ background: 'var(--app-navy)' }}>
          <Plus className="w-4 h-4" /> تسجيل زيارة جديدة
        </button>
      </header>

      {flash ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-bold flex items-start gap-2 ${flash.tone === 'success' ? 'bg-[#e8f5ef] border-[var(--app-ok)] text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
          <span>{flash.text}</span>
        </div>
      ) : null}

      <StatGrid visible={6} tone="dark" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-slate-500 font-bold">{c.label}</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--app-navy)' }}>
                <c.icon className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <div className="text-base sm:text-lg font-black" style={{ color: 'var(--app-navy)' }}>{c.value}</div>
            {c.sub ? <div className="text-[10px] text-slate-500 font-semibold">{c.sub}</div> : null}
          </div>
        ))}
      </StatGrid>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">الشهر</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">الفرع</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="الكل">الكل</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">المندوب</span>
            <select value={rep} onChange={(e) => setRep(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="الكل">الكل</option>
              {reps.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">نوع الزيارة</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="الكل">الكل</option>
              {VISIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">الحالة</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="الكل">الكل</option>
              <option value="مجدولة">مجدولة</option>
              <option value="منفذة">منفذة</option>
              <option value="ملغاة">ملغاة</option>
              <option value="لم تتم">لم تتم</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500 font-bold">بحث</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم العميل / الكود" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-3 text-xs font-black text-slate-600">التاريخ والوقت</th>
                <th className="p-3 text-xs font-black text-slate-600">اسم العميل</th>
                <th className="p-3 text-xs font-black text-slate-600">المندوب</th>
                <th className="p-3 text-xs font-black text-slate-600">الفرع</th>
                <th className="p-3 text-xs font-black text-slate-600">نوع الزيارة</th>
                <th className="p-3 text-xs font-black text-slate-600">الحالة</th>
                <th className="p-3 text-xs font-black text-slate-600">النتيجة</th>
                <th className="p-3 text-xs font-black text-slate-600 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500 font-bold">لا توجد زيارات مسجلة حالياً</td>
                </tr>
              ) : (
                filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 transition group cursor-pointer" onClick={() => setSelectedVisit(v)}>
                    <td className="p-3 text-xs font-bold text-slate-800">
                      <div>{v.date}</div>
                      <div className="text-[10px] text-slate-500">{v.time || '-'}</div>
                    </td>
                    <td className="p-3 text-xs font-black">
                      {v.customerName || customers.find((x) => x.id === v.customerId)?.name || 'عميل غير معروف'}
                      <div className="text-[10px] text-slate-400 font-mono">{v.customerCode || '-'}</div>
                    </td>
                    <td className="p-3 text-xs text-slate-700">{v.repName || '-'}</td>
                    <td className="p-3 text-xs text-slate-700">{v.branchName || '-'}</td>
                    <td className="p-3 text-xs text-slate-700">{v.type || '-'}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        v.status === 'منفذة' ? 'bg-green-100 text-green-700' :
                        v.status === 'مجدولة' ? 'bg-amber-100 text-amber-700' :
                        v.status === 'ملغاة' ? 'bg-slate-100 text-slate-600' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-slate-600">
                      {v.outcome || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedVisit(v); }}
                          className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center text-xs"
                          title="عرض التفاصيل"
                        >
                          <CalendarCheck className="w-4 h-4" />
                        </button>
                        {v.isReturn && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedVisit(v); }}
                            className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center text-xs"
                            title="عرض المرتجع"
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedVisit(v); }}
                          className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center text-xs"
                          title="تعديل"
                        >
                          <Clock3 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-600">إجمالي الزيارات المعروضة: <span className="text-slate-900">{filtered.length}</span></span>
            <span className="text-slate-500">نطاق الوقت: {month}</span>
          </div>
        )}
      </div>
      {showForm ? (
        <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center p-4 z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <form onSubmit={submit} className="relative z-[60] bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black">تسجيل زيارة جديدة</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600" aria-label="إغلاق">إغلاق</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">العميل</span>
                <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
                  <option value="">اختر العميل</option>
                  {myCustomers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">المندوب</span>
                <select value={form.repId} onChange={(e) => setForm({ ...form, repId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
                  <option value="">اختر المندوب</option>
                  {reps.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">التاريخ</span>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">الوقت</span>
                <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">نوع الزيارة</span>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CustomerVisit['type'], outcome: e.target.value === 'تحصيل' ? 'تم التحصيل' : e.target.value === 'زيارة بيع وطلبية' ? 'تم عمل طلبية' : e.target.value === 'متابعة حساب' ? 'متابعة فقط' : e.target.value === 'مرتجع' ? 'مرتجع لدي العميل' : 'أخرى' })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
                  {VISIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">النتيجة</span>
                <select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value as CustomerVisit['outcome'] })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
                  {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            </div>

            {form.type === 'مرتجع' ? (
              <div className="mt-3 rounded-xl border border-[var(--app-accent)] bg-[#fffdf7] p-3 space-y-2">
                <div className="text-xs font-black text-[#8a6420]">بيانات المرتجع</div>
                <label className="block">
                  <span className="text-[11px] text-slate-500 font-bold">قيمة المرتجع (ج.م)</span>
                  <input type="number" value={form.returnValue} onChange={(e) => setForm({ ...form, returnValue: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-500 font-bold">سبب المرتجع</span>
                  <input value={form.returnReason} onChange={(e) => setForm({ ...form, returnReason: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-500 font-bold">الأصناف المرتجعة</span>
                  {form.returnItems.length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {form.returnItems.map((item, idx) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-slate-50 border border-[color:var(--app-line)]">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold text-slate-700">{item.productName || 'بدون اسم'}</span>
                            <span className="text-[10px] text-slate-500 block">{item.quantity} {item.unit} • {item.condition} • {item.reason || 'بدون سبب'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeReturnItem(item.id)}
                            className="text-xs text-rose-600 hover:text-rose-800"
                          >
                            حذف
                          </button>
                        </div>
                      ))}
                      <div className="mt-2">
                        <span className="text-[10px] text-slate-500 block mb-1">صور الأصناف:</span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                          {form.returnImages.map((img, i) => (
                            <div key={i} className="relative">
                              <img src={img} alt="return" className="w-full h-12 object-cover rounded border border-slate-200 cursor-pointer" onClick={() => setLightboxImage(img)} />
                              <button
                                type="button"
                                onClick={() => setForm({ ...form, returnImages: form.returnImages.filter((_, idx) => idx !== i) })}
                                className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]"
                              >
                                <X className="w-2 h-2" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">لا توجد أصناف مرتجعة مضافة</p>
                  )}
                  <button
                    type="button"
                    onClick={addReturnItem}
                    className="mt-2 w-full px-3 py-1.5 rounded-lg border border-[color:var(--app-line)] text-xs text-[color:var(--app-blue)] hover:bg-slate-50 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> إضافة صنف مرتجع
                  </button>
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-500 font-bold">مكان المرتجع</span>
                  <select value={form.returnLocation} onChange={(e) => setForm({ ...form, returnLocation: e.target.value as ReturnLocation })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
                    {RETURN_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <label className="block mt-2">
                  <span className="text-[11px] text-slate-500 font-bold">صور المرتجع (اختياري)</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      const urls = files.map((f) => URL.createObjectURL(f));
                      setForm({ ...form, returnImages: [...form.returnImages, ...urls] });
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  />
                  {form.returnImages.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {form.returnImages.map((img, i) => (
                        <div key={i} className="relative group">
                          <img src={img} alt="return" className="w-full h-20 object-cover rounded-lg border border-slate-200" />
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, returnImages: form.returnImages.filter((_, idx) => idx !== i) })}
                            className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-rose-700"
                            aria-label="حذف الصورة"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </label>
              </div>
            ) : null}

            <label className="block mt-3">
              <span className="text-[11px] text-slate-500 font-bold">المبلغ المحصل (ج.م)</span>
              <input type="number" value={form.collectedAmount} onChange={(e) => setForm({ ...form, collectedAmount: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            </label>
            <label className="block mt-3">
              <span className="text-[11px] text-slate-500 font-bold">قيمة الطلبية (ج.م)</span>
              <input type="number" value={form.orderAmount} onChange={(e) => setForm({ ...form, orderAmount: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            </label>
            <label className="block mt-3">
              <span className="text-[11px] text-slate-500 font-bold">ملاحظات الزيارة</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            </label>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200">إلغاء</button>
              <button type="submit" className="px-4 py-2 rounded-lg text-white font-black flex items-center gap-2" style={{ background: 'var(--app-navy)' }}>
                <Save className="w-4 h-4" /> حفظ الزيارة
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {selectedVisit ? (
        <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center p-4 z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedVisit(null); }}>
          <div className="relative z-[60] bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black">تفاصيل الزيارة</h2>
              <button onClick={() => setSelectedVisit(null)} className="text-slate-400 hover:text-slate-600" aria-label="إغلاق التفاصيل">إغلاق</button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">العميل</p>
                <p className="font-bold">{selectedVisit.customerName || customers.find((x) => x.id === selectedVisit.customerId)?.name || 'غير معروف'}</p>
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
                <select value={selectedVisit.status || 'مجدولة'} onChange={(e) => updateVisit({ ...selectedVisit, status: e.target.value as CustomerVisit['status'] })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
                  <option value="مجدولة">مجدولة</option>
                  <option value="منفذة">منفذة</option>
                  <option value="ملغاة">ملغاة</option>
                  <option value="لم تتم">لم تتم</option>
                </select>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">نوع الزيارة</p>
                <p className="font-bold">{selectedVisit.type || '-'}</p>
              </div>
            </div>
            {selectedVisit.notes ? (
              <div className="bg-[var(--app-blue-soft)] border border-[var(--app-navy)] p-3 rounded-lg mb-4">
                <p className="text-xs text-[var(--app-navy)] mb-1 font-bold">الملاحظات والتفاصيل</p>
                <p className="text-sm text-slate-700">{selectedVisit.notes}</p>
              </div>
            ) : null}
            {selectedVisit.status === 'منفذة' && selectedVisit.outcome ? (
              <div className="bg-green-50 border border-green-200 p-3 rounded-lg mb-4">
                <p className="text-xs text-green-600 mb-1 font-bold">نتيجة الزيارة</p>
                <p className="text-sm text-slate-700">{selectedVisit.outcome}</p>
              </div>
            ) : null}
            {selectedVisit.collectedAmount ? (
              <div className="bg-[#e8f5ef] border border-[var(--app-ok)] p-3 rounded-lg mb-4">
                <p className="text-xs text-[var(--app-ok)] mb-1 font-bold">المبلغ المحصل</p>
                <p className="text-lg font-bold text-[var(--app-ok)]">{selectedVisit.collectedAmount?.toLocaleString()} ج.م</p>
              </div>
            ) : null}
            {selectedVisit.isReturn ? (
              <div className="bg-[#fffdf7] border border-[var(--app-accent)] p-3 rounded-lg mb-4">
                <p className="text-xs text-[#8a6420] mb-1 font-bold">بيانات المرتجع</p>
                <p className="text-sm text-slate-700">قيمة المرتجع: {selectedVisit.returnValue} ج.م</p>
                <p className="text-sm text-slate-700">سبب المرتجع: {selectedVisit.returnReason}</p>
                <p className="text-sm text-slate-700">الأصناف: {selectedVisit.returnItems}</p>
                <p className="text-sm text-slate-700">حالة المرتجع: {selectedVisit.returnStatus}</p>
                {selectedVisit.returnImages && selectedVisit.returnImages.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-[#8a6420] font-bold mb-2">صور المرتجع:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {selectedVisit.returnImages.map((img, i) => (
                        <div key={i} className="relative">
                          <img src={img} alt="return" className="w-full h-24 object-cover rounded-lg border border-slate-200 cursor-pointer" onClick={() => setLightboxImage(img)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedVisit.returnHandledBy ? (
                  <p className="text-xs text-slate-500 mt-1">آخر قرار: {selectedVisit.returnHandledBy} — {selectedVisit.returnHandledAt}</p>
                ) : null}
                {selectedVisit.returnStatus === 'بانتظار المشرف' && canApproveReturns ? (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        const updated: CustomerVisit = {
                          ...selectedVisit,
                          returnStatus: 'تم التحويل لأمين المخزن',
                          returnHandledBy: currentUser?.name,
                          returnHandledAt: new Date().toISOString(),
                          returnHandledRole: currentUser?.role,
                          returnNote: 'تمت الموافقة وتحويل المرتجع لأمين المخزن للتنسيق والاستلام',
                        };
                        const res = updateVisit(updated);
                        if (res.success) { setSelectedVisit(updated); setFlash({ tone: 'success', text: 'تمت الموافقة — المرتجع اتحوّل لأمين المخزن للتنسيق والاستلام ✅' }); }
                        else setFlash({ tone: 'error', text: res.message });
                      }}
                      className="px-3 py-2 rounded-lg bg-[var(--app-ok)] hover:bg-[#256b4a] text-white text-xs font-black"
                    >
                      اعتماد وتحويل لأمين المخزن
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const updated: CustomerVisit = {
                          ...selectedVisit,
                          returnStatus: 'مرفوض',
                          returnHandledBy: currentUser?.name,
                          returnHandledAt: new Date().toISOString(),
                          returnHandledRole: currentUser?.role,
                          returnNote: 'تم رفض المرتجع من المشرف',
                        };
                        const res = updateVisit(updated);
                        if (res.success) { setSelectedVisit(updated); setFlash({ tone: 'error', text: 'تم رفض المرتجع' }); }
                        else setFlash({ tone: 'error', text: res.message });
                      }}
                      className="px-3 py-2 rounded-lg bg-[var(--app-risk)] hover:bg-[#9b3a3a] text-white text-xs font-black"
                    >
                      رفض المرتجع
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { deleteVisit(selectedVisit.id).then((r) => { if (r.success) setSelectedVisit(null); }); }} className="px-4 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-bold">حذف</button>
              <button onClick={() => setSelectedVisit(null)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200">إغلاق</button>
            </div>
          </div>
        </div>
      ) : null}

    {/* Image Lightbox */}
    {lightboxImage && (
      <div
        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in"
        onClick={(e) => {
          if (e.target === e.currentTarget) setLightboxImage(null);
        }}
        role="dialog"
        aria-modal="true"
        aria-label="تكبير صورة المرتجع"
      >
        <button
          type="button"
          onClick={() => setLightboxImage(null)}
          className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition cursor-pointer flex items-center justify-center"
          aria-label="إغلاق التكبير"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="relative flex items-center justify-center max-w-[90vh] max-h-[90vh]">
          <img
            src={lightboxImage}
            alt="return image"
            className="max-w-[85vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain bg-white p-2 border border-white/20"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    )}
  </div>
  );
};
