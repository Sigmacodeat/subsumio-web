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

  it("recognizes media messages as media_upload regardless of caption", () => {
    expect(inferWhatsAppIntent("akt 2026-014", "document")).toBe("media_upload");
  });
});
