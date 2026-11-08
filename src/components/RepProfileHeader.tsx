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

/** Rep profile header props */
export interface RepProfileHeaderProps {
  /** Current rep user data */
  rep: import("@/types").User;
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
  const clientCount = rep.clients?.length || 0;
  const totalSales = rep.commissionRate
    ? (rep.commissionRate * 1000).toLocaleString()
    : "–";

  return (
    <div
      className="
        rounded-2xl
        border
        p-6
        mb-6
        bg-white
        dark:bg-neutral-900
        shadow-sm
        flex flex-col
        {className}
      "
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold text-2xl">
              {rep.name?.charAt(0)}
            </span>
          </div>
          <div>
            <h2 className="font-xl font-semibold text-text">
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
          <p className="text-caption text-text-muted">إجمالي العملاء</p>
          <p className="font-medium text-2xl text-text">{clientCount}</p>
        </div>
        <div>
          <p className="text-caption text-text-muted">إجمالي المبيعات</p>
          <p className="font-medium text-2xl text-text">{totalSales}</p>
        </div>
        <div>
          <p className="text-caption text-text-muted">الرصيد المستحق</p>
          <p className="font-medium text-2xl text-primary">
            {rep.linkedBalance !== undefined
              ? `${rep.linkedBalance} ج.م`
              : "–"}
          </p>
        </div>
      </div>
    </div>
  );
};