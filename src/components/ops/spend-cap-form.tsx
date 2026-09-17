"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/csrf";

type Period = "daily" | "weekly" | "monthly" | "total";

const PERIOD_LABEL: Record<Period, string> = {
  daily: "pro Tag",
  weekly: "pro Woche",
  monthly: "pro Monat",
  total: "gesamt",
};

export function SpendCapForm({
  ownerId,
  ownerType = "org",
  currentLimit,
  currentPeriod,
  spentInPeriod,
}: {
  ownerId: string;
  ownerType?: "org" | "user";
  currentLimit: number | null;
  currentPeriod: Period;
  spentInPeriod: number | null;
}) {
  const router = useRouter();
  const [limit, setLimit] = useState(currentLimit === null ? "" : String(currentLimit));
  const [period, setPeriod] = useState<Period>(currentPeriod);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const creditLimit = limit.trim() === "" ? null : Number(limit);
    if (creditLimit !== null && (!Number.isFinite(creditLimit) || creditLimit < 0)) {
      setStatus("error");
      return;
    }
    const res = await csrfFetch("/api/admin/spend-caps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_id: ownerId,
        owner_type: ownerType,
        credit_limit: creditLimit,
        period,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setStatus("error");
      return;
    }
    setStatus("saved");
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <h2 className="text-sm font-semibold">KI-Kostenlimit (Spend-Cap)</h2>
      <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
        {currentLimit === null
          ? "Kein Limit gesetzt."
          : `Aktuell ${currentLimit.toLocaleString("de-DE")} Credits ${PERIOD_LABEL[currentPeriod]}` +
            (spentInPeriod === null
              ? "."
              : ` · ${spentInPeriod.toLocaleString("de-DE")} im Zeitraum verbraucht.`)}
      </p>
      <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
            Limit in Credits (leer = unbegrenzt)
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              setStatus("idle");
            }}
            className="w-40 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">Zeitraum</span>
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as Period);
              setStatus("idle");
            }}
            className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
          >
            {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" loading={status === "saving"}>
          Speichern
        </Button>
        <span role="status" aria-live="polite" className="text-xs">
          {status === "saved" && (
            <span className="text-[color:var(--ds-success-text)]">Gespeichert</span>
          )}
          {status === "error" && (
            <span className="text-[color:var(--ds-danger-text)]">Speichern fehlgeschlagen</span>
          )}
        </span>
      </form>
    </section>
  );
}
