import { z } from "zod";
import { createHandler, recordQuota } from "@/lib/api-handler";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { maxUploadSizeFor } from "@/lib/upload-validation";
import { isSupportedUploadName, SUPPORTED_UPLOAD_MIME_TYPES } from "@/lib/upload-formats";

export const maxDuration = 10;

const uploadTokenSchema = z.object({
  source: z.string().min(1).max(50).default("documents"),
  case_slug: z.string().min(1).max(300).optional(),
  title: z.string().max(500).optional(),
  tags: z.string().max(500).optional(),
  filename: z.string().min(1).max(500),
  size: z.number().int().positive(),
  mime_type: z.string().max(200).optional(),
  password_hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

const ALLOWED_SOURCES = new Set([
  "documents",
  "kanzleiwissen",
  "wiki",
  "meetings",
  "people",
  "companies",
  "ideas",
  "chat",
  "legal_case",
  "legal",
]);
const LEGAL_SOURCES = new Set(["documents", "legal_case", "legal"]);

interface UploadTokenPayload {
  brain_id: string;
  user_id: string;
  case_slug?: string;
  source: string;
  title?: string;
  tags?: string;
  filename: string;
  size: number;
  mime_type?: string;
  password_hash?: string;
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
    quota: "uploads",
    skipCsrf: false,
    body: uploadTokenSchema,
  },
  async (ctx, body) => {
    const b = body as z.infer<typeof uploadTokenSchema>;
    if (!ALLOWED_SOURCES.has(b.source)) {
      return Response.json(
        { error: "invalid_source", message: "Ungültige Upload-Quelle." },
        { status: 400 }
      );
    }
    const source = b.source;
    const caseSlug = b.case_slug;
    const title = b.title;
    const tags = b.tags;

    const genericMime = !b.mime_type || b.mime_type === "application/octet-stream";
    if (
      b.filename.includes("\0") ||
      b.filename.includes("/") ||
      b.filename.includes("\\") ||
      b.filename === "." ||
      b.filename === ".."
    ) {
      return Response.json(
        { error: "invalid_filename", message: "Ungültiger Dateiname." },
        { status: 400 }
      );
    }
    if (
      !isSupportedUploadName(b.filename) ||
      (!genericMime && !SUPPORTED_UPLOAD_MIME_TYPES.has(b.mime_type!.toLowerCase()))
    ) {
      return Response.json(
        { error: "unsupported_file_type", message: "Dateityp nicht erlaubt." },
        { status: 415 }
      );
    }
    const fileLimit = maxUploadSizeFor(b.filename, b.mime_type ?? "");
    if (b.size > fileLimit) {
      return Response.json(
        {
          error: "file_too_large_for_format",
          message: `Datei überschreitet das Formatlimit von ${Math.round(fileLimit / 1024 / 1024)} MB.`,
        },
        { status: 413 }
      );
    }

    if (LEGAL_SOURCES.has(source) && !caseSlug) {
      return Response.json(
        { error: "case_required", message: "Für Rechtsdokumente muss eine Akte gewählt werden." },
        { status: 400 }
      );
    }
    if (caseSlug) {
      const encoded = caseSlug.split("/").map(encodeURIComponent).join("/");
      const engineUrl = env("SUBSUMIO_API_URL") || "http://localhost:3001";
      try {
        const caseRes = await fetch(`${engineUrl}/api/pages/${encoded}`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(10_000),
        });
        if (!caseRes.ok || ((await caseRes.json()) as { type?: string }).type !== "legal_case") {
          return Response.json(
            { error: "case_not_found", message: "Die angegebene Akte existiert nicht." },
            { status: 404 }
          );
        }
      } catch {
        return Response.json(
          { error: "case_validation_failed", message: "Die Akte konnte nicht geprüft werden." },
          { status: 503 }
        );
      }
    }

    const payload: UploadTokenPayload = {
      brain_id: ctx.brainId,
      user_id: ctx.user.id,
      source,
      ...(caseSlug ? { case_slug: caseSlug } : {}),
      ...(title ? { title } : {}),
      ...(tags ? { tags } : {}),
      filename: b.filename,
      size: b.size,
      ...(b.mime_type ? { mime_type: b.mime_type } : {}),
      ...(b.password_hash ? { password_hash: b.password_hash } : {}),
      exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
    };

    try {
      const token = signUploadToken(payload);
      // A direct-upload token reserves one upload unit. This closes the quota
      // bypass without trusting a browser callback after the large body lands.
      await recordQuota(ctx, "uploads");
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
