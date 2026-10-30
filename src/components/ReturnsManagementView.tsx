import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Package, Search, Image as ImageIcon, Truck
} from 'lucide-react';
import type { Invoice } from '../types';
import { formatCurrency } from '../services/invoiceService';

interface ReturnsManagementViewProps {
  onViewInvoice?: (invoice: Invoice) => void;
}

export const ReturnsManagementView: React.FC<ReturnsManagementViewProps> = ({
  onViewInvoice,
}) => {
  const {
    invoices,
    currentUser,
    getVisibleInvoices,
    updateOrderStatus,
  } = useApp();

  const visibleInvoices = useMemo(() => {
    return (getVisibleInvoices ? getVisibleInvoices() : invoices).filter(
      (inv) => inv.hasReturns || inv.isPartialReturn
    );
  }, [invoices, getVisibleInvoices]);

  const stats = useMemo(() => ({
    open: visibleInvoices.filter((inv) => (inv.status as any) !== 'مرتجع' && (inv.status as any) !== 'مرفوضة / ملغاة').length,
    pending: visibleInvoices.filter((inv) => (inv.status as any) === 'بانتظار المشرف' || (inv.status as any) === 'تم الإرسال لأمين المخزن').length,
    closed: visibleInvoices.filter((inv) => (inv.status as any) === 'مرتجع' || (inv.status as any) === 'مرفوضة / ملغاة').length,
  }), [visibleInvoices]);

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('الكل');

  const filteredReturns = useMemo(() => {
    return visibleInvoices.filter((inv) => {
      const matchSearch = inv.customerName?.includes(search) || inv.invoiceNumber?.includes(search);
      const matchStatus = selectedStatus === 'الكل' || inv.status === selectedStatus;
      return matchSearch && matchStatus;
    });
  }, [visibleInvoices, search, selectedStatus]);

  const isManager = currentUser?.role === 'branch_manager' || currentUser?.role === 'supervisor' || currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const handleCloseReturn = (invoiceId: string) => {
    if (!confirm('هل تريد إغلاق هذا الطلب نهائياً؟')) return;
    const res = updateOrderStatus(invoiceId, 'مرتجع', 'تم إغلاق طلب المرتجع');
    if (res?.success) {
      alert('تم إغلاق الطلب بنجاح');
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'مرتجع': return 'text-emerald-600 bg-emerald-50';
      case 'مرفوضة / ملغاة': return 'text-rose-600 bg-rose-50';
      case 'بانتظار المشرف': return 'text-amber-600 bg-amber-50';
      case 'تم الإرسال لأمين المخزن': return 'text-blue-600 bg-blue-50';
      default: return 'text-slate-600 bg-slate-50';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-600" />
            إدارة المرتجعات
          </h1>
          <p className="text-xs text-slate-500">متابعة طلبات المرتجعات من المندوب حتى الإغلاق</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-[10px] text-slate-500 font-bold uppercase">طلبات مفتوحة</div>
          <div className="text-2xl font-black text-slate-900">{stats.open}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-[10px] text-amber-600 font-bold uppercase">قيد الانتظار</div>
          <div className="text-2xl font-black text-amber-600">{stats.pending}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-[10px] text-emerald-600 font-bold uppercase">طلبات مغلقة</div>
          <div className="text-2xl font-black text-emerald-600">{stats.closed}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-auto max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="ابحث باسم العميل أو رقم الفاتورة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="w-full sm:w-auto pr-8 pl-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 appearance-none cursor-pointer"
        >
          <option value="الكل">الكل</option>
          <option value="بانتظار المشرف">قيد الانتظار</option>
          <option value="مرتجع">مغلقة</option>
          <option value="مرفوضة / ملغاة">مرفوضة</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-3 text-left font-bold text-slate-600">رقم الفاتورة</th>
                <th className="p-3 text-left font-bold text-slate-600">العميل</th>
                <th className="p-3 text-left font-bold text-slate-600">المندوب</th>
                <th className="p-3 text-center font-bold text-slate-600">القيمة</th>
                <th className="p-3 text-center font-bold text-slate-600">الحالة</th>
                <th className="p-3 text-center font-bold text-slate-600">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    لا توجد طلبات مرتجعات
                  </td>
                </tr>
              ) : (
                filteredReturns.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-black text-slate-900 text-xs">
                      {inv.invoiceNumber}
                    </td>
                    <td className="p-3 font-black text-slate-800">
                      <div>{inv.customerName}</div>
                      <div className="text-[10px] text-slate-400">{inv.customerCode}</div>
                    </td>
                    <td className="p-3 font-black text-slate-700 text-xs">
                      {inv.repName}
                    </td>
                    <td className="p-3 text-center font-black text-sm">
                      {formatCurrency(inv.totalRefundedAmount || 0)}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${statusColor(inv.status)}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {isManager && inv.status !== 'مرتجع' && inv.status !== 'مرفوضة / ملغاة' ? (
                        <button
                          type="button"
                          onClick={() => handleCloseReturn(inv.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 transition"
                        >
                          إغلاق الطلب
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">قيد المتابعة</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredReturns.length > 0 && (
        <div className="text-xs text-slate-500 mt-2">
          ملاحظة: المندوب يرفع طلب المرتجع من خلال زيارة العميل أو قاعدة العملاء، والمدير والمشرف يتابعون ويغلقون الطلب هنا.
        </div>
      )}
    </div>
  );
};