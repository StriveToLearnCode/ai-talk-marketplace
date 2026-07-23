import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER = path.join(PLUGIN, "scripts", "install-feedback-hooks.mjs");

test("installer preserves existing hooks and remains idempotent", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "ai-talk-hook-install-"));
  const codexDir = path.join(project, ".codex");
  await mkdir(codexDir);
  await writeFile(path.join(codexDir, "hooks.json"), JSON.stringify({
    hooks: {
      Stop: [{ hooks: [{ type: "command", command: "node existing-hook.mjs" }] }],
      PostToolUse: [
        { hooks: [{ type: "command", command: "node existing-tool-hook.mjs" }] },
        { hooks: [{ type: "command", command: "node /old/feedback-hook.mjs" }] },
      ],
    },
  }));

  for (let run = 0; run < 2; run += 1) {
    const result = spawnSync(process.execPath, [INSTALLER, "--project", project], {
      cwd: PLUGIN,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  }

  const config = JSON.parse(await readFile(path.join(codexDir, "hooks.json"), "utf8"));
  assert.equal(config.hooks.Stop.length, 2);
  assert.equal(config.hooks.PostToolUse.length, 1);
  assert.match(config.hooks.PostToolUse[0].hooks[0].command, /existing-tool-hook\.mjs/);
  assert.doesNotMatch(config.hooks.PostToolUse[0].hooks[0].command, /feedback-hook\.mjs/);
  assert.match(config.hooks.Stop[1].hooks[0].command, /feedback-hook\.mjs/);
  assert.equal(config.hooks.Stop.filter((group) => (
    group.hooks.some((hook) => hook.command.includes("feedback-hook.mjs"))
  )).length, 1);
});

test("installer dry-run does not write project config", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "ai-talk-hook-dry-run-"));
  const result = spawnSync(process.execPath, [INSTALLER, "--project", project, "--dry-run"], {
    cwd: PLUGIN,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "dry_run");
  await assert.rejects(readFile(path.join(project, ".codex", "hooks.json"), "utf8"), /ENOENT/);
});
