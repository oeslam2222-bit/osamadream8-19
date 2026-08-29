import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  TrendingUp,
  User,
  UserCheck,
  Users,
  X,
  XCircle
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportElectronicInvoiceToExcel, exportInvoiceForERP } from '../services/excelService';
import { downloadInvoicePDF } from '../services/pdfService';
import { formatArabicDate, formatCurrency } from '../services/invoiceService';
import { Invoice, OrderStatus } from '../types';

interface InvoicesManagerProps {
  onOpenNewOrder: () => void;
  onViewInvoice: (invoice: Invoice) => void;
}

export const InvoicesManager: React.FC<InvoicesManagerProps> = ({
  onOpenNewOrder,
  onViewInvoice,
}) => {
  const {
    invoices,
    currentUser,
    users,
    updateOrderStatus,
    deleteInvoice,
    approveOrder,
    forwardOrderToManager,
    rejectOrder,
    selectedBranchFilter
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('الكل');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('الكل');
  const [rejectModalInvoiceId, setRejectModalInvoiceId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('نفاذ الكمية أو طلب العميل إلغاء الطلبية');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Pagination state for responsive multi-page browsing
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(15);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedStatus, selectedRepFilter, selectedBranchFilter, itemsPerPage]);

  // Role based filtering logic
  const accessibleInvoices = useMemo(() => {
    if (!currentUser) return [];

    return invoices.filter((inv) => {
      // 1. Strict Role boundaries & Branch Isolation
      if (currentUser.role === 'sales_rep') {
        // Sales Rep only sees his own invoices (Strict Privacy)
        if (inv.repId !== currentUser.id && inv.repName !== currentUser.name) {
          return false;
        }
      } else if (currentUser.role === 'supervisor') {
        // Supervisor sees ONLY invoices for his branch and reps under his supervision
        const isSameBranch = !inv.branchName || inv.branchName === currentUser.branchName;
        const myReps = users.filter((u) => u.supervisorId === currentUser.id).map((u) => u.id);
        const myRepNames = users.filter((u) => u.supervisorId === currentUser.id).map((u) => u.name);
        const isMyRep = myReps.includes(inv.repId) || myRepNames.includes(inv.repName);
        const isSelf = inv.repId === currentUser.id || inv.repName === currentUser.name;
        const isMySupervision = inv.supervisorName === currentUser.name;

        if (!isSameBranch || (!isMyRep && !isSelf && !isMySupervision)) {
          return false;
        }
      } else if (currentUser.role === 'branch_manager') {
        // Branch Manager STRICTLY sees only invoices for his own branch
        if (inv.branchName !== currentUser.branchName) {
          return false;
        }
      } else if (currentUser.role === 'admin' || currentUser.role === 'developer') {
        // Admin & Developer see all, or filter by branch if chosen
        if (selectedBranchFilter !== 'الكل' && inv.branchName !== selectedBranchFilter) {
          return false;
        }
      }

      // 2. Search query filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const numMatch = inv.invoiceNumber.toLowerCase().includes(q);
        const custMatch = inv.customerName.toLowerCase().includes(q);
        const repMatch = inv.repName.toLowerCase().includes(q);
        const phoneMatch = inv.customerPhone?.includes(q);

        if (!numMatch && !custMatch && !repMatch && !phoneMatch) return false;
      }

      // 3. Status filter
      if (selectedStatus !== 'الكل') {
        if (selectedStatus === 'فواتير النواقص') {
          if (!inv.isShortageInvoice && !inv.hasShortageSplit) return false;
        } else if (selectedStatus === 'قيد مراجعة المشرف') {
          if (inv.status !== 'قيد مراجعة المشرف' && inv.status !== 'معلقة بانتظار اعتماد الفرع' && inv.status !== 'قيد المراجعة') {
            return false;
          }
        } else if (selectedStatus === 'معتمدة ومصروفة من المخزن') {
          if (inv.status !== 'معتمدة ومصروفة من المخزن' && inv.status !== 'معتمدة') {
            return false;
          }
        } else if (selectedStatus === 'مرفوضة / ملغاة') {
          if (inv.status !== 'مرفوضة / ملغاة' && inv.status !== 'ملغاة') {
            return false;
          }
        } else if (inv.status !== selectedStatus) {
          return false;
        }
      }

      // 4. Rep filter (for supervisor / manager / admin)
      if (selectedRepFilter !== 'الكل' && inv.repName !== selectedRepFilter) {
        return false;
      }

      return true;
    });
  }, [invoices, currentUser, users, searchTerm, selectedStatus, selectedRepFilter, selectedBranchFilter]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCartons = 0;
    let totalPieces = 0;
    let pendingCount = 0;

    accessibleInvoices.forEach((inv) => {
      totalRevenue += inv.estimatedGrandTotal;
      totalCartons += inv.totalCartons;
      totalPieces += inv.totalPieces;
      if (
        inv.status === 'قيد مراجعة المشرف' ||
        inv.status === 'معلقة بانتظار اعتماد الفرع' ||
        inv.status === 'قيد المراجعة'
      ) {
        pendingCount++;
      }
    });

    return { totalRevenue, totalCartons, totalPieces, pendingCount, count: accessibleInvoices.length };
  }, [accessibleInvoices]);

  const repsList = useMemo(() => {
    const set = new Set<string>();
    accessibleInvoices.forEach((inv) => {
      if (inv.repName) set.add(inv.repName);
    });
    return ['الكل', ...Array.from(set)];
  }, [accessibleInvoices]);

  // Paginated Slices
  const totalPages = useMemo(() => {
    if (itemsPerPage === 'all') return 1;
    return Math.max(1, Math.ceil(accessibleInvoices.length / itemsPerPage));
  }, [accessibleInvoices.length, itemsPerPage]);

  const displayedInvoices = useMemo(() => {
    if (itemsPerPage === 'all') return accessibleInvoices;
    const start = (currentPage - 1) * itemsPerPage;
    return accessibleInvoices.slice(start, start + itemsPerPage);
  }, [accessibleInvoices, currentPage, itemsPerPage]);

  const statusStyles: Record<string, { bg: string; text: string; label?: string }> = {
    'مسودة': { bg: 'bg-slate-100 border-slate-300', text: 'text-slate-700' },
    'قيد مراجعة المشرف': { bg: 'bg-amber-100 border-amber-300 animate-pulse', text: 'text-amber-900', label: 'قيد مراجعة المشرف ⏳' },
    'معلقة بانتظار اعتماد الفرع': { bg: 'bg-blue-100 border-blue-300 animate-pulse', text: 'text-blue-900', label: 'بانتظار مدير الفرع 🏛️' },
    'قيد المراجعة': { bg: 'bg-amber-100 border-amber-300', text: 'text-amber-800' },
    'معتمدة ومصروفة من المخزن': { bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-800', label: 'معتمدة ومصروفة ✅' },
    'معتمدة': { bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-800' },
    'جاري التجهيز': { bg: 'bg-indigo-100 border-indigo-300', text: 'text-indigo-800' },
    'تم التسليم': { bg: 'bg-teal-100 border-teal-300', text: 'text-teal-800' },
    'مرفوضة / ملغاة': { bg: 'bg-rose-100 border-rose-300', text: 'text-rose-800', label: 'مرفوضة / ملغاة ❌' },
    'ملغاة': { bg: 'bg-rose-100 border-rose-300', text: 'text-rose-800' },
  };

  const handleApproveClick = (invoiceId: string) => {
    const res = approveOrder(invoiceId, 'تم اعتماد الطلبية وصرف الرصيد من المخزن');
    if (res.success) {
      setSuccessToast(res.message);
      setTimeout(() => setSuccessToast(null), 4000);
    } else {
      alert(res.message);
    }
  };

  const handleForwardClick = (invoiceId: string) => {
    const res = forwardOrderToManager(invoiceId, 'تم إرسال الطلبية لمدير الفرع للموافقة النهائية');
    if (res.success) {
      setSuccessToast(res.message);
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  const handleRejectConfirm = () => {
    if (!rejectModalInvoiceId) return;
    const res = rejectOrder(rejectModalInvoiceId, rejectReason);
    if (res.success) {
      setSuccessToast(res.message);
      setRejectModalInvoiceId(null);
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  return (
    <div className="space-y-4 pb-16">
      
      {/* Success Notification Toast */}
      {successToast && (
        <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between text-xs animate-in fade-in sticky top-20 z-30">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-200" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-white hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & High Level Metrics Cards */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <span>سجل الفواتير وطلبيات المبيعات</span>
              <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                {accessibleInvoices.length} فاتورة
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              متابعة طلبات المناديب والعملاء • دورة الاعتماد والصرف المخزني • تصدير إكسل رسمي
            </p>
          </div>

          <button
            onClick={onOpenNewOrder}
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs shadow-md transition transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء فاتورة / طلبية جديدة</span>
          </button>
        </div>

        {/* Dashboard Aggregate Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
            <div className="text-[11px] text-slate-500 font-bold">إجمالي مبيعات الفواتير</div>
            <div className="text-base sm:text-lg font-black text-slate-900">
              {formatCurrency(metrics.totalRevenue)}
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
            <div className="text-[11px] text-slate-500 font-bold">إجمالي الكراتين المطلوبة</div>
            <div className="text-base sm:text-lg font-black text-amber-800">
              {metrics.totalCartons} كرتونة
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
            <div className="text-[11px] text-slate-500 font-bold">إجمالي القطع</div>
            <div className="text-base sm:text-lg font-black text-slate-900">
              {metrics.totalPieces} قطعة
            </div>
          </div>

          <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 space-y-1">
            <div className="text-[11px] text-amber-800 font-bold">طلبيات معلقة بانتظار الاعتماد</div>
            <div className="text-base sm:text-lg font-black text-amber-900">
              {metrics.pendingCount} طلبية
            </div>
          </div>
        </div>

        {/* Quick Filter Categories Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
          <button
            onClick={() => setSelectedStatus('الكل')}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition cursor-pointer ${
              selectedStatus === 'الكل'
                ? 'bg-slate-900 text-amber-400 shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            كافة الفواتير ({accessibleInvoices.length})
          </button>

          <button
            onClick={() => setSelectedStatus('معتمدة ومصروفة من المخزن')}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition cursor-pointer ${
              selectedStatus === 'معتمدة ومصروفة من المخزن'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            معتمدة ومصروفة ✅ ({accessibleInvoices.filter(i => i.status === 'معتمدة ومصروفة من المخزن' || i.status === 'معتمدة').length})
          </button>

          <button
            onClick={() => setSelectedStatus('قيد مراجعة المشرف')}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition cursor-pointer ${
              selectedStatus === 'قيد مراجعة المشرف'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            بانتظار الاعتماد ⏳ ({accessibleInvoices.filter(i => i.status === 'قيد مراجعة المشرف' || i.status === 'معلقة بانتظار اعتماد الفرع' || i.status === 'قيد المراجعة').length})
          </button>

          <button
            onClick={() => setSelectedStatus('فواتير النواقص')}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition cursor-pointer ${
              selectedStatus === 'فواتير النواقص'
                ? 'bg-indigo-700 text-white shadow-sm'
                : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
            }`}
          >
            فواتير النواقص والتحويل 🚚 ({accessibleInvoices.filter(i => i.isShortageInvoice || i.hasShortageSplit).length})
          </button>

          <button
            onClick={() => setSelectedStatus('مرفوضة / ملغاة')}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition cursor-pointer ${
              selectedStatus === 'مرفوضة / ملغاة'
                ? 'bg-rose-700 text-white shadow-sm'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
          >
            الملغية والمرفوضة ❌ ({accessibleInvoices.filter(i => i.status === 'مرفوضة / ملغاة' || i.status === 'ملغاة').length})
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم الفاتورة، اسم العميل، الهاتف، المندوب..."
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <span className="text-slate-500 font-bold">الحالة:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer w-full"
            >
              <option value="الكل">كل الحالات</option>
              <option value="قيد مراجعة المشرف">قيد مراجعة المشرف</option>
              <option value="معلقة بانتظار اعتماد الفرع">بانتظار مدير الفرع</option>
              <option value="معتمدة ومصروفة من المخزن">معتمدة ومصروفة</option>
              <option value="فواتير النواقص">فواتير النواقص والتحويل</option>
              <option value="مرفوضة / ملغاة">مرفوضة / ملغاة</option>
            </select>
          </div>

          {currentUser?.role !== 'sales_rep' && (
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              <span className="text-slate-500 font-bold">المندوب:</span>
              <select
                value={selectedRepFilter}
                onChange={(e) => setSelectedRepFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer w-full"
              >
                {repsList.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

      </div>

      {/* Invoices List Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        
        {accessibleInvoices.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-700">لا توجد فواتير مطابقة للبحث</h3>
            <p className="text-xs text-slate-400">اضغط على زر (إنشاء فاتورة / طلبية جديدة) لإصدار فاتورة جديدة للعميل</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-200 font-bold">
                <tr>
                  <th className="p-3.5">رقم الفاتورة</th>
                  <th className="p-3.5">اسم العميل / المحل</th>
                  <th className="p-3.5">المندوب والفرع</th>
                  <th className="p-3.5">التاريخ والوقت</th>
                  <th className="p-3.5 text-center">الكميات (كراتين/قطع)</th>
                  <th className="p-3.5 text-left">إجمالي الفاتورة</th>
                  <th className="p-3.5 text-center">طريقة السداد</th>
                  <th className="p-3.5 text-center">حالة الفاتورة والاعتماد</th>
                  <th className="p-3.5 text-center">الإجراءات والعمليات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedInvoices.map((invoice) => {
                  const style = statusStyles[invoice.status] || {
                    bg: 'bg-slate-100 border-slate-300',
                    text: 'text-slate-800',
                    label: invoice.status
                  };
                  const isPending =
                    invoice.status === 'قيد مراجعة المشرف' ||
                    invoice.status === 'معلقة بانتظار اعتماد الفرع' ||
                    invoice.status === 'قيد المراجعة';

                  const canApprove =
                    (currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer') &&
                    isPending;

                  const canCancelAnytime =
                    (currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer') &&
                    invoice.status !== 'تم التسليم' &&
                    invoice.status !== 'إغلاق الطلبية' &&
                    invoice.status !== 'مرتجع' &&
                    invoice.status !== 'مرفوضة / ملغاة' &&
                    invoice.status !== 'ملغاة';

                  return (
                    <tr key={invoice.id} className="hover:bg-amber-50/30 transition">
                      
                      {/* Invoice Number */}
                      <td className="p-3 font-mono font-black text-slate-900">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="bg-slate-100 px-2 py-1 rounded-md text-amber-900 border border-slate-200">
                            {invoice.invoiceNumber}
                          </span>
                          {invoice.isShortageInvoice && (
                            <span className="bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded text-[10px] font-bold border border-indigo-200">
                              🚚 فاتورة نواقص (أكتوبر)
                            </span>
                          )}
                          {invoice.hasShortageSplit && (
                            <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-bold border border-amber-200">
                              ⚠️ مفصولة لنواقص
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Customer Name */}
                      <td className="p-3">
                        <div className="font-extrabold text-slate-900 text-sm">{invoice.customerName}</div>
                        <div className="text-[10px] text-slate-400">{invoice.customerPhone || '---'}</div>
                      </td>

                      {/* Rep & Branch */}
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{invoice.repName}</div>
                        <div className="text-[10px] text-slate-400">{invoice.branchName}</div>
                      </td>

                      {/* Date & Time */}
                      <td className="p-3 text-slate-600">
                        <div>{invoice.date}</div>
                        <div className="text-[10px] text-slate-400">{invoice.time}</div>
                      </td>

                      {/* Quantities */}
                      <td className="p-3 text-center">
                        <div className="font-black text-slate-900">{invoice.totalCartons} كرتونة</div>
                        <div className="text-[10px] text-slate-500">{invoice.totalPieces} قطعة</div>
                      </td>

                      {/* Estimated Grand Total */}
                      <td className="p-3 text-left">
                        <div className="font-black text-amber-900 text-sm">
                          {formatCurrency(invoice.estimatedGrandTotal)}
                        </div>
                        <div className="text-[10px] text-emerald-700">خصم: {formatCurrency(invoice.discountAmount)}</div>
                      </td>

                      {/* Payment Method */}
                      <td className="p-3 text-center">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {invoice.paymentMethod}
                        </span>
                      </td>

                      {/* Status Dropdown / Badge */}
                      <td className="p-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${style.bg} ${style.text}`}>
                            {style.label || invoice.status}
                          </span>
                          {(invoice.status === 'مرفوضة / ملغاة' || invoice.status === 'ملغاة') && invoice.cancellationReason && (
                            <div className="text-[10px] text-rose-700 max-w-[140px] truncate" title={`سبب الرفض: ${invoice.cancellationReason} | ${invoice.restoredStockDetails || ''}`}>
                              {invoice.cancellationReason}
                            </div>
                          )}
                          {invoice.restoredStockDetails && (invoice.status === 'مرفوضة / ملغاة' || invoice.status === 'ملغاة' || invoice.status === 'مرتجع') && (
                            <span className="text-[9px] bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded font-medium border border-emerald-200">
                              تم استرجاع الرصيد للمخزن 🔄
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          
                          {/* Fast Approval Action for Supervisor/Manager */}
                          {canApprove && (
                            <>
                              <button
                                onClick={() => handleApproveClick(invoice.id)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2 py-1 rounded-lg text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                                title="اعتماد وصرف المخزون"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>اعتماد</span>
                              </button>

                              {currentUser?.role === 'supervisor' && invoice.status === 'قيد مراجعة المشرف' && (
                                <button
                                  onClick={() => handleForwardClick(invoice.id)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                                  title="إرسال لمدير الفرع"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>للمدير</span>
                                </button>
                              )}

                              <button
                                onClick={() => setRejectModalInvoiceId(invoice.id)}
                                className="bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer border border-rose-300"
                                title="رفض وإرجاع الرصيد المحجوز"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </button>
                            </>
                          )}

                          {/* If not pending, but active: Supervisor / Manager / Admin can cancel anytime */}
                          {!canApprove && canCancelAnytime && (
                            <button
                              onClick={() => setRejectModalInvoiceId(invoice.id)}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer border border-rose-200"
                              title="إلغاء الطلبية في أي وقت وإرجاع المخزون"
                            >
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>إلغاء</span>
                            </button>
                          )}
                          <button
                            onClick={() => onViewInvoice(invoice)}
                            className="bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
                            title="عرض الفاتورة الإلكترونية والباركود"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>عرض</span>
                          </button>

                          {/* Download PDF */}
                          <button
                            onClick={() => downloadInvoicePDF(invoice)}
                            className="bg-rose-600 hover:bg-rose-700 text-white p-1.5 rounded-lg transition cursor-pointer shadow-xs"
                            title="تحميل فاتورة PDF رسمية"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Export Excel ERP Format */}
                          <button
                            onClick={() => {
                              exportInvoiceForERP(invoice);
                              setSuccessToast(`تم تصدير ملف إكسل منسق للسيستم الرئيسي (ERP) للفاتورة ${invoice.invoiceNumber}`);
                              setTimeout(() => setSuccessToast(null), 3000);
                            }}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 p-1.5 rounded-lg transition cursor-pointer shadow-xs font-bold"
                            title="تصدير شيت إكسل جاهز للرفع على السيستم الرئيسي (ERP)"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>

                          {/* Export Standard Excel (.xlsx) */}
                          <button
                            onClick={() => exportElectronicInvoiceToExcel(invoice)}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white p-1.5 rounded-lg transition cursor-pointer"
                            title="تحميل شيت إكسل منسق لشركة دريم"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete (Admin & Developer only) */}
                          {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                            <button
                              onClick={() => {
                                if (window.confirm(`هل أنت متأكد من حذف الفاتورة رقم ${invoice.invoiceNumber} نهائياً؟`)) {
                                  deleteInvoice(invoice.id);
                                }
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg transition cursor-pointer"
                              title="حذف الفاتورة نهائياً"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination & Progressive Loading Controller */}
        {accessibleInvoices.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            
            {/* Left: Info & Per-Page Selector */}
            <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 w-full sm:w-auto text-xs">
              <div className="text-slate-600 font-bold flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-400 font-normal">عرض الفواتير:</span>
                <strong className="text-slate-900">
                  {itemsPerPage === 'all'
                    ? `كافة الفواتير (${accessibleInvoices.length})`
                    : `${Math.min(accessibleInvoices.length, (currentPage - 1) * itemsPerPage + 1)} - ${Math.min(accessibleInvoices.length, currentPage * itemsPerPage)} من أصل ${accessibleInvoices.length}`}
                </strong>
              </div>

              {/* Per page dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">عدد الفواتير بالصفحة:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                    setItemsPerPage(val);
                  }}
                  className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-xs"
                >
                  <option value={15}>15 فاتورة (سريع)</option>
                  <option value={30}>30 فاتورة</option>
                  <option value={50}>50 فاتورة</option>
                  <option value={100}>100 فاتورة</option>
                  <option value="all">عرض الكل ({accessibleInvoices.length})</option>
                </select>
              </div>
            </div>

            {/* Right: Page Navigation Buttons */}
            {itemsPerPage !== 'all' && totalPages > 1 && (
              <div className="flex items-center gap-1 sm:gap-1.5">
                
                {/* First page */}
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer shadow-xs"
                  title="الصفحة الأولى"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>

                {/* Previous page */}
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>السابق</span>
                </button>

                {/* Page numbers (smart window) */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | string)[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                        acc.push('...');
                      }
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) => {
                      if (item === '...') {
                        return (
                          <span key={`dots-inv-${idx}`} className="px-1.5 text-slate-400 text-xs font-black">
                            ...
                          </span>
                        );
                      }
                      const pageNum = item as number;
                      const isActive = pageNum === currentPage;
                      return (
                        <button
                          key={`page-inv-${pageNum}`}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-8 h-8 rounded-xl text-xs font-black transition cursor-pointer ${
                            isActive
                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                              : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 shadow-xs'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                </div>

                {/* Next page */}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Last page */}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer shadow-xs"
                  title="الصفحة الأخيرة"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Reject / Cancel Order Reason Prompt Modal */}
      {rejectModalInvoiceId && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-rose-700 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" />
                <span>إلغاء أو رفض الطلبية وإرجاع المخزون</span>
              </h3>
              <button onClick={() => setRejectModalInvoiceId(null)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-700 cursor-pointer" />
              </button>
            </div>

            <div className="bg-rose-50 border border-rose-200 text-rose-950 p-3 rounded-2xl text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-800">
                <CheckCircle2 className="w-4 h-4 text-rose-700" />
                <span>إرجاع البضاعة تلقائياً للمخزن:</span>
              </div>
              <p className="text-rose-900/90 leading-relaxed">
                سيقوم النظام فوراً بإلغاء الطلبية وفك الحجز وإرجاع كافة الكراتين إلى رصيد المخزن المتاح للبيع.
              </p>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700 text-xs">أسباب الإلغاء الشائعة (اختر سريعاً):</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'طلب العميل إلغاء الطلبية',
                  'عدم توافر وسيلة نقل / تأجيل خط السير',
                  'تجاوز الحد الائتماني وتعديل الأصناف',
                  'خطأ في تسجيل الكميات أو الأصناف',
                  'قرار إداري من مدير الفرع / المشرف',
                ].map((reasonText) => (
                  <button
                    key={reasonText}
                    type="button"
                    onClick={() => setRejectReason(reasonText)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                      rejectReason === reasonText
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {reasonText}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs space-y-1">
              <label className="block font-bold text-slate-700">بيان وسبب الإلغاء:</label>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="اكتب سبب إلغاء أو رفض الطلبية..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-400 font-medium"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleRejectConfirm}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>تأكيد الإلغاء وإرجاع المخزون</span>
              </button>
              <button
                onClick={() => setRejectModalInvoiceId(null)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200 cursor-pointer"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
