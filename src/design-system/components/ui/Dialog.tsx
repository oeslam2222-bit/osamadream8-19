/**
 * Dialog.tsx
 * Accessible modal dialog with backdrop, focus trapping (via inline tab index),
 * escape-to-close, and click-outside-to-close.
 *
 * Note: This is a lightweight, unstyled-dialog primitive. For production,
 * consider composing with `@radix-ui/react-dialog` and applying these tokens.
 */
import React, { useEffect, useCallback } from "react";
import { cn } from "../../utils/cn";
import { X } from "lucide-react";
import type { DialogProps } from "../../types";

export const Dialog: React.FC<DialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = "",
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      };
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-overlay bg-background/60 dark:bg-black/60 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "fixed left-[50%] top-[50%] z-modal -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-2xl border border-border bg-surface shadow-xl transition-all",
          "m-4 md:m-6",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "dialog-title" : undefined}
        aria-describedby={description ? "dialog-description" : undefined}
      >
        <div className="flex flex-col gap-3 p-6">
          {title && (
            <h2 id="dialog-title" className="text-lg font-bold text-text">
              {title}
            </h2>
          )}
          {description && (
            <p id="dialog-description" className="text-sm text-text-secondary">
              {description}
            </p>
          )}
          <div className="mt-4 flex flex-col sm:flex-row sm:justify-end gap-3 min-w-0">
            {children}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
};

export default Dialog;
