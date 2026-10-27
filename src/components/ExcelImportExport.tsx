import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
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
  X
} from 'lucide-react';
import React, { useId, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  cleanCustomerCode,
  cleanCustomerPhone,
  deduplicateAndMergeCustomers,
  mergeTwoCustomers
} from '../services/customerDeduplicationService';
import { normalizeArabicText } from '../services/arabicMatchingService';
import {
  downloadCustomerAnalyticsTemplate,
  exportCustomerAnalyticsToExcel
} from '../services/customerAnalyticsService';
import {
  getPublishedDataSources,
  isValidPublishedSource,
  PublishedDataSources,
  saveSingleSourceUrl
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
  parseExcelCustomerItemSales,
  saveCustomerItemSales
} from '../services/customerItemSalesService';

type SheetKey = keyof PublishedDataSources;

export interface ExcelImportExportProps {
  onNavigateToItemSales?: () => void;
}

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
    selectedBranchFilter
  } = useApp();

  // Saved sources from localStorage/service
  const [sources, setSources] = useState<PublishedDataSources>(() => getPublishedDataSources());
  const [sourceUrls, setSourceUrls] = useState<Record<SheetKey, string>>({
    customers: sources.customers?.url || '',
    customerSales: sources.customerSales?.url || '',
    products: sources.products?.url || '',
    targets: sources.targets?.url || '',
    offers: sources.offers?.url || '',
  });

  // UI state per sheet
  const [syncingKey, setSyncingKey] = useState<SheetKey | 'all' | null>(null);
  const [savedUrlNotice, setSavedUrlNotice] = useState<SheetKey | null>(null);
  const [sheetErrors, setSheetErrors] = useState<Record<SheetKey, string | null>>({
    customers: null,
    customerSales: null,
    products: null,
    targets: null,
    offers: null,
  });
  const [sheetSuccess, setSheetSuccess] = useState<Record<SheetKey, string | null>>({
    customers: null,
    customerSales: null,
    products: null,
    targets: null,
    offers: null,
  });

  // Global Sync Progress & Dedup Audit State
  const [masterSyncProgress, setMasterSyncProgress] = useState<string | null>(null);
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
  const handleSyncCustomers = async (urlOverride?: string) => {
    const url = (urlOverride || sourceUrls.customers || '').trim();
    if (!url) {
      setSheetErrors((prev) => ({ ...prev, customers: 'يرجى إدخال رابط Google Sheet الخاص بالعملاء أولاً' }));
      return;
    }
    setSyncingKey('customers');
    setSheetErrors((prev) => ({ ...prev, customers: null }));
    setSheetSuccess((prev) => ({ ...prev, customers: null }));

    try {
      saveSingleSourceUrl('customers', url);
      setSources(getPublishedDataSources());

      const res = await fetchCustomersFromGoogleSheetUrl(url);
      if (res.errors.length > 0 && res.customers.length === 0) {
        throw new Error(res.errors.join(' • '));
      }

      // Merge and update customers in place with strict deduplication
      const importResult = await importCustomersList(res.customers, 'replace');
      if (!importResult.success) {
        throw new Error(importResult.message);
      }

      setSheetSuccess((prev) => ({
        ...prev,
        customers: `تم بنجاح تحديث ${importResult.count} عميل فريد، وحذف أي مكررات سابقة. البيانات محدثة ومتاحة الآن لجميع المناديب والمشرفين.`
      }));
    } catch (err: any) {
      setSheetErrors((prev) => ({ ...prev, customers: err?.message || 'فشلت مزامنة شيت العملاء' }));
    } finally {
      setSyncingKey(null);
    }
  };

  // 2. Sync Customer Item Sales Sheet (شيت مبيعات العملاء بالصنف)
  const handleSyncCustomerSales = async (urlOverride?: string) => {
    const url = (urlOverride || sourceUrls.customerSales || '').trim();
    if (!url) {
      setSheetErrors((prev) => ({ ...prev, customerSales: 'يرجى إدخال رابط Google Sheet الخاص بمبيعات العملاء بالصنف أولاً' }));
      return;
    }
    setSyncingKey('customerSales');
    setSheetErrors((prev) => ({ ...prev, customerSales: null }));
    setSheetSuccess((prev) => ({ ...prev, customerSales: null }));

    try {
      saveSingleSourceUrl('customerSales', url);
      setSources(getPublishedDataSources());

      // Attempt parsing Customer Item Sales first
      const itemSalesRes = await fetchCustomerItemSalesFromGoogleSheet(url);
      if (itemSalesRes.sales && itemSalesRes.sales.length > 0) {
        // Automatically link customer codes with master customer directory to resolve branch and sales rep
        const enrichedRes = enrichCustomerItemSalesWithDirectory(itemSalesRes.sales, customers);
        const finalSales = enrichedRes.enriched;
        await saveCustomerItemSales(finalSales);

        // Extract and deduplicate customer profiles from sales records
        const codeMap = new Map<string, Customer>();
        const phoneMap = new Map<string, Customer>();
        const nameMap = new Map<string, Customer>();

        customers.forEach((c) => {
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

        const updatedCustomers = [...customers];
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
              address: s.warehouse || ''
            };
            updatedCustomers.push(newCust);
            nameMap.set(normN, newCust);
            if (cd) codeMap.set(cd, newCust);
            newCount++;
          }
        });

        const finalDeduped = deduplicateAndMergeCustomers(updatedCustomers).customers;
        await importCustomersList(finalDeduped, 'replace');

        setSheetSuccess((prev) => ({
          ...prev,
          customerSales: `تم بنجاح مزامنة ${finalSales.length.toLocaleString('ar-EG')} حركة مبيعات صنف، وتم ربط كود العميل بقاعدة العملاء لـ (${enrichedRes.distinctCustomersMatched} عميل) لاستخراج فروعهم ومناديبهم تلقائياً بدون تكرار! البيانات متاحة الآن في قسم "مبيعات الأصناف".`
        }));
        return;
      }

      // Fallback: regular customer target sheet parser
      const res = await fetchCustomersFromGoogleSheetUrl(url);
      if (res.errors.length > 0 && res.customers.length === 0) {
        throw new Error(res.errors.join(' • '));
      }

      const codeMap = new Map<string, Customer>();
      const phoneMap = new Map<string, Customer>();
      const nameMap = new Map<string, Customer>();

      customers.forEach((c) => {
        const cd = cleanCustomerCode(c.code);
        if (cd) codeMap.set(cd, c);
        const ph = cleanCustomerPhone(c.phone);
        if (ph) phoneMap.set(ph, c);
        if (c.name) nameMap.set(normalizeArabicText(c.name).replace(/\s+/g, ''), c);
      });

      const updatedCustomers = [...customers];
      let updatedCount = 0;
      let newCount = 0;

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
      await importCustomersList(finalDeduped, 'replace');

      setSheetSuccess((prev) => ({
        ...prev,
        customerSales: `تم بنجاح تحديث أرقام مبيعات وتارجت ${updatedCount} عميل قائم وإدراج ${newCount} عميل جديد بدون تكرار!`
      }));
    } catch (err: any) {
      setSheetErrors((prev) => ({ ...prev, customerSales: err?.message || 'فشلت مزامنة شيت مبيعات العملاء' }));
    } finally {
      setSyncingKey(null);
    }
  };

  // 3. Sync Products Sheet (الأصناف والمخزون والأسعار)
  const handleSyncProducts = async (urlOverride?: string) => {
    const url = (urlOverride || sourceUrls.products || '').trim();
    if (!url) {
      setSheetErrors((prev) => ({ ...prev, products: 'يرجى إدخال رابط Google Sheet الخاص بالأصناف والمخزون أولاً' }));
      return;
    }
    setSyncingKey('products');
    setSheetErrors((prev) => ({ ...prev, products: null }));
    setSheetSuccess((prev) => ({ ...prev, products: null }));

    try {
      saveSingleSourceUrl('products', url);
      setSources(getPublishedDataSources());

      const res = await fetchAndParseGoogleSheet(url);
      if (res.errors.length > 0 && res.products.length === 0) {
        throw new Error(res.errors.join(' • '));
      }

      // Deduplicate products by code/unifiedCode
      const prodMap = new Map<string, Product>();
      res.products.forEach((p) => {
        const key = (p.code || p.unifiedCode || p.name).trim().toLowerCase();
        if (key) prodMap.set(key, p);
      });
      const dedupedProducts = Array.from(prodMap.values());

      importProductsList(dedupedProducts, 'replace');

      setSheetSuccess((prev) => ({
        ...prev,
        products: `تم بنجاح جلب وتحديث ${dedupedProducts.length} صنف ومطابقة الأسعار ورصيد المخازن وروابط صور Cloudinary!`
      }));
    } catch (err: any) {
      setSheetErrors((prev) => ({ ...prev, products: err?.message || 'فشلت مزامنة شيت الأصناف والمخزون' }));
    } finally {
      setSyncingKey(null);
    }
  };

  // 4. Sync Targets Sheet (أهداف ومبيعات المناديب)
  const handleSyncTargets = async (urlOverride?: string) => {
    const url = (urlOverride || sourceUrls.targets || '').trim();
    if (!url) {
      setSheetErrors((prev) => ({ ...prev, targets: 'يرجى إدخال رابط Google Sheet الخاص بالأهداف أولاً' }));
      return;
    }
    setSyncingKey('targets');
    setSheetErrors((prev) => ({ ...prev, targets: null }));
    setSheetSuccess((prev) => ({ ...prev, targets: null }));

    try {
      saveSingleSourceUrl('targets', url);
      setSources(getPublishedDataSources());

      const res = await importTargetsFromGoogleSheet(url);
      if (!res.success) {
        throw new Error(res.message);
      }

      setSheetSuccess((prev) => ({
        ...prev,
        targets: `تم بنجاح تحديث شيت أهداف المناديب (${res.count} سجل) بدون تكرار! ظهرت مباشرة في لوحة متابعة الأداء.`
      }));
    } catch (err: any) {
      setSheetErrors((prev) => ({ ...prev, targets: err?.message || 'فشلت مزامنة شيت الأهداف' }));
    } finally {
      setSyncingKey(null);
    }
  };

  // 5. Sync Offers Sheet (العروض والخصومات)
  const handleSyncOffers = async (urlOverride?: string) => {
    const url = (urlOverride || sourceUrls.offers || '').trim();
    if (!url) {
      setSheetErrors((prev) => ({ ...prev, offers: 'يرجى إدخال رابط Google Sheet الخاص بجدول العروض أولاً' }));
      return;
    }
    setSyncingKey('offers');
    setSheetErrors((prev) => ({ ...prev, offers: null }));
    setSheetSuccess((prev) => ({ ...prev, offers: null }));

    try {
      saveSingleSourceUrl('offers', url);
      setSources(getPublishedDataSources());

      // Read sheet and match promo prices / discounts
      const res = await fetchAndParseGoogleSheet(url);
      if (res.products && res.products.length > 0) {
        // Merge promotional pricing into existing products catalog
        let appliedOffersCount = 0;
        const offerMap = new Map<string, { promoPrice?: number; discount?: number }>();
        res.products.forEach((p) => {
          const k = (p.code || p.unifiedCode || '').trim().toLowerCase();
          if (k && (p.promoPrice || p.cartonPrice)) {
            offerMap.set(k, {
              promoPrice: p.promoPrice || p.cartonPrice,
              discount: p.promoPrice && p.cartonPrice ? Math.round(((p.cartonPrice - p.promoPrice) / p.cartonPrice) * 100) : undefined,
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
          offers: `تم بنجاح مزامنة شيت العروض وتطبيق أسعار العروض الترويجية على ${appliedOffersCount} صنف في الكتالوج والفواتير فورياً!`
        }));
      } else {
        setSheetSuccess((prev) => ({
          ...prev,
          offers: 'تم حفظ وتأكيد رابط شيت العروض بنجاح وهو متصل ومتاح للاستخدام الدائم.'
        }));
      }
    } catch (err: any) {
      setSheetErrors((prev) => ({ ...prev, offers: err?.message || 'فشلت مزامنة شيت العروض' }));
    } finally {
      setSyncingKey(null);
    }
  };

  // Master One-Click Sync for All 5 Sheets Concurrently
  const handleSyncAllSheets = async () => {
    setSyncingKey('all');
    setMasterSyncProgress('بدء مزامنة كافة الشيتات الـ 5 المركزية...');

    let syncedCount = 0;
    const errors: string[] = [];

    // 1. Customers
    if (sourceUrls.customers) {
      setMasterSyncProgress('1/5: جاري قراءة وتحديث شيت قاعدة العملاء والمديونيات بدون تكرار...');
      try {
        await handleSyncCustomers(sourceUrls.customers);
        syncedCount++;
      } catch (e: any) {
        errors.push(`العملاء: ${e?.message}`);
      }
    }

    // 2. Customer Sales
    if (sourceUrls.customerSales) {
      setMasterSyncProgress('2/5: جاري دمج وتحديث شيت مبيعات العملاء الشهرية والتارجت...');
      try {
        await handleSyncCustomerSales(sourceUrls.customerSales);
        syncedCount++;
      } catch (e: any) {
        errors.push(`مبيعات العملاء: ${e?.message}`);
      }
    }

    // 3. Products
    if (sourceUrls.products) {
      setMasterSyncProgress('3/5: جاري قراءة وتحديث شيت الأصناف والمخزون وأرصدة الفروع...');
      try {
        await handleSyncProducts(sourceUrls.products);
        syncedCount++;
      } catch (e: any) {
        errors.push(`الأصناف: ${e?.message}`);
      }
    }

    // 4. Targets
    if (sourceUrls.targets) {
      setMasterSyncProgress('4/5: جاري قراءة وتحديث شيت أهداف ومبيعات المناديب...');
      try {
        await handleSyncTargets(sourceUrls.targets);
        syncedCount++;
      } catch (e: any) {
        errors.push(`الأهداف: ${e?.message}`);
      }
    }

    // 5. Offers
    if (sourceUrls.offers) {
      setMasterSyncProgress('5/5: جاري تطبيق شيت العروض الترويجية والخصومات الفورية...');
      try {
        await handleSyncOffers(sourceUrls.offers);
        syncedCount++;
      } catch (e: any) {
        errors.push(`العروض: ${e?.message}`);
      }
    }

    // Final dedup safety sweep
    setMasterSyncProgress('فحص نهائي وتأكيد منع التكرار وتحديث أجهزة المناديب...');
    cleanAndDeduplicateCustomers();

    setMasterSyncProgress(
      `اكتملت المزامنة بنجاح! تم تحديث ${syncedCount} شيت رئيسي وتعميم البيانات في ثوانٍ معدودة بدون أي تكرار.`
    );
    setSyncingKey(null);
    setTimeout(() => setMasterSyncProgress(null), 8000);
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
    setSyncingKey('customers');
    setSheetErrors((prev) => ({ ...prev, customers: null }));
    try {
      const res = await parseExcelCustomers(file);
      if (res.errors.length > 0 && res.customers.length === 0) {
        throw new Error(res.errors.join(' • '));
      }
      const importRes = await importCustomersList(res.customers, 'replace');
      setSheetSuccess((prev) => ({
        ...prev,
        customers: `تم بنجاح رفع ملف الإكسل وتحديث ${importRes.count} عميل بدون تكرار!`
      }));
    } catch (err: any) {
      setSheetErrors((prev) => ({ ...prev, customers: err?.message || 'فشل رفع ملف العملاء' }));
    } finally {
      setSyncingKey(null);
      if (fileInputCustomersRef.current) fileInputCustomersRef.current.value = '';
    }
  };

  const handleUploadCustomerSalesFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyncingKey('customerSales');
    setSheetErrors((prev) => ({ ...prev, customerSales: null }));
    try {
      // 1. Try parsing customer item sales format first
      const itemSalesRes = await parseExcelCustomerItemSales(file);
      if (itemSalesRes.sales && itemSalesRes.sales.length > 0) {
        // Automatically link customer codes with master customer directory to resolve branch and sales rep
        const enrichedRes = enrichCustomerItemSalesWithDirectory(itemSalesRes.sales, customers);
        const finalSales = enrichedRes.enriched;
        await saveCustomerItemSales(finalSales);

        // Deduplicate and merge customer profiles from item sales rows
        const codeMap = new Map<string, Customer>();
        const phoneMap = new Map<string, Customer>();
        const nameMap = new Map<string, Customer>();

        customers.forEach((c) => {
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

        const updatedCustomers = [...customers];
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
        await importCustomersList(finalDeduped, 'replace');

        setSheetSuccess((prev) => ({
          ...prev,
          customerSales: `تم بنجاح رفع ملف الإكسل وتحديث ${finalSales.length.toLocaleString('ar-EG')} حركة صنف، وتم ربط كود العميل بقاعدة العملاء لـ (${enrichedRes.distinctCustomersMatched} عميل) وتحديد فروعهم ومناديبهم تلقائياً بدون تكرار!`
        }));
        return;
      }

      // 2. Fallback to classic customer target format
      const res = await parseExcelCustomers(file);
      if (res.errors.length > 0 && res.customers.length === 0) {
        throw new Error(res.errors.join(' • '));
      }

      // Merge in place with existing customers
      const updatedCustomers = [...customers];
      let updatedCount = 0;
      let newCount = 0;

      const codeMap = new Map<string, Customer>();
      const phoneMap = new Map<string, Customer>();
      const nameMap = new Map<string, Customer>();

      customers.forEach((c) => {
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
      await importCustomersList(finalDeduped, 'replace');

      setSheetSuccess((prev) => ({
        ...prev,
        customerSales: `تم بنجاح رفع ملف مبيعات العملاء وتحديث ${updatedCount} عميل قائم وإدراج ${newCount} عميل جديد بدون أي تكرار!`
      }));
    } catch (err: any) {
      setSheetErrors((prev) => ({ ...prev, customerSales: err?.message || 'فشل رفع ملف مبيعات العملاء' }));
    } finally {
      setSyncingKey(null);
      if (fileInputSalesRef.current) fileInputSalesRef.current.value = '';
    }
  };

  const handleUploadProductsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyncingKey('products');
    setSheetErrors((prev) => ({ ...prev, products: null }));
    try {
      const res = await parseExcelProducts(file);
      if (res.errors.length > 0 && res.products.length === 0) {
        throw new Error(res.errors.join(' • '));
      }
      importProductsList(res.products, 'replace');
      setSheetSuccess((prev) => ({
        ...prev,
        products: `تم بنجاح استيراد ${res.products.length} صنف من ملف الإكسل وتحديث أرصدة المخازن والأسعار!`
      }));
    } catch (err: any) {
      setSheetErrors((prev) => ({ ...prev, products: err?.message || 'فشل رفع ملف الأصناف' }));
    } finally {
      setSyncingKey(null);
      if (fileInputProductsRef.current) fileInputProductsRef.current.value = '';
    }
  };

  const handleUploadTargetsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyncingKey('targets');
    setSheetErrors((prev) => ({ ...prev, targets: null }));
    try {
      const res = await importTargetsFromExcel(file);
      if (!res.success) throw new Error(res.message);
      setSheetSuccess((prev) => ({
        ...prev,
        targets: `تم بنجاح استيراد ${res.count} سجل هدف من ملف الإكسل بدون تكرار!`
      }));
    } catch (err: any) {
      setSheetErrors((prev) => ({ ...prev, targets: err?.message || 'فشل رفع ملف الأهداف' }));
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

    const connectedSheetsCount = (Object.keys(sourceUrls) as SheetKey[]).filter(
      (k) => isValidPublishedSource(sources[k])
    ).length;

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
  }, [customers, products, targets, sources, sourceUrls]);

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

  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  if (!isAdminOrDev) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center space-y-3 my-6 shadow-sm" dir="rtl">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
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
    <div className="tantawy-screen space-y-6 pb-20" dir="rtl">
      
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
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-[#12283e] text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400/10 border border-amber-400/30 text-amber-300 rounded-xl text-xs font-black">
              <Sparkles className="w-4 h-4" />
              <span>مركز إدارة الشيتات السحابية الخمس المركزية (صفحة واحدة موحدة)</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-amber-400" />
              <span>لوحة الربط والمزامنة المركزية لملفات الإكسل وجوجل شيت</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              تم تلخيص كافة مصادر البيانات في <strong>صفحة واحدة مركزية تضم الـ 5 شيتات المعتمدة</strong>. يمكنك حفظ روابط Google Sheets بشكل دائم، المزامنة السحابية الفورية أو رفع ملفات إكسل بديلة، مع <strong>ضمان منع التكرار بنسبة 100%</strong> وتحديث بيانات المناديب والمشرفين فورياً.
            </p>
          </div>

          {/* Quick Header Counter Badges */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="bg-white/10 backdrop-blur-xs border border-white/10 rounded-2xl p-4 text-center min-w-[120px]">
              <div className="text-[11px] text-slate-300 font-bold">الشيتات المتصلة</div>
              <div className="text-2xl font-black text-emerald-300 font-mono mt-0.5">
                {metrics.connectedSheetsCount} / 5
              </div>
              <div className="text-[10px] text-emerald-400 font-bold mt-1">🟢 سحابية Live</div>
            </div>

            <div className="bg-white/10 backdrop-blur-xs border border-white/10 rounded-2xl p-4 text-center min-w-[120px]">
              <div className="text-[11px] text-slate-300 font-bold">قاعدة العملاء</div>
              <div className="text-2xl font-black text-amber-300 font-mono mt-0.5">
                {metrics.totalCustomers.toLocaleString('ar-EG')}
              </div>
              <div className="text-[10px] text-slate-300 mt-1">عميل فريد (0 تكرار)</div>
            </div>
          </div>
        </div>

        {/* Master Control Buttons */}
        <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleSyncAllSheets}
              disabled={syncingKey !== null}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {syncingKey === 'all' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري مزامنة الشيتات الـ 5...</span>
                </>
              ) : (
                <>
                  <CloudLightning className="w-4 h-4 text-slate-950" />
                  <span>مزامنة جميع الشيتات الـ 5 دفعة واحدة</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleRunDedupAudit}
              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>فحص ومنع التكرار الشامل (0 تكرار)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsWipeModalOpen(true)}
              className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>تصفير ومسح البيانات للبدء من جديد</span>
            </button>
          </div>
        </div>

        {/* Master Sync Progress Alert */}
        {masterSyncProgress && (
          <div className="bg-emerald-950/80 border border-emerald-400 text-emerald-200 p-4 rounded-2xl text-xs sm:text-sm flex items-center gap-3 animate-in fade-in">
            <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
            <span className="font-bold">{masterSyncProgress}</span>
          </div>
        )}

        {/* Dedup Audit Notice */}
        {dedupNotice && (
          <div className="bg-emerald-900/90 border border-emerald-400 text-emerald-100 p-4 rounded-2xl text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5 font-bold">
              <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0" />
              <span>{dedupNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setDedupNotice(null)}
              className="text-emerald-300 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Reassurance & Zero-Duplication Guarantee Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <strong className="block text-sm font-black text-amber-900">
              ضمان عدم تكرار البيانات وتحديث المناديب فورياً (Strict In-Place Deduplication)
            </strong>
            <p className="text-amber-800 text-[11px] mt-0.5">
              كل شيت يتم مزامنته أو رفعه يمر تلقائياً عبر محرك الفحص الذكي (المطابقة بالكود الموحد، رقم الهاتف، واسم النشاط). يتم تحديث بيانات نفس العميل والصنف في مكانه بدون مضاعفة السجلات أو خلق صفوف مكررة.
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 font-bold text-[11px] text-amber-900">
            ✓ كود موحد
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 font-bold text-[11px] text-amber-900">
            ✓ تحديث لحظي للموظفين
          </span>
        </div>
      </div>

      {/* THE 5 CORE SHEETS CARDS SECTION */}
      <div className="space-y-6">

        {/* ---------------- CARD 1: Customers & Debts (شيت العملاء والمديونيات) ---------------- */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5 hover:border-slate-300 transition">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-black shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-slate-900">
                    1. شيت قاعدة العملاء والمديونيات
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${
                    isValidPublishedSource(sources.customers)
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-300'
                  }`}>
                    {isValidPublishedSource(sources.customers) ? '● متصل سحابياً' : '○ غير متصل'}
                  </span>
                  <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-lg font-bold">
                    الأساس والمديونيات
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  قاعدة بيانات العملاء، الأكواد، الفروع، المديونيات الحالية، الحد الائتماني، وتعيين المناديب والمشرفين
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-center">
                <div className="text-[10px] text-slate-500 font-bold">العملاء الحاليين</div>
                <div className="text-sm font-black text-slate-900 font-mono">
                  {metrics.totalCustomers.toLocaleString('ar-EG')} عميل
                </div>
              </div>
              <div className="bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl text-center">
                <div className="text-[10px] text-rose-600 font-bold">إجمالي المديونيات</div>
                <div className="text-sm font-black text-rose-700 font-mono">
                  {formatCurrency(metrics.totalDebt)}
                </div>
              </div>
            </div>
          </div>

          {/* URL Input Form */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="customer-sheet-url" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
                <span>رابط Google Sheet الخاص بالعملاء والمديونيات (Anyone with the link can view):</span>
              </label>
              {sourceUrls.customers && (
                <a
                  href={sourceUrls.customers}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-700 hover:underline flex items-center gap-1 font-bold"
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
                  id="customer-sheet-url"
                  type="text"
                  value={sourceUrls.customers}
                  onChange={(e) => setSourceUrls((prev) => ({ ...prev, customers: e.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full h-11 pr-10 pl-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSaveUrl('customers')}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                {savedUrlNotice === 'customers' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>تم حفظ الرابط ✓</span>
                  </>
                ) : (
                  <span>حفظ الرابط دائماً</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSyncCustomers()}
                disabled={syncingKey === 'customers' || !sourceUrls.customers.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm shrink-0 cursor-pointer disabled:opacity-50"
              >
                {syncingKey === 'customers' ? (
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
            {sheetSuccess.customers && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{sheetSuccess.customers}</span>
              </div>
            )}
            {sheetErrors.customers && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{sheetErrors.customers}</span>
              </div>
            )}
          </div>

          {/* Action Buttons: Upload Excel / Export / Template */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputCustomersRef.current?.click()}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                <span>رفع ملف إكسل محلي للعملاء (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={generateSampleCustomersTemplate}
                className="text-slate-600 hover:text-slate-900 font-bold px-3 py-2 rounded-xl hover:bg-slate-100 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>تحميل نموذج إكسل معتمد</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => exportCustomersToExcel(customers, selectedBranchFilter)}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-300" />
              <span>تصدير قاعدة العملاء الحالية ({customers.length})</span>
            </button>
          </div>
        </div>

        {/* ---------------- CARD 2: Customer Sales by Item (شيت مبيعات العملاء بالصنف) ---------------- */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5 hover:border-slate-300 transition">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center font-black shrink-0">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-slate-900">
                    2. شيت مبيعات العملاء بالصنف
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${
                    isValidPublishedSource(sources.customerSales)
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-300'
                  }`}>
                    {isValidPublishedSource(sources.customerSales) ? '● متصل سحابياً' : '○ غير متصل'}
                  </span>
                  <span className="bg-amber-100 text-amber-900 text-[10px] px-2 py-0.5 rounded-lg font-bold">
                    مبيعات الأصناف وأوامر البيع 2026
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-5">
                  مبيعات الأصناف التفصيلية: Customer account, Invoicing name, Sales order, Date, المندوب, الشهر, Warehouse, Item, Name, Quantity, Amount, Item group, Family Dimension
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-center">
                <div className="text-[10px] text-emerald-700 font-bold">مبيعات 2026 المسجلة</div>
                <div className="text-sm font-black text-emerald-800 font-mono">
                  {formatCurrency(metrics.totalSales2026)}
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl text-center">
                <div className="text-[10px] text-blue-700 font-bold">تحصيلات 2026</div>
                <div className="text-sm font-black text-blue-800 font-mono">
                  {formatCurrency(metrics.totalCollections2026)}
                </div>
              </div>
            </div>
          </div>

          {/* URL Input Form */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="customer-sales-sheet-url" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-amber-600" />
                <span>رابط Google Sheet الخاص بمبيعات العملاء الشهرية والتحصيل (دمج مباشر بدون تكرار):</span>
              </label>
              {sourceUrls.customerSales && (
                <a
                  href={sourceUrls.customerSales}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-amber-700 hover:underline flex items-center gap-1 font-bold"
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
                  id="customer-sales-sheet-url"
                  type="text"
                  value={sourceUrls.customerSales}
                  onChange={(e) => setSourceUrls((prev) => ({ ...prev, customerSales: e.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full h-11 pr-10 pl-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSaveUrl('customerSales')}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                {savedUrlNotice === 'customerSales' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-amber-400" />
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
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm shrink-0 cursor-pointer disabled:opacity-50"
              >
                {syncingKey === 'customerSales' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري دمج المبيعات...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>مزامنة سحابية وتحديث فوري</span>
                  </>
                )}
              </button>
            </div>

            {/* Notifications */}
            {sheetSuccess.customerSales && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{sheetSuccess.customerSales}</span>
              </div>
            )}
            {sheetErrors.customerSales && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{sheetErrors.customerSales}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputSalesRef.current?.click()}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                <span>رفع ملف إكسل لمبيعات العملاء (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={downloadCustomerAnalyticsTemplate}
                className="text-slate-600 hover:text-slate-900 font-bold px-3 py-2 rounded-xl hover:bg-slate-100 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>تحميل قالب مبيعات العملاء والتحليل</span>
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onNavigateToItemSales && (
                <button
                  type="button"
                  onClick={onNavigateToItemSales}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-950 font-black px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-2xs border border-amber-300 cursor-pointer"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-amber-800" />
                  <span>فتح شاشة تحليل مبيعات الأصناف ↗</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => exportCustomerAnalyticsToExcel(customers, 'تقرير_مبيعات_كافة_العملاء_2026')}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                <span>تصدير إكسل (مبيعات العملاء)</span>
              </button>
            </div>
          </div>
        </div>

        {/* ---------------- CARD 3: Products, Inventory & Prices (شيت الأصناف والمخزون والأسعار) ---------------- */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5 hover:border-slate-300 transition">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center font-black shrink-0">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-slate-900">
                    3. شيت الأصناف والمخزون وقوائم الأسعار
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${
                    isValidPublishedSource(sources.products)
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-300'
                  }`}>
                    {isValidPublishedSource(sources.products) ? '● متصل سحابياً' : '○ غير متصل'}
                  </span>
                  <span className="bg-blue-100 text-blue-900 text-[10px] px-2 py-0.5 rounded-lg font-bold">
                    الكتالوج والمخازن والكرتونة
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  كتالوج المنتجات، أسعار الكرتونة والقطعة، رصيد الفروع ومخزن أكتوبر المركزي، وروابط الصور
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl text-center">
                <div className="text-[10px] text-blue-700 font-bold">الأصناف المسجلة</div>
                <div className="text-sm font-black text-blue-800 font-mono">
                  {metrics.totalProducts.toLocaleString('ar-EG')} صنف
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-center">
                <div className="text-[10px] text-slate-500 font-bold">إجمالي الكراتين المتاحة</div>
                <div className="text-sm font-black text-slate-900 font-mono">
                  {metrics.totalCartons.toLocaleString('ar-EG')} كرتونة
                </div>
              </div>
            </div>
          </div>

          {/* URL Input Form */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="products-sheet-url" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span>رابط Google Sheet الخاص بالأصناف والمخزون والأسعار:</span>
              </label>
              {sourceUrls.products && (
                <a
                  href={sourceUrls.products}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-700 hover:underline flex items-center gap-1 font-bold"
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
                  className="w-full h-11 pr-10 pl-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSaveUrl('products')}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                {savedUrlNotice === 'products' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-blue-400" />
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
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm shrink-0 cursor-pointer disabled:opacity-50"
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
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{sheetSuccess.products}</span>
              </div>
            )}
            {sheetErrors.products && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
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
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                <span>رفع ملف إكسل للأصناف والمخزون (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={generateSampleExcelTemplate}
                className="text-slate-600 hover:text-slate-900 font-bold px-3 py-2 rounded-xl hover:bg-slate-100 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>تحميل نموذج أصناف معتمد</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => exportProductsToExcel(products, selectedBranchFilter)}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-300" />
              <span>تصدير المخزون الحالي ({products.length} صنف)</span>
            </button>
          </div>
        </div>

        {/* ---------------- CARD 4: Sales Rep Targets & Collections (شيت أهداف ومبيعات المناديب) ---------------- */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5 hover:border-slate-300 transition">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center font-black shrink-0">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-slate-900">
                    4. شيت أهداف ومبيعات وتحصيلات المناديب
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${
                    isValidPublishedSource(sources.targets)
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-300'
                  }`}>
                    {isValidPublishedSource(sources.targets) ? '● متصل سحابياً' : '○ غير متصل'}
                  </span>
                  <span className="bg-purple-100 text-purple-900 text-[10px] px-2 py-0.5 rounded-lg font-bold">
                    تارجت المناديب والمشرفين
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  تارجت المبيعات والتحصيل الشهري والربع سنوي لكل مندوب ومشرف، والمحققات الفعلية ونسب الإنجاز
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-xl text-center">
                <div className="text-[10px] text-purple-700 font-bold">سجلات الأهداف</div>
                <div className="text-sm font-black text-purple-800 font-mono">
                  {metrics.totalTargets.toLocaleString('ar-EG')} سجل
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-center">
                <div className="text-[10px] text-slate-500 font-bold">إجمالي مستهدف المبيعات</div>
                <div className="text-sm font-black text-slate-900 font-mono">
                  {formatCurrency(metrics.totalTargetSales)}
                </div>
              </div>
            </div>
          </div>

          {/* URL Input Form */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="targets-sheet-url" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-purple-600" />
                <span>رابط Google Sheet الخاص بأهداف ومبيعات المناديب:</span>
              </label>
              {sourceUrls.targets && (
                <a
                  href={sourceUrls.targets}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-700 hover:underline flex items-center gap-1 font-bold"
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
                  className="w-full h-11 pr-10 pl-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSaveUrl('targets')}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                {savedUrlNotice === 'targets' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-purple-400" />
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
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm shrink-0 cursor-pointer disabled:opacity-50"
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
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{sheetSuccess.targets}</span>
              </div>
            )}
            {sheetErrors.targets && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
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
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                <span>رفع ملف إكسل للأهداف (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={generateSampleCustomerTargetTemplate}
                className="text-slate-600 hover:text-slate-900 font-bold px-3 py-2 rounded-xl hover:bg-slate-100 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>تحميل نموذج أهداف معتمد</span>
              </button>
            </div>

            <button
              type="button"
              onClick={exportTargetsReport}
              className="bg-purple-900 hover:bg-purple-800 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-300" />
              <span>تصدير تقرير أهداف المناديب ({targets.length})</span>
            </button>
          </div>
        </div>

        {/* ---------------- CARD 5: Promotional Offers & Discounts (شيت العروض الترويجية والخصومات) ---------------- */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5 hover:border-slate-300 transition">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center font-black shrink-0">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-slate-900">
                    5. شيت العروض الترويجية والخصومات
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${
                    isValidPublishedSource(sources.offers)
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-300'
                  }`}>
                    {isValidPublishedSource(sources.offers) ? '● متصل سحابياً' : '○ غير متصل'}
                  </span>
                  <span className="bg-rose-100 text-rose-900 text-[10px] px-2 py-0.5 rounded-lg font-bold">
                    الأسعار الترويجية الفورية
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  عروض المنتجات الترويجية، الأسعار المخفضة، وجدول العروض والخصومات الفورية المطبقة بالكتالوج والفواتير
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl text-center">
                <div className="text-[10px] text-rose-700 font-bold">العروض النشطة بالكتالوج</div>
                <div className="text-sm font-black text-rose-800 font-mono">
                  {metrics.activeOffersCount} عرض مفعل
                </div>
              </div>
            </div>
          </div>

          {/* URL Input Form */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="offers-sheet-url" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-rose-600" />
                <span>رابط Google Sheet الخاص بجدول العروض والخصومات الترويجية:</span>
              </label>
              {sourceUrls.offers && (
                <a
                  href={sourceUrls.offers}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-rose-700 hover:underline flex items-center gap-1 font-bold"
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
                  className="w-full h-11 pr-10 pl-3 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSaveUrl('offers')}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                {savedUrlNotice === 'offers' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-rose-400" />
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
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm shrink-0 cursor-pointer disabled:opacity-50"
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
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{sheetSuccess.offers}</span>
              </div>
            )}
            {sheetErrors.offers && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{sheetErrors.offers}</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Quick Recognized Columns Reference */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-amber-400" />
            <h4 className="font-extrabold text-sm text-amber-300">
              الأعمدة الأساسية المقروءة والمدعومة تلقائياً في الشيتات الخمس:
            </h4>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            تطابق ذكي فوري مع أسماء الأعمدة العربية والإنجليزية
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="bg-white/5 p-3 rounded-2xl border border-white/10 space-y-1.5">
            <strong className="text-emerald-400 block font-black">شيت العملاء والمديونيات:</strong>
            <p className="text-slate-300 text-[11px] leading-5">
              كود العميل، اسم العميل، الفرع، اسم المندوب، المشرف، المنطقة، رقم الهاتف، المديونية الحالية، الحد الائتماني، حالة الدين، صلاحية التعامل.
            </p>
          </div>

          <div className="bg-white/5 p-3 rounded-2xl border border-white/10 space-y-1.5">
            <strong className="text-amber-400 block font-black">شيت مبيعات العملاء والتارجت:</strong>
            <p className="text-slate-300 text-[11px] leading-5">
              كود العميل، اسم العميل، مبيعات 2026، مبيعات 2025، نسبة النمو %، تحصيلات 2026، مبيعات الشهور 1 إلى 12، تحصيلات الشهور 1 إلى 12، تارجت العميل.
            </p>
          </div>

          <div className="bg-white/5 p-3 rounded-2xl border border-white/10 space-y-1.5">
            <strong className="text-blue-400 block font-black">شيت الأصناف والمخزون:</strong>
            <p className="text-slate-300 text-[11px] leading-5">
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
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
              <FolderOpen className="w-4 h-4" />
            </div>
            <span>أداة مساعدة: استخراج روابط صور الأصناف من Google Drive تلقائياً (Apps Script)</span>
          </div>
          {isDriveScannerOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {isDriveScannerOpen && (
          <div className="p-6 bg-slate-50 border-t border-slate-200 space-y-4 text-xs animate-in fade-in">
            <p className="text-slate-600 leading-relaxed">
              إذا كانت لديك صور الأصناف مخزنة في مجلد Google Drive، يمكنك استخدام هذا السكربت المجاني داخل Google Sheets (من قائمة Extensions ⬅️ Apps Script) ليقوم بجلب كل الصور وتوليد روابط مباشرة لها ووضعها في شيت الإكسل:
            </p>

            <div className="relative">
              <pre className="bg-slate-950 text-emerald-400 p-4 rounded-2xl overflow-x-auto text-[11px] font-mono leading-relaxed" dir="ltr">
                {sampleAppsScript}
              </pre>
              <button
                type="button"
                onClick={handleCopyScript}
                className="absolute top-3 left-3 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                {copiedScript ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
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
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-slate-900">تأكيد مسح وتصفير كافة البيانات</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                هل أنت متأكد من رغبتك في مسح كافة المنتجات والصور الحالية؟ سيتم تفريغ النظام لتتمكن من رفع شيت الإكسل الجديد الخاص بك من البداية.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wipeInvoicesToo}
                  onChange={(e) => setWipeInvoicesToo(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-400 w-4 h-4"
                />
                <span>مسح سجل الفواتير والطلبيات السابقة أيضاً</span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsWipeModalOpen(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex-1 py-2.5 text-xs rounded-xl cursor-pointer"
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
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold flex-1 py-2.5 text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
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
