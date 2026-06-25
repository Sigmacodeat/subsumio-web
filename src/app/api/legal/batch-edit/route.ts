/**
 * Gap 11: Batch Document Editing API.
 *
 * POST /api/legal/batch-edit
 * Body: BatchOperation (see batch-edit.ts)
 *
 * Führt eine Bulk-Operation auf mehreren Brain-Pages aus.
 * Unterstützt: replace_text, add_tag, remove_tag, update_frontmatter, delete_pages, change_type
 * Unterstützt dry_run Modus.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeBatch, type BatchOperation } from "@/lib/legal/batch-edit";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as BatchOperation;
    const authHeaders: Record<string, string> = {
      Authorization: req.headers.get("authorization") ?? "",
      "x-subsumio-source": req.headers.get("x-subsumio-source") ?? "",
    };

    if (!body.type || !body.slugs || !Array.isArray(body.slugs) || body.slugs.length === 0) {
      return NextResponse.json(
        { error: "type and non-empty slugs array are required" },
        { status: 400 }
      );
    }

    if (body.slugs.length > 500) {
      return NextResponse.json({ error: "Maximum 500 pages per batch operation" }, { status: 400 });
    }

    const result = await executeBatch(body, authHeaders);

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
