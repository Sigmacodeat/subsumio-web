export default function TeamLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-[color:var(--ds-border)] border-t-[color:var(--brand-primary)] rounded-full animate-spin" />
        <p className="text-sm text-[color:var(--ds-text-muted)]">Team wird geladen…</p>
      </div>
    </div>
  );
}
