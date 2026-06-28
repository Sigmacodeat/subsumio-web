"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Eye,
  FileText,
  CalendarClock,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Share2,
  Upload,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { encodeSlugPath } from "@/lib/utils";
import { caseFrontmatter, type DeadlineEntry } from "@/lib/legal-types";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

interface ClientCase {
  slug: string;
  id: string;
  title: string;
  status: string;
  lastUpdate: string;
  nextStep: string;
  documents: number;
  messages: number;
}

interface SharedSpace {
  id: string;
  slug: string;
  name: string;
  description?: string;
  status: string;
  document_count: number;
  expires_at?: string;
}

export default function ClientPortalPage() {
  const { t, lang } = useLang();
  // Vorschau-Modus: Diese Seite zeigt dem ANWALT, wie das Mandanten-Portal
  // aussehen wird. Ein echtes Mandanten-Portal braucht eine eigene,
  // pro Mandant authentifizierte Deployment-Oberfläche (Phase 5) —
  // ein clientseitiger PIN wäre Scheinsicherheit und wurde entfernt.
  const [previewing, setPreviewing] = useState(false);
  const [cases, setCases] = useState<ClientCase[]>([]);
  const [sharedSpaces, setSharedSpaces] = useState<SharedSpace[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadCases() {
    setLoading(true);
    try {
      // API doesn't support frontmatter-based filtering (portal_enabled),
      // so we fetch all cases and filter client-side. Limit 200 to cover
      // most practices. For 500+ cases, a dedicated API endpoint would be needed.
      const pages = await api.brain.listPages({ type: "legal_case", limit: 200 });
      const loaded: ClientCase[] = pages
        .filter((p) => caseFrontmatter(p).portal_enabled === true)
        .map((p) => {
          const fm = caseFrontmatter(p);
          const docs = fm.documents ?? [];
          const deadlines: DeadlineEntry[] = fm.deadlines?.length
            ? fm.deadlines
            : (fm.timeline_events ?? fm.timeline ?? []).map((entry) => ({
                title: entry.title,
                date: entry.date,
                status: entry.status,
                type: entry.type,
              }));
          const nextDl = deadlines
            .filter((d) => new Date(d.due_date || d.date || 0) >= new Date())
            .sort(
              (a, b) =>
                new Date(a.due_date || a.date || 0).getTime() -
                new Date(b.due_date || b.date || 0).getTime()
            )[0];

          return {
            slug: p.slug,
            id: fm.case_number || p.slug,
            title: p.title || t("client_portal.unnamed_case"),
            status: fm.status || "open",
            lastUpdate: p.updated_at || p.created_at,
            nextStep: nextDl
              ? `${nextDl.title ?? t("client_portal.deadline_label")} ${t("client_portal.deadline_until")} ${new Date(nextDl.due_date || nextDl.date || Date.now()).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}`
              : t("client_portal.no_deadline"),
            documents: Array.isArray(docs) ? docs.length : 0,
            messages: 0,
          };
        });
      setCases(loaded);

      // Load shared spaces
      const spacesRes = await fetch("/api/shared-spaces", { signal: AbortSignal.timeout(15_000) });
      if (spacesRes.ok) {
        const spacesData = await spacesRes.json();
        setSharedSpaces(spacesData.data || []);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("client_portal.error_load"));
      setCases([]);
      setSharedSpaces([]);
    } finally {
      setLoading(false);
    }
  }

  function startPreview() {
    setPreviewing(true);
    loadCases();
  }

  if (!previewing) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <div
              className="brand-soft brand-border mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border"
              aria-hidden="true"
            >
              <Eye size={28} className="brand-text" />
            </div>
            <h1 className="text-xl font-bold text-[color:var(--ds-text)]">
              {t("client_portal.preview_title")}
            </h1>
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {t("client_portal.preview_desc")}
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4" role="note">
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={14}
                className="mt-0.5 shrink-0 text-amber-600"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-amber-600">
                {t("client_portal.preview_warning")}
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            className="brand-bg brand-bg w-full text-white"
            onClick={startPreview}
          >
            <Eye size={16} className="mr-2" aria-hidden="true" />
            {t("client_portal.open_preview")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("client_portal.title")}
        description={t("client_portal.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("client_portal.breadcrumb") },
        ]}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreviewing(false)}
            className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text-muted)]"
          >
            {t("client_portal.end_preview")}
          </Button>
        }
      />

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Shared Spaces */}
      {sharedSpaces.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-[color:var(--ds-text-muted)]" />
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Shared Spaces</h3>
          </div>
          {sharedSpaces.map((space) => (
            <div
              key={space.id}
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {space.name}
                  </h4>
                  {space.description && (
                    <p className="text-xs text-[color:var(--ds-text-muted)]">{space.description}</p>
                  )}
                </div>
                <Badge
                  variant="default"
                  className={`text-xs ${
                    space.status === "active"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                      : "border-gray-500/20 bg-gray-500/10 text-gray-400"
                  }`}
                >
                  {space.status === "active" ? "Aktiv" : "Abgelaufen"}
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
                <span className="flex items-center gap-1">
                  <FileText size={10} />
                  {space.document_count} Dokumente
                </span>
                {space.expires_at && (
                  <span className="flex items-center gap-1">
                    <CalendarClock size={10} />
                    {new Date(space.expires_at).toLocaleDateString(
                      lang === "en" ? "en-GB" : "de-DE"
                    )}
                  </span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Link href={`/dashboard/shared-spaces/${space.slug}`} className="flex-1">
                  <Button
                    variant="secondary"
                    className="w-full border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                  >
                    <Download size={12} className="mr-1.5" />
                    Dokumente
                  </Button>
                </Link>
                <Button
                  variant="secondary"
                  className="flex-1 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                >
                  <Upload size={12} className="mr-1.5" />
                  Hochladen
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cases */}
      {loading ? (
        <div className="py-20 text-center text-[color:var(--ds-text-muted)]">
          <Loader2 size={24} className="mx-auto mb-3 animate-spin" />
          {t("client_portal.loading")}
        </div>
      ) : cases.length === 0 ? (
        <div className="space-y-4 py-20 text-center">
          <FileText size={48} className="mx-auto text-[color:var(--ds-border)]" />
          <p className="text-[color:var(--ds-text-muted)]">{t("client_portal.empty")}</p>
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            {t("client_portal.empty_hint")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <div
              key={c.id}
              className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">{c.title}</h2>
                  <p className="font-mono text-xs text-[color:var(--ds-text-muted)]">{c.id}</p>
                </div>
                <Badge
                  variant="default"
                  className={`text-xs ${
                    c.status === "closed"
                      ? "border-gray-500/20 bg-gray-500/10 text-gray-400"
                      : c.status === "won"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                        : "border-blue-500/20 bg-blue-500/10 text-blue-600"
                  }`}
                >
                  {c.status === "closed"
                    ? t("client_portal.status_closed")
                    : c.status === "won"
                      ? t("client_portal.status_won")
                      : t("client_portal.status_open")}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
                <span className="flex items-center gap-1">
                  <FileText size={10} />
                  {c.documents} {t("client_portal.documents")}
                </span>
                <span className="flex items-center gap-1">
                  <CalendarClock size={10} />
                  {new Date(c.lastUpdate).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")}
                </span>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-xs font-medium text-amber-600">
                      {t("client_portal.next_step")}
                    </p>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">{c.nextStep}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Link href={`/dashboard/cases/${encodeSlugPath(c.slug)}`} className="flex-1">
                  <Button
                    variant="secondary"
                    className="w-full border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                  >
                    <FileText size={12} className="mr-1.5" />
                    {t("client_portal.documents")}
                  </Button>
                </Link>
                <div
                  className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-dashed border-[color:var(--ds-border)] bg-transparent px-3 py-2 text-xs text-[color:var(--ds-text-muted)]"
                  title={t("client_portal.msg_disabled")}
                >
                  <MessageSquare size={12} />
                  {t("client_portal.message")}
                  <span className="ml-1 rounded bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-[10px] font-medium">
                    {t("client_portal.coming_soon")}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
