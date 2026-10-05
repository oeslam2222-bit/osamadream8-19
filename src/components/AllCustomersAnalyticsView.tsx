import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Upload,
  RefreshCw,
  Phone,
  MapPin,
  Package,
  Building2,
  UserCheck,
  CreditCard,
  Banknote,
  CalendarDays,
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
  Ban,
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
  SlidersHorizontal,
  Archive,
  ArchiveRestore
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
import * as XLSX from 'xlsx';
import { Customer, CustomerVisit, CustomerCommentRecord, User, Invoice, OrderStatus, Product } from '../types';
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
import { calculateCustomerFinancials, isSummaryOrTotalRow, parseCleanNumber, resolveNetCollections, resolveCollectionsMagnitude } from '../services/customerFinancialService';
import { resolveCustomerBalanceValue, resolveCustomerDuesValue } from '../services/customerDues';
import { classifyEligibilityColumn } from '../services/customerFinancialService';
import type { SheetClassification } from '../services/customerFinancialService';

/**
 * Collections for one customer: sums all collected amounts (both positive and negative entries)
 * so positive numbers are never dropped or subtracted from collections.
 */
const signedCustomerCollections = (
  customer: Customer,
  period: number | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'ALL' = 'ALL'
): number => {
  if (period !== 'ALL') {
    const months = typeof period === 'number'
      ? [period]
      : period === 'Q1' ? [1, 2, 3]
        : period === 'Q2' ? [4, 5, 6]
          : period === 'Q3' ? [7, 8, 9]
            : [10, 11, 12];
    return months.reduce((sum, month) => sum + Math.abs(parseCleanNumber(customer.monthlyCollections2026?.[month])), 0);
  }

  return resolveCollectionsMagnitude(customer);
};

/**
 * One badge per customer, showing the sheet's own classification text verbatim.
 * The sheet carries a single value in "قابل /غير", so showing a dealt badge and a
 * separate eligibility badge made one customer look like it had two states.
 */
const ClassificationBadge: React.FC<{ bucket: SheetClassification; label: string; compact?: boolean }> = ({
  bucket,
  label,
  compact,
}) => {
  const styles: Record<SheetClassification, string> = {
    dealt_eligible: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    idle_eligible: 'bg-sky-50 text-sky-800 border-sky-200',
    ineligible: 'bg-rose-50 text-rose-800 border-rose-200',
  };
  const Icon = bucket === 'dealt_eligible' ? CheckCircle2 : bucket === 'idle_eligible' ? Clock : Ban;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-black shadow-2xs ${styles[bucket]} ${
        compact ? 'px-2 py-0.5 text-[10.5px]' : 'px-2.5 py-0.5 text-[11px]'
      }`}
      title={label}
    >
      <Icon className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {label}
    </span>
  );
};

/** Columns the customers table header can sort by. 'ALL' means "no column override". */
type SortableColumn =
  | 'name'
  | 'code'
  | 'balance'
  | 'overdue'
  | 'creditLimit'
  | 'sales2026'
  | 'collections2026'
  | 'lastVisit'
  | 'order';

const SORTABLE_COLUMN_LABELS: Record<SortableColumn, string> = {
  name: 'اسم العميل / المحل',
  code: 'الكود',
  balance: 'المديونية (ج.م)',
  overdue: 'المستحقات (ج.م)',
  creditLimit: 'الحد الائتماني',
  sales2026: 'البيع 2026',
  collections2026: 'التحصيل 2026',
  lastVisit: 'تاريخ آخر زيارة',
  order: 'أمر البيع / الطلبية',
};

/**
 * أنواع الزيارة المتاحة في الفلتر.
 *
 * لازم تكون نفس قيم فورم تسجيل الزيارة في VisitsDashboard، وإلا الفلتر
 * بيعرض خيارات مش موجودة في البيانات. متعدد اللغات (multi-select) عشان
 * الاختيار متعدد هو المفيد فعلاً في تقرير زي ده.
 *
 * ملاحظة: لو أي يوم فورم الزيارات بدأ يحفظ نوع جديد، لازم تضاف هنا — وإلا
 * الزيارات دي هتختفي من الفلتر.
 */
const VISIT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'زيارة دورية', label: 'زيارة دورية' },
  { value: 'تحصيل', label: 'تحصيل مديونية ومستحقات' },
  { value: 'تسليم بضاعة', label: 'تسليم بضاعة أو طلبية' },
  { value: 'حل مشكلة', label: 'خدمة عملاء وحل مشكلة' },
  { value: 'فتح حساب جديد', label: 'فتح حساب عميل جديد' },
  { value: 'زيارة تحصيل', label: 'زيارة تحصيل (سجل قديم)' },
  { value: 'زيارة بيع وطلبية', label: 'زيارة بيع وطلبية (سجل قديم)' },
  { value: 'متابعة حساب', label: 'متابعة حساب (سجل قديم)' },
  { value: 'أخرى', label: 'أخرى' },
];

/**
 * Clickable + keyboard-operable table header that toggles the sort on its column.
 * All nine sortable headers used to be copy-pasted thunks with an onClick only,
 * which made them unreachable by keyboard and by screen readers.
 */
const SortableHeader: React.FC<{
  column: SortableColumn;
  activeColumn: SortableColumn | 'ALL';
  sortOrder: 'asc' | 'desc';
  defaultOrder: 'asc' | 'desc';
  align?: 'start' | 'center';
  accent?: string;
  onToggle: (column: SortableColumn, defaultOrder: 'asc' | 'desc') => void;
}> = ({ column, activeColumn, sortOrder, defaultOrder, align = 'start', accent, onToggle }) => {
  const isActive = activeColumn === column;
  const justify = align === 'center' ? 'justify-center text-center' : 'justify-end';
  return (
    <th
      scope="col"
      role="button"
      tabIndex={0}
      aria-sort={isActive ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
      aria-label={`${SORTABLE_COLUMN_LABELS[column]} — ترتيب`}
      onClick={() => onToggle(column, defaultOrder)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle(column, defaultOrder);
        }
      }}
      className={`p-3 cursor-pointer hover:bg-slate-200/60 transition ${
        align === 'center' ? 'text-center' : 'text-left'
      } ${isActive ? 'bg-slate-200/80' : ''}`}
    >
      <div className={`flex items-center ${justify} gap-1 ${accent || ''}`}>
        <span>{SORTABLE_COLUMN_LABELS[column]}</span>
        {isActive ? (
          sortOrder === 'asc' ? (
            <ArrowUp className="w-3 h-3 text-slate-500" />
          ) : (
            <ArrowDown className="w-3 h-3 text-slate-500" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 text-slate-400" />
        )}
      </div>
    </th>
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
    addVisit,
    updateVisit,
    getVisibleVisits,
    invoices = [],
    products = [],
    syncToAccounting,
    isPrivacyMode,
    togglePrivacyMode,
    cleanAndDeduplicateCustomers,
    toggleArchiveVisit,
    customerComments = [],
    toggleArchiveCustomerComment
  } = useApp();

  // Roles
  const isRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isBranchManager = currentUser?.role === 'branch_manager';
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  // Branch deficits report: the branch manager works their own branch, the
  // supervisor works every rep they supervise, and the admin sees everything.
  const canSeeDeficits = isBranchManager || isSupervisor || isAdminOrDev;

  // --- Branch deficits (نواقص أكتوبر) filters ---
  const [deficitDateMode, setDeficitDateMode] = useState<'today' | 'date' | 'range'>('today');
  const [deficitSingleDate, setDeficitSingleDate] = useState(new Date().toISOString().slice(0, 10));
  const [deficitFromDate, setDeficitFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [deficitToDate, setDeficitToDate] = useState(new Date().toISOString().slice(0, 10));
  const [deficitStatus, setDeficitStatus] = useState<'all' | 'pending' | 'uploaded'>('pending');
  const [expandedDeficitRep, setExpandedDeficitRep] = useState<string | null>(null);

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
  const [sheetStatusFilter, setSheetStatusFilter] = useState<SheetClassification | 'ALL'>('ALL');
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

  // Power BI Visuals Tab (المسار، معدل السرعة، موازنة المحفظة، الفروع، المناديب، طبيعة النشاط، تفعيل العملاء، الضمانات، والمصفوفة)
  const [activeChartTab, setActiveChartTab] = useState<'monthly' | 'run_rate' | 'portfolio_balance' | 'branches' | 'reps' | 'activity_client' | 'customer_dealing' | 'matrix' | 'payment_guarantee' | 'deficits'>('monthly');
  const [runRateSelectedMonth, setRunRateSelectedMonth] = useState<number>(9);

  // Customer Dealing View Filters (متعامل / غير متعامل فقط)
  const [dealingSegmentFilter, setDealingSegmentFilter] = useState<'ALL' | 'transacting' | 'non_transacting'>('ALL');
  const [dealingSearch, setDealingSearch] = useState<string>('');
  const [dealingRepFilter, setDealingRepFilter] = useState<string>('ALL');

  // Sorting — 'ALL' means "no column override", so the sortMode preset below applies
  const [sortBy, setSortBy] = useState<SortableColumn | 'ALL'>('ALL');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSortToggle = (column: SortableColumn, defaultOrder: 'asc' | 'desc') => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder(defaultOrder);
    }
  };

  const clearColumnSort = () => {
    setSortBy('ALL');
    setSortOrder('desc');
  };

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
      setEditOverdueBalance(resolveCustomerDuesValue(selectedCustomer));
      setEditNextVisitDate(selectedCustomer.nextVisitDate || '');
      setIsEditingDossier(false);
    }
  }, [selectedCustomer]);

  // Visit logging modal state
  const [isLoggingVisit, setIsLoggingVisit] = useState(false);
  // رسالة فشل تسجيل الزيارة — بتظهر جوه الفورم بدل ما تضيع في الكونسول.
  const [visitFormError, setVisitFormError] = useState<string | null>(null);
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  // قيم النوع اللي بتتحفظ فعلياً في جدول visits. اتأكدت منها على السيرفر:
  // الـ 3,774 زيارة الموجودة كلها 'زيارة دورية'. الفلتر القديم كان بيعرض
  // أربع قيم مختلفة (زيارة بيع وطلبية / زيارة تحصيل / متابعة حساب) ولا
  // واحدة منهم كانت موجودة في البيانات، فكان الفلتر بيرجّع نتيجة واحدة
  // بتلك القيمة المختارة وخلاص — يعني المستخدم كان بيختار حاجة وبيشوف
  // "لا نتائج" وبيفتكر إن مفيش زيارات أصلاً.
  const [visitType, setVisitType] = useState<CustomerVisit['type']>(VISIT_TYPE_OPTIONS[0].value as CustomerVisit['type']);
  // القائمة المرئية بقت 7 (منها
  // «مرتجع لدي العميل» و«أخرى» زي باقي الشاشات). الـcast اليدوي ده كان
  // اللي يخفي الـtype error، والنتيجة إن قيمتين من الـunion مكانش في
  // القائمة أصلاً.
  const [visitOutcome, setVisitOutcome] = useState<NonNullable<CustomerVisit['outcome']>>('تم عمل طلبية');
  const [visitCollected, setVisitCollected] = useState('');
  const [visitNotes, setVisitNotes] = useState('');
  // ===== المرتجع =====
  const [visitHasReturn, setVisitHasReturn] = useState(false);
  const [visitReturnValue, setVisitReturnValue] = useState('');
  const [visitReturnReason, setVisitReturnReason] = useState('');
  const [visitReturnItems, setVisitReturnItems] = useState('');
  const [visitReturnDetails, setVisitReturnDetails] = useState('');
  const [customerDossierTab, setCustomerDossierTab] = useState<'active_visits' | 'archived_visits' | 'comments'>('active_visits');
  const [newQuickComment, setNewQuickComment] = useState('');

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

  // Helper: Guarantee badge styling (صنفين فقط كما طلب المستخدم: ماضي / مش ماضي)
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

    const isSigned = amt > 0 || (g && g !== '0' && !g.includes('مش ماضي') && !g.includes('لا يوجد') && !g.includes('بدون') && (g.includes('ماضي') || g.includes('شيك') || g.includes('كمبيال') || g.includes('أمانة') || g.includes('امانة') || g.includes('رهن')));

    if (isSigned) {
      return {
        label: amt > 0 ? `ماضي على أوراق ضمان (${formatMoney(amt)})` : 'ماضي على أوراق ضمان',
        color: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold',
        isSigned: true,
      };
    }

    return {
      label: 'مش ماضي',
      color: 'bg-slate-100 text-slate-500 border-slate-200 font-bold',
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

  // 1. RBAC Base Filtered List (Strictly isolated by user permissions and excludes sheet total rows)
  const userVisibleCustomers = useMemo(() => {
    const rbacList = filterCustomersByRBAC(customers, currentUser, users);
    return rbacList.filter((c) => !isSummaryOrTotalRow(c.name, c.code, c.branchName, c.salesRepName || c.repName));
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
      if (selectedBranch === 'ALL' || (Boolean(c.branchName) && isBranchMatch(c.branchName, selectedBranch, { allowUnassigned: false }))) {
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

  // Strict RBAC: Branch comparison is exclusively for Admin and Developer only
  // (Hidden and blocked for Branch Manager, Supervisor, and Sales Rep)
  useEffect(() => {
    if (!isAdminOrDev && activeChartTab === 'branches') {
      setActiveChartTab('monthly');
    }
  }, [isAdminOrDev, activeChartTab]);

  // Strict RBAC Isolation: Automatically lock branch and rep filters to user's assigned scope
  useEffect(() => {
    if (isRep && currentUser?.name) {
      if (selectedRep !== currentUser.name && availableReps.includes(currentUser.name)) {
        setSelectedRep(currentUser.name);
      }
      if (currentUser?.branchName && selectedBranch !== currentUser.branchName && availableBranches.includes(currentUser.branchName)) {
        setSelectedBranch(currentUser.branchName);
      }
    } else if ((isBranchManager || isSupervisor) && currentUser?.branchName) {
      if (selectedBranch !== currentUser.branchName && availableBranches.includes(currentUser.branchName)) {
        setSelectedBranch(currentUser.branchName);
      }
    }
  }, [isRep, isBranchManager, isSupervisor, currentUser, availableReps, availableBranches, selectedRep, selectedBranch]);

  // Regions come from the sheet; keep the customer count for each so the slicer
  // shows real numbers instead of the number of distinct values.
  const availableRegions = useMemo(() => {
    const map = new Map<string, number>();
    userVisibleCustomers.forEach((c) => {
      const val = (c.region || c.district || c.route || '').trim();
      if (val && val !== '-' && val !== 'غير محدد') {
        map.set(val, (map.get(val) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ar'));
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

  // Deal status read straight from the base sheet column, so the "قابل / غير"
  // column always mirrors the sheet instead of a figure derived from the month
  // slicer. The sheet stores free text (متعامل / غير متعامل / نعم / لا).
  const sheetDealStatus = (c: Customer): boolean => {
    const dealtClass = classifyEligibilityColumn(c.dealt2026);
    if (dealtClass?.dealt !== undefined) return dealtClass.dealt;
    const raw = (c.dealt2026 || '').trim();
    if (raw && raw !== '-' && raw !== 'غير محدد') {
      if (raw.includes('غير')) return false;
      if (raw.includes('متعامل') || raw.includes('نعم')) return true;
    }
    return Boolean(c.hasDealtIn2026);
  };

  // "قابل" comes from the sheet's own قابل / غير column, which is separate from
  // the dealt status: a customer can be قابل yet have not traded yet.
  // Classification goes through the shared classifier so this can never disagree
  // with the badge, the counters and the slicers.
  const isSheetQualified = (c: Customer): boolean =>
    classifyEligibilityColumn(c.dealEligibility)?.eligible ?? false;

  // The guarantee column in the sheet is an AMOUNT: > 0 means signed (ماضي), 0 or blank means unsigned (مش ماضي)
  const hasGuaranteePapers = (c: Customer): boolean => {
    const amt = Number(c.guaranteeAmount || 0);
    if (amt > 0) return true;
    if (c.hasGuarantee === true) return true;
    const raw = (c.guaranteeDocs || '').trim();
    if (!raw || raw === '0' || raw.includes('مش ماضي') || raw.includes('لا يوجد') || raw.includes('بدون')) return false;
    const num = parseFloat(raw.replace(/,/g, '').replace(/[^\d.]/g, ''));
    if (!isNaN(num) && num > 0) return true;
    if (raw.includes('ماضي') || raw.includes('شيك') || raw.includes('كمبيالة') || raw.includes('إيصال') || raw.includes('ايصال') || raw.includes('رهن')) return true;
    return false;
  };

  const normalizeGuaranteeCategory = (c: Customer): 'ماضي على أوراق ضمان' | 'مش ماضي' => {
    return hasGuaranteePapers(c) ? 'ماضي على أوراق ضمان' : 'مش ماضي';
  };

  // Active scope customers: reflects active branch and rep so dropdown options and counts react interactively
  const scopeCustomersForDropdowns = useMemo(() => {
    let list = userVisibleCustomers;
    if (selectedBranch !== 'ALL') {
      list = list.filter((c) => Boolean(c.branchName) && isBranchMatch(c.branchName, selectedBranch, { allowUnassigned: false }));
    }
    if (selectedRep !== 'ALL') {
      list = list.filter((c) => {
        const r = c.salesRepName || c.repName || '';
        return isArabicNameMatch(r, selectedRep);
      });
    }
    return list;
  }, [userVisibleCustomers, selectedBranch, selectedRep]);

  // Distinct Sheet Activity Types with counts (طبيعة النشاط)
  const availableActivityTypes = useMemo(() => {
    const map = new Map<string, number>();
    scopeCustomersForDropdowns.forEach((c) => {
      const a = (c.activityType || '').trim();
      if (a && a !== '-' && a !== 'غير محدد') {
        map.set(a, (map.get(a) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [scopeCustomersForDropdowns]);

  // Distinct Sheet Client Types with counts (خ/ك)
  const availableClientTypes = useMemo(() => {
    const map = new Map<string, number>();
    scopeCustomersForDropdowns.forEach((c) => {
      const ct = (c.clientType || '').trim();
      if (ct && ct !== '-' && ct !== 'غير محدد') {
        map.set(ct, (map.get(ct) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [scopeCustomersForDropdowns]);

  // Distinct Sheet Deal Eligibility with counts (قابل / غير)
  const availableDealEligibilities = useMemo(() => {
    const map = new Map<string, number>();
    scopeCustomersForDropdowns.forEach((c) => {
      const e = (c.dealEligibility || '').trim();
      if (e && e !== '-' && e !== 'غير محدد') {
        map.set(e, (map.get(e) || 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [scopeCustomersForDropdowns]);

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
      list = list.filter((c) => Boolean(c.branchName) && isBranchMatch(c.branchName, selectedBranch, { allowUnassigned: false }));
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
      netBalance: number;
      overdue: number;
      creditLimit: number;
      isOverLimit: boolean;
      sales2026: number;
      collections2026: number;
      returns2026: number;
      netCollections2026: number;
      periodSales: number;
      periodCollections: number;
      collectionRate: number;
      isExplicitIneligible: boolean;
      isDealtCustomer: boolean;
      sheetClassification: SheetClassification;
      sheetClassificationLabel: string;
      isEligible: boolean;
      dealtStatusLabel: 'متعامل' | 'غير متعامل';
      eligibilityStatusLabel: 'قابل للتعامل' | 'غير قابل للتعامل';
      ineligibilityReason?: string;
      orderSummary: ReturnType<typeof getCustomerOrderSummary>;
    }>();

    userVisibleCustomers.forEach((c) => {
      const fin = calculateCustomerFinancials(c, selectedMonth);

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
        balance: fin.balance,
        netBalance: fin.netBalance,
        overdue: fin.overdue,
        creditLimit: fin.creditLimit,
        isOverLimit: fin.isOverLimit,
        sales2026: fin.sales2026,
        collections2026: fin.collections2026,
        returns2026: fin.returns2026,
        netCollections2026: fin.collections2026,
        periodSales: fin.periodSales,
        periodCollections: fin.periodCollections,
        collectionRate: fin.collectionRate,
        isExplicitIneligible: fin.isExplicitIneligible,
        isDealtCustomer: fin.isDealtCustomer,
        sheetClassification: fin.sheetClassification,
        sheetClassificationLabel: fin.sheetClassificationLabel,
        isEligible: fin.isEligible,
        dealtStatusLabel: fin.dealtStatusLabel,
        eligibilityStatusLabel: fin.eligibilityStatusLabel,
        ineligibilityReason: fin.ineligibilityReason,
        orderSummary: getCustomerOrderSummary(c),
      });
    });

    return map;
  }, [userVisibleCustomers, selectedMonth]);

  // 2. Multi-Filter & Search Pipeline
  const filterResult = useMemo(() => {
    let list = userVisibleCustomers;

    // Branch filter
    if (selectedBranch !== 'ALL') {
      list = list.filter((c) => Boolean(c.branchName) && isBranchMatch(c.branchName, selectedBranch, { allowUnassigned: false }));
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

    // Snapshot before the deal-status slicer runs, so the slicer cards can keep
    // showing the count of the side that is currently filtered out.
    const preDealList = [...list];

    // Deal Status & Eligibility Slicer (متعامل / غير متعامل / قابل / غير قابل)
    if (dealEligibilityFilter !== 'ALL') {
      list = list.filter((c) => {
        const m = customerMetricsMap.get(c.id);
        const isDealt = m ? m.isDealtCustomer : (c.dealt2026 === 'متعامل' || Boolean(c.hasDealtIn2026));
        const isEligible = m ? m.isEligible : (classifyEligibilityColumn(c.dealEligibility)?.eligible ?? true);

        if (dealEligibilityFilter === 'dealt') return isDealt;
        if (dealEligibilityFilter === 'non_dealt' || dealEligibilityFilter === 'not_dealt') return !isDealt;
        if (dealEligibilityFilter === 'eligible') return isEligible;
        if (dealEligibilityFilter === 'ineligible') return !isEligible;
        return true;
      });
    }

    // Dealt 2026 Activity Slicer (متعامل 2026 من الشيت)
    if (dealtFilter !== 'ALL') {
      list = list.filter((c) => {
        const m = customerMetricsMap.get(c.id);
        const isDealt = m ? m.isDealtCustomer : Boolean(c.hasDealtIn2026);
        const isEligible = m ? m.isEligible : (classifyEligibilityColumn(c.dealEligibility)?.eligible ?? true);

        if (dealtFilter === 'dealt') return isDealt;
        if (dealtFilter === 'not_dealt') return !isDealt;
        return true;
      });
    }

    if (sheetStatusFilter !== 'ALL') {
      list = list.filter((c) => customerMetricsMap.get(c.id)?.sheetClassification === sheetStatusFilter);
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

    // Snapshot before the guarantee slicer runs, so its counts can react to the
    // other active filters (rep / branch / activity / deal status) while still
    // showing the size of the side that is currently filtered out.
    const preGuaranteeList = [...list];

    // Guarantee filter (أوراق الضمان من الشيت)
    // The sheet column is an amount: above 0 means papers exist (ماضي),
    // 0 or blank means none (مش ماضي).
    if (guaranteeFilter !== 'ALL') {
      list = list.filter((c) => {
        const isSigned = hasGuaranteePapers(c);
        if (guaranteeFilter === 'has_guarantee') return isSigned;
        if (guaranteeFilter === 'unsecured') return !isSigned;
        return true;
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

    // Sorting Pipeline: an explicit column sort (set by clicking a table header)
    // always wins; otherwise the sortMode preset from the dropdown applies.
    list = [...list].sort((a, b) => {
      const mA = customerMetricsMap.get(a.id);
      const mB = customerMetricsMap.get(b.id);
      if (!mA || !mB) return 0;

      const dir = sortOrder === 'asc' ? 1 : -1;

      if (sortBy !== 'ALL') {
        if (sortBy === 'sales2026') return (mA.sales2026 - mB.sales2026) * dir;
        if (sortBy === 'collections2026') return (mA.collections2026 - mB.collections2026) * dir;
        if (sortBy === 'balance') return (mA.balance - mB.balance) * dir;
        if (sortBy === 'overdue') return (mA.overdue - mB.overdue) * dir;
        if (sortBy === 'creditLimit') return (mA.creditLimit - mB.creditLimit) * dir;
        if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '', 'ar') * dir;
        if (sortBy === 'code') return (a.code || '').localeCompare(b.code || '') * dir;
        if (sortBy === 'lastVisit') {
          const tA = (a.lastVisitDate ? new Date(a.lastVisitDate).getTime() : 0) || 0;
          const tB = (b.lastVisitDate ? new Date(b.lastVisitDate).getTime() : 0) || 0;
          return (tA - tB) * dir;
        }
        if (sortBy === 'order') {
          const latest = (m: typeof mA) => {
            const o = m.orderSummary?.latestOrder;
            return (o ? new Date(o.date || o.createdAt || 0).getTime() : 0) || 0;
          };
          return (latest(mA) - latest(mB)) * dir;
        }
      }

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

      return mB.balance - mA.balance;
    });

    return { list, preDealList, preGuaranteeList };
  }, [
    userVisibleCustomers,
    customerMetricsMap,
    selectedBranch,
    selectedRep,
    selectedCustomerId,
    dealEligibilityFilter,
    sheetStatusFilter,
    dealtFilter,
    selectedRegion,
    activityFilter,
    activityTypeFilter,
    clientTypeFilter,
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

  const filteredCustomers = filterResult.list;
  const preDealFilteredCustomers = filterResult.preDealList;
  const preGuaranteeFilteredCustomers = filterResult.preGuaranteeList;

  // Counts for the deal-status and eligibility slicer cards (الكل، متعامل، غير متعامل، قابل، غير قابل)
  const dealStatusCounts = useMemo(() => {
    let dealt = 0;
    let eligible = 0;
    let ineligible = 0;
    preDealFilteredCustomers.forEach((c) => {
      const m = customerMetricsMap.get(c.id);
      const isDealt = m ? m.isDealtCustomer : (c.dealt2026 === 'متعامل' || Boolean(c.hasDealtIn2026));
      const isElig = m ? m.isEligible : (classifyEligibilityColumn(c.dealEligibility)?.eligible ?? true);
      if (isDealt) dealt++;
      if (isElig) eligible++;
      else ineligible++;
    });
    const total = preDealFilteredCustomers.length;
    return {
      total,
      dealt,
      notDealt: Math.max(0, total - dealt),
      eligible,
      ineligible,
    };
  }, [preDealFilteredCustomers, customerMetricsMap]);

  const sheetStatusCounts = useMemo(() => {
    const counts: Record<SheetClassification, number> = {
      dealt_eligible: 0,
      ineligible: 0,
      idle_eligible: 0,
    };
    // Each bucket also reports the wording the sheet itself uses, so the dropdown
    // and the coverage card cannot label a bucket differently from each other.
    const wording: Record<SheetClassification, Map<string, number>> = {
      dealt_eligible: new Map(),
      ineligible: new Map(),
      idle_eligible: new Map(),
    };
    preDealFilteredCustomers.forEach((customer) => {
      const m = customerMetricsMap.get(customer.id);
      const classification = m?.sheetClassification;
      if (!classification) return;
      counts[classification]++;
      const text = (m?.sheetClassificationLabel || '').trim() || 'قابل';
      wording[classification].set(text, (wording[classification].get(text) || 0) + 1);
    });
    const dominant = (m: Map<string, number>, fallback: string) => {
      let best = '';
      let bestCount = -1;
      m.forEach((count, text) => {
        if (count > bestCount) { best = text; bestCount = count; }
      });
      return best || fallback;
    };
    return {
      ...counts,
      dealt_eligibleLabel: dominant(wording.dealt_eligible, 'متعامل'),
      idle_eligibleLabel: dominant(wording.idle_eligible, 'قابل للتعامل'),
      ineligibleLabel: dominant(wording.ineligible, 'غير قابل'),
    };
  }, [preDealFilteredCustomers, customerMetricsMap]);

  // Guarantee counts (صنفين فقط: ماضي على أوراق ضمان / مش ماضي)
  const guaranteeCounts = useMemo(() => {
    const signed = preGuaranteeFilteredCustomers.filter(hasGuaranteePapers).length;
    const total = preGuaranteeFilteredCustomers.length;
    return { total, signed, unsigned: total - signed };
  }, [preGuaranteeFilteredCustomers]);

  // Reset pagination on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedBranch,
    selectedRep,
    selectedCustomerId,
    selectedMonth,
    dealEligibilityFilter,
    sheetStatusFilter,
    dealtFilter,
    sortMode,
    sortBy,
    sortOrder,
    selectedRegion,
    activityFilter,
    activityTypeFilter,
    clientTypeFilter,
    debtFilter,
    orderFilter,
    guaranteeFilter,
    visitFilter,
    paymentTermsFilter,
    salesTierFilter,
    collectionRateFilter,
    searchQuery,
    pageSize,
  ]);

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
    let dealtEligibleCount = 0;
    let idleEligibleCount = 0;
    // The sheet's own wording for each bucket, so the card can show what the sheet
    // actually says instead of a label the UI composed (which used to call a
    // customer "غير متعامل" on a cell that only said "قابل للتعامل").
    const bucketLabels: Record<SheetClassification, Map<string, number>> = {
      dealt_eligible: new Map(),
      idle_eligible: new Map(),
      ineligible: new Map(),
    };
    const dominantLabel = (m: Map<string, number>, fallback: string) => {
      let best = '';
      let bestCount = -1;
      m.forEach((count, text) => {
        if (count > bestCount) { best = text; bestCount = count; }
      });
      return best || fallback;
    };
    let dealtCount = 0;
    let activeFilteredCount = 0;
    let nonDealtFilteredCount = 0;

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
      // Keep the sheet's signs so refunds offset collections in company totals.
      const c25 = parseCleanNumber(c.collections2025);
      const c26 = signedCustomerCollections(c);
      const pCols = signedCustomerCollections(c, selectedMonth);
      const bal = m ? m.balance : (c.currentBalance ?? c.balance ?? 0);
      const overdue = m ? m.overdue : resolveCustomerDuesValue(c);
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
      if (hasGuaranteePapers(c)) guaranteedCount++;

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

      // متعامل = اشترى مننا. في فلتر الشهر/الربع بيتحسب من مبيعات الفترة بس،
      // ومن غير فلتر بناخد قيمة الشيت. التحصيلات والمردودات ما بتخليش
      // حد متعامل.
      const isDealt = m ? m.isDealtCustomer : (pSales > 0 || (selectedMonth === 'ALL' && Boolean(c.hasDealtIn2026)));
      if (isDealt) {
        activeFilteredCount++;
      } else {
        nonDealtFilteredCount++;
      }

      // التصنيفات التلاتة كما هي في عمود "قابل /غير" — من العمود نفسه، مش
      // استنتاج: متعامل قابل / غير متعامل قابل / غير قابل.
      const bucket = m ? m.sheetClassification : 'idle_eligible';
      if (bucket === 'dealt_eligible') dealtEligibleCount++;
      else if (bucket === 'ineligible') ineligibleCount++;
      else idleEligibleCount++;
      const bucketText = (m ? m.sheetClassificationLabel : 'قابل').trim() || 'قابل';
      bucketLabels[bucket].set(bucketText, (bucketLabels[bucket].get(bucketText) || 0) + 1);
      if (isDealt) dealtCount++;

      if (c.monthlySales2026) {
        for (let mon = 1; mon <= 12; mon++) {
          monthlySalesTotals[mon] += c.monthlySales2026[mon] || 0;
        }
      }
      if (c.monthlyCollections2026) {
        for (let mon = 1; mon <= 12; mon++) {
          monthlyCollectionTotals[mon] += Math.abs(parseCleanNumber(c.monthlyCollections2026[mon]));
        }
      }
    });

    const salesGrowth = totalSales2025 > 0 ? Math.round(((totalSales2026 - totalSales2025) / totalSales2025) * 100) : (totalSales2026 > 0 ? 100 : 0);
    const collectionRate = totalSales2026 > 0 ? Math.round((Math.abs(totalCollections2026) / totalSales2026) * 100) : 0;
    const periodCollectionRate = totalPeriodSales > 0 ? Math.round((Math.abs(totalPeriodCollections) / totalPeriodSales) * 100) : 0;
    const activeRate = filteredCustomers.length > 0 ? Math.round((active2026Count / filteredCustomers.length) * 100) : 0;
    const coverageRate = filteredCustomers.length > 0 ? Math.round((activeFilteredCount / filteredCustomers.length) * 100) : 0;

    // Monthly Chart Data (Jan - Dec 2026)
    const monthlyChartData = MONTH_NAMES_AR.map((monthName, idx) => {
      const monthNum = idx + 1;
      return {
        month: monthName,
        'مبيعات 2026': monthlySalesTotals[monthNum] || 0,
        'تحصيلات 2026': monthlyCollectionTotals[monthNum] || 0,
        'صافي التحصيلات': monthlyCollectionTotals[monthNum] || 0,
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
      dealtEligibleCount,
      idleEligibleCount,
      dealtEligibleLabel: dominantLabel(bucketLabels.dealt_eligible, 'متعامل'),
      idleEligibleLabel: dominantLabel(bucketLabels.idle_eligible, 'قابل للتعامل'),
      ineligibleLabel: dominantLabel(bucketLabels.ineligible, 'غير قابل'),
      dealtCount,
      activeFilteredCount,
      nonDealtFilteredCount,
      coverageRate,
    };
  }, [filteredCustomers, customerMetricsMap, selectedMonth]);

  // 3.4b. Branch Deficits (نواقص أكتوبر) — split every invoice line by where the
  // stock has to come from, then group by rep so the branch manager can export
  // one sheet per day and the supervisor can see his whole team.
  // null = no restriction. A supervisor is scoped to the reps he actually
  // supervises (matched on supervisorName), a branch manager to his branch, and
  // the admin/developer to everything.
  const deficitScope = useMemo(() => {
    if (!currentUser) return { branchName: null as string | null, supervisorName: null as string | null };
    if (isAdminOrDev) return { branchName: null, supervisorName: null };
    if (isSupervisor) return { branchName: currentUser.branchName || null, supervisorName: currentUser.name };
    return { branchName: currentUser.branchName || branches[0] || null, supervisorName: null };
  }, [currentUser, isAdminOrDev, isSupervisor, branches]);

  const deficitDateRange = useMemo(() => {
    if (deficitDateMode === 'today') {
      const t = new Date().toISOString().slice(0, 10);
      return { from: t, to: t };
    }
    if (deficitDateMode === 'date') return { from: deficitSingleDate, to: deficitSingleDate };
    return {
      from: deficitFromDate <= deficitToDate ? deficitFromDate : deficitToDate,
      to: deficitFromDate <= deficitToDate ? deficitToDate : deficitFromDate,
    };
  }, [deficitDateMode, deficitSingleDate, deficitFromDate, deficitToDate]);

  // Live product index so each line can show the current warehouse balance,
  // not just what the invoice asked for. Invoices may carry the product code,
  // the unified code, or the id depending on how the order was created.
  const productByKey = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => {
      if (p.id) map.set(String(p.id), p);
      if (p.code) map.set(String(p.code), p);
      if (p.unifiedCode) map.set(String(p.unifiedCode), p);
    });
    return map;
  }, [products]);

  // Branch balance for a product, preferring the per-branch map so a rep in
  // another branch does not see this branch's number.
  const branchBalanceOf = (p: Product | undefined, branchName: string | undefined): number => {
    if (!p) return 0;
    if (p.branchStocks && branchName) {
      const key = Object.keys(p.branchStocks).find((k) => k.replace(/^(فرع|مخزن)\s*/, '').trim() === branchName.replace(/^(فرع|مخزن)\s*/, '').trim());
      if (key !== undefined) return Number(p.branchStocks[key]) || 0;
    }
    return Number(p.branchStockActual) || 0;
  };

  const deficitRows = useMemo(() => {
    if (!canSeeDeficits) return [];
    const { from, to } = deficitDateRange;

    return invoices
      .filter((inv) => {
        // A draft has not been submitted yet, so its lines are not a real demand.
        if (inv.status === 'مسودة') return false;
        // Invoice.date is the business date; fall back to createdAt for older rows.
        const day = (inv.createdAt || inv.date || '').slice(0, 10);
        if (!day || day < from || day > to) return false;
        if (deficitScope.branchName && inv.branchName !== deficitScope.branchName) return false;
        // Supervisors only report on their own team.
        if (deficitScope.supervisorName && inv.supervisorName !== deficitScope.supervisorName) return false;
        if (deficitStatus === 'pending' && inv.syncedToAccounting) return false;
        if (deficitStatus === 'uploaded' && !inv.syncedToAccounting) return false;
        return true;
      })
      .map((inv) => {
        // Each line is already tagged with its source warehouse. Anything coming
        // from 6 أكتوبر is a deficit the branch cannot ship on its own.
        const october = inv.items.filter((it) => it.fulfilledFrom === 'main_warehouse');
        const fromBranch = inv.items.filter((it) => it.fulfilledFrom !== 'main_warehouse');
        return {
          invoice: inv,
          repName: inv.repName || 'غير محدد',
          supervisorName: inv.supervisorName || '',
          branchName: inv.branchName,
          // --- deficits (نواقص أكتوبر) ---
          deficitCartons: october.reduce((s, it) => s + (it.cartonCount || 0), 0),
          deficitPieces: october.reduce((s, it) => s + (it.pieceCount || 0), 0),
          deficitLines: october,
          // --- available at the branch ---
          branchCartons: fromBranch.reduce((s, it) => s + (it.cartonCount || 0), 0),
          branchPieces: fromBranch.reduce((s, it) => s + (it.pieceCount || 0), 0),
          branchLines: fromBranch,
        };
      })
      .filter((r) => r.deficitLines.length > 0 || r.branchLines.length > 0);
  }, [canSeeDeficits, invoices, deficitDateRange, deficitScope, deficitStatus]);

  // Group by rep, then by product inside each rep, so the export is ready to
  // hand to the company system without any manual merging.
  const deficitByRep = useMemo(() => {
    const map = new Map<
      string,
      {
        repName: string;
        supervisorName: string;
        branchName: string;
        invoiceIds: string[];
        deficitByProduct: Map<
          string,
          {
            productCode: string;
            unifiedCode: string;
            productName: string;
            color: string;
            size: string;
            cartons: number;
            pieces: number;
            invoices: Set<string>;
            stockBranch: number;
            stockOctober: number;
          }
        >;
        branchByProduct: Map<
          string,
          { productCode: string; unifiedCode: string; productName: string; cartons: number; pieces: number }
        >;
        deficitCartons: number;
        deficitPieces: number;
        branchCartons: number;
        branchPieces: number;
      }
    >();

    deficitRows.forEach((row) => {
      if (!map.has(row.repName)) {
        map.set(row.repName, {
          repName: row.repName,
          supervisorName: row.supervisorName,
          branchName: row.branchName,
          invoiceIds: [],
          deficitByProduct: new Map(),
          branchByProduct: new Map(),
          deficitCartons: 0,
          deficitPieces: 0,
          branchCartons: 0,
          branchPieces: 0,
        });
      }
      const agg = map.get(row.repName)!;
      agg.invoiceIds.push(row.invoice.id);
      if (row.supervisorName) agg.supervisorName = row.supervisorName;

      row.deficitLines.forEach((it) => {
        const key = it.unifiedCode || it.productCode || it.productId;
        // Pull the live record so the row can show real balances and the
        // unified code, which is what the warehouse actually keys on.
        const live = productByKey.get(String(key)) || productByKey.get(String(it.productCode)) || productByKey.get(String(it.productId));
        const cur = agg.deficitByProduct.get(key) || {
          productCode: it.productCode,
          unifiedCode: it.unifiedCode || live?.unifiedCode || it.productCode,
          productName: it.productName,
          color: live?.color || '',
          size: live?.size || '',
          cartons: 0,
          pieces: 0,
          invoices: new Set<string>(),
          stockBranch: branchBalanceOf(live, row.branchName),
          stockOctober: Number(live?.mainWarehouseActual) || 0,
        };
        cur.cartons += it.cartonCount || 0;
        cur.pieces += it.pieceCount || 0;
        cur.invoices.add(row.invoice.invoiceNumber);
        agg.deficitByProduct.set(key, cur);
        agg.deficitCartons += it.cartonCount || 0;
        agg.deficitPieces += it.pieceCount || 0;
      });

      row.branchLines.forEach((it) => {
        const key = it.unifiedCode || it.productCode || it.productId;
        const liveB = productByKey.get(String(key)) || productByKey.get(String(it.productCode)) || productByKey.get(String(it.productId));
        const cur = agg.branchByProduct.get(key) || {
          productCode: it.productCode,
          unifiedCode: it.unifiedCode || liveB?.unifiedCode || it.productCode,
          productName: it.productName,
          cartons: 0,
          pieces: 0,
        };
        cur.cartons += it.cartonCount || 0;
        cur.pieces += it.pieceCount || 0;
        agg.branchByProduct.set(key, cur);
        agg.branchCartons += it.cartonCount || 0;
        agg.branchPieces += it.pieceCount || 0;
      });
    });

    return Array.from(map.values()).sort((a, b) => b.deficitCartons - a.deficitCartons);
  }, [deficitRows, productByKey]);

  const deficitTotals = useMemo(() => {
    return deficitByRep.reduce(
      (acc, r) => ({
        deficitCartons: acc.deficitCartons + r.deficitCartons,
        deficitPieces: acc.deficitPieces + r.deficitPieces,
        branchCartons: acc.branchCartons + r.branchCartons,
        branchPieces: acc.branchPieces + r.branchPieces,
        invoices: acc.invoices + r.invoiceIds.length,
        reps: acc.reps + 1,
      }),
      { deficitCartons: 0, deficitPieces: 0, branchCartons: 0, branchPieces: 0, invoices: 0, reps: 0 }
    );
  }, [deficitByRep]);

  // 3.5. Power BI Rep & Branch Financial Matrix (إجمالي المستحقات والمديونيات لكل مندوب وكل فرع)
  const repAndBranchSummary = useMemo(() => {
    const map = new Map<string, {
      branchName: string;
      repName: string;
      totalCustomers: number;
      ineligibleCustomers: number;
      eligibleCustomers: number;
      dealtCustomers: number;
      nonDealtCustomers: number;
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
          nonDealtCustomers: 0,
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
      item.totalCollections += signedCustomerCollections(c);

      // Period Sales & Collections come from the metrics map — the same source
      // the KPI cards use. Re-deriving the month range here meant the table could
      // disagree with the card, and it read raw cells instead of parsed numbers.
      item.periodSales += m.periodSales;
      item.periodCollections += m.periodCollections;

      // Every customer lands in exactly one bucket so the columns add up to
      // إجمالي العملاء. "غير قابل" is no longer a visible category, so those
      // customers simply count as غير متعامل.
      item.eligibleCustomers++;
      if (m.isDealtCustomer) {
        item.dealtCustomers++;
      } else {
        item.nonDealtCustomers++;
      }
    });

    return Array.from(map.values()).map((row) => {
      const totalCollections = row.totalCollections;
      const periodCollections = row.periodCollections;
      const netBalance = row.totalSales - totalCollections;
      const periodNetBalance = row.periodSales - periodCollections;
      return {
        ...row,
        totalCollections,
        periodCollections,
        netBalance,
        periodNetBalance,
        coverageRate: row.eligibleCustomers > 0 ? Math.round((row.dealtCustomers / row.eligibleCustomers) * 100) : 0,
        collectionRate: row.totalSales > 0 ? Math.round((Math.abs(totalCollections) / row.totalSales) * 100) : 0,
        periodCollectionRate: row.periodSales > 0 ? Math.round((Math.abs(periodCollections) / row.periodSales) * 100) : 0,
      };
    }).sort((a, b) => b.totalDebt - a.totalDebt || b.totalOverdue - a.totalOverdue);
  }, [filteredCustomers, customerMetricsMap, selectedMonth]);

  // Power BI Customer Activation & Dealing Breakdown (متعامل / غير متعامل / قابل / غير قابل)
  // Strictly isolated by RBAC (Rep sees only his assigned customers, supervisor only team, branch manager only branch)
  const customerDealingAnalyticsData = useMemo(() => {
    const map = new Map<string, {
      branchName: string;
      repName: string;
      totalCustomers: number;
      dealtCustomers: number;
      nonDealtCustomers: number;
      eligibleCustomers: number;
      ineligibleCustomers: number;
      coverageRate: number;
      totalDebt: number;
      totalOverdue: number;
      totalSales: number;
      totalCollections: number;
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
          dealtCustomers: 0,
          nonDealtCustomers: 0,
          eligibleCustomers: 0,
          ineligibleCustomers: 0,
          coverageRate: 0,
          totalDebt: 0,
          totalOverdue: 0,
          totalSales: 0,
          totalCollections: 0,
          collectionRate: 0,
        };
        map.set(key, item);
      }

      item.totalCustomers++;
      item.totalDebt += m.balance;
      item.totalOverdue += m.overdue;
      item.totalSales += m.sales2026;
      item.totalCollections += signedCustomerCollections(c);

      // Every customer lands in exactly one bucket so the columns add up to
      // إجمالي العملاء. "غير قابل" is no longer a visible category, so those
      // customers simply count as غير متعامل.
      item.eligibleCustomers++;
      if (m.isDealtCustomer) {
        item.dealtCustomers++;
      } else {
        item.nonDealtCustomers++;
      }
    });

    const rows = Array.from(map.values()).map((row) => {
      const totalCollections = row.totalCollections;
      return {
        ...row,
        totalCollections,
        coverageRate: row.eligibleCustomers > 0 ? Math.round((row.dealtCustomers / row.eligibleCustomers) * 100) : 0,
        collectionRate: row.totalSales > 0 ? Math.round((Math.abs(totalCollections) / row.totalSales) * 100) : 0,
      };
    }).sort((a, b) => b.totalSales - a.totalSales || b.totalDebt - a.totalDebt);

    const summary = {
      totalCustomers: rows.reduce((acc, r) => acc + r.totalCustomers, 0),
      dealtCustomers: rows.reduce((acc, r) => acc + r.dealtCustomers, 0),
      nonDealtCustomers: rows.reduce((acc, r) => acc + r.nonDealtCustomers, 0),
      eligibleCustomers: rows.reduce((acc, r) => acc + r.eligibleCustomers, 0),
      ineligibleCustomers: rows.reduce((acc, r) => acc + r.ineligibleCustomers, 0),
      totalSales: rows.reduce((acc, r) => acc + r.totalSales, 0),
      // Summed from the same rows as every other figure above, so the footer can
      // never disagree with the table it belongs to.
      totalCollections: rows.reduce((acc, r) => acc + r.totalCollections, 0),
      totalDebt: rows.reduce((acc, r) => acc + r.totalDebt, 0),
      totalOverdue: rows.reduce((acc, r) => acc + r.totalOverdue, 0),
      overallCoverageRate: 0,
      overallCollectionRate: 0,
    };
    summary.overallCoverageRate = summary.eligibleCustomers > 0 ? Math.round((summary.dealtCustomers / summary.eligibleCustomers) * 100) : 0;
    summary.overallCollectionRate = summary.totalSales > 0 ? Math.round((summary.totalCollections / summary.totalSales) * 100) : 0;

    return { rows, summary };
  }, [filteredCustomers, customerMetricsMap]);

  // Power BI Visuals Computations (Branches, Top Reps, Payment Terms Distribution)
  const branchAnalyticsData = useMemo(() => {
    const map = new Map<string, { branch: string; sales: number; collections: number; customers: number; debt: number; overdue: number; collectionRate: number }>();
    filteredCustomers.forEach((c) => {
      const b = c.branchName || 'الفرع الرئيسي';
      const cur = map.get(b) || { branch: b, sales: 0, collections: 0, customers: 0, debt: 0, overdue: 0, collectionRate: 0 };
      const m = customerMetricsMap.get(c.id);
      const s = m ? m.sales2026 : (c.sales2026 || c.totalMonthlySales || 0);
      const col = signedCustomerCollections(c);
      const d = m ? m.balance : (c.currentBalance ?? c.balance ?? 0);
      const o = m ? m.overdue : resolveCustomerDuesValue(c);
      cur.sales += s;
      cur.collections += col;
      cur.debt += d;
      cur.overdue += o;
      cur.customers += 1;
      map.set(b, cur);
    });
    return Array.from(map.values())
      .map((item) => {
        const collections = item.collections;
        return {
          ...item,
          collections,
          collectionRate: item.sales > 0 ? Math.min(100, Math.round((Math.abs(collections) / item.sales) * 100)) : 0,
        };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [filteredCustomers, customerMetricsMap]);

  const topRepsAnalyticsData = useMemo(() => {
    const map = new Map<string, { rep: string; sales: number; collections: number; customers: number }>();
    filteredCustomers.forEach((c) => {
      const r = c.salesRepName || c.repName;
      if (!r || r === 'غير محدد') return;
      const cur = map.get(r) || { rep: r, sales: 0, collections: 0, customers: 0 };
      const m = customerMetricsMap.get(c.id);
      const s = m ? m.sales2026 : (c.sales2026 || c.totalMonthlySales || 0);
      const col = signedCustomerCollections(c);
      cur.sales += s;
      cur.collections += col;
      cur.customers += 1;
      map.set(r, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 8);
  }, [filteredCustomers, customerMetricsMap]);

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
      const cols = signedCustomerCollections(c);

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

  // Power BI Visuals: Customer Dealing Analytics (المتعاملين وغير المتعاملين) بالمندوب والفرع
  const customerDealingAnalytics = useMemo(() => {
    const map = new Map<string, {
      branchName: string;
      repName: string;
      total: number;
      transactingCount: number;
      eligibleCount: number;
      transactingSales: number;
      transactingCollections: number;
      totalDebt: number;
      totalOverdue: number;
      nonTransactingCount: number;
      nonTransactingDebt: number;
      nonTransactingOverdue: number;
      transactingRate: number;
      nonTransactingRate: number;
      collectionRate: number;
    }>();

    let totalAll = 0;
    let totalTransacting = 0;
    let totalTransactingSales = 0;
    let totalTransactingCollections = 0;
    let totalNonTransacting = 0;
    let totalNonTransactingDebt = 0;
    let totalNonTransactingOverdue = 0;
    let totalEligible = 0;
    let eligibleTransacting = 0;
    let eligibleNonTransacting = 0;

    const classifiedList: Array<{
      customer: Customer;
      category: 'transacting' | 'non_transacting';
      categoryLabel: string;
      isEligible: boolean;
      // The sheet's own wording, so the export never rewords the classification.
      eligibleLabel: string;
      sales: number;
      collections: number;
      debt: number;
      overdue: number;
      branchName: string;
      repName: string;
    }> = [];

    filteredCustomers.forEach((c) => {
      const m = customerMetricsMap.get(c.id);
      const bName = c.branchName || 'غير محدد';
      const rName = c.salesRepName || c.repName || 'غير محدد';
      const sales = m ? m.sales2026 : (c.sales2026 || c.totalMonthlySales || 0);
      const signedCols = signedCustomerCollections(c);
      const cols = Math.abs(signedCols);
      const debt = c.currentBalance ?? c.balance ?? 0;
      const overdue = resolveCustomerDuesValue(c);

      const hasOrder = customerOrdersLookup.getOrdersForCustomer(c).length > 0;
      const isTrans = sales > 0 || cols !== 0 || hasOrder || Boolean(c.hasDealtIn2026);
      const isNonTrans = !isTrans && (debt > 0 || overdue > 0 || (m && m.isExplicitIneligible));

      // القابل للتعامل comes from the sheet's قابل / غير column, read through the
      // shared classifier. It is a separate axis from متعامل / غير متعامل: a
      // customer can be قابل للتعامل without having traded yet.
      const isEligible = m
        ? m.isEligible
        : classifyEligibilityColumn(c.dealEligibility)?.eligible ?? true;
      if (isEligible) totalEligible++;
      if (isTrans && isEligible) eligibleTransacting++;
      if (!isTrans && isEligible) eligibleNonTransacting++;

      // فقط فئتان: متعامل وغير متعامل. أي عميل ليس متعاملاً يُحسب غير متعامل.
      let category: 'transacting' | 'non_transacting' = 'non_transacting';
      let categoryLabel = 'غير متعامل (راكد) ⚠️';

      if (isTrans) {
        category = 'transacting';
        categoryLabel = 'متعامل نشط ✅';
      }

      classifiedList.push({
        customer: c,
        category,
        categoryLabel,
        isEligible,
        eligibleLabel: (m?.sheetClassificationLabel || '').trim() || (isEligible ? 'قابل للتعامل' : 'غير قابل'),
        sales,
        collections: cols,
        debt,
        overdue,
        branchName: bName,
        repName: rName,
      });

      const key = `${bName}:::${rName}`;
      let item = map.get(key);
      if (!item) {
        item = {
          branchName: bName,
          repName: rName,
          total: 0,
          transactingCount: 0,
          eligibleCount: 0,
          transactingSales: 0,
          transactingCollections: 0,
          totalDebt: 0,
          totalOverdue: 0,
          nonTransactingCount: 0,
          nonTransactingDebt: 0,
          nonTransactingOverdue: 0,
          transactingRate: 0,
          nonTransactingRate: 0,
          collectionRate: 0,
        };
        map.set(key, item);
      }

      item.total++;
      totalAll++;
      item.totalDebt += debt;
      item.totalOverdue += overdue;
      if (isEligible) item.eligibleCount++;

      if (isTrans) {
        item.transactingCount++;
        item.transactingSales += sales;
        item.transactingCollections += cols;
        totalTransacting++;
        totalTransactingSales += sales;
        totalTransactingCollections += cols;
      } else if (isNonTrans) {
        item.nonTransactingCount++;
        item.nonTransactingDebt += debt;
        item.nonTransactingOverdue += overdue;
        totalNonTransacting++;
        totalNonTransactingDebt += debt;
        totalNonTransactingOverdue += overdue;
      } else {
        // العميل الذي لا يتحقق له شرط الركون يبقى غير متعامل: لا توجد فئة ثالثة.
        item.nonTransactingCount++;
        item.nonTransactingDebt += debt;
        item.nonTransactingOverdue += overdue;
        totalNonTransacting++;
        totalNonTransactingDebt += debt;
        totalNonTransactingOverdue += overdue;
      }
    });

    let totalNetBalanceAll = 0;
    const matrixRows = Array.from(map.values()).map((row) => {
      const transactingCollections = row.transactingCollections;
      const netBalance = row.transactingSales - transactingCollections;
      totalNetBalanceAll += netBalance;
      return {
        ...row,
        transactingCollections,
        netBalance,
        transactingRate: row.total > 0 ? Math.round((row.transactingCount / row.total) * 100) : 0,
        nonTransactingRate: row.total > 0 ? Math.round((row.nonTransactingCount / row.total) * 100) : 0,
        collectionRate: row.transactingSales > 0 ? Math.min(100, Math.round((Math.abs(transactingCollections) / row.transactingSales) * 100)) : 0,
      };
    }).sort((a, b) => b.transactingCount - a.transactingCount || b.transactingSales - a.transactingSales);

    return {
      matrixRows,
      classifiedList,
      kpi: {
        totalAll,
        totalTransacting,
        totalTransactingRate: totalAll > 0 ? Math.round((totalTransacting / totalAll) * 100) : 0,
        totalTransactingSales,
        totalTransactingCollections,
        totalNonTransacting,
        totalNonTransactingRate: totalAll > 0 ? Math.round((totalNonTransacting / totalAll) * 100) : 0,
        totalNonTransactingDebt,
        totalNonTransactingOverdue,
        totalEligible,
        totalEligibleRate: totalAll > 0 ? Math.round((totalEligible / totalAll) * 100) : 0,
        eligibleTransacting,
        eligibleNonTransacting,
        totalNetBalance: totalNetBalanceAll,
      }
    };
  }, [filteredCustomers, customerMetricsMap, customerOrdersLookup]);

  // Export Customer Dealing Report to Excel
  const handleExportCustomerDealingExcel = () => {
    if (customerDealingAnalytics.classifiedList.length === 0) return;

    const filteredToExport = customerDealingAnalytics.classifiedList.filter((item) => {
      if (dealingSegmentFilter !== 'ALL' && item.category !== dealingSegmentFilter) return false;
      if (dealingRepFilter !== 'ALL' && item.repName !== dealingRepFilter) return false;
      if (dealingSearch.trim()) {
        const q = dealingSearch.trim().toLowerCase();
        const n = (item.customer.name || '').toLowerCase();
        const c = (item.customer.code || '').toLowerCase();
        const s = (item.customer.storeName || '').toLowerCase();
        const p = (item.customer.phone || '');
        if (!n.includes(q) && !c.includes(q) && !s.includes(q) && !p.includes(q)) return false;
      }
      return true;
    });

    const rows = filteredToExport.map((item) => ({
      'كود العميل': item.customer.code || '---',
      'اسم العميل': item.customer.name,
      'اسم المحل': item.customer.storeName || '---',
      'الفرع': item.branchName,
      'المندوب': item.repName,
      'تصنيف التعامل': item.categoryLabel,
      'قابل للتعامل': item.eligibleLabel,
      'مبيعات 2026 (ج.م)': item.sales,
      'تحصيلات 2026 (ج.م)': item.collections,
      'الرصيد الحالي (ج.م)': item.debt,
      'المتأخرات (ج.م)': item.overdue,
      'الهاتف': item.customer.phone || '---',
      'العنوان / المنطقة': item.customer.address || item.customer.region || '---',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
      { wch: 22 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 15 },
      { wch: 25 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تصنيف العملاء Power BI');
    XLSX.writeFile(wb, `تقرير_تصنيف_العملاء_PowerBI_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

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
      const overdue = resolveCustomerDuesValue(c);
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
      notes: visitHasReturn && visitReturnDetails
        ? `${visitNotes}\n[تفاصيل المرتجع: ${visitReturnDetails}]`.trim()
        : visitNotes,
      branchName: currentUser.branchName || selectedCustomer.branchName || '',
      supervisorId: currentUser.supervisorId,
      // المرتجع — the supervisor is alerted until it reaches the warehouse.
      isReturn: visitHasReturn,
      returnValue: visitHasReturn ? (parseFloat(visitReturnValue) || 0) : undefined,
      returnReason: visitHasReturn ? visitReturnReason.trim() : undefined,
      returnItems: visitHasReturn ? visitReturnItems.trim() : undefined,
      returnStatus: visitHasReturn ? 'بانتظار المشرف' : undefined,
    });

    if (success) {
      // Refresh locally-selected customer so the dossier UI reflects the visit
      const refreshed = customers.find((c) => c.id === selectedCustomer.id) || selectedCustomer;
      setSelectedCustomer(refreshed);
      setVisitFormError(null);
    } else {
      // الخطأ كان بيروح في الكونسول بس (console.warn) والمستخدم مبيشوفش
      // حاجة — يعني لو منع الازدواج رفض الزيارة، المستخدم يفتكر إنها اتسجلت.
      // الرسالة دلوقتي ظاهرة جوه الفورم نفسه.
      setVisitFormError(message);
      console.warn('Failed to log visit:', message);
    }

    setIsLoggingVisit(false);
    setVisitNotes('');
    setVisitCollected('');
    setVisitHasReturn(false);
    setVisitReturnValue('');
    setVisitReturnReason('');
    setVisitReturnItems('');
    setVisitReturnDetails('');
  };

  // ===== تنبيهات المرتجع (Supervisor) =====
  // Every return logged by a rep shows up here until the supervisor confirms it
  // was handed to the warehouse keeper.
  const [returnNoteDraft, setReturnNoteDraft] = useState<Record<string, string>>({});

  const returnAlerts = useMemo<CustomerVisit[]>(() => {
    if (!isSupervisor && !isBranchManager && !isAdminOrDev) return [];
    return (getVisibleVisits ? getVisibleVisits() : []).filter((v) => v.isReturn);
  }, [isSupervisor, isBranchManager, isAdminOrDev, customers]);

  const pendingReturns = returnAlerts.filter((v) => v.returnStatus === 'بانتظار المشرف' || !v.returnStatus);
  const sentReturns = returnAlerts.filter((v) => v.returnStatus === 'تم الإرسال لأمين المخزن' || v.returnStatus === 'تم التحويل لأمين المخزن');
  const handledReturns = returnAlerts.filter((v) => v.returnStatus === 'تم الاستلام من أمين المخزن' || v.returnStatus === 'تم الاستلام بالمخزن');
  const pendingReturnValue = pendingReturns.reduce((a, v) => a + (Number(v.returnValue) || 0), 0);
  const sentReturnValue = sentReturns.reduce((a, v) => a + (Number(v.returnValue) || 0), 0);

  // Turn the free-text "الصنف × الكمية" lines into structured rows for the
  // supervisor card and the warehouse keeper's hand-off sheet.
  const parseReturnItems = (raw?: string): { name: string; qty: string }[] => {
    if (!raw) return [];
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s*[x×]\s*|\s{2,}|\s*\|\s*/);
        const name = (parts[0] || '').trim();
        const qty = (parts[1] || '').trim();
        return { name, qty };
      })
      .filter((r) => r.name);
  };

  const handleReturnHandover = (visit: CustomerVisit, nextStatus: 'تم التحويل لأمين المخزن' | 'تم الإرسال لأمين المخزن' | 'تم الاستلام من أمين المخزن') => {
    const roleLabel =
      currentUser?.role === 'branch_manager' ? 'مدير الفرع' :
      currentUser?.role === 'supervisor' ? 'مشرف المندوب' :
      currentUser?.role === 'admin' ? 'الإدارة' :
      currentUser?.role === 'developer' ? 'المطور' : 'المشرف';

    updateVisit({
      ...visit,
      returnStatus: nextStatus,
      returnHandledBy: `${currentUser?.name || 'المشرف'} (${roleLabel})`,
      returnHandledAt: new Date().toISOString(),
      returnHandledRole: currentUser?.role,
      returnNote: (returnNoteDraft[visit.id] || '').trim() || visit.returnNote || undefined,
    });
    setReturnNoteDraft((prev) => {
      const next = { ...prev };
      delete next[visit.id];
      return next;
    });
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
    if (sheetStatusFilter !== 'ALL') count++;
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
    selectedMonth, dealEligibilityFilter, sheetStatusFilter, dealtFilter, paymentTermsFilter,
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
    setSheetStatusFilter('ALL');
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
    clearColumnSort();
  };

  // Google Sheets Live Sync
  // Builds one workbook: a "نواقص أكتوبر" sheet grouped per rep, plus a
  // "متوفر بالفرع" sheet so the branch manager sees both sides of the same day.
  const handleExportDeficitsToExcel = () => {
    if (deficitByRep.length === 0) return;
    const { from, to } = deficitDateRange;
    const branchLabel = deficitScope.branchName || 'كل_الفروع';
    const rangeLabel = from === to ? from : `${from}_${to}`;

    const wb = XLSX.utils.book_new();

    const deficitRowsOut: any[][] = [
      ['الفرع', 'المشرف', 'المندوب', 'كود المنتج', 'الكود الموحد', 'اسم المنتج', 'اللون / الحجم', 'الكمية المطلوبة (نواقص)', 'قطع نواقص', 'رصيد الفرع', 'رصيد أكتوبر', 'الحالة', 'عدد الفواتير', 'أرقام الفواتير'],
    ];
    const branchRowsOut: any[][] = [
      ['الفرع', 'المندوب', 'كود المنتج', 'الكود الموحد', 'اسم المنتج', 'كراتين متوفر', 'قطع متوفر'],
    ];
    const invoiceRowsOut: any[][] = [
      ['رقم الفاتورة', 'التاريخ', 'الوقت', 'العميل', 'الفرع', 'المندوب', 'المشرف', 'حالة الرفع', 'تاريخ الرفع', 'نواقص (ك)', 'متوفر الفرع (ك)'],
    ];

    deficitByRep.forEach((rep) => {
      rep.deficitByProduct.forEach((p) => {
        deficitRowsOut.push([
          rep.branchName,
          rep.supervisorName || '',
          rep.repName,
          p.productCode,
          p.unifiedCode,
          p.productName,
          [p.color, p.size].filter(Boolean).join(' - '),
          p.cartons,
          p.pieces,
          p.stockBranch,
          p.stockOctober,
          p.stockOctober >= p.cartons ? 'يكفي' : `ناقص ${p.cartons - p.stockOctober}`,
          p.invoices.size,
          Array.from(p.invoices).join(' , '),
        ]);
      });
      rep.branchByProduct.forEach((p) => {
        branchRowsOut.push([rep.branchName, rep.repName, p.productCode, p.unifiedCode, p.productName, p.cartons, p.pieces]);
      });
    });

    deficitRows.forEach((r) => {
      invoiceRowsOut.push([
        r.invoice.invoiceNumber,
        r.invoice.date,
        r.invoice.time,
        r.invoice.customerName,
        r.branchName,
        r.repName,
        r.supervisorName || '',
        r.invoice.syncedToAccounting ? 'تم الرفع' : 'غير مرفوع',
        r.invoice.accountingSyncDate || '',
        r.deficitCartons,
        r.branchCartons,
      ]);
    });

    const money = (ws: XLSX.WorkSheet, width: number[]) => {
      ws['!cols'] = width.map((w) => ({ wch: w }));
    };
    const makeSheet = (rows: any[][], widths: number[]) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      money(ws, widths);
      return ws;
    };

    XLSX.utils.book_append_sheet(
      wb,
      makeSheet(deficitRowsOut, [18, 18, 18, 14, 14, 32, 16, 16, 11, 11, 12, 14, 12, 32]),
      'نواقص أكتوبر'
    );
    XLSX.utils.book_append_sheet(wb, makeSheet(branchRowsOut, [18, 18, 14, 14, 32, 13, 12]), 'متوفر بالفرع');
    XLSX.utils.book_append_sheet(wb, makeSheet(invoiceRowsOut, [16, 12, 10, 24, 18, 18, 18, 12, 18, 12, 14]), 'الفواتير');

    XLSX.writeFile(wb, `نواقص_أكتوبر_${branchLabel}_${rangeLabel}.xlsx`);
  };

  // Marks every invoice currently in the report as sent to the company system.
  const handleMarkDeficitsUploaded = async () => {
    const ids = deficitRows.map((r) => r.invoice.id);
    if (ids.length === 0) return;
    if (typeof syncToAccounting !== 'function') return;
    for (const id of ids) {
      // Sequential on purpose: each call writes its own sync log entry.
      // eslint-disable-next-line no-await-in-loop
      await syncToAccounting(id);
    }
  };

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
        const saved = await importCustomersList(result.customers, 'replace');
        setSyncStatus(
          saved.success
            ? { type: 'success', message: saved.message }
            : { type: 'error', message: saved.message }
        );
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
        const saved = await importCustomersList(result.customers, 'replace');
        setSyncStatus(
          saved.success
            ? { type: 'success', message: saved.message }
            : { type: 'error', message: saved.message }
        );
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Card 1: Total Debts */}
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white rounded-2xl p-4 border border-indigo-500/30 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-indigo-300 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-indigo-400" />
              <span>إجمالي المديونية (Total Debts)</span>
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
              <span>إجمالي المستحقات (Total Dues)</span>
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

        {/* Card 3: Total Collections (المحصل بالسالب كما بالشيت) */}
        <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 text-white rounded-2xl p-4 border border-emerald-500/30 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>إجمالي التحصيلات (Collections)</span>
            </span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold border border-emerald-400/30">
              كفاءة {selectedMonth === 'ALL' ? kpiStats.collectionRate : kpiStats.periodCollectionRate}%
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2 tracking-tight font-mono" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(selectedMonth === 'ALL' ? kpiStats.totalCollections2026 : kpiStats.totalPeriodCollections)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between flex-wrap gap-1">
            <span>
              {selectedMonth === 'ALL' ? 'إجمالي المحصل الفعلي' : `تحصيلات فترة ${selectedMonth}`}
            </span>
            <span className="text-emerald-300/90 text-[10px] font-bold">
              (إجمالي المحصل الفعلي لجميع العملاء)
            </span>
          </div>
        </div>

        {/* Card 4: 2026 Sales */}
        <div className="bg-gradient-to-br from-sky-950 via-slate-900 to-slate-950 text-white rounded-2xl p-4 border border-sky-500/30 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-sky-500 via-blue-500 to-teal-400"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-sky-300 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span>
                {selectedMonth === 'ALL'
                  ? 'مبيعات 2026'
                  : `مبيعات ${selectedMonth === 'Q1' ? 'الربع الأول Q1' : selectedMonth === 'Q2' ? 'الربع الثاني Q2' : selectedMonth === 'Q3' ? 'الربع الثالث Q3' : selectedMonth === 'Q4' ? 'الربع الرابع Q4' : `شهر ${selectedMonth}`}`}
              </span>
            </span>
            <span className="text-[10px] bg-sky-500/20 text-sky-200 px-2 py-0.5 rounded-full font-bold border border-sky-400/30">
              {kpiStats.salesGrowth >= 0 ? `+${kpiStats.salesGrowth}% نمو` : `${kpiStats.salesGrowth}%`}
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white mt-2 tracking-tight truncate font-mono" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(selectedMonth === 'ALL' ? kpiStats.totalSales2026 : kpiStats.totalPeriodSales)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between flex-wrap gap-1">
            <span>
              {selectedMonth === 'ALL' ? 'إجمالي المبيعات المحققة' : `المجمع السنوي: ${formatMoney(kpiStats.totalSales2026)}`}
            </span>
            <span className="text-sky-300 font-bold">مبيعات فعلية</span>
          </div>
        </div>

        {/* Card 5: Active Monthly Coverage Target */}
        <div className="bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 text-white rounded-2xl p-4 border border-violet-500/30 shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-violet-500 via-purple-500 to-violet-400"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-violet-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-violet-400" />
              <span>تغطية المتعاملين (Active Rate)</span>
            </span>
            <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full font-bold border border-violet-400/30">
              {selectedMonth === 'ALL' ? 'عام 2026' : `شهر ${selectedMonth}`}
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-violet-300 mt-2 tracking-tight">
            {kpiStats.activeFilteredCount.toLocaleString()}{' '}
            <span className="text-xs font-semibold text-slate-300">من {kpiStats.totalCount.toLocaleString()} عميل</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span className="text-violet-300 font-black">
              نسبة التغطية (من الإجمالي): {kpiStats.coverageRate}%
            </span>
          </div>
          {/* التصنيفات كما هي مكتوبة في عمود "قابل /غير" — الاسم بيتقرأ من الشيت نفسه،
              مش تركيبة من الكود، عشان ما ينسبش للعميل صفة مش مكتوبة */}
          <div className="mt-2.5 pt-2.5 border-t border-violet-400/20 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-300">{kpiStats.dealtEligibleLabel}</span>
              <span className="text-sm font-black text-emerald-300 font-mono">{kpiStats.dealtEligibleCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-sky-300">{kpiStats.idleEligibleLabel}</span>
              <span className="text-sm font-black text-sky-300 font-mono">{kpiStats.idleEligibleCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-300">{kpiStats.ineligibleLabel}</span>
              <span className="text-sm font-black text-rose-300 font-mono">{kpiStats.ineligibleCount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== نطاق البيانات: أرقام شخصية / فريق العمل / الفرع كله ===== */}
      {(isRep || isSupervisor || isBranchManager) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${
                isRep ? 'bg-sky-100' : isSupervisor ? 'bg-violet-100' : 'bg-emerald-100'
              }`}>
                👤
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-bold">أنت تشاهد</div>
                <div className="text-sm font-black text-slate-800">
                  {isRep
                    ? 'أرقامي الشخصية 👤'
                    : isSupervisor
                      ? `فريق العمل (${availableReps.length} مندوب)`
                      : `فرع ${currentUser?.branchName || 'الرئيسي'}`}
                </div>
              </div>
            </div>

            {isSupervisor && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-black text-violet-700">المندوب:</span>
                <button
                  type="button"
                  onClick={() => setSelectedRep('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer ${
                    selectedRep === 'ALL'
                      ? 'bg-violet-600 text-white shadow'
                      : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  كل الفريق
                </button>
                {availableReps.map((rep) => (
                  <button
                    key={rep}
                    type="button"
                    onClick={() => setSelectedRep(rep)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer ${
                      selectedRep === rep
                        ? 'bg-violet-600 text-white shadow'
                        : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {rep}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== ملخص نتائج الفلاتر — يتحدث لحظياً ===== */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-black text-slate-400">نتيجة الفلاتر:</span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-black">
              {filteredCustomers.length.toLocaleString()} عميل
            </span>
            {/* التصنيفات التلاتة كما هي في عمود "قابل /غير" — الأسماء من الشيت نفسه،
                والأرقام بتتجمع على إجمالي نتيجة الفلاتر */}
            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-black">
              ✅ {sheetStatusCounts.dealt_eligibleLabel}: {sheetStatusCounts.dealt_eligible.toLocaleString()}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-black">
              ⛔ {sheetStatusCounts.ineligibleLabel}: {sheetStatusCounts.ineligible.toLocaleString()}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-sky-100 text-sky-800 border border-sky-200 text-[11px] font-black">
              🟢 {sheetStatusCounts.idle_eligibleLabel}: {sheetStatusCounts.idle_eligible.toLocaleString()}
            </span>
          </div>
          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={handleResetAllSlicers}
              className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-black shadow transition cursor-pointer"
            >
              مسح كل الفلاتر ({activeFiltersCount})
            </button>
          )}
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
            {kpiStats.activeFilteredCount.toLocaleString()} متعامل ({kpiStats.coverageRate}%)
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
          <div className="text-[10px] text-[#107c41] font-extrabold mt-0.5 flex items-center justify-between flex-wrap gap-1">
            <span>{selectedMonth === 'ALL' ? kpiStats.collectionRate : kpiStats.periodCollectionRate}% نسبة التحصيل</span>
            <span className="text-slate-400 font-normal text-[9px] font-mono">
              (إجمالي المحصل الفعلي)
            </span>
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
              {canSeeDeficits && (
                <button
                  type="button"
                  onClick={() => setActiveChartTab('deficits')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                    activeChartTab === 'deficits'
                      ? 'bg-white text-orange-900 shadow-xs ring-1 ring-orange-300'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 text-orange-600" />
                  <span>📦 نواقص أكتوبر ({deficitTotals.deficitCartons} ك)</span>
                </button>
              )}
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
                onClick={() => setActiveChartTab('customer_dealing')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeChartTab === 'customer_dealing'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md ring-2 ring-emerald-300'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-950 border border-emerald-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>👥 تصنيف العملاء (متعامل / غير متعامل)</span>
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
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-bold">مقارنة حركة المبيعات والتحصيلات على مدار 12 شهراً لعام 2026:</span>
                <span className="text-[11px] font-bold text-slate-400">
                  التحصيلات معروضة بالقيمة المطلقة لوضوح المقارنة
                </span>
              </div>
              <div className="h-80 sm:h-96 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  {/* barCategoryGap separates the 12 month groups; barGap keeps the
                      sales and collections columns touching inside each group. */}
                  <BarChart
                    data={kpiStats.monthlyChartData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                    barCategoryGap="22%"
                    barGap={2}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#CBD5E1' }} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748B' }}
                      tickFormatter={(v) => (isPrivacyMode ? '•••' : `${(v / 1000).toFixed(0)}k`)}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(val: any) => formatMoney(Number(val) || 0)}
                      cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                      contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none', fontSize: 12 }}
                      labelStyle={{ color: '#94A3B8', fontWeight: 700, marginBottom: 4 }}
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload || !payload.length) return null;
                        const row = payload[0]?.payload || {};
                        const net = Number(row['صافي التحصيلات']) || 0;
                        return (
                          <div className="bg-slate-900 text-white rounded-xl px-3 py-2 text-xs shadow-xl" dir="rtl">
                            <div className="text-slate-400 font-bold mb-1">{label}</div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-sky-500 inline-block" />مبيعات</span>
                              <span className="font-black font-mono">{formatMoney(Number(row['مبيعات 2026']) || 0)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />تحصيلات</span>
                              <span className="font-black font-mono">{formatMoney(Number(row['تحصيلات 2026']) || 0)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 border-t border-white/10 mt-1 pt-1">
                              <span className="text-slate-400">الصافي بالإشارة</span>
                              <span className={`font-black font-mono ${net < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatMoney(net)}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                    <Bar dataKey="مبيعات 2026" name="مبيعات 2026" fill="#0284c7" radius={[4, 4, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="تحصيلات 2026" name="تحصيلات 2026" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tab 2: Branch Comparison (Admin/Developer only - excludes rep, supervisor, branch manager) */}
          {isAdminOrDev && activeChartTab === 'branches' && (
            <div className="space-y-4">
              {/* Executive Admin-Only Notice Banner */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-3.5 rounded-xl border border-indigo-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-amber-300 flex items-center gap-2">
                      <span>🏢 لوحة مقارنة الفروع الـ 7 الاستراتيجية (خاصة بالإدارة العامة فقط 🔒)</span>
                      <span className="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-full font-bold">
                        صلاحية Admin فقط
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      محجوبة تماماً عن مديري الفروع، مشرفي المناديب، والمناديب لضمان سرية المقارنات التنافسية للأداء بين الفروع.
                    </p>
                  </div>
                </div>
                <div className="text-xs text-slate-300 font-bold bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 whitespace-nowrap">
                  إجمالي الفروع النشطة: {branchAnalyticsData.length} فرع
                </div>
              </div>

              {/* Branch Comparison Bar Chart */}
              <div className="space-y-2 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-bold text-slate-700">مخطط مقارنة المبيعات والتحصيلات للفروع لعام 2026:</span>
                  <span className="text-[11px] text-slate-400">انقر على أي فرع لتصفيته بالسلايسر 🔍</span>
                </div>
                <div className="h-64 sm:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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

              {/* 7 Branches Executive Leaderboard Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="p-3 bg-slate-900 text-white flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <Building2 className="w-4 h-4 text-amber-400" />
                    <span>جدول الترتيب والمقارنة الشاملة للفروع الـ 7 (المالي والتنفيذي 2026):</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {branchAnalyticsData.length} فرع مسجل
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 whitespace-nowrap">
                      <tr>
                        <th className="p-2.5 text-center">الترتيب</th>
                        <th className="p-2.5">الفرع</th>
                        <th className="p-2.5 text-center">عدد العملاء</th>
                        <th className="p-2.5 text-left text-blue-700">مبيعات 2026</th>
                        <th className="p-2.5 text-left text-emerald-700">تحصيلات 2026</th>
                        <th className="p-2.5 text-center">نسبة التحصيل</th>
                        <th className="p-2.5 text-left text-purple-700">إجمالي المديونية</th>
                        <th className="p-2.5 text-left text-rose-700">المستحقات والمتأخرات</th>
                        <th className="p-2.5 text-center">حصة المبيعات %</th>
                        <th className="p-2.5 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(() => {
                        const totalAllBranchSales = branchAnalyticsData.reduce((acc, b) => acc + b.sales, 0) || 1;
                        return branchAnalyticsData.map((b, idx) => {
                          const salesShare = Math.round((b.sales / totalAllBranchSales) * 100);
                          const isCurrentFiltered = selectedBranch === b.branch;

                          return (
                            <tr key={b.branch} className={`hover:bg-slate-50 transition ${isCurrentFiltered ? 'bg-blue-50/60 font-bold' : ''}`}>
                              <td className="p-2.5 text-center font-black">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                                  idx === 0
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : idx === 1
                                    ? 'bg-slate-200 text-slate-800'
                                    : idx === 2
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {idx + 1}
                                </span>
                              </td>
                              <td className="p-2.5 font-black text-slate-900 whitespace-nowrap">
                                <span className="hover:text-blue-700 cursor-pointer" onClick={() => {
                                  setSelectedBranch(b.branch);
                                  setSelectedRep('ALL');
                                  setSelectedCustomerId('ALL');
                                }}>
                                  {b.branch}
                                </span>
                              </td>
                              <td className="p-2.5 text-center font-bold text-slate-700">
                                {b.customers.toLocaleString()}
                              </td>
                              <td className="p-2.5 text-left font-mono font-black text-blue-700 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                                {formatMoney(b.sales)}
                              </td>
                              <td className="p-2.5 text-left font-mono font-black text-emerald-700 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                                {formatMoney(b.collections)}
                              </td>
                              <td className="p-2.5 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-black ${
                                  b.collectionRate >= 70
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : b.collectionRate >= 40
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {b.collectionRate}%
                                </span>
                              </td>
                              <td className="p-2.5 text-left font-mono font-bold text-purple-900 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                                {formatMoney(b.debt)}
                              </td>
                              <td className="p-2.5 text-left font-mono font-bold text-rose-700 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                                {formatMoney(b.overdue)}
                              </td>
                              <td className="p-2.5 text-center font-black text-indigo-700">
                                {salesShare}%
                              </td>
                              <td className="p-2.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBranch(isCurrentFiltered ? 'ALL' : b.branch);
                                    setSelectedRep('ALL');
                                    setSelectedCustomerId('ALL');
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                    isCurrentFiltered
                                      ? 'bg-blue-600 text-white shadow-xs'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  {isCurrentFiltered ? '✓ مصفى به' : 'تصفية 🔍'}
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
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
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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
                      <th className="p-2.5 text-center text-sky-300">غير متعامل ⏳</th>
                      <th className="p-2.5 text-center text-emerald-300">متعامل ✅</th>
                      <th className="p-2.5 text-center text-amber-300">نسبة التغطية %</th>
                      <th className="p-2.5 text-left text-purple-300">إجمالي المديونية</th>
                      <th className="p-2.5 text-left text-rose-300">إجمالي المستحقات</th>
                      <th className="p-2.5 text-left text-sky-300">مبيعات 2026</th>
                      <th className="p-2.5 text-left text-emerald-300">تحصيلات 2026</th>
                      <th className="p-2.5 text-left text-cyan-300">الرصيد الصافي</th>
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
                        <td className="p-2.5 text-center font-bold text-sky-700">
                          {row.nonDealtCustomers.toLocaleString()}
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
                        <td className="p-2.5 text-left font-mono font-black text-cyan-800 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                          {formatMoney(row.netBalance)}
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-700">
                          {row.collectionRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-black border-t-2 border-slate-300">
                    <tr>
                      <td className="p-2.5">الإجمالي الشامل</td>
                      <td className="p-2.5 text-indigo-950 font-black">جميع المناديب ({repAndBranchSummary.length})</td>
                      <td className="p-2.5 text-center font-mono font-black">{repAndBranchSummary.reduce((acc, r) => acc + r.totalCustomers, 0).toLocaleString()}</td>
                      <td className="p-2.5 text-center font-mono font-bold text-sky-700">{repAndBranchSummary.reduce((acc, r) => acc + r.nonDealtCustomers, 0).toLocaleString()}</td>
                      <td className="p-2.5 text-center font-mono font-black text-emerald-700">{repAndBranchSummary.reduce((acc, r) => acc + r.dealtCustomers, 0).toLocaleString()}</td>
                      <td className="p-2.5 text-center font-mono font-black text-amber-700">
                        {(() => {
                          const totCust = repAndBranchSummary.reduce((acc, r) => acc + r.totalCustomers, 0);
                          const totDealt = repAndBranchSummary.reduce((acc, r) => acc + r.dealtCustomers, 0);
                          return totCust > 0 ? Math.round((totDealt / totCust) * 100) : 0;
                        })()}%
                      </td>
                      <td className="p-2.5 text-left font-mono font-black text-purple-900">{formatMoney(repAndBranchSummary.reduce((acc, r) => acc + r.totalDebt, 0))}</td>
                      <td className="p-2.5 text-left font-mono font-black text-rose-700">{formatMoney(repAndBranchSummary.reduce((acc, r) => acc + r.totalOverdue, 0))}</td>
                      <td className="p-2.5 text-left font-mono font-black text-slate-900">{formatMoney(repAndBranchSummary.reduce((acc, r) => acc + r.totalSales, 0))}</td>
                      <td className="p-2.5 text-left font-mono font-black text-emerald-700">{formatMoney(repAndBranchSummary.reduce((acc, r) => acc + r.totalCollections, 0))}</td>
                      <td className="p-2.5 text-left font-mono font-black text-cyan-800">{formatMoney(repAndBranchSummary.reduce((acc, r) => acc + r.netBalance, 0))}</td>
                      <td className="p-2.5 text-center font-mono font-black text-slate-800">
                        {(() => {
                          const totSales = repAndBranchSummary.reduce((acc, r) => acc + r.totalSales, 0);
                          const totCols = repAndBranchSummary.reduce((acc, r) => acc + r.totalCollections, 0);
                          return totSales > 0 ? Math.round((Math.abs(totCols) / totSales) * 100) : 0;
                        })()}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Customer Dealing Analytics (Power BI - متعاملين / غير متعاملين / قابلين للتعامل بالمندوب والفرع) */}
          {activeChartTab === 'customer_dealing' && (
            <div className="space-y-4">
              {/* Security & Strict RBAC Isolation Banner */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-3.5 rounded-2xl border border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-white">نظام الخصوصية والأمان الصارم (Power BI RBAC):</span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {isRep
                          ? `مندوب مبيعات: ${currentUser?.name}`
                          : isSupervisor
                          ? `مشرف مناديب: ${currentUser?.branchName}`
                          : isBranchManager
                          ? `مدير فرع: ${currentUser?.branchName}`
                          : 'إدارة عامة وتنفيذية (Admin / CEO)'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      {isRep
                        ? `تشاهد حصرياً عملاءك وأرقامك الخاصة بك كمندوب (${currentUser?.name}) بفرع (${currentUser?.branchName}). محجوب تماماً عن أي مندوب آخر أو فرع آخر لحفظ السرية.`
                        : isSupervisor
                        ? `تشاهد فقط المناديب التابعين لإشرافك في فرع (${currentUser?.branchName}). محجوب عن أي فروع أخرى.`
                        : isBranchManager
                        ? `تشاهد فقط إحصاءات ومناديب فرع (${currentUser?.branchName}). محجوب عن بيانات الفروع الـ 6 الأخرى.`
                        : 'عرض تحليلي شامل لكافة فروع الشركة الـ 7 والمناديب مع إمكانية الفلترة والمقارنة.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={handleExportCustomerDealingExcel}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer shadow-xs border border-emerald-400"
                    title="تصدير هذا التقرير التفصيلي إلى ملف Excel"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير Excel 📊</span>
                  </button>
                </div>
              </div>

              {/* Power BI Interactive KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {/* Total Customers */}
                <div
                  onClick={() => setDealingSegmentFilter('ALL')}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer ${
                    dealingSegmentFilter === 'ALL'
                      ? 'bg-gradient-to-br from-slate-900 to-slate-800 text-white border-slate-700 ring-2 ring-slate-400 shadow-md'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold opacity-80">إجمالي قاعدة العملاء</span>
                    <Users className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-2xl font-black font-mono">
                    {customerDealingAnalytics.kpi.totalAll.toLocaleString()}
                  </div>
                  <div className="text-[11px] font-bold mt-1 text-blue-400 flex items-center justify-between">
                    <span>نسبة المحفظة: 100%</span>
                    <span>(الكل)</span>
                  </div>
                </div>

                {/* Transacting (Active) */}
                <div
                  onClick={() => setDealingSegmentFilter('transacting')}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer ${
                    dealingSegmentFilter === 'transacting'
                      ? 'bg-gradient-to-br from-emerald-950 to-teal-900 text-white border-emerald-500 ring-2 ring-emerald-400 shadow-md'
                      : 'bg-emerald-50/70 text-emerald-950 border-emerald-200 hover:border-emerald-300 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-emerald-800">🟢 العملاء المتعاملون (Active)</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono text-emerald-900">
                      {customerDealingAnalytics.kpi.totalTransacting.toLocaleString()}
                    </span>
                    <span className="text-xs font-black px-1.5 py-0.5 rounded-md bg-emerald-200 text-emerald-900">
                      {customerDealingAnalytics.kpi.totalTransactingRate}% تفعيل
                    </span>
                  </div>
                  <div className="text-[11px] font-mono font-bold mt-1 text-emerald-700 flex items-center justify-between">
                    <span>مبيعات: {formatMoney(customerDealingAnalytics.kpi.totalTransactingSales)}</span>
                  </div>
                </div>

                {/* Non-Transacting (Dormant) */}
                <div
                  onClick={() => setDealingSegmentFilter('non_transacting')}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer ${
                    dealingSegmentFilter === 'non_transacting'
                      ? 'bg-gradient-to-br from-rose-950 to-red-900 text-white border-rose-500 ring-2 ring-rose-400 shadow-md'
                      : 'bg-rose-50/70 text-rose-950 border-rose-200 hover:border-rose-300 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-rose-800">🔴 غير المتعاملين (راكد/مديونية)</span>
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono text-rose-900">
                      {customerDealingAnalytics.kpi.totalNonTransacting.toLocaleString()}
                    </span>
                    <span className="text-xs font-black px-1.5 py-0.5 rounded-md bg-rose-200 text-rose-900">
                      {customerDealingAnalytics.kpi.totalNonTransactingRate}% ركود
                    </span>
                  </div>
                  <div className="text-[11px] font-mono font-bold mt-1 text-rose-700 flex items-center justify-between">
                    <span>مديونية معلقة: {formatMoney(customerDealingAnalytics.kpi.totalNonTransactingDebt)}</span>
                  </div>
                </div>

                {/* Eligible for Dealing (القابلون للتعامل) — the third axis, taken
                    from the sheet's قابل / غير column. A customer can be eligible
                    without having traded yet, so this is not the same as either
                    card next to it. */}
                <div
                  onClick={() => setDealingSegmentFilter('ALL')}
                  className="p-3.5 rounded-2xl border bg-sky-50/70 text-sky-950 border-sky-200 hover:border-sky-300 shadow-2xs transition cursor-pointer"
                  title="العملاء القابلون للتعامل حسب عمود قابل / غير في الشيت"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-sky-800">🔵 القابلون للتعامل</span>
                    <ShieldCheck className="w-4 h-4 text-sky-600" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono text-sky-900">
                      {customerDealingAnalytics.kpi.totalEligible.toLocaleString()}
                    </span>
                    <span className="text-xs font-black px-1.5 py-0.5 rounded-md bg-sky-200 text-sky-900">
                      {customerDealingAnalytics.kpi.totalEligibleRate}% من القاعدة
                    </span>
                  </div>
                  <div className="text-[11px] font-mono font-bold mt-1 text-sky-700 flex items-center justify-between gap-2">
                    <span>🟢 منهم متعامل: {customerDealingAnalytics.kpi.eligibleTransacting.toLocaleString()}</span>
                    <span>⚪ غير متعامل: {customerDealingAnalytics.kpi.eligibleNonTransacting.toLocaleString()}</span>
                  </div>
                </div>

                {/* Non-eligible (غير القابلين للتعامل) — completes the picture */}
                <div
                  onClick={() => setDealingSegmentFilter('ALL')}
                  className="p-3.5 rounded-2xl border bg-slate-100/80 text-slate-900 border-slate-300 hover:border-slate-400 shadow-2xs transition cursor-pointer"
                  title="العملاء غير القابلين للتعامل حسب عمود قابل / غير في الشيت"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-slate-700">⛔ غير القابلين للتعامل</span>
                    <Ban className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black font-mono text-slate-800">
                      {(customerDealingAnalytics.kpi.totalAll - customerDealingAnalytics.kpi.totalEligible).toLocaleString()}
                    </span>
                    <span className="text-xs font-black px-1.5 py-0.5 rounded-md bg-slate-300 text-slate-900">
                      {customerDealingAnalytics.kpi.totalAll > 0
                        ? Math.round(((customerDealingAnalytics.kpi.totalAll - customerDealingAnalytics.kpi.totalEligible) / customerDealingAnalytics.kpi.totalAll) * 100)
                        : 0}
                      % من القاعدة
                    </span>
                  </div>
                  <div className="text-[11px] font-mono font-bold mt-1 text-slate-600 flex items-center justify-between gap-2">
                    <span>غير قابل للتعامل غير متعامل: {(customerDealingAnalytics.kpi.totalNonTransacting - customerDealingAnalytics.kpi.eligibleNonTransacting).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Power BI Breakdown Matrix Table (بالمندوب والفرع) */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                    <h3 className="text-xs font-black text-slate-800">
                      جدول Power BI التحليلي لتصنيف العملاء بالمندوب والفرع (المتعاملين / غير المتعاملين):
                    </h3>
                  </div>
                  <div className="text-[11px] font-bold text-slate-500">
                    إجمالي الصفوف: {customerDealingAnalytics.matrixRows.length} صف
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs bg-white">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-slate-100 font-extrabold border-b border-slate-800 whitespace-nowrap">
                        {!isRep && <th className="p-2.5">الفرع</th>}
                        <th className="p-2.5">المندوب</th>
                        <th className="p-2.5 text-center">إجمالي العملاء</th>
                        <th className="p-2.5 text-center text-emerald-300">🟢 متعاملين</th>
                        <th className="p-2.5 text-center text-emerald-300">% التفعيل</th>
                        <th className="p-2.5 text-left text-emerald-300">مبيعات 2026</th>
                        <th className="p-2.5 text-left text-emerald-300">تحصيلات 2026</th>
                        <th className="p-2.5 text-left text-cyan-300">الرصيد الصافي</th>
                        <th className="p-2.5 text-center text-sky-300">🔵 قابل للتعامل</th>
                        <th className="p-2.5 text-center text-slate-300">⛔ غير قابل</th>
                        <th className="p-2.5 text-center text-rose-300">🔴 غير متعاملين</th>
                        <th className="p-2.5 text-center text-rose-300">% الركود</th>
                        <th className="p-2.5 text-left text-rose-300">مديونية راكدة</th>
                        <th className="p-2.5 text-center">تقييم التفعيل</th>
                        <th className="p-2.5 text-center">تصفية سريعة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerDealingAnalytics.matrixRows.map((row, idx) => {
                        const activeRating =
                          row.transactingRate >= 65
                            ? { label: 'ممتاز 🟢', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300' }
                            : row.transactingRate >= 40
                            ? { label: 'جيد 🟡', bg: 'bg-amber-100 text-amber-900 border-amber-300' }
                            : { label: 'بحاجة تنشيط 🔴', bg: 'bg-rose-100 text-rose-900 border-rose-300' };

                        return (
                          <tr key={`${row.branchName}-${row.repName}-${idx}`} className="hover:bg-slate-50/80 transition">
                            {!isRep && (
                              <td className="p-2.5 font-bold text-slate-800 whitespace-nowrap">
                                {row.branchName}
                              </td>
                            )}
                            <td className="p-2.5 font-black text-indigo-900 whitespace-nowrap">
                              {row.repName}
                            </td>
                            <td className="p-2.5 text-center font-bold text-slate-900">
                              {row.total.toLocaleString()}
                            </td>

                            {/* Transacting */}
                            <td className="p-2.5 text-center font-black text-emerald-700">
                              {row.transactingCount.toLocaleString()}
                            </td>
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="font-bold text-emerald-800">{row.transactingRate}%</span>
                                <div className="w-12 h-2 rounded-full bg-slate-100 overflow-hidden shrink-0">
                                  <div
                                    className="h-full bg-emerald-500 rounded-full"
                                    style={{ width: `${Math.min(100, row.transactingRate)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="p-2.5 text-left font-mono font-bold text-slate-900 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                              {formatMoney(row.transactingSales)}
                            </td>
                            <td className="p-2.5 text-left font-mono font-bold text-emerald-700 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                              {formatMoney(row.transactingCollections)}
                            </td>
                            <td className="p-2.5 text-left font-mono font-black text-cyan-800 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                              {formatMoney(row.netBalance)}
                            </td>

                            {/* Eligible / Non-eligible (from the sheet's قابل / غير column) */}
                            <td className="p-2.5 text-center font-black text-sky-700">
                              {row.eligibleCount.toLocaleString()}
                            </td>
                            <td className="p-2.5 text-center font-black text-slate-600">
                              {(row.total - row.eligibleCount).toLocaleString()}
                            </td>

                            {/* Non-Transacting */}
                            <td className="p-2.5 text-center font-black text-rose-700">
                              {row.nonTransactingCount.toLocaleString()}
                            </td>
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="font-bold text-rose-800">{row.nonTransactingRate}%</span>
                                <div className="w-12 h-2 rounded-full bg-slate-100 overflow-hidden shrink-0">
                                  <div
                                    className="h-full bg-rose-500 rounded-full"
                                    style={{ width: `${Math.min(100, row.nonTransactingRate)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="p-2.5 text-left font-mono font-bold text-rose-700 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                              {formatMoney(row.nonTransactingDebt)}
                            </td>

                            {/* Active Rating */}
                            <td className="p-2.5 text-center whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${activeRating.bg}`}>
                                {activeRating.label}
                              </span>
                            </td>

                            {/* Filter action */}
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setDealingRepFilter(dealingRepFilter === row.repName ? 'ALL' : row.repName);
                                }}
                                className={`px-2 py-1 rounded-lg text-[10px] font-black transition cursor-pointer border ${
                                  dealingRepFilter === row.repName
                                    ? 'bg-indigo-600 text-white border-indigo-700'
                                    : 'bg-slate-50 text-indigo-700 hover:bg-indigo-50 border-slate-200'
                                }`}
                              >
                                {dealingRepFilter === row.repName ? 'إلغاء الفلتر ✕' : 'عرض عملائه 🔍'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-black border-t-2 border-slate-300">
                      <tr>
                        {!isRep && <td className="p-2.5">الإجمالي الشامل</td>}
                        <td className="p-2.5 text-indigo-950 font-black">جميع المناديب ({customerDealingAnalytics.matrixRows.length})</td>
                        <td className="p-2.5 text-center font-mono font-black">{customerDealingAnalytics.kpi.totalAll.toLocaleString()}</td>
                        <td className="p-2.5 text-center text-emerald-800 font-mono font-black">{customerDealingAnalytics.kpi.totalTransacting.toLocaleString()}</td>
                        <td className="p-2.5 text-center text-emerald-800 font-mono font-black">{customerDealingAnalytics.kpi.totalTransactingRate}%</td>
                        <td className="p-2.5 text-left font-mono font-black text-slate-900">{formatMoney(customerDealingAnalytics.kpi.totalTransactingSales)}</td>
                        <td className="p-2.5 text-left font-mono font-black text-emerald-800">{formatMoney(customerDealingAnalytics.kpi.totalTransactingCollections)}</td>
                        <td className="p-2.5 text-left font-mono font-black text-cyan-800">{formatMoney(customerDealingAnalytics.kpi.totalTransactingSales - customerDealingAnalytics.kpi.totalTransactingCollections)}</td>
                        <td className="p-2.5 text-center text-sky-800 font-mono font-black">{customerDealingAnalytics.kpi.totalEligible.toLocaleString()}</td>
                        <td className="p-2.5 text-center text-slate-600 font-mono font-black">{(customerDealingAnalytics.kpi.totalAll - customerDealingAnalytics.kpi.totalEligible).toLocaleString()}</td>
                        <td className="p-2.5 text-center text-rose-800 font-mono font-black">{customerDealingAnalytics.kpi.totalNonTransacting.toLocaleString()}</td>
                        <td className="p-2.5 text-center text-rose-800 font-mono font-black">{customerDealingAnalytics.kpi.totalNonTransactingRate}%</td>
                        <td className="p-2.5 text-left font-mono font-black text-rose-800">{formatMoney(customerDealingAnalytics.kpi.totalNonTransactingDebt)}</td>
                        <td className="p-2.5 text-center text-slate-600">-</td>
                        <td className="p-2.5 text-center text-slate-600">-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Customer Drilldown Segment Table */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-black text-slate-900">
                      قائمة عملاء التنشيط والمتابعة الميدانية التفصيلية:
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      اضغط على أي عميل لفتح ملفه الشامل، جدولة زيارة فورية، أو تحرير طلبية
                    </p>
                  </div>

                  {/* Slicer Tabs for Segment */}
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl flex-wrap">
                    <button
                      type="button"
                      onClick={() => setDealingSegmentFilter('ALL')}
                      className={`px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                        dealingSegmentFilter === 'ALL'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      الكل ({customerDealingAnalytics.kpi.totalAll})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDealingSegmentFilter('transacting')}
                      className={`px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                        dealingSegmentFilter === 'transacting'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-emerald-800 hover:text-emerald-950'
                      }`}
                    >
                      🟢 المتعاملون ({customerDealingAnalytics.kpi.totalTransacting})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDealingSegmentFilter('non_transacting')}
                      className={`px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer ${
                        dealingSegmentFilter === 'non_transacting'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-rose-800 hover:text-rose-950'
                      }`}
                    >
                      🔴 غير المتعاملين ({customerDealingAnalytics.kpi.totalNonTransacting})
                    </button>
                  </div>
                </div>

                {/* Search & Rep Filter Filter Bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="بحث باسم العميل، الكود، المحل، الهاتف..."
                      value={dealingSearch}
                      onChange={(e) => setDealingSearch(e.target.value)}
                      className="w-full pr-8 pl-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
                    />
                  </div>
                  {dealingRepFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-black">
                      <span>المندوب: {dealingRepFilter}</span>
                      <button
                        type="button"
                        onClick={() => setDealingRepFilter('ALL')}
                        className="text-indigo-600 hover:text-indigo-900 cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>

                {/* Customer List Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 whitespace-nowrap">
                        <th className="p-2.5">العميل والمحل</th>
                        {!isRep && <th className="p-2.5">الفرع</th>}
                        <th className="p-2.5">المندوب</th>
                        <th className="p-2.5 text-center">تصنيف التعامل</th>
                        <th className="p-2.5 text-left">مبيعات 2026</th>
                        <th className="p-2.5 text-left">تحصيلات 2026</th>
                        <th className="p-2.5 text-left">الرصيد الحالي</th>
                        <th className="p-2.5 text-left">المتأخرات</th>
                        <th className="p-2.5 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerDealingAnalytics.classifiedList
                        .filter((item) => {
                          if (dealingSegmentFilter !== 'ALL' && item.category !== dealingSegmentFilter) return false;
                          if (dealingRepFilter !== 'ALL' && item.repName !== dealingRepFilter) return false;
                          if (dealingSearch.trim()) {
                            const q = dealingSearch.trim().toLowerCase();
                            const n = (item.customer.name || '').toLowerCase();
                            const c = (item.customer.code || '').toLowerCase();
                            const s = (item.customer.storeName || '').toLowerCase();
                            const p = item.customer.phone || '';
                            if (!n.includes(q) && !c.includes(q) && !s.includes(q) && !p.includes(q)) return false;
                          }
                          return true;
                        })
                        .slice(0, 50)
                        .map((item) => {
                          return (
                            <tr
                              key={item.customer.id}
                              onClick={() => setSelectedCustomer(item.customer)}
                              className="hover:bg-slate-50 cursor-pointer transition"
                            >
                              <td className="p-2.5">
                                <div className="font-bold text-slate-900">{item.customer.name}</div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  كود: {item.customer.code || '---'} {item.customer.storeName && `• ${item.customer.storeName}`}
                                </div>
                              </td>
                              {!isRep && (
                                <td className="p-2.5 text-slate-700 whitespace-nowrap">{item.branchName}</td>
                              )}
                              <td className="p-2.5 font-bold text-indigo-900 whitespace-nowrap">{item.repName}</td>
                              <td className="p-2.5 text-center whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    item.category === 'transacting'
                                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                      : item.category === 'non_transacting'
                                      ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                      : 'bg-sky-100 text-sky-900 border border-sky-300'
                                  }`}
                                >
                                  {item.categoryLabel}
                                </span>
                              </td>
                              <td className="p-2.5 text-left font-mono font-bold text-slate-800 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                                {formatMoney(item.sales)}
                              </td>
                              <td className="p-2.5 text-left font-mono font-bold text-emerald-700 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                                {formatMoney(item.collections)}
                              </td>
                              <td className="p-2.5 text-left font-mono font-bold text-purple-900 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                                {formatMoney(item.debt)}
                              </td>
                              <td className="p-2.5 text-left font-mono font-bold text-rose-700 whitespace-nowrap" title={isPrivacyMode ? 'مخفي' : undefined}>
                                {formatMoney(item.overdue)}
                              </td>
                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1">
                                  {onOpenNewOrderForCustomer && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenNewOrderForCustomer(item.customer)}
                                      className="p-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                                      title="إنشاء طلبية جديدة"
                                    >
                                      🛒
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedCustomer(item.customer)}
                                    className="p-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                                    title="عرض الملف والتفاصيل"
                                  >
                                    👁️
                                  </button>
                                </div>
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

          {/* Tab 4: Payment Terms & Guarantees Breakdown (Admin/Developer only) */}
          {isAdminOrDev && activeChartTab === 'payment_guarantee' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="h-60 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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
                    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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
                    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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
          {canSeeDeficits && activeChartTab === 'deficits' && (
            <div className="space-y-4">
              {/* Header + actions */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">نواقص أكتوبر — ما لم يتوفر بالفرع</h3>
                    <p className="text-[11px] text-slate-500 font-bold">
                      {deficitScope.branchName ? `فرع ${deficitScope.branchName}` : 'كل الفروع'} · {deficitByRep.length} مندوب · {deficitTotals.invoices} فاتورة
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExportDeficitsToExcel}
                    disabled={deficitByRep.length === 0}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black shadow transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>تصدير Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkDeficitsUploaded}
                    disabled={deficitRows.length === 0 || typeof syncToAccounting !== 'function'}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black shadow transition cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تم الرفع على السيستم ({deficitRows.length})</span>
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-[10.5px] font-black text-slate-500 mb-1">الفترة الزمنية</label>
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                      {(
                        [
                          { key: 'today', label: 'اليوم' },
                          { key: 'date', label: 'يوم محدد' },
                          { key: 'range', label: 'نطاق' },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setDeficitDateMode(m.key)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition cursor-pointer ${
                            deficitDateMode === m.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {deficitDateMode === 'date' && (
                    <input
                      type="date"
                      value={deficitSingleDate}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setDeficitSingleDate(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                    />
                  )}
                  {deficitDateMode === 'range' && (
                    <>
                      <input
                        type="date"
                        value={deficitFromDate}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setDeficitFromDate(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                      />
                      <span className="text-slate-400 text-xs font-black">←</span>
                      <input
                        type="date"
                        value={deficitToDate}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setDeficitToDate(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                      />
                    </>
                  )}

                  <div>
                    <label className="block text-[10.5px] font-black text-slate-500 mb-1">حالة الرفع</label>
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                      {(
                        [
                          { key: 'pending', label: 'غير مرفوع ⏳' },
                          { key: 'uploaded', label: 'تم الرفع 🟢' },
                          { key: 'all', label: 'الكل' },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setDeficitStatus(m.key)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition cursor-pointer ${
                            deficitStatus === m.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {(
                  [
                    { label: 'نواقص أكتوبر (كراتين)', value: deficitTotals.deficitCartons, sub: `${deficitTotals.deficitPieces} قطعة`, tone: 'text-orange-600' },
                    { label: 'متوفر بالفرع (كراتين)', value: deficitTotals.branchCartons, sub: `${deficitTotals.branchPieces} قطعة`, tone: 'text-emerald-600' },
                    { label: 'عدد الفواتير', value: deficitTotals.invoices, sub: `${deficitByRep.length} مندوب`, tone: 'text-slate-900' },
                    { label: 'نسبة النواقص', value: (() => { const t = deficitTotals.deficitCartons + deficitTotals.branchCartons; return t > 0 ? Math.round((deficitTotals.deficitCartons / t) * 100) : 0; })(), sub: '% من الكمية', tone: 'text-rose-600' },
                  ] as const
                ).map((c) => (
                  <div key={c.label} className="bg-white rounded-2xl p-3.5 border border-slate-200 border-t-4 border-t-slate-300 shadow-xs">
                    <div className="text-[11px] font-bold text-slate-500">{c.label}</div>
                    <div className={`text-2xl font-black font-mono mt-1 ${c.tone}`}>{c.value.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400 font-bold mt-0.5">{c.sub}</div>
                  </div>
                ))}
              </div>

              {/* Per rep */}
              {deficitByRep.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-slate-200">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <p className="text-sm font-black text-slate-700 mt-2">لا توجد نواقص في الفترة المختارة</p>
                  <p className="text-[11px] text-slate-400 font-bold mt-1">كل الأصناف متوفرة بالفرع أو تم رفعها بالفعل</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {deficitByRep.map((rep) => {
                    const isOpen = expandedDeficitRep === rep.repName;
                    return (
                      <div key={rep.repName} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedDeficitRep(isOpen ? null : rep.repName)}
                          className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition cursor-pointer text-right"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                              <UserCheck className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-black text-slate-900 truncate">{rep.repName}</div>
                              <div className="text-[10.5px] text-slate-500 font-bold truncate">
                                {rep.branchName}
                                {rep.supervisorName ? ` · تحت إشراف ${rep.supervisorName}` : ''} · {rep.invoiceIds.length} فاتورة
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2.5 py-1 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 text-[11px] font-black">
                              نواقص {rep.deficitCartons} ك
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-black">
                              متوفر {rep.branchCartons} ك
                            </span>
                            <span className={`text-slate-400 transition ${isOpen ? 'rotate-90' : ''}`}>
                              <ArrowUpDown className="w-4 h-4" />
                            </span>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="border-t border-slate-100 p-3.5 space-y-4">
                            {/* deficits table */}
                            <div>
                              <div className="text-[11px] font-black text-orange-700 mb-1.5">نواقص مخزن أكتوبر</div>
                              <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
                                <table className="w-full text-[11px] text-right border-collapse">
                                  <thead>
                                    <tr className="bg-slate-100 text-slate-600 font-black sticky top-0">
                                      <th className="p-2">كود المنتج</th>
                                      <th className="p-2">الكود الموحد</th>
                                      <th className="p-2">الصنف / اللون</th>
                                      <th className="p-2 text-center bg-orange-50">المطلوب</th>
                                      <th className="p-2 text-center bg-emerald-50">رصيد الفرع</th>
                                      <th className="p-2 text-center bg-sky-50">رصيد أكتوبر</th>
                                      <th className="p-2 text-center">الحالة</th>
                                      <th className="p-2 text-center">فواتير</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {Array.from(rep.deficitByProduct.values()).map((p, i) => {
                                      const canCover = p.stockOctober >= p.cartons;
                                      return (
                                        <tr key={i} className="even:bg-slate-50/70 hover:bg-slate-100">
                                          <td className="p-2 font-mono text-slate-600">{p.productCode}</td>
                                          <td className="p-2 font-mono font-black text-slate-800">{p.unifiedCode}</td>
                                          <td className="p-2 font-bold text-slate-800">
                                            <div>{p.productName}</div>
                                            {(p.color || p.size) && (
                                              <div className="text-[9.5px] font-bold text-slate-400">
                                                {[p.color, p.size].filter(Boolean).join(' • ')}
                                              </div>
                                            )}
                                          </td>
                                          <td className="p-2 text-center">
                                            <div className="font-mono font-black text-orange-700">{p.cartons} ك</div>
                                            {p.pieces > 0 && <div className="text-[9.5px] font-bold text-slate-500">{p.pieces} قطعة</div>}
                                          </td>
                                          <td className="p-2 text-center font-mono font-black text-emerald-700">
                                            {p.stockBranch}
                                          </td>
                                          <td className="p-2 text-center font-mono font-black text-sky-700">
                                            {p.stockOctober}
                                          </td>
                                          <td className="p-2 text-center">
                                            {canCover ? (
                                              <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9.5px] font-black">يكفي</span>
                                            ) : (
                                              <span className="inline-block px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9.5px] font-black">
                                                ناقص {p.cartons - p.stockOctober}
                                              </span>
                                            )}
                                          </td>
                                          <td className="p-2 text-center text-[9.5px] font-bold text-slate-500">{Array.from(p.invoices).join(' , ')}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot className="bg-slate-100 font-black border-t border-slate-300">
                                    <tr>
                                      <td className="p-2" colSpan={3}>الإجمالي</td>
                                      <td className="p-2 text-center font-mono text-orange-700">
                                        {rep.deficitCartons} ك{rep.deficitPieces > 0 ? ` / ${rep.deficitPieces} قطعة` : ''}
                                      </td>
                                      <td className="p-2 text-center font-mono text-emerald-700">{rep.branchCartons}</td>
                                      <td className="p-2 text-center font-mono text-sky-700">
                                        {Array.from(rep.deficitByProduct.values()).reduce((n, x) => n + x.stockOctober, 0)}
                                      </td>
                                      <td className="p-2" colSpan={2} />
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>

                            {/* branch-available table */}
                            {rep.branchByProduct.size > 0 && (
                              <div>
                                <div className="text-[11px] font-black text-emerald-700 mb-1.5">متوفر بالفرع (جاهز للتسليم)</div>
                                <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
                                  <table className="w-full text-[11px] text-right border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100 text-slate-600 font-black sticky top-0">
                                        <th className="p-2">كود المنتج</th>
                                        <th className="p-2">الكود الموحد</th>
                                        <th className="p-2">الصنف</th>
                                        <th className="p-2 text-center">كراتين</th>
                                        <th className="p-2 text-center">قطع</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {Array.from(rep.branchByProduct.values()).map((p, i) => (
                                        <tr key={i} className="even:bg-slate-50/70">
                                          <td className="p-2 font-mono text-slate-600">{p.productCode}</td>
                                          <td className="p-2 font-mono font-black text-slate-800">{p.unifiedCode}</td>
                                          <td className="p-2 font-bold text-slate-800">{p.productName}</td>
                                          <td className="p-2 text-center font-mono font-black text-emerald-700">{p.cartons}</td>
                                          <td className="p-2 text-center font-mono font-bold text-slate-600">{p.pieces}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
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
                    onClick={() => {
                      setSortMode('route_asc');
                      clearColumnSort();
                    }}
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
                          clearColumnSort();
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
                <span className="text-sm font-black tracking-wide text-white">فلاتر وقوائم التصفية المنسدلة من الشيت الأساسي</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  {activeFiltersCount > 0 ? `${activeFiltersCount} فلتر نشط` : 'أعمدة الشيت الأصلية'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                تصفية تفاعلية دقيقة بقوائم منسدلة مطابقة لأعمدة الشيت: الفرع، المندوب، خط السير، العميل، النشاط، الضمان، الدفع، خ/ك، حالة التعامل، المديونية، والفترة
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
                title="إلغاء وتصفير جميع الفلاتر والقوائم"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تصفير الفلاتر ({activeFiltersCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filters Breadcrumb Ribbon (شريط الفلاتر النشطة) */}
        {activeFiltersCount > 0 && (
          <div className="bg-amber-50/70 border-b border-amber-200/80 px-4 py-2 flex items-center gap-2 flex-wrap text-xs">
            <span className="text-[11px] font-black text-amber-900 flex items-center gap-1 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-700" />
              <span>الفلاتر والقوائم المطبقة حالياً:</span>
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
                <span>الضمان: {guaranteeFilter === 'has_guarantee' ? 'ماضي على أوراق الضمان' : 'مش ماضي'}</span>
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
                <span>متعامل في الفترة المحددة ✅</span>
                <button type="button" onClick={() => setDealEligibilityFilter('ALL')} className="text-sky-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
              </span>
            )}

            {sheetStatusFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-white border border-emerald-200 text-emerald-900 px-2 py-0.8 rounded-md font-bold text-[11px] shadow-2xs">
                <span>حالة التعامل (الشيت): {sheetStatusFilter === 'dealt_eligible' ? sheetStatusCounts.dealt_eligibleLabel : sheetStatusFilter === 'ineligible' ? sheetStatusCounts.ineligibleLabel : sheetStatusCounts.idle_eligibleLabel}</span>
                <button type="button" onClick={() => setSheetStatusFilter('ALL')} className="text-emerald-500 hover:text-rose-600 font-black mr-0.5 cursor-pointer">×</button>
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
                  <option value="ALL">جميع المناطق والخطوط ({userVisibleCustomers.length})</option>
                  {availableRegions.map(([reg, count]) => (
                    <option key={reg} value={reg}>{reg} ({count} عميل)</option>
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
                  <option value="ALL">جميع الأنشطة ({userVisibleCustomers.length})</option>
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
                  <option value="ALL">جميع حالات الضمان ({guaranteeCounts.total})</option>
                  <option value="has_guarantee">ماضي على أوراق الضمان ({guaranteeCounts.signed} عميل)</option>
                  <option value="unsecured">مش ماضي ({guaranteeCounts.unsigned} عميل)</option>
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
                  <option value="ALL">جميع طرق الدفع ({userVisibleCustomers.length})</option>
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
                  <option value="ALL">جميع التصنيفات ({userVisibleCustomers.length})</option>
                  {availableClientTypes.map(([ct, count]) => (
                    <option key={ct} value={ct}>
                      {ct} ({count} عميل)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Performance, Financial Status & Time Horizon Drop Lists (قوائم منسدلة مستخرجة من الشيت) */}
          <div className="pt-2 border-t border-slate-100">
            <div className="text-[11px] font-black text-slate-500 mb-1.5 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              <span>مؤشرات الأداء والمديونية والفترة الزمنية (قوائم منسدلة مطابقة للشيت):</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
              {/* 1. حالة التعامل */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>حالة التعامل (الشيت)</span>
                  </span>
                  {sheetStatusFilter !== 'ALL' && (
                    <button type="button" onClick={() => setSheetStatusFilter('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-deal-status-select"
                  value={sheetStatusFilter}
                  onChange={(e) => setSheetStatusFilter(e.target.value as SheetClassification | 'ALL')}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع الحالات ({dealStatusCounts.total.toLocaleString()})</option>
                  <option value="dealt_eligible">{sheetStatusCounts.dealt_eligibleLabel} ✅ ({sheetStatusCounts.dealt_eligible.toLocaleString()})</option>
                  <option value="ineligible">{sheetStatusCounts.ineligibleLabel} ⛔ ({sheetStatusCounts.ineligible.toLocaleString()})</option>
                  <option value="idle_eligible">{sheetStatusCounts.idle_eligibleLabel} 🟢 ({sheetStatusCounts.idle_eligible.toLocaleString()})</option>
                </select>
              </div>

              {/* 2. المديونية والمستحقات */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <BadgeDollarSign className="w-3.5 h-3.5 text-rose-600" />
                    <span>المديونية والمستحقات</span>
                  </span>
                  {debtFilter !== 'ALL' && (
                    <button type="button" onClick={() => setDebtFilter('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-debt-select"
                  value={debtFilter}
                  onChange={(e) => setDebtFilter(e.target.value as typeof debtFilter)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-rose-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع المديونيات ({userVisibleCustomers.length})</option>
                  <option value="highest_debt">🔴 الأكثر مديونية (المديونية &gt; 0)</option>
                  <option value="lowest_debt">🟢 الأقل مديونية</option>
                  <option value="highest_overdue">⚠️ الأكثر مستحقات واجبة السداد</option>
                  <option value="zero_debt">خالص المديونية (مديونية = 0)</option>
                  <option value="over_limit">⛔ متجاوز الحد الائتماني</option>
                </select>
              </div>

              {/* 3. الفترة المستهدفة */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>الفترة المستهدفة (2026)</span>
                  </span>
                  {selectedMonth !== 'ALL' && (
                    <button type="button" onClick={() => setSelectedMonth('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-period-select"
                  value={selectedMonth}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'ALL' || val === 'Q1' || val === 'Q2' || val === 'Q3' || val === 'Q4') {
                      setSelectedMonth(val);
                    } else {
                      setSelectedMonth(Number(val));
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">كامل عام 2026 (جميع الشهور)</option>
                  <optgroup label="الأرباع الربع سنوية">
                    <option value="Q1">الربع الأول Q1 (يناير-مارس)</option>
                    <option value="Q2">الربع الثاني Q2 (أبريل-يونيو)</option>
                    <option value="Q3">الربع الثالث Q3 (يوليو-سبتمبر)</option>
                    <option value="Q4">الربع الرابع Q4 (أكتوبر-ديسمبر)</option>
                  </optgroup>
                  <optgroup label="شهور الشيت 2026">
                    <option value="1">شهر 1 - يناير</option>
                    <option value="2">شهر 2 - فبراير</option>
                    <option value="3">شهر 3 - مارس</option>
                    <option value="4">شهر 4 - أبريل</option>
                    <option value="5">شهر 5 - مايو</option>
                    <option value="6">شهر 6 - يونيو</option>
                    <option value="7">شهر 7 - يوليو</option>
                    <option value="8">شهر 8 - أغسطس</option>
                    <option value="9">شهر 9 - سبتمبر</option>
                    <option value="10">شهر 10 - أكتوبر</option>
                    <option value="11">شهر 11 - نوفمبر</option>
                    <option value="12">شهر 12 - ديسمبر</option>
                  </optgroup>
                </select>
              </div>

              {/* 4. شريحة المبيعات */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                    <span>شريحة مبيعات 2026</span>
                  </span>
                  {salesTierFilter !== 'ALL' && (
                    <button type="button" onClick={() => setSalesTierFilter('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-sales-tier-select"
                  value={salesTierFilter}
                  onChange={(e) => setSalesTierFilter(e.target.value as typeof salesTierFilter)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع شرائح المبيعات ({userVisibleCustomers.length})</option>
                  <option value="vip_100k">⭐ كبار العملاء (+100k)</option>
                  <option value="medium_20k_100k">💼 متوسط (20k - 100k)</option>
                  <option value="starter_under_20k">🥉 ناشئ (&lt;20k)</option>
                  <option value="zero_sales">⭕ مبيعات صفرية</option>
                </select>
              </div>

              {/* 5. كفاءة التحصيل */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    <span>كفاءة التحصيل</span>
                  </span>
                  {collectionRateFilter !== 'ALL' && (
                    <button type="button" onClick={() => setCollectionRateFilter('ALL')} className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer">إلغاء</button>
                  )}
                </label>
                <select
                  id="analytics-collection-rate-select"
                  value={collectionRateFilter}
                  onChange={(e) => setCollectionRateFilter(e.target.value as typeof collectionRateFilter)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="ALL">جميع معدلات التحصيل ({userVisibleCustomers.length})</option>
                  <option value="high_80">🟢 مرتفع (+80%)</option>
                  <option value="medium_30_79">🟡 متوسط (30% - 79%)</option>
                  <option value="low_zero">🔴 ضعيف أو صفري (&lt;30%)</option>
                </select>
              </div>

              {/* 6. الترتيب الذكي */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <ArrowUpDown className="w-3.5 h-3.5 text-purple-600" />
                    <span>الترتيب</span>
                  </span>
                  {sortMode !== 'highest_debt' && (
                    <button type="button" onClick={() => setSortMode('highest_debt')} className="text-[10px] text-purple-600 font-bold hover:underline cursor-pointer">افتراضي</button>
                  )}
                </label>
                <select
                  id="analytics-sort-select"
                  value={sortMode}
                  onChange={(e) => {
                    setSortMode(e.target.value as typeof sortMode);
                    clearColumnSort();
                  }}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500 transition shadow-2xs cursor-pointer"
                >
                  <option value="highest_debt">🔴 الأكثر مديونية أولاً</option>
                  <option value="highest_overdue">⚠️ الأكثر مستحقات واجبة السداد</option>
                  <option value="highest_sales">📈 أعلى مبيعات 2026</option>
                  <option value="route_asc">🗺️ ترتيب حسب خط السير</option>
                  <option value="name_asc">🔤 أبجدي (أ - ي)</option>
                </select>
                {sortBy !== 'ALL' && (
                  <button
                    type="button"
                    onClick={clearColumnSort}
                    className="self-start text-[10px] font-bold text-blue-700 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    <span>
                      مرتب حسب عمود: {SORTABLE_COLUMN_LABELS[sortBy]} ({sortOrder === 'asc' ? 'تصاعدي' : 'تنازلي'}) — إلغاء
                    </span>
                  </button>
                )}
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
                {formatMoney(resolveCustomerDuesValue(selectedSlicerCustomer))}
              </span>
              <span className="text-[10px] text-rose-300 mt-0.5 block">
                {resolveCustomerDuesValue(selectedSlicerCustomer) > 0 ? '⚠️ واجبة السداد الفوري' : '✓ لا توجد مستحقات متأخرة'}
              </span>
            </div>

            <div className="bg-slate-900/90 p-3 rounded-xl border border-amber-900/50">
              <span className="text-[11px] text-amber-300 block font-bold">الحد الائتماني والضمان:</span>
              <span className="text-lg sm:text-xl font-black text-amber-300 font-mono mt-0.5 block" title={isPrivacyMode ? 'مخفي' : undefined}>
                {formatMoney(selectedSlicerCustomer.creditLimit || 0)}
              </span>
              <span className="text-[10px] text-slate-300 mt-0.5 block truncate">
                الضمان: {normalizeGuaranteeCategory(selectedSlicerCustomer)}
                {Number(selectedSlicerCustomer.guaranteeAmount || 0) > 0
                  ? ` — ${formatMoney(Number(selectedSlicerCustomer.guaranteeAmount))}`
                  : ''}
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

            {/* Box 3: Dynamic dealt-customer count — clickable slicer */}
            <div className="bg-slate-900/90 rounded-xl p-3 border border-emerald-500/30 shadow-inner">
              <div className="text-xs font-bold text-emerald-300 flex items-center justify-between">
                <span>👥 المتعاملون في الفترة</span>
                <Users className="w-4 h-4 text-emerald-400" />
              </div>

              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setDealEligibilityFilter(dealEligibilityFilter === 'dealt' ? 'ALL' : 'dealt')}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 border transition cursor-pointer ${
                    dealEligibilityFilter === 'dealt'
                      ? 'bg-emerald-600 text-white border-transparent shadow-md ring-2 ring-emerald-400'
                      : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/50'
                  }`}
                  title="عرض العملاء المتعاملين في الفترة المحددة فقط"
                  aria-pressed={dealEligibilityFilter === 'dealt'}
                >
                  <span className="text-sm font-black">متعامل ✅</span>
                  <span className="text-base font-black font-mono">
                    {dealStatusCounts.dealt.toLocaleString()}
                  </span>
                </button>
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
                    <span className="text-slate-300 font-bold">نسبة التغطية:</span>
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
                const metrics = customerMetricsMap.get(c.id);
                const bal = metrics ? metrics.balance : (c.currentBalance ?? c.balance ?? 0);
                const overdue = metrics ? metrics.overdue : resolveCustomerDuesValue(c);
                const s26 = metrics ? metrics.sales2026 : (c.sales2026 || 0);
                const col26 = metrics ? metrics.collections2026 : (c.collections2026 || 0);
                const isDealt = metrics ? metrics.isDealtCustomer : sheetDealStatus(c);
                const isElig = metrics ? metrics.isEligible : (classifyEligibilityColumn(c.dealEligibility)?.eligible ?? true);
                const classificationBucket: SheetClassification = metrics
                  ? metrics.sheetClassification
                  : (classifyEligibilityColumn(c.dealEligibility)?.bucket ?? 'idle_eligible');
                const classificationLabel: string = metrics
                  ? metrics.sheetClassificationLabel
                  : (classifyEligibilityColumn(c.dealEligibility)?.raw || (isElig ? 'قابل' : 'غير قابل'));

                return (
                  <div
                    key={c.id || c.code}
                    className="p-3.5 bg-white space-y-2.5 transition active:bg-amber-50/30"
                  >
                    {/* Card Header: Code, Name, Deal & Eligibility Badges */}
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

                      {/* Deal & Eligibility Badges — مرآة الشيت */}
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <ClassificationBadge bucket={classificationBucket} label={classificationLabel} compact />
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

              <div className="mt-2 text-[10.5px] font-bold text-slate-500 leading-relaxed">
إجمالي العملاء في النطاق: {dealStatusCounts.total.toLocaleString()} عميل — متعامل ({dealStatusCounts.dealt.toLocaleString()}) · قابل للتعامل ({customerDealingAnalytics.kpi.totalEligible.toLocaleString()}) · غير قابل ({customerDealingAnalytics.kpi.totalAll - customerDealingAnalytics.kpi.totalEligible}).
              </div>


            {/* Desktop View: Full Comprehensive Table (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200 whitespace-nowrap">
                  <th className="p-3 text-center w-10">#</th>
                  <SortableHeader
                    column="code"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    defaultOrder="asc"
                    onToggle={handleSortToggle}
                  />
                  <SortableHeader
                    column="name"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    defaultOrder="asc"
                    onToggle={handleSortToggle}
                  />
                  <th scope="col" className="p-3 text-center whitespace-nowrap">قابل / غير</th>
                  <th scope="col" className="p-3">الفرع / المندوب</th>
                  <SortableHeader
                    column="balance"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    defaultOrder="desc"
                    accent="text-purple-700"
                    onToggle={handleSortToggle}
                  />
                  <SortableHeader
                    column="overdue"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    defaultOrder="desc"
                    accent="text-rose-700"
                    onToggle={handleSortToggle}
                  />
                  <SortableHeader
                    column="creditLimit"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    defaultOrder="desc"
                    accent="text-slate-700"
                    onToggle={handleSortToggle}
                  />
                  <th scope="col" className="p-3 text-center">أوراق الضمان</th>
                  <SortableHeader
                    column="sales2026"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    defaultOrder="desc"
                    accent="text-blue-700"
                    onToggle={handleSortToggle}
                  />
                  <SortableHeader
                    column="collections2026"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    defaultOrder="desc"
                    accent="text-emerald-700"
                    onToggle={handleSortToggle}
                  />
                  <SortableHeader
                    column="lastVisit"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    defaultOrder="desc"
                    align="center"
                    accent="text-amber-800"
                    onToggle={handleSortToggle}
                  />
                  <SortableHeader
                    column="order"
                    activeColumn={sortBy}
                    sortOrder={sortOrder}
                    defaultOrder="desc"
                    align="center"
                    accent="text-teal-800"
                    onToggle={handleSortToggle}
                  />
                  <th scope="col" className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedCustomers.map((c, index) => {
                  const globalIdx = (currentPage - 1) * pageSize + index + 1;
                  const metrics = customerMetricsMap.get(c.id);
                  const bal = metrics ? metrics.balance : (c.currentBalance ?? c.balance ?? 0);
                  const overdue = metrics ? metrics.overdue : resolveCustomerDuesValue(c);
                  const limit = metrics ? metrics.creditLimit : (c.creditLimit || 0);
                  const isOverLimit = metrics ? metrics.isOverLimit : (limit > 0 && bal > limit);
                  const s26 = metrics ? metrics.sales2026 : (c.sales2026 || 0);
                  const col26 = metrics ? metrics.collections2026 : (c.collections2026 || 0);
                  const colRate = metrics ? metrics.collectionRate : (s26 > 0 ? Math.round((col26 / s26) * 100) : 0);
                  const guaranteeInfo = getGuaranteeBadge(c.guaranteeDocs, c.guaranteeAmount, limit);
                  const visitTime = getRelativeTimeArabic(c.lastVisitDate);
                  const orderSummary = metrics ? metrics.orderSummary : getCustomerOrderSummary(c);
                  const isDealt = metrics ? metrics.isDealtCustomer : sheetDealStatus(c);
                  const isElig = metrics ? metrics.isEligible : (classifyEligibilityColumn(c.dealEligibility)?.eligible ?? true);
                  const classificationBucket: SheetClassification = metrics
                    ? metrics.sheetClassification
                    : (classifyEligibilityColumn(c.dealEligibility)?.bucket ?? 'idle_eligible');
                  const classificationLabel: string = metrics
                    ? metrics.sheetClassificationLabel
                    : (classifyEligibilityColumn(c.dealEligibility)?.raw || (isElig ? 'قابل' : 'غير قابل'));

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

                      {/* حالة وقابلية التعامل — مرآة مطابقة للشيت */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <ClassificationBadge bucket={classificationBucket} label={classificationLabel} />
                        </div>
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
                                {formatMoney(
                                  orderSummary.latestOrder.estimatedGrandTotal ||
                                    orderSummary.latestOrder.subtotal ||
                                    0
                                )}
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
                  {visitFormError && (
                    <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-[11px] font-bold text-red-800 leading-relaxed">
                      {visitFormError}
                    </div>
                  )}
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
                        onChange={(e) => setVisitType(e.target.value as CustomerVisit['type'])}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      >
                        {VISIT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">نتيجة الزيارة:</label>
                      <select
                        value={visitOutcome}
                        onChange={(e: any) => {
                          const next = e.target.value;
                          setVisitOutcome(next);
                          // اختيار «مرتجع لدي العميل» بيفتح لوحة المرتجع
                          // لوحدها. من غير الربط ده كان ينفع تختار
                          // «مرتجع لدي العميل» وتسيب `visitHasReturn`
                          // مقفول، فتتسجّل زيارة سببها مرتجع من غير صنف
                          // ولا كمية ولا سبب — رقم فاضي في تقرير المرتجعات.
                          // ولInverse: لو فعّل المرتجع يدوي، النتيجة بتتظبط
                          // لوحدها على «مرتجع لدي العميل».
                          if (next === 'مرتجع لدي العميل') setVisitHasReturn(true);
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      >
                        <option value="تم عمل طلبية">تم عمل طلبية</option>
                        <option value="تم التحصيل">تم التحصيل</option>
                        <option value="تأجيل سداد">تأجيل سداد</option>
                        <option value="المحل مغلق">المحل مغلق</option>
                        <option value="متابعة فقط">متابعة فقط</option>
                        {/*
                          مسار المرتجع كان **مقفول** في هذه الشاشة: القائمة هنا
                          كانت 5 قيم من غير «مرتجع لدي العميل» و«أخرى»، بينما
                          نفس الشاشة فيها checkbox «visitHasReturn» بمنطق تاني.
                          يعني نفس الزيارة لها مسارين مختلفين حسب الشاشة.

                          دلوقتي «مرتجع لدي العميل» و«أخرى» متاحين هنا زي ما هم
                          في صفحة الزيارات بالظبط. الشاشة دي بتعالج المرتجع
                          بـvisitHasReturn/visitReturnValue لوحدها، فالاختيار من
                          القائمة مش بيلغي المسار ده — القيمتان موجودتين جنب بعض.
                        */}
                        <option value="مرتجع لدي العميل">مرتجع لدي العميل 📦↩️</option>
                        <option value="أخرى">أخرى</option>
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

                  {/* ===== تسجيل مرتجع (Return) ===== */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !visitHasReturn;
                      setVisitHasReturn(next);
                      // الاتجاه العكس للربط: تفعيل المرتجع يدوي بيسوّي النتيجة
                      // على «مرتجع لدي العميل»، وإلغاؤه بيسيبها زي ما هي عشان
                      // المستخدم يكون قاصد قيمة تانية صراحةً.
                      if (next) setVisitOutcome('مرتجع لدي العميل');
                    }}
                    className={`w-full flex items-center justify-center gap-2.5 rounded-2xl py-3 border-2 transition cursor-pointer ${
                      visitHasReturn
                        ? 'bg-rose-600 text-white border-rose-700 shadow-lg shadow-rose-600/30'
                        : 'bg-white text-rose-600 border-rose-300 border-dashed hover:bg-rose-50'
                    }`}
                  >
                    <RotateCcw className={`w-5 h-5 ${visitHasReturn ? 'animate-pulse' : ''}`} />
                    <span className="text-sm font-black">
                      {visitHasReturn ? 'تم تفعيل تسجيل مرتجع — اضغط للإلغاء' : 'هل يوجد مرتجع في هذه الزيارة؟'}
                    </span>
                  </button>

                  {visitHasReturn && (
                    <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/70 p-3.5 space-y-3 animate-in slide-in-from-top-2">
                      <div className="flex items-center gap-2 text-rose-700 font-black text-xs">
                        <AlertTriangle className="w-4 h-4" />
                        تفاصيل المرتجع — سيتم إشعار المشرف فوراً
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-rose-600 block mb-1">قيمة المرتجع (ج.م): *</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={visitReturnValue}
                          onChange={(e) => setVisitReturnValue(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-rose-200 rounded-xl text-xs font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-rose-600 block mb-1">أصناف المرتجع: *</label>
                        <textarea
                          rows={3}
                          placeholder={'اسم الصنف × الكمية\nمثال:\nDRM-101 أطقم كاسات × 3\nDRM-220 برطمانات × 5'}
                          value={visitReturnItems}
                          onChange={(e) => setVisitReturnItems(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-rose-200 rounded-xl text-xs font-bold resize-none font-mono"
                        />
                        <div className="text-[10px] text-rose-500 mt-1 font-bold">
                          اكتب كل صنف في سطر مع كميته — يظهر للمشرف وأمين المخزن مباشرة
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-rose-600 block mb-1">سبب المرتجع: *</label>
                        <input
                          type="text"
                          placeholder="مثال: تالف،Near Expiry، خطأ في الكمية"
                          value={visitReturnReason}
                          onChange={(e) => setVisitReturnReason(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-rose-200 rounded-xl text-xs font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-rose-600 block mb-1">تفاصيل إضافية:</label>
                        <textarea
                          rows={2}
                          placeholder="اكتب تفاصيل المرتجع: الأصناف، الكميات، أي ملاحظة للمشرف"
                          value={visitReturnDetails}
                          onChange={(e) => setVisitReturnDetails(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-rose-200 rounded-xl text-xs font-bold resize-none"
                        />
                      </div>
                    </div>
                  )}

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
                    {formatMoney(resolveCustomerDuesValue(selectedCustomer))}
                  </div>
                  <div className="text-[11px] font-bold text-rose-600 mt-1 border-t border-rose-100 pt-1 flex items-center justify-between">
                    <span>الحالة:</span>
                    <span>واجبة التحصيل فوراً</span>
                  </div>
                </div>
              </div>

              {/* ===== كشف حساب العميل — الضمان والحد الائتماني وآخر تحصيل ===== */}
              <div className="rounded-2xl border-2 border-slate-800 bg-white overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-black text-xs sm:text-sm flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-amber-400" />
                    <span>كشف حساب العميل</span>
                  </h4>
                  <span className="text-[10.5px] font-black px-2.5 py-1 rounded-lg bg-white/15">
                    متاح عند فتح الفاتورة
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                  {/* أوراق الضمان */}
                  <div className="p-3.5">
                    <div className="text-[10.5px] font-black text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>أوراق الضمان</span>
                    </div>
                    {hasGuaranteePapers(selectedCustomer) ? (
                      <>
                        <div className="text-sm font-black text-emerald-800 mt-1 leading-tight">
                          {normalizeGuaranteeCategory(selectedCustomer)}
                        </div>
                        {Number(selectedCustomer.guaranteeAmount || 0) > 0 && (
                          <div className="text-lg font-black font-mono text-emerald-950 mt-0.5">
                            {formatMoney(Number(selectedCustomer.guaranteeAmount))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm font-black text-slate-400 mt-1">لا يوجد ورق ضمان</div>
                    )}
                  </div>

                  {/* الحد الائتماني */}
                  <div className="p-3.5">
                    <div className="text-[10.5px] font-black text-slate-400 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                      <span>الحد الائتماني</span>
                    </div>
                    <div className="text-lg font-black font-mono text-blue-950 mt-1">
                      {formatMoney(selectedCustomer.creditLimit || 0)}
                    </div>
                    {(() => {
                      const bal = selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0;
                      const lim = selectedCustomer.creditLimit || 0;
                      const over = bal > lim && lim > 0;
                      return (
                        <div className={`text-[11px] font-bold mt-1 border-t border-slate-100 pt-1 flex items-center justify-between`}>
                          <span>المستخدم:</span>
                          <span className={`font-mono ${over ? 'text-rose-600' : 'text-slate-600'}`}>
                            {lim > 0 ? `${Math.round((bal / lim) * 100)}%` : '—'}
                            {over && <span className="text-rose-600 font-black"> ⛔</span>}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* آخر تحصيل */}
                  <div className="p-3.5">
                    <div className="text-[10.5px] font-black text-slate-400 flex items-center gap-1.5">
                      <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                      <span>آخر تحصيل</span>
                    </div>
                    {Number(selectedCustomer.lastCollectionAmount || 0) > 0 ? (
                      <div className="text-lg font-black font-mono text-emerald-950 mt-1">
                        {formatMoney(Number(selectedCustomer.lastCollectionAmount))}
                      </div>
                    ) : (
                      <div className="text-sm font-black text-slate-400 mt-1">لا يوجد تحصيل مسجل</div>
                    )}
                  </div>

                  {/* تاريخ آخر تحصيل */}
                  <div className="p-3.5">
                    <div className="text-[10.5px] font-black text-slate-400 flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-violet-600" />
                      <span>تاريخ آخر تحصيل</span>
                    </div>
                    {selectedCustomer.lastCollectionDate ? (
                      <div className="text-sm font-black text-violet-900 mt-1 font-mono">
                        {selectedCustomer.lastCollectionDate}
                      </div>
                    ) : (
                      <div className="text-sm font-black text-slate-400 mt-1">—</div>
                    )}
                    <div className="text-[11px] font-bold text-slate-500 mt-1 border-t border-slate-100 pt-1 flex items-center justify-between">
                      <span>إجمالي تحصيلات 2026:</span>
                      <span className="font-mono text-emerald-700">{formatMoney(selectedCustomer.collections2026 || 0)}</span>
                    </div>
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

              {/* ========================================================================= */}
              {/* Comprehensive Customer Visit Log, Notes & History Archive Hub            */}
              {/* ========================================================================= */}
              {(() => {
                const customerVisitsList = selectedCustomer.visitHistory || [];
                const activeVisits = customerVisitsList.filter((v) => !v.isArchived);
                const archivedVisits = customerVisitsList.filter((v) => v.isArchived);
                const relatedComments = (customerComments || []).filter(
                  (cm) =>
                    (selectedCustomer.code && cm.customerCode === selectedCustomer.code) ||
                    (selectedCustomer.id && cm.customerId === selectedCustomer.id)
                );

                const handleToggleCustomerVisitArchive = async (visit: CustomerVisit) => {
                  const targetState = !visit.isArchived;
                  const res = await toggleArchiveVisit(visit.id, targetState);
                  if (res.success) {
                    setSelectedCustomer((prev) => {
                      if (!prev) return null;
                      const nextHistory = (prev.visitHistory || []).map((vh) =>
                        vh.id === visit.id
                          ? {
                              ...vh,
                              isArchived: targetState,
                              archivedAt: targetState ? new Date().toISOString() : undefined,
                              archivedBy: currentUser?.name,
                            }
                          : vh
                      );
                      return { ...prev, visitHistory: nextHistory };
                    });
                  }
                };

                const handleToggleCommentArchive = async (cm: CustomerCommentRecord) => {
                  const targetState = !cm.isArchived;
                  await toggleArchiveCustomerComment(cm.id, targetState);
                };

                return (
                  <div className="rounded-2xl border-2 border-slate-200 bg-white p-4 space-y-3.5 shadow-xs">
                    {/* Header with Title and Tabs */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                            <span>سجل وملاحظات الزيارات الميدانية للعميل</span>
                            <span className="text-[11px] font-bold text-slate-400 font-mono">
                              ({customerVisitsList.length} زيارة مسجلة)
                            </span>
                          </h4>
                          <p className="text-[10.5px] text-slate-500 font-medium">
                            توثيق باسم المندوب وتاريخ الزيارة والإفادة الميدانية مع إمكانية الأرشفة والاسترجاع
                          </p>
                        </div>
                      </div>

                      {/* Tab Slicers: Active Visits vs Archive vs Notes */}
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => setCustomerDossierTab('active_visits')}
                          className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                            customerDossierTab === 'active_visits'
                              ? 'bg-white text-slate-900 shadow-2xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <CalendarCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>النشطة ({activeVisits.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCustomerDossierTab('archived_visits')}
                          className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                            customerDossierTab === 'archived_visits'
                              ? 'bg-amber-600 text-white shadow-2xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Archive className="w-3.5 h-3.5" />
                          <span>الأرشيف 🗄️ ({archivedVisits.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCustomerDossierTab('comments')}
                          className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                            customerDossierTab === 'comments'
                              ? 'bg-slate-900 text-white shadow-2xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>ملاحظات الحساب ({relatedComments.length})</span>
                        </button>
                      </div>
                    </div>

                    {/* Content Section 1: Active Visits */}
                    {customerDossierTab === 'active_visits' && (
                      <div className="space-y-2">
                        {activeVisits.length > 0 ? (
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {activeVisits.map((v) => (
                              <div
                                key={v.id}
                                className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100/70 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                              >
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="font-black text-slate-900 flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                                      📅 {v.date} {v.time ? `• ${v.time}` : ''}
                                    </span>
                                    <span className="text-[11px] font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                      المندوب: {v.repName || 'المندوب المسجل'}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold">
                                      {v.type || 'زيارة'}
                                    </span>
                                    <span className="text-[10.5px] px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black border border-emerald-300">
                                      الإفادة: {v.outcome || 'متابعة'}
                                    </span>
                                  </div>

                                  {v.notes && (
                                    <p className="text-slate-700 text-xs mt-1 bg-white p-2 rounded-lg border border-slate-200/80 leading-relaxed">
                                      <span className="font-bold text-slate-500">الملاحظات: </span>
                                      {v.notes}
                                    </p>
                                  )}

                                  {v.isReturn && (
                                    <div className="text-[11px] font-bold text-rose-700 bg-rose-50 p-1.5 rounded-lg border border-rose-200 flex items-center gap-2">
                                      <span>↩️ مرتجع بقيمة {formatCurrency(v.returnValue || 0)}</span>
                                      {v.returnReason && <span>({v.returnReason})</span>}
                                      {v.returnStatus && (
                                        <span className="text-[10px] bg-rose-200/70 px-1.5 py-0.2 rounded font-black">
                                          {v.returnStatus}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                                  {v.collectedAmount && v.collectedAmount > 0 ? (
                                    <div className="text-left font-mono font-black text-sm text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                      +{formatCurrency(v.collectedAmount)}
                                    </div>
                                  ) : null}

                                  <button
                                    type="button"
                                    onClick={() => handleToggleCustomerVisitArchive(v)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-black text-[11px] transition cursor-pointer flex items-center gap-1"
                                    title="أرشفة هذه الزيارة إلى سجل الأرشيف"
                                  >
                                    <Archive className="w-3 h-3 text-amber-700" />
                                    <span>أرشفة الزيارة 🗄️</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-1.5">
                            <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                            <p className="text-xs font-bold text-slate-600">لا توجد زيارات نشطة مسجلة لهذا العميل حالياً</p>
                            <p className="text-[11px] text-slate-400">
                              يمكنك تسجيل زيارة أو تحصيل جديد عبر زر "تسجيل زيارة أو تحصيل ميداني" أعلاه.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Content Section 2: Archived Visits */}
                    {customerDossierTab === 'archived_visits' && (
                      <div className="space-y-2">
                        {archivedVisits.length > 0 ? (
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {archivedVisits.map((v) => (
                              <div
                                key={v.id}
                                className="p-3 rounded-xl bg-amber-50/60 hover:bg-amber-50 border border-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                              >
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="font-black text-slate-900 flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-200 text-amber-950 font-black border border-amber-300 flex items-center gap-1">
                                      <Archive className="w-3 h-3" />
                                      <span>مؤرشفة</span>
                                    </span>
                                    <span className="font-mono text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                                      📅 {v.date}
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-700">
                                      المندوب: {v.repName || 'المندوب المسجل'}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 font-bold">
                                      {v.outcome || 'متابعة'}
                                    </span>
                                  </div>

                                  {v.notes && (
                                    <p className="text-slate-700 text-xs mt-1 bg-white p-2 rounded-lg border border-slate-200 leading-relaxed">
                                      {v.notes}
                                    </p>
                                  )}

                                  {v.archivedAt && (
                                    <div className="text-[10px] text-slate-400">
                                      تمت الأرشفة في: {new Date(v.archivedAt).toLocaleDateString('ar-EG')} بواسطة {v.archivedBy || 'المشرف'}
                                    </div>
                                  )}
                                </div>

                                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-amber-200">
                                  {v.collectedAmount && v.collectedAmount > 0 ? (
                                    <div className="text-left font-mono font-black text-sm text-emerald-700 bg-white px-2 py-1 rounded-lg border border-emerald-200">
                                      +{formatCurrency(v.collectedAmount)}
                                    </div>
                                  ) : null}

                                  <button
                                    type="button"
                                    onClick={() => handleToggleCustomerVisitArchive(v)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                    title="استعادة هذه الزيارة من الأرشيف إلى السجل النشط"
                                  >
                                    <ArchiveRestore className="w-3 h-3" />
                                    <span>استعادة من الأرشيف 🔄</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-6 rounded-2xl bg-amber-50/50 border border-dashed border-amber-200 text-center space-y-1.5">
                            <Archive className="w-8 h-8 text-amber-400 mx-auto" />
                            <p className="text-xs font-bold text-amber-900">سجل الأرشيف فارغ لهذا العميل</p>
                            <p className="text-[11px] text-amber-700/80">
                              الزيارات المؤرشفة تظهر هنا دائماً للرجوع إليها دون حذف أي بيانات أو سجلات تاريخية.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Content Section 3: Customer Comments & Account Notes */}
                    {customerDossierTab === 'comments' && (
                      <div className="space-y-2">
                        {relatedComments.length > 0 ? (
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {relatedComments.map((cm) => (
                              <div
                                key={cm.id}
                                className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 transition ${
                                  cm.isArchived
                                    ? 'bg-amber-50/50 border-amber-200'
                                    : 'bg-slate-50 border-slate-200'
                                }`}
                              >
                                <div className="space-y-1 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-800">
                                      👤 {cm.authorName || 'المشرف'}
                                    </span>
                                    <span className="font-mono text-slate-400 text-[10.5px]">
                                      {new Date(cm.createdAt).toLocaleDateString('ar-EG')}
                                    </span>
                                    {cm.isArchived && (
                                      <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 font-bold">
                                        مؤرشفة
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-slate-800 text-xs leading-relaxed bg-white p-2 rounded-lg border border-slate-200">
                                    {cm.body}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleToggleCommentArchive(cm)}
                                  className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10.5px] transition cursor-pointer shrink-0"
                                >
                                  {cm.isArchived ? 'استعادة 🔄' : 'أرشفة 🗄️'}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-1">
                            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                            <p className="text-xs font-bold text-slate-600">لا توجد ملاحظات عامة مسجلة على حساب العميل</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
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
