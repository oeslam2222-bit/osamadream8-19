import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Building,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Filter,
  Flame,
  Grid,
  Heart,
  Layers,
  List,
  Package,
  Plus,
  Minus,
  RotateCcw,
  RotateCw,
  Search,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Tag,
  Trash2,
  Truck,
  Upload,
  Wallet,
  Coins,
  Calendar,
  X,
  XCircle,
  Zap,
  Download,
  Loader2,
} from 'lucide-react';
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/themeContext';
import { ProductImage } from './ProductImage';
import {
  getProductImageUrl,
  getCandidateImageUrls,
  optimizeImageUrl,
} from '../services/cloudinaryService';
import { formatCurrency } from '../services/invoiceService';
import { cacheProductImages, getCachedImagesStats } from '../services/imageCacheService';
import { parseExcelProducts, fetchAndParseGoogleSheet } from '../services/excelService';
import {
  buildClientCatalogPDF,
  type ClientCatalogProduct,
  type CatalogExportProgress,
} from '../services/pdfService';
import { Customer, Product } from '../types';
import { getBranchStockForProduct } from '../services/arabicMatchingService';
import { ModernCartDrawer } from './ModernCartDrawer';

interface ProductCatalogProps {
  onOpenCart?: () => void;
  selectedCustomer?: Customer | null;
  onClearSelectedCustomer?: () => void;
  onNavigateToInvoices?: (invoice?: any) => void;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({
  onOpenCart,
  selectedCustomer,
  onClearSelectedCustomer,
}) => {
  const {
    products,
    getVisibleProducts,
    currentUser,
    branches,
    addToCart,
    cart,
    getCartSummary,
    importProductsList,
    wipeAllProductsAndData,
    cloudinaryConfig,
    selectedBranchFilter,
    setSelectedBranchFilter,
    activeSectorFilter,
    setActiveSectorFilter,
  } = useApp();

  const { isDark } = useTheme();

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSearchSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [selectedDept, setSelectedDept] = useState<string>('الكل');
  const [selectedBrand, setSelectedBrand] = useState<string>('الكل');
  const [selectedStatus, setSelectedStatus] = useState<string>('الكل');
  // إخفاء الأصناف ذات الرصيد الصفري (المخزن الرئيسي ومخزن الفرع = 0) افتراضياً
  const [onlyInStock, setOnlyInStock] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<
    'default' | 'branch_stock_desc' | 'october_stock_desc' | 'price_asc' | 'price_desc' | 'name_asc'
  >('default');

  // Favorites state
  const [favorites, setFavorites] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('tantawy_fav_products');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleFavorite = (productId: string) => {
    setFavorites((prev) => {
      const next = { ...prev, [productId]: !prev[productId] };
      try {
        localStorage.setItem('tantawy_fav_products', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Pagination state (default: 12 as per reference design image_d67a7a7d.png)
  const [itemsPerPage, setItemsPerPage] = useState<number>(12);
  const [currentPage, setCurrentPage] = useState<1 | number>(1);

  // Cart Drawer & Modals
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const [addedItemToast, setAddedItemToast] = useState<{ name: string; count: string } | null>(null);
  const [stockErrorToast, setStockErrorToast] = useState<string | null>(null);

  // PDF Export States
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<CatalogExportProgress | null>(null);

  // Card quantities
  const [cardQuantities, setCardQuantities] = useState<Record<string, number>>({});
  const [cardOrderTypes, setCardOrderTypes] = useState<Record<string, 'carton' | 'piece'>>({});

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDept, selectedBrand, selectedStatus, onlyInStock, sortBy, activeSectorFilter]);

  // Active branch context
  const currentActiveBranch = useMemo(() => {
    if (
      currentUser?.role === 'sales_rep' ||
      currentUser?.role === 'supervisor' ||
      currentUser?.role === 'branch_manager'
    ) {
      return currentUser.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
    }
    return selectedBranchFilter !== 'الكل'
      ? selectedBranchFilter
      : currentUser?.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
  }, [currentUser, selectedBranchFilter]);

  const getProductBranchStock = useCallback(
    (p: Product) => {
      return getBranchStockForProduct(p, currentActiveBranch);
    },
    [currentActiveBranch]
  );

  // Dynamic Departments
  const departmentsList = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const d = (p.department || p.category || p.itemGroup || '').trim();
      if (d) set.add(d);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [products]);

  // Dynamic Brands / Categories
  const brandsList = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const b = (p.familyName || p.classification || p.category || '').trim();
      if (b && b !== 'عام' && b !== 'فئة A') set.add(b);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [products]);

  // Check if a product belongs to electrical sector
  const isProductElectrical = useCallback((p: Product) => {
    if (p.sector === 'electrical') return true;
    if (p.sector === 'home') return false;
    const checkStr = `${p.department || ''} ${p.category || ''} ${p.itemGroup || ''} ${p.familyName || ''} ${p.name || ''}`.toLowerCase();
    return (
      checkStr.includes('كهربا') ||
      checkStr.includes('لمبة') ||
      checkStr.includes('مفتاح') ||
      checkStr.includes('كابل') ||
      checkStr.includes('سلك') ||
      checkStr.includes('شاسيه') ||
      checkStr.includes('قاطع') ||
      checkStr.includes('فيشة') ||
      checkStr.includes('لقمة') ||
      checkStr.includes('وش') ||
      checkStr.includes('دواية') ||
      checkStr.includes('سبوت') ||
      checkStr.includes('كشاف')
    );
  }, []);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    let result = getVisibleProducts().filter((p) => {
      // 1. Sector filter: home vs electrical
      const userSector = currentUser?.sector as string | undefined;
      const isMultiSector =
        !currentUser ||
        currentUser.role === 'admin' ||
        currentUser.role === 'developer' ||
        userSector === 'all' ||
        userSector === 'both';

      const effectiveSector = isMultiSector
        ? activeSectorFilter === 'all'
          ? null
          : activeSectorFilter
        : userSector || 'home';

      if (effectiveSector && effectiveSector !== 'all') {
        const isElec = isProductElectrical(p);
        if (effectiveSector === 'electrical' && !isElec) return false;
        if (effectiveSector === 'home' && isElec && p.sector !== 'both' && p.sector !== 'all') return false;
      }

      // 2. Hide products with 0 stock in both main warehouse and rep's branch
      const branchStock = getProductBranchStock(p);
      const octoberStock = p.mainWarehouseActual || 0;
      if (onlyInStock && branchStock <= 0 && octoberStock <= 0) {
        return false;
      }

      // 3. Search match (اسم المنتج، كود المنتج / Item number، الكود الموحد، الباركود)
      if (debouncedSearchTerm) {
        const q = debouncedSearchTerm.toLowerCase().trim();
        const cleanQ = q.replace('#', '');
        const matchesName = (p.name || '').toLowerCase().includes(q);
        const matchesCode = (p.code || '').toLowerCase().includes(cleanQ);
        const matchesUnified = Boolean(p.unifiedCode && p.unifiedCode.toLowerCase().includes(cleanQ));
        const matchesBarcode = Boolean(p.barcode && p.barcode.includes(q));
        if (!matchesName && !matchesCode && !matchesUnified && !matchesBarcode) return false;
      }

      // 4. Department filter
      if (selectedDept !== 'الكل') {
        const pDept = (p.department || p.category || p.itemGroup || '').trim();
        if (pDept !== selectedDept) return false;
      }

      // 5. Brand filter
      if (selectedBrand !== 'الكل') {
        const pBrand = (p.familyName || p.classification || p.category || '').trim();
        if (pBrand !== selectedBrand) return false;
      }

      // 6. Status filter
      if (selectedStatus !== 'الكل') {
        if (selectedStatus === 'متوفر' && branchStock <= 0) return false;
        if (selectedStatus === 'محدود' && (branchStock > 0 || octoberStock <= 0)) return false;
        if (selectedStatus === 'نفد جزئياً' && branchStock > 0 && octoberStock > 0) return false;
      }

      return true;
    });

    // Sorting
    if (sortBy === 'branch_stock_desc') {
      result.sort((a, b) => getProductBranchStock(b) - getProductBranchStock(a));
    } else if (sortBy === 'october_stock_desc') {
      result.sort((a, b) => (b.mainWarehouseActual || 0) - (a.mainWarehouseActual || 0));
    } else if (sortBy === 'price_asc') {
      result.sort((a, b) => a.cartonPrice - b.cartonPrice);
    } else if (sortBy === 'price_desc') {
      result.sort((a, b) => b.cartonPrice - a.cartonPrice);
    } else if (sortBy === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }

    return result;
  }, [
    getVisibleProducts,
    currentUser,
    activeSectorFilter,
    onlyInStock,
    debouncedSearchTerm,
    selectedDept,
    selectedBrand,
    selectedStatus,
    sortBy,
    getProductBranchStock,
    isProductElectrical,
  ]);

  // Smart Search Suggestions: لو كتب حرف يظهرله اقتراحات فورية وأقرب أصناف مطابقة
  const searchSuggestions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    const cleanQ = q.replace('#', '');
    const pool = getVisibleProducts();

    const priorityMatches: Product[] = [];
    const secondaryMatches: Product[] = [];

    for (const p of pool) {
      const name = (p.name || '').toLowerCase();
      const code = (p.code || '').toLowerCase();
      const unified = (p.unifiedCode || '').toLowerCase();
      const dept = (p.department || p.category || p.itemGroup || '').toLowerCase();

      // Check if starts with query (highest relevance)
      if (name.startsWith(q) || code.startsWith(cleanQ) || unified.startsWith(cleanQ)) {
        priorityMatches.push(p);
      } else if (
        name.includes(q) ||
        code.includes(cleanQ) ||
        unified.includes(cleanQ) ||
        dept.includes(q)
      ) {
        secondaryMatches.push(p);
      }

      if (priorityMatches.length + secondaryMatches.length >= 25) break;
    }

    return [...priorityMatches, ...secondaryMatches].slice(0, 8);
  }, [searchTerm, getVisibleProducts]);

  // Focused Inventory Stock Metrics
  const stats = useMemo(() => {
    let branchCartons = 0;
    let octoberCartons = 0;
    let availableItemsCount = 0;

    filteredProducts.forEach((p) => {
      const bStock = getProductBranchStock(p);
      const oStock = p.mainWarehouseActual || 0;
      if (bStock > 0 || oStock > 0) {
        availableItemsCount += 1;
      }
      branchCartons += Math.max(0, bStock);
      octoberCartons += Math.max(0, oStock);
    });

    return {
      branchCartons,
      octoberCartons,
      availableItemsCount,
    };
  }, [filteredProducts, getProductBranchStock]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  // Add item to cart with quantity
  const handleAddToCart = (product: Product) => {
    const qty = cardQuantities[product.id] || 1;
    const type = cardOrderTypes[product.id] || 'carton';

    const branchStock = getProductBranchStock(product);
    const octoberStock = product.mainWarehouseActual || 0;
    const totalAvail = branchStock + octoberStock;

    if (totalAvail <= 0) {
      setStockErrorToast(`الصنف (${product.name}) غير متوفر حالياً في أي مخزن!`);
      setTimeout(() => setStockErrorToast(null), 3500);
      return;
    }

    const res = addToCart(product, type, qty, 0);
    if (!res.success) {
      setStockErrorToast(res.message || 'تعذر إضافة الصنف للمخزون.');
      setTimeout(() => setStockErrorToast(null), 3500);
      return;
    }

    setAddedItemToast({
      name: product.name,
      count: `${qty} ${type === 'carton' ? 'كرتونة' : 'قطعة'}`,
    });
    setTimeout(() => setAddedItemToast(null), 3000);
  };

  const handleQtyChange = (productId: string, delta: number) => {
    setCardQuantities((prev) => {
      const current = prev[productId] || 1;
      const next = Math.max(1, current + delta);
      return { ...prev, [productId]: next };
    });
  };

  // PDF Export Trigger (فقط الأصناف التي يتوفر لها مخزون > 0 في الفرع أو أكتوبر)
  const handleExportPDF = async () => {
    // استبعاد أي صنف رصيده صفر في مخزن المندوب والمخزن الرئيسي معاً
    const inStockProducts = filteredProducts.filter((p) => {
      const branchStock = getProductBranchStock(p);
      const octoberStock = p.mainWarehouseActual || 0;
      return branchStock > 0 || octoberStock > 0;
    });

    if (inStockProducts.length === 0) {
      setStockErrorToast('لا توجد منتجات يتوفر بها رصيد مخزني حالياً في الفرع أو أكتوبر لتصديرها.');
      setTimeout(() => setStockErrorToast(null), 3500);
      return;
    }

    setIsExportingPDF(true);
    try {
      // تصدير ما يصل إلى 150 صنفاً متوفراً بالمخازن
      const catalogItems: ClientCatalogProduct[] = inStockProducts.slice(0, 150).map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        unifiedCode: p.unifiedCode,
        imageUrl: p.imageUrl ? getProductImageUrl(p, cloudinaryConfig) : undefined,
      }));

      const catLabel =
        selectedDept !== 'الكل'
          ? selectedDept
          : activeSectorFilter === 'electrical'
          ? 'قطاع الكهرباء'
          : activeSectorFilter === 'home'
          ? 'القطاع المنزلي'
          : 'الكتالوج العام';

      const res = await buildClientCatalogPDF(catalogItems, {
        categoryName: catLabel,
        onProgress: (prog) => {
          setPdfProgress(prog);
        },
      });

      res.pdf.save(res.filename);
      setAddedItemToast({
        name: `تم تصدير ${res.exportedCount} صنف متوفر كـ PDF بنجاح 📄`,
        count: 'جاهز للمشاركة المباشرة مع العملاء',
      });
      setTimeout(() => setAddedItemToast(null), 4000);
    } catch (e: any) {
      console.error(e);
      setStockErrorToast('حدث خطأ أثناء تصدير ملف الـ PDF');
      setTimeout(() => setStockErrorToast(null), 3500);
    } finally {
      setIsExportingPDF(false);
      setPdfProgress(null);
    }
  };

  const cartSummary = getCartSummary();
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  return (
    <div className="tantawy-screen space-y-5 pb-16" dir="rtl">
      {/* 1. Header Banner & Search */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Right side: Cart Icon Graphic & Title */}
        <div className="flex items-center gap-3.5 w-full md:w-auto">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <ShoppingCart className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">كتالوج الأصناف</h1>
            <p className="text-xs text-slate-500 font-bold mt-0.5">
              اختر المنتجات بسهولة وأضفها إلى فاتورتك • نظام المخزون المركزي
            </p>
          </div>
        </div>

        {/* Left side: Prominent Search Bar with Smart Autocomplete Suggestions */}
        <div className="relative w-full md:max-w-md" ref={searchWrapperRef}>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSearchSuggestions(true);
              }}
              onFocus={() => {
                if (searchTerm.trim().length > 0) {
                  setShowSearchSuggestions(true);
                }
              }}
              placeholder="ابحث باسم المنتج أو كود المنتج أو الكود الموحد..."
              className="w-full pl-10 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-bold text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-xs"
            />
            <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setShowSearchSuggestions(false);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title="مسح البحث"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Smart Suggestions Dropdown - يظهر فور كتابة أي حرف أو رقم */}
          {showSearchSuggestions && searchTerm.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden divide-y divide-slate-100 max-h-96 overflow-y-auto">
              <div className="px-3.5 py-2 bg-slate-50 flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>اقتراحات البحث الذكي ({searchSuggestions.length} صنف)</span>
                <span className="text-[10px] text-blue-600 font-extrabold">اضغط لاختيار الصنف</span>
              </div>

              {searchSuggestions.length > 0 ? (
                searchSuggestions.map((prod) => {
                  const bStock = getProductBranchStock(prod);
                  const oStock = prod.mainWarehouseActual || 0;
                  const isAvailable = bStock > 0 || oStock > 0;

                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => {
                        setSearchTerm(prod.name);
                        setShowSearchSuggestions(false);
                      }}
                      className="w-full text-right p-3 hover:bg-blue-50/70 transition flex items-center gap-3 cursor-pointer group"
                    >
                      {/* Product Thumbnail */}
                      <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center p-1">
                        <ProductImage
                          product={prod}
                          cloudinaryConfig={cloudinaryConfig}
                          className="w-full h-full object-contain"
                        />
                      </div>

                      {/* Product Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-slate-900 group-hover:text-blue-700 transition truncate">
                            {prod.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
                          <span className="font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                            كود: {prod.code}
                          </span>
                          {prod.unifiedCode && (
                            <span className="font-mono font-black bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 text-[10px]">
                              #{prod.unifiedCode.replace('#', '')}
                            </span>
                          )}
                          <span className="text-slate-500 text-[10px]">
                            {prod.cartonPrice.toLocaleString()} ج.م
                          </span>
                        </div>
                      </div>

                      {/* Stock Badges */}
                      <div className="shrink-0 text-left">
                        {isAvailable ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              الفرع: {bStock} ك
                            </span>
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                              أكتوبر: {oStock} ك
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                            غير متوفر
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-500 font-bold">
                  لا توجد نتائج مطابقة لـ &quot;{searchTerm}&quot;
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sector Switcher for Admin / Tech Support / Supervisors */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        {isAdminOrDev ? (
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveSectorFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition ${
                activeSectorFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🌐 كل القطاعات ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSectorFilter('home')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition ${
                activeSectorFilter === 'home'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏠 القطاع المنزلي
            </button>
            <button
              type="button"
              onClick={() => setActiveSectorFilter('electrical')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition ${
                activeSectorFilter === 'electrical'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ⚡ قطاع الكهرباء
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-700 bg-blue-50 border border-blue-200 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5">
              {currentUser?.sector === 'electrical' ? '⚡ كتالوج قطاع الكهرباء' : '🏠 كتالوج القطاع المنزلي'}
            </span>
          </div>
        )}

        {/* PDF Export Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className="flex items-center gap-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white px-4 py-2 rounded-xl text-xs font-black shadow-md shadow-rose-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isExportingPDF ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            <span>{isExportingPDF ? 'جاري تجهيز الكتالوج...' : 'تصدير الصور كـ PDF 📄'}</span>
          </button>

          <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500 font-bold bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            <span>فرعك:</span>
            <span className="font-black text-slate-800">{currentActiveBranch}</span>
          </div>
        </div>
      </div>

      {/* Selected Customer Bar if applicable */}
      {selectedCustomer && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
              عميل
            </div>
            <div>
              <div className="text-xs font-black text-blue-950">
                الطلب محدد للعميل: {selectedCustomer.name} ({selectedCustomer.code})
              </div>
              <div className="text-[11px] text-blue-700 font-bold">
                المديونية الحالية: {formatCurrency(selectedCustomer.balance || 0)} ج.م
              </div>
            </div>
          </div>
          {onClearSelectedCustomer && (
            <button
              type="button"
              onClick={onClearSelectedCustomer}
              className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
            >
              إلغاء التحديد
            </button>
          )}
        </div>
      )}

      {/* 2. Focused Inventory Stock Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: مخزون فرع المندوب */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 font-bold">مخزون فرع المندوب</p>
            <p className="text-3xl font-black text-blue-900 tracking-tight">
              {stats.branchCartons.toLocaleString('en-US')}
            </p>
            <p className="text-[11px] text-slate-400 font-bold">رصيد متاح بالكرتونة ({currentActiveBranch})</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Store className="w-7 h-7" />
          </div>
        </div>

        {/* Card 2: مخزون أكتوبر المركزي */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 font-bold">المخزن الرئيسي (أكتوبر)</p>
            <p className="text-3xl font-black text-emerald-600 tracking-tight">
              {stats.octoberCartons.toLocaleString('en-US')}
            </p>
            <p className="text-[11px] text-slate-400 font-bold">رصيد مركزي متاح للسحب</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Package className="w-7 h-7" />
          </div>
        </div>

        {/* Card 3: الأصناف المتوفرة للطلب */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between sm:col-span-2 lg:col-span-1">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 font-bold">الأصناف المتوفرة للطلب</p>
            <p className="text-3xl font-black text-indigo-600 tracking-tight">
              {stats.availableItemsCount.toLocaleString('en-US')}
            </p>
            <p className="text-[11px] text-slate-400 font-bold">أصناف رصيدها أكبر من صفر</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Sparkles className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* 3. Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 flex flex-wrap items-center justify-between gap-3 select-none">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Refresh button */}
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setSelectedDept('الكل');
              setSelectedBrand('الكل');
              setSelectedStatus('الكل');
              setOnlyInStock(true);
              setSortBy('default');
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5 text-slate-500" />
            <span>تحديث</span>
          </button>

          {/* فلتر إخفاء الصفر (المتوفر فقط) */}
          <button
            type="button"
            onClick={() => setOnlyInStock(!onlyInStock)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-black transition cursor-pointer ${
              onlyInStock
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CheckCircle2 className={`w-3.5 h-3.5 ${onlyInStock ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>المتوفر بالمخازن فقط (مخزون &gt; 0)</span>
          </button>

          {/* كل الأقسام (Item group) */}
          <div className="relative">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              aria-label="كل الأقسام"
              className="appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2 pr-3 pl-8 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="الكل">كل الأقسام (Item group)</option>
              {departmentsList.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* كل الماركات (Family Name) */}
          <div className="relative">
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              aria-label="كل الماركات"
              className="appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2 pr-3 pl-8 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="الكل">كل الماركات (Family Name)</option>
              {brandsList.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* كل الحالات */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              aria-label="كل الحالات"
              className="appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2 pr-3 pl-8 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="الكل">كل الحالات</option>
              <option value="متوفر">متوفر بفرعك</option>
              <option value="محدود">متوفر بأكتوبر فقط</option>
              <option value="نفد جزئياً">غير متوفر (0)</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* الترتيب حسب */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="الترتيب حسب"
              className="appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2 pr-3 pl-8 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="default">الترتيب الافتراضي</option>
              <option value="branch_stock_desc">الأعلى مخزوناً بفرعك</option>
              <option value="october_stock_desc">الأعلى بمخزن أكتوبر</option>
              <option value="price_asc">السعر: من الأقل للأعلى</option>
              <option value="price_desc">السعر: من الأعلى للأقل</option>
              <option value="name_asc">الاسم أبجدياً</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* View Cart Button */}
        {cart.length > 0 && onOpenCart && (
          <button
            type="button"
            onClick={onOpenCart}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black shadow-md shadow-blue-500/20 transition active:scale-95 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>معاينة الفاتورة ({cart.length})</span>
          </button>
        )}
      </div>

      {/* PDF Export Progress Modal */}
      {isExportingPDF && pdfProgress && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <FileText className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">جاري إنشاء ملف الكتالوج PDF</h3>
              <p className="text-xs text-slate-500 font-bold mt-1">
                {pdfProgress.phase === 'images'
                  ? `تحميل ومعالجة صور الأصناف (${pdfProgress.current} من ${pdfProgress.total})`
                  : `بناء صفحات الـ PDF والخطوط العربية (${pdfProgress.current} من ${pdfProgress.total})`}
              </p>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className="bg-rose-600 h-full rounded-full transition-all duration-200"
                style={{ width: `${pdfProgress.percent}%` }}
              />
            </div>
            <div className="text-xs font-black text-slate-700 font-mono">{pdfProgress.percent}%</div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {addedItemToast && (
        <div className="fixed bottom-6 left-6 z-50 bg-[#0f1b2d] text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold">
            <Check className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-emerald-400 font-bold">تمت الإضافة إلى الفاتورة</div>
            <div className="text-sm font-black truncate max-w-xs">{addedItemToast.name}</div>
            <div className="text-[11px] text-slate-300">{addedItemToast.count}</div>
          </div>
        </div>
      )}

      {stockErrorToast && (
        <div className="fixed top-20 left-6 z-50 max-w-sm bg-rose-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="text-xs font-bold leading-relaxed">{stockErrorToast}</span>
          </div>
          <button type="button" onClick={() => setStockErrorToast(null)} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4. Product Cards Grid (Matching exact columns from user sheet) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {paginatedProducts.map((p, idx) => {
          const branchStock = getProductBranchStock(p);
          const octoberStock = p.mainWarehouseActual || 0;
          const isFav = Boolean(favorites[p.id]);
          const currentQty = cardQuantities[p.id] || 1;
          const isElectrical = isProductElectrical(p);

          // Status Badge
          let statusBadge = (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>متوفر</span>
            </span>
          );

          if (branchStock <= 0 && octoberStock > 0) {
            statusBadge = (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 shadow-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>محدود</span>
              </span>
            );
          } else if (branchStock <= 0 && octoberStock <= 0) {
            statusBadge = (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 shadow-xs">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>نفد جزئياً</span>
              </span>
            );
          }

          return (
            <div
              key={p.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition p-4 flex flex-col justify-between space-y-3 group"
            >
              {/* Card Top Row: Favorite + Sector Chip + Status Badge */}
              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleFavorite(p.id)}
                  aria-label="إضافة للمفضلة"
                  className={`w-8 h-8 rounded-full border flex items-center justify-center transition cursor-pointer ${
                    isFav
                      ? 'bg-rose-50 border-rose-200 text-rose-600'
                      : 'border-slate-200 text-slate-400 hover:text-slate-600 bg-white'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-600' : ''}`} />
                </button>

                {/* Sector Chip (منزلي / كهرباء) */}
                {isElectrical ? (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black">
                    ⚡ كهرباء
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-black">
                    🏠 منزلي
                  </span>
                )}

                {statusBadge}
              </div>

              {/* Product Image */}
              <div
                className="w-full aspect-square rounded-xl bg-slate-50/50 flex items-center justify-center p-3 overflow-hidden cursor-pointer group-hover:scale-[1.02] transition-transform"
                onClick={() => {
                  const img = getProductImageUrl(p, cloudinaryConfig);
                  if (img && !img.startsWith('data:image/svg+xml')) {
                    setLightboxImage({ src: img, alt: p.name });
                  }
                }}
              >
                <ProductImage
                  product={p}
                  cloudinaryConfig={cloudinaryConfig}
                  targetSize={280}
                  sizeVariant="card"
                  priority={idx < 4}
                  containerClassName="w-full h-full flex items-center justify-center"
                  className="max-h-full max-w-full object-contain"
                />
              </div>

              {/* Product Title & Department */}
              <div className="text-center space-y-1">
                <div className="text-[10px] text-slate-400 font-bold truncate">
                  {p.department || p.itemGroup || 'عام'} {p.familyName ? `• ${p.familyName}` : ''}
                </div>
                <h3
                  onClick={() => setSelectedProductForModal(p)}
                  className="font-black text-slate-900 text-sm leading-snug line-clamp-2 min-h-[38px] hover:text-blue-600 cursor-pointer transition"
                  title={p.name}
                >
                  {p.name}
                </h3>
                <div className="text-[11px] text-slate-500 font-bold flex items-center justify-center gap-2">
                  {p.cartonPrice > 0 ? (
                    <span className="text-slate-900 font-black text-xs">
                      {formatCurrency(p.cartonPrice)} ج.م <span className="text-[10px] text-slate-400 font-normal">/ كرتونة</span>
                    </span>
                  ) : (
                    '—'
                  )}
                  {p.cartonQuantity && p.cartonQuantity > 1 ? (
                    <span className="text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded text-[10px]">
                      {p.cartonQuantity} ق/ك
                    </span>
                  ) : null}
                  {p.size && (
                    <span className="text-slate-400 text-[10px]">({p.size})</span>
                  )}
                </div>
              </div>

              {/* Codes Row: كود المنتج (Item number) + الكود الموحد */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-1.5">
                  <span className="text-[10px] text-slate-400 block font-bold">كود المنتج</span>
                  <span className="font-mono font-bold text-slate-800 text-xs truncate block" title={p.code}>
                    {p.code || 'PRD—'}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-1.5">
                  <span className="text-[10px] text-slate-400 block font-bold">الكود الموحد</span>
                  <span className="font-mono font-bold text-slate-800 text-xs truncate block" title={p.unifiedCode}>
                    {p.unifiedCode ? (p.unifiedCode.startsWith('#') ? p.unifiedCode : `#${p.unifiedCode}`) : '—'}
                  </span>
                </div>
              </div>

              {/* Stock Row: مخزون الفرع (Green) + مخزون أكتوبر (Blue) */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-2 text-emerald-800">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-emerald-700">
                    <Store className="w-3.5 h-3.5" />
                    <span>مخزون الفرع</span>
                  </div>
                  <div className="text-base font-black mt-0.5">{branchStock}</div>
                </div>
                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-2 text-blue-800">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-blue-700">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>مخزون أكتوبر</span>
                  </div>
                  <div className="text-base font-black mt-0.5">{octoberStock}</div>
                </div>
              </div>

              {/* Action Row: Quantity (- 1 +) & إضافة للفاتورة */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 overflow-hidden w-28 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQtyChange(p.id, -1)}
                      className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 text-sm font-bold transition cursor-pointer"
                    >
                      -
                    </button>
                    <span className="flex-1 text-center font-black text-slate-900 text-xs">
                      {currentQty}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQtyChange(p.id, 1)}
                      className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 text-sm font-bold transition cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddToCart(p)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>إضافة للفاتورة</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredProducts.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400 font-bold bg-white rounded-3xl border border-slate-100 p-8 space-y-3">
            <Package className="w-12 h-12 mx-auto text-slate-300" />
            <p className="text-sm">لم يتم العثور على أصناف مطابقة للبحث أو الفلاتر المحددة</p>
            {onlyInStock && (
              <button
                type="button"
                onClick={() => setOnlyInStock(false)}
                className="text-xs text-blue-600 hover:underline font-black block mx-auto cursor-pointer"
              >
                عرض كل الأصناف شاملة المنتهية (رصيد = 0)
              </button>
            )}
          </div>
        )}
      </div>

      {/* 5. Pagination Bar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col md:flex-row items-center justify-between gap-4 select-none">
        {/* Right: عدد النتائج في الصفحة */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <span>عدد النتائج في الصفحة:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            aria-label="عدد النتائج في الصفحة"
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-black text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value={12}>12</option>
            <option value={24}>24</option>
            <option value={48}>48</option>
            <option value={96}>96</option>
          </select>
        </div>

        {/* Center: Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              aria-label="الصفحة السابقة"
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p = i + 1;
              if (totalPages > 5) {
                if (currentPage > 3) {
                  p = currentPage - 2 + i;
                  if (p > totalPages) p = totalPages - (4 - i);
                }
              }
              if (p < 1 || p > totalPages) return null;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCurrentPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-black flex items-center justify-center transition cursor-pointer ${
                    currentPage === p
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
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              aria-label="الصفحة التالية"
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Left: عرض X – Y من إجمالي Z صنف */}
        <div className="text-xs font-bold text-slate-500">
          {filteredProducts.length === 0 ? (
            'لا توجد نتائج'
          ) : (
            <span>
              عرض {(currentPage - 1) * itemsPerPage + 1} –{' '}
              {Math.min(currentPage * itemsPerPage, filteredProducts.length)} من إجمالي{' '}
              <span className="font-black text-slate-800">
                {filteredProducts.length.toLocaleString('en-US')}
              </span>{' '}
              صنف
            </span>
          )}
        </div>
      </div>

      {/* 6. Product Details Modal */}
      {selectedProductForModal && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedProductForModal(null);
          }}
        >
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-black text-slate-900">{selectedProductForModal.name}</h2>
              <button
                type="button"
                onClick={() => setSelectedProductForModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 block font-bold">كود المنتج (Item number)</span>
                <span className="font-mono font-bold text-slate-800">{selectedProductForModal.code}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 block font-bold">الكود الموحد</span>
                <span className="font-mono font-bold text-slate-800">
                  {selectedProductForModal.unifiedCode || '—'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 block font-bold">القسم (Item group)</span>
                <span className="font-bold text-slate-800">
                  {selectedProductForModal.department || selectedProductForModal.category || 'عام'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 block font-bold">العائلة (Family Name)</span>
                <span className="font-bold text-slate-800">
                  {selectedProductForModal.familyName || selectedProductForModal.classification || '—'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 block font-bold">القطاع</span>
                <span className="font-black text-blue-700">
                  {isProductElectrical(selectedProductForModal) ? '⚡ قطاع الكهرباء' : '🏠 القطاع المنزلي'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 block font-bold">سعر الكرتونة</span>
                <span className="font-black text-blue-600 text-sm">
                  {formatCurrency(selectedProductForModal.cartonPrice)} ج.م
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                handleAddToCart(selectedProductForModal);
                setSelectedProductForModal(null);
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs shadow-md transition cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>إضافة الصنف إلى الفاتورة</span>
            </button>
          </div>
        </div>
      )}

      {/* 7. Lightbox Zoom */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxImage(null);
          }}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImage.src}
            alt={lightboxImage.alt}
            className="max-w-[85vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain bg-white p-2"
          />
        </div>
      )}
    </div>
  );
};
