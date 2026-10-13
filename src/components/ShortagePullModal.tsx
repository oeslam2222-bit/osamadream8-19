import React, { useMemo, useState } from 'react';
import {
  Truck,
  Mail,
  Copy,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Building2,
  User as UserIcon,
  Calendar,
  AlertTriangle,
  X,
  Package,
  Send,
  Search,
  Warehouse,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { Invoice, InvoiceItem, Product, User } from '../types';
import { cleanProductCode } from '../services/excelService';
import { isBranchMatch } from '../services/arabicMatchingService';
import { formatCurrency, formatArabicDate } from '../services/invoiceService';
import { buildDispatchReport, downloadDispatchReport } from '../services/dispatchReportService';

interface ShortagePullModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: Invoice[];
  products: Product[];
  currentUser: User | null;
  onConfirmDispatch?: (invoiceIds: string[]) => void;
}

export interface AggregatedShortageProduct {
  productId: string;
  productCode: string;
  unifiedCode: string;
  productName: string;
  color?: string;
  category: string;
  cartonQuantity: number;
  totalRequestedCartons: number;
  totalRequestedPieces: number;
  octoberStock: number;
  coverageStatus: 'متوفر بالكامل بأكتوبر ✅' | 'عجز جزئي بأكتوبر ⚠️' | 'غير متوفر بأكتوبر ❌';
  invoicesList: {
    invoiceId: string;
    invoiceNumber: string;
    customerName: string;
    repName: string;
    branchName: string;
    cartons: number;
    pieces: number;
  }[];
}

export const ShortagePullModal: React.FC<ShortagePullModalProps> = ({
  isOpen,
  onClose,
  invoices,
  products,
  currentUser,
  onConfirmDispatch,
}) => {
  const [activeTab, setActiveTab] = useState<'aggregate' | 'invoices'>('aggregate');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('الكل');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'custom'>('all');
  const [customDate, setCustomDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedTable, setCopiedTable] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isConfirmingSystem, setIsConfirmingSystem] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [expandedProductKey, setExpandedProductKey] = useState<string | null>(null);

  // Today ISO
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // 1. Role Scoping Logic
  const roleScopeLabel = useMemo(() => {
    if (!currentUser) return 'سحب النواقص العامة';
    if (currentUser.role === 'supervisor') {
      return `نطاق المشرف: سحب نواقص المناديب التابعين للمشرف (${currentUser.name})`;
    }
    if (currentUser.role === 'branch_manager') {
      return `نطاق مدير الفرع: سحب كافة نواقص فرع (${currentUser.branchName || 'الفرع'})`;
    }
    return `الإدارة العامة / المطور: سحب ومتابعة نواقص الفروع لمخزن 6 أكتوبر`;
  }, [currentUser]);

  // 2. Filter invoices by Role & Date
  const scopedInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Exclude cancelled invoices
      if (inv.status === 'ملغاة' || inv.status === 'مرفوضة / ملغاة') return false;

      // Role boundary
      if (currentUser?.role === 'supervisor') {
        const isSupervisorMatch = inv.supervisorName === currentUser.name ||
          (currentUser.name && inv.supervisorName && inv.supervisorName.trim() === currentUser.name.trim());
        const isRepOwner = inv.repId === currentUser.id || inv.repName === currentUser.name;
        if (!isSupervisorMatch && !isRepOwner) return false;
      } else if (currentUser?.role === 'branch_manager') {
        if (!isBranchMatch(inv.branchName, currentUser.branchName, { allowUnassigned: false })) {
          return false;
        }
      } else if (currentUser?.role === 'admin' || currentUser?.role === 'developer') {
        if (selectedBranch !== 'الكل' && !isBranchMatch(inv.branchName, selectedBranch, { allowUnassigned: false })) {
          return false;
        }
      }

      // Date boundary
      const invDate = (inv.date || '').slice(0, 10);
      if (dateFilter === 'today' && invDate !== todayIso) return false;
      if (dateFilter === 'custom' && invDate !== customDate) return false;

      // Must have shortages
      const hasShortages = inv.hasOctoberShortages ||
        Boolean(inv.shortageItemsCount && inv.shortageItemsCount > 0) ||
        inv.items.some((it) => it.isShortage || it.needsOctoberSupply || it.fulfilledFrom === 'main_warehouse' || (it.shortageCartons && it.shortageCartons > 0));

      return hasShortages;
    });
  }, [invoices, currentUser, selectedBranch, dateFilter, customDate, todayIso]);

  // Extract all unique branches from scoped invoices
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i) => {
      if (i.branchName) set.add(i.branchName);
    });
    return Array.from(set);
  }, [invoices]);

  // 3. Aggregate shortage lines across scoped invoices
  const { aggregatedProducts, totalShortageCartons, totalShortagePieces, totalEstimatedValue } = useMemo(() => {
    const map = new Map<string, AggregatedShortageProduct>();
    let totalCartons = 0;
    let totalPieces = 0;
    let totalValue = 0;

    scopedInvoices.forEach((inv) => {
      (inv.items || []).forEach((item) => {
        const itemAny = item as any;
        const isShortage = Boolean(
          item.isShortage ||
          item.needsOctoberSupply ||
          item.fulfilledFrom === 'main_warehouse' ||
          item.fulfillFromMainWarehouse ||
          (item.shortageCartons && item.shortageCartons > 0) ||
          itemAny.octoberSupplyStatus === 'مطلوب توريده من أكتوبر'
        );

        if (!isShortage) return;

        const prod = products.find(
          (p) =>
            cleanProductCode(p.code) === cleanProductCode(item.productCode) ||
            (p.unifiedCode && item.unifiedCode && p.unifiedCode.replace(/^#/, '') === item.unifiedCode.replace(/^#/, '')) ||
            p.name.trim().toLowerCase() === item.productName.trim().toLowerCase()
        );

        const key = cleanProductCode(item.productCode) || item.productName;
        const reqCartons = item.shortageCartons && item.shortageCartons > 0
          ? item.shortageCartons
          : (item.cartonCount || 0);
        const reqPieces = item.shortagePieces && item.shortagePieces > 0
          ? item.shortagePieces
          : (item.pieceCount || 0);

        const octoberStock = typeof item.octoberStockAtOrder === 'number'
          ? item.octoberStockAtOrder
          : (prod?.mainWarehouseActual || 0);

        const price = item.appliedPrice || item.pricePerCarton || prod?.cartonPrice || 200;

        totalCartons += reqCartons;
        totalPieces += reqPieces;
        totalValue += (reqCartons * price);

        const invLine = {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerName,
          repName: inv.repName,
          branchName: inv.branchName || 'الفرع',
          cartons: reqCartons,
          pieces: reqPieces,
        };

        const existing = map.get(key);
        if (existing) {
          existing.totalRequestedCartons += reqCartons;
          existing.totalRequestedPieces += reqPieces;
          existing.invoicesList.push(invLine);
          // Update coverage status
          if (existing.octoberStock >= existing.totalRequestedCartons) {
            existing.coverageStatus = 'متوفر بالكامل بأكتوبر ✅';
          } else if (existing.octoberStock > 0) {
            existing.coverageStatus = 'عجز جزئي بأكتوبر ⚠️';
          } else {
            existing.coverageStatus = 'غير متوفر بأكتوبر ❌';
          }
        } else {
          let coverage: AggregatedShortageProduct['coverageStatus'] = 'غير متوفر بأكتوبر ❌';
          if (octoberStock >= reqCartons) {
            coverage = 'متوفر بالكامل بأكتوبر ✅';
          } else if (octoberStock > 0) {
            coverage = 'عجز جزئي بأكتوبر ⚠️';
          }

          map.set(key, {
            productId: prod?.id || item.productId,
            productCode: cleanProductCode(item.productCode || prod?.code),
            unifiedCode: item.unifiedCode || prod?.unifiedCode || '---',
            productName: item.productName || prod?.name || 'صنف',
            color: item.color || prod?.color,
            category: prod?.category || 'عام',
            cartonQuantity: item.cartonQuantity || prod?.cartonQuantity || 24,
            totalRequestedCartons: reqCartons,
            totalRequestedPieces: reqPieces,
            octoberStock,
            coverageStatus: coverage,
            invoicesList: [invLine],
          });
        }
      });
    });

    return {
      aggregatedProducts: Array.from(map.values()),
      totalShortageCartons: totalCartons,
      totalShortagePieces: totalPieces,
      totalEstimatedValue: totalValue,
    };
  }, [scopedInvoices, products]);

  // Filtered by Search
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return aggregatedProducts;
    const q = searchTerm.toLowerCase().trim();
    return aggregatedProducts.filter(
      (p) =>
        p.productName.toLowerCase().includes(q) ||
        p.productCode.toLowerCase().includes(q) ||
        (p.unifiedCode && p.unifiedCode.toLowerCase().includes(q))
    );
  }, [aggregatedProducts, searchTerm]);

  // Formatted Email Content Generation
  const emailContent = useMemo(() => {
    const branchNameStr = currentUser?.branchName || selectedBranch !== 'الكل' ? selectedBranch : 'فروع شركة دريم';
    const requesterName = currentUser?.name || 'المسؤول';
    const requesterRole = currentUser?.role === 'supervisor'
      ? 'مشرف مبيعات'
      : currentUser?.role === 'branch_manager'
      ? 'مدير الفرع'
      : 'الإدارة';

    const dateStr = dateFilter === 'today'
      ? todayIso
      : dateFilter === 'custom'
      ? customDate
      : new Date().toLocaleDateString('ar-EG');

    let body = `السادة إدارة المخزن المركزي (6 أكتوبر) المحترمين،\n`;
    body += `تحية طيبة وبعد،،،\n\n`;
    body += `نرجو التكرم باعتماد وتجهيز سحب فواتير النواقص المطلوبة أدناه للطلبيات المعتمدة:\n`;
    body += `--------------------------------------------------\n`;
    body += `• الفرع الطالب: ${branchNameStr}\n`;
    body += `• مقدم الطلب: ${requesterName} (${requesterRole})\n`;
    body += `• تاريخ الحصر: ${dateStr}\n`;
    body += `• عدد الفواتير: ${scopedInvoices.length} فاتورة\n`;
    body += `• إجمالي الكراتين المطلوبة: ${totalShortageCartons} كرتونة\n`;
    body += `--------------------------------------------------\n\n`;
    body += `بيان الأصناف والكميات المجمعة المطلوبة من مخزن 6 أكتوبر:\n`;

    aggregatedProducts.forEach((p, idx) => {
      body += `${idx + 1}) [${p.productCode}] ${p.productName} ${p.unifiedCode !== '---' ? `(#${p.unifiedCode.replace('#', '')})` : ''}\n`;
      body += `   - الكمية المطلوبة: ${p.totalRequestedCartons} كرتونة (${p.octoberStock} ك متوفر بمخزن أكتوبر)\n`;
      body += `   - الفواتير المرتبطة: ${p.invoicesList.map((inv) => `#${inv.invoiceNumber} (${inv.customerName} - ${inv.cartons}ك)`).join('، ')}\n\n`;
    });

    body += `\nشاكرين ومقدرين حسن تعاونكم وسرعة تجهيز أمر الصرف.\n`;
    body += `${requesterName} - ${branchNameStr}\nشركة دريم للتجارة والتوزيع`;

    return {
      to: 'october.warehouse@dream-group.eg',
      subject: `[طلب توريد نواقص مخزن 6 أكتوبر] - فرع ${branchNameStr} - ${requesterName} - ${dateStr}`,
      body,
    };
  }, [scopedInvoices, aggregatedProducts, currentUser, selectedBranch, dateFilter, customDate, todayIso, totalShortageCartons]);

  if (!isOpen) return null;

  // Handler 1: Send Email via Mailto
  const handleSendEmail = () => {
    const mailtoUrl = `mailto:${emailContent.to}?subject=${encodeURIComponent(emailContent.subject)}&body=${encodeURIComponent(emailContent.body)}`;
    window.location.href = mailtoUrl;
    setSuccessNotice('تم فتح برنامج البريد الإلكتروني لإرسال النواقص لمخزن أكتوبر بنجاح ✉️');
    setTimeout(() => setSuccessNotice(null), 4500);
  };

  // Handler 2: Copy Email Text to Clipboard
  const handleCopyEmailText = () => {
    navigator.clipboard.writeText(`الموضوع: ${emailContent.subject}\n\n${emailContent.body}`);
    setCopiedEmail(true);
    setSuccessNotice('تم نسخ نص البريد الإلكتروني للحافظة بنجاح، يمكنك لصقه في الإيميل أو الواتساب أو السيستم 📋');
    setTimeout(() => {
      setCopiedEmail(false);
      setSuccessNotice(null);
    }, 4500);
  };

  // Handler 3: Export Excel ERP for Central Warehouse
  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const branchLabel = currentUser?.branchName || (selectedBranch !== 'الكل' ? selectedBranch : 'كافة الفروع');
      const report = buildDispatchReport(scopedInvoices, products, {
        from: dateFilter === 'custom' ? customDate : todayIso,
        to: dateFilter === 'custom' ? customDate : todayIso,
        scope: 'shortage',
        scopeLabel: branchLabel,
      });

      if (report.shortageLines.length === 0) {
        alert('لا توجد بنود نواقص لتصديرها.');
        return;
      }

      await downloadDispatchReport(report);
      setSuccessNotice(`تم تحميل شيت إكسيل ERP المعتمد للسيستم (${report.shortageLines.length} بند نواقص) 📑`);
      setTimeout(() => setSuccessNotice(null), 4500);
    } catch (err: any) {
      console.error('Excel dispatch export error:', err);
      alert(`حدث خطأ أثناء تصدير شيت الإكسيل: ${err?.message || ''}`);
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Handler 4: Confirm Dispatch in System
  const handleConfirmSystemDispatch = () => {
    setIsConfirmingSystem(true);
    try {
      const invoiceIds = scopedInvoices.map((inv) => inv.id);
      if (onConfirmDispatch) {
        onConfirmDispatch(invoiceIds);
      }
      setSuccessNotice(`تم بنجاح اعتماد وتأكيد طلب التوريد لـ ${invoiceIds.length} فاتورة في السيستم! تم تحديث حالة التوريد من مخزن 6 أكتوبر ⚡`);
      setTimeout(() => setSuccessNotice(null), 5000);
    } finally {
      setIsConfirmingSystem(false);
    }
  };

  return (
    <div
      id="shortage-pull-modal"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in"
      dir="rtl"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[60] bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-300 w-full max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] xl:max-w-6xl max-h-[95vh] flex flex-col overflow-hidden text-slate-900"
      >
        {/* Top Header Ribbon */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 border-b-2 border-amber-500 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-white">
                  سحب فواتير النواقص لمخزن 6 أكتوبر المركزي
                </h3>
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-2xs">
                  متابعة وتوريد النواقص 🚚
                </span>
              </div>
              <p className="text-xs text-amber-300 font-bold mt-0.5 flex items-center gap-1.5">
                <span>{roleScopeLabel}</span>
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Toast Notice */}
        {successNotice && (
          <div className="bg-emerald-600 text-white p-3 text-xs sm:text-sm font-black flex items-center justify-between shadow-inner animate-in fade-in shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
              <span>{successNotice}</span>
            </div>
            <button onClick={() => setSuccessNotice(null)} className="text-emerald-100 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Informative Guidance Banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-amber-950 font-medium shrink-0">
          <div className="flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>دورة سحب النواقص المعتمدة:</strong> الفواتير لا تنقسم إلى فاتورتين بل تظل فاتورة واحدة معتمدة للعميل، ويتم سحب النواقص من مخزن 6 أكتوبر وإرسال الميل الرسمي للسيستم لتجهيز البضاعة.
            </span>
          </div>
          <div className="text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full shrink-0">
            المشرف يسحب لمناديبه • مدير الفرع يسحب للفرع بالكامل
          </div>
        </div>

        {/* Control Toolbar: Date, Branch & Search */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 sm:px-5 flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث بكود الصنف، الكود الموحد، اسم الصنف..."
                className="w-full pl-3 pr-8 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {/* Date Preset Filter */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shrink-0 font-bold">
              <button
                onClick={() => setDateFilter('all')}
                className={`px-2 py-1 rounded-lg transition ${dateFilter === 'all' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                كافة الأيام
              </button>
              <button
                onClick={() => setDateFilter('today')}
                className={`px-2 py-1 rounded-lg transition ${dateFilter === 'today' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                اليوم فقط
              </button>
              <button
                onClick={() => setDateFilter('custom')}
                className={`px-2 py-1 rounded-lg transition ${dateFilter === 'custom' ? 'bg-slate-900 text-amber-400' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                تاريخ مخصص
              </button>
            </div>

            {dateFilter === 'custom' && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-700 outline-none"
              />
            )}

            {/* Branch Selector for Admin */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="الكل">🏢 كافة الفروع</option>
                {availableBranches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            )}
          </div>

          {/* Action Buttons Header */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 1. Send Email Button */}
            <button
              onClick={handleSendEmail}
              disabled={scopedInvoices.length === 0}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-black shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              title="إرسال إيميل رسمي منسق لمخزن 6 أكتوبر مباشرة عبر برنامج البريد"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>إرسال ميل بنواقص الطلبيات ✉️</span>
            </button>

            {/* 2. Copy Email Text */}
            <button
              onClick={handleCopyEmailText}
              disabled={scopedInvoices.length === 0}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="نسخ نص الإيميل والبيانات كاملة للحافظة"
            >
              {copiedEmail ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedEmail ? 'تم النسخ! ✓' : 'نسخ نص الإيميل'}</span>
            </button>

            {/* 3. Export Excel ERP */}
            <button
              onClick={handleExportExcel}
              disabled={isExportingExcel || scopedInvoices.length === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-black shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 active:scale-95"
              title="تصدير شيت إكسيل بصيغة ERP 25 عمود المعتمدة للسيستم"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isExportingExcel ? 'جاري التصدير...' : 'تصدير للسيستم (Excel ERP) 📑'}</span>
            </button>

            {/* 4. Confirm in System */}
            <button
              onClick={handleConfirmSystemDispatch}
              disabled={isConfirmingSystem || scopedInvoices.length === 0}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-2 rounded-xl text-xs font-black shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 active:scale-95"
              title="تأكيد واعتماد طلب التوريد رسمياً على السيستم"
            >
              <Sparkles className="w-3.5 h-3.5 text-slate-950" />
              <span>{isConfirmingSystem ? 'جاري الاعتماد...' : 'اعتماد طلب السحب بالسيستم ⚡'}</span>
            </button>
          </div>
        </div>

        {/* Aggregate Stat Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 sm:px-5 bg-white border-b border-slate-200 shrink-0 text-xs">
          <div className="bg-amber-50/80 p-2.5 rounded-xl border border-amber-200">
            <span className="text-amber-800 font-bold block text-[10px]">فواتير بها نواقص:</span>
            <strong className="text-amber-950 font-black text-sm">{scopedInvoices.length} فاتورة</strong>
          </div>
          <div className="bg-blue-50/80 p-2.5 rounded-xl border border-blue-200">
            <span className="text-blue-800 font-bold block text-[10px]">إجمالي كراتين النواقص:</span>
            <strong className="text-blue-950 font-black text-sm font-mono">{totalShortageCartons} كرتونة</strong>
          </div>
          <div className="bg-purple-50/80 p-2.5 rounded-xl border border-purple-200">
            <span className="text-purple-800 font-bold block text-[10px]">عدد الأصناف المطلوبة:</span>
            <strong className="text-purple-950 font-black text-sm">{aggregatedProducts.length} صنف</strong>
          </div>
          <div className="bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200">
            <span className="text-emerald-800 font-bold block text-[10px]">القيمة التقديرية للنواقص:</span>
            <strong className="text-emerald-950 font-black text-sm font-mono">{formatCurrency(totalEstimatedValue)}</strong>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="bg-slate-100 border-b border-slate-200 px-3 sm:px-5 pt-2 flex items-center gap-1 shrink-0 select-none">
          <button
            onClick={() => setActiveTab('aggregate')}
            className={`px-4 py-2 text-xs font-black rounded-t-xl transition cursor-pointer flex items-center gap-2 border-t-2 ${
              activeTab === 'aggregate'
                ? 'bg-white text-amber-900 border-amber-500 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/70'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-600" />
            <span>بيان تجميع النواقص لمخزن 6 أكتوبر ({filteredProducts.length} صنف)</span>
          </button>

          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2 text-xs font-black rounded-t-xl transition cursor-pointer flex items-center gap-2 border-t-2 ${
              activeTab === 'invoices'
                ? 'bg-white text-amber-900 border-amber-500 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/70'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-blue-600" />
            <span>تفاصيل الفواتير والمناديب والعملاء ({scopedInvoices.length} فاتورة)</span>
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-auto p-3 sm:p-5 bg-slate-50">
          {scopedInvoices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 max-w-md mx-auto my-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-800">لا توجد فواتير بها نواقص في النطاق المحدد</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                كافة طلبيات الفرع والمناديب متوفرة بالكامل بالمخزن المحلي، أو تم بالفعل سحب وتوريد النواقص السابقة.
              </p>
            </div>
          ) : activeTab === 'aggregate' ? (
            /* TAB 1: Aggregated Shortage Products Table */
            <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold border-b border-slate-700">
                      <th className="p-3 text-center border-l border-slate-700 w-10">م</th>
                      <th className="p-3 border-l border-slate-700">كود الصنف</th>
                      <th className="p-3 border-l border-slate-700">الكود الموحد</th>
                      <th className="p-3 border-l border-slate-700 min-w-[180px]">اسم الصنف والبيان التفصيلي</th>
                      <th className="p-3 text-center border-l border-slate-700">شدة</th>
                      <th className="p-3 text-center border-l border-slate-700 bg-amber-900/70 text-amber-200">
                        الكراتين المطلوبة
                      </th>
                      <th className="p-3 text-center border-l border-slate-700 bg-blue-950 text-blue-200">
                        رصيد مخزن 6 أكتوبر
                      </th>
                      <th className="p-3 text-center border-l border-slate-700">موقف التغطية بأكتوبر</th>
                      <th className="p-3 text-center border-l border-slate-700">عدد الفواتير</th>
                      <th className="p-3 text-center">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredProducts.map((p, idx) => {
                      const isExpanded = expandedProductKey === p.productCode;
                      return (
                        <React.Fragment key={p.productCode + idx}>
                          <tr className={`hover:bg-amber-50/40 transition ${idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}`}>
                            <td className="p-2.5 text-center border-l border-slate-200 font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-2.5 border-l border-slate-200 font-mono font-black text-slate-900">
                              {p.productCode}
                            </td>
                            <td className="p-2.5 border-l border-slate-200 font-mono font-bold text-blue-700">
                              {p.unifiedCode !== '---' ? (
                                <span className="bg-blue-50 px-1.5 py-0.5 rounded text-blue-800">
                                  #{p.unifiedCode.replace('#', '')}
                                </span>
                              ) : '---'}
                            </td>
                            <td className="p-2.5 border-l border-slate-200 font-black text-slate-900">
                              <div>{p.productName}</div>
                              {p.color && <span className="text-[10px] text-slate-500 font-normal">اللون: {p.color}</span>}
                            </td>
                            <td className="p-2.5 text-center border-l border-slate-200 font-bold text-slate-600">
                              {p.cartonQuantity} ق
                            </td>
                            <td className="p-2.5 text-center border-l border-slate-200 font-black text-amber-950 bg-amber-50/80 text-sm">
                              {p.totalRequestedCartons} ك
                            </td>
                            <td className="p-2.5 text-center border-l border-slate-200 font-black text-blue-950 bg-blue-50/70">
                              {p.octoberStock > 0 ? (
                                <span className="text-blue-900 font-mono">{p.octoberStock} ك</span>
                              ) : (
                                <span className="text-rose-700 font-bold">0 (نفاد)</span>
                              )}
                            </td>
                            <td className="p-2.5 text-center border-l border-slate-200">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  p.coverageStatus.includes('✅')
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : p.coverageStatus.includes('⚠️')
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-rose-100 text-rose-900'
                                }`}
                              >
                                {p.coverageStatus}
                              </span>
                            </td>
                            <td className="p-2.5 text-center border-l border-slate-200 font-bold text-slate-700">
                              {p.invoicesList.length} فاتورة
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => setExpandedProductKey(isExpanded ? null : p.productCode)}
                                className="text-amber-700 hover:text-amber-900 font-bold text-[11px] underline cursor-pointer"
                              >
                                {isExpanded ? 'إخفاء ▲' : 'عرض الفواتير ▼'}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Invoices breakdown */}
                          {isExpanded && (
                            <tr className="bg-amber-50/20">
                              <td colSpan={10} className="p-3 bg-amber-50/30 border-b border-amber-200">
                                <div className="space-y-1.5 text-xs">
                                  <div className="font-bold text-amber-900">
                                    تفاصيل الفواتير الطالبة لهذا الصنف ({p.productName}):
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {p.invoicesList.map((inv, invIdx) => (
                                      <div
                                        key={invIdx}
                                        className="bg-white p-2.5 rounded-xl border border-amber-200 shadow-2xs space-y-1"
                                      >
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="font-mono font-bold text-slate-800">#{inv.invoiceNumber}</span>
                                          <span className="font-black text-amber-800">{inv.cartons} كرتونة</span>
                                        </div>
                                        <div className="text-slate-900 font-bold truncate">العميل: {inv.customerName}</div>
                                        <div className="text-slate-500 text-[10px] flex items-center justify-between">
                                          <span>المندوب: {inv.repName}</span>
                                          <span>{inv.branchName}</span>
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
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* TAB 2: Detailed by Invoice View */
            <div className="space-y-3">
              {scopedInvoices.map((inv) => {
                const shortageItems = (inv.items || []).filter(
                  (it) => it.isShortage || it.needsOctoberSupply || it.fulfilledFrom === 'main_warehouse' || (it.shortageCartons && it.shortageCartons > 0)
                );
                const shortageCartonsCount = shortageItems.reduce(
                  (acc, it) => acc + (it.shortageCartons && it.shortageCartons > 0 ? it.shortageCartons : (it.cartonCount || 0)),
                  0
                );

                return (
                  <div
                    key={inv.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-slate-950 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                          #{inv.invoiceNumber}
                        </span>
                        <span className="font-black text-slate-900 text-sm">
                          العميل: {inv.customerName}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="bg-amber-100 text-amber-950 font-black px-2.5 py-0.5 rounded-full">
                          {shortageItems.length} صنف نواقص ({shortageCartonsCount} كرتونة)
                        </span>
                        <span className="text-slate-500 font-bold">{inv.branchName}</span>
                        <span className="text-slate-500">المندوب: <strong>{inv.repName}</strong></span>
                        <span className="text-slate-400 font-mono">{inv.date}</span>
                      </div>
                    </div>

                    {/* Shortage items in this invoice */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {shortageItems.map((item, itIdx) => {
                        const cCount = item.shortageCartons && item.shortageCartons > 0 ? item.shortageCartons : item.cartonCount;
                        const oStock = item.octoberStockAtOrder || 0;
                        return (
                          <div
                            key={itIdx}
                            className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-slate-700">{cleanProductCode(item.productCode)}</span>
                              <span className="font-black text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-sans">
                                {cCount} كرتونة
                              </span>
                            </div>
                            <div className="font-bold text-slate-900 truncate">{item.productName}</div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                              <span>بمخزن أكتوبر: <strong className="text-blue-700">{oStock} ك</strong></span>
                              <span className="text-amber-700 font-bold">طلب توريد 🚚</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="bg-white border-t border-slate-200 p-3 sm:px-5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600">
            <span>إجمالي النواقص المرصودة: </span>
            <strong className="text-slate-900 font-black">{totalShortageCartons} كرتونة</strong>
            <span> عبر </span>
            <strong className="text-slate-900 font-black">{scopedInvoices.length} فاتورة موحدة</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
            >
              إغلاق
            </button>

            <button
              onClick={handleSendEmail}
              disabled={scopedInvoices.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-black px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>إرسال الميل فوراً ✉️</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
