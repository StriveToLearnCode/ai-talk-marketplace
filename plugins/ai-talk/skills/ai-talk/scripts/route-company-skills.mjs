#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { access, open, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SKILL_ROOT = path.join(".agents", "skills");
const MAX_BYTES = 128 * 1024;
const PROFILE_FIELDS = [
  "task_action",
  "target_category",
  "component_concepts",
  "business_terms",
  "query_terms",
  "exclusions",
  "unknowns",
];
const ARRAY_FIELDS = new Set(PROFILE_FIELDS.slice(2));
const WEIGHTS = {
  task_action: 6,
  target_category: 5,
  component_concepts: 4,
  business_terms: 3,
  query_terms: 2,
};
const APPLICABILITY_HEADING = /^(何时使用|适用场景|使用场景|触发条件|when to use|use cases?|输入模式)/i;

function parseArgs(argv) {
  const args = { root: process.cwd(), profile: null, query: null, sourceRoots: [], excludeRoots: [], evidenceTypes: [], limit: 5 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") {
      process.stdout.write(
        "Usage: route-company-skills.mjs --root <project> --query '<user input>' [--source-root <label=path>] [--evidence-type <type>] [--top-k 3]\n",
      );
      process.exit(0);
    }
    if (!["--root", "--profile-json", "--query", "--source-root", "--exclude-root", "--evidence-type", "--limit", "--top-k"].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    if (flag === "--root") args.root = value;
    if (flag === "--profile-json") args.profile = value;
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
  if (!args.profile && !args.query) throw new Error("--query or --profile-json is required.");
  return args;
}

function clean(value, limit = 400) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function parseProfile(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`--profile-json must be valid JSON: ${error.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("--profile-json must contain an object.");
  }
  const extra = Object.keys(value).filter((key) => !PROFILE_FIELDS.includes(key));
  if (extra.length) throw new Error(`Unknown profile field(s): ${extra.join(", ")}`);
  const profile = {};
  for (const field of PROFILE_FIELDS) {
    if (ARRAY_FIELDS.has(field)) {
      if (!Array.isArray(value[field])) throw new Error(`${field} must be an array.`);
      profile[field] = [...new Set(value[field].map((item) => {
        if (typeof item !== "string") throw new Error(`${field} entries must be strings.`);
        return clean(item, 160);
      }).filter(Boolean))].slice(0, 20);
    } else {
      if (typeof value[field] !== "string") throw new Error(`${field} must be a string.`);
      profile[field] = clean(value[field], 160);
    }
  }
  if (!profile.task_action || !profile.target_category) {
    throw new Error("task_action and target_category must not be empty.");
  }
  return profile;
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
  return clean(
    result.join(" ").replace(/```[\s\S]*?```/g, " ").replace(/[`*_>#|]/g, " "),
    1200,
  );
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

async function discover(projectRoot, warnings) {
  const root = path.join(projectRoot, SKILL_ROOT);
  if (!(await readable(root))) {
    warnings.push(`Skill directory not found: ${SKILL_ROOT}`);
    return [];
  }
  const skills = [];
  for (const relative of await walk(root)) {
    const absolute = path.join(root, relative);
    const content = await readBounded(absolute);
    if (content === null) {
      warnings.push(`Skipped unreadable or oversized Skill: ${path.join(SKILL_ROOT, relative)}`);
      continue;
    }
    const metadata = parseSkill(content);
    if (!metadata || metadata.name.toLowerCase() === "ai-talk") continue;
    skills.push({
      ...metadata,
      path: absolute,
      relative_path: path.join(SKILL_ROOT, relative).split(path.sep).join("/"),
    });
  }
  if (!skills.length) warnings.push(`No valid project Skills found under ${SKILL_ROOT}.`);
  return skills;
}

function normalize(value) {
  return value.toLowerCase().replace(/[_/.-]+/g, " ").replace(/\s+/g, " ").trim();
}

function strength(searchable, rawTerm) {
  const term = normalize(rawTerm);
  if (!term) return 0;
  if (searchable.includes(term)) return 1;
  const tokens = term.match(/[a-z0-9]+|[\u3400-\u9fff]{2,}/g) || [];
  if (!tokens.length) return 0;
  return tokens.filter((token) => searchable.includes(token)).length / tokens.length >= 0.6 ? 0.5 : 0;
}

function rank(skill, profile) {
  const searchable = normalize(`${skill.name} ${skill.description} ${skill.applicability} ${skill.relative_path}`);
  let score = 0;
  const matchedFields = [];
  const matchedTerms = [];
  for (const [field, weight] of Object.entries(WEIGHTS)) {
    const values = Array.isArray(profile[field]) ? profile[field] : [profile[field]];
    const matches = values.filter((term) => {
      const value = strength(searchable, term);
      score += weight * value;
      return value > 0;
    });
    if (matches.length) {
      matchedFields.push(field);
      matchedTerms.push(...matches);
    }
  }
  score = Math.max(0, score - profile.exclusions.filter((term) => strength(searchable, term) === 1).length * 2);
  const exactName = profile.query_terms.some((term) => normalize(term) === normalize(skill.name));
  return { ...skill, score, matched_fields: matchedFields, matched_terms: [...new Set(matchedTerms)], exact_name: exactName };
}

function publicResult(skill) {
  return {
    name: skill.name,
    path: skill.path,
    relative_path: skill.relative_path,
    description: skill.description,
    applicability: skill.applicability,
    score: Number(skill.score.toFixed(1)),
    matched_fields: skill.matched_fields,
    matched_terms: skill.matched_terms.slice(0, 12),
  };
}

const MVP_ROUTES = {
  "ui-self-check": ["live_ui_findings", "ui_page", "inspect_ui", ["浏览器", "视觉", "交互", "响应式", "控制台", "网络", "截图", "页面"]],
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
const MVP_GROUPS = [["ui-self-check", "ai-test"], ["gen-code", "gen-frontend-plan"], ["figma-analyze", "figma-to-ui-meta", "gen-code"], ["gen-page-center-config", "gen-code"], ["custom-components-skill", "gen-code", "ui2-upgrade-guide"]];
const MVP_TERMS = ["midscene-test.ts", "midscene", "自动化测试", "测试用例", "写测试", "生成测试", "跑测试", "测一下", "ui 自测", "浏览器检查", "playwright", "截图对比", "控制台", "网络请求", "docs/plan", "前端方案", "只出方案", "生成代码", "修改代码", "直接实现", "figma", "原型分析", "ui-meta", "pagecenter", "推送配置", "活动积木", "积木组件", "普通组件", "openapi", "service"];
const MVP_EXPANDED = {
  live_ui_findings: ["浏览器即时检查", "视觉与交互复验"],
  midscene_test_file: ["midscene-test.ts", "Midscene 自动化用例"],
  frontend_plan_files: ["docs/plan", "前端实施方案"],
  frontend_code_changes: ["前端源码改动", "实现并验证"],
  figma_analysis_docs: ["Figma 原型分析文档"],
  figma_ui_meta: ["figma-ui-meta.json", "Mercury 转换产物"],
  page_center_config: ["page-center-config.json", "远端配置推送"],
  activity_block_component: ["活动积木组件", "uiMeta 可配置玩法块"],
};
const MVP_COMPARISON = path.resolve(import.meta.dirname, "..", "..", "..", "docs", "skills");
const MVP_PLUGIN_SKILLS = path.resolve(import.meta.dirname, "..", "..");

function mvpHas(text, terms) {
  return terms.some((term) => text.includes(term));
}

function mvpExclusions(query) {
  const result = [];
  for (const match of query.matchAll(/(不要|不需要|无需|禁止|别|不改|不生成|只要|仅|只)([^，。；;\n]{1,28})/g)) {
    result.push((match[1] + match[2]).trim());
  }
  return [...new Set(result)].slice(0, 8);
}

function mvpProfile(query, suppliedEvidence) {
  const text = query.toLowerCase();
  const noTest = mvpHas(text, ["不要生成测试", "不生成测试", "无需测试文件"]);
  const noCode = mvpHas(text, ["不生成代码", "不要生成代码", "不修改代码", "不要改代码", "只出方案"]);
  const noCustom = mvpHas(text, ["不接 uimeta", "不用 uimeta", "普通组件", "通用组件"]);
  const test = !noTest && mvpHas(text, ["midscene", "midscene-test.ts", "生成测试", "写测试", "测试用例", "自动化测试文件", "维护测试"]);
  const live = mvpHas(text, ["ui 自测", "浏览器检查", "playwright 验证", "截图对比", "控制台", "网络请求", "边测边修", "响应式检查"]) ||
    (text.includes("测一下") && mvpHas(text, ["页面", "充值页", "活动页", "tab", "布局", "交互"]));
  const plan = mvpHas(text, ["docs/plan", "前端方案", "前端计划", "实施计划", "只出方案", "方案文档"]);
  const pageCenter = mvpHas(text, ["page-center-config", "推送配置", "同步文案", "同步 assets", "配置入"]);
  const uiMeta = mvpHas(text, ["ui-meta", "ui meta", "figma-ui-meta", "调 mercury"]) && mvpHas(text, ["转成", "转换", "生成", "输出配置", "调 mercury"]);
  const figma = text.includes("figma") && mvpHas(text, ["分析", "梳理", "输出文档", "出方案", "看一下"]);
  const custom = !noCustom && (mvpHas(text, ["活动积木", "积木组件", "可配置玩法块"]) || (mvpHas(text, ["uimeta", "ui meta"]) && mvpHas(text, ["组件", "玩法块", "礼盒"])));
  const code = !noCode && (mvpHas(text, ["生成代码", "生成页面代码", "修改代码", "写代码", "直接实现", "直接做", "做页面", "加逻辑", "开发页面", "实现页面", "实现 vue", "写组件", "做组件", "做个组件", "改页面"]) || (text.includes("页面") && mvpHas(text, ["做一下", "做出来", "实现"])));
  const service = mvpHas(text, ["生成 service", "openapi 转 service", "api 转 ts", "生成接口文件"]) || (text.includes("openapi") && text.includes("service"));
  const review = mvpHas(text, ["只检查", "只报告", "不修改", "不要改代码"]);
  let output = "unknown";
  if (test) output = "midscene_test_file";
  if (live && !test) output = "live_ui_findings";
  if (plan) output = "frontend_plan_files";
  if (code) output = "frontend_code_changes";
  if (figma && !code) output = "figma_analysis_docs";
  if (uiMeta && !custom) output = "figma_ui_meta";
  if (pageCenter && !mvpHas(text, ["pagecenter 不动", "不改 pagecenter"])) output = "page_center_config";
  if (custom) output = "activity_block_component";
  if (service) output = "service_files";
  if (review && mvpHas(text, ["页面", "ui", "布局", "交互"])) output = "live_ui_findings";
  let target = mvpHas(text, ["ui2", "组件升级", "组件迁移"]) ? "ui2_component" :
    mvpHas(text, ["普通组件", "通用组件", "vue 组件", "做组件", "写组件", "做个组件"]) ? "generic_component" :
    mvpHas(text, ["页面", "活动页", "充值页", "布局", "响应式", "交互", "tab"]) ? "ui_page" : "frontend_code";
  const action = {live_ui_findings:"inspect_ui",midscene_test_file:"generate_or_run_tests",frontend_plan_files:"create_plan",frontend_code_changes:target==="generic_component"?"create_component":"modify_code",figma_analysis_docs:"analyze_design",figma_ui_meta:"convert_design",page_center_config:"configure",activity_block_component:"create_component",service_files:"generate_service"}[output] || "unknown";
  const targetByOutput = {live_ui_findings:"ui_page",midscene_test_file:"automated_test",frontend_plan_files:"frontend_plan",figma_analysis_docs:"figma_prototype",figma_ui_meta:"figma_prototype",page_center_config:"page_center",activity_block_component:"activity_block",service_files:"api_service"};
  target = targetByOutput[output] || target;
  let mode = "unknown";
  if (output === "live_ui_findings") mode = review ? "review_only" : "live_check_and_fix";
  if (["midscene_test_file", "figma_analysis_docs", "figma_ui_meta", "service_files"].includes(output)) mode = "generate_artifact";
  if (output === "frontend_plan_files") mode = "plan_only";
  if (["frontend_code_changes", "activity_block_component"].includes(output)) mode = "modify_and_verify";
  if (output === "page_center_config") mode = "configure_and_push";
  const evidence = new Set(suppliedEvidence.map((item) => item.toLowerCase()));
  if (mvpHas(text, ["截图", "参考图", "图片"])) evidence.add("screenshot");
  if (text.includes("figma")) evidence.add("figma");
  if (text.includes("openapi")) evidence.add("openapi");
  return {task_action:action,target_category:target,desired_output:output,execution_mode:mode,evidence_types:[...evidence].sort(),intent_terms:MVP_TERMS.filter((term) => text.includes(term)),exclusion_terms:mvpExclusions(query),unknowns:output==="unknown"?["期望产物不明确：需要确认是只分析、输出文件、即时检查，还是实际修改代码。"]:[]};
}

function mvpWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function mvpDiscoverRoot(info, exclusions, warnings) {
  const root = path.resolve(info.root);
  if (exclusions.some((item) => mvpWithin(root, item))) {
    warnings.push(`Excluded non-runtime Skill root: ${root}`);
    return [];
  }
  if (!(await readable(root))) return [];
  const result = [];
  for (const relative of await walk(root)) {
    const absolute = path.join(root, relative);
    if (exclusions.some((item) => mvpWithin(absolute, item))) continue;
    const content = await readBounded(absolute);
    if (content === null) continue;
    const metadata = parseSkill(content);
    if (!metadata || metadata.name.toLowerCase() === "ai-talk") continue;
    result.push({name:metadata.name,description:metadata.description,applicability:metadata.applicability,path:absolute,source:info.label,scope:info.scope});
  }
  return result;
}

function mvpConflicts(skills) {
  const grouped = new Map();
  for (const skill of skills) grouped.set(skill.name.toLowerCase(), [...(grouped.get(skill.name.toLowerCase()) || []), skill]);
  return [...grouped].filter(([, items]) => items.length > 1).map(([name, items]) => ({name, paths:items.map((item) => item.path).sort(), sources:[...new Set(items.map((item) => item.source))].sort()}));
}

function mvpUnique(skills) {
  const priority = {project:3,companion:2,company:1};
  const map = new Map();
  for (const skill of [...skills].sort((a,b) => (priority[b.scope]||0)-(priority[a.scope]||0) || a.path.localeCompare(b.path))) {
    if (!map.has(skill.name.toLowerCase())) map.set(skill.name.toLowerCase(), skill);
  }
  return [...map.values()];
}

function mvpScore(skill, profile, query) {
  const route = MVP_ROUTES[skill.name.toLowerCase()];
  const searchable = normalize(skill.name + " " + skill.description + " " + skill.applicability);
  let overlap = 0;
  for (const term of query.toLowerCase().match(/[a-z0-9._-]+|[\u3400-\u9fff]{2,}/g) || []) if (searchable.includes(term)) overlap += 2;
  let score = Math.min(12, overlap);
  if (route) {
    const [output, target, action, terms] = route;
    score += output === profile.desired_output ? 48 : profile.desired_output === "unknown" ? 0 : -22;
    if (target === profile.target_category || (skill.name === "gen-code" && ["frontend_code","ui_page","generic_component"].includes(profile.target_category))) score += 18;
    if (action === profile.task_action || (skill.name === "gen-code" && profile.task_action === "create_component")) score += 14;
    score += Math.min(15, terms.filter((term) => query.toLowerCase().includes(term)).length * 5);
  }
  if (skill.name === "ai-test" && profile.intent_terms.includes("测一下") && profile.desired_output !== "midscene_test_file") score -= 45;
  if (skill.name === "figma-analyze" && profile.desired_output === "frontend_code_changes") score -= 28;
  if (skill.name === "custom-components-skill" && profile.target_category === "generic_component") score -= 35;
  return {skill, score};
}

function mvpReason(item, profile) {
  const route = MVP_ROUTES[item.skill.name.toLowerCase()];
  if (!route) return ["Skill description 与检索画像相关。"];
  return [`期望产物匹配：${profile.desired_output}`, `执行方式匹配：${profile.execution_mode}`];
}

function mvpExclusionReason(name, profile) {
  if (name === "ai-test") return "未要求生成或维护 Midscene 自动化测试产物；泛化词“测一下”不足以选择它。";
  if (name === "ui-self-check") return "未要求即时打开页面检查视觉、交互、控制台或网络。";
  if (name === "gen-code") return profile.desired_output === "frontend_plan_files" ? "本轮只要求 docs/plan，不要求修改代码。" : "期望产物不是前端源码改动。";
  if (name === "gen-frontend-plan") return "未要求输出 docs/plan 前端实施计划。";
  if (name === "figma-analyze") return "Figma 是开发证据或期望产物不是独立分析文档。";
  if (name === "figma-to-ui-meta") return "未要求生成 figma-ui-meta.json。";
  if (name === "gen-page-center-config") return "未要求 PageCenter 配置或推送结果。";
  if (name === "custom-components-skill") return "没有活动积木或 uiMeta 可配置玩法块证据。";
  return "期望产物和执行方式弱于推荐 Skill。";
}

async function mvpRoute(args) {
  const root = path.resolve(args.root), warnings = [], exclusions = [MVP_COMPARISON, ...args.excludeRoots.map(path.resolve)];
  const roots = [{label:"ai-talk-companion",root:MVP_PLUGIN_SKILLS,scope:"companion"}];
  const project = path.join(root, SKILL_ROOT);
  if (await readable(project)) roots.push({label:"project",root:project,scope:"project"});
  for (const raw of args.sourceRoots) {
    const index = raw.indexOf("=");
    roots.push({label:index>0?raw.slice(0,index):"company",root:path.resolve(index>0?raw.slice(index+1):raw),scope:"company"});
  }
  const all = [];
  for (const source of roots) all.push(...await mvpDiscoverRoot(source, exclusions, warnings));
  const conflicts = mvpConflicts(all), skills = mvpUnique(all), profile = mvpProfile(args.query, args.evidenceTypes);
  const ranked = skills.map((skill) => mvpScore(skill, profile, args.query)).sort((a,b) => b.score-a.score || a.skill.name.localeCompare(b.skill.name));
  const positive = ranked.filter((item) => item.score > 0).slice(0, args.limit), top = positive[0] || null;
  const group = top ? MVP_GROUPS.find((items) => items.includes(top.skill.name)) : null, byName = new Map(ranked.map((item) => [item.skill.name, item]));
  const candidate = (item) => ({name:item.skill.name,path:item.skill.path,source:item.skill.source,score:item.score,reasons:mvpReason(item,profile),name_conflict:conflicts.some((conflict) => conflict.name === item.skill.name.toLowerCase())});
  const stats = {};
  for (const skill of all) { stats[skill.scope] ||= {files:0,unique_names:0}; stats[skill.scope].files += 1; }
  for (const skill of skills) stats[skill.scope].unique_names += 1;
  return {schema_version:1,original_goal:args.query,retrieval_profile:profile,expanded_terms:MVP_EXPANDED[profile.desired_output]||[],recommendation:top?candidate(top):null,alternatives:positive.slice(1,3).map(candidate),recommendation_basis:top?mvpReason(top,profile):[],excluded_similar_skills:(group||[]).filter((name) => name !== top?.skill.name && byName.has(name)).slice(0,3).map((name) => ({name,path:byName.get(name).skill.path,reason:mvpExclusionReason(name,profile)})),blocking_unknown:profile.unknowns[0]||null,index:{roots,excluded_roots:exclusions,stats:{files:all.length,unique_names:skills.length,by_scope:stats},duplicate_name_conflicts:conflicts,warnings}};
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.query) {
      process.stdout.write(`${JSON.stringify(await mvpRoute(args), null, 2)}\n`);
      return;
    }
    const root = path.resolve(args.root);
    if (!(await readable(root))) throw new Error(`Project root is not readable: ${root}`);
    const profile = parseProfile(args.profile);
    const warnings = [];
    const skills = await discover(root, warnings);
    const ranked = skills.map((skill) => rank(skill, profile))
      .filter((skill) => (skill.exact_name && skill.score >= 2) || (skill.score >= 6 && skill.matched_fields.length >= 2))
      .sort((a, b) => b.score - a.score || b.matched_fields.length - a.matched_fields.length || a.name.localeCompare(b.name));
    const tied = ranked[1] && ranked[0].score === ranked[1].score && ranked[0].matched_fields.length === ranked[1].matched_fields.length;
    const status = !ranked.length ? "unmatched" : tied ? "ambiguous" : "matched";
    const payload = {
      schema_version: 1,
      project_root: root,
      profile,
      status,
      match: status === "matched" ? publicResult(ranked[0]) : null,
      ambiguous: status === "ambiguous" ? ranked.slice(0, 2).map(publicResult) : [],
      candidates: ranked.slice(0, args.limit).map(publicResult),
      scanned_skill_count: skills.length,
      warnings,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

await main();
