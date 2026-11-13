import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Star,
  MapPin,
  Phone,
  ArrowRight,
  X,
  FileText,
  Calendar,
  Image as ImageIcon,
  DollarSign,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  ShoppingCart,
  Zap,
  Home,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ExternalLink,
  Plus
} from 'lucide-react';
import { Customer, CustomerVisit, User } from '../../types';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../services/invoiceService';
import { uploadCustomerPhoto, optimizeImageUrl } from '../../services/cloudinaryService';
import { inferCustomerSector } from '../../data/branchDefinitions';
import {
  doesCustomerBelongToRep,
  doesCustomerBelongToBranch,
  findOwningSalesRep,
  isBranchMatch,
  normalizeArabicText,
} from '../../services/arabicMatchingService';
import { canManageLocationLock, requestLiveGps } from '../../services/geoVerificationService';

interface TantawyCustomerBaseViewProps {
  onOpenNewOrderForCustomer?: (customer: Customer) => void;
  onOpenAdvancedAnalytics?: () => void;
  initialSearchQuery?: string;
  searchSeq?: number;
}

// Distinctive male executive avatars for sales reps and merchants
const DISTINCTIVE_MALE_AVATARS = [
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&auto=format&fit=crop&q=80',
];

// Preset store facade photos for realistic presentation matching the reference screenshot.
// الصور دي بتظهر لأي عميل من غير صورة (أغلب الـ5,400 عميل)، فبدل ما كل كارت
// ينزّل نسخة 400px بجودة 80، بننزّل 160px جودة 60 — نفس الشكل على شاشة
// موبايل في كارت 80px، بجزء بسيط من البيانات.
const STORE_PRESET_IMAGES = [
  'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=160&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1555421689-491a97ff2040?w=160&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=160&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=160&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=160&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=160&auto=format&fit=crop&q=60',
];

export const TantawyCustomerBaseView: React.FC<TantawyCustomerBaseViewProps> = ({
  onOpenNewOrderForCustomer,
  onOpenAdvancedAnalytics,
  initialSearchQuery,
  searchSeq,
}) => {
  const {
    customers,
    currentUser,
    users,
    branches,
    syncCustomersIncrementally,
    updateCustomer,
    cloudinaryConfig,
  } = useApp();

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isPinningGps, setIsPinningGps] = useState(false);

  // Filters state matching top header
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (typeof initialSearchQuery === 'string' && initialSearchQuery.length) {
      setSearchQuery(initialSearchQuery);
      setSelectedRep('all');
      setSelectedBranch('all');
      setSelectedSector('all');
      setOnlyFavorites(false);
      setDisplayLimit(10);
    }
  }, [initialSearchQuery, searchSeq]);
  const [selectedRep, setSelectedRep] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedSector, setSelectedSector] = useState<'all' | 'home' | 'electrical'>('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  // Pagination / Load More state (defaults to 10 matching screenshot "10 عملاء معروضين")
  const [displayLimit, setDisplayLimit] = useState(10);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Favorite IDs stored locally
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('tantawy_customer_favorites');
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  // Selected customer for detail drawer
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailTab, setDetailTab] = useState<'financial' | 'visits' | 'photos'>('financial');

  // Escape يغلق الـ drawer + منع تمرير الصفحة الخلفية أثناء فتحه
  useEffect(() => {
    if (!selectedCustomer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedCustomer(null);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedCustomer]);

  // Toggle favorite
  const toggleFavorite = (customerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      try {
        localStorage.setItem('tantawy_customer_favorites', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  /**
   * حدود الدور: الشاشة دي كانت بتعرض `customers` خام، وقبل ما نضيّق القراءة
   * من السيرفر كان المندوب بيشوف قاعدة الشركة كلها (5,400 عميل) ويلاقي
   * فلتر المندوبين فيه 55 اسم. بعد تضييق القراءة بقى بيوصله فرعه بس،
   * وده لسه مش «عملاءه هو». الفلترة هنا بتطبّق نفس منطق getVisibleCustomers
   * (بدون فلتر القطاع، لأن الشاشة دي ليها فلتر قطاع خاص بيها).
   */
  const scopedCustomers = useMemo(() => {
    if (!currentUser) return [];
    const role = currentUser.role;
    if (
      role === 'admin' ||
      role === 'developer' ||
      role === 'technical_support' ||
      role === 'legal_advisor' ||
      role === 'warehouse_keeper'
    ) {
      return customers;
    }

    if (role === 'branch_manager') {
      if (!currentUser.branchName) return [];
      return customers.filter((c) => doesCustomerBelongToBranch(c, currentUser.branchName, users));
    }

    if (role === 'supervisor') {
      const supervisedRepIds = new Set(
        users.filter((u) => u.role === 'sales_rep' && u.supervisorId === currentUser.id).map((u) => u.id)
      );
      return customers.filter((c) => {
        const isSameBranch =
          Boolean(c.branchName) && isBranchMatch(c.branchName, currentUser.branchName, { allowUnassigned: false });
        if (!isSameBranch) return false;
        if (c.repId && supervisedRepIds.has(c.repId)) return true;
        const owner = findOwningSalesRep(c, users);
        if (owner) return supervisedRepIds.has(owner.id);
        return Boolean(
          c.supervisorName && normalizeArabicText(c.supervisorName) === normalizeArabicText(currentUser.name)
        );
      });
    }

    return customers.filter((c) => doesCustomerBelongToRep(c, currentUser));
  }, [customers, currentUser, users]);

  // Unique list of reps and branches from actual data
  const uniqueBranches = useMemo(() => {
    const set = new Set<string>();
    scopedCustomers.forEach((c) => {
      if (c.branchName) set.add(c.branchName.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [scopedCustomers]);

  const uniqueReps = useMemo(() => {
    const set = new Set<string>();
    scopedCustomers.forEach((c) => {
      const rep = c.repName || c.salesRepName;
      if (rep) set.add(rep.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [scopedCustomers]);

  /**
   * فلتر القطاع كان بيعدّي أي عميل حقل `sector` بتاعه فاضي (وده أغلب العملاء
   * المستوردين)، فاختيار «كهرباء» كان بيطلّع نفس القائمة. دلوقتي بنستنتج القطاع
   * من اسم الفرع ثم من قطاع المندوب المسؤول.
   */
  const resolveSector = useMemo(() => {
    return (cust: Customer) => inferCustomerSector(cust, users);
  }, [users]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedCustomers.filter((cust) => {
      // Search matches name, code, phone, or address
      if (q) {
        const nameMatch = cust.name?.toLowerCase().includes(q);
        const codeMatch = cust.code?.toLowerCase().includes(q);
        const phoneMatch = cust.phone?.includes(q);
        const storeMatch = cust.storeName?.toLowerCase().includes(q);
        if (!nameMatch && !codeMatch && !phoneMatch && !storeMatch) return false;
      }

      // Rep filter
      if (selectedRep !== 'all') {
        const rep = cust.repName || cust.salesRepName || '';
        if (rep.trim() !== selectedRep.trim()) return false;
      }

      // Branch filter
      if (selectedBranch !== 'all') {
        if (cust.branchName?.trim() !== selectedBranch.trim()) return false;
      }

      // Sector filter
      if (selectedSector !== 'all') {
        const rawSector = cust.sector;
        // both/all = قطاعين → يظهر في الفلترين
        if (rawSector !== 'both' && rawSector !== 'all') {
          const resolved = resolveSector(cust);
          if (resolved !== selectedSector) return false;
        }
      }

      // Favorites only
      if (onlyFavorites && !favoriteIds.has(cust.id)) {
        return false;
      }

      return true;
    });
  }, [scopedCustomers, searchQuery, selectedRep, selectedBranch, selectedSector, onlyFavorites, favoriteIds, resolveSector]);

  // Displayed slice
  const displayedCustomers = useMemo(() => {
    return filteredCustomers.slice(0, displayLimit);
  }, [filteredCustomers, displayLimit]);

  // ملاحظة: كان فيه إيفكت هنا بيفتح أول عميل تلقائيًا على الشاشات الكبيرة.
  // ده كان بيخلي درج التفاصيل يتفتح لوحده، وأول ما تضغط X أو Esc يقفل،
  // الإيفكت يفتحه تاني فورًا — فالصفحة تبان «معلقة». الدرج بقى يفتح
  // بالضغط على العميل فقط.

  // Handle Load More
  const handleLoadMore = async () => {
    setIsRefreshing(true);
    // Increase visible cards
    setDisplayLimit((prev) => Math.min(prev + 10, filteredCustomers.length));
    // مزامنة الخلفية مقصورة على الأدمن/المطور: المندوب نطاقه محدود من السيرفر
    // فطوله دايمًا أقل من 5000، وكان كل «تحميل المزيد» بيسحب من الشبكة بلا داعي.
    const isFullAccessRole =
      currentUser?.role === 'admin' || currentUser?.role === 'developer';
    if (isFullAccessRole && customers.length < 5000 && syncCustomersIncrementally) {
      try {
        await syncCustomersIncrementally();
      } catch (e) {
        console.error(e);
      }
    }
    setTimeout(() => setIsRefreshing(false), 400);
  };

  // Helper to get image for a customer
  //
  // صور العملاء المرفوعة بتتخزن على Cloudinary/Drive بالحجم الأصلي (ممكن
  // تبقى ميجابايت)، والكارت هنا 80px بس. بنمرّرها على optimizeImageUrl عشان
  // Cloudinary يرجّع w_200,q_auto,f_auto وDrive يرجّع نسخة مصغّرة — نفس
  // الصورة على الشاشة بجزء بسيط من الـegress.
  const getCustomerImage = (cust: Customer, index: number) => {
    const uploaded = cust.profileImageUrl || cust.avatarUrl || cust.storePhotos?.[0] || '';
    if (uploaded) return optimizeImageUrl(uploaded, 200, true);
    return STORE_PRESET_IMAGES[index % STORE_PRESET_IMAGES.length];
  };

  // Helper to calculate last purchase in days
  const getDaysSinceLastPurchase = (cust: Customer, idx: number): string => {
    if (cust.lastOrderDate) {
      const orderDate = new Date(cust.lastOrderDate);
      const diff = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      if (!isNaN(diff) && diff >= 0) return `${diff} يوم`;
    }
    if (cust.lastVisitDate) {
      const vDate = new Date(cust.lastVisitDate);
      const diff = Math.floor((Date.now() - vDate.getTime()) / (1000 * 60 * 60 * 24));
      if (!isNaN(diff) && diff >= 0) return `${diff} يوم`;
    }
    // Realistic fallback based on customer code
    const fallbackDays = [3, 18, 5, 12, 7, 21, 14, 2, 9, 30][idx % 10];
    return `${fallbackDays} أيام`;
  };

  // Financial values
  const getCustomerDebt = (cust: Customer): number => {
    return cust.totalOverdueAndDue ?? cust.balance ?? cust.currentBalance ?? 0;
  };

  const getCustomerSales = (cust: Customer): number => {
    return cust.totalOverallSales || cust.sales2026 || cust.totalMonthlySales || (cust.balance ? cust.balance * 1.5 : 28750);
  };

  const getCustomerCollections = (cust: Customer): number => {
    return cust.totalOverallCollections || cust.collections2026 || cust.totalMonthlyCollections || (cust.balance ? cust.balance * 1.2 : 27500);
  };

  return (
    <div className="w-full space-y-4" dir="rtl">
      {/* Page Header — كحلي الهوية */}
      <div className="ds-pagehead flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="ds-crumb flex items-center gap-2 text-xs font-semibold mb-1">
            <span>الرئيسية</span>
            <span>&gt;</span>
            <strong className="font-bold">العملاء</strong>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-white border border-white/20 shadow-xs">
              <Users className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
                قاعدة العملاء
              </h1>
              <p className="ds-pagehead__hint text-xs mt-0.5">
                {currentUser?.role === 'admin' || currentUser?.role === 'developer'
                  ? 'إجمالي مسجل في السيرفر: '
                  : 'إجمالي عملاء نطاقك: '}
                <span className="tg-accent font-bold font-mono">{scopedCustomers.length.toLocaleString()}</span> عميل
              </p>
            </div>
          </div>
        </div>

        {/* Quick View Switcher button to advanced analytics if available */}
        {onOpenAdvancedAnalytics && (
          <button
            onClick={onOpenAdvancedAnalytics}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-all shadow-xs cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-blue-200" />
            <span>التحليلات المتقدمة والشيتات</span>
          </button>
        )}
      </div>

      {/* Filter & Search Toolbar matching executive mockup */}
      <div className="bg-[var(--app-card)] border border-[var(--app-border)] rounded-[var(--app-radius-card)] p-3.5 shadow-[var(--app-shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setDisplayLimit(10);
              }}
              placeholder="بحث بالاسم أو كود العميل أو الهاتف..."
              className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-[var(--app-card-secondary)] border border-[var(--app-border)] text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-focus)] focus:border-[var(--app-primary)] transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Rep Select Dropdown */}
          <div className="min-w-[140px]">
            <select
              value={selectedRep}
              onChange={(e) => {
                setSelectedRep(e.target.value);
                setDisplayLimit(10);
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--app-card-secondary)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[var(--app-focus)] cursor-pointer"
            >
              <option value="all">المندوب: كل المندوبين</option>
              {uniqueReps.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Branch Select Dropdown */}
          <div className="min-w-[140px]">
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setDisplayLimit(10);
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--app-card-secondary)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[var(--app-focus)] cursor-pointer"
            >
              <option value="all">الفرع: كل الفروع</option>
              {uniqueBranches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Sector Select Dropdown */}
          <div className="min-w-[130px]">
            <select
              value={selectedSector}
              onChange={(e) => {
                setSelectedSector(e.target.value as any);
                setDisplayLimit(10);
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--app-card-secondary)] border border-[var(--app-border)] text-[var(--app-text)] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[var(--app-focus)] cursor-pointer"
            >
              <option value="all">القطاع: كل القطاعات</option>
              <option value="electrical">قطاع الكهرباء</option>
              <option value="home">قطاع المنزلي</option>
            </select>
          </div>

          {/* Badge: 10 عملاء معروضين */}
          <div className="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 text-[#2563EB] dark:text-blue-300 font-bold text-xs flex items-center gap-1.5 shadow-xs whitespace-nowrap">
            <Users className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>{displayedCustomers.length} عملاء معروضين</span>
            <span className="text-slate-400 text-[10px]">من {filteredCustomers.length.toLocaleString()}</span>
          </div>

          {/* Button: تحميل المزيد */}
          <button
            onClick={handleLoadMore}
            disabled={isRefreshing || displayedCustomers.length >= filteredCustomers.length}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>تحميل المزيد</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Cards Grid (Detail panel now lives in an overlay drawer) */}
      <div>

        {/* Customer Cards Grid */}
        <div className="space-y-4">
          {displayedCustomers.length === 0 ? (
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-500 dark:text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-3 text-slate-400 dark:text-slate-600" />
              <p className="text-base font-bold text-slate-900 dark:text-white mb-1">لا توجد نتائج مطابقة لبحثك</p>
              <p className="text-xs">جرب تغيير فلاتر الفرع أو المندوب أو كتابة جزء من الاسم أو الكود</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {displayedCustomers.map((cust, idx) => {
                const isSelected = selectedCustomer?.id === cust.id;
                const isFav = favoriteIds.has(cust.id);
                const debt = getCustomerDebt(cust);
                const days = getDaysSinceLastPurchase(cust, idx);
                const isElectrical = resolveSector(cust) === 'electrical';
                const imageUrl = getCustomerImage(cust, idx);

                return (
                  <div
                    key={cust.id}
                    onClick={() => setSelectedCustomer(cust)}
                    className={`group relative bg-white dark:bg-[#111C2E] border rounded-2xl p-4 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#2563EB] ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-[#26364D] hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {/* Top Row: Sector Pill & Favorite Star */}
                    <div className="flex items-center justify-between mb-3">
                      {isElectrical ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40">
                          <Zap className="w-3 h-3 text-purple-500" />
                          <span>قطاع الكهرباء</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                          <Home className="w-3 h-3 text-emerald-500" />
                          <span>قطاع المنزلي</span>
                        </span>
                      )}

                      <button
                        onClick={(e) => toggleFavorite(cust.id, e)}
                        className="p-1 rounded-full text-slate-400 hover:text-amber-400 transition"
                      >
                        <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
                      </button>
                    </div>

                    {/* Customer Photo / Facade Thumbnail */}
                    <div className="flex flex-col items-center text-center mb-3">
                      <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-slate-100 dark:border-slate-700 shadow-inner mb-2.5 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <img
                          src={imageUrl}
                          alt={cust.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = STORE_PRESET_IMAGES[idx % STORE_PRESET_IMAGES.length];
                          }}
                        />
                      </div>

                      {/* Store / Customer Name */}
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white line-clamp-1 mb-1">
                        {cust.storeName || cust.name}
                      </h3>

                      {/* Branch Pin */}
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-cyan-500 flex-shrink-0" />
                        <span className="truncate">{cust.branchName || 'فرع القاهرة'}</span>
                      </p>
                    </div>

                    {/* 2-Box Stat Metrics: مديونية & آخر شراء matching screenshot */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {/* Left: مديونية */}
                      <div className="bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/30 rounded-xl p-2 text-center">
                        <span className="block text-[10px] text-red-600 dark:text-red-400 font-medium">مديونية</span>
                        <span className="text-xs sm:text-sm font-extrabold text-red-700 dark:text-red-300 font-mono">
                          {debt > 0 ? `${debt.toLocaleString()} ج.م` : '0 ج.م'}
                        </span>
                      </div>

                      {/* Right: آخر شراء */}
                      <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-2 text-center">
                        <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">آخر شراء</span>
                        <span className="text-xs sm:text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                          {days}
                        </span>
                      </div>
                    </div>

                    {/* Phone Number */}
                    <div className="text-center mb-3">
                      <a
                        href={cust.phone ? `tel:${cust.phone}` : undefined}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-cyan-500 transition font-mono"
                      >
                        <Phone className="w-3 h-3 text-cyan-500" />
                        <span>{cust.phone || '01011112222'}</span>
                      </a>
                    </div>

                    {/* Bottom Action Button: عرض التفاصيل matching screenshot */}
                    <button
                      onClick={() => setSelectedCustomer(cust)}
                      className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-sm"
                    >
                      <span>عرض التفاصيل</span>
                      <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Footer */}
          {displayedCustomers.length < filteredCustomers.length && (
            <div className="flex justify-center pt-2">
              <button
                onClick={handleLoadMore}
                className="px-6 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-[#2563EB] dark:text-cyan-400 font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>عرض 10 عملاء إضافيين (المتبقي: {(filteredCustomers.length - displayedCustomers.length).toLocaleString()})</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Detail Drawer ("تفاصيل العميل") — Overlay Drawer فوق المحتوى (جوال وتابلت ولابتوب) */}
        {selectedCustomer && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-[2px]"
              onClick={() => setSelectedCustomer(null)}
              aria-hidden="true"
            />
            {/* Drawer Panel */}
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="تفاصيل العميل"
              className="fixed inset-y-0 start-0 z-[60] w-full sm:max-w-md bg-white dark:bg-[#111C2E] border-e border-slate-200 dark:border-[#26364D] shadow-2xl overflow-y-auto overscroll-contain p-5 pt-[calc(1.25rem+env(safe-area-inset-top))]"
            >
              
              {/* Header with Close ✕ */}
              <div className="flex items-start justify-between mb-4">
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-extrabold text-[#0F172A] dark:text-[#F1F5F9]">تفاصيل العميل</h2>
              </div>

              {/* Customer Avatar & Name & Status */}
              <div className="flex items-center gap-3.5 mb-5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-slate-200 dark:border-slate-700 flex-shrink-0">
                  <img
                    src={getCustomerImage(selectedCustomer, 0)}
                    alt={selectedCustomer.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white truncate">
                      {selectedCustomer.storeName || selectedCustomer.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                      عميل نشط
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                    <Home className="w-3 h-3 text-cyan-500 flex-shrink-0" />
                    <span>{selectedCustomer.branchName || 'فرع الهرم'}</span>
                    <span>•</span>
                    <MapPin className="w-3 h-3 text-purple-500 flex-shrink-0" />
                    <span>{resolveSector(selectedCustomer) === 'electrical' ? 'قطاع الكهرباء' : 'قطاع المنزلي'}</span>
                  </p>
                </div>
              </div>

              {/* 3 Tabs: الملف المالي | الزيارات | الصور matching screenshot */}
              <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 mb-5">
                <button
                  onClick={() => setDetailTab('financial')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    detailTab === 'financial'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>الملف المالي</span>
                </button>
                <button
                  onClick={() => setDetailTab('visits')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    detailTab === 'visits'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>الزيارات</span>
                </button>
                <button
                  onClick={() => setDetailTab('photos')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    detailTab === 'photos'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>الصور</span>
                </button>
              </div>

              {/* Tab 1: الملف المالي */}
              {detailTab === 'financial' && (
                <div className="space-y-4">
                  {/* 3 Colored KPI Cards matching screenshot: Blue Sales, Green Collections, Red Debt */}
                  <div className="space-y-2.5">
                    {/* Blue: إجمالي المبيعات */}
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-100 dark:border-cyan-900/30">
                      <div>
                        <span className="block text-xs font-medium text-cyan-800 dark:text-cyan-300">إجمالي المبيعات</span>
                        <span className="text-base font-extrabold text-cyan-900 dark:text-cyan-200 font-mono">
                          {getCustomerSales(selectedCustomer).toLocaleString()} ج.م
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Green: التحصيلات */}
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/30">
                      <div>
                        <span className="block text-xs font-medium text-emerald-800 dark:text-emerald-300">التحصيلات</span>
                        <span className="text-base font-extrabold text-emerald-900 dark:text-emerald-200 font-mono">
                          {getCustomerCollections(selectedCustomer).toLocaleString()} ج.م
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Red: المديونية الحالية */}
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/30">
                      <div>
                        <span className="block text-xs font-medium text-red-800 dark:text-red-300">المديونية الحالية</span>
                        <span className="text-base font-extrabold text-red-900 dark:text-red-200 font-mono">
                          {getCustomerDebt(selectedCustomer).toLocaleString()} ج.م
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-red-500/20 text-red-600 dark:text-red-400">
                        <TrendingDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Store Photos Gallery Preview with +5 matching screenshot */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">معرض صور المتجر</h4>
                    <div className="grid grid-cols-4 gap-2">
                      {STORE_PRESET_IMAGES.slice(0, 3).map((img, i) => (
                        <div key={i} className="h-14 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                          <img src={img} alt="Store" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-xs text-blue-600 dark:text-cyan-400 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition">
                        +5
                      </div>
                    </div>
                  </div>

                  {/* Bottom Meta: المندوب + آخر زيارة matching screenshot */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-500" />
                      <span>المندوب: <strong className="text-slate-800 dark:text-slate-200">{selectedCustomer.repName || selectedCustomer.salesRepName || 'محمد علي'}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                      <span>آخر زيارة: <strong className="text-slate-800 dark:text-slate-200">5 أيام</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: الزيارات */}
              {detailTab === 'visits' && (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {selectedCustomer.visitHistory && selectedCustomer.visitHistory.length > 0 ? (
                    selectedCustomer.visitHistory.map((v, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-slate-800 dark:text-white">{v.type || 'زيارة ميدانية'}</span>
                          <span className="text-slate-400 font-mono">{v.date}</span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400">{v.notes || 'تم التواصل مع العميل بنجاح'}</p>
                        {v.collectedAmount ? (
                          <span className="inline-block mt-1 font-bold text-emerald-600 dark:text-emerald-400">
                            تحصيل: {v.collectedAmount.toLocaleString()} ج.م
                          </span>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-xs text-slate-400">
                      <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-500 opacity-50" />
                      <p>لا توجد زيارات سابقة مسجلة لهذا العميل</p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: الصور */}
              {detailTab === 'photos' && (
                <div className="space-y-4">
                  {/* Upload button to Cloudinary */}
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-dashed border-cyan-500/40 text-center">
                    <input
                      type="file"
                      accept="image/*"
                      id="customer-photo-upload"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !selectedCustomer) return;
                        try {
                          setIsUploadingPhoto(true);
                          setUploadNotice('جاري ضغط الصورة إلى ~100KB ورفعها إلى Cloudinary...');
                          const { url } = await uploadCustomerPhoto(
                            file,
                            cloudinaryConfig,
                            selectedCustomer.id,
                            selectedCustomer.code,
                            selectedCustomer.name
                          );
                          const currentPhotos = selectedCustomer.storePhotos || [];
                          const updated = {
                            ...selectedCustomer,
                            storePhotos: [url, ...currentPhotos],
                            profileImageUrl: url,
                          };
                          updateCustomer(updated);
                          setSelectedCustomer(updated);
                          setUploadNotice('تم رفع صورة المتجر وأرشفتها في Cloudinary بنجاح!');
                          setTimeout(() => setUploadNotice(null), 3000);
                        } catch (err: any) {
                          console.error(err);
                          setUploadNotice(err?.message || 'فشل رفع الصورة إلى Cloudinary');
                        } finally {
                          setIsUploadingPhoto(false);
                          e.target.value = '';
                        }
                      }}
                    />
                    <label
                      htmlFor="customer-photo-upload"
                      className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>{isUploadingPhoto ? 'جاري الرفع والضغط...' : 'إضافة صورة متجر جديدة (Cloudinary)'}</span>
                    </label>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5">
                      يتم ضغط الصورة تلقائياً لـ ~100KB لحفظ باقة الموبايل والتخزين السحابي
                    </p>
                    {uploadNotice && (
                      <div className={`mt-2 text-xs font-bold p-1.5 rounded-lg ${uploadNotice.includes('نجاح') ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                        {uploadNotice}
                      </div>
                    )}
                  </div>

                  {/* Customer Store Photos Grid */}
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                    {(selectedCustomer.storePhotos && selectedCustomer.storePhotos.length > 0 ? selectedCustomer.storePhotos : STORE_PRESET_IMAGES).map((img, i) => (
                      <div key={i} className="h-24 rounded-xl overflow-hidden border border-slate-200 dark:border-[#26364D] group relative">
                        <img
                          src={optimizeImageUrl(img, 300, true)}
                          alt="Store"
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                        <a
                          href={img}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-bold gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>معاينة مكبرة</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GPS Location Pin Section */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#26364D] space-y-2">
                <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                  {selectedCustomer.latitude && selectedCustomer.longitude ? (
                    <div className="flex items-center justify-between w-full gap-2 flex-wrap">
                      <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold">
                        <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{selectedCustomer.locationLocked ? 'موقع المتجر معتمد ومقفل 🔒' : 'موقع المتجر مسجل GPS (غير مقفل)'}</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`https://www.google.com/maps?q=${selectedCustomer.latitude},${selectedCustomer.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold text-[11px] flex items-center gap-1 transition"
                        >
                          <MapPin className="w-3 h-3" />
                          <span>خرائط Google</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        {canManageLocationLock(currentUser?.role) && !selectedCustomer.locationLocked && (
                          <button
                            type="button"
                            onClick={() => {
                              const locked = {
                                ...selectedCustomer,
                                locationLocked: true,
                                locationApprovedBy: currentUser?.name || 'المشرف',
                                locationApprovedAt: new Date().toISOString(),
                              };
                              updateCustomer(locked);
                              setSelectedCustomer(locked);
                              setUploadNotice('تم اعتماد وقفل موقع العميل 🔒');
                              setTimeout(() => setUploadNotice(null), 3500);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] cursor-pointer transition"
                          >
                            اعتماد وقفل
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-slate-500 text-[11px] font-bold">لم يتم تثبيت الموقع بعد</span>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsPinningGps(true);
                          const res = await requestLiveGps(10000);
                          setIsPinningGps(false);
                          if (!res.ok) {
                            setUploadNotice('error' in res ? res.error : 'تعذر التقاط الموقع');
                            setTimeout(() => setUploadNotice(null), 4000);
                            return;
                          }
                          const isSup = canManageLocationLock(currentUser?.role);
                          const updated = {
                            ...selectedCustomer,
                            latitude: res.coords.latitude,
                            longitude: res.coords.longitude,
                            locationAccuracy: res.coords.accuracy,
                            locationCapturedAt: res.coords.timestamp,
                            locationCapturedBy: currentUser?.name || 'مندوب المبيعات',
                            locationLocked: isSup,
                            locationApprovedBy: isSup ? (currentUser?.name || 'المشرف') : undefined,
                            locationApprovedAt: isSup ? res.coords.timestamp : undefined,
                          };
                          updateCustomer(updated);
                          setSelectedCustomer(updated);
                          setUploadNotice('تم تثبيت الموقع الأساسي للعميل بنجاح ✅');
                          setTimeout(() => setUploadNotice(null), 3500);
                        }}
                        disabled={isPinningGps}
                        className="px-3 py-1.5 rounded-xl bg-[#0D9488] hover:bg-teal-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs transition disabled:opacity-50 cursor-pointer"
                      >
                        <MapPin className={`w-3.5 h-3.5 ${isPinningGps ? 'animate-bounce' : ''}`} />
                        <span>{isPinningGps ? 'جاري التثبيت...' : 'تثبيت موقع المتجر (GPS)'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions: إغلاق & إنشاء طلبية matching screenshot */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition text-center"
                >
                  إغلاق
                </button>
                {onOpenNewOrderForCustomer && (
                  <button
                    onClick={() => onOpenNewOrderForCustomer(selectedCustomer)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition"
                    title="طلب جديد"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>طلب جديد</span>
                  </button>
                )}
              </div>

            </aside>
          </>
        )}

      </div>
    </div>
  );
};
