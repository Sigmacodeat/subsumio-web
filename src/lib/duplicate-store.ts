/**
 * Brain-backed duplicate store for uploaded files.
 *
 * Stores SHA-256 → { slug, name } mappings as small system pages under the
 * `system/hash/` slug prefix within the caller's brain/source. This keeps
 * duplicate detection scoped to the tenant and persists across sessions.
 *
 * Case scoping (P1-1): when a `caseScope` is passed, the hash page is keyed
 * per case (`system/hash/c-<caseKey>/<sha256>`). This is deliberate — in a law
 * firm the SAME file legitimately belongs to MULTIPLE matters (standard forms,
 * a shared expert opinion, a framework contract, the same judgment filed in two
 * cases). A brain-wide hard-block would make the second filing impossible. With
 * case scoping, re-uploading the identical file to the SAME case is still caught
 * (genuine accidental duplicate), while filing it in a DIFFERENT case proceeds.
 * Caseless uploads (knowledge sources: wiki, meetings) keep brain-wide dedup,
 * where cross-brain de-duplication is actually desirable.
 */

import { createHash } from "node:crypto";
import { ENGINE_URL } from "@/lib/engine";

const HASH_PREFIX = "system/hash/";

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/** Deterministic single-segment key for a (possibly slash-containing) case slug. */
function caseKey(caseScope: string): string {
  return createHash("sha256").update(caseScope).digest("hex").slice(0, 16);
}

function hashPageSlug(sha256: string, caseScope?: string): string {
  return caseScope ? `${HASH_PREFIX}c-${caseKey(caseScope)}/${sha256}` : `${HASH_PREFIX}${sha256}`;
}

export interface DuplicateStore {
  lookup: (sha256: string) => Promise<{ slug: string; name: string } | null>;
  record: (sha256: string, slug: string, name: string) => Promise<void>;
}

export function brainDuplicateStore(
  headers: Record<string, string>,
  caseScope?: string
): DuplicateStore {
  return {
    async lookup(sha256: string) {
      const slug = hashPageSlug(sha256, caseScope);
      try {
        const res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(slug)}`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return null;
        const page = (await res.json()) as {
          frontmatter?: { original_slug?: string; original_name?: string };
        };
        const originalSlug = page.frontmatter?.original_slug;
        const originalName = page.frontmatter?.original_name;
        if (typeof originalSlug === "string" && typeof originalName === "string") {
          return { slug: originalSlug, name: originalName };
        }
        return null;
      } catch {
        return null;
      }
    },
    async record(sha256: string, slug: string, name: string) {
      const hashSlug = hashPageSlug(sha256, caseScope);
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: hashSlug,
          content: `---\ntitle: ${JSON.stringify(`Duplicate hash for ${name}`)}\ntype: system\noriginal_slug: ${JSON.stringify(slug)}\noriginal_name: ${JSON.stringify(name)}\nhash: ${JSON.stringify(sha256)}\n---\n\nSystem record: duplicate-detection hash for uploaded file.\n`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`duplicate_hash_record_failed_${res.status}`);
    },
  };
}
