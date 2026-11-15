/**
 * types/index.ts
 * Shared TypeScript interfaces for the design system.
 */

import type { ColorMode } from "../tokens";

export type LayoutVariant = "default" | "boxed" | "full";

export type Direction = "ltr" | "rtl";

export type Size = "sm" | "md" | "lg";

export type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success" | "warning";

export interface ThemeContextValue {
  colorMode: ColorMode;
  toggleTheme: () => void;
  setTheme: (mode: ColorMode) => void;
  direction: Direction;
  setDirection: (dir: Direction) => void;
}

export interface ResponsiveValue<T> {
  mobile?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  "2xl"?: T;
}

export interface BreakpointProps {
  className?: string;
  children: React.ReactNode;
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
  variant?: "default" | "glass" | "gradient" | "glow" | "accent";
  accent?: "teal" | "amber" | "indigo" | "rose" | "emerald" | "slate";
  className?: string;
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: "default" | "primary" | "secondary" | "success" | "warning" | "error" | "outline";
  size?: Size;
  className?: string;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  fullWidth?: boolean;
  className?: string;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  className?: string;
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export interface ShellProps {
  children: React.ReactNode;
  className?: string;
  direction?: Direction;
}

export interface PageProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
  container?: boolean;
}

export interface GridProps {
  children: React.ReactNode;
  cols?: ResponsiveValue<number>;
  gap?: string | number | ResponsiveValue<string | number>;
  className?: string;
}
