import React, { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, CalendarCheck, CheckCircle2, Clock3, Plus, Save, Users, X, Search, Image as ImageIcon, Upload, Trash2, Mail, Truck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import type { CustomerVisit, ReturnedItem, Product, VisitItem } from '../types';
import { buildReturnNote } from '../services/returnsWorkflowService';

const SIMPLE_VISIT_TYPES: { id: string; label: string }[] = [
  { id: 'تحصيل', label: 'تحصيل' },
  { id: 'فاتورة مرتجع', label: 'فاتورة مرتجع' },
  { id: 'متابعة', label: 'متابعة' },
];

interface ReturnItemForm {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: 'كرتونة' | 'قطعة';
  reason: string;
  condition: 'سليم' | 'تالف' | 'منتهي';
  images: string[];
}

const formatVisitType = (type) => {
  const map = {
    'تحصيل': 'تحصيل',
    'فاتورة': 'مرتجع',
    'متابعة': 'متابعة',
  };
  return map[type] || type;
};

export const VisitsDashboard: React.FC = () => {
  const {
    currentUser,
    customers,
    users,
    products,
    getVisibleVisits,
    getVisibleCustomers,
    getVisibleProducts,
    addVisit,
    updateVisit,
    deleteVisit,
    createStandaloneReturn,
  } = useApp();

  const visible = getVisibleVisits();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [flash, setFlash] = useState(null);
  const [visitsPage, setVisitsPage] = useState(1);
  const VISITS_PER_PAGE = 15;
  const todayStr = new Date().toISOString().slice(0, 10);
  const canApproveReturns =
    currentUser?.role === 'supervisor' ||
    currentUser?.role === 'branch_manager' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'developer';

  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    customerCode: '',
    repId: currentUser?.role === 'sales_rep' ? currentUser.id : '',
    date: todayStr,
    time: '09:00',
    type: 'تحصيل' as string,
    collectedAmount: 0,
    notes: '',
    returnValue: 0,
    returnReason: '',
    returnItems: [] as ReturnItemForm[],
    returnImages: [] as string[],
    visitItems: [] as VisitItem[],
  });

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
    const results = getVisibleProducts().filter((p) =>
      p.name.toLowerCase().includes(qLower) ||
      p.code.toLowerCase().includes(qLower) ||
      (p.unifiedCode && p.unifiedCode.toLowerCase().includes(qLower))
    ).slice(0, 10);
    setSearchResults(results);
  };

  const selectProductForReturn = (product: Product) => {
    setSearchProduct(product.name);
    setSearchResults([]);
    const existing = form.returnItems.find((i) => i.productId === product.id);
    if (existing) {
      setForm({
        ...form,
        returnItems: form.returnItems.map((i) =>
          i.productId === product.id
            ? { ...i, cartonCount: i.cartonCount + 1 }
            : i
        ),
      });
    } else {
      setForm({
        ...form,
        returnItems: [
          ...form.returnItems,
          {
            id: crypto.randomUUID(),
            productId: product.id,
            productCode: product.code || '',
            productName: product.name,
            quantity: 1,
            unit: 'كرتونة',
            reason: '',
            condition: 'سليم',
            images: [],
          },
        ],
      });
    }
  };

  const selectProductForVisit = (product: Product) => {
    setSearchProduct(product.name);
    setSearchResults([]);
    const existing = form.visitItems.find((i) => i.productId === product.id);
    if (existing) {
      setForm({
        ...form,
        visitItems: form.visitItems.map((i) =>
          i.productId === product.id
            ? { ...i, cartonCount: i.cartonCount + 1 }
            : i
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
    if (form.type === 'فاتورة مرتجع' && form.returnItems.length === 0) errors.push('يرجى إضافة صنف واحد على الأقل للمرتجع');
    if (form.type === 'فاتورة مرتجع' && form.returnValue <= 0) errors.push('يرجى إدخال قيمة المرتجع');
    setFormErrors(errors);
    return errors.length === 0;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const r = users.find((u) => u.id === form.repId);
    const c = myCustomers.find((x) => x.id === form.customerId);
    const isReturn = form.type === 'فاتورة مرتجع';

    const result = addVisit({
      customerId: form.customerId,
      customerName: c?.name || form.customerName || '',
      customerCode: c?.code || form.customerCode || '',
      date: form.date,
      time: form.time,
      repId: r?.id || currentUser.id,
      repName: r?.name || currentUser?.name || '',
      branchName: r?.branchName || c?.branchName || '',
      supervisorId: r?.supervisorId,
      supervisorName: r?.supervisorName || '',
      status: 'منفذة',
      type: form.type as any,
      outcome: isReturn
        ? 'مرتجع لدى العميل'
        : form.type === 'تحصيل'
        ? 'تم التحصيل'
        : 'متابعة فقط',
      collectedAmount: isReturn ? 0 : form.collectedAmount,
      orderAmount: 0,
      notes: form.notes,
      isReturn,
      returnValue: isReturn ? form.returnValue : 0,
      returnReason: isReturn ? form.returnReason : '',
      returnItems: isReturn
        ? JSON.stringify(
            form.returnItems.map(
              (i) => `${i.productName}: ${i.quantity} ${i.unit} (${i.condition})${i.reason ? ' - ' + i.reason : ''}`
            )
          ).join(' | ')
        : '',
      returnStatus: isReturn ? 'بانتظار المشرف' : undefined,
      returnNote: isReturn ? `مرتجع من زيارة ${form.date} - ${form.returnReason}` : undefined,
      returnImages: isReturn ? form.returnImages : undefined,
      allowSameDaySecondVisit: isReturn ? true : undefined,
      visitItems: form.visitItems.length > 0 ? form.visitItems : undefined,
    });
  };
// ════════════════════════════════════════════════════════════
// NEW DESIGN - Professional Arabic RTL Interface
// ════════════════════════════════════════════════════════════

// Pagination calculation
const totalPages = Math.ceil(visible.length / VISITS_PER_PAGE);
const pagedVisits = visible.slice((visitsPage - 1) * VISITS_PER_PAGE, visitsPage * VISITS_PER_PAGE);

// Filtered visits based on search
const filteredVisits = pagedVisits.filter(v =>
  v.customerName.toLowerCase().includes(search.toLowerCase()) ||
  (v.customerCode && v.customerCode.toLowerCase().includes(search.toLowerCase())) ||
  (v.id && v.id.toLowerCase().includes(search.toLowerCase()))
);

// Status badge color class
const statusBadgeClass = (status: string) => {
  if (status === 'منفذة') return 'bg-green-100 text-green-800';
  if (status === 'مرجعة') return 'bg-orange-100 text-orange-800';
  return 'bg-blue-100 text-blue-800';
};

// Visit type badge
const visitTypeBadge = (type: string) => {
  const types: Record<string, { bg: string; text: string }> = {
    'تحصيل': { bg: 'bg-blue-600', text: 'white' },
    'فاتورة مرتجع': { bg: 'bg-orange-600', text: 'white' },
    'متابعة': { bg: 'bg-purple-600', text: 'white' },
  };
  const t = types[type] || { bg: 'bg-slate-600', text: 'white' };
  return `bg-${t.bg.split('-')[1]} ${t.text}`;
};

// ════════════════════════════════════════════════════════════
// HEADERS AND STATISTICS CARDS
// ════════════════════════════════════════════════════════════

// Calculate statistics from real data (preserving existing logic)
const totalVisits = visible.length;
const executedVisits = visible.filter(v => v.status === 'منفذة').length;
const returnsCount = visible.filter(v => v.isReturn).length;
const totalCollected = visible
  .filter(v => v.type === 'تحصيل' && v.collectedAmount)
  .reduce((sum, v) => sum + (v.collectedAmount || 0), 0);

return (
  <div className="min-h-screen bg-slate-50 text-slate-900">
    <div className="max-w-7xl mx-auto p-4">
      {/* Header Section */}
      <header className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-slate-200">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">لوحة الزيارات</h1>
            <p className="text-slate-500 text-sm mt-1">متابعة الزيارات والتحصيلات والمرتجعات</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-6 rounded-lg transition-all shadow-md"
            >
              <Plus className="mr-2 h-4 w-4" /> زيارة جديدة
            </button>
            <div className="flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
              <span className="slate-500"> آخر تحديث: {new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit })}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Statistics Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-slate-500 text-sm">إجمالي الزيارات</p>
              <p className="text-2xl font-bold text-slate-800">{totalVisits}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-slate-500 text-sm">زيارة منفذة</p>
              <p className="text-2xl font-bold text-slate-800">{executedVisits}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-slate-500 text-sm">مرتجعات</p>
              <p className="text-2xl font-bold text-slate-800">{returnsCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Clock3 className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-slate-500 text-sm">إجمالي التحصيل</p>
              <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalCollected)} ج.م</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters Area */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-slate-200">
        <form className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 text-sm font-medium mb-2">Search client name</label>
              <input
                type="text"
                placeholder="اكتب اسم العميل..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:outline-none transition-colors"
                aria-label="Search client name"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-600 text-sm font-medium mb-2">Time period filter</label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm"
                >
                  الكل
                </button>
                <button
                  type="button"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm"
                >
                  الماضي الأسبوع
                </button>
                <button
                  type="button"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm"
                >
                  الشهر الحالي
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <select
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">زيارة type</option>
                <option value="تحصيل">تحصيل</option>
                <option value="فاتورة مرتجع">مرتجع</option>
                <option value="متابعة">متابعة</option>
              </select>
            </div>
            <div>
              <select
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">الحالة</option>
                <option value="منفذة">منفذة</option>
                <option value="مرجعة">مرجعة</option>
                <option value="في الانتظار">في الانتظار</option>
              </select>
            </div>
            <div>
              <select
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">المندوب</option>
              </select>
            </div>
            <div>
              <select
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">الفرع</option>
              </select>
            </div>
          </div>
        </form>
      </div>

      {/* Visits Table / List */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200">
        <div className="border-b border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 px-4 py-3 text-slate-500 text-xs font-medium">
            <div>اسم العميل</div>
            <div>كود العميل</div>
            <div>زيارة/فاتورة</div>
            <div>نوع الزيارة</div>
            <div>المبلغ</div>
            <div>الحالة</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2 px-4">
          {filteredVisits.map((visit) => (
            <div
              key={visit.id}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2 px-4 py-3 border-b border-slate-50 hover:bg-slate-50/10 transition-colors"
            >
              <div className="font-medium text-slate-800 truncate">
                {visit.customerName}
              </div>
              <div className="text-slate-500 text-xs truncate">
                {visit.customerCode || '—'}
              </div>
              <div className="text-slate-500 text-xs truncate">
                {visit.id ? visit.id.substring(0, 8) + '…' : '—'}
              </div>
              <div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${visitTypeBadge(visit.type)}>
                  {formatVisitType(visit.type)}
                </span>
              </div>
              <div className="text-slate-800 font-medium">
                {formatCurrency(visit.collectedAmount || 0)}
              </div>
              <div>
                <span className={statusBadgeClass(visit.status)}>
                  {visit.status}
                </span>
              </div>
            </div>
          ))}

          {filteredVisits.length === 0 && !search && (
            <div className="col-span-6 py-8 text-center text-slate-400">
              <p>لا توجد زيارات مطابقة للفلاتر الحالية</p>
            </div>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 text-sm">
              الصفحة {visitsPage} من {totalPages}
            </span>
            <div className="flex gap-1">
              {visitsPage > 1 && (
                <button
                  onClick={() => setVisitsPage(visitsPage - 1)}
                  className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-sm transition-colors"
                >
                  السابق
                </button>
              )}
              {visitsPage < totalPages && (
                <button
                  onClick={() => setVisitsPage(visitsPage + 1)}
                  className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-sm transition-colors"
                >
                  التالي
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {search && !filteredVisits.length && (
        <div className="py-8 text-center text-slate-400">
          <p>لا توجد زيارات تحتوي على <strong>{search}</strong></p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="relative z-[60] bg-white rounded-3xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black">إضافة زيارة جديدة</h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="إغلاق"
              >
                إغلاق
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!validateForm()) return;
              const r = users.find((u) => u.id === form.repId);
              const c = myCustomers.find((x) => x.id === form.customerId);
              const isReturn = form.type === 'فاتورة مرتجع';

              const result = addVisit({
                customerId: form.customerId,
                customerName: c?.name || form.customerName || '',
                customerCode: c?.code || form.customerCode || '',
                date: form.date,
                time: form.time,
                repId: r?.id || currentUser.id,
                repName: r?.name || currentUser?.name || '',
                branchName: r?.branchName || c?.branchName || '',
                supervisorId: r?.supervisorId,
                supervisorName: r?.supervisorName || '',
                status: 'منفذة',
                type: form.type as any,
                outcome: isReturn
                  ? 'مرتجع لدى العميل'
                  : form.type === 'تحصيل'
                  ? 'تم التحصيل'
                  : 'متابعة فقط',
                collectedAmount: isReturn ? 0 : form.collectedAmount,
                orderAmount: 0,
                notes: form.notes,
                isReturn,
                returnValue: isReturn ? form.returnValue : 0,
                returnReason: isReturn ? form.returnReason : '',
                returnItems: isReturn
                  ? JSON.stringify(
                      form.returnItems.map(
                        (i) => `${i.productName}: ${i.quantity} ${i.unit} (${i.condition})${i.reason ? ' - ' + i.reason : ''}`
                      )
                    ).join(' | ')
                  : '',
                returnStatus: isReturn ? 'بانتظار المشرف' : undefined,
                returnNote: isReturn ? `مرتجع من زيارة ${form.date} - ${form.returnReason}` : undefined,
                returnImages: isReturn ? form.returnImages : undefined,
                allowSameDaySecondVisit: isReturn ? true : undefined,
                visitItems: form.visitItems.length > 0 ? form.visitItems : undefined,
              });
              setFlash({ tone: 'success', text: 'تمت إضافة الزيارة بنجاح' });
              setShowForm(false);
              setForm({
                customerId: '',
                customerName: '',
                customerCode: '',
                repId: currentUser?.role === 'sales_rep' ? currentUser.id : '',
                date: todayStr,
                time: '09:00',
                type: 'تحصيل' as string,
                collectedAmount: 0,
                notes: '',
                returnValue: 0,
                returnReason: '',
                returnItems: [] as ReturnItemForm[],
                returnImages: [] as string[],
                visitItems: [] as VisitItem[],
              });
            }}>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-slate-600 text-sm font-medium mb-1">اسم العميل</label>
                  <select
                    value={form.customerId}
                    onChange={(e) => setForm(prev => ({ ...prev, customerId: e.target.value, customerName: '' }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500 appearance-none"
                  >
                    <option value="">اختر عميل</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 text-sm font-medium mb-1">نوع الزيارة</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500 appearance-none"
                  >
                    <option value="تحصيل">تحصيل</option>
                    <option value="فاتورة مرتجع">فاتورة مرتجع</option>
                    <option value="متابعة">متابعة</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-slate-600 text-sm font-medium mb-1">التاريخ</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-sm font-medium mb-1">الوقت</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 text-sm font-medium mb-1">ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 h-20 focus:outline-none focus:border-blue-500 resize-none"
                  rows={3}
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-slate-600 text-sm font-medium mb-1">مبلغ التحصيل</label>
                  <input
                    type="number"
                    value={form.collectedAmount}
                    onChange={(e) => setForm(prev => ({ ...prev, collectedAmount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500 numeric-input"
                    step="100"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 text-sm font-medium mb-1">قيمة المرتجع</label>
                  <input
                    type="number"
                    value={form.returnValue}
                    onChange={(e) => setForm(prev => ({ ...prev, returnValue: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-500"
                    step="100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 text-sm font-medium mb-1">سبب المرتجع</label>
                <input
                  value={form.returnReason}
                  onChange={(e) => setForm(prev => ({ ...prev, returnReason: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 h-14 focus:outline-none focus:border-blue-500"
                  placeholder="اسمي السبب هنا..."
                ></textarea>
              </div>

              <div>
                <label className="block text-slate-600 text-sm font-medium mb-1">عناصر الزيارة (منتجات)</label>
                <div className="border rounded-lg bg-slate-50 p-3 min-h-[200px]">
                  {form.visitItems.length > 0 ? (
                    form.visitItems.map((item, i) => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                        <span className="text-slate-600">{item.productName}</span>
                        <span className="text-slate-400 text-xs">{item.cartonCount} كرتونة</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 text-center py-4">لا توجد منتجات</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                >
                  حفظ الزيارة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  </div>
);
