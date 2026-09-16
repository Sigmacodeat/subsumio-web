import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseJsonObject } from "./engine-llm";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

describe("LLM gateway invariant", () => {
  test("no web module calls an AI provider directly or reads a provider key", () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), "src"))) {
      const src = readFileSync(file, "utf8");
      const isProviderCall =
        /https:\/\/(openrouter\.ai|api\.anthropic\.com|api\.openai\.com|api\.deepseek\.com)\/[^"'`]*(chat|completions|messages|audio)/.test(
          src
        ) || /env\("(OPENROUTER|ANTHROPIC|OPENAI)_API_KEY(_FALLBACK)?"\)/.test(src);
      if (isProviderCall) offenders.push(file.replace(process.cwd() + "/", ""));
    }
    expect(offenders).toEqual([]);
  });
});

describe("parseJsonObject", () => {
  test("parses plain, fenced and prose-wrapped JSON", () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject('Hier das Ergebnis: {"a":1} — fertig.')).toEqual({ a: 1 });
    expect(parseJsonObject("[1,2]")).toEqual([1, 2]);
    expect(parseJsonObject("kein json")).toBeNull();
  });
});
