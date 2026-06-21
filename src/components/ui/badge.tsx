import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]",
        accent: "brand-soft brand-text brand-border border",
        success: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
        warning: "border border-amber-500/20 bg-amber-500/10 text-amber-700",
        danger: "border border-red-500/20 bg-red-500/10 text-red-700",
        info: "border border-blue-500/20 bg-blue-500/10 text-blue-700",
        // Same categorical entity-type palette as the knowledge-graph view
        // (--graph-* tokens in globals.css) — kept in sync so a badge and
        // its node on the graph always read as the same color.
        person: "bg-[color:var(--graph-person)]/15 text-[color:var(--graph-person)]",
        company: "bg-[color:var(--graph-company)]/15 text-[color:var(--graph-company)]",
        idea: "bg-[color:var(--graph-idea)]/15 text-[color:var(--graph-idea)]",
        document: "bg-[color:var(--graph-document)]/15 text-[color:var(--graph-document)]",
        event: "bg-[color:var(--graph-event)]/15 text-[color:var(--graph-event)]",
        place: "bg-[color:var(--graph-place)]/15 text-[color:var(--graph-place)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
