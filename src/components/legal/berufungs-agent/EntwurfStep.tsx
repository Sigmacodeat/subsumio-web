"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Loader2,
  AlertTriangle,
  PenTool,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Save,
  FileText,
  Square,
  Check,
  CloudOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { AIActConformityBanner } from "@/components/legal/AIActConformityBanner";
import { AI_FRONTMATTER } from "@/lib/ai-act";
import { useAutosave } from "@/lib/hooks/use-autosave";
import type { BerufungsGrund } from "@/app/dashboard/berufungs-agent/page";

interface EntwurfStepProps {
  caseSlug: string;
  selectedGruende: BerufungsGrund[];
  draftContent: string;
  onDraftChange: (content: string) => void;
  draftSlug: string;
  onDraftSlugChange: (slug: string) => void;
  onNext: () => void;
  onBack: () => void;
  canProceed: boolean;
}

export function EntwurfStep({
  caseSlug,
  selectedGruende,
  draftContent,
  onDraftChange,
  draftSlug,
  onDraftSlugChange,
  onNext,
  onBack,
  canProceed,
}: EntwurfStepProps) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [jurisdiction, setJurisdiction] = useState<"at" | "de" | "ch">("at");
  const [court, setCourt] = useState("");
  const [fileNumber, setFileNumber] = useState("");
  const { addToast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-suggest draft slug from case slug
  useEffect(() => {
    if (!draftSlug && caseSlug) {
      const slug = `legal/berufungs-entwurf/${caseSlug}-${Date.now()}`;
      onDraftSlugChange(slug);
    }
  }, [caseSlug, draftSlug, onDraftSlugChange]);

  const generate = useCallback(async () => {
    if (selectedGruende.length === 0) {
      addToast({
        type: "error",
        title: "Keine Gründe ausgewählt",
        description: "Wählen Sie mindestens einen Berufungsgrund aus Schritt 2.",
      });
      return;
    }

    setGenerating(true);
    setError(null);
    setStreamingContent("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const gruendeSummary = selectedGruende
      .map(
        (g, i) =>
          `${i + 1}. ${g.titel} (Prognose ${g.erfolgsprognose}/5): ${g.beschreibung}${g.quelle ? ` [${g.quelle}]` : ""}`
      )
      .join("\n\n");

    const fullInstructions = `Erstelle einen vollständigen Berufungsschriftsatz basierend auf folgenden Berufungsgründen:

${gruendeSummary}

${instructions ? `Zusätzliche Anweisungen: ${instructions}` : ""}

Der Schriftsatz soll enthalten:
- Rubrum (Parteien)
- Begründung mit rechtlicher und tatsächlicher Argumentation
- Klare Antragstellung
- Normbezüge und Rechtsprechungszitate`;

    try {
      const result = await api.legal.schriftsatz({
        case_slug: caseSlug,
        document_type: "berufung",
        instructions: fullInstructions,
        jurisdiction,
        court: court || undefined,
        file_number: fileNumber || undefined,
        language: "de",
        onChunk: (chunk) => {
          setStreamingContent((prev) => prev + chunk);
        },
      });
      if (ctrl.signal.aborted) return;
      onDraftChange(result.content);
      addToast({
        type: "success",
        title: "Entwurf generiert",
        description: `${result.content.length} Zeichen — jetzt editierbar.`,
      });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addToast({ type: "error", title: "Generierung fehlgeschlagen", description: msg });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setGenerating(false);
    }
  }, [
    selectedGruende,
    caseSlug,
    instructions,
    jurisdiction,
    court,
    fileNumber,
    onDraftChange,
    addToast,
  ]);

  const abortGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
    setStreamingContent((prev) => {
      if (prev) onDraftChange(prev);
      return prev;
    });
    addToast({
      type: "info",
      title: "Generierung abgebrochen",
      description: "Bisheriger Inhalt wurde übernommen.",
    });
  }, [onDraftChange, addToast]);

  // Auto-scroll textarea to bottom during streaming
  useEffect(() => {
    if (generating && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [streamingContent, generating]);

  const saveAsPage = useCallback(async () => {
    if (!draftContent.trim() || !draftSlug) return;
    setSaving(true);
    try {
      const frontmatter = {
        ...AI_FRONTMATTER,
        case_slug: caseSlug,
        document_type: "berufung",
        jurisdiction,
        court: court || undefined,
        file_number: fileNumber || undefined,
        selected_gruende: selectedGruende.map((g) => g.id),
        generated_at: new Date().toISOString(),
        auto_created: false, // explicit save overrides auto-created flag
      };
      // If the page was auto-created by the autosave feature, it already
      // exists — use updatePage (merge:true) instead of createPage to avoid
      // a duplicate-slug error.
      const wasAutoCreated = autoSlugRef.current === draftSlug;
      if (wasAutoCreated) {
        await api.brain.updatePage({
          slug: draftSlug,
          content: draftContent,
          frontmatter,
        });
      } else {
        await api.brain.createPage({
          slug: draftSlug,
          title: `Berufungsentwurf — ${caseSlug}`,
          content: draftContent,
          type: "berufungs_entwurf",
          frontmatter,
        });
      }
      addToast({
        type: "success",
        title: "Entwurf gespeichert",
        description: `Als Brain-Page unter ${draftSlug} gespeichert.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({ type: "error", title: "Speichern fehlgeschlagen", description: msg });
    } finally {
      setSaving(false);
    }
  }, [
    draftContent,
    draftSlug,
    caseSlug,
    jurisdiction,
    court,
    fileNumber,
    selectedGruende,
    addToast,
  ]);

  // Auto-save draft content to brain-page (debounced, request-deduped).
  // Two modes:
  //   1. No draftSlug yet → auto-create the page (createPage), then store the slug.
  //   2. draftSlug exists → updatePage with merge:true (preserves frontmatter).
  // This protects against data loss from the very first edit, not just after
  // a manual save.
  const autoSlugRef = useRef<string | null>(null);
  const autoSaveFn = useCallback(
    async (content: string, signal: AbortSignal) => {
      const slug = draftSlug || autoSlugRef.current;
      if (slug) {
        await api.brain.updatePage({
          slug,
          content,
          frontmatter: { ...AI_FRONTMATTER, last_autosaved_at: new Date().toISOString() },
        });
      } else {
        // Auto-generate a slug and create the page
        const autoSlug = `legal/berufungs-entwurf/${caseSlug}-${Date.now()}`;
        await api.brain.createPage({
          slug: autoSlug,
          title: `Berufungsentwurf — ${caseSlug}`,
          content,
          type: "berufungs_entwurf",
          frontmatter: {
            ...AI_FRONTMATTER,
            case_slug: caseSlug,
            document_type: "berufung",
            jurisdiction,
            court: court || undefined,
            file_number: fileNumber || undefined,
            selected_gruende: selectedGruende.map((g) => g.id),
            auto_created: true,
            last_autosaved_at: new Date().toISOString(),
          },
        });
        autoSlugRef.current = autoSlug;
        onDraftSlugChange(autoSlug);
      }
      if (signal.aborted) return;
    },
    [draftSlug, caseSlug, jurisdiction, court, fileNumber, selectedGruende, onDraftSlugChange]
  );
  const { status: autoStatus, lastSavedAt } = useAutosave(draftContent, autoSaveFn, {
    delay: 1500,
    enabled: () => draftContent.trim().length > 0 && !generating,
  });

  const displayContent = generating ? streamingContent : draftContent;

  const autoSaveLabel = (() => {
    if (generating) return null;
    if (autoStatus === "saving") return { icon: Loader2, text: "Speichert …", spin: true };
    if (autoStatus === "saved" && lastSavedAt)
      return {
        icon: Check,
        text: `Gespeichert ${lastSavedAt.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}`,
        spin: false,
      };
    if (autoStatus === "failed")
      return { icon: CloudOff, text: "Speichern fehlgeschlagen", spin: false };
    if (autoStatus === "dirty") return { icon: Save, text: "Nicht gespeichert", spin: false };
    return null;
  })();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <PenTool className="h-5 w-5 text-[color:var(--brand-primary)]" />
          Schritt 3: Entwurf
        </h2>
        <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
          Die KI erstellt einen vollständigen Berufungsschriftsatz aus den ausgewählten Gründen. Der
          Entwurf ist editierbar — ändern Sie ihn direkt im Textfeld.
        </p>
      </div>

      {/* Generation form */}
      {!draftContent && !generating && (
        <div className="space-y-4 rounded-lg border bg-[color:var(--ds-surface-2)]/20 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="jurisdiction">Jurisdiktion</Label>
              <select
                id="jurisdiction"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value as "at" | "de" | "ch")}
                className="w-full rounded-md border bg-[color:var(--ds-bg)] px-3 py-2 text-sm"
              >
                <option value="at">Österreich</option>
                <option value="de">Deutschland</option>
                <option value="ch">Schweiz</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="court">Gericht (optional)</Label>
              <Input
                id="court"
                value={court}
                onChange={(e) => setCourt(e.target.value)}
                placeholder="z.B. OLG Wien"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file-number">Geschäftszahl (optional)</Label>
              <Input
                id="file-number"
                value={fileNumber}
                onChange={(e) => setFileNumber(e.target.value)}
                placeholder="z.B. 6 O 123/24"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="instructions">Zusätzliche Anweisungen (optional)</Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="z.B. 'Fokus auf Verfahrensfehler, formaler Antrag auf Aufhebung und Zurückverweisung'"
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)]">
            <FileText className="h-4 w-4" />
            {selectedGruende.length} {selectedGruende.length !== 1 ? "Gründe" : "Grund"} ausgewählt
          </div>
          <Button onClick={generate} className="gap-2">
            <PenTool className="h-4 w-4" />
            Schriftsatz generieren
          </Button>
        </div>
      )}

      {/* Generating state */}
      {generating && (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-[color:var(--ds-surface-2)]/20 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[color:var(--brand-primary)]" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              Schriftsatz wird gestreamt — {streamingContent.length.toLocaleString("de-AT")} Zeichen
              empfangen …
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={abortGeneration} className="gap-2">
            <Square className="h-3 w-3" />
            Abbrechen
          </Button>
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

      {/* Draft editor */}
      {displayContent && (
        <div className="space-y-3">
          <AIActConformityBanner purpose="Berufungsschriftsatz-Entwurf" compact />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">
                Entwurf ({displayContent.length.toLocaleString("de-AT")} Zeichen)
              </h3>
              {autoSaveLabel && (
                <span
                  className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]"
                  role="status"
                  aria-live="polite"
                >
                  <autoSaveLabel.icon
                    className={autoSaveLabel.spin ? "h-3 w-3 animate-spin" : "h-3 w-3"}
                  />
                  {autoSaveLabel.text}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={saveAsPage}
                disabled={saving || !draftContent.trim()}
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Als Brain-Page speichern
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={generate}
                disabled={generating}
                className="gap-2"
              >
                <RefreshCw className="h-3 w-3" />
                Neu generieren
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="draft-slug">Brain-Page Slug</Label>
            <Input
              id="draft-slug"
              value={draftSlug}
              onChange={(e) => onDraftSlugChange(e.target.value)}
              placeholder="legal/berufungs-entwurf/..."
              className="font-mono text-xs"
            />
          </div>
          <Textarea
            ref={textareaRef}
            value={displayContent}
            onChange={(e) => onDraftChange(e.target.value)}
            disabled={generating}
            rows={20}
            className="font-mono text-sm leading-relaxed"
            placeholder="Der generierte Schriftsatz erscheint hier — Sie können ihn bearbeiten."
            aria-label="Schriftsatz-Entwurf Editor"
          />
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="gap-2">
          Weiter zur Gegner-Simulation
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
