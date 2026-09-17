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
  Area
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
    invoices = []
  } = useApp();

  // Roles
  const isRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isBranchManager = currentUser?.role === 'branch_manager';
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

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

  // Sorting
  const [sortBy, setSortBy] = useState<'name' | 'code' | 'balance' | 'overdue' | 'creditLimit' | 'sales2026' | 'collections2026' | 'lastVisit' | 'order'>('sales2026');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination for high-performance (4000+ items)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // BI Charts Toggle
  const [showCharts, setShowCharts] = useState(false);

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

  // Helper: Guarantee badge styling
  const getGuaranteeBadge = (docStr?: string, creditLimit?: number) => {
    const g = (docStr || '').trim().toLowerCase();
    if (g.includes('شيك')) {
      return { label: docStr || 'شيك بنكي', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    }
    if (g.includes('كمبيال')) {
      return { label: docStr || 'كمبيالة', color: 'bg-blue-100 text-blue-800 border-blue-300' };
    }
    if (g.includes('أمانة') || g.includes('امانة')) {
      return { label: docStr || 'إيصال أمانة', color: 'bg-purple-100 text-purple-800 border-purple-300' };
    }
    if (g.includes('رهن')) {
      return { label: docStr || 'رهن ضامن', color: 'bg-amber-100 text-amber-800 border-amber-300' };
    }
    if (creditLimit && creditLimit > 0) {
      return { label: docStr || 'شيك بنكي', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    }
    return { label: docStr || 'بدون ضمان', color: 'bg-slate-100 text-slate-600 border-slate-200' };
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

    // Guarantee Documents filter (أوراق الضمان)
    if (guaranteeFilter !== 'ALL') {
      list = list.filter((c) => {
        const g = (c.guaranteeDocs || '').toLowerCase();
        if (guaranteeFilter === 'has_guarantee') {
          return (g && !g.includes('بدون')) || (c.creditLimit && c.creditLimit > 0);
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
          return !g || g.includes('بدون') || g === 'none';
        }
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
        valA = a.sales2026 || 0;
        valB = b.sales2026 || 0;
      } else if (sortBy === 'collections2026') {
        valA = a.collections2026 || 0;
        valB = b.collections2026 || 0;
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
  }, [userVisibleCustomers, selectedBranch, selectedRep, selectedRegion, activityFilter, debtFilter, orderFilter, guaranteeFilter, visitFilter, searchQuery, sortBy, sortOrder]);

  // Reset pagination on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBranch, selectedRep, selectedRegion, activityFilter, debtFilter, orderFilter, guaranteeFilter, visitFilter, searchQuery, pageSize]);

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
      const s26 = c.sales2026 || 0;
      const c25 = c.collections2025 || 0;
      const c26 = c.collections2026 || 0;
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
          <button
            onClick={() => setShowCharts(!showCharts)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer whitespace-nowrap ${
              showCharts
                ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>{showCharts ? 'إخفاء مؤشرات الرسوم' : 'عرض رسوم BI البيانية'}</span>
          </button>

          {/* Export & Import (Only for Admin, Dev, Branch Manager) */}
          {isAdminOrDev && (
            <button
              onClick={() => setIsSyncModalOpen(true)}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 px-3.5 py-2 rounded-xl text-xs font-black shadow-sm transition border border-slate-750 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>مزامنة شيت المديونية / إكسل 📥</span>
            </button>
          )}

          <button
            onClick={() => exportCustomerAnalyticsToExcel(filteredCustomers, 'كافة_العملاء_دريم')}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer whitespace-nowrap"
            title="تصدير كشف التحليل بالكامل كملف Excel"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير Excel</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip (High Contrast & Clear Readability) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
        {/* Total Customers */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
            <span>إجمالي العملاء</span>
            <Users className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-lg font-black text-slate-900 mt-1">
            {kpiStats.totalCount.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {kpiStats.active2026Count} نشط ({kpiStats.activeRate}%)
          </div>
        </div>

        {/* 2026 Sales & Growth */}
        <div className="bg-white rounded-2xl p-3 border border-blue-200/60 bg-blue-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-blue-700 flex items-center justify-between">
            <span>مبيعات 2026</span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-blue-900 mt-1 truncate">
            {formatCurrency(kpiStats.totalSales2026)}
          </div>
          <div className="text-[10px] text-blue-700 font-bold mt-0.5 flex items-center gap-0.5">
            {kpiStats.salesGrowth >= 0 ? (
              <span className="text-emerald-600 flex items-center">
                <ArrowUpRight className="w-3 h-3" /> +{kpiStats.salesGrowth}%
              </span>
            ) : (
              <span className="text-rose-600 flex items-center">
                <ArrowDownRight className="w-3 h-3" /> {kpiStats.salesGrowth}%
              </span>
            )}
            <span className="text-slate-400">مقارنة بـ 2025</span>
          </div>
        </div>

        {/* 2026 Collections */}
        <div className="bg-white rounded-2xl p-3 border border-emerald-200/60 bg-emerald-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-emerald-800 flex items-center justify-between">
            <span>تحصيلات 2026</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-emerald-900 mt-1 truncate">
            {formatCurrency(kpiStats.totalCollections2026)}
          </div>
          <div className="text-[10px] text-emerald-700 font-bold mt-0.5">
            {kpiStats.collectionRate}% نسبة التحصيل
          </div>
        </div>

        {/* Current Debt */}
        <div className="bg-white rounded-2xl p-3 border border-purple-200/60 bg-purple-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-purple-700 flex items-center justify-between">
            <span>المديونية الحالية</span>
            <CreditCard className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-purple-900 mt-1 truncate">
            {formatCurrency(kpiStats.totalDebt)}
          </div>
          <div className="text-[10px] text-purple-600 font-bold mt-0.5">
            إجمالي حسابات العملاء
          </div>
        </div>

        {/* Overdue & Due Balances */}
        <div className="bg-white rounded-2xl p-3 border border-rose-200/60 bg-rose-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-rose-700 flex items-center justify-between">
            <span>المستحقات والمتأخرات</span>
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-rose-700 mt-1 truncate">
            {formatCurrency(kpiStats.totalOverdue)}
          </div>
          <div className="text-[10px] text-rose-600 font-bold mt-0.5">
            واجبة التحصيل الفوري
          </div>
        </div>

        {/* Credit Limit & Guarantees */}
        <div className="bg-white rounded-2xl p-3 border border-amber-200/60 bg-amber-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-amber-800 flex items-center justify-between">
            <span>الحد والضمانات</span>
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-amber-900 mt-1 truncate">
            {formatCurrency(kpiStats.totalCreditLimit)}
          </div>
          <div className="text-[10px] text-amber-700 font-bold mt-0.5 flex items-center justify-between">
            <span>{kpiStats.guaranteedCount} بضمان</span>
            {kpiStats.overLimitCount > 0 && (
              <span className="text-rose-600 font-black">({kpiStats.overLimitCount} متجاوز)</span>
            )}
          </div>
        </div>

        {/* Sales Orders */}
        <div className="bg-white rounded-2xl p-3 border border-teal-200/60 bg-teal-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-teal-800 flex items-center justify-between">
            <span>أوامر البيع والطلبيات</span>
            <ShoppingCart className="w-3.5 h-3.5 text-teal-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-teal-900 mt-1 truncate">
            {kpiStats.customersWithOrdersCount} عميل
          </div>
          <div className="text-[10px] text-teal-700 font-bold mt-0.5 truncate">
            قيمة: {formatCurrency(kpiStats.totalOrdersValue)}
          </div>
        </div>
      </div>

      {/* BI Analytics Visuals (Toggleable) */}
      {showCharts && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4 animate-in slide-in-from-top-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-500" />
              <span>منحنى المبيعات مقابل التحصيل الشهري لعام 2026 (يناير - ديسمبر)</span>
            </h2>
            <span className="text-xs text-slate-400">تحديث تلقائي حسب الفلاتر المختارة</span>
          </div>

          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kpiStats.monthlyChartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(val: any) => formatCurrency(Number(val) || 0)}
                  contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', border: 'none' }}
                />
                <Legend />
                <Bar dataKey="مبيعات 2026" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="تحصيلات 2026" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Multi-Filter Search Bar */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم، كود العميل، الهاتف، المنطقة، أو المندوب..."
              className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:border-amber-500 focus:outline-none transition"
            />
            {searchQuery && (
              <button
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
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setSelectedRep('ALL');
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500"
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
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500"
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
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">جميع المناطق</option>
              {availableRegions.map((reg) => (
                <option key={reg} value={reg}>{reg}</option>
              ))}
            </select>
          )}
        </div>

        {/* Sub-Filters Pill Row */}
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
          {/* Row 1: Activity & Debt/Overdue */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-slate-400 ml-1">حالة 2026:</span>
              <button
                onClick={() => setActivityFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activityFilter === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setActivityFilter('active_2026')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activityFilter === 'active_2026'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                نشط 2026 ✅
              </button>
              <button
                onClick={() => setActivityFilter('churn_risk')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activityFilter === 'churn_risk'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                مهدد بالتوقف ⚠️
              </button>
              <button
                onClick={() => setActivityFilter('new_customer')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activityFilter === 'new_customer'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                عميل جديد 2026 🆕
              </button>
            </div>

            {/* Debt & Overdue Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-slate-400 ml-1">المديونية والمستحقات:</span>
              <button
                onClick={() => setDebtFilter('ALL')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  debtFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setDebtFilter('has_debt')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  debtFilter === 'has_debt' ? 'bg-purple-700 text-white' : 'bg-purple-50 text-purple-700'
                }`}
              >
                عليه مديونية
              </button>
              <button
                onClick={() => setDebtFilter('has_overdue')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  debtFilter === 'has_overdue' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-700'
                }`}
              >
                مستحقات واجبة السداد ⚠️
              </button>
              <button
                onClick={() => setDebtFilter('over_limit')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  debtFilter === 'over_limit' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700'
                }`}
              >
                متجاوز الحد الائتماني
              </button>
              <button
                onClick={() => setDebtFilter('zero_debt')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  debtFilter === 'zero_debt' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                خالص الرصيد
              </button>
            </div>
          </div>

          {/* Row 2: Sales Orders & Guarantee Documents */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100">
            {/* Sales Orders Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-slate-400 ml-1 flex items-center gap-1">
                <ShoppingCart className="w-3 h-3 text-teal-600" />
                <span>أمر البيع والطلبيات:</span>
              </span>
              <button
                onClick={() => setOrderFilter('ALL')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  orderFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setOrderFilter('has_order')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  orderFilter === 'has_order' ? 'bg-teal-700 text-white' : 'bg-teal-50 text-teal-800'
                }`}
              >
                لديه طلبية مسجلة 🛒
              </button>
              <button
                onClick={() => setOrderFilter('active_order')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  orderFilter === 'active_order' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-800'
                }`}
              >
                طلبية قيد التجهيز / معتمدة
              </button>
              <button
                onClick={() => setOrderFilter('no_order')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  orderFilter === 'no_order' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800'
                }`}
              >
                بدون طلبية (فرصة بيع)
              </button>
            </div>

            {/* Guarantee Documents Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-bold text-slate-400 ml-1 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>أوراق الضمان:</span>
              </span>
              <button
                onClick={() => setGuaranteeFilter('ALL')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setGuaranteeFilter('has_guarantee')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'has_guarantee' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                بأوراق ضمان 🛡️
              </button>
              <button
                onClick={() => setGuaranteeFilter('cheque')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'cheque' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                شيك بنكي
              </button>
              <button
                onClick={() => setGuaranteeFilter('promissory')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'promissory' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                كمبيالة
              </button>
              <button
                onClick={() => setGuaranteeFilter('trust_receipt')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'trust_receipt' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                إيصال أمانة
              </button>
              <button
                onClick={() => setGuaranteeFilter('unsecured')}
                className={`px-2 py-0.8 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  guaranteeFilter === 'unsecured' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                بدون ضمان
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
                  const s26 = c.sales2026 || 0;
                  const col26 = c.collections2026 || 0;
                  const colRate = s26 > 0 ? Math.round((col26 / s26) * 100) : (col26 > 0 ? 100 : 0);
                  const guaranteeInfo = getGuaranteeBadge(c.guaranteeDocs, limit);
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
                          {formatCurrency(bal)}
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
                              {formatCurrency(overdue)}
                            </div>
                            <span className="inline-block text-[9px] px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 font-bold border border-rose-200 mt-0.5">
                              واجب التحصيل
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-medium">0.00 ج.م</span>
                        )}
                      </td>

                      {/* الحد الائتماني */}
                      <td className="p-3 text-left font-mono whitespace-nowrap">
                        {limit > 0 ? (
                          <div>
                            <div className="font-bold text-slate-800">
                              {formatCurrency(limit)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              المتبقي: {formatCurrency(Math.max(0, limit - bal))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">بدون حد (نقدي)</span>
                        )}
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
                        {formatCurrency(s26)}
                      </td>

                      {/* التحصيل 2026 */}
                      <td className="p-3 text-left font-mono whitespace-nowrap">
                        <div className="font-black text-emerald-800">
                          {formatCurrency(col26)}
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
                                {formatCurrency(orderSummary.latestOrder.total)}
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
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col my-auto">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-t-3xl flex items-start justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-lg">
                  {selectedCustomer.name.slice(0, 1)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-base sm:text-lg text-white">
                      {selectedCustomer.name}
                    </h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-white/10 text-amber-300 font-bold">
                      {selectedCustomer.code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-2">
                    <span>الفرع: {selectedCustomer.branchName}</span>
                    <span>•</span>
                    <span>المندوب: {selectedCustomer.salesRepName || selectedCustomer.repName || 'غير محدد'}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedCustomer(null);
                  setIsLoggingVisit(false);
                }}
                className="p-1.5 text-slate-300 hover:text-white rounded-xl hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-5">
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
                <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200">
                  <div className="text-[11px] font-bold text-blue-700">مبيعات 2026</div>
                  <div className="text-base font-black text-blue-900 mt-1">
                    {formatCurrency(selectedCustomer.sales2026 || 0)}
                  </div>
                  <div className="text-[10px] text-blue-600 mt-0.5">
                    2025: {formatCurrency(selectedCustomer.sales2025 || 0)}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[11px] font-bold text-emerald-700">تحصيلات 2026</div>
                  <div className="text-base font-black text-emerald-900 mt-1">
                    {formatCurrency(selectedCustomer.collections2026 || 0)}
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-0.5">
                    2025: {formatCurrency(selectedCustomer.collections2025 || 0)}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200">
                  <div className="text-[11px] font-bold text-purple-700">المديونية الحالية</div>
                  <div className="text-base font-black text-purple-900 mt-1">
                    {formatCurrency(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0)}
                  </div>
                  <div className="text-[10px] text-purple-600 mt-0.5">
                    الحد: {formatCurrency(selectedCustomer.creditLimit || 0)}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200">
                  <div className="text-[11px] font-bold text-rose-700">المستحقات الواجبة</div>
                  <div className="text-base font-black text-rose-800 mt-1">
                    {formatCurrency(selectedCustomer.totalOverdueAndDue ?? selectedCustomer.overdueBalance ?? 0)}
                  </div>
                  <div className="text-[10px] text-rose-600 mt-0.5">
                    واجبة التحصيل فوراً
                  </div>
                </div>
              </div>

              {/* Credit Limit & Guarantees Dossier (View & Quick Edit) */}
              <div className="p-4 bg-gradient-to-r from-amber-50/70 to-orange-50/40 rounded-2xl border border-amber-200/80 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <span>ملف الائتمان وأوراق الضمان والزيارة القادمة</span>
                  </h4>
                  <button
                    onClick={handleSaveCustomerDossier}
                    className="px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-black text-xs transition flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>حفظ التعديلات في ملف العميل</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      الحد الائتماني المعتمد (ج.م):
                    </label>
                    <input
                      type="number"
                      value={editCreditLimit}
                      onChange={(e) => setEditCreditLimit(Number(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      نوع ورقة الضمان:
                    </label>
                    <select
                      value={editGuaranteeDocs}
                      onChange={(e) => setEditGuaranteeDocs(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                    >
                      <option value="شيك بنكي">شيك بنكي</option>
                      <option value="كمبيالة">كمبيالة</option>
                      <option value="إيصال أمانة">إيصال أمانة</option>
                      <option value="رهن عقاري">رهن عقاري</option>
                      <option value="خطاب ضمان">خطاب ضمان بنكي</option>
                      <option value="نقدي فقط">نقدي فقط (بدون ضمان)</option>
                      <option value="بدون ضمان">بدون ضمان</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      المستحقات والمتأخرات (ج.م):
                    </label>
                    <input
                      type="number"
                      value={editOverdueBalance}
                      onChange={(e) => setEditOverdueBalance(Number(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-rose-700"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                      تاريخ الزيارة القادمة:
                    </label>
                    <input
                      type="date"
                      value={editNextVisitDate}
                      onChange={(e) => setEditNextVisitDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Sales Orders & Invoices of the Customer (أمر البيع لو عامل طلبية) */}
              {(() => {
                const customerOrders = customerOrdersLookup.getOrdersForCustomer(selectedCustomer);

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                        <ShoppingCart className="w-3.5 h-3.5 text-teal-600" />
                        <span>أوامر البيع والطلبيات المسجلة للعميل ({customerOrders.length})</span>
                      </h4>
                      {onOpenNewOrderForCustomer && (
                        <button
                          onClick={() => {
                            onOpenNewOrderForCustomer(selectedCustomer);
                            setSelectedCustomer(null);
                          }}
                          className="px-3 py-1 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-black text-xs transition flex items-center gap-1 cursor-pointer"
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
                            className="px-3 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition cursor-pointer"
                          >
                            + بدء طلبية وفاتورة كاشير جديدة
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 12 Months Breakdown Table (Jan - Dec 2026) */}
              <div className="space-y-2">
                <h4 className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  <span>تفاصيل المبيعات والتحصيلات الشهرية لعام 2026 (12 شهراً)</span>
                </h4>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-center text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                        <th className="p-2 text-right">الشهر</th>
                        <th className="p-2 text-blue-700">المبيعات (ج.م)</th>
                        <th className="p-2 text-emerald-700">التحصيلات (ج.م)</th>
                        <th className="p-2">نسبة السداد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {MONTH_NAMES_AR.map((monthName, idx) => {
                        const mNum = idx + 1;
                        const s = selectedCustomer.monthlySales2026?.[mNum] || 0;
                        const col = selectedCustomer.monthlyCollections2026?.[mNum] || 0;
                        const rate = s > 0 ? Math.round((col / s) * 100) : (col > 0 ? 100 : 0);

                        return (
                          <tr key={monthName} className="hover:bg-slate-50">
                            <td className="p-2 text-right font-bold text-slate-800">
                              {monthName} (شهر {mNum})
                            </td>
                            <td className="p-2 font-mono font-bold text-blue-800">
                              {s > 0 ? formatCurrency(s) : <span className="text-slate-300">---</span>}
                            </td>
                            <td className="p-2 font-mono font-bold text-emerald-800">
                              {col > 0 ? formatCurrency(col) : <span className="text-slate-300">---</span>}
                            </td>
                            <td className="p-2">
                              {s > 0 || col > 0 ? (
                                <span className={`font-black text-[11px] px-2 py-0.5 rounded-full ${
                                  rate >= 90 ? 'bg-emerald-100 text-emerald-800' : rate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {rate}%
                                </span>
                              ) : (
                                <span className="text-slate-300">---</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

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

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 rounded-b-3xl flex items-center justify-between">
              <div className="text-xs text-slate-400">
                المنطقة: {selectedCustomer.region || selectedCustomer.address || 'غير محددة'}
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition cursor-pointer"
              >
                إغلاق
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
