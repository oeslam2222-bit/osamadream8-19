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
  Flame,
  History,
  Layers,
  LayoutGrid,
  List,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  ArrowRightLeft,
  UserCheck,
  Warehouse,
  X,
  XCircle
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportProductsToExcel } from '../services/excelService';
import { formatCurrency } from '../services/invoiceService';
import { getBranchStockForProduct } from '../services/arabicMatchingService';
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
    selectedBranchFilter,
    setSelectedBranchFilter
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'pending_approvals' | 'audit_logs'>('matrix');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [stockLevelFilter, setStockLevelFilter] = useState<'all' | 'offers' | 'in_branch' | 'needs_transfer' | 'low_stock' | 'out_of_stock'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewLayout, setViewLayout] = useState<'table' | 'cards'>('cards');

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

  // Active branch context for stock resolution: specific user's branch for reps/supervisors/managers, or global filter for admin
  const currentActiveBranch = useMemo(() => {
    if (currentUser?.role === 'sales_rep' || currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager') {
      return currentUser.branchName || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)';
    }
    return selectedBranchFilter !== 'الكل' ? selectedBranchFilter : (currentUser?.branchName || '');
  }, [currentUser, selectedBranchFilter]);

  // Helper to get effective branch stock for a product for current viewer's branch
  const getProductBranchStock = (p: Product) => {
    return getBranchStockForProduct(p, currentActiveBranch);
  };

  // Filtered Products Matrix
  const visibleBranch = currentUser && currentUser.role !== 'admin' && currentUser.role !== 'developer'
    ? currentUser.branchName
    : selectedBranchFilter;

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Operating-branch stock is scoped to the user's branch. October's central
      // warehouse balance remains visible to everyone for availability and booking.
      if (
        visibleBranch !== 'الكل' &&
        visibleBranch &&
        p.branchName &&
        p.branchName !== visibleBranch &&
        p.mainWarehouseActual <= 0
      ) {
        return false;
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

      const bStock = getProductBranchStock(p);
      const oStock = p.mainWarehouseActual || 0;

      if (stockLevelFilter === 'offers') {
        if (!p.promoPrice && !p.promoPiecePrice && !p.offerPrice) return false;
      } else if (stockLevelFilter === 'in_branch') {
        if (bStock <= 0) return false;
      } else if (stockLevelFilter === 'needs_transfer') {
        if (bStock > 0 || oStock <= 0) return false;
      } else if (stockLevelFilter === 'low_stock') {
        if (bStock <= 0 || bStock > 25) return false;
      } else if (stockLevelFilter === 'out_of_stock') {
        if (bStock > 0 || oStock > 0) return false;
      }

      return true;
    });
  }, [products, searchTerm, selectedCategory, stockLevelFilter, visibleBranch, currentActiveBranch]);

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

  // Stock Availability Metrics (In Branch vs Needs October Transfer vs Out of Stock)
  const stockMetrics = useMemo(() => {
    let inBranchCount = 0;
    let needsTransferCount = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;
    let offersCount = 0;
    let totalCartonsActual = 0;
    let totalCartonsReserved = 0;

    products.forEach((p) => {
      const bStock = getProductBranchStock(p);
      const oStock = p.mainWarehouseActual || 0;

      if (p.promoPrice || p.promoPiecePrice || p.offerPrice) {
        offersCount++;
      }

      if (bStock > 0) {
        inBranchCount++;
        if (bStock <= 10) {
          lowStockCount++;
        }
      } else if (oStock > 0) {
        needsTransferCount++;
      } else {
        outOfStockCount++;
      }
      totalCartonsActual += bStock;
      totalCartonsReserved += Math.max(0, bStock - 5);
    });

    return {
      inBranchCount,
      needsTransferCount,
      outOfStockCount,
      lowStockCount,
      offersCount,
      totalCartonsActual,
      totalCartonsReserved,
      pendingApprovalsCount: pendingInvoices.length
    };
  }, [products, pendingInvoices, currentActiveBranch]);

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

    if (currentUser?.role === 'sales_rep') {
      alert('عذراً، طلبات التحويل من مخزن أكتوبر هي مسؤولية مدير الفرع ومشرف المناديب فقط.');
      return;
    }

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

      {/* Top Smart Metrics & Branch Availability Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        {/* In Branch Available Card */}
        <div
          onClick={() => {
            setActiveSubTab('matrix');
            setStockLevelFilter('in_branch');
          }}
          className={`p-3.5 sm:p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            stockLevelFilter === 'in_branch'
              ? 'bg-emerald-500/15 border-emerald-500 ring-2 ring-emerald-400'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-black bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full">
              صرف مباشر ✓
            </span>
          </div>
          <div className="mt-2">
            <div className="text-[11px] text-slate-500 font-bold">متوفر بمخزن الفرع</div>
            <div className="text-xl sm:text-2xl font-black text-emerald-950">
              {stockMetrics.inBranchCount} <span className="text-xs font-bold text-slate-500">صنف</span>
            </div>
            <div className="text-[10px] text-emerald-800 font-semibold mt-0.5">جاهز للتسليم الفوري بدون تحويل</div>
          </div>
        </div>

        {/* Needs Transfer from October Card */}
        <div
          onClick={() => {
            setActiveSubTab('matrix');
            setStockLevelFilter('needs_transfer');
          }}
          className={`p-3.5 sm:p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            stockLevelFilter === 'needs_transfer'
              ? 'bg-blue-500/15 border-blue-500 ring-2 ring-blue-400'
              : 'bg-white border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black">
              <Truck className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-black bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full">
              طلب تحويل 🚚
            </span>
          </div>
          <div className="mt-2">
            <div className="text-[11px] text-slate-500 font-bold">يحتاج تحويل من أكتو��ر</div>
            <div className="text-xl sm:text-2xl font-black text-blue-950">
              {stockMetrics.needsTransferCount} <span className="text-xs font-bold text-slate-500">صنف</span>
            </div>
            <div className="text-[10px] text-blue-800 font-semibold mt-0.5">عجز بالفرع ومتوفر بالمخزن ال��ئيسي</div>
          </div>
        </div>

        {/* Pending Approvals Card */}
        <div
          onClick={() => setActiveSubTab('pending_approvals')}
          className={`p-3.5 sm:p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            activeSubTab === 'pending_approvals'
              ? 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-400'
              : stockMetrics.pendingApprovalsCount > 0
              ? 'bg-amber-50 border-amber-300 hover:bg-amber-100'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
              <Clock className="w-5 h-5" />
            </div>
            {stockMetrics.pendingApprovalsCount > 0 && (
              <span className="text-[10px] font-black bg-rose-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                {stockMetrics.pendingApprovalsCount} طلبية
              </span>
            )}
          </div>
          <div className="mt-2">
            <div className="text-[11px] text-slate-500 font-bold">بانتظار الاعتماد والصرف</div>
            <div className="text-xl sm:text-2xl font-black text-amber-950">
              {stockMetrics.pendingApprovalsCount} <span className="text-xs font-bold text-slate-500">طلبية</span>
            </div>
            <div className="text-[10px] text-amber-800 font-semibold mt-0.5">مراجعة المشرف وإذن الصرف المخزني</div>
          </div>
        </div>

        {/* Low / Out of Stock Warning Card */}
        <div
          onClick={() => {
            setActiveSubTab('matrix');
            setStockLevelFilter('out_of_stock');
          }}
          className={`p-3.5 sm:p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            stockLevelFilter === 'out_of_stock'
              ? 'bg-rose-500/15 border-rose-500 ring-2 ring-rose-400'
              : 'bg-white border-slate-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-black">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-black bg-rose-100 text-rose-900 px-2 py-0.5 rounded-full">
              نفذ المخزون 🚫
            </span>
          </div>
          <div className="mt-2">
            <div className="text-[11px] text-slate-500 font-bold">أصناف نفذت بالكامل</div>
            <div className="text-xl sm:text-2xl font-black text-rose-950">
              {stockMetrics.outOfStockCount} <span className="text-xs font-bold text-slate-500">صنف</span>
            </div>
            <div className="text-[10px] text-rose-800 font-semibold mt-0.5">غير متاح بالفرع أو بأكتوبر</div>
          </div>
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
          <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2 flex-wrap">
                  <span>إدارة المخزون والتوافر بالفرع والمخزن الرئيسي</span>
                  <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    {filteredProducts.length} صنف
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-bold">
                  <span className="bg-slate-100 text-slate-700 border border-slate-200 rounded-full px-2.5 py-1">
                    فرعك: {currentUser?.branchName || 'غير محدد'}
                  </span>
                  <span className="bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-1">
                    مخزون الفرع ظاهر حسب الصلاحية
                  </span>
                  <span className="bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2.5 py-1">
                    مخزن أكتوبر الرئيسي ظاهر للجميع للحجز عند الاعتماد
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  إذا كان المنتج متوفراً بالفرع يصرف مباشرة بدون تحويل، وفي حال عدم توفره بالفرع يتم تقديم طلب تحويل فوري من فرع أكتوبر.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* View Layout Switcher (Cards / Table) */}
                <div className="bg-slate-100 p-1 rounded-2xl flex items-center gap-1 border border-slate-200">
                  <button
                    onClick={() => setViewLayout('cards')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      viewLayout === 'cards'
                        ? 'bg-white text-slate-900 shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="عرض البطاقات الذكية (مناسب للموبايل)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>بطاقات للموبايل</span>
                  </button>
                  <button
                    onClick={() => setViewLayout('table')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      viewLayout === 'table'
                        ? 'bg-white text-slate-900 shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="عرض جدول البيانات الكامل"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>جدول تفصيلي</span>
                  </button>
                </div>

                {/* Export Inventory to Excel */}
                <button
                  onClick={() => exportProductsToExcel(filteredProducts, selectedBranchFilter)}
                  className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
                  title="تصدير شيت إكسل كامل بالمخزون"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span className="hidden sm:inline">تصدير كشف (Excel)</span>
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
                    className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold px-3 py-2 rounded-xl text-xs shadow transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة صنف</span>
                  </button>
                )}
              </div>
            </div>

            {/* Branch scope: non-admin users are locked to their assigned branch */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                <Building className="h-4 w-4 text-amber-600" />
                <span>المخزون المعروض</span>
              </div>
              {currentUser?.role === 'admin' || currentUser?.role === 'developer' ? (
                <select
                  value={selectedBranchFilter}
                  onChange={(event) => setSelectedBranchFilter(event.target.value)}
                  className="min-w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-amber-500"
                  aria-label="اختيار فرع المخزون"
                >
                  <option value="الكل">كل الفروع والمخزن الرئيسي</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.name}>{branch.name}</option>
                  ))}
                </select>
              ) : (
                <span className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-950">
                  {currentUser?.branchName || 'الفرع المحدد بالحساب'}
                </span>
              )}
              <span className="text-[11px] font-semibold text-slate-500">الفرع ثم المخزن الرئيسي عند اعتماد الطلبية</span>
            </div>

            {/* Quick Filter Buttons (Pills) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setStockLevelFilter('all')}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                  stockLevelFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                الكل ({products.length})
              </button>
              <button
                onClick={() => setStockLevelFilter('offers')}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  stockLevelFilter === 'offers'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-900 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                <span>عروض وخصومات ({stockMetrics.offersCount})</span>
              </button>
              <button
                onClick={() => setStockLevelFilter('in_branch')}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  stockLevelFilter === 'in_branch'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>متوفر بالفرع ({stockMetrics.inBranchCount})</span>
              </button>
              <button
                onClick={() => setStockLevelFilter('needs_transfer')}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  stockLevelFilter === 'needs_transfer'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>يتطلب تحويل من أكتوبر ({stockMetrics.needsTransferCount})</span>
              </button>
              <button
                onClick={() => setStockLevelFilter('low_stock')}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  stockLevelFilter === 'low_stock'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-orange-50 text-orange-900 hover:bg-orange-100 border border-orange-200'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>قارب على الانتهاء ({stockMetrics.lowStockCount})</span>
              </button>
              <button
                onClick={() => setStockLevelFilter('out_of_stock')}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  stockLevelFilter === 'out_of_stock'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-900 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>نفذ بالكامل ({stockMetrics.outOfStockCount})</span>
              </button>
            </div>

            {/* Search & Category Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
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
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer w-full text-xs"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* VIEW MODE 1: MOBILE & RESPONSIVE CARDS */}
          {viewLayout === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {paginatedProducts.map((p) => {
                const branchActual = getProductBranchStock(p);
                const isAvailableInBranch = branchActual > 0;
                const isAvailableInOctober = p.mainWarehouseActual > 0;
                const isLowStock = isAvailableInBranch && branchActual <= 10;
                const needsTransfer = !isAvailableInBranch && isAvailableInOctober;
                const isTotallyOut = !isAvailableInBranch && !isAvailableInOctober;

                const deptMeta = getDepartmentMeta(p.department || p.category);
                const DeptIcon = deptMeta.icon;

                return (
                  <div
                    key={p.id}
                    className={`bg-white rounded-3xl p-4 border transition flex flex-col justify-between shadow-xs ${
                      needsTransfer
                        ? 'border-blue-300 bg-blue-50/20'
                        : isAvailableInBranch
                        ? 'border-slate-200 hover:border-emerald-300'
                        : 'border-rose-200 bg-rose-50/20'
                    }`}
                  >
                    <div>
                      {/* Top Header: Code, Dept & Status Badge */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-amber-100 text-amber-950 font-mono font-black text-xs px-2 py-0.5 rounded-lg border border-amber-300">
                            {p.code}
                          </span>
                          <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <DeptIcon className="w-3 h-3 text-slate-600" />
                            <span>{p.department || p.category}</span>
                          </span>
                        </div>

                        {/* Status Ribbon */}
                        {isAvailableInBranch ? (
                          <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>متوفر بالفرع</span>
                          </span>
                        ) : needsTransfer ? (
                          <span className="bg-blue-100 text-blue-900 border border-blue-300 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Truck className="w-3 h-3 text-blue-600" />
                            <span>طلب تحويل</span>
                          </span>
                        ) : (
                          <span className="bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-rose-600" />
                            <span>نفذ</span>
                          </span>
                        )}
                      </div>

                      {/* Product Name & Details */}
                      <h3 className="font-black text-slate-900 text-sm leading-snug mb-1">
                        {p.name}
                      </h3>

                      <div className="text-xs text-slate-500 mb-3 flex flex-wrap items-center gap-2">
                        <span>شدة الكرتونة: <strong className="text-slate-800">{p.cartonQuantity} قطعة</strong></span>
                        <span>•</span>
                        <span>سعر الكرتونة: <strong className="text-amber-900 font-bold">{formatCurrency(p.cartonPrice)}</strong></span>
                        {p.promoPrice ? (
                          <span className="bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-lg font-black text-[11px] flex items-center gap-1">
                            <Flame className="w-3 h-3 text-rose-600" />
                            <span>سعر العرض: {formatCurrency(p.promoPrice)}</span>
                          </span>
                        ) : null}
                      </div>

                      {/* Stock Level Banner */}
                      <div className={`p-3 rounded-2xl mb-3 text-xs ${
                        isAvailableInBranch
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-950'
                          : needsTransfer
                          ? 'bg-blue-50 border border-blue-200 text-blue-950'
                          : 'bg-rose-50 border border-rose-200 text-rose-950'
                      }`}>
                        <div className="flex items-center justify-between font-bold mb-1">
                          <span className="flex items-center gap-1">
                            <Building className="w-3.5 h-3.5" />
                            <span>مخزون الفرع الحالي ({currentActiveBranch || 'الفرع'}):</span>
                          </span>
                          <span className="text-sm font-black">
                            {branchActual} كرتونة
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-600 border-t border-slate-200/60 pt-1">
                          <span className="flex items-center gap-1">
                            <Warehouse className="w-3 h-3 text-amber-700" />
                            <span>المخزن الرئيسي (أكتوبر):</span>
                          </span>
                          <span className="font-bold text-slate-800">
                            {p.mainWarehouseActual} كرتونة
                          </span>
                        </div>

                        {/* Explanation Notice */}
                        <div className="mt-2 text-[10px] font-bold">
                          {isAvailableInBranch ? (
                            <span className="text-emerald-800 flex items-center gap-1">
                              ✓ الصنف متاح بالفرع — صرف وتسليم مباشر للمندوب بدون تحويل
                            </span>
                          ) : needsTransfer ? (
                            <span className="text-blue-800 flex items-center gap-1">
                              🚚 غير متوفر بالفرع — اضغط بالأسفل لطلب تحويل الكمية المطلوبة من أكتوبر
                            </span>
                          ) : (
                            <span className="text-rose-800 flex items-center gap-1">
                              🚫 الرصيد منتهي بالكامل من الفرع والمخزن المركزي
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center gap-1.5 pt-1">
                      {needsTransfer ? (
                        (currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'branch_manager' || currentUser?.role === 'supervisor') ? (
                          <button
                            onClick={() => setStockTransferModal(p)}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                          >
                            <Truck className="w-4 h-4" />
                            <span>طلب تحويل من أكتوبر 🚚</span>
                          </button>
                        ) : (
                          <div className="flex-1 bg-blue-50 border border-blue-200 text-blue-900 font-bold py-2 px-3 rounded-xl text-xs text-center flex items-center justify-center gap-1.5">
                            <Truck className="w-3.5 h-3.5 text-blue-600" />
                            <span>يحتاج تحويل (يطلبه المشرف/المدير)</span>
                          </div>
                        )
                      ) : isAvailableInBranch ? (
                        <div className="flex-1 bg-emerald-100 text-emerald-900 font-bold py-2 px-3 rounded-xl text-xs text-center border border-emerald-200">
                          ✓ متاح للصرف المباشر
                        </div>
                      ) : (
                        <div className="flex-1 bg-slate-100 text-slate-500 font-bold py-2 px-3 rounded-xl text-xs text-center">
                          غير متاح حالياً
                        </div>
                      )}

                      {/* Replenish / Supply */}
                      {(currentUser?.role === 'admin' || currentUser?.role === 'branch_manager' || currentUser?.role === 'supervisor') && (
                        <button
                          onClick={() => {
                            setSupplyModal(p);
                            setSupplyCartons(10);
                          }}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold p-2 rounded-xl text-xs transition cursor-pointer"
                          title="توريد كراتين إضافية للفرع"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}

                      {/* Edit (Admin / Developer / Branch Manager) */}
                      {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'branch_manager') && (
                        <button
                          onClick={() => {
                            setEditingProduct(p);
                            setFormData(p);
                            setShowAddModal(true);
                          }}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl transition cursor-pointer"
                          title="تعديل بيانات الصنف"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete (Admin & Developer Only) */}
                      {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                        <button
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من حذف الصنف (${p.name}) نهائياً من قاعدة البيانات؟`)) {
                              deleteProduct(p.id);
                            }
                          }}
                          className="bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 p-2 rounded-xl transition cursor-pointer"
                          title="حذف الصنف نهائياً"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 2: DETAILED TABLE */}
          {viewLayout === 'table' && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900 text-white font-bold">
                    <tr>
                      <th className="p-3">الكود</th>
                      <th className="p-3">اسم الصنف والبيان</th>
                      <th className="p-3 text-center">شدة الكرتونة</th>
                      <th className="p-3 text-center">المخزون بالفرع (المتاح)</th>
                      <th className="p-3 text-center">حالة التوافر والإجراء</th>
                      <th className="p-3 text-center">المخزن الرئيسي (أكتوبر)</th>
                      <th className="p-3 text-left">سعر الكرتونة</th>
                      <th className="p-3 text-center">سعر العرض</th>
                      <th className="p-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedProducts.map((p) => {
                      const branchActual = getProductBranchStock(p);
                      const isAvailableInBranch = branchActual > 0;
                      const isAvailableInOctober = p.mainWarehouseActual > 0;
                      const isLowStock = isAvailableInBranch && branchActual <= 10;
                      const needsTransfer = !isAvailableInBranch && isAvailableInOctober;
                      const isTotallyOut = !isAvailableInBranch && !isAvailableInOctober;

                      const deptMeta = getDepartmentMeta(p.department || p.category);
                      const DeptIcon = deptMeta.icon;

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-amber-50/40 transition ${
                            needsTransfer
                              ? 'bg-blue-50/30'
                              : isTotallyOut
                              ? 'bg-rose-50/40'
                              : isLowStock
                              ? 'bg-orange-50/30'
                              : ''
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
                              <span className="bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded font-black flex items-center gap-1">
                                <DeptIcon className="w-3 h-3 text-amber-700" />
                                <span>{p.department || p.category}</span>
                              </span>
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

                          {/* Branch Stock */}
                          <td className="p-3 text-center font-black">
                            <span
                              className={`text-sm ${
                                isAvailableInBranch
                                  ? 'text-emerald-700 font-black'
                                  : 'text-rose-600 font-black'
                              }`}
                            >
                              {branchActual} كرتونة
                            </span>
                            <div className="text-[10px] text-slate-400 font-normal">
                              ({branchActual * (p.cartonQuantity || 1)} ق)
                            </div>
                          </td>

                          {/* Availability Status & Action Notice */}
                          <td className="p-3 text-center">
                            {isAvailableInBranch ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>متوفر بالفرع (صرف مباشر)</span>
                              </span>
                            ) : needsTransfer ? (
                              <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-900 border border-blue-300 px-2 py-0.5 rounded-full text-[10px] font-black animate-pulse">
                                <Truck className="w-3 h-3 text-blue-600" />
                                <span>طلب تحويل من أكتوبر 🚚</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-rose-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black">
                                <ShieldAlert className="w-3 h-3" />
                                <span>نفذ تماماً 🚫</span>
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

                          {/* Promo / Offer Price */}
                          <td className="p-3 text-center font-black">
                            {p.promoPrice ? (
                              <div className="inline-flex flex-col items-center bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                                <span className="text-rose-700 font-black text-xs">{formatCurrency(p.promoPrice)}</span>
                                <span className="text-[9px] text-rose-500 font-bold">
                                  ({formatCurrency(p.promoPiecePrice || (p.cartonQuantity ? p.promoPrice / p.cartonQuantity : p.promoPrice))} ق)
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300 font-medium">---</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Transfer Request */}
                              {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'branch_manager' || currentUser?.role === 'supervisor') ? (
                                needsTransfer ? (
                                  <button
                                    onClick={() => setStockTransferModal(p)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 shadow-xs transition cursor-pointer"
                                    title="طلب تحويل كراتين من فرع أكتوبر"
                                  >
                                    <Truck className="w-3.5 h-3.5" />
                                    <span>طلب تحويل</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setStockTransferModal(p)}
                                    className="bg-slate-100 hover:bg-amber-100 text-slate-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                                    title="طلب تغذية مخزون إضافية"
                                  >
                                    <Truck className="w-3.5 h-3.5" />
                                    <span>تحويل</span>
                                  </button>
                                )
                              ) : (
                                needsTransfer && (
                                  <span className="text-[10px] text-blue-700 font-bold bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                                    يحتاج تحويل
                                  </span>
                                )
                              )}

                              {/* Supply */}
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

                              {/* Edit (Admin / Developer / Branch Manager) */}
                              {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'branch_manager') && (
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

                              {/* Delete (Admin & Developer Only) */}
                              {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                                <button
                                  onClick={() => {
                                    if (window.confirm(`هل أنت متأكد من حذف الصنف (${p.name}) نهائياً من قاعدة البيانات؟`)) {
                                      deleteProduct(p.id);
                                    }
                                  }}
                                  className="bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 p-1.5 rounded-lg transition cursor-pointer"
                                  title="حذف الصنف نهائياً"
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
            </div>
          )}

          {/* Pagination Controls Bar */}
          {filteredProducts.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
              <div className="flex items-center gap-2 text-slate-600 font-bold">
                <span>عرض:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-black focus:outline-none"
                >
                  <option value={20}>20 صنف</option>
                  <option value={50}>50 صنف</option>
                  <option value={100}>100 صنف</option>
                  <option value={250}>250 صنف</option>
                  <option value={500}>500 صنف</option>
                  <option value={1000}>1000 صنف</option>
                  <option value={5000}>عرض الكل ({filteredProducts.length} صنف)</option>
                </select>
                <span>من إجمالي <strong className="text-slate-900">{filteredProducts.length}</strong> صنف</span>
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
              {inventoryLogs.length} حركة ��سجلة
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
                  <div className="text-slate-500">مخزون الفرع الحالي ({currentActiveBranch || 'الفرع'}):</div>
                  <strong className="text-emerald-900 font-bold text-sm">{getProductBranchStock(stockTransferModal)} كرتونة</strong>
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
                <span>رفض الطلبية وإرجاع الر��يد المحجوز للمخ��ن</span>
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

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <div>
                  {editingProduct && (currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`هل أنت متأكد من حذف الصنف (${editingProduct.name}) نهائياً من قاعدة البيانات؟`)) {
                          deleteProduct(editingProduct.id);
                          setShowAddModal(false);
                        }
                      }}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>حذف الصنف نهائياً</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
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
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
