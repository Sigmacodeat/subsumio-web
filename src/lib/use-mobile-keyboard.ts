"use client";

/**
 * useMobileKeyboard — detects mobile keyboard visibility via the
 * VisualViewport API and adjusts the layout to prevent input occlusion.
 *
 * On mobile browsers, when the soft keyboard opens, `window.innerHeight`
 * doesn't shrink but `visualViewport.height` does. This hook exposes the
 * keyboard height and a boolean so components can add bottom padding
 * or scroll focused inputs into view.
 *
 * Also dispatches a custom event `subsumio:keyboard` for components
 * that need to react without using the hook directly.
 */

import { useEffect, useRef, useState } from "react";

export function useMobileKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const isKeyboardOpenRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    let baselineHeight = vv.height;

    const update = () => {
      const heightDiff = baselineHeight - vv.height;
      const keyboardOpen = heightDiff > 50; // threshold to avoid false positives
      setKeyboardHeight(keyboardOpen ? heightDiff : 0);
      setIsKeyboardOpen(keyboardOpen);
      isKeyboardOpenRef.current = keyboardOpen;

      // Dispatch custom event for non-hook consumers
      window.dispatchEvent(
        new CustomEvent("subsumio:keyboard", {
          detail: { open: keyboardOpen, height: keyboardOpen ? heightDiff : 0 },
        })
      );
    };

    const onResize = () => {
      // Reset baseline when viewport changes (rotation, etc.)
      if (!isKeyboardOpenRef.current) {
        baselineHeight = vv.height;
      }
      update();
    };

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", update);

    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return { isKeyboardOpen, keyboardHeight };
}

/**
 * useKeyboardAwareScroll — scrolls the focused input into view when
 * the keyboard opens, preventing the input from being hidden behind
 * the keyboard. Use on scrollable containers.
 */
export function useKeyboardAwareScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName !== "INPUT" &&
        target.tagName !== "TEXTAREA" &&
        target.tagName !== "SELECT"
      )
        return;
      // Wait for keyboard to potentially open
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);
}
