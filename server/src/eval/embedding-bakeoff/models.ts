/**
 * Embedding bake-off: the candidate models.
 *
 * Every model is scored at the SAME stored dimension where it can be
 * shortened (Matryoshka-trained models), because pgvector's HNSW index takes
 * at most 2000 dimensions for `vector`. A model that only wins at 3072 dims
 * would not be deployable as-is, so it is measured at what we would ship.
 *
 * Routes:
 *   openrouter — one key for almost all vendors (OPENROUTER_API_KEY)
 *   voyage     — direct API, needed to pass input_type (VOYAGE_API_KEY)
 *   cohere     — direct EU endpoint (COHERE_API_KEY)
 */

import { queryInstructionFor } from "../../core/ai/embedding-instructions.ts";

export type EmbedRoute = "openrouter" | "voyage" | "cohere";

export interface BakeoffModel {
  /** Stable key used in file names and reports. */
  key: string;
  label: string;
  route: EmbedRoute;
  /** Model id as the route's API expects it. */
  apiModel: string;
  /** Stored dimension; vectors longer than this are cut and re-normalized (MRL). */
  dims: number;
  /** Whether cutting to `dims` is legitimate (model trained with Matryoshka). */
  matryoshka: boolean;
  /** Text put in front of every query (instruction-tuned models need it). */
  queryInstruction?: string;
  /** Price per million input tokens in USD, for the cost column. */
  usdPerMTok: number;
  /** Where client queries would be processed in production. */
  residency: string;
  /** Open weights: can run on our own hardware. */
  openWeights: boolean;
}

// The engine's own prefix, so the bake-off measures exactly what production sends.
const QWEN_INSTRUCTION = queryInstructionFor("qwen/qwen3-embedding-8b")!;

export const BAKEOFF_MODELS: BakeoffModel[] = [
  {
    key: "te3-small",
    label: "OpenAI text-embedding-3-small (heute)",
    route: "openrouter",
    apiModel: "openai/text-embedding-3-small",
    dims: 1536,
    matryoshka: true,
    usdPerMTok: 0.02,
    residency: "USA",
    openWeights: false,
  },
  {
    key: "te3-large",
    label: "OpenAI text-embedding-3-large",
    route: "openrouter",
    apiModel: "openai/text-embedding-3-large",
    dims: 1536,
    matryoshka: true,
    usdPerMTok: 0.13,
    residency: "USA",
    openWeights: false,
  },
  {
    key: "voyage-4-large",
    label: "Voyage 4 Large",
    route: "voyage",
    apiModel: "voyage-4-large",
    dims: 1024,
    matryoshka: true,
    usdPerMTok: 0.12,
    residency: "USA",
    openWeights: false,
  },
  {
    key: "gemini-embedding-2",
    label: "Google Gemini Embedding 2",
    route: "openrouter",
    apiModel: "google/gemini-embedding-2",
    dims: 1536,
    matryoshka: true,
    usdPerMTok: 0.2,
    residency: "USA/EU (Vertex)",
    openWeights: false,
  },
  {
    key: "qwen3-embedding-8b",
    label: "Qwen3-Embedding-8B",
    route: "openrouter",
    apiModel: "qwen/qwen3-embedding-8b",
    dims: 1536,
    matryoshka: true,
    queryInstruction: QWEN_INSTRUCTION,
    usdPerMTok: 0.01,
    residency: "selbst betreibbar (EU)",
    openWeights: true,
  },
  {
    key: "qwen3-embedding-4b",
    label: "Qwen3-Embedding-4B",
    route: "openrouter",
    apiModel: "qwen/qwen3-embedding-4b",
    dims: 1536,
    matryoshka: true,
    queryInstruction: QWEN_INSTRUCTION,
    usdPerMTok: 0.02,
    residency: "selbst betreibbar (EU)",
    openWeights: true,
  },
  {
    key: "mistral-embed",
    label: "Mistral Embed",
    route: "openrouter",
    apiModel: "mistralai/mistral-embed-2312",
    dims: 1024,
    matryoshka: false,
    usdPerMTok: 0.1,
    residency: "EU (Mistral direkt)",
    openWeights: false,
  },
  {
    key: "bge-m3",
    label: "BAAI BGE-M3",
    route: "openrouter",
    apiModel: "baai/bge-m3",
    dims: 1024,
    matryoshka: false,
    usdPerMTok: 0.01,
    residency: "selbst betreibbar (EU)",
    openWeights: true,
  },
  {
    key: "pplx-embed-4b",
    label: "Perplexity pplx-embed-v1-4b",
    route: "openrouter",
    apiModel: "perplexity/pplx-embed-v1-4b",
    dims: 1536,
    matryoshka: true,
    usdPerMTok: 0.03,
    residency: "USA",
    openWeights: false,
  },
  {
    key: "cohere-embed-v4",
    label: "Cohere Embed v4",
    route: "cohere",
    apiModel: "embed-v4.0",
    dims: 1536,
    matryoshka: true,
    usdPerMTok: 0.12,
    residency: "EU (api.eu.cohere.com)",
    openWeights: false,
  },
];

export function findModel(key: string): BakeoffModel {
  const m = BAKEOFF_MODELS.find((x) => x.key === key);
  if (!m) {
    throw new Error(
      `Unbekanntes Modell "${key}". Verfügbar: ${BAKEOFF_MODELS.map((x) => x.key).join(", ")}`
    );
  }
  return m;
}
