import React, { useState } from 'react';
import { Receipt, FileText } from 'lucide-react';

interface Invoice {
  id: string;
  customer: string;
  amount: string;
  status: 'pending' | 'approved' | 'paid';
  date: string;
}

const invoices: Invoice[] = [
  { id: '#INV-001', customer: 'أحمد محمد علي', amount: '450.00', status: 'pending', date: '05/11/2026' },
  { id: '#INV-002', customer: 'سارة أحمد', amount: '320.00', status: 'approved', date: '04/11/2026' },
  { id: '#INV-003', customer: 'محمد علي', amount: '780.00', status: 'paid', date: '03/11/2026' },
  { id: '#INV-004', customer: 'فاطمة حسن', amount: '150.00', status: 'pending', date: '02/11/2026' },
  { id: '#INV-005', customer: 'خالد سعيد', amount: '620.00', status: 'approved', date: '01/11/2026' },
];

type FilterKey = 'all' | 'pending' | 'approved';

const statusConfig = {
  pending: { label: 'قيد المراجعة', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
  approved: { label: 'معتمدة', bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400', border: 'border-green-200 dark:border-green-800' },
  paid: { label: 'مدفوعة', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
};

export const InvoicesScreen: React.FC = () => {
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = filter === 'all' ? invoices : invoices.filter((i) => i.status === filter);
  const counts = {
    all: invoices.length,
    pending: invoices.filter((i) => i.status === 'pending').length,
    approved: invoices.filter((i) => i.status === 'approved').length,
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h1 className="font-arabic-display font-bold text-xl text-slate-900 dark:text-white">الفواتير</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilter('all')}
            className={`flex-shrink-0 h-9 px-4 rounded-full text-xs font-bold transition ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}
          >
            الكل ({counts.all})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`flex-shrink-0 h-9 px-4 rounded-full text-xs font-bold transition ${filter === 'pending' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}
          >
            قيد المراجعة ({counts.pending})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`flex-shrink-0 h-9 px-4 rounded-full text-xs font-bold transition ${filter === 'approved' ? 'bg-green-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}
          >
            معتمدة ({counts.approved})
          </button>
        </div>
      </div>

      <div className="px-4 space-y-3">
        {filtered.map((inv) => {
          const cfg = statusConfig[inv.status];
          return (
            <div key={inv.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="font-bold text-sm text-slate-900 dark:text-white">{inv.id}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                  {cfg.label}
                </span>
              </div>
              <div className="flex items-end justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">العميل</p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{inv.customer}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{inv.date}</p>
                </div>
                <div className="text-left">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">المبلغ</p>
                  <p className="font-arabic-display font-black text-lg text-slate-900 dark:text-white">
                    {inv.amount} <span className="text-[10px] text-slate-500">ج.م</span>
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Receipt className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">لا توجد فواتير</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoicesScreen;
