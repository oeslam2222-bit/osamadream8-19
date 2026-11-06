import React, { useCallback, useMemo, useState } from 'react';
import {
  Users,
  UserIcon,
  Phone,
  Wallet,
  ShoppingCart,
  ArrowLeft,
  Building2,
  Target,
  AlertCircle,
  Clock,
  ChevronRight,
  Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getCustomerBalance, getCustomerOverdue } from '../services/customerFilterPredicates';
import { getCustomerPaid } from '../services/customerTableSchema';
import { formatCurrency } from '../services/invoiceService';

interface RepProfileViewProps {
  repId: string;
  onBack?: () => void;
}

export const RepProfileView: React.FC<RepProfileViewProps> = ({ repId, onBack }) => {
  const { currentUser, users, customers, visits } = useApp();

  const [searchCustomer, setSearchCustomer] = useState('');
  const [activeSection, setActiveSection] = useState<'overview' | 'customers'>('overview');

  const rep = users.find((u) => u.id === repId);
  if (!rep) {
    return (
      <div className="tantawy-screen p-6 text-center text-slate-500 font-bold">
        <ArrowLeft className="w-8 h-8 mx-auto text-slate-300 mb-4" />
        <p>المندوب غير موجود</p>
      </div>
    );
  }

  const repCustomers = useMemo(() => {
    return customers.filter(
      (c) =>
        c.salesRepName === rep.name ||
        c.repName === rep.name ||
        c.repId === rep.id
    );
  }, [customers, rep]);

  const repCustomerSearch = useMemo(() => {
    if (!searchCustomer.trim()) return repCustomers;
    const q = searchCustomer.trim().toLowerCase();
    return repCustomers.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.storeName?.toLowerCase().includes(q)
    );
  }, [repCustomers, searchCustomer]);

  const totalSales = repCustomers.reduce(
    (acc, c) =>
      acc +
      Math.max(c.sales2026 || 0, c.totalMonthlySales || 0, c.totalOverallSales || 0),
    0
  );
  const totalCollections = repCustomers.reduce(
    (acc, c) =>
      acc +
      Math.abs(Number(c.collections2026) || 0) +
      Math.abs(Number(c.totalMonthlyCollections || 0)),
    0
  );
  const totalDebt = repCustomers.reduce((acc, c) => acc + getCustomerBalance(c), 0);
  const totalOverdue = repCustomers.reduce((acc, c) => acc + getCustomerOverdue(c), 0);
  const collectionRate = totalSales > 0 ? Math.round((totalCollections / totalSales) * 100) : 0;

  const sectorBadge = (sector?: string | null) => {
    if (!sector || sector === 'all' || sector === 'both') {
      return (
        <span className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">
          الكل
        </span>
      );
    }
    if (sector === 'electrical') {
      return (
        <span className="px-2 py-0.5 rounded border border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] text-[10px] font-bold">
          ⚡ كهرباء
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded border border-[var(--app-navy-line)] bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] text-[10px] font-bold">
        🏠 منزلي
      </span>
    );
  };

  const handleBack = useCallback(() => {
    if (onBack) onBack();
  }, [onBack]);

  const handleSelectCustomer = useCallback((c: any) => {
    // يمكن ربطه لاحقًا بصفحة بروفايل العميل
    console.log('select customer', c);
  }, []);

  return (
    <div className="tantawy-screen space-y-4 pb-24 min-h-screen">
      {/* رأس الصفحة */}
      <div className="cust-hero rounded-2xl p-4 sm:p-5 border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3 sm:mb-0">
          <button
            type="button"
            onClick={handleBack}
            className="w-9 h-9 rounded-xl border border-[var(--app-line)] bg-white/60 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-[var(--app-navy)] hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-black text-slate-900 dark:text-white text-lg sm:text-xl tracking-tight">
              بروفايل المندوب
              <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--app-line)] ml-2 font-bold text-[10px]">
                {rep.sector ? (rep.sector === 'electrical' ? 'كهرباء' : 'منزلي') : 'غير محدد'}
              </span>
            </h1>
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
              بيانات المندوب، عملاؤه، مبيعاته، تحصيلاته، ومديونياتهم
            </p>
          </div>
        </div>
      </div>

      {/* بطاقة بيانات المندوب */}
      <div className="rounded-2xl p-4 sm:p-5 border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm mb-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-2xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center font-black text-xl shadow-sm border border-[var(--app-navy-line)] overflow-hidden">
              {(rep.name || 'م').charAt(0)}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <h2 className="font-black text-slate-900 dark:text-white text-lg sm:text-xl">{rep.name}</h2>
              {sectorBadge(rep.sector)}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[var(--app-navy-text)] shrink-0" />
                <span className="font-mono text-slate-800 dark:text-slate-200">
                  {rep.phone || 'بدون تليفون'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[var(--app-navy-text)] shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">
                  {rep.branchName || 'الفرع الرئيسي'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-[var(--app-navy-text)] shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">
                  {rep.role === 'sales_rep' ? 'مندوب مبيعات' : rep.role}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* مؤشرات المندوب */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
        <div className="p-3.5 rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">عدد العملاء</span>
            <Users className="w-4 h-4 text-[var(--app-navy-text)]" />
          </div>
          <div className="font-black text-slate-900 dark:text-white text-lg">{repCustomers.length}</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">مبيعات 2026</span>
            <ShoppingCart className="w-4 h-4 text-[var(--app-navy-text)]" />
          </div>
          <div className="font-black text-slate-900 dark:text-white text-lg">{formatCurrency(totalSales)}</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">التحصيل 2026</span>
            <Wallet className="w-4 h-4 text-[var(--app-ok-text)]" />
          </div>
          <div className="font-black text-slate-900 dark:text-white text-lg">{formatCurrency(totalCollections)}</div>
        </div>

        <div className="p-3.5 rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المديونية الإجمالية</span>
            <AlertCircle className="w-4 h-4 text-[var(--app-risk-text)]" />
          </div>
          <div className={`font-bold text-lg ${totalDebt > 0 ? 'text-[var(--app-navy)]' : 'text-slate-400'}`}>
            {formatCurrency(totalDebt)}
          </div>
        </div>
      </div>

      {/* أشرقة الأقسام */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-2 scrollbar-hide">
        <button
          type="button"
          onClick={() => setActiveSection('overview')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition shrink-0 ${
            activeSection === 'overview'
              ? 'bg-[var(--app-navy)] text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          نظرة عامة
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('customers')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition shrink-0 ${
            activeSection === 'customers'
              ? 'bg-[var(--app-navy)] text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          العملاء
        </button>
      </div>

      {/* المحتوى */}
      <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5">
          {activeSection === 'overview' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-[var(--app-line)] bg-white/50 dark:bg-slate-800/50">
                <h3 className="text-xs font-black text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--app-navy-text)]" /> ملخص أداء المندوب
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500">نسبة السداد</div>
                    <div className="font-black text-slate-900 dark:text-white text-lg">{collectionRate}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500">المتأخرات</div>
                    <div className={`font-black text-lg ${totalOverdue > 0 ? 'text-[var(--app-risk)]' : 'text-slate-400'}`}>
                      {formatCurrency(totalOverdue)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--app-line)] bg-white/50 dark:bg-slate-800/50">
                <h3 className="text-xs font-black text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-[var(--app-navy-text)]" /> تارجت المندوب (مثال توضيحي)
                </h3>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 mb-2 overflow-hidden">
                  <div
                    className="h-full bg-[var(--app-navy)] text-right px-1 text-[10px] font-black"
                    style={{ width: Math.min(100, Math.round((totalSales / 100000) * 100)) + '%' }}
                  >
                    {Math.min(100, Math.round((totalSales / 100000) * 100))}%
                  </div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {formatCurrency(totalSales)} من {formatCurrency(100000)} — المتبقي {formatCurrency(Math.max(0, 100000 - totalSales))}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'customers' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-slate-600 dark:text-slate-300">عملاء المندوب</h3>
                <div className="relative w-64">
                  <input
                    type="text"
                    value={searchCustomer}
                    onChange={(e) => setSearchCustomer(e.target.value)}
                    placeholder="ابحث باسم العميل أو الكود..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-[var(--app-line)] bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-white text-xs font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--app-navy)] transition"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {repCustomerSearch.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-bold">
                  <Users className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                  <p>لا يوجد عملاء لهذا المندوب</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {repCustomerSearch.map((c) => (
                    <div
                      key={c.id || c.code}
                      className="p-3 rounded-xl border border-[var(--app-line)] bg-white/50 dark:bg-slate-800/50 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center font-black text-[10px] shrink-0">
                          {(c.name || 'ع').charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 dark:text-white text-sm">{c.name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <span className="font-mono">{c.code}</span>
                            {c.phone && <span>· {c.phone}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-black ${getCustomerBalance(c) > 0 ? 'text-[var(--app-navy)]' : 'text-slate-400'}`}>
                          {formatCurrency(getCustomerBalance(c))}
                        </div>
                        <div className="text-[10px] text-slate-400">مديونية</div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
