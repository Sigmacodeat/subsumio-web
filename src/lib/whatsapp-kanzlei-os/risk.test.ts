import { describe, expect, it } from "vitest";
import { canAutoRouteWhatsApp, classifyWhatsAppRisk, inferWhatsAppIntent } from "./risk";

describe("whatsapp-kanzlei-os risk", () => {
  it("classifies time entries as low-risk internal work capture", () => {
    const risk = classifyWhatsAppRisk({
      text: "zeit 20m akt 2026-014 telefonat mit mandant",
      messageType: "text",
      senderRole: "lawyer",
    });

    expect(risk).toMatchObject({
      intent: "time_entry",
      riskLevel: "low",
      requiresApproval: false,
      clientFacing: false,
    });
    expect(canAutoRouteWhatsApp({ risk, senderRole: "lawyer" })).toBe(true);
  });

  it("treats client free text as critical because it must not become autonomous legal advice", () => {
    const risk = classifyWhatsAppRisk({
      text: "Was soll ich gegen die Kündigung tun?",
      messageType: "text",
      senderRole: "client",
    });

    expect(risk).toMatchObject({
      intent: "free_text",
      riskLevel: "critical",
      requiresApproval: true,
      clientFacing: true,
    });
    expect(canAutoRouteWhatsApp({ risk, senderRole: "client" })).toBe(false);
  });

  it("forces document requests through approval because they contact clients", () => {
    const risk = classifyWhatsAppRisk({
      text: "Fordere bei Akt 2026-014 Vollmacht und Bescheid an",
      messageType: "text",
      senderRole: "assistant",
    });

    expect(risk.intent).toBe("document_request");
    expect(risk.riskLevel).toBe("critical");
    expect(risk.requiresApproval).toBe(true);
    expect(canAutoRouteWhatsApp({ risk, senderRole: "assistant" })).toBe(false);
  });

  it("routes internal high-value Kanzlei commands into the chat confirmation flow", () => {
    for (const [text, intent] of [
      ["rechnung akt 2026-014: 2500 eur für Klageentwurf", "create_invoice"],
      ["abschließen akt 2026-014", "close_case"],
      ["neue akte Müller gegen Schmidt Zivilrecht", "create_case"],
      ["termin akt 2026-014: 15.07.2026 14:00 LG München", "appointment"],
      ["termin verschieben akt 2026-014: Verhandlung auf 16.07.2026 09:30", "update_appointment"],
      ["frist streichen akt 2026-014: Berufung", "cancel_deadline"],
      ["aufgabe delegieren akt 2026-014: Klageentwurf an Anna", "delegate_task"],
      ["dokument geprüft akt 2026-014: Klageentwurf", "review_document"],
      ["bea", "bea_status"],
      ["datev", "datev_status"],
      ["erledigt akt 2026-014: Klageentwurf", "mark_done"],
    ] as const) {
      const risk = classifyWhatsAppRisk({ text, messageType: "text", senderRole: "lawyer" });
      expect(risk.intent).toBe(intent);
      expect(risk.requiresApproval).toBe(false);
      expect(canAutoRouteWhatsApp({ risk, senderRole: "lawyer" })).toBe(true);
    }
  });

  it("still gates the same high-value commands from clients", () => {
    const risk = classifyWhatsAppRisk({
      text: "rechnung akt 2026-014: 2500 eur",
      messageType: "text",
      senderRole: "client",
    });

    expect(risk.intent).toBe("create_invoice");
    expect(risk.requiresApproval).toBe(true);
    expect(canAutoRouteWhatsApp({ risk, senderRole: "client" })).toBe(false);
  });

  it("recognizes media messages as media_upload regardless of caption", () => {
    expect(inferWhatsAppIntent("akt 2026-014", "document")).toBe("media_upload");
  });
});
