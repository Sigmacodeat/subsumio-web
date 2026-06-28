// Hardened gray-matter wrapper.
//
// gray-matter@4.0.3 (latest) bundles js-yaml@^3.13.1, which is vulnerable to a
// quadratic-complexity DoS in merge-key handling (GHSA-h67p-54hq-rp68). gray-matter
// has no newer release that bumps the bundled parser, so we route frontmatter
// parse/stringify through the project's own js-yaml@4.3.0 (patched + safe-by-default)
// via gray-matter's `engines` option.
//
// This is the single import site for gray-matter in the engine — every frontmatter
// parse on the ingestion path (including untrusted portal uploads) goes through the
// patched parser. Import this module instead of "gray-matter" directly.
import grayMatter, { type GrayMatterFile, type GrayMatterOption, type Input } from "gray-matter";
import { load, dump } from "js-yaml";

// Re-export gray-matter's type surface so call sites that referenced
// `matter.GrayMatterFile<...>` etc. keep working against this wrapper.
export type { GrayMatterFile, GrayMatterOption, Input } from "gray-matter";

const engines = {
  yaml: {
    parse: (str: string): object => (load(str) as object) ?? {},
    stringify: (obj: object): string => dump(obj),
  },
};

// Mirror gray-matter's own generic signature so the narrow input type (e.g. string)
// flows through to GrayMatterFile<string> at call sites.
function matter<I extends Input, O extends GrayMatterOption<I, O>>(
  input: I | { content: I },
  options?: O
): GrayMatterFile<I> {
  return grayMatter(input, { ...(options as object), engines } as unknown as O);
}

matter.stringify = (
  file: Parameters<typeof grayMatter.stringify>[0],
  data: Parameters<typeof grayMatter.stringify>[1],
  options?: Parameters<typeof grayMatter.stringify>[2]
): string => grayMatter.stringify(file, data, { ...options, engines });

export default matter;
