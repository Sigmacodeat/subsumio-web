/**
 * Guard rails for the external document converters (LibreOffice, qpdf,
 * readpst) that parse untrusted uploads.
 *
 *  - Minimal environment: a converter never inherits the engine's process
 *    environment (database URL, provider keys, …) — only what it needs to
 *    run, with HOME/TMPDIR pointed at its own throwaway directory.
 *  - Resource limits: when `prlimit` (util-linux) is available, the command
 *    runs under a CPU-time and file-size ceiling. RLIMIT_CPU is inherited by
 *    child processes, so a helper the converter forks is bounded too.
 *  - Hard stop: callers kill with SIGKILL on their wall-clock timeout.
 *
 * Network isolation is not possible from inside the container (it needs
 * privileges the engine deliberately does not have); see RUNBOOK.
 */

const ENV_ALLOWLIST = ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TZ"] as const;

export interface ConverterLimits {
  /** CPU seconds before the kernel stops the process (SIGXCPU/SIGKILL). */
  cpuSeconds: number;
  /** Largest single file the process may write, in bytes. */
  maxFileBytes: number;
}

/** Environment for a converter process: allowlisted variables only. */
export function converterEnv(
  home: string,
  source: Record<string, string | undefined> = process.env
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = source[key];
    if (value) env[key] = value;
  }
  if (!env.PATH) env.PATH = "/usr/local/bin:/usr/bin:/bin";
  env.HOME = home;
  env.TMPDIR = home;
  return env;
}

let prlimitPath: string | null | undefined;
function detectPrlimit(): string | null {
  if (prlimitPath === undefined) {
    prlimitPath = typeof Bun !== "undefined" ? (Bun.which("prlimit") ?? null) : null;
  }
  return prlimitPath;
}

/**
 * Wraps `argv` in `prlimit` when available. `prlimit` is injectable for
 * tests; `null` means "not available" and returns argv unchanged.
 */
export function limitedArgv(
  argv: string[],
  limits: ConverterLimits,
  prlimit: string | null = detectPrlimit()
): string[] {
  if (!prlimit) return argv;
  const cpu = Math.max(1, Math.floor(limits.cpuSeconds));
  const fsize = Math.max(1, Math.floor(limits.maxFileBytes));
  return [prlimit, `--cpu=${cpu}`, `--fsize=${fsize}`, "--", ...argv];
}
