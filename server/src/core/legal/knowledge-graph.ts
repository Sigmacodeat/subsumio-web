/**
 * Hierarchical Legal Knowledge Graph (LegalGraphRAG Pattern)
 *
 * Builds a multi-level hierarchy:
 *   Jurisdiction → Statute → § (Paragraph) → Subsection
 *
 * With cross-reference edges:
 *   - within-statute: § 433 BGB → § 434 BGB (already in citation-graph.ts)
 *   - cross-statute: § 12 AO → § 1 EStG
 *   - case-law → statute: OGH 6Ob123/24h → § 1311 ABGB
 *
 * Graph traversal (BFS) from a starting § finds related §§ across
 * statutes, enabling the think pipeline to augment retrieval with
 * graph-reachable context (the 4th RRF search arm).
 *
 * Pure + deterministic: no I/O. The graph is built from statute text
 * and case metadata, then queried via BFS/DFS traversal.
 */

import { extractCitations, type CitationEdge } from "./citation-graph.ts";
import type { StatuteSection } from "./split-statute.ts";

// ── Types ─────────────────────────────────────────────────────────────

export type GraphNodeType = "jurisdiction" | "statute" | "paragraph" | "subsection" | "case";

export interface GraphNode {
  /** Unique node ID, e.g. "de:bgb:433" */
  id: string;
  type: GraphNodeType;
  /** Display label */
  label: string;
  /** Jurisdiction code */
  jurisdiction: string;
  /** Statute abbreviation (for statute/paragraph/subsection nodes) */
  statute?: string;
  /** § number (for paragraph/subsection nodes) */
  paragraph?: string;
  /** Subsection identifier (e.g. "abs-1", "satz-2") */
  subsection?: string;
  /** Slug in the brain engine */
  slug?: string;
}

export interface GraphEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Edge type */
  type: "contains" | "references" | "cites" | "amends" | "repeals" | "implements";
  /** Context snippet where the reference was found */
  context?: string;
  /** Weight (1.0 = direct, 0.5 = indirect) */
  weight: number;
}

export interface LegalKnowledgeGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  /** Adjacency list: node ID → outgoing edges */
  adjacency: Map<string, GraphEdge[]>;
  /** Reverse adjacency: node ID → incoming edges */
  reverseAdjacency: Map<string, GraphEdge[]>;
}

// ── Node ID Helpers ───────────────────────────────────────────────────

export function makeJurisdictionId(jur: string): string {
  return `jur:${jur.toLowerCase()}`;
}

export function makeStatuteId(jur: string, statute: string): string {
  return `${jur.toLowerCase()}:${statute.toLowerCase()}`;
}

export function makeParagraphId(jur: string, statute: string, paragraph: string): string {
  return `${jur.toLowerCase()}:${statute.toLowerCase()}:p-${paragraph}`;
}

export function makeSubsectionId(
  jur: string,
  statute: string,
  paragraph: string,
  subsection: string
): string {
  return `${jur.toLowerCase()}:${statute.toLowerCase()}:p-${paragraph}:${subsection}`;
}

export function makeCaseId(jur: string, caseRef: string): string {
  return `${jur.toLowerCase()}:case:${caseRef.toLowerCase()}`;
}

// ── Graph Builder ─────────────────────────────────────────────────────

/**
 * Build a legal knowledge graph from statute sections.
 *
 * @param statutes - Array of { jurisdiction, statuteCode, sections }
 * @returns LegalKnowledgeGraph with hierarchy + cross-reference edges
 */
export function buildLegalKnowledgeGraph(
  statutes: Array<{
    jurisdiction: string;
    statuteCode: string;
    sections: StatuteSection[];
    slugPrefix?: string;
  }>
): LegalKnowledgeGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // Track all known statute+paragraph combos for cross-statute resolution
  const knownParagraphs = new Map<string, { jurisdiction: string; statute: string; paragraph: string }>();
  for (const { jurisdiction, statuteCode, sections } of statutes) {
    for (const section of sections) {
      const key = `${jurisdiction.toLowerCase()}:${statuteCode.toLowerCase()}:${section.ref}`;
      knownParagraphs.set(key, { jurisdiction, statute: statuteCode, paragraph: section.ref });
    }
  }

  for (const { jurisdiction, statuteCode, sections, slugPrefix } of statutes) {
    const jurLower = jurisdiction.toLowerCase();
    const statuteLower = statuteCode.toLowerCase();

    // ── Hierarchy nodes ──
    const jurId = makeJurisdictionId(jurLower);
    if (!nodes.has(jurId)) {
      nodes.set(jurId, {
        id: jurId,
        type: "jurisdiction",
        label: jurisdiction.toUpperCase(),
        jurisdiction: jurLower,
      });
    }

    const statuteId = makeStatuteId(jurLower, statuteLower);
    if (!nodes.has(statuteId)) {
      nodes.set(statuteId, {
        id: statuteId,
        type: "statute",
        label: statuteCode.toUpperCase(),
        jurisdiction: jurLower,
        statute: statuteLower,
      });
      edges.push({
        from: jurId,
        to: statuteId,
        type: "contains",
        weight: 1.0,
      });
    }

    // ── Paragraph nodes + within-statute edges ──
    const citationEdges = extractCitations(sections);

    for (const section of sections) {
      const paraId = makeParagraphId(jurLower, statuteLower, section.ref);
      const slug = slugPrefix
        ? `${slugPrefix}/${statuteLower}/${section.id}`
        : `legal/statutes/${jurLower}/${statuteLower}/${section.id}`;

      if (!nodes.has(paraId)) {
        nodes.set(paraId, {
          id: paraId,
          type: "paragraph",
          label: `§ ${section.ref} ${statuteCode.toUpperCase()}`,
          jurisdiction: jurLower,
          statute: statuteLower,
          paragraph: section.ref,
          slug,
        });
        edges.push({
          from: statuteId,
          to: paraId,
          type: "contains",
          weight: 1.0,
        });
      }

      // Detect subsections (Abs. 1, Satz 2, etc.)
      const absMatch = section.body.match(/\((\d+)\)/);
      if (absMatch) {
        const subId = makeSubsectionId(jurLower, statuteLower, section.ref, `abs-${absMatch[1]}`);
        if (!nodes.has(subId)) {
          nodes.set(subId, {
            id: subId,
            type: "subsection",
            label: `§ ${section.ref} Abs. ${absMatch[1]} ${statuteCode.toUpperCase()}`,
            jurisdiction: jurLower,
            statute: statuteLower,
            paragraph: section.ref,
            subsection: `abs-${absMatch[1]}`,
            slug,
          });
          edges.push({
            from: paraId,
            to: subId,
            type: "contains",
            weight: 1.0,
          });
        }
      }
    }

    // ── Within-statute citation edges ──
    for (const edge of citationEdges) {
      const fromId = makeParagraphId(jurLower, statuteLower, edge.fromRef);
      const toId = makeParagraphId(jurLower, statuteLower, edge.toRef);
      if (nodes.has(fromId) && nodes.has(toId)) {
        edges.push({
          from: fromId,
          to: toId,
          type: "references",
          context: edge.context,
          weight: 1.0,
        });
      }
    }

    // ── Cross-statute citation edges ──
    // Detect references to OTHER statutes in section bodies
    const crossStatutePattern = /§\s*(\d+[a-z]?)\s+([A-Z][A-Za-z]{1,10})/g;
    for (const section of sections) {
      const fromId = makeParagraphId(jurLower, statuteLower, section.ref);
      let match: RegExpExecArray | null;
      crossStatutePattern.lastIndex = 0;
      while ((match = crossStatutePattern.exec(section.body)) !== null) {
        const citedPara = match[1];
        const citedStatute = match[2];
        const citedStatuteLower = citedStatute.toLowerCase();

        // Skip self-references (within-statute already handled)
        if (citedStatuteLower === statuteLower) continue;

        // Check if the cited statute exists in our graph
        const citedKey = `${jurLower}:${citedStatuteLower}:${citedPara}`;
        if (knownParagraphs.has(citedKey)) {
          const toId = makeParagraphId(jurLower, citedStatuteLower, citedPara);
          const start = Math.max(0, (match.index ?? 0) - 40);
          const end = Math.min(section.body.length, (match.index ?? 0) + 60);
          edges.push({
            from: fromId,
            to: toId,
            type: "references",
            context: section.body.slice(start, end).replace(/\s+/g, " ").trim(),
            weight: 0.8, // Cross-statute references are slightly weaker
          });
        }
      }
    }
  }

  // ── Build adjacency lists ──
  const adjacency = new Map<string, GraphEdge[]>();
  const reverseAdjacency = new Map<string, GraphEdge[]>();

  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from)!.push(edge);

    if (!reverseAdjacency.has(edge.to)) reverseAdjacency.set(edge.to, []);
    reverseAdjacency.get(edge.to)!.push(edge);
  }

  return { nodes, edges, adjacency, reverseAdjacency };
}

// ── Graph Traversal ───────────────────────────────────────────────────

export interface TraversalResult {
  /** Visited node IDs in BFS order */
  visited: string[];
  /** Node ID → distance from start (0 = start, 1 = direct neighbor, etc.) */
  distances: Map<string, number>;
  /** Node ID → path from start */
  paths: Map<string, string[]>;
}

/**
 * BFS traversal from a starting node, following "references" and "cites" edges.
 * Stops at maxDepth.
 *
 * @param graph - The legal knowledge graph
 * @param startNodeId - Starting node ID
 * @param maxDepth - Maximum traversal depth (default 2)
 * @param edgeTypes - Edge types to follow (default: references, cites)
 */
export function bfsTraversal(
  graph: LegalKnowledgeGraph,
  startNodeId: string,
  maxDepth = 2,
  edgeTypes: GraphEdge["type"][] = ["references", "cites"]
): TraversalResult {
  const visited = new Set<string>();
  const distances = new Map<string, number>();
  const paths = new Map<string, string[]>();
  const queue: Array<{ nodeId: string; distance: number; path: string[] }> = [
    { nodeId: startNodeId, distance: 0, path: [startNodeId] },
  ];

  const edgeTypeSet = new Set(edgeTypes);

  while (queue.length > 0) {
    const { nodeId, distance, path } = queue.shift()!;
    if (visited.has(nodeId)) continue;
    if (distance > maxDepth) continue;
    if (!graph.nodes.has(nodeId)) continue;

    visited.add(nodeId);
    distances.set(nodeId, distance);
    paths.set(nodeId, path);

    const outEdges = graph.adjacency.get(nodeId) ?? [];
    for (const edge of outEdges) {
      if (!edgeTypeSet.has(edge.type)) continue;
      if (visited.has(edge.to)) continue;
      queue.push({
        nodeId: edge.to,
        distance: distance + 1,
        path: [...path, edge.to],
      });
    }
  }

  return {
    visited: Array.from(visited),
    distances,
    paths,
  };
}

/**
 * Get all paragraphs reachable from a starting paragraph, with their slugs.
 * Used by the think pipeline to augment retrieval with graph-relevant context.
 *
 * @param graph - The legal knowledge graph
 * @param startNodeId - Starting paragraph node ID
 * @param maxDepth - Maximum traversal depth
 * @returns Array of { nodeId, slug, distance, label }
 */
export function getReachableParagraphs(
  graph: LegalKnowledgeGraph,
  startNodeId: string,
  maxDepth = 2
): Array<{ nodeId: string; slug: string; distance: number; label: string }> {
  const traversal = bfsTraversal(graph, startNodeId, maxDepth);

  const result: Array<{ nodeId: string; slug: string; distance: number; label: string }> = [];
  for (const nodeId of traversal.visited) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;
    if (node.type !== "paragraph") continue;
    if (!node.slug) continue;
    result.push({
      nodeId,
      slug: node.slug,
      distance: traversal.distances.get(nodeId) ?? 0,
      label: node.label,
    });
  }

  // Sort by distance (closest first)
  result.sort((a, b) => a.distance - b.distance);
  return result;
}

// ── Graph Statistics ──────────────────────────────────────────────────

export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  by_type: Record<GraphNodeType, number>;
  by_edge_type: Record<GraphEdge["type"], number>;
  by_jurisdiction: Record<string, number>;
  max_degree: number;
  avg_degree: number;
}

export function computeGraphStats(graph: LegalKnowledgeGraph): GraphStats {
  const byType: Record<string, number> = {};
  const byEdgeType: Record<string, number> = {};
  const byJurisdiction: Record<string, number> = {};

  for (const node of graph.nodes.values()) {
    byType[node.type] = (byType[node.type] ?? 0) + 1;
    byJurisdiction[node.jurisdiction] = (byJurisdiction[node.jurisdiction] ?? 0) + 1;
  }

  for (const edge of graph.edges) {
    byEdgeType[edge.type] = (byEdgeType[edge.type] ?? 0) + 1;
  }

  let maxDegree = 0;
  let totalDegree = 0;
  for (const [nodeId, edges] of graph.adjacency) {
    const degree = edges.length;
    maxDegree = Math.max(maxDegree, degree);
    totalDegree += degree;
  }

  return {
    total_nodes: graph.nodes.size,
    total_edges: graph.edges.length,
    by_type: byType as Record<GraphNodeType, number>,
    by_edge_type: byEdgeType as Record<GraphEdge["type"], number>,
    by_jurisdiction: byJurisdiction,
    max_degree: maxDegree,
    avg_degree: graph.nodes.size > 0 ? totalDegree / graph.nodes.size : 0,
  };
}

// ── Subgraph Extraction ───────────────────────────────────────────────

/**
 * Extract a subgraph centered on a specific node, including all nodes
 * within `radius` hops. Useful for visualization and focused retrieval.
 */
export function extractSubgraph(
  graph: LegalKnowledgeGraph,
  centerNodeId: string,
  radius = 2
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const traversal = bfsTraversal(graph, centerNodeId, radius);
  const visitedSet = new Set(traversal.visited);

  const nodes: GraphNode[] = [];
  for (const nodeId of traversal.visited) {
    const node = graph.nodes.get(nodeId);
    if (node) nodes.push(node);
  }

  const edges: GraphEdge[] = graph.edges.filter(
    (e) => visitedSet.has(e.from) && visitedSet.has(e.to)
  );

  return { nodes, edges };
}
