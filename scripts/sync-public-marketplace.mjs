#!/usr/bin/env node

import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const MIRROR = path.join(ROOT, "ai-talk-public-marketplace");
const WRITE = process.argv.includes("--write");
const HELP = process.argv.includes("--help");
const IGNORED = new Set([".DS_Store", "__pycache__"]);
const MAPPINGS = [
  ["README.md", "README.md"],
  ["USAGE.md", "USAGE.md"],
  ["plugins/ai-talk", "plugins/ai-talk"],
];

function ignored(relative) {
  return relative.split(path.sep).some((part) => IGNORED.has(part) || part.endsWith(".pyc"));
}

async function filesUnder(base, relative = "") {
  const entries = await readdir(path.join(base, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relative, entry.name);
    if (ignored(child)) continue;
    if (entry.isDirectory()) files.push(...await filesUnder(base, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`Unsupported mirror source entry: ${path.join(base, child)}`);
  }
  return files;
}

async function compareFile(source, target, label, mismatches) {
  try {
    const [sourceContent, targetContent] = await Promise.all([readFile(source), readFile(target)]);
    if (!sourceContent.equals(targetContent)) mismatches.push(`${label} differs`);
  } catch (error) {
    if (error.code === "ENOENT") mismatches.push(`${label} is missing`);
    else throw error;
  }
}

async function syncDirectory(source, target, label, mismatches) {
  const sourceFiles = await filesUnder(source);
  let targetFiles = [];
  try {
    targetFiles = await filesUnder(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const sourceSet = new Set(sourceFiles);

  for (const relative of sourceFiles) {
    const sourceFile = path.join(source, relative);
    const targetFile = path.join(target, relative);
    if (WRITE) {
      await mkdir(path.dirname(targetFile), { recursive: true });
      await copyFile(sourceFile, targetFile);
    } else {
      await compareFile(sourceFile, targetFile, `${label}/${relative}`, mismatches);
    }
  }

  for (const relative of targetFiles.filter((file) => !sourceSet.has(file))) {
    if (WRITE) await rm(path.join(target, relative));
    else mismatches.push(`${label}/${relative} exists only in the mirror`);
  }
}

async function main() {
  if (HELP) {
    process.stdout.write("Usage: node scripts/sync-public-marketplace.mjs [--write]\n");
    return;
  }
  const unknown = process.argv.slice(2).filter((argument) => argument !== "--write");
  if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);

  const mismatches = [];
  for (const [sourceRelative, targetRelative] of MAPPINGS) {
    const source = path.join(ROOT, sourceRelative);
    const target = path.join(MIRROR, targetRelative);
    if (path.extname(sourceRelative)) {
      if (WRITE) {
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(source, target);
      } else {
        await compareFile(source, target, targetRelative, mismatches);
      }
    } else {
      await syncDirectory(source, target, targetRelative, mismatches);
    }
  }

  if (WRITE) {
    process.stdout.write("Public marketplace mirror synchronized from the main source.\n");
    return;
  }
  if (mismatches.length) {
    process.stderr.write(`Public marketplace mirror is out of sync:\n${mismatches.map((item) => `- ${item}`).join("\n")}\n`);
    process.stderr.write("Run: node scripts/sync-public-marketplace.mjs --write\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Public marketplace mirror matches the main source.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
});
