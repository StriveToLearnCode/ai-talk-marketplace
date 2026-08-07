#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, chmod, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { collectTaskContext } from "./collect-task-context.mjs";

const VERSION = 1;
const MAX_ITEMS = 8;
const MAX_STATE_BYTES = 32 * 1024;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help") return { help: true };
  const args = { command, root: process.cwd(), targets: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === "--help") return { help: true };
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    if (flag === "--root") args.root = value;
    else if (flag === "--task") args.taskKey = value;
    else if (flag === "--target") args.targets.push(value);
    else if (flag === "--store-root") args.storeRoot = value;
    else throw new Error(`Unknown option: ${flag}`);
    index += 1;
  }
  return args;
}

function requireText(value, field, maxLength = 2000) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${field} is too long`);
  return text;
}

function optionalText(value, field, maxLength = 2000) {
  if (value === undefined || value === null || value === "") return undefined;
  return requireText(value, field, maxLength);
}

function sourceRecord(value, field, extra = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return {
    value: requireText(value.value, `${field}.value`),
    source: requireText(value.source, `${field}.source`, 300),
    ...extra,
  };
}

function records(values, field, normalize) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  if (values.length > MAX_ITEMS) throw new Error(`${field} cannot contain more than ${MAX_ITEMS} items`);
  const seen = new Set();
  return values.map((item, index) => normalize(item, `${field}[${index}]`)).filter((item) => {
    const key = `${item.name || ""}\0${item.kind || ""}\0${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeState(rawState, taskKey) {
  const raw = rawState?.task_state || rawState;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("state must be a JSON object");
  }
  const status = raw.status || "active";
  if (!["active", "blocked", "complete"].includes(status)) {
    throw new Error("status must be active, blocked, or complete");
  }

  const state = {
    version: VERSION,
    task_key: requireText(taskKey || raw.task_key, "task_key", 300),
    status,
    goal: sourceRecord(raw.goal, "goal"),
    confirmed_results: records(raw.confirmed_results, "confirmed_results", (item, field) => {
      const record = sourceRecord(item, field, { status: "protected" });
      const validWhen = optionalText(item.valid_when, `${field}.valid_when`);
      const evidence = optionalText(item.evidence, `${field}.evidence`);
      if (validWhen) record.valid_when = validWhen;
      if (evidence) record.evidence = evidence;
      return record;
    }),
    corrections: records(raw.corrections, "corrections", (item, field) => {
      const record = sourceRecord(item, field);
      const replaces = optionalText(item.replaces, `${field}.replaces`);
      if (replaces) record.replaces = replaces;
      return record;
    }),
    boundaries: records(raw.boundaries, "boundaries", (item, field) => {
      const kind = item?.kind;
      if (!["allowed", "prohibited"].includes(kind)) {
        throw new Error(`${field}.kind must be allowed or prohibited`);
      }
      return sourceRecord(item, field, { kind });
    }),
    acceptance: records(raw.acceptance, "acceptance", (item, field) => {
      const acceptanceStatus = item?.status || "pending";
      if (!["pending", "verified"].includes(acceptanceStatus)) {
        throw new Error(`${field}.status must be pending or verified`);
      }
      const record = sourceRecord(item, field, { status: acceptanceStatus });
      const validWhen = optionalText(item.valid_when, `${field}.valid_when`);
      const evidence = optionalText(item.evidence, `${field}.evidence`);
      if (validWhen) record.valid_when = validWhen;
      if (evidence) record.evidence = evidence;
      return record;
    }),
    bindings: records(raw.bindings, "bindings", (item, field) => ({
      name: requireText(item?.name, `${field}.name`, 200),
      value: requireText(item?.value, `${field}.value`),
      source: requireText(item?.source, `${field}.source`, 300),
    })),
  };
  if (status !== "complete") {
    if (!raw.next_action) throw new Error("active and blocked states require next_action");
    state.next_action = sourceRecord(raw.next_action, "next_action");
  }
  return state;
}

function defaultStoreRoot() {
  return process.env.AI_TALK_STATE_HOME || path.join(os.homedir(), ".codex", "ai-talk-state");
}

function stateFile(storeRoot, activityDirectory, taskKey) {
  const digest = createHash("sha256")
    .update(activityDirectory)
    .update("\0")
    .update(taskKey)
    .digest("hex");
  return path.join(storeRoot, `${digest}.json`);
}

async function canonicalRoot(root) {
  return realpath(path.resolve(root));
}

export async function saveTaskState({ root, taskKey, state, targets = [], storeRoot } = {}) {
  const activityDirectory = await canonicalRoot(root || process.cwd());
  const normalized = normalizeState(state, taskKey);
  const context = await collectTaskContext({ root: activityDirectory, targets });
  const directory = path.resolve(storeRoot || defaultStoreRoot());
  const file = stateFile(directory, activityDirectory, normalized.task_key);
  try {
    const existing = JSON.parse(await readFile(file, "utf8"));
    const { workspace: _workspace, updated_at: _updatedAt, ...existingState } = existing;
    const existingTargets = (existing.workspace?.target_files || []).map((item) => item.path).sort();
    const requestedTargets = context.target_files.map((item) => item.path).sort();
    if (
      JSON.stringify(existingState) === JSON.stringify(normalized)
      && JSON.stringify(existingTargets) === JSON.stringify(requestedTargets)
    ) {
      return existing;
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }

  normalized.workspace = {
    activity_directory: activityDirectory,
    branch: context.repository?.branch || null,
    head: context.repository?.head || null,
    target_files: context.target_files,
  };
  normalized.updated_at = new Date().toISOString();

  const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_STATE_BYTES) {
    throw new Error(`state exceeds ${MAX_STATE_BYTES} bytes`);
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
  await chmod(file, 0o600);
  return normalized;
}

export async function loadTaskState({ root, taskKey, storeRoot } = {}) {
  const activityDirectory = await canonicalRoot(root || process.cwd());
  const key = requireText(taskKey, "task_key", 300);
  const file = stateFile(path.resolve(storeRoot || defaultStoreRoot()), activityDirectory, key);
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`No saved AI Talk state for task: ${key}`);
    throw error;
  }
  const state = JSON.parse(content);
  if (state.workspace?.activity_directory !== activityDirectory || state.task_key !== key) {
    throw new Error("Saved state identity does not match the requested task");
  }
  return state;
}

export async function listTaskStates({ root, storeRoot } = {}) {
  const activityDirectory = await canonicalRoot(root || process.cwd());
  const directory = path.resolve(storeRoot || defaultStoreRoot());
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const states = [];
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    try {
      const state = JSON.parse(await readFile(path.join(directory, name), "utf8"));
      if (state.workspace?.activity_directory === activityDirectory) {
        states.push({
          task_key: state.task_key,
          status: state.status,
          goal: state.goal?.value,
          updated_at: typeof state.updated_at === "string" ? state.updated_at : "",
        });
      }
    } catch {
      // A damaged or unrelated file must not prevent recovery of other tasks.
    }
  }
  return states.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function joined(recordsToJoin) {
  return recordsToJoin.map((item) => item.value).join("；");
}

export async function buildPreflight({ root, taskKey, storeRoot } = {}) {
  const state = await loadTaskState({ root, taskKey, storeRoot });
  const targets = state.workspace?.target_files?.map((item) => item.path) || [];
  const current = await collectTaskContext({ root: state.workspace.activity_directory, targets });
  const currentByPath = new Map(current.target_files.map((item) => [item.path, item.fingerprint?.sha256 || null]));
  const changed = (state.workspace.target_files || [])
    .filter((item) => (item.fingerprint?.sha256 || null) !== currentByPath.get(item.path))
    .map((item) => item.path);

  const lines = [`当前唯一目标：${state.goal.value}`];
  if (state.confirmed_results.length) lines.push(`不可回归：${joined(state.confirmed_results)}`);
  if (state.corrections.length) lines.push(`用户纠正：${joined(state.corrections)}`);
  const allowed = state.boundaries.filter((item) => item.kind === "allowed");
  const prohibited = state.boundaries.filter((item) => item.kind === "prohibited");
  if (allowed.length) lines.push(`允许：${joined(allowed)}`);
  if (prohibited.length) lines.push(`禁止：${joined(prohibited)}`);
  if (state.acceptance.length) {
    lines.push(`验收：${state.acceptance.map((item) => `${item.value}[${item.status === "verified" ? "已验证" : "待验证"}]`).join("；")}`);
  }
  if (state.next_action) lines.push(`下一步：${state.next_action.value}`);
  if (changed.length) lines.push(`基线后变化（修改者未知，必须基于现状合并）：${changed.join("、")}`);
  return { state, changed_files: changed, text: lines.join("\n") };
}

function usage() {
  return [
    "Usage:",
    "  task-state.mjs save --root DIR --task KEY [--target FILE ...] < state.json",
    "  task-state.mjs load --root DIR --task KEY",
    "  task-state.mjs list --root DIR",
    "  task-state.mjs preflight --root DIR --task KEY",
  ].join("\n");
}

async function readStdin() {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!["save", "load", "list", "preflight"].includes(args.command)) {
    throw new Error(`Unknown command: ${args.command}`);
  }
  if (args.command !== "list" && !args.taskKey) throw new Error("--task is required");

  if (args.command === "save") {
    const input = await readStdin();
    if (!input.trim()) throw new Error("save requires JSON on stdin");
    const state = await saveTaskState({
      root: args.root,
      taskKey: args.taskKey,
      state: JSON.parse(input),
      targets: args.targets,
      storeRoot: args.storeRoot,
    });
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else if (args.command === "load") {
    process.stdout.write(`${JSON.stringify(await loadTaskState(args), null, 2)}\n`);
  } else if (args.command === "list") {
    process.stdout.write(`${JSON.stringify(await listTaskStates(args), null, 2)}\n`);
  } else {
    process.stdout.write(`${(await buildPreflight(args)).text}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
