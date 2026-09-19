"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/use-lang";
import { Loader2, CheckCircle2, XCircle, FileText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTION_LABELS, type AgentActionFrontmatter } from "@/lib/approval";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/dashboard/skeleton";
import { csrfFetch } from "@/lib/csrf";

interface ActionItem extends AgentActionFrontmatter {
  slug: string;
  title: string;
}

/** Ausführungsstand in Kanzleisprache — nie den rohen Statuscode zeigen. */
const EXECUTION_LABELS: Record<string, string> = {
  not_started: "noch nicht ausgeführt",
  running: "wird ausgeführt",
  executed: "ausgeführt",
  failed: "Ausführung fehlgeschlagen",
  skipped: "nicht ausgeführt",
};

function fmOf(page: { frontmatter?: Record<string, unknown> }): Partial<AgentActionFrontmatter> {
  return (page.frontmatter ?? {}) as Partial<AgentActionFrontmatter>;
}

export default function ApprovalsPage() {
  const { t } = useLang();
  // Alle Seiten laden (die Engine liefert je Abfrage höchstens 100), gelöschte ausgefiltert.
  const pagesQuery = useQuery({
    queryKey: ["approvals", "agent_action"],
    queryFn: () => api.brain.listAllPages({ type: "agent_action", max: 2000 }),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loading = pagesQuery.isLoading;

  const items = useMemo<ActionItem[]>(() => {
    const pages = pagesQuery.data;
    if (!Array.isArray(pages)) return [];
    const mapped: ActionItem[] = pages.map((p) => {
      const fm = fmOf(p);
      return {
        slug: p.slug,
        title: p.title,
        type: "agent_action",
        action_type: fm.action_type ?? "document_finalize",
        status: fm.status ?? "pending",
        proposed_by: fm.proposed_by ?? "—",
        target_slug: fm.target_slug,
        summary: fm.summary ?? p.title,
        proposed_at: fm.proposed_at ?? "",
        decided_at: fm.decided_at,
        decided_by: fm.decided_by,
        reject_reason: fm.reject_reason,
        execution_status: fm.execution_status,
        execution_result: fm.execution_result,
        executed_at: fm.executed_at,
        executed_by: fm.executed_by,
        execution_error: fm.execution_error,
      };
    });
    mapped.sort((a, b) => (b.proposed_at || "").localeCompare(a.proposed_at || ""));
    return mapped;
  }, [pagesQuery.data]);

  async function decide(item: ActionItem, status: "approved" | "rejected", rejectReason?: string) {
    setBusy(item.slug);
    setError(null);
    try {
      const res = await csrfFetch("/api/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.slug,
          decision: status,
          reject_reason: rejectReason,
          execute: status === "approved",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { code?: string } | null;
        setError(
          body?.code === "approval_execution_failed"
            ? "Die Freigabe wurde gespeichert, die Aktion konnte aber nicht ausgeführt werden. Bitte prüfen Sie den betroffenen Eintrag."
            : res.status === 403
              ? "Sie haben keine Berechtigung, diese Aktion freizugeben."
              : "Die Entscheidung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut."
        );
      } else {
        setRejecting(null);
        setReason("");
      }
      await pagesQuery.refetch();
    } catch {
      setError("Die Entscheidung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
    } finally {
      setBusy(null);
    }
  }

  const pending = items.filter((i) => i.status === "pending");
  const decided = items.filter((i) => i.status !== "pending");

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("approvals.title")}
        description={t("approvals.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("approvals.breadcrumb") },
        ]}
      />

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3" role="status" aria-label={t("aria.loading")}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="space-y-2.5 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <Skeleton className="h-4 w-2/3 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : pagesQuery.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          Die Freigaben konnten nicht geladen werden. Bitte laden Sie die Seite neu.
        </div>
      ) : (
        <>
          {/* Offen */}
          <section className="space-y-3">
            <h2 className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase">
              {t("approvals.pending_title")}
              {pending.length > 0 && <span className="ml-1 tabular-nums">({pending.length})</span>}
            </h2>
            {pending.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title={t("approvals.empty")}
                description="Hier erscheinen Vorschläge des Assistenten, die erst nach Ihrer Freigabe wirksam werden — etwa einen Schriftsatz freigeben, eine Frist notieren, eine Buchung anlegen oder eine Nachricht versenden."
              />
            ) : (
              pending.map((item) => (
                <div
                  key={item.slug}
                  className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default" className="text-xs">
                        {ACTION_LABELS[item.action_type] ?? "Aktion"}
                      </Badge>
                      <span className="min-w-0 text-sm font-medium text-[color:var(--ds-text)]">
                        {item.summary}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {t("approvals.proposed_by")} {item.proposed_by}
                      {item.proposed_at ? (
                        <span className="tabular-nums"> · {formatDateTime(item.proposed_at)}</span>
                      ) : null}
                    </p>
                    {item.target_slug && (
                      <Link
                        href={`/dashboard/brain/${encodeURIComponent(item.target_slug)}`}
                        className="brand-text mt-1.5 inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        <FileText size={11} aria-hidden="true" /> Betroffenen Eintrag öffnen
                      </Link>
                    )}
                  </div>

                  {rejecting === item.slug ? (
                    <div className="space-y-2">
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        placeholder={t("approvals.reject_placeholder")}
                        aria-label={t("approvals.reject_reason")}
                        className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm leading-relaxed text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--ds-danger-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          className="whitespace-nowrap"
                          onClick={() => decide(item, "rejected", reason.trim() || undefined)}
                          disabled={busy === item.slug}
                        >
                          {busy === item.slug ? (
                            <Loader2 size={13} className="animate-spin" aria-hidden />
                          ) : (
                            <XCircle size={13} aria-hidden />
                          )}
                          {t("approvals.reject_confirm")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRejecting(null);
                            setReason("");
                          }}
                        >
                          {t("approvals.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        className="whitespace-nowrap"
                        onClick={() => decide(item, "approved")}
                        disabled={busy === item.slug}
                      >
                        {busy === item.slug ? (
                          <Loader2 size={13} className="animate-spin" aria-hidden />
                        ) : (
                          <CheckCircle2 size={13} aria-hidden />
                        )}
                        {t("approvals.approve_execute")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="whitespace-nowrap"
                        onClick={() => {
                          setRejecting(item.slug);
                          setReason("");
                        }}
                        disabled={busy === item.slug}
                      >
                        <XCircle size={13} aria-hidden />
                        {t("approvals.reject")}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>

          {/* Entschieden */}
          {decided.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                {t("approvals.decided_title")}{" "}
                <span className="tabular-nums">({decided.length})</span>
              </h2>
              <div className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                {decided.map((item) => (
                  <div key={item.slug} className="p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.status === "approved" ? (
                        <Badge
                          variant="default"
                          className="border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-xs text-[color:var(--ds-success-text)]"
                        >
                          {t("approvals.status_approved")}
                        </Badge>
                      ) : (
                        <Badge
                          variant="default"
                          className="border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs text-[color:var(--ds-danger-text)]"
                        >
                          {t("approvals.status_rejected")}
                        </Badge>
                      )}
                      <span className="min-w-0 text-sm text-[color:var(--ds-text)]">
                        {item.summary}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {item.decided_by ? `${item.decided_by} · ` : ""}
                      {item.decided_at ? (
                        <span className="tabular-nums">{formatDateTime(item.decided_at)}</span>
                      ) : null}
                      {item.execution_status && item.execution_status !== "failed"
                        ? ` · ${EXECUTION_LABELS[item.execution_status] ?? ""}`
                        : ""}
                    </p>
                    {(item.execution_error || item.execution_status === "failed") && (
                      <p
                        className="mt-1 text-xs text-[color:var(--ds-danger-text)]"
                        title={item.execution_error || undefined}
                      >
                        Die Aktion wurde freigegeben, konnte aber nicht ausgeführt werden.
                      </p>
                    )}
                    {item.reject_reason && (
                      <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                        {t("approvals.reason_label")}: {item.reject_reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
