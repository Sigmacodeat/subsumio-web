import { join } from "path";

/**
 * Canonical corpus path resolution.
 *
 * The legal corpus (law-corpus/) is DATA, not code — it can live outside the
 * app source tree via SUBSUMIO_LAW_CORPUS_DIR (same convention as the engine
 * in server/src/core/legal/corpus-lookup-adapter.ts). Keeping it out of the
 * Next.js project root prevents bundler file-scanning of ~772k corpus files.
 */
export function lawCorpusDir(): string {
  return process.env.SUBSUMIO_LAW_CORPUS_DIR ?? join(process.cwd(), "law-corpus");
}

export function lawCorpusNormalizedDir(): string {
  return join(lawCorpusDir(), "_normalized");
}

export function lawCorpusSplitDir(): string {
  const env = process.env.SUBSUMIO_LAW_CORPUS_DIR;
  return env ? join(env, "..", "law-corpus-split") : join(process.cwd(), "law-corpus-split");
}
