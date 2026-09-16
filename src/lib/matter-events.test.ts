import { describe, expect, it, vi } from "vitest";
import {
  DEADLINE_CREATED_EVENT,
  deadlineEventConcerns,
  emitDeadlineCreated,
} from "./matter-events";

describe("matter events", () => {
  it("emits a window event carrying the case slug", () => {
    const spy = vi.fn();
    window.addEventListener(DEADLINE_CREATED_EVENT, spy);
    emitDeadlineCreated("legal/cases/a");
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as CustomEvent).detail).toEqual({ caseSlug: "legal/cases/a" });
    window.removeEventListener(DEADLINE_CREATED_EVENT, spy);
  });

  it("matches the right matter, and global events match every matter", () => {
    const forA = new CustomEvent(DEADLINE_CREATED_EVENT, { detail: { caseSlug: "legal/cases/a" } });
    const global = new CustomEvent(DEADLINE_CREATED_EVENT, { detail: {} });
    expect(deadlineEventConcerns(forA, "legal/cases/a")).toBe(true);
    expect(deadlineEventConcerns(forA, "legal/cases/b")).toBe(false);
    expect(deadlineEventConcerns(global, "legal/cases/b")).toBe(true);
  });
});
