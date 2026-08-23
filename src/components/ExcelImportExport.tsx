import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
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
  Upload,
  X,
  Trash2
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { getProductImageUrl } from '../services/cloudinaryService';
import {
  exportProductsToExcel,
  fetchAndParseGoogleSheet,
  generateSampleExcelTemplate,
  parseExcelProducts
} from '../services/excelService';
import { formatCurrency } from '../services/invoiceService';
import { Product } from '../types';

export const ExcelImportExport: React.FC = () => {
  const { products, importProductsList, wipeAllProductsAndData, selectedBranchFilter } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'google_sheets' | 'excel_file' | 'drive_scanner'>('google_sheets');

  // Wipe / Reset Modal State
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [wipeInvoicesToo, setWipeInvoicesToo] = useState(false);

  // Excel File State
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<Product[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  // Google Sheets State
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isSyncingGoogleSheet, setIsSyncingGoogleSheet] = useState(false);
  const [googleSheetSuccess, setGoogleSheetSuccess] = useState<string | null>(null);
  const [googleSheetError, setGoogleSheetError] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsLoading(true);
    setParseErrors([]);
    setImportSuccessMsg(null);

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
      `تم بنجاح استيراد ${previewProducts.length} صنف وتحديث بيانات مخزون الفروع والمخزن الرئيسي وروابط الصور!`
    );
    setPreviewProducts([]);
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
          `تم بنجاح جلب ${result.products.length} صنف مباشرة من Google Sheets! يمكنك مراجعة البيانات بالأسفل والضغط على "تأكيد الاستيراد".`
        );
      }
    } catch (err: any) {
      setGoogleSheetError(err.message || 'تعذر الاتصال بـ Google Sheets');
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
            <span>ربط مباشر مع Google Sheets</span>
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
            <span>رفع ملف إكسل (Excel / CSV)</span>
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
            <span>ماسح مجلدات Google Drive الشامل</span>
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
                  أنشئ جدولك على Google Sheets بنفس الأعمدة (الكود، اسم الصنف، السعر، المخزون، القسم).
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
 * وربط اسم/كود الصورة برابط مباشر خفيف ومناسب للكتالوج
 */
function syncDriveFolderWithSheet() {
  // 🔴 ضع هنا الـ ID الخاص بالمجلد الرئيسي فقط (الموجود في رابط الفولدر على درايف)
  var MAIN_FOLDER_ID = "ضع_ID_المجلد_الرئيسي_هنا";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["كود / اسم الصنف", "مسار المجلد الفرعي", "رابط الصورة المباشر", "File ID"]);
    sheet.getRange("1:1").setFontWeight("bold").setBackground("#0284c7").setFontColor("#ffffff");
  }

  var rootFolder = DriveApp.getFolderById(MAIN_FOLDER_ID);
  
  try {
    rootFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(e) {}

  Logger.log("بدء المسح الشامل للمجلدات...");
  processFolderRecursive(rootFolder, sheet, "");
  SpreadsheetApp.getUi().alert("✅ تم جلب جميع الصور من كافة المجلدات الفرعية بنجاح!");
}

function processFolderRecursive(folder, sheet, currentPath) {
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
    }
  }

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  var subFolders = folder.getFolders();
  while (subFolders.hasNext()) {
    var sub = subFolders.next();
    processFolderRecursive(sub, sheet, fullPath);
  }
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
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <h3 className="text-lg font-black text-slate-900">
                  تم استخراج {previewProducts.length} صنف جاهز للحفظ في المنظومة
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                راجع الأصناف والأسعار والمخزون، ثم اختر طريقة الإضافة واضغط تأكيد
              </p>
            </div>

            {/* Import Mode Selection */}
            <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span>دمج وتحديث الحالي (Merge)</span>
              </label>

              <label className="flex items-center gap-1.5 text-xs font-bold text-rose-700 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="text-rose-600 focus:ring-rose-500"
                />
                <span>استبدال الكل بالكامل (Replace All)</span>
              </label>
            </div>
          </div>

          {/* Table of Preview Items */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-96">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-amber-300 font-bold sticky top-0">
                <tr>
                  <th className="p-3">الكود</th>
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
                {previewProducts.slice(0, 100).map((p, idx) => (
                  <tr key={idx} className="hover:bg-amber-50/50">
                    <td className="p-3 font-bold text-amber-900 bg-amber-50/80 font-mono">{p.code}</td>
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
                ))}
              </tbody>
            </table>
          </div>

          {previewProducts.length > 100 && (
            <p className="text-[11px] text-slate-500 text-center">
              يتم عرض أول 100 صنف للمعاينة السريعة • الإجمالي هو {previewProducts.length} صنف سيتم استيرادها بالكامل.
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setPreviewProducts([])}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-xl text-xs transition"
            >
              إلغاء
            </button>
            <button
              onClick={handleApplyImport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-7 py-2.5 rounded-xl text-xs sm:text-sm shadow-md transition flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>تأكيد استيراد وتحديث {previewProducts.length} صنف الآن</span>
            </button>
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
            'الكود',
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
