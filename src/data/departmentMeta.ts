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
  ShoppingBag,
  Palette,
  LucideIcon,
} from 'lucide-react';

export interface DepartmentMeta {
  code: string;
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
  customIconUrl?: string;
}

// Preset color palettes for dynamic Arabic item groups
const DYNAMIC_PALETTES = [
  {
    bgLight: 'bg-[var(--app-risk-tint)]',
    border: 'border-[var(--app-risk-line)]',
    text: 'text-[var(--app-risk-text)]',
    badgeBg: 'bg-[var(--app-risk-tint)] text-[var(--app-risk-text)]',
    gradient: 'from-[var(--app-risk)] to-[var(--app-risk)]',
    accent: '#e11d48',
    icon: Flower2,
  },
  {
    bgLight: 'bg-[var(--app-warn-tint)]',
    border: 'border-[var(--app-warn-line)]',
    text: 'text-[var(--app-warn-text)]',
    badgeBg: 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]',
    gradient: 'from-[var(--app-warn)] to-yellow-600',
    accent: '#d97706',
    icon: Crown,
  },
  {
    bgLight: 'bg-yellow-50',
    border: 'border-yellow-400',
    text: 'text-yellow-800',
    badgeBg: 'bg-yellow-100 text-yellow-900',
    gradient: 'from-yellow-500 to-[var(--app-warn)]',
    accent: '#eab308',
    icon: Sparkles,
  },
  {
    bgLight: 'bg-[var(--app-navy-tint)]',
    border: 'border-[var(--app-navy-line)]',
    text: 'text-[var(--app-navy-text)]',
    badgeBg: 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]',
    gradient: 'from-[var(--app-navy)] to-[var(--app-navy)]',
    accent: '#0284c7',
    icon: LayoutGrid,
  },
  {
    bgLight: 'bg-[var(--app-navy-tint)]',
    border: 'border-[var(--app-navy-line)]',
    text: 'text-[var(--app-navy-text)]',
    badgeBg: 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]',
    gradient: 'from-[var(--app-navy)] to-[var(--app-navy)]',
    accent: '#4f46e5',
    icon: Coffee,
  },
  {
    bgLight: 'bg-[var(--app-warn-tint)]',
    border: 'border-[var(--app-warn-line)]',
    text: 'text-[var(--app-warn-text)]',
    badgeBg: 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]',
    gradient: 'from-[var(--app-warn)] to-[var(--app-risk)]',
    accent: '#ea580c',
    icon: CookingPot,
  },
  {
    bgLight: 'bg-[var(--app-ok-tint)]',
    border: 'border-[var(--app-ok-line)]',
    text: 'text-[var(--app-ok-text)]',
    badgeBg: 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)]',
    gradient: 'from-[var(--app-ok)] to-[var(--app-ok)]',
    accent: '#059669',
    icon: Gem,
  },
  {
    bgLight: 'bg-[var(--app-navy-tint)]',
    border: 'border-[var(--app-navy-line)]',
    text: 'text-[var(--app-navy-text)]',
    badgeBg: 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]',
    gradient: 'from-[var(--app-navy)] to-[var(--app-navy)]',
    accent: '#9333ea',
    icon: Award,
  },
  {
    bgLight: 'bg-[var(--app-ok-tint)]',
    border: 'border-[var(--app-ok-line)]',
    text: 'text-[var(--app-ok-text)]',
    badgeBg: 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)]',
    gradient: 'from-[var(--app-ok)] to-[var(--app-navy)]',
    accent: '#0891b2',
    icon: Wine,
  },
  {
    bgLight: 'bg-[var(--app-ok-tint)]',
    border: 'border-[var(--app-ok-line)]',
    text: 'text-[var(--app-ok-text)]',
    badgeBg: 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)]',
    gradient: 'from-[var(--app-ok)] to-[var(--app-ok)]',
    accent: '#0d9488',
    icon: UtensilsCrossed,
  },
  {
    bgLight: 'bg-[var(--app-navy-tint)]',
    border: 'border-[var(--app-navy-line)]',
    text: 'text-[var(--app-navy-text)]',
    badgeBg: 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]',
    gradient: 'from-[var(--app-navy)] to-[var(--app-navy)]',
    accent: '#2563eb',
    icon: GlassWater,
  },
  {
    bgLight: 'bg-[var(--app-navy-tint)]',
    border: 'border-[var(--app-navy-line)]',
    text: 'text-[var(--app-navy-text)]',
    badgeBg: 'bg-[var(--app-navy-tint)] text-[var(--app-navy-text)]',
    gradient: 'from-[var(--app-navy)] to-[var(--app-navy)]',
    accent: '#7c3aed',
    icon: ChefHat,
  },
  {
    bgLight: 'bg-[var(--app-risk-tint)]',
    border: 'border-[var(--app-risk-line)]',
    text: 'text-[var(--app-risk-text)]',
    badgeBg: 'bg-[var(--app-risk-tint)] text-[var(--app-risk-text)]',
    gradient: 'from-[var(--app-risk)] to-[var(--app-risk)]',
    accent: '#c026d3',
    icon: Orbit,
  },
  {
    bgLight: 'bg-[var(--app-risk-tint)]',
    border: 'border-[var(--app-risk-line)]',
    text: 'text-[var(--app-risk-text)]',
    badgeBg: 'bg-[var(--app-risk-tint)] text-[var(--app-risk-text)]',
    gradient: 'from-[var(--app-risk)] to-[var(--app-risk)]',
    accent: '#db2777',
    icon: Sparkles,
  },
  {
    bgLight: 'bg-[var(--app-ok-tint)]',
    border: 'border-[var(--app-ok-line)]',
    text: 'text-[var(--app-ok-text)]',
    badgeBg: 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)]',
    gradient: 'from-[var(--app-ok)] to-[var(--app-ok)]',
    accent: '#65a30d',
    icon: Apple,
  },
  {
    bgLight: 'bg-[var(--app-warn-tint)]',
    border: 'border-[var(--app-warn-line)]',
    text: 'text-[var(--app-warn-text)]',
    badgeBg: 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]',
    gradient: 'from-[var(--app-warn)] to-[var(--app-warn)]',
    accent: '#d97706',
    icon: Sun,
  },
];

// Hash function to consistently map any Arabic string to a palette
function hashStringToIndex(str: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % max;
}

/**
 * Known Arabic keywords mapping to specific icons and category types
 */
function detectCategoryTypeAndIcon(name: string): { type: DepartmentMeta['categoryType']; icon: LucideIcon } {
  const n = name.toLowerCase();

  if (n.includes('طهي') || n.includes('حلل') || n.includes('جرانيت') || n.includes('كازان') || n.includes('أواني') || n.includes('اواني') || n.includes('صواني') || n.includes('طاسات') || n.includes('لوتس') || n.includes('ألفا')) {
    return { type: 'cookware', icon: CookingPot };
  }
  if (n.includes('زجاج') || n.includes('كاسات') || n.includes('شاي') || n.includes('قهوة') || n.includes('لاينز') || n.includes('جيجيلي') || n.includes('لومينارك') || n.includes('بلينك') || n.includes('ديليزوجا') || n.includes('عصير')) {
    return { type: 'glassware', icon: GlassWater };
  }
  if (n.includes('مائدة') || n.includes('سفرة') || n.includes('دريم') || n.includes('ألزا') || n.includes('تقديم') || n.includes('أطقم') || n.includes('اطقم') || n.includes('صيني') || n.includes('اركوبال') || n.includes('بيركس')) {
    return { type: 'tableware', icon: Gem };
  }
  if (n.includes('معالق') || n.includes('شوك') || n.includes('سكاكين') || n.includes('ماركاتو') || n.includes('توزيع')) {
    return { type: 'cutlery', icon: UtensilsCrossed };
  }
  if (n.includes('أجهزة') || n.includes('اجهزة') || n.includes('كهرباء') || n.includes('خلاط') || n.includes('غلاية')) {
    return { type: 'appliances', icon: Sparkles };
  }

  return { type: 'general', icon: Package };
}

/**
 * Dynamically resolves metadata for ANY Arabic group name from the sheet
 */
export function getDepartmentMeta(deptName?: string): DepartmentMeta {
  if (!deptName || deptName === 'الكل' || deptName === 'عام') {
    return {
      code: deptName || 'الكل',
      nameArabic: deptName === 'الكل' ? 'كل المجموعات' : 'عام',
      shortLabel: deptName === 'الكل' ? 'الكل' : 'عام',
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
      description: 'جميع الأصناف والمجموعات',
    };
  }

  const cleanName = deptName.trim();
  const paletteIndex = hashStringToIndex(cleanName, DYNAMIC_PALETTES.length);
  const palette = DYNAMIC_PALETTES[paletteIndex];
  const { type, icon } = detectCategoryTypeAndIcon(cleanName);

  return {
    code: cleanName,
    nameArabic: cleanName,
    shortLabel: cleanName.length > 16 ? cleanName.slice(0, 14) + '..' : cleanName,
    categoryType: type,
    icon: icon || palette.icon || Package,
    colorClasses: {
      bgLight: palette.bgLight,
      border: palette.border,
      text: palette.text,
      badgeBg: palette.badgeBg,
      gradient: palette.gradient,
      accent: palette.accent,
    },
    description: `مجموعة ${cleanName}`,
  };
}
