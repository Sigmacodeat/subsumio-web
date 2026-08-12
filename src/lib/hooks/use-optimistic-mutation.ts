"use client";

import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";

/**
 * Updater-Funktion: nimmt den aktuellen Cache-Wert + die Mutations-Variablen
 * und gibt den optimistischen neuen Cache-Wert zurück.
 *
 * @example
 * (oldTodos, newTodo) => [...(oldTodos ?? []), newTodo]
 */
type OptimisticUpdater<TQueryFnData, TVariables> = (
  oldData: TQueryFnData | undefined,
  variables: TVariables,
) => TQueryFnData | undefined;

/**
 * Ein Query-Cache der optimistisch aktualisiert werden soll.
 * `queryKey` identifiziert den Cache, `updater` berechnet den neuen Wert.
 */
export interface OptimisticTarget<TVariables> {
  queryKey: QueryKey;
  updater: (oldData: unknown, variables: TVariables) => unknown;
}

interface UseOptimisticMutationOptions<
  TData = unknown,
  TError = Error,
  TVariables = unknown,
  TContext = unknown,
  TQueryFnData = unknown,
> extends Omit<UseMutationOptions<TData, TError, TVariables, TContext>, "onMutate" | "onError" | "onSettled"> {
  /**
   * Query-Key des Caches der optimistisch aktualisiert wird.
   * Für Multi-Query-Updates `targets` verwenden.
   */
  queryKey?: QueryKey;
  /**
   * Funktion die den neuen Cache-Wert aus dem alten + Variablen berechnet.
   * Wird ignoriert wenn `targets` gesetzt ist.
   */
  updater?: OptimisticUpdater<TQueryFnData, TVariables>;
  /**
   * Multi-Query-Optimistic: mehrere Caches gleichzeitig aktualisieren.
   * Jeder Target hat eigene `queryKey` + `updater`.
   * Wenn gesetzt, werden `queryKey`/`updater` ignoriert.
   *
   * @example
   * targets: [
   *   { queryKey: ["corpus-files-list"], updater: (old, vars) => old?.filter(f => f.path !== vars.path) },
   *   { queryKey: ["corpus-files-overview"], updater: (old, vars) => ({ ...old, totals: { ...old.totals, totalFiles: old.totals.totalFiles - 1 } }) },
   * ]
   */
  targets?: OptimisticTarget<TVariables>[];
  /**
   * Query-Keys die nach Erfolg/Fehler invalidiert werden.
   * Default: alle `targets` queryKeys + `queryKey` falls gesetzt.
   */
  invalidates?: QueryKey[];
  /**
   * Optionaler onError-Handler — wird NACH dem automatischen Rollback
   * aufgerufen. Für Toasts etc.
   *
   * `hadSnapshot` ist `true` wenn mindestens ein Target-Cache Daten hatte
   * (d.h. der Rollback hat einen echten Vorzustand wiederhergestellt).
   * Bei `false` war der Cache leer — "wiederhergestellt" wäre irreführend.
   */
  onError?: (error: TError, variables: TVariables, hadSnapshot: boolean) => void;
  /**
   * Optionaler onSuccess-Handler — wird nach dem automatischen Invalidate
   * aufgerufen. Für Toasts etc.
   */
  onSuccess?: (data: TData, variables: TVariables) => void;
}

/**
 * `useOptimisticMutation` — wiederverwendbarer Wrapper für TanStack Query
 * Optimistic Updates mit automatischem Rollback.
 *
 * Unterstützt Single-Query (via `queryKey` + `updater`) und Multi-Query
 * (via `targets`) Optimistic Updates.
 *
 * Kapselt das Standard-Pattern:
 * 1. `onMutate`: cancelQueries → snapshot → setQueryData(updater) → return snapshots
 * 2. `onError`: rollback aller snapshots + optionaler onError-Callback
 * 3. `onSettled`: invalidateQueries + optionaler onSuccess-Callback
 *
 * ## Shared-Library-Nutzung
 *
 * Dieser Hook ist **komplett generisch** — keine Subsumio-spezifische Logik.
 * Er kann 1:1 in andere Projekte ausgelagert werden. Abhängigkeiten:
 * - `@tanstack/react-query` (useMutation, useQueryClient, QueryKey, types)
 * - React ("use client" directive für Next.js App Router)
 *
 * Empfohlener Export-Pfad in einer shared Library:
 * ```ts
 * // @your-org/react-hooks
 * export { useOptimisticMutation } from "./use-optimistic-mutation";
 * export type { OptimisticTarget, UseOptimisticMutationOptions } from "./use-optimistic-mutation";
 * ```
 *
 * ## Single-Query Example
 * ```ts
 * const publishMutation = useOptimisticMutation({
 *   mutationFn: (data: { paths?: string[] }) => postJSON("/api/publish", data),
 *   queryKey: ["corpus-import-queue"],
 *   updater: (old, variables) => {
 *     if (!old) return old;
 *     const pathsToRemove = new Set(variables.paths ?? old.eintraege.map(e => e.pfad));
 *     const verbleibend = old.eintraege.filter(e => !pathsToRemove.has(e.pfad));
 *     return { offen: verbleibend.length, eintraege: verbleibend };
 *   },
 *   onSuccess: (data) => addToast({ title: "Abgeräumt", type: "success" }),
 *   onError: (err) => addToast({ title: "Fehler", description: err.message, type: "error" }),
 * });
 * ```
 *
 * ## Multi-Query Example
 * ```ts
 * const deleteMutation = useOptimisticMutation({
 *   mutationFn: (data: { path: string }) => postJSON("/api/delete", data),
 *   targets: [
 *     { queryKey: ["corpus-files-list"], updater: (old, vars) => ({ ...old, files: old.files.filter(f => f.path !== vars.path), total: old.total - 1 }) },
 *     { queryKey: ["corpus-files-overview"], updater: (old, vars) => ({ ...old, totals: { ...old.totals, totalFiles: old.totals.totalFiles - 1 } }) },
 *   ],
 *   onSuccess: () => addToast({ title: "Gelöscht", type: "success" }),
 *   onError: (err) => addToast({ title: "Fehler", description: err.message, type: "error" }),
 * });
 * ```
 *
 * ## Visuelles Feedback
 *
 * Für optimistische UIs empfiehlt sich `opacity-50` + `aria-busy` auf den
 * betroffenen Elementen während `mutation.isPending`:
 * ```tsx
 * <div className={isPending ? "opacity-50" : ""} aria-busy={isPending}>
 * ```
 * Die `variables` können genutzt werden um zu prüfen ob ein spezifisches
 * Item betroffen ist: `mutation.variables?.id === item.id`.
 */
export function useOptimisticMutation<
  TData = unknown,
  TError = Error,
  TVariables = unknown,
  TContext = unknown,
  TQueryFnData = unknown,
>(
  options: UseOptimisticMutationOptions<TData, TError, TVariables, TContext, TQueryFnData>,
): UseMutationResult<TData, TError, TVariables, { rollback: () => void; hadSnapshot: boolean }> {
  const queryClient = useQueryClient();
  const { queryKey, updater, targets, invalidates, onError, onSuccess, ...rest } = options;

  // Targets auflösen: explizite targets > single queryKey+updater.
  const effectiveTargets: OptimisticTarget<TVariables>[] = targets ?? (queryKey && updater
    ? [{ queryKey, updater: updater as unknown as (oldData: unknown, variables: TVariables) => unknown }]
    : []);

  // Invalidates: explizit > alle target queryKeys.
  const effectiveInvalidates = invalidates ?? effectiveTargets.map((t) => t.queryKey);

  // Guard: mindestens ein Target oder explizite invalidates nötig,
  // sonst läuft die Mutation ohne Cache-Update und ohne Invalidierung.
  if (effectiveTargets.length === 0 && effectiveInvalidates.length === 0) {
    throw new Error(
      "useOptimisticMutation: mindestens eines von `targets`, `queryKey`+`updater`, `invalidates` muss gesetzt sein",
    );
  }

  return useMutation<TData, TError, TVariables, { rollback: () => void; hadSnapshot: boolean }>({
    ...rest,
    onMutate: async (variables) => {
      // Snapshots für alle Targets — für Rollback bei Fehler.
      const snapshots: Array<{ queryKey: QueryKey; data: unknown }> = [];

      for (const target of effectiveTargets) {
        // Ausgehende Refetches abbrechen — sonst überschreiben sie den
        // optimistischen Write sofort (TanStack-Best-Practice).
        await queryClient.cancelQueries({ queryKey: target.queryKey });

        // Snapshot für Rollback.
        const snapshot = queryClient.getQueryData(target.queryKey);
        snapshots.push({ queryKey: target.queryKey, data: snapshot });

        // Optimistic Write.
        queryClient.setQueryData(target.queryKey, (old) => target.updater(old, variables));
      }

      // hadSnapshot: true wenn mindestens ein Target Daten im Cache hatte.
      // onError nutzt das um zu entscheiden ob "wiederhergestellt" stimmt.
      const hadSnapshot = snapshots.some((s) => s.data !== undefined);

      // Rollback-Funktion: stellt alle Snapshots wieder her.
      return {
        rollback: () => {
          for (const snap of snapshots) {
            queryClient.setQueryData(snap.queryKey, snap.data);
          }
        },
        hadSnapshot,
      };
    },
    onError: (error, variables, context) => {
      // Automatischer Rollback aller Snapshots.
      context?.rollback();
      // Optionaler User-Callback (Toasts etc.) — mit hadSnapshot info.
      onError?.(error, variables, context?.hadSnapshot ?? false);
    },
    onSuccess: (data, variables, _context) => {
      onSuccess?.(data, variables);
    },
    onSettled: () => {
      // Immer invalidieren — synchronisiert Cache mit Server-Truth.
      // Pro Key einzeln invalidieren (invalidateQueries nimmt einen Key,
      // kein Array von Keys).
      for (const key of effectiveInvalidates) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
