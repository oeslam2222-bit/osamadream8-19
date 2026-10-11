import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  Printer,
  Receipt,
  Search,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { Invoice, Product } from '../types';
import {
  buildConsolidatedInvoicesData,
  exportConsolidatedInvoiceToExcel,
  ConsolidatedProductLine,
} from '../services/consolidatedInvoiceService';
import { formatCurrency } from '../services/invoiceService';

interface ConsolidatedInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInvoices: Invoice[];
  products: Product[];
  currentBranch?: string;
}

export const ConsolidatedInvoiceModal: React.FC<ConsolidatedInvoiceModalProps> = ({
  isOpen,
  onClose,
  selectedInvoices,
  products,
  currentBranch,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'october_only' | 'branch_covered' | 'october_deficit'>('all');
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Build consolidated order data
  const summary = useMemo(() => {
    return buildConsolidatedInvoicesData(selectedInvoices, products, currentBranch || 'الفرع الرئيسي');
  }, [selectedInvoices, products, currentBranch]);

  // Filter lines
  const filteredLines = useMemo(() => {
    return summary.lines.filter((line) => {
      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const codeMatch = line.productCode.toLowerCase().includes(q);
        const unifiedMatch = line.unifiedCode.toLowerCase().includes(q);
        const nameMatch = line.productName.toLowerCase().includes(q);
        if (!codeMatch && !unifiedMatch && !nameMatch) return false;
      }

      // Filter Mode
      if (filterMode === 'october_only') {
        return line.requiredFromOctober > 0;
      }
      if (filterMode === 'branch_covered') {
        return line.requiredFromOctober === 0;
      }
      if (filterMode === 'october_deficit') {
        return line.octoberCoverageStatus.includes('عجز');
      }

      return true;
    });
  }, [summary.lines, searchTerm, filterMode]);

  if (!isOpen) return null;

  const handleExportExcel = () => {
    setIsExporting(true);
    try {
      exportConsolidatedInvoiceToExcel(summary);
      setExportNotice('تم تصدير شيت الإكسل المنسق والمميز لبيان دمج الفواتير وتوريد مخزن أكتوبر بنجاح 📊');
      setTimeout(() => setExportNotice(null), 4500);
    } catch (err: any) {
      alert(`حدث خطأ أثناء تصدير الإكسل: ${err?.message || ''}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in"
      dir="rtl"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-6xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden text-white">
        
        {/* ================= MODAL HEADER ================= */}
        <div className="p-3.5 sm:p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-black shadow-inner shrink-0">
              <Boxes className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  دمج الفواتير وتحليل طلبية مخزن 6 أكتوبر المركزي
                </h2>
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                  {summary.invoicesCount} فواتير مدمجة
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                الفرع: <strong className="text-amber-300">{summary.branchName}</strong> • عدد العملاء: <strong className="text-sky-300">{summary.uniqueCustomersCount}</strong> عميل • تاريخ البيان: <span className="font-mono">{summary.dateLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting || summary.lines.length === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-40"
              title="تصدير شيت إكسل منسق ومميز (منتجات، أكواد، كراتين، قطع، شدة، وإجمالي)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">{isExporting ? 'جاري التصدير...' : 'تصدير إكسل منسق 📊'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold p-2 sm:px-3 sm:py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
              title="طباعة التقرير"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">طباعة</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success / Alert Toast */}
        {exportNotice && (
          <div className="bg-emerald-600 text-white p-2.5 px-4 text-xs font-black flex items-center justify-between border-b border-emerald-500 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
              <span>{exportNotice}</span>
            </div>
            <button onClick={() => setExportNotice(null)} className="text-emerald-100 hover:text-white p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ================= MODAL BODY ================= */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-900 space-y-4">
          
          {/* KPI Analytics Cards Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {/* 1. Total Invoices & Customers */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                <Receipt className="w-3 h-3 text-sky-400" />
                <span>الفواتير والعملاء:</span>
              </div>
              <div className="text-sm sm:text-base font-black text-sky-300 font-mono mt-1">
                {summary.invoicesCount} فواتير / {summary.uniqueCustomersCount} عميل
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {summary.productCount} صنف مطلوب
              </div>
            </div>

            {/* 2. Total Requested Cartons */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <div className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                <Boxes className="w-3 h-3 text-amber-400" />
                <span>إجمالي الكراتين المطلوبة:</span>
              </div>
              <div className="text-sm sm:text-base font-black text-amber-300 font-mono mt-1">
                {summary.totalCartons} كرتونة
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                + {summary.totalPieces} قطع فردية
              </div>
            </div>

            {/* 3. Branch Covered Stock */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <Warehouse className="w-3 h-3 text-emerald-400" />
                <span>المتوفر بمخزن الفرع:</span>
              </div>
              <div className="text-sm sm:text-base font-black text-emerald-400 font-mono mt-1">
                {summary.totalBranchAvailableCartons} كرتونة
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                يصرف مباشرة من الفرع
              </div>
            </div>

            {/* 4. Required from October Central Warehouse */}
            <div className="bg-amber-500/10 p-3 rounded-2xl border border-amber-500/40">
              <div className="text-[10px] text-amber-300 font-black flex items-center gap-1">
                <Truck className="w-3 h-3 text-amber-400" />
                <span>المطلوب توريده من أكتوبر:</span>
              </div>
              <div className="text-sm sm:text-base font-black text-amber-400 font-mono mt-1">
                {summary.totalRequiredFromOctober} كرتونة
              </div>
              <div className="text-[10px] text-amber-300/80 mt-0.5">
                نواقص الفرع المحولة لأكتوبر
              </div>
            </div>

            {/* 5. Total Financial Revenue */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 col-span-2 sm:col-span-1">
              <div className="text-[10px] text-purple-400 font-bold flex items-center gap-1">
                <span>القيمة المالية الإجمالية:</span>
              </div>
              <div className="text-sm sm:text-base font-black text-purple-300 font-mono mt-1 truncate">
                {formatCurrency(summary.totalAmount)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                إجمالي الفواتير المجمعة
              </div>
            </div>
          </div>

          {/* October Stock Deficit Alert Banner if any */}
          {summary.octoberDeficitCount > 0 && (
            <div className="bg-rose-950/40 border border-rose-800/60 p-3 rounded-2xl flex items-center gap-2 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                تنبيه تشغيلي: يوجد ({summary.octoberDeficitCount}) صنف مطلوب يتجاوز رصيد مخزن 6 أكتوبر الحالي، مما يستلزم أمر إنتاج أو شراء عاجل.
              </span>
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="bg-slate-955 p-3 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="البحث باسم المنتج، الكود، أو الكود الموحد..."
                className="w-full bg-slate-900 border border-slate-750 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 w-full sm:w-auto overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  filterMode === 'all' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                }`}
              >
                كافة الأصناف ({summary.lines.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('october_only')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  filterMode === 'october_only' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                }`}
              >
                طلب توريد أكتوبر ({summary.lines.filter((l) => l.requiredFromOctober > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('branch_covered')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  filterMode === 'branch_covered' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-300 hover:text-white'
                }`}
              >
                متوفر بالفرع ({summary.lines.filter((l) => l.requiredFromOctober === 0).length})
              </button>
              {summary.octoberDeficitCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterMode('october_deficit')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    filterMode === 'october_deficit' ? 'bg-rose-600 text-white font-black' : 'text-rose-400 hover:text-rose-300'
                  }`}
                >
                  عجز بأكتوبر ({summary.octoberDeficitCount})
                </button>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto max-h-[50vh]">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-900/90 sticky top-0 z-10 border-b border-slate-800 text-[11px] text-slate-300 font-black">
                  <tr>
                    <th className="py-3 px-2 text-center w-10">م</th>
                    <th className="py-3 px-3">اسم المنتج والأكواد</th>
                    <th className="py-3 px-2 text-center">شدة الكرتونة</th>
                    <th className="py-3 px-2 text-center">عدد الكرتون</th>
                    <th className="py-3 px-2 text-center">قطع فردية</th>
                    <th className="py-3 px-2 text-center">إجمالي القطع</th>
                    <th className="py-3 px-2 text-center">رصيد الفرع</th>
                    <th className="py-3 px-2 text-center">رصيد أكتوبر</th>
                    <th className="py-3 px-2 text-center bg-amber-500/10 text-amber-300">المطلوب من أكتوبر (ك)</th>
                    <th className="py-3 px-2 text-center">حالة الصرف والتوريد</th>
                    <th className="py-3 px-2 text-center">تغطية أكتوبر</th>
                    <th className="py-3 px-3 text-left">الإجمالي (ج.م)</th>
                    <th className="py-3 px-2 text-center w-12">التفاصيل</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-850">
                  {filteredLines.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-slate-400 text-xs">
                        لا توجد أصناف تطابق معايير البحث والفلترة.
                      </td>
                    </tr>
                  ) : (
                    filteredLines.map((line, idx) => {
                      const isExpanded = expandedLineId === line.id;

                      return (
                        <React.Fragment key={line.id}>
                          <tr className={`hover:bg-slate-900/70 transition ${line.requiredFromOctober > 0 ? 'bg-amber-950/10' : ''}`}>
                            <td className="py-2.5 px-2 text-center font-mono text-slate-400 text-[11px]">
                              {idx + 1}
                            </td>

                            {/* Product Name & Codes */}
                            <td className="py-2.5 px-3 min-w-[200px]">
                              <div className="font-bold text-white text-xs">{line.productName}</div>
                              <div className="flex items-center gap-1.5 flex-wrap text-[10px] mt-0.5">
                                <span className="bg-slate-900 text-amber-300 font-mono font-bold px-1.5 py-0.2 rounded border border-slate-800">
                                  {line.productCode}
                                </span>
                                {line.unifiedCode !== '---' && (
                                  <span className="bg-indigo-950 text-indigo-300 font-mono font-bold px-1.5 py-0.2 rounded border border-indigo-800">
                                    الموحد: {line.unifiedCode}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Carton Factor (شدة الكرتونة) */}
                            <td className="py-2.5 px-2 text-center font-mono text-slate-300">
                              {line.cartonFactor} ق
                            </td>

                            {/* Carton Count (عدد الكرتون) */}
                            <td className="py-2.5 px-2 text-center font-mono font-black text-amber-300">
                              {line.cartonCount} ك
                            </td>

                            {/* Piece Count (عدد القطع) */}
                            <td className="py-2.5 px-2 text-center font-mono text-sky-300">
                              {line.pieceCount > 0 ? `${line.pieceCount} ق` : '---'}
                            </td>

                            {/* Total Pieces (إجمالي القطع) */}
                            <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-200">
                              {line.totalPieces}
                            </td>

                            {/* Branch Stock */}
                            <td className="py-2.5 px-2 text-center font-mono font-bold">
                              <span className={line.branchStock > 0 ? 'text-emerald-400' : 'text-slate-400'}>
                                {line.branchStock} ك
                              </span>
                            </td>

                            {/* October Stock */}
                            <td className="py-2.5 px-2 text-center font-mono font-bold">
                              <span className={line.octoberStock >= line.requiredFromOctober ? 'text-sky-300' : 'text-rose-400'}>
                                {line.octoberStock} ك
                              </span>
                            </td>

                            {/* Required from October */}
                            <td className="py-2.5 px-2 text-center font-mono font-black bg-amber-500/10">
                              {line.requiredFromOctober > 0 ? (
                                <span className="text-amber-400 bg-amber-400/20 px-2 py-0.5 rounded-full border border-amber-400/30">
                                  {line.requiredFromOctober} ك
                                </span>
                              ) : (
                                <span className="text-emerald-400 text-[10px]">مغطى بالفرع</span>
                              )}
                            </td>

                            {/* Supply Status */}
                            <td className="py-2.5 px-2 text-center text-[10.5px]">
                              {line.supplyStatus === 'متوفر بالفرع بالكامل' ? (
                                <span className="text-emerald-400 font-bold">متوفر بالفرع 🟢</span>
                              ) : line.supplyStatus === 'عجز جزئي - توريد من أكتوبر' ? (
                                <span className="text-amber-300 font-bold">عجز جزئي (أكتوبر) 🟡</span>
                              ) : (
                                <span className="text-rose-400 font-bold">نواقص بالكامل (أكتوبر) 🔴</span>
                              )}
                            </td>

                            {/* October Coverage */}
                            <td className="py-2.5 px-2 text-center text-[10px] font-bold">
                              {line.requiredFromOctober === 0 ? (
                                <span className="text-slate-400">---</span>
                              ) : line.octoberCoverageStatus.includes('عجز') ? (
                                <span className="text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-800">
                                  عجز بأكتوبر 🔴
                                </span>
                              ) : (
                                <span className="text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800">
                                  جاهز للصرف 🟢
                                </span>
                              )}
                            </td>

                            {/* Line Total Price */}
                            <td className="py-2.5 px-3 text-left font-mono font-black text-amber-400">
                              {formatCurrency(line.totalPrice)}
                            </td>

                            {/* Invoices Breakdown Toggle */}
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => setExpandedLineId(isExpanded ? null : line.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                                title="عرض تفاصيل الفواتير الطالبة لهذا الصنف"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Invoices Sources Detail */}
                          {isExpanded && (
                            <tr className="bg-slate-950/90 border-y border-slate-800">
                              <td colSpan={13} className="p-3 text-xs">
                                <div className="space-y-1.5 pr-6">
                                  <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                                    <Receipt className="w-3.5 h-3.5 text-amber-400" />
                                    <span>تفاصيل طلبات الصنف عبر ({line.sources.length}) فواتير:</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                                    {line.sources.map((src, sIdx) => (
                                      <div key={sIdx} className="bg-slate-900 p-2 rounded-xl border border-slate-800 text-[11px] space-y-0.5">
                                        <div className="flex items-center justify-between">
                                          <span className="font-mono text-amber-300 font-bold">#{src.invoiceNumber}</span>
                                          <span className="text-slate-400 font-mono text-[10px]">{src.date || ''}</span>
                                        </div>
                                        <div className="font-bold text-white truncate">{src.customerName}</div>
                                        <div className="flex items-center justify-between text-slate-300 text-[10px] pt-0.5">
                                          <span>المندوب: {src.repName || '---'}</span>
                                          <span className="font-bold text-amber-400 font-mono">
                                            {src.cartons} ك {src.pieces > 0 ? `+ ${src.pieces} ق` : ''}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>

                {/* Table Footer Totals */}
                <tfoot className="bg-slate-900 border-t-2 border-slate-750 font-black text-xs text-white">
                  <tr>
                    <td colSpan={3} className="py-3 px-3">
                      إجمالي الفاتورة المجمعة ({summary.productCount} صنف)
                    </td>
                    <td className="py-3 px-2 text-center font-mono text-amber-300 text-sm">
                      {summary.totalCartons} ك
                    </td>
                    <td className="py-3 px-2 text-center font-mono text-sky-300">
                      {summary.totalPieces} ق
                    </td>
                    <td className="py-3 px-2 text-center font-mono text-slate-200">
                      {summary.grandTotalPieces}
                    </td>
                    <td className="py-3 px-2 text-center font-mono text-emerald-400">
                      {summary.totalBranchAvailableCartons} ك
                    </td>
                    <td className="py-3 px-2 text-center text-slate-400">---</td>
                    <td className="py-3 px-2 text-center font-mono text-amber-400 text-sm bg-amber-500/10">
                      {summary.totalRequiredFromOctober} ك
                    </td>
                    <td colSpan={2} className="py-3 px-2 text-center text-[11px] text-amber-300">
                      {summary.totalRequiredFromOctober > 0 ? `تحويل ${summary.totalRequiredFromOctober} كرتونة من أكتوبر` : 'مغطى محلياً بالكامل'}
                    </td>
                    <td className="py-3 px-3 text-left font-mono text-amber-400 text-sm">
                      {formatCurrency(summary.totalAmount)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div className="p-3.5 sm:p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2 shrink-0">
          <div className="text-xs text-slate-400">
            <span>ملخص التحويل: </span>
            <strong className="text-white">{summary.totalCartons}</strong> كرتونة مطلوبة • منها <strong className="text-emerald-400">{summary.totalBranchAvailableCartons}</strong> كرتونة بالفرع • و <strong className="text-amber-400">{summary.totalRequiredFromOctober}</strong> كرتونة من مخزن 6 أكتوبر
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting || summary.lines.length === 0}
              className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-40"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير تقرير الإكسل المنسق والمميز 📊</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
