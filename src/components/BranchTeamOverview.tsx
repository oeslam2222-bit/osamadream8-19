import React, { useMemo, useState } from 'react';
import {
  Users,
  User,
  Phone,
  Wallet,
  ShoppingCart,
  ArrowRight,
  ChevronRight,
  Search,
  Building2,
  Target,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getCustomerBalance, getCustomerOverdue } from '../services/customerFilterPredicates';
import { getCustomerPaid } from '../services/customerTableSchema';
import { formatCurrency } from '../services/invoiceService';

interface RepCardData {
  id: string;
  name: string;
  phone?: string | null;
  sector?: string | null;
  customerCount: number;
  totalSales: number;
  totalCollections: number;
  totalDebt: number;
  totalOverdue: number;
  branchName: string;
}

interface BranchCardData {
  id: string;
  name: string;
  customerCount: number;
  repCount: number;
  totalDebt: number;
  totalOverdue: number;
  reps: RepCardData[];
}

interface BranchTeamOverviewProps {
  onRepSelected?: (rep: RepCardData) => void;
  onBackToBranches?: () => void;
  hideBackButton?: boolean;
}

export const BranchTeamOverview: React.FC<BranchTeamOverviewProps> = ({
  onRepSelected,
  onBackToBranches,
  hideBackButton = false,
}) => {
  const { currentUser, users, customers } = useApp();

  const [view, setView] = useState<'branches' | 'reps'>('branches');
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  const isBranchManager = currentUser?.role === 'branch_manager';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isRep = currentUser?.role === 'sales_rep';

  const allReps = useMemo(() => {
    return users.filter((u) => u.role === 'sales_rep');
  }, [users]);

  const repStats = useMemo(() => {
    const map = new Map<string, RepCardData>();
    allReps.forEach((rep) => {
      const repCustomers = customers.filter(
        (c) =>
          c.salesRepName === rep.name ||
          c.repName === rep.name ||
          c.repId === rep.id
      );

      const totalSales = repCustomers.reduce(
        (acc, c) =>
          acc +
          Math.max(
            c.sales2026 || 0,
            c.totalMonthlySales || 0,
            c.totalOverallSales || 0
          ),
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

      map.set(rep.id, {
        id: rep.id,
        name: rep.name,
        phone: rep.phone || null,
        sector: rep.sector || null,
        customerCount: repCustomers.length,
        totalSales,
        totalCollections,
        totalDebt,
        totalOverdue,
        branchName: rep.branchName || 'الفرع الرئيسي',
      });
    });
    return map;
  }, [customers, allReps]);

  const branches = useMemo((): BranchCardData[] => {
    const map = new Map<string, BranchCardData>();

    customers.forEach((c) => {
      const branch = c.branchName || 'الفرع الرئيسي';
      if (!map.has(branch)) {
        map.set(branch, {
          id: branch,
          name: branch,
          customerCount: 0,
          repCount: 0,
          totalDebt: 0,
          totalOverdue: 0,
          reps: [],
        });
      }
      const b = map.get(branch)!;
      b.customerCount++;
      b.totalDebt += getCustomerBalance(c);
      b.totalOverdue += getCustomerOverdue(c);
    });

    allReps.forEach((rep) => {
      const branch = rep.branchName || 'الفرع الرئيسي';
      if (!map.has(branch)) {
        map.set(branch, {
          id: branch,
          name: branch,
          customerCount: 0,
          repCount: 0,
          totalDebt: 0,
          totalOverdue: 0,
          reps: [],
        });
      }
      const b = map.get(branch)!;
      const s = repStats.get(rep.id);
      if (s) {
        b.repCount++;
        b.reps.push(s);
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalDebt - a.totalDebt);
  }, [customers, allReps, repStats]);

  const visibleBranches = useMemo(() => {
    let list = branches;
    if (isBranchManager && currentUser?.branchName) {
      list = list.filter((b) => b.name === currentUser.branchName);
    }
    if (isSupervisor) {
      const supervisorRepIds = new Set(
        users
          .filter((u) => u.role === 'sales_rep' && u.supervisorId === currentUser?.id)
          .map((u) => u.id)
      );
      list = list.filter((b) => b.reps.some((r) => supervisorRepIds.has(r.id)));
    }
    if (isRep) {
      list = list.filter((b) => b.name === (currentUser?.branchName || 'الفرع الرئيسي'));
    }
    return list;
  }, [branches, isBranchManager, currentUser?.branchName, isSupervisor, users, isRep]);

  const filteredBranches = useMemo(() => {
    if (!searchTerm.trim()) return visibleBranches;
    const q = searchTerm.trim().toLowerCase();
    return visibleBranches.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.reps.some((r) => r.name.toLowerCase().includes(q))
    );
  }, [visibleBranches, searchTerm]);

  const branchReps = useMemo(() => {
    if (!selectedBranch) return [];
    const b = branches.find((br) => br.id === selectedBranch);
    if (!b) return [];
    let reps = b.reps;
    if (isSupervisor) {
      const supervisorRepIds = new Set(
        users
          .filter((u) => u.role === 'sales_rep' && u.supervisorId === currentUser?.id)
          .map((u) => u.id)
      );
      reps = reps.filter((r) => supervisorRepIds.has(r.id));
    }
    return reps.sort((a, b) => b.totalDebt - a.totalDebt);
  }, [selectedBranch, branches, isSupervisor, users, currentUser?.id]);

  const handleSelectBranch = (branchName: string) => {
    setSelectedBranch(branchName);
    setView('reps');
  };

  const handleBack = () => {
    setView('branches');
    setSelectedBranch(null);
    if (onBackToBranches) onBackToBranches();
  };

  const handleRepSelected = (rep: RepCardData) => {
    if (onRepSelected) {
      onRepSelected(rep);
    }
  };

  const roleTitle = useMemo(() => {
    if (isAdminOrDev) return 'الإدارة';
    if (isBranchManager) return 'مدير الفرع';
    if (isSupervisor) return 'مشرف المناديب';
    if (isRep) return 'المندوب';
    return 'مستخدم';
  }, [isAdminOrDev, isBranchManager, isSupervisor, isRep]);

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

  const renderStatCard = (label: string, value: string, color: 'navy' | 'warn' | 'ok' | 'rose') => {
    const colorMap: Record<string, string> = {
      navy: 'text-[var(--app-navy-text)] bg-[var(--app-navy-tint)] border-[var(--app-navy-line)]',
      warn: 'text-[var(--app-warn-text)] bg-[var(--app-warn-tint)] border-[var(--app-warn-line)]',
      ok: 'text-[var(--app-ok-text)] bg-[var(--app-ok-tint)] border-[var(--app-ok-line)]',
      rose: 'text-[var(--app-risk-text)] bg-[var(--app-risk-tint)] border-[var(--app-risk-line)]',
    };
    const iconMap: Record<string, JSX.Element> = {
      navy: <Users className="w-3 h-3 text-[var(--app-navy-text)]" />,
      warn: <Target className="w-3 h-3 text-[var(--app-warn-text)]" />,
      ok: <Wallet className="w-3 h-3 text-[var(--app-ok-text)]" />,
      rose: <AlertCircle className="w-3 h-3 text-[var(--app-risk-text)]" />,
    };
    const cls = colorMap[color] || 'text-slate-500';
    const icon = iconMap[color] || <Users className="w-3 h-3 text-slate-500" />;
    const textColor = cls.match(/text-\[.*?\]/)?.[0] || 'text-slate-500';

    return (
      <div className="p-2.5 rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-[10px] font-bold ${textColor}`}>{label}</span>
          <div className="w-6 h-6 rounded-full flex items-center justify-center border border-[var(--app-line)]">
            {icon}
          </div>
        </div>
        <div className="font-black text-slate-900 dark:text-white">{value}</div>
      </div>
    );
  };

  const renderBranchCard = (b: BranchCardData) => {
    return (
      <div
        key={b.id}
        className="group p-4 sm:p-5 rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm hover:shadow-md transition cursor-pointer"
        onClick={() => handleSelectBranch(b.name)}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[var(--app-navy-text)] shrink-0" />
            <h3 className="font-black text-slate-900 dark:text-white text-sm sm:text-base truncate">
              {b.name}
            </h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
            {b.reps.length} مندوب
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {renderStatCard('العملاء', b.customerCount.toString(), 'navy')}
          {renderStatCard('المديونية', formatCurrency(b.totalDebt), 'warn')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {renderStatCard('المتأخرات', formatCurrency(b.totalOverdue), 'rose')}
          {renderStatCard('التحصيل', formatCurrency(b.reps.reduce((acc, r) => acc + r.totalCollections, 0)), 'ok')}
        </div>

        <div className="mt-2 pt-3 border-t border-[var(--app-line)]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSelectBranch(b.name);
            }}
            className="w-full py-2 rounded-xl border border-[var(--app-navy-line)] bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] font-black text-xs flex items-center justify-center gap-1.5 hover:bg-[var(--app-navy)] hover:text-white transition"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            <span>عرض المناديب</span>
          </button>
        </div>
      </div>
    );
  };

  const renderRepCard = (r: RepCardData) => {
    return (
      <div
        key={r.id}
        className="p-3.5 rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm flex items-center justify-between gap-3 group-hover:border-[var(--app-navy-line)] transition"
        onClick={() => handleRepSelected(r)}
      >
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center font-black text-sm shadow-sm border border-[var(--app-navy-line)]">
            {(r.name || 'م').charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-900 dark:text-white text-sm">{r.name}</div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
              {sectorBadge(r.sector)}
              {r.phone && (
                <span>
                  <Phone className="w-3 h-3 shrink-0" /> {r.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="text-right space-y-0.5 min-w-[150px]">
          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">العملاء</div>
          <div className="font-black text-slate-900 dark:text-white">{r.customerCount}</div>
        </div>

        <div className="text-right space-y-0.5 min-w-[150px]">
          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المبيعات 2026</div>
          <div className="font-black text-slate-900 dark:text-white">{formatCurrency(r.totalSales)}</div>
        </div>

        <div className="text-right space-y-0.5 min-w-[150px]">
          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المديونية</div>
          <div className={`font-bold ${r.totalDebt > 0 ? 'text-[var(--app-navy)]' : 'text-slate-400'}`}>
            {formatCurrency(r.totalDebt)}
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleRepSelected(r);
          }}
          className="px-2.5 py-1.5 rounded-xl border border-[var(--app-navy-line)] bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] font-black text-[10px] whitespace-nowrap hover:bg-[var(--app-navy)] hover:text-white transition"
        >
          <ArrowRight className="w-3 h-3" /> اختيار
        </button>
      </div>
    );
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  return (
    <div className="tantawy-screen space-y-4 pb-20 min-h-screen">
      <div className="cust-hero rounded-2xl p-4 sm:p-5 border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3 sm:mb-0">
          {!hideBackButton && view === 'reps' ? (
            <button
              type="button"
              onClick={handleBack}
              className="w-9 h-9 rounded-xl border border-[var(--app-line)] bg-white/60 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-[var(--app-navy)] hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
          <div>
            <h1 className="font-black text-slate-900 dark:text-white text-lg sm:text-xl tracking-tight">
              فريق المبيعات
              <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--app-line)] ml-2 font-bold text-[10px]">
                {roleTitle}
              </span>
            </h1>
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
              {view === 'branches'
                ? 'إجمالي العملاء والمناديب والمديونية لكل فرع'
                : `مناديب فرع ${selectedBranch || ''}`}
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="ابحث باسم الفرع أو المندوب..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--app-line)] bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-white text-sm font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--app-navy)] transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {view === 'branches' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBranches.length === 0 ? (
            <div className="col-span-full py-20 text-center text-slate-400 font-bold">
              <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p>لا توجد فروع مطابقة للبحث</p>
            </div>
          ) : (
            filteredBranches.map(renderBranchCard)
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {branchReps.length === 0 ? (
            <div className="py-20 text-center text-slate-400 font-bold">
              <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p>لا يوجد مناديب في هذا الفرع</p>
            </div>
          ) : (
            branchReps.map(renderRepCard)
          )}
        </div>
      )}
    </div>
  );
};
