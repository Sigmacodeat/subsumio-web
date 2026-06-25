/**
 * Gap 10: Writing Styles API.
 *
 * GET /api/legal/writing-styles — list all styles
 * POST /api/legal/writing-styles — create/update custom style
 * DELETE /api/legal/writing-styles?id=xxx — delete custom style
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listStyles,
  getStyle,
  saveStyle,
  deleteStyle,
  PRESET_STYLES,
  DEFAULT_STYLE,
  applyStyleToPrompt,
  type WritingStyle,
} from "@/lib/legal/writing-styles";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const style = getStyle(id);
    if (!style) return NextResponse.json({ error: "style not found" }, { status: 404 });
    return NextResponse.json({ style, prompt_block: applyStyleToPrompt(style) });
  }
  return NextResponse.json({
    styles: listStyles(),
    presets: PRESET_STYLES.map((s) => s.id),
    default: DEFAULT_STYLE.id,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const style = body as WritingStyle;

    if (!style.id || !style.name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }

    saveStyle(style);
    return NextResponse.json({ success: true, style, prompt_block: applyStyleToPrompt(style) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const deleted = deleteStyle(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "cannot delete preset style or style not found" },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true });
}
