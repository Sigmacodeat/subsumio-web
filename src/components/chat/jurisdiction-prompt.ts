import type { Jurisdiction } from "@/components/chat/chat-types";

interface PromptJurisdiction {
  label: string;
  allowed: string[];
  forbidden: string[];
  collisions: string[];
}

/**
 * Deliberately compact client-side prompt policy.
 *
 * The complete 7,800-entry corpus registry is a server concern. Importing it
 * into the chat client used to add a 1.4 MB generated TypeScript object to the
 * browser graph and produced prompts containing thousands of law names. The
 * retrieval layer remains the authoritative, exhaustive jurisdiction fence;
 * this list gives the model the high-signal DACH rules it needs in the prompt.
 */
const PROMPT_JURISDICTIONS: Record<Jurisdiction, PromptJurisdiction> = {
  de: {
    label: "deutsches Recht",
    allowed: ["BGB", "ZPO", "StGB", "StPO", "HGB", "InsO", "KSchG", "BetrVG", "AO"],
    forbidden: ["ABGB", "UGB", "MRG", "EO", "AngG", "ArbVG", "OR", "ZGB"],
    collisions: [
      "KSchG = Kündigungsschutzgesetz (nicht österreichisches Konsumentenschutzgesetz)",
      "ZPO, StGB und StPO nur in der deutschen Fassung verwenden",
    ],
  },
  at: {
    label: "österreichisches Recht",
    allowed: ["ABGB", "ZPO", "StGB", "StPO", "UGB", "KSchG", "MRG", "EO", "AngG", "ArbVG", "BAO"],
    forbidden: ["BGB", "HGB", "InsO", "BetrVG", "AO", "OR", "ZGB"],
    collisions: [
      "KSchG = Konsumentenschutzgesetz (nicht deutsches Kündigungsschutzgesetz)",
      "ZPO, StGB und StPO nur in der österreichischen Fassung verwenden",
    ],
  },
  ch: {
    label: "schweizerisches Recht",
    allowed: ["OR", "ZGB", "ZPO", "StGB", "StPO", "SchKG", "ArG", "DSG"],
    forbidden: ["BGB", "ABGB", "HGB", "UGB", "KSchG", "InsO", "EO"],
    collisions: ["ZPO, StGB, StPO und DSG nur in der schweizerischen Fassung verwenden"],
  },
  eu: {
    label: "EU-Recht",
    allowed: ["DSGVO", "Rom I", "Rom II", "Brüssel Ibis", "EuGVVO"],
    forbidden: [],
    collisions: [],
  },
};

export function buildClientJurisdictionPromptSection(jurisdiction: Jurisdiction): string {
  const config = PROMPT_JURISDICTIONS[jurisdiction];
  const lines = [
    `## JURISDIKTION: ${config.label}`,
    "Die folgende Liste nennt häufige Gesetze, ist aber nicht abschließend.",
    `Erlaubte Rechtsquellen: ${config.allowed.join(", ")}.`,
  ];
  if (config.forbidden.length > 0) {
    lines.push(`Fremde Rechtsquellen ohne Cross-Border-Bezug: ${config.forbidden.join(", ")}.`);
  }
  lines.push(
    "Zitiere ausschließlich Quellen, die der Retrieval-Kontext tatsächlich geliefert hat.",
    "EU-Recht ist bei sachlichem Anwendungsbezug zulässig; fremdes nationales Recht nur bei explizitem Cross-Border-Bezug."
  );
  return lines.join("\n");
}

export function buildClientCollisionWarningSection(jurisdiction: Jurisdiction): string {
  const warnings = PROMPT_JURISDICTIONS[jurisdiction].collisions;
  if (warnings.length === 0) return "";
  return ["## ABKÜRZUNGSKOLLISIONEN — VORSICHT:", ...warnings.map((item) => `- ${item}`)].join(
    "\n"
  );
}
