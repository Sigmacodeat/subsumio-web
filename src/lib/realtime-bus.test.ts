// @vitest-environment node

import { describe, test, expect, vi } from "vitest";
import {
  addSseConnection,
  removeSseConnection,
  broadcastSseEvent,
  getSseConnectionCount,
  broadcastSseEventToUser,
  pageRefsOf,
} from "./realtime-bus";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("realtime-bus", () => {
  test("adds and removes connections", () => {
    const conn = { brainId: "brain-1", role: "lawyer", send: vi.fn() };
    addSseConnection(conn);
    expect(getSseConnectionCount()).toBe(1);
    removeSseConnection(conn);
    expect(getSseConnectionCount()).toBe(0);
  });

  test("broadcasts only to matching brainId", () => {
    const conn1 = { brainId: "brain-1", role: "lawyer", send: vi.fn() };
    const conn2 = { brainId: "brain-2", role: "lawyer", send: vi.fn() };
    addSseConnection(conn1);
    addSseConnection(conn2);

    broadcastSseEvent("brain-1", "update", { foo: "bar" });
    expect(conn1.send).toHaveBeenCalledWith("update", { foo: "bar" });
    expect(conn2.send).not.toHaveBeenCalled();

    removeSseConnection(conn1);
    removeSseConnection(conn2);
  });

  test("does not broadcast after connection removed", () => {
    const conn = { brainId: "brain-1", role: "lawyer", send: vi.fn() };
    addSseConnection(conn);
    removeSseConnection(conn);
    broadcastSseEvent("brain-1", "update", {});
    expect(conn.send).not.toHaveBeenCalled();
  });

  test("client accounts and unknown roles receive no firm events", () => {
    const client = { brainId: "brain-1", role: "client_viewer", send: vi.fn() };
    const unknown = { brainId: "brain-1", role: undefined, send: vi.fn() };
    addSseConnection(client);
    addSseConnection(unknown);
    broadcastSseEvent("brain-1", "time.entry.updated", { entry_id: "e1" });
    broadcastSseEvent("brain-1", "cti.incoming_call", { caller: "+43 1 000", caseSlug: "cases/x" });
    expect(client.send).not.toHaveBeenCalled();
    expect(unknown.send).not.toHaveBeenCalled();
    removeSseConnection(client);
    removeSseConnection(unknown);
  });

  test("matter events reach only streams that may see the matter", async () => {
    const allowed = {
      brainId: "brain-1",
      role: "lawyer",
      canSeePage: vi.fn(async () => true),
      send: vi.fn(),
    };
    const walled = {
      brainId: "brain-1",
      role: "lawyer",
      canSeePage: vi.fn(async (slug: string) => slug !== "cases/x"),
      send: vi.fn(),
    };
    const noChecker = { brainId: "brain-1", role: "admin", send: vi.fn() };
    addSseConnection(allowed);
    addSseConnection(walled);
    addSseConnection(noChecker);
    const call = {
      caller: "+43 1 000",
      contactSlug: "contacts/a",
      caseSlug: "cases/x",
      allCaseSlugs: [{ slug: "cases/x", title: "X" }],
    };
    broadcastSseEvent("brain-1", "cti.incoming_call", call);
    await flush();
    expect(allowed.send).toHaveBeenCalledWith("cti.incoming_call", call);
    expect(walled.send).not.toHaveBeenCalled();
    expect(noChecker.send).not.toHaveBeenCalled();
    removeSseConnection(allowed);
    removeSseConnection(walled);
    removeSseConnection(noChecker);
  });

  test("a failing access check does not deliver", async () => {
    const conn = {
      brainId: "brain-1",
      role: "lawyer",
      canSeePage: vi.fn(async () => {
        throw new Error("engine down");
      }),
      send: vi.fn(),
    };
    addSseConnection(conn);
    broadcastSseEvent("brain-1", "comment.added", { caseSlug: "cases/x", commentId: "c1" });
    broadcastSseEventToUser("brain-1", "u1", "automation.fired", { case_slug: "cases/x" });
    await flush();
    expect(conn.send).not.toHaveBeenCalled();
    removeSseConnection(conn);
  });

  test("finds page references in nested payloads and presence paths", () => {
    expect(
      pageRefsOf({
        event: "started",
        data: { slug: "workflows/w1", frontmatter: { case_slug: "cases/y" } },
      }).sort()
    ).toEqual(["cases/y", "workflows/w1"]);
    expect(pageRefsOf({ userId: "u", page: "/dashboard/cases/cases%2Fz?tab=docs" })).toEqual([
      "cases/z",
    ]);
    expect(pageRefsOf({ entry_id: "e1" })).toEqual([]);
  });
});
