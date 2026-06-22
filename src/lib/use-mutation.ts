"use client";

import { useState, useCallback, useEffect } from "react";
import { api } from "./api";
import {
  isOnline,
  enqueueMutation,
  getPendingMutations,
  removeMutation,
  incrementMutationRetries,
  setOfflineErrorReporter,
  getPendingFileUploads,
  removeFileUpload,
  incrementFileUploadRetries,
} from "./offline-store";

const MAX_RETRIES = 5;

interface MutationState {
  pendingCount: number;
  syncing: boolean;
  lastError: string | null;
}

export function useMutationQueue() {
  const [state, setState] = useState<MutationState>({
    pendingCount: 0,
    syncing: false,
    lastError: null,
  });

  // Wire IndexedDB errors into the hook's lastError state
  useEffect(() => {
    setOfflineErrorReporter((err, context) => {
      setState((s) => ({ ...s, lastError: `[${context}] ${err.message}` }));
    });
    return () => {
      setOfflineErrorReporter(null);
    };
  }, []);

  const refreshPending = useCallback(async () => {
    const [pending, pendingFiles] = await Promise.all([
      getPendingMutations(),
      getPendingFileUploads(),
    ]);
    setState((s) => ({ ...s, pendingCount: pending.length + pendingFiles.length }));
  }, []);

  const syncPending = useCallback(async () => {
    if (!isOnline()) return;
    setState((s) => ({ ...s, syncing: true, lastError: null }));
    try {
      const pending = await getPendingMutations();
      for (const mut of pending) {
        const retryCount = mut.retries ?? 0;
        if (retryCount >= MAX_RETRIES) {
          console.warn(`[mutation-sync] dropping ${mut.id} after ${MAX_RETRIES} retries`);
          await removeMutation(mut.id);
          continue;
        }
        try {
          if (mut.type === "createPage") {
            await api.brain.createPage(
              mut.payload as {
                slug: string;
                title: string;
                type: string;
                content?: string;
                frontmatter?: Record<string, unknown>;
              }
            );
          } else if (mut.type === "updatePage") {
            await api.brain.updatePage(
              mut.payload as {
                slug: string;
                title?: string;
                content?: string;
                frontmatter?: Record<string, unknown>;
              }
            );
          } else if (mut.type === "deletePage") {
            const slug = typeof mut.payload.slug === "string" ? mut.payload.slug : "";
            if (!slug) throw new Error("deletePage mutation missing slug");
            try {
              await api.brain.deletePage(slug);
            } catch (err) {
              if (err instanceof Error && err.message.includes("404")) {
                // Tombstone: page already deleted — treat as success
              } else {
                throw err;
              }
            }
          }
          await removeMutation(mut.id);
        } catch (err) {
          console.error(
            "[mutation-sync] failed for",
            mut.id,
            err instanceof Error ? err.message : String(err)
          );
          await incrementMutationRetries(mut.id);
        }
      }
      await refreshPending();

      // C2: Sync pending file uploads from IndexedDB
      const pendingFiles = await getPendingFileUploads();
      for (const fu of pendingFiles) {
        const retryCount = fu.retries ?? 0;
        if (retryCount >= MAX_RETRIES) {
          console.warn(`[file-upload-sync] dropping ${fu.id} after ${MAX_RETRIES} retries`);
          await removeFileUpload(fu.id);
          continue;
        }
        try {
          const file = new File([fu.bytes], fu.fileName, { type: fu.fileType || undefined });
          await api.upload.file(file, fu.metadata);
          await removeFileUpload(fu.id);
        } catch (err) {
          console.error(
            "[file-upload-sync] failed for",
            fu.id,
            err instanceof Error ? err.message : String(err)
          );
          await incrementFileUploadRetries(fu.id);
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

  const mutate = useCallback(
    async <T>(
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
    },
    [refreshPending]
  );

  return { ...state, syncPending, mutate, refreshPending };
}
