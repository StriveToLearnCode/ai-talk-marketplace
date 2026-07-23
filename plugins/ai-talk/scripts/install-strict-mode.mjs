#!/usr/bin/env node

import { chmod, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const START_MARKER = "<!-- ai-talk-strict-mode:start -->";
const END_MARKER = "<!-- ai-talk-strict-mode:end -->";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function managedRange(content) {
  const start = content.indexOf(START_MARKER);
  const end = content.indexOf(END_MARKER);
  if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) {
    throw new Error("AGENTS.md contains an incomplete AI Talk strict-mode block.");
  }
  if (start === -1) return null;
  const duplicateStart = content.indexOf(START_MARKER, start + START_MARKER.length);
  const duplicateEnd = content.indexOf(END_MARKER, end + END_MARKER.length);
  if (duplicateStart !== -1 || duplicateEnd !== -1) {
    throw new Error("AGENTS.md contains multiple AI Talk strict-mode blocks.");
  }
  return { start, end: end + END_MARKER.length };
}

function installBlock(content, template) {
  const range = managedRange(content);
  if (range) return `${content.slice(0, range.start)}${template}${content.slice(range.end)}`;
  const prefix = content.trimEnd();
  return prefix ? `${prefix}\n\n${template}\n` : `${template}\n`;
}

function removeBlock(content) {
  const range = managedRange(content);
  if (!range) return content;
  const before = content.slice(0, range.start).trimEnd();
  const after = content.slice(range.end).trimStart();
  if (before && after) return `${before}\n\n${after}`;
  if (before) return `${before}\n`;
  return after;
}

function strictModeStatus(content, template) {
  const range = managedRange(content);
  if (!range) return "missing";
  return content.slice(range.start, range.end) === template ? "enabled" : "stale";
}

async function atomicWrite(targetPath, content, existingMode) {
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, { encoding: "utf8", mode: existingMode ?? 0o644 });
  await rename(temporaryPath, targetPath);
  await chmod(targetPath, existingMode ?? 0o644).catch(() => {});
}

async function main() {
  const known = new Set(["--project", "--check", "--dry-run", "--remove"]);
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--project") {
      index += 1;
      if (!process.argv[index]) throw new Error("--project requires a path.");
    } else if (!known.has(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  const projectRoot = path.resolve(argumentValue("--project") || process.cwd());
  const projectStat = await stat(projectRoot).catch(() => null);
  if (!projectStat?.isDirectory()) throw new Error(`Project directory does not exist: ${projectRoot}`);

  const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const template = (await readFile(path.join(pluginRoot, "assets", "strict-mode.AGENTS.md"), "utf8")).trim();
  const targetPath = path.join(projectRoot, "AGENTS.md");
  const current = await readOptional(targetPath);
  const beforeStatus = strictModeStatus(current, template);

  if (process.argv.includes("--check")) {
    process.stdout.write(`${JSON.stringify({ status: beforeStatus, target: targetPath })}\n`);
    if (beforeStatus !== "enabled") process.exitCode = 1;
    return;
  }

  const operation = process.argv.includes("--remove") ? "remove" : "install";
  const next = operation === "remove" ? removeBlock(current) : installBlock(current, template);
  const changed = next !== current;

  if (process.argv.includes("--dry-run")) {
    process.stdout.write(`${JSON.stringify({ status: "dry_run", operation, target: targetPath, changed, before: beforeStatus })}\n`);
    return;
  }

  let existingMode;
  try {
    existingMode = (await stat(targetPath)).mode & 0o777;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (changed) await atomicWrite(targetPath, next, existingMode);
  process.stdout.write(`${JSON.stringify({ status: operation === "remove" ? "removed" : "enabled", target: targetPath, changed })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
