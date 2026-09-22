# CHANGELOG.md

## v0.48.0 — Legal Metadata Filters + FTS German Config

### Added

- v118 migration: `fts_config_german` — switched all `to_tsvector` from 'english' to 'german'
- v0.48 legal metadata filters: court, legal_area, decision_date range
- KNOBS_HASH_VERSION bumped 14→15 for legal metadata filter cache isolation
- PGLite bootstrap: chunk_search_vector_trigger now installed during forward-reference bootstrap

### Fixed

- PGLite search test isolation: beforeAll hooks wiped by sibling beforeEach(truncateAll)
- Thin-client routing audit: quote-agnostic regex tests for Prettier-normalized strings
- Migration v0_13 test: quote-agnostic subprocess call assertions
- Migration v0_21 test: updated to_tsvector expectations from 'english' to 'german'

### To take advantage of v0.48

- Run `gbrain apply-migrations` to get the German FTS config + legal metadata columns
- Clear search cache (KNOBS_HASH_VERSION bump invalidates stale entries)
