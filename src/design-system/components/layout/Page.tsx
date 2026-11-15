/**
 * Page.tsx
 * Standard page wrapper. Provides consistent page padding, section heading,
 * and a container constraint for readability on wide screens.
 *
 * Responsive:
 *   - Mobile: tight padding (12px horizontal) for rapid scannability.
 *   - Desktop: generous padding, centered max-width container.
 */
import React from "react";
import { cn } from "../../utils/cn";
import type { PageProps } from "../../types";

export const Page: React.FC<PageProps> = ({
  children,
  title,
  subtitle,
  className,
  container = true,
}) => {
  return (
    <div className={cn("flex-1 w-full min-w-0", className)}>
      <div className={cn(
        "px-4 sm:px-6 lg:px-8 py-6 sm:py-8",
        "flex-1 min-w-0",
      )}>
        {title || subtitle ? (
          <div className="mb-6 sm:mb-8">
            {title && (
              <h2 className="text-xl sm:text-2xl font-bold text-text tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 sm:mt-2 text-text-secondary sm:text-sm">
                {subtitle}
              </p>
            )}
          </div>
        ) : null}

        <div
          className={cn(
            container
              ? "max-w-7xl mx-auto sm:px-6 lg:px-8"
              : "w-full",
            "min-w-0",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default Page;
