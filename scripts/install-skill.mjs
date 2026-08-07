#!/usr/bin/env node

import { lstat, mkdir, readFile, readlink, symlink, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_NAME = "ai-talk";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = path.resolve(SCRIPT_DIR, "..");

async function pathState(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function planLink(target, sourceDir) {
  await mkdir(path.dirname(target), { recursive: true });
  const state = await pathState(target);

  if (state?.isSymbolicLink()) {
    const current = path.resolve(path.dirname(target), await readlink(target));
    return { target, status: current === sourceDir ? "unchanged" : "repaired" };
  } else if (state) {
    throw new Error(`Refusing to replace non-symlink path: ${target}`);
  }

  return { target, status: "created" };
}

async function applyLink(plan, sourceDir) {
  if (plan.status === "unchanged") return plan;
  if (plan.status === "repaired") await unlink(plan.target);
  await symlink(sourceDir, plan.target, "dir");
  return plan;
}

export async function installSkill({ sourceDir = DEFAULT_SOURCE, homeDir = os.homedir() } = {}) {
  const source = path.resolve(sourceDir);
  await readFile(path.join(source, "SKILL.md"), "utf8");

  const targets = [
    path.join(homeDir, ".codex", "skills", SKILL_NAME),
    path.join(homeDir, ".agents", "skills", SKILL_NAME),
  ];
  const plans = await Promise.all(targets.map((target) => planLink(target, source)));
  const links = [];
  for (const plan of plans) links.push(await applyLink(plan, source));

  return {
    source,
    links,
    restart_required: true,
    restart_reason: "Skill metadata is snapshotted when a task starts; validate changes in a new task.",
  };
}

export function parseInstallArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--home", "--source"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    if (argument === "--home") options.homeDir = value;
    else options.sourceDir = value;
    index += 1;
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installSkill(parseInstallArgs(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
