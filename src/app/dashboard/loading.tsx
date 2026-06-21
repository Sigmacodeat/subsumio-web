import { D } from "@/content/dashboard";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--ds-border)] border-t-[color:var(--brand-primary)]" />
        <p className="text-sm text-[color:var(--ds-text-muted)]">{D["dashboard.loading"].de}</p>
      </div>
    </div>
  );
}
