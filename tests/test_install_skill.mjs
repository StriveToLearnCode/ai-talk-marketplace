import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readlink, symlink, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { installSkill, parseInstallArgs } from "../scripts/install-skill.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("rejects unknown or incomplete installer arguments", () => {
  assert.throws(() => parseInstallArgs(["--unknown"]), /Unknown argument/);
  assert.throws(() => parseInstallArgs(["--home"]), /requires a value/);
  assert.throws(() => parseInstallArgs(["--source", "--home", "/tmp/home"]), /requires a value/);
});

test("installs the same valid skill into Codex and Agents discovery roots", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "ai-talk-install-"));
  const result = await installSkill({ sourceDir: ROOT, homeDir });

  assert.equal(result.restart_required, true);
  assert.match(result.restart_reason, /new task/i);
  for (const root of [".codex", ".agents"]) {
    const target = path.join(homeDir, root, "skills", "ai-talk");
    assert.equal(path.resolve(path.dirname(target), await readlink(target)), ROOT);
  }
});

test("repairs a stale versioned symlink", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "ai-talk-repair-"));
  const agentsRoot = path.join(homeDir, ".agents", "skills");
  await mkdir(agentsRoot, { recursive: true });
  await symlink("../../missing-cache/ai-talk", path.join(agentsRoot, "ai-talk"));

  const result = await installSkill({ sourceDir: ROOT, homeDir });
  assert.equal(result.links.find(({ target }) => target.includes(".agents"))?.status, "repaired");
});

test("refuses to replace a real directory", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "ai-talk-protect-"));
  await installSkill({ sourceDir: ROOT, homeDir });

  const protectedPath = path.join(homeDir, ".codex", "skills", "ai-talk");
  await unlink(protectedPath);
  await mkdir(protectedPath);
  await assert.rejects(
    installSkill({ sourceDir: ROOT, homeDir }),
    /Refusing to replace non-symlink path/,
  );
  assert.equal((await lstat(protectedPath)).isDirectory(), true);
});

test("validates both discovery roots before repairing either one", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "ai-talk-atomic-"));
  const codexRoot = path.join(homeDir, ".codex", "skills");
  const agentsRoot = path.join(homeDir, ".agents", "skills");
  await mkdir(codexRoot, { recursive: true });
  await mkdir(path.join(agentsRoot, "ai-talk"), { recursive: true });
  const staleTarget = path.join(codexRoot, "ai-talk");
  await symlink("../../missing-cache/ai-talk", staleTarget);

  await assert.rejects(
    installSkill({ sourceDir: ROOT, homeDir }),
    /Refusing to replace non-symlink path/,
  );
  assert.equal(await readlink(staleTarget), "../../missing-cache/ai-talk");
});
