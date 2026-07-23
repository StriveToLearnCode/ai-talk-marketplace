#!/usr/bin/env node

import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

async function readHooks(targetPath) {
  try {
    const parsed = JSON.parse(await readFile(targetPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    if (!parsed.hooks || typeof parsed.hooks !== "object" || Array.isArray(parsed.hooks)) {
      parsed.hooks = {};
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return { hooks: {} };
    throw new Error(`Cannot merge invalid hook config at ${targetPath}.`);
  }
}

function containsAiTalkHook(group) {
  return group?.hooks?.some((hook) => (
    hook?.type === "command" && String(hook.command).includes("feedback-hook.mjs")
  ));
}

function mergeHook(config, event, group) {
  const groups = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
  config.hooks[event] = [...groups.filter((candidate) => !containsAiTalkHook(candidate)), group];
}

function removeAiTalkHooks(config, event) {
  if (!Array.isArray(config.hooks[event])) return;
  const retained = config.hooks[event].filter((candidate) => !containsAiTalkHook(candidate));
  if (retained.length) config.hooks[event] = retained;
  else delete config.hooks[event];
}

async function main() {
  const projectRoot = path.resolve(argumentValue("--project") || process.cwd());
  const targetPath = path.join(projectRoot, ".codex", "hooks.json");
  const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const hookScript = path.join(pluginRoot, "scripts", "feedback-hook.mjs");
  const command = `node ${shellQuote(hookScript)}`;
  const config = await readHooks(targetPath);

  // Tool errors cannot be attributed to AI Talk without a routed task identifier.
  // Remove older global collectors and install only the terminal-question safety net.
  removeAiTalkHooks(config, "PostToolUse");
  mergeHook(config, "Stop", {
    hooks: [{ type: "command", command, timeout: 5 }],
  });

  if (process.argv.includes("--dry-run")) {
    process.stdout.write(`${JSON.stringify({ status: "dry_run", target: targetPath, config }, null, 2)}\n`);
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, targetPath);
  await chmod(targetPath, 0o600).catch(() => {});
  process.stdout.write(`${JSON.stringify({ status: "installed", target: targetPath })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
