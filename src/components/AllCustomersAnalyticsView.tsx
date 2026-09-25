import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  ArrowUpDown,
  Download,
  Upload,
  RefreshCw,
  Phone,
  MapPin,
  Building2,
  UserCheck,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Calendar,
  Layers,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  MessageCircle,
  BarChart3,
  PieChart,
  Eye,
  EyeOff,
  Lock,
  Plus,
  X,
  FileSpreadsheet,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Check,
  Award,
  ShoppingCart,
  Receipt,
  FileText,
  ShieldAlert,
  Edit3,
  Save,
  CalendarCheck,
  PackageCheck,
  AlertCircle,
  RotateCcw,
  BadgeDollarSign,
  Scale,
  Zap,
  Navigation,
  TrendingDown,
  Store,
  SlidersHorizontal
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart as RechartsPieChart,
  Pie,
  Cell
} from 'recharts';
import { useApp } from '../context/AppContext';
import { Customer, User, Invoice, OrderStatus } from '../types';
import { formatCurrency } from '../services/invoiceService';
import {
  MONTH_NAMES_AR,
  filterCustomersByRBAC,
  fetchDetailedCustomersFromGoogleSheet,
  parseDetailedCustomersExcel,
  exportCustomerAnalyticsToExcel,
  downloadCustomerAnalyticsTemplate
} from '../services/customerAnalyticsService';
import { isArabicNameMatch, isBranchMatch, normalizeArabicText } from '../services/arabicMatchingService';
import { getSavedSourceUrl, saveSingleSourceUrl, getSavedSheetHistory } from '../services/dataSourceService';

interface AllCustomersAnalyticsViewProps {
  onOpenNewOrderForCustomer?: (customer: Customer) => void;
}

export const AllCustomersAnalyticsView: React.FC<AllCustomersAnalyticsViewProps> = ({
  onOpenNewOrderForCustomer,
}) => {
  const {
    customers,
    currentUser,
    users,
    branches,
    importCustomersList,
    updateCustomer,
    addVisit,
    invoices = [],
    isPrivacyMode,
    togglePrivacyMode,
    cleanAndDeduplicateCustomers
  } = useApp();

  // Roles
  const isRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isBranchManager = currentUser?.role === 'branch_manager';
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  // Confidential Currency Formatter (respects Privacy Mode for executive security)
  const formatMoney = (amount: number | undefined | null): string => {
    if (isPrivacyMode) return '•••••• ج.م';
    return formatCurrency(amount || 0);
  };

  // Deduplication state & notification banner
  const [dedupeNotice, setDedupeNotice] = useState<string | null>(null);
  const handleRunDeduplication = () => {
    const res = cleanAndDeduplicateCustomers();
    if (res.duplicatesRemoved > 0) {
      setDedupeNotice(`تم بنجاح تنقية وحذف ${res.duplicatesRemoved} سجل مكرر! إجمالي العملاء الآن: ${res.deduplicatedCount.toLocaleString()} عميل فريد.`);
    } else {
      setDedupeNotice(`قاعدة بيانات العملاء نظيفة وموحدة تماماً (${res.deduplicatedCount.toLocaleString()} عميل) بدون أي سجلات مكررة.`);
    }
    setTimeout(() => setDedupeNotice(null), 6500);
  };

  // State: Core Power BI Slicers
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedRep, setSelectedRep] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');
  const [dealEligibilityFilter, setDealEligibilityFilter] = useState<string>('ALL');
  const [dealtFilter, setDealtFilter] = useState<'ALL' | 'dealt' | 'not_dealt'>('ALL');
  const [sortMode, setSortMode] = useState<'highest_debt' | 'lowest_debt' | 'highest_overdue' | 'highest_sales' | 'highest_collections' | 'name_asc' | 'code_asc' | 'route_asc'>('highest_debt');
  const [showRepMatrix, setShowRepMatrix] = useState<boolean>(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Sheet-specific Slicers: Region/Route, Debt, Guarantees, Payment Terms, Activity Type, Client Type
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [activityFilter, setActivityFilter] = useState<'ALL' | 'active_2026' | 'inactive_2026' | 'churn_risk' | 'new_customer'>('ALL');
  const [debtFilter, setDebtFilter] = useState<'ALL' | 'highest_debt' | 'lowest_debt' | 'highest_overdue' | 'has_debt' | 'zero_debt' | 'over_limit' | 'has_overdue'>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL');
  const [orderFilter, setOrderFilter] = useState<'ALL' | 'has_order' | 'active_order' | 'no_order'>('ALL');
  const [guaranteeFilter, setGuaranteeFilter] = useState<string>('ALL');
  const [paymentTermsFilter, setPaymentTermsFilter] = useState<string>('ALL');
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>('ALL');
  const [clientTypeFilter, setClientTypeFilter] = useState<string>('ALL');
  const [visitFilter, setVisitFilter] = useState<'ALL' | 'visited_2026' | 'not_visited'>('ALL');

  // Expanded Slicer Filters (شرائح المبيعات، كفاءة التحصيل)
  const [salesTierFilter, setSalesTierFilter] = useState<'ALL' | 'vip_100k' | 'medium_20k_100k' | 'starter_under_20k' | 'zero_sales'>('ALL');
  const [collectionRateFilter, setCollectionRateFilter] = useState<'ALL' | 'high_80' | 'medium_30_79' | 'low_zero'>('ALL');

  // Power BI Visuals Tab (المسار، معدل السرعة، موازنة المحفظة، الفروع، المناديب، طبيعة النشاط، الضمانات، والمصفوفة)
  const [activeChartTab, setActiveChartTab] = useState<'monthly' | 'run_rate' | 'portfolio_balance' | 'branches' | 'reps' | 'activity_client' | 'matrix' | 'payment_guarantee'>('monthly');
  const [runRateSelectedMonth, setRunRateSelectedMonth] = useState<number>(9);

  // Sorting
  const [sortBy, setSortBy] = useState<'name' | 'code' | 'balance' | 'overdue' | 'creditLimit' | 'sales2026' | 'collections2026' | 'lastVisit' | 'order'>('sales2026');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination for high-performance (4000+ items)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // BI Charts Toggle (مفعلة افتراضياً لإظهار التحليلات كأنها Power BI)
  const [showCharts, setShowCharts] = useState(true);

  // Toggle for monthly table in modal (active months vs all 12 months)
  const [showAllMonthsInModal, setShowAllMonthsInModal] = useState(false);

  // Selected Customer for Detailed 360 Drawer/Modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Customer Dossier Edit state (Credit, Guarantee, Overdue, Next Visit)
  const [isEditingDossier, setIsEditingDossier] = useState(false);
  const [editCreditLimit, setEditCreditLimit] = useState<number>(0);
  const [editGuaranteeDocs, setEditGuaranteeDocs] = useState<string>('بدون ضمان');
  const [editOverdueBalance, setEditOverdueBalance] = useState<number>(0);
  const [editNextVisitDate, setEditNextVisitDate] = useState<string>('');

  // Sync edit state when selectedCustomer opens
  useEffect(() => {
    if (selectedCustomer) {
      setEditCreditLimit(selectedCustomer.creditLimit || 0);
      setEditGuaranteeDocs(selectedCustomer.guaranteeDocs || (selectedCustomer.creditLimit && selectedCustomer.creditLimit > 0 ? 'شيك بنكي' : 'بدون ضمان'));
      setEditOverdueBalance(selectedCustomer.totalOverdueAndDue ?? selectedCustomer.overdueBalance ?? 0);
      setEditNextVisitDate(selectedCustomer.nextVisitDate || '');
      setIsEditingDossier(false);
    }
  }, [selectedCustomer]);

  // Visit logging modal state
  const [isLoggingVisit, setIsLoggingVisit] = useState(false);
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [visitType, setVisitType] = useState<'زيارة بيع وطلبية' | 'زيارة تحصيل' | 'زيارة دورية' | 'متابعة حساب'>('زيارة بيع وطلبية');
  const [visitOutcome, setVisitOutcome] = useState<'تم عمل طلبية' | 'تم التحصيل' | 'تأجيل سداد' | 'المحل مغلق' | 'متابعة فقط'>('تم عمل طلبية');
  const [visitCollected, setVisitCollected] = useState('');
  const [visitNotes, setVisitNotes] = useState('');

  // Fast Indexed Customer Orders Lookup
  const customerOrdersLookup = useMemo(() => {
    const byId = new Map<string, Invoice[]>();
    const byCode = new Map<string, Invoice[]>();
    const byName = new Map<string, Invoice[]>();

    (invoices || []).forEach((inv) => {
      if (inv.customerId) {
        const arr = byId.get(inv.customerId) || [];
        arr.push(inv);
        byId.set(inv.customerId, arr);
      }
      if (inv.customerCode) {
        const codeKey = inv.customerCode.trim().toLowerCase();
        const arr = byCode.get(codeKey) || [];
        arr.push(inv);
        byCode.set(codeKey, arr);
      }
      if (inv.customerName) {
        const nameKey = normalizeArabicText(inv.customerName);
        if (nameKey) {
          const arr = byName.get(nameKey) || [];
          arr.push(inv);
          byName.set(nameKey, arr);
        }
      }
    });

    const getOrdersForCustomer = (c: Customer): Invoice[] => {
      let list: Invoice[] = [];
      if (c.id && byId.has(c.id)) {
        list = byId.get(c.id)!;
      } else if (c.code && byCode.has(c.code.trim().toLowerCase())) {
        list = byCode.get(c.code.trim().toLowerCase())!;
      } else if (c.name) {
        const nameKey = normalizeArabicText(c.name);
        if (nameKey && byName.has(nameKey)) {
          list = byName.get(nameKey)!;
        }
      }
      // Return sorted by date descending (newest first)
      return [...list].sort((a, b) => {
        const tA = new Date(a.date || a.createdAt || 0).getTime();
        const tB = new Date(b.date || b.createdAt || 0).getTime();
        return tB - tA;
      });
    };

    return { getOrdersForCustomer };
  }, [invoices]);

  // Helper: Extract Order Status summary
  const getCustomerOrderSummary = (c: Customer) => {
    const orders = customerOrdersLookup.getOrdersForCustomer(c);
    if (!orders || orders.length === 0) {
      return {
        hasOrder: false,
        hasActiveOrder: false,
        ordersCount: 0,
        totalOrdersValue: 0,
        latestOrder: null,
      };
    }
    const latestOrder = orders[0];
    const totalOrdersValue = orders.reduce((sum, o) => sum + (Number(o.estimatedGrandTotal ?? o.subtotal) || 0), 0);
    const activeStatuses: OrderStatus[] = ['معتمدة', 'جاري التجهيز', 'قيد مراجعة المشرف', 'معلقة بانتظار اعتماد الفرع', 'مسودة', 'قيد التوصيل'];
    const hasActiveOrder = orders.some((o) => activeStatuses.includes(o.status));
    return {
      hasOrder: true,
      hasActiveOrder,
      ordersCount: orders.length,
      totalOrdersValue,
      latestOrder,
      allOrders: orders,
    };
  };

  // Helper: Relative Arabic Time for visits
  const getRelativeTimeArabic = (dateStr?: string): { text: string; color: string } => {
    if (!dateStr) return { text: 'لم تسجل', color: 'text-slate-400 bg-slate-100' };
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { text: dateStr, color: 'text-slate-600 bg-slate-100' };
    const now = new Date();
    const diffDays = Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return { text: 'اليوم', color: 'text-emerald-700 bg-emerald-100' };
    if (diffDays === 1) return { text: 'أمس', color: 'text-emerald-700 bg-emerald-50' };
    if (diffDays <= 7) return { text: `منذ ${diffDays} أيام`, color: 'text-blue-700 bg-blue-50' };
    if (diffDays <= 30) return { text: `منذ ${Math.round(diffDays / 7)} أسبوع`, color: 'text-amber-800 bg-amber-50' };
    return { text: `منذ ${Math.round(diffDays / 30)} شهر`, color: 'text-slate-600 bg-slate-100' };
  };

  // Helper: Guarantee badge styling (supports explicit amount, signed status, and types)
  const getGuaranteeBadge = (docStr?: string, guaranteeAmount?: number, creditLimit?: number) => {
    let amt = guaranteeAmount || 0;
    const g = (docStr || '').trim();
    if (amt <= 0 && g) {
      const cleanDigits = g.replace(/[^\d.]/g, '');
      if (cleanDigits) {
        const parsed = parseFloat(cleanDigits);
        if (!isNaN(parsed) && parsed > 0) amt = parsed;
      }
    }

    if (amt > 0) {
      return {
        label: `ماضي على ورق ضمان (${formatMoney(amt)})`,
        color: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
        isSigned: true,
      };
    }

    if (g && g !== '0' && !g.includes('لا يوجد') && !g.includes('بدون') && (g.includes('ماضي') || g.includes('شيك') || g.includes('كمبيال') || g.includes('أمانة') || g.includes('امانة') || g.includes('رهن'))) {
      return {
        label: g.includes('ماضي') ? g : `ماضي (${g})`,
        color: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
        isSigned: true,
      };
    }

    return {
      label: 'لا يوجد ورق ضمان',
      color: 'bg-slate-100 text-slate-500 border-slate-200',
      isSigned: false,
    };
  };

  // Save Customer Dossier (Credit Limit, Guarantees, Overdue)
  const handleSaveCustomerDossier = () => {
    if (!selectedCustomer) return;
    const updated: Customer = {
      ...selectedCustomer,
      creditLimit: editCreditLimit,
      guaranteeDocs: editGuaranteeDocs,
      totalOverdueAndDue: editOverdueBalance,
      overdueBalance: editOverdueBalance,
      nextVisitDate: editNextVisitDate || undefined,
    };
    updateCustomer(updated);
    setSelectedCustomer(updated);
    setIsEditingDossier(false);
  };

  // Google Sheets & Excel Sync Modal (Admin / Dev / Branch Manager only)
  const defaultCustomerSheet = 'https://docs.google.com/spreadsheets/d/1eVQrSKbXVIBwx5V_K7eqj_cUL6YuCVP33iHo13J7Yp4/edit?usp=sharing';
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [googleSheetUrl, setGoogleSheetUrl] = useState(() => getSavedSourceUrl('customers') || defaultCustomerSheet);
  const [savedSheetHistory, setSavedSheetHistory] = useState<string[]>(() => getSavedSheetHistory('customers'));
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 1. RBAC Base Filtered List (Strictly isolated by user permissions)
  const userVisibleCustomers = useMemo(() => {
    return filterCustomersByRBAC(customers, currentUser, users);
  }, [customers, currentUser, users]);

  // Distinct branches & reps for dropdowns
  const availableBranches = useMemo(() => {
    const s = new Set<string>();
    userVisibleCustomers.forEach((c) => {
      if (c.branchName) s.add(c.branchName);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [userVisibleCustomers]);

  // Cascading Reps: When a branch is selected, show ONLY reps belonging to that branch
  const availableReps = useMemo(() => {
    const s = new Set<string>();
    userVisibleCustomers.forEach((c) => {
      if (selectedBranch === 'ALL' || isBranchMatch(c.branchName, selectedBranch)) {
        const r = c.salesRepName || c.repName;
        if (r) s.add(r);
      }
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [userVisibleCustomers, selectedBranch]);

  // If selectedRep is no longer valid after branch change, reset to 'ALL'
  useEffect(() => {
    if (selectedRep !== 'ALL' && !availableReps.includes(selectedRep)) {
      setSelectedRep('ALL');
    }
  }, [availableReps, selectedRep]);

  const availableRegions = useMemo(() => {
    const s = new Set<string>();
    userVisibleCustomers.forEach((c) => {
      const val = (c.region || c.district || c.route || '').trim();
      if (val && val !== '-' && val !== 'غير محدد') {
        s.add(val);
      }
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [userVisibleCustomers]);

  // Distinct Sheet Payment Terms with counts
  const availablePaymentTerms = useMemo(() => {
    const map = new Map<string, number>();
    userVisibleCustomers.forEach((c) => {
      const pt = (c.paymentTerms || '').trim();
      if (pt && pt !== '-' && pt !== 'غير محدد') {
        map.set(pt, (map.get(pt) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [userVisibleCustomers]);

  // Distinct Sheet Guarantee Docs with counts
  const availableGuaranteeDocs = useMemo(() => {
    const map = new Map<string, number>();
    userVisibleCustomers.forEach((c) => {
      const g = (c.guaranteeDocs || '').trim();
      if (g && g !== '-' && g !== 'غير محدد') {
        map.set(g, (map.get(g) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [userVisibleCustomers]);

  // Distinct Sheet Activity Types with counts (طبيعة النشاط)
  const availableActivityTypes = useMemo(() => {
    const map = new Map<string, number>();
    userVisibleCustomers.forEach((c) => {
      const a = (c.activityType || '').trim();
      if (a && a !== '-' && a !== 'غير محدد') {
        map.set(a, (map.get(a) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [userVisibleCustomers]);

  // Distinct Sheet Client Types with counts (خ/ك)
  const availableClientTypes = useMemo(() => {
    const map = new Map<string, number>();
    userVisibleCustomers.forEach((c) => {
      const ct = (c.clientType || '').trim();
      if (ct && ct !== '-' && ct !== 'غير محدد') {
        map.set(ct, (map.get(ct) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [userVisibleCustomers]);

  // Distinct Sheet Deal Eligibility with counts (قابل / غير)
  const availableDealEligibilities = useMemo(() => {
    const map = new Map<string, number>();
    userVisibleCustomers.forEach((c) => {
      const e = (c.dealEligibility || '').trim();
      if (e && e !== '-' && e !== 'غير محدد') {
        map.set(e, (map.get(e) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [userVisibleCustomers]);

  // Distinct Sheet Dealt in 2026 status with counts (متعامل 2026)
  const availableDealt2026 = useMemo(() => {
    const map = new Map<string, number>();
    userVisibleCustomers.forEach((c) => {
      const d = (c.dealt2026 || '').trim() || (c.hasDealtIn2026 ? 'متعامل' : 'غير متعامل');
      if (d) {
        map.set(d, (map.get(d) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [userVisibleCustomers]);

  // Distinct customer list for the customer slicer dropdown
  const availableCustomerOptions = useMemo(() => {
    let list = userVisibleCustomers;
    if (selectedBranch !== 'ALL') {
      list = list.filter((c) => isBranchMatch(c.branchName, selectedBranch));
    }
    if (selectedRep !== 'ALL') {
      list = list.filter((c) => {
        const r = c.salesRepName || c.repName || '';
        return isArabicNameMatch(r, selectedRep);
      });
    }
    return list.slice(0, 500); // Quick selection pool
  }, [userVisibleCustomers, selectedBranch, selectedRep]);

  // Dedicated single customer selected by the Slicer for executive dossier visual
  const selectedSlicerCustomer = useMemo(() => {
    if (selectedCustomerId === 'ALL') return null;
    return userVisibleCustomers.find((c) => c.id === selectedCustomerId || c.code === selectedCustomerId) || null;
  }, [selectedCustomerId, userVisibleCustomers]);

  // 1.5. Precomputed Customer Metrics Map (O(N) single-pass)
  // Evaluates Active Dealing per selected month and excludes Ineligibles
  const customerMetricsMap = useMemo(() => {
    const map = new Map<string, {
      id: string;
      customer: Customer;
      normalizedName: string;
      normalizedCode: string;
      normalizedPhone: string;
      normalizedRegion: string;
      normalizedRep: string;
      normalizedBranch: string;
      branchName: string;
      repName: string;
      balance: number;
      overdue: number;
      creditLimit: number;
      isOverLimit: boolean;
      sales2026: number;
      collections2026: number;
      periodSales: number;
      periodCollections: number;
      collectionRate: number;
      isExplicitIneligible: boolean;
      dealtInSelectedMonth: boolean;
      orderSummary: ReturnType<typeof getCustomerOrderSummary>;
    }>();

    userVisibleCustomers.forEach((c) => {
      const bal = c.currentBalance ?? c.balance ?? 0;
      const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? c.totalOverdue ?? c.dueUntilPeriod ?? 0;
      const limit = c.creditLimit || 0;
      const isOverLimit = limit > 0 && bal > limit;

      // 2026 Sales & Collections
      let monthlySalesSum = 0;
      if (c.monthlySales2026) {
        for (let m = 1; m <= 12; m++) {
          monthlySalesSum += Number(c.monthlySales2026[m]) || 0;
        }
      }
      const sales2026 = Math.max(c.sales2026 || 0, c.totalMonthlySales || 0, c.totalOverallSales || 0, monthlySalesSum);

      let monthlyColsSum = 0;
      if (c.monthlyCollections2026) {
        for (let m = 1; m <= 12; m++) {
          monthlyColsSum += Number(c.monthlyCollections2026[m]) || 0;
        }
      }
      const explicitCollections = Math.max(c.collections2026 || 0, c.totalMonthlyCollections || 0, c.totalOverallCollections || 0);
      const collections2026 = explicitCollections > 0 ? explicitCollections : monthlyColsSum;
      const collectionRate = sales2026 > 0 ? Math.round((collections2026 / sales2026) * 100) : 0;

      // Period-specific sales and collections (based on selectedMonth or quarter)
      let periodSales = sales2026;
      let periodCollections = collections2026;
      if (selectedMonth === 'Q1') {
        periodSales = (Number(c.monthlySales2026?.[1]) || 0) + (Number(c.monthlySales2026?.[2]) || 0) + (Number(c.monthlySales2026?.[3]) || 0);
        periodCollections = (Number(c.monthlyCollections2026?.[1]) || 0) + (Number(c.monthlyCollections2026?.[2]) || 0) + (Number(c.monthlyCollections2026?.[3]) || 0);
      } else if (selectedMonth === 'Q2') {
        periodSales = (Number(c.monthlySales2026?.[4]) || 0) + (Number(c.monthlySales2026?.[5]) || 0) + (Number(c.monthlySales2026?.[6]) || 0);
        periodCollections = (Number(c.monthlyCollections2026?.[4]) || 0) + (Number(c.monthlyCollections2026?.[5]) || 0) + (Number(c.monthlyCollections2026?.[6]) || 0);
      } else if (selectedMonth === 'Q3') {
        periodSales = (Number(c.monthlySales2026?.[7]) || 0) + (Number(c.monthlySales2026?.[8]) || 0) + (Number(c.monthlySales2026?.[9]) || 0);
        periodCollections = (Number(c.monthlyCollections2026?.[7]) || 0) + (Number(c.monthlyCollections2026?.[8]) || 0) + (Number(c.monthlyCollections2026?.[9]) || 0);
      } else if (selectedMonth === 'Q4') {
        periodSales = (Number(c.monthlySales2026?.[10]) || 0) + (Number(c.monthlySales2026?.[11]) || 0) + (Number(c.monthlySales2026?.[12]) || 0);
        periodCollections = (Number(c.monthlyCollections2026?.[10]) || 0) + (Number(c.monthlyCollections2026?.[11]) || 0) + (Number(c.monthlyCollections2026?.[12]) || 0);
      } else if (typeof selectedMonth === 'number') {
        periodSales = Number(c.monthlySales2026?.[selectedMonth]) || 0;
        periodCollections = Number(c.monthlyCollections2026?.[selectedMonth]) || 0;
      }

      // Ineligibility logic (غير قابل للتعامل / موقوف / ممتنع / مستبعد)
      const elig = normalizeArabicText(c.dealEligibility || '');
      const st = normalizeArabicText(c.status2026 || '');
      const debtSt = normalizeArabicText(c.debtStatus || '');
      const isExplicitIneligible = (
        elig.includes('غير') ||
        elig.includes('موقوف') ||
        elig.includes('ممتنع') ||
        elig.includes('مستبعد') ||
        st === 'blocked' ||
        debtSt.includes('متعثر')
      );

      // Dealing check in selected month / quarter (Active = has sales/invoice in the specified period)
      let dealtInSelectedMonth = false;
      if (selectedMonth === 'ALL') {
        dealtInSelectedMonth = Boolean(c.hasDealtIn2026 || sales2026 > 0 || (c.monthlySales2026 && Object.values(c.monthlySales2026).some((v) => Number(v) > 0)));
      } else {
        dealtInSelectedMonth = periodSales > 0;
      }

      map.set(c.id, {
        id: c.id,
        customer: c,
        normalizedName: normalizeArabicText(c.name || ''),
        normalizedCode: (c.code || '').trim().toLowerCase(),
        normalizedPhone: (c.phone || '').replace(/[^0-9]/g, ''),
        normalizedRegion: normalizeArabicText(c.region || ''),
        normalizedRep: normalizeArabicText(c.salesRepName || c.repName || ''),
        normalizedBranch: normalizeArabicText(c.branchName || ''),
        branchName: c.branchName || 'غير محدد',
        repName: c.salesRepName || c.repName || 'غير محدد',
        balance: bal,
        overdue,
        creditLimit: limit,
        isOverLimit,
        sales2026,
        collections2026,
        periodSales,
        periodCollections,
        collectionRate,
        isExplicitIneligible,
        dealtInSelectedMonth,
        orderSummary: getCustomerOrderSummary(c),
      });
    });

    return map;
  }, [userVisibleCustomers, selectedMonth]);

  // 2. Multi-Filter & Search Pipeline
  const filteredCustomers = useMemo(() => {
    let list = userVisibleCustomers;

    // Branch filter
    if (selectedBranch !== 'ALL') {
      list = list.filter((c) => isBranchMatch(c.branchName, selectedBranch));
    }

    // Rep filter
    if (selectedRep !== 'ALL') {
      list = list.filter((c) => {
        const r = c.salesRepName || c.repName || '';
        return isArabicNameMatch(r, selectedRep);
      });
    }

    // Customer specific filter (العميل)
    if (selectedCustomerId !== 'ALL') {
      list = list.filter((c) => c.id === selectedCustomerId || c.code === selectedCustomerId);
    }

    // Deal Eligibility Slicer (العملاء المتعامل والقابل والغير قابل من الشيت)
    if (dealEligibilityFilter !== 'ALL') {
      list = list.filter((c) => {
        const m = customerMetricsMap.get(c.id);
        if (!m) return false;
        if (dealEligibilityFilter === 'ineligible') return m.isExplicitIneligible;
        if (dealEligibilityFilter === 'eligible') return !m.isExplicitIneligible;
        if (dealEligibilityFilter === 'dealt') return !m.isExplicitIneligible && m.dealtInSelectedMonth;
        const e = (c.dealEligibility || '').trim();
        return e === dealEligibilityFilter || e.includes(dealEligibilityFilter);
      });
    }

    // Dealt 2026 Activity Slicer (متعامل 2026 من الشيت)
    if (dealtFilter !== 'ALL') {
      list = list.filter((c) => {
        const m = customerMetricsMap.get(c.id);
        const hasDealt = Boolean(c.hasDealtIn2026 || (m && m.sales2026 > 0) || (c.dealt2026 && (c.dealt2026.includes('متعامل') || c.dealt2026.includes('نعم'))));
        if (dealtFilter === 'dealt') return hasDealt;
        if (dealtFilter === 'not_dealt') return !hasDealt;
        return true;
      });
    }

    // Region / Route / District filter (الخط / المركز / المنطقة من الشيت)
    if (selectedRegion !== 'ALL') {
      const q = selectedRegion.toLowerCase();
      list = list.filter((c) => {
        const r = `${c.region || ''} ${c.district || ''} ${c.route || ''} ${c.address || ''}`.toLowerCase();
        return r.includes(q);
      });
    }

    // Activity 2026 filter
    if (activityFilter !== 'ALL') {
      if (activityFilter === 'active_2026') {
        list = list.filter((c) => {
          const m = customerMetricsMap.get(c.id);
          return m && (c.hasDealtIn2026 || m.sales2026 > 0);
        });
      } else if (activityFilter === 'inactive_2026') {
        list = list.filter((c) => {
          const m = customerMetricsMap.get(c.id);
          return m && !c.hasDealtIn2026 && m.sales2026 === 0;
        });
      } else if (activityFilter === 'churn_risk') {
        list = list.filter((c) => {
          const m = customerMetricsMap.get(c.id);
          return c.status2026 === 'churn_risk' || (c.sales2025 && c.sales2025 > 0 && (!m || m.sales2026 === 0));
        });
      } else if (activityFilter === 'new_customer') {
        list = list.filter((c) => {
          const m = customerMetricsMap.get(c.id);
          return c.status2026 === 'new_customer' || (m && m.sales2026 > 0 && !c.sales2025);
        });
      }
    }

    // Debt & Due filters
    if (debtFilter !== 'ALL') {
      if (debtFilter === 'highest_debt' || debtFilter === 'has_debt') {
        list = list.filter((c) => {
          const m = customerMetricsMap.get(c.id);
          return m && m.balance > 0;
        });
      } else if (debtFilter === 'lowest_debt') {
        list = list.filter((c) => {
          const m = customerMetricsMap.get(c.id);
          return m && m.balance > 0;
        });
      } else if (debtFilter === 'highest_overdue' || debtFilter === 'has_overdue') {
        list = list.filter((c) => {
          const m = customerMetricsMap.get(c.id);
          return m && m.overdue > 0;
        });
      } else if (debtFilter === 'zero_debt') {
        list = list.filter((c) => {
          const m = customerMetricsMap.get(c.id);
          return m && m.balance <= 0;
        });
      } else if (debtFilter === 'over_limit') {
        list = list.filter((c) => {
          const m = customerMetricsMap.get(c.id);
          return m && m.isOverLimit;
        });
      }
    }

    // Order filter
    if (orderFilter !== 'ALL') {
      list = list.filter((c) => {
        const m = customerMetricsMap.get(c.id);
        const orderSummary = m ? m.orderSummary : getCustomerOrderSummary(c);
        if (orderFilter === 'has_order') return orderSummary.hasOrder;
        if (orderFilter === 'active_order') return orderSummary.hasActiveOrder;
        if (orderFilter === 'no_order') return !orderSummary.hasOrder;
        return true;
      });
    }

    // Guarantee Documents filter (اوراق الضمان من الشيت)
    if (guaranteeFilter !== 'ALL') {
      list = list.filter((c) => {
        const g = (c.guaranteeDocs || '').toLowerCase();
        const amt = Number(c.guaranteeAmount || 0);
        const hasAmt = amt > 0;
        const isSigned = hasAmt || c.hasGuarantee === true || (g && !g.includes('بدون') && !g.includes('لا يوجد') && g !== '0') || (c.creditLimit && c.creditLimit > 0);

        if (guaranteeFilter === 'has_guarantee') return isSigned;
        if (guaranteeFilter === 'cheque') return g.includes('شيك') || (!g && (c.creditLimit || 0) > 0);
        if (guaranteeFilter === 'promissory') return g.includes('كمبيال');
        if (guaranteeFilter === 'trust_receipt') return g.includes('أمانة') || g.includes('امانة');
        if (guaranteeFilter === 'unsecured') return !isSigned;
        return (c.guaranteeDocs || '').trim() === guaranteeFilter || g.includes(guaranteeFilter.toLowerCase());
      });
    }

    // Payment Terms filter (طريقة الدفع من الشيت)
    if (paymentTermsFilter !== 'ALL') {
      list = list.filter((c) => {
        const terms = (c.paymentTerms || '').toLowerCase();
        if (paymentTermsFilter === 'كاش' || paymentTermsFilter === 'نقدي') return terms.includes('كاش') || terms.includes('نقدي') || terms.includes('فوري');
        if (paymentTermsFilter === 'على دفعات') return terms.includes('دفع') || terms.includes('قسط') || terms.includes('أقساط');
        if (paymentTermsFilter === 'شيكات') return terms.includes('شيك');
        if (paymentTermsFilter === 'آجل') return terms.includes('آجل') || terms.includes('اجل');
        return (c.paymentTerms || '').trim() === paymentTermsFilter || terms.includes(paymentTermsFilter.toLowerCase());
      });
    }

    // Activity Type filter (طبيعة النشاط من الشيت)
    if (activityTypeFilter !== 'ALL') {
      list = list.filter((c) => {
        const act = (c.activityType || '').trim();
        return act === activityTypeFilter || act.includes(activityTypeFilter);
      });
    }

    // Client Type filter (تصنيف خ/ك من الشيت)
    if (clientTypeFilter !== 'ALL') {
      list = list.filter((c) => {
        const cl = (c.clientType || '').trim();
        return cl === clientTypeFilter || cl.includes(clientTypeFilter);
      });
    }

    // Sales Tier filter
    if (salesTierFilter !== 'ALL') {
      list = list.filter((c) => {
        const m = customerMetricsMap.get(c.id);
        const s = m ? m.sales2026 : (c.sales2026 || c.totalMonthlySales || 0);
        if (salesTierFilter === 'vip_100k') return s >= 100000;
        if (salesTierFilter === 'medium_20k_100k') return s >= 20000 && s < 100000;
        if (salesTierFilter === 'starter_under_20k') return s > 0 && s < 20000;
        if (salesTierFilter === 'zero_sales') return s <= 0;
        return true;
      });
    }

    // Collection Rate filter
    if (collectionRateFilter !== 'ALL') {
      list = list.filter((c) => {
        const m = customerMetricsMap.get(c.id);
        const rate = m ? m.collectionRate : 0;
        if (collectionRateFilter === 'high_80') return rate >= 80;
        if (collectionRateFilter === 'medium_30_79') return rate >= 30 && rate < 80;
        if (collectionRateFilter === 'low_zero') return rate < 30;
        return true;
      });
    }

    // Visit filter
    if (visitFilter !== 'ALL') {
      list = list.filter((c) => {
        const hasVisit = !!c.lastVisitDate || (c.visitCount2026 && c.visitCount2026 > 0);
        if (visitFilter === 'visited_2026') return hasVisit;
        if (visitFilter === 'not_visited') return !hasVisit;
        return true;
      });
    }

    // Search query (Customer Name or Code or Phone)
    if (searchQuery.trim()) {
      const qNorm = normalizeArabicText(searchQuery);
      const digitsOnly = searchQuery.replace(/[^0-9]/g, '');
      list = list.filter((c) => {
        const m = customerMetricsMap.get(c.id);
        if (!m) return false;
        return (
          m.normalizedName.includes(qNorm) ||
          m.normalizedCode.includes(qNorm) ||
          (digitsOnly && m.normalizedPhone.includes(digitsOnly)) ||
          m.normalizedRegion.includes(qNorm) ||
          m.normalizedRep.includes(qNorm)
        );
      });
    }

    // Sorting Pipeline (Highest debt to lowest debt, etc.)
    list = [...list].sort((a, b) => {
      const mA = customerMetricsMap.get(a.id);
      const mB = customerMetricsMap.get(b.id);
      if (!mA || !mB) return 0;

      if (sortMode === 'highest_debt') return mB.balance - mA.balance;
      if (sortMode === 'lowest_debt') return mA.balance - mB.balance;
      if (sortMode === 'highest_overdue') return mB.overdue - mA.overdue;
      if (sortMode === 'highest_sales') return mB.sales2026 - mA.sales2026;
      if (sortMode === 'highest_collections') return mB.collections2026 - mA.collections2026;
      if (sortMode === 'name_asc') return (a.name || '').localeCompare(b.name || '', 'ar');
      if (sortMode === 'code_asc') return (a.code || '').localeCompare(b.code || '');
      if (sortMode === 'route_asc') {
        const locA = (a.route || a.district || a.region || a.address || '').trim();
        const locB = (b.route || b.district || b.region || b.address || '').trim();
        return locA.localeCompare(locB, 'ar');
      }

      if (sortBy === 'sales2026') {
        return sortOrder === 'asc' ? mA.sales2026 - mB.sales2026 : mB.sales2026 - mA.sales2026;
      }
      if (sortBy === 'collections2026') {
        return sortOrder === 'asc' ? mA.collections2026 - mB.collections2026 : mB.collections2026 - mA.collections2026;
      }
      if (sortBy === 'balance') {
        return sortOrder === 'asc' ? mA.balance - mB.balance : mB.balance - mA.balance;
      }
      if (sortBy === 'overdue') {
        return sortOrder === 'asc' ? mA.overdue - mB.overdue : mB.overdue - mA.overdue;
      }
      if (sortBy === 'creditLimit') {
        return sortOrder === 'asc' ? mA.creditLimit - mB.creditLimit : mB.creditLimit - mA.creditLimit;
      }
      if (sortBy === 'name') {
        return sortOrder === 'asc' ? (a.name || '').localeCompare(b.name || '', 'ar') : (b.name || '').localeCompare(a.name || '', 'ar');
      }
      if (sortBy === 'code') {
        return sortOrder === 'asc' ? (a.code || '').localeCompare(b.code || '') : (b.code || '').localeCompare(a.code || '');
      }

      return 0;
    });

    return list;
  }, [
    userVisibleCustomers,
    customerMetricsMap,
    selectedBranch,
    selectedRep,
    selectedCustomerId,
    dealEligibilityFilter,
    selectedRegion,
    activityFilter,
    debtFilter,
    orderFilter,
    guaranteeFilter,
    paymentTermsFilter,
    salesTierFilter,
    collectionRateFilter,
    visitFilter,
    searchQuery,
    sortMode,
    sortBy,
    sortOrder,
  ]);

  // Reset pagination on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBranch, selectedRep, selectedCustomerId, selectedMonth, dealEligibilityFilter, sortMode, selectedRegion, activityFilter, debtFilter, orderFilter, guaranteeFilter, visitFilter, paymentTermsFilter, salesTierFilter, collectionRateFilter, searchQuery, pageSize]);

  // Paginated Items
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(startIndex, startIndex + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredCustomers.length / pageSize) || 1;

  // 3. High-Level KPI Calculations (O(N) memoized pass)
  const kpiStats = useMemo(() => {
    let totalSales2025 = 0;
    let totalSales2026 = 0;
    let totalPeriodSales = 0;
    let totalCollections2025 = 0;
    let totalCollections2026 = 0;
    let totalPeriodCollections = 0;
    let totalDebt = 0;
    let totalOverdue = 0;
    let totalCreditLimit = 0;
    let overLimitCount = 0;
    let active2026Count = 0;
    let churnRiskCount = 0;
    let totalVisits2026 = 0;
    let customersWithOrdersCount = 0;
    let totalOrdersValue = 0;
    let guaranteedCount = 0;

    // Monthly Target & Active Customer counts
    let ineligibleCount = 0;
    let eligibleCount = 0;
    let dealtCount = 0;

    // Monthly totals for 2026
    const monthlySalesTotals: Record<number, number> = {};
    const monthlyCollectionTotals: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      monthlySalesTotals[m] = 0;
      monthlyCollectionTotals[m] = 0;
    }

    filteredCustomers.forEach((c) => {
      const m = customerMetricsMap.get(c.id);
      const s25 = c.sales2025 || 0;
      const s26 = m ? m.sales2026 : (c.sales2026 || 0);
      const pSales = m ? m.periodSales : s26;
      const c25 = c.collections2025 || 0;
      const c26 = m ? m.collections2026 : (c.collections2026 || 0);
      const pCols = m ? m.periodCollections : c26;
      const bal = m ? m.balance : (c.currentBalance ?? c.balance ?? 0);
      const overdue = m ? m.overdue : (c.totalOverdueAndDue ?? c.overdueBalance ?? c.totalOverdue ?? c.dueUntilPeriod ?? 0);
      const cLimit = m ? m.creditLimit : (c.creditLimit || 0);
      const g = (c.guaranteeDocs || '').toLowerCase();

      totalSales2025 += s25;
      totalSales2026 += s26;
      totalPeriodSales += pSales;
      totalCollections2025 += c25;
      totalCollections2026 += c26;
      totalPeriodCollections += pCols;
      totalDebt += bal;
      totalOverdue += overdue;
      totalCreditLimit += cLimit;
      if (cLimit > 0 && bal > cLimit) overLimitCount++;
      if ((g && !g.includes('بدون')) || cLimit > 0) guaranteedCount++;

      totalVisits2026 += c.visitCount2026 || (c.lastVisitDate ? 1 : 0);

      const orderSummary = m ? m.orderSummary : getCustomerOrderSummary(c);
      if (orderSummary.hasOrder) {
        customersWithOrdersCount++;
        totalOrdersValue += orderSummary.totalOrdersValue;
      }

      if (c.hasDealtIn2026 || s26 > 0) {
        active2026Count++;
      } else if (s25 > 0) {
        churnRiskCount++;
      }

      // Active / Eligible / Ineligible Calculation
      if (m?.isExplicitIneligible) {
        ineligibleCount++;
      } else {
        eligibleCount++;
        if (m?.dealtInSelectedMonth) {
          dealtCount++;
        }
      }

      if (c.monthlySales2026) {
        for (let mon = 1; mon <= 12; mon++) {
          monthlySalesTotals[mon] += c.monthlySales2026[mon] || 0;
        }
      }
      if (c.monthlyCollections2026) {
        for (let mon = 1; mon <= 12; mon++) {
          monthlyCollectionTotals[mon] += c.monthlyCollections2026[mon] || 0;
        }
      }
    });

    const salesGrowth = totalSales2025 > 0 ? Math.round(((totalSales2026 - totalSales2025) / totalSales2025) * 100) : (totalSales2026 > 0 ? 100 : 0);
    const collectionRate = totalSales2026 > 0 ? Math.round((totalCollections2026 / totalSales2026) * 100) : 0;
    const periodCollectionRate = totalPeriodSales > 0 ? Math.round((totalPeriodCollections / totalPeriodSales) * 100) : 0;
    const activeRate = filteredCustomers.length > 0 ? Math.round((active2026Count / filteredCustomers.length) * 100) : 0;
    const coverageRate = eligibleCount > 0 ? Math.round((dealtCount / eligibleCount) * 100) : 0;

    // Monthly Chart Data (Jan - Dec 2026)
    const monthlyChartData = MONTH_NAMES_AR.map((monthName, idx) => {
      const monthNum = idx + 1;
      return {
        month: monthName,
        'مبيعات 2026': monthlySalesTotals[monthNum] || 0,
        'تحصيلات 2026': monthlyCollectionTotals[monthNum] || 0,
      };
    });

    return {
      totalCount: filteredCustomers.length,
      active2026Count,
      activeRate,
      churnRiskCount,
      totalSales2025,
      totalSales2026,
      totalPeriodSales,
      salesGrowth,
      totalCollections2025,
      totalCollections2026,
      totalPeriodCollections,
      collectionRate,
      periodCollectionRate,
      totalDebt,
      totalOverdue,
      totalCreditLimit,
      overLimitCount,
      customersWithOrdersCount,
      totalOrdersValue,
      guaranteedCount,
      totalVisits2026,
      monthlyChartData,
      ineligibleCount,
      eligibleCount,
      dealtCount,
      coverageRate,
    };
  }, [filteredCustomers, customerMetricsMap]);

  // 3.5. Power BI Rep & Branch Financial Matrix (إجمالي المستحقات والمديونيات لكل مندوب وكل فرع)
  const repAndBranchSummary = useMemo(() => {
    const map = new Map<string, {
      branchName: string;
      repName: string;
      totalCustomers: number;
      ineligibleCustomers: number;
      eligibleCustomers: number;
      dealtCustomers: number;
      coverageRate: number;
      totalDebt: number;
      totalOverdue: number;
      totalSales: number;
      totalCollections: number;
      periodSales: number;
      periodCollections: number;
      periodCollectionRate: number;
      collectionRate: number;
    }>();

    filteredCustomers.forEach((c) => {
      const m = customerMetricsMap.get(c.id);
      if (!m) return;
      const key = `${m.branchName}:::${m.repName}`;
      let item = map.get(key);
      if (!item) {
        item = {
          branchName: m.branchName,
          repName: m.repName,
          totalCustomers: 0,
          ineligibleCustomers: 0,
          eligibleCustomers: 0,
          dealtCustomers: 0,
          coverageRate: 0,
          totalDebt: 0,
          totalOverdue: 0,
          totalSales: 0,
          totalCollections: 0,
          periodSales: 0,
          periodCollections: 0,
          periodCollectionRate: 0,
          collectionRate: 0,
        };
        map.set(key, item);
      }

      item.totalCustomers++;
      item.totalDebt += m.balance;
      item.totalOverdue += m.overdue;
      item.totalSales += m.sales2026;
      item.totalCollections += m.collections2026;

      // Period Sales & Collections (Month or Quarter)
      let pSales = m.sales2026;
      let pCols = m.collections2026;
      if (selectedMonth === 'Q1') {
        pSales = (Number(c.monthlySales2026?.[1]) || 0) + (Number(c.monthlySales2026?.[2]) || 0) + (Number(c.monthlySales2026?.[3]) || 0);
        pCols = (Number(c.monthlyCollections2026?.[1]) || 0) + (Number(c.monthlyCollections2026?.[2]) || 0) + (Number(c.monthlyCollections2026?.[3]) || 0);
      } else if (selectedMonth === 'Q2') {
        pSales = (Number(c.monthlySales2026?.[4]) || 0) + (Number(c.monthlySales2026?.[5]) || 0) + (Number(c.monthlySales2026?.[6]) || 0);
        pCols = (Number(c.monthlyCollections2026?.[4]) || 0) + (Number(c.monthlyCollections2026?.[5]) || 0) + (Number(c.monthlyCollections2026?.[6]) || 0);
      } else if (selectedMonth === 'Q3') {
        pSales = (Number(c.monthlySales2026?.[7]) || 0) + (Number(c.monthlySales2026?.[8]) || 0) + (Number(c.monthlySales2026?.[9]) || 0);
        pCols = (Number(c.monthlyCollections2026?.[7]) || 0) + (Number(c.monthlyCollections2026?.[8]) || 0) + (Number(c.monthlyCollections2026?.[9]) || 0);
      } else if (selectedMonth === 'Q4') {
        pSales = (Number(c.monthlySales2026?.[10]) || 0) + (Number(c.monthlySales2026?.[11]) || 0) + (Number(c.monthlySales2026?.[12]) || 0);
        pCols = (Number(c.monthlyCollections2026?.[10]) || 0) + (Number(c.monthlyCollections2026?.[11]) || 0) + (Number(c.monthlyCollections2026?.[12]) || 0);
      } else if (typeof selectedMonth === 'number') {
        pSales = Number(c.monthlySales2026?.[selectedMonth]) || 0;
        pCols = Number(c.monthlyCollections2026?.[selectedMonth]) || 0;
      }
      item.periodSales += pSales;
      item.periodCollections += pCols;

      if (m.isExplicitIneligible) {
        item.ineligibleCustomers++;
      } else {
        item.eligibleCustomers++;
        if (m.dealtInSelectedMonth) {
          item.dealtCustomers++;
        }
      }
    });

    return Array.from(map.values()).map((row) => ({
      ...row,
      coverageRate: row.eligibleCustomers > 0 ? Math.round((row.dealtCustomers / row.eligibleCustomers) * 100) : 0,
      collectionRate: row.totalSales > 0 ? Math.round((row.totalCollections / row.totalSales) * 100) : 0,
      periodCollectionRate: row.periodSales > 0 ? Math.round((row.periodCollections / row.periodSales) * 100) : 0,
    })).sort((a, b) => b.totalDebt - a.totalDebt || b.totalOverdue - a.totalOverdue);
  }, [filteredCustomers, customerMetricsMap, selectedMonth]);

  // Power BI Visuals Computations (Branches, Top Reps, Payment Terms Distribution)
  const branchAnalyticsData = useMemo(() => {
    const map = new Map<string, { branch: string; sales: number; collections: number; customers: number }>();
    filteredCustomers.forEach((c) => {
      const b = c.branchName || 'الفرع الرئيسي';
      const cur = map.get(b) || { branch: b, sales: 0, collections: 0, customers: 0 };
      const sumS = c.monthlySales2026 ? Object.values(c.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
      const s = Math.max(c.sales2026 || 0, c.totalMonthlySales || 0, sumS);
      const sumC = c.monthlyCollections2026 ? Object.values(c.monthlyCollections2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
      const col = Math.max(c.collections2026 || 0, c.totalMonthlyCollections || 0, sumC);
      cur.sales += s;
      cur.collections += col;
      cur.customers += 1;
      map.set(b, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [filteredCustomers]);

  const topRepsAnalyticsData = useMemo(() => {
    const map = new Map<string, { rep: string; sales: number; collections: number; customers: number }>();
    filteredCustomers.forEach((c) => {
      const r = c.salesRepName || c.repName;
      if (!r || r === 'غير محدد') return;
      const cur = map.get(r) || { rep: r, sales: 0, collections: 0, customers: 0 };
      const sumS = c.monthlySales2026 ? Object.values(c.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
      const s = Math.max(c.sales2026 || 0, c.totalMonthlySales || 0, sumS);
      const sumC = c.monthlyCollections2026 ? Object.values(c.monthlyCollections2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
      const col = Math.max(c.collections2026 || 0, c.totalMonthlyCollections || 0, sumC);
      cur.sales += s;
      cur.collections += col;
      cur.customers += 1;
      map.set(r, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales).slice(0, 8);
  }, [filteredCustomers]);

  const paymentGuaranteePieData = useMemo(() => {
    let cashCount = 0;
    let installmentsCount = 0;
    let chequesCount = 0;
    let creditCount = 0;
    filteredCustomers.forEach((c) => {
      const t = (c.paymentTerms || '').toLowerCase();
      if (t.includes('كاش') || t.includes('نقدي') || t.includes('فوري')) cashCount++;
      else if (t.includes('دفع') || t.includes('قسط') || t.includes('أقساط')) installmentsCount++;
      else if (t.includes('شيك')) chequesCount++;
      else creditCount++;
    });
    return [
      { name: 'كاش / فوري', value: cashCount, color: '#10B981' },
      { name: 'على دفعات', value: installmentsCount, color: '#F59E0B' },
      { name: 'شيكات بنكية', value: chequesCount, color: '#6366F1' },
      { name: 'آجل تجاري', value: creditCount, color: '#0EA5E9' },
    ].filter((d) => d.value > 0);
  }, [filteredCustomers]);

  // Activity Type & Client Type Analytics Data (طبيعة النشاط وتصنيف خ/ك من الشيت)
  const activityClientAnalyticsData = useMemo(() => {
    const actMap = new Map<string, { activity: string; count: number; sales: number; debt: number; collections: number }>();
    const clientMap = new Map<string, { clientType: string; count: number; sales: number; debt: number; collections: number }>();

    filteredCustomers.forEach((c) => {
      const act = (c.activityType || '').trim() || 'عام / غير محدد';
      const cl = (c.clientType || '').trim() || 'عادي / خط';
      const bal = c.currentBalance ?? c.balance ?? 0;
      const sales = c.sales2026 || c.totalMonthlySales || 0;
      const cols = c.collections2026 || c.totalMonthlyCollections || 0;

      const actItem = actMap.get(act) || { activity: act, count: 0, sales: 0, debt: 0, collections: 0 };
      actItem.count++;
      actItem.sales += sales;
      actItem.debt += bal;
      actItem.collections += cols;
      actMap.set(act, actItem);

      const clItem = clientMap.get(cl) || { clientType: cl, count: 0, sales: 0, debt: 0, collections: 0 };
      clItem.count++;
      clItem.sales += sales;
      clItem.debt += bal;
      clItem.collections += cols;
      clientMap.set(cl, clItem);
    });

    const colors = ['#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

    return {
      activities: Array.from(actMap.values()).sort((a, b) => b.sales - a.sales),
      clientTypes: Array.from(clientMap.values()).sort((a, b) => b.sales - a.sales).map((item, idx) => ({
        ...item,
        name: item.clientType,
        value: item.count,
        color: colors[idx % colors.length]
      })),
    };
  }, [filteredCustomers]);

  // 3.6. Run-Rate Analytics & Velocity (مقارنة الشهر الحالي بالسابق ورصد التراجع المبكر)
  const runRateAnalyticsData = useMemo(() => {
    const targetMonth = runRateSelectedMonth || 9;
    const prevMonth = targetMonth > 1 ? targetMonth - 1 : 12;

    const repMap = new Map<string, {
      repName: string;
      branchName: string;
      currSales: number;
      prevSales: number;
      currCols: number;
      prevCols: number;
      customersCount: number;
      activeInCurrMonth: number;
    }>();

    filteredCustomers.forEach((c) => {
      const rep = c.salesRepName || c.repName || 'غير محدد';
      if (!rep || rep === 'غير محدد') return;
      const branch = c.branchName || 'الفرع الرئيسي';
      const key = `${branch}:::${rep}`;

      let item = repMap.get(key);
      if (!item) {
        item = {
          repName: rep,
          branchName: branch,
          currSales: 0,
          prevSales: 0,
          currCols: 0,
          prevCols: 0,
          customersCount: 0,
          activeInCurrMonth: 0,
        };
        repMap.set(key, item);
      }

      const sCurr = Number(c.monthlySales2026?.[targetMonth]) || 0;
      const sPrev = Number(c.monthlySales2026?.[prevMonth]) || 0;
      const cCurr = Number(c.monthlyCollections2026?.[targetMonth]) || 0;
      const cPrev = Number(c.monthlyCollections2026?.[prevMonth]) || 0;

      item.currSales += sCurr;
      item.prevSales += sPrev;
      item.currCols += cCurr;
      item.prevCols += cPrev;
      item.customersCount += 1;
      if (sCurr > 0) item.activeInCurrMonth += 1;
    });

    const list = Array.from(repMap.values()).map((r) => {
      const salesDiff = r.currSales - r.prevSales;
      const growthRate = r.prevSales > 0
        ? Math.round((salesDiff / r.prevSales) * 100)
        : (r.currSales > 0 ? 100 : 0);
      
      let paceStatus: 'accelerating' | 'stable' | 'early_warning' = 'stable';
      if (growthRate >= 10) paceStatus = 'accelerating';
      else if (growthRate <= -15) paceStatus = 'early_warning';

      return {
        ...r,
        salesDiff,
        growthRate,
        paceStatus,
      };
    }).sort((a, b) => b.currSales - a.currSales);

    const totalCurr = list.reduce((acc, r) => acc + r.currSales, 0);
    const totalPrev = list.reduce((acc, r) => acc + r.prevSales, 0);
    const overallDiff = totalCurr - totalPrev;
    const overallGrowth = totalPrev > 0 ? Math.round((overallDiff / totalPrev) * 100) : (totalCurr > 0 ? 100 : 0);
    const acceleratingCount = list.filter((r) => r.paceStatus === 'accelerating').length;
    const warningCount = list.filter((r) => r.paceStatus === 'early_warning').length;

    return {
      targetMonth,
      prevMonth,
      targetMonthName: MONTH_NAMES_AR[targetMonth - 1] || `شهر ${targetMonth}`,
      prevMonthName: MONTH_NAMES_AR[prevMonth - 1] || `شهر ${prevMonth}`,
      list,
      totalCurr,
      totalPrev,
      overallGrowth,
      acceleratingCount,
      warningCount,
    };
  }, [filteredCustomers, runRateSelectedMonth]);

  // 3.7. Portfolio Balancing & Route Planning (موازنة محفظة كبار العملاء والمديونيات بين المناديب وتنظيم خطوط السير)
  const portfolioBalanceData = useMemo(() => {
    const repMap = new Map<string, {
      repName: string;
      branchName: string;
      totalCustomers: number;
      vipCustomers: number;
      totalDebt: number;
      totalSales2026: number;
      totalOverdue: number;
    }>();

    const routeMap = new Map<string, {
      route: string;
      branchName: string;
      customersCount: number;
      repsSet: Set<string>;
      totalDebt: number;
      totalSales: number;
    }>();

    let branchTotalDebt = 0;
    let branchTotalCustomers = 0;

    filteredCustomers.forEach((c) => {
      const rep = c.salesRepName || c.repName || 'غير محدد';
      const branch = c.branchName || 'الفرع الرئيسي';
      const bal = c.currentBalance ?? c.balance ?? 0;
      const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
      const sales = c.sales2026 ?? 0;
      const isVip = bal > 40000 || sales > 50000 || (c.creditLimit || 0) > 50000;

      branchTotalDebt += bal;
      branchTotalCustomers += 1;

      // Rep aggregation
      const repKey = `${branch}:::${rep}`;
      let rItem = repMap.get(repKey);
      if (!rItem) {
        rItem = {
          repName: rep,
          branchName: branch,
          totalCustomers: 0,
          vipCustomers: 0,
          totalDebt: 0,
          totalSales2026: 0,
          totalOverdue: 0,
        };
        repMap.set(repKey, rItem);
      }
      rItem.totalCustomers += 1;
      if (isVip) rItem.vipCustomers += 1;
      rItem.totalDebt += bal;
      rItem.totalSales2026 += sales;
      rItem.totalOverdue += overdue;

      // Route / District aggregation
      const rawRoute = (c.route || c.district || c.region || c.address?.split(/[\s,،-]+/)?.[0] || 'خط عام').trim();
      const routeKey = `${branch}:::${rawRoute}`;
      let routeItem = routeMap.get(routeKey);
      if (!routeItem) {
        routeItem = {
          route: rawRoute,
          branchName: branch,
          customersCount: 0,
          repsSet: new Set<string>(),
          totalDebt: 0,
          totalSales: 0,
        };
        routeMap.set(routeKey, routeItem);
      }
      routeItem.customersCount += 1;
      if (rep && rep !== 'غير محدد') routeItem.repsSet.add(rep);
      routeItem.totalDebt += bal;
      routeItem.totalSales += sales;
    });

    const reps = Array.from(repMap.values()).map((r) => {
      const debtShare = branchTotalDebt > 0 ? Math.round((r.totalDebt / branchTotalDebt) * 100) : 0;
      const customerShare = branchTotalCustomers > 0 ? Math.round((r.totalCustomers / branchTotalCustomers) * 100) : 0;
      
      let concentrationRisk: 'high' | 'medium' | 'balanced' = 'balanced';
      if (debtShare >= 40 || customerShare >= 40) concentrationRisk = 'high';
      else if (debtShare >= 25 || customerShare >= 25) concentrationRisk = 'medium';

      return {
        ...r,
        debtShare,
        customerShare,
        concentrationRisk,
      };
    }).sort((a, b) => b.totalDebt - a.totalDebt);

    const routes = Array.from(routeMap.values()).map((rt) => ({
      ...rt,
      repsList: Array.from(rt.repsSet).join('، '),
    })).sort((a, b) => b.customersCount - a.customersCount);

    const highConcentrationCount = reps.filter((r) => r.concentrationRisk === 'high').length;

    return {
      reps,
      routes,
      branchTotalDebt,
      branchTotalCustomers,
      highConcentrationCount,
    };
  }, [filteredCustomers]);

  // Handle Log Visit Action
  const handleSaveVisit = () => {
    if (!selectedCustomer) return;
    if (!currentUser) return;

    // Build the visit payload and delegate to addVisit from AppContext.
    // addVisit properly persists the visit to:
    //   - visits state (visible in VisitsDashboard immediately)
    //   - IndexedDB visits store (survives page reload)
    //   - Supabase visits table (cross-device sync)
    //   - customer's visitHistory in both state and IndexedDB
    const collectedAmount = visitCollected ? parseFloat(visitCollected) : undefined;

    const { success, message } = addVisit({
      customerId: selectedCustomer.id,
      date: visitDate,
      repName: currentUser.name || 'المندوب',
      repId: currentUser.id,
      type: visitType,
      outcome: visitOutcome,
      collectedAmount,
      notes: visitNotes,
      branchName: currentUser.branchName || selectedCustomer.branchName || '',
      supervisorId: currentUser.supervisorId,
    });

    if (success) {
      // Refresh locally-selected customer so the dossier UI reflects the visit
      const refreshed = customers.find((c) => c.id === selectedCustomer.id) || selectedCustomer;
      setSelectedCustomer(refreshed);
    } else {
      console.warn('Failed to log visit:', message);
    }

    setIsLoggingVisit(false);
    setVisitNotes('');
    setVisitCollected('');
  };

  // Power BI Active Slicers Count & Reset Handler
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedBranch !== 'ALL') count++;
    if (selectedRep !== 'ALL') count++;
    if (selectedCustomerId !== 'ALL') count++;
    if (selectedRegion !== 'ALL') count++;
    if (selectedMonth !== 'ALL') count++;
    if (dealEligibilityFilter !== 'ALL') count++;
    if (dealtFilter !== 'ALL') count++;
    if (paymentTermsFilter !== 'ALL') count++;
    if (guaranteeFilter !== 'ALL') count++;
    if (activityTypeFilter !== 'ALL') count++;
    if (clientTypeFilter !== 'ALL') count++;
    if (debtFilter !== 'ALL') count++;
    if (activityFilter !== 'ALL') count++;
    if (salesTierFilter !== 'ALL') count++;
    if (collectionRateFilter !== 'ALL') count++;
    if (orderFilter !== 'ALL') count++;
    if (visitFilter !== 'ALL') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [
    selectedBranch, selectedRep, selectedCustomerId, selectedRegion,
    selectedMonth, dealEligibilityFilter, dealtFilter, paymentTermsFilter,
    guaranteeFilter, activityTypeFilter, clientTypeFilter, debtFilter,
    activityFilter, salesTierFilter, collectionRateFilter, orderFilter,
    visitFilter, searchQuery
  ]);

  const handleResetAllSlicers = () => {
    setSearchQuery('');
    setSelectedBranch('ALL');
    setSelectedRep('ALL');
    setSelectedCustomerId('ALL');
    setSelectedRegion('ALL');
    setSelectedMonth('ALL');
    setDealEligibilityFilter('ALL');
    setDealtFilter('ALL');
    setPaymentTermsFilter('ALL');
    setGuaranteeFilter('ALL');
    setActivityTypeFilter('ALL');
    setClientTypeFilter('ALL');
    setDebtFilter('ALL');
    setSalesTierFilter('ALL');
    setCollectionRateFilter('ALL');
    setActivityFilter('ALL');
    setOrderFilter('ALL');
    setVisitFilter('ALL');
    setSortMode('highest_debt');
  };

  // Google Sheets Live Sync
  const handleSyncGoogleSheet = async () => {
    if (!googleSheetUrl) return;
    const cleanUrl = googleSheetUrl.trim();
    saveSingleSourceUrl('customers', cleanUrl);
    setSavedSheetHistory(getSavedSheetHistory('customers'));
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const result = await fetchDetailedCustomersFromGoogleSheet(cleanUrl);
      if (!result.customers || result.customers.length === 0) {
        setSyncStatus({ type: 'error', message: 'لم يتم العثور على أي عملاء في الرابط.' });
      } else {
        importCustomersList(result.customers, 'replace');
        const dupesMsg = (result as any).duplicatesCount
          ? ` (تم دمج وتوحيد ${(result as any).duplicatesCount} سجل مكرر من إجمالي ${(result as any).totalRows || result.customers.length} سطر)`
          : '';
        setSyncStatus({
          type: 'success',
          message: `تم بنجاح استيراد ومزامنة ${result.customers.length} عميل بالبيانات والمبيعات الكاملة (مطابقة تامة للشيت بدون تكرار) وحفظ الرابط دائماً في المنظومة${dupesMsg}!`,
        });
      }
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: err?.message || 'فشل الاتصال بجوجل شيت' });
    } finally {
      setIsSyncing(false);
    }
  };

  // Excel File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const result = await parseDetailedCustomersExcel(file);
      if (!result.customers || result.customers.length === 0) {
        setSyncStatus({ type: 'error', message: 'الملف فارغ أو غير متوافق.' });
      } else {
        importCustomersList(result.customers, 'replace');
        const dupesMsg = (result as any).duplicatesCount
          ? ` (تم دمج وتوحيد ${(result as any).duplicatesCount} سجل مكرر من إجمالي ${(result as any).totalRows || result.customers.length} سطر)`
          : '';
        setSyncStatus({
          type: 'success',
          message: `تم قراءة واستيراد وتوحيد ${result.customers.length} عميل بنجاح (مطابقة تامة للشيت بدون تكرار) مع المبيعات والتحصيلات${dupesMsg}!`,
        });
      }
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: err?.message || 'حدث خطأ أثناء قراءة ملف الإكسل' });
    } finally {
      setIsSyncing(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in pb-12">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center font-black">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span>كافة العملاء والتحليل الشامل 2026</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold border border-amber-200">
                  {filteredCustomers.length.toLocaleString()} عميل
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {isRep
                  ? `ملفات وتحليلات العملاء المسندين لك (${currentUser?.name}) - مقارنة مبيعات وتحصيلات 2025 / 2026 ومتابعة الزيارات والمديونية`
                  : isSupervisor
                  ? `تحليل عملاء مناديب فريقك بـ (${currentUser?.branchName}) - مراقبة النشاط والمبيعات والتحصيل والزيارات`
                  : isBranchManager
                  ? `قاعدة عملاء (${currentUser?.branchName}) - تقييم المبيعات الشهرية والتحصيلات والديون`
                  : 'التحليل الشامل لكافة عملاء الفروع الـ 7 - مقارنات المبيعات، التحصيلات الشهرية، ومؤشرات الأداء'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {/* Clean & Deduplicate Button (Prevents 3000 to 6000 duplicate explosion) */}
          {isAdminOrDev && (
            <button
              id="analytics-deduplicate-btn"
              type="button"
              onClick={handleRunDeduplication}
              className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-2 rounded-xl text-xs font-black shadow-xs transition cursor-pointer whitespace-nowrap"
              title="فحص قاعدة البيانات ومنع أي تكرار ناتج عن تحديث الشيتات اليومية لضمان ثبات عدد العملاء (3000 عميل فريد)"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>منع وتنقية التكرار (3,000 عميل)</span>
            </button>
          )}

          {/* BI Analytics Charts Toggle */}
          <button
            id="analytics-toggle-charts-btn"
            type="button"
            onClick={() => setShowCharts(!showCharts)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer whitespace-nowrap ${
              showCharts
                ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>{showCharts ? 'إخفاء لوحة Power BI' : 'لوحة تحليلات Power BI 📊'}</span>
          </button>

          {/* Export & Import (Admin, Dev, Branch Manager) */}
          {isAdminOrDev && (
            <button
              id="analytics-sync-sheet-btn"
              type="button"
              onClick={() => setIsSyncModalOpen(true)}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 px-3.5 py-2 rounded-xl text-xs font-black shadow-sm transition border border-slate-750 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>مزامنة شيت المديونية / إكسل 📥</span>
            </button>
          )}

          <button
            id="analytics-export-excel-btn"
            type="button"
            onClick={() => exportCustomerAnalyticsToExcel(filteredCustomers, 'كافة_العملاء_دريم')}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer whitespace-nowrap"
            title="تصدير كشف التحليل بالكامل كملف Excel"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير Excel</span>
          </button>
        </div>
      </div>

      {/* Deduplication Notice Notification Banner */}
      {dedupeNotice && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3 text-xs font-bold shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-emerald-950 font-black">{dedupeNotice}</p>
              <p className="text-emerald-700 text-[11px] font-medium mt-0.5">
                النظام يقوم تلقائياً بمطابقة وتحديث البيانات اليومية دون إنشاء عملاء مكررين.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDedupeNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1 rounded-lg hover:bg-emerald-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Power BI Financial Summary Cards (Top Highlighted Executive Ribbon) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Debts */}
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white rounded-2xl p-4 border border-indigo-500/30 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-indigo-300 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-indigo-400" />
              <span>إجمالي المديونية الحالية (Total Debts)</span>
            </span>
            <span className="text-[10px] bg-indigo-500/20 text-indigo-200 px-2 py-0.5 rounded-full font-bold border border-indigo-400/30">
              {filteredCustomers.filter(c => (customerMetricsMap.get(c.id)?.balance || 0) > 0).length.toLocaleString()} مدين
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white mt-2 tracking-tight" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(kpiStats.totalDebt)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>إجمالي أرصدة مديونيات العملاء المحددين</span>
            <span className="text-indigo-300 font-bold">
              {selectedBranch === 'ALL' ? 'كافة الفروع' : selectedBranch}
            </span>
          </div>
        </div>

        {/* Card 2: Total Dues / Overdue */}
        <div className="bg-gradient-to-br from-rose-950 via-slate-900 to-slate-950 text-white rounded-2xl p-4 border border-rose-500/30 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-400"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-rose-300 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span>إجمالي المستحقات الواجبة (Total Dues)</span>
            </span>
            <span className="text-[10px] bg-rose-500/20 text-rose-200 px-2 py-0.5 rounded-full font-bold border border-rose-400/30">
              {filteredCustomers.filter(c => (customerMetricsMap.get(c.id)?.overdue || 0) > 0).length.toLocaleString()} مستحق
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-400 mt-2 tracking-tight" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(kpiStats.totalOverdue)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>فواتير ومستحقات واجبة التحصيل الفوري</span>
            <span className="text-rose-400 font-bold">تحصيل عاجل</span>
          </div>
        </div>

        {/* Card 3: Active Monthly Coverage Target */}
        <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 text-white rounded-2xl p-4 border border-emerald-500/30 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>تغطية العملاء المتعاملين (Active Rate)</span>
            </span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold border border-emerald-400/30">
              {selectedMonth === 'ALL' ? 'عام 2026' : `شهر ${selectedMonth}`}
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2 tracking-tight">
            {kpiStats.dealtCount.toLocaleString()}{' '}
            <span className="text-sm font-semibold text-slate-300">من {kpiStats.eligibleCount.toLocaleString()} قابل</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span className="text-emerald-300 font-black">
              نسبة التغطية: {kpiStats.coverageRate}%
            </span>
            <span className="text-slate-500 text-[10px]">
              (استبعاد {kpiStats.ineligibleCount} غير قابل)
            </span>
          </div>
        </div>

        {/* Card 4: 2026 Sales & Collection Rate */}
        <div className="bg-gradient-to-br from-sky-950 via-slate-900 to-slate-950 text-white rounded-2xl p-4 border border-sky-500/30 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-sky-500 via-blue-500 to-teal-400"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-sky-300 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span>
                {selectedMonth === 'ALL'
                  ? 'مبيعات وتحصيلات 2026'
                  : `مبيعات وتحصيلات ${selectedMonth === 'Q1' ? 'الربع الأول Q1' : selectedMonth === 'Q2' ? 'الربع الثاني Q2' : selectedMonth === 'Q3' ? 'الربع الثالث Q3' : selectedMonth === 'Q4' ? 'الربع الرابع Q4' : `شهر ${selectedMonth} (${MONTH_NAMES_AR[Number(selectedMonth) - 1]})`}`}
              </span>
            </span>
            <span className="text-[10px] bg-sky-500/20 text-sky-200 px-2 py-0.5 rounded-full font-bold border border-sky-400/30">
              كفاءة {selectedMonth === 'ALL' ? kpiStats.collectionRate : kpiStats.periodCollectionRate}%
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white mt-2 tracking-tight truncate" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(selectedMonth === 'ALL' ? kpiStats.totalSales2026 : kpiStats.totalPeriodSales)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between flex-wrap gap-1">
            <span>المحصل: <strong className="text-emerald-400 font-mono">{formatMoney(selectedMonth === 'ALL' ? kpiStats.totalCollections2026 : kpiStats.totalPeriodCollections)}</strong></span>
            {selectedMonth === 'ALL' ? (
              <span className="text-sky-400 font-bold">{kpiStats.salesGrowth >= 0 ? `+${kpiStats.salesGrowth}% نمو` : `${kpiStats.salesGrowth}%`}</span>
            ) : (
              <span className="text-slate-400 text-[10px]">المجمع 2026: {formatMoney(kpiStats.totalSales2026)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Power BI Executive KPI Cards (Top Accent Colored Stripes & High Contrast) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
        {/* Total Customers */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200 border-t-4 border-t-slate-700 shadow-xs hover:shadow-md transition">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>إجمالي العملاء</span>
            <Users className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-lg font-black text-slate-900 mt-1">
            {kpiStats.totalCount.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-semibold">
            {kpiStats.dealtCount.toLocaleString()} متعامل ({kpiStats.coverageRate}%)
          </div>
        </div>

        {/* 2026 Sales & Growth */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200 border-t-4 border-t-[#0078d4] shadow-xs hover:shadow-md transition">
          <div className="text-[11px] font-bold text-[#0078d4] flex items-center justify-between">
            <span>{selectedMonth === 'ALL' ? 'مبيعات 2026' : `مبيعات ${selectedMonth}`}</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#0078d4]" />
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 mt-1 truncate" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(selectedMonth === 'ALL' ? kpiStats.totalSales2026 : kpiStats.totalPeriodSales)}
          </div>
          <div className="text-[10px] text-slate-600 font-bold mt-0.5 flex items-center gap-0.5">
            {selectedMonth === 'ALL' ? (
              <>
                {kpiStats.salesGrowth >= 0 ? (
                  <span className="text-emerald-600 flex items-center font-black">
                    <ArrowUpRight className="w-3 h-3" /> +{kpiStats.salesGrowth}%
                  </span>
                ) : (
                  <span className="text-rose-600 flex items-center font-black">
                    <ArrowDownRight className="w-3 h-3" /> {kpiStats.salesGrowth}%
                  </span>
                )}
                <span className="text-slate-400">عن 2025</span>
              </>
            ) : (
              <span className="text-slate-500 font-normal">المجمع: {formatMoney(kpiStats.totalSales2026)}</span>
            )}
          </div>
        </div>

        {/* 2026 Collections */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200 border-t-4 border-t-[#107c41] shadow-xs hover:shadow-md transition">
          <div className="text-[11px] font-bold text-[#107c41] flex items-center justify-between">
            <span>{selectedMonth === 'ALL' ? 'تحصيلات 2026' : `تحصيلات ${selectedMonth}`}</span>
            <DollarSign className="w-3.5 h-3.5 text-[#107c41]" />
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 mt-1 truncate" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(selectedMonth === 'ALL' ? kpiStats.totalCollections2026 : kpiStats.totalPeriodCollections)}
          </div>
          <div className="text-[10px] text-[#107c41] font-extrabold mt-0.5">
            {selectedMonth === 'ALL' ? kpiStats.collectionRate : kpiStats.periodCollectionRate}% نسبة التحصيل
          </div>
        </div>

        {/* Current Debt */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200 border-t-4 border-t-[#673ab7] shadow-xs hover:shadow-md transition">
          <div className="text-[11px] font-bold text-[#673ab7] flex items-center justify-between">
            <span>المديونية الحالية</span>
            <CreditCard className="w-3.5 h-3.5 text-[#673ab7]" />
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 mt-1 truncate" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(kpiStats.totalDebt)}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
            إجمالي رصيد العملاء
          </div>
        </div>

        {/* Overdue & Due Balances */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200 border-t-4 border-t-[#d83b01] shadow-xs hover:shadow-md transition">
          <div className="text-[11px] font-bold text-[#d83b01] flex items-center justify-between">
            <span>المستحقات والمتأخرات</span>
            <AlertCircle className="w-3.5 h-3.5 text-[#d83b01]" />
          </div>
          <div className="text-base sm:text-lg font-black text-[#d83b01] mt-1 truncate" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(kpiStats.totalOverdue)}
          </div>
          <div className="text-[10px] text-rose-600 font-bold mt-0.5">
            واجبة التحصيل الفوري
          </div>
        </div>

        {/* Credit Limit & Guarantees */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200 border-t-4 border-t-[#ffb900] shadow-xs hover:shadow-md transition">
          <div className="text-[11px] font-bold text-amber-800 flex items-center justify-between">
            <span>الحد والضمانات</span>
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 mt-1 truncate" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(kpiStats.totalCreditLimit)}
          </div>
          <div className="text-[10px] text-slate-600 font-bold mt-0.5 flex items-center justify-between">
            <span className="text-emerald-700 font-black">{kpiStats.guaranteedCount} بضمان</span>
            {kpiStats.overLimitCount > 0 && (
              <span className="text-rose-600 font-black">({kpiStats.overLimitCount} تجاوز)</span>
            )}
          </div>
        </div>

        {/* Sales Orders */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200 border-t-4 border-t-[#008272] shadow-xs hover:shadow-md transition">
          <div className="text-[11px] font-bold text-[#008272] flex items-center justify-between">
            <span>أوامر البيع والطلبيات</span>
            <ShoppingCart className="w-3.5 h-3.5 text-[#008272]" />
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 mt-1 truncate">
            {kpiStats.customersWithOrdersCount} عميل
          </div>
          <div className="text-[10px] text-[#008272] font-bold mt-0.5 truncate" title={isPrivacyMode ? 'مخفي' : undefined}>
            قيمة: {formatMoney(kpiStats.totalOrdersValue)}
          </div>
        </div>
      </div>

      {/* Power BI Multi-Visual Interactive Dashboard */}
      {showCharts && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4 animate-in slide-in-from-top-3">
          {/* Visual Header & Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-500" />
                <span>تحليلات ومؤشرات Power BI التنفيذية لعام 2026</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                مخططات بيانية تفاعلية تستجيب فوراً لجميع الفلاتر والتقسيمات المختارة
              </p>
            </div>

            {/* Slicer Tabs for Charts */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveChartTab('monthly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap ${
                  activeChartTab === 'monthly'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📅 المسار السنوي
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('run_rate')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  activeChartTab === 'run_rate'
                    ? 'bg-white text-blue-900 shadow-xs ring-1 ring-blue-300'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-blue-600" />
                <span>📈 معدل السرعة والمسار (Run-rate)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('portfolio_balance')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  activeChartTab === 'portfolio_balance'
                    ? 'bg-white text-purple-900 shadow-xs ring-1 ring-purple-300'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Scale className="w-3.5 h-3.5 text-purple-600" />
                <span>⚖️ موازنة المحفظة وخطوط السير</span>
              </button>
              {isAdminOrDev && (
                <button
                  type="button"
                  onClick={() => setActiveChartTab('branches')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap ${
                    activeChartTab === 'branches'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🏢 مقارنة الفروع الـ 7
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveChartTab('reps')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap ${
                  activeChartTab === 'reps'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🏆 أعلى المناديب
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('matrix')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap ${
                  activeChartTab === 'matrix'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📊 مصفوفة الفروع والمناديب
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('activity_client')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  activeChartTab === 'activity_client'
                    ? 'bg-white text-emerald-900 shadow-xs ring-1 ring-emerald-300'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Store className="w-3.5 h-3.5 text-emerald-600" />
                <span>🏬 طبيعة النشاط وتصنيف خ/ك</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('payment_guarantee')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  activeChartTab === 'payment_guarantee'
                    ? 'bg-white text-slate-900 shadow-xs ring-1 ring-amber-300'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                <span>💳 طرق الدفع والضمانات</span>
              </button>
            </div>
          </div>

          {/* Tab 1: Monthly Sales & Collections */}
          {activeChartTab === 'monthly' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-bold">مقارنة حركة المبيعات والتحصيلات على مدار 12 شهراً لعام 2026:</span>
              </div>
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kpiStats.monthlyChartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748B' }}
                      tickFormatter={(v) => (isPrivacyMode ? '•••' : `${(v / 1000).toFixed(0)}k`)}
                    />
                    <Tooltip
                      formatter={(val: any) => formatMoney(Number(val) || 0)}
                      contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none' }}
                    />
                    <Legend />
                    <Bar dataKey="مبيعات 2026" fill="#0284c7" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="تحصيلات 2026" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tab 2: Branch Comparison (Admin/Developer only - excludes rep, supervisor, branch manager) */}
          {isAdminOrDev && activeChartTab === 'branches' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-bold">ترتيب وأداء الفروع حسب المبيعات والتحصيلات في 2026:</span>
                <span className="font-bold text-slate-700">{branchAnalyticsData.length} فروع مفحوصة</span>
              </div>
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={branchAnalyticsData}
                    onClick={(data: any) => {
                      if (data && data.activeLabel) {
                        setSelectedBranch(data.activeLabel);
                        setSelectedRep('ALL');
                        setSelectedCustomerId('ALL');
                      }
                    }}
                    className="cursor-pointer"
                    margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="branch" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748B' }}
                      tickFormatter={(v) => (isPrivacyMode ? '•••' : `${(v / 1000).toFixed(0)}k`)}
                    />
                    <Tooltip
                      formatter={(val: any) => formatMoney(Number(val) || 0)}
                      contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none' }}
                    />
                    <Legend />
                    <Bar dataKey="sales" name="إجمالي مبيعات 2026" fill="#0078d4" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="collections" name="إجمالي تحصيلات 2026" fill="#107c41" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tab 3: Top Sales Reps */}
          {activeChartTab === 'reps' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-bold">أفضل 8 مناديب مبيعات من حيث حجم المبيعات والتحصيل:</span>
                <span className="font-bold text-slate-700">ترتيب تنازلي</span>
              </div>
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topRepsAnalyticsData}
                    layout="vertical"
                    onClick={(data: any) => {
                      if (data && data.activeLabel) {
                        setSelectedRep(data.activeLabel);
                        setSelectedCustomerId('ALL');
                      }
                    }}
                    className="cursor-pointer"
                    margin={{ top: 10, right: 20, left: 30, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: '#64748B' }}
                      tickFormatter={(v) => (isPrivacyMode ? '•••' : `${(v / 1000).toFixed(0)}k`)}
                    />
                    <YAxis dataKey="rep" type="category" tick={{ fontSize: 11, fill: '#334155' }} width={90} />
                    <Tooltip
                      formatter={(val: any) => formatMoney(Number(val) || 0)}
                      contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none' }}
                    />
                    <Legend />
                    <Bar dataKey="sales" name="مبيعات المندوب" fill="#0284c7" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="collections" name="تحصيلات المندوب" fill="#10B981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tab 5: Power BI Matrix (مصفوفة أداء الفروع والمناديب) */}
          {activeChartTab === 'matrix' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="font-bold text-slate-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                  <span>مصفوفة Power BI المالية والتنفيذية للفروع والمناديب (المستحقات، المديونيات، التغطية، والمبيعات):</span>
                </div>
                <div className="text-slate-500 font-medium">
                  مبنية وفق الفلاتر النشطة ({repAndBranchSummary.length} صف ملخص)
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-slate-100 font-extrabold border-b border-slate-800 whitespace-nowrap">
                      <th className="p-2.5">الفرع</th>
                      <th className="p-2.5">المندوب</th>
                      <th className="p-2.5 text-center">إجمالي العملاء</th>
                      <th className="p-2.5 text-center text-rose-300">غير قابل ⛔</th>
                      <th className="p-2.5 text-center text-sky-300">قابل للتعامل ⏳</th>
                      <th className="p-2.5 text-center text-emerald-300">متعامل ✅</th>
                      <th className="p-2.5 text-center text-amber-300">نسبة التغطية %</th>
                      <th className="p-2.5 text-left text-purple-300">إجمالي المديونية</th>
                      <th className="p-2.5 text-left text-rose-300">إجمالي المستحقات</th>
                      <th className="p-2.5 text-left text-sky-300">مبيعات 2026</th>
                      <th className="p-2.5 text-left text-emerald-300">تحصيلات 2026</th>
                      <th className="p-2.5 text-center">نسبة التحصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {repAndBranchSummary.map((row, rIdx) => (
                      <tr key={`${row.branchName}-${row.repName}-${rIdx}`} className="hover:bg-slate-50/80 transition">
                        <td
                          className="p-2.5 font-black text-blue-700 hover:text-blue-900 hover:underline cursor-pointer whitespace-nowrap"
                          onClick={() => {
                            setSelectedBranch(row.branchName);
                            setSelectedRep('ALL');
                            setSelectedCustomerId('ALL');
                          }}
                          title="تصفية السلايسر بهذا الفرع 🔍"
                        >
                          {row.branchName} <span className="text-[10px] text-blue-500 font-normal">🔍</span>
                        </td>
                        <td
                          className="p-2.5 font-bold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer whitespace-nowrap"
                          onClick={() => {
                            setSelectedBranch(row.branchName);
                            setSelectedRep(row.repName);
                            setSelectedCustomerId('ALL');
                          }}
                          title="تصفية السلايسر بهذا المندوب 🔍"
                        >
                          {row.repName} <span className="text-[10px] text-indigo-500 font-normal">🔍</span>
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-900">
                          {row.totalCustomers.toLocaleString()}
                        </td>
                        <td className="p-2.5 text-center font-bold text-rose-700">
                          {row.ineligibleCustomers.toLocaleString()}
                        </td>
                        <td className="p-2.5 text-center font-bold text-sky-700">
                          {row.eligibleCustomers.toLocaleString()}
                        </td>
                        <td className="p-2.5 text-center font-black text-emerald-700">
                          {row.dealtCustomers.toLocaleString()}
                        </td>
                        <td className="p-2.5 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-black ${
                            row.coverageRate >= 70
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.coverageRate >= 40
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {row.coverageRate}%
                          </span>
                        </td>
                        <td className="p-2.5 text-left font-mono font-black text-purple-900 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                          {formatMoney(row.totalDebt)}
                        </td>
                        <td className="p-2.5 text-left font-mono font-black text-rose-700 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                          {formatMoney(row.totalOverdue)}
                        </td>
                        <td className="p-2.5 text-left font-mono font-bold text-slate-800 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                          {formatMoney(row.totalSales)}
                        </td>
                        <td className="p-2.5 text-left font-mono font-bold text-emerald-700 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                          {formatMoney(row.totalCollections)}
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-700">
                          {row.collectionRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 4: Payment Terms & Guarantees Breakdown (Admin/Developer only) */}
          {isAdminOrDev && activeChartTab === 'payment_guarantee' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="h-60 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={paymentGuaranteePieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {paymentGuaranteePieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => `${val} عميل`}
                      contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none' }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>

              {/* Guarantees & Terms Summary Cards */}
              <div className="space-y-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>توزيع أوراق الضمان وشروط السداد للعملاء</span>
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[11px] font-bold">بأوراق ضمان معتمدة:</span>
                    <span className="text-sm font-black text-emerald-700">{kpiStats.guaranteedCount.toLocaleString()} عميل</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[11px] font-bold">بدون أوراق ضمان:</span>
                    <span className="text-sm font-black text-slate-700">{(filteredCustomers.length - kpiStats.guaranteedCount).toLocaleString()} عميل</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[11px] font-bold">الحد الائتماني الإجمالي:</span>
                    <span className="text-sm font-black text-amber-700">{formatMoney(kpiStats.totalCreditLimit)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[11px] font-bold">متجاوزو الحد الائتماني:</span>
                    <span className="text-sm font-black text-rose-700">{kpiStats.overLimitCount.toLocaleString()} عميل</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Activity Type & Client Type Classification Breakdown (طبيعة النشاط وتصنيف خ/ك من الشيت) */}
          {activeChartTab === 'activity_client' && (
            <div className="space-y-4">
              <div className="bg-slate-900 text-white p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-md bg-emerald-500/20 text-emerald-400 font-bold text-xs border border-emerald-500/30 flex items-center gap-1">
                      <Store className="w-3.5 h-3.5 text-emerald-400" />
                      <span>تحليل طبيعة النشاط وتصنيف خ/ك (أعمدة الشيت)</span>
                    </span>
                    <span className="text-xs text-slate-300 font-bold">
                      {activityClientAnalyticsData.activities.length} أنشطة تجارية مفحوصة
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    توزيع المبيعات والمديونيات وأعداد العملاء حسب طبيعة النشاط (سوبر ماركت، جملة، قطاعي، كشك، معارض) وتصنيف (كبار عملاء، خاص، خط).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Visual 1: Sales & Debt by Activity Type */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-black text-slate-800 flex items-center gap-1">
                      <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                      <span>المبيعات والمديونيات حسب طبيعة النشاط:</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-semibold">قيم نقدية (ج.م)</span>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={activityClientAnalyticsData.activities.slice(0, 8)} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="activity" tick={{ fontSize: 11, fill: '#64748B' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => (isPrivacyMode ? '•••' : `${(v / 1000).toFixed(0)}k`)} />
                        <Tooltip formatter={(val: any) => formatMoney(Number(val) || 0)} contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none' }} />
                        <Legend />
                        <Bar dataKey="sales" name="مبيعات 2026" fill="#0284c7" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="debt" name="المديونية الحالية" fill="#9333ea" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Visual 2: Client Classification Donut (خ/ك) */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-black text-slate-800 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-amber-600" />
                      <span>تصنيف العملاء (خ/ك - كبار عملاء / خاص / خط):</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-semibold">{filteredCustomers.length} عميل</span>
                  </div>
                  <div className="h-64 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={activityClientAnalyticsData.clientTypes}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="value"
                          label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {activityClientAnalyticsData.clientTypes.map((entry, index) => (
                            <Cell key={`cell-client-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: any) => `${val} عميل`}
                          contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none' }}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Table Breakdown with Instant Slicer Filtering */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-black text-slate-800">
                  <span>جدول تفصيل الأنشطة التجارية وتصنيف خ/ك:</span>
                  <span className="text-[11px] text-slate-500 font-normal">اضغط على أي نشاط لتصفيته فوراً بالسلايسر</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">طبيعة النشاط</th>
                        <th className="p-2.5 text-center">عدد العملاء</th>
                        <th className="p-2.5 text-center">إجمالي المبيعات (ج.م)</th>
                        <th className="p-2.5 text-center">إجمالي التحصيلات (ج.م)</th>
                        <th className="p-2.5 text-center">المديونية الحالية (ج.م)</th>
                        <th className="p-2.5 text-center">نسبة التحصيل</th>
                        <th className="p-2.5 text-center">تصفية بالسلايسر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {activityClientAnalyticsData.activities.map((act, i) => {
                        const colRate = act.sales > 0 ? Math.round((act.collections / act.sales) * 100) : 0;
                        return (
                          <tr key={i} className="hover:bg-slate-50 transition">
                            <td className="p-2.5 font-bold text-slate-800">{act.activity}</td>
                            <td className="p-2.5 text-center font-bold text-slate-700">{act.count.toLocaleString()}</td>
                            <td className="p-2.5 text-center font-mono font-bold text-blue-700">{formatMoney(act.sales)}</td>
                            <td className="p-2.5 text-center font-mono font-bold text-emerald-700">{formatMoney(act.collections)}</td>
                            <td className="p-2.5 text-center font-mono font-bold text-purple-900">{formatMoney(act.debt)}</td>
                            <td className="p-2.5 text-center font-bold">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-black ${
                                colRate >= 70 ? 'bg-emerald-100 text-emerald-800' : colRate >= 30 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {colRate}%
                              </span>
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => setActivityTypeFilter(activityTypeFilter === act.activity ? 'ALL' : act.activity)}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                  activityTypeFilter === act.activity
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                              >
                                {activityTypeFilter === act.activity ? '✓ مفعل' : 'تطبيق الفلتر 🔍'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Run-Rate & Monthly Pace Early Warning */}
          {activeChartTab === 'run_rate' && (
            <div className="space-y-4">
              {/* Month Selector Bar & Explanation */}
              <div className="bg-slate-900 text-white p-3.5 rounded-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-md bg-amber-500/20 text-amber-400 font-bold text-xs border border-amber-500/30 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>مؤشر وتيرة الأداء والسرعة (Run-rate Velocity)</span>
                    </span>
                    <span className="text-xs text-slate-300 font-bold">
                      مقارنة أداء {runRateAnalyticsData.targetMonthName} بالسابق ({runRateAnalyticsData.prevMonthName})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    رصد مبكر لتراجع مبيعات المناديب في الأسبوع الأول والثاني للتدخل الفوري والدعم الميداني قبل ضياع التارجت بنهاية الشهر.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">شهر الفحص:</span>
                  <select
                    value={runRateSelectedMonth}
                    onChange={(e) => setRunRateSelectedMonth(Number(e.target.value))}
                    className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-amber-400 cursor-pointer"
                  >
                    {MONTH_NAMES_AR.map((mName, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        شهر {idx + 1} - {mName} 2026
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Metric Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] text-slate-500 font-bold">مبيعات {runRateAnalyticsData.targetMonthName}:</div>
                  <div className="text-base font-black text-blue-700 mt-0.5">{formatMoney(runRateAnalyticsData.totalCurr)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">الشهر السابق: {formatMoney(runRateAnalyticsData.totalPrev)}</div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] text-slate-500 font-bold">معدل النمو / التغير الشهري:</div>
                  <div className={`text-base font-black mt-0.5 ${runRateAnalyticsData.overallGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {runRateAnalyticsData.overallGrowth >= 0 ? `+${runRateAnalyticsData.overallGrowth}% ↗` : `${runRateAnalyticsData.overallGrowth}% ↘`}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {runRateAnalyticsData.overallGrowth >= 0 ? 'وتيرة إيجابية متصاعدة' : 'وتيرة متراجعة تستلزم تنشيط'}
                  </div>
                </div>

                <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 shadow-xs">
                  <div className="text-[11px] text-emerald-800 font-bold flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-emerald-600" />
                    <span>مناديب في وتيرة تسارع (🚀):</span>
                  </div>
                  <div className="text-lg font-black text-emerald-700 mt-0.5">
                    {runRateAnalyticsData.acceleratingCount} مندوب
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-0.5">مبيعاتهم تفوقت على الشهر السابق</div>
                </div>

                <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-200 shadow-xs">
                  <div className="text-[11px] text-rose-800 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>إنذار تراجع مبكر (⚠️):</span>
                  </div>
                  <div className="text-lg font-black text-rose-700 mt-0.5">
                    {runRateAnalyticsData.warningCount} مندوب
                  </div>
                  <div className="text-[10px] text-rose-600 mt-0.5">انخفاض &gt; 15% بحاجة لدعم ميداني عاجل</div>
                </div>
              </div>

              {/* Performance Comparison Chart */}
              <div className="h-64 sm:h-72 w-full bg-white p-2 rounded-xl border border-slate-200">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={runRateAnalyticsData.list.slice(0, 8).map(r => ({
                      rep: r.repName.length > 15 ? `${r.repName.substring(0, 15)}...` : r.repName,
                      [runRateAnalyticsData.prevMonthName]: r.prevSales,
                      [runRateAnalyticsData.targetMonthName]: r.currSales,
                    }))}
                    margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="rep" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => (isPrivacyMode ? '•••' : `${(v / 1000).toFixed(0)}k`)} />
                    <Tooltip formatter={(val: any) => formatMoney(Number(val) || 0)} contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none' }} />
                    <Legend />
                    <Bar dataKey={runRateAnalyticsData.prevMonthName} fill="#94A3B8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={runRateAnalyticsData.targetMonthName} fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Reps Detail Table with Pace Badge & Early Warning */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">المندوب</th>
                      <th className="p-2.5">الفرع</th>
                      <th className="p-2.5 text-center">مبيعات {runRateAnalyticsData.prevMonthName}</th>
                      <th className="p-2.5 text-center">مبيعات {runRateAnalyticsData.targetMonthName}</th>
                      <th className="p-2.5 text-center">الفارق (ج.م)</th>
                      <th className="p-2.5 text-center">نسبة التغير</th>
                      <th className="p-2.5 text-center">مؤشر وتيرة الأداء والإنذار المبكر</th>
                      <th className="p-2.5 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {runRateAnalyticsData.list.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition">
                        <td className="p-2.5 font-bold text-slate-800">{r.repName}</td>
                        <td className="p-2.5 text-slate-500 font-semibold">{r.branchName}</td>
                        <td className="p-2.5 text-center font-mono text-slate-600">{formatMoney(r.prevSales)}</td>
                        <td className="p-2.5 text-center font-mono font-bold text-blue-700">{formatMoney(r.currSales)}</td>
                        <td className={`p-2.5 text-center font-mono font-bold ${r.salesDiff >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {r.salesDiff >= 0 ? `+${formatMoney(r.salesDiff)}` : `-${formatMoney(Math.abs(r.salesDiff))}`}
                        </td>
                        <td className="p-2.5 text-center font-bold">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-black ${
                            r.growthRate >= 10 ? 'bg-emerald-100 text-emerald-800' : r.growthRate <= -15 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {r.growthRate >= 0 ? `+${r.growthRate}%` : `${r.growthRate}%`}
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          {r.paceStatus === 'accelerating' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-black text-[11px]">
                              <Zap className="w-3.5 h-3.5 text-emerald-600" />
                              <span>🚀 نمو متسارع (أعلى من الشهر السابق)</span>
                            </span>
                          )}
                          {r.paceStatus === 'stable' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                              <span>✅ على المسار المعتاد</span>
                            </span>
                          )}
                          {r.paceStatus === 'early_warning' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-black text-[11px] animate-pulse">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                              <span>⚠️ إنذار تراجع مبكر - يتطلب متابعة ميدانية</span>
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRep(r.repName);
                              setSelectedBranch(r.branchName);
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition cursor-pointer"
                          >
                            فحص عملاءه 🔎
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Portfolio Balancing & Route Planning */}
          {activeChartTab === 'portfolio_balance' && (
            <div className="space-y-4">
              {/* Header & Balancing Constitution */}
              <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white p-3.5 rounded-xl border border-purple-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-md bg-purple-500/20 text-purple-300 font-bold text-xs border border-purple-500/30 flex items-center gap-1">
                      <Scale className="w-3.5 h-3.5 text-purple-300" />
                      <span>خريطة توازن محفظة العملاء (Portfolio Balancing)</span>
                    </span>
                    <span className="text-xs text-slate-300 font-bold">
                      {portfolioBalanceData.reps.length} مندوب في الفرع المفحوص
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-200 mt-1">
                    منع تكدس كبار العملاء والمديونيات مع مندوب واحد وترك باقي المناديب بدون أهداف كافية، مع تنظيم خطوط السير والزيارات اليومية.
                  </p>
                </div>

                {portfolioBalanceData.highConcentrationCount > 0 ? (
                  <div className="bg-rose-500/20 border border-rose-500/40 px-3 py-1.5 rounded-xl text-rose-300 text-xs font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>تنبيه: يوجد {portfolioBalanceData.highConcentrationCount} مندوب لديهم تركز عملاء ومديونيات مرتفع (&gt;40%)</span>
                  </div>
                ) : (
                  <div className="bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>المحفظة موزعة بعدالة وتوازن تام بين مناديب الفرع</span>
                  </div>
                )}
              </div>

              {/* Section 1: Reps Customer & Debt Balancing Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-purple-600" />
                    <span>توزيع كبار العملاء والمديونيات على المناديب:</span>
                  </span>
                  <span className="text-[11px] text-slate-500 font-bold">
                    إجمالي مديونيات الفرع: {formatMoney(portfolioBalanceData.branchTotalDebt)} • إجمالي العملاء: {portfolioBalanceData.branchTotalCustomers.toLocaleString()}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">المندوب</th>
                        <th className="p-2.5">الفرع</th>
                        <th className="p-2.5 text-center">إجمالي العملاء</th>
                        <th className="p-2.5 text-center">كبار العملاء (VIP)</th>
                        <th className="p-2.5 text-center">إجمالي المديونية (ج.م)</th>
                        <th className="p-2.5 text-center">حصة المندوب من المديونية %</th>
                        <th className="p-2.5 text-center">حصة العملاء %</th>
                        <th className="p-2.5 text-center">تقييم تركز المحفظة</th>
                        <th className="p-2.5 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {portfolioBalanceData.reps.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition">
                          <td className="p-2.5 font-bold text-slate-800">{r.repName}</td>
                          <td className="p-2.5 text-slate-500 font-semibold">{r.branchName}</td>
                          <td className="p-2.5 text-center font-bold text-slate-700">{r.totalCustomers.toLocaleString()}</td>
                          <td className="p-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-black text-[11px]">
                              ⭐ {r.vipCustomers} كبار عملاء
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-mono font-black text-purple-900">{formatMoney(r.totalDebt)}</td>
                          <td className="p-2.5 text-center font-black">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] ${
                              r.debtShare >= 40 ? 'bg-rose-100 text-rose-800 font-black' : r.debtShare >= 25 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {r.debtShare}%
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-bold text-slate-700">{r.customerShare}%</td>
                          <td className="p-2.5 text-center">
                            {r.concentrationRisk === 'high' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-black text-[11px]">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                <span>⚠️ تكدس عالي - يوصى بتوزيع بعض العملاء</span>
                              </span>
                            )}
                            {r.concentrationRisk === 'medium' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[11px]">
                                <span>⚡ تركز متوسط</span>
                              </span>
                            )}
                            {r.concentrationRisk === 'balanced' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>✅ محفظة متوازنة</span>
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRep(r.repName);
                                setSelectedBranch(r.branchName);
                              }}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition cursor-pointer"
                            >
                              عرض العملاء 👥
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 2: Route & Field Visit Daily Organization (ترتيب خطوط السير والزيارات الميدانية) */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <Navigation className="w-4 h-4 text-emerald-600" />
                      <span>خريطة خطوط السير والمناطق للزيارات الميدانية اليومية (Route Organization):</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      توزيع العملاء جغرافياً حسب المنطقة وخط السير لترتيب مسارات المناديب الميدانية وتقليل تكلفة الانتقال.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSortMode('route_asc')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-black flex items-center gap-1 cursor-pointer transition"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-emerald-600" />
                    <span>فرز جدول العملاء بالكامل حسب خط السير 🗺️</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {portfolioBalanceData.routes.slice(0, 16).map((rt, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200 transition space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-xs text-slate-800 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>{rt.route}</span>
                        </span>
                        <span className="text-[11px] font-black bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                          {rt.customersCount} عميل
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-semibold truncate">
                        المندوب: <span className="text-slate-700 font-bold">{rt.repsList || 'غير محدد'}</span>
                      </div>
                      <div className="text-[11px] text-purple-900 font-mono font-bold flex items-center justify-between">
                        <span>إجمالي المديونية:</span>
                        <span>{formatMoney(rt.totalDebt)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRegion(rt.route);
                          setSortMode('route_asc');
                          const el = document.getElementById('analytics-search-input');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="w-full mt-1 py-1 rounded-lg bg-white hover:bg-indigo-600 hover:text-white border border-slate-200 hover:border-indigo-600 text-indigo-700 text-[11px] font-bold transition cursor-pointer text-center"
                      >
                        📍 جدولة وترتيب زيارات هذا الخط
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Power BI Executive Filter & Slicer Panel (أعمدة الشيت الرسمية) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden space-y-0">
        {/* Power BI Header Strip */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 font-black text-xs shadow-inner">
              BI
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-wide text-white">سلايسر وفلاتر Power BI التنفيذية</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  {activeFiltersCount > 0 ? `${activeFiltersCount} سلايسر نشط` : 'أعمدة الشيت الأصلية'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                تصفية تفاعلية دقيقة مطابقة لأعمدة الشيت: الفرع، المندوب، العميل، خط السير، طبيعة النشاط، أوراق الضمان، طريقة الدفع، وتصنيف خ/ك
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-slate-800/90 border border-slate-700 rounded-lg text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <span>المطابق:</span>
              <span className="text-amber-400 font-black text-sm">{filteredCustomers.length.toLocaleString()}</span>
              <span className="text-slate-400 text-[11px]">من {userVisibleCustomers.length.toLocaleString()} عميل</span>
            </div>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleResetAllSlicers}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs animate-in fade-in"
                title="إلغاء وتصفير جميع السلايسر"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تصفير السلايسر ({activeFiltersCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Slicers Breadcrumb Ribbon (شريط السلايسر النشطة) */}
        {activeFiltersCount > 0 && (
          <div className="bg-amber-50/70 border-b border-amber-200/80 px-4 py-2 flex items-center gap-2 flex-wrap text-xs">
            <span className="text-[11px] font-black text-amber-900 flex items-center gap-1 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-700" />
              <span>السلايسر المطبقة حالياً:</span>
            </span>

            {selectedBranch !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>الفرع: {selectedBranch}</span>
                <button type="button" onClick={() => setSelectedBranch('ALL')} className="text-blue-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {selectedRep !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>المندوب: {selectedRep}</span>
                <button type="button" onClick={() => setSelectedRep('ALL')} className="text-indigo-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {selectedCustomerId !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-emerald-200 text-emerald-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>العميل: {selectedSlicerCustomer ? selectedSlicerCustomer.name : selectedCustomerId}</span>
                <button type="button" onClick={() => setSelectedCustomerId('ALL')} className="text-emerald-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {selectedRegion !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-teal-200 text-teal-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>خط السير: {selectedRegion}</span>
                <button type="button" onClick={() => setSelectedRegion('ALL')} className="text-teal-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {activityTypeFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-emerald-200 text-emerald-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>النشاط: {activityTypeFilter}</span>
                <button type="button" onClick={() => setActivityTypeFilter('ALL')} className="text-emerald-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {guaranteeFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-amber-200 text-amber-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>الضمان: {guaranteeFilter}</span>
                <button type="button" onClick={() => setGuaranteeFilter('ALL')} className="text-amber-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {paymentTermsFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-purple-200 text-purple-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>طريقة الدفع: {paymentTermsFilter}</span>
                <button type="button" onClick={() => setPaymentTermsFilter('ALL')} className="text-purple-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {clientTypeFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-amber-200 text-amber-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>تصنيف خ/ك: {clientTypeFilter}</span>
                <button type="button" onClick={() => setClientTypeFilter('ALL')} className="text-amber-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {dealEligibilityFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-sky-200 text-sky-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>حالة التعامل: {dealEligibilityFilter === 'dealt' ? 'متعامل' : dealEligibilityFilter === 'eligible' ? 'قابل' : 'غير قابل'}</span>
                <button type="button" onClick={() => setDealEligibilityFilter('ALL')} className="text-sky-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {debtFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-rose-200 text-rose-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>المديونية: {debtFilter}</span>
                <button type="button" onClick={() => setDebtFilter('ALL')} className="text-rose-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {salesTierFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-blue-200 text-blue-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>شريحة المبيعات: {salesTierFilter === 'vip_100k' ? '+100k' : salesTierFilter}</span>
                <button type="button" onClick={() => setSalesTierFilter('ALL')} className="text-blue-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {collectionRateFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-emerald-200 text-emerald-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>التحصيل: {collectionRateFilter}</span>
                <button type="button" onClick={() => setCollectionRateFilter('ALL')} className="text-emerald-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {selectedMonth !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-slate-300 text-slate-800 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>الفترة: {selectedMonth}</span>
                <button type="button" onClick={() => setSelectedMonth('ALL')} className="text-slate-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {searchQuery && (
              <span className="inline-flex items-center gap-1 bg-white border border-amber-300 text-amber-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>بحث: "{searchQuery}"</span>
                <button type="button" onClick={() => setSearchQuery('')} className="text-amber-600 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            <button
              type="button"
              onClick={handleResetAllSlicers}
              className="text-rose-600 hover:underline font-black mr-auto text-[11px] cursor-pointer"
            >
              مسح الكل
            </button>
          </div>
        )}

        <div className="p-3.5 sm:p-4 space-y-3.5">
          {/* Section 1: Core Slicers (الفرع، المندوب، العميل، خط السير، والبحث السريع) */}
          <div>
            <div className="text-[11px] font-black text-slate-500 mb-1.5 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>أبعاد الشيت الرئيسية (الفرع • المندوب • العميل • خط السير):</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {/* 1. الفرع */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>الفرع</span>
                  </span>
                  {selectedBranch !== 'ALL' && (
                    <button type="button" onClick={() => setSelectedBranch('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-branch-select"
                  value={selectedBranch}
                  onChange={(e) => {
                    setSelectedBranch(e.target.value);
                    setSelectedRep('ALL');
                    setSelectedCustomerId('ALL');
                  }}
                  disabled={!isAdminOrDev && !!currentUser?.branchName}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع الفروع ({availableBranches.length})</option>
                  {availableBranches.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {/* 2. المندوب */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>المندوب</span>
                  </span>
                  {selectedRep !== 'ALL' && (
                    <button type="button" onClick={() => setSelectedRep('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-rep-select"
                  value={selectedRep}
                  onChange={(e) => {
                    setSelectedRep(e.target.value);
                    setSelectedCustomerId('ALL');
                  }}
                  disabled={isRep}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع المناديب ({availableReps.length})</option>
                  {availableReps.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* 3. خط السير / المنطقة */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Navigation className="w-3.5 h-3.5 text-teal-600" />
                    <span>خط السير / المنطقة</span>
                  </span>
                  {selectedRegion !== 'ALL' && (
                    <button type="button" onClick={() => setSelectedRegion('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-region-select"
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-teal-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع المناطق والخطوط ({availableRegions.length})</option>
                  {availableRegions.map((reg) => (
                    <option key={reg} value={reg}>{reg}</option>
                  ))}
                </select>
              </div>

              {/* 4. سلايسر العميل المباشر */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>تصفية بالعميل المحدد</span>
                  </span>
                  {selectedCustomerId !== 'ALL' && (
                    <button type="button" onClick={() => setSelectedCustomerId('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-customer-select"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع العملاء ({userVisibleCustomers.length})</option>
                  {availableCustomerOptions.map((c) => (
                    <option key={c.id || c.code} value={c.id || c.code}>
                      {c.name} {c.code ? `(${c.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. البحث السريع */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Search className="w-3.5 h-3.5 text-amber-600" />
                    <span>بحث سريع في الشيت</span>
                  </span>
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">مسح</button>
                  )}
                </label>
                <div className="relative">
                  <input
                    id="analytics-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="اسم، كود، هاتف، منطقة، ضمان..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:border-amber-500 focus:outline-none transition shadow-2xs"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Sheet Commercial & Credit Slicers (طبيعة النشاط، أوراق الضمان، طريقة الدفع، وتصنيف خ/ك) */}
          <div className="pt-2 border-t border-slate-100">
            <div className="text-[11px] font-black text-slate-500 mb-1.5 flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-emerald-600" />
              <span>سلايسر البيانات التجارية والائتمانية (من أعمدة الشيت مباشرة):</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* 1. طبيعة النشاط (سوبر ماركت، جملة، قطاعي، صيدلية...) */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Store className="w-3.5 h-3.5 text-emerald-600" />
                    <span>طبيعة النشاط (الشيت)</span>
                  </span>
                  {activityTypeFilter !== 'ALL' && (
                    <button type="button" onClick={() => setActivityTypeFilter('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-activity-type-select"
                  value={activityTypeFilter}
                  onChange={(e) => setActivityTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع الأنشطة ({availableActivityTypes.length})</option>
                  {availableActivityTypes.map(([act, count]) => (
                    <option key={act} value={act}>
                      {act} ({count} عميل)
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. أوراق الضمان (شيك، كمبيالة، إيصال أمانة، بدون ضمان...) */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                    <span>أوراق الضمان (الشيت)</span>
                  </span>
                  {guaranteeFilter !== 'ALL' && (
                    <button type="button" onClick={() => setGuaranteeFilter('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-guarantee-select"
                  value={guaranteeFilter}
                  onChange={(e) => setGuaranteeFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع الضمانات ({availableGuaranteeDocs.length})</option>
                  <option value="has_guarantee">✓ بأوراق ضمان معتمدة ({kpiStats.guaranteedCount})</option>
                  <option value="unsecured">✗ بدون ضمان ({userVisibleCustomers.length - kpiStats.guaranteedCount})</option>
                  {availableGuaranteeDocs.map(([g, count]) => (
                    <option key={g} value={g}>
                      {g} ({count} عميل)
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. طريقة الدفع (كاش، آجل، دفعات، شيكات...) */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                    <span>طريقة الدفع (الشيت)</span>
                  </span>
                  {paymentTermsFilter !== 'ALL' && (
                    <button type="button" onClick={() => setPaymentTermsFilter('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-payment-terms-select"
                  value={paymentTermsFilter}
                  onChange={(e) => setPaymentTermsFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع طرق الدفع ({availablePaymentTerms.length})</option>
                  {availablePaymentTerms.map(([pt, count]) => (
                    <option key={pt} value={pt}>
                      {pt} ({count} عميل)
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. تصنيف خ/ك (كبار عملاء، خط، خاص...) */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-amber-600" />
                    <span>تصنيف العميل خ/ك (الشيت)</span>
                  </span>
                  {clientTypeFilter !== 'ALL' && (
                    <button type="button" onClick={() => setClientTypeFilter('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-client-type-select"
                  value={clientTypeFilter}
                  onChange={(e) => setClientTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع التصنيفات ({availableClientTypes.length})</option>
                  {availableClientTypes.map(([ct, count]) => (
                    <option key={ct} value={ct}>
                      {ct} ({count} عميل)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Financial Status & Segment Slicers (حالة التعامل، المديونية، شرائح المبيعات، والترتيب) */}
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            {/* Row 3A: Deal Eligibility & Debt Slicers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {/* Deal Eligibility Slicer */}
              <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>حالة التعامل (من الشيت):</span>
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setDealEligibilityFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      dealEligibilityFilter === 'ALL'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    الكل ({userVisibleCustomers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDealEligibilityFilter('dealt')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                      dealEligibilityFilter === 'dealt'
                        ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>متعامل ✅ ({kpiStats.dealtCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDealEligibilityFilter('eligible')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                      dealEligibilityFilter === 'eligible'
                        ? 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-400'
                        : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-sky-500" />
                    <span>قابل للتعامل ⏳ ({kpiStats.eligibleCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDealEligibilityFilter('ineligible')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                      dealEligibilityFilter === 'ineligible'
                        ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-400'
                        : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                    <span>غير قابل ⛔ ({kpiStats.ineligibleCount})</span>
                  </button>
                </div>
              </div>

              {/* Quick Sorting */}
              <div className="bg-slate-50/90 p-2.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 shrink-0">
                  <ArrowUpDown className="w-4 h-4 text-purple-600" />
                  <span>الترتيب الذكي:</span>
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSortMode('highest_debt')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                      sortMode === 'highest_debt'
                        ? 'bg-purple-700 text-white shadow-sm ring-2 ring-purple-400'
                        : 'bg-white text-purple-800 hover:bg-purple-50 border border-purple-200'
                    }`}
                  >
                    🔴 الأكثر مديونية
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortMode('highest_overdue')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      sortMode === 'highest_overdue'
                        ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-400'
                        : 'bg-white text-rose-800 hover:bg-rose-50 border border-rose-200'
                    }`}
                  >
                    ⚠️ الأكثر مستحقات
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortMode('highest_sales')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      sortMode === 'highest_sales'
                        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400'
                        : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-200'
                    }`}
                  >
                    📈 أعلى مبيعات
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortMode('route_asc')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                      sortMode === 'route_asc'
                        ? 'bg-teal-700 text-white shadow-sm ring-2 ring-teal-400'
                        : 'bg-white text-teal-800 hover:bg-teal-50 border border-teal-200'
                    }`}
                  >
                    <Navigation className="w-3.5 h-3.5 text-teal-600" />
                    <span>🗺️ خط السير</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortMode('name_asc')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      sortMode === 'name_asc'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    🔤 أبجدي
                  </button>
                </div>
              </div>
            </div>

            {/* Row 3B: Debt & Overdue Status Slicer */}
            <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/90 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 shrink-0">
                <BadgeDollarSign className="w-4 h-4 text-rose-600" />
                <span className="text-xs font-black text-slate-800">سلايسر المديونية والمستحقات:</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDebtFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    debtFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setDebtFilter('highest_debt')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                    debtFilter === 'highest_debt'
                      ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-400'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                  }`}
                >
                  <span>🔴 الأكثر مديونية</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDebtFilter('lowest_debt')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                    debtFilter === 'lowest_debt'
                      ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  <span>🟢 الأقل مديونية</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDebtFilter('highest_overdue')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                    debtFilter === 'highest_overdue'
                      ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-400'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  <span>⚠️ الأكثر مستحقات واجبة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDebtFilter('zero_debt')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    debtFilter === 'zero_debt'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>خالص المديونية (0)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDebtFilter('over_limit')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    debtFilter === 'over_limit'
                      ? 'bg-purple-700 text-white shadow-xs'
                      : 'bg-white text-purple-700 hover:bg-purple-50 border border-purple-200'
                  }`}
                >
                  <span>⛔ متجاوز الحد الائتماني</span>
                </button>
              </div>
            </div>

            {/* Row 3C: Sales Tier & Collection Efficiency Slicers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {/* Sales Tier Slicer */}
              <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 shrink-0">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span>شريحة مبيعات 2026:</span>
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSalesTierFilter('ALL')}
                    className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      salesTierFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                  >
                    الكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesTierFilter('vip_100k')}
                    className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      salesTierFilter === 'vip_100k' ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-800 border border-blue-200'
                    }`}
                  >
                    ⭐ كبار العملاء (+100k)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesTierFilter('medium_20k_100k')}
                    className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      salesTierFilter === 'medium_20k_100k' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                    }`}
                  >
                    💼 متوسط (20k-100k)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesTierFilter('starter_under_20k')}
                    className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      salesTierFilter === 'starter_under_20k' ? 'bg-teal-600 text-white shadow-xs' : 'bg-teal-50 text-teal-800 border border-teal-200'
                    }`}
                  >
                    🥉 ناشئ (&lt;20k)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesTierFilter('zero_sales')}
                    className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      salesTierFilter === 'zero_sales' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    ⭕ مبيعات صفرية
                  </button>
                </div>
              </div>

              {/* Collection Rate Slicer */}
              <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 shrink-0">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>كفاءة التحصيل:</span>
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCollectionRateFilter('ALL')}
                    className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      collectionRateFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                  >
                    الكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectionRateFilter('high_80')}
                    className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      collectionRateFilter === 'high_80' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    🟢 مرتفع (+80%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectionRateFilter('medium_30_79')}
                    className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      collectionRateFilter === 'medium_30_79' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    🟡 متوسط (30-79%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectionRateFilter('low_zero')}
                    className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      collectionRateFilter === 'low_zero' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    🔴 ضعيف (&lt;30%)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Time Horizon Slicer (شهري / كوارتر / كامل عام 2026 من الشيت) */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-3 rounded-xl border border-slate-700/80 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3 shadow-inner">
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <div>
                <div className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>سلايسر الفترة المستهدفة (شهري / كوارتر / كامل 2026 من الشيت):</span>
                </div>
                <div className="text-[10px] text-slate-300">
                  {selectedMonth === 'ALL'
                    ? 'كامل عام 2026 (أي عميل تعامل خلال السنة)'
                    : selectedMonth === 'Q1'
                    ? 'الربع الأول Q1 (مبيعات 1 يناير + 2 فبراير + 3 مارس)'
                    : selectedMonth === 'Q2'
                    ? 'الربع الثاني Q2 (مبيعات 4 أبريل + 5 مايو + 6 يونيو)'
                    : selectedMonth === 'Q3'
                    ? 'الربع الثالث Q3 (مبيعات 7 يوليو + 8 أغسطس + 9 سبتمبر)'
                    : selectedMonth === 'Q4'
                    ? 'الربع الرابع Q4 (مبيعات 10 أكتوبر + 11 نوفمبر + 12 ديسمبر)'
                    : `مبيعات شهر ${selectedMonth} (${MONTH_NAMES_AR[Number(selectedMonth) - 1]})`}
                </div>
              </div>
            </div>

            {/* Slicer Buttons: Quarters & Months */}
            <div className="flex flex-wrap items-center gap-1 overflow-x-auto no-scrollbar py-0.5 w-full xl:w-auto">
              <button
                type="button"
                onClick={() => setSelectedMonth('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap ${
                  selectedMonth === 'ALL'
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                كامل 2026
              </button>

              {/* Quarters Slicers */}
              <div className="flex items-center gap-0.5 bg-slate-950/60 p-0.5 rounded-lg border border-slate-700">
                {[
                  { q: 'Q1' as const, label: 'Q1 (يناير-مارس)' },
                  { q: 'Q2' as const, label: 'Q2 (أبريل-يونيو)' },
                  { q: 'Q3' as const, label: 'Q3 (يوليو-سبتمبر)' },
                  { q: 'Q4' as const, label: 'Q4 (أكتوبر-ديسمبر)' },
                ].map(({ q, label }) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setSelectedMonth(q)}
                    className={`px-2 py-1 rounded-md text-[11px] font-black transition cursor-pointer whitespace-nowrap ${
                      selectedMonth === q
                        ? 'bg-indigo-500 text-white shadow-md'
                        : 'text-indigo-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Individual Months 1 to 12 */}
              <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
                {[
                  { m: 1, name: '1 (يناير)' },
                  { m: 2, name: '2 (فبراير)' },
                  { m: 3, name: '3 (مارس)' },
                  { m: 4, name: '4 (أبريل)' },
                  { m: 5, name: '5 (مايو)' },
                  { m: 6, name: '6 (يونيو)' },
                  { m: 7, name: '7 (يوليو)' },
                  { m: 8, name: '8 (أغسطس)' },
                  { m: 9, name: '9 (سبتمبر)' },
                  { m: 10, name: '10 (أكتوبر)' },
                  { m: 11, name: '11 (نوفمبر)' },
                  { m: 12, name: '12 (ديسمبر)' },
                ].map(({ m, name }) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedMonth(m)}
                    className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition cursor-pointer whitespace-nowrap ${
                      selectedMonth === m
                        ? 'bg-amber-400 text-slate-950 font-black shadow-md'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Power BI Dedicated Single-Customer Analytical Dossier Card */}
      {selectedSlicerCustomer && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white rounded-2xl p-4 sm:p-5 border-2 border-emerald-500/50 shadow-2xl space-y-4 animate-in slide-in-from-top-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-lg shrink-0">
                {selectedSlicerCustomer.name.slice(0, 1)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg sm:text-xl font-black text-white">{selectedSlicerCustomer.name}</h3>
                  {selectedSlicerCustomer.code && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-amber-300 text-xs font-mono font-bold">
                      كود: {selectedSlicerCustomer.code}
                    </span>
                  )}
                  {selectedSlicerCustomer.activityType && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
                      {selectedSlicerCustomer.activityType}
                    </span>
                  )}
                  {selectedSlicerCustomer.clientType && (
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-400/30 text-purple-300 text-xs font-bold">
                      {selectedSlicerCustomer.clientType}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-300 mt-1 flex items-center gap-3 flex-wrap">
                  <span>🏢 الفرع: <strong className="text-white">{selectedSlicerCustomer.branchName || 'غير محدد'}</strong></span>
                  <span>👤 المندوب: <strong className="text-white">{selectedSlicerCustomer.salesRepName || selectedSlicerCustomer.repName || 'غير محدد'}</strong></span>
                  {(selectedSlicerCustomer.route || selectedSlicerCustomer.district || selectedSlicerCustomer.region) && (
                    <span>🗺️ خط السير: <strong className="text-teal-300">{[selectedSlicerCustomer.district, selectedSlicerCustomer.route, selectedSlicerCustomer.region].filter(Boolean).join(' • ')}</strong></span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
              {selectedSlicerCustomer.phone && (
                <>
                  <a
                    href={`https://wa.me/2${selectedSlicerCustomer.phone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>واتساب</span>
                  </a>
                  <a
                    href={`tel:${selectedSlicerCustomer.phone}`}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>اتصال</span>
                  </a>
                </>
              )}
              <button
                type="button"
                onClick={() => setSelectedCustomer(selectedSlicerCustomer)}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>الملف الكامل 360</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedCustomerId('ALL')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                title="إلغاء التحديد والعودة للكل"
              >
                ✕ إغلاق البطاقة
              </button>
            </div>
          </div>

          {/* 4 Financial Meters for the selected customer */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-bold">المديونية الحالية:</span>
              <span className="text-lg sm:text-xl font-black text-white font-mono mt-0.5 block" title={isPrivacyMode ? 'مخفي' : undefined}>
                {formatMoney(selectedSlicerCustomer.currentBalance ?? selectedSlicerCustomer.balance ?? 0)}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                طريقة الدفع: {selectedSlicerCustomer.paymentTerms || 'غير محدد'}
              </span>
            </div>

            <div className="bg-slate-900/90 p-3 rounded-xl border border-rose-900/50">
              <span className="text-[11px] text-rose-300 block font-bold">المستحقات والمتأخرات:</span>
              <span className="text-lg sm:text-xl font-black text-rose-400 font-mono mt-0.5 block" title={isPrivacyMode ? 'مخفي' : undefined}>
                {formatMoney(selectedSlicerCustomer.totalOverdueAndDue ?? selectedSlicerCustomer.overdueBalance ?? 0)}
              </span>
              <span className="text-[10px] text-rose-300 mt-0.5 block">
                {(selectedSlicerCustomer.totalOverdueAndDue ?? selectedSlicerCustomer.overdueBalance ?? 0) > 0 ? '⚠️ واجبة السداد الفوري' : '✓ لا توجد مستحقات متأخرة'}
              </span>
            </div>

            <div className="bg-slate-900/90 p-3 rounded-xl border border-amber-900/50">
              <span className="text-[11px] text-amber-300 block font-bold">الحد الائتماني والضمان:</span>
              <span className="text-lg sm:text-xl font-black text-amber-300 font-mono mt-0.5 block" title={isPrivacyMode ? 'مخفي' : undefined}>
                {formatMoney(selectedSlicerCustomer.creditLimit || 0)}
              </span>
              <span className="text-[10px] text-slate-300 mt-0.5 block truncate">
                الضمان: {selectedSlicerCustomer.guaranteeDocs || 'بدون ضمان'}
              </span>
            </div>

            <div className="bg-slate-900/90 p-3 rounded-xl border border-sky-900/50">
              <span className="text-[11px] text-sky-300 block font-bold">مبيعات وتحصيلات 2026:</span>
              <span className="text-lg sm:text-xl font-black text-sky-300 font-mono mt-0.5 block" title={isPrivacyMode ? 'مخفي' : undefined}>
                {formatMoney(selectedSlicerCustomer.sales2026 || selectedSlicerCustomer.totalMonthlySales || 0)}
              </span>
              <span className="text-[10px] text-emerald-400 mt-0.5 block">
                المحصل: {formatMoney(selectedSlicerCustomer.collections2026 || selectedSlicerCustomer.totalMonthlyCollections || 0)}
              </span>
            </div>
          </div>

          {/* Customer Monthly Sales Sparkline 1 to 12 */}
          {selectedSlicerCustomer.monthlySales2026 && (
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div className="text-xs font-black text-slate-300 mb-2 flex items-center justify-between">
                <span>مسار مبيعات العميل الشهرية لعام 2026 (من أعمدة الشيت مبيعات 1 إلى 12):</span>
                <span className="text-[11px] text-amber-400">حركة الفواتير المسجلة</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5 text-center">
                {MONTH_NAMES_AR.map((mName, idx) => {
                  const mVal = Number(selectedSlicerCustomer.monthlySales2026?.[idx + 1]) || 0;
                  const mCol = Number(selectedSlicerCustomer.monthlyCollections2026?.[idx + 1]) || 0;
                  return (
                    <div
                      key={idx + 1}
                      className={`p-1.5 rounded-lg border text-xs ${
                        mVal > 0
                          ? 'bg-blue-950/70 border-blue-700/60 text-white'
                          : 'bg-slate-900/50 border-slate-800/80 text-slate-500'
                      }`}
                    >
                      <div className="text-[10px] font-bold text-slate-400">{mName}</div>
                      <div className={`font-mono font-black mt-0.5 ${mVal > 0 ? 'text-blue-300' : 'text-slate-600'}`}>
                        {mVal > 0 ? (isPrivacyMode ? '•••' : `${Math.round(mVal / 1000)}k`) : '0'}
                      </div>
                      {mCol > 0 && (
                        <div className="text-[9px] font-mono text-emerald-400 mt-0.5">
                          تحصيل: {isPrivacyMode ? '•••' : `${Math.round(mCol / 1000)}k`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Power BI Spotlight Dashboard: Rep, Branch, Supervisor, Period Financial Position */}
      {(selectedRep !== 'ALL' || selectedBranch !== 'ALL' || selectedMonth !== 'ALL') && (
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white rounded-2xl p-4 sm:p-5 border border-indigo-500/40 shadow-xl space-y-4 animate-in slide-in-from-top-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-500/20 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-md">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base sm:text-lg font-black text-white">
                    {selectedRep !== 'ALL'
                      ? `تحليل أداء المندوب: ${selectedRep}`
                      : selectedBranch !== 'ALL'
                      ? `تحليل أداء فرع: ${selectedBranch}`
                      : 'تحليل الأداء الشامل'}
                  </span>
                  {selectedBranch !== 'ALL' && selectedRep !== 'ALL' && (
                    <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full font-bold border border-indigo-400/30">
                      فرع {selectedBranch}
                    </span>
                  )}
                  <span className="text-xs bg-amber-400/20 text-amber-300 px-2.5 py-0.5 rounded-full font-black border border-amber-400/30">
                    {selectedMonth === 'ALL'
                      ? 'كامل 2026'
                      : selectedMonth === 'Q1'
                      ? 'الربع الأول Q1 (يناير-مارس)'
                      : selectedMonth === 'Q2'
                      ? 'الربع الثاني Q2 (أبريل-يونيو)'
                      : selectedMonth === 'Q3'
                      ? 'الربع الثالث Q3 (يوليو-سبتمبر)'
                      : selectedMonth === 'Q4'
                      ? 'الربع الرابع Q4 (أكتوبر-ديسمبر)'
                      : `مبيعات شهر ${selectedMonth} (${MONTH_NAMES_AR[Number(selectedMonth) - 1]})`}
                  </span>
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  ملخص المستحقات والمديونيات والمبيعات ونسب التغطية للعملاء
                </div>
              </div>
            </div>

            {/* Reset Filter Button if rep or branch selected */}
            {(selectedRep !== 'ALL' || selectedBranch !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedRep('ALL');
                  setSelectedBranch('ALL');
                }}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl font-bold border border-slate-700 self-start sm:self-auto cursor-pointer"
              >
                إلغاء التخصيص والعودة للكل ↺
              </button>
            )}
          </div>

          {/* 4 Focused Spotlight KPI Blocks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Box 1: Debts & Dues */}
            <div className="bg-slate-900/90 rounded-xl p-3.5 border border-purple-500/30 shadow-inner">
              <div className="text-xs font-bold text-purple-300 flex items-center justify-between">
                <span>المديونية والمستحقات</span>
                <CreditCard className="w-4 h-4 text-purple-400" />
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">إجمالي المديونية:</span>
                  <span className="text-lg font-black text-white font-mono" title={isPrivacyMode ? 'مخفي' : undefined}>
                    {formatMoney(kpiStats.totalDebt)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-rose-400 font-bold">المستحقات الواجبة:</span>
                  <span className="text-lg font-black text-rose-400 font-mono" title={isPrivacyMode ? 'مخفي' : undefined}>
                    {formatMoney(kpiStats.totalOverdue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Box 2: Period Sales & Collections */}
            <div className="bg-slate-900/90 rounded-xl p-3.5 border border-sky-500/30 shadow-inner">
              <div className="text-xs font-bold text-sky-300 flex items-center justify-between">
                <span>مبيعات وتحصيلات الفترة</span>
                <TrendingUp className="w-4 h-4 text-sky-400" />
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">المبيعات:</span>
                  <span className="text-lg font-black text-sky-300 font-mono" title={isPrivacyMode ? 'مخفي' : undefined}>
                    {formatMoney(
                      selectedMonth === 'ALL'
                        ? kpiStats.totalSales2026
                        : repAndBranchSummary.reduce((acc, r) => acc + r.periodSales, 0)
                    )}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-emerald-400 font-bold">التحصيلات:</span>
                  <span className="text-lg font-black text-emerald-400 font-mono" title={isPrivacyMode ? 'مخفي' : undefined}>
                    {formatMoney(
                      selectedMonth === 'ALL'
                        ? kpiStats.totalCollections2026
                        : repAndBranchSummary.reduce((acc, r) => acc + r.periodCollections, 0)
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Box 3: Customers Breakdown (Dealt / Eligible / Ineligible) */}
            <div className="bg-slate-900/90 rounded-xl p-3.5 border border-emerald-500/30 shadow-inner">
              <div className="text-xs font-bold text-emerald-300 flex items-center justify-between">
                <span>تصنيف العملاء في الفترة</span>
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span>✅ متعامل:</span>
                  </span>
                  <span className="text-base font-black text-white">{kpiStats.dealtCount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sky-300 font-semibold flex items-center gap-1">
                    <span>⏳ قابل للتعامل:</span>
                  </span>
                  <span className="text-base font-black text-white">{kpiStats.eligibleCount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-rose-400 font-semibold flex items-center gap-1">
                    <span>⛔ غير قابل / موقوف:</span>
                  </span>
                  <span className="text-xs font-bold text-rose-300">{kpiStats.ineligibleCount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Box 4: Coverage & Efficiency Rates */}
            <div className="bg-slate-900/90 rounded-xl p-3.5 border border-amber-500/30 shadow-inner flex flex-col justify-between">
              <div className="text-xs font-bold text-amber-300 flex items-center justify-between">
                <span>مؤشرات الكفاءة والتغطية</span>
                <CheckCircle2 className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-300 font-bold">نسبة التغطية (من القابلين):</span>
                    <span className="text-amber-400 font-black">{kpiStats.coverageRate}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-gradient-to-r from-amber-400 to-emerald-400 h-2 rounded-full" style={{ width: `${Math.min(100, kpiStats.coverageRate)}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-300 font-bold">نسبة التحصيل:</span>
                    <span className="text-emerald-400 font-black">{kpiStats.collectionRate}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-gradient-to-r from-teal-400 to-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(100, kpiStats.collectionRate)}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Customers Table Card (Fast, Virtual-friendly, Paginated) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Controls Top */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2 font-bold">
            <span>عرض الصفحة: {currentPage} من {totalPages}</span>
            <span className="text-slate-300">|</span>
            <span>النتائج: {filteredCustomers.length.toLocaleString()} عميل</span>
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-1.5 font-bold">
            <span>عدد الصفوف:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {paginatedCustomers.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-3">
            <Users className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
            <div className="font-black text-slate-700">لا يوجد عملاء مطابقين لمعايير البحث الحالية</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {customers.length === 0
                ? 'قاعدة البيانات خالية حالياً. يمكن للمسؤول استيراد بيانات العملاء عبر إكسل أو شيت المديونية.'
                : 'جرب تعديل خيارات التصفية أو مسح كلمة البحث لرؤية النتائج.'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile View: Responsive Touch Cards (md:hidden) */}
            <div className="md:hidden divide-y divide-slate-100 bg-slate-50/50">
              {paginatedCustomers.map((c, index) => {
                const globalIdx = (currentPage - 1) * pageSize + index + 1;
                const bal = c.currentBalance ?? c.balance ?? 0;
                const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
                const monthlySalesSum = c.monthlySales2026 ? Object.values(c.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
                const s26 = Math.max(c.sales2026 || 0, c.totalMonthlySales || 0, c.totalOverallSales || 0, monthlySalesSum);
                const monthlyColsSum = c.monthlyCollections2026 ? Object.values(c.monthlyCollections2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
                const col26 = Math.max(c.collections2026 || 0, c.totalMonthlyCollections || 0, c.totalOverallCollections || 0, monthlyColsSum);
                const metrics = customerMetricsMap.get(c.id);

                return (
                  <div
                    key={c.id || c.code}
                    className="p-3.5 bg-white space-y-2.5 transition active:bg-amber-50/30"
                  >
                    {/* Card Header: Code, Name, Deal Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            #{globalIdx} • {c.code || '---'}
                          </span>
                          {c.region && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {c.region}
                            </span>
                          )}
                        </div>
                        <div
                          onClick={() => setSelectedCustomer(c)}
                          className="font-black text-slate-900 text-sm mt-1 cursor-pointer hover:text-amber-600"
                        >
                          {c.name}
                        </div>
                      </div>

                      {/* Eligibility Badge */}
                      <div className="shrink-0">
                        {metrics?.isExplicitIneligible ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                            غير قابل ⛔
                          </span>
                        ) : metrics?.dealtInSelectedMonth ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                            متعامل ✅
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                            قابل ⏳
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Branch & Rep & Phone */}
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                      <div>
                        <span className="font-bold text-slate-700">{c.branchName}</span>
                        <span className="mx-1">•</span>
                        <span>{c.salesRepName || c.repName || 'مندوب غير محدد'}</span>
                      </div>
                      {c.phone && (
                        <a
                          href={`tel:${c.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1 border border-emerald-200"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{c.phone}</span>
                        </a>
                      )}
                    </div>

                    {/* Financial Metrics 2x2 Grid */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-xs">
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold">المديونية الحالية</div>
                        <div className="font-black text-purple-900 font-mono text-sm" title={isPrivacyMode ? 'مخفي' : undefined}>
                          {formatMoney(bal)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-rose-600 font-bold">المستحقات الواجبة</div>
                        <div className={`font-black font-mono text-sm ${overdue > 0 ? 'text-rose-700' : 'text-slate-400'}`} title={isPrivacyMode ? 'مخفي' : undefined}>
                          {formatMoney(overdue)}
                        </div>
                      </div>
                      <div className="pt-1.5 border-t border-slate-200/60">
                        <div className="text-[10px] text-slate-500 font-bold">مبيعات 2026</div>
                        <div className="font-black text-slate-800 font-mono" title={isPrivacyMode ? 'مخفي' : undefined}>
                          {formatMoney(s26)}
                        </div>
                      </div>
                      <div className="pt-1.5 border-t border-slate-200/60">
                        <div className="text-[10px] text-emerald-700 font-bold">التحصيلات 2026</div>
                        <div className="font-black text-emerald-800 font-mono" title={isPrivacyMode ? 'مخفي' : undefined}>
                          {formatMoney(col26)}
                        </div>
                      </div>
                    </div>

                    {/* Card Actions Bar */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedCustomer(c)}
                        className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-1.5 px-2 rounded-xl text-xs flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-amber-400" />
                        <span>الملف 360</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setIsLoggingVisit(true);
                        }}
                        className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold py-1.5 px-2.5 rounded-xl text-xs flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-purple-600" />
                        <span>تسجيل زيارة</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop View: Full Comprehensive Table (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200 whitespace-nowrap">
                  <th className="p-3 text-center w-10">#</th>
                  <th
                    onClick={() => {
                      if (sortBy === 'code') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('code'); setSortOrder('asc'); }
                    }}
                    className="p-3 cursor-pointer hover:bg-slate-200/60 transition"
                  >
                    <div className="flex items-center gap-1">
                      <span>الكود</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortBy === 'name') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('name'); setSortOrder('asc'); }
                    }}
                    className="p-3 cursor-pointer hover:bg-slate-200/60 transition min-w-[180px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>اسم العميل / المحل</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-3 text-center whitespace-nowrap">قابل / غير</th>
                  <th className="p-3">الفرع / المندوب</th>
                  <th
                    onClick={() => {
                      if (sortBy === 'balance') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('balance'); setSortOrder('desc'); }
                    }}
                    className="p-3 cursor-pointer hover:bg-slate-200/60 transition text-left"
                  >
                    <div className="flex items-center justify-end gap-1 text-purple-700">
                      <span>المديونية (ج.م)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortBy === 'overdue') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('overdue'); setSortOrder('desc'); }
                    }}
                    className="p-3 cursor-pointer hover:bg-slate-200/60 transition text-left"
                  >
                    <div className="flex items-center justify-end gap-1 text-rose-700">
                      <span>المستحقات (ج.م)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortBy === 'creditLimit') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('creditLimit'); setSortOrder('desc'); }
                    }}
                    className="p-3 cursor-pointer hover:bg-slate-200/60 transition text-left"
                  >
                    <div className="flex items-center justify-end gap-1 text-slate-700">
                      <span>الحد الائتماني</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="p-3 text-center">أوراق الضمان</th>
                  <th
                    onClick={() => {
                      if (sortBy === 'sales2026') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('sales2026'); setSortOrder('desc'); }
                    }}
                    className="p-3 cursor-pointer hover:bg-slate-200/60 transition text-left"
                  >
                    <div className="flex items-center justify-end gap-1 text-blue-700">
                      <span>البيع 2026</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortBy === 'collections2026') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('collections2026'); setSortOrder('desc'); }
                    }}
                    className="p-3 cursor-pointer hover:bg-slate-200/60 transition text-left"
                  >
                    <div className="flex items-center justify-end gap-1 text-emerald-700">
                      <span>التحصيل 2026</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortBy === 'lastVisit') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('lastVisit'); setSortOrder('desc'); }
                    }}
                    className="p-3 cursor-pointer hover:bg-slate-200/60 transition text-center"
                  >
                    <div className="flex items-center justify-center gap-1 text-amber-800">
                      <span>تاريخ آخر زيارة</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortBy === 'order') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('order'); setSortOrder('desc'); }
                    }}
                    className="p-3 cursor-pointer hover:bg-slate-200/60 transition text-center"
                  >
                    <div className="flex items-center justify-center gap-1 text-teal-800">
                      <span>أمر البيع / الطلبية</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedCustomers.map((c, index) => {
                  const globalIdx = (currentPage - 1) * pageSize + index + 1;
                  const bal = c.currentBalance ?? c.balance ?? 0;
                  const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
                  const limit = c.creditLimit || 0;
                  const isOverLimit = limit > 0 && bal > limit;
                  const monthlySalesSum = c.monthlySales2026 ? Object.values(c.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
                  const s26 = Math.max(c.sales2026 || 0, c.totalMonthlySales || 0, c.totalOverallSales || 0, monthlySalesSum);
                  const monthlyColsSum = c.monthlyCollections2026 ? Object.values(c.monthlyCollections2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
                  const col26 = Math.max(c.collections2026 || 0, c.totalMonthlyCollections || 0, c.totalOverallCollections || 0, monthlyColsSum);
                  const colRate = s26 > 0 ? Math.round((col26 / s26) * 100) : (col26 > 0 ? 100 : 0);
                  const guaranteeInfo = getGuaranteeBadge(c.guaranteeDocs, c.guaranteeAmount, limit);
                  const visitTime = getRelativeTimeArabic(c.lastVisitDate);
                  const orderSummary = getCustomerOrderSummary(c);
                  const metrics = customerMetricsMap.get(c.id);

                  return (
                    <tr
                      key={c.id || c.code}
                      onClick={() => setSelectedCustomer(c)}
                      className="hover:bg-amber-50/40 transition cursor-pointer group"
                    >
                      <td className="p-3 text-center font-bold text-slate-400">
                        {globalIdx}
                      </td>

                      <td className="p-3 font-mono font-black text-slate-700 whitespace-nowrap">
                        {c.code || '---'}
                      </td>

                      <td className="p-3">
                        <div className="font-black text-slate-900 group-hover:text-amber-600 transition">
                          {c.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {c.phone && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              <span>{c.phone}</span>
                            </span>
                          )}
                          {c.region && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                              {c.region}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* قابل / غير */}
                      <td className="p-3 text-center whitespace-nowrap">
                        {metrics?.isExplicitIneligible ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            غير قابل ⛔
                          </span>
                        ) : metrics?.dealtInSelectedMonth ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            متعامل ✅
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                            <Clock className="w-3 h-3 text-sky-600" />
                            قابل للتعامل ⏳
                          </span>
                        )}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        <div className="font-bold text-slate-700">{c.branchName}</div>
                        <div className="text-[11px] text-slate-500">
                          {c.salesRepName || c.repName || 'غير محدد'}
                        </div>
                      </td>

                      {/* المديونية */}
                      <td className="p-3 text-left font-mono whitespace-nowrap">
                        <div className={`font-black ${bal > 0 ? 'text-purple-900' : 'text-slate-400'}`}>
                          {formatMoney(bal)}
                        </div>
                        {isOverLimit && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.2 rounded-full font-extrabold bg-rose-100 text-rose-700 border border-rose-200 mt-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> متجاوز الحد
                          </span>
                        )}
                      </td>

                      {/* المستحقات */}
                      <td className="p-3 text-left font-mono whitespace-nowrap">
                        {overdue > 0 ? (
                          <div>
                            <div className="font-black text-rose-700">
                              {formatMoney(overdue)}
                            </div>
                            <span className="inline-block text-[9px] px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 font-bold border border-rose-200 mt-0.5">
                              واجب التحصيل
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-medium">0.00 ج.م</span>
                        )}
                      </td>

                      {/* الحد الائتماني وطريقة الدفع */}
                      <td className="p-3 text-left font-mono whitespace-nowrap">
                        {limit > 0 ? (
                          <div>
                            <div className="font-bold text-slate-800">
                              {formatMoney(limit)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              المتبقي: {formatMoney(Math.max(0, limit - bal))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-bold">0.00 ج.م</span>
                        )}
                        <div className="mt-1">
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded font-bold ${
                            (c.paymentTerms || 'كاش').includes('شيك')
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : (c.paymentTerms || 'كاش').includes('دفع')
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {c.paymentTerms || 'كاش'}
                          </span>
                        </div>
                      </td>

                      {/* أوراق الضمان */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${guaranteeInfo.color}`}>
                          <ShieldCheck className="w-3 h-3" />
                          <span>{guaranteeInfo.label}</span>
                        </span>
                      </td>

                      {/* البيع 2026 */}
                      <td className="p-3 text-left font-mono font-black text-blue-800 whitespace-nowrap">
                        {formatMoney(s26)}
                      </td>

                      {/* التحصيل 2026 */}
                      <td className="p-3 text-left font-mono whitespace-nowrap">
                        <div className="font-black text-emerald-800">
                          {formatMoney(col26)}
                        </div>
                        {s26 > 0 && (
                          <div className="text-[10px] font-bold text-emerald-600 mt-0.5">
                            سداد: {colRate}%
                          </div>
                        )}
                      </td>

                      {/* تاريخ آخر زيارة */}
                      <td className="p-3 text-center whitespace-nowrap">
                        {c.lastVisitDate ? (
                          <div>
                            <div className="font-black text-slate-800 font-mono text-[11px]">
                              {c.lastVisitDate}
                            </div>
                            <span className={`inline-block text-[10px] px-1.5 py-0.2 rounded-full font-bold mt-0.5 ${visitTime.color}`}>
                              {visitTime.text}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">لم تسجل بعد</span>
                        )}
                      </td>

                      {/* أمر البيع لو عامل طلبية */}
                      <td className="p-3 text-center whitespace-nowrap">
                        {orderSummary.hasOrder && orderSummary.latestOrder ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono font-black text-[11px] bg-teal-50 text-teal-800 border border-teal-200">
                              <ShoppingCart className="w-3 h-3 text-teal-600" />
                              <span>{orderSummary.latestOrder.invoiceNumber || 'أمر بيع'}</span>
                            </span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">
                                {orderSummary.latestOrder.status || 'مسجل'}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-slate-600">
                                {formatMoney(orderSummary.latestOrder.total)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <span className="text-slate-400 text-[11px]">لا يوجد أمر</span>
                          </div>
                        )}
                      </td>

                      {/* الإجراءات */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {onOpenNewOrderForCustomer && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenNewOrderForCustomer(c);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition flex items-center gap-1 shadow-xs cursor-pointer"
                              title="بدء فاتورة كاشير للعميل في الكتالوج"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span>كاشير</span>
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomer(c);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            title="عرض الملف الشامل للعميل"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
        )}

        {/* Pagination Footer Bar */}
        {totalPages > 1 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="font-bold text-slate-500">
              عرض {(currentPage - 1) * pageSize + 1} إلى {Math.min(currentPage * pageSize, filteredCustomers.length)} من أصل {filteredCustomers.length.toLocaleString()}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                title="الصفحة الأولى"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer font-bold flex items-center gap-1"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span>السابق</span>
              </button>

              <span className="px-3 py-1 font-black bg-slate-900 text-amber-300 rounded-lg">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer font-bold flex items-center gap-1"
              >
                <span>التالي</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                title="الصفحة الأخيرة"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CUSTOMER 360-DEGREE DETAIL DRAWER / MODAL */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm overflow-y-auto p-2 sm:p-4 md:p-6 flex items-start justify-center animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-5xl xl:max-w-6xl w-full sm:w-[94%] my-2 sm:my-4 shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white rounded-t-3xl flex items-center justify-between sticky top-0 z-20 border-b border-slate-800">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-sm shrink-0">
                  {selectedCustomer.name.slice(0, 1)}
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="font-black text-base sm:text-xl text-white">
                      {selectedCustomer.name}
                    </h3>
                    <span className="font-mono text-xs px-2.5 py-0.5 rounded-lg bg-amber-400/20 text-amber-300 font-black border border-amber-400/30">
                      كود: {selectedCustomer.code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 flex items-center gap-2 sm:gap-3 flex-wrap font-medium">
                    <span className="text-amber-200/90 font-bold">🏢 الفرع: {selectedCustomer.branchName}</span>
                    <span>•</span>
                    <span>المندوب المسؤول: <strong className="text-white font-black">{selectedCustomer.salesRepName || selectedCustomer.repName || 'غير محدد'}</strong></span>
                    {selectedCustomer.region && (
                      <>
                        <span>•</span>
                        <span>المنطقة: {selectedCustomer.region}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Large, Easy-to-click Close Button */}
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setIsLoggingVisit(false);
                }}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center transition cursor-pointer shrink-0 border border-white/10 shadow-xs"
                title="إغلاق النافذة (Esc)"
                aria-label="إغلاق"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {/* Quick Actions & Contact Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2">
                  {selectedCustomer.phone ? (
                    <>
                      <a
                        href={`tel:${selectedCustomer.phone}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs hover:bg-blue-100 transition"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>اتصال ({selectedCustomer.phone})</span>
                      </a>
                      <a
                        href={`https://wa.me/20${selectedCustomer.phone.replace(/^0+/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs hover:bg-emerald-100 transition"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>واتساب</span>
                      </a>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 font-bold">لا يوجد رقم هاتف مسجل</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsLoggingVisit(!isLoggingVisit)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-sm transition cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>تسجيل زيارة عميل</span>
                  </button>

                  {onOpenNewOrderForCustomer && (
                    <button
                      onClick={() => {
                        onOpenNewOrderForCustomer(selectedCustomer);
                        setSelectedCustomer(null);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-sm transition cursor-pointer"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>بدء فاتورة كاشير في الكتالوج 🛒</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Visit Logging Form Inline */}
              {isLoggingVisit && (
                <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200 space-y-3 animate-in fade-in">
                  <div className="font-black text-xs text-slate-800 flex items-center justify-between">
                    <span>تسجيل زيارة جديدة لـ ({selectedCustomer.name})</span>
                    <button
                      onClick={() => setIsLoggingVisit(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">تاريخ الزيارة:</label>
                      <input
                        type="date"
                        value={visitDate}
                        onChange={(e) => setVisitDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">نوع الزيارة:</label>
                      <select
                        value={visitType}
                        onChange={(e: any) => setVisitType(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      >
                        <option value="زيارة بيع وطلبية">زيارة بيع وطلبية</option>
                        <option value="زيارة تحصيل">زيارة تحصيل</option>
                        <option value="زيارة دورية">زيارة دورية</option>
                        <option value="متابعة حساب">متابعة حساب</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">نتيجة الزيارة:</label>
                      <select
                        value={visitOutcome}
                        onChange={(e: any) => setVisitOutcome(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      >
                        <option value="تم عمل طلبية">تم عمل طلبية</option>
                        <option value="تم التحصيل">تم التحصيل</option>
                        <option value="تأجيل سداد">تأجيل سداد</option>
                        <option value="المحل مغلق">المحل مغلق</option>
                        <option value="متابعة فقط">متابعة فقط</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">المبلغ المحصل إن وجد (ج.م):</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={visitCollected}
                        onChange={(e) => setVisitCollected(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">ملاحظات الزيارة:</label>
                      <input
                        type="text"
                        placeholder="مثال: طلب أصناف أطقم كاسات، أو تم الاتفاق على السداد السبت القادم"
                        value={visitNotes}
                        onChange={(e) => setVisitNotes(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleSaveVisit}
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow transition cursor-pointer"
                    >
                      حفظ وتسجيل الزيارة
                    </button>
                  </div>
                </div>
              )}

              {/* Financial & Comparison Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-blue-50/90 border border-blue-200/80 shadow-2xs">
                  <div className="text-xs font-black text-blue-700 flex items-center justify-between">
                    <span>مبيعات 2026</span>
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                  </div>
                  <div className="text-lg sm:text-2xl font-black font-mono text-blue-950 mt-1">
                    {formatMoney(selectedCustomer.sales2026 || 0)}
                  </div>
                  <div className="text-[11px] font-bold text-blue-600 mt-1 border-t border-blue-100 pt-1 flex items-center justify-between">
                    <span>سنة 2025:</span>
                    <span className="font-mono">{formatMoney(selectedCustomer.sales2025 || 0)}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-200/80 shadow-2xs">
                  <div className="text-xs font-black text-emerald-700 flex items-center justify-between">
                    <span>تحصيلات 2026</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                  <div className="text-lg sm:text-2xl font-black font-mono text-emerald-950 mt-1">
                    {formatMoney(selectedCustomer.collections2026 || 0)}
                  </div>
                  <div className="text-[11px] font-bold text-emerald-600 mt-1 border-t border-emerald-100 pt-1 flex items-center justify-between">
                    <span>سنة 2025:</span>
                    <span className="font-mono">{formatMoney(selectedCustomer.collections2025 || 0)}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-purple-50/90 border border-purple-200/80 shadow-2xs">
                  <div className="text-xs font-black text-purple-700 flex items-center justify-between">
                    <span>المديونية الحالية</span>
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                  </div>
                  <div className="text-lg sm:text-2xl font-black font-mono text-purple-950 mt-1">
                    {formatMoney(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0)}
                  </div>
                  <div className="text-[11px] font-bold text-purple-600 mt-1 border-t border-purple-100 pt-1 flex items-center justify-between">
                    <span>الحد الائتماني:</span>
                    <span className="font-mono">{formatMoney(selectedCustomer.creditLimit || 0)}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-rose-50/90 border border-rose-200/80 shadow-2xs">
                  <div className="text-xs font-black text-rose-700 flex items-center justify-between">
                    <span>المستحقات الواجبة</span>
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                  </div>
                  <div className="text-lg sm:text-2xl font-black font-mono text-rose-950 mt-1">
                    {formatMoney(selectedCustomer.totalOverdueAndDue ?? selectedCustomer.overdueBalance ?? 0)}
                  </div>
                  <div className="text-[11px] font-bold text-rose-600 mt-1 border-t border-rose-100 pt-1 flex items-center justify-between">
                    <span>الحالة:</span>
                    <span>واجبة التحصيل فوراً</span>
                  </div>
                </div>
              </div>

              {/* Customer Guarantee & Financial Dossier (High Clarity & Direct Logic) */}
              <div className="p-4 bg-slate-50/95 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-black text-xs sm:text-sm text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>موقف أوراق الضمان، الحد الائتماني، وطرق الدفع</span>
                  </h4>
                  {selectedCustomer.hasGuarantee || (selectedCustomer.guaranteeAmount && selectedCustomer.guaranteeAmount > 0) ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-100 text-emerald-900 text-xs font-black border border-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>ماضي على ورق ضمان</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300">
                      <span>لا يوجد ورق ضمان</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* أوراق الضمان */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    <div className="text-xs font-bold text-slate-500">أوراق الضمان</div>
                    <div className="text-sm sm:text-base font-black text-slate-900 mt-1 font-mono">
                      {selectedCustomer.guaranteeAmount && selectedCustomer.guaranteeAmount > 0
                        ? `ماضي (${formatMoney(selectedCustomer.guaranteeAmount)})`
                        : (selectedCustomer.hasGuarantee ? (selectedCustomer.guaranteeDocs || 'ماضي على ورق ضمان') : 'لا يوجد ورق ضمان')}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {selectedCustomer.guaranteeAmount && selectedCustomer.guaranteeAmount > 0
                        ? 'مبلغ ضمان معتمد مثبت بالشيت'
                        : (selectedCustomer.hasGuarantee ? 'مستند ضمان مسجل' : 'لا يوجد مبلغ أو أوراق ضمان')}
                    </div>
                  </div>

                  {/* الحد الائتماني المعتمد */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    <div className="text-xs font-bold text-slate-500">الحد الائتماني</div>
                    <div className="text-sm sm:text-base font-black text-slate-900 mt-1 font-mono">
                      {selectedCustomer.creditLimit && selectedCustomer.creditLimit > 0
                        ? formatMoney(selectedCustomer.creditLimit)
                        : '0.00 ج.م (بدون حد)'}
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 mt-1">
                      {selectedCustomer.creditLimit && selectedCustomer.creditLimit > 0
                        ? `المتبقي: ${formatMoney(Math.max(0, (selectedCustomer.creditLimit || 0) - (selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0)))}`
                        : 'بدون تسهيل ائتماني'}
                    </div>
                  </div>

                  {/* طريقة الدفع */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    <div className="text-xs font-bold text-slate-500">طريقة الدفع المعتمدة</div>
                    <div className="text-sm sm:text-base font-black text-slate-900 mt-1">
                      <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-black ${
                        (selectedCustomer.paymentTerms || 'كاش').includes('شيك')
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : (selectedCustomer.paymentTerms || 'كاش').includes('دفع')
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {selectedCustomer.paymentTerms || 'كاش'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {(selectedCustomer.paymentTerms || 'كاش').includes('شيك')
                        ? 'سداد بشيكات آجلة'
                        : (selectedCustomer.paymentTerms || 'كاش').includes('دفع')
                        ? 'سداد مقسم على دفعات'
                        : 'سداد نقدي عند الاستلام'}
                    </div>
                  </div>

                  {/* حالة التعامل والنشاط */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    <div className="text-xs font-bold text-slate-500">نشاط التعامل في 2026</div>
                    <div className="text-sm sm:text-base font-black text-slate-900 mt-1 flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${selectedCustomer.hasDealtIn2026 ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <span>{selectedCustomer.hasDealtIn2026 ? 'عميل نشط ومتعامل' : 'غير متعامل في 2026'}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {selectedCustomer.lastVisitDate ? `آخر زيارة: ${selectedCustomer.lastVisitDate}` : 'لم تسجل زيارة حتى الآن'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sales Orders & Invoices of the Customer (أمر البيع لو عامل طلبية) */}
              {(() => {
                const customerOrders = customerOrdersLookup.getOrdersForCustomer(selectedCustomer);

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="font-black text-xs sm:text-sm text-slate-800 flex items-center gap-1.5">
                        <ShoppingCart className="w-4 h-4 text-teal-600" />
                        <span>أوامر البيع والطلبيات المسجلة للعميل ({customerOrders.length})</span>
                      </h4>
                      {onOpenNewOrderForCustomer && (
                        <button
                          onClick={() => {
                            onOpenNewOrderForCustomer(selectedCustomer);
                            setSelectedCustomer(null);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-black text-xs transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إنشاء أمر بيع / طلبية جديدة</span>
                        </button>
                      )}
                    </div>

                    {customerOrders.length > 0 ? (
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-center text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                              <th className="p-2 text-right">رقم الفاتورة / الأمر</th>
                              <th className="p-2">التاريخ</th>
                              <th className="p-2">الحالة</th>
                              <th className="p-2 text-left">الإجمالي (ج.م)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {customerOrders.map((inv) => (
                              <tr key={inv.id || inv.invoiceNumber} className="hover:bg-slate-50">
                                <td className="p-2 text-right font-mono font-bold text-slate-800">
                                  {inv.invoiceNumber}
                                </td>
                                <td className="p-2 font-mono text-slate-500">
                                  {inv.date}
                                </td>
                                <td className="p-2">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    inv.status === 'معتمدة' || inv.status === 'تم التسليم' || inv.status === 'معتمدة ومصروفة من المخزن'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : inv.status === 'جاري التجهيز' || inv.status === 'قيد مراجعة المشرف'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {inv.status || 'مسجل'}
                                  </span>
                                </td>
                                <td className="p-2 text-left font-mono font-black text-teal-800">
                                  {formatCurrency(inv.estimatedGrandTotal ?? inv.subtotal ?? 0)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-slate-400 text-xs font-bold flex flex-col items-center justify-center gap-1.5">
                        <span>لا توجد أوامر بيع أو طلبيات مسجلة حالياً لهذا العميل.</span>
                        {onOpenNewOrderForCustomer && (
                          <button
                            onClick={() => {
                              onOpenNewOrderForCustomer(selectedCustomer);
                              setSelectedCustomer(null);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition cursor-pointer shadow-2xs"
                          >
                            + بدء طلبية وفاتورة كاشير جديدة
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Enhanced 12 Months Breakdown & Executive Totals */}
              {(() => {
                // Compute month level sales and collections
                let totalMonthSales = 0;
                let totalMonthCol = 0;
                const activeMonthNumbers: number[] = [];

                for (let m = 1; m <= 12; m++) {
                  const s = selectedCustomer.monthlySales2026?.[m] || 0;
                  const c = selectedCustomer.monthlyCollections2026?.[m] || 0;
                  totalMonthSales += s;
                  totalMonthCol += c;
                  if (s > 0 || c > 0) {
                    activeMonthNumbers.push(m);
                  }
                }

                // Fallback to customer general totals if monthly columns were not broken down in the sheet
                const grandSales2026 = Math.max(totalMonthSales, selectedCustomer.sales2026 || 0);
                const grandCol2026 = Math.max(totalMonthCol, selectedCustomer.collections2026 || 0);
                const grandRate = grandSales2026 > 0
                  ? Math.min(100, Math.round((grandCol2026 / grandSales2026) * 100))
                  : (grandCol2026 > 0 ? 100 : 0);

                const hasActiveMonths = activeMonthNumbers.length > 0;
                const monthsToShow = showAllMonthsInModal || !hasActiveMonths
                  ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
                  : activeMonthNumbers;

                return (
                  <div className="space-y-3">
                    {/* Header with Title and View Toggle */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-black text-xs sm:text-sm text-slate-900">
                            حركة المبيعات والتحصيلات لعام 2026
                          </h4>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {hasActiveMonths
                              ? `يوجد حركات مسجلة في (${activeMonthNumbers.length}) من أصل 12 شهراً`
                              : 'العميل مصنف كـ (غير متعامل في 2026)'}
                          </p>
                        </div>
                      </div>

                      {/* Toggle Active vs All Months */}
                      {hasActiveMonths && (
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                          <button
                            type="button"
                            onClick={() => setShowAllMonthsInModal(false)}
                            className={`px-2.5 py-1 rounded-lg font-black transition cursor-pointer ${
                              !showAllMonthsInModal
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            الأشهر النشطة ({activeMonthNumbers.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowAllMonthsInModal(true)}
                            className={`px-2.5 py-1 rounded-lg font-black transition cursor-pointer ${
                              showAllMonthsInModal
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            كافة الأشهر الـ 12
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Executive KPI Summary Strip */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white shadow-xs">
                      <div className="flex items-center justify-between sm:flex-col sm:items-start px-2 py-1">
                        <span className="text-[11px] font-bold text-slate-300">إجمالي مبيعات 2026:</span>
                        <span className="font-mono text-base sm:text-lg font-black text-amber-300">
                          {formatCurrency(grandSales2026)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between sm:flex-col sm:items-start px-2 py-1 border-t sm:border-t-0 sm:border-r border-slate-700">
                        <span className="text-[11px] font-bold text-slate-300">إجمالي تحصيلات 2026:</span>
                        <span className="font-mono text-base sm:text-lg font-black text-emerald-400">
                          {formatCurrency(grandCol2026)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between sm:flex-col sm:items-start px-2 py-1 border-t sm:border-t-0 sm:border-r border-slate-700">
                        <span className="text-[11px] font-bold text-slate-300">نسبة التغطية والسداد:</span>
                        <span className={`font-mono text-base sm:text-lg font-black ${
                          grandRate >= 90 ? 'text-emerald-400' : grandRate >= 50 ? 'text-amber-300' : 'text-rose-400'
                        }`}>
                          {grandRate}%
                        </span>
                      </div>
                    </div>

                    {/* Monthly Table OR Informative Empty State */}
                    {!hasActiveMonths && !showAllMonthsInModal ? (
                      <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
                        <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-500 mx-auto flex items-center justify-center">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-black text-sm text-slate-800">
                            لا توجد حركات بيع أو تحصيل مسجلة لهذا العميل خلال أشهر 2026
                          </div>
                          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                            العميل مسجل حالياً بدون فواتير أو سدادات خلال العام الحالي، يمكنك إنشاء طلبية جديدة أو تسجيل زيارة ميدانية لتنشيط التعامل.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAllMonthsInModal(true)}
                          className="px-4 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-black text-xs transition cursor-pointer shadow-2xs"
                        >
                          عرض تفاصيل جدول كافة أشهر السنة الـ 12
                        </button>
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                        <table className="w-full text-center text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-200 text-xs">
                              <th className="p-3 text-right">الشهر</th>
                              <th className="p-3 text-blue-800">المبيعات (ج.م)</th>
                              <th className="p-3 text-emerald-800">التحصيلات (ج.م)</th>
                              <th className="p-3 text-center">نسبة السداد</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {monthsToShow.map((mNum) => {
                              const monthName = MONTH_NAMES_AR[mNum - 1];
                              const s = selectedCustomer.monthlySales2026?.[mNum] || 0;
                              const col = selectedCustomer.monthlyCollections2026?.[mNum] || 0;
                              const rate = s > 0 ? Math.round((col / s) * 100) : (col > 0 ? 100 : 0);
                              const hasData = s > 0 || col > 0;

                              return (
                                <tr key={mNum} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="p-3 text-right font-black text-slate-900">
                                    <span>{monthName}</span>
                                    <span className="text-[11px] font-bold text-slate-400 mr-1.5">(شهر {mNum})</span>
                                  </td>
                                  <td className="p-3 font-mono font-black text-sm text-blue-900">
                                    {s > 0 ? formatCurrency(s) : (
                                      <span className="text-slate-400 font-normal text-[11px]">لا توجد بيانات لهذا الشهر</span>
                                    )}
                                  </td>
                                  <td className="p-3 font-mono font-black text-sm text-emerald-900">
                                    {col > 0 ? formatCurrency(col) : (
                                      <span className="text-slate-400 font-normal text-[11px]">لا توجد بيانات لهذا الشهر</span>
                                    )}
                                  </td>
                                  <td className="p-3 text-center">
                                    {hasData ? (
                                      <span className={`font-black text-xs px-2.5 py-1 rounded-full inline-block ${
                                        rate >= 90
                                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                          : rate >= 50
                                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                          : 'bg-rose-100 text-rose-900 border border-rose-300'
                                      }`}>
                                        {rate}%
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 font-medium">---</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          {/* Financial Total Summary Row */}
                          <tfoot className="bg-slate-900 text-white font-black border-t-2 border-slate-800">
                            <tr>
                              <td className="p-3 text-right text-xs text-amber-300 font-black">
                                الإجمالي السنوي لعام 2026:
                              </td>
                              <td className="p-3 font-mono font-black text-sm sm:text-base text-blue-200">
                                {formatCurrency(grandSales2026)}
                              </td>
                              <td className="p-3 font-mono font-black text-sm sm:text-base text-emerald-300">
                                {formatCurrency(grandCol2026)}
                              </td>
                              <td className="p-3 text-center">
                                <span className={`font-black text-xs px-3 py-1 rounded-full inline-block ${
                                  grandRate >= 90
                                    ? 'bg-emerald-500 text-slate-950'
                                    : grandRate >= 50
                                    ? 'bg-amber-400 text-slate-950'
                                    : 'bg-rose-500 text-white'
                                }`}>
                                  {grandRate}%
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Visit History Log if any */}
              {selectedCustomer.visitHistory && selectedCustomer.visitHistory.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    <span>سجل الزيارات الميدانية المسجلة ({selectedCustomer.visitHistory.length})</span>
                  </h4>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedCustomer.visitHistory.map((v) => (
                      <div key={v.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                        <div>
                          <div className="font-black text-slate-800 flex items-center gap-2">
                            <span>{v.date}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold">{v.type || 'زيارة'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">{v.outcome}</span>
                          </div>
                          {v.notes && <p className="text-slate-500 text-[11px] mt-1">{v.notes}</p>}
                        </div>

                        {v.collectedAmount && v.collectedAmount > 0 ? (
                          <div className="text-left font-mono font-black text-emerald-700">
                            +{formatCurrency(v.collectedAmount)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer with Clear, High-Affordance Close Button */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 rounded-b-3xl flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs text-slate-600 font-bold flex items-center gap-2">
                <span>المنطقة:</span>
                <span className="text-slate-900 font-black">{selectedCustomer.region || selectedCustomer.address || 'غير محددة'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setIsLoggingVisit(false);
                }}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl font-black text-xs sm:text-sm shadow-md transition cursor-pointer flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                <span>إغلاق النافذة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN & MANAGER GOOGLE SHEETS & EXCEL SYNC MODAL */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">مزامنة واستيراد شيت العملاء والمديونية</h3>
                  <p className="text-[11px] text-slate-400">تحميل بيانات الـ 4000 عميل ومبيعات وتحصيلات الشهور</p>
                </div>
              </div>
              <button
                onClick={() => setIsSyncModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Feedback Message */}
            {syncStatus && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  syncStatus.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {syncStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{syncStatus.message}</span>
              </div>
            )}

            {/* Google Sheets Sync Option */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                  <span>رابط Google Sheet لشيت المديونية والعملاء (Clients):</span>
                </label>
                {googleSheetUrl && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>محفوظ دائماً</span>
                  </span>
                )}
              </div>

              <input
                type="url"
                value={googleSheetUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setGoogleSheetUrl(val);
                  if (val.trim()) {
                    saveSingleSourceUrl('customers', val.trim());
                    setSavedSheetHistory(getSavedSheetHistory('customers'));
                  }
                }}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-amber-500"
              />

              {/* Saved History Quick Selector */}
              {savedSheetHistory.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 font-bold">الروابط السابقة المحفوظة:</span>
                  {savedSheetHistory.map((link, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setGoogleSheetUrl(link);
                        saveSingleSourceUrl('customers', link);
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition font-mono truncate max-w-[200px] cursor-pointer ${
                        googleSheetUrl === link
                          ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                      title={link}
                    >
                      شيت {idx + 1}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={handleSyncGoogleSheet}
                disabled={isSyncing || !googleSheetUrl}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black py-2.5 rounded-xl text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري سحب ومزامنة البيانات...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>بدء المزامنة الحية من جوجل شيت</span>
                  </>
                )}
              </button>
            </div>

            {/* Direct Excel File Upload Option */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-blue-500" />
                <span>أو رفع ملف Excel مباشر من الجهاز:</span>
              </div>

              <label className="w-full border-2 border-dashed border-slate-300 hover:border-amber-500 p-4 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-white transition text-center">
                <Upload className="w-6 h-6 text-slate-400" />
                <span className="text-xs font-bold text-slate-700">اضغط هنا لاختيار ملف Excel (.xlsx)</span>
                <span className="text-[10px] text-slate-400">يدعم حتى 10,000 عميل مع التحليل الشهري</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Template Download */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <button
                onClick={downloadCustomerAnalyticsTemplate}
                className="text-amber-600 hover:text-amber-700 font-bold flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل قالب Excel جاهز بالأعمدة</span>
              </button>

              <button
                onClick={() => setIsSyncModalOpen(false)}
                className="px-4 py-1.5 bg-slate-200 text-slate-700 font-bold rounded-xl"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
