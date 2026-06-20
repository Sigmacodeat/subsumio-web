"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Loader2, ShieldCheck, Clock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/page-header";

interface WhatsAppStatus {
  configured: boolean;
  verifyToken: boolean;
  appSecret: boolean;
  accessToken: boolean;
  phoneNumberId: boolean;
  mediaStorageProvider: string;
  mediaStorageDir: string;
  mediaMaxBytes: number;
  blobConfigured: boolean;
  allowedSenders: Array<{ brainId: string; userId?: string; name?: string; role?: string; phoneLast4: string }>;
  webhookUrl: string;
}

function front(page: BrainPage): Record<string, unknown> {
  return page.frontmatter ?? {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export default function WhatsAppDashboardPage() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [actions, setActions] = useState<BrainPage[]>([]);
  const [inbox, setInbox] = useState<BrainPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [statusRes, actionPages, inboxPages] = await Promise.all([
          api.whatsapp.status().catch(() => null),
          api.brain.listPages({ type: "chat_action", limit: 100 }).catch(() => []),
          api.brain.listPages({ type: "chat_inbox", limit: 100 }).catch(() => []),
        ]);
        if (cancelled) return;
        setStatus(statusRes);
        setActions(actionPages);
        setInbox(inboxPages);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "WhatsApp-Status konnte nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    return actions.reduce((acc, page) => {
      const status = text(front(page).status) || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [actions]);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="WhatsApp Copilot"
        description="Interner Kanzlei-Assistent für Superbrain-Erfassung und Abfragen"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "WhatsApp" }]}
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[color:var(--ds-text-muted)]">
          <Loader2 size={20} className="animate-spin mr-2" /> Lade WhatsApp Copilot…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Metric label="Konfiguration" value={status?.configured ? "bereit" : "offen"} ok={Boolean(status?.configured)} />
            <Metric label="Pending Actions" value={String(counts.pending_confirmation || 0)} warn={(counts.pending_confirmation || 0) > 0} />
            <Metric label="Ausgeführt" value={String(counts.executed || 0)} ok />
            <Metric label="Inbox" value={String(inbox.length)} />
          </div>

          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-600" />
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Setup</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <SetupFlag label="Verify Token" ok={Boolean(status?.verifyToken)} />
              <SetupFlag label="App Secret" ok={Boolean(status?.appSecret)} />
              <SetupFlag label="Access Token" ok={Boolean(status?.accessToken)} />
              <SetupFlag label="Phone ID" ok={Boolean(status?.phoneNumberId)} />
              <SetupFlag label="Allowlist" ok={(status?.allowedSenders.length || 0) > 0} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
                <span className="text-[color:var(--ds-text-muted)]">Storage Provider</span>
                <div className="text-[color:var(--ds-text)] mt-1">{status?.mediaStorageProvider || "local"}</div>
              </div>
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
                <span className="text-[color:var(--ds-text-muted)]">Media Storage</span>
                <div className="text-[color:var(--ds-text)] font-mono break-all mt-1">
                  {status?.mediaStorageProvider === "vercel-blob" ? (status.blobConfigured ? "Vercel Blob" : "Blob Token fehlt") : (status?.mediaStorageDir || ".data/whatsapp-media")}
                </div>
              </div>
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
                <span className="text-[color:var(--ds-text-muted)]">Media Limit</span>
                <div className="text-[color:var(--ds-text)] mt-1">{Math.round((status?.mediaMaxBytes || 0) / 1024 / 1024)} MB pro Datei</div>
              </div>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text-muted)] font-mono break-all">
              {status?.webhookUrl || "/api/whatsapp/webhook"}
            </div>
            {status?.allowedSenders?.length ? (
              <div className="space-y-2">
                {status.allowedSenders.map((sender, idx) => (
                  <div key={`${sender.brainId}-${idx}`} className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs">
                    <span className="text-[color:var(--ds-text)]">{sender.name || "Erlaubter Sender"} · ****{sender.phoneLast4}</span>
                    <span className="text-[color:var(--ds-text-muted)]">{sender.brainId}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-600">Keine erlaubten WhatsApp-Sender konfiguriert.</p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LogPanel title="Chat Actions" pages={actions} />
            <LogPanel title="Inbox" pages={inbox} />
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, ok, warn }: { label: string; value: string; ok?: boolean; warn?: boolean }) {
  const color = ok ? "text-emerald-600" : warn ? "text-amber-600" : "text-[color:var(--ds-text)]";
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
    </div>
  );
}

function SetupFlag({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
      {ok ? <CheckCircle2 size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-red-600" />}
      <span className="text-[color:var(--ds-text-muted)]">{label}</span>
    </div>
  );
}

function LogPanel({ title, pages }: { title: string; pages: BrainPage[] }) {
  const sorted = [...pages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20);
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 space-y-3">
      <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">{title}</h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-[color:var(--ds-text-muted)] py-6">Noch keine Einträge.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((page) => {
            const fm = front(page);
            const status = text(fm.status) || text(fm.intent) || "received";
            return (
              <div key={page.slug} className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-[color:var(--ds-text)] truncate">{page.title}</div>
                  <Badge variant="default" className="text-[10px] border brand-border brand-soft brand-text">
                    {status}
                  </Badge>
                </div>
                <div className="text-[11px] text-[color:var(--ds-text-muted)] flex items-center gap-1">
                  <Clock size={10} /> {new Date(page.created_at).toLocaleString("de-DE")}
                  {text(fm.intent) && <span> · {text(fm.intent)}</span>}
                </div>
                {text(fm.error) && (
                  <div className="text-[11px] text-red-700 flex items-center gap-1">
                    <AlertTriangle size={10} /> {text(fm.error)}
                  </div>
                )}
                {page.content && <p className="text-xs text-[color:var(--ds-text-muted)] line-clamp-2">{page.content}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
