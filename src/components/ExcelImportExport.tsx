import {
  AlertCircle,
  ArrowDown,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  exportProductsToExcel,
  generateSampleExcelTemplate,
  parseExcelProducts
} from '../services/excelService';
import { formatCurrency } from '../services/invoiceService';
import { Product } from '../types';

export const ExcelImportExport: React.FC = () => {
  const { products, importProductsList, selectedBranchFilter } = useApp();

  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<Product[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

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
      `تم بنجاح استيراد ${previewProducts.length} صنف وتحديث بيانات مخزون الفروع والمخزن الرئيسي وصور Cloudinary!`
    );
    setPreviewProducts([]);
    setTimeout(() => setImportSuccessMsg(null), 5000);
  };

  return (
    <div className="space-y-5 pb-16">
      
      {/* Success Banner */}
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

      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">مركز استيراد وتصدير شيتات الإكسل (Excel / CSV)</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                مطابقة تلقائية لكافة أعمدة دريم الـ 18 • تحديث المخزون والأسعار والصور السحابية دفعة واحدة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Download Template */}
            <button
              onClick={generateSampleExcelTemplate}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2 rounded-xl text-xs border border-slate-300 transition"
              title="تحميل شيت إكسل جاهز بالصيغة المعتمدة"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>تحميل نموذج إكسل معتمد</span>
            </button>

            {/* Export Current Products */}
            <button
              onClick={() => exportProductsToExcel(products, selectedBranchFilter)}
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير المخزون الحالي ({products.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Column Specs Reference Pill Matrix */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-extrabold text-xs text-amber-300">
            الأعمدة الـ 18 المدعومة تلقائياً في شيت الإكسل:
          </span>
          <span className="text-[10px] text-slate-400">يدعم أسماء الأعمدة بالعربي أو الإنجليزي</span>
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
            'سعر القطعة',
            'سعر الكرتونة',
            'اسم الفرع'
          ].map((col, idx) => (
            <span
              key={idx}
              className="bg-slate-800 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-700 font-medium"
            >
              {col}
            </span>
          ))}
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
        <h3 className="font-black text-sm sm:text-base text-slate-900 flex items-center gap-2">
          <Upload className="w-4 h-4 text-emerald-600" />
          <span>رفع ملف الإكسل لتحديث الأصناف والمخزون</span>
        </h3>

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
          className={`border-2 border-dashed rounded-3xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
            isDragging
              ? 'border-amber-500 bg-amber-50/50 scale-[0.99]'
              : 'border-slate-300 hover:border-emerald-500 bg-slate-50/60'
          }`}
          onClick={() => document.getElementById('excel-file-input')?.click()}
        >
          <input
            id="excel-file-input"
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />

          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
            <Upload className="w-8 h-8" />
          </div>

          <div>
            <div className="font-black text-sm text-slate-900">
              اسحب وأفلت ملف الإكسل (.xlsx, .xls, .csv) هنا، أو اضغط للاختيار
            </div>
            <p className="text-xs text-slate-500 mt-1">
              يدعم ملفات الأصناف الضخمة حتى 10,000+ صنف مع الربط التلقائي بصور Cloudinary
            </p>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-full animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>جاري قراءة ومعالجة شيت الإكسل...</span>
            </div>
          )}
        </div>

        {/* Errors list if any */}
        {parseErrors.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>أخطاء أثناء معالجة الملف:</span>
            </div>
            <ul className="list-disc list-inside pr-4 space-y-0.5 font-medium">
              {parseErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Preview Table & Confirmation */}
      {previewProducts.length > 0 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4 animate-in fade-in">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>معاينة الأصناف المستخرجة من الإكسل ({previewProducts.length} صنف)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تأكد من صحة البيانات وتطابق الأعمدة قبل الحفظ النهائي في المنظومة
              </p>
            </div>

            {/* Import Mode Switcher */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                onClick={() => setImportMode('merge')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  importMode === 'merge'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                دمج وتحديث بالأكواد (Merge)
              </button>
              <button
                onClick={() => setImportMode('replace')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  importMode === 'replace'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                استبدال المخزون بالكامل (Replace)
              </button>
            </div>
          </div>

          {/* Table Preview */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-white font-bold sticky top-0">
                <tr>
                  <th className="p-2.5">الكود</th>
                  <th className="p-2.5">اسم الصنف</th>
                  <th className="p-2.5">التصنيف</th>
                  <th className="p-2.5 text-center">شدة الكرتونة</th>
                  <th className="p-2.5 text-center">الفرع (فعلي)</th>
                  <th className="p-2.5 text-center">المخزن المركزي (فعلي)</th>
                  <th className="p-2.5 text-left">سعر القطعة</th>
                  <th className="p-2.5 text-left">سعر الكرتونة</th>
                  <th className="p-2.5">الفرع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewProducts.slice(0, 15).map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold font-mono text-amber-900">{p.code}</td>
                    <td className="p-2.5 font-bold text-slate-900">{p.name}</td>
                    <td className="p-2.5 text-slate-600">{p.category}</td>
                    <td className="p-2.5 text-center font-black">{p.cartonQuantity} ق</td>
                    <td className="p-2.5 text-center font-bold text-emerald-700">{p.branchStockActual}</td>
                    <td className="p-2.5 text-center font-bold text-amber-800">{p.mainWarehouseActual}</td>
                    <td className="p-2.5 text-left">{formatCurrency(p.piecePrice)}</td>
                    <td className="p-2.5 text-left font-bold">{formatCurrency(p.cartonPrice)}</td>
                    <td className="p-2.5 text-slate-500 text-[11px]">{p.branchName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewProducts.length > 15 && (
            <div className="text-center text-xs text-slate-500 font-medium">
              ... ويوجد {previewProducts.length - 15} صنف إضافي سيتم استيرادهم بالكامل
            </div>
          )}

          {/* Action Confirmation Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              onClick={() => setPreviewProducts([])}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
            >
              إلغاء
            </button>
            <button
              onClick={handleApplyImport}
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black text-xs shadow-md transition transform active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>تطبيق الاستيراد وحفظ {previewProducts.length} صنف في دريم</span>
            </button>
          </div>

        </div>
      )}

    </div>
  );
};
