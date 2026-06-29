"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-6 lg:p-8">
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-sm font-medium text-red-600">Analytics could not be loaded</p>
        <button
          onClick={reset}
          className="mt-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-2 text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
