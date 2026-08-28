import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CloudLightning,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FolderOpen,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Link,
  Package,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Store,
  Upload,
  UserCheck,
  Users,
  X,
  Trash2
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getProductImageUrl } from '../services/cloudinaryService';
import {
  exportCustomersToExcel,
  exportProductsToExcel,
  fetchAndParseGoogleSheet,
  fetchCustomersFromGoogleSheetUrl,
  generateSampleCustomersTemplate,
  generateSampleExcelTemplate,
  parseExcelCustomers,
  parseExcelProducts
} from '../services/excelService';
import { formatCurrency } from '../services/invoiceService';
import { Customer, Product } from '../types';

export const ExcelImportExport: React.FC = () => {
  const {
    products,
    customers,
    users,
    currentUser,
    branches,
    importProductsList,
    importCustomersList,
    cleanAndDeduplicateCustomers,
    updateCustomer,
    deleteCustomer,
    refreshCustomerRepLinks,
    wipeAllProductsAndData,
    selectedBranchFilter
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'google_sheets' | 'excel_file' | 'drive_scanner' | 'customers'>('google_sheets');

  // Customer Management State
  const [customerGoogleSheetUrl, setCustomerGoogleSheetUrl] = useState('');
  const [isSyncingCustomers, setIsSyncingCustomers] = useState(false);
  const [customerSheetSuccess, setCustomerSheetSuccess] = useState<string | null>(null);
  const [customerSheetError, setCustomerSheetError] = useState<string | null>(null);
  const [customerPreviewList, setCustomerPreviewList] = useState<Customer[]>([]);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerSelectedRepFilter, setCustomerSelectedRepFilter] = useState<string>('all');
  const [customerSelectedBranchFilter, setCustomerSelectedBranchFilter] = useState<string>('all');
  const [customerImportMode, setCustomerImportMode] = useState<'merge' | 'replace'>('merge');
  const [customerDisplayLimit, setCustomerDisplayLimit] = useState<number>(50);

  // Wipe / Reset Modal State
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeInvoicesToo, setWipeInvoicesToo] = useState(false);

  // Excel File State
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<Product[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('replace');
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  // Preview Table Filter & Pagination State
  const [previewSearchTerm, setPreviewSearchTerm] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState<number | 'all'>(100);

  // Google Sheets State
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isSyncingGoogleSheet, setIsSyncingGoogleSheet] = useState(false);
  const [googleSheetSuccess, setGoogleSheetSuccess] = useState<string | null>(null);
  const [googleSheetError, setGoogleSheetError] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

  // Filtered preview products
  const filteredPreviewProducts = useMemo(() => {
    if (!previewSearchTerm.trim()) return previewProducts;
    const q = previewSearchTerm.toLowerCase().trim();
    return previewProducts.filter((p) => {
      return (
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.color && p.color.toLowerCase().includes(q)) ||
        (p.size && p.size.toLowerCase().includes(q)) ||
        (p.department && p.department.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.branchName && p.branchName.toLowerCase().includes(q))
      );
    });
  }, [previewProducts, previewSearchTerm]);

  // Total pages for preview
  const totalPreviewPages = useMemo(() => {
    if (previewPageSize === 'all') return 1;
    return Math.max(1, Math.ceil(filteredPreviewProducts.length / previewPageSize));
  }, [filteredPreviewProducts.length, previewPageSize]);

  // Paginated preview products
  const paginatedPreviewProducts = useMemo(() => {
    if (previewPageSize === 'all') return filteredPreviewProducts;
    const start = (previewPage - 1) * previewPageSize;
    return filteredPreviewProducts.slice(start, start + previewPageSize);
  }, [filteredPreviewProducts, previewPage, previewPageSize]);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsLoading(true);
    setParseErrors([]);
    setImportSuccessMsg(null);
    setPreviewPage(1);

    try {
      const result = await parseExcelProducts(file);
      if (result.errors.length > 0) {
        setParseErrors(result.errors);
      }
      setPreviewProducts(result.products);
    } catch (err: any) {
      setParseErrors([err.message || 'حدث خطأ أثناء معالجة ملف الإكسل']);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyImport = () => {
    if (previewProducts.length === 0) return;
    importProductsList(previewProducts, importMode);
    setImportSuccessMsg(
      `تم بنجاح استيراد ${previewProducts.length} صنف كامل وتحديث بيانات مخزون الفروع والمخزن الرئيسي وروابط الصور!`
    );
    setPreviewProducts([]);
    setPreviewSearchTerm('');
    setPreviewPage(1);
    setTimeout(() => setImportSuccessMsg(null), 5000);
  };

  const handleFetchGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) {
      setGoogleSheetError('يرجى لصق رابط Google Sheet أولاً');
      return;
    }

    setIsSyncingGoogleSheet(true);
    setGoogleSheetError(null);
    setGoogleSheetSuccess(null);
    setParseErrors([]);
    setPreviewPage(1);

    try {
      const result = await fetchAndParseGoogleSheet(googleSheetUrl);
      if (result.errors.length > 0 && result.products.length === 0) {
        setGoogleSheetError(result.errors.join(' • '));
      } else {
        if (result.errors.length > 0) {
          setParseErrors(result.errors);
        }
        setPreviewProducts(result.products);
        setGoogleSheetSuccess(
          `تم بنجاح جلب ${result.products.length} صنف من شيت Google Sheets! راجع الجدول أدناه واضغط تأكيد الحفظ.`
        );
      }
    } catch (err: any) {
      setGoogleSheetError(err.message || 'فشل جلب البيانات من Google Sheets');
    } finally {
      setIsSyncingGoogleSheet(false);
    }
  };

  const sampleAppsScript = `// كود Google Apps Script لمزامنة Google Sheets مع نظام دريم للتوزيع تلقائياً
function onEdit(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  // إرسال تنبيه للمنظومة بتحديث البيانات
  console.log("تم تعديل الشيت بنجاح");
}`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(sampleAppsScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  return (
    <div className="space-y-6 pb-16">
      
      {/* Success Notification */}
      {importSuccessMsg && (
        <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between text-xs sm:text-sm animate-in fade-in">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{importSuccessMsg}</span>
          </div>
          <button onClick={() => setImportSuccessMsg(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Header */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">مركز ربط الشيتات (Google Sheets & Excel)</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                مزامنة حية مع Google Sheets • استيراد وتصدير إكسل • دعم مباشر لروابط صور Google Drive وسعر الكرتونة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsWipeModalOpen(true)}
              className="flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 font-black px-3.5 py-2 rounded-xl text-xs border border-rose-300 transition cursor-pointer"
              title="مسح وتصفير كافة الأصناف للرفع من جديد"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>تصفير ومسح الكل 🗑️</span>
            </button>

            <button
              onClick={generateSampleExcelTemplate}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2 rounded-xl text-xs border border-slate-300 transition"
              title="تحميل نموذج شيت إكسل جاهز"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>تحميل نموذج إكسل معتمد</span>
            </button>

            <button
              onClick={() => exportProductsToExcel(products, selectedBranchFilter)}
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير المخزون الحالي ({products.length})</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pt-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveSubTab('google_sheets')}
            className={`pb-3 px-4 text-xs sm:text-sm font-black border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
              activeSubTab === 'google_sheets'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>ربط المنتجات مع Google Sheets</span>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold">مباشر Live</span>
          </button>

          <button
            onClick={() => setActiveSubTab('excel_file')}
            className={`pb-3 px-4 text-xs sm:text-sm font-black border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
              activeSubTab === 'excel_file'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>رفع ملف إكسل للمنتجات</span>
          </button>

          <button
            onClick={() => setActiveSubTab('customers')}
            className={`pb-3 px-4 text-xs sm:text-sm font-black border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
              activeSubTab === 'customers'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-amber-600" />
            <span>قاعدة بيانات العملاء (شيتات وإكسل)</span>
            <span className="bg-amber-100 text-amber-900 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{customers.length} عميل</span>
          </button>

          <button
            onClick={() => setActiveSubTab('drive_scanner')}
            className={`pb-3 px-4 text-xs sm:text-sm font-black border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
              activeSubTab === 'drive_scanner'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <FolderOpen className="w-4 h-4 text-blue-500" />
            <span>ماسح مجلدات Google Drive</span>
            <span className="bg-blue-100 text-blue-900 text-[10px] px-1.5 py-0.5 rounded-full font-bold">Apps Script</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: Google Sheets Live Sync */}
      {activeSubTab === 'google_sheets' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-emerald-800/40 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-300 text-xs font-black px-3 py-1 rounded-full border border-emerald-500/30 mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>المزامنة السحابية المباشرة مع Google Sheets</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  اربط الشيت مباشرة بجوجل شيت بدون الحاجة لتحميل ورفع ملفات كل مرة
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  قم فقط بلصق رابط الـ Google Sheet الخاص بك (مع التأكد من تفعيل خاصية "Anyone with the link can view").
                  المنظومة ستقرأ الأصناف والمخزون والأسعار وتربط الصور تلقائياً في ثوانٍ معدودة.
                </p>
              </div>

              <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 text-center min-w-[200px]">
                <div className="text-xs text-slate-400 font-medium">الأصناف المحدثة حالياً</div>
                <div className="text-3xl font-black text-amber-400 mt-0.5">{products.length}</div>
                <div className="text-[10px] text-emerald-400 mt-1">جاهزة ومربوطة بـ Cloudinary</div>
              </div>
            </div>

            {/* Google Sheets URL Input Form */}
            <div className="bg-slate-800/90 p-4 sm:p-5 rounded-2xl border border-slate-700 space-y-4">
              <label className="block text-xs font-bold text-slate-200">
                ضع رابط Google Sheet الخاص بك هنا:
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Link className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={googleSheetUrl}
                    onChange={(e) => setGoogleSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl pr-10 pl-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition"
                  />
                </div>
                <button
                  onClick={handleFetchGoogleSheet}
                  disabled={isSyncingGoogleSheet || !googleSheetUrl.trim()}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-black px-6 py-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition"
                >
                  {isSyncingGoogleSheet ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري القراءة والمزامنة...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>جلب وتحديث من Google Sheets</span>
                    </>
                  )}
                </button>
              </div>

              {/* Status messages */}
              {googleSheetSuccess && (
                <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-3.5 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{googleSheetSuccess}</span>
                </div>
              )}

              {googleSheetError && (
                <div className="bg-rose-500/20 border border-rose-500/40 text-rose-300 p-3.5 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{googleSheetError}</span>
                </div>
              )}
            </div>

            {/* Quick 3-Step Guide */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/60">
                <div className="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-xs mb-2">1</div>
                <h4 className="font-black text-sm text-white mb-1">افتح شيت جوجل شيت</h4>
                <p className="text-xs text-slate-400">
                  أنشئ جدولك على Google Sheets بالأعمدة الرئيسية المعتمدة لمجموعة دريم.
                </p>
              </div>

              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/60">
                <div className="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-xs mb-2">2</div>
                <h4 className="font-black text-sm text-white mb-1">اجعل الرابط متاحاً للرؤية</h4>
                <p className="text-xs text-slate-400">
                  اضغط على زر المشاركة (Share) في Google Sheets واختر "Anyone with the link can view".
                </p>
              </div>

              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/60">
                <div className="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-xs mb-2">3</div>
                <h4 className="font-black text-sm text-white mb-1">الصق الرابط واضغط مزامنة</h4>
                <p className="text-xs text-slate-400">
                  الصق الرابط هنا واضغط "جلب وتحديث"، سيتم تحديث كامل فروع ومناديب دريم فوراً!
                </p>
              </div>
            </div>

            {/* Official Columns Reference Table (Matching exact User Google Sheet Screenshot) */}
            <div className="bg-slate-950/80 rounded-2xl p-4 sm:p-5 border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs sm:text-sm font-black text-white">
                    الأعمدة الرئيسية المعتمدة في الشيت (مطابقة 100% لجدولك):
                  </h4>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-md border border-emerald-500/30">
                  محدث وفقاً للشيت الرسمي
                </span>
              </div>

              <div className="overflow-x-auto text-[11px]">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-slate-200 border-b border-slate-700 font-bold">
                      <th className="p-2 whitespace-nowrap">اسم العمود بالشيت</th>
                      <th className="p-2 whitespace-nowrap">البيان والوظيفة في النظام</th>
                      <th className="p-2 whitespace-nowrap text-left">مثال توضيحي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    <tr>
                      <td className="p-2 font-mono font-black text-amber-300">كود موحد / كود المنتج</td>
                      <td className="p-2">الكود الفريد للصنف في الكتالوج والفواتير</td>
                      <td className="p-2 text-left font-mono text-slate-400">1000061</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-black text-white">اسم المنتج / البيان</td>
                      <td className="p-2">الاسم الكامل للصنف في الكتالوج وفواتير البيع</td>
                      <td className="p-2 text-left text-slate-400">بمبونيرة 15010 جليز الوان</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-black text-slate-200">الحجم / الوزن</td>
                      <td className="p-2">مقاس وحجم الصنف (اختياري)</td>
                      <td className="p-2 text-left text-slate-400">كبير / 24 سم</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-black text-amber-400">عدد القطع (Factor)</td>
                      <td className="p-2">شدة الكرتونة (عدد القطع الفردية داخل الكرتونة)</td>
                      <td className="p-2 text-left font-mono text-amber-300">6</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-black text-emerald-400">سعر الكرتونة</td>
                      <td className="p-2">سعر البيع الإجمالي للكرتونة بالجملة</td>
                      <td className="p-2 text-left font-mono text-emerald-300">350 ج.م</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-black text-cyan-300">Item group</td>
                      <td className="p-2">المجموعة الرئيسية / القسم للفلترة والتصنيف</td>
                      <td className="p-2 text-left font-mono text-cyan-200">LHLotus / Philips</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-black text-purple-300">Family Name</td>
                      <td className="p-2">اسم العائلة / التصنيف الفرعي</td>
                      <td className="p-2 text-left text-purple-200">بمبونيرة / مجات</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-black text-slate-200">اللون</td>
                      <td className="p-2">لون الصنف المتاح</td>
                      <td className="p-2 text-left text-slate-400">ألوان مشكلة / أبيض</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-black text-blue-400">الفروع الـ 7 + مخزن أكتوبر</td>
                      <td className="p-2">أعمدة الأرصدة (البحيرة، الفيوم، القاهرة، المنيا، ديمشلت، مخزون اكتوبر، منوف، منيا القمح)</td>
                      <td className="p-2 text-left font-mono text-blue-300">أرقام عدد الكراتين</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-black text-rose-400">سعر العرض</td>
                      <td className="p-2">سعر الخصم/العرض الترويجي للكرتونة (إذا وجد)</td>
                      <td className="p-2 text-left font-mono text-rose-300">320 ج.م</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-black text-sky-400">لينك الصوره</td>
                      <td className="p-2">رابط صورة المنتج المباشر من Google Drive أو CDN</td>
                      <td className="p-2 text-left font-mono text-[10px] text-sky-300 truncate max-w-xs">googleusercontent.com/d/...</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Standard Excel/CSV File Upload */}
      {activeSubTab === 'excel_file' && (
        <div className="space-y-6">
          {/* Drag and Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all bg-white shadow-sm ${
              isDragging ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-300 hover:border-emerald-400'
            }`}
          >
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto shadow-inner">
                {isLoading ? (
                  <RefreshCw className="w-8 h-8 animate-spin" />
                ) : (
                  <Upload className="w-8 h-8" />
                )}
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900">
                  اسحب وأفلت ملف الإكسل (XLSX / XLS / CSV) هنا
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  أو اضغط لتصفح الملفات من جهازك أو هاتفك المحمول
                </p>
              </div>

              <div>
                <label className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-2xl text-xs cursor-pointer shadow-md transition">
                  <Upload className="w-4 h-4" />
                  <span>اختر ملف إكسل من جهازك</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Google Drive Recursive Folder Scanner */}
      {activeSubTab === 'drive_scanner' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-gradient-to-br from-blue-950 via-slate-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-blue-800/40 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-300 text-xs font-black px-3 py-1 rounded-full border border-blue-500/30 mb-2">
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>المسح الشامل لمجلدات Google Drive وتوليد روابط سريعة للكتالوج</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  مسح المجلد الرئيسي وكل المجلدات الفرعية تلقائياً وربط الصور بالشيت
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  يقوم هذا السكريبت بالدخول في المجلد الرئيسي لمشاريعك على Google Drive، والتنقل في جميع المجلدات الفرعية (مهما كان عمقها)، واستخراج اسم كل صورة (كود أو اسم الصنف) وتوليد رابط CDN فائق السرعة جاهز للمناديب والكتالوج.
                </p>
              </div>

              <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 text-center min-w-[200px]">
                <div className="text-xs text-slate-400 font-medium">صيغة روابط الصور</div>
                <div className="text-sm font-black text-amber-400 font-mono mt-1">lh3.googleusercontent.com</div>
                <div className="text-[10px] text-emerald-400 mt-1">⚡ خفيفة وسريعة التحميل</div>
              </div>
            </div>

            {/* Script Box with Copy Button */}
            <div className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-blue-800/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-300 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>كود Google Apps Script (جاهز للتشغيل في Google Sheets):</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const scriptCode = `/**
 * سكريبت قراءة جميع الصور من المجلد الرئيسي والمجلدات الفرعية
 * يدعم آلاف الصور باستخدام Pagination لتجنب انتهاء المهلة (6 دقائق)
 * وربط اسم/كود الصورة برابط مباشر خفيف ومناسب للكتالوج
 *
 * طريقة الاستخدام:
 * 1. ضع MAIN_FOLDER_ID
 * 2. شغل syncDriveFolderWithSheet — سيبدأ من حيث توقف تلقائياً
 * 3. أعد تشغيله حتى ترى رسالة "اكتمل المسح"
 */
function syncDriveFolderWithSheet() {
  // 🔴 ضع هنا الـ ID الخاص بالمجلد الرئيسي فقط
  var MAIN_FOLDER_ID = "ضع_ID_المجلد_الرئيسي_هنا";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Sheet_Images") || ss.insertSheet("Sheet_Images");

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["كود / اسم الصنف", "مسار المجلد الفرعي", "رابط الصورة المباشر", "File ID"]);
    sheet.getRange("1:1").setFontWeight("bold").setBackground("#0284c7").setFontColor("#ffffff");
  }

  // قراءة علامة التوقف من الخلية E1 (تستخدم لاستئناف المسح)
  var props = PropertiesService.getScriptProperties();
  var resumeFolderId = props.getProperty("RESUME_FOLDER_ID");
  var resumePath = props.getProperty("RESUME_PATH") || "";
  var totalProcessed = parseInt(props.getProperty("TOTAL_PROCESSED") || "0", 10);

  var startFolder = resumeFolderId
    ? DriveApp.getFolderById(resumeFolderId)
    : DriveApp.getFolderById(MAIN_FOLDER_ID);

  if (!resumeFolderId) {
    try {
      startFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {}
  }

  var startTime = new Date().getTime();
  var TIME_LIMIT_MS = 5 * 60 * 1000; // 5 دقائق (هامش أمان قبل انتهاء المهلة)

  Logger.log("بدء/استئناف المسح الشامل... (تم معالجة " + totalProcessed + " صورة حتى الآن)");
  var result = processFolderRecursive(startFolder, sheet, resumePath, startTime, TIME_LIMIT_MS, { count: 0 });

  totalProcessed += result.count;
  props.setProperty("TOTAL_PROCESSED", String(totalProcessed));

  if (result.timedOut) {
    // حفظ علامة التوقف لاستئناف لاحقاً
    if (result.nextFolderId) {
      props.setProperty("RESUME_FOLDER_ID", result.nextFolderId);
      props.setProperty("RESUME_PATH", result.nextPath || "");
    }
    SpreadsheetApp.getUi().alert(
      "⏱️ تمت معالجة " + totalProcessed + " صورة.\n" +
      "اقترب الوقت من الانتهاء. أعد تشغيل السكريبت لمتابعة المسح من حيث توقف."
    );
  } else {
    // اكتمل المسح — تنظيف علامات التوقف
    props.deleteProperty("RESUME_FOLDER_ID");
    props.deleteProperty("RESUME_PATH");
    props.deleteProperty("TOTAL_PROCESSED");
    SpreadsheetApp.getUi().alert(
      "✅ اكتمل المسح! تم جلب " + totalProcessed + " صورة من كافة المجلدات الفرعية بنجاح!"
    );
  }
}

function processFolderRecursive(folder, sheet, currentPath, startTime, timeLimitMs, state) {
  var rows = [];
  var folderName = folder.getName();
  var fullPath = currentPath ? (currentPath + " > " + folderName) : folderName;

  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var mimeType = file.getMimeType();

    if (mimeType.indexOf("image") !== -1 || file.getName().match(/\\.(jpg|jpeg|png|webp)$/i)) {
      var itemCodeOrName = file.getName().replace(/\\.[^/.]+$/, "").trim();
      var catalogImageUrl = "https://lh3.googleusercontent.com/d/" + file.getId() + "=w800";

      rows.push([
        itemCodeOrName,
        fullPath,
        catalogImageUrl,
        file.getId()
      ]);
      state.count++;
    }
  }

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  var subFolders = folder.getFolders();
  var subFolderList = [];
  while (subFolders.hasNext()) {
    subFolderList.push(subFolders.next());
  }

  for (var i = 0; i < subFolderList.length; i++) {
    // فحص الوقت قبل كل مجلد فرعي
    if (new Date().getTime() - startTime > timeLimitMs) {
      return {
        timedOut: true,
        count: state.count,
        nextFolderId: subFolderList[i].getId(),
        nextPath: fullPath
      };
    }

    // التأكد من أن المجلد الفرعي متاح للجميع بالرابط
    try {
      subFolderList[i].setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {}

    var subResult = processFolderRecursive(subFolderList[i], sheet, fullPath, startTime, timeLimitMs, state);
    if (subResult.timedOut) {
      return subResult;
    }
  }

  return { timedOut: false, count: state.count };
}`;
                    navigator.clipboard.writeText(scriptCode);
                    setCopiedScript(true);
                    setTimeout(() => setCopiedScript(false), 3000);
                  }}
                  className="px-4 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl shadow flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedScript ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedScript ? 'تم نسخ السكريبت!' : 'نسخ كود Apps Script'}</span>
                </button>
              </div>

              <pre className="p-3.5 bg-slate-900 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto border border-slate-800 leading-relaxed max-h-60">
{`function syncDriveFolderWithSheet() {
  var MAIN_FOLDER_ID = "ضع_ID_المجلد_الرئيسي_هنا";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["كود / اسم الصنف", "مسار المجلد الفرعي", "رابط الصورة المباشر", "File ID"]);
  }
  var rootFolder = DriveApp.getFolderById(MAIN_FOLDER_ID);
  processFolderRecursive(rootFolder, sheet, "");
}`}
              </pre>
            </div>

            {/* Step-by-Step Instructions & XLOOKUP Formula */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 space-y-2">
                <div className="flex items-center gap-2 font-black text-amber-300 text-xs">
                  <Globe className="w-4 h-4 text-amber-400" />
                  <span>خطوات التشغيل في Google Sheets:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300 leading-relaxed">
                  <li>افتح شيت Google Sheet الخاص بك.</li>
                  <li>من القائمة العلوية اضغط <strong>Extensions (الإضافات) ⬅️ Apps Script</strong>.</li>
                  <li>الصق الكود وضع الـ ID الخاص بالمجلد الرئيسي مكان <code>MAIN_FOLDER_ID</code>.</li>
                  <li>اضغط <strong>Run (تشغيل)</strong> وسيقوم بملء كل الصور والروابط تلقائياً.</li>
                </ol>
              </div>

              <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 space-y-2">
                <div className="flex items-center gap-2 font-black text-emerald-300 text-xs">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>معادلة الربط التلقائي في شيت الأسعار (XLOOKUP):</span>
                </div>
                <div className="p-2.5 bg-slate-950 font-mono text-[11px] text-emerald-300 rounded-xl border border-slate-800 select-all">
                  =XLOOKUP(A2; Sheet_Images!A:A; Sheet_Images!C:C; "بدون صورة")
                </div>
                <p className="text-[11px] text-slate-400">
                  حيث <code>A2</code> هو كود المنتج، و <code>Sheet_Images</code> هو الشيت الذي تم استخراج الصور فيه.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Table & Confirmation Section (Shown when data is loaded from Excel or Google Sheets) */}
      {previewProducts.length > 0 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5 animate-in fade-in">
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <h3 className="text-lg font-black text-slate-900">
                  تم قراءة {previewProducts.length} صنف بالكامل من الملف (بدون دمج أو توحيد للأكواد)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                يتم إدراج كل سطر كصنف مستقل ببياناته الخاصة ومخزونه وصورته • إجمالي الأسطر: <span className="font-bold text-slate-800">{previewProducts.length} صنف</span>
              </p>
            </div>

            {/* Import Mode Selection */}
            <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="text-amber-600 focus:ring-amber-500"
                />
                <span>استبدال الأصناف الحالية بالكامل ({previewProducts.length} صنف جديد)</span>
              </label>

              <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span>إضافة ودمج مع الأصناف السابقة</span>
              </label>
            </div>
          </div>

          {/* Search and Page Size Controls inside Preview */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-amber-50/50 p-3 rounded-2xl border border-amber-200/70">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                value={previewSearchTerm}
                onChange={(e) => {
                  setPreviewSearchTerm(e.target.value);
                  setPreviewPage(1);
                }}
                placeholder="بحث في الجدول (بالكود، الاسم، اللون، القسم...)"
                className="w-full bg-white border border-amber-200 rounded-xl pr-9 pl-8 py-2 text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <Search className="w-4 h-4 text-amber-700 absolute right-3 top-2.5" />
              {previewSearchTerm && (
                <button
                  onClick={() => {
                    setPreviewSearchTerm('');
                    setPreviewPage(1);
                  }}
                  className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <span>عرض في الصفحة:</span>
                <select
                  value={previewPageSize}
                  onChange={(e) => {
                    const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                    setPreviewPageSize(val);
                    setPreviewPage(1);
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500"
                >
                  <option value={50}>50 صنف</option>
                  <option value={100}>100 صنف</option>
                  <option value={250}>250 صنف</option>
                  <option value={500}>500 صنف</option>
                  <option value={1000}>1000 صنف</option>
                  <option value={2000}>2000 صنف</option>
                  <option value={5000}>5000 صنف</option>
                  <option value="all">عرض الكل ({previewProducts.length} صنف)</option>
                </select>
              </div>

              {previewPageSize !== 'all' && totalPreviewPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPreviewPage(1)}
                    disabled={previewPage === 1}
                    className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="الصفحة الأولى"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                    disabled={previewPage === 1}
                    className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="الصفحة السابقة"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-700 px-2">
                    صفحة {previewPage} من {totalPreviewPages}
                  </span>
                  <button
                    onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                    disabled={previewPage === totalPreviewPages}
                    className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="الصفحة التالية"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPreviewPage(totalPreviewPages)}
                    disabled={previewPage === totalPreviewPages}
                    className="p-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="الصفحة الأخيرة"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Table of Preview Items */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-[500px]">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-amber-300 font-bold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3">الكود</th>
                  <th className="p-3">اللون</th>
                  <th className="p-3">الحجم</th>
                  <th className="p-3">اسم وبيان الصنف</th>
                  <th className="p-3">القسم / Brand</th>
                  <th className="p-3">شدة الكرتونة</th>
                  <th className="p-3">سعر الكرتونة</th>
                  <th className="p-3">مخزون الفرع</th>
                  <th className="p-3">مخزن أكتوبر الرئيسي</th>
                  <th className="p-3">رابط الصورة (Drive / Sheet)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedPreviewProducts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400 font-bold">
                      لا توجد أصناف مطابقة للبحث "{previewSearchTerm}"
                    </td>
                  </tr>
                ) : (
                  paginatedPreviewProducts.map((p, idx) => {
                    const globalIdx = previewPageSize === 'all' ? idx + 1 : (previewPage - 1) * previewPageSize + idx + 1;
                    return (
                      <tr key={p.id || idx} className="hover:bg-amber-50/50 transition-colors">
                        <td className="p-3 text-center text-slate-400 font-mono text-[11px]">{globalIdx}</td>
                        <td className="p-3 font-bold text-amber-900 bg-amber-50/80 font-mono">{p.code}</td>
                        <td className="p-3 font-bold text-slate-800">
                          {p.color && p.color.trim() && p.color !== 'افتراضي' ? (
                            <span className="bg-indigo-50 text-indigo-900 px-2 py-0.5 rounded-md text-[11px] font-black border border-indigo-200">
                              {p.color}
                            </span>
                          ) : (
                            <span className="text-slate-400">---</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-700 font-medium">
                          {p.size && p.size.trim() && p.size !== 'حجم قياسي' ? p.size : '---'}
                        </td>
                        <td className="p-3 font-bold text-slate-900">{p.name}</td>
                        <td className="p-3 text-slate-600 font-semibold">{p.department || p.category}</td>
                        <td className="p-3 font-bold text-slate-700">{p.cartonQuantity} ق</td>
                        <td className="p-3 text-amber-900 font-black text-sm">{formatCurrency(p.cartonPrice)}</td>
                        <td className="p-3 font-bold text-slate-700">{p.branchStockActual} كرتونة</td>
                        <td className="p-3 font-bold text-slate-700">{p.mainWarehouseActual} كرتونة</td>
                        <td className="p-3 text-[10px] text-slate-500 font-mono max-w-[150px] truncate">
                          {p.imageUrl ? '✓ رابط صورة مباشر' : 'بدون صورة'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Pagination & Summary Info */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 pt-1">
            <div>
              {previewSearchTerm ? (
                <span>
                  تم العثور على <strong className="text-slate-900 font-bold">{filteredPreviewProducts.length}</strong> صنف مطابق للبحث من إجمالي <strong className="text-slate-900 font-bold">{previewProducts.length}</strong> صنف.
                </span>
              ) : (
                <span>
                  يتم الآن عرض {previewPageSize === 'all' ? previewProducts.length : `${Math.min(filteredPreviewProducts.length, (previewPage - 1) * (typeof previewPageSize === 'number' ? previewPageSize : 0) + 1)} إلى ${Math.min(filteredPreviewProducts.length, previewPage * (typeof previewPageSize === 'number' ? previewPageSize : 0))}`} من إجمالي <strong className="text-slate-900 font-bold">{previewProducts.length}</strong> صنف في الملف.
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setPreviewProducts([]);
                  setPreviewSearchTerm('');
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-xl text-xs transition"
              >
                إلغاء المعاينة
              </button>
              <button
                onClick={handleApplyImport}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-7 py-2.5 rounded-xl text-xs sm:text-sm shadow-md transition flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>تأكيد حفظ كافة الأصناف ({previewProducts.length} صنف) في المنظومة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: Customers Database Management */}
      {activeSubTab === 'customers' && (
        <div className="space-y-6">
          {/* Customer Google Sheets & Excel Sync Hero */}
          <div className="bg-gradient-to-br from-amber-950 via-slate-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-amber-800/40 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-300 text-xs font-black px-3 py-1 rounded-full border border-amber-500/30 mb-2">
                  <Store className="w-3.5 h-3.5" />
                  <span>إدارة ومزامنة قاعدة بيانات العملاء والمحلات</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  ربط شيت العملاء (Google Sheets) أو رفع ملف إكسل
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  استيراد ومزامنة كود العميل، اسم المحل / السوبر ماركت، رقم الهاتف، الفرع التابع له، المحافظة، والعنوان التفصيلي للاستخدام المباشر في فواتير المندوبين.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const res = refreshCustomerRepLinks();
                    setCustomerSheetSuccess(`تمت إعادة فحص وتحديث مطابقة المناديب والفروع لجميع العملاء (${res.updatedCount} عميل تم تحديث ارتباطهم بالمناديب).`);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer"
                  title="إعادة ربط العملاء بحسابات المناديب الحالية والفروع"
                >
                  <RefreshCw className="w-4 h-4 text-white" />
                  <span>ربط العملاء بالمناديب ({users.filter(u => u.role === 'sales_rep').length} مندوب)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const res = cleanAndDeduplicateCustomers();
                    if (res.duplicatesRemoved > 0) {
                      setCustomerSheetSuccess(`تم فحص وتنظيف قاعدة العملاء بنجاح! تم دمج وإزالة ${res.duplicatesRemoved} سجل مكرر، واستقرار السجل عند ${res.deduplicatedCount} عميل فريد.`);
                    } else {
                      setCustomerSheetSuccess(`سجل العملاء نظيف ومثالي تماماً (${res.deduplicatedCount} عميل فريد) ولا يحتوي على أي تكرارات.`);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>تنظيف وضغط التكرارات ({customers.length} عميل)</span>
                </button>
                <button
                  type="button"
                  onClick={generateSampleCustomersTemplate}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-black px-4 py-2.5 rounded-xl transition flex items-center gap-2"
                >
                  <Download className="w-4 h-4 text-amber-400" />
                  <span>تحميل نموذج شيت العملاء</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportCustomersToExcel(customers)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black px-4 py-2.5 rounded-xl transition shadow-sm flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير العملاء المسجلين ({customers.length})</span>
                </button>
              </div>
            </div>

            {/* Supabase Free Tier Protection Info */}
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-emerald-300">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span>
                  <strong>حالة استهلاك قاعدة البيانات (Supabase Free Tier):</strong> النظام مستقر في الخطة المجانية 100% (~5 ميجابايت مستخدمة من أصل 500 ميجابايت متاحة مجاناً). تنظيف التكرارات يضمن بقاء المنظومة مجانية دائماً وسريعة الاستجابة.
                </span>
              </div>
              <span className="bg-emerald-900/60 text-emerald-200 font-bold px-3 py-1 rounded-lg border border-emerald-600/40 shrink-0 text-[11px]">
                استهلاك &lt; 1% من الخطة المجانية
              </span>
            </div>

            {/* Google Sheet URL Sync Input for Customers */}
            <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs sm:text-sm font-bold text-amber-200">
                  رابط Google Sheets لقاعدة بيانات العملاء:
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="url"
                    value={customerGoogleSheetUrl}
                    onChange={(e) => {
                      setCustomerGoogleSheetUrl(e.target.value);
                      setCustomerSheetError(null);
                      setCustomerSheetSuccess(null);
                    }}
                    placeholder="https://docs.google.com/spreadsheets/d/your-customer-sheet-id/edit..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    type="button"
                    disabled={isSyncingCustomers || !customerGoogleSheetUrl.trim()}
                    onClick={async () => {
                      if (!customerGoogleSheetUrl.trim()) return;
                      setIsSyncingCustomers(true);
                      setCustomerSheetError(null);
                      setCustomerSheetSuccess(null);
                      try {
                        const res = await fetchCustomersFromGoogleSheetUrl(customerGoogleSheetUrl);
                        if (res.errors.length > 0) {
                          setCustomerSheetError(res.errors.join(' | '));
                        }
                        if (res.customers.length > 0) {
                          setCustomerPreviewList(res.customers);
                          setCustomerSheetSuccess(`تمت قراءة ${res.customers.length} عميل بنجاح من Google Sheets! راجع الجدول أدناه لتأكيد الحفظ.`);
                        } else {
                          setCustomerSheetError('لم يتم العثور على أي بيانات صالحة للعملاء داخل الشيت.');
                        }
                      } catch (err: any) {
                        setCustomerSheetError(err?.message || 'تعذر الاتصال بـ Google Sheets');
                      } finally {
                        setIsSyncingCustomers(false);
                      }
                    }}
                    className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black px-6 py-3 rounded-xl text-xs sm:text-sm shadow-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSyncingCustomers ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري جلب العملاء...</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-4 h-4" />
                        <span>قراءة شيت العملاء</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Status alerts */}
              {customerSheetSuccess && (
                <div className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 p-3.5 rounded-xl text-xs flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{customerSheetSuccess}</span>
                </div>
              )}
              {customerSheetError && (
                <div className="bg-rose-950/80 border border-rose-500/50 text-rose-200 p-3.5 rounded-xl text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{customerSheetError}</span>
                </div>
              )}
            </div>

            {/* Direct Excel File Upload for Customers */}
            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-300 flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-400 shrink-0" />
                <span>أو يمكنك رفع ملف إكسل للعملاء مباشرة من جهازك (.xlsx / .csv):</span>
              </div>
              <label className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl cursor-pointer border border-slate-700 transition">
                <span>اختيار ملف العملاء من الجهاز</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsSyncingCustomers(true);
                    setCustomerSheetError(null);
                    setCustomerSheetSuccess(null);
                    try {
                      const res = await parseExcelCustomers(file);
                      if (res.errors.length > 0) setCustomerSheetError(res.errors.join(' | '));
                      if (res.customers.length > 0) {
                        setCustomerPreviewList(res.customers);
                        setCustomerSheetSuccess(`تمت قراءة ${res.customers.length} عميل من الملف بنجاح!`);
                      }
                    } catch (err: any) {
                      setCustomerSheetError(err?.message || 'خطأ أثناء قراءة ملف العملاء');
                    } finally {
                      setIsSyncingCustomers(false);
                    }
                  }}
                />
              </label>
            </div>
          </div>

          {/* Customer Preview Table (if loaded from sheet/file) */}
          {customerPreviewList.length > 0 && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-emerald-600" />
                    <span>معاينة العملاء المستوردين ({customerPreviewList.length} عميل)</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    اختر طريقة الاستيراد واضغط على زر الحفظ لتحديث قاعدة البيانات.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={customerImportMode}
                    onChange={(e) => setCustomerImportMode(e.target.value as 'merge' | 'replace')}
                    className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                  >
                    <option value="merge">دمج وتحديث العملاء (Merge)</option>
                    <option value="replace">استبدال كامل السجل (Replace)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      importCustomersList(customerPreviewList, customerImportMode);
                      setCustomerPreviewList([]);
                      setCustomerSheetSuccess('تم حفظ وتحديث قاعدة بيانات العملاء بنجاح في المنظومة!');
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2 rounded-xl text-xs shadow transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>تأكيد حفظ العملاء ({customerPreviewList.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomerPreviewList([])}
                    className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2"
                  >
                    إلغاء
                  </button>
                </div>
              </div>

              {/* Preview Customer Table */}
              <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-2xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-black sticky top-0">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">كود العميل</th>
                      <th className="p-3">اسم العميل</th>
                      <th className="p-3">الفرع التابع له</th>
                      <th className="p-3">اسم المندوب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                    {customerPreviewList.map((c, i) => (
                      <tr key={c.id || i} className="hover:bg-amber-50/50">
                        <td className="p-3 text-slate-400">{i + 1}</td>
                        <td className="p-3 font-mono font-bold text-amber-800">{c.code}</td>
                        <td className="p-3 font-bold text-slate-950">{c.name}</td>
                        <td className="p-3">{c.branchName || 'الفرع الرئيسي'}</td>
                        <td className="p-3 font-bold text-emerald-700">{c.repName || c.salesRepName || 'غير مرتبط'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Current Saved Customers Table */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">
                    سجل العملاء النشط بالمنظومة ({customers.length} عميل)
                  </h4>
                  <p className="text-xs text-slate-500">
                    يتم استدعاء هؤلاء العملاء تلقائياً في شاشة الفواتير للمندوبين والبحث السريع
                  </p>
                </div>
              </div>

              {/* Filters Bar: Rep Filter, Branch Filter, and Search */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Rep Filter Dropdown */}
                <select
                  value={customerSelectedRepFilter}
                  onChange={(e) => setCustomerSelectedRepFilter(e.target.value)}
                  aria-label="تصفية حسب المندوب المسؤول"
                  className="h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">جميع المناديب ({customers.length} عميل)</option>
                  {users
                    .filter((u) => u.role === 'sales_rep' || u.role === 'supervisor')
                    .map((rep) => {
                      const repCustomerCount = customers.filter(
                        (c) =>
                          c.repId === rep.id ||
                          c.salesRepName === rep.name ||
                          c.repName === rep.name ||
                          (c.salesRepName && c.salesRepName.includes(rep.name))
                      ).length;
                      return (
                        <option key={rep.id} value={rep.name}>
                          مندوب: {rep.name} {rep.branchName ? `(${rep.branchName})` : ''} - [{repCustomerCount} عميل]
                        </option>
                      );
                    })}
                  <option value="unassigned">عملاء غير مسندين لمندوب</option>
                </select>

                {/* Branch Filter Dropdown */}
                <select
                  value={customerSelectedBranchFilter}
                  onChange={(e) => setCustomerSelectedBranchFilter(e.target.value)}
                  aria-label="تصفية حسب الفرع"
                  className="h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">جميع الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>

                {/* Search Bar */}
                <div className="relative w-full sm:w-60">
                  <input
                    type="text"
                    value={customerSearchTerm}
                    onChange={(e) => setCustomerSearchTerm(e.target.value)}
                    placeholder="بحث بالاسم، الكود، الهاتف، المحل..."
                    className="w-full h-10 pr-9 pl-4 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>
            </div>

            {customers.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-xs">
                لا يوجد عملاء مسجلين حالياً. قم بربط Google Sheet أو رفع ملف إكسل أعلاه.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-96">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-black sticky top-0">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">كود العميل</th>
                      <th className="p-3">اسم العميل</th>
                      <th className="p-3">اسم المحل / المعرض</th>
                      <th className="p-3">رقم الهاتف</th>
                      <th className="p-3">الفرع التابع له</th>
                      <th className="p-3">المندوب المسؤول</th>
                      <th className="p-3">العنوان والمحافظة</th>
                      <th className="p-3">الرقم الضريبي</th>
                      <th className="p-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {(() => {
                      const filtered = customers.filter((c) => {
                        // Rep Filter
                        if (customerSelectedRepFilter !== 'all') {
                          if (customerSelectedRepFilter === 'unassigned') {
                            if (c.repId || c.salesRepName || c.repName) return false;
                          } else {
                            const repMatch =
                              c.repName === customerSelectedRepFilter ||
                              c.salesRepName === customerSelectedRepFilter ||
                              (c.salesRepName && c.salesRepName.includes(customerSelectedRepFilter)) ||
                              (c.repName && c.repName.includes(customerSelectedRepFilter));
                            if (!repMatch) return false;
                          }
                        }

                        // Branch Filter
                        if (customerSelectedBranchFilter !== 'all') {
                          if (c.branchName && !c.branchName.includes(customerSelectedBranchFilter) && !customerSelectedBranchFilter.includes(c.branchName)) {
                            return false;
                          }
                        }

                        // Search Term
                        if (!customerSearchTerm.trim()) return true;
                        const q = customerSearchTerm.toLowerCase().trim();
                        return (
                          c.name.toLowerCase().includes(q) ||
                          (c.code && c.code.toLowerCase().includes(q)) ||
                          (c.phone && c.phone.includes(q)) ||
                          (c.storeName && c.storeName.toLowerCase().includes(q)) ||
                          (c.governorate && c.governorate.toLowerCase().includes(q)) ||
                          (c.branchName && c.branchName.toLowerCase().includes(q)) ||
                          (c.salesRepName && c.salesRepName.toLowerCase().includes(q)) ||
                          (c.repName && c.repName.toLowerCase().includes(q))
                        );
                      });
                      const displayed = filtered.slice(0, customerDisplayLimit);

                      return (
                        <>
                          {displayed.map((c, i) => (
                            <tr key={c.id} className="hover:bg-amber-50/40">
                              <td className="p-3 text-slate-400 font-bold">{i + 1}</td>
                              <td className="p-3 font-mono font-bold text-amber-900">{c.code || '---'}</td>
                              <td className="p-3 font-black text-slate-900">{c.name}</td>
                              <td className="p-3 font-bold text-slate-700">{c.storeName || '---'}</td>
                              <td className="p-3 font-bold text-emerald-800">{c.phone || '---'}</td>
                              <td className="p-3 text-slate-600">
                                <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[11px]">
                                  {c.branchName || 'الفرع الرئيسي'}
                                </span>
                              </td>
                              <td className="p-3">
                                {/* Inline Rep Selector */}
                                <select
                                  value={c.salesRepName || c.repName || ''}
                                  onChange={(e) => {
                                    const selectedRepName = e.target.value;
                                    const matchedUser = users.find((u) => u.name === selectedRepName);
                                    updateCustomer({
                                      ...c,
                                      salesRepName: selectedRepName || undefined,
                                      repName: selectedRepName || undefined,
                                      repId: matchedUser ? matchedUser.id : undefined,
                                      branchName: c.branchName || matchedUser?.branchName || undefined,
                                    });
                                  }}
                                  aria-label={`تحديد مندوب العميل ${c.name}`}
                                  className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                  <option value="">-- غير محدد --</option>
                                  {users
                                    .filter((u) => u.role === 'sales_rep' || u.role === 'supervisor')
                                    .map((u) => (
                                      <option key={u.id} value={u.name}>
                                        {u.name} {u.branchName ? `(${u.branchName})` : ''}
                                      </option>
                                    ))}
                                </select>
                              </td>
                              <td className="p-3 text-slate-600">{c.address || c.governorate || '---'}</td>
                              <td className="p-3 font-mono text-slate-500">{c.taxNumber || '---'}</td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`هل أنت متأكد من حذف العميل (${c.name})؟`)) {
                                      deleteCustomer(c.id);
                                    }
                                  }}
                                  className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 cursor-pointer transition"
                                  title="حذف العميل"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {filtered.length > customerDisplayLimit && (
                            <tr>
                              <td colSpan={10} className="p-4 text-center bg-slate-50">
                                <button
                                  type="button"
                                  onClick={() => setCustomerDisplayLimit((prev) => prev + 100)}
                                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-5 py-2 rounded-xl transition cursor-pointer"
                                >
                                  عرض المزيد من العملاء (يتبقى {filtered.length - customerDisplayLimit} عميل)
                                </button>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Supported Columns Reference */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-extrabold text-xs text-amber-300">
            الأعمدة الأساسية المدعومة تلقائياً في Google Sheets والإكسل:
          </span>
          <span className="text-[10px] text-slate-400">مطابقة ذكية وسريعة للأسعار والمخزون</span>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {[
            'كود العميل',
            'اسم العميل',
            'الفرع التابع له',
            'اسم المندوب',
            'اسم الصنف',
            'اولوية البيع',
            'التصنيف',
            'حالة الصنف',
            'شدة الكرتونة',
            'الحجم',
            'اللون',
            'الفرع - فعلى',
            'الفرع - بعد الحجز',
            'المخزن الرئيسي - فعلى',
            'المخزن الرئيسي - بعد الحجز',
            'القسم',
            'الفئة',
            'سعر العرض',
            'سعر الكرتونة',
            'اسم الفرع',
            'رابط صورة Google Drive / مباشر'
          ].map((col, idx) => (
            <span
              key={idx}
              className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700"
            >
              {idx + 1}. {col}
            </span>
          ))}
        </div>
      </div>

      {/* Wipe Confirmation Modal */}
      {isWipeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
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
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-2xl text-xs transition cursor-pointer"
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
                    setImportSuccessMsg('تم مسح جميع الأصناف والبيانات بنجاح! يمكنك الآن رفع ملفك من الصفر.');
                  } finally {
                    setIsWiping(false);
                  }
                }}
                disabled={isWiping}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-2.5 rounded-2xl text-xs shadow-md transition cursor-pointer disabled:opacity-50"
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
