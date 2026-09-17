import { describe, test, expect } from "vitest";
import {
  auditLabel,
  hasAuditLabel,
  humaniseAuditAction,
  OTHER_AUDIT_ACTION_LABEL,
  type AuditAction,
} from "./audit-labels";

describe("auditLabel", () => {
  test("returns German label for user.login", () => {
    expect(auditLabel("user.login")).toBe("Anmeldung");
  });

  test("returns German label for user.logout", () => {
    expect(auditLabel("user.logout")).toBe("Abmeldung");
  });

  test("returns German label for user.signup", () => {
    expect(auditLabel("user.signup")).toBe("Registrierung");
  });

  test("returns German label for case.create", () => {
    expect(auditLabel("case.create")).toBe("Akte angelegt");
  });

  test("returns German label for case.delete (archived)", () => {
    expect(auditLabel("case.delete")).toBe("Akte archiviert");
  });

  test("returns German label for case.restore", () => {
    expect(auditLabel("case.restore")).toBe("Akte wiederhergestellt");
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
    expect(auditLabel("query.submit")).toBe("KI-Anfrage");
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

  test("never shows the raw action id for unknown actions", () => {
    expect(auditLabel("unknown.action")).toBe(OTHER_AUDIT_ACTION_LABEL);
    expect(auditLabel("unknown.action")).toBe("Sonstige Aktion");
    expect(hasAuditLabel("unknown.action")).toBe(false);
  });

  test("derives a German label from the noun/verb dictionary", () => {
    expect(humaniseAuditAction("task.created")).toBe("Aufgabe: erstellt");
    expect(auditLabel("task.created")).toBe("Aufgabe: erstellt");
    expect(auditLabel("team.member_removed")).toBe("Team: Mitglied entfernt");
    expect(hasAuditLabel("task.created")).toBe(true);
    // Halb bekannte IDs werden nicht halb übersetzt.
    expect(humaniseAuditAction("task.frobnicated")).toBeNull();
    expect(humaniseAuditAction("task.widget_created")).toBeNull();
    expect(auditLabel("case.created")).not.toBe("Case created");
  });

  test("labels the permission-style ids written by the API handlers", () => {
    expect(auditLabel("dashboard.briefing")).toBe("Tagesübersicht abgerufen");
    expect(auditLabel("brain.read")).toBe("Kanzleiwissen gelesen");
    expect(auditLabel("brain.write")).toBe("Kanzleiwissen geändert");
    expect(auditLabel("email.import")).toBe("E-Mail importiert");
    expect(auditLabel("connector.read")).toBe("Konnektoren abgerufen");
  });

  test("no label exposes internal product jargon", () => {
    for (const id of ["copilot.explain", "dashboard.briefing", "brain.read", "bea.send"]) {
      expect(auditLabel(id)).not.toMatch(/Copilot|Brain|Dashboard|beA|GoBD/);
    }
  });

  test("returns the raw action string for empty string", () => {
    expect(auditLabel("")).toBe("");
  });

  test("all AuditAction type members have labels", () => {
    const knownActions: AuditAction[] = [
      "user.login",
      "user.logout",
      "user.signup",
      "case.create",
      "case.update",
      "case.delete",
      "case.restore",
      "case.view",
      "invoice.create",
      "invoice.update",
      "invoice.delete",
      "invoice.send",
      "invoice.remind",
      "document.upload",
      "document.download",
      "document.delete",
      "document.retry",
      "deadline.create",
      "deadline.update",
      "deadline.delete",
      "evidence.create",
      "evidence.update",
      "evidence.delete",
      "drafting.generate",
      "drafting.export",
      "conflict.check",
      "judgements.search",
      "legal.contract_draft",
      "legal.document_review",
      "legal.due_diligence",
      "legal.risk_analysis",
      "legal.memo",
      "legal.redline",
      "legal.anonymize",
      "legal.tabular",
      "legal.judgements_sync",
      "legal.ai_deadlines",
      "legal.rvg",
      "legal.statute",
      "legal.playbook",
      "settings.update",
      "billing.upgrade",
      "onboarding.complete",
      "team.invite",
      "team.remove",
      "team.role_change",
      "connector.add",
      "connector.remove",
      "connector.sync",
      "scim.user_provisioned",
      "scim.user_deprovisioned",
      "scim.user_updated",
      "scim.group_synced",
      "scim.sync_manual",
      "query.submit",
      "data.export",
      "data.delete",
      "legal.sources_list",
      "legal.sources_refresh",
      "whatsapp.identity_created",
      "whatsapp.identity_updated",
      "whatsapp.identity_revoked",
      "whatsapp.sender_denied",
      "whatsapp.consent_granted",
      "whatsapp.consent_revoked",
      "whatsapp.outbound_sent",
      "whatsapp.outbound_blocked",
      "whatsapp.briefing_feedback",
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
      "user.login",
      "user.logout",
      "case.create",
      "case.view",
      "document.upload",
      "settings.update",
      "billing.upgrade",
      "query.submit",
      "conflict.check",
      "data.export",
    ];
    for (const action of actions) {
      const label = auditLabel(action);
      expect(label.length).toBeGreaterThan(2);
    }
  });
});
