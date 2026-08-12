"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Save,
  ArrowLeft,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/csrf";
import Link2 from "next/link";
import { useLang } from "@/lib/use-lang";

// ── Types ─────────────────────────────────────────────────────────────

interface WorkflowStep {
  id: string;
  type: StepType;
  label: string;
  prompt: string;
  model?: string;
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

// ── Step Palette Config ───────────────────────────────────────────────

const STEP_TYPES: {
  type: StepType;
  labelKey: string;
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
    prompt: "",
  },
  {
    type: "email",
    labelKey: "builder.step.email",
    icon: <Mail size={14} />,
    color: "var(--accent-premium)",
    prompt: "",
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
    prompt: "Erstelle einen Redline für den folgenden Vertrag:",
  },
];

const getStepConfig = (type: StepType) => STEP_TYPES.find((s) => s.type === type)!;

// ── Utils ─────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 8);

// ── Main Component ────────────────────────────────────────────────────

export default function WorkflowBuilderPage() {
  const { t } = useLang();
  const [meta, setMeta] = useState<WorkflowMeta>({ name: "Neuer Workflow", description: "" });
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{
    stepId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Step Operations ──────────────────────────────────────────────────

  const addStep = useCallback(
    (type: StepType) => {
      const cfg = getStepConfig(type);
      const newStep: WorkflowStep = {
        id: uid(),
        type,
        label: t(cfg.labelKey as import("@/content/dashboard").DashboardKey),
        prompt: cfg.prompt,
        x: 80 + (steps.length % 3) * 200,
        y: 80 + Math.floor(steps.length / 3) * 150,
      };
      setSteps((prev) => [...prev, newStep]);
      setSelectedStep(newStep.id);
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
      const x1 = parent.x + 100,
        y1 = parent.y + 36;
      const x2 = s.x + 100,
        y2 = s.y;
      const mx = (x1 + x2) / 2;
      return (
        <g key={`${parent.id}-${s.id}`}>
          <path
            d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
            fill="none"
            stroke="var(--accent-premium)"
            strokeWidth="2"
            strokeOpacity="0.6"
          />
          <polygon
            points={`${x2},${y2} ${x2 - 6},${y2 - 6} ${x2 + 6},${y2 - 6}`}
            fill="var(--accent-premium)"
            fillOpacity="0.6"
          />
        </g>
      );
    });

  // ── Save ──────────────────────────────────────────────────────────────

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: meta.name,
        description: meta.description,
        prompt_template: steps.map((s) => s.prompt).join("\n\n"),
        steps: steps
          .map((s) => ({
            id: s.id,
            specialist: s.type,
            prompt: s.prompt,
            depends_on: s.dependsOn ? steps.findIndex((p) => p.id === s.dependsOn) : undefined,
          }))
          .filter((s) => s !== null),
      };
      const res = await csrfFetch("/api/agent-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  };

  const selected = steps.find((s) => s.id === selectedStep);
  const stepConfig = selected ? getStepConfig(selected.type) : null;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--ds-bg)",
        color: "var(--ds-text)",
        overflow: "hidden",
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderBottom: "1px solid var(--ds-border)",
          background: "var(--ds-surface)",
          flexShrink: 0,
        }}
      >
        <Link2 href="/dashboard/workflows">
          <Button variant="ghost" size="sm" style={{ gap: 4 }}>
            <ArrowLeft size={14} /> {t("builder.back")}
          </Button>
        </Link2>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <input
            value={meta.name}
            onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
            aria-label={t("builder.workflow_name")}
            style={{
              background: "none",
              border: "none",
              color: "var(--ds-text)",
              fontSize: 15,
              fontWeight: 600,
              outline: "none",
              minWidth: 200,
            }}
            placeholder={t("workflows.builder.ph_name")}
          />
          <input
            value={meta.description}
            onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
            aria-label={t("builder.workflow_description")}
            style={{
              background: "none",
              border: "none",
              color: "var(--ds-text-subtle)",
              fontSize: 12,
              outline: "none",
              flex: 1,
            }}
            placeholder={t("workflows.builder.ph_desc")}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={save}
            disabled={saving}
            aria-label={t("builder.save")}
            style={{ gap: 4 }}
          >
            <Save size={14} />
            {saving ? "Speichern…" : saveStatus === "saved" ? "Gespeichert ✓" : "Speichern"}
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Palette */}
        <div
          style={{
            width: 180,
            borderRight: "1px solid var(--ds-border)",
            background: "var(--ds-surface)",
            padding: "12px 8px",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--ds-text-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.4px",
              marginBottom: 8,
              padding: "0 4px",
            }}
          >
            Steps
          </div>
          {STEP_TYPES.map((s) => (
            <button
              key={s.type}
              onClick={() => addStep(s.type)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 8px",
                border: "1px solid var(--ds-border)",
                borderRadius: 6,
                background: "none",
                color: "var(--ds-text)",
                cursor: "pointer",
                fontSize: 12,
                marginBottom: 4,
                textAlign: "left",
                transition: "all 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = s.color)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--ds-border)")}
            >
              <span style={{ color: s.color }}>{s.icon}</span>
              <span>{t(s.labelKey as import("@/content/dashboard").DashboardKey)}</span>
              <Plus size={11} style={{ marginLeft: "auto", opacity: 0.5 }} />
            </button>
          ))}
        </div>

        {/* Canvas */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Pointer-driven drag-and-drop canvas; clicking empty canvas only clears the selection (steps remain editable via the inspector). */}
        <div
          ref={canvasRef}
          style={{
            flex: 1,
            position: "relative",
            overflow: "auto",
            background:
              "radial-gradient(circle at 50% 50%, var(--ds-surface-2) 0%, var(--ds-bg) 100%)",
            cursor: dragging ? "grabbing" : "default",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedStep(null);
          }}
        >
          {/* Grid pattern */}
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <defs>
              <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path
                  d="M 32 0 L 0 0 0 32"
                  fill="none"
                  stroke="var(--ds-border)"
                  strokeWidth="0.5"
                  opacity="0.5"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            {arrows}
          </svg>

          {/* Empty state */}
          {steps.length === 0 && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                textAlign: "center",
                color: "var(--ds-text-subtle)",
              }}
            >
              <Zap size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Workflow bauen</div>
              <div style={{ fontSize: 12 }}>Steps aus der linken Palette ziehen oder klicken</div>
            </div>
          )}

          {/* Step Cards */}
          {steps.map((step) => {
            const cfg = getStepConfig(step.type);
            const isSelected = step.id === selectedStep;
            return (
              <div
                key={step.id}
                role="button"
                tabIndex={0}
                className="focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedStep(step.id);
                  }
                }}
                onMouseDown={(e) => onMouseDown(e, step.id)}
                style={{
                  position: "absolute",
                  left: step.x,
                  top: step.y,
                  width: 200,
                  background: "var(--ds-surface)",
                  border: `2px solid ${isSelected ? cfg.color : "var(--ds-border)"}`,
                  borderRadius: 8,
                  cursor: "grab",
                  userSelect: "none",
                  boxShadow: isSelected
                    ? `0 0 0 1px ${cfg.color}30, 0 4px 16px rgba(0,0,0,0.4)`
                    : "0 2px 8px rgba(0,0,0,0.3)",
                  zIndex: isSelected ? 10 : 1,
                }}
              >
                {/* Step Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--ds-border)",
                  }}
                >
                  <span style={{ color: cfg.color }}>{cfg.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-text)", flex: 1 }}>
                    {step.label}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteStep(step.id);
                    }}
                    aria-label={t("builder.delete_step")}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--ds-danger-text)",
                      padding: 2,
                      display: "flex",
                      borderRadius: 4,
                    }}
                    className="focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                {/* Step Body */}
                <div
                  style={{
                    padding: "6px 10px",
                    fontSize: 11,
                    color: "var(--ds-text-subtle)",
                    lineHeight: 1.4,
                    maxHeight: 40,
                    overflow: "hidden",
                  }}
                >
                  {step.prompt
                    ? step.prompt.slice(0, 60) + (step.prompt.length > 60 ? "…" : "")
                    : "Keine Anweisungen"}
                </div>
                {/* Connector dots */}
                <div
                  style={{
                    height: 10,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "flex-end",
                    paddingBottom: 4,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: cfg.color,
                      opacity: 0.6,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Properties Panel */}
        {selected && stepConfig && (
          <div
            style={{
              width: 260,
              borderLeft: "1px solid var(--ds-border)",
              background: "var(--ds-surface)",
              padding: 14,
              overflowY: "auto",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: stepConfig.color }}>{stepConfig.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.label}</span>
              </div>
              <button
                onClick={() => setSelectedStep(null)}
                aria-label={t("builder.close_inspector")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ds-text-subtle)",
                  borderRadius: 4,
                }}
                className="focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 10,
                  color: "var(--ds-text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.4px",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Name
              </label>
              <input
                value={selected.label}
                onChange={(e) => updateStep(selected.id, { label: e.target.value })}
                style={{
                  width: "100%",
                  background: "var(--ds-bg)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  color: "var(--ds-text)",
                  fontSize: 12,
                }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 10,
                  color: "var(--ds-text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.4px",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Anweisung / Prompt
              </label>
              <textarea
                value={selected.prompt}
                onChange={(e) => updateStep(selected.id, { prompt: e.target.value })}
                rows={5}
                style={{
                  width: "100%",
                  background: "var(--ds-surface-2)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  color: "var(--ds-text)",
                  fontSize: 12,
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 10,
                  color: "var(--ds-text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.4px",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {t("builder.depends_on")}
              </label>
              <select
                value={selected.dependsOn ?? ""}
                onChange={(e) =>
                  updateStep(selected.id, { dependsOn: e.target.value || undefined })
                }
                style={{
                  width: "100%",
                  background: "var(--ds-bg)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  color: "var(--ds-text)",
                  fontSize: 12,
                }}
              >
                <option value="">— Kein vorheriger Step —</option>
                {steps
                  .filter((s) => s.id !== selected.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 10,
                  color: "var(--ds-text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.4px",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Modell (optional)
              </label>
              <select
                value={selected.model ?? ""}
                onChange={(e) => updateStep(selected.id, { model: e.target.value || undefined })}
                style={{
                  width: "100%",
                  background: "var(--ds-bg)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  color: "var(--ds-text)",
                  fontSize: 12,
                }}
              >
                <option value="">Standard (aus Org-Einstellungen)</option>
                <option value="claude-opus-4-8">Claude Opus 4.8 (Höchste Qualität)</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Ausgewogen)</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Schnell)</option>
              </select>
            </div>

            <button
              onClick={() => deleteStep(selected.id)}
              aria-label={t("builder.delete_step")}
              className="focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
              style={{
                width: "100%",
                padding: "8px",
                background: "var(--ds-danger-soft)",
                border: "1px solid var(--ds-danger-border)",
                borderRadius: 5,
                color: "var(--ds-danger-text)",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
            >
              <Trash2 size={12} /> {t("builder.delete_step")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
