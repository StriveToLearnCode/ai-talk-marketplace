import { open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { MAX_FILE_BYTES } from "./rules.mjs";

const PRIORITY = { project: 3, plugin: 2, company: 1 };

function within(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readableDirectory(candidate) {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function readBounded(file) {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead > MAX_FILE_BYTES ? null : buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function walk(root, relative = "", depth = 0) {
  if (depth > 8 || relative.split(path.sep).includes("node_modules")) return [];
  let entries;
  try {
    entries = await readdir(path.join(root, relative), { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink() || entry.name === "node_modules") continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, child, depth + 1));
    if (entry.isFile() && entry.name.toLowerCase() === "skill.md") files.push(child);
  }
  return files;
}

function clean(value, limit = 1200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function unquote(value) {
  const text = value.trim();
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
  return text;
}

export function parseSkill(content) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return null;
  const metadata = {};
  for (let index = 1; index < end; index += 1) {
    const match = lines[index].match(/^(name|description):\s*(.*)$/);
    if (!match) continue;
    if (/^[>|][+-]?$/.test(match[2].trim())) {
      const block = [];
      while (++index < end && /^\s+/.test(lines[index])) block.push(lines[index].trim());
      index -= 1;
      metadata[match[1]] = clean(block.join(" "));
    } else {
      metadata[match[1]] = clean(unquote(match[2]));
    }
  }
  if (!metadata.name || !metadata.description) return null;
  return metadata;
}

async function discoverRoot(source, excludedRoots) {
  const root = path.resolve(source.root);
  if (!(await readableDirectory(root)) || excludedRoots.some((item) => within(root, item))) return [];
  const skills = [];
  for (const relative of await walk(root)) {
    const file = path.join(root, relative);
    if (excludedRoots.some((item) => within(file, item))) continue;
    const content = await readBounded(file);
    const metadata = content && parseSkill(content);
    if (!metadata || metadata.name.toLowerCase() === "ai-talk") continue;
    skills.push({ ...metadata, path: file, source: source.label, scope: source.scope });
  }
  return skills;
}

function sourceRoot(raw) {
  const separator = raw.indexOf("=");
  return {
    label: separator > 0 ? raw.slice(0, separator) : "company",
    root: separator > 0 ? raw.slice(separator + 1) : raw,
    scope: "company",
  };
}

export async function discoverSkills({ root, pluginSkillsRoot, comparisonRoot, sourceRoots = [], excludeRoots = [] }) {
  const projectRoot = await realpath(path.resolve(root));
  const explicitExclusions = [comparisonRoot, ...excludeRoots].filter(Boolean).map((item) => path.resolve(item));
  const roots = [
    { label: "project", root: path.join(projectRoot, ".agents", "skills"), scope: "project" },
    { label: "ai-talk-plugin", root: pluginSkillsRoot, scope: "plugin" },
    ...sourceRoots.map(sourceRoot),
  ];
  const discovered = [];
  for (const source of roots) discovered.push(...await discoverRoot(source, explicitExclusions));

  const grouped = new Map();
  for (const skill of discovered) {
    const name = skill.name.toLowerCase();
    grouped.set(name, [...(grouped.get(name) || []), skill]);
  }
  const conflicts = [...grouped]
    .filter(([, items]) => items.length > 1)
    .map(([name, items]) => ({ name, paths: items.map((item) => item.path).sort(), scopes: items.map((item) => item.scope) }));
  const skills = [...grouped.values()].map((items) => [...items].sort((a, b) => PRIORITY[b.scope] - PRIORITY[a.scope] || a.path.localeCompare(b.path))[0]);

  return { root: projectRoot, roots, skills, conflicts, discovered };
}
