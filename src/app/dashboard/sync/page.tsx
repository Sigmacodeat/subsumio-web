"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GitMerge, Check, Copy, Trash2, Eye, RefreshCw, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useMutationQueue } from "@/lib/use-mutation";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import type { BrainPage } from "@/lib/types";
import type { QueuedMutation } from "@/lib/offline-store";
import { diffConflictFields, diffContentLines } from "@/lib/conflict-diff";
import { PageHeader } from "@/components/dashboard/page-header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowSkeleton } from "@/components/dashboard/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function conflictAgeDays(conflictAt?: string): number {
  if (!conflictAt) return 0;
  return Math.floor((Date.now() - new Date(conflictAt).getTime()) / 86_400_000);
}

function ConflictCard({ mut }: { mut: QueuedMutation }) {
  const { t } = useLang();
  const { resolveConflict } = useMutationQueue();
  const [server, setServer] = useState<BrainPage | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loadingServer, setLoadingServer] = useState(true);
  const [busy, setBusy] = useState(false);

  const slug = typeof mut.payload.slug === "string" ? mut.payload.slug : "";
  const href = `/dashboard/brain/${slug.split("/").map(encodeURIComponent).join("/")}`;
  const ageDays = conflictAgeDays(mut.conflictAt);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setLoadingServer(false);
      return;
    }
    api.brain
      .getPage(slug)
      .then((p) => {
        if (!cancelled) setServer(p);
      })
      .catch((e) => {
        if (!cancelled) setServerError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingServer(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const confirm = useConfirm();
  const resolve = useCallback(
    async (mode: "keep-mine" | "discard" | "rename") => {
      if (mode === "keep-mine") {
        const ok = await confirm({
          title: t("sync.confirm_keep_title" as DashboardKey),
          message: t("sync.confirm_keep_msg" as DashboardKey),
          confirmLabel: t("sync.confirm_overwrite" as DashboardKey),
          variant: "danger",
        });
        if (!ok) return;
      }
      setBusy(true);
      try {
        await resolveConflict(mut.id, mode);
      } finally {
        setBusy(false);
      }
    },
    [mut.id, resolveConflict, confirm, t]
  );

  const diffs = server ? diffConflictFields(mut, server) : [];
  const contentDiff =
    server && typeof mut.payload.content === "string"
      ? diffContentLines(mut.payload.content, server.content)
      : null;

  return (
    <div className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <GitMerge size={15} aria-hidden className="shrink-0 text-[color:var(--ds-warning-text)]" />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-[color:var(--ds-text)]">
          {slug || mut.id}
        </span>
        <span className="rounded bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 text-[11px] text-[color:var(--ds-text-muted)]">
          {mut.type}
        </span>
        {ageDays > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-[color:var(--ds-warning-text)]">
            <Clock size={11} aria-hidden />
            seit {ageDays}d
          </span>
        )}
      </div>

      <div className="mt-3">
        {loadingServer && <RowSkeleton />}
        {serverError && (
          <p className="text-xs text-[color:var(--ds-danger-text)]">
            {t("sync.server_unavailable" as DashboardKey)}: {serverError}
          </p>
        )}
        {server && diffs.length === 0 && (
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {t("sync.no_field_diff" as DashboardKey)}
          </p>
        )}
        {diffs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-left text-[color:var(--ds-text-muted)]">
                  <th className="py-1.5 pr-3 font-medium">{t("sync.field" as DashboardKey)}</th>
                  <th className="py-1.5 pr-3 font-medium">{t("sync.local" as DashboardKey)}</th>
                  <th className="py-1.5 font-medium">{t("sync.server" as DashboardKey)}</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d) => (
                  <tr
                    key={d.field}
                    className="border-b border-[color:var(--ds-border)] last:border-0"
                  >
                    <td className="py-1.5 pr-3 font-mono text-[color:var(--ds-text)]">{d.field}</td>
                    <td className="max-w-[16rem] truncate py-1.5 pr-3 text-[color:var(--ds-warning-text)]">
                      {d.local}
                    </td>
                    <td className="max-w-[16rem] truncate py-1.5 text-[color:var(--ds-text-muted)]">
                      {d.server}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {contentDiff && (
          <div className="mt-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-2 font-mono text-[11px] leading-relaxed">
            {contentDiff.unchangedBefore > 0 && (
              <p className="text-[color:var(--ds-text-subtle)]">
                ⋯ {contentDiff.unchangedBefore} {t("sync.unchanged_lines" as DashboardKey)}
              </p>
            )}
            {contentDiff.localLines.map((line, i) => (
              <p
                key={`l${i}`}
                className="truncate text-[color:var(--ds-warning-text)]"
                title={line}
              >
                <span className="opacity-60 select-none">+ </span>
                {line || " "}
              </p>
            ))}
            {contentDiff.serverLines.map((line, i) => (
              <p key={`s${i}`} className="truncate text-[color:var(--ds-text-muted)]" title={line}>
                <span className="opacity-60 select-none">− </span>
                {line || " "}
              </p>
            ))}
            {contentDiff.truncated && (
              <p className="text-[color:var(--ds-text-subtle)]">
                ⋯ {t("sync.diff_truncated" as DashboardKey)}
              </p>
            )}
            {contentDiff.unchangedAfter > 0 && (
              <p className="text-[color:var(--ds-text-subtle)]">
                ⋯ {contentDiff.unchangedAfter} {t("sync.unchanged_lines" as DashboardKey)}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[color:var(--ds-text)] transition-colors hover:bg-[color:var(--ds-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ds-ring)]"
        >
          <Eye size={13} aria-hidden />
          {t("mobile.conflict_view" as DashboardKey)}
        </Link>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void resolve("keep-mine")}
        >
          <Check size={13} aria-hidden className="mr-1" />
          {t("mobile.conflict_keep" as DashboardKey)}
        </Button>
        {mut.type === "createPage" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void resolve("rename")}
          >
            <Copy size={13} aria-hidden className="mr-1" />
            {t("mobile.conflict_rename" as DashboardKey)}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void resolve("discard")}
          className="text-[color:var(--ds-danger-text)]"
        >
          <Trash2 size={13} aria-hidden className="mr-1" />
          {t("mobile.conflict_discard" as DashboardKey)}
        </Button>
      </div>
    </div>
  );
}

export default function SyncPage() {
  const { t } = useLang();
  const {
    conflicts,
    pendingCount,
    syncing,
    lastError,
    lastErrorAt,
    lastNotice,
    clearNotice,
    syncPending,
  } = useMutationQueue();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <PageHeader
        title={t("sync.title" as DashboardKey)}
        description={t("sync.description" as DashboardKey)}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("sync.title" as DashboardKey) },
        ]}
        actions={
          pendingCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={syncing}
              onClick={() => void syncPending()}
            >
              <RefreshCw
                size={13}
                aria-hidden
                className={cn("mr-1", syncing && "animate-spin motion-reduce:animate-none")}
              />
              {syncing ? t("mobile.syncing" as DashboardKey) : t("mobile.sync_now" as DashboardKey)}
            </Button>
          ) : undefined
        }
      />

      {lastError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-xs text-[color:var(--ds-danger-text)]"
        >
          {lastError}
          {lastErrorAt && (
            <span className="opacity-70">
              {" "}
              · {t("sync.error_since" as DashboardKey)}{" "}
              {new Date(lastErrorAt).toLocaleTimeString("de-AT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      )}

      {lastNotice && (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-4 py-3 text-xs text-[color:var(--ds-success-text)]">
          <span>{lastNotice}</span>
          <button
            type="button"
            onClick={clearNotice}
            aria-label={t("mobile.close" as DashboardKey)}
            className="shrink-0 rounded p-0.5 transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ds-ring)]"
          >
            ×
          </button>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {conflicts.length === 0 ? (
          <EmptyState
            icon={GitMerge}
            title={t("sync.no_conflicts" as DashboardKey)}
            description={t("sync.no_conflicts_desc" as DashboardKey)}
          />
        ) : (
          conflicts.map((c) => <ConflictCard key={c.id} mut={c} />)
        )}
      </div>
    </div>
  );
}
