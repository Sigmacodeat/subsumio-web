import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  /**
   * Field error message. When set, the input is marked aria-invalid and the
   * message is rendered below it (role="alert"), linked via aria-describedby.
   * When unset, the component renders exactly as before (no wrapper).
   */
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, iconRight, error, "aria-describedby": ariaDescribedBy, ...props }, ref) => {
    const errorId = useId();
    const describedBy =
      [ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;
    const a11yProps = {
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy,
    } as const;
    const errorElement = error ? (
      <p id={errorId} role="alert" className="mt-1 text-xs text-[color:var(--ds-danger-text)]">
        {error}
      </p>
    ) : null;

    if (icon || iconRight) {
      const control = (
        <div className="relative flex items-center">
          {icon && (
            <div className="pointer-events-none absolute left-3 text-[color:var(--ds-text-muted)]">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              "w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)]",
              // Mobile: text-base (16px) verhindert iOS Auto-Zoom beim Fokus,
              // Desktop: text-sm (14px) für kompaktere Formulare
              "text-base sm:text-sm",
              "placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--ds-ring)] focus:ring-2 focus:ring-[color:var(--ds-ring)]/30 focus:outline-none",
              "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
              // Mobile: 44px Touch-Target (WCAG 2.5.5), Desktop: kompakt
              "h-11 sm:h-auto sm:py-2.5",
              icon && "pl-10",
              iconRight && "pr-10",
              !icon && "pl-3",
              "pr-3",
              className
            )}
            {...props}
            {...a11yProps}
          />
          {iconRight && (
            <div className="pointer-events-none absolute right-3 text-[color:var(--ds-text-muted)]">
              {iconRight}
            </div>
          )}
        </div>
      );
      if (!error) return control;
      return (
        <div>
          {control}
          {errorElement}
        </div>
      );
    }

    const control = (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 text-sm text-[color:var(--ds-text)]",
          "placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--ds-ring)] focus:ring-2 focus:ring-[color:var(--ds-ring)]/30 focus:outline-none",
          "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
          // Mobile: 44px Touch-Target (WCAG 2.5.5), Desktop: kompakt
          "h-11 sm:h-auto sm:py-2.5",
          className
        )}
        {...props}
        {...a11yProps}
      />
    );
    if (!error) return control;
    return (
      <div>
        {control}
        {errorElement}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
