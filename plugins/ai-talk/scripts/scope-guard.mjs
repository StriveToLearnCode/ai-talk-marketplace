#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readlink, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const BASELINE_VERSION = "1.0";
const POLICIES = new Set(["discover", "bounded"]);

function valuesFor(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === name) {
      const value = process.argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
      values.push(value);
      index += 1;
    }
  }
  return values;
}

function valueFor(name, fallback = null) {
  const values = valuesFor(name);
  if (values.length > 1) throw new Error(`${name} may only be provided once.`);
  return values[0] ?? fallback;
}

function parseArgs() {
  const command = process.argv[2];
  if (!new Set(["snapshot", "verify"]).has(command)) {
    throw new Error("Usage: scope-guard.mjs <snapshot|verify> --project <path> [options]");
  }
  const optionsWithValues = new Set([
    "--project", "--out", "--baseline", "--exclude", "--allow", "--policy",
  ]);
  for (let index = 3; index < process.argv.length; index += 1) {
    const option = process.argv[index];
    if (!optionsWithValues.has(option)) throw new Error(`Unknown argument: ${option}`);
    index += 1;
    if (!process.argv[index]) throw new Error(`${option} requires a value.`);
  }
  return {
    command,
    project: path.resolve(valueFor("--project", process.cwd())),
    out: valueFor("--out"),
    baseline: valueFor("--baseline"),
    excludes: valuesFor("--exclude").map(normalizePattern),
    allows: valuesFor("--allow").map(normalizePattern),
    policy: valueFor("--policy", "discover"),
  };
}

function git(project, args) {
  const result = spawnSync("git", ["-C", project, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed.`);
  }
  return result.stdout;
}

function nulPaths(output) {
  return output.split("\0").filter(Boolean).map(normalizeRepoPath);
}

function normalizeRepoPath(value) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || path.posix.isAbsolute(normalized)) {
    throw new Error(`Invalid repository path: ${value}`);
  }
  if (normalized.split("/").some((segment) => segment === ".." || segment === "")) {
    throw new Error(`Repository path escapes its root: ${value}`);
  }
  return normalized;
}

function normalizePattern(value) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.includes("\0")) {
    throw new Error(`Invalid scope pattern: ${value}`);
  }
  if (normalized.split("/").some((segment) => segment === ".." || segment === "")) {
    throw new Error(`Scope pattern escapes its root: ${value}`);
  }
  return normalized;
}

function segmentMatches(value, pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", "[^/]*")
    .replaceAll("?", "[^/]");
  return new RegExp(`^${escaped}$`).test(value);
}

function pathMatches(value, pattern) {
  const pathSegments = normalizeRepoPath(value).split("/");
  const patternSegments = normalizePattern(pattern).split("/");
  const visit = (pathIndex, patternIndex) => {
    if (patternIndex === patternSegments.length) return pathIndex === pathSegments.length;
    if (patternSegments[patternIndex] === "**") {
      return visit(pathIndex, patternIndex + 1)
        || (pathIndex < pathSegments.length && visit(pathIndex + 1, patternIndex));
    }
    return pathIndex < pathSegments.length
      && segmentMatches(pathSegments[pathIndex], patternSegments[patternIndex])
      && visit(pathIndex + 1, patternIndex + 1);
  };
  return visit(0, 0);
}

async function repositoryRoot(project) {
  const topLevel = git(project, ["rev-parse", "--show-toplevel"]).trim();
  return realpath(topLevel);
}

function workingPaths(project) {
  const paths = new Set();
  const commands = [
    ["diff", "--name-only", "-z", "--no-ext-diff"],
    ["diff", "--cached", "--name-only", "-z", "--no-ext-diff"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
    ["ls-files", "--deleted", "-z"],
  ];
  for (const args of commands) {
    for (const filePath of nulPaths(git(project, args))) paths.add(filePath);
  }
  return [...paths].sort();
}

async function signature(project, filePath) {
  const absolutePath = path.join(project, filePath);
  const stats = await lstat(absolutePath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (stats === null) return "missing";
  const hash = createHash("sha256");
  hash.update(String(stats.mode));
  if (stats.isSymbolicLink()) hash.update(await readlink(absolutePath));
  else if (stats.isFile()) hash.update(await readFile(absolutePath));
  else hash.update(`type:${stats.mode}`);
  return hash.digest("hex");
}

async function state(project) {
  const entries = {};
  for (const filePath of workingPaths(project)) entries[filePath] = await signature(project, filePath);
  return {
    head: git(project, ["rev-parse", "HEAD"]).trim(),
    entries,
  };
}

async function snapshot(options) {
  if (!options.out) throw new Error("snapshot requires --out <path>.");
  const project = await repositoryRoot(options.project);
  const current = await state(project);
  const baseline = {
    baseline_version: BASELINE_VERSION,
    project,
    head: current.head,
    entries: current.entries,
  };
  await writeFile(path.resolve(options.out), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  return { status: "snapshotted", baseline: path.resolve(options.out), tracked_paths: Object.keys(current.entries).length };
}

async function verify(options) {
  if (!options.baseline) throw new Error("verify requires --baseline <path>.");
  if (!POLICIES.has(options.policy)) throw new Error(`Unknown scope policy: ${options.policy}`);
  const baseline = JSON.parse(await readFile(path.resolve(options.baseline), "utf8"));
  if (baseline.baseline_version !== BASELINE_VERSION || typeof baseline.entries !== "object") {
    throw new Error("Unsupported scope baseline.");
  }
  const project = await repositoryRoot(options.project);
  if (project !== baseline.project) throw new Error("Scope baseline belongs to a different repository.");
  const current = await state(project);
  if (current.head !== baseline.head) throw new Error("Repository HEAD changed after the scope snapshot.");

  const paths = new Set([...Object.keys(baseline.entries), ...Object.keys(current.entries)]);
  const changedFiles = [...paths]
    .filter((filePath) => baseline.entries[filePath] !== current.entries[filePath])
    .sort();
  const excludedFiles = changedFiles.filter((filePath) => (
    options.excludes.some((pattern) => pathMatches(filePath, pattern))
  ));
  const outOfScopeFiles = options.policy === "bounded"
    ? changedFiles.filter((filePath) => !options.allows.some((pattern) => pathMatches(filePath, pattern)))
    : [];
  const status = excludedFiles.length || outOfScopeFiles.length ? "violation" : "ok";
  return {
    status,
    changed_files: changedFiles,
    excluded_files: excludedFiles,
    out_of_scope_files: outOfScopeFiles,
  };
}

async function main() {
  const options = parseArgs();
  const output = options.command === "snapshot" ? await snapshot(options) : await verify(options);
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (output.status === "violation") process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
});
