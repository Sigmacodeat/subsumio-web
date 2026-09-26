// @vitest-environment node
/**
 * Contract between the Word add-in's "Vertrag entwerfen" and
 * POST /api/legal/contract-draft: the add-in sends exactly what the route
 * validates and reads the draft the engine returns.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contractDraftSchema } from "@/lib/legal/contract-draft-schema";
import {
  buildContractDraftRequest,
  readContractDraftResponse,
} from "../../word-addin/src/contract-draft";

describe("Word add-in contract draft", () => {
  it("sends a payload the route's schema accepts", () => {
    const r = buildContractDraftRequest({
      type: "NDA / Geheimhaltungsvereinbarung",
      jurisdiction: "at",
      partyA: "Muster GmbH",
      partyB: "Beispiel AG",
      instructions: "Laufzeit 2 Jahre",
      context: "Bestehende Klausel …",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const parsed = contractDraftSchema.safeParse(r.body);
    expect(parsed.success).toBe(true);
    expect(r.body.instructions).toContain("Kontext aus dem Word-Dokument");
    expect(r.body).not.toHaveProperty("template_type");
    expect(r.body).not.toHaveProperty("instruction");
  });

  it("asks for the missing fields instead of sending an invalid request", () => {
    const base = {
      type: "Kaufvertrag",
      jurisdiction: "de",
      partyA: "A",
      partyB: "B",
      instructions: "",
    };
    expect(buildContractDraftRequest({ ...base, type: "" }).ok).toBe(false);
    expect(buildContractDraftRequest({ ...base, partyB: " " }).ok).toBe(false);
    expect(buildContractDraftRequest({ ...base, jurisdiction: "us" }).ok).toBe(false);
  });

  it("reads the engine's JSON draft with the route's grounding", () => {
    const a = readContractDraftResponse(
      JSON.stringify({
        title: "NDA",
        contract_markdown: "> KI-Entwurf\n\n§ 1 Gegenstand",
        clauses: [],
        warnings: [],
        _grounding: { citations_verified: 1, citations_unverified: 0 },
      }),
      "application/json"
    );
    expect(a.text).toContain("§ 1 Gegenstand");
    expect(a.grounding?.citations_verified).toBe(1);
  });

  it("reads an event stream too, and reports an empty draft's warnings", () => {
    const sse =
      `data: ${JSON.stringify({ chunk: "§ 1 " })}\n\n` +
      `data: ${JSON.stringify({ chunk: "Gegenstand" })}\n\n` +
      `data: ${JSON.stringify({ citations: [], grounding: { citations_verified: 0, citations_unverified: 0 } })}\n\n` +
      "data: [DONE]\n\n";
    const a = readContractDraftResponse(sse, "text/event-stream");
    expect(a.text).toBe("§ 1 Gegenstand");
    expect(a.grounding).toBeTruthy();
    const empty = readContractDraftResponse(
      JSON.stringify({ contract_markdown: "", warnings: ["NO_LLM_AVAILABLE"] }),
      "application/json"
    );
    expect(empty.text).toBe("");
    expect(empty.warnings).toEqual(["NO_LLM_AVAILABLE"]);
  });

  it("the taskpane posts the built request and has the required fields", () => {
    const src = readFileSync(path.join(process.cwd(), "word-addin", "src", "taskpane.ts"), "utf8");
    const html = readFileSync(
      path.join(process.cwd(), "word-addin", "src", "taskpane.html"),
      "utf8"
    );
    expect(src).toContain("buildContractDraftRequest(");
    expect(src).not.toMatch(/template_type:/);
    for (const id of ["draftJurisdiction", "draftPartyA", "draftPartyB", "draftTemplate"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});
