import { join } from "path";

/**
 * Canonical corpus path resolution.
 *
 * The legal corpus (law-corpus/) is DATA, not code — it can live outside the
 * app source tree via SUBSUMIO_LAW_CORPUS_DIR (engine convention, see
 * server/src/core/legal/corpus-lookup-adapter.ts) or LAW_CORPUS_ROOT
 * (server scripts + docker-compose convention). Keeping it out of the
 * Next.js project root prevents bundler file-scanning of ~772k corpus files.
 */
export function lawCorpusDir(): string {
  return (
    process.env.SUBSUMIO_LAW_CORPUS_DIR ??
    process.env.LAW_CORPUS_ROOT ??
    join(process.cwd(), "law-corpus")
  );
}

export function lawCorpusNormalizedDir(): string {
  return join(lawCorpusDir(), "_normalized");
}

export function lawCorpusSplitDir(): string {
  const env = process.env.SUBSUMIO_LAW_CORPUS_DIR;
  return env ? join(env, "..", "law-corpus-split") : join(process.cwd(), "law-corpus-split");
}
