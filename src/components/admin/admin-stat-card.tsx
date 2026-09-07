import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
}

export function StatCard({ icon: Icon, label, value, hint }: StatCardProps) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <Icon size={16} className="brand-text mb-3" />
      <p className="text-2xl font-black text-[color:var(--ds-text)]">{value}</p>
      <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{label}</p>
      {hint && <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">{hint}</p>}
    </div>
  );
}

const PLAN_STYLES: Record<string, string> = {
  free: "text-[color:var(--ds-text-muted)] bg-[color:var(--ds-surface-2)]",
  pro: "text-violet-300 bg-violet-500/15 border border-violet-500/25",
  team: "text-[color:var(--ds-info-text)] bg-blue-500/15 border border-blue-500/25",
  enterprise: "text-[color:var(--ds-warning-text)] bg-amber-500/15 border border-amber-500/25",
};

export function PlanBadge({ plan }: { plan: string }) {
  const style = PLAN_STYLES[plan] ?? PLAN_STYLES.free;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${style}`}>
      {plan}
    </span>
  );
}
