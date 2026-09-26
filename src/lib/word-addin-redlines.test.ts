// @vitest-environment node
/**
 * Word add-in redlines: clauses that differ only in whitespace or quote style
 * are still applied; clauses that cannot be found are reported, not silently
 * dropped; inserted AI text carries the AI marking.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyRedlines, redlineSummary, type Redline } from "../../word-addin/src/redlines";

const r = (
  original_clause: string,
  suggested_text: string,
  change_type: Redline["change_type"] = "modify"
): Redline => ({ original_clause, suggested_text, change_type, reason: "x" });

const contract = `§ 1 Laufzeit
Der Vertrag gilt  für "zwei Jahre".
§ 2 Haftung
Die Haftung ist ausgeschlossen.`;

describe("applyRedlines", () => {
  it("applies clauses that differ only in whitespace and quote style", () => {
    const out = applyRedlines(contract, [
      r("Der Vertrag gilt für „zwei Jahre“.", "Der Vertrag gilt für drei Jahre."),
    ]);
    expect(out.applied).toBe(1);
    expect(out.unapplied).toHaveLength(0);
    expect(out.text).toContain("Der Vertrag gilt für drei Jahre.");
  });

  it("reports clauses it cannot find instead of counting them as applied", () => {
    const out = applyRedlines(contract, [
      r("Die Haftung ist ausgeschlossen.", "Die Haftung ist auf Vorsatz beschränkt."),
      r("Gerichtsstand ist Wien.", "Gerichtsstand ist Graz."),
      r("", "§ 3 Schlussbestimmungen", "add"),
    ]);
    expect(out.applied).toBe(2);
    expect(out.unapplied.map((u) => u.original_clause)).toEqual(["Gerichtsstand ist Wien."]);
    expect(redlineSummary(3, out)).toMatch(/2 von 3 .*1 konnten nicht automatisch angewendet/);
    expect(out.text).toContain("§ 3 Schlussbestimmungen");
  });

  it("replacement text with $ signs is inserted literally", () => {
    const out = applyRedlines("Preis: 100", [r("Preis: 100", "Preis: $& 200")]);
    expect(out.text).toBe("Preis: $& 200");
  });

  it("the taskpane marks inserted AI text and lists unapplied changes", () => {
    const src = readFileSync(path.join(process.cwd(), "word-addin", "src", "taskpane.ts"), "utf8");
    expect(src).not.toContain("await insertTextAtCursor(el.dataset.raw)");
    expect(src.match(/await insertAiTextAtCursor\(el\.dataset\.raw\)/g)).toHaveLength(2);
    expect(src).toContain("insertContentControl()");
    expect(src).toContain("Nicht automatisch angewendet");
    expect(src).toMatch(/buildTrackedChangesOoxml\(original, revised, `\$\{AI_BADGE_LABEL\}/);
  });
});
