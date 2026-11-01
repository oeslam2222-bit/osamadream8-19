import React, { useMemo, useState } from 'react';
import {
  MapPin,
  Clock,
  Plus,
  Search,
  Eye,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import type { CustomerVisit, Product, VisitItem } from '../types';
import { EmptyState } from './ui/EmptyState';

const SIMPLE_VISIT_TYPES: { id: string; label: string; color: string }[] = [
  { id: 'دورية', label: 'زيارة دورية', color: 'bg-blue-50 text-blue-700 border-blue-100' },
  { id: 'تحصيل', label: 'تحصيل', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { id: 'متابعة', label: 'متابعة', color: 'bg-purple-50 text-purple-700 border-purple-100' },
];

interface VisitForm {
  customerId: string;
  customerName: string;
  customerCode: string;
  repId: string;
  date: string;
  time: string;
  type: string;
  collectedAmount: number;
  notes: string;
  visitItems: VisitItem[];
}

export const VisitsDashboard: React.FC = () => {
  const {
    currentUser,
    customers,
    users,
    getVisibleVisits,
    getVisibleCustomers,
    getVisibleProducts,
    addVisit,
  } = useApp();

  const getVisibleVisitsSafe = (): CustomerVisit[] => {
    const v = getVisibleVisits();
    return Array.isArray(v) ? v : [];
  };
  const visible: any = getVisibleVisitsSafe();
  const visits: CustomerVisit[] = visible as CustomerVisit[];
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>('month');
  const [typeFilter, setTypeFilter] = useState<'all' | 'دورية' | 'تحصيل' | 'متابعة'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'منفذة' | 'معلقة' | 'ملغاة'>('all');
  const [repFilter, setRepFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState<number>(5);
  const [visitsPage, setVisitsPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<CustomerVisit | null>(null);
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));

  const initialForm: VisitForm = {
    customerId: '',
    customerName: '',
    customerCode: '',
    repId: currentUser?.role === 'sales_rep' ? currentUser.id : '',
    date: todayStr,
    time: '09:00',
    type: 'تحصيل',
    collectedAmount: 0,
    notes: '',
    visitItems: [],
  };

  const [form, setForm] = useState<VisitForm>(initialForm);

  const myCustomers = useMemo(() => {
    return getVisibleCustomers();
  }, [customers, users, currentUser, getVisibleCustomers]);

  const [searchProduct, setSearchProduct] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);

  const handleProductSearch = (q: string) => {
    setSearchProduct(q);
    if (!q || q.length < 1) {
      setSearchResults([]);
      return;
    }
    const qLower = q.trim().toLowerCase();
    const results = getVisibleProducts()
      .filter(
        (p) =>
          p.name.toLowerCase().includes(qLower) ||
          p.code.toLowerCase().includes(qLower) ||
          (p.unifiedCode && p.unifiedCode.toLowerCase().includes(qLower))
      )
      .slice(0, 10);
    setSearchResults(results);
  };

  const selectProductForVisit = (product: Product) => {
    setSearchProduct(product.name);
    setSearchResults([]);
    const existing = form.visitItems.find((i) => i.productId === product.id);
    if (existing) {
      setForm({
        ...form,
        visitItems: form.visitItems.map((i) =>
          i.productId === product.id ? { ...i, cartonCount: i.cartonCount + 1 } : i
        ),
      });
    } else {
      setForm({
        ...form,
        visitItems: [
          ...form.visitItems,
          {
            id: crypto.randomUUID(),
            productId: product.id,
            productCode: product.code || '',
            productName: product.name,
            cartonCount: 1,
            pieceCount: 0,
            unitPrice: product.cartonPrice || 0,
            amount: product.cartonPrice || 0,
            condition: 'good_condition',
            itemType: 'sale',
            notes: '',
          },
        ],
      });
    }
  };

  const [formErrors, setFormErrors] = useState<string[]>([]);

  const validateForm = (): boolean => {
    const errors: string[] = [];
    if (!form.customerId) errors.push('يرجى اختيار العميل');
    if (form.type === 'تحصيل' && form.collectedAmount <= 0) errors.push('يرجى إدخال مبلغ التحصيل');
    setFormErrors(errors);
    return errors.length === 0;
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validateForm()) return;

    const r = users.find((u) => u.id === form.repId);
    const c = myCustomers.find((x) => x.id === form.customerId);

    const result = addVisit({
      customerId: form.customerId,
      customerName: c?.name || form.customerName || '',
      customerCode: c?.code || form.customerCode || '',
      date: form.date,
      time: form.time,
      repId: r?.id || currentUser?.id || '',
      repName: r?.name || currentUser?.name || '',
      branchName: r?.branchName || c?.branchName || '',
      supervisorId: r?.supervisorId,
      supervisorName: r?.supervisorName || '',
      status: 'منفذة',
      type: form.type as any,
      outcome:
        form.type === 'تحصيل'
          ? 'تم التحصيل'
          : 'متابعة فقط',
      collectedAmount: form.collectedAmount,
      notes: form.notes,
      visitItems: form.visitItems.length > 0 ? form.visitItems : undefined,
    });

    if (!result.success) {
      setFlash({ tone: 'error', text: result.message });
      return;
    }

    setFlash({ tone: 'success', text: 'تم حفظ الزيارة بنجاح ✅' });

    setShowForm(false);
    setForm(initialForm);
    setFormErrors([]);
    setSearchProduct('');
    setSearchResults([]);
  };

  const addVisitItem = () => {
    if (searchResults.length === 0) return;
    const product = searchResults[0];
    selectProductForVisit(product);
    setSearchProduct('');
    setSearchResults([]);
  };

  const removeVisitItem = (id: string) => {
    setForm({ ...form, visitItems: form.visitItems.filter((item) => item.id !== id) });
  };

  const filtered = useMemo(() => {
    const result: CustomerVisit[] = visits;
    let filtered = result;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.customerName?.toLowerCase().includes(q) ||
          v.customerCode?.toLowerCase().includes(q) ||
          v.repName?.toLowerCase().includes(q) ||
          v.branchName?.toLowerCase().includes(q)
      );
    }

    const now = new Date();
    if (timeFilter === 'today') {
      const today = now.toISOString().slice(0, 10);
      filtered = filtered.filter((v) => v.date === today);
    } else if (timeFilter === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      filtered = filtered.filter((v) => new Date(v.date) >= weekAgo);
    } else if (timeFilter === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setMonth(now.getMonth() - 1);
      filtered = filtered.filter((v) => new Date(v.date) >= monthAgo);
    }

    if (repFilter !== 'all') {
      filtered = filtered.filter((v) => v.repId === repFilter);
    }

    return filtered;
  }, [visits, search, timeFilter, typeFilter, statusFilter, repFilter]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((visitsPage - 1) * pageSize, visitsPage * pageSize);

  const typeColorMap: Record<string, string> = {
    دورية: 'bg-blue-50 text-blue-700 border-blue-100',
    تحصيل: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    متابعة: 'bg-purple-50 text-purple-700 border-purple-100',
  };

  const repOptions = useMemo(() => {
    const reps = [...new Set(visits.map((v) => v.repName).filter(Boolean))];
    return reps;
  }, [visits]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900">الزيارات الميدانية</h1>
          <p className="text-xs text-slate-500">تسجيل ومتابعة زيارات العملاء للمندوب</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--app-navy)] hover:bg-[var(--app-navy)] text-white font-black rounded-xl text-xs shadow-sm transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل زيارة جديدة</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">إجمالي الزيارات</div>
          <div className="text-2xl font-black text-slate-900">{filtered.length}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">منفذة</div>
          <div className="text-2xl font-black text-emerald-600">
            {filtered.filter((v) => v.status === 'منفذة').length}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">معلقة</div>
          <div className="text-2xl font-black text-amber-600">
            {filtered.filter((v) => v.status === 'مجدولة' || v.status === 'لم تتم').length}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="text-xs text-slate-500 font-bold uppercase mb-1">قيمة التحصيل</div>
          <div className="text-2xl font-black text-blue-600">
            {formatCurrency(
              filtered
                .filter((v) => v.type === 'تحصيل')
                .reduce((s, v) => s + Number(v.collectedAmount || 0), 0)
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 mb-6 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 font-bold">البحث</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اسم العميل أو المندوب أو الفرع..."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 font-bold">النوع</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">الكل</option>
              <option value="دورية">دورية</option>
              <option value="تحصيل">تحصيل</option>
              <option value="متابعة">متابعة</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 font-bold">الحالة</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">الكل</option>
              <option value="منفذة">منفذة</option>
              <option value="معلقة">معلقة</option>
              <option value="ملغاة">ملغاة</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 font-bold">المندوب</label>
            <select
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">الكل</option>
              {repOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 font-bold">الزمن</label>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="month">آخر شهر</option>
              <option value="week">أسبوع</option>
              <option value="today">اليوم</option>
              <option value="all">الكل</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-slate-500 font-bold text-right">التاريخ</th>
                <th className="px-4 py-3 text-slate-500 font-bold text-right">العميل</th>
                <th className="px-4 py-3 text-slate-500 font-bold text-right">النوع</th>
                <th className="px-4 py-3 text-slate-500 font-bold text-center">المبلغ</th>
                <th className="px-4 py-3 text-slate-500 font-bold text-right">الفرع</th>
                <th className="px-4 py-3 text-slate-500 font-bold text-right">المندوب</th>
                <th className="px-4 py-3 text-slate-500 font-bold text-center">الحالة</th>
                <th className="px-4 py-3 text-slate-500 font-bold text-center">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-4 py-3.5 text-slate-800 font-bold text-right">
                    {v.date}
                    <div className="text-[10px] text-slate-400 mt-0.5">{v.time}</div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-800 font-bold text-right">
                    {v.customerName}
                    <div className="text-[10px] text-slate-400 mt-0.5">{v.customerCode || '-'}</div>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${typeColorMap[v.type] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      {v.type}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {v.type === 'تحصيل' ? formatCurrency(Number(v.collectedAmount || 0)) : '-'}
                  </td>
                  <td className="px-4 py-3.5 text-slate-700 text-right">
                    {v.branchName || '-'}
                  </td>
                  <td className="px-4 py-3.5 text-slate-800 font-bold text-right">
                    {v.repName || '-'}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      v.status === 'منفذة'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : (v.status as string) === 'معلقة' || (v.status as string) === 'مجدولة' || (v.status as string) === 'لم تتم'
                        ? 'bg-amber-50 text-amber-700 border-amber-100'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedVisit(v)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold text-blue-600 border border-blue-200 hover:bg-blue-50 transition active:scale-95"
                    >
                      <span>عرض</span>
                      <span className="text-slate-300">|</span>
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <EmptyState
                      type="visits"
                      title="لا توجد زيارات"
                      description="لم يتم العثور على زيارات مطابقة للبحث أو الفلاتر المحددة. يمكنك تسجيل زيارة جديدة عبر الزر أعلاه."
                      action={
                        <button
                          type="button"
                          onClick={() => setShowForm(true)}
                          className="app-btn app-btn-primary px-4 py-2 text-xs active:scale-95"
                        >
                          <Plus className="w-4 h-4" />
                          <span>تسجيل زيارة جديدة</span>
                        </button>
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4 select-none">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span>عدد النتائج في الصفحة:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-black text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={visitsPage === 1}
                onClick={() => setVisitsPage((p) => Math.max(1, p - 1))}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  visitsPage === 1
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 cursor-pointer'
                }`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-[10px] font-black text-slate-700">
                صفحة {visitsPage} من {totalPages}
              </span>
              <button
                type="button"
                disabled={visitsPage === totalPages}
                onClick={() => setVisitsPage((p) => Math.min(totalPages, p + 1))}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  visitsPage === totalPages
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 cursor-pointer'
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <form onSubmit={submit} className="relative z-[60] bg-white rounded-3xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100" dir="rtl">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-black text-slate-900">تسجيل زيارة جديدة</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-xs text-slate-600 font-bold">العميل *</span>
                <select
                  value={form.customerId}
                  onChange={(e) => {
                    const c = myCustomers.find((x) => x.id === e.target.value);
                    setForm({
                      ...form,
                      customerId: e.target.value,
                      customerName: c?.name || '',
                      customerCode: c?.code || '',
                    });
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">اختر العميل...</option>
                  {myCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code || 'بدون كود'}) — {c.region || c.governorate || c.address || 'الفرع'}
                    </option>
                  ))}
                </select>
              </label>

              {form.customerId && (
                <div className="mt-3 p-3 rounded-2xl border border-slate-200 bg-slate-50/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-slate-700">موقف العميل المالي</span>
                    <span className="text-[10px] font-bold text-slate-400">رصيد • حد ائتمان • مستحقات</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-white border border-slate-100">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">الرصيد الحالي</div>
                      <div className="font-black text-slate-900">
                        {(myCustomers.find((x) => x.id === form.customerId)?.currentBalance ??
                          myCustomers.find((x) => x.id === form.customerId)?.balance ??
                          0).toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-slate-100">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">الحد الائتماني</div>
                      <div className="font-black text-slate-900">
                        {(myCustomers.find((x) => x.id === form.customerId)?.creditLimit ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-slate-100">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">المديونية</div>
                      <div className="font-black text-slate-900">
                        {(myCustomers.find((x) => x.id === form.customerId)?.overdueBalance ?? 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-600 font-bold">نوع الزيارة *</span>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SIMPLE_VISIT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs text-slate-600 font-bold">تاريخ الزيارة</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-600 font-bold">وقت الزيارة</span>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>

                {form.type === 'تحصيل' && (
                  <label className="block">
                    <span className="text-xs text-emerald-800 font-bold">مبلغ التحصيل (ج.م) *</span>
                    <input
                      type="number"
                      value={form.collectedAmount || ''}
                      onChange={(e) => setForm({ ...form, collectedAmount: Number(e.target.value) })}
                      placeholder="0.00"
                      className="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2.5 text-sm font-black bg-white text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </label>
                )}
              </div>

              <label className="block">
                <span className="text-xs text-slate-600 font-bold">ملاحظات الزيارة</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ملاحظات إضافية على الزيارة..."
                />
              </label>

              <span className="text-xs text-slate-600 font-bold">أصناف الزيارة (اختياري)</span>
              <div className="relative mt-1">
                <input
                  type="text"
                  value={searchProduct}
                  onChange={(e) => handleProductSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو الكود لإضافة صنف..."
                  className="w-full pl-8 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              </div>
              {searchProduct && searchResults.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-44 overflow-y-auto divide-y divide-slate-100">
                  {searchResults.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => selectProductForVisit(p)}
                      className="px-3 py-2 text-xs hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <div className="font-black text-slate-900">{p.name}</div>
                        <div className="text-[10px] text-slate-400">
                          كود: {p.code} {p.unifiedCode ? `(#${p.unifiedCode})` : ''}
                        </div>
                      </div>
                      <div className="text-xs font-bold text-blue-600">{p.cartonPrice?.toLocaleString()} ج.م</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">الأصناف المضافة</span>
                  <span className="text-xs font-black text-blue-600">
                    {form.visitItems.reduce((s, i) => s + i.amount, 0).toLocaleString()} ج.م
                  </span>
                </div>
                {form.visitItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-slate-800">{item.productName}</span>
                      <div className="text-[10px] text-slate-400">
                        {item.cartonCount} كرتونة • {item.pieceCount} قطعة
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVisitItem(item.id)}
                      className="text-rose-500 hover:text-rose-700"
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {formErrors.length > 0 && (
                <div className="p-2 rounded-xl bg-rose-50/60 border border-rose-200/50 text-rose-800 text-xs font-bold text-right">
                  {formErrors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-[#009488] to-[#0e7a6e] text-white font-black text-sm rounded-xl shadow-lg shadow-[#009488]/30 hover:shadow-[#009488]/50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4" />
                <span>تسجيل الزيارة</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
