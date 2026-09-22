# Subsumio Engine (gbrain)

**Give the agent you already use a memory you control.** Search gives you raw pages. GBrain gives you the answer.

The Subsumio Engine is a fork of [gbrain](https://github.com/garrytan/gbrain), the
production brain behind Garry Tan's OpenClaw and Hermes deployments — a corpus of
**155,795 pages, 24,589 people, 5,340 companies** running 66 autonomous cron jobs.
The fork keeps the engine's functional identifiers (`gbrain` CLI, `GBRAIN_*` env
vars, `.gbrain-*` dotfiles) and specializes the platform for the legal vertical.

## What the engine adds over retrieval

- **Synthesis, not a hit list.** Synthesized, well-cited prose across people,
  companies, deals, and ideas — plus an explicit note on what the brain does
  _not_ know yet.
- **A self-wiring knowledge graph.** Every page write extracts entity refs and
  creates typed edges (`attended`, `works_at`, `invested_in`, `founded`,
  `advises`) with zero LLM calls. Benchmarked at **P@5 49.1%, R@5 97.9%** on the
  rich-prose corpus, +31.4 points P@5 over its graph-disabled variant.
- **Multi-brain, multi-source topology.** Brains are separate databases; sources
  are repos inside a brain. Both route through the same six-tier resolution —
  see `docs/architecture/brains-and-sources.md`.
- **Engine parity.** PGLite (embedded Postgres via WASM, zero-config) and
  Postgres + pgvector move in lockstep, pinned by engine-parity tests.

## Install

Requires **Bun 1.3.11+**. See `INSTALL_FOR_AGENTS.md` for the 9-step agent
installation; the short path:

```bash
cd server
bun install
bun run src/cli.ts init --pglite
bun run src/cli.ts doctor --json
```

## Documentation map

- `AGENTS.md` — read order + pointers for agents working in this repo.
- `CLAUDE.md` — orientation, North Star, cross-cutting invariants.
- `skills/RESOLVER.md` — skill dispatcher.
- `docs/architecture/KEY_FILES.md` — per-file index with load-bearing invariants.
- `docs/TESTING.md` — test tiers, isolation lint, canonical PGLite block.
- `llms.txt` — the web index of all docs (`bun run build:llms` to refresh).
- `CHANGELOG.md` — release history.
