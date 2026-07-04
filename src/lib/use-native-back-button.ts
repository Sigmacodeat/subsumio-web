"use client";

/**
 * useNativeBackButton — handles Android hardware back button and browser
 * back navigation in Capacitor native app. Closes open overlays (mobile sidebar,
 * copilot drawer, command palette, more-sheet) before navigating back.
 *
 * In browser/PWA mode, listens to popstate and closes overlays first.
 * In native mode, uses Capacitor App plugin if available.
 */

import { useEffect, useRef } from "react";

interface OverlayState {
  isMobileOpen: boolean;
  isCopilotOpen: boolean;
  isCmdOpen: boolean;
  isGuideOpen: boolean;
  isShortcutsOpen: boolean;
  closeAll: () => void;
}

export function useNativeBackButton(state: OverlayState) {
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Try Capacitor App plugin (native only)
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;

        const handler = (data: { canGoBack: boolean }) => {
          const s = stateRef.current;
          if (
            s.isMobileOpen ||
            s.isCopilotOpen ||
            s.isCmdOpen ||
            s.isGuideOpen ||
            s.isShortcutsOpen
          ) {
            s.closeAll();
          } else if (data.canGoBack) {
            window.history.back();
          } else {
            App.exitApp();
          }
        };

        App.addListener("backButton", handler);
        return () => {
          App.removeAllListeners();
        };
      } catch {
        // Not native — use popstate for PWA
      }

      // PWA fallback: intercept popstate to close overlays first
      let hasPushedState = false;

      const pushState = () => {
        window.history.pushState({ subsumioOverlay: true }, "");
        hasPushedState = true;
      };

      const removeState = () => {
        if (hasPushedState) {
          hasPushedState = false;
          window.history.back();
        }
      };

      const onPopState = () => {
        const s = stateRef.current;
        if (
          s.isMobileOpen ||
          s.isCopilotOpen ||
          s.isCmdOpen ||
          s.isGuideOpen ||
          s.isShortcutsOpen
        ) {
          s.closeAll();
          // Re-push so next back also gets intercepted
          pushState();
        }
      };

      // Push initial state so we can intercept the first back
      pushState();
      window.addEventListener("popstate", onPopState);

      return () => {
        cancelled = true;
        window.removeEventListener("popstate", onPopState);
        removeState();
      };
    })();
  }, []);
}
