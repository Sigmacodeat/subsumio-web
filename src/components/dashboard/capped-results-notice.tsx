"use client";

/**
 * Shown when a list view loaded exactly `limit` items — the result set may
 * have been silently truncated server-side and search/filtering on the
 * client only ever sees the loaded page, not the full dataset.
 */
export function CappedResultsNotice({ limit }: { limit: number }) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]">
      Es werden nur die ersten {limit} Einträge angezeigt. Es könnten weitere vorhanden sein, die
      hier nicht aufgeführt sind — bitte nutze die Suche, um gezielt nach weiteren Einträgen zu
      filtern.
    </div>
  );
}
