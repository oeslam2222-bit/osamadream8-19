import {
  AlertCircle,
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  Building,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit2,
  FileSpreadsheet,
  Filter,
  Flame,
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
    getVisibleProducts,
    branches,
    currentUser,
    invoices,
    getVisibleInvoices,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustStock,
    selectedBranchFilter,
    setSelectedBranchFilter
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [stockLevelFilter, setStockLevelFilter] = useState<'all' | 'offers' | 'in_branch' | 'needs_transfer' | 'low_stock' | 'out_of_stock'>('all');
  // 🏠⚡ فلتر القطاع: المخزون مقسوم لمنزلي / كهربائي
  const [sectorTab, setSectorTab] = useState<'all' | 'home' | 'electrical'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewLayout, setViewLayout] = useState<'table' | 'cards'>('cards');
  const visibleProducts = getVisibleProducts();

  // Pagination state for responsive performance
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(20);
  
  // Stock Transfer Modal
  const [stockTransferModal, setStockTransferModal] = useState<Product | null>(null);
  const [transferAmount, setTransferAmount] = useState<number>(10);
  
  // Quick Supply / Replenish Modal
  const [supplyModal, setSupplyModal] = useState<Product | null>(null);
  const [supplyCartons, setSupplyCartons] = useState<number>(10);
  const [supplyReason, setSupplyReason] = useState<string>('توريد واستلام شحنة جديدة من المصنع');

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
    visibleProducts.forEach((p) => p.category && set.add(p.category));
    return ['الكل', ...Array.from(set)];
  }, [visibleProducts]);

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

  // 🏠⚡ قطاع المستخدم: لو حسابه مربوط بقطاع واحد يشوفه فقط، وإلا يقدر يتنقل بينهم
  const canSwitchSector = useMemo(() => {
    const role = currentUser?.role;
    if (role === 'admin' || role === 'developer') return true;
    const s = currentUser?.sector;
    return !s || s === 'all' || s === 'both';
  }, [currentUser]);

  const effectiveSector: 'all' | 'home' | 'electrical' = canSwitchSector
    ? sectorTab
    : currentUser?.sector === 'electrical'
      ? 'electrical'
      : 'home';

  const matchesSector = (p: Product) => {
    if (effectiveSector === 'all') return true;
    const s = p.sector;
    return !s || s === 'all' || s === 'both' || s === effectiveSector;
  };

  const sectorCounts = useMemo(() => {
    const cnt = { all: 0, home: 0, electrical: 0 };
    visibleProducts.forEach((p) => {
      cnt.all += 1;
      const s = p.sector;
      if (!s || s === 'all' || s === 'both' || s === 'home') cnt.home += 1;
      if (!s || s === 'all' || s === 'both' || s === 'electrical') cnt.electrical += 1;
    });
    return cnt;
  }, [visibleProducts]);

  // Filtered Products Matrix
  const visibleBranch = currentUser && currentUser.role !== 'admin' && currentUser.role !== 'developer'
    ? currentUser.branchName
    : selectedBranchFilter;

  const filteredProducts = useMemo(() => {
    return visibleProducts.filter((p) => {
      // 🏠⚡ فلتر القطاع (منزلي / كهربائي)
      if (!matchesSector(p)) return false;
      // Operating-branch stock is dynamically resolved for the active branch via getProductBranchStock.
      // October central warehouse balance is also visible for stock transfers and reserves.
      const bStock = getProductBranchStock(p);
      const oStock = p.mainWarehouseActual || 0;

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
  }, [products, searchTerm, selectedCategory, stockLevelFilter, visibleBranch, currentActiveBranch, effectiveSector]);

  // Paginated products
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

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
      totalCartonsReserved += typeof p.branchStockReserved === 'number' ? p.branchStockReserved : bStock;
    });

    return {
      inBranchCount,
      needsTransferCount,
      outOfStockCount,
      lowStockCount,
      offersCount,
      totalCartonsActual,
      totalCartonsReserved,
    };
  }, [products, currentActiveBranch]);

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

  return (
    <div className="tantawy-screen space-y-4 pb-16">
      
      {/* Toast Notification */}
      {actionSuccessMsg && (
        <div className="bg-[var(--app-ok)] text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between text-xs animate-in fade-in sticky top-20 z-30">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5 text-white/75" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button onClick={() => setActionSuccessMsg(null)} className="text-white hover:text-white/70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Smart Metrics & Branch Availability Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        {/* In Branch Available Card */}
        <div
          onClick={() => setStockLevelFilter('in_branch')}
          className={`p-3.5 sm:p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            stockLevelFilter === 'in_branch'
              ? 'bg-[rgba(46,125,91,.08)] border-[rgba(46,125,91,.4)] ring-2 ring-[rgba(46,125,91,.28)]'
              : 'bg-white border-slate-200 hover:border-[rgba(46,125,91,.45)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-2xl bg-[var(--app-ok)] text-white flex items-center justify-center font-black">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="app-badge ok">
              صرف مباشر
            </span>
          </div>
          <div className="mt-2">
            <div className="text-[11px] text-slate-500 font-bold">متوفر بمخزن الفرع</div>
            <div className="text-xl sm:text-2xl font-black t-ok app-num">
              {stockMetrics.inBranchCount} <span className="text-xs font-bold text-slate-500">صنف</span>
            </div>
            <div className="text-[10px] t-ok font-semibold mt-0.5">جاهز للتسليم الفوري بدون تحويل</div>
          </div>
        </div>

        {/* Needs Transfer from October Card */}
        <div
          onClick={() => setStockLevelFilter('needs_transfer')}
          className={`p-3.5 sm:p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            stockLevelFilter === 'needs_transfer'
              ? 'bg-[rgba(16,43,78,.06)] border-[rgba(16,43,78,.38)] ring-2 ring-[rgba(16,43,78,.25)]'
              : 'bg-white border-slate-200 hover:border-[rgba(16,43,78,.45)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-2xl bg-[var(--app-navy)] text-white flex items-center justify-center font-black">
              <Truck className="w-5 h-5" />
            </div>
            <span className="app-badge neutral">
              طلب تحويل
            </span>
          </div>
          <div className="mt-2">
            <div className="text-sm sm:text-base t-navy font-black">طلب تحويل — يحتاج تحويل من أكتوبر</div>
            <div className="text-xl sm:text-2xl font-black t-navy app-num">
              {stockMetrics.needsTransferCount} <span className="text-xs font-bold text-slate-500">صنف</span>
            </div>
            <div className="text-[10px] t-navy font-semibold mt-0.5">عجز بالفرع ومتوفر بالمخزن الرئيسي</div>
          </div>
        </div>

        {/* Low Stock Warning Card */}
        <div
          onClick={() => setStockLevelFilter('low_stock')}
          className={`p-3.5 sm:p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            stockLevelFilter === 'low_stock'
              ? 'bg-[rgba(155,112,39,.08)] border-[rgba(155,112,39,.4)] ring-2 ring-[rgba(155,112,39,.28)]'
              : 'bg-white border-slate-200 hover:border-[rgba(155,112,39,.5)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-2xl bg-[var(--app-warn)] text-white flex items-center justify-center font-black">
              <AlertTriangle className="w-5 h-5" />
            </div>
            {stockMetrics.lowStockCount > 0 && (
              <span className="app-badge warn">
                مخزون منخفض
              </span>
            )}
          </div>
          <div className="mt-2">
            <div className="text-[11px] text-slate-500 font-bold">أصناف قاربت على النفاذ</div>
            <div className="text-xl sm:text-2xl font-black t-warn app-num">
              {stockMetrics.lowStockCount} <span className="text-xs font-bold text-slate-500">صنف</span>
            </div>
            <div className="text-[10px] t-warn font-semibold mt-0.5">رصيد الفرع 10 كراتين أو أقل</div>
          </div>
        </div>

        {/* Out of Stock Warning Card */}
        <div
          onClick={() => setStockLevelFilter('out_of_stock')}
          className={`p-3.5 sm:p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            stockLevelFilter === 'out_of_stock'
              ? 'bg-[rgba(179,74,74,.07)] border-[rgba(179,74,74,.42)] ring-2 ring-[rgba(179,74,74,.28)]'
              : 'bg-white border-slate-200 hover:border-[rgba(179,74,74,.5)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-2xl bg-[var(--app-risk)] text-white flex items-center justify-center font-black">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <span className="app-badge risk">
              نفذ المخزون
            </span>
          </div>
          <div className="mt-2">
            <div className="text-[11px] text-slate-500 font-bold">أصناف نفذت بالكامل</div>
            <div className="text-xl sm:text-2xl font-black t-risk app-num">
              {stockMetrics.outOfStockCount} <span className="text-xs font-bold text-slate-500">صنف</span>
            </div>
            <div className="text-[10px] t-risk font-semibold mt-0.5">غير متاح بالفرع أو بأكتوبر</div>
          </div>
        </div>
      </div>

      {/* INVENTORY MATRIX */}
      <div className="space-y-4 animate-in fade-in">
          {/* Header Controls */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2 flex-wrap">
                  <span>إدارة المخزون والتوافر بالفرع والمخزن الرئيسي</span>
                  <span className="app-badge warn">
                    {filteredProducts.length} صنف
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-bold">
                  <span className="app-badge neutral">
                    فرعك: {currentUser?.branchName || 'غير محدد'}
                  </span>
                  <span className="app-badge neutral">
                    مخزون الفرع ظاهر حسب الصلاحية
                  </span>
                  <span className="app-badge warn">
                    مخزن أكتوبر الرئيسي ظاهر للجميع للحجز عند الاعتماد
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  إذا كان المنتج متوفراً بالفرع يصرف مباشرة بدون تحويل، وفي حال عدم توفره بالفرع يتم تقديم طلب تحويل فوري من فرع أكتوبر.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* View Layout Switcher (Cards / Table) */}
                <div className="bg-white p-1 rounded-2xl flex items-center gap-1 border border-slate-200">
                  <button
                    onClick={() => setViewLayout('cards')}
                    className={`app-pill flex items-center gap-1.5 px-3 py-1.5 text-xs ${
                      viewLayout === 'cards' ? 'on' : ''
                    }`}
                    title="عرض البطاقات الذكية (مناسب للموبايل)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>بطاقات للموبايل</span>
                  </button>
                  <button
                    onClick={() => setViewLayout('table')}
                    className={`app-pill flex items-center gap-1.5 px-3 py-1.5 text-xs ${
                      viewLayout === 'table' ? 'on' : ''
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
                  className="btn-ghost px-3 py-2 text-xs"
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
                    className="btn-primary px-3 py-2 text-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة صنف</span>
                  </button>
                )}
              </div>
            </div>

            {/* Branch scope: non-admin users are locked to their assigned branch */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                <Building className="h-4 w-4 text-[var(--app-warn-text)]" />
                <span>المخزون المعروض</span>
              </div>
              {currentUser?.role === 'admin' || currentUser?.role === 'developer' ? (
                <select
                  value={selectedBranchFilter}
                  onChange={(event) => setSelectedBranchFilter(event.target.value)}
                  className="min-w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                  aria-label="اختيار فرع المخزون"
                >
                  <option value="الكل">كل الفروع والمخزن الرئيسي</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.name}>{branch.name}</option>
                  ))}
                </select>
              ) : (
                <span className="app-badge warn">
                  {currentUser?.branchName || 'الفرع المحدد بالحساب'}
                </span>
              )}
              <span className="text-[11px] font-semibold text-slate-500">الفرع ثم المخزن الرئيسي عند اعتماد الطلبية</span>
            </div>

            {/* 🏠⚡ Sector Tabs: المخزون بقطاعين (منزلي / كهربائي) */}
            {canSwitchSector && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-2xl p-1.5 w-full sm:w-auto overflow-x-auto">
                {([
                  { key: 'all', label: 'كل القطاعات', icon: null, count: sectorCounts.all },
                  { key: 'home', label: '🏠 منزلي', icon: null, count: sectorCounts.home },
                  { key: 'electrical', label: '⚡ كهربائي', icon: null, count: sectorCounts.electrical },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setSectorTab(tab.key);
                      setCurrentPage(1);
                    }}
                    className={`flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer min-h-[40px] ${
                      effectiveSector === tab.key
                        ? 'bg-[var(--app-navy)] text-white shadow'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label} <span className="opacity-70">({tab.count})</span>
                  </button>
                ))}
              </div>
            )}

            {/* Quick Filter Buttons (Pills) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setStockLevelFilter('all')}
                className={`pill-filter px-3 py-1.5 whitespace-nowrap ${stockLevelFilter === 'all' ? 'on' : ''}`}
              >
                الكل ({sectorCounts[effectiveSector]})
              </button>
              <button
                onClick={() => setStockLevelFilter('offers')}
                className={`pill-filter px-3 py-1.5 whitespace-nowrap flex items-center gap-1.5 ${stockLevelFilter === 'offers' ? 'on' : ''}`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>عروض وخصومات ({stockMetrics.offersCount})</span>
              </button>
              <button
                onClick={() => setStockLevelFilter('in_branch')}
                className={`pill-filter px-3 py-1.5 whitespace-nowrap flex items-center gap-1.5 ${stockLevelFilter === 'in_branch' ? 'on' : ''}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>متوفر بالفرع ({stockMetrics.inBranchCount})</span>
              </button>
              <button
                onClick={() => setStockLevelFilter('needs_transfer')}
                className={`pill-filter px-3 py-1.5 whitespace-nowrap flex items-center gap-1.5 ${stockLevelFilter === 'needs_transfer' ? 'on' : ''}`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>يتطلب تحويل من أكتوبر ({stockMetrics.needsTransferCount})</span>
              </button>
              <button
                onClick={() => setStockLevelFilter('low_stock')}
                className={`pill-filter px-3 py-1.5 whitespace-nowrap flex items-center gap-1.5 ${stockLevelFilter === 'low_stock' ? 'on' : ''}`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>قارب على الانتهاء ({stockMetrics.lowStockCount})</span>
              </button>
              <button
                onClick={() => setStockLevelFilter('out_of_stock')}
                className={`pill-filter px-3 py-1.5 whitespace-nowrap flex items-center gap-1.5 ${stockLevelFilter === 'out_of_stock' ? 'on' : ''}`}
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
                  className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl border border-slate-200">
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
                        ? 'border-[rgba(16,43,78,.3)] bg-blue-gray'
                        : isTotallyOut
                        ? 'border-[rgba(179,74,74,.35)] bg-red-soft'
                        : isLowStock
                        ? 'border-[rgba(155,112,39,.35)] bg-orange-soft'
                        : 'border-slate-200 hover:border-slate-border'
                    }`}
                  >
                    <div>
                      {/* Top Header: Code, Dept & Status Badge */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-blue-gray text-gray font-mono font-black text-xs px-2 py-0.5 rounded-lg border border-slate-border-soft tracking-wide">
                            {p.code}
                          </span>
                          <span className="app-badge neutral">
                            <DeptIcon className="w-3 h-3" />
                            <span>{p.department || p.category}</span>
                          </span>
                        </div>

                        {/* Status Ribbon */}
                        {isTotallyOut ? (
                          <span className="app-badge risk">
                            <ShieldAlert className="w-3 h-3" />
                            <span>نفذ</span>
                          </span>
                        ) : needsTransfer ? (
                          <span className="app-badge neutral">
                            <Truck className="w-3 h-3" />
                            <span>طلب تحويل</span>
                          </span>
                        ) : isLowStock ? (
                          <span className="app-badge warn">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>متوفر بالفرع</span>
                          </span>
                        ) : (
                          <span className="app-badge ok">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>متوفر بالفرع</span>
                          </span>
                        )}
                      </div>

                      {/* Product Name & Details */}
                      <h3 className="font-black text-slate-900 text-sm leading-snug mb-1">
                        {p.name}
                      </h3>

                      <div className="text-xs text-slate-500 mb-3 flex flex-wrap items-center gap-2">
                        <span>شدة الكرتونة: <strong className="app-num text-slate-800">{p.cartonQuantity} قطعة</strong></span>
                        <span>•</span>
                        <span>سعر الكرتونة: <strong className="dream-amt t-navy">{formatCurrency(p.cartonPrice)}</strong></span>
                        {p.promoPrice ? (
                          <span className="app-badge risk">
                            <Flame className="w-3 h-3" />
                            <span>سعر العرض: {formatCurrency(p.promoPrice)}</span>
                          </span>
                        ) : null}
                      </div>

                      {/* Stock Level Banner */}
                      <div className={`p-3 rounded-2xl mb-3 border text-xs ${
                        isTotallyOut
                          ? 'inv-panel-risk'
                          : needsTransfer
                          ? 'panel-navy'
                          : isLowStock
                          ? 'panel-warn'
                          : 'panel-ok'
                      }`}>
                        <div className="flex items-center justify-between font-bold mb-1">
                          <span className="flex items-center gap-1">
                            <Building className="w-3.5 h-3.5" />
                            <span>مخزون الفرع الحالي ({currentActiveBranch || 'الفرع'}):</span>
                          </span>
                          <span className="text-sm font-black app-num">
                            {branchActual} كرتونة
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-600 border-t border-slate-200/60 pt-1">
                          <span className="flex items-center gap-1">
                            <Warehouse className="w-3 h-3 t-warn" />
                            <span>المخزن الرئيسي (أكتوبر):</span>
                          </span>
                          <span className="font-bold text-slate-800 app-num">
                            {p.mainWarehouseActual} كرتونة
                          </span>
                        </div>

                        {/* Explanation Notice */}
                        <div className="mt-2 text-[10px] font-bold">
                          {isAvailableInBranch ? (
                            <span className="flex items-center gap-1">
                              الصنف متاح بالفرع — صرف وتسليم مباشر للمندوب بدون تحويل
                            </span>
                          ) : needsTransfer ? (
                            <span className="flex items-center gap-1">
                              غير متوفر بالفرع — اضغط بالأسفل لطلب تحويل الكمية المطلوبة من أكتوبر
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              الرصيد منتهي بالكامل من الفرع والمخزن المركزي
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
                            className="btn-primary flex-1 py-2 px-3 text-xs"
                          >
                            <Truck className="w-4 h-4" />
                            <span>طلب تحويل من أكتوبر</span>
                          </button>
                        ) : (
                          <div className="flex-1 panel-navy border font-bold py-2 px-3 rounded-xl text-xs text-center flex items-center justify-center gap-1.5">
                            <Truck className="w-3.5 h-3.5" />
                            <span>يحتاج تحويل (يطلبه المشرف/المدير)</span>
                          </div>
                        )
                      ) : isAvailableInBranch ? (
                        <div className="flex-1 panel-ok border font-bold py-2 px-3 rounded-xl text-xs text-center">
                          متاح للصرف المباشر
                        </div>
                      ) : (
                        <div className="flex-1 bg-slate-light t-muted border border-slate-200 font-bold py-2 px-3 rounded-xl text-xs text-center">
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
                          className="chip-btn p-2"
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
                          className="chip-btn p-2"
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
                          className="chip-btn danger p-2"
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
                      <th className="p-3">كود المنتج / الموحد</th>
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
                          className={`transition ${
                            needsTransfer
                              ? 'bg-[rgba(16,43,78,.045)]'
                              : isTotallyOut
                              ? 'bg-[rgba(179,74,74,.055)]'
                              : isLowStock
                              ? 'bg-[rgba(155,112,39,.055)]'
                              : ''
                          }`}
                        >
                          {/* Code */}
                          <td className="p-3">
                            <div className="flex flex-col gap-1 items-start">
                              <span className="bg-slate-100 text-slate-800 font-mono px-2 py-0.5 rounded text-[11px] font-bold border border-slate-200 tracking-wide">
                                {p.code}
                              </span>
                              {p.unifiedCode && (
                                <span className="bg-indigo-50 text-indigo-700 font-mono px-1.5 py-0.2 rounded text-[10px] font-black border border-indigo-200">
                                  #{p.unifiedCode.replace('#', '')}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Name */}
                          <td className="p-3">
                            <div className="font-extrabold text-slate-900 text-xs sm:text-sm">{p.name}</div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span className="bg-slate-light text-slate border border-slate-200 px-1.5 py-0.2 rounded font-bold flex items-center gap-1">
                                <DeptIcon className="w-3 h-3 t-warn" />
                                <span>{p.department || p.category}</span>
                              </span>
                              {p.classification && (
                                <span className="bg-slate-light text-slate px-1.5 py-0.2 rounded font-bold">
                                  {p.classification}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Pack Quantity */}
                          <td className="p-3 text-center app-num text-slate-900">
                            {p.cartonQuantity} ق
                          </td>

                          {/* Branch Stock */}
                          <td className="p-3 text-center font-black">
                            <span
                              className={`text-sm app-num ${
                                isAvailableInBranch
                                  ? 't-ok'
                                  : 't-risk'
                              }`}
                            >
                              {branchActual} كرتونة
                            </span>
                            <div className="text-[10px] text-slate-400 font-normal tabular-nums">
                              ({branchActual * (p.cartonQuantity || 1)} ق)
                            </div>
                          </td>

                          {/* Availability Status & Action Notice */}
                          <td className="p-3 text-center">
                            {isAvailableInBranch ? (
                              <span className="app-badge ok">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>متوفر بالفرع (صرف مباشر)</span>
                              </span>
                            ) : needsTransfer ? (
                              <span className="app-badge neutral animate-pulse">
                                <Truck className="w-3 h-3" />
                                <span>طلب تحويل من أكتوبر</span>
                              </span>
                            ) : (
                              <span className="app-badge risk">
                                <ShieldAlert className="w-3 h-3" />
                                <span>نفذ تماماً</span>
                              </span>
                            )}
                          </td>

                          {/* Main Warehouse Stock */}
                          <td className="p-3 text-center app-num t-warn bg-[rgba(201,154,67,.05)]">
                            <div>{p.mainWarehouseActual} كرتونة</div>
                            <div className="text-[10px] text-slate-400 font-normal tabular-nums">متاح: {p.mainWarehouseReserved} ك</div>
                          </td>

                          {/* Carton Price */}
                          <td className="p-3 text-left dream-amt t-navy">
                            {formatCurrency(p.cartonPrice)}
                          </td>

                          {/* Promo / Offer Price */}
                          <td className="p-3 text-center font-black">
                            {p.promoPrice ? (
                              <div className="inline-flex flex-col items-center bg-red-light border border-[rgba(179,74,74,.25)] px-2 py-0.5 rounded-lg">
                                <span className="t-risk app-num text-xs">{formatCurrency(p.promoPrice)}</span>
                                <span className="text-[9px] font-bold t-risk opacity-80 tabular-nums">
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
                                    className="btn-primary px-2.5 py-1 text-xs"
                                    title="طلب تحويل كراتين من فرع أكتوبر"
                                  >
                                    <Truck className="w-3.5 h-3.5" />
                                    <span>طلب تحويل</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setStockTransferModal(p)}
                                    className="chip-btn px-2 py-1 text-xs font-bold"
                                    title="طلب تغذية مخزون إضافية"
                                  >
                                    <Truck className="w-3.5 h-3.5" />
                                    <span>تحويل</span>
                                  </button>
                                )
                              ) : (
                                needsTransfer && (
                                  <span className="t-navy bg-blue-very-light px-2 py-1 rounded-md border border-slate-200 text-[10px] font-bold">
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
                                  className="app-btn app-btn-ok px-2 py-1 text-xs"
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
                                  className="chip-btn p-1.5"
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
                                  className="chip-btn danger p-1.5"
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
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 font-black focus:outline-none"
                >
                  <option value={20}>20 صنف</option>
                  <option value={50}>50 صنف</option>
                  <option value={100}>100 صنف</option>
                  <option value={250}>250 صنف</option>
                  <option value={500}>500 صنف</option>
                  <option value={1000}>1000 صنف</option>
                  <option value={2500}>2500 صنف</option>
                  <option value={50000}>عرض الكل ({filteredProducts.length} صنف)</option>
                </select>
                <span>من إجمالي <strong className="text-slate-900 app-num">{filteredProducts.length}</strong> صنف</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="chip-btn px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  title="الصفحة الأولى"
                >
                  الأولى
                </button>

                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  className="chip-btn p-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="الصفحة السابقة"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <span className="navy-panel text-white font-black rounded-lg px-3 py-1 text-xs tabular-nums">
                  صفحة {currentPage} من {totalPages}
                </span>

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  className="chip-btn p-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="الصفحة التالية"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="chip-btn px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  title="الصفحة الأخيرة"
                >
                  الأخيرة
                </button>
              </div>
            </div>
          )}
        </div>

      {/* Quick Supply / Replenish Modal */}
      {supplyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 t-ok" />
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
                <div className="t-ok font-bold mt-1 app-num">الرصيد الفعلي الحالي: {supplyModal.branchStockActual} كرتونة</div>
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
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-base text-slate-900 app-num"
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
                className="btn-primary flex-1 py-2.5 text-xs"
              >
                تأكيد إضافة الرصيد
              </button>
              <button
                onClick={() => setSupplyModal(null)}
                className="app-btn app-btn-ghost px-4 py-2.5 text-xs"
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
                <Truck className="w-4 h-4 t-warn" />
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
                <div className="bg-[rgba(201,154,67,.07)] p-2.5 rounded-xl border border-[rgba(201,154,67,.3)]">
                  <div className="text-slate-500">المخزن المركزي (أكتوبر):</div>
                  <strong className="t-warn font-bold text-sm app-num">{stockTransferModal.mainWarehouseActual} كرتونة</strong>
                </div>
                <div className="panel-ok p-2.5 rounded-xl border">
                  <div className="text-slate-500">مخزون الفرع الحالي ({currentActiveBranch || 'الفرع'}):</div>
                  <strong className="t-ok font-bold text-sm app-num">{getProductBranchStock(stockTransferModal)} كرتونة</strong>
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
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-base text-slate-900 app-num"
                />
                <div className="text-[10px] text-slate-400 mt-1 tabular-nums">
                  إجمالي القطع المعبأة داخل الكراتين: <strong>{transferAmount * (stockTransferModal.cartonQuantity || 1)} قطعة</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleExecuteTransfer}
                className="btn-primary flex-1 py-2.5 text-xs"
              >
                تأكيد التحويل المخزني
              </button>
              <button
                onClick={() => setStockTransferModal(null)}
                className="app-btn app-btn-ghost px-4 py-2.5 text-xs"
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
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
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
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
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
                    <option value="مرتفع">مرتفع</option>
                    <option value="متوسط">متوسط</option>
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
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold app-num"
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
                      className="app-btn app-btn-risk-soft px-3.5 py-2 flex items-center gap-1.5"
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
                    className="app-btn app-btn-ghost px-4 py-2 text-xs"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="btn-primary px-6 py-2 text-xs"
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
