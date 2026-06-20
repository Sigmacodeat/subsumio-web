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
            <div className="absolute left-3 text-[color:var(--ds-text-muted)] pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              "w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg text-sm text-[color:var(--ds-text)]",
              "placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)]/20",
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
            <div className="absolute right-3 text-[color:var(--ds-text-muted)] pointer-events-none">
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
          "w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg text-sm text-[color:var(--ds-text)] px-3 py-2.5",
          "placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)]/20",
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
