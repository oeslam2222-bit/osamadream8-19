/**
 * Layout.tsx
 * Core responsive layout wrapper used across web and mobile.
 * Provides max-width containers, horizontal padding, and column grid.
 * Uses CSS custom properties from index.css for theming.
 */
import React from "react";
import "./index.css";

/**
 * Props for Layout
 */
export interface LayoutProps {
  /** Optional children content */
  children: React.ReactNode;
  /** Optional additional className */
  className?: string;
  /** Optional inner padding modifier (adds container-padding class for mobile safe-area) */
  withSafeAreaPadding?: boolean;
}

/**
 * Main layout container.
 * - Max-width 1200px on desktop, full width on mobile.
 * - Horizontal padding that respects safe-area-insets on mobile.
 * - Light/dark theming via CSS variables.
 */
export const Layout: React.FC<LayoutProps> = ({
  children,
  className,
  withSafeAreaPadding = false,
}) => {
  const paddingClass = withSafeAreaPadding ? "container-padding" : "";

  return (
    <div
      className={`
        max-w-7xl mx-auto ${paddingClass}
        px-4 sm:px-6 lg:px-8
        ${className}
      `}
    >
      {children}
    </div>
  );
};

/**
 * Usage:
 * <Layout withSafeAreaPadding>
 *   <PageContent />
 * </Layout>
 */