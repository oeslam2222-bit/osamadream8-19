import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Search,
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
  Columns3,
  ListFilter,
  RotateCcw,
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
  AlertCircle
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
  Cell,
  LabelList
} from 'recharts';
import { useApp } from '../context/AppContext';
import { Customer, CustomerVisit, User, Invoice, OrderStatus } from '../types';
import { formatCurrency } from '../services/invoiceService';
import {
  MONTH_NAMES_AR,
  filterCustomersByRBAC,
  fetchDetailedCustomersFromGoogleSheet,
  parseDetailedCustomersExcel,
  downloadCustomerAnalyticsTemplate
} from '../services/customerAnalyticsService';
import { isArabicNameMatch, isBranchMatch, normalizeArabicText } from '../services/arabicMatchingService';
import {
  ActivityFilter,
  CollectionRateFilter,
  DealtFilter,
  DebtFilter,
  EligibilityFilter,
  OrderFilter,
  VisitFilter,
  getCreditUsagePercent,
  getCustomerBalance,
  getCustomerCollectionRate,
  getCustomerOverdue,
  getCustomerStatusBadge,
  getCustomerDealtBadge,
  getEligibilityBadge,
  isDealtCustomer,
  matchesActivityFilter,
  matchesCollectionRateFilter,
  matchesDealtFilter,
  matchesDebtFilter,
  matchesEligibilityFilter,
  matchesOrderFilter,
  matchesVisitFilter,
} from '../services/customerFilterPredicates';
import { CustomerFilterBar, CustomerFilterBarState } from './customers/CustomerFilterBar';
import { CustomerQuickDrawer } from './customers/CustomerQuickDrawer';
import { CustomerTableSettings } from './customers/CustomerTableSettings';
import {
  CUSTOMER_COLUMNS,
  ColumnFilter,
  CustomerColumnKey,
  getColumnDef,
  getCustomerColumnText,
  getCustomerPaid,
  getCustomerSales2026,
  getDefaultVisibleColumns,
  loadColumnFilters,
  loadVisibleColumns,
  matchesColumnFilters,
  saveColumnFilters,
  saveVisibleColumns,
} from '../services/customerTableSchema';
import { getSavedSourceUrl, saveSingleSourceUrl, getSavedSheetHistory } from '../services/dataSourceService';

const truncateLabel = (value: string, max = 16): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

/** تيك الرسم العمودي: اسم العميل فوق الكود — بشكل مقروء ومظبوط في RTL */
const TopDebtAxisTick: React.FC<any> = ({ x, y, payload }) => {
  const item = payload?.payload || {};
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={13} textAnchor="middle" fontSize={9} fontWeight={800} fill="#33475e">
        {truncateLabel(item.name || '')}
      </text>
      <text x={0} y={25} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#93a4b8">
        {item.code || ''}
      </text>
    </g>
  );
};

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

  // State: Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('ALL');
  const [selectedRep, setSelectedRep] = useState<string>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('ALL');
  const [debtFilter, setDebtFilter] = useState<DebtFilter>('ALL');
  const [eligibilityFilter, setEligibilityFilter] = useState<EligibilityFilter>('ALL');
  const [debtStatusFilter, setDebtStatusFilter] = useState<string>('ALL');
  const [dealtFilter, setDealtFilter] = useState<DealtFilter>('ALL');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('ALL');
  const [visitFilter, setVisitFilter] = useState<VisitFilter>('ALL');

  const [collectionRateFilter, setCollectionRateFilter] = useState<CollectionRateFilter>('ALL');

  // Power BI Visuals Tab
  const [activeChartTab, setActiveChartTab] = useState<'monthly' | 'branches' | 'reps' | 'payment_guarantee'>('monthly');

  // Sorting
  const [sortBy, setSortBy] = useState<'name' | 'code' | 'balance' | 'overdue' | 'creditLimit' | 'sales2026' | 'collections2026' | 'lastVisit' | 'order'>('balance');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination for high-performance (4000+ items)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // BI Charts Toggle
  const [showCharts, setShowCharts] = useState(false);

  // Toggle for monthly table in modal (active months vs all 12 months)
  const [showAllMonthsInModal, setShowAllMonthsInModal] = useState(false);

  // Selected Customer for Detailed 360 Drawer/Modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [quickCustomer, setQuickCustomer] = useState<Customer | null>(null);

  // إعدادات الجدول: الأعمدة الظاهرة + الفلاتر المخصصة (بتتحفظ لكل مستخدم)
  const [visibleColumns, setVisibleColumns] = useState<CustomerColumnKey[]>(() =>
    loadVisibleColumns(currentUser?.id)
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>(() => loadColumnFilters(currentUser?.id));
  const [isTableSettingsOpen, setIsTableSettingsOpen] = useState(false);
  const [tableSettingsTab, setTableSettingsTab] = useState<'columns' | 'filters'>('columns');

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
    return Array.from(s);
  }, [userVisibleCustomers]);

  const availableSupervisors = useMemo(() => {
    const s = new Set<string>();
    userVisibleCustomers.forEach((c) => {
      if (c.supervisorName) s.add(c.supervisorName);
    });
    users.forEach((u) => {
      if (u.role === 'supervisor') s.add(u.name);
    });
    return Array.from(s);
  }, [userVisibleCustomers, users]);

  const availableReps = useMemo(() => {
    const s = new Set<string>();
    userVisibleCustomers.forEach((c) => {
      const r = c.salesRepName || c.repName;
      if (r) s.add(r);
    });
    return Array.from(s);
  }, [userVisibleCustomers]);

  const availableRegions = useMemo(() => {
    const s = new Set<string>();
    userVisibleCustomers.forEach((c) => {
      if (c.region) s.add(c.region);
    });
    return Array.from(s);
  }, [userVisibleCustomers]);

  const availableDebtStatuses = useMemo(() => {
    const s = new Set<string>();
    userVisibleCustomers.forEach((c) => {
      if (c.debtStatus) s.add(c.debtStatus);
    });
    return Array.from(s);
  }, [userVisibleCustomers]);

  // 2. Multi-Filter & Search Pipeline
  //    المرحلة (أ): الفلاتر التنظيمية + البحث النصي.
  //    بتتحسب مرة واحدة وبتتعاد استخدامها في عدّادات الشرائح السريعة،
  //    عشان رقم الشريحة يطابق عدد النتائج الفعلي بالظبط.
  const contextCustomers = useMemo(() => {
    let list = userVisibleCustomers;

    // Branch filter
    if (selectedBranch !== 'ALL') {
      list = list.filter((c) => isBranchMatch(c.branchName, selectedBranch));
    }

    if (selectedSupervisor !== 'ALL') {
      list = list.filter((c) => {
        if (isArabicNameMatch(c.supervisorName || '', selectedSupervisor)) return true;
        const supervisorUser = users.find((u) => u.role === 'supervisor' && isArabicNameMatch(u.name, selectedSupervisor));
        const repUser = users.find(
          (u) =>
            u.role === 'sales_rep' &&
            (isArabicNameMatch(u.name, c.salesRepName || '') || isArabicNameMatch(u.name, c.repName || ''))
        );
        return !!(supervisorUser && repUser?.supervisorId === supervisorUser.id);
      });
    }

    // Rep filter
    if (selectedRep !== 'ALL') {
      list = list.filter((c) => {
        const r = c.salesRepName || c.repName || '';
        return isArabicNameMatch(r, selectedRep);
      });
    }

    // Region filter
    if (selectedRegion !== 'ALL') {
      list = list.filter((c) => c.region === selectedRegion);
    }

    // Deal eligibility filter (قابل / غير قابل)
    if (eligibilityFilter !== 'ALL') {
      list = list.filter((c) => matchesEligibilityFilter(c, eligibilityFilter));
    }

    // Payment status / reason filter (حالة السداد)
    if (debtStatusFilter !== 'ALL') {
      list = list.filter((c) => (c.debtStatus || '') === debtStatusFilter);
    }

    // متعامل / غير متعامل
    if (dealtFilter !== 'ALL') {
      list = list.filter((c) => matchesDealtFilter(c, dealtFilter));
    }

    // الفلاتر المخصصة (أي عمود من أعمدة الشيت)
    if (columnFilters.length > 0) {
      list = list.filter((c) => matchesColumnFilters(c, columnFilters));
    }

    // Search query (normalized Arabic for resilient match)
    if (searchQuery.trim()) {
      const qNorm = normalizeArabicText(searchQuery);
      list = list.filter((c) => {
        const nameNorm = normalizeArabicText(c.name || '');
        const codeNorm = normalizeArabicText(c.code || '');
        const phone = (c.phone || '').replace(/[^0-9]/g, '');
        const regionNorm = normalizeArabicText(c.region || '');
        const repNorm = normalizeArabicText(c.salesRepName || c.repName || '');
        const guaranteeNorm = normalizeArabicText(c.guaranteeDocs || '');

        return (
          nameNorm.includes(qNorm) ||
          codeNorm.includes(qNorm) ||
          phone.includes(searchQuery.replace(/[^0-9]/g, '')) ||
          regionNorm.includes(qNorm) ||
          repNorm.includes(qNorm) ||
          guaranteeNorm.includes(qNorm)
        );
      });
    }

    return list;
  }, [
    userVisibleCustomers,
    selectedBranch,
    selectedSupervisor,
    selectedRep,
    selectedRegion,
    eligibilityFilter,
    debtStatusFilter,
    dealtFilter,
    columnFilters,
    searchQuery,
    users,
  ]);

  // المرحلة (ب): شرائح المديونية/النشاط/الطلبيات/التحصيل/الزيارات + الترتيب.
  const filteredCustomers = useMemo(() => {
    let list = contextCustomers;

    if (debtFilter !== 'ALL') {
      list = list.filter((c) => matchesDebtFilter(c, debtFilter));
    }

    if (activityFilter !== 'ALL') {
      list = list.filter((c) => matchesActivityFilter(c, activityFilter));
    }

    if (orderFilter !== 'ALL') {
      list = list.filter((c) => matchesOrderFilter(orderFilter, getCustomerOrderSummary(c)));
    }

    if (collectionRateFilter !== 'ALL') {
      list = list.filter((c) => matchesCollectionRateFilter(c, collectionRateFilter));
    }

    if (visitFilter !== 'ALL') {
      list = list.filter((c) => matchesVisitFilter(c, visitFilter));
    }

    // Sorting
    list = [...list].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortBy === 'sales2026') {
        const sumA = a.monthlySales2026 ? Object.values(a.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
        valA = Math.max(a.sales2026 || 0, a.totalMonthlySales || 0, a.totalOverallSales || 0, sumA);
        const sumB = b.monthlySales2026 ? Object.values(b.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
        valB = Math.max(b.sales2026 || 0, b.totalMonthlySales || 0, b.totalOverallSales || 0, sumB);
      } else if (sortBy === 'collections2026') {
        const sumA = a.monthlyCollections2026 ? Object.values(a.monthlyCollections2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
        valA = Math.max(a.collections2026 || 0, a.totalMonthlyCollections || 0, a.totalOverallCollections || 0, sumA);
        const sumB = b.monthlyCollections2026 ? Object.values(b.monthlyCollections2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
        valB = Math.max(b.collections2026 || 0, b.totalMonthlyCollections || 0, b.totalOverallCollections || 0, sumB);
      } else if (sortBy === 'balance') {
        valA = a.currentBalance ?? a.balance ?? 0;
        valB = b.currentBalance ?? b.balance ?? 0;
      } else if (sortBy === 'overdue') {
        valA = a.totalOverdueAndDue ?? a.overdueBalance ?? 0;
        valB = b.totalOverdueAndDue ?? b.overdueBalance ?? 0;
      } else if (sortBy === 'creditLimit') {
        valA = a.creditLimit || 0;
        valB = b.creditLimit || 0;
      } else if (sortBy === 'name') {
        return sortOrder === 'asc' ? (a.name || '').localeCompare(b.name || '', 'ar') : (b.name || '').localeCompare(a.name || '', 'ar');
      } else if (sortBy === 'code') {
        return sortOrder === 'asc' ? (a.code || '').localeCompare(b.code || '') : (b.code || '').localeCompare(a.code || '');
      } else if (sortBy === 'lastVisit') {
        valA = a.lastVisitDate ? new Date(a.lastVisitDate).getTime() : 0;
        valB = b.lastVisitDate ? new Date(b.lastVisitDate).getTime() : 0;
      } else if (sortBy === 'order') {
        valA = getCustomerOrderSummary(a).ordersCount;
        valB = getCustomerOrderSummary(b).ordersCount;
      }

      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }, [contextCustomers, debtFilter, activityFilter, orderFilter, collectionRateFilter, visitFilter, sortBy, sortOrder]);

  // اقتراحات البحث الذكي: أول 5 عملاء مطابقين للحرف/الكود المكتوب
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return [...contextCustomers]
      .sort((a, b) => getCustomerBalance(b) - getCustomerBalance(a))
      .slice(0, 5)
      .map((customer) => ({
        id: customer.id || customer.code,
        code: customer.code,
        name: customer.name,
        phone: customer.phone,
        region: customer.region || customer.branchName,
        balanceLabel: formatMoney(getCustomerBalance(customer)),
        status: getCustomerStatusBadge(customer),
        customer,
      }));
  }, [contextCustomers, searchQuery, isPrivacyMode]);

  const debtCustomersCount = useMemo(
    () => contextCustomers.filter((c) => getCustomerBalance(c) > 0).length,
    [contextCustomers]
  );

  const overdueCustomersCount = useMemo(
    () => filteredCustomers.filter((c) => getCustomerOverdue(c) > 0).length,
    [filteredCustomers]
  );

  // توزيع العملاء حسب تصنيف التعامل (قابل / غير قابل) — من عمود الشيت
  const eligibilityDistribution = useMemo(() => {
    let eligible = 0;
    let notEligible = 0;
    let unknown = 0;

    filteredCustomers.forEach((c) => {
      const raw = (c.dealEligibility || '').trim();
      if (!raw) unknown += 1;
      else if (raw.includes('غير') || raw.includes('موقوف')) notEligible += 1;
      else if (raw.includes('قابل')) eligible += 1;
      else unknown += 1;
    });

    return [
      { name: 'قابل للتعامل', value: eligible, color: '#1F9D74' },
      { name: 'غير قابل', value: notEligible, color: '#E05B5B' },
      { name: 'غير محدد', value: unknown, color: '#8FA0B8' },
    ];
  }, [filteredCustomers]);

  // أعلى 5 عملاء في المديونية الحالية (اسم + كود + مبلغ)
  const topDebtCustomers = useMemo(
    () =>
      [...filteredCustomers]
        .filter((c) => getCustomerBalance(c) > 0)
        .sort((a, b) => getCustomerBalance(b) - getCustomerBalance(a))
        .slice(0, 5)
        .map((c) => ({
          code: c.code || '---',
          name: c.name,
          debt: getCustomerBalance(c),
          customer: c,
        })),
    [filteredCustomers]
  );

  const distributionTotal = eligibilityDistribution.reduce((sum, item) => sum + item.value, 0);

  // اختصار الأرقام الكبيرة فوق أعمدة الرسم (1.82 مليون / 840 ألف)
  const formatCompactAmount = (value: number): string => {
    if (isPrivacyMode) return '•••';
    const abs = Math.abs(value);
    if (abs >= 1000000) return `${(value / 1000000).toFixed(2)} مليون`;
    if (abs >= 1000) return `${Math.round(value / 1000)} ألف`;
    return String(Math.round(value));
  };

  // Reset pagination on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBranch, selectedRep, selectedRegion, selectedSupervisor, activityFilter, debtFilter, eligibilityFilter, debtStatusFilter, orderFilter, visitFilter, collectionRateFilter, dealtFilter, searchQuery, pageSize]);

  const handleFilterChange = (patch: Partial<CustomerFilterBarState>) => {
    if (patch.searchQuery !== undefined) setSearchQuery(patch.searchQuery);
    if (patch.selectedBranch !== undefined) setSelectedBranch(patch.selectedBranch);
    if (patch.selectedSupervisor !== undefined) setSelectedSupervisor(patch.selectedSupervisor);
    if (patch.selectedRep !== undefined) setSelectedRep(patch.selectedRep);
    if (patch.selectedRegion !== undefined) setSelectedRegion(patch.selectedRegion);
    if (patch.eligibilityFilter !== undefined) setEligibilityFilter(patch.eligibilityFilter);
    if (patch.debtStatusFilter !== undefined) setDebtStatusFilter(patch.debtStatusFilter);
    if (patch.dealtFilter !== undefined) setDealtFilter(patch.dealtFilter);
    if (patch.debtFilter !== undefined) setDebtFilter(patch.debtFilter);
    if (patch.activityFilter !== undefined) setActivityFilter(patch.activityFilter);
    if (patch.orderFilter !== undefined) setOrderFilter(patch.orderFilter);
    if (patch.visitFilter !== undefined) setVisitFilter(patch.visitFilter);
    if (patch.collectionRateFilter !== undefined) setCollectionRateFilter(patch.collectionRateFilter);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedBranch('ALL');
    setSelectedRep('ALL');
    setSelectedRegion('ALL');
    setSelectedSupervisor('ALL');
    setEligibilityFilter('ALL');
    setDebtStatusFilter('ALL');
    setDealtFilter('ALL');
    setDebtFilter('ALL');
    setActivityFilter('ALL');
    setOrderFilter('ALL');
    setVisitFilter('ALL');
    setCollectionRateFilter('ALL');
  };

  const handleSortChange = (value: string) => {
    const [field, order] = value.split(':');
    setSortBy(field as typeof sortBy);
    setSortOrder(order === 'asc' ? 'asc' : 'desc');
  };

  const filterBarValue: CustomerFilterBarState = {
    searchQuery,
    selectedBranch,
    selectedSupervisor,
    selectedRep,
    selectedRegion,
    eligibilityFilter,
    debtStatusFilter,
    dealtFilter,
    debtFilter,
    activityFilter,
    orderFilter,
    visitFilter,
    collectionRateFilter,
  };

  // حفظ تلقائي في إعدادات المستخدم
  useEffect(() => {
    saveVisibleColumns(visibleColumns, currentUser?.id);
  }, [visibleColumns, currentUser?.id]);

  useEffect(() => {
    saveColumnFilters(columnFilters, currentUser?.id);
  }, [columnFilters, currentUser?.id]);

  // القيم المتاحة لكل عمود — مستخرجة من بيانات الشيت المحمّلة نفسها
  const columnFilterOptions = useMemo(() => {
    const result: Partial<Record<CustomerColumnKey, string[]>> = {};
    CUSTOMER_COLUMNS.forEach((column) => {
      if (column.type === 'currency' || column.type === 'number') return;
      const seen = new Set<string>();
      userVisibleCustomers.forEach((c) => {
        if (seen.size >= 60) return;
        const text = getCustomerColumnText(c, column.key).trim();
        if (text && text.length <= 45) seen.add(text);
      });
      result[column.key] = Array.from(seen).sort((a, b) => a.localeCompare(b, 'ar'));
    });
    return result;
  }, [userVisibleCustomers]);

  const visibleColumnDefs = useMemo(
    () => CUSTOMER_COLUMNS.filter((column) => column.locked || visibleColumns.includes(column.key)),
    [visibleColumns]
  );

  const openTableSettings = (tab: 'columns' | 'filters') => {
    setTableSettingsTab(tab);
    setIsTableSettingsOpen(true);
  };

  const handleToggleColumn = (key: CustomerColumnKey) => {
    setVisibleColumns((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  const handleAddColumnFilter = (filter: Omit<ColumnFilter, 'id'>) => {
    setColumnFilters((prev) => [
      ...prev,
      {
        ...filter,
        id: `${filter.column}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      },
    ]);
  };

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
    let totalCollections2025 = 0;
    let totalCollections2026 = 0;
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

    // Monthly totals for 2026
    const monthlySalesTotals: Record<number, number> = {};
    const monthlyCollectionTotals: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      monthlySalesTotals[m] = 0;
      monthlyCollectionTotals[m] = 0;
    }

    filteredCustomers.forEach((c) => {
      const s25 = c.sales2025 || 0;
      const monthlySalesSum = c.monthlySales2026 ? Object.values(c.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
      const s26 = Math.max(c.sales2026 || 0, c.totalMonthlySales || 0, c.totalOverallSales || 0, monthlySalesSum);
      const c25 = Math.abs(Number(c.collections2025) || 0);
      const monthlyColsSum = c.monthlyCollections2026 ? Object.values(c.monthlyCollections2026).reduce((acc, v) => acc + Math.abs(Number(v) || 0), 0) : 0;
      const c26 = Math.max(Math.abs(Number(c.collections2026) || 0), Math.abs(Number(c.totalMonthlyCollections) || 0), Math.abs(Number(c.totalOverallCollections) || 0), monthlyColsSum);
      const bal = c.currentBalance ?? c.balance ?? 0;
      const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
      const cLimit = c.creditLimit || 0;
      const g = (c.guaranteeDocs || '').toLowerCase();

      totalSales2025 += s25;
      totalSales2026 += s26;
      totalCollections2025 += c25;
      totalCollections2026 += c26;
      totalDebt += bal;
      totalOverdue += overdue;
      totalCreditLimit += cLimit;
      if (cLimit > 0 && bal > cLimit) overLimitCount++;
      if ((g && !g.includes('بدون')) || cLimit > 0) guaranteedCount++;

      totalVisits2026 += c.visitCount2026 || (c.lastVisitDate ? 1 : 0);

      const orderSummary = getCustomerOrderSummary(c);
      if (orderSummary.hasOrder) {
        customersWithOrdersCount++;
        totalOrdersValue += orderSummary.totalOrdersValue;
      }

      if (c.hasDealtIn2026 || s26 > 0) {
        active2026Count++;
      } else if (s25 > 0) {
        churnRiskCount++;
      }

      if (c.monthlySales2026) {
        for (let m = 1; m <= 12; m++) {
          monthlySalesTotals[m] += c.monthlySales2026[m] || 0;
        }
      }
      if (c.monthlyCollections2026) {
        for (let m = 1; m <= 12; m++) {
          monthlyCollectionTotals[m] += c.monthlyCollections2026[m] || 0;
        }
      }
    });

    const salesGrowth = totalSales2025 > 0 ? Math.round(((totalSales2026 - totalSales2025) / totalSales2025) * 100) : (totalSales2026 > 0 ? 100 : 0);
    const collectionRate = totalSales2026 > 0 ? Math.round((totalCollections2026 / totalSales2026) * 100) : 0;
    const activeRate = filteredCustomers.length > 0 ? Math.round((active2026Count / filteredCustomers.length) * 100) : 0;

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
      salesGrowth,
      totalCollections2025,
      totalCollections2026,
      collectionRate,
      totalDebt,
      totalOverdue,
      totalCreditLimit,
      overLimitCount,
      customersWithOrdersCount,
      totalOrdersValue,
      guaranteedCount,
      totalVisits2026,
      monthlyChartData,
    };
  }, [filteredCustomers]);

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

  // Handle Log Visit Action
  const handleSaveVisit = () => {
    if (!selectedCustomer) return;

    const newVisit: CustomerVisit = {
      id: `visit-${Date.now()}`,
      date: visitDate,
      repName: currentUser?.name || 'المندوب',
      type: visitType,
      outcome: visitOutcome,
      collectedAmount: visitCollected ? parseFloat(visitCollected) : undefined,
      notes: visitNotes,
      createdAt: new Date().toISOString(),
    };

    const existingVisits = selectedCustomer.visitHistory || [];
    const updatedVisits = [newVisit, ...existingVisits];

    const updatedCustomer: Customer = {
      ...selectedCustomer,
      lastVisitDate: visitDate,
      visitCount2026: (selectedCustomer.visitCount2026 || 0) + 1,
      visitHistory: updatedVisits,
      currentBalance: visitCollected
        ? Math.max(0, (selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0) - parseFloat(visitCollected))
        : selectedCustomer.currentBalance,
    };

    updateCustomer(updatedCustomer);
    setSelectedCustomer(updatedCustomer);
    setIsLoggingVisit(false);
    setVisitNotes('');
    setVisitCollected('');
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
        importCustomersList(result.customers, 'merge');
        const dupesMsg = (result as any).duplicatesCount
          ? ` (تم دمج وتوحيد ${(result as any).duplicatesCount} سجل مكرر من إجمالي ${(result as any).totalRows || result.customers.length} سطر)`
          : '';
        setSyncStatus({
          type: 'success',
          message: `تم بنجاح استيراد ومزامنة ${result.customers.length} عميل بالبيانات والمبيعات الكاملة وحفظ الرابط دائماً في المنظومة${dupesMsg}!`,
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
        importCustomersList(result.customers, 'merge');
        const dupesMsg = (result as any).duplicatesCount
          ? ` (تم دمج وتوحيد ${(result as any).duplicatesCount} سجل مكرر من إجمالي ${(result as any).totalRows || result.customers.length} سطر)`
          : '';
        setSyncStatus({
          type: 'success',
          message: `تم قراءة واستيراد وتوحيد ${result.customers.length} عميل بنجاح مع المبيعات والتحصيلات${dupesMsg}!`,
        });
      }
    } catch (err: any) {
      setSyncStatus({ type: 'error', message: err?.message || 'حدث خطأ أثناء قراءة ملف الإكسل' });
    } finally {
      setIsSyncing(false);
      e.target.value = '';
    }
  };

  const columnAlignClass = (align: 'start' | 'center' | 'end') =>
    align === 'end' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right';

  /** خلية العمود — كل عرض في مكان واحد، والجدول بيتبني حسب الأعمدة المختارة. */
  const renderCustomerCell = (key: CustomerColumnKey, c: Customer) => {
    const bal = getCustomerBalance(c);
    const overdue = getCustomerOverdue(c);
    const limit = c.creditLimit || 0;
    const usage = getCreditUsagePercent(c);
    const statusBadge = getCustomerStatusBadge(c);
    const lastTouch = c.lastVisitDate || c.lastOrderDate || c.lastCollectionDate;
    const lastTouchInfo = getRelativeTimeArabic(lastTouch);

    switch (key) {
      case 'code':
        return <span className="font-mono font-black text-slate-700">{c.code || '---'}</span>;

      case 'name':
        return (
          <div className="min-w-[175px]">
            <div className="font-black text-slate-900 group-hover:text-[var(--app-accent)] transition">
              {c.name}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
              {c.phone ? (
                <span dir="ltr" className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {c.phone}
                </span>
              ) : (
                <span>بدون هاتف</span>
              )}
            </div>
          </div>
        );

      case 'region':
        return (
          <>
            <div className="font-bold text-slate-700">{c.region || c.district || c.branchName || '—'}</div>
            <div className="text-[11px] text-slate-500">
              {c.branchName && c.branchName !== c.region
                ? c.branchName
                : c.salesRepName || c.repName || '—'}
            </div>
          </>
        );

      case 'rep':
        return <span className="font-bold text-slate-700">{c.salesRepName || c.repName || 'غير محدد'}</span>;

      case 'branch':
        return <span className="text-slate-700">{c.branchName || '—'}</span>;

      case 'phone':
        return c.phone ? (
          <a
            href={`tel:${c.phone}`}
            onClick={(event) => event.stopPropagation()}
            dir="ltr"
            className="font-mono font-bold text-slate-600 hover:text-[var(--app-accent)]"
          >
            {c.phone}
          </a>
        ) : (
          <span className="text-slate-400">—</span>
        );

      case 'debt':
        return (
          <div className="min-w-[170px]">
            <div className={`font-black ${bal > 0 ? 'text-[var(--app-navy)]' : 'text-slate-400'}`}>
              {formatMoney(bal)}
            </div>
            <div className="cdebt-bar" aria-hidden="true">
              <span
                className={usage > 100 ? 'is-over' : usage >= 80 ? 'is-high' : 'is-ok'}
                style={{ width: `${Math.min(100, Math.max(limit > 0 ? 3 : 0, usage))}%` }}
              />
            </div>
            <div className="cdebt-foot">
              <span>{limit > 0 ? `الحد: ${formatMoney(limit)}` : 'بدون حد ائتماني'}</span>
              {limit > 0 && <span className={usage > 100 ? 't-risk' : 't-muted'}>{usage}%</span>}
            </div>
          </div>
        );

      case 'creditLimit':
        return <span className="app-num text-slate-600">{limit > 0 ? formatMoney(limit) : 'بدون حد'}</span>;

      case 'paid':
        return <span className="app-num font-black t-ok">{formatMoney(getCustomerPaid(c))}</span>;

      case 'overdue':
        return (
          <>
            <div className={`font-black ${overdue > 0 ? 't-risk' : 'text-slate-400'}`}>
              {formatMoney(overdue)}
            </div>
            {overdue > 0 && <span className="text-[9px] font-extrabold t-risk">واجب التحصيل</span>}
          </>
        );

      case 'collectionRate': {
        const rate = Math.round(getCustomerCollectionRate(c));
        return (
          <div className="min-w-[80px]">
            <div className="app-num font-black text-slate-700">{rate}%</div>
            <div className="cdebt-bar" aria-hidden="true">
              <span
                className={rate >= 80 ? 'is-ok' : rate >= 30 ? 'is-high' : 'is-over'}
                style={{ width: `${Math.min(100, Math.max(3, rate))}%` }}
              />
            </div>
          </div>
        );
      }

      case 'status':
        return <span className={`pill pill-${statusBadge.tone}`}>{statusBadge.label}</span>;

      case 'dealt': {
        const dealtBadge = getCustomerDealtBadge(c);
        return (
          <div className="flex flex-col items-center gap-0.5">
            <span className={`pill pill-${dealtBadge.tone}`}>{dealtBadge.label}</span>
            {dealtBadge.raw && dealtBadge.raw !== dealtBadge.label && (
              <span className="text-[9px] font-bold text-slate-400">{dealtBadge.raw}</span>
            )}
          </div>
        );
      }

      case 'eligibility': {
        const badge = getEligibilityBadge(c);
        return <span className={`pill pill-${badge.tone}`}>{badge.label}</span>;
      }

      case 'paymentTerms':
        return <span className="text-slate-600">{c.paymentTerms || 'غير محدد'}</span>;

      case 'activityType':
        return <span className="text-slate-600">{c.activityType || 'غير محدد'}</span>;

      case 'guarantee':
        return <span className="text-slate-600">{c.guaranteeDocs || 'لا يوجد'}</span>;

      case 'sales2026':
        return <span className="app-num font-black text-[var(--app-navy)]">{formatMoney(getCustomerSales2026(c))}</span>;

      case 'collections2026':
        return <span className="app-num font-black t-ok">{formatMoney(Math.abs(Number(c.collections2026) || 0))}</span>;

      case 'lastTouch':
        return lastTouch ? (
          <>
            <div className="font-bold text-slate-600 text-[11px]">
              {new Date(lastTouch).toLocaleDateString('ar-EG')}
            </div>
            <div className="text-[10px] t-muted">{lastTouchInfo.text}</div>
          </>
        ) : (
          <span className="text-slate-400 text-[11px]">لا يوجد</span>
        );

      case 'visits':
        return <span className="app-num font-black text-slate-700">{c.visitCount2026 || 0}</span>;

      case 'orders':
        return <span className="app-num font-black text-slate-700">{c.totalOrdersCount || 0}</span>;

      default:
        return <span className="text-slate-400">—</span>;
    }
  };

  return (
    <div className="tantawy-screen space-y-4 animate-in fade-in pb-12">
      {/* Top Header Card */}
      <div className="cust-hero rounded-[14px] p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="cust-hero-icon w-10 h-10 rounded-[14px] flex items-center justify-center font-black">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black t-navy flex items-center gap-2">
                <span>العملاء</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full tint-navy app-num border border-[var(--app-line)]">
                  {filteredCustomers.length.toLocaleString()}
                </span>
              </h1>
              <p className="text-xs t-muted mt-0.5">
                {isRep ? 'عملاؤك' : isSupervisor ? 'عملاء الفريق' : 'قائمة العملاء'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {!isRep && !isSupervisor && (
          <button
            id="analytics-privacy-mode-btn"
            type="button"
            onClick={togglePrivacyMode}
            className={`app-btn min-h-[40px] px-3 py-2 text-xs whitespace-nowrap ${
              isPrivacyMode ? 'app-btn-warn-soft' : 'app-btn-ghost'
            }`}
            title={isPrivacyMode ? 'وضع سرية البيانات نشط (المبيعات والأرصدة مخفية). اضغط للإظهار.' : 'تفعيل وضع سرية البيانات لإخفاء الأرقام المالية الحساسة أثناء العرض'}
          >
            {isPrivacyMode ? (
              <>
                <EyeOff className="w-4 h-4 t-warn animate-pulse" />
                <span className="font-extrabold t-warn">سرية البيانات: نشطة</span>
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 text-slate-500" />
                <span>سرية البيانات</span>
              </>
            )}
          </button>
          )}

          {/* تخصيص الأعمدة والفلاتر المخصصة */}
          <button
            type="button"
            onClick={() => openTableSettings('columns')}
            className="app-btn app-btn-ghost px-3 py-2 text-xs whitespace-nowrap"
            title="إظهار/إخفاء أعمدة الجدول — بيتحفظ في إعداداتك"
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>الأعمدة</span>
            <span className="app-num text-[10px] bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5">
              {visibleColumnDefs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => openTableSettings('filters')}
            className="app-btn app-btn-ghost px-3 py-2 text-xs whitespace-nowrap"
            title="إضافة فلتر على أي عمود من بيانات الشيت"
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>فلتر مخصص</span>
            {columnFilters.length > 0 && <span className="cf-badge">{columnFilters.length}</span>}
          </button>

          {/* Clean & Deduplicate Button (Prevents 3000 to 6000 duplicate explosion) */}
          {isAdminOrDev && (
            <button
              id="analytics-deduplicate-btn"
              type="button"
              onClick={handleRunDeduplication}
              className="app-btn app-btn-ghost px-3 py-2 text-xs shadow-xs whitespace-nowrap"
              title="فحص قاعدة البيانات ومنع أي تكرار ناتج عن تحديث الشيتات اليومية لضمان ثبات عدد العملاء (3000 عميل فريد)"
            >
              <Sparkles className="w-3.5 h-3.5 app-ink-brass" />
              <span>منع وتنقية التكرار (3,000 عميل)</span>
            </button>
          )}

          {!isRep && !isSupervisor && (
          <button
            id="analytics-toggle-charts-btn"
            type="button"
            onClick={() => setShowCharts(!showCharts)}
            className={`app-btn min-h-[40px] px-3 py-2 text-xs whitespace-nowrap ${
              showCharts ? 'app-btn-primary' : 'app-btn-ghost'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>{showCharts ? 'إخفاء التحليل التفصيلي' : 'تحليل تفصيلي'}</span>
          </button>
          )}

          {/* مزامنة شيت العملاء والمديونية (Admin / Dev / Branch Manager) */}
          {isAdminOrDev && (
            <button
              id="analytics-sync-sheet-btn"
              type="button"
              onClick={() => setIsSyncModalOpen(true)}
              className="app-btn app-btn-primary px-3.5 py-2 text-xs whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>مزامنة شيت المديونية / إكسل</span>
            </button>
          )}

        </div>
      </div>

      {/* Deduplication Notice Notification Banner */}
      {dedupeNotice && (
        <div className="panel-ok rounded-[14px] p-3 sm:p-4 flex items-center justify-between gap-3 text-xs font-bold shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[10px] tint-ok flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="font-black">{dedupeNotice}</p>
              <p className="text-[11px] font-medium mt-0.5 opacity-80">
                النظام يقوم تلقائياً بمطابقة وتحديث البيانات اليومية دون إنشاء عملاء مكررين.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDedupeNotice(null)}
            className="p-1 rounded-lg hover:bg-[rgba(46,125,91,.12)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards — ألوان متناسقة مع هوية التطبيق */}
      {!isRep && !isSupervisor && (
        <div className="ckpi-grid">
          <article className="ckpi ckpi-navy">
            <span className="ckpi-icon"><Users className="w-5 h-5" /></span>
            <div className="ckpi-text">
              <span className="ckpi-label">عدد العملاء</span>
              <strong className="ckpi-value app-num">{kpiStats.totalCount.toLocaleString()}</strong>
              <span className="ckpi-hint">
                {kpiStats.active2026Count.toLocaleString()} متعامل نشط ({kpiStats.activeRate}%)
              </span>
            </div>
          </article>

          <article className="ckpi ckpi-violet">
            <span className="ckpi-icon"><DollarSign className="w-5 h-5" /></span>
            <div className="ckpi-text">
              <span className="ckpi-label">إجمالي المسدد</span>
              <strong className="ckpi-value app-num">{formatMoney(kpiStats.totalCollections2026)}</strong>
              <span className="ckpi-hint">تحصيلات 2026 من إجمالي المديونية</span>
            </div>
          </article>

          <article className="ckpi ckpi-blue">
            <span className="ckpi-icon"><Receipt className="w-5 h-5" /></span>
            <div className="ckpi-text">
              <span className="ckpi-label">المتبقي للتحصيل</span>
              <strong className="ckpi-value app-num">{formatMoney(kpiStats.totalOverdue)}</strong>
              <span className="ckpi-hint">متأخرات ومستحقات واجبة السداد</span>
            </div>
          </article>

          <article className="ckpi ckpi-green">
            <span className="ckpi-icon"><CreditCard className="w-5 h-5" /></span>
            <div className="ckpi-text">
              <span className="ckpi-label">إجمالي المديونية</span>
              <strong className="ckpi-value app-num">{formatMoney(kpiStats.totalDebt)}</strong>
              <span className="ckpi-hint">
                {kpiStats.overLimitCount.toLocaleString()} عميل متجاوز الحد الائتماني
              </span>
            </div>
          </article>

          <article className="ckpi ckpi-rose">
            <span className="ckpi-icon"><AlertTriangle className="w-5 h-5" /></span>
            <div className="ckpi-text">
              <span className="ckpi-label">العملاء المتأخرون</span>
              <strong className="ckpi-value app-num">{overdueCustomersCount.toLocaleString()}</strong>
              <span className="ckpi-hint">
                {kpiStats.totalCount > 0
                  ? `${Math.round((overdueCustomersCount / kpiStats.totalCount) * 100)}% من العملاء الحاليين`
                  : 'لا توجد بيانات'}
              </span>
            </div>
          </article>
        </div>
      )}

      {/* الرسوم: توزيع تصنيف التعامل (قابل / غير قابل) + أعلى 5 عملاء مديونية */}
      {!isRep && !isSupervisor && (
        <div className="cchart-row">
          <section className="cchart-card">
            <header className="cchart-head">
              <h3>توزيع العملاء حسب تصنيف التعامل (قابل / غير قابل)</h3>
              <span className="cchart-chip">{distributionTotal.toLocaleString()} عميل</span>
            </header>
            <div className="cchart-body">
              <div className="cchart-donut">
                <ResponsiveContainer width="100%" height={240}>
                  <RechartsPieChart>
                    <Pie
                      data={eligibilityDistribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={90}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {eligibilityDistribution.map((entry) => (
                        <Cell key={`status-${entry.name}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => `${Number(val).toLocaleString()} عميل`}
                      contentStyle={{ backgroundColor: '#0F2B38', color: '#fff', borderRadius: '12px', border: 'none' }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
                <div className="cchart-donut-center">
                  <strong className="app-num">{distributionTotal.toLocaleString()}</strong>
                  <span>عميل</span>
                </div>
              </div>

              <ul className="cchart-legend">
                {eligibilityDistribution.map((item) => {
                  const pct = distributionTotal > 0 ? (item.value / distributionTotal) * 100 : 0;
                  return (
                    <li key={`legend-${item.name}`}>
                      <span className="cchart-dot" style={{ backgroundColor: item.color }} />
                      <span className="cchart-legend-name">{item.name}</span>
                      <span className="cchart-legend-pct app-num">{pct.toFixed(1)}%</span>
                      <span className="cchart-legend-val app-num">{item.value.toLocaleString()}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <section className="cchart-card">
            <header className="cchart-head">
              <h3>أعلى 5 عملاء في المديونية الحالية</h3>
              <span className="cchart-chip">بالجنيه المصري</span>
            </header>
            {topDebtCustomers.length > 0 ? (
              <div className="cchart-bars">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topDebtCustomers} margin={{ top: 12, right: 6, left: 6, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eef5" />
                    <XAxis
                      dataKey="code"
                      tick={<TopDebtAxisTick />}
                      height={34}
                      interval={0}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      width={56}
                      tick={{ fontSize: 9, fontWeight: 700, fill: '#93a4b8' }}
                      tickFormatter={(value: any) => formatCompactAmount(Number(value))}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(val: any) => [formatMoney(Number(val)), 'المديونية']}
                      labelFormatter={(_label: any, payload: any) => {
                        if (!payload || !payload[0]) return '';
                        const item = payload[0].payload;
                        return `${item.name} — ${item.code}`;
                      }}
                      contentStyle={{ backgroundColor: '#0F2B38', color: '#fff', borderRadius: '12px', border: 'none' }}
                    />
                    <Bar
                      dataKey="debt"
                      fill="#2F6FD0"
                      radius={[8, 8, 0, 0]}
                      barSize={46}
                      cursor="pointer"
                      onClick={(data: any) => {
                        if (data && data.payload && data.payload.customer) {
                          setQuickCustomer(data.payload.customer);
                        }
                      }}
                    >
                      <LabelList
                        dataKey="debt"
                        position="top"
                        formatter={(val: any) => formatCompactAmount(Number(val))}
                        style={{ fontSize: 9, fontWeight: 900, fill: '#1b3652' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="cchart-empty">لا توجد مديونيات مطابقة للفلاتر الحالية</div>
            )}
          </section>
        </div>
      )}

      {/* Power BI Multi-Visual Interactive Dashboard */}
      {showCharts && !isRep && !isSupervisor && (
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
                المسار الشهري
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('branches')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap ${
                  activeChartTab === 'branches'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                مقارنة الفروع الـ 7
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('reps')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap ${
                  activeChartTab === 'reps'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                أعلى المناديب
              </button>
              <button
                type="button"
                onClick={() => setActiveChartTab('payment_guarantee')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap ${
                  activeChartTab === 'payment_guarantee'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                طرق الدفع والضمانات
              </button>
            </div>
          </div>

          {/* Tab 1: Monthly Sales & Collections */}
          {activeChartTab === 'monthly' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-bold">مقارنة حركة المبيعات والتحصيلات على مدار 12 شهراً لعام 2026:</span>
                {isPrivacyMode && <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md">وضع السرية مفعل</span>}
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

          {/* Tab 2: Branch Comparison */}
          {activeChartTab === 'branches' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-bold">ترتيب وأداء الفروع حسب المبيعات والتحصيلات في 2026:</span>
                <span className="font-bold text-slate-700">{branchAnalyticsData.length} فروع مفحوصة</span>
              </div>
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={branchAnalyticsData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
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
                  <BarChart data={topRepsAnalyticsData} layout="vertical" margin={{ top: 10, right: 20, left: 30, bottom: 10 }}>
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

          {/* Tab 4: Payment Terms & Guarantees Breakdown */}
          {activeChartTab === 'payment_guarantee' && (
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
        </div>
      )}

      {/* شريط فلترة العملاء: بحث ذكي + ترتيب المديونية + فلاتر مخصصة من أعمدة الشيت */}
      <CustomerFilterBar
        value={filterBarValue}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
        options={{
          branches: availableBranches,
          supervisors: availableSupervisors,
          reps: availableReps,
          regions: availableRegions,
          debtStatuses: availableDebtStatuses,
        }}
        canFilterBranch={isAdminOrDev}
        canFilterRep={!isRep}
        canFilterSupervisor={!isRep}
        onOpenCustomFilters={() => openTableSettings('filters')}
        customFilterCount={columnFilters.length}
        debtCustomersCount={debtCustomersCount}
        suggestions={searchSuggestions}
        onSelectSuggestion={(customer) => setQuickCustomer(customer)}
        sortValue={`${sortBy}:${sortOrder}`}
        onSortChange={handleSortChange}
        resultCount={filteredCustomers.length}
        scopedCount={userVisibleCustomers.length}
      />

      {/* Main Customers Table Card (Fast, Virtual-friendly, Paginated) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* الفلاتر المخصصة النشطة */}
        {columnFilters.length > 0 && (
          <div className="px-3 py-2 bg-[#fdf8ee] border-b border-[#f0e4cc] flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="font-black text-[#8a6420] flex items-center gap-1">
              <ListFilter className="w-3.5 h-3.5" />
              فلاتر مخصصة ({columnFilters.length}):
            </span>
            {columnFilters.map((filter) => {
              const def = getColumnDef(filter.column);
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setColumnFilters((prev) => prev.filter((item) => item.id !== filter.id))}
                  className="inline-flex items-center gap-1 rounded-full border border-[#e6d7b8] bg-white px-2 py-1 font-bold text-[#8a6420] hover:bg-[#f7efdd]"
                  title="إزالة هذا الفلتر"
                >
                  <span>{def?.label || filter.column}</span>
                  {filter.value ? <span className="text-[#b08b3f]">: {filter.value}</span> : null}
                  {filter.value2 ? <span className="text-[#b08b3f]">— {filter.value2}</span> : null}
                  <X className="w-3 h-3" />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setColumnFilters([])}
              className="font-black text-rose-700 hover:underline"
            >
              مسح الكل
            </button>
          </div>
        )}

        {/* Table Controls Top */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2 font-bold flex-wrap">
            <span className="text-[11px]">الصفحة {currentPage} من {totalPages}</span>
            <span className="text-slate-300">|</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f7f5] text-[#046b62] border border-[#c4ebe6] px-2 py-0.5 text-[11px] font-black">
              <Users className="w-3 h-3" />
              {filteredCustomers.length.toLocaleString()} عميل مطابق
            </span>
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-1.5 font-bold">
            <span>عدد الصفوف:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {paginatedCustomers.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#c4ebe6] bg-gradient-to-br from-[#f4fbfd] to-[#e6f7f5] text-[var(--app-ok)]">
              <Users className="h-7 w-7" />
            </div>
            <div className="text-sm font-black text-slate-800">لا يوجد عملاء مطابقين للفلاتر الحالية</div>
            <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-relaxed text-slate-500">
              {customers.length === 0
                ? 'قاعدة البيانات خالية حالياً. يمكن للمسؤول استيراد بيانات العملاء عبر إكسل أو شيت المديونية.'
                : 'جرّب تعديل الفلاتر أو مسح البحث لرؤية النتائج.'}
            </p>
            {customers.length > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="app-btn app-btn-primary mx-auto mt-4 px-4 py-2 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>مسح كل الفلاتر</span>
              </button>
            )}
          </div>
        ) : (
          <>
          <div className="md:hidden p-3 flex flex-col gap-3">
            {paginatedCustomers.map((c, index) => {
              const bal = c.currentBalance ?? c.balance ?? 0;
              const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
              const limit = c.creditLimit || 0;
              const isOverLimit = limit > 0 && bal > limit;
              const monthlySalesSum = c.monthlySales2026 ? Object.values(c.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
              const s26 = Math.max(c.sales2026 || 0, c.totalMonthlySales || 0, c.totalOverallSales || 0, monthlySalesSum);
              const monthlyColsSum = c.monthlyCollections2026 ? Object.values(c.monthlyCollections2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
              const col26 = Math.max(c.collections2026 || 0, c.totalMonthlyCollections || 0, c.totalOverallCollections || 0, monthlyColsSum);
              const colRate = s26 > 0 ? Math.round((col26 / s26) * 100) : 0;
              const guaranteeInfo = getGuaranteeBadge(c.guaranteeDocs, c.guaranteeAmount, limit);
              
              // Avatar initial & background color
              const firstLetter = (c.name || 'ع').trim().charAt(0);
              const avatarColors = [
                'bg-teal-600 text-white',
                'bg-blue-600 text-white',
                'bg-amber-500 text-white',
                'bg-indigo-600 text-white',
                'bg-slate-700 text-white'
              ];
              const avatarBg = avatarColors[(c.code ? c.code.charCodeAt(c.code.length - 1) : index) % avatarColors.length];

              // Customer Status logic
              const isLegal = c.isLegalPending || (c.legalStatus && c.legalStatus !== 'none');
              const statusBadge = getCustomerStatusBadge(c);
              const dealtBadge = getCustomerDealtBadge(c);
              const creditUsage = getCreditUsagePercent(c);
              const paidAmount = Math.max(
                Math.abs(Number(c.collections2026) || 0),
                Math.abs(Number(c.totalMonthlyCollections) || 0),
                Math.abs(Number(c.totalOverallCollections) || 0)
              );

              return (
                <div
                  key={c.id || c.code}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3.5 space-y-3 hover:border-teal-500/50 transition"
                >
                  {/* Card Header: Avatar + Info + Status */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-xs ${avatarBg}`}>
                        {firstLetter}
                      </div>
                      <div className="min-w-0">
                        <div
                          onClick={() => setQuickCustomer(c)}
                          className="font-black text-slate-900 text-sm truncate cursor-pointer hover:text-teal-700 transition"
                        >
                          {c.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-0.5 flex-wrap">
                          <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold">{c.code || '---'}</span>
                          <span>·</span>
                          <span>{c.branchName || c.region || 'بدون فرع'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {isLegal ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                          <ShieldAlert className="w-3 h-3 text-rose-600" />
                          <span>شؤون قانونية</span>
                        </span>
                      ) : null}
                      <span className={`pill pill-${statusBadge.tone}`}>{statusBadge.label}</span>
                      <span className={`pill pill-${dealtBadge.tone}`}>{dealtBadge.label}</span>
                      <span className="text-[10px] font-mono text-slate-400">#{(currentPage - 1) * pageSize + index + 1}</span>
                    </div>
                  </div>

                  {/* 3-Column Financial Metrics Bar */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <div className="rounded-xl bg-[#eef3f8]/80 border border-[#dbe5f0] p-2 text-right">
                      <div className="text-[9px] text-[#1b3652] font-bold">المديونية</div>
                      <div className="font-black text-[var(--app-navy)] text-xs sm:text-sm mt-0.5 truncate" title={isPrivacyMode ? 'مخفي' : formatMoney(bal)}>
                        {formatMoney(bal)}
                      </div>
                      <div className="cdebt-bar" aria-hidden="true">
                        <span
                          className={creditUsage > 100 ? 'is-over' : creditUsage >= 80 ? 'is-high' : 'is-ok'}
                          style={{ width: `${Math.min(100, Math.max(limit > 0 ? 3 : 0, creditUsage))}%` }}
                        />
                      </div>
                      <div className={`text-[8px] font-bold mt-0.5 ${creditUsage > 100 ? 'text-rose-600' : 'text-slate-500'}`}>
                        {limit > 0 ? `حد ${formatMoney(limit)} · ${creditUsage}%` : 'بدون حد'}
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#fdeeee]/80 border border-[#f3cccc] p-2 text-right">
                      <div className="text-[9px] text-[#b03d3d] font-bold">المستحقات</div>
                      <div className="font-black text-rose-900 text-xs sm:text-sm mt-0.5 truncate">
                        {formatMoney(overdue)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#e8f6ef]/80 border border-[#c7e9d9] p-2 text-right">
                      <div className="text-[9px] text-[#157a58] font-bold">إجمالي المسدد</div>
                      <div className="font-black text-teal-900 text-xs sm:text-sm mt-0.5 truncate">
                        {formatMoney(paidAmount)}
                      </div>
                      {colRate > 0 && <div className="text-[8px] text-emerald-700 font-bold mt-0.5">سداد {colRate}%</div>}
                    </div>
                  </div>

                  {/* Warning banner if big debt without phone */}
                  {!c.phone && bal >= 1000000 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-900 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>عميل بمديونية كبيرة بدون رقم هاتف مسجل</span>
                    </div>
                  )}

                  {/* Quick Action Footer Strip */}
                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone}`}
                          className="h-8 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center gap-1 transition"
                          title="اتصال هاتفي بالعميل"
                        >
                          <Phone className="w-3.5 h-3.5 text-teal-600" />
                          <span>اتصال</span>
                        </a>
                      ) : null}

                      {onOpenNewOrderForCustomer && (
                        <button
                          type="button"
                          onClick={() => onOpenNewOrderForCustomer(c)}
                          className="h-8 px-2.5 rounded-xl bg-[var(--app-navy)] hover:bg-[#0b2039] text-white font-bold text-[11px] flex items-center gap-1 transition shadow-xs cursor-pointer"
                          title="بدء طلبية بيع جديدة"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>+ طلبية</span>
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setQuickCustomer(c)}
                      className="h-8 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-teal-700 font-black text-xs flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>التفاصيل</span>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="cust-table w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200 whitespace-nowrap">
                  <th className="p-3 text-center w-10">#</th>
                  {visibleColumnDefs.map((def) =>
                    def.sortKey ? (
                      <th
                        key={def.key}
                        onClick={() => {
                          if (sortBy === def.sortKey) {
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortBy(def.sortKey as typeof sortBy);
                            setSortOrder(def.sortKey === 'name' || def.sortKey === 'code' ? 'asc' : 'desc');
                          }
                        }}
                        className={`p-3 cursor-pointer hover:bg-slate-200/60 transition ${columnAlignClass(def.align)}`}
                      >
                        <div className={`cf-th-inner ${def.align === 'start' ? 'cf-th-inner-start' : ''}`}>
                          <span>{def.label}</span>
                          <ArrowUpDown className="w-3 h-3 text-[#a9c4de]" />
                        </div>
                      </th>
                    ) : (
                      <th key={def.key} className={`p-3 ${columnAlignClass(def.align)}`}>
                        {def.label}
                      </th>
                    )
                  )}
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedCustomers.map((c, index) => (
                  <tr
                    key={c.id || c.code}
                    onClick={() => setQuickCustomer(c)}
                    className="hover:bg-[#fbf8f1] transition cursor-pointer group"
                  >
                    <td className="p-3 text-center font-bold text-slate-400">
                      {(currentPage - 1) * pageSize + index + 1}
                    </td>

                    {visibleColumnDefs.map((def) => (
                      <td
                        key={def.key}
                        className={`p-3 ${columnAlignClass(def.align)} ${
                          def.key === 'name' || def.key === 'region' ? '' : 'whitespace-nowrap'
                        }`}
                      >
                        {renderCustomerCell(def.key, c)}
                      </td>
                    ))}

                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setQuickCustomer(c);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                          title="تفاصيل سريعة"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCustomer(c);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-teal-700 transition cursor-pointer"
                          title="فتح الملف الكامل 360°"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        {onOpenNewOrderForCustomer && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenNewOrderForCustomer(c);
                            }}
                            className="px-2 py-1.5 rounded-lg bg-[var(--app-accent)] hover:bg-[#b98a35] text-[#102b4e] font-black text-[11px] transition flex items-center gap-1 cursor-pointer"
                            title="إنشاء طلبية جديدة"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">طلب</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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

      {/* إعدادات الأعمدة والفلاتر المخصصة */}
      {isTableSettingsOpen && (
        <CustomerTableSettings
          visibleColumns={visibleColumns}
          onToggleColumn={handleToggleColumn}
          onResetColumns={() => setVisibleColumns(getDefaultVisibleColumns())}
          filters={columnFilters}
          onAddFilter={handleAddColumnFilter}
          onRemoveFilter={(id) => setColumnFilters((prev) => prev.filter((item) => item.id !== id))}
          onClearFilters={() => setColumnFilters([])}
          columnOptions={columnFilterOptions}
          initialTab={tableSettingsTab}
          onClose={() => setIsTableSettingsOpen(false)}
        />
      )}

      {/* لوحة تفاصيل العميل السريعة (Side Drawer) */}
      {quickCustomer && (
        <CustomerQuickDrawer
          customer={quickCustomer}
          isPrivacyMode={isPrivacyMode}
          onClose={() => setQuickCustomer(null)}
          onOpenFullProfile={(customer) => {
            setQuickCustomer(null);
            setSelectedCustomer(customer);
          }}
          onOpenNewOrder={onOpenNewOrderForCustomer}
        />
      )}

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
                    <span className="text-amber-200/90 font-bold">الفرع: {selectedCustomer.branchName}</span>
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
                      <span>بدء فاتورة كاشير في الكتالوج</span>
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
