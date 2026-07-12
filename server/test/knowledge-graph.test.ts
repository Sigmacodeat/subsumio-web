import { describe, test, expect } from "bun:test";
import {
  buildLegalKnowledgeGraph,
  bfsTraversal,
  getReachableParagraphs,
  computeGraphStats,
  extractSubgraph,
  makeJurisdictionId,
  makeStatuteId,
  makeParagraphId,
} from "../src/core/legal/knowledge-graph.ts";
import type { StatuteSection } from "../src/core/legal/split-statute.ts";

// ── Fixtures ──────────────────────────────────────────────────────────

const bgbSections: StatuteSection[] = [
  {
    marker: "§",
    ref: "433",
    id: "p-433",
    title: "Vertragstypische Pflichten",
    body: "Der Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben. § 434 regelt den Sachmangel. § 435 regelt den Rechtsmangel.",
  },
  {
    marker: "§",
    ref: "434",
    id: "p-434",
    title: "Sachmangel",
    body: "(1) Die Sache ist frei von Sachmängeln, wenn sie bei Gefahrübergang die vereinbarte Beschaffenheit hat. § 433 bleibt unberührt.",
  },
  {
    marker: "§",
    ref: "435",
    id: "p-435",
    title: "Rechtsmangel",
    body: "Die Sache ist frei von Rechtsmängeln. § 434 findet entsprechende Anwendung.",
  },
  {
    marker: "§",
    ref: "437",
    id: "p-437",
    title: "Rechte des Käufers",
    body: "Ist die Sache mit einem Mangel behaftet, so kann der Käufer § 434 geltend machen. § 12 AO regelt die Betriebstätte.",
  },
];

const aoSections: StatuteSection[] = [
  {
    marker: "§",
    ref: "12",
    id: "p-12",
    title: "Betriebstätte",
    body: "Betriebstätte ist eine feste Geschäftseinrichtung oder Anlage, die der Tätigkeit eines Unternehmens dient. § 1 EStG regelt die Steuerpflicht.",
  },
  {
    marker: "§",
    ref: "13",
    id: "p-13",
    title: "Geschäftsleitung",
    body: "Geschäftsleitung ist der Ort, wo die Geschäftsleitung einer Corporation oder Personengesellschaft liegt.",
  },
];

const estgSections: StatuteSection[] = [
  {
    marker: "§",
    ref: "1",
    id: "p-1",
    title: "Steuerpflicht",
    body: "Natürliche Personen, die im Inland einen Wohnsitz oder ihren gewöhnlichen Aufenthalt haben, sind unbeschränkt einkommensteuerpflichtig.",
  },
];

function buildTestGraph() {
  return buildLegalKnowledgeGraph([
    { jurisdiction: "DE", statuteCode: "BGB", sections: bgbSections, slugPrefix: "legal/statutes/de" },
    { jurisdiction: "DE", statuteCode: "AO", sections: aoSections, slugPrefix: "legal/statutes/de" },
    { jurisdiction: "DE", statuteCode: "EStG", sections: estgSections, slugPrefix: "legal/statutes/de" },
  ]);
}

// ── Node ID Helpers ───────────────────────────────────────────────────

describe("node ID helpers", () => {
  test("makeJurisdictionId", () => {
    expect(makeJurisdictionId("DE")).toBe("jur:de");
  });

  test("makeStatuteId", () => {
    expect(makeStatuteId("DE", "BGB")).toBe("de:bgb");
  });

  test("makeParagraphId", () => {
    expect(makeParagraphId("DE", "BGB", "433")).toBe("de:bgb:p-433");
  });
});

// ── buildLegalKnowledgeGraph ──────────────────────────────────────────

describe("buildLegalKnowledgeGraph", () => {
  test("creates hierarchy nodes", () => {
    const graph = buildTestGraph();
    expect(graph.nodes.has("jur:de")).toBe(true);
    expect(graph.nodes.has("de:bgb")).toBe(true);
    expect(graph.nodes.has("de:bgb:p-433")).toBe(true);
    expect(graph.nodes.has("de:ao:p-12")).toBe(true);
    expect(graph.nodes.has("de:estg:p-1")).toBe(true);
  });

  test("creates contains edges for hierarchy", () => {
    const graph = buildTestGraph();
    const jurToStatute = graph.edges.filter(
      (e) => e.from === "jur:de" && e.to === "de:bgb" && e.type === "contains"
    );
    expect(jurToStatute.length).toBe(1);

    const statuteToPara = graph.edges.filter(
      (e) => e.from === "de:bgb" && e.to === "de:bgb:p-433" && e.type === "contains"
    );
    expect(statuteToPara.length).toBe(1);
  });

  test("creates within-statute reference edges", () => {
    const graph = buildTestGraph();
    const ref433to434 = graph.edges.find(
      (e) => e.from === "de:bgb:p-433" && e.to === "de:bgb:p-434" && e.type === "references"
    );
    expect(ref433to434).toBeDefined();
    expect(ref433to434!.context).toBeTruthy();
  });

  test("creates cross-statute reference edges", () => {
    const graph = buildTestGraph();
    // § 437 BGB references § 12 AO
    const crossRef = graph.edges.find(
      (e) => e.from === "de:bgb:p-437" && e.to === "de:ao:p-12" && e.type === "references"
    );
    expect(crossRef).toBeDefined();
    expect(crossRef!.weight).toBe(0.8); // Cross-statute is weaker

    // § 12 AO references § 1 EStG
    const crossRef2 = graph.edges.find(
      (e) => e.from === "de:ao:p-12" && e.to === "de:estg:p-1" && e.type === "references"
    );
    expect(crossRef2).toBeDefined();
  });

  test("creates subsection nodes for Abs.", () => {
    const graph = buildTestGraph();
    const subNode = graph.nodes.get("de:bgb:p-434:abs-1");
    expect(subNode).toBeDefined();
    expect(subNode!.type).toBe("subsection");
    expect(subNode!.subsection).toBe("abs-1");
  });

  test("builds adjacency lists", () => {
    const graph = buildTestGraph();
    expect(graph.adjacency.has("de:bgb:p-433")).toBe(true);
    const out433 = graph.adjacency.get("de:bgb:p-433")!;
    expect(out433.length).toBeGreaterThan(0);
  });

  test("builds reverse adjacency lists", () => {
    const graph = buildTestGraph();
    expect(graph.reverseAdjacency.has("de:bgb:p-434")).toBe(true);
    const in434 = graph.reverseAdjacency.get("de:bgb:p-434")!;
    expect(in434.length).toBeGreaterThan(0);
  });
});

// ── bfsTraversal ──────────────────────────────────────────────────────

describe("bfsTraversal", () => {
  test("traverses from a paragraph node", () => {
    const graph = buildTestGraph();
    const result = bfsTraversal(graph, "de:bgb:p-433", 2);
    expect(result.visited.includes("de:bgb:p-433")).toBe(true);
    expect(result.visited.includes("de:bgb:p-434")).toBe(true);
    expect(result.distances.get("de:bgb:p-434")).toBe(1);
  });

  test("respects maxDepth", () => {
    const graph = buildTestGraph();
    const result1 = bfsTraversal(graph, "de:bgb:p-433", 1);
    const result2 = bfsTraversal(graph, "de:bgb:p-433", 2);
    expect(result2.visited.length).toBeGreaterThanOrEqual(result1.visited.length);
  });

  test("returns paths", () => {
    const graph = buildTestGraph();
    const result = bfsTraversal(graph, "de:bgb:p-433", 2);
    const path = result.paths.get("de:bgb:p-434");
    expect(path).toBeDefined();
    expect(path![0]).toBe("de:bgb:p-433");
    expect(path![path!.length - 1]).toBe("de:bgb:p-434");
  });

  test("handles non-existent start node", () => {
    const graph = buildTestGraph();
    const result = bfsTraversal(graph, "non-existent", 2);
    expect(result.visited.length).toBe(0);
  });
});

// ── getReachableParagraphs ────────────────────────────────────────────

describe("getReachableParagraphs", () => {
  test("returns paragraphs sorted by distance", () => {
    const graph = buildTestGraph();
    const reachable = getReachableParagraphs(graph, "de:bgb:p-433", 2);
    expect(reachable.length).toBeGreaterThan(0);
    // First should be the start node (distance 0)
    expect(reachable[0].distance).toBe(0);
    // Subsequent should be sorted by distance
    for (let i = 1; i < reachable.length; i++) {
      expect(reachable[i].distance).toBeGreaterThanOrEqual(reachable[i - 1].distance);
    }
  });

  test("all results have slugs", () => {
    const graph = buildTestGraph();
    const reachable = getReachableParagraphs(graph, "de:bgb:p-433", 2);
    for (const r of reachable) {
      expect(r.slug).toBeTruthy();
      expect(r.label).toBeTruthy();
    }
  });

  test("finds cross-statute paragraphs within depth 2", () => {
    const graph = buildTestGraph();
    // § 437 BGB → § 12 AO (cross-statute, depth 1)
    const reachable = getReachableParagraphs(graph, "de:bgb:p-437", 2);
    const aoPara = reachable.find((r) => r.nodeId === "de:ao:p-12");
    expect(aoPara).toBeDefined();
    expect(aoPara!.distance).toBe(1);
  });
});

// ── computeGraphStats ─────────────────────────────────────────────────

describe("computeGraphStats", () => {
  test("computes graph statistics", () => {
    const graph = buildTestGraph();
    const stats = computeGraphStats(graph);
    expect(stats.total_nodes).toBeGreaterThan(0);
    expect(stats.total_edges).toBeGreaterThan(0);
    expect(stats.by_type.paragraph).toBeGreaterThan(0);
    expect(stats.by_type.statute).toBe(3);
    expect(stats.by_edge_type.contains).toBeGreaterThan(0);
    expect(stats.by_edge_type.references).toBeGreaterThan(0);
    expect(stats.by_jurisdiction.de).toBeGreaterThan(0);
    expect(stats.max_degree).toBeGreaterThan(0);
    expect(stats.avg_degree).toBeGreaterThan(0);
  });
});

// ── extractSubgraph ───────────────────────────────────────────────────

describe("extractSubgraph", () => {
  test("extracts subgraph centered on a node", () => {
    const graph = buildTestGraph();
    const sub = extractSubgraph(graph, "de:bgb:p-433", 1);
    expect(sub.nodes.length).toBeGreaterThan(0);
    expect(sub.edges.length).toBeGreaterThan(0);
    // All nodes should be within radius 1
    for (const node of sub.nodes) {
      expect(node.id).toBeTruthy();
    }
  });

  test("subgraph is smaller than full graph", () => {
    const graph = buildTestGraph();
    const sub = extractSubgraph(graph, "de:bgb:p-433", 1);
    expect(sub.nodes.length).toBeLessThan(graph.nodes.size);
  });
});
