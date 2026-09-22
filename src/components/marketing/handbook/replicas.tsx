"use client";

/**
 * Product replicas for the Handbuch. Rule: a replica renders the product's own
 * components with example data, or — where a view is page-bound — the same
 * markup and tokens. Calculations (deadlines, RATG) run through the product's
 * real functions, so the numbers shown are the numbers the product computes.
 *
 * Example matter throughout: erfundene Beispieldaten, keine echten Personen.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Calculator,
  CalendarClock,
  Check,
  FileSpreadsheet,
  Mail,
  MessageSquareText,
  Smartphone,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import {
  ActiveMatters,
  AttentionList,
  ATTENTION_ICONS,
  DeadlineAgenda,
  OverviewKpis,
  OverviewSection,
} from "@/components/dashboard/overview/overview-sections";
import { buildAgenda, type AgendaEntry } from "@/lib/overview-agenda";
import { berechneFristAuto, resolveFristArt, zustellungERV } from "@/lib/legal/frist-engine";
import { calculateRatgService } from "@/lib/legal/ratg";
import { cn, formatDate, formatEur } from "@/lib/utils";
import { ReplicaFrame } from "./replica-frame";

/* ── Beispieldaten ─────────────────────────────────────────────────── */

/** Replicas are rendered relative to "today" so the agenda always looks current. */
function isoIn(days: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const CASES = [
  {
    slug: "c/2026-014",
    title: "Hofer ./. Alpenbau GmbH",
    updated_at: new Date().toISOString(),
    frontmatter: {
      case_number: "2026/014",
      client_name: "Maria Hofer",
      legal_area: "Bauvertragsrecht",
      status: "open",
    },
  },
  {
    slug: "c/2026-011",
    title: "Verlassenschaft Brunner",
    updated_at: new Date(Date.now() - 86_400_000).toISOString(),
    frontmatter: {
      case_number: "2026/011",
      client_name: "Thomas Brunner",
      legal_area: "Erbrecht",
      status: "open",
    },
  },
  {
    slug: "c/2026-009",
    title: "Wimmer ./. Stadt Graz",
    updated_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    frontmatter: {
      case_number: "2026/009",
      client_name: "Lukas Wimmer",
      legal_area: "Verwaltungsrecht",
      status: "open",
    },
  },
  {
    slug: "c/2026-006",
    title: "Kern Handels GmbH ./. Nordlicht KG",
    updated_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    frontmatter: {
      case_number: "2026/006",
      client_name: "Kern Handels GmbH",
      legal_area: "Unternehmensrecht",
      status: "open",
    },
  },
];

function exampleDeadlines() {
  return [
    {
      slug: "d1",
      title: "Klagebeantwortung § 230 ZPO",
      frontmatter: {
        due_date: isoIn(1),
        case_slug: "c/2026-014",
        review_status: "approved",
      },
    },
    {
      slug: "d2",
      title: "Vorbereitende Tagsatzung, BG Innere Stadt, 09:30 Uhr",
      frontmatter: { due_date: isoIn(3), case_slug: "c/2026-006", event_type: "hearing" },
    },
    {
      slug: "d3",
      title: "Berufung § 464 ZPO",
      frontmatter: {
        due_date: isoIn(12),
        vorfrist_date: isoIn(5),
        is_notfrist: true,
        case_slug: "c/2026-006",
        review_status: "approved",
      },
    },
    {
      slug: "d4",
      title: "Beschwerde an das Verwaltungsgericht",
      frontmatter: {
        due_date: isoIn(9),
        case_slug: "c/2026-009",
        review_status: "unreviewed",
      },
    },
    {
      slug: "d5",
      title: "Stellungnahme zum Inventar",
      frontmatter: { due_date: isoIn(-1), case_slug: "c/2026-011" },
    },
  ];
}

/* ── Übersicht ─────────────────────────────────────────────────────── */

export function OverviewReplica() {
  const agenda = useMemo(() => buildAgenda(exampleDeadlines(), CASES), []);
  const next = useMemo(() => {
    const map = new Map<string, AgendaEntry>();
    for (const e of [...agenda.overdue, ...agenda.upcoming]) {
      if (e.kind !== "vorfrist" && e.caseSlug && !map.has(e.caseSlug)) map.set(e.caseSlug, e);
    }
    return map;
  }, [agenda]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-[color:var(--ds-text-subtle)]">
          {new Date().toLocaleDateString("de-AT", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        <p className="font-display mt-1 text-xl font-semibold">{greeting}, Dr. Hofbauer</p>
      </div>
      <OverviewKpis
        items={[
          {
            label: "Fällig in 7 Tagen",
            value: 2,
            hint: "Fristen und Termine",
            href: "#",
            tone: "warning",
          },
          { label: "Überfällig", value: 1, hint: "Sofort prüfen", href: "#", tone: "danger" },
          {
            label: "Ungeprüfte Fristen",
            value: 1,
            hint: "Vier-Augen-Prüfung ausstehend",
            href: "#",
            tone: "warning",
          },
          { label: "Offene Akten", value: 4, hint: "27 Akten gesamt", href: "#" },
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <OverviewSection
            title="Fristen & Termine"
            description="Überfälliges und die nächsten 14 Tage, nach Tagen geordnet"
            href="#"
            hrefLabel="Fristenbuch"
          >
            <DeadlineAgenda agenda={agenda} windowDays={14} />
          </OverviewSection>
          <OverviewSection
            title="Aktive Akten"
            description="Zuletzt bearbeitet, mit nächster Frist"
            href="#"
            hrefLabel="Alle Akten"
          >
            <ActiveMatters matters={CASES} nextDeadlineBySlug={next} />
          </OverviewSection>
        </div>
        <div className="lg:col-span-4">
          <OverviewSection title="Zu erledigen">
            <AttentionList
              items={[
                {
                  key: "inbox",
                  label: "Eingänge zuordnen",
                  hint: "Neue Anfragen und Zustellungen",
                  count: 3,
                  href: "#",
                  icon: ATTENTION_ICONS.inbox,
                  tone: "warning",
                },
                {
                  key: "reviews",
                  label: "Freigaben",
                  hint: "Entwürfe, die auf Ihre Freigabe warten",
                  count: 2,
                  href: "#",
                  icon: ATTENTION_ICONS.review,
                  tone: "warning",
                },
                {
                  key: "sig",
                  label: "Unterschriften ausstehend",
                  hint: "Versendete Signaturanfragen",
                  count: 1,
                  href: "#",
                  icon: ATTENTION_ICONS.signature,
                  tone: "neutral",
                },
                {
                  key: "inv",
                  label: "Offene Rechnungen",
                  hint: "Entwürfe und unbezahlte Rechnungen",
                  count: 4,
                  href: "#",
                  icon: ATTENTION_ICONS.invoice,
                  tone: "neutral",
                },
              ]}
            />
          </OverviewSection>
        </div>
      </div>
    </div>
  );
}

export function OverviewReplicaFrame({ caption }: { caption?: string }) {
  return (
    <ReplicaFrame path={["Übersicht"]} caption={caption}>
      <OverviewReplica />
    </ReplicaFrame>
  );
}

/* ── Fristenrechner (interaktiv, echte Berechnung) ─────────────────── */

const CALC_KINDS = [
  "klagebeantwortung",
  "einspruch_zahlungsbefehl",
  "berufung",
  "berufungsbeantwortung",
  "rekurs",
  "revision",
  "revisionsrekurs",
  "widerspruch_versaeumungsurteil",
  "beschwerde_vwgvg",
  "revision_vwgh",
  "beschwerde_vfgh",
] as const;

const ZUSTELL_ARTEN = [
  { key: "standard", label: "Zustellung (Zustellnachweis)" },
  { key: "erv", label: "ERV — elektronisch eingelangt" },
] as const;

export function DeadlineCalculatorReplica({ caption }: { caption?: string }) {
  const [kind, setKind] = useState<(typeof CALC_KINDS)[number]>("berufung");
  const [zustellung, setZustellung] = useState(() => isoIn(0));
  const [art, setArt] = useState<"standard" | "erv">("standard");
  const [ferialsache, setFerialsache] = useState(false);

  const result = useMemo(() => {
    try {
      // ERV: the engine's own § 89a GOG fiction moves the start to the next working day.
      const base = art === "erv" ? ervAusloeser(zustellung) : zustellung;
      return { ok: true as const, r: berechneFristAuto(kind, base, { ferialsache }), base };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [kind, zustellung, art, ferialsache]);

  const fristArt = resolveFristArt(kind);

  const selectCls =
    "h-9 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:var(--ds-ring)] focus:outline-none";

  return (
    <ReplicaFrame path={["Fristen", "Frist berechnen"]} caption={caption} interactive>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Calculator size={15} aria-hidden className="text-[color:var(--ds-text-muted)]" />
            Frist berechnen
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">Fristart</span>
            <select
              className={selectCls}
              value={kind}
              onChange={(e) => setKind(e.target.value as (typeof CALC_KINDS)[number])}
            >
              {CALC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {resolveFristArt(k)?.bezeichnung ?? k}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                Zugestellt am
              </span>
              <input
                type="date"
                className={selectCls}
                value={zustellung}
                onChange={(e) => e.target.value && setZustellung(e.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                Zustellart
              </span>
              <select
                className={selectCls}
                value={art}
                onChange={(e) => setArt(e.target.value as "standard" | "erv")}
              >
                {ZUSTELL_ARTEN.map((z) => (
                  <option key={z.key} value={z.key}>
                    {z.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)]">
            <input
              type="checkbox"
              checked={ferialsache}
              onChange={(e) => setFerialsache(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--brand-primary)]"
            />
            Ferialsache (§ 222 Abs 2 ZPO)
          </label>
          {fristArt && (
            <p className="text-xs text-[color:var(--ds-text-subtle)]">
              Rechtsgrundlage: {fristArt.rechtsgrundlage}
              {fristArt.notfrist ? " · Notfrist" : ""}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 shadow-[var(--ds-shadow-1)]">
          {result.ok ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[color:var(--ds-text-muted)]">Fristende</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                    {formatDate(result.r.fristende)}
                  </p>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {new Date(`${result.r.fristende}T12:00:00`).toLocaleDateString("de-AT", {
                      weekday: "long",
                    })}{" "}
                    · {result.r.kalendertage} Kalendertage
                  </p>
                </div>
                {result.r.art.notfrist && <Badge variant="danger">Notfrist</Badge>}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[color:var(--ds-border)] pt-3 text-sm">
                <div>
                  <dt className="text-xs text-[color:var(--ds-text-muted)]">Fristbeginn</dt>
                  <dd className="tabular-nums">{formatDate(result.r.fristbeginn)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[color:var(--ds-text-muted)]">Vorfrist</dt>
                  <dd className="tabular-nums">{formatDate(result.r.vorfrist)}</dd>
                </div>
              </dl>
              {(result.r.hinweise.length > 0 || art === "erv") && (
                <ul className="mt-3 space-y-1.5 border-t border-[color:var(--ds-border)] pt-3">
                  {art === "erv" && (
                    <li className="flex gap-2 text-xs text-[color:var(--ds-text-muted)]">
                      <Check size={13} aria-hidden className="mt-0.5 shrink-0" />
                      ERV-Zustellung gilt am folgenden Werktag als bewirkt (§ 89a GOG):{" "}
                      {formatDate(result.base)}
                    </li>
                  )}
                  {result.r.hinweise.map((h) => (
                    <li key={h} className="flex gap-2 text-xs text-[color:var(--ds-text-muted)]">
                      <Check size={13} aria-hidden className="mt-0.5 shrink-0" />
                      {humanizeHinweis(h)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              Für diese Eingabe ist keine Berechnung möglich.
            </p>
          )}
        </div>
      </div>
    </ReplicaFrame>
  );
}

/** ISO dates in engine notes → TT.MM.JJJJ. */
function humanizeHinweis(h: string): string {
  return h.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_m, y, mo, d) => `${d}.${mo}.${y}`);
}

/** § 89a GOG as the engine applies it: electronic arrival → next working day. */
function ervAusloeser(iso: string): string {
  try {
    return zustellungERV(iso);
  } catch {
    return iso;
  }
}

/* ── Erinnerungen ──────────────────────────────────────────────────── */

export function RemindersReplica({ caption }: { caption?: string }) {
  const due = isoIn(12);
  const stages = [
    { label: "Vorfrist", when: isoIn(5), icon: CalendarClock, done: false, current: false },
    { label: "7 Tage vorher", when: isoIn(5), icon: Bell, done: false, current: false },
    { label: "3 Tage vorher", when: isoIn(9), icon: Bell, done: false, current: false },
    { label: "1 Tag vorher", when: isoIn(11), icon: BellRing, done: false, current: false },
    { label: "Fälligkeitstag", when: due, icon: AlertTriangle, done: false, current: false },
  ];
  return (
    <ReplicaFrame path={["Fristen", "Berufung § 464 ZPO"]} caption={caption}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 shadow-[var(--ds-shadow-1)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Berufung § 464 ZPO</p>
              <p className="mt-0.5 text-xs text-[color:var(--ds-text-subtle)]">
                <span className="tabular-nums">2026/006</span> · Kern Handels GmbH ./. Nordlicht KG
              </p>
            </div>
            <div className="flex gap-1">
              <Badge variant="danger">Notfrist</Badge>
              <Badge variant="success">Freigegeben</Badge>
            </div>
          </div>
          <ol className="mt-4 space-y-0">
            {stages.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.label} className="relative flex gap-3 pb-3 last:pb-0">
                  {i < stages.length - 1 && (
                    <span
                      className="absolute top-6 bottom-0 left-[11px] w-px bg-[color:var(--ds-border)]"
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                      i === stages.length - 1
                        ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                        : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]"
                    )}
                  >
                    <Icon size={12} aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2 pt-0.5">
                    <span className="text-sm">{s.label}</span>
                    <span className="text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                      {formatDate(s.when)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            So kommt die Erinnerung an
          </p>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3.5 shadow-[var(--ds-shadow-1)]">
            <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
              <Mail size={13} aria-hidden /> E-Mail · fristen@kanzlei.at
            </div>
            <p className="mt-1.5 text-sm font-semibold">
              Frist in 3 Tagen: Berufung § 464 ZPO (Notfrist)
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              Akte 2026/006 · Fristende {formatDate(due)}. Die Vorfrist ist erreicht.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3.5 shadow-[var(--ds-shadow-1)]">
            <Smartphone
              size={15}
              aria-hidden
              className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
            />
            <div>
              <p className="text-sm font-medium">Subsumio · Frist morgen</p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Beschwerde an das Verwaltungsgericht — 2026/009
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3.5 shadow-[var(--ds-shadow-1)]">
            <Bell
              size={15}
              aria-hidden
              className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
            />
            <div>
              <p className="text-sm font-medium">In der App</p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Glocke in der Kopfzeile und Übersicht „Fristen & Termine“
              </p>
            </div>
          </div>
        </div>
      </div>
    </ReplicaFrame>
  );
}

/* ── Assistent ─────────────────────────────────────────────────────── */

const ASSISTANT_CITATIONS: CitationPanelData = {
  citations: [
    { slug: "akte/2026-014/urteil", title: "Urteil BG Innere Stadt, S. 1 (Zustellvermerk)" },
    { slug: "law/at/zpo/464", title: "§ 464 ZPO" },
  ],
  gaps: [],
  grounding: {
    citations_verified: 2,
    citations_unverified: 0,
    corpus_checked: true,
    has_unverified: false,
    analyzed_at: new Date().toISOString(),
    grounded_citations: [
      {
        code: "ZPO",
        paragraph: "§ 464 Abs 1",
        verified: true,
        category: "statute",
        jurisdiction: "at",
        context: "Berufungsfrist: vier Wochen ab Zustellung des Urteils",
      },
      {
        code: "ZPO",
        paragraph: "§ 222 Abs 1",
        verified: true,
        category: "statute",
        jurisdiction: "at",
        context: "Verhandlungsfreie Zeit hemmt den Lauf der Berufungsfrist",
      },
    ],
  },
  attorneyReviewRequired: true,
  jurisdiction: "AT",
};

export function AssistantReplica({ caption }: { caption?: string }) {
  return (
    <ReplicaFrame path={["Assistent", "Akte 2026/014"]} caption={caption}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[color:var(--brand-solid)] px-4 py-2.5 text-sm text-white">
          Bis wann müssen wir gegen das Urteil berufen?
        </div>
        <div className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <MessageSquareText
              size={14}
              aria-hidden
              className="text-[color:var(--brand-primary)]"
            />
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-2xl rounded-tl-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm leading-relaxed">
              <p>
                Die Berufungsfrist beträgt <strong>vier Wochen ab Zustellung</strong> des Urteils (§
                464 Abs 1 ZPO). Laut Zustellvermerk wurde das Urteil am {formatDate(isoIn(-16))}{" "}
                zugestellt; die Frist endet damit am <strong>{formatDate(isoIn(12))}</strong>.
              </p>
              <p className="mt-2">
                Fällt die verhandlungsfreie Zeit in den Fristenlauf, verlängert sich die Frist nach
                § 222 Abs 1 ZPO — das ist hier nicht der Fall.
              </p>
            </div>
            <CitationPanel data={ASSISTANT_CITATIONS} />
          </div>
        </div>
      </div>
    </ReplicaFrame>
  );
}

/* ── Honorarnote nach RATG ─────────────────────────────────────────── */

export function InvoiceReplica({ caption }: { caption?: string }) {
  const lines = useMemo(() => {
    const klage = calculateRatgService({
      item: "TP3A",
      kind: "schriftsatz",
      bemessungsgrundlage: 12_000,
      einheitssatzFactor: 1,
      erv: "einleitend",
      label: "Klage",
    });
    const tagsatzung = calculateRatgService({
      item: "TP3A",
      kind: "verhandlung",
      bemessungsgrundlage: 12_000,
      hours: 2,
      einheitssatzFactor: 1,
      label: "Vorbereitende Tagsatzung",
    });
    return [
      { title: "Klage vom 03.08.2026", r: klage },
      { title: "Vorbereitende Tagsatzung, 2 Stunden", r: tagsatzung },
    ];
  }, []);
  const net = lines.reduce((s, l) => s + l.r.net, 0);
  const vat = Math.round(net * 0.2 * 100) / 100;

  return (
    <ReplicaFrame path={["Rechnungen", "R-2026-0042"]} caption={caption}>
      <div className="mx-auto max-w-2xl rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--ds-border)] px-5 py-4">
          <div>
            <p className="text-xs text-[color:var(--ds-text-muted)]">Honorarnote</p>
            <p className="text-lg font-semibold tabular-nums">R-2026-0042</p>
            <p className="text-xs text-[color:var(--ds-text-subtle)]">
              Akte 2026/014 · Hofer ./. Alpenbau GmbH · Bemessungsgrundlage {formatEur(12_000)}
            </p>
          </div>
          <Badge variant="default">Entwurf</Badge>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[color:var(--ds-text-muted)]">
              <th className="px-5 pt-3 pb-1.5 font-medium">Leistung</th>
              <th className="px-5 pt-3 pb-1.5 text-right font-medium">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <FragmentRows key={l.title} title={l.title} r={l.r} />
            ))}
          </tbody>
          <tfoot className="border-t border-[color:var(--ds-border)]">
            <tr>
              <td className="px-5 pt-3 text-[color:var(--ds-text-muted)]">Summe netto</td>
              <td className="px-5 pt-3 text-right tabular-nums">{formatEur(net)}</td>
            </tr>
            <tr>
              <td className="px-5 pt-1 text-[color:var(--ds-text-muted)]">20 % USt</td>
              <td className="px-5 pt-1 text-right tabular-nums">{formatEur(vat)}</td>
            </tr>
            <tr>
              <td className="px-5 pt-2 pb-4 font-semibold">Gesamt</td>
              <td className="px-5 pt-2 pb-4 text-right font-semibold tabular-nums">
                {formatEur(net + vat)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReplicaFrame>
  );
}

function FragmentRows({ title, r }: { title: string; r: ReturnType<typeof calculateRatgService> }) {
  return (
    <>
      <tr className="border-t border-[color:var(--ds-border)]">
        <td className="px-5 pt-3 pb-1 font-medium" colSpan={2}>
          {title}
        </td>
      </tr>
      {r.lines.map((line) => (
        <tr key={line.key + line.label}>
          <td className="px-5 py-0.5 pl-8 text-xs text-[color:var(--ds-text-muted)]">
            {line.label}
          </td>
          <td className="px-5 py-0.5 text-right text-xs tabular-nums">{formatEur(line.amount)}</td>
        </tr>
      ))}
    </>
  );
}

/* ── Treuhand ──────────────────────────────────────────────────────── */

export function TrustReplica({ caption }: { caption?: string }) {
  const rows = [
    {
      nr: 17,
      date: isoIn(-21),
      text: "Eingang Kaufpreisanteil",
      amount: 48_500,
      balance: 48_500,
      kind: "in",
    },
    {
      nr: 18,
      date: isoIn(-14),
      text: "Auszahlung an Verkäufer",
      amount: -45_000,
      balance: 3_500,
      kind: "out",
    },
    {
      nr: 19,
      date: isoIn(-13),
      text: "Gegenbuchung zu Nr. 18 (Betrag korrigiert)",
      amount: 45_000,
      balance: 48_500,
      kind: "reversal",
    },
    {
      nr: 20,
      date: isoIn(-13),
      text: "Auszahlung an Verkäufer",
      amount: -44_000,
      balance: 4_500,
      kind: "out",
    },
  ];
  return (
    <ReplicaFrame path={["Treuhandkonto", "Akte 2026/011"]} caption={caption}>
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--ds-border)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Verlassenschaft Brunner</p>
            <p className="text-xs text-[color:var(--ds-text-subtle)]">Treuhandkonto · 2026/011</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[color:var(--ds-text-muted)]">Guthaben der Akte</p>
            <p className="text-lg font-semibold tabular-nums">{formatEur(4_500)}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-warning-bg)] px-4 py-2.5 text-xs text-[color:var(--ds-warning-text)]">
          <AlertTriangle size={13} aria-hidden className="mt-0.5 shrink-0" />
          Eingang über 40.000 €: Meldepflicht nach § 10a Abs 2 RAO prüfen.
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[color:var(--ds-text-muted)]">
              <th className="px-4 py-2 font-medium">Nr.</th>
              <th className="px-4 py-2 font-medium">Datum</th>
              <th className="px-4 py-2 font-medium">Buchungstext</th>
              <th className="px-4 py-2 text-right font-medium">Betrag</th>
              <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--ds-border)]">
            {rows.map((r) => (
              <tr key={r.nr}>
                <td className="px-4 py-2 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                  {r.nr}
                </td>
                <td className="px-4 py-2 text-xs tabular-nums">{formatDate(r.date)}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    {r.text}
                    {r.kind === "reversal" && <Badge variant="info">Gegenbuchung</Badge>}
                  </span>
                </td>
                <td
                  className={cn(
                    "px-4 py-2 text-right tabular-nums",
                    r.amount < 0 && "text-[color:var(--ds-danger-text)]"
                  )}
                >
                  {formatEur(r.amount)}
                </td>
                <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">
                  {formatEur(r.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReplicaFrame>
  );
}

/* ── Import ────────────────────────────────────────────────────────── */

export function ImportReplica({ caption }: { caption?: string }) {
  const rows = [
    { row: 2, az: "2025/118", title: "Schober ./. Autohaus Linz", result: "neu" },
    { row: 3, az: "2025/121", title: "Mayr Bau GmbH ./. Gemeinde St. Florian", result: "neu" },
    { row: 4, az: "2026/006", title: "Kern Handels GmbH ./. Nordlicht KG", result: "vorhanden" },
    { row: 5, az: "", title: "Pichler ./. Pichler", result: "fehler" },
  ] as const;
  return (
    <ReplicaFrame path={["Einstellungen", "Kanzlei-Import"]} caption={caption}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <FileSpreadsheet size={15} aria-hidden className="text-[color:var(--ds-text-muted)]" />
            <span className="font-medium">akten-bestand.xlsx</span>
            <span className="text-xs text-[color:var(--ds-text-subtle)]">· Akten · 4 Zeilen</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost">
              <Undo2 size={14} aria-hidden /> Letzte Importe
            </Button>
            <Button size="sm" variant="primary">
              2 Akten importieren
            </Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--ds-text-muted)]">
                <th className="px-4 py-2 font-medium">Zeile</th>
                <th className="px-4 py-2 font-medium">Aktenzeichen</th>
                <th className="px-4 py-2 font-medium">Bezeichnung</th>
                <th className="px-4 py-2 text-right font-medium">Ergebnis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ds-border)]">
              {rows.map((r) => (
                <tr key={r.row}>
                  <td className="px-4 py-2 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                    {r.row}
                  </td>
                  <td className="px-4 py-2 text-xs tabular-nums">{r.az || "—"}</td>
                  <td className="px-4 py-2">{r.title}</td>
                  <td className="px-4 py-2 text-right">
                    {r.result === "neu" && <Badge variant="success">Wird angelegt</Badge>}
                    {r.result === "vorhanden" && (
                      <Badge variant="default">Vorhanden — übersprungen</Badge>
                    )}
                    {r.result === "fehler" && <Badge variant="danger">Aktenzeichen fehlt</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReplicaFrame>
  );
}
