"use client";

import { useMemo, useState } from "react";
import { Check, Edit3, MessageSquareQuote, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { applyMatterKnowledgeMutation } from "@/lib/matter-knowledge";
import type { MatterUnderstandingPanel } from "@/lib/matter-context-types";
import type { KnowledgeReview } from "@/lib/matter-detail-types";

export function MatterAnalysisReview({
  understanding,
}: {
  understanding: MatterUnderstandingPanel;
}) {
  const ctx = useMatterDetail();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const matter = ctx.caseData;

  const pendingFacts = useMemo(() => {
    if (!matter) return [];
    const resolved = new Set(matter.knowledgeReviews.map((review) => review.fact_id));
    return understanding.facts.filter((fact) => !resolved.has(fact.id));
  }, [matter, understanding.facts]);

  if (!matter || pendingFacts.length === 0) return null;

  async function reviewFact(
    fact: (typeof pendingFacts)[number],
    status: KnowledgeReview["status"],
    correctedStatement?: string
  ) {
    if (!ctx.caseData) return;
    setSavingId(fact.id);
    const mutation = applyMatterKnowledgeMutation(
      {
        knowledge_reviews: ctx.caseData.knowledgeReviews,
        audit_log: ctx.caseData.auditLog,
      },
      {
        action:
          status === "approved"
            ? "approve"
            : status === "party_assertion"
              ? "mark_party_assertion"
              : status === "corrected"
                ? "correct"
                : "reject",
        factId: fact.id,
        statement: fact.statement,
        correctedStatement,
        source: {
          type: "upload_analysis",
          label: fact.source,
        },
        actor: { type: "lawyer" },
      }
    );
    const reviews = mutation.frontmatter.knowledge_reviews ?? [];
    const auditLog = mutation.frontmatter.audit_log ?? [];
    ctx.setCaseData({ ...ctx.caseData, knowledgeReviews: reviews, auditLog });
    try {
      await ctx.saveCaseUpdate({ knowledgeReviews: reviews, auditLog });
      setEditingId(null);
      setCorrection("");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div
      id="matter-analysis-review"
      className="mt-4 rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] p-3 md:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[color:var(--ds-info-text)]" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Analyse prüfen und freigeben
            </h3>
          </div>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {pendingFacts.length} Erkenntnis{pendingFacts.length === 1 ? "" : "se"} warten auf
            anwaltliche Einordnung.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {pendingFacts.slice(0, 6).map((fact) => (
          <article
            key={fact.id}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
          >
            <p className="text-sm text-[color:var(--ds-text)]">{fact.statement}</p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              Quelle: {fact.source} · Konfidenz: {fact.confidence}
            </p>

            {editingId === fact.id ? (
              <div className="mt-3 space-y-2">
                <label
                  htmlFor={`fact-correction-${fact.id}`}
                  className="text-xs font-medium text-[color:var(--ds-text)]"
                >
                  Korrigierte Fassung
                </label>
                <Textarea
                  id={`fact-correction-${fact.id}`}
                  value={correction}
                  onChange={(event) => setCorrection(event.target.value)}
                  rows={3}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!correction.trim() || savingId === fact.id}
                    onClick={() => void reviewFact(fact, "corrected", correction)}
                  >
                    Korrektur speichern
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Erkenntnis prüfen">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 text-xs"
                  disabled={savingId === fact.id}
                  onClick={() => void reviewFact(fact, "approved")}
                >
                  <Check size={13} aria-hidden="true" /> Bestätigen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 text-xs"
                  disabled={savingId === fact.id}
                  onClick={() => void reviewFact(fact, "party_assertion")}
                >
                  <MessageSquareQuote size={13} aria-hidden="true" /> Parteibehauptung
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 text-xs"
                  disabled={savingId === fact.id}
                  onClick={() => {
                    setEditingId(fact.id);
                    setCorrection(fact.statement);
                  }}
                >
                  <Edit3 size={13} aria-hidden="true" /> Korrigieren
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 gap-1.5 text-xs text-[color:var(--ds-danger-text)]"
                  disabled={savingId === fact.id}
                  onClick={() => void reviewFact(fact, "rejected")}
                >
                  <X size={13} aria-hidden="true" /> Verwerfen
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
