-- Migration 003: Legal Judgements Corpus — State-of-the-Art RAG Architecture
--
-- Tables: judgements, judgement_chunks, judgement_citations, judgement_treatments
-- Features: pgvector HNSW, tsvector BM25, citation graph, treatment tracking
--
-- Architecture based on:
-- - LegalGraphRAG (ACL 2026): Hierarchical legal graph (statutes → cases → commentary)
-- - LegalGPT (EMNLP 2026): GraphSAGE + citation proximity + BM25 hybrid retrieval
-- - Shepard's Citation Service: Treatment classification + "good law/bad law" validation
-- - UC Berkeley/Wolters Kluwer Capstone: 3-model LLM voting for treatment classification

-- pgvector extension (required for semantic search embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm for fuzzy text matching (Aktenzeichen, Gerichtsnamen)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- judgements: Core table for court decisions
-- ============================================================
CREATE TABLE IF NOT EXISTS subsumio_judgements (
  id              TEXT PRIMARY KEY,          -- ECLI or fallback ID (old-{id})
  ecli            TEXT UNIQUE,               -- European Case Law Identifier
  file_number     TEXT,                      -- Aktenzeichen (e.g. "I ZR 1/24")
  court           TEXT NOT NULL,             -- Gericht (e.g. "BGH", "BVerfG")
  court_level     TEXT,                      -- Hierarchy: supreme, appeals, district, specialized
  jurisdiction    TEXT NOT NULL DEFAULT 'de', -- de, at, ch, eu
  decision_date   DATE,                      -- Datum der Entscheidung
  decision_type   TEXT,                      -- Urteil, Beschluss, Verordnung, etc.
  legal_area      TEXT,                      -- Zivilrecht, Strafrecht, Öffentliches Recht, etc.
  title           TEXT NOT NULL,             -- Display title
  content         TEXT,                      -- Full text (HTML stripped)
  summary         TEXT,                      -- Leitsatz / Kurzzusammenfassung
  keywords        TEXT[],                    -- Schlagworte
  source          TEXT NOT NULL,             -- openlegaldata, ris-ogd, opencaselaw
  source_url      TEXT,                      -- Original URL
  content_hash    TEXT,                      -- For change detection
  language        TEXT NOT NULL DEFAULT 'de',

  -- Citation graph fields
  citation_count      INTEGER NOT NULL DEFAULT 0,  -- How many cases cite this one
  cited_by_count      INTEGER NOT NULL DEFAULT 0,  -- How many cases this one cites
  treatment_status    TEXT NOT NULL DEFAULT 'unknown', -- good_law, bad_law, at_risk, unknown
  treatment_summary   TEXT,                        -- LLM-generated explanation
  treatment_updated_at TIMESTAMPTZ,

  -- Sync metadata
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  embedded_at     TIMESTAMPTZ,

  -- Full-text search vector (BM25 equivalent in Postgres)
  search_vector   TSVECTOR
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_judgements_court ON subsumio_judgements(court);
CREATE INDEX IF NOT EXISTS idx_judgements_date ON subsumio_judgements(decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_judgements_legal_area ON subsumio_judgements(legal_area);
CREATE INDEX IF NOT EXISTS idx_judgements_jurisdiction ON subsumio_judgements(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_judgements_file_number_trgm ON subsumio_judgements USING GIN (file_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_judgements_court_trgm ON subsumio_judgements USING GIN (court gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_judgements_treatment ON subsumio_judgements(treatment_status);
CREATE INDEX IF NOT EXISTS idx_judgements_search_vector ON subsumio_judgements USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_judgements_keywords ON subsumio_judgements USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_judgements_source ON subsumio_judgements(source);

-- ============================================================
-- judgement_chunks: Chunked content with pgvector embeddings
-- ============================================================
-- Chunks are ~500-1000 tokens each, embedded for semantic search
-- This enables RAG retrieval: find relevant passages, not just whole documents
CREATE TABLE IF NOT EXISTS subsumio_judgement_chunks (
  id              SERIAL PRIMARY KEY,
  judgement_id    TEXT NOT NULL REFERENCES subsumio_judgements(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,
  chunk_text      TEXT NOT NULL,
  chunk_type      TEXT NOT NULL DEFAULT 'body', -- body, leitsatz, tenor, gruende
  embedding       vector(1024),                 -- pgvector embedding (1024-dim for multilingual models)
  embedding_model TEXT NOT NULL DEFAULT 'multilingual-e5-large',
  token_count     INTEGER,
  embedded_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jchunks_judgement_idx ON subsumio_judgement_chunks(judgement_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_jchunks_judgement ON subsumio_judgement_chunks(judgement_id);
CREATE INDEX IF NOT EXISTS idx_jchunks_embedding ON subsumio_judgement_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_jchunks_stale ON subsumio_judgement_chunks(judgement_id, chunk_index) WHERE embedding IS NULL;
CREATE INDEX IF NOT EXISTS idx_jchunks_type ON subsumio_judgement_chunks(chunk_type);

-- ============================================================
-- judgement_citations: Citation graph (case → case, case → statute)
-- ============================================================
-- This is the core of the GraphRAG architecture.
-- Edges represent citations found in the text of a citing judgement.
-- Each edge has a treatment classification (positive, negative, neutral).
CREATE TABLE IF NOT EXISTS subsumio_judgement_citations (
  id              SERIAL PRIMARY KEY,
  citing_id       TEXT NOT NULL REFERENCES subsumio_judgements(id) ON DELETE CASCADE,
  cited_id        TEXT REFERENCES subsumio_judgements(id) ON DELETE SET NULL, -- NULL if cited case not in corpus
  cited_reference TEXT NOT NULL,              -- Raw citation string as it appears in text (e.g. "BGH, Urteil vom 15.3.2024 - I ZR 1/24")
  cited_type      TEXT NOT NULL DEFAULT 'case', -- case, statute, commentary
  cited_statute   TEXT,                        -- For statute citations: e.g. "§ 433 BGB"
  treatment       TEXT NOT NULL DEFAULT 'unknown', -- positive, negative, neutral, distinguishing, overruled, unknown
  treatment_confidence REAL,                   -- 0.0-1.0 confidence from LLM classifier
  treatment_explanation TEXT,                  -- LLM-generated explanation
  context_snippet TEXT,                        -- Surrounding text where citation appears
  extracted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at    TIMESTAMPTZ,                 -- When LLM treatment classification was run

  CONSTRAINT chk_cited CHECK (cited_id IS NOT NULL OR cited_reference IS NOT NULL)
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_jcites_citing ON subsumio_judgement_citations(citing_id);
CREATE INDEX IF NOT EXISTS idx_jcites_cited ON subsumio_judgement_citations(cited_id);
CREATE INDEX IF NOT EXISTS idx_jcites_cited_ref_trgm ON subsumio_judgement_citations USING GIN (cited_reference gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jcites_treatment ON subsumio_judgement_citations(treatment);
CREATE INDEX IF NOT EXISTS idx_jcites_cited_type ON subsumio_judgement_citations(cited_type);
CREATE INDEX IF NOT EXISTS idx_jcites_cited_statute ON subsumio_judgement_citations(cited_statute);

-- ============================================================
-- judgement_treatments: Aggregated treatment history per case
-- ============================================================
-- This is the "Shepard's Signal" equivalent.
-- Aggregated from judgement_citations to provide at-a-glance good/bad law status.
CREATE TABLE IF NOT EXISTS subsumio_judgement_treatments (
  judgement_id        TEXT PRIMARY KEY REFERENCES subsumio_judgements(id) ON DELETE CASCADE,
  overall_status      TEXT NOT NULL DEFAULT 'unknown', -- good_law, bad_law, at_risk, mixed, unknown
  positive_count      INTEGER NOT NULL DEFAULT 0,
  negative_count      INTEGER NOT NULL DEFAULT 0,
  neutral_count       INTEGER NOT NULL DEFAULT 0,
  distinguishing_count INTEGER NOT NULL DEFAULT 0,
  overruled_count     INTEGER NOT NULL DEFAULT 0,
  unknown_count       INTEGER NOT NULL DEFAULT 0,
  total_citations     INTEGER NOT NULL DEFAULT 0,
  time_weighted_score REAL,                   -- Time-decayed score: recent citations weigh more
  court_hierarchy     JSONB,                  -- Breakdown by court level: {"supreme": {"positive": 5, "negative": 1}, ...}
  at_risk_reasons     TEXT[],                 -- List of reasons why this case may be at risk
  last_citation_date  DATE,                   -- Most recent citation date
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jtreat_status ON subsumio_judgement_treatments(overall_status);
CREATE INDEX IF NOT EXISTS idx_jtreat_score ON subsumio_judgement_treatments(time_weighted_score DESC);

-- ============================================================
-- judgement_sync_state: Track import/sync progress
-- ============================================================
CREATE TABLE IF NOT EXISTS subsumio_judgement_sync_state (
  source          TEXT PRIMARY KEY,           -- openlegaldata, ris-ogd, opencaselaw
  last_sync_at    TIMESTAMPTZ,
  last_cursor     TEXT,                       -- Pagination cursor or date watermark
  total_imported  INTEGER NOT NULL DEFAULT 0,
  total_embedded  INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'idle' -- idle, running, completed, error
);

-- ============================================================
-- Triggers: Auto-update search_vector and treatment_status
-- ============================================================

-- Auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION subsumio_judgement_search_vector_fn() RETURNS trigger AS $func$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('german', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(NEW.content, '')), 'B') ||
    setweight(to_tsvector('german', coalesce(NEW.summary, '')), 'C') ||
    setweight(to_tsvector('german', coalesce(array_to_string(NEW.keywords, ' '), '')), 'C');
  NEW.updated_at := now();
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subsumio_judgement_search_vector_trg ON subsumio_judgements;
CREATE TRIGGER subsumio_judgement_search_vector_trg
  BEFORE INSERT OR UPDATE ON subsumio_judgements
  FOR EACH ROW
  EXECUTE FUNCTION subsumio_judgement_search_vector_fn();

-- Auto-update citation_count on citation INSERT
CREATE OR REPLACE FUNCTION subsumio_judgement_citation_count_fn() RETURNS trigger AS $func$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE subsumio_judgements SET citation_count = citation_count + 1 WHERE id = NEW.cited_id;
    UPDATE subsumio_judgements SET cited_by_count = cited_by_count + 1 WHERE id = NEW.citing_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE subsumio_judgements SET citation_count = GREATEST(citation_count - 1, 0) WHERE id = OLD.cited_id;
    UPDATE subsumio_judgements SET cited_by_count = GREATEST(cited_by_count - 1, 0) WHERE id = OLD.citing_id;
  END IF;
  RETURN NULL;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subsumio_judgement_citation_count_trg ON subsumio_judgement_citations;
CREATE TRIGGER subsumio_judgement_citation_count_trg
  AFTER INSERT OR DELETE ON subsumio_judgement_citations
  FOR EACH ROW
  EXECUTE FUNCTION subsumio_judgement_citation_count_fn();
