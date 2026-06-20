/**
 * Collaboration Room MVP — P1-COLLAB-001
 * ========================================
 * Collaboration Room mit Teilnehmern, Versionen, Kommentaren,
 * externem Sharing und Audit.
 */

export type ParticipantRole = "owner" | "editor" | "commenter" | "viewer";
export type RoomStatus = "active" | "archived" | "locked";
export type ExternalShareStatus = "pending" | "active" | "revoked" | "expired";

export interface RoomParticipant {
  user_id: string;
  name: string;
  email: string;
  role: ParticipantRole;
  joined_at: string;
  last_active_at?: string;
  is_external: boolean;
}

export interface RoomComment {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
  updated_at?: string;
  resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  parent_comment_id?: string;
  target_section?: string;
}

export interface RoomVersion {
  version: string;
  content: string;
  created_by: string;
  created_at: string;
  changelog: string;
  content_hash: string;
}

export interface ExternalShare {
  id: string;
  room_id: string;
  shared_with_email: string;
  shared_with_name?: string;
  role: ParticipantRole;
  status: ExternalShareStatus;
  share_token: string;
  expires_at: string;
  created_by: string;
  created_at: string;
  revoked_by?: string;
  revoked_at?: string;
  last_accessed_at?: string;
}

export interface CollaborationRoom {
  id: string;
  title: string;
  description: string;
  case_slug: string;
  brain_id: string;
  org_id: string;
  status: RoomStatus;
  participants: RoomParticipant[];
  comments: RoomComment[];
  versions: RoomVersion[];
  current_version: string;
  external_shares: ExternalShare[];
  created_by: string;
  created_at: string;
  updated_at: string;
  audit_entries: CollaborationAuditEntry[];
}

export interface CollaborationAuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  details?: string;
}

// ── Factory ───────────────────────────────────────────────────────────

export function createCollaborationRoom(params: {
  title: string;
  description?: string;
  case_slug: string;
  brain_id: string;
  org_id: string;
  created_by: string;
  created_by_name: string;
  created_by_email: string;
}): CollaborationRoom {
  const now = new Date().toISOString();
  return {
    id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: params.title,
    description: params.description ?? "",
    case_slug: params.case_slug,
    brain_id: params.brain_id,
    org_id: params.org_id,
    status: "active",
    participants: [
      {
        user_id: params.created_by,
        name: params.created_by_name,
        email: params.created_by_email,
        role: "owner",
        joined_at: now,
        is_external: false,
      },
    ],
    comments: [],
    versions: [],
    current_version: "1.0.0",
    external_shares: [],
    created_by: params.created_by,
    created_at: now,
    updated_at: now,
    audit_entries: [
      { timestamp: now, actor: params.created_by, action: "created" },
    ],
  };
}

// ── Participant Management ────────────────────────────────────────────

export function addParticipant(
  room: CollaborationRoom,
  participant: Omit<RoomParticipant, "joined_at">,
): CollaborationRoom {
  const now = new Date().toISOString();
  return {
    ...room,
    participants: [...room.participants, { ...participant, joined_at: now }],
    updated_at: now,
    audit_entries: [
      ...room.audit_entries,
      { timestamp: now, actor: participant.user_id, action: "participant_added", details: participant.email },
    ],
  };
}

export function removeParticipant(room: CollaborationRoom, userId: string, actor: string): CollaborationRoom {
  const now = new Date().toISOString();
  return {
    ...room,
    participants: room.participants.filter((p) => p.user_id !== userId),
    updated_at: now,
    audit_entries: [
      ...room.audit_entries,
      { timestamp: now, actor, action: "participant_removed", details: userId },
    ],
  };
}

export function updateParticipantRole(
  room: CollaborationRoom,
  userId: string,
  newRole: ParticipantRole,
  actor: string,
): CollaborationRoom {
  const now = new Date().toISOString();
  return {
    ...room,
    participants: room.participants.map((p) =>
      p.user_id === userId ? { ...p, role: newRole } : p,
    ),
    updated_at: now,
    audit_entries: [
      ...room.audit_entries,
      { timestamp: now, actor, action: "role_updated", details: `${userId} → ${newRole}` },
    ],
  };
}

// ── Comments ──────────────────────────────────────────────────────────

export function addComment(
  room: CollaborationRoom,
  authorId: string,
  authorName: string,
  content: string,
  targetSection?: string,
  parentCommentId?: string,
): CollaborationRoom {
  const now = new Date().toISOString();
  const comment: RoomComment = {
    id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author_id: authorId,
    author_name: authorName,
    content,
    created_at: now,
    resolved: false,
    parent_comment_id: parentCommentId,
    target_section: targetSection,
  };
  return {
    ...room,
    comments: [...room.comments, comment],
    updated_at: now,
    audit_entries: [
      ...room.audit_entries,
      { timestamp: now, actor: authorId, action: "comment_added", details: comment.id },
    ],
  };
}

export function resolveComment(room: CollaborationRoom, commentId: string, actor: string): CollaborationRoom {
  const now = new Date().toISOString();
  return {
    ...room,
    comments: room.comments.map((c) =>
      c.id === commentId
        ? { ...c, resolved: true, resolved_by: actor, resolved_at: now }
        : c,
    ),
    updated_at: now,
  };
}

// ── External Sharing ──────────────────────────────────────────────────

export function createExternalShare(
  room: CollaborationRoom,
  email: string,
  role: ParticipantRole,
  actor: string,
  expiresAt: string,
  name?: string,
): CollaborationRoom {
  const now = new Date().toISOString();
  const share: ExternalShare = {
    id: `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    room_id: room.id,
    shared_with_email: email,
    shared_with_name: name,
    role,
    status: "active",
    share_token: Math.random().toString(36).slice(2, 20),
    expires_at: expiresAt,
    created_by: actor,
    created_at: now,
  };
  return {
    ...room,
    external_shares: [...room.external_shares, share],
    updated_at: now,
    audit_entries: [
      ...room.audit_entries,
      { timestamp: now, actor, action: "external_share_created", details: email },
    ],
  };
}

export function revokeExternalShare(room: CollaborationRoom, shareId: string, actor: string): CollaborationRoom {
  const now = new Date().toISOString();
  return {
    ...room,
    external_shares: room.external_shares.map((s) =>
      s.id === shareId
        ? { ...s, status: "revoked", revoked_by: actor, revoked_at: now }
        : s,
    ),
    updated_at: now,
    audit_entries: [
      ...room.audit_entries,
      { timestamp: now, actor, action: "external_share_revoked", details: shareId },
    ],
  };
}

export function getActiveShares(room: CollaborationRoom): ExternalShare[] {
  const now = new Date().toISOString();
  return room.external_shares.filter(
    (s) => s.status === "active" && s.expires_at > now,
  );
}

// ── Labels ────────────────────────────────────────────────────────────

export const PARTICIPANT_ROLE_LABELS: Record<ParticipantRole, string> = {
  owner: "Eigentümer",
  editor: "Editor",
  commenter: "Kommentator",
  viewer: "Betrachter",
};

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  active: "Aktiv",
  archived: "Archiviert",
  locked: "Gesperrt",
};
