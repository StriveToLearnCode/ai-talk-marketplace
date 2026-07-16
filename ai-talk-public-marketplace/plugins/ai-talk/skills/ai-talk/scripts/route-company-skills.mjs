#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { formatUserOutput } from "./format-user-output.mjs";

<<<<<<< HEAD
=======
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

const EXPLICIT_EXECUTION_REQUESTS = new Set([
  "开始执行",
  "直接修改",
  "使用这个协议继续",
  "调用 gen-code 执行",
]);

function normalizeExecutionRequest(value) {
  return String(value || "")
    .replace(/^\s*\$ai-talk(?::ai-talk)?\s*/i, "")
    .trim()
    .replace(/[。！!]+$/g, "")
    .trim();
}

export function executionGateFor(currentInput, previousContract) {
  const request = normalizeExecutionRequest(currentInput);
  const previousSkill = previousContract?.recommended_skill || null;
  const authorized = Boolean(previousSkill && EXPLICIT_EXECUTION_REQUESTS.has(request));
  const skill = authorized && request === "调用 gen-code 执行" ? "gen-code" : authorized ? previousSkill : null;
  return { authorized, skill };
}

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

>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
const EVIDENCE_TYPE_ALIASES = {
  screenshot: "screenshot",
  image: "screenshot",
  visual: "visual_design",
  design: "visual_design",
  visual_design: "visual_design",
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

const EVIDENCE_LABELS = {
  screenshot: "截图",
  visual_design: "视觉稿",
  interaction_flow: "交互资料",
  api_document: "接口资料",
  selected_code: "选中代码",
};

const ENTITY_TYPES = [
  "task", "ui_component", "business_object", "state", "visual_change", "asset_resource",
  "issue_symptom", "target_scope", "page_entry", "inspection_goal", "goal", "scope",
];

function parseArgs(argv) {
  const args = { query: null, evidenceTypes: [], debugJson: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") {
      process.stdout.write(
        "Usage: route-company-skills.mjs --query '<user input>' [--evidence-type <type=summary>] [--debug-json]\n",
      );
      process.exit(0);
    }
    if (flag === "--debug-json") {
      args.debugJson = true;
      continue;
    }
    if (!["--query", "--evidence-type", "--root", "--source-root", "--exclude-root", "--limit", "--top-k"].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    if (flag === "--query") args.query = value;
    if (flag === "--evidence-type") args.evidenceTypes.push(value);
    // Legacy routing arguments remain accepted but are intentionally ignored.
  }
  if (!args.query) throw new Error("--query is required.");
  return args;
}

function clean(value, limit = 400) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanGoal(value) {
  return clean(value).replace(/^\$ai-talk(?::ai-talk)?\s*/i, "").trim();
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

<<<<<<< HEAD
=======
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
    "为什么没有展示", "为什么没展示", "却没有展示", "却没展示", "没有展示", "没展示", "未展示", "不展示",
    "这里不对", "不对", "修一下", "异常", "有问题", "报错", "错误", "不生效", "失效", "未切换", "没有更新",
    "定位并修复", "排查", "修复",
  ]) || /\b(?:state|status)\s*[=:]\s*[^，。；;\s)）]+[^，。；;\n]{0,24}(?:页面|界面|ui)[^，。；;\n]{0,16}(?:却|但|实际|显示|表现)/i.test(text);
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

>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
function parseEvidenceItems(values) {
  return values.map((raw, index) => {
    const match = String(raw).match(/^([^:=]+)[:=](.+)$/);
    const rawType = clean(match ? match[1] : raw).toLowerCase();
    const type = EVIDENCE_TYPE_ALIASES[rawType] || rawType;
    const detail = clean(match?.[2] || EVIDENCE_LABELS[type] || rawType, 160);
    return {
      type,
      value: `${EVIDENCE_LABELS[type] || "附件"}：${detail}`,
      detail,
      source: `attachment:${index + 1}`,
    };
  });
}

function isBugRequest(text) {
  return hasAny(text, [
    "为什么", "不对", "异常", "有问题", "报错", "错误", "不生效", "失效", "没有显示", "没显示",
    "未显示", "显示错误", "显示已领取", "修复", "修一下", "排查", "定位",
  ]);
}

function isUiInspection(text) {
  const entry = /https?:\/\/\S+/i.test(text) || hasAny(text, ["这个 url", "当前 url", "这个页面", "当前页面", "打开页面"]);
  const inspect = hasAny(text, ["检查", "看看", "看一下", "视觉", "交互", "响应式", "控制台", "网络"]);
  return entry && inspect && !hasAny(text, ["修改", "调整", "修复", "开发", "实现"]);
}

function intentFor(query) {
  const text = query.toLowerCase();
<<<<<<< HEAD
  if (isUiInspection(text)) return "ui_inspection";
  if (hasAny(text, ["规划", "计划", "实施方案", "技术方案", "前端方案", "拆解方案"])) return "planning";
  if (isBugRequest(text)) return "bug_fix";
  if (hasAny(text, [
    "修改文案", "文案修改", "文案改", "替换文案", "修改颜色", "调整颜色", "加蒙层", "增加蒙层", "添加蒙层",
    "加遮罩", "增加遮罩", "添加遮罩", "替换图片", "替换图标", "替换背景", "视觉修改", "ui 修改", "样式修改",
  ])) return "ui_modify";
  if (hasAny(text, ["新增", "新建", "创建", "开发", "实现", "做一个", "做个"])) return "feature_create";
  if (hasAny(text, ["修改", "调整", "替换", "增加", "添加"])) return "ui_modify";
  return "planning";
=======
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
    "开发弹窗", "实现弹窗", "做弹窗", "开发一个弹窗", "实现一个弹窗", "新增功能", "新增页面", "新增活动页", "新增组件", "新增列表", "开发功能", "实现功能",
    "改造页面", "改造组件", "改造已有", "修改已有", "调整页面", "调整组件", "增加", "加蒙层", "添加蒙层", "加遮罩", "添加遮罩", "替换图片", "替换图标", "替换背景",
  ]) || (hasAny(text, ["页面", "活动页", "充值页", "弹窗", "dialog", "modal", "popup"]) && hasAny(text, ["做一下", "做出来", "实现", "开发"]))
    || (technicalMentions(query).some((item) => ["target_file", "target_directory"].includes(item.type))
      && hasAny(text, ["修改", "调整", "修复", "改造"]));

  // Explicit browser/UI inspection wins over generic words such as “有问题” or “异常”.
  const specialized = test || live || plan || pageCenter || uiMeta || figma || custom || service;
  const code = !noCode && !analysisOnly && !explicitLive && (explicitCode || (bug && !specialized)
    || (/[A-Z][A-Z0-9_]{2,}/.test(query) && hasAny(text, ["展示", "显示", "调整", "修改", "新增", "然后"])));
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
    contract_mode: "generate_only",
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
    if (profile.desired_output !== "unknown") {
      if (target === profile.target_category || (skill.name === "gen-code" && ["frontend_code", "ui_page", "generic_component"].includes(profile.target_category))) score += 18;
      if (action === profile.task_action || (skill.name === "gen-code" && profile.task_action === "create_component")) score += 14;
    }
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
  if (isAnalysisOnly(text)) decision.push("已明确只检查，不修改代码");
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
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
}

function isFilePath(value) {
  return /\.(?:vue|tsx?|jsx?|css|scss|less|json|mjs|cjs|md|py|go|java|kt|swift)$/i.test(value);
}

function isAssetResource(query, value, index) {
  const normalized = value.toLowerCase().replace(/^\.{0,2}\//, "").replace(/\/$/, "");
  const before = query.slice(Math.max(0, index - 24), index);
  const listBefore = query.slice(Math.max(0, index - 64), index);
  return /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i.test(normalized)
    || /(?:^|\/)(?:assets?|images?|imgs?|icons?|backgrounds?|bgs?|sprites?|masks?)(?:\/|$)/i.test(normalized)
    || /(?:^|\/)(?:icon|bg|mask)(?:[-_/]|$)/i.test(normalized)
    || /(?:图片|图像|背景(?:图|图片)?|图标|蒙层图片|素材|资源)\s*[：:=]?\s*$/i.test(before)
    || /(?:图片|图像|背景(?:图|图片)?|图标|素材|资源)[^，。；;\n]{1,48}(?:和|及|、|,)\s*$/i.test(listBefore);
}

function isDirectoryReference(query, value, index) {
  const normalized = value.toLowerCase().replace(/^\.{0,2}\//, "");
  const before = query.slice(Math.max(0, index - 24), index);
  return /^(?:apps?|src|packages?|pages?|components?|modules?|views?|features?|lib|server|client|tests?|docs|public)\//i.test(normalized)
    || /(?:项目目录|文件目录|目标目录|代码目录|文件夹|目录|项目路径|代码路径|放到|位于)[^，。；;\n]{0,12}$/i.test(before)
    || value.endsWith("/");
}

function displayPath(value) {
  if (!path.isAbsolute(value)) return value;
  return path.basename(value.replace(/\/$/, ""));
}

function technicalMentions(query) {
  const mentions = [];
  const add = (rawValue, index) => {
    const value = rawValue.replace(/^[`'"(（]+|[`'"，。；;:：)）]+$/g, "");
    if (!value || value.includes("://") || mentions.some((item) => item.value === value)) return;
    let type = "unknown";
    if (isAssetResource(query, value, index)) type = "asset_resource";
    else if (isFilePath(value)) type = "target_file";
    else if (isDirectoryReference(query, value, index)) type = "target_directory";
    mentions.push({ value, display: displayPath(value), type, index });
  };
  for (const match of query.matchAll(/(?<![A-Za-z0-9_@.-])((?:\/|\.{1,2}\/)?(?:[A-Za-z0-9_@.-]+\/)+[A-Za-z0-9_@.*{}-]+(?:\.[A-Za-z0-9]+)?\/?)/g)) {
    add(match[1], match.index + match[0].indexOf(match[1]));
  }
  for (const match of query.matchAll(/(?:^|[\s`'"(（])([A-Za-z0-9_@.-]+\.(?:vue|tsx?|jsx?|css|scss|less|json|mjs|cjs|md|py|go|java|kt|swift|png|jpe?g|gif|webp|avif|svg|ico))(?=$|[\s`'"，。；;:：)）])/gi)) {
    add(match[1], match.index + match[0].indexOf(match[1]));
  }
  return mentions.slice(0, 8);
}

<<<<<<< HEAD
=======
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
  if (hasAny(text, ["改造", "修改", "调整", "升级", "迁移", "重构", "优化已有", "扩展已有", "增加", "添加", "替换", "加蒙层", "加遮罩", "一样"])) return "feature_modify";
  if (profile.desired_output === "frontend_code_changes") return "feature_create";
  return "unknown";
}

>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
function emptyEntities() {
  return Object.fromEntries(ENTITY_TYPES.map((type) => [type, []]));
}

function addEntity(entities, type, value, label, source = "user_text") {
  if (!value || !label || entities[type].some((item) => item.value === value && item.source === source)) return;
  entities[type].push({ value, label, source });
}

function entityValues(entities, type) {
  return entities[type].map((item) => item.value);
}

function extractContext(query, evidenceItems) {
  const contexts = evidenceItems.map(({ type, value, source }) => ({ type, value, source }));
  const entities = emptyEntities();
<<<<<<< HEAD
  const addContext = (type, value, source = "user_text") => {
    if (!contexts.some((item) => item.type === type && item.value === value)) contexts.push({ type, value, source });
=======
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
    if (profile.desired_output === "frontend_code_changes" && /(?:新增|新建|创建|开发|实现|做)(?:一个|个)?[^，。；;\n]{0,16}(?:页面|ui|界面)/i.test(semanticText)) {
      addEntity(entities, "task", "new-ui", "新增 UI", source);
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

    const roundReward = /轮次奖励|回合奖励|round[-_\s]?reward/i.test(semanticText);
    const rewardItem = /奖励(?:获取到|领取|项)|领取(?:到)?奖励/i.test(semanticText);
    const reward = /奖励|(?:^|[^a-z0-9_])reward(?=$|[^a-z0-9_])/i.test(semanticText);
    const stage = /阶段|(?:^|[^a-z0-9_])stage(?=$|[^a-z0-9_])/i.test(semanticText);
    if (roundReward) addEntity(entities, "business_object", "round-reward", "轮次奖励", source);
    else if (rewardItem) addEntity(entities, "business_object", "reward-item", "奖励项", source);
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
    } else if (/已领取|奖励获取到|奖励领取(?:以后|后|时)|(?:获取到|领取到)奖励|(?:^|[^a-z0-9_])claimed(?=$|[^a-z0-9_])/i.test(semanticText)) {
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
    for (const match of text.matchAll(/\b(state|status)\s*([=:])\s*([^，。；;\s)）]+)/gi)) {
      addEntity(entities, "config_or_symbol", match[1], `${match[1]}${match[2]}${match[3]}`, source);
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
    if (/\b(?:state|status)\s*[=:]\s*[^，。；;\s)）]+[^，。；;\n]{0,24}(?:页面|界面|ui)[^，。；;\n]{0,16}(?:却|但|实际|显示|表现)/i.test(semanticText)) {
      addEntity(entities, "issue_symptom", "state-display-mismatch", "状态与页面表现冲突", source);
    }
    if (lower.includes("当前活动")) addEntity(entities, "target_scope", "current-activity", "当前活动", source);
    if (lower.includes("当前项目")) addEntity(entities, "target_scope", "current-project", "当前项目", source);
    for (const match of text.matchAll(/(?:页面(?:名|名称)?\s*[：:=]\s*|(?:开发|实现|修改|调整)\s+)([A-Za-z][A-Za-z0-9 _-]{1,36})(?=$|[，。；;\n])/gi)) {
      const page = clean(match[1], 40);
      if (!/^(?:a|an|the|ui|vue|react)$/i.test(page)) addEntity(entities, "target_scope", page, page, source);
    }
    for (const match of text.matchAll(/\b([A-Z][A-Za-z0-9]*(?:[ _-][A-Z][A-Za-z0-9]*){0,4})\s+页面/g)) {
      const page = clean(match[1], 40);
      if (!/^(?:RTL|LTR|UI)$/i.test(page)) addEntity(entities, "target_scope", page, page, source);
    }
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
  const roundReward = objects.includes("round-reward");
  const rtl = layouts.includes("RTL");
  const semanticNames = {
    reward: "奖励",
    "reward-item": "奖励",
    "reward-stage": "奖励阶段",
    "round-reward": "轮次奖励",
    claimed: "已领取",
    unclaimed: "未领取",
    completed: "已完成",
    incomplete: "未完成",
    locked: "锁定",
    "image-not-updated": "图片展示异常",
    "incomplete-display": "展示不完整",
    "order-mismatch": "顺序异常",
    "state-display-mismatch": "状态展示异常",
    "progress-display-mismatch": "进度展示异常",
  };

  if (roundReward) addLimited(groups.docs, "轮次奖励配置与展示条件");
  if (rtl && progress) addLimited(groups.docs, `${rewardStage ? "RTL 奖励进度条" : "RTL 进度条"}状态展示规范`);
  if (states.length && objects.length) addLimited(groups.docs, `${rewardStage ? "奖励阶段" : semanticNames[objects[0]] || objects[0]} ${semanticNames[states[0]] || states[0]} 状态定义`);
  else if (states.length) addLimited(groups.docs, `${semanticNames[states[0]] || states[0]}状态定义`);
  if (layouts.length && !progress) addLimited(groups.docs, `${layouts[0]} 页面布局规范`);

  const skillQueries = {
    bug_fix: "已有前端页面问题定位与修复",
    feature_create: "前端新功能开发与已有能力复用",
    feature_modify: "已有前端功能改造与验证",
    ui_inspection: "浏览器即时视觉与交互检查",
    planning: "前端实施方案生成",
    automated_test: "前端自动化测试生成与运行",
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
  };
  const text = cleanGoal(query);
  const lower = text.toLowerCase();

<<<<<<< HEAD
  for (const item of technicalMentions(text)) {
    if (["target_file", "target_directory"].includes(item.type)) {
      const label = item.type === "target_file" ? "目标文件" : "目标目录";
      addContext(item.type, `${label}：${item.display}`, "user_text:path");
      addEntity(entities, "target_scope", item.display, item.display, "user_text:path");
    }
    if (item.type === "asset_resource") {
      addContext("asset_resource", `资源：${item.display}`);
      addEntity(entities, "asset_resource", item.value, item.display);
    }
  }

  const url = text.match(/https?:\/\/[^\s，。；;]+/i)?.[0];
  if (url) {
    addContext("page_entry", `页面入口：${url}`);
    addEntity(entities, "page_entry", url, url);
  } else if (hasAny(lower, ["这个 url", "当前 url"])) {
    addContext("page_entry", "页面入口：用户指定的 URL");
    addEntity(entities, "page_entry", "provided-url", "用户指定的 URL");
  } else if (hasAny(lower, ["这个页面", "当前页面", "打开页面"])) {
    addContext("page_entry", "页面入口：当前页面上下文");
    addEntity(entities, "page_entry", "current-page", "当前页面");
=======
  for (const component of componentNames) addLimited(groups.components, component);
  if (components.includes("dialog")) {
    addLimited(groups.components, "弹窗组件");
    addLimited(groups.components, "弹窗触发逻辑");
    addLimited(groups.components, "弹窗交互逻辑");
  }
  if (progress) {
    addLimited(groups.components, "进度展示逻辑");
    if (rewardStage || objects.includes("reward")) addLimited(groups.components, "奖励进度展示");
    if (rtl) addLimited(groups.components, "RTL 进度展示");
  }
  if (components.includes("button")) addLimited(groups.components, "按钮组件");
  if (components.includes("rank-list")) addLimited(groups.components, "排行榜组件");
  if (roundReward) addLimited(groups.components, "轮次奖励组件");

  for (const symbol of symbols) addLimited(groups.code, symbol);
  for (const api of apis) addLimited(groups.code, api);
  for (const asset of assets) addLimited(groups.code, asset);
  if (roundReward) {
    for (const candidate of ["reward_config", "轮次阶段关联", "轮次奖励展示条件"]) addLimited(groups.code, candidate);
  }
  if (symptoms.includes("state-display-mismatch")) {
    addLimited(groups.code, "state 映射");
    addLimited(groups.code, "领取态 UI 判断");
  }
  const exactScope = scopes.find((scope) => !["current-activity", "current-project"].includes(scope));
  const codeTerms = [
    rewardStage ? "奖励进度条" : progress ? "进度条" : components[0] || componentNames[0],
    semanticNames[states[0]] || states[0],
    semanticNames[symptoms[0]] || symptoms[0],
  ].filter(Boolean).slice(0, 2).join(" ");
  if (exactScope && codeTerms) addLimited(groups.code, `${exactScope} ${codeTerms} 实现`);
  if (codeTerms) addLimited(groups.code, `当前项目 ${codeTerms} 实现`);
  if (codeTerms && (rtl || rewardStage || states.length)) {
    addLimited(groups.code, `相似活动 ${[
      rtl ? "RTL" : null, progress ? "进度展示" : components[0], semanticNames[states[0]] || states[0], semanticNames[symptoms[0]] || symptoms[0],
    ].filter(Boolean).slice(0, 3).join(" ")} 实现`);
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
  }

  if (/弹窗|\b(?:dialog|modal|popup)\b/i.test(text)) addEntity(entities, "ui_component", "dialog", "弹窗");
  if (/蒙层|遮罩/.test(text)) {
    addEntity(entities, "visual_change", "mask", "增加蒙层");
    addEntity(entities, "task", "ui-modification", "UI 修改");
  }
  if (/替换(?:图片|图标|背景)/.test(text)) {
    addEntity(entities, "visual_change", "asset-replacement", "替换视觉资源");
    addEntity(entities, "task", "ui-modification", "UI 修改");
  }
  if (/文案/.test(text) && /修改|替换|改为|调整/.test(text)) {
    const target = text.match(/(?:文案(?:改)?为|改为|改成|替换为)[“\"']?([^”\"'，。；;]{1,40})/)?.[1];
    addEntity(entities, "visual_change", "copy-change", target ? `文案改为“${target}”` : "文案修改");
    addEntity(entities, "task", "ui-modification", "UI 修改");
  }
  if (/奖励/.test(text)) {
    addEntity(entities, "business_object", "reward-item", "奖励项");
    if (hasAny(lower, ["蒙层", "遮罩", "图片", "状态", "领取"])) addEntity(entities, "target_scope", "reward-item", "奖励项");
  }
  if (/已领取|领取后|获取后|获取到|奖励获取/.test(text)) addEntity(entities, "state", "claimed", "奖励已获取/已领取");
  if (/state\s*=\s*0/i.test(text)) {
    addContext("observed_data", "接口数据：state=0");
    addEntity(entities, "state", "state=0", "state=0");
  }
  if (/显示已领取/.test(text)) addContext("observed_ui", "页面表现：显示已领取");

  const symptom = text.match(/(?:页面)?([^，。；;]{0,24}(?:没有显示|没显示|未显示|显示异常|显示错误|不对|异常|有问题))/)?.[1];
  if (symptom) addEntity(entities, "issue_symptom", clean(symptom, 60), clean(symptom, 60));
  if (/state\s*=\s*\d+/i.test(text) && /显示已领取/.test(text)) {
    addEntity(entities, "issue_symptom", "state-display-conflict", "接口状态与页面表现不一致");
  }

  const inspectionGoals = [];
  if (/视觉/.test(text)) inspectionGoals.push("视觉");
  if (/交互/.test(text)) inspectionGoals.push("交互");
  if (/响应式/.test(text)) inspectionGoals.push("响应式");
  if (/控制台/.test(text)) inspectionGoals.push("控制台");
  if (/网络/.test(text)) inspectionGoals.push("网络请求");
  if (inspectionGoals.length) {
    addContext("inspection_goal", `检查目标：${inspectionGoals.join("、")}`);
    for (const goal of inspectionGoals) addEntity(entities, "inspection_goal", goal, goal);
  }

  const prefixedScope = text.match(/(?:在|为|针对)([^，。；;\s]{1,18}?(?:页|页面|模块|组件|按钮|列表))(?=开发|实现|新增|创建|修改|调整|检查|制定|规划|点击|$)/)?.[1];
  const plannedScope = text.match(/(?:制定|规划|输出)?([^，。；;\s]{1,18}?(?:页|页面|模块|组件))(?=改造|开发|实施|技术|前端|方案|计划)/)?.[1];
  const namedScope = prefixedScope || plannedScope
    || text.match(/(?:^|[，。；;\s])([^，。；;\s]{1,18}(?:页|页面|模块|组件|弹窗|按钮|列表))(?=[，。；;\s]|$)/)?.[1];
  if (namedScope
    && !["这个页面", "当前页面"].includes(namedScope)
    && !hasAny(namedScope, ["开发", "创建", "新建", "实现", "做一个", "做个", "一个弹窗"])) {
    addEntity(entities, "target_scope", namedScope, namedScope);
  }
  if (hasAny(lower, ["这里", "这个页面", "当前页面", "当前文件", "选中代码"])) {
    addEntity(entities, "target_scope", "current-context", "当前上下文");
  }

  for (const evidence of evidenceItems) {
    if (evidence.type === "visual_design") addEntity(entities, "visual_change", "visual-reference", evidence.detail, evidence.source);
  }
  return { contexts: contexts.slice(0, 10), entities };
}

function gap(type, reason, blocking, suggestedSource) {
  const result = { type, reason, blocking };
  if (suggestedSource) result.suggested_source = suggestedSource;
  return result;
}

function gapsFor(intent, query, contexts, entities, evidenceItems) {
  const text = cleanGoal(query).toLowerCase();
  const hasScope = entityValues(entities, "target_scope").length > 0;
  const hasSymptom = entityValues(entities, "issue_symptom").length > 0;
  const hasVisualChange = entityValues(entities, "visual_change").length > 0;
  const hasPageEntry = entityValues(entities, "page_entry").length > 0;
  const hasInspectionGoal = entityValues(entities, "inspection_goal").length > 0;
  const result = [];

  if (intent === "feature_create") {
    if (!hasScope) {
      result.push(gap("target_scope", "新功能所属页面或模块尚未确认，当前无法确定修改位置。", true, "user"));
    } else if (/开发|实现|新增|创建/.test(text) && !hasAny(text, ["需要", "用于", "支持", "实现为", "显示", "点击", "提交", "领取", "检查"])) {
      result.push(gap("expected_behavior", "新功能需要实现的业务行为尚未确认，会影响实现方向。", true, "user"));
    }
    const referencesVisual = hasAny(text, ["按设计稿", "参考设计稿", "按截图", "参考截图"]);
    const hasVisualEvidence = evidenceItems.some((item) => ["visual_design", "screenshot"].includes(item.type));
    if (referencesVisual && !hasVisualEvidence) {
      result.push(gap("visual_reference", "需求依赖视觉参考，但本轮没有可用的真实附件。", false, "user"));
    }
    const referencesInteraction = hasAny(text, ["按交互稿", "参考交互稿", "按交互图", "参考交互图"]);
    const hasInteractionEvidence = evidenceItems.some((item) => item.type === "interaction_flow");
    if (referencesInteraction && !hasInteractionEvidence) {
      result.push(gap("interaction_rule", "需求依赖交互参考，但本轮没有可用的真实附件。", false, "user"));
    }
    const needsData = hasAny(text, ["接口数据", "接口返回", "数据源", "动态数据", "列表数据"]);
    const hasDataSource = evidenceItems.some((item) => item.type === "api_document")
      || /(?:https?:\/\/|\/api\/|\bapi\b|\bopenapi\b)/i.test(text);
    if (needsData && !hasDataSource) {
      result.push(gap("data_source", "功能依赖的数据来源尚未确认。", false, "project"));
    }
  }

  if (intent === "bug_fix") {
    if (!hasSymptom) result.push(gap("issue_symptom", "问题表现尚未说明，无法判断需要修复的结果。", true, "user"));
    else if (!hasScope) result.push(gap("target_scope", "问题所在页面、组件或代码上下文尚未确认。", true, "user"));
    if (/state\s*=\s*\d+/i.test(text) && /显示已领取/.test(text)) {
      result.push(gap(
        "state_mapping",
        "接口状态值与页面已领取表现之间的映射关系尚未确认。",
        false,
        "project",
      ));
    }
  }

  if (intent === "ui_modify") {
    if (!hasScope) result.push(gap("target_scope", "视觉修改所在页面、组件或文件尚未确认，当前无法确定修改位置。", true, "user"));
    else if (!hasVisualChange) result.push(gap("visual_change", "需要修改的视觉结果尚未确认，会影响实现方向。", true, "user"));
    const statefulVisual = hasVisualChange && hasAny(text, [
      "已领取", "领取后", "获取后", "获取到", "奖励获取", "已完成", "完成后", "状态",
    ]);
    const hasStateMapping = /(?:state|status|claimed|isclaimed)\s*[=:]/i.test(text);
    if (statefulVisual && !hasStateMapping) {
      result.push(gap(
        "state_condition",
        "已确认状态变化后的视觉效果，但用于判定该状态的字段或条件尚未确认。",
        false,
        "project",
      ));
    }
    const needsAsset = hasAny(text, ["替换图片", "替换图标", "替换背景", "蒙层图片"]);
    if (needsAsset && entityValues(entities, "asset_resource").length === 0) {
      result.push(gap("asset_resource", "视觉修改需要使用的资源尚未确认。", true, "user"));
    }
  }

  if (intent === "ui_inspection") {
    if (!hasPageEntry) result.push(gap("page_entry", "待检查页面的入口尚未确认。", true, "user"));
    else if (!hasInspectionGoal) result.push(gap("inspection_goal", "需要检查的视觉或交互目标尚未确认。", true, "user"));
  }

  if (intent === "planning") {
    const hasGoal = hasAny(text, ["规划", "计划", "方案", "目标", "实现", "开发", "改造"]);
    if (!hasGoal) result.push(gap("goal", "计划需要达成的目标尚未确认。", true, "user"));
    else if (!hasScope) result.push(gap("scope", "计划覆盖的业务或模块范围尚未确认。", true, "user"));
  }

  let blockingSeen = false;
  return result.filter((item) => {
    if (!item.blocking) return true;
    if (blockingSeen) return false;
    blockingSeen = true;
    return true;
  });
}

function relationshipsFor(query, evidenceItems) {
  const text = cleanGoal(query);
  const result = [];
  if (/state\s*=\s*0/i.test(text) && /显示已领取/.test(text)) {
    result.push("接口数据 state=0 与页面显示“已领取”存在冲突；两者的状态映射关系待验证。");
  }
  if (evidenceItems.some((item) => item.type === "screenshot")) {
    result.push("截图只确认页面表现，不直接证明接口数据或代码实现。");
  }
  return result;
}

function exclusionsFrom(query) {
  return [...query.matchAll(/(不要|不需要|无需|禁止|别|不改|不生成|只要|仅|只)([^，。；;\n]{1,32})/g)]
    .map((match) => clean(match[1] + match[2]))
    .filter((value, index, items) => items.indexOf(value) === index)
    .slice(0, 6);
}

function boundariesFor(intent, query, contexts, evidenceItems) {
  const result = exclusionsFrom(query);
  const add = (value) => {
    if (value && !result.includes(value)) result.push(value);
  };
<<<<<<< HEAD
=======
  const components = entityValues(entities, "ui_component");
  const componentNames = entityValues(entities, "component");
  const assets = entityValues(entities, "asset_resource");
  const apis = entityValues(entities, "api");
  const objects = entityValues(entities, "business_object");
  const states = entityValues(entities, "state");
  const symptoms = entityValues(entities, "issue_symptom");
  const layouts = entityValues(entities, "layout_scene");
  const scopes = entityValues(entities, "target_scope");
  const progress = components.includes("progress-track");
  const dialog = components.includes("dialog");

  const conceptNames = {
    "reward-stage": "奖励阶段",
    "round-reward": "轮次奖励",
    "reward-item": "奖励",
    reward: "奖励",
    stage: "阶段",
    lottery: "抽奖",
    task: "任务",
    claimed: "已领取状态",
    unclaimed: "未领取状态",
    completed: "已完成状态",
    incomplete: "未完成状态",
    locked: "锁定状态",
    "image-not-updated": "图片状态映射",
    "incomplete-display": "展示完整性",
    "order-mismatch": "顺序映射",
    "state-display-mismatch": "状态映射",
    "progress-display-mismatch": "进度状态映射",
  };
  for (const object of objects) add(conceptNames[object] || object);
  if (progress) add(objects.some((object) => ["reward", "reward-stage", "reward-item"].includes(object)) ? "奖励进度展示" : "进度展示逻辑");
  if (dialog) add("弹窗组件");
  for (const component of componentNames) add(component);
  for (const state of states) add(conceptNames[state] || state);
  if (layouts.includes("RTL")) add("RTL 布局");
  for (const symptom of symptoms) add(conceptNames[symptom] || symptom);
  if (entityValues(entities, "visual_effect").includes("mask")) add("蒙层展示");
  for (const asset of assets) add(asset);
  for (const api of apis) add(api);
  const exactScope = scopes.find((scope) => !["current-activity", "current-project"].includes(scope));
  if (exactScope) add(exactScope);
  else if (scopes.includes("current-activity")) add("当前活动");
  else if (scopes.includes("current-project")) add("当前项目");
  if (intent === "ui_inspection") add("页面视觉与交互");
  return result.slice(0, 7);
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
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
  const target = contexts.find((item) => ["target_file", "target_directory"].includes(item.type));
  if (target) add(`修改范围限于${target.value.replace(/^目标(?:文件|目录)：/, "")}及必要直接依赖。`);
  if (intent === "feature_create" && /弹窗|\b(?:dialog|modal|popup)\b/i.test(query)) {
    add("不补充用户未确认的按钮、属性、事件或样式。");
  }
  if (/state\s*=\s*\d+/i.test(query) && /显示已领取/.test(query)) add("不直接假定 state=0 的业务含义。");
  if (evidenceItems.some((item) => item.type === "screenshot")) add("不将截图表现当作接口或代码事实。");
  if (!result.length) add("仅覆盖用户已确认的目标和必要直接修改。");
  return result.slice(0, 6);
}

function acceptanceFor(intent, query, entities) {
  const result = [];
  const assets = entities.asset_resource.map((item) => item.label);
  if (intent === "ui_modify" && entityValues(entities, "visual_change").includes("mask")) {
    const statefulReward = entityValues(entities, "business_object").includes("reward-item")
      && entityValues(entities, "state").includes("claimed");
    result.push(statefulReward
      ? `奖励获取后显示${assets[0] ? `资源 ${assets[0]} 的` : ""}蒙层。`
      : `按用户描述增加${assets[0] ? `资源 ${assets[0]} 的` : ""}蒙层。`);
  } else if (intent === "ui_modify" && entityValues(entities, "visual_change").includes("copy-change")) {
    result.push(`${entities.visual_change.find((item) => item.value === "copy-change").label}，其他行为保持不变。`);
  } else if (intent === "bug_fix" && entityValues(entities, "issue_symptom").includes("state-display-conflict")) {
    result.push("验证真实状态映射后，使页面表现与业务状态一致。");
  } else if (intent === "bug_fix") {
    result.push("修复已确认的问题表现，不扩展无关行为。");
  } else if (intent === "ui_inspection") {
    result.push("完成指定页面的检查，并记录视觉和交互发现。");
  } else if (intent === "planning") {
    result.push("计划覆盖已确认的目标和范围，不扩展未确认需求。");
  } else if (/弹窗|\b(?:dialog|modal|popup)\b/i.test(query)) {
    result.push("产出弹窗实现，不补充未确认的交互和样式。");
  } else {
    result.push("实现用户明确描述的行为，不扩展未确认需求。");
  }
  return result;
}

function ensureConfirmedContext(intent, query, contexts, entities) {
  if (contexts.length) return contexts;
  const add = (type, value) => contexts.push({ type, value, source: "user_text" });
  if (intent === "feature_create" && entityValues(entities, "ui_component").includes("dialog")) {
    add("expected_behavior", "用户要求开发一个弹窗");
  } else if (intent === "planning") {
    add("goal", `计划目标：${cleanGoal(query)}`);
  } else {
    add("requirement", `已明确需求：${cleanGoal(query)}`);
  }
  return contexts;
}

export function buildTaskContract(query, evidenceTypes = []) {
  const evidenceItems = parseEvidenceItems(evidenceTypes);
  const intent = intentFor(query);
  const { contexts, entities } = extractContext(query, evidenceItems);
  ensureConfirmedContext(intent, query, contexts, entities);
  return {
    schema_version: 5,
    original_goal: query,
    intent,
    confirmed_context: contexts,
    entities,
    relationships_and_conflicts: relationshipsFor(query, evidenceItems),
    unknowns: gapsFor(intent, query, contexts, entities, evidenceItems),
    boundaries: boundariesFor(intent, query, contexts, evidenceItems),
    acceptance_criteria: acceptanceFor(intent, query, entities),
  };
}

export async function routeCompanySkills(args) {
<<<<<<< HEAD
  return buildTaskContract(args.query, args.evidenceTypes || []);
=======
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
    schema_version: 5,
    original_goal: args.query,
    confirmed_context: confirmedContext,
    intent,
    entities,
    retrieval_query_groups: retrievalQueryGroups,
    retrieval_queries: Object.values(retrievalQueryGroups).flat(),
    retrieval_directions: retrievalDirectionsFor(intent, entities),
    boundaries: boundariesFor(profile, args.query, confirmedContext),
    unknowns,
    recommended_skill: recommendation?.name || null,
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
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
}

export async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await routeCompanySkills(args);
    process.stdout.write(args.debugJson ? `${JSON.stringify(result, null, 2)}\n` : `${formatUserOutput(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
