"use client";

/**
 * Gesetze im Bestand: Zusammenfassung (vollständig / unvollständig / fehlt /
 * wird geladen) als Filter, darunter die Gesetzesliste. Jede Zeile ist ein
 * echter Link auf die Detailseite /ops/corpus/gesetz/<quelle>/<nummer>.
 *
 * Alle Filter stehen in der URL (?quelle=&status=&suche=&anzahl=) — ein
 * geteilter Link, ein Neuladen und der Weg zurück von der Detailseite landen
 * auf derselben Auswahl. Die Liste ist bewusst KEIN Scroll-Kasten: die Seite
 * scrollt, die Spaltenköpfe kleben am Fensterrand, lange Listen wachsen über
 * „Weitere anzeigen".
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DownloadCloud, Loader2, RefreshCw, Search, SearchX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn, formatDateTime } from "@/lib/utils";
import {
  LAW_SOURCES,
  lawSourceByParam,
  type LawCoverageRow,
  type LawCoverageStatus,
  type LawFetchState,
} from "@/lib/law-coverage";
import { corpusLawCoverageQuery } from "./corpus-ops-queries";
import { useLawRefetch } from "./corpus-law-refetch";
import { LIST_STEP } from "./corpus-show-more";
import { PROOF_BUCKETS } from "@/lib/corpus-proof";

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("de-AT");

/** URL-Parameter der Gesetzesliste — alles andere in der URL gehört anderen Reitern. */
export const LAW_LIST_PARAMS = ["quelle", "status", "suche", "anzahl"] as const;

export const LAW_STATUS_BADGE: Record<
  LawCoverageStatus,
  { label: string; variant: "success" | "warning" | "danger" | "info" }
> = {
  complete: { label: "vollständig", variant: "success" },
  partial: { label: "unvollständig", variant: "warning" },
  missing: { label: "fehlt", variant: "danger" },
  "db-only": { label: "nicht im RIS", variant: "info" },
};

/** Status ohne RIS-Soll (DE): kein „nicht im RIS", sondern „ohne Abgleich". */
export function lawStatusBadge(status: LawCoverageStatus, hasIndex: boolean) {
  if (status === "db-only" && !hasIndex)
    return { label: "ohne Abgleich", variant: "info" as const };
  return LAW_STATUS_BADGE[status];
}

/** „812 von 820 §§" bzw. „812 §§ gespeichert", wenn es kein Soll gibt. */
export function haveWantedText(have: number, wanted: number): string {
  return wanted > 0 ? `${fmt(have)} von ${fmt(wanted)} §§` : `${fmt(have)} §§ gespeichert`;
}

type Filter =
  | "alle"
  | "offen"
  | "unvollstaendig"
  | "fehlt"
  | "vollstaendig"
  | "abweichend"
  | "nicht-im-ris"
  | "wird-geladen";

const FILTERS: Filter[] = [
  "alle",
  "offen",
  "unvollstaendig",
  "fehlt",
  "vollstaendig",
  "abweichend",
  "nicht-im-ris",
  "wird-geladen",
];

// Positionen in PROOF_BUCKETS (src/lib/corpus-sync-inventory.ts).
const P_CONFIRMED = PROOF_BUCKETS.indexOf("confirmed");
const P_MISMATCH = PROOF_BUCKETS.indexOf("mismatch");
const P_DEFECTIVE = PROOF_BUCKETS.indexOf("defective");
const P_META = PROOF_BUCKETS.indexOf("metaMismatch");

/** Paragraphen mit falscher Prüfsumme, abgelehntem Inhalt oder Metadaten ungleich RIS. */
function wrongCount(l: LawCoverageRow): number {
  return l.proof ? l.proof[P_MISMATCH]! + l.proof[P_DEFECTIVE]! + (l.proof[P_META] ?? 0) : 0;
}

/**
 * „812 von 820 §§ belegt": nachweislich 1:1 (Prüfsumme + Inhaltsprüfung)
 * gegen das RIS-Soll des Gesetzes. null = noch nicht gemessen.
 */
function ProofCell({ l }: { l: LawCoverageRow }) {
  if (!l.proof) return <span className="text-[color:var(--ds-text-subtle)]">—</span>;
  const confirmed = l.proof[P_CONFIRMED]!;
  const total = l.proof.reduce((a, b) => a + b, 0);
  const wrong = wrongCount(l);
  const full = total > 0 && confirmed === total;
  return (
    <span
      className={cn(
        "tabular-nums",
        full
          ? "text-[color:var(--ds-success-text)]"
          : wrong > 0
            ? "text-[color:var(--ds-danger-text)]"
            : "text-[color:var(--ds-text-muted)]"
      )}
      title={
        wrong > 0
          ? `${fmt(wrong)} §§ mit abweichender Prüfsumme, fehlerhaftem Inhalt oder Metadaten ungleich RIS`
          : "Nachweislich 1:1: Prüfsumme Server = Datenbank und Inhaltsprüfung bestanden"
      }
    >
      {full ? "✓ " : ""}
      {fmt(confirmed)} von {fmt(total)}
      {wrong > 0 ? ` · ${fmt(wrong)} falsch` : ""}
    </span>
  );
}

function matchesFilter(l: LawCoverageRow, f: Filter, fetch: LawFetchState | null | undefined) {
  switch (f) {
    case "alle":
      return true;
    case "offen":
      return l.status === "partial" || l.status === "missing";
    case "unvollstaendig":
      return l.status === "partial";
    case "fehlt":
      return l.status === "missing";
    case "vollstaendig":
      return l.status === "complete";
    case "abweichend":
      return wrongCount(l) > 0;
    case "nicht-im-ris":
      return l.status === "db-only";
    case "wird-geladen":
      return !!fetch && (fetch.running === l.key || fetch.queued.includes(l.key));
  }
}

/** Die Listen-Parameter der aktuellen URL als Query-String (für den Rückweg). */
export function lawListQuery(params: { get(name: string): string | null }): string {
  const out = new URLSearchParams();
  for (const k of LAW_LIST_PARAMS) {
    const v = params.get(k);
    if (v) out.set(k, v);
  }
  return out.toString();
}

export function CorpusLawList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/ops/corpus";

  const source = lawSourceByParam(searchParams.get("quelle")) ?? LAW_SOURCES[0];
  const rawFilter = searchParams.get("status") as Filter | null;
  const filter: Filter = rawFilter && FILTERS.includes(rawFilter) ? rawFilter : "alle";
  const urlSearch = searchParams.get("suche") ?? "";
  const rawCount = parseInt(searchParams.get("anzahl") ?? "", 10);
  const count = Number.isFinite(rawCount) && rawCount > LIST_STEP ? rawCount : LIST_STEP;

  const query = useQuery(corpusLawCoverageQuery(source.id));
  const refetch = useLawRefetch();

  // Suche lokal tippen, verzögert in die URL schreiben — sonst ersetzt jeder
  // Tastendruck den Verlaufseintrag und rendert die ganze Seite neu.
  const [search, setSearch] = useState(urlSearch);
  const lastUrlSearch = useRef(urlSearch);
  useEffect(() => {
    if (urlSearch !== lastUrlSearch.current) {
      lastUrlSearch.current = urlSearch;
      setSearch(urlSearch);
    }
  }, [urlSearch]);

  const setParams = (patch: Partial<Record<(typeof LAW_LIST_PARAMS)[number], string | null>>) => {
    const p = new URLSearchParams(searchParams.toString());
    // Jeder Filterwechsel beginnt wieder bei den ersten 50.
    if (!("anzahl" in patch)) p.delete("anzahl");
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const next = search.trim();
      if (next !== urlSearch) {
        lastUrlSearch.current = next;
        setParams({ suche: next || null });
      }
    }, 300);
    return () => clearTimeout(t);
    // setParams ist pro Render neu; entscheidend sind Eingabe und URL-Stand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, urlSearch]);

  const d = query.data;
  const fetchState = d?.fetch ?? null;
  const hasIndex = d?.index.available === true;

  const filtered = useMemo(() => {
    if (!d) return [];
    const q = urlSearch.trim().toLowerCase();
    return d.laws.filter(
      (l) =>
        matchesFilter(l, filter, fetchState) &&
        (!q ||
          l.key.toLowerCase().includes(q) ||
          (l.abbr ?? "").toLowerCase().includes(q) ||
          (l.title ?? "").toLowerCase().includes(q))
    );
  }, [d, filter, fetchState, urlSearch]);
  const shown = filtered.slice(0, count);

  // Rückweg von der Detailseite: /ops/corpus?…#gesetz-<nummer> — nach dem
  // Laden die Zeile wieder in die Mitte holen und fokussieren.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !d || typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#gesetz-")) return;
    restored.current = true;
    const row = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    row.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
  }, [d]);

  const listQs = lawListQuery(searchParams);
  const detailHref = (key: string) => {
    const back = listQs ? `?zurueck=${encodeURIComponent(listQs)}` : "";
    return `${pathname}/gesetz/${source.param}/${encodeURIComponent(key)}${back}`;
  };
  // Browser-Zurück soll dieselbe Zeile wiederfinden wie der Zurück-Link:
  // vor dem Wechsel die Listen-URL um den Zeilen-Anker ergänzen.
  const rememberRow = (key: string) => {
    try {
      const qs = searchParams.toString();
      const url = `${pathname}${qs ? `?${qs}` : ""}#gesetz-${encodeURIComponent(key)}`;
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* Verlauf nicht beschreibbar — dann eben ohne Anker */
    }
  };

  const t = d?.totals;
  const open = (t?.partial ?? 0) + (t?.missing ?? 0);
  const queuedCount = fetchState ? fetchState.queued.length + (fetchState.running ? 1 : 0) : 0;
  const runningLaw = fetchState?.running
    ? d?.laws.find((l) => l.key === fetchState.running)
    : undefined;

  const tiles: Array<{
    filter: Filter;
    label: string;
    value: number;
    tone: "success" | "warning" | "danger" | "info";
    hint: string;
  }> = [
    {
      filter: "vollstaendig",
      label: "Vollständig",
      value: t?.complete ?? 0,
      tone: "success",
      hint: "alle §§ wie im RIS",
    },
    {
      filter: "unvollstaendig",
      label: "Unvollständig",
      value: t?.partial ?? 0,
      tone: "warning",
      hint: `${fmt(t?.docsMissing)} §§ fehlen insgesamt`,
    },
    {
      filter: "fehlt",
      label: "Fehlen ganz",
      value: t?.missing ?? 0,
      tone: "danger",
      hint: "kein einziger § gespeichert",
    },
  ];
  if (source.refetch) {
    tiles.push({
      filter: "wird-geladen",
      label: "Wird geladen",
      value: queuedCount,
      tone: "info",
      hint: fetchState?.running
        ? `jetzt: ${runningLaw?.abbr ?? runningLaw?.title ?? `Gesetz ${fetchState.running}`}`
        : queuedCount > 0
          ? "wartet auf das nächste RIS-Fenster"
          : "nichts vorgemerkt",
    });
  } else if ((t?.extra ?? 0) > 0) {
    tiles.push({
      filter: "nicht-im-ris",
      label: hasIndex ? "Nicht im RIS" : "Ohne Abgleich",
      value: t?.extra ?? 0,
      tone: "info",
      hint: hasIndex ? "gespeichert, aber nicht mehr gelistet" : "kein amtliches Verzeichnis",
    });
  }

  const toneText: Record<string, string> = {
    success: "text-[color:var(--ds-success-text)]",
    warning: "text-[color:var(--ds-warning-text)]",
    danger: "text-[color:var(--ds-danger-text)]",
    info: "text-[color:var(--ds-info-text)]",
  };

  const filterLabel: Record<Filter, string> = {
    alle: "Alle",
    offen: "Offen",
    unvollstaendig: "Unvollständig",
    fehlt: "Fehlen ganz",
    vollstaendig: "Vollständig",
    abweichend: "Abweichend/fehlerhaft",
    "nicht-im-ris": hasIndex ? "Nicht im RIS" : "Ohne Abgleich",
    "wird-geladen": "Wird geladen",
  };
  const chipFilters: Filter[] = [
    "alle",
    "offen",
    "unvollstaendig",
    "fehlt",
    "vollstaendig",
    ...(d?.laws.some((l) => wrongCount(l) > 0) ? (["abweichend"] as Filter[]) : []),
    ...((t?.extra ?? 0) > 0 ? (["nicht-im-ris"] as Filter[]) : []),
    ...(source.refetch ? (["wird-geladen"] as Filter[]) : []),
  ];

  return (
    <section aria-labelledby="gesetze-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="gesetze-heading" className="text-base font-semibold">
            Gesetze
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
            Jedes Gesetz Paragraph für Paragraph mit dem amtlichen Verzeichnis abgeglichen —
            „nachweislich 1:1“ heißt: Prüfsumme Server = Datenbank und Inhaltsprüfung bestanden.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Quelle"
            className="inline-flex rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-0.5"
          >
            {LAW_SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === source.id}
                onClick={() =>
                  setParams({
                    quelle: s.id === LAW_SOURCES[0].id ? null : s.param,
                    status: null,
                  })
                }
                className={cn(
                  "min-h-8 rounded-md px-3 text-xs font-medium transition-colors duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                  s.id === source.id
                    ? "bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] shadow-sm"
                    : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            aria-label="Gesetzes-Abgleich neu laden"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", query.isFetching && "animate-spin")}
              aria-hidden
            />
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Gesetze werden geladen">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[84px] w-full" />
            ))}
          </div>
          <Card>
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-9 w-full" />
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      ) : query.isError || !d ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-[color:var(--ds-danger-text)]" role="alert">
              Der Gesetzes-Abgleich konnte nicht geladen werden. Bitte erneut versuchen — bleibt der
              Fehler, ist die Datenbank auf dem Server gerade nicht erreichbar.
            </p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Neu laden
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Auf einen Blick — jede Kachel ist zugleich der Filter. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((tile) => {
              const active = filter === tile.filter;
              return (
                <button
                  key={tile.filter}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setParams({ status: active ? null : tile.filter })}
                  className={cn(
                    "rounded-xl border bg-[color:var(--ds-surface)] p-4 text-left transition-[border-color,background-color] duration-[var(--ds-duration-fast)] hover:border-[color:var(--ds-border-strong)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                    active
                      ? "border-[color:var(--brand-primary)] bg-[color:var(--ds-surface-2)]"
                      : "border-[color:var(--ds-border)]"
                  )}
                >
                  <span className="block text-xs tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                    {tile.label}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-2xl font-semibold tabular-nums",
                      tile.value > 0 ? toneText[tile.tone] : "text-[color:var(--ds-text)]"
                    )}
                  >
                    {fmt(tile.value)}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[color:var(--ds-text-muted)]">
                    {tile.hint}
                  </span>
                </button>
              );
            })}
          </div>

          {open > 0 && filter !== "offen" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-2.5">
              <p className="text-sm text-[color:var(--ds-warning-text)]">
                {fmt(open)} {open === 1 ? "Gesetz braucht" : "Gesetze brauchen"} Aufmerksamkeit —{" "}
                {fmt(t?.partial)} unvollständig, {fmt(t?.missing)} fehlen ganz.
              </p>
              <Button variant="outline" size="sm" onClick={() => setParams({ status: "offen" })}>
                Nur diese anzeigen
              </Button>
            </div>
          )}

          <p className="text-xs text-[color:var(--ds-text-subtle)]">
            {d.index.available === true && (
              <>
                Amtliches Verzeichnis vom {formatDateTime(d.index.measured_at)} ({fmt(d.index.laws)}{" "}
                Gesetze, {fmt(d.index.docs)} §§) · Datenbank-Stand vom{" "}
                {formatDateTime(d.generated_at)}
              </>
            )}
            {d.index.available === false && (
              <span className="text-[color:var(--ds-warning-text)]" role="alert">
                Das amtliche Verzeichnis für diese Quelle fehlt auf dem Server — angezeigt wird nur,
                was in der Datenbank liegt.
              </span>
            )}
            {d.index.available === null &&
              "Für diese Quelle gibt es kein amtliches Verzeichnis zum Abgleich — angezeigt wird, was in der Datenbank liegt."}
          </p>

          <Card>
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 border-b border-[color:var(--ds-border)] p-4">
                <div className="relative">
                  <Search
                    className="absolute top-2.5 left-3 h-4 w-4 text-[color:var(--ds-text-subtle)]"
                    aria-hidden
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Gesetz suchen — Abkürzung, Titel oder Nummer (z. B. ABGB, 10001622)"
                    className="pl-9"
                    aria-label="Gesetz suchen"
                    type="search"
                  />
                </div>
                <div role="group" aria-label="Status-Filter" className="flex flex-wrap gap-1.5">
                  {chipFilters.map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={filter === f}
                      onClick={() => setParams({ status: f === "alle" ? null : f })}
                      className={cn(
                        "min-h-8 rounded-full border px-3 text-xs font-medium transition-colors duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                        filter === f
                          ? "border-[color:var(--brand-primary)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                          : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                      )}
                    >
                      {filterLabel[f]}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="p-4">
                  {d.laws.length === 0 ? (
                    <EmptyState
                      icon={SearchX}
                      title="Keine Gesetze in dieser Quelle"
                      description="Die Datenbank meldet für diese Quelle noch keine Gesetze. Der Abgleich läuft nach jedem Import neu."
                      actionLabel="Neu laden"
                      onAction={() => void query.refetch()}
                    />
                  ) : (
                    <EmptyState
                      icon={SearchX}
                      title="Kein Gesetz passt zu diesem Filter"
                      description={
                        urlSearch
                          ? `Für „${urlSearch}" mit dem Filter „${filterLabel[filter]}" gibt es keinen Treffer.`
                          : `Im Filter „${filterLabel[filter]}" ist derzeit kein Gesetz.`
                      }
                      actionLabel="Filter zurücksetzen"
                      onAction={() => {
                        setSearch("");
                        lastUrlSearch.current = "";
                        setParams({ status: null, suche: null });
                      }}
                    />
                  )}
                </div>
              ) : (
                <>
                  {/* Spaltenköpfe: kleben unter der Reiterleiste (z-20) am
                      Fensterrand, über den Zeilen-Knöpfen (z-10). */}
                  <div
                    aria-hidden
                    data-testid="law-list-header"
                    className="sticky top-[var(--corpus-sticky-top,0px)] z-[15] hidden grid-cols-[minmax(0,1fr)_8.5rem_10rem_5rem_10rem_8.5rem] gap-3 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-2 text-xs font-medium text-[color:var(--ds-text-muted)] md:grid"
                  >
                    <span>Gesetz</span>
                    <span>Status</span>
                    <span>Bestand</span>
                    <span className="text-right">fehlen</span>
                    <span
                      className="text-right"
                      title="Prüfsumme Server = Datenbank und Inhaltsprüfung bestanden"
                    >
                      nachweislich 1:1
                    </span>
                    <span />
                  </div>
                  <ul data-testid="law-list" aria-label="Gesetze">
                    {shown.map((l) => {
                      const badge = lawStatusBadge(l.status, hasIndex);
                      const isRunning = fetchState?.running === l.key;
                      const isQueued = !isRunning && !!fetchState?.queued.includes(l.key);
                      const name = l.abbr ?? l.title ?? `Gesetz ${l.key}`;
                      return (
                        <li
                          key={l.key}
                          id={`gesetz-${l.key}`}
                          className="relative grid scroll-mt-24 grid-cols-1 gap-1.5 border-b border-[color:var(--ds-border)] px-4 py-3 transition-colors duration-[var(--ds-duration-fast)] last:border-b-0 focus-within:bg-[color:var(--ds-surface-2)] hover:bg-[color:var(--ds-surface-2)] motion-reduce:transition-none md:grid-cols-[minmax(0,1fr)_8.5rem_10rem_5rem_10rem_8.5rem] md:items-center md:gap-3"
                        >
                          <div className="min-w-0">
                            <Link
                              href={detailHref(l.key)}
                              onClick={() => rememberRow(l.key)}
                              className="block truncate font-medium text-[color:var(--ds-text)] after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none"
                            >
                              {name}
                            </Link>
                            <p className="truncate text-xs text-[color:var(--ds-text-subtle)]">
                              {l.abbr && l.title ? `${l.title} · ` : ""}Nr. {l.key}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            {(isRunning || isQueued) && (
                              <Badge variant="info">
                                {isRunning ? "wird geladen" : "vorgemerkt"}
                              </Badge>
                            )}
                            {/* Mobil: Bestand direkt neben dem Status */}
                            <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums md:hidden">
                              {haveWantedText(l.have, l.wanted)}
                              {l.missingCount > 0 ? ` · ${fmt(l.missingCount)} fehlen` : ""}
                            </span>
                            {l.proof && (
                              <span className="text-xs md:hidden">
                                <ProofCell l={l} /> belegt
                              </span>
                            )}
                          </div>
                          <span className="hidden text-sm tabular-nums md:block">
                            {haveWantedText(l.have, l.wanted)}
                          </span>
                          <span
                            className={cn(
                              "hidden text-right text-sm tabular-nums md:block",
                              l.missingCount > 0 && "text-[color:var(--ds-danger-text)]"
                            )}
                          >
                            {l.missingCount > 0 ? fmt(l.missingCount) : "—"}
                          </span>
                          <span className="hidden text-right text-sm md:block">
                            <ProofCell l={l} />
                          </span>
                          <div className="md:text-right">
                            {source.refetch &&
                              l.missingCount > 0 &&
                              !isRunning &&
                              !isQueued &&
                              /^\d+$/.test(l.key) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="relative z-10"
                                  disabled={refetch.isPending}
                                  onClick={() => refetch.mutate(l.key)}
                                  aria-label={`${name}: ${fmt(l.missingCount)} fehlende §§ vom RIS nachladen`}
                                >
                                  {refetch.isPending && refetch.variables === l.key ? (
                                    <Loader2
                                      className="mr-1.5 h-3.5 w-3.5 animate-spin"
                                      aria-hidden
                                    />
                                  ) : (
                                    <DownloadCloud className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                  )}
                                  Nachladen
                                </Button>
                              )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {filtered.length > shown.length && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--ds-border)] px-4 py-3">
                      <p className="text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                        {fmt(shown.length)} von {fmt(filtered.length)} Gesetzen angezeigt
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setParams({ anzahl: String(count + LIST_STEP) })}
                      >
                        Weitere {fmt(Math.min(LIST_STEP, filtered.length - shown.length))} anzeigen
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
