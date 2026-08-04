import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUARD = path.join(SKILL_ROOT, "scripts", "scope-guard.mjs");

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function runGuard(project, ...args) {
  return run(process.execPath, [GUARD, ...args, "--project", project], SKILL_ROOT);
}

async function fixture() {
  const project = await mkdtemp(path.join(tmpdir(), "ai-talk-scope-"));
  await mkdir(path.join(project, "core"), { recursive: true });
  await mkdir(path.join(project, "src"), { recursive: true });
  await writeFile(path.join(project, "core", "component.js"), "export const core = 1;\n");
  await writeFile(path.join(project, "src", "allowed.js"), "export const value = 1;\n");
  assert.equal(run("git", ["init", "-q"], project).status, 0);
  assert.equal(run("git", ["config", "user.email", "ai-talk@example.test"], project).status, 0);
  assert.equal(run("git", ["config", "user.name", "AI Talk Test"], project).status, 0);
  assert.equal(run("git", ["add", "."], project).status, 0);
  assert.equal(run("git", ["commit", "-qm", "initial"], project).status, 0);
  return {
    project,
    baseline: path.join(project, ".git", "ai-talk-scope-baseline.json"),
  };
}

async function snapshot(project, baseline) {
  const result = runGuard(project, "snapshot", "--out", baseline);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "snapshotted");
}

test("excluded scope rejects files changed after the baseline", async () => {
  const { project, baseline } = await fixture();
  await snapshot(project, baseline);
  await writeFile(path.join(project, "core", "component.js"), "export const core = 2;\n");

  const result = runGuard(project, "verify", "--baseline", baseline, "--exclude", "**/core/**");
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "violation");
  assert.deepEqual(output.excluded_files, ["core/component.js"]);
});

test("pre-existing dirty files are ignored until this task changes them", async () => {
  const { project, baseline } = await fixture();
  await writeFile(path.join(project, "core", "component.js"), "export const core = 2;\n");
  await snapshot(project, baseline);
  await writeFile(path.join(project, "src", "allowed.js"), "export const value = 2;\n");

  const unchanged = runGuard(project, "verify", "--baseline", baseline, "--exclude", "**/core/**");
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.deepEqual(JSON.parse(unchanged.stdout).changed_files, ["src/allowed.js"]);

  await writeFile(path.join(project, "core", "component.js"), "export const core = 3;\n");
  const changed = runGuard(project, "verify", "--baseline", baseline, "--exclude", "**/core/**");
  assert.equal(changed.status, 1);
  assert.deepEqual(JSON.parse(changed.stdout).excluded_files, ["core/component.js"]);
});

test("snapshot separates staged, unstaged, and untracked user state", async () => {
  const { project, baseline } = await fixture();
  await writeFile(path.join(project, "src", "allowed.js"), "export const value = 2;\n");
  assert.equal(run("git", ["add", "src/allowed.js"], project).status, 0);
  await writeFile(path.join(project, "core", "component.js"), "export const core = 2;\n");
  await writeFile(path.join(project, "src", "untracked.js"), "export const fresh = true;\n");

  const result = runGuard(project, "snapshot", "--out", baseline);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.git_state.staged, ["src/allowed.js"]);
  assert.deepEqual(output.git_state.unstaged, ["core/component.js"]);
  assert.deepEqual(output.git_state.untracked, ["src/untracked.js"]);
  assert.deepEqual(output.stashes, []);
});

test("changing only the staging state is detected separately from worktree content", async () => {
  const { project, baseline } = await fixture();
  await writeFile(path.join(project, "src", "allowed.js"), "export const value = 2;\n");
  await snapshot(project, baseline);
  assert.equal(run("git", ["add", "src/allowed.js"], project).status, 0);

  const result = runGuard(
    project,
    "verify",
    "--baseline",
    baseline,
    "--policy",
    "bounded",
    "--allow",
    "src/allowed.js",
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.changed_files, ["src/allowed.js"]);
  assert.deepEqual(output.changed_worktree_files, []);
  assert.deepEqual(output.changed_index_files, ["src/allowed.js"]);
  assert.deepEqual(output.git_state.baseline.unstaged, ["src/allowed.js"]);
  assert.deepEqual(output.git_state.current.staged, ["src/allowed.js"]);
});

test("a recorded tool stash must be restored and does not become task-authored work", async () => {
  const { project, baseline } = await fixture();
  await writeFile(path.join(project, "src", "allowed.js"), "export const value = 2;\n");
  assert.equal(run("git", ["add", "src/allowed.js"], project).status, 0);
  await writeFile(path.join(project, "core", "component.js"), "export const core = 2;\n");
  await snapshot(project, baseline);

  assert.equal(run("git", ["stash", "push", "-m", "ai-talk-tool:test"], project).status, 0);
  const stashOid = run("git", ["rev-parse", "stash@{0}"], project).stdout.trim();
  const unrestored = runGuard(
    project,
    "verify",
    "--baseline",
    baseline,
    "--tool-stash",
    stashOid,
  );
  assert.equal(unrestored.status, 1);
  assert.deepEqual(JSON.parse(unrestored.stdout).git_state_risks, ["tool_stash_not_restored"]);

  assert.equal(run("git", ["stash", "pop", "--index"], project).status, 0);
  const restored = runGuard(
    project,
    "verify",
    "--baseline",
    baseline,
    "--tool-stash",
    stashOid,
  );
  assert.equal(restored.status, 0, restored.stderr);
  const output = JSON.parse(restored.stdout);
  assert.deepEqual(output.changed_files, []);
  assert.deepEqual(output.stash_state.restored_tool_stashes, [stashOid]);
  assert.deepEqual(output.git_state.baseline, output.git_state.current);
});

test("ordinary commits and pre-existing stashes cannot be claimed as tool stashes", async () => {
  const { project, baseline } = await fixture();
  await snapshot(project, baseline);
  const headOid = run("git", ["rev-parse", "HEAD"], project).stdout.trim();
  const ordinaryCommit = runGuard(
    project,
    "verify",
    "--baseline",
    baseline,
    "--tool-stash",
    headOid,
  );
  assert.equal(ordinaryCommit.status, 2);
  assert.match(ordinaryCommit.stderr, /not a stash commit/);

  await writeFile(path.join(project, "src", "allowed.js"), "export const value = 2;\n");
  assert.equal(run("git", ["stash", "push", "-m", "user-owned"], project).status, 0);
  const userStashOid = run("git", ["rev-parse", "stash@{0}"], project).stdout.trim();
  await snapshot(project, baseline);
  const preExisting = runGuard(
    project,
    "verify",
    "--baseline",
    baseline,
    "--tool-stash",
    userStashOid,
  );
  assert.equal(preExisting.status, 1);
  assert.ok(
    JSON.parse(preExisting.stdout).git_state_risks.includes(
      "pre_existing_stash_misclassified_as_tool",
    ),
  );
});

test("bounded scope rejects changes outside the allowlist", async () => {
  const { project, baseline } = await fixture();
  await snapshot(project, baseline);
  await writeFile(path.join(project, "src", "other.js"), "export const other = true;\n");

  const result = runGuard(
    project,
    "verify",
    "--baseline",
    baseline,
    "--policy",
    "bounded",
    "--allow",
    "src/allowed.js",
  );
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.out_of_scope_files, ["src/other.js"]);
});

test("bounded scope accepts the exact allowlisted file", async () => {
  const { project, baseline } = await fixture();
  await snapshot(project, baseline);
  await writeFile(path.join(project, "src", "allowed.js"), "export const value = 2;\n");

  const result = runGuard(
    project,
    "verify",
    "--baseline",
    baseline,
    "--policy",
    "bounded",
    "--allow",
    "src/allowed.js",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).changed_files, ["src/allowed.js"]);
});
