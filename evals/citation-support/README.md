# Citation-support eval

Checks the second grounding stage, "does the cited source carry the statement?"
(`src/lib/support-check.ts`), against real Austrian and EU norms. It runs the
production path: corpus grounding, then one utility-tier model call per case.

## Gold set (`gold.json`)

46 statements, each citing one norm: 31 `dev` cases, against which prompt and model were tuned, and 15 `holdout` cases, written before the second run and never used for tuning. Every label was assigned by hand against
the norm's text in our corpus (RIS-OGD, EUR-Lex), and `rationale` names the
passage that decides it.

| Label         | Cases | Built as                                                           |
| ------------- | ----- | ------------------------------------------------------------------ |
| `supported`   | 16    | statement restates the norm                                        |
| `unsupported` | 11    | wrong norm for the topic, or a statement that contradicts the text |
| `partial`     | 4     | true core plus an addition the norm does not contain               |

`acceptable` lists a second defensible verdict for borderline cases. Only the
lenient accuracy uses it. Every other metric scores strictly against `expected`.

Scope: ABGB (damages, tenancy, warranty, limitation, neighbour law), MRG, ZPO,
StGB, B-VG and DSGVO. Case-law citations are not in version 1.

## Metrics and targets, fixed before the first real run

| Metric                  | Meaning                                                               | Target |
| ----------------------- | --------------------------------------------------------------------- | ------ |
| `dangerous_miss_rate`   | gold `unsupported` judged `supported`: a wrong source passes as good  | 0      |
| `misgrounding_recall`   | share of gold `unsupported` judged `unsupported`                      | ≥ 0.90 |
| `false_alarm_rate`      | gold `supported` judged `unsupported`: a good source flagged as wrong | ≤ 0.10 |
| `pipeline_failure_rate` | `unchecked` or `not_grounded`: the check did not run                  | 0      |
| `exact_accuracy`        | three-way agreement with `expected`                                   | report |
| `lenient_accuracy`      | agreement with `expected` or `acceptable`                             | report |

A new model or prompt ships only if it meets every target and does not worsen
`dangerous_miss_rate`.

## Running it

The eval needs the law corpus and the engine, so it runs inside the web
container. Nothing is written except the receipt on stdout.

```bash
bun build evals/citation-support/run.ts --target=bun --outfile=/tmp/eval-citation-support.js
scp /tmp/eval-citation-support.js subsumio-netcup:/tmp/
ssh subsumio-netcup 'docker cp /tmp/eval-citation-support.js subsumio-engine-web-1:/tmp/ && \
  docker exec -w /app -e EVAL_CODE_SHA=$(git rev-parse --short HEAD) subsumio-engine-web-1 \
  bun /tmp/eval-citation-support.js' > evals/citation-support/runs/$(date +%F).json
```

Progress goes to stderr, one line per case: `✓` exact, `~` acceptable, `✗` wrong.
The receipt records the model, the gold hash and the code SHA, so every run can be
reproduced.

## Runs

- **2026-09-19, run 1: blocked.** All 31 citations were found in the corpus, but every model
  call failed on the engine side because the Anthropic account had no credit. The check returned
  `unchecked` and did not guess a verdict.
- **2026-09-19, run 2** (`runs/2026-09-19-*.json`). Before this run, three fixes went in:
  - the statement search accepts "Art 7" without a dot;
  - article lookup prefers the heading line and allows the no-break space EUR-Lex uses, so
    Art 7, Art 17 and Art 82 DSGVO had been checked against the wrong text;
  - two general judging rules in the prompt.

  | tier (model)                | split   | exact | lenient | misgrounding recall | dangerous miss | false alarm | pipeline failure |
  | --------------------------- | ------- | ----- | ------- | ------------------- | -------------- | ----------- | ---------------- |
  | utility (Claude Haiku 4.5)  | dev     | 0.94  | 1.00    | 1.00                | 0              | 0           | 0                |
  | utility (Claude Haiku 4.5)  | holdout | 0.80  | 0.87    | 1.00                | 0              | 0           | 0                |
  | reasoning (Claude Sonnet 5) | dev     | 0.94  | 1.00    | 1.00                | 0              | 0           | 0                |
  | reasoning (Claude Sonnet 5) | holdout | 0.73  | 0.80    | 1.00                | 0              | 0           | 0                |

  **Decision:** keep the utility tier. It meets every target on both splits, and Sonnet 5 is
  not better while costing more.

  **Remaining errors:** every one is an abbreviated but correct statement judged `partial`
  (§ 1311 ABGB, and § 1320 ABGB on Sonnet). This yields a yellow note, never the red alert.
  For Art 17 DSGVO, "partial" is defensible because the statement leaves out the
  preconditions. The holdout labels were left unchanged after seeing the results.
