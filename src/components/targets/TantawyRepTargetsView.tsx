import React, { useEffect, useMemo, useState } from 'react';
import {
  Target,
  Users,
  Search,
  RefreshCw,
  ShoppingCart,
  Banknote,
  TrendingUp,
  Calendar,
  Building2,
  UserCheck,
  SlidersHorizontal,
  X,
  Wallet,
  Percent,
  Layers,
  ChevronRight,
  Trophy,
  CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { TargetRecord, User } from '../../types';
import { useApp } from '../../context/AppContext';
import { isArabicNameMatch, normalizeArabicText } from '../../services/arabicMatchingService';

interface TantawyRepTargetsViewProps {
  onOpenAdvancedDashboard?: () => void;
}

/* ============================================================
   Helpers
   ============================================================ */

const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];
const MONTH_SHORT = [
  'ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون',
  'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'
];
const NO_SUPERVISOR = 'بدون مشرف';

interface Agg {
  salesTarget: number;
  salesAchieved: number;
  collectionTarget: number;
  collectionAchieved: number;
}

const emptyAgg = (): Agg => ({
  salesTarget: 0,
  salesAchieved: 0,
  collectionTarget: 0,
  collectionAchieved: 0
});

const addTargetToAgg = (agg: Agg, t: TargetRecord): void => {
  agg.salesTarget += Number(t.salesTarget) || 0;
  agg.salesAchieved += Number(t.salesAchieved) || 0;
  agg.collectionTarget += Number(t.collectionTarget) || 0;
  agg.collectionAchieved += Number(t.collectionAchieved) || 0;
};

const mergeAgg = (dest: Agg, src: Agg): void => {
  dest.salesTarget += src.salesTarget;
  dest.salesAchieved += src.salesAchieved;
  dest.collectionTarget += src.collectionTarget;
  dest.collectionAchieved += src.collectionAchieved;
};

const monthKey = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

const pctOf = (achieved: number, target: number): number =>
  target > 0 ? (achieved / target) * 100 : 0;

const money = (value: number): string =>
  Math.round(Number(value) || 0).toLocaleString('en-US');

const compactMoney = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(value) || 0);

const percentText = (value: number): string => {
  if (!Number.isFinite(value)) return '0%';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
};

const percentTone = (pct: number): string => {
  if (pct >= 100) {
    return 'bg-[--app-ok]/100 text-[--app-ok] border-[--app-ok]/50 dark:bg-[--app-ok]/950 dark:text-[--app-ok]/30 dark:border-[--app-ok]/50';
  }
  if (pct >= 80) {
    return 'bg-[--app-warn]/100 text-[--app-warn] border-[--app-warn]/50 dark:bg-[--app-warn]/950 dark:text-[--app-warn]/30 dark:border-[--app-warn]/50';
  }
  if (pct >= 50) {
    return 'bg-[--app-risk]/100 text-[--app-risk] border-[--app-risk]/50 dark:bg-[--app-risk]/950 dark:text-[--app-risk]/30 dark:border-[--app-risk]/50';
  }
  if (pct > 0) {
    return 'bg-[--app-risk]/10 text-slate-600 border-[--app-risk]/30 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  }
  return 'bg-[--app-risk]/10 text-slate-600 border-[--app-risk]/30 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
};

const percentBar = (pct: number): string => {
  if (pct >= 100) return 'from-[--app-ok] to-[--app-warn]';
  if (pct >= 80) return 'from-[--app-warn] to-[--app-risk]';
  if (pct >= 50) return 'from-[--app-risk] to-slate-900';
  return 'from-slate-900 to-slate-800';
};

/* ============================================================
   Small presentational components
   ============================================================ */

const PctBadge: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <span
    dir="ltr"
    className={`inline-flex items-center justify-center min-w-[56px] px-2 py-0.5 rounded-lg border text-[11px] font-bold font-mono tabular-nums ${percentTone(value)} ${className}`}
  >
    {percentText(value)}
  </span>
);

const RemainingCell: React.FC<{ value: number }> = ({ value }) => {
  const rounded = Math.round(Number(value) || 0);
  if (rounded < 0) {
    return (
      <span
        dir="ltr"
        className="font-mono tabular-nums text-[--app-ok] dark:text-[--app-ok]/400 font-bold"
        title="تجاوز الهدف"
      >
        +{money(Math.abs(rounded))}
      </span>
    );
  }
  return (
    <span
      dir="ltr"
      className={`font-mono tabular-nums ${
        rounded === 0
          ? 'text-slate-400 dark:text-slate-500'
          : 'text-[--app-ok] dark:text-[--app-ok]/400'
      }`}
    >
      {money(rounded)}
    </span>
  );
};

type ToneName = 'blue' | 'cyan' | 'amber' | 'emerald';

const TONE_CLASSES: Record<
  ToneName,
  { box: string; icon: string; label: string; value: string; sub: string; bar: string }
> = {
  blue: {
    box: 'bg-[--app-ok]/50 dark:bg-[--app-ok]/90 border-[--app-ok]/40 dark:border-[--app-ok]/80',
    icon: 'bg-[--app-ok]100 text-[--app-ok] dark:bg-[--app-ok]/90 dark:text-[--app-ok]',
    label: 'text-[--app-ok] dark:text-[--app-ok]',
    value: 'text-[--app-ok] dark:text-[--app-ok]',
    sub: 'text-[--app-ok]/70 dark:text-[--app-ok]/70',
    bar: 'from-[--app-ok] to-[--app-warn]'
  },
  cyan: {
    box: 'bg-[--app-warn]/50 dark:bg-[--app-warn]/90 border-[--app-warn]/40 dark:border-[--app-warn]/80',
    icon: 'bg-[--app-warn]100 text-[--app-warn] dark:bg-[--app-warn]/90 dark:text-[--app-warn]',
    label: 'text-[--app-warn] dark:text-[--app-warn]',
    value: 'text-[--app-warn] dark:text-[--app-warn]',
    sub: 'text-[--app-warn]/70 dark:text-[--app-warn]/70',
    bar: 'from-[--app-warn] to-[--app-risk]'
  },
  amber: {
    box: 'bg-[--app-risk]/50 dark:bg-[--app-risk]/90 border-[--app-risk]/40 dark:border-[--app-risk]/80',
    icon: 'bg-[--app-risk]100 text-[--app-risk] dark:bg-[--app-risk]/90 dark:text-[--app-risk]',
    label: 'text-[--app-risk] dark:text-[--app-risk]',
    value: 'text-[--app-risk] dark:text-[--app-risk]',
    sub: 'text-[--app-risk]/70 dark:text-[--app-risk]/70',
    bar: 'from-[--app-risk] to-slate-900'
  },
  emerald: {
    box: 'bg-[--app-ok]/50 dark:bg-[--app-ok]/90 border-[--app-ok]/40 dark:border-[--app-ok]/80',
    icon: 'bg-[--app-ok]100 text-[--app-ok] dark:bg-[--app-ok]/90 dark:text-[--app-ok]',
    label: 'text-[--app-ok] dark:text-[--app-ok]',
    value: 'text-[--app-ok] dark:text-[--app-ok]',
    sub: 'text-[--app-ok]/70 dark:text-[--app-ok]/70',
    bar: 'from-[--app-ok] to-[--app-warn]'
  }
};

const KpiCard: React.FC<{
  title: string;
  value: string;
  sub: string;
  tone: ToneName;
  icon: React.ReactNode;
  pct?: number;
  className?: string;
}> = ({ title, value, sub, tone, icon, pct, className }) => {
  const t = TONE_CLASSES[tone];
  return (
    <div className={`rounded-2xl border p-3.5 sm:p-4 shadow-xs ${t.box} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] sm:text-xs font-bold ${t.label}`}>{title}</span>
        <span className={`p-1.5 rounded-lg ${t.icon}`}>{icon}</span>
      </div>
      <div dir="ltr" className={`mt-2 text-xl sm:text-2xl font-black font-mono tabular-nums ${t.value}`}>
        {value}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className={`text-[10px] font-semibold ${t.sub}`}>{sub}</span>
        {typeof pct === 'number' && <PctBadge value={pct} />}
      </div>
      {typeof pct === 'number' && (
        <div className="mt-2 h-1.5 rounded-full bg-white/80 dark:bg-black/30 overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${t.bar} transition-all duration-500`}
            style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
          />
        </div>
      )}
    </div>
  );
};

const MiniStat: React.FC<{ label: string; value: string; icon: React.ReactNode; tone?: string }> = ({
  label,
  value,
  icon,
  tone = ''
}) => (
  <div className="flex items-center gap-2 rounded-xl border border-[--app-risk]/30 dark:border-[#26364D] bg-white dark:bg-[#111C2E] px-3 py-2">
    <span className={`p-1.5 rounded-lg bg-[--app-risk]/10 dark:bg-[#17243A] ${tone}`}>{icon}</span>
    <div className="min-w-0">
<div className="text-[10px] font-semibold text-[--app-ok]/500 dark:text-[--app-ok]/400 truncate">{label}</div>
    <div dir="ltr" className="text-sm font-black font-mono tabular-nums text-[--app-ok]/900 dark:text-[--app-ok]/100">
        {value}
      </div>
    </div>
  </div>
);

/* ============================================================
   Main view
   ============================================================ */

export const TantawyRepTargetsView: React.FC<TantawyRepTargetsViewProps> = ({
  onOpenAdvancedDashboard
}) => {
  const {
    targets: allTargets,
    users,
    customers,
    currentUser,
    getVisibleTargets,
    syncTargetsIncrementally,
    loadAllTargets
  } = useApp();

  /**
   * `targets` in the context is the raw full sheet. Role isolation
   * (sales rep / supervisor / branch manager) lives in `getVisibleTargets`,
   * so the page must read through it instead of the raw list.
   */
  const targets = useMemo(
    () => getVisibleTargets(),
    [allTargets, users, customers, currentUser, getVisibleTargets]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedSupervisor, setSelectedSupervisor] = useState('all');
  // '' = use the latest month available in the sheet, 'all' = yearly cumulative
  const [selectedMonth, setSelectedMonth] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedRepKey, setSelectedRepKey] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<'all' | 'home' | 'electrical'>('all');
  const [visibleGroupCount, setVisibleGroupCount] = useState(8);
  const [isLoadingAllTargets, setIsLoadingAllTargets] = useState(false);
  const [visibleSupervisorCount, setVisibleSupervisorCount] = useState(10);
  const [visibleMonthCount, setVisibleMonthCount] = useState(12);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  /* ---------- إعادة ضبط التحميل (chunked) ---------- */
  useEffect(() => {
    setVisibleGroupCount(8);
    setVisibleSupervisorCount(10);
    setVisibleMonthCount(12);
    setExpandedGroups(new Set());
  }, [searchQuery, selectedBranch, selectedSupervisor, selectedMonth, selectedSector]);

  /* ---------- users lookup ---------- */

  const usersById = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((u) => {
      if (u?.id) map.set(u.id, u);
    });
    return map;
  }, [users]);

  /**
   * Map every rep name coming from the target sheet to its application user
   * so we can resolve branch + supervisor accurately.
   * The sheet names are not guaranteed to match users 1:1, so we fall back
   * to "بدون مشرف" when no user is found.
   */
  const repMetaMap = useMemo(() => {
    const map = new Map<
      string,
      { name: string; branch: string; supervisor: string; userId?: string }
    >();

    const resolveUser = (repName: string): User | undefined => {
      const norm = normalizeArabicText(repName);
      if (!norm) return undefined;
      for (const u of users) {
        if (u?.name && normalizeArabicText(u.name) === norm) return u;
      }
      for (const u of users) {
        if (u?.username && normalizeArabicText(u.username) === norm) return u;
      }
      return users.find((u) => u?.name && isArabicNameMatch(u.name, repName));
    };

    const supervisorOf = (user?: User): string => {
      if (!user) return NO_SUPERVISOR;
      if (user.supervisorId) {
        const sup = usersById.get(user.supervisorId);
        if (sup?.name) return sup.name;
      }
      if (user.supervisorName) return user.supervisorName;
      if (user.role === 'supervisor') return user.name;
      return NO_SUPERVISOR;
    };

    const seen = new Set<string>();
    targets.forEach((t) => {
      const rawName = (t.repName || '').trim();
      if (!rawName) return;
      const key = normalizeArabicText(rawName);
      if (!key || seen.has(key)) return;
      seen.add(key);

      const user = resolveUser(rawName);
      map.set(key, {
        name: (user?.name || rawName).trim(),
        branch: (t.branch || '').trim() || (user?.branchName || '').trim(),
        supervisor: supervisorOf(user),
        userId: user?.id
      });
    });

    return map;
  }, [targets, users, usersById]);

  /* ---------- filters ---------- */

  const uniqueBranches = useMemo(() => {
    const set = new Set<string>();
    targets.forEach((t) => {
      const branch = (t.branch || '').trim();
      if (branch) set.add(branch);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [targets]);

  const branchScopeTargets = useMemo(() => {
    let list = selectedBranch === 'all' ? targets : targets.filter((t) => (t.branch || '').trim() === selectedBranch);
    if (selectedSector !== 'all') {
      list = list.filter((t) => {
        const s = String(t.sector || '').toLowerCase();
        if (!s || s === 'all' || s === 'both') return true;
        return s === selectedSector;
      });
    }
    return list;
  }, [targets, selectedBranch, selectedSector]);

  const supervisorOptions = useMemo(() => {
    const map = new Map<string, { name: string; repKeys: Set<string> }>();
    branchScopeTargets.forEach((t) => {
      const repKey = normalizeArabicText(t.repName || '');
      const meta = repMetaMap.get(repKey);
      const supervisor = meta?.supervisor || NO_SUPERVISOR;
      if (!map.has(supervisor)) map.set(supervisor, { name: supervisor, repKeys: new Set() });
      if (repKey) map.get(supervisor)!.repKeys.add(repKey);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.name === NO_SUPERVISOR) return 1;
      if (b.name === NO_SUPERVISOR) return -1;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [branchScopeTargets, repMetaMap]);

  const scopeTargets = useMemo(() => {
    if (selectedSupervisor === 'all') return branchScopeTargets;
    return branchScopeTargets.filter((t) => {
      const meta = repMetaMap.get(normalizeArabicText(t.repName || ''));
      return (meta?.supervisor || NO_SUPERVISOR) === selectedSupervisor;
    });
  }, [branchScopeTargets, selectedSupervisor, repMetaMap]);

  const availableMonths = useMemo(() => {
    const map = new Map<string, { key: string; year: number; month: number }>();
    targets.forEach((t) => {
      const year = Number(t.year) || 0;
      const month = Number(t.month) || 0;
      if (!year || month < 1 || month > 12) return;
      map.set(monthKey(year, month), { key: monthKey(year, month), year, month });
    });
    return Array.from(map.values()).sort((a, b) => a.year - b.year || a.month - b.month);
  }, [targets]);

  const effectiveMonth = useMemo(() => {
    if (selectedMonth) return selectedMonth;
    return availableMonths.length ? availableMonths[availableMonths.length - 1].key : 'all';
  }, [selectedMonth, availableMonths]);

  const visibleTargets = useMemo(() => {
    if (effectiveMonth === 'all') return scopeTargets;
    return scopeTargets.filter(
      (t) => monthKey(Number(t.year) || 0, Number(t.month) || 0) === effectiveMonth
    );
  }, [scopeTargets, effectiveMonth]);

  const monthLabel =
    effectiveMonth === 'all'
      ? 'كل الشهور (تراكمي)'
      : (() => {
          const [y, m] = effectiveMonth.split('-').map(Number);
          return `${MONTH_NAMES[m - 1] || ''} ${y}`;
        })();

  /* ---------- aggregations ---------- */

  const kpis = useMemo(() => {
    const agg = emptyAgg();
    visibleTargets.forEach((t) => addTargetToAgg(agg, t));
    return {
      ...agg,
      salesPct: pctOf(agg.salesAchieved, agg.salesTarget),
      collectionPct: pctOf(agg.collectionAchieved, agg.collectionTarget),
      remainingSales: agg.salesTarget - agg.salesAchieved,
      remainingCollection: agg.collectionTarget - agg.collectionAchieved
    };
  }, [visibleTargets]);

  const monthlySummary = useMemo(() => {
    const map = new Map<string, { key: string; year: number; month: number; agg: Agg }>();
    scopeTargets.forEach((t) => {
      const year = Number(t.year) || 0;
      const month = Number(t.month) || 0;
      if (!year || month < 1 || month > 12) return;
      const key = monthKey(year, month);
      if (!map.has(key)) map.set(key, { key, year, month, agg: emptyAgg() });
      addTargetToAgg(map.get(key)!.agg, t);
    });
    return Array.from(map.values()).sort((a, b) => a.year - b.year || a.month - b.month);
  }, [scopeTargets]);

  const monthlyTotals = useMemo(() => {
    const agg = emptyAgg();
    monthlySummary.forEach((m) => mergeAgg(agg, m.agg));
    return agg;
  }, [monthlySummary]);

  const chartData = useMemo(
    () =>
      monthlySummary.map((m) => ({
        month: MONTH_SHORT[m.month - 1] || String(m.month),
        sales: m.agg.salesAchieved,
        collections: m.agg.collectionAchieved
      })),
    [monthlySummary]
  );

  const repRows = useMemo(() => {
    const map = new Map<
      string,
      { key: string; name: string; branch: string; supervisor: string; agg: Agg }
    >();

    visibleTargets.forEach((t) => {
      const rawName = (t.repName || '').trim();
      if (!rawName) return;
      const key = normalizeArabicText(rawName);
      const meta = repMetaMap.get(key);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: meta?.name || rawName,
          branch: meta?.branch || (t.branch || '').trim(),
          supervisor: meta?.supervisor || NO_SUPERVISOR,
          agg: emptyAgg()
        });
      }
      addTargetToAgg(map.get(key)!.agg, t);
    });

    const q = normalizeArabicText(searchQuery);
    return Array.from(map.values())
      .filter((r) => {
        if (!q) return true;
        return (
          normalizeArabicText(r.name).includes(q) ||
          normalizeArabicText(r.supervisor).includes(q) ||
          normalizeArabicText(r.branch).includes(q)
        );
      })
      .sort((a, b) => b.agg.salesAchieved - a.agg.salesAchieved);
  }, [visibleTargets, repMetaMap, searchQuery]);

  const supervisorGroups = useMemo(() => {
    const map = new Map<string, { supervisor: string; reps: typeof repRows; agg: Agg }>();
    repRows.forEach((rep) => {
      if (!map.has(rep.supervisor)) {
        map.set(rep.supervisor, { supervisor: rep.supervisor, reps: [], agg: emptyAgg() });
      }
      const group = map.get(rep.supervisor)!;
      group.reps.push(rep);
      mergeAgg(group.agg, rep.agg);
    });
    return Array.from(map.values()).sort((a, b) => b.agg.salesAchieved - a.agg.salesAchieved);
  }, [repRows]);

  const supervisorStandings = useMemo(() => {
    const map = new Map<string, { name: string; repKeys: Set<string>; agg: Agg }>();
    branchScopeTargets.forEach((t) => {
      const repKey = normalizeArabicText(t.repName || '');
      const meta = repMetaMap.get(repKey);
      const name = meta?.supervisor || NO_SUPERVISOR;
      if (!map.has(name)) map.set(name, { name, repKeys: new Set(), agg: emptyAgg() });
      const entry = map.get(name)!;
      if (repKey) entry.repKeys.add(repKey);
      addTargetToAgg(entry.agg, t);
    });
    return Array.from(map.values()).sort((a, b) => b.agg.salesAchieved - a.agg.salesAchieved);
  }, [branchScopeTargets, repMetaMap]);

  const visibleRepCount = useMemo(() => {
    const set = new Set<string>();
    visibleTargets.forEach((t) => {
      const key = normalizeArabicText(t.repName || '');
      if (key) set.add(key);
    });
    return set.size;
  }, [visibleTargets]);

  const selectedRep = useMemo(() => {
    if (!selectedRepKey) return null;
    const rows = targets.filter(
      (t) => normalizeArabicText(t.repName || '') === selectedRepKey
    );
    if (!rows.length) return null;

    const meta = repMetaMap.get(selectedRepKey);
    const agg = emptyAgg();
    const months = new Map<string, { key: string; year: number; month: number; agg: Agg }>();

    rows.forEach((t) => {
      addTargetToAgg(agg, t);
      const year = Number(t.year) || 0;
      const month = Number(t.month) || 0;
      if (!year || month < 1 || month > 12) return;
      const key = monthKey(year, month);
      if (!months.has(key)) months.set(key, { key, year, month, agg: emptyAgg() });
      addTargetToAgg(months.get(key)!.agg, t);
    });

    return {
      name: meta?.name || (rows[0].repName || '').trim(),
      branch: meta?.branch || (rows[0].branch || '').trim(),
      supervisor: meta?.supervisor || NO_SUPERVISOR,
      agg,
      months: Array.from(months.values()).sort((a, b) => a.year - b.year || a.month - b.month)
    };
  }, [selectedRepKey, targets, repMetaMap]);

  /* ---------- actions ---------- */

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await syncTargetsIncrementally?.();
    } catch (error) {
      console.error(error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleBranchChange = (value: string) => {
    setSelectedBranch(value);
    setSelectedSupervisor('all');
  };

  const handleSupervisorToggle = (name: string) => {
    setSelectedSupervisor((current) => (current === name ? 'all' : name));
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedBranch('all');
    setSelectedSupervisor('all');
    setSelectedMonth('');
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedBranch !== 'all' ||
    selectedSupervisor !== 'all' ||
    selectedMonth !== '' ||
    selectedSector !== 'all';

  const roleHint =
    currentUser?.role === 'sales_rep'
      ? 'تظهر أرقامك الشخصية فقط'
      : currentUser?.role === 'supervisor'
        ? 'تظهر أرقامك وأرقام مندوبيك'
        : currentUser?.role === 'branch_manager'
          ? `نطاق ${currentUser.branchName || 'الفرع'}`
          : 'كل الفروع والمشرفين';

  const thClass =
    'px-2.5 py-2.5 text-[10px] sm:text-[11px] font-black text-[#0f172a] whitespace-nowrap border-b border-[var(--tg-line-strong)] bg-[var(--tg-card-2)]';
  const tdClass =
    'px-2.5 py-2 text-[11px] whitespace-nowrap border-b border-[var(--tg-line)] text-slate-700';

  /* ---------- empty state ---------- */

if (!targets.length) {
    return (
      <div className="w-full space-y-4" dir="rtl">
        <div className="ds-pagehead flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="ds-crumb flex items-center gap-2 text-xs font-semibold mb-1">
              <span>الرئيسية</span>
              <span>{'>'}</span>
              <strong className="font-bold">التارجت</strong>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[--app-risk]/10 text-[--app-risk] border border-[--app-risk]/20 shadow-xs">
                <Target className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">تارجت المندوبين</h1>
                <p className="ds-pagehead__hint text-xs mt-0.5">
                  متابعة المبيعات والتحصيل والنسب والمتبقي شهريًا
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[--app-ok] text-white hover:bg-[--app-ok]/90 font-bold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>تحديث البيانات</span>
          </button>
        </div>

        <div className="rounded-2xl border border-[--app-risk]/30 bg-white dark:bg-[--app-risk]/10 p-10 text-center">
          <Target className="w-10 h-10 mx-auto text-[--app-risk]" />
          <p className="mt-3 text-sm font-bold text-[--app-risk]">
            لا توجد بيانات تارجت متاحة حاليًا
          </p>
          <p className="mt-1 text-xs text-[--app-ok]/500 dark:text-[--app-ok]/400">
            اضغط «تحديث البيانات» لجلب شيت التارجت من قاعدة البيانات.
          </p>
        </div>
      </div>
    );
  }

  /* ---------- render ---------- */

  return (
    <div className="w-full space-y-4" dir="rtl">
      {/* Header */}
      <div className="ds-pagehead flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="ds-crumb flex items-center gap-2 text-xs font-semibold mb-1">
            <span>الرئيسية</span>
            <span>&gt;</span>
            <strong className="font-bold">التارجت</strong>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-white border border-white/20 shadow-xs">
              <Target className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">تارجت المندوبين</h1>
              <p className="ds-pagehead__hint text-xs mt-0.5">
                المبيعات والتحصيل والنسب والمتبقي لكل شهر — {roleHint} • آخر 24 شهر (اضغط «تحميل كل الأشهر» لجلب التاريخ الكامل)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
<span className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-[--app-ok]/20 bg-[--app-ok]/10 px-3 py-2 text-[11px] font-bold text-[--app-ok]">
              <Calendar className="w-3.5 h-3.5 text-[--app-warn]" />
              {monthLabel}
          </span>
{onOpenAdvancedDashboard && (
              <button
                onClick={onOpenAdvancedDashboard}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[--app-ok]/10 hover:bg-[--app-ok]/20 border border-[--app-ok]/20 text-xs font-bold text-[--app-ok] transition-all shadow-xs cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4 text-[--app-ok]" />
                <span>لوحة المؤشرات المتقدمة</span>
              </button>
            )}
          <button
            type="button"
            disabled={isLoadingAllTargets}
            onClick={async () => {
              setIsLoadingAllTargets(true);
              await loadAllTargets?.();
              setIsLoadingAllTargets(false);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[--app-ok] text-white hover:bg-[--app-ok]/90 font-bold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            title="تحميل كل الأشهر من شيت التارجت"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingAllTargets ? 'animate-spin' : ''}`} />
            <span>{isLoadingAllTargets ? 'جاري التحميل...' : 'تحميل كل الأشهر'}</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[--app-risk]/10 border border-[--app-risk]/30 rounded-2xl p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالمندوب أو المشرف أو الفرع..."
              className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-[--app-risk]/10 text-[--app-ok] border border-[--app-risk]/30 dark:bg-[#17243A] dark:border-[--app-risk]/40 dark:text-[--app-ok] placeholder-slate-400 dark:placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:ring-2 focus-ring-[--app-ok] focus:border-transparent transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-[--app-ok] hover:text-slate-600 dark:hover:text-slate-300 hover:bg-[--app-risk]/10 cursor-pointer"
                aria-label="مسح البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="min-w-[150px]">
            <select
              value={selectedBranch}
              onChange={(e) => handleBranchChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[--app-risk]/10 border border-[--app-risk]/30 text-[--app-ok] dark:text-[--app-ok] text-xs font-bold focus:outline-none focus:ring-2 focus-ring-[--app-ok] cursor-pointer"
            >
              <option value="all">الفرع: كل الفروع ({uniqueBranches.length})</option>
              {uniqueBranches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[170px]">
            <select
              value={selectedSupervisor}
              onChange={(e) => setSelectedSupervisor(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[--app-risk]/10 border border-[--app-risk]/30 text-[--app-ok] dark:text-[--app-ok] text-xs font-bold focus:outline-none focus:ring-2 focus-ring-[--app-ok] cursor-pointer"
            >
              <option value="all">المشرف: كل المشرفين ({supervisorOptions.length})</option>
              {supervisorOptions.map((supervisor) => (
                <option key={supervisor.name} value={supervisor.name}>
                  {supervisor.name} — {supervisor.repKeys.size} مندوب
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[150px]">
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value as 'all' | 'home' | 'electrical')}
              className="w-full px-3 py-2.5 rounded-xl bg-[--app-risk]/10 border border-[--app-risk]/30 text-[--app-ok] dark:text-[--app-ok] text-xs font-bold focus:outline-none focus:ring-2 focus-ring-[--app-ok] cursor-pointer"
            >
              <option value="all">القطاع: الكل</option>
              <option value="home">القطاع المنزلي</option>
              <option value="electrical">القطاع الكهربائي</option>
            </select>
          </div>

          <div className="min-w-[160px]">
            <select
              value={effectiveMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[--app-risk]/10 border border-[--app-risk]/30 text-[--app-ok] dark:text-[--app-ok] text-xs font-bold focus:outline-none focus:ring-2 focus-ring-[--app-ok] cursor-pointer"
            >
              <option value="all">الشهر: كل الشهور (تراكمي)</option>
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {MONTH_NAMES[m.month - 1]} {m.year}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[--app-risk]/10 hover:bg-[--app-risk]/20 dark:bg-[--app-risk]/20 dark:hover:bg-[#22354F] border border-[--app-risk]/30 text-xs font-bold text-[--app-ok] dark:text-slate-300 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>مسح الفلاتر</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-[--app-ok]/500 dark:text-[--app-ok]/400">
          <span className="inline-flex items-center gap-1 rounded-lg bg-[--app-risk]/10 dark:bg-[#17243A] px-2 py-1">
            <UserCheck className="w-3 h-3 text-[--app-ok]" />
            {visibleRepCount} مندوب
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[--app-risk]/10 dark:bg-[#17243A] px-2 py-1">
            <Users className="w-3 h-3 text-[--app-warn]" />
            {supervisorGroups.length} مشرف
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[--app-risk]/10 dark:bg-[#17243A] px-2 py-1">
            <Building2 className="w-3 h-3 text-[--app-warn]" />
            {selectedBranch === 'all' ? `${uniqueBranches.length} فروع` : selectedBranch}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[--app-risk]/10 dark:bg-[#17243A] px-2 py-1">
            <Layers className="w-3 h-3 text-[--app-ok]" />
            {monthlySummary.length} شهر في الشيت
          </span>
          <span className="mr-auto text-[10px] text-[--app-ok]/500 dark:text-[--app-ok]/400">
            النسب محسوبة تلقائيًا = المحقق ÷ الهدف
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          title="هدف المبيعات"
          value={`${money(kpis.salesTarget)} ج.م`}
          sub={monthLabel}
          tone="blue"
          icon={<ShoppingCart className="w-4 h-4 text-[--app-ok]" />}
          className="bg-[--app-risk]/10 border border-[--app-risk]/30"
        />
        <KpiCard
          title="المحقق من المبيعات"
          value={`${money(kpis.salesAchieved)} ج.م`}
          sub={
            kpis.remainingSales > 0
              ? `المتبقي ${money(kpis.remainingSales)} ج.م`
              : kpis.remainingSales < 0
                ? `تجاوز الهدف بـ ${money(Math.abs(kpis.remainingSales))} ج.م`
                : 'تم تحقيق الهدف بالكامل'
          }
          tone="emerald"
          icon={<TrendingUp className="w-4 h-4 text-[--app-ok]" />}
          pct={kpis.salesPct}
          className="bg-[--app-ok]/10 border border-[--app-ok]/30"
        />
        <KpiCard
          title="هدف التحصيل"
          value={`${money(kpis.collectionTarget)} ج.م`}
          sub={monthLabel}
          tone="amber"
          icon={<Wallet className="w-4 h-4 text-[--app-warn]" />}
          className="bg-[--app-warn]/10 border border-[--app-warn]/30"
        />
        <KpiCard
          title="المحقق من التحصيل"
          value={`${money(kpis.collectionAchieved)} ج.م`}
          sub={
            kpis.remainingCollection > 0
              ? `المتبقي ${money(kpis.remainingCollection)} ج.م`
              : kpis.remainingCollection < 0
                ? `تجاوز الهدف بـ ${money(Math.abs(kpis.remainingCollection))} ج.م`
                : 'تم تحقيق الهدف بالكامل'
          }
          tone="cyan"
          icon={<Banknote className="w-4 h-4 text-[--app-warn]" />}
          pct={kpis.collectionPct}
          className="bg-[--app-ok]/10 border border-[--app-ok]/30"
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <MiniStat
          label="المتبقي من المبيعات"
          value={
            kpis.remainingSales > 0
              ? `${money(kpis.remainingSales)} ج.م`
              : kpis.remainingSales < 0
                ? `فائض ${money(Math.abs(kpis.remainingSales))} ج.م`
                : '0 ج.م'
          }
          icon={<ShoppingCart className="w-3.5 h-3.5 text-[--app-ok]" />}
          tone={kpis.remainingSales <= 0 ? 'text-[--app-ok] dark:text-[--app-ok]' : 'text-[--app-warn] dark:text-[--app-warn]'}
        />
        <MiniStat
          label="المتبقي من التحصيل"
          value={
            kpis.remainingCollection > 0
              ? `${money(kpis.remainingCollection)} ج.م`
              : kpis.remainingCollection < 0
                ? `فائض ${money(Math.abs(kpis.remainingCollection))} ج.م`
                : '0 ج.م'
          }
          icon={<Banknote className="w-3.5 h-3.5 text-[--app-warn]" />}
          tone={kpis.remainingCollection <= 0 ? 'text-[--app-ok] dark:text-[--app-ok]' : 'text-[--app-warn] dark:text-[--app-warn]'}
        />
        <MiniStat
          label="عدد المندوبين في النطاق"
          value={money(visibleRepCount)}
          icon={<UserCheck className="w-3.5 h-3.5 text-[--app-ok]" />}
        />
        <MiniStat
          label="عدد المشرفين في النطاق"
          value={money(supervisorGroups.length)}
          icon={<Users className="w-3.5 h-3.5 text-[--app-warn]" />}
        />
      </div>

      {/* Chart + supervisors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-[--app-risk]/30 dark:border-[#26364D] bg-white dark:bg-[#111C2E] p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-extrabold text-[--app-ok] dark:text-[--app-ok] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[--app-ok]" />
                الأداء الشهري
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedBranch === 'all' ? 'كل الفروع' : selectedBranch}
                {selectedSupervisor !== 'all' ? ` • ${selectedSupervisor}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold">
              <span className="flex items-center gap-1.5 text-[--app-ok] dark:text-[--app-ok]/80">
                <span className="w-2.5 h-2.5 rounded-full bg-[--app-ok] inline-block" />
                المحقق مبيعات
              </span>
              <span className="flex items-center gap-1.5 text-[--app-warn] dark:text-[--app-warn]/80">
                <span className="w-2.5 h-2.5 rounded-full bg-[--app-warn] inline-block" />
                المحقق تحصيل
              </span>
            </div>
          </div>

          {chartData.length ? (
            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="targetSalesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f766e" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="targetCollGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#b45309" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#b45309" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#64748b" opacity={0.25} />
                  <XAxis
                    dataKey="month"
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    reversed
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={9}
                    tickLine={false}
                    tickFormatter={(value: any) => compactMoney(Number(value))}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      fontSize: '11px',
                      direction: 'rtl'
                    }}
                    labelStyle={{ color: '#e2e8f0', fontWeight: 700 }}
                    formatter={(value: any, name: any) => [
                      `${money(Number(value))} ج.م`,
                      name === 'sales' ? 'المحقق مبيعات' : 'المحقق تحصيل'
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#0f766e"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#targetSalesGrad)"
                    dot={{ r: 3, fill: '#0f766e' }}
                    activeDot={{ r: 5 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="collections"
                    stroke="#b45309"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#targetCollGrad)"
                    dot={{ r: 3, fill: '#b45309' }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-xs font-bold text-[--app-ok]">
              لا توجد أرقام شهرية للعرض
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[--app-risk]/30 bg-white dark:bg-[--app-risk]/10 p-4 shadow-xs flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h2 className="text-sm font-extrabold text-[--app-ok] dark:text-[--app-ok] flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[--app-warn]" />
              أداء المشرفين
            </h2>
            <span className="text-[10px] font-bold text-slate-400">تراكمي كل الشهور</span>
          </div>

          <button
            onClick={() => setSelectedSupervisor('all')}
            className={`w-full text-right rounded-xl border px-3 py-2 mb-1.5 transition cursor-pointer ${
              selectedSupervisor === 'all'
                ? 'border-[--app-ok]/60 bg-[--app-ok]/50 dark:bg-[--app-ok]/90'
                : 'border-[--app-risk]/30 dark:border-[#26364D] bg-[--app-risk]/10 dark:bg-[#17243A] hover:bg-[--app-risk]/10 dark:hover:bg-[#1D2E46]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-100">كل المشرفين</span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {branchScopeTargets.length ? `${supervisorStandings.length} مشرف` : '—'}
              </span>
            </div>
          </button>

          <div className="space-y-1.5 overflow-y-auto max-h-[320px] pl-0.5">
            {supervisorStandings.slice(0, visibleSupervisorCount).map((supervisor) => {
              const salesPct = pctOf(supervisor.agg.salesAchieved, supervisor.agg.salesTarget);
              const collPct = pctOf(supervisor.agg.collectionAchieved, supervisor.agg.collectionTarget);
              const isActive = selectedSupervisor === supervisor.name;
              return (
                <button
                  key={supervisor.name}
                  onClick={() => handleSupervisorToggle(supervisor.name)}
                  className={`w-full text-right rounded-xl border px-3 py-2 transition cursor-pointer ${
                    isActive
                      ? 'border-[--app-ok]/60 bg-[--app-ok]/50 dark:bg-[--app-ok]/90 ring-1 ring-[--app-ok]/20'
                      : 'border-[--app-risk]/30 bg-[--app-risk]/10 dark:bg-[#17243A] hover:bg-[--app-risk]/20 dark:hover:bg-[#1D2E46]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-100 truncate">
                      {supervisor.name}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {supervisor.repKeys.size} مندوب
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 dark:text-slate-400">
                        <span>مبيعات</span>
                        <span dir="ltr" className="font-mono">{percentText(salesPct)}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${percentBar(salesPct)}`}
                          style={{ width: `${Math.min(Math.max(salesPct, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 dark:text-slate-400">
                        <span>تحصيل</span>
                        <span dir="ltr" className="font-mono">{percentText(collPct)}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${percentBar(collPct)}`}
                          style={{ width: `${Math.min(Math.max(collPct, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {visibleSupervisorCount < supervisorStandings.length && (
              <button
                type="button"
                onClick={() => setVisibleSupervisorCount((c) => c + 10)}
                className="w-full mt-1.5 py-2 rounded-xl border border-dashed border-[--app-risk]/30 dark:border-[--app-risk]/60 text-[11px] font-bold text-[--app-ok] dark:text-slate-300 hover:bg-[--app-risk]/10 dark:hover:bg-[#17243A] cursor-pointer"
              >
                عرض المزيد ({supervisorStandings.length - visibleSupervisorCount} متبقي)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Monthly matrix */}
      <div className="rounded-2xl border border-[--app-risk]/30 bg-white dark:bg-[--app-risk]/10 shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3 border-b border-[--app-risk]/20 dark:border-[--app-risk]/40">
          <div>
            <h2 className="text-sm font-extrabold text-[--app-ok] dark:text-[--app-ok] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[--app-warn]" />
              المصفوفة الشهرية
            </h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              يناير → ديسمبر حسب الشهور الموجودة فعليًا في شيت التارجت
              {selectedSupervisor !== 'all' ? ` • ${selectedSupervisor}` : ''}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[--app-warn]/50 dark:bg-[--app-warn]/950/30 border border-amber-200 dark:border-amber-900/50 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
            <Percent className="w-3 h-3" />
            {monthlySummary.length} شهر
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-right border-collapse">
            <thead>
              <tr>
                <th className={`${thClass} text-right`}>الشهر</th>
                <th className={`${thClass} text-left`}>هدف المبيعات</th>
                <th className={`${thClass} text-left`}>المحقق مبيعات</th>
                <th className={`${thClass} text-center`}>النسبة</th>
                <th className={`${thClass} text-left`}>المتبقي مبيعات</th>
                <th className={`${thClass} text-left`}>هدف التحصيل</th>
                <th className={`${thClass} text-left`}>المحقق تحصيل</th>
                <th className={`${thClass} text-center`}>النسبة</th>
                <th className={`${thClass} text-left`}>المتبقي تحصيل</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummary.slice(0, visibleMonthCount).map((m) => {
                const isActive = effectiveMonth === m.key;
                const salesPct = pctOf(m.agg.salesAchieved, m.agg.salesTarget);
                const collPct = pctOf(m.agg.collectionAchieved, m.agg.collectionTarget);
                return (
                  <tr
                    key={m.key}
className={`transition-colors ${
                        isActive
                          ? 'bg-[--app-warn]/10/80 dark:bg-[--app-warn]/950/20'
                          : 'hover:bg-[--app-risk]/10 dark:hover:bg-[#17243A]/60'
                      }`}
                  >
                    <td className={`${tdClass} font-extrabold`}>
                      <span className="inline-flex items-center gap-1.5">
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[--app-warn]" />}
                        {MONTH_NAMES[m.month - 1]} {m.year}
                      </span>
                    </td>
                    <td className={`${tdClass} text-left font-mono tabular-nums`}>{money(m.agg.salesTarget)}</td>
                    <td className={`${tdClass} text-left font-mono tabular-nums font-bold text-[--app-ok] dark:text-[--app-ok]/900`}>
                      {money(m.agg.salesAchieved)}
                    </td>
                    <td className={`${tdClass} text-center`}>
                      <PctBadge value={salesPct} />
                    </td>
                    <td className={`${tdClass} text-left`}>
                      <RemainingCell value={m.agg.salesTarget - m.agg.salesAchieved} />
                    </td>
                    <td className={`${tdClass} text-left font-mono tabular-nums`}>{money(m.agg.collectionTarget)}</td>
                    <td className={`${tdClass} text-left font-mono tabular-nums font-bold text-[--app-warn] dark:text-[--app-warn]/900`}>
                      {money(m.agg.collectionAchieved)}
                    </td>
                    <td className={`${tdClass} text-center`}>
                      <PctBadge value={collPct} />
                    </td>
                    <td className={`${tdClass} text-left`}>
                      <RemainingCell value={m.agg.collectionTarget - m.agg.collectionAchieved} />
                    </td>
                  </tr>
                );
              })}

              {visibleMonthCount < monthlySummary.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleMonthCount((c) => c + 12)}
                      className="px-5 py-2 rounded-xl bg-[--app-risk]/10 border border-[--app-risk]/30 hover:bg-[--app-risk]/20 dark:hover:bg-[#17243A] text-xs font-bold text-[--app-ok] dark:text-slate-300 cursor-pointer"
                    >
                      عرض المزيد من الشهور ({monthlySummary.length - visibleMonthCount} متبقي)
                    </button>
                  </td>
                </tr>
              )}

              {!monthlySummary.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-xs font-bold text-slate-400">
                    لا توجد شهور متاحة داخل نطاق الفلترة الحالي
                  </td>
                </tr>
              )}
            </tbody>
            {monthlySummary.length > 0 && (
              <tfoot>
                <tr className="bg-[--app-risk]/10/80 dark:bg-[--app-risk]/10">
                  <td className={`${tdClass} font-black text-slate-900 dark:text-white`}>
                    الإجمالي
                  </td>
                  <td className={`${tdClass} text-left font-mono tabular-nums font-black`}>
                    {money(monthlyTotals.salesTarget)}
                  </td>
                  <td className={`${tdClass} text-left font-mono tabular-nums font-black text-[--app-ok] dark:text-[--app-ok]/900`}>
                    {money(monthlyTotals.salesAchieved)}
                  </td>
                  <td className={`${tdClass} text-center`}>
                    <PctBadge value={pctOf(monthlyTotals.salesAchieved, monthlyTotals.salesTarget)} />
                  </td>
                  <td className={`${tdClass} text-left`}>
                    <RemainingCell value={monthlyTotals.salesTarget - monthlyTotals.salesAchieved} />
                  </td>
                  <td className={`${tdClass} text-left font-mono tabular-nums font-black`}>
                    {money(monthlyTotals.collectionTarget)}
                  </td>
                  <td className={`${tdClass} text-left font-mono tabular-nums font-black text-[--app-warn] dark:text-[--app-warn]/900`}>
                    {money(monthlyTotals.collectionAchieved)}
                  </td>
                  <td className={`${tdClass} text-center`}>
                    <PctBadge value={pctOf(monthlyTotals.collectionAchieved, monthlyTotals.collectionTarget)} />
                  </td>
                  <td className={`${tdClass} text-left`}>
                    <RemainingCell value={monthlyTotals.collectionTarget - monthlyTotals.collectionAchieved} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Reps table grouped by supervisor */}
      <div className="rounded-2xl border border-[--app-risk]/30 dark:border-[#26364D] bg-white dark:bg-[#111C2E] shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3 border-b border-slate-100 dark:border-[#1E2C42]">
          <div>
            <h2 className="text-sm font-extrabold text-[--app-ok] dark:text-[--app-ok] flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-blue-500" />
              أداء المندوبين
            </h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              مجمّعين تحت مشرفيهم — {monthLabel}
              {selectedBranch !== 'all' ? ` • ${selectedBranch}` : ''}
              {searchQuery.trim() ? ` • بحث: «${searchQuery.trim()}»` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 px-2.5 py-1 text-[10px] font-bold text-[--app-ok] dark:text-[--app-ok]/900">
              <UserCheck className="w-3 h-3" />
              {repRows.length} مندوب
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/50 px-2.5 py-1 text-[10px] font-bold text-[--app-warn] dark:text-[--app-warn]/900">
              <Users className="w-3 h-3" />
              {supervisorGroups.length} مشرف
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-right border-collapse">
            <thead>
              <tr>
                <th className={`${thClass} text-right`}>المندوب</th>
                <th className={`${thClass} text-right`}>الفرع</th>
                <th className={`${thClass} text-left`}>هدف المبيعات</th>
                <th className={`${thClass} text-left`}>المحقق مبيعات</th>
                <th className={`${thClass} text-center`}>النسبة</th>
                <th className={`${thClass} text-left`}>المتبقي مبيعات</th>
                <th className={`${thClass} text-left`}>هدف التحصيل</th>
                <th className={`${thClass} text-left`}>المحقق تحصيل</th>
                <th className={`${thClass} text-center`}>النسبة</th>
                <th className={`${thClass} text-left`}>المتبقي تحصيل</th>
              </tr>
            </thead>
            <tbody>
              {supervisorGroups.slice(0, visibleGroupCount).map((group) => {
                const groupSalesPct = pctOf(group.agg.salesAchieved, group.agg.salesTarget);
                const groupCollPct = pctOf(group.agg.collectionAchieved, group.agg.collectionTarget);
                const isExpanded = expandedGroups.has(group.supervisor);
                const REPS_PER_GROUP = 12;
                const repsToShow = isExpanded ? group.reps : group.reps.slice(0, REPS_PER_GROUP);
                const hiddenReps = group.reps.length - repsToShow.length;
                return (
                  <React.Fragment key={group.supervisor}>
                    <tr className="bg-[--app-risk]/10/90 dark:bg-[#17243A]">
                      <td colSpan={2} className={`${tdClass} font-black text-slate-900 dark:text-white`}>
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-cyan-500" />
                          المشرف: {group.supervisor}
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            ({group.reps.length} مندوب)
                          </span>
                        </span>
                      </td>
                      <td className={`${tdClass} text-left font-mono tabular-nums font-black`}>
                        {money(group.agg.salesTarget)}
                      </td>
                      <td className={`${tdClass} text-left font-mono tabular-nums font-black text-[--app-ok] dark:text-[--app-ok]/900`}>
                        {money(group.agg.salesAchieved)}
                      </td>
                      <td className={`${tdClass} text-center`}>
                        <PctBadge value={groupSalesPct} />
                      </td>
                      <td className={`${tdClass} text-left`}>
                        <RemainingCell value={group.agg.salesTarget - group.agg.salesAchieved} />
                      </td>
                      <td className={`${tdClass} text-left font-mono tabular-nums font-black`}>
                        {money(group.agg.collectionTarget)}
                      </td>
                      <td className={`${tdClass} text-left font-mono tabular-nums font-black text-[--app-warn] dark:text-[--app-warn]/900`}>
                        {money(group.agg.collectionAchieved)}
                      </td>
                      <td className={`${tdClass} text-center`}>
                        <PctBadge value={groupCollPct} />
                      </td>
                      <td className={`${tdClass} text-left`}>
                        <RemainingCell value={group.agg.collectionTarget - group.agg.collectionAchieved} />
                      </td>
                    </tr>

                    {repsToShow.map((rep) => {
                      const salesPct = pctOf(rep.agg.salesAchieved, rep.agg.salesTarget);
                      const collPct = pctOf(rep.agg.collectionAchieved, rep.agg.collectionTarget);
                      return (
                        <tr
                          key={`${group.supervisor}-${rep.key}`}
                          onClick={() => setSelectedRepKey(rep.key)}
                          className="hover:bg-blue-50/60 dark:hover:bg-[#17243A]/70 transition-colors cursor-pointer"
                          title="اضغط لعرض تفاصيل المندوب شهريًا"
                        >
                          <td className={tdClass}>
                            <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                              <span className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-[--app-ok] dark:text-[--app-ok]/900 flex items-center justify-center text-[10px] font-black">
                                {rep.name.trim().charAt(0) || '؟'}
                              </span>
                              {rep.name}
                              <ChevronRight className="w-3 h-3 text-slate-400" />
                            </span>
                          </td>
                          <td className={tdClass}>
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              <Building2 className="w-3 h-3" />
                              {rep.branch || '—'}
                            </span>
                          </td>
                          <td className={`${tdClass} text-left font-mono tabular-nums`}>
                            {money(rep.agg.salesTarget)}
                          </td>
                          <td className={`${tdClass} text-left font-mono tabular-nums font-bold text-[--app-ok] dark:text-[--app-ok]/900`}>
                            {money(rep.agg.salesAchieved)}
                          </td>
                          <td className={`${tdClass} text-center`}>
                            <PctBadge value={salesPct} />
                          </td>
                          <td className={`${tdClass} text-left`}>
                            <RemainingCell value={rep.agg.salesTarget - rep.agg.salesAchieved} />
                          </td>
                          <td className={`${tdClass} text-left font-mono tabular-nums`}>
                            {money(rep.agg.collectionTarget)}
                          </td>
                          <td className={`${tdClass} text-left font-mono tabular-nums font-bold text-[--app-warn] dark:text-[--app-warn]/900`}>
                            {money(rep.agg.collectionAchieved)}
                          </td>
                          <td className={`${tdClass} text-center`}>
                            <PctBadge value={collPct} />
                          </td>
                          <td className={`${tdClass} text-left`}>
                            <RemainingCell value={rep.agg.collectionTarget - rep.agg.collectionAchieved} />
                          </td>
                        </tr>
                      );
                    })}

                    {(hiddenReps > 0 || isExpanded) && group.reps.length > REPS_PER_GROUP && (
                      <tr>
                        <td colSpan={10} className="px-4 py-2 text-center bg-slate-50/70 dark:bg-[#121f33]">
                          <button
                            type="button"
                            onClick={() => setExpandedGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.supervisor)) next.delete(group.supervisor);
                              else next.add(group.supervisor);
                              return next;
                            })}
                            className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-[--app-risk]/10 dark:hover:bg-[#17243A] cursor-pointer"
                          >
                            {isExpanded ? 'عرض أقل' : `عرض ${hiddenReps} مندوب إضافي في هذه المجموعة`}
                          </button>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {visibleGroupCount < supervisorGroups.length && (
                <tr>
                  <td colSpan={10} className="px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleGroupCount((c) => c + 8)}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black cursor-pointer shadow-sm"
                    >
                      عرض المزيد من المشرفين ({supervisorGroups.length - visibleGroupCount} متبقي)
                    </button>
                  </td>
                </tr>
              )}

              {!repRows.length && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-xs font-bold text-slate-400">
                    لا يوجد مندوبون مطابقون للفلاتر الحالية
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rep monthly detail modal */}
      {selectedRep && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4"
          dir="rtl"
          onClick={() => setSelectedRepKey(null)}
        >
          <div
            className="w-full sm:max-w-4xl max-h-[92vh] overflow-y-auto bg-white dark:bg-[#0F1A2B] rounded-t-3xl sm:rounded-3xl border border-[--app-risk]/30 dark:border-[#26364D] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-white/95 dark:bg-[#0F1A2B]/95 backdrop-blur border-b border-[--app-risk]/30 dark:border-[#26364D] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-500 text-white flex items-center justify-center text-lg font-black shadow-sm">
                  {selectedRep.name.trim().charAt(0) || '؟'}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-[--app-ok] dark:text-[--app-ok]">
                    {selectedRep.name}
                  </h3>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {selectedRep.branch || '—'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {selectedRep.supervisor}
                    </span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRepKey(null)}
                className="p-2 rounded-xl bg-[--app-risk]/10 hover:bg-slate-200 dark:bg-[#17243A] dark:hover:bg-[#22354F] text-slate-600 dark:text-slate-300 transition cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/30 p-3">
                  <div className="text-[10px] font-bold text-[--app-ok] dark:text-[--app-ok]/900">هدف المبيعات</div>
                  <div dir="ltr" className="mt-1 text-base font-black font-mono text-blue-950 dark:text-blue-100">
                    {money(selectedRep.agg.salesTarget)}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 p-3">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">المحقق مبيعات</span>
                    <PctBadge value={pctOf(selectedRep.agg.salesAchieved, selectedRep.agg.salesTarget)} />
                  </div>
                  <div dir="ltr" className="mt-1 text-base font-black font-mono text-emerald-950 dark:text-emerald-100">
                    {money(selectedRep.agg.salesAchieved)}
                  </div>
                </div>
                <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 p-3">
                  <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300">هدف التحصيل</div>
                  <div dir="ltr" className="mt-1 text-base font-black font-mono text-amber-950 dark:text-amber-100">
                    {money(selectedRep.agg.collectionTarget)}
                  </div>
                </div>
                <div className="rounded-2xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/70 dark:bg-cyan-950/30 p-3">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-[--app-warn] dark:text-[--app-warn]/900">المحقق تحصيل</span>
                    <PctBadge value={pctOf(selectedRep.agg.collectionAchieved, selectedRep.agg.collectionTarget)} />
                  </div>
                  <div dir="ltr" className="mt-1 text-base font-black font-mono text-cyan-950 dark:text-cyan-100">
                    {money(selectedRep.agg.collectionAchieved)}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[--app-risk]/30 dark:border-[#26364D] overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-[--app-risk]/30 dark:border-[#26364D] bg-slate-50 dark:bg-[#0D1727]">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[--app-warn]" />
                    التفاصيل الشهرية
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {selectedRep.months.length} شهر
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-right border-collapse">
                    <thead>
                      <tr>
                        <th className={`${thClass} text-right`}>الشهر</th>
                        <th className={`${thClass} text-left`}>هدف مبيعات</th>
                        <th className={`${thClass} text-left`}>محقق مبيعات</th>
                        <th className={`${thClass} text-center`}>النسبة</th>
                        <th className={`${thClass} text-left`}>متبقي مبيعات</th>
                        <th className={`${thClass} text-left`}>هدف تحصيل</th>
                        <th className={`${thClass} text-left`}>محقق تحصيل</th>
                        <th className={`${thClass} text-center`}>النسبة</th>
                        <th className={`${thClass} text-left`}>متبقي تحصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRep.months.map((m) => (
                        <tr key={m.key} className="hover:bg-slate-50 dark:hover:bg-[#17243A]/60">
                          <td className={`${tdClass} font-bold`}>
                            {MONTH_NAMES[m.month - 1]} {m.year}
                          </td>
                          <td className={`${tdClass} text-left font-mono tabular-nums`}>{money(m.agg.salesTarget)}</td>
                          <td className={`${tdClass} text-left font-mono tabular-nums font-bold text-[--app-ok] dark:text-[--app-ok]/900`}>
                            {money(m.agg.salesAchieved)}
                          </td>
                          <td className={`${tdClass} text-center`}>
                            <PctBadge value={pctOf(m.agg.salesAchieved, m.agg.salesTarget)} />
                          </td>
                          <td className={`${tdClass} text-left`}>
                            <RemainingCell value={m.agg.salesTarget - m.agg.salesAchieved} />
                          </td>
                          <td className={`${tdClass} text-left font-mono tabular-nums`}>{money(m.agg.collectionTarget)}</td>
                          <td className={`${tdClass} text-left font-mono tabular-nums font-bold text-[--app-warn] dark:text-[--app-warn]/900`}>
                            {money(m.agg.collectionAchieved)}
                          </td>
                          <td className={`${tdClass} text-center`}>
                            <PctBadge value={pctOf(m.agg.collectionAchieved, m.agg.collectionTarget)} />
                          </td>
                          <td className={`${tdClass} text-left`}>
                            <RemainingCell value={m.agg.collectionTarget - m.agg.collectionAchieved} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[--app-ok] dark:text-[--app-ok]/500">
                <CheckCircle2 className="w-3.5 h-3.5" />
                الأرقام مأخوذة مباشرة من شيت التارجت، والنسب محسوبة من المحقق ÷ الهدف.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
