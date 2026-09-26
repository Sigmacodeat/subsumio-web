/**
 * Versand-/Freigabe-Gate für gespeicherte Dokumente: eine Seite mit
 * KI-Herkunft (`ai_generated`) verlässt die Kanzlei (E-Mail-Anhang,
 * Portal-Download) nur mit gültiger anwaltlicher Freigabe für ihren aktuellen
 * Text (siehe src/lib/ai-release.ts). Seiten ohne KI-Herkunft — z. B.
 * hochgeladene Schriftstücke — sind nicht betroffen.
 */
import { ENGINE_URL } from "@/lib/engine";
import {
  AI_RELEASE_FM_KEY,
  contentHashOf,
  isAiPage,
  pageBody,
  type ReleaseCheck,
  verifyRelease,
} from "@/lib/ai-release";

export type StoredReleaseCheck =
  | { ok: true; ai: boolean }
  | { ok: false; reason: "unreadable" | Exclude<ReleaseCheck, { ok: true }>["reason"] };

/** Reads the page and decides whether it may leave the firm. Fail-closed. */
export async function checkStoredPageRelease(
  headers: Record<string, string>,
  slug: string,
  brainId: string
): Promise<StoredReleaseCheck> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) return { ok: false, reason: "unreadable" };
  const page = (await res.json().catch(() => null)) as {
    compiled_truth?: string;
    content?: string;
    frontmatter?: Record<string, unknown>;
  } | null;
  if (!page) return { ok: false, reason: "unreadable" };
  const fm = page.frontmatter ?? {};
  if (!isAiPage(fm)) return { ok: true, ai: false };
  const check = verifyRelease(fm[AI_RELEASE_FM_KEY], {
    brainId,
    contentHash: contentHashOf(pageBody(page)),
  });
  return check.ok ? { ok: true, ai: true } : { ok: false, reason: check.reason };
}
