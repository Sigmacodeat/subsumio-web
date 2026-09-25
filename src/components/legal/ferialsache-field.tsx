"use client";

/**
 * ferialsache-field.tsx — the § 222 Abs 2 ZPO question shared by every manual
 * deadline form (quick-create, deadline calculator, matter tab).
 *
 * Rechtsmittelfristen in Ferialsachen (einstweilige Verfügungen, Unterhalt,
 * Besitzstörung, Versäumungs-/Anerkenntnisurteile …) are NOT suspended by the
 * verhandlungsfreie Zeit. Without this answer the engine extends the period
 * and the firm misses the real Notfrist — so whenever the vhfZ changes the
 * result, the form must not be submitted until someone answered Ja/Nein.
 */

import type { FristComputation } from "@/lib/legal/frist-options";

export type FerialsacheAnswer = boolean | null;

/** The question is shown when it changes the result or was answered already. */
export function ferialsacheQuestionVisible(
  calc: Pick<FristComputation, "ferialsacheRelevant" | "vhfzVerlaengert"> | null,
  answer: FerialsacheAnswer
): boolean {
  if (!calc?.ferialsacheRelevant) return false;
  return answer !== null || calc.vhfzVerlaengert;
}

/** Submission is blocked while the vhfZ extends the period and nobody answered. */
export function ferialsacheAnswerMissing(
  calc: Pick<FristComputation, "ferialsacheRelevant" | "vhfzVerlaengert"> | null,
  answer: FerialsacheAnswer
): boolean {
  return Boolean(calc?.ferialsacheRelevant && calc.vhfzVerlaengert && answer === null);
}

export function FerialsacheField({
  id,
  value,
  onChange,
  missing,
}: {
  id: string;
  value: FerialsacheAnswer;
  onChange: (value: boolean) => void;
  missing: boolean;
}) {
  return (
    <fieldset
      className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2"
      aria-describedby={`${id}-hint`}
    >
      <legend className="px-1 text-xs font-medium text-[color:var(--ds-warning-text)]">
        Ferialsache (§ 222 Abs 2 ZPO)? *
      </legend>
      <p id={`${id}-hint`} className="text-xs text-[color:var(--ds-warning-text)]">
        Die verhandlungsfreie Zeit verlängert diese Frist nur, wenn KEINE Ferialsache vorliegt (u.
        a. einstweilige Verfügung, Unterhalt, Besitzstörung, Wechselsache, §§ 35–37 EO,
        Verfahrenshilfe, Beweissicherung, Wiedereinsetzung, Versäumungs- oder Anerkenntnisurteil).
      </p>
      <div className="mt-1.5 flex gap-4 text-xs text-[color:var(--ds-text)]">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="radio"
            name={id}
            checked={value === true}
            onChange={() => onChange(true)}
            data-testid={`${id}-yes`}
          />
          Ja, Ferialsache — keine Hemmung
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="radio"
            name={id}
            checked={value === false}
            onChange={() => onChange(false)}
            data-testid={`${id}-no`}
          />
          Nein — Hemmung nach § 222 Abs 1 ZPO
        </label>
      </div>
      {missing && (
        <p role="alert" className="mt-1 text-xs font-medium text-[color:var(--ds-danger-text)]">
          Bitte beantworten — ohne Angabe wird die Frist nicht gespeichert.
        </p>
      )}
    </fieldset>
  );
}
