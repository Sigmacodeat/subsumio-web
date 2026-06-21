"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseResizableOptions {
  minWidth: number;
  maxWidth: number;
  initialWidth: number;
  storageKey: string;
  side: "left" | "right";
}

export function useResizable({
  minWidth,
  maxWidth,
  initialWidth,
  storageKey,
  side,
}: UseResizableOptions) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          setWidth(parsed);
        }
      }
    } catch {
      // localStorage may be unavailable
    }
  }, [storageKey, minWidth, maxWidth]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      startXRef.current = clientX;
      startWidthRef.current = width;

      const handleMove = (ev: MouseEvent | TouchEvent) => {
        const x = "touches" in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
        const delta = side === "right" ? startXRef.current - x : x - startXRef.current;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
        setWidth(newWidth);
      };

      const handleEnd = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleEnd);
        document.removeEventListener("touchmove", handleMove);
        document.removeEventListener("touchend", handleEnd);
        try {
          setWidth((w) => {
            localStorage.setItem(storageKey, String(w));
            return w;
          });
        } catch {
          // localStorage may be unavailable
        }
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleEnd);
      document.addEventListener("touchmove", handleMove, { passive: false });
      document.addEventListener("touchend", handleEnd);
    },
    [width, side, minWidth, maxWidth, storageKey]
  );

  const resetWidth = useCallback(() => {
    setWidth(initialWidth);
    try {
      localStorage.setItem(storageKey, String(initialWidth));
    } catch {
      // localStorage may be unavailable
    }
  }, [initialWidth, storageKey]);

  return { width, isResizing, handleMouseDown, resetWidth, setWidth };
}
