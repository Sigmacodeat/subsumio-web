/**
 * Brain-backed duplicate store for uploaded files.
 *
 * Stores SHA-256 → { slug, name } mappings as small system pages under the
 * `system/hash/` slug prefix within the caller's brain/source. This keeps
 * duplicate detection scoped to the tenant and persists across sessions.
 */

import { ENGINE_URL } from "@/lib/engine";

const HASH_PREFIX = "system/hash/";

export interface DuplicateStore {
  lookup: (sha256: string) => Promise<{ slug: string; name: string } | null>;
  record: (sha256: string, slug: string, name: string) => Promise<void>;
}

export function brainDuplicateStore(headers: Record<string, string>): DuplicateStore {
  return {
    async lookup(sha256: string) {
      const slug = `${HASH_PREFIX}${sha256}`;
      try {
        const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
          headers,
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
      const hashSlug = `${HASH_PREFIX}${sha256}`;
      await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(hashSlug)}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `---\ntitle: ${JSON.stringify(`Duplicate hash for ${name}`)}\ntype: system\noriginal_slug: ${JSON.stringify(slug)}\noriginal_name: ${JSON.stringify(name)}\nhash: ${JSON.stringify(sha256)}\n---\n\nSystem record: duplicate-detection hash for uploaded file.\n`,
        }),
      });
    },
  };
}
