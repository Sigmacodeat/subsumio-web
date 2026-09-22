"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Save,
  Plus,
  Trash2,
  X,
  FileText,
  AlertTriangle,
  CheckCircle,
  Globe,
  Mail,
  Zap,
  Eye,
  Edit3,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/page-header";
import { csrfFetch } from "@/lib/csrf";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

// ── Types ─────────────────────────────────────────────────────────────

interface WorkflowStep {
  id: string;
  type: StepType;
  label: string;
  prompt: string;
  x: number;
  y: number;
  dependsOn?: string; // id of parent step
}

interface WorkflowMeta {
  name: string;
  description: string;
}

type StepType =
  | "analyze"
  | "summarize"
  | "draft"
  | "risk"
  | "translate"
  | "review"
  | "webhook"
  | "email"
  | "obligation"
  | "redline";

/** Server-side limit (POST /api/agent-templates). */
const MAX_STEPS = 10;
const CARD_W = 200;

// ── Step Palette Config ───────────────────────────────────────────────

const STEP_TYPES: {
  type: StepType;
  labelKey: DashboardKey;
  icon: React.ReactNode;
  color: string;
  prompt: string;
}[] = [
  {
    type: "analyze",
    labelKey: "builder.step.analyze",
    icon: <FileText size={14} />,
    color: "var(--accent-premium)",
    prompt: "Analysiere den folgenden Text aus rechtlicher Sicht:",
  },
  {
    type: "summarize",
    labelKey: "builder.step.summarize",
    icon: <Edit3 size={14} />,
    color: "var(--accent-premium)",
    prompt: "Fasse den folgenden juristischen Text zusammen:",
  },
  {
    type: "draft",
    labelKey: "builder.step.draft",
    icon: <FileText size={14} />,
    color: "var(--ds-info-text)",
    prompt: "Erstelle einen Vertragsentwurf basierend auf:",
  },
  {
    type: "risk",
    labelKey: "builder.step.risk",
    icon: <AlertTriangle size={14} />,
    color: "var(--ds-warning-text)",
    prompt: "Identifiziere rechtliche Risiken in:",
  },
  {
    type: "translate",
    labelKey: "builder.step.translate",
    icon: <Globe size={14} />,
    color: "var(--ds-success-text)",
    prompt: "Übersetze den folgenden juristischen Text ins Deutsche:",
  },
  {
    type: "review",
    labelKey: "builder.step.review",
    icon: <Eye size={14} />,
    color: "var(--ds-danger-text)",
    prompt: "Menschliche Überprüfung erforderlich",
  },
  {
    type: "webhook",
    labelKey: "builder.step.webhook",
    icon: <Zap size={14} />,
    color: "var(--ds-warning-text)",
    prompt: "Übergib das Ergebnis an das angebundene Kanzleisystem.",
  },
  {
    type: "email",
    labelKey: "builder.step.email",
    icon: <Mail size={14} />,
    color: "var(--accent-premium)",
    prompt: "Bereite das Ergebnis als E-Mail-Entwurf zur Freigabe vor.",
  },
  {
    type: "obligation",
    labelKey: "builder.step.obligation",
    icon: <CheckCircle size={14} />,
    color: "var(--ds-success-text)",
    prompt: "Extrahiere alle Pflichten und Fristen aus:",
  },
  {
    type: "redline",
    labelKey: "builder.step.redline",
    icon: <Edit3 size={14} />,
    color: "var(--ds-danger-text)",
    prompt: "Erstelle eine Änderungsfassung (Redline) für den folgenden Vertrag:",
  },
];

const getStepConfig = (type: StepType) => STEP_TYPES.find((s) => s.type === type)!;

// ── Utils ─────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 8);

const fieldLabel = "text-xs font-medium text-[color:var(--ds-text-muted)]";
const fieldControl =
  "w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1";

// ── Main Component ────────────────────────────────────────────────────

export default function WorkflowBuilderPage() {
  const { t } = useLang();
  const [meta, setMeta] = useState<WorkflowMeta>({ name: "", description: "" });
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{
    stepId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Step Operations ──────────────────────────────────────────────────

  const addStep = useCallback(
    (type: StepType) => {
      if (steps.length >= MAX_STEPS) {
        setSaveError(`Ein Ablauf kann höchstens ${MAX_STEPS} Schritte enthalten.`);
        return;
      }
      const cfg = getStepConfig(type);
      const newStep: WorkflowStep = {
        id: uid(),
        type,
        label: t(cfg.labelKey),
        prompt: cfg.prompt,
        x: 32 + (steps.length % 3) * (CARD_W + 32),
        y: 32 + Math.floor(steps.length / 3) * 140,
      };
      setSteps((prev) => [...prev, newStep]);
      setSelectedStep(newStep.id);
      setSaveError(null);
    },
    [steps.length, t]
  );

  const deleteStep = useCallback(
    (id: string) => {
      setSteps((prev) =>
        prev
          .filter((s) => s.id !== id)
          .map((s) => ({
            ...s,
            dependsOn: s.dependsOn === id ? undefined : s.dependsOn,
          }))
      );
      if (selectedStep === id) setSelectedStep(null);
    },
    [selectedStep]
  );

  const updateStep = useCallback((id: string, updates: Partial<WorkflowStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  // ── Drag ─────────────────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent, stepId: string) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const step = steps.find((s) => s.id === stepId)!;
    setDragging({ stepId, offsetX: e.clientX - step.x, offsetY: e.clientY - step.y });
    setSelectedStep(stepId);
  };

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging) return;
      setSteps((prev) =>
        prev.map((s) =>
          s.id === dragging.stepId
            ? {
                ...s,
                x: Math.max(0, e.clientX - dragging.offsetX),
                y: Math.max(0, e.clientY - dragging.offsetY),
              }
            : s
        )
      );
    },
    [dragging]
  );

  const onMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // ── SVG Arrows ───────────────────────────────────────────────────────

  const arrows = steps
    .filter((s) => s.dependsOn)
    .map((s) => {
      const parent = steps.find((p) => p.id === s.dependsOn);
      if (!parent) return null;
      const x1 = parent.x + CARD_W / 2,
        y1 = parent.y + 96;
      const x2 = s.x + CARD_W / 2,
        y2 = s.y;
      const my = (y1 + y2) / 2;
      return (
        <g key={`${parent.id}-${s.id}`}>
          <path
            d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`}
            fill="none"
            stroke="var(--ds-border-strong)"
            strokeWidth="2"
          />
          <polygon
            points={`${x2},${y2} ${x2 - 5},${y2 - 7} ${x2 + 5},${y2 - 7}`}
            fill="var(--ds-border-strong)"
          />
        </g>
      );
    });

  const canvasWidth = Math.max(720, ...steps.map((s) => s.x + CARD_W + 32));
  const canvasHeight = Math.max(480, ...steps.map((s) => s.y + 160));

  // ── Save ──────────────────────────────────────────────────────────────

  const save = async () => {
    setSaveError(null);
    const name = meta.name.trim();
    if (!name) {
      setSaveError("Bitte geben Sie dem Ablauf einen Namen.");
      return;
    }
    if (steps.length === 0) {
      setSaveError("Fügen Sie mindestens einen Schritt hinzu.");
      return;
    }
    const emptyStep = steps.find((s) => !s.prompt.trim());
    if (emptyStep) {
      setSelectedStep(emptyStep.id);
      setSaveError(`Der Schritt „${emptyStep.label}" braucht eine Anweisung.`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        description: meta.description.trim(),
        prompt_template: steps.map((s) => s.prompt).join("\n\n"),
        steps: steps.map((s) => {
          const dep = s.dependsOn ? steps.findIndex((p) => p.id === s.dependsOn) : -1;
          return {
            id: s.id,
            specialist: s.type,
            prompt: s.prompt,
            ...(dep >= 0 ? { depends_on: dep } : {}),
          };
        }),
      };
      const res = await csrfFetch("/api/agent-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      console.error("[workflow-builder] save failed:", err instanceof Error ? err.message : err);
      setSaveError("Der Ablauf konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
    } finally {
      setSaving(false);
    }
  };

  const selected = steps.find((s) => s.id === selectedStep);
  const stepConfig = selected ? getStepConfig(selected.type) : null;
  const title = t("workflows.builder.open");

  return (
    <div className="ds-page min-w-0 space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={title}
        description="Stellen Sie Arbeitsschritte zu einem Ablauf zusammen und speichern Sie ihn als wiederverwendbare Vorlage."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("workflows.breadcrumb"), href: "/dashboard/workflows" },
          { label: title },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" asChild className="whitespace-nowrap">
              <Link href="/dashboard/workflows">{t("workflows.cancel")}</Link>
            </Button>
            <Button onClick={save} disabled={saving} className="whitespace-nowrap">
              {saving ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : saveStatus === "saved" ? (
                <CheckCircle size={14} aria-hidden="true" />
              ) : (
                <Save size={14} aria-hidden="true" />
              )}
              {saveStatus === "saved" ? "Gespeichert" : "Ablauf speichern"}
            </Button>
          </div>
        }
      />

      {saveError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-2.5 text-sm text-[color:var(--ds-danger-text)]"
        >
          <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            aria-label="Meldung schließen"
            className="rounded p-1 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {saveStatus === "saved" && (
        <p
          role="status"
          className="rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-4 py-2.5 text-sm text-[color:var(--ds-success-text)]"
        >
          Der Ablauf wurde als Vorlage gespeichert. Sie starten ihn unter{" "}
          <Link href="/dashboard/agents" className="underline">
            Assistenten › Vorlagen
          </Link>
          .
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wf-name" className={fieldLabel}>
            Name des Ablaufs
          </Label>
          <Input
            id="wf-name"
            value={meta.name}
            onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
            placeholder="z. B. Mietvertrag prüfen und Fristen notieren"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wf-desc" className={fieldLabel}>
            {t("builder.workflow_description")}
          </Label>
          <Input
            id="wf-desc"
            value={meta.description}
            onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
            placeholder={t("workflows.builder.ph_desc")}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[11.5rem_minmax(0,1fr)_16rem]">
        {/* Palette */}
        <section aria-labelledby="wf-palette-title" className="min-w-0">
          <h2
            id="wf-palette-title"
            className="mb-2 text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase"
          >
            Schritt hinzufügen
          </h2>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
            {STEP_TYPES.map((s) => (
              <button
                key={s.type}
                type="button"
                onClick={() => addStep(s.type)}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-2 text-left text-xs text-[color:var(--ds-text)] transition-[background-color,border-color] duration-[var(--ds-duration-fast)] hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
              >
                <span style={{ color: s.color }} aria-hidden="true">
                  {s.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{t(s.labelKey)}</span>
                <Plus size={12} className="shrink-0 opacity-50" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        {/* Canvas */}
        <section aria-label="Arbeitsfläche" className="min-w-0">
          <div className="h-[520px] overflow-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Pointer-driven drag-and-drop canvas; clicking empty canvas only clears the selection (steps remain editable via the inspector). */}
            <div
              ref={canvasRef}
              className="relative"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                cursor: dragging ? "grabbing" : "default",
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedStep(null);
              }}
            >
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                <defs>
                  <pattern id="wf-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                    <path
                      d="M 32 0 L 0 0 0 32"
                      fill="none"
                      stroke="var(--ds-border)"
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#wf-grid)" />
                {arrows}
              </svg>

              {steps.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <Zap
                    size={28}
                    className="mb-3 text-[color:var(--ds-text-subtle)]"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-[color:var(--ds-text)]">
                    Noch keine Schritte
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-[color:var(--ds-text-muted)]">
                    Wählen Sie links einen Schritt. Die Reihenfolge legen Sie im Feld „
                    {t("builder.depends_on")}“ fest.
                  </p>
                </div>
              )}

              {steps.map((step, idx) => {
                const cfg = getStepConfig(step.type);
                const isSelected = step.id === selectedStep;
                return (
                  <div
                    key={step.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`Schritt ${idx + 1}: ${step.label}`}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedStep(step.id);
                      }
                    }}
                    onMouseDown={(e) => onMouseDown(e, step.id)}
                    className={cn(
                      "absolute cursor-grab rounded-lg border-2 bg-[color:var(--ds-surface)] select-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none",
                      isSelected
                        ? "z-10 shadow-[var(--ds-shadow-2)]"
                        : "z-[1] border-[color:var(--ds-border)] shadow-[var(--ds-shadow-1)]"
                    )}
                    style={{
                      left: step.x,
                      top: step.y,
                      width: CARD_W,
                      borderColor: isSelected ? cfg.color : undefined,
                    }}
                  >
                    <div className="flex items-center gap-1.5 border-b border-[color:var(--ds-border)] px-2.5 py-2">
                      <span className="text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                        {idx + 1}
                      </span>
                      <span style={{ color: cfg.color }} aria-hidden="true">
                        {cfg.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[color:var(--ds-text)]">
                        {step.label}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteStep(step.id);
                        }}
                        aria-label={`${step.label} entfernen`}
                        className="rounded p-0.5 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-danger-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="line-clamp-3 px-2.5 py-2 text-xs leading-snug text-[color:var(--ds-text-muted)]">
                      {step.prompt || "Noch keine Anweisung"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Inspector */}
        <aside aria-label="Schritt bearbeiten" className="min-w-0">
          {selected && stepConfig ? (
            <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[color:var(--ds-text)]">
                  <span style={{ color: stepConfig.color }} aria-hidden="true">
                    {stepConfig.icon}
                  </span>
                  <span className="truncate">{selected.label}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedStep(null)}
                  aria-label={t("builder.close_inspector")}
                  className="rounded p-1 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wf-step-name" className={fieldLabel}>
                  Bezeichnung
                </Label>
                <input
                  id="wf-step-name"
                  value={selected.label}
                  onChange={(e) => updateStep(selected.id, { label: e.target.value })}
                  className={fieldControl}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wf-step-prompt" className={fieldLabel}>
                  Anweisung an den Assistenten
                </Label>
                <textarea
                  id="wf-step-prompt"
                  value={selected.prompt}
                  onChange={(e) => updateStep(selected.id, { prompt: e.target.value })}
                  rows={5}
                  className={cn(fieldControl, "resize-y")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wf-step-dep" className={fieldLabel}>
                  {t("builder.depends_on")}
                </Label>
                <select
                  id="wf-step-dep"
                  value={selected.dependsOn ?? ""}
                  onChange={(e) =>
                    updateStep(selected.id, { dependsOn: e.target.value || undefined })
                  }
                  className={fieldControl}
                >
                  <option value="">Kein vorheriger Schritt</option>
                  {steps
                    .filter((s) => s.id !== selected.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                </select>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteStep(selected.id)}
                className="w-full text-[color:var(--ds-danger-text)]"
              >
                <Trash2 size={13} aria-hidden="true" />
                Schritt entfernen
              </Button>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[color:var(--ds-border-strong)] p-4 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              Wählen Sie einen Schritt auf der Arbeitsfläche, um Bezeichnung, Anweisung und
              Reihenfolge festzulegen.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
