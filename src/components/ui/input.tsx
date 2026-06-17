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
            <div className="absolute left-3 text-[#7878a0] pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              "w-full bg-[#0d0d1a] border border-[#1e1e3a] rounded-lg text-sm text-[#e8e8f0]",
              "placeholder:text-[#7878a0] focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20",
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
            <div className="absolute right-3 text-[#7878a0] pointer-events-none">
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
          "w-full bg-[#0d0d1a] border border-[#1e1e3a] rounded-lg text-sm text-[#e8e8f0] px-3 py-2.5",
          "placeholder:text-[#7878a0] focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20",
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
