"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw } from "lucide-react";
import { QUALITY_ISSUE_LABELS, type CorpusSourceStats } from "@/lib/corpus-labels";
import type { SourceAuditRow } from "@/lib/corpus-completeness-audit";
import { formatDateTime } from "@/lib/utils";
import { corpusCoverageAuditQuery, corpusOverviewQuery } from "./corpus-ops-queries";
import { CorpusLawList } from "./corpus-law-list";
import { ShowMoreButton, useShowMore } from "./corpus-show-more";

const AUDIT_STATUS_LABELS: Record<SourceAuditRow["audit_status"], string> = {
  ok: "OK",
  empty_available: "Deklariert, aber leer",
  unexpected_data: "Daten ohne Deklaration",
  gap: "Bekannte Lücke",
  partially_embedded: "Teilweise eingebettet",
};

const AUDIT_STATUS_CLASSES: Record<SourceAuditRow["audit_status"], string> = {
  ok: "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  empty_available: "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  unexpected_data: "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  gap: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  partially_embedded: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
};

function CoverageAudit() {
  const query = useQuery(corpusCoverageAuditQuery());

  if (query.isLoading) return <Skeleton className="h-32 w-full" />;
  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <p className="text-xs text-[color:var(--ds-danger-text)]" role="alert">
            Abdeckungs-Audit konnte nicht geladen werden.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`}
              aria-hidden
            />
            Neu laden
          </Button>
        </CardContent>
      </Card>
    );
  }

  const a = query.data;
  const deviations = a.rows.filter((r) => r.audit_status !== "ok" && r.audit_status !== "gap");

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Abdeckungs-Audit (alle Jurisdiktionen)</h3>
          <Badge
            className={
              deviations.length === 0
                ? "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                : "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
            }
          >
            {a.summary.completeness_pct} % ohne Abweichung
          </Badge>
        </div>
        <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
          {a.summary.total_sources} Quellen in der Matrix · {a.summary.gaps} bekannte Lücken ·{" "}
          {deviations.length} Abweichungen
        </p>
        {deviations.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quelle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Seiten</TableHead>
                  <TableHead className="text-right">eingebettet</TableHead>
                  <TableHead>Hinweis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deviations.map((r) => (
                  <TableRow key={r.source_id}>
                    <TableCell>
                      <div className="font-medium">{r.source_name}</div>
                      <div className="text-xs text-[color:var(--ds-text-subtle)]">
                        {r.db_source_ids.length > 0 ? r.db_source_ids.join(", ") : r.source_id} ·{" "}
                        {r.jurisdiction}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={AUDIT_STATUS_CLASSES[r.audit_status]}>
                        {AUDIT_STATUS_LABELS[r.audit_status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.actual_pages)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.embed_pct !== null ? `${r.embed_pct} %` : "—"}
                    </TableCell>
                    <TableCell className="max-w-xs text-xs text-[color:var(--ds-text-muted)]">
                      {r.notes}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Echte DB-Quellen ohne Matrix-Eintrag — sonst wären sie im Audit
            unsichtbar (z.B. law-at-gemeinden). */}
        {a.undeclared.length > 0 && (
          <div className="mt-3 border-t border-[color:var(--ds-border)] pt-3">
            <p className="text-xs font-medium">Quellen mit Bestand, aber ohne Deklaration</p>
            <ul className="mt-1.5 space-y-1 text-xs text-[color:var(--ds-text-muted)]">
              {a.undeclared.map((s) => (
                <li key={s.source_id} className="flex items-baseline gap-2">
                  <span className="font-mono">{s.source_id}</span>
                  <span className="tabular-nums">
                    {fmt(s.pages)} Seiten ·{" "}
                    {s.chunks > 0
                      ? `${Math.round((s.embedded / s.chunks) * 100)} % eingebettet`
                      : "0 Chunks"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* WP-6.38: DE-Gesetze Soll-Ist gegen das amtliche gii-TOC */}
        {a.de_statutes &&
          (a.de_statutes.unavailable ? (
            <p className="mt-3 text-xs text-[color:var(--ds-text-subtle)]">
              DE-Gesetzesabgleich: gesetze-im-internet.de derzeit nicht erreichbar.
            </p>
          ) : (
            <div className="mt-3 border-t border-[color:var(--ds-border)] pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium">DE-Gesetze (gesetze-im-internet.de)</span>
                <Badge
                  className={
                    a.de_statutes.missing.length === 0
                      ? "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                      : "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                  }
                >
                  {fmt(a.de_statutes.in_corpus)} von {fmt(a.de_statutes.upstream_total)} im Corpus (
                  {a.de_statutes.coverage_pct} %)
                </Badge>
                {a.de_statutes.target && (
                  <Badge
                    className={
                      a.de_statutes.target.missing.length === 0
                        ? "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                        : "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                    }
                  >
                    Ziel-Set: {a.de_statutes.target.in_corpus} von {a.de_statutes.target.total}
                  </Badge>
                )}
              </div>
              {a.de_statutes.target?.missing.length ? (
                <p className="mt-1.5 text-xs text-[color:var(--ds-danger-text)]" role="alert">
                  Fehlende Pflicht-Gesetze:{" "}
                  {a.de_statutes.target.missing.map((m) => m.slug.toUpperCase()).join(", ")}
                </p>
              ) : null}
              {a.de_statutes.missing.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]">
                    {fmt(a.de_statutes.missing.length)} fehlende Gesetze anzeigen
                    {a.de_statutes.missing_truncated ? " (Liste gekürzt)" : ""}
                  </summary>
                  <DeMissingList items={a.de_statutes.missing} />
                </details>
              )}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

/** Fehlende DE-Gesetze: wächst mit „Weitere anzeigen" statt eigener Scrollbox. */
function DeMissingList({ items }: { items: Array<{ slug: string; title: string }> }) {
  const more = useShowMore(items);
  return (
    <>
      <ul className="mt-1 space-y-0.5 text-xs text-[color:var(--ds-text-muted)]">
        {more.visible.map((m) => (
          <li key={m.slug}>
            <a
              href={`https://www.gesetze-im-internet.de/${encodeURIComponent(m.slug)}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[color:var(--brand-primary)] hover:underline"
            >
              {m.slug.toUpperCase()}
            </a>{" "}
            — {m.title}
          </li>
        ))}
      </ul>
      <ShowMoreButton
        shown={more.visible.length}
        total={more.total}
        onMore={more.more}
        noun="Gesetzen"
      />
    </>
  );
}

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("de-AT");
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
const date = (iso: string | null) => formatDateTime(iso);

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Folder → database → checked: the plausibility audit's verdict for one
 * source (corpus_status, refreshed every 6h by the pipeline's
 * runPlausibilityAudit — see corpus-pipeline.ts). Also what gates
 * embedding: only a page on the audit's positive list (corpus_page_verified)
 * may receive a vector (verifiedSql() in core/embedding-run.ts), so "noch
 * nicht geprüft" here means those pages are not embeddable yet either.
 */
function QualityChip({ s }: { s: CorpusSourceStats }) {
  const q = s.quality;
  if (!q)
    return <span className="text-xs text-[color:var(--ds-text-subtle)]">noch nicht geprüft</span>;
  const ok = q.implausible === 0;
  const top = Object.entries(q.issues).sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="flex flex-col gap-0.5">
      <Badge
        className={
          ok
            ? "w-fit bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
            : "w-fit bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
        }
      >
        {ok ? "alle Seiten geprüft" : `${fmt(q.implausible)} fehlerhaft`}
      </Badge>
      {top && (
        <span className="text-xs text-[color:var(--ds-text-muted)]">
          {QUALITY_ISSUE_LABELS[top[0]] ?? top[0]}
        </span>
      )}
      <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
        Ordner {q.normalizedFiles === null ? "?" : fmt(q.normalizedFiles)} · DB {fmt(s.pages)}
      </span>
      <span className="text-xs text-[color:var(--ds-text-subtle)]">{date(q.checkedAt)}</span>
    </div>
  );
}

/** "RIS hat / wir haben" of the latest reconciliation, as a status chip. */
function ReconChip({ s }: { s: CorpusSourceStats }) {
  const r = s.reconciliation;
  if (!r)
    return <span className="text-xs text-[color:var(--ds-text-subtle)]">noch nicht gemessen</span>;
  const missing = r.missing ?? 0;
  const ok = missing === 0;
  return (
    <div className="flex flex-col gap-0.5">
      <Badge
        className={
          ok
            ? "w-fit bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
            : "w-fit bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
        }
      >
        {ok ? "vollständig" : `${fmt(missing)} fehlen`}
      </Badge>
      <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
        RIS {r.risTotal === null ? "?" : fmt(r.risTotal)} · DB {fmt(r.dbTotal)}
        {(r.extra ?? 0) > 0 ? ` · ${fmt(r.extra)} nicht mehr im RIS` : ""}
      </span>
      <span className="text-xs text-[color:var(--ds-text-subtle)]">
        {r.method === "doc-ids" ? "je Dokument" : "Anzahl"} · {date(r.measuredAt)}
      </span>
    </div>
  );
}

/**
 * Reiter „Bestand" unter dem Nachweis nach Rechtsbereich: die Gesetze einzeln
 * (Zusammenfassung als Filter + Liste mit Link auf die Detailseite), darunter
 * zugeklappt die übrigen Zählungen — Seiten, Abschnitte, Einbettung,
 * Eingang, Abdeckungs-Matrix. Die messen andere Einheiten als der Nachweis
 * (Seiten statt Dokumentnummern) und stehen deshalb nicht daneben, sondern
 * erst auf Wunsch. Zugeklappt wird nichts geladen.
 */
export function CorpusBestand() {
  return (
    <div className="space-y-10">
      <CorpusLawList />
      <MoreCounts />
    </div>
  );
}

function MoreCounts() {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Weitere Zählungen
        <span className="ml-2 text-xs font-normal text-[color:var(--ds-text-muted)]">
          Seiten, Abschnitte, Einbettung, Eingang der letzten 30 Tage, Abdeckungs-Matrix — in Seiten
          gezählt, nicht nach Dokumentnummer
        </span>
      </summary>
      {open && (
        <div className="space-y-10 border-t border-[color:var(--ds-border)] p-4">
          <OverviewSection />
          <CoverageAudit />
        </div>
      )}
    </details>
  );
}

function OverviewSection() {
  const query = useQuery(corpusOverviewQuery());

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-[color:var(--ds-danger-text)]">
            Bestand konnte nicht geladen werden.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => query.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Neu laden
          </Button>
        </CardContent>
      </Card>
    );
  }

  const d = query.data;
  const t = d.totals;
  const statutes = d.sources.filter((s) => s.kind !== "decision");
  const decisions = d.sources.filter((s) => s.kind === "decision");
  const maxDay = Math.max(1, ...d.ingestByDay.map((x) => x.added + x.updated));

  const section = (title: string, rows: CorpusSourceStats[], isDecision: boolean) => (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-[color:var(--ds-border)] px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {/* Ab lg ohne eigenen Scroll-Container: nur so kleben die Spaltenköpfe
            am Fensterrand (unter der Reiterleiste). Schmaler scrollt die
            Tabelle waagrecht, senkrecht immer die Seite. */}
        <Table wrapperClassName="lg:overflow-x-visible">
          <TableHeader className="sticky top-[var(--corpus-sticky-top,0px)] z-10 [background:var(--ds-surface)]">
            <TableRow>
              <TableHead>Quelle</TableHead>
              <TableHead className="text-right">{isDecision ? "Dokumente" : "Normen"}</TableHead>
              <TableHead className="text-right">
                {isDecision ? "Rechtssätze / Texte" : "Gesetze"}
              </TableHead>
              {!isDecision && <TableHead className="text-right">außer Kraft</TableHead>}
              <TableHead className="text-right">Abschnitte</TableHead>
              <TableHead className="text-right">eingebettet</TableHead>
              <TableHead>Geprüft</TableHead>
              <TableHead>Abgleich mit RIS</TableHead>
              <TableHead>zuletzt geändert</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.sourceId}>
                <TableCell>
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-[color:var(--ds-text-subtle)]">{s.sourceId}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt(s.pages)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {isDecision
                    ? s.rechtssaetze + s.entscheidungstexte > 0
                      ? `${fmt(s.rechtssaetze)} / ${fmt(s.entscheidungstexte)}`
                      : "—"
                    : fmt(s.statutes)}
                </TableCell>
                {!isDecision && (
                  <TableCell className="text-right tabular-nums">
                    {s.repealed ? fmt(s.repealed) : "—"}
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">{fmt(s.chunks)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(s.embedded, s.chunks)} %
                </TableCell>
                <TableCell>
                  <QualityChip s={s} />
                </TableCell>
                <TableCell>
                  <ReconChip s={s} />
                </TableCell>
                <TableCell className="text-xs text-[color:var(--ds-text-muted)]">
                  {date(s.lastUpdated)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <section aria-labelledby="gesamtbestand-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="gesamtbestand-heading" className="text-base font-semibold">
            Gesamtbestand
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--ds-text-subtle)]">
            {d.generatedAt
              ? `Zählung der Datenbank auf dem Server vom ${date(d.generatedAt)} (stündlich neu)`
              : "Noch keine Zählung vorhanden — sie wird stündlich erstellt."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          Neu laden
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Gesetze"
          value={fmt(t.statutes)}
          hint={`${fmt(t.norms)} Normen (Paragraphen, Artikel, Anlagen)`}
        />
        <Kpi
          label="Entscheidungen"
          value={fmt(t.decisions)}
          hint={`${fmt(t.rechtssaetze)} Rechtssätze · ${fmt(t.entscheidungstexte)} Entscheidungstexte (OGH/VwGH/VfGH)`}
        />
        <Kpi label="Abschnitte" value={fmt(t.chunks)} hint={`aus ${fmt(t.pages)} Seiten`} />
        <Kpi
          label="Semantisch durchsuchbar"
          value={`${pct(t.embedded, t.chunks)} %`}
          hint={`${fmt(t.embedded)} von ${fmt(t.chunks)} Abschnitten eingebettet`}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold">Eingang der letzten 30 Tage</h3>
          {d.ingestByDay.length === 0 ? (
            <p className="mt-2 text-xs text-[color:var(--ds-text-subtle)]">
              Noch keine protokollierten Importe.
            </p>
          ) : (
            <div
              className="mt-3 flex h-28 items-end gap-1"
              role="img"
              aria-label="Neue und geänderte Dokumente je Tag"
            >
              {d.ingestByDay.map((x) => (
                <div
                  key={x.day}
                  className="group flex min-w-0 flex-1 flex-col justify-end"
                  title={`${x.day}: ${fmt(x.added)} neu, ${fmt(x.updated)} geändert`}
                >
                  <div
                    className="w-full rounded-t-sm bg-[color:var(--ds-info-text)] opacity-50 transition-opacity duration-150 group-hover:opacity-70 motion-reduce:transition-none"
                    style={{
                      height: `${(x.updated / maxDay) * 100}%`,
                      minHeight: x.updated > 0 ? 2 : 0,
                    }}
                  />
                  <div
                    className="w-full rounded-t-sm bg-[color:var(--ds-success-text)] transition-opacity duration-150 group-hover:opacity-80 motion-reduce:transition-none"
                    style={{
                      height: `${(x.added / maxDay) * 100}%`,
                      minHeight: x.added > 0 ? 2 : 0,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-[color:var(--ds-text-subtle)]">
            Grün: neu · blau: geändert. Einzelne Dokumente im Reiter „Protokoll“.
          </p>
        </CardContent>
      </Card>

      {section("Gesetze und Verordnungen", statutes, false)}
      {section("Rechtsprechung", decisions, true)}
    </section>
  );
}
