/**
 * sectionIcons.tsx
 * Central registry of Lucide icons per functional section.
 * Ensures every page uses the SAME icon + color for a given section.
 *
 * Usage:
 *   import { sectionIconMap, SectionIcon } from "@/design-system/sectionIcons";
 *   <SectionIcon section="sales" className="w-5 h-5" />
 */
import React from "react";
import {
  ShoppingCart,
  Users,
  Package,
  Wallet,
  RotateCcw,
  FileText,
  BarChart3,
  Bell,
  Target,
  MapPin,
} from "lucide-react";
import { sectionTheme, type SectionKey } from "./tokens";
import { getColorMode } from "./utils/theme";

export const sectionIconMap: Record<SectionKey, React.ElementType> = {
  sales: ShoppingCart,
  customers: Users,
  inventory: Package,
  collections: Wallet,
  returns: RotateCcw,
  invoices: FileText,
  reports: BarChart3,
  alerts: Bell,
  targets: Target,
  visits: MapPin,
};

interface SectionIconProps {
  section: SectionKey;
  className?: string;
  size?: number;
}

export const SectionIcon: React.FC<SectionIconProps> = ({ section, className, size = 20 }) => {
  const Icon = sectionIconMap[section];
  const mode = getColorMode();
  const colors = sectionTheme[section][mode];
  return <Icon className={className} style={{ color: colors.accent, width: size, height: size }} aria-hidden="true" />;
};

export default sectionIconMap;
