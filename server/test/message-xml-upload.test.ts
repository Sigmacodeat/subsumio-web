/**
 * An Austrian ERV export (webERV-Rückverkehr) uploaded through the web app
 * becomes an erv_message page with court, Geschäftszahl and the Zustellfiktion
 * of § 89d Abs 2 GOG — not a German beA message with "Unbekannt" sender.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMessageXmlUpload } from "../src/core/ingestion/connectors/message-xml-upload.ts";

const ERV_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Erledigung>
  <NachrichtenID>ERV-2026-000777</NachrichtenID>
  <Gericht>Bezirksgericht Innere Stadt Wien</Gericht>
  <Geschaeftszahl>10 C 12/26x</Geschaeftszahl>
  <Erledigungsart>Urteil</Erledigungsart>
  <Einlangen>2026-07-03</Einlangen>
  <Betreff>Urteil</Betreff>
  <Inhalt>Das Klagebegehren wird abgewiesen.</Inhalt>
</Erledigung>`;

const BEA_XML = `<nachricht>
  <nachrichtenID>bea-4711</nachrichtenID>
  <absender>LG Berlin</absender>
  <empfaenger>Kanzlei</empfaenger>
  <aktenzeichen>12 O 34/26</aktenzeichen>
  <betreff>Ladung zur Verhandlung</betreff>
</nachricht>`;

describe("parseMessageXmlUpload", () => {
  test("an ERV export becomes an erv_message with the Zustellfiktion", async () => {
    const r = await parseMessageXmlUpload(ERV_XML, "erledigung.xml");
    expect(r?.kind).toBe("erv");
    expect(r!.event.content).toContain("type: erv_message");
    expect(r!.event.content).toContain("geschaeftszahl: 10 C 12/26x");
    expect(r!.event.content).toContain("zustell_datum: '2026-07-06'");
    expect(String(r!.event.metadata?.slug)).toBe("legal/erv/2026-07-03-erv-2026-000777");
  });

  test("a beA export stays a beA message", async () => {
    const r = await parseMessageXmlUpload(BEA_XML, "nachricht.xml");
    expect(r?.kind).toBe("bea");
    expect(r!.title).toBe("beA: Ladung zur Verhandlung");
  });

  test("other XML is not a message", async () => {
    expect(await parseMessageXmlUpload("<urlset><url/></urlset>", "s.xml")).toBeNull();
  });

  test("both upload routes use it (no direct beA parsing)", () => {
    const src = readFileSync(join(__dirname, "..", "src/commands/web-api.ts"), "utf-8");
    expect(src.match(/parseMessageXmlUpload\(/g)).toHaveLength(2);
    expect(src).not.toContain("parseBeaXmlContent(");
  });
});
