import { describe, expect, it } from "vitest";
import { mergeSessionLists } from "./chat-session-merge";
import type { ChatSession } from "./chat-types";
import type { ServerChatSession } from "@/lib/chat-server-sync";

const local = (id: string, extra: Partial<ChatSession> = {}): ChatSession => ({
  id,
  title: id,
  contextType: "case",
  caseSlug: "legal/cases/a",
  createdAt: "2026-09-18T10:00:00Z",
  updatedAt: "2026-09-18T10:00:00Z",
  messageCount: 2,
  ...extra,
});

const server = (id: string, extra: Partial<ServerChatSession> = {}): ServerChatSession => ({
  id,
  owner_id: "u1",
  owner_name: "Dr. Muster",
  title: id,
  case_slug: "legal/cases/a",
  message_count: 4,
  shared: false,
  updated_at: "2026-09-19T10:00:00Z",
  ...extra,
});

describe("mergeSessionLists", () => {
  it("adds conversations that only exist on the server, newest first", () => {
    const merged = mergeSessionLists([local("here")], [server("other-device")], {
      caseSlug: "legal/cases/a",
      contextType: "case",
    });
    expect(merged.map((s) => s.id)).toEqual(["other-device", "here"]);
    expect(merged[0].remote).toEqual({ ownerId: "u1", ownerName: "Dr. Muster", shared: false });
    expect(merged[1].remote).toBeUndefined();
  });

  it("never duplicates a conversation this browser already has", () => {
    const merged = mergeSessionLists([local("s1")], [server("s1")], {
      caseSlug: "legal/cases/a",
      contextType: "case",
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].remote).toBeUndefined();
  });

  it("keeps matters apart", () => {
    const other = server("other-matter", { case_slug: "legal/cases/b" });
    expect(
      mergeSessionLists([], [other], { caseSlug: "legal/cases/a", contextType: "case" })
    ).toEqual([]);
    // Without a matter selected, only matter-less conversations show.
    expect(
      mergeSessionLists([], [other, server("global", { case_slug: undefined })], {
        contextType: "global",
      }).map((s) => s.id)
    ).toEqual(["global"]);
  });

  it("names the colleague on a shared conversation", () => {
    const merged = mergeSessionLists([], [server("s", { shared: true, owner_id: "u2" })], {
      caseSlug: "legal/cases/a",
      contextType: "case",
    });
    expect(merged[0].title).toBe("s · Dr. Muster");
    expect(merged[0].remote?.shared).toBe(true);
  });
});
