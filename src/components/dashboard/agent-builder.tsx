"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Bot,
  Plus,
  Search,
  Trash2,
  Copy,
  Play,
  Save,
  X,
  Loader2,
  AlertCircle,
  Sparkles,
  GripVertical,
  ChevronDown,
  ChevronUp,
  FileText,
  Zap,
  Edit3,
  Wand2,
} from "lucide-react";
import {
  useAgentTemplates,
  useCreateAgentTemplate,
  useUpdateAgentTemplate,
  useDeleteAgentTemplate,
  useRunAgentTemplate,
  SPECIALISTS,
  MODEL_OPTIONS,
  type AgentTemplate,
  type AgentStep,
  type AgentTemplateInput,
} from "@/lib/queries/agent-templates";
import { useLang } from "@/lib/use-lang";

// ── Types ─────────────────────────────────────────────────────

interface BuilderForm {
  name: string;
  description: string;
  model: string;
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
    prompt_template: t.prompt_template,
    steps: t.steps ?? [],
    playbook_ref: t.playbook_ref ?? "",
    force_specialists: t.force_specialists ?? [],
    skip_critic: t.skip_critic ?? false,
  };
}

function formToInput(form: BuilderForm): AgentTemplateInput {
  return {
    name: form.name,
    description: form.description,
    model: form.model || undefined,
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
            Keine Steps definiert. Der Supervisor decomponiert automatisch.
          </p>
        </div>
      )}

      {steps.map((step, idx) => (
        <div
          key={step.id}
          className="space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
        >
          <div className="flex items-center gap-2">
            <GripVertical size={14} className="shrink-0 text-[color:var(--ds-text-subtle)]" />
            <span className="font-mono text-xs text-[color:var(--ds-text-muted)]">#{idx + 1}</span>
            <select
              value={step.specialist}
              onChange={(e) => updateStep(idx, { specialist: e.target.value })}
              className="focus:brand-border flex-1 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:outline-none"
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
                className="focus:brand-border w-28 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:outline-none"
                title="Abhängigkeit von vorherigem Step"
              >
                <option value="">Parallel</option>
                {steps.slice(0, idx).map((_, i) => (
                  <option key={i} value={i}>
                    Nach #{i + 1}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => moveStep(idx, -1)}
              disabled={idx === 0}
              className="rounded p-1 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] disabled:opacity-30"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => moveStep(idx, 1)}
              disabled={idx === steps.length - 1}
              className="rounded p-1 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] disabled:opacity-30"
            >
              <ChevronDown size={14} />
            </button>
            <button
              onClick={() => removeStep(idx)}
              className="rounded p-1 text-red-500 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <textarea
            value={step.prompt}
            onChange={(e) => updateStep(idx, { prompt: e.target.value })}
            placeholder="Prompt für diesen Step..."
            rows={2}
            className="focus:brand-border w-full resize-y rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none"
          />
        </div>
      ))}

      <button
        onClick={addStep}
        className="hover:brand-border flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[color:var(--ds-border)] px-3 py-2 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-[color:var(--ds-text)]"
      >
        <Plus size={14} />
        Step hinzufügen
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const stepCount = template.steps?.length ?? 0;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "w-full cursor-pointer rounded-lg border p-3 text-left transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
        isSelected
          ? "brand-soft brand-border"
          : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-border-strong)]"
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Wand2 size={14} className="brand-text shrink-0" />
          <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
            {template.name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            disabled={isRunning}
            className="brand-soft brand-text brand-border hover:brand-bg/30 rounded-md border p-1.5 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] disabled:opacity-40"
            title="Agent ausführen"
          >
            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="rounded-md p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            title="Bearbeiten"
          >
            <Edit3 size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="rounded-md p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            title="Duplizieren"
          >
            <Copy size={13} />
          </button>
          {confirmDelete ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(false);
                onDelete();
              }}
              className="rounded-md border border-red-500/20 bg-red-600/15 p-1.5 text-red-500 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
              title="Wirklich löschen"
            >
              <Trash2 size={13} />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
              className="rounded-md p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-red-500/10 hover:text-red-500"
              title="Löschen"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      {template.description && (
        <p className="mb-2 line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
          {template.description}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {template.model && (
          <span className="rounded-full bg-[color:var(--ds-hover)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--ds-text-muted)]">
            {template.model}
          </span>
        )}
        {stepCount > 0 && (
          <span className="rounded-full bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)]">
            {stepCount} Step{stepCount > 1 ? "s" : ""}
          </span>
        )}
        {template.force_specialists && template.force_specialists.length > 0 && (
          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600">
            {template.force_specialists.length} Specialists
          </span>
        )}
        {template.skip_critic && (
          <span className="rounded-full bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)]">
            No Critic
          </span>
        )}
      </div>
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg space-y-4 rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Play size={18} className="brand-text" />
            <h3 className="text-base font-semibold text-[color:var(--ds-text)]">Agent starten</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          <span className="font-medium text-[color:var(--ds-text)]">{template.name}</span> wird
          ausgeführt. Optional kannst du eine Eingabe mitgeben, die an das Prompt-Template angehängt
          wird.
        </p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Optionale Eingabe für den Agenten..."
          rows={4}
          className="focus:brand-border w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          >
            Abbrechen
          </button>
          <button
            onClick={() => onRun(input.trim() || undefined)}
            disabled={isRunning}
            className="brand-bg brand-bg flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] disabled:opacity-40"
          >
            {isRunning ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {isRunning ? "Starte..." : "Starten"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Agent Builder Component ──────────────────────────────

export function AgentBuilder({ onRunComplete }: { onRunComplete?: (jobId: number) => void }) {
  const { lang } = useLang();
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
      setError("Name ist erforderlich");
      return;
    }
    if (!form.prompt_template.trim()) {
      setError("Prompt-Template ist erforderlich");
      return;
    }
    try {
      if (isNew) {
        const result = await createMutation.mutateAsync(formToInput(form));
        setSuccessMsg("Agent-Template erstellt");
        setEditing(false);
        setIsNew(false);
        setSelectedSlug(result.slug);
      } else if (selected) {
        await updateMutation.mutateAsync({ slug: selected.slug, ...formToInput(form) });
        setSuccessMsg("Agent-Template aktualisiert");
        setEditing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
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
        setSuccessMsg("Template dupliziert");
        setSelectedSlug(result.slug);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Duplizieren fehlgeschlagen");
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
        setSuccessMsg("Template gelöscht");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
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
        setSuccessMsg(`Agent gestartet (Job #${result.jobId})`);
      } catch (err) {
        setRunError(err instanceof Error ? err.message : "Starten fehlgeschlagen");
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

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left: Template List */}
      <div className="flex w-80 flex-col border-r border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
        {/* Header + Search */}
        <div className="space-y-3 border-b border-[color:var(--ds-border)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wand2 size={16} className="brand-text" />
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Agent Templates</h2>
            </div>
            <button
              onClick={handleNew}
              className="brand-soft brand-text brand-border hover:brand-bg/30 flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
            >
              <Plus size={14} />
              Neu
            </button>
          </div>
          <div className="relative">
            <Search
              size={14}
              className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen..."
              className="focus:brand-border w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] py-1.5 pr-3 pl-8 text-xs text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none"
            />
          </div>
        </div>

        {/* Template List */}
        <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
          {templatesQuery.isLoading && templates.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="brand-text animate-spin" />
            </div>
          )}

          {templatesQuery.error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500">
              <AlertCircle size={14} />
              Templates nicht ladbar
            </div>
          )}

          {!templatesQuery.isLoading && templates.length === 0 && (
            <div className="py-12 text-center">
              <Bot size={32} className="mx-auto mb-3 text-[color:var(--ds-border)]" />
              <p className="mb-1 text-sm text-[color:var(--ds-text-muted)]">
                Keine Agent-Templates
              </p>
              <p className="mb-4 text-xs text-[color:var(--ds-text-subtle)]">
                Erstelle deinen ersten Custom Agent
              </p>
              <button
                onClick={handleNew}
                className="brand-soft brand-text brand-border hover:brand-bg/30 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
              >
                <Plus size={14} />
                Neues Template
              </button>
            </div>
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
              onEdit={handleEdit}
              onDuplicate={() => handleDuplicate(template)}
              onDelete={() => handleDelete(template.slug)}
              onRun={() => handleRunClick(template)}
              isRunning={isRunning && runTarget?.slug === template.slug}
            />
          ))}
        </div>
      </div>

      {/* Right: Editor / Detail */}
      <div className="flex flex-1 flex-col overflow-hidden bg-[color:var(--ds-bg)]">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] p-4">
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Edit3 size={16} className="brand-text" />
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {isNew ? "Neues Agent-Template" : "Template bearbeiten"}
                </h2>
              </>
            ) : selected ? (
              <>
                <Wand2 size={16} className="brand-text" />
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {selected.name}
                </h2>
              </>
            ) : (
              <>
                <Wand2 size={16} className="brand-text" />
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Agent Builder</h2>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertCircle size={13} />
                <span>{error}</span>
              </div>
            )}
            {successMsg && !error && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                <Sparkles size={13} />
                <span>{successMsg}</span>
              </div>
            )}
            {editing ? (
              <>
                <button
                  onClick={handleCancel}
                  disabled={savePending}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] disabled:opacity-40"
                >
                  <X size={14} />
                  Abbrechen
                </button>
                <button
                  onClick={handleSave}
                  disabled={savePending}
                  className="brand-bg brand-bg flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] disabled:opacity-40"
                >
                  {savePending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  Speichern
                </button>
              </>
            ) : selected ? (
              <>
                <button
                  onClick={() => handleRunClick(selected)}
                  disabled={isRunning}
                  className="brand-soft brand-text brand-border hover:brand-bg/30 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] disabled:opacity-40"
                >
                  {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Ausführen
                </button>
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                >
                  <Edit3 size={14} />
                  Bearbeiten
                </button>
              </>
            ) : (
              <button
                onClick={handleNew}
                className="brand-soft brand-text brand-border hover:brand-bg/30 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
              >
                <Plus size={14} />
                Neues Template
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {!editing && !selected && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Wand2 size={48} className="mb-4 text-[color:var(--ds-border)]" />
              <h3 className="mb-2 text-lg font-semibold text-[color:var(--ds-text)]">
                Agent Builder
              </h3>
              <p className="mb-6 max-w-md text-sm text-[color:var(--ds-text-muted)]">
                Erstelle Custom Agents mit Prompt-Templates, Model-Auswahl und Workflow-Steps.
                Speichere wiederverwendbare Agent-Definitionen und starte sie mit einem Klick.
              </p>
              <button
                onClick={handleNew}
                className="brand-bg brand-bg inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:opacity-90"
              >
                <Plus size={16} />
                Erstes Template erstellen
              </button>
            </div>
          )}

          {editing && (
            <div className="mx-auto max-w-2xl space-y-5">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="z.B. Vertrags-Review Agent"
                  className="focus:brand-border w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                  Beschreibung
                </label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Kurze Beschreibung des Agenten..."
                  className="focus:brand-border w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none"
                />
              </div>

              {/* Model */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                  Modell
                </label>
                <select
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="focus:brand-border w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none"
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prompt Template */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                  Prompt-Template <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.prompt_template}
                  onChange={(e) => setForm({ ...form, prompt_template: e.target.value })}
                  placeholder="Du bist ein Legal AI Agent. Deine Aufgabe ist es..."
                  rows={8}
                  className="focus:brand-border w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 font-mono text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none"
                />
                <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
                  Der Prompt wird an den Supervisor gesendet. Verwende Variablen wie {"{{eingabe}}"}{" "}
                  für dynamische Werte.
                </p>
              </div>

              {/* Steps / Workflow */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                    Workflow Steps
                  </label>
                  <span className="text-xs text-[color:var(--ds-text-subtle)]">
                    Optional — leer = Auto-Dekomposition
                  </span>
                </div>
                <StepEditor steps={form.steps} onChange={(steps) => setForm({ ...form, steps })} />
              </div>

              {/* Force Specialists */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                  Force Specialists
                </label>
                <div className="flex flex-wrap gap-2">
                  {SPECIALISTS.map((s) => {
                    const active = form.force_specialists.includes(s.value);
                    return (
                      <button
                        key={s.value}
                        onClick={() => {
                          const next = active
                            ? form.force_specialists.filter((v) => v !== s.value)
                            : [...form.force_specialists, s.value];
                          setForm({ ...form, force_specialists: next });
                        }}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
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
                <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
                  Überschreibt die Auto-Dekomposition. Steps werden ignoriert, wenn Specialists
                  forciert werden.
                </p>
              </div>

              {/* Playbook Reference */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                  Playbook-Referenz
                </label>
                <div className="relative">
                  <FileText
                    size={14}
                    className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
                  />
                  <input
                    value={form.playbook_ref}
                    onChange={(e) => setForm({ ...form, playbook_ref: e.target.value })}
                    placeholder="z.B. playbooks/vertrags-review"
                    className="focus:brand-border w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2 pr-3 pl-8 font-mono text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
                  Brain-Page-Slug mit zusätzlichem Kontext für den Agenten.
                </p>
              </div>

              {/* Skip Critic */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm({ ...form, skip_critic: !form.skip_critic })}
                  className={cn(
                    "relative h-5 w-10 rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    form.skip_critic ? "brand-bg" : "bg-[color:var(--ds-border)]"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                      form.skip_critic ? "left-5" : "left-0.5"
                    )}
                  />
                </button>
                <div>
                  <span className="text-sm text-[color:var(--ds-text)]">
                    Critic-Phase überspringen
                  </span>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    Deaktiviert die Qualitätsprüfung durch den Critic-Agenten.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!editing && selected && (
            <div className="mx-auto max-w-2xl space-y-5">
              {/* Description */}
              {selected.description && (
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <h4 className="mb-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                    Beschreibung
                  </h4>
                  <p className="text-sm leading-relaxed text-[color:var(--ds-text)]">
                    {selected.description}
                  </p>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                {selected.model && (
                  <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                    <div className="mb-1 text-xs text-[color:var(--ds-text-muted)]">Modell</div>
                    <div className="font-mono text-sm text-[color:var(--ds-text)]">
                      {selected.model}
                    </div>
                  </div>
                )}
                {selected.playbook_ref && (
                  <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                    <div className="mb-1 text-xs text-[color:var(--ds-text-muted)]">Playbook</div>
                    <div className="truncate font-mono text-sm text-[color:var(--ds-text)]">
                      {selected.playbook_ref}
                    </div>
                  </div>
                )}
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                  <div className="mb-1 text-xs text-[color:var(--ds-text-muted)]">Critic</div>
                  <div className="text-sm text-[color:var(--ds-text)]">
                    {selected.skip_critic ? "Deaktiviert" : "Aktiviert"}
                  </div>
                </div>
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                  <div className="mb-1 text-xs text-[color:var(--ds-text-muted)]">Steps</div>
                  <div className="text-sm text-[color:var(--ds-text)]">
                    {selected.steps?.length ?? 0}
                  </div>
                </div>
              </div>

              {/* Prompt Template */}
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <h4 className="mb-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                  Prompt-Template
                </h4>
                <pre className="max-h-80 overflow-y-auto font-mono text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
                  {selected.prompt_template}
                </pre>
              </div>

              {/* Steps */}
              {selected.steps && selected.steps.length > 0 && (
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <h4 className="mb-3 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                    Workflow Steps
                  </h4>
                  <div className="space-y-2">
                    {selected.steps.map((step, idx) => (
                      <div
                        key={step.id}
                        className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] p-2"
                      >
                        <span className="mt-0.5 font-mono text-xs text-[color:var(--ds-text-muted)]">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="brand-text text-xs font-medium">
                              {step.specialist}
                            </span>
                            {step.depends_on !== undefined && (
                              <span className="text-xs text-[color:var(--ds-text-subtle)]">
                                → nach #{step.depends_on + 1}
                              </span>
                            )}
                          </div>
                          <p className="line-clamp-3 text-xs text-[color:var(--ds-text-muted)]">
                            {step.prompt}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Force Specialists */}
              {selected.force_specialists && selected.force_specialists.length > 0 && (
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <h4 className="mb-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                    Force Specialists
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selected.force_specialists.map((s) => (
                      <span
                        key={s}
                        className="brand-soft brand-text brand-border rounded-lg border px-2 py-1 text-xs"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="flex items-center gap-4 pt-2 text-xs text-[color:var(--ds-text-muted)]">
                {selected.created_at && (
                  <span>
                    Erstellt:{" "}
                    {new Date(selected.created_at).toLocaleString(
                      lang === "en" ? "en-GB" : "de-DE"
                    )}
                  </span>
                )}
                {selected.updated_at && (
                  <span>
                    Aktualisiert:{" "}
                    {new Date(selected.updated_at).toLocaleString(
                      lang === "en" ? "en-GB" : "de-DE"
                    )}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Run Dialog */}
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

      {/* Run Error Toast */}
      {runError && (
        <div className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm text-white shadow-2xl">
          <AlertCircle size={16} />
          {runError}
          <button onClick={() => setRunError(null)} className="ml-2 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
