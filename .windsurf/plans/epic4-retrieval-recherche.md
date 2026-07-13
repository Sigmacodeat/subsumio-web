# EPIC 4 — Retrieval und juristische Recherche auf Frontier-Niveau

## Blueprint

### Ziel

Frontier-Level juristische Recherche: Source Router, Citation Identity Resolver, Precedent Treatment, Context Builder und Firm Knowledge — alle produktionsreif, ohne Mocks.

### Bestand (was existiert)

- **Source Routing**: `web-api.ts` `readSourcesFor()` mit Case > User > Fail-closed Jurisdiction. `query-planner.ts` mit sub-query source_type routing. `agentic-retrieval.ts` mit multi-round completeness check. `concept-map.ts` mit §-hints. `legal-query-expand.ts` mit Synonymen.
- **Citations**: `citations.ts` mit BGH/BVerfG/ECLI patterns, `STATUTE_JURISDICTION_MAP` für Kollisionen, `resolveCitationToJudgement()` mit fuzzy matching.
- **Treatment**: `validation.ts` mit 6 Treatment labels, `aggregateTreatments()` mit time-weight + court hierarchy, heuristic + LLM classification.
- **Context**: `gather.ts` mit mode-based limits, `matter-context.ts` mit MatterContextBundle.
- **Firm Knowledge**: `ethical-wall.ts`, `permission-aware-retrieval.test.ts` mit org/brain/matter/user/ethical-wall isolation.

### Gaps (was gebaut wird)

#### T4.1 Source Router v2

1. **Source-type-aware routing**: `source-router.ts` — klassifiziert Intent + mappt auf Source Types (statute, judgement, materials, admin_practice, firm_knowledge)
2. **Stichtag**: Zeitpunktbewusste Suche — `asOfDate` Parameter in search opts, filtert Gesetzesstände
3. **Jurisdiction clarification**: `clarifyJurisdiction()` — bei unsicherer Jurisdiktion (Kollisionserkennung via `hasStatuteCollision`)

#### T4.2 Citation Identity Resolver

1. **OGH/GZ/EuGH patterns**: Erweitere `citations.ts` um österreichische (OGH, GZ) und EuGH patterns
2. **Structured parser**: `CitationIdentity` type mit deterministischen Feldern (court, date, file_number, ecli, gz)
3. **Deterministic verification**: `verifyCitationIdentity()` — cross-referencing metadata statt nur fuzzy match
4. **Collision tests**: `citations.collision.test.ts` — ABGB/BGB, KSchG DE vs AT, StGB/ZPO multi-jurisdiction

#### T4.3 Precedent Treatment

1. **"eingeschränkt" label**: Erweitere `TreatmentLabel` um "limited" (eingeschränkt)
2. **Active negative authority search**: `findNegativeAuthority()` — gezielte Suche nach Gegenjudikatur
3. **Bad-law signal propagation**: Treatment-Status in retrieval results mit explanation

#### T4.4 Context Builder

1. **Claim extraction**: `extractClaims()` — zerlegt Query in einzelne rechtliche Behauptungen
2. **Evidence bundles**: `buildEvidenceBundle()` — pro-Claim Kontext mit Source-Diversität
3. **Token budget**: `allocateTokenBudget()` — pro-Claim Token-Verwaltung
4. **Explain mode**: `ExplainMode` mit Quellenrang, Ausschlussgründen

#### T4.5 Firm Knowledge

1. **Firm knowledge search**: `firm-knowledge-search.ts` — permission-aware Suche über Matters, Memos, Playbooks
2. **Golden examples**: `GoldenExample` type mit curated flag, getrennte Behandlung in ranking
3. **Need-to-know enforcement**: Erweitert ethical-wall um matter-scope + need-to-know principle

### Definition of Done

- Alle 5 Tasks implementiert und getestet
- TypeScript: 0 errors
- Tests: alle neu geschriebenen Tests pass
- Keine Mocks, keine Platzhalter
- Edge-Cases getestet (leere Daten, Kollisionen, falsche Jurisdiktion)
