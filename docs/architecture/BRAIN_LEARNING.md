# Kanzlei-Gehirn lernt mit

Firm-wide setting that decides whether a firm's own knowledge base is extended
**automatically** from its ongoing work. Default: **on**. Only firm admins can change
it; every change is audit-logged (`settings.brain_learning`).

Nothing here is model training. No AI model is trained or fine-tuned on firm data,
with the setting on or off, and nothing leaves the firm: everything derived stays in
the firm's own brain (engine source).

## Where the setting lives

| What                  | Where                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source of truth (web) | `Org.brainLearning` for teams, `User.brainLearning` for a lawyer working alone (`src/lib/auth/store.ts`). `undefined` = on. Helpers in `src/lib/brain-learning.ts`.                 |
| Read / change         | `GET/PATCH /api/settings/brain-learning` (`src/app/api/settings/brain-learning/route.ts`). PATCH: `settings.write` (admin-only) + explicit role check; refused in support sessions. |
| UI                    | Card on the firm profile page (`src/components/dashboard/brain-learning-card.tsx`, rendered in `src/app/dashboard/settings/kanzlei/page.tsx`). Non-admins see it read-only.         |
| Engine copy           | `sources.config.learning_disabled` on the firm's source row (`server/src/core/brain-learning.ts`).                                                                                  |

The engine gets the value only from the web server, never from a browser:

1. **On change.** The PATCH route first calls `PUT /api/brain/learning` on the engine
   with the firm's own server-built headers (`x-subsumio-source` = the firm's brain,
   API key). Only if the engine accepted it does the web store the new value. The
   engine refuses `default` and shared `law-*` sources.
2. **Every night.** `GET /api/cron/dream-cycle` sends the complete list of switched-off
   firms (`learningDisabledBrainIds()`) to `POST /api/admin/dream`. The engine
   reconciles its flags to that list (flags listed firms, clears all others) before the
   cycle runs, so a lost single update heals within a day.

Both engine endpoints sit behind the web API key guard (`app.use("/api", guard)`).

## What the switch controls

When **off**, the following no longer happens for that firm:

| Learning step                                                                                                                                                                                                                                                                   | Enforced at                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nightly learning phases: facts → assessments (consolidate), proposed and graded assessments (propose/grade takes), case↔statute linking, commentaries from linked cases, conversation-fact backfill, thin-page enrichment, memory strength (engram maturation, reconsolidation) | `runCycle` in `server/src/core/cycle.ts` builds the exclude set from the persisted flags plus the caller's list and passes it to every phase in `LEARNING_PHASES` (`server/src/core/brain-learning.ts`); a cycle scoped to a switched-off source drops those phases and reports them as `skipped / learning_disabled`. Per-phase filters: `cycle/phases/consolidate.ts`, `cycle/propose-takes.ts`, `cycle/grade-takes.ts`, `cycle/legal-phases.ts` (precedent linkage), `cycle/commentary-synthesis.ts`, `cycle/conversation-facts-backfill.ts`, `cycle/enrich-thin.ts`, `cycle/engram-maturation.ts`, `cycle/reconsolidation-sweep.ts`. |
| Post-upload consolidation (facts from a new document promoted to assessments within seconds) — every upload path: dashboard, direct upload, e-mail filing, portal, connectors                                                                                                   | `consolidate-incremental` job returns `learning_disabled` (`server/src/core/minions/handlers/consolidate-incremental.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Automatic fact extraction when a note, e-mail or meeting page is written                                                                                                                                                                                                        | `runFactsBackstop` returns `skipped: learning_disabled` (`server/src/core/facts/backstop.ts`) — covers `put_page` and sync.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Assistant memories captured automatically from conversations                                                                                                                                                                                                                    | `POST /api/copilot/memory` refuses `infer`, `agent_action` and non-manual `create` (`src/app/api/copilot/memory/route.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Suggested playbook additions from signed contracts                                                                                                                                                                                                                              | `GET /api/cron/auto-playbook` skips the firm (`src/app/api/cron/auto-playbook/route.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## What keeps running when off

- **Storage and search.** Uploads are stored, text-extracted, chunked and embedded at
  upload time (`runExtractionAndImport`, `server/src/commands/web-api.ts`); the nightly
  `embed` phase still fills in missing vectors. Search and the assistant work as
  before.
- **Manual entries.** Memories a person types in on purpose (`source: user_explicit`)
  are saved; existing memories can be viewed and deleted on
  `/dashboard/settings/memory`.
- **Housekeeping and monitoring phases** of the nightly cycle: `embed`, `orphans`,
  `purge`, `lint`, `backlinks`, `sync`, `extract`, `resolve_symbol_edges`,
  `schema-suggest`, `recompute_emotional_weight` (ranking weight from tags), statute
  currency, deadline monitor, case progression.
- **Work the firm asks for.** Document analysis after upload (Aktencheck pipeline),
  drafts, briefings, deadline alerts, the autonomous task queue, case scanner and
  contradiction checks produce work results for the firm; they are not governed by
  this setting.
- **Answer ratings.** Thumbs up/down (`src/lib/answer-feedback.ts`) and retrieval
  feedback (`src/lib/retrieval-feedback.ts`) are stored for quality review. Neither
  is used to adapt a firm's ranking or answers, with the setting on or off.
- **Already learned knowledge** stays in the firm's brain; switching off stops new
  derivation, it does not delete.

## Never done

- No training or fine-tuning of any AI model on firm data.
- Nothing derived from one firm is written into another firm's brain because of this
  setting; derivation runs inside the firm's own source.
- The browser never sets or overrides the flag the engine acts on.

## Tests

- Web: `src/app/api/settings/brain-learning/route.test.ts`, `src/lib/brain-learning.test.ts`,
  `src/app/api/cron/dream-cycle/route.test.ts`, `src/app/api/cron/auto-playbook/route.test.ts`,
  `src/app/api/copilot/memory/route.test.ts`.
- Engine: `server/test/brain-learning.test.ts` (flag persistence + reconcile, consolidate
  full/incremental, facts backstop, consolidate-incremental job, `runCycle` scoped and
  brain-wide).
