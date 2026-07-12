-- ──────────────────────────────────────────────────────────────────────
-- Gap 4: Hierarchical Legal Knowledge Graph — typed edges table
--
-- Stores cross-statute and hierarchical reference edges between legal
-- nodes (jurisdiction → statute → paragraph → subsection).
-- Populated by the citation-graph importer + cross-statute detection.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subsumio_legal_graph_edges (
  id              SERIAL PRIMARY KEY,
  from_node_id    TEXT NOT NULL,          -- e.g. "de:bgb:p-433"
  to_node_id      TEXT NOT NULL,          -- e.g. "de:bgb:p-434"
  from_jurisdiction TEXT NOT NULL CHECK (from_jurisdiction IN ('de', 'at', 'ch', 'eu')), -- "de", "at", "ch", "eu"
  to_jurisdiction   TEXT NOT NULL CHECK (to_jurisdiction IN ('de', 'at', 'ch', 'eu')),
  from_statute    TEXT,                   -- "bgb"
  to_statute      TEXT,                   -- "bgb"
  from_paragraph  TEXT,                   -- "433"
  to_paragraph    TEXT,                   -- "434"
  edge_type       TEXT NOT NULL,          -- "references", "cites", "contains", "amends", "repeals", "implements"
  context         TEXT,                   -- surrounding text snippet
  weight          REAL NOT NULL DEFAULT 1.0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient traversal
CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON subsumio_legal_graph_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON subsumio_legal_graph_edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON subsumio_legal_graph_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_graph_edges_from_jur ON subsumio_legal_graph_edges(from_jurisdiction);
CREATE INDEX IF NOT EXISTS idx_graph_edges_to_jur ON subsumio_legal_graph_edges(to_jurisdiction);
CREATE INDEX IF NOT EXISTS idx_graph_edges_from_statute ON subsumio_legal_graph_edges(from_statute);
CREATE INDEX IF NOT EXISTS idx_graph_edges_cross_statute ON subsumio_legal_graph_edges
  WHERE from_statute IS DISTINCT FROM to_statute;

-- Unique constraint to prevent duplicate edges
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_edges_unique ON subsumio_legal_graph_edges(
  from_node_id, to_node_id, edge_type
);

-- ── Node registry ─────────────────────────────────────────────────────
-- Stores metadata about each node in the hierarchy.

CREATE TABLE IF NOT EXISTS subsumio_legal_graph_nodes (
  node_id         TEXT PRIMARY KEY,       -- e.g. "de:bgb:p-433"
  node_type       TEXT NOT NULL,          -- "jurisdiction", "statute", "paragraph", "subsection", "case"
  label           TEXT NOT NULL,          -- "§ 433 BGB"
  jurisdiction    TEXT NOT NULL CHECK (jurisdiction IN ('de', 'at', 'ch', 'eu')),
  statute         TEXT,
  paragraph       TEXT,
  subsection      TEXT,
  slug            TEXT,                   -- brain engine slug
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON subsumio_legal_graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_jur ON subsumio_legal_graph_nodes(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_statute ON subsumio_legal_graph_nodes(statute);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_slug ON subsumio_legal_graph_nodes(slug) WHERE slug IS NOT NULL;
