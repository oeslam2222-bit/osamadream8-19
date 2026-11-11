import React, { useCallback, useMemo, useState } from 'react';
import {
  Users,
  User,
  Phone,
  MapPin,
  CreditCard,
  Wallet,
  ShoppingCart,
  RefreshCw,
  Upload,
  Image,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  Search,
  Eye,
  Trash2,
  RefreshCcw,
} from 'lucide-react';
import { formatCurrency } from '../services/invoiceService';
import { useApp } from '../context/AppContext';
import { Customer } from '../types';
import { getCustomerBalance, getCustomerOverdue } from '../services/customerFilterPredicates';
import { getCustomerPaid } from '../services/customerTableSchema';
import { resolveBranchName, resolveSectorFromBranch, inferSectorFromText } from '../services/arabicMatchingService';
import { uploadCustomerPhoto, normalizeCloudinaryConfig } from '../services/cloudinaryService';

export interface CustomerProfileViewProps {
  onNavigateToTab?: (tab: string) => void;
  onOpenNewOrderForCustomer?: (customer: Customer) => void;
  selectedCustomer?: Customer | null;
  onClearSelectedCustomer?: () => void;
}

const SECTOR_LABEL: Record<string, { label: string; color: string; icon: string }> = {
  home: { label: 'منزلي', color: 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] border-[var(--app-navy-line)]', icon: '🏠' },
  electrical: { label: 'كهرباء', color: 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border-[var(--app-warn-line)]', icon: '⚡' },
  both: { label: 'القطاعين', color: 'bg-slate-100 text-slate-600 border border-slate-200', icon: '🔀' },
};

export const CustomerProfileView: React.FC<CustomerProfileViewProps> = ({
  onNavigateToTab,
  onOpenNewOrderForCustomer,
  selectedCustomer: initialSelectedCustomer,
  onClearSelectedCustomer,
}) => {
  const {
    currentUser,
    users,
    customers,
    visits,
    activeSectorFilter,
    setActiveSectorFilter,
    saveCustomersToSupabase,
    cloudinaryConfig,
  } = useApp();

  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(initialSelectedCustomer || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [topResults, setTopResults] = useState<Customer[]>([]);
  const [activeSection, setActiveSection] = useState<'overview' | 'visits' | 'returns' | 'orders' | 'photos'>('overview');
  const [showSearch, setShowSearch] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<{ id: string; url: string; status: 'pending' | 'approved' | 'rejected' }[]>([]);

  // قطاع المندوب الحالي (للفلترة)
  const userSector = currentUser?.sector;
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  const isRep = currentUser?.role === 'sales_rep';
  const isManager = currentUser?.role === 'branch_manager' || currentUser?.role === 'supervisor';

  // العملاء المرئية لهذا المستخدم حسب القطاع والصلاحيات
  const visibleCustomers = useMemo(() => {
    let list = customers.filter((c) => {
      const cSector = c.sector || 'home';
      if (!userSector || userSector === 'all' || userSector === 'both') return true;
      if (userSector === cSector || cSector === 'both' || cSector === 'all') return true;
      return false;
    });
    if (isRep) {
      list = list.filter((c) => c.salesRepName === currentUser?.name || c.repName === currentUser?.name || c.repId === currentUser?.id);
    } else if (isManager) {
      list = list.filter((c) => c.sector === userSector || c.sector === 'both' || !c.sector);
    }
    return list;
  }, [customers, userSector, isRep, isManager, currentUser?.id, currentUser?.name, activeSectorFilter]);

  // نتائج البحث العليا (أول 3)
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const q = searchTerm.trim().toLowerCase();
    return visibleCustomers
      .filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.code?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.storeName?.toLowerCase().includes(q)
      )
      .slice(0, 3);
  }, [searchTerm, visibleCustomers]);

  // بيانات العميل المختار
  const customer = activeCustomer;
  if (!customer) return <div className="tantawy-screen p-4 text-center text-slate-500 font-bold">اختر عميلاً من القائمة أو ابحث باسمه أو كوده</div>;

  const balance = getCustomerBalance(customer);
  const paid = getCustomerPaid(customer);
  const overdue = getCustomerOverdue(customer);
  const creditLimit = customer.creditLimit || 0;
  const isOverLimit = creditLimit > 0 && balance > creditLimit;

  const monthlySalesSum = customer.monthlySales2026
    ? Object.values(customer.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0)
    : 0;
  const totalSales2026 = Math.max(customer.sales2026 || 0, customer.totalMonthlySales || 0, customer.totalOverallSales || 0, monthlySalesSum);

  const monthlyCollectionsSum = customer.monthlyCollections2026
    ? Object.values(customer.monthlyCollections2026).reduce((acc, v) => acc + Math.abs(Number(v) || 0), 0)
    : 0;
  const totalCollections2026 = Math.max(
    customer.collections2026 || 0,
    customer.totalMonthlyCollections || 0,
    customer.totalOverallCollections || 0,
    monthlyCollectionsSum
  );

  const collectionRate = totalSales2026 > 0 ? Math.round((totalCollections2026 / totalSales2026) * 100) : 0;

  const sectorInfo = SECTOR_LABEL[customer.sector || 'home'];
  const branchName = customer.branchName || resolveBranchName(customer.branchName || undefined) || 'الفرع الرئيسي';
  const inferredSector = resolveSectorFromBranch(customer.branchName || undefined) || inferSectorFromText(customer.branchName || undefined);

  // زيارات العميل لهذا المستخدم
  const customerVisits = useMemo(() => {
    return visits.filter((v) => v.customerId === customer.id || v.customerCode === customer.code);
  }, [visits, customer]);

  // التوزيع حسب الحالة للأزرار السفلية (موبايل)
  const handleSelectCustomer = (c: Customer) => {
    setActiveCustomer(c);
    setShowSearch(false);
    setSearchTerm('');
    setTopResults([]);
  };

  const handleOpenOrder = () => {
    if (onOpenNewOrderForCustomer) onOpenNewOrderForCustomer(customer);
  };

  const handleClear = () => {
    setActiveCustomer(null);
    setShowSearch(false);
    setSearchTerm('');
    setTopResults([]);
    if (onClearSelectedCustomer) onClearSelectedCustomer();
  };

  const handleUploadPhoto = async (file: File) => {
    if (!activeCustomer) return;
    const effectiveCloudinary = normalizeCloudinaryConfig(cloudinaryConfig);
    if (!effectiveCloudinary.cloudName) {
      alert('إعدادات Cloudinary غير مفعّلة. يرجى ضبط cloudName في إعدادات النظام قبل رفع الصور.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const { url, publicId } = await uploadCustomerPhoto(file, effectiveCloudinary, activeCustomer.id);
      const updated = { ...activeCustomer, profileImageUrl: url, profileImagePublicId: publicId };
      setActiveCustomer(updated);
      const res = await saveCustomersToSupabase([updated]);
      if (!res.success) {
        alert('تم رفع الصورة على Cloudinary لكن تعذر حفظ الرابط في سجل العميل: ' + (res.error || 'خطأ غير معروف'));
      }
    } catch (err: any) {
      alert('فشل رفع الصورة: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePendingPhoto = (id: string) => {
    setPendingPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const sectionLabel: Record<string, string> = {
    overview: 'نظرة عامة',
    visits: 'الزيارات',
    returns: 'المرتجعات',
    orders: 'أوامر البيع',
    photos: 'صور المكان',
  };

  return (
    <div className="tantawy-screen space-y-4 pb-24 min-h-screen">
      {/* رأس الصفحة + البحث */}
      <div className="cust-hero rounded-2xl p-4 sm:p-5 border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3 sm:mb-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="w-9 h-9 rounded-xl border border-[var(--app-line)] bg-white/60 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-[var(--app-navy)] hover:text-white transition"
              title="返回"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h1 className="font-black text-slate-900 dark:text-white text-lg sm:text-xl tracking-tight">
                ملف العميل
                <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--app-line)] ml-2 font-bold text-[10px]">
                  {activeSectorFilter === 'all' ? 'الكل' : activeSectorFilter === 'home' ? 'منزلي' : 'كهرباء'}
                </span>
              </h1>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                بيانات العميل، المديونية، الزيارات، المرتجعات، وصور المكان
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-80">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setShowSearch(true)}
              onBlur={() => setTimeout(() => setShowSearch(false), 150)}
              placeholder="ابحث باسم العميل أو الكود أو الهاتف..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--app-line)] bg-white/80 dark:bg-slate-800/80 text-slate-900 dark:text-white text-sm font-bold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--app-navy)] transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* نتائج البحث العليا (أول 3 عملاء) */}
        {showSearch && searchResults.length > 0 && (
          <div className="mt-3 bg-white/90 dark:bg-slate-800 rounded-xl border border-[var(--app-line)] shadow-lg z-50 max-h-64 overflow-y-auto">
            {searchResults.map((c) => (
              <button
                key={c.id || c.code}
                type="button"
                onClick={() => handleSelectCustomer(c)}
                className="w-full text-right p-3 hover:bg-[var(--app-navy-tint)] dark:hover:bg-slate-700/50 transition flex items-center gap-2 border-b last:border-b-0"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--app-navy)] text-white flex items-center justify-center shrink-0 text-[10px] font-black">
                  {(c.name || 'ع').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white text-sm truncate">{c.name}</div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                    <span className="font-mono">{c.code}</span>
                    <span>·</span>
                    <span>{c.phone || 'بدون هاتف'}</span>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* إذا لم يتم اختيار عميل بعد */}
      {!customer && (
        <div className="text-center py-20 text-slate-400 font-bold">
          <Users className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <p>اختر عميلاً من نتائج البحث أعلاه لعرض بروفايله الكامل</p>
        </div>
      )}

      {/* بطاقة العميل الرئيسية */}
      {customer && (
        <>
          <div className="rounded-2xl p-4 sm:p-5 border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm mb-2">
            {/* رأس البطاقة: صورة + معلومات أساسية */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-20 h-20 rounded-2xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center font-black text-xl shadow-sm border border-[var(--app-navy-line)] overflow-hidden">
                  {customer.profileImageUrl ? (
                    <img src={customer.profileImageUrl} alt={customer.name} className="w-full h-full object-cover" />
                  ) : (
                    (customer.name || 'ع').charAt(0)
                  )}
                </div>
                {isRep && (
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleUploadPhoto(file);
                      };
                      input.click();
                    }}
                    className="absolute -bottom-1 -left-1 w-8 h-8 rounded-full bg-[var(--app-navy)] text-white flex items-center justify-center text-[10px] shadow-lg border border-white dark:border-slate-900 hover:scale-105 transition cursor-pointer"
                    title="إضافة صورة المكان"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                )}
                {pendingPhotos.length > 0 && (
                  <span className="absolute -right-1 -bottom-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--app-warn)] text-[var(--app-warn-text)] text-[10px] font-black border border-[var(--app-warn-line)] shadow-xs">
                    <Clock className="w-3 h-3" /> تحت المراجعة
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <h2 className="font-black text-slate-900 dark:text-white text-lg sm:text-xl truncate">{customer.name}</h2>
                  {customer.storeName && (
                    <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-bold ml-1">({customer.storeName})</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-[10.5px] font-bold">
                  <span className={`px-2 py-0.5 rounded border ${sectorInfo.color}`}>
                    {sectorInfo.icon} {sectorInfo.label}
                  </span>
                  <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600">
                    {customer.branchName || branchName || 'الفرع الرئيسي'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      isOverLimit
                        ? 'bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] border-[var(--app-risk-line)]'
                        : balance > 0
                        ? 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border-[var(--app-ok-line)]'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                    }`}
                  >
                    {isOverLimit ? 'متجاوز الحد' : balance > 0 ? 'له مديونية' : 'بدون مديونية'}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[var(--app-navy-text)] shrink-0" />
                    <a
                      href={`tel:${customer.phone}`}
                      className="font-mono font-bold text-slate-800 dark:text-slate-200 hover:text-[var(--app-navy)] transition"
                      dir="ltr"
                    >
                      {customer.phone || 'بدون هاتف'}
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[var(--app-navy-text)] shrink-0" />
                    <span className="text-slate-600 dark:text-slate-400">{customer.address || customer.district || 'لم يتم تحديد الموقع بعد'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[var(--app-navy-text)] shrink-0" />
                    <span className="text-slate-600 dark:text-slate-400">
                      {customer.salesRepName || customer.repName || 'غير محدد'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-end gap-2">
                <div className="text-right">
                  <div className="text-[10px] font-bold text-slate-500">الكود</div>
                  <div className="font-mono font-black text-slate-900 dark:text-white">{customer.code || '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-slate-500">النوع</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {customer.clientType || customer.dealEligibility || 'عميل'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* بطاقات المؤشرات المالية */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
            <article
              className="p-3.5 rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm ckpi ckpi-navy"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">إجمالي المبيعات 2026</span>
                <ShoppingCart className="w-4 h-4 text-[var(--app-navy-text)]" />
              </div>
              <div className="font-black text-slate-900 dark:text-white text-lg">{formatCurrency(totalSales2026)}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-bold">مبيعات السنة الحالية</div>
            </article>

            <article className="p-3.5 rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm ckpi ckpi-blue">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">إجمالي التحصيل 2026</span>
                <CreditCard className="w-4 h-4 text-[var(--app-ok-text)]" />
              </div>
              <div className="font-black text-slate-900 dark:text-white text-lg">{formatCurrency(totalCollections2026)}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-bold">تحصيل السنة الحالية</div>
            </article>

            <article className="p-3.5 rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm ckpi ckpi-green">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المديونية الحالية</span>
                <Wallet className="w-4 h-4 text-[var(--app-navy-text)]" />
              </div>
              <div className={`font-black text-lg ${balance > 0 ? 'text-[var(--app-navy)]' : 'text-slate-400'}`}>
                {formatCurrency(balance)}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-bold">
                {creditLimit > 0 ? `الحد: ${formatCurrency(creditLimit)}` : 'بدون حد ائتماني'}
              </div>
            </article>

            <article className="p-3.5 rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm ckpi ckpi-rose">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المتأخرات</span>
                <AlertCircle className="w-4 h-4 text-[var(--app-risk-text)]" />
              </div>
              <div className={`font-black text-lg ${overdue > 0 ? 'text-[var(--app-risk)]' : 'text-slate-400'}`}>
                {formatCurrency(overdue)}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-bold">نسبة التحصيل {collectionRate}%</div>
            </article>
          </div>

          {/* أشرطة الأقسام */}
          <div className="flex gap-1 overflow-x-auto pb-1 mb-2 scrollbar-hide">
            {(['overview', 'visits', 'returns', 'orders', 'photos'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSection(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition shrink-0 ${
                  activeSection === key
                    ? 'bg-[var(--app-navy)] text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {sectionLabel[key]}
              </button>
            ))}
          </div>

          {/* المحتوى حسب القسم المحدد */}
          <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5">
              {activeSection === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="col-span-1 md:col-span-3 lg:col-span-1">
                    <h3 className="text-xs font-black text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[var(--app-navy-text)]" /> آخر الأنشطة
                    </h3>
                    <div className="space-y-2">
                      {customerVisits.length > 0 ? (
                        customerVisits.slice(0, 3).map((v) => (
                          <div key={v.id} className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
                            <div className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200">
                              زيارة في {v.date || '—'}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{v.notes || 'بدون ملاحظات'}</div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-center text-slate-400 text-xs font-bold">لا توجد زيارات مسجلة</div>
                      )}
                    </div>
                  </div>

                  <div className="col-span-1 md:col-span-3 lg:col-span-2">
                    <h3 className="text-xs font-black text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[var(--app-navy-text)]" />tei ملخص الحساب
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
                        <div className="text-[10px] font-bold text-slate-500">إجمالي البيع</div>
                        <div className="font-black text-slate-900 dark:text-white">{formatCurrency(totalSales2026)}</div>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
                        <div className="text-[10px] font-bold text-slate-500">إجمالي التحصيل</div>
                        <div className="font-black text-slate-900 dark:text-white">{formatCurrency(totalCollections2026)}</div>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
                        <div className="text-[10px] font-bold text-slate-500">المتبقي على العميل</div>
                        <div className={`font-black ${overdue > 0 ? 'text-[var(--app-risk)]' : 'text-slate-400'}`}>
                          {formatCurrency(overdue)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
                        <div className="text-[10px] font-bold text-slate-500">نسبة السداد</div>
                        <div className="font-black text-slate-900 dark:text-white">{collectionRate}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'photos' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                    <Image className="w-3.5 h-3.5 text-[var(--app-navy-text)]" /> صور مكان العميل
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {customer.profileImageUrl && (
                      <div className="aspect-video rounded-xl border border-[var(--app-line)] bg-slate-100 dark:bg-slate-800 overflow-hidden relative group">
                        <img src={customer.profileImageUrl} alt={customer.name} className="w-full h-full object-cover" />
                        <span className="absolute top-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">الرئيسية</span>
                      </div>
                    )}
                    {pendingPhotos.map((p) => (
                      <div key={p.id} className="aspect-video rounded-xl border border-[var(--app-line)] bg-slate-100 dark:bg-slate-800 overflow-hidden relative flex flex-col items-center justify-center">
                        <img src={p.url} alt="pending" className="w-full h-full object-cover opacity-70" />
                        <span className="absolute top-1 right-1 bg-[var(--app-warn)] text-[var(--app-warn-text)] text-[10px] px-1.5 py-0.5 rounded font-bold">pending</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePendingPhoto(p.id)}
                          className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded hover:bg-black/80 transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {!customer.profileImageUrl && pendingPhotos.length === 0 && (
                      <div className="col-span-full h-32 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--app-line)] bg-slate-50 dark:bg-slate-800/30 text-slate-400 text-sm font-bold">
                        لا توجد صور مرفوعة بعد
                      </div>
                                                )}
                  </div>
                  {isRep && (
                    <div className="pt-2">
                      {uploadingPhoto ? (
                        <button disabled className="w-full py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-500 font-bold text-sm flex items-center justify-center gap-2 cursor-not-allowed">
                          <RefreshCw className="w-4 h-4" /> جاري الرفع...
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) handleUploadPhoto(file);
                            };
                            input.click();
                          }}
                          className="w-full py-2.5 rounded-xl border border-[var(--app-navy-line)] bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] font-black text-sm flex items-center justify-center gap-2 hover:bg-[var(--app-navy)] hover:text-white transition cursor-pointer"
                        >
                          <Upload className="w-4 h-4" /> إضافة صورة للمكان
                        </button>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1.5">الصورة تظهر تحت المراجعة حتى يعتمدها المشرف أو مدير الفرع</p>
                    </div>
                  )}
                </div>
              )}

              {activeSection === 'visits' && (
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[var(--app-navy-text)]" /> زيارات العميل
                  </h3>
                  {customerVisits.length > 0 ? (
                    customerVisits.map((v) => (
                      <div key={v.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
                        <div className="flex justify-between items-start mb-1">
                          <div className="font-bold text-slate-900 dark:text-white text-sm">{v.repName || 'المندوب'}</div>
                          <div className="text-[10px] text-slate-400">{v.date || '—'}</div>
                        </div>
                        <div className="text-[10.5px] text-slate-600 dark:text-slate-300">{v.notes || 'بدون ملاحظات'}</div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-slate-400 font-bold">لا توجد زيارات مسجلة لهذا العميل</div>
                  )}
                </div>
              )}

              {activeSection === 'returns' && (
                <div className="p-6 text-center text-slate-400 font-bold">المرتجعات الخاصة بهذا العميل (تحت الإنشاء)</div>
              )}

              {activeSection === 'orders' && (
                <div className="p-6 text-center text-slate-400 font-bold">أوامر البيع الخاصة بهذا العميل (تحت الإنشاء)</div>
              )}
            </div>
          </div>

          {/* إجراء سريع: طلبية جديدة */}
          {onOpenNewOrderForCustomer && (
            <div className="mt-3">
              <button
                type="button"
                onClick={handleOpenOrder}
                className="w-full py-3 rounded-xl bg-[var(--app-navy)] hover:bg-[var(--app-navy)] text-white font-black text-sm flex items-center justify-center gap-2 shadow-md transition active:scale-95 cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>إنشاء طلبية جديدة لهذا العميل</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* شريط سفلي للجوال (4 أقسام + المزيد) */}
      {typeof window !== 'undefined' && window.innerWidth < 768 && (
        <nav className="fixed bottom-0 left-0 right-0 h-14 border-t border-[var(--app-line)] bg-[var(--app-surface)] flex items-center justify-around px-2 z-50 shadow-lg">
          <button
            type="button"
            onClick={() => setActiveSection('overview')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition ${activeSection === 'overview' ? 'text-[var(--app-navy)]' : 'text-slate-500'}`}
          >
            <HomeIcon className={`w-5 h-5 ${activeSection === 'overview' ? 'text-[var(--app-navy)]' : 'text-slate-400'}`} />
            <span>الرئيسية</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('visits')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition ${activeSection === 'visits' ? 'text-[var(--app-navy)]' : 'text-slate-500'}`}
          >
            <Users className={`w-5 h-5 ${activeSection === 'visits' ? 'text-[var(--app-navy)]' : 'text-slate-400'}`} />
            <span>الزيارات</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('orders')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition ${activeSection === 'orders' ? 'text-[var(--app-navy)]' : 'text-slate-500'}`}
          >
            <ShoppingCart className={`w-5 h-5 ${activeSection === 'orders' ? 'text-[var(--app-navy)]' : 'text-slate-400'}`} />
            <span>الطلبات</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('photos')}
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition ${activeSection === 'photos' ? 'text-[var(--app-navy)]' : 'text-slate-500'}`}
          >
            <Image className={`w-5 h-5 ${activeSection === 'photos' ? 'text-[var(--app-navy)]' : 'text-slate-400'}`} />
            <span>الصور</span>
          </button>
        </nav>
      )}
    </div>
  );
};

// أيقونة منزلية محلية لتجنب الاعتماد على lucide إذا لم تكن مستوردة
function HomeIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}
