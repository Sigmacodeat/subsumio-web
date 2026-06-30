import type { Pool } from "pg";

let schemaInitialized: Promise<void> | null = null;

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS subsumio_judgements (
  id              TEXT PRIMARY KEY,
  ecli            TEXT UNIQUE,
  file_number     TEXT,
  court           TEXT NOT NULL,
  court_level     TEXT,
  jurisdiction    TEXT NOT NULL DEFAULT 'de',
  decision_date   DATE,
  decision_type   TEXT,
  legal_area      TEXT,
  title           TEXT NOT NULL,
  content         TEXT,
  summary         TEXT,
  keywords        TEXT[],
  source          TEXT NOT NULL,
  source_url      TEXT,
  content_hash    TEXT,
  language        TEXT NOT NULL DEFAULT 'de',
  citation_count      INTEGER NOT NULL DEFAULT 0,
  cited_by_count      INTEGER NOT NULL DEFAULT 0,
  treatment_status    TEXT NOT NULL DEFAULT 'unknown',
  treatment_summary   TEXT,
  treatment_updated_at TIMESTAMPTZ,
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  embedded_at     TIMESTAMPTZ,
  search_vector   TSVECTOR
);

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

CREATE TABLE IF NOT EXISTS subsumio_judgement_chunks (
  id              SERIAL PRIMARY KEY,
  judgement_id    TEXT NOT NULL REFERENCES subsumio_judgements(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,
  chunk_text      TEXT NOT NULL,
  chunk_type      TEXT NOT NULL DEFAULT 'body',
  embedding       vector(1024),
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

CREATE TABLE IF NOT EXISTS subsumio_judgement_citations (
  id              SERIAL PRIMARY KEY,
  citing_id       TEXT NOT NULL REFERENCES subsumio_judgements(id) ON DELETE CASCADE,
  cited_id        TEXT REFERENCES subsumio_judgements(id) ON DELETE SET NULL,
  cited_reference TEXT NOT NULL,
  cited_type      TEXT NOT NULL DEFAULT 'case',
  cited_statute   TEXT,
  treatment       TEXT NOT NULL DEFAULT 'unknown',
  treatment_confidence REAL,
  treatment_explanation TEXT,
  context_snippet TEXT,
  extracted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at    TIMESTAMPTZ,
  CONSTRAINT chk_cited CHECK (cited_id IS NOT NULL OR cited_reference IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_jcites_citing ON subsumio_judgement_citations(citing_id);
CREATE INDEX IF NOT EXISTS idx_jcites_cited ON subsumio_judgement_citations(cited_id);
CREATE INDEX IF NOT EXISTS idx_jcites_cited_ref_trgm ON subsumio_judgement_citations USING GIN (cited_reference gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jcites_treatment ON subsumio_judgement_citations(treatment);
CREATE INDEX IF NOT EXISTS idx_jcites_cited_type ON subsumio_judgement_citations(cited_type);
CREATE INDEX IF NOT EXISTS idx_jcites_cited_statute ON subsumio_judgement_citations(cited_statute);

CREATE TABLE IF NOT EXISTS subsumio_judgement_treatments (
  judgement_id        TEXT PRIMARY KEY REFERENCES subsumio_judgements(id) ON DELETE CASCADE,
  overall_status      TEXT NOT NULL DEFAULT 'unknown',
  positive_count      INTEGER NOT NULL DEFAULT 0,
  negative_count      INTEGER NOT NULL DEFAULT 0,
  neutral_count       INTEGER NOT NULL DEFAULT 0,
  distinguishing_count INTEGER NOT NULL DEFAULT 0,
  overruled_count     INTEGER NOT NULL DEFAULT 0,
  unknown_count       INTEGER NOT NULL DEFAULT 0,
  total_citations     INTEGER NOT NULL DEFAULT 0,
  time_weighted_score REAL,
  court_hierarchy     JSONB,
  at_risk_reasons     TEXT[],
  last_citation_date  DATE,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jtreat_status ON subsumio_judgement_treatments(overall_status);
CREATE INDEX IF NOT EXISTS idx_jtreat_score ON subsumio_judgement_treatments(time_weighted_score DESC);

CREATE TABLE IF NOT EXISTS subsumio_judgement_sync_state (
  source          TEXT PRIMARY KEY,
  last_sync_at    TIMESTAMPTZ,
  last_cursor     TEXT,
  total_imported  INTEGER NOT NULL DEFAULT 0,
  total_embedded  INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'idle'
);

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
`;

export function ensureLegalGraphSchema(pool: Pool): Promise<void> {
  if (!schemaInitialized) {
    schemaInitialized = (async () => {
      await pool.query(SCHEMA_SQL);
    })();
  }
  return schemaInitialized;
}
