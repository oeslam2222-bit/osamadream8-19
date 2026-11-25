import React from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * النغمات المتاحة لكارت المؤشر — كل نغمة ليها توكنز `--kpi-*` في theme-tokens.css
 * (sales / collection / due / debt / warn / promo / visits) وكلها بتشتغل بنفس الشكل في
 * الوضع النهاري والليلي، لأن نص الكارت أبيض على تدرّج ملوّن.
 */
export type KpiTone = 'sales' | 'collection' | 'due' | 'debt' | 'warn' | 'promo' | 'visits';

export interface KpiCardProps {
  /** نغمة اللون (كل نغمة = تدرّج كامل + نص أبيض) */
  tone: KpiTone;
  /** عنوان المؤشر — نص ظاهر، مش اللون وحده */
  label: React.ReactNode;
  /** الرقم الأساسي (منسّق مسبقًا أو رقم) */
  value: React.ReactNode;
  /** الوحدة: ج.م / فاتورة / زيارة ... */
  unit?: React.ReactNode;
  /** سطر توضيحي تحت الرقم: المستهدف / الفترة / التفاصيل */
  meta?: React.ReactNode;
  /** نسبة 0–100 لشريط التقدم الأبيض. لو مش موجود مفيش شريط */
  progress?: number | null;
  /** أيقونة داخل مربع أبيض شفاف */
  icon?: React.ReactNode;
  /** شارة pill شفافة في الفوتر */
  badge?: React.ReactNode;
  /** عنصر إضافي في الفوتر (بدل/جنب الشارة) */
  footer?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** إظهار شريط التقدم حتى لو القيمة مش number (لللايف عرض) */
  showProgress?: boolean;
}

/**
 * يضبط عرض شريط التقدم بناءً على عرض الكارت (موبايل vs ويب)
 * كارت الموبايل يكون شريطه أرق وأقل ارتفاعاً لي conserve المساحة
 */
const progressHeight = (isMobile: boolean) => (isMobile ? '1.5' : '2.5');
const progressBorderRadius = (isMobile: boolean) => (isMobile ? '0.75' : '1.25');

/** كارت مؤشر موحّد لكل الشاشات: تدرّج ملوّن كامل + نص أبيض + أيقونة + شريط تقدم + شارة. */
export const KpiCard: React.FC<KpiCardProps> = ({
  tone,
  label,
  value,
  unit,
  meta,
  progress,
  icon,
  badge,
  footer,
  className = '',
  onClick,
  showProgress = false,
}) => {
  // كشف الموبايل بناءً على العرض الفعلي + user agent
  const isMobile =
    /mobile|android|webOS|iPhone|iPad|iPod/.test(navigator.userAgent) ||
    document.documentElement.clientWidth < 768;

  // نقاط الكسر للمقايس—Determines card grid columns per screen size
  const bpMobile = 640;
  const bpTablet = 1024;
  const bpDesktop = 1280;
  const currentWidth = document.documentElement.clientWidth;
  const isBpMobile = currentWidth < bpMobile;
  const isBpTablet = currentWidth >= bpMobile && currentWidth < bpTablet;
  const isBpDesktop = currentWidth >= bpDesktop;

  // أحجام ومسافات مُحسّنة للموبايل
  const cardPadding = isMobile ? 'p-3 sm:p-4' : 'p-4 sm:p-5';
  const cardRadius = isMobile ? 'rounded-2xl' : 'rounded-3xl';
  const headPadding = isMobile ? 'p-2' : 'p-3';
  const valueFontSize = isMobile ? 'text-xl' : 'text-2xl';
  const smallFontSize = isMobile ? 'text-[10px]' : 'text-[11px]';
  const progressHeightVal = progressHeight(isMobile);
  const borderRadiusVal = progressBorderRadius(isMobile);

  // عدد الأعمدة بناءً على نقطة الكسر—يتغير حسب عرض الشاشة
  const gridCols = isBpMobile ? 1 : isBpTablet ? 2 : 3;
  const gridGap = isBpMobile ? 'gap-2' : isBpTablet ? 'gap-3' : 'gap-4';
  const gridChildGap = isBpMobile ? 'gap-y-2' : isBpTablet ? 'gap-y-3' : 'gap-y-4';

  const body = (
    < >
      <div className={`kpi-card__head ${cardRadius} ${cardPadding} bg-[var(--app-card-secondary)] shadow-sm`}>
        <span className="kpi-card__label">{label}</span>
        {icon ? (
          <span className="kpi-card__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>

      <div className={`kpi-card__value ${cardRadius} ${cardPadding} flex-1 flex items-center justify-center`}
        style={{ minHeight: isMobile ? '36px' : '48px' }}
      >
        <span className={valueFontSize} style={{ color: 'var(--app-text)' }}>
          {value}
        </span>
        {unit ? (
          <span className="text-[10px] sm:text-[11px] ml-1" style={{ color: 'var(--app-text-muted)' }}>
            {unit}
          </span>
        ) : null}
      </div>

      {meta ? (
        <div className={`kpi-card__meta ${cardRadius} ${cardPadding} text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-1`}
          style={{ minHeight: isMobile ? '24px' : '32px' }}
        >
          {meta}
        </div>
      ) : null}

      {showProgress || typeof progress === 'number' ? (
        <div
          className={`kpi-card__progress ${cardRadius} mt-2`
            + (isMobile ? ' mb-2' : ' mb-3')}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={typeof progress === 'number' && Number.isFinite(progress) ? clampPct(progress) : 0}
          aria-label="نسبة التحقيق"
          style={{ height: progressHeightVal }}
        >
          <span
            className="kpi-card__progress-fill"
            style={{
              width: typeof progress === 'number' && Number.isFinite(progress) ? `${clampPct(progress)}%` : '0%',
              height: progressHeightVal,
              borderRadius: isMobile ? '0.75rem' : '1.25rem',
              background: isMobile ? 'var(--app-primary)' : 'var(--app-primary)',
            }}
          />
          {showProgress && (
            <span
              className="absolute right-0 top-0 h-full w-px"
              style={{
                background: isMobile ? 'var(--app-sidebar)' : 'var(--app-sidebar)',
                borderRadius: isMobile ? '0.75rem' : '1.25rem',
              }}
            />
          )}
        </div>
      ) : null}

      {badge || footer ? (
        <div className={`kpi-card__foot ${cardRadius} ${cardPadding} flex items-center justify-between pt-2`}
          style={{ paddingTop: isMobile ? '8px' : '12px' }}
        >
          {badge ? (
            <span className="kpi-card__badge text-[10px] sm:text-[11px] font-medium">
              {badge}
            </span>
          ) : null}
          {footer ?? (onClick ? (
            <button
              type="button"
              className={`text-[var(--app-primary)] hover:underline text-[${isMobile ? '10px' : '11px'}] font-bold flex items-center gap-1 transition-colors`}
              onClick={onClick}
            >
              {onClick ? 'عرض التفاصيل' : ''}
              <ChevronRight className="w-3 h-3" />
            </button>
          ) : null)}
        </div>
      ) : null}
    </ >
  );

  const classes = `kpi-card kpi-card--${tone} ${className}`.trim();

  if (onClick) {
    return (
      <button type="button" className={`${classes} kpi-card--action`} onClick={onClick}>
        {body}
      </button>
    );
  }

  return <article className={classes}>{body}</article>;
};

export default KpiCard;

const clampPct = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
};