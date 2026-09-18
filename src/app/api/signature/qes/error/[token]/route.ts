import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { appBase } from "@/lib/qes/config";
import { getQesSession, updateQesSession } from "@/lib/qes/sessions";
import { clientIp, hit } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/** PDF-AS-WEB sends the signer here when signing failed or was cancelled. */
export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  // No user session on this callback — the token is the credential; cap guessing.
  const limited = await hit(`qes:error:${clientIp(req.headers)}`, 30, 60_000);
  if (!limited.ok) return new Response("Too many requests", { status: 429 });
  const { token } = await context.params;
  const session = await getQesSession(token);
  if (!session)
    return new Response("Signaturvorgang nicht gefunden oder abgelaufen.", { status: 404 });
  const reason = (req.nextUrl.searchParams.get("error") ?? "Signatur abgebrochen").slice(0, 200);
  if (session.status !== "signed") {
    await updateQesSession(token, { status: "failed", error: reason });
    void logAudit("signature.qes_failed", "document", {
      entityId: session.documentSlug,
      brainId: session.brainId,
      userId: session.userId,
      userEmail: session.userEmail,
      details: {
        method: session.method,
        error: reason,
        cause: req.nextUrl.searchParams.get("cause")?.slice(0, 500),
      },
    });
  }
  const url = new URL(
    `${appBase()}/dashboard/cases/${session.caseSlug.split("/").map(encodeURIComponent).join("/")}/documents`
  );
  url.searchParams.set("qes", "failed");
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url, 303);
}
