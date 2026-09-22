"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,border-color,color,box-shadow,transform,opacity,filter] duration-[var(--ds-duration-normal)] outline-none select-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ds-surface)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        primary:
          // Hover darkens the whole fill (gradient included) with a filter: the
          // gradient image sits above the background colour, so swapping the
          // colour alone changed nothing, and the glow halo was the only — loud
          // — hover signal. Darker also means more contrast for the white label.
          "bg-[color:var(--brand-solid)] bg-[image:var(--brand-button-gradient)] text-white shadow-[var(--ds-shadow-1),var(--brand-button-highlight)] hover:brightness-[0.92] active:brightness-[0.86]",
        secondary:
          "border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)] hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)]",
        ghost:
          "bg-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-text)]",
        danger:
          "border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] hover:border-[color:var(--ds-danger-solid)] hover:bg-[color:var(--ds-danger-solid)] hover:text-white",
        success:
          // success-700 (solid-hover) als Basis — white auf success-600 war
          // nur 3.82:1; der Hover geht eine Stufe dunkler.
          "bg-[color:var(--ds-success-solid-hover)] text-white shadow-sm hover:bg-[color:var(--signal-success-800)]",
        glow: "bg-[color:var(--brand-solid)] bg-[image:var(--brand-button-gradient)] text-white shadow-[var(--ds-glow-brand),var(--brand-button-highlight)] hover:brightness-[0.92] active:brightness-[0.86]",
        outline:
          "border border-[color:var(--ds-border-strong)] bg-transparent text-[color:var(--ds-text-muted)] hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/[0.08] hover:text-[color:var(--brand-primary)]",
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
  /** Render as the child element instead of <button> — the correct way to
   *  style links as buttons without nesting interactive elements:
   *  <Button asChild><Link href={…}>Label</Link></Button> */
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, asChild, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {asChild ? (
          // Slot requires exactly one element child — a falsy `loading &&`
          // expression would still count as a second child and crash Slot.
          children
        ) : (
          <>
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {children}
          </>
        )}
      </Comp>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
