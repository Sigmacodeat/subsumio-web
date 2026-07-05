"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2, GraduationCap, Clock } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { ContinuingEducationEntry } from "@/lib/fao-tracking";
import { FAO_REQUIRED_HOURS } from "@/lib/fao-tracking";

export default function FAOTrackingPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [entries, setEntries] = useState<ContinuingEducationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    lawyer_name: "",
    lawyer_email: "",
    specialist_title: "",
    date: "",
    hours: "",
    topic: "",
    provider: "",
  });

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "fao_education_entry", limit: 500 });
      setEntries(pages.map((p) => p.frontmatter as unknown as ContinuingEducationEntry));
    } catch {
      addToast({ type: "error", title: t("fao.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (
      !form.lawyer_name ||
      !form.lawyer_email ||
      !form.specialist_title ||
      !form.date ||
      !form.hours ||
      !form.topic ||
      !form.provider
    ) {
      addToast({ type: "error", title: "Pflichtfelder fehlen" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/fao-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawyer_email: form.lawyer_email,
          lawyer_name: form.lawyer_name,
          specialist_title: form.specialist_title,
          date: form.date,
          hours: Number(form.hours),
          topic: form.topic,
          provider: form.provider,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast({ type: "success", title: "Fortbildung erfasst" });
      setShowCreate(false);
      setForm({
        lawyer_name: "",
        lawyer_email: "",
        specialist_title: "",
        date: "",
        hours: "",
        topic: "",
        provider: "",
      });
      void load();
    } catch (e) {
      addToast({
        type: "error",
        title: "Fehler",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const year = new Date().getFullYear();
  const verifiedHours = entries
    .filter((e) => e.status === "verified")
    .reduce((sum, e) => sum + e.hours, 0);
  const remaining = Math.max(0, FAO_REQUIRED_HOURS - verifiedHours);
  const progress = Math.min(100, Math.round((verifiedHours / FAO_REQUIRED_HOURS) * 100));

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("fao.title")}
        description={`§ 15 FAO — ${FAO_REQUIRED_HOURS} Stunden pro Jahr und Fachanwaltsbezeichnung`}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("fao.title") }]}
        actions={
          <Button onClick={() => setShowCreate(!showCreate)} className="brand-bg gap-2 text-white">
            <Plus size={16} /> Fortbildung
          </Button>
        }
      />

      {/* Progress card */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-[color:var(--ds-text-muted)]" />
            <span className="text-sm font-medium">
              {year}: {verifiedHours} / {FAO_REQUIRED_HOURS} Stunden
            </span>
          </div>
          <Badge
            variant="default"
            className={
              remaining === 0
                ? "border-green-500/30 text-green-600"
                : remaining > 5
                  ? "border-orange-500/30 text-orange-600"
                  : ""
            }
          >
            {remaining === 0 ? "Erfüllt" : `${remaining}h offen`}
          </Badge>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
          <div
            className={`h-full transition-all ${progress === 100 ? "bg-green-500" : "bg-blue-500"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {showCreate && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <h2 className="text-sm font-semibold">Fortbildung erfassen</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Anwalt *</Label>
              <Input
                value={form.lawyer_name}
                onChange={(e) => setForm({ ...form, lawyer_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">E-Mail *</Label>
              <Input
                type="email"
                value={form.lawyer_email}
                onChange={(e) => setForm({ ...form, lawyer_email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                Fachanwaltsbezeichnung *
              </Label>
              <Input
                value={form.specialist_title}
                onChange={(e) => setForm({ ...form, specialist_title: e.target.value })}
                placeholder="Fachanwalt für Familienrecht"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Datum *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Stunden *</Label>
              <Input
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Veranstalter *</Label>
              <Input
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Thema *</Label>
              <Input
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Speichern
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-16 text-center">
          <GraduationCap size={32} className="mb-3 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm font-medium">Keine Fortbildungen erfasst</p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Erfassen Sie Fortbildungen für das § 15 FAO-Tracking.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{entry.topic}</span>
                  <Badge
                    variant="default"
                    className={`text-xs ${entry.status === "verified" ? "border-green-500/30 text-green-600" : entry.status === "rejected" ? "border-red-500/30 text-red-600" : ""}`}
                  >
                    {entry.status === "verified"
                      ? "Verifiziert"
                      : entry.status === "rejected"
                        ? "Abgelehnt"
                        : "Ausstehend"}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {entry.lawyer_name} · {entry.specialist_title} · {entry.hours}h ·{" "}
                  {entry.date.split("T")[0]}
                </div>
                <div className="text-xs text-[color:var(--ds-text-muted)]">{entry.provider}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
