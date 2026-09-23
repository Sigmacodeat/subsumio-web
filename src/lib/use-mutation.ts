"use client";

import { useSyncExternalStore } from "react";
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
const NOTICE_DISMISS_MS = 8000;

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
  /** Synctbare Eintraege — Konflikte warten auf User-Entscheidung und
   *  zaehlen hier nicht mit (sonst steht "3 ausstehend" obwohl nur 1
   *  wirklich gesynct wird). */
  pendingCount: number;
  /** Anteil der pendingCount aus der File-Upload-Queue — damit UI
   *  ehrlich „N Änderungen + M Uploads" statt nur „N Änderungen"
   *  sagen kann. */
  pendingUploads: number;
  /** Auf Entscheidung wartende Sync-Konflikte. */
  conflictCount: number;
  syncing: boolean;
  lastError: string | null;
  /** Zeitpunkt des ERSTEN Fehlers der aktuellen Fehlerstrecke — bleibt
   *  stehen solange lastError non-null ist ("klebt seit …" sichtbar). */
  lastErrorAt: number | null;
  /** Kurzer Erfolgs-Hinweis (z. B. „Kopie gespeichert als cases/neu-2") —
   *  wird im Sync-Banner gezeigt und via clearNotice quittiert. */
  lastNotice: string | null;
  conflicts: QueuedMutation[];
}

/** `cases/neu` → `cases/neu-2`, `cases/neu-2` → `cases/neu-3` —
 *  zählt einen trailing -N-Suffix hoch statt -2-2-Ketten zu bauen. */
export function nextCopySlug(slug: string): string {
  const m = slug.match(/^(.*)-(\d+)$/);
  return m ? `${m[1]}-${parseInt(m[2], 10) + 1}` : `${slug}-2`;
}

/** Konflikte älter als so viele Tage eskalieren das Nav-Badge von
 *  warning auf danger — ein Konflikt, der eine Woche liegen bleibt,
 *  ist ein Datenverlust-Risiko, keine Unbequemlichkeit mehr. */
export const STALE_CONFLICT_DAYS = 7;

/** Alter eines Konflikts in Tagen — fehlendes `conflictAt` zählt als
 *  0 (unbekanntes Alter ist kein Alarm-Grund, sortiert ans Ende). */
export function conflictAgeDays(conflictAt?: string): number {
  if (!conflictAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(conflictAt).getTime()) / 86_400_000));
}

/** Älteste Konflikte zuerst — die gekappten 3er-Listen in Banner und
 *  Sidebar sollen die dringendsten zeigen, nicht die zuerst
 *  gequeueten. Gibt eine neue Array-Instanz zurück (Store-Snapshots
 *  sind immutable — nie in-place sortieren). */
export function sortConflictsOldestFirst(conflicts: QueuedMutation[]): QueuedMutation[] {
  return [...conflicts].sort(
    (a, b) => conflictAgeDays(b.conflictAt) - conflictAgeDays(a.conflictAt)
  );
}

/** Alter des ältesten Konflikts in Tagen (0 wenn kein `conflictAt`
 *  gesetzt ist). Geteilt zwischen Sidebar- und Tab-Bar-Badge, damit
 *  die Eskalations-Schwelle nicht doppelt gepflegt wird. */
export function oldestConflictDays(conflicts: QueuedMutation[]): number {
  let oldest = 0;
  for (const c of conflicts) {
    const days = conflictAgeDays(c.conflictAt);
    if (days > oldest) oldest = days;
  }
  return oldest;
}

/** „N Änderung(en) + M Upload(s) <suffix>" — pendingCount enthält
 *  Mutations + Uploads; nur die Summe würde Uploads als
 *  Seiten-Änderungen verkaufen. `t` ist die Dashboard-`t()` aus
 *  useLang, suffixKey z. B. "mobile.pending_suffix". */
export function formatPendingLabel(
  t: (key: string) => string,
  pendingCount: number,
  pendingUploads: number,
  suffixKey: string
): string {
  const mutations = pendingCount - pendingUploads;
  const parts: string[] = [];
  if (mutations > 0) parts.push(`${mutations} ${t("mobile.changes_short")}`);
  if (pendingUploads > 0) parts.push(`${pendingUploads} ${t("mobile.uploads_short")}`);
  return `${parts.join(" + ")} ${t(suffixKey)}`;
}

// ---------------------------------------------------------------------------
// Module-level store: Banner, Sidebar, Sync-Page und Tab-Bar teilen sich
// denselben Queue-State — ein resolveConflict auf /dashboard/sync muss auch
// den MobileSyncBanner aktualisieren, sonst zeigt jede Oberfläche andere
// Notices/Fehler. useSyncExternalStore statt Context: kein Provider nötig,
// funktioniert layout-übergreifend (mobile + dashboard mounten getrennt).
// ---------------------------------------------------------------------------

const initialState: MutationState = {
  pendingCount: 0,
  pendingUploads: 0,
  conflictCount: 0,
  syncing: false,
  lastError: null,
  lastErrorAt: null,
  lastNotice: null,
  conflicts: [],
};

let state: MutationState = initialState;
const listeners = new Set<() => void>();
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

function setState(updater: (s: MutationState) => MutationState) {
  const prev = state;
  state = updater(state);
  // Erfolgs-Notices verschwinden nach kurzer Zeit von selbst —
  // Fehler bleiben bewusst kleben bis dismissed.
  if (state.lastNotice !== prev.lastNotice) {
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    if (state.lastNotice) {
      noticeTimer = setTimeout(() => {
        noticeTimer = null;
        setState((s) => ({ ...s, lastNotice: null }));
      }, NOTICE_DISMISS_MS);
    }
  }
  for (const l of listeners) l();
}

async function refreshPending() {
  const [pending, pendingFiles] = await Promise.all([
    getPendingMutations(),
    getPendingFileUploads(),
  ]);
  const conflicts = pending.filter((m) => m.conflicted);
  setState((s) => ({
    ...s,
    pendingCount: pending.length - conflicts.length + pendingFiles.length,
    pendingUploads: pendingFiles.length,
    conflictCount: conflicts.length,
    conflicts,
  }));
}

async function syncPending() {
  if (!isOnline() || state.syncing) return;
  setState((s) => ({ ...s, syncing: true, lastError: null, lastErrorAt: null }));
  const syncStart = Date.now();
  let droppedMutations = 0;
  let droppedUploads = 0;
  let syncedMutations = 0;
  let syncedUploads = 0;
  let failedItems = 0;
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
        syncedMutations++;
      } catch (err) {
        console.error(
          "[mutation-sync] failed for",
          mut.id,
          err instanceof Error ? err.message : String(err)
        );
        await incrementMutationRetries(mut.id);
        failedItems++;
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
        syncedUploads++;
      } catch (err) {
        console.error(
          "[file-upload-sync] failed for",
          fu.id,
          err instanceof Error ? err.message : String(err)
        );
        await incrementFileUploadRetries(fu.id);
        failedItems++;
      }
    }
    await refreshPending();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setState((s) => ({
      ...s,
      lastError: msg,
      lastErrorAt: s.lastError ? s.lastErrorAt : Date.now(),
    }));
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
    if (failedItems > 0) parts.push(`${failedItems} fehlgeschlagen (erneuter Versuch ausstehend)`);
    const dropMsg = parts.length > 0 ? `${parts.join("; ")} — nicht synchronisiert` : null;
    const syncedTotal = syncedMutations + syncedUploads;
    let notice: string | null = null;
    if (syncedTotal > 0 && !dropMsg) {
      const done: string[] = [];
      if (syncedMutations > 0) done.push(`${syncedMutations} Änderung(en)`);
      if (syncedUploads > 0) done.push(`${syncedUploads} Datei(en)`);
      notice = `${done.join(" und ")} synchronisiert`;
    }
    setState((s) => {
      const merged = [s.lastError, dropMsg].filter(Boolean).join(" — ") || null;
      return {
        ...s,
        syncing: false,
        lastError: merged,
        lastErrorAt: merged ? (s.lastErrorAt ?? Date.now()) : null,
        lastNotice: notice ?? s.lastNotice,
      };
    });
  }
}

/** Konflikt auflösen: "keep-mine" replayed die gequeuete Änderung
 *  erneut (bewusstes Überschreiben), "discard" verwirft sie,
 *  "rename" (nur createPage) legt sie unter einem neuen Slug an —
 *  `customSlug` überschreibt den Auto-Namen `<slug>-N`. */
async function resolveConflict(
  id: string,
  mode: "keep-mine" | "discard" | "rename",
  customSlug?: string,
  refreshAfter = true
) {
  if (mode === "discard") {
    const pending = await getPendingMutations();
    const slug = pending.find((m) => m.id === id)?.payload.slug;
    await removeMutation(id);
    setState((s) => ({
      ...s,
      lastNotice: `Änderung${typeof slug === "string" && slug ? ` an ${slug}` : ""} verworfen`,
    }));
    if (refreshAfter) await refreshPending();
    return;
  }
  const pending = await getPendingMutations();
  const mut = pending.find((m) => m.id === id && m.conflicted);
  if (!mut) {
    if (refreshAfter) await refreshPending();
    return;
  }
  const slug = typeof mut.payload.slug === "string" ? mut.payload.slug : "";
  try {
    if (mode === "rename") {
      if (mut.type !== "createPage") return;
      if (!slug) return;
      const custom = customSlug?.trim();
      const copySlug = custom && /^[\w\-/]+$/.test(custom) ? custom : nextCopySlug(slug);
      // Ziel-Slug darf nicht bereits existieren — sonst waere das
      // rename ein neuer Silent-Overwrite.
      let slugTaken = false;
      try {
        await api.brain.getPage(copySlug);
        slugTaken = true;
      } catch {
        /* 404/Read-Fehler → Slug frei */
      }
      if (slugTaken) {
        throw new Error(`Slug ${copySlug} existiert bereits`);
      }
      await api.brain.createPage({
        ...(mut.payload as {
          slug: string;
          title: string;
          type: string;
          content?: string;
          frontmatter?: Record<string, unknown>;
        }),
        slug: copySlug,
      });
      setState((s) => ({
        ...s,
        lastNotice: `Kopie gespeichert als ${copySlug}`,
      }));
    } else {
      await replayMutation(mut);
      setState((s) => ({
        ...s,
        lastNotice: `Änderung${slug ? ` an ${slug}` : ""} gesendet`,
      }));
    }
    await removeMutation(mut.id);
  } catch (err) {
    setState((s) => ({
      ...s,
      lastError: err instanceof Error ? err.message : String(err),
      lastErrorAt: s.lastError ? s.lastErrorAt : Date.now(),
    }));
  }
  if (refreshAfter) await refreshPending();
}

/** Alle offenen Konflikte mit demselben Modus auflösen — bei >3
 *  Konflikten ist Einzelklick mühsam. keep-mine/discard sind
 *  destruktiv → Aufrufer MUSS vorher bestätigen. "rename" ist
 *  nicht-destruktiv und greift nur für createPage-Konflikte —
 *  der Aufrufer sollte den Button nur bei reiner createPage-
 *  Liste anbieten. */
async function resolveAllConflicts(mode: "keep-mine" | "discard" | "rename") {
  // refreshPending pro Item waere ein IDB-Re-Read je Konflikt — bei
  // grossen Bulk-Listen spuerbar. Einmal am Ende reicht: die Queue
  // in IDB ist die Quelle, der Store folgt danach.
  for (const c of state.conflicts) {
    await resolveConflict(c.id, mode, undefined, false);
  }
  await refreshPending();
}

async function mutate<T>(
  type: "createPage" | "updatePage" | "deletePage",
  payload: Record<string, unknown>,
  onlineFetcher: () => Promise<T>
): Promise<T | null> {
  if (isOnline()) {
    const result = await onlineFetcher();
    await refreshPending();
    return result;
  }
  // Offline: enqueue
  await enqueueMutation({ type, payload });
  await refreshPending();
  return null;
}

function clearNotice() {
  setState((s) => ({ ...s, lastNotice: null }));
}

const onOnline = () => {
  void syncPending();
};

function subscribe(listener: () => void) {
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) {
    // Einmalig beim ersten Konsumenten: Initial-Refresh, Online-Listener
    // und der IDB-Error-Reporter (vorher pro Komponenten-Instanz →
    // doppelte syncPending-Calls beim online-Event).
    void refreshPending();
    window.addEventListener("online", onOnline);
    setOfflineErrorReporter((err, context) => {
      setState((s) => ({ ...s, lastError: `[${context}] ${err.message}` }));
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("online", onOnline);
      setOfflineErrorReporter(null);
    }
  };
}

const getSnapshot = () => state;

export function useMutationQueue() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...snapshot,
    syncPending,
    mutate,
    refreshPending,
    resolveConflict,
    resolveAllConflicts,
    clearNotice,
  };
}

/** Nur für Tests: globalen Queue-State zurücksetzen (State lebt jetzt
 *  module-level und überlebt einzelne renderHook-Instanzen). */
export function __resetMutationQueueForTests() {
  state = initialState;
}
