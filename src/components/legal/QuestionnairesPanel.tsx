"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import {
  QUESTIONNAIRE_FIELD_TYPES,
  type Questionnaire,
  type QuestionnaireFieldType,
} from "@/lib/questionnaires";

const TYPE_LABEL: Record<QuestionnaireFieldType, string> = {
  text: "Text",
  textarea: "Langtext",
  date: "Datum",
  select: "Auswahl",
  checkbox: "Ja/Nein",
};

interface DraftField {
  label: string;
  type: QuestionnaireFieldType;
  required: boolean;
  options: string;
}

const EMPTY_FIELD: DraftField = { label: "", type: "text", required: false, options: "" };

/** Fragebögen für das Mandantenportal — Erstellung + Status/Antworten. */
export function QuestionnairesPanel({ caseSlug }: { caseSlug: string }) {
  const { addToast } = useToast();
  const [items, setItems] = useState<Questionnaire[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<DraftField[]>([{ ...EMPTY_FIELD }]);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/legal/questionnaires?case_slug=${encodeURIComponent(caseSlug)}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setItems(data.data?.questionnaires ?? []);
    } catch {
      setItems([]);
    }
  }, [caseSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setSaving(true);
    try {
      const payload = {
        case_slug: caseSlug,
        title: title.trim(),
        fields: fields
          .filter((f) => f.label.trim())
          .map((f, i) => ({
            key: `f${i + 1}`,
            label: f.label.trim(),
            type: f.type,
            required: f.required || undefined,
            options:
              f.type === "select"
                ? f.options
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean)
                : undefined,
          })),
      };
      const res = await csrfFetch("/api/legal/questionnaires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          type: "error",
          title: data.message ?? "Fragebogen konnte nicht erstellt werden",
        });
        return;
      }
      addToast({ type: "success", title: "Fragebogen für das Portal angelegt" });
      setTitle("");
      setFields([{ ...EMPTY_FIELD }]);
      setShowForm(false);
      await load();
    } catch {
      addToast({ type: "error", title: "Fragebogen konnte nicht erstellt werden" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
          <ClipboardList size={15} aria-hidden /> Portal-Fragebögen
        </h3>
        <Button size="sm" variant="secondary" onClick={() => setShowForm((s) => !s)}>
          <Plus size={13} aria-hidden /> Neuer Fragebogen
        </Button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-lg border border-[color:var(--ds-border)] p-3">
          <div className="space-y-1.5">
            <Label htmlFor="qn-title" className="text-xs">
              Titel
            </Label>
            <Input
              id="qn-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Mandats-Fragebogen"
            />
          </div>
          {fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Frage {i + 1}</Label>
                <Input
                  value={f.label}
                  onChange={(e) =>
                    setFields((prev) =>
                      prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p))
                    )
                  }
                  placeholder="Fragetext"
                />
                {f.type === "select" && (
                  <Input
                    value={f.options}
                    onChange={(e) =>
                      setFields((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, options: e.target.value } : p))
                      )
                    }
                    placeholder="Optionen, kommagetrennt"
                    aria-label={`Optionen für Frage ${i + 1}`}
                  />
                )}
              </div>
              <select
                value={f.type}
                onChange={(e) =>
                  setFields((prev) =>
                    prev.map((p, j) =>
                      j === i ? { ...p, type: e.target.value as QuestionnaireFieldType } : p
                    )
                  )
                }
                aria-label={`Typ für Frage ${i + 1}`}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-2 text-xs"
              >
                {QUESTIONNAIRE_FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {TYPE_LABEL[ft]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 pb-2 text-xs text-[color:var(--ds-text-muted)]">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) =>
                    setFields((prev) =>
                      prev.map((p, j) => (j === i ? { ...p, required: e.target.checked } : p))
                    )
                  }
                />
                Pflicht
              </label>
              <button
                onClick={() => setFields((prev) => prev.filter((_, j) => j !== i))}
                disabled={fields.length <= 1}
                aria-label={`Frage ${i + 1} entfernen`}
                className="pb-2 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)] disabled:opacity-30"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFields((prev) => [...prev, { ...EMPTY_FIELD }])}
            >
              <Plus size={13} aria-hidden /> Frage hinzufügen
            </Button>
            <Button
              size="sm"
              disabled={saving || !title.trim() || !fields.some((f) => f.label.trim())}
              onClick={() => void submit()}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              Anlegen
            </Button>
          </div>
        </div>
      )}

      {items === null ? (
        <p className="text-xs text-[color:var(--ds-text-muted)]">Laden…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Keine Fragebögen — Mandanten beantworten sie im Portal.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--ds-border)]">
          {items.map((q) => (
            <li key={q.id} className="py-2">
              <button
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setExpanded((e) => (e === q.id ? null : q.id))}
                aria-expanded={expanded === q.id}
              >
                <span className="text-sm text-[color:var(--ds-text)]">{q.title}</span>
                <Badge
                  variant={q.status === "answered" ? "success" : "attention"}
                  className="text-xs"
                >
                  {q.status === "answered" ? "Beantwortet" : "Ausstehend"}
                </Badge>
              </button>
              {expanded === q.id && (
                <dl className="mt-2 space-y-1 rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-xs">
                  {q.fields.map((f) => (
                    <div key={f.key} className="flex gap-2">
                      <dt className="w-40 shrink-0 text-[color:var(--ds-text-subtle)]">
                        {f.label}
                      </dt>
                      <dd className="min-w-0 flex-1 text-[color:var(--ds-text)]">
                        {q.answers?.[f.key] || (q.status === "answered" ? "—" : "offen")}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
