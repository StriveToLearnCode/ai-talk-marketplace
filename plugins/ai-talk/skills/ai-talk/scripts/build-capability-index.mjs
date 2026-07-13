#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AI_TALK_SKILL_ROOT = path.resolve(SCRIPT_DIR, "..");
const MAX_FILE_BYTES = 256 * 1024;

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".tmp",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

const SENSITIVE_PARTS = [
  ".env",
  "credential",
  "private-key",
  "private_key",
  "secret",
  "token",
];

const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
]);

const TEXT_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".mdx",
  ".txt",
  ".yaml",
  ".yml",
]);

const SCOPE_PRIORITY = {
  project: 5,
  company: 4,
  user: 3,
  installed: 2,
};

const CAPABILITY_LIFECYCLE = {
  discovery_states: ["candidate_reuse", "candidate_reference", "low_relevance"],
  selection_states: ["auto_selected", "choice_required", "low_relevance"],
  usage_preferences: ["apply", "prefer_reuse", "prefer_reference", "excluded"],
  user_choice_states: ["prefer_reuse", "prefer_reference", "excluded"],
  execution_validation_states: [
    "confirmed_reuse",
    "partial_reuse",
    "incompatible",
    "reference_only",
  ],
};

function usage() {
  return `Build a bounded local capability index for AI Talk.

Usage:
  node build-capability-index.mjs --root <project> [options]

Options:
  --query <text>               Rank capabilities for a task and select 1 main + up to 2 helpers.
  --source-root <label=path>   Add a company or team capability root. Repeat as needed.
  --output <path>              Write JSON to a file instead of stdout.
  --limit <number>             Maximum capabilities included in output (default: 200).
  --no-user-sources            Only scan the project and explicit source roots.
  --help                       Show this help.

Environment:
  AI_TALK_CAPABILITY_ROOTS     Additional roots separated by the platform path delimiter.
                               Entries may use label=/absolute/path.
`;
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    query: "",
    output: null,
    sourceRoots: [],
    includeUserSources: true,
    limit: 200,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") {
      process.stdout.write(usage());
      process.exit(0);
    }
    if (value === "--no-user-sources") {
      args.includeUserSources = false;
      continue;
    }

    const next = argv[index + 1];
    if (["--root", "--query", "--source-root", "--output", "--limit"].includes(value)) {
      if (!next) {
        throw new Error(`${value} requires a value.`);
      }
      index += 1;
      if (value === "--root") args.root = next;
      if (value === "--query") args.query = next;
      if (value === "--source-root") args.sourceRoots.push(next);
      if (value === "--output") args.output = next;
      if (value === "--limit") {
        const parsed = Number.parseInt(next, 10);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5000) {
          throw new Error("--limit must be an integer between 1 and 5000.");
        }
        args.limit = parsed;
      }
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }

  return args;
}

function isSensitive(relativePath) {
  const lowered = relativePath.toLowerCase();
  if ([".key", ".p12", ".pem", ".pfx"].includes(path.extname(lowered))) return true;
  return lowered
    .split(path.sep)
    .some((part) => SENSITIVE_PARTS.some((needle) => part === needle || part.startsWith(`${needle}.`)));
}

async function exists(candidate) {
  try {
    await access(candidate, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function parseSourceRoot(raw, defaultLabel = "company") {
  const separator = raw.indexOf("=");
  if (separator > 0) {
    return {
      label: raw.slice(0, separator).trim() || defaultLabel,
      root: path.resolve(raw.slice(separator + 1).trim()),
    };
  }
  return { label: defaultLabel, root: path.resolve(raw) };
}

function installedPluginSkillRoots(home) {
  return [{ label: "codex-plugin-cache", root: path.join(home, ".codex", "plugins", "cache") }];
}

function commonUserSkillRoots(home) {
  return [
    ["agents-skills", ".agents/skills"],
    ["codex-skills", ".codex/skills"],
    ["claude-skills", ".claude/skills"],
    ["cc-switch-skills", ".cc-switch/skills"],
    ["cursor-skills", ".cursor/skills-cursor"],
    ["gemini-skills", ".gemini/skills"],
    ["hermes-skills", ".hermes/skills"],
  ].map(([label, relative]) => ({ label, root: path.join(home, relative) }));
}

async function walkFiles(root, maxDepth, visitor, relative = "", depth = 0) {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = await readdir(path.join(root, relative), { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const childRelative = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name) || isSensitive(childRelative)) continue;
      await walkFiles(root, maxDepth, visitor, childRelative, depth + 1);
      continue;
    }
    if (entry.isFile() && !isSensitive(childRelative)) {
      await visitor(path.join(root, childRelative), childRelative);
    }
  }
}

async function readBounded(filePath) {
  try {
    const metadata = await stat(filePath);
    if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) return null;
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function cleanText(value, maxLength = 320) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_>#|\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parseFrontmatter(content) {
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("\n---", 3);
  if (end === -1) return {};
  const data = {};
  for (const line of content.slice(3, end).split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (!match) continue;
    data[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return data;
}

function markdownMetadata(content, fallbackName) {
  const frontmatter = parseFrontmatter(content);
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const bodyStart = content.startsWith("---") ? content.indexOf("\n---", 3) + 4 : 0;
  const paragraphs = content
    .slice(Math.max(0, bodyStart))
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter((item) => item && !item.startsWith("#"))
    .map((item) => cleanText(item))
    .filter(Boolean);

  return {
    name: frontmatter.name || heading || fallbackName,
    description: frontmatter.description || paragraphs[0] || "",
  };
}

function exportedSymbols(content) {
  const names = new Set();
  const patterns = [
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /(?:defineComponent|defineStore|defineComposable)\s*\(\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) names.add(match[1]);
  }
  return [...names].slice(0, 20);
}

function humanize(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function classifyProjectFile(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const lowered = normalized.toLowerCase();
  const basename = path.basename(lowered);
  const extension = path.extname(lowered);
  const parts = lowered.split("/");

  if (basename === "skill.md") return "skill";
  if (basename === "agents.md") return "standard";
  if (parts.some((part) => part === "prompts" || part === "prompt") || basename.includes("prompt")) {
    return TEXT_EXTENSIONS.has(extension) ? "prompt" : null;
  }
  if (parts.some((part) => part === "templates" || part === "template")) return "template";
  if (parts.includes("components") && SOURCE_EXTENSIONS.has(extension)) return "component";
  if (parts.some((part) => ["composables", "hooks", "utils"].includes(part)) && SOURCE_EXTENSIONS.has(extension)) {
    return "utility";
  }
  if (
    parts.some((part) => ["archive", "examples", "legacy", "pages", "stories", "views"].includes(part)) &&
    SOURCE_EXTENSIONS.has(extension)
  ) {
    return "implementation";
  }
  if (basename.startsWith("readme") || basename.startsWith("contributing")) return "standard";
  if (
    ["package.json", "pyproject.toml", "biome.json"].includes(basename) ||
    /^(eslint|prettier|tsconfig|vite|vitest|webpack)/.test(basename)
  ) {
    return "standard";
  }
  if (
    parts.includes("docs") &&
    /(architecture|convention|development|guideline|规范|标准|约定)/i.test(basename)
  ) {
    return "standard";
  }
  return null;
}

function capabilityId(kind, source, relativePath) {
  return createHash("sha1").update(`${kind}\0${source}\0${relativePath}`).digest("hex").slice(0, 16);
}

async function makeCapability({ filePath, relativePath, kind, scope, source }) {
  if (path.resolve(filePath) === path.join(AI_TALK_SKILL_ROOT, "SKILL.md")) return null;
  const content = await readBounded(filePath);
  if (content === null) return null;

  const fallbackName = humanize(filePath);
  const metadata = TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()) || kind === "skill"
    ? markdownMetadata(content, fallbackName)
    : { name: fallbackName, description: "" };
  if (kind === "skill" && metadata.name.trim().toLowerCase() === "ai-talk") return null;
  const symbols = SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
    ? exportedSymbols(content)
    : [];
  const description = cleanText(
    metadata.description || (symbols.length ? `Exports: ${symbols.join(", ")}` : ""),
  );

  return {
    id: capabilityId(kind, source, relativePath),
    kind,
    name: cleanText(metadata.name || fallbackName, 120),
    description,
    path: path.resolve(filePath),
    relative_path: relativePath.split(path.sep).join("/"),
    scope,
    source,
    symbols,
  };
}

async function discoverProjectCapabilities(projectRoot, warnings) {
  const capabilities = [];
  await walkFiles(projectRoot, 8, async (filePath, relativePath) => {
    const kind = classifyProjectFile(relativePath);
    if (!kind) return;
    const capability = await makeCapability({
      filePath,
      relativePath,
      kind,
      scope: "project",
      source: "project",
    });
    if (capability) capabilities.push(capability);
  });
  if (!capabilities.length) warnings.push("No project capabilities were discovered.");
  return capabilities;
}

async function discoverSkills(sourceRoot, scope, source) {
  const capabilities = [];
  await walkFiles(sourceRoot, 9, async (filePath, relativePath) => {
    if (path.basename(filePath).toLowerCase() !== "skill.md") return;
    const capability = await makeCapability({
      filePath,
      relativePath,
      kind: "skill",
      scope,
      source,
    });
    if (capability) capabilities.push(capability);
  });
  return capabilities;
}

async function discoverExternalCapabilities(sourceRoot, source) {
  const capabilities = [];
  await walkFiles(sourceRoot, 8, async (filePath, relativePath) => {
    const kind = classifyProjectFile(relativePath);
    if (!kind) return;
    const capability = await makeCapability({
      filePath,
      relativePath,
      kind,
      scope: "company",
      source,
    });
    if (capability) capabilities.push(capability);
  });
  return capabilities;
}

function deduplicate(capabilities) {
  const selected = new Map();
  for (const capability of capabilities) {
    const key = capability.kind === "skill"
      ? `skill:${capability.name.toLowerCase()}`
      : `${capability.kind}:${capability.path}`;
    const previous = selected.get(key);
    if (!previous || SCOPE_PRIORITY[capability.scope] > SCOPE_PRIORITY[previous.scope]) {
      selected.set(key, capability);
    }
  }
  return [...selected.values()];
}

function tokenize(value) {
  const tokens = new Set();
  const lowered = value.toLowerCase();
  for (const match of lowered.matchAll(/[a-z0-9][a-z0-9._-]*/g)) {
    if (match[0].length > 1) tokens.add(match[0]);
  }
  for (const match of lowered.matchAll(/[\u3400-\u9fff]+/g)) {
    const sequence = match[0];
    if (sequence.length === 1) tokens.add(sequence);
    for (let index = 0; index < sequence.length - 1; index += 1) {
      tokens.add(sequence.slice(index, index + 2));
    }
  }
  return [...tokens];
}

function rankCapability(capability, query) {
  const queryTokens = tokenize(query);
  const queryTokenSet = new Set(queryTokens);
  const fields = {
    name: tokenize(capability.name),
    description: tokenize(capability.description),
    path: tokenize(capability.relative_path),
    symbols: tokenize(capability.symbols.join(" ")),
  };
  let score = 0;
  const matched = new Set();
  for (const token of queryTokens) {
    if (fields.name.includes(token)) {
      score += 8;
      matched.add(token);
    }
    if (fields.symbols.includes(token)) {
      score += 7;
      matched.add(token);
    }
    if (fields.description.includes(token)) {
      score += 4;
      matched.add(token);
    }
    if (fields.path.includes(token)) {
      score += 2;
      matched.add(token);
    }
  }

  const intentRules = [
    { query: ["bug", "debug", "修复", "报错", "异常", "排查"], hints: ["debug", "test", "排查", "调试", "测试"] },
    { query: ["api", "接口", "联调", "请求", "响应"], hints: ["api", "request", "接口", "请求", "联调"] },
    { query: ["ui", "figma", "页面", "组件", "样式"], hints: ["ui", "component", "page", "页面", "组件", "视觉"] },
    { query: ["review", "审查", "评审"], hints: ["review", "审查", "规范", "standard"] },
    { query: ["test", "测试", "回归"], hints: ["test", "playwright", "测试", "验证"] },
    { query: ["browser", "浏览器", "截图"], hints: ["browser", "playwright", "screenshot", "浏览器", "截图"] },
  ];
  const searchable = `${capability.name} ${capability.description} ${capability.relative_path}`.toLowerCase();
  const searchableTokens = new Set(tokenize(searchable));
  const containsTerm = (text, tokenSet, term) => (
    /^[a-z0-9._-]+$/.test(term) ? tokenSet.has(term) : text.includes(term)
  );
  for (const rule of intentRules) {
    const matchedQueryTerms = rule.query.filter((term) => containsTerm(query.toLowerCase(), queryTokenSet, term));
    if (matchedQueryTerms.length && rule.hints.some((term) => containsTerm(searchable, searchableTokens, term))) {
      score += 5;
      matchedQueryTerms.forEach((term) => matched.add(term));
    }
  }

  if (score > 0) score += SCOPE_PRIORITY[capability.scope] || 0;
  return {
    ...capability,
    score,
    matched_terms: [...matched].slice(0, 12),
  };
}

function compareRanked(left, right) {
  return (
    right.score - left.score ||
    (SCOPE_PRIORITY[right.scope] || 0) - (SCOPE_PRIORITY[left.scope] || 0) ||
    left.name.localeCompare(right.name) ||
    left.path.localeCompare(right.path)
  );
}

function publicCapabilityType(kind) {
  return {
    implementation: "example",
    standard: "project_rule",
    template: "prompt",
  }[kind] || kind;
}

function discoveryStatus(item, mainScore) {
  if (item.score < Math.max(6, Math.floor(mainScore * 0.2))) return "low_relevance";
  if (item.scope === "project" && ["component", "utility"].includes(item.kind)) {
    return "candidate_reuse";
  }
  return "candidate_reference";
}

function candidateDetails(item, mainScore) {
  const type = publicCapabilityType(item.kind);
  return {
    id: item.id,
    kind: item.kind,
    type,
    name: item.name,
    path: item.path,
    scope: item.scope,
    source: item.source,
    score: item.score,
    matched_terms: item.matched_terms,
    match_reason: item.matched_terms.length
      ? `Matched task terms: ${item.matched_terms.join(", ")}`
      : `Matched task intent in ${type} metadata.`,
    discovery_status: discoveryStatus(item, mainScore),
    pending_validation: [
      "Read the real file before relying on this capability.",
      "Verify API, data shape, dependencies, configuration, and applicable constraints.",
    ],
    potential_risks: [
      "Metadata similarity does not prove runtime compatibility.",
      "Do not change a shared capability solely to force reuse.",
    ],
    selection_status: "low_relevance",
    usage_preference: null,
    selection_source: null,
    choice_reason: null,
    user_choice: null,
    execution_validation: null,
  };
}

function selectCapabilities(ranked) {
  if (!ranked.length || ranked[0].score <= 0) return [];
  const main = ranked[0];
  const minimumHelperScore = Math.max(6, Math.floor(main.score * 0.3));
  const candidates = ranked.slice(1).filter((item) => item.score >= minimumHelperScore);
  const helpers = [];
  const coveredTerms = new Set(main.matched_terms);
  const remaining = [...candidates];

  while (helpers.length < 2 && remaining.length) {
    remaining.sort((left, right) => {
      const leftNovelty = left.matched_terms.filter((term) => !coveredTerms.has(term)).length;
      const rightNovelty = right.matched_terms.filter((term) => !coveredTerms.has(term)).length;
      const leftKindNovelty = left.kind !== main.kind && !helpers.some((item) => item.kind === left.kind) ? 1 : 0;
      const rightKindNovelty = right.kind !== main.kind && !helpers.some((item) => item.kind === right.kind) ? 1 : 0;
      return rightNovelty - leftNovelty || rightKindNovelty - leftKindNovelty || compareRanked(left, right);
    });

    const candidate = remaining.shift();
    const novelty = candidate.matched_terms.filter((term) => !coveredTerms.has(term)).length;
    const addsKind = candidate.kind !== main.kind && !helpers.some((item) => item.kind === candidate.kind);
    if (novelty === 0 && !addsKind) break;
    helpers.push(candidate);
    candidate.matched_terms.forEach((term) => coveredTerms.add(term));
  }

  return [main, ...helpers].map((item, index) => ({
    role: index === 0 ? "main" : "auxiliary",
    ...candidateDetails(item, main.score),
  }));
}

function automaticUsagePreference(item) {
  if (["skill", "project_rule"].includes(item.type)) return "apply";
  if (["prompt", "example"].includes(item.type)) return "prefer_reference";
  return "prefer_reuse";
}

function isCompetingAlternative(selectedItem, candidate, mainScore) {
  if (candidate.id === selectedItem.id || candidate.kind !== selectedItem.kind) return false;
  if (discoveryStatus(candidate, mainScore) === "low_relevance") return false;
  if (candidate.score < Math.max(6, Math.floor(selectedItem.score * 0.8))) return false;
  const selectedTerms = new Set(selectedItem.matched_terms);
  const overlap = candidate.matched_terms.filter((term) => selectedTerms.has(term));
  const novel = candidate.matched_terms.filter((term) => !selectedTerms.has(term));
  return overlap.length > 0 && novel.length === 0;
}

function classifySelections(selected, ranked, mainScore) {
  const reusableKinds = new Set(["component", "utility", "implementation"]);
  const selectedIds = new Set(selected.map((item) => item.id));
  const alternatives = [];
  const classified = selected.map((item) => {
    const isReusableImplementation = reusableKinds.has(item.kind);
    const competingOptions = isReusableImplementation
      ? ranked.filter((candidate) => !selectedIds.has(candidate.id) && isCompetingAlternative(item, candidate, mainScore))
      : [];
    const hasCompetingSelection = competingOptions.length > 0;
    const isSharedImplementation = isReusableImplementation && item.scope !== "project";
    const requiresChoice = hasCompetingSelection || isSharedImplementation;

    if (requiresChoice) {
      const reasons = [];
      if (hasCompetingSelection) reasons.push("Multiple relevant options compete for the same capability type.");
      if (isSharedImplementation) reasons.push("The capability is shared or outside the current project, so adaptation is uncertain.");
      for (const candidate of competingOptions.slice(0, 2)) {
        alternatives.push({
          role: "alternative",
          ...candidateDetails(candidate, mainScore),
          selection_status: "choice_required",
          usage_preference: null,
          selection_source: null,
          choice_reason: "This option closely overlaps another selected capability for the same role.",
        });
      }
      return {
        ...item,
        selection_status: "choice_required",
        usage_preference: null,
        selection_source: null,
        choice_reason: reasons.join(" "),
      };
    }

    return {
      ...item,
      selection_status: "auto_selected",
      usage_preference: automaticUsagePreference(item),
      selection_source: "ai_talk",
      choice_reason: "This is the only selected high-relevance capability for its role.",
    };
  });
  return { classified, alternatives };
}

function automaticSupplements(ranked, selected, mainScore) {
  const selectedIds = new Set(selected.map((item) => item.id));
  const isRelevant = (item) => discoveryStatus(item, mainScore) !== "low_relevance";
  const projectRules = ranked
    .filter((item) => item.kind === "standard" && item.scope === "project" && !selectedIds.has(item.id) && isRelevant(item))
    .slice(0, 2)
    .map((item) => ({ role: "constraint", ...candidateDetails(item, mainScore) }));
  const prompts = ranked
    .filter((item) => item.kind === "prompt" && !selectedIds.has(item.id) && isRelevant(item))
    .slice(0, 1)
    .map((item) => ({ role: "auxiliary", ...candidateDetails(item, mainScore) }));
  return [...projectRules, ...prompts];
}

function summarize(capabilities) {
  const byKind = {};
  const byScope = {};
  for (const capability of capabilities) {
    byKind[capability.kind] = (byKind[capability.kind] || 0) + 1;
    byScope[capability.scope] = (byScope[capability.scope] || 0) + 1;
  }
  return { total: capabilities.length, by_kind: byKind, by_scope: byScope };
}

async function buildIndex(args) {
  const projectRoot = path.resolve(args.root);
  if (!(await exists(projectRoot))) throw new Error(`Project root is not readable: ${projectRoot}`);

  const warnings = [];
  const roots = [{ label: "project", root: projectRoot, scope: "project" }];
  const capabilities = await discoverProjectCapabilities(projectRoot, warnings);
  const home = os.homedir();

  if (args.includeUserSources) {
    for (const source of commonUserSkillRoots(home)) {
      if (!(await exists(source.root))) continue;
      roots.push({ ...source, scope: "user" });
      capabilities.push(...(await discoverSkills(source.root, "user", source.label)));
    }
    for (const source of installedPluginSkillRoots(home)) {
      if (!(await exists(source.root))) continue;
      roots.push({ ...source, scope: "installed" });
      capabilities.push(...(await discoverSkills(source.root, "installed", source.label)));
    }
  }

  const environmentRoots = (process.env.AI_TALK_CAPABILITY_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  for (const raw of [...args.sourceRoots, ...environmentRoots]) {
    const source = parseSourceRoot(raw);
    if (!(await exists(source.root))) {
      warnings.push(`Capability source is not readable and was skipped: ${source.root}`);
      continue;
    }
    roots.push({ ...source, scope: "company" });
    capabilities.push(...(await discoverExternalCapabilities(source.root, source.label)));
  }

  const unique = deduplicate(capabilities);
  const ranked = args.query
    ? unique.map((item) => rankCapability(item, args.query)).sort(compareRanked)
    : unique
        .map((item) => ({ ...item, score: 0, matched_terms: [] }))
        .sort((left, right) => left.scope.localeCompare(right.scope) || left.path.localeCompare(right.path));
  const mainScore = ranked[0]?.score || 0;
  const baseSelected = args.query ? selectCapabilities(ranked) : [];
  const supplemented = args.query
    ? [...baseSelected, ...automaticSupplements(ranked, baseSelected, mainScore)]
    : [];
  const classification = args.query
    ? classifySelections(supplemented, ranked, mainScore)
    : { classified: [], alternatives: [] };
  const classifiedSelection = [...classification.classified, ...classification.alternatives]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
  const automatic = classifiedSelection.filter((item) => item.selection_status === "auto_selected");
  const choiceRequired = classifiedSelection
    .filter((item) => item.selection_status === "choice_required")
    .slice(0, 3);
  const includedIds = new Set([...automatic, ...choiceRequired].map((item) => item.id));
  const selected = classifiedSelection.filter((item) => includedIds.has(item.id));
  const selectedById = new Map(selected.map((item) => [item.id, item]));
  const rankedCapabilities = args.query ? ranked.filter((item) => item.score > 0) : ranked;
  const outputCapabilities = rankedCapabilities
    .slice(0, args.limit)
    .map((item) => selectedById.get(item.id) || candidateDetails(item, mainScore));

  return {
    schema_version: 3,
    project_root: projectRoot,
    query: args.query || null,
    roots,
    lifecycle: CAPABILITY_LIFECYCLE,
    stats: {
      ...summarize(unique),
      returned: outputCapabilities.length,
      truncated: outputCapabilities.length < rankedCapabilities.length,
    },
    selected,
    automatic,
    choice_required: choiceRequired,
    capabilities: outputCapabilities,
    warnings,
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = await buildIndex(args);
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    if (args.output) {
      await writeFile(path.resolve(args.output), serialized, "utf8");
    } else {
      process.stdout.write(serialized);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

await main();
