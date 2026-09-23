"use client";

import { useEffect, useState, useCallback } from "react";
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertTriangle, X, GitMerge } from "lucide-react";
import { useMutationQueue } from "@/lib/use-mutation";
import { useNetworkStatus } from "@/lib/use-offline-sync";
import { useLang } from "@/lib/use-lang";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { DashboardKey } from "@/content/dashboard";

export function MobileSyncBanner() {
  const {
    pendingCount,
    syncing,
    lastError,
    lastErrorAt,
    lastNotice,
    conflicts,
    syncPending,
    resolveConflict,
    clearNotice,
  } = useMutationQueue();
  const isOnline = useNetworkStatus();
  const { t } = useLang();
  const confirm = useConfirm();
  const [dismissed, setDismissed] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  // Reset dismissed when new changes come in
  useEffect(() => {
    if (pendingCount > 0) setDismissed(false);
  }, [pendingCount]);

  // Show "synced" confirmation briefly after successful sync
  useEffect(() => {
    if (syncing) {
      setJustSynced(false);
    }
  }, [syncing]);

  const handleSync = useCallback(async () => {
    await syncPending();
    setJustSynced(true);
    setTimeout(() => setJustSynced(false), 3000);
  }, [syncPending]);

  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());

  // keep-mine ueberschreibt die Server-Version, discard loescht die
  // lokale Aenderung — beides destruktiv, beides mit Bestaetigung.
  const handleResolve = useCallback(
    async (id: string, mode: "keep-mine" | "discard" | "rename") => {
      if (mode === "keep-mine" || mode === "discard") {
        const ok = await confirm({
          title: t(
            (mode === "keep-mine"
              ? "sync.confirm_keep_title"
              : "sync.confirm_discard_title") as DashboardKey
          ),
          message: t(
            (mode === "keep-mine"
              ? "sync.confirm_keep_msg"
              : "sync.confirm_discard_msg") as DashboardKey
          ),
          confirmLabel: t(
            (mode === "keep-mine"
              ? "sync.confirm_overwrite"
              : "mobile.conflict_discard") as DashboardKey
          ),
          variant: "danger",
        });
        if (!ok) return;
      }
      setResolvingIds((s) => new Set(s).add(id));
      try {
        await resolveConflict(id, mode);
      } finally {
        setResolvingIds((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    },
    [confirm, resolveConflict, t]
  );

  // Don't render anything if online, no pending, no error, no sync confirmation
  if (dismissed && !lastError) return null;
  if (
    isOnline &&
    pendingCount === 0 &&
    conflicts.length === 0 &&
    !lastError &&
    !justSynced &&
    !lastNotice
  )
    return null;

  // Erfolgs-Hinweis (z. B. „Kopie gespeichert als …") — quittierbar
  if (lastNotice) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-4 py-2 backdrop-blur-sm">
        <CheckCircle2 size={16} className="shrink-0 text-[color:var(--ds-success-text)]" />
        <span className="flex-1 truncate text-xs text-[color:var(--ds-success-text)]">
          {lastNotice}
        </span>
        <button
          type="button"
          onClick={clearNotice}
          aria-label={t("mobile.close" as DashboardKey)}
          className="shrink-0 text-[color:var(--ds-success-text)] transition-opacity hover:opacity-70"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Conflict state — wartet auf User-Entscheidung, darf nicht dismissbar sein
  if (conflicts.length > 0) {
    return (
      <div
        role="alert"
        className="fixed inset-x-0 top-0 z-50 border-b border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-2 backdrop-blur-sm"
      >
        <div className="flex items-center gap-2">
          <GitMerge size={16} className="shrink-0 text-[color:var(--ds-warning-text)]" />
          <span className="flex-1 text-xs font-medium text-[color:var(--ds-warning-text)]">
            {conflicts.length}{" "}
            {t(
              (conflicts.length === 1
                ? "mobile.conflict_title"
                : "mobile.conflict_title_plural") as DashboardKey
            )}
          </span>
        </div>
        <ul className="mt-1.5 space-y-1.5">
          {conflicts.slice(0, 3).map((c) => {
            const slug = typeof c.payload.slug === "string" ? c.payload.slug : "";
            const href = `/dashboard/brain/${slug.split("/").map(encodeURIComponent).join("/")}`;
            const ageDays = c.conflictAt
              ? Math.floor((Date.now() - new Date(c.conflictAt).getTime()) / 86_400_000)
              : 0;
            return (
              <li
                key={c.id}
                className="flex items-center gap-2 text-xs text-[color:var(--ds-warning-text)]"
              >
                <span className="min-w-0 flex-1 truncate font-mono">
                  {slug || c.type}
                  {ageDays > 0 && <span className="opacity-70"> · seit {ageDays}d</span>}
                </span>
                <a
                  href={href}
                  className="shrink-0 underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-70"
                >
                  {t("mobile.conflict_view" as DashboardKey)}
                </a>
                <button
                  type="button"
                  disabled={resolvingIds.has(c.id)}
                  onClick={() => void handleResolve(c.id, "keep-mine")}
                  className="shrink-0 rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-[color:var(--ds-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ds-ring)] disabled:opacity-50"
                >
                  {t("mobile.conflict_keep" as DashboardKey)}
                </button>
                {c.type === "createPage" && (
                  <button
                    type="button"
                    disabled={resolvingIds.has(c.id)}
                    onClick={() => void handleResolve(c.id, "rename")}
                    className="shrink-0 rounded px-1.5 py-0.5 transition-colors hover:bg-[color:var(--ds-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ds-ring)] disabled:opacity-50"
                  >
                    {t("mobile.conflict_rename" as DashboardKey)}
                  </button>
                )}
                <button
                  type="button"
                  disabled={resolvingIds.has(c.id)}
                  onClick={() => void handleResolve(c.id, "discard")}
                  className="shrink-0 rounded px-1.5 py-0.5 transition-colors hover:bg-[color:var(--ds-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ds-ring)]"
                >
                  {t("mobile.conflict_discard" as DashboardKey)}
                </button>
              </li>
            );
          })}
          {conflicts.length > 3 && (
            <li className="text-xs text-[color:var(--ds-warning-text)] opacity-70">
              <a
                href="/dashboard/sync"
                className="underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-70"
              >
                +{conflicts.length - 3} weitere — alle anzeigen
              </a>
            </li>
          )}
          {pendingCount > 0 && (
            <li className="text-xs text-[color:var(--ds-warning-text)] opacity-70">
              {pendingCount} weitere Änderung(en) ausstehend
            </li>
          )}
        </ul>
      </div>
    );
  }

  // Error state
  if (lastError && !dismissed) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-2 backdrop-blur-sm">
        <AlertTriangle size={16} className="shrink-0 text-[color:var(--ds-danger-text)]" />
        <span className="flex-1 truncate text-xs text-[color:var(--ds-danger-text)]">
          {t("mobile.sync_error" as DashboardKey)}: {lastError}
          {lastErrorAt && (
            <span className="opacity-70">
              {" "}
              · seit {new Date(lastErrorAt).toLocaleTimeString("de-AT")}
            </span>
          )}
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-[color:var(--ds-danger-text)] transition-opacity hover:opacity-70"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // Synced confirmation
  if (justSynced && pendingCount === 0) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-4 py-2 backdrop-blur-sm">
        <CheckCircle2 size={16} className="shrink-0 text-[color:var(--ds-success-text)]" />
        <span className="flex-1 text-xs text-[color:var(--ds-success-text)]">
          {t("mobile.sync_complete" as DashboardKey)}
        </span>
      </div>
    );
  }

  // Offline with pending changes
  if (!isOnline && pendingCount > 0) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-2 backdrop-blur-sm">
        <CloudOff size={16} className="shrink-0 text-[color:var(--ds-warning-text)]" />
        <span className="flex-1 text-xs text-[color:var(--ds-warning-text)]">
          {pendingCount} {t("mobile.changes_offline" as DashboardKey)}
        </span>
      </div>
    );
  }

  // Online with pending changes
  if (isOnline && pendingCount > 0) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-4 py-2 backdrop-blur-sm">
        <Cloud size={16} className="shrink-0 text-[color:var(--ds-info-text)]" />
        <span className="flex-1 text-xs text-[color:var(--ds-info-text)]">
          {syncing
            ? t("mobile.syncing" as DashboardKey)
            : `${pendingCount} ${t("mobile.changes_pending" as DashboardKey)}`}
        </span>
        {!syncing && (
          <button
            onClick={handleSync}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-[color:var(--ds-info-text)] transition-opacity hover:opacity-70"
          >
            <RefreshCw size={12} />
            {t("mobile.sync_now" as DashboardKey)}
          </button>
        )}
        {syncing && (
          <RefreshCw size={12} className="shrink-0 animate-spin text-[color:var(--ds-info-text)]" />
        )}
      </div>
    );
  }

  return null;
}
