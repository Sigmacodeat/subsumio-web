import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { FileSystemCorpusLookupAdapter, type SnapshotLookup } from "./corpus-lookup-adapter";
import { GroundingMapValidator } from "./grounding-map-validator";

describe("GroundingMapValidator — backend-authoritative verification", () => {
  let tmpDir: string;
  let adapter: FileSystemCorpusLookupAdapter;
  let validator: GroundingMapValidator;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "grounding-test-"));
    mkdirSync(join(tmpDir, "de"), { recursive: true });
    mkdirSync(join(tmpDir, "at"), { recursive: true });

    const deBgb = `---
source_url: https://www.gesetze-im-internet.de/bgb/
version_date: 2026-07-09
---
## Inhaltsübersicht

## § 433 — Vertragstypische Pflichten beim Kaufvertrag

(1) Durch den Kaufvertrag wird der Verkäufer einer Sache verpflichtet, dem Käufer die Sache zu übergeben und das Eigentum an der Sache zu verschaffen. Der Verkäufer hat dem Käufer die Sache frei von Sach- und Rechtsmängeln zu verschaffen.

(2) Der Käufer ist verpflichtet, dem Verkäufer den vereinbarten Kaufpreis zu zahlen und die gekaufte Sache abzunehmen.
`;
    writeFileSync(join(tmpDir, "de", "bgb.md"), deBgb);

    const atAbgb = `---
source_url: https://www.ris.bka.gv.at/ABGB/
version_date: 2026-07-10
---
Text

§ 433. (1) Ein fiktiver österreichischer § 433 existiert nur für diesen Test.

(2) Zweiter Absatz mit zusätzlichem Text.
`;
    writeFileSync(join(tmpDir, "at", "abgb.md"), atAbgb);

    const metaMap = {
      bgb: { jurisdiction: "de", label: "BGB", file: "de/bgb.md" },
      abgb: { jurisdiction: "at", label: "ABGB", file: "at/abgb.md" },
    };

    adapter = new FileSystemCorpusLookupAdapter({ corpusDir: tmpDir, metaMap });
    validator = new GroundingMapValidator(adapter);
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("verifies a valid claim and fills backend-authoritative fields", async () => {
    const result = await validator.verify({
      jurisdiction: "de",
      entries: [
        {
          finding: "Kaufvertrag",
          finding_type: "amtshaftung",
          on_reference: "ON 1",
          quote: "Verkauf",
          matched_paragraphs: [
            {
              paragraph: "§ 433",
              statute: "BGB",
              confidence: "hoch",
              source_text: "Durch den Kaufvertrag wird der Verkäufer",
            },
          ],
        },
      ],
    });

    const mp = result[0].matched_paragraphs[0];
    expect(mp.verified).toBe(true);
    if (!mp.verified) return;

    expect(mp.source_slug).toBe("law/de/bgb");
    expect(mp.source_url).toBe("https://www.gesetze-im-internet.de/bgb/");
    expect(mp.valid_from).toBe("2026-07-09");
    expect(mp.valid_to).toBeNull();
    expect(mp.snapshot_hash).toBeDefined();
    expect(mp.evidence_start).toBeGreaterThanOrEqual(0);
    expect(mp.evidence_end).toBeGreaterThan(mp.evidence_start);
    expect(mp.source_text).toContain("Durch den Kaufvertrag wird der Verkäufer");
  });

  test("verifies a valid claim with Absatz", async () => {
    const result = await validator.verify({
      jurisdiction: "de",
      entries: [
        {
          finding: "Kaufvertrag",
          finding_type: "amtshaftung",
          on_reference: "ON 1",
          quote: "Verkauf",
          matched_paragraphs: [
            {
              paragraph: "§ 433 Abs. 1",
              statute: "BGB",
              confidence: "hoch",
            },
          ],
        },
      ],
    });

    const mp = result[0].matched_paragraphs[0];
    expect(mp.verified).toBe(true);
    if (!mp.verified) return;
    expect(mp.source_text).toContain("Durch den Kaufvertrag");
    expect(mp.source_text).not.toContain("(2) Der Käufer");
  });

  test("rejects a manipulated verified=true from the LLM by overriding it", async () => {
    // The LLM may claim a fabricated source_text; the backend must override to false.
    const result = await validator.verify({
      jurisdiction: "de",
      entries: [
        {
          finding: "Kaufvertrag",
          finding_type: "amtshaftung",
          on_reference: "ON 1",
          quote: "Verkauf",
          matched_paragraphs: [
            {
              paragraph: "§ 433",
              statute: "BGB",
              confidence: "hoch",
              source_text: "Dieser Text ist vollständig erfunden und nicht im Gesetz.",
            },
          ],
        },
      ],
    });

    const mp = result[0].matched_paragraphs[0];
    expect(mp.verified).toBe(false);
    if (mp.verified) return;
    expect(mp.reason).toContain("Evidence-Span");
  });

  test("rejects a wrong source (non-existent statute)", async () => {
    const result = await validator.verify({
      jurisdiction: "de",
      entries: [
        {
          finding: "Kaufvertrag",
          finding_type: "amtshaftung",
          on_reference: "ON 1",
          quote: "Verkauf",
          matched_paragraphs: [
            {
              paragraph: "§ 1",
              statute: "NONEXISTENT",
              confidence: "hoch",
            },
          ],
        },
      ],
    });

    const mp = result[0].matched_paragraphs[0];
    expect(mp.verified).toBe(false);
    if (mp.verified) return;
    expect(mp.reason).toContain("Quelle");
  });

  test("rejects a wrong version (snapshot hash mismatch)", async () => {
    const wrongHashSnapshot: SnapshotLookup = {
      async getCurrentSnapshot(slug: string) {
        return {
          content_hash: "0".repeat(64), // deliberately wrong hash
          source_url: "https://snapshot/wrong",
          valid_from: "2020-01-01",
          valid_to: null,
        };
      },
    };

    const adapterWithSnapshot = new FileSystemCorpusLookupAdapter({
      corpusDir: tmpDir,
      metaMap: {
        bgb: { jurisdiction: "de", label: "BGB", file: "de/bgb.md" },
      },
      snapshotLookup: wrongHashSnapshot,
    });
    const validatorWithSnapshot = new GroundingMapValidator(adapterWithSnapshot);

    const result = await validatorWithSnapshot.verify({
      jurisdiction: "de",
      entries: [
        {
          finding: "Kaufvertrag",
          finding_type: "amtshaftung",
          on_reference: "ON 1",
          quote: "Verkauf",
          matched_paragraphs: [
            {
              paragraph: "§ 433",
              statute: "BGB",
              confidence: "hoch",
            },
          ],
        },
      ],
    });

    const mp = result[0].matched_paragraphs[0];
    expect(mp.verified).toBe(false);
    if (mp.verified) return;
    expect(mp.reason).toBe("Falsche Fassung");
  });

  test("rejects a foreign norm with the same paragraph number", async () => {
    // LLM claims § 433 ABGB but the jurisdiction is DE. ABGB is an AT statute,
    // so the backend must reject it as a foreign norm.
    const result = await validator.verify({
      jurisdiction: "de",
      entries: [
        {
          finding: "Kaufvertrag",
          finding_type: "amtshaftung",
          on_reference: "ON 1",
          quote: "Verkauf",
          matched_paragraphs: [
            {
              paragraph: "§ 433",
              statute: "ABGB",
              confidence: "hoch",
            },
          ],
        },
      ],
    });

    const mp = result[0].matched_paragraphs[0];
    expect(mp.verified).toBe(false);
    if (mp.verified) return;
    // Jurisdiction-scoped lookup returns null for ABGB under DE, so reason is
    // "Quelle nicht im Corpus gefunden". The critical behavior is rejection.
    expect(mp.reason).toMatch(/Quelle|Fremdnorm/);
  });

  test("rejects a non-contiguous evidence span", async () => {
    // Claimed text is spliced from two different sentences; it is not a contiguous
    // substring of the paragraph.
    const result = await validator.verify({
      jurisdiction: "de",
      entries: [
        {
          finding: "Kaufvertrag",
          finding_type: "amtshaftung",
          on_reference: "ON 1",
          quote: "Verkauf",
          matched_paragraphs: [
            {
              paragraph: "§ 433",
              statute: "BGB",
              confidence: "hoch",
              source_text:
                "Durch den Kaufvertrag wird der Verkäufer einer Sache verpflichtet. Der Käufer ist verpflichtet, dem Verkäufer den vereinbarten Kaufpreis zu zahlen.",
            },
          ],
        },
      ],
    });

    const mp = result[0].matched_paragraphs[0];
    expect(mp.verified).toBe(false);
    if (mp.verified) return;
    expect(mp.reason).toContain("Evidence-Span");
  });

  test("uses full paragraph as evidence when no source_text is claimed", async () => {
    const result = await validator.verify({
      jurisdiction: "de",
      entries: [
        {
          finding: "Kaufvertrag",
          finding_type: "amtshaftung",
          on_reference: "ON 1",
          quote: "Verkauf",
          matched_paragraphs: [
            {
              paragraph: "§ 433 Abs. 2",
              statute: "BGB",
              confidence: "hoch",
            },
          ],
        },
      ],
    });

    const mp = result[0].matched_paragraphs[0];
    expect(mp.verified).toBe(true);
    if (!mp.verified) return;
    expect(mp.source_text).toContain("Der Käufer ist verpflichtet");
    expect(mp.evidence_end).toBeGreaterThan(mp.evidence_start);
  });
});
