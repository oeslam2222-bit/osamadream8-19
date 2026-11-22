import React, { useId } from 'react';

/**
 * مؤشر أداء (Gauge) — طبقة عرض موحّدة لكل الشاشات.
 * - PerformanceGauge: عدّاد قوسي كبير للرقم الرئيسي في كارت.
 * - MiniGauge: حلقة صغيرة للصفوف/الكروت المضغوطة.
 * التصميم مبني بأنماط inline عن قصد: المكوّن بيشتغل في أي مكان حتى لو مفيش Tailwind،
 * ومابيتأثرش بأي class خارجي (اسم/ترتيب CSS).
 * الألوان متدرّجة دلاليًا: أخضر (ممتاز) → أزرق (جيد جدًا) → عنبري (جيد/يحتاج دفع) → أحمر (متعثر).
 */

export interface GaugeTone {
  key: 'elite' | 'great' | 'good' | 'watch' | 'risk';
  label: string;
  from: string;
  to: string;
  /** لون مسطّح للاستخدام في النصوص أو الحلقات الصغيرة */
  solid: string;
  /** لون خلفية خفيف للشارات */
  soft: string;
}

const TONES: GaugeTone[] = [
  { key: 'elite', label: 'ممتاز', from: '#047857', to: '#34d399', solid: '#059669', soft: 'rgba(5,150,105,0.12)' },
  { key: 'great', label: 'جيد جدًا', from: '#1d4ed8', to: '#60a5fa', solid: '#2563eb', soft: 'rgba(37,99,235,0.12)' },
  { key: 'good', label: 'جيد', from: '#b45309', to: '#fbbf24', solid: '#d97706', soft: 'rgba(217,119,6,0.12)' },
  { key: 'watch', label: 'يحتاج دفع', from: '#c2410c', to: '#fb923c', solid: '#ea580c', soft: 'rgba(234,88,12,0.12)' },
  { key: 'risk', label: 'متعثر', from: '#be123c', to: '#fb7185', solid: '#e11d48', soft: 'rgba(225,29,72,0.12)' },
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** يختار درجة اللون من النسبة. invert = للمقاييس اللي الأقل فيها أفضل (زي التركيز). */
export const gaugeTone = (value: number, invert = false): GaugeTone => {
  const v = invert ? 100 - clamp(value, 0, 100) : value;
  if (v >= 100) return TONES[0];
  if (v >= 80) return TONES[1];
  if (v >= 60) return TONES[2];
  if (v >= 40) return TONES[3];
  return TONES[4];
};

interface PerformanceGaugeProps {
  value: number;
  label?: string;
  caption?: string;
  /** قطر القوس بالبكسل (الافتراضي 168) */
  size?: number;
  /** للمقاييس اللي الأقل فيها أفضل */
  invert?: boolean;
}

export const PerformanceGauge: React.FC<PerformanceGaugeProps> = ({
  value,
  label,
  caption,
  size = 168,
  invert = false,
}) => {
  const gid = `gauge-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const tone = gaugeTone(value, invert);
  const pct = clamp(value, 0, 100);

  const R = 46;
  const circumference = 2 * Math.PI * R;
  const sweep = 0.75; // 270°
  const track = circumference * sweep;
  const filled = track * (pct / 100);
  const height = Math.round(size * 0.84);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ position: 'relative', width: size, height }}>
        <svg viewBox="0 0 120 104" width={size} height={height} aria-hidden="true" style={{ display: 'block' }}>
          <defs>
            <linearGradient id={gid} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={tone.from} />
              <stop offset="100%" stopColor={tone.to} />
            </linearGradient>
          </defs>
          <g transform="rotate(135 60 56)">
            <circle
              cx="60"
              cy="56"
              r={R}
              fill="none"
              stroke="var(--app-border)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${track} ${circumference}`}
              opacity="0.85"
            />
            <circle
              cx="60"
              cy="56"
              r={R}
              fill="none"
              stroke={`url(#${gid})`}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          </g>
          {[25, 50, 75].map((m) => {
            const angle = (135 + (m / 100) * 270) * (Math.PI / 180);
            const x1 = 60 + Math.cos(angle) * (R - 8.5);
            const y1 = 56 + Math.sin(angle) * (R - 8.5);
            const x2 = 60 + Math.cos(angle) * (R + 8.5);
            const y2 = 56 + Math.sin(angle) * (R + 8.5);
            return <line key={m} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--app-border)" strokeWidth="1.4" />;
          })}
        </svg>

        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: height * 0.12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', lineHeight: 1, direction: 'ltr' }}>
            <span
              style={{
                fontSize: Math.round(size * 0.2),
                fontWeight: 900,
                color: 'var(--app-text)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.5px',
              }}
            >
              {Math.round(value)}
            </span>
            <span style={{ marginTop: Math.round(size * 0.03), fontSize: Math.round(size * 0.08), fontWeight: 900, color: tone.solid }}>
              %
            </span>
          </div>
          <span
            style={{
              marginTop: 6,
              borderRadius: 999,
              padding: '3px 9px',
              fontSize: 10,
              fontWeight: 900,
              background: tone.soft,
              color: tone.solid,
              whiteSpace: 'nowrap',
            }}
          >
            {label ?? tone.label}
          </span>
        </div>
      </div>

      {caption && (
        <p
          style={{
            margin: '6px 0 0',
            maxWidth: Math.max(170, size),
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.6,
            color: 'var(--app-text-muted)',
          }}
        >
          {caption}
        </p>
      )}
    </div>
  );
};

interface MiniGaugeProps {
  value: number;
  size?: number;
  invert?: boolean;
  title?: string;
  showValue?: boolean;
}

export const MiniGauge: React.FC<MiniGaugeProps> = ({ value, size = 46, invert = false, title, showValue = true }) => {
  const tone = gaugeTone(value, invert);
  const pct = clamp(value, 0, 100);
  return (
    <span
      title={title ?? `${Math.round(value)}% — ${tone.label}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        background: `conic-gradient(${tone.solid} ${pct * 3.6}deg, var(--app-border) 0deg)`,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size - 10,
          height: size - 10,
          borderRadius: '50%',
          background: 'var(--app-card)',
          fontSize: Math.round(size * 0.27),
          fontWeight: 900,
          color: tone.solid,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {showValue ? Math.round(value) : ''}
      </span>
    </span>
  );
};

export default PerformanceGauge;
