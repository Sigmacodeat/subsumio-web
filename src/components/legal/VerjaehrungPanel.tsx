"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  Plus,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";
import type { StatuteOfLimitations } from "@/lib/legal-types";
import { VERJAEHRUNG_PRESETS, daysUntilBarred, isBarred } from "@/lib/legal-verjaehrung";

interface VerjaehrungItem extends StatuteOfLimitations {
  isBarred?: boolean;
  daysUntilBarred?: number;
}

interface VerjaehrungPanelProps {
  caseSlug: string;
}

const STATUS_STYLES: Record<StatuteOfLimitations["status"], string> = {
  active:
    "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  barred:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  interrupted:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  suspended: "border-purple-500/20 bg-purple-500/5 text-purple-700",
};

const STATUS_LABELS_DE: Record<StatuteOfLimitations["status"], string> = {
  active: "Laufend",
  barred: "Verjährt",
  interrupted: "Unterbrochen",
  suspended: "Ruhend",
};

const STATUS_LABELS_EN: Record<StatuteOfLimitations["status"], string> = {
  active: "Running",
  barred: "Barred",
  interrupted: "Interrupted",
  suspended: "Suspended",
};

export function VerjaehrungPanel({ caseSlug }: VerjaehrungPanelProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [items, setItems] = useState<VerjaehrungItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  // Create form state
  const [presetKey, setPresetKey] = useState<string>(VERJAEHRUNG_PRESETS[0].key);
  const [claimLabel, setClaimLabel] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  // Event form state (per SOL id)
  const [eventFormFor, setEventFormFor] = useState<string | null>(null);
  const [eventType, setEventType] = useState<"interruption" | "suspension">("interruption");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventReason, setEventReason] = useState("");

  const labels = lang === "en" ? STATUS_LABELS_EN : STATUS_LABELS_DE;

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/legal/verjaehrung?caseSlug=${encodeURIComponent(caseSlug)}`);
      if (!res.ok) {
        if (res.status >= 500) setError(true);
        setItems([]);
        return;
      }
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [caseSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    setBusy(true);
    try {
      const res = await fetch("/api/legal/verjaehrung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseSlug,
          presetKey,
          claimLabel: claimLabel || undefined,
          startDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Fehler beim Anlegen");
      addToast({ type: "success", title: "Verjährungseintrag angelegt" });
      setShowCreate(false);
      setClaimLabel("");
      await load();
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Fehler beim Anlegen",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddEvent(solId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/legal/verjaehrung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseSlug,
          solId,
          eventType,
          date: eventDate,
          endDate: eventEndDate || undefined,
          reason: eventReason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Fehler beim Hinzufügen");
      addToast({ type: "success", title: "Ereignis hinzugefügt" });
      setEventFormFor(null);
      setEventReason("");
      setEventEndDate("");
      await load();
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Fehler beim Hinzufügen",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <Clock size={16} className="text-[color:var(--brand-primary)]" />
          <h3 className="text-sm font-semibold">
            {lang === "en" ? "Statute of Limitations" : "Verjährung"}
          </h3>
          <Loader2 size={14} className="ml-auto animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4">
        <div className="flex items-center gap-2 text-sm text-[color:var(--ds-danger-text)]">
          <AlertTriangle size={16} />
          <span>
            {lang === "en"
              ? "Could not load statute of limitations"
              : "Verjährung konnte nicht geladen werden"}
          </span>
          <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={() => void load()}>
            {lang === "en" ? "Retry" : "Erneut"}
          </Button>
        </div>
      </section>
    );
  }

  const barredCount = items.filter((i) => i.isBarred ?? isBarred(i)).length;
  const criticalCount = items.filter((i) => {
    const days = i.daysUntilBarred ?? daysUntilBarred(i);
    return !i.isBarred && days >= 0 && days <= 30;
  }).length;

  return (
    <section className="rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Clock size={16} className="text-[color:var(--brand-primary)]" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {lang === "en" ? "Statute of Limitations" : "Verjährung"}
        </h3>
        {items.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5">
            {barredCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-[color:var(--ds-danger-bg)] px-2 py-0.5 text-xs font-semibold text-[color:var(--ds-danger-text)] tabular-nums">
                <AlertTriangle size={10} />
                {barredCount} {lang === "en" ? "barred" : "verjährt"}
              </span>
            )}
            {criticalCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-[color:var(--ds-warning-bg)] px-2 py-0.5 text-xs font-semibold text-[color:var(--ds-warning-text)] tabular-nums">
                <Clock size={10} />
                {criticalCount} {lang === "en" ? "≤30d" : "≤30T"}
              </span>
            )}
            <span className="rounded-full bg-[color:var(--ds-surface-2)] px-2 py-0.5 text-xs tabular-nums">
              {items.length}
            </span>
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto gap-1.5 text-xs"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus size={13} />
          {lang === "en" ? "Add" : "Hinzufügen"}
        </Button>
      </div>

      {showCreate && (
        <div className="mt-4 space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{lang === "en" ? "Preset" : "Vorlage"}</Label>
              <Select value={presetKey} onValueChange={setPresetKey}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VERJAEHRUNG_PRESETS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{lang === "en" ? "Start date" : "Beginn"}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 h-9 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">
              {lang === "en" ? "Claim label (optional)" : "Bezeichnung (optional)"}
            </Label>
            <Input
              value={claimLabel}
              onChange={(e) => setClaimLabel(e.target.value)}
              placeholder={
                lang === "en" ? "e.g. Damage claim from accident" : "z.B. Schadensersatz aus Unfall"
              }
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => setShowCreate(false)}
            >
              {lang === "en" ? "Cancel" : "Abbrechen"}
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="text-xs"
              disabled={busy}
              onClick={() => void handleCreate()}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {lang === "en" ? "Create" : "Anlegen"}
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 && !showCreate ? (
        <p className="mt-3 text-sm text-[color:var(--ds-text-muted)]">
          {lang === "en"
            ? "No statute of limitations tracked for this case yet."
            : "Noch keine Verjährungsfristen für diese Akte erfasst."}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((sol) => {
            const isExpanded = expanded.has(sol.id);
            const days = sol.daysUntilBarred ?? daysUntilBarred(sol);
            const barred = sol.isBarred ?? isBarred(sol);
            return (
              <div
                key={sol.id}
                className={cn(
                  "rounded-xl border p-3",
                  barred
                    ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]"
                    : days <= 30
                      ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]"
                )}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleExpanded(sol.id)}
                    className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[color:var(--ds-text)]">
                        {sol.claim_label}
                      </p>
                      <Badge variant="default" className={cn("text-xs", STATUS_STYLES[sol.status])}>
                        {labels[sol.status]}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[color:var(--ds-text-muted)]">
                      <span>{sol.law}</span>
                      <span>
                        {lang === "en" ? "Start" : "Beginn"}: {sol.start_date}
                      </span>
                      <span>
                        {lang === "en" ? "Effective barred" : "Effektives Verjährungsdatum"}:{" "}
                        <strong
                          className={
                            barred
                              ? "text-[color:var(--ds-danger-text)]"
                              : days <= 30
                                ? "text-[color:var(--ds-warning-text)]"
                                : "text-[color:var(--ds-text)]"
                          }
                        >
                          {sol.effective_barred_date ?? sol.regular_barred_date}
                        </strong>
                      </span>
                      {!barred && (
                        <span
                          className={
                            days <= 30 ? "font-semibold text-[color:var(--ds-warning-text)]" : ""
                          }
                        >
                          {days > 0
                            ? `${days} ${lang === "en" ? "days left" : "Tage verbleibend"}`
                            : `${Math.abs(days)} ${lang === "en" ? "days overdue" : "Tage überfällig"}`}
                        </span>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-2">
                        {/* Interruptions */}
                        {(sol.interruptions ?? []).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-[color:var(--ds-text-muted)]">
                              {lang === "en"
                                ? "Interruptions (Hemmung)"
                                : "Unterbrechungen (Hemmung)"}
                            </p>
                            <ul className="mt-1 space-y-1">
                              {(sol.interruptions ?? []).map((intr, i) => (
                                <li key={i} className="text-xs text-[color:var(--ds-text-muted)]">
                                  <strong>{intr.at}</strong> — {intr.reason}
                                  {intr.kind && <span className="ml-1">({intr.kind})</span>}
                                  {intr.note && <span className="ml-1">· {intr.note}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Suspensions */}
                        {(sol.suspensions ?? []).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-[color:var(--ds-text-muted)]">
                              {lang === "en" ? "Suspensions (Ruhen)" : "Ruhenszeiträume"}
                            </p>
                            <ul className="mt-1 space-y-1">
                              {(sol.suspensions ?? []).map((susp, i) => (
                                <li key={i} className="text-xs text-[color:var(--ds-text-muted)]">
                                  <strong>{susp.start}</strong> –{" "}
                                  {susp.end ?? (lang === "en" ? "ongoing" : "laufend")} —{" "}
                                  {susp.reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Add event form */}
                        {eventFormFor === sol.id ? (
                          <div className="space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                            <div className="flex items-center gap-2">
                              <Select
                                value={eventType}
                                onValueChange={(v) =>
                                  setEventType(v as "interruption" | "suspension")
                                }
                              >
                                <SelectTrigger className="h-8 flex-1 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="interruption">
                                    {lang === "en"
                                      ? "Interruption (Hemmung)"
                                      : "Unterbrechung (Hemmung)"}
                                  </SelectItem>
                                  <SelectItem value="suspension">
                                    {lang === "en" ? "Suspension (Ruhen)" : "Ruhen"}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 shrink-0 p-0"
                                onClick={() => setEventFormFor(null)}
                              >
                                <X size={14} />
                              </Button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Input
                                type="date"
                                value={eventDate}
                                onChange={(e) => setEventDate(e.target.value)}
                                className="h-8 text-xs"
                              />
                              {eventType === "suspension" && (
                                <Input
                                  type="date"
                                  value={eventEndDate}
                                  onChange={(e) => setEventEndDate(e.target.value)}
                                  placeholder={lang === "en" ? "End (optional)" : "Ende (optional)"}
                                  className="h-8 text-xs"
                                />
                              )}
                            </div>
                            <Input
                              value={eventReason}
                              onChange={(e) => setEventReason(e.target.value)}
                              placeholder={lang === "en" ? "Reason" : "Grund"}
                              className="h-8 text-xs"
                            />
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant="primary"
                                className="text-xs"
                                disabled={busy || !eventReason}
                                onClick={() => void handleAddEvent(sol.id)}
                              >
                                {busy ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Plus size={13} />
                                )}
                                {lang === "en" ? "Add" : "Hinzufügen"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => {
                              setEventFormFor(sol.id);
                              setEventType("interruption");
                              setEventDate(new Date().toISOString().slice(0, 10));
                              setEventEndDate("");
                              setEventReason("");
                            }}
                          >
                            <ShieldAlert size={12} />
                            {lang === "en" ? "Add event" : "Ereignis hinzufügen"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
