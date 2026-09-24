import { portalToken } from "@/lib/portal-session";
import { resolvePortalAccess } from "@/lib/portal-access";

export const dynamic = "force-dynamic";

/**
 * The app manifest of one client's portal: installed from the portal page
 * (the page swaps its manifest link to this one), the app opens straight into
 * that client's matter instead of the lawyers' dashboard.
 */
export async function GET(req: Request): Promise<Response> {
  const token = portalToken(req, new URL(req.url).searchParams.get("token"));
  const access = await resolvePortalAccess(token);
  if (access instanceof Response) return new Response("Not found", { status: 404 });
  const start = `/portal/${encodeURIComponent(token)}`;
  return new Response(
    JSON.stringify({
      name: "Mandantenportal",
      short_name: "Meine Akte",
      description: "Ihre Akte, Dokumente und Nachrichten Ihrer Kanzlei.",
      id: start,
      start_url: start,
      scope: "/portal/",
      display: "standalone",
      background_color: "#0c1017",
      theme_color: "#0c1017",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    }),
    {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    }
  );
}
