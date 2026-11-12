/**
 * spacing.ts
 * Pixel-perfect, highly proportional spacing scale.
 * Built on a 4px base grid with proportional steps so every component
 * aligns to a consistent rhythm across Web and Mobile.
 */
export type SpaceToken =
  | 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 14 | 16 | 20 | 24 | 28 | 32 | 36 | 40 | 44 | 48 | 52 | 56 | 60 | 64 | 72 | 80 | 96;

// Maps token -> pixel value (Tailwind-compatible)
export const spacing: Record<SpaceToken, string> = {
  0: "0px",
  0.5: "2px",
  1: "4px",
  1.5: "6px",
  2: "8px",
  2.5: "10px",
  3: "12px",
  3.5: "14px",
  4: "16px",
  5: "20px",
  6: "24px",
  7: "28px",
  8: "32px",
  9: "36px",
  10: "40px",
  11: "44px",
  12: "48px",
  14: "56px",
  16: "64px",
  20: "80px",
  24: "96px",
  28: "112px",
  32: "128px",
  36: "144px",
  40: "160px",
  44: "176px",
  48: "192px",
  52: "208px",
  56: "224px",
  60: "240px",
  64: "256px",
  72: "288px",
  80: "320px",
  96: "384px",
} as const;

/** Semantic spacing aliases for layout components. */
export const layoutSpacing = {
  // Page / shell
  pagePaddingX: spacing[4],   // 16px
  pagePaddingY: spacing[6],   // 24px
  pageGap: spacing[6],        // 24px
  // Card internals
  cardPaddingSm: spacing[3],  // 12px
  cardPaddingMd: spacing[5],  // 20px
  cardPaddingLg: spacing[7],  // 28px
  // Section
  sectionGap: spacing[8],     // 32px
  sectionPaddingY: spacing[10], // 40px
  // Compact mobile (rapid scannability)
  mobilePagePaddingX: spacing[3],   // 12px
  mobileSectionGap: spacing[5],     // 20px
  mobileCardPadding: spacing[4],    // 16px
} as const;

export default spacing;
