/**
 * Tests for src/core/feature-flags.ts (v0.40 D23).
 *
 * Pin the default-on posture and the explicit-'false'-disables semantics.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { resetPgliteState } from './helpers/reset-pglite.ts';
import { isFederatedV2Enabled, FEDERATED_V2_CONFIG_KEY, FeatureFlags, FEATURE_FLAG_DEFAULTS } from '../src/core/feature-flags.ts';
import type { BrainEngine } from '../src/core/engine.ts';

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
}, 30000);

afterAll(async () => {
  await engine.disconnect();
});

beforeEach(async () => {
  await resetPgliteState(engine);
});

describe('isFederatedV2Enabled', () => {
  test('default (key unset) → enabled', async () => {
    expect(await isFederatedV2Enabled(engine)).toBe(true);
  });

  test('explicit "false" → disabled', async () => {
    await engine.setConfig(FEDERATED_V2_CONFIG_KEY, 'false');
    expect(await isFederatedV2Enabled(engine)).toBe(false);
  });

  test('explicit "true" → enabled', async () => {
    await engine.setConfig(FEDERATED_V2_CONFIG_KEY, 'true');
    expect(await isFederatedV2Enabled(engine)).toBe(true);
  });

  test('anything-not-literally-false → enabled (defensive default)', async () => {
    for (const v of ['False', 'FALSE', '0', 'off', 'no', '']) {
      await engine.setConfig(FEDERATED_V2_CONFIG_KEY, v);
      expect(await isFederatedV2Enabled(engine)).toBe(true);
    }
  });

  test('config key name is stable', () => {
    expect(FEDERATED_V2_CONFIG_KEY).toBe('sync.federated_v2');
  });
});

// ─── FeatureFlags class unit tests (mock-based, no DB) ────────────────

function mockEngine(configMap: Record<string, string | null>): BrainEngine {
  return {
    getConfig: async (key: string) => configMap[key] ?? null,
  } as unknown as BrainEngine;
}

describe('FeatureFlags class', () => {
  test('isEnabled returns default for missing key', async () => {
    const e = mockEngine({});
    const flags = new FeatureFlags(e);
    expect(await flags.isEnabled('relational_retrieval')).toBe(false);
    expect(await flags.isEnabled('sync.federated_v2')).toBe(true);
  });

  test('isEnabled respects "false" in DB', async () => {
    const e = mockEngine({ 'sync.federated_v2': 'false' });
    const flags = new FeatureFlags(e);
    expect(await flags.isEnabled('sync.federated_v2')).toBe(false);
  });

  test('isEnabled respects "true" in DB', async () => {
    const e = mockEngine({ 'relational_retrieval': 'true' });
    const flags = new FeatureFlags(e);
    expect(await flags.isEnabled('relational_retrieval')).toBe(true);
  });

  test('isEnabled returns false for unknown flag', async () => {
    const e = mockEngine({});
    const flags = new FeatureFlags(e);
    expect(await flags.isEnabled('nonexistent.flag')).toBe(false);
  });

  test('cache prevents repeated DB reads', async () => {
    let callCount = 0;
    const e = {
      getConfig: async () => { callCount++; return 'true'; },
    } as unknown as BrainEngine;
    const flags = new FeatureFlags(e, { cacheTtlMs: 10_000 });

    await flags.isEnabled('relational_retrieval');
    await flags.isEnabled('relational_retrieval');
    await flags.isEnabled('relational_retrieval');

    expect(callCount).toBe(1);
  });

  test('invalidate clears specific key cache', async () => {
    let callCount = 0;
    const e = {
      getConfig: async () => { callCount++; return 'true'; },
    } as unknown as BrainEngine;
    const flags = new FeatureFlags(e, { cacheTtlMs: 10_000 });

    await flags.isEnabled('relational_retrieval');
    flags.invalidate('relational_retrieval');
    await flags.isEnabled('relational_retrieval');

    expect(callCount).toBe(2);
  });

  test('invalidate() clears all cache entries', async () => {
    let callCount = 0;
    const e = {
      getConfig: async () => { callCount++; return 'true'; },
    } as unknown as BrainEngine;
    const flags = new FeatureFlags(e, { cacheTtlMs: 10_000 });

    await flags.isEnabled('relational_retrieval');
    await flags.isEnabled('sync.federated_v2');
    flags.invalidate();
    await flags.isEnabled('relational_retrieval');
    await flags.isEnabled('sync.federated_v2');

    expect(callCount).toBe(4);
  });

  test('static check works without instance', async () => {
    const e = mockEngine({ 'relational_retrieval': 'true' });
    expect(await FeatureFlags.check(e, 'relational_retrieval')).toBe(true);
  });

  test('static check returns default for missing key', async () => {
    const e = mockEngine({});
    expect(await FeatureFlags.check(e, 'sync.federated_v2')).toBe(true);
  });

  test('engine error falls back to default', async () => {
    const e = {
      getConfig: async () => { throw new Error('DB down'); },
    } as unknown as BrainEngine;
    const flags = new FeatureFlags(e);
    expect(await flags.isEnabled('sync.federated_v2')).toBe(true);
  });

  test('FEATURE_FLAG_DEFAULTS has expected keys', () => {
    expect('sync.federated_v2' in FEATURE_FLAG_DEFAULTS).toBe(true);
    expect('relational_retrieval' in FEATURE_FLAG_DEFAULTS).toBe(true);
  });
});
