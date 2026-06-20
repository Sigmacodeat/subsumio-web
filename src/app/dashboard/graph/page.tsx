"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Network, ZoomIn, ZoomOut, Maximize2, RefreshCw, Users, Building2, Lightbulb, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { GraphNode, GraphLink } from "@/lib/types";

const NODE_COLORS: Record<string, string> = {
  person: "#60a5fa",
  company: "#34d399",
  idea: "#a78bfa",
  document: "#fbbf24",
  event: "#f97316",
  place: "#2dd4bf",
};

type LayoutNode = GraphNode & { x: number; y: number };

export default function GraphPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const themeRoot = (canvas.closest("[data-app=\"dashboard\"]") as HTMLElement | null) ?? document.documentElement;
    let lastTheme = "";
    const palette = { text: "#15151d", subtle: "#8a8a98" };
    const readPalette = () => {
      const cs = getComputedStyle(themeRoot);
      palette.text = cs.getPropertyValue("--ds-text").trim() || palette.text;
      palette.subtle = cs.getPropertyValue("--ds-text-subtle").trim() || palette.subtle;
    };
    readPalette();

    const draw = () => {
      const theme = themeRoot.getAttribute("data-theme") || "";
      if (theme !== lastTheme) { lastTheme = theme; readPalette(); }
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
        ctx.strokeStyle = "rgba(47, 107, 255, 0.15)";
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
        const color = NODE_COLORS[node.type] || "#585866";
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
      <div className="flex-1 relative bg-[color:var(--ds-bg)]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Loader2 size={32} className="animate-spin text-[color:var(--ds-text-muted)] mb-3" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">Graph wird geladen…</p>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-[color:var(--ds-surface-2)] flex items-center justify-center mb-5">
              <Network size={28} className="text-[color:var(--ds-border-strong)]" />
            </div>
            <h3 className="text-lg font-semibold text-[color:var(--ds-text)] mb-2 tracking-tight">Graph ist leer</h3>
            <p className="text-sm text-[color:var(--ds-text-muted)] mb-2 leading-relaxed">Lade Dokumente hoch um den Wissensgraph zu befüllen</p>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-crosshair"
              style={{ width: "100%", height: "100%" }}
            />

            <div className="absolute top-4 left-4 flex items-center gap-2">
              <div className="flex items-center gap-1 bg-[color:var(--ds-surface)]/90 backdrop-blur border border-[color:var(--ds-border)] rounded-lg p-1">
                <button
                  onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}
                  className="p-2 rounded text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-border)] transition-all"
                >
                  <ZoomIn size={14} />
                </button>
                <span className="text-xs text-[color:var(--ds-text-muted)] px-2 font-mono">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom((z) => Math.max(z - 0.2, 0.3))}
                  className="p-2 rounded text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-border)] transition-all"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="p-2 rounded text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-border)] transition-all"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
              <button
                onClick={loadGraph}
                className="p-2 bg-[color:var(--ds-surface)]/90 backdrop-blur border border-[color:var(--ds-border)] rounded-lg text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            <div className="absolute bottom-4 left-4 bg-[color:var(--ds-surface)]/90 backdrop-blur border border-[color:var(--ds-border)] rounded-xl p-4">
              <p className="text-[10px] text-[color:var(--ds-text-subtle)] uppercase tracking-[0.08em] font-semibold mb-3">Legende</p>
              <div className="space-y-2">
                {Object.entries(NODE_COLORS).slice(0, 4).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: color, backgroundColor: color + "20" }} />
                    <span className="text-xs text-[color:var(--ds-text-muted)] capitalize">{type}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="absolute top-4 right-4 bg-[color:var(--ds-surface)]/90 backdrop-blur border border-[color:var(--ds-border)] rounded-xl p-4 text-right">
              <div className="text-[10px] text-[color:var(--ds-text-subtle)] uppercase tracking-[0.08em] font-semibold mb-2">Graph</div>
              <div className="space-y-1">
                <div className="text-sm font-mono text-[color:var(--ds-text)]">{nodes.length} <span className="text-[color:var(--ds-text-muted)]">Knoten</span></div>
                <div className="text-sm font-mono text-[color:var(--ds-text)]">{links.length} <span className="text-[color:var(--ds-text-muted)]">Kanten</span></div>
              </div>
            </div>
          </>
        )}
      </div>

      {selected && (
        <div className="w-72 shrink-0 border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] overflow-y-auto p-5">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: (NODE_COLORS[selected.type] || "#585866") + "20", border: `1px solid ${(NODE_COLORS[selected.type] || "#585866")}40` }}>
              {(() => {
                const Icon = typeIconMap[selected.type] || FileText;
                return <Icon size={17} style={{ color: NODE_COLORS[selected.type] || "#585866" }} />;
              })()}
            </div>
            <div>
              <h3 className="text-base font-semibold text-[color:var(--ds-text)] tracking-tight">{selected.name}</h3>
              <Badge variant={(selected.type as Parameters<typeof Badge>[0]["variant"]) || "default"} className="mt-1.5">
                {selected.type}
              </Badge>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[10px] text-[color:var(--ds-text-subtle)] uppercase tracking-[0.08em] font-semibold mb-2">Slug</p>
              <p className="text-sm font-mono brand-text brand-soft px-3 py-2 rounded-lg">{selected.id}</p>
            </div>
            <div>
              <p className="text-[10px] text-[color:var(--ds-text-subtle)] uppercase tracking-[0.08em] font-semibold mb-2">Verbindungen</p>
              <p className="text-2xl font-bold text-[color:var(--ds-text)] font-mono tabular-nums">{selected.connections}</p>
            </div>

            <div>
              <p className="text-[10px] text-[color:var(--ds-text-subtle)] uppercase tracking-[0.08em] font-semibold mb-2">Kanten</p>
              {links.filter((l) => {
                const src = typeof l.source === "string" ? l.source : l.source.id;
                const tgt = typeof l.target === "string" ? l.target : l.target.id;
                return src === selected.id || tgt === selected.id;
              }).map((link, i) => {
                const src = typeof link.source === "string" ? link.source : link.source.id;
                const tgt = typeof link.target === "string" ? link.target : link.target.id;
                const other = src === selected.id ? tgt : src;
                const otherNode = nodes.find((n) => n.id === other);
                return (
                  <div key={i} className="flex items-center gap-2 text-xs mb-2">
                    <span className="font-mono brand-text brand-soft px-2 py-0.5 rounded">{link.type}</span>
                    <span className="text-[color:var(--ds-text-muted)]">→</span>
                    <span className="text-[color:var(--ds-text)]">{otherNode?.name || other}</span>
                  </div>
                );
              })}
            </div>

            <Button variant="outline" size="md" className="w-full" onClick={() => window.location.href = `/dashboard/brain/${selected.id.split("/").map(encodeURIComponent).join("/")}`}>
              Seite öffnen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}