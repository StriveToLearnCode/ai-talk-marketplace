#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_BODY_FILES = 3;
const MAX_SEARCH_EXPANSIONS = 2;
const MAX_FILE_BYTES = 128 * 1024;
const KEBAB_TOKEN = String.raw`[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+`;
const TOKEN = String.raw`(?:[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+|[A-Z][A-Za-z0-9]{2,})`;
const VALID_NAME = new RegExp(`^${TOKEN}$`);

function parseArgs(argv) {
  const args = { root: null, query: "", component: null, targets: [], sourceRoots: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") return { help: true };
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    if (flag === "--root") args.root = value;
    else if (flag === "--query") args.query = value;
    else if (flag === "--component") args.component = value;
    else if (flag === "--target") args.targets.push(value);
    else if (flag === "--source-root") args.sourceRoots.push(value);
    else throw new Error(`Unknown option: ${flag}`);
    index += 1;
  }
  return args;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/^[<`]|[>`]$/gu, "");
}

function addUnique(items, value) {
  const normalized = normalizeName(value);
  if (VALID_NAME.test(normalized) && !items.includes(normalized)) items.push(normalized);
}

function namesIn(query) {
  const names = [];
  for (const match of query.matchAll(new RegExp(`[<\\x60](${TOKEN})[>\\x60]`, "gu"))) addUnique(names, match[1]);
  for (const match of query.matchAll(new RegExp(`\\b(${KEBAB_TOKEN})\\b`, "gu"))) addUnique(names, match[1]);
  return names;
}

function explicitlyRequired(query) {
  const patterns = [
    new RegExp(`(?:这里|请|必须|应该|应当|继续)?\\s*(?:使用|采用|保留|改回|用)\\s*[<\\x60]?(${TOKEN})`, "iu"),
    new RegExp(`(?:must\\s+use|should\\s+use|use|keep)\\s+[<\\x60]?(${TOKEN})`, "iu"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(query);
    if (!match) continue;
    const before = query.slice(Math.max(0, match.index - 6), match.index);
    if (!/(?:不要|不能|不可|禁止|别|without)\s*$/iu.test(before)) return normalizeName(match[1]);
  }
  return null;
}

function pascalName(name) {
  return name.includes("-")
    ? name.split("-").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join("")
    : name;
}

function within(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function directory(value) {
  const resolved = await realpath(path.resolve(value));
  if (!(await stat(resolved)).isDirectory()) throw new Error(`Not a directory: ${value}`);
  return resolved;
}

async function targetFile(root, value) {
  const resolved = await realpath(path.resolve(root, value));
  if (!within(root, resolved)) throw new Error(`Target escapes project root: ${value}`);
  const metadata = await stat(resolved);
  if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) throw new Error(`Invalid target file: ${value}`);
  return resolved;
}

async function matchingFiles(root, term) {
  const args = [
    "--files-with-matches", "--fixed-strings", "--no-messages", "--hidden", "--max-filesize", "128K",
    "--glob", "*.{vue,ts,tsx,js,jsx,mjs,cjs,md,mdx,json,yaml,yml}",
    "--glob", "!.git/**", "--glob", "!node_modules/**", "--glob", "!dist/**", "--glob", "!build/**",
    "--glob", "!tests/**", "--glob", "!test/**", "--", term, ".",
  ];
  try {
    const { stdout } = await execFileAsync("rg", args, { cwd: root, maxBuffer: 1024 * 1024 });
    return stdout.split(/\r?\n/u).filter(Boolean).map((file) => path.resolve(root, file));
  } catch (error) {
    if (error.code === 1) return [];
    if (error.code === "ENOENT") throw new Error("rg is required for component lookup");
    throw error;
  }
}

function evidenceKind(projectRoot, targets, file, excerpt) {
  if (/^\s*import\b/u.test(excerpt)) return targets.has(file) ? "target_import" : "project_import";
  if (/(?:components?\s*:|app\.component|customElements\.define|resolveComponent)/iu.test(excerpt)) return "component_registration";
  if (!within(projectRoot, file) || /\.mdx?$/iu.test(file)) return "component_documentation";
  return targets.has(file) ? "target_reference" : "project_reference";
}

async function findEvidence(projectRoot, roots, targets, component) {
  const terms = [...new Set([component, pascalName(component)])].slice(0, MAX_SEARCH_EXPANSIONS);
  const files = [...targets];
  for (const term of terms) {
    for (const root of roots) {
      for (const file of await matchingFiles(root, term)) if (!files.includes(file)) files.push(file);
    }
  }
  const evidence = [];
  const filesRead = [];
  for (const file of files) {
    if (filesRead.length >= MAX_BODY_FILES) break;
    if (file === path.join(projectRoot, "SKILL.md")) continue;
    const metadata = await stat(file).catch(() => null);
    if (!metadata?.isFile() || metadata.size > MAX_FILE_BYTES) continue;
    const source = await readFile(file, "utf8");
    filesRead.push(within(projectRoot, file) ? path.relative(projectRoot, file) : file);
    const lines = source.split(/\r?\n/u);
    const index = lines.findIndex((line) => terms.some((term) => line.includes(term)));
    if (index < 0) continue;
    const excerpt = lines[index].trim().slice(0, 240);
    evidence.push({
      kind: evidenceKind(projectRoot, new Set(targets), file, excerpt),
      source: within(projectRoot, file) ? path.relative(projectRoot, file) : file,
      line: index + 1,
      excerpt,
    });
  }
  return { evidence, filesRead, searchExpansions: terms.length };
}

function environments(query) {
  const result = [];
  const rules = [[/(?:本地|local)/iu, "local"], [/(?:预加载|preload)/iu, "preload"], [/(?:mock|模拟器)/iu, "mock_or_simulator"], [/(?:桌面预览|desktop preview)/iu, "desktop_preview"]];
  for (const [pattern, value] of rules) if (pattern.test(query)) result.push(value);
  return result;
}

export async function locateCompanyComponents(options) {
  if (!options.root) throw new Error("--root is required");
  const projectRoot = await directory(options.root);
  const roots = [projectRoot];
  for (const value of options.sourceRoots || []) roots.push(await directory(value));
  const targets = [];
  for (const value of options.targets || []) targets.push(await targetFile(projectRoot, value));
  const query = options.query || "";
  const candidates = namesIn(query);
  const argument = normalizeName(options.component);
  if (argument && !VALID_NAME.test(argument)) throw new Error(`Invalid component name: ${argument}`);
  const required = argument || explicitlyRequired(query);
  const component = required || (candidates.length === 1 ? candidates[0] : null);
  const found = component ? await findEvidence(projectRoot, roots, targets, component) : { evidence: [], filesRead: [], searchExpansions: 0 };
  const status = required ? "confirmed" : component && found.evidence.length ? "candidate" : "unresolved";
  const userEvidence = required ? [{ kind: "user_instruction", source: argument ? "component_argument" : "query" }] : [];
  return {
    component: {
      role: null,
      name: component,
      status,
      source: [...userEvidence, ...found.evidence],
      environment: environments(query),
      substitution_authorized: false,
      implementation_status: found.evidence.length ? "found" : "unresolved",
      next_check: status === "confirmed" && found.evidence.length
        ? null
        : component
          ? `检查 ${component} 的注册、加载条件和目标运行环境。`
          : "从目标文件、注册映射、同类实现或组件文档定位组件。",
    },
    candidates,
    limits: { max_search_expansions: MAX_SEARCH_EXPANSIONS, max_body_files: MAX_BODY_FILES },
    metrics: { search_expansions: found.searchExpansions, files_read: found.filesRead },
  };
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write("Usage: locate-company-components --root <project> [--query <text>] [--component <name>] [--target <file>] [--source-root <dir>]\n");
    return;
  }
  process.stdout.write(`${JSON.stringify(await locateCompanyComponents(args), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
