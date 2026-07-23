import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = path.join(PLUGIN, "scripts/feedback-hook.mjs");

async function runHook(input, extraEnv = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "ai-talk-hook-"));
  const result = spawnSync(process.execPath, [HOOK], {
    cwd: PLUGIN,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, AI_TALK_FEEDBACK_DIR: dataDir, ...extraEnv },
  });
  assert.equal(result.status, 0, result.stderr);
  return { ...result, dataDir };
}

test("Stop blocks once when an eligible response omitted the feedback question", async () => {
  const result = await runHook({
    hook_event_name: "Stop",
    last_assistant_message: "任务已完成。 <!-- ai-talk-feedback:eligible -->",
  });
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, "block");
  assert.match(output.reason, /AI Talk 对这次需求理解和执行交接有帮助吗/);
});

test("Stop allows responses that already asked or are not eligible", async () => {
  const asked = await runHook({
    hook_event_name: "Stop",
    last_assistant_message: "完成。 <!-- ai-talk-feedback:eligible --> <!-- ai-talk-feedback:asked -->",
  });
  assert.equal(asked.stdout, "");
  const status = await runHook({ hook_event_name: "Stop", last_assistant_message: "还在运行测试。" });
  assert.equal(status.stdout, "");
});

test("PostToolUse stores metadata only for an identified AI Talk task", async () => {
  const result = await runHook({
    hook_event_name: "PostToolUse",
    ai_talk_task_id: "task-123",
    tool_name: "exec_command",
    tool_input: { command: "contains-private-source" },
    tool_response: { is_error: true, output: "token=top-secret" },
  }, { AI_TALK_FEEDBACK_PROMPT: "1" });
  assert.equal(result.stdout, "");
  const pending = path.join(result.dataDir, "feedback-spool", "pending");
  const [fileName] = await readdir(pending);
  const queue = await readFile(path.join(pending, fileName), "utf8");
  assert.match(queue, /tool_error:exec_command/);
  assert.doesNotMatch(queue, /contains-private-source|top-secret/);
});

test("PostToolUse ignores errors without an AI Talk task identifier", async () => {
  const result = await runHook({
    hook_event_name: "PostToolUse",
    tool_name: "exec_command",
    tool_response: { is_error: true },
  }, { AI_TALK_FEEDBACK_PROMPT: "1" });
  await assert.rejects(
    readFile(path.join(result.dataDir, "feedback-spool", "pending", "missing.json"), "utf8"),
    /ENOENT/,
  );
});

test("feedback storage failures never fail the primary hook", async () => {
  const result = spawnSync(process.execPath, [HOOK], {
    cwd: PLUGIN,
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      ai_talk_task_id: "task-123",
      tool_name: "exec_command",
      tool_response: { is_error: true },
    }),
    encoding: "utf8",
    env: { ...process.env, AI_TALK_FEEDBACK_DIR: "/dev/null/not-a-directory" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});
