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
  const [stockAvailabilityFilter, setStockAvailabilityFilter] = useState<'all' | 'in_branch' | 'in_warehouse' | 'low_stock'>('all');
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

      // Stock filter
      if (stockAvailabilityFilter === 'in_branch' && p.branchStockActual <= 0) {
        return false;
      }
      if (stockAvailabilityFilter === 'in_warehouse' && p.mainWarehouseActual <= 0) {
        return false;
      }
      if (stockAvailabilityFilter === 'low_stock' && p.branchStockActual > 20) {
        return false;
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

      {/* Amazon-Style Header & Search Hub */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-3xl p-4 sm:p-6 shadow-xl border border-slate-800 space-y-4">
        
        {/* Top Branding & Fast Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-amber-400 text-slate-950 font-black text-xs px-2.5 py-1 rounded-lg shadow uppercase tracking-wider flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-slate-950" />
                <span>دريـــم طنطـــاوي</span>
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white">كتالوج المبيعات والتوزيع</h2>
              <span className="bg-slate-800 text-amber-300 text-xs font-black px-2.5 py-0.5 rounded-full border border-slate-700">
                {filteredProducts.length} صنف متوفر
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              طلب مباشر للمناديب والعملاء • صور سريعة مضغوطة من جوجل درايف و Cloudinary • أسعار قطاعي وجملة بالكرتونة
            </p>
          </div>

          {/* Wipe / Reset from scratch button + Upload fresh button */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto flex-wrap">
            <button
              onClick={() => setIsUploadBoxOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold px-3 py-2 rounded-xl text-xs border border-slate-700 transition cursor-pointer shadow-sm"
              title="رفع ملف إكسل أو ربط شيت جديد"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>رفع أصناف وشيت 📄</span>
            </button>

            <button
              onClick={() => setIsWipeModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 font-bold px-3 py-2 rounded-xl text-xs border border-rose-500/30 transition cursor-pointer"
              title="مسح كل الأصناف والبيانات للبدء من الصفر"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>تصفير ومسح الكل 🗑️</span>
            </button>
          </div>
        </div>

        {/* Amazon-Style Search Bar with Department Selector */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Department selector inside search box */}
          <div className="relative shrink-0 sm:w-48">
            <select
              aria-label="اختر القسم للبحث"
              value={selectedOfficialDept}
              onChange={(e) => setSelectedOfficialDept(e.target.value)}
              className="w-full h-11 px-3 bg-slate-800 text-amber-300 border border-slate-700 rounded-xl text-xs font-black focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
            >
              <option value="الكل">كل الأقسام (22 قسم)</option>
              {OFFICIAL_DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept} ({deptCounts[dept] || 0})
                </option>
              ))}
            </select>
          </div>

          {/* Main search input */}
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث مثل أمازون بالكود، الاسم، الماركة (الفا، لاينز، كاساسونكو، ديفنا)، المقاس..."
              className="w-full h-11 pl-9 pr-10 bg-slate-800/90 text-white placeholder-slate-400 border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-slate-800 transition"
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

          {/* View toggle (Amazon Grid vs List) & Sort */}
          <div className="flex items-center gap-2">
            <select
              aria-label="ترتيب المنتجات"
              value={priceSort}
              onChange={(e) => setPriceSort(e.target.value as any)}
              className="h-11 px-3 bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
            >
              <option value="default">الترتيب: الافتراضي</option>
              <option value="priority">الأكثر مبيعاً 🔥</option>
              <option value="price_asc">الأقل سعراً ⬆️</option>
              <option value="price_desc">الأعلى سعراً ⬇️</option>
            </select>

            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 h-11">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                  viewMode === 'grid' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="عرض بطاقات أمازون"
              >
                <Grid className="w-4 h-4" />
                <span className="hidden sm:inline">بطاقات</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                  viewMode === 'list' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="عرض جدول مناديب سريع"
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">جدول</span>
              </button>
            </div>
          </div>
        </div>

        {/* Data Saver & Google Drive / Cache Optimization Status Bar */}
        <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-400/20 text-amber-300 font-bold border border-amber-400/30">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>ضغط صور جوجل درايف: <strong>s=200px (فائق السرعة)</strong></span>
            </div>
            
            <div className="flex items-center gap-1.5 text-slate-300 text-xs">
              <HardDrive className="w-3.5 h-3.5 text-blue-400" />
              <span>الصور المخزنة بالهاتف: <strong>{cacheStats.count}</strong> صورة ({cacheStats.estimatedSizeMB} MB)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCacheAllImages}
            disabled={isCaching}
            className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3 py-1.5 rounded-xl font-black text-xs transition shadow cursor-pointer disabled:opacity-50"
          >
            <DownloadCloud className={`w-3.5 h-3.5 ${isCaching ? 'animate-bounce' : ''}`} />
            <span>{isCaching ? 'جاري الحفظ...' : 'حفظ كل الصور لتوفير الباقة 📱'}</span>
          </button>
        </div>

        {cacheProgressText && (
          <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs rounded-xl font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCheck className="w-4 h-4 text-emerald-400" />
            <span>{cacheProgressText}</span>
          </div>
        )}

        {/* Amazon Horizontal Department Category Pills */}
        <div className="pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => setSelectedOfficialDept('الكل')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition shrink-0 flex items-center gap-1.5 ${
                selectedOfficialDept === 'الكل'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <span>جميع الأقسام</span>
              <span className="text-[10px] bg-slate-950/20 px-1.5 py-0.2 rounded-full font-bold">
                {products.length}
              </span>
            </button>

            {OFFICIAL_DEPARTMENTS.map((dept) => {
              const count = deptCounts[dept] || 0;
              const isSelected = selectedOfficialDept === dept;
              return (
                <button
                  key={dept}
                  onClick={() => setSelectedOfficialDept(dept)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition shrink-0 flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                  }`}
                >
                  <span>{dept}</span>
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected ? 'bg-slate-950 text-amber-300' : 'bg-slate-900 text-slate-400'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Filter Badges (Stock & Deals) */}
        <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
          <button
            onClick={() => setStockAvailabilityFilter(stockAvailabilityFilter === 'in_branch' ? 'all' : 'in_branch')}
            className={`px-3 py-1 rounded-lg font-bold border transition ${
              stockAvailabilityFilter === 'in_branch'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            🏢 متوفر بالفرع فقط
          </button>

          <button
            onClick={() => setStockAvailabilityFilter(stockAvailabilityFilter === 'in_warehouse' ? 'all' : 'in_warehouse')}
            className={`px-3 py-1 rounded-lg font-bold border transition ${
              stockAvailabilityFilter === 'in_warehouse'
                ? 'bg-amber-400 text-slate-950 border-amber-300'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            📦 متوفر بالمخزن الرئيسي
          </button>

          <button
            onClick={() => setSelectedPriority(selectedPriority === 'مرتفع' ? 'الكل' : 'مرتفع')}
            className={`px-3 py-1 rounded-lg font-bold border transition ${
              selectedPriority === 'مرتفع'
                ? 'bg-rose-500 text-white border-rose-400'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            🔥 الأكثر طلباً ومبيعاً
          </button>

          <button
            onClick={() => setSelectedStatus(selectedStatus === 'عرض ترويجي' ? 'الكل' : 'عرض ترويجي')}
            className={`px-3 py-1 rounded-lg font-bold border transition ${
              selectedStatus === 'عرض ترويجي'
                ? 'bg-purple-600 text-white border-purple-400'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            🎁 صفقات وعروض حصرية
          </button>

          {(searchTerm || selectedOfficialDept !== 'الكل' || selectedSubCategory !== 'الكل' || selectedPriority !== 'الكل' || selectedStatus !== 'الكل' || stockAvailabilityFilter !== 'all' || priceSort !== 'default') && (
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
              className="text-amber-400 hover:text-amber-300 underline font-bold px-2 cursor-pointer"
            >
              إلغاء كل الفلاتر
            </button>
          )}
        </div>

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
          {filteredProducts.map((product) => {
            const isPromo = product.promoPrice && product.promoPrice > 0;
            const priorityConfig = priorityBadges[product.salesPriority];
            const hasBranchStock = product.branchStockActual > 0;
            const hasMainWhStock = product.mainWarehouseActual > 0;
            const orderState = getCardState(product.id);
            const cartonSavings = Math.max(0, (product.piecePrice * product.cartonQuantity) - product.cartonPrice);

            return (
              <div
                key={product.id}
                className="bg-white rounded-3xl overflow-hidden border border-slate-200 hover:border-amber-400/90 shadow-sm hover:shadow-xl transition-all duration-200 flex flex-col justify-between group relative"
              >
                {/* Top Image & Floating Badges */}
                <div
                  className="relative h-48 bg-slate-900 overflow-hidden cursor-pointer"
                  onClick={() => setSelectedProductForModal(product)}
                >
                  {/* Google Drive / Cloudinary Compressed Image with parameter s=200 */}
                  <ProductImage
                    product={product}
                    cloudinaryConfig={cloudinaryConfig}
                    targetSize={200}
                    sizeVariant="card"
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
                    {product.branchStockReserved <= 0 ? (
                      <div className="bg-rose-600 text-white text-[10px] font-black px-2 py-1 rounded-xl flex items-center justify-center gap-1 shadow-xs">
                        <AlertTriangle className="w-3 h-3" />
                        <span>نفذ المخزون المتاح للفرع 🚫 (لا يمكن حجزه)</span>
                      </div>
                    ) : product.branchStockReserved <= 25 ? (
                      <div className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-2 py-1 rounded-xl flex items-center justify-center gap-1 animate-pulse">
                        <AlertTriangle className="w-3 h-3 text-amber-700" />
                        <span>تنبيه: قارب على النفاذ! متبقي {product.branchStockReserved} قطعة فقط</span>
                      </div>
                    ) : null}

                    {/* Branch Stock */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-slate-600 font-medium">
                        <Package className="w-3.5 h-3.5 text-emerald-600" />
                        <span>الفرع الحالي:</span>
                      </div>
                      <div>
                        {hasBranchStock ? (
                          <span className="text-emerald-700 font-black">{product.branchStockActual} ق</span>
                        ) : (
                          <span className="text-rose-600 font-bold">نفذ بالفرع</span>
                        )}
                        <span className="text-[10px] text-slate-400 mr-1">(متاح: {product.branchStockReserved})</span>
                      </div>
                    </div>

                    {/* Main Warehouse Stock */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                      <div className="flex items-center gap-1 text-slate-600 font-medium">
                        <Warehouse className="w-3.5 h-3.5 text-amber-500" />
                        <span>المخزن الرئيسي:</span>
                      </div>
                      <div>
                        {hasMainWhStock ? (
                          <span className="text-amber-800 font-black">{product.mainWarehouseActual} ق</span>
                        ) : (
                          <span className="text-slate-400">غير متوفر</span>
                        )}
                        <span className="text-[10px] text-slate-400 mr-1">(متاح: {product.mainWarehouseReserved})</span>
                      </div>
                    </div>
                  </div>

                  {/* Amazon Pricing Section (Piece vs Carton) */}
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50/50 p-3 rounded-2xl border border-amber-200/80 space-y-1">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold">سعر القطعة:</div>
                        <div className="text-base font-black text-slate-950">
                          {isPromo ? (
                            <span className="text-purple-700">{formatCurrency(product.promoPrice)}</span>
                          ) : (
                            formatCurrency(product.piecePrice)
                          )}
                        </div>
                      </div>

                      <div className="text-left">
                        <div className="text-[10px] text-slate-500 font-bold">سعر الكرتونة ({product.cartonQuantity} ق):</div>
                        <div className="text-sm font-black text-amber-900">
                          {formatCurrency(product.cartonPrice)}
                        </div>
                      </div>
                    </div>

                    {cartonSavings > 0 && (
                      <div className="text-[10px] text-emerald-700 font-black pt-1 border-t border-amber-200/50 flex items-center justify-between">
                        <span>وفر عند الشراء بالكرتونة:</span>
                        <span>{formatCurrency(cartonSavings)}</span>
                      </div>
                    )}
                  </div>

                  {/* Order Mode Switcher (كرتونة vs قطعة) */}
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                    <button
                      type="button"
                      disabled={product.branchStockReserved <= 0}
                      onClick={() => updateCardType(product.id, 'carton')}
                      className={`py-1.5 rounded-lg font-black transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        orderState.type === 'carton'
                          ? 'bg-amber-400 text-slate-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📦 كرتونة ({product.cartonQuantity} ق)
                    </button>
                    <button
                      type="button"
                      disabled={product.branchStockReserved <= 0}
                      onClick={() => updateCardType(product.id, 'piece')}
                      className={`py-1.5 rounded-lg font-black transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        orderState.type === 'piece'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      🏷️ بالقطعة
                    </button>
                  </div>

                  {/* Amazon Quick Quantity Stepper & Add to Cart Button */}
                  <div className="flex items-center gap-2 pt-1">
                    {/* Stepper */}
                    <div className="flex items-center bg-slate-100 rounded-xl border border-slate-200 p-0.5">
                      <button
                        type="button"
                        disabled={product.branchStockReserved <= 0}
                        onClick={() => adjustCardQuantity(product.id, -1)}
                        className="w-7 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-200 rounded-lg font-black disabled:opacity-40"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-xs font-black text-slate-900">
                        {orderState.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={product.branchStockReserved <= 0}
                        onClick={() => adjustCardQuantity(product.id, 1)}
                        className="w-7 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-200 rounded-lg font-black disabled:opacity-40"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Amazon-Style Golden "Add to Cart" Button */}
                    {product.branchStockReserved > 0 ? (
                      <button
                        type="button"
                        onClick={() => handleQuickAddWithState(product)}
                        className="flex-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black py-2 px-3 rounded-xl text-xs shadow-md transition transform active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>أضف للسلة</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="flex-1 bg-rose-100 border border-rose-300 text-rose-800 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1 cursor-not-allowed opacity-80"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>نفذ المخزون</span>
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
                  <th className="p-3">شدة الكرتونة</th>
                  <th className="p-3">مخزون الفرع</th>
                  <th className="p-3">المخزن الرئيسي</th>
                  <th className="p-3">سعر القطعة</th>
                  <th className="p-3">سعر الكرتونة</th>
                  <th className="p-3 text-center">إضافة سريعة للطلبية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => {
                  const isPromo = product.promoPrice && product.promoPrice > 0;
                  return (
                    <tr key={product.id} className="hover:bg-amber-50/40 transition">
                      <td className="p-2.5">
                        <div className="flex items-center gap-2">
                          <ProductImage
                            product={product}
                            cloudinaryConfig={cloudinaryConfig}
                            targetSize={120}
                            sizeVariant="thumbnail"
                            containerClassName="w-11 h-11 rounded-xl bg-slate-900 overflow-hidden shrink-0 border border-slate-200 cursor-pointer"
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
                      <td className="p-2.5 font-black text-slate-800">{product.cartonQuantity} ق</td>
                      <td className="p-2.5">
                        <span className={product.branchStockActual > 0 ? 'text-emerald-700 font-extrabold' : 'text-red-600 font-bold'}>
                          {product.branchStockActual} ق
                        </span>
                        <div className="text-[10px]">
                          {product.branchStockReserved <= 0 ? (
                            <span className="text-rose-600 font-black">نفذ (0 متاح)</span>
                          ) : product.branchStockReserved <= 25 ? (
                            <span className="text-amber-700 font-bold">متبقي: {product.branchStockReserved}</span>
                          ) : (
                            <span className="text-slate-400">متاح: {product.branchStockReserved}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <span className="text-amber-800 font-extrabold">{product.mainWarehouseActual} ق</span>
                        <div className="text-[10px] text-slate-400">متاح: {product.mainWarehouseReserved}</div>
                      </td>
                      <td className="p-2.5 font-extrabold text-slate-900">
                        {isPromo ? (
                          <div>
                            <span className="text-purple-700 font-black">{formatCurrency(product.promoPrice)}</span>
                            <span className="text-[10px] text-slate-400 line-through block">{formatCurrency(product.piecePrice)}</span>
                          </div>
                        ) : (
                          formatCurrency(product.piecePrice)
                        )}
                      </td>
                      <td className="p-2.5 font-black text-amber-900">{formatCurrency(product.cartonPrice)}</td>
                      <td className="p-2.5">
                        {product.branchStockReserved > 0 ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleDirectAdd(product, 'carton', 1)}
                              className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black px-2.5 py-1 rounded-xl text-xs transition cursor-pointer shadow-xs"
                            >
                              +1 كرتونة
                            </button>
                            <button
                              onClick={() => handleDirectAdd(product, 'piece', 1)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-2 py-1 rounded-xl text-xs transition cursor-pointer"
                            >
                              +1 قطعة
                            </button>
                          </div>
                        ) : (
                          <div className="text-center text-rose-600 font-bold text-[11px] bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
                            نفذ المخزون
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
                <div className="h-64 bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 relative flex items-center justify-center">
                  <ProductImage
                    product={selectedProductForModal}
                    cloudinaryConfig={cloudinaryConfig}
                    targetSize={800}
                    sizeVariant="modal"
                    containerClassName="w-full h-full bg-slate-900"
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
                  <div className="font-bold text-slate-900 text-xs">مستويات المخزون الحالية:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                      <div className="text-[10px] text-slate-400">الفرع الحالي:</div>
                      <div className="font-black text-sm text-emerald-700">{selectedProductForModal.branchStockActual} قطعة</div>
                      <div className="text-[10px] text-slate-400">متاح بعد الحجز: {selectedProductForModal.branchStockReserved}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                      <div className="text-[10px] text-slate-400">المخزن المركزي:</div>
                      <div className="font-black text-sm text-amber-800">{selectedProductForModal.mainWarehouseActual} قطعة</div>
                      <div className="text-[10px] text-slate-400">متاح بعد الحجز: {selectedProductForModal.mainWarehouseReserved}</div>
                    </div>
                  </div>
                </div>

                {/* Pricing Box */}
                <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 space-y-2">
                  <div className="font-bold text-amber-950">أسعار البيع المعتمدة:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold">سعر القطعة</div>
                      <div className="text-sm font-black text-slate-900">
                        {formatCurrency(selectedProductForModal.promoPrice || selectedProductForModal.piecePrice)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold">سعر الكرتونة ({selectedProductForModal.cartonQuantity} ق)</div>
                      <div className="text-sm font-black text-amber-900">
                        {formatCurrency(selectedProductForModal.cartonPrice)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Attributes */}
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div className="bg-slate-50 p-2 rounded-xl">شدة الكرتونة: <strong className="text-slate-900">{selectedProductForModal.cartonQuantity} ق</strong></div>
                  <div className="bg-slate-50 p-2 rounded-xl">الحجم / الوزن: <strong className="text-slate-900">{selectedProductForModal.size}</strong></div>
                  <div className="bg-slate-50 p-2 rounded-xl">اللون: <strong className="text-slate-900">{selectedProductForModal.color}</strong></div>
                  <div className="bg-slate-50 p-2 rounded-xl">الأولوية: <strong className="text-slate-900">{selectedProductForModal.salesPriority}</strong></div>
                </div>

                {/* Quick Add Action in Modal */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => {
                      handleDirectAdd(selectedProductForModal, 'carton', 1);
                      setSelectedProductForModal(null);
                    }}
                    className="flex-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black py-2.5 rounded-2xl shadow-md text-xs transition cursor-pointer"
                  >
                    + إضافة 1 كرتونة للسلة 🛒
                  </button>
                  <button
                    onClick={() => {
                      handleDirectAdd(selectedProductForModal, 'piece', 1);
                      setSelectedProductForModal(null);
                    }}
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-2xl text-xs transition cursor-pointer"
                  >
                    + إضافة 1 قطعة للسلة
                  </button>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
