// @vitest-environment node

import { describe, test, expect, vi } from "vitest";
import {
  addSseConnection,
  removeSseConnection,
  broadcastSseEvent,
  getSseConnectionCount,
} from "./realtime-bus";

describe("realtime-bus", () => {
  test("adds and removes connections", () => {
    const conn = { brainId: "brain-1", send: vi.fn() };
    addSseConnection(conn);
    expect(getSseConnectionCount()).toBe(1);
    removeSseConnection(conn);
    expect(getSseConnectionCount()).toBe(0);
  });

  test("broadcasts only to matching brainId", () => {
    const conn1 = { brainId: "brain-1", send: vi.fn() };
    const conn2 = { brainId: "brain-2", send: vi.fn() };
    addSseConnection(conn1);
    addSseConnection(conn2);

    broadcastSseEvent("brain-1", "update", { foo: "bar" });
    expect(conn1.send).toHaveBeenCalledWith("update", { foo: "bar" });
    expect(conn2.send).not.toHaveBeenCalled();

    removeSseConnection(conn1);
    removeSseConnection(conn2);
  });

  test("does not broadcast after connection removed", () => {
    const conn = { brainId: "brain-1", send: vi.fn() };
    addSseConnection(conn);
    removeSseConnection(conn);
    broadcastSseEvent("brain-1", "update", {});
    expect(conn.send).not.toHaveBeenCalled();
  });
});
