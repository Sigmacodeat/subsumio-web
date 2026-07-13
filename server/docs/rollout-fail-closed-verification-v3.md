# Rollout: Fail-Closed Verification v3

## What changed

- `server/src/core/verification/states.ts` introduces explicit `VerificationState` values:
  `VERIFIED`, `VERIFIED_WITH_WARNINGS`, `NEEDS_HUMAN_REVIEW`, `BLOCKED`, `VERIFIER_ERROR`.
- `server/src/core/think/cross-verify.ts` is now fail-closed: technical failures
  (no model, empty response, parse error, exception) return `verifier_error: true`
  instead of `clean: true`.
- `server/src/core/minions/handlers/legal-pipeline.ts`:
  - High-severity Tier-0 guardrail flags in Layers 3/4/5/6 now throw and set
    `state.status = "needs_human_review"`.
  - Layer 6 draft output runs Tier-0 guardrail + Tier-1 cross-verify and stores
    `verification_state` / `verification_reason` on the pipeline state.
  - `SUBSUMIO_GUARDRAIL_HARD_BLOCK` env var is removed; hard-block is now always on.

## Publish semantics

| State                    | `publish_allowed` | Meaning                                                              |
| ------------------------ | ----------------- | -------------------------------------------------------------------- |
| `VERIFIED`               | true              | All checks passed.                                                   |
| `VERIFIED_WITH_WARNINGS` | true              | Low/medium flags only; publishable with warnings.                    |
| `NEEDS_HUMAN_REVIEW`     | false             | Verification incomplete or low-risk high-severity flags.             |
| `BLOCKED`                | false             | High-severity flags on high/medium-risk output.                      |
| `VERIFIER_ERROR`         | false             | Cross-verify/guardrail technical failure; never treated as verified. |

## Rollout steps

1. Deploy the new `verification/` module.
2. Ensure `server/src/core/minions/handlers/legal-pipeline.ts` is reloaded.
3. Verify the `verification_state` field is persisted in pipeline state pages.
4. Monitor warnings for `GUARDRAIL_*`, `CROSS_VERIFY_*`, and `VERIFICATION_*`.

## Rollback

Revert the three files above. The old env var `SUBSUMIO_GUARDRAIL_HARD_BLOCK` is no longer
read, so re-enabling it has no effect; revert the full file to restore the old behavior.
