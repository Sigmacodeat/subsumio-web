"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Edit2,
  Trash2,
  Clock,
  MapPin,
  Loader2,
} from "lucide-react";
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
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";

interface Appointment {
  slug: string;
  title: string;
  date: string;
  time?: string;
  duration?: number;
  location?: string;
  description?: string;
  caseSlug?: string;
  caseTitle?: string;
  status: string;
  type: string;
}

interface CalendarEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment | null;
  presetDate?: string;
  cases: Array<{ slug: string; title: string; caseNumber: string }>;
  onSave: (data: Partial<Appointment> & { isNew: boolean }) => Promise<void>;
  onDelete?: (slug: string) => Promise<void>;
}

function CalendarEditDialog({
  open,
  onOpenChange,
  appointment,
  presetDate,
  cases,
  onSave,
  onDelete,
}: CalendarEditDialogProps) {
  const { t } = useLang();
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: "",
    time: "09:00",
    duration: "60",
    location: "",
    description: "",
    caseSlug: "",
    type: "meeting",
  });

  useEffect(() => {
    if (appointment) {
      setForm({
        title: appointment.title,
        date: appointment.date,
        time: appointment.time || "09:00",
        duration: String(appointment.duration || 60),
        location: appointment.location || "",
        description: appointment.description || "",
        caseSlug: appointment.caseSlug || "",
        type: appointment.type || "meeting",
      });
    } else {
      setForm({
        title: "",
        date: presetDate || new Date().toISOString().split("T")[0],
        time: "09:00",
        duration: "60",
        location: "",
        description: "",
        caseSlug: "",
        type: "meeting",
      });
    }
  }, [appointment, presetDate, open]);

  const handleSave = async () => {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    try {
      await onSave({
        slug: appointment?.slug,
        title: form.title,
        date: form.date,
        time: form.time,
        duration: Number(form.duration),
        location: form.location,
        description: form.description,
        caseSlug: form.caseSlug || undefined,
        type: form.type,
        isNew: !appointment,
      });
      onOpenChange(false);
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : t("calendar.save_error" as DashboardKey),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!appointment?.slug) return;
    setDeleting(true);
    try {
      await onDelete?.(appointment.slug);
      onOpenChange(false);
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : t("calendar.delete_error" as DashboardKey),
      });
    } finally {
      setDeleting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {appointment ? t("calendar.edit" as DashboardKey) : t("calendar.new" as DashboardKey)}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">{t("calendar.title_label" as DashboardKey)}</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("calendar.title_placeholder" as DashboardKey)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("calendar.date" as DashboardKey)}</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">{t("calendar.time" as DashboardKey)}</Label>
              <Input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("calendar.duration" as DashboardKey)}</Label>
              <Select
                value={form.duration}
                onValueChange={(v) => setForm({ ...form, duration: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                  <SelectItem value="90">90 min</SelectItem>
                  <SelectItem value="120">2 h</SelectItem>
                  <SelectItem value="240">4 h</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("calendar.type" as DashboardKey)}</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
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

          <div>
            <Label className="text-xs">{t("calendar.location" as DashboardKey)}</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder={t("calendar.location_placeholder" as DashboardKey)}
            />
          </div>

          <div>
            <Label className="text-xs">{t("calendar.case" as DashboardKey)}</Label>
            <Select value={form.caseSlug} onValueChange={(v) => setForm({ ...form, caseSlug: v })}>
              <SelectTrigger>
                <SelectValue placeholder={t("calendar.no_case" as DashboardKey)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("calendar.no_case" as DashboardKey)}</SelectItem>
                {cases.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.caseNumber} — {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">{t("calendar.description_label" as DashboardKey)}</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t("calendar.description_placeholder" as DashboardKey)}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {appointment && onDelete ? (
            <Button
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-2 text-red-600 hover:bg-red-500/10"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t("calendar.delete" as DashboardKey)}
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("calendar.cancel" as DashboardKey)}
            </Button>
            <Button
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

const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function CalendarInUiEditor() {
  const { t } = useLang();
  const { addToast } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [cases, setCases] = useState<Array<{ slug: string; title: string; caseNumber: string }>>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [presetDate, setPresetDate] = useState<string | undefined>();

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const batch = await api.brain.batchListPages(["appointment", "legal_case"], 200);
      const apptPages = batch["appointment"] ?? [];
      const casePages = batch["legal_case"] ?? [];

      const mapped: Appointment[] = apptPages
        .map((p) => {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          return {
            slug: p.slug,
            title: String(fm.title ?? p.title ?? "Termin"),
            date: String(fm.date ?? ""),
            time: typeof fm.time === "string" ? fm.time : undefined,
            duration: typeof fm.duration === "number" ? fm.duration : undefined,
            location: typeof fm.location === "string" ? fm.location : undefined,
            description: p.content?.slice(0, 500) ?? "",
            caseSlug: typeof fm.case_slug === "string" ? fm.case_slug : undefined,
            caseTitle: typeof fm.case_title === "string" ? fm.case_title : undefined,
            status: String(fm.status ?? "scheduled"),
            type: String(fm.type ?? "meeting"),
          };
        })
        .filter((a) => a.date && a.status !== "cancelled");

      setAppointments(mapped);
      setCases(
        casePages.map((p) => {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          return {
            slug: p.slug,
            title: p.title,
            caseNumber: String(fm.case_number ?? p.slug),
          };
        })
      );
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const handleSave = useCallback(
    async (data: Partial<Appointment> & { isNew: boolean }) => {
      const slug = data.isNew ? `legal/appointments/appt-${Date.now()}` : data.slug!;

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
          status: "scheduled",
          appointment_type: data.type,
          updated_at: new Date().toISOString(),
        },
      });

      // Appointments (never legal deadlines) are pushed to Outlook. The API
      // owns credentials and records the remote reference for audit/sync.
      if (data.type !== "deadline") {
        const start = `${data.date}T${data.time || "09:00"}:00`;
        const endDate = new Date(new Date(start).getTime() + (data.duration || 60) * 60_000);
        const outlook = await csrfFetch("/api/outlook/calendar/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: data.title,
            start,
            end: endDate.toISOString().slice(0, 19),
            timeZone: "Europe/Vienna",
            location: data.location || undefined,
            body: data.description || undefined,
            caseSlug: data.caseSlug || undefined,
          }),
        });
        // A disconnected M365 account must not make local calendar saves fail.
        if (!outlook.ok && outlook.status !== 400)
          throw new Error(t("calendar.save_error" as DashboardKey));
      }

      addToast({
        type: "success",
        title: data.isNew
          ? t("calendar.created" as DashboardKey)
          : t("calendar.updated" as DashboardKey),
      });
      await loadAppointments();
    },
    [loadAppointments, addToast, t]
  );

  const handleDelete = useCallback(
    async (slug: string) => {
      await api.brain.deletePage(slug);
      addToast({ type: "success", title: t("calendar.deleted" as DashboardKey) });
      await loadAppointments();
    },
    [loadAppointments, addToast, t]
  );

  // Calendar grid calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = lastDay.getDate();

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of appointments) {
      const dateKey = appt.date;
      const existing = map.get(dateKey);
      if (existing) {
        existing.push(appt);
      } else {
        map.set(dateKey, [appt]);
      }
    }
    // Sort by time within each day
    for (const list of map.values()) {
      list.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    }
    return map;
  }, [appointments]);

  const today = new Date().toISOString().split("T")[0];

  const cells: Array<{ day: number | null; date: string | null }> = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ day: null, date: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d).toISOString().split("T")[0];
    cells.push({ day: d, date });
  }
  // Pad to fill 6 rows (42 cells)
  while (cells.length < 42) {
    cells.push({ day: null, date: null });
  }

  const openNew = (date?: string) => {
    setEditingAppointment(null);
    setPresetDate(date || new Date().toISOString().split("T")[0]);
    setDialogOpen(true);
  };

  const openEdit = (appt: Appointment) => {
    setEditingAppointment(appt);
    setPresetDate(undefined);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[color:var(--ds-text)]">
          {MONTHS_DE[month]} {year}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>
            {t("calendar.today" as DashboardKey)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
          >
            <ChevronRight size={16} />
          </Button>
          <Button variant="primary" size="sm" onClick={() => openNew()} className="ml-2 gap-2">
            <Plus size={14} />
            {t("calendar.new" as DashboardKey)}
          </Button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS_DE.map((day) => (
          <div
            key={day}
            className="pb-2 text-center text-xs font-medium text-[color:var(--ds-text-muted)]"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          const isToday = cell.date === today;
          const dayAppts = cell.date ? (appointmentsByDate.get(cell.date) ?? []) : [];

          return (
            <div
              key={idx}
              className={cn(
                "min-h-[80px] rounded-lg border p-1 transition-colors",
                cell.day === null
                  ? "border-transparent bg-transparent"
                  : "cursor-pointer border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:bg-[color:var(--ds-surface-2)]",
                isToday && "border-blue-500/40 ring-1 ring-blue-500/20"
              )}
              onClick={() => cell.date && openNew(cell.date)}
            >
              {cell.day && (
                <>
                  <div
                    className={cn(
                      "mb-1 text-xs font-medium",
                      isToday ? "text-blue-600" : "text-[color:var(--ds-text-muted)]"
                    )}
                  >
                    {cell.day}
                  </div>
                  <div className="space-y-0.5">
                    {dayAppts.slice(0, 3).map((appt) => (
                      <button
                        key={appt.slug}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(appt);
                        }}
                        className={cn(
                          "block w-full truncate rounded px-1.5 py-0.5 text-left text-xs transition-colors",
                          appt.type === "hearing"
                            ? "bg-blue-500/10 text-blue-700 hover:bg-blue-500/20"
                            : appt.type === "consultation"
                              ? "bg-violet-500/10 text-violet-700 hover:bg-violet-500/20"
                              : "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20"
                        )}
                      >
                        {appt.time && `${appt.time} `}
                        {appt.title}
                      </button>
                    ))}
                    {dayAppts.length > 3 && (
                      <div className="px-1.5 text-xs text-[color:var(--ds-text-muted)]">
                        +{dayAppts.length - 3} {t("calendar.more" as DashboardKey)}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Upcoming list */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
          {t("calendar.upcoming" as DashboardKey)}
        </h3>
        {appointments.filter((a) => a.date >= today).length === 0 ? (
          <p className="py-4 text-center text-sm text-[color:var(--ds-text-muted)]">
            {t("calendar.no_appointments" as DashboardKey)}
          </p>
        ) : (
          <div className="space-y-2">
            {appointments
              .filter((a) => a.date >= today)
              .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))
              .slice(0, 10)
              .map((appt) => (
                <button
                  key={appt.slug}
                  onClick={() => openEdit(appt)}
                  className="flex w-full items-center gap-3 rounded-lg border border-[color:var(--ds-border)] px-3 py-2 text-left transition-colors hover:bg-[color:var(--ds-surface-2)]"
                >
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
                    <span className="text-xs font-bold text-[color:var(--ds-text)]">
                      {new Date(appt.date).getDate()}
                    </span>
                    <span className="text-xs text-[color:var(--ds-text-muted)]">
                      {MONTHS_DE[new Date(appt.date).getMonth()].slice(0, 3)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {appt.title}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                      {appt.time && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {appt.time}
                        </span>
                      )}
                      {appt.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={10} />
                          {appt.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <Edit2 size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                </button>
              ))}
          </div>
        )}
      </div>

      <CalendarEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editingAppointment}
        presetDate={presetDate}
        cases={cases}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
