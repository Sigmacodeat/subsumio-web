"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium outline-none select-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ds-surface)] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary:
          "bg-[color:var(--brand-primary)] text-white shadow-sm transition-[background-color,box-shadow] duration-200 hover:bg-[color:var(--brand-primary-hover)] hover:shadow-md active:bg-[color:var(--brand-primary-hover)]",
        secondary:
          "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)] hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)]",
        ghost:
          "bg-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-text)]",
        danger:
          "border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] hover:opacity-80",
        success:
          "bg-[color:var(--ds-success-solid)] text-white shadow-sm hover:bg-[color:var(--ds-success-solid-hover)]",
        glow: "bg-[color:var(--brand-primary)] text-white shadow-md shadow-[color:var(--brand-glow)] transition-[background-color,box-shadow] duration-200 hover:bg-[color:var(--brand-primary-hover)] hover:shadow-lg active:bg-[color:var(--brand-primary-hover)]",
        outline:
          "border border-[color:var(--brand-primary)] text-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/10",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-sm",
        xl: "px-8 py-4 text-base",
        icon: "p-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
