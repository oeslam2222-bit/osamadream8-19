import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Building,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Info,
  Layers,
  LogIn,
  Package,
  Receipt,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Truck,
  User,
  UserCheck,
  Users,
  X,
  XCircle
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AuditActionType, AuditLog, UserRole } from '../types';

interface AuditLogViewProps {
  onViewInvoice?: (invoiceId: string) => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ onViewInvoice }) => {
  const { auditLogs, clearAuditLogs, currentUser, branches, invoices } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActionFilter, setSelectedActionFilter] = useState<string>('all');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [quickCategory, setQuickCategory] = useState<'all' | 'sales_reps' | 'supervisor_approval' | 'stock_supply' | 'cancellations' | 'security'>('all');

  // Pagination state for blazing fast rendering
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(15);

  // Selected Log Details Modal
  const [selectedLogDetail, setSelectedLogDetail] = useState<AuditLog | null>(null);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedActionFilter, selectedBranchFilter, selectedRoleFilter, sortOrder, quickCategory, itemsPerPage]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = auditLogs.length;
    const repReservations = auditLogs.filter((l) => l.action === 'create_invoice').length;
    const supervisorApprovals = auditLogs.filter((l) => l.action === 'approve_invoice' || l.action === 'update_invoice_status').length;
    const stockAndSupply = auditLogs.filter(
      (l) => l.action === 'stock_adjustment' || l.action === 'import_products'
    ).length;
    const cancellations = auditLogs.filter(
      (l) => l.action === 'cancel_invoice' || l.action === 'return_invoice'
    ).length;
    const securityAndUsers = auditLogs.filter(
      (l) => l.action === 'user_login' || l.action === 'create_user' || l.action === 'update_user'
    ).length;

    return { total, repReservations, supervisorApprovals, stockAndSupply, cancellations, securityAndUsers };
  }, [auditLogs]);

  // Filtered & Sorted logs
  const filteredLogs = useMemo(() => {
    return auditLogs
      .filter((log) => {
        // Quick Category tabs
        if (quickCategory === 'sales_reps' && log.action !== 'create_invoice') {
          return false;
        }
        if (quickCategory === 'supervisor_approval' && log.action !== 'approve_invoice' && log.action !== 'update_invoice_status') {
          return false;
        }
        if (quickCategory === 'stock_supply' && log.action !== 'stock_adjustment' && log.action !== 'import_products') {
          return false;
        }
        if (quickCategory === 'cancellations' && log.action !== 'cancel_invoice' && log.action !== 'return_invoice') {
          return false;
        }
        if (quickCategory === 'security' && log.action !== 'user_login' && log.action !== 'create_user' && log.action !== 'update_user') {
          return false;
        }

        // Search term matching
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchUser = log.userName.toLowerCase().includes(term);
          const matchTitle = log.actionTitle.toLowerCase().includes(term);
          const matchDetails = log.details.toLowerCase().includes(term);
          const matchBranch = log.branchName.toLowerCase().includes(term);
          const matchInv = log.invoiceNumber?.toLowerCase().includes(term);
          if (!matchUser && !matchTitle && !matchDetails && !matchBranch && !matchInv) {
            return false;
          }
        }

        // Action dropdown filter
        if (selectedActionFilter !== 'all' && log.action !== selectedActionFilter) {
          return false;
        }

        // Branch filter
        if (selectedBranchFilter !== 'all' && log.branchName !== selectedBranchFilter) {
          return false;
        }

        // Role filter
        if (selectedRoleFilter !== 'all' && log.userRole !== selectedRoleFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
  }, [auditLogs, searchTerm, selectedActionFilter, selectedBranchFilter, selectedRoleFilter, sortOrder, quickCategory]);

  // Paginated Slices
  const totalPages = useMemo(() => {
    if (itemsPerPage === 'all') return 1;
    return Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage));
  }, [filteredLogs.length, itemsPerPage]);

  const displayedLogs = useMemo(() => {
    if (itemsPerPage === 'all') return filteredLogs;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['التوقيت الدقيق بالثانية', 'المستخدم', 'الدور', 'الفرع', 'نوع الحركة', 'عنوان العملية', 'التفاصيل الكاملة', 'رقم الفاتورة المرتبطة'];
    const rows = filteredLogs.map((l) => [
      `"${l.formattedTime}"`,
      `"${l.userName}"`,
      `"${l.userRole}"`,
      `"${l.branchName}"`,
      `"${l.action}"`,
      `"${l.actionTitle.replace(/"/g, '""')}"`,
      `"${l.details.replace(/"/g, '""')}"`,
      `"${l.invoiceNumber || '-'}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Audit_Trail_Dream_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionIcon = (action: AuditActionType) => {
    switch (action) {
      case 'create_invoice':
        return <Receipt className="w-4 h-4 text-amber-600" />;
      case 'approve_invoice':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'cancel_invoice':
        return <XCircle className="w-4 h-4 text-rose-600" />;
      case 'return_invoice':
        return <ShieldAlert className="w-4 h-4 text-orange-600" />;
      case 'update_invoice_status':
        return <History className="w-4 h-4 text-blue-600" />;
      case 'stock_adjustment':
        return <Layers className="w-4 h-4 text-indigo-600" />;
      case 'import_products':
        return <FileSpreadsheet className="w-4 h-4 text-teal-600" />;
      case 'user_login':
        return <LogIn className="w-4 h-4 text-sky-600" />;
      case 'create_user':
      case 'update_user':
        return <UserCheck className="w-4 h-4 text-purple-600" />;
      default:
        return <Info className="w-4 h-4 text-slate-600" />;
    }
  };

  const getBadgeStyle = (badgeType: 'info' | 'success' | 'warning' | 'danger' | 'purple' | 'neutral' | string) => {
    switch (badgeType) {
      case 'success':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'danger':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'warning':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'purple':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'neutral':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      case 'info':
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-black bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">مدير عام</span>;
      case 'branch_manager':
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-black bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">مدير فرع</span>;
      case 'supervisor':
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-black bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">مشرف</span>;
      case 'sales_rep':
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-black bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">مندوب</span>;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300 pb-16">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-700/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-lg">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>سجل تدقيق حركات المخزون المباشرة</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 font-bold">
                    Audit Trail
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-300">
                  توثيق لحظي بدقة بالثانية لكل حركة حجز من المندوب، صرف واعتماد المشرف، توريد المصنع، وتعديلات الجرد.
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 hover:text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              title="تصدير السجل إلى ملف Excel / CSV"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>تصدير إكسل ({filteredLogs.length})</span>
            </button>

            {currentUser?.role === 'admin' && (
              <button
                onClick={() => {
                  if (window.confirm('هل أنت متأكد من مسح جميع سجلات العمليات؟ لا يمكن التراجع عن هذا الإجراء.')) {
                    clearAuditLogs();
                  }
                }}
                className="flex items-center gap-1.5 bg-rose-900/40 hover:bg-rose-800/60 border border-rose-700/60 text-rose-200 px-3.5 py-2.5 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                title="مسح السجل (للأدمن فقط)"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>مسح السجل</span>
              </button>
            )}
          </div>
        </div>

        {/* Responsive Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-5 pt-4 border-t border-slate-700/60 text-slate-200">
          <div className="bg-slate-800/80 backdrop-blur p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <History className="w-3.5 h-3.5 text-amber-400" />
              <span>إجمالي الحركات</span>
            </div>
            <div className="text-base sm:text-lg font-black text-amber-300 mt-1">{stats.total}</div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <Receipt className="w-3.5 h-3.5 text-amber-400" />
              <span>حجوزات المناديب</span>
            </div>
            <div className="text-base sm:text-lg font-black text-amber-300 mt-1">{stats.repReservations}</div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>اعتماد وصرف المشرف</span>
            </div>
            <div className="text-base sm:text-lg font-black text-emerald-300 mt-1">{stats.supervisorApprovals}</div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-indigo-400" />
              <span>توريدات وجرد</span>
            </div>
            <div className="text-base sm:text-lg font-black text-indigo-300 mt-1">{stats.stockAndSupply}</div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>إلغاء ومرتجعات</span>
            </div>
            <div className="text-base sm:text-lg font-black text-rose-300 mt-1">{stats.cancellations}</div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>أمان ودخول</span>
            </div>
            <div className="text-base sm:text-lg font-black text-sky-300 mt-1">{stats.securityAndUsers}</div>
          </div>
        </div>
      </div>

      {/* Quick Category Filter Tabs */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2 overflow-x-auto text-xs font-black scrollbar-none">
        <button
          onClick={() => setQuickCategory('all')}
          className={`px-3 py-2 rounded-xl whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            quickCategory === 'all'
              ? 'bg-slate-900 text-amber-400 shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>كل العمليات ({auditLogs.length})</span>
        </button>

        <button
          onClick={() => setQuickCategory('sales_reps')}
          className={`px-3 py-2 rounded-xl whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            quickCategory === 'sales_reps'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>حجز المناديب ({stats.repReservations})</span>
        </button>

        <button
          onClick={() => setQuickCategory('supervisor_approval')}
          className={`px-3 py-2 rounded-xl whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            quickCategory === 'supervisor_approval'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>صرف واعتماد المشرف ({stats.supervisorApprovals})</span>
        </button>

        <button
          onClick={() => setQuickCategory('stock_supply')}
          className={`px-3 py-2 rounded-xl whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            quickCategory === 'stock_supply'
              ? 'bg-indigo-700 text-white shadow-sm'
              : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>توريد المصنع والجرد ({stats.stockAndSupply})</span>
        </button>

        <button
          onClick={() => setQuickCategory('cancellations')}
          className={`px-3 py-2 rounded-xl whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            quickCategory === 'cancellations'
              ? 'bg-rose-700 text-white shadow-sm'
              : 'bg-rose-50 text-rose-900 hover:bg-rose-100'
          }`}
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>إلغاء ومرتجع ({stats.cancellations})</span>
        </button>

        <button
          onClick={() => setQuickCategory('security')}
          className={`px-3 py-2 rounded-xl whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
            quickCategory === 'security'
              ? 'bg-sky-700 text-white shadow-sm'
              : 'bg-sky-50 text-sky-900 hover:bg-sky-100'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>الأمان والدخول ({stats.securityAndUsers})</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          
          {/* Search Box */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث باسم المندوب، المشرف، الفاتورة، أو الصنف..."
              className="w-full pl-3 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
            />
          </div>

          {/* Action Filter */}
          <div>
            <select
              value={selectedActionFilter}
              onChange={(e) => setSelectedActionFilter(e.target.value)}
              className="w-full py-2.5 px-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-700 cursor-pointer"
            >
              <option value="all">كل أنواع العمليات</option>
              <option value="create_invoice">حجز فاتورة جديدة (مندوب)</option>
              <option value="approve_invoice">اعتماد وصرف المخزون (مشرف)</option>
              <option value="cancel_invoice">إلغاء طلبية واسترجاع رصيد</option>
              <option value="return_invoice">مرتجع مبيعات</option>
              <option value="update_invoice_status">تحويل وتعديل حالة الفاتورة</option>
              <option value="stock_adjustment">تعديلات جردية وتوريد</option>
              <option value="import_products">استيراد ومزامنة إكسل</option>
              <option value="user_login">تسجيل دخول</option>
              <option value="create_user">تسجيل مستخدمين</option>
              <option value="update_user">اعتماد وتفعيل حساب</option>
            </select>
          </div>

          {/* Branch Filter */}
          <div>
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="w-full py-2.5 px-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-700 cursor-pointer"
            >
              <option value="all">كل الفروع (الكل)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter & Sort */}
          <div className="flex items-center gap-2">
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="flex-1 py-2.5 px-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-700 cursor-pointer"
            >
              <option value="all">كل الأدوار</option>
              <option value="sales_rep">المناديب</option>
              <option value="supervisor">المشرفين</option>
              <option value="branch_manager">مديري الفروع</option>
              <option value="admin">المدير العام</option>
            </select>

            <button
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl font-black text-slate-700 flex items-center gap-1 transition cursor-pointer"
              title="ترتيب زمني"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'desc' ? 'الأحدث' : 'الأقدم'}</span>
            </button>
          </div>
        </div>

        {/* Active Filters summary pills */}
        {(searchTerm || selectedActionFilter !== 'all' || selectedBranchFilter !== 'all' || selectedRoleFilter !== 'all' || quickCategory !== 'all') && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>التصفيات النشطة:</span>
            {searchTerm && (
              <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-bold">
                بحث: "{searchTerm}"
              </span>
            )}
            {quickCategory !== 'all' && (
              <span className="bg-slate-900 text-amber-300 px-2 py-0.5 rounded-md font-bold">
                القسم: {quickCategory}
              </span>
            )}
            {selectedActionFilter !== 'all' && (
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-bold">
                العملية: {selectedActionFilter}
              </span>
            )}
            {selectedBranchFilter !== 'all' && (
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold">
                الفرع: {selectedBranchFilter}
              </span>
            )}
            {selectedRoleFilter !== 'all' && (
              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-bold">
                الدور: {selectedRoleFilter}
              </span>
            )}
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedActionFilter('all');
                setSelectedBranchFilter('all');
                setSelectedRoleFilter('all');
                setQuickCategory('all');
              }}
              className="text-rose-600 hover:underline font-black mr-auto cursor-pointer"
            >
              إعادة ضبط الفلاتر
            </button>
          </div>
        )}
      </div>

      {/* Main Logs Table & Cards */}
      <div className="space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-300 shadow-sm space-y-3">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <History className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">لا توجد حركات مسجلة تطابق معايير البحث</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              سيتم تسجيل كافة الأنشطة فور قيام المناديب أو المشرفين بإنشاء فواتير، تعديل حالاتها، صرف البضائع أو تعديل المخزون.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop / Laptop Table View (Hidden on mobile < md) */}
            <div className="hidden md:block bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900 text-slate-200 font-bold">
                    <tr>
                      <th className="py-3.5 px-4 w-44">التوقيت الدقيق بالثانية</th>
                      <th className="py-3.5 px-4 w-48">المستخدم والدور</th>
                      <th className="py-3.5 px-4 w-40">الفرع</th>
                      <th className="py-3.5 px-4">نوع الحركة وتفاصيل العملية</th>
                      <th className="py-3.5 px-4 w-32 text-center">الفاتورة / الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {displayedLogs.map((log) => (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLogDetail(log)}
                        className="hover:bg-amber-50/40 transition group cursor-pointer"
                      >
                        {/* Timestamp with exact seconds */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 font-mono">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{log.formattedTime}</span>
                          </div>
                        </td>

                        {/* User & Role */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-800 border border-slate-200 flex items-center justify-center font-black text-[11px] shrink-0">
                              {log.userName.slice(0, 1)}
                            </div>
                            <div>
                              <div className="font-black text-slate-900 leading-tight truncate max-w-[150px]">{log.userName}</div>
                              <div className="mt-0.5">{getRoleBadge(log.userRole)}</div>
                            </div>
                          </div>
                        </td>

                        {/* Branch */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[140px] font-medium" title={log.branchName}>
                              {log.branchName}
                            </span>
                          </div>
                        </td>

                        {/* Action Details */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="p-1 rounded-md bg-slate-100 shrink-0">
                                {getActionIcon(log.action)}
                              </span>
                              <span className="font-black text-slate-900 text-xs">{log.actionTitle}</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${getBadgeStyle(
                                  log.badgeType || 'info'
                                )}`}
                              >
                                {log.action}
                              </span>
                            </div>
                            <p className="text-slate-600 text-[11px] leading-relaxed line-clamp-2">{log.details}</p>
                          </div>
                        </td>

                        {/* Invoice Link */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {log.invoiceNumber ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onViewInvoice && log.invoiceId) {
                                  onViewInvoice(log.invoiceId);
                                }
                              }}
                              className="inline-flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-xl text-amber-950 font-black text-[11px] transition shadow-xs cursor-pointer"
                              title="عرض تفاصيل الفاتورة"
                            >
                              <Receipt className="w-3.5 h-3.5 text-amber-600" />
                              <span>#{log.invoiceNumber}</span>
                            </button>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile & Small Tablet Card Layout (Shown on < md) */}
            <div className="md:hidden space-y-2.5">
              {displayedLogs.map((log) => (
                <div
                  key={log.id}
                  onClick={() => setSelectedLogDetail(log)}
                  className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200 space-y-2.5 transition active:scale-[0.99] cursor-pointer hover:border-amber-400"
                >
                  {/* Top Bar: User & Time */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-800 border border-slate-200 flex items-center justify-center font-black text-xs shrink-0">
                        {log.userName.slice(0, 1)}
                      </div>
                      <div>
                        <div className="font-black text-xs text-slate-900">{log.userName}</div>
                        <div className="text-[10px] text-slate-500">{log.branchName}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      {getRoleBadge(log.userRole)}
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{log.formattedTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Title & Icon */}
                  <div className="flex items-start gap-2">
                    <div className="p-1.5 rounded-lg bg-slate-100 shrink-0 mt-0.5">
                      {getActionIcon(log.action)}
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-black text-xs text-slate-950 leading-snug">{log.actionTitle}</span>
                        {log.invoiceNumber && (
                          <span className="bg-amber-100 text-amber-950 border border-amber-300 text-[10px] px-1.5 py-0.5 rounded font-black">
                            #{log.invoiceNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">{log.details}</p>
                    </div>
                  </div>

                  {/* Footer Tag */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-50 text-[10px]">
                    <span className="text-slate-400">نوع الحركة: {log.action}</span>
                    <span className="text-amber-600 font-bold flex items-center gap-0.5">
                      <span>عرض التفاصيل</span>
                      <Eye className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination & Progressive Loading Controller */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              
              {/* Left: Info & Per-Page Selector */}
              <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 w-full sm:w-auto text-xs">
                <div className="text-slate-600 font-bold flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                  <span className="text-slate-400 font-normal">عرض الحركات:</span>
                  <strong className="text-slate-900">
                    {itemsPerPage === 'all'
                      ? `كافة السجلات (${filteredLogs.length})`
                      : `${Math.min(filteredLogs.length, (currentPage - 1) * itemsPerPage + 1)} - ${Math.min(filteredLogs.length, currentPage * itemsPerPage)} من أصل ${filteredLogs.length}`}
                  </strong>
                </div>

                {/* Per page dropdown */}
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">عدد السجلات بالصفحة:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                      setItemsPerPage(val);
                    }}
                    className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value={15}>15 حركة (سريع)</option>
                    <option value={30}>30 حركة</option>
                    <option value={50}>50 حركة</option>
                    <option value={100}>100 حركة</option>
                    <option value="all">عرض الكل ({filteredLogs.length})</option>
                  </select>
                </div>
              </div>

              {/* Right: Page Navigation Buttons */}
              {itemsPerPage !== 'all' && totalPages > 1 && (
                <div className="flex items-center gap-1 sm:gap-1.5">
                  
                  {/* First page */}
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(1)}
                    className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                    title="الصفحة الأولى"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>

                  {/* Previous page */}
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer flex items-center gap-1"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span>السابق</span>
                  </button>

                  {/* Page numbers (smart window) */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .reduce<(number | string)[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                          acc.push('...');
                        }
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, idx) => {
                        if (item === '...') {
                          return (
                            <span key={`dots-${idx}`} className="px-1.5 text-slate-400 text-xs font-black">
                              ...
                            </span>
                          );
                        }
                        const pageNum = item as number;
                        const isActive = pageNum === currentPage;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-8 h-8 rounded-xl text-xs font-black transition cursor-pointer ${
                              isActive
                                ? 'bg-amber-500 text-slate-950 shadow-sm'
                                : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                  </div>

                  {/* Next page */}
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer flex items-center gap-1"
                  >
                    <span>التالي</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Last page */}
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                    title="الصفحة الأخيرة"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Log Detail Inspector Modal */}
      {selectedLogDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  {getActionIcon(selectedLogDetail.action)}
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">{selectedLogDetail.actionTitle}</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{selectedLogDetail.formattedTime}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedLogDetail(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">المستخدم المنفذ:</span>
                  <span className="font-black text-slate-900">{selectedLogDetail.userName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">الصلاحية / الدور:</span>
                  <span>{getRoleBadge(selectedLogDetail.userRole)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">الفرع المسجل:</span>
                  <span className="font-bold text-slate-800">{selectedLogDetail.branchName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">التوقيت بالثانية:</span>
                  <span className="font-mono font-bold text-slate-900">{selectedLogDetail.formattedTime}</span>
                </div>
              </div>

              <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200 space-y-1">
                <span className="text-amber-900 font-black block">البيان والتفاصيل الكاملة:</span>
                <p className="text-slate-700 leading-relaxed">{selectedLogDetail.details}</p>
              </div>

              {selectedLogDetail.invoiceNumber && (
                <div className="p-3 bg-slate-900 text-white rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-amber-400" />
                    <span className="font-bold">رقم الفاتورة: #{selectedLogDetail.invoiceNumber}</span>
                  </div>
                  {onViewInvoice && selectedLogDetail.invoiceId && (
                    <button
                      onClick={() => {
                        const invId = selectedLogDetail.invoiceId!;
                        setSelectedLogDetail(null);
                        onViewInvoice(invId);
                      }}
                      className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-3 py-1.5 rounded-xl text-xs transition cursor-pointer"
                    >
                      فتح الفاتورة 📄
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-black py-2.5 rounded-xl text-xs transition cursor-pointer"
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
