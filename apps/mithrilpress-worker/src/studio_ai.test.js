import assert from "node:assert/strict";
import test from "node:test";
import {
  isWorkersFreeAiEnabled,
  runWorkersFreeAi,
  STUDIO_AI_FREE_MODE,
  STUDIO_MODEL,
} from "./studio_ai.js";

test("Workers AI is disabled unless explicitly enabled in Free-only mode", () => {
  const run = async () => ({ response: "draft" });
  assert.equal(isWorkersFreeAiEnabled({ AI: { run } }), false);
  assert.equal(isWorkersFreeAiEnabled({ STUDIO_AI_ENABLED: "true", AI: { run } }), false);
  assert.equal(isWorkersFreeAiEnabled({
    STUDIO_AI_ENABLED: "true",
    STUDIO_AI_MODE: "gateway",
    AI: { run },
  }), false);
  assert.equal(isWorkersFreeAiEnabled({
    STUDIO_AI_ENABLED: "true",
    STUDIO_AI_MODE: STUDIO_AI_FREE_MODE,
  }), false);
  assert.equal(isWorkersFreeAiEnabled({
    STUDIO_AI_ENABLED: "true",
    STUDIO_AI_MODE: STUDIO_AI_FREE_MODE,
    AI: { run },
  }), true);
});

test("Free-only inference calls the schema-compatible model directly without a Gateway fallback", async () => {
  const request = { messages: [{ role: "user", content: "Draft a page" }], max_tokens: 700 };
  const calls = [];
  const env = {
    STUDIO_AI_ENABLED: "true",
    STUDIO_AI_MODE: STUDIO_AI_FREE_MODE,
    AI_GATEWAY_ID: "ignored-paid-gateway",
    AI: {
      async run(...args) {
        calls.push(args);
        return { response: "draft" };
      },
    },
  };

  const result = await runWorkersFreeAi(env, request);
  assert.deepEqual(result, { response: "draft" });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [STUDIO_MODEL, request]);
});

test("Free-only inference fails closed and does not call AI when disabled", async () => {
  let calls = 0;
  const env = {
    STUDIO_AI_ENABLED: "true",
    STUDIO_AI_MODE: "gateway",
    AI: { async run() { calls += 1; return { response: "draft" }; } },
  };
  await assert.rejects(runWorkersFreeAi(env, {}), /not configured for free-only mode/);
  assert.equal(calls, 0);
});
