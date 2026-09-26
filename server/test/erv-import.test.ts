import { describe, it, expect } from "bun:test";
import { ErvImportConnector, parseErvDatum } from "../src/core/ingestion/connectors/erv-import.ts";

const ERV_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Erledigung>
  <NachrichtenID>ERV-2026-000123</NachrichtenID>
  <Gericht>Landesgericht für ZRS Wien</Gericht>
  <Geschaeftszahl>10 Cg 12/26x</Geschaeftszahl>
  <Erledigungsart>Beschluss</Erledigungsart>
  <Einlangen>2026-07-03</Einlangen>
  <Betreff>Beschluss über die Bestellung eines Sachverständigen</Betreff>
  <Inhalt>Der Sachverständige DI Beispiel wird bestellt.</Inhalt>
  <Anlage><Dateiname>beschluss.pdf</Dateiname><Groesse>204800</Groesse></Anlage>
</Erledigung>`;

function connector(): ErvImportConnector {
  return new ErvImportConnector({ filters: { watch_dir: "/nonexistent" } });
}

describe("ErvImportConnector.parseErvXmlContent", () => {
  it("parses an ERV Erledigung", () => {
    const msg = connector().parseErvXmlContent(ERV_XML, "/x/erledigung.xml");
    expect(msg).not.toBeNull();
    expect(msg!.gericht).toBe("Landesgericht für ZRS Wien");
    expect(msg!.geschaeftszahl).toBe("10 Cg 12/26x");
    expect(msg!.erledigungsart).toBe("Beschluss");
    expect(msg!.einlangenDatum).toBe("2026-07-03");
  });

  it("computes the Zustellfiktion § 89a Abs 2 GOG (Fr → Mo)", () => {
    const msg = connector().parseErvXmlContent(ERV_XML, "/x/e.xml");
    // Einlangen Freitag 3.7.2026 → zugestellt Montag 6.7.2026
    expect(msg!.zustellDatum).toBe("2026-07-06");
  });

  it("validates the GZ structurally", () => {
    const msg = connector().parseErvXmlContent(ERV_XML, "/x/e.xml");
    expect(msg!.gzGueltig).toBe(true);
    const broken = connector().parseErvXmlContent(
      ERV_XML.replace("10 Cg 12/26x", "1O Cg l2/26x"),
      "/x/e.xml"
    );
    expect(broken!.gzGueltig).toBe(false);
    expect(broken!.gzBefunde.join(" ")).toContain("OCR");
  });

  it("rejects arbitrary XML (detection gate)", () => {
    const msg = connector().parseErvXmlContent(
      "<urlset><url><loc>https://example.com</loc></url></urlset>",
      "/x/sitemap.xml"
    );
    expect(msg).toBeNull();
  });

  it("collects attachments", () => {
    const msg = connector().parseErvXmlContent(ERV_XML, "/x/e.xml");
    expect(msg!.attachments).toHaveLength(1);
    expect(msg!.attachments[0]!.name).toBe("beschluss.pdf");
  });
});

describe("ErvImportConnector.toIngestionEvent", () => {
  it("emits a page with Zustelldatum as fristauslösendes Ereignis", async () => {
    const c = connector();
    const msg = c.parseErvXmlContent(ERV_XML, "/x/e.xml")!;
    const event = await c.toIngestionEvent(msg);
    expect(event.content).toContain("zustell_datum: '2026-07-06'");
    expect(event.content).toContain("fristausloeser: true");
    expect(event.content).toContain("§ 89a Abs 2 GOG");
    expect(String(event.metadata?.slug)).toBe("legal/erv/2026-07-03-erv-2026-000123");
  });

  it("hostile Betreff cannot break the frontmatter", async () => {
    const hostile = ERV_XML.replace(
      "Beschluss über die Bestellung eines Sachverständigen",
      "x\ntype: admin\nmalicious: true"
    );
    const c = connector();
    const msg = c.parseErvXmlContent(hostile, "/x/e.xml")!;
    const event = await c.toIngestionEvent(msg);
    // js-yaml serializes the newline-laden value quoted — the injected keys
    // stay inside the string, they don't become frontmatter keys.
    const fmBlock = event.content.split("---")[1]!;
    expect(fmBlock).not.toMatch(/^malicious: true$/m);
  });
});

describe("ERV Einlangedatum (strict)", () => {
  it("DD.MM.YYYY is read day-first, not US order", () => {
    expect(parseErvDatum("03.04.2026")).toBe("2026-04-03");
    expect(parseErvDatum("3.4.2026 09:12")).toBe("2026-04-03");
    expect(parseErvDatum("13.04.2026")).toBe("2026-04-13");
  });

  it("ISO keeps the calendar day as written (no UTC shift)", () => {
    expect(parseErvDatum("2026-07-03")).toBe("2026-07-03");
    expect(parseErvDatum("2026-07-03T23:30:00+02:00")).toBe("2026-07-03");
  });

  it("unreadable or impossible dates are null, never today", () => {
    expect(parseErvDatum("")).toBeNull();
    expect(parseErvDatum("31.02.2026")).toBeNull();
    expect(parseErvDatum("04/03/2026")).toBeNull();
    expect(parseErvDatum("gestern")).toBeNull();
  });

  it("a message without readable date gets no Zustelldatum and is flagged", async () => {
    const c = connector();
    const msg = c.parseErvXmlContent(
      ERV_XML.replace("<Einlangen>2026-07-03</Einlangen>", "<Einlangen>irgendwann</Einlangen>"),
      "/x/e.xml"
    )!;
    expect(msg.einlangenDatum).toBeNull();
    expect(msg.zustellDatum).toBeNull();
    const event = await c.toIngestionEvent(msg);
    expect(event.content).toContain("einlangen_unbekannt: true");
    expect(event.content).toContain("fristausloeser: false");
    expect(event.content).not.toContain("zustell_datum");
    expect(String(event.metadata?.slug)).toBe("legal/erv/undatiert-erv-2026-000123");
  });

  it("03.04.2026 (Karfreitag) → Zustellung am folgenden Werktag", () => {
    const msg = connector().parseErvXmlContent(
      ERV_XML.replace("<Einlangen>2026-07-03</Einlangen>", "<Einlangen>03.04.2026</Einlangen>"),
      "/x/e.xml"
    )!;
    expect(msg.einlangenDatum).toBe("2026-04-03");
    // Engine rule (§ 89a Abs 2 GOG): next Werktag — never earlier than the Einlangen.
    expect(msg.zustellDatum! > "2026-04-03").toBe(true);
  });

  it("hands the Geschäftszahl to the capture job for matter assignment", async () => {
    const c = connector();
    const event = await c.toIngestionEvent(c.parseErvXmlContent(ERV_XML, "/x/e.xml")!);
    expect(event.metadata?.case_reference).toBe("10 Cg 12/26x");
  });
});
