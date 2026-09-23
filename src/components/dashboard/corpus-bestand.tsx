"use client";

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
import { RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CorpusSourceStats } from "@/lib/corpus-labels";
import type { SourceAuditRow } from "@/lib/corpus-completeness-audit";
import type { LawCoverageRow } from "@/lib/law-coverage";
import {
  corpusCoverageAuditQuery,
  corpusLawCoverageQuery,
  corpusOverviewQuery,
} from "./corpus-ops-queries";

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
                        {r.source_id} · {r.jurisdiction}
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
                  {a.de_statutes.target.missing.map((m) => m.slug).join(", ")}
                </p>
              ) : null}
              {a.de_statutes.missing.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]">
                    {fmt(a.de_statutes.missing.length)} fehlende Gesetze anzeigen
                    {a.de_statutes.missing_truncated ? " (Liste gekürzt)" : ""}
                  </summary>
                  <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs text-[color:var(--ds-text-muted)]">
                    {a.de_statutes.missing.map((m) => (
                      <li key={m.slug}>
                        <span className="font-mono">{m.slug}</span> — {m.title}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("de-AT");
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" }) : "—";

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

const LAW_SOURCES = [
  { id: "law-at-normen", label: "AT Bundesrecht" },
  { id: "law-at-landesrecht", label: "AT Landesrecht" },
  { id: "law-de", label: "DE Bundesrecht" },
] as const;

const LAW_STATUS: Record<LawCoverageRow["status"], { label: string; cls: string }> = {
  missing: {
    label: "fehlt ganz",
    cls: "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  },
  partial: {
    label: "teilweise",
    cls: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  },
  complete: {
    label: "vollständig",
    cls: "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  },
  "db-only": {
    label: "nur in DB",
    cls: "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  },
};

const LAW_ROW_LIMIT = 500;

/** §-genauer Drilldown: pro Gesetz RIS-Soll vs. DB-Ist vs. Embedding. */
function LawCoverage() {
  const [source, setSource] = useState<string>("law-at-normen");
  const [search, setSearch] = useState("");
  const query = useQuery(corpusLawCoverageQuery(source));

  const body = (() => {
    if (query.isLoading) return <Skeleton className="mt-3 h-40 w-full" />;
    if (query.isError || !query.data) {
      return (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-[color:var(--ds-danger-text)]" role="alert">
            Gesetzes-Abgleich konnte nicht geladen werden.
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
        </div>
      );
    }

    const d = query.data;
    const t = d.totals;
    const q = search.trim().toLowerCase();
    const filtered = q
      ? d.laws.filter(
          (l) =>
            l.key.includes(q) ||
            (l.abbr ?? "").toLowerCase().includes(q) ||
            (l.title ?? "").toLowerCase().includes(q)
        )
      : d.laws;
    const shown = filtered.slice(0, LAW_ROW_LIMIT);

    return (
      <>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge className="bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]">
            {fmt(t.complete)} vollständig
          </Badge>
          <Badge className="bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]">
            {fmt(t.partial)} teilweise
          </Badge>
          <Badge className="bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]">
            {fmt(t.missing)} fehlen ganz
          </Badge>
          {t.extra > 0 && (
            <Badge className="bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]">
              {fmt(t.extra)} nur in DB
            </Badge>
          )}
          {d.index.available !== null && (
            <span className="text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
              {fmt(t.docsHave)} von {fmt(t.docsWanted)} Norm-Dokumenten · {fmt(t.docsMissing)}{" "}
              fehlen
            </span>
          )}
        </div>

        <p className="mt-2 text-xs text-[color:var(--ds-text-subtle)]">
          {d.index.available === true && (
            <>
              RIS-In-force-Index vom {date(d.index.measured_at)} ({fmt(d.index.laws)} Gesetze,{" "}
              {fmt(d.index.docs)} Dokumente) · DB-Zahlen live vom {date(d.generated_at)}
            </>
          )}
          {d.index.available === false && (
            <span className="text-[color:var(--ds-warning-text)]" role="alert">
              RIS-Index-Datei „{d.index.file}“ fehlt — es wird nur der DB-Stand angezeigt, kein
              Upstream-Soll.
            </span>
          )}
          {d.index.available === null &&
            "Für diese Quelle gibt es kein Upstream-Inhaltsverzeichnis — Anzeige des DB-Stands je Gesetz."}
        </p>

        <div className="relative mt-3">
          <Search
            className="absolute top-2.5 left-3 h-4 w-4 text-[color:var(--ds-text-subtle)]"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Gesetz suchen — Abkürzung, Titel oder Nummer (z. B. ABGB, 10001700)"
            className="pl-9"
            aria-label="Gesetz suchen"
          />
        </div>

        {shown.length === 0 ? (
          <p className="mt-3 text-xs text-[color:var(--ds-text-subtle)]">
            {q ? `Kein Gesetz passt auf „${search.trim()}".` : "Keine Gesetze in dieser Quelle."}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gesetz</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">RIS-Soll</TableHead>
                  <TableHead className="text-right">in DB</TableHead>
                  <TableHead className="text-right">fehlen</TableHead>
                  <TableHead className="text-right">Abschnitte</TableHead>
                  <TableHead className="text-right">eingebettet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell>
                      <div className="font-medium">{l.abbr ?? l.title ?? l.key}</div>
                      <div className="text-xs text-[color:var(--ds-text-subtle)]">
                        {l.abbr && l.title ? `${l.title} · ` : ""}
                        <span className="font-mono">{l.key}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={LAW_STATUS[l.status].cls}>
                        {LAW_STATUS[l.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.wanted > 0 ? fmt(l.wanted) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(l.have)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.missingCount > 0 ? (
                        <details className="text-left">
                          <summary className="cursor-pointer text-[color:var(--ds-danger-text)] hover:underline">
                            {fmt(l.missingCount)}
                          </summary>
                          <ul className="mt-1 max-h-40 max-w-[220px] space-y-0.5 overflow-y-auto text-left text-xs">
                            {l.missingDocs.map((m) => (
                              <li key={m.nor}>
                                <span className="font-mono">{m.nor}</span>
                                {m.apa ? ` — ${m.apa}` : ""}
                              </li>
                            ))}
                            {l.missingTruncated && (
                              <li className="text-[color:var(--ds-text-subtle)]">
                                … Liste gekürzt (max. 50)
                              </li>
                            )}
                          </ul>
                        </details>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(l.chunks)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.embedPct !== null ? `${l.embedPct} %` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > shown.length && (
              <p className="mt-2 text-xs text-[color:var(--ds-text-subtle)]">
                {fmt(shown.length)} von {fmt(filtered.length)} Gesetzen angezeigt — Suche
                eingrenzen.
              </p>
            )}
          </div>
        )}
      </>
    );
  })();

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Gesetze im Detail (§-Ebene)</h3>
          <div className="flex items-center gap-2">
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Quelle wählen">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAW_SOURCES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              aria-label="Gesetzes-Abgleich neu laden"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`}
                aria-hidden
              />
            </Button>
          </div>
        </div>
        {body}
      </CardContent>
    </Card>
  );
}

export function CorpusBestand() {
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
        {/* No extra overflow-x-auto wrapper here: <Table> already provides one
            (with overscroll-x-contain) — a second one nested around it did
            nothing but add an uncontained scroll edge. */}
        <Table>
          {/* Sticky against the page's own scroll container so the column
              headers stay put while this list of ~20 sources scrolls past. */}
          <TableHeader className="sticky top-0 z-10 [background:var(--ds-surface)]">
            <TableRow>
              <TableHead>Quelle</TableHead>
              <TableHead className="text-right">{isDecision ? "Dokumente" : "Normen"}</TableHead>
              <TableHead className="text-right">
                {isDecision ? "Rechtssätze / Texte" : "Gesetze"}
              </TableHead>
              {!isDecision && <TableHead className="text-right">außer Kraft</TableHead>}
              <TableHead className="text-right">Abschnitte</TableHead>
              <TableHead className="text-right">eingebettet</TableHead>
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[color:var(--ds-text-subtle)]">
          {d.generatedAt
            ? `Zählung der Datenbank auf dem Server vom ${date(d.generatedAt)} (stündlich neu)`
            : "Noch keine Zählung vorhanden — sie wird stündlich erstellt."}
        </p>
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

      <LawCoverage />
      <CoverageAudit />
    </div>
  );
}
