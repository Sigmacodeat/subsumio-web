import { describe, it, expect } from "bun:test";
import { ErvImportConnector } from "../src/core/ingestion/connectors/erv-import.ts";

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
