"use client";

import { useForm, type UseFormReturn, type DefaultValues } from "react-hook-form";
import { useState, useCallback } from "react";
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
    mode: "onBlur",
  });

  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e?: React.BaseSyntheticEvent) => {
      e?.preventDefault?.();
      setStatus("submitting");
      setError(null);

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
