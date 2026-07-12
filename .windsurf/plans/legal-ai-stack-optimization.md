# Legal-AI Stack Optimization Plan

## Ziel
Optimierung des LM-Stacks für deutsche/europäische Rechtsarbeit — bester günstigster Stack mit Cross-Model-Verification.

## Ist-Zustand
- **utility**: DeepSeek V3.2 ($0.14/$0.28) — Extraction-Specialists
- **reasoning**: DeepSeek V3.2 ($0.14/$0.28) — Synthese-Specialists
- **deep**: GPT-4.1 ($2.00/$8.00) — **10x/16x teurer als nötig**
- **subagent**: DeepSeek V3.2 ($0.14/$0.28) — Tool-Loops
- `subsumption-checker` und `opponent-simulator` auf `reasoning` = **gleiche Modell wie Generator** → kein Cross-Model-Check

## Änderungen

### 1. TIER_DEFAULTS.deep: GPT-4.1 → Grok 4.3
**Datei**: `server/src/core/model-config.ts:84-89`
- `openrouter:openai/gpt-4.1` → `openrouter:xai/grok-4.3`
- Kommentar aktualisieren
- **Begründung**: HAQQ 29.0 (98% Opus), 12% Hallucination (vs 18% DeepSeek), $0.20/$0.50 = 10x/16x günstiger

### 2. Specialist-Routing: 2 Specialists auf `deep` tier
**Datei**: `server/src/core/minions/specialist-defs.ts`
- `subsumption-checker`: `modelTier: "reasoning"` → `modelTier: "deep"`
- `opponent-simulator`: `modelTier: "reasoning"` → `modelTier: "deep"`
- **Begründung**: Cross-Model-Verification — Verifier muss andere Modellfamilie sein als Generator

### 3. Gateway Defaults — keine Änderung
- `DEFAULT_CHAT_MODEL` = DeepSeek V3.2 (bleibt, gut für Chat)
- `DEFAULT_EXPANSION_MODEL` = DeepSeek V3.2 (bleibt, Query-Expansion ist simpel)

### 4. Pricing-Tabelle — keine Änderung
- `xai:grok-4.3` bereits in `CANONICAL_PRICING` ($0.20/$0.50)
- OpenRouter-prefixed IDs intentionally miss (Design-Decision)

## Kostenvergleich
| Tier | Alt | Neu | Ersparnis |
|------|-----|-----|-----------|
| deep | $2.00/$8.00 (GPT-4.1) | $0.20/$0.50 (Grok 4.3) | -90%/-94% |
| **Total/user/mo** | ~$0.25 | ~$0.07 | **-72%** |

## Architektur nach Umbau
```
DeepSeek V3.2 (Generator, reasoning tier)
    ↓
Grok 4.3 (Verifier, deep tier) — andere Modellfamilie
    ↓
Citation Guardrail (deterministic, zero-cost)
    ↓
Human Review
```

## Exact Edits

### Edit 1: `server/src/core/model-config.ts` lines 75-89
Replace comment block + TIER_DEFAULTS.deep:
```typescript
// OLD:
 * DeepSeek V3.2: LEXam 57.42, supports tool-calling, $0.14/$0.28 per 1M.
 * GPT-4.1: LEXam 57.50, highest quality for deep reasoning.
 ...
  deep: "openrouter:openai/gpt-4.1",

// NEW:
 * DeepSeek V3.2: LEXam 57.42, supports tool-calling, $0.14/$0.28 per 1M.
 * Grok 4.3: HAQQ 29.0 (98% of Opus), 12% hallucination, $0.20/$0.50 per 1M.
 *   Cross-model verification: different model family than DeepSeek generator.
 *   10x/16x cheaper than GPT-4.1 with comparable legal reasoning.
 ...
  deep: "openrouter:xai/grok-4.3",
```

### Edit 2: `server/src/core/minions/specialist-defs.ts` — subsumption-checker
Line ~1083: `modelTier: "reasoning"` → `modelTier: "deep"`

### Edit 3: `server/src/core/minions/specialist-defs.ts` — opponent-simulator
Line ~897: `modelTier: "reasoning"` → `modelTier: "deep"`

## Verification
- TypeScript: `tsc --noEmit` (0 errors)
- Tests: Bestehende Tests müssen weiterhin passen
- Keine Breaking Changes (nur Default-Werte geändert, Config-Override bleibt möglich)

## Status: READY FOR IMPLEMENTATION (exit plan mode to apply)
