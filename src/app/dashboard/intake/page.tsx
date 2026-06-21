"use client";

import { useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Inbox,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type IntakeStatus = "new" | "needs_info" | "conflict_check" | "accepted" | "rejected" | "converted";

interface IntakeRecord {
  slug: string;
  title: string;
  content?: string;
  frontmatter: {
    type: "intake_request";
    source: "whatsapp" | "portal" | "web" | "email" | "manual";
    status: IntakeStatus;
    client_name?: string;
    phone_hash?: string;
    email?: string;
    legal_area?: string;
    summary: string;
    missing_documents?: string[];
    conflict_check_status?: "pending" | "clear" | "conflict" | "needs_review";
    converted_case_slug?: string;
    source_event_slug?: string;
    created_at: string;
    updated_at: string;
  };
}

const FILTERS: Array<{ key: "all" | IntakeStatus; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "new", label: "Neu" },
  { key: "needs_info", label: "Info fehlt" },
  { key: "conflict_check", label: "Conflict Check" },
  { key: "accepted", label: "Akzeptiert" },
  { key: "rejected", label: "Abgelehnt" },
  { key: "converted", label: "Konvertiert" },
];

function listFromResponse(data: unknown): IntakeRecord[] {
  if (!data || typeof data !== "object") return [];
  const items = (data as { intakes?: unknown }).intakes;
  if (!Array.isArray(items)) return [];
  return items as IntakeRecord[];
}

function createdLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("de-DE");
}

export default function IntakePage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | IntakeStatus>("all");
  const [search, setSearch] = useState("");
  const [conversionTargets, setConversionTargets] = useState<Record<string, string>>({});
  const [createForm, setCreateForm] = useState({
    summary: "",
    client_name: "",
    email: "",
    phone_hash: "",
    legal_area: "",
  });

  const listQuery = useQuery({
    queryKey: ["intake", "list"],
    queryFn: () => api.intake.list({ limit: 200 }),
  });

  const updateMutation = useMutation({
    mutationFn: api.intake.update,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake", "list"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: api.intake.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake", "list"] });
      setCreateForm({ summary: "", client_name: "", email: "", phone_hash: "", legal_area: "" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: api.intake.convert,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intake", "list"] });
      qc.invalidateQueries({ queryKey: ["brain", "pages"] });
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
        item.frontmatter.summary,
        item.frontmatter.client_name,
        item.frontmatter.email,
        item.frontmatter.legal_area,
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

  async function updateStatus(
    item: IntakeRecord,
    status: IntakeStatus,
    convertedCaseSlug?: string
  ) {
    await updateMutation.mutateAsync({
      slug: item.slug,
      status,
      ...(convertedCaseSlug ? { converted_case_slug: convertedCaseSlug } : {}),
    });
  }

  async function convertToCase(item: IntakeRecord) {
    const desiredSlug = conversionTargets[item.slug]?.trim();
    await convertMutation.mutateAsync({
      slug: item.slug,
      case_slug: desiredSlug || undefined,
      title: item.frontmatter.client_name
        ? `${item.frontmatter.client_name}${item.frontmatter.legal_area ? ` - ${item.frontmatter.legal_area}` : ""}`
        : undefined,
      priority: "medium",
      portal_enabled: false,
    });
  }

  async function createIntake() {
    const summary = createForm.summary.trim();
    if (!summary) return;
    await createMutation.mutateAsync({
      source: "manual",
      summary,
      client_name: createForm.client_name.trim() || undefined,
      email: createForm.email.trim() || undefined,
      phone_hash: createForm.phone_hash.trim() || undefined,
      legal_area: createForm.legal_area.trim() || undefined,
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Intake"
        description="WhatsApp- und Portal-Anfragen triagieren, prüfen und in Akten überführen"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Intake" }]}
        actions={
          <Button
            variant="secondary"
            onClick={() => void qc.invalidateQueries({ queryKey: ["intake", "list"] })}
          >
            <RefreshCw size={16} />
            Aktualisieren
          </Button>
        }
      />

      <div
        className="brand-border brand-soft/5 flex items-start gap-3 rounded-xl border px-4 py-3"
        role="note"
      >
        <AlertCircle size={16} className="brand-text mt-0.5 shrink-0" aria-hidden="true" />
        <p className="brand-text/90 text-xs leading-relaxed">
          Intake ist die erste sichere Schleuse: WhatsApp, E-Mail und Web werden hier in eine
          prüfbare Mandatsaufnahme überführt, bevor etwas als Akte, Frist oder Nachricht wirksam
          wird.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Metric label="Neu" value={metrics.new || 0} tone="amber" />
        <Metric label="Rückfrage" value={metrics.needs_info || 0} tone="slate" />
        <Metric label="Freigegeben" value={metrics.accepted || 0} tone="emerald" />
        <Metric label="Konvertiert" value={metrics.converted || 0} tone="blue" />
      </div>

      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-[color:var(--ds-text-muted)]" />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Intake anlegen</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <textarea
            value={createForm.summary}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, summary: e.target.value }))}
            placeholder="Kurzbeschreibung der Anfrage"
            rows={3}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--ds-border-strong)] md:col-span-2"
          />
          <input
            value={createForm.client_name}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, client_name: e.target.value }))}
            placeholder="Mandant / Kontakt"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--ds-border-strong)]"
          />
          <input
            value={createForm.legal_area}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, legal_area: e.target.value }))}
            placeholder="Rechtsgebiet"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--ds-border-strong)]"
          />
          <input
            value={createForm.email}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="E-Mail"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--ds-border-strong)]"
          />
          <input
            value={createForm.phone_hash}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, phone_hash: e.target.value }))}
            placeholder="Phone Hash / WhatsApp-ID"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--ds-border-strong)]"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Manuelle Erfassung für Telefon, Mail oder Walk-in.
          </p>
          <Button
            onClick={() => void createIntake()}
            disabled={createMutation.isPending || !createForm.summary.trim()}
          >
            {createMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Anlegen
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              onClick={() => setFilter(entry.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                filter === entry.key
                  ? "brand-bg border-transparent text-white"
                  : "border-[color:var(--ds-border)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-hover)]"
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-80">
          <Search
            size={16}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Intake suchen…"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--ds-border-strong)]"
          />
        </div>
      </div>

      {listQuery.isLoading ? (
        <div className="flex items-center justify-center py-20 text-[color:var(--ds-text-muted)]">
          <Loader2 size={20} className="mr-2 animate-spin" /> Lade Intake…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-10 text-center">
          <Inbox size={20} className="mx-auto mb-2 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Keine Intakes für den aktuellen Filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.slug}
              className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="default"
                      className="brand-soft brand-border brand-text border text-xs"
                    >
                      {item.frontmatter.source}
                    </Badge>
                    <Badge
                      variant="default"
                      className="border border-amber-500/20 bg-amber-500/10 text-xs text-amber-600"
                    >
                      {item.frontmatter.status}
                    </Badge>
                    {item.frontmatter.conflict_check_status && (
                      <Badge
                        variant="default"
                        className="border border-slate-500/20 bg-slate-500/10 text-xs text-slate-600"
                      >
                        {item.frontmatter.conflict_check_status}
                      </Badge>
                    )}
                  </div>
                  <h3 className="truncate text-sm font-semibold text-[color:var(--ds-text)]">
                    {item.frontmatter.client_name || item.title}
                  </h3>
                  <p className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                    {item.frontmatter.summary}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-[color:var(--ds-text-muted)]">
                  <div className="flex items-center justify-end gap-1">
                    <Clock size={12} />
                    {createdLabel(item.frontmatter.created_at)}
                  </div>
                  <div className="mt-1 font-mono">{item.slug}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
                <div className="space-y-2 text-xs text-[color:var(--ds-text-muted)]">
                  <div className="flex flex-wrap gap-2">
                    {item.frontmatter.legal_area && (
                      <span>Gebiet: {item.frontmatter.legal_area}</span>
                    )}
                    {item.frontmatter.email && <span>Email: {item.frontmatter.email}</span>}
                    {item.frontmatter.phone_hash && (
                      <span>Phone Hash: {item.frontmatter.phone_hash.slice(0, 10)}…</span>
                    )}
                  </div>
                  {item.frontmatter.missing_documents?.length ? (
                    <div className="flex flex-wrap gap-2">
                      <span>Fehlt:</span>
                      {item.frontmatter.missing_documents.map((doc) => (
                        <Badge
                          key={doc}
                          variant="default"
                          className="border border-amber-500/20 bg-amber-500/10 text-xs text-amber-700"
                        >
                          {doc}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {item.frontmatter.source_event_slug && (
                    <a
                      href={`/dashboard/brain/${encodeURIComponent(item.frontmatter.source_event_slug)}`}
                      className="inline-flex items-center gap-1 font-mono text-[color:var(--ds-text)] hover:underline"
                    >
                      <MessageSquareText size={12} />
                      {item.frontmatter.source_event_slug}
                    </a>
                  )}
                  {item.frontmatter.phone_hash && (
                    <button
                      onClick={() =>
                        void navigator.clipboard.writeText(item.frontmatter.phone_hash || "")
                      }
                      className="inline-flex items-center gap-1 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                    >
                      <Copy size={12} />
                      Phone Hash kopieren
                    </button>
                  )}
                  {item.frontmatter.converted_case_slug && (
                    <a
                      href={`/dashboard/cases/${encodeURIComponent(item.frontmatter.converted_case_slug)}`}
                      className="inline-flex items-center gap-1 font-mono text-emerald-600 hover:underline"
                    >
                      <ChevronRight size={12} />
                      {item.frontmatter.converted_case_slug}
                    </a>
                  )}
                </div>

                <div className="flex min-w-[280px] flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                      label="Info anfordern"
                      icon={AlertCircle}
                      disabled={updateMutation.isPending}
                      onClick={() => void updateStatus(item, "needs_info")}
                    />
                    <ActionButton
                      label="Conflict Check"
                      icon={Clock}
                      disabled={updateMutation.isPending}
                      onClick={() => void updateStatus(item, "conflict_check")}
                    />
                    <ActionButton
                      label="Akzeptieren"
                      icon={CheckCircle2}
                      disabled={updateMutation.isPending}
                      onClick={() => void updateStatus(item, "accepted")}
                    />
                    <ActionButton
                      label="Ablehnen"
                      icon={XCircle}
                      disabled={updateMutation.isPending}
                      onClick={() => void updateStatus(item, "rejected")}
                      danger
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={
                        conversionTargets[item.slug] ?? item.frontmatter.converted_case_slug ?? ""
                      }
                      onChange={(e) =>
                        setConversionTargets((prev) => ({ ...prev, [item.slug]: e.target.value }))
                      }
                      placeholder="Ziel-Akte (optional)"
                      className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] outline-none focus:border-[color:var(--ds-border-strong)]"
                    />
                    <Button
                      onClick={() => void convertToCase(item)}
                      disabled={convertMutation.isPending}
                    >
                      {convertMutation.isPending ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : null}
                      Akte anlegen
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "blue" | "slate";
}) {
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
    <Button
      size="sm"
      variant={danger ? "danger" : "secondary"}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={12} />
      {label}
    </Button>
  );
}
