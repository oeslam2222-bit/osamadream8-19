import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  Flame,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { inferCustomerSector } from '../data/branchDefinitions';
import type { Customer, CustomerVisit } from '../types';

const todayKey = (): string => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
};

/** عدد كروت العملاء المحمّلة في كل دفعة — يمنع بناء آلاف الكروت مرة واحدة. */
const CUSTOMERS_PAGE_SIZE = 20;

/**
 * المتأخرات المستخدمة في شاشة التحصيل.
 *
 * السلسلة القديمة كانت `overdueBalance ?? totalOverdue ?? ...` — و`??` بيتوقف
 * عند أول قيمة موجودة حتى لو كانت **صفر**. بيانات الشيتات فيها عمود
 * `overdueBalance = 0` بجانب `overdue2026` الحقيقي، فكان العميل المتأخر
 * بيتحسب "صفر متأخرات" ويختفي من التحصيلات. دلوقتي بناخد أول عمود **قيمته
 * موجبة**، وبعدها فقط نرجع للمديونية كآخر حل.
 */
const getCustomerDebt = (customer: Customer): number => {
  const candidates = [
    customer.totalOverdue,
    customer.overdue2026,
    customer.overdue2025,
    customer.overdueBalance,
    customer.totalOverdueAndDue,
    customer.dueBalance,
    customer.currentBalance,
    customer.balance,
  ];
  for (const value of candidates) {
    const due = Number(value);
    if (Number.isFinite(due) && due > 0) return due;
  }
  return 0;
};

const buildInitials = (name: string): string => {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'م';
};

const formatOutcomeText = (): CustomerVisit['outcome'] => 'تم التحصيل';

interface RepSummary {
  repId: string;
  repName: string;
  avatar: string;
  sales: number;
  collections: number;
  customers: number;
  visits: number;
  lastVisit: string;
  rate: number;
}

export const CollectionRecoveryDashboard: React.FC = () => {
  const {
    currentUser,
    customers,
    users,
    invoices,
    getVisibleCustomers,
    addVisit,
    updateCustomer,
    visits,
  } = useApp();

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('الكل');
  const [repFilter, setRepFilter] = useState('الكل');
  const [sectorFilter, setSectorFilter] = useState<'all' | 'home' | 'electrical' | 'both'>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [amountByCustomer, setAmountByCustomer] = useState<Record<string, number>>({});
  const [notesByCustomer, setNotesByCustomer] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [confirmCustomer, setConfirmCustomer] = useState<Customer | null>(null);
  const [visibleCustomersCount, setVisibleCustomersCount] = useState(CUSTOMERS_PAGE_SIZE);

  // أي تغيير في البحث/الفلاتر يرجّع التحميل لأول دفعة
  useEffect(() => {
    setVisibleCustomersCount(CUSTOMERS_PAGE_SIZE);
  }, [search, branchFilter, repFilter, sectorFilter]);

  const repoCustomers = useMemo(() => {
    // `getVisibleCustomers` بيتكفّل أصلًا بصلاحيات الفرع/المندوب/المشرف،
    // فكان فيه فلتر فرع إضافي هنا بيقارن اسم الفرع بالنص الحرفي وبيخفّي
    // كل عملاء الفروع التانية حتى عن الأدمن — وده سبب إن التحصيلات كانت فاضية.
    const list = getVisibleCustomers ? getVisibleCustomers() : customers;
    return list.filter((customer) => {
      const assignedToRep = !currentUser || currentUser.role === 'admin' || currentUser.role === 'developer' || currentUser.role === 'branch_manager' || currentUser.role === 'supervisor'
        ? true
        : customer.repId === currentUser.id || customer.salesRepName === currentUser.name || customer.repName === currentUser.name;
      const resolvedSector = inferCustomerSector(customer, users);
      const matchesSector =
        sectorFilter === 'all' ||
        customer.sector === 'both' ||
        customer.sector === 'all' ||
        (sectorFilter === 'both'
          ? resolvedSector === 'home' || resolvedSector === 'electrical'
          : resolvedSector === sectorFilter);
      return assignedToRep && matchesSector && getCustomerDebt(customer) > 0;
    });
  }, [getVisibleCustomers, customers, users, currentUser, sectorFilter]);

  const branchOptions = useMemo(
    () => ['الكل', ...Array.from(new Set(repoCustomers.map((customer) => customer.branchName).filter(Boolean)))],
    [repoCustomers]
  );

  const repOptions = useMemo(
    () => ['الكل', ...Array.from(new Set(repoCustomers.map((customer) => customer.salesRepName || customer.repName || 'غير محدد')))],
    [repoCustomers]
  );

  const overdueCustomers = useMemo(() => {
    const normalized = search.trim();
    const filtered = repoCustomers.filter((customer) => {
      const branchMatch = branchFilter === 'الكل' || customer.branchName === branchFilter;
      const repMatch = repFilter === 'الكل' || (customer.salesRepName || customer.repName || 'غير محدد') === repFilter;
      const textSearch = !normalized || `${customer.name} ${customer.storeName || ''} ${customer.code} ${customer.phone}`.toLowerCase().includes(normalized.toLowerCase());
      return branchMatch && repMatch && textSearch;
    });

    return filtered.sort((a, b) => getCustomerDebt(b) - getCustomerDebt(a));
  }, [repoCustomers, search, branchFilter, repFilter]);

  const pagedOverdueCustomers = useMemo(
    () => overdueCustomers.slice(0, visibleCustomersCount),
    [overdueCustomers, visibleCustomersCount]
  );

  const totalDebt = useMemo(
    () => overdueCustomers.reduce((sum, customer) => sum + getCustomerDebt(customer), 0),
    [overdueCustomers]
  );

  const todayVisits = useMemo(
    () => visits.filter((visit) => visit.date === todayKey()).length,
    [visits]
  );

  const todayCollectionValue = useMemo(
    () => visits
      .filter((visit) => visit.type === 'تحصيل' && visit.date === todayKey())
      .reduce((sum, visit) => sum + Number(visit.collectedAmount || 0), 0),
    [visits]
  );

  const repSummaries = useMemo<RepSummary[]>(() => {
    const map = new Map<string, RepSummary>();

    repoCustomers.forEach((customer) => {
      const repName = customer.salesRepName || customer.repName || 'غير محدد';
      const key = `${customer.repId || repName}`;
      const current = map.get(key) ?? {
        repId: customer.repId || key,
        repName,
        avatar: buildInitials(repName),
        sales: 0,
        collections: 0,
        customers: 0,
        visits: 0,
        lastVisit: '',
        rate: 0,
      };
      current.customers += 1;
      map.set(key, current);
    });

    invoices.forEach((invoice) => {
      const repName = (invoice as any).repName || (invoice as any).salesRepName || (invoice as any).rep || 'غير محدد';
      const repId = (invoice as any).repId || `${repName}-${(invoice as any).invoiceNumber || 'invoice'}`;
      const key = repId || repName;
      const current = map.get(key) ?? {
        repId,
        repName,
        avatar: buildInitials(repName),
        sales: 0,
        collections: 0,
        customers: 0,
        visits: 0,
        lastVisit: '',
        rate: 0,
      };
      const total = Number((invoice as any).totalAmount ?? (invoice as any).netTotal ?? (invoice as any).grandTotal ?? 0);
      current.sales += Number.isFinite(total) ? total : 0;
      map.set(key, current);
    });

    visits.forEach((visit) => {
      if (visit.type !== 'تحصيل') return;
      const repName = visit.repName || 'غير محدد';
      const key = `${visit.repId || repName}`;
      const current = map.get(key) ?? {
        repId: visit.repId || key,
        repName,
        avatar: buildInitials(repName),
        sales: 0,
        collections: 0,
        customers: 0,
        visits: 0,
        lastVisit: '',
        rate: 0,
      };
      current.collections += Number(visit.collectedAmount || 0);
      current.visits += 1;
      current.lastVisit = visit.date || current.lastVisit;
      map.set(key, current);
    });

    return Array.from(map.values())
      .map((rep) => ({
        ...rep,
        rate: rep.sales > 0 ? Math.min(100, Math.round((rep.collections / rep.sales) * 100)) : 0,
      }))
      .sort((a, b) => b.collections - a.collections || b.sales - a.sales);
  }, [repoCustomers, invoices, visits]);

  const topRep = repSummaries[0];
  const managerKpis = useMemo(() => {
    const activeReps = repSummaries.filter((rep) => rep.collections > 0 || rep.sales > 0).length;
    const avgRate = repSummaries.length > 0
      ? Math.round(repSummaries.reduce((sum, rep) => sum + rep.rate, 0) / repSummaries.length)
      : 0;

    return [
      {
        key: 'today-collections',
        label: 'تحصيل اليوم',
        value: formatCurrency(todayCollectionValue),
        hint: 'المحصل من كل المناديب اليوم',
      },
      {
        key: 'overdue-balance',
        label: 'إجمالي المتأخرات',
        value: formatCurrency(totalDebt),
        hint: 'العملاء المتأخرين فقط',
      },
      {
        key: 'rep-rate',
        label: 'متوسط نسبة التحصيل',
        value: `${avgRate}%`,
        hint: 'بناءً على نسب المناديب',
      },
      {
        key: 'active-reps',
        label: 'المناديب النشطين',
        value: `${activeReps}`,
        hint: 'لديهم مبيعات أو تحصيلات',
      },
    ];
  }, [repSummaries, totalDebt, todayCollectionValue]);

  const dailyCollectionRows = useMemo(() => {
    const rows = repSummaries.map((rep) => {
      const repVisits = visits.filter(
        (visit) => (visit.repId === rep.repId || visit.repName === rep.repName) && visit.type === 'تحصيل' && visit.date === todayKey()
      );
      const collected = repVisits.reduce((sum, visit) => sum + Number(visit.collectedAmount || 0), 0);
      const count = repVisits.length;
      return {
        id: rep.repId,
        repName: rep.repName,
        avatar: rep.avatar,
        collected,
        count,
        proportion: rep.rate,
      };
    });

    return rows.filter((row) => row.collected > 0).sort((a, b) => b.collected - a.collected);
  }, [repSummaries, visits]);

  const selectedCustomer = overdueCustomers.find((customer) => customer.id === selectedCustomerId) ?? overdueCustomers[0] ?? null;

  const handleSave = (customer: Customer) => {
    if (!currentUser) return;

    const debt = getCustomerDebt(customer);
    const amount = Number(amountByCustomer[customer.id] ?? Math.min(debt, debt || 0));

    if (amount <= 0) {
      setToast('يرجى إدخال مبلغ التحصيل قبل الحفظ');
      return;
    }

    const visit: Omit<CustomerVisit, 'id' | 'createdAt' | 'createdBy'> = {
      customerId: customer.id,
      customerName: customer.name,
      customerCode: customer.code,
      date: todayKey(),
      time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      repId: currentUser.id,
      repName: currentUser.name,
      branchName: customer.branchName || currentUser.branchName,
      sector: customer.sector || 'all',
      supervisorId: currentUser.supervisorId,
      supervisorName: currentUser.supervisorName || 'المشرف',
      type: 'تحصيل',
      outcome: formatOutcomeText(),
      status: 'منفذة',
      collectedAmount: amount,
      notes: notesByCustomer[customer.id] || `تحصيل مبلغ ${formatCurrency(amount)} من العميل ${customer.name}`,
      reviewStatus: 'approved',
      reviewedByName: currentUser.name,
      reviewNote: 'تم تسجيل زيارة تحصيل من شاشة التحصيل',
      syncStatus: 'local_only',
    };

    const result = addVisit(visit);
    const remaining = Math.max(0, debt - amount);
    updateCustomer({
      ...customer,
      balance: remaining,
      currentBalance: remaining,
      overdueBalance: remaining,
      totalOverdue: remaining,
      dueBalance: remaining,
      lastCollectionDate: visit.date,
      lastCollectionAmount: amount,
    });

    const alertText = result.success
      ? `تم تسجيل تحصيل العميل ${customer.name} بمبلغ ${formatCurrency(amount)} بنجاح. أحسنت يا بطل`
      : result.message;

    setToast(alertText);
    setConfirmCustomer(null);
    setSelectedCustomerId(customer.id);
    setTimeout(() => setToast(null), 4400);
  };

  const openConfirmModal = (customer: Customer) => setConfirmCustomer(customer);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="rounded-[28px] border border-slate-200 bg-gradient-to-r from-emerald-500 via-green-500 to-teal-600 p-5 text-white shadow-lg shadow-emerald-500/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-100">
              <Sparkles className="h-4 w-4" />
              صفحة التحصيل
            </div>
            <h2 className="text-2xl font-black">تحصيل العملاء المتأخرين</h2>
            <p className="mt-2 max-w-xl text-sm text-emerald-50">
              العملاء اللي عندهم متأخرات فقط، ويتم تسجيل التحصيل كزيارة واحدة فقط داخل صفحة الزيارات لتفادي الازدواج بين أكثر من مكان.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <Flame className="h-6 w-6 text-amber-200" />
            <div>
              <div className="text-[10px] text-emerald-100">التشجيع</div>
              <div className="font-black">{topRep ? `${topRep.repName} يقود اليوم` : 'أحسنت يا بطل'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold">عدد العملاء</span>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900">{overdueCustomers.length}</div>
          <div className="mt-1 text-xs text-slate-500">عملاء متأخرين يحتاجون متابعة</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold">إجمالي المتأخرات</span>
            <Coins className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900">{formatCurrency(totalDebt)}</div>
          <div className="mt-1 text-xs text-slate-500">المبلغ المستحق للحفظ والتحصيل</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold">زيارات اليوم</span>
            <TrendingUp className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900">{todayVisits}</div>
          <div className="mt-1 text-xs text-slate-500">زيارة/زيارات مسجلة في اليوم الحالي</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {managerKpis.map((item) => (
          <div key={item.key} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{item.label}</div>
            <div className="mt-3 text-2xl font-black text-slate-900">{item.value}</div>
            <div className="mt-1 text-xs text-slate-500">{item.hint}</div>
          </div>
        ))}
      </div>

      {topRep && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-sm font-black text-white">
                {topRep.avatar}
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">رسالة تحفيز</div>
                <div className="text-base font-black text-emerald-900">{topRep.repName} يتصدر اليوم بأعلى تحصيل</div>
              </div>
            </div>
            <div className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-black text-emerald-700">
              مكافأة/تشجيع: متابعة قوية + استمر في التقدم!
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900">قائمة العملاء المتأخرين</h3>
            </div>
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث عن العميل أو الكود أو الهاتف"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 pr-10 pl-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-400"
              />
            </div>
          </div>

          <div className="mb-4 grid gap-2 md:grid-cols-3">
            <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-400">
              {branchOptions.map((option) => (
                <option key={option} value={option}>{option === 'الكل' ? 'كل الفروع' : option}</option>
              ))}
            </select>

            <select value={repFilter} onChange={(event) => setRepFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-400">
              {repOptions.map((option) => (
                <option key={option} value={option}>{option === 'الكل' ? 'كل المناديب' : option}</option>
              ))}
            </select>

            <select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value as 'all' | 'home' | 'electrical' | 'both')} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-400">
              <option value="all">كل القطاعات</option>
              <option value="home">منزلي</option>
              <option value="electrical">كهربائي</option>
              <option value="both">كلاهما</option>
            </select>
          </div>

          <div className="space-y-3">
            {overdueCustomers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-black text-slate-800">لا يوجد عملاء متأخرين</h4>
                <p className="mt-1 text-xs text-slate-500">جميع العملاء في حالة جيدة، استمر في التقدم اليومي.</p>
              </div>
            ) : (
              pagedOverdueCustomers.map((customer) => {
                const debt = getCustomerDebt(customer);
                const amountValue = amountByCustomer[customer.id] ?? Math.max(debt, 0);
                const noteValue = notesByCustomer[customer.id] || `متابعة تحصيل ${customer.name}`;
                const isSelected = selectedCustomer?.id === customer.id;

                return (
                  <div
                    key={customer.id}
                    className={`rounded-3xl border p-4 transition ${
                      isSelected ? 'border-emerald-300 bg-emerald-50/60 shadow-sm' : 'border-slate-200 bg-slate-50/80'
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-black text-slate-900">{customer.name}</h4>
                          <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                            متأخر {customer.code}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {customer.branchName || 'فرع رئيسي'}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" />
                            آخر تحصيل: {customer.lastCollectionDate || 'لا يوجد'}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm">
                          <div>
                            <div className="text-[10px] font-bold text-slate-500">المبلغ المستحق</div>
                            <div className="text-lg font-black text-rose-600">{formatCurrency(debt)}</div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Star className="h-3.5 w-3.5 text-amber-500" />
                            {customer.salesRepName || customer.repName || 'مندوب غير محدد'}
                          </div>
                        </div>
                      </div>

                      <div className="w-full max-w-sm">
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-600">
                            مبلغ التحصيل
                            <input
                              type="number"
                              min={0}
                              value={amountValue}
                              onChange={(event) => setAmountByCustomer((prev) => ({
                                ...prev,
                                [customer.id]: Number(event.target.value || 0),
                              }))}
                              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-400"
                            />
                          </label>

                          <label className="text-xs font-bold text-slate-600">
                            ملاحظات الزيارة
                            <input
                              value={noteValue}
                              onChange={(event) => setNotesByCustomer((prev) => ({
                                ...prev,
                                [customer.id]: event.target.value,
                              }))}
                              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-400"
                            />
                          </label>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openConfirmModal(customer)}
                            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-600"
                          >
                            تسجيل تحصيل
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerId(customer.id)}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-slate-300"
                          >
                            تفاصيل
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {visibleCustomersCount < overdueCustomers.length && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleCustomersCount((c) => c + CUSTOMERS_PAGE_SIZE)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer shadow-sm"
                >
                  عرض المزيد من العملاء ({overdueCustomers.length - visibleCustomersCount} متبقي)
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800">
              <ShieldCheck className="h-4 w-4 text-sky-600" />
              تفاصيل العميل المختار
            </div>

            {selectedCustomer ? (
              <div className="space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">العميل</div>
                  <div className="mt-1 font-black text-slate-900">{selectedCustomer.name}</div>
                  <div className="text-xs text-slate-500">{selectedCustomer.code} • {selectedCustomer.phone || 'لا يوجد هاتف'}</div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                    <div className="text-[10px] font-bold uppercase tracking-[0.15em]">المتبقي</div>
                    <div className="mt-1 text-lg font-black">{formatCurrency(getCustomerDebt(selectedCustomer))}</div>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
                    <div className="text-[10px] font-bold uppercase tracking-[0.15em]">الحالة</div>
                    <div className="mt-1 text-lg font-black">متأخر</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-200 p-3 text-xs leading-6 text-slate-500">
                  <div className="font-bold text-slate-700">معلومات العميل</div>
                  <div className="mt-1">الفرع: {selectedCustomer.branchName || 'غير محدد'}</div>
                  <div>المندوب: {selectedCustomer.salesRepName || selectedCustomer.repName || 'غير محدد'}</div>
                  <div>العنوان: {selectedCustomer.address || selectedCustomer.region || 'غير محدد'}</div>
                  <div>آخر تحصيل: {selectedCustomer.lastCollectionDate || 'لا يوجد'}</div>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-200 p-3 text-xs leading-6 text-slate-500">
                  <div className="font-bold text-slate-700">رسالة تشجيع للمندوب</div>
                  <div className="mt-1">التحصيل اليومي يزيد العائد ويحسن الالتزام. سجّل التحصيل فوراً واصل العمل بحماس، فأنت قريب من الهدف.</div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                لا يوجد عميل محدد حاليًا
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900">جدول سحب التحصيلات اليومي</h3>
            <p className="text-xs text-slate-500">تحصيل اليوم لكل مندوب حسب التتبع المباشر</p>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
            {dailyCollectionRows.length} مندوب له تحصيل اليوم
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-3 pr-2 font-bold">المندوب</th>
                <th className="pb-3 px-2 font-bold">عدد التحصيلات</th>
                <th className="pb-3 px-2 font-bold">إجمالي التحصيل</th>
                <th className="pb-3 px-2 font-bold">نسبة التحصيل</th>
              </tr>
            </thead>
            <tbody>
              {dailyCollectionRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-5 text-center text-slate-500">لا توجد تحصيلات مسجلة اليوم بعد</td>
                </tr>
              ) : (
                dailyCollectionRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xs font-black text-slate-700">
                          {row.avatar}
                        </div>
                        <span className="font-black text-slate-800">{row.repName}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-slate-600">{row.count}</td>
                    <td className="px-2 py-3 font-black text-emerald-700">{formatCurrency(row.collected)}</td>
                    <td className="px-2 py-3">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">
                        {row.proportion}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-lg font-black text-slate-900">
          <Star className="h-5 w-5 text-amber-500" />
          بروفايل كل مندوب
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {repSummaries.map((rep) => (
            <div key={rep.repId} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-base font-black text-white">
                  {rep.avatar}
                </div>
                <div>
                  <div className="text-base font-black text-slate-900">{rep.repName}</div>
                  <div className="text-xs text-slate-500">{rep.customers} عميل متأخر / متعامل</div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">إجمالي البيع</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{formatCurrency(rep.sales)}</div>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">الإجمالي المحصل</div>
                  <div className="mt-1 text-lg font-black text-emerald-700">{formatCurrency(rep.collections)}</div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-emerald-50 p-3">
                <div className="flex items-center justify-between text-xs text-emerald-700">
                  <span>نسبة التحصيل</span>
                  <span className="font-black">{rep.rate}%</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-emerald-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, rep.rate)}%` }} />
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs text-slate-600">
                <div className="rounded-2xl bg-white p-2">الزيارات: {rep.visits}</div>
                <div className="rounded-2xl bg-white p-2">آخر زيارة: {rep.lastVisit || 'لا يوجد'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {confirmCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-black text-slate-900">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                تأكيد التحصيل
              </div>
              <button type="button" onClick={() => setConfirmCustomer(null)} className="rounded-full bg-slate-100 p-2 text-slate-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
              <div className="font-black text-slate-900">{confirmCustomer.name}</div>
              <div className="mt-1">المبلغ المستحق: {formatCurrency(getCustomerDebt(confirmCustomer))}</div>
              <div>المبلغ المسجل الآن: {formatCurrency(Number(amountByCustomer[confirmCustomer.id] ?? Math.max(getCustomerDebt(confirmCustomer), 0)))} </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmCustomer(null)}
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleSave(confirmCustomer)}
                className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-emerald-600"
              >
                تأكيد الحفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-md rounded-2xl border border-emerald-200 bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{toast}</span>
            </div>
            <button type="button" onClick={() => setToast(null)} className="p-1 text-slate-300">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
