"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, Trash2, Loader2, Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import type { BrainPage } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { csrfFetch } from "@/lib/csrf";
import { formatDate } from "@/lib/utils";
import {
  conflictsForEntry,
  minutesToTime,
  parseTimeToMinutes,
  toLocalIsoDate,
  type CalendarEntry,
} from "@/lib/calendar-conflicts";

export type AppointmentType = "meeting" | "hearing" | "consultation" | "internal";

export interface Appointment {
  slug: string;
  title: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM` */
  time?: string;
  /** Minuten */
  duration?: number;
  location?: string;
  description?: string;
  caseSlug?: string;
  caseTitle?: string;
  status: string;
  type: AppointmentType;
  /** Jitsi-Raum-Link, serverseitig generiert und im Frontmatter persistiert. */
  videoLink?: string;
}

export interface CaseOption {
  slug: string;
  title: string;
  caseNumber: string;
}

const APPOINTMENT_TYPES: AppointmentType[] = ["meeting", "hearing", "consultation", "internal"];
const NO_CASE = "__none__";
const DRAFT_ID = "__draft__";

function toAppointmentType(value: unknown): AppointmentType {
  return APPOINTMENT_TYPES.includes(value as AppointmentType)
    ? (value as AppointmentType)
    : "meeting";
}

/** Kalendereintrag eines Termins für die Kollisionsprüfung. */
export function appointmentToEntry(
  a: Pick<Appointment, "slug" | "title" | "date" | "time" | "duration" | "type">
): CalendarEntry {
  return {
    id: a.slug,
    title: a.title,
    date: a.date,
    time: a.time,
    durationMin: a.duration,
    kind: "appointment",
    isHearing: a.type === "hearing",
  };
}

interface CalendarEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment | null;
  presetDate?: string;
  cases: CaseOption[];
  /** Bestehende Termine und Fristen — der Dialog warnt vor Überschneidungen. */
  existingEntries?: CalendarEntry[];
  onSave: (
    data: Partial<Appointment> & { isNew: boolean; wantsVideoLink?: boolean }
  ) => Promise<void>;
  onDelete?: (slug: string) => Promise<void>;
}

export function CalendarEditDialog({
  open,
  onOpenChange,
  appointment,
  presetDate,
  cases,
  existingEntries,
  onSave,
  onDelete,
}: CalendarEditDialogProps) {
  const { t } = useLang();
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: "",
    time: "09:00",
    duration: "60",
    location: "",
    description: "",
    caseSlug: NO_CASE,
    type: "meeting" as AppointmentType,
    videoLink: false,
  });

  useEffect(() => {
    setConfirmDelete(false);
    if (appointment) {
      setForm({
        title: appointment.title,
        date: appointment.date,
        time: appointment.time || "09:00",
        duration: String(appointment.duration || 60),
        location: appointment.location || "",
        description: appointment.description || "",
        caseSlug: appointment.caseSlug || NO_CASE,
        type: appointment.type,
        videoLink: Boolean(appointment.videoLink),
      });
    } else {
      setForm({
        title: "",
        date: presetDate || toLocalIsoDate(new Date()),
        time: "09:00",
        duration: "60",
        location: "",
        description: "",
        caseSlug: NO_CASE,
        type: "meeting",
        videoLink: false,
      });
    }
  }, [appointment, presetDate, open]);

  const selfId = appointment?.slug ?? DRAFT_ID;
  const draftConflicts = useMemo(() => {
    if (!form.date || !existingEntries?.length) return [];
    return conflictsForEntry(
      appointmentToEntry({
        slug: selfId,
        title: form.title || "Neuer Termin",
        date: form.date,
        time: form.time,
        duration: Number(form.duration),
        type: form.type,
      }),
      existingEntries
    );
  }, [form.date, form.time, form.duration, form.type, form.title, selfId, existingEntries]);

  // A11y: focus restoration on close (autofocus is handled by the title input).
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      previouslyFocused?.focus();
    };
  }, [open]);

  const busyRef = useRef(false);
  busyRef.current = saving || deleting;

  // Escape closes (unless busy), Tab cycles focus within the dialog.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          onOpenChange(false);
        }
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const handleSave = async () => {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    try {
      await onSave({
        slug: appointment?.slug,
        title: form.title.trim(),
        date: form.date,
        time: form.time,
        duration: Number(form.duration),
        location: form.location,
        description: form.description,
        caseSlug: form.caseSlug === NO_CASE ? undefined : form.caseSlug,
        type: form.type,
        wantsVideoLink: form.videoLink,
        isNew: !appointment,
      });
      onOpenChange(false);
    } catch {
      addToast({
        type: "error",
        title: t("calendar.save_error" as DashboardKey),
        description: "Der Termin wurde nicht gespeichert. Bitte versuchen Sie es erneut.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!appointment?.slug) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete?.(appointment.slug);
      onOpenChange(false);
    } catch {
      addToast({
        type: "error",
        title: t("calendar.delete_error" as DashboardKey),
        description: "Der Termin ist unverändert. Bitte versuchen Sie es erneut.",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (!open) return null;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Backdrop click-to-close; keyboard users close via Escape or the close button.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busyRef.current) onOpenChange(false);
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-edit-dialog-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-[var(--ds-shadow-3)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="calendar-edit-dialog-title"
            className="text-sm font-semibold text-[color:var(--ds-text)]"
          >
            {appointment ? t("calendar.edit" as DashboardKey) : t("calendar.new" as DashboardKey)}
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("common.close" as DashboardKey)}
            className="rounded-md p-0.5 text-[color:var(--ds-text-muted)] transition-[color] duration-[var(--ds-duration-fast)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="appt-title" className="text-xs">
              {t("calendar.title_label" as DashboardKey)}
            </Label>
            <Input
              id="appt-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("calendar.title_placeholder" as DashboardKey)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="appt-date" className="text-xs">
                {t("calendar.date" as DashboardKey)}
              </Label>
              <Input
                id="appt-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="appt-time" className="text-xs">
                {t("calendar.time" as DashboardKey)}
              </Label>
              <Input
                id="appt-time"
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="appt-duration" className="text-xs">
                {t("calendar.duration" as DashboardKey)}
              </Label>
              <Select
                value={form.duration}
                onValueChange={(v) => setForm({ ...form, duration: v })}
              >
                <SelectTrigger id="appt-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 Min.</SelectItem>
                  <SelectItem value="60">1 Std.</SelectItem>
                  <SelectItem value="90">1,5 Std.</SelectItem>
                  <SelectItem value="120">2 Std.</SelectItem>
                  <SelectItem value="240">4 Std.</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="appt-type" className="text-xs">
                {t("calendar.type" as DashboardKey)}
              </Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: toAppointmentType(v) })}
              >
                <SelectTrigger id="appt-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">
                    {t("calendar.type_meeting" as DashboardKey)}
                  </SelectItem>
                  <SelectItem value="hearing">
                    {t("calendar.type_hearing" as DashboardKey)}
                  </SelectItem>
                  <SelectItem value="consultation">
                    {t("calendar.type_consultation" as DashboardKey)}
                  </SelectItem>
                  <SelectItem value="internal">
                    {t("calendar.type_internal" as DashboardKey)}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="appt-location" className="text-xs">
              {t("calendar.location" as DashboardKey)}
            </Label>
            <Input
              id="appt-location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder={t("calendar.location_placeholder" as DashboardKey)}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="appt-video"
              className="flex items-center gap-2 text-xs font-medium [color:var(--mk-text)]"
            >
              <input
                id="appt-video"
                type="checkbox"
                checked={form.videoLink}
                onChange={(e) => setForm({ ...form, videoLink: e.target.checked })}
                className="h-4 w-4 rounded border-[color:var(--mk-border)] accent-[var(--brand-primary)] focus-visible:ring-2 focus-visible:outline-none"
              />
              {t("calendar.video_link" as DashboardKey)}
            </label>
            {appointment?.videoLink && (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={appointment.videoLink}
                  aria-label={t("calendar.video_link" as DashboardKey)}
                  className="text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(appointment.videoLink!).then(() =>
                      addToast({
                        type: "success",
                        title: t("calendar.video_copied" as DashboardKey),
                      })
                    );
                  }}
                >
                  {t("calendar.video_copy" as DashboardKey)}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="appt-case" className="text-xs">
              {t("calendar.case" as DashboardKey)}
            </Label>
            <Select value={form.caseSlug} onValueChange={(v) => setForm({ ...form, caseSlug: v })}>
              <SelectTrigger id="appt-case">
                <SelectValue placeholder={t("calendar.no_case" as DashboardKey)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CASE}>{t("calendar.no_case" as DashboardKey)}</SelectItem>
                {cases.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.caseNumber ? `${c.caseNumber} — ${c.title}` : c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="appt-description" className="text-xs">
              {t("calendar.description_label" as DashboardKey)}
            </Label>
            <Input
              id="appt-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t("calendar.description_placeholder" as DashboardKey)}
            />
          </div>

          {draftConflicts.length > 0 && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <ul className="space-y-0.5">
                {draftConflicts.map((c) => {
                  const other = c.a.id === selfId ? c.b : c.a;
                  return (
                    <li key={`${c.a.id}-${c.b.id}`}>
                      {c.kind === "overlap"
                        ? `Überschneidet sich mit „${other.title}“${other.time ? ` (${other.time} Uhr)` : ""}.`
                        : other.kind === "deadline"
                          ? `Am ${formatDate(c.date)} endet die Frist „${other.title}“.`
                          : `Die Frist fällt auf den Verhandlungstag „${other.title}“.`}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {appointment && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-2 whitespace-nowrap text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)]"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {confirmDelete ? "Wirklich löschen?" : t("calendar.delete" as DashboardKey)}
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("calendar.cancel" as DashboardKey)}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSave}
              disabled={!form.title.trim() || !form.date || saving}
              className="gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {appointment
                ? t("calendar.save" as DashboardKey)
                : t("calendar.create" as DashboardKey)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function mapAppointment(p: BrainPage): Appointment {
  const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
  return {
    slug: p.slug,
    title: String(fm.title ?? p.title ?? "Termin"),
    // Stored as `YYYY-MM-DD`; tolerate full timestamps from older imports.
    date: String(fm.date ?? "").slice(0, 10),
    time: typeof fm.time === "string" && fm.time ? fm.time.slice(0, 5) : undefined,
    duration: typeof fm.duration === "number" ? fm.duration : undefined,
    location: typeof fm.location === "string" ? fm.location : undefined,
    videoLink: typeof fm.video_link === "string" ? fm.video_link : undefined,
    description: p.content?.slice(0, 500) ?? "",
    caseSlug: typeof fm.case_slug === "string" ? fm.case_slug : undefined,
    caseTitle: typeof fm.case_title === "string" ? fm.case_title : undefined,
    status: String(fm.status ?? "scheduled"),
    // The editor stores the kind under `appointment_type`; `type` is the page
    // type ("appointment") and only carries the kind on older pages.
    type: toAppointmentType(fm.appointment_type ?? fm.type),
  };
}

/**
 * Kanzleitermine (Seitentyp `appointment`) samt Aktenliste für die Terminauswahl.
 * Neue Termine werden nach Outlook gespiegelt, sofern ein Konto verbunden ist.
 */
export function useAppointments() {
  const { t } = useLang();
  const { addToast } = useToast();
  const me = useMe();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [casePages, setCasePages] = useState<BrainPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    try {
      const batch = await api.brain.batchListPagesDetailed(["appointment", "legal_case"], 200);
      if (batch.errors.length) throw new Error(`batch list failed: ${batch.errors.join(",")}`);
      setAppointments(
        (batch.results["appointment"] ?? [])
          .map(mapAppointment)
          .filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.date) && a.status !== "cancelled")
      );
      setCasePages(batch.results["legal_case"] ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const cases: CaseOption[] = useMemo(
    () =>
      casePages.map((p) => {
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        return {
          slug: p.slug,
          title: p.title,
          caseNumber: typeof fm.case_number === "string" ? fm.case_number : "",
        };
      }),
    [casePages]
  );

  const save = useCallback(
    async (data: Partial<Appointment> & { isNew: boolean; wantsVideoLink?: boolean }) => {
      const slug = data.isNew ? `legal/appointments/appt-${Date.now()}` : data.slug!;
      const caseTitle = data.caseSlug
        ? casePages.find((c) => c.slug === data.caseSlug)?.title
        : undefined;

      await api.brain.updatePage({
        slug,
        title: data.title,
        type: "appointment",
        content: data.description || "",
        frontmatter: {
          type: "appointment",
          title: data.title,
          date: data.date,
          time: data.time,
          duration: data.duration,
          location: data.location,
          case_slug: data.caseSlug || undefined,
          case_title: caseTitle,
          status: "scheduled",
          appointment_type: data.type,
          // WP-4.19: per-user two-way sync — the cron pushes flagged
          // appointments into the owner's Outlook calendar.
          sync_to_outlook: true,
          calendar_owner_email: me.data?.user?.email ?? undefined,
          updated_at: new Date().toISOString(),
        },
      });

      // WP-8.53: Videotermin — der Server erzeugt den Jitsi-Raum (HMAC des
      // Slugs, keine Mandantendaten) und persistiert ihn ins Frontmatter.
      // Ohne JITSI_DOMAIN meldet die Route ehrlich not_configured.
      if (data.wantsVideoLink && !data.videoLink) {
        const vl = await csrfFetch("/api/legal/appointments/video-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        }).catch(() => null);
        if (vl && vl.status === 503) {
          addToast({
            type: "warning",
            title: t("calendar.video_not_configured" as DashboardKey),
          });
        } else if (vl && !vl.ok) {
          addToast({ type: "warning", title: t("calendar.video_link_failed" as DashboardKey) });
        }
      }

      // Mirror new appointments to Outlook. Start and end are both local
      // Vienna wall-clock times (converting the end via toISOString shifted it to UTC).
      if (data.isNew) {
        const startMin = parseTimeToMinutes(data.time) ?? 9 * 60;
        const endMin = startMin + (data.duration || 60);
        const outlook = await csrfFetch("/api/outlook/calendar/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: data.title,
            start: `${data.date}T${minutesToTime(startMin)}:00`,
            end: `${data.date}T${minutesToTime(endMin)}:00`,
            timeZone: "Europe/Vienna",
            location: data.location || undefined,
            body: data.description || undefined,
            caseSlug: data.caseSlug || undefined,
          }),
        }).catch(() => null);
        // Without a connected Microsoft account the local save still counts.
        if (outlook && !outlook.ok && outlook.status >= 500) {
          addToast({
            type: "warning",
            title: "Termin gespeichert, aber nicht nach Outlook übertragen",
          });
        }
      }

      addToast({
        type: "success",
        title: data.isNew
          ? t("calendar.created" as DashboardKey)
          : t("calendar.updated" as DashboardKey),
      });
      await reload();
    },
    [casePages, reload, addToast, t, me.data?.user?.email]
  );

  const remove = useCallback(
    async (slug: string) => {
      await api.brain.deletePage(slug);
      addToast({ type: "success", title: t("calendar.deleted" as DashboardKey) });
      await reload();
    },
    [reload, addToast, t]
  );

  return { appointments, casePages, cases, loading, error, reload, save, remove };
}
