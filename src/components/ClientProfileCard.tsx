/**
 * ClientProfileCard.tsx
 * A card component displaying a client's profile summary.
 * Used in the "first 5 clients" preview list.
 * Clicking the card navigates to the full client detail view.
 *
 * Props:
 * - customer: Customer data object (from types.ts)
 * - onSelect: callback fired when card is clicked, passing the customer id
 * - className: optional additional classes
 */
import React from "react";
import "./index.css";
import { StatusBadge } from "@/src/components/StatusBadge";
import { Customer } from "@/types";

/** Client profile card props */
export interface ClientProfileCardProps {
  /** Customer data */
  customer: Customer;
  /** Called when card is clicked */
  onSelect: (customerId: string) => void;
  /** Optional additional className */
  className?: string;
}

/**
 * ClientProfileCard renders a clickable card with:
 * - Customer name and code
 * - Status badge (if linked to sales/rep)
 * - Key info: phone, balance, tier
 * - Arrow indicator for navigation
 */
export const ClientProfileCard: React.FC<ClientProfileCardProps> = ({
  customer,
  onSelect,
  className,
}) => {
  // Determine a status type based on linked balance/overdue for badge colour
  let statusType: "collections" | "sales" | "returns" | "pending" = "pending";
  if (customer.linkedBalance !== undefined && customer.linkedBalance > 0) {
    statusType = "collections";
  } else if (customer.linkedOverdue && customer.linkedOverdue > 0) {
    statusType = "returns";
  } else if (customer.linkedTier && customer.linkedTier.includes("Gold")) {
    statusType = "sales";
  } else {
    statusType = "pending";
  }

  return (
    <div
      className="
        rounded-lg
        border
        p-4
        cursor-pointer
        hover:shadow-md
        transition-shadow
        bg-white
        dark:bg-neutral-900
        aria-labelledby='card-title-{customer.id}'
      "
      onClick={() => onSelect(customer.id)}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-text text-sm line-clamp-2">
            {customer.customerName}
            {customer.customerAccount && (
              <span className="ml-2 text-text-muted text-xs">({customer.customerAccount})</span>
            )}
          </h3>
          <p className="text-text-muted text-xs line-clamp-1">
            {customer.linkedPhone || customer.phone || "لا توجد بيانات"}
          </p>
        </div>
        <StatusBadge type={statusType} label={statusType} size="sm" />
      </div>

      <div className="mt-3 pt-3 border-t border-border dark:border-neutral-700/30">
        <div className="flex justify-between text-caption text-text-muted">
          <span>الرصيد المستحق</span>
          <span className="font-medium">{customer.linkedBalance !== undefined ? `${customer.linkedBalance} ج.م` : "غير محدد"}</span>
        </div>
        {customer.linkedOverdue && (
          <div className="mt-1 flex justify-between text-caption text-text-muted">
            <span>المستحق التأخير</span>
            <span className="text-error font-medium">{customer.linkedOverdue} ج.م</span>
          </div>
        )}
      </div>
    </div>
  );
};