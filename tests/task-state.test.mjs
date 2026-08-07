import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { collectTaskContext } from "../scripts/collect-task-context.mjs";
import { buildPreflight, loadTaskState, saveTaskState } from "../scripts/task-state.mjs";

const execFileAsync = promisify(execFile);

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "ai-talk-test-")));
  await execFileAsync("git", ["init", "-q", root]);
  await execFileAsync("git", ["-C", root, "checkout", "-q", "-b", "act-20260709-c"]);
  const activity = path.join(root, "apps", "short", "20260709-c");
  const page = path.join(activity, "pages-F");
  await mkdir(path.join(page, "components"), { recursive: true });
  await writeFile(path.join(root, "AGENTS.md"), "root rules\n");
  await writeFile(path.join(activity, "AGENTS.md"), "activity rules\n");
  await writeFile(path.join(page, "AGENTS.md"), "page rules\n");
  await writeFile(path.join(page, "components", "RewardDialog.vue"), "<template />\n");
  return { root, activity, page, target: "apps/short/20260709-c/pages-F/components/RewardDialog.vue" };
}

function state() {
  return {
    status: "active",
    current_goal: { value: "奖励弹窗只请求一次", source: "user" },
    change_boundaries: [
      { kind: "constraint", value: "只改弹窗调用链", source: "user" },
    ],
    verified_facts: [
      {
        value: "RewardDialog.vue 负责目标弹窗",
        source: "source:RewardDialog.vue",
        verified_by: "source",
        protected: true,
      },
    ],
    pending_checks: [{ value: "验证接口只触发一次", source: "acceptance" }],
    completion_criteria: [{ id: "request-once", value: "接口只触发一次", source: "user" }],
    next_action: { value: "定位重复入口", source: "conversation" },
  };
}

test("derives activity, page, and nearest AGENTS.md", async () => {
  const setup = await fixture();
  const context = await collectTaskContext({ root: setup.root });
  assert.equal(context.activity_source, "branch");
  assert.equal(context.activity_directory, setup.activity);
  assert.equal(context.page_directory, setup.page);
  assert.equal(context.agents_file, path.join(setup.page, "AGENTS.md"));
});

test("saves six-field state and includes repository bindings in preflight", async () => {
  const setup = await fixture();
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-store-"));
  const saved = await saveTaskState({
    root: setup.root,
    taskKey: "reward-dialog/request-once",
    state: state(),
    targets: [setup.target],
    storeRoot,
  });

  assert.equal(saved.workspace.activity_directory, setup.activity);
  assert.equal(saved.workspace.page_directory, setup.page);
  assert.equal(saved.workspace.agents_file, path.join(setup.page, "AGENTS.md"));
  assert.match(saved.workspace.agents_fingerprint.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(saved.verified_facts[0].protected, true);

  const loaded = await loadTaskState({
    root: setup.root,
    taskKey: "reward-dialog/request-once",
    storeRoot,
  });
  assert.equal(loaded.current_goal.value, "奖励弹窗只请求一次");

  const preflight = await buildPreflight({
    root: setup.root,
    taskKey: "reward-dialog/request-once",
    storeRoot,
  });
  assert.match(preflight.text, /不可回归：RewardDialog\.vue 负责目标弹窗/u);
  assert.match(preflight.text, /待验证：验证接口只触发一次/u);
  assert.match(preflight.text, /pages-F\/AGENTS\.md/u);
});

test("does not rewrite unchanged state", async () => {
  const setup = await fixture();
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-store-"));
  const options = {
    root: setup.root,
    taskKey: "stable-state",
    state: state(),
    targets: [setup.target],
    storeRoot,
  };
  const first = await saveTaskState(options);
  const second = await saveTaskState(options);
  assert.equal(second.updated_at, first.updated_at);
});

test("reports a conflict between target path and branch-derived activity", async () => {
  const setup = await fixture();
  const other = path.join(setup.root, "apps", "short", "20260710", "pages-A");
  await mkdir(other, { recursive: true });
  await writeFile(path.join(other, "AGENTS.md"), "other page rules\n");
  const target = path.join(other, "page.vue");
  await writeFile(target, "<template />\n");

  const context = await collectTaskContext({ root: setup.page, targets: [target] });
  assert.equal(context.activity_directory, path.dirname(other));
  assert.equal(context.activity_source, "target");
  assert.deepEqual(context.activity_conflict, {
    path: path.dirname(other),
    branch: setup.activity,
  });
});

test("detects content changes in the same AGENTS.md", async () => {
  const setup = await fixture();
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-store-"));
  await saveTaskState({
    root: setup.root,
    taskKey: "agents-fingerprint",
    state: state(),
    targets: [setup.target],
    storeRoot,
  });
  await writeFile(path.join(setup.page, "AGENTS.md"), "updated page rules\n");

  const preflight = await buildPreflight({ root: setup.root, taskKey: "agents-fingerprint", storeRoot });
  assert.match(preflight.text, /AGENTS\.md 内容已变化/u);
});

test("preflight works when no AGENTS.md exists", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "ai-talk-no-agents-")));
  const target = path.join(root, "page.vue");
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-store-"));
  await writeFile(target, "<template />\n");
  await saveTaskState({ root, taskKey: "no-agents", state: state(), targets: [target], storeRoot });

  const preflight = await buildPreflight({ root, taskKey: "no-agents", storeRoot });
  assert.doesNotMatch(preflight.text, /AGENTS\.md/u);
});

test("requires completion criteria and linked verified facts for complete states", async () => {
  const setup = await fixture();
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-store-"));
  const base = {
    status: "complete",
    current_goal: { value: "奖励弹窗正常", source: "user" },
    change_boundaries: [],
    verified_facts: [],
    pending_checks: [],
    completion_criteria: [],
  };

  await assert.rejects(
    saveTaskState({ root: setup.root, taskKey: "no-criteria", state: base, storeRoot }),
    /complete states require completion_criteria/u,
  );
  await assert.rejects(
    saveTaskState({
      root: setup.root,
      taskKey: "no-evidence-link",
      storeRoot,
      state: {
        ...base,
        verified_facts: [{ value: "弹窗已打开", source: "runtime:test", verified_by: "runtime" }],
        completion_criteria: [{ id: "dialog-visible", value: "弹窗正常展示", source: "user" }],
      },
    }),
    /lacks verified facts for criteria: dialog-visible/u,
  );
  await assert.rejects(
    saveTaskState({
      root: setup.root,
      taskKey: "partially-covered",
      storeRoot,
      state: {
        ...base,
        verified_facts: [{
          value: "接口只请求一次",
          source: "runtime:test",
          verified_by: "runtime",
          satisfies: ["request-once"],
        }],
        completion_criteria: [
          { id: "request-once", value: "接口只请求一次", source: "user" },
          { id: "dialog-visible", value: "弹窗正常展示", source: "user" },
        ],
      },
    }),
    /lacks verified facts for criteria: dialog-visible/u,
  );

  const saved = await saveTaskState({
    root: setup.root,
    taskKey: "complete-with-evidence",
    storeRoot,
    state: {
      ...base,
      verified_facts: [{
        value: "弹窗已正常打开",
        source: "runtime:test",
        verified_by: "runtime",
        satisfies: ["dialog-visible"],
      }],
      completion_criteria: [{ id: "dialog-visible", value: "弹窗正常展示", source: "user" }],
    },
  });
  assert.equal(saved.status, "complete");
});

test("documents the context collector with a skill-relative executable path", async () => {
  const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /node <skill-dir>\/scripts\/collect-task-context\.mjs/u);
});

test("uses the nearest AGENTS.md for an explicit shared target", async () => {
  const setup = await fixture();
  const shared = path.join(setup.root, "core", "ui-components", "reward-dialog");
  await mkdir(shared, { recursive: true });
  await writeFile(path.join(shared, "AGENTS.md"), "component rules\n");
  const target = path.join(shared, "index.vue");
  await writeFile(target, "<template />\n");

  const context = await collectTaskContext({ root: setup.root, targets: [target] });
  assert.equal(context.activity_directory, setup.activity);
  assert.equal(context.page_directory, setup.page);
  assert.equal(context.agents_file, path.join(shared, "AGENTS.md"));
});

test("migrates legacy state into the six-field schema on save", async () => {
  const setup = await fixture();
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-store-"));
  const saved = await saveTaskState({
    root: setup.root,
    taskKey: "legacy",
    storeRoot,
    state: {
      status: "active",
      goal: { value: "旧目标", source: "user" },
      confirmed_results: [{ value: "布局不能回归", source: "user" }],
      corrections: [{ value: "只改文案", source: "user" }],
      boundaries: [],
      acceptance: [{ value: "页面正常", source: "user", status: "pending" }],
      next_action: { value: "验证页面", source: "conversation" },
    },
  });

  assert.equal(saved.version, 3);
  assert.equal(saved.current_goal.value, "旧目标");
  assert.equal(saved.change_boundaries[0].kind, "constraint");
  assert.equal(saved.verified_facts[0].protected, true);
  assert.equal(saved.pending_checks[0].value, "页面正常");
  assert.equal(saved.completion_criteria[0].value, "页面正常");
});

test("reopens a v2 complete state when its fact cannot be linked safely", async () => {
  const setup = await fixture();
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-store-"));
  const saved = await saveTaskState({
    root: setup.root,
    taskKey: "v2-complete",
    storeRoot,
    state: {
      version: 2,
      status: "complete",
      current_goal: { value: "弹窗正常展示", source: "user" },
      change_boundaries: [],
      verified_facts: [{ value: "弹窗已展示", source: "runtime:test", verified_by: "runtime" }],
      pending_checks: [],
      completion_criteria: [{ value: "弹窗正常展示", source: "user" }],
    },
  });

  assert.equal(saved.version, 3);
  assert.equal(saved.status, "active");
  assert.equal(saved.verified_facts[0].satisfies, undefined);
  assert.equal(saved.pending_checks[0].value, "重新验证：弹窗正常展示");
  assert.equal(saved.next_action.value, "重新验证：弹窗正常展示");
});

test("keeps a v2 complete state when an exact verified fact matches its criterion", async () => {
  const setup = await fixture();
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-store-"));
  const saved = await saveTaskState({
    root: setup.root,
    taskKey: "v2-complete-exact",
    storeRoot,
    state: {
      version: 2,
      status: "complete",
      current_goal: { value: "弹窗正常展示", source: "user" },
      change_boundaries: [],
      verified_facts: [{ value: "弹窗正常展示", source: "runtime:test", verified_by: "runtime" }],
      pending_checks: [],
      completion_criteria: [{ value: "弹窗正常展示", source: "user" }],
    },
  });

  assert.equal(saved.status, "complete");
  assert.deepEqual(saved.verified_facts[0].satisfies, [saved.completion_criteria[0].id]);
});
