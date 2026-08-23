import {
  AlertCircle,
  ArrowUpDown,
  Building,
  CheckCircle2,
  Clock,
  Download,
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
  User,
  UserCheck,
  Users,
  XCircle
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
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

  // Stats calculation
  const stats = useMemo(() => {
    const total = auditLogs.length;
    const invoiceActions = auditLogs.filter(
      (l) =>
        l.action === 'create_invoice' ||
        l.action === 'approve_invoice' ||
        l.action === 'cancel_invoice' ||
        l.action === 'return_invoice' ||
        l.action === 'update_invoice_status'
    ).length;
    const stockActions = auditLogs.filter(
      (l) => l.action === 'stock_adjustment' || l.action === 'import_products'
    ).length;
    const loginActions = auditLogs.filter(
      (l) => l.action === 'user_login' || l.action === 'create_user' || l.action === 'update_user'
    ).length;

    return { total, invoiceActions, stockActions, loginActions };
  }, [auditLogs]);

  // Filtered & Sorted logs
  const filteredLogs = useMemo(() => {
    return auditLogs
      .filter((log) => {
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

        // Action filter
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
  }, [auditLogs, searchTerm, selectedActionFilter, selectedBranchFilter, selectedRoleFilter, sortOrder]);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['التوقيت', 'المستخدم', 'الدور', 'الفرع', 'نوع العملية', 'العنوان', 'التفاصيل', 'رقم الفاتورة'];
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
    link.setAttribute('download', `Audit_Logs_Dream_${new Date().toISOString().slice(0, 10)}.csv`);
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
        return 'bg-amber-100 text-amber-800 border-amber-300';
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
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-rose-50 text-rose-700 border border-rose-200">مدير عام</span>;
      case 'branch_manager':
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-purple-50 text-purple-700 border border-purple-200">مدير فرع</span>;
      case 'supervisor':
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">مشرف</span>;
      case 'sales_rep':
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">مندوب</span>;
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-4 sm:p-6 rounded-2xl shadow-xl border border-slate-700/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-lg">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  سجل العمليات والرقابة الفورية
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 font-bold">
                    Audit Log
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-300">
                  تتبع لحظي دقيق لجميع حركات المناديب والمشرفين (فواتير، اعتمادات، إلغاءات، استرجاع وتعديلات مخزنية)
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 hover:text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              title="تصدير السجل إلى ملف Excel / CSV"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>تصدير Excel/CSV</span>
            </button>

            {currentUser?.role === 'admin' && (
              <button
                onClick={() => {
                  if (window.confirm('هل أنت متأكد من مسح جميع سجلات العمليات؟ لا يمكن التراجع عن هذا الإجراء.')) {
                    clearAuditLogs();
                  }
                }}
                className="flex items-center gap-1.5 bg-rose-900/40 hover:bg-rose-800/60 border border-rose-700/60 text-rose-200 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                title="مسح السجل (للأدمن فقط)"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>مسح السجل</span>
              </button>
            )}
          </div>
        </div>

        {/* Responsive Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5 mt-5 pt-4 border-t border-slate-700/60 text-slate-200">
          <div className="bg-slate-800/80 backdrop-blur p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <History className="w-3.5 h-3.5 text-amber-400" />
              <span>إجمالي الحركات</span>
            </div>
            <div className="text-lg sm:text-xl font-black text-amber-300 mt-1">{stats.total}</div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              <span>حركات الفواتير والبيع</span>
            </div>
            <div className="text-lg sm:text-xl font-black text-emerald-300 mt-1">{stats.invoiceActions}</div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>حركات المخزون والإكسل</span>
            </div>
            <div className="text-lg sm:text-xl font-black text-indigo-300 mt-1">{stats.stockActions}</div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur p-3 rounded-xl border border-slate-700">
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-sky-400" />
              <span>تسجيل الدخول والمستخدمين</span>
            </div>
            <div className="text-lg sm:text-xl font-black text-sky-300 mt-1">{stats.loginActions}</div>
          </div>
        </div>
      </div>

      {/* Responsive Filter & Search Controls */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Box */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث باسم المندوب، رقم الفاتورة، الفرع، أو التفاصيل..."
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
            />
          </div>

          {/* Action Filter */}
          <div>
            <select
              value={selectedActionFilter}
              onChange={(e) => setSelectedActionFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-700"
            >
              <option value="all">كل أنواع العمليات (الكل)</option>
              <option value="create_invoice">إنشاء فواتير جديدة</option>
              <option value="approve_invoice">اعتماد وصرف فواتير</option>
              <option value="cancel_invoice">إلغاء ورفض طلبيات</option>
              <option value="return_invoice">مرتجعات مبيعات</option>
              <option value="update_invoice_status">تعديل حالة فاتورة</option>
              <option value="stock_adjustment">تعديلات جردية ومخزنية</option>
              <option value="import_products">استيراد شيت إكسل</option>
              <option value="user_login">تسجيل دخول</option>
              <option value="create_user">تسجيل مستخدمين</option>
              <option value="update_user">اعتماد وتحديث مستخدم</option>
            </select>
          </div>

          {/* Branch Filter */}
          <div>
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-700"
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
              className="flex-1 py-2 px-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-700"
            >
              <option value="all">كل الأدوار</option>
              <option value="sales_rep">المناديب</option>
              <option value="supervisor">المشرفين</option>
              <option value="branch_manager">مديري الفروع</option>
              <option value="admin">المدير العام</option>
            </select>

            <button
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1 transition cursor-pointer"
              title="ترتيب زمني"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === 'desc' ? 'الأحدث' : 'الأقدم'}</span>
            </button>
          </div>
        </div>

        {/* Active Filters summary pills */}
        {(searchTerm || selectedActionFilter !== 'all' || selectedBranchFilter !== 'all' || selectedRoleFilter !== 'all') && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>التصفيات النشطة:</span>
            {searchTerm && (
              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-semibold">
                بحث: "{searchTerm}"
              </span>
            )}
            {selectedActionFilter !== 'all' && (
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md font-semibold">
                العملية: {selectedActionFilter}
              </span>
            )}
            {selectedBranchFilter !== 'all' && (
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-semibold">
                الفرع: {selectedBranchFilter}
              </span>
            )}
            {selectedRoleFilter !== 'all' && (
              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-semibold">
                الدور: {selectedRoleFilter}
              </span>
            )}
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedActionFilter('all');
                setSelectedBranchFilter('all');
                setSelectedRoleFilter('all');
              }}
              className="text-rose-600 hover:underline font-bold mr-auto cursor-pointer"
            >
              إعادة ضبط الفلاتر
            </button>
          </div>
        )}
      </div>

      {/* Main Logs Content: Responsive Dual View (Cards for mobile, Table for laptop/desktop) */}
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
            <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 w-40">التوقيت والتاريخ</th>
                      <th className="py-3 px-4 w-48">المستخدم والدور</th>
                      <th className="py-3 px-4 w-44">الفرع</th>
                      <th className="py-3 px-4">نوع الحركة والبيان</th>
                      <th className="py-3 px-4 w-32 text-center">الفاتورة / الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition group">
                        {/* Timestamp */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{log.formattedTime}</span>
                          </div>
                        </td>

                        {/* User & Role */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                              {log.userName.slice(0, 1)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 leading-tight">{log.userName}</div>
                              <div className="mt-0.5">{getRoleBadge(log.userRole)}</div>
                            </div>
                          </div>
                        </td>

                        {/* Branch */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[150px] font-medium" title={log.branchName}>
                              {log.branchName}
                            </span>
                          </div>
                        </td>

                        {/* Action Details */}
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="p-1 rounded-md bg-slate-100 shrink-0">
                                {getActionIcon(log.action)}
                              </span>
                              <span className="font-bold text-slate-900">{log.actionTitle}</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${getBadgeStyle(
                                  log.badgeType || 'info'
                                )}`}
                              >
                                {log.action}
                              </span>
                            </div>
                            <p className="text-slate-600 text-[11px] leading-relaxed pr-6">{log.details}</p>
                          </div>
                        </td>

                        {/* Invoice Link */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {log.invoiceNumber ? (
                            <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-amber-900 font-bold text-[11px]">
                              <Receipt className="w-3.5 h-3.5 text-amber-600" />
                              <span>#{log.invoiceNumber}</span>
                            </div>
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
            <div className="md:hidden space-y-3">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200 space-y-2.5 transition active:scale-[0.99]"
                >
                  {/* Top Bar: User & Time */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs shrink-0">
                        {log.userName.slice(0, 1)}
                      </div>
                      <div>
                        <div className="font-black text-xs text-slate-900">{log.userName}</div>
                        <div className="text-[10px] text-slate-500">{log.branchName}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      {getRoleBadge(log.userRole)}
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3" />
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
                        <span className="font-black text-xs text-slate-900 leading-snug">{log.actionTitle}</span>
                        {log.invoiceNumber && (
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] px-1.5 py-0.5 rounded font-bold">
                            #{log.invoiceNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">{log.details}</p>
                    </div>
                  </div>

                  {/* Footer Tag */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-[10px]">
                    <span className="text-slate-400">نوع الحركة:</span>
                    <span className={`px-2 py-0.5 rounded-full font-bold border ${getBadgeStyle(log.badgeType || 'info')}`}>
                      {log.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
