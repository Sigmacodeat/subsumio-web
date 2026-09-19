// @vitest-environment node

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Files the server reads from disk at runtime (not bundled by Next) must be
 * copied into the runtime stage of the web image. The image is not a Next
 * standalone build, so `outputFileTracingIncludes` alone does not ship them.
 * Missing corpus-meta.json took every citation check down with ENOENT.
 */
const RUNTIME_READ_FILES = ["src/lib/corpus-meta.json"];

describe("Dockerfile.web runtime stage", () => {
  const dockerfile = readFileSync(join(process.cwd(), "Dockerfile.web"), "utf8");
  const runner = dockerfile.slice(dockerfile.lastIndexOf("FROM "));

  for (const file of RUNTIME_READ_FILES) {
    test(`copies ${file}`, () => {
      expect(runner).toMatch(new RegExp(`COPY --from=build[^\\n]*/app/${file}\\s+\\./${file}`));
    });
  }

  test("corpus-meta.ts still reads exactly that path", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/corpus-meta.ts"), "utf8");
    expect(src).toContain('join(process.cwd(), "src", "lib", "corpus-meta.json")');
  });
});
