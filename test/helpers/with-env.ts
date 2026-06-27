/**
 * Safe test helper for temporary environment overrides.
 *
 * Restores the original values in a `finally` block so parallel tests are
 * isolated from each other. Use this instead of mutating `process.env`
 * directly.
 */
export async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T | Promise<T>
): Promise<T> {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  }
}
