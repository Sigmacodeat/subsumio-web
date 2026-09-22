# AGENTS.md

## Read this order

1. **CLAUDE.md** — orientation + resolver. North Star, two axes, architecture + cross-cutting invariants, the reference map pointing at on-demand docs, and the inline ship IRON RULES.
2. **skills/RESOLVER.md** — skill dispatcher. Read first for any task.
3. **INSTALL_FOR_AGENTS.md** — 9-step agent installation.
4. **llms.txt** — the web index of all docs (generated; `bun run build:llms` to refresh).
5. **docs/architecture/KEY_FILES.md** — per-file index for the repo: what each src/ file does + its load-bearing invariants.
6. **docs/TESTING.md** — test command tiers, the test-isolation lint, the canonical PGLite block.

## Trust boundary

- Server-side: full engine access (PGLite/Postgres)
- Client-side: MCP operations only (thin-client routing via `callRemoteTool`)

## Config / Debug / Migration Pointers

- Config: `gbrain config show`
- Debug: `gbrain doctor [--json] [--fast]`
- Migrations: `gbrain migrate --to <postgres|pglite>`
