import React, { useEffect, useMemo, useState, useDeferredValue } from 'react';
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
  ClipboardPaste,
  Printer,
  Building2,
  UserCheck,
  Filter,
  X,
  Eye,
  FileText,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  Download,
  FileSpreadsheet,
  Check,
  TrendingUp,
  Store,
  DollarSign,
  Database,
  RefreshCw,
  Star,
  Trash2,
  ShieldCheck,
  Zap,
  ArrowUpDown,
  Copy,
  RotateCcw,
  Package,
  PackageCheck,
  Target
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { doesCustomerBelongToRep, doesCustomerBelongToBranch, doesCustomerBelongToSupervisor, isArabicNameMatch, normalizeArabicText } from '../services/arabicMatchingService';
import { isSummaryOrTotalRow, parseCleanNumber } from '../services/customerFinancialService';
import type { CustomerVisit, Customer } from '../types';
import { VisitImportModal } from './VisitImportModal';

/**
 * Mounted rows per step in the visit list. 40 keeps a full screen of content while
 * bounding the DOM; the user extends the window with "عرض المزيد" as needed.
 */
const VISIT_CHUNK_SIZE = 40;

/**
 * True / false once the viewport width is known, and null before that (or when
 * matchMedia is unavailable). Callers treat null as "build both lists", so the first
 * paint is identical to the old always-render-everything behaviour.
 */
function useIsWideViewport(): boolean | null {
  const [isWide, setIsWide] = useState<boolean | null>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(min-width: 768px)');
    const onChange = (event: MediaQueryListEvent) => setIsWide(event.matches);
    setIsWide(query.matches);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  return isWide;
}

export const VisitsDashboard: React.FC = () => {
  const {
    currentUser,
    customers,
    products,
    users,
    visibleVisits,
    addVisit,
    updateVisit,
    reviewVisit,
    deleteVisit,
    syncVisitsWithDatabase
  } = useApp();

  /**
   * The visible visit set. The provider memoizes it and only rebuilds it when the
   * scoping inputs actually change, so this is a stable array and every useMemo below
   * finally gets to do its job instead of re-running on each keystroke.
   */
  const visible = visibleVisits;

  /**
   * Customer and rep lookup tables.
   *
   * The page used `customers.find(...)` / `users.find(...)` inside filter callbacks,
   * sort comparators and the render loops, which is O(visits x customers) per
   * keystroke and again on every render. One Map per data change turns each of
   * those scans into a single hash lookup.
   */
  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const userById = useMemo(() => {
    const map = new Map<string, (typeof users)[number]>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  // Loose rep-name key -> rep, used as the fast path for the "find the rep by name"
  // fallback that legacy rows need (they carry a name and sometimes a stale id).
  // The key drops spaces as well as normalizing, so "محمد عبدالفتاح" still lands on
  // "محمد عبد الفتاح" - isArabicNameMatch's compound-name rules rely on \b, which
  // never matches inside Arabic, so they are inert there. This is only a fast path:
  // a miss still falls back to the real fuzzy scan in canReviewVisit, so review
  // rights stay exactly what they were.
  const salesRepByLooseName = useMemo(() => {
    const map = new Map<string, (typeof users)[number]>();
    users
      .filter((u) => u.role === 'sales_rep')
      .forEach((u) => {
        const key = normalizeArabicText(u.name || '').replace(/\s+/g, '');
        if (key && !map.has(key)) map.set(key, u);
      });
    return map;
  }, [users]);

  // Helper date boundaries. Declared before the filter/export state because the
  // export range initialises from them.
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const weekAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);

  // Date filters: Quick presets or Month / Exact Date
  // Today is the default view: the page opens on the working day, not on a month of
  // history, because that is what a manager checks first thing in the morning.
  const [timePreset, setTimePreset] = useState<'today' | 'week' | 'month' | 'all' | 'range'>('today');
  const [rangeFrom, setRangeFrom] = useState(todayStr);
  const [rangeTo, setRangeTo] = useState(todayStr);
  // "المجدولة اللي اتنفذت" is not a status of its own: a visit stays 'مجدولة' even after
  // check-out when the rep never re-stated it. That is exactly the gap this catches, so
  // it gets its own axis instead of being hidden inside the status list.
  const [executionFilter, setExecutionFilter] = useState<'all' | 'scheduled_pending' | 'scheduled_done'>('all');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [exactDate, setExactDate] = useState('');
  const [branch, setBranch] = useState('الكل');
  const [rep, setRep] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState<'الكل' | CustomerVisit['status']>('الكل');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'pending' | 'approved' | 'needs_fix'>('all');
  const [returnFilter, setReturnFilter] = useState<'all' | 'returns_only' | 'pending_transfer' | 'transferred_to_store' | 'received'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // Rows actually mounted in the visit list. Grown on demand, reset whenever the
  // filters change so a narrow search never opens on page 40 of a previous month.
  const [renderedVisitCount, setRenderedVisitCount] = useState(VISIT_CHUNK_SIZE);

  // Customer routing board: the visit log only shows customers that already have
  // a visit record, which makes it useless for planning tomorrow's round. These
  // controls drive a separate customer table that lists every customer the signed-in
  // role is allowed to see, ranked by debt, so a visit can be scheduled from it.
  const [customerSearch, setCustomerSearch] = useState('');
  const [routeSort, setRouteSort] = useState<'debt_desc' | 'debt_asc' | 'name' | 'today'>('debt_desc');
  const [routePage, setRoutePage] = useState(1);
  const ROUTE_PAGE_SIZE = 25;

  // Export period. Kept separate from the on-screen `timePreset` so the board can
  // stay on "today" while a manager exports last month, or a custom from/to range.
  const [exportPreset, setExportPreset] = useState<'week' | 'month' | 'custom'>('week');
  const [exportFrom, setExportFrom] = useState(weekAgoStr);
  const [exportTo, setExportTo] = useState(todayStr);

  const [returnHandoverDraft, setReturnHandoverDraft] = useState<Record<string, string>>({});
  const [isReturnsRibbonExpanded, setIsReturnsRibbonExpanded] = useState(true);

  /**
   * Typing stays responsive because the inputs keep the immediate value (so the
   * field and its caret behave normally) while the expensive filter → sort →
   * aggregate chain downstream runs against the settled value instead of against
   * every intermediate keystroke.
   */
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredCustomerSearch = useDeferredValue(customerSearch);

  // User role permissions for return handover to warehouse manager
  const isRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isBranchManager = currentUser?.role === 'branch_manager';
  const isAdmin = currentUser?.role === 'admin';
  const isDeveloper = currentUser?.role === 'developer';
  const canManageReturns = isSupervisor || isBranchManager || isAdmin || isDeveloper;

  // Modals & Active Items
  const [showForm, setShowForm] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<CustomerVisit | null>(null);
  const [reviewTarget, setReviewTarget] = useState<CustomerVisit | null>(null);
  const [reviewNoteDraft, setReviewNoteDraft] = useState('');
  // Quick customer dossier opened straight from the visits table, so the rep can
  // read the credit limit, debt and guarantee status before negotiating.
  const [dossierCustomer, setDossierCustomer] = useState<Customer | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSyncingDB, setIsSyncingDB] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Form State with Advanced Developed Field Tracking
  const [form, setForm] = useState({
    customerId: '',
    repId: currentUser?.role === 'sales_rep' ? currentUser.id : '',
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    type: 'زيارة دورية' as CustomerVisit['type'],
    status: 'منفذة' as CustomerVisit['status'],
    notes: '',
    collectedAmount: 0,
    outcome: 'تم التحصيل' as CustomerVisit['outcome'],
    orderAmount: 0,
    checkInTime: new Date().toTimeString().slice(0, 5),
    checkOutTime: '',
    durationMinutes: 15,
    storeStockStatus: 'متوفر بكثرة' as NonNullable<CustomerVisit['storeStockStatus']>,
    competitorNotes: '',
    customerRating: 5 as NonNullable<CustomerVisit['customerRating']>,
    nextVisitDate: '',
    returnValue: 0 as number | undefined,
    returnReason: '',
    returnItems: '',
    location: undefined as CustomerVisit['location'],
  });

  // Customer search state inside the scheduling modal
  const [modalCustomerSearch, setModalCustomerSearch] = useState('');
  const [returnProductQuery, setReturnProductQuery] = useState('');
  const [selectedReturnProductId, setSelectedReturnProductId] = useState('');
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [returnDetails, setReturnDetails] = useState('');
  const [isReturnProductListOpen, setIsReturnProductListOpen] = useState(false);

  const returnProductOptions = useMemo(() => {
    const query = normalizeArabicText(returnProductQuery);
    if (!query) return [];
    return products
      .filter((product) =>
        normalizeArabicText(product.name).includes(query) ||
        normalizeArabicText(product.code).includes(query)
      )
      .slice(0, 8);
  }, [products, returnProductQuery]);

  // Execution modal state (تسجيل وتوثيق ما تم في الزيارة الميدانية)
  const [executingVisit, setExecutingVisit] = useState<CustomerVisit | null>(null);
  const [executionForm, setExecutionForm] = useState<{
    outcome: CustomerVisit['outcome'];
    notes: string;
    collectedAmount: number;
    orderAmount: number;
    storeStockStatus: NonNullable<CustomerVisit['storeStockStatus']>;
    customerRating: NonNullable<CustomerVisit['customerRating']>;
    nextVisitDate: string;
    status: CustomerVisit['status'];
  }>({
    outcome: 'تم التحصيل',
    notes: '',
    collectedAmount: 0,
    orderAmount: 0,
    storeStockStatus: 'متوفر بكثرة',
    customerRating: 5,
    nextVisitDate: '',
    status: 'منفذة',
  });

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  /**
   * The Excel engine is ~860 KB. It used to be a static import, so every rep paid for
   * downloading and parsing it just to open the visits page, even though only three
   * export buttons ever touch it. It is now fetched on first export and warmed during
   * idle time after mount, which keeps the page light without breaking offline use:
   * once the page has been open a moment the chunk is cached and exports work with no
   * network. A failed load is reported instead of failing silently.
   */
  const loadXlsx = async () => {
    try {
      return await import('xlsx');
    } catch {
      showToast('error', 'تعذر تحميل محرك الإكسل. تأكد من الاتصال بالإنترنت ثم أعد المحاولة.');
      return null;
    }
  };

  useEffect(() => {
    const warm = () => {
      import('xlsx').catch(() => {});
    };
    if (typeof window === 'undefined') return;
    const idle = (window as any).requestIdleCallback;
    if (typeof idle === 'function') {
      const handle = idle(warm, { timeout: 5000 });
      return () => (window as any).cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(warm, 3000);
    return () => clearTimeout(timer);
  }, []);

  const canReviewVisit = (visit: CustomerVisit) => {
    if (!isSupervisor || visit.reviewStatus !== 'pending' || !currentUser) return false;
    const repUser =
      (visit.repId ? userById.get(visit.repId) : undefined) ||
      salesRepByLooseName.get(normalizeArabicText(visit.repName || '').replace(/\s+/g, '')) ||
      users.find((user) => user.role === 'sales_rep' && isArabicNameMatch(user.name, visit.repName || ''));
    return repUser?.role === 'sales_rep' && repUser.supervisorId === currentUser.id;
  };

  const getReviewStatusInfo = (visit: CustomerVisit) => {
    if (visit.reviewStatus === 'approved') {
      return { text: `تم الاعتماد بواسطة ${visit.reviewedByName || 'المشرف'}`, className: 'text-emerald-800 bg-emerald-50 border-emerald-200' };
    }
    if (visit.reviewStatus === 'needs_fix') {
      return { text: `مطلوب تعديل: ${visit.reviewNote || 'راجع ملاحظة المشرف'}`, className: 'text-amber-900 bg-amber-50 border-amber-200' };
    }
    if (visit.reviewStatus === 'pending') {
      return { text: 'بانتظار اعتماد المشرف', className: 'text-sky-800 bg-sky-50 border-sky-200' };
    }
    return null;
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

  // Customers accessible to current user (excluding sheet summary / total rows)
  const myCustomers = useMemo(() => {
    const cleanCustomers = customers.filter(
      (c) => !isSummaryOrTotalRow(c.name, c.code, c.branchName, c.salesRepName || c.repName)
    );
    if (currentUser?.role === 'sales_rep') {
      return cleanCustomers.filter((c) => doesCustomerBelongToRep(c, currentUser));
    }
    if (currentUser?.role === 'branch_manager') {
      return cleanCustomers.filter((c) => doesCustomerBelongToBranch(c, currentUser.branchName, users));
    }
    if (currentUser?.role === 'supervisor') {
      return cleanCustomers.filter((c) => doesCustomerBelongToSupervisor(c, currentUser, users));
    }
    return cleanCustomers;
  }, [currentUser, customers, users]);

  // Resolved export window, derived from the preset so the date inputs and the
  // filename can never disagree about which period was actually exported.
  const exportRange = useMemo(() => {
    if (exportPreset === 'week') return { from: weekAgoStr, to: todayStr };
    if (exportPreset === 'month') {
      const d = new Date();
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
      return { from, to };
    }
    const from = exportFrom || weekAgoStr;
    const to = exportTo || todayStr;
    return from <= to ? { from, to } : { from: to, to: from };
  }, [exportPreset, exportFrom, exportTo, weekAgoStr, todayStr]);

  // Which rep owns a customer, matched by id first and by name second so legacy
  // rows that only carry a name still land on the right rep.
  const repMatchesCustomer = (c: Customer, repId: string): boolean => {
    const repUser = userById.get(repId);
    const ownerId = c.repId;
    const ownerName = c.salesRepName || c.repName || '';
    if (repUser) {
      return ownerId === repUser.id || isArabicNameMatch(ownerName, repUser.name);
    }
    return false;
  };

  /**
   * Debt per customer, resolved once.
   *
   * customerDebt used to call calculateCustomerFinancials on demand, and it was
   * called from the sort comparator (twice per comparison, so ~70,000 times for a
   * 3,000-customer board), from the totals pass and again from both render lists.
   * Each of those calls walks twelve months, allocates two 12-key objects and runs
   * four Arabic normalizations - roughly 3.6M regex replaces per sort, on every
   * keystroke. The board only ever reads `balance`, which the service resolves as
   * parseCleanNumber(currentBalance ?? balance ?? 0), so that exact expression is
   * hoisted into a Map here. Same number, computed once.
   */
  const debtById = useMemo(() => {
    const map = new Map<string, number>();
    myCustomers.forEach((c) => map.set(c.id, parseCleanNumber(c.currentBalance ?? c.balance ?? 0)));
    return map;
  }, [myCustomers]);

  const debtOf = (c: Customer): number =>
    debtById.get(c.id) ?? parseCleanNumber(c.currentBalance ?? c.balance ?? 0);

  // Today's visit state per customer, so the routing board can show who is already
  // covered today and who still needs a visit without scanning the visit log.
  const todayVisitsByCustomer = useMemo(() => {
    const map = new Map<string, CustomerVisit[]>();
    visible.forEach((v) => {
      if (!v.customerId || v.date !== todayStr) return;
      const arr = map.get(v.customerId) || [];
      arr.push(v);
      map.set(v.customerId, arr);
    });
    return map;
  }, [visible, todayStr]);

  // The customer routing board: every customer this role may see, narrowed by the
  // branch/rep slicers and the name search, ranked by debt. Customers with no visit
  // record at all are included on purpose — they are the ones that need scheduling.
  const routeCustomers = useMemo(() => {
    const q = deferredCustomerSearch.trim();
    const qDigits = q.replace(/[^0-9]/g, '');

    const list = myCustomers.filter((c) => {
      if (branch !== 'الكل') {
        if (!c.branchName || c.branchName !== branch) return false;
      }
      if (rep !== 'الكل') {
        return repMatchesCustomer(c, rep);
      }
      if (!q) return true;
      const name = (c.name || '').toLowerCase();
      const code = (c.code || '').toLowerCase();
      const store = (c.storeName || '').toLowerCase();
      const address = (c.address || '').toLowerCase();
      const phone = (c.phone || '').replace(/[^0-9]/g, '');
      return (
        name.includes(q) ||
        code.includes(q) ||
        store.includes(q) ||
        address.includes(q) ||
        (qDigits.length > 0 && phone.includes(qDigits))
      );
    });

    const todayCount = (c: Customer) => todayVisitsByCustomer.get(c.id)?.length || 0;
    const todayDone = (c: Customer) =>
      (todayVisitsByCustomer.get(c.id) || []).some((v) => v.status === 'منفذة' || Boolean(v.checkOutTime));

    return [...list].sort((a, b) => {
      if (routeSort === 'debt_desc') return debtOf(b) - debtOf(a);
      if (routeSort === 'debt_asc') return debtOf(a) - debtOf(b);
      if (routeSort === 'name') return (a.name || '').localeCompare(b.name || '', 'ar');
      // today: customers with a scheduled visit today first, then the rest, and
      // within each group the biggest debt decides the running order.
      const aPending = todayCount(a) - (todayDone(a) ? 1 : 0);
      const bPending = todayCount(b) - (todayDone(b) ? 1 : 0);
      if (aPending !== bPending) return bPending - aPending;
      return debtOf(b) - debtOf(a);
    });
  }, [myCustomers, branch, rep, deferredCustomerSearch, routeSort, todayVisitsByCustomer, debtById]);

  const routeTotals = useMemo(() => {
    let debt = 0;
    let overdue = 0;
    let visitedToday = 0;
    routeCustomers.forEach((c) => {
      debt += debtOf(c);
      overdue += Number(c.totalOverdueAndDue ?? c.overdueBalance ?? 0) || 0;
      if ((todayVisitsByCustomer.get(c.id) || []).some((v) => v.status === 'منفذة' || Boolean(v.checkOutTime))) {
        visitedToday++;
      }
    });
    return { debt, overdue, visitedToday, total: routeCustomers.length };
  }, [routeCustomers, todayVisitsByCustomer, debtById]);

  const routeTotalPages = Math.max(1, Math.ceil(routeCustomers.length / ROUTE_PAGE_SIZE));
  const routePageRows = useMemo(
    () => routeCustomers.slice((routePage - 1) * ROUTE_PAGE_SIZE, routePage * ROUTE_PAGE_SIZE),
    [routeCustomers, routePage]
  );

  // A rep filter is a real scoping decision, so collapse the page when it changes
  // instead of leaving the board on an out-of-range page.
  useEffect(() => {
    setRoutePage(1);
  }, [rep, branch, customerSearch, routeSort]);

  // Same idea for the visit list window: a new result set starts at the top.
  useEffect(() => {
    setRenderedVisitCount(VISIT_CHUNK_SIZE);
  }, [timePreset, month, exactDate, rangeFrom, rangeTo, branch, rep, statusFilter, reviewFilter, executionFilter, returnFilter, deferredSearchQuery]);

  // Open the schedule form already aimed at one customer, for one rep, today.
  const scheduleVisitForCustomer = (c: Customer) => {
    setForm((prev) => ({
      ...prev,
      customerId: c.id,
      repId: c.repId || (currentUser?.role === 'sales_rep' ? currentUser.id : ''),
      date: todayStr,
      status: 'مجدولة',
    }));
    setModalCustomerSearch(c.name);
    setShowForm(true);
  };

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
    return customerById.get(form.customerId);
  }, [customers, form.customerId]);

  // Customer past visits for the schedule form
  const customerPastVisitsInForm = useMemo(() => {
    if (!form.customerId) return [];
    return visible
      .filter((v) => v.customerId === form.customerId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [form.customerId, visible]);

  // Customer past visits for the details/execution modal
  const customerPastVisitsInModal = useMemo(() => {
    const custId = selectedVisit?.customerId || executingVisit?.customerId;
    const currentVisitId = selectedVisit?.id || executingVisit?.id;
    if (!custId) return [];
    return visible
      .filter((v) => v.customerId === custId && v.id !== currentVisitId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedVisit?.customerId, selectedVisit?.id, executingVisit?.customerId, executingVisit?.id, visible]);

  // Filter visits, minus the scheduled split (that one is applied separately so the
  // pills can show both sides no matter which side is currently selected).
  const filteredBase = useMemo(() => {
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
      } else if (timePreset === 'range') {
        if (rangeFrom && v.date < rangeFrom) return false;
        if (rangeTo && v.date > rangeTo) return false;
      }

      // 2. Branch match (Only for admin/supervisors/managers; reps should not have their visits hidden)
      if (currentUser?.role !== 'sales_rep') {
        if (branch !== 'الكل' && v.branchName && v.branchName !== branch) return false;
      }

      // 3. Rep match (Only for admin/supervisors/managers; reps only have their own visits)
      if (currentUser?.role !== 'sales_rep') {
        if (rep !== 'الكل') {
          const repUser = userById.get(rep);
          const isDirectId = v.repId === rep;
          const isName = repUser && isArabicNameMatch(v.repName || '', repUser.name);
          if (!isDirectId && !isName) return false;
        }
      }

      // 4. Status match
      if (statusFilter !== 'الكل' && v.status !== statusFilter) return false;
      if (reviewFilter !== 'all' && v.reviewStatus !== reviewFilter) return false;

      // 4.5. Return Outcome and Handover Status Match
      if (returnFilter === 'returns_only' && !v.isReturn) return false;
      if (returnFilter === 'pending_transfer' && (!v.isReturn || (v.returnStatus && v.returnStatus !== 'بانتظار المشرف'))) return false;
      if (returnFilter === 'transferred_to_store' && (!v.isReturn || (v.returnStatus !== 'تم التحويل لأمين المخزن' && v.returnStatus !== 'تم الإرسال لأمين المخزن'))) return false;
      if (returnFilter === 'received' && (!v.isReturn || (v.returnStatus !== 'تم الاستلام من أمين المخزن' && v.returnStatus !== 'تم الاستلام بالمخزن'))) return false;

      // 5. Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const c = customerById.get(v.customerId);
      const customerName = (v.customerName || c?.name || '').toLowerCase();
      const customerCode = (v.customerCode || c?.code || '').toLowerCase();
      const repName = (v.repName || '').toLowerCase();
      const notes = (v.notes || '').toLowerCase();
      const outcome = (v.outcome || '').toLowerCase();
      const returnItems = (v.returnItems || '').toLowerCase();
      const returnHandledBy = (v.returnHandledBy || '').toLowerCase();

      return (
        customerName.includes(q) ||
        customerCode.includes(q) ||
        repName.includes(q) ||
        notes.includes(q) ||
        outcome.includes(q) ||
        returnItems.includes(q) ||
        returnHandledBy.includes(q)
      );
    });
  }, [visible, timePreset, month, exactDate, rangeFrom, rangeTo, branch, rep, statusFilter, reviewFilter, returnFilter, deferredSearchQuery, customerById, todayStr, weekAgoStr, currentUser?.role, userById]);

  /**
   * The scheduled split, applied after every other filter so the two pills always show
   * both counts. A 'مجدولة' visit that already has a check-out time was executed but
   * never re-stated by the rep; surfacing it is the point of the second pill.
   */
  const scheduledSplit = useMemo(() => {
    let pending = 0;
    let done = 0;
    filteredBase.forEach((v) => {
      if (v.status !== 'مجدولة') return;
      if (v.checkOutTime) done++;
      else pending++;
    });
    return { pending, done };
  }, [filteredBase]);
  const scheduledPendingCount = scheduledSplit.pending;
  const scheduledDoneCount = scheduledSplit.done;

  const filtered = useMemo(() => {
    if (executionFilter === 'all') return filteredBase;
    return filteredBase.filter((v) =>
      executionFilter === 'scheduled_pending'
        ? v.status === 'مجدولة' && !v.checkOutTime
        : v.status === 'مجدولة' && Boolean(v.checkOutTime)
    );
  }, [filteredBase, executionFilter]);


  // Return alerts and handover tracking (إشعارات المرتجعات وتحويلها لأمين/مدير المخزن)
  const returnAlerts = useMemo(() => {
    return visible.filter((v) => Boolean(v.isReturn));
  }, [visible]);

  const pendingReturns = useMemo(() => {
    return returnAlerts.filter((v) => !v.returnStatus || v.returnStatus === 'بانتظار المشرف');
  }, [returnAlerts]);

  const transferredReturns = useMemo(() => {
    return returnAlerts.filter(
      (v) => v.returnStatus === 'تم التحويل لأمين المخزن' || v.returnStatus === 'تم الإرسال لأمين المخزن'
    );
  }, [returnAlerts]);

  const receivedReturns = useMemo(() => {
    return returnAlerts.filter(
      (v) => v.returnStatus === 'تم الاستلام من أمين المخزن' || v.returnStatus === 'تم الاستلام بالمخزن'
    );
  }, [returnAlerts]);

  const pendingReturnsValue = useMemo(() => {
    return pendingReturns.reduce((sum, v) => sum + (Number(v.returnValue) || 0), 0);
  }, [pendingReturns]);

  const transferredReturnsValue = useMemo(() => {
    return transferredReturns.reduce((sum, v) => sum + (Number(v.returnValue) || 0), 0);
  }, [transferredReturns]);

  // Transfer Return to Storekeeper / Warehouse Manager handler (تحويل الزيارة والمرتجع لأمين المخزن)
  const handleTransferToStorekeeper = (visit: CustomerVisit, note?: string) => {
    const roleLabel =
      currentUser?.role === 'branch_manager' ? 'مدير الفرع' :
      currentUser?.role === 'supervisor' ? 'مشرف المندوب' :
      currentUser?.role === 'admin' ? 'الإدارة (Admin)' :
      currentUser?.role === 'developer' ? 'المطور' : 'المسؤول';

    const handoverUser = currentUser?.name || 'المشرف';
    const updatedVisit: CustomerVisit = {
      ...visit,
      returnStatus: 'تم التحويل لأمين المخزن',
      returnHandledBy: `${handoverUser} (${roleLabel})`,
      returnHandledAt: new Date().toISOString(),
      returnHandledRole: currentUser?.role,
      returnNote: (note !== undefined ? note : returnHandoverDraft[visit.id])?.trim() || visit.returnNote,
    };

    const res = updateVisit(updatedVisit);
    if (res.success) {
      showToast('success', `تم تحويل الزيارة والمرتجع بنجاح إلى مدير المخزن / أمين المخزن بواسطة ${handoverUser} 📦✅`);
      if (selectedVisit && selectedVisit.id === visit.id) {
        setSelectedVisit(updatedVisit);
      }
      setReturnHandoverDraft((prev) => {
        const next = { ...prev };
        delete next[visit.id];
        return next;
      });
    } else {
      showToast('error', res.message || 'تعذر تحديث حالة المرتجع');
    }
  };

  // Confirm receipt by storekeeper handler (تأكيد استلام المرتجع في المخزن)
  const handleConfirmStoreReceipt = (visit: CustomerVisit) => {
    const updatedVisit: CustomerVisit = {
      ...visit,
      returnStatus: 'تم الاستلام من أمين المخزن',
      returnHandledBy: `${visit.returnHandledBy || currentUser?.name || 'المخزن'} - تم الاستلام معتمد`,
      returnHandledAt: new Date().toISOString(),
    };

    const res = updateVisit(updatedVisit);
    if (res.success) {
      showToast('success', `تم اعتماد وتأكيد استلام المرتجع في المخزن بنجاح ✅`);
      if (selectedVisit && selectedVisit.id === visit.id) {
        setSelectedVisit(updatedVisit);
      }
    } else {
      showToast('error', res.message || 'تعذر تأكيد الاستلام');
    }
  };

  // Specialized Returns & Warehouse Report Export (تصدير تقرير المرتجعات والمخزن)
  const handleExportReturnsReport = async () => {
    if (returnAlerts.length === 0) {
      showToast('error', 'لا توجد مرتجعات في سجل الزيارات لتصديرها.');
      return;
    }
    const XLSX = await loadXlsx();
    if (!XLSX) return;

    const rows = returnAlerts.map((v) => {
      const c = customerById.get(v.customerId);
      return {
        'كود العميل': c?.code || v.customerCode || '---',
        'اسم العميل': v.customerName || c?.name || '---',
        'الفرع': v.branchName || c?.branchName || '---',
        'المندوب': v.repName || '---',
        'تاريخ الزيارة': v.date,
        'وقت الزيارة': v.time || '---',
        'قيمة المرتجع (ج.م)': v.returnValue || 0,
        'سبب المرتجع': v.returnReason || 'غير محدد',
        'أصناف المرتجع': v.returnItems || '---',
        'حالة تحويل المرتجع': v.returnStatus || 'بانتظار المشرف',
        'المسؤول عن التحويل للمخزن': v.returnHandledBy || 'لم يتم التحويل بعد',
        'تاريخ ووقت التحويل': v.returnHandledAt ? new Date(v.returnHandledAt).toLocaleString('ar-EG') : '---',
        'ملاحظات التحويل': v.returnNote || '---',
        'الملاحظات العامة': v.notes || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 12 },
      { wch: 25 },
      { wch: 15 },
      { wch: 20 },
      { wch: 12 },
      { wch: 10 },
      { wch: 18 },
      { wch: 20 },
      { wch: 30 },
      { wch: 22 },
      { wch: 25 },
      { wch: 22 },
      { wch: 25 },
      { wch: 30 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'تقرير مرتجعات المخزن');
    XLSX.writeFile(workbook, `تقرير_مرتجعات_الزيارات_المحولة_للمخزن_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('success', `تم تصدير تقرير المرتجعات (${rows.length} مرتجع) بنجاح للإدارة والمشرفين 📊`);
  };

  // Key KPI stats. One pass instead of five filters plus a Set allocation: the counts
  // all read the same array, so walking it once is a fifth of the work for large logs.
  const stats = useMemo(() => {
    let totalCollected = 0;
    let completed = 0;
    let scheduled = 0;
    let missed = 0;
    let cancelled = 0;
    const customersSeen = new Set<string>();
    filtered.forEach((v) => {
      if (v.collectedAmount) totalCollected += v.collectedAmount;
      if (v.status === 'منفذة') completed++;
      else if (v.status === 'مجدولة') scheduled++;
      else if (v.status === 'لم تتم') missed++;
      else if (v.status === 'ملغاة') cancelled++;
      customersSeen.add(v.customerId);
    });

    return {
      total: filtered.length,
      completed,
      scheduled,
      missed,
      cancelled,
      uniqueCustomers: customersSeen.size,
      totalCollected
    };
  }, [filtered]);

  // Daily progress for the signed-in rep. Deliberately scoped to the rep's own
  // visits for today and NOT to `filtered`, so the bar does not jump around
  // when the manager switches branch/rep/date filters above it.
  // "Planned" means a visit record exists for today. A visit is treated as done
  // when the rep actually executed it (status 'منفذة' or a check-out time),
  // not merely when it was ticked off.
  const todayProgress = useMemo(() => {
    let completed = 0;
    let scheduledOnly = 0;
    let missed = 0;
    let collected = 0;
    let orders = 0;
    let total = 0;
    visible.forEach((v) => {
      if (v.date !== todayStr) return;
      if (currentUser?.role === 'sales_rep' && v.repId !== currentUser?.id && v.repName !== currentUser?.name) return;
      total++;
      if (v.status === 'منفذة' || v.checkOutTime) completed++;
      // Deliberately NOT an else-if: a visit still marked "مجدولة" that already has a
      // check-out time is exactly the forgotten re-status this counter exists to
      // surface, so it must stay in "remaining" while also counting as completed.
      if (v.status === 'مجدولة') scheduledOnly++;
      if (v.status === 'لم تتم' || v.status === 'ملغاة') missed++;
      collected += Number(v.collectedAmount) || 0;
      if (v.orderCreatedId || v.outcome === 'تم عمل طلبية') orders++;
    });
    return {
      total,
      completed,
      remaining: scheduledOnly,
      missed,
      collected,
      orders,
      rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [visible, todayStr, currentUser?.role, currentUser?.id, currentUser?.name]);

  // Efficiency per rep over the SELECTED period (weekly / this month / custom),
  // for supervisors and branch managers. Status uses the real Arabic values
  // ('مجدولة' | 'منفذة' | 'ملغاة' | 'لم تتم').
  // "Remaining" (not yet executed) and "missed" (did not happen) are kept apart:
  // a pending visit is not a missed one until the rep closes the day.
  // Orders and collections are taken from the recorded invoice/amount rather
  // than the rep's own outcome checkbox, so the report cannot be self-reported.
  const weeklyByRep = useMemo(() => {
    const from = exportRange.from;
    const to = exportRange.to;
    const inRange = visible.filter((v) => v.date >= from && v.date <= to);

    const map = new Map<string, {
      repId: string;
      repName: string;
      branchName: string;
      scheduled: number;
      completed: number;
      pending: number;
      missed: number;
      cancelled: number;
      orders: number;
      orderValue: number;
      collectionVisits: number;
      amountCollected: number;
    }>();

    inRange.forEach((v) => {
      const key = v.repId || v.repName || 'غير محدد';
      let row = map.get(key);
      if (!row) {
        row = {
          repId: v.repId || '',
          repName: v.repName || 'غير محدد',
          branchName: v.branchName || 'غير محدد',
          scheduled: 0,
          completed: 0,
          pending: 0,
          missed: 0,
          cancelled: 0,
          orders: 0,
          orderValue: 0,
          collectionVisits: 0,
          amountCollected: 0,
        };
        map.set(key, row);
      }

      row.scheduled++;
      if (v.status === 'منفذة' || Boolean(v.checkOutTime)) row.completed++;
      else if (v.status === 'ملغاة') row.cancelled++;
      else if (v.status === 'لم تتم') row.missed++;
      else row.pending++;

      if (v.orderCreatedId || v.outcome === 'تم عمل طلبية') {
        row.orders++;
        row.orderValue += Number(v.orderAmount) || 0;
      }
      if (v.outcome === 'تم التحصيل' || Number(v.collectedAmount) > 0) {
        row.collectionVisits++;
        row.amountCollected += Number(v.collectedAmount) || 0;
      }
    });

    return Array.from(map.values())
      .map((r) => ({
        ...r,
        coverageRate: r.scheduled > 0 ? Math.round((r.completed / r.scheduled) * 100) : 0,
        orderValue: r.orderValue,
      }))
      .sort((a, b) => b.completed - a.completed || b.scheduled - a.scheduled);
  }, [visible, exportRange]);

  const weeklyTotals = useMemo(() => {
    return weeklyByRep.reduce(
      (acc, r) => ({
        scheduled: acc.scheduled + r.scheduled,
        completed: acc.completed + r.completed,
        pending: acc.pending + r.pending,
        missed: acc.missed + r.missed,
        cancelled: acc.cancelled + r.cancelled,
        orders: acc.orders + r.orders,
        orderValue: acc.orderValue + r.orderValue,
        amountCollected: acc.amountCollected + r.amountCollected,
      }),
      { scheduled: 0, completed: 0, pending: 0, missed: 0, cancelled: 0, orders: 0, orderValue: 0, amountCollected: 0 }
    );
  }, [weeklyByRep]);

  // Period report export for management: one summary sheet per rep plus a
  // detailed sheet listing every visit, built from the same weeklyByRep /
  // filtered sources as the on-screen board so the two can never disagree.
  const handleExportWeeklyReport = async () => {
    if (weeklyByRep.length === 0) {
      showToast('error', `لا توجد زيارات بين ${exportRange.from} و ${exportRange.to} لتصديرها.`);
      return;
    }
    const XLSX = await loadXlsx();
    if (!XLSX) return;
    const repKey = rep !== 'الكل' ? rep : '';
    const inRange = visible.filter((v) => v.date >= exportRange.from && v.date <= exportRange.to);

    const summaryRows = weeklyByRep
      .filter((r) => {
        if (currentUser?.role === 'sales_rep') return r.repId === currentUser.id || r.repName === currentUser.name;
        if (currentUser?.role === 'branch_manager' && currentUser.branchName) return r.branchName === currentUser.branchName;
        if (repKey) {
          const repUser = userById.get(repKey);
          return r.repId === repKey || (repUser ? isArabicNameMatch(r.repName, repUser.name) : false);
        }
        return true;
      })
      .map((r) => ({
        'اسم المندوب': r.repName,
        'الفرع': r.branchName,
        'المجدول': r.scheduled,
        'المنفذة': r.completed,
        'لم تنفذ بعد': r.pending,
        'لم تتم / ملغاة': r.missed + r.cancelled,
        'زيارات بطلبية': r.orders,
        'قيمة الطلبيات (ج.م)': r.orderValue,
        'إجمالي المحصل (ج.م)': r.amountCollected,
        'نسبة الإنجاز %': r.coverageRate,
      }));

    if (summaryRows.length === 0) {
      showToast('error', 'لا توجد بيانات مندوبين مطابقة للفلترة المحددة.');
      return;
    }

    const detailRows = inRange
      .filter((v) => {
        const row = weeklyByRep.find((r) => (r.repId || r.repName) === (v.repId || v.repName));
        if (!row) return false;
        if (currentUser?.role === 'sales_rep') return v.repId === currentUser.id || v.repName === currentUser.name;
        if (currentUser?.role === 'branch_manager' && currentUser.branchName) return v.branchName === currentUser.branchName;
        if (repKey) {
          const repUser = userById.get(repKey);
          return v.repId === repKey || (repUser ? isArabicNameMatch(v.repName || '', repUser.name) : false);
        }
        return true;
      })
      .map((v) => {
        const c = customerById.get(v.customerId);
        return {
          'تاريخ الزيارة': v.date,
          'وقت الزيارة': v.time || '-',
          'المندوب': v.repName || '-',
          'الفرع': v.branchName || c?.branchName || '-',
          'كود العميل': c?.code || v.customerCode || '-',
          'اسم العميل': c?.name || v.customerName || '-',
          'نوع الزيارة': v.type || 'زيارة دورية',
          'حالة الزيارة': v.status === 'منفذة' || v.checkOutTime ? 'تمت الزيارة' : v.status || 'مجدولة',
          'هل تم عمل طلبية؟': v.orderCreatedId || v.outcome === 'تم عمل طلبية' ? 'نعم' : 'لا',
          'قيمة الطلبية (ج.م)': Number(v.orderAmount) || 0,
          'هل تم التحصيل؟': v.outcome === 'تم التحصيل' || Number(v.collectedAmount) > 0 ? 'نعم' : 'لا',
          'المبلغ المحصل (ج.م)': Number(v.collectedAmount) || 0,
          'وقت تسجيل الحضور': v.checkInTime || '-',
          'وقت تسجيل الانصراف': v.checkOutTime || '-',
          'مدة الزيارة (دقيقة)': v.durationMinutes || 0,
          'تقييم العميل': v.customerRating ? `${v.customerRating}/5` : '-',
          'ملاحظات المندوب': v.notes || 'لا يوجد',
        };
      });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'ملخص المناديب');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), 'تفاصيل الزيارات');
    XLSX.writeFile(
      workbook,
      `تقرير_زيارات_${exportRange.from}_${exportRange.to}.xlsx`
    );
    showToast('success', `تم تصدير تقرير الفترة (${summaryRows.length} مندوب / ${detailRows.length} زيارة) للإدارة 📊`);
  };

  // Sync and Verify All Visits with Cloud Database (Supabase)
  const handleSyncDatabase = async () => {
    setIsSyncingDB(true);
    try {
      const res = await syncVisitsWithDatabase();
      if (res.success) {
        showToast('success', res.message);
      } else {
        showToast('error', res.message || 'حدث خطأ أثناء المزامنة');
      }
    } catch (e: any) {
      showToast('error', e?.message || 'تعذر الاتصال بقاعدة البيانات');
    } finally {
      setIsSyncingDB(false);
    }
  };

  // Delete Visit Handler
  const handleDeleteVisit = async (visitId: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذه الزيارة من قاعدة البيانات؟')) return;
    try {
      const res = await deleteVisit(visitId);
      if (res.success) {
        showToast('success', res.message);
        if (selectedVisit?.id === visitId) {
          setSelectedVisit(null);
        }
      } else {
        showToast('error', res.message);
      }
    } catch (e: any) {
      showToast('error', e?.message || 'تعذر حذف الزيارة');
    }
  };

  // Duplicate Visit (وارد نسخ الزيارات مع الاحتفاظ ببيانات العميل لتكرارها أو جدولتها بسرعة)
  const handleDuplicateVisit = (v: CustomerVisit) => {
    const c = customerById.get(v.customerId);
    setForm({
      customerId: v.customerId || '',
      repId: currentUser?.role === 'sales_rep' ? currentUser.id : (v.repId || currentUser?.id || ''),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().slice(0, 5),
      type: v.type || 'زيارة دورية',
      status: 'منفذة',
      notes: v.notes ? `[نسخة مكررة] ${v.notes}` : '',
      collectedAmount: v.collectedAmount || 0,
      outcome: v.outcome || 'تم التحصيل',
      orderAmount: v.orderAmount || 0,
      checkInTime: new Date().toTimeString().slice(0, 5),
      checkOutTime: '',
      durationMinutes: v.durationMinutes || 15,
      storeStockStatus: v.storeStockStatus || 'متوفر بكثرة',
      competitorNotes: v.competitorNotes || '',
      customerRating: v.customerRating || 5,
      nextVisitDate: '',
      returnValue: v.returnValue,
      returnReason: v.returnReason || '',
      returnItems: v.returnItems || '',
      location: v.location,
    });
    if (c) {
      setModalCustomerSearch(c.name);
    }
    setShowForm(true);
    showToast('success', `تم نسخ بيانات زيارة (${v.customerName || c?.name || 'العميل'}) بنجاح! يمكنك تعديل الملاحظات والتاريخ وحفظها في قاعدة البيانات.`);
  };

  // Open modal to log what was done in visit (تسجيل وتوثيق ما تم إنجازه في الزيارة)
  const handleOpenExecutionModal = (v: CustomerVisit) => {
    setExecutingVisit(v);
    setExecutionForm({
      outcome: v.outcome || 'تم التحصيل',
      notes: v.notes || '',
      collectedAmount: v.collectedAmount || 0,
      orderAmount: v.orderAmount || 0,
      storeStockStatus: v.storeStockStatus || 'متوفر بكثرة',
      customerRating: v.customerRating || 5,
      nextVisitDate: v.nextVisitDate || '',
      status: v.status === 'مجدولة' ? 'منفذة' : (v.status || 'منفذة'),
    });
  };

  // Save visit execution report (حفظ تقرير ما تم في الزيارة وتحديث حالتها بقاعدة البيانات)
  const handleSaveExecution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!executingVisit) return;

    const res = updateVisit({
      ...executingVisit,
      status: executionForm.status,
      outcome: executionForm.outcome,
      notes: executionForm.notes,
      collectedAmount: executionForm.outcome === 'تم التحصيل' ? Number(executionForm.collectedAmount) || 0 : Number(executionForm.collectedAmount) || 0,
      orderAmount: executionForm.outcome === 'تم عمل طلبية' ? Number(executionForm.orderAmount) || 0 : Number(executionForm.orderAmount) || 0,
      storeStockStatus: executionForm.storeStockStatus,
      customerRating: executionForm.customerRating,
      nextVisitDate: executionForm.nextVisitDate || undefined,
    });

    if (res.success) {
      showToast('success', 'تم توثيق وحفظ ما تم في الزيارة بنجاح وتحديث قاعدة البيانات المركزية ✅');
      if (selectedVisit && selectedVisit.id === executingVisit.id) {
        setSelectedVisit({
          ...selectedVisit,
          status: executionForm.status,
          outcome: executionForm.outcome,
          notes: executionForm.notes,
          collectedAmount: executionForm.collectedAmount,
          orderAmount: executionForm.orderAmount,
          storeStockStatus: executionForm.storeStockStatus,
          customerRating: executionForm.customerRating,
          nextVisitDate: executionForm.nextVisitDate,
        });
      }
      setExecutingVisit(null);
    } else {
      showToast('error', res.message);
    }
  };

  // Submit new visit with complete field support
  const handleSubmitVisit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) {
      showToast('error', 'يرجى اختيار العميل المستهدف أولاً.');
      return;
    }
    const r = reps.find((u) => u.id === form.repId) || userById.get(form.repId) || (currentUser?.role === 'sales_rep' ? currentUser : undefined);
    const c = customerById.get(form.customerId);

    const isReturnOutcome = form.outcome === 'مرتجع لدي العميل';
    const selectedReturnProduct = products.find((product) => product.id === selectedReturnProductId);
    if (isReturnOutcome && !selectedReturnProduct) {
      showToast('error', 'يرجى البحث عن الصنف واختياره من مخزون التطبيق.');
      return;
    }
    if (isReturnOutcome && (!Number.isInteger(returnQuantity) || returnQuantity < 1)) {
      showToast('error', 'يرجى إدخال كمية مرتجع صحيحة.');
      return;
    }

    const result = addVisit({
      ...form,
      customerId: c?.id || form.customerId,
      customerName: c?.name,
      customerCode: c?.code,
      repId: r?.id || currentUser?.id,
      repName: r?.name || currentUser?.name || 'المندوب',
      branchName: r?.branchName || c?.branchName || currentUser?.branchName || '',
      supervisorId: r?.supervisorId,
      status: form.status || 'منفذة',
      orderAmount: form.outcome === 'تم عمل طلبية' ? Number(form.orderAmount) || 0 : undefined,
      collectedAmount: form.outcome === 'تم التحصيل' ? Number(form.collectedAmount) || 0 : Number(form.collectedAmount) || 0,
      nextVisitDate: form.nextVisitDate || undefined,
      isReturn: isReturnOutcome,
      returnValue: isReturnOutcome ? 0 : undefined,
      returnReason: isReturnOutcome ? returnDetails.trim() || undefined : undefined,
      returnItems: isReturnOutcome && selectedReturnProduct
        ? `${selectedReturnProduct.code} - ${selectedReturnProduct.name} × ${returnQuantity} قطعة`
        : undefined,
      returnStatus: isReturnOutcome ? 'بانتظار المشرف' : undefined,
    });

    if (result.success) {
      setShowForm(false);
      setForm({
        customerId: '',
        repId: currentUser?.role === 'sales_rep' ? currentUser.id : '',
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toTimeString().slice(0, 5),
        type: 'زيارة دورية',
        status: 'منفذة',
        notes: '',
        collectedAmount: 0,
        outcome: 'تم التحصيل',
        orderAmount: 0,
        checkInTime: new Date().toTimeString().slice(0, 5),
        checkOutTime: '',
        durationMinutes: 15,
        storeStockStatus: 'متوفر بكثرة',
        competitorNotes: '',
        customerRating: 5,
        nextVisitDate: '',
        returnValue: 0,
        returnReason: '',
        returnItems: '',
        location: undefined,
      });
      setModalCustomerSearch('');
      setReturnProductQuery('');
      setSelectedReturnProductId('');
      setReturnQuantity(1);
      setReturnDetails('');
      setIsReturnProductListOpen(false);
      showToast('success', `${result.message} (تم الحفظ والتأكيد في قاعدة البيانات)`);
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

  const handleSubmitReview = (status: 'approved' | 'needs_fix') => {
    if (!reviewTarget) return;
    const result = reviewVisit(reviewTarget.id, status, reviewNoteDraft);
    if (result.success) {
      showToast('success', result.message);
      setReviewTarget(null);
      setReviewNoteDraft('');
      if (selectedVisit?.id === reviewTarget.id) {
        setSelectedVisit({
          ...selectedVisit,
          reviewStatus: status,
          reviewedByName: currentUser?.name,
          reviewNote: status === 'needs_fix' ? reviewNoteDraft.trim() : undefined,
          reviewedAt: new Date().toISOString(),
        });
      }
    } else {
      showToast('error', result.message);
    }
  };

  // Visits inside the export window, honouring the same role/branch/rep scope the
  // board is showing so an export can never leak rows the user cannot see.
  const exportRows = useMemo(() => {
    return filtered.filter((v) => {
      if (v.date < exportRange.from || v.date > exportRange.to) return false;
      if (rep !== 'الكل') {
        const repUser = userById.get(rep);
        if (!repUser) return false;
        if (v.repId !== rep && !isArabicNameMatch(v.repName || '', repUser.name)) return false;
      }
      return true;
    });
  }, [filtered, exportRange, rep, users]);

  // Export visits to Excel for the chosen period (weekly / this month / custom)
  /**
   * Prints exactly what the page is currently showing, filters included.
   *
   * A dedicated print root is built off-screen and printed on its own, because the global
   * print stylesheet hides the whole app except that root - reusing it here would print a
   * blank page. It renders every filtered row, not just the 40 the screen shows, so paper
   * is complete while the on-screen list stays light.
   */
  const handlePrintFiltered = () => {
    if (filtered.length === 0) {
      showToast('error', 'لا توجد زيارات مطابقة للفلترة الحالية لطباعتها.');
      return;
    }

    const scopeParts = activeFilterChips.map((c) => `${c.label} ${c.value}`);
    const esc = (value: unknown) =>
      String(value ?? '---').replace(/[&<>"]/g, (ch) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string)
      );

    const head =
      '<thead><tr>' +
      ['#', 'التاريخ', 'الوقت', 'كود العميل', 'العميل', 'الفرع', 'المندوب', 'الحالة', 'المحصل', 'ملاحظات']
        .map((h) => `<th>${esc(h)}</th>`)
      .join('') +
      '</tr></thead>';

    const body =
      '<tbody>' +
      filtered
        .map(
          (v, i) =>
            '<tr>' +
            [
              i + 1,
              v.date,
              v.time || '---',
              v.customerCode || customerById.get(v.customerId || '')?.code || '---',
              v.customerName || customerById.get(v.customerId || '')?.name || '---',
              v.branchName || '---',
              v.repName || '---',
              v.status || '---',
              v.collectedAmount ? formatCurrency(v.collectedAmount) : '---',
              v.notes || '',
            ]
              .map((cell) => `<td>${esc(cell)}</td>`)
              .join('') +
            '</tr>'
        )
        .join('') +
      '</tbody>';

    const root = document.createElement('div');
    root.id = 'visits-print-root';
    root.innerHTML =
      `<h1 style="margin:0 0 4px;font-size:15pt">تقرير زيارات العملاء</h1>` +
      `<p style="margin:0 0 2px;font-size:9pt">${esc(scopeParts.join(' | ') || 'كل الزيارات')}</p>` +
      `<p style="margin:0 0 8px;font-size:9pt">عدد الزيارات: ${filtered.length} — تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</p>` +
      `<table>${head}${body}</table>`;

    document.body.appendChild(root);
    const cleanup = () => {
      root.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    // Safari and some Android webviews do not always fire afterprint.
    window.setTimeout(cleanup, 1500);
  };

  const handleExportVisitsExcel = async () => {
    const XLSX = await loadXlsx();
    if (!XLSX) return;
    if (exportRows.length === 0) {
      showToast('error', `لا توجد زيارات بين ${exportRange.from} و ${exportRange.to} وفق الفلترة المحددة.`);
      return;
    }

    const rows = exportRows.map((v) => {
      const c = customerById.get(v.customerId);
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
    XLSX.writeFile(workbook, `تقرير_زيارات_العملاء_${exportRange.from}_${exportRange.to}.xlsx`);
    showToast(
      'success',
      `تم تصدير ${exportRows.length} زيارة للفترة من ${exportRange.from} إلى ${exportRange.to} بنجاح!`
    );
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

  /**
   * Rendered window over the filtered visit log.
   *
   * The log had no paging, so a busy month could mount every matching visit at once -
   * roughly 45-70 DOM nodes per row, and twice over because both the table and the
   * card list were built before CSS hid one of them. This grows a window instead:
   * nothing is removed and the header still reports the true total, the user simply
   * asks for more rows.
   */

  /** Every filter currently narrowing the list, as a click-to-remove chip. */
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; value: string; clear: () => void }[] = [];

    const dateLabel =
      timePreset === 'today' ? 'اليوم' :
      timePreset === 'week' ? 'آخر 7 أيام' :
      timePreset === 'month' ? 'الشهر' :
      timePreset === 'range' ? 'من/إلى' : 'كل الزيارات';
    chips.push({
      key: 'dates',
      label: 'التاريخ:',
      value: timePreset === 'range' ? `${rangeFrom} ← ${rangeTo}` : dateLabel,
      clear: () => {
        setTimePreset('today');
        setExactDate('');
      },
    });

    if (exactDate) {
      chips.push({ key: 'day', label: 'يوم محدد:', value: exactDate, clear: () => setExactDate('') });
    }
    if (branch !== 'الكل') {
      chips.push({ key: 'branch', label: 'الفرع:', value: branch, clear: () => setBranch('الكل') });
    }
    if (rep !== 'الكل') {
      const repName = userById.get(rep)?.name || rep;
      chips.push({ key: 'rep', label: 'المندوب:', value: repName, clear: () => setRep('الكل') });
    }
    if (statusFilter !== 'الكل') {
      chips.push({ key: 'status', label: 'الحالة:', value: statusFilter, clear: () => setStatusFilter('الكل') });
    }
    if (executionFilter !== 'all') {
      chips.push({
        key: 'execution',
        label: 'المجدولة:',
        value: executionFilter === 'scheduled_pending' ? 'لسه ما اتنفذتش' : 'اتنفذت من غير تحديث',
        clear: () => setExecutionFilter('all'),
      });
    }
    if (reviewFilter !== 'all') {
      chips.push({
        key: 'review',
        label: 'المراجعة:',
        value: reviewFilter,
        clear: () => setReviewFilter('all'),
      });
    }
    if (returnFilter !== 'all') {
      chips.push({ key: 'return', label: 'المرتجع:', value: returnFilter, clear: () => setReturnFilter('all') });
    }
    if (searchQuery.trim()) {
      chips.push({
        key: 'search',
        label: 'بحث:',
        value: searchQuery.trim(),
        clear: () => setSearchQuery(''),
      });
    }
    return chips;
  }, [timePreset, rangeFrom, rangeTo, exactDate, branch, rep, statusFilter, executionFilter, reviewFilter, returnFilter, searchQuery, userById]);

  /** Back to the default view: today, nothing narrowed. */
  const clearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('الكل');
    setReviewFilter('all');
    setReturnFilter('all');
    setBranch('الكل');
    setRep('الكل');
    setExecutionFilter('all');
    setExactDate('');
    setTimePreset('today');
  };

  const renderedVisits = useMemo(
    () => filtered.slice(0, renderedVisitCount),
    [filtered, renderedVisitCount]
  );
  const remainingVisitCount = Math.max(0, filtered.length - renderedVisits.length);

  /**
   * Which visit list to build. The table and the cards are both still in the markup
   * and still carry the same `hidden md:block` / `block md:hidden` classes, so CSS
   * keeps the final say on layout; this only avoids building the one the current
   * viewport is about to hide. `null` means the breakpoint is not known yet (or
   * matchMedia is unavailable), and both lists render exactly as before.
   */
  const isWideViewport = useIsWideViewport();

  return (
    <main className="w-full p-3.5 sm:p-6 space-y-3 sm:space-y-4 pb-20" dir="rtl">
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

      {/* Top shell: on a wide monitor the title, the export window, today's
          progress and the KPI strip used to be four separate full-width rows,
          which left most of the screen empty. They now pair up two-by-two. */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 sm:gap-4 items-start">
      {/* Header & Main Actions */}
      <div className="xl:col-span-7 bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
          {(isAdmin || isDeveloper) && (
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-xs transition cursor-pointer shadow-2xs"
              title="لصق زيارات من الواتساب أو الإكسل وتسجيلها بعد المراجعة"
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>استيراد من واتساب</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSyncDatabase}
            disabled={isSyncingDB}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-black px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-xs border border-emerald-300 transition cursor-pointer shadow-2xs disabled:opacity-50"
            title="مزامنة وتأكيد حفظ كافة الزيارات في قاعدة البيانات"
          >
            <Database className="w-4 h-4 text-emerald-600" />
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-700 ${isSyncingDB ? 'animate-spin' : ''}`} />
            <span>{isSyncingDB ? 'جاري الفحص...' : 'تأكيد قاعدة البيانات ✅'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrintFiltered}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-xs border border-slate-300 transition cursor-pointer"
            title="طباعة الزيارات حسب الفلترة الحالية"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>طباعة</span>
          </button>

          <button
            type="button"
            onClick={handleExportVisitsExcel}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-xs border border-slate-300 transition cursor-pointer"
            title="تصدير الزيارات للفترة المحددة إلى إكسل"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>تصدير إكسل ({exportRows.length})</span>
          </button>

          {(isSupervisor || isBranchManager || isAdmin || isDeveloper) && (
            <button
              type="button"
              onClick={handleExportWeeklyReport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-xs shadow-sm transition cursor-pointer"
              title="تصدير تقرير الزيارات للفترة المحددة (ملخص المناديب + تفاصيل كل زيارة) للإدارة"
            >
              <Download className="w-4 h-4" />
              <span>تقرير الفترة للإدارة</span>
            </button>
          )}

          {returnAlerts.length > 0 && (
            <button
              type="button"
              onClick={handleExportReturnsReport}
              className="bg-rose-50 hover:bg-rose-100 text-rose-800 font-black px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 text-xs border border-rose-300 transition cursor-pointer shadow-2xs"
              title="تصدير تقرير شامل لكافة المرتجعات وحالة تحويلها لمدير المخزن"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              <span>تقرير المرتجعات والمخزن ({returnAlerts.length}) 📊</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setModalCustomerSearch('');
              setShowForm(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل وتطوير زيارة جديدة</span>
          </button>
        </div>
      </div>

      {/* Export period bar — the window both Excel exports and the per-rep
          efficiency board read from, so a manager can pull last week, this month,
          or any custom from/to range without touching the on-screen log filter. */}
      <div className="xl:col-span-5 bg-slate-900 text-white rounded-2xl border border-slate-700 p-3.5 sm:p-4 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-emerald-400">فترة تصدير تقرير الزيارات (إكسل)</div>
              <div className="text-[10.5px] text-slate-300 font-mono">
                {exportRange.from} ← {exportRange.to} · {exportRows.length} زيارة مشمولة
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {([
              { v: 'week' as const, label: 'أسبوعي (آخر 7 أيام)' },
              { v: 'month' as const, label: 'شهري (هذا الشهر)' },
              { v: 'custom' as const, label: 'فترة مخصصة' },
            ]).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setExportPreset(v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                  exportPreset === v
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                {label}
              </button>
            ))}

            {exportPreset === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={exportFrom}
                  max={exportTo}
                  onChange={(e) => setExportFrom(e.target.value)}
                  className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-[11px] font-bold text-slate-100 focus:outline-none focus:border-emerald-400"
                />
                <span className="text-[11px] text-slate-400 font-bold">إلى</span>
                <input
                  type="date"
                  value={exportTo}
                  min={exportFrom}
                  onChange={(e) => setExportTo(e.target.value)}
                  className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-[11px] font-bold text-slate-100 focus:outline-none focus:border-emerald-400"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleExportVisitsExcel}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm transition cursor-pointer flex items-center gap-1.5"
              title="تصدير سجل الزيارات للفترة المحددة"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>تصدير السجل ({exportRows.length})</span>
            </button>

            {(isSupervisor || isBranchManager || isAdmin || isDeveloper) && (
              <button
                type="button"
                onClick={handleExportWeeklyReport}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-black border border-emerald-500/40 transition cursor-pointer flex items-center gap-1.5"
                title="تصدير ملخص المناديب + تفاصيل الزيارات للفترة المحددة"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ملخص المناديب</span>
              </button>
            )}
          </div>
        </div>
      </div>


      <div className="xl:col-span-5 bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-black text-slate-700 truncate">تقدم اليوم ({todayStr})</span>
          </div>
          <span className="text-[11px] font-black text-emerald-700 shrink-0">
            {todayProgress.rate}% · {todayProgress.completed} من {todayProgress.total}
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-emerald-600 transition-all duration-500"
            style={{ width: `${todayProgress.rate}%` }}
          />
        </div>
        {todayProgress.total > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10.5px] font-bold text-slate-500">
            <span className="text-emerald-700">✔️ منفذة: {todayProgress.completed}</span>
            <span className="text-blue-700">⏳ متبقية: {todayProgress.remaining}</span>
            {todayProgress.missed > 0 && <span className="text-rose-700">⚠️ لم تتم/ملغاة: {todayProgress.missed}</span>}
            <span>🧾 طلبيات: {todayProgress.orders}</span>
            <span>💰 محصل: {formatCurrency(todayProgress.collected)}</span>
          </div>
        ) : (
          <p className="text-[10.5px] font-bold text-slate-400 mt-2">لا توجد زيارات مسجلة اليوم — ابدأ بتسجيل أول زيارة.</p>
        )}
      </div>

      {/* KPI Stats Strip — three columns on wide screens so the five cards fill the
          box instead of squeezing into one thin row with gaps either side. */}
      <div className="xl:col-span-7 grid grid-cols-2 md:grid-cols-6 gap-2.5 sm:gap-4 self-start">
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 block">إجمالي الزيارات</span>
            <span className="text-xl sm:text-2xl font-black text-slate-900">{stats.total}</span>
            <span className="text-[10px] text-slate-500 font-bold block">{stats.uniqueCustomers} عميل مختلف</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setStatusFilter((current) => (current === 'منفذة' ? 'الكل' : 'منفذة'))}
          title="اضغط لعرض الزيارات المنفذة فقط"
          className={`md:col-span-2 bg-white border rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between text-right transition cursor-pointer active:scale-[0.99] ${
            statusFilter === 'منفذة' ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-emerald-300'
          }`}
        >
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
        </button>

        <button
          type="button"
          onClick={() => setExecutionFilter((current) => (current === 'scheduled_pending' ? 'all' : 'scheduled_pending'))}
          title="اضغط لعرض المجدولة التي لم تنفذ"
          className={`md:col-span-2 bg-white border rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between text-right transition cursor-pointer active:scale-[0.99] ${
            executionFilter === 'scheduled_pending' ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'
          }`}
        >
          <div>
            <span className="text-[11px] font-bold text-blue-700 block">مجدولة وقادمة</span>
            <span className="text-xl sm:text-2xl font-black text-blue-700">{stats.scheduled}</span>
            <span className="text-[10px] text-blue-600 font-bold block">
              {scheduledPendingCount} لسه ما اتنفذتش
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Clock3 className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter((current) => (current === 'لم تتم' ? 'الكل' : 'لم تتم'))}
          title="اضغط لعرض الزيارات التي لم تتم"
          className={`md:col-span-2 bg-white border rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between text-right transition cursor-pointer active:scale-[0.99] ${
            statusFilter === 'لم تتم' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200 hover:border-amber-300'
          }`}
        >
          <div>
            <span className="text-[11px] font-bold text-amber-700 block">لم تتم / ملغاة</span>
            <span className="text-xl sm:text-2xl font-black text-amber-700">{stats.missed + stats.cancelled}</span>
            <span className="text-[10px] text-amber-600 font-bold block">{stats.missed} لم تتم • {stats.cancelled} ملغاة</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        </button>

        <div className="col-span-2 md:col-span-3 bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center justify-between">
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
      </div>

      {/* Return Notifications & Storekeeper Handover Ribbon (شريط تنبيهات المرتجعات وتحويلها لأمين/مدير المخزن) */}
      {returnAlerts.length > 0 && (
        <div className="rounded-3xl border-2 border-rose-300 bg-gradient-to-br from-rose-50 via-white to-orange-50 shadow-md overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-rose-600 to-rose-700 text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-sm font-black flex items-center gap-2">
                  <span>تنبيهات مرتجعات الزيارات الميدانية</span>
                  {pendingReturns.length > 0 && (
                    <span className="bg-amber-400 text-slate-950 text-[10.5px] font-black px-2 py-0.5 rounded-full animate-pulse shadow-xs">
                      {pendingReturns.length} بانتظار التحويل للمخزن ⏳
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-rose-100 font-semibold">
                  تحويل فوري لأمين المخزن لمشرف المندوب، مدير الفرع، والإدارة لضبط تقارير حركة البضاعة
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-xl bg-white/25 text-[11px] font-black">
                بانتظار التحويل: {pendingReturns.length} ({formatCurrency(pendingReturnsValue)})
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-white/20 text-[11px] font-black">
                تم التحويل للمخزن: {transferredReturns.length} ({formatCurrency(transferredReturnsValue)})
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-white/20 text-[11px] font-black">
                تم الاستلام: {receivedReturns.length}
              </span>
              <button
                type="button"
                onClick={() => setIsReturnsRibbonExpanded(!isReturnsRibbonExpanded)}
                className="px-2.5 py-1 rounded-lg bg-black/25 hover:bg-black/35 text-white text-[11px] font-bold cursor-pointer transition shadow-2xs"
              >
                {isReturnsRibbonExpanded ? 'طي الشريط ▲' : 'عرض التفاصيل ▼'}
              </button>
            </div>
          </div>

          {isReturnsRibbonExpanded && (
            <div className="p-4 space-y-4">
              {/* Pending Returns Awaiting Storekeeper Transfer */}
              {pendingReturns.length > 0 ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-black text-rose-900 border-b border-rose-200 pb-1.5 flex-wrap gap-1">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>مرتجعات معلقة بانتظار اعتماد وتحويل المشرف أو مدير الفرع لأمين المخزن ({pendingReturns.length}):</span>
                    </span>
                    <span className="text-[11px] font-mono text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md font-black">
                      إجمالي معلق: {formatCurrency(pendingReturnsValue)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pendingReturns.map((v) => {
                      const c = customerById.get(v.customerId);
                      return (
                        <div key={v.id} className="p-3.5 bg-white rounded-2xl border-2 border-rose-200/90 shadow-xs space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                                <span>{v.customerName || c?.name || 'عميل بدون اسم'}</span>
                                <span className="font-mono text-[10px] text-slate-400">({c?.code || v.customerCode || '-'})</span>
                              </div>
                              <div className="text-[10.5px] text-slate-500 font-semibold mt-0.5">
                                المندوب: <strong className="text-slate-800">{v.repName}</strong> • {v.branchName || 'فرع غير محدد'} • {v.date}
                              </div>
                            </div>

                            <span className="px-2.5 py-1 rounded-xl bg-slate-950 text-white text-xs font-black font-mono shrink-0">
                              {formatCurrency(Number(v.returnValue) || 0)}
                            </span>
                          </div>

                          {v.returnReason && (
                            <div className="text-[11px] text-rose-900 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 font-semibold">
                              <span className="font-bold text-slate-500">سبب المرتجع: </span>
                              <span className="font-black text-rose-950">{v.returnReason}</span>
                            </div>
                          )}

                          {v.returnItems && (
                            <div className="text-[10.5px] bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                              <span className="font-bold text-slate-500 block mb-0.5">الأصناف المرتجعة:</span>
                              <pre className="font-mono text-slate-800 whitespace-pre-wrap font-bold leading-tight">
                                {v.returnItems}
                              </pre>
                            </div>
                          )}

                          {/* Action Button: Transfer to Storekeeper */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                            <input
                              type="text"
                              placeholder="ملاحظة التحويل للمخزن (اختياري)..."
                              value={returnHandoverDraft[v.id] || ''}
                              onChange={(e) => setReturnHandoverDraft((p) => ({ ...p, [v.id]: e.target.value }))}
                              className="flex-1 min-w-[140px] px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold focus:bg-white focus:outline-none focus:border-rose-400"
                            />

                            {canManageReturns ? (
                              <button
                                type="button"
                                onClick={() => handleTransferToStorekeeper(v)}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs transition cursor-pointer flex items-center gap-1.5 shrink-0"
                              >
                                <Package className="w-3.5 h-3.5" />
                                <span>تحويل لأمين المخزن 📦</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-bold">بانتظار اعتماد المشرف</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-3 text-center text-xs font-black text-emerald-800 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>لا يوجد أي مرتجعات معلقة حالياً — تم تحويل كافة المرتجعات لأمين المخزن بنجاح ✅</span>
                </div>
              )}

              {/* Transferred to Storekeeper List (Accordion) */}
              {transferredReturns.length > 0 && (
                <details className="bg-sky-50/70 rounded-2xl border border-sky-200 overflow-hidden" open>
                  <summary className="px-4 py-2.5 text-xs font-black text-sky-900 cursor-pointer select-none flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-sky-600" />
                      <span>مرتجعات تم تحويلها لمدير المخزن ({transferredReturns.length}) — بقيمة {formatCurrency(transferredReturnsValue)}</span>
                    </span>
                    <span className="text-[11px] text-sky-700 font-bold">معتمدة للإدارة والمطور</span>
                  </summary>

                  <div className="p-3 divide-y divide-sky-100 space-y-2">
                    {transferredReturns.map((v) => (
                      <div key={v.id} className="pt-2 first:pt-0 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-black text-slate-900 flex items-center gap-2">
                            <span>{v.customerName}</span>
                            <span className="font-mono text-emerald-700 font-black">{formatCurrency(v.returnValue || 0)}</span>
                            {v.returnReason && <span className="text-[10.5px] text-slate-500 font-normal">({v.returnReason})</span>}
                          </div>
                          <div className="text-[10.5px] text-sky-900 font-black mt-0.5 bg-sky-100/80 px-2 py-0.5 rounded-md inline-flex items-center gap-1 border border-sky-200">
                            <span>📦 تم تحويل الزيارة والمرتجع إلى مدير المخزن بواسطة {v.returnHandledBy || 'المشرف'}</span>
                            {v.returnHandledAt ? ` • ${new Date(v.returnHandledAt).toLocaleString('ar-EG')}` : ''}
                          </div>
                          {v.returnNote && (
                            <div className="text-[10px] text-slate-500 italic mt-0.5">
                              ملاحظة التحويل: {v.returnNote}
                            </div>
                          )}
                        </div>

                        {canManageReturns && (
                          <button
                            type="button"
                            onClick={() => handleConfirmStoreReceipt(v)}
                            className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[10.5px] font-black cursor-pointer shadow-2xs flex items-center gap-1"
                          >
                            <PackageCheck className="w-3.5 h-3.5" />
                            <span>تأكيد الاستلام بالمخزن ✅</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

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

          <div className="flex items-center gap-2 flex-wrap">
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

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setTimePreset('range');
                  setRangeFrom(todayStr);
                  setRangeTo(todayStr);
                }}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                  timePreset === 'range'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                من - إلى
              </button>
            </div>

            {timePreset === 'range' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={rangeFrom}
                  max={rangeTo || undefined}
                  onChange={(e) => {
                    setRangeFrom(e.target.value);
                    if (rangeTo && e.target.value > rangeTo) setRangeTo(e.target.value);
                  }}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[11px] text-slate-400 font-bold">←</span>
                <input
                  type="date"
                  value={rangeTo}
                  min={rangeFrom || undefined}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* Scheduled split. A visit can sit on 'مجدولة' after it already happened, so
            the two questions a manager actually asks are separated here. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-500 ml-1">المجدولة:</span>
          {([
            ['all', 'الكل'],
            ['scheduled_pending', 'لسه ما اتنفذتش'],
            ['scheduled_done', 'اتنفذت من غير تحديث'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setExecutionFilter(value)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                executionFilter === value
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {label}
              {value !== 'all' && (
                <span className="mr-1.5 font-black">
                  {value === 'scheduled_pending' ? scheduledPendingCount : scheduledDoneCount}
                </span>
              )}
            </button>
          ))}
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
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 transition cursor-pointer"
            >
              <option value="الكل">كل حالات الزيارة</option>
              <option value="مجدولة">مجدولة</option>
              <option value="منفذة">منفذة</option>
              <option value="لم تتم">لم تتم</option>
              <option value="ملغاة">ملغاة</option>
            </select>
          </div>

          {/* Return Filter (فلتر المرتجعات وتحويل المخزن) */}
          <div>
            <select
              value={returnFilter}
              onChange={(e) => setReturnFilter(e.target.value as typeof returnFilter)}
              className={`w-full px-3 py-2 border rounded-xl text-xs font-black focus:outline-none transition cursor-pointer ${
                returnFilter !== 'all'
                  ? 'bg-rose-50 border-rose-400 text-rose-900 ring-1 ring-rose-300'
                  : 'bg-slate-50 border-slate-200 text-slate-700 focus:border-rose-500'
              }`}
            >
              <option value="all">حالة المرتجعات (الكل)</option>
              <option value="returns_only">📦 زيارات بها مرتجعات فقط ({returnAlerts.length})</option>
              <option value="pending_transfer">⏳ بانتظار التحويل للمخزن ({pendingReturns.length})</option>
              <option value="transferred_to_store">🚚 تم تحويلها لمدير المخزن ({transferredReturns.length})</option>
              <option value="received">✅ تم الاستلام بالمخزن ({receivedReturns.length})</option>
            </select>
          </div>
        </div>

        {/* Active filters, as removable chips.
            This is the Power BI part: whatever narrowed the list - a date, a rep, a
            status, the scheduled split, a search - is stated as a chip you can click
            off, so there is never a hidden filter and never a need to hunt for a reset. */}
        {activeFilterChips.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-2.5 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 ml-1">مُرشَّح بـ:</span>
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                title="اضغط للإزالة"
                className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-lg text-[11px] border border-emerald-200 transition active:scale-95 cursor-pointer"
              >
                <span className="text-emerald-600">{chip.label}</span>
                {chip.value}
                <X className="w-3 h-3 text-emerald-500" />
              </button>
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer mr-1"
            >
              <X className="w-3 h-3" />
              إلغاء الكل
            </button>
          </div>
        )}
      </div>

      {/* Weekly efficiency board — supervisors, branch managers and admin */}
      {(isSupervisor || isBranchManager || isAdmin || isDeveloper) && (
        <div className="w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-black text-slate-800">تقرير كفاءة زيارات المناديب للفترة المحددة</h3>
            </div>
            <span className="text-[11px] font-bold text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded-lg">
              {exportRange.from} → {exportRange.to}
            </span>
          </div>

          {weeklyByRep.length === 0 ? (
            <p className="text-[11px] font-bold text-slate-400 py-2">لا توجد زيارات مسجلة خلال الفترة المحددة.</p>
          ) : (
            <>
              {/* Team totals */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500">المجدول</div>
                  <div className="text-base font-black font-mono text-slate-800">{weeklyTotals.scheduled}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] font-bold text-emerald-700">المنفذة</div>
                  <div className="text-base font-black font-mono text-emerald-800">{weeklyTotals.completed}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200">
                  <div className="text-[10px] font-bold text-blue-700">لم تُنفَّذ بعد</div>
                  <div className="text-base font-black font-mono text-blue-800">{weeklyTotals.pending}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="text-[10px] font-bold text-rose-700">لم تتم / ملغاة</div>
                  <div className="text-base font-black font-mono text-rose-800">{weeklyTotals.missed + weeklyTotals.cancelled}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200">
                  <div className="text-[10px] font-bold text-purple-700">زيارات بطلبية</div>
                  <div className="text-base font-black font-mono text-purple-800">
                    {weeklyTotals.orders}
                    <span className="text-[10px] font-bold mr-1">({formatCurrency(weeklyTotals.orderValue)})</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200">
                  <div className="text-[10px] font-bold text-teal-700">إجمالي المحصل</div>
                  <div className="text-base font-black font-mono text-teal-800">{formatCurrency(weeklyTotals.amountCollected)}</div>
                </div>
              </div>

              {/* Per-rep breakdown */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-[11px]">
                  <thead className="bg-slate-900 text-slate-200 font-bold">
                    <tr>
                      <th className="p-2">المندوب</th>
                      <th className="p-2">الفرع</th>
                      <th className="p-2 text-center">مجدول</th>
                      <th className="p-2 text-center">منفذة</th>
                      <th className="p-2 text-center">متبقية</th>
                      <th className="p-2 text-center">لم تتم</th>
                      <th className="p-2 text-center">طلبيات</th>
                      <th className="p-2 text-left">قيمة الطلبية</th>
                      <th className="p-2 text-left">المحصل</th>
                      <th className="p-2 text-center">نسبة الإنجاز</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {weeklyByRep.map((r) => (
                      <tr
                        key={r.repId || r.repName}
                        className={`transition cursor-pointer ${
                          rep !== 'الكل' && (r.repId === rep || isArabicNameMatch(r.repName, rep))
                            ? 'bg-emerald-50'
                            : 'hover:bg-slate-50'
                        }`}
                        onClick={() => {
                          // Click a rep to see only their visits. Clicking them again clears it.
                          const isSame = rep !== 'الكل' && (r.repId === rep || isArabicNameMatch(r.repName, rep));
                          if (isSame) {
                            setRep('الكل');
                          } else if (r.repId && userById.has(r.repId)) {
                            setRep(r.repId);
                          } else {
                            const match = users.find((u) => u.role === 'sales_rep' && isArabicNameMatch(u.name, r.repName));
                            setRep(match?.id || 'الكل');
                          }
                        }}
                        title="اضغط لعرض زيارات هذا المندوب فقط"
                      >
                        <td className="p-2 font-black text-slate-900">{r.repName}</td>
                        <td className="p-2 text-slate-500">{r.branchName}</td>
                        <td className="p-2 text-center font-mono">{r.scheduled}</td>
                        <td className="p-2 text-center font-mono text-emerald-700 font-black">{r.completed}</td>
                        <td className="p-2 text-center font-mono text-blue-700">{r.pending}</td>
                        <td className="p-2 text-center font-mono text-rose-700">{r.missed + r.cancelled}</td>
                        <td className="p-2 text-center font-mono text-purple-700 font-black">{r.orders}</td>
                        <td className="p-2 text-left font-mono">{formatCurrency(r.orderValue)}</td>
                        <td className="p-2 text-left font-mono text-teal-700 font-black">{formatCurrency(r.amountCollected)}</td>
                        <td className="p-2">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`font-black ${r.coverageRate >= 65 ? 'text-emerald-700' : r.coverageRate >= 40 ? 'text-amber-700' : 'text-rose-700'}`}>
                              {r.coverageRate}%
                            </span>
                            <div className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full ${r.coverageRate >= 65 ? 'bg-emerald-500' : r.coverageRate >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${Math.min(100, r.coverageRate)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* Customer routing board — every customer this role may see, ranked by    */}
      {/* debt, so a visit can be scheduled before it ever exists in the log.     */}
      {/* ========================================================================= */}
      <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3.5 sm:p-4 bg-gradient-to-l from-slate-900 to-slate-800 text-white border-b border-slate-700">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-black flex items-center gap-2">
                  <span>جدول عملاء {rep !== 'الكل' ? (userById.get(rep)?.name || 'المندوب') : 'النطاق'}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10.5px] font-black">
                    {routeTotals.total.toLocaleString()} عميل
                  </span>
                </div>
                <div className="text-[10.5px] text-slate-300">
                  {isRep
                    ? 'عملاءك المسندين لك فقط — رتّبهم بالمديونية وجدول الزيارة من هنا'
                    : isSupervisor
                    ? 'عملاء مناديب إشرافك — اختر مندوب أو عميل لعرض بياناته'
                    : isBranchManager
                    ? 'كافة عملاء فرعك ومناديبه — اختر مندوب أو عميل لعرض بياناته'
                    : 'كافة العملاء والمناديب — اختر مندوب أو عميل لعرض بياناته'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="px-2.5 py-1.5 bg-white/10 border border-white/10 rounded-lg text-[11px] font-black">
                مديونية: <span className="text-purple-300">{formatCurrency(routeTotals.debt)}</span>
              </div>
              <div className="px-2.5 py-1.5 bg-white/10 border border-white/10 rounded-lg text-[11px] font-black">
                مستحقات: <span className="text-rose-300">{formatCurrency(routeTotals.overdue)}</span>
              </div>
              <div className="px-2.5 py-1.5 bg-white/10 border border-white/10 rounded-lg text-[11px] font-black">
                زيارة اليوم: <span className="text-emerald-300">{routeTotals.visitedToday}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search by customer name + sort controls */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="بحث باسم العميل أو الكود أو المحل أو الهاتف..."
              className="w-full pr-9 pl-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
            />
            {customerSearch && (
              <button
                type="button"
                onClick={() => setCustomerSearch('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-black text-slate-500 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              الترتيب:
            </span>
            {([
              { v: 'debt_desc' as const, label: '🔴 الأعلى مديونية', cls: 'bg-rose-600 text-white border-rose-500' },
              { v: 'today' as const, label: '📅 زيارات اليوم', cls: 'bg-blue-600 text-white border-blue-500' },
              { v: 'debt_asc' as const, label: '🟢 الأقل مديونية', cls: 'bg-emerald-600 text-white border-emerald-500' },
              { v: 'name' as const, label: '🔤 أبجدي', cls: 'bg-slate-700 text-white border-slate-600' },
            ]).map(({ v, label, cls }) => (
              <button
                key={v}
                type="button"
                onClick={() => setRouteSort(v)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black border transition cursor-pointer whitespace-nowrap ${
                  routeSort === v ? cls : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: full-width customer table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
              <tr>
                <th className="p-3 text-center w-12">#</th>
                <th className="p-3 min-w-[220px]">العميل / المحل</th>
                {currentUser?.role !== 'sales_rep' && <th className="p-3">الفرع</th>}
                {currentUser?.role !== 'sales_rep' && <th className="p-3">المندوب</th>}
                <th className="p-3 text-left">المديونية الحالية</th>
                <th className="p-3 text-left">المستحقات</th>
                <th className="p-3 text-left">حد الائتمان</th>
                <th className="p-3 text-center">زيارة اليوم</th>
                <th className="p-3 text-center">آخر زيارة</th>
                <th className="p-3 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {routePageRows.map((c, i) => {
                const todayList = todayVisitsByCustomer.get(c.id) || [];
                const doneToday = todayList.some((v) => v.status === 'منفذة' || Boolean(v.checkOutTime));
                const debt = debtOf(c);
                const overdue = Number(c.totalOverdueAndDue ?? c.overdueBalance ?? 0) || 0;
                const limit = Number(c.creditLimit || 0) || 0;
                const ownerName = c.salesRepName || c.repName || 'غير محدد';
                return (
                  <tr key={c.id} className="hover:bg-emerald-50/40 transition">
                    <td className="p-3 text-center font-black text-slate-400">
                      {(routePage - 1) * ROUTE_PAGE_SIZE + i + 1}
                    </td>
                    <td className="p-3">
                      <div className="font-black text-slate-900">{c.name}</div>
                      <div className="text-[10.5px] text-slate-500 font-mono">
                        كود: {c.code || '---'} {c.storeName ? `• ${c.storeName}` : ''}
                      </div>
                      {c.phone && (
                        <a
                          href={`tel:${c.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10.5px] text-emerald-700 font-bold hover:underline inline-flex items-center gap-1 mt-0.5"
                        >
                          <Phone className="w-3 h-3" />
                          {c.phone}
                        </a>
                      )}
                    </td>
                    {currentUser?.role !== 'sales_rep' && (
                      <td className="p-3 text-slate-600 font-medium whitespace-nowrap">{c.branchName || 'غير محدد'}</td>
                    )}
                    {currentUser?.role !== 'sales_rep' && (
                      <td className="p-3 font-bold text-indigo-900 whitespace-nowrap">{ownerName}</td>
                    )}
                    <td className="p-3 text-left font-mono font-black whitespace-nowrap">
                      <span className={debt > 0 ? 'text-purple-900' : 'text-slate-400'}>
                        {formatCurrency(debt)}
                      </span>
                      {limit > 0 && debt > limit && (
                        <span className="block text-[9px] font-black text-rose-600 bg-rose-50 border border-rose-200 rounded px-1 py-0.5 mt-0.5 w-fit">
                          ⛔ تجاوز الحد
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-left font-mono font-black whitespace-nowrap">
                      <span className={overdue > 0 ? 'text-rose-700' : 'text-slate-400'}>
                        {formatCurrency(overdue)}
                      </span>
                    </td>
                    <td className="p-3 text-left font-mono font-bold text-slate-700 whitespace-nowrap">
                      {limit > 0 ? formatCurrency(limit) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {doneToday ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10.5px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3 h-3" />
                          تمت الزيارة
                        </span>
                      ) : todayList.length > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10.5px] font-black bg-blue-50 text-blue-800 border border-blue-200">
                          <Clock className="w-3 h-3" />
                          مجدولة ({todayList.length})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <Plus className="w-3 h-3" />
                          لم تُجدول
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center font-mono text-[10.5px] text-slate-500 whitespace-nowrap">
                      {c.lastVisitDate || 'لم تسجل'}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => scheduleVisitForCustomer(c)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black shadow-xs transition cursor-pointer flex items-center gap-1"
                          title="جدولة زيارة لهذا العميل"
                        >
                          <CalendarCheck className="w-3.5 h-3.5" />
                          <span>جدولة زيارة</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDossierCustomer(c)}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer border border-slate-200"
                          title="تفاصيل العميل والمديونية"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {routeCustomers.length > 0 && (
              <tfoot className="bg-slate-900 text-white font-black border-t-2 border-slate-800">
                <tr>
                  <td className="p-3 text-center">Σ</td>
                  <td className="p-3">إجمالي {routeTotals.total.toLocaleString()} عميل</td>
                  {currentUser?.role !== 'sales_rep' && <td className="p-3">—</td>}
                  {currentUser?.role !== 'sales_rep' && <td className="p-3">—</td>}
                  <td className="p-3 text-left font-mono text-purple-200">{formatCurrency(routeTotals.debt)}</td>
                  <td className="p-3 text-left font-mono text-rose-200">{formatCurrency(routeTotals.overdue)}</td>
                  <td className="p-3 text-left font-mono text-slate-300">—</td>
                  <td className="p-3 text-center font-mono text-emerald-300">{routeTotals.visitedToday}</td>
                  <td className="p-3 text-center">—</td>
                  <td className="p-3 text-center">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Mobile: touch cards */}
        <div className="lg:hidden divide-y divide-slate-100">
          {routePageRows.map((c) => {
            const todayList = todayVisitsByCustomer.get(c.id) || [];
            const doneToday = todayList.some((v) => v.status === 'منفذة' || Boolean(v.checkOutTime));
            const debt = debtOf(c);
            return (
              <div key={c.id} className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 text-sm">{c.name}</div>
                    <div className="text-[10.5px] text-slate-500 font-mono">كود: {c.code || '---'}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      {c.branchName} • {c.salesRepName || c.repName || 'غير محدد'}
                    </div>
                  </div>
                  {doneToday ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                      تمت اليوم ✅
                    </span>
                  ) : todayList.length > 0 ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-50 text-blue-800 border border-blue-200 shrink-0">
                      مجدولة ⏳
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500 font-bold">المديونية</div>
                    <div className="font-black font-mono text-purple-900">{formatCurrency(debt)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-rose-600 font-bold">المستحقات</div>
                    <div className="font-black font-mono text-rose-700">
                      {formatCurrency(Number(c.totalOverdueAndDue ?? c.overdueBalance ?? 0) || 0)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => scheduleVisitForCustomer(c)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-1.5 px-2 rounded-xl text-xs flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    <span>جدولة زيارة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDossierCustomer(c)}
                    className="p-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200"
                    title="تفاصيل العميل"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {routeCustomers.length === 0 && (
          <div className="py-12 px-4 text-center space-y-2">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-600">لا يوجد عملاء مطابقون للبحث أو الفلترة</p>
            <p className="text-xs text-slate-400">جرّب تغيير اسم العميل أو إلغاء فلتر المندوب</p>
          </div>
        )}

        {/* Pagination */}
        {routeTotalPages > 1 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 text-[11px] font-bold text-slate-600">
            <span>
              عرض {(routePage - 1) * ROUTE_PAGE_SIZE + 1} إلى{' '}
              {Math.min(routePage * ROUTE_PAGE_SIZE, routeCustomers.length)} من أصل{' '}
              {routeCustomers.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRoutePage((p) => Math.max(1, p - 1))}
                disabled={routePage === 1}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                السابق
              </button>
              <span className="px-3 py-1 rounded-lg bg-slate-900 text-amber-300 font-black">
                {routePage} / {routeTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setRoutePage((p) => Math.min(routeTotalPages, p + 1))}
                disabled={routePage === routeTotalPages}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                التالي
              </button>
            </div>
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

        {/* Desktop Table. Still hidden by CSS on small screens; the JSX guard just
            avoids building a table the phone is about to hide. */}
        {isWideViewport !== false && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100/70 text-slate-700 font-black border-b border-slate-200">
              <tr>
                <th className="p-3">العميل المستهدف</th>
                <th className="p-3">الفرع</th>
                <th className="p-3">المندوب المسئول</th>
                <th className="p-3">تاريخ ووقت الزيارة</th>
                <th className="p-3">نوع الغرض والنتيجة</th>
                <th className="p-3">الحالة الحالية</th>
                <th className="p-3">المحصل / الطلب</th>
                <th className="p-3">التحقق وقاعدة البيانات</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {renderedVisits.map((v) => {
                const c = customerById.get(v.customerId);

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
                      {c && (
                        <button
                          type="button"
                          onClick={(e) => {
                            // The whole row opens the visit, so the click must not
                            // bubble up or the customer card never appears.
                            e.stopPropagation();
                            setDossierCustomer(c);
                          }}
                          className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-[10.5px] font-black hover:bg-sky-100 cursor-pointer transition"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          تفاصيل العميل / المديونية
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 font-medium">{v.branchName || c?.branchName || 'عام'}</td>
                    <td className="p-3 font-bold text-slate-800">{v.repName}</td>
                    <td className="p-3 font-mono text-slate-700">
                      <div>{v.date}</div>
                      <div className="text-[10px] text-slate-400">{v.time || '09:00'}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-700">{v.type || 'زيارة دورية'}</div>
                      {v.outcome && (
                        <div className={`text-[10px] font-semibold mt-0.5 ${v.isReturn ? 'text-rose-700' : 'text-emerald-800'}`}>
                          {v.outcome}
                        </div>
                      )}
                      {v.isReturn && (
                        <div className="space-y-1 mt-1">
                          <div className="text-[11px] font-black text-rose-700 flex items-center gap-1">
                            <span>↩️ مرتجع:</span>
                            <span className="font-mono bg-rose-100 text-rose-900 px-1.5 py-0.2 rounded font-black">
                              {formatCurrency(v.returnValue || 0)}
                            </span>
                          </div>
                          {v.returnStatus === 'تم التحويل لأمين المخزن' || v.returnStatus === 'تم الإرسال لأمين المخزن' ? (
                            <div className="text-[9.5px] font-black text-sky-900 bg-sky-50 border border-sky-200 rounded-md p-1 shadow-2xs">
                              <div className="flex items-center gap-1">
                                <Package className="w-3 h-3 text-sky-600 shrink-0" />
                                <span>تم تحويلها لمدير المخزن 📦</span>
                              </div>
                              <div className="text-[8.5px] text-slate-500 font-semibold truncate mt-0.5" title={v.returnHandledBy}>
                                بواسطة: {v.returnHandledBy || 'المشرف'}
                              </div>
                            </div>
                          ) : v.returnStatus === 'تم الاستلام من أمين المخزن' || v.returnStatus === 'تم الاستلام بالمخزن' ? (
                            <div className="text-[9.5px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md p-1 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>تم الاستلام بالمخزن ✅</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[9.5px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                ⏳ بانتظار التحويل للمخزن
                              </span>
                              {canManageReturns && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTransferToStorekeeper(v);
                                  }}
                                  className="text-[9.5px] font-black bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded shadow-xs cursor-pointer whitespace-nowrap flex items-center gap-1 transition"
                                  title="تحويل الزيارة والمرتجع لأمين المخزن فوراً"
                                >
                                  <Package className="w-3 h-3" />
                                  <span>تحويل للمخزن</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-1.5">
                        {getStatusBadge(v.status)}
                        {getReviewStatusInfo(v) && (
                          <div className={`max-w-52 border rounded-md px-1.5 py-1 text-[10px] font-bold ${getReviewStatusInfo(v)?.className}`}>
                            {getReviewStatusInfo(v)?.text}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-mono">
                      {v.collectedAmount ? (
                        <div className="font-bold text-emerald-700">تحصيل: {formatCurrency(v.collectedAmount)}</div>
                      ) : null}
                      {v.orderAmount ? (
                        <div className="font-bold text-blue-700">طلب: {formatCurrency(v.orderAmount)}</div>
                      ) : null}
                      {v.isReturn ? (
                        <div className="font-bold text-rose-700">مرتجع: {formatCurrency(v.returnValue || 0)}</div>
                      ) : null}
                      {!v.collectedAmount && !v.orderAmount && !v.isReturn && (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <Database className="w-3 h-3 text-emerald-600" />
                          <span>قاعدة البيانات ✅</span>
                        </span>
                        {v.customerRating && (
                          <div className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                            <span>تقييم: {v.customerRating}/5</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Quick action buttons */}
                        {canReviewVisit(v) && (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewTarget(v);
                              setReviewNoteDraft('');
                            }}
                            className="bg-sky-700 hover:bg-sky-800 text-white font-bold px-2 py-1 rounded-lg text-[11px] transition cursor-pointer"
                            title="مراجعة تقرير المندوب"
                          >
                            مراجعة
                          </button>
                        )}
                        {isRep && v.reviewStatus === 'needs_fix' && (
                          <button
                            type="button"
                            onClick={() => handleOpenExecutionModal(v)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold px-2 py-1 rounded-lg text-[11px] border border-amber-300 transition cursor-pointer"
                          >
                            تعديل التقرير
                          </button>
                        )}
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
                          onClick={() => handleDuplicateVisit(v)}
                          className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition cursor-pointer border border-indigo-200"
                          title="نسخ بيانات هذه الزيارة لتكرارها أو إعادة جدولتها 📋"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedVisit(v)}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                          title="عرض التفاصيل"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || v.createdBy === currentUser?.id) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteVisit(v.id)}
                            className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition cursor-pointer"
                            title="حذف الزيارة من قاعدة البيانات"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {/* Mobile View. Same reasoning as the table above. */}
        {isWideViewport !== true && (
        <div className="block md:hidden divide-y divide-slate-100">
          {renderedVisits.map((v) => {
            const c = customerById.get(v.customerId);

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

                {getReviewStatusInfo(v) && (
                  <div className={`border rounded-lg px-2 py-1 text-[10.5px] font-bold ${getReviewStatusInfo(v)?.className}`}>
                    {getReviewStatusInfo(v)?.text}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                  <div>
                    المندوب: <span className="font-bold text-slate-800">{v.repName}</span>
                  </div>
                  <div className="font-mono text-slate-500">{v.date}</div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                    <Database className="w-3 h-3 text-emerald-600" />
                    <span>قاعدة البيانات ✅</span>
                  </span>
                  {v.collectedAmount ? (
                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      تحصيل: {formatCurrency(v.collectedAmount)}
                    </span>
                  ) : null}
                </div>

                {/* Quick actions for mobile */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-50" onClick={(e) => e.stopPropagation()}>
                  {canReviewVisit(v) && (
                    <button
                      type="button"
                      onClick={() => {
                        setReviewTarget(v);
                        setReviewNoteDraft('');
                      }}
                      className="bg-sky-700 text-white font-bold px-2.5 py-1 rounded-lg text-xs"
                    >
                      مراجعة
                    </button>
                  )}
                  {isRep && v.reviewStatus === 'needs_fix' && (
                    <button
                      type="button"
                      onClick={() => handleOpenExecutionModal(v)}
                      className="bg-amber-50 text-amber-900 font-bold px-2.5 py-1 rounded-lg text-xs border border-amber-300"
                    >
                      تعديل التقرير
                    </button>
                  )}
                  {v.status !== 'منفذة' && (
                    <button
                      type="button"
                      onClick={() => handleQuickStatusChange(v, 'منفذة')}
                      className="bg-emerald-50 text-emerald-800 font-bold px-2.5 py-1 rounded-lg text-xs border border-emerald-300"
                    >
                      تنفيذ ✅
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDuplicateVisit(v)}
                    className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200"
                    title="نسخ بيانات الزيارة لتكرارها أو جدولتها 📋"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {c?.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="bg-slate-100 text-slate-700 p-1.5 rounded-lg"
                      title="اتصال"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || v.createdBy === currentUser?.id) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteVisit(v.id)}
                      className="p-1.5 rounded-lg bg-rose-50 text-rose-600"
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}

        {filtered.length === 0 && (
          <div className="py-12 px-4 text-center space-y-2">
            <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-600">لا توجد زيارات مطابقة للفلترة المحددة</p>
            <p className="text-xs text-slate-400">يمكنك جدولة زيارة جديدة أو تغيير خيارات البحث والتاريخ</p>
          </div>
        )}

        {/* Load more. The window only ever grows, so every visit stays reachable. */}
        {remainingVisitCount > 0 && (
          <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 font-bold">
              معروض {renderedVisits.length} من {filtered.length} زيارة
            </span>
            <button
              type="button"
              onClick={() => setRenderedVisitCount((count) => count + VISIT_CHUNK_SIZE)}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs border border-slate-200 transition active:scale-95 cursor-pointer"
            >
              عرض المزيد ({Math.min(VISIT_CHUNK_SIZE, remainingVisitCount)} متبقٍ)
            </button>
          </div>
        )}
      </div>

      {/* Admin/developer only: paste visits from WhatsApp / Excel and review before saving */}
      {isImportModalOpen && <VisitImportModal onClose={() => setIsImportModalOpen(false)} />}

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

              {/* Status & Execution Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حالة الزيارة *</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as CustomerVisit['status'] })}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="منفذة">منفذة (تمت الزيارة ميدانياً ✅)</option>
                    <option value="مجدولة">مجدولة (موعد قادم ⏳)</option>
                    <option value="لم تتم">لم تتم (المحل مغلق أو تعذر ⚠️)</option>
                  </select>
                </div>
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

              {/* Outcome & Financials */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نتيجة الزيارة الميدانية</label>
                  <select
                    value={form.outcome}
                    onChange={(e) => {
                      const outcome = e.target.value as CustomerVisit['outcome'];
                      setForm({ ...form, outcome });
                      if (outcome !== 'مرتجع لدي العميل') {
                        setReturnProductQuery('');
                        setSelectedReturnProductId('');
                        setReturnQuantity(1);
                        setReturnDetails('');
                      }
                    }}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="تم التحصيل">تم التحصيل المالي ✅</option>
                    <option value="تم عمل طلبية">تم أخذ طلبية جديدة 📦</option>
                    <option value="تأجيل سداد">تأجيل سداد بميعاد محدد ⏳</option>
                    <option value="المحل مغلق">المحل مغلق ⛔</option>
                    <option value="متابعة فقط">متابعة وفحص دوري 🔍</option>
                    <option value="مرتجع لدي العميل">مرتجع لدي العميل 📦↩️</option>
                  </select>
                </div>

                {form.outcome === 'مرتجع لدي العميل' ? (
                  <div className="sm:col-span-2 rounded-2xl border-2 border-rose-300 bg-rose-50/70 p-3 space-y-3 animate-in fade-in">
                    <div className="flex items-center gap-2 text-rose-700 font-black text-[11px]">
                      <AlertTriangle className="w-4 h-4" />
                      تفاصيل المرتجع — سيتم إبلاغ المشرف ومدير الفرع وأمين المخزن فوراً
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2 relative">
                        <label className="block text-[11px] font-bold text-rose-700 mb-1">بحث عن الصنف بالاسم أو الكود *</label>
                        <input
                          type="search"
                          value={returnProductQuery}
                          onFocus={() => setIsReturnProductListOpen(true)}
                          onChange={(e) => {
                            setReturnProductQuery(e.target.value);
                            setSelectedReturnProductId('');
                            setIsReturnProductListOpen(true);
                          }}
                          placeholder="اكتب اسم الصنف مثل طقم حلل"
                          autoComplete="off"
                          className="w-full border border-rose-300 rounded-xl p-2.5 text-xs font-bold text-rose-900 bg-white focus:bg-white focus:outline-none"
                        />
                        {isReturnProductListOpen && returnProductQuery.trim() && (
                          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-rose-200 bg-white shadow-lg">
                            {returnProductOptions.length > 0 ? returnProductOptions.map((product) => (
                              <button
                                key={product.id}
                                type="button"
                                onClick={() => {
                                  setReturnProductQuery(product.name);
                                  setSelectedReturnProductId(product.id);
                                  setIsReturnProductListOpen(false);
                                }}
                                className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-right last:border-b-0 hover:bg-rose-50"
                              >
                                <span className="min-w-0 truncate text-xs font-bold text-slate-800">{product.name}</span>
                                <span className="shrink-0 text-[10px] font-mono text-slate-500">{product.code}</span>
                              </button>
                            )) : (
                              <p className="px-3 py-2 text-xs text-slate-500">لا توجد أصناف مطابقة في المخزون.</p>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-rose-700 mb-1">الكمية المرتجعة (قطعة) *</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={returnQuantity}
                          onChange={(e) => setReturnQuantity(Number(e.target.value))}
                          required
                          className="w-full border border-rose-300 rounded-xl p-2.5 text-xs font-bold text-rose-900 bg-white focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-rose-700 mb-1">تفاصيل المرتجع</label>
                        <textarea
                          rows={2}
                          value={returnDetails}
                          onChange={(e) => setReturnDetails(e.target.value)}
                          placeholder="اكتب حالة الصنف أو سبب إرجاعه"
                          className="w-full border border-rose-300 rounded-xl p-2.5 text-xs font-bold text-rose-900 bg-white focus:bg-white focus:outline-none resize-none font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ) : form.outcome === 'تم التحصيل' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المحصل (ج.م)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.collectedAmount || ''}
                      onChange={(e) => setForm({ ...form, collectedAmount: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full border border-emerald-300 rounded-xl p-2.5 text-xs font-bold text-emerald-900 bg-emerald-50 focus:bg-white focus:outline-none"
                    />
                  </div>
                ) : form.outcome === 'تم عمل طلبية' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">قيمة الطلبية المنشأة (ج.م)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.orderAmount || ''}
                      onChange={(e) => setForm({ ...form, orderAmount: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full border border-blue-300 rounded-xl p-2.5 text-xs font-bold text-blue-900 bg-blue-50 focus:bg-white focus:outline-none"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الموعد القادم المتفق عليه</label>
                    <input
                      type="date"
                      value={form.nextVisitDate}
                      onChange={(e) => setForm({ ...form, nextVisitDate: e.target.value })}
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Store stock condition & Customer rating */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حالة المخزون بمتجر العميل</label>
                  <select
                    value={form.storeStockStatus}
                    onChange={(e) => setForm({ ...form, storeStockStatus: e.target.value as any })}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none"
                  >
                    <option value="متوفر بكثرة">متوفر بكثرة (مخزون وافر)</option>
                    <option value="متوسط">متوسط (بحاجة لتنشيط قريباً)</option>
                    <option value="منخفض">منخفض (أوشك على النفاد ⚠️)</option>
                    <option value="منعدم (نفاد مخزون)">منعدم (نفاد مخزون تام ⛔)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تقييم تجاوب ورضا العميل</label>
                  <div className="flex items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setForm({ ...form, customerRating: star as any })}
                        className="p-1 hover:scale-125 transition cursor-pointer"
                      >
                        <Star className={`w-4 h-4 ${star <= form.customerRating ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`} />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-700 mr-2">{form.customerRating} من 5 نجوم</span>
                  </div>
                </div>
              </div>

              {/* Competitor Intel */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رصد المنافسين (أسعار، عروض، منتجات جديدة بالمتجر)</label>
                <input
                  type="text"
                  placeholder="سجل أي عروض أو أسعار للشركات المنافسة لاحظتها في المتجر..."
                  value={form.competitorNotes}
                  onChange={(e) => setForm({ ...form, competitorNotes: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none"
                />
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

              {/* Database Guarantee Notice */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-[11px] text-emerald-900 font-bold">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>
                  تأكيد الحفظ: يتم تثبيت وحفظ هذه الزيارة تلقائياً بقاعدة البيانات السحابية (Supabase) والتخزين المحلي، وتحديث سجل العميل فوراً.
                </span>
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
              const c = customerById.get(selectedVisit.customerId);
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
                    {selectedVisit.durationMinutes ? (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 block">مدة الزيارة الميدانية</span>
                        <span className="text-xs font-black text-slate-800">{selectedVisit.durationMinutes} دقيقة</span>
                      </div>
                    ) : null}
                    {selectedVisit.storeStockStatus ? (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 block">حالة مخزون المتجر</span>
                        <span className="text-xs font-black text-slate-800">{selectedVisit.storeStockStatus}</span>
                      </div>
                    ) : null}
                    {selectedVisit.customerRating ? (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 block">تقييم تجاوب العميل</span>
                        <span className="text-xs font-black text-amber-600 flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          <span>{selectedVisit.customerRating} من 5 نجوم</span>
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Status Update Control */}
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-black text-emerald-950 block">تغيير حالة الزيارة:</span>
                      <span className="text-[11px] text-emerald-800">تحديث فوري ينعكس على سجل المندوب وقاعدة البيانات</span>
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

                  {selectedVisit.competitorNotes && (
                    <div className="p-3.5 bg-amber-50/80 rounded-2xl border border-amber-200">
                      <span className="text-xs font-bold text-amber-900 block mb-1">رصد المنافسين بالمتجر:</span>
                      <p className="text-xs text-amber-950 leading-relaxed whitespace-pre-wrap">{selectedVisit.competitorNotes}</p>
                    </div>
                  )}

                  {selectedVisit.outcome && (
                    <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200">
                      <span className="text-xs font-bold text-emerald-800 block mb-1">النتيجة الميدانية:</span>
                      <p className="text-xs text-emerald-900 leading-relaxed font-bold">{selectedVisit.outcome}</p>
                    </div>
                  )}

                  {/* Financial Results: Collection & Order */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {selectedVisit.collectedAmount ? (
                      <div className="p-3.5 bg-emerald-100/70 rounded-2xl border border-emerald-300 flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-950">المبلغ المحصل خلال الزيارة:</span>
                        <span className="text-base font-black text-emerald-700 font-mono">
                          {formatCurrency(selectedVisit.collectedAmount)}
                        </span>
                      </div>
                    ) : null}

                    {selectedVisit.orderAmount ? (
                      <div className="p-3.5 bg-blue-100/70 rounded-2xl border border-blue-300 flex items-center justify-between">
                        <span className="text-xs font-black text-blue-950">قيمة الطلبية المنشأة:</span>
                        <span className="text-base font-black text-blue-700 font-mono">
                          {formatCurrency(selectedVisit.orderAmount)}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Return and Storekeeper Handover Section (تفاصيل المرتجع وإجراءات التحويل لأمين المخزن) */}
                  {selectedVisit.isReturn && (
                    <div className="p-4 rounded-2xl border-2 border-rose-300 bg-gradient-to-br from-rose-50 via-white to-orange-50 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between border-b border-rose-200 pb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black shrink-0">
                            <RotateCcw className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-rose-950">سجل إجراءات المرتجع والتحويل لمدير المخزن</h4>
                            <span className="text-[10px] text-rose-700 font-bold">توثيق رسمي يظهر للمطور والإدارة ومدير الفرع والمشرف</span>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-xl bg-slate-900 text-white text-xs font-black font-mono">
                          قيمة المرتجع: {formatCurrency(selectedVisit.returnValue || 0)}
                        </span>
                      </div>

                      {selectedVisit.returnReason && (
                        <div className="text-xs text-rose-900 bg-rose-50/80 p-2.5 rounded-xl border border-rose-200 font-semibold">
                          <span className="font-bold text-slate-500">سبب المرتجع: </span>
                          <span className="font-black text-rose-950">{selectedVisit.returnReason}</span>
                        </div>
                      )}

                      {selectedVisit.returnItems && (
                        <div className="bg-white rounded-xl border border-rose-200 p-2.5">
                          <span className="font-bold text-slate-500 text-[11px] block mb-1">الأصناف المرتجعة وكمياتها:</span>
                          <pre className="text-xs font-mono font-bold text-slate-800 whitespace-pre-wrap leading-relaxed">
                            {selectedVisit.returnItems}
                          </pre>
                        </div>
                      )}

                      {/* Handover Status & Metadata */}
                      <div className="bg-white/95 p-3 rounded-xl border border-rose-200 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs font-bold text-slate-600">حالة تسليم المرتجع للمخزن:</span>
                          {selectedVisit.returnStatus === 'تم التحويل لأمين المخزن' || selectedVisit.returnStatus === 'تم الإرسال لأمين المخزن' ? (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-sky-100 text-sky-900 border border-sky-300 flex items-center gap-1.5 shadow-2xs">
                              <Package className="w-3.5 h-3.5 text-sky-700" />
                              <span>تم تحويلها لمدير المخزن 📦</span>
                            </span>
                          ) : selectedVisit.returnStatus === 'تم الاستلام من أمين المخزن' || selectedVisit.returnStatus === 'تم الاستلام بالمخزن' ? (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                              <span>تم الاستلام بالمخزن معتمد ✅</span>
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-amber-700" />
                              <span>بانتظار التحويل لأمين المخزن ⏳</span>
                            </span>
                          )}
                        </div>

                        {selectedVisit.returnHandledBy && (
                          <div className="text-[11px] text-slate-700 border-t border-slate-100 pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span>
                              القائم بإجراء التحويل: <strong className="text-slate-900">{selectedVisit.returnHandledBy}</strong>
                            </span>
                            {selectedVisit.returnHandledAt && (
                              <span className="font-mono text-slate-500 text-[10px]">
                                {new Date(selectedVisit.returnHandledAt).toLocaleString('ar-EG')}
                              </span>
                            )}
                          </div>
                        )}

                        {selectedVisit.returnNote && (
                          <div className="text-[11px] text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200">
                            <span className="font-bold text-slate-500 block text-[10px]">ملاحظات التحويل:</span>
                            <span>{selectedVisit.returnNote}</span>
                          </div>
                        )}

                        {/* Handover Action Buttons */}
                        {canManageReturns && (
                          <div className="pt-2 border-t border-slate-200 flex items-center gap-2 flex-wrap">
                            {(!selectedVisit.returnStatus || selectedVisit.returnStatus === 'بانتظار المشرف') && (
                              <button
                                type="button"
                                onClick={() => handleTransferToStorekeeper(selectedVisit)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                              >
                                <Package className="w-4 h-4" />
                                <span>تحويل الزيارة والمرتجع إلى مدير المخزن الآن 📦</span>
                              </button>
                            )}

                            {(selectedVisit.returnStatus === 'تم التحويل لأمين المخزن' || selectedVisit.returnStatus === 'تم الإرسال لأمين المخزن') && (
                              <button
                                type="button"
                                onClick={() => handleConfirmStoreReceipt(selectedVisit)}
                                className="bg-teal-600 hover:bg-teal-700 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                              >
                                <PackageCheck className="w-4 h-4" />
                                <span>تأكيد استلام المرتجع في المخزن رسمياً ✅</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedVisit.nextVisitDate && (
                    <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-900">موعد الزيارة القادمة المتفق عليه:</span>
                      <span className="text-xs font-black font-mono text-purple-950 bg-white px-3 py-1 rounded-xl border border-purple-300">
                        📅 {selectedVisit.nextVisitDate}
                      </span>
                    </div>
                  )}

                  {/* Database Confirmation Card */}
                  <div className="p-3 bg-slate-900 text-white rounded-2xl border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-black text-slate-200">حالة قاعدة البيانات: الزيارة مثبتة ومؤكدة ✅</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800">
                      ID: {selectedVisit.id.slice(0, 16)}...
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const v = selectedVisit;
                    setSelectedVisit(null);
                    handleDuplicateVisit(v);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  title="تكرار وإنشاء نسخة جديدة من هذه الزيارة للعميل"
                >
                  <Copy className="w-4 h-4" />
                  <span>نسخ الزيارة لإنشاء زيارة جديدة 📋</span>
                </button>

                {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || selectedVisit.createdBy === currentUser?.id) && (
                  <button
                    type="button"
                    onClick={() => handleDeleteVisit(selectedVisit.id)}
                    className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-black flex items-center gap-1.5 transition cursor-pointer border border-rose-200"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>حذف</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewTarget && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setReviewTarget(null);
              setReviewNoteDraft('');
            }
          }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black">مراجعة تقرير الزيارة</h3>
                <p className="text-xs text-slate-300 mt-1">{reviewTarget.repName} · {reviewTarget.customerName}</p>
              </div>
              <button type="button" onClick={() => setReviewTarget(null)} className="p-1 text-slate-300 hover:text-white" title="إغلاق">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="block text-xs font-bold text-slate-700">
                ملاحظة للمندوب عند طلب التعديل
                <textarea
                  value={reviewNoteDraft}
                  onChange={(e) => setReviewNoteDraft(e.target.value)}
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="وضح المطلوب تعديله..."
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleSubmitReview('needs_fix')}
                  disabled={!reviewNoteDraft.trim()}
                  className="px-3 py-2 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black disabled:opacity-50"
                >
                  طلب تعديل
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitReview('approved')}
                  className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-black"
                >
                  اعتماد الزيارة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {executingVisit && (
        <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3">
          <form onSubmit={handleSaveExecution} className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
            <div className="sticky top-0 px-4 py-3 bg-slate-900 text-white flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black">تعديل تقرير الزيارة</h3>
                <p className="text-xs text-slate-300 mt-1">{executingVisit.customerName} · {executingVisit.date}</p>
              </div>
              <button type="button" onClick={() => setExecutingVisit(null)} className="p-1 text-slate-300 hover:text-white" title="إغلاق">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {executingVisit.reviewNote && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950">
                  <strong>ملاحظة المشرف:</strong> {executingVisit.reviewNote}
                </div>
              )}
              <label className="block text-xs font-bold text-slate-700">
                نتيجة الزيارة
                <select value={executionForm.outcome} onChange={(e) => setExecutionForm({ ...executionForm, outcome: e.target.value as CustomerVisit['outcome'] })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="تم عمل طلبية">تم عمل طلبية</option>
                  <option value="تم التحصيل">تم التحصيل</option>
                  <option value="تأجيل سداد">تأجيل سداد</option>
                  <option value="المحل مغلق">المحل مغلق</option>
                  <option value="متابعة فقط">متابعة فقط</option>
                  <option value="مرتجع لدي العميل">مرتجع لدي العميل</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-700">
                ملاحظات الزيارة
                <textarea value={executionForm.notes} onChange={(e) => setExecutionForm({ ...executionForm, notes: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 p-3" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-slate-700">المبلغ المحصل
                  <input type="number" min="0" step="0.01" value={executionForm.collectedAmount} onChange={(e) => setExecutionForm({ ...executionForm, collectedAmount: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
                <label className="block text-xs font-bold text-slate-700">قيمة الطلبية
                  <input type="number" min="0" step="0.01" value={executionForm.orderAmount} onChange={(e) => setExecutionForm({ ...executionForm, orderAmount: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
                <label className="block text-xs font-bold text-slate-700">حالة الزيارة
                  <select value={executionForm.status} onChange={(e) => setExecutionForm({ ...executionForm, status: e.target.value as CustomerVisit['status'] })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                    <option value="منفذة">منفذة</option>
                    <option value="لم تتم">لم تتم</option>
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-700">حالة مخزون العميل
                  <select value={executionForm.storeStockStatus} onChange={(e) => setExecutionForm({ ...executionForm, storeStockStatus: e.target.value as NonNullable<CustomerVisit['storeStockStatus']> })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                    <option value="متوفر بكثرة">متوفر بكثرة</option>
                    <option value="متوسط">متوسط</option>
                    <option value="منخفض">منخفض</option>
                    <option value="منعدم (نفاد مخزون)">منعدم (نفاد مخزون)</option>
                  </select>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setExecutingVisit(null)} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">إلغاء</button>
                <button type="submit" className="px-3 py-2 rounded-lg bg-sky-700 text-white text-xs font-black">إعادة الإرسال للمراجعة</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Customer Dossier Modal (credit limit, debt, guarantee, 2026 figures) */}
      {dossierCustomer && (() => {
        const dc = dossierCustomer;
        const balance = Number(dc.currentBalance ?? dc.balance ?? 0);
        const overdue = Number(dc.totalOverdueAndDue ?? dc.overdueBalance ?? 0);
        const limit = Number(dc.creditLimit || 0);
        // Papers count only when there is an actual amount behind them, so a
        // blank or zero cell reads as "no papers" instead of a false pass.
        const guaranteeAmount = Number(dc.guaranteeAmount || 0);
        const hasPapers = guaranteeAmount > 0 || dc.hasGuarantee === true;
        // Collections are signed or positive in the sheet, so display the absolute collected magnitude.
        const cols2026 = (() => {
          const raw = Number(dc.totalMonthlyCollections ?? dc.collections2026 ?? 0);
          if (!isFinite(raw) || raw === 0) return 0;
          return Math.abs(raw);
        })();
        return (
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3.5 z-50 animate-in fade-in duration-150"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setDossierCustomer(null);
            }}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto">
              <div className="sticky top-0 bg-slate-900 text-white px-4 py-3 flex items-start justify-between gap-3 rounded-t-2xl">
                <div className="min-w-0">
                  <h3 className="text-sm font-black truncate">{dc.name || 'عميل'}</h3>
                  <p className="text-[10.5px] text-slate-300 font-bold mt-0.5">
                    كود: {dc.code || '-'} {dc.storeName ? `• ${dc.storeName}` : ''} {dc.branchName ? `• ${dc.branchName}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDossierCustomer(null)}
                  className="text-slate-300 hover:text-white font-black text-xl leading-none cursor-pointer shrink-0"
                >
                  ×
                </button>
              </div>

              <div className="p-4 space-y-3">
                {/* Debt and credit limit */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className={`p-3 rounded-xl border ${overdue > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="text-[10.5px] font-bold text-slate-500">المستحقات المتأخرة</div>
                    <div className={`text-lg font-black font-mono ${overdue > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                      {formatCurrency(overdue)}
                    </div>
                  </div>
                  <div className={`p-3 rounded-xl border ${balance > limit && limit > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="text-[10.5px] font-bold text-slate-500">المديونية الحالية</div>
                    <div className={`text-lg font-black font-mono ${balance > limit && limit > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                      {formatCurrency(balance)}
                    </div>
                  </div>
                </div>

                {/* Credit limit with over-limit warning */}
                <div className={`p-3 rounded-xl border ${balance > limit && limit > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-600">الحد الائتماني</span>
                    <span className="text-sm font-black font-mono text-slate-800">{limit > 0 ? formatCurrency(limit) : 'غير محدد'}</span>
                  </div>
                  {limit > 0 && (
                    <div className="text-[11px] font-black mt-1.5">
                      {balance > limit ? (
                        <span className="text-rose-700">⚠️ تجاوز الحد بمقدار {formatCurrency(balance - limit)}</span>
                      ) : (
                        <span className="text-emerald-700">✓ المتاح آمن: {formatCurrency(limit - balance)}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Guarantee papers */}
                <div className={`p-3 rounded-xl border ${hasPapers ? 'bg-sky-50 border-sky-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-600">أوراق الضمان</span>
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg ${hasPapers ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {hasPapers ? 'ماضي على أوراق ضمان' : 'مش ماضي'}
                    </span>
                  </div>
                  <div className="text-[10.5px] font-bold text-slate-500 mt-1">
                    {dc.guaranteeDocs || 'لا يوجد ورق ضمان'}
                    {hasPapers && guaranteeAmount > 0 ? ` • المبلغ: ${formatCurrency(guaranteeAmount)}` : ''}
                  </div>
                </div>

                {/* 2026 figures */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                    <div className="text-[10.5px] font-bold text-blue-700">مبيعات 2026</div>
                    <div className="text-base font-black font-mono text-blue-800">
                      {formatCurrency(Number(dc.sales2026 ?? dc.totalMonthlySales ?? 0))}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="text-[10.5px] font-bold text-emerald-700">تحصيلات 2026</div>
                    <div className="text-base font-black font-mono text-emerald-800">{formatCurrency(cols2026)}</div>
                  </div>
                </div>

                {/* Last visit */}
                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">تاريخ آخر زيارة</span>
                  <span className="text-[11px] font-black font-mono text-slate-800">
                    {dc.lastVisitDate || 'لا توجد زيارات سابقة'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
};
