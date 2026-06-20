/**
 * Brain provisioning — explicitly initializes a tenant's brain on the Engine
 * after signup, instead of waiting for lazy creation on first API call.
 *
 * The Engine's web-api.ts has `ensureSource()` which lazily creates the source
 * row on first write. This function pre-warms the brain so:
 *   1. The first user experience is instant (no cold-start penalty)
 *   2. Industry-specific skill packs are mounted
 *   3. We can detect Engine connectivity issues at signup time
 *
 * Fire-and-forget: signup never fails if the Engine is unreachable.
 */

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { packForIndustry } from "@/lib/industry-pack";

export interface ProvisionResult {
  ok: boolean;
  brainId: string;
  error?: string;
}

/**
 * Provision a tenant brain on the Engine.
 * Called after user creation in signup/register flows.
 *
 * Sends a lightweight stats request to trigger source creation,
 * then optionally mounts the industry skill pack.
 */
export async function provisionBrain(
  brainId: string,
  opts?: { industry?: string | null },
): Promise<ProvisionResult> {
  const headers = engineHeadersForBrain(brainId);
  const pack = packForIndustry(opts?.industry);

  try {
    // 1. Trigger source creation by hitting stats endpoint
    const res = await fetch(`${ENGINE_URL}/api/stats`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok && res.status !== 404) {
      // 404 is ok — means source doesn't exist yet, will be created on first write
      return { ok: false, brainId, error: `engine returned ${res.status}` };
    }

    // 2. If industry pack is specified, mount it via the engine API
    if (pack) {
      try {
        await fetch(`${ENGINE_URL}/api/skillpack/apply`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ pack }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // Skill pack mounting is optional — brain still works without it
      }
    }

    return { ok: true, brainId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Engine unreachable — brain will be lazily provisioned on first API call
    return { ok: false, brainId, error };
  }
}

/**
 * Fire-and-forget brain provisioning.
 * Use this in signup/register flows where you don't want to block the response.
 */
export function provisionBrainAsync(brainId: string, opts?: { industry?: string | null }): void {
  void provisionBrain(brainId, opts).catch((err) => {
    console.error(`[provision] failed for ${brainId}:`, err instanceof Error ? err.message : String(err));
  });
}
