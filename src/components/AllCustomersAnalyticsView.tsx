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
  Cell
} from 'recharts';
import { useApp } from '../context/AppContext';
import { Customer, CustomerVisit, User, Invoice, OrderStatus } from '../types';
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
  const [selectedRep, setSelectedRep] = useState<string>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [activityFilter, setActivityFilter] = useState<'ALL' | 'active_2026' | 'inactive_2026' | 'churn_risk' | 'new_customer'>('ALL');
  const [debtFilter, setDebtFilter] = useState<'ALL' | 'has_debt' | 'zero_debt' | 'over_limit' | 'has_overdue'>('ALL');
  const [orderFilter, setOrderFilter] = useState<'ALL' | 'has_order' | 'active_order' | 'no_order'>('ALL');
  const [guaranteeFilter, setGuaranteeFilter] = useState<'ALL' | 'has_guarantee' | 'cheque' | 'promissory' | 'trust_receipt' | 'unsecured'>('ALL');
  const [visitFilter, setVisitFilter] = useState<'ALL' | 'visited_2026' | 'not_visited'>('ALL');

  // Expanded Slicer Filters (طرق الدفع، شرائح المبيعات، كفاءة التحصيل)
  const [paymentTermsFilter, setPaymentTermsFilter] = useState<'ALL' | 'كاش' | 'على دفعات' | 'شيكات' | 'آجل'>('ALL');
  const [salesTierFilter, setSalesTierFilter] = useState<'ALL' | 'vip_100k' | 'medium_20k_100k' | 'starter_under_20k' | 'zero_sales'>('ALL');
  const [collectionRateFilter, setCollectionRateFilter] = useState<'ALL' | 'high_80' | 'medium_30_79' | 'low_zero'>('ALL');

  // Power BI Visuals Tab
  const [activeChartTab, setActiveChartTab] = useState<'monthly' | 'branches' | 'reps' | 'payment_guarantee'>('monthly');

  // Sorting
  const [sortBy, setSortBy] = useState<'name' | 'code' | 'balance' | 'overdue' | 'creditLimit' | 'sales2026' | 'collections2026' | 'lastVisit' | 'order'>('sales2026');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination for high-performance (4000+ items)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // BI Charts Toggle
  const [showCharts, setShowCharts] = useState(false);

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
    return Array.from(s);
  }, [userVisibleCustomers]);

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

    // Region filter
    if (selectedRegion !== 'ALL') {
      list = list.filter((c) => c.region === selectedRegion);
    }

    // Activity 2026 filter
    if (activityFilter !== 'ALL') {
      if (activityFilter === 'active_2026') {
        list = list.filter((c) => c.hasDealtIn2026 || (c.sales2026 && c.sales2026 > 0));
      } else if (activityFilter === 'inactive_2026') {
        list = list.filter((c) => !c.hasDealtIn2026 && (!c.sales2026 || c.sales2026 === 0));
      } else if (activityFilter === 'churn_risk') {
        list = list.filter((c) => c.status2026 === 'churn_risk' || (c.sales2025 && c.sales2025 > 0 && (!c.sales2026 || c.sales2026 === 0)));
      } else if (activityFilter === 'new_customer') {
        list = list.filter((c) => c.status2026 === 'new_customer' || (c.sales2026 && c.sales2026 > 0 && !c.sales2025));
      }
    }

    // Debt filter
    if (debtFilter !== 'ALL') {
      if (debtFilter === 'has_debt') {
        list = list.filter((c) => (c.currentBalance ?? c.balance ?? 0) > 0);
      } else if (debtFilter === 'zero_debt') {
        list = list.filter((c) => (c.currentBalance ?? c.balance ?? 0) <= 0);
      } else if (debtFilter === 'over_limit') {
        list = list.filter((c) => {
          const limit = c.creditLimit || 0;
          const bal = c.currentBalance ?? c.balance ?? 0;
          return limit > 0 && bal > limit;
        });
      } else if (debtFilter === 'has_overdue') {
        list = list.filter((c) => {
          const overdue = c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
          return overdue > 0;
        });
      }
    }

    // Order filter (أمر البيع وطلبيات العميل)
    if (orderFilter !== 'ALL') {
      list = list.filter((c) => {
        const orderSummary = getCustomerOrderSummary(c);
        if (orderFilter === 'has_order') return orderSummary.hasOrder;
        if (orderFilter === 'active_order') return orderSummary.hasActiveOrder;
        if (orderFilter === 'no_order') return !orderSummary.hasOrder;
        return true;
      });
    }

    // Guarantee Documents filter (أوراق الضمان مع تدقيق المبالغ والمستندات)
    if (guaranteeFilter !== 'ALL') {
      list = list.filter((c) => {
        const g = (c.guaranteeDocs || '').toLowerCase();
        const amt = Number(c.guaranteeAmount || 0);
        const hasAmt = amt > 0;
        const isSigned = hasAmt || c.hasGuarantee === true || (g && !g.includes('بدون') && !g.includes('لا يوجد') && g !== '0') || (c.creditLimit && c.creditLimit > 0);

        if (guaranteeFilter === 'has_guarantee') {
          return isSigned;
        }
        if (guaranteeFilter === 'cheque') {
          return g.includes('شيك') || (!g && (c.creditLimit || 0) > 0);
        }
        if (guaranteeFilter === 'promissory') {
          return g.includes('كمبيال');
        }
        if (guaranteeFilter === 'trust_receipt') {
          return g.includes('أمانة') || g.includes('امانة');
        }
        if (guaranteeFilter === 'unsecured') {
          return !isSigned;
        }
        return true;
      });
    }

    // Payment Terms filter (كاش / على دفعات / شيكات / آجل)
    if (paymentTermsFilter !== 'ALL') {
      list = list.filter((c) => {
        const terms = (c.paymentTerms || '').toLowerCase();
        if (paymentTermsFilter === 'كاش') return terms.includes('كاش') || terms.includes('نقدي') || terms.includes('فوري');
        if (paymentTermsFilter === 'على دفعات') return terms.includes('دفع') || terms.includes('قسط') || terms.includes('أقساط');
        if (paymentTermsFilter === 'شيكات') return terms.includes('شيك');
        if (paymentTermsFilter === 'آجل') return terms.includes('آجل') || terms.includes('اجل');
        return true;
      });
    }

    // Sales Tier filter (شرائح مبيعات 2026)
    if (salesTierFilter !== 'ALL') {
      list = list.filter((c) => {
        const s = c.sales2026 || c.totalMonthlySales || 0;
        if (salesTierFilter === 'vip_100k') return s >= 100000;
        if (salesTierFilter === 'medium_20k_100k') return s >= 20000 && s < 100000;
        if (salesTierFilter === 'starter_under_20k') return s > 0 && s < 20000;
        if (salesTierFilter === 'zero_sales') return s <= 0;
        return true;
      });
    }

    // Collection Rate filter (كفاءة التحصيل)
    if (collectionRateFilter !== 'ALL') {
      list = list.filter((c) => {
        const s = c.sales2026 || c.totalMonthlySales || 0;
        const col = c.collections2026 || c.totalMonthlyCollections || 0;
        const rate = s > 0 ? (col / s) * 100 : col > 0 ? 100 : 0;
        if (collectionRateFilter === 'high_80') return rate >= 80;
        if (collectionRateFilter === 'medium_30_79') return rate >= 30 && rate < 80;
        if (collectionRateFilter === 'low_zero') return rate < 30;
        return true;
      });
    }

    // Visit filter (تاريخ الزيارات)
    if (visitFilter !== 'ALL') {
      list = list.filter((c) => {
        const hasVisit = !!c.lastVisitDate || (c.visitCount2026 && c.visitCount2026 > 0);
        if (visitFilter === 'visited_2026') return hasVisit;
        if (visitFilter === 'not_visited') return !hasVisit;
        return true;
      });
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
  }, [userVisibleCustomers, selectedBranch, selectedRep, selectedRegion, activityFilter, debtFilter, orderFilter, guaranteeFilter, visitFilter, paymentTermsFilter, salesTierFilter, collectionRateFilter, searchQuery, sortBy, sortOrder]);

  // Reset pagination on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBranch, selectedRep, selectedRegion, activityFilter, debtFilter, orderFilter, guaranteeFilter, visitFilter, paymentTermsFilter, salesTierFilter, collectionRateFilter, searchQuery, pageSize]);

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
      const c25 = c.collections2025 || 0;
      const monthlyColsSum = c.monthlyCollections2026 ? Object.values(c.monthlyCollections2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
      const c26 = Math.max(c.collections2026 || 0, c.totalMonthlyCollections || 0, c.totalOverallCollections || 0, monthlyColsSum);
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
          {/* Privacy / Confidentiality Mode Toggle */}
          <button
            id="analytics-privacy-mode-btn"
            type="button"
            onClick={togglePrivacyMode}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer whitespace-nowrap ${
              isPrivacyMode
                ? 'bg-amber-500/20 text-amber-800 border-amber-500/60 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title={isPrivacyMode ? 'وضع سرية البيانات نشط (المبيعات والأرصدة مخفية). اضغط للإظهار.' : 'تفعيل وضع سرية البيانات لإخفاء الأرقام المالية الحساسة أثناء العرض'}
          >
            {isPrivacyMode ? (
              <>
                <EyeOff className="w-4 h-4 text-amber-600 animate-pulse" />
                <span className="font-extrabold text-amber-900">سرية البيانات: نشطة</span>
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 text-slate-500" />
                <span>سرية البيانات</span>
              </>
            )}
          </button>

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
            {kpiStats.active2026Count.toLocaleString()} نشط ({kpiStats.activeRate}%)
          </div>
        </div>

        {/* 2026 Sales & Growth */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200 border-t-4 border-t-[#0078d4] shadow-xs hover:shadow-md transition">
          <div className="text-[11px] font-bold text-[#0078d4] flex items-center justify-between">
            <span>مبيعات 2026</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#0078d4]" />
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 mt-1 truncate" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(kpiStats.totalSales2026)}
          </div>
          <div className="text-[10px] text-slate-600 font-bold mt-0.5 flex items-center gap-0.5">
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
          </div>
        </div>

        {/* 2026 Collections */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200 border-t-4 border-t-[#107c41] shadow-xs hover:shadow-md transition">
          <div className="text-[11px] font-bold text-[#107c41] flex items-center justify-between">
            <span>تحصيلات 2026</span>
            <DollarSign className="w-3.5 h-3.5 text-[#107c41]" />
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 mt-1 truncate" title={isPrivacyMode ? 'مخفي' : undefined}>
            {formatMoney(kpiStats.totalCollections2026)}
          </div>
          <div className="text-[10px] text-[#107c41] font-extrabold mt-0.5">
            {kpiStats.collectionRate}% نسبة التحصيل
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
                📅 المسار الشهري
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
                🏢 مقارنة الفروع الـ 7
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
                🏆 أعلى المناديب
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
                💳 طرق الدفع والضمانات
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

      {/* Power BI Expanded Slicers & Multi-Filter Bar */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-sm space-y-3">
        {/* Row 1: Search & Primary Selectors */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="analytics-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم، كود العميل، الهاتف، المنطقة، المندوب، أوراق الضمان..."
              className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:border-amber-500 focus:outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Branch Filter (Admin & Dev) */}
          {isAdminOrDev && (
            <select
              id="analytics-branch-select"
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setSelectedRep('ALL');
              }}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">جميع الفروع (الكل)</option>
              {availableBranches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}

          {/* Rep Filter (Admin, Dev, Manager, Supervisor) */}
          {!isRep && (
            <select
              id="analytics-rep-select"
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">جميع المناديب</option>
              {availableReps.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}

          {/* Region Filter */}
          {availableRegions.length > 0 && (
            <select
              id="analytics-region-select"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">جميع المناطق</option>
              {availableRegions.map((reg) => (
                <option key={reg} value={reg}>{reg}</option>
              ))}
            </select>
          )}

          {/* Reset All Filters Button */}
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedBranch('ALL');
              setSelectedRep('ALL');
              setSelectedRegion('ALL');
              setPaymentTermsFilter('ALL');
              setSalesTierFilter('ALL');
              setCollectionRateFilter('ALL');
              setGuaranteeFilter('ALL');
              setDebtFilter('ALL');
              setActivityFilter('ALL');
              setOrderFilter('ALL');
              setVisitFilter('ALL');
            }}
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition cursor-pointer whitespace-nowrap"
            title="إعادة ضبط جميع الفلاتر"
          >
            إلغاء الفلاتر 🔄
          </button>
        </div>

        {/* Sub-Filters Slicers Grid (Power BI Style Chiclets) */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-100">
          {/* Slicer Row 1: Payment Terms & Sales Tiers */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            {/* Payment Terms Slicer (طرق الدفع) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-slate-500 ml-1">طرق الدفع:</span>
              <button
                type="button"
                onClick={() => setPaymentTermsFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  paymentTermsFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setPaymentTermsFilter('كاش')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  paymentTermsFilter === 'كاش' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                كاش (نقدي) 💵
              </button>
              <button
                type="button"
                onClick={() => setPaymentTermsFilter('على دفعات')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  paymentTermsFilter === 'على دفعات' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                على دفعات 📅
              </button>
              <button
                type="button"
                onClick={() => setPaymentTermsFilter('شيكات')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  paymentTermsFilter === 'شيكات' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                }`}
              >
                شيكات بنكية 📜
              </button>
              <button
                type="button"
                onClick={() => setPaymentTermsFilter('آجل')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  paymentTermsFilter === 'آجل' ? 'bg-sky-600 text-white shadow-xs' : 'bg-sky-50 text-sky-800 hover:bg-sky-100'
                }`}
              >
                آجل تجاري 🏷️
              </button>
            </div>

            {/* Sales Tiers Slicer (شرائح المبيعات 2026) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-slate-500 ml-1">شرائح مبيعات 2026:</span>
              <button
                type="button"
                onClick={() => setSalesTierFilter('ALL')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  salesTierFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setSalesTierFilter('vip_100k')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  salesTierFilter === 'vip_100k' ? 'bg-amber-500 text-slate-950 font-black shadow-xs' : 'bg-amber-50 text-amber-900'
                }`}
              >
                ⭐ كبار العملاء VIP ({'>'}100k)
              </button>
              <button
                type="button"
                onClick={() => setSalesTierFilter('medium_20k_100k')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  salesTierFilter === 'medium_20k_100k' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-800'
                }`}
              >
                متوسط (20k - 100k)
              </button>
              <button
                type="button"
                onClick={() => setSalesTierFilter('starter_under_20k')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  salesTierFilter === 'starter_under_20k' ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-800'
                }`}
              >
                نشط ({'<'}20k)
              </button>
              <button
                type="button"
                onClick={() => setSalesTierFilter('zero_sales')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  salesTierFilter === 'zero_sales' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800'
                }`}
              >
                بدون مبيعات (0)
              </button>
            </div>
          </div>

          {/* Slicer Row 2: Guarantee Documents & Collection Rate */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100">
            {/* Guarantee Documents Slicer (أوراق الضمان) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-slate-500 ml-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>أوراق الضمان:</span>
              </span>
              <button
                type="button"
                onClick={() => setGuaranteeFilter('ALL')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setGuaranteeFilter('has_guarantee')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'has_guarantee' ? 'bg-emerald-700 text-white shadow-xs' : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                ماضي على ورق ضمان بالمبلغ 🛡️
              </button>
              <button
                type="button"
                onClick={() => setGuaranteeFilter('cheque')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'cheque' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                شيك بنكي
              </button>
              <button
                type="button"
                onClick={() => setGuaranteeFilter('promissory')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'promissory' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                كمبيالة
              </button>
              <button
                type="button"
                onClick={() => setGuaranteeFilter('trust_receipt')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'trust_receipt' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                إيصال أمانة
              </button>
              <button
                type="button"
                onClick={() => setGuaranteeFilter('unsecured')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'unsecured' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                لا يوجد ورق ضمان (0)
              </button>
            </div>

            {/* Collection Performance Slicer */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-slate-500 ml-1">كفاءة التحصيل:</span>
              <button
                type="button"
                onClick={() => setCollectionRateFilter('ALL')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  collectionRateFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setCollectionRateFilter('high_80')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  collectionRateFilter === 'high_80' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                تحصيل ممتاز (≥80%)
              </button>
              <button
                type="button"
                onClick={() => setCollectionRateFilter('medium_30_79')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  collectionRateFilter === 'medium_30_79' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800'
                }`}
              >
                تحصيل متوسط (30%-79%)
              </button>
              <button
                type="button"
                onClick={() => setCollectionRateFilter('low_zero')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  collectionRateFilter === 'low_zero' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800'
                }`}
              >
                ضعيف أو صفر ({'<'}30%)
              </button>
            </div>
          </div>

          {/* Slicer Row 3: Debt, Activity, Orders & Visits */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100">
            {/* Debt & Overdue Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-slate-500 ml-1">المديونية والمستحقات:</span>
              <button
                type="button"
                onClick={() => setDebtFilter('ALL')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  debtFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setDebtFilter('has_debt')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  debtFilter === 'has_debt' ? 'bg-purple-700 text-white' : 'bg-purple-50 text-purple-700'
                }`}
              >
                عليه مديونية
              </button>
              <button
                type="button"
                onClick={() => setDebtFilter('has_overdue')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  debtFilter === 'has_overdue' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-700'
                }`}
              >
                مستحقات واجبة السداد ⚠️
              </button>
              <button
                type="button"
                onClick={() => setDebtFilter('over_limit')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  debtFilter === 'over_limit' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700'
                }`}
              >
                متجاوز الحد الائتماني
              </button>
              <button
                type="button"
                onClick={() => setDebtFilter('zero_debt')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  debtFilter === 'zero_debt' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                خالص الرصيد
              </button>
            </div>

            {/* Activity 2026 & Orders & Visits */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-slate-500 ml-1">حالة 2026 والطلبيات:</span>
              <button
                type="button"
                onClick={() => setActivityFilter('ALL')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  activityFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setActivityFilter('active_2026')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  activityFilter === 'active_2026' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                نشط 2026 ✅
              </button>
              <button
                type="button"
                onClick={() => setActivityFilter('churn_risk')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  activityFilter === 'churn_risk' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-700'
                }`}
              >
                مهدد بالتوقف ⚠️
              </button>
              <button
                type="button"
                onClick={() => setActivityFilter('new_customer')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  activityFilter === 'new_customer' ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-700'
                }`}
              >
                عميل جديد 🆕
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter(orderFilter === 'has_order' ? 'ALL' : 'has_order')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  orderFilter === 'has_order' ? 'bg-teal-700 text-white shadow-xs' : 'bg-teal-50 text-teal-800'
                }`}
              >
                لديه طلبية 🛒
              </button>
              <button
                type="button"
                onClick={() => setVisitFilter(visitFilter === 'visited_2026' ? 'ALL' : 'visited_2026')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  visitFilter === 'visited_2026' ? 'bg-purple-700 text-white shadow-xs' : 'bg-purple-50 text-purple-800'
                }`}
              >
                تمت زيارته 📍
              </button>
            </div>
          </div>
        </div>
      </div>

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
          <div className="overflow-x-auto">
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
                            {onOpenNewOrderForCustomer ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenNewOrderForCustomer(c);
                                }}
                                className="px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-[10px] transition flex items-center gap-1 cursor-pointer"
                                title="إنشاء أمر بيع جديد للعميل"
                              >
                                <Plus className="w-3 h-3" />
                                <span>+ طلبية</span>
                              </button>
                            ) : (
                              <span className="text-slate-400 text-[11px]">لا يوجد أمر</span>
                            )}
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
                              <span className="hidden xl:inline">كاشير</span>
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
