"use client";

import { useEffect, useRef } from "react";

/**
 * Warns the user when navigating away or closing the tab with unsaved form changes.
 *
 * Usage:
 *   const isDirty = useState(false);
 *   useUnsavedChanges(isDirty);
 *
 * Or with a ref:
 *   const dirtyRef = useRef(false);
 *   useUnsavedChanges(dirtyRef);
 *
 * The hook adds a `beforeunload` event listener that triggers the browser's
 * native "Are you sure you want to leave?" dialog when the form is dirty.
 */
export function useUnsavedChanges(isDirty: boolean | React.MutableRefObject<boolean>): void {
  const dirtyRef = useRef(false);

  // Sync the ref to the current value on every render
  if (typeof isDirty === "boolean") {
    dirtyRef.current = isDirty;
  } else {
    // It's a ref — read its current value in the effect
  }

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const dirty = typeof isDirty === "boolean" ? dirtyRef.current : isDirty.current;
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
