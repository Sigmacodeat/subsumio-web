/**
 * Gap 13: Word-Export API Endpoint.
 *
 * POST /api/word-export
 * Body: { slug: string, title?: string }
 *
 * Lädt eine Brain-Page, konvertiert den compiled_truth (Markdown) zu .docx,
 * und gibt die Datei als Download zurück.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateDocx } from "@/lib/docx-export";
import { ENGINE_URL } from "@/lib/engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const slug = body.slug;
    const title = body.title || "Subsumio Dokument";
    const directMarkdown = body.markdown;
    const formData = body.formData;

    let md: string;
    let caseRef = "";

    if (directMarkdown && typeof directMarkdown === "string") {
      // Direct markdown mode — build a formatted document from the text + form data
      md = buildMarkdownFromDraft(directMarkdown, title, formData);
    } else if (slug && typeof slug === "string") {
      // Fetch page from engine
      const engineRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers: {
          Authorization: req.headers.get("authorization") ?? "",
          "Content-Type": "application/json",
        },
      });

      if (!engineRes.ok) {
        return NextResponse.json(
          { error: `Failed to fetch page: ${engineRes.status}` },
          { status: engineRes.status }
        );
      }

      const page = await engineRes.json();
      md = String(page.compiled_truth ?? page.content ?? "");
      caseRef = String(page.frontmatter?.case_ref ?? "");
    } else {
      return NextResponse.json({ error: "either slug or markdown is required" }, { status: 400 });
    }

    const docxBytes = await generateDocx(md, {
      title,
      caseRef: caseRef || undefined,
    });

    // Return as downloadable .docx file
    const filename = `${title.replace(/[^a-zA-Z0-9äöüßÄÖÜ]/g, "_").slice(0, 60)}.docx`;
    return new NextResponse(Buffer.from(docxBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(docxBytes.byteLength),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Build a formatted Markdown document from draft text and form metadata.
 * Produces proper headings, metadata block, and AI notice.
 */
function buildMarkdownFromDraft(
  text: string,
  title: string,
  formData?: Record<string, unknown>
): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  if (formData) {
    const klaeger = String(formData.klaeger ?? "—");
    const beklagter = String(formData.beklagter ?? "—");
    const legalBasis = String(formData.legalBasis ?? "—");
    lines.push(`**Kläger/Absender:** ${klaeger}`);
    lines.push("");
    lines.push(`**Beklagter/Empfänger:** ${beklagter}`);
    lines.push("");
    lines.push(`**Rechtsgrundlage:** ${legalBasis}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  lines.push(text);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "> Dieses Dokument wurde mit Unterstützung von Subsumio Legal AI erstellt und erfordert anwaltliche Prüfung (§ 8 RVG, § 3 RAO)."
  );
  return lines.join("\n");
}
