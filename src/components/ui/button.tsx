"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium rounded-lg cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "brand-bg text-white shadow-sm shadow-[var(--brand-glow)] hover:shadow-md transition-shadow",
        secondary:
          "bg-transparent border border-[color:var(--mk-border)] text-[color:var(--mk-text-muted)] hover:border-[color:var(--mk-border-strong)] hover:text-[color:var(--mk-text)] hover:bg-[color:var(--mk-surface-2)]",
        ghost:
          "bg-transparent text-[color:var(--mk-text-muted)] hover:text-[color:var(--mk-text)] hover:bg-[color:var(--mk-surface-2)]",
        danger:
          "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40",
        success:
          "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/30",
        glow:
          "brand-bg text-white shadow-[0_0_16px_-4px_var(--brand-glow)] hover:shadow-[0_0_24px_-2px_var(--brand-glow)] hover:-translate-y-px active:translate-y-0 active:shadow-[0_0_12px_-4px_var(--brand-glow)] transition-all duration-200",
        outline:
          "border brand-border brand-text hover:brand-border-strong hover:brand-soft",
      },
      size: {
        sm: "text-xs px-3 py-1.5",
        md: "text-sm px-4 py-2",
        lg: "text-sm px-6 py-3",
        xl: "text-base px-8 py-4",
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
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
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
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
