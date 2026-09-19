"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/csrf";

const OPTIONS = [
  { value: "new", label: "Neu" },
  { value: "contacted", label: "Kontaktiert" },
  { value: "won", label: "Gewonnen" },
  { value: "lost", label: "Verloren" },
] as const;

export default function LeadStatusSelect({ id, status }: { id: string; status: string }) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState(false);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setError(false);
    const res = await csrfFetch("/api/admin/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    }).catch(() => null);
    if (!res?.ok) {
      setValue(previous);
      setError(true);
    }
  }

  return (
    <div>
      <label className="sr-only" htmlFor={`lead-status-${id}`}>
        Status
      </label>
      <select
        id={`lead-status-${id}`}
        value={value}
        onChange={(e) => void change(e.target.value)}
        className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-sm text-[color:var(--ds-text)]"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="mt-1 text-xs text-[color:var(--ds-danger-text)]">
          Nicht gespeichert
        </p>
      )}
    </div>
  );
}
