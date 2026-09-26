/**
 * Browser helper: issue a fresh client-portal link for a matter.
 *
 * Portal links are never stored in readable form (the matter keeps only the
 * token hash in its link registry). Wherever the UI offers "copy portal link",
 * it asks the server for a new one — the server checks matter access and the
 * portal release, signs a token and registers its hash.
 */
import { csrfFetch } from "@/lib/csrf";

export async function issuePortalLink(caseSlug: string): Promise<string> {
  const res = await csrfFetch("/api/portal/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseSlug }),
  });
  const data = (await res.json().catch(() => null)) as {
    url?: string;
    error?: string;
    message?: string;
  } | null;
  if (!res.ok || !data?.url) {
    throw new Error(data?.message || data?.error || "Portal-Link konnte nicht erzeugt werden");
  }
  return data.url.startsWith("http") ? data.url : `${window.location.origin}${data.url}`;
}
