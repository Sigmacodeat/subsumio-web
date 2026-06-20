"use client";

import { useState, useMemo } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  UserCheck,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ACTION_LABELS, type AgentActionFrontmatter } from "@/lib/approval";
import { usePages, useUpdatePage } from "@/lib/queries/brain";
import { useMe } from "@/lib/queries/auth";
import { PageHeader } from "@/components/dashboard/page-header";

interface ActionItem extends AgentActionFrontmatter {
  slug: string;
  title: string;
}

function fmOf(page: { frontmatter?: Record<string, unknown> }): Partial<AgentActionFrontmatter> {
  return (page.frontmatter ?? {}) as Partial<AgentActionFrontmatter>;
}

export default function ApprovalsPage() {
  const pagesQuery = usePages({ type: "agent_action", limit: 200 });
  const meQuery = useMe();
  const updateMutation = useUpdatePage();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const decider = meQuery.data?.user?.email ?? meQuery.data?.user?.name ?? "";
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
      };
    });
    mapped.sort((a, b) => (b.proposed_at || "").localeCompare(a.proposed_at || ""));
    return mapped;
  }, [pagesQuery.data]);

  async function decide(item: ActionItem, status: "approved" | "rejected", rejectReason?: string) {
    setBusy(item.slug);
    setError(null);
    try {
      const now = new Date().toISOString();
      await updateMutation.mutateAsync({
        slug: item.slug,
        frontmatter: {
          status,
          decided_at: now,
          decided_by: decider || "unbekannt",
          ...(rejectReason ? { reject_reason: rejectReason } : {}),
        },
      });
      if (item.target_slug && item.action_type === "document_finalize") {
        await updateMutation.mutateAsync({
          slug: item.target_slug,
          frontmatter: { status: status === "approved" ? "approved" : "rejected" },
        });
      }
      setRejecting(null);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    } finally {
      setBusy(null);
    }
  }

  const pending = items.filter((i) => i.status === "pending");
  const decided = items.filter((i) => i.status !== "pending");

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Freigaben"
        description="Vier-Augen-Prinzip — KI-/Agenten-Vorschläge werden erst durch eine zweite Person wirksam"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Freigaben" }]}
      />

      {/* Honest framing */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border brand-border brand-soft/5" role="note">
        <Info size={16} className="brand-text shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs brand-text/90 leading-relaxed">
          Risikoreiche Aktionen (Schriftsatz freigeben, Frist notieren, Buchung, Versand) werden
          <strong> nicht autonom </strong> wirksam. Sie landen hier und brauchen die Freigabe einer
          zweiten Person — berufsrechtliche Letztverantwortung + EU-AI-Act-Aufsichtspflicht
          (Annex&nbsp;III).
        </p>
      </div>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-20" role="status" aria-label="Lädt">
          <Loader2 size={24} className="brand-text animate-spin" aria-hidden="true" />
        </div>
      ) : (
        <>
          {/* Offen */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-amber-600" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Offen ({pending.length})</h2>
            </div>
            {pending.length === 0 ? (
              <p className="text-sm text-[color:var(--ds-text-muted)] py-6 text-center">Keine offenen Freigaben.</p>
            ) : (
              pending.map((item) => (
                <div key={item.slug} className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="default" className="text-[10px] border brand-soft brand-text brand-border">
                          {ACTION_LABELS[item.action_type]}
                        </Badge>
                        <span className="text-sm font-medium text-[color:var(--ds-text)] truncate">{item.summary}</span>
                      </div>
                      <p className="text-xs text-[color:var(--ds-text-muted)] mt-1">
                        Eingereicht von {item.proposed_by}
                        {item.proposed_at ? ` · ${new Date(item.proposed_at).toLocaleString("de-DE")}` : ""}
                      </p>
                      {item.target_slug && (
                        <a
                          href={`/dashboard/brain/${encodeURIComponent(item.target_slug)}`}
                          className="inline-flex items-center gap-1 mt-1.5 text-xs brand-text hover:underline font-mono"
                        >
                          <FileText size={11} aria-hidden="true" /> {item.target_slug}
                        </a>
                      )}
                    </div>
                  </div>

                  {rejecting === item.slug ? (
                    <div className="space-y-2">
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        placeholder="Grund der Ablehnung (für die Akte dokumentiert)…"
                        aria-label="Grund der Ablehnung"
                        className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-red-500/50 resize-y"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => decide(item, "rejected", reason.trim() || undefined)}
                          disabled={busy === item.slug}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-xs font-medium disabled:opacity-60"
                        >
                          {busy === item.slug ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                          Ablehnung bestätigen
                        </button>
                        <button
                          onClick={() => { setRejecting(null); setReason(""); }}
                          className="px-3 py-1.5 rounded-lg text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decide(item, "approved")}
                        disabled={busy === item.slug}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-60"
                      >
                        {busy === item.slug ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        Freigeben
                      </button>
                      <button
                        onClick={() => { setRejecting(item.slug); setReason(""); }}
                        disabled={busy === item.slug}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[color:var(--ds-border)] text-xs text-[color:var(--ds-text-muted)] hover:text-red-600 hover:border-red-500/30 disabled:opacity-60"
                      >
                        <XCircle size={13} />
                        Ablehnen
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>

          {/* Entschieden */}
          {decided.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <UserCheck size={14} className="text-[color:var(--ds-text-muted)]" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Entschieden ({decided.length})</h2>
              </div>
              {decided.map((item) => (
                <div key={item.slug} className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.status === "approved" ? (
                      <Badge variant="default" className="text-[10px] border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Freigegeben</Badge>
                    ) : (
                      <Badge variant="default" className="text-[10px] border bg-red-500/10 text-red-600 border-red-500/20">Abgelehnt</Badge>
                    )}
                    <span className="text-sm text-[color:var(--ds-text)] truncate">{item.summary}</span>
                  </div>
                  <p className="text-xs text-[color:var(--ds-text-muted)] mt-1">
                    {item.decided_by ? `${item.decided_by} · ` : ""}
                    {item.decided_at ? new Date(item.decided_at).toLocaleString("de-DE") : ""}
                  </p>
                  {item.reject_reason && (
                    <p className="text-xs text-red-600/80 mt-1">Grund: {item.reject_reason}</p>
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
