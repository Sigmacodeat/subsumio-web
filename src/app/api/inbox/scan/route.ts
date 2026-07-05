import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

const scanItemSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z
    .enum(["application/pdf", "image/png", "image/jpeg", "image/tiff"])
    .default("application/pdf"),
  base64Content: z.string().min(1),
});

const scanSchema = z.object({
  items: z.array(scanItemSchema).min(1).max(50),
  caseSlug: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: scanSchema,
    audit: (_ctx, body) => ({
      action: "intake.scan_upload" as const,
      entityType: "intake_request",
      details: { count: body.items.length, caseSlug: body.caseSlug },
    }),
  },
  async (ctx, body, _query, _req) => {
    const created: Array<{ slug: string; title: string }> = [];

    for (const item of body.items) {
      const buffer = Buffer.from(item.base64Content, "base64");
      const hash = createHash("sha256").update(buffer).digest("hex");

      const slug = `intake/scan/${Date.now()}-${hash.slice(0, 8)}`;
      const title = `Scan: ${item.filename}`;

      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          slug,
          title,
          type: "intake_request",
          content: `Eingescanntes Dokument: ${item.filename}`,
          frontmatter: {
            type: "intake_request",
            source: "scan",
            status: "new",
            summary: `Eingescanntes Dokument (${item.filename})`,
            missing_documents: [],
            conflict_check_status: "pending",
            case_slug: body.caseSlug,
            file_hash: hash,
            file_name: item.filename,
            file_size: buffer.length,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        created.push({ slug, title });
      }
    }

    return Response.json({ ok: true, created: created.length, items: created });
  }
);
