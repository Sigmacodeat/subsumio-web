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
