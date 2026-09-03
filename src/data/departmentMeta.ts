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
    bgLight: 'bg-rose-50',
    border: 'border-rose-300',
    text: 'text-rose-700',
    badgeBg: 'bg-rose-100 text-rose-800',
    gradient: 'from-rose-500 to-pink-600',
    accent: '#e11d48',
    icon: Flower2,
  },
  {
    bgLight: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-700',
    badgeBg: 'bg-amber-100 text-amber-800',
    gradient: 'from-amber-500 to-yellow-600',
    accent: '#d97706',
    icon: Crown,
  },
  {
    bgLight: 'bg-yellow-50',
    border: 'border-yellow-400',
    text: 'text-yellow-800',
    badgeBg: 'bg-yellow-100 text-yellow-900',
    gradient: 'from-yellow-500 to-amber-500',
    accent: '#eab308',
    icon: Sparkles,
  },
  {
    bgLight: 'bg-sky-50',
    border: 'border-sky-300',
    text: 'text-sky-700',
    badgeBg: 'bg-sky-100 text-sky-800',
    gradient: 'from-sky-500 to-blue-600',
    accent: '#0284c7',
    icon: LayoutGrid,
  },
  {
    bgLight: 'bg-indigo-50',
    border: 'border-indigo-300',
    text: 'text-indigo-700',
    badgeBg: 'bg-indigo-100 text-indigo-800',
    gradient: 'from-indigo-500 to-purple-600',
    accent: '#4f46e5',
    icon: Coffee,
  },
  {
    bgLight: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-700',
    badgeBg: 'bg-orange-100 text-orange-800',
    gradient: 'from-orange-500 to-red-600',
    accent: '#ea580c',
    icon: CookingPot,
  },
  {
    bgLight: 'bg-emerald-50',
    border: 'border-emerald-300',
    text: 'text-emerald-700',
    badgeBg: 'bg-emerald-100 text-emerald-800',
    gradient: 'from-emerald-500 to-teal-600',
    accent: '#059669',
    icon: Gem,
  },
  {
    bgLight: 'bg-purple-50',
    border: 'border-purple-300',
    text: 'text-purple-700',
    badgeBg: 'bg-purple-100 text-purple-800',
    gradient: 'from-purple-500 to-indigo-600',
    accent: '#9333ea',
    icon: Award,
  },
  {
    bgLight: 'bg-cyan-50',
    border: 'border-cyan-300',
    text: 'text-cyan-700',
    badgeBg: 'bg-cyan-100 text-cyan-800',
    gradient: 'from-cyan-500 to-blue-600',
    accent: '#0891b2',
    icon: Wine,
  },
  {
    bgLight: 'bg-teal-50',
    border: 'border-teal-300',
    text: 'text-teal-700',
    badgeBg: 'bg-teal-100 text-teal-800',
    gradient: 'from-teal-500 to-emerald-600',
    accent: '#0d9488',
    icon: UtensilsCrossed,
  },
  {
    bgLight: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-700',
    badgeBg: 'bg-blue-100 text-blue-800',
    gradient: 'from-blue-500 to-indigo-600',
    accent: '#2563eb',
    icon: GlassWater,
  },
  {
    bgLight: 'bg-violet-50',
    border: 'border-violet-300',
    text: 'text-violet-700',
    badgeBg: 'bg-violet-100 text-violet-800',
    gradient: 'from-violet-500 to-purple-600',
    accent: '#7c3aed',
    icon: ChefHat,
  },
  {
    bgLight: 'bg-fuchsia-50',
    border: 'border-fuchsia-300',
    text: 'text-fuchsia-700',
    badgeBg: 'bg-fuchsia-100 text-fuchsia-800',
    gradient: 'from-fuchsia-500 to-pink-600',
    accent: '#c026d3',
    icon: Orbit,
  },
  {
    bgLight: 'bg-pink-50',
    border: 'border-pink-300',
    text: 'text-pink-700',
    badgeBg: 'bg-pink-100 text-pink-800',
    gradient: 'from-pink-500 to-rose-600',
    accent: '#db2777',
    icon: Sparkles,
  },
  {
    bgLight: 'bg-lime-50',
    border: 'border-lime-300',
    text: 'text-lime-700',
    badgeBg: 'bg-lime-100 text-lime-800',
    gradient: 'from-lime-500 to-emerald-600',
    accent: '#65a30d',
    icon: Apple,
  },
  {
    bgLight: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-800',
    badgeBg: 'bg-amber-100 text-amber-900',
    gradient: 'from-amber-600 to-orange-600',
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
