import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]",
        accent: "brand-soft brand-text border brand-border",
        success: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 dark:text-emerald-400",
        warning: "bg-amber-500/10 text-amber-700 border border-amber-500/20 dark:text-amber-400",
        danger: "bg-red-500/10 text-red-700 border border-red-500/20 dark:text-red-400",
        info: "bg-blue-500/10 text-blue-700 border border-blue-500/20 dark:text-blue-400",
        person: "bg-blue-500/15 text-blue-400",
        company: "bg-emerald-500/15 text-emerald-400",
        idea: "bg-purple-500/15 text-purple-400",
        document: "bg-amber-500/15 text-amber-400",
        event: "bg-orange-500/15 text-orange-400",
        place: "bg-teal-500/15 text-teal-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
