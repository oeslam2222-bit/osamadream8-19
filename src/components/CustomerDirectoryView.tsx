import React, { useState, useMemo } from 'react';
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
  X,
  Save,
  MessageCircle,
  ExternalLink,
  ShieldAlert,
  Layers,
  Sparkles
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Customer, User } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { doesCustomerBelongToRep, isArabicNameMatch, normalizeArabicText } from '../services/arabicMatchingService';
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
    addCustomer,
    updateCustomer,
    deleteCustomer,
    refreshCustomerRepLinks,
  } = useApp();

  // Scope: 'my_customers' (default for reps) | 'branch' | 'all'
  const isRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isBranchManager = currentUser?.role === 'branch_manager';

  const [scopeTab, setScopeTab] = useState<'my_customers' | 'branch' | 'all'>(() => {
    if (isRep) return 'my_customers';
    if (isSupervisor || isBranchManager) return 'branch';
    return 'all';
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('الكل');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('الكل');
  const [debtFilter, setDebtFilter] = useState<'all' | 'has_debt' | 'exceeded_limit' | 'zero_debt'>('all');
  const [sortField, setSortField] = useState<'name' | 'code' | 'debt' | 'limit' | 'branch'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{
    show: boolean;
    msg: string;
    type: 'success' | 'info' | 'warning';
  } | null>(null);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    id: '',
    code: '',
    name: '',
    storeName: '',
    branchName: currentUser?.branchName || 'فرع المنيا',
    repName: isRep ? currentUser?.name || '' : '',
    repId: isRep ? currentUser?.id || '' : '',
    currentBalance: 0,
    creditLimit: 50000,
    phone: '',
    address: '',
    taxNumber: '',
    notes: '',
  });

  // List of all sales reps in the system
  const salesReps = useMemo(() => {
    return users.filter((u) => u.role === 'sales_rep' || u.role === 'supervisor');
  }, [users]);

  // Compute Scoped List based on Tab
  const scopedCustomers = useMemo(() => {
    if (!currentUser) return customers;

    if (scopeTab === 'my_customers') {
      return customers.filter((c) => doesCustomerBelongToRep(c, currentUser));
    }

    if (scopeTab === 'branch') {
      const userBranch = currentUser.branchName;
      if (!userBranch || userBranch === 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)') {
        return customers;
      }
      return customers.filter((c) => {
        const cBranchNorm = (c.branchName || '').replace(/فرع\s+/g, '').trim();
        const uBranchNorm = userBranch.replace(/فرع\s+/g, '').trim();
        return cBranchNorm.includes(uBranchNorm) || uBranchNorm.includes(cBranchNorm);
      });
    }

    return customers;
  }, [customers, currentUser, scopeTab]);

  // Filter & Search Logic
  const filteredCustomers = useMemo(() => {
    const query = normalizeArabicText(searchQuery);

    return scopedCustomers.filter((c) => {
      // Branch filter
      if (selectedBranch !== 'الكل') {
        const cBranch = (c.branchName || '').replace(/فرع\s+/g, '').trim();
        const selBranch = selectedBranch.replace(/فرع\s+/g, '').trim();
        if (!cBranch.includes(selBranch) && !selBranch.includes(cBranch)) {
          return false;
        }
      }

      // Rep filter
      if (selectedRepFilter !== 'الكل') {
        const repName = c.salesRepName || c.repName || '';
        if (!isArabicNameMatch(repName, selectedRepFilter) && c.repId !== selectedRepFilter) {
          return false;
        }
      }

      // Debt filter
      const debt = Number(c.currentBalance ?? c.balance ?? 0);
      const limit = Number(c.creditLimit || 0);

      if (debtFilter === 'has_debt' && debt <= 0) return false;
      if (debtFilter === 'zero_debt' && debt > 0) return false;
      if (debtFilter === 'exceeded_limit' && (limit <= 0 || debt <= limit)) return false;

      // Text Search
      if (query) {
        const nameNorm = normalizeArabicText(c.name);
        const storeNorm = normalizeArabicText(c.storeName);
        const codeNorm = (c.code || '').toLowerCase();
        const repNorm = normalizeArabicText(c.salesRepName || c.repName);
        const branchNorm = normalizeArabicText(c.branchName);
        const phone = (c.phone || '').replace(/[^0-9]/g, '');
        const addressNorm = normalizeArabicText(c.address);

        const match =
          nameNorm.includes(query) ||
          storeNorm.includes(query) ||
          codeNorm.includes(query.toLowerCase()) ||
          repNorm.includes(query) ||
          branchNorm.includes(query) ||
          phone.includes(query) ||
          addressNorm.includes(query);

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

  // Statistical calculations
  const stats = useMemo(() => {
    let totalDebt = 0;
    let totalLimit = 0;
    let customersWithDebt = 0;
    let customersExceededLimit = 0;

    scopedCustomers.forEach((c) => {
      const debt = Number(c.currentBalance ?? c.balance ?? 0);
      const limit = Number(c.creditLimit || 0);
      if (debt > 0) {
        totalDebt += debt;
        customersWithDebt++;
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
      totalLimit,
      availableLimit: Math.max(0, totalLimit - totalDebt),
      customersWithDebt,
      customersExceededLimit,
    };
  }, [scopedCustomers, customers, currentUser]);

  // Handle Sort Click
  const handleSort = (field: 'name' | 'code' | 'debt' | 'limit' | 'branch') => {
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
    setFormData({
      id: customer.id,
      code: customer.code || '',
      name: customer.name || '',
      storeName: customer.storeName || customer.name || '',
      branchName: customer.branchName || currentUser?.branchName || 'فرع المنيا',
      repName: customer.salesRepName || customer.repName || '',
      repId: customer.repId || '',
      currentBalance: Number(customer.currentBalance ?? customer.balance ?? 0),
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
      branchName: currentUser?.branchName || 'فرع المنيا',
      repName: isRep ? currentUser?.name || '' : '',
      repId: isRep ? currentUser?.id || '' : '',
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

    const payload: Customer = {
      id: editingCustomer ? editingCustomer.id : formData.id || `cust_${Date.now()}`,
      code: formData.code.trim() || `CUST-${Math.floor(Math.random() * 9000 + 1000)}`,
      name: formData.name.trim(),
      storeName: formData.storeName.trim() || formData.name.trim(),
      branchName: formData.branchName,
      salesRepName: formData.repName.trim(),
      repName: formData.repName.trim(),
      repId: formData.repId,
      currentBalance: Number(formData.currentBalance) || 0,
      balance: Number(formData.currentBalance) || 0,
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

  // Export Exact Format Requested by User
  const handleExportSheet = () => {
    const wb = XLSX.utils.book_new();

    const headers = [
      'كود العميل',
      'اسم العميل',
      'الفرع',
      'المندوب',
      'مديونيه العميل',
      'الحد الائتماني',
      'المتبقي من الائتمان',
      'رقم الهاتف',
      'العنوان',
    ];

    const rows = sortedCustomers.map((c) => {
      const limit = Number(c.creditLimit) || 0;
      const balance = Number(c.currentBalance ?? c.balance ?? 0);
      const available = Math.max(0, limit - balance);
      return [
        c.code || '---',
        c.name || '',
        c.branchName || 'الفرع الرئيسي',
        c.salesRepName || c.repName || 'غير محدد',
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
          <button
            onClick={handleRunSync}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-300 border border-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
            title="إعادة مطابقة أسماء المناديب مع أسماء العملاء في الشيت"
          >
            <RefreshCw className="w-4 h-4" />
            <span>مزامنة المناديب 🔄</span>
          </button>

          <button
            onClick={handleExportSheet}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-md shadow-emerald-900/30"
          >
            <Download className="w-4 h-4" />
            <span>تصدير إكسل 📥</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-lg shadow-amber-400/20"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>إضافة عميل جديد ➕</span>
          </button>
        </div>
      </div>

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

        {/* Card 2: Total Customer Debt */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي مديونيات العملاء</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-rose-600">
              {formatCurrency(stats.totalDebt)}
            </div>
            <div className="text-[11px] text-rose-500 font-semibold mt-0.5">
              {stats.customersWithDebt} عميل عليهم مديونيات
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
          onClick={() => setScopeTab('my_customers')}
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
          onClick={() => setScopeTab('branch')}
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
          onClick={() => setScopeTab('all')}
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
              onChange={(e) => setSearchQuery(e.target.value)}
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
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
            >
              <option value="الكل">كل الفروع (الكل)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sales Rep Filter */}
          <div>
            <select
              value={selectedRepFilter}
              onChange={(e) => setSelectedRepFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
            >
              <option value="الكل">كل المناديب (الكل)</option>
              {salesReps.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name} ({r.branchName || 'فرع غير محدد'})
                </option>
              ))}
            </select>
          </div>

          {/* Debt / Limit Status Filter */}
          <div>
            <select
              value={debtFilter}
              onChange={(e) => setDebtFilter(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
            >
              <option value="all">كل حالات المديونية</option>
              <option value="has_debt">عملاء عليهم مديونية &gt; 0 ج.م</option>
              <option value="exceeded_limit">عملاء تجاوزوا الحد الائتماني ⚠️</option>
              <option value="zero_debt">عملاء بدون مديونية (0 ج.م)</option>
            </select>
          </div>

        </div>
      </div>

      {/* Main Customers Table Matching Requested Layout Exactly */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Table Header Bar */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs font-black text-slate-700 flex items-center gap-2">
            <span>سجل العملاء التفاعلي</span>
            <span className="text-[11px] font-bold text-slate-400">
              (معروض {sortedCustomers.length} من {scopedCustomers.length})
            </span>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <span>ترتيب حسب:</span>
            <button
              onClick={() => handleSort('name')}
              className={`px-2 py-0.5 rounded-md font-bold transition ${
                sortField === 'name' ? 'bg-amber-400 text-slate-950' : 'bg-white border border-slate-200'
              }`}
            >
              الاسم
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
              {sortedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <Users className="w-6 h-6" />
                      </div>
                      <p className="font-bold text-slate-600">لا توجد نتائج تطابق خيارات البحث</p>
                      <p className="text-[11px] text-slate-400">
                        جرب تغيير كلمات البحث أو التبديل إلى تبويب "عملاء فرعي" أو "جميع العملاء"
                      </p>
                      {scopeTab === 'my_customers' && (
                        <button
                          onClick={() => setScopeTab('branch')}
                          className="mt-2 text-xs bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-3 py-1.5 rounded-xl transition cursor-pointer"
                        >
                          عرض جميع عملاء فرعك
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                sortedCustomers.map((customer, index) => {
                  const debt = Number(customer.currentBalance ?? customer.balance ?? 0);
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
                        {index + 1}
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
                          {customer.tier === 'مميز' && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-black">
                              VIP
                            </span>
                          )}
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

                          {/* Edit Customer */}
                          <button
                            onClick={() => handleOpenEdit(customer)}
                            className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
                            title="تعديل بيانات العميل والحد الائتماني والمندوب"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Customer (Admins only) */}
                          {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
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

        {/* Table Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            إجمالي العملاء في هذا العرض: <span className="font-bold text-slate-800">{sortedCustomers.length}</span> عميل
          </div>
          <div className="flex items-center gap-4">
            <div>
              إجمالي مديونيات الصفحة: <span className="font-black text-rose-600">{formatCurrency(stats.totalDebt)}</span>
            </div>
            <div className="text-slate-300">|</div>
            <div>
              إجمالي الحدود الائتمانية: <span className="font-black text-blue-700">{formatCurrency(stats.totalLimit)}</span>
            </div>
          </div>
        </div>

      </div>

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
                    {branches.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
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
                    value={formData.repId || formData.repName}
                    onChange={(e) => {
                      const selectedVal = e.target.value;
                      const repUser = salesReps.find((r) => r.id === selectedVal || r.name === selectedVal);
                      setFormData({
                        ...formData,
                        repId: repUser ? repUser.id : '',
                        repName: repUser ? repUser.name : selectedVal,
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- غير محدد (بدون مندوب) --</option>
                    {salesReps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.branchName || 'فرع غير محدد'})
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
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
                    placeholder="مثال: المنيا - شارع المحطة"
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
