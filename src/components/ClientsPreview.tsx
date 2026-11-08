/**
 * ClientsPreview.tsx
 * A component that displays the first 5 clients as profile cards.
 * Used within a rep's dashboard or profile page.
 *
 * Props:
 * - customers: array of Customer objects (filtered for this rep)
 * - onSelect: callback when a client card is clicked
 * - emptyMessage: message when no customers
 * - className: optional additional classes
 */
import React from "react";
import { Customer } from "../types";
import { ClientProfileCard } from "./ClientProfileCard";

/** Props for ClientsPreview */
export interface ClientsPreviewProps {
  /** Array of customers (will show first 5) */
  customers: Customer[];
  /** Called when a client card is selected */
  onSelect: (customerId: string) => void;
  /** Optional message when no customers */
  emptyMessage?: string;
  /** Optional additional className */
  className?: string;
}

/**
 * ClientsPreview renders up to the first 5 customers as
 * ClientProfileCard components. If fewer than 5 are available,
 * it shows all available.
 */
export const ClientsPreview: React.FC<ClientsPreviewProps> = ({
  customers,
  onSelect,
  emptyMessage = "لا توجد عملاء مسجلين",
  className,
}) => {
  // Show only first 5 customers
  const firstFive = customers.slice(0, 5);

  if (firstFive.length === 0) {
    return (
      <div className="p-8 text-center text-text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {firstFive.map((customer) => (
        <ClientProfileCard
          key={customer.id}
          customer={customer}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};