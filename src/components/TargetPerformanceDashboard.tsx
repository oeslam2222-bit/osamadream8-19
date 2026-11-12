import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Flame,
  Layers,
  Percent,
  PieChart,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  User,
  Users,
  Wallet,
  X,
  Zap,
  Phone,
  MapPin,
  ClipboardList,
  RefreshCw as RefreshIcon
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useApp } from '../context/AppContext';
import { StatGrid } from './ui/StatGrid';
import { isArabicNameMatch, normalizeArabicText } from '../services/arabicMatchingService';
import {
  ARABIC_MONTHS,
  downloadTargetTemplateExcel,
  formatEGP,
  getQuarterFromMonth,
  inferTargetSector,
  QUARTER_LABELS
} from '../services/targetService';
import { TargetQuarter, TargetRecord } from '../types';
import {
  getPublishedDataSources,
  getSavedSourceUrl,
  saveSingleSourceUrl,
} from '../services/dataSourceService';
import { EncouragementProvider, useEncouragement, EncouragementBadge } from './EncouragementSystem';

// Helper to normalize and match branch names with tolerance for prefixes
const isBranchMatch = (b1?: string | null, b2?: string | null): boolean => {
  if (!b1 || !b2) return false;
  const n1 = normalizeArabicText(b1).replace(/^(فرع|مخزن)\s*/, '');
  const n2 = normalizeArabicText(b2).replace(/^(فرع|مخزن)\s*/, '');
  return n1.includes(n2) || n2.includes(n1);
};

/** دائرة التقدم النظيفة — حلقات التارجت في صفحة أداء المناديب. */
const RingGauge: React.FC<{
  percent: number;
  color: string;
  track?: string;
  size?: number;
  stroke?: number;
  label?: string;
}> = ({ percent, color, track = '#E2E8F0', size = 96, stroke = 11, label }) => {
  const p = Math.max(0, Math.min(100, percent || 0));
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-black tabular-nums leading-none text-[#0F2B38]">{Math.round(p)}%</span>
        {label && <span className="mt-0.5 text-[9px] font-bold text-slate-500">{label}</span>}
      </div>
    </div>
  );
};

export const TargetPerformanceDashboard: React.FC = () => {
  const {
    currentUser,
    users,
    customers,
    targets,
    getVisibleTargets,
    importTargetsFromExcel,
    importTargetsFromGoogleSheet,
    exportTargetsReport,
    resetTargetsToDefault,
    activeSectorFilter,
    setActiveSectorFilter,
  } = useApp();

  const { showEncouragement, activeEncouragement } = useEncouragement();

  const isSalesRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isBranchManager = currentUser?.role === 'branch_manager';
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  // Role-specific view state
  const [supervisorViewMode, setSupervisorViewMode] = useState<'my_team' | 'my_personal'>('my_team');

  // Period mode: 'monthly' or 'quarterly'
  const [periodMode, setPeriodMode] = useState<'monthly' | 'quarterly'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>('ALL');
  const [selectedQuarter, setSelectedQuarter] = useState<TargetQuarter | 'ALL'>('ALL');
  const [selectedYear, setSelectedYear] = useState<number | 'ALL'>(2026);

  // Filters for Admin / Manager / Supervisor
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('ALL');
  const [selectedRep, setSelectedRep] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Chart view mode: timeline vs monthly comparison vs reps ranking
  const [chartViewMode, setChartViewMode] = useState<'timeline' | 'monthly_comparison' | 'reps_ranking'>('timeline');
  const [comparisonMetric, setComparisonMetric] = useState<'amount' | 'percentage'>('amount');

  // Monthly Details Table display filter: all 12 months vs only months with data
  const [tableMonthsFilter, setTableMonthsFilter] = useState<'all_12' | 'with_data_only'>('all_12');

  // Persistent Google Sheets Live URL State
  const [targetsSheetUrl, setTargetsSheetUrl] = useState(() => getSavedSourceUrl('targets'));
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showUrlEdit, setShowUrlEdit] = useState(false);

  // Admin tabs: overview | quarters | table
  const [adminTab, setAdminTab] = useState<'overview' | 'quarters' | 'table'>('overview');

  const [visibleEmployeeCount, setVisibleEmployeeCount] = useState(12);
  const [visibleRawRowsCount, setVisibleRawRowsCount] = useState(25);

  // Excel Upload Modal State (Admin / Dev only)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 🏠⚡ فلتر قطاع التارجت (منزلي / كهربائي) — مربوط بالسياق العام
  const canSwitchSector =
    isAdminOrDev || !currentUser?.sector || currentUser.sector === 'all' || currentUser.sector === 'both';
  const effectiveSector: 'all' | 'home' | 'electrical' = canSwitchSector
    ? activeSectorFilter
    : currentUser?.sector === 'electrical'
      ? 'electrical'
      : 'home';

  // User-visible records based on strict RBAC + sector
  const rawRecords = getVisibleTargets();
  const recordSector = (r: TargetRecord): 'home' | 'electrical' | undefined => {
    if (r.sector === 'home' || r.sector === 'electrical') return r.sector;
    return inferTargetSector(r, users);
  };
  const sectorCounts = useMemo(() => {
    const c = { all: rawRecords.length, home: 0, electrical: 0 };
    rawRecords.forEach((r) => {
      const s = recordSector(r);
      if (s === 'home') c.home += 1;
      else if (s === 'electrical') c.electrical += 1;
    });
    return c;
  }, [rawRecords, users]);
  const visibleRecords = useMemo(() => {
    if (effectiveSector === 'all') return rawRecords;
    return rawRecords.filter((r) => recordSector(r) === effectiveSector);
  }, [rawRecords, users, effectiveSector]);

  // Determine active branch context
  const effectiveBranch = useMemo(() => {
    if (isBranchManager || isSupervisor || isSalesRep) {
      return currentUser?.branchName || '';
    }
    return selectedBranch !== 'ALL' ? selectedBranch : '';
  }, [isBranchManager, isSupervisor, isSalesRep, currentUser, selectedBranch]);

  // Distinct branches available to this user
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    visibleRecords.forEach((r) => {
      if (r.branch) set.add(r.branch);
    });
    return Array.from(set);
  }, [visibleRecords]);

  // Supervisors available in this branch (for Branch Manager & Admin)
  const branchSupervisors = useMemo(() => {
    const set = new Set<string>();
    users
      .filter((u) => u.role === 'supervisor' && (!effectiveBranch || isBranchMatch(u.branchName, effectiveBranch)))
      .forEach((u) => set.add(u.name));

    customers.forEach((c) => {
      if (c.supervisorName && (!effectiveBranch || isBranchMatch(c.branchName, effectiveBranch))) {
        set.add(c.supervisorName.trim());
      }
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [users, customers, effectiveBranch]);

  // Reps under selected supervisor
  const repsUnderSelectedSupervisor = useMemo(() => {
    if (selectedSupervisor === 'ALL') return null;
    const set = new Set<string>();

    const supUser = users.find(
      (u) =>
        u.role === 'supervisor' &&
        (u.name === selectedSupervisor || isArabicNameMatch(u.name, selectedSupervisor))
    );
    if (supUser) {
      users.filter((u) => u.supervisorId === supUser.id).forEach((u) => set.add(u.name));
    }

    customers.forEach((c) => {
      if (
        c.supervisorName &&
        (isArabicNameMatch(c.supervisorName, selectedSupervisor) ||
          normalizeArabicText(c.supervisorName) === normalizeArabicText(selectedSupervisor))
      ) {
        if (c.repName) set.add(c.repName.trim());
      }
    });

    set.add(selectedSupervisor);
    return set;
  }, [selectedSupervisor, users, customers]);

  // Distinct reps available for the current branch & supervisor filters
  const branchAndSupervisorReps = useMemo(() => {
    if (isSupervisor && currentUser) {
      const directSupervised = users.filter((u) => u.supervisorId === currentUser.id);
      const directNames = new Set(directSupervised.map((u) => normalizeArabicText(u.name)));

      customers.forEach((c) => {
        if (
          c.supervisorName &&
          (isArabicNameMatch(c.supervisorName, currentUser.name) ||
            normalizeArabicText(c.supervisorName) === normalizeArabicText(currentUser.name))
        ) {
          if (c.repName) directNames.add(normalizeArabicText(c.repName));
        }
      });

      const set = new Set<string>();
      visibleRecords.forEach((r) => {
        if (isArabicNameMatch(r.repName, currentUser.name)) return;
        const norm = normalizeArabicText(r.repName);
        if (directNames.size === 0 || Array.from(directNames).some((dn) => isArabicNameMatch(r.repName, dn) || norm.includes(dn))) {
          set.add(r.repName);
        }
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
    }

    if (selectedSupervisor !== 'ALL' && repsUnderSelectedSupervisor) {
      return Array.from(repsUnderSelectedSupervisor)
        .filter((r) => r !== selectedSupervisor)
        .sort((a, b) => a.localeCompare(b, 'ar'));
    }

    const set = new Set<string>();
    visibleRecords.forEach((r) => {
      if (!effectiveBranch || isBranchMatch(r.branch, effectiveBranch)) {
        if (r.repName) set.add(r.repName);
      }
    });

    users.forEach((u) => {
      if (u.role === 'sales_rep') {
        if (!effectiveBranch || isBranchMatch(u.branchName, effectiveBranch)) {
          set.add(u.name);
        }
      }
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [isSupervisor, currentUser, users, customers, visibleRecords, selectedSupervisor, repsUnderSelectedSupervisor, effectiveBranch]);

  // Supervised reps for supervisor
  const supervisedReps = useMemo(() => {
    if (!isSupervisor || !currentUser) return [];
    return branchAndSupervisorReps;
  }, [isSupervisor, currentUser, branchAndSupervisorReps]);

  // Handler for branch change: resets supervisor and rep filters
  const handleBranchChange = (newBranch: string) => {
    setSelectedBranch(newBranch);
    setSelectedSupervisor('ALL');
    setSelectedRep('ALL');
  };

  // Handler for supervisor change: resets rep filter
  const handleSupervisorChange = (newSupervisor: string) => {
    setSelectedSupervisor(newSupervisor);
    setSelectedRep('ALL');
  };

  // Filter records based on role, period mode, and user filters
  const filteredRecords = useMemo(() => {
    return visibleRecords.filter((r) => {
      if (isSupervisor && currentUser) {
        const isSelf = isArabicNameMatch(r.repName, currentUser.name) ||
          normalizeArabicText(r.repName) === normalizeArabicText(currentUser.name);

        if (supervisorViewMode === 'my_personal') {
          if (!isSelf) return false;
        } else {
          if (isSelf && supervisedReps.length > 0) return false;
        }
      }

      if (selectedYear !== 'ALL' && r.year !== selectedYear) return false;

      if (periodMode === 'monthly') {
        if (selectedMonth !== 'ALL' && r.month !== selectedMonth) return false;
      } else {
        if (selectedQuarter !== 'ALL' && r.quarter !== selectedQuarter) return false;
      }

      if (isAdminOrDev && selectedBranch !== 'ALL' && !isBranchMatch(r.branch, selectedBranch)) {
        return false;
      }

      if ((isBranchManager || isAdminOrDev) && selectedSupervisor !== 'ALL' && repsUnderSelectedSupervisor) {
        const normRep = normalizeArabicText(r.repName);
        const matches = Array.from(repsUnderSelectedSupervisor).some(
          (sRep) => isArabicNameMatch(r.repName, sRep) || normRep === normalizeArabicText(sRep)
        );
        if (!matches) return false;
      }

      if (!isSalesRep && selectedRep !== 'ALL') {
        if (!isArabicNameMatch(r.repName, selectedRep) && normalizeArabicText(r.repName) !== normalizeArabicText(selectedRep)) {
          return false;
        }
      }

      if (isAdminOrDev && searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const bMatch = r.branch?.toLowerCase().includes(query);
        const rMatch = r.repName?.toLowerCase().includes(query);
        if (!bMatch && !rMatch) return false;
      }

      return true;
    });
  }, [
    visibleRecords,
    isSupervisor,
    currentUser,
    supervisorViewMode,
    supervisedReps,
    selectedYear,
    periodMode,
    selectedMonth,
    selectedQuarter,
    isAdminOrDev,
    selectedBranch,
    isBranchManager,
    selectedSupervisor,
    repsUnderSelectedSupervisor,
    isSalesRep,
    selectedRep,
    searchQuery,
  ]);

  // Key KPI Numbers
  const kpis = useMemo(() => {
    let totalSalesTarget = 0;
    let totalSalesAchieved = 0;
    let totalCollectionTarget = 0;
    let totalCollectionAchieved = 0;

    filteredRecords.forEach((r) => {
      totalSalesTarget += r.salesTarget || 0;
      totalSalesAchieved += r.salesAchieved || 0;
      totalCollectionTarget += r.collectionTarget || 0;
      totalCollectionAchieved += Math.abs(Number(r.collectionAchieved) || 0);
    });

    const salesPercentage = totalSalesTarget > 0 ? (totalSalesAchieved / totalSalesTarget) * 100 : 0;
    const collectionPercentage = totalCollectionTarget > 0 ? (totalCollectionAchieved / totalCollectionTarget) * 100 : 0;
    const remainingSales = Math.max(0, totalSalesTarget - totalSalesAchieved);
    const remainingCollection = Math.max(0, totalCollectionTarget - totalCollectionAchieved);

    return {
      totalSalesTarget,
      totalSalesAchieved,
      salesPercentage: Number(salesPercentage.toFixed(1)),
      remainingSales,
      totalCollectionTarget,
      totalCollectionAchieved,
      collectionPercentage: Number(collectionPercentage.toFixed(1)),
      remainingCollection,
      count: filteredRecords.length,
    };
  }, [filteredRecords]);

  // Unified Performance Chart Item interface
  interface PerformanceChartItem {
    periodLabel: string;
    salesTarget: number;
    salesAchieved: number;
    collectionTarget: number;
    collectionAchieved: number;
  }

  // Unified Chart Data for Monthly or Quarterly view
  const displayChartData = useMemo<PerformanceChartItem[]>(() => {
    if (periodMode === 'monthly') {
      const buckets: Record<number, PerformanceChartItem> = {};

      for (let m = 1; m <= 12; m++) {
        buckets[m] = {
          periodLabel: ARABIC_MONTHS[m - 1],
          salesTarget: 0,
          salesAchieved: 0,
          collectionTarget: 0,
          collectionAchieved: 0,
        };
      }

      filteredRecords.forEach((r) => {
        const m = r.month;
        if (m >= 1 && m <= 12) {
          buckets[m].salesTarget += r.salesTarget || 0;
          buckets[m].salesAchieved += r.salesAchieved || 0;
          buckets[m].collectionTarget += r.collectionTarget || 0;
          buckets[m].collectionAchieved += Math.abs(Number(r.collectionAchieved) || 0);
        }
      });

      return Object.values(buckets);
    } else {
      const qData: Record<TargetQuarter, PerformanceChartItem> = {
        Q1: { periodLabel: 'Q1 (يناير - مارس)', salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0 },
        Q2: { periodLabel: 'Q2 (إبريل - يونيو)', salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0 },
        Q3: { periodLabel: 'Q3 (يوليو - سبتمبر)', salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0 },
        Q4: { periodLabel: 'Q4 (أكتوبر - ديسمبر)', salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0 },
      };

      filteredRecords.forEach((r) => {
        if (r.quarter && qData[r.quarter]) {
          qData[r.quarter].salesTarget += r.salesTarget || 0;
          qData[r.quarter].salesAchieved += r.salesAchieved || 0;
          qData[r.quarter].collectionTarget += r.collectionTarget || 0;
          qData[r.quarter].collectionAchieved += Math.abs(Number(r.collectionAchieved) || 0);
        }
      });

      return Object.values(qData);
    }
  }, [periodMode, filteredRecords]);

  // Reps Ranking Data for Performance Comparison Chart
  const repsRankingData = useMemo(() => {
    const map = new Map<
      string,
      {
        repName: string;
        salesTarget: number;
        salesAchieved: number;
        colTarget: number;
        colAchieved: number;
      }
    >();

    filteredRecords.forEach((r) => {
      if (!r.repName) return;
      const existing = map.get(r.repName) || {
        repName: r.repName,
        salesTarget: 0,
        salesAchieved: 0,
        colTarget: 0,
        colAchieved: 0,
      };
      existing.salesTarget += r.salesTarget || 0;
      existing.salesAchieved += r.salesAchieved || 0;
      existing.colTarget += r.collectionTarget || 0;
      existing.colAchieved += r.collectionAchieved || 0;
      map.set(r.repName, existing);
    });

    return Array.from(map.values())
      .map((item) => {
        const salesPerc =
          item.salesTarget > 0 ? Number(((item.salesAchieved / item.salesTarget) * 100).toFixed(1)) : 0;
        const colPerc =
          item.colTarget > 0 ? Number(((item.colAchieved / item.colTarget) * 100).toFixed(1)) : 0;
        return {
          ...item,
          salesPerc,
          colPerc,
        };
      })
      .sort((a, b) => b.salesPerc - a.salesPerc);
  }, [filteredRecords]);

  // Base records for the monthly details matrix (filtered by user/role/branch/rep/year, WITHOUT filtering out months)
  const baseRecordsForMonths = useMemo(() => {
    return visibleRecords.filter((r) => {
      if (isSupervisor && currentUser) {
        const isSelf = isArabicNameMatch(r.repName, currentUser.name) ||
          normalizeArabicText(r.repName) === normalizeArabicText(currentUser.name);

        if (supervisorViewMode === 'my_personal') {
          if (!isSelf) return false;
        } else {
          if (isSelf && supervisedReps.length > 0) return false;
        }
      }

      if (selectedYear !== 'ALL' && r.year !== selectedYear) return false;

      if (periodMode === 'quarterly' && selectedQuarter !== 'ALL' && r.quarter !== selectedQuarter) {
        return false;
      }

      if (isAdminOrDev && selectedBranch !== 'ALL' && !isBranchMatch(r.branch, selectedBranch)) {
        return false;
      }

      if ((isBranchManager || isAdminOrDev) && selectedSupervisor !== 'ALL' && repsUnderSelectedSupervisor) {
        const normRep = normalizeArabicText(r.repName);
        const matches = Array.from(repsUnderSelectedSupervisor).some(
          (sRep) => isArabicNameMatch(r.repName, sRep) || normRep === normalizeArabicText(sRep)
        );
        if (!matches) return false;
      }

      if (!isSalesRep && selectedRep !== 'ALL') {
        if (!isArabicNameMatch(r.repName, selectedRep) && normalizeArabicText(r.repName) !== normalizeArabicText(selectedRep)) {
          return false;
        }
      }

      if (isAdminOrDev && searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const bMatch = r.branch?.toLowerCase().includes(query);
        const rMatch = r.repName?.toLowerCase().includes(query);
        if (!bMatch && !rMatch) return false;
      }

      return true;
    });
  }, [
    visibleRecords,
    isSupervisor,
    currentUser,
    supervisorViewMode,
    supervisedReps,
    selectedYear,
    periodMode,
    selectedQuarter,
    isAdminOrDev,
    selectedBranch,
    isBranchManager,
    selectedSupervisor,
    repsUnderSelectedSupervisor,
    isSalesRep,
    selectedRep,
    searchQuery,
  ]);

  interface MonthlyMatrixRow {
    month: number;
    monthName: string;
    quarter: TargetQuarter;
    salesTarget: number;
    salesAchieved: number;
    salesPerc: number;
    remainingSales: number;
    colTarget: number;
    colAchieved: number;
    colPerc: number;
    remainingCol: number;
    recordsCount: number;
    activeCustomers: number;
    totalCustomers: number;
    salesGap60: number;
    salesGap70: number;
    salesGap90: number;
    salesGap100: number;
    colGap60: number;
    colGap70: number;
    colGap90: number;
    colGap100: number;
    highestMilestone: '100%+' | '90%+' | '70%+' | '60%+' | 'below_60' | 'none';
  }

  // Filtered customers matching the same branch/supervisor/rep filters as baseRecordsForMonths
  const filteredCustomersForMonths = useMemo(() => {
    return customers.filter((c) => {
      const repName = c.salesRepName || c.repName || '';

      if (isSupervisor && currentUser) {
        const isSelf = isArabicNameMatch(repName, currentUser.name) ||
          normalizeArabicText(repName) === normalizeArabicText(currentUser.name);
        if (supervisorViewMode === 'my_personal') {
          if (!isSelf) return false;
        } else {
          if (isSelf && supervisedReps.length > 0) return false;
          if (supervisedReps.length > 0) {
            const normRep = normalizeArabicText(repName);
            const matches = supervisedReps.some((sr) => isArabicNameMatch(repName, sr) || normRep === normalizeArabicText(sr));
            if (!matches) return false;
          }
        }
      }

      if (isSalesRep && currentUser) {
        if (!isArabicNameMatch(repName, currentUser.name) && normalizeArabicText(repName) !== normalizeArabicText(currentUser.name)) {
          return false;
        }
      }

      if (isBranchManager && currentUser) {
        if (!isBranchMatch(c.branchName, currentUser.branchName)) return false;
      }
      if (isAdminOrDev && selectedBranch !== 'ALL' && !isBranchMatch(c.branchName, selectedBranch)) return false;

      if ((isBranchManager || isAdminOrDev) && selectedSupervisor !== 'ALL' && repsUnderSelectedSupervisor) {
        const normRep = normalizeArabicText(repName);
        const matches = Array.from(repsUnderSelectedSupervisor).some(
          (sRep) => isArabicNameMatch(repName, sRep) || normRep === normalizeArabicText(sRep)
        );
        if (!matches) return false;
      }

      if (!isSalesRep && selectedRep !== 'ALL') {
        if (!isArabicNameMatch(repName, selectedRep) && normalizeArabicText(repName) !== normalizeArabicText(selectedRep)) {
          return false;
        }
      }

      return true;
    });
  }, [customers, isSupervisor, currentUser, supervisorViewMode, supervisedReps, isSalesRep, isBranchManager, isAdminOrDev, selectedBranch, selectedSupervisor, repsUnderSelectedSupervisor, selectedRep]);

  // Monthly Matrix Rows for all 12 months
  const monthlyMatrixRows = useMemo<MonthlyMatrixRow[]>(() => {
    const rows: MonthlyMatrixRow[] = [];

    for (let m = 1; m <= 12; m++) {
      const monthRecords = baseRecordsForMonths.filter((r) => r.month === m);
      let sTarget = 0;
      let sAchieved = 0;
      let cTarget = 0;
      let cAchieved = 0;

      monthRecords.forEach((r) => {
        sTarget += Math.abs(r.salesTarget || 0);
        sAchieved += Math.abs(r.salesAchieved || 0);
        cTarget += Math.abs(r.collectionTarget || 0);
        cAchieved += Math.abs(r.collectionAchieved || 0);
      });

      const sPerc = sTarget > 0 ? Number(((sAchieved / sTarget) * 100).toFixed(1)) : 0;
      const cPerc = cTarget > 0 ? Number(((cAchieved / cTarget) * 100).toFixed(1)) : 0;

      const remS = Math.max(0, sTarget - sAchieved);
      const remC = Math.max(0, cTarget - cAchieved);

      const salesGap60 = Math.max(0, sTarget * 0.6 - sAchieved);
      const salesGap70 = Math.max(0, sTarget * 0.7 - sAchieved);
      const salesGap90 = Math.max(0, sTarget * 0.9 - sAchieved);
      const salesGap100 = remS;

      const colGap60 = Math.max(0, cTarget * 0.6 - cAchieved);
      const colGap70 = Math.max(0, cTarget * 0.7 - cAchieved);
      const colGap90 = Math.max(0, cTarget * 0.9 - cAchieved);
      const colGap100 = remC;

      let highestMilestone: MonthlyMatrixRow['highestMilestone'] = 'none';
      if (sTarget > 0 || cTarget > 0) {
        if (sPerc >= 100 && cPerc >= 100) highestMilestone = '100%+';
        else if (sPerc >= 90 && cPerc >= 90) highestMilestone = '90%+';
        else if (sPerc >= 70 && cPerc >= 70) highestMilestone = '70%+';
        else if (sPerc >= 60 || cPerc >= 60) highestMilestone = '60%+';
        else highestMilestone = 'below_60';
      }

      const activeCustomersForMonth = filteredCustomersForMonths.filter((c) => {
        const ms = c.monthlySales2026;
        return ms && ms[m] && ms[m] > 0;
      }).length;

      rows.push({
        month: m,
        monthName: ARABIC_MONTHS[m - 1],
        quarter: getQuarterFromMonth(m),
        salesTarget: sTarget,
        salesAchieved: sAchieved,
        salesPerc: sPerc,
        remainingSales: remS,
        colTarget: cTarget,
        colAchieved: cAchieved,
        colPerc: cPerc,
        remainingCol: remC,
        recordsCount: monthRecords.length,
        activeCustomers: activeCustomersForMonth,
        totalCustomers: filteredCustomersForMonths.length,
        salesGap60,
        salesGap70,
        salesGap90,
        salesGap100,
        colGap60,
        colGap70,
        colGap90,
        colGap100,
        highestMilestone,
      });
    }

    return rows;
  }, [baseRecordsForMonths, filteredCustomersForMonths]);

  // Filter rows according to user's view choice (all 12 or with data only)
  const displayedMonthlyRows = useMemo(() => {
    if (tableMonthsFilter === 'with_data_only') {
      return monthlyMatrixRows.filter(
        (r) => r.salesTarget > 0 || r.salesAchieved > 0 || r.colTarget > 0 || r.colAchieved > 0 || r.recordsCount > 0
      );
    }
    return monthlyMatrixRows;
  }, [monthlyMatrixRows, tableMonthsFilter]);

  // Grand totals for the monthly details matrix
  const monthlyMatrixTotals = useMemo(() => {
    let totSalesTarget = 0;
    let totSalesAchieved = 0;
    let totColTarget = 0;
    let totColAchieved = 0;
    let totRecords = 0;
    let totActiveCustomers = 0;

    monthlyMatrixRows.forEach((r) => {
      totSalesTarget += r.salesTarget;
      totSalesAchieved += r.salesAchieved;
      totColTarget += r.colTarget;
      totColAchieved += r.colAchieved;
      totRecords += r.recordsCount;
      totActiveCustomers = Math.max(totActiveCustomers, r.activeCustomers);
    });

    const totSalesPerc = totSalesTarget > 0 ? Number(((totSalesAchieved / totSalesTarget) * 100).toFixed(1)) : 0;
    const totColPerc = totColTarget > 0 ? Number(((totColAchieved / totColTarget) * 100).toFixed(1)) : 0;
    const totRemSales = Math.max(0, totSalesTarget - totSalesAchieved);
    const totRemCol = Math.max(0, totColTarget - totColAchieved);

    return {
      totSalesTarget,
      totSalesAchieved,
      totSalesPerc,
      totRemSales,
      totColTarget,
      totColAchieved,
      totColPerc,
      totRemCol,
      totRecords,
      totActiveCustomers,
      totTotalCustomers: filteredCustomersForMonths.length,
      totSalesGap60: Math.max(0, totSalesTarget * 0.6 - totSalesAchieved),
      totSalesGap70: Math.max(0, totSalesTarget * 0.7 - totSalesAchieved),
      totSalesGap90: Math.max(0, totSalesTarget * 0.9 - totSalesAchieved),
      totSalesGap100: totRemSales,
      totColGap60: Math.max(0, totColTarget * 0.6 - totColAchieved),
      totColGap70: Math.max(0, totColTarget * 0.7 - totColAchieved),
      totColGap90: Math.max(0, totColTarget * 0.9 - totColAchieved),
      totColGap100: totRemCol,
    };
  }, [monthlyMatrixRows, filteredCustomersForMonths]);

  // Monthly Comparison Chart Data for Power BI side-by-side visualization
  const monthlyComparisonChartData = useMemo(() => {
    return monthlyMatrixRows
      .filter((r) => r.salesTarget > 0 || r.salesAchieved > 0 || r.colTarget > 0 || r.colAchieved > 0)
      .map((r) => ({
        monthName: r.monthName,
        quarter: r.quarter,
        salesTarget: r.salesTarget,
        salesAchieved: r.salesAchieved,
        salesPerc: r.salesPerc,
        colTarget: r.colTarget,
        colAchieved: r.colAchieved,
        colPerc: r.colPerc,
        colVsSalesRatio: r.salesAchieved > 0 ? Number(((r.colAchieved / r.salesAchieved) * 100).toFixed(1)) : 0,
      }));
  }, [monthlyMatrixRows]);

  // Google Sheets Direct Sync Handler
  const handleSyncGoogleSheet = async (urlOverride?: string) => {
    const urlToUse = (urlOverride !== undefined ? urlOverride : targetsSheetUrl).trim();
    if (!urlToUse) {
      setSyncNotice({ type: 'error', message: 'يرجى إدخال رابط Google Sheets صالح أولاً.' });
      return;
    }
    setIsSyncingSheet(true);
    setSyncNotice(null);
    try {
      const res = await importTargetsFromGoogleSheet(urlToUse);
      if (res.success) {
        setSyncNotice({ type: 'success', message: res.message });
        setTargetsSheetUrl(urlToUse);
        saveSingleSourceUrl('targets', urlToUse);
        setShowUrlEdit(false);
      } else {
        setSyncNotice({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setSyncNotice({ type: 'error', message: err?.message || 'فشل الاتصال بـ Google Sheets' });
    } finally {
      setIsSyncingSheet(false);
    }
  };

  // Excel File Upload Handler (Admin / Developer)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadFeedback(null);

    const result = await importTargetsFromExcel(file);
    setIsUploading(false);

    if (result.success) {
      setUploadFeedback({ type: 'success', message: result.message });
      setTimeout(() => {
        setIsUploadModalOpen(false);
        setUploadFeedback(null);
      }, 1800);
    } else {
      setUploadFeedback({ type: 'error', message: result.message });
    }
  };

  const getBadgeColor = (percent: number) => {
    if (percent >= 100) return 'bg-[rgba(46,125,91,.12)] text-[var(--app-ok)] border-[rgba(46,125,91,.28)]';
    if (percent >= 80) return 'bg-[rgba(155,112,39,.14)] text-[var(--app-warn)] border-[rgba(155,112,39,.30)]';
    return 'bg-[rgba(179,74,74,.12)] text-[var(--app-risk)] border-[rgba(179,74,74,.28)]';
  };

  // ============================================================
  // Employee Cards Data (كروت الموظفين مع البيانات الشاملة)
  // ============================================================
  const employeeCardsData = useMemo(() => {
    const map = new Map<string, {
      repName: string;
      salesTarget: number;
      salesAchieved: number;
      colTarget: number;
      colAchieved: number;
      customerCount: number;
      activeCustomers: number;
      totalDebt: number;
      overdueDebt: number;
      creditLimit: number;
      sector: 'home' | 'electrical' | 'both' | 'all' | undefined;
      branch: string | undefined;
      salesPerc: number;
      colPerc: number;
    }>();

    filteredRecords.forEach((r) => {
      if (!r.repName) return;
      const existing = map.get(r.repName) || {
        repName: r.repName,
        salesTarget: 0,
        salesAchieved: 0,
        colTarget: 0,
        colAchieved: 0,
        customerCount: 0,
        activeCustomers: 0,
        totalDebt: 0,
        overdueDebt: 0,
        creditLimit: 0,
        sector: undefined,
        branch: r.branch,
        salesPerc: 0,
        colPerc: 0,
      };
      existing.salesTarget += r.salesTarget || 0;
      existing.salesAchieved += r.salesAchieved || 0;
      existing.colTarget += r.collectionTarget || 0;
      existing.colAchieved += r.collectionAchieved || 0;
      existing.salesPerc = existing.salesTarget > 0 ? Number(((existing.salesAchieved / existing.salesTarget) * 100).toFixed(1)) : 0;
      existing.colPerc = existing.colTarget > 0 ? Number(((existing.colAchieved / existing.colTarget) * 100).toFixed(1)) : 0;
      existing.branch = r.branch;
      map.set(r.repName, existing);
    });

    // Merge customer financial data from customers list
    customers.forEach((c) => {
      const rep = c.salesRepName || c.repName || '';
      const existing = map.get(rep);
      if (existing) {
        existing.customerCount += 1;
        const bal = Number(c.currentBalance ?? c.balance ?? 0);
        const overdue = Number(c.overdueBalance ?? c.totalOverdueAndDue ?? 0);
        existing.totalDebt += bal;
        existing.overdueDebt += overdue;
        existing.creditLimit += Number(c.creditLimit ?? 0);
        if (bal > 0 || overdue > 0) existing.activeCustomers += 1;
        existing.sector = c.sector;
        existing.salesPerc = existing.salesTarget > 0 ? Number(((existing.salesAchieved / existing.salesTarget) * 100).toFixed(1)) : 0;
        existing.colPerc = existing.colTarget > 0 ? Number(((existing.colAchieved / existing.colTarget) * 100).toFixed(1)) : 0;
      } else {
        const bal = Number(c.currentBalance ?? c.balance ?? 0);
        const overdue = Number(c.overdueBalance ?? c.totalOverdueAndDue ?? 0);
        map.set(rep, {
          repName: rep,
          salesTarget: 0,
          salesAchieved: 0,
          colTarget: 0,
          colAchieved: 0,
          customerCount: 1,
          activeCustomers: bal > 0 || overdue > 0 ? 1 : 0,
          totalDebt: bal,
          overdueDebt: overdue,
          creditLimit: Number(c.creditLimit ?? 0),
          sector: c.sector,
          branch: c.branchName,
          salesPerc: 0,
          colPerc: 0,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.salesPerc - a.salesPerc);
  }, [filteredRecords, customers]);

  // تحميل تدريجي لكروت الموظفين — تجنّب رندر كل المناديب مرة واحدة
  const displayedEmployeeCards = useMemo(
    () => employeeCardsData.slice(0, visibleEmployeeCount),
    [employeeCardsData, visibleEmployeeCount]
  );

  // إعادة ضبط كروت الموظفين عند أي تغيير مهم في الفلاتر
  useEffect(() => {
    setVisibleEmployeeCount(12);
  }, [
    adminTab,
    selectedBranch,
    selectedSupervisor,
    selectedRep,
    searchQuery,
    selectedYear,
    selectedMonth,
    selectedQuarter,
    effectiveSector,
    periodMode,
    filteredRecords.length,
  ]);

  useEffect(() => {
    setVisibleRawRowsCount(25);
  }, [
    adminTab,
    selectedBranch,
    selectedSupervisor,
    selectedRep,
    searchQuery,
    selectedYear,
    selectedMonth,
    selectedQuarter,
    effectiveSector,
    periodMode,
    filteredRecords.length,
  ]);

  const displayedRawRows = useMemo(
    () => filteredRecords.slice(0, visibleRawRowsCount),
    [filteredRecords, visibleRawRowsCount]
  );

  // Helper to get sector label
  const getSectorLabel = (s?: string) => {
    if (!s || s === 'all') return 'الكل';
    if (s === 'home') return 'منزلي';
    if (s === 'electrical') return 'كهربائي';
    if (s === 'both') return 'كلاهما';
    return s;
  };

  const getSectorColor = (s?: string) => {
    if (s === 'home') return 'bg-[#F0FDFA] text-[#0F766E] border-[#99F6E4]';
    if (s === 'electrical') return 'bg-[#EFF6FF] text-[#1E3A8A] border-[#BFDBFE]';
    if (s === 'both') return 'bg-[#F1F5F9] text-[#0F2B38] border-[#CBD5E1]';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <EncouragementProvider>
      <div className="tantawy-screen space-y-4 sm:space-y-6 pb-12">
        {/* Encouragement Toast (يظهر في أسفل الشاشة تلقائياً) */}
        {activeEncouragement && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center justify-center pointer-events-none">
            <div className="bg-white dark:bg-slate-800 border border-[var(--app-line)] dark:border-slate-700 rounded-2xl p-4 shadow-2xl flex items-center gap-3 min-w-[320px] max-w-md animate-in slide-in-from-bottom duration-300 pointer-events-auto">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${activeEncouragement.color}`}>
                <activeEncouragement.icon className="w-5 h-5 shrink-0" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-slate-900 dark:text-white text-sm">{activeEncouragement.title}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{activeEncouragement.message}</div>
              </div>
              <button
                onClick={() => {}}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-50 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Top Header Card */}
        <div className="bg-[var(--app-navy)] text-white rounded-2xl p-4 sm:p-6 shadow-lg border border-[#1E4D63]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#0D9488] text-white flex items-center justify-center font-black shadow-md shrink-0">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {isSalesRep
                      ? 'بطاقة أدائي وتارجت المبيعات والتحصيل'
                      : isSupervisor
                      ? 'بطاقات أداء المناديب - الإشراف والمتابعة'
                      : isBranchManager
                      ? `بطاقات أداء مناديب ${currentUser?.branchName || 'الفرع'}`
                      : 'بطاقات أداء جميع المناديب - الأهداف والتحصيل'}
                  </h1>
                  <span className="bg-[#0D9488] text-white text-[11px] font-black px-2.5 py-0.5 rounded-full">
                    2026
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-soft">
                  <ShieldCheck className="w-4 h-4 text-[#2dd4bf] shrink-0" />
                  {isSalesRep ? (
                    <span className="font-bold text-[#5eead4]">
                      سرية تامة: بطاقتك الشخصية فقط ({currentUser?.name})
                    </span>
                  ) : isSupervisor ? (
                    <span className="font-bold text-[#93c5fd]">
                      سرية الفرع: بطاقات مناديب فريقك فقط في {currentUser?.branchName}
                    </span>
                  ) : isBranchManager ? (
                    <span className="font-bold text-[#cbd5e1]">
                      إدارة الفرع: بطاقات مناديب {currentUser?.branchName} فقط
                    </span>
                  ) : (
                    <span className="font-bold text-[#2dd4bf]">
                      الإدارة والمطور: بطاقات جميع المناديب مع صلاحيات كاملة
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons - EXCLUSIVELY for Admin & Developer */}
            {isAdminOrDev && (
              <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
                {targetsSheetUrl && targetsSheetUrl.trim() && (
                  <button
                    onClick={() => handleSyncGoogleSheet(targetsSheetUrl)}
                    disabled={isSyncingSheet}
                    className="bg-white hover:bg-slate-light disabled:opacity-50 text-[var(--app-navy)] font-black px-3.5 py-2 rounded-[10px] text-xs transition shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 min-h-[44px]"
                    title="مزامنة فورية من شيت Google Sheets المحفوظ"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingSheet ? 'animate-spin' : ''}`} />
                    <span>{isSyncingSheet ? 'جاري المزامنة...' : 'مزامنة Google Sheets'}</span>
                  </button>
                )}

                <button
                  onClick={() => setShowUrlEdit((prev) => !prev)}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold px-3 py-2 rounded-[10px] text-xs transition flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                  title="تعديل أو ربط رابط Google Sheets للأهداف"
                >
                  <ExternalLink className="w-4 h-4 text-[var(--app-accent)]" />
                  <span>{showUrlEdit ? 'إغلاق الرابط' : targetsSheetUrl ? 'تعديل رابط الشيت' : 'ربط Google Sheet'}</span>
                </button>

                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold px-3 py-2 rounded-[10px] text-xs transition flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                  title="خيارات إضافية / رفع ملف إكسل محلي"
                >
                  <Upload className="w-4 h-4 text-slate-300" />
                  <span>خيارات إضافية</span>
                </button>

                <button
                  onClick={exportTargetsReport}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold px-3 py-2 rounded-[10px] text-xs transition flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                  title="تصدير الأهداف والتقارير إلى إكسل"
                >
                  <Download className="w-4 h-4 text-[var(--app-ok)]" />
                  <span>تصدير Excel</span>
                </button>

                {visibleRecords.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm('هل تريد مسح بيانات الشيت بالكامل لإعادة المزامنة؟')) {
                        resetTargetsToDefault();
                      }
                    }}
                    className="bg-white/10 hover:bg-white/20 text-white/70 hover:text-red-soft border border-white/20 hover:border-[rgba(179,74,74,.45)] p-2 rounded-[10px] transition cursor-pointer min-h-[44px] min-w-[44px]"
                    title="مسح بيانات الشيت"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Collapsible Quick Google Sheet URL Bar */}
          {isAdminOrDev && showUrlEdit && (
            <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="url"
                value={targetsSheetUrl}
                onChange={(e) => {
                  setTargetsSheetUrl(e.target.value);
                  setSyncNotice(null);
                }}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                className="flex-1 bg-slate-deep4 border border-white/15 rounded-[10px] px-3.5 py-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
                dir="ltr"
              />
              <button
                onClick={() => handleSyncGoogleSheet(targetsSheetUrl)}
                disabled={isSyncingSheet || !targetsSheetUrl.trim()}
                className="bg-white hover:bg-slate-light disabled:opacity-50 text-[var(--app-navy)] font-black px-4 py-2 rounded-[10px] text-xs transition shadow-md flex items-center justify-center gap-1.5 shrink-0 cursor-pointer min-h-[44px]"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>حفظ ومزامنة الآن</span>
              </button>
            </div>
          )}
        </div>

        {/* ============ لوحة الأداء الإجمالية — حلقات التارجت ============ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <RingGauge percent={kpis.salesPercentage} color="#1E3A8A" label="مبيعات" size={92} stroke={10} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-500">إجمالي التارجت — الشهر الحالي</p>
              <p className="mt-0.5 truncate text-lg font-black tabular-nums text-[#0F2B38]">{formatEGP(kpis.totalSalesAchieved)}</p>
              <p className="text-[10px] font-bold text-slate-400">من {formatEGP(kpis.totalSalesTarget)} ج.م مستهدف</p>
              <p className="mt-0.5 text-[10px] font-black text-emerald-600">المتبقي: {formatEGP(kpis.remainingSales)}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <RingGauge percent={kpis.collectionPercentage} color="#0D9488" label="تحصيل" size={92} stroke={10} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-500">إجمالي التحصيل — الشهر الحالي</p>
              <p className="mt-0.5 truncate text-lg font-black tabular-nums text-[#0F2B38]">{formatEGP(kpis.totalCollectionAchieved)}</p>
              <p className="text-[10px] font-bold text-slate-400">من {formatEGP(kpis.totalCollectionTarget)} ج.م مستهدف</p>
              <p className="mt-0.5 text-[10px] font-black text-emerald-600">المتبقي: {formatEGP(kpis.remainingCollection)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-[var(--app-navy)] p-4 text-white shadow-sm sm:p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0D9488] shadow-md">
              <Award className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-[#a9c8e4]">عدد المناديب المطابقة</p>
              <p className="mt-0.5 text-2xl font-black tabular-nums leading-none">{kpis.count}</p>
              <p className="mt-1 text-[10px] font-bold text-[#7fc0ff]">تم احتساب الأرقام أعلاه من تارجتهم معاً</p>
            </div>
          </div>
        </div>

        {/* Synchronizing / Feedback Toast */}
        {syncNotice && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 shadow-xs ${
              syncNotice.type === 'success'
                ? 'bg-[rgba(46,125,91,.10)] text-[var(--app-ok)] border border-[rgba(46,125,91,.28)]'
                : 'bg-[rgba(179,74,74,.10)] text-[var(--app-risk)] border border-[rgba(179,74,74,.28)]'
            }`}
          >
            <div className="flex items-center gap-2">
              {syncNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-[var(--app-ok)] shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[var(--app-risk)] shrink-0" />
              )}
              <span>{syncNotice.message}</span>
            </div>
            <button
              onClick={() => setSyncNotice(null)}
              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* EMPTY STATE (No data synced yet) */}
        {visibleRecords.length === 0 ? (
          <div className="bg-white rounded-[14px] p-6 sm:p-10 border border-[var(--app-line)] text-center shadow-xs max-w-2xl mx-auto space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-[rgba(201,154,67,.15)] text-warn flex items-center justify-center mx-auto">
              <Target className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-black text-[var(--app-navy)]">
                {isAdminOrDev
                  ? 'ربط ومزامنة شيت أهداف وتارجت المناديب (Google Sheets)'
                  : `أهلاً بك يا ${currentUser?.name || ''}`}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
                {isAdminOrDev
                  ? 'أدخل رابط Google Sheet الخاص بالأهداف. سيتم حفظ الرابط تلقائياً داخل النظام بحيث لا تضطر لإعادة إدخاله مرة أخرى، وتتم المزامنة بضغطة زر واحدة.'
                  : 'لم يتم مزامنة بيانات الأهداف والتارجت لهذا الشهر حتى الآن من قِبل الإدارة. ستظهر هنا بطاقات أدائك والرسوم البيانية فور مزامنة الشيت المعتمد.'}
              </p>
            </div>

            {isAdminOrDev && (
              <div className="space-y-3 pt-2 text-right">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="url"
                    value={targetsSheetUrl}
                    onChange={(e) => {
                      setTargetsSheetUrl(e.target.value);
                      setSyncNotice(null);
                    }}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    className="flex-1 bg-white border border-[var(--app-line)] rounded-[10px] px-4 py-3 text-xs sm:text-sm text-[var(--app-navy)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
                    dir="ltr"
                  />
                  <button
                    onClick={() => handleSyncGoogleSheet(targetsSheetUrl)}
                    disabled={isSyncingSheet || !targetsSheetUrl.trim()}
                    className="btn-primary font-black px-5 py-3 text-xs sm:text-sm transition flex items-center justify-center gap-2 shrink-0 cursor-pointer min-h-[44px]"
                  >
                    {isSyncingSheet ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري المزامنة...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>حفظ ومزامنة الأهداف</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold px-1">
                  <span className="text-[var(--app-ok)] bg-[rgba(46,125,91,.10)] border border-[rgba(46,125,91,.25)] px-2.5 py-1 rounded-lg">
                    الرابط يُحفظ تلقائياً في المتصفح ولن تضطر لإعادة إدخاله كل مرة
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(true)}
                    className="app-link"
                  >
                    أو خيارات إضافية / رفع ملف إكسل محلي (.xlsx)
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 🏠⚡ فلتر قطاع التارجت (منزلي / كهربائي) + فلاتر سريعة */}
            <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs space-y-3">
              {/* Sector Filter */}
              {canSwitchSector && (
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                  {([
                    { key: 'all', label: 'كل القطاعات', count: sectorCounts.all },
                    { key: 'home', label: '🏠 منزلي', count: sectorCounts.home },
                    { key: 'electrical', label: '⚡ كهربائي', count: sectorCounts.electrical },
                  ] as const).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveSectorFilter(t.key)}
                      className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-black whitespace-nowrap transition cursor-pointer ${
                        activeSectorFilter === t.key
                          ? 'bg-[var(--app-navy)] text-white shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)]'
                          : 'text-gray hover:text-[var(--app-navy)]'
                      }`}
                    >
                      {t.label} <span className="opacity-70">({t.count})</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Period Mode & Role Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray">طريقة العرض:</span>
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => {
                        setPeriodMode('monthly');
                        setSelectedQuarter('ALL');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                        periodMode === 'monthly'
                          ? 'bg-[var(--app-navy)] text-white shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)]'
                          : 'text-gray hover:text-[var(--app-navy)]'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>شهرياً</span>
                    </button>
                    <button
                      onClick={() => {
                        setPeriodMode('quarterly');
                        setSelectedMonth('ALL');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                        periodMode === 'quarterly'
                          ? 'bg-[var(--app-navy)] text-white shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)]'
                          : 'text-gray hover:text-[var(--app-navy)]'
                      }`}
                    >
                      <PieChart className="w-3.5 h-3.5" />
                      <span>كوارتر</span>
                    </button>
                  </div>
                </div>

                {isSupervisor && (
                  <div className="flex items-center gap-1 bg-[rgba(16,43,78,.06)] border border-[rgba(16,43,78,.18)] p-1 rounded-xl">
                    <button
                      onClick={() => {
                        setSupervisorViewMode('my_personal');
                        setSelectedRep('ALL');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                        supervisorViewMode === 'my_personal'
                          ? 'bg-[var(--app-navy)] text-white shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)]'
                          : 'text-gray hover:text-[var(--app-navy)]'
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>أرقامي</span>
                    </button>
                    <button
                      onClick={() => setSupervisorViewMode('my_team')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                        supervisorViewMode === 'my_team'
                          ? 'bg-[var(--app-navy)] text-white shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)]'
                          : 'text-gray hover:text-[var(--app-navy)]'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>فريقي</span>
                    </button>
                  </div>
                )}

                {isAdminOrDev && (
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setAdminTab('overview')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                        adminTab === 'overview' ? 'bg-[var(--app-navy)] text-white shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)]' : 'text-gray hover:text-[var(--app-navy)]'
                      }`}
                    >
                      بطاقات الموظفين
                    </button>
                    <button
                      onClick={() => setAdminTab('quarters')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                        adminTab === 'quarters' ? 'bg-[var(--app-navy)] text-white shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)]' : 'text-gray hover:text-[var(--app-navy)]'
                      }`}
                    >
                      مقارنة الكوارترات
                    </button>
                    <button
                      onClick={() => setAdminTab('table')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                        adminTab === 'table' ? 'bg-[var(--app-navy)] text-white shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)]' : 'text-gray hover:text-[var(--app-navy)]'
                      }`}
                    >
                      جدول البيانات
                    </button>
                  </div>
                )}
              </div>

              {/* Month/Quarter Pills */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                {periodMode === 'monthly' ? (
                  <div className="flex flex-wrap items-center gap-1 overflow-x-auto no-scrollbar">
                    <span className="text-xs font-bold text-slate-500 ml-1">الشهر:</span>
                    <button
                      onClick={() => setSelectedMonth('ALL')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer pill-filter min-h-[36px] ${
                        selectedMonth === 'ALL' ? 'on font-black' : ''
                      }`}
                    >
                      كل الشهور
                    </button>
                    {ARABIC_MONTHS.map((mName, idx) => (
                      <button
                        key={idx + 1}
                        onClick={() => setSelectedMonth(idx + 1)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer pill-filter min-h-[36px] ${
                          selectedMonth === idx + 1 ? 'on font-black' : ''
                        }`}
                      >
                        {mName}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-500 ml-1">الكوارتر:</span>
                    <button
                      onClick={() => setSelectedQuarter('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs transition cursor-pointer pill-filter min-h-[36px] ${
                        selectedQuarter === 'ALL' ? 'on font-black' : ''
                      }`}
                    >
                      كل الكوارترات
                    </button>
                    {(['Q1', 'Q2', 'Q3', 'Q4'] as TargetQuarter[]).map((q) => (
                      <button
                        key={q}
                        onClick={() => setSelectedQuarter(q)}
                        className={`px-3 py-1.5 rounded-lg text-xs transition cursor-pointer pill-filter min-h-[36px] ${
                          selectedQuarter === q ? 'on font-black' : ''
                        }`}
                        title={QUARTER_LABELS[q].months}
                      >
                        <span>{q}</span>
                        <span className="text-[10px] text-slate-500 mr-1 hidden sm:inline">
                          ({QUARTER_LABELS[q].months})
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {isAdminOrDev && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-white border border-[var(--app-line)] rounded-xl px-2.5 py-1 text-xs font-bold text-gray">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      <span>الفرع:</span>
                      <select
                        value={selectedBranch}
                        onChange={(e) => handleBranchChange(e.target.value)}
                        className="bg-transparent font-black text-slate-900 outline-none cursor-pointer text-xs max-w-[130px]"
                      >
                        <option value="ALL">كل الفروع</option>
                        {availableBranches.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 bg-white border border-[var(--app-line)] rounded-xl px-2.5 py-1 text-xs font-bold text-gray">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>المشرف:</span>
                      <select
                        value={selectedSupervisor}
                        onChange={(e) => handleSupervisorChange(e.target.value)}
                        className="bg-transparent font-black text-slate-900 outline-none cursor-pointer text-xs max-w-[130px]"
                      >
                        <option value="ALL">كل المشرفين</option>
                        {branchSupervisors.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 bg-white border border-[var(--app-line)] rounded-xl px-2.5 py-1 text-xs font-bold text-gray">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>المندوب:</span>
                      <select
                        value={selectedRep}
                        onChange={(e) => setSelectedRep(e.target.value)}
                        className="bg-transparent font-black text-slate-900 outline-none cursor-pointer text-xs max-w-[140px]"
                      >
                        <option value="ALL">
                          {selectedBranch !== 'ALL'
                            ? `كل مناديب ${selectedBranch}`
                            : 'جميع المناديب'}
                        </option>
                        {branchAndSupervisorReps.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ============================================================
               EMPLOYEE CARDS SECTION (كروت الموظفين)
               ============================================================ */}
            {adminTab !== 'quarters' && adminTab !== 'table' ? (
              <section className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base sm:text-lg font-black text-[var(--app-navy)] flex items-center gap-2">
                    <Users className="w-4 h-4 text-[var(--app-accent)]" />
                    <span>بطاقات أداء المناديب ({employeeCardsData.length} موظف)</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    <EncouragementBadge type="general" />
                    <EncouragementBadge type="target" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {employeeCardsData.length === 0 ? (
                    <div className="col-span-full text-center py-16">
                      <Users className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
                        لا يوجد موظفين مطابقة للفلاتر المحددة
                      </p>
                    </div>
                  ) : (
                    displayedEmployeeCards.map((emp) => {
                      const salesPerc = emp.salesTarget > 0 ? Number(((emp.salesAchieved / emp.salesTarget) * 100).toFixed(1)) : 0;
                      const colPerc = emp.colTarget > 0 ? Number(((emp.colAchieved / emp.colTarget) * 100).toFixed(1)) : 0;
                      const remainingSales = Math.max(0, emp.salesTarget - emp.salesAchieved);
                      const remainingCol = Math.max(0, emp.colTarget - emp.colAchieved);
                      const totalDebt = emp.totalDebt + emp.overdueDebt;

                      return (
                        <div key={emp.repName} className="bg-white dark:bg-slate-800 rounded-3xl p-4 sm:p-5 border border-[var(--app-line)] dark:border-slate-700 shadow-sm overflow-hidden relative group">
                          {/* Top: Employee Name + Sector + Role */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 rounded-xl bg-[var(--app-navy)] text-white flex items-center justify-center font-black shadow-sm">
                                {emp.repName.charAt(0)}
                              </div>
                              <div>
                                <div className="font-black text-slate-900 dark:text-white text-sm">{emp.repName}</div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {emp.branch || '—'} • {getSectorLabel(emp.sector)}
                                </div>
                              </div>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${salesPerc >= 100 ? 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border-[var(--app-ok-line)]' : salesPerc >= 70 ? 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border-[var(--app-warn-line)]' : 'bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] border-[var(--app-risk-line)]'}`}>
                              {salesPerc}%
                            </span>
                          </div>

                          {/* Sector Badge */}
                          <div className="mb-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${getSectorColor(emp.sector)} whitespace-nowrap`}>
                              {getSectorLabel(emp.sector)}
                            </span>
                          </div>

                          {/* Metrics Grid */}
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {/* Sales Target */}
                            <div className="bg-[rgba(16,43,78,.06)] rounded-xl p-2 border border-[rgba(16,43,78,.15)]">
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">هدف البيع</div>
                              <div className="text-xs font-black text-[var(--app-navy)] tabular-nums">{formatEGP(emp.salesTarget)}</div>
                            </div>
                            {/* Sales Achieved */}
                            <div className="bg-[rgba(46,125,91,.08)] rounded-xl p-2 border border-[rgba(46,125,91,.25)]">
                              <div className="text-[10px] text-[var(--app-ok-text)] font-bold mb-0.5">المحقق بيع</div>
                              <div className="text-xs font-black text-[var(--app-ok)] tabular-nums">{formatEGP(emp.salesAchieved)}</div>
                            </div>
                            {/* Collection Target */}
                            <div className="bg-[rgba(16,43,78,.06)] rounded-xl p-2 border border-[rgba(16,43,78,.15)]">
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">هدف التحصيل</div>
                              <div className="text-xs font-black text-[var(--app-navy)] tabular-nums">{formatEGP(emp.colTarget)}</div>
                            </div>
                            {/* Collection Achieved */}
                            <div className="bg-[rgba(16,43,78,.06)] rounded-xl p-2 border border-[rgba(16,43,78,.15)]">
                              <div className="text-[10px] text-[var(--app-navy-text)] font-bold mb-0.5">المحقق تحصيل</div>
                              <div className="text-xs font-black text-[var(--app-navy-text)] tabular-nums">{formatEGP(emp.colAchieved)}</div>
                            </div>
                          </div>

                          {/* Progress Bars */}
                          <div className="space-y-2 mb-3">
                            <div>
                              <div className="flex justify-between text-[10px] font-bold mb-0.5">
                                <span className="text-slate-500">إنجاز البيع</span>
                                <span className="font-black">{salesPerc}%</span>
                              </div>
                              <div className="w-full bg-[rgba(16,43,78,.10)] h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ${
                                    salesPerc >= 100 ? 'bg-[var(--app-ok)]' : salesPerc >= 75 ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-risk)]'
                                  }`}
                                  style={{ width: `${Math.min(100, salesPerc)}%` }}
                                />
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-[10px] font-bold mb-0.5">
                                <span className="text-slate-500">إنجاز التحصيل</span>
                                <span className="font-black">{colPerc}%</span>
                              </div>
                              <div className="w-full bg-[rgba(16,43,78,.10)] h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ${
                                    colPerc >= 100 ? 'bg-[var(--app-ok)]' : colPerc >= 75 ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-risk)]'
                                  }`}
                                  style={{ width: `${Math.min(100, colPerc)}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Customer & Debt Info */}
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="bg-slate-50 dark:bg-slate-900/30 rounded-xl p-2 border border-slate-100 dark:border-slate-600">
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">العملاء</div>
                              <div className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{emp.customerCount}</div>
                              <div className="text-[9px] text-slate-400 mt-0.5">منهم نشط: {emp.activeCustomers}</div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/30 rounded-xl p-2 border border-slate-100 dark:border-slate-600">
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-0.5">المديونية الإجمالية</div>
                              <div className={`text-xs font-black ${totalDebt > 0 ? 'text-[var(--app-risk)]' : 'text-[var(--app-ok)]'} tabular-nums`}>
                                {formatEGP(totalDebt)}
                              </div>
                            </div>
                          </div>

                          {/* Remaining Amounts */}
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-2">
                              <div className="text-[10px] text-amber-800 font-bold mb-0.5">المتبقي بيع</div>
                              <div className="text-xs font-black text-amber-700 tabular-nums">{formatEGP(remainingSales)}</div>
                            </div>
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-2">
                              <div className="text-[10px] text-amber-800 font-bold mb-0.5">المتبقي تحصيل</div>
                              <div className="text-xs font-black text-amber-700 tabular-nums">{formatEGP(remainingCol)}</div>
                            </div>
                          </div>

                          {/* Quick Action Buttons */}
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <button
                              onClick={() => showEncouragement('visit')}
                              className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl px-2 py-1.5 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                              title="تسجيل زيارة"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              <span>زيارة</span>
                            </button>
                            <button
                              onClick={() => showEncouragement('collection')}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl px-2 py-1.5 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                              title="تسجيل تحصيل"
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              <span>تحصيل</span>
                            </button>
                            <button
                              onClick={() => showEncouragement('order')}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl px-2 py-1.5 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                              title="طلبية جديدة"
                            >
                              <ClipboardList className="w-3.5 h-3.5" />
                              <span>طلبية</span>
                            </button>
                          </div>

                          {/* Encouragement Message */}
                          <div className="mt-3 p-2.5 rounded-xl bg-[var(--app-accent-tint)] border border-[var(--app-accent-line)] text-[11px] font-bold text-[var(--app-accent-text)] text-center">
                            {salesPerc >= 100 && colPerc >= 100
                              ? '🏀 ممتاز! حققت التارجت بالكامل بيعاً وتحصيلاً'
                              : salesPerc >= 100
                              ? '✅ تم تحقيق هدف البيع،ركز على التحصيل الآن'
                              : colPerc >= 100
                              ? '✅ تم تحقيق هدف التحصيل،ركز على المبيعات الآن'
                              : salesPerc >= 70 || colPerc >= 70
                              ? '📈 أداء جيد، أنت قريبة من تحقيق الهدف، استمروا!'
                              : '💪 هناك مجال للتحسين، ركز على زيادة الزيارات والمبيعات'}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {visibleEmployeeCount < employeeCardsData.length && (
                  <div className="flex flex-col items-center gap-2 mt-4">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      عرض {displayedEmployeeCards.length} من {employeeCardsData.length} موظف
                    </span>
                    <button
                      type="button"
                      onClick={() => setVisibleEmployeeCount((c) => c + 12)}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black cursor-pointer shadow-sm"
                    >
                      عرض المزيد ({employeeCardsData.length - displayedEmployeeCards.length} متبقي)
                    </button>
                  </div>
                )}

                {/* Summary Encouragement */}
                <div className="bg-[var(--app-navy)] rounded-2xl p-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-black text-sm">مجموع الأداء للبطاقات المعروضة</div>
                      <div className="text-2xl font-black tabular-nums mt-1">
                        {formatEGP(kpis.totalSalesAchieved)} مبيعات محققة من {formatEGP(kpis.totalSalesTarget)} مستهدف
                      </div>
                    </div>
                    <button
                      onClick={() => showEncouragement('general')}
                      className="bg-[#0D9488] text-white font-black px-4 py-2 rounded-xl text-xs transition hover:bg-[#0F766E] active:scale-95"
                    >
                      <Flame className="w-4 h-4" />
                      <span>رسالة تشجيعية للجميع</span>
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {/* ADMIN ONLY TAB 2: Quarters Comparison Grid */}
            {isAdminOrDev && adminTab === 'quarters' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {(['Q1', 'Q2', 'Q3', 'Q4'] as TargetQuarter[]).map((q) => {
                  const qInfo = QUARTER_LABELS[q];
                  const qRecords = filteredRecords.filter((r) => r.quarter === q);
                  let qSalesTarget = 0;
                  let qSalesAchieved = 0;
                  let qColTarget = 0;
                  let qColAchieved = 0;

                  qRecords.forEach((r) => {
                    qSalesTarget += r.salesTarget || 0;
                    qSalesAchieved += r.salesAchieved || 0;
                    qColTarget += r.collectionTarget || 0;
                    qColAchieved += r.collectionAchieved || 0;
                  });

                  const qSalesPerc = qSalesTarget > 0 ? Number(((qSalesAchieved / qSalesTarget) * 100).toFixed(1)) : 0;
                  const qColPerc = qColTarget > 0 ? Number(((qColAchieved / qColTarget) * 100).toFixed(1)) : 0;

                  return (
                    <div key={q} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-900 text-sm">{qInfo.label}</span>
                        <span className="text-xs font-bold text-slate-400">{qRecords.length} سجل</span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-bold">{qInfo.months}</p>

                      {/* Sales in Quarter */}
                      <div className="bg-slate-50 p-3 rounded-xl space-y-1 text-xs">
                        <div className="flex justify-between font-bold text-slate-600">
                          <span>المحقق بيع:</span>
                          <span className="font-bold text-[var(--app-ok-text)]">{formatEGP(qSalesAchieved)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>هدف البيع:</span>
                          <span>{formatEGP(qSalesTarget)}</span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                          <div className="bg-[var(--app-ok)] h-full" style={{ width: `${Math.min(100, qSalesPerc)}%` }} />
                        </div>
                        <div className="text-left text-[10px] font-bold text-[var(--app-ok-text)]">{qSalesPerc}%</div>
                      </div>

                      {/* Collection in Quarter */}
                      <div className="bg-[var(--app-navy-tint)] p-3 rounded-xl space-y-1 text-xs">
                        <div className="flex justify-between font-bold text-slate-600">
                          <span>المحقق تحصيل:</span>
                          <span className="font-bold text-[var(--app-navy-text)]">{formatEGP(qColAchieved)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>هدف التحصيل:</span>
                          <span>{formatEGP(qColTarget)}</span>
                        </div>
                        <div className="w-full bg-[var(--app-navy-tint)] h-1.5 rounded-full overflow-hidden mt-1">
                          <div className="bg-[var(--app-navy)] h-full" style={{ width: `${Math.min(100, qColPerc)}%` }} />
                        </div>
                        <div className="text-left text-[10px] font-bold text-[var(--app-navy-text)]">{qColPerc}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ADMIN ONLY TAB 3: Raw Excel Table View */}
            {isAdminOrDev && adminTab === 'table' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
                  <div className="font-black text-sm text-slate-900 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-[var(--app-ok-text)]" />
                    <span>بيانات شيت الأهداف الميداني المرفوع ({filteredRecords.length} صف)</span>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="بحث باسم الفرع أو المندوب..."
                      className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[var(--app-warn)]"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-black sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="p-3">الفرع</th>
                        <th className="p-3">المندوب</th>
                        <th className="p-3">الشهر / الكوارتر</th>
                        <th className="p-3 text-left">هدف البيع</th>
                        <th className="p-3 text-left">المحقق بيع</th>
                        <th className="p-3 text-center">نسبة البيع</th>
                        <th className="p-3 text-left">المتبقي بيع</th>
                        <th className="p-3 text-left">هدف التحصيل</th>
                        <th className="p-3 text-left">المحقق تحصيل</th>
                        <th className="p-3 text-center">نسبة التحصيل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {displayedRawRows.map((r, idx) => (
                        <tr key={r.id || idx} className="hover:bg-[var(--app-warn-tint)] transition">
                          <td className="p-3 font-bold text-slate-900">{r.branch}</td>
                          <td className="p-3 font-black text-[var(--app-ink)]">{r.repName}</td>
                          <td className="p-3">
                            <span className="font-bold">{ARABIC_MONTHS[r.month - 1]}</span>{' '}
                            <span className="text-[11px] text-slate-400">({r.quarter})</span>
                          </td>
                          <td className="p-3 text-left font-bold">{formatEGP(r.salesTarget)}</td>
                          <td className="p-3 text-left font-black text-[var(--app-ok-text)]">{formatEGP(r.salesAchieved)}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${getBadgeColor(r.salesPercentage)}`}>
                              {r.salesPercentage}%
                            </span>
                          </td>
                          <td className="p-3 text-left font-bold text-[var(--app-warn-text)]">{formatEGP(r.remainingSales)}</td>
                          <td className="p-3 text-left font-bold">{formatEGP(r.collectionTarget)}</td>
                          <td className="p-3 text-left font-black text-[var(--app-navy-text)]">{formatEGP(Math.abs(Number(r.collectionAchieved) || 0))}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${getBadgeColor(r.collectionPercentage)}`}>
                              {r.collectionPercentage}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visibleRawRowsCount < filteredRecords.length && (
                    <div className="flex flex-col items-center gap-2 p-4 border-t border-slate-200 bg-slate-50">
                      <span className="text-xs font-bold text-slate-500">
                        عرض {displayedRawRows.length} من {filteredRecords.length} صف
                      </span>
                      <button
                        type="button"
                        onClick={() => setVisibleRawRowsCount((c) => c + 25)}
                        className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black cursor-pointer shadow-sm"
                      >
                        عرض المزيد ({filteredRecords.length - displayedRawRows.length} متبقي)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* EXCEL UPLOAD MODAL (Exclusively for Admin & Developer) */}
        {isUploadModalOpen && isAdminOrDev && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-150">
              <button
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadFeedback(null);
                }}
                className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#0D9488] text-white flex items-center justify-center font-black">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    رفع شيت أهداف المبيعات والتحصيل اليومي
                  </h3>
                  <p className="text-xs text-slate-500 font-bold">
                    يدعم ملفات Excel (.xlsx, .xls) وCSV
                  </p>
                </div>
              </div>

              {/* Instruction Callout */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 text-xs text-slate-600 leading-relaxed space-y-1.5">
                <p className="font-black text-slate-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[var(--app-ok-text)]" />
                  <span>أعمدة الشيت المطلوبة:</span>
                </p>
                <div className="grid grid-cols-2 gap-1 text-[11px] font-bold text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200">
                  <span>1. الفرع</span>
                  <span>2. المندوب</span>
                  <span>3. هدف البيع</span>
                  <span>4. المحقق بيع</span>
                  <span>5. نسبه البيع</span>
                  <span>6. هدف التحصيل</span>
                  <span>7. المحقق تحصيل</span>
                  <span>8. نسبه تحصيل</span>
                  <span className="col-span-2">9. تاريخ (أو اسم الشهر / التاريخ اليومي)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  * يتم حساب المتبقي بيع وتحصيل وتحديد الكوارتر (Q1-Q4) تلقائياً.
                </p>
              </div>

              {/* Upload Feedback */}
              {uploadFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold mb-4 flex items-center gap-2 ${
                    uploadFeedback.type === 'success'
                      ? 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border border-[var(--app-ok-line)]'
                      : 'bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] border border-[var(--app-risk-line)]'
                  }`}
                >
                  {uploadFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-[var(--app-ok-text)] shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-[var(--app-risk-text)] shrink-0" />
                  )}
                  <span>{uploadFeedback.message}</span>
                </div>
              )}

              {/* File Dropzone / Selector */}
              <label className="border-2 border-dashed border-slate-300 hover:border-[var(--app-warn)] bg-slate-50 hover:bg-[var(--app-warn-tint)] rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-2 cursor-pointer transition">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
                <FileSpreadsheet className="w-10 h-10 text-slate-400 group-hover:text-[var(--app-accent)]" />
                <div className="text-xs font-bold text-slate-700">
                  {isUploading ? (
                    <span className="text-[var(--app-warn-text)] font-black animate-pulse">
                      جاري قراءة واستيراد الشيت...
                    </span>
                  ) : (
                    <>
                      <span className="text-[var(--app-warn-text)] font-black">اضغط لاختيار ملف الإكسل</span> أو اسحب الملف هنا
                    </>
                  )}
                </div>
                <span className="text-[10px] text-slate-400">ملفات Excel (.xlsx, .xls)</span>
              </label>

              {/* Template Download Prompt */}
              <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                <span className="text-slate-500 font-bold">هل تحتاج قالباً منسقاً؟</span>
                <button
                  onClick={downloadTargetTemplateExcel}
                  className="text-[var(--app-warn-text)] hover:text-[var(--app-warn-text)] font-black flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تحميل قالب إكسل فارغ</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </EncouragementProvider>
  );
};
