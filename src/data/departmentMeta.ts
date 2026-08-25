import React from 'react';
import {
  Flower2,
  Crown,
  Sparkles,
  LayoutGrid,
  Coffee,
  CookingPot,
  Gem,
  Award,
  Wine,
  UtensilsCrossed,
  GlassWater,
  ChefHat,
  Orbit,
  Boxes,
  Soup,
  Apple,
  Sun,
  Heart,
  Utensils,
  Wand2,
  Flame,
  Package,
  Layers,
  LucideIcon,
} from 'lucide-react';
import { OFFICIAL_DEPARTMENTS, OfficialDepartment } from '../types';

export interface DepartmentMeta {
  code: OfficialDepartment;
  nameArabic: string;
  shortLabel: string;
  categoryType: 'cookware' | 'glassware' | 'tableware' | 'appliances' | 'cutlery' | 'general';
  icon: LucideIcon;
  colorClasses: {
    bgLight: string;
    border: string;
    text: string;
    badgeBg: string;
    gradient: string;
    accent: string;
  };
  description: string;
  customIconUrl?: string; // Optional Google Drive / Cloudinary direct image URL
}

export const DEPARTMENT_METADATA_MAP: Record<OfficialDepartment, DepartmentMeta> = {
  LHLotus: {
    code: 'LHLotus',
    nameArabic: 'لوتس للأواني المنزلية',
    shortLabel: 'لوتس',
    categoryType: 'cookware',
    icon: Flower2,
    colorClasses: {
      bgLight: 'bg-rose-50',
      border: 'border-rose-300',
      text: 'text-rose-700',
      badgeBg: 'bg-rose-100 text-rose-800',
      gradient: 'from-rose-500 to-pink-600',
      accent: '#e11d48',
    },
    description: 'أطقم أواني طهي وجرانيت لوتس عالي الجودة',
  },
  LHALFA: {
    code: 'LHALFA',
    nameArabic: 'ألفا للأواني والجرانيت',
    shortLabel: 'ألفا',
    categoryType: 'cookware',
    icon: Crown,
    colorClasses: {
      bgLight: 'bg-amber-50',
      border: 'border-amber-300',
      text: 'text-amber-700',
      badgeBg: 'bg-amber-100 text-amber-800',
      gradient: 'from-amber-500 to-yellow-600',
      accent: '#d97706',
    },
    description: 'أطقم حلل وأواني ألفا التركية والممتازة',
  },
  LHDream: {
    code: 'LHDream',
    nameArabic: 'دريم هوم لاين',
    shortLabel: 'دريم LH',
    categoryType: 'tableware',
    icon: Sparkles,
    colorClasses: {
      bgLight: 'bg-yellow-50',
      border: 'border-yellow-400',
      text: 'text-yellow-800',
      badgeBg: 'bg-yellow-100 text-yellow-900',
      gradient: 'from-yellow-500 to-amber-500',
      accent: '#eab308',
    },
    description: 'منتجات دريم هوم الحصرية للأدوات المنزلية والمائدة',
  },
  FHlines: {
    code: 'FHlines',
    nameArabic: 'لاينز أطقم وتشكيلات زجاج',
    shortLabel: 'لاينز',
    categoryType: 'glassware',
    icon: LayoutGrid,
    colorClasses: {
      bgLight: 'bg-sky-50',
      border: 'border-sky-300',
      text: 'text-sky-700',
      badgeBg: 'bg-sky-100 text-sky-800',
      gradient: 'from-sky-500 to-blue-600',
      accent: '#0284c7',
    },
    description: 'تشكيلات خطوط عصرية وزجاجيات أنيقة',
  },
  FHGigilli: {
    code: 'FHGigilli',
    nameArabic: 'جيجيلي زجاجيات وتقديم',
    shortLabel: 'جيجيلي',
    categoryType: 'glassware',
    icon: Coffee,
    colorClasses: {
      bgLight: 'bg-indigo-50',
      border: 'border-indigo-300',
      text: 'text-indigo-700',
      badgeBg: 'bg-indigo-100 text-indigo-800',
      gradient: 'from-indigo-500 to-purple-600',
      accent: '#4f46e5',
    },
    description: 'أطقم شاي، قهوة، وكاسات تقديم فاخرة',
  },
  LHKAZAN: {
    code: 'LHKAZAN',
    nameArabic: 'كازان أواني طهي',
    shortLabel: 'كازان LH',
    categoryType: 'cookware',
    icon: CookingPot,
    colorClasses: {
      bgLight: 'bg-orange-50',
      border: 'border-orange-300',
      text: 'text-orange-700',
      badgeBg: 'bg-orange-100 text-orange-800',
      gradient: 'from-orange-500 to-red-600',
      accent: '#ea580c',
    },
    description: 'أواني طهي كازان العصرية المتينة',
  },
  FHALZA: {
    code: 'FHALZA',
    nameArabic: 'ألزا الإسبانية والمائدة',
    shortLabel: 'ألزا',
    categoryType: 'tableware',
    icon: Gem,
    colorClasses: {
      bgLight: 'bg-emerald-50',
      border: 'border-emerald-300',
      text: 'text-emerald-700',
      badgeBg: 'bg-emerald-100 text-emerald-800',
      gradient: 'from-emerald-500 to-teal-600',
      accent: '#059669',
    },
    description: 'أواني وأدوات تقديم راقية ومتميزة',
  },
  FHDream: {
    code: 'FHDream',
    nameArabic: 'إف إتش دريم زجاج ومائدة',
    shortLabel: 'دريم FH',
    categoryType: 'glassware',
    icon: Award,
    colorClasses: {
      bgLight: 'bg-amber-50',
      border: 'border-amber-400',
      text: 'text-amber-800',
      badgeBg: 'bg-amber-100 text-amber-900',
      gradient: 'from-amber-600 to-yellow-600',
      accent: '#d97706',
    },
    description: 'تشكيلة دريم المتكاملة للزجاجيات والضيافة',
  },
  FHTobaco: {
    code: 'FHTobaco',
    nameArabic: 'توباكو كاسات وزجاج',
    shortLabel: 'توباكو',
    categoryType: 'glassware',
    icon: Wine,
    colorClasses: {
      bgLight: 'bg-purple-50',
      border: 'border-purple-300',
      text: 'text-purple-700',
      badgeBg: 'bg-purple-100 text-purple-800',
      gradient: 'from-purple-500 to-violet-600',
      accent: '#9333ea',
    },
    description: 'أطقم كاسات عصير ومشروبات كريستالية نقية',
  },
  FHGIMYA: {
    code: 'FHGIMYA',
    nameArabic: 'جيميا مائدة وميلامين',
    shortLabel: 'جيميا',
    categoryType: 'tableware',
    icon: UtensilsCrossed,
    colorClasses: {
      bgLight: 'bg-teal-50',
      border: 'border-teal-300',
      text: 'text-teal-700',
      badgeBg: 'bg-teal-100 text-teal-800',
      gradient: 'from-teal-500 to-emerald-600',
      accent: '#0d9488',
    },
    description: 'أطباق وصواني تقديم وميلامين فاخر',
  },
  FHLuminarc: {
    code: 'FHLuminarc',
    nameArabic: 'لومينارك زجاج وأوبال فرنسي',
    shortLabel: 'لومينارك',
    categoryType: 'glassware',
    icon: GlassWater,
    colorClasses: {
      bgLight: 'bg-blue-50',
      border: 'border-blue-300',
      text: 'text-blue-700',
      badgeBg: 'bg-blue-100 text-blue-800',
      gradient: 'from-blue-600 to-cyan-600',
      accent: '#2563eb',
    },
    description: 'أطقم عشاء أوبال وزجاج لومينارك المقاوم للكسر',
  },
  FHMarcato: {
    code: 'FHMarcato',
    nameArabic: 'ماركاتو ماكينات وأدوات مطبخ',
    shortLabel: 'ماركاتو',
    categoryType: 'appliances',
    icon: ChefHat,
    colorClasses: {
      bgLight: 'bg-red-50',
      border: 'border-red-300',
      text: 'text-red-700',
      badgeBg: 'bg-red-100 text-red-800',
      gradient: 'from-red-600 to-rose-600',
      accent: '#dc2626',
    },
    description: 'ماكينات مكرونة وباستا وأدوات مطبخ إيطالية واحترافية',
  },
  LHGalaxy: {
    code: 'LHGalaxy',
    nameArabic: 'جالاكسي جرانيت ومودرن',
    shortLabel: 'جالاكسي',
    categoryType: 'cookware',
    icon: Orbit,
    colorClasses: {
      bgLight: 'bg-violet-50',
      border: 'border-violet-300',
      text: 'text-violet-700',
      badgeBg: 'bg-violet-100 text-violet-800',
      gradient: 'from-violet-600 to-fuchsia-600',
      accent: '#7c3aed',
    },
    description: 'أطقم حلل جرانيت ومقالي غير لاصقة عالية التحمل',
  },
  FHBlinkmax: {
    code: 'FHBlinkmax',
    nameArabic: 'بلينكماكس كريستال وزجاجيات',
    shortLabel: 'بلينكماكس',
    categoryType: 'glassware',
    icon: Boxes,
    colorClasses: {
      bgLight: 'bg-cyan-50',
      border: 'border-cyan-300',
      text: 'text-cyan-700',
      badgeBg: 'bg-cyan-100 text-cyan-800',
      gradient: 'from-cyan-500 to-blue-500',
      accent: '#0891b2',
    },
    description: 'أطقم كاسات، دورق، وبولات كريستال فائقة الشفافية',
  },
  FHDelisoga: {
    code: 'FHDelisoga',
    nameArabic: 'ديليسوجا كاسات وبولات زجاج',
    shortLabel: 'ديليسوجا',
    categoryType: 'glassware',
    icon: Soup,
    colorClasses: {
      bgLight: 'bg-lime-50',
      border: 'border-lime-300',
      text: 'text-lime-700',
      badgeBg: 'bg-lime-100 text-lime-800',
      gradient: 'from-lime-600 to-emerald-600',
      accent: '#65a30d',
    },
    description: 'بولات تقديم، أطقم آيس كريم، وكاسات زجاجية راقية',
  },
  FHGreenApp: {
    code: 'FHGreenApp',
    nameArabic: 'جرين أبل زجاجيات وحافظات',
    shortLabel: 'جرين أبل',
    categoryType: 'glassware',
    icon: Apple,
    colorClasses: {
      bgLight: 'bg-green-50',
      border: 'border-green-300',
      text: 'text-green-700',
      badgeBg: 'bg-green-100 text-green-800',
      gradient: 'from-green-500 to-emerald-600',
      accent: '#16a34a',
    },
    description: 'زجاجيات عملية، قوارير مياه، وحافظات طعام صحية',
  },
  FHCasasunc: {
    code: 'FHCasasunc',
    nameArabic: 'كاسا صن مستلزمات المائدة',
    shortLabel: 'كاسا صن',
    categoryType: 'tableware',
    icon: Sun,
    colorClasses: {
      bgLight: 'bg-orange-50',
      border: 'border-orange-300',
      text: 'text-orange-700',
      badgeBg: 'bg-orange-100 text-orange-800',
      gradient: 'from-orange-500 to-amber-500',
      accent: '#f97316',
    },
    description: 'إكسسوارات مطبخ ومستلزمات مائدة أنيقة ومبهجة',
  },
  FHOlala: {
    code: 'FHOlala',
    nameArabic: 'أولالا أدوات منزلية عصرية',
    shortLabel: 'أولالا',
    categoryType: 'tableware',
    icon: Heart,
    colorClasses: {
      bgLight: 'bg-pink-50',
      border: 'border-pink-300',
      text: 'text-pink-700',
      badgeBg: 'bg-pink-100 text-pink-800',
      gradient: 'from-pink-500 to-rose-500',
      accent: '#ec4899',
    },
    description: 'أدوات تقديم ومستلزمات مطبخ بلمسات أنثوية راقية',
  },
  FHQcocicok: {
    code: 'FHQcocicok',
    nameArabic: 'كوكيسوك سكاكين وأدوات طهي',
    shortLabel: 'كوكيسوك',
    categoryType: 'cutlery',
    icon: Utensils,
    colorClasses: {
      bgLight: 'bg-zinc-50',
      border: 'border-zinc-300',
      text: 'text-zinc-700',
      badgeBg: 'bg-zinc-100 text-zinc-800',
      gradient: 'from-zinc-600 to-slate-800',
      accent: '#52525b',
    },
    description: 'أطقم سكاكين ستانلس ستيل ومقصات ومستلزمات تقطيع',
  },
  FHTesiJesi: {
    code: 'FHTesiJesi',
    nameArabic: 'تيسي جيسي أدوات ذكية',
    shortLabel: 'تيسي جيسي',
    categoryType: 'general',
    icon: Wand2,
    colorClasses: {
      bgLight: 'bg-fuchsia-50',
      border: 'border-fuchsia-300',
      text: 'text-fuchsia-700',
      badgeBg: 'bg-fuchsia-100 text-fuchsia-800',
      gradient: 'from-fuchsia-500 to-purple-600',
      accent: '#c026d3',
    },
    description: 'حلول ذكية وأدوات مبتكرة لتسهيل مهام المطبخ',
  },
  FHKAZAN: {
    code: 'FHKAZAN',
    nameArabic: 'إف إتش كازان أواني وزجاج',
    shortLabel: 'كازان FH',
    categoryType: 'cookware',
    icon: Flame,
    colorClasses: {
      bgLight: 'bg-amber-50',
      border: 'border-amber-300',
      text: 'text-amber-800',
      badgeBg: 'bg-amber-100 text-amber-900',
      gradient: 'from-amber-600 to-orange-600',
      accent: '#d97706',
    },
    description: 'تشكيلة كازان للمائدة وأواني الطهي المتنوعة',
  },
};

/**
 * Helper to get Department metadata safely with fallback
 */
export function getDepartmentMeta(deptName?: string): DepartmentMeta {
  if (!deptName) {
    return {
      code: 'LHDream' as any,
      nameArabic: 'قسم عام',
      shortLabel: 'عام',
      categoryType: 'general',
      icon: Package,
      colorClasses: {
        bgLight: 'bg-slate-50',
        border: 'border-slate-300',
        text: 'text-slate-700',
        badgeBg: 'bg-slate-100 text-slate-800',
        gradient: 'from-slate-600 to-slate-800',
        accent: '#64748b',
      },
      description: 'أصناف متنوعة',
    };
  }

  // Exact match
  if (DEPARTMENT_METADATA_MAP[deptName as OfficialDepartment]) {
    return DEPARTMENT_METADATA_MAP[deptName as OfficialDepartment];
  }

  // Fuzzy match
  const lower = deptName.toLowerCase().trim();
  for (const dept of OFFICIAL_DEPARTMENTS) {
    if (
      dept.toLowerCase() === lower ||
      lower.includes(dept.toLowerCase()) ||
      dept.toLowerCase().includes(lower) ||
      lower.startsWith(dept.slice(0, 3).toLowerCase())
    ) {
      return DEPARTMENT_METADATA_MAP[dept];
    }
  }

  return {
    code: deptName as any,
    nameArabic: deptName,
    shortLabel: deptName,
    categoryType: 'general',
    icon: Package,
    colorClasses: {
      bgLight: 'bg-slate-50',
      border: 'border-slate-300',
      text: 'text-slate-700',
      badgeBg: 'bg-slate-100 text-slate-800',
      gradient: 'from-slate-600 to-slate-800',
      accent: '#64748b',
    },
    description: `أصناف قسم ${deptName}`,
  };
}

/**
 * Returns all 21 departments metadata in order
 */
export function getAllDepartmentsMeta(): DepartmentMeta[] {
  return OFFICIAL_DEPARTMENTS.map((dept) => DEPARTMENT_METADATA_MAP[dept]);
}
