#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { access, open, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { formatUserOutput } from "./format-user-output.mjs";

const SKILL_ROOT = path.join(".agents", "skills");
const MAX_BYTES = 128 * 1024;
const APPLICABILITY_HEADING = /^(何时使用|适用场景|使用场景|触发条件|when to use|use cases?|输入模式)/i;

const ROUTES = {
  "ui-self-check": ["live_ui_findings", "ui_page", "inspect_ui", ["浏览器", "视觉", "交互", "响应式", "控制台", "网络", "页面"]],
  "ai-test": ["midscene_test_file", "automated_test", "generate_or_run_tests", ["midscene", "自动化测试", "测试用例", "测试文件"]],
  "gen-frontend-plan": ["frontend_plan_files", "frontend_plan", "create_plan", ["docs/plan", "前端方案", "前端计划", "实施计划"]],
  "gen-code": ["frontend_code_changes", "ui_page", "modify_code", ["生成代码", "修改代码", "页面代码", "直接实现", "加逻辑", "组件"]],
  "figma-analyze": ["figma_analysis_docs", "figma_prototype", "analyze_design", ["figma", "原型分析", "交互梳理", "markdown"]],
  "figma-to-ui-meta": ["figma_ui_meta", "figma_prototype", "convert_design", ["figma", "ui-meta", "mercury", "json"]],
  "gen-page-center-config": ["page_center_config", "page_center", "configure", ["pagecenter", "page-center", "推送配置", "同步文案"]],
  "custom-components-skill": ["activity_block_component", "activity_block", "create_component", ["活动积木", "积木组件", "uimeta", "可配置玩法块"]],
  "ui2-upgrade-guide": ["frontend_code_changes", "ui2_component", "upgrade_component", ["ui2", "组件升级", "组件迁移"]],
  "gen-service": ["service_files", "api_service", "generate_service", ["openapi", "service", "接口文件"]],
};

const CONFUSION_GROUPS = [
  ["ui-self-check", "ai-test"],
  ["gen-code", "gen-frontend-plan"],
  ["figma-analyze", "figma-to-ui-meta", "gen-code"],
  ["gen-page-center-config", "gen-code"],
  ["custom-components-skill", "gen-code", "ui2-upgrade-guide"],
];

const INTENT_TERMS = [
  "midscene-test.ts", "midscene", "自动化测试", "测试用例", "写测试", "生成测试", "跑测试", "测一下",
  "ui 自测", "浏览器检查", "playwright", "截图对比", "控制台", "网络请求", "docs/plan", "前端方案",
  "只出方案", "生成代码", "修改代码", "直接实现", "figma", "原型分析", "ui-meta", "pagecenter",
  "推送配置", "活动积木", "积木组件", "普通组件", "openapi", "service",
];

const EXPANDED_TERMS = {
  live_ui_findings: ["浏览器即时检查", "视觉与交互复验"],
  midscene_test_file: ["midscene-test.ts", "Midscene 自动化用例"],
  frontend_plan_files: ["docs/plan", "前端实施方案"],
  frontend_code_changes: ["前端源码改动", "实现并验证"],
  figma_analysis_docs: ["Figma 原型分析文档"],
  figma_ui_meta: ["figma-ui-meta.json", "Mercury 转换产物"],
  page_center_config: ["page-center-config.json", "远端配置推送"],
  activity_block_component: ["活动积木组件", "uiMeta 可配置玩法块"],
};

const COMPARISON_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "docs", "skills");
const PLUGIN_SKILLS_ROOT = path.resolve(import.meta.dirname, "..", "..");

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    query: null,
    sourceRoots: [],
    excludeRoots: [],
    evidenceTypes: [],
    limit: 5,
    debugJson: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") {
      process.stdout.write(
        "Usage: route-company-skills.mjs --root <project> --query '<user input>' [--source-root <label=path>] [--evidence-type <type>] [--debug-json]\n",
      );
      process.exit(0);
    }
    if (flag === "--debug-json") {
      args.debugJson = true;
      continue;
    }
    if (!["--root", "--query", "--source-root", "--exclude-root", "--evidence-type", "--limit", "--top-k"].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    if (flag === "--root") args.root = value;
    if (flag === "--query") args.query = value;
    if (flag === "--source-root") args.sourceRoots.push(value);
    if (flag === "--exclude-root") args.excludeRoots.push(value);
    if (flag === "--evidence-type") args.evidenceTypes.push(value);
    if (flag === "--limit" || flag === "--top-k") {
      args.limit = Number.parseInt(value, 10);
      if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20) {
        throw new Error("--limit must be an integer between 1 and 20.");
      }
    }
  }
  if (!args.query) throw new Error("--query is required.");
  return args;
}

function clean(value, limit = 400) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

async function readable(candidate) {
  try {
    await access(candidate, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function readBounded(file) {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead > MAX_BYTES ? null : buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function unquote(value) {
  const text = value.trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
  return text;
}

function extractApplicability(lines) {
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,4})\s+(.+)$/);
    if (!heading || !APPLICABILITY_HEADING.test(heading[2].trim())) continue;
    const level = heading[1].length;
    while (++index < lines.length) {
      const next = lines[index].match(/^(#{1,4})\s+/);
      if (next && next[1].length <= level) {
        index -= 1;
        break;
      }
      result.push(lines[index]);
    }
  }
  return clean(result.join(" ").replace(/```[\s\S]*?```/g, " ").replace(/[`*_>#|]/g, " "), 1200);
}

function parseSkill(content) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return null;
  const metadata = {};
  for (let index = 1; index < end; index += 1) {
    const match = lines[index].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match || !["name", "description"].includes(match[1])) continue;
    if (/^[>|][+-]?$/.test(match[2].trim())) {
      const block = [];
      while (++index < end && /^\s+/.test(lines[index])) block.push(lines[index].trim());
      index -= 1;
      metadata[match[1]] = clean(block.join(" "), 1000);
    } else {
      metadata[match[1]] = clean(unquote(match[2]), 1000);
    }
  }
  if (!metadata.name || !metadata.description) return null;
  return { ...metadata, applicability: extractApplicability(lines.slice(end + 1)) };
}

async function walk(root, relative = "", depth = 0) {
  if (depth > 8) return [];
  let entries;
  try {
    entries = await readdir(path.join(root, relative), { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(root, child, depth + 1)));
    if (entry.isFile() && entry.name.toLowerCase() === "skill.md") files.push(child);
  }
  return files;
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function exclusionsFrom(query) {
  const result = [];
  for (const match of query.matchAll(/(不要|不需要|无需|禁止|别|不改|不生成|只要|仅|只)([^，。；;\n]{1,28})/g)) {
    result.push((match[1] + match[2]).trim());
  }
  return [...new Set(result)].slice(0, 8);
}

function isBugRequest(text) {
  return hasAny(text, [
    "为什么没有显示", "为什么没显示", "却没有显示", "却没显示", "没有显示", "没显示", "未显示", "不显示",
    "这里不对", "修一下", "异常", "有问题", "报错", "错误", "不生效", "失效", "定位并修复", "排查", "修复",
  ]);
}

function isAnalysisOnly(text) {
  return hasAny(text, [
    "只分析", "只要分析", "仅分析", "只定位", "只排查", "只检查", "只报告",
    "不修改", "不要改代码", "无需修复", "不要修复", "不修复",
  ]);
}

function isExplicitLiveInspection(text) {
  const opensPage = hasAny(text, [
    "打开页面", "看看页面", "看一下页面", "检查页面", "用浏览器", "浏览器看", "浏览器检查", "对照截图检查",
  ]);
  const checksUi = hasAny(text, [
    "视觉", "交互", "响应式", "控制台", "网络", "页面效果", "截图对比", "布局", "按钮点击",
  ]);
  return opensPage && checksUi;
}

function hasScreenshotEvidence(text, suppliedEvidence) {
  if (suppliedEvidence.some((item) => item.toLowerCase() === "screenshot")) return true;
  return hasAny(text, ["见截图", "参考截图", "截图如下", "根据这张图"]);
}

function buildProfile(query, suppliedEvidence) {
  const text = query.toLowerCase();
  const bug = isBugRequest(text);
  const analysisOnly = isAnalysisOnly(text);
  const explicitLive = isExplicitLiveInspection(text);
  const noTest = hasAny(text, ["不要生成测试", "不生成测试", "无需测试文件"]);
  const noCode = hasAny(text, ["不生成代码", "不要生成代码", "不修改代码", "不要改代码", "只出方案"]);
  const noCustom = hasAny(text, ["不接 uimeta", "不用 uimeta", "普通组件", "通用组件"]);
  const test = !noTest && hasAny(text, [
    "midscene", "midscene-test.ts", "生成测试", "写测试", "测试用例", "自动化测试文件", "维护测试", "运行测试",
  ]);
  const page = hasAny(text, ["页面", "活动页", "充值页", "tab", "布局", "交互", "显示", "渲染"]);
  const live = explicitLive || hasAny(text, [
    "ui 自测", "playwright 验证", "截图对比", "边测边修", "响应式检查",
  ]) || (text.includes("测一下") && page) || (bug && analysisOnly && page);
  const plan = hasAny(text, ["docs/plan", "前端方案", "前端计划", "实施计划", "只出方案", "方案文档"]);
  const pageCenter = hasAny(text, ["page-center-config", "推送配置", "同步文案", "同步 assets", "配置入"]);
  const uiMeta = hasAny(text, ["ui-meta", "ui meta", "figma-ui-meta", "调 mercury"]) && hasAny(text, ["转成", "转换", "生成", "输出配置", "调 mercury"]);
  const figma = text.includes("figma") && hasAny(text, ["分析", "梳理", "输出文档", "出方案", "看一下"]);
  const custom = !noCustom && (hasAny(text, ["活动积木", "积木组件", "可配置玩法块"]) || (hasAny(text, ["uimeta", "ui meta"]) && hasAny(text, ["组件", "玩法块", "礼盒"])));
  const service = hasAny(text, ["生成 service", "openapi 转 service", "api 转 ts", "生成接口文件"]) || (text.includes("openapi") && text.includes("service"));
  const explicitCode = hasAny(text, [
    "生成代码", "生成页面代码", "修改代码", "写代码", "直接实现", "直接做", "做页面", "加逻辑", "开发页面",
    "实现页面", "实现 vue", "写组件", "做组件", "做个组件", "改页面", "定位并修改", "定位并修复",
  ]) || (text.includes("页面") && hasAny(text, ["做一下", "做出来", "实现"]));

  // Explicit browser/UI inspection wins over generic words such as “有问题” or “异常”.
  const specialized = test || live || plan || pageCenter || uiMeta || figma || custom || service;
  const code = !noCode && !analysisOnly && !explicitLive && (explicitCode || (bug && !specialized));
  const review = analysisOnly;
  let output = "unknown";
  if (test) output = "midscene_test_file";
  if (live && !test) output = "live_ui_findings";
  if (plan) output = "frontend_plan_files";
  if (code) output = "frontend_code_changes";
  if (figma && !code) output = "figma_analysis_docs";
  if (uiMeta && !custom) output = "figma_ui_meta";
  if (pageCenter && !hasAny(text, ["pagecenter 不动", "不改 pagecenter"])) output = "page_center_config";
  if (custom) output = "activity_block_component";
  if (service) output = "service_files";
  if (review && hasAny(text, ["页面", "ui", "布局", "交互"])) output = "live_ui_findings";

  let target = hasAny(text, ["ui2", "组件升级", "组件迁移"]) ? "ui2_component"
    : hasAny(text, ["普通组件", "通用组件", "vue 组件", "做组件", "写组件", "做个组件"]) ? "generic_component"
      : hasAny(text, ["页面", "活动页", "充值页", "布局", "响应式", "交互", "tab"]) ? "ui_page" : "frontend_code";
  const action = {
    live_ui_findings: "inspect_ui",
    midscene_test_file: "generate_or_run_tests",
    frontend_plan_files: "create_plan",
    frontend_code_changes: target === "generic_component" ? "create_component" : "modify_code",
    figma_analysis_docs: "analyze_design",
    figma_ui_meta: "convert_design",
    page_center_config: "configure",
    activity_block_component: "create_component",
    service_files: "generate_service",
  }[output] || "unknown";
  const targetByOutput = {
    live_ui_findings: "ui_page",
    midscene_test_file: "automated_test",
    frontend_plan_files: "frontend_plan",
    figma_analysis_docs: "figma_prototype",
    figma_ui_meta: "figma_prototype",
    page_center_config: "page_center",
    activity_block_component: "activity_block",
    service_files: "api_service",
  };
  target = targetByOutput[output] || target;
  let mode = "unknown";
  if (output === "live_ui_findings") mode = review ? "review_only" : "live_check_and_fix";
  if (["midscene_test_file", "figma_analysis_docs", "figma_ui_meta", "service_files"].includes(output)) mode = "generate_artifact";
  if (output === "frontend_plan_files") mode = "plan_only";
  if (["frontend_code_changes", "activity_block_component"].includes(output)) mode = "modify_and_verify";
  if (output === "page_center_config") mode = "configure_and_push";

  const evidence = new Set(suppliedEvidence.map((item) => item.toLowerCase()));
  if (hasScreenshotEvidence(text, suppliedEvidence)) evidence.add("screenshot");
  if (text.includes("figma")) evidence.add("figma");
  if (text.includes("openapi")) evidence.add("openapi");
  return {
    task_action: action,
    target_category: target,
    desired_output: output,
    execution_mode: mode,
    evidence_types: [...evidence].sort(),
    intent_terms: INTENT_TERMS.filter((term) => text.includes(term)),
    exclusion_terms: exclusionsFrom(query),
    unknowns: output === "unknown" ? ["需要确认期望产物。"] : [],
  };
}

function within(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function discoverRoot(info, exclusions, warnings) {
  const root = path.resolve(info.root);
  if (exclusions.some((item) => within(root, item))) {
    warnings.push(`Excluded non-runtime Skill root: ${root}`);
    return [];
  }
  if (!(await readable(root))) return [];
  const result = [];
  for (const relative of await walk(root)) {
    const absolute = path.join(root, relative);
    if (exclusions.some((item) => within(absolute, item))) continue;
    const content = await readBounded(absolute);
    if (content === null) continue;
    const metadata = parseSkill(content);
    if (!metadata || metadata.name.toLowerCase() === "ai-talk") continue;
    result.push({ ...metadata, path: absolute, source: info.label, scope: info.scope });
  }
  return result;
}

function conflictsFor(skills) {
  const grouped = new Map();
  for (const skill of skills) grouped.set(skill.name.toLowerCase(), [...(grouped.get(skill.name.toLowerCase()) || []), skill]);
  return [...grouped]
    .filter(([, items]) => items.length > 1)
    .map(([name, items]) => ({
      name,
      paths: items.map((item) => item.path).sort(),
      sources: [...new Set(items.map((item) => item.source))].sort(),
    }));
}

function uniqueSkills(skills) {
  const priority = { project: 3, companion: 2, company: 1 };
  const map = new Map();
  for (const skill of [...skills].sort((a, b) => (priority[b.scope] || 0) - (priority[a.scope] || 0) || a.path.localeCompare(b.path))) {
    if (!map.has(skill.name.toLowerCase())) map.set(skill.name.toLowerCase(), skill);
  }
  return [...map.values()];
}

function normalize(value) {
  return value.toLowerCase().replace(/[_/.-]+/g, " ").replace(/\s+/g, " ").trim();
}

function scoreSkill(skill, profile, query) {
  const route = ROUTES[skill.name.toLowerCase()];
  const searchable = normalize(`${skill.name} ${skill.description} ${skill.applicability}`);
  let overlap = 0;
  for (const term of query.toLowerCase().match(/[a-z0-9._-]+|[\u3400-\u9fff]{2,}/g) || []) {
    if (searchable.includes(term)) overlap += 2;
  }
  let score = Math.min(12, overlap);
  if (route) {
    const [output, target, action, terms] = route;
    score += output === profile.desired_output ? 48 : profile.desired_output === "unknown" ? 0 : -22;
    if (target === profile.target_category || (skill.name === "gen-code" && ["frontend_code", "ui_page", "generic_component"].includes(profile.target_category))) score += 18;
    if (action === profile.task_action || (skill.name === "gen-code" && profile.task_action === "create_component")) score += 14;
    score += Math.min(15, terms.filter((term) => query.toLowerCase().includes(term)).length * 5);
  }
  if (skill.name === "ai-test" && profile.intent_terms.includes("测一下") && profile.desired_output !== "midscene_test_file") score -= 45;
  if (skill.name === "figma-analyze" && profile.desired_output === "frontend_code_changes") score -= 28;
  if (skill.name === "custom-components-skill" && profile.target_category === "generic_component") score -= 35;
  return { skill, score };
}

function reasonsFor(item, profile, query) {
  const text = query.toLowerCase();
  if (!ROUTES[item.skill.name.toLowerCase()]) return ["该 Skill 的适用描述与当前任务直接相关。"];
  const reasons = [];
  if (profile.evidence_types.includes("screenshot")) reasons.push("用户明确提供了截图作为当前任务证据。");
  if (hasAny(text, ["页面", "活动页", "充值页"])) reasons.push("任务对象是现有前端页面。");
  if (profile.execution_mode === "review_only") reasons.push("用户明确要求只分析或检查，不修改代码。");
  if (profile.desired_output === "live_ui_findings") reasons.push("需要即时检查页面的视觉、交互或运行状态。");
  if (profile.desired_output === "midscene_test_file") reasons.push("目标是生成、维护或运行 Midscene 自动化测试。");
  if (profile.desired_output === "frontend_plan_files") reasons.push("目标是输出前端实施计划，而不是修改源码。");
  if (profile.desired_output === "frontend_code_changes") reasons.push(isBugRequest(text) ? "目标是定位现有行为原因、修复并验证结果。" : "目标是实际修改前端代码并验证结果。");
  if (profile.desired_output === "figma_analysis_docs") reasons.push("目标是产出独立的 Figma 原型分析文档。");
  if (profile.desired_output === "figma_ui_meta") reasons.push("目标是生成 figma-ui-meta.json 转换产物。");
  if (profile.desired_output === "page_center_config") reasons.push("目标是生成或推送 PageCenter 配置。");
  if (profile.desired_output === "activity_block_component") reasons.push("目标是实现 uiMeta 可配置的活动积木组件。");
  if (profile.desired_output === "service_files") reasons.push("目标是从 OpenAPI 生成接口服务文件。");
  return reasons.length ? [...new Set(reasons)].slice(0, 3) : ["该 Skill 的适用范围与当前任务直接相关。"];
}

function exclusionReason(name, profile) {
  if (name === "ai-test") return "未要求生成或运行 Midscene 自动化测试；页面即时检查不属于测试文件产出。";
  if (name === "ui-self-check") return "任务要求生成或运行 Midscene 测试，不是即时页面检查。";
  if (name === "gen-code") return profile.desired_output === "frontend_plan_files" ? "本轮只要求前端实施计划，不修改代码。" : "当前明确要求即时检查页面，而不是定位并修改现有代码。";
  if (name === "gen-frontend-plan") return "未要求输出前端实施计划。";
  if (name === "figma-analyze") return "Figma 是开发证据，或目标不是独立分析文档。";
  if (name === "figma-to-ui-meta") return "未要求生成 figma-ui-meta.json。";
  if (name === "gen-page-center-config") return "未要求 PageCenter 配置或推送结果。";
  if (name === "custom-components-skill") return "没有活动积木或 uiMeta 可配置玩法块证据。";
  return "该 Skill 与当前任务的直接相关性低于推荐项。";
}

export async function routeCompanySkills(args) {
  const root = path.resolve(args.root);
  const warnings = [];
  const exclusions = [COMPARISON_ROOT, ...args.excludeRoots.map(path.resolve)];
  const roots = [{ label: "ai-talk-companion", root: PLUGIN_SKILLS_ROOT, scope: "companion" }];
  const project = path.join(root, SKILL_ROOT);
  if (await readable(project)) roots.push({ label: "project", root: project, scope: "project" });
  for (const raw of args.sourceRoots) {
    const separator = raw.indexOf("=");
    roots.push({
      label: separator > 0 ? raw.slice(0, separator) : "company",
      root: path.resolve(separator > 0 ? raw.slice(separator + 1) : raw),
      scope: "company",
    });
  }

  const all = [];
  for (const source of roots) all.push(...await discoverRoot(source, exclusions, warnings));
  const conflicts = conflictsFor(all);
  const skills = uniqueSkills(all);
  const profile = buildProfile(args.query, args.evidenceTypes);
  const ranked = skills.map((skill) => scoreSkill(skill, profile, args.query))
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  const positive = ranked.filter((item) => item.score > 0).slice(0, args.limit);
  const top = positive[0] || null;
  const group = top ? CONFUSION_GROUPS.find((items) => items.includes(top.skill.name)) : null;
  const byName = new Map(ranked.map((item) => [item.skill.name, item]));
  const candidate = (item) => ({
    name: item.skill.name,
    path: item.skill.path,
    source: item.skill.source,
    score: item.score,
    reasons: reasonsFor(item, profile, args.query),
    name_conflict: conflicts.some((conflict) => conflict.name === item.skill.name.toLowerCase()),
  });
  const byScope = {};
  for (const skill of all) {
    byScope[skill.scope] ||= { files: 0, unique_names: 0 };
    byScope[skill.scope].files += 1;
  }
  for (const skill of skills) byScope[skill.scope].unique_names += 1;
  return {
    schema_version: 2,
    original_goal: args.query,
    retrieval_profile: profile,
    expanded_terms: EXPANDED_TERMS[profile.desired_output] || [],
    recommendation: top ? candidate(top) : null,
    alternatives: positive.slice(1, 3).map(candidate),
    recommendation_basis: top ? reasonsFor(top, profile, args.query) : [],
    excluded_similar_skills: (group || [])
      .filter((name) => name !== top?.skill.name && byName.has(name))
      .slice(0, 1)
      .map((name) => ({ name, path: byName.get(name).skill.path, reason: exclusionReason(name, profile) })),
    blocking_unknown: profile.unknowns[0] || null,
    index: {
      roots,
      excluded_roots: exclusions,
      stats: { files: all.length, unique_names: skills.length, by_scope: byScope },
      duplicate_name_conflicts: conflicts,
      warnings,
    },
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await routeCompanySkills(args);
    process.stdout.write(args.debugJson ? `${JSON.stringify(result, null, 2)}\n` : `${formatUserOutput(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

await main();
