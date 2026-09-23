"use client";

/**
 * Detailseite eines Gesetzes (/ops/corpus/gesetz/<quelle>/<nummer>):
 * Status mit Soll/Ist, fehlende §§ mit RIS-Link, gespeicherte §§ mit dem
 * gespeicherten Text (Datei-Betrachter des Korpus-Stewards), Prüfvermerke,
 * Nachlade-Stand und die Aktion „Gesetz nachladen".
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  DownloadCloud,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  SearchX,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { CorpusFileViewer } from "@/components/dashboard/corpus-steward/CorpusFileViewer";
import {
  QualityFlagBadge,
  type QualityFlag,
} from "@/components/dashboard/corpus-steward/QualityFlagBadge";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import {
  lawOfficialUrl,
  lawSourceByParam,
  normOfficialUrl,
  type LawDetailNorm,
} from "@/lib/law-coverage";
import { corpusLawDetailQuery } from "./corpus-ops-queries";
import { LAW_LIST_PARAMS, haveWantedText, lawStatusBadge } from "./corpus-law-list";
import { useLawRefetch } from "./corpus-law-refetch";
import { ShowMoreButton, useShowMore } from "./corpus-show-more";

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("de-AT");

/** Nur die bekannten Listen-Parameter übernehmen — der Rückweg bleibt auf der Liste. */
function sanitizeBackQuery(raw: string | null): string {
  if (!raw) return "";
  const src = new URLSearchParams(raw);
  const out = new URLSearchParams();
  for (const k of LAW_LIST_PARAMS) {
    const v = src.get(k);
    if (v) out.set(k, v.slice(0, 200));
  }
  return out.toString();
}

function Section({
  title,
  count,
  description,
  children,
}: {
  title: string;
  count?: number;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 font-normal tabular-nums">({fmt(count)})</span>
          )}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function NormRow({
  norm,
  source,
  onOpen,
}: {
  norm: LawDetailNorm;
  source: string;
  onOpen: (path: string) => void;
}) {
  const ris = normOfficialUrl(source, norm.doc);
  const label = norm.label ?? norm.doc ?? "ohne Bezeichnung";
  const embedPct = norm.chunks > 0 ? Math.round((norm.embedded / norm.chunks) * 100) : null;
  return (
    <li className="grid grid-cols-1 gap-1.5 border-b border-[color:var(--ds-border)] px-4 py-2.5 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
      <span className="font-medium tabular-nums">{label}</span>
      <div className="min-w-0">
        <p className="truncate text-sm text-[color:var(--ds-text-muted)]" title={norm.title ?? ""}>
          {norm.title ?? "—"}
        </p>
        <p className="text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
          {norm.doc ? `${norm.doc} · ` : ""}
          {embedPct === null ? "nicht durchsuchbar" : `${embedPct} % durchsuchbar`}
          {norm.updated_at ? ` · gespeichert am ${formatDate(norm.updated_at)}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {norm.flag && <QualityFlagBadge flag={norm.flag as QualityFlag} />}
        {norm.file ? (
          <Button variant="outline" size="sm" onClick={() => onOpen(norm.file!)}>
            <FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Text ansehen
            <span className="sr-only"> ({label})</span>
          </Button>
        ) : (
          <span className="text-xs text-[color:var(--ds-text-subtle)]">keine Textdatei</span>
        )}
        {ris && (
          <a
            href={ris}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[color:var(--brand-primary)] hover:underline"
          >
            RIS
            <ExternalLink className="h-3 w-3" aria-hidden />
            <span className="sr-only"> — {label} im RIS öffnen (neues Fenster)</span>
          </a>
        )}
      </div>
    </li>
  );
}

export function CorpusLawDetail({ sourceParam, lawKey }: { sourceParam: string; lawKey: string }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const source = lawSourceByParam(sourceParam);
  const query = useQuery({
    ...corpusLawDetailQuery(source?.id ?? "", lawKey),
    enabled: !!source,
  });
  const refetch = useLawRefetch();
  const [viewerPath, setViewerPath] = useState<string | null>(null);
  const [normSearch, setNormSearch] = useState("");

  // Liste = diese Adresse ohne /gesetz/<quelle>/<nummer> (auch im Test-Harness).
  const listPath = pathname.replace(/\/gesetz\/[^/]+\/[^/]+\/?$/, "") || "/ops/corpus";
  const backQs = sanitizeBackQuery(searchParams.get("zurueck"));
  const backHref = `${listPath}${backQs ? `?${backQs}` : ""}#gesetz-${encodeURIComponent(lawKey)}`;

  const d = query.data;
  const q = normSearch.trim().toLowerCase();
  const present = useMemo(
    () =>
      (d?.present ?? []).filter(
        (n) =>
          !q ||
          (n.label ?? "").toLowerCase().includes(q) ||
          (n.title ?? "").toLowerCase().includes(q) ||
          (n.doc ?? "").toLowerCase().includes(q)
      ),
    [d, q]
  );
  const missing = useShowMore(d?.missing ?? [], `${lawKey}`);
  const presentMore = useShowMore(present, `${lawKey}|${q}`);
  const extraMore = useShowMore(d?.extra ?? [], `${lawKey}`);

  const backLink = (
    <Link
      href={backHref}
      className="inline-flex min-h-10 items-center gap-1.5 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Zurück zur Gesetzesliste
    </Link>
  );

  if (!source) {
    return (
      <div className="space-y-4">
        {backLink}
        <EmptyState
          icon={SearchX}
          title="Unbekannte Quelle"
          description="Diese Adresse nennt keine der Quellen Bundesrecht, Landesrecht oder Deutschland."
          actionLabel="Zur Gesetzesliste"
          onAction={() => router.push(backHref)}
        />
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Gesetz wird geladen">
        {backLink}
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Card>
          <CardContent className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (query.isError || !d) {
    const notFound = query.error instanceof Error && query.error.message === "HTTP 404";
    return (
      <div className="space-y-4">
        {backLink}
        {notFound ? (
          <EmptyState
            icon={SearchX}
            title="Gesetz nicht gefunden"
            description={`Unter der Nummer ${lawKey} gibt es im ${source.label} weder im amtlichen Verzeichnis noch in der Datenbank ein Gesetz.`}
            actionLabel="Zur Gesetzesliste"
            onAction={() => router.push(backHref)}
          />
        ) : (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-[color:var(--ds-danger-text)]" role="alert">
                Das Gesetz konnte nicht geladen werden. Bitte erneut versuchen — bleibt der Fehler,
                ist die Datenbank auf dem Server gerade nicht erreichbar.
              </p>
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Neu laden
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const hasIndex = d.index.available === true;
  const badge = lawStatusBadge(d.status, hasIndex);
  const name = d.abbr ?? d.title ?? `Gesetz ${d.key}`;
  const official = lawOfficialUrl(
    d.source,
    d.key,
    d.present[0]?.doc ?? d.missing[0]?.nor ?? d.extra[0]?.doc
  );
  const canRefetch =
    d.fetch.supported && d.missing.length > 0 && !d.fetch.queued && !d.fetch.running;
  const pctComplete = d.wanted > 0 ? Math.round((d.have / d.wanted) * 1000) / 10 : null;
  const q9 = d.quality;
  const checked = q9.verified + q9.needs_review + q9.defective;

  return (
    <div className="space-y-6">
      {backLink}
      <PageHeader
        breadcrumbs={[
          { label: "Rechtskorpus", href: backHref.replace(/#.*$/, "") },
          { label: source.label },
          { label: name },
        ]}
        title={name}
        description={
          d.abbr && d.title
            ? `${d.title} · Gesetzesnummer ${d.key}`
            : `${source.label} · Gesetzesnummer ${d.key}`
        }
        actions={
          <>
            {official && (
              <Button variant="outline" size="sm" asChild>
                <a href={official.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {official.label}
                </a>
              </Button>
            )}
            {canRefetch && (
              <Button size="sm" disabled={refetch.isPending} onClick={() => refetch.mutate(d.key)}>
                {refetch.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <DownloadCloud className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                )}
                Gesetz nachladen
              </Button>
            )}
          </>
        }
      />

      {/* Status auf einen Blick */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={badge.variant} className="text-sm">
              {badge.label}
            </Badge>
            <span className="text-sm font-medium tabular-nums">
              {haveWantedText(d.have, d.wanted)}
            </span>
            {d.missing.length > 0 && (
              <span className="text-sm text-[color:var(--ds-danger-text)] tabular-nums">
                · {fmt(d.missing.length)} fehlen
              </span>
            )}
            {d.fetch.running && <Badge variant="info">wird gerade vom RIS geladen</Badge>}
            {d.fetch.queued && !d.fetch.running && (
              <Badge variant="info">zum Nachladen vorgemerkt</Badge>
            )}
          </div>
          {pctComplete !== null && (
            <Progress
              value={pctComplete}
              className="h-2"
              aria-label={`${pctComplete} % der §§ gespeichert`}
            />
          )}
          <p className="text-xs text-[color:var(--ds-text-subtle)]">
            {hasIndex
              ? `Zuletzt geprüft: amtliches Verzeichnis vom ${formatDateTime(d.index.measured_at)}, Datenbank-Stand vom ${formatDateTime(d.generated_at)}.`
              : d.index.available === false
                ? "Das amtliche Verzeichnis fehlt auf dem Server — angezeigt wird nur, was in der Datenbank liegt."
                : `Kein amtliches Verzeichnis zum Abgleich — Datenbank-Stand vom ${formatDateTime(d.generated_at)}.`}
            {d.fetch.queued && !d.fetch.running
              ? " Das Gesetz wird im nächsten erlaubten RIS-Fenster geladen und danach automatisch übernommen."
              : ""}
            {d.fetch.supported && !canRefetch && d.missing.length === 0 && d.status === "complete"
              ? " Nachladen ist nicht nötig."
              : ""}
            {!d.fetch.supported && d.missing.length > 0
              ? " Für diese Quelle gibt es kein Nachladen einzelner Gesetze — sie wird vollständig im nächsten Lauf abgeglichen."
              : ""}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Gespeichert",
            value: fmt(d.have),
            hint: d.wanted > 0 ? `von ${fmt(d.wanted)} laut RIS` : "ohne amtliches Soll",
          },
          {
            label: "Fehlen",
            value: fmt(d.missing.length),
            hint: d.missing.length > 0 ? "siehe Liste unten" : "nichts offen",
            tone: d.missing.length > 0 ? "text-[color:var(--ds-danger-text)]" : undefined,
          },
          {
            label: "Durchsuchbar",
            value: d.embed_pct !== null ? `${d.embed_pct} %` : "—",
            hint: `${fmt(d.embedded)} von ${fmt(d.chunks)} Textabschnitten`,
          },
          {
            label: "Prüfvermerk",
            value: checked > 0 ? `${fmt(q9.verified)} geprüft` : "ungeprüft",
            hint:
              q9.defective + q9.needs_review > 0
                ? `${fmt(q9.defective)} defekt · ${fmt(q9.needs_review)} zu prüfen`
                : checked > 0
                  ? "keine Beanstandung"
                  : "noch kein § begutachtet",
            tone:
              q9.defective > 0
                ? "text-[color:var(--ds-danger-text)]"
                : q9.needs_review > 0
                  ? "text-[color:var(--ds-warning-text)]"
                  : undefined,
          },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                {k.label}
              </p>
              <p className={cn("mt-1 text-xl font-semibold tabular-nums", k.tone)}>{k.value}</p>
              <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {hasIndex && (
        <Section
          title="Fehlende §§"
          count={d.missing.length}
          description="Laut amtlichem Verzeichnis gültig, in der Datenbank aber nicht vorhanden."
        >
          {d.missing.length === 0 ? (
            <p className="rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-4 py-3 text-sm text-[color:var(--ds-success-text)]">
              Alle §§ aus dem amtlichen Verzeichnis sind gespeichert.
            </p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul aria-label="Fehlende §§">
                  {missing.visible.map((m) => {
                    const ris = normOfficialUrl(d.source, m.nor);
                    return (
                      <li
                        key={m.nor}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--ds-border)] px-4 py-2.5 last:border-b-0"
                      >
                        <span className="font-medium tabular-nums">{m.apa ?? m.nor}</span>
                        <span className="flex items-center gap-3 text-xs text-[color:var(--ds-text-subtle)]">
                          <span className="tabular-nums">{m.nor}</span>
                          {ris && (
                            <a
                              href={ris}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[color:var(--brand-primary)] hover:underline"
                            >
                              im RIS ansehen
                              <ExternalLink className="h-3 w-3" aria-hidden />
                              <span className="sr-only"> ({m.apa ?? m.nor}, neues Fenster)</span>
                            </a>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="px-4 pb-3">
                  <ShowMoreButton
                    shown={missing.visible.length}
                    total={missing.total}
                    onMore={missing.more}
                    noun="fehlenden §§"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </Section>
      )}

      <Section
        title="Gespeicherte §§"
        count={d.present.length}
        description="Text so, wie er in der Datenbank liegt — „Text ansehen“ öffnet die gespeicherte Datei."
      >
        {d.present.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Noch kein § gespeichert"
            description={
              canRefetch
                ? "Laden Sie das Gesetz nach — die §§ erscheinen hier nach dem nächsten Import."
                : "Sobald das Gesetz importiert ist, erscheinen seine §§ hier."
            }
            actionLabel={canRefetch ? "Gesetz nachladen" : undefined}
            onAction={canRefetch ? () => refetch.mutate(d.key) : undefined}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              {d.present.length > 20 && (
                <div className="border-b border-[color:var(--ds-border)] p-3">
                  <div className="relative">
                    <Search
                      className="absolute top-2.5 left-3 h-4 w-4 text-[color:var(--ds-text-subtle)]"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      value={normSearch}
                      onChange={(e) => setNormSearch(e.target.value)}
                      placeholder="§ suchen — z. B. § 1295 oder Schadenersatz"
                      className="pl-9"
                      aria-label="Gespeicherte §§ durchsuchen"
                    />
                  </div>
                </div>
              )}
              {present.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[color:var(--ds-text-muted)]">
                  Kein gespeicherter § passt auf „{normSearch.trim()}“.
                </p>
              ) : (
                <ul aria-label="Gespeicherte §§">
                  {presentMore.visible.map((n, i) => (
                    <NormRow
                      key={`${n.doc ?? "x"}-${i}`}
                      norm={n}
                      source={d.source}
                      onOpen={setViewerPath}
                    />
                  ))}
                </ul>
              )}
              <div className="px-4 pb-3">
                <ShowMoreButton
                  shown={presentMore.visible.length}
                  total={presentMore.total}
                  onMore={presentMore.more}
                  noun="§§"
                />
              </div>
            </CardContent>
          </Card>
        )}
      </Section>

      {d.extra.length > 0 && (
        <Section
          title="Nicht mehr im amtlichen Verzeichnis"
          count={d.extra.length}
          description="In der Datenbank gespeichert, vom RIS aber nicht mehr als geltend gelistet — meist außer Kraft getretene Fassungen."
        >
          <Card>
            <CardContent className="p-0">
              <ul aria-label="Nicht mehr gelistete §§">
                {extraMore.visible.map((n, i) => (
                  <NormRow
                    key={`${n.doc ?? "x"}-${i}`}
                    norm={n}
                    source={d.source}
                    onOpen={setViewerPath}
                  />
                ))}
              </ul>
              <div className="px-4 pb-3">
                <ShowMoreButton
                  shown={extraMore.visible.length}
                  total={extraMore.total}
                  onMore={extraMore.more}
                  noun="§§"
                />
              </div>
            </CardContent>
          </Card>
        </Section>
      )}

      <CorpusFileViewer path={viewerPath} onClose={() => setViewerPath(null)} />
    </div>
  );
}
