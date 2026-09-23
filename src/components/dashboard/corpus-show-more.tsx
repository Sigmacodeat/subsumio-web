"use client";

/**
 * „Weitere anzeigen" statt Scrollbox: lange Listen der Korpus-Konsole zeigen
 * die ersten N Einträge und wachsen auf Klick um weitere N. Die Seite scrollt,
 * nie ein Kasten in der Seite — ein fester Listen-Kasten fängt das Mausrad ab,
 * sobald der Zeiger darüber steht, und die Seite bleibt stehen.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

export const LIST_STEP = 50;

const fmt = (n: number) => n.toLocaleString("de-AT");

/**
 * Sichtbarer Ausschnitt einer Liste. `resetKey` setzt den Ausschnitt zurück,
 * wenn sich der Filter ändert (sonst stünde man nach einem Filterwechsel
 * mitten in einer 300er-Liste).
 */
export function useShowMore<T>(items: T[], resetKey: unknown = null, step = LIST_STEP) {
  const [state, setState] = useState({ key: resetKey, count: step });
  const count = Object.is(state.key, resetKey) ? state.count : step;
  if (!Object.is(state.key, resetKey)) setState({ key: resetKey, count: step });
  return {
    visible: items.slice(0, count),
    total: items.length,
    more: () => setState({ key: resetKey, count: count + step }),
    step,
  };
}

export function ShowMoreButton({
  shown,
  total,
  step = LIST_STEP,
  onMore,
  noun = "Einträge",
}: {
  shown: number;
  total: number;
  step?: number;
  onMore: () => void;
  noun?: string;
}) {
  if (total <= shown) return null;
  const next = Math.min(step, total - shown);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
      <p className="text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
        {fmt(shown)} von {fmt(total)} {noun} angezeigt
      </p>
      <Button variant="outline" size="sm" onClick={onMore}>
        Weitere {fmt(next)} anzeigen
      </Button>
    </div>
  );
}
