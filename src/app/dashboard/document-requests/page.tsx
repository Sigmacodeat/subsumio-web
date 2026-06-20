"use client";

import { useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  FileClock,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type RequestStatus = "draft" | "sent" | "partially_fulfilled" | "fulfilled" | "expired";

interface DocumentRequestRecord {
  slug: string;
  title: string;
  content?: string;
  frontmatter: {
    type: "document_request";
    case_slug: string;
    recipient_role: "client" | "lawyer" | "assistant" | "other";
    channel: "whatsapp" | "portal" | "email" | "manual";
    status: RequestStatus;
    items: Array<{ key: string; label: string; required: boolean; received_document_slug?: string }>;
    portal_token_id?: string;
    portal_url?: string;
    source_event_slug?: string;
    message_draft?: string;
    created_at: string;
    sent_at?: string;
    updated_at: string;
  };
}

const FILTERS: Array<{ key: "all" | RequestStatus; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "draft", label: "Entwurf" },
  { key: "sent", label: "Gesendet" },
  { key: "partially_fulfilled", label: "Teilweise" },
  { key: "fulfilled", label: "Erledigt" },
  { key: "expired", label: "Abgelaufen" },
];

function listFromResponse(data: unknown): DocumentRequestRecord[] {
  if (!data || typeof data !== "object") return [];
  const items = (data as { requests?: unknown }).requests;
  if (!Array.isArray(items)) return [];
  return items as DocumentRequestRecord[];
}

function createdLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("de-DE");
}

export default function DocumentRequestsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | RequestStatus>("all");
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState({
    case_slug: "",
    items: "",
    message_draft: "",
    include_portal_link: true,
  });

  const listQuery = useQuery({
    queryKey: ["document-requests", "list"],
    queryFn: () => api.documentRequests.list({ limit: 200 }),
  });

  const updateMutation = useMutation({
    mutationFn: api.documentRequests.update,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document-requests", "list"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: api.documentRequests.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document-requests", "list"] });
      setCreateForm({
        case_slug: "",
        items: "",
        message_draft: "",
        include_portal_link: true,
      });
    },
  });

  const items = useMemo(() => listFromResponse(listQuery.data), [listQuery.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.frontmatter.status !== filter) return false;
      if (!q) return true;
      const haystack = [
        item.title,
        item.frontmatter.case_slug,
        item.frontmatter.message_draft,
        item.frontmatter.items.map((i) => i.label).join(" "),
        item.frontmatter.channel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, filter, search]);

  const metrics = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.frontmatter.status] = (acc[item.frontmatter.status] || 0) + 1;
      return acc;
    }, {});
  }, [items]);

  async function updateStatus(item: DocumentRequestRecord, status: RequestStatus) {
    await updateMutation.mutateAsync({
      slug: item.slug,
      status,
      ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}),
    });
  }

  async function createRequest() {
    const caseSlug = createForm.case_slug.trim();
    if (!caseSlug) return;
    const items = createForm.items
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    await createMutation.mutateAsync({
      case_slug: caseSlug,
      items: items.length ? items : undefined,
      message_draft: createForm.message_draft.trim() || undefined,
      include_portal_link: createForm.include_portal_link,
      channel: "whatsapp",
      recipient_role: "client",
      status: "draft",
    });
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Dokumentenanfragen"
        description="Offene Unterlagenanforderungen, Versandstatus und Fulfillment im Blick"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Dokumentenanfragen" }]}
        actions={
          <button
            onClick={() => void qc.invalidateQueries({ queryKey: ["document-requests", "list"] })}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[color:var(--ds-border)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-hover)]"
          >
            <RefreshCw size={16} />
            Aktualisieren
          </button>
        }
      />

      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border brand-border brand-soft/5" role="note">
        <AlertCircle size={16} className="brand-text shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs brand-text/90 leading-relaxed">
          Dokumentenanfragen sind der Fulfillment-Teil des WhatsApp-Workflows: hier wird sichtbar,
          was angefordert, gesendet und später tatsächlich erfüllt wurde.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Metric label="Entwürfe" value={metrics.draft || 0} tone="amber" />
        <Metric label="Gesendet" value={metrics.sent || 0} tone="blue" />
        <Metric label="Teilweise" value={metrics.partially_fulfilled || 0} tone="slate" />
        <Metric label="Erledigt" value={metrics.fulfilled || 0} tone="emerald" />
      </div>

      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-[color:var(--ds-text-muted)]" />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Dokumentenanfrage anlegen</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={createForm.case_slug}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, case_slug: e.target.value }))}
            placeholder="Akte, z. B. legal/cases/2026-014"
            className="md:col-span-2 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--ds-border-strong)]"
          />
          <textarea
            value={createForm.items}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, items: e.target.value }))}
            placeholder="Unterlagen, eine pro Zeile"
            rows={3}
            className="md:col-span-2 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--ds-border-strong)]"
          />
          <textarea
            value={createForm.message_draft}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, message_draft: e.target.value }))}
            placeholder="Nachrichtenentwurf"
            rows={3}
            className="md:col-span-2 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--ds-border-strong)]"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
          <input
            type="checkbox"
            checked={createForm.include_portal_link}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, include_portal_link: e.target.checked }))}
          />
          Portal-Link mit erzeugen
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Manuell für WhatsApp, Portal oder Mail anlegen.
          </p>
          <button
            onClick={() => void createRequest()}
            disabled={createMutation.isPending || !createForm.case_slug.trim()}
            className="inline-flex items-center gap-2 rounded-lg brand-bg px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Anlegen
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              onClick={() => setFilter(entry.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                filter === entry.key
                  ? "brand-bg text-white border-transparent"
                  : "border-[color:var(--ds-border)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-hover)]",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Dokumentenanfrage suchen…"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-9 pr-3 py-2 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--ds-border-strong)]"
          />
        </div>
      </div>

      {listQuery.isLoading ? (
        <div className="flex items-center justify-center py-20 text-[color:var(--ds-text-muted)]">
          <Loader2 size={20} className="animate-spin mr-2" /> Lade Dokumentenanfragen…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-10 text-center">
          <FileClock size={20} className="mx-auto mb-2 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">Keine Dokumentenanfragen für den aktuellen Filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.slug} className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default" className="text-[10px] border brand-soft brand-border brand-text">
                      {item.frontmatter.channel}
                    </Badge>
                    <Badge variant="default" className="text-[10px] border bg-amber-500/10 border-amber-500/20 text-amber-600">
                      {item.frontmatter.status}
                    </Badge>
                    <Badge variant="default" className="text-[10px] border bg-slate-500/10 border-slate-500/20 text-slate-600">
                      {item.frontmatter.recipient_role}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-semibold text-[color:var(--ds-text)] truncate">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[color:var(--ds-text-muted)] line-clamp-2">
                    {item.frontmatter.message_draft || item.content || "Keine Nachricht gespeichert."}
                  </p>
                </div>
                <div className="text-right text-xs text-[color:var(--ds-text-muted)] shrink-0">
                  <div className="flex items-center justify-end gap-1">
                    <Clock size={12} />
                    {createdLabel(item.frontmatter.created_at)}
                  </div>
                  <div className="mt-1 font-mono">{item.slug}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
                <div className="space-y-2 text-xs text-[color:var(--ds-text-muted)]">
                  <div className="flex flex-wrap gap-2">
                    <span>Akte: {item.frontmatter.case_slug}</span>
                    {item.frontmatter.sent_at && <span>Gesendet: {createdLabel(item.frontmatter.sent_at)}</span>}
                  </div>
                  {item.frontmatter.source_event_slug && (
                    <a
                      href={`/dashboard/brain/${encodeURIComponent(item.frontmatter.source_event_slug)}`}
                      className="inline-flex items-center gap-1 text-[color:var(--ds-text)] hover:underline font-mono"
                    >
                      <Send size={12} />
                      {item.frontmatter.source_event_slug}
                    </a>
                  )}
                  {item.frontmatter.portal_url && (
                    <button
                      onClick={() => void navigator.clipboard.writeText(item.frontmatter.portal_url || "")}
                      className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-mono break-all"
                    >
                      <Copy size={12} />
                      Portal: {item.frontmatter.portal_url}
                    </button>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {item.frontmatter.items.map((doc) => (
                      <Badge key={doc.key} variant="default" className="text-[10px] border bg-blue-500/10 border-blue-500/20 text-blue-700">
                        {doc.label}
                        {doc.required ? " *" : ""}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 min-w-[280px]">
                  <ActionButton
                    label="Als gesendet"
                    icon={Send}
                    onClick={() => void updateStatus(item, "sent")}
                    disabled={updateMutation.isPending}
                  />
                  <ActionButton
                    label="Teilweise erfüllt"
                    icon={CheckCircle2}
                    onClick={() => void updateStatus(item, "partially_fulfilled")}
                    disabled={updateMutation.isPending}
                  />
                  <ActionButton
                    label="Erfüllt"
                    icon={CheckCircle2}
                    onClick={() => void updateStatus(item, "fulfilled")}
                    disabled={updateMutation.isPending}
                  />
                  <ActionButton
                    label="Abgelaufen"
                    icon={XCircle}
                    onClick={() => void updateStatus(item, "expired")}
                    disabled={updateMutation.isPending}
                    danger
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "blue" | "slate" }) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "blue"
          ? "text-blue-600"
          : "text-[color:var(--ds-text)]";
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className={cn("text-lg font-bold", toneClass)}>{value}</div>
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
        danger
          ? "border-red-500/20 bg-red-500/5 text-red-600 hover:bg-red-500/10"
          : "border-[color:var(--ds-border)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-hover)]",
      )}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}
