"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";

/**
 * „Gesetz nachladen": merkt ein Bundesgesetz (Gesetzesnummer) in der
 * Nachlade-Warteschlange vor. Die Pipeline holt es im nächsten erlaubten
 * RIS-Fenster, der Import folgt automatisch.
 *
 * csrfFetch, nicht fetch: die Middleware verlangt für jeden POST auf /api/*
 * das CSRF-Token im Header — ein nacktes fetch wird mit 403 abgewiesen.
 */
export function useLawRefetch() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    mutationFn: async (gnr: string) => {
      const r = await csrfFetch("/api/admin/corpus-law-coverage/refetch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "law-at-normen", gnr }),
      });
      if (!r.ok) {
        throw new Error(
          r.status === 403
            ? "Keine Berechtigung oder Sitzung abgelaufen — bitte Seite neu laden."
            : "Der Server hat die Vormerkung abgelehnt. Bitte später erneut versuchen."
        );
      }
      return r.json();
    },
    onSuccess: (_data, gnr) => {
      addToast({
        title: "Zum Nachladen vorgemerkt",
        description: `Gesetz ${gnr} wird im nächsten RIS-Fenster geladen und danach automatisch übernommen.`,
        type: "success",
      });
      void queryClient.invalidateQueries({ queryKey: ["corpus-law-coverage"] });
      void queryClient.invalidateQueries({ queryKey: ["corpus-law-detail"] });
    },
    onError: (err) => {
      addToast({
        title: "Nachladen fehlgeschlagen",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    },
  });
}
