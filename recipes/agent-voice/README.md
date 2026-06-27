# agent-voice — reference bundle

This directory is a **reference**, not a runtime gbrain dependency. The gbrain compiled binary does NOT load anything under `recipes/agent-voice/code/`, `recipes/agent-voice/skills/`, or `recipes/agent-voice/tests/`. Those exist to be COPIED into the operator's host agent repo via `gbrain integrations install agent-voice --target <host-repo>`.

## The paradigm

| Aspect                   | Legacy skillpack (`local-managed`) | Reference skillpack (`copy-into-host-repo`) |
| ------------------------ | ---------------------------------- | ------------------------------------------- |
| Where code lives         | `~/.gbrain/skills/<name>/`         | `<host-repo>/services/voice-agent/`         |
| Who owns edits           | gbrain (managed block)             | Operator (host repo)                        |
| Update path              | Overwrite or skip                  | Diff-and-propose against manifest hashes    |
| Resolver registration    | `~/.gbrain/skills/RESOLVER.md`     | `<host-repo>/RESOLVER.md` or `AGENTS.md`    |
| Identity of updates      | gbrain pushes                      | Operator pulls per release cadence          |
| Bisect / blame / history | gbrain's git history               | Operator's host repo git history            |

The `install_kind` discriminator in the recipe frontmatter routes between the two paths inside `gbrain integrations install`.

## Sibling-directory convention (for future copy-into-host-repo recipes)

This recipe pioneers the layout future copy-into-host-repo recipes should follow:

```
recipes/<name>.md                       # registered entrypoint (loader sees this)
recipes/<name>/
├── README.md                           # paradigm doc; gbrain-side only (not copied)
├── package.json                        # top-of-bundle; copied to <host>/services/<name>/package.json
├── code/                               # copied to <host>/services/<name>/code/
├── tests/                              # copied to <host>/services/<name>/tests/
│   ├── unit/
│   ├── e2e/
│   └── evals/
├── skills/                             # copied to <host>/skills/<skill-name>/
├── install/                            # gbrain-side only; install metadata
│   ├── manifest.json                   # src → target map + per-file SHA-256
│   ├── refresh-algorithm.md            # diff-and-propose semantics
│   └── post-install-hint.md            # next-step prompts for the install agent
└── docs/                               # any extra docs the operator should see post-install
```

Three rules for new recipes following this shape:

1. **Topology preservation.** Tests at `recipes/<name>/tests/unit/x.test.mjs` MUST import code via `../../code/...`. That relative path is preserved when copied to `<host>/services/<name>/tests/unit/x.test.mjs` → `<host>/services/<name>/code/...`. The installer is NOT in the business of rewriting imports.

2. **PII guard scope.** Every file under `recipes/<name>/` is scanned by `scripts/check-no-pii-in-agent-voice.sh` (or future equivalent), PLUS the top-level `recipes/<name>.md`. The single source of truth for the blocklist is a JSON file inside the bundle.

3. **`install_kind: copy-into-host-repo`** in frontmatter routes to the copy path. Without it, the recipe defaults to `local-managed` (legacy `~/.gbrain/skills/` install).

## Files (gbrain-side only — NOT copied to host)

- `README.md` — this doc.
- `install/manifest.json` — declares src → target paths + permissions; the install command computes SHA-256 at copy time.
- `install/refresh-algorithm.md` — the diff-and-propose contract.
- `install/post-install-hint.md` — what the install agent prints when copy completes.
- `code/lib/personas/private-name-blocklist.json` — privacy guard source of truth (read by the shipped guard script and by host-side prompt-shape tests).
- `code/lib/personas/context-builder.contract.md` — API the operator implements for live brain context.

## Files (in `bundle = code/ + tests/ + skills/ + package.json`) — copied to host repo

The install subcommand reads `install/manifest.json` and copies each listed file to its target path under the host repo. SHA-256s computed at copy time get persisted into `<host>/services/<name>/.gbrain-source.json` so `--refresh` can do three-way classification (unchanged-identical / unchanged-stale / locally-modified) without re-walking the entire bundle.

## Reading order

If you're new to this paradigm and want to understand the moving parts:

1. `recipes/agent-voice.md` — the registered recipe, top-level explainer + install steps.
2. This file — the paradigm + sibling-directory convention.
3. `install/manifest.json` — the literal src → target file map.
4. `install/refresh-algorithm.md` — what `--refresh` does and how to extend it.
5. `code/tools.mjs` — the load-bearing trust-boundary code (D14-A read-only allow-list).
6. `code/lib/personas/mars.mjs` + `code/lib/personas/venus.mjs` — the persona prompts.
7. `code/public/call.html` — the WebRTC client with `?test=1` instrumentation.
8. `code/server.mjs` — the minimal voice server.
