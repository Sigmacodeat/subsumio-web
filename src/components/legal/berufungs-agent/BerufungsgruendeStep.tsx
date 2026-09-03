"use client";

import { useState, useCallback } from "react";
import {
  Loader2,
  AlertTriangle,
  Target,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Star,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AIActConformityBanner } from "@/components/legal/AIActConformityBanner";
import type { ActAnalysis, BerufungsGrund } from "@/app/dashboard/berufungs-agent/page";

interface BerufungsgruendeStepProps {
  caseSlug: string;
  analysis: ActAnalysis | null;
  berufungsgruende: BerufungsGrund[];
  onGruendeChange: (g: BerufungsGrund[]) => void;
  onNext: () => void;
  onBack: () => void;
  canProceed: boolean;
}

const LABEL_STYLES = {
  stark:
    "bg-emerald-500/10 text-emerald-700 border-[color:var(--ds-success-border)]/30 dark:text-[color:var(--ds-success-text)]",
  mittel:
    "bg-[color:var(--ds-warning-bg)]/10 text-amber-700 border-[color:var(--ds-warning-border)]/30 dark:text-[color:var(--ds-warning-text)]",
  schwach:
    "bg-[color:var(--ds-danger-bg)]/10 text-[color:var(--ds-danger-text)] border-[color:var(--ds-danger-border)]/30 dark:text-[color:var(--ds-danger-text)]",
} as const;

const LABEL_TEXT = { stark: "Stark", mittel: "Mittel", schwach: "Schwach" } as const;

function labelFromScore(score: number): "stark" | "mittel" | "schwach" {
  if (score >= 4) return "stark";
  if (score >= 2) return "mittel";
  return "schwach";
}

/** Sortable wrapper for a single BerufungsGrund item. */
function SortableGrund({
  grund,
  onToggle,
  onRemove,
}: {
  grund: BerufungsGrund;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: grund.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border p-4 transition-all",
        grund.selected
          ? "border-[color:var(--brand-primary)]/40 bg-[color:var(--brand-primary)]/5"
          : "border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle — keyboard accessible via dnd-kit KeyboardSensor */}
        <button
          type="button"
          className="mt-0.5 flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none active:cursor-grabbing"
          aria-label="Grund verschieben"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {/* Selection toggle */}
        <button
          type="button"
          onClick={() => onToggle(grund.id)}
          aria-label={grund.selected ? "Abwählen" : "Auswählen"}
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all",
            "focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none",
            grund.selected
              ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-[color:var(--brand-primary-foreground)]"
              : "border-[color:var(--ds-text-muted)]/30 hover:border-[color:var(--brand-primary)]/50"
          )}
        >
          {grund.selected && (
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
              <path
                d="M2 6l3 3 5-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="text-sm font-medium">
                {grund.titel}
                {grund.manuell && (
                  <Badge variant="info" className="ml-2 text-[10px]">
                    Manuell
                  </Badge>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div
                className="flex items-center gap-0.5"
                aria-label={`Erfolgsprognose ${grund.erfolgsprognose} von 5`}
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-3 w-3",
                      i < grund.erfolgsprognose
                        ? "fill-[color:var(--ds-warning-text)] text-[color:var(--ds-warning-text)]"
                        : "text-[color:var(--ds-text-muted)]/30"
                    )}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <Badge variant="default" className={cn("text-xs", LABEL_STYLES[grund.label])}>
                {LABEL_TEXT[grund.label]}
              </Badge>
              <button
                type="button"
                onClick={() => onRemove(grund.id)}
                aria-label="Grund löschen"
                className="rounded p-1 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-danger-bg)]/10 hover:text-[color:var(--ds-danger-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p className="text-sm text-[color:var(--ds-text-muted)]">{grund.beschreibung}</p>
          {grund.quelle && (
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              <span className="font-medium">Quelle:</span> {grund.quelle}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function BerufungsgruendeStep({
  caseSlug,
  analysis,
  berufungsgruende,
  onGruendeChange,
  onNext,
  onBack,
  canProceed,
}: BerufungsgruendeStepProps) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitel, setManualTitel] = useState("");
  const [manualBeschreibung, setManualBeschreibung] = useState("");
  const [manualScore, setManualScore] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [manualQuelle, setManualQuelle] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const { addToast } = useToast();

  // dnd-kit sensors: pointer for mouse/touch, keyboard for accessibility.
  // Keyboard: Tab to focus drag handle, Space to pick up, arrows to move,
  // Space to drop, Escape to cancel.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = berufungsgruende.findIndex((g) => g.id === active.id);
      const newIndex = berufungsgruende.findIndex((g) => g.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(berufungsgruende, oldIndex, newIndex);
      onGruendeChange(reordered);
      // Persist the new order to case frontmatter (best-effort, fire-and-forget)
      void api.legal
        .reorderGruende({
          case_slug: caseSlug,
          gruende_order: reordered.map((g) => g.id),
        })
        .catch(() => {
          // Best-effort — silent failure, user can reorder again
        });
    },
    [berufungsgruende, onGruendeChange, caseSlug]
  );

  const activeDragGrund = activeDragId ? berufungsgruende.find((g) => g.id === activeDragId) : null;

  const generate = useCallback(async () => {
    if (!caseSlug) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await api.legal.berufungsgruende({
        case_slug: caseSlug,
        analysis: analysis ?? undefined,
        jurisdiction: "all",
        language: "de",
      });
      const gruende: BerufungsGrund[] = result.gruende.map((g) => ({
        ...g,
        selected: true,
      }));
      onGruendeChange(gruende);
      addToast({
        type: "success",
        title: "Berufungsgründe generiert",
        description: `${gruende.length} Gründe identifiziert.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addToast({ type: "error", title: "Generierung fehlgeschlagen", description: msg });
    } finally {
      setGenerating(false);
    }
  }, [caseSlug, analysis, onGruendeChange, addToast]);

  const toggleSelect = useCallback(
    (id: string) => {
      onGruendeChange(
        berufungsgruende.map((g) => (g.id === id ? { ...g, selected: !g.selected } : g))
      );
    },
    [berufungsgruende, onGruendeChange]
  );

  const removeGrund = useCallback(
    (id: string) => {
      onGruendeChange(berufungsgruende.filter((g) => g.id !== id));
    },
    [berufungsgruende, onGruendeChange]
  );

  const addManual = useCallback(() => {
    if (!manualTitel.trim()) return;
    const newGrund: BerufungsGrund = {
      id: `manual-${Date.now()}`,
      titel: manualTitel.trim(),
      beschreibung: manualBeschreibung.trim(),
      erfolgsprognose: manualScore,
      label: labelFromScore(manualScore),
      quelle: manualQuelle.trim() || undefined,
      selected: true,
      manuell: true,
    };
    onGruendeChange([...berufungsgruende, newGrund]);
    setManualTitel("");
    setManualBeschreibung("");
    setManualScore(3);
    setManualQuelle("");
    setShowManualForm(false);
    addToast({ type: "success", title: "Grund hinzugefügt" });
  }, [
    manualTitel,
    manualBeschreibung,
    manualScore,
    manualQuelle,
    berufungsgruende,
    onGruendeChange,
    addToast,
  ]);

  const selectedCount = berufungsgruende.filter((g) => g.selected).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Target className="h-5 w-5 text-[color:var(--brand-primary)]" />
          Schritt 2: Berufungsgründe
        </h2>
        <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
          Die KI identifiziert mögliche Rechtsmittelgründe — verfahrensrechtlich,
          materiell-rechtlich und tatsächlich. Wählen Sie die Gründe aus, die Sie in den Entwurf
          aufnehmen möchten.
        </p>
      </div>

      {/* Generate button */}
      {berufungsgruende.length === 0 && !generating && (
        <div className="flex flex-col items-start gap-3 rounded-md border bg-[color:var(--ds-surface-2)]/20 p-4">
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Die KI analysiert den Fall und identifiziert konkrete Berufungs-, Revisions- oder
            Beschwerdegründe mit Erfolgsprognose und Normbezug.
          </p>
          <Button onClick={generate} disabled={generating} className="gap-2">
            <Target className="h-4 w-4" />
            Berufungsgründe generieren
          </Button>
        </div>
      )}

      {/* Generating state */}
      {generating && (
        <div className="flex items-center gap-3 rounded-md border bg-[color:var(--ds-surface-2)]/20 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-[color:var(--brand-primary)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Berufungsgründe werden analysiert — das kann 30–60 Sekunden dauern …
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-md border border-[color:var(--ds-danger-border)]/30 bg-[color:var(--ds-danger-bg)]/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[color:var(--ds-danger-text)]" />
          <div className="flex-1">
            <p className="text-sm font-medium text-[color:var(--ds-danger-text)]">
              Generierung fehlgeschlagen
            </p>
            <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">{error}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={generate}
            disabled={generating}
            className="gap-2"
          >
            <RefreshCw className="h-3 w-3" />
            Erneut
          </Button>
        </div>
      )}

      {/* Generated grounds */}
      {berufungsgruende.length > 0 && (
        <div className="space-y-3">
          <AIActConformityBanner purpose="Berufungsgründe-Analyse" compact />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {berufungsgruende.length} {berufungsgruende.length !== 1 ? "Gründe" : "Grund"}{" "}
              identifiziert
              <span className="ml-2 text-[color:var(--ds-text-muted)]">
                ({selectedCount} ausgewählt)
              </span>
            </h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={generate}
                disabled={generating}
                className="gap-2"
              >
                <RefreshCw className="h-3 w-3" />
                Neu generieren
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowManualForm(!showManualForm)}
                className="gap-2"
              >
                <Plus className="h-3 w-3" />
                Manuellem Grund
              </Button>
            </div>
          </div>

          {/* Manual form */}
          {showManualForm && (
            <div className="space-y-3 rounded-lg border bg-[color:var(--ds-surface-2)]/20 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="manual-titel">Titel</Label>
                <Input
                  id="manual-titel"
                  value={manualTitel}
                  onChange={(e) => setManualTitel(e.target.value)}
                  placeholder="z.B. Verfahrensfehler — mangelnde Beweiswürdigung"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-desc">Beschreibung</Label>
                <Textarea
                  id="manual-desc"
                  value={manualBeschreibung}
                  onChange={(e) => setManualBeschreibung(e.target.value)}
                  placeholder="Detaillierte Beschreibung des Grundes…"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="manual-score">Erfolgsprognose (1–5)</Label>
                  <select
                    id="manual-score"
                    value={manualScore}
                    onChange={(e) => setManualScore(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                    className="w-full rounded-md border bg-[color:var(--ds-bg)] px-3 py-2 text-sm"
                  >
                    <option value={1}>1 — Gering</option>
                    <option value={2}>2 — Eher gering</option>
                    <option value={3}>3 — Mittel</option>
                    <option value={4}>4 — Gut</option>
                    <option value={5}>5 — Sehr gut</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="manual-quelle">Quelle (optional)</Label>
                  <Input
                    id="manual-quelle"
                    value={manualQuelle}
                    onChange={(e) => setManualQuelle(e.target.value)}
                    placeholder="z.B. § 421 ZPO; 6 Ob 123/21g OGH"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowManualForm(false)}>
                  Abbrechen
                </Button>
                <Button
                  size="sm"
                  onClick={addManual}
                  disabled={!manualTitel.trim()}
                  className="gap-2"
                >
                  <Plus className="h-3 w-3" />
                  Hinzufügen
                </Button>
              </div>
            </div>
          )}

          {/* Grounds list — sortable via dnd-kit (mouse, touch, keyboard) */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDragId(null)}
          >
            <SortableContext
              items={berufungsgruende.map((g) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-2">
                {berufungsgruende.map((grund) => (
                  <SortableGrund
                    key={grund.id}
                    grund={grund}
                    onToggle={toggleSelect}
                    onRemove={removeGrund}
                  />
                ))}
              </ul>
            </SortableContext>
            <DragOverlay>
              {activeDragGrund ? (
                <div className="rounded-lg border border-[color:var(--brand-primary)] bg-[color:var(--ds-surface)] p-4 shadow-lg">
                  <p className="text-sm font-medium">{activeDragGrund.titel}</p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="gap-2">
          Weiter zum Entwurf
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
