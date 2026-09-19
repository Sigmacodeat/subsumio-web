"use client";

/**
 * Replicas of page-bound product views (Akte, Fristenbuch, Kalender,
 * Kollisionsprüfung). These views live inside route files and cannot be
 * imported, so they are rebuilt with the same markup, tokens and components
 * (Badge, Button) — and, where the product computes something, the same
 * functions: calendar conflicts run through `findCalendarConflicts` and are
 * worded by `describeCalendarConflict`, exactly as in the calendar.
 */

import { useMemo } from "react";
import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  FolderOpen,
  Lightbulb,
  Mail,
  MoreHorizontal,
  Plus,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  describeCalendarConflict,
  findCalendarConflicts,
  type CalendarEntry,
} from "@/lib/calendar-conflicts";
import { cn, daysUntil, formatDate, formatDaysUntil } from "@/lib/utils";
import { ReplicaFrame } from "./replica-frame";

function isoIn(days: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/* ── Akte ──────────────────────────────────────────────────────────── */

export function MatterReplica({ caption }: { caption?: string }) {
  const tabs = [
    { label: "Übersicht", icon: FileText, active: true },
    { label: "Dokumente", icon: FolderOpen },
    { label: "E-Mails", icon: Mail },
    { label: "Fristen & Aufgaben", icon: CalendarClock },
    { label: "Strategie", icon: Lightbulb },
  ];
  const next = isoIn(12);
  return (
    <ReplicaFrame path={["Akten", "2026/006"]} caption={caption}>
      <div className="-m-3 sm:-m-5">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="font-display text-lg font-semibold">
                Kern Handels GmbH ./. Nordlicht KG
              </h3>
              <span className="font-mono text-xs text-[color:var(--ds-text-subtle)]">2026/006</span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
              <span className="inline-flex items-center gap-1">
                <User size={12} aria-hidden /> Kern Handels GmbH ./. Nordlicht KG
              </span>
              <span className="inline-flex items-center gap-1">
                <Scale size={12} aria-hidden /> Unternehmensrecht · HG Wien
              </span>
            </p>
          </div>
          <Button size="sm" variant="secondary">
            <Plus size={14} aria-hidden /> Hinzufügen
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-[color:var(--ds-border)] px-4 py-2 text-xs sm:px-5">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] px-2 py-1">
            <CalendarClock size={12} aria-hidden />
            Nächste Frist <strong className="tabular-nums">{formatDate(next)}</strong>
            <span className="text-[color:var(--ds-text-muted)]">
              · {formatDaysUntil(daysUntil(next))}
            </span>
          </span>
          <span className="text-[color:var(--ds-text-muted)]">
            Offene Fristen <strong className="text-[color:var(--ds-text)]">2</strong>
          </span>
          <span className="text-[color:var(--ds-text-muted)]">
            Dokumente <strong className="text-[color:var(--ds-text)]">14</strong>
          </span>
          <span className="text-[color:var(--ds-text-muted)]">
            Stunden <strong className="text-[color:var(--ds-text)] tabular-nums">11,5</strong>
          </span>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-b border-[color:var(--ds-border)] px-3 py-2 sm:px-4">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <span
                key={t.label}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm",
                  t.active
                    ? "bg-[color:var(--ds-surface-2)] font-medium text-[color:var(--ds-text)]"
                    : "text-[color:var(--ds-text-muted)]"
                )}
              >
                <Icon size={14} aria-hidden />
                {t.label}
              </span>
            );
          })}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 px-2 text-sm text-[color:var(--ds-text-muted)]">
            <MoreHorizontal size={14} aria-hidden /> Mehr
          </span>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
            <h4 className="border-b border-[color:var(--ds-border)] px-4 py-3 text-sm font-semibold">
              Arbeitsstand der Akte
            </h4>
            <ul className="space-y-2 p-3">
              <li className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2.5">
                <AlertTriangle
                  size={15}
                  aria-hidden
                  className="mt-0.5 shrink-0 text-[color:var(--ds-danger-text)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[color:var(--ds-danger-text)]">
                    Notfrist: Berufung § 464 ZPO
                  </span>
                  <span className="block text-xs text-[color:var(--ds-danger-text)]">
                    Fristende {formatDate(next)} · Vorfrist {formatDate(isoIn(5))}
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2.5">
                <Clock
                  size={15}
                  aria-hidden
                  className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[color:var(--ds-warning-text)]">
                    1 Frist aus dem Urteil zur Prüfung
                  </span>
                  <span className="block text-xs text-[color:var(--ds-warning-text)]">
                    Erkannt im Dokument „Urteil HG Wien.pdf“, Seite 1
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-border)] px-3 py-2.5">
                <ShieldCheck
                  size={15}
                  aria-hidden
                  className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Kollisionsprüfung</span>
                  <span className="block text-xs text-[color:var(--ds-text-muted)]">
                    Kein Konflikt · geprüft bei Aktenanlage
                  </span>
                </span>
              </li>
            </ul>
          </section>
          <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
            <h4 className="border-b border-[color:var(--ds-border)] px-4 py-3 text-sm font-semibold">
              Aktenblatt
            </h4>
            <dl className="divide-y divide-[color:var(--ds-border)] text-sm">
              {[
                ["Mandant", "Kern Handels GmbH"],
                ["Gegner", "Nordlicht KG, vertreten durch RA Dr. Lang"],
                ["Gericht", "Handelsgericht Wien, 12 Cg 48/26x"],
                ["Streitwert", "€ 38.400,00"],
                ["Sachbearbeitung", "Dr. Hofbauer"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2 px-4 py-2">
                  <dt className="text-xs text-[color:var(--ds-text-muted)]">{k}</dt>
                  <dd className="text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </ReplicaFrame>
  );
}

/* ── Fristenbuch ───────────────────────────────────────────────────── */

export function DeadlineRegisterReplica({ caption }: { caption?: string }) {
  const rows = [
    {
      date: isoIn(-1),
      title: "Stellungnahme zum Inventar",
      az: "2026/011",
      matter: "Verlassenschaft Brunner",
      who: "Mag. Steiner",
      notfrist: false,
      state: "open" as const,
    },
    {
      date: isoIn(1),
      title: "Klagebeantwortung § 230 ZPO",
      az: "2026/014",
      matter: "Hofer ./. Alpenbau GmbH",
      who: "Dr. Hofbauer",
      notfrist: false,
      state: "approved" as const,
    },
    {
      date: isoIn(9),
      title: "Beschwerde an das Verwaltungsgericht",
      az: "2026/009",
      matter: "Wimmer ./. Stadt Graz",
      who: "Mag. Steiner",
      notfrist: false,
      state: "unreviewed" as const,
    },
    {
      date: isoIn(12),
      title: "Berufung § 464 ZPO",
      vorfrist: isoIn(5),
      az: "2026/006",
      matter: "Kern Handels GmbH ./. Nordlicht KG",
      who: "Dr. Hofbauer",
      notfrist: true,
      state: "second" as const,
    },
  ];
  return (
    <ReplicaFrame path={["Fristen", "Fristenbuch"]} caption={caption}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] sm:grid-cols-4">
          {[
            { l: "Überfällig", v: 1, tone: "danger" },
            { l: "Diese Woche fällig", v: 1, tone: "warning" },
            { l: "Offene Notfristen", v: 1, tone: "danger" },
            { l: "Ungeprüft", v: 1, tone: "warning" },
          ].map((k) => (
            <div key={k.l} className="bg-[color:var(--ds-surface)] px-4 py-3">
              <p className="text-xs text-[color:var(--ds-text-muted)]">{k.l}</p>
              <p
                className={cn(
                  "mt-0.5 text-xl font-semibold tabular-nums",
                  k.tone === "danger"
                    ? "text-[color:var(--ds-danger-text)]"
                    : "text-[color:var(--ds-warning-text)]"
                )}
              >
                {k.v}
              </p>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--ds-border)] text-left text-[11px] font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                <th className="px-4 py-2.5">Datum</th>
                <th className="px-4 py-2.5">Frist</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Zuständig</th>
                <th className="px-4 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ds-border)]">
              {rows.map((r) => {
                const d = daysUntil(r.date) ?? 0;
                return (
                  <tr key={r.title}>
                    <td className="px-4 py-2.5 align-top whitespace-nowrap">
                      <span className="block tabular-nums">{formatDate(r.date)}</span>
                      <span
                        className={cn(
                          "block text-[11px]",
                          d < 0
                            ? "font-medium text-[color:var(--ds-danger-text)]"
                            : d <= 3
                              ? "text-[color:var(--ds-warning-text)]"
                              : "text-[color:var(--ds-text-subtle)]"
                        )}
                      >
                        {formatDaysUntil(d)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <span className="flex flex-wrap items-center gap-1.5 font-medium">
                        {r.title}
                        {r.notfrist && <Badge variant="danger">Notfrist</Badge>}
                      </span>
                      <span className="block text-xs text-[color:var(--ds-text-subtle)]">
                        <span className="tabular-nums">{r.az}</span> · {r.matter}
                        {r.vorfrist ? ` · Vorfrist ${formatDate(r.vorfrist)}` : ""}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 align-top text-xs text-[color:var(--ds-text-muted)] md:table-cell">
                      {r.who}
                    </td>
                    <td className="px-4 py-2.5 text-right align-top">
                      {r.state === "unreviewed" && <Badge variant="warning">Ungeprüft</Badge>}
                      {r.state === "approved" && <Badge variant="success">Freigegeben</Badge>}
                      {r.state === "second" && <Badge variant="attention">Zweitprüfung</Badge>}
                      {r.state === "open" && <Badge variant="danger">Überfällig</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ReplicaFrame>
  );
}

/* ── Kalender mit Kollisionen ──────────────────────────────────────── */

type WeekItem = CalendarEntry & { color: "deadline" | "notfrist" | "hearing" | "appointment" };

export function CalendarConflictsReplica({ caption }: { caption?: string }) {
  const { days, items, conflicts } = useMemo(() => {
    const today = new Date();
    // Monday of next week, so the example week is always in the future.
    const monday = new Date(today);
    monday.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7));
    const iso = (offset: number) => isoIn(0, new Date(monday.getTime() + offset * 86_400_000));
    const list: WeekItem[] = [
      {
        id: "h1",
        title: "Verhandlung BG Innere Stadt",
        date: iso(1),
        time: "09:00",
        durationMin: 120,
        kind: "appointment",
        isHearing: true,
        color: "hearing",
      },
      {
        id: "a1",
        title: "Mandantengespräch Hofer",
        date: iso(1),
        time: "10:30",
        durationMin: 60,
        kind: "appointment",
        color: "appointment",
      },
      {
        id: "d1",
        title: "Rekurs § 521 ZPO",
        date: iso(3),
        kind: "deadline",
        color: "notfrist",
      },
      {
        id: "h2",
        title: "Tagsatzung HG Wien",
        date: iso(3),
        time: "13:30",
        durationMin: 90,
        kind: "appointment",
        isHearing: true,
        color: "hearing",
      },
      {
        id: "d2",
        title: "Stellungnahme Sachverständigengutachten",
        date: iso(4),
        kind: "deadline",
        color: "deadline",
      },
    ];
    const weekDays = Array.from({ length: 5 }, (_, i) => iso(i));
    return { days: weekDays, items: list, conflicts: findCalendarConflicts(list) };
  }, []);

  const conflictIds = new Set(conflicts.flatMap((c) => [c.a.id, c.b.id]));
  const colorCls: Record<WeekItem["color"], string> = {
    deadline:
      "border-l-[color:var(--ds-warning-solid)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
    notfrist:
      "border-l-[color:var(--ds-danger-solid)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
    hearing:
      "border-l-[color:var(--brand-primary)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
    appointment:
      "border-l-[color:var(--ds-text-muted)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]",
  };
  const weekday = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("de-AT", { weekday: "short" });

  return (
    <ReplicaFrame path={["Kalender"]} caption={caption}>
      <div className="space-y-4">
        <section className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-warning-text)]">
            <AlertTriangle size={15} aria-hidden />
            {conflicts.length === 1 ? "1 Terminkollision" : `${conflicts.length} Terminkollisionen`}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[color:var(--ds-warning-text)]">
            {conflicts.map((c) => (
              <li key={`${c.kind}-${c.a.id}-${c.b.id}`} className="flex gap-2">
                <span className="shrink-0 font-medium tabular-nums">
                  {weekday(c.date)} {formatDate(c.date)}
                </span>
                <span>{describeCalendarConflict(c)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ds-border)] px-4 py-3">
            <div className="flex items-center gap-1">
              <span className="p-1 text-[color:var(--ds-text-muted)]">
                <ChevronLeft size={16} aria-hidden />
              </span>
              <span className="rounded-md border border-[color:var(--ds-border)] px-2 py-1 text-xs">
                Heute
              </span>
              <span className="p-1 text-[color:var(--ds-text-muted)]">
                <ChevronRight size={16} aria-hidden />
              </span>
              <span className="ml-2 text-sm font-semibold">Woche ab {formatDate(days[0])}</span>
            </div>
            <span className="flex rounded-lg border border-[color:var(--ds-border)] p-0.5 text-xs">
              <span className="rounded-md bg-[color:var(--ds-surface-2)] px-2.5 py-1 font-medium">
                Woche
              </span>
              <span className="px-2.5 py-1 text-[color:var(--ds-text-muted)]">Monat</span>
            </span>
          </div>
          <div className="grid grid-cols-1 divide-y divide-[color:var(--ds-border)] sm:grid-cols-5 sm:divide-x sm:divide-y-0">
            {days.map((d) => {
              const dayItems = items
                .filter((i) => i.date === d)
                .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
              const hasConflict = dayItems.some((i) => conflictIds.has(i.id));
              return (
                <div key={d} className="min-h-[9rem] p-2.5">
                  <p className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-[color:var(--ds-text-muted)] uppercase">
                      {weekday(d)} {formatDate(d).slice(0, 6)}
                    </span>
                    {hasConflict && (
                      <AlertTriangle
                        size={13}
                        aria-hidden
                        className="text-[color:var(--ds-warning-text)]"
                      />
                    )}
                  </p>
                  <ul className="space-y-1.5">
                    {dayItems.map((i) => (
                      <li
                        key={i.id}
                        className={cn(
                          "rounded-md border-l-2 px-2 py-1.5 text-xs leading-snug break-words hyphens-auto",
                          colorCls[i.color],
                          conflictIds.has(i.id) && "ring-1 ring-[color:var(--ds-warning-border)]"
                        )}
                      >
                        <span className="block font-medium">
                          {i.time ? `${i.time} ` : ""}
                          {i.title}
                        </span>
                        {i.color === "notfrist" && <span className="block">Notfrist</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[color:var(--ds-border)] px-4 py-2.5 text-xs text-[color:var(--ds-text-muted)]">
            <Legend cls="bg-[color:var(--ds-warning-text)]" label="Frist" />
            <Legend cls="bg-[color:var(--ds-danger-text)]" label="Notfrist" />
            <Legend cls="bg-[color:var(--brand-solid)]" label="Verhandlung" />
            <Legend cls="bg-[color:var(--ds-text-muted)]" label="Termin" />
            <span className="inline-flex items-center gap-1">
              <AlertTriangle size={12} aria-hidden /> Kollision
            </span>
          </div>
        </section>
      </div>
    </ReplicaFrame>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", cls)} aria-hidden />
      {label}
    </span>
  );
}

/* ── Kollisionsprüfung ─────────────────────────────────────────────── */

export function ConflictCheckReplica({ caption }: { caption?: string }) {
  const checkedAt = new Date().toLocaleString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <ReplicaFrame path={["Kollisionsprüfung"]} caption={caption}>
      <div className="space-y-4">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 shadow-[var(--ds-shadow-1)]">
          <div className="flex gap-2">
            <span className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-[color:var(--ds-border)] px-3 text-sm">
              <Search size={14} aria-hidden className="text-[color:var(--ds-text-subtle)]" />
              Nordlicht
            </span>
            <Button variant="primary">
              <ShieldCheck size={14} aria-hidden /> Prüfen
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert
                size={18}
                aria-hidden
                className="mt-0.5 shrink-0 text-[color:var(--ds-danger-text)]"
              />
              <div>
                <p className="font-semibold text-[color:var(--ds-danger-text)]">
                  Möglicher Interessenkonflikt
                </p>
                <p className="mt-0.5 text-sm text-[color:var(--ds-danger-text)]">
                  „Nordlicht“ ist in einer offenen Akte Gegner. Eine Vertretung dieser Partei wäre
                  eine Doppelvertretung nach § 10 RAO.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs">
              <Copy size={12} aria-hidden /> Protokoll kopieren
            </span>
          </div>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 pl-7 text-xs text-[color:var(--ds-danger-text)]">
            <span>
              Geprüfter Name: <strong>Nordlicht</strong>
            </span>
            <span>
              Treffer: <strong>1 + 1 ähnlich</strong>
            </span>
            <span>
              Gegnerseite: <strong>1</strong>
            </span>
            <span>
              Geprüft am: <strong className="tabular-nums">{checkedAt}</strong>
            </span>
          </p>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            Beteiligte Akten (2)
          </p>
          <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
            <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span>
                <span className="flex items-center gap-2 font-medium">
                  <Briefcase size={13} aria-hidden /> Kern Handels GmbH ./. Nordlicht KG
                  <span className="text-xs font-normal text-[color:var(--ds-text-subtle)]">
                    offen
                  </span>
                </span>
                <span className="block text-xs text-[color:var(--ds-text-muted)]">
                  Akte 2026/006 · erfasst als Nordlicht KG
                </span>
              </span>
              <span className="flex gap-1.5">
                <Badge variant="danger">Gegnerseite</Badge>
                <Badge variant="default">Treffer</Badge>
              </span>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span>
                <span className="flex items-center gap-2 font-medium">
                  <Users size={13} aria-hidden /> Nordlicht Immobilien GmbH
                  <span className="text-xs font-normal text-[color:var(--ds-text-subtle)]">
                    archiviert
                  </span>
                </span>
                <span className="block text-xs text-[color:var(--ds-text-muted)]">
                  Kontakt · Akte 2023/118
                </span>
              </span>
              <span className="flex gap-1.5">
                <Badge variant="default">Beteiligter</Badge>
                <Badge variant="default">Ähnlicher Name 82 %</Badge>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </ReplicaFrame>
  );
}
