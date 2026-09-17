import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { clientIp, hit } from "@/lib/auth/rate-limit";
import { sha256Hex } from "@/lib/qes/pdf-as";
import { getQesSession, updateQesSession } from "@/lib/qes/sessions";

export const dynamic = "force-dynamic";

/**
 * PDF-AS-WEB downloads the original PDF here (pdf-url). The token is the only
 * credential; the digest of what was handed out is recorded, so the signed
 * result can be bound to exactly this file (origdigest).
 */
export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const limited = await hit(`qes:pdf:${clientIp(req.headers)}`, 30, 60_000);
  if (!limited.ok) return new Response("Too many requests", { status: 429 });
  const { token } = await context.params;
  const session = await getQesSession(token);
  if (!session || (session.status !== "pending" && session.status !== "fetched")) {
    return new Response("Not found", { status: 404 });
  }
  const res = await fetch(
    `${ENGINE_URL}/api/files/${session.documentSlug.split("/").map(encodeURIComponent).join("/")}`,
    { headers: engineHeadersForBrain(session.brainId), signal: AbortSignal.timeout(30_000) }
  );
  if (!res.ok) return new Response("Not found", { status: 404 });
  const pdf = Buffer.from(await res.arrayBuffer());
  const digest = sha256Hex(pdf);
  if (session.originalDigest && session.originalDigest !== digest) {
    // The document changed between two downloads — refuse to sign a moving target.
    await updateQesSession(token, {
      status: "failed",
      error: "Das Dokument wurde während der Signatur geändert.",
    });
    return new Response("Conflict", { status: 409 });
  }
  await updateQesSession(token, { status: "fetched", originalDigest: digest });
  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
