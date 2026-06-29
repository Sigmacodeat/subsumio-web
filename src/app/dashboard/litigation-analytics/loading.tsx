export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-[color:var(--ds-surface-2)]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-[color:var(--ds-surface-2)]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-xl bg-[color:var(--ds-surface-2)]" />
        <div className="h-48 animate-pulse rounded-xl bg-[color:var(--ds-surface-2)]" />
      </div>
    </div>
  );
}
