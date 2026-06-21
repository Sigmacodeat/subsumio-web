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
          "bg-[color:var(--brand-primary)] text-white shadow-sm transition-[background-color,box-shadow,transform] duration-200 hover:bg-[color:var(--brand-primary-hover)] hover:shadow-md active:translate-y-0 active:scale-[0.98]",
        secondary:
          "border border-[color:var(--mk-border)] bg-transparent text-[color:var(--mk-text-muted)] hover:border-[color:var(--mk-border-strong)] hover:bg-[color:var(--mk-surface-2)] hover:text-[color:var(--mk-text)]",
        ghost:
          "bg-transparent text-[color:var(--mk-text-muted)] hover:bg-[color:var(--mk-surface-2)] hover:text-[color:var(--mk-text)]",
        danger:
          "border border-red-500/20 bg-red-500/10 text-red-400 hover:border-red-500/40 hover:bg-red-500/20",
        success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-500",
        glow: "bg-[color:var(--brand-primary)] text-white shadow-md transition-[background-color,box-shadow,transform] duration-200 hover:bg-[color:var(--brand-primary-hover)] hover:shadow-lg active:translate-y-0 active:scale-[0.98]",
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
