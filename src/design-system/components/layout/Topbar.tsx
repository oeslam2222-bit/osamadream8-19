/**
 * Topbar.tsx
 * Top application bar. Contains app branding, global actions (search, notify,
 * theme toggle), and the user profile. Sticky at the top.
 *
 * Responsive: compact height on mobile, expanded on desktop.
 */
import React from "react";
import { cn } from "../../utils/cn";
import {
  Sun,
  Moon,
  Menu as MenuIcon,
  Bell,
  Search,
  User,
  MoreHorizontal,
} from "lucide-react";
import type { Size } from "../../types";

export interface TopbarProps {
  onMenuToggle?: () => void;
  onThemeToggle?: () => void;
  colorMode?: "light" | "dark";
  notifications?: number;
  user?: { name: string; avatar?: string };
  onProfileClick?: () => void;
  className?: string;
}

export const Topbar: React.FC<TopbarProps> = ({
  onMenuToggle,
  onThemeToggle,
  colorMode = "dark",
  notifications = 0,
  user,
  onProfileClick,
  className,
}) => {
  return (
    <header
      className={cn(
        "sticky top-0 z-banner flex h-14 items-center justify-between px-4 border-b border-border bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60",
        className,
      )}
      aria-label="Top navigation"
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-md text-text-secondary hover:text-text hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
          aria-label="Open main menu"
        >
          <MenuIcon className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              placeholder="البحث في النظام…"
              className={cn(
                "w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-border bg-background text-text placeholder:text-text-muted",
                "focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent",
              )}
              aria-label="Search"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onThemeToggle && (
          <button
            onClick={onThemeToggle}
            className="p-2 rounded-md text-text-secondary hover:text-text hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
            aria-label="Toggle theme"
            title={colorMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {colorMode === "dark" ? (
              <Sun className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Moon className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        )}

        <button
          className="relative p-2 rounded-md text-text-secondary hover:text-text hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
          aria-label="Notifications"
          title={notifications > 0 ? `${notificationCount(notifications)} إشعار جديد` : "الإشعارات"}
        >
          <Bell className="w-5 h-5" aria-hidden="true" />
          {notifications > 0 && (
            <span className="absolute top-1 right-1 z-tooltip flex h-[10px] min-w-[10px] items-center justify-center rounded-full bg-error px-[6px] py-[1px] text-[10px] text-background font-bold ring-1 ring-background">
              {notifications > 9 ? "9+" : notifications}
            </span>
          )}
        </button>

        {user && (
          <button
            onClick={onProfileClick}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:text-text hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="User profile"
          >
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-7 h-7 rounded-full bg-border" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary text-background flex items-center justify-center font-semibold text-[10px]">
                {user.name.charAt(0)}
              </div>
            )}
            <span className="hidden md:block font-medium">{user.name}</span>
            <MoreHorizontal className="w-4 h-4 text-text-muted" aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
};

function notificationCount(n: number): string {
  return n > 9 ? "9+" : String(n);
}

export default Topbar;
