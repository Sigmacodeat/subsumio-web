"use client";

import { useState, useEffect } from "react";
import { Download, CalendarClock, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { STATUS_BG, statusBadgeClasses, type StatusColor } from "@/lib/status-colors";
import { cn } from "@/lib/utils";
import { caseFrontmatter } from "@/lib/legal-types";
import { timelineToDeadline } from "@/lib/legal-deadlines";
import { PageHeader } from "@/components/dashboard/page-header";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  description?: string;
  type: "deadline" | "hearing" | "meeting" | "reminder";
  caseNumber?: string;
  location?: string;
}

function generateIcal(events: CalendarEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Subsumio//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Subsumio Kanzlei-Fristen",
    "X-WR-TIMEZONE:Europe/Berlin",
  ];

  for (const ev of events) {
    const uid = `${ev.id}@subsumio.local`;
    const dateStr = ev.date.replace(/-/g, "");
    const dtStart = `${dateStr}T090000Z`;
    const dtEnd = `${dateStr}T100000Z`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${escapeIcalText(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcalText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeIcalText(ev.location)}`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function escapeIcalText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export default function CalendarExportPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "deadline" | "hearing" | "meeting">("all");

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    try {
      const [pages, casePages] = await Promise.all([
        api.brain.listPages({ type: "legal_deadline", limit: 200 }),
        api.brain.listPages({ type: "legal_case", limit: 200 }).catch(() => [] as BrainPage[]),
      ]);
      const loaded: CalendarEvent[] = pages.map((p) => {
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        return {
          id: String(p.slug || ""),
          title: String(p.title || ""),
          date: String(
            fm.due_date ||
              fm.date ||
              p.created_at?.split("T")[0] ||
              new Date().toISOString().split("T")[0]
          ),
          description: String(fm.description || p.content?.slice(0, 200) || ""),
          type: String(fm.event_type || "deadline") as CalendarEvent["type"],
          caseNumber: fm.case_number ? String(fm.case_number) : undefined,
          location: fm.court ? String(fm.court) : fm.location ? String(fm.location) : undefined,
        };
      });

      // Also load from legal-case pages that have deadline data
      for (const cp of casePages) {
        const fm = caseFrontmatter(cp);
        const rawDeadlines = fm.deadlines?.length
          ? fm.deadlines
          : [...(fm.timeline ?? []), ...(fm.timeline_events ?? [])].map((entry) =>
              timelineToDeadline(entry, cp.slug)
            );
        if (rawDeadlines.length) {
          for (const dl of rawDeadlines) {
            const date = dl.due_date || dl.date;
            if (!date) continue;
            loaded.push({
              id: `deadline-${String(cp.slug)}-${String(dl.title || "")}`,
              title: String(dl.title || ""),
              date: String(date),
              description: String(dl.description || `Frist für Akte ${fm.case_number || cp.slug}`),
              type: String(dl.type || "deadline") as CalendarEvent["type"],
              caseNumber: fm.case_number ? String(fm.case_number) : undefined,
              location: dl.court ? String(dl.court) : dl.location ? String(dl.location) : undefined,
            });
          }
        }
      }

      setEvents(loaded.sort((a, b) => a.date.localeCompare(b.date)));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Termine konnten nicht geladen werden.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  function downloadIcal() {
    const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);
    const ical = generateIcal(filtered);
    const blob = new Blob([ical], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subsumio-fristen-${new Date().toISOString().split("T")[0]}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);
  const upcoming = filtered.filter(
    (e) => new Date(e.date) >= new Date(new Date().setHours(0, 0, 0, 0))
  );
  const overdue = filtered.filter(
    (e) => new Date(e.date) < new Date(new Date().setHours(0, 0, 0, 0))
  );

  const TYPE_COLORS: Record<string, StatusColor> = {
    deadline: "amber",
    hearing: "blue",
    meeting: "violet",
    reminder: "emerald",
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Kalender-Export"
        description="Fristen & Termine als iCal (.ics)"
        breadcrumbs={[{ label: "Übersicht", href: "/dashboard" }, { label: "Kalender-Export" }]}
        actions={
          <Button
            variant="primary"
            className="gap-2 bg-blue-600 text-sm text-white hover:bg-blue-500"
            onClick={downloadIcal}
          >
            <Download size={14} />
            iCal herunterladen
          </Button>
        }
      />

      {/* Info */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <CalendarClock size={16} className="mt-0.5 shrink-0 text-blue-600" />
        <div className="text-sm text-blue-600">
          <p className="mb-1 font-medium">Importieren Sie die .ics-Datei in:</p>
          <ul className="space-y-0.5 text-xs">
            <li>• Outlook: Datei → Öffnen und Exportieren → Importieren/Exportieren → iCalendar</li>
            <li>• Google Calendar: Einstellungen → Kalender importieren → Datei auswählen</li>
            <li>• Apple Calendar: Datei → Importieren → .ics auswählen</li>
          </ul>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "deadline", "hearing", "meeting"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              filter === f
                ? "border-blue-500/30 bg-blue-600/15 text-blue-600"
                : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            }`}
          >
            {f === "all"
              ? "Alle"
              : f === "deadline"
                ? "Fristen"
                : f === "hearing"
                  ? "Verhandlungen"
                  : "Besprechungen"}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Anstehend</div>
          <div className="text-xl font-bold text-blue-600">{upcoming.length}</div>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Überfällig</div>
          <div className="text-xl font-bold text-red-600">{overdue.length}</div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Events */}
      {loading ? (
        <div className="py-20 text-center text-[color:var(--ds-text-muted)]">Lade Termine…</div>
      ) : filtered.length === 0 ? (
        <div className="space-y-4 py-20 text-center">
          <CalendarClock size={48} className="mx-auto text-[color:var(--ds-border)]" />
          <p className="text-[color:var(--ds-text-muted)]">Keine Termine gefunden.</p>
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Erstellen Sie Fristen in Akten oder nutzen Sie den Deadline-Extractor.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ev) => {
            const color = TYPE_COLORS[ev.type] || "gray";
            const isOverdue = new Date(ev.date) < new Date(new Date().setHours(0, 0, 0, 0));
            return (
              <div
                key={ev.id}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                  isOverdue
                    ? "border-red-500/20 bg-red-500/5"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                }`}
              >
                <div
                  className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_BG[color])}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)]">
                      {ev.title}
                    </span>
                    <Badge
                      variant="default"
                      className={cn("border text-xs", statusBadgeClasses(color))}
                    >
                      {ev.type === "deadline"
                        ? "Frist"
                        : ev.type === "hearing"
                          ? "Verhandlung"
                          : ev.type === "meeting"
                            ? "Besprechung"
                            : "Erinnerung"}
                    </Badge>
                    {isOverdue && (
                      <Badge
                        variant="default"
                        className="border-red-500/20 bg-red-500/10 text-xs text-red-600"
                      >
                        Überfällig
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {new Date(ev.date).toLocaleDateString("de-DE", {
                      weekday: "short",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    {ev.caseNumber && ` · Akte ${ev.caseNumber}`}
                    {ev.location && ` · ${ev.location}`}
                  </div>
                  {ev.description && (
                    <div className="mt-1 line-clamp-1 text-xs text-[color:var(--ds-text-muted)]">
                      {ev.description}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-xs text-[color:var(--ds-text-muted)]">
                  {isOverdue ? (
                    <AlertTriangle size={14} className="text-red-600" />
                  ) : (
                    <Clock size={14} className="text-blue-600" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
