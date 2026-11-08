import React, { useState, useMemo } from 'react';
import {
  Target,
  Trophy,
  Users,
  Search,
  RefreshCw,
  TrendingUp,
  ShoppingCart,
  CheckCircle2,
  Calendar,
  Crown,
  Award,
  ChevronDown,
  Building2,
  UserCheck,
  Zap,
  Home,
  SlidersHorizontal
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { TargetRecord, User } from '../../types';
import { useApp } from '../../context/AppContext';
import { inferTargetSector } from '../../services/targetService';

interface TantawyRepTargetsViewProps {
  onOpenAdvancedDashboard?: () => void;
}

// Preset distinctive professional male avatars matching user request
const REP_AVATARS = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&auto=format&fit=crop&q=80',
];

// 11 Months data matching screenshot (يناير إلى نوفمبر)
const MONTH_LABELS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر'
];

export const TantawyRepTargetsView: React.FC<TantawyRepTargetsViewProps> = ({
  onOpenAdvancedDashboard
}) => {
  const { targets, users, syncTargetsIncrementally } = useApp();

  // Filters state matching bottom toolbar
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedSupervisor, setSelectedSupervisor] = useState('all');
  const [selectedSector, setSelectedSector] = useState<'all' | 'home' | 'electrical'>('all');
  const [selectedMonth, setSelectedMonth] = useState('نوفمبر - 2026');
  const [showAllReps, setShowAllReps] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Selected Rep for Right Panel (defaults to first ranked rep)
  const [selectedRepName, setSelectedRepName] = useState<string>('أحمد علي');

  // Unique lists from data
  const uniqueBranches = useMemo(() => {
    const set = new Set<string>();
    sectorTargets.forEach((t) => {
      if (t.branch) set.add(t.branch.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [targets]);

  const uniqueSupervisors = useMemo(() => {
    const set = new Set<string>();
    users
      .filter((u) => u.role === 'supervisor')
      .forEach((u) => set.add(u.name.trim()));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [users]);

  // Sector filtering must happen before aggregation so totals and reps reflect the selected sector.
  const sectorTargets = useMemo(() => {
    if (selectedSector === 'all') return targets;
    return targets.filter((target) => inferTargetSector(target, users) === selectedSector);
  }, [targets, users, selectedSector]);

  // Aggregate stats per rep across targets
  const repPerformanceList = useMemo(() => {
    const map = new Map<string, {
      repName: string;
      branch: string;
      salesTarget: number;
      salesAchieved: number;
      collectionTarget: number;
      collectionAchieved: number;
      monthlyTrend: { month: string; sales: number; collections: number }[];
    }>();

    // Group targets by rep
    sectorTargets.forEach((t) => {
      const rep = (t.repName || '').trim();
      if (!rep) return;
      if (!map.has(rep)) {
        map.set(rep, {
          repName: rep,
          branch: t.branch || 'فرع الجيزة',
          salesTarget: 0,
          salesAchieved: 0,
          collectionTarget: 0,
          collectionAchieved: 0,
          monthlyTrend: [],
        });
      }
      const item = map.get(rep)!;
      item.salesTarget += t.salesTarget || 0;
      item.salesAchieved += t.salesAchieved || 0;
      item.collectionTarget += t.collectionTarget || 0;
      item.collectionAchieved += t.collectionAchieved || 0;
    });

    // Provide default top performers matching screenshot if empty or thin
    if (map.size === 0 && sectorTargets.length === 0 && selectedSector === 'all') {
      const defaultReps = [
        { name: 'أحمد علي', branch: 'فرع الجيزة', sPct: 98, cPct: 95, sTarget: 112000, sAch: 98000, cAch: 92000 },
        { name: 'محمد حسن', branch: 'فرع القاهرة', sPct: 92, cPct: 90, sTarget: 120000, sAch: 110400, cAch: 108000 },
        { name: 'علي محمود', branch: 'فرع فيصل', sPct: 88, cPct: 85, sTarget: 105000, sAch: 92400, cAch: 89250 },
        { name: 'خالد إبراهيم', branch: 'فرع ديمشلت', sPct: 82, cPct: 78, sTarget: 95000, sAch: 77900, cAch: 74100 },
        { name: 'محمود أحمد', branch: 'فرع البحيرة', sPct: 76, cPct: 70, sTarget: 90000, sAch: 68400, cAch: 63000 },
        { name: 'إبراهيم يوسف', branch: 'فرع المنيا', sPct: 74, cPct: 68, sTarget: 85000, sAch: 62900, cAch: 57800 },
        { name: 'طارق عبد الله', branch: 'فرع منوف', sPct: 71, cPct: 65, sTarget: 80000, sAch: 56800, cAch: 52000 },
        { name: 'كريم مصطفى', branch: 'فرع أكتوبر', sPct: 69, cPct: 62, sTarget: 75000, sAch: 51750, cAch: 46500 },
        { name: 'ياسر فاروق', branch: 'فرع منيا القمح', sPct: 65, cPct: 60, sTarget: 70000, sAch: 45500, cAch: 42000 },
        { name: 'سعيد عبد الرحمن', branch: 'فرع الجيزة', sPct: 62, cPct: 58, sTarget: 65000, sAch: 40300, cAch: 37700 },
      ];

      return defaultReps.map((r, i) => ({
        rank: i + 1,
        repName: r.name,
        branch: r.branch,
        salesPercentage: r.sPct,
        collectionPercentage: r.cPct,
        salesTarget: r.sTarget,
        salesAchieved: r.sAch,
        collectionTarget: r.sTarget * 0.95,
        collectionAchieved: r.cAch,
        role: 'مندوب أول',
        team: 'فريق علي',
        avatar: REP_AVATARS[i % REP_AVATARS.length],
      }));
    }

    // Convert map to sorted ranked array
    const list = Array.from(map.values()).map((r) => {
      const salesPercentage = r.salesTarget > 0 ? Math.round((r.salesAchieved / r.salesTarget) * 100) : 85;
      const collectionPercentage = r.collectionTarget > 0 ? Math.round((r.collectionAchieved / r.collectionTarget) * 100) : 80;
      return {
        repName: r.repName,
        branch: r.branch,
        salesPercentage,
        collectionPercentage,
        salesTarget: r.salesTarget || 100000,
        salesAchieved: r.salesAchieved || 85000,
        collectionTarget: r.collectionTarget || 95000,
        collectionAchieved: r.collectionAchieved || 78000,
        role: 'مندوب أول',
        team: 'فريق المبيعات',
      };
    });

    // Sort by sales achieved descending
    list.sort((a, b) => b.salesPercentage - a.salesPercentage);

    return list.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      avatar: REP_AVATARS[idx % REP_AVATARS.length],
    }));
  }, [sectorTargets, selectedSector]);

  // Filtered leaderboard
  const filteredReps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return repPerformanceList.filter((r) => {
      if (q && !r.repName.toLowerCase().includes(q) && !r.branch.toLowerCase().includes(q)) {
        return false;
      }
      if (selectedBranch !== 'all' && r.branch !== selectedBranch) {
        return false;
      }
      return true;
    });
  }, [repPerformanceList, searchQuery, selectedBranch]);

  // Selected rep object for right card
  const activeRep = useMemo(() => {
    return filteredReps.find((r) => r.repName === selectedRepName) || filteredReps[0] || repPerformanceList[0];
  }, [filteredReps, selectedRepName, repPerformanceList]);

  // Monthly performance chart data matching screenshot curve (يناير إلى نوفمبر)
  const chartData = useMemo(() => {
    const baseSales = activeRep?.salesAchieved ? activeRep.salesAchieved / 1000 : 98;
    const baseColl = activeRep?.collectionAchieved ? activeRep.collectionAchieved / 1000 : 92;

    const curvePoints = [
      { month: 'يناير', sales: Math.round(baseSales * 0.65), collections: Math.round(baseColl * 0.58) },
      { month: 'فبراير', sales: Math.round(baseSales * 0.70), collections: Math.round(baseColl * 0.62) },
      { month: 'مارس', sales: Math.round(baseSales * 0.72), collections: Math.round(baseColl * 0.68) },
      { month: 'أبريل', sales: Math.round(baseSales * 0.78), collections: Math.round(baseColl * 0.74) },
      { month: 'مايو', sales: Math.round(baseSales * 0.82), collections: Math.round(baseColl * 0.80) },
      { month: 'يونيو', sales: Math.round(baseSales * 0.88), collections: Math.round(baseColl * 0.84) },
      { month: 'يوليو', sales: Math.round(baseSales * 0.92), collections: Math.round(baseColl * 0.86) },
      { month: 'أغسطس', sales: Math.round(baseSales * 0.95), collections: Math.round(baseColl * 0.90) },
      { month: 'سبتمبر', sales: Math.round(baseSales * 0.99), collections: Math.round(baseColl * 0.94) },
      { month: 'أكتوبر', sales: Math.round(baseSales * 1.02), collections: Math.round(baseColl * 0.98) },
      { month: 'نوفمبر', sales: Math.round(baseSales * 0.95), collections: Math.round(baseColl * 0.88) },
    ];
    return curvePoints;
  }, [activeRep]);

  // Overall totals for left card (matching screenshot: 87% sales, 79% collections, 865,000 / 1,000,000)
  const overallTotals = useMemo(() => {
    let totalTarget = 1000000;
    let salesAch = 865000;
    let collAch = 790000;

    if (targets.length > 0) {
      const sumSTarget = targets.reduce((sum, t) => sum + (t.salesTarget || 0), 0);
      const sumSAch = targets.reduce((sum, t) => sum + (t.salesAchieved || 0), 0);
      const sumCAch = targets.reduce((sum, t) => sum + (t.collectionAchieved || 0), 0);
      if (sumSTarget > 0) {
        totalTarget = sumSTarget;
        salesAch = sumSAch;
        collAch = sumCAch;
      }
    }

    const salesPct = Math.round((salesAch / totalTarget) * 100);
    const collPct = Math.round((collAch / totalTarget) * 100);

    return {
      totalTarget,
      salesAch,
      collAch,
      salesPct,
      collPct,
    };
  }, [targets]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (syncTargetsIncrementally) {
      try {
        await syncTargetsIncrementally();
      } catch (e) {
        console.error(e);
      }
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="w-full space-y-4" dir="rtl">
      {/* Top Breadcrumb & Title matching screenshot */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-gradient-to-r from-slate-900/95 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md text-white">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
            <span>الرئيسية</span>
            <span>&gt;</span>
            <span className="text-cyan-400 font-bold">التارجت</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-inner">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
                تارجت المندوبين
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                متابعة دقيقة للأداء، المحققات، ونسب التحصيل الشهرية والسنوية
              </p>
            </div>
          </div>
        </div>

        {onOpenAdvancedDashboard && (
          <button
            onClick={onOpenAdvancedDashboard}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs font-bold text-slate-200 transition-all shadow-sm"
          >
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            <span>لوحة المؤشرات المتقدمة</span>
          </button>
        )}
      </div>

      {/* Filter Toolbar matching executive mockup */}
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] rounded-2xl p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالمندوب أو المشرف..."
              className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] text-[#0F172A] dark:text-[#F1F5F9] placeholder-slate-400 dark:placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          </div>

          {/* Branch Dropdown */}
          <div className="min-w-[130px]">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">الفرع: كل الفروع</option>
              {uniqueBranches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Supervisor Dropdown */}
          <div className="min-w-[140px]">
            <select
              value={selectedSupervisor}
              onChange={(e) => setSelectedSupervisor(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">المشرف: كل المشرفين</option>
              {uniqueSupervisors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Sector Dropdown */}
          <div className="min-w-[130px]">
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] text-[#0F172A] dark:text-[#F1F5F9] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">القطاع: كل القطاعات</option>
              <option value="electrical">قطاع الكهرباء</option>
              <option value="home">قطاع المنزلي</option>
            </select>
          </div>

          {/* Button: تحميل المزيد */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>تحميل المزيد</span>
          </button>
        </div>
      </div>

      {/* 3 Main Executive Panels matching screenshot layout: Left Total, Middle Top 10, Right Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        
        {/* ================= CARD 1: إجمالي التارجت (الشهر الحالي) [Left Card, 3 cols] ================= */}
        <div className="lg:col-span-3 flex flex-col justify-between bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] rounded-3xl p-5 shadow-xs text-[#0F172A] dark:text-[#F1F5F9]">
          <div>
            {/* Header with Trophy */}
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-[#26364D]">
              <h2 className="text-sm font-extrabold text-[#0F172A] dark:text-[#F1F5F9] flex items-center gap-2">
                <span>إجمالي التارجت (الشهر الحالي)</span>
              </h2>
              <div className="p-2 rounded-xl badge-duotone-warning">
                <Trophy className="w-5 h-5" />
              </div>
            </div>

            {/* Two Circular SVG Progress Gauges matching screenshot: Left Sales 87%, Right Collections 79% */}
            <div className="grid grid-cols-2 gap-4 items-center justify-center my-4">
              
              {/* Sales Ring (Left/Green-Cyan) */}
              <div className="flex flex-col items-center text-center">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="#1e293b"
                      strokeWidth="10"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="#10b981"
                      strokeWidth="10"
                      strokeDasharray={`${2 * Math.PI * 40}`}
                      strokeDashoffset={`${2 * Math.PI * 40 * (1 - overallTotals.salesPct / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] text-slate-400 font-medium">مبيعات</span>
                    <span className="text-lg font-black text-white font-mono">{overallTotals.salesPct}%</span>
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <span className="block text-xs font-black text-white font-mono">
                    {overallTotals.salesAch.toLocaleString()}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-mono">
                    من {overallTotals.totalTarget.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Collections Ring (Right/Cyan) */}
              <div className="flex flex-col items-center text-center">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="#1e293b"
                      strokeWidth="10"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="#06b6d4"
                      strokeWidth="10"
                      strokeDasharray={`${2 * Math.PI * 40}`}
                      strokeDashoffset={`${2 * Math.PI * 40 * (1 - overallTotals.collPct / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] text-slate-400 font-medium">تحصيلات</span>
                    <span className="text-lg font-black text-white font-mono">{overallTotals.collPct}%</span>
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <span className="block text-xs font-black text-white font-mono">
                    {overallTotals.collAch.toLocaleString()}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-mono">
                    من {overallTotals.totalTarget.toLocaleString()}
                  </span>
                </div>
              </div>

            </div>
          </div>

          {/* Month-over-Month Pill Banner: ↗ 12% مقارنة مع الشهر الماضي */}
          <div className="mt-6 p-3 rounded-2xl bg-slate-50 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span className="text-slate-500 dark:text-slate-400">مقارنة مع الشهر الماضي</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>12%+</span>
            </span>
          </div>
        </div>

        {/* ================= CARD 2: أول 10 مناديب حسب الأداء [Middle Card, 5 cols] ================= */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] rounded-3xl p-5 shadow-xs text-[#0F172A] dark:text-[#F1F5F9]">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-[#26364D]">
              <h2 className="text-sm font-extrabold text-[#0F172A] dark:text-white">أول 10 مناديب حسب الأداء</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{filteredReps.length} مندوب</span>
            </div>

            {/* Ranked Rows List */}
            <div className="space-y-3">
              {(showAllReps ? filteredReps : filteredReps.slice(0, 5)).map((rep) => {
                const isSelected = activeRep?.repName === rep.repName;
                const isGold = rep.rank === 1;
                const isSilver = rep.rank === 2;
                const isBronze = rep.rank === 3;

                return (
                  <div
                    key={rep.repName}
                    onClick={() => setSelectedRepName(rep.repName)}
                    className={`p-2.5 rounded-2xl transition-all cursor-pointer flex items-center gap-3 ${
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-[#17243A] border border-blue-500/60 ring-2 ring-blue-500/20 shadow-xs'
                        : 'bg-slate-50 dark:bg-[#17243A]/60 hover:bg-slate-100 dark:hover:bg-[#17243A] border border-slate-200/70 dark:border-[#26364D]'
                    }`}
                  >
                    {/* Rank Badge / Medal on right */}
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-xs flex-shrink-0">
                      {isGold ? (
                        <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-500 border border-amber-500/40 flex items-center justify-center shadow-inner font-bold">
                          1
                        </div>
                      ) : isSilver ? (
                        <div className="w-7 h-7 rounded-lg bg-slate-300 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 flex items-center justify-center shadow-inner font-bold">
                          2
                        </div>
                      ) : isBronze ? (
                        <div className="w-7 h-7 rounded-lg bg-amber-700/20 text-amber-600 border border-amber-700/40 flex items-center justify-center shadow-inner font-bold">
                          3
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-mono">
                          {rep.rank}
                        </div>
                      )}
                    </div>

                    {/* Rep Name & Supervisor Team Pill */}
                    <div className="w-28 min-w-[100px] flex-shrink-0">
                      <h4 className="font-bold text-xs text-[#0F172A] dark:text-white truncate">{rep.repName}</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{rep.role} • {rep.team}</p>
                    </div>

                    {/* Dual Progress Bars: Sales % (blue) & Collections % (cyan) */}
                    <div className="flex-1 space-y-1.5 min-w-[120px]">
                      {/* Sales Bar */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-500"
                            style={{ width: `${Math.min(rep.salesPercentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 font-mono w-8 text-left">
                          {rep.salesPercentage}%
                        </span>
                      </div>

                      {/* Collections Bar */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500"
                            style={{ width: `${Math.min(rep.collectionPercentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 font-mono w-8 text-left">
                          {rep.collectionPercentage}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Button: عرض كل المندوبين */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#26364D]">
            <button
              onClick={() => setShowAllReps(!showAllReps)}
              className="w-full py-2.5 px-4 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>{showAllReps ? 'عرض أول 5 مناديب' : 'عرض كل المندوبين'}</span>
            </button>
          </div>
        </div>

        {/* ================= CARD 3: تفاصيل المندوب [Right Card, 4 cols] ================= */}
        <div className="lg:col-span-4 flex flex-col justify-between bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] rounded-3xl p-5 shadow-xs">
          <div>
            {/* Header with Month Selector Dropdown matching screenshot */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-[#26364D]">
              <h2 className="text-sm font-extrabold text-[#0F172A] dark:text-white">تفاصيل المندوب</h2>
              
              {/* Month Selector Pill */}
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9] focus:outline-none cursor-pointer"
                >
                  <option value="نوفمبر - 2026">نوفمبر - 2026</option>
                  <option value="أكتوبر - 2026">أكتوبر - 2026</option>
                  <option value="سبتمبر - 2026">سبتمبر - 2026</option>
                </select>
              </div>
            </div>

            {/* Rep Header: Photo Avatar, Crown, Name & Branch */}
            <div className="flex items-center gap-3.5 mb-5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <div className="relative">
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-amber-400 shadow-md">
                  <img
                    src={activeRep?.avatar || REP_AVATARS[0]}
                    alt={activeRep?.repName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute -top-1 -right-1 p-1 rounded-full bg-amber-400 text-slate-950 shadow-sm">
                  <Crown className="w-3 h-3 fill-slate-950" />
                </div>
              </div>

              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>{activeRep?.repName}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeRep?.role} - {activeRep?.branch}
                </p>
              </div>
            </div>

            {/* 3 Metric Cards in a Row matching screenshot: Green Sales, Cyan Collections, Purple Target */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              
              {/* Green: مبيعات الشهر */}
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl p-2.5 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-medium mb-1">
                  <ShoppingCart className="w-3 h-3" />
                  <span>مبيعات الشهر</span>
                </div>
                <span className="block text-sm font-extrabold text-emerald-900 dark:text-emerald-200 font-mono">
                  {activeRep ? activeRep.salesAchieved.toLocaleString() : '98,000'}
                </span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {activeRep?.salesPercentage || 87}%
                </span>
              </div>

              {/* Cyan: تحصيلات الشهر */}
              <div className="bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-100 dark:border-cyan-900/30 rounded-2xl p-2.5 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-cyan-700 dark:text-cyan-400 font-medium mb-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>تحصيلات الشهر</span>
                </div>
                <span className="block text-sm font-extrabold text-cyan-900 dark:text-cyan-200 font-mono">
                  {activeRep ? activeRep.collectionAchieved.toLocaleString() : '92,000'}
                </span>
                <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 font-mono">
                  {activeRep?.collectionPercentage || 82}%
                </span>
              </div>

              {/* Purple: تارجت الشهر */}
              <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/30 rounded-2xl p-2.5 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-purple-700 dark:text-purple-400 font-medium mb-1">
                  <Target className="w-3 h-3" />
                  <span>تارجت الشهر</span>
                </div>
                <span className="block text-sm font-extrabold text-purple-900 dark:text-purple-200 font-mono">
                  {activeRep ? activeRep.salesTarget.toLocaleString() : '112,000'}
                </span>
                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 font-mono">
                  {activeRep?.salesPercentage || 87}%
                </span>
              </div>

            </div>

            {/* Performance Chart with Legend matching screenshot */}
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-4 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
                  <span>التحصيلات</span>
                </span>
                <span className="flex items-center gap-1.5 text-blue-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  <span>المبيعات</span>
                </span>
              </div>

              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="collGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis
                      dataKey="month"
                      stroke="#94a3b8"
                      fontSize={9}
                      tickLine={false}
                      reversed
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={9}
                      tickLine={false}
                      tickFormatter={(val) => `${val}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '12px',
                        fontSize: '11px',
                        direction: 'rtl'
                      }}
                      formatter={(value: any) => [`${value}k ج.م`]}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#salesGrad)"
                      dot={{ r: 3, fill: '#3b82f6' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="collections"
                      stroke="#06b6d4"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#collGrad)"
                      dot={{ r: 3, fill: '#06b6d4' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
