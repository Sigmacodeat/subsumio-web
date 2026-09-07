import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-[color:var(--ds-text)] transition-[border-color,box-shadow] duration-150 placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--ds-ring)] focus:ring-2 focus:ring-[color:var(--ds-ring)]/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        // Mobile: 16px font-size verhindert iOS Auto-Zoom beim Fokus,
        // Desktop: 14px für kompaktere Formulare
        "text-base sm:text-sm",
        // Mobile: größeres Touch-Target, Desktop: kompakt
        "min-h-[96px] sm:min-h-[80px]",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
