"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium select-none disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary:
          "brand-bg text-white shadow-[var(--brand-glow)] shadow-sm transition-shadow hover:shadow-md",
        secondary:
          "border border-[color:var(--mk-border)] bg-transparent text-[color:var(--mk-text-muted)] hover:border-[color:var(--mk-border-strong)] hover:bg-[color:var(--mk-surface-2)] hover:text-[color:var(--mk-text)]",
        ghost:
          "bg-transparent text-[color:var(--mk-text-muted)] hover:bg-[color:var(--mk-surface-2)] hover:text-[color:var(--mk-text)]",
        danger:
          "border border-red-500/20 bg-red-500/10 text-red-400 hover:border-red-500/40 hover:bg-red-500/20",
        success: "bg-emerald-600 text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500",
        glow: "brand-bg text-white shadow-[0_0_16px_-4px_var(--brand-glow)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_0_24px_-2px_var(--brand-glow)] active:translate-y-0 active:shadow-[0_0_12px_-4px_var(--brand-glow)]",
        outline: "brand-border brand-text hover:brand-border-strong hover:brand-soft border",
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
