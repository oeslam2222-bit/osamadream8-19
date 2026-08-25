import {
  AlertCircle,
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  Building,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Edit2,
  FileSpreadsheet,
  Filter,
  History,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Truck,
  UserCheck,
  Warehouse,
  X,
  XCircle
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportProductsToExcel } from '../services/excelService';
import { formatCurrency } from '../services/invoiceService';
import { ItemStatus, Product, SalesPriority } from '../types';
import { getDepartmentMeta } from '../data/departmentMeta';

export const InventoryStockView: React.FC = () => {
  const {
    products,
    branches,
    currentUser,
    invoices,
    inventoryLogs,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustStock,
    approveOrder,
    forwardOrderToManager,
    rejectOrder,
    selectedBranchFilter
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'pending_approvals' | 'audit_logs'>('matrix');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [stockLevelFilter, setStockLevelFilter] = useState<'all' | 'low_stock' | 'out_of_stock' | 'healthy'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Pagination state for responsive performance
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(20);
  
  // Logs tab pagination
  const [logsCurrentPage, setLogsCurrentPage] = useState<number>(1);
  const [logsPerPage, setLogsPerPage] = useState<number | 'all'>(15);
  
  // Stock Transfer Modal
  const [stockTransferModal, setStockTransferModal] = useState<Product | null>(null);
  const [transferAmount, setTransferAmount] = useState<number>(10);
  
  // Quick Supply / Replenish Modal
  const [supplyModal, setSupplyModal] = useState<Product | null>(null);
  const [supplyCartons, setSupplyCartons] = useState<number>(10);
  const [supplyReason, setSupplyReason] = useState<string>('توريد واستلام شحنة جديدة من المصنع');

  // Reject Order Reason Prompt Modal
  const [rejectModalInvoiceId, setRejectModalInvoiceId] = useState<string | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState<string>('نفاذ الكمية أو عدم استيفاء شروط الائتمان');

  // Success Notification Toast
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Form State for Adding / Editing Product
  const [formData, setFormData] = useState<Partial<Product>>({
    code: '',
    name: '',
    salesPriority: 'عادي',
    category: 'بسكويت وويفر',
    status: 'متاح',
    cartonQuantity: 24,
    size: '',
    color: '',
    branchStockActual: 100,
    branchStockReserved: 100,
    mainWarehouseActual: 1000,
    mainWarehouseReserved: 1000,
    department: 'الأغذية والحلويات',
    classification: 'سوبر A',
    cartonPrice: 220,
    branchName: currentUser?.branchName || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.category && set.add(p.category));
    return ['الكل', ...Array.from(set)];
  }, [products]);

  // Filtered Products Matrix
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedBranchFilter !== 'الكل' && p.branchName && p.branchName !== selectedBranchFilter) {
        if (p.mainWarehouseActual <= 0 && p.branchStockActual <= 0) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const match =
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.department?.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (selectedCategory !== 'الكل' && p.category !== selectedCategory) {
        return false;
      }

      if (stockLevelFilter === 'low_stock') {
        if (p.branchStockReserved <= 0 || p.branchStockReserved > 25) return false;
      } else if (stockLevelFilter === 'out_of_stock') {
        if (p.branchStockReserved > 0) return false;
      } else if (stockLevelFilter === 'healthy') {
        if (p.branchStockReserved <= 25) return false;
      }

      return true;
    });
  }, [products, searchTerm, selectedCategory, stockLevelFilter, selectedBranchFilter]);

  // Paginated products
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  // Pending Approvals List (for Supervisors and Managers)
  const pendingInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const isPending =
        inv.status === 'قيد مراجعة المشرف' ||
        inv.status === 'معلقة بانتظار اعتماد الفرع' ||
        inv.status === 'قيد المراجعة';

      if (!isPending) return false;

      if (currentUser?.role === 'sales_rep') {
        return inv.repId === currentUser.id;
      }

      if (currentUser?.role === 'supervisor') {
        return inv.supervisorName === currentUser.name || inv.branchName === currentUser.branchName;
      }

      if (currentUser?.role === 'branch_manager') {
        return inv.branchName === currentUser.branchName;
      }

      return true; // Admin sees all
    });
  }, [invoices, currentUser]);

  // Low Stock & Out of Stock counts
  const stockMetrics = useMemo(() => {
    let outOfStockCount = 0;
    let lowStockCount = 0;
    let totalCartonsActual = 0;
    let totalCartonsReserved = 0;

    products.forEach((p) => {
      if (p.branchStockReserved <= 0) {
        outOfStockCount++;
      } else if (p.branchStockReserved <= 10) {
        lowStockCount++;
      }
      totalCartonsActual += p.branchStockActual;
      totalCartonsReserved += p.branchStockReserved;
    });

    return {
      outOfStockCount,
      lowStockCount,
      totalCartonsActual,
      totalCartonsReserved,
      pendingApprovalsCount: pendingInvoices.length
    };
  }, [products, pendingInvoices]);

  // Logs Tab Pagination
  const logsTotalPages = useMemo(() => {
    if (logsPerPage === 'all') return 1;
    return Math.max(1, Math.ceil(inventoryLogs.length / logsPerPage));
  }, [inventoryLogs.length, logsPerPage]);

  const displayedInventoryLogs = useMemo(() => {
    if (logsPerPage === 'all') return inventoryLogs;
    const start = (logsCurrentPage - 1) * logsPerPage;
    return inventoryLogs.slice(start, start + logsPerPage);
  }, [inventoryLogs, logsCurrentPage, logsPerPage]);

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) return;

    if (editingProduct) {
      updateProduct({ ...editingProduct, ...formData } as Product);
      setEditingProduct(null);
      setActionSuccessMsg(`تم تحديث بيانات الصنف (${formData.name}) بنجاح`);
    } else {
      const newProd: Product = {
        id: `p-${Date.now()}`,
        code: formData.code || `DRM-${Date.now()}`,
        name: formData.name || '',
        salesPriority: formData.salesPriority || 'عادي',
        category: formData.category || 'عام',
        status: formData.status || 'متاح',
        cartonQuantity: Number(formData.cartonQuantity) || 12,
        size: formData.size || 'قياسي',
        color: formData.color || 'افتراضي',
        branchStockActual: Number(formData.branchStockActual) || 0,
        branchStockReserved: Number(formData.branchStockReserved) || Number(formData.branchStockActual) || 0,
        mainWarehouseActual: Number(formData.mainWarehouseActual) || 0,
        mainWarehouseReserved: Number(formData.mainWarehouseReserved) || Number(formData.mainWarehouseActual) || 0,
        department: formData.department || 'عام',
        classification: formData.classification || 'فئة A',
        promoPrice: formData.promoPrice ? Number(formData.promoPrice) : undefined,
        cartonPrice: Number(formData.cartonPrice) || 200,
        branchName: formData.branchName || currentUser?.branchName || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
        cloudinaryPublicId: formData.code,
      };
      addProduct(newProd);
      setActionSuccessMsg(`تمت إضافة الصنف الجديد (${newProd.name}) مع رصيد افتتاحي ${newProd.branchStockActual} كرتونة`);
    }

    setShowAddModal(false);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  const handleExecuteTransfer = () => {
    if (!stockTransferModal || transferAmount <= 0) return;

    if (stockTransferModal.mainWarehouseActual < transferAmount) {
      alert('الكمية المطلوبة تتجاوز مخزون الكراتين الفعلي المتاح بالمخزن المركزي!');
      return;
    }

    // Move from main warehouse to branch
    adjustStock(
      stockTransferModal.id,
      transferAmount,
      -transferAmount,
      `تحويل مخزني داخلي (${transferAmount} كرتونة) من المخزن المركزي إلى ${stockTransferModal.branchName}`
    );
    setActionSuccessMsg(`تم بنجاح تحويل ${transferAmount} كرتونة لصالح ${stockTransferModal.branchName}`);
    setStockTransferModal(null);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  const handleExecuteSupply = () => {
    if (!supplyModal || supplyCartons <= 0) return;
    adjustStock(supplyModal.id, supplyCartons, 0, supplyReason);
    setActionSuccessMsg(`تم تسجيل توريد مباشر (+${supplyCartons} كرتونة) لصالح صنف (${supplyModal.name})`);
    setSupplyModal(null);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  const handleApprove = (invoiceId: string) => {
    const res = approveOrder(invoiceId, 'تم الفحص والموافقة والصرف الفعلي من المخزن');
    if (res.success) {
      setActionSuccessMsg(res.message);
      setTimeout(() => setActionSuccessMsg(null), 4500);
    } else {
      alert(res.message);
    }
  };

  const handleForwardToManager = (invoiceId: string) => {
    const res = forwardOrderToManager(invoiceId, 'تتطلب موافقة واعتماد مدير الفرع للكميات الكبيرة');
    if (res.success) {
      setActionSuccessMsg(res.message);
      setTimeout(() => setActionSuccessMsg(null), 4000);
    }
  };

  const handleRejectConfirm = () => {
    if (!rejectModalInvoiceId) return;
    const res = rejectOrder(rejectModalInvoiceId, rejectReasonText);
    if (res.success) {
      setActionSuccessMsg(res.message);
      setRejectModalInvoiceId(null);
      setTimeout(() => setActionSuccessMsg(null), 4500);
    }
  };

  return (
    <div className="space-y-4 pb-16">
      
      {/* Toast Notification */}
      {actionSuccessMsg && (
        <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between text-xs animate-in fade-in sticky top-20 z-30">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-200" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button onClick={() => setActionSuccessMsg(null)} className="text-white hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Alerts if Out of Stock or Pending Approvals exist */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Pending Approvals Card */}
        <div
          onClick={() => setActiveSubTab('pending_approvals')}
          className={`p-4 rounded-3xl border transition cursor-pointer flex items-center justify-between ${
            stockMetrics.pendingApprovalsCount > 0
              ? 'bg-amber-500/10 border-amber-400 text-amber-950 hover:bg-amber-500/20'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-bold">طلبيات بانتظار الاعتماد والصرف</div>
              <div className="text-xl font-black text-amber-900">
                {stockMetrics.pendingApprovalsCount} طلبية معلقة
              </div>
            </div>
          </div>
          <span className="text-xs font-black bg-amber-200 text-amber-900 px-2.5 py-1 rounded-xl">
            {activeSubTab === 'pending_approvals' ? 'مفتوح الآن' : 'عرض واعتماد ⚡'}
          </span>
        </div>

        {/* Low Stock Warning Card */}
        <div
          onClick={() => {
            setActiveSubTab('matrix');
            setStockLevelFilter('low_stock');
          }}
          className={`p-4 rounded-3xl border transition cursor-pointer flex items-center justify-between ${
            stockMetrics.lowStockCount > 0
              ? 'bg-orange-50 border-orange-300 text-orange-950 hover:bg-orange-100'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-black">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-bold">تنبيهات مخزون قارب على الانتهاء</div>
              <div className="text-xl font-black text-orange-900">
                {stockMetrics.lowStockCount} أصناف منخفضة
              </div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-orange-800">أقل من 25 قطعة</span>
        </div>

        {/* Out of Stock Card */}
        <div
          onClick={() => {
            setActiveSubTab('matrix');
            setStockLevelFilter('out_of_stock');
          }}
          className={`p-4 rounded-3xl border transition cursor-pointer flex items-center justify-between ${
            stockMetrics.outOfStockCount > 0
              ? 'bg-rose-50 border-rose-300 text-rose-950 hover:bg-rose-100'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-black">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-bold">أصناف نفذت تماماً (0 قطع)</div>
              <div className="text-xl font-black text-rose-900">
                {stockMetrics.outOfStockCount} صنف نفذ
              </div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-rose-800">ممنوع الحجز</span>
        </div>
      </div>

      {/* Main Sub-Navigation Tabs */}
      <div className="bg-slate-900 p-1.5 rounded-2xl flex items-center gap-1.5 overflow-x-auto text-xs font-bold text-white shadow-md">
        <button
          onClick={() => setActiveSubTab('matrix')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'matrix' ? 'bg-amber-400 text-slate-950 font-black shadow' : 'text-slate-300 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>مصفوفة المخزون والأرصدة ({filteredProducts.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('pending_approvals')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'pending_approvals'
              ? 'bg-amber-400 text-slate-950 font-black shadow'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>اعتمادات المشرف والفرع</span>
          {stockMetrics.pendingApprovalsCount > 0 && (
            <span className="bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
              {stockMetrics.pendingApprovalsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('audit_logs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition cursor-pointer whitespace-nowrap ${
            activeSubTab === 'audit_logs'
              ? 'bg-amber-400 text-slate-950 font-black shadow'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          <span>سجل حركات المخزون المباشرة ({inventoryLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: INVENTORY MATRIX */}
      {activeSubTab === 'matrix' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Header Controls */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <span>إدارة المخزون الفعلي والمحجوز لشركة دريم طنطاوي</span>
                  <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    {filteredProducts.length} صنف
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  رصد دقيق لحظي بين (المخزون الفعلي داخل المخزن) و (الرصيد المتاح للبيع بعد حجز المناديب)
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Export Inventory to Excel */}
                <button
                  onClick={() => exportProductsToExcel(filteredProducts, selectedBranchFilter)}
                  className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs shadow-xs transition cursor-pointer"
                  title="تصدير شيت إكسل كامل بالمخزون"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير كشف المخزون (Excel)</span>
                </button>

                {/* Add New Product (Admin / Developer Only) */}
                {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                  <button
                    onClick={() => {
                      setEditingProduct(null);
                      setFormData({
                        code: `DRM-${100 + products.length + 1}`,
                        name: '',
                        salesPriority: 'عادي',
                        category: 'بسكويت وويفر',
                        status: 'متاح',
                        cartonQuantity: 24,
                        size: '',
                        color: '',
                        branchStockActual: 100,
                        branchStockReserved: 100,
                        mainWarehouseActual: 1000,
                        mainWarehouseReserved: 1000,
                        department: 'الأغذية والحلويات',
                        classification: 'سوبر A',
                        piecePrice: 10,
                        cartonPrice: 220,
                        branchName: currentUser?.branchName || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
                      });
                      setShowAddModal(true);
                    }}
                    className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold px-3.5 py-2.5 rounded-xl text-xs shadow transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة صنف جديد</span>
                  </button>
                )}
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="relative sm:col-span-2">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ابحث بالكود، اسم الصنف، القسم، التصنيف..."
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-bold">التصنيف:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer w-full"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-bold">حالة المخزون:</span>
                <select
                  value={stockLevelFilter}
                  onChange={(e) => setStockLevelFilter(e.target.value as any)}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer w-full"
                >
                  <option value="all">الكل ({products.length})</option>
                  <option value="low_stock">⚠️ قارب على الانتهاء</option>
                  <option value="out_of_stock">🚫 نفذ تماماً (0)</option>
                  <option value="healthy">✅ متوفر بوفرة</option>
                </select>
              </div>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-900 text-white font-bold">
                  <tr>
                    <th className="p-3">الكود</th>
                    <th className="p-3">اسم الصنف والبيان</th>
                    <th className="p-3 text-center">شدة الكرتونة</th>
                    <th className="p-3 text-center">المخزون الفعلي بالفرع</th>
                    <th className="p-3 text-center">المتاح للبيع (بعد الحجز)</th>
                    <th className="p-3 text-center">حالة الصنف والتنبيه</th>
                    <th className="p-3 text-center">المخزن المركزي</th>
                    <th className="p-3 text-left">سعر الكرتونة بالجملة</th>
                    <th className="p-3 text-center">الإجراءات والعمليات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedProducts.map((p) => {
                    const isOutOfStock = p.branchStockReserved <= 0;
                    const isLowStock = p.branchStockReserved > 0 && p.branchStockReserved <= 10;
                    const isReservedDifference = p.branchStockActual !== p.branchStockReserved;

                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-amber-50/40 transition ${
                          isOutOfStock ? 'bg-rose-50/40' : isLowStock ? 'bg-orange-50/30' : ''
                        }`}
                      >
                        {/* Code */}
                        <td className="p-3 font-mono font-black text-amber-900">
                          <span className="bg-amber-100 px-2 py-0.5 rounded text-[11px] border border-amber-300">
                            {p.code}
                          </span>
                        </td>

                        {/* Name */}
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900 text-xs sm:text-sm">{p.name}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            {(() => {
                              const deptMeta = getDepartmentMeta(p.department || p.category);
                              const DeptIcon = deptMeta.icon;
                              return (
                                <span className="bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded font-black flex items-center gap-1">
                                  <DeptIcon className="w-3 h-3 text-amber-700" />
                                  <span>{p.department || 'عام'}</span>
                                </span>
                              );
                            })()}
                            {p.classification && (
                              <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                                🏷️ {p.classification}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Pack Quantity */}
                        <td className="p-3 text-center font-black text-slate-900">
                          {p.cartonQuantity} ق
                        </td>

                        {/* Branch Actual Stock */}
                        <td className="p-3 text-center font-black">
                          <span className="text-slate-800 text-sm">{p.branchStockActual} كرتونة</span>
                          <div className="text-[10px] text-slate-400 font-normal">
                            ({p.branchStockActual * (p.cartonQuantity || 1)} قطعة)
                          </div>
                        </td>

                        {/* Branch Reserved Stock (Remaining available to reps) */}
                        <td className="p-3 text-center font-black">
                          <span
                            className={`text-sm ${
                              isOutOfStock
                                ? 'text-rose-600 font-black'
                                : isLowStock
                                ? 'text-orange-600 font-black'
                                : 'text-emerald-700 font-black'
                            }`}
                          >
                            {p.branchStockReserved} كرتونة
                          </span>
                          {isReservedDifference && (
                            <div className="text-[10px] text-amber-700 font-bold">
                              (محجوز: {p.branchStockActual - p.branchStockReserved} ك)
                            </div>
                          )}
                        </td>

                        {/* Stock Alert Badge */}
                        <td className="p-3 text-center">
                          {isOutOfStock ? (
                            <span className="inline-flex items-center gap-1 bg-rose-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black shadow-xs">
                              <ShieldAlert className="w-3 h-3" />
                              <span>نفذ المخزون 🚫</span>
                            </span>
                          ) : isLowStock ? (
                            <span className="inline-flex items-center gap-1 bg-orange-500 text-white px-2 py-0.5 rounded-full text-[10px] font-black shadow-xs animate-pulse">
                              <AlertTriangle className="w-3 h-3" />
                              <span>قارب على الانتهاء ⚠️</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>متوفر ({p.branchStockReserved} ك)</span>
                            </span>
                          )}
                        </td>

                        {/* Main Warehouse Stock */}
                        <td className="p-3 text-center font-black text-amber-900 bg-amber-50/20">
                          <div>{p.mainWarehouseActual} كرتونة</div>
                          <div className="text-[10px] text-slate-400 font-normal">متاح: {p.mainWarehouseReserved} ك</div>
                        </td>

                        {/* Carton Price */}
                        <td className="p-3 text-left font-black text-amber-900">
                          {formatCurrency(p.cartonPrice)}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Quick Supply / Replenish */}
                            {(currentUser?.role === 'admin' || currentUser?.role === 'branch_manager' || currentUser?.role === 'supervisor') && (
                              <button
                                onClick={() => {
                                  setSupplyModal(p);
                                  setSupplyCartons(10);
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer"
                                title="توريد كراتين إضافية للفرع"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>توريد</span>
                              </button>
                            )}

                            {/* Transfer Request button */}
                            <button
                              onClick={() => setStockTransferModal(p)}
                              className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer"
                              title="طلب تغذية مخزون من المخزن المركزي"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>تحويل</span>
                            </button>

                            {/* Edit button */}
                            {(currentUser?.role === 'admin' || currentUser?.role === 'branch_manager') && (
                              <button
                                onClick={() => {
                                  setEditingProduct(p);
                                  setFormData(p);
                                  setShowAddModal(true);
                                }}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5 rounded-lg transition cursor-pointer"
                                title="تعديل بيانات الصنف"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Delete (Admin only) */}
                            {currentUser?.role === 'admin' && (
                              <button
                                onClick={() => {
                                  if (window.confirm(`هل أنت متأكد من حذف الصنف ${p.name}؟`)) {
                                    deleteProduct(p.id);
                                  }
                                }}
                                className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Bar */}
            {filteredProducts.length > 0 && (
              <div className="bg-slate-50 border-t border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-600 font-bold">
                  <span>عرض:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-black focus:outline-none"
                  >
                    <option value={20}>20 صنف</option>
                    <option value={50}>50 صنف</option>
                    <option value={100}>100 صنف</option>
                    <option value={250}>250 صنف</option>
                    <option value={500}>500 صنف</option>
                    <option value={1000}>1000 صنف</option>
                    <option value={5000}>عرض الكل ({filteredProducts.length} صنف)</option>
                  </select>
                  <span>من إجمالي <strong className="text-slate-900">{filteredProducts.length}</strong> صنف مسجل</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(1)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition font-bold"
                    title="الصفحة الأولى"
                  >
                    الأولى
                  </button>

                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title="الصفحة السابقة"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <span className="px-3 py-1 bg-amber-100 text-amber-950 font-black rounded-lg text-xs">
                    صفحة {currentPage} من {totalPages}
                  </span>

                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title="الصفحة التالية"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition font-bold"
                    title="الصفحة الأخيرة"
                  >
                    الأخيرة
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PENDING APPROVALS WORKFLOW */}
      {activeSubTab === 'pending_approvals' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-500" />
              <span>طلبيات المناديب المعلقة بانتظار اعتماد المشرف ومدير الفرع</span>
              <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                {pendingInvoices.length} طلبيات
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              عند قيام المندوب بعمل طلبية يتم حجز الكمية تلقائياً لمنع تكرار الحجز. عند ضغط المشرف على (اعتماد وصرف)، يتم خصم المخزون الفعلي من الفرع.
            </p>
          </div>

          {pendingInvoices.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center space-y-3 border border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h4 className="font-bold text-slate-800 text-sm">لا توجد أي طلبيات معلقة حالياً!</h4>
              <p className="text-xs text-slate-400">
                جميع طلبيات المناديب تم اعتمادها وصرفها من المخزن أو إلغاؤها بنجاح.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="bg-white rounded-3xl p-5 border-2 border-amber-300 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black bg-slate-900 text-amber-300 px-2.5 py-1 rounded-xl text-xs">
                        {inv.invoiceNumber}
                      </span>
                      <span className="bg-amber-100 text-amber-950 font-bold text-xs px-2.5 py-1 rounded-xl border border-amber-300">
                        {inv.status}
                      </span>
                      <span className="text-xs text-slate-400">
                        {inv.date} - {inv.time}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">العميل:</span>
                        <strong className="text-slate-900">{inv.customerName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">المندوب المسؤول:</span>
                        <strong className="text-slate-900">{inv.repName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">فرع التحميل:</span>
                        <strong className="text-slate-900">{inv.branchName}</strong>
                      </div>
                    </div>

                    {/* Order items preview */}
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-1">
                      <div className="font-bold text-slate-700 flex items-center justify-between">
                        <span>الأصناف المحجوزة في هذه الطلبية:</span>
                        <span className="text-amber-900 font-black text-sm">
                          الإجمالي: {formatCurrency(inv.estimatedGrandTotal)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {inv.items.map((item, i) => (
                          <span
                            key={i}
                            className="bg-white border border-slate-300 text-slate-800 px-2 py-0.5 rounded-lg text-[11px] font-semibold"
                          >
                            {item.productName} ({item.cartonCount > 0 ? `${item.cartonCount} كرتونة ` : ''}
                            {item.pieceCount > 0 ? `${item.pieceCount} قطعة` : ''})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons for Supervisor & Manager */}
                  <div className="flex flex-col sm:flex-row md:flex-col gap-2 w-full md:w-auto shrink-0">
                    {/* 1. Approve & Discharge */}
                    <button
                      onClick={() => handleApprove(inv.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2.5 rounded-xl text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>اعتماد وصرف المخزون</span>
                    </button>

                    {/* 2. Forward to Manager (Supervisor only) */}
                    {currentUser?.role === 'supervisor' && (
                      <button
                        onClick={() => handleForwardToManager(inv.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>تحويل لمدير الفرع</span>
                      </button>
                    )}

                    {/* 3. Reject Order & Release Reserved Stock */}
                    <button
                      onClick={() => {
                        setRejectModalInvoiceId(inv.id);
                        setRejectReasonText('نفاذ الكمية أو طلب العميل إلغاء الطلبية');
                      }}
                      className="bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer border border-rose-300"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>رفض وإلغاء الحجز</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: REAL-TIME AUDIT LOGS */}
      {activeSubTab === 'audit_logs' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-amber-500" />
                <span>سجل تدقيق حركات المخزون المباشرة (Audit Trail)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                يوثق كل حركة حجز من المندوب، صرف واعتماد المشرف، توريد المصنع، وتعديلات الجرد بدقة بالثانية.
              </p>
            </div>
            <span className="bg-slate-100 text-slate-800 font-bold px-3 py-1 rounded-xl text-xs border border-slate-200">
              {inventoryLogs.length} حركة مسجلة
            </span>
          </div>

          {inventoryLogs.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center space-y-2 border border-slate-200">
              <History className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="font-bold text-slate-700 text-sm">لا توجد حركات مخزنية مسجلة بعد</div>
              <p className="text-xs text-slate-400">ستظهر هنا جميع عمليات الخصم والتوريد والحجز تلقائياً.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900 text-white font-bold">
                    <tr>
                      <th className="p-3">الوقت والتاريخ</th>
                      <th className="p-3">نوع الحركة</th>
                      <th className="p-3">الصنف</th>
                      <th className="p-3 text-center">الكمية</th>
                      <th className="p-3 text-center">الرصيد قبل</th>
                      <th className="p-3 text-center">الرصيد بعد</th>
                      <th className="p-3">المستخدم والفرع</th>
                      <th className="p-3">البيان والملاحظات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {displayedInventoryLogs.map((log) => {
                      const typeColors: Record<string, string> = {
                        'حجز طلبية مندوب': 'bg-amber-100 text-amber-900 border-amber-300',
                        'صرف واعتماد مشرف': 'bg-emerald-100 text-emerald-900 border-emerald-300',
                        'إلغاء حجز وإرجاع': 'bg-blue-100 text-blue-900 border-blue-300',
                        'توريد مخزني': 'bg-purple-100 text-purple-900 border-purple-300',
                        'تعديل جردي': 'bg-slate-100 text-slate-800 border-slate-300',
                      };

                      return (
                        <tr key={log.id} className="hover:bg-slate-50 transition">
                          <td className="p-3 text-slate-600 font-mono text-[11px]">
                            <div>{log.timestamp}</div>
                            <div className="text-[10px] text-slate-400">{log.date}</div>
                          </td>

                          <td className="p-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-black border ${
                                typeColors[log.type] || 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {log.type}
                            </span>
                          </td>

                          <td className="p-3 font-bold text-slate-900">
                            <div>{log.productName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{log.productCode}</div>
                          </td>

                          <td className="p-3 text-center font-black text-slate-900">
                            {log.quantityPieces} ق
                          </td>

                          <td className="p-3 text-center text-slate-500 font-mono">
                            {log.branchStockBefore} ق
                          </td>

                          <td className="p-3 text-center font-black font-mono text-emerald-700">
                            {log.branchStockAfter} ق
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-800">{log.userName}</div>
                            <div className="text-[10px] text-slate-400">
                              {log.userRole} • {log.branchName}
                            </div>
                          </td>

                          <td className="p-3 text-slate-600 text-[11px] max-w-xs truncate">
                            {log.notes || '---'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Logs Pagination Footer */}
              {inventoryLogs.length > 0 && (
                <div className="bg-slate-50 border-t border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 font-bold">
                    <span>عرض الحركات:</span>
                    <select
                      value={logsPerPage}
                      onChange={(e) => {
                        const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                        setLogsPerPage(val);
                        setLogsCurrentPage(1);
                      }}
                      className="bg-white border border-slate-300 rounded-lg px-2 py-1 font-bold text-slate-800 focus:outline-none"
                    >
                      <option value={15}>15 حركة</option>
                      <option value={30}>30 حركة</option>
                      <option value={50}>50 حركة</option>
                      <option value="all">عرض الكل ({inventoryLogs.length})</option>
                    </select>
                    <span className="text-slate-400">
                      ({inventoryLogs.length} حركة إجمالية)
                    </span>
                  </div>

                  {logsPerPage !== 'all' && logsTotalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        disabled={logsCurrentPage === 1}
                        onClick={() => setLogsCurrentPage(1)}
                        className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 disabled:opacity-40"
                      >
                        <ChevronsRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={logsCurrentPage === 1}
                        onClick={() => setLogsCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 disabled:opacity-40"
                      >
                        السابق
                      </button>
                      <span className="px-2 font-bold text-slate-800">
                        {logsCurrentPage} / {logsTotalPages}
                      </span>
                      <button
                        disabled={logsCurrentPage === logsTotalPages}
                        onClick={() => setLogsCurrentPage((p) => Math.min(logsTotalPages, p + 1))}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 disabled:opacity-40"
                      >
                        التالي
                      </button>
                      <button
                        disabled={logsCurrentPage === logsTotalPages}
                        onClick={() => setLogsCurrentPage(logsTotalPages)}
                        className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 disabled:opacity-40"
                      >
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick Supply / Replenish Modal */}
      {supplyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>توريد واستلام مخزون جديد للفرع</span>
              </h3>
              <button onClick={() => setSupplyModal(null)}>
                <X className="w-4 h-4 text-slate-400 hover:text-slate-700" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="font-black text-slate-900">{supplyModal.name}</div>
                <div className="text-slate-500">كود: {supplyModal.code} • شدة الكرتونة: {supplyModal.cartonQuantity} قطعة</div>
                <div className="text-emerald-700 font-bold mt-1">الرصيد الفعلي الحالي: {supplyModal.branchStockActual} كرتونة</div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  الكمية الموردة (بالكرتونة):
                </label>
                <input
                  type="number"
                  min="1"
                  value={supplyCartons}
                  onChange={(e) => setSupplyCartons(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-base text-slate-900 focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  بيان سبب التوريد / رقم إذن الاستلام:
                </label>
                <input
                  type="text"
                  value={supplyReason}
                  onChange={(e) => setSupplyReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleExecuteSupply}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer"
              >
                تأكيد إضافة الرصيد
              </button>
              <button
                onClick={() => setSupplyModal(null)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Transfer Modal */}
      {stockTransferModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-500" />
                <span>طلب تحويل مخزون للفرع</span>
              </h3>
              <button onClick={() => setStockTransferModal(null)}>
                <X className="w-4 h-4 text-slate-400 hover:text-slate-700" />
              </button>
            </div>

            <div className="text-xs space-y-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="font-black text-slate-900">{stockTransferModal.name}</div>
                <div className="text-slate-500">كود: {stockTransferModal.code} • شدة الكرتونة: {stockTransferModal.cartonQuantity} قطعة</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  <div className="text-slate-500">المخزن المركزي (أكتوبر):</div>
                  <strong className="text-amber-900 font-bold text-sm">{stockTransferModal.mainWarehouseActual} كرتونة</strong>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                  <div className="text-slate-500">مخزون الفرع الحالي:</div>
                  <strong className="text-emerald-900 font-bold text-sm">{stockTransferModal.branchStockActual} كرتونة</strong>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  عدد الكراتين المطلوب تحويلها للفرع:
                </label>
                <input
                  type="number"
                  min="1"
                  max={stockTransferModal.mainWarehouseActual}
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-base text-slate-900 focus:ring-2 focus:ring-amber-400"
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  إجمالي القطع المعبأة داخل الكراتين: <strong>{transferAmount * (stockTransferModal.cartonQuantity || 1)} قطعة</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleExecuteTransfer}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer"
              >
                تأكيد التحويل المخزني
              </button>
              <button
                onClick={() => setStockTransferModal(null)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Order Reason Prompt Modal */}
      {rejectModalInvoiceId && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-rose-700 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                <span>رفض الطلبية وإرجاع الرصيد المحجوز للمخزن</span>
              </h3>
              <button onClick={() => setRejectModalInvoiceId(null)}>
                <X className="w-4 h-4 text-slate-400 hover:text-slate-700" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <p className="text-slate-600">
                سيتم فك حجز الأصناف وإرجاع الكميات فوراً للرصيد المتاح للبيع حتى يتمكن باقي المناديب من بيعها.
              </p>
              <div>
                <label className="block font-bold text-slate-700 mb-1">سبب الرفض:</label>
                <textarea
                  rows={3}
                  value={rejectReasonText}
                  onChange={(e) => setRejectReasonText(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-400"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleRejectConfirm}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer"
              >
                تأكيد الرفض وإرجاع المخزون
              </button>
              <button
                onClick={() => setRejectModalInvoiceId(null)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-base text-slate-900">
                {editingProduct ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد لشركة دريم'}
              </h3>
              <button onClick={() => setShowAddModal(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">كود الصنف *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="مثال DRM-205"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم الصنف الكامل *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="اسم المنتج وبيانه"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">التصنيف</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">القسم</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">شدة الكرتونة (عدد القطع)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.cartonQuantity}
                    onChange={(e) => setFormData({ ...formData, cartonQuantity: parseInt(e.target.value) || 1 })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">أولوية البيع</label>
                  <select
                    value={formData.salesPriority}
                    onChange={(e) => setFormData({ ...formData, salesPriority: e.target.value as SalesPriority })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="مرتفع">مرتفع 🔥</option>
                    <option value="متوسط">متوسط ⚡</option>
                    <option value="عادي">عادي</option>
                    <option value="منخفض">منخفض</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">المخزون الافتتاحي الفعلي بالفرع (كرتونة)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.branchStockActual}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        branchStockActual: parseInt(e.target.value) || 0,
                        branchStockReserved: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">مخزون المستودع المركزي (كرتونة)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.mainWarehouseActual}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        mainWarehouseActual: parseInt(e.target.value) || 0,
                        mainWarehouseReserved: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">سعر الكرتونة بالجملة (ج.م) *</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.cartonPrice}
                    onChange={(e) => setFormData({ ...formData, cartonPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">سعر العرض الترويجي للكرتونة (إن وجد)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.promoPrice || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, promoPrice: e.target.value ? parseFloat(e.target.value) : undefined })
                    }
                    placeholder="اختياري"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الفرع المخصص</label>
                  <select
                    value={formData.branchName}
                    onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black shadow cursor-pointer"
                >
                  حفظ الصنف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
