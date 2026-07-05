/**
 * KI-Triage Engine
 * ================
 * Classifies incoming messages (beA, email, scan, whatsapp) by urgency,
 * legal area, and action type. Produces structured triage cards for the
 * Posteingang dashboard and feeds suggestions into the Rundown.
 */

export type TriageSource = "bea" | "email" | "scan" | "whatsapp" | "portal" | "manual";

export type TriageUrgency = "critical" | "high" | "medium" | "low";

export type TriageActionType =
  | "frist"
  | "termin"
  | "antwort"
  | "dokument"
  | "zahlung"
  | "info"
  | "konflikt";

export interface TriageCard {
  id: string;
  source: TriageSource;
  urgency: TriageUrgency;
  actionType: TriageActionType;
  title: string;
  summary: string;
  legalArea?: string;
  caseRef?: string;
  sender?: string;
  date: string;
  deadline?: string;
  suggestedCaseSlug?: string;
  confidence: "high" | "medium" | "low";
  status: "new" | "triaged" | "assigned" | "dismissed";
  rawSlug?: string;
}

export interface TriageInput {
  source: TriageSource;
  subject: string;
  body: string;
  sender?: string;
  date?: string;
  caseRef?: string;
  rawSlug?: string;
  suggestedCaseSlug?: string;
}

interface TriageRule {
  pattern: RegExp;
  urgency: TriageUrgency;
  actionType: TriageActionType;
  legalArea?: string;
}

const URGENCY_RULES: TriageRule[] = [
  // Fristen — always critical/high
  {
    pattern:
      /\b(frist|fristablauf|notfrist|einspruchsfrist|rechtsmittelfrist|widerspruchsfrist)\b/i,
    urgency: "critical",
    actionType: "frist",
  },
  {
    pattern: /\b(zustellung|zugestellt|postzustellungsurkunde)\b/i,
    urgency: "high",
    actionType: "frist",
  },
  {
    pattern: /\b(mahnung|mahnbescheid|vollstreckungsankündigung)\b/i,
    urgency: "high",
    actionType: "zahlung",
  },
  {
    pattern: /\b(gerichtstermin|verhandlung|mündliche verhandlung|terminsladung|ladung)\b/i,
    urgency: "critical",
    actionType: "termin",
  },
  {
    pattern: /\b(klage|klageschrift|klageerwiderung|schlussschrift)\b/i,
    urgency: "high",
    actionType: "antwort",
  },
  {
    pattern: /\b(bescheid|verwaltungsakt|ablehnung|versagung)\b/i,
    urgency: "high",
    actionType: "antwort",
  },
  {
    pattern: /\b(urgesterreich|einstweilige anordnung|einstweiliger rechtsschutz)\b/i,
    urgency: "critical",
    actionType: "frist",
  },
  {
    pattern: /\b(zahlungserinnerung|zahlungsermahnung|überfällig|overdue)\b/i,
    urgency: "medium",
    actionType: "zahlung",
  },
  {
    pattern: /\b(dokumentenanforderung|unterlagen|nachreichung|vorlage)\b/i,
    urgency: "medium",
    actionType: "dokument",
  },
  { pattern: /\b(vollmacht|mandat|vertretung)\b/i, urgency: "medium", actionType: "dokument" },
  {
    pattern: /\b(konflikt|interessenkonflikt|gegenpartei)\b/i,
    urgency: "high",
    actionType: "konflikt",
  },
];

const LEGAL_AREA_RULES: Array<{ pattern: RegExp; area: string }> = [
  {
    pattern: /\b(scheidung|unterhalt|eheschließung|sorgerecht|umgangsrecht|familienrecht)\b/i,
    area: "familienrecht",
  },
  {
    pattern: /\b(kündigung|kuendigung|miete|mietvertrag|betriebskosten|nebenkosten)\b/i,
    area: "mietrecht",
  },
  {
    pattern: /\b(arbeitsvertrag|kündigungsschutz|abmahnung|lohn|gehalt|urlaub|arbeitsrecht)\b/i,
    area: "arbeitsrecht",
  },
  {
    pattern: /\b(unfall|haftpflicht|schadensersatz|versicherung|verkehrsrecht|unfallgutachten)\b/i,
    area: "verkehrsrecht",
  },
  {
    pattern: /\b(testament|erbfolge|nachlass|erbvertrag|pflichtteil|erbrecht)\b/i,
    area: "erbrecht",
  },
  {
    pattern: /\b(strafanzeige|straftat|ermittlungsverfahren|verteidigung|strafrecht)\b/i,
    area: "strafrecht",
  },
  {
    pattern: /\b(dsgvo|datenschutz|auskunft|löschung|datenschutzrecht)\b/i,
    area: "datenschutzrecht",
  },
  { pattern: /\b(steuer|finanzamt|einspruch|steuerrecht)\b/i, area: "steuerrecht" },
  {
    pattern: /\b(vertrag|werkvertrag|kaufvertrag|lieferung|vertragsrecht)\b/i,
    area: "vertragsrecht",
  },
  { pattern: /\b(insolvenz|insolvenzverfahren|restschuldbefreiung)\b/i, area: "insolvenzrecht" },
  {
    pattern: /\b(asyl|aufenthalt|abschiebung|ausländerrecht|migrationsrecht)\b/i,
    area: "ausländerrecht",
  },
  { pattern: /\b(sorgerecht|jugendamt|kindeswohl)\b/i, area: "familiengericht" },
];

function extractDeadline(text: string): string | undefined {
  // Look for date patterns near "frist" keywords
  const patterns = [
    /\b(?:bis|spätestens|vor)\s*(\d{1,2}\.\d{1,2}\.\d{4})\b/i,
    /\b(?:bis|spätestens|vor)\s*(\d{4}-\d{2}-\d{2})\b/i,
    /\bfrist.*?(\d{1,2}\.\d{1,2}\.\d{4})\b/i,
    /\bfrist.*?(\d{4}-\d{2}-\d{2})\b/i,
    /\b(\d{1,2}\.\d{1,2}\.\d{4})\s*(?:uhr|ende)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function inferLegalArea(text: string): string | undefined {
  for (const rule of LEGAL_AREA_RULES) {
    if (rule.pattern.test(text)) return rule.area;
  }
  return undefined;
}

function generateId(): string {
  return `triage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function triageMessage(input: TriageInput): TriageCard {
  const fullText = `${input.subject} ${input.body}`;
  let urgency: TriageUrgency = "low";
  let actionType: TriageActionType = "info";
  let confidence: "high" | "medium" | "low" = "low";

  for (const rule of URGENCY_RULES) {
    if (rule.pattern.test(fullText)) {
      urgency = rule.urgency;
      actionType = rule.actionType;
      confidence = "high";
      break;
    }
  }

  // If no rule matched, check for question marks or action verbs → medium
  if (urgency === "low" && /\?|bitte|ersuchen|anfordern/i.test(fullText)) {
    urgency = "medium";
    actionType = "info";
    confidence = "medium";
  }

  const legalArea = inferLegalArea(fullText);
  const deadline = actionType === "frist" ? extractDeadline(fullText) : undefined;

  // Boost urgency if deadline is within 3 days
  if (deadline) {
    const dl = new Date(
      deadline.includes(".") ? deadline.split(".").reverse().join("-") : deadline
    );
    const days = (dl.getTime() - Date.now()) / 86400000;
    if (days <= 3 && days >= 0) {
      urgency = "critical";
      confidence = "high";
    } else if (days <= 7 && days >= 0) {
      urgency = urgency === "low" ? "high" : urgency;
    }
  }

  const title = input.subject.slice(0, 120) || "Eingehende Nachricht";
  const summary = input.body.slice(0, 300).replace(/\s+/g, " ").trim();

  return {
    id: generateId(),
    source: input.source,
    urgency,
    actionType,
    title,
    summary,
    legalArea,
    caseRef: input.caseRef,
    sender: input.sender,
    date: input.date ?? new Date().toISOString(),
    deadline,
    suggestedCaseSlug: input.suggestedCaseSlug,
    confidence,
    status: "new",
    rawSlug: input.rawSlug,
  };
}

export function triageBatch(inputs: TriageInput[]): TriageCard[] {
  return inputs.map(triageMessage);
}

export const URGENCY_LABELS: Record<TriageUrgency, { de: string; en: string; color: string }> = {
  critical: {
    de: "Kritisch",
    en: "Critical",
    color: "border-red-500/20 bg-red-500/10 text-red-600",
  },
  high: { de: "Hoch", en: "High", color: "border-orange-500/20 bg-orange-500/10 text-orange-600" },
  medium: {
    de: "Mittel",
    en: "Medium",
    color: "border-amber-500/20 bg-amber-500/10 text-amber-600",
  },
  low: { de: "Niedrig", en: "Low", color: "border-slate-500/20 bg-slate-500/10 text-slate-600" },
};

export const ACTION_TYPE_LABELS: Record<TriageActionType, { de: string; en: string }> = {
  frist: { de: "Frist", en: "Deadline" },
  termin: { de: "Termin", en: "Hearing" },
  antwort: { de: "Antwort", en: "Response" },
  dokument: { de: "Dokument", en: "Document" },
  zahlung: { de: "Zahlung", en: "Payment" },
  info: { de: "Info", en: "Info" },
  konflikt: { de: "Konflikt", en: "Conflict" },
};

export const SOURCE_LABELS: Record<TriageSource, { de: string; en: string }> = {
  bea: { de: "beA", en: "beA" },
  email: { de: "E-Mail", en: "Email" },
  scan: { de: "Scan", en: "Scan" },
  whatsapp: { de: "WhatsApp", en: "WhatsApp" },
  portal: { de: "Portal", en: "Portal" },
  manual: { de: "Manuell", en: "Manual" },
};
