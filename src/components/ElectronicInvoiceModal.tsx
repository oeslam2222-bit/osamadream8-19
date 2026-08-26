import {
  Building2,
  CheckCircle,
  Clock,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  MapPin,
  Phone,
  Printer,
  QrCode,
  Server,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  UserCheck,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { COMPANY_INFO } from '../data/mockData';
import { exportElectronicInvoiceToExcel, exportInvoiceForERP } from '../services/excelService';
import { formatArabicDate, formatCurrency } from '../services/invoiceService';
import { downloadInvoicePDF } from '../services/pdfService';
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [copiedInvoiceNo, setCopiedInvoiceNo] = useState(false);

  if (!isOpen || !invoice) return null;

  const handleDownloadPDF = async () => {
    setIsDownloadingPDF(true);
    try {
      await downloadInvoicePDF(invoice);
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyInvoiceNumber = () => {
    navigator.clipboard.writeText(invoice.invoiceNumber);
    setCopiedInvoiceNo(true);
    setTimeout(() => setCopiedInvoiceNo(false), 2500);
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
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[95vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden print:max-h-none print:shadow-none print:border-none print:w-full">
        
        {/* Top Control Bar (Hidden in Print) */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black flex items-center gap-2">
                <span>فاتورة مبيعات معتمدة - شركة دريم</span>
                <span className="bg-amber-400/20 text-amber-300 text-[11px] font-mono px-2 py-0.5 rounded-md border border-amber-400/40">
                  {invoice.invoiceNumber}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                تصدير احترافي ومباشر بصيغتي PDF الرسمية وشيت إكسل عالي التنسيق
              </p>
            </div>
          </div>

          {/* Action Buttons in Header */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Direct High-Quality PDF Download */}
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloadingPDF}
              className="flex items-center gap-1.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white px-3.5 py-2 rounded-xl text-xs font-black transition shadow-sm cursor-pointer disabled:opacity-50"
              title="تحميل فاتورة PDF رسمية فاخرة ومعدة للطباعة"
            >
              <Download className={`w-3.5 h-3.5 ${isDownloadingPDF ? 'animate-bounce' : ''}`} />
              <span>{isDownloadingPDF ? 'جاري التجهيز...' : 'تحميل PDF فاخر 📄'}</span>
            </button>

            {/* Excel Download Standard */}
            <button
              onClick={() => exportElectronicInvoiceToExcel(invoice)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              title="تصدير شيت إكسل رسمي منسق"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>تصدير إكسل 📊</span>
            </button>

            {/* Excel Download ERP Format */}
            <button
              onClick={() => exportInvoiceForERP(invoice)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-2 rounded-xl text-xs font-black transition shadow-xs cursor-pointer"
              title="تصدير شيت إكسل مهيأ للرفع على برنامج الحسابات الرئيسي (ERP)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">شيت ERP للسيستم</span>
            </button>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
              title="طباعة فورية"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Electronic Invoice Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-7 space-y-5 text-slate-900 bg-white" id="printable-invoice">
          
          {/* Header Banner - Company Identity */}
          <div className="border-b-2 border-slate-900 pb-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              
              {/* Right: Company Logo & Details */}
              <div className="text-center sm:text-right space-y-1">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black text-sm shadow-xs">
                    D
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-2xl font-black text-slate-950 tracking-tight">
                      {COMPANY_INFO.nameArabic}
                    </h1>
                    <div className="text-[10px] sm:text-xs font-bold text-slate-500 font-sans tracking-wide">
                      {COMPANY_INFO.nameEnglish}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] sm:text-xs text-slate-600 font-medium pt-1">
                  {COMPANY_INFO.activity} • {COMPANY_INFO.headquarters}
                </p>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 text-[11px] text-slate-700 pt-0.5">
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                    س.ت: <strong>{COMPANY_INFO.commercialRegister}</strong>
                  </span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                    ب.ض: <strong>{COMPANY_INFO.taxNumber}</strong>
                  </span>
                  <span className="bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-amber-900 font-bold">
                    الخط الساخن: <strong>{COMPANY_INFO.customerService}</strong>
                  </span>
                </div>
              </div>

              {/* Left: Official Invoice Tag & Stamp Badge */}
              <div className="flex items-center gap-3">
                <div className="text-center sm:text-left">
                  <div className="inline-block bg-slate-900 text-amber-300 font-black text-xs px-3.5 py-1 rounded-lg shadow-xs">
                    فاتورة مبيعات معتمدة
                  </div>
                  <div className="text-base font-black text-slate-900 mt-1 font-mono tracking-wider">
                    {invoice.invoiceNumber}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    تاريخ: {invoice.date} {invoice.time ? `(${invoice.time})` : ''}
                  </div>
                </div>

                {/* QR Code Identification */}
                <div className="w-20 h-20 bg-slate-50 p-1.5 rounded-2xl border-2 border-slate-900 flex flex-col items-center justify-center text-center shrink-0 shadow-xs">
                  <QrCode className="w-11 h-11 text-slate-900" />
                  <span className="text-[7px] font-black text-slate-700 pt-0.5 font-mono">DREAM DIST</span>
                </div>
              </div>

            </div>
          </div>

          {/* Customer Appreciation Banner */}
          <div className="bg-gradient-to-r from-amber-400/20 via-amber-400/10 to-amber-400/20 border border-amber-400/50 rounded-2xl p-2.5 text-center shadow-xs">
            <p className="text-xs sm:text-sm font-black text-amber-950 flex items-center justify-center gap-1.5">
              <span>✨ شكراً لتعاملكم واختياركم شركة دريم للتجارة والتوزيع ❤️</span>
            </p>
          </div>

          {/* Customer and Invoice Details Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] font-bold">اسم العميل / المنشأة:</span>
              <strong className="text-slate-900 text-xs sm:text-sm font-black flex items-center gap-1 mt-0.5">
                <Store className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{invoice.customerName}</span>
              </strong>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px] font-bold">كود العميل:</span>
              <strong className="text-slate-900 font-mono font-bold block mt-0.5">
                {invoice.customerCode || '---'}
              </strong>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px] font-bold">هاتف العميل:</span>
              <strong className="text-slate-900 font-mono font-bold block mt-0.5">
                {invoice.customerPhone || '---'}
              </strong>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px] font-bold">عنوان التسليم:</span>
              <strong className="text-slate-900 font-semibold block mt-0.5 truncate" title={invoice.customerAddress || ''}>
                {invoice.customerAddress || '---'}
              </strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] font-bold">المندوب المسئول:</span>
              <strong className="text-slate-900 font-bold block mt-0.5">
                {invoice.repName}
              </strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] font-bold">المشرف المسؤول:</span>
              <strong className="text-slate-900 font-bold block mt-0.5">
                {invoice.supervisorName || 'الإدارة العامة'}
              </strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] font-bold">فرع الصرف:</span>
              <strong className="text-slate-900 font-bold block mt-0.5">
                {invoice.branchName}
              </strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] font-bold">طريقة السداد:</span>
              <span className="inline-block bg-slate-200 text-slate-900 px-2 py-0.5 rounded-md font-black text-[10px] mt-0.5">
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
                  <th className="p-2.5 text-center">الكراتين المطلوبة</th>
                  <th className="p-2.5 text-left">سعر الكرتونة</th>
                  <th className="p-2.5 text-left">الإجمالي</th>
                  <th className="p-2.5 text-left">الخصم</th>
                  <th className="p-2.5 text-left">الصافي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoice.items.map((item, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="p-2.5 text-center text-slate-400 font-mono text-[11px]">{index + 1}</td>
                    <td className="p-2.5 font-black font-mono text-slate-800">{item.productCode}</td>
                    <td className="p-2.5 font-bold text-slate-900">
                      <div>{item.productName}</div>
                      {item.fulfilledFrom === 'main_warehouse' && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded font-bold border border-amber-200 inline-block mt-0.5">
                          سحب مركزي (أكتوبر)
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-center text-slate-600 font-bold">{item.cartonQuantity || 1} ق</td>
                    <td className="p-2.5 text-center font-black text-amber-950 bg-amber-50/60">
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

          {/* Financial Summary & Stamp Breakdown */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            
            {/* Notes & Stamps */}
            <div className="w-full sm:w-1/2 space-y-3">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-1">
                <span className="font-bold text-slate-800 block text-[11px]">شروط وإقرار الاستلام لشركة دريم:</span>
                <p className="text-slate-500 text-[10px] leading-relaxed">
                  البضاعة المباعة تخضع لمطابقة الكود والعدد عند الاستلام. يعتبر توقيع العميل إقراراً بالاستلام بحالة ممتازة ومطابقة لكشف الحساب.
                </p>
                {invoice.notes && (
                  <div className="pt-1 text-slate-800 font-bold text-[11px]">
                    ملاحظات: {invoice.notes}
                  </div>
                )}
              </div>

              {/* Official Signatures & Stamp */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="text-center p-2 border border-dashed border-slate-300 rounded-2xl">
                  <div className="h-10 flex items-center justify-center font-black text-slate-300 text-xs">
                    ختم شركة دريم
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 border-t border-slate-200 pt-1 block">
                    اعتماد الإدارة / المشرف
                  </span>
                </div>

                <div className="text-center p-2 border border-dashed border-slate-300 rounded-2xl">
                  <div className="h-10 flex items-center justify-center font-black text-slate-300 text-xs">
                    توقيع المستلم
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 border-t border-slate-200 pt-1 block">
                    استلام وختم العميل
                  </span>
                </div>
              </div>
            </div>

            {/* Calculations Totals Box */}
            <div className="w-full sm:w-96 bg-slate-900 text-white p-4 rounded-3xl space-y-2.5 text-xs shadow-md">
              <div className="flex justify-between items-center text-slate-300">
                <span>إجمالي الكراتين المطلوبة:</span>
                <strong className="text-white font-black text-sm">{invoice.totalCartons} كرتونة</strong>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>المجموع الفرعي (قبل الخصم):</span>
                <span className="font-bold">{formatCurrency(invoice.subtotal)}</span>
              </div>

              <div className="flex justify-between items-center text-emerald-400">
                <span>الخصم الممنوح ({invoice.discountPercentage}%):</span>
                <span className="font-bold">-{formatCurrency(invoice.discountAmount)}</span>
              </div>

              <div className="pt-2 border-t border-slate-700 flex justify-between items-center">
                <span className="font-bold text-slate-200 text-xs">إجمالي الفاتورة الصافي النهائي:</span>
                <div className="text-xl font-black text-amber-400 font-mono">
                  {formatCurrency(invoice.estimatedGrandTotal)}
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Modal Footer Controls (Hidden in Print) */}
        <div className="bg-slate-50 p-3.5 sm:p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick PDF Button */}
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloadingPDF}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloadingPDF ? 'جاري التحميل...' : 'تحميل PDF 📄'}</span>
            </button>

            {/* Standard Excel Button */}
            <button
              onClick={() => exportElectronicInvoiceToExcel(invoice)}
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>تصدير شيت إكسل 📊</span>
            </button>

            {/* Copy Invoice Number */}
            <button
              onClick={handleCopyInvoiceNumber}
              className="flex items-center gap-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 px-3 py-2 rounded-xl transition cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedInvoiceNo ? 'تم نسخ الرقم! ✓' : 'نسخ رقم الفاتورة'}</span>
            </button>
          </div>

          {/* Sync to Accounting / Close */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleAccountingSync}
              disabled={isSyncing || invoice.syncedToAccounting}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition ${
                invoice.syncedToAccounting || syncSuccess
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
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
              className="bg-slate-900 hover:bg-slate-800 text-white font-black px-5 py-2 rounded-xl text-xs shadow transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
