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
import { sanitizeStoredImageUrl } from '../context/appContextHelpers';
import { useTheme } from '../context/themeContext';
import { ProductImage } from './ProductImage';
import {
  getProductImageUrl,
  getCandidateImageUrls,
  optimizeImageUrl,
} from '../services/cloudinaryService';
import { formatCurrency } from '../services/invoiceService';
import { resolveDisplayPrice, stripPlaceholderText } from '../services/productPricing';
import { cacheProductImages, getCachedImagesStats } from '../services/imageCacheService';
import { parseExcelProducts, fetchAndParseGoogleSheet } from '../services/excelService';
import {
  buildClientCatalogPDF,
  type ClientCatalogProduct,
  type CatalogExportProgress,
} from '../services/pdfService';
import { Customer, Product } from '../types';
import { getBranchStockForProduct } from '../services/arabicMatchingService';
export const COMPANY_WAREHOUSES = [
  { key: 'مخزون اكتوبر', label: 'أكتوبر (المركزي)', shortLabel: 'أكتوبر', isCentral: true },
  { key: 'القاهرة', label: 'القاهرة', shortLabel: 'القاهرة', isCentral: false },
  { key: 'البحيرة', label: 'البحيرة', shortLabel: 'البحيرة', isCentral: false },
  { key: 'الفيوم', label: 'الفيوم', shortLabel: 'الفيوم', isCentral: false },
  { key: 'المنيا', label: 'المنيا', shortLabel: 'المنيا', isCentral: false },
  { key: 'ديمشلت', label: 'ديمشلت', shortLabel: 'ديمشلت', isCentral: false },
  { key: 'منوف', label: 'منوف', shortLabel: 'منوف', isCentral: false },
  { key: 'منيا القمح', label: 'منيا القمح', shortLabel: 'م.القمح', isCentral: false },
] as const;

interface ProductCatalogProps {
  onOpenCart?: () => void;
  selectedCustomer?: Customer | null;
  onClearSelectedCustomer?: () => void;
  onNavigateToInvoices?: (invoice?: any) => void;
  /** تنقل بين تابات التطبيق من كروت المؤشرات العلوية (مرتجعات / تحصيلات) */
  onNavigateToTab?: (tab: string) => void;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({
  onOpenCart,
  selectedCustomer,
  onClearSelectedCustomer,
  onNavigateToTab,
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
    visits,
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
  // عرض أرصدة كافة المخازن الـ 8 تفصيلياً (7 فروع + مخزن أكتوبر)
  const [showAllWarehouses, setShowAllWarehouses] = useState<boolean>(false);
  // لوحة "المزيد من الفلتر" — مطوية افتراضياً عشان الشريط يفضل زي التصميم
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
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

  // Show favorites only toggle
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);

  // Reset page when favorites filter toggles
  useEffect(() => {
    setCurrentPage(1);
  }, [showFavoritesOnly]);

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

  // Remember catalog filters in localStorage per user
  const CATALOG_FILTERS_KEY = `tantawy_catalog_filters_${currentUser?.id || 'guest'}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CATALOG_FILTERS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.searchTerm !== undefined) setSearchTerm(parsed.searchTerm);
        if (parsed.selectedDept !== undefined) setSelectedDept(parsed.selectedDept);
        if (parsed.selectedBrand !== undefined) setSelectedBrand(parsed.selectedBrand);
        if (parsed.selectedStatus !== undefined) setSelectedStatus(parsed.selectedStatus);
        if (parsed.onlyInStock !== undefined) setOnlyInStock(parsed.onlyInStock);
        if (parsed.sortBy !== undefined) setSortBy(parsed.sortBy);
        if (parsed.activeSectorFilter !== undefined) setActiveSectorFilter(parsed.activeSectorFilter);
      }
    } catch {}
  }, [CATALOG_FILTERS_KEY, currentUser?.id]);

  const saveCatalogFilters = useCallback(() => {
    try {
      localStorage.setItem(CATALOG_FILTERS_KEY, JSON.stringify({
        searchTerm,
        selectedDept,
        selectedBrand,
        selectedStatus,
        onlyInStock,
        sortBy,
        activeSectorFilter,
      }));
    } catch {}
  }, [searchTerm, selectedDept, selectedBrand, selectedStatus, onlyInStock, sortBy, activeSectorFilter, CATALOG_FILTERS_KEY]);

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

  // Save filters whenever they change
  useEffect(() => {
    saveCatalogFilters();
  }, [searchTerm, selectedDept, selectedBrand, selectedStatus, onlyInStock, sortBy, activeSectorFilter, saveCatalogFilters]);

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

  const getWarehouseStock = useCallback((p: Product, warehouseKey: string): number => {
    if (warehouseKey === 'مخزون اكتوبر' || warehouseKey.includes('اكتوبر') || warehouseKey.includes('أكتوبر')) {
      return p.mainWarehouseActual || (p.branchStocks?.['مخزون اكتوبر'] ?? p.branchStocks?.['الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)'] ?? 0);
    }
    if (p.branchStocks) {
      if (p.branchStocks[warehouseKey] !== undefined) return p.branchStocks[warehouseKey];
      if (p.branchStocks[`فرع ${warehouseKey}`] !== undefined) return p.branchStocks[`فرع ${warehouseKey}`];
    }
    return getBranchStockForProduct(p, `فرع ${warehouseKey}`);
  }, []);

  // Dynamic Departments -> عمود "الصنف" (Item group / Department)
  const departmentsList = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const raw = p.itemGroup || p.department || p.category || '';
      const d = stripPlaceholderText(raw).trim();
      if (d && d !== 'عام' && !d.toLowerCase().includes('blank')) set.add(d);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [products]);

  // Dynamic Brands / Categories -> عمود "الصنف بالعائلة" (Family Name / Classification)
  const brandsList = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const raw = p.familyName || p.classification || '';
      const b = stripPlaceholderText(raw).trim();
      if (b && b !== 'عام' && b !== 'فئة A' && !b.toLowerCase().includes('blank')) set.add(b);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [products]);

  // Check if a product belongs to electrical sector (القطاع الكهربائي)
  const isProductElectrical = useCallback((p: Product) => {
    if (p.sector === 'electrical') return true;
    if (p.sector === 'both' || p.sector === 'all') return true;
    const checkStr = `${p.sector || ''} ${p.department || ''} ${p.category || ''} ${p.itemGroup || ''} ${p.familyName || ''} ${p.name || ''}`.toLowerCase();
    const hasElectricalKeywords =
      // Arabic keywords
      checkStr.includes('كهربا') ||
      checkStr.includes('لمبة') ||
      checkStr.includes('مفتاح') ||
      checkStr.includes('كابل') ||
      checkStr.includes('سلك') ||
      checkStr.includes('شاسيه') ||
      checkStr.includes('قاطع') ||
      checkStr.includes('فيشة') ||
      checkStr.includes('لقمة') ||
      checkStr.includes('دواية') ||
      checkStr.includes('وش') ||
      checkStr.includes('سبوت') ||
      checkStr.includes('كشاف') ||
      // English keywords
      checkStr.includes('electrical') ||
      checkStr.includes('electric') ||
      checkStr.includes('cable') ||
      checkStr.includes('wire') ||
      checkStr.includes('switch') ||
      checkStr.includes('bulb') ||
      checkStr.includes('lamp') ||
      checkStr.includes('socket') ||
      checkStr.includes('plug') ||
      checkStr.includes('breaker') ||
      checkStr.includes('fuse');

    if (hasElectricalKeywords) return true;
    if (p.sector === 'home') return false;
    return false;
  }, []);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    let result = getVisibleProducts().filter((p) => {
      // 1. Sector filter: home vs electrical — عندما يختار المستخدم 'all' تعرض جميع القطاعات (منزلي وكهرباء)
      if (activeSectorFilter !== 'all') {
        const isElec = isProductElectrical(p);
        if (activeSectorFilter === 'electrical' && !isElec) return false;
        if (activeSectorFilter === 'home' && isElec && p.sector !== 'both' && p.sector !== 'all') return false;
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

      // 4. Department / الصنف filter
      if (selectedDept !== 'الكل') {
        const rawDept = p.itemGroup || p.department || p.category || '';
        const pDept = stripPlaceholderText(rawDept).trim();
        if (pDept !== selectedDept) return false;
      }

      // 5. Brand / الصنف بالعائلة filter
      if (selectedBrand !== 'الكل') {
        const rawBrand = p.familyName || p.classification || '';
        const pBrand = stripPlaceholderText(rawBrand).trim();
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

  // احسب عدد تكرار كل كود أساسي في القائمة المعروضة (لإظهار شارة "مكرر X مرة" عند البحث)
  const codeRepeatCount = useMemo(() => {
    const map = new Map<string, number>();
    filteredProducts.forEach((p) => {
      const c = (p.code || '').trim().toLowerCase();
      if (c) map.set(c, (map.get(c) || 0) + 1);
    });
    return map;
  }, [filteredProducts]);

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

  // عدّادات تشغيلية للكروت العلوية: مرتجعات تحتاج مراجعة + عمليات التحصيل
  const opsStats = useMemo(() => {
    let returnsPending = 0;
    let collectionsCount = 0;

    (visits || []).forEach((v) => {
      const hasReturn = Boolean(v.isReturn) || Number(v.returnValue || 0) > 0;
      const returnClosed = v.returnStatus === 'مرفوض' || v.returnStatus === 'تم الاستلام بالمخزن';
      if (hasReturn && !returnClosed) returnsPending += 1;
      if (Number(v.collectedAmount || 0) > 0) collectionsCount += 1;
    });

    return { returnsPending, collectionsCount };
  }, [visits]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = useMemo(() => {
    let products = filteredProducts;
    if (showFavoritesOnly) {
      products = products.filter((p) => Boolean(favorites[p.id]));
    }
    const start = (currentPage - 1) * itemsPerPage;
    return products.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage, showFavoritesOnly, favorites]);

  // سعر الصنف المفتوح في المودال — نفس القاعدة المستخدمة في الكارت.
  const modalPricing = selectedProductForModal
    ? resolveDisplayPrice({
        piecePrice: selectedProductForModal.piecePrice ?? selectedProductForModal.salesPrice,
        cartonPrice: selectedProductForModal.cartonPrice,
        factor: selectedProductForModal.cartonQuantity ?? selectedProductForModal.factor,
      })
    : null;

  // Add item to cart with quantity (ذكي: لو الشدة = 1 يضاف كقطع، ولو أكبر يضاف ككرتونة)
  const handleAddToCart = (product: Product) => {
    const factor = product.cartonQuantity ?? product.factor ?? 1;
    const isSingle = factor <= 1;
    const type = isSingle ? 'piece' : (cardOrderTypes[product.id] || 'carton');
    const qty = cardQuantities[product.id] || 1;

    const branchStock = getProductBranchStock(product);
    const octoberStock = product.mainWarehouseActual || 0;
    const totalAvail = branchStock + octoberStock;

    if (totalAvail <= 0) {
      setStockErrorToast(`الصنف (${stripPlaceholderText(product.name)}) غير متوفر حالياً في أي مخزن!`);
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
      name: stripPlaceholderText(product.name),
      count: isSingle ? `${qty} قطعة` : `${qty} ${type === 'carton' ? 'كرتونة' : 'قطعة'}`,
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

  // عدد الفلاتر المتقدمة المفعّلة — بيظهر كشعار على زر "المزيد من الفلتر"
  const activeAdvancedCount =
    (onlyInStock ? 0 : 1) + (isAdminOrDev && activeSectorFilter !== 'all' ? 1 : 0);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedDept('الكل');
    setSelectedBrand('الكل');
    setSelectedStatus('الكل');
    setOnlyInStock(true);
    setSortBy('default');
    setActiveSectorFilter('all');
    saveCatalogFilters();
  };

  return (
    <div className="tantawy-screen space-y-5 pb-16" dir="rtl">
      {/* 1. Hero Banner & Search */}
      <div className="catalog-hero">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 sm:p-5">
          {/* Right side: Title */}
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur border border-white/25 text-white flex items-center justify-center shadow-lg shrink-0">
              <ShoppingCart className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-[26px] font-black text-white tracking-tight">كتالوج الأصناف</h1>
              <p className="text-[11px] sm:text-xs text-white/75 font-bold mt-0.5">
                اختر المنتجات بسهولة وأضفها إلى فاتورتك
              </p>
            </div>
          </div>

          {/* Left side: Prominent Search Bar with Smart Autocomplete Suggestions */}
          <div className="relative w-full lg:max-w-xl z-20" ref={searchWrapperRef}>
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
              placeholder="ابحث باسم المنتج أو كود المنتج أو الكود الموحد ..."
              className="w-full pl-10 pr-11 py-3 bg-white border border-white/60 rounded-2xl text-xs sm:text-sm font-bold text-secondary placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/70 shadow-lg transition"
            />
            <Search className="w-5 h-5 text-light absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setShowSearchSuggestions(false);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-light hover:text-muted p-1"
                title="مسح البحث"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Smart Suggestions Dropdown - يظهر فور كتابة أي حرف أو رقم */}
          {showSearchSuggestions && searchTerm.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-2xl z-[100] overflow-hidden divide-y divide-border-primary/30 max-h-96 overflow-y-auto">
              <div className="px-3.5 py-2 bg-slate-50 flex items-center justify-between text-[11px] font-bold text-light">
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
                          <span className="text-xs font-black text-primary group-hover:text-blue-700 transition truncate">
                            {prod.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
                          <span className="font-mono font-bold bg-slate-100 text-secondary px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                            كود: {prod.code}
                          </span>
                          {prod.unifiedCode && (
                            <span className="font-mono font-black bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 text-[10px]">
                              #{prod.unifiedCode.replace('#', '')}
                            </span>
                          )}
                          <span className="text-light text-[10px]">
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
                <div className="p-4 text-center text-xs text-light font-bold">
                  لا توجد نتائج مطابقة لـ &quot;{searchTerm}&quot;
                </div>
              )}
            </div>
          )}
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
                المديونية الحالية: {formatCurrency(selectedCustomer.balance || 0)}
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

      {/* 2. Focused Inventory Stock KPI Cards (3 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {/* مخزون فرع المندوب */}
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-light font-black leading-tight">مخزون فرع المندوب</p>
              <p className="text-2xl font-black text-blue-700 tracking-tight leading-tight">
                {stats.branchCartons.toLocaleString('en-US')}
              </p>
              <p className="text-[10px] text-light font-bold leading-tight">رصيد متاح بالفرع ({currentActiveBranch})</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSortBy('branch_stock_desc')}
            title="ترتيب حسب مخزون الفرع"
            aria-label="ترتيب حسب مخزون الفرع"
            className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center shrink-0 transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* مخزون أكتوبر المركزي */}
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-light font-black leading-tight">المخزن الرئيسي (أكتوبر)</p>
              <p className="text-2xl font-black text-emerald-600 tracking-tight leading-tight">
                {stats.octoberCartons.toLocaleString('en-US')}
              </p>
              <p className="text-[10px] text-light font-bold leading-tight">رصيد مركزي متاح للسحب</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSortBy('october_stock_desc')}
            title="ترتيب حسب مخزون أكتوبر"
            aria-label="ترتيب حسب مخزون أكتوبر"
            className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center shrink-0 transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* الأصناف المتوفرة للطلب */}
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-4 flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-light font-black leading-tight">الأصناف المتوفرة للطلب</p>
              <p className="text-2xl font-black text-indigo-600 tracking-tight leading-tight">
                {stats.availableItemsCount.toLocaleString('en-US')}
              </p>
              <p className="text-[10px] text-light font-bold leading-tight">أصناف بمخزون &gt; 0 في الفرع أو أكتوبر</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 select-none space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* القطاعات (منزلي / كهرباء / كل القطاعات) - واضحة ومباشرة بنقرة واحدة */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setActiveSectorFilter('all');
                saveCatalogFilters();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                activeSectorFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🌐 كل القطاعات
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSectorFilter('home');
                saveCatalogFilters();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                activeSectorFilter === 'home'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏠 منزلي
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSectorFilter('electrical');
                saveCatalogFilters();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                activeSectorFilter === 'electrical'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ⚡ كهرباء
            </button>
          </div>

          {/* زر التبديل لعرض تفاصيل الـ 8 مخازن (7 فروع + مخزن أكتوبر المركزي) */}
          <button
            type="button"
            onClick={() => setShowAllWarehouses((v) => !v)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              showAllWarehouses
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title="عرض كشف أرصدة المخازن الـ 8 لكل صنف"
          >
            <Building className="w-4 h-4" />
            <span>{showAllWarehouses ? 'عرض مختصر (فرعك + أكتوبر)' : 'عرض أرصدة الـ 8 مخازن'}</span>
          </button>

          {/* المزيد من الفلتر (يفتح لوحة الفلاتر المتقدمة) */}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((v) => !v)}
            aria-expanded={showAdvancedFilters}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black shadow-sm transition cursor-pointer ${
              showAdvancedFilters
                ? 'bg-[var(--app-accent)] text-white'
                : 'bg-[var(--app-navy)] text-white hover:opacity-90'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>المزيد من الفلتر</span>
            {activeAdvancedCount > 0 && (
              <span className="bg-white/25 text-white rounded-full px-1.5 py-0.5 text-[10px] font-black">
                {activeAdvancedCount}
              </span>
            )}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* الترتيب حسب */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="الترتيب حسب"
              className="appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2 pr-3 pl-8 text-xs font-bold text-secondary focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="default">الترتيب حسب</option>
              <option value="branch_stock_desc">الأعلى مخزوناً بفرعك</option>
              <option value="october_stock_desc">الأعلى بمخزن أكتوبر</option>
              <option value="price_asc">السعر: من الأقل للأعلى</option>
              <option value="price_desc">السعر: من الأعلى للأقل</option>
              <option value="name_asc">الاسم أبجدياً</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-light absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* كل الحالات */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              aria-label="كل الحالات"
              className="appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2 pr-3 pl-8 text-xs font-bold text-secondary focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="الكل">كل الحالات</option>
              <option value="متوفر">متوفر بفرعك</option>
              <option value="محدود">متوفر بأكتوبر فقط</option>
              <option value="نفد جزئياً">غير متوفر (0)</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-light absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* الصنف بالعائلة (من عمود الصنف بالعائله / Family Name) */}
          <div className="relative">
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              aria-label="الصنف بالعائلة"
              className="appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2 pr-3 pl-8 text-xs font-bold text-secondary focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[180px]"
            >
              <option value="الكل">الصنف بالعائلة (الكل)</option>
              {brandsList.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-light absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* الصنف (من عمود اسم الصنف / Item group) */}
          <div className="relative">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              aria-label="الصنف"
              className="appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2 pr-3 pl-8 text-xs font-bold text-secondary focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[180px]"
            >
              <option value="الكل">الصنف (الكل)</option>
              {departmentsList.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-light absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="hidden md:block flex-1" />

          {/* معاينة الفاتورة */}
          {cart.length > 0 && onOpenCart && (
            <button
              type="button"
              onClick={onOpenCart}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black shadow-sm shadow-blue-500/20 transition active:scale-95 cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>معاينة الفاتورة ({cart.length})</span>
            </button>
          )}

          {/* تحديث / إعادة ضبط الفلاتر */}
          <button
            type="button"
            onClick={handleResetFilters}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-secondary transition cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5 text-light" />
            <span>تحديث</span>
          </button>
        </div>

        {/* لوحة الفلاتر المتقدمة */}
        {showAdvancedFilters && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
            {/* المتوفر بالمخازن فقط */}
            <button
              type="button"
              onClick={() => setOnlyInStock(!onlyInStock)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-black transition cursor-pointer ${
                onlyInStock
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                  : 'bg-white border-slate-200 text-muted hover:bg-slate-50'
              }`}
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${onlyInStock ? 'text-emerald-600' : 'text-light'}`} />
              <span>المتوفر بالمخازن فقط (مخزون &gt; 0)</span>
            </button>

            {/* أزرار القطاع: متاحة لكافة المستخدمين لتصفح منزلي أو كهرباء أو كل الأصناف */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveSectorFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                  activeSectorFilter === 'all' ? 'bg-blue-600 text-white shadow-xs' : 'text-muted hover:text-primary'
                }`}
                title="عرض جميع أصناف المنزلي والكهرباء معاً"
              >
                🌐 كل القطاعات ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSectorFilter('home')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                  activeSectorFilter === 'home' ? 'bg-blue-600 text-white shadow-xs' : 'text-muted hover:text-primary'
                }`}
              >
                🏠 منزلي {currentUser?.sector === 'home' ? '⭐' : ''}
              </button>
              <button
                type="button"
                onClick={() => setActiveSectorFilter('electrical')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                  activeSectorFilter === 'electrical' ? 'bg-blue-600 text-white shadow-xs' : 'text-muted hover:text-primary'
                }`}
              >
                ⚡ كهرباء {currentUser?.sector === 'electrical' ? '⭐' : ''}
              </button>
            </div>

            {/* تصدير PDF */}
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              className="flex items-center gap-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-sm transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isExportingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span>{isExportingPDF ? 'جاري تجهيز الكتالوج...' : 'تصدير الصور كـ PDF 📄'}</span>
            </button>

            {/* فرعك */}
            <div className="flex items-center gap-1 text-xs text-light font-bold bg-white px-3 py-2 rounded-xl border border-slate-200">
              <span>فرعك:</span>
              <span className="font-black text-secondary">{currentActiveBranch}</span>
            </div>

            {/* الأصناف المتوفرة للطلب */}
            <div className="flex items-center gap-1 text-xs text-light font-bold bg-white px-3 py-2 rounded-xl border border-slate-200">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>أصناف متاحة للطلب:</span>
              <span className="font-black text-indigo-600">{stats.availableItemsCount.toLocaleString('en-US')}</span>
            </div>
          </div>
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
              <h3 className="font-black text-primary text-base">جاري إنشاء ملف الكتالوج PDF</h3>
              <p className="text-xs text-light font-bold mt-1">
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
            <div className="text-xs font-black text-secondary font-mono">{pdfProgress.percent}%</div>
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

      {/* Favorites Bar */}
      <div className="hidden lg:flex items-center justify-between gap-3 px-4 py-2 mb-3 bg-surface border border-border-primary rounded-2xl">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
          <span className="font-black text-primary text-sm">
            {Object.keys(favorites).length} صنف في المفضلة
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFavoritesOnly((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              showFavoritesOnly
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-white text-muted border border-slate-200 hover:bg-slate-50'
            }`}
          >
            عرض المفضلة فقط
          </button>
          {Object.keys(favorites).length > 0 && (
            <button
              type="button"
              onClick={() => {
                setFavorites({});
                try {
                  localStorage.removeItem('tantawy_fav_products');
                } catch {}
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition bg-white text-muted border border-slate-200 hover:bg-slate-50"
            >
              مسح الكل
            </button>
          )}
        </div>
      </div>

      {/* ERP Table View (Desktop\/Laptop) */}
      <div className="catalog-erp-wrap hidden lg:block overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-3xl shadow-lg bg-white dark:bg-[#0f172a] animate-in fade-in min-w-[1200px]">
        <table className="catalog-erp-table w-full text-left border-collapse text-sm">
          <colgroup>
            <col style={{ width: 50 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 50 }} />
            {showAllWarehouses ? COMPANY_WAREHOUSES.map(() => <col style={{ width: 60 }} />) : [<col style={{ width: 80 }} />, <col style={{ width: 80 }} />]}
            <col style={{ width: 40 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead className="bg-[#0f2b38] text-white font-bold border-b border-[#1b4676] uppercase tracking-wider text-xs select-none sticky top-0 z-10">
            <tr>
              <th className="p-2 text-right text-white font-bold">#</th>
              <th className="p-2 text-center text-white font-bold">الصورة</th>
              <th className="p-2 text-right text-white font-bold">كود المنتج</th>
              <th className="p-2 text-right text-white font-bold">الكود الموحد</th>
              <th className="p-2 text-right text-white font-bold">اسم المنتج</th>
              <th className="p-2 text-center text-white font-bold">القطاع</th>
              <th className="p-2 text-right text-white font-bold">سعر القطعة</th>
              <th className="p-2 text-right text-white font-bold">سعر الكرتونة</th>
              <th className="p-2 text-center text-white font-bold">الشدة</th>
              {showAllWarehouses ? (
                <>
                  {COMPANY_WAREHOUSES.map((wh) => (
                    <th
                      key={wh.key}
                      className={`p-2 text-center text-white font-bold text-[10px] ${
                        wh.isCentral ? 'bg-[#006d62]' : ''
                      }`}
                      title={wh.label}
                    >
                      {wh.shortLabel}
                    </th>
                  ))}
                </>
              ) : (
                <>
                  <th className="p-2 text-center text-white font-bold">مخزون الفرع</th>
                  <th className="p-2 text-center text-white font-bold bg-[#006d62]">مخزون أكتوبر</th>
                </>
              )}
              <th className="p-2 text-center text-white font-bold">المفضلة</th>
              <th className="p-2 text-center text-white font-bold">إضافة للسلة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/50 dark:divide-slate-700/50">
            {paginatedProducts.map((p, rowIdx) => {
              const branchStock = getProductBranchStock(p);
              const octoberStock = p.mainWarehouseActual || 0;
              const isElec = isProductElectrical(p);
              const priceInfo = resolveDisplayPrice({
                piecePrice: p.piecePrice ?? p.salesPrice,
                cartonPrice: p.cartonPrice,
                factor: p.cartonQuantity ?? p.factor,
              });
              const displayName = stripPlaceholderText(p.name);
              const globalIdx = (currentPage - 1) * itemsPerPage + rowIdx + 1;

              return (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition group bg-white dark:bg-[#0f172a]">
                  <td className="p-2 text-right font-black text-slate-600 dark:text-slate-400 text-xs">{globalIdx}</td>
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        const img = getProductImageUrl(p, cloudinaryConfig);
                        if (img && !img.startsWith('data:image/svg+xml')) {
                          setLightboxImage({ src: img, alt: p.name });
                        }
                      }}
                      className="flex items-center justify-center p-1"
                    >
                      <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center cursor-pointer hover:shadow-[0_0_15px_rgba(0,148,136,0.2)] transition-all duration-200 shadow-sm">
                        {sanitizeStoredImageUrl(p.imageUrl) ? (
                          <img
                            src={sanitizeStoredImageUrl(p.imageUrl)}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 text-[10px] font-bold">
                            📦
                          </div>
                        )}
                      </div>
                    </button>
                  </td>
                  <td className="p-2 text-right font-black text-slate-900 dark:text-slate-100 text-xs font-mono truncate">{p.code || '—'}</td>
                  <td className="p-2 text-right text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    {p.unifiedCode ? (p.unifiedCode.startsWith('#') ? p.unifiedCode : `#${p.unifiedCode}`) : '—'}
                  </td>
                  <td className="p-2 text-right font-black text-slate-900 dark:text-slate-100 truncate" title={displayName}>
                    {displayName || `صنف ${p.code}`}
                  </td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${
                      isElec ? 'bg-teal-100 text-teal-800 border border-teal-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {isElec ? '⚡ كهرباء' : '🏠 منزلي'}
                    </span>
                  </td>
                  <td className="p-2 text-right font-black text-slate-900 dark:text-slate-100">
                    {priceInfo.piecePrice > 0 ? (
                      <span className="font-black">{formatCurrency(priceInfo.piecePrice)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                    <span className="text-[10px] text-slate-400 block">/قطعة</span>
                  </td>
                  <td className="p-2 text-right font-black text-slate-900 dark:text-slate-100">
                    {priceInfo.factor > 1 && priceInfo.cartonPrice > 0 ? (
                      <span className="font-black">{formatCurrency(priceInfo.cartonPrice)}</span>
                    ) : (
                      <span className="text-slate-400 text-xs">فردي</span>
                    )}
                    <span className="text-[10px] text-slate-400 block">/كرتونة</span>
                  </td>
                  <td className="p-2 text-center font-mono">
                    {priceInfo.factor > 1 ? (
                      <span className="inline-block bg-teal-50 text-teal-800 border border-teal-200 text-[10px] px-1.5 py-0.5 rounded-md font-bold">
                        {priceInfo.factor} ق/ك
                      </span>
                    ) : (
                      <span className="inline-block bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded-md font-bold">
                        1
                      </span>
                    )}
                  </td>
                  {showAllWarehouses ? (
                    <>
                      {COMPANY_WAREHOUSES.map((wh) => {
                        const stock = getWarehouseStock(p, wh.key);
                        return (
                          <td key={wh.key} className={`p-2 text-center ${wh.isCentral ? 'bg-slate-50/50' : ''}`}>
                            <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-black ${
                              stock > 0
                                ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                : 'bg-slate-100 text-slate-400 border border-slate-200'
                            }`}>
                              {stock}
                            </span>
                          </td>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <td className="p-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-black ${
                          branchStock > 0 ? 'bg-teal-50 text-teal-800 border border-teal-200' : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}>
                          {branchStock}
                        </span>
                      </td>
                      <td className="p-2 text-center bg-slate-50/50">
                        <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-black ${
                          octoberStock > 0 ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}>
                          {octoberStock}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(p.id)}
                      aria-label={Boolean(favorites[p.id]) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center transition cursor-pointer shrink-0 ${
                        favorites[p.id]
                          ? 'bg-teal-50 border-teal-200 text-teal-600'
                          : 'border-slate-200 text-slate-600 hover:text-slate-900 bg-white'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${favorites[p.id] ? 'fill-teal-600' : ''}`} />
                    </button>
                  </td>
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleAddToCart(p)}
                      disabled={branchStock <= 0 && octoberStock <= 0}
                      className={`w-full py-2 px-2 rounded-xl text-[10px] font-black transition-all shadow-sm flex items-center justify-center gap-1 ${
                        branchStock <= 0 && octoberStock <= 0
                          ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                          : 'bg-[#0f2b38] hover:bg-[#006d62] text-white shadow-md shadow-[#0f2b38]/30 active:scale-95 cursor-pointer'
                      }`}
                    >
                      <ShoppingCart className="w-3 h-3 shrink-0" />
                      <span>إضافة</span>
                    </button>
                  </td>
                </tr>
              );
            })}
            {paginatedProducts.length === 0 && (
              <tr>
                <td colSpan={showAllWarehouses ? 18 : 12} className="p-8 text-center text-slate-500 font-bold">
                  <Package className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-slate-600">لم يتم العثور على أصناف مطابقة للبحث أو الفلاتر المحددة</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 4b. Product Cards Grid (Mobile) — نفس الأعمدة归类 في كروت */}
      <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {paginatedProducts.map((p, idx) => {
          const branchStock = getProductBranchStock(p);
          const octoberStock = p.mainWarehouseActual || 0;
          const isFav = Boolean(favorites[p.id]);
          const currentQty = cardQuantities[p.id] || 1;
          const isElectrical = isProductElectrical(p);
          // سعر واحد متسق: صنف شدة 1 = سعر قطعة، وغيره = سعر كرتونة (قطعة × شدة).
          const priceInfo = resolveDisplayPrice({
            piecePrice: p.piecePrice ?? p.salesPrice,
            cartonPrice: p.cartonPrice,
            factor: p.cartonQuantity ?? p.factor,
          });
          const displayName = stripPlaceholderText(p.name);

          // Status Badge
          let statusBadge = (
            <span className="px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>متوفر</span>
            </span>
          );

          if (branchStock <= 0 && octoberStock > 0) {
            statusBadge = (
              <span className="px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 shadow-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>محدود</span>
              </span>
            );
          } else if (branchStock <= 0 && octoberStock <= 0) {
            statusBadge = (
              <span className="px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 shadow-xs">
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
              {/* Card Top Row: Status Badge (يمين) + Sector Chip + Favorite (يسار) */}
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0">{statusBadge}</span>
                  {isElectrical ? (
                    <span className="hidden sm:inline-flex shrink-0 whitespace-nowrap px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-black">
                      ⚡ كهرباء
                    </span>
                  ) : (
                    <span className="hidden sm:inline-flex shrink-0 whitespace-nowrap px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black">
                      🏠 منزلي
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => toggleFavorite(p.id)}
                  aria-label="إضافة للمفضلة"
                  className={`w-8 h-8 rounded-full border flex items-center justify-center transition cursor-pointer shrink-0 ${
                    isFav
                      ? 'bg-rose-50 border-rose-200 text-rose-600'
                      : 'border-slate-200 text-slate-600 hover:text-muted bg-white'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-600' : ''}`} />
                </button>
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
                <div className="text-[10px] text-light font-bold leading-tight">
                  {stripPlaceholderText(p.department) || stripPlaceholderText(p.itemGroup) || 'عام'}
                  {stripPlaceholderText(p.familyName) ? ` • ${stripPlaceholderText(p.familyName)}` : ''}
                </div>
                <h3
                  onClick={() => setSelectedProductForModal(p)}
                  className="font-black text-primary text-sm leading-snug line-clamp-2 min-h-[38px] hover:text-blue-600 cursor-pointer transition"
                  title={displayName}
                >
                  {displayName || `صنف ${p.code}`}
                </h3>
                <div className="text-[11px] text-light font-bold flex items-center justify-center gap-2">
                  {priceInfo.displayPrice > 0 ? (
                    <span className="text-primary font-black text-xs">
                      {formatCurrency(priceInfo.displayPrice)}{' '}
                      <span className="text-[10px] text-light font-normal">/ {priceInfo.unitLabel}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                  {priceInfo.factor > 1 ? (
                    <span className="text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded text-[10px]">
                      {priceInfo.factor} ق/ك
                    </span>
                  ) : null}
                  {stripPlaceholderText(p.size) && (
                    <span className="text-light text-[10px]">({stripPlaceholderText(p.size)})</span>
                  )}
                </div>
              </div>

              {/* Codes Row: كود المنتج (Item number) + الكود الموحد */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-1.5">
                  <span className="text-[10px] text-light block font-bold">كود المنتج</span>
                  <span className="font-mono font-bold text-secondary text-xs truncate block" title={p.code}>
                    {p.code || 'PRD—'}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-1.5">
                  <span className="text-[10px] text-light block font-bold">الكود الموحد</span>
                  <span className="font-mono font-bold text-secondary text-xs truncate block" title={p.unifiedCode}>
                    {p.unifiedCode ? (p.unifiedCode.startsWith('#') ? p.unifiedCode : `#${p.unifiedCode}`) : '—'}
                  </span>
                </div>
              </div>

              {/* Stock Row: 8 Warehouses or Default 2 */}
              {showAllWarehouses ? (
                <div className="space-y-1 bg-slate-50 border border-slate-200/80 rounded-xl p-2">
                  <div className="text-[10px] font-black text-slate-500 mb-1 flex items-center justify-between">
                    <span>🏢 أرصدة الـ 8 مخازن:</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-center">
                    {COMPANY_WAREHOUSES.map((wh) => {
                      const stock = getWarehouseStock(p, wh.key);
                      return (
                        <div
                          key={wh.key}
                          className={`rounded-lg p-1 border text-[10px] ${
                            stock > 0
                              ? wh.isCentral
                                ? 'bg-blue-50 border-blue-200 text-blue-900 font-bold'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold'
                              : 'bg-white border-slate-100 text-slate-400'
                          }`}
                        >
                          <div className="text-[9px] truncate">{wh.shortLabel}</div>
                          <div className="font-mono font-black text-xs">{stock}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
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
              )}

              {/* Action Row: إضافة للفاتورة + عداد الكمية */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddToCart(p)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs whitespace-nowrap shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>إضافة للفاتورة</span>
                  </button>

                  <div className="flex items-center justify-between border border-slate-200 rounded-xl bg-slate-50 overflow-hidden w-full sm:w-28 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQtyChange(p.id, 1)}
                      className="w-9 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 text-sm font-bold transition cursor-pointer"
                      aria-label="زيادة الكمية"
                    >
                      +
                    </button>
                    <span className="flex-1 text-center font-black text-primary text-xs">
                      {currentQty}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQtyChange(p.id, -1)}
                      className="w-9 h-8 flex items-center justify-center text-muted hover:bg-slate-200 text-sm font-bold transition cursor-pointer"
                      aria-label="تقليل الكمية"
                    >
                      -
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredProducts.length === 0 && (
          <div className="col-span-full py-16 text-center text-light font-bold bg-white rounded-3xl border border-slate-100 p-8 space-y-3">
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
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 flex flex-col md:flex-row items-center justify-between gap-3 select-none">
        {/* Right: عرض X – Y من إجمالي Z صنف */}
        <div className="text-xs font-bold text-light">
          {filteredProducts.length === 0 ? (
            'لا توجد نتائج'
          ) : (
            <span>
              عرض {(currentPage - 1) * itemsPerPage + 1} –{' '}
              {Math.min(currentPage * itemsPerPage, filteredProducts.length)} من{' '}
              <span className="font-black text-secondary">{filteredProducts.length.toLocaleString('en-US')}</span>{' '}
              صنف
            </span>
          )}
        </div>

        {/* Center: أرقام الصفحات */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              aria-label="الصفحة السابقة"
              className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-muted flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pg = i + 1;
              if (totalPages > 5 && currentPage > 3) {
                pg = currentPage - 2 + i;
                if (pg > totalPages) pg = totalPages - (4 - i);
              }
              if (pg < 1 || pg > totalPages) return null;
              return (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setCurrentPage(pg)}
                  aria-label={`الصفحة ${pg}`}
                  aria-current={currentPage === pg ? 'page' : undefined}
                  className={`w-9 h-9 rounded-xl text-xs font-black flex items-center justify-center transition cursor-pointer ${
                    currentPage === pg
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-secondary hover:bg-slate-50'
                  }`}
                >
                  {pg}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              aria-label="الصفحة التالية"
              className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-muted flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Left: عدد النتائج في الصفحة */}
        <div className="flex items-center gap-2 text-xs font-bold text-muted">
          <span>عدد النتائج في الصفحة:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            aria-label="عدد النتائج في الصفحة"
            className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-black text-secondary focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value={12}>12</option>
            <option value={24}>24</option>
            <option value={48}>48</option>
            <option value={96}>96</option>
          </select>
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
              <h2 className="text-base font-black text-primary">
                {stripPlaceholderText(selectedProductForModal.name) || `صنف ${selectedProductForModal.code}`}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedProductForModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-light flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-light block font-bold">كود المنتج (Item number)</span>
                <span className="font-mono font-bold text-secondary">{selectedProductForModal.code}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-light block font-bold">الكود الموحد</span>
                <span className="font-mono font-bold text-secondary">
                  {selectedProductForModal.unifiedCode || '—'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-light block font-bold">القسم (Item group)</span>
                <span className="font-bold text-secondary">
                  {selectedProductForModal.department || selectedProductForModal.category || 'عام'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-light block font-bold">العائلة (Family Name)</span>
                <span className="font-bold text-secondary">
                  {selectedProductForModal.familyName || selectedProductForModal.classification || '—'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-light block font-bold">القطاع</span>
                <span className="font-black text-blue-700">
                  {isProductElectrical(selectedProductForModal) ? '⚡ قطاع الكهرباء' : '🏠 القطاع المنزلي'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-light block font-bold">
                  سعر {modalPricing?.unitLabel}
                </span>
                <span className="font-black text-blue-600 text-sm">
                  {formatCurrency(modalPricing?.displayPrice || 0)}
                </span>
                <span className="block text-[10px] text-light font-bold mt-1">
                  {modalPricing && !modalPricing.isSinglePiece
                    ? `القطعة: ${formatCurrency(modalPricing.piecePrice)} • الشدة: ${modalPricing.factor} ق/ك`
                    : 'يُباع بالقطعة (الشدة 1)'}
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
