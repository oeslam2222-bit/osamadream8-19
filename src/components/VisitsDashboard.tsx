import React, { useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Clock3,
  MapPin,
  Plus,
  Save,
  Users,
  Search,
  Phone,
  Calendar,
  Building2,
  UserCheck,
  Filter,
  X,
  Eye,
  FileText,
  AlertCircle,
  XCircle,
  Clock,
  ExternalLink
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { CustomerVisit } from '../types';

export const VisitsDashboard: React.FC = () => {
  const {
    currentUser,
    customers,
    users,
    getVisibleVisits,
    addVisit,
    updateVisit,
    getCustomerVisitSummary
  } = useApp();

  const visible = getVisibleVisits();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [branch, setBranch] = useState('الكل');
  const [rep, setRep] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState<'الكل' | CustomerVisit['status']>('الكل');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<CustomerVisit | null>(null);

  const [form, setForm] = useState({
    customerId: '',
    repId: currentUser?.role === 'sales_rep' ? currentUser.id : '',
    date: new Date().toISOString().slice(0, 10),
    time: '09:00',
    type: 'زيارة دورية' as CustomerVisit['type'],
    notes: ''
  });

  // تحديد الفروع والمناديب المتاحة حسب الدور والصلاحيات
  const branches = useMemo(() => {
    if (currentUser?.role === 'branch_manager') {
      return [currentUser.branchName || ''];
    }
    if (currentUser?.role === 'supervisor') {
      return Array.from(new Set(users.filter((u) => u.supervisorId === currentUser.id).map((u) => u.branchName).filter(Boolean)));
    }
    return Array.from(new Set(users.map((u) => u.branchName).filter(Boolean))) as string[];
  }, [currentUser, users]);

  const reps = useMemo(() => {
    return users.filter(
      (u) =>
        u.role === 'sales_rep' &&
        (currentUser?.role !== 'supervisor' || u.supervisorId === currentUser.id) &&
        (currentUser?.role !== 'branch_manager' || u.branchName === currentUser.branchName) &&
        (branch === 'الكل' || u.branchName === branch)
    );
  }, [currentUser, users, branch]);

  // العملاء المتاحين للإضافة بحسب دور المستخدم
  const myCustomers = useMemo(() => {
    if (currentUser?.role === 'sales_rep') {
      return customers.filter((c) => c.repId === currentUser.id || c.repName === currentUser.name);
    }
    if (currentUser?.role === 'branch_manager') {
      return customers.filter((c) => c.branchName === currentUser.branchName);
    }
    if (currentUser?.role === 'supervisor') {
      return customers.filter((c) =>
        users.some((u) => (u.id === c.repId || u.name === c.repName) && u.supervisorId === currentUser.id)
      );
    }
    return customers;
  }, [currentUser, customers, users]);

  // تصفية الزيارات بحسب الشهر والفرع والمندوب والحالة والبحث
  const filtered = useMemo(() => {
    return visible.filter((v) => {
      const matchMonth = v.date.startsWith(month);
      const matchBranch = branch === 'الكل' || v.branchName === branch;
      const matchRep = rep === 'الكل' || v.repId === rep;
      const matchStatus = statusFilter === 'الكل' || v.status === statusFilter;

      if (!matchMonth || !matchBranch || !matchRep || !matchStatus) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const c = customers.find((x) => x.id === v.customerId);
      const customerName = (c?.name || '').toLowerCase();
      const customerCode = (c?.code || '').toLowerCase();
      const repName = (v.repName || '').toLowerCase();
      const notes = (v.notes || '').toLowerCase();

      return customerName.includes(q) || customerCode.includes(q) || repName.includes(q) || notes.includes(q);
    });
  }, [visible, month, branch, rep, statusFilter, searchQuery, customers]);

  const stats = useMemo(() => {
    return {
      total: filtered.length,
      completed: filtered.filter((v) => v.status === 'منفذة').length,
      scheduled: filtered.filter((v) => v.status === 'مجدولة').length,
      missed: filtered.filter((v) => v.status === 'لم تتم').length,
      cancelled: filtered.filter((v) => v.status === 'ملغاة').length,
      uniqueCustomers: new Set(filtered.map((v) => v.customerId)).size
    };
  }, [filtered]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) {
      alert('يرجى اختيار العميل');
      return;
    }
    const r = reps.find((u) => u.id === form.repId) || users.find((u) => u.id === form.repId);
    const c = customers.find((x) => x.id === form.customerId);

    const result = addVisit({
      ...form,
      repName: r?.name || currentUser?.name || '',
      branchName: r?.branchName || c?.branchName || currentUser?.branchName || '',
      supervisorId: r?.supervisorId,
      status: 'مجدولة'
    });

    if (result.success) {
      setShowForm(false);
      setForm({
        ...form,
        customerId: '',
        notes: ''
      });
    } else {
      alert(result.message);
    }
  };

  const getStatusBadge = (status: CustomerVisit['status']) => {
    switch (status) {
      case 'منفذة':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>منفذة</span>
          </span>
        );
      case 'مجدولة':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>مجدولة</span>
          </span>
        );
      case 'لم تتم':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>لم تتم</span>
          </span>
        );
      case 'ملغاة':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>ملغاة</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <main className="p-3.5 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-600 text-xs font-black mb-1">
            <CalendarCheck className="w-4 h-4" />
            <span>خطة وجداول الزيارات الميدانية 2026</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">جدول ومتابعة زيارات العملاء</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            تنظيم وتنسيق خط سير المناديب ومتابعة تنفيذ الزيارات الميدانية مع سرعة التحديث
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>جدولة زيارة جديدة</span>
        </button>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs font-bold text-slate-500">إجمالي الزيارات</p>
            <strong className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 block">{stats.total}</strong>
            <span className="text-[10px] text-slate-400 font-semibold">{stats.uniqueCustomers} عميل مختلف</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs font-bold text-emerald-700">زيارات منفذة بنجاح</p>
            <strong className="text-xl sm:text-2xl font-black text-emerald-600 mt-0.5 block">{stats.completed}</strong>
            <span className="text-[10px] text-emerald-600 font-semibold">
              {stats.total ? Math.round((stats.completed / stats.total) * 100) : 0}% نسبة الإنجاز
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs font-bold text-blue-700">مجدولة وقادمة</p>
            <strong className="text-xl sm:text-2xl font-black text-blue-600 mt-0.5 block">{stats.scheduled}</strong>
            <span className="text-[10px] text-blue-500 font-semibold">قيد التنفيذ الميداني</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
            <Clock3 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs font-bold text-amber-700">لم تتم أو ملغاة</p>
            <strong className="text-xl sm:text-2xl font-black text-amber-600 mt-0.5 block">{stats.missed + stats.cancelled}</strong>
            <span className="text-[10px] text-slate-400 font-semibold">تتطلب إعادة جدولة</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Coordinated Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالعميل، المندوب، الملاحظات..."
              className="w-full pl-8 pr-9 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:border-amber-500 focus:outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Month Selector */}
          <div className="relative">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* Branch Selector */}
          {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'supervisor') && (
            <div>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500 transition"
              >
                <option value="الكل">جميع الفروع</option>
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {/* Rep Selector */}
          {currentUser?.role !== 'sales_rep' && (
            <div>
              <select
                value={rep}
                onChange={(e) => setRep(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500 transition"
              >
                <option value="الكل">جميع المناديب ({reps.length})</option>
                {reps.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Status Filter Chiclets */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-bold text-slate-500 ml-1">تصفية بحالة الزيارة:</span>
          {(['الكل', 'مجدولة', 'منفذة', 'لم تتم', 'ملغاة'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer text-xs ${
                statusFilter === s
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
          {(searchQuery || statusFilter !== 'الكل' || branch !== 'الكل' || rep !== 'الكل') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('الكل');
                setBranch('الكل');
                setRep('الكل');
              }}
              className="mr-auto text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>إلغاء التصفية</span>
            </button>
          )}
        </div>
      </div>

      {/* Responsive Visits Table and Card Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
          <span>نتائج الزيارات: {filtered.length} زيارة</span>
          <span className="text-slate-400 font-normal hidden sm:inline">اضغط على أي سطر لعرض التفاصيل الكاملة</span>
        </div>

        {/* Mobile & Tablet Card Layout (< md screens) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {filtered.map((v) => {
            const c = customers.find((x) => x.id === v.customerId);
            const summary = getCustomerVisitSummary(v.customerId || '', month);

            return (
              <div
                key={v.id}
                onClick={() => setSelectedVisit(v)}
                className="p-3.5 space-y-2 hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 leading-snug">{c?.name || 'عميل غير معروف'}</h4>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <span>كود: {c?.code || '-'}</span>
                      <span>•</span>
                      <span>{c?.region || c?.branchName || 'منطقة عامة'}</span>
                    </p>
                  </div>
                  <div>{getStatusBadge(v.status)}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/90 p-2.5 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="font-semibold">{v.date} ({v.time})</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="font-semibold truncate">{v.repName}</span>
                  </div>
                </div>

                {v.notes && (
                  <p className="text-xs text-slate-600 bg-amber-50/60 p-2 rounded-lg border border-amber-100/80 line-clamp-2">
                    {v.notes}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="text-slate-500 font-semibold">زيارات الشهر: {summary.total}</span>
                  <div className="flex items-center gap-2">
                    {c?.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg border border-emerald-200"
                        title="اتصال بالعميل"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedVisit(v);
                      }}
                      className="px-2.5 py-1 bg-slate-900 text-white font-bold rounded-lg text-xs hover:bg-amber-500 hover:text-slate-950 transition"
                    >
                      التفاصيل 🔍
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table Layout (md+ screens) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">العميل</th>
                <th className="p-3">المنطقة والفرع</th>
                <th className="p-3">المندوب</th>
                <th className="p-3">الموعد والتاريخ</th>
                <th className="p-3">نوع الزيارة</th>
                <th className="p-3">تحديث الحالة</th>
                <th className="p-3">الملاحظات</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((v) => {
                const c = customers.find((x) => x.id === v.customerId);
                const summary = getCustomerVisitSummary(v.customerId || '', month);

                return (
                  <tr
                    key={v.id}
                    onClick={() => setSelectedVisit(v)}
                    className="hover:bg-slate-50/80 transition cursor-pointer group"
                  >
                    <td className="p-3">
                      <div className="font-black text-slate-900 text-xs">{c?.name || 'عميل غير معروف'}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        كود: {c?.code || '-'} | {summary.total} زيارة بالشهر
                      </div>
                    </td>
                    <td className="p-3 text-slate-700 font-semibold">
                      <div>{c?.region || '-'}</div>
                      <div className="text-[10px] text-slate-400">{v.branchName || c?.branchName || '-'}</div>
                    </td>
                    <td className="p-3 text-slate-800 font-bold">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold">
                          {v.repName ? v.repName.charAt(0) : 'م'}
                        </div>
                        <span>{v.repName}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-800">{v.date}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{v.time}</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-semibold text-[11px]">
                        {v.type || 'زيارة دورية'}
                      </span>
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={v.status}
                        onChange={(e) => {
                          updateVisit({ ...v, status: e.target.value as CustomerVisit['status'] });
                        }}
                        className={`text-xs font-bold rounded-lg px-2 py-1 border transition cursor-pointer ${
                          v.status === 'منفذة'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : v.status === 'مجدولة'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : v.status === 'لم تتم'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        <option value="مجدولة">مجدولة</option>
                        <option value="منفذة">منفذة</option>
                        <option value="لم تتم">لم تتم</option>
                        <option value="ملغاة">ملغاة</option>
                      </select>
                    </td>
                    <td className="p-3 max-w-[200px] truncate text-slate-500" title={v.notes}>
                      {v.notes || '-'}
                    </td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        {c?.phone && (
                          <a
                            href={`tel:${c.phone}`}
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                            title={`اتصال: ${c.phone}`}
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedVisit(v)}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                          title="عرض التفاصيل"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!filtered.length && (
          <div className="py-12 px-4 text-center space-y-2">
            <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-600">لا توجد زيارات مطابقة للفلترة الحالية</p>
            <p className="text-xs text-slate-400">يمكنك جدولة زيارة جديدة أو تغيير الشهر والفرع والمندوب</p>
          </div>
        )}
      </div>

      {/* Schedule Visit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4 z-50 animate-in fade-in duration-150">
          <form
            onSubmit={submit}
            className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-lg space-y-4 shadow-2xl border border-slate-200"
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center font-bold">
                  <CalendarCheck className="w-4 h-4" />
                </div>
                <h2 className="text-lg font-black text-slate-900">جدولة زيارة عميل جديدة</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العميل المستهدف *</label>
                <select
                  required
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- اختر العميل من القائمة ({myCustomers.length}) --</option>
                  {myCustomers.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name} {c.code ? `(${c.code})` : ''} - {c.region || c.branchName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المندوب القائم بالزيارة *</label>
                <select
                  required
                  value={form.repId}
                  onChange={(e) => setForm({ ...form, repId: e.target.value })}
                  disabled={currentUser?.role === 'sales_rep'}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- اختر المندوب --</option>
                  {reps.map((u) => (
                    <option value={u.id} key={u.id}>
                      {u.name} ({u.branchName || 'عام'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الزيارة *</label>
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت الزيارة التقريبي *</label>
                  <input
                    required
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع الغرض من الزيارة</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as CustomerVisit['type'] })}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-amber-500"
                >
                  <option value="زيارة دورية">زيارة دورية اعتيادية</option>
                  <option value="تحصيل">تحصيل مديونية ومستحقات</option>
                  <option value="تسليم بضاعة">تسليم بضاعة أو طلبية</option>
                  <option value="حل مشكلة">خدمة عملاء وحل مشكلة</option>
                  <option value="فتح حساب جديد">فتح حساب عميل جديد</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات وتعليمات الزيارة</label>
                <textarea
                  placeholder="سجل أهداف الزيارة، النواقص، أو أي توجيهات مهمة للمندوب..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-amber-500 min-h-20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-100 transition"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition"
              >
                <Save className="w-4 h-4" />
                <span>حفظ وجدولة الزيارة</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Visit Details Modal */}
      {selectedVisit && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4 z-50 animate-in fade-in duration-150"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedVisit(null);
          }}
        >
          <div
            className="relative z-60 bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 space-y-4"
            dir="rtl"
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">بطاقة تفاصيل الزيارة</h2>
                  <p className="text-xs text-slate-500">سجل الزيارة ونتائجها الميدانية</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const c = customers.find((x) => x.id === selectedVisit.customerId);
              return (
                <div className="space-y-4">
                  {/* Customer Banner */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900">{c?.name || 'عميل غير معروف'}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        كود العميل: {c?.code || '-'} | الفرع: {selectedVisit.branchName || c?.branchName || '-'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c?.phone && (
                        <a
                          href={`tel:${c.phone}`}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>{c.phone}</span>
                        </a>
                      )}
                      {getStatusBadge(selectedVisit.status)}
                    </div>
                  </div>

                  {/* Grid of Key Info */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 block">المندوب المسؤول</span>
                      <span className="text-xs font-black text-slate-800">{selectedVisit.repName}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 block">تاريخ ووقت الزيارة</span>
                      <span className="text-xs font-black text-slate-800">{selectedVisit.date} - {selectedVisit.time}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 block">نوع الزيارة</span>
                      <span className="text-xs font-black text-slate-800">{selectedVisit.type || 'زيارة دورية'}</span>
                    </div>
                  </div>

                  {/* Status Update Control */}
                  <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-black text-amber-900 block">تغيير حالة الزيارة الحالية:</span>
                      <span className="text-[11px] text-amber-700">تحديث فوري ينعكس لدى الإدارة والتقارير</span>
                    </div>
                    <select
                      value={selectedVisit.status}
                      onChange={(e) => {
                        const newStatus = e.target.value as CustomerVisit['status'];
                        updateVisit({ ...selectedVisit, status: newStatus });
                        setSelectedVisit({ ...selectedVisit, status: newStatus });
                      }}
                      className="px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-black text-slate-800 focus:outline-none"
                    >
                      <option value="مجدولة">مجدولة</option>
                      <option value="منفذة">منفذة</option>
                      <option value="لم تتم">لم تتم</option>
                      <option value="ملغاة">ملغاة</option>
                    </select>
                  </div>

                  {/* Notes & Outcomes */}
                  {selectedVisit.notes && (
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-600 block mb-1">الملاحظات والتوجيهات:</span>
                      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">{selectedVisit.notes}</p>
                    </div>
                  )}

                  {selectedVisit.outcome && (
                    <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200">
                      <span className="text-xs font-bold text-emerald-800 block mb-1">النتيجة بعد التنفيذ:</span>
                      <p className="text-xs text-emerald-900 leading-relaxed">{selectedVisit.outcome}</p>
                    </div>
                  )}

                  {selectedVisit.collectedAmount ? (
                    <div className="p-3.5 bg-emerald-100/60 rounded-2xl border border-emerald-300 flex items-center justify-between">
                      <span className="text-xs font-black text-emerald-900">المبلغ المحصل خلال الزيارة:</span>
                      <span className="text-base font-black text-emerald-700 font-mono">
                        {selectedVisit.collectedAmount.toLocaleString()} ج.م
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
