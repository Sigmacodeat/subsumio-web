import { csrfFetch } from "@/lib/csrf";

/**
 * Marks onboarding as complete. Throws when the server does not confirm, so the
 * wizard stays open with an error instead of redirecting as if it had worked.
 */
export async function completeOnboarding(body: Record<string, unknown>): Promise<void> {
  const res = await csrfFetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Onboarding-Abschluss fehlgeschlagen (HTTP ${res.status})`);
  }
}
