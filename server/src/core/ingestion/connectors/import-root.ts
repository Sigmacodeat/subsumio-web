/**
 * Folder-bridge import roots (ADVOKAT / beA folder connectors).
 *
 * Several firms share one engine host, so a firm-bound folder connector may
 * only read below its own import root: `<SUBSUMIO_CONNECTOR_IMPORT_ROOT>/<source_id>`
 * (default root `/imports`). Without a tenant (single-firm install) the root
 * itself is the limit. Paths are compared after `realpath`, so `..` segments
 * and symlinks pointing outside the root are rejected.
 */
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, join, sep } from "node:path";

const DEFAULT_IMPORT_ROOT = "/imports";
const TENANT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function connectorImportRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SUBSUMIO_CONNECTOR_IMPORT_ROOT?.trim();
  return configured && isAbsolute(configured) ? configured : DEFAULT_IMPORT_ROOT;
}

/** The directory a connector of `tenantSource` may read from (not yet resolved). */
export function tenantImportRoot(
  tenantSource: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const root = connectorImportRoot(env);
  if (tenantSource === undefined) return root;
  if (!TENANT_RE.test(tenantSource) || tenantSource === "default") return null;
  return join(root, tenantSource);
}

export type WatchDirResult =
  | { ok: true; watchDir: string; root: string }
  | { ok: false; reason: "outside_import_root" | "import_root_missing" | "not_a_directory" };

function isWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * Resolve a requested watch directory for `tenantSource`. A relative path is
 * taken below the tenant's import root; an absolute path must resolve inside
 * it. Anything else is refused.
 */
export function resolveTenantWatchDir(
  requested: string,
  tenantSource: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): WatchDirResult {
  const rootPath = tenantImportRoot(tenantSource, env);
  if (!rootPath || !requested || requested.includes("\0")) {
    return { ok: false, reason: "outside_import_root" };
  }
  let root: string;
  try {
    root = realpathSync(rootPath);
    if (!statSync(root).isDirectory()) return { ok: false, reason: "import_root_missing" };
  } catch {
    return { ok: false, reason: "import_root_missing" };
  }
  const candidate = isAbsolute(requested) ? requested : join(root, requested);
  let watchDir: string;
  try {
    watchDir = realpathSync(candidate);
  } catch {
    // Unresolvable: report "outside" when the literal path already leaves the
    // root, so the answer does not reveal what exists elsewhere on the host.
    return {
      ok: false,
      reason: isWithin(candidate, root) ? "not_a_directory" : "outside_import_root",
    };
  }
  if (!isWithin(watchDir, root)) return { ok: false, reason: "outside_import_root" };
  try {
    if (!statSync(watchDir).isDirectory()) return { ok: false, reason: "not_a_directory" };
  } catch {
    return { ok: false, reason: "not_a_directory" };
  }
  return { ok: true, watchDir, root };
}

/**
 * Runtime re-check for a stored connector config: a firm-bound connector
 * (tenant_source_id set) only scans a watch dir inside its own import root.
 * Configurations stored before the root existed stop scanning instead of
 * reading elsewhere. Connectors without a tenant keep their operator-set dir.
 */
export function tenantWatchDirAllowed(
  watchDir: string,
  tenantSource: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (tenantSource === undefined) return true;
  const res = resolveTenantWatchDir(watchDir, tenantSource, env);
  return res.ok;
}
