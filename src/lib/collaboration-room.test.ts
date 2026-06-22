import { describe, it, expect } from "vitest";
import {
  createCollaborationRoom,
  addParticipant,
  removeParticipant,
  updateParticipantRole,
  addComment,
  resolveComment,
  createExternalShare,
  revokeExternalShare,
  getActiveShares,
  PARTICIPANT_ROLE_LABELS,
  ROOM_STATUS_LABELS,
  type CollaborationRoom,
} from "@/lib/collaboration-room";

function createTestRoom(_overrides: Partial<CollaborationRoom> = {}): CollaborationRoom {
  return createCollaborationRoom({
    title: "Test Room",
    case_slug: "legal/cases/123",
    brain_id: "brain-1",
    org_id: "org-1",
    created_by: "lawyer@test",
    created_by_name: "Test Lawyer",
    created_by_email: "lawyer@test.com",
  });
}

describe("Collaboration Room — Factory", () => {
  it("creates room with owner participant", () => {
    const room = createTestRoom();
    expect(room.id).toBeTruthy();
    expect(room.status).toBe("active");
    expect(room.participants).toHaveLength(1);
    expect(room.participants[0].role).toBe("owner");
    expect(room.audit_entries).toHaveLength(1);
  });
});

describe("Collaboration Room — Participants", () => {
  it("addParticipant adds participant", () => {
    const room = createTestRoom();
    const updated = addParticipant(room, {
      user_id: "user-2",
      name: "Test User",
      email: "user@test.com",
      role: "editor",
      is_external: false,
    });
    expect(updated.participants).toHaveLength(2);
    expect(updated.audit_entries).toHaveLength(2);
  });

  it("removeParticipant removes participant", () => {
    const room = createTestRoom();
    const withParticipant = addParticipant(room, {
      user_id: "user-2",
      name: "Test User",
      email: "user@test.com",
      role: "editor",
      is_external: false,
    });
    const updated = removeParticipant(withParticipant, "user-2", "lawyer@test");
    expect(updated.participants).toHaveLength(1);
  });

  it("updateParticipantRole changes role", () => {
    const room = createTestRoom();
    const updated = updateParticipantRole(
      room,
      room.participants[0].user_id,
      "editor",
      "admin@test"
    );
    expect(updated.participants[0].role).toBe("editor");
  });
});

describe("Collaboration Room — Comments", () => {
  it("addComment adds comment", () => {
    const room = createTestRoom();
    const updated = addComment(room, "lawyer@test", "Test Lawyer", "This is a comment");
    expect(updated.comments).toHaveLength(1);
    expect(updated.comments[0].content).toBe("This is a comment");
    expect(updated.comments[0].resolved).toBe(false);
  });

  it("resolveComment marks as resolved", () => {
    const room = createTestRoom();
    const withComment = addComment(room, "lawyer@test", "Test Lawyer", "Comment");
    const updated = resolveComment(withComment, withComment.comments[0].id, "lawyer@test");
    expect(updated.comments[0].resolved).toBe(true);
    expect(updated.comments[0].resolved_by).toBe("lawyer@test");
  });
});

describe("Collaboration Room — External Sharing", () => {
  it("createExternalShare adds share", () => {
    const room = createTestRoom();
    const updated = createExternalShare(
      room,
      "external@test.com",
      "viewer",
      "lawyer@test",
      new Date(Date.now() + 86400000).toISOString()
    );
    expect(updated.external_shares).toHaveLength(1);
    expect(updated.external_shares[0].status).toBe("active");
  });

  it("revokeExternalShare revokes share", () => {
    const room = createTestRoom();
    const withShare = createExternalShare(
      room,
      "external@test.com",
      "viewer",
      "lawyer@test",
      new Date(Date.now() + 86400000).toISOString()
    );
    const updated = revokeExternalShare(withShare, withShare.external_shares[0].id, "lawyer@test");
    expect(updated.external_shares[0].status).toBe("revoked");
  });

  it("getActiveShares returns only active, non-expired", () => {
    const room = createTestRoom();
    const withShare = createExternalShare(
      room,
      "external@test.com",
      "viewer",
      "lawyer@test",
      new Date(Date.now() + 86400000).toISOString()
    );
    expect(getActiveShares(withShare)).toHaveLength(1);
  });

  it("getActiveShares excludes expired", () => {
    const room = createTestRoom();
    const withShare = createExternalShare(
      room,
      "external@test.com",
      "viewer",
      "lawyer@test",
      new Date(Date.now() - 86400000).toISOString()
    );
    expect(getActiveShares(withShare)).toHaveLength(0);
  });
});

describe("Collaboration Room — Labels", () => {
  it("has role labels", () => {
    expect(PARTICIPANT_ROLE_LABELS["owner"]).toBe("Eigentümer");
    expect(PARTICIPANT_ROLE_LABELS["editor"]).toBe("Editor");
  });

  it("has status labels", () => {
    expect(ROOM_STATUS_LABELS["active"]).toBe("Aktiv");
    expect(ROOM_STATUS_LABELS["archived"]).toBe("Archiviert");
  });
});
