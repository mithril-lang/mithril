export const STUDIO_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const STUDIO_AI_FREE_MODE = "workers-free-only";
export const STUDIO_AI_FREE_NEURONS_PER_DAY = 10_000;

export function isWorkersFreeAiEnabled(env) {
  return env?.STUDIO_AI_ENABLED === "true"
    && env?.STUDIO_AI_MODE === STUDIO_AI_FREE_MODE
    && typeof env?.AI?.run === "function";
}

export async function runWorkersFreeAi(env, request) {
  if (!isWorkersFreeAiEnabled(env)) {
    throw new Error("Workers AI is not configured for free-only mode.");
  }

  // Do not pass an AI Gateway or billing override. On Workers Free, Cloudflare
  // stops inference after the included daily neuron allocation is exhausted.
  return env.AI.run(STUDIO_MODEL, request);
}
