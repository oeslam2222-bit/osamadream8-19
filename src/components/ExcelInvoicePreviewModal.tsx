import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  FileText,
  Copy,
  X,
  CheckCircle2,
  Sparkles,
  Layers,
  ArrowDownToLine,
  Building2,
  Calendar,
  CreditCard,
  Hash,
  ShoppingBag
} from 'lucide-react';
import { Invoice } from '../types';
import { exportElectronicInvoiceToExcel, exportInvoiceForERP } from '../services/excelService';
import { downloadInvoicePDF } from '../services/pdfService';
import { formatCurrency } from '../services/invoiceService';
import { COMPANY_INFO } from '../data/mockData';
import { resolveCustomerFinancials } from '../services/arabicMatchingService';

interface ExcelInvoicePreviewModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExcelInvoicePreviewModal: React.FC<ExcelInvoicePreviewModalProps> = ({
  invoice,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'standard' | 'erp' | 'credit'>('standard');
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingBoth, setIsDownloadingBoth] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);

  if (!isOpen || !invoice) return null;

  const {
    debtBefore,
    debtAfter,
    creditLimit,
    isExceeded,
    requiredDown,
  } = resolveCustomerFinancials(invoice);

  // 1. Direct Excel Download
  const handleDownloadExcel = () => {
    setIsDownloadingExcel(true);
    try {
      exportElectronicInvoiceToExcel(invoice);
      setDownloadSuccessToast(`تم تحميل ملف Excel للفاتورة #${invoice.invoiceNumber} مباشرة على جهازك! 📊`);
      setTimeout(() => setDownloadSuccessToast(null), 3500);
    } catch (err) {
      console.error('Excel download failed:', err);
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  // 2. Direct ERP Excel Download
  const handleDownloadERP = () => {
    setIsDownloadingExcel(true);
    try {
      exportInvoiceForERP(invoice);
      setDownloadSuccessToast(`تم تحميل شيت ERP للفاتورة #${invoice.invoiceNumber} مباشرة على جهازك! 📑`);
      setTimeout(() => setDownloadSuccessToast(null), 3500);
    } catch (err) {
      console.error('ERP download failed:', err);
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  // 3. Direct PDF Download
  const handleDownloadPDF = async () => {
    setIsDownloadingPdf(true);
    try {
      await downloadInvoicePDF(invoice);
      setDownloadSuccessToast(`تم تحميل ملف PDF للفاتورة #${invoice.invoiceNumber} مباشرة على جهازك! 📄`);
      setTimeout(() => setDownloadSuccessToast(null), 3500);
    } catch (err) {
      console.error('PDF download failed:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // 4. Download Both (PDF + Excel) Direct
  const handleDownloadBoth = async () => {
    setIsDownloadingBoth(true);
    try {
      // Step A: Trigger PDF direct download
      await downloadInvoicePDF(invoice);
      setDownloadSuccessToast('جاري استكمال تحميل ملف Excel أيضاً...');
      // Step B: Wait small delay so browser allows concurrent file downloads
      await new Promise((resolve) => setTimeout(resolve, 600));
      // Step C: Trigger Excel direct download
      exportElectronicInvoiceToExcel(invoice);
      setDownloadSuccessToast(`تم بنجاح تحميل ملف PDF وملف Excel للفاتورة #${invoice.invoiceNumber} مباشرة على جهازك! 📥⚡`);
      setTimeout(() => setDownloadSuccessToast(null), 4000);
    } catch (err) {
      console.error('Download both failed:', err);
    } finally {
      setIsDownloadingBoth(false);
    }
  };

  // 5. Copy Excel Table as Tab-Separated Values (TSV)
  const handleCopyTable = () => {
    const headers = [
      'م',
      'كود الصنف',
      'الكود الموحد',
      'اسم الصنف',
      'شدة الكرتونة',
      'عدد الكراتين',
      'قطع فردية',
      'إجمالي القطع',
      'سعر الكرتونة',
      'سعر القطعة',
      'الإجمالي قبل الخصم',
      'الخصم',
      'الصافي',
      'مصدر الصرف'
    ].join('\t');

    const rows = invoice.items.map((it, idx) => {
      const cartonQty = it.cartonQuantity || 1;
      const cCount = it.cartonCount || 0;
      const pCount = it.pieceCount || 0;
      const totalUnits = it.totalUnits || (cCount * cartonQty + pCount);
      const pieceP = it.pricePerPiece || (cartonQty > 0 ? Math.round((it.pricePerCarton || it.appliedPrice) / cartonQty) : 0);
      const unified = it.unifiedCode || (it.product as any)?.unifiedCode || '---';
      const fulfillment = it.fulfilledFrom === 'main_warehouse' ? 'مخزن 6 أكتوبر' : invoice.branchName;

      return [
        idx + 1,
        it.productCode,
        unified,
        it.productName,
        cartonQty,
        cCount,
        pCount,
        totalUnits,
        it.pricePerCarton || it.appliedPrice,
        pieceP,
        it.totalBeforeTax,
        it.discountAmount,
        it.netTotal,
        fulfillment
      ].join('\t');
    }).join('\n');

    const fullTsv = `${headers}\n${rows}`;
    navigator.clipboard.writeText(fullTsv);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2500);
  };

  return (
    <div
      id="excel-invoice-preview-modal"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-300 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        
        {/* Top Header Ribbon (Excel Themed) */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 border-b-2 border-emerald-600">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-md shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white">
                  معاينة شيت الإكسيل (Excel Preview)
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  XLSX Mapped ⚡
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                فاتورة رقم: <span className="font-bold text-amber-300 font-mono">#{invoice.invoiceNumber}</span> • العميل: <span className="font-bold text-white">{invoice.customerName}</span>
              </p>
            </div>
          </div>

          {/* Header Action Buttons (Direct Downloads) */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Download Both */}
            <button
              onClick={handleDownloadBoth}
              disabled={isDownloadingBoth}
              className="bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black shadow-md transition flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
              title="تحميل ملف PDF وملف Excel معاً مباشرة على جهازك بضغطة واحدة"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>{isDownloadingBoth ? 'جاري التحميل...' : 'تحميل الاثنين معاً (PDF + Excel) ⚡'}</span>
            </button>

            {/* Direct Excel Download */}
            <button
              onClick={handleDownloadExcel}
              disabled={isDownloadingExcel}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-md transition flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
              title="تحميل ملف Excel المنسق مباشرة على جهاز المندوب"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>تحميل Excel مباشر 📥</span>
            </button>

            {/* Direct PDF Download */}
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloadingPdf}
              className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-2 rounded-xl text-xs font-black shadow-md transition flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
              title="تحميل ملف PDF مباشرة دون الحاجة لطباعة"
            >
              <Download className="w-4 h-4" />
              <span>تحميل PDF 📄</span>
            </button>

            {/* Copy Table */}
            <button
              onClick={handleCopyTable}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="نسخ جدول الأصناف للحافظة ولصقه مباشرة في إكسل"
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{copiedToast ? 'تم النسخ! ✓' : 'نسخ كجدول'}</span>
            </button>

            {/* Close Modal */}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
              title="إغلاق المعاينة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications / Feedback */}
        {downloadSuccessToast && (
          <div className="bg-emerald-600 text-white p-3 text-xs sm:text-sm font-black flex items-center justify-between shadow-inner animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>{downloadSuccessToast}</span>
            </div>
            <span className="text-[11px] text-emerald-100 font-normal">تم الحفظ في مجلد التنزيلات بجهازك</span>
          </div>
        )}

        {/* Informational Guidance Ribbon */}
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-emerald-950 font-medium">
          <div className="flex items-center gap-2">
            <span className="text-emerald-700 font-black">💡 معاينة حية لشيت Excel المطور:</span>
            <span className="text-emerald-800">
              ملف الإكسيل يحتوي على أوراق عمل متعددة معتمدة لشركة دريم، ويمكنك فتحه على الموبايل عبر تطبيق Excel أو Google Sheets.
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-emerald-900 font-bold shrink-0">
            <span>التحميل فوري ومباشر على جهازك دون أي طابعة 📱💻</span>
          </div>
        </div>

        {/* Sheet Tabs Switcher (Excel Style) */}
        <div className="bg-slate-100 border-b border-slate-300 px-3 sm:px-6 pt-2 flex items-center gap-1 overflow-x-auto select-none">
          <button
            onClick={() => setActiveTab('standard')}
            className={`px-4 py-2 text-xs font-black rounded-t-xl transition cursor-pointer flex items-center gap-2 shrink-0 border-t-2 ${
              activeTab === 'standard'
                ? 'bg-white text-emerald-800 border-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/70'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>ورقة 1: فاتورة مبيعات معتمدة (Executive Layout)</span>
          </button>

          <button
            onClick={() => setActiveTab('erp')}
            className={`px-4 py-2 text-xs font-black rounded-t-xl transition cursor-pointer flex items-center gap-2 shrink-0 border-t-2 ${
              activeTab === 'erp'
                ? 'bg-white text-emerald-800 border-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/70'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-600" />
            <span>ورقة 2: جدول التكويد للسيستم (ERP / D365 Table)</span>
          </button>

          <button
            onClick={() => setActiveTab('credit')}
            className={`px-4 py-2 text-xs font-black rounded-t-xl transition cursor-pointer flex items-center gap-2 shrink-0 border-t-2 ${
              activeTab === 'credit'
                ? 'bg-white text-emerald-800 border-emerald-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/70'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
            <span>ورقة 3: كشف حساب العميل والائتمان (Ledger Audit)</span>
          </button>
        </div>

        {/* Active Spreadsheet Content */}
        <div className="flex-1 overflow-auto p-3 sm:p-5 bg-slate-50">
          
          {/* TAB 1: Standard Executive Invoice Layout */}
          {activeTab === 'standard' && (
            <div className="bg-white rounded-2xl border border-slate-300 shadow-sm p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
              
              {/* Sheet Header (Dream Corporate Banner) */}
              <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 text-center space-y-1">
                <div className="text-base sm:text-lg font-black text-amber-400">
                  {COMPANY_INFO.nameArabic} - مجموعة الطنطاوي (TANTAWY GROUP)
                </div>
                <div className="text-xs text-slate-300 font-bold">
                  فاتورة مبيعات إلكترونية معتمدة - إذن صرف واستلام بضاعة وموقف حساب العميل
                </div>
                <div className="text-[11px] text-slate-400 pt-1 flex flex-wrap items-center justify-center gap-3">
                  <span>س.ت: <strong>{COMPANY_INFO.commercialRegister}</strong></span>
                  <span>ب.ض: <strong>{COMPANY_INFO.taxNumber}</strong></span>
                  <span>الخط الساخن: <strong>{COMPANY_INFO.customerService}</strong></span>
                  <span>المقر الرئيسي: <strong>المنطقة الصناعية - 6 أكتوبر</strong></span>
                </div>
              </div>

              {/* Metadata Grid (Invoice & Customer Meta) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] font-bold">رقم الفاتورة:</span>
                  <strong className="text-slate-900 font-mono text-xs">{invoice.invoiceNumber}</strong>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] font-bold">تاريخ ووقت الإصدار:</span>
                  <strong className="text-slate-900">{invoice.date} {invoice.time || ''}</strong>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] font-bold">طريقة السداد:</span>
                  <strong className="text-emerald-700">{invoice.paymentMethod}</strong>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] font-bold">حالة الفاتورة:</span>
                  <strong className="text-blue-700">{invoice.status}</strong>
                </div>

                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] font-bold">اسم العميل:</span>
                  <strong className="text-slate-900">{invoice.customerName}</strong>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] font-bold">كود العميل:</span>
                  <strong className="text-slate-900 font-mono">{invoice.customerCode || 'كاش'}</strong>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] font-bold">الفرع المنفذ:</span>
                  <strong className="text-slate-900">{invoice.branchName}</strong>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] font-bold">المندوب المسؤول:</span>
                  <strong className="text-slate-900">{invoice.repName}</strong>
                </div>
              </div>

              {/* Financial Position Card (Excel Formula View) */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-amber-200 pb-1.5">
                  <div className="font-black text-amber-900 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-amber-700" />
                    <span>الموقف المالي والائتماني للعميل (Financial Audit):</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                    isExceeded ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {isExceeded ? '⚠️ تجاوز الحد الائتماني' : '✅ ضمن الحد الائتماني المعتمد'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                  <div className="bg-white p-2 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">المديونية السابقة:</span>
                    <strong className="text-slate-800 font-black">{formatCurrency(debtBefore)}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">صافي الفاتورة الحالية:</span>
                    <strong className="text-amber-800 font-black">{formatCurrency(invoice.estimatedGrandTotal)}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">إجمالي المديونية بعد الفاتورة:</span>
                    <strong className="text-rose-700 font-black">{formatCurrency(debtAfter)}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-amber-200">
                    <span className="text-[10px] text-slate-500 block">الحد الائتماني المعتمد:</span>
                    <strong className="text-blue-800 font-black">{formatCurrency(creditLimit)}</strong>
                  </div>
                </div>
              </div>

              {/* Items Grid (Excel Table Styled) */}
              <div className="border border-slate-300 rounded-xl overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold border-b border-slate-700">
                      <th className="p-2.5 text-center border-l border-slate-700 w-10">م</th>
                      <th className="p-2.5 border-l border-slate-700">كود الصنف</th>
                      <th className="p-2.5 border-l border-slate-700">الكود الموحد</th>
                      <th className="p-2.5 border-l border-slate-700 min-w-[180px]">اسم الصنف والبيان التفصيلي</th>
                      <th className="p-2.5 text-center border-l border-slate-700">شدة</th>
                      <th className="p-2.5 text-center border-l border-slate-700">كرتون</th>
                      <th className="p-2.5 text-center border-l border-slate-700">قطع</th>
                      <th className="p-2.5 text-center border-l border-slate-700 bg-amber-900/60">إجمالي القطع</th>
                      <th className="p-2.5 text-center border-l border-slate-700">سعر كرتونة</th>
                      <th className="p-2.5 text-center border-l border-slate-700">سعر قطعة</th>
                      <th className="p-2.5 text-center border-l border-slate-700">الإجمالي</th>
                      <th className="p-2.5 text-center border-l border-slate-700 text-emerald-300">الخصم</th>
                      <th className="p-2.5 text-center border-l border-slate-700 bg-amber-800/80 text-amber-200">الصافي</th>
                      <th className="p-2.5 text-center">مصدر الصرف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoice.items.map((item, idx) => {
                      const cartonQty = item.cartonQuantity || 1;
                      const cCount = item.cartonCount || 0;
                      const pCount = item.pieceCount || 0;
                      const totalUnits = item.totalUnits || (cCount * cartonQty + pCount);
                      const pieceP = item.pricePerPiece || (cartonQty > 0 ? Math.round((item.pricePerCarton || item.appliedPrice) / cartonQty) : 0);
                      const unified = item.unifiedCode || (item.product as any)?.unifiedCode || '---';
                      const fulfillment = item.fulfilledFrom === 'main_warehouse' ? 'مخزن 6 أكتوبر (نواقص)' : (invoice.branchName || 'مخزن الفرع');

                      return (
                        <tr
                          key={item.productCode + idx}
                          className={`hover:bg-amber-50/50 transition ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}
                        >
                          <td className="p-2 text-center border-l border-slate-200 font-bold text-slate-500">{idx + 1}</td>
                          <td className="p-2 border-l border-slate-200 font-mono font-bold text-slate-800">{item.productCode}</td>
                          <td className="p-2 border-l border-slate-200 font-mono text-blue-700">{unified}</td>
                          <td className="p-2 border-l border-slate-200 font-bold text-slate-900">{item.productName}</td>
                          <td className="p-2 text-center border-l border-slate-200 text-slate-600">{cartonQty}</td>
                          <td className="p-2 text-center border-l border-slate-200 font-black text-slate-900">{cCount}</td>
                          <td className="p-2 text-center border-l border-slate-200 font-black text-slate-900">{pCount}</td>
                          <td className="p-2 text-center border-l border-slate-200 font-black text-amber-900 bg-amber-50/60">{totalUnits}</td>
                          <td className="p-2 text-center border-l border-slate-200 text-slate-700">{formatCurrency(item.pricePerCarton || item.appliedPrice)}</td>
                          <td className="p-2 text-center border-l border-slate-200 text-slate-700">{formatCurrency(pieceP)}</td>
                          <td className="p-2 text-center border-l border-slate-200 text-slate-800">{formatCurrency(item.totalBeforeTax)}</td>
                          <td className="p-2 text-center border-l border-slate-200 text-emerald-700 font-bold">{item.discountAmount > 0 ? `-${formatCurrency(item.discountAmount)}` : '0'}</td>
                          <td className="p-2 text-center border-l border-slate-200 font-black text-slate-950 bg-amber-50/90">{formatCurrency(item.netTotal)}</td>
                          <td className="p-2 text-center text-[11px] text-slate-600">{fulfillment}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary / Grand Totals Section */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 text-white p-4 rounded-xl">
                <div className="text-xs space-y-1">
                  <div className="text-slate-300">
                    عدد البنود: <strong className="text-amber-300">{invoice.items.length}</strong> صنف • إجمالي الكراتين: <strong className="text-amber-300">{invoice.totalCartons}</strong> كرتونة • إجمالي القطع: <strong className="text-amber-300">{invoice.totalPieces}</strong> قطعة
                  </div>
                  {invoice.notes && (
                    <div className="text-slate-400 text-[11px]">ملاحظات: {invoice.notes}</div>
                  )}
                </div>

                <div className="text-left sm:text-right space-y-1 shrink-0">
                  <div className="text-xs text-slate-300">
                    المجموع قبل الخصم: <span className="font-bold">{formatCurrency(invoice.subtotal)}</span>
                  </div>
                  {invoice.discountAmount > 0 && (
                    <div className="text-xs text-emerald-400">
                      قيمة الخصم ({invoice.discountPercentage}%): <span className="font-bold">-{formatCurrency(invoice.discountAmount)}</span>
                    </div>
                  )}
                  <div className="text-base font-black text-amber-400 pt-1 border-t border-slate-800">
                    صافي الفاتورة النهائي: <span>{formatCurrency(invoice.estimatedGrandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Signatures Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs pt-3 border-t border-slate-200 text-slate-600">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold block text-slate-800 mb-6">استلام وتوقيع العميل:</span>
                  <div className="border-t border-dashed border-slate-400 pt-1 text-[11px] text-slate-500">
                    (توقيع / ختم المستلم)
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold block text-slate-800 mb-6">مندوب التوزيع:</span>
                  <div className="border-t border-dashed border-slate-400 pt-1 text-[11px] text-slate-700 font-bold">
                    {invoice.repName}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold block text-slate-800 mb-6">أمين مخزن الصرف:</span>
                  <div className="border-t border-dashed border-slate-400 pt-1 text-[11px] text-slate-500">
                    (المخزن المنفذ)
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold block text-slate-800 mb-6">اعتماد الحسابات والإدارة:</span>
                  <div className="border-t border-dashed border-slate-400 pt-1 text-[11px] text-slate-500">
                    (الختم والمراجعة)
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: ERP Accounting Table View */}
          {activeTab === 'erp' && (
            <div className="bg-white rounded-2xl border border-slate-300 shadow-sm p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h4 className="font-black text-slate-900 text-sm">
                    جدول البيانات والأكواد للرفع على السيستم الرئيسي (ERP & D365 Integration)
                  </h4>
                  <p className="text-xs text-slate-500">
                    جدول أعمدة مسطح (Flat Table) جاهز للرفع المباشر بالكود على سيستم الشركة (Microsoft Dynamics 365 / ERP)
                  </p>
                </div>
                <button
                  onClick={handleDownloadERP}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  <span>تحميل شيت ERP منفصل (.xlsx)</span>
                </button>
              </div>

              <div className="border border-slate-300 rounded-xl overflow-x-auto text-xs">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white font-bold">
                      <th className="p-2 border-l border-slate-700">رقم الفاتورة</th>
                      <th className="p-2 border-l border-slate-700">التاريخ</th>
                      <th className="p-2 border-l border-slate-700">المندوب</th>
                      <th className="p-2 border-l border-slate-700">الفرع</th>
                      <th className="p-2 border-l border-slate-700">كود العميل</th>
                      <th className="p-2 border-l border-slate-700">اسم العميل</th>
                      <th className="p-2 border-l border-slate-700">كود الصنف</th>
                      <th className="p-2 border-l border-slate-700">الكود الموحد</th>
                      <th className="p-2 border-l border-slate-700">اسم الصنف</th>
                      <th className="p-2 text-center border-l border-slate-700">كراتين</th>
                      <th className="p-2 text-center border-l border-slate-700">قطع</th>
                      <th className="p-2 text-center border-l border-slate-700">إجمالي</th>
                      <th className="p-2 text-center border-l border-slate-700">سعر كرتونة</th>
                      <th className="p-2 text-center border-l border-slate-700">الصافي</th>
                      <th className="p-2 border-l border-slate-700">مصدر الصرف</th>
                      <th className="p-2">طريقة الدفع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoice.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-100 font-mono text-[11px]">
                        <td className="p-2 border-l border-slate-200">{invoice.invoiceNumber}</td>
                        <td className="p-2 border-l border-slate-200">{invoice.date}</td>
                        <td className="p-2 border-l border-slate-200 font-sans">{invoice.repName}</td>
                        <td className="p-2 border-l border-slate-200 font-sans">{invoice.branchName}</td>
                        <td className="p-2 border-l border-slate-200">{invoice.customerCode || '---'}</td>
                        <td className="p-2 border-l border-slate-200 font-sans">{invoice.customerName}</td>
                        <td className="p-2 border-l border-slate-200 font-bold">{item.productCode}</td>
                        <td className="p-2 border-l border-slate-200 text-blue-700">{item.unifiedCode || '---'}</td>
                        <td className="p-2 border-l border-slate-200 font-sans">{item.productName}</td>
                        <td className="p-2 text-center border-l border-slate-200">{item.cartonCount}</td>
                        <td className="p-2 text-center border-l border-slate-200">{item.pieceCount}</td>
                        <td className="p-2 text-center border-l border-slate-200 font-bold">{item.totalUnits}</td>
                        <td className="p-2 text-center border-l border-slate-200">{item.pricePerCarton || item.appliedPrice}</td>
                        <td className="p-2 text-center border-l border-slate-200 font-black text-emerald-800">{item.netTotal}</td>
                        <td className="p-2 border-l border-slate-200 font-sans">{item.fulfilledFrom === 'main_warehouse' ? 'مخزن أكتوبر' : invoice.branchName}</td>
                        <td className="p-2 font-sans">{invoice.paymentMethod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: Credit Audit & Financial Position View */}
          {activeTab === 'credit' && (
            <div className="bg-white rounded-2xl border border-slate-300 shadow-sm p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
              <div className="border-b border-slate-200 pb-3">
                <h4 className="font-black text-slate-900 text-base flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                  <span>كشف حساب العميل والتدقيق المالي المعتمد</span>
                </h4>
                <p className="text-xs text-slate-500">
                  موقف تفصيلي لحساب العميل ومديونيته وحدود الائتمان وسجل التحصيل
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="font-bold text-slate-900 text-sm border-b border-slate-200 pb-2">
                    بيانات حساب العميل
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">اسم المحل / العميل:</span>
                    <strong className="text-slate-900">{invoice.customerName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">كود العميل:</span>
                    <strong className="text-slate-900 font-mono">{invoice.customerCode || 'كاش'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">رقم الهاتف:</span>
                    <strong className="text-slate-900">{invoice.customerPhone || '---'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">طريقة السداد المعتمدة:</span>
                    <strong className="text-emerald-700">{invoice.paymentMethod}</strong>
                  </div>
                </div>

                <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-3">
                  <div className="font-bold text-amber-950 text-sm border-b border-amber-200 pb-2">
                    التحليل المالي بعد إصدار هذه الفاتورة
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">المديونية السابقة (قبل الفاتورة):</span>
                    <strong className="text-slate-800">{formatCurrency(debtBefore)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">صافي قيمة هذه الفاتورة:</span>
                    <strong className="text-amber-800">{formatCurrency(invoice.estimatedGrandTotal)}</strong>
                  </div>
                  <div className="flex justify-between text-base font-black border-t border-amber-200 pt-1">
                    <span className="text-slate-900">إجمالي المديونية الحالية:</span>
                    <span className="text-rose-700">{formatCurrency(debtAfter)}</span>
                  </div>
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-slate-600">الحد الائتماني المصرح به:</span>
                    <strong className="text-blue-800">{formatCurrency(creditLimit)}</strong>
                  </div>
                  {isExceeded && (
                    <div className="bg-rose-100 text-rose-900 p-2.5 rounded-lg text-xs font-bold mt-2">
                      ⚠️ تنبيه ائتماني: تجاوز العميل الحد بمقدار {formatCurrency(debtAfter - creditLimit)}. مطلوب تحصيل دفعة فورية لا تقل عن {formatCurrency(requiredDown)}.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Bottom Action Bar (Quick Direct Downloads) */}
        <div className="bg-slate-100 p-3 sm:p-4 border-t border-slate-300 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 font-bold">
            جاهز للتحميل: <span className="text-emerald-800 font-black">فاتورة_دريم_طنطاوي_{invoice.invoiceNumber}.xlsx</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadBoth}
              disabled={isDownloadingBoth}
              className="bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-black shadow-md transition flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
              title="تحميل PDF و Excel معاً مباشرة"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isDownloadingBoth ? 'جاري التحميل...' : 'تحميل الاثنين معاً (PDF + Excel) ⚡'}</span>
            </button>

            <button
              onClick={handleDownloadExcel}
              disabled={isDownloadingExcel}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-black px-4 py-2 rounded-xl text-xs shadow-md transition flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>تحميل ملف Excel (.xlsx) 📥</span>
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={isDownloadingPdf}
              className="bg-rose-600 hover:bg-rose-700 text-white font-black px-4 py-2 rounded-xl text-xs shadow-md transition flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>تحميل PDF 📄</span>
            </button>

            <button
              onClick={onClose}
              className="bg-white hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
