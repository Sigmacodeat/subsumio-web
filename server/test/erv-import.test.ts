import { describe, it, expect } from "bun:test";
import {
  ErvImportConnector,
  parseEinlangenDatum,
} from "../src/core/ingestion/connectors/erv-import.ts";

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

  it("computes the Zustellfiktion § 89d Abs 2 GOG (Fr → Mo)", () => {
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
    expect(event.content).toContain("§ 89d Abs 2 GOG");
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

// § 89d Abs 2 GOG (RIS, Fassung ab 1.5.2012): "Als Zustellungszeitpunkt …
// gilt jeweils der auf das Einlangen in den elektronischen Verfügungsbereich
// des Empfängers folgende Werktag, wobei Samstage nicht als Werktage gelten."
// Sonntage und die Feiertage nach § 7 Abs 2 ARG sind ebenfalls keine
// Werktage; Karfreitag und 24.12. stehen dort nicht und bleiben Werktage.
describe("Zustellfiktion § 89d Abs 2 GOG", () => {
  const at = (einlangen: string) =>
    connector().parseErvXmlContent(ERV_XML.replace("2026-07-03", einlangen), "/x/e.xml")!;

  it("Einlangen Freitag → Zustellung Montag", () => {
    expect(at("2026-07-03").zustellDatum).toBe("2026-07-06");
  });

  it("Einlangen vor einem Feiertag: Fr 23.10.2026 → Di 27.10. (26.10. Nationalfeiertag)", () => {
    expect(at("2026-10-23").zustellDatum).toBe("2026-10-27");
  });

  it("Einlangen 24.12.2026 (Do) → Mo 28.12. (Christtag, Stefanitag, Sonntag)", () => {
    expect(at("2026-12-24").zustellDatum).toBe("2026-12-28");
  });

  it("Karfreitag ist Werktag: Einlangen Do 2.4.2026 → Fr 3.4.2026", () => {
    expect(at("2026-04-02").zustellDatum).toBe("2026-04-03");
  });

  it("reads Austrian dates and the Vienna calendar day of timestamps", () => {
    expect(parseEinlangenDatum("03.07.2026")).toBe("2026-07-03");
    expect(parseEinlangenDatum("3.7.2026 14:05")).toBe("2026-07-03");
    // 00:30 in Vienna is still 22:30 UTC the day before.
    expect(parseEinlangenDatum("2026-07-03T00:30:00+02:00")).toBe("2026-07-03");
    expect(parseEinlangenDatum("2026-07-02T22:30:00Z")).toBe("2026-07-03");
    expect(parseEinlangenDatum("2026-07-03T09:00:00")).toBe("2026-07-03");
    expect(parseEinlangenDatum("31.02.2026")).toBeNull();
    expect(parseEinlangenDatum("irgendwann")).toBeNull();
    expect(parseEinlangenDatum("")).toBeNull();
  });
});

describe("missing Einlangen date", () => {
  const NO_DATE = ERV_XML.replace("<Einlangen>2026-07-03</Einlangen>", "<Datum>2026-06-30</Datum>");

  it("never assumes today: Zustelldatum unknown", () => {
    const msg = connector().parseErvXmlContent(NO_DATE, "/x/e.xml")!;
    expect(msg.einlangenDatum).toBeNull();
    expect(msg.zustellDatum).toBeNull();
  });

  it("the page asks for the Zustelldatum and marks deadlines as suggestions", async () => {
    const c = connector();
    const event = await c.toIngestionEvent(c.parseErvXmlContent(NO_DATE, "/x/e.xml")!);
    expect(event.content).toContain("zustell_datum: null");
    expect(event.content).toContain("zustelldatum_unbekannt: true");
    expect(event.content).toContain("frist_nur_vorschlag: true");
    expect(event.content).toContain("Zustelldatum muss manuell eingetragen werden");
    expect(String(event.metadata?.slug)).toBe("legal/erv/undatiert-erv-2026-000123");
  });
});

describe("ERV vs beA detection", () => {
  it("recognises ERV-Rückverkehr and leaves a beA export alone", () => {
    const c = connector();
    expect(c.isErvXml(ERV_XML)).toBe(true);
    const bea = `<nachricht><nachrichtenID>bea-1</nachrichtenID><absender>LG Berlin</absender>
      <aktenzeichen>12 O 34/26</aktenzeichen><betreff>Ladung</betreff></nachricht>`;
    expect(c.isErvXml(bea)).toBe(false);
    expect(c.isErvXml("<<kaputt")).toBe(false);
  });
});
