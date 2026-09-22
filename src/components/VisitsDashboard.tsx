import React, { useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Clock3,
  MapPin,
  Plus,
  Save,
  Users,
  Search,
  Phone,
  Calendar,
  Building2,
  UserCheck,
  Filter,
  X,
  Eye,
  FileText,
  AlertCircle,
  XCircle,
  Clock,
  ExternalLink,
  Download,
  FileSpreadsheet,
  Check,
  TrendingUp,
  Store,
  DollarSign
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { doesCustomerBelongToRep, doesCustomerBelongToBranch, doesCustomerBelongToSupervisor, isArabicNameMatch } from '../services/arabicMatchingService';
import type { CustomerVisit } from '../types';

export const VisitsDashboard: React.FC = () => {
  const {
    currentUser,
    customers,
    users,
    getVisibleVisits,
    addVisit,
    updateVisit,
    getCustomerVisitSummary
  } = useApp();

  const visible = getVisibleVisits();

  // Date filters: Quick presets or Month / Exact Date
  const [timePreset, setTimePreset] = useState<'today' | 'week' | 'month' | 'all'>('month');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [exactDate, setExactDate] = useState('');
  const [branch, setBranch] = useState('الكل');
  const [rep, setRep] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState<'الكل' | CustomerVisit['status']>('الكل');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Active Items
  const [showForm, setShowForm] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<CustomerVisit | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [form, setForm] = useState({
    customerId: '',
    repId: currentUser?.role === 'sales_rep' ? currentUser.id : '',
    date: new Date().toISOString().slice(0, 10),
    time: '09:00',
    type: 'زيارة دورية' as CustomerVisit['type'],
    notes: '',
    collectedAmount: 0
  });

  // Customer search state inside the scheduling modal
  const [modalCustomerSearch, setModalCustomerSearch] = useState('');

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Branches available
  const branches = useMemo(() => {
    if (currentUser?.role === 'branch_manager') {
      return [currentUser.branchName || ''];
    }
    if (currentUser?.role === 'supervisor') {
      return Array.from(new Set(users.filter((u) => u.supervisorId === currentUser.id).map((u) => u.branchName).filter(Boolean)));
    }
    return Array.from(new Set(users.map((u) => u.branchName).filter(Boolean))) as string[];
  }, [currentUser, users]);

  // Sales reps available
  const reps = useMemo(() => {
    return users.filter(
      (u) =>
        u.role === 'sales_rep' &&
        (currentUser?.role !== 'supervisor' || u.supervisorId === currentUser.id) &&
        (currentUser?.role !== 'branch_manager' || u.branchName === currentUser.branchName) &&
        (branch === 'الكل' || u.branchName === branch)
    );
  }, [currentUser, users, branch]);

  // Customers accessible to current user
  const myCustomers = useMemo(() => {
    if (currentUser?.role === 'sales_rep') {
      return customers.filter((c) => doesCustomerBelongToRep(c, currentUser));
    }
    if (currentUser?.role === 'branch_manager') {
      return customers.filter((c) => doesCustomerBelongToBranch(c, currentUser.branchName, users));
    }
    if (currentUser?.role === 'supervisor') {
      return customers.filter((c) => doesCustomerBelongToSupervisor(c, currentUser, users));
    }
    return customers;
  }, [currentUser, customers, users]);

  // Filtered customer candidates in the schedule visit modal
  const modalFilteredCustomers = useMemo(() => {
    if (!modalCustomerSearch.trim()) {
      return myCustomers.slice(0, 20);
    }
    const q = modalCustomerSearch.toLowerCase().trim();
    return myCustomers
      .filter((c) => {
        return (
          (c.name || '').toLowerCase().includes(q) ||
          (c.code || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          (c.storeName || '').toLowerCase().includes(q) ||
          (c.address || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 25);
  }, [myCustomers, modalCustomerSearch]);

  const selectedCustomerInForm = useMemo(() => {
    return customers.find((c) => c.id === form.customerId);
  }, [customers, form.customerId]);

  // Helper date boundaries
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const weekAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);

  // Filter visits
  const filtered = useMemo(() => {
    return visible.filter((v) => {
      // 1. Time preset match
      if (timePreset === 'today') {
        if (v.date !== todayStr) return false;
      } else if (timePreset === 'week') {
        if (v.date < weekAgoStr || v.date > todayStr) return false;
      } else if (timePreset === 'month') {
        if (exactDate) {
          if (v.date !== exactDate) return false;
        } else if (month && !v.date.startsWith(month)) {
          return false;
        }
      }

      // 2. Branch match (Only for admin/supervisors/managers; reps should not have their visits hidden)
      if (currentUser?.role !== 'sales_rep') {
        if (branch !== 'الكل' && v.branchName && v.branchName !== branch) return false;
      }

      // 3. Rep match (Only for admin/supervisors/managers; reps only have their own visits)
      if (currentUser?.role !== 'sales_rep') {
        if (rep !== 'الكل') {
          const repUser = users.find((u) => u.id === rep);
          const isDirectId = v.repId === rep;
          const isName = repUser && isArabicNameMatch(v.repName || '', repUser.name);
          if (!isDirectId && !isName) return false;
        }
      }

      // 4. Status match
      if (statusFilter !== 'الكل' && v.status !== statusFilter) return false;

      // 5. Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const c = customers.find((x) => x.id === v.customerId);
      const customerName = (v.customerName || c?.name || '').toLowerCase();
      const customerCode = (v.customerCode || c?.code || '').toLowerCase();
      const repName = (v.repName || '').toLowerCase();
      const notes = (v.notes || '').toLowerCase();
      const outcome = (v.outcome || '').toLowerCase();

      return (
        customerName.includes(q) ||
        customerCode.includes(q) ||
        repName.includes(q) ||
        notes.includes(q) ||
        outcome.includes(q)
      );
    });
  }, [visible, timePreset, month, exactDate, branch, rep, statusFilter, searchQuery, customers, todayStr, weekAgoStr, currentUser?.role, users]);

  // Key KPI stats
  const stats = useMemo(() => {
    let totalCollected = 0;
    filtered.forEach((v) => {
      if (v.collectedAmount) totalCollected += v.collectedAmount;
    });

    return {
      total: filtered.length,
      completed: filtered.filter((v) => v.status === 'منفذة').length,
      scheduled: filtered.filter((v) => v.status === 'مجدولة').length,
      missed: filtered.filter((v) => v.status === 'لم تتم').length,
      cancelled: filtered.filter((v) => v.status === 'ملغاة').length,
      uniqueCustomers: new Set(filtered.map((v) => v.customerId)).size,
      totalCollected
    };
  }, [filtered]);

  // Submit new visit
  const handleSubmitVisit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) {
      showToast('error', 'يرجى اختيار العميل المستهدف أولاً.');
      return;
    }
    const r = reps.find((u) => u.id === form.repId) || users.find((u) => u.id === form.repId) || (currentUser?.role === 'sales_rep' ? currentUser : undefined);
    const c = customers.find((x) => x.id === form.customerId);

    const result = addVisit({
      ...form,
      customerId: c?.id || form.customerId,
      customerName: c?.name,
      customerCode: c?.code,
      repId: r?.id || currentUser?.id,
      repName: r?.name || currentUser?.name || 'المندوب',
      branchName: r?.branchName || c?.branchName || currentUser?.branchName || '',
      supervisorId: r?.supervisorId,
      status: 'مجدولة'
    });

    if (result.success) {
      setShowForm(false);
      setForm({
        ...form,
        customerId: '',
        notes: '',
        collectedAmount: 0
      });
      setModalCustomerSearch('');
      showToast('success', result.message || 'تمت جدولة الزيارة بنجاح!');
    } else {
      showToast('error', result.message);
    }
  };

  // Quick Status Toggle for a visit
  const handleQuickStatusChange = (visit: CustomerVisit, newStatus: CustomerVisit['status']) => {
    const res = updateVisit({ ...visit, status: newStatus });
    if (res.success) {
      showToast('success', `تم تحديث حالة الزيارة إلى "${newStatus}" بنجاح.`);
      if (selectedVisit && selectedVisit.id === visit.id) {
        setSelectedVisit({ ...selectedVisit, status: newStatus });
      }
    } else {
      showToast('error', res.message);
    }
  };

  // Export filtered visits to Excel
  const handleExportVisitsExcel = () => {
    if (filtered.length === 0) {
      showToast('error', 'لا توجد زيارات لتصديرها وفق الفلترة المحددة.');
      return;
    }

    const rows = filtered.map((v) => {
      const c = customers.find((x) => x.id === v.customerId);
      return {
        'كود العميل': c?.code || '---',
        'اسم العميل': c?.name || '---',
        'اسم المحل / النشاط': c?.storeName || '---',
        'الفرع': v.branchName || c?.branchName || '---',
        'المندوب القائم بالزيارة': v.repName || '---',
        'تاريخ الزيارة': v.date,
        'وقت الزيارة': v.time || '---',
        'نوع الزيارة': v.type || 'زيارة دورية',
        'حالة الزيارة': v.status,
        'المبلغ المحصل (ج.م)': v.collectedAmount || 0,
        'هاتف العميل': c?.phone || '---',
        'الملاحظات': v.notes || '',
        'النتيجة بعد التنفيذ': v.outcome || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
      { wch: 12 },
      { wch: 10 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 14 },
      { wch: 30 },
      { wch: 30 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'سجل الزيارات');
    XLSX.writeFile(workbook, `تقرير_زيارات_العملاء_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('success', `تم تصدير ${filtered.length} زيارة إلى ملف الإكسل بنجاح!`);
  };

  const getStatusBadge = (status: CustomerVisit['status']) => {
    switch (status) {
      case 'منفذة':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>منفذة</span>
          </span>
        );
      case 'مجدولة':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3 h-3 text-blue-600" />
            <span>مجدولة</span>
          </span>
        );
      case 'لم تتم':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            <span>لم تتم</span>
          </span>
        );
      case 'ملغاة':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>ملغاة</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <main className="p-3.5 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6 pb-20" dir="rtl">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-xs sm:text-sm font-bold text-white transition-all animate-in fade-in ${
            toastMessage.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="p-1 hover:opacity-80 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Main Actions */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 text-xs font-black mb-1">
            <CalendarCheck className="w-4 h-4" />
            <span>منظومة إدارة وجدولة الزيارات الميدانية المطورة</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">سجل ومتابعة زيارات العملاء</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            جدولة ذكية مع بحث فوري للعملاء، وتصفية شاملة بحسب التاريخ والفروع والمناديب وتحديث سريع للحالة
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportVisitsExcel}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-xs border border-slate-300 transition cursor-pointer"
            title="تصدير الزيارات المعروضة إلى إكسل"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>تصدير إكسل ({filtered.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setModalCustomerSearch('');
              setShowForm(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>جدولة زيارة جديدة</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block">إجمالي الزيارات</span>
            <span className="text-xl sm:text-2xl font-black text-slate-900">{stats.total}</span>
            <span className="text-[10px] text-slate-500 font-bold block">{stats.uniqueCustomers} عميل مختلف</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-emerald-700 block">زيارات منفذة</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-700">{stats.completed}</span>
            <span className="text-[10px] text-emerald-600 font-bold block">
              {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}% نسبة الإنجاز
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-blue-700 block">مجدولة وقادمة</span>
            <span className="text-xl sm:text-2xl font-black text-blue-700">{stats.scheduled}</span>
            <span className="text-[10px] text-blue-600 font-bold block">بانتظار التنفيذ</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Clock3 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-amber-700 block">لم تتم / ملغاة</span>
            <span className="text-xl sm:text-2xl font-black text-amber-700">{stats.missed + stats.cancelled}</span>
            <span className="text-[10px] text-amber-600 font-bold block">{stats.missed} لم تتم • {stats.cancelled} ملغاة</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between col-span-2 lg:col-span-1">
          <div>
            <span className="text-[11px] font-bold text-purple-700 block">المحصل بالزيارات</span>
            <span className="text-lg sm:text-xl font-black text-purple-700">{formatCurrency(stats.totalCollected)}</span>
            <span className="text-[10px] text-purple-600 font-bold block">تحصيل ميداني</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Advanced Filter Bar with Quick Presets */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3.5">
        {/* Quick Date Range Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-500 ml-1">النطاق الزمني:</span>
            <button
              onClick={() => {
                setTimePreset('today');
                setExactDate(todayStr);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                timePreset === 'today'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              زيارات اليوم ({todayStr})
            </button>

            <button
              onClick={() => {
                setTimePreset('week');
                setExactDate('');
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                timePreset === 'week'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              آخر 7 أيام
            </button>

            <button
              onClick={() => {
                setTimePreset('month');
                setExactDate('');
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                timePreset === 'month'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              هذا الشهر ({month})
            </button>

            <button
              onClick={() => {
                setTimePreset('all');
                setExactDate('');
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                timePreset === 'all'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              كل الزيارات (الكل)
            </button>
          </div>

          {timePreset === 'month' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-bold">اختر الشهر:</span>
              <input
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setExactDate('');
                }}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}
        </div>

        {/* Coordinated Filters: Search, Branch, Rep, Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالعميل أو الكود أو المندوب..."
              className="w-full pl-8 pr-9 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:border-emerald-500 focus:outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Branch Selector */}
          {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'supervisor') && (
            <div>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 transition"
              >
                <option value="الكل">جميع الفروع</option>
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {/* Rep Selector */}
          {currentUser?.role !== 'sales_rep' && (
            <div>
              <select
                value={rep}
                onChange={(e) => setRep(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 transition"
              >
                <option value="الكل">جميع المناديب ({reps.length})</option>
                {reps.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 transition"
            >
              <option value="الكل">كل حالات الزيارة</option>
              <option value="مجدولة">مجدولة</option>
              <option value="منفذة">منفذة</option>
              <option value="لم تتم">لم تتم</option>
              <option value="ملغاة">ملغاة</option>
            </select>
          </div>
        </div>

        {/* Reset Filter Button */}
        {(searchQuery || statusFilter !== 'الكل' || branch !== 'الكل' || rep !== 'الكل' || timePreset !== 'month') && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('الكل');
                setBranch('الكل');
                setRep('الكل');
                setTimePreset('month');
                setExactDate('');
              }}
              className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>إلغاء جميع الفلاتر</span>
            </button>
          </div>
        )}
      </div>

      {/* Visits Table and Responsive List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
          <span>نتائج الزيارات: {filtered.length} زيارة مطابقة</span>
          <span className="text-slate-400 font-normal hidden sm:inline">
            اضغط على زر التحديث السريع أو على السطر لعرض كافة التفاصيل
          </span>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100/70 text-slate-700 font-black border-b border-slate-200">
              <tr>
                <th className="p-3">العميل المستهدف</th>
                <th className="p-3">الفرع</th>
                <th className="p-3">المندوب المسئول</th>
                <th className="p-3">تاريخ ووقت الزيارة</th>
                <th className="p-3">نوع الغرض</th>
                <th className="p-3">الحالة الحالية</th>
                <th className="p-3">المحصل</th>
                <th className="p-3 text-center">إجراءات سريعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((v) => {
                const c = customers.find((x) => x.id === v.customerId);

                return (
                  <tr
                    key={v.id}
                    onClick={() => setSelectedVisit(v)}
                    className="hover:bg-slate-50/80 transition cursor-pointer"
                  >
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{v.customerName || c?.name || 'عميل غير مسجل'}</div>
                      <div className="text-[11px] text-slate-500">
                        كود: {v.customerCode || c?.code || '-'} {c?.storeName && `• ${c.storeName}`}
                      </div>
                    </td>
                    <td className="p-3 text-slate-600 font-medium">{v.branchName || c?.branchName || 'عام'}</td>
                    <td className="p-3 font-bold text-slate-800">{v.repName}</td>
                    <td className="p-3 font-mono text-slate-700">
                      <div>{v.date}</div>
                      <div className="text-[10px] text-slate-400">{v.time || '09:00'}</div>
                    </td>
                    <td className="p-3 font-bold text-slate-700">{v.type || 'زيارة دورية'}</td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      {getStatusBadge(v.status)}
                    </td>
                    <td className="p-3 font-mono font-bold text-emerald-700">
                      {v.collectedAmount ? formatCurrency(v.collectedAmount) : '-'}
                    </td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Quick action buttons */}
                        {v.status !== 'منفذة' && (
                          <button
                            type="button"
                            onClick={() => handleQuickStatusChange(v, 'منفذة')}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded-lg text-[11px] border border-emerald-300 transition cursor-pointer"
                            title="تأكيد تنفيذ الزيارة"
                          >
                            تنفيذ ✅
                          </button>
                        )}
                        {v.status !== 'لم تتم' && v.status !== 'منفذة' && (
                          <button
                            type="button"
                            onClick={() => handleQuickStatusChange(v, 'لم تتم')}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold px-2 py-1 rounded-lg text-[11px] border border-amber-300 transition cursor-pointer"
                            title="تسجيل أن الزيارة لم تتم"
                          >
                            لم تتم ⚠️
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedVisit(v)}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                          title="عرض التفاصيل"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="block md:hidden divide-y divide-slate-100">
          {filtered.map((v) => {
            const c = customers.find((x) => x.id === v.customerId);

            return (
              <div
                key={v.id}
                onClick={() => setSelectedVisit(v)}
                className="p-3.5 space-y-2 hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 leading-snug">{v.customerName || c?.name || 'عميل غير معروف'}</h4>
                    <div className="text-xs text-slate-500 font-mono">
                      كود: {v.customerCode || c?.code || '-'} | {v.branchName || c?.branchName || 'عام'}
                    </div>
                  </div>
                  {getStatusBadge(v.status)}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                  <div>
                    المندوب: <span className="font-bold text-slate-800">{v.repName}</span>
                  </div>
                  <div className="font-mono text-slate-500">{v.date}</div>
                </div>

                {/* Quick actions for mobile */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-50" onClick={(e) => e.stopPropagation()}>
                  {v.status !== 'منفذة' && (
                    <button
                      type="button"
                      onClick={() => handleQuickStatusChange(v, 'منفذة')}
                      className="bg-emerald-50 text-emerald-800 font-bold px-2.5 py-1 rounded-lg text-xs border border-emerald-300"
                    >
                      تنفيذ ✅
                    </button>
                  )}
                  {c?.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="bg-slate-100 text-slate-700 p-1 rounded-lg"
                      title="اتصال"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="py-12 px-4 text-center space-y-2">
            <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-600">لا توجد زيارات مطابقة للفلترة المحددة</p>
            <p className="text-xs text-slate-400">يمكنك جدولة زيارة جديدة أو تغيير خيارات البحث والتاريخ</p>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* Schedule Visit Modal (with Searchable Fast Customer Picker)              */}
      {/* ========================================================================= */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4 z-50 animate-in fade-in duration-150">
          <form
            onSubmit={handleSubmitVisit}
            className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-lg space-y-4 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto"
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-700 flex items-center justify-center font-bold">
                  <CalendarCheck className="w-4 h-4" />
                </div>
                <h2 className="text-lg font-black text-slate-900">جدولة زيارة عميل جديدة</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* SMART SEARCHABLE CUSTOMER PICKER */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-800">
                  العميل المستهدف للزيارة *
                </label>

                {selectedCustomerInForm ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="text-xs font-black text-emerald-950 flex items-center gap-2">
                        <span>{selectedCustomerInForm.name}</span>
                        <span className="text-[11px] font-mono text-emerald-800 font-bold">
                          ({selectedCustomerInForm.code})
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        {selectedCustomerInForm.branchName} • المديونية:{' '}
                        {formatCurrency(selectedCustomerInForm.currentBalance ?? selectedCustomerInForm.balance ?? 0)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, customerId: '' })}
                      className="bg-white hover:bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-xl text-xs border border-emerald-300 transition cursor-pointer"
                    >
                      تغيير العميل
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={modalCustomerSearch}
                        onChange={(e) => setModalCustomerSearch(e.target.value)}
                        placeholder="ابحث بالاسم، كود العميل، الهاتف، أو اسم المحل..."
                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-800 focus:outline-none transition"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                      {modalFilteredCustomers.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">
                          لم يتم العثور على عملاء مطابقين للبحث
                        </div>
                      ) : (
                        modalFilteredCustomers.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => {
                              setForm({
                                ...form,
                                customerId: c.id,
                                repId: c.repId || form.repId
                              });
                            }}
                            className="p-2.5 hover:bg-emerald-50 transition cursor-pointer flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-black text-slate-900">{c.name}</div>
                              <div className="text-[10px] text-slate-500">
                                كود: {c.code || '-'} | {c.branchName}
                              </div>
                            </div>
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                              اختيار
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Rep selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المندوب القائم بالزيارة *</label>
                <select
                  required
                  value={form.repId}
                  onChange={(e) => setForm({ ...form, repId: e.target.value })}
                  disabled={currentUser?.role === 'sales_rep'}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- اختر المندوب --</option>
                  {reps.map((u) => (
                    <option value={u.id} key={u.id}>
                      {u.name} ({u.branchName || 'عام'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الزيارة *</label>
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الوقت التقريبي *</label>
                  <input
                    required
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Visit Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع الغرض من الزيارة</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as CustomerVisit['type'] })}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="زيارة دورية">زيارة دورية اعتيادية</option>
                  <option value="تحصيل">تحصيل مديونية ومستحقات</option>
                  <option value="تسليم بضاعة">تسليم بضاعة أو طلبية</option>
                  <option value="حل مشكلة">خدمة عملاء وحل مشكلة</option>
                  <option value="فتح حساب جديد">فتح حساب عميل جديد</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات وتوجيهات الزيارة</label>
                <textarea
                  placeholder="سجل أهداف الزيارة، النواقص، أو أي تعليمات خاصة..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 min-h-16"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>حفظ وجدولة الزيارة</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Visit Details Modal */}
      {selectedVisit && (
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4 z-50 animate-in fade-in duration-150"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedVisit(null);
          }}
        >
          <div
            className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 space-y-4"
            dir="rtl"
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-bold">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">بطاقة تفاصيل الزيارة الميدانية</h2>
                  <p className="text-xs text-slate-500">سجل الزيارة ونتائجها المالية والميدانية</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const c = customers.find((x) => x.id === selectedVisit.customerId);
              return (
                <div className="space-y-4">
                  {/* Customer Banner */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900">{c?.name || 'عميل غير مسجل'}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        كود: {c?.code || '-'} | الفرع: {selectedVisit.branchName || c?.branchName || '-'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c?.phone && (
                        <a
                          href={`tel:${c.phone}`}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>{c.phone}</span>
                        </a>
                      )}
                      {getStatusBadge(selectedVisit.status)}
                    </div>
                  </div>

                  {/* Grid of Key Info */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 block">المندوب المسؤول</span>
                      <span className="text-xs font-black text-slate-800">{selectedVisit.repName}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 block">تاريخ ووقت الزيارة</span>
                      <span className="text-xs font-black text-slate-800">
                        {selectedVisit.date} {selectedVisit.time ? `- ${selectedVisit.time}` : ''}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 block">نوع الزيارة</span>
                      <span className="text-xs font-black text-slate-800">{selectedVisit.type || 'زيارة دورية'}</span>
                    </div>
                  </div>

                  {/* Status Update Control */}
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-black text-emerald-950 block">تغيير حالة الزيارة:</span>
                      <span className="text-[11px] text-emerald-800">تحديث فوري ينعكس على سجل المندوب</span>
                    </div>
                    <select
                      value={selectedVisit.status}
                      onChange={(e) => {
                        const newStatus = e.target.value as CustomerVisit['status'];
                        handleQuickStatusChange(selectedVisit, newStatus);
                      }}
                      className="px-3 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-black text-slate-800 focus:outline-none"
                    >
                      <option value="مجدولة">مجدولة</option>
                      <option value="منفذة">منفذة</option>
                      <option value="لم تتم">لم تتم</option>
                      <option value="ملغاة">ملغاة</option>
                    </select>
                  </div>

                  {/* Notes & Outcomes */}
                  {selectedVisit.notes && (
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-600 block mb-1">الملاحظات والتوجيهات:</span>
                      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">{selectedVisit.notes}</p>
                    </div>
                  )}

                  {selectedVisit.outcome && (
                    <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200">
                      <span className="text-xs font-bold text-emerald-800 block mb-1">النتيجة بعد التنفيذ:</span>
                      <p className="text-xs text-emerald-900 leading-relaxed">{selectedVisit.outcome}</p>
                    </div>
                  )}

                  {selectedVisit.collectedAmount ? (
                    <div className="p-3.5 bg-emerald-100/70 rounded-2xl border border-emerald-300 flex items-center justify-between">
                      <span className="text-xs font-black text-emerald-950">المبلغ المحصل خلال الزيارة:</span>
                      <span className="text-base font-black text-emerald-700 font-mono">
                        {formatCurrency(selectedVisit.collectedAmount)}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
