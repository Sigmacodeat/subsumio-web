"use client";

/**
 * Bestand nach Rechtsbereich, mit Nachweis je Dokument (Reiter „Bestand").
 *
 * Grün ist nur, was alle Prüfungen besteht: RIS listet die Nummer, die Datei
 * liegt auf dem Server, ihre Prüfsumme gleicht der in der Datenbank, und die
 * Inhaltsprüfung hat genau diesen Stand angenommen. Jedes Dokument steht in
 * genau einem Topf — Fehlendes, Abweichendes und Ungeprüftes wird nie mit
 * Bestätigtem zusammengezählt, und jede Zeile rechnet ihre Summenprobe vor.
 *
 * Die Zahlen kommen aus der stündlichen Messung im corpus-pipeline-Container
 * (server/scripts/corpus-sync-inventory.ts); diese Komponente rechnet nichts
 * nach, sie gruppiert nur (src/lib/corpus-proof-view.ts).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileSearch,
  RefreshCw,
  ScrollText,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { cn, formatDateTime } from "@/lib/utils";
import type { CorpusSyncRow } from "@/lib/corpus-sync-inventory";
import {
  META_FIELD_LABELS,
  PROOF_BUCKETS,
  proofTotal,
  type ProofBucket,
  type ProofCounts,
  type ProofUnit,
} from "@/lib/corpus-proof";
import { landName, risDocumentUrl, LAENDER } from "@/lib/corpus-areas";
import { sumSeries, trendOf, type DailyPoint, type Trend } from "@/lib/corpus-progress";
import {
  byCategory,
  confirmedPct,
  groupByArea,
  isFullyConfirmed,
  rowMatches,
  sumCheck,
  totalCounts,
  type AreaGroup,
  type ProofCategory,
  type ProofFilter,
} from "@/lib/corpus-proof-view";

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("de-AT");
const pctText = (n: number | null) =>
  n === null
    ? "—"
    : `${n.toLocaleString("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

/** Bedeutung jedes Topfs — Farbe, Name, was er heißt, was zu tun ist. */
const BUCKET: Record<
  ProofBucket,
  { label: string; bar: string; text: string; means: string; todo: string }
> = {
  confirmed: {
    label: "Nachweislich 1:1",
    bar: "bg-[color:var(--ds-success-solid)]",
    text: "text-[color:var(--ds-success-text)]",
    means:
      "Im RIS gelistet, Datei auf dem Server, Prüfsumme Server = Datenbank, Inhaltsprüfung für genau diesen Stand bestanden; bei Gesetzen zusätzlich Kurztitel, Abkürzung, Kundmachungsorgan, Geltungszeitraum, Bundesland und Paragraph wie im RIS.",
    todo: "Nichts.",
  },
  mismatch: {
    label: "Prüfsumme weicht ab",
    bar: "bg-[color:var(--ds-danger-solid)]",
    text: "text-[color:var(--ds-danger-text)]",
    means:
      "Die Datenbank hält einen anderen Stand als die Datei auf dem Server — oder eine Seite hat keine Prüfsumme, oder zwei Dateien mit verschiedenem Inhalt tragen dieselbe Nummer.",
    todo: "Neu importieren; bei zwei Dateien die veraltete entfernen.",
  },
  defective: {
    label: "Inhalt fehlerhaft",
    bar: "bg-[color:var(--ds-attention-solid)]",
    text: "text-[color:var(--ds-attention-text)]",
    means:
      "Prüfsumme stimmt, aber die Inhaltsprüfung hat diesen Stand abgelehnt (z. B. Text leer, abgeschnitten oder aus einem bekannt fehlerhaften Abruf).",
    todo: "Beim RIS neu abrufen; im Inspektor ansehen.",
  },
  metaMismatch: {
    label: "Metadaten ≠ RIS",
    bar: "bg-[color:var(--ds-danger-solid)]/55",
    text: "text-[color:var(--ds-danger-text)]",
    means:
      "Text belegt, aber mindestens ein Metadatenfeld fehlt oder weicht vom amtlichen RIS-Verzeichnis ab (Kurztitel, Abkürzung, Kundmachungsorgan, In-/Außerkrafttreten, Bundesland, Paragraph).",
    todo: "Wird beim nächsten Normalisieren aus dem RIS-Verzeichnis ergänzt.",
  },
  unchecked: {
    label: "Noch nicht geprüft",
    bar: "bg-[color:var(--ds-info-solid)]/40",
    text: "text-[color:var(--ds-info-text)]",
    means:
      "Prüfsumme stimmt, aber seit der letzten Inhaltsprüfung geändert oder neu — noch kein Urteil.",
    todo: "Nächsten Prüflauf abwarten (alle 6 Stunden).",
  },
  importOpen: {
    label: "Wartet auf Import",
    bar: "bg-[color:var(--ds-info-solid)]",
    text: "text-[color:var(--ds-info-text)]",
    means: "Datei liegt auf dem Server, aber noch nicht in der Datenbank.",
    todo: "Import läuft über die Pipeline.",
  },
  fetchOpen: {
    label: "Fehlt — Abruf offen",
    bar: "bg-[color:var(--ds-warning-solid)]",
    text: "text-[color:var(--ds-warning-text)]",
    means: "Im RIS gelistet, aber noch nicht bei uns (oder der letzte Abruf ist gescheitert).",
    todo: "Nachholen beim RIS.",
  },
  unreachable: {
    label: "Fehlt — RIS ohne Text",
    bar: "bg-[color:var(--ds-text-subtle)]",
    text: "text-[color:var(--ds-text-muted)]",
    means:
      "RIS listet die Nummer, liefert aber keinen Text (nur PDF/Bild) oder kennt sie nicht mehr.",
    todo: "Mit unserem Abruf nicht schließbar — einzeln prüfen.",
  },
};

const CATEGORY: Record<
  ProofCategory,
  { label: string; hint: string; tone: string; icon: typeof CheckCircle2 }
> = {
  confirmed: {
    label: "Nachweislich 1:1",
    hint: "alle Prüfungen bestanden",
    tone: "text-[color:var(--ds-success-text)]",
    icon: CheckCircle2,
  },
  wrong: {
    label: "Abweichend oder fehlerhaft",
    hint: "Prüfsumme, Inhalt oder Metadaten falsch",
    tone: "text-[color:var(--ds-danger-text)]",
    icon: XCircle,
  },
  missing: {
    label: "Fehlen",
    hint: "im RIS, nicht bei uns",
    tone: "text-[color:var(--ds-warning-text)]",
    icon: AlertTriangle,
  },
  working: {
    label: "In Arbeit",
    hint: "Import oder Prüfung ausstehend",
    tone: "text-[color:var(--ds-info-text)]",
    icon: RefreshCw,
  },
};

const FILTERS: ProofFilter[] = [
  "offen",
  "alle",
  "stockt",
  "confirmed",
  "wrong",
  "missing",
  "working",
];
const FILTER_LABEL: Record<ProofFilter, string> = {
  offen: "Mit offenen Punkten",
  stockt: "Stockt",
  alle: "Alle",
  confirmed: "Nachweislich 1:1",
  wrong: "Abweichend/fehlerhaft",
  missing: "Fehlen",
  working: "In Arbeit",
};

/** Gesetzesliste je Quelle (CorpusLawList), dort §-genau. */
const LAW_LIST_PARAM: Record<string, string> = {
  "at-normen": "bundesrecht",
  "at-landesrecht": "landesrecht",
};

/** Verlauf ohne Fortschritt, obwohl etwas offen ist — braucht einen Blick. */
function isStuck(t: Trend): boolean {
  return t.state === "stalled" || t.state === "growing";
}

export function CorpusNachweis({
  rows,
  measuredAt,
  progress = {},
  onInspect,
  onRefresh,
}: {
  rows: CorpusSyncRow[];
  measuredAt: string | null;
  /** Tagesstände je Quelle (corpus) aus corpus-sync-history. */
  progress?: Record<string, DailyPoint[]>;
  onInspect?: (sourceId: string) => void;
  onRefresh?: () => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/ops/corpus";
  const raw = searchParams.get("nachweis") as ProofFilter | null;
  const filter: ProofFilter = raw && FILTERS.includes(raw) ? raw : "alle";
  const setFilter = (f: ProofFilter) => {
    const p = new URLSearchParams(searchParams.toString());
    if (f === "alle") p.delete("nachweis");
    else p.set("nachweis", f);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const groups = useMemo(() => groupByArea(rows), [rows]);
  const total = useMemo(() => totalCounts(groups), [groups]);
  const cats = byCategory(total);
  const outside = rows.filter((r) => !r.inScope || r.historical);
  const unmeasured = groups.reduce((n, g) => n + g.unmeasured, 0);
  const matches = (r: CorpusSyncRow) =>
    filter === "stockt"
      ? isStuck(trendOf(progress[r.corpus] ?? []))
      : rowMatches(r.proof?.counts ?? null, filter);
  const overall = useMemo(
    () => sumSeries(groups.flatMap((g) => g.rows.map((r) => progress[r.corpus] ?? []))),
    [groups, progress]
  );

  if (!measuredAt) {
    return (
      <Card className="border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]">
        <CardContent className="flex items-start gap-2 p-4 text-sm text-[color:var(--ds-warning-text)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Noch keine Messung nach Dokumentnummer vorhanden. Die Pipeline misst stündlich; bis
            dahin zeigt diese Ansicht bewusst keine geschätzten Zahlen.
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-labelledby="nachweis-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h2 id="nachweis-heading" className="text-base font-semibold">
            Bestand nach Rechtsbereich
          </h2>
          <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
            Grün ist nur, was alle Prüfungen besteht. Jedes Dokument steht in genau einem Topf —
            Fehlendes, Abweichendes und Ungeprüftes wird nie mit Bestätigtem zusammengezählt.
          </p>
        </div>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} aria-label="Neu laden">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>

      <ProofSteps />

      <p className="text-xs text-[color:var(--ds-text-subtle)]">
        Gezählt nach RIS-Dokumentnummer — dieselbe Einheit für RIS, Server und Datenbank. Messung
        vom {formatDateTime(measuredAt)} (stündlich).
        {unmeasured > 0 && (
          <span className="text-[color:var(--ds-warning-text)]">
            {" "}
            {fmt(unmeasured)} {unmeasured === 1 ? "Quelle hat" : "Quellen haben"} noch keinen
            Nachweis — die nächste Messung holt ihn nach.
          </span>
        )}
      </p>

      {/* Die vier Fragen — jede Kachel ist zugleich der Filter. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(Object.keys(CATEGORY) as ProofCategory[]).map((c) => {
          const cfg = CATEGORY[c];
          const active = filter === c;
          const value = cats[c];
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(active ? "alle" : c)}
              className={cn(
                "rounded-xl border bg-[color:var(--ds-surface)] p-4 text-left transition-[border-color,background-color] duration-[var(--ds-duration-fast)] hover:border-[color:var(--ds-border-strong)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                active
                  ? "border-[color:var(--brand-primary)] bg-[color:var(--ds-surface-2)]"
                  : "border-[color:var(--ds-border)]"
              )}
            >
              <span className="flex items-center gap-1.5 text-xs tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                <cfg.icon className={cn("h-3.5 w-3.5", cfg.tone)} aria-hidden />
                {cfg.label}
              </span>
              <span
                className={cn(
                  "mt-1 block text-2xl font-semibold tabular-nums",
                  value > 0 || c === "confirmed" ? cfg.tone : "text-[color:var(--ds-text)]"
                )}
              >
                {fmt(value)}
              </span>
              <span className="mt-0.5 block text-xs text-[color:var(--ds-text-muted)]">
                {c === "confirmed"
                  ? `${pctText(confirmedPct(total))} aller Dokumente`
                  : c === "missing" && total.unreachable > 0
                    ? `davon ${fmt(total.unreachable)} bei RIS ohne Text`
                    : cfg.hint}
              </span>
            </button>
          );
        })}
      </div>

      <ProgressPanel points={overall} />

      <div role="group" aria-label="Ansicht filtern" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "min-h-8 rounded-full border px-3 text-xs font-medium transition-colors duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
              filter === f
                ? "border-[color:var(--brand-primary)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            )}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      <Legend />

      <div className="space-y-4">
        {groups.map((g) => (
          <AreaSection
            key={g.area.id}
            group={g}
            matches={matches}
            progress={progress}
            onInspect={onInspect}
            onRefresh={onRefresh}
          />
        ))}
        {groups.every((g) => !g.rows.some(matches)) && (
          <EmptyState
            icon={CheckCircle2}
            title="Keine Quelle in diesem Filter"
            description={`Im Filter „${FILTER_LABEL[filter]}" gibt es derzeit nichts.`}
            actionLabel="Alle zeigen"
            onAction={() => setFilter("alle")}
          />
        )}
      </div>

      {outside.length > 0 && (
        <details className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Nicht im automatischen Abgleich ({fmt(outside.length)} Quellen)
          </summary>
          <p className="mt-2 text-xs text-[color:var(--ds-text-muted)]">
            Deutschland, Schweiz, EU und das Archiv alter Bundesrecht-Fassungen werden nicht gegen
            das RIS geprüft und zählen in keine Summe oben.
          </p>
          <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            {outside
              .slice()
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((r) => (
                <li key={r.corpus} className="flex justify-between gap-3">
                  <span className="truncate">{r.label}</span>
                  <span className="text-[color:var(--ds-text-muted)] tabular-nums">
                    {fmt(r.dbPages)} Seiten
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ProofSteps() {
  const steps = [
    "Im RIS gelistet",
    "Datei auf dem Server",
    "Prüfsumme Server = Datenbank",
    "Inhaltsprüfung bestanden",
    "Metadaten = RIS (Gesetze)",
  ];
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-[color:var(--ds-text-muted)]">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1">
            <span className="font-semibold text-[color:var(--ds-text)] tabular-nums">{i + 1}</span>
            {s}
          </span>
          {i < steps.length - 1 && <span aria-hidden>→</span>}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span aria-hidden>=</span>
        <Badge variant="success">nachweislich 1:1</Badge>
      </li>
    </ol>
  );
}

function Legend() {
  return (
    <ul
      aria-label="Legende der Töpfe"
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--ds-text-muted)]"
    >
      {PROOF_BUCKETS.map((b) => (
        <li key={b} className="flex items-center gap-1.5" title={BUCKET[b].means}>
          <span className={cn("h-2.5 w-2.5 rounded-sm", BUCKET[b].bar)} aria-hidden />
          {BUCKET[b].label}
        </li>
      ))}
    </ul>
  );
}

/** Gestapelter Balken: jeder Topf ein Segment, Breite = Anteil. */
function ProofBar({ counts, className }: { counts: ProofCounts; className?: string }) {
  const total = proofTotal(counts);
  if (total === 0)
    return <div className={cn("h-2 rounded-full bg-[color:var(--ds-surface-2)]", className)} />;
  return (
    <div
      className={cn(
        "flex h-2 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]",
        className
      )}
      role="img"
      aria-label={PROOF_BUCKETS.filter((b) => counts[b] > 0)
        .map((b) => `${BUCKET[b].label}: ${fmt(counts[b])}`)
        .join(", ")}
    >
      {PROOF_BUCKETS.map((b) =>
        counts[b] > 0 ? (
          <div
            key={b}
            className={BUCKET[b].bar}
            // Mindestbreite: ein einzelnes fehlendes Dokument bleibt sichtbar.
            style={{ width: `max(${(counts[b] / total) * 100}%, 3px)` }}
          />
        ) : null
      )}
    </div>
  );
}

/** Nur die Töpfe mit Inhalt außer „bestätigt" — die offenen Punkte einer Zeile. */
function ProblemChips({ counts }: { counts: ProofCounts }) {
  const open = PROOF_BUCKETS.filter((b) => b !== "confirmed" && counts[b] > 0);
  if (open.length === 0)
    return (
      <span className="text-xs text-[color:var(--ds-success-text)]">✓ alles nachweislich 1:1</span>
    );
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
      {open.map((b) => (
        <span key={b} className={cn("font-medium", BUCKET[b].text)} title={BUCKET[b].means}>
          {fmt(counts[b])} {BUCKET[b].label.toLowerCase()}
        </span>
      ))}
    </span>
  );
}

/** Gesamtfortschritt: Kurve „nachweislich 1:1" der letzten 30 Tage und Restdauer. */
function ProgressPanel({ points }: { points: DailyPoint[] }) {
  const last = points.at(-1);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium">Fortschritt der letzten 30 Tage</p>
        <p className="mt-0.5">
          <TrendText points={points} />
        </p>
      </div>
      {points.length >= 2 ? (
        <Sparkline points={points} wide />
      ) : (
        <p className="text-xs text-[color:var(--ds-text-subtle)]">
          Die Kurve beginnt mit der ersten Messung nach dem Deploy und füllt sich täglich.
        </p>
      )}
      {last && (
        <p className="ml-auto text-xs text-[color:var(--ds-text-muted)] tabular-nums">
          {fmt(last.open)} Dokumente offen, die wir schließen können
        </p>
      )}
    </div>
  );
}

/** Anteil „nachweislich 1:1" je Tag als Linie; leer bei weniger als zwei Tagen. */
function Sparkline({ points, wide = false }: { points: DailyPoint[]; wide?: boolean }) {
  if (points.length < 2) return null;
  const w = wide ? 220 : 72;
  const h = wide ? 36 : 18;
  const ratios = points.map((p) => (p.total > 0 ? p.confirmed / p.total : 0));
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  const span = max - min || 1;
  const xy = ratios.map((r, i) => [
    (i / (ratios.length - 1)) * (w - 2) + 1,
    h - 1 - ((r - min) / span) * (h - 2),
  ]);
  const first = points[0]!;
  const last = points.at(-1)!;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 text-[color:var(--ds-success-solid)]"
      role="img"
      aria-label={`Nachweislich 1:1 von ${pctText(ratioPct(first))} am ${first.day} auf ${pctText(ratioPct(last))} am ${last.day}`}
    >
      <polyline
        points={xy.map(([x, y]) => `${x!.toFixed(1)},${y!.toFixed(1)}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={wide ? 2 : 1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ratioPct(p: DailyPoint): number {
  return p.total > 0 ? Math.floor((p.confirmed / p.total) * 1000) / 10 : 0;
}

function etaText(days: number): string {
  if (days <= 1) return "morgen";
  if (days < 60) return `in ≈ ${fmt(days)} Tagen`;
  if (days < 730) return `in ≈ ${fmt(Math.round(days / 30))} Monaten`;
  return "nicht absehbar (über zwei Jahre beim jetzigen Tempo)";
}

/** Eine Zeile: seit gestern, Tempo, Restdauer — oder dass es stockt. */
function TrendText({ points }: { points: DailyPoint[] }) {
  const t = trendOf(points);
  const delta =
    t.confirmedDelta !== null && t.confirmedDelta !== 0
      ? `${t.confirmedDelta > 0 ? "+" : "−"}${fmt(Math.abs(t.confirmedDelta))} seit gestern · `
      : "";
  switch (t.state) {
    case "done":
      return (
        <span className="text-xs text-[color:var(--ds-success-text)]">✓ nichts mehr offen</span>
      );
    case "moving":
      return (
        <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
          {delta}−{fmt(Math.round(t.perDay ?? 0))} offen/Tag · fertig {etaText(t.etaDays ?? 0)}
        </span>
      );
    case "stalled":
      return (
        <span className="text-xs font-medium text-[color:var(--ds-warning-text)]">
          {delta}stockt — seit mindestens 3 Tagen keine Bewegung
        </span>
      );
    case "growing":
      return (
        <span className="text-xs font-medium text-[color:var(--ds-danger-text)] tabular-nums">
          {delta}offen wächst (+{fmt(Math.round(-(t.perDay ?? 0)))}/Tag)
        </span>
      );
    default:
      return (
        <span className="text-xs text-[color:var(--ds-text-subtle)]">
          {delta}Tempo ab dem zweiten Messtag
        </span>
      );
  }
}

/** Gerichte: ob die Nummernliste schon als Soll taugt. */
function CourtIndexNote({ idx }: { idx: NonNullable<CorpusSyncRow["courtIndex"]> }) {
  return idx.complete ? (
    <span className="block text-xs text-[color:var(--ds-success-text)]">
      Nummernliste vollständig{idx.crawledAt ? ` (${formatDateTime(idx.crawledAt)})` : ""}
    </span>
  ) : (
    <span
      className="block text-xs text-[color:var(--ds-warning-text)] tabular-nums"
      title="Erst wenn jede Abfrage mit der RIS-Trefferzahl übereinstimmt, wird die Liste zum Soll"
    >
      Nummernliste im Aufbau: {fmt(idx.listed)}
      {idx.risTotal !== null ? ` von ${fmt(idx.risTotal)}` : ""} gelistet
    </span>
  );
}

function AreaSection({
  group,
  matches,
  progress,
  onInspect,
  onRefresh,
}: {
  group: AreaGroup;
  matches: (r: CorpusSyncRow) => boolean;
  progress: Record<string, DailyPoint[]>;
  onInspect?: (sourceId: string) => void;
  onRefresh?: () => void;
}) {
  const visible = group.rows.filter(matches);
  const series = sumSeries(group.rows.map((r) => progress[r.corpus] ?? []));
  if (visible.length === 0) return null;
  const total = proofTotal(group.counts);
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--ds-border)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{group.area.title}</h3>
            <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{group.area.hint}</p>
          </div>
          {/* Ein Bereich mit nur einer Quelle: die Zeile darunter sagt dasselbe. */}
          {group.rows.length > 1 && (
            <div className="w-full sm:w-80">
              <ProofBar counts={group.counts} />
              <p className="mt-1 text-right text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                {fmt(group.counts.confirmed)} von {fmt(total)} {group.area.unit} nachweislich 1:1 (
                {pctText(confirmedPct(group.counts))})
              </p>
              <p className="mt-0.5 text-right">
                <TrendText points={series} />
              </p>
            </div>
          )}
        </div>
        <ul>
          {visible.map((r) => (
            <SourceRow
              key={r.corpus}
              row={r}
              unit={group.area.unit}
              points={progress[r.corpus] ?? []}
              onInspect={onInspect}
              onRefresh={onRefresh}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SourceRow({
  row,
  unit,
  points,
  onInspect,
  onRefresh,
}: {
  row: CorpusSyncRow;
  unit: string;
  points: DailyPoint[];
  onInspect?: (sourceId: string) => void;
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const proof = row.proof;
  const check = sumCheck(row);
  const panelId = `nachweis-${row.corpus}`;

  return (
    <li className="border-b border-[color:var(--ds-border)] last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition-colors duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-surface-2)] focus-visible:bg-[color:var(--ds-surface-2)] focus-visible:outline-none motion-reduce:transition-none md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)_1.25rem] md:items-center md:gap-4"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{row.label}</span>
          <span className="block text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
            {row.risSoll === null
              ? "kein RIS-Soll bekannt"
              : row.risSollKind === "hits"
                ? `RIS ≈ ${fmt(row.risSoll)} ${unit} (Trefferzahl)`
                : `RIS-Soll ${fmt(row.risSoll)} ${unit}`}
          </span>
          {row.courtIndex && <CourtIndexNote idx={row.courtIndex} />}
        </span>
        {proof ? (
          <span className="min-w-0">
            <ProofBar counts={proof.counts} />
            <span className="mt-1 flex items-center justify-between gap-2 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
              <span>{pctText(confirmedPct(proof.counts))} nachweislich 1:1</span>
              <Sparkline points={points} />
            </span>
            <span className="mt-0.5 block">
              <TrendText points={points} />
            </span>
          </span>
        ) : (
          <span className="text-xs text-[color:var(--ds-warning-text)]">
            Nachweis noch nicht gemessen
          </span>
        )}
        <span className="min-w-0">
          {proof ? (
            <ProblemChips counts={proof.counts} />
          ) : (
            <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
              Server {fmt(row.diskDocs)} · Datenbank {fmt(row.dbDocs)}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "hidden h-4 w-4 text-[color:var(--ds-text-subtle)] transition-transform duration-[var(--ds-duration-fast)] motion-reduce:transition-none md:block",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {check && !check.ok && (
        <p
          className="mx-4 mb-3 rounded-md border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]"
          role="alert"
        >
          Summenprobe verfehlt: Töpfe ergeben {fmt(check.sum)}, das RIS-Soll ist {fmt(check.soll)}.
          Die Messung ist in sich nicht stimmig — Zahlen dieser Zeile nicht verwenden.
        </p>
      )}
      {open && (
        <div id={panelId} className="space-y-4 px-4 pb-4">
          <SourceDetail row={row} onInspect={onInspect} onRefresh={onRefresh} />
        </div>
      )}
    </li>
  );
}

function SourceDetail({
  row,
  onInspect,
  onRefresh,
}: {
  row: CorpusSyncRow;
  onInspect?: (sourceId: string) => void;
  onRefresh?: () => void;
}) {
  const { addToast } = useToast();
  const pathname = usePathname() ?? "/ops/corpus";
  const proof = row.proof;
  const check = sumCheck(row);
  const lawParam = LAW_LIST_PARAM[row.corpus];

  const fetchMissing = useMutation({
    mutationFn: async (source_key: string) => {
      const res = await csrfFetch("/api/admin/corpus-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch_missing", source_key }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Abruf konnte nicht gestartet werden");
      }
      return res.json();
    },
    onSuccess: () => {
      addToast({ title: `Abruf für ${row.label} angestoßen`, type: "success" });
      onRefresh?.();
    },
    onError: (err: Error) =>
      addToast({ title: "Abruf-Fehler", description: err.message, type: "error" }),
  });

  return (
    <>
      {proof && (
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[560px] text-xs">
            <caption className="sr-only">Töpfe für {row.label}</caption>
            <thead>
              <tr className="border-b border-[color:var(--ds-border)] text-left text-[color:var(--ds-text-muted)]">
                <th className="py-1.5 pr-3 font-medium">Topf</th>
                <th className="py-1.5 pr-3 text-right font-medium">Dokumente</th>
                <th className="py-1.5 pr-3 font-medium">Bedeutung</th>
                <th className="py-1.5 font-medium">Was tun</th>
              </tr>
            </thead>
            <tbody>
              {PROOF_BUCKETS.map((b) => (
                <tr
                  key={b}
                  className={cn(
                    "border-b border-[color:var(--ds-border)]/60 align-top",
                    proof.counts[b] === 0 && "text-[color:var(--ds-text-subtle)]"
                  )}
                >
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn("h-2.5 w-2.5 rounded-sm", BUCKET[b].bar)} aria-hidden />
                      {BUCKET[b].label}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "py-1.5 pr-3 text-right font-medium tabular-nums",
                      proof.counts[b] > 0 && b !== "confirmed" && BUCKET[b].text
                    )}
                  >
                    {b === "fetchOpen" && !proof.sollExact && proof.counts[b] > 0 ? "≈ " : ""}
                    {fmt(proof.counts[b])}
                  </td>
                  <td className="py-1.5 pr-3">{BUCKET[b].means}</td>
                  <td className="py-1.5">{proof.counts[b] > 0 ? BUCKET[b].todo : "—"}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-1.5 pr-3">Summe</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {fmt(proofTotal(proof.counts))}
                </td>
                <td className="py-1.5 pr-3" colSpan={2}>
                  {check ? (
                    check.ok ? (
                      <span className="text-[color:var(--ds-success-text)]">
                        ✓ = RIS-Soll {fmt(check.soll)} — jedes gelistete Dokument genau einmal
                        gezählt
                      </span>
                    ) : (
                      <span className="text-[color:var(--ds-danger-text)]">
                        ≠ RIS-Soll {fmt(check.soll)}
                      </span>
                    )
                  ) : row.risSollKind === "hits" ? (
                    <span className="text-[color:var(--ds-text-muted)]">
                      Keine Summenprobe: das RIS nennt hier nur eine Trefferzahl, keine Liste.
                      „Fehlt“ ist Soll minus Server.
                    </span>
                  ) : (
                    <span className="text-[color:var(--ds-text-muted)]">
                      Keine Summenprobe: für diese Quelle gibt es kein RIS-Soll.
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-[color:var(--ds-text-subtle)]">
            Inhaltsprüfung zuletzt:{" "}
            {proof.contentCheckAt ? formatDateTime(proof.contentCheckAt) : "noch nie"}
          </p>
        </div>
      )}

      {proof?.metaFields && <MetaFieldList fields={proof.metaFields} />}

      <OutsideBuckets row={row} />

      {proof?.parts && (
        <LaenderTable parts={proof.parts} corpus={row.corpus} sollExact={proof.sollExact} />
      )}

      {proof && <Einzelfaelle unit={proof} corpus={row.corpus} sollExact={proof.sollExact} />}

      <div className="flex flex-wrap gap-2">
        {row.canUpdate && row.pipelineKey && (
          <Button
            size="sm"
            variant="outline"
            disabled={fetchMissing.isPending}
            onClick={() => fetchMissing.mutate(row.pipelineKey!)}
          >
            <RefreshCw
              className={cn("mr-1.5 h-3.5 w-3.5", fetchMissing.isPending && "animate-spin")}
              aria-hidden
            />
            {fmt(row.missingOpen)} fehlende beim RIS nachholen
          </Button>
        )}
        {lawParam && (
          <Button size="sm" variant="outline" asChild>
            <Link
              href={`${pathname}?quelle=${lawParam}#gesetze-heading`}
              scroll={false}
              onClick={() =>
                setTimeout(
                  () =>
                    document
                      .getElementById("gesetze-heading")
                      ?.scrollIntoView({ block: "start", behavior: "instant" }),
                  50
                )
              }
            >
              <ScrollText className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Gesetz für Gesetz prüfen
            </Link>
          </Button>
        )}
        {onInspect && (
          <Button size="sm" variant="outline" onClick={() => onInspect(row.sourceId)}>
            <FileSearch className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Im Inspektor öffnen
          </Button>
        )}
      </div>
    </>
  );
}

/** Je Metadatenfeld: wie viele Dokumente es nicht oder anders als das RIS tragen. */
function MetaFieldList({ fields }: { fields: Record<string, number> }) {
  const rows = Object.entries(META_FIELD_LABELS).map(
    ([k, label]) => [label, fields[k] ?? 0] as const
  );
  const bad = rows.filter(([, n]) => n > 0);
  return (
    <div className="rounded-lg border border-[color:var(--ds-border)] p-3">
      <p className="text-xs font-medium">Metadaten gegen das RIS-Verzeichnis</p>
      {bad.length === 0 ? (
        <p className="mt-1 text-xs text-[color:var(--ds-success-text)]">
          ✓ Alle geprüften Felder stimmen mit dem RIS überein.
        </p>
      ) : (
        <ul className="mt-1 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
          {rows.map(([label, n]) => (
            <li key={label} className="flex justify-between gap-3">
              <span>{label}</span>
              <span
                className={cn(
                  "tabular-nums",
                  n > 0
                    ? "font-medium text-[color:var(--ds-danger-text)]"
                    : "text-[color:var(--ds-success-text)]"
                )}
              >
                {n > 0 ? `${fmt(n)} fehlen/weichen ab` : "✓"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-[color:var(--ds-text-subtle)]">
        Gezählt über alle Dokumente in der Datenbank, auch wenn sie wegen eines anderen Befunds in
        einem anderen Topf stehen.
      </p>
    </div>
  );
}

/** Was bewusst außerhalb der Töpfe steht — getrennt ausgewiesen, nie mitgezählt. */
function OutsideBuckets({ row }: { row: CorpusSyncRow }) {
  const items: Array<{ value: number; label: string; hint: string; tone?: string }> = [
    {
      value: row.notInSoll ?? 0,
      label: "außer Kraft auf dem Server",
      hint: "Liegt noch auf dem Server, steht aber nicht mehr im geltenden RIS-Bestand (aufgehoben oder durch neue Fassung ersetzt).",
    },
    {
      value: row.dbHistorical,
      label: "ältere Fassungen in der Datenbank",
      hint: "Mit Enddatum — Rechtsgeschichte, bewusst behalten.",
    },
    {
      value: row.dbExtra,
      label: "nur in der Datenbank (Waisen)",
      hint: "In der Datenbank ohne Datei auf dem Server und ohne Enddatum — bereinigen.",
      tone: "text-[color:var(--ds-attention-text)]",
    },
    {
      value: row.normalizedWithoutRaw,
      label: "normalisierte Kopien ohne Rohdatei",
      hint: "Die Quelldatei fehlt oder ist inzwischen ein anderes Dokument — nicht belegbar, zählt nicht als „auf dem Server“. Mit quarantine-normalized-copies.ts aussortieren.",
      tone: "text-[color:var(--ds-attention-text)]",
    },
    {
      value: row.dbPagesWithoutDocId,
      label: "Seiten ohne Dokumentnummer",
      hint: "Nicht zuordenbar — keiner Prüfung zugänglich, neu normalisieren.",
      tone: "text-[color:var(--ds-attention-text)]",
    },
  ].filter((i) => i.value > 0);
  return (
    <div className="rounded-lg border border-dashed border-[color:var(--ds-border)] p-3">
      <p className="text-xs font-medium">Außerhalb der Töpfe (zählt nicht zum Soll)</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
          Nichts — kein Altbestand, keine Waisen.
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-xs text-[color:var(--ds-text-muted)]">
          {items.map((i) => (
            <li key={i.label} title={i.hint}>
              <span className={cn("font-medium tabular-nums", i.tone)}>{fmt(i.value)}</span>{" "}
              {i.label}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-[color:var(--ds-text-subtle)]">
        Semantische Suche: {pctText(row.coveragePct)} der Abschnitte eingebettet — unabhängig vom
        Nachweis.
      </p>
    </div>
  );
}

function LaenderTable({
  parts,
  corpus,
  sollExact,
}: {
  parts: Record<string, ProofUnit>;
  corpus: string;
  sollExact: boolean;
}) {
  const codes = [
    ...LAENDER.map((l) => l.code).filter((c) => parts[c]),
    ...Object.keys(parts).filter((c) => !LAENDER.some((l) => l.code === c)),
  ];
  const [openLand, setOpenLand] = useState<string | null>(null);
  return (
    <div>
      <p className="text-xs font-medium">Je Bundesland</p>
      <ul className="mt-1.5 divide-y divide-[color:var(--ds-border)] rounded-lg border border-[color:var(--ds-border)]">
        {codes.map((code) => {
          const u = parts[code]!;
          const isOpen = openLand === code;
          return (
            <li key={code}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenLand(isOpen ? null : code)}
                className="grid w-full grid-cols-1 gap-1.5 px-3 py-2 text-left hover:bg-[color:var(--ds-surface-2)] focus-visible:bg-[color:var(--ds-surface-2)] focus-visible:outline-none sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center sm:gap-3"
              >
                <span className="text-xs font-medium">
                  {landName(code)}
                  {isFullyConfirmed(u.counts) && (
                    <CheckCircle2
                      className="ml-1 inline h-3.5 w-3.5 text-[color:var(--ds-success-text)]"
                      aria-label="vollständig nachweislich 1:1"
                    />
                  )}
                </span>
                <span>
                  <ProofBar counts={u.counts} />
                  <span className="mt-0.5 block text-[11px] text-[color:var(--ds-text-muted)] tabular-nums">
                    {fmt(u.counts.confirmed)} von {fmt(proofTotal(u.counts))} ·{" "}
                    {pctText(confirmedPct(u.counts))}
                  </span>
                </span>
                <ProblemChips counts={u.counts} />
              </button>
              {isOpen && (
                <div className="px-3 pb-3">
                  <Einzelfaelle unit={u} corpus={corpus} sollExact={sollExact} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Die offenen Dokumente je Topf, einzeln — mit Nummer und Link zum RIS. */
function Einzelfaelle({
  unit,
  corpus,
  sollExact,
}: {
  unit: ProofUnit;
  corpus: string;
  /** Soll als Liste von Nummern — sonst sind fehlende Nummern unbekannt. */
  sollExact: boolean;
}) {
  const buckets = PROOF_BUCKETS.filter((b) => b !== "confirmed" && unit.counts[b] > 0);
  if (buckets.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">Einzeln prüfen</p>
      {buckets.map((b) => {
        const list = unit.samples[b] ?? [];
        const rest = unit.counts[b] - list.length;
        return (
          <details
            key={b}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
          >
            <summary className="cursor-pointer text-xs">
              <span className={cn("font-medium", BUCKET[b].text)}>
                {fmt(unit.counts[b])} {BUCKET[b].label.toLowerCase()}
              </span>
              <span className="text-[color:var(--ds-text-muted)]"> — {BUCKET[b].todo}</span>
            </summary>
            {list.length === 0 ? (
              <p className="mt-2 text-xs text-[color:var(--ds-text-muted)]">
                {b === "fetchOpen" && !sollExact
                  ? "Für diese Quelle gibt es keine Liste der Nummern — das RIS nennt nur eine Trefferzahl."
                  : "Die Messung hat für diesen Topf keine Nummern abgelegt."}
              </p>
            ) : (
              <>
                <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                  {list.map((s) => {
                    const url = risDocumentUrl(corpus, s.id);
                    return (
                      <li key={s.id} className="flex min-w-0 items-baseline gap-2">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[color:var(--brand-primary)] hover:underline"
                          >
                            {s.id}
                            <ExternalLink className="h-3 w-3" aria-hidden />
                            <span className="sr-only">(im RIS öffnen)</span>
                          </a>
                        ) : (
                          <span className="shrink-0 font-mono">{s.id}</span>
                        )}
                        {s.label && (
                          <span className="truncate text-[color:var(--ds-text-muted)]">
                            {s.label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {rest > 0 && (
                  <p className="mt-1.5 text-xs text-[color:var(--ds-text-subtle)]">
                    … und {fmt(rest)} weitere. Die Messung legt je Topf die ersten {list.length}{" "}
                    Nummern ab; vollständig über „Gesetz für Gesetz prüfen“ oder das Messskript.
                  </p>
                )}
              </>
            )}
          </details>
        );
      })}
    </div>
  );
}
