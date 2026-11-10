import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileImage,
  Filter,
  Image as ImageIcon,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  Upload,
  User,
  Warehouse,
  X,
  XCircle,
  Printer,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatArabicDate, formatCurrency } from '../services/invoiceService';
import { Customer, CustomerVisit, Product } from '../types';

interface ReturnedItemDraft {
  id: string;
  productId?: string;
  productCode: string;
  productName: string;
  cartonCount: number;
  pieceCount: number;
  unitPrice: number;
  reason: string;
  condition: 'good_condition' | 'damaged' | 'expired';
}

export const UnifiedReturnsView: React.FC = () => {
  const RETURNS_PAGE_SIZE = 8;
  const {
    currentUser,
    customers,
    products,
    visits,
    getVisibleVisits,
    getVisibleCustomers,
    getVisibleProducts,
    addVisit,
    updateVisit,
    activeSectorFilter,
    setActiveSectorFilter
  } = useApp();

  const visibleVisits = getVisibleVisits();

  // Filters & State
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'at_customer' | 'at_warehouse' | 'closed' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleReturnsCount, setVisibleReturnsCount] = useState(RETURNS_PAGE_SIZE);

  useEffect(() => {
    setVisibleReturnsCount(RETURNS_PAGE_SIZE);
  }, [activeTabFilter, searchTerm]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('الكل');
  const [flashMsg, setFlashMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // New Return Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [generalReason, setGeneralReason] = useState('مرتجع بضاعة بطلب العميل');
  const [itemsDraft, setItemsDraft] = useState<ReturnedItemDraft[]>([
    {
      id: `draft-${Date.now()}-1`,
      productCode: '',
      productName: '',
      cartonCount: 1,
      pieceCount: 0,
      unitPrice: 0,
      reason: 'فائض عن حاجة العميل',
      condition: 'good_condition'
    }
  ]);
  const [attachedPhotos, setAttachedPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preview Image Lightbox
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Close/Action Modal State
  const [actionVisit, setActionVisit] = useState<CustomerVisit | null>(null);
  const [actionNote, setActionNote] = useState('');

  // Print Warehouse Return Voucher State
  const [printReturnVoucher, setPrintReturnVoucher] = useState<CustomerVisit | null>(null);

  const handleExportReturnExcel = (visit: CustomerVisit) => {
    let rows: Array<{ code: string; name: string; cartons: number; pieces: number; condition: string; reason: string }> = [];
    if (visit.returnItemsList && Array.isArray(visit.returnItemsList) && visit.returnItemsList.length > 0) {
      rows = visit.returnItemsList.map((item: any) => ({
        code: item.productCode || '---',
        name: item.productName || 'صنف مرتجع',
        cartons: item.cartonCount || 0,
        pieces: item.pieceCount || 0,
        condition: item.condition === 'good_condition' ? 'سليمة قابلة للبيع' : item.condition === 'damaged' ? 'تالفة كسر/عيب' : 'منتهية الصلاحية',
        reason: item.reason || visit.returnReason || 'مرتجع عميل',
      }));
    } else {
      rows = [{
        code: '---',
        name: visit.returnItems || 'أصناف مرتجعة متنوعة',
        cartons: visit.returnedCartons || 0,
        pieces: 0,
        condition: 'تحت الفحص بالمخزن',
        reason: visit.returnReason || 'مرتجع عميل',
      }];
    }

    const headers = ['كود الصنف', 'اسم الصنف', 'عدد الكراتين', 'عدد القطع', 'حالة البضاعة', 'سبب الارتجاع'];
    const csvContent = '\uFEFF' + [
      `إذن استلام بضاعة مرتجعة - مجموعة الطنطاوي للتجارة والتوزيع`,
      `العميل: ${visit.customerName || ''} (كود: ${visit.customerCode || ''})`,
      `المندوب المستلم: ${visit.repName || ''} - الفرع: ${visit.branchName || ''} - التاريخ: ${visit.date || ''}`,
      `قيمة المرتجع التقديرية: ${visit.returnValue || 0} ج.م`,
      '',
      headers.join(','),
      ...rows.map((r) => `"${r.code}","${r.name}",${r.cartons},${r.pieces},"${r.condition}","${r.reason}"`),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `اذن_استلام_مرتجع_${visit.customerCode || 'عميل'}_${visit.date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Extract all return visits
  const returnVisits = useMemo(() => {
    return visibleVisits.filter((v) => Boolean(v.isReturn) || v.type === 'مرتجع' || v.outcome === 'مرتجع لدي العميل');
  }, [visibleVisits]);

  // Distinct branches for filtering
  const branches = useMemo(() => {
    const set = new Set<string>();
    returnVisits.forEach((v) => {
      if (v.branchName) set.add(v.branchName);
    });
    return ['الكل', ...Array.from(set)];
  }, [returnVisits]);

  // Filtered Returns List
  const filteredReturns = useMemo(() => {
    return returnVisits.filter((v) => {
      // 1. Branch filter
      if (selectedBranchFilter !== 'الكل' && v.branchName !== selectedBranchFilter) return false;

      // 2. Status tab filter
      const status = v.returnStatus || 'عند العميل';
      if (activeTabFilter === 'at_customer') {
        if (status === 'مغلق' || status === 'مرفوض' || status === 'تم الاستلام بالمخزن') return false;
      } else if (activeTabFilter === 'at_warehouse') {
        if (status !== 'تم الاستلام بالمخزن' && status !== 'جاري تصفية المرتجع') return false;
      } else if (activeTabFilter === 'closed') {
        if (status !== 'مغلق') return false;
      } else if (activeTabFilter === 'rejected') {
        if (status !== 'مرفوض' && status !== 'تعذر الاستلام') return false;
      }

      // 3. Search query
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const custName = (v.customerName || '').toLowerCase();
        const custCode = (v.customerCode || '').toLowerCase();
        const repName = (v.repName || '').toLowerCase();
        const branch = (v.branchName || '').toLowerCase();
        const items = (v.returnItems || '').toLowerCase();
        if (!custName.includes(q) && !custCode.includes(q) && !repName.includes(q) && !branch.includes(q) && !items.includes(q)) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [returnVisits, selectedBranchFilter, activeTabFilter, searchTerm]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalValue = 0;
    let pendingCount = 0;
    let inWarehouseCount = 0;
    let closedCount = 0;

    returnVisits.forEach((v) => {
      totalValue += Number(v.returnValue) || 0;
      const st = v.returnStatus || 'عند العميل';
      if (st === 'مغلق') {
        closedCount++;
      } else if (st === 'تم الاستلام بالمخزن' || st === 'جاري تصفية المرتجع') {
        inWarehouseCount++;
      } else if (st !== 'مرفوض') {
        pendingCount++;
      }
    });

    return {
      totalCount: returnVisits.length,
      totalValue,
      pendingCount,
      inWarehouseCount,
      closedCount
    };
  }, [returnVisits]);

  // Filtered Customers for Search in Create Modal
  // 🔒 الفلترة حسب الصلاحية: المندوب يرى عملاءه فقط، المشرف يرى عملاء مناديبه،
  //    مدير الفرع يرى فرعه، والقطاع (منزلي/كهربائي) مطبّق تلقائياً.
  const matchedCustomers = useMemo(() => {
    const pool = getVisibleCustomers();
    if (!customerSearch.trim()) return pool.slice(0, 15);
    const q = customerSearch.trim().toLowerCase();
    return pool.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.branchName && c.branchName.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [customers, customerSearch, currentUser, getVisibleCustomers]);

  // 🔎 البحث الذكي في الأصناف (مقيّد بـ sector/فرع الموظف من getVisibleProducts)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const editingDraft = itemsDraft.find((d) => d.id === editingDraftId);
  const productSuggestions = useMemo(() => {
    const q = (editingDraft?.productName || '').trim().toLowerCase();
    if (q.length < 1) return [];
    return getVisibleProducts()
      .filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.code && p.code.toLowerCase().includes(q)) ||
          (p.unifiedCode && p.unifiedCode.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [editingDraftId, editingDraft?.productName, products, currentUser, getVisibleProducts]);

  // Handler: Add Item Draft Row
  const handleAddItemRow = () => {
    setItemsDraft((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}-${prev.length + 1}`,
        productCode: '',
        productName: '',
        cartonCount: 1,
        pieceCount: 0,
        unitPrice: 0,
        reason: 'فائض عن حاجة العميل',
        condition: 'good_condition'
      }
    ]);
  };

  // Handler: Select Product from catalog for draft item
  const handleSelectProductForDraft = (draftId: string, prod: Product) => {
    setItemsDraft((prev) =>
      prev.map((item) => {
        if (item.id !== draftId) return item;
        return {
          ...item,
          productId: prod.id,
          productCode: prod.code,
          productName: prod.name,
          unitPrice: prod.cartonPrice || 0
        };
      })
    );
  };

  // Handler: Remove Item Draft Row
  const handleRemoveItemRow = (draftId: string) => {
    if (itemsDraft.length === 1) return;
    setItemsDraft((prev) => prev.filter((i) => i.id !== draftId));
  };

  // Handler: Image Upload (Multiple photos)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const result = loadEvt.target?.result as string;
        if (result) {
          setAttachedPhotos((prev) => [...prev, result]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Handler: Remove an attached photo
  const handleRemovePhoto = (idx: number) => {
    setAttachedPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // Calculate Draft Total Value
  const draftTotalValue = useMemo(() => {
    return itemsDraft.reduce((acc, item) => acc + (item.cartonCount * item.unitPrice), 0);
  }, [itemsDraft]);

  // Handler: Submit New Return
  const handleSubmitReturn = async () => {
    if (!selectedCustomer) {
      alert('يرجى اختيار العميل أولاً');
      return;
    }
    const validItems = itemsDraft.filter((i) => i.productName.trim() || i.productCode.trim());
    if (validItems.length === 0) {
      alert('يرجى إضافة صنف واحد على الأقل للمرتجع');
      return;
    }

    setIsSubmitting(true);
    try {
      const itemsSummary = validItems
        .map((i) => `${i.productName || i.productCode} (${i.cartonCount} كرتونة${i.pieceCount > 0 ? ` + ${i.pieceCount} ق` : ''}) [${i.reason}]`)
        .join(' | ');

      const res = addVisit({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerCode: selectedCustomer.code,
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        repId: currentUser?.id,
        repName: currentUser?.name || 'المندوب',
        branchName: selectedCustomer.branchName || currentUser?.branchName || 'الفرع الرئيسي',
        type: 'مرتجع',
        outcome: 'مرتجع لدي العميل',
        isReturn: true,
        returnValue: draftTotalValue,
        returnReason: generalReason,
        returnItems: itemsSummary,
        returnStatus: 'بانتظار المشرف',
        returnImages: attachedPhotos,
        notes: `إذن مرتجع مسجل بواسطة المندوب: ${currentUser?.name} • الأصناف: ${validItems.length} صنف • الإجمالي التقديري: ${formatCurrency(draftTotalValue)}`
      });

      if (res.success) {
        setFlashMsg({ type: 'ok', text: `تم تسجيل إذن المرتجع للعميل (${selectedCustomer.name}) بنجاح! يتم متابعته فوراً في شاشة المرتجعات.` });
        setIsCreateModalOpen(false);
        setSelectedCustomer(null);
        setCustomerSearch('');
        setAttachedPhotos([]);
        setItemsDraft([
          {
            id: `draft-${Date.now()}-1`,
            productCode: '',
            productName: '',
            cartonCount: 1,
            pieceCount: 0,
            unitPrice: 0,
            reason: 'فائض عن حاجة العميل',
            condition: 'good_condition'
          }
        ]);
        setTimeout(() => setFlashMsg(null), 5000);
      } else {
        alert(res.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Update Return Stage (Warehouse receipt / Close / Reject)
  const handleUpdateReturnStage = (visitId: string, newStatus: any, note: string) => {
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) return;
    const res = updateVisit({
      ...visit,
      returnStatus: newStatus,
      returnHandledBy: currentUser?.name || 'المسؤول',
      returnHandledAt: new Date().toISOString(),
      returnHandledRole: currentUser?.role || 'user',
      returnNote: note || undefined
    });

    if (res.success) {
      setFlashMsg({
        type: 'ok',
        text: `تم تحديث حالة المرتجع بنجاح إلى: (${newStatus}) بواسطة ${currentUser?.name}`
      });
      setActionVisit(null);
      setActionNote('');
      setTimeout(() => setFlashMsg(null), 4000);
    } else {
      alert(res.message);
    }
  };

  // Roles that can close or receive returns
  const canManageReturn = ['admin', 'developer', 'branch_manager', 'supervisor', 'warehouse_keeper'].includes(
    currentUser?.role || ''
  );

  return (
    <div className="tantawy-screen space-y-4 pb-20" dir="rtl">
      
      {/* Flash Alert */}
      {flashMsg && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-black shadow-lg flex items-center justify-between animate-in fade-in sticky top-16 z-30 ${
            flashMsg.type === 'ok' ? 'bg-[var(--app-ok)] text-white' : 'bg-[var(--app-risk)] text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{flashMsg.text}</span>
          </div>
          <button type="button" onClick={() => setFlashMsg(null)} className="cursor-pointer text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Screen Header & Statistics */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-[var(--app-warn)] border border-[var(--app-warn)] text-[var(--app-warn-text)] flex items-center justify-center shrink-0 shadow-lg shadow-[0_0_20px_rgba(0,0,0,0.1)]">
              <RotateCcw className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  إدارة ومتابعة المرتجعات الموحدة
                </h1>
                <span className="bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-[var(--app-warn-line)]">
                  شاشة شاملة
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium mt-1">
                تسجيل مرتجعات العملاء من المندوب بالصور والأصناف • متابعة استلام المخزن • اعتماد وإغلاق الطلب من أمين المخزن أو المشرف أو الإدارة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            {/* Create Return Button */}
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--app-warn)] hover:bg-[var(--app-warn)] active:scale-95 text-slate-950 font-black text-xs shadow-lg shadow-[0_0_20px_rgba(0,0,0,0.15)] transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>تسجيل مرتجع جديد لعميل 📝</span>
            </button>
          </div>
        </div>

        {/* Aggregate KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col transition hover:border-[var(--app-accent)] duration-200 group">
            <div className="flex items-center justify-between mb-2.5">
              <Package className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">إجمالي المرتجعات</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
              {metrics.totalCount} <span className="text-xs font-bold text-slate-400">إذن مرتجع</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              القيمة الإجمالية: <strong className="text-[var(--app-warn-text)]">{formatCurrency(metrics.totalValue)} ج.م</strong>
            </div>
          </div>

          <div className="bg-[var(--app-warn-tint)] rounded-2xl p-4 border border-[var(--app-warn-line)] shadow-sm flex flex-col transition hover:border-[var(--app-warn)] duration-200 group">
            <div className="flex items-center justify-between mb-2.5">
              <Clock className="w-4 h-4 text-[var(--app-warn-text)]" />
              <span className="text-[10px] font-bold text-[var(--app-warn-text)] uppercase tracking-tighter">عند العميل (بانتظار الاستلام)</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[var(--app-warn-text)] mt-1">
              {metrics.pendingCount} <span className="text-xs font-bold text-[var(--app-warn-text)]">عميل</span>
            </div>
            <div className="text-[10px] text-[var(--app-warn-text)] mt-0.5">
              تنتظر سيارة المخزن أو المندوب للاستلام
            </div>
          </div>

          <div className="bg-[var(--app-navy-tint)] rounded-2xl p-4 border border-[var(--app-navy-line)] shadow-sm flex flex-col transition hover:border-[var(--app-navy)] duration-200 group">
            <div className="flex items-center justify-between mb-2.5">
              <Warehouse className="w-4 h-4 text-[var(--app-navy-text)]" />
              <span className="text-[10px] font-bold text-[var(--app-navy-text)] uppercase tracking-tighter">بالمخزن (قيد الفحص)</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[var(--app-navy-text)] mt-1">
              {metrics.inWarehouseCount} <span className="text-xs font-bold text-[var(--app-navy-text)]">شحنة</span>
            </div>
            <div className="text-[10px] text-[var(--app-navy-text)] mt-0.5">
              تم تسليمها لأمين المخزن للمراجعة
            </div>
          </div>

          <div className="bg-[var(--app-ok-tint)] rounded-2xl p-4 border border-[var(--app-ok-line)] shadow-sm flex flex-col transition hover:border-[var(--app-ok)] duration-200 group">
            <div className="flex items-center justify-between mb-2.5">
              <CheckCircle2 className="w-4 h-4 text-[var(--app-ok-text)]" />
              <span className="text-[10px] font-bold text-[var(--app-ok-text)] uppercase tracking-tighter">مغلقة ومعتمدة</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[var(--app-ok-text)] mt-1">
              {metrics.closedCount} <span className="text-xs font-bold text-[var(--app-ok-text)]">طلب</span>
            </div>
            <div className="text-[10px] text-[var(--app-ok-text)] mt-0.5">
              تمت التسوية وإرجاع الرصيد للعميل
            </div>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setActiveTabFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                activeTabFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              الكل ({returnVisits.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTabFilter('at_customer')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                activeTabFilter === 'at_customer'
                  ? 'bg-[var(--app-warn)] text-white shadow-xs'
                  : 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] hover:bg-[var(--app-warn-tint)]'
              }`}
            >
              لدى العميل ({metrics.pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTabFilter('at_warehouse')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                activeTabFilter === 'at_warehouse'
                  ? 'bg-[var(--app-navy)] text-white shadow-xs'
                  : 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] hover:bg-[var(--app-navy-tint)]'
              }`}
            >
              بالمخزن ({metrics.inWarehouseCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTabFilter('closed')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                activeTabFilter === 'closed'
                  ? 'bg-[var(--app-ok)] text-white shadow-xs'
                  : 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] hover:bg-[var(--app-ok-tint)]'
              }`}
            >
              المغلقة ({metrics.closedCount})
            </button>
          </div>

          {/* Search & Branch Filter */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث باسم العميل، الكود، الصنف..."
                className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-[var(--app-warn)] bg-slate-50"
              />
            </div>

            {branches.length > 2 && (
              <select
                aria-label="تصفية الفرع"
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none bg-slate-50 text-slate-700"
              >
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b === 'الكل' ? 'كل الفروع' : b}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </section>

      {/* Returns Cards / List */}
      {filteredReturns.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] flex items-center justify-center mx-auto shadow-xs">
            <RotateCcw className="w-8 h-8" />
          </div>
          <h3 className="text-base font-black text-slate-900">لا توجد أذونات مرتجعات تطابق الفلترة الحالية</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            يمكنك تسجيل مرتجع جديد لأي عميل بالضغط على زر "تسجيل مرتجع جديد لعميل" بالأعلى مع إمكانية إضافة أصناف وصور متعددة.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredReturns.slice(0, visibleReturnsCount).map((visit) => {
            const customer = customers.find((c) => c.id === visit.customerId || c.code === visit.customerCode);
            const status = visit.returnStatus || 'عند العميل';
            const photos = visit.returnImages || [];

            const isClosed = status === 'مغلق';
            const isAtWarehouse = status === 'تم الاستلام بالمخزن' || status === 'جاري تصفية المرتجع';
            const isPending = !isClosed && !isAtWarehouse && status !== 'مرفوض';

            return (
              <div
                key={visit.id}
                className={`bg-white rounded-3xl border p-4 sm:p-5 shadow-xs transition hover:shadow-md space-y-3.5 ${
                  isClosed
                    ? 'border-slate-200/80 bg-slate-50/40'
                    : isAtWarehouse
                    ? 'border-[var(--app-navy-line)] ring-1 ring-[var(--app-navy)]'
                    : 'border-[var(--app-warn-line)] ring-1 ring-[var(--app-warn)]'
                }`}
              >
                {/* Header: Customer Name, Status Badge, Handled info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black ${
                        isClosed
                          ? 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)]'
                          : isAtWarehouse
                          ? 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]'
                          : 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]'
                      }`}
                    >
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm sm:text-base font-black text-slate-900">
                          {visit.customerName || customer?.name || 'عميل مسجل'}
                        </span>
                        {visit.customerCode && (
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                            كود: {visit.customerCode}
                          </span>
                        )}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            isClosed
                              ? 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border border-[var(--app-ok-line)]'
                              : isAtWarehouse
                              ? 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] border border-[var(--app-navy-line)] animate-pulse'
                              : 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border border-[var(--app-warn-line)] animate-pulse'
                          }`}
                        >
                          {status === 'عند العميل' ? '📍 عميل لديه مرتجع (عند العميل)' : status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium flex items-center gap-2 mt-0.5 flex-wrap">
                        <span>المندوب: <strong className="text-slate-800">{visit.repName}</strong></span>
                        <span>•</span>
                        <span>الفرع: <strong className="text-slate-800">{visit.branchName || 'الفرع الرئيسي'}</strong></span>
                        <span>•</span>
                        <span>التاريخ: <strong className="text-slate-800">{visit.date} {visit.time || ''}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Value Summary */}
                  <div className="flex items-center gap-3 sm:self-center">
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] text-slate-400 font-bold">إجمالي قيمة المرتجع</div>
                      <div className="text-base sm:text-lg font-black text-[var(--app-warn-text)] app-num">
                        {formatCurrency(Number(visit.returnValue) || 0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Return Details & Attached Items */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
                  {/* Items Description */}
                  <div className="md:col-span-2 bg-slate-50/80 rounded-2xl p-3 border border-slate-200/60 space-y-1.5">
                    <div className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                      <Boxes className="w-3.5 h-3.5 text-slate-500" />
                      <span>تفاصيل الأصناف والكميات المرتجعة:</span>
                    </div>
                    <div className="text-xs text-slate-700 font-bold leading-relaxed whitespace-pre-wrap">
                      {visit.returnItems || 'لا توجد تفاصيل أصناف مسجلة'}
                    </div>
                    {visit.returnReason && (
                      <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                        سبب الارتجاع: <span className="font-bold text-slate-700">{visit.returnReason}</span>
                      </div>
                    )}
                  </div>

                  {/* Customer Contact & Branch */}
                  <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-200/60 space-y-1.5 text-[11px]">
                    <div className="font-black text-slate-800 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-500" />
                      <span>بيانات التواصل:</span>
                    </div>
                    {customer?.phone && (
                      <div className="flex items-center gap-1.5 text-slate-700 font-bold font-mono">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <a href={`tel:${customer.phone}`} className="hover:underline">
                          {customer.phone}
                        </a>
                      </div>
                    )}
                    {customer?.address && (
                      <div className="text-slate-600 line-clamp-2">
                        العنوان: {customer.address}
                      </div>
                    )}
                    {visit.returnHandledBy && (
                      <div className="pt-1 border-t border-slate-200/60 text-[10px] text-slate-500">
                        آخر إجراء: <strong className="text-slate-800">{visit.returnHandledBy}</strong> ({visit.returnHandledRole || 'مسؤول'})
                      </div>
                    )}
                  </div>
                </div>

                {/* Attached Return Photos Preview */}
                {photos.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-[var(--app-warn-text)]" />
                      <span>صور المرتجع المرفقة من المندوب ({photos.length} صورة) - انقر للتكبير:</span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {photos.map((imgUrl, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => setPreviewImage(imgUrl)}
                          className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl border border-slate-200 overflow-hidden shrink-0 group cursor-pointer shadow-2xs hover:scale-105 transition"
                          title="انقر لتكبير صورة المرتجع"
                        >
                          <img
                            src={imgUrl}
                            alt={`صورة مرتجع ${pIdx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-white">
                            <Eye className="w-4 h-4" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons for Warehouse / Supervisor / Manager / Admin */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="text-[11px] text-slate-500 font-bold">
                    حالة الطلب: <strong className="text-slate-800">{status}</strong>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* If still at customer, option to confirm receipt at warehouse */}
                    {canManageReturn && isPending && (
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateReturnStage(
                            visit.id,
                            'تم الاستلام بالمخزن',
                            'تم استلام بضاعة المرتجع بالمخزن المركزي/الفرعي وجاري الفحص والمعاينة'
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--app-navy)] hover:bg-[var(--app-navy)] text-white font-black text-[11px] shadow-xs transition cursor-pointer"
                        title="تأكيد وصول واستلام بضاعة المرتجع إلى المخزن"
                      >
                        <Warehouse className="w-3.5 h-3.5" />
                        <span>استلام البضاعة بالمخزن 🚚</span>
                      </button>
                    )}

                    {/* Final Close & Settle Button */}
                    {canManageReturn && !isClosed && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`هل أنت متأكد من اعتماد وإغلاق مرتجع العميل (${visit.customerName}) نهائياً؟`)) {
                            handleUpdateReturnStage(
                              visit.id,
                              'مغلق',
                              'تم اعتماد المرتجع وفحص البضاعة وإغلاق الطلب وتعديل حساب العميل والمخزن'
                            );
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white font-black text-[11px] shadow-xs transition cursor-pointer"
                        title="إغلاق وتسوية إذن المرتجع نهائياً وتحديث الحسابات والمخزن"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>إغلاق واعتماد المرتجع نهائياً ✓</span>
                      </button>
                    )}

                    {/* Reject Button */}
                    {canManageReturn && !isClosed && status !== 'مرفوض' && (
                      <button
                        type="button"
                        onClick={() => {
                          const reason = prompt('يرجى كتابة سبب رفض المرتجع:');
                          if (reason) {
                            handleUpdateReturnStage(visit.id, 'مرفوض', `تم رفض المرتجع: ${reason}`);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--app-risk-line)] text-[var(--app-risk-text)] hover:bg-[var(--app-risk-tint)] font-black text-[11px] transition cursor-pointer"
                        title="رفض إذن المرتجع"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>رفض</span>
                      </button>
                    )}

                    {/* Print Voucher & Export Excel for Warehouse Keeper */}
                    <button
                      type="button"
                      onClick={() => setPrintReturnVoucher(visit)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] border border-slate-300 transition cursor-pointer"
                      title="طباعة إذن استلام بضاعة المرتجع للمخزن"
                    >
                      <Printer className="w-3.5 h-3.5 text-teal-600" />
                      <span>طباعة إذن المخزن 🖨️</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportReturnExcel(visit)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300 transition cursor-pointer"
                      title="تصدير جدول الأصناف إكسل لأمين المخزن"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>إكسل الأصناف 📊</span>
                    </button>
                  </div>
                </div>

              </div>
            );
          })}

          {visibleReturnsCount < filteredReturns.length && (
            <div className="flex justify-center pt-2">
              <button type="button" onClick={() => setVisibleReturnsCount((c) => c + RETURNS_PAGE_SIZE)} className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black cursor-pointer shadow-sm">
                عرض المزيد من المرتجعات ({filteredReturns.length - visibleReturnsCount} متبقي)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= Lightbox Image Modal ================= */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-white/20 p-2 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImage}
              alt="معاينة صورة المرتجع"
              className="max-w-full max-h-[82vh] object-contain rounded-2xl"
            />
            <div className="p-2 text-center text-xs text-white/80 font-bold">
              معاينة صورة المرتجع بالحجم الكامل
            </div>
          </div>
        </div>
      )}

      {/* ================= New Return Creation Modal ================= */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          dir="rtl"
        >
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[var(--app-warn)] to-[var(--app-warn)] text-slate-950 p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-slate-950/15 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 text-slate-950" />
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg text-slate-950">
                    تسجيل إذن مرتجع جديد لعميل
                  </h3>
                  <p className="text-[11px] text-slate-950/80 font-bold">
                    إرفاق صور البضاعة • إضافة أصناف متعددة • متابعة وإغلاق فوري
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-950/10 hover:bg-slate-950/20 text-slate-950 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5 max-h-[78vh] overflow-y-auto text-xs">
              
              {/* 1. Customer Selection */}
              <div className="space-y-2">
                <label className="font-black text-slate-800 flex items-center justify-between">
                  <span>١. اختيار العميل:</span>
                  {selectedCustomer && (
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(null)}
                      className="text-[var(--app-warn-text)] hover:underline font-bold text-[11px]"
                    >
                      تغيير العميل
                    </button>
                  )}
                </label>

                {selectedCustomer ? (
                  <div className="bg-[var(--app-warn-tint)] rounded-2xl p-3 border border-[var(--app-warn-line)] flex items-center justify-between gap-3">
                    <div>
                      <div className="font-black text-slate-900 text-sm">{selectedCustomer.name}</div>
                      <div className="text-[11px] text-slate-600 font-bold">
                        كود: {selectedCustomer.code} • الفرع: {selectedCustomer.branchName} • الهاتف: {selectedCustomer.phone}
                      </div>
                    </div>
                    <span className="bg-[var(--app-warn)] text-slate-950 px-2 py-0.5 rounded font-black text-[10px]">
                      محدد
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="ابحث باسم العميل أو الكود لاختياره..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-[var(--app-warn)] bg-slate-50"
                    />
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                      {matchedCustomers.length === 0 && (
                        <div className="p-3 text-center text-[11px] font-bold text-slate-500">
                          لا توجد عملاء متاحين ضمن صلاحيتك{customerSearch.trim() ? ' بهذا البحث' : ''}.
                        </div>
                      )}
                      {matchedCustomers.map((cust) => (
                        <button
                          key={cust.id}
                          type="button"
                          onClick={() => setSelectedCustomer(cust)}
                          className="w-full text-right p-2.5 hover:bg-[var(--app-warn-tint)] transition flex items-center justify-between text-xs cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="font-black text-slate-900 truncate">{cust.name}</div>
                            <div className="text-[10px] text-slate-500">
                              كود: {cust.code} • فرع: {cust.branchName || '—'}
                              {cust.repName ? ` • مندوب: ${cust.repName}` : ''}
                            </div>
                          </div>
                          <span className="text-[11px] font-black text-[var(--app-warn-text)]">اختيار ←</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. General Reason */}
              <div className="space-y-1.5">
                <label className="font-black text-slate-800">٢. سبب الارتجاع العام:</label>
                <input
                  type="text"
                  value={generalReason}
                  onChange={(e) => setGeneralReason(e.target.value)}
                  placeholder="مثال: مرتجع بضاعة بطلب العميل / تالف نقل / زيادة مخزون"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-[var(--app-warn)] bg-slate-50"
                />
              </div>

              {/* 3. Multi-Item Builder */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-black text-slate-800 flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-[var(--app-warn-text)]" />
                    <span>٣. قائمة الأصناف المرتجعة ({itemsDraft.length} صنف):</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="inline-flex items-center gap-1 text-[var(--app-warn-text)] hover:text-[var(--app-warn-text)] font-black text-[11px] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة صنف آخر +</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {itemsDraft.map((item, idx) => (
                    <div
                      key={item.id}
                      className="bg-slate-50 rounded-2xl p-3 border border-slate-200 space-y-2 relative"
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                        <span>صنف #{idx + 1}</span>
                        {itemsDraft.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(item.id)}
                            className="text-[var(--app-risk-text)] hover:text-[var(--app-risk-text)] cursor-pointer font-bold flex items-center gap-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>حذف</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">اسم الصنف أو كوده:</label>
                          <div className="relative">
                          <input
                            type="text"
                            value={item.productName}
                            onFocus={() => setEditingDraftId(item.id)}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditingDraftId(item.id);
                              setItemsDraft((prev) =>
                                prev.map((i) => (i.id === item.id ? { ...i, productName: val } : i))
                              );
                            }}
                            placeholder="اكتب اسم الصنف أو الكود... (اقتراحات ذكية)"
                            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-bold focus:outline-none focus:border-[var(--app-warn)] bg-white"
                          />
                          {editingDraftId === item.id && productSuggestions.length > 0 && (
                            <div className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border border-[var(--app-warn-line)] bg-white shadow-xl divide-y divide-slate-100">
                              {productSuggestions.map((prod) => (
                                <button
                                  key={prod.id}
                                  type="button"
                                  onClick={() => {
                                    handleSelectProductForDraft(item.id, prod);
                                    setEditingDraftId(null);
                                  }}
                                  className="w-full text-right p-2 hover:bg-[var(--app-warn-tint)] transition flex items-center justify-between gap-2 text-xs cursor-pointer"
                                >
                                  <div className="min-w-0">
                                    <div className="font-black text-slate-900 truncate">{prod.name}</div>
                                    <div className="text-[10px] text-slate-500">
                                      كود: {prod.code}
                                      {prod.unifiedCode ? ` • موحّد: ${prod.unifiedCode}` : ''}
                                      {prod.branchName ? ` • ${prod.branchName}` : ''}
                                    </div>
                                  </div>
                                  <span className="shrink-0 text-[10px] font-black text-[var(--app-ok-text)]">
                                    {(prod.branchStockActual || 0) > 0 ? `${prod.branchStockActual} كرتونة` : 'غير متوفر'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">سبب إرجاع الصنف:</label>
                          <input
                            type="text"
                            value={item.reason}
                            onChange={(e) => {
                              const val = e.target.value;
                              setItemsDraft((prev) =>
                                prev.map((i) => (i.id === item.id ? { ...i, reason: val } : i))
                              );
                            }}
                            placeholder="سبب إرجاع هذا الصنف..."
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:outline-none bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">عدد الكراتين:</label>
                          <input
                            type="number"
                            min="0"
                            value={item.cartonCount}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setItemsDraft((prev) =>
                                prev.map((i) => (i.id === item.id ? { ...i, cartonCount: val } : i))
                              );
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:outline-none bg-white text-center"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">قطع فردية:</label>
                          <input
                            type="number"
                            min="0"
                            value={item.pieceCount}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setItemsDraft((prev) =>
                                prev.map((i) => (i.id === item.id ? { ...i, pieceCount: val } : i))
                              );
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:outline-none bg-white text-center"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">سعر الكرتونة:</label>
                          <input
                            type="number"
                            min="0"
                            value={item.unitPrice}
                            onChange={(e) => {
                              const val = Math.max(0, parseFloat(e.target.value) || 0);
                              setItemsDraft((prev) =>
                                prev.map((i) => (i.id === item.id ? { ...i, unitPrice: val } : i))
                              );
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:outline-none bg-white text-center"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between bg-[var(--app-warn-tint)] p-3 rounded-2xl border border-[var(--app-warn-line)]">
                  <span className="font-black text-slate-800">إجمالي قيمة المرتجع التقديرية:</span>
                  <span className="text-sm font-black text-[var(--app-warn-text)] app-num">
                    {formatCurrency(draftTotalValue)}
                  </span>
                </div>
              </div>

              {/* 4. Multi-Photo Attachments */}
              <div className="space-y-2">
                <label className="font-black text-slate-800 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-[var(--app-warn-text)]" />
                  <span>٤. إرفاق صور المرتجعات (كاميرا الهاتف أو المعرض):</span>
                </label>

                <div className="flex items-center gap-2 flex-wrap">
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[var(--app-warn)] bg-[var(--app-warn-tint)] hover:bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] font-black text-xs transition cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>اختيار أو التقاط صور (متعدد)</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      capture="environment"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-slate-400">
                    يمكنك التقاط عدة صور للبضاعة، التلفيات، أو الكراتين
                  </span>
                </div>

                {attachedPhotos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-2">
                    {attachedPhotos.map((url, pIdx) => (
                      <div
                        key={pIdx}
                        className="relative rounded-xl border border-slate-200 overflow-hidden aspect-square group shadow-xs"
                      >
                        <img src={url} alt={`مرفق ${pIdx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(pIdx)}
                          className="absolute top-1 left-1 w-6 h-6 rounded-full bg-[var(--app-risk)] text-white flex items-center justify-center cursor-pointer shadow"
                          title="حذف هذه الصورة"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 sm:p-5 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                disabled={isSubmitting || !selectedCustomer}
                onClick={handleSubmitReturn}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--app-warn)] hover:bg-[var(--app-warn)] active:scale-95 text-slate-950 font-black text-xs shadow-md transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تأكيد وتسجيل إذن المرتجع الآن</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= Printable Warehouse Return Voucher Modal ================= */}
      {printReturnVoucher && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          dir="rtl"
        >
          <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-300 overflow-hidden my-4">
            {/* Top Toolbar (Excluded in print) */}
            <div className="print:hidden bg-slate-900 text-white p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-teal-400" />
                <span className="font-black text-sm">معاينة وطباعة إذن استلام مرتجع للمخزن</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-xs shadow transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الإذن الآن</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportReturnExcel(printReturnVoucher)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs shadow transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل كـ Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintReturnVoucher(null)}
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Voucher Paper */}
            <div className="p-6 sm:p-8 bg-white text-slate-900 space-y-6 printable-voucher">
              {/* Company & Document Header */}
              <div className="border-b-2 border-slate-800 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 font-bold">جمهورية مصر العربية</div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">مجموعة الطنطاوي للتجارة والتوزيع</h2>
                  <p className="text-xs text-teal-700 font-bold mt-0.5">إدارة المستودعات واللوجستيات • إذن استلام بضاعة مرتجعة</p>
                </div>
                <div className="bg-slate-50 border-2 border-slate-800 rounded-2xl p-3 text-center sm:text-left min-w-[200px]">
                  <div className="text-[11px] font-bold text-slate-500">رقم الإذن المرجعي</div>
                  <div className="text-base font-black text-slate-900 app-num font-mono">
                    RET-{(printReturnVoucher.id || '0000').slice(-6).toUpperCase()}
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold mt-1">
                    التاريخ: {printReturnVoucher.date || new Date().toISOString().split('T')[0]}
                  </div>
                </div>
              </div>

              {/* Information Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 rounded-2xl p-4 border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold">اسم العميل:</span>
                  <span className="font-black text-slate-900 text-sm block">{printReturnVoucher.customerName || 'عميل نقدي'}</span>
                  <span className="text-[11px] text-slate-500 font-bold app-num font-mono">كود: {printReturnVoucher.customerCode || '---'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold">المندوب المسلّم:</span>
                  <span className="font-bold text-slate-800 block">{printReturnVoucher.repName || 'مندوب المبيعات'}</span>
                  <span className="text-[11px] text-slate-500">الفرع: {printReturnVoucher.branchName || 'الرئيسي'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold">الفرع / المخزن المستلم:</span>
                  <span className="font-bold text-slate-800 block">{printReturnVoucher.branchName || 'مخزن أكتوبر الرئيسي'}</span>
                  <span className="text-[11px] text-emerald-700 font-bold">
                    حالة الطلب: {printReturnVoucher.returnStatus === 'مغلق' || (printReturnVoucher.returnStatus as string) === 'closed' ? 'مستلم ومعتمد بالمخزن' : 'قيد الفحص والمراجعة'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold">إجمالي القيمة التقديرية:</span>
                  <span className="text-sm font-black text-slate-900 app-num block">
                    {formatCurrency(printReturnVoucher.returnValue || 0)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-semibold">إجمالي الكراتين: {printReturnVoucher.returnedCartons || 0} كرتونة</span>
                </div>
              </div>

              {/* Return Reason Statement */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs">
                <span className="font-black text-amber-900 ml-1">سبب الارتجاع المعتمد:</span>
                <span className="text-amber-800 font-medium">
                  {printReturnVoucher.returnReason || 'مرتجع بضاعة بطلب العميل ومراجعة إدارة المبيعات'}
                </span>
                {printReturnVoucher.notes && (
                  <div className="text-[11px] text-amber-700 mt-1">
                    <span className="font-bold">ملاحظات إضافية: </span>
                    <span>{printReturnVoucher.notes}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div>
                <h4 className="font-black text-xs text-slate-800 mb-2 flex items-center justify-between">
                  <span>بيان الأصناف والكميات المحولة إلى المخزن:</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    (تطابق الأصناف الفعلي مع إذن التسليم)
                  </span>
                </h4>
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-300 text-[11px]">
                      <tr>
                        <th className="p-2 w-10 text-center">#</th>
                        <th className="p-2">كود الصنف</th>
                        <th className="p-2">اسم الصنف والبيان</th>
                        <th className="p-2 text-center w-20">كرتونة</th>
                        <th className="p-2 text-center w-20">قطعة</th>
                        <th className="p-2 text-center">حالة البضاعة</th>
                        <th className="p-2">ملاحظات أمين المخزن</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold">
                      {printReturnVoucher.returnItemsList &&
                      Array.isArray(printReturnVoucher.returnItemsList) &&
                      printReturnVoucher.returnItemsList.length > 0 ? (
                        printReturnVoucher.returnItemsList.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2 text-center text-slate-500 text-[10px] app-num">{idx + 1}</td>
                            <td className="p-2 font-mono text-[11px] text-slate-600">{item.productCode || '---'}</td>
                            <td className="p-2 text-slate-900">{item.productName || 'صنف مرتجع'}</td>
                            <td className="p-2 text-center font-black text-slate-900 app-num">{item.cartonCount || 0}</td>
                            <td className="p-2 text-center font-black text-slate-900 app-num">{item.pieceCount || 0}</td>
                            <td className="p-2 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.condition === 'good_condition'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : item.condition === 'damaged'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {item.condition === 'good_condition'
                                  ? 'سليمة قابلة للبيع'
                                  : item.condition === 'damaged'
                                  ? 'تالفة كسر/عيب مصنعي'
                                  : 'منتهية الصلاحية'}
                              </span>
                            </td>
                            <td className="p-2 text-slate-400 text-[10px]">
                              {item.reason || 'مطابق للفحص الظاهري'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="p-2 text-center text-slate-500 text-[10px]">1</td>
                          <td className="p-2 font-mono text-[11px] text-slate-500">---</td>
                          <td className="p-2 text-slate-900">{printReturnVoucher.returnItems || 'أصناف مرتجعة متنوعة'}</td>
                          <td className="p-2 text-center font-black text-slate-900 app-num">{printReturnVoucher.returnedCartons || 0}</td>
                          <td className="p-2 text-center font-black text-slate-900 app-num">0</td>
                          <td className="p-2 text-center text-[10px] text-slate-600">تحت الفحص بالمخزن</td>
                          <td className="p-2 text-slate-400 text-[10px]">تم الاستلام من العميل</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Signatures & Approvals Section */}
              <div className="pt-4 border-t-2 border-slate-300">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
                    <div className="text-[11px] font-black text-slate-800 mb-1">المندوب المسلّم</div>
                    <div className="text-[10px] text-slate-500 mb-6">{printReturnVoucher.repName || 'مندوب الفرع'}</div>
                    <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto mb-1"></div>
                    <span className="text-[9px] text-slate-400">التوقيع والتاريخ</span>
                  </div>

                  <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
                    <div className="text-[11px] font-black text-slate-800 mb-1">سائق الحركة / الناقل</div>
                    <div className="text-[10px] text-slate-500 mb-6">مسؤول النقل واللوجستيات</div>
                    <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto mb-1"></div>
                    <span className="text-[9px] text-slate-400">التوقيع ورقم السيارة</span>
                  </div>

                  <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
                    <div className="text-[11px] font-black text-slate-800 mb-1">أمين المخزن المستلم</div>
                    <div className="text-[10px] text-slate-500 mb-6">مخزن {printReturnVoucher.branchName || 'الفرع'}</div>
                    <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto mb-1"></div>
                    <span className="text-[9px] text-slate-400">التوقيع والختم الرسمي</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Print Modal Footer */}
            <div className="print:hidden bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                يمكنك طباعة هذا الإذن مباشرة أو حفظه بصيغة PDF لأرشيف المستودع.
              </span>
              <button
                type="button"
                onClick={() => setPrintReturnVoucher(null)}
                className="px-5 py-2 rounded-xl bg-slate-300 hover:bg-slate-400 text-slate-800 font-bold text-xs cursor-pointer"
              >
                إغلاق المعاينة
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
