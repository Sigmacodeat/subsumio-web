import { describe, expect, test } from "bun:test";
import { validateBody } from "../scripts/normalize/canonical-schema.ts";
import {
  MAX_LETTERHEAD_LINE,
  splitRaw,
  stripPrintArtifacts,
} from "../scripts/repair-print-artifacts.ts";

const codes = (body: string) => validateBody(body, "statute").map((i) => i.code);

describe("stripPrintArtifacts", () => {
  test("removes the RIS page footer in both orders and clears the gate's pdf_pagebreak", () => {
    const body =
      "§ 1. Die Gemeinde erlässt folgende Verordnung über die Hundehaltung im Ortsgebiet.\n" +
      "www.ris.bka.gv.at Seite 1 von 3\n" +
      "§ 2. Hunde sind an der Leine zu führen, soweit dies zumutbar ist.\n" +
      "Seite 2 von 3 www.ris.bka.gv.at\n" +
      "§ 3. Inkrafttreten.";
    expect(codes(body)).toContain("pdf_pagebreak");
    const r = stripPrintArtifacts(body);
    expect(r.footers).toBe(2);
    expect(r.body).not.toContain("www.ris.bka.gv.at");
    expect(r.body).toContain("§ 2. Hunde sind an der Leine zu führen");
    expect(codes(r.body)).not.toContain("pdf_pagebreak");
  });

  test("a short letterhead line goes, the legal text around it stays", () => {
    const body =
      "Amt der Landesregierung · DVR: 0069264\n\n" +
      "Verlautbarung über die Änderung der Satzung der Versicherungsanstalt.";
    const r = stripPrintArtifacts(body);
    expect(r.letterheadLines).toBe(1);
    expect(r.body).toBe("\nVerlautbarung über die Änderung der Satzung der Versicherungsanstalt.");
    expect(codes(r.body)).not.toContain("letterhead");
  });

  test("a marker inside a long running-text line is NOT touched (manual case)", () => {
    const long =
      "Die Anstalt mit der Registernummer DVR: 0024279 ist verpflichtet, " +
      "x".repeat(MAX_LETTERHEAD_LINE);
    const r = stripPrintArtifacts(long);
    expect(r.letterheadLines).toBe(0);
    expect(r.body).toBe(long);
    expect(codes(r.body)).toContain("letterhead");
  });

  test("a body without artifacts comes back byte-identical", () => {
    const body = "§ 1.   Tabelle  mit   Layout-Abständen\n\n\n\nbleibt   wie sie ist.  \n";
    const r = stripPrintArtifacts(body);
    expect(r.body).toBe(body);
    expect(r.footers + r.letterheadLines).toBe(0);
  });
});

describe("splitRaw", () => {
  test("keeps the frontmatter block exactly as written", () => {
    const head = '---\ntitle: "X"\ncontent_hash: "abc"\n---\n';
    const { head: h, body } = splitRaw(`${head}\nText`);
    expect(h).toBe(head);
    expect(body).toBe("\nText");
  });
});
