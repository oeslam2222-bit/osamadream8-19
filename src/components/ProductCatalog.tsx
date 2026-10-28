import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  Building,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  Filter,
  Flame,
  Grid,
  LayoutGrid,
  Info,
  Layers,
  List,
  Package,
  Plus,
  Minus,
  Receipt,
  Search,
  Barcode,
  ShoppingCart,
  Sparkles,
  Tag,
  Warehouse,
  X,
  XCircle,
  Zap,
  DownloadCloud,
  Download,
  HardDrive,
  CheckCheck,
  Trash2,
  Upload,
  RefreshCw,
  Star,
  ShieldCheck,
  Truck,
  User,
  SlidersHorizontal,
  FileSpreadsheet,
  Link,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
  Clock,
  Maximize2
} from 'lucide-react';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/themeContext';
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
import { Customer, ItemStatus, Product, SalesPriority } from '../types';
import { DepartmentCategorySlicer } from './DepartmentCategorySlicer';
import { getDepartmentMeta } from '../data/departmentMeta';
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
  onNavigateToInvoices,
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
    dataSaverMode,
    toggleDataSaverMode,
    setIsInstallModalOpen
  } = useApp();

  const { isDark, toggleTheme } = useTheme();

  // Smart Search Suggestions & Right Flexible Panel States
  const [searchSuggestions, setSearchSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelType, setRightPanelType] = useState<'product' | 'cart' | 'customer' | null>(null);
  const [rightPanelData, setRightPanelData] = useState<Product | Customer | null>(null);

  // Lazy & Smart Cashier View States
  const [showAllExplicitly, setShowAllExplicitly] = useState(true);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);

  // Data Confidentiality Mode (سرية البيانات - إخفاء الأسعار الحساسة وهوامش الربح وأرصدة العملاء)
  const [isConfidentialMode, setIsConfidentialMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('catalog_confidential_mode') === 'true';
    } catch {
      return false;
    }
  });

  const toggleConfidentialMode = () => {
    setIsConfidentialMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('catalog_confidential_mode', String(next));
      } catch {}
      return next;
    });
  };

  // Auto-open cart drawer when customer is selected so user sees their financial details immediately
  useEffect(() => {
    if (selectedCustomer && typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsCartDrawerOpen(true);
    }
  }, [selectedCustomer]);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Debounce search input for smart suggestions (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  const [selectedOfficialDept, setSelectedOfficialDept] = useState<string>('الكل');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('الكل');
  const [selectedPriority, setSelectedPriority] = useState<string>('الكل');
  const [selectedStatus, setSelectedStatus] = useState<string>('الكل');
  const [stockAvailabilityFilter, setStockAvailabilityFilter] = useState<
    'all' | 'has_stock' | 'offers' | 'in_branch' | 'in_warehouse' | 'low_stock' | 'out_of_stock' | 'out_of_branch_only' | 'high_stock'
  >('has_stock');
  const [sortBy, setSortBy] = useState<
    'default' | 'branch_stock_desc' | 'branch_stock_asc' | 'october_stock_desc' | 'october_stock_asc' | 'total_stock_desc' | 'priority' | 'price_asc' | 'price_desc' | 'name_asc'
  >('default');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [gridDensity, setGridDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Role permissions: ONLY Developer and Admin can upload or wipe catalog data
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  // Modals & UI States
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
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
    sortBy
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
      setUploadError(err.message || 'حد�� خطأ أثناء قراءة ملف الإكسل');
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

  // Dynamic Arabic Item Groups list derived directly from products
  const dynamicItemGroups = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const g = (p.itemGroup || p.department || p.category || '').trim();
      if (g) set.add(g);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [products]);

  // Department / Item Group item count helper
  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = { 'الكل': products.length };
    dynamicItemGroups.forEach((dept) => {
      counts[dept] = 0;
    });

    products.forEach((p) => {
      const pGrp = (p.itemGroup || p.department || p.category || '').trim();
      if (pGrp && counts[pGrp] !== undefined) {
        counts[pGrp] = (counts[pGrp] || 0) + 1;
      }
    });

    return counts;
  }, [products, dynamicItemGroups]);

  // Extract unique subcategories / families (العائلات / الفئات التابعة للمجموعة ��لمختارة أو للكل)
  const subCategories = useMemo(() => {
    const set = new Set<string>();
    const filteredByDept = selectedOfficialDept === 'الكل'
      ? products
      : products.filter((p) => {
          const g = (p.itemGroup || p.department || p.category || '').trim().toLowerCase();
          return g === selectedOfficialDept.trim().toLowerCase();
        });

    filteredByDept.forEach((p) => {
      const fam = (p.familyName && p.familyName.trim()) ||
                  (p.classification && p.classification.trim() !== 'فئة A' ? p.classification.trim() : '') ||
                  (p.category && !dynamicItemGroups.includes(p.category) ? p.category.trim() : '');
      if (fam) {
        set.add(fam);
      }
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [products, selectedOfficialDept, dynamicItemGroups]);

  const visibleProducts = getVisibleProducts();

  // Smart suggestions derived from visible products matching search term (declared after searchTerm & visibleProducts)
  // Smart suggestions with fuzzy/closest match matching
  const smartSuggestions = useMemo(() => {
    const q = debouncedSearchTerm.trim().toLowerCase();
    if (!q || !showSuggestions) return [];
    const cleanQ = q.replace('#', '').trim();

    // Fuzzy match: check if letters of query appear in order in product name/code
    const fuzzyMatch = (text: string, query: string): boolean => {
      let qi = 0;
      for (let i = 0; i < text.length && qi < query.length; i++) {
        if (text[i].toLowerCase() === query[qi]) qi++;
      }
      return qi === query.length;
    };

    return visibleProducts.filter((p) => {
      const codeMatch = p.code.toLowerCase().includes(q) || p.code.toLowerCase().includes(cleanQ) || fuzzyMatch(p.code, q);
      const unifiedMatch = Boolean(p.unifiedCode && (p.unifiedCode.toLowerCase().includes(cleanQ) || p.unifiedCode.toLowerCase().includes(q) || fuzzyMatch(p.unifiedCode, q)));
      const nameMatch = p.name.toLowerCase().includes(q) || fuzzyMatch(p.name, q);
      const barcodeMatch = Boolean(p.barcode && p.barcode.includes(q));
      const deptMatch = Boolean(p.department && p.department.toLowerCase().includes(q));
      return codeMatch || unifiedMatch || nameMatch || barcodeMatch || deptMatch;
    }).slice(0, 10);
  }, [debouncedSearchTerm, showSuggestions, visibleProducts]);

  // Active branch context for stock resolution: specific user's branch for reps/supervisors, or global filter for admin
  const currentActiveBranch = useMemo(() => {
    if (currentUser?.role === 'sales_rep' || currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager') {
      return currentUser.branchName || 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)';
    }
    return selectedBranchFilter !== 'الكل' ? selectedBranchFilter : (currentUser?.branchName || '');
  }, [currentUser, selectedBranchFilter]);

  // Helper to get effective branch stock for a product for current viewer
  const getProductBranchStock = (p: Product) => {
    return getBranchStockForProduct(p, currentActiveBranch);
  };

  // Stock Counts for Filtering
  const stockCounts = useMemo(() => {
    let outOfStock = 0;
    let outOfBranchOnly = 0;
    let lowStock = 0;
    let highStock = 0;
    let inBranch = 0;
    let inWarehouse = 0;
    let offers = 0;

    visibleProducts.forEach((p) => {
      const branchStock = getProductBranchStock(p);
      const octoberStock = p.mainWarehouseActual || 0;
      const isCompletelyOut = branchStock <= 0 && octoberStock <= 0;
      
      const isAnOffer = Boolean(
        (p.promoPrice && p.promoPrice > 0 && p.promoPrice < p.cartonPrice) ||
        (p.promoPiecePrice && p.promoPiecePrice > 0) ||
        (p.offerPrice && p.offerPrice > 0) ||
        p.status === 'عرض ترويجي' ||
        (p.discountPercent && p.discountPercent > 0) ||
        (p.salesPriority && p.salesPriority.includes('عرض'))
      );
      if (isAnOffer) {
        offers++;
      }

      if (isCompletelyOut) {
        outOfStock++;
      } else {
        if (branchStock <= 0 && octoberStock > 0) {
          outOfBranchOnly++;
        }
        if (branchStock > 0 && branchStock <= 5) {
          lowStock++;
        } else if (branchStock >= 30) {
          highStock++;
        }
      }

      if (branchStock > 0) inBranch++;
      if (octoberStock > 0) inWarehouse++;
    });

    return {
      all: products.length,
      offers,
      outOfStock,
      outOfBranchOnly,
      lowStock,
      highStock,
      inBranch,
      inWarehouse,
    };
  }, [products, currentActiveBranch]);

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    let result = getVisibleProducts().filter((p) => {
      // Search match
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const cleanQuery = query.replace('#', '').trim();
        const codeMatch = p.code.toLowerCase().includes(query) || p.code.toLowerCase().includes(cleanQuery);
        const unifiedMatch = Boolean(
          p.unifiedCode && (
            p.unifiedCode.toLowerCase().includes(cleanQuery) ||
            p.unifiedCode.toLowerCase().includes(query)
          )
        );
        const nameMatch = p.name.toLowerCase().includes(query);
        const catMatch = p.category?.toLowerCase().includes(query);
        const deptMatch = p.department?.toLowerCase().includes(query);
        const colorMatch = p.color?.toLowerCase().includes(query);
        const barcodeMatch = p.barcode?.includes(query);

        if (!codeMatch && !unifiedMatch && !nameMatch && !catMatch && !deptMatch && !colorMatch && !barcodeMatch) {
          return false;
        }
      }

      // Official Brand / Item Group Filter (المجموعة الرئيسية من الشيت)
      if (selectedOfficialDept !== 'الكل') {
        const target = selectedOfficialDept.toLowerCase().trim();
        const pDept = (p.itemGroup || p.department || p.category || '').toLowerCase().trim();

        const match = pDept === target || pDept.includes(target);
        if (!match) return false;
      }

      // Sub-category / Family Name Filter
      if (selectedSubCategory !== 'الكل') {
        const targetSub = selectedSubCategory.toLowerCase().trim();
        const pFamily = (p.familyName || '').toLowerCase().trim();
        const pClass = (p.classification || '').toLowerCase().trim();
        const pCat = (p.category || '').toLowerCase().trim();

        // Exact match with familyName, classification, or category (strictly matching slicer cards)
        const match =
          pFamily === targetSub ||
          pClass === targetSub ||
          (pCat === targetSub && !pFamily && !pClass) ||
          (pFamily && pFamily === targetSub) ||
          (pClass && pClass === targetSub);

        if (!match) return false;
      }

      // Priority filter
      if (selectedPriority !== 'الكل' && p.salesPriority !== selectedPriority) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'الكل' && p.status !== selectedStatus) {
        return false;
      }

      // Stock Filters (المنتهية، قاربت على النفاذ، المتوفرة بكثرة، متاح بأكتوبر، إلخ)
      const bStock = getProductBranchStock(p);
      const oStock = p.mainWarehouseActual || 0;

      if (stockAvailabilityFilter === 'offers') {
        const isOffer = Boolean(
          (p.promoPrice && p.promoPrice > 0 && p.promoPrice < p.cartonPrice) ||
          (p.promoPiecePrice && p.promoPiecePrice > 0) ||
          (p.offerPrice && p.offerPrice > 0) ||
          p.status === 'عرض ترويجي' ||
          (p.discountPercent && p.discountPercent > 0) ||
          (p.salesPriority && p.salesPriority.includes('عرض'))
        );
        if (!isOffer) return false;
      } else if (stockAvailabilityFilter === 'has_stock') {
        // فقط المنتجات المتوفرة (رصيد فرع > 0 أو رصيد مخزن رئيسي > 0)
        if (bStock <= 0 && oStock <= 0) return false;
      } else if (stockAvailabilityFilter === 'out_of_stock') {
        // بدون مخزون: الصنف منتهي تماماً (رصيد الفرع 0 ورصيد أكتوبر 0)
        if (bStock > 0 || oStock > 0) return false;
      } else if (stockAvailabilityFilter === 'out_of_branch_only') {
        // غير متوفر بالفرع ولكن متاح بمخزن أكتوبر الرئيسي
        if (bStock > 0 || oStock <= 0) return false;
      } else if (stockAvailabilityFilter === 'low_stock') {
        if (bStock <= 0 || bStock > 5) return false;
      } else if (stockAvailabilityFilter === 'high_stock') {
        if (bStock < 30) return false;
      } else if (stockAvailabilityFilter === 'in_branch') {
        if (bStock <= 0) return false;
      } else if (stockAvailabilityFilter === 'in_warehouse') {
        if (oStock <= 0) return false;
      }

      return true;
    });

    // Sorting by branch stock, October warehouse stock, total stock, priority, price, name
    if (sortBy === 'branch_stock_desc') {
      result.sort((a, b) => getProductBranchStock(b) - getProductBranchStock(a));
    } else if (sortBy === 'branch_stock_asc') {
      result.sort((a, b) => getProductBranchStock(a) - getProductBranchStock(b));
    } else if (sortBy === 'october_stock_desc') {
      result.sort((a, b) => (b.mainWarehouseActual || 0) - (a.mainWarehouseActual || 0));
    } else if (sortBy === 'october_stock_asc') {
      result.sort((a, b) => (a.mainWarehouseActual || 0) - (b.mainWarehouseActual || 0));
    } else if (sortBy === 'total_stock_desc') {
      result.sort((a, b) => {
        const totalB = getProductBranchStock(b) + (b.mainWarehouseActual || 0);
        const totalA = getProductBranchStock(a) + (a.mainWarehouseActual || 0);
        return totalB - totalA;
      });
    } else if (sortBy === 'price_asc') {
      result.sort((a, b) => (a.piecePrice || 0) - (b.piecePrice || 0));
    } else if (sortBy === 'price_desc') {
      result.sort((a, b) => (b.piecePrice || 0) - (a.piecePrice || 0));
    } else if (sortBy === 'priority') {
      const pWeights: Record<SalesPriority, number> = { 'مرتفع': 4, 'متوسط': 3, 'عادي': 2, 'منخفض': 1 };
      result.sort((a, b) => (pWeights[b.salesPriority] || 0) - (pWeights[a.salesPriority] || 0));
    } else if (sortBy === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }

    return result;
  }, [
    getVisibleProducts,
    products,
    searchTerm,
    selectedOfficialDept,
    selectedSubCategory,
    selectedPriority,
    selectedStatus,
    stockAvailabilityFilter,
    selectedBranchFilter,
    sortBy,
    currentActiveBranch
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

  // Filter-First Condition: hide products unless explicitly searched/filtered or user requests to view all
  const isFiltered = Boolean(
    searchTerm.trim().length > 0 ||
    selectedOfficialDept !== 'الكل' ||
    selectedSubCategory !== 'الكل' ||
    stockAvailabilityFilter !== 'all' ||
    selectedPriority !== 'الكل' ||
    selectedStatus !== 'الكل' ||
    showAllExplicitly
  );

  const resetAllFilters = () => {
    setSearchTerm('');
    setSelectedOfficialDept('الكل');
    setSelectedSubCategory('الكل');
    setSelectedPriority('الكل');
    setSelectedStatus('الكل');
    setStockAvailabilityFilter('all');
    setSortBy('default');
    setShowAllExplicitly(true);
  };

  const handleDownloadCatalogPDF = useCallback(async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;
      const imageSize = 30; // mm
      let y = 12;

      // Header
      doc.setFontSize(16);
      doc.setTextColor(30, 58, 95); // navy
      doc.text('كتالوج المنتجات - Dream Distribution', pageWidth / 2, y, { align: 'center' });
      y += 7;
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`عدد المنتجات المعروضة: ${filteredProducts.length}`, pageWidth / 2, y, { align: 'center' });
      y += 6;
      doc.setLineWidth(0.5);
      doc.setDrawColor(30, 58, 95);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // Helper to load image as data URL
      const loadImageAsDataUrl = async (url: string | undefined | null): Promise<string | null> => {
        if (!url) return null;
        try {
          const resp = await fetch(url);
          if (!resp.ok) return null;
          const blob = await resp.blob();
          return await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      };

      for (let i = 0; i < filteredProducts.length; i++) {
        const p = filteredProducts[i];
        const rowStartY = y;

        // Check page break
        if (y + imageSize + 18 > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }

        // Product image (left)
        const imgUrl = getProductImageUrl(p, cloudinaryConfig);
        const dataUrl = await loadImageAsDataUrl(imgUrl);
        if (dataUrl) {
          doc.addImage(dataUrl, 'JPEG', margin, y, imageSize, imageSize);
        } else {
          // Fallback placeholder box
          doc.setFillColor(241, 245, 249);
          doc.roundedRect(margin, y, imageSize, imageSize, 2, 2, 'F');
          doc.setDrawColor(156, 163, 175);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, y, imageSize, imageSize, 2, 2, 'S');
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text('لا توجد صورة', margin + imageSize / 2, y + imageSize / 2, { align: 'center' });
        }

        // Product name & code (right of image)
        const textX = margin + imageSize + 6;
        const textMaxWidth = contentWidth - imageSize - 6;

        doc.setFontSize(10.5);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(p.name || 'بلا اسم', textX, y + 5, { maxWidth: textMaxWidth });

        doc.setFontSize(8.5);
        doc.setTextColor(56, 189, 248);
        doc.setFont('helvetica', 'bold');
        doc.text(`كود المنتج: ${p.code || '---'}`, textX, y + 11, { maxWidth: textMaxWidth });

        // Stock info line
        const bStock = getProductBranchStock(p);
        const oStock = p.mainWarehouseActual || 0;
        const totalStock = bStock + oStock;
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(totalStock > 0 ? 45 : 248, totalStock > 0 ? 212 : 113, totalStock > 0 ? 191 : 113);
        doc.text(`الرصيد: ${totalStock} كرتونة`, textX, y + 17, { maxWidth: textMaxWidth });

        // Divider line between products
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(margin, y + imageSize + 4, pageWidth - margin, y + imageSize + 4);

        y = rowStartY + imageSize + 12;
      }

      doc.save('catalog-products.pdf');
    } catch (err) {
      console.error('PDF generation failed:', err);
    }
  }, [filteredProducts, cloudinaryConfig]);


  const cartSummary = useMemo(() => {
    return getCartSummary ? getCartSummary() : { totalCartons: 0, totalPieces: 0, grandTotal: 0, subtotal: 0, discountAmount: 0 };
  }, [getCartSummary, cart]);

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

  const handleSelectSuggestion = (product: Product) => {
    setSearchTerm(product.name);
    setShowSuggestions(false);
    setRightPanelType('product');
    setRightPanelData(product);
    setRightPanelOpen(true);
    // Scroll to product if it's in the visible list
    setTimeout(() => {
      const el = document.getElementById(`prod-${product.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const openRightPanel = (type: 'product' | 'cart' | 'customer', data: Product | Customer | null = null) => {
    setRightPanelType(type);
    setRightPanelData(data);
    setRightPanelOpen(true);
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
    'مرتفع': { bg: 'bg-rose-500 text-white', text: 'الأكثر طلباً', icon: Flame },
    'متوسط': { bg: 'bg-[var(--app-accent)] text-slate-950', text: 'طلب متكرر', icon: Zap },
    'عادي': { bg: 'bg-slate-700 text-slate-200', text: 'منتج معتمد' },
    'منخفض': { bg: 'bg-zinc-600 text-zinc-200', text: 'عادي' },
  };

  const activeInvoiceStep = selectedCustomer ? 3 : cart.length > 0 ? 2 : 1;
  const invoiceSteps = [
    { id: 1, label: 'اختيار المنتجات', hint: 'ابحث وأضف الكمية', icon: Package },
    { id: 2, label: 'مراجعة السلة', hint: cart.length > 0 ? `${cart.length} صنف مضاف` : 'لم تضف أصنافًا بعد', icon: ShoppingCart },
    { id: 3, label: 'اختيار العميل', hint: selectedCustomer?.name || 'حدد عميل الفاتورة', icon: User },
    { id: 4, label: 'الدفع والإصدار', hint: 'مراجعة وحفظ الفاتورة', icon: Receipt },
  ];

  return (
    <div className="tantawy-screen space-y-4 pb-20">
      {/* Clean Modern Catalog Header (Amazon / Dream Distribution Ops Console style) */}
      <section className="bg-white rounded-2xl border border-[color:var(--app-line)] p-3.5 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#0f233d] text-[var(--app-accent)] flex items-center justify-center font-black shadow-sm shrink-0">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black tracking-wider uppercase text-[#8a6420] bg-[#fffdf7] px-2 py-0.5 rounded border border-amber-200">
                OPS CONSOLE / CATALOG
              </span>
              <span className="text-[11px] font-bold text-slate-400">
                {currentActiveBranch || 'الفرع الرئيسي'}
              </span>
            </div>
            <h1 className="text-base sm:text-xl font-black text-slate-900 mt-0.5">
              كتالوج المنتجات والأصناف
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              عرض {displayedProducts.length} من {products.length} صنفاً نشطاً • أسعار الجملة المعتمدة
            </p>
          </div>
        </div>
      </section>

      {/* Selected Customer Order Context Banner */}
      {selectedCustomer && (
        <div className="bg-[#fdf8ed] text-slate-950 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm border border-[#e8dcba] animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[color:var(--app-navy)] text-[color:var(--app-accent)] flex items-center justify-center font-black shrink-0 shadow-sm">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5">
                <span>جاري إنشاء طلبية للعميل المختار:</span>
                <span className="bg-[color:var(--app-navy)] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                  {selectedCustomer.code || 'عميل مسجل'}
                </span>
              </div>
              <div className="text-sm sm:text-base font-black text-slate-950">
                {selectedCustomer.name}
              </div>
              <div className="text-[11px] text-slate-800 font-medium">
                {selectedCustomer.branchName ? `الفرع: ${selectedCustomer.branchName}` : ''} 
                {selectedCustomer.salesRepName || selectedCustomer.repName ? ` • المندوب: ${selectedCustomer.salesRepName || selectedCustomer.repName}` : ''}
                {selectedCustomer.currentBalance ? (
                  <span>
                    {' • المديونية: '}
                    {isConfidentialMode ? (
                      <span className="bg-[color:var(--app-navy)] text-[color:var(--app-accent)] font-mono px-1.5 py-0.5 rounded text-[10px]">•••••• (محمي)</span>
                    ) : (
                      formatCurrency(selectedCustomer.currentBalance)
                    )}
                  </span>
                ) : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {onOpenCart && (
              <button
                onClick={onOpenCart}
                className="bg-[color:var(--app-navy)] hover:bg-[#0d2340] active:scale-95 text-white px-4 py-2 rounded-[10px] text-xs font-black flex items-center gap-2 shadow-md transition cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>معاينة الفاتورة وتأكيد الطلبية</span>
              </button>
            )}
            {onClearSelectedCustomer && (
              <button
                onClick={onClearSelectedCustomer}
                className="bg-white hover:bg-slate-50 text-slate-600 border border-[color:var(--app-line)] p-2 rounded-[10px] text-xs font-bold transition cursor-pointer"
                title="إلغاء تحديد العميل والعودة للطلب العام"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Toast Notification when adding item (Amazon / Souq style) */}
      {addedItemToast && (
        <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-6 md:right-auto z-50 bg-[color:var(--app-navy)] text-white px-4 py-3 rounded-2xl shadow-2xl border-2 border-[color:var(--app-accent)] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[color:var(--app-accent)] text-[#231a05] flex items-center justify-center font-black">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-[color:var(--app-accent)] font-bold flex items-center gap-1">
                <span>تمت الإضافة إلى عربة التسوق</span>
                <span className="text-[10px] bg-[color:var(--app-accent)]/20 text-[color:var(--app-accent)] px-1.5 py-0.2 rounded font-black">جاهز للطلب</span>
              </div>
              <div className="text-sm font-black truncate max-w-[220px] sm:max-w-xs">{addedItemToast.name}</div>
              <div className="text-xs text-slate-300 font-medium">{addedItemToast.count}</div>
            </div>
          </div>

          {onOpenCart && (
            <button
              onClick={onOpenCart}
              className="bg-[color:var(--app-accent)] hover:bg-[#b98e3c] text-[#231a05] px-3 py-1.5 rounded-[10px] font-black text-xs shadow transition whitespace-nowrap cursor-pointer"
            >
              عرض السلة
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
              <div className="text-xs text-[#f5a5a5] font-black">تنبيه نفاذ / حجز المخزون</div>
              <div className="text-xs text-white font-bold leading-tight">{stockErrorToast}</div>
            </div>
          </div>
          <button onClick={() => setStockErrorToast(null)} className="text-[#f5a5a5] hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Wipe / Reset Data Success Alert */}
      {wipeSuccessText && (
        <div className="p-3 bg-[#e8f3ee] border border-[rgba(46,125,91,.22)] text-[color:var(--app-ok)] text-xs rounded-xl font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCheck className="w-4 h-4 text-[color:var(--app-ok)] shrink-0" />
          <span>{wipeSuccessText}</span>
        </div>
      )}

      {/* Top Scope & Branch Bar (Minimal, Single-Row) */}
      <div className="bg-white border border-[color:var(--app-line)] rounded-xl p-2.5 sm:p-3 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-slate-700 font-bold">
            <Building className="w-4 h-4 text-[color:var(--app-blue)]" />
            <span>فرع:</span>
            <span className="font-black text-slate-900">{currentActiveBranch || 'الفرع الرئيسي'}</span>
          </div>

          {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
            <div className="flex items-center gap-1.5 border-r border-slate-200 pr-2 mr-2">
              <span className="text-slate-500 font-medium text-[11px]">تبديل:</span>
              <select
                aria-label="تبديل الفرع"
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="bg-slate-50 border border-[color:var(--app-line)] text-slate-800 font-bold rounded-md px-2 py-1 text-xs"
              >
                <option value="الكل">كل الفروع</option>
                {branches
                  .filter((b) => !b.isMainWarehouse && !b.name.includes('المخزن المركزي'))
                  .map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {/* Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? 'الوضع الفاتح' : 'الوضع الليلي'}
            aria-label={isDark ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الليلي'}
            className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl border border-[var(--app-line)] bg-white text-[var(--app-navy)] hover:bg-slate-50 active:scale-95 transition cursor-pointer"
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Main Search & Modern Controls Bar (Amazon / Noon Clean Layout) */}
      <div className="bg-white rounded-xl border border-[color:var(--app-line)] p-2.5 sm:p-3 shadow-xs space-y-2.5">
        <div className="flex items-center gap-2 relative">
          {/* Main Search Input */}
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="ابحث بالاسم، الكود (#)، الماركة، أو القسم..."
              className={`w-full h-10 sm:h-11 pl-9 pr-9 ${isDark ? 'bg-[#1e293b] focus:bg-[#1e293b] text-slate-100 placeholder-slate-500' : 'bg-slate-50 focus:bg-white text-slate-900 placeholder-slate-400'} border border-[color:var(--app-line)] focus:border-[color:var(--app-blue)] rounded-lg text-xs sm:text-sm font-medium transition`}
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setShowSuggestions(false);
                }}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 w-6 h-6 flex items-center justify-center cursor-pointer"
                title="مسح البحث"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <Barcode className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
            )}
          </div>

          {/* Smart Search Suggestions Dropdown */}
          {smartSuggestions.length > 0 && showSuggestions && (
            <div className={`absolute top-full left-0 right-0 mt-1 z-50 ${isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[color:var(--app-line)]'} rounded-xl shadow-xl max-h-72 overflow-y-auto`}>
              <div className={`p-2 text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-400'} border-b ${isDark ? 'border-[#334155]' : 'border-slate-100'} flex items-center justify-between`}>
                <span>اقتراحات سريعة ({smartSuggestions.length})</span>
                <button
                  type="button"
                  onClick={() => setShowSuggestions(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
              {smartSuggestions.map((p) => {
                const imgUrl = getProductImageUrl(p, cloudinaryConfig);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      handleSelectSuggestion(p);
                      setShowSuggestions(false);
                    }}
                    className={`w-full text-right px-3 py-2 ${isDark ? 'hover:bg-[#334155]' : 'hover:bg-slate-50'} flex items-center justify-between border-b ${isDark ? 'border-[#334155]' : 'border-slate-50'} last:border-0 cursor-pointer`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-slate-100 ${isDark ? 'bg-[#334155]' : ''}">
                        <img src={imgUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      </div>
                      <div className="truncate min-w-0 flex-1 ml-2">
                        <span className={`font-bold block truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{p.name}</span>
                        <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{p.code} {p.unifiedCode ? `(#${p.unifiedCode.replace('#', '')})` : ''}</span>
                      </div>
                    </div>
                    <span className={`text-[var(--app-ok)] font-bold text-[11px] shrink-0`}>{getProductBranchStock(p)} ك بالفرع</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Sort Dropdown */}
          <select
            aria-label="ترتيب المنتجات"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="hidden sm:block h-10 sm:h-11 px-2.5 bg-slate-50 border border-[color:var(--app-line)] rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
          >
            <option value="default">الترتيب الافتراضي</option>
            <option value="priority">الأكثر طلباً ⭐</option>
            <option value="branch_stock_desc">مخزون الفرع: الأكثر أولاً</option>
            <option value="price_asc">السعر: من الأقل للأعلى</option>
            <option value="price_desc">السعر: من الأعلى للأقل</option>
            <option value="name_asc">الاسم (أ - ي)</option>
          </select>

          {/* Confidentiality Toggle (Privacy Mode) */}
          <button
            type="button"
            onClick={toggleConfidentialMode}
            className={`h-10 sm:h-11 px-2.5 sm:px-3 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
              isConfidentialMode
                ? 'bg-[#fffdf7] text-[#8a6420] border-[var(--app-accent)]'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-[color:var(--app-line)]'
            }`}
            title={isConfidentialMode ? 'وضع السرية مفعّل (الأسعار محجوبة أمام العميل) - انقر للإظهار' : 'إخفاء الأسعار أمام العميل (وضع السرية)'}
          >
            <ShieldCheck className={`w-4 h-4 ${isConfidentialMode ? 'text-amber-600' : 'text-slate-400'}`} />
            <span className="hidden md:inline">{isConfidentialMode ? 'الأسعار محجوبة' : 'وضع السرية'}</span>
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-[color:var(--app-line)] h-10 sm:h-11 shrink-0">
            <button
              type="button"
              onClick={() => {
                setViewMode('grid');
                setGridDensity('comfortable');
              }}
              className={`px-2 h-8 rounded text-xs font-bold transition cursor-pointer ${
                viewMode === 'grid' && gridDensity === 'comfortable' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
              title="عرض مريح للمنتجات"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('grid');
                setGridDensity('compact');
              }}
              className={`px-2 h-8 rounded text-xs font-bold transition cursor-pointer ${
                viewMode === 'grid' && gridDensity === 'compact' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
              title="عرض مكثف"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-2 h-8 rounded text-xs font-bold transition cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
              title="عرض جدول"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Amazon & Noon Horizontal Category Scroll Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
          <button
            type="button"
            onClick={() => {
              setSelectedOfficialDept('الكل');
              setSelectedSubCategory('الكل');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition shrink-0 cursor-pointer ${
              selectedOfficialDept === 'الكل'
                ? 'bg-[color:var(--app-navy)] text-white shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-[color:var(--app-line)]'
            }`}
          >
            الكل ({products.length})
          </button>
          {dynamicItemGroups.map((group) => {
            const count = deptCounts[group] || 0;
            const isSelected = selectedOfficialDept === group;
            return (
              <button
                key={group}
                type="button"
                onClick={() => {
                  setSelectedOfficialDept(isSelected ? 'الكل' : group);
                  setSelectedSubCategory('الكل');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-[color:var(--app-navy)] text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-[color:var(--app-line)]'
                }`}
              >
                <span>{group}</span>
                <span className={`text-[10px] font-mono px-1 rounded ${isSelected ? 'bg-white/20 text-white' : 'text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Quick Stock Filters & Results Count Strip */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setStockAvailabilityFilter('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                stockAvailabilityFilter === 'all' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل
            </button>
            <button
              type="button"
              onClick={() => setStockAvailabilityFilter('in_branch')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                stockAvailabilityFilter === 'in_branch' ? 'bg-[#e8f5ef] text-[var(--app-ok)]' : 'text-slate-600 hover:text-[var(--app-ok)]'
              }`}
            >
              متوفر بالفرع ({stockCounts.inBranch})
            </button>
            <button
              type="button"
              onClick={() => setStockAvailabilityFilter('in_warehouse')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                stockAvailabilityFilter === 'in_warehouse' ? 'bg-[#e8f0f8] text-[var(--app-navy)]' : 'text-slate-600 hover:text-blue-700'
              }`}
            >
              مخزن أكتوبر ({stockCounts.inWarehouse})
            </button>
            <button
              type="button"
              onClick={() => setStockAvailabilityFilter('has_stock')}
               className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                 stockAvailabilityFilter === 'has_stock' ? 'bg-[#e8f5ef] text-[var(--app-ok)]' : 'text-slate-600 hover:text-[var(--app-ok)]'
               }`}
             >
               متوفر فقط ✓
             </button>
             <button
               type="button"
               onClick={() => setStockAvailabilityFilter('offers')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                stockAvailabilityFilter === 'offers' ? 'bg-[#fff8e8] text-[#8a6420]' : 'text-slate-600 hover:text-[#8a6420]'
              }`}
            >
              عروض خاصة 🔥 ({stockCounts.offers})
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
               type="button"
               onClick={handleDownloadCatalogPDF}
               className="px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition cursor-pointer bg-[var(--app-navy)] text-white hover:opacity-90 flex items-center gap-1"
               title="تحميل كتالوج PDF (اسم + كود)"
             >
               📄 PDF
             </button>
             <span className="text-slate-500 text-[11px] font-medium hidden sm:inline">
               مطابق: <strong className="text-slate-900 font-bold">{filteredProducts.length}</strong> صنف
            </span>
            {(searchTerm || selectedOfficialDept !== 'الكل' || selectedSubCategory !== 'الكل' || stockAvailabilityFilter !== 'all' || sortBy !== 'default') && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-[var(--app-risk)] hover:text-[var(--app-risk)] text-[11px] font-bold whitespace-nowrap flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>إلغاء التصفية</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Catalog Product Grid (Amazon/Noon Web + Taager/Raneen Mobile) */}
      <div className="w-full min-w-0">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-3.5">
            {displayedProducts.map((product, idx) => {
              const isPromo = product.promoPrice && product.promoPrice > 0;
              const dynamicBranchStock = getProductBranchStock(product);
              const octoberAvail =
                typeof product.mainWarehouseReserved === 'number'
                  ? Math.max(0, product.mainWarehouseReserved)
                  : product.mainWarehouseActual || 0;
              const totalCartonsAvailable = dynamicBranchStock + octoberAvail;
              const orderState = getCardState(product.id);

              return (
                <div
                  id={`prod-${product.id}`}
                  key={product.id}
                  className="bg-white rounded-xl overflow-hidden border border-[color:var(--app-line)] shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col justify-between group relative"
                >
                  {/* 1:1 Aspect-Square Image Box with object-contain (No distorted or cropped cookware) */}
                  <div
                    className="relative aspect-square bg-white overflow-hidden cursor-pointer flex items-center justify-center p-2.5 border-b border-slate-100"
                    onClick={() => {
                      const img = getProductImageUrl(product, cloudinaryConfig);
                      setLightboxImage({ src: img, alt: product.name });
                    }}
                  >
                    <ProductImage
                      product={product}
                      cloudinaryConfig={cloudinaryConfig}
                      targetSize={280}
                      sizeVariant="card"
                      priority={idx < 6}
                      containerClassName="w-full h-full flex items-center justify-center"
                      className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Clean Code Tag */}
                    <div className="absolute top-2 right-2 z-10">
                      <span className="bg-white/90 text-slate-600 border border-slate-200 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-xs">
                        {product.code}
                      </span>
                    </div>

                    {/* Single Promo or Priority Badge */}
                    {isPromo ? (
                      <div className="absolute top-2 left-2 z-10 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-xs">
                        <Flame className="w-2.5 h-2.5" />
                        <span>عرض</span>
                      </div>
                    ) : product.salesPriority === 'مرتفع' ? (
                      <div className="absolute top-2 left-2 z-10 bg-[var(--app-accent)] text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-xs">
                        <Star className="w-2.5 h-2.5 fill-slate-950" />
                        <span>مميز</span>
                      </div>
                    ) : null}

                    {/* Pack size indicator */}
                    <div className="absolute bottom-2 right-2 bg-white/90 text-slate-600 border border-slate-200 text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-xs">
                      الشدة: <span className="font-mono text-[#8a6420]">{product.cartonQuantity || 1} ق</span>
                    </div>
                  </div>

                  {/* Body Details */}
                  <div className="p-2.5 sm:p-3 flex-1 flex flex-col justify-between space-y-2">
                    {/* Category & Title */}
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 font-semibold truncate">
                        {product.department || product.category || 'عام'}
                      </div>
                      <h3
                        onClick={() => setSelectedProductForModal(product)}
                        className="font-bold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2 hover:text-[color:var(--app-blue)] cursor-pointer transition min-h-[36px]"
                        title={product.name}
                      >
                        {product.name}
                      </h3>
                    </div>

                    {/* Stock & Pricing */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-100">
                      {/* Stock availability */}
                      <div className="flex items-center justify-between text-[11px]">
                        {totalCartonsAvailable <= 0 ? (
                          <span className="text-[var(--app-risk)] font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            غير متوفر
                          </span>
                        ) : dynamicBranchStock > 0 ? (
                          <span className="text-[var(--app-ok)] font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            متوفر: {dynamicBranchStock} ك
                          </span>
                        ) : (
                          <span className="text-[color:var(--app-blue)] font-bold flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            أكتوبر: {octoberAvail} ك
                          </span>
                        )}
                        {octoberAvail > 0 && dynamicBranchStock > 0 && (
                          <span className="text-slate-400 text-[10px]">أكتوبر: {octoberAvail}</span>
                        )}
                      </div>

                      {/* Pricing Row */}
                      <div className="bg-slate-50 rounded-lg p-2 border border-slate-150 flex items-baseline justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block leading-none">الكرتونة</span>
                          <span className="text-[color:var(--app-navy)] font-black text-sm sm:text-base tabular-nums">
                            {isConfidentialMode ? '••••••' : formatCurrency(product.cartonPrice)}
                          </span>
                        </div>
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 font-bold block leading-none">القطعة</span>
                          <span className="text-xs font-bold text-slate-600 tabular-nums">
                            {isConfidentialMode ? '••' : `${formatCurrency(product.piecePrice)} / ق`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Order Controls: Stepper & Add */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between gap-1">
                        {/* Stepper */}
                        <div className="flex items-center bg-slate-50 rounded-lg border border-[color:var(--app-line)] p-0.5">
                          <button
                            type="button"
                            disabled={totalCartonsAvailable <= 0 || orderState.quantity <= 1}
                            onClick={() => adjustCardQuantity(product.id, -1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-700 hover:text-slate-900 rounded disabled:opacity-30 cursor-pointer"
                            aria-label="إنقاص"
                          >
                            <Minus className="w-3 h-3 stroke-[2.5]" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            disabled={totalCartonsAvailable <= 0}
                            value={orderState.quantity}
                            onChange={(e) => {
                              const parsed = parseInt(e.target.value, 10);
                              setCardQuantityDirect(product.id, parsed);
                            }}
                            className="w-8 h-7 text-center font-bold text-xs text-slate-900 bg-white border border-slate-200 rounded tabular-nums"
                            aria-label="الكمية"
                          />
                          <button
                            type="button"
                            disabled={totalCartonsAvailable <= 0}
                            onClick={() => adjustCardQuantity(product.id, 1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-700 hover:text-slate-900 rounded disabled:opacity-30 cursor-pointer"
                            aria-label="زيادة"
                          >
                            <Plus className="w-3 h-3 stroke-[2.5]" />
                          </button>
                        </div>

                        {/* Unit Switcher */}
                        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold flex-1">
                          <button
                            type="button"
                            onClick={() => updateCardType(product.id, 'carton')}
                            className={`flex-1 h-7 rounded transition cursor-pointer text-center ${
                              orderState.type === 'carton'
                                ? 'bg-[color:var(--app-navy)] text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            كرتونة
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCardType(product.id, 'piece')}
                            className={`flex-1 h-7 rounded transition cursor-pointer text-center ${
                              orderState.type === 'piece'
                                ? 'bg-[color:var(--app-navy)] text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            قطعة
                          </button>
                        </div>
                      </div>

                      {/* Add Button */}
                      {totalCartonsAvailable > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleQuickAddWithState(product)}
                          className="w-full bg-[color:var(--app-navy)] hover:bg-[#0d2340] active:scale-[0.98] text-white font-bold h-9 px-2 rounded-lg text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                          <span>أضف للطلبية</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="w-full bg-slate-100 border border-slate-200 text-slate-400 font-bold h-9 px-2 rounded-lg text-xs flex items-center justify-center cursor-not-allowed"
                        >
                          غير متوفر
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
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-[var(--app-line)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr>
                  <th className="p-3">الكود والصورة</th>
                  <th className="p-3">اسم الصنف والبيان</th>
                  <th className="p-3">القسم والتصنيف</th>
                  <th className="p-3 text-center">شدة الكرتونة</th>
                  <th className="p-3 text-center">
                    {currentActiveBranch ? `مخزون ${currentActiveBranch.replace('فرع ', '')} (كرتونة)` : 'مخزون الفرع (كرتونة)'}
                  </th>
                  <th className="p-3 text-center">مخزن أكتوبر (كرتونة)</th>
                  <th className="p-3 text-left">سعر الكرتونة بالجملة</th>
                  <th className="p-3 text-center">سعر العرض (الكرتونة)</th>
                  <th className="p-3 text-center">إضافة كرتونة للطلبية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-line)]">
                {displayedProducts.map((product) => {
                  const branchCartons = getProductBranchStock(product);
                  const mainWhCartons = typeof product.mainWarehouseReserved === 'number'
                    ? product.mainWarehouseReserved
                    : (product.mainWarehouseActual || 0);

                  return (
                    <tr id={`prod-${product.id}`} key={product.id} className="transition">
                      <td className="p-2.5">
                        <div className="flex items-center gap-2">
                          <ProductImage
                            product={product}
                            cloudinaryConfig={cloudinaryConfig}
                            targetSize={120}
                            sizeVariant="thumbnail"
                            containerClassName="w-11 h-11 rounded-[8px] bg-[#f2f6fa] dark:bg-slate-700 overflow-hidden shrink-0 border border-[color:var(--app-line)] cursor-pointer"
                            className="w-full h-full object-cover"
                            showBadgeOnFallback={false}
                            onClick={() => {
                              const img = getProductImageUrl(product, cloudinaryConfig);
                              setLightboxImage({ src: img, alt: product.name });
                            }}
                          />
                          <div className="flex flex-col gap-1 items-start">
                            <span className="font-mono font-bold text-[var(--app-muted)] bg-[var(--app-blue-soft)] px-2 py-0.5 rounded-[6px] text-[11px] border border-[var(--app-line)]">
                              {product.code}
                            </span>
                            {product.unifiedCode && (
                              <span className="font-mono font-bold text-[var(--app-navy)] bg-white border border-[color:var(--app-line)] px-1.5 py-0.2 rounded text-[10px] flex items-center gap-0.5" title="الكود الموحد">
                                <span className="text-[#8a6420] dark:text-[var(--app-accent)] font-bold">#</span>
                                <span>{product.unifiedCode.replace('#', '')}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-black text-slate-900 hover:text-[#8a6420] dark:text-[var(--app-accent)] cursor-pointer" onClick={() => setSelectedProductForModal(product)}>
                          {product.name}
                        </div>
                        <div className="text-[10px] text-[var(--app-muted)] flex items-center gap-2">
                          <span>اللون: {product.color || '---'}</span>
                          <span>الحجم: {product.size || '---'}</span>
                        </div>
                      </td>
                      <td className="p-2.5 font-bold text-slate-600">{product.department || product.category}</td>
                      <td className="p-2.5 text-center font-black text-slate-800">{product.cartonQuantity} قطعة</td>
                      <td className="p-2.5 text-center">
                        <span className={branchCartons > 0 ? (branchCartons <= 5 ? 'text-[color:var(--app-warn)] font-black' : 'text-[color:var(--app-ok)] font-black') : 'text-[color:var(--app-risk)] font-bold'}>
                          {branchCartons} كرتونة
                        </span>
                        <div className="text-[10px] mt-0.5">
                          {branchCartons <= 0 ? (
                            <span className="text-[color:var(--app-risk)] font-black">نفد (0 متاح)</span>
                          ) : branchCartons <= 5 ? (
                            <span className="text-[color:var(--app-warn)] bg-[#f7f0e1] border border-[rgba(155,112,39,.25)] font-black px-1.5 py-0.5 rounded-full text-[9px] inline-block">
                              مخزون حرج ({branchCartons} ك)
                            </span>
                          ) : branchCartons <= 10 ? (
                            <span className="text-[color:var(--app-warn)] bg-[#fdf8ed] border border-[#e8dcba] font-bold px-1.5 py-0.5 rounded-full text-[9px] inline-block">
                              محدود ({branchCartons} ك)
                            </span>
                          ) : (
                            <span className="text-[color:var(--app-ok)] font-bold">متاح: {branchCartons} ك</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-[color:var(--app-navy)] font-black">{mainWhCartons} كرتونة</span>
                      </td>
                      <td className="p-2.5 text-left font-extrabold text-slate-900 text-sm tabular-nums">
                        {isConfidentialMode ? (
                          <span className="font-mono text-slate-400 text-xs tracking-widest bg-[#f2f6fa] dark:bg-slate-700 px-1.5 py-0.5 rounded">••••••</span>
                        ) : (
                          formatCurrency(product.cartonPrice)
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        {isConfidentialMode ? (
                          <span className="font-mono text-slate-400 text-xs tracking-widest bg-[#f2f6fa] dark:bg-slate-700 px-1.5 py-0.5 rounded">••••••</span>
                        ) : product.promoPrice ? (
                          <div className="inline-flex flex-col items-center bg-[#fdf5f5] border border-[rgba(179,74,74,.25)] px-2 py-0.5 rounded-[8px]">
                            <span className="text-[color:var(--app-risk)] font-black text-xs tabular-nums">{formatCurrency(product.promoPrice)}</span>
                            <span className="text-[9px] text-[color:var(--app-risk)] opacity-80 font-bold">
                              ({formatCurrency(product.promoPiecePrice || (product.cartonQuantity ? product.promoPrice / product.cartonQuantity : product.promoPrice))} ق)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-medium">---</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        {(branchCartons + mainWhCartons) > 0 ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleDirectAdd(product, 'carton', 1)}
                              className="bg-[color:var(--app-navy)] hover:bg-[#0d2340] text-white font-black px-3 py-1.5 rounded-[10px] text-xs transition cursor-pointer shadow-sm whitespace-nowrap min-h-[38px]"
                            >
                              +1 كرتونة
                            </button>
                          </div>
                        ) : (
                          <div className="text-center text-[color:var(--app-risk)] font-bold text-[11px] bg-[#fdf5f5] px-2 py-1 rounded-[8px] border border-[rgba(179,74,74,.25)]">
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
                {[24, 48, 100, 250, 500, 'all'].map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      setItemsPerPage(size as any);
                      setCurrentPage(1);
                    }}
                    className={`px-2 py-1 rounded-[8px] text-xs font-black transition cursor-pointer ${
                      itemsPerPage === size
                        ? 'bg-[color:var(--app-navy)] text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-[#eef3f9]'
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
                        className={`min-w-[36px] h-[36px] rounded-[10px] text-xs font-black transition cursor-pointer flex items-center justify-center ${
                          currentPage === p
                            ? 'bg-[color:var(--app-navy)] text-white shadow-sm'
                            : 'bg-white border border-[color:var(--app-line)] hover:bg-[#f4f7fa] hover:border-[#b8c9db] text-slate-700'
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
          <div className="w-16 h-16 bg-[#f2f6fa] text-[#9aabbf] rounded-2xl flex items-center justify-center mx-auto shadow-inner">
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
              isAdminOrDev ? (
                <button
                  onClick={() => setIsUploadBoxOpen(true)}
                  className="bg-[color:var(--app-navy)] hover:bg-[#0d2340] text-white px-5 py-2.5 rounded-[10px] text-xs font-black shadow-sm transition flex items-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>رفع شيت الأصناف الآن</span>
                </button>
              ) : (
                <div className="text-xs text-slate-400">يرجى التواصل مع الإدارة لرفع الأصناف.</div>
              )
            ) : (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedOfficialDept('الكل');
                  setSelectedSubCategory('الكل');
                  setSelectedPriority('الكل');
                  setSelectedStatus('الكل');
                  setStockAvailabilityFilter('all');
                  setSortBy('default');
                }}
                className="bg-[color:var(--app-navy)] text-white px-5 py-2.5 rounded-[10px] text-xs font-bold shadow hover:bg-[#0d2340] cursor-pointer"
              >
                إعادة تعيين البحث
              </button>
            )}
          </div>
        </div>
      )}
    </div>

      {/* Modern Cart Drawer for Desktop (Amazon / Noon) & Bottom Sheet for Mobile (Taager / Raneen) */}
      <ModernCartDrawer
        isOpen={isCartDrawerOpen}
        onClose={() => setIsCartDrawerOpen(false)}
        selectedCustomer={selectedCustomer}
        onClearSelectedCustomer={onClearSelectedCustomer}
        onOrderCompleted={(inv) => {
          setIsCartDrawerOpen(false);
          if (onNavigateToInvoices) onNavigateToInvoices(inv);
        }}
      />

      {/* Mobile Cart Floating Bar removed as requested by user */}

      {/* Wipe All Data Confirmation Modal (Admin & Developer Only) */}
      {isAdminOrDev && isWipeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-[var(--app-risk)] flex items-center justify-center mx-auto">
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
                className="flex-1 bg-[color:var(--app-risk)] hover:bg-[#953f3f] text-white font-black py-2.5 rounded-[10px] text-xs shadow-md transition cursor-pointer disabled:opacity-50"
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
              <div className="flex items-center flex-wrap gap-2">
                <span className="bg-[color:var(--app-navy)] text-white font-mono font-black text-xs px-2.5 py-1 rounded-[10px]">
                  {selectedProductForModal.code}
                </span>
                {selectedProductForModal.unifiedCode && (
                  <span className="bg-[#e8f1fa] text-[#1e5f9d] font-mono font-black text-xs px-2.5 py-1 rounded-[10px] border border-[#cfe0f0] flex items-center gap-1">
                    <span className="text-[#8a6420] font-bold">#</span>
                    <span>الكود الموحد: {selectedProductForModal.unifiedCode.replace('#', '')}</span>
                  </span>
                )}
                {(() => {
                  const deptMeta = getDepartmentMeta(selectedProductForModal.department || selectedProductForModal.category);
                  const DeptIcon = deptMeta.icon;
                  return (
                    <span className="text-xs font-bold text-slate-700 bg-[#f2f6fa] border border-[#e3ebf3] px-2 py-0.5 rounded-lg flex items-center gap-1.5">
                      <DeptIcon className="w-3.5 h-3.5 text-[color:var(--app-muted)]" />
                      <span>{deptMeta.nameArabic} ({selectedProductForModal.department || 'عام'})</span>
                    </span>
                  );
                })()}
                {selectedProductForModal.classification && (
                  <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg">
                    {selectedProductForModal.classification}
                  </span>
                )}
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
                      عرض ترويجي نشط
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 text-center">
                  معرّف الصورة: <code className="bg-[#f2f6fa] px-1.5 py-0.5 rounded text-[#8a6420] font-mono font-bold">{selectedProductForModal.cloudinaryPublicId || selectedProductForModal.code}</code>
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
                  
                  {/* Code & Unified Code Identification */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="bg-[color:var(--app-navy)] text-[color:var(--app-accent)] font-mono font-black text-xs px-2.5 py-1 rounded-[10px]">
                      كود الصنف: {selectedProductForModal.code}
                    </span>
                    {selectedProductForModal.unifiedCode ? (
                      <span className="bg-[#e8f1fa] text-[#1e5f9d] font-mono font-black text-xs px-2.5 py-1 rounded-[10px] border border-[#cfe0f0] flex items-center gap-1">
                        <span className="text-[#8a6420] font-bold">#</span>
                        <span>الكود الموحد ل��موديل: {selectedProductForModal.unifiedCode.replace('#', '')}</span>
                      </span>
                    ) : (
                      <span className="bg-[#f2f6fa] text-slate-600 font-bold text-xs px-2 py-0.5 rounded-lg border border-[color:var(--app-line)]">
                        # بدون كود موحد
                      </span>
                    )}
                    {selectedProductForModal.color && (
                      <span className="bg-[#e8f1fa] text-[#1e5f9d] border border-[#cfe0f0] font-black text-xs px-2 py-0.5 rounded-lg">
                        اللون: {selectedProductForModal.color}
                      </span>
                    )}
                  </div>

                  {/* Sibling color variants of the same unifiedCode */}
                  {selectedProductForModal.unifiedCode && (() => {
                    const normCode = selectedProductForModal.unifiedCode.replace('#', '').trim();
                    const siblings = products.filter(
                      (other) =>
                        other.id !== selectedProductForModal.id &&
                        other.unifiedCode &&
                        other.unifiedCode.replace('#', '').trim() === normCode
                    );
                    if (siblings.length === 0) return null;
                    return (
                      <div className="mt-3 bg-[#e8f1fa]/70 border border-[#cfe0f0] rounded-2xl p-2.5 space-y-2">
                        <div className="flex items-center justify-between text-xs font-black text-[#1e5f9d]">
                          <span className="flex items-center gap-1">
                            <span>الألوان والموديلات لنفس الكود الموحد (#{normCode}):</span>
                          </span>
                          <span className="text-[10px] bg-[color:var(--app-navy)] text-white font-black px-2 py-0.5 rounded-md tabular-nums">
                            {siblings.length} بدائل ألوان
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {siblings.map((sib) => (
                            <div
                              key={sib.id}
                              onClick={() => setSelectedProductForModal(sib)}
                              className="flex items-center gap-2 p-1.5 bg-white border border-[#cfe0f0] rounded-[10px] hover:border-[#1e5f9d] hover:shadow-xs cursor-pointer transition text-[11px]"
                              title={`عرض صنف: ${sib.name} (${sib.color || 'بدون لون'})`}
                            >
                              <ProductImage
                                product={sib}
                                cloudinaryConfig={cloudinaryConfig}
                                containerClassName="w-7 h-7 rounded-md bg-slate-100 shrink-0 border border-slate-200"
                                className="w-full h-full object-cover"
                                showBadgeOnFallback={false}
                              />
                              <div className="truncate flex-1">
                                <div className="font-black text-slate-900 truncate">{sib.color || sib.name}</div>
                                <div className="text-[10px] text-[#1e5f9d] font-mono font-bold flex items-center gap-1">
                                  <span>{sib.code}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Stock Details Box */}
                {(() => {
                  const activeBranchLabel = currentActiveBranch || selectedProductForModal.branchName || 'الفرع الحالي';
                  const branchStock = getBranchStockForProduct(selectedProductForModal, currentActiveBranch);
                  const branchReserved = branchStock;
                  const octoberStock = selectedProductForModal.mainWarehouseActual || 0;
                  const octoberReserved = typeof selectedProductForModal.mainWarehouseReserved === 'number'
                    ? selectedProductForModal.mainWarehouseReserved
                    : octoberStock;

                  return (
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-900 text-xs">مستويات المخزون بالكراتين ({activeBranchLabel}):</div>
                        <span className="text-[10px] bg-[#f7f0e1] text-[color:var(--app-warn)] font-bold px-2 py-0.5 rounded-md">
                          أكتوبر: المخزن الرئيسي
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white p-2.5 rounded-xl border border-[color:var(--app-line)]">
                          <div className="text-[10px] text-slate-400">رصيد {activeBranchLabel}:</div>
                          <div className={`font-black text-sm ${branchStock <= 5 && branchStock > 0 ? 'text-[color:var(--app-warn)]' : 'text-[color:var(--app-ok)]'}`}>
                            {branchStock} كرتونة
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold">
                            {branchStock <= 0 ? (
                              <span className="text-[color:var(--app-risk)] font-black">نفد بالفرع</span>
                            ) : branchStock <= 5 ? (
                              <span className="text-[color:var(--app-warn)] font-black">مخزون حرج (متاح {branchStock} ك)</span>
                            ) : (
                              <span>متاح للطلب: {branchReserved} كرتونة</span>
                            )}
                          </div>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-[color:var(--app-line)]">
                          <div className="text-[10px] text-slate-400">المخزن المركزي بأكتوبر:</div>
                          <div className="font-black text-sm text-[color:var(--app-navy)]">
                            {octoberStock} كرتونة
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold">
                            متاح للطلب: {octoberReserved} كرتونة
                          </div>
                        </div>
                      </div>

                      {/* All 7 Branches stock details table for Developer / Admin */}
                      {(currentUser?.role === 'developer' || currentUser?.role === 'admin') && (
                        <div className="pt-2 border-t border-slate-200/80">
                          <div className="text-[11px] font-black text-slate-800 mb-1.5 flex items-center gap-1">
                            <span>تفصيل أرصدة الفروع الـ 7 والمخزن المركزي:</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                            {branches.map((b) => {
                              const bStock = getBranchStockForProduct(selectedProductForModal, b.name);
                              const isOctober = b.name.includes('أكتوبر');
                              return (
                                <div
                                  key={b.id}
                                  className={`p-1.5 rounded-lg border ${
                                    isOctober
                                      ? 'bg-[#f7f0e1] border-[#e6d9b8] text-[color:var(--app-warn)] font-black'
                                      : bStock > 0
                                      ? 'bg-[#e8f3ee] border-[rgba(46,125,91,.22)] text-[color:var(--app-ok)]'
                                      : 'bg-white border-slate-200 text-slate-500'
                                  }`}
                                >
                                  <div className="truncate font-bold" title={b.name}>
                                    {b.name.replace('فرع ', '')}
                                  </div>
                                  <div className="font-black text-xs">
                                    {bStock} ك
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Pricing Box (Carton Price Only) */}
                <div className="bg-[#fdf8ed] p-3.5 rounded-2xl border border-[#e8dcba] space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-xs text-slate-700 font-black">سعر الكرتونة بالجملة (المعتمد):</div>
                      <div className="text-xl font-black text-[#8a6420] tabular-nums">
                        {isConfidentialMode ? (
                              <span className="font-mono text-slate-400 text-sm tracking-widest bg-white px-2.5 py-1 rounded-[10px]">•••••• ج.م (محمي)</span>
                        ) : (
                          formatCurrency(selectedProductForModal.cartonPrice)
                        )}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] text-slate-500 font-bold">شدة الكرتونة:</div>
                      <div className="text-xs font-black bg-white text-[color:var(--app-navy)] border border-[color:var(--app-line)] px-2 py-0.5 rounded-lg tabular-nums">
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
                  {(() => {
                    const branchStock = getBranchStockForProduct(selectedProductForModal, currentActiveBranch);
                    const branchAvail = Math.max(0, branchStock);
                    const octoberAvail = Math.max(0, typeof selectedProductForModal.mainWarehouseReserved === 'number'
                      ? selectedProductForModal.mainWarehouseReserved
                      : (selectedProductForModal.mainWarehouseActual || 0));
                    const totalAvail = branchAvail + octoberAvail;
                    const isFromOctober = branchAvail <= 0 && octoberAvail > 0;
                    const isCriticalStock = branchAvail <= 5 && branchAvail > 0;

                    if (totalAvail > 0) {
                      return (
                        <div className="space-y-2">
                          {isCriticalStock && (
                            <div className="bg-[#f7f0e1] text-[color:var(--app-warn)] border border-[#e6d9b8] p-2.5 rounded-xl text-xs font-black flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-[color:var(--app-warn)] shrink-0" />
                              <span><strong>هامش الأمان:</strong> رصيد الصنف حرج ({branchAvail} كرتونة فقط متبقية بالفرع) - يُرجى التأكد من مسؤولي الفرع قبل تأكيد البيع.</span>
                            </div>
                          )}
                          {isFromOctober && (
                            <div className="bg-[#e8f1fa] text-[#1e5f9d] border border-[#cfe0f0] p-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                              <Truck className="w-4 h-4 text-[#1e5f9d] shrink-0" />
                              <span>الصنف غير متوفر بالفرع وسيتم سحبه وتحويله من مخزن أكتوبر المركزي مباشرة.</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <div className="flex items-center bg-[#f8fbfe] rounded-[10px] border border-[color:var(--app-line)] p-1 shrink-0">
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
                                max={Math.max(1, totalAvail)}
                                value={getCardState(selectedProductForModal.id).quantity}
                                onChange={(e) => {
                                  setCardQuantityDirect(selectedProductForModal.id, parseInt(e.target.value, 10), totalAvail);
                                }}
                                className="w-14 text-center font-black text-sm text-slate-900 bg-white border border-[color:var(--app-line)] rounded-lg h-8"
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
                              className={`flex-1 font-black py-3 px-3 rounded-[10px] shadow-md text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
                                isFromOctober
                                  ? 'bg-[#1e5f9d] hover:bg-[#184f84] text-white'
                                  : 'bg-[color:var(--app-navy)] hover:bg-[#0d2340] text-white'
                              }`}
                            >
                              <ShoppingCart className="w-4 h-4" />
                              <span>
                                {isFromOctober
                                  ? `طلب ${getCardState(selectedProductForModal.id).quantity} كرتونة من مخزن أكتوبر`
                                  : `أضف ${getCardState(selectedProductForModal.id).quantity} كرتونة للطلبية`}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <button
                        disabled
                        className="w-full bg-[#fdf5f5] border border-[rgba(179,74,74,.3)] text-[color:var(--app-risk)] font-bold py-3 rounded-[10px] text-xs cursor-not-allowed"
                      >
                        الصنف غير متاح للطلب (بدون مخزون بالفرع أو بأكتوبر)
                      </button>
                    );
                  })()}
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

      {/* Right Flexible Sidebar Panel - Slide-in from Right (Amazon / Taager / Raneen Style) */}
      {rightPanelOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm flex items-center justify-end animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setRightPanelOpen(false); }}>
          {/* Backdrop Click to Close */}
          <div className="absolute inset-0 z-0" />
          <div className={`relative z-10 w-full md:w-96 lg:w-100 h-full bg-white shadow-2xl border-l border-[color:var(--app-line)] transform transition-transform duration-300 ease-out flex flex-col animate-in slide-in-from-right-4 sm:unrounded-sm`}>
            {/* Panel Header */}
            <div className="bg-white p-4 sm:p-5 border-b border-[color:var(--app-line)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#0f233d] text-[var(--app-accent)] flex items-center justify-center font-black shadow-sm shrink-0">
                  {rightPanelType === 'product' ? <Package /> : rightPanelType === 'cart' ? <ShoppingCart /> : <User />}
                </div>
                <div>
                  <span className="text-[10px] font-black tracking-wider uppercase text-[#8a6420] bg-[#fffdf7] px-2 py-0.5 rounded border border-amber-200">
                    {rightPanelType === 'product' ? 'تفاصيل الصنف' : rightPanelType === 'cart' ? 'سلة الطلبية' : 'معلومات العميل'}
                  </span>
                  <h3 className="text-sm font-black text-slate-900 leading-tight">
                    {rightPanelType === 'product' ? (rightPanelData as Product)?.name || 'الصنف المختار' : rightPanelType === 'cart' ? 'مراجعة الأصناف قبل الدفع' : (rightPanelData as Customer)?.name || 'العميل المختار'}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setRightPanelOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-50 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Panel Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Product Details Panel */}
              {rightPanelType === 'product' && rightPanelData && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="h-48 bg-slate-50 rounded-3xl overflow-hidden border border-slate-200 flex items-center justify-center relative">
                      <ProductImage
                        product={rightPanelData as Product}
                        cloudinaryConfig={cloudinaryConfig}
                        targetSize={600}
                        sizeVariant="card"
                        containerClassName="w-full h-full"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 right-2 bg-white/95 text-[#657b93] border border-[color:var(--app-line)] font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg backdrop-blur-sm">
                        {(rightPanelData as Product).code}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <Tag className="w-3 h-3 shrink-0" />
                        <span>القسم / المجموعة</span>
                      </div>
                      <span className="text-sm text-slate-700 font-medium">{ (rightPanelData as Product).department || (rightPanelData as Product).category || 'عام' }</span>

                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <Warehouse className="w-3 h-3 shrink-0" />
                        <span>الكود الموحد</span>
                      </div>
                      <span className="text-sm font-mono font-black text-[#1e5f9d]">
                        #{(rightPanelData as Product).unifiedCode?.replace('#', '') || '—'}
                      </span>

                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <Barcode className="w-3 h-3 shrink-0" />
                        <span>الباركود</span>
                      </div>
                      <span className="text-sm text-slate-700 font-medium">{ (rightPanelData as Product).barcode || 'غير متاح' }</span>
                    </div>
                  </div>

                  {/* Stock & Pricing */}
                  <div className="bg-[#f8fbfe] border border-[color:var(--app-line)] rounded-3xl p-4 shadow-sm">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">
                      <span>رصيد الفرع</span>
                      <span className={getProductBranchStock(rightPanelData as Product) > 0 ? 'text-[color:var(--app-ok)] font-black' : 'text-[color:var(--app-risk)] font-bold'}>
                        {getProductBranchStock(rightPanelData as Product)} كرتونة
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase mb-3">
                      <span>مخزن أكتوبر المركزي</span>
                      <span className="text-[#1e5f9d] font-black">
                        {(rightPanelData as Product).mainWarehouseActual || 0} كرتونة
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-[color:var(--app-muted)] font-bold block uppercase">سعر الكرتونة</span>
                        <span className="text-[color:var(--app-navy)] font-black tabular-nums text-lg">{formatCurrency((rightPanelData as Product).cartonPrice)} ج</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[color:var(--app-muted)] font-bold block uppercase">سعر القطعة</span>
                        <span className="text-xs font-extrabold text-slate-700 tabular-nums">{formatCurrency((rightPanelData as Product).piecePrice)} ج</span>
                      </div>
                    </div>
                    {(rightPanelData as Product).promoPrice && (
                      <div className="mt-3 bg-[#fdf5f5] border border-[rgba(179,74,74,.25)] rounded-[10px] p-3 flex items-center gap-2">
                        <Flame className="w-4 h-4 text-[color:var(--app-risk)] shrink-0" />
                        <div>
                          <span className="text-[10px] text-[color:var(--app-risk)] font-bold block uppercase">سعر العرض للكرتونة</span>
                          <span className="font-black text-[color:var(--app-risk)] tabular-nums">{formatCurrency((rightPanelData as Product).promoPrice)} ج</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Add from Panel */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase mb-2">
                      <span>الكمية والوحدة</span>
                    </div>
                    <div className="flex items-center bg-[#f8fbfe] rounded-[10px] border border-[color:var(--app-line)] p-0.5 shrink-0 w-full max-w-xs">
                      <button
                        type="button"
                        disabled={getProductBranchStock(rightPanelData as Product) <= 0 || getCardState((rightPanelData as Product).id).quantity <= 1}
                        onClick={() => adjustCardQuantity((rightPanelData as Product).id, -1)}
                        className="w-10 h-10 flex items-center justify-center text-slate-800 active:bg-[#eef3f9] rounded-[8px] font-black disabled:opacity-30 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        disabled={getProductBranchStock(rightPanelData as Product) <= 0}
                        value={getCardState((rightPanelData as Product).id).quantity}
                        onChange={(e) => {
                          const parsed = parseInt(e.target.value, 10);
                          setCardQuantityDirect((rightPanelData as Product).id, parsed);
                        }}
                        className="w-12 text-center font-black text-sm text-slate-950 bg-white border border-[color:var(--app-line)] rounded-[8px] tabular-nums"
                      />
                      <button
                        type="button"
                        disabled={getProductBranchStock(rightPanelData as Product) <= 0}
                        onClick={() => adjustCardQuantity((rightPanelData as Product).id, 1)}
                        className="w-10 h-10 flex items-center justify-center text-slate-800 active:bg-[#eef3f9] rounded-[8px] font-black disabled:opacity-30 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateCardType((rightPanelData as Product).id, 'carton')}
                        className={`flex-1 h-11 rounded-[10px] transition cursor-pointer text-center text-xs font-bold ${
                          getCardState((rightPanelData as Product).id).type === 'carton'
                            ? 'bg-[color:var(--app-navy)] text-white font-black shadow-sm'
                            : 'text-[color:var(--app-muted)] hover:text-slate-900'
                        }`}
                      >
                        كرتونة
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCardType((rightPanelData as Product).id, 'piece')}
                        className={`flex-1 h-11 rounded-[10px] transition cursor-pointer text-center text-xs font-bold ${
                          getCardState((rightPanelData as Product).id).type === 'piece'
                            ? 'bg-[color:var(--app-navy)] text-white font-black shadow-sm'
                            : 'text-[color:var(--app-muted)] hover:text-slate-900'
                        }`}
                      >
                        قطعة
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={getProductBranchStock(rightPanelData as Product) <= 0}
                      onClick={() => {
                        const count = getCardState((rightPanelData as Product).id).quantity;
                        handleDirectAdd(rightPanelData as Product, 'carton', count);
                        setRightPanelOpen(false);
                        setAddedItemToast({ name: (rightPanelData as Product).name, count: `${count} ${getCardState((rightPanelData as Product).id).type === 'carton' ? 'كرتونة' : 'قطعة'}` });
                        setTimeout(() => setAddedItemToast(null), 2500);
                      }}
                      className="w-full bg-[color:var(--app-navy)] hover:bg-[#0d2340] active:scale-[0.98] text-white font-black h-11 px-3 rounded-[10px] text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ShoppingCart className="w-4 h-4 stroke-[2.5] shrink-0" />
                      <span className="font-black tracking-wide whitespace-nowrap">أضف للطلبية</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Cart Summary Panel */}
              {rightPanelType === 'cart' && (
                <div className="space-y-4">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <ShoppingCart className="w-3 h-3 shrink-0" />
                    <span>{cart.length} صنف في سلة الطلبية</span>
                  </div>
                  {cart.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <Package className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                      <p className="text-sm font-medium">سلة الطلبية فارغة حالياً</p>
                      <p className="text-xs text-slate-400 mt-1">أضف أصناف من الكتالوج لبدء طلبك.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                      {cart.map((item) => (
                        <div key={item.product.id} className="flex items-center justify-between gap-3 p-3 bg-white border border-slate-100 rounded-2xl shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#f2f6fa] overflow-hidden flex items-center justify-center border border-slate-200">
                              <ProductImage
                                product={item.product}
                                cloudinaryConfig={cloudinaryConfig}
                                targetSize={200}
                                sizeVariant="thumbnail"
                                containerClassName="w-full h-full"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-black text-slate-900 text-sm truncate">{item.product.name}</div>
                              <div className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                                <span>{item.product.code}</span>
                                {item.product.unifiedCode && <span className="text-[#1e5f9d]">#{item.product.unifiedCode.replace('#', '')}</span>}
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                                {item.cartonCount} كرتونة • {item.pieceCount} قطعة
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-slate-900 tabular-nums text-sm">{formatCurrency(item.totalPrice)} ج</div>
                            <div className="text-[10px] text-slate-400 font-medium">{item.totalPieces} قطعة إجمالاً</div>
                          </div>
                        </div>
                      ))}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                        <span>الإجمالي الفرعي</span>
                        <span className="text-slate-900">{formatCurrency(cartSummary.subtotal)} ج</span>
                      </div>
                      {cartSummary.discountAmount > 0 && (
                        <div className="flex items-center justify-between text-xs text-[color:var(--app-risk)] font-bold mb-2">
                          <span>الخصم</span>
                          <span>- {formatCurrency(cartSummary.discountAmount)} ج</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm font-black text-[color:var(--app-navy)] pt-2 border-t border-slate-100">
                        <span>الإجمالي النهائي</span>
                        <span className="tabular-nums">{formatCurrency(cartSummary.grandTotal)} ج</span>
                      </div>
                    </div>
                    <div className="mt-4">
                      <button
                        onClick={() => setIsCartDrawerOpen(true)}
                        className="w-full bg-[color:var(--app-navy)] hover:bg-[#0d2340] text-white font-black py-3 rounded-[10px] text-sm shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>عرض السلة completa وتأكيد الطلب</span>
                      </button>
                    </div>
                  </div>)}
                </div>
              )}

              {/* Customer Info Panel */}
              {rightPanelType === 'customer' && rightPanelData && (
                <div className="space-y-4">
                  <div className="bg-[#fdf8ed] border border-[#e8dcba] rounded-3xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-2xl bg-[color:var(--app-navy)] text-[color:var(--app-accent)] flex items-center justify-center font-black shrink-0 shadow-sm">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">اسم العميل / المحل</div>
                        <div className="font-black text-slate-950 text-sm">{ (rightPanelData as Customer).name }</div>
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                          { (rightPanelData as Customer).code && `كود العميل: ${(rightPanelData as Customer).code}` }
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 p-2.5 rounded-[10px]">
                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">الفرع</div>
                        <div className="text-sm font-bold text-slate-900">{ (rightPanelData as Customer).branchName }</div>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-[10px]">
                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">المندوب المسؤول</div>
                        <div className="text-sm font-bold text-slate-900">{ (rightPanelData as Customer).salesRepName || (rightPanelData as Customer).repName || '—' }</div>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-[10px]">
                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">الهاتف</div>
                        <div className="text-sm font-bold text-slate-900">{ (rightPanelData as Customer).phone }</div>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-[10px]">
                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">المديونية الحالية</div>
                        <div className="text-sm font-black text-[color:var(--app-risk)] tabular-nums">
                          {isConfidentialMode ? '•••••• (محمي)' : formatCurrency((rightPanelData as Customer).currentBalance || 0)} ج
                        </div>
                      </div>
                    </div>
                    {(rightPanelData as Customer).address && (
                      <div className="mt-3 bg-white border border-slate-100 rounded-[10px] p-3">
                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">العنوان</div>
                        <div className="text-sm text-slate-700 font-medium">{ (rightPanelData as Customer).address }</div>
                      </div>
                    )}
                    {(rightPanelData as Customer).notes && (
                      <div className="mt-3 bg-[#f2f6fa] border border-[color:var(--app-line)] rounded-[10px] p-3">
                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">ملاحظات</div>
                        <div className="text-sm text-slate-700 font-medium">{ (rightPanelData as Customer).notes }</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setRightPanelType('cart'); setRightPanelData(null); }}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-[10px] text-sm transition cursor-pointer"
                    >
                      عرض السلة
                    </button>
                    <button
                      onClick={() => { setIsCartDrawerOpen(true); setRightPanelOpen(false); }}
                      className="flex-1 bg-[color:var(--app-navy)] hover:bg-[#0d2340] text-white font-bold py-2.5 rounded-[10px] text-sm transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      <span>إتمام الطلب</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox / Zoom (اضغط على صورة أي منتج لتكبيرها) */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxImage(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="تكبير صورة المنتج"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition cursor-pointer flex items-center justify-center"
            aria-label="إغلاق التكبير"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Image */}
          <div className="relative flex items-center justify-center max-w-[90vh] max-h-[90vh]">
            <img
              src={lightboxImage.src}
              alt={lightboxImage.alt}
              className="max-w-[85vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain bg-white p-2 border border-white/20"
              loading="lazy"
              decoding="async"
            />

            {/* Zoom hint for mobile */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-md animate-pulse opacity-80">
              اضغط على الصورة أو في أي مكان خارجها للإغلاق
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
