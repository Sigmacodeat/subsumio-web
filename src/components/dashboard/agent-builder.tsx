"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  Plus,
  Search,
  Trash2,
  Copy,
  Play,
  Save,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  GripVertical,
  ChevronDown,
  ChevronUp,
  FileText,
  Zap,
  Edit3,
  Wand2,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAgentTemplates,
  useCreateAgentTemplate,
  useUpdateAgentTemplate,
  useDeleteAgentTemplate,
  useRunAgentTemplate,
  SPECIALISTS,
  AGENT_ROLES,
  type AgentRole,
  type AgentTemplate,
  type AgentStep,
  type AgentTemplateInput,
} from "@/lib/queries/agent-templates";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────

interface BuilderForm {
  name: string;
  description: string;
  model: string;
  role: AgentRole | "";
  prompt_template: string;
  steps: AgentStep[];
  playbook_ref: string;
  force_specialists: string[];
  skip_critic: boolean;
}

const EMPTY_FORM: BuilderForm = {
  name: "",
  description: "",
  model: "",
  role: "",
  prompt_template: "",
  steps: [],
  playbook_ref: "",
  force_specialists: [],
  skip_critic: false,
};

function templateToForm(t: AgentTemplate): BuilderForm {
  return {
    name: t.name,
    description: t.description ?? "",
    model: t.model ?? "",
    role: t.role ?? "",
    prompt_template: t.prompt_template,
    steps: t.steps ?? [],
    playbook_ref: t.playbook_ref ?? "",
    force_specialists: t.force_specialists ?? [],
    skip_critic: t.skip_critic ?? false,
  };
}

/** Fachbezeichnung einer Teilaufgabe; interne Kennungen erscheinen nie roh. */
function specialistLabel(value: string): string {
  return SPECIALISTS.find((s) => s.value === value)?.label ?? "Teilaufgabe";
}

function formToInput(form: BuilderForm): AgentTemplateInput {
  return {
    name: form.name,
    description: form.description,
    model: form.model || undefined,
    role: form.role || undefined,
    prompt_template: form.prompt_template,
    steps: form.steps.length > 0 ? form.steps : undefined,
    playbook_ref: form.playbook_ref || undefined,
    force_specialists: form.force_specialists.length > 0 ? form.force_specialists : undefined,
    skip_critic: form.skip_critic,
  };
}

// ── Step Editor ───────────────────────────────────────────────

function StepEditor({
  steps,
  onChange,
}: {
  steps: AgentStep[];
  onChange: (steps: AgentStep[]) => void;
}) {
  const addStep = () => {
    const newStep: AgentStep = {
      id: `step-${Date.now()}`,
      specialist: "legal-researcher",
      prompt: "",
    };
    onChange([...steps, newStep]);
  };

  const updateStep = (idx: number, patch: Partial<AgentStep>) => {
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeStep = (idx: number) => {
    onChange(steps.filter((_, i) => i !== idx));
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    const next = [...steps];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {steps.length === 0 && (
        <div className="rounded-lg border border-dashed border-[color:var(--ds-border)] py-6 text-center">
          <Zap size={20} className="mx-auto mb-2 text-[color:var(--ds-border)]" />
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Keine Schritte festgelegt — der Assistent teilt die Aufgabe selbst auf.
          </p>
        </div>
      )}

      {steps.map((step, idx) => (
        <div
          key={step.id}
          className="space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <GripVertical
              size={14}
              className="shrink-0 text-[color:var(--ds-text-subtle)]"
              aria-hidden="true"
            />
            <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
              {idx + 1}.
            </span>
            <select
              aria-label={`Fachbereich für Schritt ${idx + 1}`}
              value={step.specialist}
              onChange={(e) => updateStep(idx, { specialist: e.target.value })}
              className="focus:brand-border min-w-0 flex-1 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            >
              {SPECIALISTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {idx > 0 && (
              <select
                value={step.depends_on ?? ""}
                onChange={(e) =>
                  updateStep(idx, {
                    depends_on: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="focus:brand-border w-28 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                aria-label={`Reihenfolge für Schritt ${idx + 1}`}
              >
                <option value="">Gleichzeitig</option>
                {steps.slice(0, idx).map((_, i) => (
                  <option key={i} value={i}>
                    Nach Schritt {i + 1}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => moveStep(idx, -1)}
              disabled={idx === 0}
              aria-label={`Schritt ${idx + 1} nach oben`}
              className="rounded p-1 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-[0.99] disabled:opacity-30 motion-reduce:transition-none"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => moveStep(idx, 1)}
              disabled={idx === steps.length - 1}
              aria-label={`Schritt ${idx + 1} nach unten`}
              className="rounded p-1 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-[0.99] disabled:opacity-30 motion-reduce:transition-none"
            >
              <ChevronDown size={14} />
            </button>
            <button
              onClick={() => removeStep(idx)}
              aria-label="Schritt entfernen"
              className="rounded p-1 text-[color:var(--ds-danger-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)] active:scale-[0.99] motion-reduce:transition-none"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <textarea
            value={step.prompt}
            onChange={(e) => updateStep(idx, { prompt: e.target.value })}
            placeholder="Anweisung für diesen Schritt …"
            aria-label={`Anweisung für Schritt ${idx + 1}`}
            rows={2}
            className="focus:brand-border w-full resize-y rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
        </div>
      ))}

      <button
        onClick={addStep}
        className="hover:brand-border flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[color:var(--ds-border)] px-3 py-2 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-[color:var(--ds-text)] active:scale-[0.99] motion-reduce:transition-none"
      >
        <Plus size={14} aria-hidden="true" />
        Schritt hinzufügen
      </button>
    </div>
  );
}

// ── Template Card ─────────────────────────────────────────────

function TemplateCard({
  template,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onRun,
  isRunning,
}: {
  template: AgentTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRun: () => void;
  isRunning: boolean;
}) {
  const confirm = useConfirm();
  const stepCount = template.steps?.length ?? 0;
  const roleLabel = template.role
    ? (AGENT_ROLES.find((r) => r.value === template.role)?.label ?? null)
    : null;

  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      className={cn(
        "w-full cursor-pointer rounded-lg border p-3 text-left transition-[background-color,border-color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
        isSelected
          ? "brand-soft brand-border"
          : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-border-strong)]"
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-[color:var(--ds-text)]">
          {template.name}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            disabled={isRunning}
            className="rounded-md p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-40 motion-reduce:transition-none"
            aria-label={`${template.name} ausführen`}
          >
            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="rounded-md p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                aria-label={`Weitere Aktionen für ${template.name}`}
              >
                <MoreHorizontal size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={onEdit}>
                <Edit3 size={13} className="mr-2" aria-hidden="true" />
                Bearbeiten
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDuplicate}>
                <Copy size={13} className="mr-2" aria-hidden="true" />
                Duplizieren
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-[color:var(--ds-danger-text)]"
                onSelect={async () => {
                  const ok = await confirm({
                    title: "Vorlage löschen?",
                    message: `„${template.name}" wird gelöscht. Bereits gestartete Aufträge bleiben erhalten.`,
                    confirmLabel: "Löschen",
                    variant: "danger",
                  });
                  if (ok) onDelete();
                }}
              >
                <Trash2 size={13} className="mr-2" aria-hidden="true" />
                Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {template.description && (
        <p className="mb-2 line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
          {template.description}
        </p>
      )}
      {(roleLabel || stepCount > 0) && (
        <p className="text-xs text-[color:var(--ds-text-subtle)]">
          {[
            roleLabel,
            stepCount > 0 ? `${stepCount} ${stepCount === 1 ? "Schritt" : "Schritte"}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

// ── Run Dialog ────────────────────────────────────────────────

function RunDialog({
  template,
  onClose,
  onRun,
  isRunning,
}: {
  template: AgentTemplate;
  onClose: () => void;
  onRun: (input?: string) => void;
  isRunning: boolean;
}) {
  const [input, setInput] = useState("");

  // A11y: self-contained modal behavior (autofocus on open, Escape to close,
  // Tab focus trap, focus restoration on close) — this component mounts only
  // while the dialog is open.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
  }, [onClose]);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Backdrop click-to-close; keyboard users close via Escape or the close button.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-run-dialog-title"
        className="w-full max-w-lg space-y-4 rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-[var(--ds-shadow-3)]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3
              id="agent-run-dialog-title"
              className="text-base font-semibold text-[color:var(--ds-text)]"
            >
              Vorlage ausführen
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Dialog schließen"
            className="rounded-md p-1 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-[0.99] motion-reduce:transition-none"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          <span className="font-medium text-[color:var(--ds-text)]">{template.name}</span> wird als
          neuer Auftrag gestartet. Optional können Sie ergänzende Angaben mitgeben, etwa die
          betroffene Akte oder Schwerpunkte.
        </p>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Optionale Angaben zum Auftrag …"
          aria-label="Optionale Angaben zum Auftrag"
          rows={4}
          className="focus:brand-border w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-[0.99] motion-reduce:transition-none"
          >
            Abbrechen
          </button>
          <button
            onClick={() => onRun(input.trim() || undefined)}
            disabled={isRunning}
            className="brand-bg flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99] disabled:opacity-40 motion-reduce:transition-none"
          >
            {isRunning ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            Starten
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Agent Builder Component ──────────────────────────────

export function AgentBuilder({ onRunComplete }: { onRunComplete?: (jobId: number) => void }) {
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<BuilderForm>(EMPTY_FORM);
  const [isNew, setIsNew] = useState(false);
  const [runTarget, setRunTarget] = useState<AgentTemplate | null>(null);
  const [_runInput, setRunInput] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const templatesQuery = useAgentTemplates(search);
  const createMutation = useCreateAgentTemplate();
  const updateMutation = useUpdateAgentTemplate();
  const deleteMutation = useDeleteAgentTemplate();
  const runMutation = useRunAgentTemplate();

  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const selected = useMemo(
    () => templates.find((t) => t.slug === selectedSlug) ?? null,
    [templates, selectedSlug]
  );

  // Auto-clear success message
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  // Sync form when selecting a template (non-editing mode)
  useEffect(() => {
    if (selected && !editing && !isNew) {
      setForm(templateToForm(selected));
    }
  }, [selected, editing, isNew]);

  const handleNew = useCallback(() => {
    setIsNew(true);
    setEditing(true);
    setSelectedSlug(null);
    setForm(EMPTY_FORM);
    setError(null);
  }, []);

  const handleEdit = useCallback(() => {
    if (!selected) return;
    setForm(templateToForm(selected));
    setIsNew(false);
    setEditing(true);
    setError(null);
  }, [selected]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setIsNew(false);
    setError(null);
    if (selected) {
      setForm(templateToForm(selected));
    } else {
      setForm(EMPTY_FORM);
    }
  }, [selected]);

  const handleSave = useCallback(async () => {
    setError(null);
    if (!form.name.trim()) {
      setError("Bitte geben Sie einen Namen ein.");
      return;
    }
    if (!form.prompt_template.trim()) {
      setError("Bitte beschreiben Sie die Arbeitsanweisung.");
      return;
    }
    try {
      if (isNew) {
        const result = await createMutation.mutateAsync(formToInput(form));
        setSuccessMsg("Vorlage angelegt");
        setEditing(false);
        setIsNew(false);
        setSelectedSlug(result.slug);
      } else if (selected) {
        await updateMutation.mutateAsync({ slug: selected.slug, ...formToInput(form) });
        setSuccessMsg("Vorlage gespeichert");
        setEditing(false);
      }
    } catch (err) {
      console.error("[agent-builder] save failed:", err instanceof Error ? err.message : err);
      setError("Speichern nicht möglich. Bitte versuchen Sie es erneut.");
    }
  }, [form, isNew, selected, createMutation, updateMutation]);

  const handleDuplicate = useCallback(
    async (template: AgentTemplate) => {
      try {
        const dupInput: AgentTemplateInput = {
          ...formToInput(templateToForm(template)),
          name: `${template.name} (Kopie)`,
        };
        const result = await createMutation.mutateAsync(dupInput);
        setSuccessMsg("Vorlage dupliziert");
        setSelectedSlug(result.slug);
      } catch (err) {
        console.error(
          "[agent-builder] duplicate failed:",
          err instanceof Error ? err.message : err
        );
        setError("Duplizieren nicht möglich. Bitte versuchen Sie es erneut.");
      }
    },
    [createMutation]
  );

  const handleDelete = useCallback(
    async (slug: string) => {
      try {
        await deleteMutation.mutateAsync(slug);
        if (selectedSlug === slug) {
          setSelectedSlug(null);
          setForm(EMPTY_FORM);
          setEditing(false);
          setIsNew(false);
        }
        setSuccessMsg("Vorlage gelöscht");
      } catch (err) {
        console.error("[agent-builder] delete failed:", err instanceof Error ? err.message : err);
        setError("Löschen nicht möglich. Bitte versuchen Sie es erneut.");
      }
    },
    [deleteMutation, selectedSlug]
  );

  const handleRun = useCallback(
    async (template: AgentTemplate, input?: string) => {
      setRunError(null);
      try {
        const result = await runMutation.mutateAsync({ slug: template.slug, input });
        setRunTarget(null);
        setRunInput(undefined);
        if (result.jobId && onRunComplete) {
          onRunComplete(result.jobId);
        }
        setSuccessMsg(`Auftrag Nr. ${result.jobId} gestartet`);
      } catch (err) {
        console.error("[agent-builder] run failed:", err instanceof Error ? err.message : err);
        setRunError("Der Auftrag konnte nicht gestartet werden. Bitte versuchen Sie es erneut.");
      }
    },
    [runMutation, onRunComplete]
  );

  const handleRunClick = useCallback((template: AgentTemplate) => {
    setRunTarget(template);
    setRunInput(undefined);
    setRunError(null);
  }, []);

  const savePending = createMutation.isPending || updateMutation.isPending;
  const isRunning = runMutation.isPending;

  const editTemplate = useCallback((template: AgentTemplate) => {
    setSelectedSlug(template.slug);
    setForm(templateToForm(template));
    setIsNew(false);
    setEditing(true);
    setError(null);
  }, []);

  const label = "text-xs font-medium text-[color:var(--ds-text-muted)]";
  const control =
    "w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1";
  const sectionTitle =
    "text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase";

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      {/* Links: Vorlagenliste */}
      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className={sectionTitle}>Vorlagen</h2>
          <button
            type="button"
            onClick={handleNew}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
          >
            <Plus size={14} aria-hidden="true" />
            Neue Vorlage
          </button>
        </div>
        <div className="relative">
          <Search
            size={14}
            className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Vorlagen durchsuchen …"
            aria-label="Vorlagen durchsuchen"
            className={cn(control, "py-1.5 pl-8 text-xs")}
          />
        </div>

        <div className="space-y-1.5">
          {templatesQuery.isLoading && templates.length === 0 && (
            <div className="space-y-2" role="status" aria-label="Wird geladen">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {templatesQuery.error && (
            <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-3 text-xs text-[color:var(--ds-danger-text)]">
              <AlertCircle size={14} aria-hidden="true" />
              Vorlagen konnten nicht geladen werden. Bitte laden Sie die Seite neu.
            </div>
          )}

          {!templatesQuery.isLoading && !templatesQuery.error && templates.length === 0 && (
            <p className="rounded-lg border border-dashed border-[color:var(--ds-border-strong)] px-3 py-4 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              {search
                ? "Keine Vorlage passt zu Ihrer Suche."
                : "Noch keine Vorlagen. Legen Sie wiederkehrende Aufträge einmal an und starten Sie sie danach mit einem Klick."}
            </p>
          )}

          {templates.map((template) => (
            <TemplateCard
              key={template.slug}
              template={template}
              isSelected={selectedSlug === template.slug}
              onSelect={() => {
                setSelectedSlug(template.slug);
                setEditing(false);
                setIsNew(false);
              }}
              onEdit={() => editTemplate(template)}
              onDuplicate={() => handleDuplicate(template)}
              onDelete={() => handleDelete(template.slug)}
              onRun={() => handleRunClick(template)}
              isRunning={isRunning && runTarget?.slug === template.slug}
            />
          ))}
        </div>
      </div>

      {/* Rechts: Bearbeiten / Ansicht */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-base font-semibold text-[color:var(--ds-text)]">
            {editing
              ? isNew
                ? "Neue Vorlage"
                : "Vorlage bearbeiten"
              : selected
                ? selected.name
                : "Vorlage auswählen"}
          </h2>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={savePending}>
                  Abbrechen
                </Button>
                <Button size="sm" onClick={handleSave} disabled={savePending}>
                  {savePending ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Save size={14} aria-hidden="true" />
                  )}
                  Speichern
                </Button>
              </>
            ) : selected ? (
              <>
                <Button variant="secondary" size="sm" onClick={handleEdit}>
                  <Edit3 size={14} aria-hidden="true" />
                  Bearbeiten
                </Button>
                <Button size="sm" onClick={() => handleRunClick(selected)} disabled={isRunning}>
                  {isRunning ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Play size={14} aria-hidden="true" />
                  )}
                  Ausführen
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]"
          >
            <AlertCircle size={13} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && !error && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-3 py-2 text-xs text-[color:var(--ds-success-text)]"
          >
            <CheckCircle size={13} aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}

        {!editing && !selected && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] px-6 py-14 text-center">
            <Wand2
              size={28}
              className="mb-3 text-[color:var(--ds-text-subtle)]"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-[color:var(--ds-text)]">
              Wiederkehrende Aufträge als Vorlage
            </p>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              Legen Sie Arbeitsanweisung und Arbeitsschritte einmal fest und starten Sie den Auftrag
              danach mit einem Klick.
            </p>
            <Button size="sm" className="mt-5" onClick={handleNew}>
              <Plus size={14} aria-hidden="true" />
              Vorlage anlegen
            </Button>
          </div>
        )}

        {editing && (
          <div className="max-w-2xl space-y-5 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 md:p-5">
            <div className="space-y-1.5">
              <label htmlFor="ab-name" className={label}>
                Name <span className="text-[color:var(--ds-danger-text)]">*</span>
              </label>
              <input
                id="ab-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z. B. Mietvertrag prüfen"
                className={control}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ab-desc" className={label}>
                Beschreibung
              </label>
              <input
                id="ab-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Wofür die Vorlage gedacht ist"
                className={control}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ab-role" className={label}>
                Art der Aufgabe
              </label>
              <select
                id="ab-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as AgentRole | "" })}
                className={control}
              >
                <option value="">Automatisch (aus dem Namen)</option>
                {AGENT_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.description}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">
                Bestimmt, unter welcher Kategorie Ergebnisse in Berichten erscheinen.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ab-prompt" className={label}>
                Arbeitsanweisung <span className="text-[color:var(--ds-danger-text)]">*</span>
              </label>
              <textarea
                id="ab-prompt"
                value={form.prompt_template}
                onChange={(e) => setForm({ ...form, prompt_template: e.target.value })}
                placeholder="Beschreiben Sie, was der Assistent tun soll, z. B.: Mietvertrag auf unzulässige Klauseln nach MRG prüfen und Fristen notieren."
                rows={7}
                className={cn(control, "resize-y")}
              />
              <p className="text-xs text-[color:var(--ds-text-subtle)]">
                Mit {"{{eingabe}}"} fügen Sie die Angaben ein, die beim Start mitgegeben werden.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={label}>Arbeitsschritte</span>
                <span className="text-xs text-[color:var(--ds-text-subtle)]">
                  Optional — ohne Schritte teilt der Assistent die Aufgabe selbst auf
                </span>
              </div>
              <StepEditor steps={form.steps} onChange={(steps) => setForm({ ...form, steps })} />
            </div>

            <fieldset className="space-y-1.5">
              <legend className={label}>Fachbereiche fest einbinden</legend>
              <div className="flex flex-wrap gap-2">
                {SPECIALISTS.map((s) => {
                  const active = form.force_specialists.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        const next = active
                          ? form.force_specialists.filter((v) => v !== s.value)
                          : [...form.force_specialists, s.value];
                        setForm({ ...form, force_specialists: next });
                      }}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-[background-color,border-color,color] duration-[var(--ds-duration-fast)] motion-reduce:transition-none",
                        active
                          ? "brand-soft brand-text brand-border"
                          : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                      )}
                      title={s.description}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">
                Gewählte Fachbereiche werden immer eingebunden; festgelegte Arbeitsschritte
                entfallen dann.
              </p>
            </fieldset>

            <div className="space-y-1.5">
              <label htmlFor="ab-playbook" className={label}>
                Playbook (optional)
              </label>
              <div className="relative">
                <FileText
                  size={14}
                  className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
                  aria-hidden="true"
                />
                <input
                  id="ab-playbook"
                  value={form.playbook_ref}
                  onChange={(e) => setForm({ ...form, playbook_ref: e.target.value })}
                  placeholder="z. B. playbooks/vertrags-review"
                  className={cn(control, "pl-8")}
                />
              </div>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">
                Kennung eines Playbooks aus dem Kanzleiwissen, das als zusätzliche Vorgabe dient.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={!form.skip_critic}
                aria-labelledby="ab-critic-label"
                onClick={() => setForm({ ...form, skip_critic: !form.skip_critic })}
                className={cn(
                  "relative mt-0.5 h-5 w-10 shrink-0 rounded-full transition-[background-color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                  !form.skip_critic ? "brand-bg" : "bg-[color:var(--ds-border-strong)]"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-[color:var(--ds-surface)] transition-[left] duration-[var(--ds-duration-fast)] motion-reduce:transition-none",
                    !form.skip_critic ? "left-5" : "left-0.5"
                  )}
                />
              </button>
              <div>
                <span id="ab-critic-label" className="text-sm text-[color:var(--ds-text)]">
                  Abschließende Qualitätsprüfung
                </span>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  Ein zweiter Durchgang prüft das Ergebnis auf Lücken und Widersprüche, bevor es
                  angezeigt wird.
                </p>
              </div>
            </div>
          </div>
        )}

        {!editing && selected && (
          <div className="max-w-2xl space-y-5">
            {selected.description && (
              <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                {selected.description}
              </p>
            )}

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {selected.role && (
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                  <dt className="mb-1 text-xs text-[color:var(--ds-text-muted)]">
                    Art der Aufgabe
                  </dt>
                  <dd className="text-sm font-medium text-[color:var(--ds-text)]">
                    {AGENT_ROLES.find((r) => r.value === selected.role)?.label ?? "Individuell"}
                  </dd>
                </div>
              )}
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                <dt className="mb-1 text-xs text-[color:var(--ds-text-muted)]">Qualitätsprüfung</dt>
                <dd className="text-sm text-[color:var(--ds-text)]">
                  {selected.skip_critic ? "Aus" : "Ein"}
                </dd>
              </div>
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                <dt className="mb-1 text-xs text-[color:var(--ds-text-muted)]">Arbeitsschritte</dt>
                <dd className="text-sm text-[color:var(--ds-text)] tabular-nums">
                  {selected.steps?.length ? selected.steps.length : "automatisch"}
                </dd>
              </div>
            </dl>

            <section className="space-y-2">
              <h3 className={sectionTitle}>Arbeitsanweisung</h3>
              <p className="max-h-80 overflow-y-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                {selected.prompt_template}
              </p>
            </section>

            {selected.steps && selected.steps.length > 0 && (
              <section className="space-y-2">
                <h3 className={sectionTitle}>Arbeitsschritte</h3>
                <ol className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                  {selected.steps.map((step, idx) => (
                    <li key={step.id} className="flex items-start gap-3 p-3">
                      <span className="mt-0.5 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                        {idx + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-[color:var(--ds-text)]">
                            {specialistLabel(step.specialist)}
                          </span>
                          {step.depends_on !== undefined && (
                            <span className="text-xs text-[color:var(--ds-text-subtle)]">
                              nach Schritt {step.depends_on + 1}
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-3 text-xs text-[color:var(--ds-text-muted)]">
                          {step.prompt}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {selected.force_specialists && selected.force_specialists.length > 0 && (
              <section className="space-y-2">
                <h3 className={sectionTitle}>Fest eingebundene Fachbereiche</h3>
                <p className="text-sm text-[color:var(--ds-text)]">
                  {selected.force_specialists.map(specialistLabel).join(", ")}
                </p>
              </section>
            )}

            {selected.playbook_ref && (
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Playbook:{" "}
                <span className="text-[color:var(--ds-text)]">{selected.playbook_ref}</span>
              </p>
            )}

            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
              {selected.created_at && <span>Angelegt: {formatDateTime(selected.created_at)}</span>}
              {selected.updated_at && (
                <span>Aktualisiert: {formatDateTime(selected.updated_at)}</span>
              )}
            </p>
          </div>
        )}
      </div>

      {runTarget && (
        <RunDialog
          template={runTarget}
          onClose={() => {
            setRunTarget(null);
            setRunError(null);
          }}
          onRun={(input) => handleRun(runTarget, input)}
          isRunning={isRunning}
        />
      )}

      {runError && (
        <div
          role="alert"
          className="fixed right-4 bottom-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)] shadow-[var(--ds-shadow-3)]"
        >
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          {runError}
          <button
            type="button"
            onClick={() => setRunError(null)}
            aria-label="Meldung schließen"
            className="ml-2 shrink-0 hover:opacity-70"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
