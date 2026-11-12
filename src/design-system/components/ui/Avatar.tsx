/**
 * Avatar.tsx
 * Circular user avatar with fallback initials.
 */
import React from "react";
import { cn } from "../../utils/cn";

interface AvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  name?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes: Record<string, string> = {
  sm: "w-6 h-6 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
  xl: "w-12 h-12 text-base",
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  size = "md",
  className = "",
  src,
  ...props
}) => {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div className={cn("relative flex shrink-0", sizes[size], className)}>
      {src ? (
        <img
          src={src}
          alt=""
          className="aspect-square rounded-full object-cover bg-border"
          {...props}
        />
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-full bg-primary text-background font-semibold">
          {initials}
        </div>
      )}
    </div>
  );
};

export default Avatar;
