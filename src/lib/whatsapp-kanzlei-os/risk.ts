import type { WhatsAppIdentity, WhatsAppIncomingMessage } from "@/lib/whatsapp/types";

export type KanzleiOsActorRole = "admin" | "lawyer" | "assistant" | "client" | "external" | "intake" | "unknown";

export type KanzleiOsRiskLevel = "low" | "medium" | "high" | "critical";

export interface IntentRisk {
  intent: string;
  riskLevel: KanzleiOsRiskLevel;
  requiresApproval: boolean;
  clientFacing: boolean;
}

function normalizeRole(role: WhatsAppIdentity["role"] | undefined): KanzleiOsActorRole {
  return role ?? "unknown";
}

export function textFromWhatsAppMessage(message: WhatsAppIncomingMessage): string {
  if (message.type === "text") return message.text;
  if (message.type === "button_reply") return message.buttonText || message.buttonId;
  if (message.type === "list_reply") return message.listTitle || message.listRowId;
  if ("caption" in message && typeof message.caption === "string") return message.caption;
  if (message.type === "location") return [message.name, message.address].filter(Boolean).join(" ");
  if (message.type === "contact") return message.contacts.map((c) => c.formattedName).join("; ");
  if (message.type === "reaction") return message.emoji;
  return "";
}

export function inferWhatsAppIntent(text: string, messageType?: WhatsAppIncomingMessage["type"]): string {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (messageType && ["image", "audio", "voice", "video", "document", "sticker"].includes(messageType)) {
    return "media_upload";
  }
  if (messageType === "location") return "location_share";
  if (messageType === "contact") return "contact_share";
  if (messageType === "reaction") return "confirmation_reaction";
  if (/^(ja|ok|okay|speichern|bestaetigen|bestätigen)$/i.test(trimmed)) return "confirm";
  if (/^(nein|no|abbrechen|verwerfen|stopp|stop)$/i.test(trimmed)) return "cancel";
  if (/\b(\d+(?:[,.]\d+)?)\s*(h|std|stunden|m|min|minute|minuten)\b/i.test(trimmed)) return "time_entry";
  if (/^(auslage|kosten|spesen)\b/i.test(trimmed)) return "expense";
  if (/^notiz\b/i.test(trimmed)) return "case_note";
  if (/^(aufgabe|todo)\b/i.test(trimmed)) return "task";
  if (/^(frist|termin)\b/i.test(trimmed)) return "deadline";
  if (/^(neue\s+akte|neuer\s+fall|neue\s+sache|akte\s+anlegen|fall\s+anlegen)\b/i.test(trimmed)) return "create_case";
  if (/^(abschließen|abschliessen|schließen|schliessen|beenden|archivieren)\b/i.test(trimmed)) return "close_case";
  if (/^(rechnung|invoice)\b/i.test(trimmed)) return "create_invoice";
  if (/^(konflikt|conflict|konflikt-check)\b/i.test(trimmed)) return "conflict_check";
  if (/^(frage|suche|wissen|brain)\b/i.test(trimmed)) return "brain_query";
  if (/^(status|abrechnung|offen|offene\s+abrechnung)\b/i.test(trimmed)) return "invoice_status";
  if (/\b(vollmacht|unterlagen|dokumente?|bescheid|nachweis)\b/i.test(lower) && /\b(anfordern|fordere|bitte|brauche|benötige|benoetige)\b/i.test(lower)) {
    return "document_request";
  }
  return "free_text";
}

export function classifyWhatsAppRisk(params: {
  text: string;
  messageType?: WhatsAppIncomingMessage["type"];
  senderRole?: WhatsAppIdentity["role"];
}): IntentRisk {
  const intent = inferWhatsAppIntent(params.text, params.messageType);
  const role = normalizeRole(params.senderRole);
  const clientFacing = role === "client" || role === "external" || role === "intake";

  if (clientFacing && (intent === "brain_query" || intent === "free_text")) {
    return { intent, riskLevel: "critical", requiresApproval: true, clientFacing };
  }

  if (intent === "deadline" || intent === "conflict_check" || intent === "close_case") {
    return { intent, riskLevel: "high", requiresApproval: true, clientFacing };
  }

  if (intent === "create_invoice" || intent === "document_request") {
    return { intent, riskLevel: "critical", requiresApproval: true, clientFacing: true };
  }

  if (intent === "create_case" || intent === "case_summary" || intent === "document_fetch" || intent === "brain_query") {
    return { intent, riskLevel: "medium", requiresApproval: false, clientFacing };
  }

  return { intent, riskLevel: "low", requiresApproval: false, clientFacing };
}

export function canAutoRouteWhatsApp(params: { risk: IntentRisk; senderRole?: WhatsAppIdentity["role"] }): boolean {
  const role = normalizeRole(params.senderRole);
  if (role === "client" || role === "external" || role === "intake") {
    return params.risk.riskLevel === "low" && !params.risk.requiresApproval;
  }
  return !params.risk.requiresApproval || params.risk.intent === "deadline";
}
