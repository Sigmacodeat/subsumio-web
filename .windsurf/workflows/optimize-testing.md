---
description: Optimiere Test-Strategie und Coverage nach Agency-Level Standards
---

# Testing Strategy Optimization

## Scope

- `tests/e2e/` — E2E Smoke Tests (MJS)
- `tests/e2e-playwright/` — Playwright E2E Tests (a11y, accessibility, auth-flow)
- `tests/heavy/` — Heavy Tests (Fixtures, RSS Measurement, Build Scripts)
- `server/test/` — Server Unit + E2E Tests (1287 Module)
- `src/lib/*.test.ts` — Frontend Unit Tests
- `src/test/` — Frontend Test Setup
- `vitest.config.ts` — Vitest Configuration
- `playwright.config.ts` — Playwright Configuration

## Test-Tiers

1. **Unit Tests** (Vitest) — `*.test.ts` neben Source — Pure Logic, Mocked Dependencies
2. **Integration Tests** (Vitest) — API Routes mit Mocked Engine
3. **E2E Tests** (Playwright) — Full Browser Flow, Real API
4. **Heavy Tests** — Performance, Memory, Large Datasets
5. **Server E2E** — Real Postgres + pgvector Container

## Kontext laden

1. Lese `vitest.config.ts` für Vitest Setup
2. Lese `playwright.config.ts` für Playwright Setup
3. Lese `server/docs/TESTING.md` für Server Test-Strategie
4. Lese `tests/e2e-playwright/` für bestehende E2E Tests
5. Lese `tests/heavy/README.md` für Heavy Test Setup

## Optimierungs-Checkliste

- [ ] **Coverage**: >80% für Business Logic, >60% für UI
- [ ] **Unit Tests**: Jede Public Function hat Tests (Happy + Error + Edge Case)
- [ ] **Integration Tests**: Jede API Route hat mindestens einen Test
- [ ] **E2E Tests**: Critical User Flows (Login, Case Create, Deadline, Drafting)
- [ ] **Accessibility Tests**: axe-core via Playwright
- [ ] **Performance Tests**: Lighthouse CI, Core Web Vitals
- [ ] **Visual Regression**: Screenshot Comparison bei UI-Changes
- [ ] **Test Isolation**: Keine Test-Abhängigkeiten, DB-Reset zwischen Tests
- [ ] **Mock Strategy**: MSW für API Mocking, vi.mock für Module Mocking
- [ ] **Fixtures**: Wiederverwendbare Test-Data Fixtures
- [ ] **CI Integration**: Tests laufen bei jedem PR

## Test-Befehle

```bash
# Frontend Unit Tests
npx vitest run

# Frontend Watch Mode
npx vitest

# Playwright E2E
npx playwright test

# Playwright UI Mode
npx playwright test --ui

# Playwright Specific File
npx playwright test tests/e2e-playwright/auth-flow.spec.ts

# Server Unit Tests
cd server && bun test

# Server E2E (mit Postgres Container)
cd server && bun run test:e2e

# Full CI Gate
cd server && bun run ci:local

# Coverage Report
npx vitest run --coverage
```

## Agency-Level Standards

- **AAA Pattern**: Arrange → Act → Assert
- **Test Names**: `describe('Module') → it('should do X when Y')`
- **Factories**: `makeCase()`, `makeDeadline()`, `makeUser()` für Test-Data
- **Assertions**: `expect(result).toEqual(expected)` — deep equality
- **Error Tests**: `expect(() => fn()).toThrow(SpecificError)`
- **Async Tests**: `await expect(fn()).resolves.toEqual(...)` oder `rejects.toThrow(...)`
- **Setup/Teardown**: `beforeEach` für DB-Reset, `afterAll` für Cleanup
- **Snapshots**: Nur für stabile UI-Output, nicht für volatile Data
