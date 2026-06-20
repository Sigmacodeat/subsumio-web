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
        <div className="text-center py-6 rounded-lg border border-dashed border-[color:var(--ds-border)]">
          <Zap size={20} className="mx-auto text-[color:var(--ds-border)] mb-2" />
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Keine Steps definiert. Der Supervisor decomponiert automatisch.
          </p>
        </div>
      )}

      {steps.map((step, idx) => (
        <div
          key={step.id}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <GripVertical size={14} className="text-[color:var(--ds-text-subtle)] shrink-0" />
            <span className="text-xs font-mono text-[color:var(--ds-text-muted)]">#{idx + 1}</span>
            <select
              value={step.specialist}
              onChange={(e) => updateStep(idx, { specialist: e.target.value })}
              className="flex-1 bg-[color:var(--ds-bg)] border border-[color:var(--ds-border)] rounded-md px-2 py-1 text-xs text-[color:var(--ds-text)] focus:outline-none focus:brand-border"
            >
              {SPECIALISTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {idx > 0 && (
              <select
                value={step.depends_on ?? ""}
                onChange={(e) => updateStep(idx, { depends_on: e.target.value ? Number(e.target.value) : undefined })}
                className="w-28 bg-[color:var(--ds-bg)] border border-[color:var(--ds-border)] rounded-md px-2 py-1 text-xs text-[color:var(--ds-text)] focus:outline-none focus:brand-border"
                title="Abhängigkeit von vorherigem Step"
              >
                <option value="">Parallel</option>
                {steps.slice(0, idx).map((_, i) => (
                  <option key={i} value={i}>Nach #{i + 1}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => moveStep(idx, -1)}
              disabled={idx === 0}
              className="p-1 rounded text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] disabled:opacity-30 transition-all"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => moveStep(idx, 1)}
              disabled={idx === steps.length - 1}
              className="p-1 rounded text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] disabled:opacity-30 transition-all"
            >
              <ChevronDown size={14} />
            </button>
            <button
              onClick={() => removeStep(idx)}
              className="p-1 rounded text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <textarea
            value={step.prompt}
            onChange={(e) => updateStep(idx, { prompt: e.target.value })}
            placeholder="Prompt für diesen Step..."
            rows={2}
            className="w-full bg-[color:var(--ds-bg)] border border-[color:var(--ds-border)] rounded-md px-2.5 py-1.5 text-xs text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:brand-border resize-y"
          />
        </div>
      ))}

      <button
        onClick={addStep}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[color:var(--ds-border)] text-xs text-[color:var(--ds-text-muted)] hover:brand-border hover:text-[color:var(--ds-text)] transition-all"
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
        "w-full text-left p-3 rounded-lg border transition-all cursor-pointer",
        isSelected
          ? "brand-soft brand-border"
          : "bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] hover:border-[color:var(--ds-border-strong)]",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <Wand2 size={14} className="brand-text shrink-0" />
          <span className="text-sm font-medium text-[color:var(--ds-text)] truncate">{template.name}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onRun(); }}
            disabled={isRunning}
            className="p-1.5 rounded-md brand-soft brand-text border brand-border hover:brand-bg/30 disabled:opacity-40 transition-all"
            title="Agent ausführen"
          >
            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-md text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all"
            title="Bearbeiten"
          >
            <Edit3 size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="p-1.5 rounded-md text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all"
            title="Duplizieren"
          >
            <Copy size={13} />
          </button>
          {confirmDelete ? (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); onDelete(); }}
              className="p-1.5 rounded-md bg-red-600/15 text-red-500 border border-red-500/20 transition-all"
              title="Wirklich löschen"
            >
              <Trash2 size={13} />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              className="p-1.5 rounded-md text-[color:var(--ds-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all"
              title="Löschen"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      {template.description && (
        <p className="text-xs text-[color:var(--ds-text-muted)] line-clamp-2 mb-2">{template.description}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {template.model && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)] font-mono">
            {template.model}
          </span>
        )}
        {stepCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]">
            {stepCount} Step{stepCount > 1 ? "s" : ""}
          </span>
        )}
        {template.force_specialists && template.force_specialists.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
            {template.force_specialists.length} Specialists
          </span>
        )}
        {template.skip_critic && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Play size={18} className="brand-text" />
            <h3 className="text-base font-semibold text-[color:var(--ds-text)]">Agent starten</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          <span className="text-[color:var(--ds-text)] font-medium">{template.name}</span> wird ausgeführt.
          Optional kannst du eine Eingabe mitgeben, die an das Prompt-Template angehängt wird.
        </p>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Optionale Eingabe für den Agenten..."
          rows={4}
          className="w-full bg-[color:var(--ds-bg)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:brand-border resize-y"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all"
          >
            Abbrechen
          </button>
          <button
            onClick={() => onRun(input.trim() || undefined)}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg brand-bg text-white text-sm font-medium brand-bg disabled:opacity-40 transition-all"
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
    [templates, selectedSlug],
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

  const handleDuplicate = useCallback(async (template: AgentTemplate) => {
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
  }, [createMutation]);

  const handleDelete = useCallback(async (slug: string) => {
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
  }, [deleteMutation, selectedSlug]);

  const handleRun = useCallback(async (template: AgentTemplate, input?: string) => {
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
  }, [runMutation, onRunComplete]);

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
      <div className="w-80 border-r border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] flex flex-col">
        {/* Header + Search */}
        <div className="p-4 border-b border-[color:var(--ds-border)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wand2 size={16} className="brand-text" />
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Agent Templates</h2>
            </div>
            <button
              onClick={handleNew}
              className="flex items-center gap-1 px-2 py-1 rounded-md brand-soft brand-text text-xs font-medium border brand-border hover:brand-bg/30 transition-all"
            >
              <Plus size={14} />
              Neu
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-subtle)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[color:var(--ds-bg)] border border-[color:var(--ds-border)] text-xs text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:brand-border"
            />
          </div>
        </div>

        {/* Template List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {templatesQuery.isLoading && templates.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="brand-text animate-spin" />
            </div>
          )}

          {templatesQuery.error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-500">
              <AlertCircle size={14} />
              Templates nicht ladbar
            </div>
          )}

          {!templatesQuery.isLoading && templates.length === 0 && (
            <div className="text-center py-12">
              <Bot size={32} className="mx-auto text-[color:var(--ds-border)] mb-3" />
              <p className="text-sm text-[color:var(--ds-text-muted)] mb-1">Keine Agent-Templates</p>
              <p className="text-xs text-[color:var(--ds-text-subtle)] mb-4">
                Erstelle deinen ersten Custom Agent
              </p>
              <button
                onClick={handleNew}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg brand-soft brand-text text-xs font-medium border brand-border hover:brand-bg/30 transition-all"
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
              onSelect={() => { setSelectedSlug(template.slug); setEditing(false); setIsNew(false); }}
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
      <div className="flex-1 flex flex-col bg-[color:var(--ds-bg)] overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-[color:var(--ds-border)] flex items-center justify-between">
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
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">{selected.name}</h2>
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] disabled:opacity-40 transition-all"
                >
                  <X size={14} />
                  Abbrechen
                </button>
                <button
                  onClick={handleSave}
                  disabled={savePending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg brand-bg text-white text-xs font-medium brand-bg disabled:opacity-40 transition-all"
                >
                  {savePending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Speichern
                </button>
              </>
            ) : selected ? (
              <>
                <button
                  onClick={() => handleRunClick(selected)}
                  disabled={isRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg brand-soft brand-text text-xs font-medium border brand-border hover:brand-bg/30 disabled:opacity-40 transition-all"
                >
                  {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Ausführen
                </button>
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all"
                >
                  <Edit3 size={14} />
                  Bearbeiten
                </button>
              </>
            ) : (
              <button
                onClick={handleNew}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg brand-soft brand-text text-xs font-medium border brand-border hover:brand-bg/30 transition-all"
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
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Wand2 size={48} className="text-[color:var(--ds-border)] mb-4" />
              <h3 className="text-lg font-semibold text-[color:var(--ds-text)] mb-2">Agent Builder</h3>
              <p className="text-sm text-[color:var(--ds-text-muted)] max-w-md mb-6">
                Erstelle Custom Agents mit Prompt-Templates, Model-Auswahl und Workflow-Steps.
                Speichere wiederverwendbare Agent-Definitionen und starte sie mit einem Klick.
              </p>
              <button
                onClick={handleNew}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg brand-bg text-white text-sm font-medium brand-bg hover:opacity-90 transition-all"
              >
                <Plus size={16} />
                Erstes Template erstellen
              </button>
            </div>
          )}

          {editing && (
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-1.5">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="z.B. Vertrags-Review Agent"
                  className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:brand-border"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-1.5">
                  Beschreibung
                </label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Kurze Beschreibung des Agenten..."
                  className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:brand-border"
                />
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-1.5">
                  Modell
                </label>
                <select
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus:brand-border"
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Prompt Template */}
              <div>
                <label className="block text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-1.5">
                  Prompt-Template <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.prompt_template}
                  onChange={(e) => setForm({ ...form, prompt_template: e.target.value })}
                  placeholder="Du bist ein Legal AI Agent. Deine Aufgabe ist es..."
                  rows={8}
                  className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:brand-border resize-y font-mono"
                />
                <p className="text-[10px] text-[color:var(--ds-text-subtle)] mt-1">
                  Der Prompt wird an den Supervisor gesendet. Verwende Variablen wie {"{{eingabe}}"} für dynamische Werte.
                </p>
              </div>

              {/* Steps / Workflow */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider">
                    Workflow Steps
                  </label>
                  <span className="text-[10px] text-[color:var(--ds-text-subtle)]">
                    Optional — leer = Auto-Dekomposition
                  </span>
                </div>
                <StepEditor
                  steps={form.steps}
                  onChange={(steps) => setForm({ ...form, steps })}
                />
              </div>

              {/* Force Specialists */}
              <div>
                <label className="block text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-1.5">
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
                          "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                          active
                            ? "brand-soft brand-text brand-border"
                            : "bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]",
                        )}
                        title={s.description}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[color:var(--ds-text-subtle)] mt-1">
                  Überschreibt die Auto-Dekomposition. Steps werden ignoriert, wenn Specialists forciert werden.
                </p>
              </div>

              {/* Playbook Reference */}
              <div>
                <label className="block text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-1.5">
                  Playbook-Referenz
                </label>
                <div className="relative">
                  <FileText size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-subtle)]" />
                  <input
                    value={form.playbook_ref}
                    onChange={(e) => setForm({ ...form, playbook_ref: e.target.value })}
                    placeholder="z.B. playbooks/vertrags-review"
                    className="w-full pl-8 pr-3 py-2 bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:brand-border font-mono"
                  />
                </div>
                <p className="text-[10px] text-[color:var(--ds-text-subtle)] mt-1">
                  Brain-Page-Slug mit zusätzlichem Kontext für den Agenten.
                </p>
              </div>

              {/* Skip Critic */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm({ ...form, skip_critic: !form.skip_critic })}
                  className={cn(
                    "relative w-10 h-5 rounded-full transition-all",
                    form.skip_critic ? "brand-bg" : "bg-[color:var(--ds-border)]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
                      form.skip_critic ? "left-5" : "left-0.5",
                    )}
                  />
                </button>
                <div>
                  <span className="text-sm text-[color:var(--ds-text)]">Critic-Phase überspringen</span>
                  <p className="text-[10px] text-[color:var(--ds-text-subtle)]">
                    Deaktiviert die Qualitätsprüfung durch den Critic-Agenten.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!editing && selected && (
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Description */}
              {selected.description && (
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <h4 className="text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-2">Beschreibung</h4>
                  <p className="text-sm text-[color:var(--ds-text)] leading-relaxed">{selected.description}</p>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                {selected.model && (
                  <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                    <div className="text-xs text-[color:var(--ds-text-muted)] mb-1">Modell</div>
                    <div className="text-sm font-mono text-[color:var(--ds-text)]">{selected.model}</div>
                  </div>
                )}
                {selected.playbook_ref && (
                  <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                    <div className="text-xs text-[color:var(--ds-text-muted)] mb-1">Playbook</div>
                    <div className="text-sm font-mono text-[color:var(--ds-text)] truncate">{selected.playbook_ref}</div>
                  </div>
                )}
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                  <div className="text-xs text-[color:var(--ds-text-muted)] mb-1">Critic</div>
                  <div className="text-sm text-[color:var(--ds-text)]">{selected.skip_critic ? "Deaktiviert" : "Aktiviert"}</div>
                </div>
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                  <div className="text-xs text-[color:var(--ds-text-muted)] mb-1">Steps</div>
                  <div className="text-sm text-[color:var(--ds-text)]">{selected.steps?.length ?? 0}</div>
                </div>
              </div>

              {/* Prompt Template */}
              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <h4 className="text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-2">Prompt-Template</h4>
                <pre className="text-sm text-[color:var(--ds-text)] leading-relaxed whitespace-pre-wrap font-mono max-h-80 overflow-y-auto">
                  {selected.prompt_template}
                </pre>
              </div>

              {/* Steps */}
              {selected.steps && selected.steps.length > 0 && (
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <h4 className="text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-3">Workflow Steps</h4>
                  <div className="space-y-2">
                    {selected.steps.map((step, idx) => (
                      <div key={step.id} className="flex items-start gap-3 p-2 rounded-lg bg-[color:var(--ds-bg)] border border-[color:var(--ds-border)]">
                        <span className="text-xs font-mono text-[color:var(--ds-text-muted)] mt-0.5">#{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium brand-text">{step.specialist}</span>
                            {step.depends_on !== undefined && (
                              <span className="text-[10px] text-[color:var(--ds-text-subtle)]">
                                → nach #{step.depends_on + 1}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[color:var(--ds-text-muted)] line-clamp-3">{step.prompt}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Force Specialists */}
              {selected.force_specialists && selected.force_specialists.length > 0 && (
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <h4 className="text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-2">Force Specialists</h4>
                  <div className="flex flex-wrap gap-2">
                    {selected.force_specialists.map((s) => (
                      <span key={s} className="text-xs px-2 py-1 rounded-lg brand-soft brand-text border brand-border">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)] pt-2">
                {selected.created_at && <span>Erstellt: {new Date(selected.created_at).toLocaleString("de-DE")}</span>}
                {selected.updated_at && <span>Aktualisiert: {new Date(selected.updated_at).toLocaleString("de-DE")}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Run Dialog */}
      {runTarget && (
        <RunDialog
          template={runTarget}
          onClose={() => { setRunTarget(null); setRunError(null); }}
          onRun={(input) => handleRun(runTarget, input)}
          isRunning={isRunning}
        />
      )}

      {/* Run Error Toast */}
      {runError && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-white text-sm shadow-2xl">
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
