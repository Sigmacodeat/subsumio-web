"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Tag,
  Edit3,
  Eye,
  Network,
  FileText,
  Users,
  Building2,
  Lightbulb,
  Calendar,
  MapPin,
  BookOpen,
  Copy,
  Check,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BrainPage, Entity } from "@/lib/types";
import { GobdIntegrityPanel } from "@/components/gobd-integrity-panel";
import { ChatPanel } from "@/components/chat/chat-panel";
import { MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useLang } from "@/lib/use-lang";

// Erweiterte Felder, die die Detail-API zusätzlich zur BrainPage liefert.
interface PageGraphExtras {
  links?: Array<{ target: string; type: string }>;
  related?: Array<{ slug: string; title: string; type: string; relevance: number }>;
  entities?: Array<Entity & { salience?: number }>;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  person: Users,
  company: Building2,
  idea: Lightbulb,
  document: FileText,
  event: Calendar,
  place: MapPin,
};

const TYPE_COLOR: Record<string, string> = {
  person: "text-blue-600 bg-blue-500/10 border-blue-500/20",
  company: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  idea: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  document: "brand-text brand-soft brand-border",
  event: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  place: "text-teal-600 bg-teal-500/10 border-teal-500/20",
};

export default function BrainDetailPage() {
  const { t } = useLang();
  const params = useParams();
  const slug = decodeURIComponent((params.slug as string) || "");
  const [page, setPage] = useState<BrainPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api.brain
      .getPage(slug)
      .then((p) => {
        setPage(p);
        setContent(p.content || "");
      })
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, [slug]);

  const pageType = page?.source || "document";
  const TypeIcon = TYPE_ICON[pageType] || FileText;
  const typeStyle = TYPE_COLOR[pageType] || TYPE_COLOR.document;

  const copySlug = async () => {
    await navigator.clipboard.writeText(slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple markdown renderer
  const renderContent = (text: string) => {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul
            key={`list-${elements.length}`}
            className="mb-4 ml-4 list-disc space-y-1 marker:text-[color:var(--brand-primary)]"
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
          <h1 key={i} className="mt-2 mb-4 text-2xl font-bold text-[color:var(--ds-text)]">
            {trimmed.slice(2)}
          </h1>
        );
      } else if (trimmed.startsWith("## ")) {
        flushList();
        elements.push(
          <h2
            key={i}
            className="brand-text mt-6 mb-3 border-b border-[color:var(--ds-border)] pb-2 text-lg font-semibold"
          >
            {trimmed.slice(3)}
          </h2>
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

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main */}
      <div className="flex-1 overflow-y-auto">
        {/* Breadcrumb + Actions */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-6 py-3">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/brain"
              className="text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text-muted)]"
            >
              <ArrowLeft size={16} />
            </Link>
            <span className="text-xs text-[color:var(--ds-text-muted)]">Brain</span>
            <span className="text-xs text-[color:var(--ds-border)]">/</span>
            <span className="max-w-[200px] truncate font-mono text-xs text-[color:var(--ds-text-muted)]">
              {slug}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copySlug}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text-muted)]"
            >
              {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              {copied ? t("braindetail.btn_save") : "Slug"}
            </button>
            <button
              onClick={() => setEditMode(!editMode)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                editMode
                  ? "brand-soft brand-text brand-border"
                  : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text-muted)]"
              )}
            >
              {editMode ? <Eye size={12} /> : <Edit3 size={12} />}
              {editMode ? t("braindetail.btn_cancel") : t("braindetail.btn_edit")}
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[color:var(--ds-text-muted)]">
            <Loader2 size={24} className="animate-spin" />
            <p className="text-sm">Seite wird geladen…</p>
          </div>
        )}
        {!loading && !page && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-rose-600">
            <p className="text-sm font-medium">Seite nicht gefunden</p>
            <p className="text-xs text-[color:var(--ds-text-muted)]">{slug}</p>
          </div>
        )}
        {page && (
          <div className="mx-auto max-w-[900px] space-y-6 p-4 md:p-6 lg:p-8">
            {/* Header */}
            <div className="mb-8">
              <div className="mb-3 flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border",
                    typeStyle
                  )}
                >
                  <TypeIcon size={18} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-[color:var(--ds-text)]">{page.title}</h1>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="document">{page.source}</Badge>
                    <span className="text-xs text-[color:var(--ds-text-muted)]">·</span>
                    <span className="font-mono text-xs text-[color:var(--ds-text-muted)]">
                      {page.word_count} Wörter
                    </span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              {page.tags && page.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Tag size={12} className="mr-1 text-[color:var(--ds-text-muted)]" />
                  {page.tags.map((tag) => (
                    <span
                      key={tag}
                      className="brand-text brand-soft brand-border rounded-md px-2 py-0.5 font-mono text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Meta */}
              <div className="mt-3 flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  Erstellt: {page.created_at}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  Aktualisiert: {page.updated_at}
                </span>
              </div>
            </div>

            {/* Content */}
            {editMode ? (
              <div className="space-y-3">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="h-[400px] w-full resize-y rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  spellCheck={false}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="glow">
                    Speichern
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditMode(false)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : (
              <div className="prose-dark">{renderContent(content)}</div>
            )}

            {/* GoBD-Beleg: Aufbewahrung + Hash-Verifikation (nur wenn gestempelt) */}
            {!editMode && <GobdIntegrityPanel page={page} />}

            {/* Graph Links */}
            {!editMode && ((page as PageGraphExtras).links?.length ?? 0) > 0 && (
              <div className="mt-10">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
                  <Network size={14} className="brand-text" />
                  Verknüpfungen im Graph
                </h3>
                <div className="space-y-2">
                  {((page as PageGraphExtras).links ?? []).map((link) => (
                    <Link
                      key={link.target}
                      href={`/dashboard/brain/${encodeURIComponent(link.target)}`}
                      className="group flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="brand-text brand-soft brand-border rounded px-2 py-0.5 font-mono text-xs">
                          {link.type}
                        </span>
                        <span className="text-xs text-[color:var(--ds-text-muted)]">→</span>
                      </div>
                      <span className="group-hover:brand-text flex-1 text-sm text-[color:var(--ds-text)] transition-colors">
                        {link.target}
                      </span>
                      <ExternalLink
                        size={12}
                        className="group-hover:brand-text text-[color:var(--ds-text-muted)] transition-colors"
                      />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right sidebar: Related */}
      {page && (
        <div className="w-72 shrink-0 space-y-6 overflow-y-auto border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          {/* Related pages */}
          {((page as PageGraphExtras).related?.length ?? 0) > 0 && (
            <div>
              <p className="mb-3 text-xs font-medium tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                Verwandte Seiten
              </p>
              <div className="space-y-2">
                {((page as PageGraphExtras).related ?? []).map((rel) => {
                  const RelIcon = TYPE_ICON[rel.type] || FileText;
                  return (
                    <Link
                      key={rel.slug}
                      href={`/dashboard/brain/${encodeURIComponent(rel.slug)}`}
                      className="group flex items-center gap-2.5 rounded-lg p-2.5 transition-colors hover:bg-[color:var(--ds-hover)]"
                    >
                      <RelIcon
                        size={14}
                        className="group-hover:brand-text shrink-0 text-[color:var(--ds-text-muted)] transition-colors"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-[color:var(--ds-text)]">
                          {rel.title}
                        </p>
                        <p className="font-mono text-xs text-[color:var(--ds-text-muted)]">
                          {rel.slug}
                        </p>
                      </div>
                      <span className="font-mono text-xs text-emerald-600">
                        {(rel.relevance * 100).toFixed(0)}%
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Entities */}
          {((page as PageGraphExtras).entities?.length ?? 0) > 0 && (
            <div>
              <p className="mb-3 text-xs font-medium tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                Erkannte Entitäten
              </p>
              <div className="space-y-2">
                {((page as PageGraphExtras).entities ?? []).map((ent) => {
                  const EntIcon = TYPE_ICON[ent.type] || FileText;
                  const entStyle = TYPE_COLOR[ent.type] || TYPE_COLOR.document;
                  return (
                    <div
                      key={ent.slug}
                      className="flex items-center gap-2.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-2.5"
                    >
                      <div
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md border",
                          entStyle
                        )}
                      >
                        <EntIcon size={12} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[color:var(--ds-text)]">
                          {ent.name}
                        </p>
                        <p className="font-mono text-xs text-[color:var(--ds-text-muted)]">
                          {ent.type}
                        </p>
                      </div>
                      {ent.salience !== undefined && (
                        <span className="brand-text font-mono text-xs">
                          {(ent.salience * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div>
            <p className="mb-3 text-xs font-medium tracking-wider text-[color:var(--ds-text-muted)] uppercase">
              Aktionen
            </p>
            <div className="space-y-1.5">
              <Button variant="secondary" size="sm" className="w-full justify-start">
                <BookOpen size={12} /> Im Brain suchen
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start">
                <Network size={12} /> Graph ansehen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Chat */}
      <div className="mt-6">
        <button
          onClick={() => setChatOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm font-medium text-[color:var(--ds-text)] transition-colors hover:bg-[color:var(--ds-hover)]"
        >
          <span className="flex items-center gap-2">
            <MessageCircle size={16} className="brand-text" />
            Frage zu dieser Seite stellen
          </span>
          {chatOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {chatOpen && (
          <div className="mt-2 h-[500px]">
            <ChatPanel
              context={{ type: "brain_page", pageSlug: slug }}
              features={{
                caseSelector: false,
                jurisdictionSelector: true,
                modelSelector: true,
                modeSelector: true,
                fileUpload: false,
                sessionHistory: true,
                tokenWidget: true,
                brainStatus: true,
                exampleQueries: true,
                exportChat: true,
                messageActions: true,
              }}
              className="h-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
