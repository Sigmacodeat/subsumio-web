import { describe, expect, test } from "vitest";
import { answerProseOnly, localizeAnswerSections } from "./answer-sections";

const sample =
  "## Answer\n\nDie Frist beträgt vier Wochen.\n\n## Gaps\n\n- Kein Zustelldatum bekannt.\n\n## Sources\n\n- § 464 ZPO";

describe("answer sections", () => {
  test("localizes headings to German", () => {
    const de = localizeAnswerSections(sample, "de");
    expect(de).toContain("## Antwort");
    expect(de).toContain("## Offene Punkte");
    expect(de).toContain("## Quellen");
    expect(localizeAnswerSections("## Conflicts\nA vs B", "de")).toBe("## Widersprüche\nA vs B");
    expect(de).not.toMatch(/## (Answer|Gaps|Sources)/);
  });

  test("keeps English when the UI is English", () => {
    expect(localizeAnswerSections(sample, "en")).toBe(sample);
  });

  test("prose-only strips the answer heading and the gaps block", () => {
    const prose = answerProseOnly(sample);
    expect(prose.startsWith("Die Frist beträgt vier Wochen.")).toBe(true);
    expect(prose).not.toContain("Gaps");
    expect(prose).not.toContain("Zustelldatum");
    expect(prose).toContain("## Sources");
  });

  test("prose-only handles a trailing gaps block", () => {
    expect(answerProseOnly("## Answer\nText.\n\n## Gaps\n- a\n- b")).toBe("Text.");
  });

  test("prose-only handles bold and plain gaps markers and a briefing heading", () => {
    expect(answerProseOnly("## Morgen-Briefing\n\nHeute ruhig.\n\n**Gaps**\n- x")).toBe(
      "Heute ruhig."
    );
    expect(answerProseOnly("Heute ruhig.\n\nGaps:\nKeine Details.")).toBe("Heute ruhig.");
  });
});
