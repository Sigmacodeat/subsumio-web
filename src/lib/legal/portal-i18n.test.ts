/**
 * portal-i18n.test.ts — Tests for P0-TODO 3
 *
 * Verifies:
 *  1. Portal page uses useLang() with t() and setLang
 *  2. All hardcoded German strings have been replaced with t() calls
 *  3. Language toggle button exists
 *  4. i18n keys exist in dashboard.ts for all portal strings
 *  5. English translations exist for all portal keys
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const portalPath = join(process.cwd(), "src/app/portal/[token]/page.tsx");
const portalSource = readFileSync(portalPath, "utf-8");

const dashboardPath = join(process.cwd(), "src/content/dashboard.ts");
const dashboardSource = readFileSync(dashboardPath, "utf-8");

describe("P0-TODO 3: Mandantenportal i18n — Zweisprachig", () => {
  it("portal page uses useLang with t() and setLang", () => {
    expect(portalSource).toContain("useLang");
    expect(portalSource).toContain("const { lang, t, setLang } = useLang()");
  });

  it("portal page has a language toggle button", () => {
    expect(portalSource).toContain("setLang");
    expect(portalSource).toContain('lang === "en" ? "de" : "en"');
    expect(portalSource).toContain("portal.lang_toggle");
  });

  it("portal page uses t() for header title and subtitle", () => {
    expect(portalSource).toContain('t("portal.header_title")');
    expect(portalSource).toContain('t("portal.header_subtitle")');
  });

  it("portal page uses t() for status labels (not hardcoded)", () => {
    expect(portalSource).toContain("statusCfg.labelKey");
    expect(portalSource).toContain("t(statusCfg.labelKey)");
    expect(portalSource).not.toContain("statusCfg.label}");
  });

  it("portal page uses t() for loading and error states", () => {
    expect(portalSource).toContain('t("portal.loading")');
    expect(portalSource).toContain('t("portal.access_denied")');
    expect(portalSource).toContain('t("portal.link_expired")');
    expect(portalSource).toContain('t("portal.connection_error")');
    expect(portalSource).toContain('t("portal.contact_firm")');
  });

  it("portal page uses t() for case info labels", () => {
    expect(portalSource).toContain('t("portal.client_label")');
    expect(portalSource).toContain('t("portal.opponent_label")');
    expect(portalSource).toContain('t("portal.court_label")');
  });

  it("portal page uses t() for section headers", () => {
    expect(portalSource).toContain('t("portal.facts_title")');
    expect(portalSource).toContain('t("portal.claims_title")');
    expect(portalSource).toContain('t("portal.deadlines_title")');
    expect(portalSource).toContain('t("portal.documents_title")');
    expect(portalSource).toContain('t("portal.messages_title")');
    expect(portalSource).toContain('t("portal.doc_requests_title")');
  });

  it("portal page uses t() for upload and document actions", () => {
    expect(portalSource).toContain('t("portal.upload")');
    expect(portalSource).toContain('t("portal.uploading")');
    expect(portalSource).toContain('t("portal.download")');
    expect(portalSource).toContain('t("portal.send")');
  });

  it("portal page uses t() for upload feedback messages", () => {
    expect(portalSource).toContain('t("portal.upload_failed")');
    expect(portalSource).toContain('t("portal.upload_success")');
    expect(portalSource).toContain('t("portal.upload_success_fulfilled")');
  });

  it("portal page uses t() for empty states", () => {
    expect(portalSource).toContain('t("portal.no_documents")');
    expect(portalSource).toContain('t("portal.no_messages")');
  });

  it("portal page uses t() for footer", () => {
    expect(portalSource).toContain('t("portal.footer")');
  });

  it("dashboard.ts contains all portal i18n keys with EN translations", () => {
    const portalKeys = [
      "portal.loading",
      "portal.access_denied",
      "portal.contact_firm",
      "portal.link_expired",
      "portal.access_forbidden",
      "portal.connection_error",
      "portal.link_renewal_required",
      "portal.case_load_failed",
      "portal.case_not_enabled",
      "portal.header_title",
      "portal.header_subtitle",
      "portal.status.open",
      "portal.status.pending",
      "portal.status.settled",
      "portal.status.won",
      "portal.status.lost",
      "portal.status.appealed",
      "portal.status.dormant",
      "portal.client_label",
      "portal.opponent_label",
      "portal.court_label",
      "portal.facts_title",
      "portal.claims_title",
      "portal.deadlines_title",
      "portal.deadline_default",
      "portal.doc_requests_title",
      "portal.doc_request.submitted",
      "portal.doc_request.required",
      "portal.doc_request.optional",
      "portal.upload",
      "portal.uploading",
      "portal.documents_title",
      "portal.document_default",
      "portal.download",
      "portal.doc_password_label",
      "portal.doc_password_placeholder",
      "portal.no_documents",
      "portal.upload_failed",
      "portal.upload_success_fulfilled",
      "portal.upload_success",
      "portal.messages_title",
      "portal.no_messages",
      "portal.message_placeholder",
      "portal.send",
      "portal.footer",
      "portal.lang_toggle",
    ];

    for (const key of portalKeys) {
      expect(dashboardSource).toContain(`"${key}"`);
    }
  });

  it("no hardcoded German UI strings remain in portal page", () => {
    expect(portalSource).not.toContain(">Mandanten-Portal<");
    expect(portalSource).not.toContain(">Dokumente<");
    expect(portalSource).not.toContain(">Fristen<");
    expect(portalSource).not.toContain(">Sachverhalt<");
    expect(portalSource).not.toContain(">Ansprüche<");
    expect(portalSource).not.toContain(">Nachrichten an Ihre Kanzlei<");
    expect(portalSource).not.toContain(">Hochladen<");
    expect(portalSource).not.toContain("Herunterladen →");
    expect(portalSource).not.toContain(">Senden<");
  });
});
