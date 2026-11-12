/**
 * Skeleton.tsx
 * Animated loading placeholder for content that is fetching.
 * Reduced-motion friendly.
 */
import React from "react";
import { cn } from "../../utils/cn";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = "",
  width = "100%",
  height = "1em",
  ...props
}) => (
  <div
    {...props}
    className={cn(
      "animate-pulse rounded-md bg-surface-subtle dark:bg-surface-elevated",
      typeof width === "number" ? `w-[${width}px]` : `w-${width}`,
      typeof height === "number" ? `h-[${height}px]` : `h-${height}`,
      className,
    )}
    aria-hidden="true"
  />
);

export default Skeleton;
