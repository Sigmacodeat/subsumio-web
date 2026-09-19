# Citation-support eval

Checks the second grounding stage, "does the cited source carry the statement?"
(`src/lib/support-check.ts`), against real Austrian and EU norms. It runs the
production path: corpus grounding, then one utility-tier model call per case.

## Gold set (`gold.json`)

31 statements, each citing one norm. Every label was assigned by hand against
the norm's text in our corpus (RIS-OGD, EUR-Lex), and `rationale` names the
passage that decides it.

| Label         | Cases | Built as                                                          |
| ------------- | ----- | ----------------------------------------------------------------- |
| `supported`   | 16    | statement restates the norm                                       |
| `unsupported` | 11    | wrong norm for the topic, or a statement that contradicts the text |
| `partial`     | 4     | true core plus an addition the norm does not contain              |

`acceptable` lists a second defensible verdict for borderline cases. Only the
lenient accuracy uses it. Every other metric scores strictly against `expected`.

Scope: ABGB (damages, tenancy, warranty, limitation, neighbour law), MRG, ZPO,
StGB, B-VG and DSGVO. Case-law citations are not in version 1.

## Metrics and targets, fixed before the first real run

| Metric                  | Meaning                                                                   | Target |
| ----------------------- | ------------------------------------------------------------------------- | ------ |
| `dangerous_miss_rate`   | gold `unsupported` judged `supported`: a wrong source passes as good       | 0      |
| `misgrounding_recall`   | share of gold `unsupported` judged `unsupported`                           | ≥ 0.90 |
| `false_alarm_rate`      | gold `supported` judged `unsupported`: a good source flagged as wrong      | ≤ 0.10 |
| `pipeline_failure_rate` | `unchecked` or `not_grounded`: the check did not run                       | 0      |
| `exact_accuracy`        | three-way agreement with `expected`                                        | report |
| `lenient_accuracy`      | agreement with `expected` or `acceptable`                                  | report |

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

- **2026-09-19, first run: blocked.** The pipeline worked end to end: all 31 citations were
  found in the corpus, and the check returned `unchecked` without guessing a verdict.
  Every model call failed on the engine side ("credit balance is too low" at Anthropic),
  so there are no quality numbers yet. Run it again once the account works.
