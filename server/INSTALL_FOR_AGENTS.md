# INSTALL_FOR_AGENTS.md

## 9-Step Agent Installation

1. **Clone**: `git clone <repo-url> && cd subsumio-web/server`
2. **Install**: `bun install`
3. **Init brain**: `bun run src/cli.ts init --pglite`
4. **Configure AI**: Set `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`) in `.env`
5. **Run migrations**: `bun run src/cli.ts apply-migrations`
6. **Verify**: `bun run src/cli.ts doctor --json`
7. **Start server**: `bun run dev` (port 3000)
8. **Import content**: `bun run src/cli.ts import ../content --no-embed`
9. **Embed**: `bun run src/cli.ts embed --all`

## Troubleshooting

- **PGLite errors**: Delete `~/.gbrain/pglite` and re-init
- **Migration failures**: `bun run src/cli.ts migrate --to pglite --force`
- **Embedding failures**: Check API key + model config via `gbrain config show`
