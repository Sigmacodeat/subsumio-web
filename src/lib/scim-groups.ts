// SCIM groups of a firm's directory, stored per firm (Postgres in
// production, a JSON file in local dev), and the firm's mapping from a
// directory group to a Subsumio role.
//
// Groups are keyed by (org, group id): one tenant's IdP can never list, read
// or overwrite another tenant's groups, even with a colliding id. A group
// grants a role only when the firm admin mapped its name to one in the SCIM
// settings; admin is never assigned from a group, and admins/the owner are
// never changed by a group (see applyScimGroupRoles in src/lib/scim.ts).
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SCIMGroup, SCIMPatchOperation } from "@/lib/scim";
import type { KanzleiRole } from "@/lib/auth/store";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { env } from "@/lib/env";

export interface StoredScimGroup extends SCIMGroup {
  /** Org this group belongs to — every route must filter/check this before reading or writing. */
  _orgId: string;
}

/** Roles a directory group may carry. Never "admin". */
export type ScimMappedRole = Exclude<KanzleiRole, "admin">;
export const SCIM_MAPPABLE_ROLES: readonly ScimMappedRole[] = [
  "lawyer",
  "assistant",
  "client_viewer",
];

export interface ScimGroupStore {
  list(orgId: string): Promise<StoredScimGroup[]>;
  get(orgId: string, id: string): Promise<StoredScimGroup | null>;
  /** Creates or replaces the group (keyed by org and id). */
  put(group: StoredScimGroup): Promise<StoredScimGroup>;
  /**
   * Read-modify-write under a lock (Postgres) / the write queue (file):
   * concurrent PATCHes from the IdP never lose members. Returns null when
   * the group does not exist in this org.
   */
  update(
    orgId: string,
    id: string,
    fn: (group: StoredScimGroup) => StoredScimGroup
  ): Promise<{ before: StoredScimGroup; after: StoredScimGroup } | null>;
  delete(orgId: string, id: string): Promise<StoredScimGroup | null>;
}

// ── File adapter (dev) ──────────────────────────────────────────────────────

const DATA_DIR = env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");

export class FileScimGroupStore implements ScimGroupStore {
  private cache: StoredScimGroup[] | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string = path.join(DATA_DIR, "scim-groups.json")) {}

  private async load(): Promise<StoredScimGroup[]> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(this.file, "utf8")) as StoredScimGroup[];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.cache ?? [], null, 2), "utf8");
    await fs.rename(tmp, this.file);
  }

  /** Serialises every mutation, so read-modify-write cannot interleave. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list(orgId: string) {
    return (await this.load()).filter((g) => g._orgId === orgId).map((g) => structuredClone(g));
  }

  async get(orgId: string, id: string) {
    const g = (await this.load()).find((x) => x._orgId === orgId && x.id === id);
    return g ? structuredClone(g) : null;
  }

  put(group: StoredScimGroup) {
    return this.exclusive(async () => {
      const all = await this.load();
      const i = all.findIndex((x) => x._orgId === group._orgId && x.id === group.id);
      if (i === -1) all.push(structuredClone(group));
      else all[i] = structuredClone(group);
      await this.persist();
      return structuredClone(group);
    });
  }

  update(orgId: string, id: string, fn: (group: StoredScimGroup) => StoredScimGroup) {
    return this.exclusive(async () => {
      const all = await this.load();
      const i = all.findIndex((x) => x._orgId === orgId && x.id === id);
      if (i === -1) return null;
      const before = structuredClone(all[i]);
      const after = { ...fn(structuredClone(all[i])), id, _orgId: orgId };
      all[i] = after;
      await this.persist();
      return { before, after: structuredClone(after) };
    });
  }

  delete(orgId: string, id: string) {
    return this.exclusive(async () => {
      const all = await this.load();
      const i = all.findIndex((x) => x._orgId === orgId && x.id === id);
      if (i === -1) return null;
      const [removed] = all.splice(i, 1);
      await this.persist();
      return removed;
    });
  }
}

// ── Postgres adapter (production) ───────────────────────────────────────────

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_scim_groups (
    org_id text NOT NULL,
    id text NOT NULL,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, id)
  )`,
]);

function rowToGroup(row: { data: unknown; org_id: unknown; id: unknown }): StoredScimGroup {
  const data = (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as StoredScimGroup;
  return { ...data, id: String(row.id), _orgId: String(row.org_id) };
}

export class PgScimGroupStore implements ScimGroupStore {
  private pool() {
    const pool = getSharedPgPool();
    if (!pool) throw new Error("SCIM group store: no database configured");
    return pool;
  }

  async list(orgId: string) {
    await ensureSchema();
    const { rows } = await this.pool().query(
      "SELECT org_id, id, data FROM subsumio_scim_groups WHERE org_id = $1 ORDER BY created_at ASC",
      [orgId]
    );
    return rows.map(rowToGroup);
  }

  async get(orgId: string, id: string) {
    await ensureSchema();
    const { rows } = await this.pool().query(
      "SELECT org_id, id, data FROM subsumio_scim_groups WHERE org_id = $1 AND id = $2",
      [orgId, id]
    );
    return rows[0] ? rowToGroup(rows[0]) : null;
  }

  async put(group: StoredScimGroup) {
    await ensureSchema();
    // node-postgres serialises the object for the jsonb parameter itself.
    await this.pool().query(
      `INSERT INTO subsumio_scim_groups (org_id, id, data) VALUES ($1, $2, $3)
       ON CONFLICT (org_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [group._orgId, group.id, group]
    );
    return group;
  }

  async update(orgId: string, id: string, fn: (group: StoredScimGroup) => StoredScimGroup) {
    await ensureSchema();
    const client = await this.pool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT org_id, id, data FROM subsumio_scim_groups WHERE org_id = $1 AND id = $2 FOR UPDATE",
        [orgId, id]
      );
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const before = rowToGroup(rows[0]);
      const after = { ...fn(structuredClone(before)), id, _orgId: orgId };
      await client.query(
        "UPDATE subsumio_scim_groups SET data = $3, updated_at = now() WHERE org_id = $1 AND id = $2",
        [orgId, id, after]
      );
      await client.query("COMMIT");
      return { before, after };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async delete(orgId: string, id: string) {
    await ensureSchema();
    const { rows } = await this.pool().query(
      "DELETE FROM subsumio_scim_groups WHERE org_id = $1 AND id = $2 RETURNING org_id, id, data",
      [orgId, id]
    );
    return rows[0] ? rowToGroup(rows[0]) : null;
  }
}

let store: ScimGroupStore | null = null;

export function getScimGroupStore(): ScimGroupStore {
  if (!store) store = getSharedPgPool() ? new PgScimGroupStore() : new FileScimGroupStore();
  return store;
}

/** Tests only: swap the store. */
export function setScimGroupStoreForTests(next: ScimGroupStore | null): void {
  store = next;
}

export async function listGroupsForOrg(orgId: string): Promise<StoredScimGroup[]> {
  return getScimGroupStore().list(orgId);
}

export async function getGroupForOrg(id: string, orgId: string): Promise<StoredScimGroup | null> {
  return getScimGroupStore().get(orgId, id);
}

/** Member ids of a group (our user ids). */
export function groupMemberIds(group: Pick<SCIMGroup, "members"> | null | undefined): Set<string> {
  return new Set((group?.members ?? []).map((m) => m.value).filter(Boolean));
}

/** Users whose membership differs between two versions of a group. */
export function changedMembers(
  before: Pick<SCIMGroup, "members"> | null | undefined,
  after: Pick<SCIMGroup, "members"> | null | undefined
): string[] {
  const a = groupMemberIds(before);
  const b = groupMemberIds(after);
  const out = new Set<string>();
  for (const id of a) if (!b.has(id)) out.add(id);
  for (const id of b) if (!a.has(id)) out.add(id);
  return [...out];
}

const ROLE_RANK: Record<ScimMappedRole, number> = { client_viewer: 1, assistant: 2, lawyer: 3 };

/** Normalised lookup key for a group name in the firm's mapping. */
export function groupRoleKey(displayName: string): string {
  return displayName.trim().toLowerCase();
}

/**
 * The role a person gets from the groups they are in: the highest mapped
 * role, or null when none of their groups is mapped. Never "admin".
 */
export function roleFromGroups(
  userId: string,
  groups: Array<Pick<SCIMGroup, "displayName" | "members">>,
  mapping: Record<string, string> | null | undefined
): ScimMappedRole | null {
  let best: ScimMappedRole | null = null;
  for (const g of groups) {
    if (!groupMemberIds(g).has(userId)) continue;
    const mapped = mapping?.[groupRoleKey(g.displayName ?? "")];
    if (!mapped || !(SCIM_MAPPABLE_ROLES as readonly string[]).includes(mapped)) continue;
    const role = mapped as ScimMappedRole;
    if (!best || ROLE_RANK[role] > ROLE_RANK[best]) best = role;
  }
  return best;
}

/** The lower of two roles (for someone who left every mapped group). */
export function lowerRole(a: ScimMappedRole, b: ScimMappedRole): ScimMappedRole {
  return ROLE_RANK[a] <= ROLE_RANK[b] ? a : b;
}

type GroupMembers = NonNullable<SCIMGroup["members"]>;

function memberIdsOf(value: unknown): Set<string> {
  const ids = new Set<string>();
  const list = Array.isArray(value) ? value : value ? [value] : [];
  for (const item of list) {
    const id = typeof item === "string" ? item : (item as { value?: unknown } | null)?.value;
    if (typeof id === "string" && id) ids.add(id);
  }
  return ids;
}

/** `members[value eq "u1"]` → "u1" (the filter form of a single-member removal). */
function memberFilterId(path: string): string | null {
  const m = /^members\[\s*value\s+eq\s+"([^"]+)"\s*\]$/i.exec(path.trim());
  return m ? m[1] : null;
}

/**
 * Applies one SCIM PATCH operation to a group (RFC 7644 §3.5.2). A `remove`
 * of members with a value list or a `members[value eq "…"]` filter removes
 * only those members; only a bare `remove members` clears the list.
 */
export function applyGroupPatch(group: SCIMGroup, op: SCIMPatchOperation): void {
  const path = op.path || "";
  const lowerPath = path.toLowerCase();
  const kind = op.op.toLowerCase();

  if (
    (kind === "replace" || kind === "add") &&
    path === "" &&
    op.value &&
    typeof op.value === "object"
  ) {
    // Path-less form: each attribute of the value object.
    for (const [key, value] of Object.entries(op.value as Record<string, unknown>)) {
      applyGroupPatch(group, { op: op.op, path: key, value });
    }
    return;
  }

  switch (kind) {
    case "replace":
    case "add":
      if (lowerPath === "displayname") {
        group.displayName = String(op.value);
      } else if (lowerPath === "members" && Array.isArray(op.value)) {
        const newMembers = op.value as GroupMembers;
        if (kind === "add") {
          group.members = [...(group.members || []), ...newMembers];
        } else {
          group.members = newMembers;
        }
      }
      break;
    case "remove": {
      const filterId = memberFilterId(path);
      if (filterId) {
        group.members = (group.members || []).filter((m) => m.value !== filterId);
      } else if (lowerPath === "members") {
        const ids = memberIdsOf(op.value);
        group.members = ids.size ? (group.members || []).filter((m) => !ids.has(m.value)) : [];
      }
      // displayName is required and cannot be removed.
      break;
    }
  }
}
