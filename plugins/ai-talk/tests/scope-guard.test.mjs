import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUARD = path.join(PLUGIN, "scripts", "scope-guard.mjs");

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function runGuard(project, ...args) {
  return run(process.execPath, [GUARD, ...args, "--project", project], PLUGIN);
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
