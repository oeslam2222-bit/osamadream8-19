import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  HelpCircle,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Target,
  Trash2,
  Upload,
  Users,
  Wallet,
  BarChart3,
  DollarSign,
  Package,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  fetchCustomersFromGoogleSheetUrl,
  fetchAndParseGoogleSheet,
  parseExcelProducts,
  parseExcelCustomers,
  buildInvoiceExcelWorkbook,
  exportInvoiceToExcel,
  exportCustomerTargetSheetToExcel,
  exportProductsToExcel,
} from '../services/excelService';
import { fetchTargetsFromGoogleSheetUrl } from '../services/targetService';
import { parsePromotionsFromGoogleSheet } from '../services/promotionService';
import { formatCurrency } from '../services/invoiceService';
import { getPublishedDataSources, savePublishedDataSources, isValidPublishedSource } from '../services/dataSourceService';

type SheetKey = 'customers' | 'products' | 'targets' | 'offers' | 'sales';

const SHEET_META: Record<
  SheetKey,
  { icon: React.ReactNode; title: string; description: string; color: string; colorLight: string }
> = {
  customers: {
    icon: <Users className="w-5 h-5" />,
    title: 'شيت العملاء والمديونيات',
    description: 'قاعدة العملاء، المديونيات، الحد الائتماني، وتارجت العملاء',
    color: 'text-emerald-600 bg-emerald-50',
    colorLight: 'bg-emerald-50 border-emerald-200',
  },
  products: {
    icon: <FileSpreadsheet className="w-5 h-5" />,
    title: 'شيت الأصناف والمخزون',
    description: 'رصيد المنتجات، الأسعار، المخزون، الروابط، و19 عمود معتمد',
    color: 'text-blue-600 bg-blue-50',
    colorLight: 'bg-blue-50 border-blue-200',
  },
  targets: {
    icon: <Target className="w-5 h-5" />,
    title: 'شيت الأهداف والتحصيل',
    description: 'تارجت المناديب، مبيعات الشهرية، تحصيلات شهرية، وفواتير العملاء',
    color: 'text-amber-600 bg-amber-50',
    colorLight: 'bg-amber-50 border-amber-200',
  },
  offers: {
    icon: <BarChart3 className="w-5 h-5" />,
    title: 'شيت العروض والخصومات',
    description: 'عروض المنتجات الترويجية، أسعار مخفضة، وجدول العروض الفورية',
    color: 'text-rose-600 bg-rose-50',
    colorLight: 'bg-rose-50 border-rose-200',
  },
  sales: {
    icon: <DollarSign className="w-5 h-5" />,
    title: 'شيت مبيعات العملاء',
    description: 'تاريخ المبيعات والتحصيلات لكل عميل بالتقسيم الشهري',
    color: 'text-purple-600 bg-purple-50',
    colorLight: 'bg-purple-50 border-purple-200',
  },
};

const EMPTY_SOURCE = { url: '', enabled: false, updatedAt: '', kind: 'google_sheets' as const };

export const ExcelImportExport: React.FC = () => {
  const {
    currentUser,
    customers,
    products,
    targets,
    importCustomersList,
    importProductsList,
    users,
  } = useApp();

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  if (!isAdmin) {
    return (
      <div className="tantawy-screen flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-20 h-20 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-6 shadow-xl">
          <Lock className="w-10 h-10" />
        </div>
        <h3 className="text-xl font-black text-slate-900 mb-2">غير مصرح لك بالدخول</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          صفحة ربط مصادر البيانات (Google Sheets) مقتصرة على <strong>المدير العام (Admin)</strong> و<strong>المطور (Developer)</strong> فقط.
        </p>
      </div>
    );
  }

  const [sources, setSources] = useState<Record<SheetKey, { url: string; enabled: boolean; updatedAt: string }>>(
    () => {
      const saved = getPublishedDataSources();
      return {
        customers: saved.customers,
        products: saved.products,
        targets: saved.targets,
        offers: saved.offers,
        sales: saved.sales_by_customer,
      };
    }
  );

  const [activeSheet, setActiveSheet] = useState<SheetKey>('products');
  const [isSyncing, setIsSyncing] = useState<Record<SheetKey, boolean>>({
    customers: false,
    products: false,
    targets: false,
    offers: false,
    sales: false,
  });
  const [syncStatus, setSyncStatus] = useState<Record<SheetKey, { status: 'idle' | 'success' | 'error'; message: string }>>({
    customers: { status: 'idle', message: '' },
    products: { status: 'idle', message: '' },
    targets: { status: 'idle', message: '' },
    offers: { status: 'idle', message: '' },
    sales: { status: 'idle', message: '' },
  });
  const [preview, setPreview] = useState<{ label: string; count: number; rows: any[] } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [bulkSyncing, setBulkSyncing] = useState(false);

  const connectedCount = Object.values(sources).filter((s) => s.enabled && s.url.trim().startsWith('http')).length;

  const saveAllSources = () => {
    const next = {
      ...sources,
      customers: { ...sources.customers, kind: 'google_sheets' },
      products: { ...sources.products, kind: 'google_sheets' },
      targets: { ...sources.targets, kind: 'google_sheets' },
      offers: { ...sources.offers, kind: 'google_sheets' },
      sales: { ...sources.sales, kind: 'google_sheets' },
    } as any;
    savePublishedDataSources(next);
    setSources((prev) => ({
      ...prev,
      customers: { ...prev.customers, updatedAt: new Date().toISOString() },
      products: { ...prev.products, updatedAt: new Date().toISOString() },
      targets: { ...prev.targets, updatedAt: new Date().toISOString() },
      offers: { ...prev.offers, updatedAt: new Date().toISOString() },
      sales: { ...prev.sales, updatedAt: new Date().toISOString() },
    }));
  };

  const updateSource = (key: SheetKey, patch: Partial<{ url: string; enabled: boolean }>) => {
    setSources((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleSyncSheet = async (key: SheetKey) => {
    const src = sources[key];
    if (!src.url.trim()) {
      setSyncStatus((prev) => ({ ...prev, [key]: { status: 'error', message: 'يرجى إضافة رابط Google Sheet أولاً' } }));
      return;
    }
    setIsSyncing((prev) => ({ ...prev, [key]: true }));
    setSyncStatus((prev) => ({ ...prev, [key]: { status: 'idle', message: 'جاري المزامنة...' } }));

    try {
      if (key === 'customers') {
        const res = await fetchCustomersFromGoogleSheetUrl(src.url);
        if (res.customers.length > 0) {
          const result = await importCustomersList(res.customers, 'replace');
          setSyncStatus((prev) => ({ ...prev, [key]: { status: 'success', message: result.message || `تم مزامنة ${res.customers.length} عميل بنجاح` } }));
          setPreview({ label: 'العملاء', count: res.customers.length, rows: res.customers });
          setShowPreview(true);
        } else {
          setSyncStatus((prev) => ({ ...prev, [key]: { status: 'error', message: res.errors?.[0] || 'لا توجد بيانات عملاء في الشيت' } }));
        }
      } else if (key === 'products') {
        const res = await fetchAndParseGoogleSheet(src.url);
        if (res.products.length > 0) {
          importProductsList(res.products, 'replace');
          setSyncStatus((prev) => ({ ...prev, [key]: { status: 'success', message: `تم مزامنة ${res.products.length} صنف بنجاح` } }));
          setPreview({ label: 'الأصناف', count: res.products.length, rows: res.products });
          setShowPreview(true);
        } else {
          setSyncStatus((prev) => ({ ...prev, [key]: { status: 'error', message: res.errors?.[0] || 'لا توجد أصناف في الشيت' } }));
        }
      } else if (key === 'targets') {
        const parsed = await fetchTargetsFromGoogleSheetUrl(src.url);
        if (parsed.length > 0) {
          setSyncStatus((prev) => ({ ...prev, [key]: { status: 'success', message: `تم مزامنة ${parsed.length} هدف بنجاح` } }));
          setPreview({ label: 'الأهداف', count: parsed.length, rows: parsed });
          setShowPreview(true);
        } else {
          setSyncStatus((prev) => ({ ...prev, [key]: { status: 'error', message: 'لا توجد أهداف في الشيت' } }));
        }
      } else if (key === 'offers') {
        const res = await parsePromotionsFromGoogleSheet(src.url);
        if (res.promotions.length > 0) {
          setSyncStatus((prev) => ({ ...prev, [key]: { status: 'success', message: `تم مزامنة ${res.promotions.length} عرض ترويجي بنجاح` } }));
          setPreview({ label: 'العروض', count: res.promotions.length, rows: res.promotions });
          setShowPreview(true);
        } else {
          setSyncStatus((prev) => ({ ...prev, [key]: { status: 'error', message: res.message || 'لا توجد عروض في الشيت' } }));
        }
      } else if (key === 'sales') {
        const res = await fetchAndParseGoogleSheet(src.url);
        if (res.products.length > 0) {
          setSyncStatus((prev) => ({ ...prev, [key]: { status: 'success', message: `تم مزامنة ${res.products.length} سجل مبيعات بنجاح` } }));
          setPreview({ label: 'مبيعات العملاء', count: res.products.length, rows: res.products });
          setShowPreview(true);
        } else {
          setSyncStatus((prev) => ({ ...prev, [key]: { status: 'error', message: res.errors?.[0] || 'لا توجد مبيعات في الشيت' } }));
        }
      }
    } catch (err: any) {
      setSyncStatus((prev) => ({ ...prev, [key]: { status: 'error', message: err?.message || 'حدث خطأ أثناء المزامنة' } }));
    } finally {
      setIsSyncing((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleBulkSync = async () => {
    const enabledSheets = Object.entries(sources).filter(([, s]) => s.enabled && s.url.trim().startsWith('http'));
    if (enabledSheets.length === 0) {
      setSyncStatus((prev) => ({ ...prev, customers: { status: 'error', message: 'لا يوجد شيتات مفعلة للمزامنة الشاملة' } }));
      return;
    }
    setBulkSyncing(true);
    for (const [key] of enabledSheets) {
      await handleSyncSheet(key as SheetKey);
    }
    setBulkSyncing(false);
  };

  const clearStatus = (key: SheetKey) => {
    setSyncStatus((prev) => ({ ...prev, [key]: { status: 'idle', message: '' } }));
  };

  const meta = SHEET_META[activeSheet];
  const src = sources[activeSheet];
  const isConnected = isValidPublishedSource({ ...src, kind: 'google_sheets' });

  return (
    <div className="tantawy-screen space-y-6 pb-16" dir="rtl">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 rounded-3xl p-6 sm:p-10 shadow-2xl border border-emerald-500/10 text-white">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-500/10 blur-3xl rounded-full" />
        <div className="absolute -bottom-28 -right-28 w-80 h-80 bg-cyan-500/10 blur-3xl rounded-full" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight">مركز مزامنة Google Sheets</h2>
              <p className="text-sm sm:text-base text-slate-200 mt-2 leading-relaxed max-w-2xl">
                ضع الروابط الخمسة فقط، فعّل الشيتات، واضغط "مزامنة الجميع". هذه الشيتات هي <span className="text-emerald-300 font-bold">المصدر الوحيد للبيانات</span>، يتم استبدالها بالكامل مع كل مزامنة دون تكرار أو ازدواجية.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 border border-white/15">قاعدة العملاء</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 border border-white/15">شيت المنتجات والمخزون</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 border border-white/15">شيت التارجت</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 border border-white/15">شيت العروض</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 border border-white/15">شيت مبيعات العملاء</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center justify-center gap-3 bg-white/10 px-5 py-3 rounded-2xl border border-white/15">
              <span className={`w-2.5 h-2.5 rounded-full ${connectedCount === 5 ? 'bg-emerald-400 shadow-[0_0_0_6px_rgba(52,211,153,0.12)]' : connectedCount > 0 ? 'bg-amber-400 shadow-[0_0_0_6px_rgba(251,191,36,0.12)]' : 'bg-slate-400'}`} />
              <span className="text-sm font-black">{connectedCount} / 5 شيت جاهز للمزامنة</span>
            </div>
            <button
              onClick={handleBulkSync}
              disabled={bulkSyncing}
              className={`group relative overflow-hidden px-8 py-3.5 rounded-2xl font-black text-base transition shadow-xl ${bulkSyncing ? 'opacity-70 cursor-not-allowed bg-slate-600' : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-emerald-500/25'}`}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {bulkSyncing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>جاري مزامنة الجميع...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                    <span>مزامنة الجميع دفعة واحدة</span>
                  </>
                )}
              </span>
              {!bulkSyncing && <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />}
            </button>
          </div>
        </div>
      </div>

      {/* Sheets Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {(Object.keys(SHEET_META) as SheetKey[]).map((key) => {
          const m = SHEET_META[key];
          const s = sources[key];
          const status = syncStatus[key];
          const syncing = isSyncing[key];
          const connected = s.enabled && s.url.trim().startsWith('http');
          return (
            <div
              key={key}
              className="group bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-slate-900/5 transition-all duration-300 overflow-hidden"
            >
              <div className="p-5 sm:p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${m.colorLight}`}>
                      {m.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-black text-slate-900">{m.title}</h3>
                        {connected && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">مفعل</span>}
                        {status.status === 'success' && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            تم التحديث
                          </span>
                        )}
                        {status.status === 'error' && (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            خطأ
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => clearStatus(key)}
                    className="text-slate-300 hover:text-slate-600 transition p-1.5 rounded-xl hover:bg-slate-50"
                    title="مسح الرسالة"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600">رابط Google Sheets</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        dir="ltr"
                        type="url"
                        value={s.url}
                        onChange={(e) => updateSource(key, { url: e.target.value })}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 py-3 pr-4 pl-12 text-sm font-mono focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/5 outline-none transition"
                      />
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center">
                        <Globe className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSource(key, { enabled: !s.enabled })}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border transition text-sm font-bold ${s.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {s.enabled ? (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>مفعل</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-4 h-4" />
                          <span>معطل</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleSyncSheet(key)}
                      disabled={syncing || !s.url.trim()}
                      className={`flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-black transition disabled:opacity-50 disabled:cursor-not-allowed ${syncing ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-900/10'}`}
                    >
                      {syncing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جاري التحميل...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          <span>مزامنة</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {status.message && (
                  <div className={`p-3 rounded-2xl text-sm font-bold flex items-center gap-2 border ${status.status === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'}`}>
                    {status.status === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span className="leading-relaxed">{status.message}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Action Bar */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-slate-400" />
            <span className="text-sm font-black text-slate-800">مصدر بيانات واحد للجميع</span>
          </div>
          <button
            onClick={saveAllSources}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800 transition flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            <span>حفظ جميع الروابط</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
            <div className="text-[10px] font-bold text-slate-500 mb-1">العملاء</div>
            <div className="text-2xl font-black text-slate-900">{customers.length}</div>
            <div className="text-[11px] text-slate-400 mt-1">عميل في قاعدة البيانات</div>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
            <div className="text-[10px] font-bold text-slate-500 mb-1">الأصناف</div>
            <div className="text-2xl font-black text-slate-900">{products.length}</div>
            <div className="text-[11px] text-slate-400 mt-1">صنف في الكتالوج</div>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
            <div className="text-[10px] font-bold text-slate-500 mb-1">الأهداف</div>
            <div className="text-2xl font-black text-slate-900">{targets.length}</div>
            <div className="text-[11px] text-slate-400 mt-1">هدف مبيعات وتحصيل</div>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
            <div className="text-[10px] font-bold text-slate-500 mb-1">المندوبون</div>
            <div className="text-2xl font-black text-slate-900">{users.filter((u) => u.role === 'sales_rep' || u.role === 'supervisor').length}</div>
            <div className="text-[11px] text-slate-400 mt-1">مندوب ومشرف نشط</div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && preview && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <h4 className="font-black text-slate-900">معاينة {preview.label} ({preview.count} سجل)</h4>
              </div>
              <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900 text-white font-bold sticky top-0">
                    <tr>
                      {Object.keys(preview.rows[0] || {}).map((h, i) => (
                        <th key={i} className="p-3 border-l border-slate-700 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.slice(0, 100).map((row, r) => (
                      <tr key={r} className="hover:bg-slate-50/50">
                        {Object.values(row).map((v, i) => (
                          <td key={i} className="p-3 border-l border-slate-200 truncate max-w-[200px]">
                            {v == null ? '—' : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {preview.rows.length > 100 && (
                      <tr>
                        <td colSpan={Object.keys(preview.rows[0] || {}).length} className="p-4 text-center text-slate-400 text-xs">
                          معروضة أول 100 سجل من {preview.count} سجل (للإ Preview فقط)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 100 && (
                <div className="mt-3 text-xs text-slate-500 text-center">
                  لمعاينة جميع السجلات افتح شيت Google Sheets مباشرة.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
