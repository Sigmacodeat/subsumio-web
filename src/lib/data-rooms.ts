/**
 * Data rooms: a firm shares selected documents of one matter with people at
 * other firms (correspondent counsel, co-counsel, opposing counsel).
 *
 * The documents stay in the host firm's brain. A room lists which of them are
 * shared; a guest never gets engine access — every read goes through
 * /api/data-rooms/[id]/…, which checks the membership and serves only listed
 * documents, reading them with the host's brain headers. Membership is bound
 * to the invited e-mail address: an invitation is accepted by a signed-in
 * account with exactly that address, and it can expire or be revoked.
 *
 * Rooms, shared documents and members live in the web app's Postgres
 * (subsumio_data_room*), not in either brain, so neither firm's engine data
 * model changes. Without Postgres (local development, tests) an in-memory
 * store stands in.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";

export interface DataRoom {
  id: string;
  hostTenantId: string;
  hostBrainId: string;
  hostFirmName: string;
  caseSlug: string;
  title: string;
  createdBy: string;
  createdAt: string;
}

export interface DataRoomDocument {
  roomId: string;
  docSlug: string;
  title: string;
  addedBy: string;
  addedAt: string;
}

export type MemberStatus = "invited" | "active" | "revoked";

export interface DataRoomMember {
  id: string;
  roomId: string;
  email: string;
  status: MemberStatus;
  expiresAt?: string;
  invitedBy: string;
  invitedAt: string;
  guestTenantId?: string;
  guestUserId?: string;
  guestFirmName?: string;
  acceptedAt?: string;
}

export interface DataRoomStore {
  createRoom(room: Omit<DataRoom, "id" | "createdAt">): Promise<DataRoom>;
  getRoom(id: string): Promise<DataRoom | null>;
  roomForCase(hostTenantId: string, caseSlug: string): Promise<DataRoom | null>;
  roomsHostedBy(hostTenantId: string): Promise<DataRoom[]>;
  setDocuments(
    roomId: string,
    docs: Array<Pick<DataRoomDocument, "docSlug" | "title">>,
    by: string
  ): Promise<void>;
  documents(roomId: string): Promise<DataRoomDocument[]>;
  invite(input: {
    roomId: string;
    email: string;
    expiresAt?: string;
    invitedBy: string;
  }): Promise<{ member: DataRoomMember; token: string }>;
  members(roomId: string): Promise<DataRoomMember[]>;
  memberByToken(token: string): Promise<DataRoomMember | null>;
  activate(
    memberId: string,
    guest: { tenantId: string; userId: string; firmName: string }
  ): Promise<void>;
  revoke(memberId: string): Promise<void>;
  membershipsOf(guestTenantId: string): Promise<Array<{ room: DataRoom; member: DataRoomMember }>>;
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A member may read the room right now. */
export function memberActive(member: DataRoomMember, now: number = Date.now()): boolean {
  if (member.status !== "active") return false;
  if (!member.expiresAt) return true;
  const until = Date.parse(member.expiresAt);
  return Number.isFinite(until) && until > now;
}

/** An invitation can still be accepted. */
export function invitationOpen(member: DataRoomMember, now: number = Date.now()): boolean {
  if (member.status !== "invited") return false;
  if (!member.expiresAt) return true;
  const until = Date.parse(member.expiresAt);
  return Number.isFinite(until) && until > now;
}

// ── In-memory store (development without Postgres, tests) ─────────────

export class MemoryDataRoomStore implements DataRoomStore {
  rooms = new Map<string, DataRoom>();
  docs = new Map<string, DataRoomDocument[]>();
  memberList: Array<DataRoomMember & { tokenHash: string }> = [];

  async createRoom(room: Omit<DataRoom, "id" | "createdAt">): Promise<DataRoom> {
    const full = { ...room, id: randomUUID(), createdAt: new Date().toISOString() };
    this.rooms.set(full.id, full);
    return full;
  }
  async getRoom(id: string) {
    return this.rooms.get(id) ?? null;
  }
  async roomForCase(hostTenantId: string, caseSlug: string) {
    return (
      [...this.rooms.values()].find(
        (r) => r.hostTenantId === hostTenantId && r.caseSlug === caseSlug
      ) ?? null
    );
  }
  async roomsHostedBy(hostTenantId: string) {
    return [...this.rooms.values()].filter((r) => r.hostTenantId === hostTenantId);
  }
  async setDocuments(
    roomId: string,
    docs: Array<Pick<DataRoomDocument, "docSlug" | "title">>,
    by: string
  ) {
    const existing = new Map((this.docs.get(roomId) ?? []).map((d) => [d.docSlug, d]));
    const now = new Date().toISOString();
    this.docs.set(
      roomId,
      docs.map(
        (d) =>
          existing.get(d.docSlug) ?? {
            roomId,
            docSlug: d.docSlug,
            title: d.title,
            addedBy: by,
            addedAt: now,
          }
      )
    );
  }
  async documents(roomId: string) {
    return this.docs.get(roomId) ?? [];
  }
  async invite(input: { roomId: string; email: string; expiresAt?: string; invitedBy: string }) {
    const token = randomBytes(32).toString("base64url");
    const member = {
      id: randomUUID(),
      roomId: input.roomId,
      email: normalizeEmail(input.email),
      status: "invited" as const,
      expiresAt: input.expiresAt,
      invitedBy: input.invitedBy,
      invitedAt: new Date().toISOString(),
      tokenHash: hashInviteToken(token),
    };
    this.memberList.push(member);
    const { tokenHash: _t, ...pub } = member;
    return { member: pub, token };
  }
  async members(roomId: string) {
    return this.memberList.filter((m) => m.roomId === roomId).map(({ tokenHash: _t, ...m }) => m);
  }
  async memberByToken(token: string) {
    const hash = hashInviteToken(token);
    const found = this.memberList.find((m) => m.tokenHash === hash);
    if (!found) return null;
    const { tokenHash: _t, ...m } = found;
    return m;
  }
  async activate(memberId: string, guest: { tenantId: string; userId: string; firmName: string }) {
    const m = this.memberList.find((x) => x.id === memberId);
    if (!m) return;
    Object.assign(m, {
      status: "active",
      guestTenantId: guest.tenantId,
      guestUserId: guest.userId,
      guestFirmName: guest.firmName,
      acceptedAt: new Date().toISOString(),
      tokenHash: `used:${m.id}`,
    });
  }
  async revoke(memberId: string) {
    const m = this.memberList.find((x) => x.id === memberId);
    if (m) m.status = "revoked";
  }
  async membershipsOf(guestTenantId: string) {
    return this.memberList
      .filter((m) => m.guestTenantId === guestTenantId)
      .map(({ tokenHash: _t, ...member }) => ({ room: this.rooms.get(member.roomId)!, member }))
      .filter((x) => x.room);
  }
}

// ── Postgres store ────────────────────────────────────────────────────

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_data_rooms (
     id text PRIMARY KEY,
     host_tenant_id text NOT NULL,
     host_brain_id text NOT NULL,
     host_firm_name text NOT NULL,
     case_slug text NOT NULL,
     title text NOT NULL,
     created_by text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (host_tenant_id, case_slug)
   )`,
  `CREATE TABLE IF NOT EXISTS subsumio_data_room_documents (
     room_id text NOT NULL REFERENCES subsumio_data_rooms(id) ON DELETE CASCADE,
     doc_slug text NOT NULL,
     title text NOT NULL,
     added_by text NOT NULL,
     added_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (room_id, doc_slug)
   )`,
  `CREATE TABLE IF NOT EXISTS subsumio_data_room_members (
     id text PRIMARY KEY,
     room_id text NOT NULL REFERENCES subsumio_data_rooms(id) ON DELETE CASCADE,
     email text NOT NULL,
     status text NOT NULL CHECK (status IN ('invited', 'active', 'revoked')),
     token_hash text UNIQUE,
     expires_at timestamptz,
     invited_by text NOT NULL,
     invited_at timestamptz NOT NULL DEFAULT now(),
     guest_tenant_id text,
     guest_user_id text,
     guest_firm_name text,
     accepted_at timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS subsumio_data_room_members_guest ON subsumio_data_room_members (guest_tenant_id)`,
]);

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : undefined);

function roomFrom(r: Row): DataRoom {
  return {
    id: String(r.id),
    hostTenantId: String(r.host_tenant_id),
    hostBrainId: String(r.host_brain_id),
    hostFirmName: String(r.host_firm_name),
    caseSlug: String(r.case_slug),
    title: String(r.title),
    createdBy: String(r.created_by),
    createdAt: iso(r.created_at) ?? "",
  };
}

function memberFrom(r: Row): DataRoomMember {
  return {
    id: String(r.id),
    roomId: String(r.room_id),
    email: String(r.email),
    status: String(r.status) as MemberStatus,
    expiresAt: iso(r.expires_at),
    invitedBy: String(r.invited_by),
    invitedAt: iso(r.invited_at) ?? "",
    guestTenantId: r.guest_tenant_id ? String(r.guest_tenant_id) : undefined,
    guestUserId: r.guest_user_id ? String(r.guest_user_id) : undefined,
    guestFirmName: r.guest_firm_name ? String(r.guest_firm_name) : undefined,
    acceptedAt: iso(r.accepted_at),
  };
}

const MEMBER_COLUMNS =
  "id, room_id, email, status, expires_at, invited_by, invited_at, guest_tenant_id, guest_user_id, guest_firm_name, accepted_at";

class PostgresDataRoomStore implements DataRoomStore {
  private async q(sql: string, params: unknown[] = []): Promise<Row[]> {
    await ensureSchema();
    const { rows } = await getSharedPgPool()!.query(sql, params);
    return rows as Row[];
  }
  async createRoom(room: Omit<DataRoom, "id" | "createdAt">) {
    const rows = await this.q(
      `INSERT INTO subsumio_data_rooms (id, host_tenant_id, host_brain_id, host_firm_name, case_slug, title, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        randomUUID(),
        room.hostTenantId,
        room.hostBrainId,
        room.hostFirmName,
        room.caseSlug,
        room.title,
        room.createdBy,
      ]
    );
    return roomFrom(rows[0]!);
  }
  async getRoom(id: string) {
    const rows = await this.q("SELECT * FROM subsumio_data_rooms WHERE id = $1", [id]);
    return rows[0] ? roomFrom(rows[0]) : null;
  }
  async roomForCase(hostTenantId: string, caseSlug: string) {
    const rows = await this.q(
      "SELECT * FROM subsumio_data_rooms WHERE host_tenant_id = $1 AND case_slug = $2",
      [hostTenantId, caseSlug]
    );
    return rows[0] ? roomFrom(rows[0]) : null;
  }
  async roomsHostedBy(hostTenantId: string) {
    const rows = await this.q(
      "SELECT * FROM subsumio_data_rooms WHERE host_tenant_id = $1 ORDER BY created_at DESC",
      [hostTenantId]
    );
    return rows.map(roomFrom);
  }
  async setDocuments(
    roomId: string,
    docs: Array<Pick<DataRoomDocument, "docSlug" | "title">>,
    by: string
  ) {
    const slugs = docs.map((d) => d.docSlug);
    await this.q(
      "DELETE FROM subsumio_data_room_documents WHERE room_id = $1 AND NOT (doc_slug = ANY($2::text[]))",
      [roomId, slugs]
    );
    for (const d of docs) {
      await this.q(
        `INSERT INTO subsumio_data_room_documents (room_id, doc_slug, title, added_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT (room_id, doc_slug) DO NOTHING`,
        [roomId, d.docSlug, d.title, by]
      );
    }
  }
  async documents(roomId: string) {
    const rows = await this.q(
      "SELECT * FROM subsumio_data_room_documents WHERE room_id = $1 ORDER BY added_at",
      [roomId]
    );
    return rows.map((r) => ({
      roomId: String(r.room_id),
      docSlug: String(r.doc_slug),
      title: String(r.title),
      addedBy: String(r.added_by),
      addedAt: iso(r.added_at) ?? "",
    }));
  }
  async invite(input: { roomId: string; email: string; expiresAt?: string; invitedBy: string }) {
    const token = randomBytes(32).toString("base64url");
    const rows = await this.q(
      `INSERT INTO subsumio_data_room_members (id, room_id, email, status, token_hash, expires_at, invited_by)
       VALUES ($1, $2, $3, 'invited', $4, $5, $6) RETURNING ${MEMBER_COLUMNS}`,
      [
        randomUUID(),
        input.roomId,
        normalizeEmail(input.email),
        hashInviteToken(token),
        input.expiresAt ?? null,
        input.invitedBy,
      ]
    );
    return { member: memberFrom(rows[0]!), token };
  }
  async members(roomId: string) {
    const rows = await this.q(
      `SELECT ${MEMBER_COLUMNS} FROM subsumio_data_room_members WHERE room_id = $1 ORDER BY invited_at`,
      [roomId]
    );
    return rows.map(memberFrom);
  }
  async memberByToken(token: string) {
    const rows = await this.q(
      `SELECT ${MEMBER_COLUMNS} FROM subsumio_data_room_members WHERE token_hash = $1`,
      [hashInviteToken(token)]
    );
    return rows[0] ? memberFrom(rows[0]) : null;
  }
  async activate(memberId: string, guest: { tenantId: string; userId: string; firmName: string }) {
    await this.q(
      `UPDATE subsumio_data_room_members
          SET status = 'active', token_hash = NULL, guest_tenant_id = $2, guest_user_id = $3,
              guest_firm_name = $4, accepted_at = now()
        WHERE id = $1 AND status = 'invited'`,
      [memberId, guest.tenantId, guest.userId, guest.firmName]
    );
  }
  async revoke(memberId: string) {
    await this.q(
      "UPDATE subsumio_data_room_members SET status = 'revoked', token_hash = NULL WHERE id = $1",
      [memberId]
    );
  }
  async membershipsOf(guestTenantId: string) {
    const rows = await this.q(
      `SELECT r.*, ${MEMBER_COLUMNS.split(", ")
        .map((c) => `m.${c} AS m_${c}`)
        .join(", ")}
         FROM subsumio_data_room_members m JOIN subsumio_data_rooms r ON r.id = m.room_id
        WHERE m.guest_tenant_id = $1 ORDER BY m.accepted_at DESC`,
      [guestTenantId]
    );
    return rows.map((row) => {
      const m: Row = {};
      for (const [k, v] of Object.entries(row)) if (k.startsWith("m_")) m[k.slice(2)] = v;
      return { room: roomFrom(row), member: memberFrom(m) };
    });
  }
}

let store: DataRoomStore | null = null;

export function getDataRoomStore(): DataRoomStore {
  store ??= getSharedPgPool() ? new PostgresDataRoomStore() : new MemoryDataRoomStore();
  return store;
}

/** Test-only: replace the store. */
export function setDataRoomStoreForTests(next: DataRoomStore | null): void {
  store = next;
}
