import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER = path.join(PLUGIN, "scripts", "install-strict-mode.mjs");

function runInstaller(project, ...args) {
  return spawnSync(process.execPath, [INSTALLER, "--project", project, ...args], {
    cwd: PLUGIN,
    encoding: "utf8",
  });
}

test("strict mode preserves existing AGENTS rules and is idempotent", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "ai-talk-strict-"));
  const agentsPath = path.join(project, "AGENTS.md");
  await writeFile(agentsPath, "# Project Rules\n\nRun the focused tests.\n");

  const first = runInstaller(project);
  const second = runInstaller(project);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).changed, false);

  const content = await readFile(agentsPath, "utf8");
  assert.match(content, /Run the focused tests\./);
  assert.equal(content.match(/ai-talk-strict-mode:start/g)?.length, 1);
  assert.match(content, /\$ai-talk:ai-talk/);

  const check = runInstaller(project, "--check");
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).status, "enabled");
});

test("strict mode dry-run and check do not create AGENTS.md", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "ai-talk-strict-dry-"));
  const dryRun = runInstaller(project, "--dry-run");
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(JSON.parse(dryRun.stdout).changed, true);
  await assert.rejects(readFile(path.join(project, "AGENTS.md"), "utf8"), /ENOENT/);

  const check = runInstaller(project, "--check");
  assert.equal(check.status, 1);
  assert.equal(JSON.parse(check.stdout).status, "missing");
});

test("strict mode removal deletes only its managed block", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "ai-talk-strict-remove-"));
  const agentsPath = path.join(project, "AGENTS.md");
  await writeFile(agentsPath, "# Existing\n\nKeep this rule.\n");
  assert.equal(runInstaller(project).status, 0);

  const removed = runInstaller(project, "--remove");
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(JSON.parse(removed.stdout).status, "removed");
  assert.equal(await readFile(agentsPath, "utf8"), "# Existing\n\nKeep this rule.\n");
});

test("strict mode refuses malformed managed markers", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "ai-talk-strict-invalid-"));
  await writeFile(path.join(project, "AGENTS.md"), "<!-- ai-talk-strict-mode:start -->\n");
  const result = runInstaller(project);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /incomplete AI Talk strict-mode block/);
});
