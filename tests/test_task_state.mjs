import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPreflight,
  listTaskStates,
  loadTaskState,
  saveTaskState,
} from "../scripts/task-state.mjs";

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), "ai-talk-state-"));
  const root = path.join(base, "activity");
  const storeRoot = path.join(base, "state");
  await mkdir(root);
  t.after(() => rm(base, { recursive: true, force: true }));
  return { base, root, storeRoot };
}

async function runCli(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `CLI exited with ${code}`));
    });
    child.stdin.end(input);
  });
}

function lotteryState(overrides = {}) {
  return {
    task_key: "lottery/can-lottery-times",
    status: "active",
    goal: { value: "补四个奖励名称", source: "user" },
    confirmed_results: [
      { value: "四个奖励位置已对准，不能再动", source: "user", status: "protected" },
    ],
    corrections: [
      { value: "名称不能只依赖接口；接口无名称时从道具配置取", source: "user" },
    ],
    boundaries: [
      { kind: "allowed", value: "可以改本地代码", source: "user" },
      { kind: "prohibited", value: "不发布", source: "user" },
      { kind: "prohibited", value: "不覆盖其他改动", source: "user" },
    ],
    acceptance: [
      { value: "四个奖励名称都显示", status: "pending", source: "user" },
      { value: "四个奖励位置保持不变", status: "pending", source: "user" },
    ],
    next_action: { value: "只补名称并在页面验证", source: "conversation" },
    bindings: [
      { name: "text", value: "lottery/can-lottery-times", source: "user" },
    ],
    ...overrides,
  };
}

test("persists and restores only next-step state outside the activity repository", async (t) => {
  const { root, storeRoot } = await fixture(t);
  await writeFile(path.join(root, "reward.vue"), "<template>before</template>\n");

  const saved = await saveTaskState({
    root,
    taskKey: "lottery/can-lottery-times",
    state: {
      ...lotteryState(),
      raw_logs: ["must not persist"],
      hypotheses: [{ value: "not next-step state" }],
      todos: [{ value: "old completed action" }],
    },
    targets: ["reward.vue"],
    storeRoot,
  });
  const restored = await loadTaskState({ root, taskKey: "lottery/can-lottery-times", storeRoot });

  assert.deepEqual(restored, saved);
  assert.equal(restored.goal.value, "补四个奖励名称");
  assert.equal(restored.confirmed_results[0].status, "protected");
  assert.equal("raw_logs" in restored, false);
  assert.equal("hypotheses" in restored, false);
  assert.equal("todos" in restored, false);
  assert.equal(restored.workspace.target_files[0].path, "reward.vue");
  assert.equal((await stat(storeRoot)).mode & 0o777, 0o700);
  const stateFiles = await readdir(storeRoot);
  const firstStateFile = path.join(storeRoot, stateFiles[0]);
  assert.equal((await stat(firstStateFile)).mode & 0o777, 0o600);
});

test("preflight reminds the agent what cannot regress and detects parallel file changes", async (t) => {
  const { root, storeRoot } = await fixture(t);
  const target = path.join(root, "reward.vue");
  await writeFile(target, "<template>before</template>\n");
  await saveTaskState({
    root,
    taskKey: "lottery/can-lottery-times",
    state: lotteryState(),
    targets: ["reward.vue"],
    storeRoot,
  });

  await writeFile(target, "<template>parallel change</template>\n");
  const preflight = await buildPreflight({
    root,
    taskKey: "lottery/can-lottery-times",
    storeRoot,
  });

  assert.match(preflight.text, /当前唯一目标：补四个奖励名称/u);
  assert.match(preflight.text, /不可回归：四个奖励位置已对准，不能再动/u);
  assert.match(preflight.text, /用户纠正：名称不能只依赖接口；接口无名称时从道具配置取/u);
  assert.match(preflight.text, /禁止：不发布；不覆盖其他改动/u);
  assert.match(preflight.text, /四个奖励名称都显示\[待验证\]/u);
  assert.match(preflight.text, /基线后变化（修改者未知，必须基于现状合并）：reward\.vue/u);
  assert.deepEqual(preflight.changed_files, ["reward.vue"]);
});

test("isolates task keys and lists recoverable state for one activity", async (t) => {
  const { base, root, storeRoot } = await fixture(t);
  const otherRoot = path.join(base, "other");
  await mkdir(otherRoot);

  await saveTaskState({ root, taskKey: "lottery/can-lottery-times", state: lotteryState(), storeRoot });
  await saveTaskState({
    root,
    taskKey: "lottery/reward-image",
    state: lotteryState({
      task_key: "lottery/reward-image",
      goal: { value: "补奖励图片", source: "user" },
    }),
    storeRoot,
  });
  await saveTaskState({ root: otherRoot, taskKey: "other-task", state: lotteryState(), storeRoot });

  const listed = await listTaskStates({ root, storeRoot });
  assert.deepEqual(new Set(listed.map((item) => item.task_key)), new Set([
    "lottery/can-lottery-times",
    "lottery/reward-image",
  ]));
});

test("CLI state survives a separate process", async (t) => {
  const { root, storeRoot } = await fixture(t);
  const script = path.resolve("scripts/task-state.mjs");
  await runCli([
    script,
    "save",
    "--root",
    root,
    "--task",
    "lottery/can-lottery-times",
    "--store-root",
    storeRoot,
  ], JSON.stringify(lotteryState()));

  const loaded = await runCli([
    script,
    "load",
    "--root",
    root,
    "--task",
    "lottery/can-lottery-times",
    "--store-root",
    storeRoot,
  ]);
  assert.equal(JSON.parse(loaded.stdout).goal.value, "补四个奖励名称");
});

test("rejects unbounded state instead of silently growing it", async (t) => {
  const { root, storeRoot } = await fixture(t);
  const tooMany = Array.from({ length: 9 }, (_, index) => ({
    value: `result ${index}`,
    source: "user",
  }));
  await assert.rejects(
    saveTaskState({
      root,
      taskKey: "lottery/can-lottery-times",
      state: lotteryState({ confirmed_results: tooMany }),
      storeRoot,
    }),
    /cannot contain more than 8 items/u,
  );
});

test("does not refresh the baseline when next-step state is unchanged", async (t) => {
  const { root, storeRoot } = await fixture(t);
  const target = path.join(root, "reward.vue");
  await writeFile(target, "before\n");
  const first = await saveTaskState({
    root,
    taskKey: "lottery/can-lottery-times",
    state: lotteryState(),
    targets: ["reward.vue"],
    storeRoot,
  });
  await writeFile(target, "changed after baseline\n");
  const second = await saveTaskState({
    root,
    taskKey: "lottery/can-lottery-times",
    state: lotteryState(),
    targets: ["reward.vue"],
    storeRoot,
  });

  assert.equal(second.updated_at, first.updated_at);
  assert.equal(
    second.workspace.target_files[0].fingerprint.sha256,
    first.workspace.target_files[0].fingerprint.sha256,
  );
  assert.deepEqual(
    (await buildPreflight({ root, taskKey: "lottery/can-lottery-times", storeRoot })).changed_files,
    ["reward.vue"],
  );
});

test("complete state keeps verified acceptance without inventing another action", async (t) => {
  const { root, storeRoot } = await fixture(t);
  const state = lotteryState({
    status: "complete",
    acceptance: [
      { value: "四个奖励名称都显示", status: "verified", source: "page verification" },
      { value: "四个奖励位置保持不变", status: "verified", source: "page verification" },
    ],
  });
  const saved = await saveTaskState({
    root,
    taskKey: "lottery/can-lottery-times",
    state,
    storeRoot,
  });
  assert.equal(saved.status, "complete");
  assert.ok(saved.acceptance.every((item) => item.status === "verified"));
  assert.equal("next_action" in saved, false);
});
