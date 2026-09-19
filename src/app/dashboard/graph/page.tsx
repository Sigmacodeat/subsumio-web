"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Network, ZoomIn, ZoomOut, Maximize2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { api } from "@/lib/api";
import type { GraphNode, GraphLink } from "@/lib/types";
import { useLang } from "@/lib/use-lang";
import { brainTypeIcon, brainTypeLabel } from "../brain/brain-types";

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
  person: "#3047a6",
  company: "#29824f",
  idea: "#6840a3",
  document: "#846416",
  event: "#9e4b1a",
  place: "#1d6d6d",
};

// Used where a hex literal is required for string-concatenated alpha
// (`color + "20"`) — `var(--graph-fallback)` can't be used there since
// you can't append an alpha suffix to an unresolved var() reference.
// Keep in sync with --graph-fallback in globals.css.
const GRAPH_FALLBACK_HEX = "#5e626d";

/** Beziehungsarten in Klartext; unbekannte Arten werden neutral benannt. */
const LINK_LABELS: Record<string, string> = {
  mentions: "erwähnt",
  references: "verweist auf",
  cites: "zitiert",
  related_to: "steht in Bezug zu",
  party_to: "Partei in",
  represents: "vertritt",
  belongs_to: "gehört zu",
  works_at: "tätig bei",
};

function resolveNodeColors(root: HTMLElement): Record<string, string> {
  const cs = getComputedStyle(root);
  const resolved: Record<string, string> = {};
  for (const [type, varName] of Object.entries(NODE_COLOR_VARS)) {
    resolved[type] = cs.getPropertyValue(varName).trim() || NODE_COLOR_FALLBACKS[type];
  }
  return resolved;
}

const linkEnd = (end: string | GraphNode) => (typeof end === "string" ? end : end.id);

/** Unit-circle position; scaled to the canvas size at draw time so the ring stays centered. */
type LayoutNode = GraphNode & { ux: number; uy: number };

export default function GraphPage() {
  const router = useRouter();
  const { t } = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nodeColors, setNodeColors] = useState<Record<string, string>>(NODE_COLOR_FALLBACKS);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const data = await api.brain.graph();
      setNodes(data.nodes);
      setLinks(data.links);
    } catch (e) {
      console.error("[graph] load failed:", e instanceof Error ? e.message : String(e));
      setFailed(true);
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
  const layoutNodes = useMemo<LayoutNode[]>(
    () =>
      nodes.map((n, i) => ({
        ...n,
        ux: Math.cos((i / nodes.length) * Math.PI * 2),
        uy: Math.sin((i / nodes.length) * Math.PI * 2),
      })),
    [nodes]
  );

  const presentTypes = useMemo(() => [...new Set(nodes.map((n) => n.type))], [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || layoutNodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas can't read CSS variables, so resolve the design tokens from the
    // dashboard root and redraw when the theme attribute flips.
    const themeRoot =
      (canvas.closest('[data-app="dashboard"]') as HTMLElement | null) ?? document.documentElement;
    const palette = {
      text: "hsl(225, 20%, 12%)",
      line: "hsla(222, 20%, 50%, 0.35)",
    };
    let resolvedNodeColors = NODE_COLOR_FALLBACKS;
    const readPalette = () => {
      const cs = getComputedStyle(themeRoot);
      palette.text = cs.getPropertyValue("--ds-text").trim() || palette.text;
      palette.line = cs.getPropertyValue("--ds-border-strong").trim() || palette.line;
      resolvedNodeColors = resolveNodeColors(themeRoot);
      setNodeColors(resolvedNodeColors);
    };

    const positions = new Map<string, { x: number; y: number }>();
    let geometry = { W: 0, H: 0, offsetX: 0, offsetY: 0 };

    // One static drawing per change — no animation loop, no pulsing content.
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const W = rect.width;
      const H = rect.height;
      const offsetX = (W * (1 - zoom)) / 2;
      const offsetY = (H * (1 - zoom)) / 2;
      geometry = { W, H, offsetX, offsetY };
      const rx = Math.min(W * 0.36, 300);
      const ry = Math.min(H * 0.34, 220);
      positions.clear();
      for (const n of layoutNodes) {
        positions.set(n.id, { x: W / 2 + n.ux * rx, y: H / 2 + n.uy * ry });
      }

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(zoom, zoom);

      links.forEach((link) => {
        const src = positions.get(linkEnd(link.source));
        const tgt = positions.get(linkEnd(link.target));
        if (!src || !tgt) return;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = palette.line;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      layoutNodes.forEach((node) => {
        const pos = positions.get(node.id);
        if (!pos) return;
        const color =
          resolvedNodeColors[node.type] || NODE_COLOR_FALLBACKS[node.type] || GRAPH_FALLBACK_HEX;
        const radius = Math.min(8 + node.connections * 2, 22);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color + "26";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = palette.text;
        ctx.font = "12px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(node.name, pos.x, pos.y + radius + 16);
      });

      ctx.restore();
    };

    readPalette();
    draw();

    const themeObserver = new MutationObserver(() => {
      readPalette();
      draw();
    });
    themeObserver.observe(themeRoot, { attributes: true, attributeFilter: ["data-theme"] });
    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - geometry.offsetX) / zoom;
      const y = (e.clientY - rect.top - geometry.offsetY) / zoom;
      const hit = layoutNodes.find((n) => {
        const p = positions.get(n.id);
        if (!p) return false;
        return Math.hypot(p.x - x, p.y - y) < 22;
      });
      setSelected(hit ? nodes.find((n) => n.id === hit.id) || null : null);
    };

    canvas.addEventListener("click", handleClick);

    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      canvas.removeEventListener("click", handleClick);
    };
  }, [layoutNodes, links, nodes, zoom]);

  const isEmpty = !loading && nodes.length === 0;
  const title = "Beziehungsnetz";

  const selectedLinks = selected
    ? links.filter((l) => linkEnd(l.source) === selected.id || linkEnd(l.target) === selected.id)
    : [];

  const iconBtn =
    "rounded p-2 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none";

  return (
    <div className="mx-auto w-full max-w-[1200px] min-w-0 space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={
          !loading && nodes.length > 0
            ? `${nodes.length} Personen, Unternehmen und Dokumente mit ${links.length} Verknüpfungen — wählen Sie einen Punkt für Details.`
            : "Wer mit wem verbunden ist: Personen, Unternehmen und Dokumente aus dem Kanzleiwissen."
        }
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("nav.brain"), href: "/dashboard/brain" },
          { label: title },
        ]}
        actions={
          !isEmpty && !loading ? (
            <Button variant="secondary" onClick={loadGraph} className="whitespace-nowrap">
              <RefreshCw size={14} aria-hidden="true" />
              {t("graph.btn_refresh")}
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <Skeleton className="h-[60vh] min-h-[420px] w-full rounded-xl" />
      ) : isEmpty ? (
        <EmptyState
          icon={Network}
          title={failed ? "Beziehungsnetz derzeit nicht erreichbar" : "Noch keine Verknüpfungen"}
          description={
            failed
              ? "Die Verknüpfungen konnten nicht geladen werden. Bitte versuchen Sie es in einigen Minuten erneut."
              : t("graph.empty_hint")
          }
          actionLabel={failed ? "Erneut laden" : "Kontakt anlegen"}
          onAction={() => (failed ? void loadGraph() : router.push("/dashboard/contacts"))}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row">
          <div className="relative h-[60vh] min-h-[420px] min-w-0 flex-1 overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`${title}: ${nodes.length} Einträge, ${links.length} Verknüpfungen`}
              className="h-full w-full cursor-pointer"
              style={{ width: "100%", height: "100%" }}
            />

            <div className="absolute top-3 left-3 flex items-center gap-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1 shadow-[var(--ds-shadow-2)]">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}
                aria-label="Vergrößern"
                className={iconBtn}
              >
                <ZoomIn size={14} />
              </button>
              <span className="px-1 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                {Math.round(zoom * 100)} %
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(z - 0.2, 0.3))}
                aria-label="Verkleinern"
                className={iconBtn}
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="Ansicht zurücksetzen"
                className={iconBtn}
              >
                <Maximize2 size={14} />
              </button>
            </div>

            {presentTypes.length > 0 && (
              <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 shadow-[var(--ds-shadow-2)]">
                {presentTypes.map((type) => {
                  const color = nodeColors[type] || GRAPH_FALLBACK_HEX;
                  return (
                    <span key={type} className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full border-2"
                        style={{ borderColor: color, backgroundColor: color + "33" }}
                        aria-hidden="true"
                      />
                      <span className="text-xs text-[color:var(--ds-text-muted)]">
                        {brainTypeLabel(type)}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {selected && (
            <aside className="w-full shrink-0 space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 lg:w-72">
              <div className="flex items-start gap-3">
                {(() => {
                  const Icon = brainTypeIcon(selected.type);
                  return (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                  );
                })()}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-[color:var(--ds-text)]">
                    {selected.name}
                  </h2>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {brainTypeLabel(selected.type)} · {selected.connections}{" "}
                    {selected.connections === 1 ? "Verknüpfung" : "Verknüpfungen"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Details schließen"
                  className={iconBtn}
                >
                  <X size={14} />
                </button>
              </div>

              {selectedLinks.length > 0 && (
                <ul className="space-y-1.5">
                  {selectedLinks.map((link, i) => {
                    const src = linkEnd(link.source);
                    const tgt = linkEnd(link.target);
                    const other = src === selected.id ? tgt : src;
                    const otherNode = nodes.find((n) => n.id === other);
                    return (
                      <li key={i} className="flex items-baseline gap-2 text-xs">
                        <span className="shrink-0 text-[color:var(--ds-text-subtle)]">
                          {LINK_LABELS[link.type] ?? "verknüpft mit"}
                        </span>
                        <span className="min-w-0 truncate text-[color:var(--ds-text)]">
                          {otherNode?.name || other}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => router.push(`/dashboard/brain/${encodeURIComponent(selected.id)}`)}
              >
                Eintrag öffnen
              </Button>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
