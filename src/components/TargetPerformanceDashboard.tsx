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
  Zap
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
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

// Helper to normalize and match branch names with tolerance for prefixes
const isBranchMatch = (b1?: string | null, b2?: string | null): boolean => {
  if (!b1 || !b2) return false;
  const n1 = normalizeArabicText(b1).replace(/^(فرع|مخزن)\s*/, '');
  const n2 = normalizeArabicText(b2).replace(/^(فرع|مخزن)\s*/, '');
  return n1.includes(n2) || n2.includes(n1);
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

  const isSalesRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isBranchManager = currentUser?.role === 'branch_manager';
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  // Role-specific view state
  // For supervisor: toggle between viewing his own personal targets vs team reps
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
    // From users
    users
      .filter((u) => u.role === 'supervisor' && (!effectiveBranch || isBranchMatch(u.branchName, effectiveBranch)))
      .forEach((u) => set.add(u.name));

    // From customers directory
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

    // Also include supervisor's own name in case they have a personal target
    set.add(selectedSupervisor);
    return set;
  }, [selectedSupervisor, users, customers]);

  // Distinct reps available for the current branch & supervisor filters
  const branchAndSupervisorReps = useMemo(() => {
    // 1. If supervisor is logged in, show his supervised team
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
        if (isArabicNameMatch(r.repName, currentUser.name)) return; // exclude self from reps list
        const norm = normalizeArabicText(r.repName);
        if (directNames.size === 0 || Array.from(directNames).some((dn) => isArabicNameMatch(r.repName, dn) || norm.includes(dn))) {
          set.add(r.repName);
        }
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
    }

    // 2. If a supervisor is selected (by Branch Manager or Admin):
    if (selectedSupervisor !== 'ALL' && repsUnderSelectedSupervisor) {
      return Array.from(repsUnderSelectedSupervisor)
        .filter((r) => r !== selectedSupervisor)
        .sort((a, b) => a.localeCompare(b, 'ar'));
    }

    // 3. Filter reps by the selected branch!
    const set = new Set<string>();
    visibleRecords.forEach((r) => {
      if (!effectiveBranch || isBranchMatch(r.branch, effectiveBranch)) {
        if (r.repName) set.add(r.repName);
      }
    });

    // Also check users
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
      // 1. Supervisor personal vs team mode
      if (isSupervisor && currentUser) {
        const isSelf = isArabicNameMatch(r.repName, currentUser.name) ||
          normalizeArabicText(r.repName) === normalizeArabicText(currentUser.name);

        if (supervisorViewMode === 'my_personal') {
          if (!isSelf) return false;
        } else {
          // In team mode, exclude supervisor himself if viewing team
          if (isSelf && supervisedReps.length > 0) return false;
        }
      }

      // 2. Period filter
      if (selectedYear !== 'ALL' && r.year !== selectedYear) return false;

      if (periodMode === 'monthly') {
        if (selectedMonth !== 'ALL' && r.month !== selectedMonth) return false;
      } else {
        if (selectedQuarter !== 'ALL' && r.quarter !== selectedQuarter) return false;
      }

      // 3. Branch filter (Admin/Dev)
      if (isAdminOrDev && selectedBranch !== 'ALL' && !isBranchMatch(r.branch, selectedBranch)) {
        return false;
      }

      // 4. Supervisor filter (Branch Manager or Admin)
      if ((isBranchManager || isAdminOrDev) && selectedSupervisor !== 'ALL' && repsUnderSelectedSupervisor) {
        const normRep = normalizeArabicText(r.repName);
        const matches = Array.from(repsUnderSelectedSupervisor).some(
          (sRep) => isArabicNameMatch(r.repName, sRep) || normRep === normalizeArabicText(sRep)
        );
        if (!matches) return false;
      }

      // 5. Rep filter
      if (!isSalesRep && selectedRep !== 'ALL') {
        if (!isArabicNameMatch(r.repName, selectedRep) && normalizeArabicText(r.repName) !== normalizeArabicText(selectedRep)) {
          return false;
        }
      }

      // 6. Search query (Admin only)
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
      // 1. Supervisor personal vs team mode
      if (isSupervisor && currentUser) {
        const isSelf = isArabicNameMatch(r.repName, currentUser.name) ||
          normalizeArabicText(r.repName) === normalizeArabicText(currentUser.name);

        if (supervisorViewMode === 'my_personal') {
          if (!isSelf) return false;
        } else {
          if (isSelf && supervisedReps.length > 0) return false;
        }
      }

      // 2. Year filter
      if (selectedYear !== 'ALL' && r.year !== selectedYear) return false;

      // 3. Quarter filter (if in quarterly mode)
      if (periodMode === 'quarterly' && selectedQuarter !== 'ALL' && r.quarter !== selectedQuarter) {
        return false;
      }

      // 4. Branch filter
      if (isAdminOrDev && selectedBranch !== 'ALL' && !isBranchMatch(r.branch, selectedBranch)) {
        return false;
      }

      // 5. Supervisor filter
      if ((isBranchManager || isAdminOrDev) && selectedSupervisor !== 'ALL' && repsUnderSelectedSupervisor) {
        const normRep = normalizeArabicText(r.repName);
        const matches = Array.from(repsUnderSelectedSupervisor).some(
          (sRep) => isArabicNameMatch(r.repName, sRep) || normRep === normalizeArabicText(sRep)
        );
        if (!matches) return false;
      }

      // 6. Rep filter
      if (!isSalesRep && selectedRep !== 'ALL') {
        if (!isArabicNameMatch(r.repName, selectedRep) && normalizeArabicText(r.repName) !== normalizeArabicText(selectedRep)) {
          return false;
        }
      }

      // 7. Search query
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
    // Milestones gaps for sales
    salesGap60: number;
    salesGap70: number;
    salesGap90: number;
    salesGap100: number;
    // Milestones gaps for collection
    colGap60: number;
    colGap70: number;
    colGap90: number;
    colGap100: number;
    // Power BI Milestone status
    highestMilestone: '100%+' | '90%+' | '70%+' | '60%+' | 'below_60' | 'none';
  }

  // Filtered customers matching the same branch/supervisor/rep filters as baseRecordsForMonths
  const filteredCustomersForMonths = useMemo(() => {
    return customers.filter((c) => {
      const repName = c.salesRepName || c.repName || '';

      // 1. Supervisor personal vs team mode
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

      // 2. Sales rep: only own customers
      if (isSalesRep && currentUser) {
        if (!isArabicNameMatch(repName, currentUser.name) && normalizeArabicText(repName) !== normalizeArabicText(currentUser.name)) {
          return false;
        }
      }

      // 3. Branch filter
      if (isBranchManager && currentUser) {
        if (!isBranchMatch(c.branchName, currentUser.branchName)) return false;
      }
      if (isAdminOrDev && selectedBranch !== 'ALL' && !isBranchMatch(c.branchName, selectedBranch)) return false;

      // 4. Supervisor filter (Branch Manager or Admin)
      if ((isBranchManager || isAdminOrDev) && selectedSupervisor !== 'ALL' && repsUnderSelectedSupervisor) {
        const normRep = normalizeArabicText(repName);
        const matches = Array.from(repsUnderSelectedSupervisor).some(
          (sRep) => isArabicNameMatch(repName, sRep) || normRep === normalizeArabicText(sRep)
        );
        if (!matches) return false;
      }

      // 5. Rep filter
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

  return (
    <div className="tantawy-screen space-y-4 sm:space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-[var(--app-navy)] text-white rounded-2xl p-4 sm:p-6 shadow-lg border border-deep3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--app-accent)] text-deep-navy flex items-center justify-center font-black shadow-md shrink-0">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {isSalesRep
                    ? 'هدفي وتارجت المبيعات والتحصيل'
                    : isSupervisor
                    ? 'أهداف ومحققات المبيعات والتحصيل (المشرف)'
                    : isBranchManager
                    ? `أهداف وتارجت ${currentUser?.branchName || 'الفرع'}`
                    : 'لوحة أهداف المبيعات والتحصيل الشاملة (Google Sheets)'}
                </h1>
                <span className="bg-[var(--app-accent)] text-deep-navy text-[11px] font-black px-2.5 py-0.5 rounded-full">
                  2026
                </span>
              </div>

              {/* Strict Privacy Indicator */}
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-soft">
                <ShieldCheck className="w-4 h-4 text-[var(--app-accent)] shrink-0" />
                {isSalesRep ? (
                  <span className="font-bold text-teal-soft7">
                    سرية تامة: معروضة أرقامك الشخصية فقط ({currentUser?.name})
                  </span>
                ) : isSupervisor ? (
                  <span className="font-bold text-blue-soft3">
                    سرية الفرع: معروضة أرقامك الشخصية ومناديب فريقك فقط في {currentUser?.branchName}
                  </span>
                ) : isBranchManager ? (
                  <span className="font-bold text-slate-soft">
                    إدارة الفرع: معروضة فقط أرقام مناديب {currentUser?.branchName}
                  </span>
                ) : (
                  <span className="font-bold text-[var(--app-accent)]">
                    الإدارة والمطور: رؤية كاملة لجميع الفروع مع صلاحيات رفع وتحديث الشيتات
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
                : 'لم يتم مزامنة بيانات الأهداف والتارجت لهذا الشهر حتى الآن من قِبل الإدارة. ستظهر هنا أرقامك والرسوم البيانية فور مزامنة الشيت المعتمد.'}
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
          {/* Controls & Period Selector Bar */}
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs space-y-3">
            {/* 🏠⚡ فلتر قطاع التارجت (منزلي / كهربائي) */}
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

            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Period Mode: Monthly vs Quarterly */}
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
                    <span>شهرياً (Monthly)</span>
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
                    <span>كوارتر (Quarterly)</span>
                  </button>
                </div>
              </div>

              {/* Supervisor View Mode: My Targets vs Team Reps */}
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
                    <span>أرقامي الشخصية</span>
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
                    <span>مناديب فريقي</span>
                  </button>
                </div>
              )}

              {/* Rep Selector for Supervisor in Team Mode */}
              {isSupervisor && supervisorViewMode === 'my_team' && (
                <div className="flex items-center gap-1.5 bg-white border border-[var(--app-line)] rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>المندوب:</span>
                  <select
                    value={selectedRep}
                    onChange={(e) => setSelectedRep(e.target.value)}
                    className="bg-transparent font-black text-slate-900 outline-none cursor-pointer text-xs max-w-[160px]"
                  >
                    <option value="ALL">كل مناديب فريقي (الإجمالي)</option>
                    {supervisedReps.map((rep) => (
                      <option key={rep} value={rep}>
                        {rep}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Branch Manager Filters: Filter by Supervisor AND/OR Rep */}
              {isBranchManager && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-[rgba(201,154,67,.12)] border border-[rgba(201,154,67,.35)] rounded-xl px-2.5 py-1.5 text-xs font-bold text-warn">
                    <Building2 className="w-3.5 h-3.5 text-warn" />
                    <span>الفرع:</span>
                    <span className="font-black text-[var(--app-navy)]">{currentUser?.branchName || 'فرعي'}</span>
                  </div>

                  {/* Supervisor Filter for Branch Manager */}
                  <div className="flex items-center gap-1.5 bg-white border border-[var(--app-line)] rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                    <span>مشرف المناديب:</span>
                    <select
                      value={selectedSupervisor}
                      onChange={(e) => handleSupervisorChange(e.target.value)}
                      className="bg-transparent font-black text-slate-900 outline-none cursor-pointer text-xs max-w-[150px]"
                    >
                      <option value="ALL">كل مشرفي الفرع (الكل)</option>
                      {branchSupervisors.map((sup) => (
                        <option key={sup} value={sup}>
                          {sup}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Rep Filter for Branch Manager */}
                  <div className="flex items-center gap-1.5 bg-white border border-[var(--app-line)] rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>المندوب:</span>
                    <select
                      value={selectedRep}
                      onChange={(e) => setSelectedRep(e.target.value)}
                      className="bg-transparent font-black text-slate-900 outline-none cursor-pointer text-xs max-w-[150px]"
                    >
                      <option value="ALL">
                        {selectedSupervisor !== 'ALL'
                          ? `كل مناديب ${selectedSupervisor}`
                          : 'كل مناديب الفرع'}
                      </option>
                      {branchAndSupervisorReps.map((rep) => (
                        <option key={rep} value={rep}>
                          {rep}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Admin & Developer View Tabs */}
              {isAdminOrDev && (
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setAdminTab('overview')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                      adminTab === 'overview' ? 'bg-[var(--app-navy)] text-white shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)]' : 'text-gray hover:text-[var(--app-navy)]'
                    }`}
                  >
                    الأرقام والرسم البياني
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
                    جدول الشيت المرفوع
                  </button>
                </div>
              )}
            </div>

            {/* Sub-Filters: Months Pills or Quarters Pills */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              {periodMode === 'monthly' ? (
                <div className="flex flex-wrap items-center gap-1 overflow-x-auto no-scrollbar">
                  <span className="text-xs font-bold text-slate-500 ml-1">اختر الشهر:</span>
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
                  <span className="text-xs font-bold text-slate-500 ml-1">اختر الكوارتر:</span>
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

              {/* Admin filters: Linked Branch, Supervisor, and Rep selections */}
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
                        <option key={b} value={b}>
                          {b}
                        </option>
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
                        <option key={s} value={s}>
                          {s}
                        </option>
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
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* THE 8 NUMBERS (KPI Cards for Sales and Collection) - Fully responsive 2-col on mobile, 4-col on desktop */}
          <StatGrid visible={4} className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5" moreLabel="عرض مؤشرات التحصيل">
            {/* 1. Sales Target */}
            <div className="bg-white rounded-[14px] p-4 border border-[var(--app-line)] shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray">هدف البيع (Sales Target)</span>
                <div className="w-8 h-8 rounded-lg bg-[rgba(16,43,78,.08)] text-[var(--app-navy)] flex items-center justify-center font-black">
                  <Target className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black app-num stat-hero text-[var(--app-navy)] mt-2">
                {formatEGP(kpis.totalSalesTarget)}
              </div>
              <div className="text-[11px] text-gray mt-1 font-bold">
                المستهدف للفترة المحددة
              </div>
            </div>

            {/* 2. Actual Sales */}
            <div className="bg-white rounded-[14px] p-4 border border-[var(--app-line)] shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray">المحقق بيع (Actual)</span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-md border tabular-nums ${getBadgeColor(kpis.salesPercentage)}`}>
                  {kpis.salesPercentage}%
                </span>
              </div>
              <div className="text-2xl font-black app-num stat-hero text-[var(--app-ok)] mt-2">
                {formatEGP(kpis.totalSalesAchieved)}
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-[rgba(16,43,78,.10)] h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    kpis.salesPercentage >= 100 ? 'bg-[var(--app-ok)]' : kpis.salesPercentage >= 75 ? 'bg-[var(--app-warn)]' : 'bg-[var(--app-risk)]'
                  }`}
                  style={{ width: `${Math.min(100, kpis.salesPercentage)}%` }}
                />
              </div>
              <div className="text-[11px] mt-1 font-bold flex justify-between">
                <span className="text-gray">نسبة الإنجاز:</span>
                <span className="text-[var(--app-navy)] font-black tabular-nums">{kpis.salesPercentage}%</span>
              </div>
            </div>

            {/* 3. Remaining Sales */}
            <div className="bg-white rounded-[14px] p-4 border border-[var(--app-line)] shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray">المتبقي بيع (Remaining)</span>
                <div className="w-8 h-8 rounded-lg bg-[rgba(155,112,39,.14)] text-[var(--app-warn)] flex items-center justify-center font-black">
                  <ArrowDownRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black app-num stat-hero text-[var(--app-warn)] mt-2">
                {formatEGP(kpis.remainingSales)}
              </div>
              <div className="text-[11px] text-gray mt-1 font-bold">
                {kpis.remainingSales === 0 ? 'تم إكمال التارجت بالكامل!' : 'المبلغ المطلوب لتحقيق الهدف'}
              </div>
            </div>

            {/* 4. Sales Percentage Badge Card */}
            <div className="bg-[var(--app-navy)] text-white rounded-[14px] p-4 shadow-xs relative overflow-hidden border border-deep3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-soft3">نسبة نجاح البيع</span>
                <TrendingUp className="w-4 h-4 text-[var(--app-accent)]" />
              </div>
              <div className="text-3xl font-black app-num stat-hero text-[var(--app-accent)] mt-2 tabular-nums">
                {kpis.salesPercentage}%
              </div>
              <div className="text-[11px] text-slate-soft mt-1 font-bold">
                {kpis.salesPercentage >= 100
                  ? 'أداء استثنائي متفوق'
                  : kpis.salesPercentage >= 75
                  ? 'أداء جيد جداً وجاري المتابعة'
                  : 'يحتاج لتكثيف الزيارات والمبيعات'}
              </div>
            </div>

            {/* 5. Collection Target */}
            <div className="bg-white rounded-[14px] p-4 border border-[var(--app-line)] shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray">هدف التحصيل (Collection Target)</span>
                <div className="w-8 h-8 rounded-lg bg-[rgba(16,43,78,.08)] text-[var(--app-navy)] flex items-center justify-center font-black">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black app-num stat-hero text-[var(--app-navy)] mt-2">
                {formatEGP(kpis.totalCollectionTarget)}
              </div>
              <div className="text-[11px] text-gray mt-1 font-bold">
                المستهدف توريده للخزينة
              </div>
            </div>

            {/* 6. Actual Collection */}
            <div className="bg-white rounded-[14px] p-4 border border-[var(--app-line)] shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray">المحقق تحصيل (Collected)</span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-md border tabular-nums ${getBadgeColor(kpis.collectionPercentage)}`}>
                  {kpis.collectionPercentage}%
                </span>
              </div>
              <div className="text-2xl font-black app-num stat-hero text-[var(--app-navy)] mt-2">
                {formatEGP(kpis.totalCollectionAchieved)}
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-[rgba(16,43,78,.10)] h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    kpis.collectionPercentage >= 100 ? 'bg-[var(--app-ok)]' : kpis.collectionPercentage >= 75 ? 'bg-[var(--app-warn)]' : 'bg-[var(--app-risk)]'
                  }`}
                  style={{ width: `${Math.min(100, kpis.collectionPercentage)}%` }}
                />
              </div>
              <div className="text-[11px] mt-1 font-bold flex justify-between">
                <span className="text-gray">نسبة التحصيل:</span>
                <span className="text-[var(--app-navy)] font-black tabular-nums">{kpis.collectionPercentage}%</span>
              </div>
            </div>

            {/* 7. Remaining Collection */}
            <div className="bg-white rounded-[14px] p-4 border border-[var(--app-line)] shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray">المتبقي تحصيل (Remaining)</span>
                <div className="w-8 h-8 rounded-lg bg-[rgba(16,43,78,.08)] text-[var(--app-navy)] flex items-center justify-center font-black">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black app-num stat-hero text-[var(--app-navy)] mt-2">
                {formatEGP(kpis.remainingCollection)}
              </div>
              <div className="text-[11px] text-gray mt-1 font-bold">
                المتبقي توريده لتغطية الهدف
              </div>
            </div>

            {/* 8. Collection Percentage Badge Card */}
            <div className="bg-[var(--app-navy)] text-white rounded-[14px] p-4 shadow-xs relative overflow-hidden border border-deep3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-soft3">نسبة التحصيل</span>
                <Award className="w-4 h-4 text-[var(--app-accent)]" />
              </div>
              <div className="text-3xl font-black app-num stat-hero text-white mt-2 tabular-nums">
                {kpis.collectionPercentage}%
              </div>
              <div className="text-[11px] text-blue-soft3 mt-1 font-bold">
                مؤشر السيولة النقدية والتوريدات
              </div>
            </div>
          </StatGrid>

          {/* POWER BI FEATURE: MONTHLY DETAILS TABLE (جدول تفاصيل أهداف وتحصيلات الشهور) */}
          {periodMode === 'monthly' && (
            <section className="bg-white rounded-[14px] border border-[var(--app-line)] shadow-sm overflow-hidden space-y-0">
              {/* Table Header with Filters */}
              <div className="p-4 sm:p-5 border-b border-[var(--app-line)] bg-gradient-to-l from-[rgba(16,43,78,.04)] via-white to-[rgba(201,154,67,.07)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[var(--app-navy)] text-[var(--app-accent)] flex items-center justify-center font-black shadow-xs">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-[var(--app-navy)]">
                      جدول تفاصيل أهداف وتحصيلات الشهور (Power BI Monthly Details Table)
                    </h3>
                  </div>
                  <p className="text-xs text-gray mt-1 font-bold">
                    عرض مقارن لكل شهر يشمل: هدف البيع، المحقق بيع، النسبة، المتبقي، هدف التحصيل، محقق التحصيل، النسبة، والمتبقي تحصيل
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Active Month Alert / Clear Button */}
                  {selectedMonth !== 'ALL' && (
                    <div className="flex items-center gap-1.5 bg-[rgba(155,112,39,.14)] border border-[rgba(155,112,39,.30)] px-3 py-1.5 rounded-xl text-xs font-black text-[var(--app-warn)]">
                      <span>الشهر المختار: {ARABIC_MONTHS[(selectedMonth as number) - 1]}</span>
                      <button
                        onClick={() => setSelectedMonth('ALL')}
                        className="text-[var(--app-warn)] hover:opacity-70 underline mr-1 cursor-pointer"
                      >
                        عرض كل الشهور
                      </button>
                    </div>
                  )}

                  {/* Toggle: All 12 months vs active only */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                    <button
                      onClick={() => setTableMonthsFilter('all_12')}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                        tableMonthsFilter === 'all_12'
                          ? 'bg-[var(--app-navy)] text-white shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)] font-black'
                          : 'text-gray hover:text-[var(--app-navy)]'
                      }`}
                    >
                      كامل الـ 12 شهراً
                    </button>
                    <button
                      onClick={() => setTableMonthsFilter('with_data_only')}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                        tableMonthsFilter === 'with_data_only'
                          ? 'bg-[var(--app-navy)] text-white shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)] font-black'
                          : 'text-gray hover:text-[var(--app-navy)]'
                      }`}
                    >
                      الشهور ذات البيانات فقط
                    </button>
                  </div>
                </div>
              </div>

              {/* The Matrix Table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-right text-xs">
                  <thead className="bg-[var(--app-navy)] text-slate-soft8 font-black border-b border-[rgba(255,255,255,.14)]">
                    <tr>
                      <th className="px-4 py-3.5 whitespace-nowrap">الشهر / الربع</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-white">هدف البيع</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-teal-soft7">المحقق بيع</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-center">نسبة البيع %</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-[var(--app-accent)]">المتبقي بيع (100%)</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-white">هدف التحصيل</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-blue-soft3">محقق التحصيل</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-center">نسبة التحصيل %</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-blue-soft3">المتبقي تحصيل (100%)</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-center">المتعاملين</th>
                      <th className="px-4 py-3.5 whitespace-nowrap text-center">حالة الإنجاز</th>
                      <th className="px-3 py-3.5 whitespace-nowrap text-center">تركيز</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedMonthlyRows.map((row) => {
                      const isRowSelected = selectedMonth === row.month;
                      const hasData = row.salesTarget > 0 || row.salesAchieved > 0 || row.colTarget > 0 || row.colAchieved > 0;

                      return (
                        <tr
                          key={row.month}
                          className={`transition-colors ${
                            isRowSelected
                              ? 'bg-[rgba(201,154,67,.09)] font-bold ring-1 ring-[rgba(201,154,67,.45)]'
                              : hasData
                              ? 'hover:bg-slate-50/80'
                              : 'opacity-60 hover:opacity-100 hover:bg-slate-50'
                          }`}
                        >
                          {/* Month & Quarter */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-[var(--app-navy)] text-sm">{row.monthName}</span>
                              <span className="text-[10px] font-bold text-gray bg-slate-light px-2 py-0.5 rounded-md border border-[var(--app-line)]">
                                {row.quarter}
                              </span>
                              {isRowSelected && (
                                <span className="text-[10px] font-black text-warn bg-[rgba(201,154,67,.18)] px-2 py-0.5 rounded-md">
                                  مختار حالياً
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Sales Target */}
                          <td className="px-4 py-3 whitespace-nowrap font-bold text-gray tabular-nums">
                            {formatEGP(row.salesTarget)}
                          </td>

                          {/* Sales Achieved */}
                          <td className="px-4 py-3 whitespace-nowrap font-black text-[var(--app-ok)] tabular-nums">
                            {formatEGP(row.salesAchieved)}
                          </td>

                          {/* Sales % with mini bar */}
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-0.5 font-black text-xs ${getBadgeColor(
                                  row.salesPerc
                                )}`}
                              >
                                {row.salesPerc}%
                              </span>
                              <div className="w-16 bg-[rgba(16,43,78,.10)] h-1 rounded-full mt-1 overflow-hidden">
                                <div
                                  className={`h-full ${
                                    row.salesPerc >= 100
                                      ? 'bg-[var(--app-ok)]'
                                      : row.salesPerc >= 70
                                      ? 'bg-[var(--app-warn)]'
                                      : 'bg-[var(--app-risk)]'
                                  }`}
                                  style={{ width: `${Math.min(100, row.salesPerc)}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Sales Remaining */}
                          <td className="px-4 py-3 whitespace-nowrap font-black text-[var(--app-warn)] tabular-nums">
                            {row.remainingSales === 0 && row.salesTarget > 0 ? (
                              <span className="text-[var(--app-ok)] bg-[rgba(46,125,91,.10)] px-2 py-0.5 rounded-md text-[11px] font-bold">
                                تم بالكامل
                              </span>
                            ) : (
                              formatEGP(row.remainingSales)
                            )}
                          </td>

                          {/* Collection Target */}
                          <td className="px-4 py-3 whitespace-nowrap font-bold text-gray tabular-nums">
                            {formatEGP(row.colTarget)}
                          </td>

                          {/* Collection Achieved */}
                          <td className="px-4 py-3 whitespace-nowrap font-black text-[var(--app-navy)] tabular-nums">
                            {formatEGP(row.colAchieved)}
                          </td>

                          {/* Collection % with mini bar */}
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-0.5 font-black text-xs ${getBadgeColor(
                                  row.colPerc
                                )}`}
                              >
                                {row.colPerc}%
                              </span>
                              <div className="w-16 bg-[rgba(16,43,78,.10)] h-1 rounded-full mt-1 overflow-hidden">
                                <div
                                  className={`h-full ${
                                    row.colPerc >= 100
                                      ? 'bg-[var(--app-ok)]'
                                      : row.colPerc >= 70
                                      ? 'bg-[var(--app-warn)]'
                                      : 'bg-[var(--app-risk)]'
                                  }`}
                                  style={{ width: `${Math.min(100, row.colPerc)}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Collection Remaining */}
                          <td className="px-4 py-3 whitespace-nowrap font-black text-[var(--app-navy)] tabular-nums">
                            {row.remainingCol === 0 && row.colTarget > 0 ? (
                              <span className="text-[var(--app-ok)] bg-[rgba(46,125,91,.10)] px-2 py-0.5 rounded-md text-[11px] font-bold">
                                تم بالكامل
                              </span>
                            ) : (
                              formatEGP(row.remainingCol)
                            )}
                          </td>

                          {/* Active Customers (متعامل) */}
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className={`inline-flex rounded-full border px-2.5 py-0.5 font-black text-xs tabular-nums ${
                                row.activeCustomers > 0
                                  ? 'bg-[rgba(16,43,78,.08)] text-[var(--app-navy)] border-[rgba(16,43,78,.20)]'
                                  : 'bg-slate-50 text-slate-400 border-slate-200'
                              }`}>
                                {row.activeCustomers}
                              </span>
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                من {row.totalCustomers}
                              </span>
                            </div>
                          </td>

                          {/* Achievement Status Badge */}
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {row.salesPerc >= 100 && row.colPerc >= 100 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--app-ok)] bg-[rgba(46,125,91,.14)] border border-[rgba(46,125,91,.30)] px-2.5 py-0.5 rounded-full">
                                مكتمل بالكامل
                              </span>
                            ) : row.salesPerc >= 100 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--app-ok)] bg-[rgba(46,125,91,.10)] border border-[rgba(46,125,91,.25)] px-2 py-0.5 rounded-full">
                                مكتمل بيعاً
                              </span>
                            ) : row.colPerc >= 100 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--app-navy)] bg-[rgba(16,43,78,.08)] border border-[rgba(16,43,78,.20)] px-2 py-0.5 rounded-full">
                                مكتمل تحصيلاً
                              </span>
                            ) : row.salesPerc >= 70 || row.colPerc >= 70 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--app-warn)] bg-[rgba(155,112,39,.12)] border border-[rgba(155,112,39,.28)] px-2 py-0.5 rounded-full">
                                متقدم
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-black text-gray bg-slate-light border border-[var(--app-line)] px-2 py-0.5 rounded-full">
                                قيد المتابعة
                              </span>
                            )}
                          </td>

                          {/* Quick Focus Button */}
                          <td className="px-3 py-3 whitespace-nowrap text-center">
                            <button
                              onClick={() => setSelectedMonth(row.month)}
                              className={`p-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                isRowSelected
                                  ? 'bg-[var(--app-navy)] text-white font-black shadow-xs shadow-[inset_0_-3px_0_var(--app-accent)]'
                                  : 'bg-white border border-[var(--app-line)] text-gray hover:border-slate-border hover:text-[var(--app-navy)]'
                              }`}
                              title={`التركيز على أرقام شهر ${row.monthName}`}
                            >
                              <Search className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Grand Total Footer Row (الإجمالي الشامل لجميع الشهور) */}
                  <tfoot className="bg-slate-900 text-white font-black text-xs border-t-2 border-slate-700">
                    <tr>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-[var(--app-accent)] text-sm">
                          <Target className="w-4 h-4" />
                          <span>الإجمالي الشامل (12 شهراً)</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-slate-200">
                        {formatEGP(monthlyMatrixTotals.totSalesTarget)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-[var(--app-ok)] text-sm">
                        {formatEGP(monthlyMatrixTotals.totSalesAchieved)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className="inline-block bg-[rgba(46,125,91,.12)] text-[var(--app-ok)] border border-[rgba(46,125,91,.35)] px-3 py-1 rounded-full text-xs font-black">
                          {monthlyMatrixTotals.totSalesPerc}%
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-[var(--app-accent)]">
                        {formatEGP(monthlyMatrixTotals.totRemSales)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-slate-200">
                        {formatEGP(monthlyMatrixTotals.totColTarget)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-[var(--app-navy)] text-sm">
                        {formatEGP(monthlyMatrixTotals.totColAchieved)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className="inline-block bg-[rgba(16,43,78,.10)] text-[var(--app-navy)] border border-[rgba(16,43,78,.25)] px-3 py-1 rounded-full text-xs font-black">
                          {monthlyMatrixTotals.totColPerc}%
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-[var(--app-navy)]">
                        {formatEGP(monthlyMatrixTotals.totRemCol)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex flex-col items-center">
                          <span className="inline-block bg-[rgba(201,154,67,.15)] text-[var(--app-accent)] border border-[rgba(201,154,67,.35)] px-3 py-1 rounded-full text-xs font-black">
                            {monthlyMatrixTotals.totActiveCustomers}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5">من {monthlyMatrixTotals.totTotalCustomers}</span>
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center text-[var(--app-accent)] text-[11px]">
                        ملخص الأداء السنوي
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => setSelectedMonth('ALL')}
                          className="bg-[var(--app-accent)] hover:bg-amber-deep2 text-slate-950 font-black px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer"
                        >
                          الكل
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* THE PERFORMANCE CHART (الرسم البياني للأداء) */}
          {(!isAdminOrDev || adminTab === 'overview') && (
            <div className="space-y-4">
              {/* Chart Mode Toggle: Timeline vs Monthly Comparison vs Reps Ranking */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-[var(--app-accent)]" />
                  <span className="text-sm font-black text-slate-900">الرسم البياني والتحليل الإحصائي:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setChartViewMode('timeline')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      chartViewMode === 'timeline'
                        ? 'bg-[var(--app-accent)] text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>المستهدف مقابل المحقق</span>
                  </button>
                  <button
                    onClick={() => setChartViewMode('monthly_comparison')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      chartViewMode === 'monthly_comparison'
                        ? 'bg-[var(--app-accent)] text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>مقارنة الشهور بيع وتحصيل (Power BI)</span>
                  </button>
                  {repsRankingData.length > 1 && (
                    <button
                      onClick={() => setChartViewMode('reps_ranking')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                        chartViewMode === 'reps_ranking'
                          ? 'bg-[var(--app-accent)] text-slate-950 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>مقارنة وترتيب المناديب ({repsRankingData.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {chartViewMode === 'monthly_comparison' ? (
                /* Power BI Monthly Sales vs Collection Comparison View */
                <div className="space-y-4">
                  <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                      <div>
                        <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-[var(--app-accent)]" />
                          <span>مقارنة أداء الشهور في البيع والتحصيل (Power BI Monthly Comparison)</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5 font-bold">
                          تحليل موحد ومقارنة رأسية مباشرة بين حركة البيع وحركة التحصيل لكل شهر من شهور السنة
                        </p>
                      </div>

                      {/* Amount vs Percentage Switcher */}
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                        <button
                          onClick={() => setComparisonMetric('amount')}
                          className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            comparisonMetric === 'amount'
                              ? 'bg-white text-slate-900 shadow-xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>المبالغ المحققة (ج.م)</span>
                        </button>
                        <button
                          onClick={() => setComparisonMetric('percentage')}
                          className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            comparisonMetric === 'percentage'
                              ? 'bg-white text-slate-900 shadow-xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Percent className="w-3.5 h-3.5" />
                          <span>نسب الإنجاز المئوية (%)</span>
                        </button>
                      </div>
                    </div>

                    {/* Chart Legend */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-2 border-b border-slate-100 text-xs font-bold">
                      <div className="flex items-center gap-4">
                        {comparisonMetric === 'amount' ? (
                          <>
                            <span className="flex items-center gap-1.5 text-[var(--app-ok-text)]">
                              <span className="w-3.5 h-3.5 rounded-xs bg-[var(--app-ok)] inline-block shadow-xs" />
                              المحقق بيع (ج.م)
                            </span>
                            <span className="flex items-center gap-1.5 text-[var(--app-navy-text)]">
                              <span className="w-3.5 h-3.5 rounded-xs bg-[var(--app-navy)] inline-block shadow-xs" />
                              المحقق تحصيل (ج.م)
                            </span>
                            <span className="flex items-center gap-1.5 text-slate-500">
                              <span className="w-3.5 h-3.5 rounded-xs bg-slate-300 inline-block" />
                              هدف البيع
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="flex items-center gap-1.5 text-[var(--app-ok-text)]">
                              <span className="w-3.5 h-3.5 rounded-xs bg-[var(--app-ok)] inline-block shadow-xs" />
                              نسبة إنجاز البيع (%)
                            </span>
                            <span className="flex items-center gap-1.5 text-[var(--app-navy-text)]">
                              <span className="w-3.5 h-3.5 rounded-xs bg-[var(--app-navy)] inline-block shadow-xs" />
                              نسبة إنجاز التحصيل (%)
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-normal">
                        مقارنة أداء الشهور متزامنة
                      </span>
                    </div>

                    {/* The Chart */}
                    <div className="h-[300px] sm:h-[360px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={monthlyComparisonChartData}
                          margin={{ top: 15, right: 10, left: 10, bottom: 25 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey="monthName"
                            tick={{ fill: '#334155', fontSize: 11, fontWeight: 'bold' }}
                            interval={0}
                          />
                          <YAxis
                            tick={{ fill: '#64748b', fontSize: 10 }}
                            tickFormatter={(val) =>
                              comparisonMetric === 'percentage' ? `${val}%` : `${Math.round(val / 1000)}k`
                            }
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const row = monthlyMatrixRows.find((r) => r.monthName === label);
                                if (!row) return null;
                                return (
                                  <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl text-xs space-y-1.5 border border-slate-800 font-sans min-w-[220px]">
                                    <div className="font-black text-[var(--app-accent)] text-sm border-b border-slate-700 pb-1 flex justify-between">
                                      <span>شهر {label}</span>
                                      <span className="text-slate-400 text-xs font-normal">{row.quarter}</span>
                                    </div>
                                    <div className="pt-1">
                                      <div className="text-slate-300 flex justify-between">
                                        <span>هدف البيع:</span>
                                        <strong className="text-white">{formatEGP(row.salesTarget)}</strong>
                                      </div>
                                      <div className="text-[var(--app-ok)] flex justify-between">
                                        <span>المحقق بيع:</span>
                                        <strong className="font-black">{formatEGP(row.salesAchieved)} ({row.salesPerc}%)</strong>
                                      </div>
                                      <div className="text-[var(--app-accent)] flex justify-between text-[11px]">
                                        <span>المتبقي للـ 100%:</span>
                                        <span>{formatEGP(row.remainingSales)}</span>
                                      </div>
                                    </div>
                                    <div className="border-t border-slate-800 pt-1.5">
                                      <div className="text-slate-300 flex justify-between">
                                        <span>هدف التحصيل:</span>
                                        <strong className="text-white">{formatEGP(row.colTarget)}</strong>
                                      </div>
                                      <div className="text-[var(--app-navy)] flex justify-between">
                                        <span>المحقق تحصيل:</span>
                                        <strong className="font-black">{formatEGP(row.colAchieved)} ({row.colPerc}%)</strong>
                                      </div>
                                      <div className="text-[#60a5fa] flex justify-between text-[11px]">
                                        <span>المتبقي تحصيل:</span>
                                        <span>{formatEGP(row.remainingCol)}</span>
                                      </div>
                                    </div>
                                    {row.highestMilestone !== 'none' && (
                                      <div className="border-t border-slate-800 pt-1 text-[11px] text-[var(--app-ok)] font-bold text-center">
                                        المحطة المنجزة: {row.highestMilestone}
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          {comparisonMetric === 'amount' ? (
                            <>
                              <Bar dataKey="salesTarget" fill="#e2e8f0" radius={[4, 4, 0, 0]} name="هدف البيع" />
                              <Bar dataKey="salesAchieved" fill="#10b981" radius={[5, 5, 0, 0]} name="المحقق بيع" />
                              <Bar dataKey="colAchieved" fill="#2563eb" radius={[5, 5, 0, 0]} name="المحقق تحصيل" />
                            </>
                          ) : (
                            <>
                              <Bar dataKey="salesPerc" fill="#10b981" radius={[5, 5, 0, 0]} name="نسبة البيع %" />
                              <Bar dataKey="colPerc" fill="#2563eb" radius={[5, 5, 0, 0]} name="نسبة التحصيل %" />
                            </>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Highlights Bar for Top Months */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Top Sales Month */}
                    {(() => {
                      const topSales = [...monthlyMatrixRows].sort((a, b) => b.salesAchieved - a.salesAchieved)[0];
                      return (
                        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
                          <div className="text-xs font-bold text-slate-500 mb-1 flex items-center justify-between">
                            <span>أعلى شهر في المبيعات</span>
                            <Flame className="w-4 h-4 text-[var(--app-ok-text)]" />
                          </div>
                          <div className="text-base font-black text-slate-900">
                            {topSales && topSales.salesAchieved > 0 ? `${topSales.monthName} (${topSales.quarter})` : 'لا توجد بيانات'}
                          </div>
                          <div className="text-xs font-bold text-[var(--app-ok-text)] mt-1">
                            {topSales && topSales.salesAchieved > 0 ? formatEGP(topSales.salesAchieved) : '—'}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Top Collection Month */}
                    {(() => {
                      const topCol = [...monthlyMatrixRows].sort((a, b) => b.colAchieved - a.colAchieved)[0];
                      return (
                        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
                          <div className="text-xs font-bold text-slate-500 mb-1 flex items-center justify-between">
                            <span>أعلى شهر في التحصيل</span>
                            <Wallet className="w-4 h-4 text-[var(--app-navy-text)]" />
                          </div>
                          <div className="text-base font-black text-slate-900">
                            {topCol && topCol.colAchieved > 0 ? `${topCol.monthName} (${topCol.quarter})` : 'لا توجد بيانات'}
                          </div>
                          <div className="text-xs font-bold text-[var(--app-navy-text)] mt-1">
                            {topCol && topCol.colAchieved > 0 ? formatEGP(topCol.colAchieved) : '—'}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Highest Sales Achievement % */}
                    {(() => {
                      const topSalesPerc = [...monthlyMatrixRows]
                        .filter((r) => r.salesTarget > 0)
                        .sort((a, b) => b.salesPerc - a.salesPerc)[0];
                      return (
                        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
                          <div className="text-xs font-bold text-slate-500 mb-1 flex items-center justify-between">
                            <span>أعلى نسبة إنجاز بيع</span>
                            <TrendingUp className="w-4 h-4 text-[var(--app-accent)]" />
                          </div>
                          <div className="text-base font-black text-slate-900">
                            {topSalesPerc ? `${topSalesPerc.monthName}` : 'لا توجد بيانات'}
                          </div>
                          <div className="text-xs font-bold text-[var(--app-warn-text)] mt-1">
                            {topSalesPerc ? `${topSalesPerc.salesPerc}%` : '—'}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Highest Collection Achievement % */}
                    {(() => {
                      const topColPerc = [...monthlyMatrixRows]
                        .filter((r) => r.colTarget > 0)
                        .sort((a, b) => b.colPerc - a.colPerc)[0];
                      return (
                        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
                          <div className="text-xs font-bold text-slate-500 mb-1 flex items-center justify-between">
                            <span>أعلى نسبة تحصيل</span>
                            <Award className="w-4 h-4 text-[var(--app-ok-text)]" />
                          </div>
                          <div className="text-base font-black text-slate-900">
                            {topColPerc ? `${topColPerc.monthName}` : 'لا توجد بيانات'}
                          </div>
                          <div className="text-xs font-bold text-[var(--app-ok-text)] mt-1">
                            {topColPerc ? `${topColPerc.colPerc}%` : '—'}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : chartViewMode === 'reps_ranking' && repsRankingData.length > 1 ? (
                /* Reps Performance Ranking View */
                <div className="space-y-4">
                  {/* Visual Bar Chart for Reps Ranking */}
                  <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                          <Award className="w-5 h-5 text-[var(--app-accent)]" />
                          <span>رسم بياني لمقارنة نسب إنجاز مناديب الفرع</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5 font-bold">
                          مقارنة نسبة إنجاز مبيعات ونسبة إنجاز تحصيل كل مندوب مئوية (%)
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-bold">
                        <span className="flex items-center gap-1.5 text-[var(--app-ok-text)]">
                          <span className="w-3 h-3 rounded-xs bg-[var(--app-ok)] inline-block" />
                          إنجاز البيع %
                        </span>
                        <span className="flex items-center gap-1.5 text-[var(--app-navy-text)]">
                          <span className="w-3 h-3 rounded-xs bg-[var(--app-navy)] inline-block" />
                          إنجاز التحصيل %
                        </span>
                      </div>
                    </div>

                    <div className="h-[280px] sm:h-[340px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={repsRankingData}
                          margin={{ top: 10, right: 10, left: 10, bottom: 25 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey="repName"
                            tick={{ fill: '#334155', fontSize: 10, fontWeight: 'bold' }}
                            interval={0}
                            angle={-15}
                            textAnchor="end"
                          />
                          <YAxis
                            tick={{ fill: '#64748b', fontSize: 10 }}
                            tickFormatter={(val) => `${val}%`}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const item = repsRankingData.find((r) => r.repName === label);
                                if (!item) return null;
                                return (
                                  <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-800 font-sans">
                                    <div className="font-black text-[var(--app-accent)] text-sm border-b border-slate-700 pb-1">
                                      {label}
                                    </div>
                                    <div className="text-slate-300">
                                      هدف البيع: <strong className="text-white">{formatEGP(item.salesTarget)}</strong>
                                    </div>
                                    <div className="text-slate-300">
                                      المحقق بيع: <strong className="text-[var(--app-ok)]">{formatEGP(item.salesAchieved)}</strong> ({item.salesPerc}%)
                                    </div>
                                    <div className="text-slate-300">
                                      هدف التحصيل: <strong className="text-white">{formatEGP(item.colTarget)}</strong>
                                    </div>
                                    <div className="text-slate-300">
                                      المحقق تحصيل: <strong className="text-[var(--app-navy)]">{formatEGP(item.colAchieved)}</strong> ({item.colPerc}%)
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="salesPerc" fill="#10b981" radius={[6, 6, 0, 0]} name="إنجاز البيع %" />
                          <Bar dataKey="colPerc" fill="#2563eb" radius={[6, 6, 0, 0]} name="إنجاز التحصيل %" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Rep Leaderboard Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {repsRankingData.map((rep, idx) => {
                      const medal = `${idx + 1}`;
                      const isSalesAchieved = rep.salesPerc >= 100;
                      const isColAchieved = rep.colPerc >= 100;

                      return (
                        <div
                          key={rep.repName}
                          className={`bg-white rounded-2xl p-4 border transition shadow-xs ${
                            idx === 0
                              ? 'border-[var(--app-warn)] bg-[var(--app-warn-tint)]'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs">
                                {medal}
                              </span>
                              <div className="font-black text-slate-900 text-sm">{rep.repName}</div>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedRep(rep.repName);
                                setChartViewMode('timeline');
                              }}
                              className="text-[10px] text-[var(--app-warn-text)] bg-[var(--app-warn-tint)] hover:bg-[var(--app-warn-tint)] font-black px-2 py-0.5 rounded-md transition cursor-pointer"
                            >
                              تفاصيل
                            </button>
                          </div>

                          <div className="space-y-2 text-xs">
                            {/* Sales achievement meter */}
                            <div className="space-y-1">
                              <div className="flex justify-between font-bold">
                                <span className="text-slate-500">البيع:</span>
                                <span className={isSalesAchieved ? 'text-[var(--app-ok-text)] font-black' : 'text-slate-800'}>
                                  {formatEGP(rep.salesAchieved)} / {formatEGP(rep.salesTarget)} ({rep.salesPerc}%)
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    rep.salesPerc >= 100
                                      ? 'bg-[var(--app-ok)]'
                                      : rep.salesPerc >= 75
                                      ? 'bg-[var(--app-accent)]'
                                      : 'bg-[var(--app-risk)]'
                                  }`}
                                  style={{ width: `${Math.min(100, rep.salesPerc)}%` }}
                                />
                              </div>
                            </div>

                            {/* Collection achievement meter */}
                            <div className="space-y-1">
                              <div className="flex justify-between font-bold">
                                <span className="text-slate-500">التحصيل:</span>
                                <span className={isColAchieved ? 'text-[var(--app-navy-text)] font-black' : 'text-slate-800'}>
                                  {formatEGP(rep.colAchieved)} / {formatEGP(rep.colTarget)} ({rep.colPerc}%)
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    rep.colPerc >= 100
                                      ? 'bg-[var(--app-navy)]'
                                      : rep.colPerc >= 75
                                      ? 'bg-[var(--app-navy)]'
                                      : 'bg-[var(--app-risk)]'
                                  }`}
                                  style={{ width: `${Math.min(100, rep.colPerc)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Dual Timeline Charts (Sales & Collection) */
                <>
                  {/* Sales Target vs Actual Chart */}
                  <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-[var(--app-accent)]" />
                          <span>
                            الرسم البياني للأداء: مقارنة هدف البيع مع المحقق{' '}
                            {periodMode === 'monthly' ? '(شهرياً)' : '(بالكوارتر)'}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5 font-bold">
                          أعمدة المقارنة المباشرة: المستهدف في الشيت مقابل الفعلي المحقق
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-bold">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span className="w-3 h-3 rounded-xs bg-slate-300 inline-block" />
                          هدف البيع
                        </span>
                        <span className="flex items-center gap-1.5 text-[var(--app-ok-text)]">
                          <span className="w-3 h-3 rounded-xs bg-[var(--app-ok)] inline-block" />
                          المحقق بيع
                        </span>
                      </div>
                    </div>

                    <div className="h-[280px] sm:h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={displayChartData}
                          margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey="periodLabel"
                            tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }}
                          />
                          <YAxis
                            tick={{ fill: '#64748b', fontSize: 10 }}
                            tickFormatter={(val) => `${Math.round(val / 1000)}k`}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const target = Number(payload[0]?.value || 0);
                                const achieved = Number(payload[1]?.value || 0);
                                const perc = target > 0 ? ((achieved / target) * 100).toFixed(1) : '0';
                                return (
                                  <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-800 font-sans">
                                    <div className="font-black text-[var(--app-accent)] text-sm">{label}</div>
                                    <div className="text-slate-300">
                                      هدف البيع: <strong className="text-white">{formatEGP(target)}</strong>
                                    </div>
                                    <div className="text-slate-300">
                                      المحقق بيع: <strong className="text-[var(--app-ok)]">{formatEGP(achieved)}</strong>
                                    </div>
                                    <div className="text-slate-300">
                                      نسبة الإنجاز: <strong className="text-[var(--app-accent)]">{perc}%</strong>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="salesTarget" fill="#cbd5e1" radius={[6, 6, 0, 0]} name="هدف البيع" />
                          <Bar dataKey="salesAchieved" fill="#10b981" radius={[6, 6, 0, 0]} name="المحقق بيع" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Collection Target vs Actual Chart */}
                  <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                          <Wallet className="w-5 h-5 text-[var(--app-navy-text)]" />
                          <span>
                            الرسم البياني للتحصيل: هدف التحصيل مقابل المحقق{' '}
                            {periodMode === 'monthly' ? '(شهرياً)' : '(بالكوارتر)'}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5 font-bold">
                          متابعة التوريد النقدي للخزينة مقابل مستهدف التحصيل
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-bold">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span className="w-3 h-3 rounded-xs bg-slate-300 inline-block" />
                          هدف التحصيل
                        </span>
                        <span className="flex items-center gap-1.5 text-[var(--app-navy-text)]">
                          <span className="w-3 h-3 rounded-xs bg-[var(--app-navy)] inline-block" />
                          المحقق تحصيل
                        </span>
                      </div>
                    </div>

                    <div className="h-[250px] sm:h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={displayChartData}
                          margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey="periodLabel"
                            tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }}
                          />
                          <YAxis
                            tick={{ fill: '#64748b', fontSize: 10 }}
                            tickFormatter={(val) => `${Math.round(val / 1000)}k`}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const target = Number(payload[0]?.value || 0);
                                const achieved = Number(payload[1]?.value || 0);
                                const perc = target > 0 ? ((achieved / target) * 100).toFixed(1) : '0';
                                return (
                                  <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-800 font-sans">
                                    <div className="font-black text-[var(--app-navy)] text-sm">{label}</div>
                                    <div className="text-slate-300">
                                      هدف التحصيل: <strong className="text-white">{formatEGP(target)}</strong>
                                    </div>
                                    <div className="text-slate-300">
                                      المحقق تحصيل: <strong className="text-[var(--app-navy)]">{formatEGP(achieved)}</strong>
                                    </div>
                                    <div className="text-slate-300">
                                      نسبة التحصيل: <strong className="text-[var(--app-accent)]">{perc}%</strong>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="collectionTarget" fill="#cbd5e1" radius={[6, 6, 0, 0]} name="هدف التحصيل" />
                          <Bar dataKey="collectionAchieved" fill="#2563eb" radius={[6, 6, 0, 0]} name="المحقق تحصيل" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

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
                        <span className="font-black text-[var(--app-ok-text)]">{formatEGP(qSalesAchieved)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>هدف البيع:</span>
                        <span>{formatEGP(qSalesTarget)}</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className="bg-[var(--app-ok)] h-full"
                          style={{ width: `${Math.min(100, qSalesPerc)}%` }}
                        />
                      </div>
                      <div className="text-left text-[10px] font-black text-[var(--app-ok-text)]">{qSalesPerc}%</div>
                    </div>

                    {/* Collection in Quarter */}
                    <div className="bg-[var(--app-navy-tint)] p-3 rounded-xl space-y-1 text-xs">
                      <div className="flex justify-between font-bold text-slate-600">
                        <span>المحقق تحصيل:</span>
                        <span className="font-black text-[var(--app-navy-text)]">{formatEGP(qColAchieved)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>هدف التحصيل:</span>
                        <span>{formatEGP(qColTarget)}</span>
                      </div>
                      <div className="w-full bg-[var(--app-navy-tint)] h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className="bg-[var(--app-navy)] h-full"
                          style={{ width: `${Math.min(100, qColPerc)}%` }}
                        />
                      </div>
                      <div className="text-left text-[10px] font-black text-[var(--app-navy-text)]">{qColPerc}%</div>
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
                    {filteredRecords.map((r, idx) => (
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
              <div className="w-10 h-10 rounded-xl bg-[var(--app-accent)] text-slate-950 flex items-center justify-center font-black">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  رفع شيت أهداف ��لمبيعات والتحصيل اليومي
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
  );
};
