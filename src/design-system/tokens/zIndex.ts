/**
 * zIndex.ts
 * Layering scale to avoid stacking-context collisions.
 */
export type ZIndexToken =
  | "hide" | "auto" | "base" | "docked" | "dropdown" | "sticky" | "banner"
  | "overlay" | "modal" | "popover" | "tooltip";

export const zIndex: Record<ZIndexToken, number> = {
  hide: -1,
  auto: 0,
  base: 1,
  docked: 10,
  dropdown: 20,
  sticky: 30,
  banner: 40,
  overlay: 50,
  modal: 100,
  popover: 110,
  tooltip: 120,
} as const;

export default zIndex;
