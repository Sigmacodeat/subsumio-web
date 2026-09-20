/**
 * Run a callback with `process.env` mutations applied, then restore the prior
 * values via try/finally. The canonical pattern for env-touching tests in this
 * repo.
 *
 * Why this exists: `process.env` is process-global. Tests that mutate it
 * leak state across files in the same bun test process (the parallel runner
 * loads multiple files into one process per shard). `withEnv` saves the
 * prior value of every key it touches, runs the callback, and restores via
 * try/finally — including when the callback throws.
 *
 * Important caveat: `withEnv` is cross-test-safe but NOT intra-file
 * concurrent-safe. Two `test.concurrent()` calls in the same file both
 * calling withEnv on the same key will race — the global is only one
 * variable. Files that mutate env stay outside the `test.concurrent()`
 * codemod's eligibility filter (the `*.serial.test.ts` quarantine + the
 * codemod's `grep -L "process\.env\."` exclusion handle this).
 *
 * Use:
 *   import { withEnv } from './helpers/with-env.ts';
 *
 *   test('reads OPENAI_API_KEY', async () => {
 *     await withEnv({ OPENAI_API_KEY: 'sk-test' }, async () => {
 *       expect(loadConfig().openai_key).toBe('sk-test');
 *     });
 *   });
 *
 *   // Delete a var (override is undefined):
 *   await withEnv({ GBRAIN_HOME: undefined }, async () => {
 *     expect(process.env.GBRAIN_HOME).toBeUndefined();
 *   });
 *
 *   // Multiple keys:
 *   await withEnv({ A: '1', B: '2', C: undefined }, fn);
 *
 *   // Nested compose: inner restores to outer's value, not original.
 *   await withEnv({ K: 'outer' }, async () => {
 *     await withEnv({ K: 'inner' }, async () => {
 *       expect(process.env.K).toBe('inner');
 *     });
 *     expect(process.env.K).toBe('outer');
 *   });
 */
export async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T | Promise<T>
): Promise<T> {
  const keys = Object.keys(overrides);
  const prior: Record<string, string | undefined> = {};
  for (const key of keys) {
    prior[key] = process.env[key];
  }
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

/**
 * File-scoped variant of {@link withEnv} for suites whose whole setup needs a
 * variable — a server mounted in `beforeAll`, for instance. `withEnv` cannot
 * wrap a lifecycle hook, and hand-rolled save/restore in `beforeAll`/`afterAll`
 * is what the isolation lint flags, because a thrown setup leaks the value into
 * every later file of the same process.
 *
 * Use:
 *   let release: (() => void) | undefined;
 *   beforeAll(() => { release = setEnvForFile({ API_KEY: "test" }); });
 *   afterAll(() => release?.());
 */
export function setEnvForFile(overrides: Record<string, string | undefined>): () => void {
  const prior: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    prior[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  let released = false;
  return () => {
    // Idempotent: a second call (afterAll plus an explicit release) must not
    // undo a value another file set in the meantime.
    if (released) return;
    released = true;
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}
