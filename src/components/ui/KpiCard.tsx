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
}

const clampPct = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
};

/**
 * كارت مؤشر موحّد لكل الشاشات: تدرّج ملوّن كامل + نص أبيض + أيقونة + شريط تقدم + شارة.
 * الشكل مضبوط بـ `.kpi-card` في `src/styles/kpi-cards.css` (بدون !important).
 */
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
}) => {
  const hasProgress = typeof progress === 'number' && Number.isFinite(progress);
  const pct = hasProgress ? clampPct(progress as number) : 0;

  const body = (
    <>
      <div className="kpi-card__head">
        <span className="kpi-card__label">{label}</span>
        {icon ? (
          <span className="kpi-card__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>

      <div className="kpi-card__value">
        <span className="kpi-card__number">{value}</span>
        {unit ? <span className="kpi-card__unit">{unit}</span> : null}
      </div>

      {meta ? <div className="kpi-card__meta">{meta}</div> : null}

      {hasProgress ? (
        <div
          className="kpi-card__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="نسبة التحقيق"
        >
          <span className="kpi-card__progress-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      {badge || footer ? (
        <div className="kpi-card__foot">
          {badge ? <span className="kpi-card__badge">{badge}</span> : <span />}
          {footer ?? (onClick ? <ChevronLeft className="kpi-card__chevron" aria-hidden="true" /> : null)}
        </div>
      ) : null}
    </>
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
