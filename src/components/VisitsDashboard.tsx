import React, { useMemo, useState, useEffect } from 'react';
import {
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Users,
  Search,
  Eye,
  RotateCcw,
  RotateCw,
  Coins,
  Tag,
  Building,
  Upload,
  Trash2,
  X,
  Gift,
  Banknote,
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import type { CustomerVisit, ReturnedItem, Product, VisitItem } from '../types';

const SIMPLE_VISIT_TYPES: { id: string; label: string }[] = [
  { id: 'دورية', label: 'زيارة دورية' },
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
  const {
    currentUser,
    customers,
    users,
    getVisibleVisits,
    getVisibleCustomers,
    getVisibleProducts,
    addVisit,
    createStandaloneReturn,
  } = useApp();

  const visible = getVisibleVisits();
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>('month');
  const [typeFilter, setTypeFilter] = useState<'all' | 'دورية' | 'تحصيل' | 'مرتجع' | 'متابعة'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'منفذة' | 'معلقة' | 'مرتجعة' | 'ملغاة'>('all');
  const [repFilter, setRepFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState<number>(5);
  const [visitsPage, setVisitsPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<CustomerVisit | null>(null);
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);

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

  // Customer fast lookup for area and balance
  const customerMeta = useMemo(() => {
    const map = new Map<string, { area: string; balance: number; code: string }>();
    customers.forEach((c) => {
      const area = c.region || c.governorate || c.address || 'الفرع الرئيسي';
      map.set(c.id, { area, balance: c.balance || 0, code: c.code || '' });
      if (c.code) {
        map.set(c.code, { area, balance: c.balance || 0, code: c.code });
      }
    });
    return map;
  }, [customers]);

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

  const selectProductForReturn = (product: Product) => {
    setSearchProduct(product.name);
    setSearchResults([]);
    const existing = form.returnItems.find((i) => i.productId === product.id);
    if (existing) {
      setForm({
        ...form,
        returnItems: form.returnItems.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
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
      repId: r?.id || currentUser?.id || '',
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
      returnItems: isReturn
        ? JSON.stringify(
            form.returnItems.map(
              (i) =>
                `${i.productName}: ${i.quantity} ${i.unit} (${i.condition})${
                  i.reason ? ' - ' + i.reason : ''
                }`
            )
          )
        : '',
      returnStatus: isReturn ? 'بانتظار المشرف' : undefined,
      returnNote: isReturn ? `مرتجع من زيارة ${form.date} - ${form.returnReason}` : undefined,
      returnImages: isReturn ? form.returnImages : undefined,
      allowSameDaySecondVisit: isReturn ? true : undefined,
      visitItems: form.visitItems.length > 0 ? form.visitItems : undefined,
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
      visitItems: [],
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

  const updateReturnItem = (id: string, updates: Partial<ReturnItemForm>) => {
    setForm({
      ...form,
      returnItems: form.returnItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    });
  };

  const removeReturnImage = (index: number) => {
    setForm({ ...form, returnImages: form.returnImages.filter((_, i) => i !== index) });
  };

  // Helper date formatter for table (السبت 11 أكتوبر 2026)
  const formatArabicDateWithDay = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      const months = [
        'يناير',
        'فبراير',
        'مارس',
        'أبريل',
        'مايو',
        'يونيو',
        'يوليو',
        'أغسطس',
        'سبتمبر',
        'أكتوبر',
        'نوفمبر',
        'ديسمبر',
      ];
      return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  // Comprehensive multi-filter
  const filtered = useMemo(() => {
    return visible
      .filter((v) => {
        // Search
        if (search) {
          const q = search.toLowerCase().trim();
          const matches =
            (v.customerName || '').toLowerCase().includes(q) ||
            (v.customerCode || '').toLowerCase().includes(q) ||
            (v.repName || '').toLowerCase().includes(q) ||
            (v.invoiceNumber || '').toLowerCase().includes(q) ||
            (v.id || '').toLowerCase().includes(q);
          if (!matches) return false;
        }

        // Time filter
        if (timeFilter !== 'all' && v.date) {
          const vDate = new Date(v.date);
          const now = new Date();
          if (timeFilter === 'today') {
            if (v.date !== todayStr) return false;
          } else if (timeFilter === 'week') {
            const diffDays = (now.getTime() - vDate.getTime()) / (1000 * 3600 * 24);
            if (diffDays < 0 || diffDays > 7) return false;
          } else if (timeFilter === 'month') {
            const currentMonthPrefix = todayStr.slice(0, 7);
            if (!v.date.startsWith(currentMonthPrefix)) return false;
          }
        }

        // Type filter
        if (typeFilter !== 'all') {
          if (typeFilter === 'مرتجع') {
            if (!v.isReturn && !v.type?.includes('مرتجع')) return false;
          } else if (typeFilter === 'تحصيل') {
            if (v.type !== 'تحصيل') return false;
          } else if (typeFilter === 'دورية') {
            if (!v.type?.includes('دورية')) return false;
          } else if (typeFilter === 'متابعة') {
            if (v.type !== 'متابعة') return false;
          }
        }

        // Status filter
        if (statusFilter !== 'all') {
          if (statusFilter === 'منفذة' && v.status !== 'منفذة') return false;
          if (statusFilter === 'معلقة' && v.status !== 'مجدولة' && v.status !== 'لم تتم') return false;
          if (statusFilter === 'مرتجعة' && !v.isReturn) return false;
          if (statusFilter === 'ملغاة' && v.status !== 'ملغاة') return false;
        }

        // Rep / Branch filter
        if (repFilter !== 'all') {
          if (v.repId !== repFilter && v.repName !== repFilter && v.branchName !== repFilter) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`));
  }, [visible, search, timeFilter, typeFilter, statusFilter, repFilter, todayStr]);

  // KPI Metric Stats
  const stats = useMemo(() => {
    return {
      total: filtered.length,
      completed: filtered.filter((v) => v.status === 'منفذة').length,
      returns: filtered.filter((v) => v.isReturn || v.type?.includes('مرتجع')).length,
      collections: filtered.filter((v) => v.type === 'تحصيل' || (v.collectedAmount && v.collectedAmount > 0)).length,
    };
  }, [filtered]);

  // Reset page whenever search or filters change
  useEffect(() => {
    setVisitsPage(1);
  }, [search, timeFilter, typeFilter, statusFilter, repFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedVisits = useMemo(() => {
    const start = (visitsPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, visitsPage, pageSize]);

  const handleResetFilters = () => {
    setSearch('');
    setTimeFilter('month');
    setTypeFilter('all');
    setStatusFilter('all');
    setRepFilter('all');
    setPageSize(5);
    setVisitsPage(1);
  };

  return (
    <div className="tantawy-screen space-y-6 pb-12" dir="rtl">
      {/* 1. Header (Reference Design image_b68712b4.png) */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">لوحة الزيارات</h1>
            <p className="text-xs text-slate-500 font-bold mt-0.5">متابعة الزيارات والتحصيلات والمرتجعات</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل زيارة جديدة</span>
          </button>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold px-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>آخر تحديث: منذ دقيقة واحدة</span>
          </div>
        </div>
      </header>

      {/* Flash Alert */}
      {flash && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-bold flex items-center justify-between gap-2 shadow-sm ${
            flash.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{flash.text}</span>
          <button type="button" onClick={() => setFlash(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. 4 Metric Cards (Matching reference screenshot) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: إجمالي الزيارات */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 font-bold">إجمالي الزيارات</p>
            <p className="text-3xl font-black text-blue-900 tracking-tight">
              {stats.total.toLocaleString('en-US')}
            </p>
            <p className="text-[11px] text-slate-400 font-bold">خلال الفترة المحددة</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Calendar className="w-7 h-7" />
          </div>
        </div>

        {/* Card 2: الزيارات المنفذة */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 font-bold">الزيارات المنفذة</p>
            <p className="text-3xl font-black text-emerald-600 tracking-tight">
              {stats.completed.toLocaleString('en-US')}
            </p>
            <p className="text-[11px] text-slate-400 font-bold">تم تنفيذها</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7" />
          </div>
        </div>

        {/* Card 3: مرتجعات */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 font-bold">مرتجعات</p>
            <p className="text-3xl font-black text-amber-600 tracking-tight">
              {stats.returns.toLocaleString('en-US')}
            </p>
            <p className="text-[11px] text-slate-400 font-bold">تحتاج مراجعة</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <RotateCcw className="w-7 h-7" />
          </div>
        </div>

        {/* Card 4: التحصيلات */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 font-bold">التحصيلات</p>
            <p className="text-3xl font-black text-indigo-600 tracking-tight">
              {stats.collections.toLocaleString('en-US')}
            </p>
            <p className="text-[11px] text-slate-400 font-bold">عدد عمليات التحصيل</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Coins className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* 3. Search Bar & 4 Dropdown Filters Bar (Reference Design) */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        {/* Top Search Input & Reset Button */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={handleResetFilters}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold transition shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>إعادة ضبط</span>
          </button>

          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم العميل أو كود العميل أو رقم الزيارة..."
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Bottom 4 Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
          {/* 1. الفترة الزمنية */}
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 text-xs font-bold text-slate-700">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 flex flex-col">
                <span className="text-[10px] text-slate-400 font-normal">الفترة الزمنية</span>
                <select
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value as any)}
                  aria-label="الفترة الزمنية"
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="month">هذا الشهر</option>
                  <option value="today">اليوم</option>
                  <option value="week">هذا الأسبوع</option>
                  <option value="all">كل الفترات</option>
                </select>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </div>
          </div>

          {/* 2. نوع الزيارة */}
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 text-xs font-bold text-slate-700">
              <Tag className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 flex flex-col">
                <span className="text-[10px] text-slate-400 font-normal">نوع الزيارة</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as any)}
                  aria-label="نوع الزيارة"
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="all">كل الأنواع</option>
                  <option value="دورية">دورية</option>
                  <option value="تحصيل">تحصيل</option>
                  <option value="مرتجع">مرتجع</option>
                  <option value="متابعة">متابعة</option>
                </select>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </div>
          </div>

          {/* 3. حالة الزيارة */}
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 text-xs font-bold text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 flex flex-col">
                <span className="text-[10px] text-slate-400 font-normal">حالة الزيارة</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  aria-label="حالة الزيارة"
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="all">كل الحالات</option>
                  <option value="منفذة">منفذة</option>
                  <option value="معلقة">معلقة</option>
                  <option value="مرتجعة">مرتجعة</option>
                  <option value="ملغاة">ملغاة</option>
                </select>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </div>
          </div>

          {/* 4. الفرع / المندوب */}
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 text-xs font-bold text-slate-700">
              <Building className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 flex flex-col">
                <span className="text-[10px] text-slate-400 font-normal">الفرع / المندوب</span>
                <select
                  value={repFilter}
                  onChange={(e) => setRepFilter(e.target.value)}
                  aria-label="الفرع أو المندوب"
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer truncate max-w-[130px]"
                >
                  <option value="all">حسب الصلاحية</option>
                  {users
                    .filter((u) => u.role === 'sales_rep' || u.role === 'supervisor')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.branchName || 'عام'})
                      </option>
                    ))}
                </select>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </div>
          </div>
        </div>
      </div>

      {/* 4. The Visits Table (Matching exact columns and dark header) */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-[#0f1b2d] text-white text-xs font-bold select-none">
                <th className="py-3.5 px-4 text-right">العميل</th>
                <th className="py-3.5 px-4 text-center">كود العميل</th>
                <th className="py-3.5 px-4 text-center">رقم الزيارة / التاريخ</th>
                <th className="py-3.5 px-4 text-center">نوع الزيارة</th>
                <th className="py-3.5 px-4 text-center">المبلغ</th>
                <th className="py-3.5 px-4 text-center">الحالة</th>
                <th className="py-3.5 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedVisits.map((v) => {
                const meta = customerMeta.get(v.customerId) || (v.customerCode ? customerMeta.get(v.customerCode) : null);
                const displayArea = meta?.area || 'الفرع الرئيسي';

                // Type styling
                const isReturnType = v.isReturn || v.type === 'فاتورة مرتجع لدي العميل' || v.type === 'مرتجع';
                const isCollection = v.type === 'تحصيل';

                // Amount
                let amountText = '—';
                if (isCollection && v.collectedAmount && v.collectedAmount > 0) {
                  amountText = `${formatCurrency(v.collectedAmount)} ج.م`;
                } else if (isReturnType && v.returnValue && v.returnValue > 0) {
                  amountText = `${formatCurrency(v.returnValue)} ج.م`;
                } else if (v.orderAmount && v.orderAmount > 0) {
                  amountText = `${formatCurrency(v.orderAmount)} ج.م`;
                }

                return (
                  <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* العميل: اسم + منطقة مع أيقونة MapPin */}
                    <td className="py-3.5 px-4">
                      <div className="font-black text-slate-900 text-sm">{v.customerName || 'عميل نقدي'}</div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 font-bold mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{displayArea}</span>
                      </div>
                    </td>

                    {/* كود العميل: رقاقة زرقاء ناعمة */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg font-mono font-bold text-xs">
                        {v.customerCode || 'CUST000000'}
                      </span>
                    </td>

                    {/* رقم الزيارة / التاريخ مع أيقونة تقويم */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700">
                        <span>{formatArabicDateWithDay(v.date)}</span>
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </div>
                    </td>

                    {/* نوع الزيارة: دورية / مرتجع / تحصيل */}
                    <td className="py-3.5 px-4 text-center">
                      {isReturnType ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
                          <Gift className="w-3.5 h-3.5 text-amber-600" />
                          <span>مرتجع</span>
                        </span>
                      ) : isCollection ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                          <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                          <span>تحصيل</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-bold">
                          <RotateCw className="w-3.5 h-3.5 text-blue-500" />
                          <span>دورية</span>
                        </span>
                      )}
                    </td>

                    {/* المبلغ */}
                    <td className="py-3.5 px-4 text-center font-black text-slate-800 text-sm">
                      {amountText}
                    </td>

                    {/* الحالة: منفذة / مرتجعة / معلقة */}
                    <td className="py-3.5 px-4 text-center">
                      {v.status === 'منفذة' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100/70 text-emerald-800 rounded-full text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>منفذة</span>
                        </span>
                      ) : isReturnType ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100/70 text-amber-800 rounded-full text-xs font-bold">
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                          <span>مرتجعة</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>معلقة</span>
                        </span>
                      )}
                    </td>

                    {/* الإجراءات: عرض | 👁️ */}
                    <td className="py-3.5 px-4 text-center">
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
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                    لا توجد زيارات مطابقة للبحث أو الفلاتر المحددة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Table Footer / Pagination (Matching Screenshot Layout) */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4 select-none">
          {/* Right (in RTL): عدد النتائج في الصفحة */}
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span>عدد النتائج في الصفحة:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="عدد النتائج في الصفحة"
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-black text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          {/* Center: Pagination numbers with Chevron controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setVisitsPage((p) => Math.max(1, p - 1))}
                disabled={visitsPage === 1}
                aria-label="الصفحة السابقة"
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p = i + 1;
                if (totalPages > 5) {
                  if (visitsPage > 3) {
                    p = visitsPage - 2 + i;
                    if (p > totalPages) p = totalPages - (4 - i);
                  }
                }
                if (p < 1 || p > totalPages) return null;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setVisitsPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-black flex items-center justify-center transition ${
                      visitsPage === p
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setVisitsPage((p) => Math.min(totalPages, p + 1))}
                disabled={visitsPage === totalPages}
                aria-label="الصفحة التالية"
                className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Left (in RTL): عرض X - Y من إجمالي Z زيارة */}
          <div className="text-xs font-bold text-slate-500">
            {filtered.length === 0 ? (
              'لا توجد زيارات'
            ) : (
              <span>
                عرض {(visitsPage - 1) * pageSize + 1} – {Math.min(visitsPage * pageSize, filtered.length)} من إجمالي{' '}
                <span className="font-black text-slate-800">{filtered.length.toLocaleString('en-US')}</span> زيارة
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 6. Form Modal: تسجيل زيارة جديدة */}
      {showForm && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <form
            onSubmit={submit}
            className="relative z-[60] bg-white rounded-3xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100"
            dir="rtl"
          >
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

              {form.type === 'تحصيل' && (
                <label className="block bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100">
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

              {/* أصناف الزيارة */}
              <div className="block mt-2">
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
                        onClick={() => {
                          if (form.type === 'فاتورة مرتجع لدي العميل') {
                            selectProductForReturn(p);
                          } else {
                            selectProductForVisit(p);
                          }
                        }}
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
              </div>

              {form.visitItems.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">الأصناف المضافة</span>
                    <span className="text-xs font-black text-blue-600">
                      {form.visitItems.reduce((s, i) => s + i.amount, 0).toLocaleString()} ج.م
                    </span>
                  </div>
                  {form.visitItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200"
                    >
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
              )}

              {/* بيانات المرتجع إن وجد */}
              {form.type === 'فاتورة مرتجع لدي العميل' && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-900">
                    <Gift className="w-4 h-4 text-amber-600" />
                    <span>تفاصيل المرتجع من العميل</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] text-amber-800 font-bold">قيمة المرتجع (ج.م) *</span>
                      <input
                        type="number"
                        value={form.returnValue || ''}
                        onChange={(e) => setForm({ ...form, returnValue: Number(e.target.value) })}
                        placeholder="0.00"
                        className="mt-1 w-full rounded-xl border border-amber-300 px-3 py-2 text-xs font-black bg-white text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </label>

                    <label className="block">
                      <span className="text-[11px] text-amber-800 font-bold">سبب المرتجع *</span>
                      <input
                        value={form.returnReason}
                        onChange={(e) => setForm({ ...form, returnReason: e.target.value })}
                        placeholder="تالف / كسر / منتهي..."
                        className="mt-1 w-full rounded-xl border border-amber-300 px-3 py-2 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </label>
                  </div>

                  {/* صور المرتجع */}
                  <div>
                    <span className="text-[11px] text-amber-800 font-bold block mb-1">صور المرتجع</span>
                    <div className="flex flex-wrap gap-2">
                      {form.returnImages.map((img, idx) => (
                        <div key={idx} className="relative w-12 h-12 rounded-xl border border-amber-200 overflow-hidden">
                          <img src={img} className="w-full h-full object-cover" alt="return" />
                          <button
                            type="button"
                            onClick={() => removeReturnImage(idx)}
                            className="absolute top-1 right-1 bg-rose-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]"
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
                          input.onchange = (ev) => {
                            const target = ev.target as HTMLInputElement;
                            const files = target?.files;
                            if (files) {
                              const urls = Array.from(files).map((f) => URL.createObjectURL(f));
                              setForm((prev) => ({ ...prev, returnImages: [...prev.returnImages, ...urls] }));
                            }
                          };
                          input.click();
                        }}
                        className="w-12 h-12 rounded-xl border-2 border-dashed border-amber-300 flex items-center justify-center text-amber-600 hover:bg-amber-100 transition"
                      >
                        <Upload className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <label className="block">
                <span className="text-xs text-slate-600 font-bold">ملاحظات الزيارة أو إفادة العميل</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="سجل ما تم في الزيارة أو إفادة العميل بالدفع..."
                />
              </label>

              {formErrors.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-xl text-xs font-bold space-y-1">
                  {formErrors.map((err, i) => (
                    <div key={i}>• {err}</div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-500/20 transition active:scale-95"
                >
                  حفظ الزيارة
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 7. Modal: تفاصيل الزيارة */}
      {selectedVisit && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedVisit(null);
          }}
        >
          <div
            className="relative z-[60] bg-white rounded-3xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100"
            dir="rtl"
          >
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">تفاصيل الزيارة</h2>
                  <p className="text-[11px] text-slate-400 font-mono">{selectedVisit.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold">العميل</p>
                  <p className="font-black text-slate-900 mt-0.5">{selectedVisit.customerName}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">{selectedVisit.customerCode}</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold">نوع الزيارة</p>
                  <p className="font-black text-blue-600 mt-0.5">{selectedVisit.type}</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold">التاريخ والتوقيت</p>
                  <p className="font-black text-slate-800 mt-0.5">
                    {formatArabicDateWithDay(selectedVisit.date)} {selectedVisit.time || ''}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold">الحالة</p>
                  <p
                    className={`font-black mt-0.5 ${
                      selectedVisit.status === 'منفذة' ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {selectedVisit.status}
                  </p>
                </div>
              </div>

              {/* المبالغ */}
              {(selectedVisit.collectedAmount > 0 || selectedVisit.returnValue > 0) && (
                <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">المبلغ المسجل:</span>
                  <span className="font-black text-base text-blue-700">
                    {formatCurrency(selectedVisit.collectedAmount || selectedVisit.returnValue || 0)} ج.م
                  </span>
                </div>
              )}

              {/* الملاحظات وإفادة العميل */}
              {selectedVisit.notes && (
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                  <p className="text-[10px] text-slate-400 font-bold mb-1">ملاحظات / إفادة العميل</p>
                  <p className="font-bold text-slate-800 leading-relaxed">{selectedVisit.notes}</p>
                </div>
              )}

              {/* صور المرتجع */}
              {selectedVisit.returnImages && selectedVisit.returnImages.length > 0 && (
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                  <p className="text-[10px] text-slate-400 font-bold mb-2">صور مرفقة بالزيارة</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedVisit.returnImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden cursor-pointer hover:opacity-90"
                        onClick={() => setLightboxImage(img)}
                      >
                        <img src={img} className="w-full h-full object-cover" alt="visit attachment" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedVisit(null)}
                  className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Lightbox Zoom */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxImage(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="relative flex items-center justify-center max-w-[90vh] max-h-[90vh]">
            <img
              src={lightboxImage}
              alt="return preview"
              className="max-w-[85vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain bg-white p-2 border border-white/20"
            />
          </div>
        </div>
      )}
    </div>
  );
};
