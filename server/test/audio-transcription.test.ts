import { describe, test, expect } from "bun:test";
import {
  transcribeAudio,
  selectTranscriptionProvider,
  MISTRAL_TRANSCRIBE_URL,
  MISTRAL_TRANSCRIBE_MODEL,
  OPENROUTER_TRANSCRIBE_URL,
  MAX_TRANSCRIBE_BYTES,
} from "../src/core/ai/audio-transcription.ts";
import { runWithRequestEuOnly, withRequestEuPolicy } from "../src/core/ai/request-eu-policy.ts";

type Call = { url: string; init: RequestInit };

function mockFetch(response: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const audio = {
  bytes: new Uint8Array([1, 2, 3, 4]),
  mimeType: "audio/webm",
  filename: "diktat.webm",
  language: "de",
  model: "openai/whisper-1",
};

describe("selectTranscriptionProvider", () => {
  test("EU-only with Mistral key → mistral", () => {
    const r = selectTranscriptionProvider({
      SUBSUMIO_EU_ONLY: "1",
      MISTRAL_API_KEY: "m-key",
      OPENROUTER_API_KEY: "or-key",
    });
    expect("provider" in r && r.provider).toBe("mistral");
  });

  test("EU-only without Mistral key → eu_only_refused, never OpenRouter", () => {
    const r = selectTranscriptionProvider({ SUBSUMIO_EU_ONLY: "1", OPENROUTER_API_KEY: "or" });
    expect("ok" in r && r.error).toBe("eu_only_refused");
  });

  test("not EU-only → OpenRouter as before", () => {
    const r = selectTranscriptionProvider({ OPENROUTER_API_KEY: "or", MISTRAL_API_KEY: "m" });
    expect("provider" in r && r.provider).toBe("openrouter");
  });

  test("not EU-only, only Mistral key → mistral", () => {
    const r = selectTranscriptionProvider({ MISTRAL_API_KEY: "m" });
    expect("provider" in r && r.provider).toBe("mistral");
  });

  test("a firm's own EU-only demand (request scope) also routes to Mistral", () => {
    const env = { OPENROUTER_API_KEY: "or", MISTRAL_API_KEY: "m" };
    const r = runWithRequestEuOnly(() => selectTranscriptionProvider(withRequestEuPolicy(env)));
    expect("provider" in r && r.provider).toBe("mistral");
    const refused = runWithRequestEuOnly(() =>
      selectTranscriptionProvider(withRequestEuPolicy({ OPENROUTER_API_KEY: "or" }))
    );
    expect("ok" in refused && refused.error).toBe("eu_only_refused");
  });

  test("no key at all → transcription_not_configured", () => {
    const r = selectTranscriptionProvider({});
    expect("ok" in r && r.error).toBe("transcription_not_configured");
  });
});

describe("transcribeAudio", () => {
  test("EU-only posts multipart to Mistral Voxtral and returns the text", async () => {
    const { impl, calls } = mockFetch(
      () =>
        new Response(
          JSON.stringify({ model: MISTRAL_TRANSCRIBE_MODEL, text: "  Sehr geehrte Damen  " }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    );
    const out = await transcribeAudio(
      audio,
      { SUBSUMIO_EU_ONLY: "1", MISTRAL_API_KEY: "m-key", OPENROUTER_API_KEY: "or" },
      impl
    );
    expect(out).toMatchObject({
      ok: true,
      text: "Sehr geehrte Damen",
      provider: "mistral-voxtral",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(MISTRAL_TRANSCRIBE_URL);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer m-key");
    const form = calls[0].init.body as FormData;
    expect(form.get("model")).toBe(MISTRAL_TRANSCRIBE_MODEL);
    expect(form.get("language")).toBe("de");
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect(calls[0].init.signal).toBeDefined();
  });

  test("EU-only without Mistral key → 403 refusal and no request", async () => {
    const { impl, calls } = mockFetch(() => new Response("{}"));
    const out = await transcribeAudio(
      audio,
      { SUBSUMIO_EU_ONLY: "1", OPENROUTER_API_KEY: "x" },
      impl
    );
    expect(out).toMatchObject({ ok: false, status: 403, error: "eu_only_refused" });
    expect(calls).toHaveLength(0);
  });

  test("default mode keeps OpenRouter Whisper", async () => {
    const { impl, calls } = mockFetch(
      () => new Response(JSON.stringify({ text: "hallo", duration: 3 }), { status: 200 })
    );
    const out = await transcribeAudio(audio, { OPENROUTER_API_KEY: "or" }, impl);
    expect(out).toMatchObject({ ok: true, text: "hallo", provider: "openrouter-whisper" });
    expect(calls[0].url).toBe(OPENROUTER_TRANSCRIBE_URL);
    expect((calls[0].init.body as FormData).get("model")).toBe("openai/whisper-1");
  });

  test("upstream error → transcription_failed with provider detail", async () => {
    const { impl } = mockFetch(() => new Response("bad audio", { status: 422 }));
    const out = await transcribeAudio(audio, { MISTRAL_API_KEY: "m" }, impl);
    expect(out).toMatchObject({ ok: false, status: 502, error: "transcription_failed" });
    if (!out.ok) expect(out.message).toContain("mistral");
  });

  test("timeout → transcription_timeout", async () => {
    const impl = (async () => {
      const e = new Error("timed out");
      e.name = "TimeoutError";
      throw e;
    }) as unknown as typeof fetch;
    const out = await transcribeAudio(audio, { MISTRAL_API_KEY: "m" }, impl);
    expect(out).toMatchObject({ ok: false, status: 504, error: "transcription_timeout" });
  });

  test("empty or oversized audio → audio_size_invalid without request", async () => {
    const { impl, calls } = mockFetch(() => new Response("{}"));
    const empty = await transcribeAudio(
      { ...audio, bytes: new Uint8Array() },
      { MISTRAL_API_KEY: "m" },
      impl
    );
    const big = await transcribeAudio(
      { ...audio, bytes: new Uint8Array(MAX_TRANSCRIBE_BYTES + 1) },
      { MISTRAL_API_KEY: "m" },
      impl
    );
    expect(empty).toMatchObject({ ok: false, error: "audio_size_invalid" });
    expect(big).toMatchObject({ ok: false, error: "audio_size_invalid" });
    expect(calls).toHaveLength(0);
  });
});
