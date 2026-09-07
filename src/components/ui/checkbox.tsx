"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-[color:var(--ds-control-border)] bg-[color:var(--ds-surface)] ring-offset-[color:var(--ds-surface)] transition-[background-color,border-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.9] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[color:var(--ds-accent)] data-[state=checked]:bg-[color:var(--ds-accent)] data-[state=checked]:text-white motion-reduce:transition-none",
      // Mobile: 44px Hit-Area ohne visuelle Vergrößerung (WCAG 2.5.5)
      // before-Pseudo-Element erweitert die Klickfläche auf 44px
      "relative before:absolute before:inset-[-14px] before:content-['']",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      <Check className="h-3.5 w-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
