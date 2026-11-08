/**
 * RepProfileHeader.tsx
 * A simplified header component displaying the current sales representative's profile
 * at the top of the clients page.
 *
 * Props:
 * - rep: User data object for the current rep
 * - onNavigateToEdit: optional callback to navigate to rep edit profile
 * - className: optional additional classes
 */
import React from "react";
import "./index.css";
import { StatusBadge } from "@/src/components/StatusBadge";
import { Button } from "@/src/components/Button";
import { User } from "../types";

/** Rep profile header props */
export interface RepProfileHeaderProps {
  /** Current rep user data */
  rep: User;
  /** Optional callback when edit profile is clicked */
  onNavigateToEdit?: () => void;
  /** Optional additional className */
  className?: string;
}

/**
 * RepProfileHeader renders the rep's avatar, name, role, and stats
 * such as number of clients, total sales, etc.
 */
export const RepProfileHeader: React.FC<RepProfileHeaderProps> = ({
  rep,
  onNavigateToEdit,
  className,
}) => {
  const clientCount = 0;
  const totalSales = rep.commissionRate
    ? (rep.commissionRate * 1000).toLocaleString()
    : "–";

  return (
    <div
      className={`
        rounded-2xl
        border
        p-6
        mb-6
        bg-white
        dark:bg-neutral-900
        shadow-sm
        flex flex-col
        ${className || ""}
      `}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold text-2xl">
              {rep.name?.charAt(0) || "م"}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-text">
              {rep.name}
            </h2>
            <p className="text-text-muted text-sm">
              {rep.role} • {rep.branchName}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {onNavigateToEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onNavigateToEdit}
              aria-label="Edit profile"
            >
              تعديل
            </Button>
          )}
          <StatusBadge
            type="sales"
            label="مندوب"
            size="sm"
            className="text-sm"
          />
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border dark:border-neutral-700/30">
        <div>
          <p className="text-caption text-text-muted">الفرع التابع له</p>
          <p className="font-medium text-lg text-text">{rep.branchName || "الرئيسي"}</p>
        </div>
        <div>
          <p className="text-caption text-text-muted">كود الموظف</p>
          <p className="font-medium text-lg text-text">{rep.code || "–"}</p>
        </div>
        <div>
          <p className="text-caption text-text-muted">الهاتف</p>
          <p className="font-medium text-lg text-primary">
            {rep.phone || "–"}
          </p>
        </div>
      </div>
    </div>
  );
};