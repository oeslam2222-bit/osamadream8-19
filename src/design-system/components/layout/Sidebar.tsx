/**
 * Sidebar.tsx
 * Desktop navigation sidebar. Collapses to icons on narrow screens,
 * hidden on mobile in favor of MobileNav.
 *
 * Responsive:
 *   - Hidden below lg breakpoint (mobile uses MobileNav).
 *   - Fixed width at lg+, shrinks to icon-only when `collapsed`.
 */
import React, { useState } from "react";
import { cn } from "../../utils/cn";
import { Layout, Menu, ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import type { ShellProps } from "../../types";

interface SidebarItem {
  href: string;
  label: string;
  icon: React.ElementType;
  active?: boolean;
}

export interface SidebarProps {
  items: SidebarItem[];
  collapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
  className?: string;
  brand?: React.ReactNode;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  collapsed = false,
  onCollapseChange,
  className,
  brand,
  onLogout,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const width = isCollapsed ? "w-16" : "w-60";

  const handleToggle = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    onCollapseChange?.(next);
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-full z-docked border-r border-border bg-surface transition-all duration-300 flex flex-col",
        width,
        className,
      )}
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-between px-3 py-4 border-b border-border bg-surface/50">
        {brand && (
          <div className={cn("flex items-center gap-2", isCollapsed ? "justify-center opacity-0 transition-opacity duration-300" : "")}>
            {brand}
          </div>
        )}
        <button
          onClick={handleToggle}
          className="p-2 rounded-md text-text-muted hover:text-text hover:bg-surface-subtle focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
          title={isCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          ) : (
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1" aria-label="Main menu">
        {items.map((item) => {
          const active = item.active ?? false;
          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-200",
                active
                  ? "bg-primary/10 text-primary border-r-2 border-primary"
                  : "text-text-secondary hover:text-text hover:bg-surface-subtle",
                isCollapsed ? "justify-center px-2" : "",
              )}
              aria-current={active ? "page" : undefined}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className={cn("w-5 h-5 shrink-0", active ? "text-primary" : "text-text-muted")} aria-hidden="true" />
              {!isCollapsed && <span className="font-medium">{item.label}</span>}
            </a>
          );
        })}
      </nav>

      {onLogout && (
        <div className="p-3 border-t border-border bg-surface/50">
          <button
            onClick={onLogout}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-error transition-colors duration-200",
              isCollapsed ? "justify-center px-2" : "",
              "hover:bg-error/10 hover:text-error focus:outline-none focus:ring-2 focus:ring-error",
            )}
            aria-label="Log out"
            title={isCollapsed ? "Log out" : "Log out"}
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
            {!isCollapsed && <span className="font-medium">تسجيل الخروج</span>}
          </button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
