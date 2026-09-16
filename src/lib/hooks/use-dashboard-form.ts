"use client";

import { useForm, type UseFormReturn, type DefaultValues } from "react-hook-form";
import { useState, useCallback, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

interface UseDashboardFormOptions<T extends Record<string, unknown>> {
  schema: z.ZodSchema<T>;
  defaultValues: DefaultValues<T>;
  onSubmit: (data: T) => Promise<void>;
}

interface UseDashboardFormResult<T extends Record<string, unknown>> {
  form: UseFormReturn<T>;
  status: SubmitStatus;
  error: string | null;
  handleSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  resetForm: () => void;
}

export function useDashboardForm<T extends Record<string, unknown>>({
  schema,
  defaultValues,
  onSubmit,
}: UseDashboardFormOptions<T>): UseDashboardFormResult<T> {
  const form = useForm<T>({
    resolver: zodResolver(schema as never),
    defaultValues,
    // Validate on first blur, then on every change: an error such as
    // "Titel ist erforderlich" clears while the user types instead of on the
    // next blur — which otherwise shifts the layout under a pressed button.
    mode: "onTouched",
  });

  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Re-entrancy guard: the submit button is disabled while status is
  // "submitting", but that only takes effect on the next render. A second
  // Enter/click arriving before that (double-click, keyboard + mouse) would
  // otherwise run onSubmit twice — for "create" forms that means a duplicate
  // record or a 409 on the second attempt.
  const inFlight = useRef(false);
  const handleSubmit = useCallback(
    async (e?: React.BaseSyntheticEvent) => {
      e?.preventDefault?.();
      if (inFlight.current) return;
      inFlight.current = true;
      setStatus("submitting");
      setError(null);

      try {
        const isValid = await form.trigger();
        if (!isValid) {
          setStatus("error");
          setError("Bitte korrigiere die markierten Felder.");
          return;
        }

        try {
          await onSubmit(form.getValues());
          setStatus("success");
        } catch (err) {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Ein unbekannter Fehler ist aufgetreten.");
        }
      } finally {
        inFlight.current = false;
      }
    },
    [form, onSubmit]
  );

  const resetForm = useCallback(() => {
    form.reset(defaultValues);
    setStatus("idle");
    setError(null);
  }, [form, defaultValues]);

  return { form, status, error, handleSubmit, resetForm };
}
