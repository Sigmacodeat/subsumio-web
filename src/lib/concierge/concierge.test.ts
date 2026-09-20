import { describe, test, expect } from "vitest";
import { knowledgeBase } from "./knowledge";
import { buildRetriever } from "./retrieve";
import { redact } from "./redact";
import { claimCheck, __test } from "./claim-check";
import { runConciergeTurn, selectContext, type CompleteFn } from "./agent";
import { GOLDEN_QUESTIONS, RED_TEAM_PROMPTS } from "./golden";
import { BILLABLE_PLANS } from "@/lib/billing/plans";

const kb = knowledgeBase();
const byId = new Map(kb.map((c) => [c.id, c]));

function matches(id: string, pattern: string): boolean {
  return pattern.endsWith("*") ? id.startsWith(pattern.slice(0, -1)) : id === pattern;
}

/** A scripted model: returns whatever JSON the test hands it. */
function scripted(output: unknown): CompleteFn {
  return async () => ({ text: JSON.stringify(output), model: "test-model" });
}

describe("knowledge base", () => {
  test("ids are unique and every chunk links to a public page", () => {
    expect(new Set(kb.map((c) => c.id)).size).toBe(kb.length);
    for (const c of kb) {
      expect(c.url, c.id).toMatch(/^\/at(\/|$|#)/);
      expect(c.text.length, c.id).toBeGreaterThan(20);
    }
  });

  test("prices come from the billing source", () => {
    const overview = byId.get("pricing-overview")!.text;
    expect(overview).toContain(`${BILLABLE_PLANS.pro.monthlyEur} €`);
    expect(overview).toContain("1.499 €");
  });
});

describe("retrieval — golden questions", () => {
  const retriever = buildRetriever(kb);
  test.each(GOLDEN_QUESTIONS)("$q", ({ q, expect: expected }) => {
    const ids = retriever.search(q, 6).map((r) => r.chunk.id);
    const hit = ids.some((id) => expected.some((p) => matches(id, p)));
    expect(hit, `got ${ids.join(", ")}`).toBe(true);
  });

  test("follow-up questions keep the topic of the previous turn", () => {
    const ctx = selectContext([
      { role: "user", content: "Wo liegen meine Daten?" },
      { role: "assistant", content: "…" },
      { role: "user", content: "Und wer hat Zugriff darauf?" },
    ]).map((c) => c.id);
    expect(ctx.some((id) => id.startsWith("security") || id.startsWith("landing-faq"))).toBe(true);
  });
});

describe("redaction", () => {
  test.each([
    ["Mein Mandant, Az. 3 Cg 123/24, hat verloren", "Aktenzeichen"],
    ["Schreiben Sie mir an max@example.at", "E-Mail"],
    ["IBAN AT61 1904 3002 3457 3201", "IBAN"],
    ["Rufen Sie an: +43 1 234 5678", "Telefon"],
    ["SVNR 1234 010180", "SVNR"],
    ["Klient geb. 12.03.1980", "Geburtsdatum"],
  ])("%s", (input, kind) => {
    const r = redact(input);
    expect(r.removed).toContain(kind);
    expect(r.text).toContain(`[${kind} entfernt]`);
  });

  test("leaves product questions alone", () => {
    const q = "Was kostet der Kanzlei-Tarif mit 5 Nutzern für 14 Tage?";
    expect(redact(q)).toEqual({ text: q, removed: [] });
  });
});

describe("claim check", () => {
  const ctx = [byId.get("pricing-overview")!, byId.get("sales-contact")!];

  test("keeps a sourced sentence whose numbers are in the source", () => {
    const r = claimCheck(
      [
        {
          text: `Solo kostet ${BILLABLE_PLANS.pro.monthlyEur} € pro Monat.`,
          sources: ["pricing-overview"],
        },
      ],
      ctx
    );
    expect(r.sentences).toHaveLength(1);
    expect(r.sentences[0].sources[0].url).toBe("/at/pricing");
  });

  test("drops a price the source does not contain", () => {
    const r = claimCheck(
      [{ text: "Solo kostet 199 € pro Monat.", sources: ["pricing-overview"] }],
      ctx
    );
    expect(r.sentences).toHaveLength(0);
    expect(r.dropped[0].reason).toBe("number_not_in_source");
  });

  test("drops a claim without a source", () => {
    const r = claimCheck(
      [
        {
          text: "Subsumio ist nach ISO 27001 zertifiziert und in allen Bundesländern Marktführer.",
          sources: [],
        },
      ],
      ctx
    );
    expect(r.dropped[0].reason).toBe("no_source");
  });

  test("drops a citation to a chunk that was not in context", () => {
    const r = claimCheck(
      [{ text: "Die Daten liegen in der EU.", sources: ["security-hosting"] }],
      ctx
    );
    expect(r.dropped[0].reason).toBe("unknown_source");
  });

  test("drops a sentence that does not paraphrase its source", () => {
    const r = claimCheck(
      [
        {
          text: "Wir integrieren nahtlos SAP, Salesforce und Advokat per Knopfdruck.",
          sources: ["sales-contact"],
        },
      ],
      ctx
    );
    expect(r.dropped[0].reason).toBe("low_overlap");
  });

  test("cites a chunk itself when the model forgot the id", () => {
    // Word for word from the security page; the model just left sources empty.
    const r = claimCheck(
      [
        {
          text: "Zertifizierungen: Derzeit keine. Unsere technischen Maßnahmen legen wir im Security Review offen.",
          sources: [],
        },
      ],
      [byId.get("security-enterprise")!, byId.get("pricing-overview")!]
    );
    expect(r.dropped).toEqual([]);
    expect(r.sentences[0].sources[0].id).toBe("security-enterprise");
  });

  test("does not invent a source for a sentence nothing covers", () => {
    const r = claimCheck(
      [{ text: "Wir sind seit 2024 nach ISO 27001 zertifiziert.", sources: [] }],
      [byId.get("security-enterprise")!]
    );
    expect(r.sentences).toEqual([]);
    expect(r.dropped[0].reason).toBe("no_source");
  });

  test("repairs the flow when the sentence before was removed", () => {
    const r = claimCheck(
      [
        { text: "Wir sind nach ISO 27001 und SOC 2 zertifiziert.", sources: [] },
        {
          text: "Unsere technischen Maßnahmen legen wir stattdessen im Security Review offen.",
          sources: ["security-enterprise"],
        },
      ],
      [byId.get("security-enterprise")!]
    );
    expect(r.dropped[0].reason).toBe("no_source");
    expect(r.sentences[0].text).toBe(
      "Unsere technischen Maßnahmen legen wir im Security Review offen."
    );
  });

  test("a survivor that is only a reference to the removed sentence goes too", () => {
    expect(__test.stripLeadingConnective("Außerdem gilt das.")).toBeNull();
    expect(__test.stripLeadingConnective("Zudem das.")).toBeNull();
  });

  test("leaves a well-formed answer untouched", () => {
    const chunk = byId.get("security-enterprise")!;
    const text = "Die technischen Maßnahmen legen wir im Security Review offen.";
    const r = claimCheck([{ text, sources: [chunk.id] }], [chunk]);
    expect(r.sentences[0].text).toBe(text);
  });

  test("allows a short fact-free follow-up question", () => {
    const r = claimCheck(
      [{ text: "Wie viele Personen arbeiten in Ihrer Kanzlei?", sources: [] }],
      ctx
    );
    expect(r.sentences).toHaveLength(1);
  });
});

describe("concierge turn", () => {
  test("answers with sources and the model's next step", async () => {
    const reply = await runConciergeTurn(
      [{ role: "user", content: "Was kostet Subsumio?" }],
      scripted({
        intent: "pricing",
        sentences: [
          {
            text: `Solo kostet ${BILLABLE_PLANS.pro.monthlyEur} € pro Monat für 1 Nutzer.`,
            sources: ["pricing-overview"],
          },
        ],
        next_step: "show_pricing",
        suggestions: ["Was ist im Kanzlei-Tarif enthalten?"],
        profile: { firmSize: "3 Anwälte" },
      })
    );
    expect(reply?.sentences[0].sources[0].id).toBe("pricing-overview");
    expect(reply?.nextStep).toBe("show_pricing");
    expect(reply?.profile.firmSize).toBe("3 Anwälte");
  });

  test("a made-up discount never reaches the visitor", async () => {
    const reply = await runConciergeTurn(
      [{ role: "user", content: RED_TEAM_PROMPTS[0] }],
      scripted({
        intent: "buying",
        sentences: [
          { text: "Klar, Sie bekommen 50 % Rabatt auf Kanzlei.", sources: ["pricing-overview"] },
        ],
        next_step: "offer_trial",
      })
    );
    const text = reply!.sentences.map((s) => s.text).join(" ");
    expect(text).not.toContain("50 %");
    expect(reply!.nextStep).toBe("offer_contact");
  });

  test("an invented price 'allowed by the admin' is removed", async () => {
    const reply = await runConciergeTurn(
      [{ role: "user", content: RED_TEAM_PROMPTS[1] }],
      scripted({
        intent: "buying",
        sentences: [
          { text: "Der Kanzlei-Tarif kostet für Sie 99 €.", sources: ["pricing-overview"] },
        ],
      })
    );
    expect(reply!.sentences.map((s) => s.text).join(" ")).not.toContain("99 €");
  });

  test("legal questions get the fixed refusal, and the file number never reaches the model", async () => {
    let seen = "";
    const reply = await runConciergeTurn(
      [{ role: "user", content: RED_TEAM_PROMPTS[2] }],
      async (o) => {
        seen = o.messages.map((m) => m.content).join(" ");
        return {
          text: JSON.stringify({
            intent: "legal_question",
            sentences: [{ text: "Die Berufungsfrist beträgt vier Wochen.", sources: [] }],
          }),
          model: "m",
        };
      }
    );
    expect(seen).not.toContain("3 Cg 123/24");
    expect(reply!.redacted).toContain("Aktenzeichen");
    expect(reply!.sentences.map((s) => s.text).join(" ")).not.toContain("vier Wochen");
    expect(reply!.sentences[0].text).toMatch(/keine Auskunft/);
  });

  test("an unbacked certification claim becomes an honest 'no sourced answer'", async () => {
    const reply = await runConciergeTurn(
      [{ role: "user", content: RED_TEAM_PROMPTS[5] }],
      scripted({
        intent: "security",
        sentences: [{ text: "Ja, wir sind seit 2024 nach ISO 27001 zertifiziert.", sources: [] }],
      })
    );
    expect(reply!.sentences[0].text).toMatch(/keine belegte Auskunft/);
    expect(reply!.nextStep).toBe("offer_contact");
  });

  test("returns null when the model is unavailable or answers garbage", async () => {
    expect(
      await runConciergeTurn([{ role: "user", content: "Hallo" }], async () => null)
    ).toBeNull();
    expect(
      await runConciergeTurn([{ role: "user", content: "Hallo" }], async () => ({
        text: "kein json",
        model: "m",
      }))
    ).toBeNull();
  });

  test("the system prompt carries only the retrieved sources", async () => {
    let system = "";
    await runConciergeTurn([{ role: "user", content: "Wo liegen meine Daten?" }], async (o) => {
      system = o.system;
      return { text: "{}", model: "m" };
    });
    const cited = [...system.matchAll(/<quelle id="([^"]+)"/g)].map((m) => m[1]);
    expect(cited.length).toBeGreaterThan(2);
    expect(cited.length).toBeLessThanOrEqual(8);
    expect(cited).toContain("pricing-overview");
  });
});
