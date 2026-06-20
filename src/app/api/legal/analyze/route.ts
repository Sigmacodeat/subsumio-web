import { NextRequest } from "next/server";
import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  ENGINE_URL,
  engineConfigurationResponse,
  requireEngineContext,
} from "@/lib/engine";
import { validateCsrf, CSRF_COOKIE_NAME } from "@/lib/csrf";
import { apiError } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { timingSafeCompare } from "@/lib/crypto-utils";

export const maxDuration = 120;

// ── Internal service auth ─────────────────────────────────────────────
const INTERNAL_SECRET = env("SIGMABRAIN_INTERNAL_SECRET");

// ── Zod validation ────────────────────────────────────────────────────
const analyzeSchema = z.object({
  document_slug: z.string().optional(),
  text: z.string().optional(),
  jurisdiction: z.string().optional(),
  brain_id: z.string().optional(),
}).passthrough();

// ── Corpus knowledge base ─────────────────────────────────────────────
const CORPUS_META: Record<string, { jurisdiction: "at" | "de" | "ch"; label: string; file: string }> = {
  abgb:    { jurisdiction: "at", label: "ABGB", file: "at/abgb.md" },
  ahg:     { jurisdiction: "at", label: "AHG", file: "at/ahg.md" },
  bao:     { jurisdiction: "at", label: "BAO", file: "at/bao.md" },
  eo:      { jurisdiction: "at", label: "EO", file: "at/eo.md" },
  stgb_at: { jurisdiction: "at", label: "StGB (AT)", file: "at/stgb-at.md" },
  stpo_at: { jurisdiction: "at", label: "StPO (AT)", file: "at/stpo-at.md" },
  ugb:     { jurisdiction: "at", label: "UGB", file: "at/ugb.md" },
  zpo_at:  { jurisdiction: "at", label: "ZPO (AT)", file: "at/zpo-at.md" },
  ao:      { jurisdiction: "de", label: "AO", file: "de/ao.md" },
  bgb:     { jurisdiction: "de", label: "BGB", file: "de/bgb.md" },
  estg:    { jurisdiction: "de", label: "EStG", file: "de/estg.md" },
  famfg:   { jurisdiction: "de", label: "FamFG", file: "de/famfg.md" },
  gg:      { jurisdiction: "de", label: "GG", file: "de/gg.md" },
  gmbhg:   { jurisdiction: "de", label: "GmbHG", file: "de/gmbhg.md" },
  hgb:     { jurisdiction: "de", label: "HGB", file: "de/hgb.md" },
  inso:    { jurisdiction: "de", label: "InsO", file: "de/inso.md" },
  stgb:    { jurisdiction: "de", label: "StGB", file: "de/stgb.md" },
  stpo:    { jurisdiction: "de", label: "StPO", file: "de/stpo.md" },
  ustg:    { jurisdiction: "de", label: "UStG", file: "de/ustg.md" },
  uwg:     { jurisdiction: "de", label: "UWG", file: "de/uwg.md" },
  zpo:     { jurisdiction: "de", label: "ZPO", file: "de/zpo.md" },
  or:      { jurisdiction: "ch", label: "OR", file: "ch/or.md" },
  stgb_ch: { jurisdiction: "ch", label: "StGB (CH)", file: "ch/stgb.md" },
  zgb:     { jurisdiction: "ch", label: "ZGB", file: "ch/zgb.md" },
};

const CORPUS_DIR = path.join(process.cwd(), "law-corpus");
const CORPUS_SPLIT_DIR = path.join(process.cwd(), "law-corpus-split");

// ── Citation types ────────────────────────────────────────────────────

interface RawCitation {
  code?: string;
  paragraph?: string;
  context?: string;
}

interface GroundedCitation {
  code: string;
  paragraph: string;
  context: string;
  verified: boolean;
  source_text?: string;
  source_file?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function normalizeStatuteCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_");
}

async function lookupSplitParagraph(
  code: string,
  paragraph: string,
): Promise<string | null> {
  const normalized = normalizeStatuteCode(code);
  const canonicalKey = Object.keys(CORPUS_META).find(
    (k) =>
      k === normalized ||
      k === normalized.replace(/_at$/, "_at") ||
      CORPUS_META[k].label.toLowerCase().includes(code.toLowerCase()),
  );

  const abbr = canonicalKey
    ? CORPUS_META[canonicalKey].label.match(/^([A-Z][A-Za-z\u00c4\u00d6\u00dc]+)/)?.[1] || code.toUpperCase()
    : code.toUpperCase();

  const jur = canonicalKey ? CORPUS_META[canonicalKey].jurisdiction : "de";
  const paraClean = paragraph.replace(/^\u00a7\s*/, "").trim();
  const slug = `${abbr.toLowerCase()}-par-${paraClean.toLowerCase()}`;
  const splitPath = path.join(CORPUS_SPLIT_DIR, jur, `${slug}.md`);

  try {
    const content = await fs.readFile(splitPath, "utf8");
    if (content.startsWith("---")) {
      const end = content.indexOf("---", 3);
      return end !== -1 ? content.slice(end + 3).trimStart() : content;
    }
    return content;
  } catch {
    return null;
  }
}

async function lookupCorpusParagraph(
  codeKey: string,
  paragraph: string,
): Promise<string | null> {
  const meta = CORPUS_META[codeKey];
  if (!meta) return null;

  try {
    const text = await fs.readFile(path.join(CORPUS_DIR, meta.file), "utf8");
    const paraNum = paragraph.replace(/^\u00a7\s*/, "").trim();

    const deMatch = text.match(
      new RegExp(`## \u00a7 ${paraNum}[^\\n]*\\n([\\s\\S]{0,1500}?)(?=\\n## \u00a7|$)`),
    );
    if (deMatch) return deMatch[1].trim();

    const atIdx = text.search(new RegExp(`\u00a7\\s*${paraNum}\\.`));
    if (atIdx !== -1) {
      const nextAt = text.search(new RegExp(`\u00a7\\s*${String(Number(paraNum) + 1)}\\.`));
      const end = nextAt !== -1 ? nextAt : atIdx + 1000;
      return text.slice(atIdx, end).slice(0, 800).trim();
    }

    return null;
  } catch {
    return null;
  }
}

async function groundCitations(
  rawCitations: RawCitation[],
): Promise<GroundedCitation[]> {
  const results: GroundedCitation[] = [];

  for (const cite of rawCitations.slice(0, 20)) {
    if (!cite.code || !cite.paragraph) continue;

    const code = String(cite.code).trim();
    const paragraph = String(cite.paragraph).trim();
    const context = String(cite.context || "").trim();

    let sourceText = await lookupSplitParagraph(code, paragraph);

    if (!sourceText) {
      const normalized = normalizeStatuteCode(code);
      const codeKey = Object.keys(CORPUS_META).find(
        (k) =>
          k === normalized ||
          CORPUS_META[k].label.toUpperCase().startsWith(code.toUpperCase()),
      );
      if (codeKey) {
        sourceText = await lookupCorpusParagraph(codeKey, paragraph);
      }
    }

    results.push({
      code,
      paragraph,
      context,
      verified: sourceText !== null,
      ...(sourceText ? { source_text: sourceText.slice(0, 600) } : {}),
    });
  }

  return results;
}

function safeParseJson(text: string): Record<string, unknown> {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch { /* ignore */ }
    }
    return {};
  }
}

function buildEmptyResult(reason: string): Record<string, unknown> {
  return {
    document_type: "unknown",
    type_confidence: 0,
    parties: [],
    deadlines: [],
    cited_statutes: [],
    risks: [],
    action_items: [],
    summary: reason,
    language: "de",
  };
}

function buildAnalysisPrompt(text: string, jurisdiction: string): string {
  const jurHint =
    jurisdiction === "all"
      ? "AT (\u00d6sterreich), DE (Deutschland) oder CH (Schweiz)"
      : jurisdiction.toUpperCase();

  return `Du bist ein \u00f6sterreichischer/deutscher Rechtsexperte. Analysiere das folgende Rechtsdokument.

KRITISCHE REGEL: Du darfst KEINE Gesetzesnormen erfinden oder raten. Nenne AUSSCHLIESSLICH \u00a7-Paragraphen, die EXPLIZIT im Dokument genannt werden oder sich zwingend logisch aus dem Dokumenttyp ergeben (Kaufvertrag \u2192 \u00a7 433 BGB, Gew\u00e4hrleistung \u2192 \u00a7 922 ABGB, etc.).

Antworte AUSSCHLIESSLICH als g\u00fcltiges JSON ohne Markdown-Codeblock, keine anderen Zeichen au\u00dferhalb des JSON.

Dokument:
---
${text}
---

Rechtsordnung: ${jurHint}

Extrahiere:
1. document_type: Kaufvertrag | Mietvertrag | Arbeitsvertrag | Gerichtsurteil | Schriftsatz | Mahnschreiben | Anwaltsschreiben | Rechnung | Gesetzesentwurf | Korrespondenz | sonstiges
2. type_confidence: 0.0\u20131.0 (wie sicher bist du beim document_type)
3. parties: Vollst\u00e4ndige Namen der Beteiligten (Klient, Gegner, Gericht, Beh\u00f6rde)
4. deadlines: Fristen und Daten aus dem Dokument
5. cited_statutes: Nur \u00a7\u00a7 die im Dokument stehen ODER zwingend anwendbar sind
6. risks: Konkrete rechtliche Risiken mit Schweregrad
7. action_items: N\u00e4chste konkrete Schritte f\u00fcr den Anwalt
8. summary: 2-3 pr\u00e4zise S\u00e4tze
9. language: de | en | other

Antworte JETZT mit reinem JSON:
{
  "document_type": "string",
  "type_confidence": 0.0,
  "parties": [{"name":"string","role":"Klient|Gegner|Gericht|Beh\u00f6rde|Zeuge|sonstige"}],
  "deadlines": [{"label":"string","date":"string","urgency":"critical|normal","source":"exact quote from document"}],
  "cited_statutes": [{"code":"string","paragraph":"string","context":"why this statute applies"}],
  "risks": [{"severity":"high|medium|low","description":"string","mitigation":"string"}],
  "action_items": ["string"],
  "summary": "string",
  "language": "string"
}`;
}

// ── Route handler ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Determine auth: internal service call vs. authenticated user session
  const internalSecret = req.headers.get("x-internal-secret");
  const isInternal =
    Boolean(INTERNAL_SECRET) &&
    Boolean(internalSecret) &&
    timingSafeCompare(internalSecret!, INTERNAL_SECRET!);

  let engineHeaders: Record<string, string> = {};

  if (!isInternal) {
    // User session path: full auth + RBAC + rate limit + quota + CSRF
    const ctx = await requireEngineContext(req, "legal.document_review", "heavy", "queries");
    if (ctx instanceof Response) return ctx;

    // CSRF check for user session path
    const cookieValue = req.cookies.get(CSRF_COOKIE_NAME)?.value;
    if (!validateCsrf(req, cookieValue)) {
      return apiError("csrf_invalid", "CSRF token missing or invalid", 403);
    }

    engineHeaders = ctx.headers;
  } else {
    // Internal: build engine headers from environment
    const apiKey =
      env("SIGMABRAIN_WEB_API_KEY") || "";
    engineHeaders = apiKey ? { "x-subsumio-api-key": apiKey } : {};
  }

  const configError = engineConfigurationResponse();
  if (configError) return configError;

  // Zod validation
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("invalid_json", "Request body is not valid JSON", 400);
  }

  const result = analyzeSchema.safeParse(raw);
  if (!result.success) {
    return apiError("validation_failed", "Request body validation failed", 400, {
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const body = result.data;

  const documentSlug =
    typeof body.document_slug === "string" ? body.document_slug.trim() : "";
  const jurisdiction =
    typeof body.jurisdiction === "string" ? body.jurisdiction.toLowerCase() : "all";

  // Only internal service callers may specify a brain_id; authenticated user
  // sessions always use the server-resolved brainId from engineContext to
  // prevent IDOR (cross-tenant brain access).
  if (isInternal) {
    const brainId = typeof body.brain_id === "string" ? body.brain_id : "";
    if (brainId) {
      engineHeaders = { ...engineHeaders, "x-subsumio-source": brainId };
    }
  }

  // 1. Fetch document text from Brain engine
  let text = "";
  if (documentSlug) {
    try {
      const pageRes = await fetch(
        `${ENGINE_URL}/api/pages/${encodeURIComponent(documentSlug)}`,
        { headers: engineHeaders },
      );
      if (pageRes.ok) {
        const page = (await pageRes.json()) as { content?: string; title?: string };
        text = [page.title, page.content].filter(Boolean).join("\n\n");
      }
    } catch { /* best-effort */ }
  }

  if (!text && typeof body.text === "string") {
    text = body.text;
  }

  if (!text.trim()) {
    return apiError("document_not_found_or_empty", "Document not found or empty", 404);
  }

  // 2. Truncate to ~80k chars
  const MAX_CHARS = 80_000;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS) + "\n\n[... document truncated for analysis]";
  }

  // 3. AI analysis via engine /api/think
  let parsed: Record<string, unknown>;
  try {
    const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...engineHeaders },
      body: JSON.stringify({
        prompt: buildAnalysisPrompt(text, jurisdiction),
        mode: "json",
        max_tokens: 4000,
      }),
    });

    if (!thinkRes.ok) {
      throw new Error(`Engine think ${thinkRes.status}`);
    }

    const thinkData = (await thinkRes.json()) as { answer?: string };
    parsed = safeParseJson(thinkData.answer || "{}");
  } catch (err) {
    console.error("[analyze] AI step failed:", err instanceof Error ? err.message : String(err));
    return Response.json(buildEmptyResult("Analyse fehlgeschlagen \u2014 Engine nicht verf\u00fcgbar."));
  }

  // 4. Ground cited_statutes against actual corpus (anti-hallucination)
  const rawCitations = Array.isArray(parsed.cited_statutes)
    ? (parsed.cited_statutes as RawCitation[])
    : [];

  const groundedCitations = await groundCitations(rawCitations);
  parsed.cited_statutes = groundedCitations;

  const verified = groundedCitations.filter((c) => c.verified).length;
  const unverified = groundedCitations.filter((c) => !c.verified).length;
  parsed._grounding = {
    citations_verified: verified,
    citations_unverified: unverified,
    corpus_checked: true,
    analyzed_at: new Date().toISOString(),
  };

  // 5. Store analysis as page metadata (best-effort, non-blocking)
  if (documentSlug) {
    void (async () => {
      try {
        await fetch(
          `${ENGINE_URL}/api/pages/${encodeURIComponent(documentSlug)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...engineHeaders },
            body: JSON.stringify({
              meta: {
                auto_analysis: parsed,
                analyzed_at: new Date().toISOString(),
              },
            }),
          },
        );
      } catch { /* best-effort */ }
    })();
  }

  return Response.json(parsed);
}
