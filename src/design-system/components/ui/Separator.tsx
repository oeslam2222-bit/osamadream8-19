/**
 * Separator.tsx
 * Thin visual divider with optional centered label.
 */
import React from "react";
import { cn } from "../../utils/cn";

interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
  label?: React.ReactNode;
}

export const Separator: React.FC<SeparatorProps> = ({
  className = "",
  orientation = "horizontal",
  label,
  ...props
}) => {
  if (label) {
    return (
      <div
        {...props}
        className={cn(
          "relative flex w-full items-center gap-1.5 border-t border-border px-4",
          className,
        )}
      >
        <span className="h-[1px] flex-1 bg-border" aria-hidden="true" />
        <span className="text-xs font-medium text-text-muted whitespace-nowrap">
          {label}
        </span>
        <span className="h-[1px] flex-1 bg-border" aria-hidden="true" />
      </div>
    );
  }

  return (
    <hr
      {...props}
      className={cn(
        orientation === "vertical"
          ? "h-auto w-[1px] border-t-0 border-l border-border"
          : "w-full border-t border-border",
        className,
      )}
      aria-orientation={orientation}
    />
  );
};

export default Separator;
