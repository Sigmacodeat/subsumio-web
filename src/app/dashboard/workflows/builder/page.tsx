"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Play,
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  Settings,
  X,
  FileText,
  AlertTriangle,
  CheckCircle,
  Globe,
  Mail,
  Zap,
  Eye,
  Edit3,
  Link,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import Link2 from "next/link";

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
  label: string;
  icon: React.ReactNode;
  color: string;
  prompt: string;
}[] = [
  {
    type: "analyze",
    label: "Analysieren",
    icon: <FileText size={14} />,
    color: "#6366f1",
    prompt: "Analysiere den folgenden Text aus rechtlicher Sicht:",
  },
  {
    type: "summarize",
    label: "Zusammenfassen",
    icon: <Edit3 size={14} />,
    color: "#8b5cf6",
    prompt: "Fasse den folgenden juristischen Text zusammen:",
  },
  {
    type: "draft",
    label: "Entwurf erstellen",
    icon: <FileText size={14} />,
    color: "#06b6d4",
    prompt: "Erstelle einen Vertragsentwurf basierend auf:",
  },
  {
    type: "risk",
    label: "Risiko prüfen",
    icon: <AlertTriangle size={14} />,
    color: "#f59e0b",
    prompt: "Identifiziere rechtliche Risiken in:",
  },
  {
    type: "translate",
    label: "Übersetzen",
    icon: <Globe size={14} />,
    color: "#10b981",
    prompt: "Übersetze den folgenden juristischen Text ins Deutsche:",
  },
  {
    type: "review",
    label: "Manuell prüfen",
    icon: <Eye size={14} />,
    color: "#ec4899",
    prompt: "Menschliche Überprüfung erforderlich",
  },
  {
    type: "webhook",
    label: "Webhook senden",
    icon: <Zap size={14} />,
    color: "#f97316",
    prompt: "",
  },
  { type: "email", label: "Email senden", icon: <Mail size={14} />, color: "#3b82f6", prompt: "" },
  {
    type: "obligation",
    label: "Pflichten extrahieren",
    icon: <CheckCircle size={14} />,
    color: "#22c55e",
    prompt: "Extrahiere alle Pflichten und Fristen aus:",
  },
  {
    type: "redline",
    label: "Redline",
    icon: <Edit3 size={14} />,
    color: "#ef4444",
    prompt: "Erstelle einen Redline für den folgenden Vertrag:",
  },
];

const getStepConfig = (type: StepType) => STEP_TYPES.find((s) => s.type === type)!;

// ── Utils ─────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 8);

// ── Main Component ────────────────────────────────────────────────────

export default function WorkflowBuilderPage() {
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
        label: cfg.label,
        prompt: cfg.prompt,
        x: 80 + (steps.length % 3) * 200,
        y: 80 + Math.floor(steps.length / 3) * 150,
      };
      setSteps((prev) => [...prev, newStep]);
      setSelectedStep(newStep.id);
    },
    [steps.length]
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
            stroke="#6366f1"
            strokeWidth="2"
            strokeOpacity="0.6"
          />
          <polygon
            points={`${x2},${y2} ${x2 - 6},${y2 - 6} ${x2 + 6},${y2 - 6}`}
            fill="#6366f1"
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
          .map((s, i) => ({
            id: s.id,
            specialist: s.type,
            prompt: s.prompt,
            depends_on: s.dependsOn ? steps.findIndex((p) => p.id === s.dependsOn) : undefined,
          }))
          .filter((s) => s !== null),
      };
      const res = await fetch("/api/agent-templates", {
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0a0a18",
        color: "#e8e8f0",
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
          borderBottom: "1px solid #1e1e3a",
          background: "#0d0d1a",
          flexShrink: 0,
        }}
      >
        <Link2 href="/dashboard/workflows">
          <Button variant="ghost" size="sm" style={{ gap: 4 }}>
            <ArrowLeft size={14} /> Zurück
          </Button>
        </Link2>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <input
            value={meta.name}
            onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
            style={{
              background: "none",
              border: "none",
              color: "#e8e8f0",
              fontSize: 15,
              fontWeight: 600,
              outline: "none",
              minWidth: 200,
            }}
            placeholder="Workflow-Name"
          />
          <input
            value={meta.description}
            onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
            style={{
              background: "none",
              border: "none",
              color: "#8a8aa8",
              fontSize: 12,
              outline: "none",
              flex: 1,
            }}
            placeholder="Beschreibung (optional)"
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" size="sm" onClick={save} disabled={saving} style={{ gap: 4 }}>
            <Save size={14} />
            {saving ? "Speichern…" : saveStatus === "saved" ? "Gespeichert ✓" : "Speichern"}
          </Button>
          <Button size="sm" style={{ gap: 4, background: "#6366f1" }}>
            <Play size={14} /> Test
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Palette */}
        <div
          style={{
            width: 180,
            borderRight: "1px solid #1e1e3a",
            background: "#0d0d1a",
            padding: "12px 8px",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#6a6a8a",
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
                border: "1px solid #1e1e3a",
                borderRadius: 6,
                background: "none",
                color: "#c0c0d8",
                cursor: "pointer",
                fontSize: 12,
                marginBottom: 4,
                textAlign: "left",
                transition: "all 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = s.color)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e1e3a")}
            >
              <span style={{ color: s.color }}>{s.icon}</span>
              <span>{s.label}</span>
              <Plus size={11} style={{ marginLeft: "auto", opacity: 0.5 }} />
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          style={{
            flex: 1,
            position: "relative",
            overflow: "auto",
            background: "radial-gradient(circle at 50% 50%, #0f0f20 0%, #0a0a18 100%)",
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
                  stroke="#1e1e3a"
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
                color: "#6a6a8a",
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
                onMouseDown={(e) => onMouseDown(e, step.id)}
                style={{
                  position: "absolute",
                  left: step.x,
                  top: step.y,
                  width: 200,
                  background: "#0d0d1a",
                  border: `2px solid ${isSelected ? cfg.color : "#1e1e3a"}`,
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
                    borderBottom: "1px solid #1e1e3a",
                  }}
                >
                  <span style={{ color: cfg.color }}>{cfg.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#e8e8f0", flex: 1 }}>
                    {step.label}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteStep(step.id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#ef4444",
                      padding: 2,
                      display: "flex",
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                {/* Step Body */}
                <div
                  style={{
                    padding: "6px 10px",
                    fontSize: 11,
                    color: "#8a8aa8",
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
              borderLeft: "1px solid #1e1e3a",
              background: "#0d0d1a",
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
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6a6a8a" }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 10,
                  color: "#6a6a8a",
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
                  background: "#0a0a18",
                  border: "1px solid #1e1e3a",
                  borderRadius: 5,
                  padding: "6px 8px",
                  color: "#e8e8f0",
                  fontSize: 12,
                }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 10,
                  color: "#6a6a8a",
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
                  background: "#0a0a18",
                  border: "1px solid #1e1e3a",
                  borderRadius: 5,
                  padding: "6px 8px",
                  color: "#e8e8f0",
                  fontSize: 12,
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 10,
                  color: "#6a6a8a",
                  textTransform: "uppercase",
                  letterSpacing: "0.4px",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Hängt ab von
              </label>
              <select
                value={selected.dependsOn ?? ""}
                onChange={(e) =>
                  updateStep(selected.id, { dependsOn: e.target.value || undefined })
                }
                style={{
                  width: "100%",
                  background: "#0a0a18",
                  border: "1px solid #1e1e3a",
                  borderRadius: 5,
                  padding: "6px 8px",
                  color: "#e8e8f0",
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
                  color: "#6a6a8a",
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
                  background: "#0a0a18",
                  border: "1px solid #1e1e3a",
                  borderRadius: 5,
                  padding: "6px 8px",
                  color: "#e8e8f0",
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
              style={{
                width: "100%",
                padding: "8px",
                background: "#ef444415",
                border: "1px solid #ef444430",
                borderRadius: 5,
                color: "#f87171",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
            >
              <Trash2 size={12} /> Step löschen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
