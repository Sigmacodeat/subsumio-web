# Subsumio

**The legal AI brain for law firms.** Subsumio is a knowledge-graph-powered legal intelligence platform that turns your firm's documents, cases, deadlines, and communications into a queryable brain. Synthesized answers with citations, deadline-aware retrieval, and contradiction detection — built for the realities of legal practice.

## What it does

- **Brain-first retrieval.** Upload documents, emails, and case files. Subsumio chunks, embeds, and indexes them in a knowledge graph with typed edges (case → person → deadline → document).
- **Synthesized answers.** Ask a question, get an answer with citations and gap analysis — not just a list of matching pages.
- **Deadline detection.** AI-powered extraction of absolute dates, relative deadlines, and statutory deadlines from documents and emails.
- **Case law sync.** Connector-based sync of public court decisions (AT, DE) with delta-sync deduplication.
- **beA integration.** Import and manage Austrian bar association (beA) messages.
- **DocuSign integration.** Send and track electronic signatures without leaving the dashboard.
- **DMS connectors.** iManage Work and NetDocuments support for document round-tripping.
- **Multi-tenant.** Each firm gets an isolated brain. Row-level security, scoped queries, zero cross-tenant leakage.
- **Mobile-ready.** PWA + native iOS/Android via Capacitor (push, biometric, share extension).

## Tech stack

- **Frontend:** Next.js 15, React 19, TypeScript, TailwindCSS, shadcn/ui
- **Engine:** Subsumio Engine (Postgres + pgvector, hybrid RAG search)
- **Auth:** Session-based with optional WorkOS SSO/SAML, TOTP 2FA
- **Billing:** Stripe (Pro + Team plans)
- **Mobile:** Capacitor (iOS + Android)

## Getting started

### Prerequisites

- Node 20+ and Bun
- A running Subsumio Engine instance (or use PGLite for local dev)

### Install

```bash
bun install
cp .env.example .env.local
# Fill in the required env vars (see .env.example for details)
bun dev
```

The app runs on `http://localhost:3000`.

### Environment variables

Key variables (see `.env.example` for the full list):

| Variable                     | Description                                      |
| ---------------------------- | ------------------------------------------------ |
| `SUBSUMIO_API_URL`           | Engine API URL (e.g. `http://localhost:3001`)    |
| `SUBSUMIO_WEB_API_KEY`       | Shared secret between web app and engine         |
| `SUBSUMIO_INTERNAL_SECRET`   | Service-to-service secret for internal API calls |
| `SUBSUMIO_ENCRYPTION_KEY`    | AES-256 key for at-rest encryption               |
| `SUBSUMIO_AUTH_DATABASE_URL` | Postgres URL for auth/usage store (prod)         |
| `AUTH_SECRET`                | HMAC secret for session tokens                   |
| `STRIPE_SECRET_KEY`          | Stripe API key for billing                       |

### Engine setup

The Subsumio Engine runs as a separate process:

```bash
subsumio init --pglite          # 2-second local brain (no Docker)
subsumio serve --http --port 3001
```

For production, use Postgres + pgvector. See `server/` for engine deployment guides.

## Project structure

```
src/
  app/              # Next.js app router (pages + API routes)
  components/        # React UI components
  content/           # Static content (docs, dashboard config)
  lib/               # Business logic, auth, engine client, integrations
server/              # Subsumio Engine (separate codebase)
mobile/              # Capacitor native app guide
word-addin/          # Microsoft Word Add-in
outlook-addin/       # Outlook Add-in
```

## Development

```bash
bun dev              # Start dev server
bun run lint         # ESLint
bun run typecheck    # TypeScript check
bun run test:unit    # Vitest unit tests
bun run test:e2e     # Playwright E2E tests
bun run format       # Prettier format
```

## License

MIT.
