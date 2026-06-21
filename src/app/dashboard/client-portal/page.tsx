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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { caseFrontmatter, type DeadlineEntry } from "@/lib/legal-types";
import { PageHeader } from "@/components/dashboard/page-header";

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

export default function ClientPortalPage() {
  // Vorschau-Modus: Diese Seite zeigt dem ANWALT, wie das Mandanten-Portal
  // aussehen wird. Ein echtes Mandanten-Portal braucht eine eigene,
  // pro Mandant authentifizierte Deployment-Oberfläche (Phase 5) —
  // ein clientseitiger PIN wäre Scheinsicherheit und wurde entfernt.
  const [previewing, setPreviewing] = useState(false);
  const [cases, setCases] = useState<ClientCase[]>([]);
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
            title: p.title || "Unbenannte Akte",
            status: fm.status || "open",
            lastUpdate: p.updated_at || p.created_at,
            nextStep: nextDl
              ? `${nextDl.title ?? "Frist"} bis ${new Date(nextDl.due_date || nextDl.date || Date.now()).toLocaleDateString("de-DE")}`
              : "Keine anstehenden Fristen",
            documents: Array.isArray(docs) ? docs.length : 0,
            messages: 0,
          };
        });
      setCases(loaded);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Akten konnten nicht geladen werden.");
      setCases([]);
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
              Mandanten-Portal — Vorschau
            </h1>
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              So sehen Ihre Mandanten künftig den Stand ihrer Akte.
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
                Dies ist eine <strong>Vorschau für die Kanzlei</strong> — sie zeigt alle Akten der
                explizit freigegebenen Akten. Das echte Mandanten-Portal mit eigenem Login pro
                Mandant und Akten-Filterung ist ein separates Deployment und noch nicht Teil dieses
                Dashboards.
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            className="brand-bg brand-bg w-full text-white"
            onClick={startPreview}
          >
            <Eye size={16} className="mr-2" aria-hidden="true" />
            Vorschau öffnen (Anwaltsansicht)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Meine Akten"
        description="Übersicht über alle laufenden Mandate"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Mandanten-Portal" }]}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreviewing(false)}
            className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text-muted)]"
          >
            Vorschau beenden
          </Button>
        }
      />

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Cases */}
      {loading ? (
        <div className="py-20 text-center text-[color:var(--ds-text-muted)]">
          <Loader2 size={24} className="mx-auto mb-3 animate-spin" />
          Akten werden geladen…
        </div>
      ) : cases.length === 0 ? (
        <div className="space-y-4 py-20 text-center">
          <FileText size={48} className="mx-auto text-[color:var(--ds-border)]" />
          <p className="text-[color:var(--ds-text-muted)]">Keine Akten gefunden.</p>
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Akten erscheinen hier, sobald sie in der Akte für die Portal-Vorschau freigegeben sind.
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
                    ? "Geschlossen"
                    : c.status === "won"
                      ? "Gewonnen"
                      : "Offen"}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
                <span className="flex items-center gap-1">
                  <FileText size={10} />
                  {c.documents} Dokumente
                </span>
                <span className="flex items-center gap-1">
                  <CalendarClock size={10} />
                  {new Date(c.lastUpdate).toLocaleDateString("de-DE")}
                </span>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-xs font-medium text-amber-600">Nächster Schritt</p>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">{c.nextStep}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Link href={`/dashboard/cases/${encodeURIComponent(c.slug)}`} className="flex-1">
                  <Button
                    variant="secondary"
                    className="w-full border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                  >
                    <FileText size={12} className="mr-1.5" />
                    Dokumente
                  </Button>
                </Link>
                <Button
                  variant="secondary"
                  disabled
                  title="Nachrichten sind erst im echten Mandantenportal verfügbar."
                  className="flex-1 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)] disabled:opacity-60"
                >
                  <MessageSquare size={12} className="mr-1.5" />
                  Nachricht
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
