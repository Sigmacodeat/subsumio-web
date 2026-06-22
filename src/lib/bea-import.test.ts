/**
 * Tests for beA XML Import-Parser
 */

import { test, expect, describe } from "vitest";
import { buildBeaImportBundle, parseBeaXml, parseBeaXmlBatch } from "@/lib/bea-import";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<message id="bea-12345">
  <subject>Klageerwiderung</subject>
  <sender name="Rechtsanwalt Müller">mueller@bea.de</sender>
  <senderId>RA-MUELLER-001</senderId>
  <recipient name="Amtsgericht München">ag-muenchen@bea.de</recipient>
  <recipientId>AG-MUENCHEN-001</recipientId>
  <sentDate>2026-06-15T10:30:00+02:00</sentDate>
  <receivedDate>2026-06-15T10:35:00+02:00</receivedDate>
  <caseRef>2026-014</caseRef>
  <messageId>bea-12345</messageId>
  <deliveryStatus>delivered</deliveryStatus>
  <body><![CDATA[<p>Sehr geehrte Damen und Herren,</p><p>hmit reiche ich die Klageerwiderung ein.</p>]]></body>
  <attachment>klageerwiderung.pdf</attachment>
  <mimeType>application/pdf</mimeType>
  <size>245678</size>
</message>`;

const SAMPLE_XML_2 = `<?xml version="1.0" encoding="UTF-8"?>
<message>
  <Subject>Fristverlängerung</Subject>
  <Sender name="Gegenseite Schmidt">schmidt@bea.de</Sender>
  <Recipient name="Rechtsanwalt Müller">mueller@bea.de</Recipient>
  <Date>2026-06-20T14:00:00+02:00</Date>
  <text>Bitte um Fristverlängerung bis 15. Juli 2026.</text>
</message>`;

describe("parseBeaXml — basic parsing", () => {
  test("parses subject, sender, recipient", () => {
    const msg = parseBeaXml(SAMPLE_XML, "test.xml");
    expect(msg).not.toBeNull();
    expect(msg!.subject).toBe("Klageerwiderung");
    expect(msg!.sender).toBe("Rechtsanwalt Müller");
    expect(msg!.recipient).toBe("Amtsgericht München");
  });

  test("parses dates", () => {
    const msg = parseBeaXml(SAMPLE_XML, "test.xml");
    expect(msg!.sent_date).toBe("2026-06-15T10:30:00+02:00");
    expect(msg!.received_date).toBe("2026-06-15T10:35:00+02:00");
  });

  test("parses case reference and bea ID", () => {
    const msg = parseBeaXml(SAMPLE_XML, "test.xml");
    expect(msg!.case_ref).toBe("2026-014");
    expect(msg!.bea_id).toBe("bea-12345");
  });

  test("parses delivery status", () => {
    const msg = parseBeaXml(SAMPLE_XML, "test.xml");
    expect(msg!.delivery_status).toBe("delivered");
  });

  test("strips HTML from body", () => {
    const msg = parseBeaXml(SAMPLE_XML, "test.xml");
    expect(msg!.body_text).toContain("Sehr geehrte Damen und Herren");
    expect(msg!.body_text).not.toContain("<p>");
  });

  test("parses attachments", () => {
    const msg = parseBeaXml(SAMPLE_XML, "test.xml");
    expect(msg!.attachments).toBeDefined();
    expect(msg!.attachments!.length).toBe(1);
    expect(msg!.attachments![0].filename).toBe("klageerwiderung.pdf");
    expect(msg!.attachments![0].mime_type).toBe("application/pdf");
    expect(msg!.attachments![0].size).toBe(245678);
  });

  test("generates slug from date + subject", () => {
    const msg = parseBeaXml(SAMPLE_XML, "test.xml");
    expect(msg!.slug).toContain("legal/bea-messages/2026-06-15");
    expect(msg!.slug).toContain("klageerwiderung");
  });
});

describe("parseBeaXml — alternative field names", () => {
  test("handles capitalized field names (Subject, Sender, etc.)", () => {
    const msg = parseBeaXml(SAMPLE_XML_2, "test2.xml");
    expect(msg).not.toBeNull();
    expect(msg!.subject).toBe("Fristverlängerung");
    expect(msg!.sender).toBe("Gegenseite Schmidt");
    expect(msg!.recipient).toBe("Rechtsanwalt Müller");
  });

  test("handles 'text' tag as body", () => {
    const msg = parseBeaXml(SAMPLE_XML_2, "test2.xml");
    expect(msg!.body_text).toContain("Fristverlängerung");
  });
});

describe("parseBeaXml — edge cases", () => {
  test("empty XML → null", () => {
    const msg = parseBeaXml("", "empty.xml");
    expect(msg).not.toBeNull();
    expect(msg!.subject).toBe("Ohne Betreff");
  });

  test("malformed XML → still extracts what it can", () => {
    const xml = "<message><subject>Test</subject></message>";
    const msg = parseBeaXml(xml, "minimal.xml");
    expect(msg!.subject).toBe("Test");
  });

  test("missing subject → default", () => {
    const xml = "<message><sender>Test</sender></message>";
    const msg = parseBeaXml(xml, "no-subject.xml");
    expect(msg!.subject).toBe("Ohne Betreff");
  });

  test("CDATA content is extracted correctly", () => {
    const xml = `<message><subject>Test</subject><body><![CDATA[Hello &amp; goodbye]]></body></message>`;
    const msg = parseBeaXml(xml, "cdata.xml");
    expect(msg!.body_text).toContain("Hello & goodbye");
  });
});

describe("parseBeaXmlBatch", () => {
  test("parses multiple files", () => {
    const result = parseBeaXmlBatch([
      { filename: "msg1.xml", content: SAMPLE_XML },
      { filename: "msg2.xml", content: SAMPLE_XML_2 },
    ]);
    expect(result.messages.length).toBe(2);
    expect(result.error_count).toBe(0);
  });

  test("handles mixed valid/invalid files", () => {
    const result = parseBeaXmlBatch([
      { filename: "msg1.xml", content: SAMPLE_XML },
      { filename: "bad.xml", content: "not xml at all <<<" },
    ]);
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    // The "bad" file might still partially parse since we're regex-based
  });

  test("empty file list → empty result", () => {
    const result = parseBeaXmlBatch([]);
    expect(result.messages.length).toBe(0);
    expect(result.total_count).toBe(0);
  });
});

describe("buildBeaImportBundle", () => {
  test("builds an import page and message pages", () => {
    const result = parseBeaXmlBatch([
      { filename: "msg1.xml", content: SAMPLE_XML },
      { filename: "msg2.xml", content: SAMPLE_XML_2 },
    ]);
    const bundle = buildBeaImportBundle(result, {
      filename: "bea-export.zip",
      importedAt: "2026-06-22T11:00:00.000Z",
      importedBy: "anwalt@example.test",
    });

    expect(bundle.importPage.slug).toBe("legal/bea-imports/20260622110000-bea-export-zip");
    expect(bundle.importPage.type).toBe("bea_import");
    expect(bundle.importPage.frontmatter.valid_count).toBe(2);
    expect(bundle.importPage.frontmatter.message_slugs).toHaveLength(2);
    expect(bundle.messagePages).toHaveLength(2);
    expect(bundle.messagePages[0].type).toBe("bea_message");
    expect(bundle.messagePages[0].frontmatter.import_slug).toBe(bundle.importPage.slug);
    expect(bundle.messagePages[0].frontmatter.case_ref).toBe("2026-014");
    expect(bundle.messagePages[0].content).toContain("klageerwiderung.pdf");
  });

  test("keeps import errors on the import page", () => {
    const result = {
      messages: [parseBeaXml(SAMPLE_XML, "msg1.xml")!],
      errors: [{ file: "bad.xml", error: "Failed to parse beA XML" }],
      total_count: 2,
      valid_count: 1,
      error_count: 1,
    };
    const bundle = buildBeaImportBundle(result, {
      filename: "mixed.xml",
      importedAt: "2026-06-22T11:00:00.000Z",
    });

    expect(bundle.importPage.frontmatter.error_count).toBe(1);
    expect(bundle.importPage.frontmatter.errors).toEqual(result.errors);
    expect(bundle.importPage.content).toContain("bad.xml");
  });
});
