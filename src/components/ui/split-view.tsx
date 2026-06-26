"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SplitViewProps {
  left: React.ReactNode;
  right?: React.ReactNode;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
  storageKey?: string;
  className?: string;
}

export function SplitView({
  left,
  right,
  defaultLeftWidth = 480,
  minLeftWidth = 320,
  minRightWidth = 320,
  storageKey,
  className,
}: SplitViewProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasRight = Boolean(right);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const w = Number(saved);
        if (!Number.isNaN(w) && w >= minLeftWidth) setLeftWidth(w);
      }
    } catch {}
  }, [storageKey, minLeftWidth]);

  const persistWidth = useCallback(
    (w: number) => {
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, String(w));
      } catch {}
    },
    [storageKey]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!hasRight) return;
      e.preventDefault();
      setIsResizing(true);

      const container = containerRef.current;
      if (!container) return;

      const onMouseMove = (ev: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const containerWidth = rect.width;
        const offset = ev.clientX - rect.left;
        const maxLeft = containerWidth - minRightWidth;
        const clamped = Math.max(minLeftWidth, Math.min(maxLeft, offset));
        setLeftWidth(clamped);
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [hasRight, minLeftWidth, minRightWidth]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!hasRight) return;
      const container = containerRef.current;
      if (!container) return;
      const containerWidth = container.getBoundingClientRect().width;
      const maxLeft = containerWidth - minRightWidth;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setLeftWidth((w) => {
          const nw = Math.max(minLeftWidth, w - 24);
          persistWidth(nw);
          return nw;
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setLeftWidth((w) => {
          const nw = Math.min(maxLeft, w + 24);
          persistWidth(nw);
          return nw;
        });
      }
    },
    [hasRight, minLeftWidth, minRightWidth, persistWidth]
  );

  if (!hasRight) {
    return <div className={cn("min-w-0 flex-1", className)}>{left}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex min-h-0 min-w-0 flex-1", isResizing && "select-none", className)}
    >
      <div
        style={{ width: leftWidth, minWidth: minLeftWidth }}
        className="min-h-0 min-w-0 shrink-0"
      >
        {left}
      </div>

      <div
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        tabIndex={0}
        aria-valuenow={leftWidth}
        aria-valuemin={minLeftWidth}
        aria-valuemax={
          containerRef.current
            ? containerRef.current.getBoundingClientRect().width - minRightWidth
            : undefined
        }
        className={cn(
          "relative z-10 w-px shrink-0 cursor-col-resize bg-[color:var(--ds-border)] transition-[width,background-color] duration-150",
          isResizing
            ? "w-0.5 bg-[var(--brand-primary)]"
            : "hover:w-0.5 hover:bg-[var(--brand-primary)]",
          "focus-visible:bg-[var(--brand-primary)] focus-visible:outline-none"
        )}
      >
        <div className="absolute inset-y-0 -left-1.5 w-3" />
      </div>

      <div style={{ minWidth: minRightWidth }} className="min-h-0 min-w-0 flex-1">
        {right}
      </div>
    </div>
  );
}
