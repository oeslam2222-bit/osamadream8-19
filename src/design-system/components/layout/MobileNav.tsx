/**
 * MobileNav.tsx
 * Compact, rapid-scannability mobile bottom navigation.
 * Designed for thumb reachability and minimal vertical footprint.
 *
 * Responsive: hidden at lg+ (desktop uses Sidebar).
 */
import React from "react";
import { cn } from "../../utils/cn";
import {
  Home,
  Layout as LayoutIcon,
  ShoppingCart,
  FileText,
  User,
  Settings,
} from "lucide-react";
import type { Size } from "../../types";

interface MobileNavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  active?: boolean;
}

export interface MobileNavProps {
  items: MobileNavItem[];
  className?: string;
}

export const MobileNav: React.FC<MobileNavProps> = ({ items, className }) => {
  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-modal flex items-center justify-around px-3 py-2.5 md:hidden",
        "border-t border-border bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60",
        className,
      )}
      aria-label="Mobile navigation"
    >
      {items.map((item) => {
        const active = item.active ?? false;
        return (
          <a
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-md text-xs transition-colors duration-200",
              active
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-text-muted hover:text-text hover:bg-surface-subtle",
            )}
            aria-current={active ? "page" : undefined}
            title={item.label}
          >
            <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-text-muted")} aria-hidden="true" />
            <span className={cn("leading-none", active ? "font-semibold" : "font-normal")}>
              {item.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
};

export default MobileNav;
