import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

export const maxDuration = 10;

const uploadTokenSchema = z.object({
  source: z.string().min(1).max(50).default("documents"),
  case_slug: z.string().min(1).max(300).optional(),
  title: z.string().max(500).optional(),
  tags: z.string().max(500).optional(),
});

interface UploadTokenPayload {
  brain_id: string;
  user_id: string;
  case_slug?: string;
  source: string;
  title?: string;
  tags?: string;
  exp: number;
}

function signUploadToken(payload: UploadTokenPayload): string {
  const secret = env("SUBSUMIO_INTERNAL_SECRET");
  if (!secret) throw new Error("SUBSUMIO_INTERNAL_SECRET is not set");
  const data = Buffer.from(JSON.stringify(payload));
  const b64 = data.toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    skipCsrf: false,
    body: uploadTokenSchema,
  },
  async (ctx, body) => {
    const b = body as z.infer<typeof uploadTokenSchema>;
    const source = b.source;
    const caseSlug = b.case_slug;
    const title = b.title;
    const tags = b.tags;

    const payload: UploadTokenPayload = {
      brain_id: ctx.brainId,
      user_id: ctx.user.id,
      source,
      ...(caseSlug ? { case_slug: caseSlug } : {}),
      ...(title ? { title } : {}),
      ...(tags ? { tags } : {}),
      exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
    };

    try {
      const token = signUploadToken(payload);
      // Return the engine URL so the browser knows where to send the file.
      // Priority: NEXT_PUBLIC_ENGINE_URL (explicit public URL) > SUBSUMIO_API_URL
      // (on Hetzner Docker, SUBSUMIO_API_URL is internal so NEXT_PUBLIC_ENGINE_URL
      // must be set in docker-compose for browser-direct uploads).
      const engineUrl = env("NEXT_PUBLIC_ENGINE_URL") || env("SUBSUMIO_API_URL") || "";
      return Response.json({
        token,
        expires_in: 600,
        ...(engineUrl ? { engine_url: engineUrl } : {}),
      });
    } catch {
      return Response.json(
        { error: "token_sign_failed", message: "Upload token could not be issued." },
        { status: 500 }
      );
    }
  }
);
