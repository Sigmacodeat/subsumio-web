"use client";

import { useEffect, useState } from "react";
import { disputeValueFromInput, formatDisputeValueInput } from "@/lib/dispute-value";

/**
 * Streitwert of the matter — the basis for RATG/AHK fees and the
 * `streitwert` template placeholder. Saved when the field loses focus.
 */
export function DisputeValueField({
  value,
  disabled,
  onSave,
}: {
  value: number | undefined;
  disabled?: boolean;
  onSave: (next: number | null) => void;
}) {
  const [text, setText] = useState(formatDisputeValueInput(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(formatDisputeValueInput(value));
    setInvalid(false);
  }, [value]);

  function commit() {
    const parsed = disputeValueFromInput(text);
    if (!parsed.ok) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if ((parsed.value ?? undefined) === value) return;
    onSave(parsed.value);
  }

  return (
    <div className="space-y-1">
      <label htmlFor="matter-dispute-value" className="text-xs text-[color:var(--ds-text-muted)]">
        Streitwert (€)
      </label>
      <input
        id="matter-dispute-value"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        placeholder="z. B. 12.000"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "matter-dispute-value-error" : undefined}
        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] tabular-nums focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
      />
      {invalid && (
        <p id="matter-dispute-value-error" className="text-xs text-[color:var(--ds-danger-text)]">
          Bitte einen Betrag in Euro eingeben, z. B. 12.000,50.
        </p>
      )}
    </div>
  );
}
