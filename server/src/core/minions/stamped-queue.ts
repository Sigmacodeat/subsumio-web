/**
 * A MinionQueue that adds fixed stamps to the data of every job it submits.
 *
 * Handlers that fan out into many child jobs (the legal pipeline has two
 * dozen submission sites) use it so the caller's matter access, owner and
 * bound matter reach every child — a site that forgets to copy them cannot
 * exist. Stamps win over same-named keys in the child data: a child must not
 * be able to widen its parent's matter scope.
 */
import type { BrainEngine } from "../engine.ts";
import type { MinionJob, MinionJobInput } from "./types.ts";
import { MinionQueue, type TrustedSubmitOpts } from "./queue.ts";

export class StampedMinionQueue extends MinionQueue {
  constructor(
    engine: BrainEngine,
    private readonly stamps: Readonly<Record<string, unknown>>
  ) {
    super(engine);
  }

  override async add(
    name: string,
    data?: Record<string, unknown>,
    opts?: Partial<MinionJobInput>,
    trusted?: TrustedSubmitOpts
  ): Promise<MinionJob> {
    return super.add(name, { ...(data ?? {}), ...this.stamps }, opts, trusted);
  }
}
