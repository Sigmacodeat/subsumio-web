import type { WhatsAppIdentity, WhatsAppIncomingMessage } from "@/lib/whatsapp/types";

export type KanzleiOsActorRole =
  | "admin"
  | "lawyer"
  | "assistant"
  | "client"
  | "external"
  | "intake"
  | "unknown";

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

export function inferWhatsAppIntent(
  text: string,
  messageType?: WhatsAppIncomingMessage["type"]
): string {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (
    messageType &&
    ["image", "audio", "voice", "video", "document", "sticker"].includes(messageType)
  ) {
    return "media_upload";
  }
  if (messageType === "location") return "location_share";
  if (messageType === "contact") return "contact_share";
  if (messageType === "reaction") return "confirmation_reaction";
  if (/^(hilfe|help|\?)$/i.test(trimmed)) return "help";
  if (/^(ja|ok|okay|speichern|bestaetigen|bestätigen)$/i.test(trimmed)) return "confirm";
  if (/^(nein|no|abbrechen|verwerfen|stopp|stop)$/i.test(trimmed)) return "cancel";
  if (/\b(\d+(?:[,.]\d+)?)\s*(h|std|stunden|m|min|minute|minuten)\b/i.test(trimmed))
    return "time_entry";
  if (/^(auslage|kosten|spesen)\b/i.test(trimmed)) return "expense";
  if (/^notiz\b/i.test(trimmed)) return "case_note";
  if (/^(?:bea|beA|bea\s+eingang|bea\s+status|posteingang)$/i.test(trimmed)) return "bea_status";
  if (/^(?:datev|datev\s+status|datev\s+export|steuerberater)$/i.test(trimmed))
    return "datev_status";
  if (/^(?:unterlagen|dokumente?|document)\s+(?:status|stand)\b/i.test(trimmed))
    return "document_status";
  if (/^(?:dokument|unterlage)\s+(?:geprüft|geprueft|freigeben|ablehnen)\b/i.test(trimmed))
    return "review_document";
  if (/^(?:aufgabe|task)\s+(?:verschieben|ändern|aendern)\b/i.test(trimmed)) return "update_task";
  if (/^(?:aufgabe|task)\s+(?:delegieren|zuweisen)\b/i.test(trimmed)) return "delegate_task";
  if (/^(aufgabe|todo)\b/i.test(trimmed)) return "task";
  if (/^(?:frist|deadline)\s+berechnen\b/i.test(trimmed)) return "deadline_calc";
  if (/^(?:frist|deadline)\s+(?:verschieben|ändern|aendern)\b/i.test(trimmed))
    return "update_deadline";
  if (/^(?:frist|deadline)\s+(?:streichen|stornieren|löschen|loeschen|absagen)\b/i.test(trimmed))
    return "cancel_deadline";
  if (
    /^(?:termin|gerichtstermin|verhandlung|besprechung)\s+(?:verschieben|ändern|aendern)\b/i.test(
      trimmed
    )
  )
    return "update_appointment";
  if (
    /^(?:termin|gerichtstermin|verhandlung|besprechung)\s+(?:absagen|stornieren|löschen|loeschen)\b/i.test(
      trimmed
    )
  )
    return "cancel_appointment";
  if (/^(?:termin|gerichtstermin|verhandlung|besprechung)\b/i.test(trimmed)) return "appointment";
  if (/^(?:termine|anstehende\s+termine|kalender|terminkalender)$/i.test(trimmed))
    return "list_appointments";
  if (/^(frist|termin)\b/i.test(trimmed)) return "deadline";
  if (/^(?:rvg|streitwert|gebühren|gebuehren)\b/i.test(trimmed)) return "rvg_calc";
  if (/^(?:(aufgabe|frist|task|deadline)\s+)?erledigt\b/i.test(trimmed)) return "mark_done";
  if (/^(neue\s+akte|neuer\s+fall|neue\s+sache|akte\s+anlegen|fall\s+anlegen)\b/i.test(trimmed))
    return "create_case";
  if (/^(?:neuer\s+mandant|neuer\s+klient|neuer\s+kunde|mandant\s+anlegen)\b/i.test(trimmed))
    return "create_client";
  if (/^(abschließen|abschliessen|schließen|schliessen|beenden|archivieren)\b/i.test(trimmed))
    return "close_case";
  if (/^(rechnung|invoice)\b/i.test(trimmed)) return "create_invoice";
  if (/^(konflikt|conflict|konflikt-check)\b/i.test(trimmed)) return "conflict_check";
  if (/^(frage|suche|wissen|brain)\b/i.test(trimmed)) return "brain_query";
  if (/^(status|abrechnung|offen|offene\s+abrechnung)\b/i.test(trimmed)) return "invoice_status";
  if (
    /\b(vollmacht|unterlagen|dokumente?|bescheid|nachweis)\b/i.test(lower) &&
    /\b(anfordern|fordere|bitte|brauche|benötige|benoetige)\b/i.test(lower)
  ) {
    return "document_request";
  }
  if (/^(?:dokument|dokumente|unterlagen|hole\s+dokument)\b/i.test(trimmed))
    return "document_fetch";
  if (/^(?:akten|fälle|faelle|liste\s+akten|case\s+list)$/i.test(trimmed)) return "list_cases";
  if (
    /^(?:aufgaben|offene\s+aufgaben|todos|offene\s+todos|was\s+ist\s+zu\s+tun|to[-\s]?do)$/i.test(
      trimmed
    )
  )
    return "list_tasks";
  if (/^(?:fristen|offene\s+fristen|fristliste|frist-?liste|deadline\s+list)$/i.test(trimmed))
    return "list_deadlines";
  if (/^(?:heute|was\s+steht\s+an|agenda|today|übersicht|ueberblick)$/i.test(trimmed))
    return "today";
  if (
    /^(?:offene\s+kosten|umsatz|konto|finanzen|finanzielle\s+übersicht|finanzielle\s+ueberblick)$/i.test(
      trimmed
    )
  )
    return "financial_overview";
  if (/^(?:verlauf|historie|aktivitäten|aktivitaeten|log)\b/i.test(trimmed)) return "case_activity";
  if (/^(?:akt|akte|az|aktenzeichen)\s+/i.test(trimmed)) return "case_lookup";
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

  if (
    clientFacing &&
    ![
      "media_upload",
      "location_share",
      "contact_share",
      "confirmation_reaction",
      "confirm",
      "cancel",
    ].includes(intent)
  ) {
    return { intent, riskLevel: "critical", requiresApproval: true, clientFacing };
  }

  if (intent === "document_request") {
    return { intent, riskLevel: "critical", requiresApproval: true, clientFacing: true };
  }

  if (["close_case", "create_invoice", "create_case", "create_client"].includes(intent)) {
    return { intent, riskLevel: "high", requiresApproval: false, clientFacing };
  }

  if (
    [
      "deadline",
      "appointment",
      "mark_done",
      "update_task",
      "delegate_task",
      "update_deadline",
      "cancel_deadline",
      "update_appointment",
      "cancel_appointment",
      "review_document",
      "conflict_check",
    ].includes(intent)
  ) {
    return { intent, riskLevel: "medium", requiresApproval: false, clientFacing };
  }

  if (
    intent === "case_summary" ||
    intent === "document_fetch" ||
    intent === "document_status" ||
    intent === "bea_status" ||
    intent === "datev_status" ||
    intent === "brain_query"
  ) {
    return { intent, riskLevel: "medium", requiresApproval: false, clientFacing };
  }

  return { intent, riskLevel: "low", requiresApproval: false, clientFacing };
}

export function canAutoRouteWhatsApp(params: {
  risk: IntentRisk;
  senderRole?: WhatsAppIdentity["role"];
}): boolean {
  const role = normalizeRole(params.senderRole);
  if (role === "client" || role === "external" || role === "intake") {
    return params.risk.riskLevel === "low" && !params.risk.requiresApproval;
  }
  return !params.risk.requiresApproval || params.risk.intent === "deadline";
}
