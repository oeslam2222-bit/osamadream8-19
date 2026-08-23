import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  Filter,
  Flame,
  Grid,
  Info,
  Layers,
  List,
  Package,
  Plus,
  Minus,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  Warehouse,
  X,
  XCircle,
  Zap,
  DownloadCloud,
  HardDrive,
  CheckCheck,
  Trash2,
  Upload,
  RefreshCw,
  Star,
  ShieldCheck,
  Truck,
  SlidersHorizontal,
  FileSpreadsheet,
  Link,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
  Clock
} from 'lucide-react';
import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ProductImage } from './ProductImage';
import {
  generateProductPlaceholderSvg,
  getProductImageUrl,
  getCandidateImageUrls,
  optimizeImageUrl,
  buildGoogleDriveCompressedUrls
} from '../services/cloudinaryService';
import { formatCurrency } from '../services/invoiceService';
import { cacheProductImages, getCachedImagesStats, clearCachedImages } from '../services/imageCacheService';
import { parseExcelProducts, fetchAndParseGoogleSheet, generateSampleExcelTemplate } from '../services/excelService';
import { ItemStatus, OFFICIAL_DEPARTMENTS, Product, SalesPriority } from '../types';

interface ProductCatalogProps {
  onOpenCart?: () => void;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({ onOpenCart }) => {
  const {
    products,
    currentUser,
    addToCart,
    importProductsList,
    wipeAllProductsAndData,
    cloudinaryConfig,
    selectedBranchFilter,
    dataSaverMode,
    toggleDataSaverMode,
    setIsInstallModalOpen
  } = useApp();

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOfficialDept, setSelectedOfficialDept] = useState<string>('الكل');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('الكل');
  const [selectedPriority, setSelectedPriority] = useState<string>('الكل');
  const [selectedStatus, setSelectedStatus] = useState<string>('الكل');
  const [stockAvailabilityFilter, setStockAvailabilityFilter] = useState<
    'all' | 'in_branch' | 'in_warehouse' | 'low_stock' | 'out_of_stock' | 'high_stock'
  >('all');
  const [priceSort, setPriceSort] = useState<'default' | 'price_asc' | 'price_desc' | 'priority'>('default');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modals & UI States
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [addedItemToast, setAddedItemToast] = useState<{ name: string; count: string } | null>(null);
  const [stockErrorToast, setStockErrorToast] = useState<string | null>(null);
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeInvoicesToo, setWipeInvoicesToo] = useState(false);
  const [wipeSuccessText, setWipeSuccessText] = useState<string | null>(null);

  // Fresh Upload / Setup state when empty or after wipe
  const [isUploadBoxOpen, setIsUploadBoxOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [googleSheetInput, setGoogleSheetInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Per-card ordering state (custom quantity and carton vs piece toggle)
  const [cardOrderState, setCardOrderState] = useState<Record<string, { type: 'carton' | 'piece'; quantity: number }>>({});

  // Cache stats state for phone bandwidth saving
  const [cacheStats, setCacheStats] = useState<{ count: number; estimatedSizeMB: number }>({ count: 0, estimatedSizeMB: 0 });
  const [isCaching, setIsCaching] = useState(false);
  const [cacheProgressText, setCacheProgressText] = useState('');

  // Pagination & Progressive Loading state to avoid network choke and high data consumption
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(16);
  const [currentPage, setCurrentPage] = useState(1);

  // Auto-reset pagination when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedOfficialDept,
    selectedSubCategory,
    selectedPriority,
    selectedStatus,
    stockAvailabilityFilter,
    selectedBranchFilter,
    priceSort
  ]);

  useEffect(() => {
    getCachedImagesStats().then(setCacheStats);
  }, [products]);

  const handleCacheAllImages = async () => {
    setIsCaching(true);
    setCacheProgressText('جاري فحص وضغط وحفظ صور الكتالوج في ذاكرة الهاتف...');
    
    // Gather all candidate image URLs with compressed size parameter (s=200)
    const allUrls: string[] = [];
    products.forEach(p => {
      const urls = getCandidateImageUrls(p, cloudinaryConfig);
      if (urls.length > 0) {
        // Optimize to 200px thumbnail for offline cache
        allUrls.push(optimizeImageUrl(urls[0], 200, true));
      }
    });

    const res = await cacheProductImages(allUrls);
    const updatedStats = await getCachedImagesStats();
    setCacheStats(updatedStats);
    setIsCaching(false);
    setCacheProgressText(`تم حفظ ${res.cached} صورة بنجاح في ذاكرة الهاتف! لن يتم استهلاك أي باقة عند فتحها.`);
    setTimeout(() => setCacheProgressText(''), 4000);
  };

  // Wipe all data and images so user can upload from scratch
  const handleConfirmWipe = async () => {
    setIsWiping(true);
    try {
      await wipeAllProductsAndData({ wipeInvoices: wipeInvoicesToo });
      const stats = await getCachedImagesStats();
      setCacheStats(stats);
      setIsWipeModalOpen(false);
      setIsUploadBoxOpen(true);
      setWipeSuccessText('تم مسح جميع الأصناف والصور بنجاح! يمكنك الآن رفع ملفك من الصفر.');
      setTimeout(() => setWipeSuccessText(null), 5000);
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsWiping(false);
    }
  };

  // Upload Excel file directly
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const res = await parseExcelProducts(file);
      if (res.products.length === 0) {
        setUploadError(res.errors.join(' | ') || 'لم يتم العثور على أي أصناف في الملف.');
      } else {
        importProductsList(res.products, 'replace');
        setUploadSuccess(`تم استيراد ${res.products.length} صنف بنجاح وربط الصور والمخازن!`);
        setIsUploadBoxOpen(false);
      }
    } catch (err: any) {
      setUploadError(err.message || 'حدث خطأ أثناء قراءة ملف الإكسل');
    } finally {
      setIsUploading(false);
    }
  };

  // Sync with Google Sheets live URL
  const handleGoogleSheetSync = async () => {
    if (!googleSheetInput.trim()) {
      setUploadError('يرجى لصق رابط Google Sheet أولاً');
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const res = await fetchAndParseGoogleSheet(googleSheetInput);
      if (res.products.length === 0) {
        setUploadError(res.errors.join(' | ') || 'لم يتم العثور على أصناف داخل الشيت.');
      } else {
        importProductsList(res.products, 'replace');
        setUploadSuccess(`تم استيراد ${res.products.length} صنف بنجاح من Google Sheets!`);
        setIsUploadBoxOpen(false);
      }
    } catch (err: any) {
      setUploadError(err.message || 'فشل الاتصال بـ Google Sheets');
    } finally {
      setIsUploading(false);
    }
  };

  // Department item count helper
  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = { 'الكل': products.length };
    OFFICIAL_DEPARTMENTS.forEach((dept) => {
      counts[dept] = 0;
    });

    products.forEach((p) => {
      const pDept = (p.department || '').trim();
      const pCat = (p.category || '').trim();
      const pName = (p.name || '').trim();
      const pCode = (p.code || '').trim();

      OFFICIAL_DEPARTMENTS.forEach((dept) => {
        const dLower = dept.toLowerCase();
        if (
          pDept.toLowerCase() === dLower ||
          pCat.toLowerCase() === dLower ||
          pName.toLowerCase().includes(dLower) ||
          pCode.toLowerCase().startsWith(dept.slice(0, 3).toLowerCase())
        ) {
          counts[dept] = (counts[dept] || 0) + 1;
        }
      });
    });

    return counts;
  }, [products]);

  // Extract unique subcategories
  const subCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category && !OFFICIAL_DEPARTMENTS.includes(p.category as any)) {
        set.add(p.category.trim());
      }
      if (p.classification && p.classification !== 'فئة A' && !OFFICIAL_DEPARTMENTS.includes(p.classification as any)) {
        set.add(p.classification.trim());
      }
    });
    return Array.from(set).filter(Boolean);
  }, [products]);

  // Stock Counts for Filtering
  const stockCounts = useMemo(() => {
    let outOfStock = 0;
    let lowStock = 0;
    let highStock = 0;
    let inBranch = 0;
    let inWarehouse = 0;

    products.forEach((p) => {
      const branchCartons = Math.floor(p.branchStockReserved / (p.cartonQuantity || 1));
      const isOut = p.branchStockReserved <= 0 && p.branchStockActual <= 0;
      if (isOut) {
        outOfStock++;
      } else if (branchCartons > 0 && branchCartons <= 5) {
        lowStock++;
      } else if (branchCartons >= 30) {
        highStock++;
      }

      if (p.branchStockReserved > 0 || p.branchStockActual > 0) inBranch++;
      if (p.mainWarehouseReserved > 0 || p.mainWarehouseActual > 0) inWarehouse++;
    });

    return {
      all: products.length,
      outOfStock,
      lowStock,
      highStock,
      inBranch,
      inWarehouse,
    };
  }, [products]);

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      // Branch filter if not 'الكل'
      if (selectedBranchFilter !== 'الكل' && p.branchName && p.branchName !== selectedBranchFilter) {
        if (p.mainWarehouseActual <= 0 && p.branchStockActual <= 0) return false;
      }

      // Search match
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const codeMatch = p.code.toLowerCase().includes(query);
        const nameMatch = p.name.toLowerCase().includes(query);
        const catMatch = p.category?.toLowerCase().includes(query);
        const deptMatch = p.department?.toLowerCase().includes(query);
        const colorMatch = p.color?.toLowerCase().includes(query);
        const barcodeMatch = p.barcode?.includes(query);

        if (!codeMatch && !nameMatch && !catMatch && !deptMatch && !colorMatch && !barcodeMatch) {
          return false;
        }
      }

      // Official 22 Departments Filter
      if (selectedOfficialDept !== 'الكل') {
        const target = selectedOfficialDept.toLowerCase().trim();
        const pDept = (p.department || '').toLowerCase().trim();
        const pCat = (p.category || '').toLowerCase().trim();
        const pName = (p.name || '').toLowerCase().trim();
        const pCode = (p.code || '').toLowerCase().trim();

        const match =
          pDept === target ||
          pCat === target ||
          pDept.includes(target) ||
          pCat.includes(target) ||
          pName.includes(target) ||
          pCode.startsWith(selectedOfficialDept.slice(0, 3).toLowerCase());

        if (!match) return false;
      }

      // Sub-category filter
      if (selectedSubCategory !== 'الكل') {
        const matchCat = p.category === selectedSubCategory;
        const matchClass = p.classification === selectedSubCategory;
        if (!matchCat && !matchClass) return false;
      }

      // Priority filter
      if (selectedPriority !== 'الكل' && p.salesPriority !== selectedPriority) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'الكل' && p.status !== selectedStatus) {
        return false;
      }

      // Stock Filters (المنتهية، قاربت على النفاذ، المتوفرة بكثرة، إلخ)
      const branchCartons = Math.floor(p.branchStockReserved / (p.cartonQuantity || 1));
      if (stockAvailabilityFilter === 'out_of_stock') {
        if (p.branchStockReserved > 0 || p.branchStockActual > 0) return false;
      } else if (stockAvailabilityFilter === 'low_stock') {
        if (branchCartons <= 0 || branchCartons > 5) return false;
      } else if (stockAvailabilityFilter === 'high_stock') {
        if (branchCartons < 30) return false;
      } else if (stockAvailabilityFilter === 'in_branch') {
        if (p.branchStockActual <= 0 && p.branchStockReserved <= 0) return false;
      } else if (stockAvailabilityFilter === 'in_warehouse') {
        if (p.mainWarehouseActual <= 0 && p.mainWarehouseReserved <= 0) return false;
      }

      return true;
    });

    // Sorting
    if (priceSort === 'price_asc') {
      result.sort((a, b) => a.piecePrice - b.piecePrice);
    } else if (priceSort === 'price_desc') {
      result.sort((a, b) => b.piecePrice - a.piecePrice);
    } else if (priceSort === 'priority') {
      const pWeights: Record<SalesPriority, number> = { 'مرتفع': 4, 'متوسط': 3, 'عادي': 2, 'منخفض': 1 };
      result.sort((a, b) => (pWeights[b.salesPriority] || 0) - (pWeights[a.salesPriority] || 0));
    }

    return result;
  }, [
    products,
    searchTerm,
    selectedOfficialDept,
    selectedSubCategory,
    selectedPriority,
    selectedStatus,
    stockAvailabilityFilter,
    selectedBranchFilter,
    priceSort
  ]);

  // Total pages and chunked display computation
  const totalPages = useMemo(() => {
    if (itemsPerPage === 'all') return 1;
    return Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  }, [filteredProducts.length, itemsPerPage]);

  const displayedProducts = useMemo(() => {
    if (itemsPerPage === 'all') return filteredProducts;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  // Card quantity & type handler
  const getCardState = (productId: string) => {
    return cardOrderState[productId] || { type: 'carton', quantity: 1 };
  };

  const updateCardType = (productId: string, type: 'carton' | 'piece') => {
    setCardOrderState((prev) => ({
      ...prev,
      [productId]: { ...getCardState(productId), type }
    }));
  };

  const adjustCardQuantity = (productId: string, delta: number) => {
    const current = getCardState(productId);
    const newQty = Math.max(1, current.quantity + delta);
    setCardOrderState((prev) => ({
      ...prev,
      [productId]: { ...current, quantity: newQty }
    }));
  };

  const setCardQuantityDirect = (productId: string, quantity: number, maxAllowed?: number) => {
    let safeQty = isNaN(quantity) || quantity < 1 ? 1 : quantity;
    if (maxAllowed && maxAllowed > 0) {
      safeQty = Math.min(safeQty, maxAllowed);
    }
    const current = getCardState(productId);
    setCardOrderState((prev) => ({
      ...prev,
      [productId]: { ...current, quantity: safeQty }
    }));
  };

  const handleQuickAddWithState = (product: Product) => {
    const state = getCardState(product.id);
    const res = addToCart(product, state.type, state.quantity);
    if (!res.success) {
      setStockErrorToast(res.message || 'عفواً: نفاذ المخزون أو تم حجز الكمية المتبقية بواسطة مندوب آخر الآن!');
      setTimeout(() => setStockErrorToast(null), 4000);
      return;
    }
    const label = state.type === 'carton' ? `${state.quantity} كرتونة` : `${state.quantity} قطعة`;
    setAddedItemToast({ name: product.name, count: label });
    setTimeout(() => setAddedItemToast(null), 2500);
  };

  const handleDirectAdd = (product: Product, type: 'carton' | 'piece', count = 1) => {
    const res = addToCart(product, type, count);
    if (!res.success) {
      setStockErrorToast(res.message || 'عفواً: نفاذ المخزون أو تم حجز الكمية المتبقية بواسطة مندوب آخر الآن!');
      setTimeout(() => setStockErrorToast(null), 4000);
      return;
    }
    const label = type === 'carton' ? `${count} كرتونة` : `${count} قطعة`;
    setAddedItemToast({ name: product.name, count: label });
    setTimeout(() => setAddedItemToast(null), 2500);
  };

  const priorityBadges: Record<SalesPriority, { bg: string; text: string; icon?: any }> = {
    'مرتفع': { bg: 'bg-rose-500 text-white', text: 'الأكثر طلباً 🔥', icon: Flame },
    'متوسط': { bg: 'bg-amber-500 text-slate-950', text: 'طلب متكرر ⚡', icon: Zap },
    'عادي': { bg: 'bg-slate-700 text-slate-200', text: 'منتج معتمد' },
    'منخفض': { bg: 'bg-zinc-600 text-zinc-200', text: 'عادي' },
  };

  return (
    <div className="space-y-4 pb-20">
      
      {/* Toast Notification when adding item (Amazon / Souq style) */}
      {addedItemToast && (
        <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-6 md:right-auto z-50 bg-slate-950 text-white px-4 py-3 rounded-2xl shadow-2xl border-2 border-amber-400 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-amber-400 font-bold flex items-center gap-1">
                <span>تمت الإضافة إلى عربة التسوق</span>
                <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.2 rounded font-black">جاهز للطلب</span>
              </div>
              <div className="text-sm font-black truncate max-w-[220px] sm:max-w-xs">{addedItemToast.name}</div>
              <div className="text-xs text-slate-300 font-medium">{addedItemToast.count}</div>
            </div>
          </div>

          {onOpenCart && (
            <button
              onClick={onOpenCart}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 px-3 py-1.5 rounded-xl font-black text-xs shadow transition whitespace-nowrap cursor-pointer"
            >
              عرض السلة 🛒
            </button>
          )}
        </div>
      )}

      {/* Stock Error Notification Toast when double booking / depleted */}
      {stockErrorToast && (
        <div className="fixed top-20 left-4 right-4 md:left-auto md:right-6 z-50 max-w-md bg-rose-900 text-white px-4 py-3.5 rounded-2xl shadow-2xl border-2 border-rose-400 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-rose-200 font-black">تنبيه نفاذ / حجز المخزون ⚠️</div>
              <div className="text-xs text-white font-bold leading-tight">{stockErrorToast}</div>
            </div>
          </div>
          <button onClick={() => setStockErrorToast(null)} className="text-rose-200 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Wipe / Reset Data Success Alert */}
      {wipeSuccessText && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-xs rounded-xl font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{wipeSuccessText}</span>
        </div>
      )}

      {/* Unified, Clean Search & Quick Filters Bar */}
      <div className="bg-slate-900 text-white rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-lg border border-slate-800 space-y-3">
        
        {/* Main Search Row */}
        <div className="flex flex-col md:flex-row items-stretch gap-2.5">
          {/* Main search input */}
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالكود، اسم الصنف، الماركة (الفا، لاينز، كاساسونكو)..."
              className="w-full h-11 pl-9 pr-10 bg-slate-800 text-white placeholder-slate-400 border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Actions in Top Bar */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setIsUploadBoxOpen(true)}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-750 text-amber-300 font-bold px-3 h-11 rounded-xl text-xs border border-slate-700 transition cursor-pointer"
              title="رفع ملف إكسل أو ربط Google Sheets"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>رفع إكسل</span>
            </button>

            <button
              onClick={() => setIsWipeModalOpen(true)}
              className="flex items-center gap-1 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 font-bold px-2.5 h-11 rounded-xl text-xs border border-rose-800/40 transition cursor-pointer"
              title="تصفير ومسح الكل للبدء من جديد"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            </button>
          </div>
        </div>

        {/* Dropdown Filters Toolbar (منظم ومجمع في سطر واحد بدون تطاير) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-800/80 text-xs">
          {/* Department Filter Dropdown */}
          <div className="relative">
            <select
              aria-label="اختر القسم"
              value={selectedOfficialDept}
              onChange={(e) => setSelectedOfficialDept(e.target.value)}
              className="w-full h-10 px-2.5 bg-slate-800 text-amber-300 border border-slate-700 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer text-xs"
            >
              <option value="الكل">🏢 كل الأقسام ({products.length})</option>
              {OFFICIAL_DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept} ({deptCounts[dept] || 0})
                </option>
              ))}
            </select>
          </div>

          {/* Stock Status Dropdown */}
          <div className="relative">
            <select
              aria-label="تصفية حالة المخزون"
              value={stockAvailabilityFilter}
              onChange={(e) => setStockAvailabilityFilter(e.target.value as any)}
              className="w-full h-10 px-2.5 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer text-xs"
            >
              <option value="all">📦 كل حالات المخزون</option>
              <option value="in_branch">🏢 متوفر بالفرع ({stockCounts.inBranch})</option>
              <option value="in_warehouse">🏬 مخزن أكتوبر المركزي ({stockCounts.inWarehouse})</option>
              <option value="low_stock">⚠️ قاربت على النفاذ ({stockCounts.lowStock})</option>
              <option value="high_stock">🟢 متوفر بكثرة ({stockCounts.highStock})</option>
              <option value="out_of_stock">🚫 نفذ المخزون ({stockCounts.outOfStock})</option>
            </select>
          </div>

          {/* Priority & Offers Dropdown */}
          <div className="relative">
            <select
              aria-label="تصفية الطلب والعروض"
              value={selectedPriority !== 'الكل' ? `priority_${selectedPriority}` : selectedStatus !== 'الكل' ? `status_${selectedStatus}` : 'all'}
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith('priority_')) {
                  setSelectedPriority(val.replace('priority_', ''));
                  setSelectedStatus('الكل');
                } else if (val.startsWith('status_')) {
                  setSelectedStatus(val.replace('status_', ''));
                  setSelectedPriority('الكل');
                } else {
                  setSelectedPriority('الكل');
                  setSelectedStatus('الكل');
                }
              }}
              className="w-full h-10 px-2.5 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer text-xs"
            >
              <option value="all">⚡ كل الأصناف والعروض</option>
              <option value="priority_مرتفع">🔥 الأكثر طلباً</option>
              <option value="status_عرض ترويجي">🎁 عروض ترويجية</option>
              <option value="status_راكد">⏳ أصناف راكدة</option>
              <option value="status_نواقص">❗ نواقص مطلوب توفيرها</option>
            </select>
          </div>

          {/* Sort & View Mode Dropdown */}
          <div className="flex items-center gap-1">
            <select
              aria-label="ترتيب المنتجات"
              value={priceSort}
              onChange={(e) => setPriceSort(e.target.value as any)}
              className="flex-1 h-10 px-2.5 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer text-xs"
            >
              <option value="default">الترتيب: الافتراضي</option>
              <option value="priority">الأكثر طلباً 🔥</option>
              <option value="price_asc">الأقل سعراً ⬆️</option>
              <option value="price_desc">الأعلى سعراً ⬇️</option>
            </select>

            <div className="flex bg-slate-800 p-0.5 rounded-xl border border-slate-700 h-10">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  viewMode === 'grid' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="عرض بطاقات"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  viewMode === 'list' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="عرض جدول"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Active Filter Reset Pill if filtered */}
        {(searchTerm || selectedOfficialDept !== 'الكل' || selectedPriority !== 'الكل' || selectedStatus !== 'الكل' || stockAvailabilityFilter !== 'all' || priceSort !== 'default') && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
            <span className="text-slate-400 text-[11px]">
              النتائج المطابقة: <strong className="text-amber-300 font-bold">{filteredProducts.length}</strong> صنف
            </span>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedOfficialDept('الكل');
                setSelectedSubCategory('الكل');
                setSelectedPriority('الكل');
                setSelectedStatus('الكل');
                setStockAvailabilityFilter('all');
                setPriceSort('default');
              }}
              className="text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer text-xs"
            >
              إلغاء التصفية
            </button>
          </div>
        )}

      </div>

      {/* Fresh Upload / Setup Box (Visible when triggered or when products are empty) */}
      {isUploadBoxOpen && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-amber-400 shadow-xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                <Upload className="w-4 h-4" />
              </div>
              <h3 className="font-black text-slate-900 text-base">رفع شيت الأصناف وربط الصور من جديد</h3>
            </div>
            <button
              onClick={() => setIsUploadBoxOpen(false)}
              className="text-slate-400 hover:text-slate-700 p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-bold">
              {uploadError}
            </div>
          )}

          {uploadSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl font-bold">
              {uploadSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Direct Excel File Upload */}
            <div className="p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300 text-center space-y-2">
              <FileSpreadsheet className="w-8 h-8 text-amber-500 mx-auto" />
              <div className="font-black text-slate-800 text-sm">رفع ملف Excel أو CSV من الهاتف/الكمبيوتر</div>
              <p className="text-xs text-slate-500">يدعم كافة أعمدة شيت شركة دريم طنطاوي (كود، اسم، كرتونة، أسعار، صور)</p>
              
              <label className="inline-block bg-slate-900 hover:bg-slate-800 text-amber-300 font-black px-4 py-2 rounded-xl text-xs cursor-pointer shadow transition mt-2">
                <span>{isUploading ? 'جاري الرفع...' : 'اختيار ملف الإكسل 📁'}</span>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  disabled={isUploading}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </div>

            {/* Google Sheets Live Link */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-right">
              <div className="flex items-center gap-2">
                <Link className="w-4 h-4 text-emerald-600" />
                <span className="font-black text-slate-800 text-sm">ربط مباشر مع Google Sheets</span>
              </div>
              <p className="text-xs text-slate-500">انسخ رابط شيت جوجل درايف والصقه هنا للمزامنة المباشرة</p>
              
              <div className="flex gap-2">
                <input
                  type="url"
                  value={googleSheetInput}
                  onChange={(e) => setGoogleSheetInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  type="button"
                  onClick={handleGoogleSheetSync}
                  disabled={isUploading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? 'مزامنة...' : 'سحب البيانات'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product Display (Amazon / Souq Style Grid View) */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayedProducts.map((product, idx) => {
            const isPromo = product.promoPrice && product.promoPrice > 0;
            const priorityConfig = priorityBadges[product.salesPriority];
            const hasBranchStock = product.branchStockActual > 0;
            const hasMainWhStock = product.mainWarehouseActual > 0;
            const totalCartonsAvailable = Math.max(0, product.branchStockReserved) + Math.max(0, product.mainWarehouseReserved);
            const orderState = getCardState(product.id);
            const cartonSavings = Math.max(0, (product.piecePrice * product.cartonQuantity) - product.cartonPrice);

            return (
              <div
                key={product.id}
                className="bg-white rounded-3xl overflow-hidden border border-slate-200 hover:border-amber-400/90 shadow-sm hover:shadow-xl transition-all duration-200 flex flex-col justify-between group relative"
              >
                {/* Top Image & Floating Badges */}
                <div
                  className="relative h-48 bg-gradient-to-br from-slate-50 via-slate-100/80 to-amber-50/20 overflow-hidden cursor-pointer flex items-center justify-center border-b border-slate-100"
                  onClick={() => setSelectedProductForModal(product)}
                >
                  {/* Google Drive / Cloudinary Compressed Image with parameter s=200 */}
                  <ProductImage
                    product={product}
                    cloudinaryConfig={cloudinaryConfig}
                    targetSize={200}
                    sizeVariant="card"
                    priority={idx < 6}
                    containerClassName="w-full h-full"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />

                  {/* Amazon Best Seller / Priority Badge */}
                  <div className="absolute top-2.5 right-2.5 bg-slate-950/90 text-amber-300 text-xs font-black px-2.5 py-1 rounded-xl backdrop-blur-xs shadow-md flex items-center gap-1">
                    <span>{product.code}</span>
                  </div>

                  {/* Promo Badge */}
                  {isPromo ? (
                    <div className="absolute top-2.5 left-2.5 bg-rose-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-lg shadow-md flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5" />
                      <span>خصم خاص</span>
                    </div>
                  ) : product.salesPriority === 'مرتفع' ? (
                    <div className="absolute top-2.5 left-2.5 bg-amber-500 text-slate-950 text-[11px] font-black px-2 py-0.5 rounded-lg shadow-md flex items-center gap-1">
                      <Star className="w-3 h-3 fill-slate-950" />
                      <span>الأكثر طلباً</span>
                    </div>
                  ) : null}

                  {/* Quick Detail Preview Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProductForModal(product);
                    }}
                    className="absolute bottom-2.5 left-2.5 bg-white/95 hover:bg-white text-slate-900 px-2.5 py-1 rounded-xl shadow-md text-xs font-bold flex items-center gap-1 transition"
                  >
                    <Eye className="w-3.5 h-3.5 text-amber-600" />
                    <span>معاينة</span>
                  </button>

                  {/* Pack Size Pill */}
                  <div className="absolute bottom-2.5 right-2.5 bg-slate-950/85 text-slate-200 text-[11px] font-bold px-2 py-0.5 rounded-lg backdrop-blur-xs">
                    شدة الكرتونة: <strong className="text-amber-300">{product.cartonQuantity} ق</strong>
                  </div>
                </div>

                {/* Body Details (Amazon / Souq Product Information) */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  
                  {/* Category, Rating & Title */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 font-medium">
                      <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-bold">
                        {product.department || product.category || 'دريم للتوزيع'}
                      </span>
                      <div className="flex items-center gap-1 text-amber-500 font-bold">
                        <Star className="w-3 h-3 fill-amber-400" />
                        <span>4.9</span>
                      </div>
                    </div>

                    <h3
                      onClick={() => setSelectedProductForModal(product)}
                      className="font-black text-slate-900 text-sm leading-snug line-clamp-2 hover:text-amber-600 cursor-pointer transition"
                      title={product.name}
                    >
                      {product.name}
                    </h3>
                  </div>

                  {/* Stock Availability Health Bar */}
                  <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
                    {/* Low Stock / Out of Stock Visual Warning */}
                    {totalCartonsAvailable <= 0 ? (
                      <div className="bg-rose-600 text-white text-[10px] font-black px-2.5 py-1 rounded-xl flex items-center justify-center gap-1 shadow-xs">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>نفد المخزون بالكامل (0 كرتونة متبقية) 🚫</span>
                      </div>
                    ) : product.branchStockReserved <= 0 && product.mainWarehouseReserved > 0 ? (
                      <div className="bg-blue-100 text-blue-900 border border-blue-300 text-[10px] font-black px-2 py-1 rounded-xl flex items-center justify-center gap-1">
                        <Warehouse className="w-3.5 h-3.5 text-blue-700" />
                        <span>متوفر بالمخزن المركزي فقط ({product.mainWarehouseReserved} كرتونة) 🏢</span>
                      </div>
                    ) : product.branchStockReserved <= 5 ? (
                      <div className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-2 py-1 rounded-xl flex items-center justify-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-700" />
                        <span>تنبيه: متبقي {product.branchStockReserved} كرتونة فقط بالفرع</span>
                      </div>
                    ) : null}

                    {/* Branch Stock in Cartons */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-slate-700 font-bold">
                        <Package className="w-3.5 h-3.5 text-emerald-600" />
                        <span>رصيد الفرع:</span>
                      </div>
                      <div className="text-left">
                        {hasBranchStock ? (
                          <span className="text-emerald-800 font-black">
                            {product.branchStockActual} كرتونة
                          </span>
                        ) : (
                          <span className="text-rose-600 font-bold">نفذ بالفرع</span>
                        )}
                        <span className="text-[10px] text-slate-500 mr-1 font-bold">
                          (المتاح: {Math.max(0, product.branchStockReserved)} كرتونة)
                        </span>
                      </div>
                    </div>

                    {/* October Central Warehouse Stock in Cartons */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                      <div className="flex items-center gap-1 text-slate-700 font-bold">
                        <Warehouse className="w-3.5 h-3.5 text-amber-600" />
                        <span>مخزن أكتوبر المركزي:</span>
                      </div>
                      <div className="text-left">
                        {hasMainWhStock ? (
                          <span className="text-amber-900 font-black">
                            {product.mainWarehouseActual} كرتونة
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">غير متوفر</span>
                        )}
                        <span className="text-[10px] text-slate-500 mr-1 font-bold">
                          (المتاح: {Math.max(0, product.mainWarehouseReserved)} كرتونة)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Pricing Section (Carton Price ONLY) */}
                  <div className="bg-gradient-to-r from-amber-50 via-amber-100/60 to-yellow-50 p-3 rounded-2xl border border-amber-300 shadow-xs">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="text-[10px] text-amber-950 font-black flex items-center gap-1">
                          <span>سعر الكرتونة بالجملة:</span>
                        </div>
                        <div className="text-xl font-black text-amber-950">
                          {formatCurrency(product.cartonPrice)}
                        </div>
                      </div>

                      <div className="text-left">
                        <div className="text-[10px] text-slate-500 font-bold">شدة الكرتونة:</div>
                        <div className="text-xs font-black bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded-lg">
                          {product.cartonQuantity} قطعة
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Carton Quantity Direct Editable Input & Add to Cart Button */}
                  <div className="flex items-center gap-2 pt-1">
                    {/* Carton Editable Stepper */}
                    <div className="flex items-center bg-slate-100 rounded-xl border border-slate-300 p-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={totalCartonsAvailable <= 0 || orderState.quantity <= 1}
                        onClick={() => adjustCardQuantity(product.id, -1)}
                        className="w-7 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-200 rounded-lg font-black disabled:opacity-30 cursor-pointer"
                        title="إنقاص كرتونة (-1)"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      <input
                        type="number"
                        min="1"
                        max={Math.max(1, totalCartonsAvailable)}
                        disabled={totalCartonsAvailable <= 0}
                        value={orderState.quantity}
                        onChange={(e) => {
                          const parsed = parseInt(e.target.value, 10);
                          setCardQuantityDirect(product.id, parsed, totalCartonsAvailable);
                        }}
                        className="w-12 h-7 text-center font-black text-xs text-slate-900 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
                        title="اكتب عدد الكراتين مباشرة"
                      />

                      <button
                        type="button"
                        disabled={totalCartonsAvailable <= 0 || orderState.quantity >= totalCartonsAvailable}
                        onClick={() => adjustCardQuantity(product.id, 1)}
                        className="w-7 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-200 rounded-lg font-black disabled:opacity-30 cursor-pointer"
                        title="زيادة كرتونة (+1)"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Golden "Add to Cart" Button in Cartons */}
                    {totalCartonsAvailable > 0 ? (
                      <button
                        type="button"
                        onClick={() => handleQuickAddWithState(product)}
                        className="flex-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black py-2.5 px-2 rounded-xl text-xs shadow-md transition transform active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <ShoppingCart className="w-4 h-4 shrink-0" />
                        <span>أضف {orderState.quantity} كرتونة</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="flex-1 bg-slate-100 border border-slate-300 text-slate-500 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1 cursor-not-allowed opacity-80"
                      >
                        <XCircle className="w-4 h-4 text-rose-500" />
                        <span>نفد المخزون</span>
                      </button>
                    )}
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Amazon Dense Table View for Fast Order Entry */
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-200 font-bold">
                <tr>
                  <th className="p-3">الكود والصورة</th>
                  <th className="p-3">اسم الصنف والبيان</th>
                  <th className="p-3">القسم والتصنيف</th>
                  <th className="p-3 text-center">شدة الكرتونة</th>
                  <th className="p-3 text-center">مخزون الفرع (كرتونة)</th>
                  <th className="p-3 text-center">مخزن أكتوبر (كرتونة)</th>
                  <th className="p-3 text-left">سعر الكرتونة بالجملة</th>
                  <th className="p-3 text-center">إضافة كرتونة للطلبية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedProducts.map((product) => {
                  const branchCartons = product.branchStockActual;
                  const branchReservedCartons = Math.max(0, product.branchStockReserved);
                  const mainWhCartons = product.mainWarehouseActual;

                  return (
                    <tr key={product.id} className="hover:bg-amber-50/40 transition">
                      <td className="p-2.5">
                        <div className="flex items-center gap-2">
                          <ProductImage
                            product={product}
                            cloudinaryConfig={cloudinaryConfig}
                            targetSize={120}
                            sizeVariant="thumbnail"
                            containerClassName="w-11 h-11 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 cursor-pointer"
                            className="w-full h-full object-cover"
                            showBadgeOnFallback={false}
                            onClick={() => setSelectedProductForModal(product)}
                          />
                          <span className="font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-lg text-[11px]">
                            {product.code}
                          </span>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-black text-slate-900 hover:text-amber-600 cursor-pointer" onClick={() => setSelectedProductForModal(product)}>
                          {product.name}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span>اللون: {product.color || '---'}</span>
                          <span>الحجم: {product.size || '---'}</span>
                        </div>
                      </td>
                      <td className="p-2.5 font-bold text-slate-600">{product.department || product.category}</td>
                      <td className="p-2.5 text-center font-black text-slate-800">{product.cartonQuantity} قطعة</td>
                      <td className="p-2.5 text-center">
                        <span className={branchCartons > 0 ? 'text-emerald-700 font-black' : 'text-red-600 font-bold'}>
                          {branchCartons} كرتونة
                        </span>
                        <div className="text-[10px]">
                          {branchReservedCartons <= 0 ? (
                            <span className="text-rose-600 font-black">نفذ (0 متاح)</span>
                          ) : (
                            <span className="text-slate-500 font-bold">متاح: {branchReservedCartons} كرتونة</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-amber-800 font-black">{mainWhCartons} كرتونة</span>
                      </td>
                      <td className="p-2.5 text-left font-black text-amber-950 text-sm">
                        {formatCurrency(product.cartonPrice)}
                      </td>
                      <td className="p-2.5 text-center">
                        {(branchReservedCartons + mainWhCartons) > 0 ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleDirectAdd(product, 'carton', 1)}
                              className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black px-3 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-xs whitespace-nowrap"
                            >
                              +1 كرتونة 🛒
                            </button>
                          </div>
                        ) : (
                          <div className="text-center text-rose-600 font-bold text-[11px] bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
                            نفد المخزون
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination & Progressive Loading Controller */}
      {filteredProducts.length > 0 && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Left / Info & Per-Page selector */}
          <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 w-full sm:w-auto text-xs">
            <div className="text-slate-600 font-bold flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-slate-400 font-normal">عرض الأصناف:</span>
              <strong className="text-slate-900">
                {itemsPerPage === 'all'
                  ? `كافة الأصناف (${filteredProducts.length})`
                  : `${Math.min((currentPage - 1) * itemsPerPage + 1, filteredProducts.length)} - ${Math.min(currentPage * itemsPerPage, filteredProducts.length)} من أصل ${filteredProducts.length}`}
              </strong>
            </div>

            <div className="flex items-center gap-1.5 text-slate-500 font-bold">
              <span>لكل صفحة:</span>
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                {[16, 24, 48, 'all'].map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      setItemsPerPage(size as any);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                      itemsPerPage === size
                        ? 'bg-amber-400 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/60'
                    }`}
                  >
                    {size === 'all' ? 'الكل' : size}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right / Page Switcher */}
          {itemsPerPage !== 'all' && totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 w-full sm:w-auto">
              {/* Previous Page */}
              <button
                onClick={() => {
                  setCurrentPage((p) => Math.max(1, p - 1));
                  window.scrollTo({ top: 180, behavior: 'smooth' });
                }}
                disabled={currentPage === 1}
                className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-slate-700 transition cursor-pointer"
                title="الصفحة السابقة"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Page Number Pills */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 7) return true;
                  if (p === 1 || p === totalPages) return true;
                  return Math.abs(p - currentPage) <= 1;
                })
                .map((p, idx, arr) => {
                  const prevVal = arr[idx - 1];
                  const hasGap = prevVal && p - prevVal > 1;
                  return (
                    <React.Fragment key={p}>
                      {hasGap && <span className="px-1 text-slate-400 font-bold">...</span>}
                      <button
                        onClick={() => {
                          setCurrentPage(p);
                          window.scrollTo({ top: 180, behavior: 'smooth' });
                        }}
                        className={`min-w-[34px] h-[34px] rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center ${
                          currentPage === p
                            ? 'bg-slate-950 text-amber-400 shadow-md scale-105'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  );
                })}

              {/* Next Page */}
              <button
                onClick={() => {
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                  window.scrollTo({ top: 180, behavior: 'smooth' });
                }}
                disabled={currentPage === totalPages}
                className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-slate-700 transition cursor-pointer"
                title="الصفحة التالية"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State with Fast Setup Assistant */}
      {filteredProducts.length === 0 && (
        <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-slate-200 shadow-sm space-y-4 max-w-xl mx-auto">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <Package className="w-8 h-8" />
          </div>
          
          <h3 className="text-lg sm:text-xl font-black text-slate-900">
            {products.length === 0 ? 'الكتالوج فارغ حالياً - ابدأ برفع بياناتك' : 'لا توجد نتائج مطابقة للبحث أو الفلتر'}
          </h3>
          
          <p className="text-xs sm:text-sm text-slate-500">
            {products.length === 0
              ? 'يمكنك الآن رفع ملف الإكسل الخاص بشركة دريم أو ربط رابط Google Sheets وصور جوجل درايف للبدء فوراً.'
              : 'جرّب تغيير كلمات البحث أو إزالة الفلاتر المحددة لعرض كافة الأصناف.'}
          </p>

          <div className="flex items-center justify-center gap-2 pt-2">
            {products.length === 0 ? (
              <button
                onClick={() => setIsUploadBoxOpen(true)}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 px-5 py-2.5 rounded-2xl text-xs font-black shadow-md transition flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>رفع شيت الأصناف الآن 📄</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedOfficialDept('الكل');
                  setSelectedSubCategory('الكل');
                  setSelectedPriority('الكل');
                  setSelectedStatus('الكل');
                  setStockAvailabilityFilter('all');
                  setPriceSort('default');
                }}
                className="bg-slate-900 text-amber-300 px-5 py-2.5 rounded-2xl text-xs font-bold shadow hover:bg-slate-800 cursor-pointer"
              >
                إعادة تعيين البحث
              </button>
            )}
          </div>
        </div>
      )}

      {/* Wipe All Data Confirmation Modal ("مسح كل البيانات للرفع من جديد") */}
      {isWipeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-slate-900">هل تريد مسح وتصفير كافة البيانات؟</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                هذا الإجراء سيقوم بمسح جميع أصناف الكتالوج التجريبية والصور المخزنة، لتتمكن من رفع شيت الأصناف الخاص بك وصور جوجل درايف من البداية بدون أي تداخل.
              </p>
            </div>

            {/* Invoices option */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wipeInvoicesToo}
                  onChange={(e) => setWipeInvoicesToo(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-400 w-4 h-4"
                />
                <span>مسح سجل الفواتير والطلبيات التجريبية أيضاً</span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsWipeModalOpen(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-2xl text-xs transition cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleConfirmWipe}
                disabled={isWiping}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-2.5 rounded-2xl text-xs shadow-md transition cursor-pointer disabled:opacity-50"
              >
                {isWiping ? 'جاري المسح...' : 'نعم، تصفير والبدء من جديد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal (Amazon Product Detail View) */}
      {selectedProductForModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="bg-slate-950 text-amber-300 font-black text-xs px-2.5 py-1 rounded-xl">
                  {selectedProductForModal.code}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {selectedProductForModal.department || selectedProductForModal.category}
                </span>
              </div>
              <button
                onClick={() => setSelectedProductForModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Product Image Preview */}
              <div className="space-y-2">
                <div className="h-64 bg-slate-50 rounded-3xl overflow-hidden border border-slate-200 relative flex items-center justify-center">
                  <ProductImage
                    product={selectedProductForModal}
                    cloudinaryConfig={cloudinaryConfig}
                    targetSize={800}
                    sizeVariant="modal"
                    containerClassName="w-full h-full bg-slate-50"
                    className="w-full h-full object-contain"
                  />
                  {selectedProductForModal.promoPrice && (
                    <div className="absolute top-3 right-3 bg-purple-600 text-white font-bold text-xs px-2.5 py-1 rounded-xl shadow z-10">
                      عرض ترويجي نشط 🎁
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 text-center">
                  معرّف الصورة: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-amber-800 font-bold">{selectedProductForModal.cloudinaryPublicId || selectedProductForModal.code}</code>
                </div>
              </div>

              {/* Product Specs */}
              <div className="space-y-4 text-xs">
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-snug">
                    {selectedProductForModal.name}
                  </h3>
                  <div className="text-slate-500 mt-1">
                    القسم: {selectedProductForModal.department} • الفئة: {selectedProductForModal.classification}
                  </div>
                </div>

                {/* Stock Details Box */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-900 text-xs">مستويات المخزون بالكراتين:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                      <div className="text-[10px] text-slate-400">الفرع الحالي:</div>
                      <div className="font-black text-sm text-emerald-700">
                        {selectedProductForModal.branchStockActual} كرتونة
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold">
                        متاح للطلب: {Math.max(0, selectedProductForModal.branchStockReserved)} كرتونة
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                      <div className="text-[10px] text-slate-400">المخزن المركزي بأكتوبر:</div>
                      <div className="font-black text-sm text-amber-800">
                        {selectedProductForModal.mainWarehouseActual} كرتونة
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold">
                        متاح للطلب: {Math.max(0, selectedProductForModal.mainWarehouseReserved)} كرتونة
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pricing Box (Carton Price Only) */}
                <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-xs text-amber-950 font-black">سعر الكرتونة بالجملة (المعتمد):</div>
                      <div className="text-xl font-black text-amber-950">
                        {formatCurrency(selectedProductForModal.cartonPrice)}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] text-slate-500 font-bold">شدة الكرتونة:</div>
                      <div className="text-xs font-black bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded-lg">
                        {selectedProductForModal.cartonQuantity} قطعة
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Attributes */}
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div className="bg-slate-50 p-2 rounded-xl">شدة الكرتونة: <strong className="text-slate-900">{selectedProductForModal.cartonQuantity} قطعة</strong></div>
                  <div className="bg-slate-50 p-2 rounded-xl">الحجم / الوزن: <strong className="text-slate-900">{selectedProductForModal.size || 'قياسي'}</strong></div>
                  <div className="bg-slate-50 p-2 rounded-xl">اللون: <strong className="text-slate-900">{selectedProductForModal.color || 'أصلي'}</strong></div>
                  <div className="bg-slate-50 p-2 rounded-xl">الأولوية: <strong className="text-slate-900">{selectedProductForModal.salesPriority}</strong></div>
                </div>

                {/* Quick Add Action in Modal */}
                <div className="pt-2">
                  {selectedProductForModal.branchStockReserved > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-slate-100 rounded-2xl border border-slate-300 p-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => adjustCardQuantity(selectedProductForModal.id, -1)}
                          className="w-8 h-9 flex items-center justify-center text-slate-800 hover:bg-white rounded-xl font-black cursor-pointer"
                          title="إنقاص (-1)"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={Math.max(1, selectedProductForModal.branchStockReserved)}
                          value={getCardState(selectedProductForModal.id).quantity}
                          onChange={(e) => {
                            setCardQuantityDirect(selectedProductForModal.id, parseInt(e.target.value, 10), selectedProductForModal.branchStockReserved);
                          }}
                          className="w-14 text-center font-black text-sm text-slate-900 bg-white border border-slate-200 rounded-lg h-8 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        <button
                          type="button"
                          onClick={() => adjustCardQuantity(selectedProductForModal.id, 1)}
                          className="w-8 h-9 flex items-center justify-center text-slate-800 hover:bg-white rounded-xl font-black cursor-pointer"
                          title="زيادة (+1)"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          const count = getCardState(selectedProductForModal.id).quantity;
                          handleDirectAdd(selectedProductForModal, 'carton', count);
                          setSelectedProductForModal(null);
                        }}
                        className="flex-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black py-3 px-3 rounded-2xl shadow-md text-xs transition cursor-pointer flex items-center justify-center gap-2"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>أضف {getCardState(selectedProductForModal.id).quantity} كرتونة للطلبية</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled
                      className="w-full bg-slate-100 border border-slate-300 text-slate-500 font-bold py-3 rounded-2xl text-xs cursor-not-allowed opacity-80"
                    >
                      الصنف غير متاح للطلب (المخزون محجوز بالكامل)
                    </button>
                  )}
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
