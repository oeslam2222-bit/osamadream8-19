import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
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
  Download,
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
  Clock,
  Maximize2
} from 'lucide-react';
import React, { useMemo, useState, useEffect, useDeferredValue } from 'react';
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
import { countDuplicateProductRows } from '../services/productIdentity';
import { Customer, ItemStatus, Product, SalesPriority, ParentProduct, ProductVariant } from '../types';
import { DepartmentCategorySlicer } from './DepartmentCategorySlicer';
import { getDepartmentMeta } from '../data/departmentMeta';
import { getBranchStockForProduct, normalizeArabicText, CANONICAL_BRANCHES, MAIN_BRANCH_NAME } from '../services/arabicMatchingService';
import { groupProductsIntoParents } from '../services/productVariantService';
import { ProductVariantModal } from './ProductVariantModal';
import { PosCashierSidebar } from './PosCashierSidebar';

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

  // Lazy & Smart Cashier View States
  const [showAllExplicitly, setShowAllExplicitly] = useState(true);
  const [isMobileCashierOpen, setIsMobileCashierOpen] = useState(false);

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

  // Auto-open mobile cashier drawer when customer is selected so user sees their financial details immediately
  useEffect(() => {
    if (selectedCustomer && typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsMobileCashierOpen(true);
    }
  }, [selectedCustomer]);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOfficialDept, setSelectedOfficialDept] = useState<string>('الكل');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('الكل');
  const [selectedPriority, setSelectedPriority] = useState<string>('الكل');
  const [selectedStatus, setSelectedStatus] = useState<string>('الكل');
  const [stockAvailabilityFilter, setStockAvailabilityFilter] = useState<
    'all' | 'offers' | 'in_branch' | 'in_warehouse' | 'low_stock' | 'out_of_stock' | 'out_of_branch_only' | 'high_stock'
  >('all');
  const [sortBy, setSortBy] = useState<
    'default' | 'branch_stock_desc' | 'branch_stock_asc' | 'october_stock_desc' | 'october_stock_asc' | 'total_stock_desc' | 'priority' | 'price_asc' | 'price_desc' | 'name_asc'
  >('default');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [gridDensity, setGridDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isSearchSuggestionsOpen, setIsSearchSuggestionsOpen] = useState(false);

  // Role permissions: ONLY Developer and Admin can upload or wipe catalog data
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  // Modals & UI States
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [selectedParentForModal, setSelectedParentForModal] = useState<ParentProduct | null>(null);
  const [isParentGroupingEnabled, setIsParentGroupingEnabled] = useState<boolean>(true);
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

  // Active selected window/variant on parent cards
  const [cardSelectedVariant, setCardSelectedVariant] = useState<Record<string, string>>({});

  const getParentActiveVariant = (parent: ParentProduct): ProductVariant => {
    const selectedId = cardSelectedVariant[parent.id];
    if (selectedId) {
      const found = parent.variants.find((v) => v.id === selectedId);
      if (found) return found;
    }
    // When searching, auto-surface the variant or window that matches the search query
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase().trim();
      const clean = query.replace('#', '').trim();
      const matchingVariant = parent.variants.find(
        (v) =>
          v.name.toLowerCase().includes(query) ||
          v.code.toLowerCase().includes(clean) ||
          v.code.toLowerCase().includes(query) ||
          (v.color && v.color.toLowerCase().includes(query))
      );
      if (matchingVariant) return matchingVariant;
    }
    return parent.defaultVariant || parent.variants[0];
  };

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

  /**
   * رسالة نجاح الاستيراد بتقول صراحةً كام صف اتقرأ وكام صنف فعلي.
   *
   * من غير كده المستخدم بيشوف «تم استيراد 5,800 صنف» ويفتكر إن التطبيق ضاع
   * منه حاجات وهو في الحقيقة بيشوف أكتر من اللازم. التكرار بيتحسب بنفس
   * مفتاح الدمج (`countDuplicateProductRows`) فالرقم مضمون إنه نفس اللي
   * الكتالوج هيتعرض بيه.
   */
  const describeImportResult = (parsed: Product[], sourceLabel: string): string => {
    const { duplicateRows, uniqueCount } = countDuplicateProductRows(parsed);
    const mergedNote =
      duplicateRows > 0
        ? ` — اتقرأ ${parsed.length.toLocaleString('ar-EG')} صف ودمجناهم في ${uniqueCount.toLocaleString('ar-EG')} صنف ` +
          `(${duplicateRows.toLocaleString('ar-EG')} صف مكرر بنفس الكود اتحدّث بدل ما يضاف جديد)`
        : '';
    return `تم استيراد ${uniqueCount.toLocaleString('ar-EG')} صنف ${sourceLabel} بنجاح وربط الصور والمخازن!${mergedNote}`;
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
        setUploadSuccess(describeImportResult(res.products, ''));
        // تحذيرات الصفوف اللي مفيهاش كود: بتظهر مع رسالة النجاح، مش بتلغيها،
        // لأن الاستيراد تمّ فعلاً — بس المستخدم لازم يعرف إن فيه صفوف
        // مش مضمونة الدمج بتاعها.
        if (res.errors.length > 0) {
          setUploadError(res.errors.slice(0, 4).join(' • '));
        }
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
        setUploadSuccess(describeImportResult(res.products, 'من Google Sheets '));
        if (res.errors.length > 0) {
          setUploadError(res.errors.slice(0, 4).join(' • '));
        }
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

  // Extract unique subcategories / families (العائلات / الفئات التابعة للمجموعة المختارة أو للكل)
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

  /**
   * المنتجات الظاهرة للصلاحية الحالية — memoized.
   *
   * `getVisibleProducts()` بتعمل `products.map(...)` وبترجّع **أوبجكت جديد لكل
   * صنف**. من غير memoization الـ array بياخد هوية جديدة في كل render،
   * فكل useMemo شايلها (subCategories, stock summaries, filteredProducts)
   * كان بيتحسب تاني من الصفر في كل ضغطة زر — وده سبب تقيل الصفحة.
   *
   * المدخلات الحقيقية هي الـ products وهوية المستخدم، فالثبات مضمون.
   * ملاحظة: getVisibleProducts نفسها مش في الـ deps عن قصد — هي function
   * جديدة كل render، وحطّها كانت هتكسر الـ memoization.
   */
  const visibleProducts = useMemo(
    () => getVisibleProducts(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, currentUser?.id, currentUser?.role, currentUser?.branchName]
  );

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

  /**
   * Branch stock resolved once per product per branch selection.
   *
   * getBranchStockForProduct walks the eight canonical branches and builds an
   * Object.keys() lookup on every call. The filter ran it per product and the
   * sort comparators ran it O(n log n) times, so a single sort over the catalog
   * meant tens of thousands of identical walks. One Map per pass removes all of it.
   */
  const branchStockMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleProducts.forEach((p) => {
      map.set(p.id, getBranchStockForProduct(p, currentActiveBranch));
    });
    return map;
  }, [visibleProducts, currentActiveBranch]);

  const stockOf = (p: Product): number => {
    const cached = branchStockMap.get(p.id);
    return cached === undefined ? getBranchStockForProduct(p, currentActiveBranch) : cached;
  };

/**
   * Normalized search haystack per product, built once per catalog instead of
   * re-normalizing a dozen fields on every keystroke. Arabic-insensitive search
   * (أحمد / احمد, ألبان / البان, فايه / فاي) comes from the same normalizer the
   * rest of the app already uses for matching.
   *
   * The compact form (all spaces removed) is indexed alongside the plain one so
   * "عبدالفتاح" still finds "عبد الفتاح": the shared normalizer's compound-name
   * rules rely on \b, which never matches inside Arabic text, so they are inert.
   * Fixing that belongs in the matcher itself, not in a catalog search box.
   */
  const productSearchIndex = useMemo(() => {
    const map = new Map<string, string>();
    visibleProducts.forEach((p) => {
      const normalized = normalizeArabicText(
        [
          p.code,
          p.unifiedCode,
          p.name,
          p.category,
          p.department,
          p.color,
          p.barcode,
          p.itemGroup,
          p.familyName,
          p.classification,
        ]
          .filter(Boolean)
          .join(' ')
      );
      map.set(p.id, `${normalized} ${normalized.replace(/\s+/g, '')}`);
    });
    return map;
  }, [visibleProducts]);

  // Typing stays responsive: the heavy filter runs against the settled value.
  const deferredSearchTerm = useDeferredValue(searchTerm);

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
      const branchStock = stockOf(p);
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

  // ===== مخزون أكتوبر + إجمالي المخزون في كل الفروع (الأدمن فقط) =====
  const [warehousePanelOpen, setWarehousePanelOpen] = useState(false);
  const [warehouseProductId, setWarehouseProductId] = useState<string | null>(null);

  const warehouseSummary = useMemo(() => {
    let octoberTotal = 0;
    let allBranchesTotal = 0;
    let withOctoberStock = 0;

    CANONICAL_BRANCHES.forEach((branch) => {
      visibleProducts.forEach((p) => {
        const stock = getBranchStockForProduct(p, branch);
        if (stock > 0) {
          allBranchesTotal += stock;
          if (branch === MAIN_BRANCH_NAME) {
            octoberTotal += stock;
            withOctoberStock++;
          }
        }
      });
    });

    return { octoberTotal, allBranchesTotal, withOctoberStock };
  }, [visibleProducts]);

  // تفصيل مخزون المنتج الواحد عبر كل الفروع
  const warehouseProductBreakdown = useMemo(() => {
    if (!warehouseProductId) return [];
    const product = visibleProducts.find((p) => p.id === warehouseProductId);
    if (!product) return [];

    return CANONICAL_BRANCHES.map((branch) => ({
      branch,
      stock: getBranchStockForProduct(product, branch),
    }));
  }, [warehouseProductId, visibleProducts]);

  const warehouseProductTotals = useMemo(
    () => warehouseProductBreakdown.reduce(
      (acc, b) => ({ october: acc.october + (b.branch === MAIN_BRANCH_NAME ? b.stock : 0), total: acc.total + b.stock }),
      { october: 0, total: 0 }
    ),
    [warehouseProductBreakdown]
  );

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    let result = visibleProducts.filter((p) => {
      // Search match (Arabic-normalized, so أ/ا ة/ه ى/ي and tashkeel do not matter)
      if (deferredSearchTerm.trim()) {
        const query = normalizeArabicText(deferredSearchTerm);
        const cleanQuery = query.replace(/\s+/g, ' ').trim();
        if (query) {
          const haystack = productSearchIndex.get(p.id) || '';
          const compactQuery = query.replace(/\s+/g, '');
          const codeNeedle = p.code ? normalizeArabicText(p.code) : '';
          const codeMatch = codeNeedle.includes(query) || codeNeedle.includes(compactQuery);
          const unifiedNeedle = p.unifiedCode ? normalizeArabicText(p.unifiedCode) : '';
          const unifiedMatch = Boolean(unifiedNeedle && (unifiedNeedle.includes(query) || unifiedNeedle.includes(compactQuery)));
          const barcodeMatch = Boolean(p.barcode && p.barcode.includes(deferredSearchTerm.trim()));

          if (
            !codeMatch &&
            !unifiedMatch &&
            !barcodeMatch &&
            !haystack.includes(query) &&
            !haystack.includes(compactQuery)
          ) {
            return false;
          }
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
      const bStock = stockOf(p);
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
      result.sort((a, b) => stockOf(b) - stockOf(a));
    } else if (sortBy === 'branch_stock_asc') {
      result.sort((a, b) => stockOf(a) - stockOf(b));
    } else if (sortBy === 'october_stock_desc') {
      result.sort((a, b) => (b.mainWarehouseActual || 0) - (a.mainWarehouseActual || 0));
    } else if (sortBy === 'october_stock_asc') {
      result.sort((a, b) => (a.mainWarehouseActual || 0) - (b.mainWarehouseActual || 0));
    } else if (sortBy === 'total_stock_desc') {
      result.sort((a, b) => {
        const totalB = stockOf(b) + (b.mainWarehouseActual || 0);
        const totalA = stockOf(a) + (a.mainWarehouseActual || 0);
        return totalB - totalA;
      });
    } else if (sortBy === 'price_asc') {
      result.sort((a, b) => a.piecePrice - b.piecePrice);
    } else if (sortBy === 'price_desc') {
      result.sort((a, b) => b.piecePrice - a.piecePrice);
    } else if (sortBy === 'priority') {
      const pWeights: Record<SalesPriority, number> = { 'مرتفع': 4, 'متوسط': 3, 'عادي': 2, 'منخفض': 1 };
      result.sort((a, b) => (pWeights[b.salesPriority] || 0) - (pWeights[a.salesPriority] || 0));
    } else if (sortBy === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }

    return result;
  }, [
    // visibleProducts جواه memoized بـ products + هوية المستخدم، فبيغطي الاتنين.
    visibleProducts,
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

  // Group all visible products into Parent Products with Variants / Windows (~3,444 products from 5,444 items)
  const parentProducts = useMemo(() => {
    return groupProductsIntoParents(products);
  }, [products]);

  // Department / Item Group item count helper - synced with parent products consolidation
  const deptCounts = useMemo(() => {
    const listToCount = isParentGroupingEnabled ? parentProducts : products;
    const counts: Record<string, number> = { 'الكل': listToCount.length };
    dynamicItemGroups.forEach((dept) => {
      counts[dept] = 0;
    });

    listToCount.forEach((p) => {
      const pGrp = (p.itemGroup || p.department || p.category || '').trim();
      if (pGrp && counts[pGrp] !== undefined) {
        counts[pGrp] = (counts[pGrp] || 0) + 1;
      }
    });

    return counts;
  }, [products, parentProducts, dynamicItemGroups, isParentGroupingEnabled]);

  // Filtered & Sorted Parent Products (Consolidated 3,444 products)
  const filteredParentProducts = useMemo(() => {
    if (!isParentGroupingEnabled) return [];

    let result = parentProducts.filter((p) => {
      // Search match across parent attributes AND any of its variants
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const cleanQuery = query.replace('#', '').trim();

        const codeMatch = p.primaryCode.toLowerCase().includes(query) || p.primaryCode.toLowerCase().includes(cleanQuery);
        const unifiedMatch = Boolean(
          p.unifiedCode && (
            p.unifiedCode.toLowerCase().includes(cleanQuery) ||
            p.unifiedCode.toLowerCase().includes(query)
          )
        );
        const nameMatch = p.name.toLowerCase().includes(query);
        const catMatch = p.category?.toLowerCase().includes(query);
        const deptMatch = p.department?.toLowerCase().includes(query);

        // Check if any child variant matches code, color, or window name
        const variantMatch = p.variants.some((v) =>
          v.code.toLowerCase().includes(query) ||
          v.name.toLowerCase().includes(query) ||
          v.color.toLowerCase().includes(query)
        );

        if (!codeMatch && !unifiedMatch && !nameMatch && !catMatch && !deptMatch && !variantMatch) {
          return false;
        }
      }

      // Official Brand / Item Group Filter
      if (selectedOfficialDept !== 'الكل') {
        const target = selectedOfficialDept.toLowerCase().trim();
        const pDept = (p.department || p.category || '').toLowerCase().trim();
        if (!pDept.includes(target)) return false;
      }

      // Sub-category / Family Name Filter
      if (selectedSubCategory !== 'الكل') {
        const targetSub = selectedSubCategory.toLowerCase().trim();
        const pFamily = (p.familyName || '').toLowerCase().trim();
        const pClass = (p.classification || '').toLowerCase().trim();
        const pCat = (p.category || '').toLowerCase().trim();

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

      // Stock availability
      const bStock = p.totalBranchStock;
      const oStock = p.totalOctoberStock;
      if (stockAvailabilityFilter === 'offers') {
        const hasOffer = p.variants.some((v) => Boolean(v.promoPrice && v.promoPrice > 0));
        if (!hasOffer) return false;
      } else if (stockAvailabilityFilter === 'out_of_stock') {
        if (bStock > 0 || oStock > 0) return false;
      } else if (stockAvailabilityFilter === 'out_of_branch_only') {
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

    // Sorting
    if (sortBy === 'branch_stock_desc') {
      result.sort((a, b) => b.totalBranchStock - a.totalBranchStock);
    } else if (sortBy === 'branch_stock_asc') {
      result.sort((a, b) => a.totalBranchStock - b.totalBranchStock);
    } else if (sortBy === 'october_stock_desc') {
      result.sort((a, b) => b.totalOctoberStock - a.totalOctoberStock);
    } else if (sortBy === 'october_stock_asc') {
      result.sort((a, b) => a.totalOctoberStock - b.totalOctoberStock);
    } else if (sortBy === 'total_stock_desc') {
      result.sort((a, b) => (b.totalBranchStock + b.totalOctoberStock) - (a.totalBranchStock + a.totalOctoberStock));
    } else if (sortBy === 'price_asc') {
      result.sort((a, b) => a.minPrice - b.minPrice);
    } else if (sortBy === 'price_desc') {
      result.sort((a, b) => b.minPrice - a.minPrice);
    } else if (sortBy === 'priority') {
      const pWeights: Record<SalesPriority, number> = { 'مرتفع': 4, 'متوسط': 3, 'عادي': 2, 'منخفض': 1 };
      result.sort((a, b) => (pWeights[b.salesPriority] || 0) - (pWeights[a.salesPriority] || 0));
    } else if (sortBy === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }

    return result;
  }, [
    parentProducts,
    isParentGroupingEnabled,
    searchTerm,
    selectedOfficialDept,
    selectedSubCategory,
    selectedPriority,
    selectedStatus,
    stockAvailabilityFilter,
    sortBy,
  ]);

  // Smart Search Auto-Suggestions Engine (اقتراحات البحث الذكية بالاسم والكود)
  const searchSuggestions = useMemo(() => {
    const rawQ = searchTerm.trim();
    if (rawQ.length === 0) return [];

    const normQ = normalizeArabicText(rawQ);
    const cleanCodeQ = rawQ.replace(/^#/, '').toLowerCase();

    const results: Array<{
      id: string;
      title: string;
      code: string;
      unifiedCode?: string;
      variantsCount: number;
      department?: string;
      category?: string;
      parent: ParentProduct;
      matchedType: 'name' | 'code' | 'unified' | 'color';
      matchedHighlight: string;
    }> = [];

    const seenCodes = new Set<string>();

    for (const parent of parentProducts) {
      if (results.length >= 4) break;

      const normName = normalizeArabicText(parent.name || '');
      const rawCode = (parent.primaryCode || '').toLowerCase();
      const rawUnified = (parent.unifiedCode || '').toLowerCase().replace(/^#/, '');

      const isNameMatch = normName.includes(normQ);
      const isCodeMatch = rawCode.includes(cleanCodeQ);
      const isUnifiedMatch = rawUnified.includes(cleanCodeQ);

      const matchedVariant = parent.variants.find((v) => {
        const vCode = (v.code || '').toLowerCase();
        const vUnified = (v.unifiedCode || '').toLowerCase().replace(/^#/, '');
        const vColor = normalizeArabicText(v.color || '');
        return vCode.includes(cleanCodeQ) || vUnified.includes(cleanCodeQ) || vColor.includes(normQ);
      });

      if (isNameMatch || isCodeMatch || isUnifiedMatch || Boolean(matchedVariant)) {
        if (!seenCodes.has(parent.primaryCode)) {
          seenCodes.add(parent.primaryCode);
          results.push({
            id: parent.id,
            title: parent.name,
            code: parent.primaryCode,
            unifiedCode: matchedVariant?.unifiedCode || parent.unifiedCode,
            variantsCount: parent.variantsCount,
            department: parent.department,
            category: parent.category,
            parent,
            matchedType: isCodeMatch
              ? 'code'
              : isUnifiedMatch
              ? 'unified'
              : matchedVariant
              ? 'color'
              : 'name',
            matchedHighlight: matchedVariant?.color ? `${parent.name} (لون ${matchedVariant.color})` : parent.name,
          });
        }
      }
    }

    return results;
  }, [searchTerm, parentProducts]);

  const activeTotalItems = isParentGroupingEnabled ? filteredParentProducts.length : filteredProducts.length;

  /**
   * Rendering cap. "عرض الكل" used to mount one card per catalog row, which
   * froze low-end phones on a 3,000+ item catalog. Paging stays the default and
   * the "all" option is now a generous window instead of the entire table, so
   * the DOM stays bounded while the user can still scan a long flat list.
   */
  const MAX_RENDERED_ITEMS = 240;

  // Total pages and chunked display computation
  const effectiveItemsPerPage = itemsPerPage === 'all' ? MAX_RENDERED_ITEMS : itemsPerPage;

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(activeTotalItems / effectiveItemsPerPage));
  }, [activeTotalItems, effectiveItemsPerPage]);

  const displayedProducts = useMemo(() => {
    if (isParentGroupingEnabled) return [];
    const startIndex = (currentPage - 1) * effectiveItemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + effectiveItemsPerPage);
  }, [filteredProducts, currentPage, effectiveItemsPerPage, isParentGroupingEnabled]);

  const displayedParentProducts = useMemo(() => {
    if (!isParentGroupingEnabled) return [];
    const startIndex = (currentPage - 1) * effectiveItemsPerPage;
    return filteredParentProducts.slice(startIndex, startIndex + effectiveItemsPerPage);
  }, [filteredParentProducts, currentPage, effectiveItemsPerPage, isParentGroupingEnabled]);

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
    setShowAllExplicitly(false);
  };

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

      {/* Selected Customer Order Context Banner */}
      {selectedCustomer && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg border border-amber-300 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-950 text-amber-400 flex items-center justify-center font-black shrink-0 shadow-md">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5">
                <span>جاري إنشاء طلبية للعميل المختار:</span>
                <span className="bg-slate-950 text-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full">
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
                      <span className="bg-slate-900 text-amber-300 font-mono px-1.5 py-0.5 rounded text-[10px]">•••••• (محمي 🔒)</span>
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
                className="bg-slate-950 hover:bg-slate-900 active:scale-95 text-amber-400 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>معاينة الفاتورة وتأكيد الطلبية 🛒</span>
              </button>
            )}
            {onClearSelectedCustomer && (
              <button
                onClick={onClearSelectedCustomer}
                className="bg-slate-900/10 hover:bg-slate-900/20 text-slate-900 p-2 rounded-xl text-xs font-bold transition cursor-pointer"
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

      {/* Offline Image Cache & Data-Saver Bar (Works 100% Offline with Zero Data Consumption) */}
      <div className="bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-slate-100 border border-amber-300/60 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-xs">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-black text-slate-900">
                العمل بدون إنترنت (توفير الباقة وسرعة العرض للمناديب)
              </h4>
              <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                Offline Mode ⚡
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              اضغط زر التحميل لحفظ صور الأصناف بضغط فائق (حجم خفيف جداً) لعرضها على العملاء في أي مكان بدون شبكة وبدون استهلاك باقة الإنترنت.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-between sm:justify-end">
          <div className="text-right sm:text-left text-[11px] font-bold text-slate-700">
            <span>المحفوظ بالجهاز: </span>
            <strong className="text-emerald-700 font-black">{cacheStats.count} صورة</strong>
            {cacheStats.estimatedSizeMB > 0 && (
              <span className="text-[10px] text-slate-500 block sm:inline"> (~{cacheStats.estimatedSizeMB} ميجابايت فقط)</span>
            )}
          </div>

          <button
            onClick={handleCacheAllImages}
            disabled={isCaching || products.length === 0}
            className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-amber-300 font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition cursor-pointer active:scale-95"
            title="تحميل وضغط كل صور الأصناف للعمل بدون إنترنت"
          >
            {isCaching ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>جاري الحفظ ({products.length})...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>تحميل الصور أوفلاين 📲</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Cache Progress Notification */}
      {cacheProgressText && (
        <div className="p-3 bg-emerald-500 text-white text-xs rounded-xl font-bold flex items-center gap-2 shadow-md animate-in fade-in">
          <CheckCheck className="w-4 h-4 text-emerald-200 shrink-0" />
          <span>{cacheProgressText}</span>
        </div>
      )}

      {/* Active Branch Scope Indicator & Switcher for Admin / Developer / Sales Reps */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-100 border border-slate-300/80 rounded-2xl p-3 sm:p-3.5 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-xs">
            <Building className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">الفرع المعروض أرصدته حالياً:</span>
              <span className="bg-amber-400 text-slate-950 text-xs font-black px-2.5 py-0.5 rounded-lg shadow-2xs">
                {currentActiveBranch || 'الفرع الرئيسي (كل الفروع)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              كل مشرف ومندوب ومدير فرع يستعرض مخزون فرعه المسند إليه.
            </p>
          </div>
        </div>

        {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
          <div className="flex items-center gap-2">
            <label htmlFor="catalog-branch-select" className="text-xs font-bold text-slate-700 shrink-0">
              تبديل فرع العرض:
            </label>
            <select
              id="catalog-branch-select"
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="bg-white border border-slate-300 text-slate-900 font-black rounded-xl px-3 py-1.5 text-xs focus:ring-2 focus:ring-amber-400 focus:outline-none shadow-2xs"
            >
              <option value="الكل">الفرع الرئيسي (كل الفروع)</option>
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
      </div>

      {/* Amazon / Noon Style Sticky Search & Category Bar */}
      <div className="sticky top-14 sm:top-16 z-30 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-xl border border-slate-800 space-y-2.5">
        {/* Row 1: Search Bar & Quick View Controls */}
        <div className="flex items-center gap-2">
          {/* Main search input with Smart Auto-Suggestions */}
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsSearchSuggestionsOpen(true);
              }}
              onFocus={() => setIsSearchSuggestionsOpen(true)}
              onBlur={() => {
                // Short timeout to allow click on suggestion item to register
                setTimeout(() => setIsSearchSuggestionsOpen(false), 250);
              }}
              placeholder="ابحث بالاسم، كود الصنف، الماركة، أو الكود الموحد (#)..."
              className="w-full h-11 sm:h-12 pl-10 pr-10 bg-slate-800/90 text-white placeholder-slate-400 border border-slate-700 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setIsSearchSuggestionsOpen(false);
                }}
                className="absolute left-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white w-9 h-9 flex items-center justify-center cursor-pointer"
                aria-label="مسح البحث"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {/* Smart Auto-Suggestion Dropdown Popover */}
            {isSearchSuggestionsOpen && searchSuggestions.length > 0 && (
              <div className="absolute top-full mt-2 inset-x-0 bg-slate-900/98 border-2 border-amber-400/60 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-1 backdrop-blur-xl space-y-1">
                <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold text-amber-300 border-b border-slate-800">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>أقرب اقتراحات مطابقة ({searchSuggestions.length}):</span>
                  </span>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsSearchSuggestionsOpen(false);
                    }}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {searchSuggestions.map((sug) => (
                  <button
                    key={sug.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSearchTerm(sug.code);
                      setSelectedParentForModal(sug.parent);
                      setIsSearchSuggestionsOpen(false);
                    }}
                    className="w-full text-right p-2.5 rounded-xl hover:bg-slate-800 transition flex items-center justify-between gap-3 group cursor-pointer border border-transparent hover:border-slate-700"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-400/20 text-amber-300 flex items-center justify-center font-mono font-black text-xs shrink-0 border border-amber-400/30">
                        {sug.code}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white group-hover:text-amber-300 truncate transition">
                          {sug.matchedHighlight}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span>{sug.department || 'عام'}</span>
                          {sug.unifiedCode && (
                            <span className="font-mono text-amber-400/80">
                              كود موحد: {sug.unifiedCode}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-black bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded-lg border border-indigo-800">
                        {sug.variantsCount} {sug.variantsCount === 1 ? 'كود' : 'أكواد/ألوان'}
                      </span>
                      <ChevronLeft className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition transform group-hover:-translate-x-0.5" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Unified Products Active Badge (Consolidated Catalog with all Windows embedded) - visible on tablet/desktop, streamlined on mobile to prevent duplicate counts */}
          <div
            className="hidden sm:flex items-center bg-slate-800/90 px-3 py-1 rounded-xl border border-slate-700 h-11 shrink-0 gap-2.5"
            title={`نظام توفير المساحة الذكي: إجمالي ${products.length.toLocaleString()} شباك ولون مدمجة داخل ${parentProducts.length.toLocaleString()} كود أساسي دون أي صنف مفقود`}
          >
            <div className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-black shrink-0">
              <Boxes className="w-4 h-4" />
            </div>
            <div className="text-right">
              <div className="text-xs font-black text-amber-300 flex items-center gap-1.5 leading-tight">
                <span>{parentProducts.length.toLocaleString()} كود أساسي</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono font-black border border-emerald-500/30">
                  تضم {products.length.toLocaleString()} شباك ولون
                </span>
              </div>
              <div className="text-[9.5px] text-slate-400 hidden md:block">
                تجميع ذكي لتوفير المساحة: كل كود أساسي يضم كافة ألوانه وأكواده الموحدة
              </div>
            </div>
          </div>

          {/* View Mode Switcher (Grid Density / List) */}
          <div className="hidden sm:flex items-center bg-slate-800 p-0.5 rounded-xl border border-slate-700 h-11">
            <button
              type="button"
              onClick={() => {
                setViewMode('grid');
                setGridDensity('comfortable');
              }}
              className={`h-9 px-2.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center justify-center gap-1 ${
                viewMode === 'grid' && gridDensity === 'comfortable'
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="عرض مريح (بطاقة واسعة)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold">مريح</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('grid');
                setGridDensity('compact');
              }}
              className={`h-9 px-2.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center justify-center gap-1 ${
                viewMode === 'grid' && gridDensity === 'compact'
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="عرض مزدوج (بطاقتين بالصف)"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold">مزدوج</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`h-9 px-2.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center justify-center gap-1 ${
                viewMode === 'list'
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="عرض جدول"
            >
              <List className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold">جدول</span>
            </button>
          </div>
        </div>

        {/* Row 2: Categories Bar (Smooth Horizontal Scroll - Amazon/Noon Delivery App Style) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-0.5">
          <button
            type="button"
            onClick={() => {
              setSelectedOfficialDept('الكل');
              setSelectedSubCategory('الكل');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer shrink-0 ${
              selectedOfficialDept === 'الكل'
                ? 'bg-amber-400 text-slate-950 shadow-md scale-[1.02]'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white border border-slate-700/80'
            }`}
          >
            <span>كل الأصناف</span>
            <span className="mr-1 text-[10px] opacity-75">
              ({isParentGroupingEnabled ? parentProducts.length : products.length})
            </span>
          </button>

          {dynamicItemGroups.map((group) => {
            const isSelected = selectedOfficialDept === group;
            const count = deptCounts[group] || 0;
            return (
              <button
                key={group}
                type="button"
                onClick={() => {
                  setSelectedOfficialDept(isSelected ? 'الكل' : group);
                  setSelectedSubCategory('الكل');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-amber-400 text-slate-950 shadow-md scale-[1.02]'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white border border-slate-700/80'
                }`}
              >
                <span>{group}</span>
                <span className="mr-1 text-[10px] opacity-75">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Row 3: Product Family / Subcategory Bar (When a category is active) */}
        {selectedOfficialDept !== 'الكل' && subCategories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-1 border-t border-slate-800/80">
            <span className="text-[11px] text-amber-300 font-bold shrink-0 ml-1">العائلة / الفئة:</span>
            <button
              type="button"
              onClick={() => setSelectedSubCategory('الكل')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                selectedSubCategory === 'الكل'
                  ? 'bg-indigo-500 text-white font-black'
                  : 'bg-slate-800/90 text-slate-400 hover:text-white border border-slate-700'
              }`}
            >
              الكل
            </button>
            {subCategories.map((fam) => {
              const isFamSelected = selectedSubCategory === fam;
              return (
                <button
                  key={fam}
                  type="button"
                  onClick={() => setSelectedSubCategory(isFamSelected ? 'الكل' : fam)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                    isFamSelected
                      ? 'bg-indigo-500 text-white font-black'
                      : 'bg-slate-800/90 text-slate-300 hover:text-white border border-slate-700'
                  }`}
                >
                  {fam}
                </button>
              );
            })}
          </div>
        )}

        {/* Active Filter Count & Reset Button */}
        {(searchTerm || selectedOfficialDept !== 'الكل' || selectedSubCategory !== 'الكل') && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-xs">
            <span className="text-slate-300 font-bold">
              معروض <strong className="text-amber-300 font-black">{activeTotalItems}</strong> صنف
              {searchTerm && <span className="text-slate-400 text-[11px] mr-1">لبحث &quot;{searchTerm}&quot;</span>}
            </span>
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-amber-400 hover:text-amber-300 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>إلغاء والعودة للكل</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Responsive Grid: Product Catalog (Cols 1-8) + Sticky POS Cashier Sidebar (Cols 9-12 on Desktop) */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-5 items-start mt-4">
        {/* Left Main Catalog Column */}
        <div className="lg:col-span-8 xl:col-span-8.5 space-y-4">
          {/* ===== لوحة مخزون الفروع — الأدمن فقط ===== */}
      {isAdminOrDev && (
        <div className="bg-white rounded-3xl border-2 border-slate-800 shadow-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setWarehousePanelOpen((v) => !v)}
            className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 bg-slate-900 hover:bg-slate-800 transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shrink-0">
                <Warehouse className="w-5 h-5" />
              </div>
              <div className="text-right">
                <h3 className="font-black text-white text-sm sm:text-base">لوحة مخزون الفروع</h3>
                <p className="text-[10.5px] text-slate-400 font-bold">مخزون أكتوبر + إجمالي المخزون في كل الفروع</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 text-[11px] font-black font-mono">
                أكتوبر: {warehouseSummary.octoberTotal.toLocaleString()}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/15 text-white text-[11px] font-black font-mono">
                الإجمالي: {warehouseSummary.allBranchesTotal.toLocaleString()}
              </span>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${warehousePanelOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {warehousePanelOpen && (
            <div className="p-4 sm:p-5 space-y-4 animate-in fade-in">
              {/* بطاقات الملخص */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300">
                  <div className="text-[10.5px] font-black text-amber-700">مخزن أكتوبر (المركزي)</div>
                  <div className="text-2xl font-black font-mono text-amber-950 mt-1">
                    {warehouseSummary.octoberTotal.toLocaleString()}
                  </div>
                  <div className="text-[10px] font-bold text-amber-600 mt-0.5">
                    {warehouseSummary.withOctoberStock} صنف متوفر بالمخزن
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-100 border-2 border-slate-300">
                  <div className="text-[10.5px] font-black text-slate-600">إجمالي المخزون (كل الفروع)</div>
                  <div className="text-2xl font-black font-mono text-slate-900 mt-1">
                    {warehouseSummary.allBranchesTotal.toLocaleString()}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                    {CANONICAL_BRANCHES.length} فروع
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-300">
                  <div className="text-[10.5px] font-black text-emerald-700">أكتوبر كنسبة من الإجمالي</div>
                  <div className="text-2xl font-black font-mono text-emerald-950 mt-1">
                    {warehouseSummary.allBranchesTotal > 0
                      ? Math.round((warehouseSummary.octoberTotal / warehouseSummary.allBranchesTotal) * 100)
                      : 0}%
                  </div>
                  <div className="h-1.5 rounded-full bg-emerald-200 mt-2 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{
                        width: warehouseSummary.allBranchesTotal > 0
                          ? `${(warehouseSummary.octoberTotal / warehouseSummary.allBranchesTotal) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* اختيار المنتج لعرض توزيعه على الفروع */}
              <div>
                <label className="text-[11px] font-black text-slate-600 block mb-1.5">
                  اختر صنفاً لعرض مخزونه في كل الفروع:
                </label>
                <select
                  value={warehouseProductId || ''}
                  onChange={(e) => setWarehouseProductId(e.target.value || null)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500 transition cursor-pointer"
                >
                  <option value="">— كل الأصناف (إجمالي المخزون) —</option>
                  {visibleProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* جدول التوزيع على الفروع */}
              {warehouseProductId ? (
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-black text-slate-700">
                      {visibleProducts.find((p) => p.id === warehouseProductId)?.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-[10.5px] font-black font-mono">
                        أكتوبر {warehouseProductTotals.october.toLocaleString()}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white text-[10.5px] font-black font-mono">
                        الإجمالي {warehouseProductTotals.total.toLocaleString()}
                      </span>
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {warehouseProductBreakdown.map(({ branch, stock }) => {
                      const isMain = branch === MAIN_BRANCH_NAME;
                      const pct = warehouseProductTotals.total > 0 ? (stock / warehouseProductTotals.total) * 100 : 0;
                      return (
                        <div
                          key={branch}
                          className={`px-4 py-2.5 flex items-center justify-between gap-3 border-b border-slate-100 last:border-0 ${
                            isMain ? 'bg-amber-50/60' : 'bg-white'
                          }`}
                        >
                          <span className={`text-[11.5px] ${isMain ? 'font-black text-amber-900' : 'font-bold text-slate-700'}`}>
                            {isMain ? '🏭 ' : '🏪 '}{branch}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden hidden sm:block">
                              <span
                                className={`block h-full rounded-full ${isMain ? 'bg-amber-500' : 'bg-slate-700'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                            <span className={`text-xs font-black font-mono ${stock > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                              {stock.toLocaleString()}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-700">
                    إجمالي مخزون كل فرع (كل الأصناف)
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {CANONICAL_BRANCHES.map((branch) => {
                      const total = visibleProducts.reduce((acc, p) => acc + getBranchStockForProduct(p, branch), 0);
                      const isMain = branch === MAIN_BRANCH_NAME;
                      const pct = warehouseSummary.allBranchesTotal > 0
                        ? (total / warehouseSummary.allBranchesTotal) * 100
                        : 0;
                      return (
                        <div
                          key={branch}
                          className={`px-4 py-2.5 flex items-center justify-between gap-3 border-b border-slate-100 last:border-0 ${
                            isMain ? 'bg-amber-50/60' : 'bg-white'
                          }`}
                        >
                          <span className={`text-[11.5px] ${isMain ? 'font-black text-amber-900' : 'font-bold text-slate-700'}`}>
                            {isMain ? '🏭 ' : '🏪 '}{branch}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden hidden sm:block">
                              <span
                                className={`block h-full rounded-full ${isMain ? 'bg-amber-500' : 'bg-slate-700'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                            <span className={`text-xs font-black font-mono ${total > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                              {total.toLocaleString()}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

          {/* Fresh Upload / Setup Box (Visible ONLY to Admin and Developer) */}
      {isAdminOrDev && isUploadBoxOpen && (
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

      {/* Product Display (Grid View - Comfortable / Compact responsive layouts) */}
      {viewMode === 'grid' ? (
        <div
          className={
            gridDensity === 'comfortable'
              ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5'
              : 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3.5'
          }
        >
          {isParentGroupingEnabled ? (
            displayedParentProducts.map((parent, idx) => {
              const activeVariant = getParentActiveVariant(parent);
              const rawProd = activeVariant.rawProduct;
              const isPromo = Boolean(activeVariant.promoPrice && activeVariant.promoPrice > 0);
              const dynamicBranchStock = getProductBranchStock(rawProd);
              const octoberAvail =
                typeof rawProd.mainWarehouseReserved === 'number'
                  ? Math.max(0, rawProd.mainWarehouseReserved)
                  : rawProd.mainWarehouseActual || 0;
              const totalCartonsAvailable = dynamicBranchStock + octoberAvail;
              const orderState = getCardState(rawProd.id);
              const isComfortable = gridDensity === 'comfortable';
              const appliedPrice = activeVariant.promoPrice && activeVariant.promoPrice > 0
                ? activeVariant.promoPrice
                : activeVariant.cartonPrice;
              const appliedPiecePrice = activeVariant.piecePrice || (activeVariant.cartonQuantity ? Math.round((appliedPrice / activeVariant.cartonQuantity) * 100) / 100 : appliedPrice);

              return (
                <div
                  key={parent.id}
                  className="bg-white rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-slate-200 hover:border-amber-400 shadow-xs hover:shadow-lg transition-all duration-200 flex flex-col justify-between group relative"
                >
                  {/* Top Image & Badges */}
                  <div
                    className={`relative ${
                      isComfortable ? 'h-48 sm:h-56' : 'h-36 sm:h-44'
                    } bg-gradient-to-br from-slate-100 via-slate-50 to-amber-50/20 overflow-hidden cursor-pointer flex items-center justify-center border-b border-slate-100`}
                    onClick={() => setSelectedParentForModal(parent)}
                  >
                    <ProductImage
                      product={rawProd}
                      cloudinaryConfig={cloudinaryConfig}
                      targetSize={isComfortable ? 600 : 400}
                      sizeVariant="card"
                      priority={idx < 4}
                      containerClassName="w-full h-full"
                      className="w-full h-full object-contain p-2 group-hover:scale-105 transition duration-300"
                    />

                    {/* Top Right: Code Badge */}
                    <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end">
                      <div className="bg-slate-950/90 text-amber-300 text-xs font-black px-2.5 py-1 rounded-xl backdrop-blur-sm shadow-md border border-amber-400/30 font-mono flex items-center gap-1">
                        <span>كود أساسي:</span>
                        <span>{parent.primaryCode}</span>
                      </div>
                      {(activeVariant.unifiedCode || activeVariant.rawProduct?.unifiedCode || parent.unifiedCode) && (
                        <div className="bg-blue-950/90 text-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-lg font-mono border border-blue-400/30 shadow-xs">
                          موحد: {activeVariant.unifiedCode || activeVariant.rawProduct?.unifiedCode || parent.unifiedCode}
                        </div>
                      )}
                    </div>

                    {/* Top Left: Variants Count Badge */}
                    <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 items-start">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedParentForModal(parent);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black px-2.5 py-1 rounded-xl shadow-md border border-indigo-400/40 flex items-center gap-1 transition cursor-pointer"
                        title="فتح نافذة تفاعلية لاختيار الشباك واللون والكود الموحد"
                      >
                        <Boxes className="w-3.5 h-3.5 text-amber-300" />
                        <span>{parent.variantsCount} {parent.variantsCount === 1 ? 'كود موحد' : 'أكواد موحدة / ألوان'}</span>
                      </button>
                      {isPromo && (
                        <div className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                          <Flame className="w-3 h-3" />
                          <span>عرض خاص</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Right: Carton Pack Size */}
                    <div className="absolute bottom-2 right-2 bg-slate-950/85 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-lg backdrop-blur-sm">
                      الشدة: <strong className="text-amber-300">{parent.cartonQuantity || 1} ق</strong>
                    </div>

                    {/* Bottom Left: Eye-friendly Zoom */}
                    <div className="absolute bottom-2 left-2 bg-white/90 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-lg backdrop-blur-sm border border-slate-200 flex items-center gap-1">
                      <Eye className="w-3 h-3 text-amber-600" />
                      <span>معاينة مكبرة</span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className={`p-3 sm:p-4 flex-1 flex flex-col justify-between space-y-${isComfortable ? '3' : '2'}`}>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-1">
                        <span className="bg-amber-50 text-amber-900 font-bold px-2 py-0.5 rounded-md text-[11px] truncate max-w-[170px]">
                          {parent.department || parent.category || 'عام'} {parent.classification ? `• ${parent.classification}` : ''}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 font-mono">
                          {activeVariant.name}
                        </span>
                      </div>

                      <h3
                        onClick={() => setSelectedParentForModal(parent)}
                        className="font-black text-slate-900 text-sm leading-snug line-clamp-2 hover:text-amber-600 cursor-pointer transition min-h-[38px]"
                        title={parent.name}
                      >
                        {parent.name}
                      </h3>

                      {/* WINDOWS / VARIANTS QUICK SELECTOR (إظهار شبابيك الصنف الموحد) */}
                      {parent.variants.length > 1 ? (
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                            <span className="flex items-center gap-1 text-slate-700">
                              <span>🪟 شبابيك وتفريعات الصنف:</span>
                              <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded-md font-black">
                                {parent.variants.length} خيارات
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedParentForModal(parent)}
                              className="text-amber-600 hover:text-amber-800 cursor-pointer font-black"
                            >
                              استعراض الكل 🔍
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                            {parent.variants.slice(0, 6).map((v) => {
                              const isVSelected = activeVariant.id === v.id;
                              const vStock = (v.branchStockActual || 0) + (v.mainWarehouseActual || 0);
                              const isSearchMatch = Boolean(
                                searchTerm.trim() &&
                                (v.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
                                 v.code.toLowerCase().includes(searchTerm.toLowerCase().trim().replace('#', '')))
                              );
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => setCardSelectedVariant((prev) => ({ ...prev, [parent.id]: v.id }))}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-black whitespace-nowrap transition cursor-pointer flex items-center gap-1 shrink-0 ${
                                    isVSelected
                                      ? 'bg-amber-400 text-slate-950 shadow-xs ring-2 ring-amber-500 font-black'
                                      : isSearchMatch
                                        ? 'bg-amber-100 border border-amber-300 text-amber-900 ring-1 ring-amber-400'
                                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                  }`}
                                  title={`${v.name} (كود: ${v.code}) - متاح: ${vStock} ك`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${vStock > 0 ? 'bg-emerald-500' : 'bg-rose-400'}`}></span>
                                  <span>{v.name.replace('شباك', 'ش')}</span>
                                  {isSearchMatch && <span className="text-[8px] bg-amber-500 text-slate-950 px-1 rounded">مطابق</span>}
                                </button>
                              );
                            })}
                            {parent.variants.length > 6 && (
                              <button
                                type="button"
                                onClick={() => setSelectedParentForModal(parent)}
                                className="px-2 py-1 rounded-lg text-[10px] font-black bg-slate-200/80 text-slate-700 hover:bg-slate-300 whitespace-nowrap cursor-pointer shrink-0"
                              >
                                +{parent.variants.length - 6}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        searchTerm.trim() && (
                          <div className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 flex items-center justify-between">
                            <span>الشباك الحالي: <strong className="text-slate-800">{activeVariant.name}</strong></span>
                            <span className="font-mono text-slate-400">كود: {activeVariant.code}</span>
                          </div>
                        )
                      )}

                      {/* Stock details */}
                      {isAdminOrDev ? (
                        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-2.5 rounded-xl border border-amber-400/40 shadow-xs space-y-1.5">
                          {(() => {
                            const dynamicBranchNames = branches && branches.length > 0
                              ? branches.filter(b => !b.isMainWarehouse && !b.name.includes('أكتوبر')).map(b => b.name)
                              : ['فرع القاهرة', 'فرع الفيوم', 'فرع المنيا', 'فرع ديمشلت', 'فرع البحيرة', 'فرع منوف', 'فرع منيا القمح'];
                            const extraKeys = rawProd.branchStocks ? Object.keys(rawProd.branchStocks) : [];
                            const combinedBranches = Array.from(new Set([...dynamicBranchNames, ...extraKeys])).filter(
                              (n) => !n.includes('أكتوبر') && !n.includes('الرئيسي') && n !== 'main'
                            );
                            const otherBranchesStock = combinedBranches.reduce(
                              (sum, bName) => sum + getBranchStockForProduct(rawProd, bName),
                              0
                            );
                            const grandStock = otherBranchesStock + octoberAvail;
                            return (
                              <>
                                <div className="flex items-center justify-between text-xs font-black">
                                  <span className="text-amber-300 flex items-center gap-1.5 text-[11.5px]">
                                    <Warehouse className="w-4 h-4 text-amber-400" />
                                    <span>إجمالي مخزون الفروع + الرئيسي:</span>
                                  </span>
                                  <span className="font-mono text-base font-black text-amber-300">
                                    {grandStock.toLocaleString()} ك
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[10.5px] text-slate-300 pt-1.5 border-t border-slate-800">
                                  <span>الرئيسي (أكتوبر): <strong className="text-emerald-400">{octoberAvail} ك</strong></span>
                                  <span>باقي الفروع ({combinedBranches.length}): <strong className="text-sky-300">{otherBranchesStock} ك</strong></span>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedParentForModal(parent)}
                                    className="text-amber-400 hover:text-amber-300 font-black text-[10px] cursor-pointer bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded-md border border-amber-400/30 transition"
                                  >
                                    تفاصيل الفروع 🏢
                                  </button>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1 text-[11px] bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                          <div className="text-right">
                            <span className="text-slate-400 text-[10px] block">رصيد الفرع</span>
                            <span className={dynamicBranchStock > 0 ? 'text-emerald-700 font-black' : 'text-slate-400 font-bold'}>
                              {dynamicBranchStock > 0 ? `${dynamicBranchStock} ك` : 'نفد'}
                            </span>
                          </div>
                          <div className="text-left">
                            <span className="text-slate-400 text-[10px] block">مخزن أكتوبر</span>
                            <span className={octoberAvail > 0 ? 'text-amber-800 font-black' : 'text-slate-400 font-bold'}>
                              {octoberAvail > 0 ? `${octoberAvail} ك` : 'نفد'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Price Box */}
                      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 text-white">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-bold">سعر الكرتونة</span>
                          <span className="text-sm sm:text-base font-black text-amber-300 font-mono">
                            {isConfidentialMode ? '••••••' : formatCurrency(appliedPrice)}
                          </span>
                        </div>
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400 block font-bold">سعر القطعة</span>
                          <span className="text-xs font-black text-slate-200 font-mono">
                            {isConfidentialMode ? '••••' : formatCurrency(appliedPiecePrice)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Order Actions */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center bg-slate-100 rounded-xl border border-slate-300 p-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={totalCartonsAvailable <= 0 || orderState.quantity <= 1}
                            onClick={() => adjustCardQuantity(rawProd.id, -1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-800 active:bg-slate-200 rounded-lg font-black disabled:opacity-30 cursor-pointer"
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
                              setCardQuantityDirect(rawProd.id, parsed);
                            }}
                            className="w-9 h-7 text-center font-black text-xs text-slate-950 bg-white border border-slate-200 rounded-lg focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={totalCartonsAvailable <= 0}
                            onClick={() => adjustCardQuantity(rawProd.id, 1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-800 active:bg-slate-200 rounded-lg font-black disabled:opacity-30 cursor-pointer"
                          >
                            <Plus className="w-3 h-3 stroke-[2.5]" />
                          </button>
                        </div>

                        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-300 text-[10px] font-bold flex-1">
                          <button
                            type="button"
                            onClick={() => updateCardType(rawProd.id, 'carton')}
                            className={`flex-1 py-1 rounded-lg transition cursor-pointer text-center ${
                              orderState.type === 'carton' ? 'bg-amber-400 text-slate-950 font-black shadow-xs' : 'text-slate-600'
                            }`}
                          >
                            📦 كرتونة
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCardType(rawProd.id, 'piece')}
                            className={`flex-1 py-1 rounded-lg transition cursor-pointer text-center ${
                              orderState.type === 'piece' ? 'bg-amber-400 text-slate-950 font-black shadow-xs' : 'text-slate-600'
                            }`}
                          >
                            🏷️ قطعة
                          </button>
                        </div>
                      </div>

                      {totalCartonsAvailable > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleQuickAddWithState(rawProd)}
                          className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] text-slate-950 font-black h-10 px-3 rounded-xl text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                          <span>إضافة ({activeVariant.name}) للسلة</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedParentForModal(parent)}
                          className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 font-bold h-10 px-3 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-600" />
                          <span>فحص باقي الشبابيك 🪟</span>
                        </button>
                      )}

                      {parent.variants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSelectedParentForModal(parent)}
                          className="w-full bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-900 font-bold py-1.5 px-2 rounded-xl text-[11px] transition flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Boxes className="w-3 h-3 text-amber-600" />
                          <span>استعراض كافة الشبابيك والألوان ({parent.variants.length})</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            displayedProducts.map((product, idx) => {
            const isPromo = product.promoPrice && product.promoPrice > 0;
            const dynamicBranchStock = getProductBranchStock(product);
            const hasBranchStock = dynamicBranchStock > 0;
            const octoberAvail =
              typeof product.mainWarehouseReserved === 'number'
                ? Math.max(0, product.mainWarehouseReserved)
                : product.mainWarehouseActual || 0;
            const hasMainWhStock = octoberAvail > 0 || (product.mainWarehouseActual || 0) > 0;
            const totalCartonsAvailable = dynamicBranchStock + octoberAvail;
            const orderState = getCardState(product.id);
            const isComfortable = gridDensity === 'comfortable';

            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-200 hover:border-amber-400 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between group relative"
              >
                {/* Top Image & Floating Badges */}
                <div
                  className={`relative ${
                    isComfortable ? 'h-44 sm:h-52' : 'h-32 sm:h-40'
                  } bg-gradient-to-br from-slate-100 via-slate-50 to-amber-50/20 overflow-hidden cursor-pointer flex items-center justify-center border-b border-slate-100`}
                  onClick={() => setSelectedProductForModal(product)}
                >
                  {/* Image with quick lazy/eager loading */}
                  <ProductImage
                    product={product}
                    cloudinaryConfig={cloudinaryConfig}
                    targetSize={isComfortable ? 550 : 380}
                    sizeVariant="card"
                    priority={idx < 4}
                    containerClassName="w-full h-full"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />

                  {/* Product Code Badges: Code + Unified Colors/Models Code */}
                  <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end">
                    <div className="bg-slate-950/90 text-amber-300 text-xs font-black px-2 py-0.5 rounded-lg backdrop-blur-sm shadow-xs border border-amber-400/25 font-mono">
                      كود: {product.code}
                    </div>
                    {product.unifiedCode && (
                      <div className="bg-indigo-950/90 text-indigo-200 text-[10px] font-black px-1.5 py-0.5 rounded-md backdrop-blur-sm shadow-xs border border-indigo-400/30 font-mono">
                        موحد: #{product.unifiedCode.replace(/^#/, '')}
                      </div>
                    )}
                  </div>

                  {/* Single Promo/Priority Badge */}
                  {isPromo ? (
                    <div className="absolute top-2 left-2 bg-rose-600 text-white text-[11px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <Flame className="w-3 h-3" />
                      <span>عرض خاص</span>
                    </div>
                  ) : product.salesPriority === 'مرتفع' ? (
                    <div className="absolute top-2 left-2 bg-amber-400 text-slate-950 text-[11px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <Star className="w-3 h-3 fill-slate-950" />
                      <span>الأكثر طلباً</span>
                    </div>
                  ) : null}

                  {/* Pack Size Pill */}
                  <div className="absolute bottom-2 right-2 bg-slate-950/85 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-lg backdrop-blur-sm">
                    الشدة: <strong className="text-amber-300">{product.cartonQuantity || 1} ق</strong>
                  </div>
                </div>

                {/* Body Details */}
                <div className={`p-3 sm:p-3.5 flex-1 flex flex-col justify-between space-y-${isComfortable ? '3' : '2'}`}>
                  {/* Category & Title */}
                  <div className="space-y-1.5">
                    {/* Single consolidated department badge */}
                    <div className="flex items-center gap-1">
                      {(() => {
                        const deptMeta = getDepartmentMeta(product.department || product.category);
                        const DeptIcon = deptMeta.icon;
                        return (
                          <span
                            className="bg-amber-50 text-amber-900 font-bold px-2 py-0.5 rounded-md text-[11px] truncate max-w-[160px] flex items-center gap-1"
                            title={`${deptMeta.nameArabic} - ${product.department || ''}`}
                          >
                            <DeptIcon className="w-3 h-3 text-amber-700 shrink-0" />
                            <span>{product.department || product.category || 'عام'}</span>
                          </span>
                        );
                      })()}
                    </div>

                    <h3
                      onClick={() => setSelectedProductForModal(product)}
                      className="font-black text-slate-900 text-sm leading-snug line-clamp-2 hover:text-amber-600 cursor-pointer transition min-h-[36px]"
                      title={product.name}
                    >
                      {product.name}
                    </h3>
                  </div>

                  {/* Stock Badges: Exact Branch Stock & Main Warehouse (October) Stock */}
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-slate-500 font-bold">الفرع:</span>
                        <span className={`font-black font-mono ${dynamicBranchStock > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {dynamicBranchStock} ك
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-1 border-r border-slate-200">
                        <span className="text-slate-500 font-bold">أكتوبر:</span>
                        <span className="font-black font-mono text-amber-700">
                          {octoberAvail} ك
                        </span>
                      </div>
                    </div>

                    {/* Pricing — single row */}
                    <div className="flex items-baseline justify-between bg-slate-50 rounded-xl px-2.5 py-1.5 border border-slate-100">
                      <div>
                        <span className="text-[11px] text-slate-500 font-medium block">الكرتونة</span>
                        <span className="text-sm font-black text-slate-950">
                          {isConfidentialMode ? (
                            <span className="font-mono text-slate-400 text-xs tracking-widest bg-slate-200/60 px-1.5 py-0.5 rounded">••••••</span>
                          ) : (
                            formatCurrency(product.cartonPrice)
                          )}
                        </span>
                      </div>
                      <div className="text-left">
                        <span className="text-[11px] text-slate-500 font-medium block">القطعة</span>
                        <span className="text-xs font-black text-slate-700">
                          {isConfidentialMode ? (
                            <span className="font-mono text-slate-400 text-xs tracking-widest bg-slate-200/60 px-1.5 py-0.5 rounded">••••••</span>
                          ) : (
                            formatCurrency(product.piecePrice)
                          )}
                        </span>
                      </div>
                      {product.promoPrice ? (
                        <span className="text-xs font-black text-rose-600 flex items-center gap-0.5">
                          <Flame className="w-3 h-3" />
                          {isConfidentialMode ? (
                            <span className="font-mono text-rose-400 text-xs tracking-widest">•••</span>
                          ) : (
                            formatCurrency(product.promoPrice)
                          )}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Order Controls Section: 2 Clean Rows (Relieves crowding and makes Add prominent) */}
                  <div className="space-y-2 pt-1 border-t border-slate-100">
                    {/* Row 1: Quantity Stepper & Unit Switcher */}
                    <div className="flex items-center justify-between gap-1.5">
                      {/* Stepper with comfortable touch targets */}
                      <div className="flex items-center bg-slate-100 rounded-xl border border-slate-300 p-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={totalCartonsAvailable <= 0 || orderState.quantity <= 1}
                          onClick={() => adjustCardQuantity(product.id, -1)}
                          className="w-8 h-8 sm:w-8 sm:h-8 flex items-center justify-center text-slate-800 active:bg-slate-200 rounded-lg font-black disabled:opacity-30 cursor-pointer"
                          title="إنقاص (-1)"
                          aria-label="إنقاص الكمية"
                        >
                          <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
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
                          className="w-10 sm:w-11 h-8 text-center font-black text-xs sm:text-sm text-slate-950 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                          aria-label="الكمية المطلوبة"
                        />

                        <button
                          type="button"
                          disabled={totalCartonsAvailable <= 0}
                          onClick={() => adjustCardQuantity(product.id, 1)}
                          className="w-8 h-8 sm:w-8 sm:h-8 flex items-center justify-center text-slate-800 active:bg-slate-200 rounded-lg font-black disabled:opacity-30 cursor-pointer"
                          title="زيادة (+1)"
                          aria-label="زيادة الكمية"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      </div>

                      {/* Unit Switcher: Carton vs Piece */}
                      <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-300 text-[11px] font-bold flex-1">
                        <button
                          type="button"
                          onClick={() => updateCardType(product.id, 'carton')}
                          className={`flex-1 py-1 sm:py-1.5 rounded-lg transition cursor-pointer text-center ${
                            orderState.type === 'carton'
                              ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                              : 'text-slate-600 hover:text-slate-950'
                          }`}
                        >
                          📦 كرتونة
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCardType(product.id, 'piece')}
                          className={`flex-1 py-1 sm:py-1.5 rounded-lg transition cursor-pointer text-center ${
                            orderState.type === 'piece'
                              ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                              : 'text-slate-600 hover:text-slate-950'
                          }`}
                        >
                          🏷️ قطعة
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Full-Width Prominent "Add to Cart" Button */}
                    {totalCartonsAvailable > 0 ? (
                      <button
                        type="button"
                        onClick={() => handleQuickAddWithState(product)}
                        className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] text-slate-950 font-black h-11 px-3 rounded-xl text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                        aria-label={`إضافة ${orderState.quantity} ${orderState.type === 'carton' ? 'كرتونة' : 'قطعة'}`}
                      >
                        <ShoppingCart className="w-4 h-4 stroke-[2.5] shrink-0" />
                        <span className="font-black text-xs sm:text-sm tracking-wide">
                          إضافة للسلة ({orderState.quantity} {orderState.type === 'carton' ? 'كرتونة' : 'قطعة'})
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full bg-slate-100 border border-slate-200 text-slate-400 font-bold h-11 px-3 rounded-xl text-xs flex items-center justify-center cursor-not-allowed"
                      >
                        <span>غير متوفر بالرصيد حالياً 🚫</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          }))}
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
                  <th className="p-3 text-center">
                    {currentActiveBranch ? `مخزون ${currentActiveBranch.replace('فرع ', '')} (كرتونة)` : 'مخزون الفرع (كرتونة)'}
                  </th>
                  <th className="p-3 text-center">مخزن أكتوبر (كرتونة)</th>
                  <th className="p-3 text-left">سعر الكرتونة بالجملة</th>
                  <th className="p-3 text-center">سعر العرض (الكرتونة)</th>
                  <th className="p-3 text-center">إضافة كرتونة للطلبية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isParentGroupingEnabled ? (
                  displayedParentProducts.map((parent) => {
                    const activeVariant = getParentActiveVariant(parent);
                    const rawProd = activeVariant.rawProduct;
                    const branchCartons = getProductBranchStock(rawProd);
                    const mainWhCartons = typeof rawProd.mainWarehouseReserved === 'number'
                      ? rawProd.mainWarehouseReserved
                      : (rawProd.mainWarehouseActual || 0);

                    return (
                      <tr key={parent.id} className="hover:bg-amber-50/40 transition">
                        <td className="p-2.5">
                          <div className="flex items-center gap-2">
                            <ProductImage
                              product={rawProd}
                              cloudinaryConfig={cloudinaryConfig}
                              targetSize={120}
                              sizeVariant="thumbnail"
                              containerClassName="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 cursor-pointer"
                              className="w-full h-full object-contain"
                              showBadgeOnFallback={false}
                              onClick={() => setSelectedParentForModal(parent)}
                            />
                            <div className="flex flex-col gap-1 items-start">
                              <span className="font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-lg text-[11px] font-mono">
                                {parent.unifiedCode || parent.primaryCode}
                              </span>
                              <span className="font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded text-[10px]">
                                {parent.variantsCount} شبابيك
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-2.5">
                          <div
                            className="font-black text-slate-900 hover:text-amber-600 cursor-pointer text-sm"
                            onClick={() => setSelectedParentForModal(parent)}
                          >
                            {parent.name}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>الشباك النشط: <strong className="text-slate-800">{activeVariant.name}</strong></span>
                            <span>كود: {activeVariant.code}</span>
                          </div>
                        </td>
                        <td className="p-2.5 font-bold text-slate-600">{parent.department || parent.category}</td>
                        <td className="p-2.5 text-center font-black text-slate-800">{parent.cartonQuantity} قطعة</td>
                        <td className="p-2.5 text-center">
                          <span className={branchCartons > 0 ? (branchCartons <= 5 ? 'text-amber-900 font-black' : 'text-emerald-700 font-black') : 'text-red-600 font-bold'}>
                            {branchCartons} كرتونة
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          <span className="text-amber-800 font-black">{mainWhCartons} كرتونة</span>
                        </td>
                        <td className="p-2.5 text-left font-black text-amber-950 text-sm">
                          {isConfidentialMode ? (
                            <span className="font-mono text-slate-400 text-xs tracking-widest bg-slate-200/60 px-1.5 py-0.5 rounded">••••••</span>
                          ) : (
                            formatCurrency(activeVariant.cartonPrice)
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          {activeVariant.promoPrice ? (
                            <span className="text-rose-700 font-black text-xs">{formatCurrency(activeVariant.promoPrice)}</span>
                          ) : (
                            <span className="text-slate-300 font-medium">---</span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedParentForModal(parent)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-3 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-xs flex items-center gap-1 whitespace-nowrap"
                            >
                              <Boxes className="w-3.5 h-3.5" />
                              <span>اختر الشباك 🪟</span>
                            </button>
                            {(branchCartons + mainWhCartons) > 0 && (
                              <button
                                onClick={() => handleDirectAdd(rawProd, 'carton', 1)}
                                className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black px-2 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-xs whitespace-nowrap"
                                title={`إضافة 1 كرتونة من (${activeVariant.name})`}
                              >
                                +1 ك
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  displayedProducts.map((product) => {
                  const branchCartons = getProductBranchStock(product);
                  const mainWhCartons = typeof product.mainWarehouseReserved === 'number'
                    ? product.mainWarehouseReserved
                    : (product.mainWarehouseActual || 0);

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
                          <div className="flex flex-col gap-1 items-start">
                            <span className="font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-lg text-[11px]">
                              {product.code}
                            </span>
                            {product.unifiedCode && (
                              <span className="font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded text-[10px] flex items-center gap-0.5" title="الكود الموحد">
                                <span className="text-indigo-500 font-bold">#</span>
                                <span>{product.unifiedCode.replace('#', '')}</span>
                              </span>
                            )}
                          </div>
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
                        <span className={branchCartons > 0 ? (branchCartons <= 5 ? 'text-amber-900 font-black' : 'text-emerald-700 font-black') : 'text-red-600 font-bold'}>
                          {branchCartons} كرتونة
                        </span>
                        <div className="text-[10px] mt-0.5">
                          {branchCartons <= 0 ? (
                            <span className="text-rose-600 font-black">نفد (0 متاح)</span>
                          ) : branchCartons <= 5 ? (
                            <span className="text-amber-950 bg-amber-200 border border-amber-400 font-black px-1.5 py-0.5 rounded text-[9px] inline-block shadow-2xs">
                              ⚠️ مخزون حرج ({branchCartons} ك)
                            </span>
                          ) : branchCartons <= 10 ? (
                            <span className="text-amber-800 bg-amber-50 border border-amber-200 font-bold px-1.5 py-0.5 rounded text-[9px] inline-block">
                              ⚡ محدود ({branchCartons} ك)
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-bold">متاح: {branchCartons} ك</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-amber-800 font-black">{mainWhCartons} كرتونة</span>
                      </td>
                      <td className="p-2.5 text-left font-black text-amber-950 text-sm">
                        {isConfidentialMode ? (
                          <span className="font-mono text-slate-400 text-xs tracking-widest bg-slate-200/60 px-1.5 py-0.5 rounded">••••••</span>
                        ) : (
                          formatCurrency(product.cartonPrice)
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        {isConfidentialMode ? (
                          <span className="font-mono text-slate-400 text-xs tracking-widest bg-slate-200/60 px-1.5 py-0.5 rounded">••••••</span>
                        ) : product.promoPrice ? (
                          <div className="inline-flex flex-col items-center bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                            <span className="text-rose-700 font-black text-xs">{formatCurrency(product.promoPrice)}</span>
                            <span className="text-[9px] text-rose-500 font-bold">
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
                }))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination & Progressive Loading Controller */}
      {activeTotalItems > 0 && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Left / Info & Per-Page selector */}
          <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 w-full sm:w-auto text-xs">
            <div className="text-slate-600 font-bold flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-slate-400 font-normal">عرض الأصناف:</span>
              <strong className="text-slate-900">
                {itemsPerPage === 'all' && activeTotalItems > MAX_RENDERED_ITEMS
                  ? `أول ${MAX_RENDERED_ITEMS} صنف من ${activeTotalItems} — استخدم البحث أو الفلاتر لعرض الباقي`
                  : `${Math.min((currentPage - 1) * effectiveItemsPerPage + 1, activeTotalItems)} - ${Math.min(currentPage * effectiveItemsPerPage, activeTotalItems)} من أصل ${activeTotalItems}`}
              </strong>
            </div>

            <div className="flex items-center gap-1.5 text-slate-500 font-bold">
              <span>لكل صفحة:</span>
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                {[24, 48, 100, 250, 'all'].map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      setItemsPerPage(size as any);
                      setCurrentPage(1);
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
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

      {/* Empty State with Fast Setup Assistant & Smart Did-You-Mean Suggestions */}
      {activeTotalItems === 0 && (
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
              : searchTerm.trim()
              ? `لم نعثر على نتيجة دقيقة تطابق "${searchTerm}". جرّب الاقتراحات الذكية أدناه أو الكود الأساسي.`
              : 'جرّب تغيير كلمات البحث أو إزالة الفلاتر المحددة لعرض كافة الأصناف.'}
          </p>

          {/* Smart "Did you mean" suggestions */}
          {products.length > 0 && searchTerm.trim() && searchSuggestions.length > 0 && (
            <div className="bg-amber-50/80 border border-amber-300 rounded-2xl p-3.5 text-right space-y-2">
              <div className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>هل تقصد أحد هذه الأصناف المقترحة؟</span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {searchSuggestions.slice(0, 3).map((sug) => (
                  <button
                    key={sug.id}
                    type="button"
                    onClick={() => {
                      setSearchTerm(sug.code);
                      setSelectedParentForModal(sug.parent);
                    }}
                    className="bg-white hover:bg-amber-100 border border-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-800 flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                  >
                    <span className="font-mono text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-black">{sug.code}</span>
                    <span>{sug.title}</span>
                    <span className="text-[10px] text-slate-500">({sug.variantsCount} ألوان)</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 pt-2">
            {products.length === 0 ? (
              isAdminOrDev ? (
                <button
                  onClick={() => setIsUploadBoxOpen(true)}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 px-5 py-2.5 rounded-2xl text-xs font-black shadow-md transition flex items-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>رفع شيت الأصناف الآن 📄</span>
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
                className="bg-slate-900 text-amber-300 px-5 py-2.5 rounded-2xl text-xs font-bold shadow hover:bg-slate-800 cursor-pointer"
              >
                إعادة تعيين البحث والفلاتر
              </button>
            )}
          </div>
        </div>
      )}
        </div>

        {/* Right Column: Sticky POS Cashier Terminal (Visible on Desktop / Tablet) */}
        <div className="hidden lg:block lg:col-span-4 xl:col-span-3.5 sticky top-20">
          <PosCashierSidebar
            selectedCustomer={selectedCustomer}
            onClearSelectedCustomer={onClearSelectedCustomer}
            onInvoiceTransferred={(inv) => {
              if (onNavigateToInvoices) onNavigateToInvoices(inv);
            }}
            onOpenDetailedModal={onOpenCart}
          />
        </div>
      </div>

      {/* Mobile Floating Cashier Trigger Bar (Amazon/Souq Style) */}
      {(cart.length > 0 || selectedCustomer) && (
        <div className="fixed bottom-16 left-3 right-3 z-40 lg:hidden animate-in slide-in-from-bottom duration-300">
          <div className="bg-slate-900 text-white p-2.5 sm:p-3 rounded-2xl shadow-2xl border border-amber-400/40 flex items-center justify-between gap-2 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shrink-0 relative shadow-md">
                <ShoppingCart className="w-5 h-5" />
                {cart.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border border-white">
                    {cart.length}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-amber-300 truncate">
                  {cartSummary.totalCartons} كرتونة • {cartSummary.totalPieces} قطعة
                </div>
                <div className="text-sm font-black text-white font-mono truncate">
                  {formatCurrency(cartSummary.grandTotal)}
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsMobileCashierOpen(true)}
              className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-black shadow-lg transition flex items-center gap-1.5 active:scale-95 shrink-0 cursor-pointer"
            >
              <span>متابعة الطلبية (العميل) ←</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Slide-Up Cashier Modal */}
      {isMobileCashierOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end lg:hidden animate-in fade-in">
          <div className="bg-white rounded-t-3xl h-[92vh] max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border-t-2 border-amber-400">
            <PosCashierSidebar
              selectedCustomer={selectedCustomer}
              onClearSelectedCustomer={onClearSelectedCustomer}
              onInvoiceTransferred={(inv) => {
                setIsMobileCashierOpen(false);
                if (onNavigateToInvoices) onNavigateToInvoices(inv);
              }}
              onOpenDetailedModal={() => {
                setIsMobileCashierOpen(false);
                if (onOpenCart) onOpenCart();
              }}
              isMobileDrawer={true}
              onCloseMobileDrawer={() => setIsMobileCashierOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Wipe All Data Confirmation Modal (Admin & Developer Only) */}
      {isAdminOrDev && isWipeModalOpen && (
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
              <div className="flex items-center flex-wrap gap-2">
                <span className="bg-slate-950 text-amber-300 font-black text-xs px-2.5 py-1 rounded-xl">
                  {selectedProductForModal.code}
                </span>
                {selectedProductForModal.unifiedCode && (
                  <span className="bg-indigo-950 text-indigo-200 font-mono font-black text-xs px-2.5 py-1 rounded-xl border border-indigo-700 flex items-center gap-1">
                    <span className="text-amber-400 font-bold">#</span>
                    <span>الكود الموحد: {selectedProductForModal.unifiedCode.replace('#', '')}</span>
                  </span>
                )}
                {(() => {
                  const deptMeta = getDepartmentMeta(selectedProductForModal.department || selectedProductForModal.category);
                  const DeptIcon = deptMeta.icon;
                  return (
                    <span className="text-xs font-bold text-slate-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg flex items-center gap-1.5">
                      <DeptIcon className="w-3.5 h-3.5 text-amber-700" />
                      <span>{deptMeta.nameArabic} ({selectedProductForModal.department || 'عام'})</span>
                    </span>
                  );
                })()}
                {selectedProductForModal.classification && (
                  <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg">
                    🏷️ {selectedProductForModal.classification}
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
                  
                  {/* Code & Unified Code Identification */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="bg-slate-900 text-amber-300 font-mono font-black text-xs px-2.5 py-1 rounded-lg">
                      كود الصنف: {selectedProductForModal.code}
                    </span>
                    {selectedProductForModal.unifiedCode ? (
                      <span className="bg-indigo-950 text-indigo-200 font-mono font-black text-xs px-2.5 py-1 rounded-lg border border-indigo-700/80 flex items-center gap-1">
                        <span className="text-amber-400 font-bold">#</span>
                        <span>الكود الموحد للموديل: {selectedProductForModal.unifiedCode.replace('#', '')}</span>
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-600 font-bold text-xs px-2 py-0.5 rounded-lg border border-slate-200">
                        # بدون كود موحد
                      </span>
                    )}
                    {selectedProductForModal.color && (
                      <span className="bg-indigo-50 text-indigo-900 border border-indigo-200 font-black text-xs px-2 py-0.5 rounded-lg">
                        🎨 اللون: {selectedProductForModal.color}
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
                      <div className="mt-3 bg-indigo-50/80 border border-indigo-200 rounded-2xl p-2.5 space-y-2">
                        <div className="flex items-center justify-between text-xs font-black text-indigo-950">
                          <span className="flex items-center gap-1">
                            <span>🎨 الألوان والموديلات لنفس الكود الموحد (#{normCode}):</span>
                          </span>
                          <span className="text-[10px] bg-indigo-200 text-indigo-900 font-black px-2 py-0.5 rounded-md">
                            {siblings.length} بدائل ألوان
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {siblings.map((sib) => (
                            <div
                              key={sib.id}
                              onClick={() => setSelectedProductForModal(sib)}
                              className="flex items-center gap-2 p-1.5 bg-white border border-indigo-100 rounded-xl hover:border-indigo-400 hover:shadow-xs cursor-pointer transition text-[11px]"
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
                                <div className="text-[10px] text-indigo-700 font-mono font-bold flex items-center gap-1">
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
                        <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-md">
                          أكتوبر: المخزن الرئيسي
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                          <div className="text-[10px] text-slate-400">رصيد {activeBranchLabel}:</div>
                          <div className={`font-black text-sm ${branchStock <= 5 && branchStock > 0 ? 'text-amber-900' : 'text-emerald-700'}`}>
                            {branchStock} كرتونة
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold">
                            {branchStock <= 0 ? (
                              <span className="text-rose-600 font-black">نفد بالفرع</span>
                            ) : branchStock <= 5 ? (
                              <span className="text-amber-800 font-black">⚠️ مخزون حرج (متاح {branchStock} ك)</span>
                            ) : (
                              <span>متاح للطلب: {branchReserved} كرتونة</span>
                            )}
                          </div>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                          <div className="text-[10px] text-slate-400">المخزن المركزي بأكتوبر:</div>
                          <div className="font-black text-sm text-amber-800">
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
                            <span>🏢 تفصيل أرصدة الفروع الـ 7 والمخزن المركزي:</span>
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
                                      ? 'bg-amber-50/80 border-amber-200 text-amber-950 font-black'
                                      : bStock > 0
                                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
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
                <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-xs text-amber-950 font-black">سعر الكرتونة بالجملة (المعتمد):</div>
                      <div className="text-xl font-black text-amber-950">
                        {isConfidentialMode ? (
                          <span className="font-mono text-slate-400 text-sm tracking-widest bg-amber-100 px-2.5 py-1 rounded-xl">•••••• ج.م (محمي 🔒)</span>
                        ) : (
                          formatCurrency(selectedProductForModal.cartonPrice)
                        )}
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
                            <div className="bg-amber-100 text-amber-950 border border-amber-300 p-2.5 rounded-xl text-xs font-black flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0" />
                              <span>⚠️ <strong>هامش الأمان:</strong> رصيد الصنف حرج ({branchAvail} كرتونة فقط متبقية بالفرع) - يُرجى التأكد من مسؤولي الفرع قبل تأكيد البيع.</span>
                            </div>
                          )}
                          {isFromOctober && (
                            <div className="bg-blue-50 text-blue-900 border border-blue-200 p-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                              <Truck className="w-4 h-4 text-blue-600 shrink-0" />
                              <span>الصنف غير متوفر بالفرع وسيتم سحبه وتحويله من مخزن أكتوبر المركزي مباشرة.</span>
                            </div>
                          )}
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
                                max={Math.max(1, totalAvail)}
                                value={getCardState(selectedProductForModal.id).quantity}
                                onChange={(e) => {
                                  setCardQuantityDirect(selectedProductForModal.id, parseInt(e.target.value, 10), totalAvail);
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
                              className={`flex-1 font-black py-3 px-3 rounded-2xl shadow-md text-xs transition cursor-pointer flex items-center justify-center gap-2 ${
                                isFromOctober
                                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                              }`}
                            >
                              <ShoppingCart className="w-4 h-4" />
                              <span>
                                {isFromOctober
                                  ? `طلب ${getCardState(selectedProductForModal.id).quantity} كرتونة من مخزن أكتوبر 🚚`
                                  : `أضف ${getCardState(selectedProductForModal.id).quantity} كرتونة للطلبية 🛒`}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <button
                        disabled
                        className="w-full bg-slate-100 border border-slate-300 text-slate-500 font-bold py-3 rounded-2xl text-xs cursor-not-allowed opacity-80"
                      >
                        الصنف غير متاح للطلب (بدون مخزون بالفرع أو بأكتوبر) 🚫
                      </button>
                    );
                  })()}
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

      {/* Interactive Parent Product & Variants / Windows Modal */}
      <ProductVariantModal
        parentProduct={selectedParentForModal}
        isOpen={Boolean(selectedParentForModal)}
        onClose={() => setSelectedParentForModal(null)}
        onOpenCart={onOpenCart}
        isConfidentialMode={isConfidentialMode}
      />

      {/* Bottom Floating Cart Bar (Amazon / Noon Style) - Mobile & Tablet quick checkout */}
      {cart.length > 0 && onOpenCart && (
        <aside
          aria-label="سلة المشتريات ومتابعة الطلب"
          className="lg:hidden fixed bottom-16 left-3 right-3 z-40 bg-slate-950/95 border-2 border-amber-400 text-white p-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-in slide-in-from-bottom-5 duration-200"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="bg-amber-400 text-slate-950 text-xs px-2 py-0.5 rounded-full font-black font-mono">
                {cart.length} صنف
              </span>
              <span className="text-xs text-slate-300 font-bold truncate">
                {cartSummary.totalCartons} ك • {cartSummary.totalPieces} ق
              </span>
            </div>
            <div className="text-sm font-black text-amber-400 font-mono mt-0.5">
              الإجمالي: {formatCurrency(cartSummary.grandTotal)}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenCart}
            className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 hover:from-amber-300 hover:to-amber-400 active:scale-95 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs shadow-lg flex items-center gap-1.5 cursor-pointer shrink-0 transition"
          >
            <span>متابعة الطلب 🛒</span>
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
        </aside>
      )}

    </div>
  );
};
