"use client";

import { useState, useCallback, useEffect } from "react";
import { api } from "./api";
import { isOnline, enqueueMutation, getPendingMutations, removeMutation, setOfflineErrorReporter } from "./offline-store";

interface MutationState {
  pendingCount: number;
  syncing: boolean;
  lastError: string | null;
}

export function useMutationQueue() {
  const [state, setState] = useState<MutationState>({ pendingCount: 0, syncing: false, lastError: null });

  // Wire IndexedDB errors into the hook's lastError state
  useEffect(() => {
    setOfflineErrorReporter((err, context) => {
      setState((s) => ({ ...s, lastError: `[${context}] ${err.message}` }));
    });
    return () => { setOfflineErrorReporter(null); };
  }, []);

  const refreshPending = useCallback(async () => {
    const pending = await getPendingMutations();
    setState((s) => ({ ...s, pendingCount: pending.length }));
  }, []);

  const syncPending = useCallback(async () => {
    if (!isOnline()) return;
    setState((s) => ({ ...s, syncing: true, lastError: null }));
    try {
      const pending = await getPendingMutations();
      for (const mut of pending) {
        try {
          if (mut.type === "createPage") {
            await api.brain.createPage(mut.payload as { slug: string; title: string; type: string; content?: string; frontmatter?: Record<string, unknown> });
          } else if (mut.type === "updatePage") {
            await api.brain.updatePage(mut.payload as { slug: string; title?: string; content?: string; frontmatter?: Record<string, unknown> });
          } else if (mut.type === "deletePage") {
            const slug = typeof mut.payload.slug === "string" ? mut.payload.slug : "";
            if (!slug) throw new Error("deletePage mutation missing slug");
            await api.brain.deletePage(slug);
          }
          await removeMutation(mut.id);
        } catch (err) {
          console.error("[mutation-sync] failed for", mut.id, err instanceof Error ? err.message : String(err));
          // Keep in queue for retry
        }
      }
      await refreshPending();
    } catch (err) {
      setState((s) => ({ ...s, lastError: err instanceof Error ? err.message : String(err) }));
    } finally {
      setState((s) => ({ ...s, syncing: false }));
    }
  }, [refreshPending]);

  // Refresh on mount and when coming back online
  useEffect(() => {
    refreshPending();
    const onOnline = () => {
      void syncPending();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refreshPending, syncPending]);

  const mutate = useCallback(async <T>(
    type: "createPage" | "updatePage" | "deletePage",
    payload: Record<string, unknown>,
    onlineFetcher: () => Promise<T>
  ): Promise<T | null> => {
    if (isOnline()) {
      const result = await onlineFetcher();
      await refreshPending();
      return result;
    }
    // Offline: enqueue
    await enqueueMutation({ type, payload });
    await refreshPending();
    return null;
  }, [refreshPending]);

  return { ...state, syncPending, mutate, refreshPending };
}
