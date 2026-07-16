#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import { formatUserOutput } from "./format-user-output.mjs";

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
  const addContext = (type, value, source = "user_text") => {
    if (!contexts.some((item) => item.type === type && item.value === value)) contexts.push({ type, value, source });
  };
  const text = cleanGoal(query);
  const lower = text.toLowerCase();

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
  return buildTaskContract(args.query, args.evidenceTypes || []);
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
