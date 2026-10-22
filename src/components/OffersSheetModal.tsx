import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Flame,
  Link2,
  Loader2,
  Percent,
  Sparkles,
  Tag,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PromotionOffer } from '../types';
import {
  applyPromotionsToProducts,
  parsePromotionsFromExcelBuffer,
  parsePromotionsFromGoogleSheet,
  savePromotions,
} from '../services/promotionService';
import { formatCurrency } from '../services/invoiceService';

interface OffersSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFilterOffersOnly?: () => void;
}

export const OffersSheetModal: React.FC<OffersSheetModalProps> = ({
  isOpen,
  onClose,
  onFilterOffersOnly,
}) => {
  const { products, importProductsList } = useApp();

  const [activeTab, setActiveTab] = useState<'file' | 'googleSheet'>('file');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [report, setReport] = useState<{
    totalPromotions: number;
    updatedCount: number;
    promotions: PromotionOffer[];
  } | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorText(null);
    setReport(null);

    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parsePromotionsFromExcelBuffer(buffer);
      if (!parsed.promotions || parsed.promotions.length === 0) {
        throw new Error('الملف لا يحتوي على أي عروض أسعار صالحة أو أعمدة معترف بها.');
      }

      // Apply to master products list
      const result = applyPromotionsToProducts(products, parsed.promotions);

      // Persist in AppContext & Storage
      importProductsList(result.updatedProducts, 'replace');
      savePromotions(parsed.promotions);

      setReport({
        totalPromotions: parsed.promotions.length,
        updatedCount: result.updatedCount,
        promotions: parsed.promotions,
      });
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || 'حدث خطأ أثناء معالجة ملف العروض.');
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const handleGoogleSheetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleSheetUrl.trim()) {
      setErrorText('يرجى لصق رابط Google Sheets أولاً.');
      return;
    }

    setIsProcessing(true);
    setErrorText(null);
    setReport(null);

    try {
      const parsed = await parsePromotionsFromGoogleSheet(googleSheetUrl.trim());
      if (!parsed.promotions || parsed.promotions.length === 0) {
        throw new Error('لم يتم العثور على أي عروض أسعار صالحة في الرابط.');
      }

      const result = applyPromotionsToProducts(products, parsed.promotions);

      importProductsList(result.updatedProducts, 'replace');
      savePromotions(parsed.promotions);

      setReport({
        totalPromotions: parsed.promotions.length,
        updatedCount: result.updatedCount,
        promotions: parsed.promotions,
      });
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || 'تعذر جلب أو قراءة شيت العروض من Google Sheets.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900"
        dir="rtl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-rose-900 via-rose-800 to-amber-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>رفع شيت العروض والخصومات</span>
                <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full font-bold">
                  ربط تلقائي بالأكواد
                </span>
              </h2>
              <p className="text-xs text-rose-100/90 mt-0.5">
                ارفع شيت العروض (Excel أو Google Sheet) وسيتم تطبيق الخصومات تلقائياً على كل كود متطابق
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Method tabs */}
          {!report && (
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('file')}
                className={`flex-1 py-2 text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'file'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>رفع ملف Excel (.xlsx / .csv)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('googleSheet')}
                className={`flex-1 py-2 text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'googleSheet'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Link2 className="w-4 h-4 text-blue-600" />
                <span>رابط Google Sheets مباشر</span>
              </button>
            </div>
          )}

          {/* Error notice */}
          {errorText && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorText}</span>
            </div>
          )}

          {/* Success Report */}
          {report ? (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl text-emerald-900 space-y-2">
                <div className="flex items-center gap-2 font-black text-sm text-emerald-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>تم تطبيق وربط شيت العروض بنجاح تام! 🎉</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-200">
                    <span className="text-slate-500 block text-[11px]">إجمالي العروض بالشيت:</span>
                    <strong className="text-emerald-700 font-mono text-base font-black">
                      {report.totalPromotions} عرض
                    </strong>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-200">
                    <span className="text-slate-500 block text-[11px]">الأصناف التي تم تحديث أسعارها:</span>
                    <strong className="text-indigo-700 font-mono text-base font-black">
                      {report.updatedCount} صنف مطابق
                    </strong>
                  </div>
                </div>
              </div>

              {/* Sample of applied promotions */}
              {report.promotions.length > 0 && (
                <div className="border border-slate-200 rounded-2xl p-3 bg-slate-50/50 space-y-2">
                  <div className="text-xs font-black text-slate-700 flex items-center justify-between">
                    <span>نماذج من العروض المرتبطة تلقائياً:</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {Math.min(5, report.promotions.length)} من {report.promotions.length}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {report.promotions.slice(0, 6).map((promo, idx) => (
                      <div
                        key={promo.id || idx}
                        className="bg-white p-2 rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">
                            {promo.productName || 'صنف عروض'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                            <span>كود: {promo.productCode}</span>
                            {promo.unifiedCode && <span>موحد: {promo.unifiedCode}</span>}
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          <span className="text-rose-600 font-black font-mono">
                            {formatCurrency(promo.promoPrice)}
                          </span>
                          {promo.originalPrice && promo.originalPrice > promo.promoPrice && (
                            <span className="block text-[10px] text-slate-400 line-through font-mono">
                              {formatCurrency(promo.originalPrice)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                {onFilterOffersOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      onFilterOffersOnly();
                      onClose();
                    }}
                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-black py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition active:scale-95"
                  >
                    <Flame className="w-4 h-4 text-amber-300" />
                    <span>عرض الأصناف الخاضعة للعروض فقط 🔥</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'file' ? (
                <div className="space-y-3">
                  <label
                    htmlFor="offers-file-input"
                    className={`border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition text-center ${
                      isProcessing
                        ? 'bg-slate-50 border-slate-300 opacity-60 cursor-not-allowed'
                        : 'border-rose-300 hover:border-rose-500 hover:bg-rose-50/30 bg-gradient-to-b from-white to-rose-50/20'
                    }`}
                  >
                    <input
                      id="offers-file-input"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUpload}
                      disabled={isProcessing}
                      className="hidden"
                    />
                    <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-xs">
                      {isProcessing ? (
                        <Loader2 className="w-7 h-7 animate-spin" />
                      ) : (
                        <Upload className="w-7 h-7" />
                      )}
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-800">
                        {isProcessing ? 'جاري قراءة وربط شيت العروض بالأكواد...' : 'اضغط لاختيار ملف شيت العروض من جهازك'}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        يدعم ملفات Excel (.xlsx, .xls) وملفات CSV
                      </div>
                    </div>
                  </label>
                </div>
              ) : (
                <form onSubmit={handleGoogleSheetSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">
                      رابط Google Sheets المباشر لشيت العروض:
                    </label>
                    <input
                      type="url"
                      value={googleSheetUrl}
                      onChange={(e) => setGoogleSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      disabled={isProcessing}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isProcessing || !googleSheetUrl.trim()}
                    className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري جلب وقراءة الشيت من Google...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>جلب العروض وربطها بالأكواد الآن</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Explanatory guidelines */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-900 space-y-2">
                <div className="font-black flex items-center gap-1.5 text-amber-950">
                  <Tag className="w-4 h-4 text-amber-700" />
                  <span>كيف يتم الربط التلقائي في النظام؟</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11.5px] leading-relaxed text-amber-900/90 pr-1">
                  <li>
                    يقرأ النظام تلقائياً أعمدة: <strong>كود الصنف</strong> أو <strong>الكود الموحد</strong> أو <strong>اسم الصنف</strong>.
                  </li>
                  <li>
                    يقرأ أعمدة الأسعار: <strong>سعر العرض</strong>، <strong>سعر الكرتونة بالعرض</strong>، أو <strong>نسبة الخصم %</strong>.
                  </li>
                  <li>
                    إذا كان العرض على كود أساسي (مثل <strong>8009</strong>)، يتم تطبيقه تلقائياً على كل شبابيك وألوان الصنف المدمجة!
                  </li>
                  <li>
                    تظهر شارة <strong>عرض خاص 🔥</strong> في الكتالوج، وينعكس السعر الجديد في السلة والفواتير فوراً.
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
