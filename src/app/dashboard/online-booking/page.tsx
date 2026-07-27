"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Calendar, Clock, CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { BookingSlot } from "@/lib/online-booking";
import { generateSlots } from "@/lib/online-booking";

export default function OnlineBookingPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [workingHours, setWorkingHours] = useState({ start: "09:00", end: "17:00" });
  const [slotDuration, setSlotDuration] = useState("30");

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "booking_slot", limit: 200 });
      const existing = pages.map((p) => {
        const fm = p.frontmatter as { start?: string; end?: string };
        return { start: fm.start ?? "", end: fm.end ?? "" };
      });
      const generated = generateSlots(selectedDate, workingHours, Number(slotDuration), existing);
      setSlots(generated);
    } catch {
      addToast({ type: "error", title: t("booking.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t, selectedDate, workingHours, slotDuration]);

  useEffect(() => {
    void load();
  }, [load]);

  const formatDate = (d: Date) =>
    d.toLocaleDateString("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("booking.title")}
        description={t("booking.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: "Termine" },
        ]}
      />

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Calendar className="h-5 w-5" /> {t("booking.config")}
        </h2>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>{t("booking.date")}</Label>
            <Input
              type="date"
              value={selectedDate.toISOString().split("T")[0]}
              onChange={(e) => {
                const d = new Date(e.target.value);
                d.setHours(0, 0, 0, 0);
                setSelectedDate(d);
              }}
            />
          </div>
          <div>
            <Label>{t("booking.from")}</Label>
            <Input
              type="time"
              value={workingHours.start}
              onChange={(e) => setWorkingHours({ ...workingHours, start: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("booking.to")}</Label>
            <Input
              type="time"
              value={workingHours.end}
              onChange={(e) => setWorkingHours({ ...workingHours, end: e.target.value })}
            />
          </div>
          <div>
            <Label>{t("booking.duration")}</Label>
            <Input
              type="number"
              value={slotDuration}
              onChange={(e) => setSlotDuration(e.target.value)}
            />
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] p-12 text-center text-[color:var(--ds-text-muted)]">
          <CalendarPlus className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p>{t("booking.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            {formatDate(selectedDate)} — {slots.length} {t("booking.slots")}
          </h3>
          <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {slots.map((slot, idx) => (
              <div
                key={idx}
                className={`rounded-lg border p-3 text-center ${slot.status === "booked" ? "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] opacity-50" : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--brand-primary)]"}`}
              >
                <div className="flex items-center justify-center gap-1 text-sm font-medium">
                  <Clock className="h-3 w-3" />
                  {formatTime(slot.start)}
                </div>
                <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  — {formatTime(slot.end)}
                </div>
                {slot.status === "booked" ? (
                  <Badge className="mt-2 bg-slate-100 text-slate-500">{t("booking.booked")}</Badge>
                ) : (
                  <Badge className="mt-2 bg-[color:var(--ds-success-solid)] text-[color:var(--ds-success-text)]">
                    {t("booking.free")}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
