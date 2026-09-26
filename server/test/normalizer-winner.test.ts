import { describe, expect, test } from "bun:test";
import { betterQ, parseRaw, qualityOf } from "../scripts/normalize/normalize-corpus.ts";

/**
 * Two files of the same RIS document: the newer version wins, even when it
 * is shorter (a correction, a paragraph that fell away) — the older, longer
 * file must not silently replace the daily delta's update.
 */
const file = (fm: string, body: string) => `---\nnor_id: "NOR1"\n${fm}---\n\n${body}\n`;

describe("normalizer: which file of one document wins", () => {
  test("newer but shorter beats older and longer", () => {
    const old = qualityOf(
      "at-normen/abgb/p-1.md",
      parseRaw(
        file(
          'zuletzt_geaendert: "2025-01-01"\n',
          "Alter Text mit einem Absatz, der inzwischen entfallen ist. ".repeat(5)
        )
      )
    );
    const neu = qualityOf(
      "at-normen/gnr-10001622/p-1.md",
      parseRaw(file('zuletzt_geaendert: "2026-09-20"\n', "Neuer, kürzerer Text."))
    );
    expect(betterQ(old, neu).path).toBe("at-normen/gnr-10001622/p-1.md");
    expect(betterQ(neu, old).path).toBe("at-normen/gnr-10001622/p-1.md");
  });

  test("RIS date formats are compared as dates (DD.MM.YYYY)", () => {
    const a = qualityOf("a.md", parseRaw(file('zuletzt_aktualisiert: "04.09.2025"\n', "Text A.")));
    const b = qualityOf(
      "b.md",
      parseRaw(file('zuletzt_aktualisiert: "15.01.2026"\n', "Text B länger."))
    );
    expect(betterQ(a, b).path).toBe("b.md");
  });

  test("a newer stub still loses against a clean older text", () => {
    const old = qualityOf(
      "old.md",
      parseRaw(file('zuletzt_geaendert: "2025-01-01"\n', "Echter Normtext."))
    );
    const stub = qualityOf(
      "stub.md",
      parseRaw(file('zuletzt_geaendert: "2026-01-01"\n', "Volltext nicht abrufbar"))
    );
    expect(betterQ(old, stub).path).toBe("old.md");
  });

  test("without dates the content decides, as before", () => {
    const short = qualityOf("s.md", parseRaw(file("", "Kurz.")));
    const long = qualityOf("l.md", parseRaw(file("", "Deutlich längerer Normtext mit Inhalt.")));
    expect(betterQ(short, long).path).toBe("l.md");
  });
});
