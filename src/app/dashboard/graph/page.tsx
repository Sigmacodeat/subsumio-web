"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Users,
  Building2,
  Lightbulb,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { GraphNode, GraphLink } from "@/lib/types";

// Hex fallbacks only fire before the design tokens are resolved from
// `--graph-*` CSS vars on mount (see `resolveNodeColors`) — keeps a single
// source of truth in globals.css rather than scattering hex through
// canvas drawing code and JSX.
const NODE_COLOR_VARS: Record<string, string> = {
  person: "--graph-person",
  company: "--graph-company",
  idea: "--graph-idea",
  document: "--graph-document",
  event: "--graph-event",
  place: "--graph-place",
};

const NODE_COLOR_FALLBACKS: Record<string, string> = {
  person: "#60a5fa",
  company: "#34d399",
  idea: "#a78bfa",
  document: "#fbbf24",
  event: "#f97316",
  place: "#2dd4bf",
};

// Used where a hex literal is required for string-concatenated alpha
// (`color + "20"`) — `var(--graph-fallback)` can't be used there since
// you can't append an alpha suffix to an unresolved var() reference.
// Keep in sync with --graph-fallback in globals.css.
const GRAPH_FALLBACK_HEX = "#585866";

function resolveNodeColors(root: HTMLElement): Record<string, string> {
  const cs = getComputedStyle(root);
  const resolved: Record<string, string> = {};
  for (const [type, varName] of Object.entries(NODE_COLOR_VARS)) {
    resolved[type] = cs.getPropertyValue(varName).trim() || NODE_COLOR_FALLBACKS[type];
  }
  return resolved;
}

type LayoutNode = GraphNode & { x: number; y: number };

export default function GraphPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeColors, setNodeColors] = useState<Record<string, string>>(NODE_COLOR_FALLBACKS);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.brain.graph();
      setNodes(data.nodes);
      setLinks(data.links);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Graph konnte nicht geladen werden");
      setNodes([]);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the loading-state flip is not a synchronous setState
    // inside the effect body (react-hooks/set-state-in-effect).
    const timer = setTimeout(loadGraph, 0);
    return () => clearTimeout(timer);
  }, [loadGraph]);

  // Layout is purely derived from the node list — no state, no effect.
  const layoutNodes = useMemo<LayoutNode[]>(() => {
    if (nodes.length === 0) return [];
    const W = 800;
    const H = 600;
    return nodes.map((n, i) => ({
      ...n,
      x: W / 2 + Math.cos((i / nodes.length) * Math.PI * 2) * 180,
      y: H / 2 + Math.sin((i / nodes.length) * Math.PI * 2) * 130,
    }));
  }, [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || layoutNodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const scale = zoom;
    const offsetX = (W * (1 - scale)) / 2;
    const offsetY = (H * (1 - scale)) / 2;

    let animFrame: number;
    let tick = 0;

    // Canvas can't read CSS variables, so resolve the design tokens from the
    // dashboard root and re-read only when the theme attribute flips.
    const themeRoot =
      (canvas.closest('[data-app="dashboard"]') as HTMLElement | null) ?? document.documentElement;
    let lastTheme = "";
    const palette = { text: "#15151d", subtle: "#8a8a98", accentGlow: "rgba(47, 107, 255, 0.15)" };
    let resolvedNodeColors = NODE_COLOR_FALLBACKS;
    const readPalette = () => {
      const cs = getComputedStyle(themeRoot);
      palette.text = cs.getPropertyValue("--ds-text").trim() || palette.text;
      palette.subtle = cs.getPropertyValue("--ds-text-subtle").trim() || palette.subtle;
      palette.accentGlow = cs.getPropertyValue("--color-accent-glow").trim() || palette.accentGlow;
      resolvedNodeColors = resolveNodeColors(themeRoot);
      setNodeColors(resolvedNodeColors);
    };
    readPalette();

    const draw = () => {
      const theme = themeRoot.getAttribute("data-theme") || "";
      if (theme !== lastTheme) {
        lastTheme = theme;
        readPalette();
      }
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
      tick += 0.005;

      links.forEach((link) => {
        const srcId = typeof link.source === "string" ? link.source : link.source.id;
        const tgtId = typeof link.target === "string" ? link.target : link.target.id;
        const src = layoutNodes.find((n) => n.id === srcId);
        const tgt = layoutNodes.find((n) => n.id === tgtId);
        if (!src || !tgt) return;

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = palette.accentGlow;
        ctx.lineWidth = 1;
        ctx.stroke();

        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y + tgt.y) / 2;
        ctx.fillStyle = palette.subtle;
        ctx.font = "10px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(link.type, midX, midY - 4);
      });

      layoutNodes.forEach((node) => {
        const color =
          resolvedNodeColors[node.type] || NODE_COLOR_FALLBACKS[node.type] || GRAPH_FALLBACK_HEX;
        const radius = 8 + node.connections * 2;
        const pulse = Math.sin(tick * 2) * 2;

        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius + 8);
        gradient.addColorStop(0, color + "40");
        gradient.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 6 + pulse, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color + "20";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = palette.text;
        ctx.font = "12px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(node.name, node.x, node.y + radius + 16);

        ctx.fillStyle = palette.subtle;
        ctx.font = "10px JetBrains Mono, monospace";
        ctx.fillText(node.type, node.x, node.y + radius + 28);
      });

      ctx.restore();
      animFrame = requestAnimationFrame(draw);
    };

    draw();

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - offsetX) / scale;
      const y = (e.clientY - rect.top - offsetY) / scale;

      const hit = layoutNodes.find((n) => {
        const dx = n.x - x;
        const dy = n.y - y;
        return Math.sqrt(dx * dx + dy * dy) < 20;
      });

      setSelected(hit ? nodes.find((n) => n.id === hit.id) || null : null);
    };

    canvas.addEventListener("click", handleClick);

    return () => {
      cancelAnimationFrame(animFrame);
      canvas.removeEventListener("click", handleClick);
    };
  }, [layoutNodes, links, nodes, zoom]);

  const isEmpty = !loading && nodes.length === 0;

  const typeIconMap: Record<string, React.ElementType> = {
    person: Users,
    company: Building2,
    idea: Lightbulb,
    document: FileText,
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="relative flex-1 bg-[color:var(--ds-bg)]">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center">
            <Loader2 size={32} className="mb-3 animate-spin text-[color:var(--ds-text-muted)]" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">Graph wird geladen…</p>
          </div>
        ) : isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
              <Network size={28} className="text-[color:var(--ds-border-strong)]" />
            </div>
            <h3 className="mb-2 text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
              Graph ist leer
            </h3>
            <p className="mb-2 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
              Lade Dokumente hoch um den Wissensgraph zu befüllen
            </p>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="h-full w-full cursor-crosshair"
              style={{ width: "100%", height: "100%" }}
            />

            <div className="absolute top-4 left-4 flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]/90 p-1 backdrop-blur">
                <button
                  onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}
                  className="rounded p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-border)] hover:text-[color:var(--ds-text)]"
                >
                  <ZoomIn size={14} />
                </button>
                <span className="px-2 font-mono text-xs text-[color:var(--ds-text-muted)]">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.max(z - 0.2, 0.3))}
                  className="rounded p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-border)] hover:text-[color:var(--ds-text)]"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="rounded p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-border)] hover:text-[color:var(--ds-text)]"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
              <button
                onClick={loadGraph}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]/90 p-2 text-[color:var(--ds-text-muted)] backdrop-blur transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            <div className="absolute bottom-4 left-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]/90 p-4 backdrop-blur">
              <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                Legende
              </p>
              <div className="space-y-2">
                {Object.entries(nodeColors)
                  .slice(0, 4)
                  .map(([type, color]) => (
                    <div key={type} className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full border-2"
                        style={{ borderColor: color, backgroundColor: color + "20" }}
                      />
                      <span className="text-xs text-[color:var(--ds-text-muted)] capitalize">
                        {type}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="absolute top-4 right-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]/90 p-4 text-right backdrop-blur">
              <div className="mb-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                Graph
              </div>
              <div className="space-y-1">
                <div className="font-mono text-sm text-[color:var(--ds-text)]">
                  {nodes.length} <span className="text-[color:var(--ds-text-muted)]">Knoten</span>
                </div>
                <div className="font-mono text-sm text-[color:var(--ds-text)]">
                  {links.length} <span className="text-[color:var(--ds-text-muted)]">Kanten</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {selected && (
        <div className="w-72 shrink-0 overflow-y-auto border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <div className="mb-5 flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                backgroundColor: (nodeColors[selected.type] || GRAPH_FALLBACK_HEX) + "20",
                border: `1px solid ${nodeColors[selected.type] || GRAPH_FALLBACK_HEX}40`,
              }}
            >
              {(() => {
                const Icon = typeIconMap[selected.type] || FileText;
                return (
                  <Icon
                    size={17}
                    style={{ color: nodeColors[selected.type] || GRAPH_FALLBACK_HEX }}
                  />
                );
              })()}
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
                {selected.name}
              </h3>
              <Badge
                variant={(selected.type as Parameters<typeof Badge>[0]["variant"]) || "default"}
                className="mt-1.5"
              >
                {selected.type}
              </Badge>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                Slug
              </p>
              <p className="brand-text brand-soft rounded-lg px-3 py-2 font-mono text-sm">
                {selected.id}
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                Verbindungen
              </p>
              <p className="font-mono text-2xl font-bold text-[color:var(--ds-text)] tabular-nums">
                {selected.connections}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                Kanten
              </p>
              {links
                .filter((l) => {
                  const src = typeof l.source === "string" ? l.source : l.source.id;
                  const tgt = typeof l.target === "string" ? l.target : l.target.id;
                  return src === selected.id || tgt === selected.id;
                })
                .map((link, i) => {
                  const src = typeof link.source === "string" ? link.source : link.source.id;
                  const tgt = typeof link.target === "string" ? link.target : link.target.id;
                  const other = src === selected.id ? tgt : src;
                  const otherNode = nodes.find((n) => n.id === other);
                  return (
                    <div key={i} className="mb-2 flex items-center gap-2 text-xs">
                      <span className="brand-text brand-soft rounded px-2 py-0.5 font-mono">
                        {link.type}
                      </span>
                      <span className="text-[color:var(--ds-text-muted)]">→</span>
                      <span className="text-[color:var(--ds-text)]">
                        {otherNode?.name || other}
                      </span>
                    </div>
                  );
                })}
            </div>

            <Button
              variant="outline"
              size="md"
              className="w-full"
              onClick={() => router.push(`/dashboard/brain/${encodeURIComponent(selected.id)}`)}
            >
              Seite öffnen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
