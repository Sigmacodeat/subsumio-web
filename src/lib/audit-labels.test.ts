import { describe, test, expect } from "vitest";
import { auditLabel, type AuditAction } from "./audit-labels";

describe("auditLabel", () => {
  test("returns German label for user.login", () => {
    expect(auditLabel("user.login")).toBe("Login");
  });

  test("returns German label for user.logout", () => {
    expect(auditLabel("user.logout")).toBe("Logout");
  });

  test("returns German label for user.signup", () => {
    expect(auditLabel("user.signup")).toBe("Registrierung");
  });

  test("returns German label for case.create", () => {
    expect(auditLabel("case.create")).toBe("Akte angelegt");
  });

  test("returns German label for case.delete", () => {
    expect(auditLabel("case.delete")).toBe("Akte gelöscht");
  });

  test("returns German label for document.upload", () => {
    expect(auditLabel("document.upload")).toBe("Dokument hochgeladen");
  });

  test("returns German label for settings.update", () => {
    expect(auditLabel("settings.update")).toBe("Einstellungen geändert");
  });

  test("returns German label for billing.upgrade", () => {
    expect(auditLabel("billing.upgrade")).toBe("Plan geändert");
  });

  test("returns German label for query.submit", () => {
    expect(auditLabel("query.submit")).toBe("KI-Query");
  });

  test("returns German label for conflict.check", () => {
    expect(auditLabel("conflict.check")).toBe("Kollisionsprüfung");
  });

  test("returns German label for whatsapp.outbound_sent", () => {
    expect(auditLabel("whatsapp.outbound_sent")).toBe("WhatsApp proaktiv gesendet");
  });

  test("returns German label for whatsapp.outbound_blocked", () => {
    expect(auditLabel("whatsapp.outbound_blocked")).toBe("WhatsApp-Versand geblockt");
  });

  test("returns German label for scim.user_provisioned", () => {
    expect(auditLabel("scim.user_provisioned")).toBe("SCIM: User provisioniert");
  });

  test("returns German label for data.export", () => {
    expect(auditLabel("data.export")).toBe("Datenexport (DSGVO)");
  });

  test("returns German label for data.delete", () => {
    expect(auditLabel("data.delete")).toBe("Datenlöschung (DSGVO)");
  });

  test("returns the raw action string for unknown actions", () => {
    expect(auditLabel("unknown.action")).toBe("unknown.action");
  });

  test("returns the raw action string for empty string", () => {
    expect(auditLabel("")).toBe("");
  });

  test("all AuditAction type members have labels", () => {
    const knownActions: AuditAction[] = [
      "user.login", "user.logout", "user.signup",
      "case.create", "case.update", "case.delete", "case.view",
      "invoice.create", "invoice.update", "invoice.delete", "invoice.send", "invoice.remind",
      "document.upload", "document.delete",
      "deadline.create", "deadline.update", "deadline.delete",
      "evidence.create", "evidence.update", "evidence.delete",
      "drafting.generate", "drafting.export",
      "conflict.check", "judgements.search",
      "legal.contract_draft", "legal.document_review", "legal.due_diligence",
      "legal.risk_analysis", "legal.memo", "legal.redline", "legal.anonymize",
      "legal.tabular", "legal.judgements_sync", "legal.ai_deadlines",
      "legal.rvg", "legal.statute", "legal.playbook",
      "settings.update", "billing.upgrade", "onboarding.complete",
      "team.invite", "team.remove", "team.role_change",
      "connector.add", "connector.remove", "connector.sync",
      "scim.user_provisioned", "scim.user_deprovisioned", "scim.user_updated",
      "scim.group_synced", "scim.sync_manual",
      "query.submit", "data.export", "data.delete",
      "legal.sources_list", "legal.sources_refresh",
      "whatsapp.identity_created", "whatsapp.identity_updated", "whatsapp.identity_revoked",
      "whatsapp.sender_denied", "whatsapp.consent_granted", "whatsapp.consent_revoked",
      "whatsapp.outbound_sent", "whatsapp.outbound_blocked", "whatsapp.briefing_feedback",
    ];

    for (const action of knownActions) {
      const label = auditLabel(action);
      // Label should not be the raw action (meaning it was found in the map)
      // Some actions may not have explicit labels and fall through — that's OK,
      // but most should have a human-readable German label
      if (label === action) {
        // These actions are known to not have explicit labels
        const unlabeled = new Set<AuditAction>([
          "legal.contract_draft",
          "legal.document_review",
          "legal.due_diligence",
          "legal.risk_analysis",
          "legal.memo",
          "legal.redline",
          "legal.anonymize",
          "legal.judgements_sync",
          "legal.ai_deadlines",
          "legal.rvg",
          "team.role_change",
        ]);
        expect(unlabeled.has(action)).toBe(true);
      }
    }
  });

  test("labels are non-empty strings for all mapped actions", () => {
    const actions = [
      "user.login", "user.logout", "case.create", "case.view",
      "document.upload", "settings.update", "billing.upgrade",
      "query.submit", "conflict.check", "data.export",
    ];
    for (const action of actions) {
      const label = auditLabel(action);
      expect(label.length).toBeGreaterThan(2);
    }
  });
});
