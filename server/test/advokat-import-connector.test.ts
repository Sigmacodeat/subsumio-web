import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import JSZip from "jszip";
import { AdvokatImportConnector } from "../src/core/ingestion/connectors/advokat-import.ts";

const ROOT = join(tmpdir(), `subsumio-advokat-test-${process.pid}`);

afterEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe("AdvokatImportConnector", () => {
  test("requires a configured read-only mirror", () => {
    expect(() => new AdvokatImportConnector()).toThrow(/watch_dir/);
  });

  test("imports a matter folder and emits a stable delta cursor", async () => {
    const matterDir = join(ROOT, "AKT-2026-001");
    await mkdir(matterDir, { recursive: true });
    await writeFile(join(matterDir, "klage.txt"), "Klage und Beweisangebot");
    const connector = new AdvokatImportConnector({ filters: { watch_dir: ROOT } });

    const first = await connector.fetchDelta();
    expect(first.items).toHaveLength(1);
    const event = await connector.toIngestionEvent(first.items[0]);
    expect(event.content).toContain("Klage und Beweisangebot");
    expect(event.metadata?.matter_reference).toBe("AKT-2026-001");
    expect(event.metadata?.slug).toContain("legal/advokat/akt-2026-001/");

    const second = await connector.fetchDelta(first.nextCursor);
    expect(second.items).toHaveLength(0);
  });

  test("processes safe ZIP exports from ADVOKAT", async () => {
    await mkdir(ROOT, { recursive: true });
    const zip = new JSZip();
    zip.file("AKT-2026-002/notiz.txt", "Frist am 30. Juni");
    await writeFile(join(ROOT, "export.zip"), await zip.generateAsync({ type: "nodebuffer" }));
    const connector = new AdvokatImportConnector({ filters: { watch_dir: ROOT } });

    const result = await connector.fetchDelta();
    expect(result.items).toHaveLength(1);
    const event = await connector.toIngestionEvent(result.items[0]);
    expect(event.content).toContain("Archivdatei: AKT-2026-002/notiz.txt");
    expect(event.content).toContain("Frist am 30. Juni");
  });
});
