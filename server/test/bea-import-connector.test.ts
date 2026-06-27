import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BeaImportConnector } from "../src/core/ingestion/connectors/bea-import.ts";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "bea-test-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Real-world beA exports use namespaces, CDATA, and entities — the old
// regex parser failed on all three.
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bea:nachricht xmlns:bea="urn:bea:export">
  <bea:nachrichtenID>MSG-2026-0042</bea:nachrichtenID>
  <bea:absender>RA Dr. M&#252;ller &amp; Partner</bea:absender>
  <bea:empfaenger>Amtsgericht M&#252;nchen</bea:empfaenger>
  <bea:betreff><![CDATA[Klageerwiderung: Az. 12 C 345/26 -- "Eilig"]]></bea:betreff>
  <bea:sendeDatum>2026-06-01T10:30:00Z</bea:sendeDatum>
  <bea:aktenzeichen>12 C 345/26</bea:aktenzeichen>
  <bea:inhalt><![CDATA[Sehr geehrte Damen und Herren,
anbei die Klageerwiderung.]]></bea:inhalt>
  <bea:anlagen>
    <bea:anlage>
      <bea:name>klageerwiderung.pdf</bea:name>
      <bea:groesse>204800</bea:groesse>
    </bea:anlage>
  </bea:anlagen>
</bea:nachricht>`;

describe("BeaImportConnector", () => {
  it("parses namespaced XML with CDATA and entities", async () => {
    await writeFile(join(dir, "msg1.xml"), SAMPLE_XML);
    const connector = new BeaImportConnector({ filters: { watch_dir: dir } });
    const { items, nextCursor } = await connector.fetchDelta();

    expect(items.length).toBe(1);
    const msg = items[0]! as unknown as Record<string, unknown>;
    expect(msg.messageId).toBe("MSG-2026-0042");
    expect(msg.sender).toBe("RA Dr. Müller & Partner");
    expect(msg.recipient).toBe("Amtsgericht München");
    expect(msg.subject).toBe('Klageerwiderung: Az. 12 C 345/26 -- "Eilig"');
    expect(msg.caseReference).toBe("12 C 345/26");
    expect(String(msg.body)).toContain("Klageerwiderung");
    expect((msg.attachments as unknown[]).length).toBe(1);
    expect(nextCursor).toBeDefined();
  });

  it("skips already-processed files via the cursor", async () => {
    const connector = new BeaImportConnector({ filters: { watch_dir: dir } });
    const first = await connector.fetchDelta();
    const second = await connector.fetchDelta(first.nextCursor);
    expect(second.items.length).toBe(0);
  });

  it("attacker-controlled subject cannot inject frontmatter keys", async () => {
    const evil = SAMPLE_XML.replace(
      '<![CDATA[Klageerwiderung: Az. 12 C 345/26 -- "Eilig"]]>',
      "<![CDATA[Betreff\ntype: admin_override\nsubject: gekapert]]>"
    );
    await writeFile(join(dir, "evil.xml"), evil);
    const connector = new BeaImportConnector({ filters: { watch_dir: dir } });
    const { items } = await connector.fetchDelta();
    const evilItem = items.find((i) =>
      (i as unknown as Record<string, unknown>).filePath?.toString().endsWith("evil.xml")
    );
    expect(evilItem).toBeDefined();

    const event = await connector.toIngestionEvent(evilItem!);
    const fmBlock = event.content.split("---")[1]!;
    const lines = fmBlock.split("\n").map((l) => l.trimEnd());
    expect(lines.some((l) => l.startsWith("type: admin_override"))).toBe(false);
    // exactly one type line, and it is bea_message
    expect(lines.filter((l) => l.startsWith("type:"))).toEqual(["type: bea_message"]);
  });

  it("returns empty for a missing watch dir instead of throwing", async () => {
    const connector = new BeaImportConnector({
      filters: { watch_dir: join(dir, "does-not-exist") },
    });
    const { items } = await connector.fetchDelta();
    expect(items).toEqual([]);
  });
});
