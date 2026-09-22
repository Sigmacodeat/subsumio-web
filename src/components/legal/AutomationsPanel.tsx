"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Power, Trash2, Zap } from "lucide-react";
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
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGER_TYPES,
  type AutomationAction,
  type AutomationActionType,
  type AutomationRule,
  type AutomationTriggerType,
} from "@/lib/automation-rules";

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  case_created: "Neue Akte angelegt",
  deadline_approaching: "Frist läuft bald ab",
  invoice_overdue: "Rechnung überfällig",
  document_uploaded: "Dokument hochgeladen",
  booking_created: "Termin gebucht",
};

const ACTION_LABELS: Record<AutomationActionType, string> = {
  create_task: "Aufgabe in der Akte anlegen",
  notify_kanzlei: "Kanzlei per E-Mail benachrichtigen",
  set_status: "Aktenstatus setzen",
};

interface ActionDraft {
  type: AutomationActionType;
  text: string;
  status: string;
  dueInDays: string;
}

const EMPTY_ACTION: ActionDraft = { type: "create_task", text: "", status: "", dueInDays: "" };

/** „Wenn X, dann Y"-Regeln (WP-4.17) — Verwaltung auf der Workflows-Seite. */
export function AutomationsPanel() {
  const { addToast } = useToast();
  const [rules, setRules] = useState<AutomationRule[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>("deadline_approaching");
  const [triggerDays, setTriggerDays] = useState("7");
  const [actions, setActions] = useState<ActionDraft[]>([{ ...EMPTY_ACTION }]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/automation-rules", { credentials: "same-origin" });
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

  async function mutate(body: Record<string, unknown>, successTitle: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/automation-rules", {
        method: body.method === "POST" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body.payload ?? body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || "Fehler");
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

  function updateAction(i: number, patch: Partial<ActionDraft>) {
    setActions((as) => as.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  async function create() {
    const parsedActions: AutomationAction[] = actions.map((a) => {
      const out: AutomationAction = { type: a.type };
      if (a.text.trim()) out.text = a.text.trim();
      if (a.status.trim()) out.status = a.status.trim();
      const d = parseInt(a.dueInDays, 10);
      if (d > 0) out.dueInDays = d;
      return out;
    });
    const ok = await mutate(
      {
        method: "POST",
        payload: {
          name: name.trim(),
          trigger: {
            type: triggerType,
            ...(triggerType === "deadline_approaching"
              ? { days: parseInt(triggerDays, 10) || 7 }
              : {}),
          },
          actions: parsedActions,
        },
      },
      "Automatisierung angelegt"
    );
    if (ok) {
      setCreating(false);
      setName("");
      setActions([{ ...EMPTY_ACTION }]);
    }
  }

  const createDisabled =
    busy || !name.trim() || actions.some((a) => a.type === "set_status" && !a.status.trim());

  return (
    <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
          <Zap size={15} aria-hidden /> Automatisierungen — &bdquo;Wenn X, dann Y&ldquo;
        </h2>
        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus size={13} /> Neue Regel
          </Button>
        )}
      </div>

      {creating && (
        <div className="space-y-4 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="auto-name" className="text-xs">
                Name *
              </Label>
              <Input
                id="auto-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Fristen-Eskalation"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Wenn … (Auslöser)</Label>
              <Select
                value={triggerType}
                onValueChange={(v) => setTriggerType(v as AutomationTriggerType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTOMATION_TRIGGER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {triggerType === "deadline_approaching" && (
              <div className="space-y-1">
                <Label htmlFor="auto-days" className="text-xs">
                  … innerhalb der nächsten X Tage
                </Label>
                <Input
                  id="auto-days"
                  type="number"
                  min={0}
                  max={365}
                  value={triggerDays}
                  onChange={(e) => setTriggerDays(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-[color:var(--ds-text-muted)]">
              … dann (Aktionen)
            </p>
            {actions.map((a, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
              >
                <div className="space-y-1">
                  <Label className="text-xs">Aktion {i + 1}</Label>
                  <Select
                    value={a.type}
                    onValueChange={(v) => updateAction(i, { type: v as AutomationActionType })}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTOMATION_ACTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ACTION_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {a.type === "create_task" && (
                  <>
                    <div className="min-w-48 flex-1 space-y-1">
                      <Label htmlFor={`auto-text-${i}`} className="text-xs">
                        Aufgabentext
                      </Label>
                      <Input
                        id={`auto-text-${i}`}
                        value={a.text}
                        onChange={(e) => updateAction(i, { text: e.target.value })}
                        placeholder="z. B. Frist vorbereiten"
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
                {a.type === "set_status" && (
                  <div className="min-w-48 flex-1 space-y-1">
                    <Label htmlFor={`auto-status-${i}`} className="text-xs">
                      Neuer Status *
                    </Label>
                    <Input
                      id={`auto-status-${i}`}
                      value={a.status}
                      onChange={(e) => updateAction(i, { status: e.target.value })}
                      placeholder="z. B. review"
                    />
                  </div>
                )}
                {actions.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Aktion ${i + 1} entfernen`}
                    onClick={() => setActions((as) => as.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 size={13} />
                  </Button>
                )}
              </div>
            ))}
            {actions.length < 5 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActions((as) => [...as, { ...EMPTY_ACTION }])}
              >
                <Plus size={13} /> Weitere Aktion
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" disabled={createDisabled} onClick={() => void create()}>
              {busy && <Loader2 size={13} className="animate-spin" />}
              Regel anlegen
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCreating(false)}>
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
          Aufgabe in der Akte anlegen und die Kanzlei benachrichtigen&ldquo;.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--ds-border)]">
          {rules.map((r) => (
            <li key={r.slug} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                    {r.name}
                  </span>
                  <Badge variant={r.enabled ? "success" : "default"} className="text-[10px]">
                    {r.enabled ? "aktiv" : "aus"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {TRIGGER_LABELS[r.trigger.type]}
                  {r.trigger.type === "deadline_approaching" && ` (${r.trigger.days ?? 7} Tage)`}
                  {" → "}
                  {r.actions.map((a) => ACTION_LABELS[a.type]).join(" + ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={r.enabled ? `${r.name} deaktivieren` : `${r.name} aktivieren`}
                  onClick={() =>
                    void mutate(
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
                  aria-label={`${r.name} löschen`}
                  onClick={() => void mutate({ slug: r.slug, delete: true }, "Regel gelöscht")}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
