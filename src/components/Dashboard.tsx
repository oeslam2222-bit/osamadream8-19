/**
 * Dashboard.tsx
 * A core dashboard component that demonstrates the status‑coded badges
 * (collections, sales, returns, pending) in a responsive grid.
 * On mobile the cards stack vertically; on desktop they flow in a 2‑col or 4‑col layout.
 *
 * - Uses the Layout component for max‑width container & safe‑area padding.
 * - Uses StatusBadge for colour‑coded pills.
 * - Fully typed with StatusCardData interface.
 */
import React from "react";
import "./index.css";
import { Layout } from "@/src/components/Layout";
import { StatusBadge, StatusType } from "@/src/components/StatusBadge";

/** Data shape for a single status card */
interface StatusCardData {
  /** The status type determines badge colour */
  type: StatusType;
  /** Display label (e.g "Collections") */
  label: string;
  /** Optional numeric value (e.g. "$12,450" or "12") */
  value?: string;
  /** Optional helper text shown below the label */
  helper?: string;
}

/** Props for Dashboard */
export interface DashboardProps {
  /** Optional title rendered above the grid */
  title?: string;
  /** Array of status card data – typically 4 items matching the four status types */
  cards: StatusCardData[];
}

/**
 * Dashboard renders a responsive grid of status‑coded cards.
 * - 1 column on mobile (<640px)
 * - 2 columns on small tablets (≥640px)
 * - 4 columns on desktop (≥1024px)
 * Each card contains a StatusBadge, a title, and an optional value/helper.
 */
export const Dashboard: React.FC<DashboardProps> = ({
  title,
  cards = [] as StatusCardData[],
}) => {
  return (
    <Layout>
      {title && (
        <h2
          className="
            text-xl font-medium
            mb-4
            text-primary
            tracking-wide
          "
        >
          {title}
        </h2>
      )}

      {/* Responsive grid: 1sm / 2md / 4lg */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, idx) => {
          const { type, label, value, helper } = card;
          return (
            <div
              key={idx}
              className="
                rounded-lg
                border
                p-4
                shadow-sm
                transition-shadow hover:shadow-md
                bg-white
                dark:bg-neutral-900
              "
            >
              <StatusBadge type={type} label={label} size="sm" />
              <div className="mt-3">
                <p className="font-medium text-text">{label}</p>
                {value && (
                  <p className="text-text-muted text-sm">{value}</p>
                )}
                {helper && (
                  <p className="text-caption text-text-muted line-through">{helper}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
};