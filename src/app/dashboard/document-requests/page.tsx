"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Copy,
  FileClock,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { cn, encodeSlugPath, formatDateTime } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { useToast } from "@/components/ui/toast";
import type { Lang } from "@/content/site";

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
    items: Array<{
      key: string;
      label: string;
      required: boolean;
      received_document_slug?: string;
    }>;
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
  { key: "partially_fulfilled", label: "Teilweise erfüllt" },
  { key: "fulfilled", label: "Erfüllt" },
  { key: "expired", label: "Abgelaufen" },
];

const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Entwurf",
  sent: "Gesendet",
  partially_fulfilled: "Teilweise erfüllt",
  fulfilled: "Erfüllt",
  expired: "Abgelaufen",
};

const STATUS_TONE: Record<RequestStatus, string> = {
  draft:
    "border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]",
  sent: "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  partially_fulfilled:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  fulfilled:
    "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  expired:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
};

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  portal: "Mandantenportal",
  email: "E-Mail",
  manual: "Manuell",
};

const RECIPIENT_LABEL: Record<string, string> = {
  client: "an Mandant",
  lawyer: "an Anwalt",
  assistant: "an Kanzlei",
  other: "an Dritte",
};

const EMPTY_FORM = {
  case_slug: "",
  items: "",
  message_draft: "",
  include_portal_link: true,
};

function listFromResponse(data: unknown): DocumentRequestRecord[] {
  if (!data || typeof data !== "object") return [];
  const items = (data as { requests?: unknown }).requests;
  if (!Array.isArray(items)) return [];
  return items as DocumentRequestRecord[];
}

function createdLabel(lang: Lang, value: string): string {
  if (lang === "en") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-GB");
  }
  return formatDateTime(value);
}

export default function DocumentRequestsPage() {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | RequestStatus>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);

  const listQuery = useQuery({
    queryKey: ["document-requests", "list"],
    queryFn: () => api.documentRequests.list({ limit: 200 }),
  });

  // Akten for the picker and to show case titles instead of internal identifiers.
  const casesQuery = useQuery({
    queryKey: ["document-requests", "cases"],
    queryFn: () => api.cases.list({ limit: 200 }),
    staleTime: 60_000,
  });
  const caseOptions = useMemo(
    () =>
      (Array.isArray(casesQuery.data) ? casesQuery.data : []) as Array<{
        slug: string;
        title: string;
      }>,
    [casesQuery.data]
  );
  const caseTitle = useMemo(
    () => new Map(caseOptions.map((c) => [c.slug, c.title] as const)),
    [caseOptions]
  );

  const updateMutation = useMutation({
    mutationFn: api.documentRequests.update,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document-requests", "list"] });
    },
    onError: () => {
      addToast({
        type: "error",
        title: t("docreq.toast_update_failed"),
        description: "Bitte versuchen Sie es erneut.",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: api.documentRequests.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document-requests", "list"] });
      setCreateForm(EMPTY_FORM);
      setCreateOpen(false);
      addToast({ type: "success", title: t("docreq.toast_created") });
    },
    onError: () => {
      addToast({
        type: "error",
        title: t("docreq.toast_create_failed"),
        description: "Bitte versuchen Sie es erneut.",
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
        caseTitle.get(item.frontmatter.case_slug),
        item.frontmatter.message_draft,
        item.frontmatter.items.map((i) => i.label).join(" "),
        CHANNEL_LABEL[item.frontmatter.channel],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, filter, search, caseTitle]);

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
    const lines = createForm.items
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    await createMutation.mutateAsync({
      case_slug: caseSlug,
      items: lines.length ? lines : undefined,
      message_draft: createForm.message_draft.trim() || undefined,
      include_portal_link: createForm.include_portal_link,
      channel: "whatsapp",
      recipient_role: "client",
      status: "draft",
    });
  }

  function copyPortalLink(url: string) {
    const full = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    void navigator.clipboard.writeText(full).then(
      () => addToast({ type: "success", title: "Portal-Link kopiert" }),
      () => addToast({ type: "error", title: "Kopieren nicht möglich" })
    );
  }

  const busySlug = updateMutation.isPending ? updateMutation.variables?.slug : undefined;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("docreq.title")}
        description={t("docreq.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("docreq.title") },
        ]}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 whitespace-nowrap"
              onClick={() => void qc.invalidateQueries({ queryKey: ["document-requests", "list"] })}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Aktualisieren
            </Button>
            <PrimaryAction onClick={() => setCreateOpen(true)}>Neue Anfrage</PrimaryAction>
          </>
        }
      />

      {!listQuery.isLoading && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Entwürfe" value={metrics.draft || 0} />
          <Metric label="Gesendet, offen" value={metrics.sent || 0} />
          <Metric label="Teilweise erfüllt" value={metrics.partially_fulfilled || 0} />
          <Metric label="Erfüllt" value={metrics.fulfilled || 0} />
        </div>
      )}

      {!listQuery.isLoading && items.length > 0 && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="filter-strip">
            {FILTERS.map((entry) => {
              const count = entry.key === "all" ? items.length : metrics[entry.key] || 0;
              return (
                <FilterChip
                  key={entry.key}
                  label={count > 0 ? `${entry.label} (${count})` : entry.label}
                  active={filter === entry.key}
                  onClick={() => setFilter(filter === entry.key ? "all" : entry.key)}
                />
              );
            })}
          </div>
          <div className="relative w-full md:w-72">
            <Search
              size={15}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("docreq.ph_search")}
              aria-label={t("docreq.ph_search")}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2 pr-9 pl-9 text-sm text-[color:var(--ds-text)] outline-none placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Suche leeren"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-0.5 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {listQuery.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          <span className="flex items-center gap-2">
            <AlertCircle size={16} aria-hidden="true" />
            Dokumentenanfragen konnten nicht geladen werden.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void listQuery.refetch()}
            className="shrink-0 gap-1.5 text-xs text-[color:var(--ds-danger-text)]"
          >
            <RotateCcw size={13} aria-hidden="true" />
            Erneut versuchen
          </Button>
        </div>
      )}

      {listQuery.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : listQuery.isError ? null : items.length === 0 ? (
        <EmptyState
          icon={FileClock}
          title="Noch keine Dokumentenanfragen"
          description="Fordern Sie Unterlagen beim Mandanten an und verfolgen Sie, was bereits eingelangt ist."
          actionLabel="Erste Anfrage anlegen"
          onAction={() => setCreateOpen(true)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Keine Treffer"
          description="Keine Dokumentenanfrage entspricht Filter oder Suchbegriff."
          actionLabel="Filter zurücksetzen"
          onAction={() => {
            setFilter("all");
            setSearch("");
          }}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const fm = item.frontmatter;
            const busy = busySlug === item.slug;
            const received = fm.items.filter((d) => d.received_document_slug).length;
            const next: { label: string; status: RequestStatus; icon: typeof Send } | null =
              fm.status === "draft"
                ? { label: "Als gesendet markieren", status: "sent", icon: Send }
                : fm.status === "sent" || fm.status === "partially_fulfilled"
                  ? { label: "Als erfüllt markieren", status: "fulfilled", icon: CheckCircle2 }
                  : null;
            const menu: Array<{ label: string; status: RequestStatus; icon: typeof Send }> = [
              { label: "Als gesendet markieren", status: "sent" as const, icon: Send },
              {
                label: "Teilweise erfüllt",
                status: "partially_fulfilled" as const,
                icon: CheckCircle2,
              },
              { label: "Als erfüllt markieren", status: "fulfilled" as const, icon: CheckCircle2 },
              { label: "Als abgelaufen markieren", status: "expired" as const, icon: XCircle },
            ].filter((a) => a.status !== fm.status && a.status !== next?.status);
            return (
              <div
                key={item.slug}
                className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="default"
                        className={cn("border text-xs", STATUS_TONE[fm.status])}
                      >
                        {STATUS_LABEL[fm.status] ?? fm.status}
                      </Badge>
                      <span className="text-xs text-[color:var(--ds-text-subtle)]">
                        {CHANNEL_LABEL[fm.channel] ?? fm.channel}
                        {RECIPIENT_LABEL[fm.recipient_role]
                          ? ` · ${RECIPIENT_LABEL[fm.recipient_role]}`
                          : ""}
                      </span>
                    </div>
                    <h3 className="truncate text-sm font-semibold text-[color:var(--ds-text)]">
                      {item.title}
                    </h3>
                    <p className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                      {fm.message_draft || item.content || t("docreq.no_message")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    <div className="text-right text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <Clock size={12} aria-hidden="true" />
                        {createdLabel(lang, fm.created_at)}
                      </div>
                      {fm.sent_at && (
                        <div className="mt-1 whitespace-nowrap">
                          Gesendet {createdLabel(lang, fm.sent_at)}
                        </div>
                      )}
                    </div>
                    {menu.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Weitere Aktionen"
                            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {menu.map((a) => (
                            <DropdownMenuItem
                              key={a.status}
                              disabled={busy}
                              onSelect={() => void updateStatus(item, a.status)}
                              className="gap-2 text-xs"
                            >
                              <a.icon size={13} aria-hidden="true" />
                              {a.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {fm.items.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      Angeforderte Unterlagen
                      {received > 0 && ` · ${received} von ${fm.items.length} eingelangt`}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {fm.items.map((doc) => (
                        <span
                          key={doc.key}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                            doc.received_document_slug
                              ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                              : "border-[color:var(--ds-border)] text-[color:var(--ds-text)]"
                          )}
                        >
                          {doc.received_document_slug && (
                            <CheckCircle2 size={11} aria-hidden="true" />
                          )}
                          {doc.label}
                          {doc.required && (
                            <span className="text-[color:var(--ds-text-subtle)]" title="Pflicht">
                              *
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 border-t border-[color:var(--ds-border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {fm.case_slug && (
                      <Link
                        href={`/dashboard/cases/${encodeSlugPath(fm.case_slug)}`}
                        className="inline-flex items-center gap-1 text-[color:var(--brand-primary)] hover:underline"
                      >
                        {caseTitle.get(fm.case_slug) ?? "Zur Akte"}
                        <ArrowUpRight size={11} aria-hidden="true" />
                      </Link>
                    )}
                    {fm.source_event_slug && (
                      <a
                        href={`/dashboard/brain/${encodeURIComponent(fm.source_event_slug)}`}
                        className="inline-flex items-center gap-1 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:underline"
                      >
                        <MessageSquareText size={12} aria-hidden="true" />
                        Ursprüngliche Nachricht
                      </a>
                    )}
                    {fm.portal_url && (
                      <button
                        type="button"
                        onClick={() => copyPortalLink(fm.portal_url || "")}
                        className="inline-flex items-center gap-1 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:underline"
                      >
                        <Copy size={12} aria-hidden="true" />
                        Portal-Link kopieren
                      </button>
                    )}
                  </div>
                  {next && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 self-start whitespace-nowrap sm:self-auto"
                      onClick={() => void updateStatus(item, next.status)}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <next.icon size={13} aria-hidden="true" />
                      )}
                      {next.label}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Neue Dokumentenanfrage</DialogTitle>
            <DialogDescription>
              Der Entwurf wird angelegt und kann danach per WhatsApp, Portal oder E-Mail versendet
              werden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-req-case" className="text-xs text-[color:var(--ds-text-muted)]">
                Akte *
              </Label>
              <Select
                value={createForm.case_slug}
                onValueChange={(v) => setCreateForm((prev) => ({ ...prev, case_slug: v }))}
              >
                <SelectTrigger id="doc-req-case">
                  <SelectValue
                    placeholder={casesQuery.isLoading ? "Akten werden geladen" : "Akte wählen"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {caseOptions.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-req-items" className="text-xs text-[color:var(--ds-text-muted)]">
                Unterlagen
              </Label>
              <textarea
                id="doc-req-items"
                value={createForm.items}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, items: e.target.value }))}
                placeholder={t("docreq.ph_items")}
                rows={3}
                className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm leading-relaxed text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--ds-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-req-msg" className="text-xs text-[color:var(--ds-text-muted)]">
                Nachricht an den Mandanten
              </Label>
              <textarea
                id="doc-req-msg"
                value={createForm.message_draft}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, message_draft: e.target.value }))
                }
                placeholder={t("docreq.ph_message")}
                rows={3}
                className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm leading-relaxed text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--ds-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <input
                type="checkbox"
                checked={createForm.include_portal_link}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, include_portal_link: e.target.checked }))
                }
              />
              Link zum Hochladen im Mandantenportal erzeugen
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => void createRequest()}
              disabled={createMutation.isPending || !createForm.case_slug.trim()}
              className="gap-1.5"
            >
              {createMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus size={14} aria-hidden="true" />
              )}
              Anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">
        {value}
      </div>
    </div>
  );
}
