import { useThemeSafe } from '../context/themeContext';

/**
 * باليتة موحّدة للرسوم البيانية في وضعَي النهار والليل.
 *
 * الصفحة كانت مرسومة بألوان ثابتة (خطوط الشبكة الرمادية + نصوص أغمق)
 * فتبقى "مسطحة" في الوضع الليلي. هنا بنطلع ألوان كل رسم من حالة الثيم
 * الحالية عشان الكونتراست يفضل سليم في الوضعين.
 */
export interface ChartTheme {
  isDark: boolean;
  /** خطوط شبكة المحور */
  grid: string;
  /** خط المحور */
  axis: string;
  /** نص التدرّج (ticks) */
  tick: string;
  /** نص تدرّج ثانوي أخف */
  tickMuted: string;
  /** لون العمود الأساسي */
  bar: string;
  /** لون العمود المميّز (الأول / الاختيار الحالي) */
  barAlt: string;
  /** لون أعمدة الخلفية/الأقل أهمية */
  barMuted: string;
  /** خلفية مؤشر التمرير فوق الأعمدة */
  cursor: string;
  /** نص القيمة فوق العمود */
  label: string;
  /* Tooltip */
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipMuted: string;
  tooltipAccent: string;
  /** حد الشرائح في الرسوم الدائرية */
  pieStroke: string;
}

const LIGHT: ChartTheme = {
  isDark: false,
  grid: '#eef3f8',
  axis: '#e2e8f0',
  tick: '#64748b',
  tickMuted: '#94a3b8',
  bar: '#102b4e',
  barAlt: '#c99a43',
  barMuted: '#cbd5e1',
  cursor: 'rgba(16,43,78,0.06)',
  label: '#334155',
  tooltipBg: '#0f172a',
  tooltipBorder: '#1e293b',
  tooltipText: '#f8fafc',
  tooltipMuted: '#94a3b8',
  tooltipAccent: '#f0b429',
  pieStroke: '#ffffff'
};

const DARK: ChartTheme = {
  isDark: true,
  grid: '#1E4D63',
  axis: '#1E4D63',
  tick: '#94A3B8',
  tickMuted: '#64748B',
  bar: '#5B9BD5',
  barAlt: '#E0B45C',
  barMuted: '#33566B',
  cursor: 'rgba(255,255,255,0.06)',
  label: '#F8FAFC',
  tooltipBg: '#0A1E27',
  tooltipBorder: '#1E4D63',
  tooltipText: '#F8FAFC',
  tooltipMuted: '#94A3B8',
  tooltipAccent: '#E0B45C',
  pieStroke: '#0A1E27'
};

export function useChartTheme(): ChartTheme {
  const { isDark } = useThemeSafe();
  return isDark ? DARK : LIGHT;
}
