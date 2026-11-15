/**
 * cn.ts
 * Utility to merge Tailwind classes safely, handling conditional classes.
 * Lightweight replacement for `clsx` + `tailwind-merge`.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
