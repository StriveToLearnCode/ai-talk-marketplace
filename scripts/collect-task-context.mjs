#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
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

async function directoryExists(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function fileExists(file) {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function git(root, args) {
  return (await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  })).stdout.trim();
}

async function gitOrNull(root, args) {
  try {
    return await git(root, args);
  } catch {
    return null;
  }
}

function activityFromPath(gitRoot, location) {
  const parts = path.relative(gitRoot, location).split(path.sep);
  const appsIndex = parts.indexOf("apps");
  if (appsIndex < 0 || !["short", "long", "mdc"].includes(parts[appsIndex + 1]) || !parts[appsIndex + 2]) {
    return null;
  }
  return path.join(gitRoot, ...parts.slice(0, appsIndex + 3));
}

async function activityFromBranch(gitRoot, branch) {
  let relative;
  if (branch?.startsWith("act-") && branch.length > 4) {
    relative = path.join("apps", "short", branch.slice(4));
  } else if (branch?.startsWith("mdc-") && branch.length > 4) {
    relative = path.join("apps", "mdc", branch.slice(4));
  }
  if (!relative) return null;
  const candidate = path.join(gitRoot, relative);
  return (await directoryExists(candidate)) ? candidate : null;
}

function pageFromLocation(activityDirectory, location) {
  if (!activityDirectory || !within(activityDirectory, location)) return null;
  const parts = path.relative(activityDirectory, location).split(path.sep);
  const pageIndex = parts.findIndex((part) => /^pages(?:-|$)/iu.test(part));
  return pageIndex < 0 ? null : path.join(activityDirectory, ...parts.slice(0, pageIndex + 1));
}

async function pageDirectories(activityDirectory, locations) {
  const candidates = new Set(locations.map((location) => pageFromLocation(activityDirectory, location)).filter(Boolean));
  if (candidates.size === 0 && activityDirectory) {
    for (const entry of await readdir(activityDirectory, { withFileTypes: true })) {
      if (entry.isDirectory() && /^pages(?:-|$)/iu.test(entry.name)) {
        candidates.add(path.join(activityDirectory, entry.name));
      }
    }
  }
  return [...candidates].sort();
}

async function nearestAgentsFile(start, stop) {
  let current = start;
  while (within(stop, current)) {
    const candidate = path.join(current, "AGENTS.md");
    if (await fileExists(candidate)) return candidate;
    if (current === stop) break;
    current = path.dirname(current);
  }
  return null;
}

export async function collectTaskContext({ root = process.cwd(), targets = [] } = {}) {
  const inputDirectory = await realpath(path.resolve(root));
  if (!(await stat(inputDirectory)).isDirectory()) throw new Error(`Not a directory: ${root}`);

  let gitRoot = inputDirectory;
  let branch = null;
  let head = null;
  try {
    gitRoot = await realpath(await git(inputDirectory, ["rev-parse", "--show-toplevel"]));
    branch = (await git(inputDirectory, ["branch", "--show-current"])) || null;
    head = await gitOrNull(inputDirectory, ["rev-parse", "--verify", "HEAD"]);
  } catch (error) {
    if (!/not a git repository/iu.test(error?.stderr || error?.message || "")) throw error;
  }

  const absoluteTargets = targets.map((target) => path.resolve(inputDirectory, target));
  for (const target of absoluteTargets) {
    if (!within(gitRoot, target)) throw new Error(`Target escapes repository: ${target}`);
  }

  const pathActivity = activityFromPath(gitRoot, inputDirectory)
    || absoluteTargets.map((target) => activityFromPath(gitRoot, target)).find(Boolean);
  const branchActivity = await activityFromBranch(gitRoot, branch);
  const activityConflict = pathActivity && branchActivity && pathActivity !== branchActivity
    ? { path: pathActivity, branch: branchActivity }
    : null;
  const activityDirectory = pathActivity || branchActivity || inputDirectory;
  const activitySource = pathActivity ? "path" : branchActivity ? "branch" : "current_directory";
  const pages = await pageDirectories(activityDirectory, [inputDirectory, ...absoluteTargets]);
  const pageDirectory = pages.length === 1 ? pages[0] : null;
  const agentsStart = absoluteTargets.length === 1
    ? path.dirname(absoluteTargets[0])
    : pageDirectory || activityDirectory;
  const agentsFile = await nearestAgentsFile(agentsStart, gitRoot);
  const observedAt = new Date().toISOString();

  const targetFiles = [];
  for (const target of absoluteTargets) {
    targetFiles.push({
      path: path.relative(gitRoot, target) || ".",
      observed_at: observedAt,
      fingerprint: await fingerprint(target),
    });
  }

  return {
    version: 2,
    observed_at: observedAt,
    repository: { root: gitRoot, branch, head },
    activity_directory: activityDirectory,
    activity_source: activitySource,
    activity_conflict: activityConflict,
    page_directory: pageDirectory,
    page_candidates: pages.length > 1 ? pages : [],
    agents_file: agentsFile,
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
