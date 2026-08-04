#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readlink, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const BASELINE_VERSION = "1.1";
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
    "--project", "--out", "--baseline", "--exclude", "--allow", "--policy", "--tool-stash",
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
    toolStashes: valuesFor("--tool-stash").map(normalizeObjectId),
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

function normalizeObjectId(value) {
  const normalized = value.trim().toLowerCase();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(normalized)) {
    throw new Error(`Invalid tool stash OID: ${value}`);
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

function gitState(project) {
  return {
    staged: nulPaths(git(project, ["diff", "--cached", "--name-only", "-z", "--no-ext-diff"])),
    unstaged: nulPaths(git(project, ["diff", "--name-only", "-z", "--no-ext-diff"])),
    untracked: nulPaths(git(project, ["ls-files", "--others", "--exclude-standard", "-z"])),
    deleted: nulPaths(git(project, ["ls-files", "--deleted", "-z"])),
  };
}

function workingPaths(currentGitState) {
  return [...new Set(Object.values(currentGitState).flat())].sort();
}

function categoriesFor(currentGitState, filePath) {
  return Object.entries(currentGitState)
    .filter(([, paths]) => paths.includes(filePath))
    .map(([category]) => category);
}

function indexSignature(project, filePath) {
  const entry = git(project, ["ls-files", "--stage", "-z", "--", filePath]);
  if (!entry) return "missing";
  return createHash("sha256").update(entry).digest("hex");
}

function stashes(project) {
  return git(project, ["stash", "list", "--format=%H%x09%gs"])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("\t");
      return {
        oid: line.slice(0, separator).toLowerCase(),
        subject: line.slice(separator + 1),
      };
    });
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
  const currentGitState = gitState(project);
  const entries = {};
  for (const filePath of workingPaths(currentGitState)) {
    entries[filePath] = {
      worktree: await signature(project, filePath),
      index: indexSignature(project, filePath),
      categories: categoriesFor(currentGitState, filePath),
    };
  }
  return {
    head: git(project, ["rev-parse", "HEAD"]).trim(),
    entries,
    git_state: currentGitState,
    stashes: stashes(project),
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
    git_state: current.git_state,
    stashes: current.stashes,
  };
  await writeFile(path.resolve(options.out), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  return {
    status: "snapshotted",
    baseline: path.resolve(options.out),
    tracked_paths: Object.keys(current.entries).length,
    git_state: current.git_state,
    stashes: current.stashes,
  };
}

function sameEntry(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stashChanges(baselineStashes, currentStashes, toolStashOids) {
  const baselineByOid = new Map(baselineStashes.map((item) => [item.oid, item]));
  const currentByOid = new Map(currentStashes.map((item) => [item.oid, item]));
  const toolStashes = new Set(toolStashOids);
  const created = currentStashes.filter((item) => !baselineByOid.has(item.oid));
  const removed = baselineStashes.filter((item) => !currentByOid.has(item.oid));
  return {
    pre_existing: baselineStashes,
    created,
    removed,
    restored_tool_stashes: toolStashOids.filter((oid) => !currentByOid.has(oid)),
    unrestored_tool_stashes: toolStashOids.filter((oid) => currentByOid.has(oid)),
    pre_existing_stashes_misclassified_as_tool: toolStashOids.filter((oid) => baselineByOid.has(oid)),
    unrecorded_created_stashes: created.filter((item) => !toolStashes.has(item.oid)),
  };
}

function validateToolStashObjects(project, toolStashOids) {
  for (const oid of toolStashOids) {
    const type = git(project, ["cat-file", "-t", oid]).trim();
    const commitLine = git(project, ["rev-list", "--parents", "-n", "1", oid]).trim();
    if (type !== "commit" || commitLine.split(/\s+/).length < 3) {
      throw new Error(`Recorded tool stash is not a stash commit: ${oid}`);
    }
  }
}

async function verify(options) {
  if (!options.baseline) throw new Error("verify requires --baseline <path>.");
  if (!POLICIES.has(options.policy)) throw new Error(`Unknown scope policy: ${options.policy}`);
  const baseline = JSON.parse(await readFile(path.resolve(options.baseline), "utf8"));
  if (
    baseline.baseline_version !== BASELINE_VERSION
    || typeof baseline.entries !== "object"
    || typeof baseline.git_state !== "object"
    || !Array.isArray(baseline.stashes)
  ) {
    throw new Error("Unsupported scope baseline.");
  }
  const project = await repositoryRoot(options.project);
  if (project !== baseline.project) throw new Error("Scope baseline belongs to a different repository.");
  validateToolStashObjects(project, options.toolStashes);
  const current = await state(project);
  if (current.head !== baseline.head) throw new Error("Repository HEAD changed after the scope snapshot.");

  const paths = new Set([...Object.keys(baseline.entries), ...Object.keys(current.entries)]);
  const changedFiles = [...paths]
    .filter((filePath) => !sameEntry(baseline.entries[filePath], current.entries[filePath]))
    .sort();
  const changedWorktreeFiles = [...paths]
    .filter((filePath) => baseline.entries[filePath]?.worktree !== current.entries[filePath]?.worktree)
    .sort();
  const changedIndexFiles = [...paths]
    .filter((filePath) => baseline.entries[filePath]?.index !== current.entries[filePath]?.index)
    .sort();
  const excludedFiles = changedFiles.filter((filePath) => (
    options.excludes.some((pattern) => pathMatches(filePath, pattern))
  ));
  const outOfScopeFiles = options.policy === "bounded"
    ? changedFiles.filter((filePath) => !options.allows.some((pattern) => pathMatches(filePath, pattern)))
    : [];
  const stashState = stashChanges(baseline.stashes, current.stashes, options.toolStashes);
  const gitStateRisks = [];
  if (stashState.removed.length) gitStateRisks.push("pre_existing_stash_removed");
  if (stashState.unrecorded_created_stashes.length) gitStateRisks.push("unrecorded_stash_created");
  if (stashState.unrestored_tool_stashes.length) gitStateRisks.push("tool_stash_not_restored");
  if (stashState.pre_existing_stashes_misclassified_as_tool.length) {
    gitStateRisks.push("pre_existing_stash_misclassified_as_tool");
  }
  const status = excludedFiles.length || outOfScopeFiles.length || gitStateRisks.length
    ? "violation"
    : "ok";
  return {
    status,
    changed_files: changedFiles,
    changed_worktree_files: changedWorktreeFiles,
    changed_index_files: changedIndexFiles,
    excluded_files: excludedFiles,
    out_of_scope_files: outOfScopeFiles,
    git_state: {
      baseline: baseline.git_state,
      current: current.git_state,
    },
    stash_state: stashState,
    git_state_risks: gitStateRisks,
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
