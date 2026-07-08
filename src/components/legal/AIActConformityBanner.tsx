"use client";

import { useState } from "react";
import { ShieldCheck, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Info } from "lucide-react";

export interface AIActConformityBannerProps {
  /** z.B. "Vertragsanalyse", "Risikoprüfung", "Zusammenfassung" */
  purpose: string;
  /** Anonymisierter AI-System-Name für Transparenz */
  aiSystem?: string;
  showExpanded?: boolean;
  onFeedback?: (helpful: boolean) => void;
  /** Kompakter Inline-Stil (für Listen/Tabellen) */
  compact?: boolean;
}

/**
 * EU AI Act Conformity Notice
 * Gemäß Art. 52 EU AI Act (Transparenzpflicht für bestimmte KI-Systeme)
 * und Art. 13 (Transparenz bei Hochrisiko-KI-Systemen nach Annex III Nr. 8).
 */
export function AIActConformityBanner({
  purpose,
  aiSystem = "Subsumio Legal AI",
  showExpanded: initialExpanded = false,
  onFeedback,
  compact = false,
}: AIActConformityBannerProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [feedbackGiven, setFeedbackGiven] = useState<boolean | null>(null);

  const handleFeedback = (helpful: boolean) => {
    setFeedbackGiven(helpful);
    onFeedback?.(helpful);
  };

  if (compact) {
    return (
      <div className="ai-act-compact inline-flex items-center gap-1 rounded border border-[color:var(--ds-control-border)] bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 text-[11px] text-[color:var(--ds-text-muted)]">
        <ShieldCheck size={11} className="shrink-0 text-[color:var(--brand-text)]" />
        <span>KI-generiert · EU AI Act Art. 52</span>
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-[color:var(--ds-control-border)] bg-[color:var(--ds-surface)] text-xs text-[color:var(--ds-text)]">
      {/* Collapsed Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--ds-ring)]"
        aria-expanded={expanded}
      >
        <ShieldCheck size={13} className="shrink-0 text-[color:var(--brand-text)]" />
        <span className="flex-1 text-[11px]">
          KI-Analyse ({purpose}) — EU AI Act konform · Menschliche Überprüfung empfohlen
        </span>
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-[color:var(--ds-border)] p-3">
          <div className="grid gap-2.5">
            <InfoRow icon={<Info size={13} />} label="KI-System">
              {aiSystem} — Large Language Model, gehostet in der EU (Frankfurt/Wien)
            </InfoRow>

            <InfoRow icon={<ShieldCheck size={13} />} label="Verwendungszweck">
              {purpose} — Unterstützung anwaltlicher Tätigkeit, kein Ersatz für rechtlichen Rat
            </InfoRow>

            <InfoRow icon={<ShieldCheck size={13} />} label="Regulierungsrahmen">
              Dieses System fällt gemäß EU AI Act Annex III Nr. 8 (Rechtspflege) potenziell unter
              Hochrisiko-KI. Subsumio implementiert Art. 14 (menschliche Aufsicht), Art. 13
              (Transparenz) und Art. 52 (Nutzerkennzeichnung).
            </InfoRow>

            <InfoRow icon={<ShieldCheck size={13} />} label="Menschliche Überprüfung">
              KI-generierte Ergebnisse sind Arbeitshypothesen, keine Rechtsauskunft. Jede Ausgabe
              muss von einer qualifizierten Rechtsanwältin / einem qualifizierten Rechtsanwalt
              überprüft werden, bevor sie gegenüber Mandanten oder Gerichten verwendet wird.
            </InfoRow>

            <InfoRow icon={<ShieldCheck size={13} />} label="Datenverarbeitung">
              Inhalte werden für die Analyse temporär verarbeitet und nicht für KI-Training
              verwendet. Weitere Informationen: Datenschutzerklärung.
            </InfoRow>
          </div>

          {/* Feedback */}
          {onFeedback && (
            <div className="mt-3 border-t border-[color:var(--ds-border)] pt-2.5">
              {feedbackGiven === null ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[color:var(--ds-text-muted)]">
                    War diese Analyse hilfreich?
                  </span>
                  <button onClick={() => handleFeedback(true)} className={feedbackBtnClasses}>
                    <ThumbsUp size={12} /> Ja
                  </button>
                  <button onClick={() => handleFeedback(false)} className={feedbackBtnClasses}>
                    <ThumbsDown size={12} /> Nein
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-[color:var(--ds-success-text)]">
                  ✓ Feedback gespeichert — danke!
                </span>
              )}
            </div>
          )}

          <div className="mt-2 text-[10px] text-[color:var(--ds-text-subtle)]">
            EU AI Act (VO 2024/1689) · ISO 42001 · Konformitätserklärung:{" "}
            <a
              href="/dashboard/compliance/ai-act"
              className="font-medium text-[color:var(--brand-text)] underline-offset-2 hover:underline"
            >
              subsumio.ai/compliance
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-px shrink-0 text-[color:var(--brand-text)]">{icon}</div>
      <div>
        <div className="mb-0.5 text-[10px] font-semibold tracking-[0.04em] text-[color:var(--ds-text-muted)] uppercase">
          {label}
        </div>
        <div className="text-xs leading-6 text-[color:var(--ds-text)]">{children}</div>
      </div>
    </div>
  );
}

const feedbackBtnClasses =
  "inline-flex cursor-pointer items-center gap-1 rounded border border-[color:var(--ds-control-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-[11px] text-[color:var(--ds-text)] transition-colors hover:bg-[color:var(--ds-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ds-ring)]";
