import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, iconRight, ...props }, ref) => {
    if (icon || iconRight) {
      return (
        <div className="relative flex items-center">
          {icon && (
            <div className="pointer-events-none absolute left-3 text-[color:var(--ds-text-muted)]">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              "w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-sm text-[color:var(--ds-text)]",
              "placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)]/20 focus:outline-none",
              "transition-colors duration-150",
              icon && "pl-10",
              iconRight && "pr-10",
              !icon && "pl-3",
              "py-2.5 pr-3",
              className
            )}
            {...props}
          />
          {iconRight && (
            <div className="pointer-events-none absolute right-3 text-[color:var(--ds-text-muted)]">
              {iconRight}
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)]",
          "placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)]/20 focus:outline-none",
          "transition-colors duration-150",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
