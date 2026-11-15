/**
 * Shell.tsx
 * Root layout shell. Provides the page frame with background, text color,
 * min-height, and RTL direction. Wraps the whole application.
 *
 * Usage:
 *   <Shell direction="rtl" className="...">
 *     <Sidebar />
 *     <main>...</main>
 *   </Shell>
 */
import React from "react";
import { cn } from "../../utils/cn";
import type { ShellProps } from "../../types";
import type { Direction } from "../../types";

export const Shell: React.FC<ShellProps> = ({
  children,
  className,
  direction = "rtl",
}) => {
  return (
    <div
      dir={direction}
      className={cn(
        "min-h-[100dvh] flex flex-col text-text bg-background antialiased selection:bg-accent selection:text-background",
        className,
      )}
    >
      {children}
    </div>
  );
};

export default Shell;
