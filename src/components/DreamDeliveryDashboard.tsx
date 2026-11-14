import React, { useMemo } from 'react';
import {
  ShoppingCart, Wallet, PackageSearch, MapPin, RotateCcw, TrendingUp,
  Users, Target, CalendarCheck, ReceiptText,
  Activity, Boxes, Flame,
  Sparkles, CreditCard, AlertTriangle, Coins, ArrowLeft, Tag,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { filterPromotionsForUser } from '../services/promotionService';
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

export const DreamDeliveryDashboard: React.FC<DreamDeliveryDashboardProps> = ({ onNavigate }) => {
  const {
    currentUser,
    invoices,
    customers,
    visibleVisits,
    targets,
    promotions,
    products,
    getVisibleInvoices,
    getVisibleCustomers,
    getVisibleTargets,
  } = useApp();

  const visibleInvoices = useMemo(() => getVisibleInvoices(), [invoices, currentUser?.id, currentUser?.role, currentUser?.branchName]);
  const visibleCustomers = useMemo(() => getVisibleCustomers(), [customers, currentUser?.id, currentUser?.role, currentUser?.branchName]);
  const visibleTargetRows = useMemo(() => getVisibleTargets(), [targets, currentUser?.id, currentUser?.role, currentUser?.branchName]);

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

  const salesPercent = monthSalesTarget > 0 ? Math.round((monthSales / monthSalesTarget) * 100) : 0;
  const collectionPercent = monthCollectionTarget > 0 ? Math.round((monthCollection / monthCollectionTarget) * 100) : 0;
  const salesRemaining = Math.max(0, monthSalesTarget - monthSales);
  const collectionRemaining = Math.max(0, monthCollectionTarget - monthCollection);

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

  const promoSummary = useMemo(() => {
    const scoped = filterPromotionsForUser(promotions, currentUser, products);
    const active = scoped.filter((p) => p.status !== 'منتهي');
    const maxDiscount = active.reduce((mx, p) => Math.max(mx, Number(p.discountPercentage || 0)), 0);
    return {
      count: active.length,
      maxDiscount: Math.round(maxDiscount),
    };
  }, [promotions, currentUser, products]);

  const totalDebt = visibleCustomers.reduce((sum, c) => sum + (Number(c.currentBalance ?? c.balance ?? 0) || 0), 0);
  const totalReceivable = visibleCustomers.reduce((sum, c) => sum + (Number(c.creditLimit ?? 0) || 0), 0);
  const totalCollectedToday = periodVisits
    .filter((v) => String(v.date || '').slice(0, 10) === todayKey && v.collectedAmount)
    .reduce((sum, v) => sum + (v.collectedAmount || 0), 0);
  const totalSalesToday = ordersToday.reduce((sum, inv) => sum + invoiceValue(inv), 0);

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

  const displayName = (currentUser?.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'بك';
  const initials = displayName.charAt(0).toUpperCase();

  const quickActions = [
    { label: 'الكتالوج', icon: Boxes, onClick: () => onNavigate?.('catalog'), primary: true },
    { label: 'قاعدة العملاء', icon: Users, onClick: () => onNavigate?.('customers') },
    { label: 'التارجت', icon: Target, onClick: () => onNavigate?.('targets') },
    { label: 'التحصيلات', icon: Wallet, onClick: () => onNavigate?.('collections') },
  ];

  const AVATAR_COLORS = ['#3b82f6', '#059669', '#d97706', '#7c3aed', '#e11d48'];
  const avatarBg = AVATAR_COLORS[displayName.length % AVATAR_COLORS.length];

  return (
    <div className="tg-dash" dir="rtl">
      {/* ---------- كارت مبيعات اليوم (موبايل) — زي المرجع ---------- */}
      <section className="tg-daycard lg:hidden">
        <span className="tg-daycard__glow" aria-hidden="true" />
        <div className="tg-daycard__row">
          <div className="min-w-0">
            <span className="tg-daycard__label">مبيعات اليوم</span>
            <span className="tg-daycard__value tg-num">
              {fmt(totalSalesToday)} <span className="tg-daycard__unit">ج.م</span>
            </span>
          </div>
          <TrendingUp size={46} className="tg-daycard__chart" aria-hidden="true" />
        </div>
        <div className="tg-daycard__foot">
          <span className="tg-daycard__chip">
            <TrendingUp size={13} />
            <span className="tg-num">{salesPercent}%</span>
          </span>
          <span className="tg-daycard__sub">
            تحصيل اليوم: <b className="tg-num">{fmt(totalCollectedToday)}</b> ج.م
          </span>
        </div>
      </section>

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
              <span className="tg-mini__rem-value">{fmt(salesRemaining)} ج.م</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- بانر عروض دريم طنطاوي ---------- */}
      <button
        type="button"
        onClick={() => onNavigate?.('offers')}
        className="tg-offers-banner"
      >
        <div className="tg-offers-banner__inner">
          <div className="tg-offers-banner__icon" aria-hidden="true">
            <Flame size={22} />
          </div>
          <div className="tg-offers-banner__body">
            <div className="tg-offers-banner__top">
              <span className="tg-offers-banner__title">عروض دريم طنطاوي</span>
              <span className="tg-special-discount-badge">
                <Tag size={11} />
                خصم خاص
              </span>
              {promoSummary.count > 0 && (
                <span className="tg-offers-banner__count">
                  {promoSummary.count} عرض نشط
                  {promoSummary.maxDiscount > 0 ? ` • حتى ${promoSummary.maxDiscount}%` : ''}
                </span>
              )}
            </div>
            <p className="tg-offers-banner__sub">
              {promoSummary.count > 0
                ? 'اضغط هنا لفتح صفحة العروض واستعراض الأصناف المشمولة بالخصم الخاص المرتبط بأكواد المنتجات'
                : 'اضغط لفتح مركز العروض والخصومات لمتابعة أحدث عروض دريم طنطاوي المربوطة بكود الصنف'}
            </p>
          </div>
          <span className="tg-offers-banner__cta whitespace-nowrap shrink-0">
            <Sparkles size={14} />
            تصفح العروض
            <ArrowLeft size={14} />
          </span>
        </div>
      </button>

      {/* ---------- كروت الأهداف الأربعة (مديونيات، مستحقات، تارجت بيع، تارجت تحصيل) ---------- */}
      <section className="tg-target-row">
        <div className="tg-target-card tg-target-card--debt">
          <div className="tg-target__icon"><CreditCard size={20} className="text-red-500" /></div>
          <div className="tg-target__value">{fmt(totalDebt)} ج.م</div>
          <div className="tg-target__label">مديونيات العملاء</div>
          <div className="tg-target__sub">إجمالي الرصيد القائم على العملاء</div>
        </div>
        <div className="tg-target-card tg-target-card--receivable">
          <div className="tg-target__icon"><Coins size={20} className="text-emerald-500" /></div>
          <div className="tg-target__value">{fmt(totalReceivable)} ج.م</div>
          <div className="tg-target__label">مستحقات العملاء</div>
          <div className="tg-target__sub">إجمالي سقف الائتمان الممنوح</div>
        </div>
        <div className="tg-target-card tg-target-card--sales">
          <div className="tg-target__icon"><ShoppingCart size={20} className="text-blue-500" /></div>
          <div className="tg-target__value">{fmt(monthSales)} ج.م</div>
          <div className="tg-target__label">تارجت البيع — المحقق</div>
          <div className="tg-target__sub">
            من {fmt(monthSalesTarget)} ج.م — {salesPercent}%
            <span className={`tg-target__pct ${salesPercent >= 80 ? 'text-emerald-600' : salesPercent >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {salesPercent >= 80 ? 'ممتاز' : salesPercent >= 50 ? 'جيد' : 'يحتاج تحسين'}
            </span>
          </div>
        </div>
        <div className="tg-target-card tg-target-card--collection">
          <div className="tg-target__icon"><Wallet size={20} className="text-purple-500" /></div>
          <div className="tg-target__value">{fmt(monthCollection)} ج.م</div>
          <div className="tg-target__label">تارجت التحصيل — المحقق</div>
          <div className="tg-target__sub">
            من {fmt(monthCollectionTarget)} ج.م — {collectionPercent}%
            <span className={`tg-target__pct ${collectionPercent >= 80 ? 'text-emerald-600' : collectionPercent >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {collectionPercent >= 80 ? 'ممتاز' : collectionPercent >= 50 ? 'جيد' : 'يحتاج تحسين'}
            </span>
          </div>
        </div>
      </section>

      {/* ---------- كروت الأداء السريع (أداء اليوم) ---------- */}
      <section className="tg-quick-row">
        <div className="tg-quick-card">
          <div className="tg-q__icon"><CalendarCheck size={18} className="text-blue-500" /></div>
          <div className="tg-q__body">
            <div className="tg-q__label">أداء اليوم</div>
            <div className="tg-q__value">{today.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric' })}</div>
            <div className="tg-q__sub">مبيعات اليوم: {fmt(totalSalesToday)} ج.م • تحصيل اليوم: {fmt(totalCollectedToday)} ج.م</div>
          </div>
        </div>
        <div className="tg-quick-card">
          <div className="tg-q__icon"><ShoppingCart size={18} className="text-emerald-500" /></div>
          <div className="tg-q__body">
            <div className="tg-q__label">طلبات اليوم</div>
            <div className="tg-q__value">{fmt(ordersToday.length)}</div>
            <div className="tg-q__sub">طلبية مسجلة في {todayKey}</div>
          </div>
        </div>
        <div className="tg-quick-card">
          <div className="tg-q__icon"><MapPin size={18} className="text-violet-500" /></div>
          <div className="tg-q__body">
            <div className="tg-q__label">زيارات اليوم</div>
            <div className="tg-q__value">{fmt(visitsToday.length)}</div>
            <div className="tg-q__sub">زيارات منفذة اليوم</div>
          </div>
        </div>
        <div className="tg-quick-card">
          <div className="tg-q__icon"><AlertTriangle size={18} className="text-amber-500" /></div>
          <div className="tg-q__body">
            <div className="tg-q__label">المرتجعات</div>
            <div className="tg-q__value">{fmt(returnsCount)}</div>
            <div className="tg-q__sub">طلبيات عليها مرتجع هذا الشهر</div>
          </div>
        </div>
      </section>

      {/* ---------- تحليلات ---------- */}
      <section className="tg-analytics">
        {/* أداء المبيعات والتحصيلات — آخر 6 شهور */}
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

        {/* معلومات سريعة إضافية */}
        <div className="tg-card">
          <div className="tg-card__head">
            <span className="tg-card__title">معلومات سريعة</span>
            <CalendarCheck size={16} className="tg-card__head-icon" />
          </div>
          <div className="tg-stats">
            {[
              { label: 'مبيعات الشهر', value: `${fmt(monthSales)} ج.م`, icon: ShoppingCart, tone: 'blue', sub: `من ${fmt(monthSalesTarget)}` },
              { label: 'تحصيلات الشهر', value: `${fmt(monthCollection)} ج.م`, icon: Wallet, tone: 'emerald', sub: `من ${fmt(monthCollectionTarget)}` },
              { label: 'مرتجعات العملاء', value: fmt(returnsCount), icon: RotateCcw, tone: 'red', sub: 'هذا الشهر' },
              { label: 'أوامر البيع', value: fmt(periodInvoices.length), icon: PackageSearch, tone: 'violet', sub: 'هذا الشهر' },
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={`tg-stat tg-stat--${stat.tone} tg-stat--colored`}>
                  <Icon size={16} />
                  <div className="tg-stat__body">
                    <div className="tg-stat__value">{stat.value}</div>
                    <div className="tg-stat__label">{stat.label}</div>
                    {stat.sub && <div className="tg-stat__sub">{stat.sub}</div>}
                  </div>
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
