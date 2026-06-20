import { getAuthUrl } from "@/lib/docusign";

export const dynamic = "force-dynamic";

/**
 * GET /api/docusign/auth
 * Gibt die Docusign OAuth Authorization URL zurück.
 */
export async function GET() {
  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://subsum.eu"}/api/docusign/callback`;
    const authUrl = getAuthUrl(redirectUri);
    return Response.json({ authUrl });
  } catch {
    return Response.json({ error: "docusign_not_configured" }, { status: 503 });
  }
}
