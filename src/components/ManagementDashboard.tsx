import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  Layers,
  MapPin,
  Percent,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as XLSX from 'xlsx-js-style';
import { useApp } from '../context/AppContext';
import { calculateCustomerFinancials } from '../services/customerFinancialService';
import { resolveCustomerDuesValue } from '../services/customerDues';
import { formatCurrency } from '../services/invoiceService';
import { isArabicNameMatch, normalizeArabicText } from '../services/arabicMatchingService';
import { isMonthForecast } from '../services/forecastService';
import { TargetRecord } from '../types';

interface ManagementDashboardProps {
  onNavigateToTab: (tab: string) => void;
}

const MONTHS_NAMES_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'إبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const getYearFromStr = (value?: string): number | null => {
  if (!value) return null;
  const match = value.match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : null;
};

const getMonthFromStr = (value?: string): number | null => {
  if (!value) return null;
  const match = value.match(/^(?:19|20)\d{2}[-/](\d{1,2})(?:[-/]|$)/);
  const month = match ? Number(match[1]) : NaN;
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
};

const safeNumber = (value: unknown): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const getTargetYear = (target: TargetRecord): number | null =>
  target.year || getYearFromStr(target.date);

const isCanceledInv = (status: string): boolean =>
  status === 'ملغاة' || status === 'مرفوضة / ملغاة';

type ActiveDashboardSubTab = 'overview' | 'matrix' | 'branches' | 'visits_audit';
type DashboardChartMetric = 'sales' | 'collection' | 'forecast';

export const ManagementDashboard: React.FC<ManagementDashboardProps> = ({ onNavigateToTab }) => {
  const {
    currentUser,
    users,
    customers,
    branches,
    forecasts,
    getVisibleInvoices,
    getVisibleTargets,
    getVisibleVisits,
  } = useApp();

  // Role helpers
  const isSuperAdmin = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  const isBranchMgr = currentUser?.role === 'branch_manager';
  const isSupervisor = currentUser?.role === 'supervisor';

  // Filters State
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedQuarter, setSelectedQuarter] = useState<string>('ALL'); // 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL'); // 'ALL' | '1' .. '12'
  const [selectedBranch, setSelectedBranch] = useState<string>(
    isBranchMgr && currentUser?.branchName ? currentUser.branchName : isSupervisor && currentUser?.branchName ? currentUser.branchName : 'ALL'
  );
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>(
    isSupervisor ? currentUser.id : 'ALL'
  );
  const [selectedRep, setSelectedRep] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<ActiveDashboardSubTab>('overview');
  const [sortBy, setSortBy] = useState<'sales' | 'collection' | 'rate' | 'visits'>('sales');
  const [chartMetric, setChartMetric] = useState<DashboardChartMetric>('sales');

  const invoices = getVisibleInvoices();
  const visibleTargets = getVisibleTargets();
  const visits = getVisibleVisits();

  // Determine available years from data
  const availableYears = useMemo(() => {
    const setYears = new Set<number>([2026, 2025]);
    visibleTargets.forEach((t) => {
      const year = getTargetYear(t);
      if (year !== null) setYears.add(year);
    });
    invoices.forEach((inv) => {
      const y = getYearFromStr(inv.date);
      if (y) setYears.add(y);
    });
    visits.forEach((v) => {
      const y = getYearFromStr(v.date);
      if (y) setYears.add(y);
    });
    return Array.from(setYears).sort((a, b) => b - a);
  }, [visibleTargets, invoices, visits]);

  /**
   * أسماء الفروع المتاحة للفلترة.
   *
   * لازم ترجع أسماء (`string`) مش كائنات `Branch`، لأن:
   * 1. `<select>` بيرسل `value` نص، فأي كائن هيتحول لـ "[object Object]" ومفتاح
   *    الفلترة `selectedBranch !== 'ALL'` مش هيلاقي أي فرع مطابق.
   * 2. كل المقارنات في `filteredData` بتقارن `selectedBranch` (نص) بـ
   *    `t.branch` / `c.branchName` (نص)، فلو رجعنا كائنات الفلتر كله بيبقى ميّت.
   * 3. الـfallback جواه أصلاً بيبني Set من أسماء، فالخليط بين النوعين كان
   *    مصدر خطأ React #31 (render كائن كـchild).
   *
   * الأسماء بتتجيب من `branches` لو موجود، وإلا من الفروع الفعلية اللي ظهرت
   * في التارجتات والعملاء، عشان الفلتر يشتغل حتى قبل ماBranches تتزامن.
   */
  const branchList = useMemo(() => {
    const names = new Set<string>();
    if (branches && branches.length > 0) {
      branches.forEach((b) => {
        const name = (b?.name || '').trim();
        if (name) names.add(name);
      });
    }
    visibleTargets.forEach((t) => {
      if (t.branch) names.add(t.branch);
    });
    customers.forEach((c) => {
      if (c.branchName) names.add(c.branchName);
    });
    return Array.from(names).filter(Boolean);
  }, [branches, visibleTargets, customers]);

  // Supervisors list matching branch selection
  const supervisorList = useMemo(() => {
    return users.filter((u) => {
      if (!u.isActive || u.role !== 'supervisor') return false;
      if (selectedBranch !== 'ALL' && u.branchName && u.branchName !== selectedBranch) return false;
      return true;
    });
  }, [users, selectedBranch]);

  // Sales reps list matching branch and supervisor selections
  const repList = useMemo(() => {
    return users.filter((u) => {
      if (!u.isActive || u.role !== 'sales_rep') return false;
      if (selectedBranch !== 'ALL' && u.branchName && u.branchName !== selectedBranch) return false;
      if (selectedSupervisor !== 'ALL' && u.supervisorId && u.supervisorId !== selectedSupervisor) return false;
      return true;
    });
  }, [users, selectedBranch, selectedSupervisor]);

  // Filtered Core Dataset by Slicers
  const filteredData = useMemo(() => {
    // Month filter predicate
    const matchesMonth = (mNum?: number) => {
      if (!mNum) return true;
      if (selectedQuarter !== 'ALL') {
        if (selectedQuarter === 'Q1' && (mNum < 1 || mNum > 3)) return false;
        if (selectedQuarter === 'Q2' && (mNum < 4 || mNum > 6)) return false;
        if (selectedQuarter === 'Q3' && (mNum < 7 || mNum > 9)) return false;
        if (selectedQuarter === 'Q4' && (mNum < 10 || mNum > 12)) return false;
      }
      if (selectedMonth !== 'ALL' && mNum !== Number(selectedMonth)) {
        return false;
      }
      return true;
    };

    // Rep and branch predicate for target records
    const matchesTarget = (t: TargetRecord) => {
      if (getTargetYear(t) !== selectedYear) return false;
      if (!Number.isInteger(t.month) || t.month < 1 || t.month > 12 || !matchesMonth(t.month)) return false;
      if (selectedBranch !== 'ALL' && (!t.branch || t.branch !== selectedBranch)) return false;
      if (selectedSupervisor !== 'ALL') {
        const repUser = users.find((u) => isArabicNameMatch(u.name, t.repName));
        if (!repUser || repUser.supervisorId !== selectedSupervisor) return false;
      }
      if (selectedRep !== 'ALL') {
        const repUser = users.find((u) => u.id === selectedRep);
        if (!repUser || !isArabicNameMatch(repUser.name, t.repName)) return false;
      }
      return true;
    };

    const periodTargets = visibleTargets.filter(matchesTarget);

    // Invoices matching filters
    const periodInvoices = invoices.filter((inv) => {
      const invYear = getYearFromStr(inv.date);
      const invMonth = getMonthFromStr(inv.date);
      if (invYear !== selectedYear || invMonth === null || !matchesMonth(invMonth)) return false;
      if (selectedBranch !== 'ALL' && (!inv.branchName || inv.branchName !== selectedBranch)) return false;
      if (selectedSupervisor !== 'ALL') {
        const repUser = users.find((u) => u.id === inv.repId || isArabicNameMatch(u.name, inv.repName || ''));
        if (!repUser || repUser.supervisorId !== selectedSupervisor) return false;
      }
      if (selectedRep !== 'ALL' && inv.repId !== selectedRep) {
        const repUser = users.find((u) => u.id === selectedRep);
        if (!repUser || !isArabicNameMatch(repUser.name, inv.repName || '')) return false;
      }
      return true;
    });

    // Visits matching filters
    const periodVisits = visits.filter((v) => {
      const vYear = getYearFromStr(v.date);
      const visitMonth = getMonthFromStr(v.date);
      if (vYear !== selectedYear || visitMonth === null || !matchesMonth(visitMonth)) return false;
      if (selectedBranch !== 'ALL' && (!v.branchName || v.branchName !== selectedBranch)) return false;
      if (selectedSupervisor !== 'ALL') {
        const repUser = users.find((u) => u.id === v.repId || isArabicNameMatch(u.name, v.repName || ''));
        if (!repUser || repUser.supervisorId !== selectedSupervisor) return false;
      }
      if (selectedRep !== 'ALL' && v.repId !== selectedRep) {
        const repUser = users.find((u) => u.id === selectedRep);
        if (!repUser || !isArabicNameMatch(repUser.name, v.repName || '')) return false;
      }
      return true;
    });

    // Forecasts matching filters
    const periodForecasts = (forecasts || []).filter((f) => {
      const monthKeyMatch = f.monthKey?.match(/^((?:19|20)\d{2})-(0?[1-9]|1[0-2])$/);
      if (!monthKeyMatch || Number(monthKeyMatch[1]) !== selectedYear || !matchesMonth(Number(monthKeyMatch[2]))) return false;
      if (selectedBranch !== 'ALL' && (!f.branchName || f.branchName !== selectedBranch)) return false;
      if (selectedSupervisor !== 'ALL') {
        const repUser = users.find((u) => u.id === f.repId);
        if (!repUser || repUser.supervisorId !== selectedSupervisor) return false;
      }
      if (selectedRep !== 'ALL' && f.repId !== selectedRep) return false;
      return true;
    });

    // Customers in scope
    const scopedCustomers = customers.filter((c) => {
      if (selectedBranch !== 'ALL' && (!c.branchName || c.branchName !== selectedBranch)) return false;
      if (selectedSupervisor !== 'ALL') {
        const repUser = users.find((u) => u.id === c.repId || isArabicNameMatch(u.name, c.repName || c.salesRepName || ''));
        if (!repUser || repUser.supervisorId !== selectedSupervisor) return false;
      }
      if (selectedRep !== 'ALL') {
        const repUser = users.find((u) => u.id === selectedRep);
        if (c.repId !== selectedRep && (!repUser || !isArabicNameMatch(repUser.name, c.repName || c.salesRepName || ''))) {
          return false;
        }
      }
      return true;
    });

    return {
      targets: periodTargets,
      invoices: periodInvoices,
      visits: periodVisits,
      forecasts: periodForecasts,
      customers: scopedCustomers,
    };
  }, [
    visibleTargets,
    invoices,
    visits,
    forecasts,
    customers,
    users,
    selectedYear,
    selectedQuarter,
    selectedMonth,
    selectedBranch,
    selectedSupervisor,
    selectedRep,
  ]);

  // Aggregate Metrics & Executive Analysis
  const metrics = useMemo(() => {
    const { targets: tList, invoices: iList, visits: vList, forecasts: fList, customers: cList } = filteredData;

    // Targets & Actuals
    const salesTarget = tList.reduce((sum, t) => sum + safeNumber(t.salesTarget), 0);
    const salesAchieved = tList.reduce((sum, t) => sum + safeNumber(t.salesAchieved), 0);
    const salesRate = salesTarget > 0 ? Math.round((salesAchieved / salesTarget) * 100) : 0;

    const collectionTarget = tList.reduce((sum, t) => sum + safeNumber(t.collectionTarget), 0);
    const collectionAchieved = tList.reduce((sum, t) => sum + safeNumber(t.collectionAchieved), 0);
    const collectionRate = collectionTarget > 0 ? Math.round((collectionAchieved / collectionTarget) * 100) : 0;

    // Expected Collections (Forecast)
    // السطر الشهري المستقل (week_index = 0) بيتخزن في نفس جدول التوقعات
    // الأسبوعية، فلازم يتشال هنا — غير كده التوقع المتوقع بيتحسب مرتين
    // وربطة الدقة بتطلع غلط لأن المحقق بيقسم على رقم مضاعف.
    const forecastExpected = fList.reduce(
      (sum, f) => (
        isMonthForecast(f) || f.status !== 'submitted' && f.status !== 'approved'
          ? sum
          : sum + safeNumber(f.collectionForecast)
      ),
      0
    );
    const forecastNeedsAttention = fList.reduce(
      (sum, f) => (
        isMonthForecast(f) || f.status === 'submitted' || f.status === 'approved'
          ? sum
          : sum + safeNumber(f.collectionForecast)
      ),
      0
    );
    const forecastNeedsAttentionCount = fList.filter(
      (f) => !isMonthForecast(f) && f.status !== 'submitted' && f.status !== 'approved'
    ).length;

    // Customer coverage & financials
    let totalDues = 0;
    let customersWithDues = 0;
    let eligibleCount = 0;
    let dealtCount = 0;

    cList.forEach((c) => {
      const fin = calculateCustomerFinancials(c, 'ALL');
      if (fin.isEligible) eligibleCount++;
      if (fin.isDealtCustomer) dealtCount++;
      const customerDues = Math.max(0, resolveCustomerDuesValue(c));
      totalDues += customerDues;
      if (customerDues > 0) customersWithDues++;
    });

    const customerCoverageRate = eligibleCount > 0 ? Math.round((dealtCount / eligibleCount) * 100) : 0;

    // Field Visits Analysis
    const totalVisits = vList.length;
    const today = new Date();
    const todayISODate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const isVisitDueForExecution = (visit: typeof vList[number]) =>
      visit.status !== 'ملغاة' &&
      !(visit.status === 'مجدولة' && Boolean(visit.date) && visit.date > todayISODate);
    const executionScopeVisits = vList.filter(isVisitDueForExecution);
    const completedVisits = executionScopeVisits.filter((v) => v.status === 'منفذة' || Boolean(v.checkOutTime)).length;
    const visitsExecutionRate = executionScopeVisits.length > 0
      ? Math.round((completedVisits / executionScopeVisits.length) * 100)
      : 0;
    const visitsWithCollection = vList.filter((v) => safeNumber(v.collectedAmount) > 0).length;
    const directCollectedFromVisits = vList.reduce((sum, v) => sum + safeNumber(v.collectedAmount), 0);
    const returnVisits = vList.filter((v) => v.isReturn);
    const totalReturnsValue = returnVisits.reduce((sum, v) => sum + safeNumber(v.returnValue), 0);

    // Invoices breakdown
    const validInvoices = iList.filter((inv) => !isCanceledInv(inv.status));
    const deliveredInvoices = validInvoices.filter((inv) => inv.status === 'تم التسليم' || inv.status === 'إغلاق الطلبية');
    const pendingInvoices = validInvoices.filter((inv) =>
      inv.status === 'قيد مراجعة المشرف' || inv.status === 'معلقة بانتظار اعتماد الفرع' || inv.status === 'قيد المراجعة'
    );
    const deliveredSalesValue = deliveredInvoices.reduce(
      (sum, inv) => sum + safeNumber(inv.netAmountAfterReturns ?? inv.estimatedGrandTotal),
      0
    );

    // Monthly breakdown for Charts (12 Months)
    const monthlyTrend = MONTHS_NAMES_AR.map((monthName, idx) => {
      const mNum = idx + 1;
      const mTargets = tList.filter((t) => t.month === mNum);
      const sTarget = mTargets.reduce((sum, t) => sum + safeNumber(t.salesTarget), 0);
      const sAchieved = mTargets.reduce((sum, t) => sum + safeNumber(t.salesAchieved), 0);
      const cTarget = mTargets.reduce((sum, t) => sum + safeNumber(t.collectionTarget), 0);
      const cAchieved = mTargets.reduce((sum, t) => sum + safeNumber(t.collectionAchieved), 0);
      const mForecasts = fList.filter((forecast) => {
        if (isMonthForecast(forecast)) return false;
        const match = forecast.monthKey.match(/^\d{4}-(\d{1,2})$/);
        return match !== null && Number(match[1]) === mNum;
      });
      const forecastSubmitted = mForecasts
        .filter((forecast) => forecast.status === 'submitted' || forecast.status === 'approved')
        .reduce((sum, forecast) => sum + safeNumber(forecast.collectionForecast), 0);
      const forecastNeedsAttentionForMonth = mForecasts
        .filter((forecast) => forecast.status !== 'submitted' && forecast.status !== 'approved')
        .reduce((sum, forecast) => sum + safeNumber(forecast.collectionForecast), 0);

      const mVisits = vList.filter((v) => {
        if (!v.date) return false;
        const p = v.date.split('-');
        return p.length >= 2 && parseInt(p[1], 10) === mNum;
      });

      return {
        month: monthName,
        monthNum: mNum,
        'هدف البيع': sTarget,
        'المحقق بيع': sAchieved,
        'هدف التحصيل': cTarget,
        'المحقق تحصيل': cAchieved,
        'نسبة إنجاز البيع': sTarget > 0 ? Math.round((sAchieved / sTarget) * 100) : 0,
        'نسبة إنجاز التحصيل': cTarget > 0 ? Math.round((cAchieved / cTarget) * 100) : 0,
        'التوقع الأسبوعي المرسل/المعتمد': forecastSubmitted,
        'توقع أسبوعي يحتاج متابعة': forecastNeedsAttentionForMonth,
        visitsCount: mVisits.length,
      };
    }).filter((_, idx) => {
      const month = idx + 1;
      if (selectedMonth !== 'ALL' && month !== Number(selectedMonth)) return false;
      if (selectedQuarter === 'Q1') return month >= 1 && month <= 3;
      if (selectedQuarter === 'Q2') return month >= 4 && month <= 6;
      if (selectedQuarter === 'Q3') return month >= 7 && month <= 9;
      if (selectedQuarter === 'Q4') return month >= 10 && month <= 12;
      return true;
    });

    // Reps Performance Matrix
    const repMatrixMap = new Map<string, {
      repName: string;
      branch: string;
      supervisorName: string;
      salesTarget: number;
      salesAchieved: number;
      collectionTarget: number;
      collectionAchieved: number;
      visitsTotal: number;
      visitsCompleted: number;
      forecastExpected: number;
      activeCustomers: number;
    }>();

    tList.forEach((t) => {
      const repKey = `${t.branch || 'عام'}::${t.repName}`;
      const userObj = users.find((u) => isArabicNameMatch(u.name, t.repName));
      const supervisorObj = userObj?.supervisorId ? users.find((u) => u.id === userObj.supervisorId) : null;

      const row = repMatrixMap.get(repKey) || {
        repName: t.repName,
        branch: t.branch || 'عام',
        supervisorName: supervisorObj?.name || 'مشرف الفرع',
        salesTarget: 0,
        salesAchieved: 0,
        collectionTarget: 0,
        collectionAchieved: 0,
        visitsTotal: 0,
        visitsCompleted: 0,
        forecastExpected: 0,
        activeCustomers: 0,
      };

      row.salesTarget += safeNumber(t.salesTarget);
      row.salesAchieved += safeNumber(t.salesAchieved);
      row.collectionTarget += safeNumber(t.collectionTarget);
      row.collectionAchieved += safeNumber(t.collectionAchieved);
      repMatrixMap.set(repKey, row);
    });

    // Augment rep rows with visits and forecast
    vList.forEach((v) => {
      if (!isVisitDueForExecution(v)) return;
      const repKey = `${v.branchName || 'عام'}::${v.repName}`;
      const row = repMatrixMap.get(repKey);
      if (row) {
        row.visitsTotal += 1;
        if (v.status === 'منفذة' || Boolean(v.checkOutTime)) row.visitsCompleted += 1;
      }
    });

    fList.forEach((f) => {
      if (isMonthForecast(f) || f.status !== 'submitted' && f.status !== 'approved') return;
      const userObj = users.find((u) => u.id === f.repId);
      if (userObj) {
        const repKey = `${f.branchName || userObj.branchName || 'عام'}::${userObj.name}`;
        const row = repMatrixMap.get(repKey);
        if (row) {
          row.forecastExpected += safeNumber(f.collectionForecast);
        }
      }
    });

    const repMatrixList = Array.from(repMatrixMap.values()).map((r) => {
      const sRate = r.salesTarget > 0 ? Math.round((r.salesAchieved / r.salesTarget) * 100) : 0;
      const cRate = r.collectionTarget > 0 ? Math.round((r.collectionAchieved / r.collectionTarget) * 100) : 0;
      const vRate = r.visitsTotal > 0 ? Math.round((r.visitsCompleted / r.visitsTotal) * 100) : 0;
      return {
        ...r,
        salesRate: sRate,
        collectionRate: cRate,
        visitsRate: vRate,
      };
    });

    const matrixSearch = normalizeArabicText(searchQuery.trim());
    const filteredRepMatrixList = matrixSearch
      ? repMatrixList.filter((rep) =>
          normalizeArabicText(`${rep.repName} ${rep.branch} ${rep.supervisorName}`).includes(matrixSearch)
        )
      : repMatrixList;

    // Sorting rep rows
    filteredRepMatrixList.sort((a, b) => {
      if (sortBy === 'sales') return b.salesAchieved - a.salesAchieved;
      if (sortBy === 'collection') return b.collectionAchieved - a.collectionAchieved;
      if (sortBy === 'rate') return b.collectionRate - a.collectionRate;
      if (sortBy === 'visits') return b.visitsCompleted - a.visitsCompleted;
      return 0;
    });

    // Branch Benchmarking Breakdown
    const branchBreakdownMap = new Map<string, {
      branch: string;
      salesTarget: number;
      salesAchieved: number;
      collectionTarget: number;
      collectionAchieved: number;
      visitsCount: number;
      repsCount: number;
      customersCount: number;
    }>();

    tList.forEach((t) => {
      const b = t.branch || 'فرع رئيسي';
      const row = branchBreakdownMap.get(b) || {
        branch: b,
        salesTarget: 0,
        salesAchieved: 0,
        collectionTarget: 0,
        collectionAchieved: 0,
        visitsCount: 0,
        repsCount: 0,
        customersCount: 0,
      };
      row.salesTarget += safeNumber(t.salesTarget);
      row.salesAchieved += safeNumber(t.salesAchieved);
      row.collectionTarget += safeNumber(t.collectionTarget);
      row.collectionAchieved += safeNumber(t.collectionAchieved);
      branchBreakdownMap.set(b, row);
    });

    vList.forEach((v) => {
      const b = v.branchName || 'فرع رئيسي';
      const row = branchBreakdownMap.get(b);
      if (row) row.visitsCount += 1;
    });

    const branchBreakdownList = Array.from(branchBreakdownMap.values()).map((b) => {
      const sRate = b.salesTarget > 0 ? Math.round((b.salesAchieved / b.salesTarget) * 100) : 0;
      const cRate = b.collectionTarget > 0 ? Math.round((b.collectionAchieved / b.collectionTarget) * 100) : 0;
      return { ...b, salesRate: sRate, collectionRate: cRate };
    }).sort((a, b) => b.salesAchieved - a.salesAchieved);

    return {
      salesTarget,
      salesAchieved,
      salesRate,
      collectionTarget,
      collectionAchieved,
      collectionRate,
      forecastExpected,
      forecastNeedsAttention,
      forecastNeedsAttentionCount,
      eligibleCount,
      dealtCount,
      customerCoverageRate,
      totalDues,
      customersWithDues,
      totalVisits,
      executionScopeVisits: executionScopeVisits.length,
      completedVisits,
      visitsExecutionRate,
      visitsWithCollection,
      directCollectedFromVisits,
      returnVisitsCount: returnVisits.length,
      totalReturnsValue,
      validInvoicesCount: validInvoices.length,
      deliveredSalesValue,
      pendingInvoicesCount: pendingInvoices.length,
      monthlyTrend,
      repMatrixList: filteredRepMatrixList,
      branchBreakdownList,
    };
  }, [filteredData, users, sortBy, searchQuery, selectedMonth, selectedQuarter]);

  // Export Power BI Styled Report to Excel
  const handleExportPowerBIReport = () => {
    const wb = XLSX.utils.book_new();

    // 1. Executive Summary Sheet
    const summaryData = [
      ['تقرير لوحة الإدارة وPower BI التنفيذي - مجموعة الطنطاوي'],
      [`السنة: ${selectedYear}`, `الفترة: ${selectedPeriodLabel}`, `الفرع: ${selectedBranch}`],
      [''],
      ['المؤشر التنفيذي (KPI)', 'القيمة المحققة', 'الهدف المخطط', 'نسبة الإنجاز %', 'ملاحظات الأداء'],
      ['مبيعات الفترة المختارة', metrics.salesAchieved, metrics.salesTarget, `${metrics.salesRate}%`, metrics.salesRate >= 90 ? 'أداء ممتاز' : 'يحتاج متابعة'],
      ['تحصيل الفترة المختارة', metrics.collectionAchieved, metrics.collectionTarget, `${metrics.collectionRate}%`, metrics.collectionRate >= 90 ? 'تحصيل فائق' : 'متوسط'],
      ['التوقع الأسبوعي المرسل أو المعتمد', metrics.forecastExpected, '—', '—', 'توقع المندوب؛ لا يُجمع مع التوقع الشهري المستقل'],
      ['توقعات مسودة أو مطلوبة التعديل', metrics.forecastNeedsAttention, '—', '—', `${metrics.forecastNeedsAttentionCount} سجل؛ غير داخلة في إجمالي التوقع المرسل/المعتمد`],
      ['إجمالي المستحقات الحالية', metrics.totalDues, '—', '—', 'لقطة أرصدة حالية وليست رقمًا خاصًا بالفترة المختارة'],
      ['عدد العملاء ذوي المستحقات الحالية', metrics.customersWithDues, '—', '—', 'ضمن الفروع والمناديب المطابقين للفلاتر'],
      ['تغطية العملاء القابلين', metrics.dealtCount, metrics.eligibleCount, `${metrics.customerCoverageRate}%`, 'تغطية شبكة التوزيع'],
      ['الزيارات المنفذة', metrics.completedVisits, metrics.executionScopeVisits, `${metrics.visitsExecutionRate}%`, `من الزيارات المستحقة للتنفيذ؛ إجمالي السجلات: ${metrics.totalVisits}`],
      ['قيمة المبيعات المسلّمة من الفواتير المحمّلة', metrics.deliveredSalesValue, '—', '—', `مبنية على ${metrics.validInvoicesCount} فاتورة محمّلة؛ قد لا تشمل كامل سجل الفترة`],
      ['قيمة المرتجعات الميدانية', metrics.totalReturnsValue, '—', '—', `عدد ${metrics.returnVisitsCount} زيارة مرتجع`],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'المؤشرات التنفيذية');

    // 2. Reps Matrix Sheet
    const repHeader = [
      ['مصفوفة أداء المناديب والمشرفين'],
      ['اسم المندوب', 'الفرع', 'المشرف المباشر', 'هدف البيع', 'المحقق بيع', 'نسبة بيع %', 'هدف التحصيل', 'المحقق تحصيل', 'نسبة تحصيل %', 'الزيارات المنفذة المستحقة', 'زيارات مسجلة', 'التوقع الأسبوعي المرسل/المعتمد'],
    ];

    const repRows = metrics.repMatrixList.map((r) => [
      r.repName,
      r.branch,
      r.supervisorName,
      r.salesTarget,
      r.salesAchieved,
      `${r.salesRate}%`,
      r.collectionTarget,
      r.collectionAchieved,
      `${r.collectionRate}%`,
      r.visitsCompleted,
      r.visitsTotal,
      r.forecastExpected,
    ]);

    const wsReps = XLSX.utils.aoa_to_sheet([...repHeader, ...repRows]);
    XLSX.utils.book_append_sheet(wb, wsReps, 'مصفوفة أداء الفريق');

    // 3. Monthly Trends Sheet
    const monthHeader = [
      ['الاتجاه الشهري للمبيعات والتحصيلات'],
      ['الشهر', 'هدف البيع', 'المحقق بيع', 'نسبة البيع %', 'هدف التحصيل', 'المحقق تحصيل', 'نسبة التحصيل %', 'التوقع الأسبوعي المرسل/المعتمد', 'توقع أسبوعي يحتاج متابعة', 'عدد الزيارات'],
    ];

    const monthRows = metrics.monthlyTrend.map((m) => [
      m.month,
      m['هدف البيع'],
      m['المحقق بيع'],
      `${m['نسبة إنجاز البيع']}%`,
      m['هدف التحصيل'],
      m['المحقق تحصيل'],
      `${m['نسبة إنجاز التحصيل']}%`,
      m['التوقع الأسبوعي المرسل/المعتمد'],
      m['توقع أسبوعي يحتاج متابعة'],
      m.visitsCount,
    ]);

    const wsMonths = XLSX.utils.aoa_to_sheet([...monthHeader, ...monthRows]);
    XLSX.utils.book_append_sheet(wb, wsMonths, 'الاتجاه الشهري');

    XLSX.writeFile(wb, `PowerBI_Executive_Dashboard_${selectedYear}_${Date.now()}.xlsx`);
  };

  const chartConfig = chartMetric === 'sales'
    ? {
        title: 'المبيعات',
        targetKey: 'هدف البيع',
        actualKey: 'المحقق بيع',
        targetLabel: 'هدف البيع',
        actualLabel: 'المحقق بيع',
        targetValue: metrics.salesTarget,
        actualValue: metrics.salesAchieved,
        rate: metrics.salesRate,
        actualColor: '#059669',
      }
    : chartMetric === 'collection'
    ? {
        title: 'التحصيل',
        targetKey: 'هدف التحصيل',
        actualKey: 'المحقق تحصيل',
        targetLabel: 'هدف التحصيل',
        actualLabel: 'المحقق تحصيل',
        targetValue: metrics.collectionTarget,
        actualValue: metrics.collectionAchieved,
        rate: metrics.collectionRate,
        actualColor: '#0284c7',
      }
    : {
        title: 'التوقع الأسبوعي',
        targetKey: 'توقع أسبوعي يحتاج متابعة',
        actualKey: 'التوقع الأسبوعي المرسل/المعتمد',
        targetLabel: 'يحتاج متابعة',
        actualLabel: 'مرسل أو معتمد',
        targetValue: metrics.forecastNeedsAttention,
        actualValue: metrics.forecastExpected,
        rate: null,
        actualColor: '#7c3aed',
      };
  const chartHasData = metrics.monthlyTrend.some((month) =>
    safeNumber(month[chartConfig.targetKey as keyof typeof month]) > 0 ||
    safeNumber(month[chartConfig.actualKey as keyof typeof month]) > 0
  );
  const selectedPeriodLabel = [
    selectedQuarter !== 'ALL' ? selectedQuarter : null,
    selectedMonth !== 'ALL' ? MONTHS_NAMES_AR[Number(selectedMonth) - 1] : null,
  ].filter(Boolean).join(' · ') || 'السنة كاملة';
  const activeFilterLabels = [
    `${selectedYear}`,
    selectedPeriodLabel !== 'السنة كاملة' ? selectedPeriodLabel : null,
    selectedBranch !== 'ALL' ? selectedBranch : 'كل الفروع',
    selectedSupervisor !== 'ALL' ? users.find((user) => user.id === selectedSupervisor)?.name : null,
    selectedRep !== 'ALL' ? users.find((user) => user.id === selectedRep)?.name : null,
  ].filter((label): label is string => Boolean(label));

  return (
    <div className="space-y-5 print:space-y-3" dir="rtl">
      {/* ========================================================================= */}
      {/* 1. Header & Quick Slicers Bar (شريط التحكم والفلترة التفاعلي Power BI)     */}
      {/* ========================================================================= */}
      <section className="bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 text-white rounded-3xl p-5 shadow-lg border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>لوحة التحكم والتحليل التنفيذي Power BI 360°</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-300 text-xs font-bold">
                {isSuperAdmin ? '👑 الإدارة العليا' : isBranchMgr ? '🏢 مدير الفرع' : '👔 مشرف الفريق'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span>لوحة الإدارة والأداء</span>
              <span className="text-emerald-400 font-mono text-base font-bold">({selectedYear})</span>
            </h1>
            <p className="text-[11px] text-emerald-200 font-bold">
              الفترة: {selectedPeriodLabel}
              {selectedBranch !== 'ALL' ? ` · ${selectedBranch}` : ' · كل الفروع'}
            </p>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              التارجت والمحقق من شيت الأهداف، والتوقع الأسبوعي تقدير مستقل من المندوب، والزيارات من سجل الميدان.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 self-start lg:self-center flex-wrap">
            <button
              type="button"
              onClick={handleExportPowerBIReport}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>تصدير تقرير Power BI إلى Excel 📥</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedQuarter('ALL');
                setSelectedMonth('ALL');
                setSelectedBranch(isBranchMgr && currentUser?.branchName ? currentUser.branchName : isSupervisor && currentUser?.branchName ? currentUser.branchName : 'ALL');
                setSelectedSupervisor(isSupervisor ? currentUser.id : 'ALL');
                setSelectedRep('ALL');
                setSearchQuery('');
              }}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition flex items-center gap-1 border border-slate-700 cursor-pointer"
              title="إعادة ضبط كافة الفلاتر"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة ضبط</span>
            </button>
          </div>
        </div>

        {/* Dynamic Slicers Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          {/* Year Slicer */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-emerald-400" />
              <span>السنة المالية</span>
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full bg-slate-800/90 text-white border border-slate-700 rounded-xl px-2.5 py-1.5 font-black focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {availableYears.map((y) => (
                <option key={y} value={y} className="bg-slate-900 text-white">
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Quarter Slicer */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <Filter className="w-3 h-3 text-cyan-400" />
              <span>الربع السنوي</span>
            </label>
            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
              className="w-full bg-slate-800/90 text-white border border-slate-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">كامل السنة (الكل)</option>
              <option value="Q1" className="bg-slate-900 text-white">الربع الأول Q1 (يناير - مارس)</option>
              <option value="Q2" className="bg-slate-900 text-white">الربع الثاني Q2 (إبريل - يونيو)</option>
              <option value="Q3" className="bg-slate-900 text-white">الربع الثالث Q3 (يوليو - سبتمبر)</option>
              <option value="Q4" className="bg-slate-900 text-white">الربع الرابع Q4 (أكتوبر - ديسمبر)</option>
            </select>
          </div>

          {/* Month Slicer */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <CalendarCheck className="w-3 h-3 text-amber-400" />
              <span>الشهر</span>
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-slate-800/90 text-white border border-slate-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">كافة الأشهر</option>
              {MONTHS_NAMES_AR.map((m, idx) => (
                <option key={idx + 1} value={String(idx + 1)} className="bg-slate-900 text-white">
                  شهر {idx + 1} - {m}
                </option>
              ))}
            </select>
          </div>

          {/* Branch Slicer */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-indigo-400" />
              <span>الفرع</span>
            </label>
            <select
              value={selectedBranch}
              disabled={isBranchMgr || isSupervisor}
              onChange={(e) => {
                const nextBranch = e.target.value;
                setSelectedBranch(nextBranch);
                const selectedSupervisorUser = users.find((user) => user.id === selectedSupervisor);
                const selectedRepUser = users.find((user) => user.id === selectedRep);
                const supervisorStillMatchesBranch =
                  !selectedSupervisorUser ||
                  nextBranch === 'ALL' ||
                  !selectedSupervisorUser.branchName ||
                  selectedSupervisorUser.branchName === nextBranch;
                const repStillMatchesBranch =
                  !selectedRepUser ||
                  nextBranch === 'ALL' ||
                  !selectedRepUser.branchName ||
                  selectedRepUser.branchName === nextBranch;
                if (!supervisorStillMatchesBranch) setSelectedSupervisor('ALL');
                if (!repStillMatchesBranch) setSelectedRep('ALL');
              }}
              className="w-full bg-slate-800/90 text-white border border-slate-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-indigo-500 disabled:opacity-60 cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">كافة الفروع</option>
              {branchList.map((b) => (
                <option key={b} value={b} className="bg-slate-900 text-white">
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Supervisor Slicer */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-purple-400" />
              <span>مشرف الفريق</span>
            </label>
            <select
              value={selectedSupervisor}
              disabled={isSupervisor}
              onChange={(e) => {
                const nextSupervisor = e.target.value;
                setSelectedSupervisor(nextSupervisor);
                const selectedRepUser = users.find((user) => user.id === selectedRep);
                if (selectedRepUser && nextSupervisor !== 'ALL' && selectedRepUser.supervisorId !== nextSupervisor) {
                  setSelectedRep('ALL');
                }
              }}
              className="w-full bg-slate-800/90 text-white border border-slate-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-purple-500 disabled:opacity-60 cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">كافة المشرفين</option>
              {supervisorList.map((sup) => (
                <option key={sup.id} value={sup.id} className="bg-slate-900 text-white">
                  {sup.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sales Rep Slicer */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
              <Users className="w-3 h-3 text-rose-400" />
              <span>المندوب الميداني</span>
            </label>
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="w-full bg-slate-800/90 text-white border border-slate-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">كافة المناديب</option>
              {repList.map((rep) => (
                <option key={rep.id} value={rep.id} className="bg-slate-900 text-white">
                  {rep.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400">الفلاتر المطبقة معًا:</span>
            {activeFilterLabels.map((label, index) => (
              <span key={`${label}-${index}`} className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-200">
                {label}
              </span>
            ))}
          </div>
          <span className="text-[10px] font-bold text-slate-400">
            {filteredData.targets.length.toLocaleString('ar-EG')} هدف · {filteredData.forecasts.length.toLocaleString('ar-EG')} توقع · {filteredData.visits.length.toLocaleString('ar-EG')} زيارة
          </span>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. Executive 7-KPI Power BI Control Cards (بطاقات المؤشرات القيادية)       */}
      {/* ========================================================================= */}
      <section className="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 gap-2 sm:gap-3">
        {/* KPI 1: Sales Target vs Achieved */}
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between hover:shadow-md transition">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
              <span>تحقيق البيع</span>
              <span className="p-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Target className="w-4 h-4" />
              </span>
            </div>
            <div className="font-mono font-black text-base sm:text-lg text-emerald-800 truncate" title={formatCurrency(metrics.salesAchieved)}>
              {formatCurrency(metrics.salesAchieved)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              الهدف: <span className="font-mono">{formatCurrency(metrics.salesTarget)}</span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] font-black mb-1">
              <span className="text-slate-600">نسبة التحقيق</span>
              <span className={metrics.salesRate >= 90 ? 'text-emerald-700' : metrics.salesRate >= 60 ? 'text-amber-700' : 'text-rose-700'}>
                {metrics.salesRate}%
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  metrics.salesRate >= 90 ? 'bg-emerald-500' : metrics.salesRate >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, metrics.salesRate)}%` }}
              />
            </div>
          </div>
        </article>

        {/* KPI 2: Collection Target vs Achieved */}
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between hover:shadow-md transition">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
              <span>تحقيق التحصيل</span>
              <span className="p-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                <Receipt className="w-4 h-4" />
              </span>
            </div>
            <div className="font-mono font-black text-base sm:text-lg text-blue-800 truncate" title={formatCurrency(metrics.collectionAchieved)}>
              {formatCurrency(metrics.collectionAchieved)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              الهدف: <span className="font-mono">{formatCurrency(metrics.collectionTarget)}</span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] font-black mb-1">
              <span className="text-slate-600">نسبة التحصيل</span>
              <span className={metrics.collectionRate >= 90 ? 'text-blue-700' : metrics.collectionRate >= 60 ? 'text-amber-700' : 'text-rose-700'}>
                {metrics.collectionRate}%
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  metrics.collectionRate >= 90 ? 'bg-blue-600' : metrics.collectionRate >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, metrics.collectionRate)}%` }}
              />
            </div>
          </div>
        </article>

        {/* KPI 3: Weekly rep forecast, kept separate from targets and actuals */}
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between hover:shadow-md transition">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
              <span>التوقع الأسبوعي</span>
              <span className="p-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
                <TrendingUp className="w-4 h-4" />
              </span>
            </div>
            <div className="font-mono font-black text-base sm:text-lg text-purple-900 truncate" title={formatCurrency(metrics.forecastExpected)}>
              {formatCurrency(metrics.forecastExpected)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium leading-relaxed">
              المُرسل للمشرف أو المعتمد فقط؛ المسودات وطلبات التعديل مستبعدة
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100">
            <div className="text-[10px] text-purple-800 font-bold">
              مسودة/مطلوب تعديله: {formatCurrency(metrics.forecastNeedsAttention)} · {metrics.forecastNeedsAttentionCount.toLocaleString('ar-EG')} سجل
            </div>
          </div>
        </article>

        {/* KPI 4: Current customer receivables (snapshot, not a period target) */}
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between hover:shadow-md transition">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
              <span>مستحقات العملاء الحالية</span>
              <span className="p-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                <Wallet className="w-4 h-4" />
              </span>
            </div>
            <div className="font-mono font-black text-base sm:text-lg text-amber-900 truncate" title={formatCurrency(metrics.totalDues)}>
              {formatCurrency(metrics.totalDues)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              على {metrics.customersWithDues.toLocaleString('ar-EG')} عميل ضمن النطاق
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100">
            <div className="text-[10px] text-slate-500 font-bold">رصيد حالي؛ ليس إنجازًا لفترة التارجت المختارة</div>
          </div>
        </article>

        {/* KPI 5: Customer Coverage */}
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between hover:shadow-md transition">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
              <span>تغطية العملاء</span>
              <span className="p-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Users className="w-4 h-4" />
              </span>
            </div>
            <div className="font-mono font-black text-base sm:text-lg text-indigo-900">
              {metrics.customerCoverageRate}%
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {metrics.dealtCount} متعامل من {metrics.eligibleCount} قابل
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100">
            <div className="text-[10px] text-slate-500 font-bold">
              تنشيط شبكة العملاء
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${Math.min(100, metrics.customerCoverageRate)}%` }}
              />
            </div>
          </div>
        </article>

        {/* KPI 6: Field Visits Execution */}
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between hover:shadow-md transition">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
              <span>الزيارات الميدانية</span>
              <span className="p-1 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200">
                <CalendarCheck className="w-4 h-4" />
              </span>
            </div>
            <div className="font-mono font-black text-base sm:text-lg text-cyan-900">
              {metrics.completedVisits.toLocaleString('ar-EG')}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              من {metrics.executionScopeVisits.toLocaleString('ar-EG')} مستحقة التنفيذ
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] font-black mb-1">
              <span className="text-slate-600">نسبة التنفيذ</span>
              <span className="text-cyan-700">{metrics.visitsExecutionRate}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-600 transition-all"
                style={{ width: `${Math.min(100, metrics.visitsExecutionRate)}%` }}
              />
            </div>
          </div>
        </article>

        {/* KPI 7: Delivered Sales & Net Logistics */}
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3.5 shadow-xs flex flex-col justify-between hover:shadow-md transition">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
              <span>الفواتير المسلّمة (المحمّلة)</span>
              <span className="p-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                <FileText className="w-4 h-4" />
              </span>
            </div>
            <div className="font-mono font-black text-base sm:text-lg text-rose-900 truncate" title={formatCurrency(metrics.deliveredSalesValue)}>
              {formatCurrency(metrics.deliveredSalesValue)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              مرتجعات: <span className="font-mono text-rose-600">{formatCurrency(metrics.totalReturnsValue)}</span>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100">
            <div className="text-[10px] text-slate-500 font-bold">
              {metrics.pendingInvoicesCount} طلبية بانتظار الاعتماد ضمن الفواتير المحمّلة
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1">
              <div className="h-full rounded-full bg-rose-500" style={{ width: '100%' }} />
            </div>
          </div>
        </article>
      </section>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] sm:text-[11px] font-bold text-slate-600">
        <span className="flex items-center gap-1.5"><i aria-hidden="true" className="w-2 h-2 rounded-full bg-emerald-600" />التارجت والمحقق: شيت الأهداف</span>
        <span className="flex items-center gap-1.5"><i aria-hidden="true" className="w-2 h-2 rounded-full bg-purple-600" />التوقع الأسبوعي: إدخال المندوب، وليس محققًا</span>
        <span className="flex items-center gap-1.5"><i aria-hidden="true" className="w-2 h-2 rounded-full bg-cyan-600" />الزيارات: سجل الزيارات الميدانية</span>
      </div>

      {/* ========================================================================= */}
      {/* 3. Sub-Tab Switcher (نوافذ التحليل المتقدم في الداشبورد)                     */}
      {/* ========================================================================= */}
      <div role="tablist" aria-label="أقسام لوحة الإدارة" className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-2xl text-xs font-black overflow-x-auto shadow-inner snap-x">
        <button
          type="button"
          onClick={() => setActiveSubTab('overview')}
          role="tab"
          aria-selected={activeSubTab === 'overview'}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeSubTab === 'overview'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          <span className="hidden sm:inline">المخططات والاتجاه الشهري</span>
          <span className="sm:hidden">نظرة عامة</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('matrix')}
          role="tab"
          aria-selected={activeSubTab === 'matrix'}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeSubTab === 'matrix'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Award className="w-4 h-4 text-indigo-600" />
          <span className="hidden sm:inline">ترتيب وأداء الفريق ({metrics.repMatrixList.length})</span>
          <span className="sm:hidden">الفريق ({metrics.repMatrixList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('branches')}
          role="tab"
          aria-selected={activeSubTab === 'branches'}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeSubTab === 'branches'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4 text-purple-600" />
          <span className="hidden sm:inline">مقارنة الفروع ({metrics.branchBreakdownList.length})</span>
          <span className="sm:hidden">الفروع ({metrics.branchBreakdownList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('visits_audit')}
          role="tab"
          aria-selected={activeSubTab === 'visits_audit'}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeSubTab === 'visits_audit'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CalendarCheck className="w-4 h-4 text-cyan-600" />
          <span className="hidden sm:inline">تدقيق الزيارات الميدانية ({metrics.totalVisits})</span>
          <span className="sm:hidden">الزيارات ({metrics.totalVisits})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 4. Tab 1: Overview & Interactive Charts (المخططات البيانية المتقدمة)        */}
      {/* ========================================================================= */}
      {activeSubTab === 'overview' && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1.2fr)]">
          {/* Main Monthly Comparison Chart */}
          <article className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${
                  chartMetric === 'sales' ? 'bg-emerald-100 text-emerald-800' : chartMetric === 'collection' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'
                }`}>
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    تحليل {chartConfig.title} · {selectedYear}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {selectedPeriodLabel} · مقارنة شهرية حسب الفلاتر المحددة · الأرقام بالجنيه المصري
                  </p>
                </div>
              </div>
              <div role="group" aria-label="اختيار مؤشر الرسم البياني" className="flex w-full sm:w-fit rounded-xl bg-slate-100 p-1 gap-1">
                {([
                  ['sales', 'المبيعات'],
                  ['collection', 'التحصيل'],
                  ['forecast', 'التوقع الأسبوعي'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setChartMetric(value)}
                    aria-pressed={chartMetric === value}
                    className={`flex-1 sm:flex-none rounded-lg px-3 py-2 text-[11px] font-black transition ${
                      chartMetric === value
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 min-w-0">
                <div className="text-[10px] font-bold text-slate-500">{chartConfig.targetLabel}</div>
                <div className="mt-1 font-mono text-sm sm:text-base font-black text-slate-800 truncate" title={formatCurrency(chartConfig.targetValue)}>
                  {formatCurrency(chartConfig.targetValue)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-3 min-w-0" style={{ backgroundColor: `${chartConfig.actualColor}0D` }}>
                <div className="text-[10px] font-bold text-slate-500">{chartConfig.actualLabel}</div>
                <div className="mt-1 font-mono text-sm sm:text-base font-black truncate" style={{ color: chartConfig.actualColor }} title={formatCurrency(chartConfig.actualValue)}>
                  {formatCurrency(chartConfig.actualValue)}
                </div>
              </div>
            </div>

            <div className="relative h-64 sm:h-80 w-full" dir="ltr">
              {chartHasData ? (
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <BarChart data={metrics.monthlyTrend} margin={{ top: 16, right: 8, left: 0, bottom: 4 }} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="month" interval="preserveStartEnd" minTickGap={8} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} />
                    <YAxis width={48} tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={(val) => `${(val / 1000).toLocaleString('en-US')}k`} />
                    <Tooltip
                      formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
                      labelStyle={{ color: '#cbd5e1', fontWeight: 700, marginBottom: 5 }}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '14px', color: '#fff', fontSize: '12px', boxShadow: '0 12px 30px rgba(15,23,42,.24)' }}
                      cursor={{ fill: '#f1f5f9' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }} />
                    <Bar dataKey={chartConfig.targetKey} name={chartConfig.targetLabel} fill={chartMetric === 'forecast' ? '#fbbf24' : '#cbd5e1'} radius={[6, 6, 0, 0]} maxBarSize={34} />
                    <Bar dataKey={chartConfig.actualKey} name={chartConfig.actualLabel} fill={chartConfig.actualColor} radius={[6, 6, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 text-center">
                  <BarChart3 className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-xs font-black text-slate-500">لا توجد بيانات لهذا المؤشر ضمن الفلاتر الحالية</p>
                  <p className="text-[10px] text-slate-400 mt-1">غيّر الفترة أو الفرع أو المندوب لعرض النتائج</p>
                </div>
              )}
            </div>
            {chartConfig.rate !== null && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white">
                <span className="text-[11px] font-bold text-slate-300">نسبة تحقيق {chartConfig.title}</span>
                <span className="font-mono text-lg font-black" style={{ color: chartConfig.actualColor }}>{chartConfig.rate}%</span>
              </div>
            )}
          </article>

          {/* Side Monthly Efficiency Trend Chart */}
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    منحنى كفاءة التحصيل وإنجاز التارجت (%)
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">تطور نسب الإنجاز عبر الشهور</p>
                </div>
              </div>

              <div className="h-64 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <AreaChart data={metrics.monthlyTrend} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSalesRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorColRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={[0, 'auto']} tickFormatter={(value) => `${value}%`} />
                    <Tooltip
                      formatter={(value, name) => [`${Number(value)}%`, String(name)]}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                    />
                    <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'الهدف 100%', fill: '#b45309', fontSize: 10, position: 'insideTopRight' }} />
                    <Area type="monotone" dataKey="نسبة إنجاز البيع" stroke="#059669" fillOpacity={1} fill="url(#colorSalesRate)" strokeWidth={3} activeDot={{ r: 5, strokeWidth: 2 }} />
                    <Area type="monotone" dataKey="نسبة إنجاز التحصيل" stroke="#0284c7" fillOpacity={1} fill="url(#colorColRate)" strokeWidth={3} activeDot={{ r: 5, strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quick Summary Box */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
              <div className="font-black flex items-center gap-1.5 text-amber-950">
                <Zap className="w-4 h-4 text-amber-600" />
                <span>ملاحظة التحليل التنفيذي:</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                نسبة تحقيق هدف التحصيل للفترة المختارة <strong className="font-black">{metrics.collectionRate}%</strong>،
                مع تدفق نقدي مباشر من الزيارات الميدانية بقيمة <strong className="font-black">{formatCurrency(metrics.directCollectedFromVisits)}</strong>.
              </p>
            </div>
          </article>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 5. Tab 2: Reps & Supervisors Performance Matrix (مصفوفة ترتيب الفريق)       */}
      {/* ========================================================================= */}
      {activeSubTab === 'matrix' && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-900">مصفوفة أداء المناديب والمشرفين (Power BI Matrix)</h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  الفرز حسب المؤشر المحدد. التوقع الأسبوعي المعروض للطلبات المرسلة أو المعتمدة فقط.
                </p>
              </div>
            </div>

            {/* Sort Controls & Search */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <input
                  type="text"
                  placeholder="بحث بالمصفوفة: مندوب أو فرع..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-48 sm:w-56 text-xs bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 pl-8 focus:outline-none focus:border-indigo-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>

              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs">
                <span className="text-[11px] font-bold text-slate-500 px-1">فرز حسب:</span>
                <button
                  type="button"
                  onClick={() => setSortBy('sales')}
                  className={`px-2 py-1 rounded-lg font-black transition cursor-pointer ${
                    sortBy === 'sales' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  البيع
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('collection')}
                  className={`px-2 py-1 rounded-lg font-black transition cursor-pointer ${
                    sortBy === 'collection' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  التحصيل
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('rate')}
                  className={`px-2 py-1 rounded-lg font-black transition cursor-pointer ${
                    sortBy === 'rate' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  نسبة التحصيل
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('visits')}
                  className={`px-2 py-1 rounded-lg font-black transition cursor-pointer ${
                    sortBy === 'visits' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الزيارات
                </button>
              </div>
            </div>
          </div>

          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
            {metrics.repMatrixList.map((r, index) => (
              <article key={`mobile-${r.branch}::${r.repName}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-black">
                        {index + 1}
                      </span>
                      <h4 className="font-black text-sm text-slate-900 truncate">{r.repName}</h4>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 truncate">{r.branch} · {r.supervisorName}</p>
                  </div>
                  <span className="shrink-0 px-2 py-1 rounded-lg text-xs font-black bg-blue-100 text-blue-800">
                    تحصيل {r.collectionRate}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-lg bg-emerald-50 p-2 min-w-0">
                    <div className="text-[10px] font-bold text-emerald-800">المبيعات المحققة</div>
                    <div className="font-mono text-xs font-black text-emerald-950 truncate" title={formatCurrency(r.salesAchieved)}>
                      {formatCurrency(r.salesAchieved)}
                    </div>
                    <div className="text-[10px] text-slate-500">من {formatCurrency(r.salesTarget)} · {r.salesRate}%</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-2 min-w-0">
                    <div className="text-[10px] font-bold text-blue-800">التحصيل المحقق</div>
                    <div className="font-mono text-xs font-black text-blue-950 truncate" title={formatCurrency(r.collectionAchieved)}>
                      {formatCurrency(r.collectionAchieved)}
                    </div>
                    <div className="text-[10px] text-slate-500">من {formatCurrency(r.collectionTarget)} · {r.collectionRate}%</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600">
                  <span>الزيارات المنفذة: <b className="text-cyan-800">{r.visitsCompleted} / {r.visitsTotal}</b></span>
                  <span>توقع أسبوعي: <b className="text-purple-800">{formatCurrency(r.forecastExpected)}</b></span>
                </div>
              </article>
            ))}
            {metrics.repMatrixList.length === 0 && (
              <p className="col-span-full p-6 text-center text-slate-400 font-bold text-xs">لا توجد بيانات مطابقة للفلاتر المحددة حالياً.</p>
            )}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                  <th className="p-3 text-center w-12">#</th>
                  <th className="p-3">المندوب</th>
                  <th className="p-3">الفرع</th>
                  <th className="p-3">المشرف المباشر</th>
                  <th className="p-3 text-emerald-800">هدف البيع</th>
                  <th className="p-3 text-emerald-900">المحقق بيع</th>
                  <th className="p-3 text-center">نسبة البيع</th>
                  <th className="p-3 text-blue-800">هدف التحصيل</th>
                  <th className="p-3 text-blue-900">المحقق تحصيل</th>
                  <th className="p-3 text-center">نسبة التحصيل</th>
                  <th className="p-3 text-center">الزيارات المنفذة</th>
                  <th className="p-3 text-center">التوقع الأسبوعي المرسل/المعتمد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.repMatrixList.map((r, index) => {
                  const rankBadge =
                    index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;

                  return (
                    <tr key={`${r.branch}::${r.repName}`} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-500 font-mono text-sm">
                        {rankBadge}
                      </td>
                      <td className="p-3 font-black text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{r.repName}</span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 font-medium">{r.branch}</td>
                      <td className="p-3 text-slate-600 font-medium">{r.supervisorName}</td>
                      <td className="p-3 font-mono text-slate-500">{formatCurrency(r.salesTarget)}</td>
                      <td className="p-3 font-mono font-black text-emerald-700">
                        {formatCurrency(r.salesAchieved)}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full font-black text-[11px] inline-block ${
                            r.salesRate >= 90
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : r.salesRate >= 60
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {r.salesRate}%
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-500">{formatCurrency(r.collectionTarget)}</td>
                      <td className="p-3 font-mono font-black text-blue-700">
                        {formatCurrency(r.collectionAchieved)}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full font-black text-[11px] inline-block ${
                            r.collectionRate >= 90
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : r.collectionRate >= 60
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {r.collectionRate}%
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono">
                        <span className="font-bold text-slate-800">{r.visitsCompleted}</span>
                        <span className="text-slate-400 text-[10px]"> / {r.visitsTotal}</span>
                        <span className="block text-[10px] text-cyan-700 font-bold">{r.visitsRate}%</span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-purple-800">
                        {formatCurrency(r.forecastExpected)}
                      </td>
                    </tr>
                  );
                })}
                {metrics.repMatrixList.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-slate-400 font-bold">
                      لا توجد بيانات مطابقة للفلاتر المحددة حالياً.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 6. Tab 3: Branch Benchmarking & Geographic Analysis (مقارنة الفروع)        */}
      {/* ========================================================================= */}
      {activeSubTab === 'branches' && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {metrics.branchBreakdownList.map((b) => (
              <article key={b.branch} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 hover:shadow-md transition">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-black">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-black text-sm text-slate-900">{b.branch}</h4>
                      <p className="text-[11px] text-slate-500">{b.visitsCount} زيارة مسجلة</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                    b.salesRate >= 90 ? 'bg-emerald-100 text-emerald-800' : b.salesRate >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    تحقيق: {b.salesRate}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10.5px] text-slate-500 font-bold block">مبيعات المحقق:</span>
                    <span className="font-mono font-black text-sm text-emerald-800">
                      {formatCurrency(b.salesAchieved)}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      هدف: {formatCurrency(b.salesTarget)}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10.5px] text-slate-500 font-bold block">تحصيلات المحقق:</span>
                    <span className="font-mono font-black text-sm text-blue-800">
                      {formatCurrency(b.collectionAchieved)}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      هدف: {formatCurrency(b.collectionTarget)}
                    </span>
                  </div>
                </div>

                <div className="pt-1">
                  <div className="flex items-center justify-between text-[11px] font-black mb-1">
                    <span className="text-slate-600">نسبة التحصيل للهدف:</span>
                    <span className="text-blue-700">{b.collectionRate}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, b.collectionRate)}%` }} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 7. Tab 4: Field Visits & Supervisor Audit (تدقيق الميدان والزيارات)        */}
      {/* ========================================================================= */}
      {activeSubTab === 'visits_audit' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-black">
                <CalendarCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-900">
                  لوحة رقابة وتدقيق الزيارات الميدانية للمشرفين
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  متابعة دقيقة لخطوط السير، المبالغ المحصلة ميدانياً، إفادات العملاء، ومراجعة المرتجعات
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateToTab('visits')}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs transition flex items-center gap-1 cursor-pointer self-start sm:self-auto"
            >
              <span>فتح لوحة الزيارات الميدانية الكاملة</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Visits KPI Mini Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 block">إجمالي الزيارات</span>
              <span className="font-mono text-lg font-black text-slate-900">{metrics.totalVisits}</span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[11px] font-bold text-emerald-700 block">الزيارات المنفذة</span>
              <span className="font-mono text-lg font-black text-emerald-800">{metrics.completedVisits}</span>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <span className="text-[11px] font-bold text-blue-700 block">المحصل مباشرة بالميدان</span>
              <span className="font-mono text-lg font-black text-blue-800">{formatCurrency(metrics.directCollectedFromVisits)}</span>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
              <span className="text-[11px] font-bold text-rose-700 block">مرتجعات مسجلة</span>
              <span className="font-mono text-lg font-black text-rose-800">{formatCurrency(metrics.totalReturnsValue)}</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                سجلات الزيارات الميدانية وملاحظات العملاء مؤمنة ومحفوظة بالكامل، ومزودة بزر الأرشفة والاسترجاع باسم المندوب والتاريخ والإفادة.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab('all_customers')}
              className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-black hover:bg-slate-100 transition cursor-pointer shrink-0"
            >
              عرض أرشيف العملاء 👥
            </button>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 8. Quick Navigation Hub to Sister Modules (روابط الوصول السريع المباشرة)   */}
      {/* ========================================================================= */}
      <section className="border-t border-slate-200 pt-4">
        <h2 className="mb-2.5 text-xs font-black text-slate-600">
          الانتقال المباشر لأقسام المنظومة التشغيلية والمالية:
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => onNavigateToTab('targets')}
            className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white hover:border-emerald-500 hover:bg-emerald-50/50 transition cursor-pointer group shadow-2xs"
          >
            <div className="flex items-center gap-2 text-right">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black group-hover:scale-110 transition">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <span className="font-black text-xs text-slate-900 block">تارجت المبيعات والتحصيل</span>
                <span className="text-[10px] text-slate-500">الأهداف والمحقق والفجوة</span>
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 transition" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateToTab('forecast')}
            className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white hover:border-purple-500 hover:bg-purple-50/50 transition cursor-pointer group shadow-2xs"
          >
            <div className="flex items-center gap-2 text-right">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-black group-hover:scale-110 transition">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <span className="font-black text-xs text-slate-900 block">توقع التحصيلات الأسبوعية</span>
                <span className="text-[10px] text-slate-500">مخطط التدفق النقدي W1-W5</span>
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-purple-700 transition" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateToTab('visits')}
            className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white hover:border-cyan-500 hover:bg-cyan-50/50 transition cursor-pointer group shadow-2xs"
          >
            <div className="flex items-center gap-2 text-right">
              <div className="w-8 h-8 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-black group-hover:scale-110 transition">
                <CalendarCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="font-black text-xs text-slate-900 block">زيارات العملاء والميدان</span>
                <span className="text-[10px] text-slate-500">خطوط السير والتحصيل الميداني</span>
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-700 transition" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateToTab('all_customers')}
            className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white hover:border-blue-500 hover:bg-blue-50/50 transition cursor-pointer group shadow-2xs"
          >
            <div className="flex items-center gap-2 text-right">
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black group-hover:scale-110 transition">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className="font-black text-xs text-slate-900 block">كافة العملاء والتحليل</span>
                <span className="text-[10px] text-slate-500">سجل الزيارات وملاحظات الحساب</span>
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-700 transition" />
          </button>
        </div>
      </section>
    </div>
  );
};
