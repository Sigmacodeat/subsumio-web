// @vitest-environment node

import { describe, test, expect } from "vitest";
import { buildChatExportMarkdown } from "./chat-export";
import type { ChatMessage } from "./chat-types";

const labels = {
  user: "Frage",
  ai: "Antwort",
  date: "Exportiert am",
  sources: "Quellen",
  gaps: "Lücken",
  locale: "de-DE",
};

const answer: ChatMessage = {
  id: "a1",
  role: "assistant",
  content: "Nach § 1295 ABGB haftet der Schädiger.",
  createdAt: "2026-09-18T10:00:00Z",
  grounding: {
    citations_verified: 1,
    citations_unverified: 1,
    corpus_checked: true,
    analyzed_at: "2026-09-18T10:00:01Z",
    has_unverified: true,
    grounded_citations: [
      {
        code: "ABGB",
        paragraph: "§ 1295",
        verified: true,
        source_url: "https://www.ris.bka.gv.at/NormDokument.wxe?Paragraf=1295",
      },
      {
        code: "OGH",
        paragraph: "4 Ob 999/99z",
        verified: false,
        category: "judikatur",
        search_url: "https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Justiz&GZ=4Ob999%2F99z",
      },
    ],
  },
};

describe("buildChatExportMarkdown", () => {
  const md = buildChatExportMarkdown(
    [{ id: "u1", role: "user", content: "Haftung?", createdAt: "" }, answer],
    labels
  );

  test("carries the EU AI Act notice", () => {
    expect(md).toContain("EU AI Act Art. 50");
  });

  test("lists verified citations with their official link", () => {
    expect(md).toContain(
      "- ✓ § 1295 ABGB (im Rechtskorpus verifiziert) — [amtliche Quelle](https://www.ris.bka.gv.at/NormDokument.wxe?Paragraf=1295)"
    );
  });

  test("flags unverified decisions, court first, with a RIS search", () => {
    expect(md).toContain(
      "- ⚠ OGH 4 Ob 999/99z (nicht verifiziert — bitte prüfen) — [im RIS suchen]"
    );
  });

  test("user questions get no Fundstellen block", () => {
    const [userPart] = md.split("---\n\n").slice(-2);
    expect(userPart).not.toContain("Geprüfte Fundstellen");
  });
});
