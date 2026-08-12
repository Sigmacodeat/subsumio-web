"use client";

import * as React from "react";
import { Eraser, PenLine, Keyboard } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface SignaturePadChange {
  /** SVG path strings (M/L commands). Empty when typed-name mode. */
  paths: string[];
  /** PNG data URL of the canvas drawing, or the typed name in type mode. */
  dataUrl: string;
  /** Which input method produced the signature. */
  mode: "draw" | "type";
  /** True when the signature is empty / not yet provided. */
  empty: boolean;
}

interface SignaturePadProps {
  /** Called whenever the signature changes (drawn or typed). */
  onChange?: (change: SignaturePadChange) => void;
  /** Initial mode — defaults to "draw". */
  defaultMode?: "draw" | "type";
  /** Placeholder for the typed-name input. */
  typedNamePlaceholder?: string;
  /** ARIA label for the canvas element. */
  canvasAriaLabel?: string;
  /** Instructions shown below the canvas (screen-reader accessible). */
  instructions?: string;
  /** Additional class names on the outer container. */
  className?: string;
  /** Disable input. */
  disabled?: boolean;
}

const MAX_POINTS = 2000;

function buildSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }
  return d;
}

export const SignaturePad = React.forwardRef<
  HTMLDivElement,
  SignaturePadProps
>(function SignaturePad(
  {
    onChange,
    defaultMode = "draw",
    typedNamePlaceholder = "Vor- und Nachname",
    canvasAriaLabel = "Signatur-Zeichenfläche",
    instructions = "Zeichnen Sie mit Finger, Maus oder Stift im Feld unten. Alternativ können Sie Ihren Namen tippen.",
    className,
    disabled = false,
  },
  ref
) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = React.useState<"draw" | "type">(defaultMode);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [paths, setPaths] = React.useState<string[]>([]);
  const [currentPoints, setCurrentPoints] = React.useState<
    Array<{ x: number; y: number }>
  >([]);
  const [typedName, setTypedName] = React.useState("");
  const [isEmpty, setIsEmpty] = React.useState(true);
  const [statusMessage, setStatusMessage] = React.useState(
    "Signatur ist leer"
  );

  // ── Canvas helpers (defined first so setupCanvas can depend on them) ──
  const drawPath = React.useCallback((ctx: CanvasRenderingContext2D, d: string) => {
    if (!d) return;
    const cmds = d.split(" ");
    ctx.beginPath();
    let i = 0;
    while (i < cmds.length) {
      const cmd = cmds[i];
      if (cmd === "M") {
        ctx.moveTo(parseFloat(cmds[i + 1]), parseFloat(cmds[i + 2]));
        i += 3;
      } else if (cmd === "L") {
        ctx.lineTo(parseFloat(cmds[i + 1]), parseFloat(cmds[i + 2]));
        i += 3;
      } else {
        i++;
      }
    }
    ctx.stroke();
  }, []);

  const redrawAll = React.useCallback(
    (
      ctx: CanvasRenderingContext2D,
      allPaths: string[],
      rect: DOMRect
    ) => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const pathD of allPaths) {
        drawPath(ctx, pathD);
      }
    },
    [drawPath]
  );

  // ── Canvas setup: handle DPR + resize ──
  const setupCanvas = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ds-text")
        .trim() || "#1a1a1a";
    redrawAll(ctx, paths, rect);
  }, [paths, redrawAll]);

  React.useEffect(() => {
    if (mode === "draw") setupCanvas();
  }, [mode, setupCanvas]);

  React.useEffect(() => {
    const handleResize = () => {
      if (mode === "draw") setupCanvas();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mode, setupCanvas]);

  // ── Pointer drawing ──
  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    const pos = getPointerPos(e);
    setCurrentPoints([pos]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    setCurrentPoints((prev) => {
      if (prev.length >= MAX_POINTS) return prev;
      const next = [...prev, pos];
      // Draw incremental segment
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx && prev.length > 0) {
          const last = prev[prev.length - 1];
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }
      }
      return next;
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current?.releasePointerCapture(e.pointerId);
    setIsDrawing(false);
    if (currentPoints.length > 0) {
      const path = buildSvgPath(currentPoints);
      setPaths((prev) => [...prev, path]);
      setCurrentPoints([]);
    }
  };

  const handleClear = () => {
    if (disabled) return;
    setPaths([]);
    setCurrentPoints([]);
    setTypedName("");
    setIsEmpty(true);
    setStatusMessage("Signatur ist leer");
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    onChange?.({ paths: [], dataUrl: "", mode, empty: true });
  };

  // ── Emit changes ──
  React.useEffect(() => {
    if (mode === "draw") {
      const empty = paths.length === 0 && currentPoints.length === 0;
      setIsEmpty(empty);
      setStatusMessage(empty ? "Signatur ist leer" : "Signatur erfasst");
      if (!empty) {
        const canvas = canvasRef.current;
        const dataUrl = canvas?.toDataURL("image/png") ?? "";
        onChange?.({ paths, dataUrl, mode: "draw", empty: false });
      }
    } else {
      const empty = typedName.trim().length === 0;
      setIsEmpty(empty);
      setStatusMessage(empty ? "Name ist leer" : "Name erfasst");
      onChange?.({
        paths: [],
        dataUrl: typedName,
        mode: "type",
        empty,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, currentPoints, typedName, mode]);

  return (
    <div ref={ref} className={cn("space-y-3", className)}>
      <Tabs value={mode} onValueChange={(v) => setMode(v as "draw" | "type")}>
        <TabsList className="w-full">
          <TabsTrigger value="draw" className="flex-1 gap-1.5" disabled={disabled}>
            <PenLine size={14} />
            Zeichnen
          </TabsTrigger>
          <TabsTrigger value="type" className="flex-1 gap-1.5" disabled={disabled}>
            <Keyboard size={14} />
            Namen tippen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="draw" className="mt-3">
          <div className="relative">
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onPointerCancel={handlePointerUp}
              role="img"
              aria-label={canvasAriaLabel}
              aria-describedby="sigpad-instructions sigpad-status"
              tabIndex={0}
              className={cn(
                "min-h-[180px] w-full touch-none rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:ring-offset-2",
                disabled && "cursor-not-allowed opacity-50",
                !disabled && "cursor-crosshair"
              )}
            />
            {isEmpty && mode === "draw" && (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[color:var(--ds-text-muted)]"
                aria-hidden="true"
              >
                Hier unterschreiben
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="type" className="mt-3">
          <div className="space-y-1.5">
            <Label htmlFor="sigpad-typed-name" className="text-xs text-[color:var(--ds-text-muted)]">
              Name als Unterschrift
            </Label>
            <Input
              id="sigpad-typed-name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={typedNamePlaceholder}
              disabled={disabled}
              autoComplete="name"
              className="min-h-11 text-base sm:min-h-0 sm:text-sm"
              aria-describedby="sigpad-instructions sigpad-status"
            />
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              Der getippte Name wird als elektronische Unterschrift gespeichert.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <p id="sigpad-instructions" className="sr-only">
        {instructions}
      </p>
      <p
        id="sigpad-status"
        className="sr-only"
        role="status"
        aria-live="polite"
      >
        {statusMessage}
      </p>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleClear}
          disabled={disabled || isEmpty}
          className="gap-1.5 active:scale-[0.98]"
          aria-label="Signatur löschen"
        >
          <Eraser size={14} />
          Löschen
        </Button>
        <span
          className={cn(
            "text-xs",
            isEmpty
              ? "text-[color:var(--ds-text-muted)]"
              : "text-[color:var(--ds-success-text)]"
          )}
          aria-hidden="true"
        >
          {isEmpty ? "Nicht erfasst" : "Erfasst"}
        </span>
      </div>
    </div>
  );
});
