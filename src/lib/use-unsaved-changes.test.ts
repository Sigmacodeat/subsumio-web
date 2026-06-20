// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUnsavedChanges } from "./use-unsaved-changes";

describe("useUnsavedChanges", () => {
  let handler: ((e: BeforeUnloadEvent) => void) | null = null;

  beforeEach(() => {
    handler = null;
    vi.spyOn(window, "addEventListener").mockImplementation((type, listener) => {
      if (type === "beforeunload") {
        handler = listener as (e: BeforeUnloadEvent) => void;
      }
    });
    vi.spyOn(window, "removeEventListener").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("adds beforeunload listener on mount", () => {
    renderHook(() => useUnsavedChanges(false));
    expect(window.addEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  test("removes listener on unmount", () => {
    const { unmount } = renderHook(() => useUnsavedChanges(false));
    unmount();
    expect(window.removeEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  test("does not prevent default when not dirty (boolean)", () => {
    renderHook(() => useUnsavedChanges(false));
    expect(handler).not.toBeNull();
    const event = new Event("beforeunload") as BeforeUnloadEvent;
    const preventDefault = vi.spyOn(event, "preventDefault");
    handler!(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  test("prevents default when dirty (boolean)", () => {
    renderHook(() => useUnsavedChanges(true));
    expect(handler).not.toBeNull();
    const event = new Event("beforeunload") as BeforeUnloadEvent;
    const preventDefault = vi.spyOn(event, "preventDefault");
    handler!(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  test("works with ref object — dirty false", () => {
    const dirtyRef = { current: false };
    renderHook(() => useUnsavedChanges(dirtyRef));
    const event = new Event("beforeunload") as BeforeUnloadEvent;
    const preventDefault = vi.spyOn(event, "preventDefault");
    handler!(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  test("works with ref object — dirty true", () => {
    const dirtyRef = { current: true };
    renderHook(() => useUnsavedChanges(dirtyRef));
    const event = new Event("beforeunload") as BeforeUnloadEvent;
    const preventDefault = vi.spyOn(event, "preventDefault");
    handler!(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  test("updates dirty state on re-render (boolean)", () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedChanges(dirty), {
      initialProps: { dirty: false },
    });
    // Initially not dirty
    const event1 = new Event("beforeunload") as BeforeUnloadEvent;
    const pd1 = vi.spyOn(event1, "preventDefault");
    handler!(event1);
    expect(pd1).not.toHaveBeenCalled();

    // Re-render with dirty=true
    rerender({ dirty: true });
    const event2 = new Event("beforeunload") as BeforeUnloadEvent;
    const pd2 = vi.spyOn(event2, "preventDefault");
    handler!(event2);
    expect(pd2).toHaveBeenCalled();
  });
});
