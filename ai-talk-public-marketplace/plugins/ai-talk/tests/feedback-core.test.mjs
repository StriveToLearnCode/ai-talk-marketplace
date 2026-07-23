import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  feedbackSpoolPaths,
  flushFeedbackQueue,
  isExplicitToolError,
  normalizeFeedback,
  readFeedbackPreference,
  shouldAskFeedback,
  submitFeedback,
  writeFeedbackPreference,
} from "../scripts/feedback-core.mjs";

async function temporaryEnv() {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-talk-feedback-"));
  return { AI_TALK_FEEDBACK_DIR: directory };
}

async function pendingEnvelopes(env) {
  const pending = feedbackSpoolPaths(env).pending;
  const files = (await readdir(pending)).filter((fileName) => fileName.endsWith(".json"));
  return Promise.all(files.map(async (fileName) => JSON.parse(await readFile(path.join(pending, fileName), "utf8"))));
}

test("normalizes the allowlisted envelope and redacts secrets", () => {
  const envelope = normalizeFeedback({
    source: "user_feedback",
    plugin_version: "0.4.0",
    contract_result: "handoff",
    mode: "modify_and_verify",
    outcome: "completed",
    rating: "unhelpful",
    categories: ["wrong_target_binding", "not-supported"],
    user_comment: "token=secret-value Bearer abc.def.ghi",
    sanitized_context: "https://example.test/page?session_id=123&tab=voice",
    raw_transcript: "must not survive",
  });

  assert.deepEqual(Object.keys(envelope), [
    "feedback_version",
    "feedback_id",
    "created_at",
    "plugin_version",
    "source",
    "contract_result",
    "mode",
    "outcome",
    "rating",
    "categories",
    "user_comment",
    "error_codes",
    "sanitized_context",
  ]);
  assert.deepEqual(envelope.categories, ["wrong_target_binding"]);
  assert.equal(envelope.user_comment, "token=[REDACTED] Bearer [REDACTED]");
  assert.match(envelope.sanitized_context, /session_id=\[REDACTED\]/);
  assert.ok(!("raw_transcript" in envelope));
});

test("queues locally unless endpoint and consent are both configured", async () => {
  const env = await temporaryEnv();
  const result = await submitFeedback({ source: "user_feedback", rating: "helpful" }, { env });
  assert.equal(result.status, "queued_local");
  assert.equal(result.reason, "endpoint_not_configured");
  const queued = await pendingEnvelopes(env);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].rating, "helpful");
});

test("uploads only with explicit consent", async () => {
  const env = {
    ...(await temporaryEnv()),
    AI_TALK_FEEDBACK_ENDPOINT: "https://feedback.example.test/v1",
    AI_TALK_FEEDBACK_CONSENT: "1",
  };
  const requests = [];
  const result = await submitFeedback(
    { source: "user_feedback", rating: "neutral" },
    {
      env,
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return { ok: true, status: 204 };
      },
    },
  );
  assert.equal(result.status, "uploaded");
  assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].options.body).rating, "neutral");
});

test("failed delivery stays queued and can be flushed", async () => {
  const env = {
    ...(await temporaryEnv()),
    AI_TALK_FEEDBACK_ENDPOINT: "https://feedback.example.test/v1",
    AI_TALK_FEEDBACK_CONSENT: "1",
  };
  const failed = await submitFeedback(
    { source: "technical_error", error_codes: ["tool_error:exec"] },
    { env, fetchImpl: async () => ({ ok: false, status: 503 }) },
  );
  assert.equal(failed.status, "queued_local");
  assert.equal(failed.reason, "delivery_failed");

  const flushed = await flushFeedbackQueue({ env, fetchImpl: async () => ({ ok: true, status: 204 }) });
  assert.deepEqual(flushed, { status: "flushed", uploaded: 1, remaining: 0, invalid: 0 });
  assert.deepEqual(await pendingEnvelopes(env), []);
});

test("does not lose feedback queued while another process flushes", async () => {
  const env = {
    ...(await temporaryEnv()),
    AI_TALK_FEEDBACK_ENDPOINT: "https://feedback.example.test/v1",
    AI_TALK_FEEDBACK_CONSENT: "1",
  };
  await submitFeedback(
    { feedback_id: "first", source: "user_feedback", rating: "helpful" },
    { env, fetchImpl: async () => ({ ok: false, status: 503 }) },
  );

  let releaseUpload;
  const uploadGate = new Promise((resolve) => { releaseUpload = resolve; });
  const flushing = flushFeedbackQueue({
    env,
    fetchImpl: async () => {
      await uploadGate;
      return { ok: true, status: 204 };
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  await submitFeedback(
    { feedback_id: "second", source: "user_feedback", rating: "neutral" },
    { env, fetchImpl: async () => ({ ok: false, status: 503 }) },
  );
  releaseUpload();

  const result = await flushing;
  assert.equal(result.uploaded, 1);
  const pending = await pendingEnvelopes(env);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].feedback_id, "second");
});

test("asks only when feedback has a consumer, with completed-task sampling", async () => {
  const localOnly = await temporaryEnv();
  assert.deepEqual(await shouldAskFeedback("failed", { env: localOnly }), {
    ask: false,
    reason: "endpoint_not_configured",
  });

  const consented = {
    ...localOnly,
    AI_TALK_FEEDBACK_ENDPOINT: "https://feedback.example.test/v1",
    AI_TALK_FEEDBACK_CONSENT: "1",
  };
  assert.deepEqual(await shouldAskFeedback("blocked", { env: consented }), {
    ask: true,
    reason: "non_success_terminal",
  });
  assert.deepEqual(await shouldAskFeedback("completed", { env: consented, random: () => 0.1 }), {
    ask: true,
    reason: "completed_sample",
    sample_rate: 0.2,
  });
  assert.equal((await shouldAskFeedback("completed", { env: consented, random: () => 0.9 })).ask, false);

  const forcedLocal = { ...localOnly, AI_TALK_FEEDBACK_PROMPT: "1" };
  assert.equal((await shouldAskFeedback("partial", { env: forcedLocal })).ask, true);
});

test("persists prompt opt-out and detects only explicit tool errors", async () => {
  const env = await temporaryEnv();
  assert.deepEqual(await readFeedbackPreference(env), { prompt_enabled: true, local_only: false });
  await writeFeedbackPreference(false, env);
  assert.deepEqual(await readFeedbackPreference(env), { prompt_enabled: false, local_only: false });
  await writeFeedbackPreference(true, env);
  assert.deepEqual(await readFeedbackPreference(env), { prompt_enabled: true, local_only: true });
  assert.equal((await shouldAskFeedback("failed", { env })).ask, true);
  assert.equal(isExplicitToolError({ tool_response: { is_error: true } }), true);
  assert.equal(isExplicitToolError({ tool_response: { exit_code: 1 } }), false);
});
