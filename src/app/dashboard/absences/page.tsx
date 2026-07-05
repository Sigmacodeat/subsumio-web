"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarDays, UserCheck, Plus, Loader2, Plane, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { AbsenceRecord } from "@/lib/absence";
import { getAbsenceStatusBadge, isAbsenceActive } from "@/lib/absence";

export default function AbsencePage() {
  const { addToast } = useToast();
  const [absences, setAbsences] = useState<AbsenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    user_name: "",
    user_email: "",
    delegate_name: "",
    delegate_email: "",
    start_date: "",
    end_date: "",
    reason: "",
    notes: "",
  });

  const loadAbsences = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "absence_record", limit: 100 });
      const records = pages.map((p) => p.frontmatter as unknown as AbsenceRecord);
      setAbsences(records);
    } catch {
      addToast({ type: "error", title: "Fehler beim Laden" });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadAbsences();
  }, [loadAbsences]);

  async function handleCreate() {
    if (!form.user_name || !form.delegate_name || !form.start_date || !form.end_date) {
      addToast({ type: "error", title: "Bitte alle Pflichtfelder ausfüllen" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_name: form.user_name,
          user_email: form.user_email,
          delegate_name: form.delegate_name,
          delegate_email: form.delegate_email,
          start_date: form.start_date,
          end_date: form.end_date,
          reason: form.reason || undefined,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast({ type: "success", title: "Abwesenheit erstellt" });
      setShowCreate(false);
      setForm({
        user_name: "",
        user_email: "",
        delegate_name: "",
        delegate_email: "",
        start_date: "",
        end_date: "",
        reason: "",
        notes: "",
      });
      void loadAbsences();
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

  const activeCount = absences.filter((a) => isAbsenceActive(a)).length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Urlaubsvertretung"
        description="Abwesenheiten verwalten, Fristen und Rundown-Items automatisch an Vertreter weiterleiten"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Urlaubsvertretung" }]}
        actions={
          <Button onClick={() => setShowCreate(!showCreate)} className="brand-bg gap-2 text-white">
            <Plus size={16} />
            Abwesenheit planen
          </Button>
        }
      />

      {/* Active banner */}
      {activeCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-orange-600" />
          <p className="text-sm text-orange-600">
            <strong>{activeCount}</strong> Abwesenheit{activeCount > 1 ? "en" : ""} aktiv — Fristen
            und Rundown-Items werden an Vertreter weitergeleitet.
          </p>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Neue Abwesenheit</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                Abwesender Mitarbeiter *
              </Label>
              <Input
                value={form.user_name}
                onChange={(e) => setForm({ ...form, user_name: e.target.value })}
                placeholder="Max Mustermann"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">E-Mail</Label>
              <Input
                type="email"
                value={form.user_email}
                onChange={(e) => setForm({ ...form, user_email: e.target.value })}
                placeholder="max@kanzlei.de"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Vertreter *</Label>
              <Input
                value={form.delegate_name}
                onChange={(e) => setForm({ ...form, delegate_name: e.target.value })}
                placeholder="Anna Schmidt"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Vertreter E-Mail</Label>
              <Input
                type="email"
                value={form.delegate_email}
                onChange={(e) => setForm({ ...form, delegate_email: e.target.value })}
                placeholder="anna@kanzlei.de"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Von *</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Bis *</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">Grund</Label>
            <Input
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Urlaub, Krankheit, Fortbildung..."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">Notizen</Label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm text-[color:var(--ds-text)]"
              placeholder="Zusätzliche Informationen für den Vertreter..."
            />
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Abwesenheit speichern
          </Button>
        </form>
      )}

      {/* Absence list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : absences.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-16 text-center">
          <Plane size={32} className="mb-3 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm font-medium text-[color:var(--ds-text)]">
            Keine Abwesenheiten geplant
          </p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Planen Sie eine Abwesenheit, um Fristen automatisch weiterzuleiten.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {absences.map((absence) => {
            const badge = getAbsenceStatusBadge(absence);
            const active = isAbsenceActive(absence);
            return (
              <div
                key={absence.id}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-orange-500/10" : "bg-[color:var(--ds-surface-2)]"}`}
                >
                  {active ? (
                    <Plane size={14} className="text-orange-600" />
                  ) : (
                    <CalendarDays size={14} className="text-[color:var(--ds-text-muted)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)]">
                      {absence.user_name}
                    </span>
                    <Badge variant="default" className={`border text-xs ${badge.className}`}>
                      {badge.label}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
                    <UserCheck size={10} />
                    Vertreter: {absence.delegate_name}
                    <span className="mx-1">·</span>
                    {absence.start_date.split("T")[0]} → {absence.end_date.split("T")[0]}
                  </div>
                  {absence.forwarded_deadlines.length > 0 && (
                    <div className="mt-1 text-xs text-blue-600">
                      {absence.forwarded_deadlines.length} Frist(en) weitergeleitet
                    </div>
                  )}
                  {absence.reassigned_rundown_items.length > 0 && (
                    <div className="text-xs text-blue-600">
                      {absence.reassigned_rundown_items.length} Rundown-Item(s) neu zugewiesen
                    </div>
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
