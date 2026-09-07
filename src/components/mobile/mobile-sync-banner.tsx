"use client";

import { useEffect, useState, useCallback } from "react";
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useMutationQueue } from "@/lib/use-mutation";
import { useNetworkStatus } from "@/lib/use-offline-sync";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

export function MobileSyncBanner() {
  const { pendingCount, syncing, lastError, syncPending } = useMutationQueue();
  const isOnline = useNetworkStatus();
  const { t } = useLang();
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

  // Don't render anything if online, no pending, no error, no sync confirmation
  if (dismissed && !lastError) return null;
  if (isOnline && pendingCount === 0 && !lastError && !justSynced) return null;

  // Error state
  if (lastError && !dismissed) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-2 backdrop-blur-sm">
        <AlertTriangle size={16} className="shrink-0 text-[color:var(--ds-danger-text)]" />
        <span className="flex-1 truncate text-xs text-[color:var(--ds-danger-text)]">
          {t("mobile.sync_error" as DashboardKey)}: {lastError}
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
