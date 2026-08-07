#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, chmod, readFile, readdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { collectTaskContext } from "./collect-task-context.mjs";

const VERSION = 2;
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
    const key = `${item.kind || ""}\0${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function migrateLegacy(raw) {
  if (raw.current_goal) return raw;
  const verifiedFacts = (raw.confirmed_results || []).map((item) => ({
    value: item.value,
    source: item.source,
    verified_by: item.source === "user" ? "user" : "source",
    protected: true,
    evidence: item.evidence,
  }));
  for (const item of raw.acceptance || []) {
    if (item.status === "verified") {
      verifiedFacts.push({
        value: item.value,
        source: item.source,
        verified_by: "runtime",
        evidence: item.evidence,
      });
    }
  }
  return {
    ...raw,
    current_goal: raw.goal,
    change_boundaries: [
      ...(raw.boundaries || []),
      ...(raw.corrections || []).map((item) => ({ ...item, kind: "constraint" })),
    ],
    verified_facts: verifiedFacts,
    pending_checks: (raw.acceptance || []).filter((item) => item.status !== "verified"),
    completion_criteria: raw.acceptance || [],
  };
}

function normalizeState(rawState, taskKey) {
  const raw = migrateLegacy(rawState?.task_state || rawState);
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
    current_goal: sourceRecord(raw.current_goal, "current_goal"),
    change_boundaries: records(raw.change_boundaries, "change_boundaries", (item, field) => {
      const kind = item?.kind;
      if (!["allowed", "prohibited", "constraint"].includes(kind)) {
        throw new Error(`${field}.kind must be allowed, prohibited, or constraint`);
      }
      return sourceRecord(item, field, { kind });
    }),
    verified_facts: records(raw.verified_facts, "verified_facts", (item, field) => {
      const verifiedBy = item?.verified_by;
      if (!["source", "runtime", "user"].includes(verifiedBy)) {
        throw new Error(`${field}.verified_by must be source, runtime, or user`);
      }
      const record = sourceRecord(item, field, { verified_by: verifiedBy });
      if (item.protected === true) record.protected = true;
      const evidence = optionalText(item.evidence, `${field}.evidence`);
      const validWhen = optionalText(item.valid_when, `${field}.valid_when`);
      if (evidence) record.evidence = evidence;
      if (validWhen) record.valid_when = validWhen;
      return record;
    }),
    pending_checks: records(raw.pending_checks, "pending_checks", sourceRecord),
    completion_criteria: records(raw.completion_criteria, "completion_criteria", sourceRecord),
  };

  if (status === "complete") {
    if (state.pending_checks.length) throw new Error("complete states cannot contain pending_checks");
  } else {
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

async function resolvedContext(root, targets = []) {
  return collectTaskContext({ root: root || process.cwd(), targets });
}

function workspaceFrom(context) {
  return {
    repository_root: context.repository.root,
    branch: context.repository.branch,
    head: context.repository.head,
    activity_directory: context.activity_directory,
    activity_source: context.activity_source,
    activity_conflict: context.activity_conflict,
    page_directory: context.page_directory,
    page_candidates: context.page_candidates,
    agents_file: context.agents_file,
    target_files: context.target_files.map(({ observed_at: _observedAt, ...target }) => target),
  };
}

export async function saveTaskState({ root, taskKey, state, targets = [], storeRoot } = {}) {
  const context = await resolvedContext(root, targets);
  const normalized = normalizeState(state, taskKey);
  const directory = path.resolve(storeRoot || defaultStoreRoot());
  const file = stateFile(directory, context.activity_directory, normalized.task_key);
  const workspace = workspaceFrom(context);
  try {
    const existing = JSON.parse(await readFile(file, "utf8"));
    const { workspace: _workspace, updated_at: _updatedAt, ...existingState } = existing;
    if (JSON.stringify(existingState) === JSON.stringify(normalized)
      && JSON.stringify(existing.workspace) === JSON.stringify(workspace)) {
      return existing;
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }

  normalized.workspace = workspace;
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
  const context = await resolvedContext(root);
  const key = requireText(taskKey, "task_key", 300);
  const file = stateFile(path.resolve(storeRoot || defaultStoreRoot()), context.activity_directory, key);
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`No saved AI Talk state for task: ${key}`);
    throw error;
  }
  const saved = JSON.parse(content);
  if (saved.workspace?.activity_directory !== context.activity_directory || saved.task_key !== key) {
    throw new Error("Saved state identity does not match the requested task");
  }
  return { ...normalizeState(saved, key), workspace: saved.workspace, updated_at: saved.updated_at };
}

export async function listTaskStates({ root, storeRoot } = {}) {
  const context = await resolvedContext(root);
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
      if (state.workspace?.activity_directory === context.activity_directory) {
        states.push({
          task_key: state.task_key,
          status: state.status,
          current_goal: state.current_goal?.value || state.goal?.value,
          updated_at: typeof state.updated_at === "string" ? state.updated_at : "",
        });
      }
    } catch {
      // A damaged or unrelated file must not prevent recovery of other tasks.
    }
  }
  return states.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function joined(items) {
  return items.map((item) => item.value).join("；");
}

export async function buildPreflight({ root, taskKey, storeRoot } = {}) {
  const state = await loadTaskState({ root, taskKey, storeRoot });
  const targets = state.workspace?.target_files?.map((item) => item.path) || [];
  const current = await collectTaskContext({
    root: state.workspace.repository_root || state.workspace.activity_directory,
    targets,
  });
  const currentByPath = new Map(current.target_files.map((item) => [item.path, item.fingerprint?.sha256 || null]));
  const changed = (state.workspace.target_files || [])
    .filter((item) => (item.fingerprint?.sha256 || null) !== currentByPath.get(item.path))
    .map((item) => item.path);
  const protectedFacts = state.verified_facts.filter((item) => item.protected);

  const lines = [`当前目标：${state.current_goal.value}`];
  if (state.change_boundaries.length) lines.push(`修改边界：${joined(state.change_boundaries)}`);
  if (protectedFacts.length) lines.push(`不可回归：${joined(protectedFacts)}`);
  if (state.verified_facts.length) lines.push(`已确认事实：${joined(state.verified_facts)}`);
  if (state.pending_checks.length) lines.push(`待验证：${joined(state.pending_checks)}`);
  if (state.completion_criteria.length) lines.push(`完成条件：${joined(state.completion_criteria)}`);
  if (state.next_action) lines.push(`唯一下一步：${state.next_action.value}`);
  lines.push(`定位：${current.activity_directory}${current.page_directory ? ` | ${current.page_directory}` : ""}${current.agents_file ? ` | ${current.agents_file}` : ""}`);
  if (current.activity_conflict) {
    lines.push(`活动目录冲突：路径指向 ${current.activity_conflict.path}，分支指向 ${current.activity_conflict.branch}`);
  }
  if (state.workspace.branch !== current.repository.branch) {
    lines.push(`分支已变化：${state.workspace.branch || "(detached)"} -> ${current.repository.branch || "(detached)"}`);
  }
  if (state.workspace.agents_file !== current.agents_file) {
    lines.push("最近的 AGENTS.md 已变化，修改前必须读取当前文件");
  }
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
