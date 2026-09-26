"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Loader2, Pencil, Plus, Users, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { EmptyState } from "@/components/dashboard/empty-state";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { csrfFetch } from "@/lib/csrf";
import { cn, formatDate } from "@/lib/utils";
import type { StaffMember, StaffRole, VacationAccount } from "@/lib/staff";

type StaffWithVacation = StaffMember & { vacation: VacationAccount };

const ROLE_LABEL: Record<StaffRole, string> = {
  partner: "Partner:in",
  anwalt: "Rechtsanwält:in",
  assistenz: "Assistenz",
  // Austrian term (the stored key stays for existing records).
  rechtsfachwirt: "Rechtsanwaltsanwärter:in",
  sonstige: "Sonstige",
};

const EMPTY_FORM = {
  name: "",
  email: "",
  role: "sonstige" as StaffRole,
  hired_at: "",
  contract_until: "",
  vacation_days_per_year: "25",
  vacation_carryover_days: "0",
  phone: "",
  notes: "",
};

/**
 * Personalstamm (WP-8.53): Mitarbeiterakten mit Urlaubskonto. Verbrauchte
 * und geplante Urlaubstage werden aus den Absence-Records abgeleitet
 * (Grund „Urlaub"), der Jahresanspruch kommt aus der Personalakte.
 */
export default function PersonalPage() {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [members, setMembers] = useState<StaffWithVacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StaffWithVacation | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff", { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      setMembers((data.data?.members ?? data.members ?? []) as StaffWithVacation[]);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(m: StaffWithVacation) {
    setEditing(m);
    setForm({
      name: m.name,
      email: m.email,
      role: m.role,
      hired_at: m.hired_at ?? "",
      contract_until: m.contract_until ?? "",
      vacation_days_per_year: String(m.vacation_days_per_year),
      vacation_carryover_days: String(m.vacation_carryover_days),
      phone: m.phone ?? "",
      notes: m.notes ?? "",
    });
    setFormError(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) {
      setFormError("Name und E-Mail sind erforderlich.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        hired_at: form.hired_at || undefined,
        contract_until: form.contract_until || undefined,
        vacation_days_per_year: Number(form.vacation_days_per_year) || 25,
        vacation_carryover_days: Number(form.vacation_carryover_days) || 0,
        phone: form.phone.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      const res = await csrfFetch("/api/staff", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? {
                id: editing.id,
                member: {
                  ...payload,
                  active: editing.active,
                  created_at: editing.created_at,
                  updated_at: editing.updated_at,
                },
              }
            : payload
        ),
      });
      if (!res.ok) {
        setFormError(
          res.status === 400
            ? "Bitte prüfen Sie die Eingaben (Name, E-Mail, Datumsfelder im Format JJJJ-MM-TT)."
            : "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut."
        );
        return;
      }
      addToast({
        type: "success",
        title: editing ? "Personalakte aktualisiert." : "Mitarbeiter:in angelegt.",
      });
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      void load();
    } catch {
      setFormError("Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(m: StaffWithVacation) {
    if (m.active) {
      // The personnel file is not the login account: say so before anyone
      // believes an offboarding is done.
      const ok = await confirm({
        title: `${m.name} im Personalstamm deaktivieren?`,
        message:
          "Das ändert nur die Personalakte. Ein Subsumio-Zugang dieser Person bleibt bestehen — entziehen Sie ihn unter Team → Mitglied entfernen.",
        confirmLabel: "Deaktivieren",
        variant: "danger",
      });
      if (!ok) return;
    }
    try {
      const res = await csrfFetch("/api/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: m.id,
          member: { ...m, vacation: undefined, active: !m.active },
        }),
      });
      if (!res.ok) throw new Error();
      addToast({
        type: "success",
        title: m.active
          ? `${m.name} im Personalstamm deaktiviert. Der Login-Zugang bleibt bestehen.`
          : `${m.name} reaktiviert.`,
      });
      void load();
    } catch {
      addToast({ type: "error", title: "Status konnte nicht geändert werden." });
    }
  }

  const field = (key: keyof typeof EMPTY_FORM, label: string, type = "text", hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`staff-${key}`} className="text-xs text-[color:var(--ds-text-muted)]">
        {label}
      </Label>
      <Input
        id={`staff-${key}`}
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        title={hint}
      />
    </div>
  );

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Personal"
        description="Mitarbeiterakten mit Urlaubskonto — verbrauchte und geplante Urlaubstage fließen automatisch aus den Abwesenheiten ein."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Personal" }]}
        actions={
          <PrimaryAction
            onClick={() => {
              setEditing(null);
              setForm(EMPTY_FORM);
              setFormError(null);
              setShowForm((v) => !v);
            }}
            aria-expanded={showForm}
          >
            <Plus size={14} className="mr-1.5" aria-hidden /> Mitarbeiter:in
          </PrimaryAction>
        }
      />

      {showForm && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {editing ? `Bearbeiten: ${editing.name}` : "Neue Personalakte"}
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              aria-label="Formular schließen"
              className="rounded-md p-0.5 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {field("name", "Name *")}
            {field("email", "E-Mail *", "email")}
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Rolle</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as StaffRole })}
              >
                <SelectTrigger aria-label="Rolle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {field("hired_at", "Eintritt", "date")}
            {field("contract_until", "Vertragsende (befristet)", "date")}
            {field("vacation_days_per_year", "Urlaubsanspruch (Tage/Jahr)", "number")}
            {field("vacation_carryover_days", "Resturlaub Übertrag (Tage)", "number")}
            {field("phone", "Telefon", "tel")}
          </div>
          <div className="space-y-1">
            <Label htmlFor="staff-notes" className="text-xs text-[color:var(--ds-text-muted)]">
              Notizen
            </Label>
            <Input
              id="staff-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {formError && (
            <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden />}
              {editing ? "Speichern" : "Anlegen"}
            </Button>
          </div>
        </form>
      )}

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {loadError && !loading && (
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          Mitarbeiter konnten nicht geladen werden.
          <Button variant="ghost" size="sm" onClick={() => void load()} className="ml-2">
            Erneut versuchen
          </Button>
        </div>
      )}

      {!loading && !loadError && members.length === 0 && (
        <EmptyState
          icon={Users}
          title="Noch keine Personalakten"
          description="Legen Sie die erste Mitarbeiterakte an — Urlaubskonto und Vertretungen ergeben sich daraus automatisch."
          actionLabel="Mitarbeiter:in anlegen"
          onAction={() => setShowForm(true)}
        />
      )}

      {!loading && !loadError && members.length > 0 && (
        <ul className="space-y-3">
          {members.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4",
                !m.active && "opacity-60"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">{m.name}</h3>
                    <Badge variant="default" className="text-xs">
                      {ROLE_LABEL[m.role]}
                    </Badge>
                    {!m.active && (
                      <Badge variant="default" className="text-xs">
                        inaktiv
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {m.email}
                    {m.hired_at ? ` · seit ${formatDate(m.hired_at)}` : ""}
                    {m.contract_until ? ` · befristet bis ${formatDate(m.contract_until)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(m)}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Pencil size={13} aria-hidden /> Bearbeiten
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void toggleActive(m)}
                    className="h-8 text-xs"
                  >
                    {m.active ? "Deaktivieren" : "Reaktivieren"}
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-[color:var(--ds-surface-2)] px-3 py-2 text-xs text-[color:var(--ds-text-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={13} aria-hidden />
                  Urlaub {m.vacation.year}:
                </span>
                <span>
                  Anspruch {m.vacation.entitled} · verbraucht {m.vacation.used} · geplant{" "}
                  {m.vacation.planned}
                </span>
                <span
                  className={cn(
                    "font-semibold",
                    m.vacation.remaining < 0
                      ? "text-[color:var(--ds-danger-text)]"
                      : "text-[color:var(--ds-text)]"
                  )}
                >
                  Rest {m.vacation.remaining} Tage
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
