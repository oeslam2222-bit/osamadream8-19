import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, CheckCircle2, Clock3, Plus, Save, Users, X, Search, Image as ImageIcon, Upload, Trash2, Mail, Truck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import type { CustomerVisit, ReturnedItem, Product } from '../types';
import { buildReturnNote } from '../services/returnsWorkflowService';

const SIMPLE_VISIT_TYPES: { id: string; label: string }[] = [
  { id: 'تحصيل', label: 'تحصيل' },
  { id: 'فاتورة مرتجع لدي العميل', label: 'فاتورة مرتجع لدي العميل' },
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

export const VisitsDashboard: React.FC = () => {
  const { currentUser, customers, users, products, getVisibleVisits, addVisit, updateVisit, deleteVisit, createStandaloneReturn } = useApp();
  const visible = getVisibleVisits();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<CustomerVisit | null>(null);
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const todayStr = new Date().toISOString().slice(0, 10);
  const canApproveReturns = currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    customerCode: '',
    repId: currentUser?.role === 'sales_rep' ? currentUser.id : '',
    date: todayStr,
    time: '09:00',
    type: 'تحصيل' as const,
    collectedAmount: 0,
    notes: '',
    returnValue: 0,
    returnReason: '',
    returnItems: [] as ReturnItemForm[],
    returnImages: [] as string[],
  });

  const myCustomers = useMemo(() => {
    if (currentUser?.role === 'sales_rep') {
      return customers.filter((c) => c.repId === currentUser.id || c.repName === currentUser.name);
    }
    if (currentUser?.role === 'branch_manager') {
      return customers.filter((c) => c.branchName === currentUser.branchName);
    }
    return customers;
  }, [customers, currentUser]);

  const [searchProduct, setSearchProduct] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);

  const handleProductSearch = (q: string) => {
    setSearchProduct(q);
    if (!q || q.length < 1) {
      setSearchResults([]);
      return;
    }
    const qLower = q.trim().toLowerCase();
    const results = products.filter((p) =>
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
            ? { ...i, quantity: i.quantity + 1 }
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

  const [formErrors, setFormErrors] = useState<string[]>([]);

  const validateForm = (): boolean => {
    const errors: string[] = [];
    if (!form.customerId) errors.push('يرجى اختيار العميل');
    if (form.type === 'تحصيل' && form.collectedAmount <= 0) errors.push('يرجى إدخال مبلغ التحصيل');
    if (form.type === 'فاتورة مرتجع لدي العميل') {
      if (form.returnItems.length === 0) errors.push('يرجى إضافة صنف واحد على الأقل للمرتجع');
      if (form.returnValue <= 0) errors.push('يرجى إدخال قيمة المرتجع');
    }
    setFormErrors(errors);
    return errors.length === 0;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const r = users.find((u) => u.id === form.repId);
    const c = myCustomers.find((x) => x.id === form.customerId);
    const isReturn = form.type === 'فاتورة مرتجع لدي العميل';

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
      outcome: isReturn ? 'مرتجع لدي العميل' : form.type === 'تحصيل' ? 'تم التحصيل' : 'متابعة فقط',
      collectedAmount: isReturn ? 0 : form.collectedAmount,
      orderAmount: 0,
      notes: form.notes,
      isReturn,
      returnValue: isReturn ? form.returnValue : 0,
      returnReason: isReturn ? form.returnReason : '',
      returnItems: isReturn ? JSON.stringify(form.returnItems.map((i) => `${i.productName}: ${i.quantity} ${i.unit} (${i.condition})${i.reason ? ' - ' + i.reason : ''}`).join(' | ')) : '',
      returnStatus: isReturn ? 'بانتظار المشرف' : undefined,
      returnNote: isReturn ? `مرتجع من زيارة ${form.date} - ${form.returnReason}` : undefined,
      returnImages: isReturn ? form.returnImages : undefined,
      allowSameDaySecondVisit: isReturn ? true : undefined,
    });

    if (!result.success) {
      setFlash({ tone: 'error', text: result.message });
      return;
    }

    if (isReturn) {
      const manualItems: ReturnedItem[] = form.returnItems.map((item) => ({
        productId: item.productId,
        productCode: item.productCode,
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
        customerName: c?.name || form.customerName || '',
        customerCode: c?.code || form.customerCode || '',
        branchName: r?.branchName || c?.branchName || '',
        repName: r?.name || currentUser?.name || '',
        date: form.date,
        time: form.time,
        returnedItems: manualItems,
        totalRefundAmount: form.returnValue || 0,
        reason: form.returnReason || 'مرتجع مبيعات',
        handledBy: currentUser?.name || 'مسؤول النظام',
        notes: `إذن مرتجع من زيارة ${form.date}`,
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
    setForm({
      customerId: '',
      customerName: '',
      customerCode: '',
      repId: currentUser?.role === 'sales_rep' ? currentUser.id : '',
      date: todayStr,
      time: '09:00',
      type: 'تحصيل',
      collectedAmount: 0,
      notes: '',
      returnValue: 0,
      returnReason: '',
      returnItems: [],
      returnImages: [],
    });
    setFormErrors([]);
    setSearchProduct('');
    setSearchResults([]);
  };

  const addReturnItem = () => {
    const newItem: ReturnItemForm = {
      id: crypto.randomUUID(),
      productId: '',
      productCode: '',
      productName: '',
      quantity: 1,
      unit: 'كرتونة',
      reason: '',
      condition: 'سليم',
      images: [],
    };
    setForm({ ...form, returnItems: [...form.returnItems, newItem] });
  };

  const removeReturnItem = (id: string) => {
    setForm({ ...form, returnItems: form.returnItems.filter((item) => item.id !== id) });
  };

  const updateReturnItem = (id: string, updates: Partial<ReturnItemForm>) => {
    setForm({
      ...form,
      returnItems: form.returnItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    });
  };

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

  const removeReturnItemImage = (itemId: string, imgIndex: number) => {
    setForm({
      ...form,
      returnItems: form.returnItems.map((item) =>
        item.id === itemId
          ? { ...item, images: item.images.filter((_, i) => i !== imgIndex) }
          : item
      ),
    });
  };

  const addReturnImages = (imgUrls: string[]) => {
    setForm({ ...form, returnImages: [...form.returnImages, ...imgUrls] });
  };

  const removeReturnImage = (index: number) => {
    setForm({ ...form, returnImages: form.returnImages.filter((_, i) => i !== index) });
  };


  // الإحصائيات المبسطة
  const filtered = useMemo(() => visible.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (v.customerName || '').toLowerCase().includes(q) ||
           (v.customerCode || '').toLowerCase().includes(q) ||
           (v.repName || '').toLowerCase().includes(q);
  }).sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`)), [visible, search]);

  const stats = useMemo(() => {
    return {
      total: filtered.length,
      completed: filtered.filter((v) => v.status === 'منفذة').length,
      returns: filtered.filter((v) => v.isReturn).length,
      collections: filtered.filter((v) => v.type === 'تحصيل').length,
      followups: filtered.filter((v) => v.type === 'متابعة').length,
    };
  }, [filtered]);

  if (!isOpen) return null;

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
        <div className={`rounded-xl border px-4 py-3 text-sm font-bold flex items-start gap-2 ${flash.tone === 'success' ? 'bg-green-pale border-[var(--app-ok)] text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
          <span>{flash.text}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-bold">إجمالي الزيارات</p>
              <p className="text-2xl font-black">{stats.total}</p>
            </div>
            <CalendarCheck className="w-8 h-8 text-amber-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-bold">زيارات منفذة</p>
              <p className="text-2xl font-black">{stats.completed}</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-bold">مرتجعات</p>
              <p className="text-2xl font-black">{stats.returns}</p>
            </div>
            <Truck className="w-8 h-8 text-amber-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-bold">تحصيلات</p>
              <p className="text-2xl font-black">{stats.collections}</p>
            </div>
            <Mail className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-bold">متابعات</p>
              <p className="text-2xl font-black">{stats.followups}</p>
            </div>
            <Clock3 className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 sm:px-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم العميل أو الكود أو المندوب..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-slate-50 text-xs font-bold text-slate-600 border-b border-slate-200">
                <th className="p-3">رقم الفاتورة</th>
                <th className="p-3">العميل</th>
                <th className="p-3">نوع الزيارة</th>
                <th className="p-3 text-center">المبلغ</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                  <td className="p-3 font-mono font-black text-slate-900 text-xs">{v.invoiceNumber || v.id}</td>
                  <td className="p-3 font-black text-slate-800 text-sm">
                    <div>{v.customerName}</div>
                    <div className="text-[10px] text-slate-400">{v.customerCode}</div>
                  </td>
                  <td className="p-3 text-sm">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      v.type === 'تحصيل' ? 'bg-amber-50 text-amber-700' :
                      v.type === 'فاتورة مرتجع لدي العميل' ? 'bg-rose-50 text-rose-700' :
                      'bg-slate-50 text-slate-700'
                    }`}>
                      {v.type}
                    </span>
                  </td>
                  <td className="p-3 text-center font-black text-sm">
                    {v.type === 'تحصيل' ? formatCurrency(v.collectedAmount || 0) : v.returnValue > 0 ? formatCurrency(v.returnValue) : '—'}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      v.status === 'منفذة' ? 'bg-emerald-50 text-emerald-700' :
                      v.status === 'مجدولة' ? 'bg-amber-50 text-amber-700' :
                      'bg-slate-50 text-slate-700'
                    }`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedVisit(v)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                    >
                      عرض
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-slate-500 text-sm">
                    لا توجد زيارات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm ? (
        <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center p-4 z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <form onSubmit={submit} className="relative z-[60] bg-white rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black">تسجيل زيارة جديدة</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600" aria-label="إغلاق">إغلاق</button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">العميل</span>
                <select value={form.customerId} onChange={(e) => {
                  const c = myCustomers.find((x) => x.id === e.target.value);
                  setForm({ ...form, customerId: e.target.value, customerName: c?.name || '', customerCode: c?.code || '' });
                }} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
                  <option value="">اختر العميل</option>
                  {myCustomers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">نوع الزيارة</span>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as const })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
                  {SIMPLE_VISIT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>

              {form.type === 'تحصيل' && (
                <label className="block">
                  <span className="text-[11px] text-slate-500 font-bold">مبلغ التحصيل (ج.م)</span>
                  <input type="number" value={form.collectedAmount} onChange={(e) => setForm({ ...form, collectedAmount: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                </label>
              )}

              {form.type === 'فاتورة مرتجع لدي العميل' && (
                <div className="mt-3 rounded-xl border border-[var(--app-accent)] bg-amber-light p-3 space-y-3">
                  <div className="text-xs font-black text-warn">بيانات المرتجع</div>
                  <label className="block">
                    <span className="text-[11px] text-slate-500 font-bold">قيمة المرتجع (ج.م)</span>
                    <input type="number" value={form.returnValue} onChange={(e) => setForm({ ...form, returnValue: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-slate-500 font-bold">سبب المرتجع</span>
                    <input value={form.returnReason} onChange={(e) => setForm({ ...form, returnReason: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" placeholder="مثل: تالف / منتهي / خطأ في الطلب" />
                  </label>

                  <label className="block">
                    <span className="text-[11px] text-slate-500 font-bold">البحث عن الصنف (ابحث بالاسم أو الكود)</span>
                    <div className="relative mt-1">
                      <input
                        type="text"
                        value={searchProduct}
                        onChange={(e) => handleProductSearch(e.target.value)}
                        placeholder="اكتب اسم الصنف أو الكود..."
                        className="w-full pl-8 pr-10 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    </div>
                    {searchProduct && searchResults.length > 0 && (
                      <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {searchResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => selectProductForReturn(p)}
                            className="px-3 py-2 text-sm hover:bg-amber-50 cursor-pointer border-b border-slate-50/30 last:border-0 flex items-center justify-between"
                          >
                            <div>
                              <div className="font-black text-slate-900">{p.name}</div>
                              <div className="text-[10px] text-slate-400">كود: {p.code} {p.unifiedCode ? '(#' + p.unifiedCode + ')' : ''}</div>
                            </div>
                            <span className="text-warn font-bold">{p.cartonQuantity || 1} ق/ك</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchProduct && searchResults.length === 0 && (
                      <div className="mt-1 text-[10px] text-rose-500">لم يتم العثور على أصناف</div>
                    )}
                  </label>

                  <div className="mt-3 space-y-1.5">
                    <div className="font-black text-xs text-slate-700">الأصناف المختارة ({form.returnItems.length})</div>
                    {form.returnItems.length > 0 ? (
                      <div className="space-y-1">
                        {form.returnItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white border border-[color:var(--app-line)]">
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-bold text-slate-700">{item.productName}</div>
                              <div className="text-[10px] text-slate-500 block">{item.quantity} {item.unit} • {item.condition} • {item.reason || 'بدون سبب'}</div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateReturnItem(item.id, { quantity: item.quantity + 1 })}
                                className="w-6 h-6 rounded bg-emerald-50 text-emerald-600 text-[10px] font-bold flex items-center justify-center"
                                title="زيادة الكمية"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => item.quantity > 1 ? updateReturnItem(item.id, { quantity: item.quantity - 1 }) : removeReturnItem(item.id)}
                                className="w-6 h-6 rounded bg-rose-50 text-rose-600 text-[10px] font-bold flex items-center justify-center"
                                title="نقص الكمية أو الحذف"
                              >
                                −
                              </button>
                              <button
                                type="button"
                                onClick={() => removeReturnItem(item.id)}
                                className="ml-1 text-xs text-rose-600"
                                title="حذف الصنف"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 text-center py-2">لا توجد أصناف مختارة</div>
                    )}
                  </div>

                  <label className="block mt-2">
                    <span className="text-[11px] text-slate-500 font-bold">الصور (يمكنك إضافة أكثر من صورة)</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {form.returnImages.map((img, idx) => (
                        <div key={idx} className="relative w-12 h-12 rounded-lg border border-slate-200 overflow-hidden">
                          <img src={img} className="w-full h-full object-cover" alt="return" />
                          <button
                            type="button"
                            onClick={() => removeReturnImage(idx)}
                            className="absolute top-1 right-1 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.multiple = true;
                          input.onchange = (e) => {
                            const files = e.target.files;
                            if (files) {
                              const urls = Array.from(files).map((f) => URL.createObjectURL(f));
                              addReturnImages(urls);
                            }
                          };
                          input.click();
                        }
                        className="w-12 h-12 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-amber-500 hover:text-amber-500 transition"
                      >
                        <Upload className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {form.returnItems.length > 0 && (
                    <div className="mt-2 p-2 bg-warn-soft rounded-lg border border-[rgba(155,112,39,.25)]">
                      <div className="text-xs font-black text-warn">إجمالي الأصناف: {form.returnItems.reduce((sum, i) => sum + i.quantity, 0)}</div>
                      <div className="text-[10px] text-warn-deep font-bold">قيمة المرتجع: {formatCurrency(form.returnValue)} ج.م</div>
                    </div>
                  )}
                </div>
              )}

              <label className="block">
                <span className="text-[11px] text-slate-500 font-bold">ملاحظات</span>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows="2" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" placeholder="ملاحظات إضافية عن الزيارة..."></textarea>
              </label>

              {formErrors.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-lg text-xs font-bold">
                  {formErrors.map((err, i) => <div key={i}>• {err}</div>)}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">إلغاء</button>
                <button type="submit" className="px-6 py-2 rounded-lg bg-[var(--app-navy)] text-white font-bold hover:bg-navy-deep2 shadow-lg">حفظ الزيارة</button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {selectedVisit ? (
        <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center p-4 z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedVisit(null); }}>
          <div className="relative z-[60] bg-white rounded-3xl p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black">تفاصيل الزيارة</h2>
              <button type="button" onClick={() => setSelectedVisit(null)} className="text-slate-400 hover:text-slate-600" aria-label="إغلاق">إغلاق</button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold">العميل</p>
                  <p className="font-black text-slate-900">{selectedVisit.customerName}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold">نوع الزيارة</p>
                  <p className="font-black text-slate-900">{selectedVisit.type}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold">التاريخ والوقت</p>
                  <p className="font-black text-slate-900">{selectedVisit.date} {selectedVisit.time}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold">الحالة</p>
                  <p className={`font-black text-sm ${selectedVisit.status === 'منفذة' ? 'text-emerald-600' : 'text-amber-600'}`}>{selectedVisit.status}</p>
                </div>
              </div>
              {selectedVisit.notes && (
                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-[10px] text-slate-500 font-bold">ملاحظات</p>
                  <p className="font-black text-slate-900">{selectedVisit.notes}</p>
                </div>
              )}
              {selectedVisit.isReturn && selectedVisit.returnItems && (
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                  <p className="text-[10px] text-rose-700 font-bold">بيانات المرتجع</p>
                  <div className="mt-2 space-y-2">
                    {JSON.parse(selectedVisit.returnItems || '[]').map((item: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="font-bold">{item.productName}</span>
                        <span className="text-slate-600">{item.quantity} {item.unit}</span>
                      </div>
                    ))}
                    <div className="mt-2 pt-2 border-t border-rose-200">
                      <span className="font-black text-rose-700">القيمة الإجمالية: {formatCurrency(selectedVisit.returnValue || 0)} ج.م</span>
                    </div>
                  </div>
                </div>
              )}
              {selectedVisit.returnImages && selectedVisit.returnImages.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] text-slate-500 font-bold">صور المرتجع</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedVisit.returnImages.map((img, idx) => (
                      <div key={idx} className="w-16 h-16 rounded-lg border border-slate-200 overflow-hidden cursor-pointer" onClick={() => setLightboxImage(img)}>
                        <img src={img} className="w-full h-full object-cover" alt="return" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setSelectedVisit(null)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 font-bold">إغلاق</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {lightboxImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setLightboxImage(null); }} role="dialog" aria-modal="true" aria-label="تكبير صورة المرتجع">
          <button type="button" onClick={() => setLightboxImage(null)} className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition cursor-pointer flex items-center justify-center"><X className="w-5 h-5" /></button>
          <div className="relative flex items-center justify-center max-w-[90vh] max-h-[90vh]">
            <img src={lightboxImage} alt="return image" className="max-w-[85vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain bg-white p-2 border border-white/20" loading="lazy" decoding="async" />
          </div>
        </div>
      )}
    </div>
  );
};
