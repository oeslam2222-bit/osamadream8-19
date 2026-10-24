import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  FileSpreadsheet,
  RefreshCw,
  Edit,
  Trash2,
  Phone,
  MapPin,
  Building2,
  UserCheck,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ShoppingCart,
  ArrowUpDown,
  Download,
  Upload,
  X,
  Save,
  MessageCircle,
  ExternalLink,
  ShieldAlert,
  Layers,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  UserPlus,
  Link2,
  TrendingUp,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Customer, User } from '../types';
import { formatCurrency } from '../services/invoiceService';
import {
  doesCustomerBelongToRep,
  doesCustomerBelongToBranch,
  doesCustomerBelongToSupervisor,
  isArabicNameMatch,
  normalizeArabicText,
  isBranchMatch
} from '../services/arabicMatchingService';
import { parseExcelCustomers, parseRawRowsToCustomers } from '../services/excelService';
import { getSavedSourceUrl, saveSingleSourceUrl, getSavedSheetHistory } from '../services/dataSourceService';
import { resolveCustomerBalanceValue, resolveCustomerDuesValue } from '../services/customerDues';
import { isSummaryOrTotalRow, resolveNetCollections, resolveCollectionsMagnitude } from '../services/customerFinancialService';
import * as XLSX from 'xlsx';

interface CustomerDirectoryViewProps {
  onOpenNewOrderForCustomer?: (customer: Customer) => void;
}

export const CustomerDirectoryView: React.FC<CustomerDirectoryViewProps> = ({
  onOpenNewOrderForCustomer,
}) => {
  const {
    customers,
    users,
    currentUser,
    branches,
    getVisibleCustomers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    importCustomersList,
    refreshCustomerRepLinks,
    autoCreateMissingRepsFromCustomers,
  } = useApp();

  // Roles & Scopes
  const isRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isBranchManager = currentUser?.role === 'branch_manager';
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const [scopeTab, setScopeTab] = useState<'my_customers' | 'branch' | 'all'>(() => {
    if (isRep) return 'my_customers';
    if (isSupervisor || isBranchManager) return 'branch';
    return 'all';
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('الكل');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('الكل');

  useEffect(() => {
    if (!currentUser) return;
    if (isRep) {
      setScopeTab('my_customers');
      setSelectedBranch(currentUser.branchName || '');
      setSelectedRepFilter(currentUser.id);
    } else if (isSupervisor || isBranchManager) {
      setScopeTab('branch');
      setSelectedBranch(currentUser.branchName || '');
      setSelectedRepFilter('الكل');
    }
  }, [currentUser?.id, currentUser?.branchName, isRep, isSupervisor, isBranchManager]);
  const [debtFilter, setDebtFilter] = useState<'all' | 'has_debt' | 'has_overdue' | 'exceeded_limit' | 'zero_debt'>('all');
  const [sortField, setSortField] = useState<'name' | 'code' | 'overdue' | 'debt' | 'sales' | 'collections' | 'limit' | 'branch'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pagination (For smooth rendering of 3400+ customers)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Merged UI state (drawer + selection) — UI only
  const [drawerCustomer, setDrawerCustomer] = useState<Customer | null>(null);
  const [drawerTab, setDrawerTab] = useState<'financial' | 'visits' | 'orders'>('financial');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{
    show: boolean;
    msg: string;
    type: 'success' | 'info' | 'warning';
  } | null>(null);

  // Import Modal State
  const defaultCustomerSheet = 'https://docs.google.com/spreadsheets/d/1eVQrSKbXVIBwx5V_K7eqj_cUL6YuCVP33iHo13J7Yp4/edit?usp=sharing';
  // The master customer sheet is the source of truth: each upload replaces the current list.
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('replace');
  const [googleSheetUrl, setGoogleSheetUrl] = useState(() => getSavedSourceUrl('customers') || defaultCustomerSheet);
  const [savedSheetHistory, setSavedSheetHistory] = useState<string[]>(() => getSavedSheetHistory('customers'));
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    customers: Customer[];
    branches: string[];
    reps: string[];
    totalDebt: number;
  } | null>(null);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    id: '',
    code: '',
    name: '',
    storeName: '',
    branchName: currentUser?.branchName || 'فرع الفيوم',
    repName: isRep ? currentUser?.name || '' : '',
    repId: isRep ? currentUser?.id || '' : '',
    totalOverdueAndDue: 0,
    currentBalance: 0,
    creditLimit: 50000,
    phone: '',
    address: '',
    taxNumber: '',
    notes: '',
  });

  // Extract ALL unique Sales Reps from customers (registered + unregistered in customer records)
  const allAvailableReps = useMemo(() => {
    const sourceCustomers = isAdminOrDev ? customers : getVisibleCustomers();
    const sourceUsers = isAdminOrDev ? users : users.filter((u) => u.id === currentUser?.id || u.supervisorId === currentUser?.id);
    const repMap = new Map<string, {
      name: string;
      branchName: string;
      customerCount: number;
      isRegisteredUser: boolean;
      userId?: string;
    }>();

    // 1. First scan all customers in the database
    sourceCustomers.forEach((c) => {
      const rawRep = (c.salesRepName || c.repName || '').trim();
      if (!rawRep || rawRep === 'مندوب المبيعات' || rawRep === 'المندوب' || rawRep === 'غير محدد' || rawRep === '---') {
        return;
      }

      const matchedUser = users.find((u) => u.id === c.repId || isArabicNameMatch(rawRep, u.name));
      const existing = repMap.get(rawRep);
      if (existing) {
        existing.customerCount++;
        if (!existing.branchName && c.branchName) existing.branchName = c.branchName;
        if (matchedUser) {
          existing.isRegisteredUser = true;
          existing.userId = matchedUser.id;
        }
      } else {
        repMap.set(rawRep, {
          name: rawRep,
          branchName: c.branchName || (matchedUser ? matchedUser.branchName || '' : ''),
          customerCount: 1,
          isRegisteredUser: !!matchedUser,
          userId: matchedUser ? matchedUser.id : undefined,
        });
      }
    });

    // 2. Also include all registered sales reps / supervisors from users list
    sourceUsers
      .filter((u) => u.role === 'sales_rep' || u.role === 'supervisor')
      .forEach((u) => {
        if (!repMap.has(u.name)) {
          repMap.set(u.name, {
            name: u.name,
            branchName: u.branchName || '',
            customerCount: sourceCustomers.filter((c) => doesCustomerBelongToRep(c, u)).length,
            isRegisteredUser: true,
            userId: u.id,
          });
        }
      });

    const unique = new Map<string, (typeof repMap extends Map<string, infer V> ? V : never)>();
    repMap.forEach((rep) => {
      const key = normalizeArabicText(rep.name).replace(/\s+/g, '');
      if (!unique.has(key)) unique.set(key, rep);
    });
    return Array.from(unique.values()).sort((a, b) => b.customerCount - a.customerCount);
  }, [customers, users, currentUser, isAdminOrDev, getVisibleCustomers]);

  // Unregistered reps count
  const unregisteredReps = useMemo(() => {
    return allAvailableReps.filter((r) => !r.isRegisteredUser && r.name && r.name.length > 2);
  }, [allAvailableReps]);

  // Extract ALL unique Branches from branches + customers (strictly filtered for non-admins)
  const allAvailableBranches = useMemo(() => {
    if (!isAdminOrDev) {
      return currentUser?.branchName ? [currentUser.branchName] : [];
    }
    const branchSet = new Set<string>();
    branches.filter((b) => !b.isMainWarehouse).forEach((b) => branchSet.add(b.name));
    const visibleCustomers = customers;
    visibleCustomers.forEach((c) => {
      if (c.branchName && c.branchName.trim()) {
        const norm = c.branchName.trim().startsWith('فرع') ? c.branchName.trim() : `فرع ${c.branchName.trim()}`;
        branchSet.add(norm);
      }
    });
    return Array.from(branchSet);
  }, [branches, customers, isAdminOrDev, currentUser]);

  // The context owns the privacy boundary; tabs can only narrow that list.
  const scopedCustomerRecords = useMemo(() => {
    const visibleCustomers = getVisibleCustomers();
    if (!currentUser) return [];
    // Reps are strictly and unconditionally locked to their own customers
    if (isRep) {
      return visibleCustomers.filter((c) => doesCustomerBelongToRep(c, currentUser));
    }
    if (scopeTab === 'my_customers') {
      return visibleCustomers.filter((c) => doesCustomerBelongToRep(c, currentUser));
    }
    return visibleCustomers;
  }, [getVisibleCustomers, currentUser, isRep, scopeTab]);

  const scopedCustomers = useMemo(
    () => scopedCustomerRecords.filter((customer) =>
      !isSummaryOrTotalRow(customer.name, customer.code, customer.branchName, customer.salesRepName || customer.repName)
    ),
    [scopedCustomerRecords]
  );

  // Filter & Search Logic
  const filteredCustomers = useMemo(() => {
    const query = normalizeArabicText(searchQuery);

    return scopedCustomers.filter((c) => {
      // Branch filter (applied for supervisors/admins; reps are already strictly scoped to their own customers)
      if (!isRep && selectedBranch !== 'الكل') {
        if (!doesCustomerBelongToBranch(c, selectedBranch, users)) {
          return false;
        }
      }

      // Rep filter (applied for supervisors/admins; reps are already strictly scoped to their own customers)
      if (!isRep && selectedRepFilter !== 'الكل') {
        const tempRepUser = users.find(
          (u) => u.id === selectedRepFilter || u.name === selectedRepFilter || isArabicNameMatch(u.name, selectedRepFilter)
        ) || {
          id: selectedRepFilter,
          name: selectedRepFilter,
          role: 'sales_rep' as const,
        };
        const repName = c.salesRepName || c.repName || '';
        const isMatch =
          doesCustomerBelongToRep(c, tempRepUser as User) ||
          isArabicNameMatch(repName, selectedRepFilter) ||
          c.repId === selectedRepFilter ||
          (repName && repName.includes(selectedRepFilter));

        if (!isMatch) return false;
      }

      // Debt filter
      const debt = Number(c.currentBalance ?? c.balance ?? 0);
      const overdueDue = resolveCustomerDuesValue(c);
      const limit = Number(c.creditLimit || 0);

      if (debtFilter === 'has_debt' && debt <= 0) return false;
      if (debtFilter === 'has_overdue' && overdueDue <= 0) return false;
      if (debtFilter === 'zero_debt' && debt > 0 && overdueDue > 0) return false;
      if (debtFilter === 'exceeded_limit' && (limit <= 0 || debt <= limit)) return false;

      // Text Search across all fields
      if (query) {
        const nameNorm = normalizeArabicText(c.name);
        const storeNorm = normalizeArabicText(c.storeName);
        const codeNorm = (c.code || '').toLowerCase();
        const repNorm = normalizeArabicText(c.salesRepName || c.repName);
        const branchNorm = normalizeArabicText(c.branchName);
        const phone = (c.phone || '').replace(/[^0-9]/g, '');
        const addressNorm = normalizeArabicText(c.address);
        const notesNorm = normalizeArabicText(c.notes);

        const match =
          nameNorm.includes(query) ||
          storeNorm.includes(query) ||
          codeNorm.includes(query.toLowerCase()) ||
          repNorm.includes(query) ||
          branchNorm.includes(query) ||
          phone.includes(query) ||
          addressNorm.includes(query) ||
          notesNorm.includes(query);

        if (!match) return false;
      }

      return true;
    });
  }, [scopedCustomers, searchQuery, selectedBranch, selectedRepFilter, debtFilter, scopeTab, isRep]);

  // Sorting
  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (sortField === 'name') {
        valA = a.name || '';
        valB = b.name || '';
        return sortDirection === 'asc' ? valA.localeCompare(valB, 'ar') : valB.localeCompare(valA, 'ar');
      }
      if (sortField === 'code') {
        valA = a.code || '';
        valB = b.code || '';
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortField === 'overdue') {
        valA = resolveCustomerDuesValue(a);
        valB = resolveCustomerDuesValue(b);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      if (sortField === 'debt') {
        valA = resolveCustomerBalanceValue(a);
        valB = resolveCustomerBalanceValue(b);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      if (sortField === 'sales') {
        const mSumA = a.monthlySales2026 ? Object.values(a.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
        valA = Math.max(Number(a.sales2026 || 0), Number(a.totalMonthlySales || 0), Number(a.totalOverallSales || 0), mSumA);
        const mSumB = b.monthlySales2026 ? Object.values(b.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
        valB = Math.max(Number(b.sales2026 || 0), Number(b.totalMonthlySales || 0), Number(b.totalOverallSales || 0), mSumB);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      if (sortField === 'collections') {
        // One canonical net per customer: the sheet's own total column, else the
        // sum of its months. Sorting by the largest of several figures (and by
        // per-month absolute values) ordered customers by a number the sheet never
        // reported.
        valA = resolveCollectionsMagnitude(a);
        valB = resolveCollectionsMagnitude(b);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      if (sortField === 'limit') {
        valA = Number(a.creditLimit || 0);
        valB = Number(b.creditLimit || 0);
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      if (sortField === 'branch') {
        valA = a.branchName || '';
        valB = b.branchName || '';
        return sortDirection === 'asc' ? valA.localeCompare(valB, 'ar') : valB.localeCompare(valA, 'ar');
      }
      return 0;
    });
  }, [filteredCustomers, sortField, sortDirection]);

  // Pagination Slice
  const totalPages = Math.ceil(sortedCustomers.length / (pageSize || 1)) || 1;
  const paginatedCustomers = useMemo(() => {
    if (pageSize >= 99999) return sortedCustomers;
    const start = (currentPage - 1) * pageSize;
    return sortedCustomers.slice(start, start + pageSize);
  }, [sortedCustomers, currentPage, pageSize]);

  // Statistical calculations
  const stats = useMemo(() => {
    let totalDebt = 0;
    let totalOverdueAndDue = 0;
    let totalSales = 0;
    let signedTotalCollections = 0;
    let totalLimit = 0;
    let customersWithDebt = 0;
    let customersWithOverdue = 0;
    let customersWithSales = 0;
    let customersWithCollections = 0;
    let customersExceededLimit = 0;

    scopedCustomers.forEach((c) => {
      const debt = Number(c.currentBalance ?? c.balance ?? 0);
      const overdueDue = resolveCustomerDuesValue(c);
      const mSalesSum = c.monthlySales2026 ? Object.values(c.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0) : 0;
      const sales = Math.max(Number(c.sales2026 || 0), Number(c.totalMonthlySales || 0), Number(c.totalOverallSales || 0), mSalesSum);
      const signedCollections = resolveNetCollections(c);
      const limit = Number(c.creditLimit || 0);

      if (debt > 0) {
        totalDebt += debt;
        customersWithDebt++;
      }
      if (overdueDue > 0) {
        totalOverdueAndDue += overdueDue;
        customersWithOverdue++;
      }
      if (sales > 0) {
        totalSales += sales;
        customersWithSales++;
      }
      if (signedCollections !== 0) {
        signedTotalCollections += signedCollections;
        customersWithCollections++;
      }      totalLimit += limit;
      if (limit > 0 && debt > limit) {
        customersExceededLimit++;
      }
    });

    const visibleCustomers = getVisibleCustomers();
    const myCustomersCount = currentUser
      ? visibleCustomers.filter((c) => doesCustomerBelongToRep(c, currentUser)).length
      : 0;

    return {
      totalCount: scopedCustomers.length,
      myCustomersCount,
      totalDebt,
      totalOverdueAndDue,
      totalSales,
      totalCollections: Math.abs(signedTotalCollections),
      customersWithSales,
      customersWithCollections,
      customersWithOverdue,
      totalLimit,
      availableLimit: Math.max(0, totalLimit - totalDebt),
      customersWithDebt,
      customersExceededLimit,
    };
  }, [scopedCustomers, getVisibleCustomers, currentUser]);

  // Handle Sort Click
  const handleSort = (field: 'name' | 'code' | 'overdue' | 'debt' | 'sales' | 'collections' | 'limit' | 'branch') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    const balanceVal = Number(customer.currentBalance ?? customer.balance ?? 0);
    const overdueVal = resolveCustomerDuesValue(customer);
    setFormData({
      id: customer.id,
      code: customer.code || '',
      name: customer.name || '',
      storeName: customer.storeName || customer.name || '',
      branchName: customer.branchName || currentUser?.branchName || 'فرع الفيوم',
      repName: customer.salesRepName || customer.repName || '',
      repId: customer.repId || '',
      totalOverdueAndDue: overdueVal,
      currentBalance: balanceVal,
      creditLimit: Number(customer.creditLimit || 0),
      phone: customer.phone || '',
      address: customer.address || '',
      taxNumber: customer.taxNumber || '',
      notes: customer.notes || '',
    });
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    const nextCode = `CUST-${1000 + customers.length + 1}`;
    setEditingCustomer(null);
    setFormData({
      id: `cust_${Date.now()}`,
      code: nextCode,
      name: '',
      storeName: '',
      branchName: currentUser?.branchName || 'فرع الفيوم',
      repName: isRep ? currentUser?.name || '' : '',
      repId: isRep ? currentUser?.id || '' : '',
      totalOverdueAndDue: 0,
      currentBalance: 0,
      creditLimit: 50000,
      phone: '',
      address: '',
      taxNumber: '',
      notes: '',
    });
    setIsAddModalOpen(true);
  };

  // Save Customer (Add or Edit)
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('يرجى إدخال اسم العميل أو المحل');
      return;
    }

    const currentBal = Number(formData.currentBalance) || 0;
    const overdueDue = formData.totalOverdueAndDue !== undefined && !isNaN(Number(formData.totalOverdueAndDue))
      ? Number(formData.totalOverdueAndDue)
      : currentBal;

    const payload: Customer = {
      id: editingCustomer ? editingCustomer.id : formData.id || `cust_${Date.now()}`,
      code: formData.code.trim() || `CUST-${Math.floor(Math.random() * 9000 + 1000)}`,
      name: formData.name.trim(),
      storeName: formData.storeName.trim() || formData.name.trim(),
      branchName: formData.branchName,
      salesRepName: formData.repName.trim(),
      repName: formData.repName.trim(),
      repId: formData.repId,
      totalOverdueAndDue: overdueDue,
      currentBalance: currentBal,
      balance: currentBal,
      creditLimit: Number(formData.creditLimit) || 0,
      phone: formData.phone.trim(),
      address: formData.address.trim(),
      taxNumber: formData.taxNumber.trim(),
      notes: formData.notes.trim(),
      tier: editingCustomer?.tier || 'متوسط',
      createdAt: editingCustomer?.createdAt || new Date().toISOString(),
    };

    if (editingCustomer) {
      updateCustomer(payload);
      setSyncFeedback({
        show: true,
        msg: `تم تحديث بيانات العميل (${payload.name}) بنجاح!`,
        type: 'success',
      });
    } else {
      addCustomer(payload);
      setSyncFeedback({
        show: true,
        msg: `تمت إضافة العميل الجديد (${payload.name}) بنجاح!`,
        type: 'success',
      });
    }

    setIsAddModalOpen(false);
    setEditingCustomer(null);
  };

  // Quick Claim Customer to Current Rep
  const handleQuickClaimRep = (customer: Customer) => {
    if (!currentUser) return;
    const updated: Customer = {
      ...customer,
      repId: currentUser.id,
      salesRepName: currentUser.name,
      repName: currentUser.name,
      branchName: currentUser.branchName || customer.branchName,
    };
    updateCustomer(updated);
    setSyncFeedback({
      show: true,
      msg: `تم إسناد العميل (${customer.name}) إليك بنجاح!`,
      type: 'success',
    });
  };

  // Run Smart Rep Linker
  const handleRunSync = () => {
    const result = refreshCustomerRepLinks();
    setSyncFeedback({
      show: true,
      msg: `تم فحص ومطابقة العملاء بالمناديب بنجاح! (${result.linkedCustomersCount} عميل مسند، ${result.unassignedCount} عميل بانتظار التوزيع).`,
      type: 'success',
    });
  };

  // Auto Create Accounts for Unregistered Reps
  const handleAutoCreateReps = () => {
    const result = autoCreateMissingRepsFromCustomers();
    setSyncFeedback({
      show: true,
      msg: `تم بنجاح إنشاء (${result.count}) حساب مندوب جديد في النظام وربط عملائهم تلقائياً!`,
      type: 'success',
    });
  };

  // Handle Excel File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const res = await parseExcelCustomers(file);
      if (res.customers.length === 0) {
        alert('لم يتم العثور على أي عملاء صالحين في الملف المرفوع.');
        setIsImporting(false);
        return;
      }

      const branchSet = new Set<string>();
      const repSet = new Set<string>();
      let debt = 0;

      res.customers.forEach((c) => {
        if (c.branchName) branchSet.add(c.branchName);
        if (c.salesRepName || c.repName) repSet.add(c.salesRepName || c.repName || '');
        debt += Number(c.currentBalance ?? c.balance ?? 0);
      });

      setImportPreview({
        customers: res.customers,
        branches: Array.from(branchSet),
        reps: Array.from(repSet),
        totalDebt: debt,
        duplicatesCount: (res as any).duplicatesCount,
        totalRows: (res as any).totalRows,
      } as any);
    } catch (err: any) {
      alert(`حدث خطأ أثناء قراءة الملف: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Handle Google Sheet URL Fetch
  const handleFetchGoogleSheet = async () => {
    if (!googleSheetUrl.trim()) {
      alert('يرجى لصق رابط Google Sheet أولاً');
      return;
    }

    const cleanUrl = googleSheetUrl.trim();
    saveSingleSourceUrl('customers', cleanUrl);
    setSavedSheetHistory(getSavedSheetHistory('customers'));

    setIsImporting(true);
    try {
      // Extract CSV export URL
      let csvUrl = cleanUrl;
      const sheetIdMatch = csvUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
      if (sheetIdMatch) {
        const sheetId = sheetIdMatch[1];
        const gidMatch = csvUrl.match(/[#&?]gid=([0-9]+)/i);
        const gid = gidMatch ? gidMatch[1] : '0';
        csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      }

      const resp = await fetch(csvUrl);
      if (!resp.ok) {
        throw new Error(`فشل الاتصال بالشيت (${resp.status}). يرجى التأكد من تفعيل "Anyone with the link can view"`);
      }
      const csvText = await resp.text();
      const workbook = XLSX.read(csvText, { type: 'string' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      const res = parseRawRowsToCustomers(rawRows);
      if (res.customers.length === 0) {
        alert('تم جلب الشيت لكن لم يتم العثور على أعمدة عملاء صالحة.');
        setIsImporting(false);
        return;
      }

      const branchSet = new Set<string>();
      const repSet = new Set<string>();
      let debt = 0;

      res.customers.forEach((c) => {
        if (c.branchName) branchSet.add(c.branchName);
        if (c.salesRepName || c.repName) repSet.add(c.salesRepName || c.repName || '');
        debt += Number(c.currentBalance ?? c.balance ?? 0);
      });

      setImportPreview({
        customers: res.customers,
        branches: Array.from(branchSet),
        reps: Array.from(repSet),
        totalDebt: debt,
        duplicatesCount: (res as any).duplicatesCount,
        totalRows: (res as any).totalRows,
      } as any);
    } catch (err: any) {
      alert(`خطأ في جلب Google Sheets: ${err.message || 'تعذر الوصول للرابط'}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Confirm and Apply Import
  const handleApplyImport = async () => {
    if (!importPreview || importPreview.customers.length === 0) return;

    const preview = importPreview;
    const dupes = (preview as any).duplicatesCount;
    const dupesMsg = dupes ? ` (تم دمج وتوحيد ${dupes} سجل مكرر)` : '';
    setIsImportModalOpen(false);
    setImportPreview(null);

    const saved = await importCustomersList(preview.customers, importMode);
    setSyncFeedback(
      saved.success
        ? { show: true, msg: `${saved.message}${dupesMsg}`, type: 'success' }
        : { show: true, msg: saved.message, type: 'warning' }
    );
  };

  // Export Exact Format Requested by User
  const handleExportSheet = () => {
    const wb = XLSX.utils.book_new();

    const headers = [
      'كود العميل',
      'اسم العميل',
      'الفرع',
      'المندوب',
      'اجمالي المتأخرات والمستحق',
      'مديونيه العميل',
      'الحد الائتماني',
      'المتبقي من الائتمان',
      'رقم الهاتف',
      'العنوان',
    ];

    const rows = sortedCustomers.map((c) => {
      const limit = Number(c.creditLimit) || 0;
      const balance = Number(c.currentBalance ?? c.balance ?? 0);
      const overdueAndDue = resolveCustomerDuesValue(c);
      const available = Math.max(0, limit - balance);
      return [
        c.code || '---',
        c.name || '',
        c.branchName || 'الفرع الرئيسي',
        c.salesRepName || c.repName || 'غير محدد',
        overdueAndDue,
        balance,
        limit,
        available,
        c.phone || '',
        c.address || '',
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 35 },
      { wch: 20 },
      { wch: 22 },
      { wch: 24 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
      { wch: 16 },
      { wch: 32 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'قاعدة_بيانات_العملاء');
    XLSX.writeFile(wb, `شيت_قاعدة_بيانات_العملاء_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      
      {/* Top Header & Fast Action Buttons */}
      <div className="navy-panel text-white rounded-3xl p-4 sm:p-6 shadow-xl border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl icon-brass-dark flex items-center justify-center font-black">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <span>قاعدة بيانات وسجل العملاء</span>
                <span className="text-xs badge-brass-dark px-2.5 py-0.5 rounded-full">
                  {stats.totalCount} عميل
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                متابعة مديونيات العملاء والحدود الائتمانية وإسناد المناديب وإصدار الفواتير الفورية
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          
          {/* Import Customers (Admin & Developer Only) */}
          {isAdminOrDev && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="btn-brass flex-1 sm:flex-none px-3.5 py-2.5 text-xs active:scale-95 cursor-pointer"
              title="استيراد شيت 3400 عميل من Google Sheets أو Excel"
            >
              <Upload className="w-4 h-4" />
              <span>استيراد العملاء 📥</span>
            </button>
          )}

          {/* Sync Reps (Admin & Developer Only) */}
          {isAdminOrDev && (
            <button
              onClick={handleRunSync}
              className="btn-ondark flex-1 sm:flex-none px-3.5 py-2.5 text-xs active:scale-95 cursor-pointer"
              title="إعادة مطابقة أسماء المناديب مع أسماء العملاء في الشيت"
            >
              <RefreshCw className="w-4 h-4" />
              <span>مزامنة المناديب 🔄</span>
            </button>
          )}

          {/* Export Excel (Available for All Roles - Reps, Supervisors, Managers, Admins) */}
          <button
            onClick={handleExportSheet}
            className="btn-ondark flex-1 sm:flex-none px-3.5 py-2.5 text-xs active:scale-95 cursor-pointer"
            title="تصدير بيانات العملاء المعروضة إلى شيت إكسل"
          >
            <Download className="w-4 h-4" />
            <span>تصدير إكسل 📊</span>
          </button>

          {/* Master Sheet Source Indicator (Customers strictly added from master sheet only) */}
          <div
            className="btn-ondark flex-1 sm:flex-none px-3.5 py-2.5 text-xs select-none cursor-default"
            title="قاعدة العملاء معتمدة ومقفولة - تضاف حصرياً من الشيت الأساسي بدون دمج"
          >
            <CheckCircle2 className="w-4 h-4 t-brass shrink-0" />
            <span>الشيت المعتمد: {customers.length} عميل</span>
          </div>
        </div>
      </div>

      {/* Unregistered Reps Notification Banner (if any detected) */}
      {unregisteredReps.length > 0 && isAdminOrDev && (
        <div className="panel-warn rounded-2xl p-3.5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl icon-brass flex items-center justify-center font-black shrink-0">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900">
                اكتشفنا <span className="t-warn font-black">{unregisteredReps.length} مندوب</span> مسجلين في بيانات العملاء ولم يتم إنشاء حسابات مستخدمين لهم بعد!
              </span>
              <p className="text-slate-500 text-[11px]">
                يمكنك إنشاء حسابات دخول فورية لهم بضغطة زر واحدة حتى يتمكنوا من الدخول ومتابعة عملائهم.
              </p>
            </div>
          </div>
          <button
            onClick={handleAutoCreateReps}
            className="btn-brass px-3.5 py-2 text-xs active:scale-95 cursor-pointer shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>إنشاء حسابات المناديب آلياً 🚀</span>
          </button>
        </div>
      )}

      {/* Sync Feedback Alert if active */}
      {syncFeedback?.show && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-sm animate-in slide-in-from-top-2 ${
            syncFeedback.type === 'success' ? 'panel-ok' : 'panel-navy'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{syncFeedback.msg}</span>
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Hero KPI strip (merged) — at most 5 tiles */}
      <div className="kpi-strip grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <div className="kp"><span className="lbl">عدد العملاء</span><span className="val">{stats.totalCount}</span></div>
        <div className="kp"><span className="lbl">مبيعات 2026</span><span className="val">{formatCurrency(stats.totalSales)}</span></div>
        <div className="kp"><span className="lbl">تحصيلات 2026</span><span className="val">{formatCurrency(stats.totalCollections)}</span></div>
        <div className="kp"><span className="lbl">المديونية النهائية</span><span className="val">{formatCurrency(stats.totalDebt)}</span></div>
        <div className="kp"><span className="lbl">متوسط المبيعات الشهرية</span><span className="val">{formatCurrency(stats.totalSales / 12)}</span></div>
      </div>

      {/* Segment counter cards row (v2 style) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {[
          { label: 'نقداً', count: scopedCustomers.filter((c) => Number(c.currentBalance ?? c.balance ?? 0) <= 0).length, color: '#2e7d5b', filter: 'zero_debt' },
          { label: 'متعثر', count: scopedCustomers.filter((c) => resolveCustomerDuesValue(c) > 0).length, color: '#b34a4a', filter: 'has_overdue' },
          { label: 'مخاطرة', count: scopedCustomers.filter((c) => { const d = Number(c.currentBalance ?? c.balance ?? 0); const l = Number(c.creditLimit || 0); return l > 0 && d > l; }).length, color: '#9b7027', filter: 'exceeded_limit' },
          { label: 'مشكوك فيه', count: scopedCustomers.filter((c) => !!c.isLegalPending).length, color: '#6d7e91', filter: 'has_debt' },
          { label: 'مهدد توقف الشحن', count: scopedCustomers.filter((c) => !c.hasDealtIn2026).length, color: '#c99a43', filter: 'all' },
        ].map((seg) => (
          <button
            key={seg.label}
            type="button"
            onClick={() => { setDebtFilter(seg.filter as any); setCurrentPage(1); }}
            className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm text-right cursor-pointer"
            style={{ borderTop: `3px solid ${seg.color}` }}
          >
            <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
              {seg.label}
            </div>
            <div className="text-2xl font-black tabular-nums mt-1" style={{ color: seg.color }}>
              {seg.count}
            </div>
          </button>
        ))}
      </div>

      {/* Navigation Scope Tabs (For Reps, Branch Managers & Admins) */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => {
            setScopeTab('my_customers');
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            scopeTab === 'my_customers'
              ? 'pill-filter on'
              : 'pill-filter'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>عملائي المسندين لي ({stats.myCustomersCount})</span>
        </button>

        <button
          hidden={isRep}
          onClick={() => {
            setScopeTab('branch');
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            scopeTab === 'branch'
              ? 'pill-filter on'
              : 'pill-filter'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>عملاء فرعي ({currentUser?.branchName || 'الفرع'})</span>
        </button>

        <button
          hidden={!isAdminOrDev}
          onClick={() => {
            setScopeTab('all');
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            scopeTab === 'all'
              ? 'pill-filter on'
              : 'pill-filter'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>جميع عملاء الفروع ({customers.length})</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          
          {/* Text Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ابحث بالاسم أو الكود أو التليفون..."
              className="w-full bg-white border border-slate-300 rounded-xl pr-9 pl-3 py-2 text-xs font-bold text-slate-800 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Branch Filter */}
          <div>
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setCurrentPage(1);
              }}
              disabled={!isAdminOrDev}
              className="w-full bg-white border rounded-xl px-3 py-2 text-xs font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
            >
              {isAdminOrDev ? (
                <>
                  <option value="الكل">كل الفروع (الكل)</option>
                  {allAvailableBranches.map((bName) => (
                    <option key={bName} value={bName}>
                      {bName}
                    </option>
                  ))}
                </>
              ) : (
                <option value={currentUser?.branchName || ''}>
                  {currentUser?.branchName || 'الفرع الحالي'}
                </option>
              )}
            </select>
          </div>

          {/* Sales Rep Filter (Dynamic: includes all reps in database) */}
          <div>
            <select
              value={selectedRepFilter}
              onChange={(e) => {
                setSelectedRepFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-white border rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
            >
              <option value={isRep ? currentUser?.id || '' : 'الكل'}>{isRep ? `مندوب: ${currentUser?.name || ''}` : `كل المناديب (${allAvailableReps.length} مندوب)`}</option>
              {!isRep && allAvailableReps.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} ({r.customerCount} عميل) - {r.branchName || 'فرع غير محدد'} {r.isRegisteredUser ? '✅' : '📄'}
                </option>
              ))}
            </select>
          </div>

          {/* Debt / Limit Status Filter */}
          <div>
            <select
              value={debtFilter}
              onChange={(e) => {
                setDebtFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full bg-white border rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
            >
              <option value="all">كل حالات المديونية</option>
              <option value="has_overdue">عملاء عليهم متأخرات ومستحق ⚠️</option>
              <option value="has_debt">عملاء عليهم مديونية &gt; 0 ج.م</option>
              <option value="exceeded_limit">عملاء تجاوزوا الحد الائتماني ⚠️</option>
              <option value="zero_debt">عملاء بدون مديونية (0 ج.م)</option>
            </select>
          </div>

        </div>
      </div>

      {/* Results header (merged) */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-black text-slate-700">
          عرض {sortedCustomers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, sortedCustomers.length)} من {sortedCustomers.length} عميل
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#8a6420]">تم تحديد <b>{selectedIds.size}</b></span>
              <button type="button" className="btn-ondark px-2.5 py-1 text-[11px] cursor-pointer" onClick={() => setSelectedIds(new Set())}>إلغاء التحديد</button>
            </div>
          )}
          <span className="text-[11px] text-slate-500">عدد الصفوف</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={99999}>الكل</option>
          </select>
        </div>
      </div>

      {/* Compact customer rows (merged) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {paginatedCustomers.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl tint-warn flex items-center justify-center font-bold">
                <Users className="w-7 h-7" />
              </div>
              <p className="font-black text-slate-700 text-sm">
                {scopeTab === 'my_customers' ? 'لا يوجد عملاء مسندين لحسابك حالياً في هذا التبويب' : 'لا توجد نتائج تطابق خيارات البحث'}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {paginatedCustomers.map((customer) => {
              const debt = Number(customer.currentBalance ?? customer.balance ?? 0);
              const overdueAndDue = resolveCustomerDuesValue(customer);
              const limit = Number(customer.creditLimit || 0);
              const isExceeded = limit > 0 && debt > limit;
              const repName = customer.salesRepName || customer.repName || '';
              const lastVisit = customer.lastVisitDate || '—';
              const checked = selectedIds.has(customer.id);
              const status = debt <= 0 ? 'نشط' : (isExceeded ? 'مهدد توقف' : (overdueAndDue > 0 ? 'متعثر' : 'نشط'));
              const statusClass = status === 'نشط' ? 'ok' : (status === 'مهدد توقف' ? 'warn' : 'risk');
              const initials = (customer.name || '').trim().slice(0, 2);
              return (
                <div key={customer.id}>
                  {/* Desktop compact row */}
                  <div className="hidden md:grid grid-cols-[40px_96px_minmax(180px,1fr)_120px_120px_96px_96px_120px_40px] gap-2 items-center px-4 py-3 hover:bg-slate-50 transition-colors">
                    <label className="flex items-center justify-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(customer.id); else next.delete(customer.id);
                          setSelectedIds(next);
                        }}
                        className="w-4 h-4 accent-[#102b4e]"
                      />
                    </label>
                    <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md border border-slate-200 text-center">
                      {customer.code || '---'}
                    </span>
                    <div className="min-w-0">
                      <div className="font-black text-slate-900 text-xs truncate">{customer.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{customer.branchName || 'الفرع الرئيسي'} · {repName || 'غير محدد'}</div>
                    </div>
                    <div className="text-left">
                      <div className="text-[9px] font-bold text-slate-400">مديونية</div>
                      <div className={`dream-amt text-xs ${debt > 0 ? 't-risk' : 't-muted'}`}>{formatCurrency(debt)}</div>
                    </div>
                    <div className="text-left">
                      <div className="text-[9px] font-bold text-slate-400">مستحقات</div>
                      <div className={`dream-amt text-xs ${overdueAndDue > 0 ? 't-warn' : 't-muted'}`}>{formatCurrency(overdueAndDue)}</div>
                    </div>
                    <div className="text-[10px] text-slate-400 tabular-nums text-left">{lastVisit}</div>
                    <span className={`app-badge ${statusClass}`}>{status}</span>
                    <button
                      type="button"
                      onClick={() => onOpenNewOrderForCustomer?.(customer)}
                      className="btn-primary px-2.5 py-1.5 text-[11px] rounded-full cursor-pointer"
                    >
                      طلب جديد +
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDrawerCustomer(customer); setDrawerTab('financial'); }}
                      className="chip-btn w-8 h-8 rounded-xl cursor-pointer"
                      title="المزيد"
                    >
                      •••
                    </button>
                  </div>

                  {/* Mobile stacked card */}
                  <div className="md:hidden p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="w-9 h-9 rounded-full border border-slate-300 flex items-center justify-center bg-white">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(customer.id); else next.delete(customer.id);
                            setSelectedIds(next);
                          }}
                          className="w-4 h-4 accent-[#102b4e]"
                        />
                      </label>
                      <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                        {customer.code || '---'}
                      </span>
                      <span className="font-black text-slate-900 text-sm flex-1 truncate">{customer.name}</span>
                      <span className={`app-badge ${statusClass}`}>{status}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">{customer.branchName || 'الفرع الرئيسي'} · {repName || 'غير محدد'}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 rounded-xl p-2">
                        <div className="text-[9px] font-bold text-slate-400">مديونية</div>
                        <div className={`dream-amt text-sm ${debt > 0 ? 't-risk' : 't-muted'}`}>{formatCurrency(debt)}</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-2">
                        <div className="text-[9px] font-bold text-slate-400">مستحقات</div>
                        <div className={`dream-amt text-sm ${overdueAndDue > 0 ? 't-warn' : 't-muted'}`}>{formatCurrency(overdueAndDue)}</div>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 tabular-nums">آخر زيارة: {lastVisit}</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenNewOrderForCustomer?.(customer)}
                        className="btn-primary flex-1 h-11 text-xs rounded-full cursor-pointer"
                      >
                        طلب جديد +
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDrawerCustomer(customer); setDrawerTab('financial'); }}
                        className="chip-btn w-11 h-11 rounded-xl cursor-pointer"
                      >
                        •••
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <div>
            عرض <span className="font-bold text-slate-800">{sortedCustomers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> إلى{' '}
            <span className="font-bold text-slate-800">{Math.min(currentPage * pageSize, sortedCustomers.length)}</span>{' '}
            من أصل <span className="font-black text-slate-900">{sortedCustomers.length}</span> عميل
          </div>
          {totalPages > 1 && pageSize < 99999 && (
            <div className="flex items-center gap-1">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(1)} className="chip-btn p-1 rounded-lg disabled:opacity-30 cursor-pointer"><ChevronsRight className="w-4 h-4" /></button>
              <button disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} className="chip-btn p-1 rounded-lg disabled:opacity-30 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
              <span className="pill-filter on px-3 py-1 text-xs">{currentPage} / {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} className="chip-btn p-1 rounded-lg disabled:opacity-30 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)} className="chip-btn p-1 rounded-lg disabled:opacity-30 cursor-pointer"><ChevronsLeft className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </div>

      {/* Analytics as collapsible disclose sections (closed default) */}
      <details className="disclose">
        <summary>أعلى ٥ عملاء بمبيعات ٢٠٢٦ <span className="count">{Math.min(5, sortedCustomers.length)}</span></summary>
        <div className="disclose-body">
          <div className="space-y-2">
            {[...sortedCustomers]
              .sort((a, b) => {
                const sa = a.monthlySales2026 ? Object.values(a.monthlySales2026).reduce((x, v) => x + (Number(v) || 0), 0) : 0;
                const sb = b.monthlySales2026 ? Object.values(b.monthlySales2026).reduce((x, v) => x + (Number(v) || 0), 0) : 0;
                return Math.max(Number(b.sales2026||0), Number(b.totalMonthlySales||0), Number(b.totalOverallSales||0), sb) - Math.max(Number(a.sales2026||0), Number(a.totalMonthlySales||0), Number(a.totalOverallSales||0), sa);
              })
              .slice(0, 5)
              .map((c, i) => {
                const mSum = c.monthlySales2026 ? Object.values(c.monthlySales2026).reduce((x, v) => x + (Number(v) || 0), 0) : 0;
                const sales = Math.max(Number(c.sales2026 || 0), Number(c.totalMonthlySales || 0), Number(c.totalOverallSales || 0), mSum);
                const maxSales = 1;
                return (
                  <div key={c.id} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[#8a6420] w-5">{i + 1}</span>
                    <span className="text-xs font-bold text-slate-700 flex-1 truncate">{c.name}</span>
                    <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#102b4e] rounded-full" style={{ width: `${Math.min(100, (sales / (sortedCustomers.reduce((mx, cc) => {
                        const mm = cc.monthlySales2026 ? Object.values(cc.monthlySales2026).reduce((x, v) => x + (Number(v) || 0), 0) : 0;
                        return Math.max(mx, Math.max(Number(cc.sales2026 || 0), Number(cc.totalMonthlySales || 0), Number(cc.totalOverallSales || 0), mm));
                      }, 1) || 1)) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-[#102b4e] tabular-nums">{formatCurrency(sales)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </details>

      <details className="disclose">
        <summary>توزيع حسب الصحة المالية <span className="count">{scopedCustomers.length}</span></summary>
        <div className="disclose-body">
          <div className="space-y-2">
            {[
              { label: 'نقداً', count: scopedCustomers.filter((c) => Number(c.currentBalance ?? c.balance ?? 0) <= 0).length, color: '#2e7d5b' },
              { label: 'متعثر', count: scopedCustomers.filter((c) => resolveCustomerDuesValue(c) > 0).length, color: '#b34a4a' },
              { label: 'مخاطرة', count: scopedCustomers.filter((c) => { const d = Number(c.currentBalance ?? c.balance ?? 0); const l = Number(c.creditLimit || 0); return l > 0 && d > l; }).length, color: '#9b7027' },
              { label: 'مشكوك فيه', count: scopedCustomers.filter((c) => !!c.isLegalPending).length, color: '#6d7e91' },
              { label: 'مهدد توقف الشحن', count: scopedCustomers.filter((c) => !c.hasDealtIn2026).length, color: '#c99a43' },
            ].map((seg) => {
              const pct = scopedCustomers.length ? (seg.count / scopedCustomers.length) * 100 : 0;
              return (
                <div key={seg.label} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 w-20">{seg.label}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: seg.color }} />
                  </div>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: seg.color }}>{seg.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </details>

      <details className="disclose">
        <summary>فئات الأعمار المالية <span className="count">4</span></summary>
        <div className="disclose-body">
          <div className="space-y-2">
            {[
              { label: 'حتى 30 يوم', count: scopedCustomers.filter((c) => resolveCustomerDuesValue(c) > 0 && resolveCustomerDuesValue(c) <= 30000).length, color: '#2e7d5b' },
              { label: '31-60 يوم', count: scopedCustomers.filter((c) => { const d = resolveCustomerDuesValue(c); return d > 30000 && d <= 60000; }).length, color: '#9b7027' },
              { label: '61-90 يوم', count: scopedCustomers.filter((c) => { const d = resolveCustomerDuesValue(c); return d > 60000 && d <= 90000; }).length, color: '#b34a4a' },
              { label: 'أكثر من 90 يوم', count: scopedCustomers.filter((c) => resolveCustomerDuesValue(c) > 90000).length, color: '#6d7e91' },
            ].map((b) => {
              const max = Math.max(1, scopedCustomers.length);
              const pct = (b.count / max) * 100;
              return (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 w-24">{b.label}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.color }} />
                  </div>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: b.color }}>{b.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </details>

      <details className="disclose">
        <summary>فرع بهم أعلى مديونية <span className="count">{new Set(scopedCustomers.map((c) => c.branchName)).size}</span></summary>
        <div className="disclose-body">
          <div className="space-y-2">
            {Object.entries(
              scopedCustomers.reduce((acc, c) => {
                const key = c.branchName || 'الفرع الرئيسي';
                acc[key] = (acc[key] || 0) + Number(c.currentBalance ?? c.balance ?? 0);
                return acc;
              }, {} as Record<string, number>)
            )
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([branch, amt]) => {
                const max = Math.max(1, ...Object.values(scopedCustomers.reduce((acc, c) => {
                  const key = c.branchName || 'الفرع الرئيسي';
                  acc[key] = (acc[key] || 0) + Number(c.currentBalance ?? c.balance ?? 0);
                  return acc;
                }, {} as Record<string, number>)));
                const pct = (amt / max) * 100;
                return (
                  <div key={branch} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 flex-1 truncate">{branch}</span>
                    <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#b34a4a] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] font-bold t-risk tabular-nums">{formatCurrency(amt)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </details>

      {/* Detail drawer (merged) */}
      {drawerCustomer && (
        <>
          <div className="fixed inset-0 bg-slate-950/40 z-40" onClick={() => setDrawerCustomer(null)} />
          <div className="fixed top-0 bottom-0 left-0 w-full md:w-[480px] bg-white z-50 flex flex-col shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#102b4e] text-white flex items-center justify-center font-black text-lg shadow-inner">
                  {(drawerCustomer.name || '').trim().slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-[#102b4e] text-base truncate">{drawerCustomer.name}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                      {drawerCustomer.code || '---'}
                    </span>
                    <span className={`app-badge ${(() => {
                      const d = Number(drawerCustomer.currentBalance ?? drawerCustomer.balance ?? 0);
                      const l = Number(drawerCustomer.creditLimit || 0);
                      const o = resolveCustomerDuesValue(drawerCustomer);
                      if (d <= 0) return 'ok';
                      if (l > 0 && d > l) return 'warn';
                      if (o > 0) return 'risk';
                      return 'ok';
                    })()}`}>
                      {(() => {
                        const d = Number(drawerCustomer.currentBalance ?? drawerCustomer.balance ?? 0);
                        const l = Number(drawerCustomer.creditLimit || 0);
                        const o = resolveCustomerDuesValue(drawerCustomer);
                        if (d <= 0) return 'نشط';
                        if (l > 0 && d > l) return 'مهدد توقف';
                        if (o > 0) return 'متعثر';
                        return 'نشط';
                      })()}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => setDrawerCustomer(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex gap-1 px-4 pt-3 border-b border-slate-200">
              {[
                { id: 'financial', label: 'مالي' },
                { id: 'visits', label: 'زيارات' },
                { id: 'orders', label: 'طلبات' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDrawerTab(t.id as any)}
                  className={`px-3 py-2 text-xs font-bold rounded-t-lg cursor-pointer ${drawerTab === t.id ? 'bg-slate-100 text-[#102b4e] border-b-2 border-[#c99a43]' : 'text-slate-500'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {drawerTab === 'financial' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-slate-400">مديونية</div>
                      <div className="dream-amt text-base t-risk">{formatCurrency(Number(drawerCustomer.currentBalance ?? drawerCustomer.balance ?? 0))}</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-slate-400">مستحقات</div>
                      <div className="dream-amt text-base t-warn">{formatCurrency(resolveCustomerDuesValue(drawerCustomer))}</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-slate-400">قيد</div>
                      <div className="dream-amt text-base text-slate-800">{formatCurrency(Number(drawerCustomer.currentBalance ?? drawerCustomer.balance ?? 0))}</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-slate-400">تحصيل ٢٠٢٦</div>
                      <div className="dream-amt text-base t-ok">{formatCurrency(Number(drawerCustomer.collections2026 || drawerCustomer.totalMonthlyCollections || 0))}</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-slate-400">إجمالي البيع</div>
                      <div className="dream-amt text-base t-navy">{formatCurrency(Math.max(Number(drawerCustomer.sales2026 || 0), Number(drawerCustomer.totalMonthlySales || 0), Number(drawerCustomer.totalOverallSales || 0)))}</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-slate-400">إجمالي التحصيل</div>
                      <div className="dream-amt text-base t-ok">{formatCurrency(Number(drawerCustomer.collections2026 || drawerCustomer.totalMonthlyCollections || 0))}</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-slate-400">حد ائتمان</div>
                      <div className="dream-amt text-base text-slate-800">{formatCurrency(Number(drawerCustomer.creditLimit || 0))}</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-slate-400">المتبقي من الائتمان</div>
                      <div className="dream-amt text-base t-ok">{formatCurrency(Math.max(0, Number(drawerCustomer.creditLimit || 0) - Number(drawerCustomer.currentBalance ?? drawerCustomer.balance ?? 0)))}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    <div>الفرع: {drawerCustomer.branchName || 'الفرع الرئيسي'}</div>
                    <div>المندوب: {drawerCustomer.salesRepName || drawerCustomer.repName || 'غير محدد'}</div>
                    <div>الهاتف: {drawerCustomer.phone || '—'}</div>
                    <div>العنوان: {drawerCustomer.address || '—'}</div>
                  </div>
                </>
              )}

              {drawerTab === 'visits' && (
                <div className="space-y-2">
                  {(drawerCustomer.visitHistory || []).slice(0, 3).length === 0 ? (
                    <div className="text-xs text-slate-400">لا توجد زيارات مسجلة. آخر زيارة: {drawerCustomer.lastVisitDate || '—'}</div>
                  ) : (
                    (drawerCustomer.visitHistory || []).slice(0, 3).map((v, i) => (
                      <div key={i} className="border border-slate-200 rounded-xl p-3">
                        <div className="text-[11px] font-bold text-slate-500 tabular-nums">{(v as any).date || (v as any).visitDate || '—'}</div>
                        <div className="text-xs font-black text-slate-800 mt-1">{(v as any).notes || (v as any).summary || 'زيارة'}</div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {drawerTab === 'orders' && (
                <div className="text-xs text-slate-400">طلبات العميل تُعرض في صفحة الفواتير. استخدم "طلب جديد" لإنشاء طلبية.</div>
              )}
            </div>

            <div className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
              <button type="button" onClick={() => { onOpenNewOrderForCustomer?.(drawerCustomer); setDrawerCustomer(null); }} className="btn-primary flex-1 py-2 text-xs cursor-pointer">طلب جديد</button>
              <button type="button" onClick={() => setDrawerCustomer(null)} className="btn-ghost flex-1 py-2 text-xs cursor-pointer">زيارة جديدة</button>
              {drawerCustomer.phone && (
                <a href={`tel:${drawerCustomer.phone}`} className="btn-ghost px-3 py-2 text-xs cursor-pointer">اتصال</a>
              )}
            </div>
          </div>
        </>
      )}

      {/* Import Modal for 3400+ Customers (Google Sheets & Excel - Admin & Developer Only) */}
      {isAdminOrDev && isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) { setIsImportModalOpen(false); setImportPreview(null); } }}>
          <div className="relative z-[60] bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl navy-panel text-white flex items-center justify-center font-black">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900">
                    استيراد وتحميل قاعدة بيانات العملاء (3400+ عميل)
                  </h3>
                  <p className="text-xs text-slate-500">
                    استيراد مباشر من شيت Google Sheets أو ملف Excel (.xlsx / .csv)
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportPreview(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Import Method Options */}
            <div className="space-y-4">
              
              {/* Option 1: Google Sheets URL */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 t-navy" />
                    <span>طريقة 1: لصق رابط Google Sheets المباشر</span>
                  </label>
                  {googleSheetUrl && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 tint-ok">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>محفوظ دائماً</span>
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
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
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  />
                  <button
                    onClick={handleFetchGoogleSheet}
                    disabled={isImporting || !googleSheetUrl.trim()}
                    className="btn-primary px-4 py-2 text-xs cursor-pointer shrink-0"
                  >
                    {isImporting ? 'جاري الجلب...' : 'جلب الشيت 🔄'}
                  </button>
                </div>

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
                            ? 'tint-navy font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                        title={link}
                      >
                        شيت {idx + 1}
                      </button>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-slate-400">
                  تأكد من جعل الشيت متاحاً للعرض (Anyone with the link can view). الرابط يتم حفظه تلقائياً في ذاكرة النظام.
                </p>
              </div>

              {/* Option 2: Upload Excel File */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                <label className="block text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 t-ok" />
                  <span>طريقة 2: رفع ملف إكسل من جهازك (.xlsx أو .csv)</span>
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="file-brass w-full text-xs text-slate-600"
                />
              </div>

              {/* Import Mode: Merge vs Replace */}
              <div className="panel-warn p-3.5 rounded-2xl border space-y-2">
                <span className="text-xs font-black t-warn block">طريقة تثبيت البيانات:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${importMode === 'merge' ? 'bg-white border-[#c99a43] shadow-sm' : 'bg-transparent border-slate-200'}`}>
                    <input
                      type="radio"
                      name="importMode"
                      value="merge"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="accent-[#c99a43]"
                    />
                    <div>
                      <div className="font-bold text-xs text-slate-900">دمج وتحديث السجلات (Merge)</div>
                      <div className="text-[10px] text-slate-500">تحديث المديونيات والبيانات مع الحفاظ على العملاء الحاليين</div>
                    </div>
                  </label>

                  <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${importMode === 'replace' ? 'bg-white border-[#b34a4a] shadow-sm' : 'bg-transparent border-slate-200'}`}>
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="accent-[#b34a4a]"
                    />
                    <div>
                      <div className="font-bold text-xs t-risk">استبدال كامل لقاعدة العملاء (Replace)</div>
                      <div className="text-[10px] t-risk">مسح القديم وتنزيل الـ 3400 عميل من الشيت بالكامل</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Preview of Parsed Data */}
              {importPreview && (
                <div className="panel-ok p-4 rounded-2xl border space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 font-black text-xs">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>تم تحليل الملف بنجاح! جاهز للتثبيت ({importPreview.customers.length} عميل)</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <div className="text-slate-500 text-[10px]">إجمالي العملاء</div>
                      <div className="text-base font-black text-slate-900">{importPreview.customers.length}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <div className="text-slate-500 text-[10px]">عدد الفروع المكتشفة</div>
                      <div className="text-base font-black t-navy">{importPreview.branches.length}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <div className="text-slate-500 text-[10px]">عدد المناديب المكتشفين</div>
                      <div className="text-base font-black t-warn">{importPreview.reps.length}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <div className="text-slate-500 text-[10px]">إجمالي المديونيات</div>
                      <div className="text-xs font-black t-risk">{formatCurrency(importPreview.totalDebt)}</div>
                    </div>
                  </div>

                  <button
                    onClick={handleApplyImport}
                    className="btn-primary w-full py-2.5 text-xs active:scale-95 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>تثبيت الـ ({importPreview.customers.length}) عميل الآن في المنظومة</span>
                  </button>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {(isAddModalOpen || editingCustomer) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="relative z-[60] bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl icon-brass flex items-center justify-center font-black">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900">
                    {editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد لقاعدة البيانات'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    تعديل المديونية والحد الائتماني وتعيين المندوب والفرع
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingCustomer(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-3.5">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* كود العميل */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كود العميل <span className="t-risk">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                    placeholder="مثال: CUST-1045"
                  />
                </div>

                {/* اسم العميل */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم العميل / المحل <span className="t-risk">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                    placeholder="مثال: سوبر ماركت الأمانة"
                  />
                </div>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* الفرع */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الفرع التابع له
                  </label>
                  <select
                    value={formData.branchName}
                    onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    {allAvailableBranches.map((bName) => (
                      <option key={bName} value={bName}>
                        {bName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* المندوب */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المندوب المسؤول
                  </label>
                  <select
                    value={formData.repName || formData.repId}
                    onChange={(e) => {
                      const selectedVal = e.target.value;
                      const repUser = users.find((r) => r.id === selectedVal || r.name === selectedVal);
                      setFormData({
                        ...formData,
                        repId: repUser ? repUser.id : '',
                        repName: selectedVal,
                      });
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    <option value="">-- غير محدد (بدون مندوب) --</option>
                    {allAvailableReps.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.name} ({r.branchName || 'فرع غير محدد'})
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* إجمالي المتأخرات والمستحق */}
                <div>
                  <label className="block text-xs font-bold t-warn mb-1">
                    إجمالي المتأخرات والمستحق (ج.م)
                  </label>
                  <input
                    type="number"
                    value={formData.totalOverdueAndDue}
                    onChange={(e) => setFormData({ ...formData, totalOverdueAndDue: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                    placeholder="0"
                  />
                </div>

                {/* مديونية العميل */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    مديونية العميل الحالية (ج.م)
                  </label>
                  <input
                    type="number"
                    value={formData.currentBalance}
                    onChange={(e) => setFormData({ ...formData, currentBalance: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                    placeholder="0"
                  />
                </div>

                {/* الحد الائتماني */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الحد الائتماني (ج.م)
                  </label>
                  <input
                    type="number"
                    value={formData.creditLimit}
                    onChange={(e) => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                    placeholder="50000"
                  />
                </div>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* رقم الهاتف */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم الهاتف
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                    placeholder="مثال: 01012345678"
                  />
                </div>

                {/* العنوان */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    العنوان والمنطقة
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                    placeholder="مثال: الفيوم - شارع الحرية"
                  />
                </div>

              </div>

              {/* ملاحظات */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ملاحظات إضافية
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  placeholder="ملاحظات التسليم، الشروط..."
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingCustomer(null);
                  }}
                  className="btn-ghost px-4 py-2 text-xs cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn-primary px-6 py-2 text-xs active:scale-95 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ البيانات</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {customerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full tint-risk flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-black text-slate-900 text-base">هل أنت متأكد من حذف هذا العميل؟</h4>
              <p className="text-xs text-slate-500 mt-1">
                سيتم حذف ({customerToDelete.name}) من قاعدة البيانات المحلية والسحابية.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setCustomerToDelete(null)}
                className="btn-ghost flex-1 py-2 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  deleteCustomer(customerToDelete.id);
                  setCustomerToDelete(null);
                  setSyncFeedback({
                    show: true,
                    msg: `تم حذف العميل (${customerToDelete.name}) بنجاح.`,
                    type: 'info',
                  });
                }}
                className="btn-danger flex-1 py-2 text-xs cursor-pointer"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
