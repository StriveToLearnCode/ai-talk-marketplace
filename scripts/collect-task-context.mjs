#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = { root: process.cwd(), targets: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") return { help: true };
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    if (flag === "--root") args.root = value;
    else if (flag === "--target") args.targets.push(value);
    else throw new Error(`Unknown option: ${flag}`);
    index += 1;
  }
  return args;
}

function within(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function fingerprint(file) {
  try {
    const metadata = await lstat(file);
    if (metadata.isSymbolicLink()) {
      return { sha256: null, size: metadata.size, mtime_ms: Math.trunc(metadata.mtimeMs), type: "symlink" };
    }
    if (!metadata.isFile()) return null;
    const content = await readFile(file);
    return {
      sha256: createHash("sha256").update(content).digest("hex"),
      size: metadata.size,
      mtime_ms: Math.trunc(metadata.mtimeMs),
    };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function git(root, args, { trim = true } = {}) {
  const output = (await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  })).stdout;
  return trim ? output.trim() : output;
}

async function gitOrNull(root, args) {
  try {
    return await git(root, args);
  } catch {
    return null;
  }
}

function statusEntries(output) {
  const tokens = output.split("\0");
  const entries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const code = token.slice(0, 2);
    const file = token.slice(3);
    const entry = { path: file, status: code, source: "git_status" };
    if (/[RC]/u.test(code) && tokens[index + 1]) entry.previous_path = tokens[++index];
    entries.push(entry);
  }
  return entries;
}

export async function collectTaskContext({ root = process.cwd(), targets = [] } = {}) {
  const activityDirectory = await realpath(path.resolve(root));
  if (!(await stat(activityDirectory)).isDirectory()) throw new Error(`Not a directory: ${root}`);
  const observedAt = new Date().toISOString();

  let repository = null;
  let changedFiles = [];
  try {
    const gitRoot = await realpath(await git(activityDirectory, ["rev-parse", "--show-toplevel"]));
    if (!within(gitRoot, activityDirectory)) throw new Error("Activity directory escapes Git root");
    changedFiles = statusEntries(await git(
      activityDirectory,
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { trim: false },
    ));
    repository = {
      root: gitRoot,
      branch: (await git(activityDirectory, ["branch", "--show-current"])) || null,
      head: await gitOrNull(activityDirectory, ["rev-parse", "--verify", "HEAD"]),
    };
    for (const entry of changedFiles) {
      entry.observed_at = observedAt;
      entry.fingerprint = await fingerprint(path.resolve(gitRoot, entry.path));
    }
  } catch (error) {
    if (!/not a git repository/iu.test(error?.stderr || error?.message || "")) throw error;
  }

  const targetFiles = [];
  for (const target of targets) {
    const absolute = path.resolve(activityDirectory, target);
    if (!within(activityDirectory, absolute)) throw new Error(`Target escapes activity directory: ${target}`);
    targetFiles.push({
      path: path.relative(activityDirectory, absolute) || ".",
      observed_at: observedAt,
      fingerprint: await fingerprint(absolute),
    });
  }

  return {
    version: 1,
    observed_at: observedAt,
    activity_directory: activityDirectory,
    repository,
    changed_files: changedFiles,
    target_files: targetFiles,
  };
}

function usage() {
  return "Usage: collect-task-context.mjs [--root DIR] [--target FILE ...]";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await collectTaskContext(args), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
