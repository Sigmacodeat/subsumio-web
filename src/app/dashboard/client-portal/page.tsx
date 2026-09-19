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
  Share2,
  Download,
} from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { encodeSlugPath, formatDate } from "@/lib/utils";
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
  const { t } = useLang();
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
                due_date: entry.date ?? "",
                status: entry.status as DeadlineEntry["status"],
                type: entry.type,
              }));
          const nextDl = deadlines
            .filter((d) => new Date(d.due_date || 0) >= new Date())
            .sort(
              (a, b) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime()
            )[0];

          return {
            slug: p.slug,
            id: fm.case_number || p.slug,
            title: p.title || t("client_portal.unnamed_case"),
            status: fm.status || "open",
            lastUpdate: p.updated_at || p.created_at,
            nextStep: nextDl
              ? `${nextDl.title ?? t("client_portal.deadline_label")} ${t("client_portal.deadline_until")} ${formatDate(nextDl.due_date)}`
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
    } catch {
      // Plain wording only — transport errors are not shown to the lawyer.
      setLoadError(t("client_portal.error_load"));
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
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title={t("client_portal.preview_title")}
          description={t("client_portal.preview_desc")}
          breadcrumbs={[
            { label: t("breadcrumb.dashboard"), href: "/dashboard" },
            { label: t("client_portal.breadcrumb") },
          ]}
        />
        <div className="max-w-[720px] space-y-4">
          <div
            className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4"
            role="note"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={14}
                className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-[color:var(--ds-warning-text)]">
                Diese Vorschau zeigt der Kanzlei alle Akten, die für das Mandantenportal freigegeben
                sind. Ein eigener Zugang pro Mandant ist noch nicht Teil dieses Dashboards.
              </p>
            </div>
          </div>
          <Button onClick={startPreview} className="gap-2">
            <Eye size={16} aria-hidden="true" />
            {t("client_portal.open_preview")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
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
        <div className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          {loadError}
        </div>
      )}

      {/* Shared Spaces */}
      {sharedSpaces.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-[color:var(--ds-text-muted)]" />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Geteilte Datenräume
            </h2>
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
                      ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                      : "border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]"
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
                    <CalendarClock size={10} aria-hidden="true" />
                    gültig bis {formatDate(space.expires_at)}
                  </span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" className="text-xs" asChild>
                  <Link href={`/dashboard/shared-spaces/${space.slug}`}>
                    <Download size={12} className="mr-1.5" />
                    Dokumente öffnen
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cases */}
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : cases.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("client_portal.empty")}
          description={t("client_portal.empty_hint")}
          actionLabel="Zu den Akten"
          onAction={() => {
            window.location.href = "/dashboard/cases";
          }}
        />
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
                      ? "border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]"
                      : c.status === "won"
                        ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                        : "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
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
                  {formatDate(c.lastUpdate)}
                </span>
              </div>

              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2
                    size={14}
                    className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-xs font-medium text-[color:var(--ds-text)]">
                      {t("client_portal.next_step")}
                    </p>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">{c.nextStep}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
                  <Link href={`/dashboard/cases/${encodeSlugPath(c.slug)}`}>
                    <FileText size={12} className="mr-1.5" />
                    {t("client_portal.documents")}
                  </Link>
                </Button>
                <div
                  className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-dashed border-[color:var(--ds-border)] bg-transparent px-3 py-2 text-xs text-[color:var(--ds-text-muted)]"
                  title={t("client_portal.msg_disabled")}
                >
                  <MessageSquare size={12} />
                  {t("client_portal.message")}
                  <span className="ml-1 rounded bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-xs font-medium">
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
