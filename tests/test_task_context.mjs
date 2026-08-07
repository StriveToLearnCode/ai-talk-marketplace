import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { collectTaskContext } from "../scripts/collect-task-context.mjs";

const execFileAsync = promisify(execFile);

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-context-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function git(root, ...args) {
  await execFileAsync("git", ["-C", root, ...args]);
}

test("collects branch, changed files, and target fingerprints without file contents", async (t) => {
  const root = await fixture(t);
  await git(root, "init", "-q");
  await git(root, "config", "user.email", "ai-talk@example.invalid");
  await git(root, "config", "user.name", "AI Talk Test");
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "reward.ts"), "export const reward = 1;\n");
  await git(root, "add", "src/reward.ts");
  await git(root, "commit", "-qm", "fixture");

  await writeFile(path.join(root, "src", "reward.ts"), "export const reward = 2;\n");
  await writeFile(path.join(root, "notes.txt"), "local note\n");
  const result = await collectTaskContext({ root, targets: ["src/reward.ts"] });

  assert.equal(result.activity_directory, await realpath(root));
  assert.ok(result.repository.branch);
  assert.match(result.repository.head, /^[a-f0-9]{40}$/u);
  assert.deepEqual(result.changed_files.map((entry) => entry.path).sort(), ["notes.txt", "src/reward.ts"]);
  assert.ok(result.changed_files.every((entry) => entry.source === "git_status"));
  assert.match(result.target_files[0].fingerprint.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(result).includes("export const"), false);
});

test("fingerprints reveal a target changed after the baseline", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "target.txt"), "before\n");
  const before = await collectTaskContext({ root, targets: ["target.txt"] });
  await writeFile(path.join(root, "target.txt"), "after\n");
  const after = await collectTaskContext({ root, targets: ["target.txt"] });

  assert.notEqual(
    before.target_files[0].fingerprint.sha256,
    after.target_files[0].fingerprint.sha256,
  );
  assert.equal(before.repository, null);
});

test("supports a newly initialized repository without HEAD", async (t) => {
  const root = await fixture(t);
  await git(root, "init", "-q");
  await writeFile(path.join(root, "first.txt"), "uncommitted\n");
  const result = await collectTaskContext({ root });

  assert.equal(result.repository.head, null);
  assert.ok(result.repository.branch);
  assert.deepEqual(result.changed_files.map((entry) => entry.path), ["first.txt"]);
});

test("rejects target paths outside the activity directory", async (t) => {
  const root = await fixture(t);
  await assert.rejects(
    collectTaskContext({ root, targets: ["../outside.txt"] }),
    /Target escapes activity directory/u,
  );
});
