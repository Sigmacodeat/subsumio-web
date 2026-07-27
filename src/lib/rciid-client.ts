export type RciidCaseStatus =
  | "none"
  | "submitted"
  | "received"
  | "investigating"
  | "tracing"
  | "analyzing"
  | "reporting"
  | "completed"
  | "rejected";

export type BlockchainType = "BTC" | "ETH" | "USDT" | "SOL" | "LTC" | "XRP" | "TRX" | "UNKNOWN";

export const RCIID_STATUS_LABELS_DE: Record<RciidCaseStatus, string> = {
  none: "Nicht übermittelt",
  submitted: "Übermittelt",
  received: "Empfangen",
  investigating: "Untersuchung",
  tracing: "Verfolgung",
  analyzing: "Analyse",
  reporting: "Bericht",
  completed: "Abgeschlossen",
  rejected: "Abgelehnt",
};

export const RCIID_STATUS_LABELS_EN: Record<RciidCaseStatus, string> = {
  none: "Not submitted",
  submitted: "Submitted",
  received: "Received",
  investigating: "Investigating",
  tracing: "Tracing",
  analyzing: "Analyzing",
  reporting: "Reporting",
  completed: "Completed",
  rejected: "Rejected",
};

export const RCIID_STATUS_COLORS: Record<RciidCaseStatus, string> = {
  none: "#6a6a8a",
  submitted: "#6366f1",
  received: "#6366f1",
  investigating: "#f59e0b",
  tracing: "#f59e0b",
  analyzing: "#f59e0b",
  reporting: "#8b5cf6",
  completed: "#22c55e",
  rejected: "#ef4444",
};

export const RCIID_STATUS_ORDER: RciidCaseStatus[] = [
  "none",
  "submitted",
  "received",
  "investigating",
  "tracing",
  "analyzing",
  "reporting",
  "completed",
];

export function getRciidStatusProgress(status: RciidCaseStatus): number {
  if (status === "rejected") return 0;
  const idx = RCIID_STATUS_ORDER.indexOf(status);
  if (idx < 0) return 0;
  return Math.round((idx / (RCIID_STATUS_ORDER.length - 1)) * 100);
}

export function isRciidCaseActive(status: RciidCaseStatus): boolean {
  return !["none", "completed", "rejected"].includes(status);
}

export function isRciidCaseDone(status: RciidCaseStatus): boolean {
  return status === "completed" || status === "rejected";
}

// ── Data Quality Score ───────────────────────────────────────────────────────

export type RciidDataQualityScore = 1 | 2 | 3 | 4 | 5;

export const RCIID_QUALITY_LABELS_DE: Record<number, string> = {
  1: "Sehr niedrig — manuelle Prüfung erforderlich",
  2: "Niedrig — viele Daten fehlen",
  3: "Mittel — teilweise automatisierbar",
  4: "Gut — weitgehend automatisierbar",
  5: "Ausgezeichnet — voll automatisierbar",
};

export const RCIID_QUALITY_LABELS_EN: Record<number, string> = {
  1: "Very low — manual review required",
  2: "Low — much data missing",
  3: "Medium — partially automatable",
  4: "Good — largely automatable",
  5: "Excellent — fully automatable",
};

export const RCIID_QUALITY_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f59e0b",
  3: "#f59e0b",
  4: "#22c55e",
  5: "#22c55e",
};

export function getQualityColor(score: number): string {
  return RCIID_QUALITY_COLORS[score] ?? "#6a6a8a";
}

export function getQualityLabel(score: number, lang: "de" | "en" = "de"): string {
  const labels = lang === "en" ? RCIID_QUALITY_LABELS_EN : RCIID_QUALITY_LABELS_DE;
  return labels[score] ?? "Unbekannt";
}
