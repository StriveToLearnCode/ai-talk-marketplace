import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  prepareMarketplaceRelease,
  releaseVersion,
} from "../scripts/prepare-marketplace-release.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPDATER = path.join(ROOT, "scripts", "update-ai-talk.sh");

test("release version uses the base version and source commit", () => {
  assert.equal(
    releaseVersion("0.5.0+codex.old", "ABCDEF0123456789"),
    "0.5.0+codex.abcdef012345",
  );
  assert.throws(() => releaseVersion("0.5.0", "not-a-sha"), /hexadecimal Git commit/);
});

test("release preparation keeps main and public manifests synchronized", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ai-talk-release-"));
  const manifests = [
    "plugins/ai-talk/.codex-plugin/plugin.json",
    "ai-talk-public-marketplace/plugins/ai-talk/.codex-plugin/plugin.json",
  ];
  for (const relativePath of manifests) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify({ name: "ai-talk", version: "0.5.0+codex.old" }, null, 2)}\n`);
  }

  const result = await prepareMarketplaceRelease({ root, sourceSha: "1234567890abcdef" });
  assert.equal(result.version, "0.5.0+codex.1234567890ab");
  assert.equal(result.changed.length, 2);
  for (const relativePath of manifests) {
    const manifest = JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
    assert.equal(manifest.version, result.version);
  }
});

test("updater refreshes the marketplace before reinstalling the plugin", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "ai-talk-updater-"));
  const log = path.join(fixture, "codex.log");
  const codex = path.join(fixture, "codex");
  await writeFile(codex, `#!/bin/sh\nprintf '%s\\n' "$*" >>"$AI_TALK_TEST_LOG"\n`);
  await chmod(codex, 0o700);

  const result = spawnSync("sh", [UPDATER], {
    encoding: "utf8",
    env: { ...process.env, CODEX_BIN: codex, TMPDIR: fixture, AI_TALK_TEST_LOG: log },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readFile(log, "utf8")).trim().split("\n"), [
    "plugin marketplace upgrade ai-talk-marketplace",
    "plugin add ai-talk@ai-talk-marketplace",
  ]);
});

test("updater does not reinstall when marketplace refresh fails", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "ai-talk-updater-failure-"));
  const log = path.join(fixture, "codex.log");
  const codex = path.join(fixture, "codex");
  await writeFile(codex, `#!/bin/sh\nprintf '%s\\n' "$*" >>"$AI_TALK_TEST_LOG"\nexit 1\n`);
  await chmod(codex, 0o700);

  const result = spawnSync("sh", [UPDATER], {
    encoding: "utf8",
    env: { ...process.env, CODEX_BIN: codex, TMPDIR: fixture, AI_TALK_TEST_LOG: log },
  });
  assert.notEqual(result.status, 0);
  assert.equal(
    (await readFile(log, "utf8")).trim(),
    "plugin marketplace upgrade ai-talk-marketplace",
  );
});

test("platform installers include opt-in scheduling and uninstall paths", async () => {
  const [macos, linux, windows, workflow] = await Promise.all([
    readFile(path.join(ROOT, "scripts/install-auto-update-macos.sh"), "utf8"),
    readFile(path.join(ROOT, "scripts/install-auto-update-linux.sh"), "utf8"),
    readFile(path.join(ROOT, "scripts/install-auto-update-windows.ps1"), "utf8"),
    readFile(path.join(ROOT, ".github/workflows/release-plugin.yml"), "utf8"),
  ]);
  assert.match(macos, /launchctl bootstrap/);
  assert.match(macos, /--uninstall/);
  assert.match(linux, /systemctl --user enable --now/);
  assert.match(linux, /--uninstall/);
  assert.match(windows, /schtasks\.exe \/Create/);
  assert.match(windows, /\[switch\]\$Uninstall/);
  assert.match(workflow, /git subtree split --prefix=ai-talk-public-marketplace/);
  assert.match(workflow, /refs\/heads\/marketplace/);
  assert.match(workflow, /git push --force origin/);
});

test("POSIX scripts pass shell syntax validation", () => {
  for (const script of [
    "update-ai-talk.sh",
    "install-auto-update-macos.sh",
    "install-auto-update-linux.sh",
  ]) {
    const result = spawnSync("sh", ["-n", path.join(ROOT, "scripts", script)], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
});
