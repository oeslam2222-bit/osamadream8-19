import React, { useMemo } from 'react';
import {
  ShoppingCart, Wallet, PackageSearch, MapPin, RotateCcw, TrendingUp,
  Users, ArrowUpRight, Target, CalendarCheck, ReceiptText,
  CircleDollarSign, Activity, Boxes, ClipboardList, BarChart3, Flame,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Invoice } from '../types';

interface DreamDeliveryDashboardProps {
  onNavigate?: (tab: string) => void;
  onNewOrder?: () => void;
}

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function fmt(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function invoiceMonth(invoice: Invoice): string {
  const raw = invoice.date || invoice.createdAt || '';
  const match = String(raw).match(/(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function invoiceValue(invoice: Invoice): number {
  return Number(invoice.totalAmount ?? invoice.estimatedGrandTotal ?? 0) || 0;
}

const AVATAR_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500'];

export const DreamDeliveryDashboard: React.FC<DreamDeliveryDashboardProps> = ({ onNavigate }) => {
  const {
    currentUser,
    invoices,
    customers,
    visibleVisits,
    targets,
    getVisibleInvoices,
    getVisibleCustomers,
    getVisibleTargets,
  } = useApp();

  const visibleInvoices = useMemo(
    () => getVisibleInvoices(),
    [invoices, currentUser?.id, currentUser?.role, currentUser?.branchName]
  );

  const visibleCustomers = useMemo(
    () => getVisibleCustomers(),
    [customers, currentUser?.id, currentUser?.role, currentUser?.branchName]
  );

  const visibleTargetRows = useMemo(
    () => getVisibleTargets(),
    [targets, currentUser?.id, currentUser?.role, currentUser?.branchName]
  );

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  const latestPeriod = useMemo(() => {
    let latest: { year: number; month: number; key: string } | null = null;
    for (const row of visibleTargetRows) {
      const year = Number(row.year);
      const month = Number(row.month);
      if (!year || !month) continue;
      if (!latest || year > latest.year || (year === latest.year && month > latest.month)) {
        latest = { year, month, key: monthKey(year, month) };
      }
    }
    if (latest) return latest;
    return { year: today.getFullYear(), month: today.getMonth() + 1, key: todayKey.slice(0, 7) };
  }, [visibleTargetRows]);

  const monthRows = useMemo(
    () => visibleTargetRows.filter((r) => Number(r.year) === latestPeriod.year && Number(r.month) === latestPeriod.month),
    [visibleTargetRows, latestPeriod.year, latestPeriod.month]
  );

  const monthSales = monthRows.reduce((sum, r) => sum + (Number(r.salesAchieved) || 0), 0);
  const monthSalesTarget = monthRows.reduce((sum, r) => sum + (Number(r.salesTarget) || 0), 0);
  const monthCollection = monthRows.reduce((sum, r) => sum + (Number(r.collectionAchieved) || 0), 0);
  const monthCollectionTarget = monthRows.reduce((sum, r) => sum + (Number(r.collectionTarget) || 0), 0);

  const periodInvoices = useMemo(
    () => visibleInvoices.filter((inv) => invoiceMonth(inv) === latestPeriod.key),
    [visibleInvoices, latestPeriod.key]
  );

  const ordersToday = useMemo(
    () => visibleInvoices.filter((inv) => String(inv.date || '').slice(0, 10) === todayKey),
    [visibleInvoices, todayKey]
  );

  const returnsCount = useMemo(() => {
    const keys = new Set<string>();
    visibleInvoices.forEach((inv) => {
      if (inv.hasReturns || inv.status === 'مرتجع' || inv.status === 'مرتجع جزئي') keys.add(inv.id);
    });
    return keys.size;
  }, [visibleInvoices]);

  const periodVisits = useMemo(
    () => visibleVisits.filter((v) => String(v.date || '').slice(0, 7) === latestPeriod.key),
    [visibleVisits, latestPeriod.key]
  );

  const visitsToday = useMemo(
    () => visibleVisits.filter((v) => String(v.date || '').slice(0, 10) === todayKey),
    [visibleVisits, todayKey]
  );

  const monthlySeries = useMemo(() => {
    const rows: { key: string; label: string; sales: number; collection: number }[] = [];
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(latestPeriod.year, latestPeriod.month - 1 - offset, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = monthKey(year, month);
      let sales = 0;
      let collection = 0;
      for (const row of visibleTargetRows) {
        if (monthKey(Number(row.year), Number(row.month)) !== key) continue;
        sales += Number(row.salesAchieved) || 0;
        collection += Number(row.collectionAchieved) || 0;
      }
      rows.push({ key, label: MONTHS_AR[month - 1], sales, collection });
    }
    return rows;
  }, [visibleTargetRows, latestPeriod.year, latestPeriod.month]);

  const maxSeries = Math.max(1, ...monthlySeries.map((m) => Math.max(m.sales, m.collection)));

  const tierBuckets = useMemo(() => {
    const buckets = { premium: 0, high: 0, medium: 0, regular: 0 };
    for (const c of visibleCustomers) {
      if (c.tier === 'مميز') buckets.premium++;
      else if (c.tier === 'راقي') buckets.high++;
      else if (c.tier === 'متوسط') buckets.medium++;
      else buckets.regular++;
    }
    return buckets;
  }, [visibleCustomers]);

  const tierTotal = Math.max(1, tierBuckets.premium + tierBuckets.high + tierBuckets.medium + tierBuckets.regular);
  const hasCustomers = visibleCustomers.length > 0;
  const tierSegments = [
    { label: 'مميز A', value: tierBuckets.premium, color: '#2563eb' },
    { label: 'راقي B', value: tierBuckets.high, color: '#10b981' },
    { label: 'متوسط C', value: tierBuckets.medium, color: '#f59e0b' },
    { label: 'عادي', value: tierBuckets.regular, color: '#8b5cf6' },
  ];

  let cursor = 0;
  const donutGradient = tierSegments
    .map((seg) => {
      const start = cursor;
      cursor += (seg.value / tierTotal) * 100;
      return `${seg.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    })
    .join(', ');

  const activities = useMemo(() => {
    const invoiceEvents = [...visibleInvoices]
      .sort((a, b) => String(b.createdAt || `${b.date} ${b.time}`).localeCompare(String(a.createdAt || `${a.date} ${a.time}`)))
      .slice(0, 4)
      .map((inv) => ({
        id: `inv-${inv.id}`,
        title: `طلبية ${inv.invoiceNumber}`,
        detail: `${inv.customerName} — ${fmt(invoiceValue(inv))} ج.م`,
        date: String(inv.date || ''),
        icon: ReceiptText,
        tone: 'blue' as const,
      }));

    const visitEvents = [...visibleVisits]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 2)
      .map((visit) => ({
        id: `visit-${visit.id}`,
        title: 'زيارة عميل',
        detail: `${visit.customerName} — ${visit.status || 'مسجلة'}`,
        date: String(visit.date || ''),
        icon: MapPin,
        tone: 'emerald' as const,
      }));

    return [...invoiceEvents, ...visitEvents]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [visibleInvoices, visibleVisits]);

  const salesPercent = monthSalesTarget > 0 ? Math.round((monthSales / monthSalesTarget) * 100) : 0;
  const collectionPercent = monthCollectionTarget > 0 ? Math.round((monthCollection / monthCollectionTarget) * 100) : 0;
  const displayName = (currentUser?.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'بك';
  const initials = displayName.charAt(0).toUpperCase();

  const kpis = [
    { key: 'sales', label: 'إجمالي المبيعات', value: `${fmt(monthSales)} ج.م`, hint: `${salesPercent}% من مستهدف ${MONTHS_AR[latestPeriod.month - 1]}`, icon: ShoppingCart, tone: 'blue', tab: 'targets' },
    { key: 'collection', label: 'التحصيلات', value: `${fmt(monthCollection)} ج.م`, hint: `${collectionPercent}% من مستهدف التحصيل`, icon: Wallet, tone: 'emerald', tab: 'collection' },
    { key: 'orders', label: 'عدد الطلبات', value: fmt(periodInvoices.length), hint: `${fmt(ordersToday.length)} طلب مسجل اليوم`, icon: PackageSearch, tone: 'amber', tab: 'invoices' },
    { key: 'visits', label: 'الزيارات', value: fmt(periodVisits.length), hint: `${fmt(visitsToday.length)} زيارة اليوم`, icon: MapPin, tone: 'violet', tab: 'visits' },
    { key: 'returns', label: 'المرتجعات', value: fmt(returnsCount), hint: 'طلبيات عليها مرتجع', icon: RotateCcw, tone: 'red', tab: 'returns' },
  ];

  const quickStats = [
    { label: 'إجمالي العملاء', value: fmt(visibleCustomers.length), icon: Users, tone: 'blue' },
    { label: 'طلبات اليوم', value: fmt(ordersToday.length), icon: PackageSearch, tone: 'emerald' },
    { label: 'زيارات اليوم', value: fmt(visitsToday.length), icon: MapPin, tone: 'violet' },
    { label: 'تحصيلات نقدية', value: fmt(periodInvoices.filter((i) => i.paymentMethod === 'نقدي (كاش)').length), icon: CircleDollarSign, tone: 'amber' },
  ];

  const quickActions = [
    { label: 'الكتالوج', icon: Boxes, onClick: () => onNavigate?.('catalog'), primary: true },
    { label: 'قاعدة العملاء', icon: Users, onClick: () => onNavigate?.('customers') },
    { label: 'التارجت', icon: Target, onClick: () => onNavigate?.('targets') },
    { label: 'التحصيلات', icon: Wallet, onClick: () => onNavigate?.('collections') },
  ];

  const avatarBg = AVATAR_COLORS[displayName.length % AVATAR_COLORS.length];

  return (
    <div className="tg-dash" dir="rtl">
      {/* ---------- Hero ---------- */}
      <section className="tg-hero">
        <span className="tg-hero__blob tg-hero__blob--blue" aria-hidden="true" />
        <span className="tg-hero__blob tg-hero__blob--green" aria-hidden="true" />
        <div className="tg-hero__inner">
          <div className="tg-hero__main">
            <div className="tg-chip">
              <Activity size={14} />
              <span>{today.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <div className="tg-hero__head">
              <div className="tg-avatar" style={{ background: avatarBg }}>
                {initials}
              </div>
              <div className="tg-welcome">
                <div className="tg-hero__title">أهلاً بك، {displayName} 👋</div>
                <p className="tg-hero__sub">
                  نظرة سريعة على أدائك في {MONTHS_AR[latestPeriod.month - 1]} {latestPeriod.year} — مبيعاتك وتحصيلاتك وزياراتك في مكان واحد.
                </p>
              </div>
            </div>
            <div className="tg-hero__actions">
              <button type="button" onClick={() => onNavigate?.('catalog')} className="tg-btn">
                <Boxes size={16} />
                تصفح الكتالوج
              </button>
              <button type="button" onClick={() => onNavigate?.('customers')} className="tg-btn tg-btn--ghost">
                <Users size={16} />
                قاعدة العملاء
              </button>
            </div>
          </div>

          <div className="tg-hero__stats">
            <div className="tg-mini">
              <div className="tg-mini__label">تحقيق المبيعات</div>
              <div className="tg-mini__value">
                {salesPercent}%
                <TrendingUp size={15} className="tg-mini__trend" />
              </div>
              <div className="tg-mini__bar">
                <div className="tg-mini__fill" style={{ width: `${Math.min(100, Math.max(0, salesPercent))}%` }} />
              </div>
            </div>
            <div className="tg-mini">
              <div className="tg-mini__label">تحقيق التحصيل</div>
              <div className="tg-mini__value">
                {collectionPercent}%
                <TrendingUp size={15} className="tg-mini__trend tg-mini__trend--blue" />
              </div>
              <div className="tg-mini__bar">
                <div className="tg-mini__fill tg-mini__fill--blue" style={{ width: `${Math.min(100, Math.max(0, collectionPercent))}%` }} />
              </div>
            </div>
            <div className="tg-mini tg-mini--wide">
              <span className="tg-mini__rem-label">متبقي مبيعات الشهر</span>
              <span className="tg-mini__rem-value">{fmt(Math.max(0, monthSalesTarget - monthSales))} ج.م</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- مؤشرات ---------- */}
      <section className="tg-kpis">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button key={kpi.key} type="button" onClick={() => onNavigate?.(kpi.tab)} className={`tg-kpi tg-kpi--${kpi.tone}`}>
              <div className="tg-kpi__top">
                <span className="tg-kpi__icon"><Icon size={20} /></span>
                <ArrowUpRight size={16} className="tg-kpi__arrow" />
              </div>
              <span className="tg-kpi__value">{kpi.value}</span>
              <span className="tg-kpi__label">{kpi.label}</span>
              <span className="tg-kpi__hint">{kpi.hint}</span>
            </button>
          );
        })}
      </section>

      {/* ---------- تحليلات ---------- */}
      <section className="tg-analytics">
        {/* أداء المبيعات */}
        <div className="tg-card tg-analytics__wide">
          <div className="tg-card__head">
            <span className="tg-card__title">أداء المبيعات والتحصيلات — آخر 6 شهور</span>
            <span className="tg-legend-inline">
              <span className="tg-legend-inline__dot tg-legend-inline__dot--sales" /> مبيعات
              <span className="tg-legend-inline__dot tg-legend-inline__dot--collection" /> تحصيلات
            </span>
          </div>
          <div className="tg-chart">
            <div className="tg-chart__bars">
              {monthlySeries.map((m) => {
                const salesH = Math.max(4, Math.round((m.sales / maxSeries) * 100));
                const collectionH = Math.max(4, Math.round((m.collection / maxSeries) * 100));
                return (
                  <div key={m.key} className="tg-chart__col">
                    <div className="tg-chart__pair">
                      <div
                        className="tg-chart__bar tg-chart__bar--sales"
                        style={{ height: `${salesH}%` }}
                        title={`مبيعات ${fmt(m.sales)} ج.م`}
                      />
                      <div
                        className="tg-chart__bar tg-chart__bar--collection"
                        style={{ height: `${collectionH}%` }}
                        title={`تحصيلات ${fmt(m.collection)} ج.م`}
                      />
                    </div>
                    <span className="tg-chart__label">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* توزيع العملاء */}
        <div className="tg-card">
          <div className="tg-card__head">
            <span className="tg-card__title">تصنيف العملاء</span>
            <span className="tg-card__hint">{fmt(visibleCustomers.length)} عميل</span>
          </div>
          <div className="tg-donut-wrap">
            <div
              className="tg-donut"
              style={{ background: hasCustomers ? `conic-gradient(${donutGradient})` : '#e6edf6' }}
            >
              <div className="tg-donut__hole">
                <span className="tg-donut__total">{fmt(visibleCustomers.length)}</span>
                <span className="tg-donut__cap">إجمالي</span>
              </div>
            </div>
            <div className="tg-legend">
              {tierSegments.map((seg) => (
                <div key={seg.label} className="tg-legend__row">
                  <span className="tg-legend__left">
                    <span className="tg-legend__dot" style={{ background: seg.color }} />
                    {seg.label}
                  </span>
                  <span className="tg-legend__val">
                    {hasCustomers ? Math.round((seg.value / tierTotal) * 100) : 0}%
                    <span className="tg-legend__pct"> ({fmt(seg.value)})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* معلومات سريعة */}
        <div className="tg-card">
          <div className="tg-card__head">
            <span className="tg-card__title">معلومات سريعة</span>
            <CalendarCheck size={16} className="tg-card__head-icon" />
          </div>
          <div className="tg-stats">
            {quickStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={`tg-stat tg-stat--${stat.tone}`}>
                  <Icon size={16} />
                  <div className="tg-stat__value">{stat.value}</div>
                  <div className="tg-stat__label">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- الأنشطة + اختصارات ---------- */}
      <section className="tg-dash-bottom">
        <div className="tg-card">
          <div className="tg-card__head">
            <span className="tg-card__title">أحدث الأنشطة</span>
            <button type="button" onClick={() => onNavigate?.('orders')} className="tg-linkbtn">عرض الكل</button>
          </div>
          <div className="tg-act-list">
            {activities.length === 0 ? (
              <div className="tg-empty">لا توجد أنشطة مسجلة بعد</div>
            ) : (
              activities.map((event) => {
                const Icon = event.icon;
                return (
                  <div key={event.id} className="tg-act">
                    <span className={`tg-act__icon${event.tone === 'emerald' ? ' tg-act__icon--emerald' : ''}`}>
                      <Icon size={16} />
                    </span>
                    <div className="tg-act__body">
                      <div className="tg-act__title">{event.title}</div>
                      <div className="tg-act__detail">{event.detail}</div>
                    </div>
                    <span className="tg-act__date">{event.date}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="tg-card">
          <div className="tg-card__head">
            <span className="tg-card__title">اختصارات سريعة</span>
          </div>
          <div className="tg-quick">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={`tg-quick__btn${action.primary ? ' tg-quick__btn--primary' : ''}`}
                >
                  <Icon size={20} />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

export default DreamDeliveryDashboard;
