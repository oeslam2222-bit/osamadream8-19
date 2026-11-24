import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CloudDownload,
  CloudLightning,
  Copy,
  Download,
  ExternalLink,
  FileCheck,
  FileSpreadsheet,
  FolderOpen,
  Globe,
  HelpCircle,
  Layers,
  Link2,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Target,
  Trash2,
  Upload,
  Users,
  Home,
  X
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  cleanCustomerCode,
  cleanCustomerPhone,
  deduplicateAndMergeCustomers,
  mergeTwoCustomers
} from '../services/customerDeduplicationService';
import { normalizeArabicText } from '../services/arabicMatchingService';
import {
  fetchDataSourcesFromSupabase,
  saveDataSourcesToSupabase,
} from '../services/supabaseService';
import {
  buildItemSalesAggregates,
  publishItemSalesSummaries,
  saveItemSalesAggregates,
} from '../services/itemSalesAggregateService';
import {
  downloadCustomerAnalyticsTemplate,
  exportCustomerAnalyticsToExcel
} from '../services/customerAnalyticsService';
import {
  getPublishedDataSources,
  getDataReadMode,
  isValidPublishedSource,
  PublishedDataSources,
  saveSingleSourceUrl,
  savePublishedDataSources,
  setDataReadMode,
  type DataReadMode
} from '../services/dataSourceService';
import {
  exportCustomersToExcel,
  exportCustomerTargetSheetToExcel,
  exportProductsToExcel,
  fetchAndParseGoogleSheet,
  fetchCustomersFromGoogleSheetUrl,
  generateSampleCustomersTemplate,
  generateSampleCustomerTargetTemplate,
  generateSampleExcelTemplate,
  parseExcelCustomers,
  parseExcelProducts,
  parseTargetExcel
} from '../services/excelService';
import { formatCurrency } from '../services/invoiceService';
import { Customer, Product } from '../types';
import {
  enrichCustomerItemSalesWithDirectory,
  fetchCustomerItemSalesFromGoogleSheet,
  fetchCustomerItemSalesFromSupabase,
  parseExcelCustomerItemSales,
  pushCustomerItemSalesToSupabase,
  saveCustomerItemSales
} from '../services/customerItemSalesService';

type SheetKey = keyof PublishedDataSources;

/** أسماء الشيتات بالعربي — لعرضها في شريط تقدم المزامنة */
const SHEET_LABELS: Partial<Record<SheetKey, string>> = {
  customers: 'العملاء',
  customerSales: 'مبيعات العملاء',
  products: 'الأصناف',
  targets: 'الأهداف',
  offers: 'العروض',
  customers_electrical: 'العملاء',
  customerSales_electrical: 'مبيعات العملاء',
  products_electrical: 'الأصناف',
  targets_electrical: 'الأهداف',
  offers_electrical: 'العروض',
};

/** نتيجة كل عملية مزامنة — لازم ترجع للمستدعي عشان "مزامنة الكل" تعرف مين نجح ومين فشل */
type SyncResult = { ok: boolean; message: string };

export interface ExcelImportExportProps {
  onNavigateToItemSales?: () => void;
}

/**
 * مبلغ مع معالجة اتجاه صحيح: الرقم والأرقام السالبة تفضل LTR (السالبة تظهر قبل الرقم)
 * و«ج.م» تتكتب RTL في مكانها بدل ما تظهر مقلوبة أو السالب في الآخر.
 */
const MoneyLtr: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const parts = formatCurrency(value).split(' ');
  const number = parts[0];
  const unit = parts.slice(1).join(' ');
  return (
    <span className={`inline-flex items-baseline justify-center gap-1 ${className || ''}`}>
      <span dir="ltr" style={{ unicodeBidi: 'isolate' }} className="tabular-nums">
        {number}
      </span>
      <span>{unit}</span>
    </span>
  );
};

export const ExcelImportExport: React.FC<ExcelImportExportProps> = ({ onNavigateToItemSales }) => {
  const {
    products,
    customers,
    users,
    targets,
    currentUser,
    branches,
    importProductsList,
    importCustomersList,
    cleanAndDeduplicateCustomers,
    importTargetsFromExcel,
    importTargetsFromGoogleSheet,
    exportTargetsReport,
    wipeAllProductsAndData,
    selectedBranchFilter,
    syncCustomersIncrementally,
    syncTargetsIncrementally,
    syncProductsIncrementally,
    syncCustomerItemSalesIncrementally,
  } = useApp();

  // دليل العملاء المحدَّث دائماً: "مزامنة الكل" بتنفذ أكثر من استيراد في نفس الدورة،
  // والقيمة القديمة من الـ closure بتخلي ربط مبيعات الأصناف بالعملاء الجدد يفشل.
  const customersRef = useRef(customers);
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);


  // Active sector tab (قطاع الأدوات المنزلية / قطاع الكهرباء)
  const [activeSectorTab, setActiveSectorTab] = useState<'home' | 'electrical'>('home');
  const [dataReadMode, setDataReadModeState] = useState<DataReadMode>(() => getDataReadMode());
  const handleDataReadModeChange = (mode: DataReadMode) => {
    setDataReadMode(mode);
    setDataReadModeState(mode);
  };

  // Saved sources from localStorage/service
  const [sources, setSources] = useState<PublishedDataSources>(() => getPublishedDataSources());
  const [sourceUrls, setSourceUrls] = useState<Record<SheetKey, string>>(() => {
    const s = getPublishedDataSources();
    return {
      customers: s.customers?.url || '',
      customerSales: s.customerSales?.url || '',
      products: s.products?.url || '',
      targets: s.targets?.url || '',
      offers: s.offers?.url || '',
      customers_electrical: s.customers_electrical?.url || '',
      customerSales_electrical: s.customerSales_electrical?.url || '',
      products_electrical: s.products_electrical?.url || '',
      targets_electrical: s.targets_electrical?.url || '',
      offers_electrical: s.offers_electrical?.url || '',
    };
  });

  // حفظ تلقائي لروابط الشيتات: تتكتب محليًا فورًا (حتى لو ما ضغطتش مزامنة)،
  // وترفع نسخة للسحابة عشان تلاقيها من أي جهاز من غير ما تدور عليها كل مرة.
  useEffect(() => {
    const timer = setTimeout(() => {
      (Object.keys(sourceUrls) as SheetKey[]).forEach((key) => {
        const url = (sourceUrls[key] || '').trim();
        if (url) saveSingleSourceUrl(key, url);
      });
      saveDataSourcesToSupabase(getPublishedDataSources()).catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [sourceUrls]);

  // استرجاع الروابط المحفوظة على السيرفر عند فتح الصفحة (جهاز جديد أو كاش متمسوح).
  useEffect(() => {
    let active = true;
    fetchDataSourcesFromSupabase()
      .then((res) => {
        if (!active || !res.success || !res.sources) return;
        const local = getPublishedDataSources();
        const merged = { ...local };
        (Object.keys(local) as SheetKey[]).forEach((key) => {
          const remote = (res.sources as any)?.[key];
          if (!remote?.url) return;
          const localStamp = Date.parse(local[key]?.updatedAt || '') || 0;
          const remoteStamp = Date.parse(remote.updatedAt || '') || 0;
          if (!local[key]?.url || remoteStamp > localStamp) merged[key] = { ...local[key], ...remote };
        });
        savePublishedDataSources(merged);
        setSources(merged);
        const next = {} as Record<SheetKey, string>;
        (Object.keys(merged) as SheetKey[]).forEach((key) => {
          next[key] = merged[key]?.url || '';
        });
        setSourceUrls(next);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // UI state per sheet
  const [syncingKey, setSyncingKey] = useState<SheetKey | 'all' | null>(null);
  const [savedUrlNotice, setSavedUrlNotice] = useState<SheetKey | null>(null);
  const [sheetErrors, setSheetErrors] = useState<Record<SheetKey, string | null>>({
    customers: null,
    customerSales: null,
    products: null,
    targets: null,
    offers: null,
    customers_electrical: null,
    customerSales_electrical: null,
    products_electrical: null,
    targets_electrical: null,
    offers_electrical: null,
  });
  const [sheetSuccess, setSheetSuccess] = useState<Record<SheetKey, string | null>>({
    customers: null,
    customerSales: null,
    products: null,
    targets: null,
    offers: null,
    customers_electrical: null,
    customerSales_electrical: null,
    products_electrical: null,
    targets_electrical: null,
    offers_electrical: null,
  });

  const getSectorKey = (base: 'customers' | 'customerSales' | 'products' | 'targets' | 'offers'): SheetKey => {
    return activeSectorTab === 'electrical' ? (`${base}_electrical` as SheetKey) : base;
  };

  // Global Sync Progress & Dedup Audit State
  const [masterSyncProgress, setMasterSyncProgress] = useState<string | null>(null);
  // نسبة التقدم الحقيقية لمزامنة الكل — محسوبة من الخطوات المنجزة فعليًا
  const [masterSyncPercent, setMasterSyncPercent] = useState(0);
  /** تقدم رفع صفوف مبيعات الأصناف للسحابة — "تم رفع X من Y صف" */
  const [rowUploadProgress, setRowUploadProgress] = useState<{ synced: number; total: number } | null>(null);
  const [isPullingSalesFromSupabase, setIsPullingSalesFromSupabase] = useState(false);
  const [dedupNotice, setDedupNotice] = useState<{
    original: number;
    cleaned: number;
    removed: number;
    message: string;
  } | null>(null);

  // Hidden file inputs refs
  const fileInputCustomersRef = useRef<HTMLInputElement>(null);
  const fileInputSalesRef = useRef<HTMLInputElement>(null);
  const fileInputProductsRef = useRef<HTMLInputElement>(null);
  const fileInputTargetsRef = useRef<HTMLInputElement>(null);
  const fileInputOffersRef = useRef<HTMLInputElement>(null);

  // Advanced Utilities Accordion
  const [isDriveScannerOpen, setIsDriveScannerOpen] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Wipe / Reset Modal State
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeInvoicesToo, setWipeInvoicesToo] = useState(false);

  // Save single source URL permanently
  const handleSaveUrl = (key: SheetKey) => {
    const cleanUrl = (sourceUrls[key] || '').trim();
    saveSingleSourceUrl(key, cleanUrl);
    setSources(getPublishedDataSources());
    setSavedUrlNotice(key);
    setTimeout(() => setSavedUrlNotice(null), 2500);
  };

  // 1. Sync Customers Sheet (العملاء والمديونيات)
  const handleSyncCustomers = async (urlOverride?: string, batch = false): Promise<SyncResult> => {
    const key = getSectorKey('customers');
    const url = (urlOverride || sourceUrls[key] || '').trim();
    if (!url) {
      const message = `يرجى إدخال رابط Google Sheet الخاص بعملاء ${activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية'} أولاً`;
      setSheetErrors((prev) => ({ ...prev, [key]: message }));
      return { ok: false, message };
    }
    setSyncingKey(key);
    setSheetErrors((prev) => ({ ...prev, [key]: null }));
    setSheetSuccess((prev) => ({ ...prev, [key]: null }));
    if (!batch) {
      setMasterSyncPercent(10);
      setMasterSyncProgress('جاري جلب قاعدة العملاء من Google Sheets...');
    }

    try {
      saveSingleSourceUrl(key, url);
      setSources(getPublishedDataSources());
      const res = await fetchCustomersFromGoogleSheetUrl(url);
      if (res.errors.length > 0 && res.customers.length === 0) {
        throw new Error(res.errors.join(' • '));
      }
      if (!batch) {
        setMasterSyncPercent(55);
        setMasterSyncProgress(`تم جلب ${res.customers.length.toLocaleString('ar-EG')} صف، جاري الحفظ...`);
      }
      const sectorTagged = res.customers.map((c) => ({
        ...c,
        sector: (c.sector === 'electrical' || c.sector === 'home' || c.sector === 'both' || c.sector === 'all')
          ? c.sector
          : activeSectorTab,
      }));
      const importedHome = sectorTagged.filter((c) => !c.sector || c.sector === 'home' || c.sector === 'both' || c.sector === 'all').length;
      const importedElec = sectorTagged.filter((c) => c.sector === 'electrical' || c.sector === 'both' || c.sector === 'all').length;
      const hasMixed = sectorTagged.some((c) => c.sector === 'electrical') && sectorTagged.some((c) => !c.sector || c.sector === 'home');
      const sectorLabel = hasMixed
        ? 'القطاعين (منزلي + كهرباء)'
        : (activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية');
      const importResult = await importCustomersList(sectorTagged, 'merge');
      if (!importResult.success) {
        throw new Error(importResult.message);
      }
      if (!batch) {
        setMasterSyncPercent(100);
        setMasterSyncProgress('تم تحديث قاعدة العملاء بنجاح.');
        setTimeout(() => { setMasterSyncProgress(null); setMasterSyncPercent(0); }, 4000);
      }
      setSheetSuccess((prev) => ({
        ...prev,
        [key]: `تم بنجاح تحديث ${importResult.count} عميل فريد لـ (${sectorLabel})${hasMixed ? ` — منزلي: ${importedHome.toLocaleString('ar-EG')} / كهرباء: ${importedElec.toLocaleString('ar-EG')}` : ''}، وحذف أي مكررات سابقة. البيانات محدثة ومتاحة الآن للمناديب والمشرفين.`
      }));
      return { ok: true, message: `تم تحديث ${importResult.count} عميل فريد` };
    } catch (err: any) {
      const message = err?.message || 'فشلت مزامنة شيت العملاء';
      if (!batch) {
        setMasterSyncProgress(null);
        setMasterSyncPercent(0);
      }
      setSheetErrors((prev) => ({ ...prev, [key]: message }));
      return { ok: false, message };
    } finally {
      if (!batch) setSyncingKey(null);
    }
  };

  // 2. Sync Customer Item Sales Sheet (شيت مبيعات العملاء بالصنف)
  const handleSyncCustomerSales = async (urlOverride?: string, batch = false, onRowProgress?: (synced: number, total: number) => void): Promise<SyncResult> => {
    const key = getSectorKey('customerSales');
    const url = (urlOverride || sourceUrls[key] || '').trim();
    if (!url) {
      const message = `يرجى إدخال رابط Google Sheet الخاص بمبيعات ${activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية'} بالصنف أولاً`;
      setSheetErrors((prev) => ({ ...prev, [key]: message }));
      return { ok: false, message };
    }
    setSyncingKey(key);
    setSheetErrors((prev) => ({ ...prev, [key]: null }));
    setSheetSuccess((prev) => ({ ...prev, [key]: null }));

    try {
      saveSingleSourceUrl(key, url);
      setSources(getPublishedDataSources());

      // Attempt parsing Customer Item Sales first
      const itemSalesRes = await fetchCustomerItemSalesFromGoogleSheet(url);
      if (itemSalesRes.sales && itemSalesRes.sales.length > 0) {
        // Automatically link customer codes with master customer directory to resolve branch and sales rep
        const enrichedRes = enrichCustomerItemSalesWithDirectory(itemSalesRes.sales, customersRef.current);
        const finalSales = enrichedRes.enriched.map((s) => ({
          ...s,
          sector: activeSectorTab,
        }));
        await saveCustomerItemSales(finalSales, 'merge');

        // المزامنة السحابية بقت منتظرة: الأجهزة التانية بتنزّل بعد نشر نسخة
        // البيانات، فلو سبناها fire-and-forget كانت هتنزل قبل ما الصفوف توصل.
        const pushRes = await pushCustomerItemSalesToSupabase(finalSales, (synced, total) => {
          setRowUploadProgress({ synced, total });
          onRowProgress?.(synced, total);
        }).catch((err) => ({
          syncedCount: 0,
          error: err?.message || 'فشل رفع مبيعات الأصناف للسحابة',
        }));

        // الملخص الشهري بيتجمع هنا مرة واحدة — كل الأجهزة بتقرأه بدل الجدول.
        // + تفصيل الفروع والمناديب بالصنف (لفلاتر صفحة مبيعات الأصناف)
        void publishItemSalesSummaries(finalSales, {
          maxCustomers: 0,
          resolveSector: (record) =>
            (record as any).sector === 'electrical' || activeSectorTab === 'electrical' ? 'electrical' : 'home',
        }).catch(() => {});

        // Extract and deduplicate customer profiles from sales records
        const codeMap = new Map<string, Customer>();
        const phoneMap = new Map<string, Customer>();
        const nameMap = new Map<string, Customer>();

        customersRef.current.forEach((c) => {
          const cd = cleanCustomerCode(c.code);
          if (cd) codeMap.set(cd, c);
          const ph = cleanCustomerPhone(c.phone);
          if (ph) phoneMap.set(ph, c);
          if (c.name) nameMap.set(normalizeArabicText(c.name).replace(/\s+/g, ''), c);
        });

        // Group total sales by customer
        const custTotals = new Map<string, { totalAmount: number; repName: string; warehouse: string }>();
        finalSales.forEach((s) => {
          const k = (s.customerAccount || s.invoicingName).trim().toLowerCase();
          const prev = custTotals.get(k) || { totalAmount: 0, repName: s.repName, warehouse: s.warehouse };
          prev.totalAmount += s.amount;
          if (s.repName && s.repName !== 'غير محدد') prev.repName = s.repName;
          if (s.warehouse) prev.warehouse = s.warehouse;
          custTotals.set(k, prev);
        });

        const updatedCustomers = [...customersRef.current];
        let updatedCount = 0;
        let newCount = 0;

        finalSales.forEach((s) => {
          const cd = cleanCustomerCode(s.customerAccount);
          const normN = s.invoicingName ? normalizeArabicText(s.invoicingName).replace(/\s+/g, '') : '';
          const existing = (cd && codeMap.get(cd)) || (normN && nameMap.get(normN));
          const summary = custTotals.get((s.customerAccount || s.invoicingName).trim().toLowerCase());

          if (existing) {
            const idx = updatedCustomers.findIndex((c) => c.id === existing.id);
            if (idx >= 0) {
              updatedCustomers[idx] = {
                ...updatedCustomers[idx],
                sales2026: Math.max(updatedCustomers[idx].sales2026 || 0, summary?.totalAmount || 0),
                salesRepName: updatedCustomers[idx].salesRepName || summary?.repName || s.repName,
                branchName: updatedCustomers[idx].branchName || summary?.warehouse || s.warehouse,
                sector: updatedCustomers[idx].sector || activeSectorTab,
              };
              updatedCount++;
            }
          } else if (normN && !nameMap.has(normN)) {
            const newCust: Customer = {
              id: `cust-sync-${s.customerAccount}-${Date.now().toString(36)}`,
              code: s.customerAccount,
              name: s.invoicingName || s.customerAccount,
              salesRepName: s.repName,
              branchName: s.warehouse,
              sales2026: summary?.totalAmount || s.amount,
              currentBalance: 0,
              creditLimit: 0,
              tier: 'عادي',
              isKeyAccount: false,
              phone: '',
              address: s.warehouse || '',
              sector: activeSectorTab,
            };
            updatedCustomers.push(newCust);
            nameMap.set(normN, newCust);
            if (cd) codeMap.set(cd, newCust);
            newCount++;
          }
        });

        const finalDeduped = deduplicateAndMergeCustomers(updatedCustomers).customers;
        await importCustomersList(finalDeduped, 'merge');

        setSheetSuccess((prev) => ({
          ...prev,
          [key]: `تم بنجاح مزامنة ${finalSales.length.toLocaleString('ar-EG')} حركة مبيعات صنف لـ (${activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية'})، وتم ربط كود العميل بقاعدة العملاء لـ (${enrichedRes.distinctCustomersMatched} عميل) لاستخراج فروعهم ومناديبهم تلقائياً بدون تكرار! البيانات متاحة الآن في قسم "مبيعات الأصناف".` +
            (pushRes && (pushRes as any).error ? ` — تنبيه: المزامنة السحابية (${(pushRes as any).error})` : '')
        }));
        return { ok: true, message: `تم مزامنة ${finalSales.length} حركة مبيعات صنف` };
      }

      // Fallback: regular customer target sheet parser
      const res = await fetchCustomersFromGoogleSheetUrl(url);
      if (res.errors.length > 0 && res.customers.length === 0) {
        throw new Error(res.errors.join(' • '));
      }

      const codeMap = new Map<string, Customer>();
      const phoneMap = new Map<string, Customer>();
      const nameMap = new Map<string, Customer>();

      customersRef.current.forEach((c) => {
        const cd = cleanCustomerCode(c.code);
        if (cd) codeMap.set(cd, c);
        const ph = cleanCustomerPhone(c.phone);
        if (ph) phoneMap.set(ph, c);
        if (c.name) nameMap.set(normalizeArabicText(c.name).replace(/\s+/g, ''), c);
      });

      const updatedCustomers = [...customersRef.current];
      let updatedCount = 0;
      let newCount = 0;

      res.customers.forEach((incoming) => {
        const cd = cleanCustomerCode(incoming.code);
        const ph = cleanCustomerPhone(incoming.phone);
        const normN = incoming.name ? normalizeArabicText(incoming.name).replace(/\s+/g, '') : '';

        const existing = (cd && codeMap.get(cd)) ||
                         (ph && phoneMap.get(ph)) ||
                         (normN && nameMap.get(normN));

        const incomingWithSector: Customer = {
          ...incoming,
          sector: incoming.sector || activeSectorTab,
        };

        if (existing) {
          const idx = updatedCustomers.findIndex((c) => c.id === existing.id);
          if (idx >= 0) {
            updatedCustomers[idx] = mergeTwoCustomers(updatedCustomers[idx], incomingWithSector);
            updatedCount++;
          }
        } else {
          updatedCustomers.push(incomingWithSector);
          newCount++;
        }
      });

      const finalDeduped = deduplicateAndMergeCustomers(updatedCustomers).customers;
      await importCustomersList(finalDeduped, 'merge');

      setSheetSuccess((prev) => ({
        ...prev,
        [key]: `تم بنجاح تحديث أرقام مبيعات وتارجت ${updatedCount} عميل قائم وإدراج ${newCount} عميل جديد لـ (${activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية'}) بدون تكرار!`
      }));
      return { ok: true, message: `تم تحديث ${updatedCount} عميل وإدراج ${newCount} عميل جديد` };
    } catch (err: any) {
      const message = err?.message || 'فشلت مزامنة شيت مبيعات العملاء';
      setSheetErrors((prev) => ({ ...prev, [key]: message }));
      return { ok: false, message };
    } finally {
      setRowUploadProgress(null);
      if (!batch) setSyncingKey(null);
    }
  };

  // 3. Sync Products Sheet (الأصناف والمخزون والأسعار)
  const handleSyncProducts = async (urlOverride?: string, batch = false): Promise<SyncResult> => {
    const key = getSectorKey('products');
    const url = (urlOverride || sourceUrls[key] || '').trim();
    if (!url) {
      const message = `يرجى إدخال رابط Google Sheet الخاص بأصناف ${activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية'} أولاً`;
      setSheetErrors((prev) => ({ ...prev, [key]: message }));
      return { ok: false, message };
    }
    setSyncingKey(key);
    setSheetErrors((prev) => ({ ...prev, [key]: null }));
    setSheetSuccess((prev) => ({ ...prev, [key]: null }));

    try {
      saveSingleSourceUrl(key, url);
      setSources(getPublishedDataSources());

      const res = await fetchAndParseGoogleSheet(url);
      if (res.errors.length > 0 && res.products.length === 0) {
        throw new Error(res.errors.join(' • '));
      }

      // لا دمج: كل صف في الشيت يبقى صنف مستقل في الكتالوج، حتى لو الكود مكرر
      // 10 مرات باختلاف اللون أو المقاس أو المخزون. القطاع يُؤخذ من عمود الشيت،
      // والفيولتر الافتراضي هو قطاع التبويب المحدد.
      const productsToImport = res.products.map((p) => ({
        ...p,
        sector: p.sector || activeSectorTab,
      }));

      const saveResult = await importProductsList(productsToImport, 'replace');
      if (!saveResult.success) {
        throw new Error(
          `تم قراءة ${productsToImport.length.toLocaleString('ar-EG')} صنف من الشيت لكن حفظهم في قاعدة البيانات فشل: ` +
            `${saveResult.error || 'خطأ غير معروف'}. الأصناف ظاهرة على الجهاز ده فقط وهتختفي بعد إعادة التحميل — ` +
            'راجع اتصال Supabase وصلاحيات جدول products.'
        );
      }

      const sectorCounts = productsToImport.reduce(
        (acc, p) => {
          if (p.sector === 'electrical') acc.electrical += 1;
          else if (p.sector === 'both') acc.both += 1;
          else acc.home += 1;
          return acc;
        },
        { home: 0, electrical: 0, both: 0 }
      );

      setSheetSuccess((prev) => ({
        ...prev,
        [key]:
          `تم قراءة ${res.totalRows.toLocaleString('ar-EG')} صف من الشيت ورفعهم جميعاً للكتالوج ` +
          `(منزلي: ${sectorCounts.home} • كهرباء: ${sectorCounts.electrical}` +
          `${sectorCounts.both ? ` • مشترك: ${sectorCounts.both}` : ''}). ` +
          'لا يوجد دمج أو حذف للأصناف المكررة — كل صف ظهر كمنتج مستقل، حتى لو الكود مكرر باختلاف اللون أو المقاس أو المخزون. الأسعار والأرصدة اتطابقت.'
      }));
      return {
        ok: true,
        message: `تم رفع ${productsToImport.length.toLocaleString('ar-EG')} صنف`,
      };
    } catch (err: any) {
      const message = err?.message || 'فشلت مزامنة شيت الأصناف والمخزون';
      setSheetErrors((prev) => ({ ...prev, [key]: message }));
      return { ok: false, message };
    } finally {
      if (!batch) setSyncingKey(null);
    }
  };

  // 4. Sync Targets Sheet (أهداف ومبيعات المناديب)
  const handleSyncTargets = async (urlOverride?: string, batch = false): Promise<SyncResult> => {
    const key = getSectorKey('targets');
    const url = (urlOverride || sourceUrls[key] || '').trim();
    if (!url) {
      const message = `يرجى إدخال رابط Google Sheet الخاص بأهداف ${activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية'} أولاً`;
      setSheetErrors((prev) => ({ ...prev, [key]: message }));
      return { ok: false, message };
    }
    setSyncingKey(key);
    setSheetErrors((prev) => ({ ...prev, [key]: null }));
    setSheetSuccess((prev) => ({ ...prev, [key]: null }));

    try {
      saveSingleSourceUrl(key, url);
      setSources(getPublishedDataSources());

      const res = await importTargetsFromGoogleSheet(url);
      if (!res.success) {
        throw new Error(res.message);
      }

      setSheetSuccess((prev) => ({
        ...prev,
        [key]: `تم بنجاح تحديث شيت أهداف المناديب لـ (${activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية'}) (${res.count} سجل) بدون تكرار! ظهرت مباشرة في لوحة متابعة الأداء.`
      }));
      return { ok: true, message: `تم تحديث ${res.count} سجل هدف` };
    } catch (err: any) {
      const message = err?.message || 'فشلت مزامنة شيت الأهداف';
      setSheetErrors((prev) => ({ ...prev, [key]: message }));
      return { ok: false, message };
    } finally {
      if (!batch) setSyncingKey(null);
    }
  };

  // 5. Sync Offers Sheet (العروض والخصومات)
  const handleSyncOffers = async (urlOverride?: string, batch = false): Promise<SyncResult> => {
    const key = getSectorKey('offers');
    const url = (urlOverride || sourceUrls[key] || '').trim();
    if (!url) {
      const message = `يرجى إدخال رابط Google Sheet الخاص بجدول عروض ${activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية'} أولاً`;
      setSheetErrors((prev) => ({ ...prev, [key]: message }));
      return { ok: false, message };
    }
    setSyncingKey(key);
    setSheetErrors((prev) => ({ ...prev, [key]: null }));
    setSheetSuccess((prev) => ({ ...prev, [key]: null }));

    try {
      saveSingleSourceUrl(key, url);
      setSources(getPublishedDataSources());

      // Read sheet and match promo prices / discounts
      const res = await fetchAndParseGoogleSheet(url);
      let appliedOffersCount = 0;
      if (res.products && res.products.length > 0) {
        // Merge promotional pricing into existing products catalog
        const offerMap = new Map<string, { promoPrice?: number; discount?: number }>();
        res.products.forEach((p) => {
          const k = (p.code || p.unifiedCode || '').trim().toLowerCase();
          // سعر العرض الحقيقي فقط: السعر العادي (cartonPrice) مش عرض،
          // وإلا كل صنف في الشيت كان بيتحسب "عرض مفعل" بالغلط.
          const promo = p.promoPrice || p.offerPrice || 0;
          if (k && promo > 0) {
            offerMap.set(k, {
              promoPrice: promo,
              discount: p.cartonPrice ? Math.round(((p.cartonPrice - promo) / p.cartonPrice) * 100) : undefined,
            });
          }
        });

        const updatedProds = products.map((p) => {
          const k = (p.code || p.unifiedCode || '').trim().toLowerCase();
          const offer = offerMap.get(k);
          if (offer && offer.promoPrice) {
            appliedOffersCount++;
            return {
              ...p,
              promoPrice: offer.promoPrice,
            };
          }
          return p;
        });

        if (appliedOffersCount > 0) {
          importProductsList(updatedProds, 'replace');
        }

        setSheetSuccess((prev) => ({
          ...prev,
          [key]: `تم بنجاح مزامنة شيت عروض (${activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية'}) وتطبيق أسعار العروض الترويجية على ${appliedOffersCount} صنف في الكتالوج والفواتير فورياً!`
        }));
      } else {
        setSheetSuccess((prev) => ({
          ...prev,
          [key]: `تم حفظ وتأكيد رابط شيت عروض (${activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية'}) بنجاح وهو متصل ومتاح للاستخدام الدائم.`
        }));
      }
      return { ok: true, message: `تم تطبيق أسعار العروض على ${appliedOffersCount} صنف` };
    } catch (err: any) {
      const message = err?.message || 'فشلت مزامنة شيت العروض';
      setSheetErrors((prev) => ({ ...prev, [key]: message }));
      return { ok: false, message };
    } finally {
      if (!batch) setSyncingKey(null);
    }
  };

  // Master One-Click Sync for All 5 Sheets of the Active Sector Concurrently
  const handleSyncAllSheets = async () => {
    const sectorName = activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية';

    const jobs: { label: string; key: SheetKey; run: (url: string, batch: boolean, onRowProgress?: (synced: number, total: number) => void) => Promise<SyncResult> }[] = [
      { label: 'العملاء', key: getSectorKey('customers'), run: handleSyncCustomers },
      { label: 'مبيعات العملاء', key: getSectorKey('customerSales'), run: handleSyncCustomerSales },
      { label: 'الأصناف', key: getSectorKey('products'), run: handleSyncProducts },
      { label: 'الأهداف', key: getSectorKey('targets'), run: handleSyncTargets },
      { label: 'العروض', key: getSectorKey('offers'), run: handleSyncOffers },
    ];

    setSyncingKey('all');
    setMasterSyncPercent(0);
    setMasterSyncProgress(`بدء مزامنة كافة الشيتات الـ 5 لـ (${sectorName})...`);

    // إجمالي الخطوات: 5 شيتات + فحص التكرار النهائي
    const totalSteps = jobs.length + 1;

    let syncedCount = 0;
    const errors: string[] = [];

    try {
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const url = (sourceUrls[job.key] || '').trim();
        setMasterSyncProgress(`${i + 1}/${jobs.length}: جاري قراءة وتحديث شيت ${job.label} لـ ${sectorName}...`);
        setMasterSyncPercent(Math.round((i / totalSteps) * 100));
        if (!url) {
          // الرابط غير محفوظ: بنسجله كفشل بدل ما نعدّه نجاح وهمي.
          errors.push(`${job.label}: لا يوجد رابط محفوظ لهذا الشيت`);
          setMasterSyncPercent(Math.round(((i + 1) / totalSteps) * 100));
          continue;
        }
        const result = await job.run(url, true, (synced, total) => {
          // تقدم صف-بصف: بندمج تقدم الرفع جوه الشيت الحالي مع تقدم الخطوات الكلي
          if (total > 0) {
            setMasterSyncPercent(Math.round(((i + synced / total) / totalSteps) * 100));
            setMasterSyncProgress(
              `شيت ${job.label} — تم رفع ${synced.toLocaleString('en-US')} من ${total.toLocaleString('en-US')} صف للسحابة...`
            );
          }
        });
        if (result.ok) {
          syncedCount++;
        } else {
          errors.push(`${job.label}: ${result.message}`);
        }
        setMasterSyncPercent(Math.round(((i + 1) / totalSteps) * 100));
      }

      // Final dedup safety sweep
      setMasterSyncProgress('فحص نهائي وتأكيد منع التكرار وتحديث أجهزة المناديب...');
      cleanAndDeduplicateCustomers();
      setMasterSyncPercent(100);

      if (syncedCount === jobs.length) {
        setMasterSyncProgress(
          `اكتملت المزامنة بنجاح! تم تحديث ${syncedCount} شيت رئيسي وتعميم البيانات في ثوانٍ معدودة بدون أي تكرار.`
        );
      } else if (syncedCount > 0) {
        setMasterSyncProgress(`تم تحديث ${syncedCount} من ${jobs.length} شيت. لم يكتمل: ${errors.join(' • ')}`);
      } else {
        setMasterSyncProgress(`لم يتم تحديث أي شيت. الأسباب: ${errors.join(' • ')}`);
      }
    } catch (e: any) {
      setMasterSyncProgress(`توقفت المزامنة بسبب خطأ غير متوقع: ${e?.message || e}`);
    } finally {
      setSyncingKey(null);
      setTimeout(() => setMasterSyncProgress(null), 10000);
    }
  };

  // Run Dedup Audit on Demand
  const handleRunDedupAudit = () => {
    const result = cleanAndDeduplicateCustomers();
    setDedupNotice({
      original: result.originalCount,
      cleaned: result.deduplicatedCount,
      removed: result.duplicatesRemoved,
      message: result.duplicatesRemoved > 0
        ? `تم فحص قاعدة البيانات بنجاح: تم دمج وإزالة ${result.duplicatesRemoved} سجل مكرر، وقاعدة البيانات تحتوي الآن على ${result.deduplicatedCount} عميل فريد بنسبة 100%.`
        : `قاعدة البيانات نظيفة تماماً بنسبة 100%! يوجد ${result.deduplicatedCount} عميل فريد بدون أي تكرار نهائياً (0 تكرار)، وموحدة لجميع المناديب والمشرفين.`
    });
    setTimeout(() => setDedupNotice(null), 10000);
  };

  // Local File Upload Handlers
  const handleUploadCustomerFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = getSectorKey('customers');
    setSyncingKey(key);
    setSheetErrors((prev) => ({ ...prev, [key]: null }));
    setMasterSyncPercent(5);
    setMasterSyncProgress(`جاري قراءة ملف قاعدة العملاء (${file.name})...`);
    try {
      setMasterSyncPercent(20);
      setMasterSyncProgress('جاري تحليل صفوف العملاء من ملف Excel...');
      const res = await parseExcelCustomers(file);
      if (res.errors.length > 0 && res.customers.length === 0) {
        throw new Error(res.errors.join(' • '));
      }
      setMasterSyncPercent(60);
      setMasterSyncProgress(`جاري دمج وحفظ ${res.customers.length.toLocaleString('ar-EG')} عميل...`);
      const sectorTagged = res.customers.map((c) => ({
        ...c,
        sector: (c.sector === 'electrical' || c.sector === 'home' || c.sector === 'both' || c.sector === 'all')
          ? c.sector
          : activeSectorTab,
      }));
      const importedHome = sectorTagged.filter((c) => !c.sector || c.sector === 'home' || c.sector === 'both' || c.sector === 'all').length;
      const importedElec = sectorTagged.filter((c) => c.sector === 'electrical' || c.sector === 'both' || c.sector === 'all').length;
      const hasMixed = sectorTagged.some((c) => c.sector === 'electrical') && sectorTagged.some((c) => !c.sector || c.sector === 'home');
      const sectorLabel = hasMixed
        ? 'القطاعين (منزلي + كهرباء)'
        : (activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية');
      const importRes = await importCustomersList(sectorTagged, 'merge');
      setMasterSyncPercent(100);
      setMasterSyncProgress(`تم حفظ ${importRes.count?.toLocaleString('ar-EG') || ''} عميل بنجاح.`);
      setSheetSuccess((prev) => ({
        ...prev,
        [key]: `تم بنجاح رفع ملف الإكسل وتحديث ${importRes.count} عميل لـ (${sectorLabel})${hasMixed ? ` — منزلي: ${importedHome.toLocaleString('ar-EG')} / كهرباء: ${importedElec.toLocaleString('ar-EG')}` : ''} بدون تكرار!`
      }));
    } catch (err: any) {
      setMasterSyncProgress(null);
      setMasterSyncPercent(0);
      setSheetErrors((prev) => ({ ...prev, [key]: err?.message || 'فشل رفع ملف العملاء' }));
    } finally {
      setSyncingKey(null);
      setTimeout(() => {
        setMasterSyncProgress(null);
        setMasterSyncPercent(0);
      }, 4000);
      if (fileInputCustomersRef.current) fileInputCustomersRef.current.value = '';
    }
  };

  const handleUploadCustomerSalesFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = getSectorKey('customerSales');
    setSyncingKey(key);
    setSheetErrors((prev) => ({ ...prev, [key]: null }));
    setMasterSyncPercent(5);
    setMasterSyncProgress(`جاري قراءة ملف مبيعات العملاء (${file.name})...`);
    try {
      setMasterSyncPercent(15);
      setMasterSyncProgress('جاري تحليل صفوف مبيعات الأصناف...');
      const itemSalesRes = await parseExcelCustomerItemSales(file);
      if (itemSalesRes.sales && itemSalesRes.sales.length > 0) {
        setMasterSyncPercent(40);
        setMasterSyncProgress(`تم العثور على ${itemSalesRes.sales.length.toLocaleString('ar-EG')} صف. جاري ربط العملاء وحفظ البيانات...`);
        const enrichedRes = enrichCustomerItemSalesWithDirectory(itemSalesRes.sales, customersRef.current);
        const finalSales = enrichedRes.enriched;
        await saveCustomerItemSales(finalSales, 'merge');
        setMasterSyncPercent(65);
        setMasterSyncProgress(`جاري رفع ${finalSales.length.toLocaleString('ar-EG')} صف إلى السحابة...`);
        pushCustomerItemSalesToSupabase(finalSales, (synced, total) => {
          setRowUploadProgress({ synced, total });
          if (total > 0) {
            setMasterSyncPercent(65 + Math.round((synced / total) * 30));
            setMasterSyncProgress(`رفع مبيعات الأصناف إلى السحابة: ${synced.toLocaleString('ar-EG')} من ${total.toLocaleString('ar-EG')}`);
          }
        }).catch((err) => {
          console.warn('Auto cloud sync notice:', err);
        });

        // Deduplicate and merge customer profiles from item sales rows
        const codeMap = new Map<string, Customer>();
        const phoneMap = new Map<string, Customer>();
        const nameMap = new Map<string, Customer>();

        customersRef.current.forEach((c) => {
          const cd = cleanCustomerCode(c.code);
          if (cd) codeMap.set(cd, c);
          const ph = cleanCustomerPhone(c.phone);
          if (ph) phoneMap.set(ph, c);
          if (c.name) nameMap.set(normalizeArabicText(c.name).replace(/\s+/g, ''), c);
        });

        // Group total sales by customer
        const custTotals = new Map<string, { totalAmount: number; repName: string; warehouse: string }>();
        finalSales.forEach((s) => {
          const k = (s.customerAccount || s.invoicingName).trim().toLowerCase();
          const prev = custTotals.get(k) || { totalAmount: 0, repName: s.repName, warehouse: s.warehouse };
          prev.totalAmount += s.amount;
          if (s.repName && s.repName !== 'غير محدد') prev.repName = s.repName;
          if (s.warehouse) prev.warehouse = s.warehouse;
          custTotals.set(k, prev);
        });

        const updatedCustomers = [...customersRef.current];
        let updatedCount = 0;
        let newCount = 0;

        finalSales.forEach((s) => {
          const cd = cleanCustomerCode(s.customerAccount);
          const normN = s.invoicingName ? normalizeArabicText(s.invoicingName).replace(/\s+/g, '') : '';
          const existing = (cd && codeMap.get(cd)) || (normN && nameMap.get(normN));
          const summary = custTotals.get((s.customerAccount || s.invoicingName).trim().toLowerCase());

          if (existing) {
            const idx = updatedCustomers.findIndex((c) => c.id === existing.id);
            if (idx >= 0) {
              updatedCustomers[idx] = {
                ...updatedCustomers[idx],
                sales2026: Math.max(updatedCustomers[idx].sales2026 || 0, summary?.totalAmount || 0),
                salesRepName: updatedCustomers[idx].salesRepName || summary?.repName || s.repName,
                branchName: updatedCustomers[idx].branchName || summary?.warehouse || s.warehouse,
              };
              updatedCount++;
            }
          } else if (normN && !nameMap.has(normN)) {
            const newCust: Customer = {
              id: `cust-file-${s.customerAccount}-${Date.now().toString(36)}`,
              code: s.customerAccount,
              name: s.invoicingName || s.customerAccount,
              salesRepName: s.repName,
              branchName: s.warehouse,
              sales2026: summary?.totalAmount || s.amount,
              currentBalance: 0,
              creditLimit: 0,
              tier: 'عادي',
              isKeyAccount: false,
              phone: '',
              address: s.warehouse || ''
            };
            updatedCustomers.push(newCust);
            nameMap.set(normN, newCust);
            if (cd) codeMap.set(cd, newCust);
            newCount++;
          }
        });

        const finalDeduped = deduplicateAndMergeCustomers(updatedCustomers).customers;
        await importCustomersList(finalDeduped, 'merge');

        setMasterSyncPercent(100);
        setMasterSyncProgress('تم حفظ مبيعات العملاء محليًا وبدأ الرفع للسحابة.');
        setSheetSuccess((prev) => ({
          ...prev,
          [key]: `تم بنجاح رفع ملف الإكسل وتحديث ${finalSales.length.toLocaleString('ar-EG')} حركة صنف، وتم ربط كود العميل بقاعدة العملاء لـ (${enrichedRes.distinctCustomersMatched} عميل) وتحديد فروعهم ومناديبهم تلقائياً بدون تكرار!`
        }));
        setTimeout(() => { setMasterSyncProgress(null); setMasterSyncPercent(0); }, 5000);
        return;
      }

      // 2. Fallback to classic customer target format
      const res = await parseExcelCustomers(file);
      if (res.errors.length > 0 && res.customers.length === 0) {
        throw new Error(res.errors.join(' • '));
      }

      // Merge in place with existing customers
      const updatedCustomers = [...customersRef.current];
      let updatedCount = 0;
      let newCount = 0;

      const codeMap = new Map<string, Customer>();
      const phoneMap = new Map<string, Customer>();
      const nameMap = new Map<string, Customer>();

      customersRef.current.forEach((c) => {
        const cd = cleanCustomerCode(c.code);
        if (cd) codeMap.set(cd, c);
        const ph = cleanCustomerPhone(c.phone);
        if (ph) phoneMap.set(ph, c);
        if (c.name) nameMap.set(normalizeArabicText(c.name).replace(/\s+/g, ''), c);
      });

      res.customers.forEach((incoming) => {
        const cd = cleanCustomerCode(incoming.code);
        const ph = cleanCustomerPhone(incoming.phone);
        const normN = incoming.name ? normalizeArabicText(incoming.name).replace(/\s+/g, '') : '';

        const existing = (cd && codeMap.get(cd)) ||
                         (ph && phoneMap.get(ph)) ||
                         (normN && nameMap.get(normN));

        if (existing) {
          const idx = updatedCustomers.findIndex((c) => c.id === existing.id);
          if (idx >= 0) {
            updatedCustomers[idx] = mergeTwoCustomers(updatedCustomers[idx], incoming);
            updatedCount++;
          }
        } else {
          updatedCustomers.push(incoming);
          newCount++;
        }
      });

      const finalDeduped = deduplicateAndMergeCustomers(updatedCustomers).customers;
      await importCustomersList(finalDeduped, 'merge');

      setSheetSuccess((prev) => ({
        ...prev,
        [key]: `تم بنجاح رفع ملف مبيعات العملاء وتحديث ${updatedCount} عميل قائم وإدراج ${newCount} عميل جديد بدون أي تكرار!`
      }));
    } catch (err: any) {
      setMasterSyncProgress(null);
      setMasterSyncPercent(0);
      setSheetErrors((prev) => ({ ...prev, [key]: err?.message || 'فشل رفع ملف مبيعات العملاء' }));
    } finally {
      setRowUploadProgress(null);
      setSyncingKey(null);
      setTimeout(() => {
        if (!rowUploadProgress) {
          setMasterSyncProgress(null);
          setMasterSyncPercent(0);
        }
      }, 6000);
      if (fileInputSalesRef.current) fileInputSalesRef.current.value = '';
    }
  };

  const handleUploadProductsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = getSectorKey('products');
    setSyncingKey(key);
    setSheetErrors((prev) => ({ ...prev, [key]: null }));
    try {
      const res = await parseExcelProducts(file);
      if (res.errors.length > 0 && res.products.length === 0) {
        throw new Error(res.errors.join(' • '));
      }
      const sectorTagged = res.products.map((p) => ({
        ...p,
        sector: p.sector || activeSectorTab,
      }));
      importProductsList(sectorTagged, 'replace');
      setSheetSuccess((prev) => ({
        ...prev,
        [key]: `تم بنجاح استيراد ${res.products.length} صنف من ملف الإكسل لـ (${activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية'}) وتحديث أرصدة المخازن والأسعار!`
      }));
    } catch (err: any) {
      setSheetErrors((prev) => ({ ...prev, [key]: err?.message || 'فشل رفع ملف الأصناف' }));
    } finally {
      setSyncingKey(null);
      if (fileInputProductsRef.current) fileInputProductsRef.current.value = '';
    }
  };

  const handleUploadTargetsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = getSectorKey('targets');
    setSyncingKey(key);
    setSheetErrors((prev) => ({ ...prev, [key]: null }));
    try {
      const res = await importTargetsFromExcel(file);
      if (!res.success) throw new Error(res.message);
      setSheetSuccess((prev) => ({
        ...prev,
        [key]: `تم بنجاح استيراد ${res.count} سجل هدف من ملف الإكسل بدون تكرار!`
      }));
    } catch (err: any) {
      setSheetErrors((prev) => ({ ...prev, [key]: err?.message || 'فشل رفع ملف الأهداف' }));
    } finally {
      setSyncingKey(null);
      if (fileInputTargetsRef.current) fileInputTargetsRef.current.value = '';
    }
  };

  // Metrics Calculations
  const metrics = useMemo(() => {
    const totalCustomers = customers.length;
    const totalDebt = customers.reduce((sum, c) => sum + (c.currentBalance ?? c.balance ?? 0), 0);
    const totalCredit = customers.reduce((sum, c) => sum + (c.creditLimit || 0), 0);
    const totalSales2026 = customers.reduce((sum, c) => sum + (c.sales2026 || c.totalMonthlySales || 0), 0);
    const totalCollections2026 = customers.reduce((sum, c) => sum + (c.collections2026 || c.totalMonthlyCollections || 0), 0);
    const activeDealersCount = customers.filter((c) => c.hasDealtIn2026 || (c.sales2026 || 0) > 0).length;

    const totalProducts = products.length;
    const totalCartons = products.reduce((sum, p) => sum + (p.branchStockActual || 0) + (p.mainWarehouseActual || 0), 0);

    const totalTargets = targets.length;
    const totalTargetSales = targets.reduce((sum, t) => sum + (t.salesTarget || 0), 0);

    const activeOffersCount = products.filter((p) => p.promoPrice && p.promoPrice > 0).length;

    // 5 شيتات القطاع الحالي فقط — العدّاد القديم كان بيمشي على كل المفاتيح
    // (بما فيها شيتات القطاع التاني) فيطلع مثلاً 8 / 5.
    const sectorSheetKeys: SheetKey[] = [
      getSectorKey('customers'),
      getSectorKey('customerSales'),
      getSectorKey('products'),
      getSectorKey('targets'),
      getSectorKey('offers'),
    ];
    const connectedSheetsCount = sectorSheetKeys.filter((k) => isValidPublishedSource(sources[k])).length;

    return {
      totalCustomers,
      totalDebt,
      totalCredit,
      totalSales2026,
      totalCollections2026,
      activeDealersCount,
      totalProducts,
      totalCartons,
      totalTargets,
      totalTargetSales,
      activeOffersCount,
      connectedSheetsCount,
    };
  }, [customers, products, targets, sources, sourceUrls, activeSectorTab]);

  // Google Apps Script sample
  const sampleAppsScript = `// كود Google Apps Script لمزامنة Google Sheets مع نظام دريم للتوزيع تلقائياً
function onEdit(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  console.log("تم تعديل الشيت بنجاح في نظام الطنطاوي جروب");
}`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(sampleAppsScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'technical_support';
  const isDevOrSupport = currentUser?.role === 'developer' || currentUser?.role === 'technical_support';

  if (!isAdminOrDev) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center space-y-3 my-6 shadow-sm" dir="rtl">
        <div className="w-14 h-14 rounded-2xl bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] text-[var(--app-risk-text)] flex items-center justify-center mx-auto shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-slate-900">غير مصرح لك بالدخول</h3>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
          صلاحية ربط وإدارة ملفات الإكسل والشيتات وتصفير البيانات مقتصرة فقط على <strong>المدير العام (Admin)</strong> و<strong>المطور (Developer)</strong> لضمان حماية بيانات الشركة.
        </p>
      </div>
    );
  }

  return (
    <div className="tg-dash space-y-4 pb-20" dir="rtl">
      
      {/* Hidden File Inputs */}
      <input
        ref={fileInputCustomersRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleUploadCustomerFile}
      />
      <input
        ref={fileInputSalesRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleUploadCustomerSalesFile}
      />
      <input
        ref={fileInputProductsRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleUploadProductsFile}
      />
      <input
        ref={fileInputTargetsRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleUploadTargetsFile}
      />

      {/* Top Hero Banner & Controls */}
      <div className="ds-pagehead space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/20 text-sky-200 rounded-xl text-xs font-bold">
              <Sparkles className="w-4 h-4 text-sky-300" />
              <span>مركز إدارة الشيتات السحابية الخمس المركزية (صفحة واحدة موحدة)</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-sky-300 shrink-0" />
              <span>لوحة الربط والمزامنة المركزية لملفات الإكسل وجوجل شيت</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-100/90 max-w-3xl leading-relaxed font-medium">
              تم تلخيص كافة مصادر البيانات في <strong className="text-white font-black">صفحة واحدة مركزية تضم الـ 5 شيتات المعتمدة</strong>. يمكنك حفظ روابط Google Sheets بشكل دائم، المزامنة السحابية الفورية أو رفع ملفات إكسل بديلة، مع <strong className="text-white font-black">ضمان منع التكرار بنسبة 100%</strong> وتحديث بيانات المناديب والمشرفين فورياً.
            </p>
          </div>

          {/* Quick Header Counter Badges */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-2xl p-4 text-center min-w-[130px]">
              <div className="text-[11px] text-slate-200 font-bold">الشيتات المتصلة</div>
              <div className="text-2xl font-black text-white font-mono tabular-nums mt-0.5">
                {metrics.connectedSheetsCount} / 5
              </div>
              <div className="text-[11px] text-emerald-300 font-bold mt-1">سحابية مباشرة</div>
            </div>

            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-2xl p-4 text-center min-w-[130px]">
              <div className="text-[11px] text-slate-200 font-bold">قاعدة العملاء</div>
              <div className="text-2xl font-black text-white font-mono tabular-nums mt-0.5">
                {metrics.totalCustomers.toLocaleString('en-US')}
              </div>
              <div className="text-[11px] text-sky-200 font-semibold mt-1">عميل فريد (0 تكرار)</div>
            </div>
          </div>
        </div>

        {/* Master Control Buttons */}
        <div className="pt-4 border-t border-white/15 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white/10 border border-white/15 rounded-2xl p-3.5">
            <div>
              <div className="text-xs sm:text-sm font-black text-white">مصدر قراءة البيانات</div>
              <div className="text-[11px] sm:text-xs text-slate-200 font-medium mt-0.5">
                اختر {`"Google Sheets مباشر"`} لتقليل استهلاك Supabase egress. (يتطلب روابط شيتات محفوظة ومفعّلة)
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDataReadModeChange('supabase')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black border transition cursor-pointer ${dataReadMode === 'supabase' ? 'bg-sky-500 text-white border-sky-300 shadow-sm' : 'bg-white/10 text-slate-100 border-white/20 hover:bg-white/20'}`}
              >
                Supabase
              </button>
              <button
                type="button"
                onClick={() => handleDataReadModeChange('google_sheets')}
                className={`px-3.5 py-2 rounded-xl text-xs font-black border transition cursor-pointer ${dataReadMode === 'google_sheets' ? 'bg-emerald-700 text-white border-emerald-300 shadow-sm' : 'bg-white/10 text-slate-100 border-white/20 hover:bg-white/20'}`}
              >
                Google Sheets مباشر
              </button>
            </div>
          </div>
          {dataReadMode === 'google_sheets' && (
            <div className="text-xs text-amber-100 font-semibold bg-amber-500/15 border border-amber-300/30 rounded-xl px-3.5 py-2.5 leading-relaxed">
              وضع القراءة من Google Sheets مفعّل على هذا الجهاز. حمّل/زامن الشيتات (عملاء، أصناف، تارجت) من الأسفل ثم حدّث الصفحة لتظهر البيانات مباشرة من الشيت وتوفير استهلاك Supabase.
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleSyncAllSheets}
              disabled={syncingKey !== null}
              className="bg-[var(--app-accent)] hover:bg-[#00827a] text-white font-black px-5 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {syncingKey === 'all' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري مزامنة الشيتات الـ 5...</span>
                </>
              ) : (
                <>
                  <CloudLightning className="w-4 h-4 text-white" />
                  <span>مزامنة جميع الشيتات الـ 5 دفعة واحدة</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleRunDedupAudit}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/15 font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#7fc0ff]" />
              <span>فحص ومنع التكرار الشامل (0 تكرار)</span>
            </button>

            {/* مزامنة العملاء التراكمية من السيرفر — للمطور والدعم الفني فقط */}
            {isDevOrSupport && (
              <>
              <button
                type="button"
                onClick={async () => {
                  const res = await syncCustomersIncrementally();
                  alert(
                    res.success
                      ? res.message || 'تم مزامنة العملاء من السيرفر بنجاح'
                      : 'فشل المزامنة: ' + (res.message || 'خطأ غير معروف')
                  );
                }}
                className="bg-[#1e3a8a] hover:bg-[#1e408f] text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                title="يسحب فقط العملاء الجدد أو اللي اتعدلوا منذ آخر مزامنة (لا يستبدل الـ 5000 عميل)"
              >
              <RefreshCw className="w-4 h-4" />
              <span>مزامنة العملاء من السيرفر (تراكمي)</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                const res = await syncTargetsIncrementally();
                alert(
                  res.success
                    ? res.message || 'تم مزامنة الأهداف من السيرفر بنجاح'
                    : 'فشل المزامنة: ' + (res.message || 'خطأ غير معروف')
                );
              }}
              className="bg-[#1e3a8a] hover:bg-[#1e408f] text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              title="يسحب فقط الأهداف الجدد أو اللي اتعدلوا منذ آخر مزامنة"
            >
              <RefreshCw className="w-4 h-4" />
              <span>مزامنة الأهداف من السيرفر (تراكمي)</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                const res = await syncProductsIncrementally();
                alert(
                  res.success
                    ? res.message || 'تم مزامنة الأصناف من السيرفر بنجاح'
                    : 'فشل المزامنة: ' + (res.message || 'خطأ غير معروف')
                );
              }}
              className="bg-[#1e3a8a] hover:bg-[#1e408f] text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              title="يسحب فقط الأصناف الجدد أو اللي اتعدلوا منذ آخر مزامنة (بما في ذلك أسعار العروض)"
            >
              <RefreshCw className="w-4 h-4" />
              <span>مزامنة الأصناف والعروض من السيرفر (تراكمي)</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                const res = await syncCustomerItemSalesIncrementally();
                alert(
                  res.success
                    ? res.message || 'تم مزامنة مبيعات الأصناف من السيرفر بنجاح'
                    : 'فشل المزامنة: ' + (res.message || 'خطأ غير معروف')
                );
              }}
              className="bg-[#1e3a8a] hover:bg-[#1e408f] text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              title="يسحب فقط سجلات مبيعات الأصناف الجدد أو اللي اتعدلوا منذ آخر مزامنة"
            >
              <RefreshCw className="w-4 h-4" />
              <span>مزامنة مبيعات الأصناف من السيرفر (تراكمي)</span>
            </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsWipeModalOpen(true)}
              className="bg-white/10 hover:bg-rose-500/20 text-[#fecaca] border border-[var(--app-risk-line)] font-bold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>تصفير ومسح البيانات للبدء من جديد</span>
            </button>
          </div>
        </div>
        </div>

        {/* Sync Progress Bar — نسبة حقيقية لمزامنة الكل، وشريط غير محدد للشيت الواحد / رفع الملفات */}
        {(masterSyncProgress || (syncingKey && syncingKey !== 'all')) && (
          <div className="bg-[var(--app-card)] border border-[var(--app-border)] rounded-3xl p-6 shadow-lg animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
              <span className="font-black text-[var(--app-text)] text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[var(--app-primary-text)] animate-spin" />
                جاري المزامنة
              </span>
              <span className="text-[var(--app-text-muted)] text-xs font-mono">
                {masterSyncProgress || `جاري قراءة وتحديث شيت (${SHEET_LABELS[syncingKey as SheetKey] || ''})...`}
              </span>
            </div>
            {masterSyncProgress ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-full bg-[var(--app-card-hover)] h-3 rounded-full overflow-hidden border border-[var(--app-border)]">
                    <div
                      className="h-full bg-[var(--app-accent)] transition-all duration-500 ease-out"
                      style={{ width: `${masterSyncPercent}%` }}
                    />
                  </div>
                  <span className="text-[var(--app-primary-text)] text-xs font-black font-mono shrink-0 tabular-nums">
                    {masterSyncPercent}%
                  </span>
                </div>
                <p className="mt-3 text-[var(--app-text-muted)] text-[10px] leading-relaxed">
                  تم إنجاز {masterSyncPercent}% من المزامنة — باقي {100 - masterSyncPercent}%. يتم معالجة البيانات في الخلفية، ويمكنك الاستمرار في استخدام التطبيق أثناء المزامنة.
                </p>
              </>
            ) : rowUploadProgress ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-full bg-[var(--app-card-hover)] h-3 rounded-full overflow-hidden border border-[var(--app-border)]">
                    <div
                      className="h-full bg-[var(--app-accent)] transition-all duration-300 ease-out"
                      style={{ width: `${Math.min(100, Math.round((rowUploadProgress.synced / Math.max(1, rowUploadProgress.total)) * 100))}%` }}
                    />
                  </div>
                  <span className="text-[var(--app-primary-text)] text-xs font-black font-mono shrink-0 tabular-nums">
                    {Math.min(100, Math.round((rowUploadProgress.synced / Math.max(1, rowUploadProgress.total)) * 100))}%
                  </span>
                </div>
                <p className="mt-3 text-[var(--app-text-muted)] text-[10px] leading-relaxed">
                  تم رفع <span className="font-black text-[var(--app-text)]">{rowUploadProgress.synced.toLocaleString('en-US')}</span> من{' '}
                  <span className="font-black text-[var(--app-text)]">{rowUploadProgress.total.toLocaleString('en-US')}</span> صف للسحابة — باقي{' '}
                  {Math.max(0, rowUploadProgress.total - rowUploadProgress.synced).toLocaleString('en-US')} صف.
                </p>
              </>
            ) : (
              <>
                <div className="w-full bg-[var(--app-card-hover)] h-3 rounded-full overflow-hidden border border-[var(--app-border)]">
                  <div className="h-full w-2/5 bg-[var(--app-accent)] rounded-full animate-pulse" />
                </div>
                <p className="mt-3 text-[var(--app-text-muted)] text-[10px] leading-relaxed">
                  يتم معالجة البيانات في الخلفية، ويمكنك الاستمرار في استخدام التطبيق أثناء المزامنة.
                </p>
              </>
            )}
          </div>
        )}

        {/* Dedup Audit Notice */}
        {dedupNotice && (
          <div className="bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] text-[var(--app-ok-text)] p-4 rounded-2xl text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5 font-bold">
              <ShieldCheck className="w-5 h-5 text-[var(--app-ok-text)] shrink-0" />
              <span>{dedupNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setDedupNotice(null)}
              className="text-[var(--app-ok-text)] hover:text-[var(--app-risk-text)] p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Reassurance & Zero-Duplication Guarantee Banner */}
      <div className="bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[var(--app-ok-text)] text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--app-ok)] text-white flex items-center justify-center font-black shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <strong className="block text-sm font-black text-[var(--app-ok-text)]">
              ضمان عدم تكرار البيانات وتحديث المناديب فورياً (Strict In-Place Deduplication)
            </strong>
            <p className="text-[var(--app-ok-text)] text-[11px] mt-0.5">
              كل شيت يتم مزامنته أو رفعه يمر تلقائياً عبر محرك الفحص الذكي (المطابقة بالكود الموحد، رقم الهاتف، واسم النشاط). يتم تحديث بيانات نفس العميل والصنف في مكانه بدون مضاعفة السجلات أو خلق صفوف مكررة.
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-white border border-[var(--app-ok-line)] font-bold text-[11px] text-[var(--app-ok-text)]">
            ✓ كود موحد
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-white border border-[var(--app-ok-line)] font-bold text-[11px] text-[var(--app-ok-text)]">
            ✓ تحديث لحظي للموظفين
          </span>
        </div>
      </div>

      {/* Sector Selector Tab: قطاع الأدوات المنزلية (Single Source) */}
      <div className="bg-[#0f2b38] dark:bg-slate-900 p-1.5 rounded-2xl flex items-center gap-2 border border-slate-700/80 shadow-md">
        <button
          type="button"
          onClick={() => setActiveSectorTab('home')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 transition cursor-pointer ${
            activeSectorTab === 'home'
              ? 'bg-[var(--app-primary)] text-white shadow-md ring-1 ring-white/25'
              : 'text-slate-200 hover:text-white hover:bg-white/10'
          }`}
        >
          <Home className="w-4 h-4" />
          <span>قاعدة العملاء (منزلي + كهرباء)</span>
          <span className="text-[11px] px-2.5 py-0.5 rounded-lg font-bold bg-white/15 text-white tabular-nums">
            شيت واحد
          </span>
        </button>
      </div>

      {/* THE 5 CORE SHEETS CARDS SECTION */}
      <div className="space-y-6">

        {/* ---------------- CARD 1: Customers & Debts (شيت العملاء والمديونيات) ---------------- */}
        {(() => {
          const custKey = getSectorKey('customers');
          const isConnected = isValidPublishedSource(sources[custKey]);
          const sectorTitle = activeSectorTab === 'electrical' ? 'قطاع الكهرباء' : 'قطاع الأدوات المنزلية';
          const sectorColor = activeSectorTab === 'electrical'
            ? 'text-teal-800 bg-teal-50 border-teal-200 dark:text-teal-200 dark:bg-teal-500/20 dark:border-teal-400/35'
            : 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-200 dark:bg-blue-500/20 dark:border-blue-400/35';
          return (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5 hover:border-[var(--app-accent)] transition duration-200">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className={`w-14 h-14 rounded-2xl border ${sectorColor} flex items-center justify-center font-black shrink-0`}>
                    <Users className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base sm:text-lg font-black text-slate-900">
                        1. شيت قاعدة العملاء والمديونيات (منزلي + كهرباء)
                      </h3>
                      <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${
                        isConnected
                          ? 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border border-[var(--app-ok-line)]'
                          : 'bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600'
                      }`}>
                        {isConnected ? '● متصل سحابياً' : '○ غير متصل'}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold border ${sectorColor}`}>
                        {sectorTitle}
                      </span>
                    </div>
                    <p className="text-xs sm:text-[13px] font-medium text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      قاعدة بيانات عملاء القطاعين (منزلي + كهرباء)، الأكواد، الفروع، المديونيات الحالية، الحد الائتماني، وتعيين المناديب والمشرفين. لو الشيت فيه عمود قطاع، هيتم توزيع البيانات تلقائيًا.
                    </p>
                  </div>
                </div>

                {/* Quick Metrics */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  {(() => {
                    const homeCustomers = customers.filter((c) => !c.sector || c.sector === 'home' || c.sector === 'both' || c.sector === 'all');
                    const electricalCustomers = customers.filter((c) => c.sector === 'electrical' || c.sector === 'both' || c.sector === 'all');
                    const homeDebt = homeCustomers.reduce((sum, c) => sum + (Number(c.currentBalance ?? c.balance ?? 0) || 0), 0);
                    const electricalDebt = electricalCustomers.reduce((sum, c) => sum + (Number(c.currentBalance ?? c.balance ?? 0) || 0), 0);
                    return (
                      <>
                        <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-center min-w-[170px]">
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 font-bold">العملاء الحاليين (القطاعين)</div>
                          <div className="mt-1 space-y-0.5 text-[11px] font-black tabular-nums">
                            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">منزلي</span><span className="text-slate-900 tabular-nums">{homeCustomers.length.toLocaleString('en-US')}</span></div>
                            <div className="flex items-center justify-between gap-3"><span className="text-slate-500">كهرباء</span><span className="text-slate-900 tabular-nums">{electricalCustomers.length.toLocaleString('en-US')}</span></div>
                          </div>
                        </div>
                        <div className="bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] px-3.5 py-2 rounded-xl text-center min-w-[220px]">
                          <div className="text-[11px] text-[var(--app-risk-text)] font-bold">إجمالي المديونيات (القطاعين)</div>
                          <div className="mt-1 space-y-0.5 text-[11px] font-black tabular-nums">
                            <div className="flex items-center justify-between gap-3"><span className="text-[var(--app-risk-text)]/80">منزلي</span><span className="text-[var(--app-risk-text)]">{formatCurrency(homeDebt)}</span></div>
                            <div className="flex items-center justify-between gap-3"><span className="text-[var(--app-risk-text)]/80">كهرباء</span><span className="text-[var(--app-risk-text)]">{formatCurrency(electricalDebt)}</span></div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* URL Input Form */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label htmlFor="customer-sheet-url" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-[var(--app-ok-text)]" />
                    <span>رابط Google Sheet الخاص بعملاء {sectorTitle} (Anyone with the link can view):</span>
                  </label>
                  {sourceUrls[custKey] && (
                    <a
                      href={sourceUrls[custKey]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--app-ok-text)] hover:underline flex items-center gap-1 font-bold"
                    >
                      <span>فتح شيت {sectorTitle} في Google Sheets</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="customer-sheet-url"
                      type="text"
                      value={sourceUrls[custKey] || ''}
                      onChange={(e) => setSourceUrls((prev) => ({ ...prev, [custKey]: e.target.value }))}
                      placeholder={`رابط شيت Google Sheet لعملاء ${sectorTitle}...`}
                      className="w-full h-11 pr-10 pl-3 bg-white dark:bg-[#0b1926] border border-slate-300 dark:border-slate-600 rounded-xl text-xs sm:text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] font-medium"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSaveUrl(custKey)}
                    className="bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    {savedUrlNotice === custKey ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>تم حفظ الرابط ✓</span>
                      </>
                    ) : (
                      <span>حفظ رابط {sectorTitle} دائماً</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSyncCustomers()}
                    disabled={syncingKey === custKey || !(sourceUrls[custKey] || '').trim()}
                    className="bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-500/20 dark:hover:bg-blue-500/30 dark:text-blue-200 dark:border-blue-400/40 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncingKey === custKey ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري المزامنة...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span>مزامنة سحابية فورية</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Notifications */}
                {sheetSuccess[custKey] && (
                  <div className="p-3 bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] text-[var(--app-ok-text)] rounded-xl text-xs flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-[var(--app-ok-text)] shrink-0" />
                    <span>{sheetSuccess[custKey]}</span>
                  </div>
                )}
                {sheetErrors[custKey] && (
                  <div className="p-3 bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] text-[var(--app-risk-text)] rounded-xl text-xs flex items-center gap-2 font-bold">
                    <AlertCircle className="w-4 h-4 text-[var(--app-risk-text)] shrink-0" />
                    <span>{sheetErrors[custKey]}</span>
                  </div>
                )}
              </div>
            </div>
            );
          })()}

          {/* Action Buttons: Upload Excel / Export / Template */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputCustomersRef.current?.click()}
                className="bg-slate-50 border border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-600 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Upload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-300" />
                <span>رفع ملف إكسل محلي (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={generateSampleCustomersTemplate}
                className="bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:border-teal-400/35 dark:hover:bg-teal-500/25 dark:text-teal-200 font-bold px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل نموذج إكسل معتمد</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => exportCustomersToExcel(customers, selectedBranchFilter)}
              className="bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-white font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
              <span>تصدير قاعدة العملاء ({customers.length})</span>
            </button>
          </div>
        </div>

        {/* ---------------- CARD 2: Customer Sales by Item (شيت مبيعات العملاء بالصنف) ---------------- */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5 hover:border-[var(--app-accent)] transition duration-200">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-[var(--app-accent)] to-teal-700 text-white flex items-center justify-center font-black shrink-0">
                <BarChart3 className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    2. شيت مبيعات العملاء بالصنف
                  </h3>
                  <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${
                    isValidPublishedSource(sources.customerSales)
                      ? 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border border-[var(--app-ok-line)]'
                      : 'bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600'
                  }`}>
                    {isValidPublishedSource(sources.customerSales) ? '● متصل سحابياً' : '○ غير متصل'}
                  </span>
                  <span className="bg-teal-50 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200 text-[11px] px-2 py-0.5 rounded-lg font-bold border border-teal-200 dark:border-teal-400/35">
                    مبيعات الأصناف وأوامر البيع 2026
                  </span>
                </div>
                <p
                  className="text-xs sm:text-[13px] font-medium text-slate-600 dark:text-slate-300 mt-1 leading-relaxed"
                  title="Customer account · Invoicing name · Sales order · Date · المندوب · الشهر · Warehouse · Item · Name · Quantity · Amount · Item group · Family Dimension"
                >
                  مبيعات الأصناف التفصيلية · 12 عمودًا (عميل، مندوب، صنف، كمية، قيمة، شهر)
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:gap-2.5">
              <div className="bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] px-3 py-2 rounded-xl text-center">
                <div className="text-[11px] text-[var(--app-ok-text)] font-bold">مبيعات 2026 المسجلة</div>
                <MoneyLtr
                  value={metrics.totalSales2026}
                  className="text-sm font-black text-[var(--app-ok-text)] font-mono mt-0.5"
                />
              </div>
              <div className="bg-[var(--app-navy-tint)] border border-[var(--app-navy-line)] px-3 py-2 rounded-xl text-center">
                <div className="text-[11px] text-[var(--app-navy-text)] font-bold">تحصيلات 2026</div>
                <MoneyLtr
                  value={metrics.totalCollections2026}
                  className="text-sm font-black text-[var(--app-navy-text)] font-mono mt-0.5"
                />
              </div>
            </div>
          </div>

          {/* URL Input Form */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label htmlFor="customer-sales-sheet-url" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[var(--app-navy-text)]" />
                <span>رابط Google Sheet الخاص بمبيعات العملاء الشهرية والتحصيل (دمج مباشر بدون تكرار):</span>
              </label>
              {sourceUrls.customerSales && (
                <a
                  href={sourceUrls.customerSales}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--app-navy-text)] hover:underline flex items-center gap-1 font-bold"
                >
                  <span>فتح الشيت في Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Link2 className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="customer-sales-sheet-url"
                  type="text"
                  dir="ltr"
                  value={sourceUrls.customerSales}
                  onChange={(e) => setSourceUrls((prev) => ({ ...prev, customerSales: e.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full h-11 pr-10 pl-3 bg-white dark:bg-[#0b1926] border border-slate-300 dark:border-slate-600 rounded-xl text-[12px] sm:text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] font-medium text-left"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSaveUrl('customerSales')}
                className="h-10 w-full sm:w-auto px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition active:scale-[0.98] shadow-sm bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-white disabled:opacity-50"
              >
                {savedUrlNotice === 'customerSales' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>تم حفظ الرابط ✓</span>
                  </>
                ) : (
                  <span>حفظ الرابط دائماً</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSyncCustomerSales()}
                disabled={syncingKey === 'customerSales' || !sourceUrls.customerSales.trim()}
                className="h-10 w-full sm:w-auto px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shrink-0 cursor-pointer transition active:scale-[0.98] bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-500/20 dark:hover:bg-blue-500/30 dark:text-blue-200 dark:border-blue-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncingKey === 'customerSales' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري دمج المبيعات...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>مزامنة سحابية وتحديث فوري</span>
                  </>
                )}
              </button>
              </div>
            </div>

            {/* Notifications */}
            {sheetSuccess.customerSales && (
              <div className="p-3 bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] text-[var(--app-ok-text)] rounded-xl text-xs flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-[var(--app-ok-text)] shrink-0" />
                <span>{sheetSuccess.customerSales}</span>
              </div>
            )}
            {sheetErrors.customerSales && (
              <div className="p-3 bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] text-[var(--app-risk-text)] rounded-xl text-xs flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-[var(--app-risk-text)] shrink-0" />
                <span>{sheetErrors.customerSales}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-xs">
            <div className="flex w-full sm:w-auto items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputSalesRef.current?.click()}
                className="h-10 w-full sm:w-auto justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 font-bold px-3.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                <span>رفع ملف إكسل لمبيعات العملاء (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={downloadCustomerAnalyticsTemplate}
                className="h-10 w-full sm:w-auto justify-center text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white font-bold px-3.5 rounded-xl border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-300" />
                <span>تحميل قالب مبيعات العملاء والتحليل</span>
              </button>
            </div>

            <div className="flex w-full sm:w-auto items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => exportCustomerAnalyticsToExcel(customers, 'تقرير_مبيعات_كافة_العملاء_2026')}
                className="h-10 w-full sm:w-auto justify-center bg-[#0f2b38] hover:bg-[#153847] dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold px-4 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-sky-300" />
                <span>تصدير إكسل (مبيعات العملاء)</span>
              </button>
            </div>
          </div>
        </div>

        {/* ---------------- CARD 3: Products, Inventory & Prices (شيت الأصناف والمخزون والأسعار) ---------------- */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5 hover:border-[var(--app-accent)] transition duration-200">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] border border-[var(--app-navy-line)] flex items-center justify-center font-black shrink-0">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    3. شيت الأصناف والمخزون وقوائم الأسعار
                  </h3>
                  <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${
                    isValidPublishedSource(sources.products)
                      ? 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border border-[var(--app-ok-line)]'
                      : 'bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600'
                  }`}>
                    {isValidPublishedSource(sources.products) ? '● متصل سحابياً' : '○ غير متصل'}
                  </span>
                  <span className="bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] border border-[var(--app-navy-line)] text-[11px] px-2 py-0.5 rounded-lg font-bold">
                    الكتالوج والمخازن والكرتونة
                  </span>
                </div>
                <p className="text-xs sm:text-[13px] font-medium text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  كتالوج المنتجات، أسعار الكرتونة والقطعة، رصيد الفروع ومخزن أكتوبر المركزي، وروابط الصور
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="bg-[var(--app-navy-tint)] border border-[var(--app-navy-line)] px-3.5 py-2 rounded-xl text-center">
                <div className="text-[11px] text-[var(--app-navy-text)] font-bold">الأصناف المسجلة</div>
                <div className="text-sm font-black text-[var(--app-navy-text)] font-mono tabular-nums mt-0.5">
                  {metrics.totalProducts.toLocaleString('en-US')} صنف
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-center">
                <div className="text-[11px] text-slate-600 dark:text-slate-300 font-bold">إجمالي الكراتين المتاحة</div>
                <div className="text-sm font-black text-slate-900 font-mono tabular-nums mt-0.5">
                  {metrics.totalCartons.toLocaleString('en-US')} كرتونة
                </div>
              </div>
            </div>
          </div>

          {/* URL Input Form */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label htmlFor="products-sheet-url" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[var(--app-navy-text)]" />
                <span>رابط Google Sheet الخاص بالأصناف والمخزون والأسعار:</span>
              </label>
              {sourceUrls.products && (
                <a
                  href={sourceUrls.products}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--app-navy-text)] hover:underline flex items-center gap-1 font-bold"
                >
                  <span>فتح الشيت في Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="products-sheet-url"
                  type="text"
                  value={sourceUrls.products}
                  onChange={(e) => setSourceUrls((prev) => ({ ...prev, products: e.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full h-11 pr-10 pl-3 bg-white dark:bg-[#0b1926] border border-slate-300 dark:border-slate-600 rounded-xl text-xs sm:text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSaveUrl('products')}
                className="bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                {savedUrlNotice === 'products' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-sky-300" />
                    <span>تم حفظ الرابط ✓</span>
                  </>
                ) : (
                  <span>حفظ الرابط دائماً</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSyncProducts()}
                disabled={syncingKey === 'products' || !sourceUrls.products.trim()}
                className="bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm shrink-0 cursor-pointer disabled:opacity-50"
              >
                {syncingKey === 'products' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري التحديث...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>مزامنة سحابية فورية</span>
                  </>
                )}
              </button>
            </div>

            {/* Notifications */}
            {sheetSuccess.products && (
              <div className="p-3 bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] text-[var(--app-ok-text)] rounded-xl text-xs flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-[var(--app-ok-text)] shrink-0" />
                <span>{sheetSuccess.products}</span>
              </div>
            )}
            {sheetErrors.products && (
              <div className="p-3 bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] text-[var(--app-risk-text)] rounded-xl text-xs flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-[var(--app-risk-text)] shrink-0" />
                <span>{sheetErrors.products}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputProductsRef.current?.click()}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                <span>رفع ملف إكسل للأصناف والمخزون (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={generateSampleExcelTemplate}
                className="text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white font-bold px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-300" />
                <span>تحميل نموذج أصناف معتمد</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => exportProductsToExcel(products, selectedBranchFilter)}
              className="bg-[#0f2b38] hover:bg-[#153847] dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-sky-300" />
              <span>تصدير المخزون الحالي ({products.length} صنف)</span>
            </button>
          </div>
        </div>

        {/* ---------------- CARD 4: Sales Rep Targets & Collections (شيت أهداف ومبيعات المناديب) ---------------- */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5 hover:border-[var(--app-accent)] transition duration-200">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] border border-[var(--app-navy-line)] flex items-center justify-center font-black shrink-0">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    4. شيت أهداف ومبيعات وتحصيلات المناديب
                  </h3>
                  <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${
                    isValidPublishedSource(sources.targets)
                      ? 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border border-[var(--app-ok-line)]'
                      : 'bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600'
                  }`}>
                    {isValidPublishedSource(sources.targets) ? '● متصل سحابياً' : '○ غير متصل'}
                  </span>
                  <span className="bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] border border-[var(--app-navy-line)] text-[11px] px-2 py-0.5 rounded-lg font-bold">
                    تارجت المناديب والمشرفين
                  </span>
                </div>
                <p className="text-xs sm:text-[13px] font-medium text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  تارجت المبيعات والتحصيل الشهري والربع سنوي لكل مندوب ومشرف، والمحققات الفعلية ونسب الإنجاز
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="bg-[var(--app-navy-tint)] border border-[var(--app-navy-line)] px-3.5 py-2 rounded-xl text-center">
                <div className="text-[11px] text-[var(--app-navy-text)] font-bold">سجلات الأهداف</div>
                <div className="text-sm font-black text-[var(--app-navy-text)] font-mono tabular-nums mt-0.5">
                  {metrics.totalTargets.toLocaleString('en-US')} سجل
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-center">
                <div className="text-[11px] text-slate-600 dark:text-slate-300 font-bold">إجمالي مستهدف المبيعات</div>
                <div className="text-sm font-black text-slate-900 font-mono tabular-nums mt-0.5">
                  {formatCurrency(metrics.totalTargetSales)}
                </div>
              </div>
            </div>
          </div>

          {/* URL Input Form */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label htmlFor="targets-sheet-url" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[var(--app-navy-text)]" />
                <span>رابط Google Sheet الخاص بأهداف ومبيعات المناديب:</span>
              </label>
              {sourceUrls.targets && (
                <a
                  href={sourceUrls.targets}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--app-navy-text)] hover:underline flex items-center gap-1 font-bold"
                >
                  <span>فتح الشيت في Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="targets-sheet-url"
                  type="text"
                  value={sourceUrls.targets}
                  onChange={(e) => setSourceUrls((prev) => ({ ...prev, targets: e.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full h-11 pr-10 pl-3 bg-white dark:bg-[#0b1926] border border-slate-300 dark:border-slate-600 rounded-xl text-xs sm:text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSaveUrl('targets')}
                className="bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                {savedUrlNotice === 'targets' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-sky-300" />
                    <span>تم حفظ الرابط ✓</span>
                  </>
                ) : (
                  <span>حفظ الرابط دائماً</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSyncTargets()}
                disabled={syncingKey === 'targets' || !sourceUrls.targets.trim()}
                className="bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm shrink-0 cursor-pointer disabled:opacity-50"
              >
                {syncingKey === 'targets' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري التحديث...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>مزامنة سحابية فورية</span>
                  </>
                )}
              </button>
            </div>

            {/* Notifications */}
            {sheetSuccess.targets && (
              <div className="p-3 bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] text-[var(--app-ok-text)] rounded-xl text-xs flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-[var(--app-ok-text)] shrink-0" />
                <span>{sheetSuccess.targets}</span>
              </div>
            )}
            {sheetErrors.targets && (
              <div className="p-3 bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] text-[var(--app-risk-text)] rounded-xl text-xs flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-[var(--app-risk-text)] shrink-0" />
                <span>{sheetErrors.targets}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputTargetsRef.current?.click()}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                <span>رفع ملف إكسل للأهداف (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={generateSampleCustomerTargetTemplate}
                className="text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white font-bold px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-300" />
                <span>تحميل نموذج أهداف معتمد</span>
              </button>
            </div>

            <button
              type="button"
              onClick={exportTargetsReport}
              className="bg-[var(--app-primary)] hover:bg-[var(--app-primary-hover)] text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-sky-200" />
              <span>تصدير تقرير أهداف المناديب ({targets.length})</span>
            </button>
          </div>
        </div>

        {/* ---------------- CARD 5: Promotional Offers & Discounts (شيت العروض الترويجية والخصومات) ---------------- */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5 hover:border-[var(--app-accent)] transition duration-200">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] border border-[var(--app-risk-line)] flex items-center justify-center font-black shrink-0">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    5. شيت العروض الترويجية والخصومات
                  </h3>
                  <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${
                    isValidPublishedSource(sources.offers)
                      ? 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border border-[var(--app-ok-line)]'
                      : 'bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600'
                  }`}>
                    {isValidPublishedSource(sources.offers) ? '● متصل سحابياً' : '○ غير متصل'}
                  </span>
                  <span className="bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] border border-[var(--app-risk-line)] text-[11px] px-2 py-0.5 rounded-lg font-bold">
                    الأسعار الترويجية الفورية
                  </span>
                </div>
                <p className="text-xs sm:text-[13px] font-medium text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  عروض المنتجات الترويجية، الأسعار المخفضة، وجدول العروض والخصومات الفورية المطبقة بالكتالوج والفواتير
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] px-3.5 py-2 rounded-xl text-center">
                <div className="text-[11px] text-[var(--app-risk-text)] font-bold">العروض النشطة بالكتالوج</div>
                <div className="text-sm font-black text-[var(--app-risk-text)] font-mono tabular-nums mt-0.5">
                  {metrics.activeOffersCount} عرض مفعل
                </div>
              </div>
            </div>
          </div>

          {/* URL Input Form */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label htmlFor="offers-sheet-url" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[var(--app-risk-text)]" />
                <span>رابط Google Sheet الخاص بجدول العروض والخصومات الترويجية:</span>
              </label>
              {sourceUrls.offers && (
                <a
                  href={sourceUrls.offers}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--app-risk-text)] hover:underline flex items-center gap-1 font-bold"
                >
                  <span>فتح الشيت في Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="offers-sheet-url"
                  type="text"
                  value={sourceUrls.offers}
                  onChange={(e) => setSourceUrls((prev) => ({ ...prev, offers: e.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full h-11 pr-10 pl-3 bg-white dark:bg-[#0b1926] border border-slate-300 dark:border-slate-600 rounded-xl text-xs sm:text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSaveUrl('offers')}
                className="bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                {savedUrlNotice === 'offers' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-sky-300" />
                    <span>تم حفظ الرابط ✓</span>
                  </>
                ) : (
                  <span>حفظ الرابط دائماً</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSyncOffers()}
                disabled={syncingKey === 'offers' || !sourceUrls.offers.trim()}
                className="bg-rose-600 hover:bg-rose-700 text-white font-black px-5 py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-md shrink-0 cursor-pointer disabled:bg-slate-300 disabled:text-slate-600 dark:disabled:bg-slate-800 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {syncingKey === 'offers' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري التحديث...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>تطبيق ومزامنة العروض</span>
                  </>
                )}
              </button>
            </div>

            {/* Notifications */}
            {sheetSuccess.offers && (
              <div className="p-3 bg-[var(--app-ok-tint)] border border-[var(--app-ok-line)] text-[var(--app-ok-text)] rounded-xl text-xs flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-[var(--app-ok-text)] shrink-0" />
                <span>{sheetSuccess.offers}</span>
              </div>
            )}
            {sheetErrors.offers && (
              <div className="p-3 bg-[var(--app-risk-tint)] border border-[var(--app-risk-line)] text-[var(--app-risk-text)] rounded-xl text-xs flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-[var(--app-risk-text)] shrink-0" />
                <span>{sheetErrors.offers}</span>
              </div>
            )}
          </div>
        </div>

      {/* Quick Recognized Columns Reference */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-sm space-y-4 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 dark:border-slate-700 pb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-sky-300 shrink-0" />
            <h4 className="font-black text-sm sm:text-base text-white">
              الأعمدة الأساسية المقروءة والمدعومة تلقائياً في الشيتات الخمس:
            </h4>
          </div>
          <span className="text-xs text-sky-200 font-semibold">
            تطابق ذكي فوري مع أسماء الأعمدة العربية والإنجليزية
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="bg-white/10 p-4 rounded-2xl border border-white/15 space-y-2">
            <strong className="text-sky-300 block font-black text-sm">شيت العملاء والمديونيات:</strong>
            <p className="text-slate-100 text-xs font-medium leading-6">
              كود العميل، اسم العميل، الفرع، اسم المندوب، المشرف، المنطقة، رقم الهاتف، المديونية الحالية، الحد الائتماني، حالة الدين، صلاحية التعامل.
            </p>
          </div>

          <div className="bg-white/10 p-4 rounded-2xl border border-white/15 space-y-2">
            <strong className="text-sky-300 block font-black text-sm">شيت مبيعات العملاء والتارجت:</strong>
            <p className="text-slate-100 text-xs font-medium leading-6">
              كود العميل، اسم العميل، مبيعات 2026، مبيعات 2025، نسبة النمو %، تحصيلات 2026، مبيعات الشهور 1 إلى 12، تحصيلات الشهور 1 إلى 12، تارجت العميل.
            </p>
          </div>

          <div className="bg-white/10 p-4 rounded-2xl border border-white/15 space-y-2">
            <strong className="text-sky-300 block font-black text-sm">شيت الأصناف والمخزون:</strong>
            <p className="text-slate-100 text-xs font-medium leading-6">
              الكود الموحد، كود المنتج، اسم المنتج، الحجم، عدد القطع بالكرتونة، سعر الكرتونة، سعر القطعة، رصيد الفروع (المنيا، الفيوم، البحيرة...)، مخزون أكتوبر، لينك الصورة.
            </p>
          </div>
        </div>
      </div>

      {/* Advanced Collapsible Utility: Google Drive Folder Scanner */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setIsDriveScannerOpen(!isDriveScannerOpen)}
          className="w-full p-5 flex items-center justify-between text-right font-black text-xs sm:text-sm text-slate-800 hover:bg-slate-50 transition cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200">
              <FolderOpen className="w-4 h-4" />
            </div>
            <span>أداة مساعدة: استخراج روابط صور الأصناف من Google Drive تلقائياً (Apps Script)</span>
          </div>
          {isDriveScannerOpen ? <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-300" />}
        </button>

        {isDriveScannerOpen && (
          <div className="p-6 bg-slate-50 border-t border-slate-200 space-y-4 text-xs animate-in fade-in">
            <p className="text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
              إذا كانت لديك صور الأصناف مخزنة في مجلد Google Drive، يمكنك استخدام هذا السكربت المجاني داخل Google Sheets (من قائمة Extensions ⬅️ Apps Script) ليقوم بجلب كل الصور وتوليد روابط مباشرة لها ووضعها في شيت الإكسل:
            </p>

            <div className="relative">
              <pre className="bg-slate-950 text-sky-300 p-4 rounded-2xl overflow-x-auto text-xs font-mono leading-relaxed" dir="ltr">
                {sampleAppsScript}
              </pre>
              <button
                type="button"
                onClick={handleCopyScript}
                className="absolute top-3 left-3 bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                {copiedScript ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-sky-300" />
                    <span>تم النسخ ✓</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ الكود</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Wipe Confirmation Modal */}
      {isWipeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] border border-[var(--app-risk-line)] flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-slate-900">تأكيد مسح وتصفير كافة البيانات</h3>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                هل أنت متأكد من رغبتك في مسح كافة المنتجات والصور الحالية؟ سيتم تفريغ النظام لتتمكن من رفع شيت الإكسل الجديد الخاص بك من البداية.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wipeInvoicesToo}
                  onChange={(e) => setWipeInvoicesToo(e.target.checked)}
                  className="rounded text-[var(--app-accent)] focus:ring-[var(--app-accent)] w-4 h-4"
                />
                <span>مسح سجل الفواتير والطلبيات السابقة أيضاً</span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsWipeModalOpen(false)}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold flex-1 py-2.5 text-xs rounded-xl cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={async () => {
                  setIsWiping(true);
                  try {
                    await wipeAllProductsAndData({ wipeInvoices: wipeInvoicesToo });
                    setIsWipeModalOpen(false);
                    setSheetSuccess((prev) => ({
                      ...prev,
                      products: 'تم مسح الأصناف والبيانات بنجاح! يمكنك الآن إعادة المزامنة من الشيتات السحابية.'
                    }));
                  } finally {
                    setIsWiping(false);
                  }
                }}
                disabled={isWiping}
                className="bg-[var(--app-risk)] hover:opacity-90 text-white font-bold flex-1 py-2.5 text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isWiping ? 'جاري المسح...' : 'نعم، مسح والبدء من جديد'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
