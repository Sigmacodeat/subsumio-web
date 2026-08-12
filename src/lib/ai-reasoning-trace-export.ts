import type { ReasoningTrace } from "./ai-reasoning-trace";

/** Browser-safe print export for the compliance dashboard. */
export function exportTracesHTML(traces: ReasoningTrace[]): string {
  const chainLinked = traces.every(
    (trace, index) => index === 0 || trace.prev_trace_hash === traces[index - 1]?.trace_hash
  );
  const exportTs = new Date().toISOString();
  const traceRows = traces
    .map((trace, index) => {
      const guardrailStatus =
        trace.guardrail_passed === true
          ? "PASSED"
          : trace.guardrail_passed === false
            ? "FLAGGED"
            : "N/A";
      const injectionStatus = trace.injection_detected
        ? trace.injection_blocked
          ? "BLOCKED"
          : "DETECTED"
        : "CLEAN";
      return `<tr><td>${index + 1}</td><td><code>${trace.trace_id.slice(0, 8)}</code></td><td>${trace.timestamp}</td><td>${trace.jurisdiction ?? "—"}</td><td>${trace.model_used}</td><td>${guardrailStatus}</td><td>${trace.cross_verify_clean === true ? "CLEAN" : trace.cross_verify_clean === false ? "FLAGGED" : "N/A"}</td><td>${injectionStatus}</td><td>${trace.regeneration_count}</td><td>${trace.confidence_level ?? "N/A"}</td><td>${trace.latency_ms ?? "—"}ms</td><td><code>${trace.trace_hash.slice(0, 12)}</code></td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>EU AI Act Art. 12-13 — Compliance Audit Export</title>
<style>
@page { margin: 2cm; } body { font-family: Arial, sans-serif; color: hsl(230, 8%, 15%); line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; }
h1 { font-size: 22px; border-bottom: 2px solid hsl(230, 60%, 52%); padding-bottom: 8px; } h2 { font-size: 16px; margin-top: 24px; color: hsl(230, 8%, 30%); }
table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 12px; } th, td { border: 1px solid hsl(230, 8%, 85%); padding: 6px 8px; text-align: left; } th { background: hsl(230, 8%, 96%); }
.meta { background: hsl(230, 8%, 97%); padding: 12px 16px; border-radius: 6px; margin: 16px 0; font-size: 13px; } .valid { color: hsl(158, 55%, 46%); font-weight: 600; } .broken { color: hsl(0, 78%, 54%); font-weight: 600; }
</style></head><body>
<h1>EU AI Act Art. 12-13 — Compliance Audit Export</h1>
<div class="meta"><p><strong>Export timestamp:</strong> ${exportTs}</p><p><strong>Trace count:</strong> ${traces.length}</p><p><strong>Chain linkage:</strong> <span class="${chainLinked ? "valid" : "broken"}">${chainLinked ? "LINKED ✓" : "BROKEN ✗"}</span></p><p><strong>Note:</strong> Cryptographic hash verification is performed server-side.</p><p><strong>Jurisdictions:</strong> ${[...new Set(traces.map((trace) => trace.jurisdiction ?? "—"))].join(", ")}</p><p><strong>Models used:</strong> ${[...new Set(traces.map((trace) => trace.model_used))].join(", ")}</p></div>
<h2>Reasoning Trace Summary</h2><table><thead><tr><th>#</th><th>Trace ID</th><th>Timestamp</th><th>Jurisdiction</th><th>Model</th><th>Guardrail</th><th>Cross-Verify</th><th>Injection</th><th>Regen</th><th>Confidence</th><th>Latency</th><th>Hash</th></tr></thead><tbody>${traceRows}</tbody></table>
<h2>Detailed Trace Hashes</h2><table><thead><tr><th>Trace ID</th><th>Trace Hash</th><th>Previous Hash</th></tr></thead><tbody>${traces.map((trace) => `<tr><td><code>${trace.trace_id}</code></td><td><code>${trace.trace_hash}</code></td><td><code>${trace.prev_trace_hash ?? "—"}</code></td></tr>`).join("")}</tbody></table>
<p>Generated automatically by Subsumio Compliance Export.</p></body></html>`;
}
