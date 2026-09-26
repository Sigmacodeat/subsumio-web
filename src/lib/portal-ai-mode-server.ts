// Server-side read of the firm's portal AI mode (see portal-ai-mode.ts).
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import {
  PORTAL_AI_MODE_DEFAULT,
  resolvePortalAiMode,
  type PortalAiMode,
} from "@/lib/portal-ai-mode";
import { logger } from "@/lib/logger";

const log = logger("lib/portal-ai-mode-server");

/**
 * The portal AI mode of the firm that owns `brainId`. Fail-safe: a settings
 * read error yields the default ("entwurf"), never "direkt" — an engine hiccup
 * must not let an unreviewed AI answer reach a client.
 */
export async function portalAiModeForBrain(brainId: string): Promise<PortalAiMode> {
  try {
    const settings = await loadKanzleiSettingsForBrain(brainId, { timeoutMs: 5_000 });
    return resolvePortalAiMode(settings.portalAiMode);
  } catch (err) {
    log.warn(
      "[portal-ai-mode] settings read failed, using default:",
      err instanceof Error ? err.message : String(err)
    );
    return PORTAL_AI_MODE_DEFAULT;
  }
}
