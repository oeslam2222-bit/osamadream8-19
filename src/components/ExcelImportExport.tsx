import {
  AlertCircle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Globe,
  HelpCircle,
  Layers,
  Link,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  Upload,
  UserCheck,
  Users,
  X,
  Trash2,
  ShieldAlert,
  Target,
  BadgePercent,
  Calendar,
  CalendarCheck,
  CreditCard,
  FileCheck,
  Flame,
  Filter,
  ShieldCheck,
  TrendingUp,
  Percent,
  Wallet,
  Activity,
  BarChart3,
  CheckCheck,
  Clock,
  Award
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import { useApp } from '../context/AppContext';
import { getProductImageUrl } from '../services/cloudinaryService';
import {
  isArabicNameMatch,
  normalizeArabicText,
  isBranchMatch
} from '../services/arabicMatchingService';
import {
  deduplicateProductArray,
  countDuplicateProductRows,
  normalizeProductCodeKey,
  productIdentityKey
} from '../services/productIdentity';
import { deduplicateTargetRecords } from '../context/appContextHelpers';
import {
  CUSTOMER_SALES_TARGET_COLUMNS,
  exportCustomersToExcel,
  exportCustomerTargetSheetToExcel,
  exportProductsToExcel,
  fetchAndParseGoogleSheet,
  fetchCustomersFromGoogleSheetUrl,
  generateSampleCustomersTemplate,
  generateSampleCustomerTargetTemplate,
  generateSampleExcelTemplate,
  parseExcelCustomers,
  parseExcelProducts
} from '../services/excelService';
import {
  getSavedSourceUrl,
  saveSingleSourceUrl,
} from '../services/dataSourceService';
import {
  downloadTargetTemplateExcel,
  formatEGP,
  ARABIC_MONTHS,
  QUARTER_LABELS
} from '../services/targetService';
import { formatCurrency } from '../services/invoiceService';
import { resolveCollectionsMagnitude } from '../services/customerFinancialService';
import { Customer, Product, TargetRecord } from '../types';

export const ExcelImportExport: React.FC = () => {
  const {
    products,
    customers,
    users,
    currentUser,
    branches,
    targets,
    invoices,
    getVisibleInvoices,
    getVisibleTargets,
    getVisibleCustomers,
    forecasts,
    importProductsList,
    importCustomersList,
    cleanAndDeduplicateCustomers,
    updateCustomer,
    deleteCustomer,
    refreshCustomerRepLinks,
    autoCreateMissingRepsFromCustomers,
    wipeAllProductsAndData,
    selectedBranchFilter,
    importTargetsFromExcel,
    importTargetsFromGoogleSheet,
    exportTargetsReport,
    resetTargetsToDefault,
    globalDataVersion,
    isVersionSyncing,
    checkAndSyncDataVersion,
    publishDataVersionUpdate,
    forcePurgeCacheAndReload,
  } = useApp();

  // Role helpers
  const isSuperAdmin = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  const isBranchMgr = currentUser?.role === 'branch_manager';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isSalesRep = currentUser?.role === 'sales_rep';

  // Data Version Sync Release State
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishScope, setPublishScope] = useState<'all' | 'products' | 'customers' | 'targets'>('all');
  const [publishNotes, setPublishNotes] = useState('');
  const [publishForcePurge, setPublishForcePurge] = useState(true);
  const [isPublishingVersion, setIsPublishingVersion] = useState(false);

  // Five Core Tabs
  const [activeTab, setActiveTab] = useState<'forecast' | 'dedup' | 'products' | 'customers' | 'targets'>('forecast');

  // Global Notification State
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // ----------------------------------------------------
  // Forecast & Projection States & Computations
  // ----------------------------------------------------
  const [forecastBranchFilter, setForecastBranchFilter] = useState('all');
  const [forecastSupervisorFilter, setForecastSupervisorFilter] = useState('all');
  const [forecastRepSearch, setForecastRepSearch] = useState('');
  const [isExportingForecast, setIsExportingForecast] = useState(false);

  // Time metrics
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const daysInCurrentMonth = new Date(currentYear, currentMonth, 0).getDate();
  const remainingDays = Math.max(0, daysInCurrentMonth - currentDay);
  const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const currentWeekIndex = Math.min(5, Math.ceil(currentDay / 7));

  // Role Scoping for Forecast
  const effectiveBranch = isBranchMgr && currentUser?.branchName
    ? currentUser.branchName
    : isSupervisor && currentUser?.branchName
    ? currentUser.branchName
    : isSalesRep && currentUser?.branchName
    ? currentUser.branchName
    : forecastBranchFilter;

  const effectiveSupervisorId = isSupervisor
    ? currentUser.id
    : isSalesRep
    ? (currentUser.supervisorId || 'all')
    : forecastSupervisorFilter;

  // Scoped Reps List (Strict RBAC Hierarchy)
  const scopedReps = useMemo(() => {
    return users.filter((u) => {
      if (!u.isActive || u.role !== 'sales_rep') return false;
      if (isSalesRep) return u.id === currentUser?.id;
      if (isSupervisor) return u.supervisorId === currentUser?.id;
      if (isBranchMgr) return !currentUser?.branchName || isBranchMatch(u.branchName, currentUser.branchName, { allowUnassigned: false });
      if (effectiveBranch !== 'all' && u.branchName && !isBranchMatch(u.branchName, effectiveBranch, { allowUnassigned: false })) return false;
      if (effectiveSupervisorId !== 'all' && u.supervisorId && u.supervisorId !== effectiveSupervisorId) return false;
      if (forecastRepSearch.trim()) {
        const q = forecastRepSearch.toLowerCase().trim();
        return u.name.toLowerCase().includes(q) || (u.code && String(u.code).includes(q));
      }
      return true;
    });
  }, [users, isSalesRep, isSupervisor, isBranchMgr, currentUser, effectiveBranch, effectiveSupervisorId, forecastRepSearch]);

  // Scoped Invoices
  const scopedInvoices = useMemo(() => {
    const list = getVisibleInvoices();
    return list.filter((inv) => {
      if (!inv.date || !inv.date.startsWith(currentMonthKey)) return false;
      const st = inv.status;
      return st !== 'ملغاة' && st !== 'مرفوضة / ملغاة';
    });
  }, [getVisibleInvoices, currentMonthKey]);

  // Scoped Targets
  const scopedTargets = useMemo(() => {
    const list = getVisibleTargets();
    return list.filter((t) => {
      const y = t.year || (t.date ? parseInt(t.date.slice(0, 4), 10) : null);
      const m = t.month || (t.date ? parseInt(t.date.slice(5, 7), 10) : null);
      return y === currentYear && m === currentMonth;
    });
  }, [getVisibleTargets, currentYear, currentMonth]);

  // Helper for invoice total
  const getInvoiceTotal = (inv: any): number => {
    return inv.estimatedGrandTotal || (inv.subtotal - (inv.discountAmount || 0) + (inv.taxAmount || 0)) || 0;
  };

  // Build Rep Forecast Rows & Computations
  const repForecastRows = useMemo(() => {
    return scopedReps.map((rep) => {
      // Find rep's target
      const repTarget = scopedTargets.find((t) =>
        isArabicNameMatch(t.repName, rep.name) ||
        normalizeArabicText(t.repName) === normalizeArabicText(rep.name) ||
        (rep.code && String(t.repName).includes(String(rep.code)))
      );
      const monthlyTarget = repTarget?.salesTarget || 0;
      const collectionTarget = repTarget?.collectionTarget || 0;

      // Filter rep's invoices
      const repInvoices = scopedInvoices.filter((inv) =>
        inv.repId === rep.id ||
        (inv.repName && (isArabicNameMatch(inv.repName, rep.name) || normalizeArabicText(inv.repName) === normalizeArabicText(rep.name)))
      );
      const actualSales = repInvoices.reduce((acc, inv) => acc + getInvoiceTotal(inv), 0);

      // Run rate & projections
      const dailyRunRate = currentDay > 0 ? Math.round(actualSales / currentDay) : 0;
      const projectedMonthEnd = Math.round(actualSales + (dailyRunRate * remainingDays));
      const projectedRate = monthlyTarget > 0 ? Math.round((projectedMonthEnd / monthlyTarget) * 100) : 0;
      const variance = projectedMonthEnd - monthlyTarget;

      // 5-Week Breakdown
      const weeklyBreakdown = [1, 2, 3, 4, 5].map((wIdx) => {
        const startDay = (wIdx - 1) * 7 + 1;
        const endDay = wIdx === 5 ? daysInCurrentMonth : Math.min(daysInCurrentMonth, wIdx * 7);
        const wTarget = Math.round(monthlyTarget / 4.4);

        // Sum invoices in date window
        const wInvoices = repInvoices.filter((inv) => {
          const day = parseInt(inv.date.slice(8, 10), 10);
          return day >= startDay && day <= endDay;
        });
        const wActual = wInvoices.reduce((acc, inv) => acc + getInvoiceTotal(inv), 0);
        const wRate = wTarget > 0 ? Math.round((wActual / wTarget) * 100) : 0;
        const isCurrent = wIdx === currentWeekIndex;
        const isPassed = wIdx < currentWeekIndex;

        return {
          weekIndex: wIdx,
          label: `الأسبوع ${wIdx}`,
          dateRange: `${startDay} - ${endDay} ${ARABIC_MONTHS[currentMonth - 1]}`,
          target: wTarget,
          actual: wActual,
          rate: wRate,
          isCurrent,
          isPassed,
        };
      });

      const currentWeekData = weeklyBreakdown[currentWeekIndex - 1] || weeklyBreakdown[0];

      let status: 'super' | 'on_track' | 'behind' = 'on_track';
      if (projectedRate >= 100) status = 'super';
      else if (projectedRate >= 80) status = 'on_track';
      else status = 'behind';

      return {
        rep,
        target: monthlyTarget,
        collectionTarget,
        actualSales,
        dailyRunRate,
        projectedMonthEnd,
        projectedRate,
        variance,
        currentWeekTarget: currentWeekData.target,
        currentWeekActual: currentWeekData.actual,
        weeklyBreakdown,
        status,
      };
    });
  }, [scopedReps, scopedTargets, scopedInvoices, currentDay, remainingDays, daysInCurrentMonth, currentWeekIndex, currentMonth]);

  // Aggregate Summary Metrics for Forecast Tab
  const summaryMetrics = useMemo(() => {
    const totalTarget = repForecastRows.reduce((acc, r) => acc + r.target, 0);
    const totalActual = repForecastRows.reduce((acc, r) => acc + r.actualSales, 0);
    const totalProjected = repForecastRows.reduce((acc, r) => acc + r.projectedMonthEnd, 0);
    const totalVariance = totalProjected - totalTarget;
    const overallRate = totalTarget > 0 ? Math.round((totalProjected / totalTarget) * 100) : 0;
    const currentRate = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

    const currentWeekTarget = repForecastRows.reduce((acc, r) => acc + r.currentWeekTarget, 0);
    const currentWeekActual = repForecastRows.reduce((acc, r) => acc + r.currentWeekActual, 0);

    const dailyRunRate = currentDay > 0 ? Math.round(totalActual / currentDay) : 0;
    const requiredDailyRate = remainingDays > 0 ? Math.max(0, Math.round((totalTarget - totalActual) / remainingDays)) : 0;

    const totalCollectionTarget = repForecastRows.reduce((acc, r) => acc + r.collectionTarget, 0);

    // Sum customer forecasts submitted for current month
    const totalCollectionForecast = (forecasts || [])
      .filter((f) => f.monthKey === currentMonthKey)
      .reduce((acc, f) => acc + (Number(f.collectionForecast) || 0), 0);

    // Aggregate Weekly Breakdown
    const weeklyTotals = [1, 2, 3, 4, 5].map((wIdx) => {
      const wTarget = repForecastRows.reduce((acc, r) => acc + (r.weeklyBreakdown[wIdx - 1]?.target || 0), 0);
      const wActual = repForecastRows.reduce((acc, r) => acc + (r.weeklyBreakdown[wIdx - 1]?.actual || 0), 0);
      const wRate = wTarget > 0 ? Math.round((wActual / wTarget) * 100) : 0;
      const startDay = (wIdx - 1) * 7 + 1;
      const endDay = wIdx === 5 ? daysInCurrentMonth : Math.min(daysInCurrentMonth, wIdx * 7);
      return {
        weekIndex: wIdx,
        label: `الأسبوع ${wIdx}`,
        dateRange: `${startDay} - ${endDay} ${ARABIC_MONTHS[currentMonth - 1]}`,
        target: wTarget,
        actual: wActual,
        rate: wRate,
        isCurrent: wIdx === currentWeekIndex,
        isPassed: wIdx < currentWeekIndex,
      };
    });

    return {
      totalTarget,
      totalActual,
      totalProjected,
      totalVariance,
      overallRate,
      currentRate,
      currentWeekTarget,
      currentWeekActual,
      dailyRunRate,
      requiredDailyRate,
      totalCollectionTarget,
      totalCollectionForecast,
      weeklyTotals,
    };
  }, [repForecastRows, currentDay, remainingDays, currentMonthKey, currentWeekIndex, daysInCurrentMonth, currentMonth, forecasts]);

  // Anti-Duplication Auditor Stats
  const duplicateProductStats = useMemo(() => {
    return countDuplicateProductRows(products);
  }, [products]);

  const duplicateCustomerStats = useMemo(() => {
    const codeMap = new Map<string, number>();
    const phoneMap = new Map<string, number>();
    let dupCodes = 0;
    let dupPhones = 0;
    customers.forEach((c) => {
      const cd = (c.code || '').trim().toLowerCase();
      if (cd) {
        if (codeMap.has(cd)) dupCodes++;
        else codeMap.set(cd, 1);
      }
      const ph = (c.phone || '').trim().replace(/\D/g, '');
      if (ph && ph.length >= 8) {
        if (phoneMap.has(ph)) dupPhones++;
        else phoneMap.set(ph, 1);
      }
    });
    return { dupCodes, dupPhones, total: customers.length };
  }, [customers]);

  const duplicateTargetStats = useMemo(() => {
    const keyMap = new Map<string, number>();
    let dupTargets = 0;
    targets.forEach((t) => {
      const k = `${normalizeArabicText(t.branch)}__${normalizeArabicText(t.repName)}__${String(t.date || '')}`;
      if (keyMap.has(k)) dupTargets++;
      else keyMap.set(k, 1);
    });
    return { dupTargets, total: targets.length };
  }, [targets]);

  const handleRunFullDeduplication = () => {
    try {
      cleanAndDeduplicateCustomers();
      const cleaned = deduplicateProductArray(products);
      if (cleaned.length !== products.length) {
        importProductsList(cleaned, 'replace');
      }
      showSuccess('تم بنجاح فحص وتطهير كافة البيانات وضمان عدم وجود أي تكرارات في الكتالوج أو العملاء 🛡️');
    } catch (e: any) {
      showError('فشل تطهير البيانات: ' + (e?.message || e));
    }
  };

  const handleExportForecastReport = () => {
    try {
      setIsExportingForecast(true);
      const wb = XLSX.utils.book_new();

      // Sheet 1: ملخص التوقعات التنفيذية
      const summaryRows = [
        ['تقرير التوقعات الأسبوعية والشهرية — مجموعة الطنطاوي (النظام الاحتياطي الميداني)'],
        [`تاريخ استخراج التقرير: ${new Date().toLocaleDateString('ar-EG')}`, `الشهر: ${ARABIC_MONTHS[currentMonth - 1]} ${currentYear}`, `المستخدم: ${currentUser?.name || 'الإدارة'} (${currentUser?.role || ''})`],
        [`الفرع: ${effectiveBranch !== 'all' ? effectiveBranch : 'كافة الفروع'}`],
        [],
        ['المؤشر التوقعي', 'القيمة بالجنيه المصري', 'ملاحظات المسار البيعي'],
        ['إجمالي التارجت الشهري المستهدف', summaryMetrics.totalTarget, 'المستهدف الشهري الإجمالي المعتمد'],
        ['المحقق الفعلي حتى اليوم', summaryMetrics.totalActual, `مبيعات محققة حتى يوم ${currentDay}`],
        ['التوقع النهائي بنهاية الشهر', summaryMetrics.totalProjected, 'محسوب وفق سرعة البيع اليومية Run-Rate'],
        ['الفارق المتوقع بنهاية الشهر', summaryMetrics.totalVariance, summaryMetrics.totalVariance >= 0 ? 'فائض بيعي متوقع 🚀' : 'عجز متوقع يستوجب المتابعة ⚠️'],
        ['نسبة الإنجاز المتوقعة', `${summaryMetrics.overallRate}%`, 'النسبة المئوية المقدرة للمبيعات'],
        ['متوسط البيع اليومي المحقق', summaryMetrics.dailyRunRate, 'معدل البيع الفعلي لليوم الواحد'],
        ['المطلوب تحقيقه يومياً للمتبقي', summaryMetrics.requiredDailyRate, `المطلوب يومياً خلال الـ ${remainingDays} يوماً المتبقية`],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص التنفيذي');

      // Sheet 2: أداء وتوقعات المناديب
      const repHeaders = [
        'كود المندوب',
        'اسم المندوب',
        'الفرع',
        'المشرف',
        'تارجت الشهر',
        'المحقق الفعلي',
        'سرعة البيع اليومية',
        'التوقع الأسبوعي الحالي',
        'المحقق في الأسبوع الحالي',
        'التوقع النهائي للشهر',
        'نسبة التوقع %',
        'الفارق المتوقع',
        'حالة المسار'
      ];
      const repData = repForecastRows.map((r) => [
        r.rep.code || '---',
        r.rep.name,
        r.rep.branchName || 'الفرع الرئيسي',
        users.find((u) => u.id === r.rep.supervisorId)?.name || 'عام',
        r.target,
        r.actualSales,
        r.dailyRunRate,
        r.currentWeekTarget,
        r.currentWeekActual,
        r.projectedMonthEnd,
        `${r.projectedRate}%`,
        r.variance,
        r.status === 'super' ? 'متفوق ومتقدم' : r.status === 'on_track' ? 'على المسار' : 'يحتاج تسريع',
      ]);
      const wsReps = XLSX.utils.aoa_to_sheet([repHeaders, ...repData]);
      XLSX.utils.book_append_sheet(wb, wsReps, 'توقعات المناديب');

      // Sheet 3: توزيع الأسابيع الخمسة
      const weekHeaders = ['الأسبوع', 'الفترة الزمنية', 'التارجت الأسبوعي', 'المحقق الفعلي', 'نسبة الإنجاز', 'الحالة'];
      const weekData = summaryMetrics.weeklyTotals.map((w) => [
        w.label,
        w.dateRange,
        w.target,
        w.actual,
        `${w.rate}%`,
        w.isCurrent ? 'الأسبوع الحالي (جاري)' : w.isPassed ? 'منقضي' : 'قادم',
      ]);
      const wsWeeks = XLSX.utils.aoa_to_sheet([weekHeaders, ...weekData]);
      XLSX.utils.book_append_sheet(wb, wsWeeks, 'توزيع الأسابيع');

      XLSX.writeFile(wb, `تقرير_التوقع_الشهري_والاسبوعي_${currentYear}_${currentMonth}.xlsx`);
      showSuccess('تم بنجاح استخراج وتصدير تقرير التوقعات الأسبوعية والشهرية للإكسل 📊');
    } catch (e: any) {
      showError('فشل تصدير تقرير التوقعات: ' + (e?.message || e));
    } finally {
      setIsExportingForecast(false);
    }
  };

  // ----------------------------------------------------
  // TAB 1: رابط الأصناف والرصيد (Products & Inventory)
  // ----------------------------------------------------
  const [productsSheetUrl, setProductsSheetUrl] = useState(() => getSavedSourceUrl('products'));
  const [isSyncingProducts, setIsSyncingProducts] = useState(false);
  const [productsFileLoading, setProductsFileLoading] = useState(false);
  const [productsSearchTerm, setProductsSearchTerm] = useState('');
  const [productsCategoryFilter, setProductsCategoryFilter] = useState('all');
  const [productsPage, setProductsPage] = useState(1);
  const productsPageSize = 25;

  // Wipe Products Modal
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeInvoicesToo, setWipeInvoicesToo] = useState(false);

  // ----------------------------------------------------
  // TAB 2: رابط قاعدة العملاء (Customer Database & Balances)
  // ----------------------------------------------------
  const [customerSheetUrl, setCustomerSheetUrl] = useState(() => getSavedSourceUrl('customers'));
  const [isSyncingCustomers, setIsSyncingCustomers] = useState(false);
  const [customersFileLoading, setCustomersFileLoading] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerSelectedBranchFilter, setCustomerSelectedBranchFilter] = useState('all');
  const [customerSelectedRepFilter, setCustomerSelectedRepFilter] = useState('all');
  const [customerTableTab, setCustomerTableTab] = useState<'balances' | 'sales_2026'>('balances');
  const [customerPage, setCustomerPage] = useState(1);
  const customerPageSize = 30;

  // ----------------------------------------------------
  // TAB 3: رابط التارجت والمحققات (Targets & Performance)
  // ----------------------------------------------------
  const [targetsSheetUrl, setTargetsSheetUrl] = useState(() => getSavedSourceUrl('targets'));
  const [isSyncingTargets, setIsSyncingTargets] = useState(false);
  const [targetsFileLoading, setTargetsFileLoading] = useState(false);
  const [targetsSearchTerm, setTargetsSearchTerm] = useState('');
  const [targetsBranchFilter, setTargetsBranchFilter] = useState('all');
  const [targetsMonthFilter, setTargetsMonthFilter] = useState<'ALL' | number>('ALL');

  // Strict RBAC: Admin & Developer only
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  // RBAC checks for administrative sync operations (Google Sheets live links, system-wide wipe)
  const canManageCloudSync = isAdminOrDev || isBranchMgr;

  // Clear notices after 6 seconds
  const showSuccess = (msg: string) => {
    setSuccessNotice(msg);
    setErrorNotice(null);
    setTimeout(() => setSuccessNotice(null), 6500);
  };

  const showError = (msg: string) => {
    setErrorNotice(msg);
    setSuccessNotice(null);
    setTimeout(() => setErrorNotice(null), 8000);
  };

  // ----------------------------------------------------
  // Handlers for Tab 1: Products
  // ----------------------------------------------------
  const handleSyncProductsSheet = async () => {
    const cleanUrl = productsSheetUrl.trim();
    if (!cleanUrl) {
      showError('يرجى لصق رابط Google Sheet الخاص بالأصناف والمخزون أولاً.');
      return;
    }
    setIsSyncingProducts(true);
    try {
      const res = await fetchAndParseGoogleSheet(cleanUrl);
      if (res.errors && res.errors.length > 0 && res.products.length === 0) {
        showError(res.errors[0]);
        return;
      }
      if (res.products.length === 0) {
        showError('لم يتم العثور على أي صفوف أصناف صالحة في الرابط المُدخل.');
        return;
      }

      // Smart Upsert
      importProductsList(res.products, 'merge');
      saveSingleSourceUrl('products', cleanUrl);

      showSuccess(`تم بنجاح جلب وتحديث ${res.products.length} صنف بنظام التحديث الذكي (Upsert) وحفظ الرابط!`);
    } catch (err: any) {
      showError(err?.message || 'حدث خطأ أثناء قراءة شيت الأصناف من Google Sheets.');
    } finally {
      setIsSyncingProducts(false);
    }
  };

  const handleProductsFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProductsFileLoading(true);
    try {
      const res = await parseExcelProducts(file);
      if (res.products.length === 0) {
        showError(res.errors[0] || 'الملف لا يحتوي على أصناف صالحة.');
        return;
      }
      importProductsList(res.products, 'merge');
      showSuccess(`تم رفع وتحديث ${res.products.length} صنف بنجاح من ملف الإكسل دون تكرار!`);
    } catch (err: any) {
      showError(err?.message || 'فشل قراءة ملف الإكسل.');
    } finally {
      setProductsFileLoading(false);
      e.target.value = '';
    }
  };

  const handleWipeProductsConfirm = async () => {
    setIsWiping(true);
    try {
      await wipeAllProductsAndData({ wipeInvoices: wipeInvoicesToo });
      setIsWipeModalOpen(false);
      showSuccess('تم مسح وتصفير بيانات الأصناف بنجاح للبدء من جديد!');
    } catch (err: any) {
      showError(err?.message || 'فشل التصفير.');
    } finally {
      setIsWiping(false);
    }
  };

  // ----------------------------------------------------
  // Handlers for Tab 2: Customers
  // ----------------------------------------------------
  const handleSyncCustomersSheet = async () => {
    const cleanUrl = customerSheetUrl.trim();
    if (!cleanUrl) {
      showError('يرجى لصق رابط Google Sheet الخاص بقاعدة العملاء أولاً.');
      return;
    }
    setIsSyncingCustomers(true);
    try {
      const res = await fetchCustomersFromGoogleSheetUrl(cleanUrl);
      if (res.errors && res.errors.length > 0 && res.customers.length === 0) {
        showError(res.errors[0]);
        return;
      }
      if (res.customers.length === 0) {
        showError('لم يتم العثور على أي عملاء صالحين في الرابط المُدخل.');
        return;
      }

      // The Google Sheet is the authoritative customer source: replace the
      // entire catalog and wait for the server to confirm, so a failed save is
      // never reported as a successful sync.
      const saved = await importCustomersList(res.customers, 'replace');
      saveSingleSourceUrl('customers', cleanUrl);

      if (saved.success) {
        showSuccess(saved.message);
      } else {
        showError(saved.message);
      }
    } catch (err: any) {
      showError(err?.message || 'حدث خطأ أثناء قراءة شيت العملاء من Google Sheets.');
    } finally {
      setIsSyncingCustomers(false);
    }
  };

  const handleCustomersFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCustomersFileLoading(true);
    try {
      const res = await parseExcelCustomers(file);
      if (res.customers.length === 0) {
        showError(res.errors[0] || 'الملف لا يحتوي على عملاء صالحين.');
        return;
      }
      // Replace mode so repeated uploads of the same/refresh sheet never duplicate
      const saved = await importCustomersList(res.customers, 'replace');
      if (saved.success) {
        showSuccess(saved.message);
      } else {
        showError(saved.message);
      }
    } catch (err: any) {
      showError(err?.message || 'فشل قراءة ملف العملاء.');
    } finally {
      setCustomersFileLoading(false);
      e.target.value = '';
    }
  };

  const handleCleanDuplicates = () => {
    const res = cleanAndDeduplicateCustomers();
    if (res.duplicatesRemoved > 0) {
      showSuccess(`تم بنجاح تنظيف ودمج ${res.duplicatesRemoved} عميل مكرر! أصبح إجمالي العملاء الفعليين ${res.deduplicatedCount} عميل موحدين مالياً.`);
    } else {
      showSuccess(`قاعدة العملاء نظيفة وموحدة بنسبة 100% (${res.deduplicatedCount} عميل)، ولا توجد أي صفوف مكررة.`);
    }
  };

  const handleAutoCreateReps = () => {
    const res = autoCreateMissingRepsFromCustomers();
    if (res.count > 0) {
      showSuccess(res.message);
    } else {
      showSuccess('جميع المناديب الواردة أسماؤهم في شيت العملاء يمتلكون حسابات مسجلة ومفعلة بالفعل.');
    }
  };

  const handleRefreshRepLinks = () => {
    const res = refreshCustomerRepLinks();
    showSuccess(`تم ربط ${res.linkedCustomersCount} عميل بحسابات مناديبهم بنجاح.`);
  };

  // ----------------------------------------------------
  // Handlers for Tab 3: Targets
  // ----------------------------------------------------
  const handleSyncTargetsSheet = async () => {
    const cleanUrl = targetsSheetUrl.trim();
    if (!cleanUrl) {
      showError('يرجى لصق رابط Google Sheet الخاص بالتارجت والمحققات أولاً.');
      return;
    }
    setIsSyncingTargets(true);
    try {
      const res = await importTargetsFromGoogleSheet(cleanUrl);
      if (!res.success) {
        showError(res.message);
        return;
      }
      saveSingleSourceUrl('targets', cleanUrl);
      showSuccess(res.message);
    } catch (err: any) {
      showError(err?.message || 'حدث خطأ أثناء قراءة شيت التارجت والمحققات.');
    } finally {
      setIsSyncingTargets(false);
    }
  };

  const handleTargetsFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTargetsFileLoading(true);
    try {
      const res = await importTargetsFromExcel(file);
      if (!res.success) {
        showError(res.message);
        return;
      }
      showSuccess(res.message);
    } catch (err: any) {
      showError(err?.message || 'فشل قراءة ملف التارجت.');
    } finally {
      setTargetsFileLoading(false);
      e.target.value = '';
    }
  };

  const handlePublishNewVersion = async () => {
    setIsPublishingVersion(true);
    try {
      const res = await publishDataVersionUpdate({
        scope: publishScope,
        notes: publishNotes.trim() || undefined,
        forcePurge: publishForcePurge,
      });
      if (res.success) {
        showSuccess(res.message);
        setIsPublishModalOpen(false);
        setPublishNotes('');
      } else {
        showError(res.message);
      }
    } catch (e: any) {
      showError(e?.message || 'فشل نشر الإصدار الجديد');
    } finally {
      setIsPublishingVersion(false);
    }
  };

  // ----------------------------------------------------
  // Filtered Lists & Memoized Calculations
  // ----------------------------------------------------
  // 1. Products filtering
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCategory = productsCategoryFilter === 'all' || p.category === productsCategoryFilter || p.department === productsCategoryFilter;
      if (!matchCategory) return false;
      if (!productsSearchTerm.trim()) return true;
      const q = productsSearchTerm.toLowerCase();
      return (
        (p.name || '').toLowerCase().includes(q) ||
        (p.code || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    });
  }, [products, productsCategoryFilter, productsSearchTerm]);

  const pagedProducts = useMemo(() => {
    const start = (productsPage - 1) * productsPageSize;
    return filteredProducts.slice(start, start + productsPageSize);
  }, [filteredProducts, productsPage]);

  const productCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
      if (p.department) set.add(p.department);
    });
    return Array.from(set);
  }, [products]);

  // 2. Customers filtering
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchBranch = customerSelectedBranchFilter === 'all' || c.branchName === customerSelectedBranchFilter;
      const matchRep = customerSelectedRepFilter === 'all' || c.repName === customerSelectedRepFilter || c.salesRepName === customerSelectedRepFilter;
      if (!matchBranch || !matchRep) return false;
      if (!customerSearchTerm.trim()) return true;
      const q = customerSearchTerm.toLowerCase();
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.storeName || '').toLowerCase().includes(q)
      );
    });
  }, [customers, customerSelectedBranchFilter, customerSelectedRepFilter, customerSearchTerm]);

  const pagedCustomers = useMemo(() => {
    const start = (customerPage - 1) * customerPageSize;
    return filteredCustomers.slice(start, start + customerPageSize);
  }, [filteredCustomers, customerPage]);

  const customerBranches = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.branchName) set.add(c.branchName);
    });
    return Array.from(set);
  }, [customers]);

  const customerReps = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      const rep = c.salesRepName || c.repName;
      if (rep) set.add(rep);
    });
    return Array.from(set);
  }, [customers]);

  // 3. Targets filtering & KPIs
  const filteredTargets = useMemo(() => {
    return targets.filter((r) => {
      const matchBranch = targetsBranchFilter === 'all' || r.branch === targetsBranchFilter;
      const matchMonth = targetsMonthFilter === 'ALL' || r.month === targetsMonthFilter;
      if (!matchBranch || !matchMonth) return false;
      if (!targetsSearchTerm.trim()) return true;
      const q = targetsSearchTerm.toLowerCase();
      return (
        (r.repName || '').toLowerCase().includes(q) ||
        (r.branch || '').toLowerCase().includes(q)
      );
    });
  }, [targets, targetsBranchFilter, targetsMonthFilter, targetsSearchTerm]);

  const targetsSummary = useMemo(() => {
    let totalSalesTarget = 0;
    let totalSalesAchieved = 0;
    let totalCollectionTarget = 0;
    let totalCollectionAchieved = 0;
    const repsSet = new Set<string>();

    filteredTargets.forEach((r) => {
      totalSalesTarget += r.salesTarget || 0;
      totalSalesAchieved += r.salesAchieved || 0;
      totalCollectionTarget += r.collectionTarget || 0;
      totalCollectionAchieved += r.collectionAchieved || 0;
      if (r.repName) repsSet.add(r.repName);
    });

    const salesPct = totalSalesTarget > 0 ? (totalSalesAchieved / totalSalesTarget) * 100 : 0;
    const collPct = totalCollectionTarget > 0 ? (totalCollectionAchieved / totalCollectionTarget) * 100 : 0;

    return {
      totalSalesTarget,
      totalSalesAchieved,
      salesPct: Number(salesPct.toFixed(1)),
      totalCollectionTarget,
      totalCollectionAchieved,
      collPct: Number(collPct.toFixed(1)),
      repsCount: repsSet.size,
    };
  }, [filteredTargets]);

  const targetsBranches = useMemo(() => {
    const set = new Set<string>();
    targets.forEach((r) => {
      if (r.branch) set.add(r.branch);
    });
    return Array.from(set);
  }, [targets]);

  return (
    <div className="space-y-6 pb-16">
      {/* Toast Notifications */}
      {successNotice && (
        <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between text-xs sm:text-sm animate-in fade-in sticky top-4 z-50">
          <div className="flex items-center gap-3 font-bold">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice(null)} className="p-1 hover:bg-emerald-700 rounded-lg cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorNotice && (
        <div className="bg-rose-600 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between text-xs sm:text-sm animate-in fade-in sticky top-4 z-50">
          <div className="flex items-center gap-3 font-bold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorNotice}</span>
          </div>
          <button onClick={() => setErrorNotice(null)} className="p-1 hover:bg-rose-700 rounded-lg cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Header & 3 Dedicated Links */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900">مركز ربط الشيتات المعتمد</h2>
                <span className="bg-emerald-100 text-emerald-900 text-[11px] font-black px-2.5 py-0.5 rounded-full border border-emerald-300">
                  تحديث ذكي (Upsert)
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                المصدر الموحد والمباشر لربط ومزامنة شيتات جوجل الثلاثة دون أي تكرار للبيانات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-100 px-3.5 py-2 rounded-xl self-start md:self-auto border border-slate-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              {isSalesRep
                ? `نطاق المندوب: بياناتك وتوقعاتك الشخصية فقط (${currentUser?.name || ''})`
                : isSupervisor
                ? `نطاق المشرف: فريقك المباشر فقط (${currentUser?.name || ''})`
                : isBranchMgr
                ? `نطاق الفرع: بيانات وتوقعات فرع ${currentUser?.branchName || ''}`
                : 'صلاحية الإدارة: تحكم كامل وتوقعات شاملة لكافة الفروع'}
            </span>
          </div>
        </div>

        {/* منظومة إصدار التحديثات ومسح الكاش التلقائي لضمان عدم تدبيل البيانات */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-slate-700/80 shadow-md">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-400 text-slate-950 font-black text-xs shadow-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${isVersionSyncing ? 'animate-spin' : ''}`} />
                  تحديث تلقائي لكل المستخدمين
                </span>
                <span className="bg-slate-800 text-slate-300 text-[11px] px-2.5 py-1 rounded-lg border border-slate-700 font-bold">
                  {globalDataVersion?.updatedAt
                    ? `آخر تحديث: ${new Date(globalDataVersion.updatedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} (${globalDataVersion.updatedBy || 'مدير النظام'})`
                    : 'يتم التحديث تلقائياً'}
                </span>
                <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 text-[11px] px-2.5 py-1 rounded-lg font-bold">
                  نطاق التحديث: {globalDataVersion?.scope === 'all' ? 'شامل لكافة البيانات' : globalDataVersion?.scope === 'products' ? 'الأصناف والأسعار' : globalDataVersion?.scope === 'customers' ? 'قاعدة العملاء' : 'الأهداف والمحققات'}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed pt-1">
                {globalDataVersion?.notes || 'آلية إصدار التحديثات تضمن مسح الكاش القديم تلقائياً عند جميع المناديب والمشرفين فور نشر أي شيت جديد، مما يمنع تدبيل البيانات ويوحد الأرقام.'}
              </p>
            </div>
          </div>
        </div>

        {/* The 5 Core Tabs: Forecast, Duplication Check, Products, Customers, Targets */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100">
          {/* TAB 1: التوقع الشهري والأسبوعي */}
          <button
            onClick={() => setActiveTab('forecast')}
            className={`p-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition cursor-pointer border ${
              activeTab === 'forecast'
                ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-md font-black'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className={`w-4 h-4 ${activeTab === 'forecast' ? 'text-slate-950' : 'text-amber-600'}`} />
              <span>التوقع الشهري والأسبوعي</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-400/30 text-slate-950">
              جديد ⚡
            </span>
          </button>

          {/* TAB 2: فحص ومنع التكرار */}
          <button
            onClick={() => setActiveTab('dedup')}
            className={`p-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition cursor-pointer border ${
              activeTab === 'dedup'
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-md'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${activeTab === 'dedup' ? 'text-white' : 'text-indigo-600'}`} />
              <span>فحص ومنع التكرار</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-900">
              0 تكرار ✓
            </span>
          </button>

          {/* TAB 3: رابط الأصناف والرصيد */}
          <button
            onClick={() => setActiveTab('products')}
            className={`p-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition cursor-pointer border ${
              activeTab === 'products'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-md'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <Package className={`w-4 h-4 ${activeTab === 'products' ? 'text-white' : 'text-emerald-600'}`} />
              <span>رابط الأصناف والرصيد</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
              {products.length}
            </span>
          </button>

          {/* TAB 4: رابط قاعدة العملاء */}
          <button
            onClick={() => setActiveTab('customers')}
            className={`p-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition cursor-pointer border ${
              activeTab === 'customers'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-md'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className={`w-4 h-4 ${activeTab === 'customers' ? 'text-white' : 'text-amber-600'}`} />
              <span>رابط قاعدة العملاء</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900">
              {customers.length}
            </span>
          </button>

          {/* TAB 5: رابط التارجت والمحققات */}
          <button
            onClick={() => setActiveTab('targets')}
            className={`p-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between transition cursor-pointer border ${
              activeTab === 'targets'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-md'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <Target className={`w-4 h-4 ${activeTab === 'targets' ? 'text-white' : 'text-blue-600'}`} />
              <span>رابط التارجت والمحققات</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-900">
              {targets.length}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB: التوقع الشهري والأسبوعي الذكي                                         */}
      {/* ========================================================================= */}
      {activeTab === 'forecast' && (
        <div className="space-y-6">
          {/* Header & Filter Controls */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-slate-800 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 bg-amber-400/20 text-amber-300 text-xs font-black px-3 py-1 rounded-full border border-amber-400/30 mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                  <span>لوحة التوقع الشهري والأسبوعي الذكي (Forecast Engine)</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  توقعات المبيعات الأسبوعية والشهرية — {ARABIC_MONTHS[currentMonth - 1]} {currentYear}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  تحليل سرعة البيع اليومية (Run-Rate)، التوقع النهائي للشهر، ومتابعة الأداء أسبوعاً بأسبوع وفق الصلاحيات الميدانية لحماية سرية البيانات.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportForecastReport}
                  disabled={isExportingForecast}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-md transition cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{isExportingForecast ? 'جاري التصدير...' : 'تصدير تقرير التوقعات Excel 📊'}</span>
                </button>
              </div>
            </div>

            {/* Scope Badge & Hierarchy Notice */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800 text-xs font-bold">
              <span className="text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>نطاق العرض الحالي:</span>
              </span>
              {isSalesRep ? (
                <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                  🔒 بياناتك وتوقعاتك الشخصية فقط ({currentUser?.name})
                </span>
              ) : isSupervisor ? (
                <span className="bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-500/30">
                  👥 فريق الإشراف التابع لك فقط ({scopedReps.length} مندوب)
                </span>
              ) : isBranchMgr ? (
                <span className="bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-lg border border-amber-500/30">
                  🏢 مناديب ومشرفي فرع {currentUser?.branchName || ''} ({scopedReps.length} مندوب)
                </span>
              ) : (
                <span className="bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-lg border border-blue-500/30">
                  🌐 نظرة مركزية شاملة لكافة الفروع ({scopedReps.length} مندوب)
                </span>
              )}

              <span className="text-slate-400 mr-auto font-mono text-[11px]">
                اليوم {currentDay} من {daysInCurrentMonth} • متبقي {remainingDays} يوماً • الأسبوع {currentWeekIndex}
              </span>
            </div>

            {/* Slicers for Admin & Branch Manager */}
            {(isSuperAdmin || (isBranchMgr && !isSupervisor && !isSalesRep)) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
                {isSuperAdmin && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300">تصفية الفرع:</label>
                    <select
                      value={forecastBranchFilter}
                      onChange={(e) => setForecastBranchFilter(e.target.value)}
                      className="w-full bg-slate-800 text-white border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-amber-400 cursor-pointer"
                    >
                      <option value="all">كافة الفروع</option>
                      {branches
                        .filter((b) => !b.isMainWarehouse && !b.name.includes('المخزن المركزي'))
                        .map((b) => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                    </select>
                  </div>
                )}

                {isSuperAdmin && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300">مشرف الفريق:</label>
                    <select
                      value={forecastSupervisorFilter}
                      onChange={(e) => setForecastSupervisorFilter(e.target.value)}
                      className="w-full bg-slate-800 text-white border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-amber-400 cursor-pointer"
                    >
                      <option value="all">كافة المشرفين</option>
                      {users
                        .filter((u) => u.role === 'supervisor')
                        .map((u) => (
                          <option key={u.id} value={u.id}>{u.name} ({u.branchName || 'عام'})</option>
                        ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">بحث عن مندوب:</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={forecastRepSearch}
                      onChange={(e) => setForecastRepSearch(e.target.value)}
                      placeholder="اسم أو كود المندوب..."
                      className="w-full bg-slate-800 text-white border border-slate-700 rounded-xl pr-9 pl-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4 Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: التوقع الشهري الإجمالي */}
            <div className="bg-white rounded-3xl p-5 border-2 border-slate-200 hover:border-amber-400 shadow-sm transition space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">التوقع الشهري الإجمالي</span>
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                  <Target className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {formatCurrency(summaryMetrics.totalProjected)}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold mt-1">
                  <span className="text-slate-500">التارجت:</span>
                  <span className="text-slate-800 font-mono">{formatCurrency(summaryMetrics.totalTarget)}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-600">نسبة التوقع للإنجاز:</span>
                  <span className={`font-black ${summaryMetrics.overallRate >= 100 ? 'text-emerald-600' : summaryMetrics.overallRate >= 80 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {summaryMetrics.overallRate}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      summaryMetrics.overallRate >= 100 ? 'bg-emerald-500' : summaryMetrics.overallRate >= 80 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, summaryMetrics.overallRate)}%` }}
                  />
                </div>
                <div className="text-[10px] font-bold text-slate-500 text-left">
                  الفارق: <strong className={summaryMetrics.totalVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                    {summaryMetrics.totalVariance >= 0 ? '+' : ''}{formatCurrency(summaryMetrics.totalVariance)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Card 2: التوقع الأسبوعي الحالي */}
            <div className="bg-white rounded-3xl p-5 border-2 border-slate-200 hover:border-amber-400 shadow-sm transition space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">التوقع الأسبوعي الحالي (W{currentWeekIndex})</span>
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-blue-900 font-mono">
                  {formatCurrency(summaryMetrics.currentWeekActual)}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold mt-1">
                  <span className="text-slate-500">تارجت الأسبوع:</span>
                  <span className="text-slate-800 font-mono">{formatCurrency(summaryMetrics.currentWeekTarget)}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black bg-blue-50 text-blue-800 border border-blue-200">
                  <Clock className="w-3.5 h-3.5" />
                  <span>الأسبوع {currentWeekIndex} جاري الآن</span>
                </div>
              </div>
            </div>

            {/* Card 3: سرعة البيع اليومية */}
            <div className="bg-white rounded-3xl p-5 border-2 border-slate-200 hover:border-amber-400 shadow-sm transition space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">سرعة البيع اليومية (Run-Rate)</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-800 font-mono">
                  {formatCurrency(summaryMetrics.dailyRunRate)}
                </div>
                <div className="text-[11px] text-slate-500 font-bold mt-0.5">متوسط المبيعات اليومية المحققة</div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] font-bold text-slate-600">
                المطلوب يومياً للمتبقي ({remainingDays} يوماً):
                <div className="text-sm font-black text-slate-900 font-mono mt-0.5">
                  {formatCurrency(summaryMetrics.requiredDailyRate)} / يوم
                </div>
              </div>
            </div>

            {/* Card 4: توقعات التحصيل المالي */}
            <div className="bg-white rounded-3xl p-5 border-2 border-slate-200 hover:border-amber-400 shadow-sm transition space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">توقعات التحصيل المالي</span>
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-black">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-purple-900 font-mono">
                  {formatCurrency(summaryMetrics.totalCollectionForecast > 0 ? summaryMetrics.totalCollectionForecast : summaryMetrics.totalCollectionTarget)}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold mt-1">
                  <span className="text-slate-500">تارجت التحصيل:</span>
                  <span className="text-slate-800 font-mono">{formatCurrency(summaryMetrics.totalCollectionTarget)}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] font-bold text-purple-700">
                مبني على مستحقات العملاء المسجلة وتوقعات المناديب
              </div>
            </div>
          </div>

          {/* Five-Week Milestone Timeline */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-amber-500" />
                  <span>المسار الزمني لتوزيع الأسابيع الخمسة ({ARABIC_MONTHS[currentMonth - 1]})</span>
                </h4>
                <p className="text-xs text-slate-500">متابعة دقيقة لمستهدف ومحقق كل أسبوع لضبط الإيقاع البيعي ومنع المفاجآت بنهاية الشهر</p>
              </div>
              <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl">
                نحن الآن في الأسبوع {currentWeekIndex}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {summaryMetrics.weeklyTotals.map((w) => (
                <div
                  key={w.weekIndex}
                  className={`p-4 rounded-2xl border-2 transition ${
                    w.isCurrent
                      ? 'bg-amber-50/70 border-amber-400 shadow-md ring-2 ring-amber-400/40'
                      : w.isPassed
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-white border-slate-200 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-black text-xs text-slate-900">{w.label}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      w.isCurrent ? 'bg-amber-400 text-slate-950 animate-pulse' : w.isPassed ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {w.isCurrent ? 'جاري الآن ⚡' : w.isPassed ? 'منقضي' : 'قادم'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold mb-2">{w.dateRange}</div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">المحقق:</span>
                      <strong className="text-slate-900 font-mono">{formatCurrency(w.actual)}</strong>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">التارجت:</span>
                      <span className="text-slate-600 font-mono text-[11px]">{formatCurrency(w.target)}</span>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-200/80">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-600">نسبة الإنجاز:</span>
                      <span className={`font-mono font-black ${w.rate >= 100 ? 'text-emerald-700' : w.rate >= 80 ? 'text-amber-700' : 'text-slate-700'}`}>
                        {w.rate}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full rounded-full ${w.rate >= 100 ? 'bg-emerald-500' : w.rate >= 80 ? 'bg-amber-500' : 'bg-slate-400'}`}
                        style={{ width: `${Math.min(100, w.rate)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reps Forecast & Performance Matrix */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-slate-200 shadow-sm space-y-4 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  <span>جدول أداء وتوقعات المناديب الميدانية ({repForecastRows.length} مندوب)</span>
                </h4>
                <p className="text-xs text-slate-500">مصفوفة التوقع المحسوبة تلقائياً وفق سرعة البيع الميداني للمندوب</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-900 text-white font-black text-[11px]">
                  <tr>
                    <th className="p-3">المندوب</th>
                    <th className="p-3">الفرع / المشرف</th>
                    <th className="p-3 text-center">تارجت الشهر</th>
                    <th className="p-3 text-center">المحقق الفعلي</th>
                    <th className="p-3 text-center">البيع اليومي</th>
                    <th className="p-3 text-center">توقع الأسبوع الحالي</th>
                    <th className="p-3 text-center">التوقع الشهري</th>
                    <th className="p-3 text-center">نسبة التوقع %</th>
                    <th className="p-3 text-center">الفارق المتوقع</th>
                    <th className="p-3 text-center">حالة المسار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {repForecastRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400 font-bold">
                        لا يوجد مناديب مسجلين ضمن نطاق البحث والصلاحية المحددة.
                      </td>
                    </tr>
                  ) : (
                    repForecastRows.map((row) => (
                      <tr key={row.rep.id} className="hover:bg-amber-50/40 transition">
                        <td className="p-3">
                          <div className="font-black text-slate-900">{row.rep.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">كود: {row.rep.code || row.rep.username || '---'}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-700">{row.rep.branchName || 'الفرع الرئيسي'}</div>
                          <div className="text-[10px] text-slate-400">
                            مشرف: {users.find((u) => u.id === row.rep.supervisorId)?.name || '---'}
                          </div>
                        </td>
                        <td className="p-3 text-center font-bold font-mono text-slate-800">
                          {formatCurrency(row.target)}
                        </td>
                        <td className="p-3 text-center font-black font-mono text-slate-900">
                          {formatCurrency(row.actualSales)}
                        </td>
                        <td className="p-3 text-center font-bold font-mono text-emerald-800">
                          {formatCurrency(row.dailyRunRate)}/يوم
                        </td>
                        <td className="p-3 text-center font-bold font-mono text-blue-900">
                          {formatCurrency(row.currentWeekActual)}
                          <span className="text-[9px] text-slate-400 block font-normal">من {formatCurrency(row.currentWeekTarget)}</span>
                        </td>
                        <td className="p-3 text-center font-black font-mono text-amber-900 text-sm">
                          {formatCurrency(row.projectedMonthEnd)}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-black font-mono ${
                            row.projectedRate >= 100 ? 'bg-emerald-100 text-emerald-800' : row.projectedRate >= 80 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {row.projectedRate}%
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold font-mono">
                          <span className={row.variance >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {row.variance >= 0 ? '+' : ''}{formatCurrency(row.variance)}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {row.status === 'super' ? (
                            <span className="px-2 py-1 rounded-xl text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-300 inline-flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              <span>متفوق 🚀</span>
                            </span>
                          ) : row.status === 'on_track' ? (
                            <span className="px-2 py-1 rounded-xl text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-300 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>على المسار ⚡</span>
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-xl text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-300 inline-flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>يحتاج تسريع ⚠️</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: فحص ومنع تكرار البيانات (Anti-Duplication Auditor)                  */}
      {/* ========================================================================= */}
      {activeTab === 'dedup' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-indigo-800/40 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 text-xs font-black px-3 py-1 rounded-full border border-indigo-500/30 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>محرك سلامة ونزاهة البيانات (Zero Duplicates Engine)</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  فحص ومنع تكرار البيانات في كافة الجداول
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  فحص فوري لقاعدة البيانات يضمن عدم تكرار كود أي صنف، أو عميل، أو تارجت، أو فاتورة؛ ودمج الصفوف المتطابقة تلقائياً للحفاظ على دقة الأرقام.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunFullDeduplication}
                className="bg-indigo-500 hover:bg-indigo-400 text-white font-black px-5 py-3 rounded-2xl text-xs sm:text-sm flex items-center gap-2 shadow-lg transition cursor-pointer active:scale-95"
              >
                <CheckCheck className="w-4 h-4" />
                <span>تنفيذ فحص وتطهير شامل الآن 🛡️</span>
              </button>
            </div>
          </div>

          {/* Audit Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl p-5 border-2 border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">أصناف الكتالوج</span>
                <Package className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {duplicateProductStats.uniqueCount} صنف فريد
              </div>
              <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>التكرارات: {duplicateProductStats.duplicateRows} (مدمجة بالكامل)</span>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border-2 border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">قاعدة العملاء</span>
                <Users className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {duplicateCustomerStats.total} عميل
              </div>
              <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>أكواد مكررة: {duplicateCustomerStats.dupCodes} • هواتف مكررة: {duplicateCustomerStats.dupPhones}</span>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border-2 border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">سجلات التارجت</span>
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {duplicateTargetStats.total} سجل
              </div>
              <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>أهداف مكررة: {duplicateTargetStats.dupTargets} (تمت التنقية)</span>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border-2 border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">الفواتير والطلبيات</span>
                <FileCheck className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">
                {invoices.length} فاتورة
              </div>
              <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>أرقام الفواتير فريدة 100% دون أي ازدواج</span>
              </div>
            </div>
          </div>

          {/* Quick Hygiene Tools */}
          <div className="bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-sm space-y-4">
            <h4 className="text-base font-black text-slate-900">أدوات التنقية والمزامنة السريعة</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  cleanAndDeduplicateCustomers();
                  showSuccess('تمت تنقية ودمج العملاء المكررين بنجاح!');
                }}
                className="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-right transition cursor-pointer"
              >
                <div className="font-black text-sm text-slate-900 mb-1">1. تنقية وتوحيد العملاء</div>
                <div className="text-xs text-slate-500">دمج أي عميلين بنفس الكود أو الهاتف في سجل واحد محدث مع حفظ المديونية</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  const cleaned = deduplicateProductArray(products);
                  if (cleaned.length !== products.length) {
                    importProductsList(cleaned, 'replace');
                  }
                  showSuccess('تمت تنقية الكتالوج بنجاح دون أي تكرار!');
                }}
                className="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-right transition cursor-pointer"
              >
                <div className="font-black text-sm text-slate-900 mb-1">2. تنقية وتوحيد الأصناف</div>
                <div className="text-xs text-slate-500">توحيد الأكواد المكررة ودمج الشبابيك والألوان في كود أساسي واحد نظيف</div>
              </button>

              <button
                type="button"
                onClick={forcePurgeCacheAndReload}
                className="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-right transition cursor-pointer"
              >
                <div className="font-black text-sm text-slate-900 mb-1">3. تحديث الكاش ونشر الإصدار</div>
                <div className="text-xs text-slate-500">تحديث فوري لذاكرة الأجهزة الميدانية لمنع قراءة بيانات قديمة</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1 CONTENT: رابط الأصناف والرصيد                                     */}
      {/* ========================================================================= */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          {/* Live Google Sheets Box for Products */}
          <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-emerald-800/40 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-300 text-xs font-black px-3 py-1 rounded-full border border-emerald-500/30 mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>المزامنة السحابية المباشرة للأصناف والمخزون</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  رابط شيت الأصناف والأسعار والرصيد (Google Sheets)
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  ضع رابط شيت المنتجات هنا؛ النظام الذكي سيقرأ الأصناف والمخزون والأسعار ويربط الصور وشدات الكراتين تلقائياً دون تكرار أي صنف!
                </p>
              </div>

              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700 text-center min-w-[190px]">
                <div className="text-xs text-slate-400 font-bold">الأصناف المسجلة حالياً</div>
                <div className="text-3xl font-black text-amber-400 mt-0.5">{products.length}</div>
                <div className="text-[11px] text-emerald-400 mt-1 font-bold">نظام التحديث الذكي مفعل ✅</div>
              </div>
            </div>

            {/* URL Input & Direct Sync */}
            <div className="bg-slate-800/90 p-4 sm:p-5 rounded-2xl border border-slate-700 space-y-3">
              <label className="block text-xs font-bold text-slate-200">
                رابط Google Sheets المعتمد للأصناف:
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Link className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={productsSheetUrl}
                    onChange={(e) => setProductsSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl pr-10 pl-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-400 transition"
                  />
                </div>
                <button
                  onClick={handleSyncProductsSheet}
                  disabled={isSyncingProducts || !productsSheetUrl.trim()}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-black px-6 py-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition cursor-pointer shrink-0"
                >
                  {isSyncingProducts ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري القراءة والمزامنة...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>حفظ وتحديث فوري للأصناف 🔄</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>تأكد أن الشيت متاح للعامة (Anyone with the link can view).</span>
                {productsSheetUrl && (
                  <span className="text-emerald-400 font-bold">الرابط محفوظ في النظام للاستخدام اليومي</span>
                )}
              </div>
            </div>

            {/* Smart Upsert Banner */}
            <div className="bg-emerald-900/30 border border-emerald-600/30 rounded-2xl p-3.5 flex items-center gap-3 text-xs text-emerald-200">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>
                <strong>نظام التحديث الذكي (Smart Upsert):</strong> عند الضغط على تحديث، يقوم النظام بمطابقة كود كل صنف وتحديث كمياته وأسعاره، ولن يقوم أبداً بإضافة صفوف مكررة!
              </span>
            </div>
          </div>

          {/* Quick Actions & Alternative File Upload */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-base font-black text-slate-900">إجراءات المخزون ونماذج الإكسل</h4>
                <p className="text-xs text-slate-500">تصدير، تحميل نموذج، رفع ملف محلي، أو تصفير المخزون بالكامل</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={generateSampleExcelTemplate}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-2 rounded-xl text-xs border border-slate-300 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>تحميل نموذج إكسل معتمد</span>
                </button>

                <button
                  onClick={() => exportProductsToExcel(products, selectedBranchFilter)}
                  className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-2 rounded-xl text-xs shadow-sm transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>تصدير المخزون الحالي ({products.length})</span>
                </button>

                <button
                  onClick={() => setIsWipeModalOpen(true)}
                  className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3 py-2 rounded-xl text-xs border border-rose-300 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>تصفير ومسح الكل 🗑️</span>
                </button>
              </div>
            </div>

            {/* Alternative File Upload */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold text-slate-800">
                    هل تفضل رفع ملف إكسل من جهازك مباشرة بدلاً من الرابط؟
                  </div>
                  <div className="text-[11px] text-slate-500">
                    يقبل ملفات (.xlsx, .xls, .csv) ويطبق نفس التحديث الذكي دون تكرار.
                  </div>
                </div>
              </div>

              <label className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-sm transition shrink-0">
                {productsFileLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري القراءة...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>اختر ملف إكسل من جهازك</span>
                  </>
                )}
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleProductsFileUpload}
                  disabled={productsFileLoading}
                  className="hidden"
                />
              </label>
            </div>

            {/* Products Preview Table */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-slate-900">معاينة أصناف الكتالوج</h4>
                  <span className="text-xs text-slate-500 font-bold">({filteredProducts.length} صنف مطابق)</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={productsSearchTerm}
                      onChange={(e) => {
                        setProductsSearchTerm(e.target.value);
                        setProductsPage(1);
                      }}
                      placeholder="بحث بالاسم أو الكود..."
                      className="bg-slate-100 border border-slate-200 rounded-xl pr-8 pl-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 w-48"
                    />
                  </div>

                  <select
                    value={productsCategoryFilter}
                    onChange={(e) => {
                      setProductsCategoryFilter(e.target.value);
                      setProductsPage(1);
                    }}
                    className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">كل المجموعات</option>
                    {productCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200">
                    <tr>
                      <th className="p-3">كود الصنف</th>
                      <th className="p-3">اسم الصنف</th>
                      <th className="p-3">المجموعة</th>
                      <th className="p-3 text-center">الشدة</th>
                      <th className="p-3 text-center">رصيد الفرع</th>
                      <th className="p-3 text-center">مخزن 6 أكتوبر</th>
                      <th className="p-3 text-left">سعر الكرتونة</th>
                      <th className="p-3 text-left">سعر القطعة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedProducts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          لا توجد أصناف تطابق شروط البحث الحالية
                        </td>
                      </tr>
                    ) : (
                      pagedProducts.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 font-mono font-bold text-slate-800">{p.code}</td>
                          <td className="p-3 font-bold text-slate-900 max-w-xs truncate">{p.name}</td>
                          <td className="p-3 text-slate-600">{p.category || p.department || 'عام'}</td>
                          <td className="p-3 text-center font-bold text-slate-700">{p.cartonQuantity || 1}</td>
                          <td className="p-3 text-center font-black text-emerald-700">{p.branchStockActual || 0}</td>
                          <td className="p-3 text-center font-bold text-blue-700">{p.mainWarehouseActual || 0}</td>
                          <td className="p-3 text-left font-black text-slate-900">{formatCurrency(p.cartonPrice || 0)}</td>
                          <td className="p-3 text-left font-bold text-slate-600">{formatCurrency(p.piecePrice || 0)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {filteredProducts.length > productsPageSize && (
                <div className="flex items-center justify-between text-xs text-slate-600 pt-2">
                  <span>
                    عرض {((productsPage - 1) * productsPageSize) + 1} إلى {Math.min(productsPage * productsPageSize, filteredProducts.length)} من أصل {filteredProducts.length} صنف
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={productsPage === 1}
                      onClick={() => setProductsPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold disabled:opacity-40 cursor-pointer"
                    >
                      السابق
                    </button>
                    <span className="px-2 font-bold">{productsPage}</span>
                    <button
                      disabled={productsPage * productsPageSize >= filteredProducts.length}
                      onClick={() => setProductsPage((p) => p + 1)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold disabled:opacity-40 cursor-pointer"
                    >
                      التالي
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2 CONTENT: رابط قاعدة العملاء                                       */}
      {/* ========================================================================= */}
      {activeTab === 'customers' && (
        <div className="space-y-6">
          {/* Live Google Sheets Box for Customers */}
          <div className="bg-gradient-to-br from-amber-950 via-slate-900 to-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-amber-800/40 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-300 text-xs font-black px-3 py-1 rounded-full border border-amber-500/30 mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>المزامنة السحابية لقاعدة العملاء والمديونيات والتارجت</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  رابط شيت العملاء والمديونيات (Google Sheets)
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  ضع رابط شيت العملاء هنا؛ النظام سيقرأ بيانات العملاء، الأرصدة والمديونيات، الحدود الائتمانية، وأرقام مبيعات وتحصيلات 2026 التراكمية، ويحدثها بنظام التحديث الذكي دون أي تكرار!
                </p>
              </div>

              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700 text-center min-w-[190px]">
                <div className="text-xs text-slate-400 font-bold">العملاء المسجلين حالياً</div>
                <div className="text-3xl font-black text-amber-400 mt-0.5">{customers.length}</div>
                <div className="text-[11px] text-emerald-400 mt-1 font-bold">نظام دمج المكررات مفعل ✅</div>
              </div>
            </div>

            {/* URL Input & Direct Sync */}
            <div className="bg-slate-800/90 p-4 sm:p-5 rounded-2xl border border-slate-700 space-y-3">
              <label className="block text-xs font-bold text-slate-200">
                رابط Google Sheets المعتمد لقاعدة العملاء:
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Link className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={customerSheetUrl}
                    onChange={(e) => setCustomerSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl pr-10 pl-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400 transition"
                  />
                </div>
                <button
                  onClick={handleSyncCustomersSheet}
                  disabled={isSyncingCustomers || !customerSheetUrl.trim()}
                  className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-black px-6 py-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition cursor-pointer shrink-0"
                >
                  {isSyncingCustomers ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري القراءة والمزامنة...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>حفظ وتحديث فوري لقاعدة العملاء 🔄</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>يدعم أعمدة المديونيات القديمة، ومبيعات وتحصيلات كل شهر لعام 2026 تلقائياً.</span>
                {customerSheetUrl && (
                  <span className="text-amber-400 font-bold">الرابط محفوظ في النظام للاستخدام اليومي</span>
                )}
              </div>
            </div>

            {/* Smart Upsert Callout */}
            <div className="bg-amber-900/30 border border-amber-600/30 rounded-2xl p-3.5 flex items-center gap-3 text-xs text-amber-200">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-amber-400" />
              <span>
                <strong>نظام التحديث الذكي (Smart Upsert):</strong> عند استيراد الشيت يومياً، يتم تحديث رصيد ومديونية العميل الحالي تلقائياً دون إضافة صف مكرر. إذا كان العميل جديداً، يضاف لأول مرة فوراً.
              </span>
            </div>
          </div>

          {/* Customer Management Actions */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-base font-black text-slate-900">أدوات تنظيف ومطابقة العملاء والمناديب</h4>
                <p className="text-xs text-slate-500">تنظيف المكررات، ربط المناديب، تصدير ونماذج إكسل</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Dedicated Clean & Deduplicate Button */}
                <button
                  onClick={handleCleanDuplicates}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs shadow-sm transition cursor-pointer"
                  title="دمج العملاء المكررين وتوحيد الأرصدة"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تنظيف ودمج المكررات الذكي 🧹</span>
                </button>

                <button
                  onClick={handleAutoCreateReps}
                  className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-2 rounded-xl text-xs border border-blue-200 transition cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>توليد حسابات المناديب 👤</span>
                </button>

                <button
                  onClick={handleRefreshRepLinks}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-xl text-xs border border-slate-200 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                  <span>تحديث ربط المناديب 🔗</span>
                </button>

                <button
                  onClick={() => exportCustomersToExcel(customers, customerSelectedBranchFilter)}
                  className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-2 rounded-xl text-xs shadow-sm transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>تصدير العملاء ({customers.length})</span>
                </button>
              </div>
            </div>

            {/* Alternative File Upload for Customers */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold text-slate-800">
                    رفع ملف إكسل للعملاء من جهازك
                  </div>
                  <div className="text-[11px] text-slate-500">
                    يقبل ملفات (.xlsx, .xls) ويطبق نفس منطق التحديث الذكي والدمج المالي.
                  </div>
                </div>
              </div>

              <label className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-sm transition shrink-0">
                {customersFileLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري القراءة...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>اختر ملف إكسل للعملاء</span>
                  </>
                )}
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleCustomersFileUpload}
                  disabled={customersFileLoading}
                  className="hidden"
                />
              </label>
            </div>

            {/* Customers Preview Table */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-slate-900">سجل العملاء والمديونيات</h4>
                  <span className="text-xs text-slate-500 font-bold">({filteredCustomers.length} عميل مطابق)</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Table View Mode Tabs */}
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      onClick={() => setCustomerTableTab('balances')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        customerTableTab === 'balances'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      الأرصدة والمديونية والضمانات
                    </button>
                    <button
                      onClick={() => setCustomerTableTab('sales_2026')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        customerTableTab === 'sales_2026'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      مبيعات وتحصيلات 2026
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={customerSearchTerm}
                      onChange={(e) => {
                        setCustomerSearchTerm(e.target.value);
                        setCustomerPage(1);
                      }}
                      placeholder="بحث بالاسم أو الكود أو الهاتف..."
                      className="bg-slate-100 border border-slate-200 rounded-xl pr-8 pl-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500 w-48"
                    />
                  </div>

                  <select
                    value={customerSelectedBranchFilter}
                    onChange={(e) => {
                      setCustomerSelectedBranchFilter(e.target.value);
                      setCustomerPage(1);
                    }}
                    className="bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">كل الفروع</option>
                    {customerBranches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>

                  <select
                    value={customerSelectedRepFilter}
                    onChange={(e) => {
                      setCustomerSelectedRepFilter(e.target.value);
                      setCustomerPage(1);
                    }}
                    className="bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-amber-500 max-w-[150px]"
                  >
                    <option value="all">كل المناديب</option>
                    {customerReps.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200">
                    <tr>
                      <th className="p-3">كود العميل</th>
                      <th className="p-3">اسم العميل / المحل</th>
                      <th className="p-3">الفرع</th>
                      <th className="p-3">المندوب المسئول</th>
                      {customerTableTab === 'balances' ? (
                        <>
                          <th className="p-3 text-left">المديونية الحالية</th>
                          <th className="p-3 text-left">الحد الائتماني</th>
                          <th className="p-3">ورق الضمان</th>
                          <th className="p-3">الهاتف</th>
                        </>
                      ) : (
                        <>
                          <th className="p-3 text-left">إجمالي مبيعات 2026</th>
                          <th className="p-3 text-left">إجمالي تحصيلات 2026</th>
                          <th className="p-3 text-center">حالة النشاط</th>
                          <th className="p-3">تاريخ آخر زيارة</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          لا يوجد عملاء يطابقون شروط البحث الحالية
                        </td>
                      </tr>
                    ) : (
                      pagedCustomers.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 font-mono font-bold text-slate-800">{c.code}</td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900 max-w-xs truncate">{c.name}</div>
                            {c.storeName && c.storeName !== c.name && (
                              <div className="text-[10px] text-slate-500 truncate">{c.storeName}</div>
                            )}
                          </td>
                          <td className="p-3 text-slate-600 font-medium">{c.branchName || 'عام'}</td>
                          <td className="p-3 font-bold text-slate-700">{c.salesRepName || c.repName || 'غير محدد'}</td>

                          {customerTableTab === 'balances' ? (
                            <>
                              <td className="p-3 text-left font-black text-rose-700">
                                {formatCurrency(c.currentBalance ?? c.balance ?? 0)}
                              </td>
                              <td className="p-3 text-left font-bold text-slate-700">
                                {formatCurrency(c.creditLimit || 0)}
                              </td>
                              <td className="p-3">
                                {c.hasGuarantee || (c.guaranteeAmount && c.guaranteeAmount > 0) ? (
                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    يوجد ضمان ({formatCurrency(c.guaranteeAmount || 0)})
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">بدون ضمان</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-slate-600">{c.phone || '---'}</td>
                            </>
                          ) : (
                            <>
                              <td className="p-3 text-left font-black text-emerald-700">
                                {formatCurrency(c.sales2026 || c.totalMonthlySales || c.totalOverallSales || 0)}
                              </td>
                              <td className="p-3 text-left font-black text-blue-700">
                                {formatCurrency(resolveCollectionsMagnitude(c))}
                              </td>
                              <td className="p-3 text-center">
                                {c.hasDealtIn2026 || (c.sales2026 && c.sales2026 > 0) ? (
                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    تعامل في 2026 🟢
                                  </span>
                                ) : (
                                  <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                                    لم يتعامل بعد
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-slate-600">{c.lastVisitDate || '---'}</td>
                            </>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {filteredCustomers.length > customerPageSize && (
                <div className="flex items-center justify-between text-xs text-slate-600 pt-2">
                  <span>
                    عرض {((customerPage - 1) * customerPageSize) + 1} إلى {Math.min(customerPage * customerPageSize, filteredCustomers.length)} من أصل {filteredCustomers.length} عميل
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={customerPage === 1}
                      onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold disabled:opacity-40 cursor-pointer"
                    >
                      السابق
                    </button>
                    <span className="px-2 font-bold">{customerPage}</span>
                    <button
                      disabled={customerPage * customerPageSize >= filteredCustomers.length}
                      onClick={() => setCustomerPage((p) => p + 1)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold disabled:opacity-40 cursor-pointer"
                    >
                      التالي
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3 CONTENT: رابط التارجت والمحققات                                    */}
      {/* ========================================================================= */}
      {activeTab === 'targets' && (
        <div className="space-y-6">
          {/* Live Google Sheets Box for Targets */}
          <div className="bg-gradient-to-br from-blue-950 via-slate-900 to-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-blue-800/40 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-300 text-xs font-black px-3 py-1 rounded-full border border-blue-500/30 mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>المزامنة السحابية لأهداف ومبيعات وتحصيلات المناديب</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  رابط شيت التارجت والمحققات (Google Sheets)
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  ضع رابط شيت الأهداف والمحققات هنا؛ المنظومة الذكية ستقرأ مستهدف البيع، المحقق الفعلي للبيع، مستهدف التحصيل، والمحقق الفعلي للتحصيل لكل مندوب وفرع شهرياً دون تكرار!
                </p>
              </div>

              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700 text-center min-w-[190px]">
                <div className="text-xs text-slate-400 font-bold">سجلات التارجت الحالية</div>
                <div className="text-3xl font-black text-blue-400 mt-0.5">{targets.length}</div>
                <div className="text-[11px] text-emerald-400 mt-1 font-bold">تحديث دوري ذكي ✅</div>
              </div>
            </div>

            {/* URL Input & Direct Sync */}
            <div className="bg-slate-800/90 p-4 sm:p-5 rounded-2xl border border-slate-700 space-y-3">
              <label className="block text-xs font-bold text-slate-200">
                رابط Google Sheets المعتمد للتارجت والمحققات:
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Link className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={targetsSheetUrl}
                    onChange={(e) => setTargetsSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl pr-10 pl-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-400 transition"
                  />
                </div>
                <button
                  onClick={handleSyncTargetsSheet}
                  disabled={isSyncingTargets || !targetsSheetUrl.trim()}
                  className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-black px-6 py-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition cursor-pointer shrink-0"
                >
                  {isSyncingTargets ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري القراءة والمزامنة...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>حفظ وتحديث فوري للتارجت 🔄</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>تتعرف المنظومة بذكاء على أعمدة المبيعات والتحصيلات ونسب الإنجاز.</span>
                {targetsSheetUrl && (
                  <span className="text-blue-400 font-bold">الرابط محفوظ في النظام للاستخدام اليومي</span>
                )}
              </div>
            </div>

            {/* Smart Upsert Callout */}
            <div className="bg-blue-900/30 border border-blue-600/30 rounded-2xl p-3.5 flex items-center gap-3 text-xs text-blue-200">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-blue-400" />
              <span>
                <strong>نظام التحديث الذكي (Smart Upsert):</strong> يتم تحديث ومطابقة سجل تارجت كل مندوب وفرع شهرياً بناءً على التاريخ، دون تراكم أو تكرار للصفوف عند التحديث اليومي.
              </span>
            </div>
          </div>

          {/* Target KPIs Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>مستهدف البيع</span>
                <Target className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-lg font-black text-slate-900">{formatEGP(targetsSummary.totalSalesTarget)}</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>المحقق بيع فعلي</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-lg font-black text-emerald-700">{formatEGP(targetsSummary.totalSalesAchieved)}</div>
              <div className="text-[11px] font-bold text-emerald-600">نسبة الإنجاز: {targetsSummary.salesPct}%</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>مستهدف التحصيل</span>
                <Wallet className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-lg font-black text-slate-900">{formatEGP(targetsSummary.totalCollectionTarget)}</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>المحقق تحصيل فعلي</span>
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-lg font-black text-blue-700">{formatEGP(targetsSummary.totalCollectionAchieved)}</div>
              <div className="text-[11px] font-bold text-blue-600">نسبة التحصيل: {targetsSummary.collPct}%</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>عدد المناديب</span>
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-lg font-black text-purple-700">{targetsSummary.repsCount} مندوب</div>
              <div className="text-[11px] font-bold text-slate-500">{filteredTargets.length} سجل إجمالي</div>
            </div>
          </div>

          {/* Targets Actions & Table */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-base font-black text-slate-900">إجراءات ملفات التارجت والمحققات</h4>
                <p className="text-xs text-slate-500">تحميل نموذج التارجت المعتمد أو تصدير تقرير الإنجاز</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={downloadTargetTemplateExcel}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-2 rounded-xl text-xs border border-slate-300 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>تحميل نموذج إكسل معتمد</span>
                </button>

                <button
                  onClick={exportTargetsReport}
                  className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold px-3 py-2 rounded-xl text-xs shadow-sm transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>تصدير تقرير التارجت ({targets.length})</span>
                </button>

                <button
                  onClick={resetTargetsToDefault}
                  className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3 py-2 rounded-xl text-xs border border-rose-200 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>تصفير التارجت</span>
                </button>
              </div>
            </div>

            {/* Alternative File Upload for Targets */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold text-slate-800">
                    رفع ملف إكسل للتارجت من جهازك
                  </div>
                  <div className="text-[11px] text-slate-500">
                    يقبل ملفات (.xlsx, .xls) ويوزع أهداف كل مندوب وفرع شهرياً دون تكرار.
                  </div>
                </div>
              </div>

              <label className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-sm transition shrink-0">
                {targetsFileLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري القراءة...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>اختر ملف إكسل للتارجت</span>
                  </>
                )}
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleTargetsFileUpload}
                  disabled={targetsFileLoading}
                  className="hidden"
                />
              </label>
            </div>

            {/* Targets Preview Table */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-slate-900">سجل أهداف ومحققات المناديب</h4>
                  <span className="text-xs text-slate-500 font-bold">({filteredTargets.length} سجل مطابق)</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={targetsSearchTerm}
                      onChange={(e) => setTargetsSearchTerm(e.target.value)}
                      placeholder="بحث باسم المندوب أو الفرع..."
                      className="bg-slate-100 border border-slate-200 rounded-xl pr-8 pl-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 w-48"
                    />
                  </div>

                  <select
                    value={targetsBranchFilter}
                    onChange={(e) => setTargetsBranchFilter(e.target.value)}
                    className="bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">كل الفروع</option>
                    {targetsBranches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>

                  <select
                    value={targetsMonthFilter === 'ALL' ? 'ALL' : String(targetsMonthFilter)}
                    onChange={(e) => setTargetsMonthFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                    className="bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:border-blue-500"
                  >
                    <option value="ALL">كل الشهور</option>
                    {ARABIC_MONTHS.map((name, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        شهر {idx + 1} ({name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200">
                    <tr>
                      <th className="p-3">الفرع</th>
                      <th className="p-3">اسم المندوب</th>
                      <th className="p-3 text-left">هدف البيع</th>
                      <th className="p-3 text-left">المحقق بيع</th>
                      <th className="p-3 text-center">نسبة البيع</th>
                      <th className="p-3 text-left">هدف التحصيل</th>
                      <th className="p-3 text-left">المحقق تحصيل</th>
                      <th className="p-3 text-center">نسبة التحصيل</th>
                      <th className="p-3 text-center">الفترة / التاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTargets.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400">
                          لا توجد سجلات تارجت مسجلة حالياً
                        </td>
                      </tr>
                    ) : (
                      filteredTargets.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 font-bold text-slate-800">{r.branch}</td>
                          <td className="p-3 font-black text-slate-900">{r.repName}</td>
                          <td className="p-3 text-left font-bold text-slate-700">{formatEGP(r.salesTarget)}</td>
                          <td className="p-3 text-left font-black text-emerald-700">{formatEGP(r.salesAchieved)}</td>
                          <td className="p-3 text-center">
                            <span
                              className={`font-black text-[11px] px-2 py-0.5 rounded-full ${
                                r.salesPercentage >= 100
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : r.salesPercentage >= 80
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {r.salesPercentage}%
                            </span>
                          </td>
                          <td className="p-3 text-left font-bold text-slate-700">{formatEGP(r.collectionTarget)}</td>
                          <td className="p-3 text-left font-black text-blue-700">{formatEGP(r.collectionAchieved)}</td>
                          <td className="p-3 text-center">
                            <span
                              className={`font-black text-[11px] px-2 py-0.5 rounded-full ${
                                r.collectionPercentage >= 100
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : r.collectionPercentage >= 80
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {r.collectionPercentage}%
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono text-slate-600">
                            {r.month ? `${ARABIC_MONTHS[r.month - 1] || r.month} ${r.year || 2026}` : r.date}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wipe Confirmation Modal */}
      {isWipeModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 border border-rose-100">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-7 h-7" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-slate-900">تأكيد مسح وتصفير المخزون</h3>
              <p className="text-xs text-slate-500">
                سيتم مسح كافة الأصناف والمخزون الحالي لإتاحة رفع شيت نظيف وجديد بالكامل.
              </p>
            </div>

            <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={wipeInvoicesToo}
                onChange={(e) => setWipeInvoicesToo(e.target.checked)}
                className="rounded text-rose-600"
              />
              <span>مسح الفواتير وسجلات المبيعات المرتبطة أيضاً</span>
            </label>

            <div className="flex items-center gap-2 pt-2">
              <button
                disabled={isWiping}
                onClick={() => setIsWipeModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 transition text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                disabled={isWiping}
                onClick={handleWipeProductsConfirm}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 font-black text-white shadow-md transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isWiping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>نعم، تصفير ومسح الكل</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Global Data Version Modal */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-5 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-black">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">إصدار تحديث جديد لقاعدة البيانات</h3>
                  <p className="text-xs text-slate-500">نشر إصدار جديد وتوجيه جميع الأجهزة لمسح الكاش وتحديث الأرقام</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPublishModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Scope Selector */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">نطاق التحديث المُراد نشره:</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPublishScope('all')}
                    className={`p-2.5 rounded-xl font-bold border transition text-right flex items-center justify-between cursor-pointer ${
                      publishScope === 'all' ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span>كافة البيانات (شامل)</span>
                    {publishScope === 'all' && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublishScope('products')}
                    className={`p-2.5 rounded-xl font-bold border transition text-right flex items-center justify-between cursor-pointer ${
                      publishScope === 'products' ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span>الأصناف والأسعار فقط</span>
                    {publishScope === 'products' && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublishScope('customers')}
                    className={`p-2.5 rounded-xl font-bold border transition text-right flex items-center justify-between cursor-pointer ${
                      publishScope === 'customers' ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span>قاعدة العملاء والأرصدة</span>
                    {publishScope === 'customers' && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublishScope('targets')}
                    className={`p-2.5 rounded-xl font-bold border transition text-right flex items-center justify-between cursor-pointer ${
                      publishScope === 'targets' ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span>التارجت والمحققات البيعية</span>
                    {publishScope === 'targets' && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                </div>
              </div>

              {/* Notes Input */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">ملاحظات التحديث (تظهر للمستخدمين والمناديب):</label>
                <input
                  type="text"
                  value={publishNotes}
                  onChange={(e) => setPublishNotes(e.target.value)}
                  placeholder="مثال: تحديث أسعار وشدات الكراتين، إضافة عملاء فرع القاهرة..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Force Purge Checkbox */}
              <label className="flex items-center gap-2 p-3 bg-amber-50/70 rounded-xl border border-amber-200 cursor-pointer text-xs font-bold text-amber-950">
                <input
                  type="checkbox"
                  checked={publishForcePurge}
                  onChange={(e) => setPublishForcePurge(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <span>إجبار كافة أجهزة المناديب على تفريغ الذاكرة المؤقتة القديمة فوراً لمنع التدبيل</span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isPublishingVersion}
                onClick={() => setIsPublishModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 transition text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isPublishingVersion}
                onClick={handlePublishNewVersion}
                className="flex-1 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 active:scale-95 font-black text-slate-950 shadow-md transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isPublishingVersion ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>تأكيد النشر ومسح الكاش 🚀</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
