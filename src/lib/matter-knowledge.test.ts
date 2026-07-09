import { describe, expect, it } from "vitest";
import { applyMatterKnowledgeMutation } from "@/lib/matter-knowledge";
import type { CaseFrontmatter } from "@/lib/legal-types";

const source = { type: "whatsapp" as const, label: "WhatsApp vom 08.07.2026" };
const now = "2026-07-08T12:00:00.000Z";

describe("applyMatterKnowledgeMutation", () => {
  it("adds new approved matter knowledge with source and audit trail", () => {
    const result = applyMatterKnowledgeMutation(
      {},
      {
        action: "add",
        factId: "manual-fact-1",
        statement: "Mandant teilte neue Lieferadresse mit",
        source,
        actor: { id: "u1", name: "RA Mesic", type: "lawyer" },
        now,
      }
    );

    expect(result.review).toMatchObject({
      fact_id: "manual-fact-1",
      status: "approved",
      original_statement: "Mandant teilte neue Lieferadresse mit",
      source: source.label,
      reviewed_at: now,
    });
    expect(result.frontmatter.knowledge_reviews).toHaveLength(1);
    expect(result.frontmatter.audit_log?.[0]).toMatchObject({
      action: "knowledge_add",
      actor: "RA Mesic",
      actorId: "u1",
      actorType: "lawyer",
      field: "knowledge_reviews",
      newValue: "Mandant teilte neue Lieferadresse mit",
      source,
    });
  });

  it("corrects existing knowledge while preserving original statement", () => {
    const fm: CaseFrontmatter = {
      knowledge_reviews: [
        {
          fact_id: "claim-0",
          status: "approved",
          original_statement: "Frist endet am 1. Juli",
          source: "Uploadanalyse",
          reviewed_at: "2026-07-07T10:00:00.000Z",
        },
      ],
    };

    const result = applyMatterKnowledgeMutation(fm, {
      action: "correct",
      factId: "claim-0",
      correctedStatement: "Frist endet am 3. Juli",
      source: { type: "document", label: "Gerichtsschreiben", slug: "docs/gericht" },
      now,
    });

    expect(result.frontmatter.knowledge_reviews?.[0]).toMatchObject({
      fact_id: "claim-0",
      status: "corrected",
      original_statement: "Frist endet am 1. Juli",
      corrected_statement: "Frist endet am 3. Juli",
    });
    expect(result.frontmatter.audit_log?.[0]).toMatchObject({
      action: "knowledge_correct",
      oldValue: "Frist endet am 1. Juli",
      newValue: "Frist endet am 3. Juli",
    });
  });

  it("marks stale knowledge as superseded by replacing it with the newer state", () => {
    const fm: CaseFrontmatter = {
      knowledge_reviews: [
        {
          fact_id: "fact-status",
          status: "corrected",
          original_statement: "Gegenseite bestreitet Anspruch",
          corrected_statement: "Gegenseite bestreitet Anspruch nur teilweise",
          source: "E-Mail",
          reviewed_at: "2026-07-07T10:00:00.000Z",
        },
      ],
    };

    const result = applyMatterKnowledgeMutation(fm, {
      action: "supersede",
      factId: "fact-status",
      correctedStatement: "Gegenseite erkennt Hauptforderung an, bestreitet aber Zinsen",
      source: { type: "email", label: "E-Mail Gegenseite vom 08.07.2026" },
      now,
    });

    expect(result.review).toMatchObject({
      status: "corrected",
      original_statement: "Gegenseite bestreitet Anspruch nur teilweise",
      corrected_statement: "Gegenseite erkennt Hauptforderung an, bestreitet aber Zinsen",
      source: "E-Mail Gegenseite vom 08.07.2026",
    });
    expect(result.audit.action).toBe("knowledge_supersede");
  });

  it("rejects knowledge and records the rejection without losing the audit trail", () => {
    const result = applyMatterKnowledgeMutation(
      { audit_log: [{ id: "a0", at: now, action: "created", field: "case" }] },
      {
        action: "reject",
        factId: "claim-0",
        statement: "Falsch extrahierte Behauptung",
        source: { type: "upload_analysis", label: "OCR Analyse" },
        now,
      }
    );

    expect(result.review.status).toBe("rejected");
    expect(result.frontmatter.audit_log).toHaveLength(2);
    expect(result.frontmatter.audit_log?.[1].action).toBe("knowledge_reject");
  });

  it("requires a fact id for non-add mutations", () => {
    expect(() =>
      applyMatterKnowledgeMutation(
        {},
        {
          action: "approve",
          statement: "Ohne ID nicht eindeutig",
          source,
          now,
        }
      )
    ).toThrow("knowledge_approve_requires_fact_id");
  });
});
