/**
 * Gap 8: Knowledge Sources API.
 *
 * GET /api/legal/knowledge-sources — list available sources
 * POST /api/legal/knowledge-sources/search — search laws + cases
 * POST /api/legal/knowledge-sources/paragraph — get specific paragraph
 */

import { NextRequest, NextResponse } from "next/server";
import { getKnowledgeSources } from "@/lib/legal/knowledge-sources";

export async function GET() {
  const ks = getKnowledgeSources();
  return NextResponse.json({
    sources: ks.getAvailableSources(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;
    const ks = getKnowledgeSources();

    if (action === "search_laws") {
      const { query, paragraph } = body;
      if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
      const results = await ks.searchLaws(query, paragraph);
      return NextResponse.json({ results, count: results.length });
    }

    if (action === "search_cases") {
      const { query, court } = body;
      if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
      const results = await ks.searchCases(query, court);
      return NextResponse.json({ results, count: results.length });
    }

    if (action === "get_paragraph") {
      const { law, paragraph } = body;
      if (!law || !paragraph) {
        return NextResponse.json({ error: "law and paragraph are required" }, { status: 400 });
      }
      const result = await ks.getParagraph(law, paragraph);
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
