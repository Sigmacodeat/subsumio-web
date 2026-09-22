"use client";

import { forwardRef } from "react";
import { Plus } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The one canonical primary action for a dashboard PageHeader.
 *
 * Page-level create CTAs had drifted across the dashboard — glow vs primary
 * vs default variant, sm vs md sizes, icon sizes from 12 to 16px, and two
 * hand-rolled `brand-bg` buttons (kyc, power-of-attorney) bypassing the
 * variant system entirely. Every PageHeader "create" action goes through
 * this component so they render identically: `glow` (the brand accent —
 * the single unmistakable primary action per page, cf. Linear/Stripe),
 * `sm` (header density), Plus at 15px, `gap-1.5 whitespace-nowrap`.
 * `asChild` is forwarded for link-shaped actions. For empty-state buttons
 * sitting alone in the content area, keep a plain `Button` — those may be
 * larger on purpose.
 */
export interface PrimaryActionProps extends Omit<ButtonProps, "variant" | "size"> {
  /** Override the default Plus icon (e.g. Upload for an upload action). */
  icon?: React.ReactNode;
}

export const PrimaryAction = forwardRef<HTMLButtonElement, PrimaryActionProps>(
  ({ icon, className, children, asChild, ...props }, ref) => (
    <Button
      ref={ref}
      variant="glow"
      size="sm"
      asChild={asChild}
      className={cn("gap-1.5 whitespace-nowrap", className)}
      {...props}
    >
      {asChild ? (
        // Slot requires exactly one element child — with asChild the caller
        // composes the link content (icon included) themselves.
        children
      ) : (
        <>
          {icon ?? <Plus size={15} aria-hidden="true" />}
          {children}
        </>
      )}
    </Button>
  )
);
PrimaryAction.displayName = "PrimaryAction";
