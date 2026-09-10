import React, { useMemo, useState } from 'react';
import {
  X,
  Download,
  Filter,
  Search,
  ChevronDown,
  TrendingDown,
  TrendingUp,
  DollarSign,
  FileText,
} from 'lucide-react';
import { Customer, Invoice } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { useApp } from '../context/AppContext';

interface CustomerLedgerModalProps {
  isOpen: boolean;
  customer: Customer;
  onClose: () => void;
}

export const CustomerLedgerModal: React.FC<CustomerLedgerModalProps> = ({
  isOpen,
  customer,
  onClose,
}) => {
  const { invoices } = useApp();
  const [filterType, setFilterType] = useState<'all' | 'sales' | 'collections' | 'returns'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Get invoices for this customer
  const customerInvoices = useMemo(() => {
    return invoices
      .filter((inv) => inv.customerId === customer.id || inv.customerCode === customer.code)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [invoices, customer.id, customer.code]);

  // Filter invoices by type
  const filteredInvoices = useMemo(() => {
    if (filterType === 'all') return customerInvoices;
    if (filterType === 'sales') return customerInvoices.filter((inv) => inv.status !== 'مرتجع');
    if (filterType === 'collections')
      return customerInvoices.filter((inv) => inv.status === 'تم التسليم');
    if (filterType === 'returns')
      return customerInvoices.filter((inv) => inv.status === 'مرتجع' || inv.status === 'مرتجع جزئي');
    return customerInvoices;
  }, [customerInvoices, filterType]);

  // Calculate running balance
  const ledgerWithBalance = useMemo(() => {
    let runningBalance = Number(customer.currentBalance ?? customer.balance ?? 0);
    return filteredInvoices.map((inv) => {
      const previousBalance = runningBalance;
      const change = inv.estimatedGrandTotal || 0;
      runningBalance = previousBalance + change;
      return {
        invoice: inv,
        changeAmount: change,
        runningBalance,
      };
    });
  }, [filteredInvoices, customer.currentBalance, customer.balance]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 sm:p-6 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-400/20 text-amber-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-lg">{customer.name}</h2>
              <p className="text-xs text-slate-400">كشف حساب العميل - {filteredInvoices.length} فاتورة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Bar */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-300 hover:border-slate-400 transition cursor-pointer text-xs font-bold text-slate-700"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>تصفية</span>
            <ChevronDown className={`w-3 h-3 transition ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {showFilters && (
            <div className="w-full flex flex-wrap gap-2">
              {(['all', 'sales', 'collections', 'returns'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    filterType === type
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-white border border-slate-300 text-slate-700 hover:border-slate-400'
                  }`}
                >
                  {type === 'all' && 'الكل'}
                  {type === 'sales' && 'مبيعات'}
                  {type === 'collections' && 'تحصيلات'}
                  {type === 'returns' && 'مرتجعات'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Table/List Container */}
        <div className="flex-1 overflow-auto">
          {ledgerWithBalance.length === 0 ? (
            <div className="p-8 text-center">
              <DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">لا توجد فواتير لهذا العميل</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 sm:px-4 py-3 text-right font-black text-slate-700">التاريخ</th>
                    <th className="px-3 sm:px-4 py-3 text-right font-black text-slate-700">رقم الفاتورة</th>
                    <th className="px-3 sm:px-4 py-3 text-right font-black text-slate-700">النوع</th>
                    <th className="px-3 sm:px-4 py-3 text-right font-black text-slate-700">المبلغ</th>
                    <th className="px-3 sm:px-4 py-3 text-right font-black text-slate-700">الرصيد</th>
                    <th className="px-3 sm:px-4 py-3 text-right font-black text-slate-700">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledgerWithBalance.map(({ invoice, changeAmount, runningBalance }, idx) => {
                    const isReturn = invoice.status === 'مرتجع' || invoice.status === 'مرتجع جزئي';
                    const statusColor = {
                      'تم التسليم': 'text-emerald-600 bg-emerald-50',
                      'مرتجع': 'text-rose-600 bg-rose-50',
                      'مرتجع جزئي': 'text-amber-600 bg-amber-50',
                    }[invoice.status] || 'text-slate-600 bg-slate-50';

                    return (
                      <tr key={invoice.id} className="hover:bg-slate-50 transition">
                        <td className="px-3 sm:px-4 py-3 text-slate-700 font-bold">
                          {invoice.date}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-slate-900 font-black">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <div className="flex items-center gap-1">
                            {isReturn ? (
                              <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                            ) : (
                              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                            )}
                            <span className={isReturn ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                              {isReturn ? 'مرتجع' : 'مبيعات'}
                            </span>
                          </div>
                        </td>
                        <td className={`px-3 sm:px-4 py-3 font-black ${isReturn ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {isReturn ? '-' : '+'}{formatCurrency(changeAmount)}
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <div className="font-black text-slate-900">
                            {formatCurrency(runningBalance)}
                          </div>
                          <div className={`text-[10px] font-bold ${runningBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {runningBalance > 0 ? 'مديون' : 'دائن'}
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <span className={`px-2 py-1 rounded-lg font-bold text-[10px] ${statusColor}`}>
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Summary */}
        <div className="px-4 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <div className="text-[10px] text-slate-500 uppercase font-bold">إجمالي الفواتير</div>
            <div className="text-lg font-black text-slate-900">{filteredInvoices.length}</div>
          </div>
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <div className="text-[10px] text-slate-500 uppercase font-bold">الرصيد الحالي</div>
            <div className={`text-lg font-black ${Number(customer.currentBalance ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {formatCurrency(Number(customer.currentBalance ?? 0))}
            </div>
          </div>
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <div className="text-[10px] text-slate-500 uppercase font-bold">الحد الائتماني</div>
            <div className="text-lg font-black text-blue-700">
              {formatCurrency(Number(customer.creditLimit ?? 0))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
