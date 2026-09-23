"use client";

import { useState, useCallback, useEffect } from "react";
import { api } from "./api";
import {
  isOnline,
  enqueueMutation,
  getPendingMutations,
  removeMutation,
  incrementMutationRetries,
  setMutationConflicted,
  setOfflineErrorReporter,
  getPendingFileUploads,
  removeFileUpload,
  incrementFileUploadRetries,
  type QueuedMutation,
} from "./offline-store";

const MAX_RETRIES = 5;
/** Client-`createdAt` vs. Server-`updated_at`: Toleranz gegen Uhren-Skew,
 *  sonst wirkt ein Server mit vorgehender Uhr wie ein externer Edit. */
const SKEW_TOLERANCE_MS = 60_000;

async function replayMutation(mut: QueuedMutation): Promise<void> {
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
}

interface MutationState {
  pendingCount: number;
  syncing: boolean;
  lastError: string | null;
  conflicts: QueuedMutation[];
}

export function useMutationQueue() {
  const [state, setState] = useState<MutationState>({
    pendingCount: 0,
    syncing: false,
    lastError: null,
    conflicts: [],
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
    setState((s) => ({
      ...s,
      pendingCount: pending.length + pendingFiles.length,
      conflicts: pending.filter((m) => m.conflicted),
    }));
  }, []);

  const syncPending = useCallback(async () => {
    if (!isOnline()) return;
    setState((s) => ({ ...s, syncing: true, lastError: null }));
    const syncStart = Date.now();
    let droppedMutations = 0;
    let droppedUploads = 0;
    const conflicts: string[] = [];
    try {
      const pending = await getPendingMutations();
      for (const mut of pending) {
        if (mut.conflicted) continue; // wartet auf User-Entscheidung
        const retryCount = mut.retries ?? 0;
        if (retryCount >= MAX_RETRIES) {
          console.warn(`[mutation-sync] dropping ${mut.id} after ${MAX_RETRIES} retries`);
          await removeMutation(mut.id);
          droppedMutations++;
          continue;
        }
        try {
          const slug = typeof mut.payload.slug === "string" ? mut.payload.slug : "";
          if (mut.type === "createPage" && slug) {
            try {
              await api.brain.getPage(slug);
              // Seite existiert bereits — create wuerde sie
              // ueberschreiben. Konflikt statt Silent-Overwrite.
              await setMutationConflicted(mut.id, true);
              conflicts.push(slug);
              continue;
            } catch {
              /* 404/Read-Fehler → frei, erstellen */
            }
          } else if (mut.type === "updatePage" && slug) {
            try {
              const current = await api.brain.getPage(slug);
              const updatedAt = new Date(current.updated_at).getTime();
              if (
                updatedAt > new Date(mut.createdAt).getTime() + SKEW_TOLERANCE_MS &&
                updatedAt <= syncStart + SKEW_TOLERANCE_MS
              ) {
                // Externe Änderung zwischen Offline-Edit und Sync —
                // still überschreiben würde parallele Edits verlieren
                // lassen. Writes aus diesem Replay (updated_at >
                // syncStart) zählen nicht als Konflikt, sonst würde ein
                // zweites eigenes Queued-Update falsch verwarfen.
                // Bleibt als `conflicted` in der Queue — User entscheidet.
                await setMutationConflicted(mut.id, true);
                conflicts.push(slug);
                continue;
              }
            } catch {
              /* Read fehlgeschlagen — Replay versuchen */
            }
          }
          await replayMutation(mut);
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
          droppedUploads++;
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
      const parts: string[] = [];
      if (conflicts.length > 0) {
        const shown = conflicts.slice(0, 3).join(", ");
        parts.push(
          `${conflicts.length} Sync-Konflikt(e) bei ${shown}${conflicts.length > 3 ? " …" : ""} — bitte entscheiden`
        );
      }
      if (droppedMutations > 0) parts.push(`${droppedMutations} Änderung(en)`);
      if (droppedUploads > 0) parts.push(`${droppedUploads} Datei-Upload(s)`);
      const dropMsg = parts.length > 0 ? `${parts.join("; ")} — nicht synchronisiert` : null;
      setState((s) => ({
        ...s,
        syncing: false,
        lastError: [s.lastError, dropMsg].filter(Boolean).join(" — ") || null,
      }));
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

  /** Konflikt auflösen: "keep-mine" replayed die gequeuete Änderung
   *  erneut (bewusstes Überschreiben), "discard" verwirft sie,
   *  "rename" (nur createPage) legt sie unter `<slug>-2` als Kopie an. */
  const resolveConflict = useCallback(
    async (id: string, mode: "keep-mine" | "discard" | "rename") => {
      if (mode === "discard") {
        await removeMutation(id);
        await refreshPending();
        return;
      }
      const pending = await getPendingMutations();
      const mut = pending.find((m) => m.id === id && m.conflicted);
      if (!mut) {
        await refreshPending();
        return;
      }
      try {
        if (mode === "rename") {
          if (mut.type !== "createPage") return;
          const slug = typeof mut.payload.slug === "string" ? mut.payload.slug : "";
          if (!slug) return;
          await api.brain.createPage({
            ...(mut.payload as {
              slug: string;
              title: string;
              type: string;
              content?: string;
              frontmatter?: Record<string, unknown>;
            }),
            slug: `${slug}-2`,
          });
        } else {
          await replayMutation(mut);
        }
        await removeMutation(mut.id);
      } catch (err) {
        setState((s) => ({
          ...s,
          lastError: err instanceof Error ? err.message : String(err),
        }));
      }
      await refreshPending();
    },
    [refreshPending]
  );

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

  return { ...state, syncPending, mutate, refreshPending, resolveConflict };
}
