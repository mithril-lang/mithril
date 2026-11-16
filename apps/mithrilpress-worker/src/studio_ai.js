import {
  instantiateMithrilNative as instantiateStudioAiPolicy,
} from "./studio_ai_policy.js";

const {
  isWorkersFreeAiEnabled: evaluateWorkersFreeAiEnabled,
  workersFreeAiMode,
} = instantiateStudioAiPolicy({});

export const STUDIO_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const STUDIO_AI_FREE_MODE = workersFreeAiMode();
export const STUDIO_AI_FREE_NEURONS_PER_DAY = 10_000;
export const STUDIO_AI_DAILY_NEURON_RESERVATION_LIMIT = 8_000;
export const STUDIO_AI_MAX_INPUT_BYTES = 10_000;
export const STUDIO_AI_MAX_OUTPUT_TOKENS = 700;

const MODEL_INPUT_NEURONS_PER_MILLION_TOKENS = 26_668;
const MODEL_OUTPUT_NEURONS_PER_MILLION_TOKENS = 204_805;
const RESERVATION_SAFETY_MULTIPLIER = 2;
const MESSAGE_TOKEN_OVERHEAD = 64;
const RESPONSE_SCHEMA_TOKEN_OVERHEAD = 512;
const encoder = new TextEncoder();

export function isWorkersFreeAiEnabled(env) {
  return evaluateWorkersFreeAiEnabled(env, STUDIO_AI_FREE_MODE);
}

export function estimateWorkersFreeAiNeurons(request) {
  const messages = request?.messages;
  const maxTokens = request?.max_tokens;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 12
      || !Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > STUDIO_AI_MAX_OUTPUT_TOKENS) {
    return null;
  }

  let inputTokenCeiling = RESPONSE_SCHEMA_TOKEN_OVERHEAD + (MESSAGE_TOKEN_OVERHEAD * messages.length);
  for (const message of messages) {
    if (!message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string") {
      return null;
    }
    inputTokenCeiling += encoder.encode(message.content).byteLength;
    if (inputTokenCeiling > STUDIO_AI_MAX_INPUT_BYTES) return null;
  }

  const estimatedNeurons = (
    (inputTokenCeiling * MODEL_INPUT_NEURONS_PER_MILLION_TOKENS)
      + (maxTokens * MODEL_OUTPUT_NEURONS_PER_MILLION_TOKENS)
  ) / 1_000_000;
  return Math.ceil(estimatedNeurons * RESERVATION_SAFETY_MULTIPLIER);
}

export async function runWorkersFreeAi(env, request) {
  if (!isWorkersFreeAiEnabled(env)) {
    throw new Error("Workers AI requires explicit enablement and confirmation of the Workers Free account plan.");
  }
  if (estimateWorkersFreeAiNeurons(request) === null) throw new Error("Workers AI request exceeds the free-only input or output budget.");

  // Do not pass an AI Gateway or billing override. On Workers Free, Cloudflare
  // stops inference after the included daily neuron allocation is exhausted.
  return env.AI.run(STUDIO_MODEL, request);
}
