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
import { RefreshCw } from "lucide-react";
import type { CorpusOverview, CorpusSourceStats } from "@/lib/corpus-labels";

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

export function CorpusBestand() {
  const query = useQuery({
    queryKey: ["corpus-overview"],
    queryFn: async () => {
      const r = await fetch("/api/admin/corpus-overview", { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return ((await r.json()) as { data: CorpusOverview }).data;
    },
    staleTime: 60_000,
  });

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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
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
        </div>
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
                  className="flex flex-1 flex-col justify-end"
                  title={`${x.day}: ${fmt(x.added)} neu, ${fmt(x.updated)} geändert`}
                >
                  <div
                    className="w-full bg-[color:var(--ds-info-text)] opacity-50"
                    style={{ height: `${(x.updated / maxDay) * 100}%` }}
                  />
                  <div
                    className="w-full bg-[color:var(--ds-success-text)]"
                    style={{ height: `${(x.added / maxDay) * 100}%` }}
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
    </div>
  );
}
