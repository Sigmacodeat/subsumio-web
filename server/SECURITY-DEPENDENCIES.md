# Dependency Security Posture (Engine)

Last reviewed: 2026-06-28. Run `bun audit` to reproduce.

A dependency-hardening pass took the engine from **30 advisories (6 high, 23
moderate, 1 low)** down to **3 (2 high, 1 moderate)**. The remaining three are
transitive findings with no clean upgrade path; each is either mitigated at
runtime or has near-zero real exposure. They are documented here so the residual
risk is an explicit, auditable decision rather than silent debt.

## Fixed in this pass

| Package                      | Severity               | Fix                                                               |
| ---------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `marked` 18.0.0–18.0.1       | high (ReDoS/OOM)       | bumped to `^18.0.5`                                               |
| `js-yaml` (direct) ≤4.1.1    | moderate (DoS)         | bumped to `^4.3.0`; `safeLoad` → `load` in `src/core/markdown.ts` |
| `hono` <4.12.18              | high + moderate        | `overrides.hono = ^4.12.18`                                       |
| `form-data` <4.0.6           | high (CRLF injection)  | `overrides.form-data = ^4.0.6`                                    |
| `fast-xml-parser`            | moderate (injection)   | `overrides.fast-xml-parser = ^5.9.3`                              |
| `qs` ≤6.15.1                 | moderate (DoS)         | `overrides.qs = ^6.15.3`                                          |
| `@hono/node-server` <1.19.13 | moderate (path bypass) | `overrides.@hono/node-server = ^1.19.13`                          |
| `ip-address` ≤10.1.0         | moderate (XSS)         | `overrides.ip-address = ^10.2.0`                                  |

## Accepted / mitigated (still flagged by `bun audit`)

### 1. `js-yaml` (moderate) — via `gray-matter`

- **Why it can't be removed:** `gray-matter@4.0.3` is the latest release and
  hard-binds the v3 API at module-load time
  (`gray-matter/lib/engines.js`: `yaml.safeLoad.bind(yaml)`). Forcing js-yaml v4
  onto gray-matter crashes it on import (`safeLoad` is `undefined` in v4).
- **Mitigation (effective):** Every gray-matter call in the engine is routed
  through `src/core/yaml-matter.ts`, which injects the project's patched
  js-yaml@4.3.0 as gray-matter's `engines.yaml`. All five former
  `import ... from "gray-matter"` sites now import this wrapper, so frontmatter
  parsing on the full ingestion path (including untrusted portal uploads) uses
  the patched parser. The vulnerable v3 code path is unreachable at runtime.
- **Revisit trigger:** a gray-matter release that bumps the bundled js-yaml, OR
  any new direct `import ... from "gray-matter"` (must use the wrapper instead).

### 2. `fast-uri` (high ×2) — via `@modelcontextprotocol/sdk › ajv`

- **Why it can't be removed:** `ajv` pins `fast-uri@^3.0.1`; the only patched
  release is `fast-uri@4.0.0`, a major that violates ajv's range and risks
  silently breaking JSON-schema validation (the security-critical MCP tool-input
  layer).
- **Real exposure (near-zero):** ajv uses fast-uri for `format: "uri"`
  validation and `$ref` resolution. The advisories (host confusion / path
  traversal in URI parsing) only translate to impact when the parsed URI drives a
  security decision or resolves an untrusted remote `$ref`. MCP tool schemas do
  neither — ajv returns a boolean and acts on nothing.
- **Revisit trigger:** an `@modelcontextprotocol/sdk` / `ajv` release that moves
  to `fast-uri@^4`.

## Web app

`npm audit` → 0. `bun audit` → 1 low (`elliptic` via `@storybook/nextjs`), a
build-time devDependency that never ships to the production runtime.
