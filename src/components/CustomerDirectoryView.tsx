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
  Link2
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
  const [sortField, setSortField] = useState<'name' | 'code' | 'overdue' | 'debt' | 'limit' | 'branch'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pagination (For smooth rendering of 3400+ customers)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

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
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
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

  // Extract ALL unique Branches from branches + customers
  const allAvailableBranches = useMemo(() => {
    const branchSet = new Set<string>();
    branches.filter((b) => !b.isMainWarehouse).forEach((b) => branchSet.add(b.name));
    const visibleCustomers = isAdminOrDev ? customers : getVisibleCustomers();
    visibleCustomers.forEach((c) => {
      if (c.branchName && c.branchName.trim()) {
        const norm = c.branchName.trim().startsWith('فرع') ? c.branchName.trim() : `فرع ${c.branchName.trim()}`;
        branchSet.add(norm);
      }
    });
    return Array.from(branchSet);
  }, [branches, customers, isAdminOrDev, getVisibleCustomers]);

  // The context owns the privacy boundary; tabs can only narrow that list.
  const scopedCustomers = useMemo(() => {
    const visibleCustomers = getVisibleCustomers();
    if (!currentUser || isAdminOrDev) return visibleCustomers;
    if (scopeTab === 'my_customers' && isRep) {
      return visibleCustomers.filter((c) => doesCustomerBelongToRep(c, currentUser));
    }
    return visibleCustomers;
  }, [getVisibleCustomers, currentUser, isAdminOrDev, isRep, scopeTab]);

  // Filter & Search Logic
  const filteredCustomers = useMemo(() => {
    const query = normalizeArabicText(searchQuery);

    return scopedCustomers.filter((c) => {
      // Branch filter
      if (selectedBranch !== 'الكل') {
        if (!isBranchMatch(c.branchName, selectedBranch, { allowUnassigned: false })) {
          return false;
        }
      }

      // Rep filter (works for both registered users and unregistered reps)
      if (selectedRepFilter !== 'الكل') {
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
      const overdueDue = Number(c.totalOverdueAndDue !== undefined ? c.totalOverdueAndDue : debt);
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
  }, [scopedCustomers, searchQuery, selectedBranch, selectedRepFilter, debtFilter]);

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
        valA = Number(a.totalOverdueAndDue !== undefined ? a.totalOverdueAndDue : (a.currentBalance ?? a.balance ?? 0));
        valB = Number(b.totalOverdueAndDue !== undefined ? b.totalOverdueAndDue : (b.currentBalance ?? b.balance ?? 0));
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      if (sortField === 'debt') {
        valA = Number(a.currentBalance ?? a.balance ?? 0);
        valB = Number(b.currentBalance ?? b.balance ?? 0);
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
    let totalLimit = 0;
    let customersWithDebt = 0;
    let customersWithOverdue = 0;
    let customersExceededLimit = 0;

    scopedCustomers.forEach((c) => {
      const debt = Number(c.currentBalance ?? c.balance ?? 0);
      const overdueDue = Number(c.totalOverdueAndDue !== undefined ? c.totalOverdueAndDue : debt);
      const limit = Number(c.creditLimit || 0);
      if (debt > 0) {
        totalDebt += debt;
        customersWithDebt++;
      }
      if (overdueDue > 0) {
        totalOverdueAndDue += overdueDue;
        customersWithOverdue++;
      }
      totalLimit += limit;
      if (limit > 0 && debt > limit) {
        customersExceededLimit++;
      }
    });

    const myCustomersCount = currentUser
      ? customers.filter((c) => doesCustomerBelongToRep(c, currentUser)).length
      : 0;

    return {
      totalCount: scopedCustomers.length,
      myCustomersCount,
      totalDebt,
      totalOverdueAndDue,
      customersWithOverdue,
      totalLimit,
      availableLimit: Math.max(0, totalLimit - totalDebt),
      customersWithDebt,
      customersExceededLimit,
    };
  }, [scopedCustomers, customers, currentUser]);

  // Handle Sort Click
  const handleSort = (field: 'name' | 'code' | 'overdue' | 'debt' | 'limit' | 'branch') => {
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
    const overdueVal = Number(customer.totalOverdueAndDue !== undefined ? customer.totalOverdueAndDue : balanceVal);
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
      });
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

    setIsImporting(true);
    try {
      // Extract CSV export URL
      let csvUrl = googleSheetUrl.trim();
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
      });
    } catch (err: any) {
      alert(`خطأ في جلب Google Sheets: ${err.message || 'تعذر الوصول للرابط'}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Confirm and Apply Import
  const handleApplyImport = () => {
    if (!importPreview || importPreview.customers.length === 0) return;

    importCustomersList(importPreview.customers, importMode);
    setIsImportModalOpen(false);
    setImportPreview(null);
    setGoogleSheetUrl('');
    setSyncFeedback({
      show: true,
      msg: `تم بنجاح تحميل وتثبيت (${importPreview.customers.length}) عميل في المنظومة مع الفروع والمناديب والمديونيات!`,
      type: 'success',
    });
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
      const overdueAndDue = Number(c.totalOverdueAndDue !== undefined ? c.totalOverdueAndDue : balance);
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
      <div className="bg-slate-900 text-white rounded-3xl p-4 sm:p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md shadow-amber-400/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <span>قاعدة بيانات وسجل العملاء</span>
                <span className="text-xs bg-amber-400/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-400/30">
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
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-md shadow-blue-900/30"
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
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-300 border border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
              title="إعادة مطابقة أسماء المناديب مع أسماء العملاء في الشيت"
            >
              <RefreshCw className="w-4 h-4" />
              <span>مزامنة المناديب 🔄</span>
            </button>
          )}

          {/* Export Excel (Available for All Roles - Reps, Supervisors, Managers, Admins) */}
          <button
            onClick={handleExportSheet}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-md shadow-emerald-900/30"
            title="تصدير بيانات العملاء المعروضة إلى شيت إكسل"
          >
            <Download className="w-4 h-4" />
            <span>تصدير إكسل 📊</span>
          </button>

          {/* Add Customer (Admin & Developer Only - Reps add new un-coded customers during order creation) */}
          {isAdminOrDev && (
            <button
              onClick={handleOpenAdd}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-lg shadow-amber-400/20"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>إضافة عميل ➕</span>
            </button>
          )}
        </div>
      </div>

      {/* Unregistered Reps Notification Banner (if any detected) */}
      {unregisteredReps.length > 0 && isAdminOrDev && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/40 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shrink-0">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900">
                اكتشفنا <span className="text-amber-700 font-black">{unregisteredReps.length} مندوب</span> مسجلين في بيانات العملاء ولم يتم إنشاء حسابات مستخدمين لهم بعد!
              </span>
              <p className="text-slate-500 text-[11px]">
                يمكنك إنشاء حسابات دخول فورية لهم بضغطة زر واحدة حتى يتمكنوا من الدخول ومتابعة عملائهم.
              </p>
            </div>
          </div>
          <button
            onClick={handleAutoCreateReps}
            className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer shrink-0"
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
            syncFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Card 1: Total & My Customers */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {scopeTab === 'my_customers' ? 'عملائي المسندين لي' : 'إجمالي العملاء المعروضين'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900">{stats.totalCount}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              مسند لك كـ مندوب: <span className="font-bold text-blue-600">{stats.myCustomersCount}</span> عميل
            </div>
          </div>
        </div>

        {/* Card 2: Total Overdue & Due / Customer Debt */}
        <div className="bg-white rounded-2xl p-4 border border-amber-200/80 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900">إجمالي المتأخرات والمستحق</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-amber-700">
              {formatCurrency(stats.totalOverdueAndDue > 0 ? stats.totalOverdueAndDue : stats.totalDebt)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center justify-between">
              <span>{stats.customersWithOverdue > 0 ? stats.customersWithOverdue : stats.customersWithDebt} عميل مستحق</span>
              <span className="text-rose-600 font-bold">المديونية: {formatCurrency(stats.totalDebt)}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Total Credit Limit */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي الحدود الائتمانية</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {formatCurrency(stats.totalLimit)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              الحدود الممنوحة للعملاء
            </div>
          </div>
        </div>

        {/* Card 4: Available Credit */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">المتاح من الائتمان للطلبيات</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-emerald-600">
              {formatCurrency(stats.availableLimit)}
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
              {stats.customersExceededLimit > 0 ? (
                <span className="text-rose-600 font-bold">
                  ⚠️ {stats.customersExceededLimit} تجاوزوا الحد
                </span>
              ) : (
                'ضمن الحدود الآمنة'
              )}
            </div>
          </div>
        </div>

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
              ? 'bg-amber-400 text-slate-950 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
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
              ? 'bg-amber-400 text-slate-950 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>عملاء فرعي ({currentUser?.branchName || 'الفرع'})</span>
        </button>

        <button
          hidden={isRep}
          onClick={() => {
            setScopeTab('all');
            setCurrentPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            scopeTab === 'all'
              ? 'bg-amber-400 text-slate-950 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
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
              placeholder="بحث باسم العميل، الكود، المحل، الهاتف..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-9 pl-3 py-2 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
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
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500 disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
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
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
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
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
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

      {/* Main Customers Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Table Header Bar */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs font-black text-slate-700 flex items-center gap-2">
            <span>سجل العملاء التفاعلي</span>
            <span className="text-[11px] font-bold text-slate-400">
              (معروض {sortedCustomers.length} من {scopedCustomers.length})
            </span>
          </div>

          {/* Sort Controls & Page Size Selector */}
          <div className="flex items-center gap-3 text-xs">
            
            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="text-[11px]">عرض:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800 focus:outline-none"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={99999}>الكل ({sortedCustomers.length})</option>
              </select>
            </div>

            {/* Sort Buttons */}
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <span>ترتيب:</span>
              <button
                onClick={() => handleSort('name')}
                className={`px-2 py-0.5 rounded-md font-bold transition ${
                  sortField === 'name' ? 'bg-amber-400 text-slate-950' : 'bg-white border border-slate-200'
                }`}
              >
                الاسم
              </button>
              <button
                onClick={() => handleSort('overdue')}
                className={`px-2 py-0.5 rounded-md font-bold transition ${
                  sortField === 'overdue' ? 'bg-amber-400 text-slate-950' : 'bg-white border border-slate-200'
                }`}
              >
                المتأخرات والمستحق
              </button>
              <button
                onClick={() => handleSort('debt')}
                className={`px-2 py-0.5 rounded-md font-bold transition ${
                  sortField === 'debt' ? 'bg-amber-400 text-slate-950' : 'bg-white border border-slate-200'
                }`}
              >
                المديونية
              </button>
              <button
                onClick={() => handleSort('code')}
                className={`px-2 py-0.5 rounded-md font-bold transition ${
                  sortField === 'code' ? 'bg-amber-400 text-slate-950' : 'bg-white border border-slate-200'
                }`}
              >
                الكود
              </button>
            </div>

          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white font-black text-[11px] select-none">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th
                  onClick={() => handleSort('code')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-300 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>كود العميل</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('name')}
                  className="py-3 px-4 cursor-pointer hover:text-amber-300 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>اسم العميل / المحل</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('branch')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-300 transition"
                >
                  <div className="flex items-center gap-1">
                    <span>الفرع</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-3">
                  <span>المندوب المسؤول</span>
                </th>
                <th
                  onClick={() => handleSort('overdue')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-300 transition text-left"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>إجمالي المتأخرات والمستحق</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('debt')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-300 transition text-left"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>مديونية العميل</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('limit')}
                  className="py-3 px-3 cursor-pointer hover:text-amber-300 transition text-left"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>الحد الائتماني</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-3 text-left">
                  <span>المتبقي من الائتمان</span>
                </th>
                <th className="py-3 px-4 text-center">إجراءات فورية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-medium">
              {paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                        <Users className="w-7 h-7" />
                      </div>
                      <div>
                        <p className="font-black text-slate-700 text-sm">
                          {scopeTab === 'my_customers'
                            ? 'لا يوجد عملاء مسندين لحسابك حالياً في هذا التبويب'
                            : 'لا توجد نتائج تطابق خيارات البحث'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                          {scopeTab === 'my_customers'
                            ? 'يمكنك استعراض جميع عملاء الفرع أو الضغط أدناه للانتقال لعملاء الفرع والتنقل بحرية.'
                            : 'جرب إزالة الفلاتر أو تغيير كلمة البحث لعرض العملاء.'}
                        </p>
                      </div>

                      {scopeTab === 'my_customers' && (
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setScopeTab('branch');
                              setCurrentPage(1);
                            }}
                            className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                          >
                            <Building2 className="w-4 h-4" />
                            <span>عرض عملاء الفرع ({currentUser?.branchName || 'الفرع'})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setScopeTab('all');
                              setCurrentPage(1);
                            }}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                          >
                            <Users className="w-4 h-4" />
                            <span>عرض جميع عملاء الفروع ({customers.length})</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((customer, index) => {
                  const globalIdx = (currentPage - 1) * pageSize + index + 1;
                  const debt = Number(customer.currentBalance ?? customer.balance ?? 0);
                  const overdueAndDue = Number(customer.totalOverdueAndDue !== undefined ? customer.totalOverdueAndDue : debt);
                  const limit = Number(customer.creditLimit || 0);
                  const available = Math.max(0, limit - debt);
                  const isExceeded = limit > 0 && debt > limit;
                  const repName = customer.salesRepName || customer.repName || '';
                  const isAssignedToMe = currentUser ? doesCustomerBelongToRep(customer, currentUser) : false;

                  return (
                    <tr
                      key={customer.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        isAssignedToMe ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* # */}
                      <td className="py-3 px-3 text-center text-slate-400 font-bold text-[11px]">
                        {globalIdx}
                      </td>

                      {/* كود العميل */}
                      <td className="py-3 px-3 font-mono font-bold text-slate-700">
                        <span className="bg-slate-100 px-2 py-1 rounded-md text-[11px] border border-slate-200">
                          {customer.code || '---'}
                        </span>
                      </td>

                      {/* اسم العميل */}
                      <td className="py-3 px-4">
                        <div className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                          <span>{customer.name}</span>
                        </div>
                        {customer.storeName && customer.storeName !== customer.name && (
                          <div className="text-[11px] text-slate-500 font-medium">{customer.storeName}</div>
                        )}
                        {customer.phone && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5" dir="ltr">
                            <span>📞 {customer.phone}</span>
                          </div>
                        )}
                      </td>

                      {/* الفرع */}
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>{customer.branchName || 'الفرع الرئيسي'}</span>
                        </span>
                      </td>

                      {/* المندوب */}
                      <td className="py-3 px-3">
                        {repName ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                                isAssignedToMe
                                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-black'
                                  : 'bg-slate-100 text-slate-800 border-slate-200'
                              }`}
                            >
                              {isAssignedToMe ? `⭐ ${repName} (أنت)` : repName}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                              غير محدد
                            </span>
                            {isRep && (
                              <button
                                onClick={() => handleQuickClaimRep(customer)}
                                className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded border border-blue-200 transition cursor-pointer"
                                title="إسناد هذا العميل لي"
                              >
                                إسناد لي ➕
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* إجمالي المتأخرات والمستحق */}
                      <td className="py-3 px-3 text-left">
                        <div
                          className={`font-black text-xs ${
                            overdueAndDue > 0 ? 'text-amber-700 font-bold' : 'text-slate-500'
                          }`}
                        >
                          {formatCurrency(overdueAndDue)}
                        </div>
                        {overdueAndDue > 0 ? (
                          <div className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                            <span>متأخر ومستحق ⚠️</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-emerald-600 font-bold">خالص ✓</div>
                        )}
                      </td>

                      {/* مديونية العميل */}
                      <td className="py-3 px-3 text-left">
                        <div
                          className={`font-black text-xs ${
                            debt > 0 ? 'text-rose-600' : 'text-slate-500'
                          }`}
                        >
                          {formatCurrency(debt)}
                        </div>
                        {debt > 0 && (
                          <div className="text-[10px] text-rose-500 font-bold">مستحق السداد</div>
                        )}
                      </td>

                      {/* الحد الائتماني */}
                      <td className="py-3 px-3 text-left">
                        <div className="font-black text-xs text-blue-700">
                          {formatCurrency(limit)}
                        </div>
                      </td>

                      {/* المتبقي من الائتمان */}
                      <td className="py-3 px-3 text-left">
                        {isExceeded ? (
                          <div className="text-rose-600 font-black text-[11px] flex items-center justify-end gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>تجاوز الحد ({formatCurrency(debt - limit)})</span>
                          </div>
                        ) : (
                          <div className="text-emerald-700 font-black text-xs">
                            {formatCurrency(available)}
                          </div>
                        )}
                      </td>

                      {/* إجراءات فورية */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          
                          {/* Fast Order Builder Launch */}
                          <button
                            onClick={() => onOpenNewOrderForCustomer?.(customer)}
                            className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow-sm transition active:scale-95 cursor-pointer"
                            title="إنشاء طلبية / فاتورة فورية لهذا العميل"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>طلب 🛒</span>
                          </button>

                          {/* Phone / WhatsApp if phone exists */}
                          {customer.phone && (
                            <a
                              href={`tel:${customer.phone}`}
                              className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
                              title={`اتصال هاتفي: ${customer.phone}`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}

                          {/* Edit Customer (Admin & Dev only) */}
                          {isAdminOrDev && (
                            <button
                              onClick={() => handleOpenEdit(customer)}
                              className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
                              title="تعديل بيانات العميل والحد الائتماني والمندوب"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete Customer (Admins only) */}
                          {isAdminOrDev && (
                            <button
                              onClick={() => setCustomerToDelete(customer)}
                              className="w-7 h-7 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition cursor-pointer"
                              title="حذف العميل"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Pagination Controls */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          
          <div className="flex items-center gap-2">
            <span>
              عرض <span className="font-bold text-slate-800">{(currentPage - 1) * pageSize + 1}</span> إلى{' '}
              <span className="font-bold text-slate-800">
                {Math.min(currentPage * pageSize, sortedCustomers.length)}
              </span>{' '}
              من أصل <span className="font-black text-slate-900">{sortedCustomers.length}</span> عميل
            </span>
          </div>

          {/* Pagination Buttons */}
          {totalPages > 1 && pageSize < 99999 && (
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="p-1 rounded-lg bg-white border border-slate-200 disabled:opacity-30 hover:bg-slate-100 transition cursor-pointer"
                title="الصفحة الأولى"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>

              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded-lg bg-white border border-slate-200 disabled:opacity-30 hover:bg-slate-100 transition cursor-pointer"
                title="السابق"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 bg-amber-400 text-slate-950 font-black rounded-lg text-xs">
                {currentPage} / {totalPages}
              </span>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded-lg bg-white border border-slate-200 disabled:opacity-30 hover:bg-slate-100 transition cursor-pointer"
                title="التالي"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="p-1 rounded-lg bg-white border border-slate-200 disabled:opacity-30 hover:bg-slate-100 transition cursor-pointer"
                title="الصفحة الأخيرة"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div>
              إجمالي مديونيات العرض: <span className="font-black text-rose-600">{formatCurrency(stats.totalDebt)}</span>
            </div>
            <div className="text-slate-300">|</div>
            <div>
              الحدود الائتمانية: <span className="font-black text-blue-700">{formatCurrency(stats.totalLimit)}</span>
            </div>
          </div>

        </div>

      </div>

      {/* Import Modal for 3400+ Customers (Google Sheets & Excel - Admin & Developer Only) */}
      {isAdminOrDev && isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black shadow-md">
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
                <label className="block text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Link2 className="w-4 h-4 text-blue-600" />
                  <span>طريقة 1: لصق رابط Google Sheets المباشر</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={googleSheetUrl}
                    onChange={(e) => setGoogleSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleFetchGoogleSheet}
                    disabled={isImporting || !googleSheetUrl.trim()}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shrink-0"
                  >
                    {isImporting ? 'جاري الجلب...' : 'جلب الشيت 🔄'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  تأكد من جعل الشيت متاحاً للعرض (Anyone with the link can view).
                </p>
              </div>

              {/* Option 2: Upload Excel File */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                <label className="block text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>طريقة 2: رفع ملف إكسل من جهازك (.xlsx أو .csv)</span>
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-slate-600 file:mr-0 file:ml-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 file:cursor-pointer"
                />
              </div>

              {/* Import Mode: Merge vs Replace */}
              <div className="bg-amber-50/50 p-3.5 rounded-2xl border border-amber-200/60 space-y-2">
                <span className="text-xs font-black text-amber-900 block">طريقة تثبيت البيانات:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${importMode === 'merge' ? 'bg-white border-amber-500 shadow-sm' : 'bg-transparent border-amber-200'}`}>
                    <input
                      type="radio"
                      name="importMode"
                      value="merge"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="text-amber-500"
                    />
                    <div>
                      <div className="font-bold text-xs text-slate-900">دمج وتحديث السجلات (Merge)</div>
                      <div className="text-[10px] text-slate-500">تحديث المديونيات والبيانات مع الحفاظ على العملاء الحاليين</div>
                    </div>
                  </label>

                  <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${importMode === 'replace' ? 'bg-white border-rose-500 shadow-sm' : 'bg-transparent border-amber-200'}`}>
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="text-rose-500"
                    />
                    <div>
                      <div className="font-bold text-xs text-rose-900">استبدال كامل لقاعدة العملاء (Replace)</div>
                      <div className="text-[10px] text-rose-600">مسح القديم وتنزيل الـ 3400 عميل من الشيت بالكامل</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Preview of Parsed Data */}
              {importPreview && (
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-900 font-black text-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>تم تحليل الملف بنجاح! جاهز للتثبيت ({importPreview.customers.length} عميل)</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                      <div className="text-slate-500 text-[10px]">إجمالي العملاء</div>
                      <div className="text-base font-black text-slate-900">{importPreview.customers.length}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                      <div className="text-slate-500 text-[10px]">عدد الفروع المكتشفة</div>
                      <div className="text-base font-black text-blue-600">{importPreview.branches.length}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                      <div className="text-slate-500 text-[10px]">عدد المناديب المكتشفين</div>
                      <div className="text-base font-black text-amber-600">{importPreview.reps.length}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                      <div className="text-slate-500 text-[10px]">إجمالي المديونيات</div>
                      <div className="text-xs font-black text-rose-600">{formatCurrency(importPreview.totalDebt)}</div>
                    </div>
                  </div>

                  <button
                    onClick={handleApplyImport}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black py-2.5 rounded-xl text-xs shadow-lg shadow-emerald-900/20 transition cursor-pointer flex items-center justify-center gap-2"
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
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
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
                    كود العميل <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                    placeholder="مثال: CUST-1045"
                  />
                </div>

                {/* اسم العميل */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم العميل / المحل <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
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
                  <label className="block text-xs font-bold text-amber-800 mb-1">
                    إجمالي المتأخرات والمستحق (ج.م)
                  </label>
                  <input
                    type="number"
                    value={formData.totalOverdueAndDue}
                    onChange={(e) => setFormData({ ...formData, totalOverdueAndDue: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-amber-50/70 border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
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
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-6 py-2 rounded-xl text-xs shadow-md transition active:scale-95 cursor-pointer flex items-center gap-1.5"
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
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
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
                className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition cursor-pointer"
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
                className="flex-1 py-2 text-xs font-black text-white bg-rose-600 rounded-xl hover:bg-rose-500 transition cursor-pointer shadow-md shadow-rose-900/20"
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
