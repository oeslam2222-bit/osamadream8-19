import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  CloudDownload,
  CloudUpload,
  Download,
  LayoutDashboard,
  Link2,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Users,
  X
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import {
  buildCustomerGrowthMap,
  buildCustomerInsights,
  buildFollowUpAlerts,
  buildPeriodComparison,
  formatCompactAmount,
  resolveLatestSalesMonth
} from '../services/customerItemSalesInsights';
import {
  buildGroupInsights,
  buildIdleItems,
  IdleItemsResult,
  buildItemRanking,
  buildMonthlyCustomerAnalysis,
  buildMonthlyPerformance,
  buildPeriodTotals,
  buildRepPerformance,
  growthPct,
  resolveItemGroup
} from '../services/itemSalesAnalytics';
import {
  aggregateCustomerItemSales,
  clearCustomerItemSales,
  enrichCustomerItemSalesWithCatalog,
  enrichCustomerItemSalesWithDirectory,
  fillGenericFamiliesFromSiblings,
  exportCustomerItemSalesToExcel,
  fetchCustomerItemSalesFromSupabase,
  filterCustomerItemSalesByRBAC,
  getItemSalesSyncMeta,
  getSavedCustomerItemSales,
  getSupabaseCustomerItemSalesCount,
  isItemSalesCountCheckFresh,
  setItemSalesSyncMeta,
  MONTH_NAMES_MAP,
  parseExcelCustomerItemSales,
  pushCustomerItemSalesToSupabase,
  saveCustomerItemSales,
  CustomerItemSalesFetchScope,
} from '../services/customerItemSalesService';
import { Customer, CustomerItemSaleRecord, CustomerItemSalesSummary } from '../types';
import { CustomerDossiers } from './customerSales/CustomerDossiers';
import { CategoryMixCard } from './itemSales/CategoryMixCard';
import {
  MonthlyCustomerAnalysisTable,
  TopCustomersTable
} from './itemSales/CustomerBreakdownCards';
import { ItemRankingCard } from './itemSales/ItemRankingCard';
import { ItemSalesKpiCards } from './itemSales/ItemSalesKpiCards';
import { MonthlyPerformanceCard } from './itemSales/MonthlyPerformanceCard';
import { RepPerformanceCard } from './itemSales/RepPerformanceCard';
import { SlowMoversCard } from './itemSales/SlowMoversCard';
import { MonthlyAggregateCard } from './itemSales/MonthlyAggregateCard';
import { aggregateItemSalesRows, downloadItemSalesRowsCsv } from './itemSales/ItemSalesRowsTable';
import { ItemSalesExecutiveCards } from './itemSales/ItemSalesExecutiveCards';
import { CANONICAL_BRANCHES, normalizeBranchName, UNKNOWN_BRANCH } from '../services/branchDirectory';
import TotalsAnalysisView from './itemSales/TotalsAnalysisView';
import { createItemSalesSectorResolver } from '../services/sectorResolver';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import {
  buildItemSalesAggregates,
  ItemSalesSector,
  saveItemSalesAggregates,
} from '../services/itemSalesAggregateService';

interface CustomerItemSalesViewProps {
  onOpenNewOrderForCustomer?: (customer: Customer, prefilledItemCode?: string) => void;
  onNavigateToExcel?: () => void;
}

const SalesFocusV4 = React.lazy(() => import('./itemSales/SalesFocusV4'));

type SalesViewMode = 'overview' | 'visuals' | 'focus' | 'customers';

const initials = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0] || ''}${parts[1][0] || ''}`;
};

export const CustomerItemSalesView: React.FC<CustomerItemSalesViewProps> = ({
  onOpenNewOrderForCustomer,
  onNavigateToExcel
}) => {
  const { currentUser, users, customers, products, activeSectorFilter, effectiveSectorFilter } = useApp();
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  /** تشخيص أعداد السجلات للمطور والدعم الفني فقط. */
  const canSeeDiagnostics =
    currentUser?.role === 'developer' || currentUser?.role === 'technical_support';

  /**
   * القطاع مش عمود في جدول مبيعات الأصناف — بنستنتجه من كتالوج المنتجات
   * (الكود/الكود الموحد). اللي مش موجود في الكتالوج بيتحسب منزلي افتراضيًا.
   */
  // خرائط بحث سريعة بدل .find() لكل صف (كان O(n²) على 103 ألف صف).
  // — اتحوّلت لـ sectorResolver الداخلي (createItemSalesSectorResolver). —

  // موحّد تحديد القطاع — نفس الـ resolver بيستخدمه فلتر RBAC والفلتر والتحليل،
  // فمفيش حركة بتعدي في مسار وتسقط في التاني (كان السبب في انزلاق كل القطاع
  // لـ«منزلي»: سياسة add_customer_sector_column.sql كتبت sector='home' جماعي).
  const sectorResolver = React.useMemo(
    () => createItemSalesSectorResolver(customers, products || []),
    [customers, products]
  );

  const resolveItemSaleSector = React.useCallback(
    (record: CustomerItemSaleRecord): ItemSalesSector => sectorResolver.resolve(record),
    [sectorResolver]
  );

  /** يحدّث ملخص الشهور في الخلفية بعد أي استيراد/جلب — بدون ما يعطّل الواجهة. */
  const publishItemSalesAggregates = React.useCallback(
    (rows: CustomerItemSaleRecord[]) => {
      if (!rows || rows.length === 0) return;
      void saveItemSalesAggregates(buildItemSalesAggregates(rows, { resolveSector: resolveItemSaleSector })).catch(
        () => {}
      );
    },
    [resolveItemSaleSector]
  );

  /** القطاع الفعّال للعزل: الادمن/المطور بيختار، والباقي مقفول على قطاع حسابه
   *  ('none' = بلا قطاع معيّن → محجوب عن القطاعين). */
  const itemSalesSector = React.useMemo<'all' | 'home' | 'electrical' | 'none'>(() => {
    if (isAdminOrDev) return activeSectorFilter;
    return effectiveSectorFilter;
  }, [isAdminOrDev, effectiveSectorFilter, activeSectorFilter]);

  /** حساب مبيعات بلا قطاع: ما نعرضش عليه أي حركة ولا نصرف egress لجلبها. */
  const isSectorBlocked = !isAdminOrDev && itemSalesSector === 'none';

  const itemSalesScope = React.useMemo<CustomerItemSalesFetchScope | undefined>(() => {
    if (!currentUser) return undefined;
    const cleanName = (value?: string) =>
      (value || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const role = currentUser.role;
    const branch = String(currentUser.branchName || '').trim();
    const shortBranch = branch.replace(/فرع/g, '').replace(/\([^)]*\)/g, '').trim();
    const warehouses = shortBranch.length >= 2 ? [shortBranch] : branch ? [branch] : [];
    const sectors: Array<'home' | 'electrical'> =
      itemSalesSector === 'home' || itemSalesSector === 'electrical' ? [itemSalesSector] : [];

    // محجوب عن القطاعين (حساب مبيعات بلا قطاع): نطاق مستحيل المطابقة —
    // مانجلبش أي صف من السيرفر ومانصرفش egress.
    if (isSectorBlocked) return { repNames: ['__no_sector_assigned__'] };

    // الادمن/المطور: عزل اختياري بالقطاع بس (بدون تقييد مندوب/فرع)
    if (isAdminOrDev) return sectors.length > 0 ? { sectors } : undefined;

    if (role === 'sales_rep') {
      const fullName = cleanName(currentUser.name);
      const shortName = fullName.split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
      const repNames = Array.from(new Set([fullName, shortName].filter((n) => n.length >= 3)));
      return {
        ...(repNames.length > 0 ? { repNames } : warehouses.length > 0 ? { warehouses } : {}),
        ...(sectors.length > 0 ? { sectors } : {}),
      };
    }

    if (role === 'supervisor') {
      const repNames = users
        .filter((u) => u.supervisorId === currentUser.id)
        .flatMap((u) => {
          const fn = cleanName(u.name);
          const sn = fn.split(' ').filter((t) => t.length > 1).slice(0, 2).join(' ');
          return [fn, sn];
        })
        .filter((n) => n.length >= 3);
      return {
        ...(repNames.length > 0 ? { repNames: Array.from(new Set(repNames)) } : {}),
        ...(warehouses.length > 0 ? { warehouses } : {}),
        ...(sectors.length > 0 ? { sectors } : {}),
      };
    }

    if (role === 'branch_manager' && warehouses.length > 0) {
      return { warehouses, ...(sectors.length > 0 ? { sectors } : {}) };
    }
    return undefined;
  }, [currentUser, users, isAdminOrDev, itemSalesSector, isSectorBlocked]);

  const [salesRecords, setSalesRecords] = useState<CustomerItemSaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [supabaseCount, setSupabaseCount] = useState<number | null>(null);
  const [lastSyncAt] = useState<string | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  const [showAllSalesOverride, setShowAllSalesOverride] = useState(false);
  const [isSupabasePushing, setIsSupabasePushing] = useState(false);
  const [supabasePushProgress, setSupabasePushProgress] = useState<{ synced: number; total: number } | null>(null);
  const [isSupabaseFetching, setIsSupabaseFetching] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [idleItems, setIdleItems] = useState<IdleItemsResult>({
    items: [],
    totalIdle: 0,
    catalogWithStock: 0,
    source: 'none'
  });
  const [idleLoading, setIdleLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  // Debounce البحث: 103 ألف صف × ~15 عملية حسابية مع كل حرف كانت بتعمل ثقل واضح.
  // الفلتر الفعلي هيستخدم القيمة المتأخرة دي عشان الحساب يحصل مرة واحدة بعد ما توقف الكتابة.
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => window.clearTimeout(t);
  }, [searchTerm]);
  const [searchMode, setSearchMode] = useState<'all' | 'customer'>('all');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [selectedSearchCustomer, setSelectedSearchCustomer] = useState<CustomerItemSalesSummary | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [selectedSector, setSelectedSector] = useState<'all' | 'home' | 'electrical'>('all');
  const [selectedFamily, setSelectedFamily] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<string>('all');
  const [customerDisplayLimit, setCustomerDisplayLimit] = useState<number>(5);

  const [activeView, setActiveView] = useState<SalesViewMode>('overview');
  const [selectedCustomerAccount, setSelectedCustomerAccount] = useState<string | null>(null);
  const [expandedCustomerAccounts, setExpandedCustomerAccounts] = useState<Set<string>>(new Set());

  const initialExpandDone = useRef(false);
  const loadSalesInProgress = useRef(false);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  const loadSalesData = async (options?: { forceRemote?: boolean }) => {
    // منع تكرار التحميل بسبب حدث الحفظ (save event) الذي يُطلق عند المزامنة/الجلب من Supabase
    if (loadSalesInProgress.current) return;
    // حساب بلا قطاع: محجوب عن بيانات القطاعين — بدون جلب ولا عرض.
    if (isSectorBlocked) {
      setSalesRecords([]);
      setIsLoading(false);
      return;
    }
    loadSalesInProgress.current = true;

    const forceRemote = options?.forceRemote === true;
    setIsLoading(true);
    setSyncErrorMsg(null);
    if (!forceRemote) setSyncSuccessMsg(null);
    try {
      // 1. تحميل فوري من الكاش المحلي/IndexedDB لتقليل egress وعدم تنزيل بيانات ضخمة تلقائياً
      const saved = await getSavedCustomerItemSales();
      let localBackup = saved.filter((record) => !String(record.id || '').startsWith('cis-demo-'));
      if (localBackup.length !== saved.length) {
        await saveCustomerItemSales(localBackup);
      }

      // 2. قراءة عدد السجلات في Supabase فقط (استعلام خفيف مفلتر بالنطاق) للمقارنة والمزامنة الآلية
      let remoteCount = -1;
      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
      if (isOnline && (!localBackup.length || !isItemSalesCountCheckFresh() || forceRemote)) {
        try {
          remoteCount = await getSupabaseCustomerItemSalesCount(itemSalesScope);
          if (remoteCount >= 0) {
            setSupabaseCount(remoteCount);
            setItemSalesSyncMeta({ lastCountCheckAt: new Date().toISOString() });
          }
        } catch {
          remoteCount = -1;
        }
      }

      const shouldAutoPull =
        isOnline &&
        remoteCount > 0 &&
        (localBackup.length === 0 || remoteCount !== localBackup.length);
      if (!forceRemote && !shouldAutoPull) {
        setSalesRecords(localBackup);
        if (localBackup.length > 0) {
          setSyncSuccessMsg(`تم عرض ${localBackup.length.toLocaleString('ar-EG')} حركة محدّثة.`);
        }
        return;
      }

      // 3. جلب مفلتر بالنطاق فقط عند طلب المستخدم صراحةً (forceRemote)
      //    جلب جزئي: لو عندنا كاش وسبق الجلب، بنطلب الصفوف اللي اتغيرت بعد آخر جلب
      //    بدل تنزيل الجدول كله كل مرة (توفير egress حقيقي).
      const syncMeta = getItemSalesSyncMeta();
      const incrementalSince =
        localBackup.length > 0 && syncMeta.lastPullAt ? syncMeta.lastPullAt : undefined;
      let supabaseSales: CustomerItemSaleRecord[] = [];
      let supabaseError: string | null = null;
      try {
        const fetchRes = await fetchCustomerItemSalesFromSupabase(undefined, itemSalesScope, {
          updatedSince: incrementalSince
        });
        if (fetchRes.error) {
          supabaseError = fetchRes.error;
        } else if (fetchRes.sales && fetchRes.sales.length > 0) {
          supabaseSales = fetchRes.sales;
        }
      } catch (err: any) {
        supabaseError = err?.message || 'فشل الاتصال بـ Supabase';
      }

      if (supabaseSales.length > 0 && !supabaseError) {
        if (incrementalSince) {
          // دمج بالمعرّف: مايمسحش حركات تانية لنفس العميل/الصنف/الشهر
          await saveCustomerItemSales(supabaseSales, 'upsert');
          const merged = await getSavedCustomerItemSales();
          setSalesRecords(merged);
          setSupabaseCount(merged.length);
          setSyncSuccessMsg(
            `تم تحديث ${supabaseSales.length.toLocaleString('ar-EG')} حركة متغيرة فقط من Supabase (جلب جزئي).`
          );
        } else {
          setSalesRecords(supabaseSales);
          setSupabaseCount(supabaseSales.length);
          // حفظ في الكاش المحلي لتقليل الجلب مستقبلاً
          await saveCustomerItemSales(supabaseSales);
          setSyncSuccessMsg(
            `تم جلب ${supabaseSales.length.toLocaleString('ar-EG')} حركة من Supabase وحفظها محلياً.`
          );
        }
        setItemSalesSyncMeta({ lastPullAt: new Date().toISOString() });
      } else if (supabaseError) {
        setSalesRecords(localBackup);
        setSyncErrorMsg(
          `فشل الاتصال بـ Supabase: ${supabaseError}. يتم عرض البيانات المخزنة محلياً (${localBackup.length.toLocaleString('ar-EG')} حركة).`
        );
      } else if (incrementalSince) {
        // جلب جزئي رجع صفر صف = مفيش تغييرات على السيرفر — مش خطأ
        setSalesRecords(localBackup);
        setSyncSuccessMsg(
          `لا توجد تغييرات جديدة على Supabase منذ آخر جلب — يتم عرض ${localBackup.length.toLocaleString('ar-EG')} حركة من الكاش المحلي.`
        );
      } else if (remoteCount > 0 && supabaseSales.length === 0) {
        setSalesRecords(localBackup);
        setSyncErrorMsg(
          `قاعدة Supabase تحتوي على ${remoteCount.toLocaleString('ar-EG')} سجل لكنها لم تُجلب. يتم عرض البيانات المخزنة محلياً.`
        );
      } else {
        setSalesRecords(localBackup);
      }
    } finally {
      setIsLoading(false);
      loadSalesInProgress.current = false;
    }
  };

  useEffect(() => {
    loadSalesData();

    // Auto-refresh when an Excel file is uploaded from the Excel tab or background
    const handleUpdate = () => {
      loadSalesData();
    };
    window.addEventListener('tantawy-customer-item-sales-updated', handleUpdate);
    return () => window.removeEventListener('tantawy-customer-item-sales-updated', handleUpdate);
  }, []);

  const handlePushToSupabase = async () => {
    if (salesRecords.length === 0) {
      setSyncErrorMsg('لا توجد سجلات مبيعات لرفعها إلى Supabase');
      return;
    }
    setIsSupabasePushing(true);
    setSyncErrorMsg(null);
    setSyncSuccessMsg(null);
    try {
      const res = await pushCustomerItemSalesToSupabase(salesRecords, (synced, total) => {
        setSupabasePushProgress({ synced, total });
      });
      if (res.success) {
        setSupabaseCount(res.syncedCount);
        setSyncSuccessMsg(
          `تم بنجاح رفع ومزامنة ${res.syncedCount.toLocaleString('ar-EG')} حركة إلى جدول customer_item_sales في Supabase!` +
            (res.prunedCount && res.prunedCount > 0
              ? ` وتم تنظيف ${res.prunedCount.toLocaleString('ar-EG')} صف قديم بكمية/مبلغ صفر.`
              : '') +
            ' أصبحت البيانات متطابقة سحابياً.'
        );
      } else {
        setSyncErrorMsg(res.error || 'فشلت المزامنة مع Supabase');
      }
    } finally {
      setIsSupabasePushing(false);
      setSupabasePushProgress(null);
    }
  };

  const handleFetchFromSupabase = async () => {
    setIsSupabaseFetching(true);
    setSyncErrorMsg(null);
    setSyncSuccessMsg(null);
    try {
      const res = await fetchCustomerItemSalesFromSupabase(undefined, itemSalesScope);
      if (res.error) {
        setSyncErrorMsg(res.error);
      } else {
        setSalesRecords(res.sales);
        setSupabaseCount(res.sales.length);
        await saveCustomerItemSales(res.sales);
        publishItemSalesAggregates(res.sales);
        setSyncSuccessMsg(`تم بنجاح جلب ${res.sales.length.toLocaleString('ar-EG')} حركة من Supabase وحفظها محلياً.`);
      }
    } finally {
      setIsSupabaseFetching(false);
    }
  };

  const handleClearSales = () => {
    setShowClearConfirm(true);
  };

  const executeClearSales = async () => {
    await clearCustomerItemSales();
    setSalesRecords([]);
    setShowClearConfirm(false);
    setSyncSuccessMsg('تم مسح وتصفير كافة سجلات مبيعات الأصناف بنجاح.');
    setSyncErrorMsg(null);
  };

  const handleExcelFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingExcel(true);
    setSyncErrorMsg(null);
    setSyncSuccessMsg(null);
    try {
      const parsed = await parseExcelCustomerItemSales(file);
      if (parsed.errors.length > 0 && parsed.sales.length === 0) {
        setSyncErrorMsg(parsed.errors[0]);
        return;
      }
      const enriched =
        customers.length > 0
          ? enrichCustomerItemSalesWithDirectory(parsed.sales, customers).enriched
          : parsed.sales;
      await saveCustomerItemSales(enriched, 'merge');
      const allSaved = await getSavedCustomerItemSales();
      setSalesRecords(allSaved);
      publishItemSalesAggregates(allSaved);

      const importedMonths = Array.from(new Set(enriched.map((r) => Number(r.month)).filter((m) => m >= 1 && m <= 12))).sort((a, b) => a - b);
      if (importedMonths.length === 1) {
        setSelectedMonth(importedMonths[0]);
      }

      const monthText = importedMonths.length > 0 ? importedMonths.map((m) => MONTH_NAMES_MAP[m] || m).join('، ') : 'غير محدد';
      setSyncSuccessMsg(`تم استيراد ${enriched.length.toLocaleString('ar-EG')} سجل من شيت مبيعات الأصناف (${monthText}) ودمجها مع السجل الشهري.`);

      // مزامنة الدفعة المرفوعة مع قاعدة البيانات السحابية بالخلفية عند الإمكان
      pushCustomerItemSalesToSupabase(enriched)
        .then((res) => {
          if (res.success) setSupabaseCount((prev) => Math.max(prev ?? 0, res.syncedCount));
        })
        .catch(() => {});
    } catch (err: any) {
      setSyncErrorMsg(`تعذر قراءة شيت مبيعات الأصناف: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsImportingExcel(false);
      if (excelFileInputRef.current) excelFileInputRef.current.value = '';
    }
  };

  // كود العميل → اسمه في قاعدة العملاء (لكي يظهر الاسم الحقيقي في الجداول مش الكود)
  const customerNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((customer) => {
      const code = String(customer.code || '').trim().toLowerCase();
      const name = String(customer.name || customer.storeName || '').trim();
      if (code && name) map.set(code, name);
    });
    return map;
  }, [customers]);

  // الـ directory enrichment بيتعمل مرة واحدة بس — ويتم مشاركة بياناته وإحصائياته
  // (كان بيتعمل مرتين: هنا وفي customerLinkStats → ثقل زيادة على 103 ألف صف).
  const directoryResult = useMemo(() => {
    if (salesRecords.length === 0 || customers.length === 0) {
      return { enriched: salesRecords, matchedRecordsCount: 0, distinctCustomersMatched: 0 };
    }
    return enrichCustomerItemSalesWithDirectory(salesRecords, customers);
  }, [salesRecords, customers]);

  // Automatically link customer codes with master Customer directory to extract authoritative branch and rep
  // وبعدها بنكمّل اسم الصنف وعائلته من كتالوج المنتجات (عشان «الصنف بالعائلة» متقعدش «عام»)
  const enrichedSalesRecords = useMemo(() => {
    if (salesRecords.length === 0) return salesRecords;
    // أولًا نكمّل «عام» من صفوف تانية لنفس الصنف (الشيت فيه تصنيف لبعض الصفوف بس)
    // بنمرّر كل salesRecords عشان الخريطة تبقى من كل الداتا مش بس المفلترة
    const withFamilies = fillGenericFamiliesFromSiblings(directoryResult.enriched, salesRecords);
    return enrichCustomerItemSalesWithCatalog(withFamilies, products);
  }, [salesRecords, directoryResult, products]);

  const customerLinkStats = useMemo(() => {
    return {
      linkedRecords: directoryResult.matchedRecordsCount,
      linkedCustomers: directoryResult.distinctCustomersMatched,
      totalSales: salesRecords.length
    };
  }, [directoryResult, salesRecords.length]);

  const handleEnrichAndPersistSales = async () => {
    if (salesRecords.length === 0) return;
    const res = enrichCustomerItemSalesWithDirectory(salesRecords, customers, { forceOverwrite: true });
    await saveCustomerItemSales(res.enriched);
    setSalesRecords(res.enriched);
    setSyncSuccessMsg(
      `تم بنجاح مطابقة كود العميل بقاعدة العملاء لـ (${res.distinctCustomersMatched.toLocaleString('ar-EG')} عميل) وتثبيت فروعهم ومناديبهم في (${res.matchedRecordsCount.toLocaleString('ar-EG')} حركة مبيعات)!`
    );
    setSyncErrorMsg(null);
  };

  const rbacSales = useMemo(() => {
    if (isSectorBlocked) return [];
    const authorizedSales = showAllSalesOverride
      ? enrichedSalesRecords
      : filterCustomerItemSalesByRBAC(enrichedSalesRecords, currentUser, users, customers);
    const effectiveSector = itemSalesSector;
    if (effectiveSector === 'all') return authorizedSales;
    if (effectiveSector === 'none') return [];
    // نفس موحّد القطاع المستخدم في baseSales/التحليل — قطاع موحّد لكل المسارات.
    return authorizedSales.filter((record) => sectorResolver.matches(record, effectiveSector));
  }, [enrichedSalesRecords, currentUser, users, customers, showAllSalesOverride, itemSalesSector, sectorResolver, isSectorBlocked]);

  /** الفروع الثابتة اللي الإدارة بتشتغل عليها (+ «غير محدد» لو الحركة بلا فرع). */
  const resolveItemSaleBranch = React.useCallback(
    (record: CustomerItemSaleRecord): string =>
      normalizeBranchName(record.linkedBranch) ||
      normalizeBranchName(record.warehouse) ||
      UNKNOWN_BRANCH,
    []
  );

  /** كل الفلاتر ما عدا الشهر — أساس حساب المقارنة الشهرية. */
  const baseSales = useMemo(() => {
    return rbacSales.filter((record) => {
      if (selectedGroup !== 'all' && resolveItemGroup(record) !== selectedGroup) return false;
      if (selectedRep !== 'all' && record.repName !== selectedRep) return false;
      if (selectedWarehouse !== 'all' && resolveItemSaleBranch(record) !== selectedWarehouse) return false;
      if (selectedSector !== 'all' && !sectorResolver.matches(record, selectedSector)) return false;
      if (selectedFamily !== 'all' && resolveItemGroup(record) !== selectedFamily) return false;
      if (
        selectedItem !== 'all' &&
        (record.unifiedCode || record.itemCode || '').trim() !== selectedItem
      ) {
        return false;
      }
      if (debouncedSearchTerm.trim()) {
        const query = debouncedSearchTerm.toLowerCase().trim();
        const matches =
          searchMode === 'customer'
            ? Boolean(
                record.invoicingName?.toLowerCase().includes(query) ||
                  record.customerAccount?.toLowerCase().includes(query)
              )
            : Boolean(
                record.invoicingName?.toLowerCase().includes(query) ||
                  record.customerAccount?.toLowerCase().includes(query) ||
                  record.itemName?.toLowerCase().includes(query) ||
                  record.itemCode?.toLowerCase().includes(query) ||
                  record.definitions?.toLowerCase().includes(query) ||
                  record.familyDimension?.toLowerCase().includes(query) ||
                  record.salesOrder?.toLowerCase().includes(query) ||
                  record.repName?.toLowerCase().includes(query)
              );
        if (!matches) return false;
      }
      return true;
    });
  }, [
    rbacSales,
    selectedGroup,
    selectedRep,
    selectedWarehouse,
    selectedSector,
    selectedFamily,
    selectedItem,
    resolveItemSaleBranch,
    resolveItemSaleSector,
    sectorResolver,
    debouncedSearchTerm,
    searchMode
  ]);

  const filteredSales = useMemo(
    () =>
      selectedMonth === 'all'
        ? baseSales
        : baseSales.filter((record) => Number(record.month) === selectedMonth),
    [baseSales, selectedMonth]
  );

  /** وصف مختصر للنطاق الحالي بيظهر فوق جداول تحليل الإجماليات. */
  const analysisSubtitle = [
    selectedMonth === 'all' ? 'كل الشهور' : MONTH_NAMES_MAP[selectedMonth],
    selectedSector === 'all' ? 'كل القطاعات' : selectedSector === 'home' ? 'منزلي' : 'كهربائي',
    selectedWarehouse !== 'all' ? `فرع ${selectedWarehouse}` : '',
    selectedRep !== 'all' ? `مندوب ${selectedRep}` : '',
    selectedFamily !== 'all' ? `عائلة ${selectedFamily}` : ''
  ]
    .filter(Boolean)
    .join(' • ');

  // خيارات الفلاتر تتقيّد بالسياق الحالي (الشهر + باقي الفلاتر ما عدا الفلتر نفسه)
  // عشان لما تختار شهر تشوف المناديب/الفروع المتاحة فعليًا وتقدر تكمل تضييق.
  const monthScopedSales = useMemo(
    () =>
      selectedMonth === 'all'
        ? rbacSales
        : rbacSales.filter((record) => Number(record.month) === selectedMonth),
    [rbacSales, selectedMonth]
  );

  const matchesSearchFilter = React.useCallback(
    (record: CustomerItemSaleRecord): boolean => {
      if (!debouncedSearchTerm.trim()) return true;
      const query = debouncedSearchTerm.toLowerCase().trim();
      return searchMode === 'customer'
        ? Boolean(
            record.invoicingName?.toLowerCase().includes(query) ||
              record.customerAccount?.toLowerCase().includes(query)
          )
        : Boolean(
            record.invoicingName?.toLowerCase().includes(query) ||
              record.customerAccount?.toLowerCase().includes(query) ||
              record.itemName?.toLowerCase().includes(query) ||
              record.itemCode?.toLowerCase().includes(query) ||
              record.definitions?.toLowerCase().includes(query) ||
              record.familyDimension?.toLowerCase().includes(query) ||
              record.salesOrder?.toLowerCase().includes(query) ||
              record.repName?.toLowerCase().includes(query)
          );
    },
    [debouncedSearchTerm, searchMode]
  );

  /**
   * خيارات الفلاتر كلها في لفة واحدة بدل 5 لفات على نفس الصفوف
   * (كان ثقل كبير على 126 ألف صف). نفس شروط الفلاتر المستخدمة في baseSales،
   * فالقوائم الناتجة متطابقة.
   */
  const filterOptions = useMemo(() => {
    const groups = new Set<string>();
    const reps = new Set<string>();
    const presentBranches = new Set<string>();
    const families = new Set<string>();
    const items = new Map<string, { code: string; name: string; amount: number }>();

    for (const record of monthScopedSales) {
      if (!matchesSearchFilter(record)) continue;
      if (selectedSector !== 'all' && !sectorResolver.matches(record, selectedSector)) continue;

      const group = resolveItemGroup(record);
      const branch = resolveItemSaleBranch(record);
      const code = (record.unifiedCode || record.itemCode || '').trim();

      const groupOk = selectedGroup === 'all' || group === selectedGroup;
      const repOk = selectedRep === 'all' || record.repName === selectedRep;
      const branchOk = selectedWarehouse === 'all' || branch === selectedWarehouse;
      const familyOk = selectedFamily === 'all' || group === selectedFamily;
      const itemOk = selectedItem === 'all' || code === selectedItem;

      if (repOk && branchOk && familyOk && itemOk && group && group !== 'عام') groups.add(group);
      if (groupOk && branchOk && familyOk && itemOk && record.repName) reps.add(record.repName);
      if (groupOk && repOk && familyOk && itemOk) presentBranches.add(branch);
      if (groupOk && repOk && branchOk && itemOk && group && group !== 'عام') families.add(group);
      if (groupOk && repOk && branchOk && familyOk && code) {
        const current = items.get(code) || { code, name: record.itemName || code, amount: 0 };
        current.amount += Number(record.amount) || 0;
        items.set(code, current);
      }
    }

    return { groups, reps, presentBranches, families, items };
  }, [
    monthScopedSales,
    matchesSearchFilter,
    resolveItemGroup,
    resolveItemSaleBranch,
    sectorResolver,
    selectedGroup,
    selectedRep,
    selectedWarehouse,
    selectedSector,
    selectedFamily,
    selectedItem
  ]);

  const distinctGroups = useMemo(() => {
    const set = new Set(filterOptions.groups);
    if (selectedGroup !== 'all' && selectedGroup) set.add(selectedGroup);
    return Array.from(set).sort();
  }, [filterOptions.groups, selectedGroup]);

  const distinctReps = useMemo(() => {
    const set = new Set(filterOptions.reps);
    if (selectedRep !== 'all' && selectedRep) set.add(selectedRep);
    return Array.from(set).sort();
  }, [filterOptions.reps, selectedRep]);

  const distinctWarehouses = useMemo(() => {
    const ordered = (CANONICAL_BRANCHES as readonly string[]).filter((branch) =>
      filterOptions.presentBranches.has(branch)
    );
    if (selectedWarehouse !== 'all' && selectedWarehouse && !ordered.includes(selectedWarehouse as any)) {
      return [...ordered, selectedWarehouse];
    }
    return ordered;
  }, [filterOptions.presentBranches, selectedWarehouse]);

  const distinctFamilies = useMemo(() => {
    const set = new Set(filterOptions.families);
    if (selectedFamily !== 'all' && selectedFamily) set.add(selectedFamily);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [filterOptions.families, selectedFamily]);

  const distinctItems = useMemo(() => {
    const list = Array.from(filterOptions.items.values()).sort((a, b) => b.amount - a.amount);
    if (selectedItem !== 'all' && selectedItem && !filterOptions.items.has(selectedItem)) {
      return [{ code: selectedItem, name: selectedItem, amount: 0 }, ...list].slice(0, 401);
    }
    return list.slice(0, 400);
  }, [filterOptions.items, selectedItem]);

  const monthBreakdown = useMemo(() => {
    const map = new Map<number, { month: number; name: string; count: number; amount: number }>();
    baseSales.forEach((record) => {
      const m = Number(record.month) || 0;
      // سجلات بدون شهر معروف متتحسبش في أي شهر بدل ما تدخل في يناير
      if (m < 1 || m > 12) return;
      const cur = map.get(m) || { month: m, name: MONTH_NAMES_MAP[m] || `شهر ${m}`, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(record.amount || 0);
      map.set(m, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.month - b.month);
  }, [baseSales]);

  const computedDiagnostics = useMemo(() => {
    // التشخيص للمطور/الدعم فقط — من غير كده كنا بنمر على 126 ألف صف لكل مستخدم.
    if (!canSeeDiagnostics) {
      return {
        supabaseCount: 0,
        loadedCount: 0,
        numericValuesCount: 0,
        afterRbacCount: 0,
        afterFiltersCount: 0
      };
    }
    const numericValuesCount = salesRecords.filter(
      (r) => Number(r.quantity || 0) > 0 || Number(r.amount || 0) > 0
    ).length;
    return {
      supabaseCount: supabaseCount ?? 0,
      loadedCount: salesRecords.length,
      numericValuesCount,
      afterRbacCount: rbacSales.length,
      afterFiltersCount: filteredSales.length
    };
  }, [canSeeDiagnostics, salesRecords, rbacSales, filteredSales, supabaseCount]);

  const customerSummaries = useMemo(
    () => aggregateCustomerItemSales(filteredSales, customers),
    [filteredSales, customers]
  );

  const searchedCustomers = useMemo(() => {
    if (!customerSearchTerm.trim()) return [];
    const query = customerSearchTerm.toLowerCase().trim();
    return customerSummaries
      .filter(
        (s) =>
          s.customerName.toLowerCase().includes(query) ||
          s.customerAccount.toLowerCase().includes(query)
      )
      .slice(0, 5);
  }, [customerSearchTerm, customerSummaries]);

  const latestMonth = useMemo(() => resolveLatestSalesMonth(baseSales), [baseSales]);
  const growthMonth = selectedMonth === 'all' ? latestMonth : selectedMonth;
  const previousMonth = growthMonth && growthMonth > 1 ? growthMonth - 1 : null;

  const previousMonthSales = useMemo(
    () =>
      previousMonth
        ? baseSales.filter((record) => Number(record.month) === previousMonth)
        : [],
    [baseSales, previousMonth]
  );

  const comparison = useMemo(
    () => buildPeriodComparison(filteredSales, baseSales, selectedMonth, latestMonth),
    [filteredSales, baseSales, selectedMonth, latestMonth]
  );

  /* ---------------- لوحة تحليل الأصناف (Item-centric) ---------------- */
  const periodTotals = useMemo(() => buildPeriodTotals(filteredSales), [filteredSales]);
  const previousPeriodTotals = useMemo(
    () => buildPeriodTotals(previousMonthSales),
    [previousMonthSales]
  );

  const groupMix = useMemo(() => buildGroupInsights(filteredSales), [filteredSales]);

  const topItemsByValue = useMemo(
    () => buildItemRanking(filteredSales, previousMonthSales, { metric: 'amount', limit: 10 }),
    [filteredSales, previousMonthSales]
  );

  const topItemsByQuantity = useMemo(
    () => buildItemRanking(filteredSales, previousMonthSales, { metric: 'quantity', limit: 10 }),
    [filteredSales, previousMonthSales]
  );

  const slowMovers = useMemo(
    () =>
      buildItemRanking(filteredSales, previousMonthSales, {
        metric: 'amount',
        limit: 6,
        order: 'asc'
      }),
    [filteredSales, previousMonthSales]
  );

  const monthlyPerformance = useMemo(() => buildMonthlyPerformance(baseSales, 6), [baseSales]);

  const monthlyPerformanceGrowth = useMemo(() => {
    if (monthlyPerformance.length < 2) return null;
    const last = monthlyPerformance[monthlyPerformance.length - 1];
    const before = monthlyPerformance[monthlyPerformance.length - 2];
    return growthPct(last.amount, before.amount);
  }, [monthlyPerformance]);

  const monthlyCustomerRows = useMemo(() => buildMonthlyCustomerAnalysis(baseSales), [baseSales]);

  /** الشهور الموجودة في نطاق الفلاتر الحالي (لجداول التحليل بالشهور). */
  const analysisMonths = useMemo(() => {
    const set = new Set<number>();
    (filteredSales || []).forEach((r) => {
      const m = Number(r.month) || 0;
      if (m >= 1 && m <= 12) set.add(m);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [filteredSales]);

  /** الصنف (البرند/اسم الصنف) بالشهور — صف لكل صنف وأعمدة بالشهور + الإجمالي. */
  const itemSalesByMonthPivot = useMemo(() => {
    const map = new Map<string, { key: string; name: string; months: Record<number, { quantity: number; amount: number }>; totalQty: number; totalAmount: number }>();
    (filteredSales || []).forEach((r) => {
      const month = Number(r.month) || 0;
      if (month < 1 || month > 12) return;
      const key = String(r.unifiedCode || r.itemCode || r.itemName || '').trim() || `item-${r.id || ''}`;
      const name = String(r.itemName || r.definitions || r.itemCode || 'صنف غير محدد').trim();
      const cur = map.get(key) || { key, name, months: {}, totalQty: 0, totalAmount: 0 };
      const qty = Number(r.quantity) || 0;
      const amt = Number(r.amount) || 0;
      const m = cur.months[month] || { quantity: 0, amount: 0 };
      m.quantity += qty; m.amount += amt;
      cur.months[month] = m;
      cur.totalQty += qty; cur.totalAmount += amt;
      if (!cur.name && name) cur.name = name;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredSales]);

  /** الصنف بالعائلة بالشهور — صف لكل (عائلة) وأعمدة بالشهور + الإجمالي. */
  const familySalesByMonthPivot = useMemo(() => {
    const map = new Map<string, { family: string; months: Record<number, { quantity: number; amount: number }>; totalQty: number; totalAmount: number }>();
    (filteredSales || []).forEach((r) => {
      const month = Number(r.month) || 0;
      if (month < 1 || month > 12) return;
      const family = String(resolveItemGroup(r) || r.familyDimension || r.itemGroup || '').trim() || 'عام';
      const cur = map.get(family) || { family, months: {}, totalQty: 0, totalAmount: 0 };
      const qty = Number(r.quantity) || 0;
      const amt = Number(r.amount) || 0;
      const m = cur.months[month] || { quantity: 0, amount: 0 };
      m.quantity += qty; m.amount += amt;
      cur.months[month] = m;
      cur.totalQty += qty; cur.totalAmount += amt;
      map.set(family, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredSales]);

  /** مبيعات الفروع بالصنف بالشهور. */
  const branchItemSalesByMonth = useMemo(() => {
    const map = new Map<string, { branch: string; itemKey: string; itemName: string; months: Record<number, { quantity: number; amount: number }>; totalQty: number; totalAmount: number }>();
    (filteredSales || []).forEach((r) => {
      const month = Number(r.month) || 0;
      if (month < 1 || month > 12) return;
      const branch = resolveItemSaleBranch(r);
      const itemKey = String(r.unifiedCode || r.itemCode || r.itemName || '').trim() || `item-${r.id || ''}`;
      const itemName = String(r.itemName || r.definitions || r.itemCode || 'صنف غير محدد').trim();
      const key = `${branch}||${itemKey}`;
      const cur = map.get(key) || { branch, itemKey, itemName, months: {}, totalQty: 0, totalAmount: 0 };
      const qty = Number(r.quantity) || 0; const amt = Number(r.amount) || 0;
      const m = cur.months[month] || { quantity: 0, amount: 0 };
      m.quantity += qty; m.amount += amt;
      cur.months[month] = m; cur.totalQty += qty; cur.totalAmount += amt;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredSales, resolveItemSaleBranch]);

  /** مبيعات الفروع بالعائلة بالشهور. */
  const branchFamilySalesByMonth = useMemo(() => {
    const map = new Map<string, { branch: string; family: string; months: Record<number, { quantity: number; amount: number }>; totalQty: number; totalAmount: number }>();
    (filteredSales || []).forEach((r) => {
      const month = Number(r.month) || 0;
      if (month < 1 || month > 12) return;
      const branch = resolveItemSaleBranch(r);
      const family = String(resolveItemGroup(r) || r.familyDimension || r.itemGroup || '').trim() || 'عام';
      const key = `${branch}||${family}`;
      const cur = map.get(key) || { branch, family, months: {}, totalQty: 0, totalAmount: 0 };
      const qty = Number(r.quantity) || 0; const amt = Number(r.amount) || 0;
      const m = cur.months[month] || { quantity: 0, amount: 0 };
      m.quantity += qty; m.amount += amt;
      cur.months[month] = m; cur.totalQty += qty; cur.totalAmount += amt;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredSales, resolveItemSaleBranch]);

  /** مبيعات الأصناف بالشهور وبالعائلة للمندوب المختار — تظهر داخل بروفايل المندوب. */
  const selectedRepBreakdown = useMemo(() => {
    if (selectedRep === 'all') return null;
    const repRecords = (filteredSales || []).filter((r) => r.repName === selectedRep);
    if (repRecords.length === 0) return null;

    const monthMap = new Map<number, { month: number; amount: number; quantity: number }>();
    const familyMap = new Map<string, { family: string; amount: number; quantity: number; monthly: Record<number, number> }>();
    repRecords.forEach((r) => {
      const month = Number(r.month) || 0;
      const amount = Number(r.amount) || 0;
      const quantity = Number(r.quantity) || 0;
      if (month >= 1 && month <= 12) {
        const cur = monthMap.get(month) || { month, amount: 0, quantity: 0 };
        cur.amount += amount;
        cur.quantity += quantity;
        monthMap.set(month, cur);
      }
      const family = String(resolveItemGroup(r) || r.familyDimension || r.itemGroup || '').trim() || 'عام';
      const f = familyMap.get(family) || { family, amount: 0, quantity: 0, monthly: {} as Record<number, number> };
      f.amount += amount;
      f.quantity += quantity;
      if (month >= 1 && month <= 12) f.monthly[month] = (f.monthly[month] || 0) + amount;
      familyMap.set(family, f);
    });

    return {
      byMonth: Array.from(monthMap.values()).sort((a, b) => a.month - b.month),
      byFamily: Array.from(familyMap.values()).sort((a, b) => b.amount - a.amount)
    };
  }, [filteredSales, selectedRep]);

  const repPerformance = useMemo(() => buildRepPerformance(filteredSales, 6), [filteredSales]);

  // حساب الأصناف الراكدة ثقيل (نصف ثانية+ على 126 ألف صف) — بنأجّله لما بعد
  // أول رسم عشان الصفحة تفتح فورًا، والكارت بيعرض «...» لحد ما يخلص.
  useEffect(() => {
    let cancelled = false;
    setIdleLoading(true);
    const timer = window.setTimeout(() => {
      const next = buildIdleItems(filteredSales, baseSales, products || [], 6);
      if (cancelled) return;
      setIdleItems(next);
      setIdleLoading(false);
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filteredSales, baseSales, products]);

  const idleCaption = useMemo(() => {
    if (idleItems.source === 'catalog') {
      return `من ${idleItems.catalogWithStock.toLocaleString('en-US')} صنف برصيد في الكتالوج`;
    }
    if (idleItems.source === 'sales-history') return 'بدون حركة في الفترة المحددة';
    return 'الكتالوج غير محمّل';
  }, [idleItems]);

  /**
   * عند اختيار «كل الشهور» مفيش فترة سابقة مكافئة للسنة، فبنقارن آخر شهر
   * متاح بالشهر اللي قبله — نفس منطق buildPeriodComparison للمبيعات.
   */
  const beforeLatestMonthSales = useMemo(
    () =>
      latestMonth && latestMonth > 1
        ? baseSales.filter((record) => Number(record.month) === latestMonth - 1)
        : [],
    [baseSales, latestMonth]
  );

  const kpiPreviousQuantity = useMemo(() => {
    if (selectedMonth === 'all') {
      return latestMonth ? buildPeriodTotals(beforeLatestMonthSales).quantity : 0;
    }
    return previousPeriodTotals.quantity;
  }, [selectedMonth, latestMonth, beforeLatestMonthSales, previousPeriodTotals]);

  const kpiPreviousItemsCount = useMemo(() => {
    if (selectedMonth === 'all') {
      return latestMonth ? buildPeriodTotals(beforeLatestMonthSales).itemsCount : 0;
    }
    return previousPeriodTotals.itemsCount;
  }, [selectedMonth, latestMonth, beforeLatestMonthSales, previousPeriodTotals]);

  const kpiGrowthCaption =
    comparison.growthPct !== null ? 'مقارنة بالفترة السابقة' : 'نمو آخر شهر متاح';

  const customerInsights = useMemo(() => {
    const growthMap = buildCustomerGrowthMap(baseSales, growthMonth);
    return buildCustomerInsights(customerSummaries, filteredSales, growthMap, comparison.currentAmount)
      .sort((a, b) => b.amount - a.amount);
  }, [customerSummaries, filteredSales, baseSales, growthMonth, comparison.currentAmount]);

  /** توزيع كل عميل على شهور السنة كاملة — مستقل عن فلتر الشهر عشان الشبكة تفضل قابلة للتنقل. */
  const yearlySummaries = useMemo(() => {
    const grouped = aggregateCustomerItemSales(baseSales);
    return new Map(
      grouped.map((summary) => [summary.customerAccount || summary.customerName, summary])
    );
  }, [baseSales]);

  const alerts = useMemo(() => buildFollowUpAlerts(customerInsights), [customerInsights]);

  const selectedCustomer = useMemo(
    () =>
      customerInsights.find((customer) => customer.customerAccount === selectedCustomerAccount) ||
      customerInsights[0] ||
      null,
    [customerInsights, selectedCustomerAccount]
  );

  useEffect(() => {
    if (customerInsights.length === 0) {
      if (selectedCustomerAccount !== null) setSelectedCustomerAccount(null);
      return;
    }
    const exists = customerInsights.some(
      (customer) => customer.customerAccount === selectedCustomerAccount
    );
    if (!exists) setSelectedCustomerAccount(customerInsights[0].customerAccount);
  }, [customerInsights, selectedCustomerAccount]);

  useEffect(() => {
    const initial = new Set<string>();
    customerSummaries.slice(0, 2).forEach((summary) => initial.add(summary.customerAccount));
    setExpandedCustomerAccounts(initial);
    // إعادة الضبط فقط عند تغيير فلاتر النطاق — وليس مع كل كتابة في البحث أو تغيير الشهر.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup, selectedRep, selectedWarehouse]);

  useEffect(() => {
    if (initialExpandDone.current || customerSummaries.length === 0) return;
    initialExpandDone.current = true;
    setExpandedCustomerAccounts(
      new Set(customerSummaries.slice(0, 2).map((summary) => summary.customerAccount))
    );
  }, [customerSummaries]);

  const toggleCustomerExpand = (account: string) => {
    setExpandedCustomerAccounts((previous) => {
      const next = new Set(previous);
      if (next.has(account)) next.delete(account);
      else next.add(account);
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedCustomerAccounts(new Set(customerSummaries.map((summary) => summary.customerAccount)));
  };

  const handleCollapseAll = () => setExpandedCustomerAccounts(new Set());

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedMonth('all');
    setSelectedGroup('all');
    setSelectedRep('all');
    setSelectedWarehouse('all');
    setSelectedSector('all');
    setSelectedFamily('all');
    setSelectedItem('all');
  };

  // التصدير بيحمّل **البيانات المجمّعة** (عميل + شهر + صنف + عائلة) مش عشرات آلاف الصفوف الخام
  const handleExportExcel = () => {
    downloadItemSalesRowsCsv(
      aggregateItemSalesRows(filteredSales, resolveItemSaleSector, customerNameByCode),
      `مبيعات_الأصناف_مجمعة_${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  const handleStartOrderForCustomer = (account: string, itemCode?: string) => {
    const matched = customers.find(
      (customer) => customer.code === account || customer.name === account
    );
    if (matched && onOpenNewOrderForCustomer) onOpenNewOrderForCustomer(matched, itemCode);
  };

  const openCustomerDetails = (account: string) => {
    setSelectedCustomerAccount(account);
    setActiveView('customers');
    setExpandedCustomerAccounts((previous) => new Set(previous).add(account));
  };

  if (isLoading) {
    return (
      <div className="tg-card p-10 flex flex-col items-center justify-center gap-3 min-h-[360px]">
        <Loader2 className="w-8 h-8 text-[var(--app-warn-text)] animate-spin" />
        <p className="text-xs font-bold text-[var(--tg-muted)]">جاري تحميل سجلات مبيعات الأصناف...</p>
      </div>
    );
  }

  return (
    <div className="cis-page space-y-4 pb-20" dir="rtl">
      <input
        ref={excelFileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleExcelFileImport}
        className="hidden"
        id="cis-monthly-excel-input"
      />

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-slate-900 text-base">مسح سجلات مبيعات الأصناف</h3>
                <p className="text-xs font-medium text-slate-600 mt-1 leading-relaxed">
                  هل أنت متأكد من مسح كافة سجلات مبيعات الأصناف المخزنة محلياً؟
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={executeClearSales}
                className="px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                تأكيد المسح
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <section className="ds-pagehead">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="ds-crumb text-[11px] font-bold mb-1">التقارير <span className="mx-1">›</span> <strong>مبيعات الأصناف</strong></div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 border border-white/20"><BarChart3 className="w-4 h-4 sm:w-5 sm:h-5"/></div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-black text-white leading-tight">تحليل مبيعات الأصناف (شهر بشهر)</h1>
                <p className="ds-pagehead__hint text-xs mt-0.5 max-w-2xl leading-relaxed">مبيعات فعلية منفصلة عن أوامر البيع — من الشيت/قاعدة البيانات بنطاق صلاحياتك.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-start sm:justify-end w-full sm:w-auto sm:shrink-0">
            <button
              type="button"
              onClick={() => loadSalesData({ forceRemote: true })}
              title="تحديث البيانات وجلب السجل من قاعدة البيانات"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>

            {salesRecords.length > 0 && (
              <button
                type="button"
                onClick={() => setToolsOpen((v) => !v)}
                aria-expanded={toolsOpen}
                aria-haspopup="menu"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] transition cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>أدوات</span>
              </button>
            )}
          </div>
        </div>

        {toolsOpen && salesRecords.length > 0 && (
          <div className="mt-2 flex flex-col sm:flex-row sm:w-fit gap-1.5 rounded-xl border border-white/15 bg-white/5 p-1.5">
            {customers.length > 0 && (
              <button
                type="button"
                onClick={() => { setToolsOpen(false); void handleEnrichAndPersistSales(); }}
                title="مطابقة كود العميل بقاعدة العملاء المركزية وتحديد الفرع والمندوب لكل حركة"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg border border-white/15 bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] transition cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                ربط الفروع والمناديب
              </button>
            )}
            <button
              type="button"
              onClick={() => { setToolsOpen(false); void handleExportExcel(); }}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg border border-white/15 bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              تصدير Excel
            </button>
          </div>
        )}

            <div className="pt-1 flex items-center gap-2 flex-wrap text-[10px]">
              {salesRecords.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--app-warn-tint)] rounded-lg text-[var(--app-warn-text)] font-bold border border-[var(--app-warn-line)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--app-warn-text)]" />
                  {salesRecords.length.toLocaleString('ar-EG')} حركة بيع منفذة
                </span>
              )}
              {supabaseCount !== null && supabaseCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--app-navy-tint)] rounded-lg text-[var(--app-navy-text)] font-bold border border-[var(--app-navy-line)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--app-navy-text)]" />
                  مزامنة Supabase: {supabaseCount.toLocaleString('ar-EG')} حركة سحابياً
                </span>
              )}
              {supabaseCount === 0 && salesRecords.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--app-risk-tint)] rounded-lg text-[var(--app-risk-text)] font-bold border border-[var(--app-risk-line)] animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--app-risk-text)]" />
                  قاعدة Supabase فارغة (0) — يلزم المزامنة السحابية
                </span>
              )}
              {lastSyncAt && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--app-ok-tint)] rounded-lg text-[var(--app-ok-text)] font-bold border border-[var(--app-ok-line)]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  آخر تحديث: {lastSyncAt}
                </span>
              )}
            </div>
      </section>

        {/* Directory linking info banner */}
        {salesRecords.length > 0 && customerLinkStats.linkedCustomers > 0 && (
          <div className="mt-4 bg-gradient-to-l from-[var(--app-ok)] via-[var(--app-ok)] to-[var(--app-navy)] border border-[var(--app-ok-line)] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[var(--app-ok)] text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Link2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-black text-white flex flex-wrap items-center gap-2">
                  <span>ربط كود العميل بقاعدة العملاء المركزية</span>
                  <span className="bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] text-[10px] px-2 py-0.5 rounded-md font-black border border-[var(--app-ok-line)]">
                    مفعّل وتلقائي ✓
                  </span>
                </div>
                <p className="text-[11px] text-white/85 mt-0.5">
                  تم ربط <strong>{customerLinkStats.linkedCustomers.toLocaleString('ar-EG')}</strong> عميل وتحديد فروعهم (المخزن) ومناديبهم المعتمدين تلقائياً عبر مطابقة كود العميل (Customer Account).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleEnrichAndPersistSales}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 h-9 sm:h-8 px-3 bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white font-black rounded-xl text-[11px] shadow-2xs transition cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              <span>تثبيت الربط ببيانات العملاء</span>
            </button>
          </div>
        )}

        {syncSuccessMsg && (
          <div className="mt-3 bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] text-[var(--app-ok-text)] p-3 rounded-xl text-[11px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-bold">{syncSuccessMsg}</span>
          </div>
        )}
        {syncErrorMsg && (
          <div className="mt-3 bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] text-[var(--app-risk-text)] p-3 rounded-xl text-[11px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-bold">{syncErrorMsg}</span>
          </div>
        )}

      {/* تشخيص عدد السجلات في كل مرحلة (لتعقب مصدر المشكلة) */}
      {salesRecords.length > 0 && canSeeDiagnostics && (
        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-[10px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black text-slate-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-[var(--app-warn-text)]" />
              تشخيص أعداد السجلات حسب المرحلة
            </h3>
            <span className="text-slate-400 font-bold">يساعد في تحديد ما إذا كانت المشكلة في التحميل أو التحويل أو الصلاحيات أو الفلاتر</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Supabase (السحابة)</div>
              <div className="text-lg font-black text-[var(--app-navy-text)]">{computedDiagnostics.supabaseCount.toLocaleString('ar-EG')}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">سجلات موجودة على السحابة</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">بعد التحميل (الصفحة)</div>
              <div className="text-lg font-black text-[var(--app-warn-text)]">{computedDiagnostics.loadedCount.toLocaleString('ar-EG')}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">سجلات وصلت للعرض</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">قيم رقمية أكبر من صفر</div>
              <div className="text-lg font-black text-[var(--app-ok-text)]">{computedDiagnostics.numericValuesCount.toLocaleString('ar-EG')}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">سجلات فيها كمية أو مبلغ &gt; 0</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">بعد الصلاحيات (RBAC)</div>
              <div className="text-lg font-black text-[var(--app-ok-text)]">{computedDiagnostics.afterRbacCount.toLocaleString('ar-EG')}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">سجلات مسموح للمستخدم رؤيتها</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">بعد الفلاتر</div>
              <div className="text-lg font-black text-[var(--app-risk-text)]">{computedDiagnostics.afterFiltersCount.toLocaleString('ar-EG')}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">سجلات داخل الشهر والفئة المحددين</div>
            </div>
          </div>
          {computedDiagnostics.loadedCount > 0 && computedDiagnostics.afterFiltersCount === 0 && (
            <div className="mt-2.5 bg-[var(--app-warn-tint)] border border-[var(--app-warn-line)] rounded-lg p-2 text-[var(--app-warn-text)] text-[10px]">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
              كل السجلات المحملة ({computedDiagnostics.loadedCount.toLocaleString('ar-EG')}) تُستبعد بواسطة الفلاتر الحالية — راجع الشهر والفئة والمندوب والفرع المختارين.
            </div>
          )}
          {computedDiagnostics.loadedCount > 0 && computedDiagnostics.numericValuesCount === 0 && (
            <div className="mt-2.5 bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] rounded-lg p-2 text-[var(--app-risk-text)] text-[10px]">
              <AlertCircle className="w-3.5 h-3.5 inline mr-1.5" />
              لا توجد سجلات فيها كمية أو مبلغ أكبر من صفر — قد تكون المشكلة في تحويل الأرقام من الملف المرفوع.
            </div>
          )}
          {computedDiagnostics.supabaseCount > 0 && computedDiagnostics.loadedCount === 0 && (
            <div className="mt-2.5 bg-[var(--app-navy-tint)] border border-[var(--app-navy-line)] rounded-lg p-2 text-[var(--app-navy-text)] text-[10px]">
              <CloudDownload className="w-3.5 h-3.5 inline mr-1.5" />
              يوجد سجلات في Supabase ({computedDiagnostics.supabaseCount.toLocaleString('ar-EG')}) لكن لم تصل لأي سجل للصفحة — تأكد من الاتصال بالسحابة أو اضغط «تحديث».
            </div>
          )}
        </section>
      )}

      {/* RBAC Filter Warning Banner when sales exist but user role filters them out */}
      {salesRecords.length > 0 && rbacSales.length === 0 && (
        <div className="bg-[var(--app-warn-tint)] border-2 border-[var(--app-warn-line)] rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[var(--app-warn-text)] shadow-sm animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-[var(--app-warn-text)] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-black text-sm sm:text-base">
                تم حفظ {salesRecords.length.toLocaleString('ar-EG')} حركة بيع في النظام بنجاح!
              </h3>
              <p className="text-xs text-[var(--app-warn-text)] mt-1 leading-relaxed">
                الحركات الحالية لا تطابق اسم المندوب أو الفرع الخاص بالحساب المسجل به حالياً ({currentUser?.name || 'مستخدم غير محدد'} - {currentUser?.role || 'sales_rep'}).
                اضغط على الزر المقابل لعرض كافة مبيعات الشركة والجمهورية مباشرة بدون قيود.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAllSalesOverride(true)}
            className="bg-[var(--app-warn)] hover:bg-[var(--app-warn)] text-white font-black px-5 py-2.5 rounded-xl text-xs shrink-0 cursor-pointer shadow-md transition whitespace-nowrap"
          >
            عرض كافة مبيعات الشركة (تجاوز الفلتر)
          </button>
        </div>
      )}

      {showAllSalesOverride && (
        <div className="bg-[var(--app-navy-tint)] border border-[var(--app-navy-line)] rounded-2xl p-3 flex items-center justify-between gap-2 text-[var(--app-navy-text)] text-xs">
          <span className="font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[var(--app-navy-text)]" />
            يتم حالياً عرض كافة مبيعات الجمهورية والشركة ({salesRecords.length.toLocaleString('ar-EG')} حركة) متجاوزاً قيود المندوب.
          </span>
          <button
            type="button"
            onClick={() => setShowAllSalesOverride(false)}
            className="underline hover:text-[var(--app-navy-text)] font-black cursor-pointer text-[11px]"
          >
            العودة للفلترة حسب نطاق صلاحيتي
          </button>
        </div>
      )}

      {/* Prominent Cloud Sync Banner when local records exist but Supabase is empty */}
      {salesRecords.length > 0 && supabaseCount !== null && supabaseCount === 0 && (
        <div className="bg-gradient-to-r from-[var(--app-warn)] via-[var(--app-warn)] to-[var(--app-warn)] rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-amber-500/20 animate-in fade-in">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
                <CloudUpload className="w-6 h-6 text-white" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-base sm:text-lg text-white">
                    البيانات محفوظة على جهازك محلياً فقط — قاعدة Supabase السحابية لا تزال فارغة (0 سجل)!
                  </h3>
                  <span className="bg-white/25 px-2.5 py-0.5 rounded-full text-[11px] font-black border border-white/30">
                    تنبيه مزامنة سحابية
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#d97706] max-w-3xl leading-relaxed">
                  شاشتك تعرض حالياً <strong>{salesRecords.length.toLocaleString('ar-EG')}</strong> حركة بيع (مخزنة في ذاكرة المتصفح)، بينما جدول <code className="bg-black/20 px-1.5 py-0.5 rounded text-[#d97706] font-mono">customer_item_sales</code> والـ View <code className="bg-black/20 px-1.5 py-0.5 rounded text-[#d97706] font-mono">view_customer_monthly_item_sales</code> في Supabase فارغين تماماً. اضغط على الزر المقابل لحفظها سحابياً فوراً ليتم ملء الجداول السحابية بالكامل.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePushToSupabase}
              disabled={isSupabasePushing}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-[var(--app-warn-text)] hover:bg-[var(--app-warn-tint)] font-black text-xs sm:text-sm shadow-lg transition cursor-pointer disabled:opacity-75 shrink-0 whitespace-nowrap active:scale-95"
            >
              {isSupabasePushing ? (
                <>
                  <Loader2 className="w-5 h-5 text-[var(--app-warn-text)] animate-spin" />
                  <span>
                    جاري الرفع سحابياً {supabasePushProgress ? `(${supabasePushProgress.synced.toLocaleString('ar-EG')} / ${supabasePushProgress.total.toLocaleString('ar-EG')})` : '...'}
                  </span>
                </>
              ) : (
                <>
                  <CloudUpload className="w-5 h-5 text-[var(--app-warn-text)]" />
                  <span>حفظ ومزامنة ({salesRecords.length.toLocaleString('ar-EG')}) حركة إلى Supabase الآن</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {salesRecords.length === 0 ? (
        <section className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] mx-auto flex items-center justify-center mb-4 shadow-xs">
            <BarChart3 className="w-8 h-8" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-slate-900">
            لا توجد بيانات مبيعات مسجلة في المتصفح حالياً
          </h2>
          <p className="text-xs text-slate-500 max-w-xl mx-auto mt-2 leading-relaxed">
            تم مسح البيانات التجريبية نهائياً. يتم قراءة وتحليل بيانات المبيعات الحقيقية فور رفع الملفات المعتمدة، أو جلبها مباشرة من السحابة إذا كانت مرفوعة مسبقاً.
          </p>

          <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
            {['admin', 'developer', 'branch_manager', 'technical_support'].includes(currentUser?.role || '') && (
              <label
                htmlFor="cis-monthly-excel-input"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white font-black text-xs shadow-md transition cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>رفع شيت مبيعات الشهر (Excel)</span>
              </label>
            )}

            {supabaseCount !== null && supabaseCount > 0 && (
              <button
                type="button"
                onClick={handleFetchFromSupabase}
                disabled={isSupabaseFetching}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--app-navy)] hover:bg-[var(--app-navy)] text-white font-black text-xs shadow-md transition cursor-pointer disabled:opacity-50"
              >
                <CloudDownload className={`w-4 h-4 ${isSupabaseFetching ? 'animate-bounce' : ''}`} />
                <span>
                  {isSupabaseFetching
                    ? 'جاري الجلب من Supabase...'
                    : `جلب (${supabaseCount.toLocaleString('ar-EG')}) حركة محفوظة في Supabase السحابي`}
                </span>
              </button>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 max-w-2xl mx-auto text-right">
            <h4 className="text-[11px] font-black text-slate-700 mb-2">الأعمدة المدعومة في الملف (Excel / Google Sheet):</h4>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-600 font-mono">
              {[
                'Customer account', 'Invoicing name', 'Sales order', 'Date',
                'المندوب', 'الشهر', 'Warehouse', 'Item', 'Name', 'Unit',
                'factor', 'Unit price', 'Discount', 'Quantity', 'Amount',
                'Item group', 'التعريفات', 'Family Dimension',
                'كود العميل', 'الصنف', 'الصنف بالعائله', 'القطاع', 'عدد القطع', 'اجمالي المبلغ'
              ].map((col, idx) => (
                <span key={`${col}-${idx}`} className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {col}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Filters */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--app-warn-text)]" />
                تصفية النتائج
              </h2>
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(latestMonth ?? 'all')}
                  className={`h-7 px-2.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                    selectedMonth !== 'all' && selectedMonth === latestMonth
                      ? 'bg-[#102b4e] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  هذا الشهر
                </button>
                <button
                  type="button"
                  onClick={() => previousMonth && setSelectedMonth(previousMonth)}
                  disabled={!previousMonth}
                  className={`h-7 px-2.5 rounded-lg text-[10px] font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    previousMonth && selectedMonth === previousMonth
                      ? 'bg-[#102b4e] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  الشهر السابق
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMonth('all')}
                  className={`h-7 px-2.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                    selectedMonth === 'all'
                      ? 'bg-[#102b4e] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  كل الشهور
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 h-7 px-2 text-[10px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  إعادة تعيين
                </button>
              </div>
            </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(isAdminOrDev
            ? ([
                { key: 'all' as const, label: 'كل القطاعات' },
                { key: 'home' as const, label: 'منزلي' },
                { key: 'electrical' as const, label: 'كهربائي' }
              ])
            : itemSalesSector === 'home' || itemSalesSector === 'electrical'
            ? [{ key: itemSalesSector, label: itemSalesSector === 'electrical' ? 'كهربائي' : 'منزلي' }]
            : []
          ).map((sectorOption) => {
            const active = selectedSector === sectorOption.key;
            return (
              <button
                key={sectorOption.key}
                type="button"
                onClick={() => setSelectedSector(sectorOption.key)}
                className={`h-8 px-3 rounded-xl text-[11px] font-black border transition cursor-pointer ${
                  active
                    ? sectorOption.key === 'electrical'
                      ? 'bg-[var(--app-violet)] text-white border-[var(--app-violet)]'
                      : 'bg-[var(--app-navy)] text-white border-[var(--app-navy)]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {sectorOption.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <div className="relative col-span-2 md:col-span-3 xl:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <DebouncedSearchInput
              type="text"
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="بحث بالعميل، الصنف، كود العميل، أو رقم أمر البيع..."
              className="w-full h-10 pr-9 pl-9 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--app-warn)]"
              delay={250}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-1 mt-1">
              <button
                type="button"
                onClick={() => setSearchMode('all')}
                className={`h-7 px-2.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                  searchMode === 'all' ? 'bg-[#102b4e] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                كل الحقول
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('customer')}
                className={`h-7 px-2.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                  searchMode === 'customer' ? 'bg-[#102b4e] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                بالعميل فقط
              </button>
            </div>
          </div>

          <div className="relative col-span-2 md:col-span-3 xl:col-span-2">
            <UserRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={customerSearchTerm}
              onChange={(event) => setCustomerSearchTerm(event.target.value)}
              placeholder="بحث عن عميل بالاسم أو الكود..."
              className="w-full h-10 pr-9 pl-9 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
            />
            {customerSearchTerm && (
              <button
                type="button"
                onClick={() => setCustomerSearchTerm('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {searchedCustomers.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto text-right">
                {searchedCustomers.map((customer) => (
                  <button
                    key={customer.customerAccount}
                    type="button"
                    onClick={() => {
                      setSelectedSearchCustomer(customer);
                      setCustomerSearchTerm(customer.customerName);
                    }}
                    className="w-full text-right px-3 py-2 text-[11px] hover:bg-slate-50 border-b border-slate-50 last:border-0 transition"
                  >
                    <div className="font-black text-slate-800">{customer.customerName}</div>
                    <div className="text-[9.5px] text-slate-400 font-mono">
                      كود: {customer.customerAccount || '—'} •
                      {formatCurrency(customer.totalAmount)} •
                      {customer.totalQuantity.toLocaleString('ar-EG')} كرتونة
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={selectedMonth}
            onChange={(event) =>
              setSelectedMonth(event.target.value === 'all' ? 'all' : Number(event.target.value))
            }
            aria-label="تصفية بالشهر"
            className="h-10 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--app-warn)] cursor-pointer"
          >
            <option value="all">كل الشهور</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={month}>
                {MONTH_NAMES_MAP[month]}
              </option>
            ))}
          </select>

          {distinctWarehouses.length > 1 && (
            <select
              value={selectedWarehouse}
              onChange={(event) => setSelectedWarehouse(event.target.value)}
              aria-label="تصفية بالفرع"
              className="h-10 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--app-warn)] cursor-pointer"
            >
              <option value="all">كل الفروع ({distinctWarehouses.length})</option>
              {distinctWarehouses.map((warehouse) => (
                <option key={warehouse} value={warehouse}>
                  {warehouse}
                </option>
              ))}
            </select>
          )}

          {currentUser?.role !== 'sales_rep' && distinctReps.length > 1 && (
            <select
              value={selectedRep}
              onChange={(event) => setSelectedRep(event.target.value)}
              aria-label="تصفية بالمندوب"
              className="h-10 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--app-warn)] cursor-pointer"
            >
              <option value="all">كل المناديب ({distinctReps.length})</option>
              {distinctReps.map((rep) => (
                <option key={rep} value={rep}>
                  {rep}
                </option>
              ))}
            </select>
          )}

          <select
            value={selectedFamily}
            onChange={(event) => setSelectedFamily(event.target.value)}
            aria-label="تصفية بالصنف بالعائلة"
            className="h-10 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--app-warn)] cursor-pointer"
          >
            <option value="all">الصنف بالعائلة (الكل)</option>
            {distinctFamilies.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>

          <select
            value={selectedItem}
            onChange={(event) => setSelectedItem(event.target.value)}
            aria-label="تصفية بالصنف"
            className="h-10 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--app-warn)] cursor-pointer max-w-[240px]"
          >
            <option value="all">كل الأصناف ({distinctItems.length})</option>
            {distinctItems.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name} — {item.code}
              </option>
            ))}
          </select>
        </div>
      </section>


      {/* View tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-1.5 flex items-center gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveView('overview')}
          className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[11px] font-black transition cursor-pointer ${
            activeView === 'overview'
              ? 'bg-[#102b4e] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          لوحة المبيعات
        </button>
        <button
          type="button"
          onClick={() => setActiveView('visuals')}
          className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[11px] font-black transition cursor-pointer ${
            activeView === 'visuals'
              ? 'bg-[#102b4e] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          الرسومات التفاعلية وخريطة الأصناف
        </button>
        <button
          type="button"
          onClick={() => setActiveView('customers')}
          className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[11px] font-black transition cursor-pointer ${
            activeView === 'customers'
              ? 'bg-[#102b4e] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          تفاصيل العملاء
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${
              activeView === 'customers' ? 'bg-white/15 text-[#d97706]' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {customerSummaries.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('focus')}
          className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[11px] font-black transition cursor-pointer ${
            activeView === 'focus'
              ? 'bg-[#102b4e] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          تحليل الإجماليات
        </button>

        <span className="ms-auto text-[9px] text-slate-400 font-bold px-2 hidden sm:inline-flex items-center gap-1">
          <ClipboardList className="w-3 h-3" />
          {previousMonth
            ? `مقارنة النمو مقابل ${MONTH_NAMES_MAP[previousMonth]}`
            : 'لا توجد فترة سابقة متاحة للمقارنة'}
        </span>
      </div>

      {activeView === 'visuals' ? (
        <React.Suspense
          fallback={
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 flex items-center justify-center gap-2 text-xs font-black text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              جارٍ تحميل الرسومات التفاعلية وخريطة الأصناف...
            </div>
          }
        >
          <SalesFocusV4
            records={filteredSales}
            baseRecords={rbacSales}
            customers={customers}
          />
        </React.Suspense>
      ) : activeView === 'focus' ? (
        <TotalsAnalysisView
          records={filteredSales}
          customers={customers}
          sector={selectedSector}
          onSelectSector={setSelectedSector}
          resolveSector={resolveItemSaleSector}
          subtitle={analysisSubtitle}
        />
      ) : activeView === 'overview' ? (
        <>
          {salesRecords.length > 0 && periodTotals.amount === 0 && (
            <div className="bg-[var(--app-warn-tint)] border border-[var(--app-warn-line)] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11.5px] font-black text-[var(--app-warn-text)]">
                    كل المبالغ والكميات في الداتا الحالية = صفر
                  </div>
                  <p className="text-[10px] text-[var(--app-warn-text)] font-bold leading-relaxed mt-0.5">
                    الصفوف الحالية تحتوي على كميات ومبالغ غير مسجلة. يتم تحديث البيانات ومزامنتها فور توفر أرقام البيع الفعلية.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isAdminOrDev && (
            <MonthlyAggregateCard
              sector={activeSectorFilter}
              records={salesRecords}
              resolveSector={resolveItemSaleSector}
            />
          )}

          <ItemSalesKpiCards
            comparison={comparison}
            totalQuantity={periodTotals.quantity}
            previousQuantity={kpiPreviousQuantity}
            itemsCount={periodTotals.itemsCount}
            previousItemsCount={kpiPreviousItemsCount}
            customersCount={periodTotals.customersCount}
            idleCount={idleItems.totalIdle}
            idleCaption={idleLoading ? '' : idleCaption}
            idleIsLoading={idleLoading}
            comparisonCaption={kpiGrowthCaption}
          />

          <ItemSalesExecutiveCards
            records={filteredSales}
            resolveSector={resolveItemSaleSector}
            resolveBranch={resolveItemSaleBranch}
          />

          {/* بطاقة تفاصيل العميل المختار من بحث العملاء */}
          {selectedSearchCustomer && (
            <section className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center font-black text-sm shrink-0">
                    {initials(selectedSearchCustomer.customerName)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-slate-900 truncate flex-1">
                        {selectedSearchCustomer.customerName}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setSelectedSearchCustomer(null)}
                        className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-[9.5px] text-slate-400 font-bold font-mono">
                      كود العميل: {selectedSearchCustomer.customerAccount || '—'}
                    </div>
                    {selectedSearchCustomer.linkedCustomerCode && selectedSearchCustomer.linkedCustomerCode !== selectedSearchCustomer.customerAccount && (
                      <div className="text-[9px] font-bold text-[var(--app-primary-text)] mt-0.5" title="مطابق بقاعدة العملاء">
                        كود قاعدة العملاء: <span className="font-mono">{selectedSearchCustomer.linkedCustomerCode}</span>
                      </div>
                    )}
                    <div className="text-[9.5px] text-slate-500 font-bold flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3 h-3 shrink-0" />
                      {selectedSearchCustomer.linkedBranch || selectedSearchCustomer.warehouse || 'الفرع الرئيسي'}
                    </div>
                    <div className="text-[9.5px] text-slate-500 font-bold flex items-center gap-1 mt-0.5">
                      <UserRound className="w-3 h-3 shrink-0" />
                      {selectedSearchCustomer.linkedRepName || selectedSearchCustomer.repName || 'غير محدد'}
                    </div>
                    {selectedSearchCustomer.linkedSector && (
                      <div className="text-[9px] font-bold text-[var(--app-secondary-text)] mt-0.5 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[var(--app-secondary)]" />
                        القطاع: {selectedSearchCustomer.linkedSector === 'electrical' ? 'كهربائي' : selectedSearchCustomer.linkedSector === 'both' ? 'الاثنين' : 'منزلي'}
                      </div>
                    )}
                    {selectedSearchCustomer.linkedPhone && (
                      <div className="text-[9.5px] text-slate-500 font-bold flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 shrink-0" />
                        {selectedSearchCustomer.linkedPhone}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-[9.5px] font-bold text-slate-400">إجمالي المشتريات</div>
                  <div className="text-xl font-black text-[var(--app-ok-text)] font-mono">
                    {formatCurrency(selectedSearchCustomer.totalAmount)}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    {selectedSearchCustomer.totalQuantity.toLocaleString('ar-EG')} كرتونة •
                    {selectedSearchCustomer.distinctItemsCount} صنف
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* أكثر صنف اشتراه */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    أكثر صنف اشتراه
                  </div>
                  {selectedSearchCustomer.items.length > 0 ? (
                    <div className="space-y-2">
                      <div>
                        <div className="text-sm font-black text-slate-900 truncate">
                          {selectedSearchCustomer.items[0].itemName}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono">
                          {selectedSearchCustomer.items[0].itemCode || '—'}
                        </div>
                        <div className="text-[10px] font-bold text-[var(--app-ok-text)] mt-1">
                          {formatCurrency(selectedSearchCustomer.items[0].totalAmount)}
                        </div>
                        <div className="text-[9px] text-slate-600">
                          {selectedSearchCustomer.items[0].totalQuantity.toLocaleString('ar-EG')} كرتونة
                        </div>
                      </div>
                      {selectedSearchCustomer.totalAmount > 0 && (
                        <div className="text-[9px] text-slate-400 mt-1">
                          تمثل {Math.round((selectedSearchCustomer.items[0].totalAmount / selectedSearchCustomer.totalAmount) * 100)}% من مشتريات العميل
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 font-bold">لا توجد أصناف</div>
                  )}
                </div>

                {/* توزيع الأصناف بالنسبة المئوية */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    نسبة كل صنف من مشتريات العميل
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                    {selectedSearchCustomer.items.slice(0, 6).map((item, idx) => {
                      const pct =
                        selectedSearchCustomer.totalAmount > 0
                          ? (item.totalAmount / selectedSearchCustomer.totalAmount) * 100
                          : 0;
                      return (
                        <div
                          key={item.itemCode || idx}
                          className="text-[9.5px] font-bold text-slate-700"
                        >
                          <div className="flex justify-between mb-0.5">
                            <span className="truncate max-w-[120px]">{item.itemName}</span>
                            <span className="font-mono text-[var(--app-navy-text)]">{Math.round(pct)}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5">
                            <div
                              className="bg-[var(--app-navy)] h-1.5 rounded-full"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-[8.5px] text-slate-400 mt-0.5">
                            <span>{formatCurrency(item.totalAmount)}</span>
                            <span>{item.totalQuantity.toLocaleString('ar-EG')} كرتونة</span>
                          </div>
                        </div>
                      );
                    })}
                    {selectedSearchCustomer.items.length === 0 && (
                      <div className="text-[10px] text-slate-400 font-bold">لا توجد بيانات</div>
                    )}
                  </div>
                </div>

                {/* المشتريات الشهرية */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    المشتريات الشهرية (السنة كاملة)
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                      const amount = selectedSearchCustomer.monthlySales[month] || 0;
                      const qty = selectedSearchCustomer.monthlyQuantities[month] || 0;
                      const hasSales = amount > 0;
                      return (
                        <div
                          key={month}
                          className="text-center p-1.5 rounded-lg border text-[9px] font-bold transition ${
                            hasSales
                              ? 'bg-[var(--app-warn-tint)] border-[var(--app-warn-line)] text-[var(--app-warn-text)]'
                              : 'bg-slate-100/50 border-transparent text-slate-400'
                          }"
                        >
                          <div className="text-[8px] uppercase tracking-wider mb-0.5">
                            {MONTH_NAMES_MAP[month]}
                          </div>
                          <div
                            className="font-mono font-black truncate"
                            title={hasSales ? formatCurrency(amount) : undefined}
                          >
                            {hasSales ? formatCompactAmount(amount) : '—'}
                          </div>
                          <div className="text-[8px]">{hasSales ? qty.toLocaleString('ar-EG') : '0'} ك</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {onOpenNewOrderForCustomer && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onOpenNewOrderForCustomer(customers.find((c) => c.code === selectedSearchCustomer!.customerAccount || c.name === selectedSearchCustomer!.customerName) as Customer, undefined)}
                    className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-[#102b4e] hover:bg-[#0b1f39] text-white text-[11px] font-black transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    طلبية جديدة لهذا العميل
                  </button>
                </div>
              )}
            </section>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-5">
              <CategoryMixCard
                groups={groupMix.groups}
                totalAmount={groupMix.totalAmount}
                totalItems={groupMix.totalItems}
                totalQuantity={groupMix.totalQuantity}
                onSelectGroup={(group) => {
                  if (group.startsWith('أخرى')) return;
                  if (!distinctGroups.includes(group)) return;
                  setSelectedGroup(group);
                }}
              />
            </div>
            <div className="xl:col-span-7">
              <ItemRankingCard
                variant="amount"
                items={topItemsByValue}
                subtitle={`${comparison.scopeLabel} • أعلى 10 أصناف بالقيمة`}
                onSelectItem={(itemCode) => {
                  if (itemCode) setSearchTerm(itemCode);
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7">
              <MonthlyPerformanceCard
                points={monthlyPerformance}
                growth={monthlyPerformanceGrowth}
                selectedMonth={selectedMonth}
                onSelectMonth={(month) => setSelectedMonth(month)}
              />
            </div>
            <div className="xl:col-span-5">
              <TopCustomersTable
                customers={customerInsights}
                selectedAccount={selectedCustomer?.customerAccount || null}
                onSelectCustomer={setSelectedCustomerAccount}
                onOpenAll={() => setActiveView('customers')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-12">
              <ItemRankingCard
                variant="quantity"
                items={topItemsByQuantity}
                subtitle={`${comparison.scopeLabel} • أعلى 10 أصناف بالكمية`}
                onSelectItem={(itemCode) => {
                  if (itemCode) setSearchTerm(itemCode);
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7">
              <SlowMoversCard items={slowMovers} totalItems={periodTotals.itemsCount} />
            </div>
            <div className="xl:col-span-5">
              <RepPerformanceCard
                reps={repPerformance}
                selectedRep={selectedRep}
                onSelectRep={(rep) => setSelectedRep(rep === selectedRep ? 'all' : rep)}
                breakdown={selectedRepBreakdown}
              />
            </div>
          </div>

          {/* تحليل الصنف والعائلة بالشهور + مبيعات الفروع */}
          <div className="grid grid-cols-1 gap-4">
            <section className="bg-[var(--app-card)] rounded-2xl border border-[var(--app-border)] p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-black text-[var(--app-text)]">الصنف (البرند) بالشهور</h3>
                  <p className="text-[10px] text-[var(--app-text-muted)] font-bold mt-0.5">قيمة وكمية مبيعات كل صنف موزعة على الشهور (أعلى 50 صنف حسب الإجمالي)</p>
                </div>
                <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-[var(--app-primary-tint)] text-[var(--app-primary-text)] border border-[var(--app-primary-border)]">
                  {itemSalesByMonthPivot.length} صنف
                </span>
              </div>
              {itemSalesByMonthPivot.length === 0 || analysisMonths.length === 0 ? (
                <div className="text-xs font-bold text-[var(--app-text-muted)] text-center py-8 border border-dashed border-[var(--app-border)] rounded-xl">لا توجد بيانات للفلاتر الحالية</div>
              ) : (
                <div className="overflow-auto max-h-[420px] rounded-xl border border-[var(--app-border)]">
                  <table className="w-full min-w-[900px] text-right text-[12px]">
                    <thead className="sticky top-0 z-10 bg-[var(--app-card-secondary)] text-[var(--app-text-muted)] font-black text-[11px]">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap sticky right-0 bg-[var(--app-card-secondary)] z-20">الصنف</th>
                        {analysisMonths.map((m) => (
                          <th key={m} className="px-3 py-3 text-center whitespace-nowrap">{MONTH_NAMES_MAP[m] || m}</th>
                        ))}
                        <th className="px-4 py-3 text-left whitespace-nowrap">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {itemSalesByMonthPivot.slice(0, 50).map((row) => (
                        <tr key={row.key} className="hover:bg-[var(--app-card-hover)] transition">
                          <td className="px-4 py-3 font-black text-[var(--app-text)] whitespace-nowrap max-w-[260px] truncate sticky right-0 bg-[var(--app-card)]" title={row.name}>{row.name}</td>
                          {analysisMonths.map((m) => {
                            const cell = row.months[m];
                            return (
                              <td key={m} className="px-3 py-3 text-center">
                                {cell ? (
                                  <div className="leading-tight">
                                    <div className="font-mono font-black text-[var(--app-text)] tabular-nums whitespace-nowrap">{formatCurrency(cell.amount)}</div>
                                    <div className="text-[10px] font-bold text-[var(--app-text-muted)] tabular-nums">{Math.round(cell.quantity).toLocaleString('ar-EG')} كرتونة</div>
                                  </div>
                                ) : <span className="text-[var(--app-text-muted)]">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-left">
                            <div className="font-mono font-black text-[var(--app-text)] tabular-nums whitespace-nowrap">{formatCurrency(row.totalAmount)}</div>
                            <div className="text-[10px] font-bold text-[var(--app-text-muted)] tabular-nums">{Math.round(row.totalQty).toLocaleString('ar-EG')} كرتونة</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="bg-[var(--app-card)] rounded-2xl border border-[var(--app-border)] p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-black text-[var(--app-text)]">الصنف بالعائلة بالشهور</h3>
                  <p className="text-[10px] text-[var(--app-text-muted)] font-bold mt-0.5">قيمة وكمية مبيعات كل عائلة موزعة على الشهور</p>
                </div>
                <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-[var(--app-secondary-tint)] text-[var(--app-secondary-text)] border border-[var(--app-secondary-border)]">
                  {familySalesByMonthPivot.length} عائلة
                </span>
              </div>
              {familySalesByMonthPivot.length === 0 || analysisMonths.length === 0 ? (
                <div className="text-xs font-bold text-[var(--app-text-muted)] text-center py-8 border border-dashed border-[var(--app-border)] rounded-xl">لا توجد بيانات للفلاتر الحالية</div>
              ) : (
                <div className="overflow-auto max-h-[420px] rounded-xl border border-[var(--app-border)]">
                  <table className="w-full min-w-[900px] text-right text-[12px]">
                    <thead className="sticky top-0 z-10 bg-[var(--app-card-secondary)] text-[var(--app-text-muted)] font-black text-[11px]">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap sticky right-0 bg-[var(--app-card-secondary)] z-20">العائلة</th>
                        {analysisMonths.map((m) => (
                          <th key={m} className="px-3 py-3 text-center whitespace-nowrap">{MONTH_NAMES_MAP[m] || m}</th>
                        ))}
                        <th className="px-4 py-3 text-left whitespace-nowrap">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {familySalesByMonthPivot.map((row) => (
                        <tr key={row.family} className="hover:bg-[var(--app-card-hover)] transition">
                          <td className="px-4 py-3 font-black text-[var(--app-text)] whitespace-nowrap max-w-[260px] truncate sticky right-0 bg-[var(--app-card)]" title={row.family}>{row.family}</td>
                          {analysisMonths.map((m) => {
                            const cell = row.months[m];
                            return (
                              <td key={m} className="px-3 py-3 text-center">
                                {cell ? (
                                  <div className="leading-tight">
                                    <div className="font-mono font-black text-[var(--app-text)] tabular-nums whitespace-nowrap">{formatCurrency(cell.amount)}</div>
                                    <div className="text-[10px] font-bold text-[var(--app-text-muted)] tabular-nums">{Math.round(cell.quantity).toLocaleString('ar-EG')} كرتونة</div>
                                  </div>
                                ) : <span className="text-[var(--app-text-muted)]">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-left">
                            <div className="font-mono font-black text-[var(--app-text)] tabular-nums whitespace-nowrap">{formatCurrency(row.totalAmount)}</div>
                            <div className="text-[10px] font-bold text-[var(--app-text-muted)] tabular-nums">{Math.round(row.totalQty).toLocaleString('ar-EG')} كرتونة</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="bg-[var(--app-card)] rounded-2xl border border-[var(--app-border)] p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-black text-[var(--app-text)]">مبيعات الفروع بالصنف بالشهور</h3>
                  <p className="text-[10px] text-[var(--app-text-muted)] font-bold mt-0.5">تفصيل مبيعات كل فرع على مستوى الصنف موزعة بالشهور (أعلى 80 صف)</p>
                </div>
                <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-[var(--app-primary-tint)] text-[var(--app-primary-text)] border border-[var(--app-primary-border)]">
                  {branchItemSalesByMonth.length} صف
                </span>
              </div>
              {branchItemSalesByMonth.length === 0 || analysisMonths.length === 0 ? (
                <div className="text-xs font-bold text-[var(--app-text-muted)] text-center py-8 border border-dashed border-[var(--app-border)] rounded-xl">لا توجد بيانات للفلاتر الحالية</div>
              ) : (
                <div className="overflow-auto max-h-[420px] rounded-xl border border-[var(--app-border)]">
                  <table className="w-full min-w-[980px] text-right text-[12px]">
                    <thead className="sticky top-0 z-10 bg-[var(--app-card-secondary)] text-[var(--app-text-muted)] font-black text-[11px]">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap sticky right-0 bg-[var(--app-card-secondary)] z-20">الفرع</th>
                        <th className="px-4 py-3 whitespace-nowrap">الصنف</th>
                        {analysisMonths.map((m) => (
                          <th key={m} className="px-3 py-3 text-center whitespace-nowrap">{MONTH_NAMES_MAP[m] || m}</th>
                        ))}
                        <th className="px-4 py-3 text-left whitespace-nowrap">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {branchItemSalesByMonth.slice(0, 80).map((row) => (
                        <tr key={`${row.branch}-${row.itemKey}`} className="hover:bg-[var(--app-card-hover)] transition">
                          <td className="px-4 py-3 font-black text-[var(--app-text)] whitespace-nowrap sticky right-0 bg-[var(--app-card)]">{row.branch}</td>
                          <td className="px-4 py-3 font-bold text-[var(--app-text)] whitespace-nowrap max-w-[220px] truncate" title={row.itemName}>{row.itemName}</td>
                          {analysisMonths.map((m) => {
                            const cell = row.months[m];
                            return (
                              <td key={m} className="px-3 py-3 text-center">
                                {cell ? (
                                  <div className="leading-tight">
                                    <div className="font-mono font-black text-[var(--app-text)] tabular-nums whitespace-nowrap">{formatCurrency(cell.amount)}</div>
                                    <div className="text-[10px] font-bold text-[var(--app-text-muted)] tabular-nums">{Math.round(cell.quantity).toLocaleString('ar-EG')}</div>
                                  </div>
                                ) : <span className="text-[var(--app-text-muted)]">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-left">
                            <div className="font-mono font-black text-[var(--app-text)] tabular-nums whitespace-nowrap">{formatCurrency(row.totalAmount)}</div>
                            <div className="text-[10px] font-bold text-[var(--app-text-muted)] tabular-nums">{Math.round(row.totalQty).toLocaleString('ar-EG')}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="bg-[var(--app-card)] rounded-2xl border border-[var(--app-border)] p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-black text-[var(--app-text)]">مبيعات الفروع بالعائلة بالشهور</h3>
                  <p className="text-[10px] text-[var(--app-text-muted)] font-bold mt-0.5">تفصيل مبيعات كل فرع على مستوى العائلة موزعة بالشهور</p>
                </div>
                <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-[var(--app-secondary-tint)] text-[var(--app-secondary-text)] border border-[var(--app-secondary-border)]">
                  {branchFamilySalesByMonth.length} صف
                </span>
              </div>
              {branchFamilySalesByMonth.length === 0 || analysisMonths.length === 0 ? (
                <div className="text-xs font-bold text-[var(--app-text-muted)] text-center py-8 border border-dashed border-[var(--app-border)] rounded-xl">لا توجد بيانات للفلاتر الحالية</div>
              ) : (
                <div className="overflow-auto max-h-[420px] rounded-xl border border-[var(--app-border)]">
                  <table className="w-full min-w-[980px] text-right text-[12px]">
                    <thead className="sticky top-0 z-10 bg-[var(--app-card-secondary)] text-[var(--app-text-muted)] font-black text-[11px]">
                      <tr>
                        <th className="px-4 py-3 whitespace-nowrap sticky right-0 bg-[var(--app-card-secondary)] z-20">الفرع</th>
                        <th className="px-4 py-3 whitespace-nowrap">العائلة</th>
                        {analysisMonths.map((m) => (
                          <th key={m} className="px-3 py-3 text-center whitespace-nowrap">{MONTH_NAMES_MAP[m] || m}</th>
                        ))}
                        <th className="px-4 py-3 text-left whitespace-nowrap">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {branchFamilySalesByMonth.map((row) => (
                        <tr key={`${row.branch}-${row.family}`} className="hover:bg-[var(--app-card-hover)] transition">
                          <td className="px-4 py-3 font-black text-[var(--app-text)] whitespace-nowrap sticky right-0 bg-[var(--app-card)]">{row.branch}</td>
                          <td className="px-4 py-3 font-black text-[var(--app-text)] whitespace-nowrap max-w-[220px] truncate" title={row.family}>{row.family}</td>
                          {analysisMonths.map((m) => {
                            const cell = row.months[m];
                            return (
                              <td key={m} className="px-3 py-3 text-center">
                                {cell ? (
                                  <div className="leading-tight">
                                    <div className="font-mono font-black text-[var(--app-text)] tabular-nums whitespace-nowrap">{formatCurrency(cell.amount)}</div>
                                    <div className="text-[10px] font-bold text-[var(--app-text-muted)] tabular-nums">{Math.round(cell.quantity).toLocaleString('ar-EG')} كرتونة</div>
                                  </div>
                                ) : <span className="text-[var(--app-text-muted)]">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-left">
                            <div className="font-mono font-black text-[var(--app-text)] tabular-nums whitespace-nowrap">{formatCurrency(row.totalAmount)}</div>
                            <div className="text-[10px] font-bold text-[var(--app-text-muted)] tabular-nums">{Math.round(row.totalQty).toLocaleString('ar-EG')} كرتونة</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <MonthlyCustomerAnalysisTable rows={monthlyCustomerRows} />
        </>
      ) : (
        <CustomerDossiers
          summaries={customerSummaries}
          yearlySummaries={yearlySummaries}
          displayLimit={customerDisplayLimit}
          expandedAccounts={expandedCustomerAccounts}
          selectedMonth={selectedMonth}
          onToggle={toggleCustomerExpand}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
          onChangeLimit={setCustomerDisplayLimit}
          onSelectMonth={setSelectedMonth}
          onStartOrder={onOpenNewOrderForCustomer ? handleStartOrderForCustomer : undefined}
        />
      )}
        </>
      )}
    </div>
  );
};
