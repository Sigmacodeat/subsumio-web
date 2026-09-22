"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Tag,
  Edit3,
  Eye,
  Network,
  FileText,
  ExternalLink,
  Download,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn, daysUntil, encodeSlugPath, formatDate, formatDaysUntil } from "@/lib/utils";
import type { BrainPage, Entity } from "@/lib/types";
import { pageTypeOf } from "@/lib/types";
import { GobdIntegrityPanel } from "@/components/gobd-integrity-panel";
import { GroundedOutputPanel } from "@/components/legal/GroundedOutputPanel";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useLang } from "@/lib/use-lang";
import { useProvideCopilotFocus } from "@/lib/copilot-focus";
import { useHighlightQuoteFromUrl } from "@/lib/highlight-quote";
import { brainTypeIcon, brainTypeLabel } from "../brain-types";

const ChatPanel = lazy(() =>
  import("@/components/chat/chat-panel").then((m) => ({ default: m.ChatPanel }))
);
// The original PDF with a selectable text layer (pdf.js, loaded on demand).
const PdfDocumentViewer = lazy(() =>
  import("@/components/documents/pdf-document-viewer").then((m) => ({
    default: m.PdfDocumentViewer,
  }))
);

// Erweiterte Felder, die die Detail-API zusätzlich zur BrainPage liefert.
interface PageGraphExtras {
  links?: Array<{ target: string; type: string }>;
  related?: Array<{ slug: string; title: string; type: string; relevance: number }>;
  entities?: Array<Entity & { salience?: number }>;
}

/** Beziehungsarten in Klartext; unbekannte Arten werden neutral benannt. */
const LINK_LABELS: Record<string, string> = {
  mentions: "erwähnt",
  references: "verweist auf",
  cites: "zitiert",
  related_to: "steht in Bezug zu",
  party_to: "Partei in",
  represents: "vertritt",
  belongs_to: "gehört zu",
  attached_to: "Anlage zu",
};

/** Letztes Kennungssegment lesbar machen, wenn kein Titel vorliegt. */
function readableTarget(slug: string): string {
  const last = slug.split("/").pop() ?? slug;
  const text = last.replace(/[-_]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : slug;
}

export default function BrainDetailPage() {
  const { t } = useLang();
  const router = useRouter();
  const { addToast } = useToast();
  const params = useParams();
  const slug = decodeURIComponent((params.slug as string) || "");
  const [page, setPage] = useState<BrainPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    // Deferred so the loading flip is not a synchronous setState in the effect body.
    const timer = setTimeout(() => {
      setLoading(true);
      setLoadFailed(false);
      api.brain
        .getPage(slug)
        .then((p) => {
          if (cancelled) return;
          setPage(p);
          setContent(p.content || "");
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setPage(null);
          const status = (err as { status?: number } | null)?.status;
          setLoadFailed(status !== 404);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug]);

  const pageType = (page ? pageTypeOf(page) : undefined) || "document";
  const TypeIcon = brainTypeIcon(pageType);

  // Uploaded originals (Akten-Dokumente) get a document view: preview of the
  // original file, open/download, and the way back into the matter. The
  // extracted text stays available below it.
  const fm = (page?.frontmatter ?? {}) as Record<string, unknown>;
  const isDocument = pageType === "document" || pageType === "legal_document";
  const caseSlug = typeof fm.case_slug === "string" ? fm.case_slug : "";
  // The Copilot answers about the page that is open here.
  useProvideCopilotFocus(
    page ? { slug, title: page.title, caseSlug: caseSlug || undefined, kind: "document" } : null
  );
  // A citation link opens the page at the cited passage (?hl=…).
  useHighlightQuoteFromUrl(!!page && !loading);
  const sourceFormat = typeof fm.source_format === "string" ? fm.source_format.toLowerCase() : "";
  const fileHref = `/api/files/${encodeSlugPath(slug)}`;
  const canPreview = isDocument && sourceFormat === "pdf";
  const caseHref = caseSlug
    ? `/dashboard/cases/${encodeSlugPath(caseSlug)}${isDocument ? "/documents" : ""}`
    : "";
  const dueDate =
    pageType === "legal_deadline" && typeof fm.due_date === "string" ? fm.due_date : "";

  const extras = (page ?? {}) as PageGraphExtras;
  const links = extras.links ?? [];
  const related = extras.related ?? [];
  const entities = extras.entities ?? [];
  const hasAside = related.length > 0 || entities.length > 0;
  // KI-erzeugte Einträge (Freigabevorgänge aus Abläufen und Schriftsätzen)
  // zeigen ihre Belegprüfung — CLAUDE.md-Invariante für KI-Ausgaben.
  const isAiOutput = pageType === "agent_action" || fm.ai_generated === true;

  async function handleSave() {
    if (!page) return;
    setSaving(true);
    try {
      await api.brain.updatePage({ slug: page.slug, content });
      setPage({ ...page, content, updated_at: new Date().toISOString() });
      setEditMode(false);
      addToast({ type: "success", title: t("braindetail.toast_saved") });
    } catch {
      addToast({
        type: "error",
        title: t("braindetail.error_save"),
        description: "Ihre Änderungen sind noch im Editor. Bitte versuchen Sie es erneut.",
      });
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setContent(page?.content || "");
    setEditMode(false);
  }

  // Einfache Markdown-Darstellung. Überschriften beginnen bei h2 — die Seite
  // trägt bereits genau ein h1 im Seitenkopf.
  const renderContent = (text: string) => {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul
            key={`list-${elements.length}`}
            className="mb-4 ml-4 list-disc space-y-1 marker:text-[color:var(--ds-text-subtle)]"
          >
            {listItems}
          </ul>
        );
        listItems = [];
      }
    };

    lines.forEach((line, i) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("# ")) {
        flushList();
        elements.push(
          <h2
            key={i}
            className="font-display mt-2 mb-4 text-xl font-semibold text-[color:var(--ds-text)]"
          >
            {trimmed.slice(2)}
          </h2>
        );
      } else if (trimmed.startsWith("## ")) {
        flushList();
        elements.push(
          <h3
            key={i}
            className="mt-6 mb-3 border-b border-[color:var(--ds-border)] pb-2 text-base font-semibold text-[color:var(--ds-text)]"
          >
            {trimmed.slice(3)}
          </h3>
        );
      } else if (trimmed.startsWith("- ")) {
        listItems.push(
          <li key={i} className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
            {trimmed.slice(2)}
          </li>
        );
      } else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
        flushList();
        elements.push(
          <p key={i} className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
            {trimmed.slice(2, -2)}
          </p>
        );
      } else if (trimmed === "") {
        flushList();
      } else {
        flushList();
        elements.push(
          <p key={i} className="mb-3 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
            {trimmed}
          </p>
        );
      }
    });
    flushList();
    return elements;
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1200px] p-4 md:p-6 lg:p-8">
        <PageSkeleton rows={8} className="p-0" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="mx-auto w-full max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title={loadFailed ? "Eintrag derzeit nicht verfügbar" : "Eintrag nicht gefunden"}
          breadcrumbs={[
            { label: t("breadcrumb.dashboard"), href: "/dashboard" },
            { label: t("nav.brain"), href: "/dashboard/brain" },
          ]}
        />
        {loadFailed ? (
          <EmptyState
            icon={FileText}
            title="Der Eintrag konnte nicht geladen werden"
            description="Die Verbindung zum Kanzleiwissen ist gerade gestört. Bitte laden Sie die Seite in einigen Minuten neu."
            actionLabel="Neu laden"
            onAction={() => window.location.reload()}
          />
        ) : (
          <EmptyState
            icon={FileText}
            title="Dieser Eintrag ist nicht (mehr) vorhanden"
            description="Er wurde möglicherweise gelöscht oder umbenannt. Suchen Sie ihn im Kanzleiwissen."
            actionLabel="Zum Kanzleiwissen"
            onAction={() => router.push("/dashboard/brain")}
          />
        )}
      </div>
    );
  }

  const updated = formatDate(page.updated_at);
  const created = formatDate(page.created_at);
  const wordCount = page.word_count ?? 0;
  const dueDays = dueDate ? daysUntil(dueDate) : null;
  const metaParts = [
    brainTypeLabel(pageType),
    dueDate && formatDate(dueDate) !== "—"
      ? `fällig am ${formatDate(dueDate)} (${formatDaysUntil(dueDays)})`
      : null,
    created !== "—" ? `angelegt am ${created}` : null,
    updated !== "—" ? `aktualisiert am ${updated}` : null,
    wordCount > 0 ? `${wordCount.toLocaleString("de-AT")} Wörter` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-[1200px] min-w-0 space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={page.title || readableTarget(slug)}
        description={metaParts.join(" · ")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          caseHref
            ? { label: t("braindetail.crumb_case"), href: caseHref }
            : { label: t("nav.brain"), href: "/dashboard/brain" },
          { label: page.title || readableTarget(slug) },
        ]}
        actions={
          editMode ? (
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={cancelEdit} disabled={saving}>
                {t("braindetail.btn_cancel")}
              </Button>
              <PrimaryAction
                icon={saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                onClick={handleSave}
                disabled={saving}
              >
                {t("braindetail.btn_save")}
              </PrimaryAction>
            </div>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto">
              {isDocument && (
                <PrimaryAction asChild>
                  <a href={`${fileHref}?inline=1`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={15} aria-hidden="true" />
                    {t("braindetail.doc_open_original")}
                  </a>
                </PrimaryAction>
              )}
              {isDocument && (
                <Button variant="secondary" asChild className="whitespace-nowrap">
                  <a href={fileHref}>
                    <Download size={14} aria-hidden="true" />
                    {t("braindetail.doc_download")}
                  </a>
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => setEditMode(true)}
                className="whitespace-nowrap"
              >
                <Edit3 size={14} aria-hidden="true" />
                {t("braindetail.btn_edit")}
              </Button>
            </div>
          )
        }
      />

      <div className={cn("grid gap-6", hasAside && "lg:grid-cols-[minmax(0,1fr)_18rem]")}>
        <div className="min-w-0 space-y-6">
          {page.tags && page.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag
                size={12}
                className="mr-1 text-[color:var(--ds-text-muted)]"
                aria-hidden="true"
              />
              {page.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-0.5 text-xs text-[color:var(--ds-text-muted)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {canPreview && !editMode && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
              >
                {showPreview ? (
                  <FileText size={12} aria-hidden="true" />
                ) : (
                  <Eye size={12} aria-hidden="true" />
                )}
                {showPreview ? t("braindetail.doc_show_text") : t("braindetail.doc_show_preview")}
              </button>
            </div>
          )}

          {canPreview && showPreview && !editMode && (
            <Suspense fallback={null}>
              <PdfDocumentViewer url={`${fileHref}?inline=1`} title={page?.title} />
            </Suspense>
          )}

          {editMode ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              aria-label={t("braindetail.section_content")}
              className="h-[420px] w-full resize-y rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            />
          ) : canPreview && showPreview ? null : content.trim() ? (
            <div className="prose-dark rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 md:p-6">
              {renderContent(content)}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-[color:var(--ds-border-strong)] px-5 py-6 text-sm text-[color:var(--ds-text-muted)]">
              <TypeIcon size={16} aria-hidden="true" />
              Zu diesem Eintrag ist noch kein Text hinterlegt.
            </div>
          )}

          {!editMode && isAiOutput && content.trim() && <GroundedOutputPanel text={content} />}

          {!editMode && <GobdIntegrityPanel page={page} />}

          {!editMode && links.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                <Network size={13} aria-hidden="true" />
                Verknüpfungen
              </h2>
              <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                {links.map((link) => (
                  <li key={`${link.type}-${link.target}`}>
                    <Link
                      href={`/dashboard/brain/${encodeURIComponent(link.target)}`}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] motion-reduce:transition-none"
                    >
                      <span className="w-32 shrink-0 truncate text-xs text-[color:var(--ds-text-subtle)]">
                        {LINK_LABELS[link.type] ?? "verknüpft mit"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[color:var(--ds-text)]">
                        {readableTarget(link.target)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {hasAside && (
          <aside className="min-w-0 space-y-6">
            {related.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                  Ähnliche Einträge
                </h2>
                <ul className="space-y-1">
                  {related.map((rel) => {
                    const RelIcon = brainTypeIcon(rel.type);
                    return (
                      <li key={rel.slug}>
                        <Link
                          href={`/dashboard/brain/${encodeURIComponent(rel.slug)}`}
                          className="flex items-center gap-2.5 rounded-lg p-2 transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] motion-reduce:transition-none"
                        >
                          <RelIcon
                            size={14}
                            className="shrink-0 text-[color:var(--ds-text-muted)]"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[color:var(--ds-text)]">
                            {rel.title || readableTarget(rel.slug)}
                          </span>
                          <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)]">
                            {brainTypeLabel(rel.type)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {entities.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                  Im Text erwähnt
                </h2>
                <ul className="space-y-1">
                  {entities.map((ent) => {
                    const EntIcon = brainTypeIcon(ent.type);
                    return (
                      <li
                        key={ent.slug}
                        className="flex items-center gap-2.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-2"
                      >
                        <EntIcon
                          size={13}
                          className="shrink-0 text-[color:var(--ds-text-muted)]"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[color:var(--ds-text)]">
                          {ent.name}
                        </span>
                        <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)]">
                          {brainTypeLabel(ent.type)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </aside>
        )}
      </div>

      {/* Frage zu diesem Eintrag — eingeklappt, damit die Seite ruhig bleibt. */}
      {!editMode && (
        <section>
          <button
            type="button"
            onClick={() => setChatOpen((v) => !v)}
            aria-expanded={chatOpen}
            className="flex w-full items-center justify-between rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm font-medium text-[color:var(--ds-text)] transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
          >
            <span className="flex items-center gap-2">
              <MessageCircle
                size={16}
                className="text-[color:var(--ds-text-muted)]"
                aria-hidden="true"
              />
              Frage zu diesem Eintrag stellen
            </span>
            {chatOpen ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </button>
          {chatOpen && (
            <div className="mt-2 h-[500px]">
              <Suspense fallback={<Skeleton className="h-full w-full rounded-xl" />}>
                <ChatPanel
                  context={{ type: "brain_page", pageSlug: slug }}
                  features={{
                    caseSelector: false,
                    jurisdictionSelector: true,
                    modelSelector: false,
                    modeSelector: true,
                    fileUpload: false,
                    sessionHistory: true,
                    tokenWidget: false,
                    brainStatus: false,
                    exampleQueries: true,
                    exportChat: true,
                    messageActions: true,
                  }}
                  className="h-full"
                />
              </Suspense>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
