"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, CalendarClock, Copy, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn, daysUntil, formatDate, formatDaysUntil } from "@/lib/utils";
import { minutesToTime, parseTimeToMinutes, toLocalIsoDate } from "@/lib/calendar-conflicts";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { useLang } from "@/lib/use-lang";
import { EmptyState } from "@/components/dashboard/empty-state";

type ExportKind = "deadline" | "hearing" | "appointment";

interface CalendarEvent {
  id: string;
  title: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM` */
  time?: string;
  durationMin?: number;
  description?: string;
  kind: ExportKind;
  isNotfrist?: boolean;
  caseLabel?: string;
  location?: string;
  vorfristDate?: string;
}

const KIND_LABEL: Record<ExportKind, string> = {
  deadline: "Frist",
  hearing: "Verhandlung",
  appointment: "Termin",
};

const FILTER_LABEL: Record<"all" | ExportKind, string> = {
  all: "Alle",
  deadline: "Fristen",
  hearing: "Verhandlungen",
  appointment: "Termine",
};

function icsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toLocalIsoDate(new Date(y, m - 1, d + 1));
}

function escapeIcalText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545: Zeitangaben im Wiener Ortszeit-Kontext, ganztägige Einträge mit Folgetag als Ende. */
function generateIcal(events: CalendarEvent[]): string {
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Subsumio//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Subsumio Kanzlei-Fristen",
    "X-WR-TIMEZONE:Europe/Vienna",
  ];

  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.id.replace(/[^\w.-]/g, "-")}@subsumio.local`);
    const start = parseTimeToMinutes(ev.time);
    if (ev.kind !== "deadline" && start !== null) {
      const end = start + (ev.durationMin ?? 60);
      lines.push(
        `DTSTART;TZID=Europe/Vienna:${icsDate(ev.date)}T${minutesToTime(start).replace(":", "")}00`
      );
      lines.push(
        `DTEND;TZID=Europe/Vienna:${icsDate(ev.date)}T${minutesToTime(end).replace(":", "")}00`
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(ev.date)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(nextDay(ev.date))}`);
    }
    const prefix = ev.isNotfrist ? "Notfrist: " : ev.kind === "deadline" ? "Frist: " : "";
    lines.push(`SUMMARY:${escapeIcalText(`${prefix}${ev.title}`)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcalText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeIcalText(ev.location)}`);
    if (ev.kind === "deadline") {
      if (ev.vorfristDate) {
        lines.push("BEGIN:VALARM");
        lines.push(`TRIGGER;VALUE=DATE-TIME:${icsDate(ev.vorfristDate)}T080000`);
        lines.push("ACTION:DISPLAY");
        lines.push(`DESCRIPTION:${escapeIcalText(`Vorfrist: ${ev.title}`)}`);
        lines.push("END:VALARM");
      }
      // Zusätzlich immer eine Erinnerung zwei Tage vorher.
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-P2D");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:${escapeIcalText(`Frist: ${ev.title}`)}`);
      lines.push("END:VALARM");
    }
    lines.push(`DTSTAMP:${stamp}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export default function CalendarExportPage() {
  const { t } = useLang();
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | ExportKind>("all");
  const [copied, setCopied] = useState(false);
  // The subscription link carries its own secret, so Outlook, Google and Apple
  // can fetch it without a Subsumio login. It is shown once, right after it is
  // created; afterwards only the fact that one exists is known.
  const [icsSubscriptionUrl, setIcsSubscriptionUrl] = useState("");
  const [feedActive, setFeedActive] = useState<boolean | null>(null);
  const [feedCreatedAt, setFeedCreatedAt] = useState<string | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  // Separate WebDAV/CalDAV access for the read-only drive bridge. Unlike the
  // calendar link above it opens documents, so it is its own, explicitly
  // created credential (see src/lib/feed-auth.ts). Shown once, like the link.
  const [davToken, setDavToken] = useState("");
  const [davActive, setDavActive] = useState<boolean | null>(null);
  const [davCreatedAt, setDavCreatedAt] = useState<string | null>(null);
  const [davBusy, setDavBusy] = useState(false);
  const [davError, setDavError] = useState<string | null>(null);
  const [davCopied, setDavCopied] = useState(false);

  useEffect(() => {
    void loadEvents();
    void loadFeedStatus();
    void loadDavStatus();
  }, []);

  async function loadDavStatus() {
    try {
      const res = await api.get<{ data: { active: boolean; createdAt: string | null } }>(
        "/api/settings/dav-access"
      );
      setDavActive(res.data.active);
      setDavCreatedAt(res.data.createdAt);
    } catch {
      setDavActive(false);
    }
  }

  async function createDavToken() {
    setDavBusy(true);
    setDavError(null);
    try {
      const res = await api.post<{ data: { token: string } }>("/api/settings/dav-access", {});
      setDavToken(res.data.token);
      setDavActive(true);
      setDavCreatedAt(new Date().toISOString());
    } catch {
      setDavError("Der Zugang konnte nicht erstellt werden. Bitte erneut versuchen.");
    } finally {
      setDavBusy(false);
    }
  }

  async function revokeDavToken() {
    setDavBusy(true);
    setDavError(null);
    try {
      await api.delete("/api/settings/dav-access");
      setDavToken("");
      setDavActive(false);
      setDavCreatedAt(null);
    } catch {
      setDavError("Der Zugang konnte nicht widerrufen werden. Bitte erneut versuchen.");
    } finally {
      setDavBusy(false);
    }
  }

  function copyDavToken() {
    if (!davToken || !navigator.clipboard) return;
    void navigator.clipboard.writeText(davToken).then(() => {
      setDavCopied(true);
      setTimeout(() => setDavCopied(false), 3000);
    });
  }

  async function loadFeedStatus() {
    try {
      const res = await api.get<{ data: { active: boolean; createdAt: string | null } }>(
        "/api/settings/calendar-feed"
      );
      setFeedActive(res.data.active);
      setFeedCreatedAt(res.data.createdAt);
    } catch {
      setFeedActive(false);
    }
  }

  async function createFeedLink() {
    setFeedBusy(true);
    setFeedError(null);
    try {
      const res = await api.post<{ data: { url: string } }>("/api/settings/calendar-feed", {});
      setIcsSubscriptionUrl(res.data.url);
      setFeedActive(true);
      setFeedCreatedAt(new Date().toISOString());
    } catch {
      setFeedError("Die Adresse konnte nicht erstellt werden. Bitte erneut versuchen.");
    } finally {
      setFeedBusy(false);
    }
  }

  async function revokeFeedLink() {
    setFeedBusy(true);
    setFeedError(null);
    try {
      await api.delete("/api/settings/calendar-feed");
      setIcsSubscriptionUrl("");
      setFeedActive(false);
      setFeedCreatedAt(null);
    } catch {
      setFeedError("Die Adresse konnte nicht widerrufen werden. Bitte erneut versuchen.");
    } finally {
      setFeedBusy(false);
    }
  }

  async function loadEvents() {
    setLoading(true);
    setLoadError(null);
    try {
      // Fristen aus dem einheitlichen Fristen-Register (wie Fristenbuch und Fristenseite),
      // Termine aus dem Kanzleikalender.
      const [fristenData, batch] = await Promise.all([
        api.legal.fristen(),
        api.brain.batchListPagesDetailed(["appointment"], 300).then((r) => {
          if (r.errors.length) throw new Error(`batch list failed: ${r.errors.join(",")}`);
          return r.results;
        }),
      ]);
      const loaded: CalendarEvent[] = [];
      for (const f of fristenData.fristen) {
        if (f.status === "done" || f.status === "completed") continue;
        const date = String(f.due_date ?? "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        loaded.push({
          id: `frist-${f.id}`,
          title: f.title,
          date,
          kind: f.type === "hearing" ? "hearing" : "deadline",
          isNotfrist: f.is_notfrist,
          description: [f.case_title ? `Akte: ${f.case_title}` : null, f.law]
            .filter(Boolean)
            .join(" · "),
          caseLabel: f.case_title,
          location: f.court,
          vorfristDate: f.vorfrist_date?.slice(0, 10),
        });
      }
      for (const appt of batch["appointment"] ?? []) {
        const fm = (appt.frontmatter ?? {}) as Record<string, unknown>;
        const date = String(fm.date ?? "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const status = String(fm.status ?? "");
        if (status === "cancelled" || status === "completed") continue;
        const apptType = String(fm.appointment_type ?? "");
        loaded.push({
          id: appt.slug,
          title: String(fm.title ?? appt.title ?? "Termin"),
          date,
          time: typeof fm.time === "string" && fm.time ? fm.time.slice(0, 5) : undefined,
          durationMin: typeof fm.duration === "number" ? fm.duration : undefined,
          description: appt.content?.slice(0, 200) || undefined,
          kind: apptType === "hearing" ? "hearing" : "appointment",
          caseLabel: typeof fm.case_title === "string" ? fm.case_title : undefined,
          location: typeof fm.location === "string" ? fm.location : undefined,
        });
      }
      setEvents(
        loaded.sort(
          (a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")
        )
      );
    } catch {
      setLoadError(
        "Fristen und Termine konnten gerade nicht geladen werden. Bitte versuchen Sie es in einem Moment erneut."
      );
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.kind === filter)),
    [events, filter]
  );
  const counts = useMemo(() => {
    const c: Record<ExportKind, number> = { deadline: 0, hearing: 0, appointment: 0 };
    for (const e of events) c[e.kind] += 1;
    return c;
  }, [events]);
  const overdueCount = filtered.filter((e) => (daysUntil(e.date) ?? 0) < 0).length;

  function downloadIcal() {
    const ical = generateIcal(filtered);
    const blob = new Blob([ical], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subsumio-fristen-${toLocalIsoDate(new Date())}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copySubscriptionUrl() {
    if (!icsSubscriptionUrl || !navigator.clipboard) return;
    void navigator.clipboard.writeText(icsSubscriptionUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("calexport.title")}
        description="Übertragen Sie offene Fristen und Termine in Outlook, Google oder Apple Kalender — als laufendes Abonnement oder als einmalige Datei."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("calendar.title"), href: "/dashboard/calendar" },
          { label: t("calexport.title") },
        ]}
        actions={
          <PrimaryAction
            icon={<Download size={15} aria-hidden="true" />}
            onClick={downloadIcal}
            disabled={loading || filtered.length === 0}
          >
            iCal herunterladen
          </PrimaryAction>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            Kalender abonnieren
          </h2>
          <p className="text-sm text-[color:var(--ds-text)]">
            Das Abonnement aktualisiert sich selbst; jede Frist bringt eine Erinnerung zur Vorfrist
            und zwei Tage vor Fristende mit.
          </p>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Die Adresse enthält einen persönlichen Schlüssel und ist damit wie ein Passwort zu
            behandeln: Wer sie kennt, sieht Ihre Fristen samt Aktenbezeichnung — aber keine
            Dokumente; die Adresse öffnet ausschließlich den Fristenkalender. Geben Sie sie nicht
            weiter und widerrufen Sie sie, wenn ein Gerät abhandenkommt.
          </p>

          {icsSubscriptionUrl && (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-xs text-[color:var(--ds-text)]">
                {icsSubscriptionUrl}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={copySubscriptionUrl}
                className="shrink-0 gap-1.5 whitespace-nowrap"
              >
                {copied ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <Copy size={13} aria-hidden="true" />
                )}
                {copied ? "Kopiert" : "Adresse kopieren"}
              </Button>
            </div>
          )}

          {icsSubscriptionUrl && (
            <p className="text-xs text-[color:var(--ds-attention-text)]">
              Kopieren Sie die Adresse jetzt — sie wird aus Sicherheitsgründen nicht noch einmal
              angezeigt.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={feedActive ? "secondary" : "primary"}
              size="sm"
              disabled={feedBusy}
              onClick={createFeedLink}
              className="gap-1.5"
            >
              <CalendarClock size={13} aria-hidden="true" />
              {feedActive ? "Neue Adresse erzeugen" : "Adresse erzeugen"}
            </Button>
            {feedActive && (
              <Button variant="ghost" size="sm" disabled={feedBusy} onClick={revokeFeedLink}>
                Widerrufen
              </Button>
            )}
          </div>

          {feedActive && !icsSubscriptionUrl && (
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              Eine Adresse ist aktiv
              {feedCreatedAt ? ` (erstellt am ${formatDate(feedCreatedAt)})` : ""}. Eine neue
              Adresse ersetzt die bisherige; bestehende Abonnements hören dann auf zu aktualisieren.
            </p>
          )}
          {feedError && (
            <p className="text-xs text-[color:var(--ds-danger-text)]" role="alert">
              {feedError}
            </p>
          )}
        </section>

        <section className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            Laufwerk verbinden (WebDAV)
          </h2>
          <p className="text-sm text-[color:var(--ds-text)]">
            Ein eigener Zugang für Finder, Windows-Explorer oder Thunderbird: Er öffnet Ihre
            Dokumente schreibgeschützt als Laufwerk und die Fristen als CalDAV-Kalender.
          </p>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Anders als die Kalender-Adresse gibt dieser Zugang Einsicht in alle Dokumente, die Sie
            sehen dürfen. Tragen Sie ihn nur in eigene Geräte ein — nie in Google, Outlook oder
            andere Dienste — und widerrufen Sie ihn, wenn ein Gerät abhandenkommt. Benutzername:
            beliebig (z. B. „feed“), Passwort: der Zugangsschlüssel. Die Serveradresse nennt Ihnen
            Ihre Administration.
          </p>

          {davToken && (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-xs text-[color:var(--ds-text)]">
                {davToken}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={copyDavToken}
                className="shrink-0 gap-1.5 whitespace-nowrap"
              >
                {davCopied ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <Copy size={13} aria-hidden="true" />
                )}
                {davCopied ? "Kopiert" : "Schlüssel kopieren"}
              </Button>
            </div>
          )}

          {davToken && (
            <p className="text-xs text-[color:var(--ds-attention-text)]">
              Kopieren Sie den Schlüssel jetzt — er wird aus Sicherheitsgründen nicht noch einmal
              angezeigt.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={davActive ? "secondary" : "primary"}
              size="sm"
              disabled={davBusy}
              onClick={createDavToken}
              className="gap-1.5"
            >
              {davActive ? "Neuen Zugang erzeugen" : "Zugang erzeugen"}
            </Button>
            {davActive && (
              <Button variant="ghost" size="sm" disabled={davBusy} onClick={revokeDavToken}>
                Widerrufen
              </Button>
            )}
          </div>

          {davActive && !davToken && (
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              Ein Zugang ist aktiv
              {davCreatedAt ? ` (erstellt am ${formatDate(davCreatedAt)})` : ""}. Ein neuer Zugang
              ersetzt den bisherigen; verbundene Laufwerke müssen dann neu angemeldet werden.
            </p>
          )}
          {davError && (
            <p className="text-xs text-[color:var(--ds-danger-text)]" role="alert">
              {davError}
            </p>
          )}
        </section>

        <section className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            Datei importieren
          </h2>
          <ul className="space-y-1 text-sm text-[color:var(--ds-text)]">
            <li>
              <span className="font-medium">Outlook:</span> Datei → Öffnen und Exportieren →
              Importieren/Exportieren → iCalendar
            </li>
            <li>
              <span className="font-medium">Google Kalender:</span> Einstellungen → Importieren und
              Exportieren → Datei auswählen
            </li>
            <li>
              <span className="font-medium">Apple Kalender:</span> Ablage → Importieren → .ics
              auswählen
            </li>
          </ul>
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="filter-strip">
            {(["all", "deadline", "hearing", "appointment"] as const)
              .filter((f) => f === "all" || counts[f] > 0 || filter === f)
              .map((f) => (
                <FilterChip
                  key={f}
                  label={
                    f === "all"
                      ? FILTER_LABEL.all
                      : `${FILTER_LABEL[f]}${counts[f] > 0 ? ` (${counts[f]})` : ""}`
                  }
                  active={filter === f}
                  onClick={() => setFilter(f)}
                />
              ))}
          </div>
          {!loading && filtered.length > 0 && (
            <p className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
              {filtered.length} {filtered.length === 1 ? "Eintrag" : "Einträge"} im Export
              {overdueCount > 0 ? ` · davon ${overdueCount} überfällig` : ""}
            </p>
          )}
        </div>

        {loadError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
          >
            <span>{loadError}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadEvents()}
              className="shrink-0 gap-1.5 text-[color:var(--ds-danger-text)]"
            >
              <RotateCcw size={13} aria-hidden="true" />
              Erneut laden
            </Button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          !loadError && (
            <EmptyState
              icon={CalendarClock}
              title="Keine offenen Fristen oder Termine"
              description="Sobald Sie Fristen in Akten erfassen oder Termine anlegen, lassen sie sich hier exportieren."
              actionLabel="Zu den Fristen"
              onAction={() => router.push("/dashboard/deadlines")}
            />
          )
        ) : (
          <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            {filtered.map((ev) => {
              const days = daysUntil(ev.date);
              const overdue = days !== null && days < 0;
              return (
                <li key={ev.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-24 shrink-0 tabular-nums">
                    <div
                      className={cn(
                        "text-sm font-semibold",
                        overdue
                          ? "text-[color:var(--ds-danger-text)]"
                          : "text-[color:var(--ds-text)]"
                      )}
                    >
                      {formatDate(ev.date)}
                    </div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {ev.kind === "deadline"
                        ? formatDaysUntil(days)
                        : ev.time
                          ? `${ev.time} Uhr`
                          : "ganztägig"}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {ev.title}
                    </div>
                    <div className="truncate text-xs text-[color:var(--ds-text-muted)]">
                      {[ev.isNotfrist ? "Notfrist" : KIND_LABEL[ev.kind], ev.caseLabel, ev.location]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
