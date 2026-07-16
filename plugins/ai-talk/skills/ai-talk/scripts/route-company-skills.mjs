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

const EVIDENCE_TYPE_ALIASES = {
  screenshot: "screenshot",
  image: "screenshot",
  visual: "visual_design",
  design: "visual_design",
  visual_design: "visual_design",
  mockup: "visual_design",
  figma: "visual_design",
  interaction: "interaction_flow",
  flow: "interaction_flow",
  interaction_flow: "interaction_flow",
  api: "api_document",
  interface: "api_document",
  openapi: "api_document",
  api_document: "api_document",
  selected_code: "selected_code",
  code_selection: "selected_code",
};

const EVIDENCE_DEFAULT_LABELS = {
  screenshot: "截图",
  visual_design: "视觉稿",
  interaction_flow: "交互流程",
  api_document: "接口资料",
  selected_code: "选中代码",
};

const ORDINALS = ["第一", "第二", "第三", "第四", "第五", "第六"];

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
    "这里不对", "不对", "修一下", "异常", "有问题", "报错", "错误", "不生效", "失效", "未切换", "没有更新",
    "定位并修复", "排查", "修复",
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
  if (suppliedEvidence.includes("screenshot")) return true;
  return hasAny(text, ["见截图", "参考截图", "截图如下", "根据这张图"]);
}

function parseEvidenceItems(values) {
  return values.map((raw, index) => {
    const match = String(raw).match(/^([^:=]+)[:=](.+)$/);
    const rawType = (match ? match[1] : raw).trim().toLowerCase();
    const type = EVIDENCE_TYPE_ALIASES[rawType] || rawType;
    const detail = clean(match?.[2] || "", 120);
    const ordinal = ORDINALS[index] || `第 ${index + 1}`;
    const label = detail || EVIDENCE_DEFAULT_LABELS[type] || rawType;
    return {
      type,
      profileType: type === "visual_design" ? "design"
        : type === "interaction_flow" ? "interaction"
          : type === "api_document" ? "api" : type,
      value: type === "selected_code" ? label : `${ordinal}张图：${label}`,
      detail: label,
      source: `attachment:${index + 1}`,
    };
  });
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
  const page = hasAny(text, ["页面", "活动页", "充值页", "tab", "布局", "交互", "显示", "渲染", "弹窗", "dialog", "modal", "popup"]);
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
    "开发弹窗", "实现弹窗", "做弹窗", "开发一个弹窗", "实现一个弹窗", "新增功能", "开发功能", "实现功能",
    "改造页面", "改造组件", "改造已有", "修改已有", "调整页面", "调整组件", "加蒙层", "添加蒙层", "加遮罩", "添加遮罩", "替换图片", "替换图标", "替换背景",
  ]) || (hasAny(text, ["页面", "弹窗", "dialog", "modal", "popup"]) && hasAny(text, ["做一下", "做出来", "实现", "开发"]))
    || (technicalMentions(query).some((item) => ["target_file", "target_directory"].includes(item.type))
      && hasAny(text, ["修改", "调整", "修复", "改造"]));

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
  const noDesignEvidence = hasAny(text, [
    "没有 figma", "无 figma", "未提供 figma", "不用 figma", "不参考 figma",
    "没有设计稿", "无设计稿", "未提供设计稿", "不要设计稿", "不使用设计稿", "没有视觉稿",
  ]);
  const noApiEvidence = hasAny(text, [
    "没有 openapi", "无 openapi", "未提供 openapi", "不用 openapi",
    "没有接口文档", "无接口文档", "未提供接口", "没有接口信息", "不参考接口文档",
  ]);
  if (!noDesignEvidence && text.includes("figma")) evidence.add("figma");
  if (!noApiEvidence && text.includes("openapi")) evidence.add("openapi");
  if (!noDesignEvidence && hasAny(text, ["设计稿", "视觉稿", "原型链接"])) evidence.add("design");
  if (!noApiEvidence && hasAny(text, ["接口文档", "接口信息", "api 文档"])) evidence.add("api");
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
  const target = [];
  const evidence = [];
  const decision = [];
  if (hasAny(text, ["活动页", "充值页"])) target.push("已明确目标活动页面");
  else if (hasAny(text, ["页面", "布局", "交互", "显示", "渲染"])) target.push("已明确目标页面");
  else if (hasAny(text, ["组件", "玩法块"])) target.push("已明确目标组件");
  if (profile.evidence_types.some((type) => ["figma", "design"].includes(type))) evidence.push("已提供设计稿");
  if (profile.evidence_types.some((type) => ["openapi", "api"].includes(type))) evidence.push("已提供接口信息");
  if (profile.evidence_types.includes("screenshot")) evidence.push("已提供用户截图");
  if (profile.execution_mode === "review_only") decision.push("已明确只检查，不修改代码");
  if (profile.desired_output === "live_ui_findings") decision.push("当前目标是浏览器检查");
  if (profile.desired_output === "midscene_test_file") decision.push("当前产物是 Midscene 自动化测试");
  if (profile.desired_output === "frontend_plan_files") decision.push("当前产物是前端实施方案");
  if (profile.desired_output === "frontend_code_changes") decision.push(isBugRequest(text) ? "当前目标是修复已有代码" : "当前目标是完成代码开发");
  if (profile.desired_output === "figma_analysis_docs") decision.push("当前产物是原型分析文档");
  if (profile.desired_output === "figma_ui_meta") decision.push("当前产物是 figma-ui-meta.json");
  if (profile.desired_output === "page_center_config") decision.push("当前产物是 PageCenter 配置");
  if (profile.desired_output === "activity_block_component") decision.push("当前目标是开发可配置活动积木");
  if (profile.desired_output === "service_files") decision.push("当前产物是接口服务文件");
  const reasons = [...target, ...evidence.slice(0, 2), ...decision];
  if (!reasons.length && query.toLowerCase().includes(item.skill.name.toLowerCase())) reasons.push(`已明确指定 ${item.skill.name}`);
  if (!reasons.length && !ROUTES[item.skill.name.toLowerCase()]) {
    const purpose = item.skill.description.replace(/\s+/g, " ").split(/[。；;]/, 1)[0].slice(0, 40);
    if (purpose) reasons.push(`任务明确指向：${purpose}`);
  }
  return [...new Set(reasons)].slice(0, 4);
}

function shouldExplainAlternative(selected, alternative, profile, query) {
  const text = query.toLowerCase();
  const pair = new Set([selected, alternative]);
  if (pair.has("ui-self-check") && pair.has("ai-test")) {
    return hasAny(text, ["测", "测试", "检查", "浏览器", "playwright", "midscene"]);
  }
  if (pair.has("gen-code") && pair.has("gen-frontend-plan")) {
    return hasAny(text, ["方案", "计划", "实现", "开发", "修改", "修复", "做出来"]);
  }
  if (pair.has("figma-analyze") && pair.has("gen-code")) {
    return profile.evidence_types.includes("figma") && hasAny(text, ["实现", "开发", "修改", "分析", "文档"]);
  }
  if (pair.has("figma-to-ui-meta") && pair.has("gen-code")) return hasAny(text, ["figma", "ui-meta", "mercury"]);
  if (pair.has("gen-page-center-config") && pair.has("gen-code")) return hasAny(text, ["pagecenter", "page-center", "配置"]);
  if (pair.has("custom-components-skill") && pair.has("gen-code")) return hasAny(text, ["活动积木", "uimeta", "ui meta"]);
  return false;
}

async function hasAnyProjectPath(root, candidates) {
  for (const candidate of candidates) {
    if (await readable(path.join(root, candidate))) return true;
  }
  return false;
}

async function executionContexts(root, profile, query, skillName) {
  if (!skillName) return [];
  const text = query.toLowerCase();
  const contexts = [];
  const add = (value) => {
    if (!contexts.includes(value)) contexts.push(value);
  };
  const projectSkills = new Set([
    "ai-test", "gen-frontend-plan", "gen-code", "gen-page-center-config",
    "custom-components-skill", "ui2-upgrade-guide", "gen-service",
  ]);
  const hasCode = projectSkills.has(skillName) && await hasAnyProjectPath(root, [
    "src", "apps", "app", "pages", "packages",
  ]);
  if (hasCode) {
    if (hasAny(text, ["活动", "活动页", "充值页"])) add("📁 当前活动代码");
    else if (hasAny(text, ["页面", "布局", "显示", "渲染"])) add("📁 当前页面代码");
    else add("📁 当前项目代码");
  }
  if (profile.evidence_types.some((type) => ["figma", "design"].includes(type))) add("📐 当前设计稿");
  if (profile.evidence_types.some((type) => ["openapi", "api"].includes(type))) add("🔌 当前接口");
  if (profile.evidence_types.includes("screenshot")) add("🖼 用户截图");
  if (skillName === "ui-self-check" && hasAny(text, ["页面", "浏览器", "视觉", "交互", "响应式"])) add("🌐 当前页面");
  if (projectSkills.has(skillName) && await readable(path.join(root, "AGENTS.md"))) add("📖 AGENTS.md");
  const mentionsReuse = hasAny(text, ["已有组件", "现有组件", "项目组件", "组件库", "复用组件"]);
  if (mentionsReuse && await hasAnyProjectPath(root, ["components", "src/components", "app/components"])) {
    add("🧩 当前项目已有组件");
  }
  return contexts.slice(0, 6);
}

function isFilePath(value) {
  return /\.(?:vue|tsx?|jsx?|css|scss|less|json|mjs|cjs|md|py|go|java|kt|swift)$/i.test(value);
}

function isAssetResource(query, value, index) {
  const normalized = value.toLowerCase().replace(/^\.{0,2}\//, "").replace(/\/$/, "");
  const before = query.slice(Math.max(0, index - 24), index);
  return /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i.test(normalized)
    || /(?:^|\/)(?:assets?|images?|imgs?|icons?|backgrounds?|bgs?|sprites?|masks?)(?:\/|$)/i.test(normalized)
    || /(?:^|\/)(?:icon|bg|mask)(?:[-_/]|$)/i.test(normalized)
    || /(?:图片|图像|背景(?:图|图片)?|图标|蒙层图片|素材|资源)\s*[：:=]?\s*$/i.test(before);
}

function isApiReference(query, value, index) {
  const normalized = value.toLowerCase();
  const before = query.slice(Math.max(0, index - 24), index);
  return /^(?:\/)?api\//i.test(normalized)
    || /^\/v\d+\//i.test(normalized)
    || /(?:接口(?:路径|地址|名|名称)?|api(?:\s+(?:path|name))?|endpoint)\s*[：:=]?\s*$/i.test(before)
    || /(?:GET|POST|PUT|PATCH|DELETE)\s+$/i.test(before);
}

function isDirectoryReference(query, value, index) {
  if (value.endsWith("/")) return true;
  const normalized = value.toLowerCase().replace(/^\.{0,2}\//, "");
  const before = query.slice(Math.max(0, index - 24), index);
  const after = query.slice(index + value.length, Math.min(query.length, index + value.length + 16));
  return /^(?:apps?|src|packages?|pages?|components?|modules?|views?|features?|lib|server|client|tests?|docs|public)\//i.test(normalized)
    || /\/(?:apps?|src|packages?|pages?|components?|modules?|views?|features?|tests?|docs|public)(?:\/|$)/i.test(normalized)
    || /(?:项目目录|文件目录|目标目录|代码目录|文件夹|目录|项目路径|代码路径|放到|位于)[^，。；;\n]{0,12}$/i.test(before)
    || /^[^，。；;\n]{0,8}(?:目录|文件夹|下(?:的|面)?)/i.test(after);
}

function technicalMentions(query) {
  const mentions = [];
  const add = (value, index) => {
    const cleaned = value.replace(/^[`'"(（]+|[`'"，。；;:：)）]+$/g, "");
    if (!cleaned || cleaned.includes("://") || mentions.some((item) => item.value === cleaned)) return;
    let type = "unknown";
    if (isAssetResource(query, cleaned, index)) type = "asset_resource";
    else if (isApiReference(query, cleaned, index)) type = "api";
    else if (isFilePath(cleaned)) type = "target_file";
    else if (isDirectoryReference(query, cleaned, index)) type = "target_directory";
    mentions.push({ value: cleaned, type, index });
  };
  for (const match of query.matchAll(/(?<![A-Za-z0-9_@.-])((?:\/|\.{1,2}\/)?(?:[A-Za-z0-9_@.-]+\/)+[A-Za-z0-9_@.*{}-]+(?:\.[A-Za-z0-9]+)?\/?)/g)) {
    add(match[1], match.index + match[0].indexOf(match[1]));
  }
  for (const match of query.matchAll(/(?:^|[\s`'"(（])([A-Za-z0-9_@.-]+\.(?:vue|tsx?|jsx?|css|scss|less|json|mjs|cjs|md|py|go|java|kt|swift|png|jpe?g|gif|webp|avif|svg|ico))(?=$|[\s`'"，。；;:：)）])/gi)) {
    add(match[1], match.index + match[0].indexOf(match[1]));
  }
  return mentions.slice(0, 8);
}

function apiNameMentions(text, technical) {
  const found = technical.filter((item) => item.type === "api").map((item) => item.value);
  const add = (value) => {
    const cleaned = value.replace(/^[`'"]+|[`'"，。；;)）]+$/g, "");
    if (cleaned && !found.includes(cleaned)) found.push(cleaned);
  };
  for (const match of text.matchAll(/(?:接口(?:名|名称)|api\s+name|endpoint)\s*[：:=]?\s*([A-Za-z_$][A-Za-z0-9_$.-]*)/gi)) add(match[1]);
  return found.slice(0, 6);
}

function componentNameMentions(text) {
  const found = [];
  for (const match of text.matchAll(/\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/gi)) {
    const value = match[0];
    if (/^\.[A-Za-z0-9]+/.test(text.slice(match.index + value.length, match.index + value.length + 8))) continue;
    const nearby = text.slice(Math.max(0, match.index - 16), Math.min(text.length, match.index + value.length + 12));
    if (/(?:组件(?:名|名称)?|component)/i.test(nearby)
      || /^ui-/i.test(value)
      || /-(?:item|dialog|modal|popup|button|list|card|track|bar)$/i.test(value)) {
      if (!found.includes(value)) found.push(value);
    }
  }
  return found.slice(0, 6);
}

function withoutTechnicalIdentifiers(text, technical, namedValues) {
  const values = [...technical.map((item) => item.value), ...namedValues]
    .sort((a, b) => b.length - a.length);
  return values.reduce((result, value) => result.replaceAll(value, " ".repeat(value.length)), text);
}

function confirmedContextFor(query, evidenceItems) {
  const contexts = evidenceItems.map(({ type, value, source }) => ({ type, value, source }));
  const add = (type, value, source) => {
    if (!contexts.some((item) => item.type === type && item.value === value)) contexts.push({ type, value, source });
  };
  for (const target of technicalMentions(query).filter((item) => ["target_file", "target_directory"].includes(item.type))) {
    add(target.type, `${target.type === "target_file" ? "目标文件" : "目标目录"}：${target.value}`, "user_text:path");
  }

  const text = query.toLowerCase();
  const hasEvidenceType = (type) => evidenceItems.some((item) => item.type === type);
  const excludesDesign = hasAny(text, ["没有设计稿", "无设计稿", "未提供设计稿", "没有视觉稿", "不用 figma", "不参考 figma"]);
  const excludesApi = hasAny(text, ["没有接口文档", "无接口文档", "未提供接口", "没有接口信息", "不参考接口文档"]);
  if (!hasEvidenceType("visual_design") && !excludesDesign && hasAny(text, ["参考设计稿", "根据设计稿", "设计稿如下", "参考视觉稿", "figma 链接"])) {
    add("visual_design", "用户明确引用的设计稿", "user_text:explicit_reference");
  }
  if (!hasEvidenceType("api_document") && !excludesApi && hasAny(text, ["参考接口文档", "根据接口文档", "接口文档如下", "参考接口信息", "openapi 文档"])) {
    add("api_document", "用户明确引用的接口资料", "user_text:explicit_reference");
  }
  if (!hasEvidenceType("screenshot") && hasAny(text, ["见截图", "参考截图", "截图如下", "根据这张图"])) {
    add("screenshot_reference", "用户明确引用的截图", "user_text:explicit_reference");
  }
  return contexts.slice(0, 8);
}

const ENTITY_TYPES = [
  "task", "ui_component", "component", "business_object", "state", "visual_effect", "asset_resource", "api",
  "layout_scene", "config_or_symbol", "issue_symptom", "target_scope",
];

function intentFor(query, profile) {
  if (profile.desired_output === "midscene_test_file") return "automated_test";
  if (profile.desired_output === "live_ui_findings") return "ui_inspection";
  if (profile.desired_output === "frontend_plan_files") return "planning";
  const text = query.toLowerCase();
  if (isBugRequest(text)) return "bug_fix";
  if (hasAny(text, ["新增", "新建", "创建", "开发一个", "实现一个", "做一个", "做个", "从零开发"])) return "feature_create";
  if (hasAny(text, ["改造", "修改", "调整", "升级", "迁移", "重构", "优化已有", "扩展已有", "添加", "替换", "加蒙层", "加遮罩"])) return "feature_modify";
  if (profile.desired_output === "frontend_code_changes") return "feature_create";
  return "unknown";
}

function emptyEntities() {
  return Object.fromEntries(ENTITY_TYPES.map((type) => [type, []]));
}

function addEntity(entities, type, value, label, source) {
  if (!value || !label || !source) return;
  if (entities[type].some((item) => item.value === value && item.source === source)) return;
  entities[type].push({ value, label, source });
}

function entityValues(entities, type) {
  return [...new Set((entities[type] || []).map((item) => item.value))];
}

function entityLabels(entities, type) {
  return [...new Set((entities[type] || []).map((item) => item.label))];
}

function hasEntity(entities, type, value) {
  return (entities[type] || []).some((item) => item.value === value);
}

function extractEntities(query, contexts, evidenceItems, profile) {
  const entities = emptyEntities();
  const sources = [
    { text: query.replace(/^\s*\$ai-talk(?::ai-talk)?\s*/i, ""), source: "user_text" },
    ...evidenceItems.map((item) => ({ text: item.detail, source: item.source })),
  ];

  for (const { text, source } of sources) {
    const technical = technicalMentions(text);
    const apiNames = apiNameMentions(text, technical);
    const componentNames = componentNameMentions(text).filter((value) => !apiNames.includes(value));
    const semanticText = withoutTechnicalIdentifiers(text, technical, [...apiNames, ...componentNames]);
    const lower = semanticText.toLowerCase();
    if (profile.desired_output === "frontend_code_changes"
      && /(?:蒙层|遮罩|样式|颜色|背景|图标|视觉)[^，。；;\n]{0,16}(?:加|添加|修改|替换|调整)|(?:加|添加|修改|替换|调整|需要加)[^，。；;\n]{0,16}(?:蒙层|遮罩|样式|颜色|背景|图标|视觉)/i.test(semanticText)) {
      addEntity(entities, "task", "ui-modification", "UI 修改", source);
    }
    for (const component of componentNames) addEntity(entities, "component", component, component, source);
    for (const resource of technical.filter((item) => item.type === "asset_resource")) {
      addEntity(entities, "asset_resource", resource.value, resource.value, source);
    }
    for (const api of apiNames) addEntity(entities, "api", api, api, source);
    if (/蒙层|遮罩|(?:^|[^a-z0-9_])mask(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "visual_effect", "mask", "蒙层", source);
    }
    if (/进度条|(?:^|[^a-z0-9_])progress(?:[-_\s](?:track|bar))?(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "ui_component", "progress-track", "进度条", source);
    }
    if (/弹窗|(?:^|[^a-z0-9_])(?:dialog|modal|popup)(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "ui_component", "dialog", "弹窗", source);
    }
    if (/按钮|(?:^|[^a-z0-9_])button(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "ui_component", "button", "按钮", source);
    }
    if (/排行榜|榜单|rank[-_\s]?list/i.test(semanticText)) {
      addEntity(entities, "ui_component", "rank-list", "排行榜", source);
    }

    const rewardItem = /奖励(?:获取到|领取|项)|领取(?:到)?奖励/i.test(semanticText);
    const reward = /奖励|(?:^|[^a-z0-9_])reward(?=$|[^a-z0-9_])/i.test(semanticText);
    const stage = /阶段|(?:^|[^a-z0-9_])stage(?=$|[^a-z0-9_])/i.test(semanticText);
    if (rewardItem) addEntity(entities, "business_object", "reward-item", "奖励项", source);
    else if (reward && stage) addEntity(entities, "business_object", "reward-stage", "奖励阶段", source);
    else {
      if (reward) addEntity(entities, "business_object", "reward", "奖励", source);
      if (stage) addEntity(entities, "business_object", "stage", "阶段", source);
    }
    if (/抽奖|(?:^|[^a-z0-9_])lottery(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "business_object", "lottery", "抽奖", source);
    }
    if (/任务(?:状态|奖励|进度)|task[-_\s]?(?:state|reward|progress)/i.test(semanticText)) {
      addEntity(entities, "business_object", "task", "任务", source);
    }

    if (/未领取|(?:^|[^a-z0-9_])unclaimed(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "state", "unclaimed", "未领取", source);
    } else if (/已领取|奖励获取到|获取到奖励|领取到奖励|(?:^|[^a-z0-9_])claimed(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "state", "claimed", "已领取", source);
    }
    if (/未完成|(?:^|[^a-z0-9_])incomplete(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "state", "incomplete", "未完成", source);
    } else if (/已完成|(?:^|[^a-z0-9_])completed(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "state", "completed", "已完成", source);
    }
    if (/锁定|已锁定|(?:^|[^a-z0-9_])locked(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "state", "locked", "锁定", source);
    }

    if (/(?:^|[^a-z0-9_])rtl(?=$|[^a-z0-9_])|从右到左/i.test(semanticText)) {
      addEntity(entities, "layout_scene", "RTL", "RTL", source);
    }
    if (/横向|水平|(?:^|[^a-z0-9_])horizontal(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "layout_scene", "horizontal", "横向", source);
    }
    if (/响应式|(?:^|[^a-z0-9_])responsive(?=$|[^a-z0-9_])/i.test(semanticText)) {
      addEntity(entities, "layout_scene", "responsive", "响应式", source);
    }

    const nonSymbolNames = new Set([...apiNames, ...componentNames]);
    for (const match of text.matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g)) {
      const symbol = match[0];
      if (!nonSymbolNames.has(symbol) && (/[a-z][A-Z]/.test(symbol) || symbol.includes("_") || symbol.startsWith("$"))) {
        addEntity(entities, "config_or_symbol", symbol, symbol, source);
      }
    }

    const imageMismatch = /(?:图片|图像|image)[^，。；;\n]{0,12}(?:没有|没|未|不)(?:显示|切换|更新)|(?:没有|没|未|不)(?:显示|切换|更新)[^，。；;\n]{0,12}(?:图片|图像|image)/i.test(semanticText);
    if (imageMismatch) addEntity(entities, "issue_symptom", "image-not-updated", "图片未切换", source);
    if (/显示不完整|展示不完整|显示不全|展示不全|display[-_\s]?(?:incomplete|partial)/i.test(semanticText)) {
      addEntity(entities, "issue_symptom", "incomplete-display", "显示不完整", source);
    }
    if (/顺序(?:错误|异常|不对)|顺序反了|order[-_\s]?(?:mismatch|wrong)/i.test(semanticText)) {
      addEntity(entities, "issue_symptom", "order-mismatch", "顺序错误", source);
    }
    if (/状态[^，。；;\n]{0,8}(?:错误|异常|不对)|(?:错误|异常)状态|state[-_\s]?(?:mismatch|wrong)/i.test(semanticText)) {
      addEntity(entities, "issue_symptom", "state-display-mismatch", "状态显示异常", source);
    }
    if (lower.includes("当前活动")) addEntity(entities, "target_scope", "current-activity", "当前活动", source);
    if (lower.includes("当前项目")) addEntity(entities, "target_scope", "current-project", "当前项目", source);
  }

  const hasProgress = hasEntity(entities, "ui_component", "progress-track");
  const hasRewardStage = hasEntity(entities, "business_object", "reward-stage");
  const mismatch = sources.some(({ text }) => /不对|异常|错误|显示[^，。；;\n]{0,8}(?:不一致|异常)/.test(text));
  if (hasProgress && mismatch) {
    entities.issue_symptom = entities.issue_symptom.filter((item) => item.value !== "state-display-mismatch");
    const source = sources.find((item) => /不对|异常|错误|显示[^，。；;\n]{0,8}(?:不一致|异常)/.test(item.text))?.source || "user_text";
    addEntity(entities, "issue_symptom", "progress-display-mismatch", "进度展示异常", source);
  }
  if (hasProgress && hasRewardStage) {
    for (const item of entities.ui_component) {
      if (item.value === "progress-track") item.label = "奖励进度条";
    }
  }

  for (const context of contexts) {
    if (!["target_file", "target_directory"].includes(context.type)) continue;
    const value = context.value.replace(/^目标(?:文件|目录)：/, "");
    addEntity(entities, "target_scope", value, value, context.source);
  }
  return entities;
}

function addLimited(group, value) {
  const normalized = clean(value || "", 100);
  if (normalized && group.length < 3 && !group.includes(normalized)) group.push(normalized);
}

function queryGroupsFor(intent, entities) {
  const groups = { docs: [], skills: [], components: [], code: [] };
  const components = entityValues(entities, "ui_component");
  const componentNames = entityValues(entities, "component");
  const objects = entityValues(entities, "business_object");
  const states = entityValues(entities, "state");
  const layouts = entityValues(entities, "layout_scene");
  const symptoms = entityValues(entities, "issue_symptom");
  const symbols = entityValues(entities, "config_or_symbol");
  const assets = entityValues(entities, "asset_resource");
  const apis = entityValues(entities, "api");
  const scopes = entityValues(entities, "target_scope");
  const progress = components.includes("progress-track");
  const rewardStage = objects.includes("reward-stage");
  const rtl = layouts.includes("RTL");

  if (rtl && progress) addLimited(groups.docs, `${rewardStage ? "RTL 奖励进度条" : "RTL 进度条"}状态展示规范`);
  if (states.length && objects.length) addLimited(groups.docs, `${rewardStage ? "奖励阶段" : objects[0]} ${states[0]} 状态定义`);
  else if (states.length) addLimited(groups.docs, `${states[0]} 状态定义`);
  if (layouts.length && !progress) addLimited(groups.docs, `${layouts[0]} 页面布局规范`);

  const skillQueries = {
    bug_fix: "已有前端页面 Bug 定位并修复",
    feature_create: "前端新功能开发与已有能力复用",
    feature_modify: "已有前端功能改造与验证",
    ui_inspection: "浏览器即时视觉与交互检查",
    planning: "前端实施方案生成",
    automated_test: "前端自动化测试生成与运行",
  };
  addLimited(groups.skills, skillQueries[intent]);

  for (const component of componentNames) addLimited(groups.components, component);
  if (components.includes("dialog")) {
    for (const synonym of ["dialog", "modal", "popup"]) addLimited(groups.components, synonym);
  }
  if (progress) {
    addLimited(groups.components, "progress-track");
    if (rewardStage || objects.includes("reward")) addLimited(groups.components, "reward-progress");
    if (rtl) addLimited(groups.components, "RTL progress");
  }
  if (components.includes("button")) addLimited(groups.components, "button");
  if (components.includes("rank-list")) addLimited(groups.components, "rank-list");

  for (const symbol of symbols) addLimited(groups.code, symbol);
  for (const api of apis) addLimited(groups.code, api);
  for (const asset of assets) addLimited(groups.code, asset);
  const exactScope = scopes.find((scope) => !["current-activity", "current-project"].includes(scope));
  const codeTerms = [
    rewardStage ? "奖励进度条" : progress ? "进度条" : components[0] || componentNames[0],
    states[0],
    symptoms[0],
  ].filter(Boolean).slice(0, 2).join(" ");
  if (exactScope && codeTerms) addLimited(groups.code, `${exactScope} ${codeTerms} 实现`);
  if (codeTerms) addLimited(groups.code, `当前项目 ${codeTerms} 实现`);
  if (codeTerms && (rtl || rewardStage || states.length)) {
    addLimited(groups.code, `相似活动 ${[
      rtl ? "RTL" : null, progress ? "progress" : components[0], states[0], symptoms[0],
    ].filter(Boolean).slice(0, 3).join(" ")} 实现`);
  }
  return groups;
}

function retrievalDirectionsFor(intent, entities) {
  const result = [];
  const add = (value) => {
    if (value && !result.includes(value)) result.push(value);
  };
  const components = entityValues(entities, "ui_component");
  const componentNames = entityValues(entities, "component");
  const assets = entityValues(entities, "asset_resource");
  const apis = entityValues(entities, "api");
  const objects = entityValues(entities, "business_object");
  const states = entityValues(entities, "state");
  const stateLabels = entityLabels(entities, "state");
  const symptoms = entityValues(entities, "issue_symptom");
  const layouts = entityValues(entities, "layout_scene");
  const scopes = entityValues(entities, "target_scope");
  const progress = components.includes("progress-track");
  const dialog = components.includes("dialog");

  if (objects.includes("reward-stage") && states.length) add("奖励阶段状态规则");
  else if (states.length) add(`${stateLabels[0]}状态规则`);
  if (progress) add(`${layouts.includes("RTL") ? "RTL " : ""}奖励进度条组件文档`);
  if (dialog) add("弹窗组件文档");
  for (const component of componentNames) add(`${component} 组件实现`);
  for (const asset of assets) add(`${asset} 资源引用`);
  for (const api of apis) add(`${api} 接口定义与调用`);
  const exactScope = scopes.find((scope) => !["current-activity", "current-project"].includes(scope));
  if (exactScope) add(`${exactScope} 已有实现`);
  else if (progress) add("当前项目已有进度实现");
  else if (dialog) add("当前项目弹窗已有实现");
  else if (symptoms.includes("image-not-updated") && stateLabels.length) add(`当前项目${stateLabels[0]}图片状态映射`);
  if (layouts.includes("RTL") && states.length) add("相似活动状态映射");
  if (intent === "ui_inspection") add("即时浏览器视觉与交互检查");
  return result.slice(0, 6);
}

function boundariesFor(profile, query, contexts) {
  const result = [];
  const add = (value) => {
    if (value && !result.includes(value)) result.push(value);
  };
  const implementation = [
    "frontend_code_changes", "page_center_config", "activity_block_component", "service_files", "midscene_test_file",
  ].includes(profile.desired_output);
  const text = query.toLowerCase();
  if (implementation) add("基于检索到的真实公司资料实施");
  if (profile.desired_output === "frontend_code_changes" && !isBugRequest(text)
    && hasAny(text, ["页面", "组件", "弹窗", "dialog", "modal", "popup"])) {
    add("优先复用项目已有实现和组件");
  }
  for (const exclusion of profile.exclusion_terms) add(exclusion);
  if (implementation) add("不补充用户未确认的业务逻辑");
  const target = contexts.find((item) => ["target_file", "target_directory"].includes(item.type));
  if (target) add(`修改范围限于 ${target.value.replace(/^目标(?:文件|目录)：/, "")} 及必要直接依赖`);
  return result.slice(0, 6);
}

function unknownsFor(profile, query, contexts) {
  if (profile.desired_output === "unknown") {
    return ["期望交付物尚未明确。"];
  }
  if (profile.desired_output !== "frontend_code_changes" || isBugRequest(query.toLowerCase())) return [];
  const hasTarget = contexts.some((item) => ["target_file", "target_directory"].includes(item.type));
  const dialog = hasAny(query.toLowerCase(), ["弹窗", "dialog", "modal", "popup"]);
  if (dialog && hasTarget) return ["弹窗触发入口尚未确认；如果当前代码能够确定，则不追问。"];
  if (dialog) return ["弹窗所属页面或目标目录尚未明确。"];
  if (!hasTarget) return ["目标页面、目录或文件尚未明确；如果当前代码上下文能够确定，则不追问。"];
  return [];
}

function ambiguityExplanation(selected, availableNames, query) {
  if (!selected) return null;
  const text = query.toLowerCase();
  if (selected.name === "gen-code" && availableNames.has("gen-frontend-plan")
    && hasAny(text, ["方案", "计划", "docs/plan"]) && hasAny(text, ["实现", "开发", "修改", "修复"])) {
    return "任务同时提到方案与代码实施，本轮按最终需要修改代码选择 gen-code。";
  }
  if (availableNames.has("ui-self-check") && availableNames.has("ai-test")
    && hasAny(text, ["midscene", "测试文件", "自动化测试"]) && isExplicitLiveInspection(text)) {
    return `任务同时要求页面即时检查和自动化测试，本轮按主要交付选择 ${selected.name}。`;
  }
  if (selected.name === "gen-code" && availableNames.has("figma-analyze")
    && text.includes("figma") && hasAny(text, ["分析", "梳理"]) && hasAny(text, ["实现", "开发", "修改"])) {
    return "Figma 分析与代码实施同时出现，本轮按最终需要修改代码选择 gen-code。";
  }
  return null;
}

function exclusionReason(name, profile, query) {
  if (name === "ai-test") return "因为本轮是页面即时检查，不需要生成或运行 Midscene 测试。";
  if (name === "ui-self-check") return "因为当前产物是 Midscene 测试，不是即时页面检查。";
  if (name === "gen-code") return profile.desired_output === "frontend_plan_files" ? "因为本轮只输出前端实施计划，不修改代码。" : "因为当前是即时页面检查，不是代码修改。";
  if (name === "gen-frontend-plan") return isBugRequest(query.toLowerCase())
    ? "因为当前属于已有代码修复。"
    : "因为当前目标是直接开发代码，不是输出实施方案。";
  if (name === "figma-analyze") return "因为设计稿是开发上下文，目标不是独立分析文档。";
  if (name === "figma-to-ui-meta") return "因为当前产物不是 figma-ui-meta.json。";
  if (name === "gen-page-center-config") return "因为当前产物不是 PageCenter 配置或推送结果。";
  if (name === "custom-components-skill") return "因为当前目标不是 uiMeta 可配置的活动积木。";
  return "因为当前任务与已决定 Skill 的职责更直接对应。";
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
  const evidenceItems = parseEvidenceItems(args.evidenceTypes);
  const profile = buildProfile(args.query, evidenceItems.map((item) => item.profileType));
  const ranked = skills.map((skill) => scoreSkill(skill, profile, args.query))
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  const positive = ranked.filter((item) => item.score > 0).slice(0, args.limit);
  const top = positive[0] || null;
  const group = top ? CONFUSION_GROUPS.find((items) => items.includes(top.skill.name)) : null;
  const byName = new Map(ranked.map((item) => [item.skill.name, item]));
  const candidate = (item) => ({
    name: item.skill.name,
    description: item.skill.description,
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
  const excludedSimilarSkills = (group || [])
    .filter((name) => name !== top?.skill.name && byName.has(name))
    .filter((name) => shouldExplainAlternative(top?.skill.name, name, profile, args.query))
    .slice(0, 1)
    .map((name) => ({ name, path: byName.get(name).skill.path, reason: exclusionReason(name, profile, args.query) }));
  const recommendation = top ? candidate(top) : null;
  const alternatives = positive.slice(1, 3).map(candidate);
  const confirmedContext = confirmedContextFor(args.query, evidenceItems);
  const intent = intentFor(args.query, profile);
  const entities = extractEntities(args.query, confirmedContext, evidenceItems, profile);
  const retrievalQueryGroups = queryGroupsFor(intent, entities);
  const unknowns = unknownsFor(profile, args.query, confirmedContext);
  profile.unknowns = unknowns;
  const index = {
    roots,
    excluded_roots: exclusions,
    stats: { files: all.length, unique_names: skills.length, by_scope: byScope },
    duplicate_name_conflicts: conflicts,
    warnings,
  };
  return {
    schema_version: 4,
    original_goal: args.query,
    confirmed_context: confirmedContext,
    intent,
    entities,
    retrieval_query_groups: retrievalQueryGroups,
    retrieval_queries: Object.values(retrievalQueryGroups).flat(),
    retrieval_directions: retrievalDirectionsFor(intent, entities),
    boundaries: boundariesFor(profile, args.query, confirmedContext),
    unknowns,
    execution_skill: recommendation?.name || null,
    selection_explanation: ambiguityExplanation(recommendation, new Set(skills.map((skill) => skill.name)), args.query),
    routing: {
      retrieval_profile: profile,
      expanded_terms: EXPANDED_TERMS[profile.desired_output] || [],
      recommendation,
      alternatives,
      recommendation_basis: top ? reasonsFor(top, profile, args.query) : [],
      excluded_similar_skills: excludedSimilarSkills,
      index,
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
