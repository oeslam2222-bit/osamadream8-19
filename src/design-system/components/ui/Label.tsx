/**
 * Label.tsx
 * Accessible form label.
 */
import React from "react";
import { cn } from "../../utils/cn";

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label: React.FC<LabelProps> = ({
  className = "",
  children,
  ...props
}) => (
  <label
    {...props}
    className={cn("block text-sm font-medium text-text-secondary", className)}
  >
    {children}
  </label>
);

export default Label;
