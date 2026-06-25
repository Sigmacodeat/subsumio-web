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
      <div
        className="ai-act-compact"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "11px",
          color: "#8a8aa8",
          padding: "2px 6px",
          background: "#1e1e3a",
          borderRadius: "4px",
          border: "1px solid #2a2a4a",
        }}
      >
        <ShieldCheck size={11} style={{ color: "#6366f1" }} />
        <span>KI-generiert · EU AI Act Art. 52</span>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #2a2a4a",
        borderRadius: "8px",
        background: "#0d0d1a",
        fontSize: "12px",
        overflow: "hidden",
        marginTop: "8px",
      }}
    >
      {/* Collapsed Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#8a8aa8",
          textAlign: "left",
        }}
      >
        <ShieldCheck size={13} style={{ color: "#6366f1", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: "11px" }}>
          KI-Analyse ({purpose}) — EU AI Act konform · Menschliche Überprüfung empfohlen
        </span>
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div style={{ borderTop: "1px solid #1e1e3a", padding: "12px" }}>
          <div style={{ display: "grid", gap: "10px" }}>
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
            <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #1e1e3a" }}>
              {feedbackGiven === null ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#6a6a8a" }}>
                    War diese Analyse hilfreich?
                  </span>
                  <button onClick={() => handleFeedback(true)} style={feedbackBtnStyle}>
                    <ThumbsUp size={12} /> Ja
                  </button>
                  <button onClick={() => handleFeedback(false)} style={feedbackBtnStyle}>
                    <ThumbsDown size={12} /> Nein
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: "11px", color: "#22c55e" }}>
                  ✓ Feedback gespeichert — danke!
                </span>
              )}
            </div>
          )}

          <div style={{ marginTop: "8px", fontSize: "10px", color: "#5a5a7a" }}>
            EU AI Act (VO 2024/1689) · ISO 42001 · Konformitätserklärung:{" "}
            <a
              href="/dashboard/compliance/ai-act"
              style={{ color: "#6366f1", textDecoration: "none" }}
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
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
      <div style={{ color: "#6366f1", marginTop: "1px", flexShrink: 0 }}>{icon}</div>
      <div>
        <div
          style={{
            fontSize: "10px",
            color: "#6a6a8a",
            fontWeight: 600,
            marginBottom: "2px",
            textTransform: "uppercase",
            letterSpacing: "0.4px",
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: "12px", color: "#a0a0c0", lineHeight: 1.5 }}>{children}</div>
      </div>
    </div>
  );
}

const feedbackBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "4px 8px",
  background: "#1e1e3a",
  border: "1px solid #2a2a4a",
  borderRadius: "4px",
  color: "#c0c0d8",
  fontSize: "11px",
  cursor: "pointer",
};
