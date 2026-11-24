import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  FileText,
  Copy,
  X,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Calendar,
  Phone,
  Hash,
  MessageSquareText,
  Wallet,
  Landmark,
  BarChart3,
  User
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { fetchInvoiceRowById } from '../services/supabaseService';
import { Invoice } from '../types';
import { exportElectronicInvoiceToExcel, exportInvoiceForERP, resolveSafeCustomerCode } from '../services/excelService';
import { downloadInvoicePDF } from '../services/pdfService';
import { formatCurrency } from '../services/invoiceService';
import { resolveCustomerFinancials } from '../services/arabicMatchingService';
import { CustomerOrderAnalyticsModal } from './CustomerOrderAnalyticsModal';

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
  const { invoices } = useApp();
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingBoth, setIsDownloadingBoth] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [hydratedInvoice, setHydratedInvoice] = useState<Invoice | null>(null);

  React.useEffect(() => {
    setHydratedInvoice(invoice);
  }, [invoice]);

  const inv = hydratedInvoice || invoice;

  React.useEffect(() => {
    if (!isOpen || !inv?.id) return;
    const hasItems = Array.isArray((inv as any).items) && (inv as any).items.length > 0;
    if (hasItems) return;
    let cancelled = false;
    (async () => {
      try {
        const row: any = await fetchInvoiceRowById(inv.id);
        if (cancelled || !row) return;
        const items = Array.isArray(row.items)
          ? row.items
          : typeof row.items === 'string'
            ? (() => { try { return JSON.parse(row.items); } catch { return []; } })()
            : [];
        if (!Array.isArray(items) || items.length === 0) return;
        setHydratedInvoice((prev) => {
          const base = prev || inv;
          if ((base as any).id !== inv.id) return prev;
          return { ...(base as any), items } as any;
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isOpen, invoice?.id]);

  if (!isOpen || !inv) return null;

  const {
    debtBefore,
    debtAfter,
    creditLimit,
    isExceeded,
    requiredDown,
    matchedCustomer,
  } = resolveCustomerFinancials(inv as any);

  const resolvedCustomerCode = resolveSafeCustomerCode(inv as any, matchedCustomer);
  const items = Array.isArray((inv as any).items) ? (inv as any).items : [];
  const repComment = String((inv as any).repComment || '').trim();
  const notes = String((inv as any).notes || '').trim();

  // 1. تحميل ملف Excel (شيت واحد نضيف: الأصناف + الإجمالي + الموقف المالي + التعليق)
  const handleDownloadExcel = () => {
    setIsDownloadingExcel(true);
    try {
      exportElectronicInvoiceToExcel(inv as any);
      setDownloadSuccessToast(`تم تحميل ملف Excel للفاتورة #${(inv as any).invoiceNumber} مباشرة على جهازك! 📊`);
      setTimeout(() => setDownloadSuccessToast(null), 3500);
    } catch (err) {
      console.error('Excel download failed:', err);
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  // 2. شيت ERP (نسخة ثانوية لأنظمة المحاسبة)
  const handleDownloadERP = () => {
    setIsDownloadingExcel(true);
    try {
      exportInvoiceForERP(inv as any);
      setDownloadSuccessToast(`تم تحميل شيت ERP للفاتورة #${(inv as any).invoiceNumber} مباشرة على جهازك! 📑`);
      setTimeout(() => setDownloadSuccessToast(null), 3500);
    } catch (err) {
      console.error('ERP download failed:', err);
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  // 3. تحميل PDF
  const handleDownloadPDF = async () => {
    setIsDownloadingPdf(true);
    try {
      await downloadInvoicePDF(inv as any);
      setDownloadSuccessToast(`تم تحميل ملف PDF للفاتورة #${(inv as any).invoiceNumber} مباشرة على جهازك! 📄`);
      setTimeout(() => setDownloadSuccessToast(null), 3500);
    } catch (err) {
      console.error('PDF download failed:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // 4. تحميل الاثنين معًا (PDF + Excel)
  const handleDownloadBoth = async () => {
    setIsDownloadingBoth(true);
    try {
      await downloadInvoicePDF(inv as any);
      setDownloadSuccessToast('جاري استكمال تحميل ملف Excel أيضاً...');
      await new Promise((resolve) => setTimeout(resolve, 600));
      exportElectronicInvoiceToExcel(inv as any);
      setDownloadSuccessToast(`تم بنجاح تحميل ملف PDF وملف Excel للفاتورة #${(inv as any).invoiceNumber} مباشرة على جهازك! 📥⚡`);
      setTimeout(() => setDownloadSuccessToast(null), 4000);
    } catch (err) {
      console.error('Download both failed:', err);
    } finally {
      setIsDownloadingBoth(false);
    }
  };

  // 5. نسخ جدول الأصناف (TSV) — بنفس أعمدة الشيت الجديد
  const handleCopyTable = () => {
    const headers = [
      'م',
      'كود الصنف',
      'الكود الموحد',
      'اسم الصنف',
      'كرتون',
      'شدة',
      'قطع',
      'إجمالي القطع',
      'سعر كرتونة',
      'الإجمالي النهائي'
    ].join('\t');

    const rows = items.map((it: any, idx: number) => {
      const cartonQty = it.cartonQuantity || 1;
      const cCount = it.cartonCount || 0;
      const pCount = it.pieceCount || 0;
      const totalUnits = it.totalUnits || it.totalPieces || (cCount * cartonQty + pCount);
      const netValue = it.netTotal ?? it.totalPrice ?? it.totalBeforeTax;
      const unified = it.unifiedCode || (it.product as any)?.unifiedCode || '---';
      return [
        idx + 1,
        it.productCode,
        unified,
        it.productName,
        cCount,
        cartonQty,
        pCount,
        totalUnits,
        it.appliedPrice || it.pricePerCarton,
        netValue
      ].join('\t');
    }).join('\n');

    navigator.clipboard.writeText(`${headers}\n${rows}`);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2500);
  };

  const financialTiles = [
    { label: 'المديونية السابقة', value: formatCurrency(debtBefore), icon: Wallet, tone: 'slate' as const },
    { label: 'صافي هذه الفاتورة', value: formatCurrency((inv as any).estimatedGrandTotal), icon: FileSpreadsheet, tone: 'blue' as const },
    { label: 'المديونية بعد الفاتورة', value: formatCurrency(debtAfter), icon: Landmark, tone: isExceeded ? ('risk' as const) : ('slate' as const) },
    { label: 'الحد الائتماني', value: formatCurrency(creditLimit), icon: Building2, tone: 'slate' as const },
    ...(isExceeded ? [{ label: 'دفعة مطلوبة فوراً', value: formatCurrency(requiredDown), icon: AlertTriangle, tone: 'risk' as const }] : [])
  ];

  return (
    <div
      id="excel-invoice-preview-modal"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in"
      dir="rtl"
    >
      <div role="dialog" aria-modal="true" className="modal-full-mobile relative z-[60] bg-[var(--app-card)] rounded-2xl sm:rounded-3xl shadow-2xl border border-[var(--app-border)] w-full max-w-full sm:max-w-lg max-h-[96vh] flex flex-col overflow-hidden">

        {/* الشريط العلوي */}
        <div className="bg-slate-900 text-white p-3 sm:p-4 flex items-center justify-between gap-3 border-b-2 border-[var(--app-ok)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[var(--app-ok)] text-white flex items-center justify-center font-black shadow-md shrink-0">
              <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-lg font-black text-white truncate">عرض الفاتورة — شيت الأصناف والإجمالي</h3>
              <p className="text-[10px] sm:text-xs text-slate-300 font-mono truncate">
                #{(inv as any).invoiceNumber} · {formatCurrency((inv as any).estimatedGrandTotal)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* شريط أدوات التحميل */}
        <div className="px-3 sm:px-5 py-2.5 bg-[var(--app-card-secondary)] border-b border-[var(--app-border)] flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={handleDownloadExcel}
            disabled={isDownloadingExcel}
            className="app-btn app-btn-primary flex items-center gap-1.5 text-xs sm:text-sm px-3.5 py-2 cursor-pointer disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            <span>{isDownloadingExcel ? 'جاري التحميل...' : 'تحميل Excel'}</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={isDownloadingPdf}
            className="app-btn app-btn-ghost flex items-center gap-1.5 text-xs sm:text-sm px-3 py-2 cursor-pointer disabled:opacity-60"
          >
            <FileText className="w-4 h-4" />
            <span>{isDownloadingPdf ? 'جاري التحميل...' : 'PDF'}</span>
          </button>
          <button
            onClick={handleDownloadBoth}
            disabled={isDownloadingBoth}
            className="app-btn app-btn-ghost flex items-center gap-1.5 text-xs sm:text-sm px-3 py-2 cursor-pointer disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            <span>{isDownloadingBoth ? 'جاري التحميل...' : 'PDF + Excel'}</span>
          </button>
          <button
            onClick={handleCopyTable}
            className="app-btn app-btn-ghost flex items-center gap-1.5 text-xs sm:text-sm px-3 py-2 cursor-pointer"
          >
            <Copy className="w-4 h-4" />
            <span>نسخ الجدول</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setIsAnalyticsOpen(true)}
            className="app-btn app-btn-ghost flex items-center gap-1.5 text-xs sm:text-sm px-3 py-2 cursor-pointer"
          >
            <BarChart3 className="w-4 h-4" />
            <span>تحليلات العميل</span>
          </button>
          <button
            onClick={handleDownloadERP}
            disabled={isDownloadingExcel}
            className="app-btn app-btn-ghost flex items-center gap-1.5 text-[10px] sm:text-xs px-2.5 py-2 text-[var(--app-text-muted)] cursor-pointer disabled:opacity-60"
            title="شيت مخصص لأنظمة ERP / المحاسبة"
          >
            <span>شيت ERP</span>
          </button>
        </div>

        {/* المحتوى — شيت واحد */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">

          {/* بيانات العميل والفاتورة */}
          <div className="rounded-2xl border border-slate-200 bg-slate-900 text-white p-3.5 sm:p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-black text-sm sm:text-base truncate">{(inv as any).customerName}</div>
                  <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-300 flex-wrap mt-0.5">
                    <span className="font-mono">كود: {resolvedCustomerCode}</span>
                    {(inv as any).customerPhone && (
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{(inv as any).customerPhone}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-300 flex-wrap">
                <span className="flex items-center gap-1"><Hash className="w-3 h-3" />#{(inv as any).invoiceNumber}</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{(inv as any).date} {(inv as any).time || ''}</span>
                <span className="app-badge neutral">{(inv as any).paymentMethod}</span>
              </div>
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-white/10 flex items-center gap-2 text-[10px] sm:text-xs text-slate-300 flex-wrap">
              <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />الفرع: {(inv as any).branchName}</span>
              <span>المندوب: {(inv as any).repName}</span>
              <span className="font-mono">{items.length} صنف</span>
            </div>
          </div>

          {/* الموقف المالي للعميل */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Landmark className="w-4 h-4 text-[var(--app-primary)]" />
              <h4 className="text-xs sm:text-sm font-black text-[var(--app-text)]">الموقف المالي للعميل</h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {financialTiles.map((tile) => (
                <div
                  key={tile.label}
                  className={`rounded-xl border p-2.5 sm:p-3 ${
                    tile.tone === 'risk'
                      ? 'bg-[var(--app-risk-tint)] border-[var(--app-risk-line)]'
                      : tile.tone === 'blue'
                        ? 'bg-[var(--app-primary-tint)] border-[var(--app-primary-border)]'
                        : 'bg-[var(--app-card-secondary)] border-[var(--app-border)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-[var(--app-text-muted)] font-bold mb-1">
                    <tile.icon className="w-3.5 h-3.5" />
                    <span className="truncate">{tile.label}</span>
                  </div>
                  <div className={`text-sm sm:text-base font-black ${
                    tile.tone === 'risk' ? 'text-[var(--app-risk-text)]' : tile.tone === 'blue' ? 'text-[var(--app-primary-text)]' : 'text-[var(--app-text)]'
                  }`}>{tile.value}</div>
                </div>
              ))}
            </div>
            <div className={`mt-2 rounded-xl border px-3 py-2 flex items-center gap-2 text-[11px] sm:text-xs font-bold ${
              isExceeded
                ? 'bg-[var(--app-risk-tint)] border-[var(--app-risk-line)] text-[var(--app-risk-text)]'
                : 'bg-[var(--app-ok-tint)] border-[var(--app-ok-line)] text-[var(--app-ok-text)]'
            }`}>
              {isExceeded
                ? <AlertTriangle className="w-4 h-4 shrink-0" />
                : <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>
                {isExceeded
                  ? `العميل تجاوز الحد الائتماني — المطلوب سداد دفعة نقدية بقيمة ${formatCurrency(requiredDown)} قبل الصرف`
                  : 'الحساب سليم والمديونية داخل الحد الائتماني المعتمد'}
              </span>
            </div>
          </div>

          {/* جدول الأصناف — ديسك توب */}
          <div className="hidden sm:block rounded-2xl border border-[var(--app-border)] overflow-hidden">
            <div className="bg-[var(--app-card-secondary)] px-3.5 py-2 border-b border-[var(--app-border)] flex items-center justify-between">
              <h4 className="text-xs font-black text-[var(--app-text)]">أصناف الفاتورة</h4>
              <span className="text-[10px] text-[var(--app-text-muted)] font-mono">{items.length} صنف</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] sm:text-[11px]">
                    <th className="px-2 py-2 font-bold w-10">م</th>
                    <th className="px-2 py-2 font-bold">كود الصنف</th>
                    <th className="px-2 py-2 font-bold">الكود الموحد</th>
                    <th className="px-2 py-2 font-bold text-right">اسم المنتج</th>
                    <th className="px-2 py-2 font-bold">كرتون</th>
                    <th className="px-2 py-2 font-bold">شدة</th>
                    <th className="px-2 py-2 font-bold">قطع</th>
                    <th className="px-2 py-2 font-bold">إجمالي القطع</th>
                    <th className="px-2 py-2 font-bold">سعر كرتونة</th>
                    <th className="px-2 py-2 font-bold">الإجمالي النهائي</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any, idx: number) => {
                    const cartonQty = it.cartonQuantity || 1;
                    const cCount = it.cartonCount || 0;
                    const pCount = it.pieceCount || 0;
                    const totalUnits = it.totalUnits || it.totalPieces || (cCount * cartonQty + pCount);
                    const netValue = it.netTotal ?? it.totalPrice ?? it.totalBeforeTax;
                    const unified = it.unifiedCode || (it.product as any)?.unifiedCode || '---';
                    const cleanPCode = it.productCode;
                    return (
                      <tr key={it.productId || idx} className={idx % 2 === 1 ? 'bg-[var(--app-card-secondary)]' : 'bg-[var(--app-card)]'}>
                        <td className="px-2 py-2 text-center font-mono text-[var(--app-text-muted)]">{idx + 1}</td>
                        <td className="px-2 py-2 text-center font-mono text-[var(--app-text)]" dir="ltr">{cleanPCode}</td>
                        <td className="px-2 py-2 text-center font-mono text-[var(--app-text)]" dir="ltr">{unified}</td>
                        <td className="px-2 py-2 font-bold text-[var(--app-text)]">{it.productName}</td>
                        <td className="px-2 py-2 text-center font-mono">{cCount}</td>
                        <td className="px-2 py-2 text-center font-mono">{cartonQty}</td>
                        <td className="px-2 py-2 text-center font-mono">{pCount}</td>
                        <td className="px-2 py-2 text-center font-mono font-bold">{totalUnits}</td>
                        <td className="px-2 py-2 text-center font-mono">{formatCurrency(it.appliedPrice || it.pricePerCarton)}</td>
                        <td className="px-2 py-2 text-center font-mono font-black text-[var(--app-text)]">{formatCurrency(netValue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* الأصناف — كروت موبايل */}
          <div className="sm:hidden space-y-2">
            <h4 className="text-xs font-black text-[var(--app-text)] px-1">أصناف الفاتورة ({items.length})</h4>
            {items.map((it: any, idx: number) => {
              const cartonQty = it.cartonQuantity || 1;
              const cCount = it.cartonCount || 0;
              const pCount = it.pieceCount || 0;
              const totalUnits = it.totalUnits || it.totalPieces || (cCount * cartonQty + pCount);
              const netValue = it.netTotal ?? it.totalPrice ?? it.totalBeforeTax;
              return (
                <div key={it.productId || idx} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-black text-xs text-[var(--app-text)] truncate">{it.productName}</div>
                      <div className="font-mono text-[10px] text-[var(--app-text-muted)] mt-0.5" dir="ltr">{it.productCode}</div>
                    </div>
                    <div className="text-[10px] font-mono text-[var(--app-text-muted)] shrink-0">#{idx + 1}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-lg bg-[var(--app-card-secondary)] py-1">
                      <div className="text-[9px] text-[var(--app-text-muted)]">كرتون × شدة</div>
                      <div className="text-xs font-black font-mono text-[var(--app-text)]">{cCount} × {cartonQty}</div>
                    </div>
                    <div className="rounded-lg bg-[var(--app-card-secondary)] py-1">
                      <div className="text-[9px] text-[var(--app-text-muted)]">قطع</div>
                      <div className="text-xs font-black font-mono text-[var(--app-text)]">{pCount}</div>
                    </div>
                    <div className="rounded-lg bg-[var(--app-card-secondary)] py-1">
                      <div className="text-[9px] text-[var(--app-text-muted)]">إجمالي القطع</div>
                      <div className="text-xs font-black font-mono text-[var(--app-text)]">{totalUnits}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] border-t border-[var(--app-border)] pt-2">
                    <span className="font-mono text-[var(--app-text-muted)]">سعر كرتونة: {formatCurrency(it.appliedPrice || it.pricePerCarton)}</span>
                    <span className="font-black text-[var(--app-text)] font-mono">الصافي: {formatCurrency(netValue)}</span>
                  </div>
                  {it.discountAmount > 0 && (
                    <div className="mt-1 text-[10px] font-mono text-[var(--app-risk-text)]">
                      خصم: {formatCurrency(-it.discountAmount)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* الإجمالي */}
          <div className="rounded-2xl border border-[var(--app-border)] overflow-hidden">
            <div className={`flex items-center justify-between px-4 py-2.5 text-xs sm:text-sm ${((inv as any).discountAmount > 0) ? 'border-b border-[var(--app-border)]' : ''}`}>
              <span className="font-bold text-[var(--app-text-muted)]">
                {(inv as any).discountAmount > 0 ? 'إجمالي البضاعة قبل الخصم' : 'إجمالي البضاعة'}
              </span>
              <span className="font-black font-mono text-[var(--app-text)]">{formatCurrency((inv as any).subtotal)}</span>
            </div>
            {(inv as any).discountAmount > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 text-xs sm:text-sm border-b border-[var(--app-border)] bg-[var(--app-risk-tint)]">
                <span className="font-bold text-[var(--app-risk-text)]">إجمالي الخصم التجاري ({(inv as any).discountPercentage}%)</span>
                <span className="font-black font-mono text-[var(--app-risk-text)]">{formatCurrency(-(inv as any).discountAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
              <span className="font-black text-xs sm:text-sm">الإجمالي النهائي المطلوب سداده (الصافي)</span>
              <span className="font-black font-mono text-base sm:text-lg text-[var(--app-ok)]">{formatCurrency((inv as any).estimatedGrandTotal)}</span>
            </div>
          </div>

          {/* التعليق + الملاحظات */}
          {(repComment || notes) && (
            <div className="space-y-2">
              {repComment && (
                <div className="rounded-2xl border border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] p-3 flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[var(--app-warn-line)]/30 text-[var(--app-warn-text)] flex items-center justify-center shrink-0">
                    <MessageSquareText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-black text-[var(--app-warn-text)] mb-0.5">تعليق المندوب</div>
                    <p className="text-xs text-[var(--app-warn-text)] leading-relaxed break-words">{repComment}</p>
                  </div>
                </div>
              )}
              {notes && (
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] p-3 flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[var(--app-card-hover)] text-[var(--app-text-muted)] flex items-center justify-center shrink-0">
                    <MessageSquareText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-black text-[var(--app-text)] mb-0.5">ملاحظات الفاتورة والتسليم</div>
                    <p className="text-xs text-[var(--app-text)] leading-relaxed break-words">{notes}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* التذييل */}
          <div className="rounded-2xl bg-[var(--app-card-secondary)] border border-[var(--app-border)] px-3.5 py-3 text-center space-y-1.5">
            <div className="text-xs sm:text-sm font-black text-[var(--app-text)]">✨ شكرًا لتعاملكم مع شركة دريم للتجارة والتوزيع - مجموعة الطنطاوي ❤️</div>
            <div className="text-[10px] text-[var(--app-text-muted)]">
              التوقيعات: العميل / المحل ................ | المندوب {(inv as any).repName} ................ | أمين المخزن ................ | اعتماد الإدارة ................
            </div>
          </div>
        </div>

        {/* توستات */}
        {copiedToast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[70] bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-[var(--app-ok)]" />
            تم نسخ جدول الأصناف — الصقه مباشرة في Excel أو أي برنامج جداول
          </div>
        )}
        {downloadSuccessToast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[70] bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in fade-in max-w-[90vw]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="truncate">{downloadSuccessToast}</span>
          </div>
        )}
      </div>

      {/* تحليلات العميل */}
      <CustomerOrderAnalyticsModal
        invoice={invoice}
        allInvoices={invoices}
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
      />
    </div>
  );
};
