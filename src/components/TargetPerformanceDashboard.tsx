import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Layers,
  PieChart,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Upload,
  User,
  Users,
  Wallet,
  X
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useApp } from '../context/AppContext';
import { isArabicNameMatch, normalizeArabicText } from '../services/arabicMatchingService';
import {
  ARABIC_MONTHS,
  downloadTargetTemplateExcel,
  formatEGP,
  QUARTER_LABELS
} from '../services/targetService';
import { TargetQuarter, TargetRecord } from '../types';
import { getPublishedDataSources } from '../services/dataSourceService';

export const TargetPerformanceDashboard: React.FC = () => {
  const {
    currentUser,
    users,
    targets,
    getVisibleTargets,
    importTargetsFromExcel,
    exportTargetsReport,
    resetTargetsToDefault,
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
  const [selectedRep, setSelectedRep] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [powerBiUrl] = useState(() => getPublishedDataSources().targets);

  // Admin tabs: overview | quarters | table
  const [adminTab, setAdminTab] = useState<'overview' | 'quarters' | 'table'>('overview');

  // Excel Upload Modal State (Admin / Dev only)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // User-visible records based on strict RBAC
  const visibleRecords = getVisibleTargets();

  // Distinct branches and reps available to this user
  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    visibleRecords.forEach((r) => {
      if (r.branch) set.add(r.branch);
    });
    return Array.from(set);
  }, [visibleRecords]);

  // Distinct reps available to this user
  const availableReps = useMemo(() => {
    const set = new Set<string>();
    visibleRecords.forEach((r) => {
      if (r.repName) set.add(r.repName);
    });
    return Array.from(set);
  }, [visibleRecords]);

  // Supervised reps for supervisor
  const supervisedReps = useMemo(() => {
    if (!isSupervisor || !currentUser) return [];
    const directSupervised = users.filter((u) => u.supervisorId === currentUser.id);
    const directNames = new Set(directSupervised.map((u) => normalizeArabicText(u.name)));

    return availableReps.filter((rName) => {
      // Exclude supervisor's own name from team list
      if (isArabicNameMatch(rName, currentUser.name)) return false;
      if (directNames.size > 0) {
        return Array.from(directNames).some((sn) => isArabicNameMatch(rName, sn) || normalizeArabicText(rName).includes(sn));
      }
      return true;
    });
  }, [isSupervisor, currentUser, users, availableReps]);

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
      if (isAdminOrDev && selectedBranch !== 'ALL' && r.branch !== selectedBranch) return false;

      // 4. Rep filter
      if (!isSalesRep && selectedRep !== 'ALL' && r.repName !== selectedRep) return false;

      // 5. Search query (Admin only)
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
      totalCollectionAchieved += r.collectionAchieved || 0;
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
          buckets[m].collectionAchieved += r.collectionAchieved || 0;
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
          qData[r.quarter].collectionAchieved += r.collectionAchieved || 0;
        }
      });

      return Object.values(qData);
    }
  }, [periodMode, filteredRecords]);

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
    if (percent >= 100) return 'bg-emerald-500/20 text-emerald-700 border-emerald-300';
    if (percent >= 80) return 'bg-amber-500/20 text-amber-700 border-amber-300';
    return 'bg-rose-500/20 text-rose-700 border-rose-300';
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-slate-900 text-white rounded-3xl p-4 sm:p-6 shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20 shrink-0">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {isSalesRep
                    ? 'هدفي وتارجت المبيعات والتحصيل 🎯'
                    : isSupervisor
                    ? 'أهداف ومحققات المبيعات والتحصيل (المشرف) 🎯'
                    : isBranchManager
                    ? `أهداف وتارجت ${currentUser?.branchName || 'الفرع'} 🏢`
                    : 'لوحة أهداف المبيعات والتحصيل الشاملة (Power BI) 📊'}
                </h1>
                <span className="bg-amber-400 text-slate-950 text-[11px] font-black px-2.5 py-0.5 rounded-full">
                  2026
                </span>
              </div>

              {/* Strict Privacy Indicator */}
              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                {isSalesRep ? (
                  <span className="font-bold text-emerald-300">
                    🔒 سرية تامة: معروضة أرقامك الشخصية فقط ({currentUser?.name})
                  </span>
                ) : isSupervisor ? (
                  <span className="font-bold text-blue-300">
                    👥 سرية الفرع: معروضة أرقامك الشخصية ومناديب فريقك فقط في {currentUser?.branchName}
                  </span>
                ) : isBranchManager ? (
                  <span className="font-bold text-purple-300">
                    🏢 إدارة الفرع: معروضة فقط أرقام مناديب {currentUser?.branchName}
                  </span>
                ) : (
                  <span className="font-bold text-amber-300">
                    👑 الإدارة والمطور: رؤية كاملة لجميع الفروع مع صلاحيات رفع وتحديث الشيتات
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons - EXCLUSIVELY for Admin & Developer */}
          {isAdminOrDev && (
            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs transition shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="رفع شيت الأهداف اليومي إكسل"
              >
                <Upload className="w-4 h-4" />
                <span>رفع شيت التارجت (Excel)</span>
              </button>

              <button
                onClick={downloadTargetTemplateExcel}
                className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold px-3 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
                title="تحميل قالب شيت الإكسل النموذجي"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>تحميل القالب</span>
              </button>

              <button
                onClick={exportTargetsReport}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3.5 py-2 rounded-xl text-xs transition shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="تصدير الأهداف والتقارير إلى إكسل"
              >
                <Download className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>

              <button
                onClick={() => {
                  if (window.confirm('هل تريد مسح بيانات الشيت بالكامل لرفع شيت جديد؟')) {
                    resetTargetsToDefault();
                  }
                }}
                className="bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-700/50 p-2 rounded-xl transition cursor-pointer"
                title="مسح بيانات الشيت"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* EMPTY STATE (No real data uploaded yet) */}
      {visibleRecords.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 text-center shadow-xs max-w-2xl mx-auto space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto shadow-inner">
            <Target className="w-8 h-8" />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900">
            {isAdminOrDev
              ? 'لا توجد بيانات أهداف مسجلة حالياً 🎯'
              : `أهلاً بك يا ${currentUser?.name || ''} ��`}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-lg mx-auto">
            {isAdminOrDev ? (
              <>
                قم برفع شيت الإكسل اليومي الحقيقي للبدء. الأعمدة المطلوبة:{' '}
                <strong className="text-slate-800">
                  الفرع، المندوب، هدف البيع، المحقق بيع، نسبه البيع، هدف التحصيل، المحقق تحصيل، نسبه تحصيل، تاريخ
                </strong>
                .
              </>
            ) : (
              'لم يتم رفع بيانات الأهداف والتارجت لهذا الشهر حتى الآن من قِبل الإدارة. ستظهر هنا أرقامك والرسوم البيانية لحظة رفع الشيت اليومي المعتمد.'
            )}
          </p>

          {isAdminOrDev && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs transition shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>رفع شيت الإكسل الحقيقي الآن</span>
              </button>
              <button
                onClick={downloadTargetTemplateExcel}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>تحميل قالب فارغ</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Controls & Period Selector Bar */}
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Period Mode: Monthly vs Quarterly */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">طريقة العرض:</span>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => {
                      setPeriodMode('monthly');
                      setSelectedQuarter('ALL');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      periodMode === 'monthly'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
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
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <PieChart className="w-3.5 h-3.5" />
                    <span>كوارتر (Quarterly)</span>
                  </button>
                </div>
              </div>

              {/* Supervisor View Mode: My Targets vs Team Reps */}
              {isSupervisor && (
                <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 p-1 rounded-xl">
                  <button
                    onClick={() => {
                      setSupervisorViewMode('my_personal');
                      setSelectedRep('ALL');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      supervisorViewMode === 'my_personal'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>أرقامي الشخصية 👤</span>
                  </button>
                  <button
                    onClick={() => setSupervisorViewMode('my_team')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                      supervisorViewMode === 'my_team'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>مناديب فريقي 👥</span>
                  </button>
                </div>
              )}

              {/* Rep Selector for Supervisor in Team Mode or Branch Manager */}
              {((isSupervisor && supervisorViewMode === 'my_team') || isBranchManager) && (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>المندوب:</span>
                  <select
                    value={selectedRep}
                    onChange={(e) => setSelectedRep(e.target.value)}
                    className="bg-transparent font-black text-slate-900 outline-none cursor-pointer text-xs max-w-[160px]"
                  >
                    <option value="ALL">
                      {isSupervisor ? 'كل مناديب فريقي (الإجمالي)' : 'كل مناديب الفرع'}
                    </option>
                    {(isSupervisor ? supervisedReps : availableReps).map((rep) => (
                      <option key={rep} value={rep}>
                        {rep}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Admin & Developer View Tabs */}
              {isAdminOrDev && (
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setAdminTab('overview')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                      adminTab === 'overview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    الأرقام والرسم البياني
                  </button>
                  <button
                    onClick={() => setAdminTab('quarters')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                      adminTab === 'quarters' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    مقارنة الكوارترات
                  </button>
                  <button
                    onClick={() => setAdminTab('table')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                      adminTab === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      selectedMonth === 'ALL'
                        ? 'bg-slate-900 text-white font-black shadow-xs'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    كل الشهور
                  </button>
                  {ARABIC_MONTHS.map((mName, idx) => (
                    <button
                      key={idx + 1}
                      onClick={() => setSelectedMonth(idx + 1)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        selectedMonth === idx + 1
                          ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
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
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      selectedQuarter === 'ALL'
                        ? 'bg-slate-900 text-white font-black shadow-xs'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    كل الكوارترات
                  </button>
                  {(['Q1', 'Q2', 'Q3', 'Q4'] as TargetQuarter[]).map((q) => (
                    <button
                      key={q}
                      onClick={() => setSelectedQuarter(q)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        selectedQuarter === q
                          ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
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

              {/* Admin filters: Branch selection */}
              {isAdminOrDev && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-700">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <span>الفرع:</span>
                    <select
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
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

                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-700">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>المندوب:</span>
                    <select
                      value={selectedRep}
                      onChange={(e) => setSelectedRep(e.target.value)}
                      className="bg-transparent font-black text-slate-900 outline-none cursor-pointer text-xs max-w-[140px]"
                    >
                      <option value="ALL">جميع المناديب</option>
                      {availableReps.map((r) => (
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

          {/* THE 8 NUMBERS (KPI Cards for Sales and Collection) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. Sales Target */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">هدف البيع (Sales Target)</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                  <Target className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {formatEGP(kpis.totalSalesTarget)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-bold">
                المستهدف للفترة المحددة
              </div>
            </div>

            {/* 2. Actual Sales */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">المحقق بيع (Actual)</span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-md border ${getBadgeColor(kpis.salesPercentage)}`}>
                  {kpis.salesPercentage}%
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-700 mt-2">
                {formatEGP(kpis.totalSalesAchieved)}
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    kpis.salesPercentage >= 100 ? 'bg-emerald-600' : kpis.salesPercentage >= 75 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, kpis.salesPercentage)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-bold flex justify-between">
                <span>نسبة الإنجاز: {kpis.salesPercentage}%</span>
              </div>
            </div>

            {/* 3. Remaining Sales */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">المتبقي بيع (Remaining)</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-black">
                  <ArrowDownRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-700 mt-2">
                {formatEGP(kpis.remainingSales)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-bold">
                {kpis.remainingSales === 0 ? '🎉 تم إكمال التارجت بالكامل!' : 'المبلغ المطلوب لتحقيق الهدف'}
              </div>
            </div>

            {/* 4. Sales Percentage Badge Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">نسبة نجاح البيع</span>
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-black text-amber-400 mt-2">
                {kpis.salesPercentage}%
              </div>
              <div className="text-[11px] text-slate-300 mt-1 font-bold">
                {kpis.salesPercentage >= 100
                  ? 'أداء استثنائي متفوق ⭐'
                  : kpis.salesPercentage >= 75
                  ? 'أداء جيد جداً وجاري المتابعة 🚀'
                  : 'يحتاج لتكثيف الزيارات والمبيعات ⚠️'}
              </div>
            </div>

            {/* 5. Collection Target */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">هدف التحصيل (Collection Target)</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {formatEGP(kpis.totalCollectionTarget)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-bold">
                المستهدف توريده للخزينة
              </div>
            </div>

            {/* 6. Actual Collection */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">المحقق تحصيل (Collected)</span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-md border ${getBadgeColor(kpis.collectionPercentage)}`}>
                  {kpis.collectionPercentage}%
                </span>
              </div>
              <div className="text-2xl font-black text-blue-700 mt-2">
                {formatEGP(kpis.totalCollectionAchieved)}
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    kpis.collectionPercentage >= 100 ? 'bg-emerald-600' : kpis.collectionPercentage >= 75 ? 'bg-amber-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.min(100, kpis.collectionPercentage)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-bold flex justify-between">
                <span>نسبة التحصيل: {kpis.collectionPercentage}%</span>
              </div>
            </div>

            {/* 7. Remaining Collection */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">المتبقي تحصيل (Remaining)</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-blue-900 mt-2">
                {formatEGP(kpis.remainingCollection)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-bold">
                المتبقي توريده لتغطية الهدف
              </div>
            </div>

            {/* 8. Collection Percentage Badge Card */}
            <div className="bg-gradient-to-br from-blue-950 to-slate-900 text-white rounded-2xl p-4 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-200">نسبة التحصيل</span>
                <Award className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-black text-emerald-400 mt-2">
                {kpis.collectionPercentage}%
              </div>
              <div className="text-[11px] text-blue-200 mt-1 font-bold">
                مؤشر السيولة النقدية والتوريدات
              </div>
            </div>
          </div>

          {/* THE PERFORMANCE CHART (الرسم البياني للأداء) */}
          {(!isAdminOrDev || adminTab === 'overview') && (
            <div className="space-y-4">
              {/* Sales Target vs Actual Chart */}
              <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-amber-500" />
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
                    <span className="flex items-center gap-1.5 text-emerald-700">
                      <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
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
                                <div className="font-black text-amber-400 text-sm">{label}</div>
                                <div className="text-slate-300">
                                  هدف البيع: <strong className="text-white">{formatEGP(target)}</strong>
                                </div>
                                <div className="text-slate-300">
                                  المحقق بيع: <strong className="text-emerald-400">{formatEGP(achieved)}</strong>
                                </div>
                                <div className="text-slate-300">
                                  نسبة الإنجاز: <strong className="text-amber-300">{perc}%</strong>
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
                      <Wallet className="w-5 h-5 text-blue-500" />
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
                    <span className="flex items-center gap-1.5 text-blue-700">
                      <span className="w-3 h-3 rounded-xs bg-blue-600 inline-block" />
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
                                <div className="font-black text-blue-400 text-sm">{label}</div>
                                <div className="text-slate-300">
                                  هدف التحصيل: <strong className="text-white">{formatEGP(target)}</strong>
                                </div>
                                <div className="text-slate-300">
                                  المحقق تحصيل: <strong className="text-blue-400">{formatEGP(achieved)}</strong>
                                </div>
                                <div className="text-slate-300">
                                  نسبة التحصيل: <strong className="text-amber-300">{perc}%</strong>
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
                        <span className="font-black text-emerald-700">{formatEGP(qSalesAchieved)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>هدف البيع:</span>
                        <span>{formatEGP(qSalesTarget)}</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className="bg-emerald-600 h-full"
                          style={{ width: `${Math.min(100, qSalesPerc)}%` }}
                        />
                      </div>
                      <div className="text-left text-[10px] font-black text-emerald-700">{qSalesPerc}%</div>
                    </div>

                    {/* Collection in Quarter */}
                    <div className="bg-blue-50/50 p-3 rounded-xl space-y-1 text-xs">
                      <div className="flex justify-between font-bold text-slate-600">
                        <span>المحقق تحصيل:</span>
                        <span className="font-black text-blue-700">{formatEGP(qColAchieved)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>هدف التحصيل:</span>
                        <span>{formatEGP(qColTarget)}</span>
                      </div>
                      <div className="w-full bg-blue-100 h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className="bg-blue-600 h-full"
                          style={{ width: `${Math.min(100, qColPerc)}%` }}
                        />
                      </div>
                      <div className="text-left text-[10px] font-black text-blue-700">{qColPerc}%</div>
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
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>بيانات شيت الأهداف الميداني المرفوع ({filteredRecords.length} صف)</span>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث باسم الفرع أو المندوب..."
                    className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-amber-400"
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
                      <tr key={r.id || idx} className="hover:bg-amber-50/40 transition">
                        <td className="p-3 font-bold text-slate-900">{r.branch}</td>
                        <td className="p-3 font-black text-slate-950">{r.repName}</td>
                        <td className="p-3">
                          <span className="font-bold">{ARABIC_MONTHS[r.month - 1]}</span>{' '}
                          <span className="text-[11px] text-slate-400">({r.quarter})</span>
                        </td>
                        <td className="p-3 text-left font-bold">{formatEGP(r.salesTarget)}</td>
                        <td className="p-3 text-left font-black text-emerald-700">{formatEGP(r.salesAchieved)}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-black border ${getBadgeColor(r.salesPercentage)}`}>
                            {r.salesPercentage}%
                          </span>
                        </td>
                        <td className="p-3 text-left font-bold text-amber-700">{formatEGP(r.remainingSales)}</td>
                        <td className="p-3 text-left font-bold">{formatEGP(r.collectionTarget)}</td>
                        <td className="p-3 text-left font-black text-blue-700">{formatEGP(r.collectionAchieved)}</td>
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
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
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
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
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
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {uploadFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{uploadFeedback.message}</span>
              </div>
            )}

            {/* File Dropzone / Selector */}
            <label className="border-2 border-dashed border-slate-300 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/30 rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-2 cursor-pointer transition">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
              <FileSpreadsheet className="w-10 h-10 text-slate-400 group-hover:text-amber-500" />
              <div className="text-xs font-bold text-slate-700">
                {isUploading ? (
                  <span className="text-amber-600 font-black animate-pulse">
                    جاري قراءة واستيراد الشيت...
                  </span>
                ) : (
                  <>
                    <span className="text-amber-600 font-black">اضغط لاختيار ملف الإكسل</span> أو اسحب الملف هنا
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
                className="text-amber-600 hover:text-amber-700 font-black flex items-center gap-1 cursor-pointer"
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
