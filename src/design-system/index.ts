/**
 * design-system/index.ts
 * Public barrel for the design system.
 *
 * Modules:
 *   tokens      - design values (colors, spacing, typography, borders, shadows, breakpoints, zIndex)
 *   theme       - CSS variables + ThemeProvider
 *   types       - shared TypeScript interfaces
 *   utils       - cn, theme helpers
 *   components/layout   - Shell, Sidebar, Topbar, MobileNav, Grid, Page
 *   components/ui       - Button, Card, Badge, Input, Label, Separator, Avatar, Skeleton, Dialog
 */

export * from "./tokens";
export * from "./types";
export * from "./utils/cn";
export * from "./utils/theme";
export * from "./theme/css-variables.css";

export {
  Shell,
  Sidebar,
  Topbar,
  MobileNav,
  Grid,
  Page,
} from "./components/layout";

export {
  Button,
  Card,
  Badge,
  Input,
  Label,
  Separator,
  Avatar,
  Skeleton,
  Dialog,
  StatusCard,
} from "./components/ui";

export type {
  ShellProps,
  PageProps,
  ButtonProps,
  CardProps,
  BadgeProps,
  InputProps,
  DialogProps,
  GridProps,
} from "./types";
