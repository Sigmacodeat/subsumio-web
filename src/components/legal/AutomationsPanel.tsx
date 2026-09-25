"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Power, RotateCcw, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/components/ui/toast";
import {
  CASE_STATUS_LABELS,
  CASE_STATUS_VALUES,
  DEFAULT_DUE_SOON_DAYS,
  MAX_ACTIONS,
  TRIGGER_ACTION_LABELS,
  TRIGGER_ACTION_TYPES,
  TRIGGER_EVENTS,
  TRIGGER_EVENT_LABELS,
  describeRule,
  validateActions,
  type AutomationAction,
  type AutomationRule,
  type TriggerActionType,
  type TriggerEvent,
} from "@/lib/automation-model";
import { WORKFLOW_TEMPLATES } from "@/lib/workflow";
import { formatDateTime } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";

/** Eine Regel, wie /api/automations sie liefert. */
export interface AutomationRuleView extends AutomationRule {
  status_message?: string;
  owner_name?: string;
  pending_migration?: boolean;
}

interface ActionDraft {
  type: TriggerActionType;
  title: string;
  message: string;
  recipient: string;
  assignee: string;
  dueInDays: string;
  workflowTemplateId: string;
  status: string;
}

const EMPTY_ACTION: ActionDraft = {
  type: "create_task",
  title: "",
  message: "",
  recipient: "",
  assignee: "",
  dueInDays: "",
  workflowTemplateId: "",
  status: "",
};

function toDraft(a: AutomationAction): ActionDraft {
  return {
    type: a.type,
    title: a.title ?? "",
    message: a.message ?? "",
    recipient: a.recipient ?? "",
    assignee: a.assignee ?? "",
    dueInDays: a.due_in_days !== undefined ? String(a.due_in_days) : "",
    workflowTemplateId: a.workflow_template_id ?? "",
    status: a.status ?? "",
  };
}

/** Nur die Felder, die zur Aktion gehören — leere fallen weg. */
export function draftToAction(d: ActionDraft): AutomationAction {
  const out: AutomationAction = { type: d.type };
  const t = d.title.trim();
  const m = d.message.trim();
  if (d.type === "create_task") {
    if (t) out.title = t;
    if (d.assignee.trim()) out.assignee = d.assignee.trim();
    const days = parseInt(d.dueInDays, 10);
    if (days > 0) out.due_in_days = days;
  } else if (d.type === "notify") {
    if (t) out.title = t;
    if (m) out.message = m;
  } else if (d.type === "send_mail") {
    if (d.recipient.trim()) out.recipient = d.recipient.trim();
    if (t) out.title = t;
    if (m) out.message = m;
  } else if (d.type === "start_workflow") {
    if (d.workflowTemplateId) out.workflow_template_id = d.workflowTemplateId;
    if (m) out.message = m;
  } else if (d.type === "set_status") {
    if (d.status) out.status = d.status;
  }
  return out;
}

interface FormState {
  /** Slug beim Bearbeiten, null beim Anlegen. */
  slug: string | null;
  name: string;
  event: TriggerEvent;
  withinDays: string;
  actions: ActionDraft[];
}

const NEW_FORM: FormState = {
  slug: null,
  name: "",
  event: "deadline.due_soon",
  withinDays: String(DEFAULT_DUE_SOON_DAYS),
  actions: [{ ...EMPTY_ACTION }],
};

function ruleToForm(r: AutomationRuleView): FormState {
  return {
    slug: r.slug,
    name: r.name,
    event: r.event,
    withinDays: String(r.within_days ?? DEFAULT_DUE_SOON_DAYS),
    actions: r.actions.map(toDraft),
  };
}

function RuleState({ r }: { r: AutomationRuleView }) {
  if (r.pending_migration) {
    return (
      <Badge variant="info" className="text-[10px]">
        wird übernommen
      </Badge>
    );
  }
  if (!r.enabled) {
    return (
      <Badge variant="default" className="text-[10px]">
        aus
      </Badge>
    );
  }
  if (r.paused_reason) {
    return (
      <Badge variant="warning" className="text-[10px]">
        pausiert
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="text-[10px]">
      aktiv
    </Badge>
  );
}

/** „Wenn X, dann Y"-Regeln (WP-4.17) — Verwaltung auf der Workflows-Seite. */
export function AutomationsPanel() {
  const { addToast } = useToast();
  const [rules, setRules] = useState<AutomationRuleView[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/automations", { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRules(data.data?.rules ?? []);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(
    method: "POST" | "PATCH" | "DELETE",
    payload: Record<string, unknown>,
    successTitle: string
  ): Promise<boolean> {
    setBusy(true);
    try {
      const res = await csrfFetch("/api/automations", {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || "Fehler");
      addToast({ type: "success", title: successTitle });
      await load();
      return true;
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Aktion fehlgeschlagen",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function patchForm(patch: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
  }

  function updateAction(i: number, patch: Partial<ActionDraft>) {
    setForm((f) =>
      f ? { ...f, actions: f.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) } : f
    );
  }

  const formActions = form ? form.actions.map(draftToAction) : [];
  const formProblem = form ? validateActions(formActions) : null;

  async function submit() {
    if (!form) return;
    const days = parseInt(form.withinDays, 10);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      event: form.event,
      actions: formActions,
      ...(form.event === "deadline.due_soon"
        ? { within_days: Number.isFinite(days) && days >= 0 ? days : DEFAULT_DUE_SOON_DAYS }
        : {}),
    };
    const ok = form.slug
      ? await send("PATCH", { slug: form.slug, ...payload }, "Regel gespeichert")
      : await send("POST", payload, "Automatisierung angelegt");
    if (ok) setForm(null);
  }

  const submitDisabled = busy || !form?.name.trim() || !!formProblem;

  return (
    <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
          <Zap size={15} aria-hidden /> Automatisierungen — &bdquo;Wenn X, dann Y&ldquo;
        </h2>
        {!form && (
          <Button size="sm" variant="outline" onClick={() => setForm({ ...NEW_FORM })}>
            <Plus size={13} /> Neue Regel
          </Button>
        )}
      </div>

      {form && (
        <div className="space-y-4 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="auto-name" className="text-xs">
                Name *
              </Label>
              <Input
                id="auto-name"
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
                placeholder="z. B. Fristen-Eskalation"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Wenn … (Auslöser)</Label>
              <Select
                value={form.event}
                onValueChange={(v) => patchForm({ event: v as TriggerEvent })}
              >
                <SelectTrigger aria-label="Auslöser">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_EVENTS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TRIGGER_EVENT_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.event === "deadline.due_soon" && (
              <div className="space-y-1">
                <Label htmlFor="auto-days" className="text-xs">
                  … innerhalb der nächsten X Tage
                </Label>
                <Input
                  id="auto-days"
                  type="number"
                  min={0}
                  max={365}
                  value={form.withinDays}
                  onChange={(e) => patchForm({ withinDays: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-[color:var(--ds-text-muted)]">
              … dann (Aktionen)
            </p>
            {form.actions.map((a, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
              >
                <div className="space-y-1">
                  <Label className="text-xs">Aktion {i + 1}</Label>
                  <Select
                    value={a.type}
                    onValueChange={(v) => updateAction(i, { type: v as TriggerActionType })}
                  >
                    <SelectTrigger className="w-56" aria-label={`Aktion ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_ACTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TRIGGER_ACTION_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {a.type === "send_mail" && (
                  <div className="min-w-48 flex-1 space-y-1">
                    <Label htmlFor={`auto-recipient-${i}`} className="text-xs">
                      Empfänger *
                    </Label>
                    <Input
                      id={`auto-recipient-${i}`}
                      value={a.recipient}
                      onChange={(e) => updateAction(i, { recipient: e.target.value })}
                      placeholder="z. B. buchhaltung@kanzlei.at"
                    />
                  </div>
                )}

                {(a.type === "create_task" || a.type === "notify" || a.type === "send_mail") && (
                  <div className="min-w-48 flex-1 space-y-1">
                    <Label htmlFor={`auto-title-${i}`} className="text-xs">
                      {a.type === "create_task"
                        ? "Aufgabentext"
                        : a.type === "send_mail"
                          ? "Betreff"
                          : "Titel"}
                    </Label>
                    <Input
                      id={`auto-title-${i}`}
                      value={a.title}
                      onChange={(e) => updateAction(i, { title: e.target.value })}
                      placeholder={
                        a.type === "create_task" ? "z. B. Frist vorbereiten" : "z. B. {title}"
                      }
                    />
                  </div>
                )}

                {(a.type === "notify" || a.type === "send_mail" || a.type === "start_workflow") && (
                  <div className="min-w-48 flex-1 space-y-1">
                    <Label htmlFor={`auto-message-${i}`} className="text-xs">
                      {a.type === "start_workflow" ? "Auftrag (optional)" : "Text (optional)"}
                    </Label>
                    <Input
                      id={`auto-message-${i}`}
                      value={a.message}
                      onChange={(e) => updateAction(i, { message: e.target.value })}
                    />
                  </div>
                )}

                {a.type === "create_task" && (
                  <>
                    <div className="w-40 space-y-1">
                      <Label htmlFor={`auto-assignee-${i}`} className="text-xs">
                        Zuständig
                      </Label>
                      <Input
                        id={`auto-assignee-${i}`}
                        value={a.assignee}
                        onChange={(e) => updateAction(i, { assignee: e.target.value })}
                      />
                    </div>
                    <div className="w-32 space-y-1">
                      <Label htmlFor={`auto-due-${i}`} className="text-xs">
                        Fällig in Tagen
                      </Label>
                      <Input
                        id={`auto-due-${i}`}
                        type="number"
                        min={1}
                        max={365}
                        value={a.dueInDays}
                        onChange={(e) => updateAction(i, { dueInDays: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {a.type === "start_workflow" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Workflow-Vorlage *</Label>
                    <Select
                      value={a.workflowTemplateId}
                      onValueChange={(v) => updateAction(i, { workflowTemplateId: v })}
                    >
                      <SelectTrigger className="w-56" aria-label="Workflow-Vorlage">
                        <SelectValue placeholder="Vorlage wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKFLOW_TEMPLATES.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {a.type === "set_status" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Neuer Status *</Label>
                    <Select value={a.status} onValueChange={(v) => updateAction(i, { status: v })}>
                      <SelectTrigger className="w-48" aria-label="Neuer Status">
                        <SelectValue placeholder="Status wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {CASE_STATUS_VALUES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {CASE_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {form.actions.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Aktion ${i + 1} entfernen`}
                    onClick={() =>
                      patchForm({ actions: form.actions.filter((_, idx) => idx !== i) })
                    }
                  >
                    <Trash2 size={13} />
                  </Button>
                )}
              </div>
            ))}
            {form.actions.length < MAX_ACTIONS && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => patchForm({ actions: [...form.actions, { ...EMPTY_ACTION }] })}
              >
                <Plus size={13} /> Weitere Aktion
              </Button>
            )}
          </div>

          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Beim Speichern werden Sie Besitzer: die Regel läuft mit Ihren Aktenrechten und reagiert
            nur auf Ereignisse ab jetzt — Bestehendes löst nichts aus. Platzhalter wie {"{title}"}{" "}
            werden aus dem Ereignis befüllt.
          </p>
          {form.name.trim() && formProblem && (
            <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
              {formProblem}
            </p>
          )}

          <div className="flex gap-2">
            <Button size="sm" disabled={submitDisabled} onClick={() => void submit()}>
              {busy && <Loader2 size={13} className="animate-spin" />}
              {form.slug ? "Regel speichern" : "Regel anlegen"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setForm(null)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
          Automatisierungen konnten nicht geladen werden.
        </p>
      ) : rules === null ? (
        <p className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
          <Loader2 size={13} className="animate-spin" /> Laden…
        </p>
      ) : rules.length === 0 ? (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Keine Automatisierungen. Beispiel: &bdquo;Wenn eine Frist in 7 Tagen abläuft, dann eine
          Aufgabe in der Akte anlegen und eine Benachrichtigung schicken&ldquo;.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--ds-border)]">
          {rules.map((r) => (
            <li key={r.slug} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                    {r.name}
                  </span>
                  <RuleState r={r} />
                </div>
                <p className="text-xs text-[color:var(--ds-text-muted)]">{describeRule(r)}</p>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {r.owner_user_id
                    ? `Besitzer: ${r.owner_name ?? "unbekannt"}`
                    : r.pending_migration
                      ? `Angelegt von ${r.created_by || "unbekannt"}`
                      : "Kein Besitzer — läuft kanzleiweit"}
                  {r.active_since &&
                    ` · reagiert auf Ereignisse ab ${formatDateTime(r.active_since)}`}
                  {" · "}
                  {r.last_run_at
                    ? `zuletzt ausgeführt ${formatDateTime(r.last_run_at)}`
                    : "noch nicht ausgeführt"}
                </p>
                {r.pending_migration && (
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    Diese Regel wird beim nächsten Lauf übernommen und reagiert dann nur auf neue
                    Ereignisse.
                  </p>
                )}
                {r.status_message && (
                  <p className="flex items-center gap-1 text-xs text-[color:var(--ds-warning-text)]">
                    <AlertTriangle size={12} aria-hidden /> {r.status_message}
                  </p>
                )}
                {r.last_error && (
                  <p className="text-xs text-[color:var(--ds-danger-text)]">
                    Letzter Fehler
                    {r.last_error_at ? ` (${formatDateTime(r.last_error_at)})` : ""}: {r.last_error}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {r.paused_reason && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void send("PATCH", { slug: r.slug }, "Regel neu gespeichert — läuft wieder")
                    }
                  >
                    <RotateCcw size={13} /> Neu speichern
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={r.enabled ? `${r.name} deaktivieren` : `${r.name} aktivieren`}
                  onClick={() =>
                    void send(
                      "PATCH",
                      { slug: r.slug, enabled: !r.enabled },
                      r.enabled ? "Regel deaktiviert" : "Regel aktiviert"
                    )
                  }
                >
                  <Power size={13} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`${r.name} bearbeiten`}
                  onClick={() => setForm(ruleToForm(r))}
                >
                  <Pencil size={13} />
                </Button>
                {confirmDelete === r.slug ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setConfirmDelete(null);
                      void send("DELETE", { slug: r.slug }, "Regel gelöscht");
                    }}
                  >
                    Wirklich löschen
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`${r.name} löschen`}
                    onClick={() => setConfirmDelete(r.slug)}
                  >
                    <Trash2 size={13} />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
