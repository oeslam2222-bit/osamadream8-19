import {
  Calendar,
  CheckCircle,
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
  Trash2,
  TrendingUp,
  User,
  Users
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportElectronicInvoiceToExcel } from '../services/excelService';
import { formatArabicDate, formatCurrency, shareInvoiceViaWhatsApp } from '../services/invoiceService';
import { Invoice, OrderStatus } from '../types';

interface InvoicesManagerProps {
  onOpenNewOrder: () => void;
  onViewInvoice: (invoice: Invoice) => void;
}

export const InvoicesManager: React.FC<InvoicesManagerProps> = ({
  onOpenNewOrder,
  onViewInvoice,
}) => {
  const { invoices, currentUser, users, updateOrderStatus, deleteInvoice, selectedBranchFilter } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('الكل');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('الكل');

  // Role based filtering logic
  const accessibleInvoices = useMemo(() => {
    if (!currentUser) return [];

    return invoices.filter((inv) => {
      // 1. Role boundaries
      if (currentUser.role === 'sales_rep') {
        // Sales Rep only sees his own invoices (Strict Privacy)
        if (inv.repId !== currentUser.id && inv.repName !== currentUser.name) {
          return false;
        }
      } else if (currentUser.role === 'supervisor') {
        // Supervisor sees only sales reps assigned under him or matching supervisor name
        const myReps = users.filter((u) => u.supervisorId === currentUser.id).map((u) => u.id);
        const myRepNames = users.filter((u) => u.supervisorId === currentUser.id).map((u) => u.name);
        const isMyRep = myReps.includes(inv.repId) || myRepNames.includes(inv.repName);
        const isSelf = inv.repId === currentUser.id || inv.repName === currentUser.name;
        const isMySupervision = inv.supervisorName === currentUser.name;

        if (!isMyRep && !isSelf && !isMySupervision) {
          return false;
        }
      } else if (currentUser.role === 'branch_manager') {
        // Branch Manager sees all invoices for his branch
        if (inv.branchName !== currentUser.branchName) {
          return false;
        }
      } else if (currentUser.role === 'admin') {
        // Admin sees all, or filters by branch if chosen
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
      if (selectedStatus !== 'الكل' && inv.status !== selectedStatus) {
        return false;
      }

      // 4. Rep filter (for supervisor / manager / admin)
      if (selectedRepFilter !== 'الكل' && inv.repName !== selectedRepFilter) {
        return false;
      }

      return true;
    });
  }, [invoices, currentUser, searchTerm, selectedStatus, selectedRepFilter, selectedBranchFilter]);

  // Aggregate Metrics for Supervisor / Branch Manager / Admin
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCartons = 0;
    let totalPieces = 0;
    let pendingCount = 0;

    accessibleInvoices.forEach((inv) => {
      totalRevenue += inv.estimatedGrandTotal;
      totalCartons += inv.totalCartons;
      totalPieces += inv.totalPieces;
      if (inv.status === 'قيد المراجعة') pendingCount++;
    });

    return { totalRevenue, totalCartons, totalPieces, pendingCount, count: accessibleInvoices.length };
  }, [accessibleInvoices]);

  const repsList = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((inv) => set.add(inv.repName));
    return ['الكل', ...Array.from(set)];
  }, [invoices]);

  const statusStyles: Record<OrderStatus, { bg: string; text: string }> = {
    'مسودة': { bg: 'bg-slate-100 border-slate-300', text: 'text-slate-700' },
    'قيد المراجعة': { bg: 'bg-amber-100 border-amber-300 animate-pulse', text: 'text-amber-800' },
    'معتمدة': { bg: 'bg-blue-100 border-blue-300', text: 'text-blue-800' },
    'جاري التجهيز': { bg: 'bg-indigo-100 border-indigo-300', text: 'text-indigo-800' },
    'تم التسليم': { bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-800' },
    'ملغاة': { bg: 'bg-rose-100 border-rose-300', text: 'text-rose-800' },
  };

  return (
    <div className="space-y-4 pb-16">
      
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
              متابعة طلبات المناديب والعملاء • إصدار شيتات إكسل وتتبع الفواتير الإلكترونية
            </p>
          </div>

          <button
            onClick={onOpenNewOrder}
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs shadow-md transition transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء فاتورة / طلبية جديدة</span>
          </button>
        </div>

        {/* Dashboard Aggregate Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <span className="text-[11px] text-slate-500 font-bold block">إجمالي القيمة المتوقعة</span>
            <div className="text-lg font-black text-amber-600 mt-0.5">
              {formatCurrency(metrics.totalRevenue)}
            </div>
            <span className="text-[10px] text-slate-400">إجمالي الفواتير النشطة</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <span className="text-[11px] text-slate-500 font-bold block">إجمالي عدد الكراتين</span>
            <div className="text-lg font-black text-slate-900 mt-0.5">
              {metrics.totalCartons} كرتونة
            </div>
            <span className="text-[10px] text-slate-400">+ {metrics.totalPieces} قطعة منفردة</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <span className="text-[11px] text-slate-500 font-bold block">فواتير قيد المراجعة</span>
            <div className="text-lg font-black text-amber-700 mt-0.5">
              {metrics.pendingCount} طلبية
            </div>
            <span className="text-[10px] text-slate-400">تحتاج اعتماد مدير الفرع</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <span className="text-[11px] text-slate-500 font-bold block">نطاق العرض والصلاحية</span>
            <div className="text-xs font-black text-slate-800 mt-1 truncate">
              {currentUser.role === 'sales_rep' ? 'فواتير المندوب الشخصية' : currentUser.branchName}
            </div>
            <span className="text-[10px] text-slate-400">{currentUser.name}</span>
          </div>

        </div>

      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث برقم الفاتورة، اسم العميل، المندوب..."
            className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-xs"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
          <span className="text-slate-500 font-bold">الحالة:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="الكل">كل الحالات</option>
            <option value="قيد المراجعة">قيد المراجعة</option>
            <option value="معتمدة">معتمدة</option>
            <option value="جاري التجهيز">جاري التجهيز</option>
            <option value="تم التسليم">تم التسليم</option>
            <option value="مسودة">مسودة</option>
            <option value="ملغاة">ملغاة</option>
          </select>
        </div>

        {/* Rep Filter for supervisors/managers */}
        {currentUser.role !== 'sales_rep' && (
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <span className="text-slate-500 font-bold">المندوب:</span>
            <select
              value={selectedRepFilter}
              onChange={(e) => setSelectedRepFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
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

      {/* Invoices List Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        
        {accessibleInvoices.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-700">لا توجد فواتير مطابقة للبحث</h3>
            <p className="text-xs text-slate-400">اضغط على زر (إنشاء طلبية جديدة) لإصدار فاتورة جديدة للعميل</p>
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
                  <th className="p-3.5 text-center">حالة الفاتورة</th>
                  <th className="p-3.5 text-center">إجراءات الفاتورة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accessibleInvoices.map((invoice) => {
                  const style = statusStyles[invoice.status] || { bg: 'bg-slate-100 text-slate-800' };

                  return (
                    <tr key={invoice.id} className="hover:bg-amber-50/30 transition">
                      
                      {/* Invoice Number */}
                      <td className="p-3 font-mono font-black text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-slate-100 px-2 py-1 rounded-md text-amber-900 border border-slate-200">
                            {invoice.invoiceNumber}
                          </span>
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
                        {currentUser.role === 'admin' || currentUser.role === 'branch_manager' ? (
                          <select
                            aria-label="تغيير حالة الفاتورة"
                            value={invoice.status}
                            onChange={(e) => updateOrderStatus(invoice.id, e.target.value as OrderStatus)}
                            className={`text-[11px] font-bold px-2 py-1 rounded-lg border focus:outline-none cursor-pointer ${style.bg} ${style.text}`}
                          >
                            <option value="مسودة">مسودة</option>
                            <option value="قيد المراجعة">قيد المراجعة</option>
                            <option value="معتمدة">معتمدة</option>
                            <option value="جاري التجهيز">جاري التجهيز</option>
                            <option value="تم التسليم">تم التسليم</option>
                            <option value="ملغاة">ملغاة</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${style.bg} ${style.text}`}>
                            {invoice.status}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5">
                          
                          {/* View E-Invoice */}
                          <button
                            onClick={() => onViewInvoice(invoice)}
                            className="bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition shadow-xs"
                            title="عرض الفاتورة الإلكترونية والباركود"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>عرض</span>
                          </button>

                          {/* Export Excel (.xlsx) */}
                          <button
                            onClick={() => exportElectronicInvoiceToExcel(invoice)}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white p-1.5 rounded-lg transition"
                            title="تحميل شيت إكسل رسمي"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>

                          {/* Share WhatsApp */}
                          <button
                            onClick={() => shareInvoiceViaWhatsApp(invoice)}
                            className="bg-green-600 hover:bg-green-700 text-white p-1.5 rounded-lg transition"
                            title="مشاركة تفاصيل الفاتورة عبر واتساب"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete (Admin only) */}
                          {currentUser.role === 'admin' && (
                            <button
                              onClick={() => {
                                if (window.confirm(`هل أنت متأكد من حذف الفاتورة رقم ${invoice.invoiceNumber}؟`)) {
                                  deleteInvoice(invoice.id);
                                }
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg transition"
                              title="حذف الفاتورة"
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

      </div>

    </div>
  );
};
