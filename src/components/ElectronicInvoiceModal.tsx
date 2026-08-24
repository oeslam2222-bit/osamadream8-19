import {
  Building2,
  CheckCircle,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  QrCode,
  Send,
  Server,
  Share2,
  ShieldCheck,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { COMPANY_INFO } from '../data/mockData';
import { exportElectronicInvoiceToExcel } from '../services/excelService';
import { downloadInvoicePDF } from '../services/pdfService';
import {
  formatArabicDate,
  formatCurrency,
  generateWhatsAppMessage,
  shareInvoiceNative,
  shareInvoiceViaWhatsApp
} from '../services/invoiceService';
import { Invoice } from '../types';

interface ElectronicInvoiceModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ElectronicInvoiceModal: React.FC<ElectronicInvoiceModalProps> = ({
  invoice,
  isOpen,
  onClose,
}) => {
  const { syncToAccounting } = useApp();
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);

  if (!isOpen || !invoice) return null;

  const handleDownloadPDF = async () => {
    setIsDownloadingPDF(true);
    try {
      await downloadInvoicePDF(invoice);
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handleCopyText = async () => {
    const text = generateWhatsAppMessage(invoice);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {}
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAccountingSync = async () => {
    setIsSyncing(true);
    const success = await syncToAccounting(invoice.id);
    setIsSyncing(false);
    if (success) {
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden print:max-h-none print:shadow-none print:border-none print:w-full">
        
        {/* Action Header (Hidden in Print) */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black flex items-center gap-2">
                <span>فاتورة إلكترونية معتمدة - شركة دريم</span>
                <span className="bg-amber-400/20 text-amber-300 text-[10px] px-2 py-0.5 rounded border border-amber-400/30">
                  {invoice.invoiceNumber}
                </span>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {/* Direct PDF Download */}
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloadingPDF}
              className="flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg text-xs font-black transition shadow-xs cursor-pointer disabled:opacity-50"
              title="تحميل وطباعة فاتورة PDF رسمية"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloadingPDF ? 'جاري التحميل...' : 'تحميل PDF 📄'}</span>
            </button>

            {/* Excel Download */}
            <button
              onClick={() => exportElectronicInvoiceToExcel(invoice)}
              className="flex items-center gap-1 bg-emerald-700 hover:bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
              title="تصدير شيت إكسل رسمي"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">إكسل (.xlsx)</span>
            </button>

            {/* WhatsApp Share */}
            <button
              onClick={() => shareInvoiceViaWhatsApp(invoice)}
              className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
              title="إرسال عبر الواتساب"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">واتساب</span>
            </button>

            {/* Print */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">طباعة</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Electronic Invoice Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6 text-slate-900 bg-white" id="printable-invoice">
          
          {/* Company Official Header */}
          <div className="border-b-2 border-slate-900 pb-5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              
              {/* Right: Company Arabic Details */}
              <div className="text-center sm:text-right space-y-1">
                <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
                  {COMPANY_INFO.nameArabic}
                </h1>
                <p className="text-xs text-slate-600 font-medium">{COMPANY_INFO.headquarters}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-slate-700 pt-1">
                  <span>س.ت: <strong>{COMPANY_INFO.commercialRegister}</strong></span>
                  <span>•</span>
                  <span>الخط الساخن: <strong>{COMPANY_INFO.customerService}</strong></span>
                  <span>•</span>
                  <span>الموقع: <strong>{COMPANY_INFO.website}</strong></span>
                </div>
              </div>

              {/* Left: Invoice Badge & QR Code */}
              <div className="flex items-center gap-4">
                <div className="text-center sm:text-left">
                  <div className="inline-block bg-slate-900 text-amber-300 font-black text-xs px-3 py-1 rounded-md shadow-xs">
                    فاتورة مبيعات معتمدة
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 mt-1 font-mono">
                    {invoice.invoiceNumber}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    {COMPANY_INFO.nameEnglish}
                  </div>
                </div>

                {/* QR Code Placeholder Box */}
                <div className="w-20 h-20 bg-slate-100 p-1 rounded-xl border border-slate-300 flex flex-col items-center justify-center text-center shrink-0">
                  <QrCode className="w-12 h-12 text-slate-800" />
                  <span className="text-[8px] font-mono text-slate-500">شركة دريم</span>
                </div>
              </div>

            </div>
          </div>

          {/* Customer Appreciation Greeting Banner */}
          <div className="bg-gradient-to-r from-amber-50 to-amber-100/70 border border-amber-300/80 rounded-2xl p-3 text-center shadow-xs">
            <p className="text-xs sm:text-sm font-black text-amber-950 flex items-center justify-center gap-2">
              <span>✨ شكراً لأنك أصبحت جزءاً من شركة دريم للتجارة والتوزيع ❤️</span>
            </p>
          </div>

          {/* Invoice & Customer Meta Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">اسم العميل / المنشأة:</span>
              <strong className="text-slate-900 text-sm font-black">{invoice.customerName}</strong>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px]">تليفون العميل:</span>
              <strong className="text-slate-900 font-bold">{invoice.customerPhone || '---'}</strong>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px]">عنوان التسليم:</span>
              <strong className="text-slate-900 font-semibold">{invoice.customerAddress || '---'}</strong>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px]">الرقم الضريبي للعميل:</span>
              <strong className="text-slate-900 font-bold">{invoice.customerTaxNumber || 'غير مسجل'}</strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px]">المندوب المسئول:</span>
              <strong className="text-slate-900 font-bold">{invoice.repName}</strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px]">فرع الصرف:</span>
              <strong className="text-slate-900 font-bold">{invoice.branchName}</strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px]">تاريخ ووقت الفاتورة:</span>
              <strong className="text-slate-900 font-bold">{invoice.date} - {invoice.time}</strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px]">طريقة السداد:</span>
              <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-bold text-[11px]">
                {invoice.paymentMethod}
              </span>
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-white font-bold">
                <tr>
                  <th className="p-2.5 text-center w-8">م</th>
                  <th className="p-2.5">كود الصنف</th>
                  <th className="p-2.5">اسم وبيان الصنف</th>
                  <th className="p-2.5 text-center">شدة الكرتونة</th>
                  <th className="p-2.5 text-center">عدد الكراتين</th>
                  <th className="p-2.5 text-left">سعر الكرتونة</th>
                  <th className="p-2.5 text-left">الإجمالي</th>
                  <th className="p-2.5 text-left">الخصم</th>
                  <th className="p-2.5 text-left">الصافي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoice.items.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="p-2.5 text-center text-slate-400 font-mono">{index + 1}</td>
                    <td className="p-2.5 font-bold font-mono text-slate-800">{item.productCode}</td>
                    <td className="p-2.5 font-bold text-slate-900">{item.productName}</td>
                    <td className="p-2.5 text-center text-slate-600 font-bold">{item.cartonQuantity} ق</td>
                    <td className="p-2.5 text-center font-black text-amber-950 bg-amber-50/50">
                      {item.cartonCount} كرتونة
                    </td>
                    <td className="p-2.5 text-left font-bold text-slate-900">
                      {item.appliedPrice && item.appliedPrice !== item.pricePerCarton ? (
                        <div>
                          <span className="text-rose-600 font-black block">{formatCurrency(item.appliedPrice)}</span>
                          <span className="text-[10px] text-slate-400 line-through">{formatCurrency(item.pricePerCarton)}</span>
                        </div>
                      ) : (
                        formatCurrency(item.pricePerCarton)
                      )}
                    </td>
                    <td className="p-2.5 text-left font-medium text-slate-700">{formatCurrency(item.totalBeforeTax)}</td>
                    <td className="p-2.5 text-left text-emerald-700 font-medium">-{formatCurrency(item.discountAmount)}</td>
                    <td className="p-2.5 text-left font-black text-slate-950">{formatCurrency(item.netTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Summary Calculation Breakdown */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            
            {/* Notes & Status Box */}
            <div className="w-full sm:w-1/2 space-y-3">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1">
                <span className="font-bold text-slate-700 block">شروط وأحكام الفاتورة لشركة دريم:</span>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  البضاعة المباعة لا ترد ولا تستبدل بعد مرور 3 أيام من الاستلام ومطابقة الكود. يعتبر توقيع المستلم إقراراً بالاستلام بحالة ممتازة ومطابقة للأعداد والأسعار.
                </p>
                {invoice.notes && (
                  <div className="pt-2 text-slate-800 font-semibold">
                    ملاحظة خاصة: {invoice.notes}
                  </div>
                )}
              </div>

              {/* Official Stamp Box */}
              <div className="flex items-center gap-6 pt-2">
                <div className="text-center text-xs">
                  <div className="w-24 h-16 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 text-[10px]">
                    ختم شركة دريم
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">اعتماد الإدارة</span>
                </div>

                <div className="text-center text-xs">
                  <div className="w-24 h-16 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 text-[10px]">
                    توقيع المستلم
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">توقيع وختم العميل</span>
                </div>
              </div>
            </div>

            {/* Calculations Totals Box */}
            <div className="w-full sm:w-96 bg-slate-900 text-white p-4 rounded-3xl space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span>إجمالي الكراتين:</span>
                <strong className="text-white font-bold">{invoice.totalCartons} كرتونة</strong>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>المجموع الفرعي (قبل الخصم):</span>
                <span className="font-bold">{formatCurrency(invoice.subtotal)}</span>
              </div>

              <div className="flex justify-between items-center text-emerald-400">
                <span>إجمالي الخصم الممنوح ({invoice.discountPercentage}%):</span>
                <span className="font-bold">-{formatCurrency(invoice.discountAmount)}</span>
              </div>

              <div className="pt-2 border-t border-slate-700 flex justify-between items-center">
                <span className="font-bold text-slate-200">إجمالي الفاتورة الصافي النهائي:</span>
                <div className="text-xl font-black text-amber-400">
                  {formatCurrency(invoice.estimatedGrandTotal)}
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Modal Footer Controls (Hidden in Print) */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
          
          {/* Quick Share / Export Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloadingPDF}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloadingPDF ? 'جاري التحميل...' : 'تحميل PDF 📄'}</span>
            </button>

            <button
              onClick={() => shareInvoiceViaWhatsApp(invoice)}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>إرسال واتساب</span>
            </button>

            <button
              onClick={handleCopyText}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 px-3 py-2 rounded-xl transition cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? 'تم النسخ!' : 'نسخ النص'}</span>
            </button>
          </div>

          {/* Sync to Accounting / Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            
            <button
              onClick={handleAccountingSync}
              disabled={isSyncing || invoice.syncedToAccounting}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition ${
                invoice.syncedToAccounting || syncSuccess
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>
                {invoice.syncedToAccounting || syncSuccess
                  ? 'مرحلة لنظام الحسابات المركزي (ERP)'
                  : isSyncing
                  ? 'جاري الترحيل...'
                  : 'ترحيل الفاتورة لنظام الحسابات'}
              </span>
            </button>

            <button
              onClick={onClose}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2 rounded-xl text-xs shadow transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
