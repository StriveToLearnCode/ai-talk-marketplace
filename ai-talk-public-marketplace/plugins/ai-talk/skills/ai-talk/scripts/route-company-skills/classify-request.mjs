import path from "node:path";

import { EVIDENCE_LABELS, EVIDENCE_TYPE_ALIASES, KEYWORDS } from "./rules.mjs";

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function includesUnnegatedAny(text, terms) {
  return terms.some((term) => {
    let index = text.indexOf(term);
    while (index !== -1) {
      const prefix = text.slice(Math.max(0, index - 4), index);
      if (!/(?:不|不要|无需|禁止|别)\s*$/u.test(prefix)) return true;
      index = text.indexOf(term, index + term.length);
    }
    return false;
  });
}

function unique(items, key = (item) => item) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

const SOURCE_FACT_KINDS = new Set([
  "attachment_reference",
  "ui_element",
  "ui_structure",
  "interaction",
  "progress_semantics",
  "resource_reference",
  "resource_reuse_candidate",
]);
const BLOCKER_KINDS = new Set([
  "data_requirement",
  "target_locator",
  "component_locator",
  "resource_key",
]);
const ASSERTION_KINDS = new Set([
  "ui_assertion",
  "interaction_assertion",
  "state_assertion",
  "resource_assertion",
]);
const EVIDENCE_STATUSES = new Set(["fact", "inference", "unknown"]);
const ATTACHMENT_ROLES = new Set(["target", "reference", "comparison"]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);

function requiredString(entry, field, index) {
  const value = entry[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`--evidence-json entry ${index + 1} requires non-empty ${field}.`);
  }
  return value.trim();
}

function normalizeTypedEvidence(entries) {
  return unique(entries.map((raw, index) => {
    const entry = structuredClone(raw);
    entry.kind = requiredString(entry, "kind", index);
    entry.source = requiredString(entry, "source", index);
    const knownKind = SOURCE_FACT_KINDS.has(entry.kind)
      || BLOCKER_KINDS.has(entry.kind)
      || ASSERTION_KINDS.has(entry.kind);
    if (!knownKind) throw new Error(`--evidence-json entry ${index + 1} has unknown kind: ${entry.kind}.`);

    if (ASSERTION_KINDS.has(entry.kind)) {
      entry.description = requiredString(entry, "description", index);
      delete entry.status;
      return entry;
    }

    entry.status = requiredString(entry, "status", index);
    if (!EVIDENCE_STATUSES.has(entry.status)) {
      throw new Error(`--evidence-json entry ${index + 1} has unknown status: ${entry.status}.`);
    }
    if (SOURCE_FACT_KINDS.has(entry.kind) && entry.status === "unknown") {
      throw new Error(`--evidence-json entry ${index + 1} must route unknown information through a blocker kind.`);
    }
    if (BLOCKER_KINDS.has(entry.kind) && entry.status !== "unknown") {
      throw new Error(`--evidence-json entry ${index + 1} must use status=unknown for blocker kind ${entry.kind}.`);
    }
    if (entry.status === "inference") {
      entry.confidence = requiredString(entry, "confidence", index);
      if (!CONFIDENCE_LEVELS.has(entry.confidence)) {
        throw new Error(`--evidence-json entry ${index + 1} has unknown confidence: ${entry.confidence}.`);
      }
    } else {
      delete entry.confidence;
    }
    if (entry.kind === "attachment_reference") {
      entry.attachment = requiredString(entry, "attachment", index);
      entry.role = requiredString(entry, "role", index);
      if (!/^attachment_[1-9]\d*$/.test(entry.attachment)) {
        throw new Error(`--evidence-json entry ${index + 1} attachment must use attachment_N.`);
      }
      if (!ATTACHMENT_ROLES.has(entry.role)) {
        throw new Error(`--evidence-json entry ${index + 1} has unknown attachment role: ${entry.role}.`);
      }
    }
    return entry;
  }), (item) => JSON.stringify(item));
}

function suppliedEvidence(values) {
  return values.map((raw, index) => {
    const match = String(raw).match(/^([^:=]+)[:=](.+)$/);
    const alias = (match?.[1] || raw).trim().toLowerCase();
    const type = EVIDENCE_TYPE_ALIASES[alias] || alias;
    return {
      type,
      value: (match?.[2] || EVIDENCE_LABELS[type] || alias).trim(),
      source: `argument:${index + 1}`,
    };
  });
}

function extractPaths(query) {
  const extension = "vue|tsx?|jsx?|mjs|cjs|json|css|scss|less|md|py|go|java|kt|swift";
  const pattern = new RegExp(`(?:^|[\\s\\x60'\"（(：:])((?:\\.{0,2}/)?(?:[\\w@.-]+/)*[\\w@.-]+\\.(?:${extension}))(?=$|[\\s\\x60'\"，。；;：:）)])`, "giu");
  return [...query.matchAll(pattern)].map((match) => match[1]).filter((value) => !value.startsWith("http"));
}

function referencesFigma(query) {
  return /(?:根据|参考|提供|上传|打开|查看|看看|看一下|分析|梳理|读取|访问|使用|转换|转成)\s*(?:这个|该|当前|已有|所附|附件中的)?\s*figma/i.test(query)
    || /figma\s*(?:链接|原型|文件|设计稿|页面|弹窗|交互|ui[\s_-]*meta)/i.test(query);
}

function extractApiNames(query) {
  const names = [];
  for (const match of query.matchAll(/\b(?:GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s，。；;]+)/gi)) names.push(match[1]);
  for (const match of query.matchAll(/\b(?:get|post|fetch|update|create|delete)[A-Z][A-Za-z0-9_$]*/g)) names.push(match[0]);
  for (const match of query.matchAll(/([\w.$/-]{2,50})\s*(?:接口|API)\b/giu)) names.push(match[1]);
  return unique(names);
}

function extractComponents(query) {
  const names = [...query.matchAll(/\b[A-Z][A-Za-z0-9_$]*(?:Dialog|Modal|Popup|Page|View|Panel|Card|List|Button|Component)\b/g)]
    .map((match) => match[0]);
  for (const match of query.matchAll(/(?:Unknown custom element|Failed to resolve component)\s*:\s*([a-z][a-z0-9-]*)/gi)) names.push(match[1]);
  for (const match of query.matchAll(/([\p{Script=Han}A-Za-z0-9_-]{2,24})(?:弹窗|组件)/gu)) names.push(`${match[1]}${match[0].endsWith("弹窗") ? "弹窗" : "组件"}`);
  return unique(names);
}

function extractUrls(query) {
  return unique([...query.matchAll(/https?:\/\/[^\s，。；;）)]+/gi)].map((match) => match[0]));
}

function extractStates(query) {
  const values = [];
  for (const match of query.matchAll(/\b(?:state|status)\s*[:=：]\s*([A-Za-z0-9_.-]+)/gi)) values.push(`${match[0].split(/[:=：]/)[0].trim()}=${match[1]}`);
  for (const match of query.matchAll(/\b(claimed|unclaimed|completed|incomplete|locked|disabled|loading|success|failed)\b/gi)) values.push(match[1]);
  return unique(values.map((value) => value.toLowerCase()));
}

function extractResources(query) {
  const values = [];
  for (const match of query.matchAll(/\b(?:icon|mask|sprite|image|img|asset)s?(?:\/[\w@.-]+)+\b/gi)) values.push(match[0]);
  return unique(values);
}

function inferEvidence(query, provided) {
  const text = query.toLowerCase();
  const evidence = [...provided];
  const add = (type, value) => evidence.push({ type, value, source: "user_request" });
  if (includesAny(text, KEYWORDS.screenshotEvidence)) add("screenshot", "用户在原话中明确引用的截图");
  if (referencesFigma(query)) add("figma", "用户在原话中明确提供或引用的 Figma");
  if (includesAny(text, KEYWORDS.designEvidence)) add("design", "用户在原话中明确提供或引用的设计稿");
  if (includesAny(text, KEYWORDS.apiEvidence)) add("api", "用户在原话中明确提供或引用的接口资料");
  for (const value of extractPaths(query)) add("target_file", value);
  for (const value of extractApiNames(query)) add("api_name", value);
  for (const value of extractComponents(query)) add("component", value);
  for (const value of extractStates(query)) add("state", value);
  for (const value of extractResources(query)) add("resource", value);
  for (const value of extractUrls(query)) add("target_url", value);
  if (/点击图\s*[一二三四五六七八九\d]+.+(?:后|再).*(?:跳转|切换|定位).*(?:图\s*[一二三四五六七八九\d]+|tab\s*\d+)/iu.test(query)) {
    add("interaction", query.replace(/[。！!]+$/g, ""));
  }
  return unique(evidence, (item) => `${item.type}:${item.value}`);
}

function classifyIntent(query) {
  const text = query.toLowerCase();
  const figmaReference = referencesFigma(query);
  const liveInspect = includesAny(text, KEYWORDS.inspect)
    || /(?:检查|查看|看看|测试|测一下).{0,16}(?:视觉|交互|响应式|布局|按钮点击)/i.test(text);
  const rejectsAutomatedTest = /(?:不要|不需要|无需|禁止|不)\s*(?:生成|创建|编写)?\s*(?:自动化)?测试(?:文件|用例)?/i.test(text);
  const intermittentDisplay = /(?:一会(?:儿)?(?:展示|显示).{0,4}一会(?:儿)?不(?:展示|显示)|时有时无|忽隐忽现)/u.test(text);
  const apiPageConflict = /(?:接口|api)/iu.test(text)
    && /(?:页面|界面|ui|展示|显示)/iu.test(text)
    && /(?:冲突|不一致|但|却)/u.test(text);
  const runtimeComponentError = /(?:unknown custom element|failed to resolve component)\s*:/i.test(text);
  const interactionChange = /点击图\s*[一二三四五六七八九\d]+.+(?:后|再).*(?:跳转|切换|定位).*(?:图\s*[一二三四五六七八九\d]+|tab\s*\d+)/iu.test(text);
  const ambiguousModification = /^(?:请)?帮我(?:改一下|修改一下|修一下)(?:这个|它|这里)?[。！!]?$/u.test(text.trim());
  const planThenExecute = /先.{0,20}(?:方案|分析|原因|排查|定位).{0,24}(?:确认|同意|通过).{0,8}(?:后|再).{0,8}(?:改|修改|修复|实现|开发)/u.test(text);
  const flags = {
    analysisOnly: includesAny(text, KEYWORDS.analysisOnly),
    diagnostic: includesAny(text, KEYWORDS.diagnostic),
    planThenExecute,
    automatedTest: includesAny(text, KEYWORDS.automatedTest) && !rejectsAutomatedTest,
    plan: includesAny(text, KEYWORDS.plan),
    noCode: includesAny(text, KEYWORDS.noCode),
    code: includesUnnegatedAny(text, KEYWORDS.code) || interactionChange,
    bug: includesAny(text, KEYWORDS.bug) || intermittentDisplay || apiPageConflict || runtimeComponentError,
    ambiguousModification,
    interactionChange,
    runtimeComponentError,
    inspect: liveInspect,
    figma: figmaReference,
    analyze: includesAny(text, KEYWORDS.analyze),
    document: includesAny(text, KEYWORDS.document),
  };

  if (flags.ambiguousModification) return { action: "clarify", target: "unknown", desired_output: "unknown", flags };
  if (flags.automatedTest) return { action: "test", target: "test", desired_output: "automated_test", flags };
  if (flags.planThenExecute) {
    const asksForPlan = /(?:方案|计划)/u.test(text);
    return asksForPlan
      ? { action: "plan", target: "frontend", desired_output: "implementation_plan", flags }
      : { action: "analyze", target: "code", desired_output: "code_changes", flags };
  }
  if (flags.plan && (flags.noCode || !flags.code)) return { action: "plan", target: "frontend", desired_output: "implementation_plan", flags };
  if (flags.inspect) return { action: "inspect", target: "page", desired_output: "live_page_findings", flags };
  if (!flags.analysisOnly && flags.code) return { action: "modify", target: "code", desired_output: "code_changes", flags };
  if (flags.figma && flags.analyze && (flags.document || !flags.inspect)) {
    return { action: "analyze", target: "figma", desired_output: "figma_analysis_document", flags };
  }
  if (flags.analysisOnly || flags.diagnostic || flags.bug) {
    return { action: "analyze", target: "code", desired_output: "code_changes", flags };
  }
  if (flags.figma) return { action: "analyze", target: "figma", desired_output: "figma_analysis_document", flags };
  return { action: "clarify", target: "unknown", desired_output: "unknown", flags };
}

function executionModeFor(intent, flags) {
  if (flags.planThenExecute) return "plan_then_execute";
  if (intent.desired_output === "live_page_findings") {
    return flags.analysisOnly || !flags.code ? "inspect_only" : "modify_and_verify";
  }
  if (intent.desired_output === "code_changes") return intent.action === "modify" ? "modify_and_verify" : "inspect_only";
  if (["implementation_plan", "figma_analysis_document"].includes(intent.desired_output)) return "plan_only";
  if (intent.desired_output === "automated_test") return "modify_and_verify";
  return "inspect_only";
}

function targetPageFor(query) {
  const match = query.match(/([\p{Script=Han}A-Za-z0-9_-]{2,40})\s*(?:页面|页)/u)
    || query.match(/([A-Za-z0-9_-]{2,40})\s*tab\d*\b/i);
  const value = match?.[1]?.replace(/^(?:(?:请|帮我|先|给|为|把|用浏览器|现场|修复|修改|开发|实现|检查|打开|看看|分析|根据|这个|目标|当前|已有))+/, "") || null;
  return ["打开", "看看", "检查", "这个", "把这个", "目标", "当前", "已有"].includes(value) ? null : value;
}

function taskTypeFor(query, evidence) {
  const text = query.toLowerCase();
  const hasTargetFile = evidence.some((item) => item.type === "target_file");
  if (hasTargetFile && /(?:文案|文字|copy|标题|提示语)/i.test(query)) return "copy_change";
  if (/(?:接口|api)/iu.test(query)
    && /(?:页面|界面|ui|展示|显示)/iu.test(query)
    && /(?:冲突|不一致|但|却)/u.test(query)) return "api_page_conflict";
  if (/(?:奖励|奖品|reward|prize)/iu.test(query)
    && /(?:最后(?:一个|一项)|末项|末尾)/u.test(query)
    && /(?:一会(?:儿)?(?:展示|显示).{0,4}一会(?:儿)?不(?:展示|显示)|时有时无|忽隐忽现)/u.test(query)) {
    return "intermittent_reward_display";
  }
  if (/\b(?:claimed|unclaimed|completed|incomplete|locked|disabled)\b/i.test(query)
    && /(?:图片|图标|蒙层|image|icon|mask)/i.test(query)
    && /(?:未切换|不切换|没有切换|未更新|没有更新|异常)/i.test(query)) return "state_visual_mismatch";
  if (/(?:Unknown custom element|Failed to resolve component)\s*:/i.test(query)
    || (/(?:动态组件|dynamic component)/i.test(query) && /(?:未注册|没有注册|找不到|unknown|not registered|failed to resolve)/i.test(query))) {
    return "dynamic_component_registration";
  }
  if (/(?:奖励|reward)/i.test(query) && /(?:icon\/mask|蒙层|mask)/i.test(query) && /(?:领取|claimed|claim)/i.test(query)) {
    return "reward_claim_visual";
  }
  if (/(?:奖励|reward)/i.test(query) && /(?:名称|name)/i.test(query) && /(?:角标|badge|tag)/i.test(query)
    && /(?:缺失|没有|没显示|不显示|missing)/i.test(query)) return "reward_metadata_missing";
  if (/(?:弹窗|dialog|modal|popup)/i.test(query) && /(?:一进入|首次进入|进入页面|自动打开|自动开启|就开启|就打开)/i.test(query)) {
    return "dialog_auto_open";
  }
  if (/(?:弹窗|dialog|modal|popup)/i.test(text)) return "dialog_change";
  if (/点击图\s*[一二三四五六七八九\d]+.+(?:后|再).*(?:跳转|切换|定位).*(?:图\s*[一二三四五六七八九\d]+|tab\s*\d+)/iu.test(query)) {
    return "image_tab_navigation";
  }
  return "generic";
}

function typedKnowledge(entries) {
  const text = entries.map((item) => [
    item.name, item.description, item.subject, item.meaning, item.trigger, item.effect, item.resource,
  ].filter(Boolean).join(" ")).join(" ");
  const result = [];
  if (/(?:积分|进度|阶段)/u.test(text)) result.push("积分阶段");
  if (/(?:奖励|奖品)/u.test(text)) result.push("奖励展示");
  if (entries.some((item) =>
    ["resource_reference", "resource_reuse_candidate"].includes(item.kind)
    && item.status === "fact"
    && item.provider === "Page Center")) result.push("页面资源");
  if (/(?:领取|claimed|奖励状态)/iu.test(text)) result.push("奖励状态");
  if (/(?:半屏|h5|openH5)/iu.test(text)) result.push("半屏 H5");
  if (/(?:rtl|从右到左)/iu.test(text)) result.push("RTL 布局");
  if (entries.some((item) => item.kind === "interaction")) result.push("页面交互");
  return unique(result).slice(0, 4);
}

function requiredKnowledgeFor(taskType, evidence, typedEvidence, intent) {
  const known = {
    dialog_auto_open: ["弹窗模板结构", "弹窗打开与关闭方式", "页面首次进入生命周期", "页面弹窗挂载方式"],
    dialog_change: ["弹窗模板结构", "弹窗打开与关闭方式", "目标页面弹窗挂载方式"],
    reward_metadata_missing: ["奖励名称和角标的接口字段", "抽奖结果到弹窗数据的适配", "奖励弹窗的字段渲染"],
    dynamic_component_registration: ["动态组件名称生成", "动态组件注册规则", "实际组件名称"],
    reward_claim_visual: ["奖励领取状态判断", "icon/mask 资源引用", "奖励节点渲染"],
    state_visual_mismatch: ["状态来源", "状态转换", "图片渲染分支"],
    intermittent_reward_display: ["轮播切换", "奖励数据", "图片配置"],
    api_page_conflict: ["接口返回", "页面展示"],
    image_tab_navigation: ["点击入口", "Tab 跳转", "目标位置"],
    copy_change: ["目标文案位置"],
    generic: null,
  }[taskType];
  if (known) return known;
  const fromTypedEvidence = typedKnowledge(typedEvidence);
  if (fromTypedEvidence.length) return fromTypedEvidence;
  const result = [];
  for (const item of evidence) {
    if (item.type === "api_name") result.push(`${item.value} 接口响应`);
    if (item.type === "state") result.push(`${item.value} 状态判断`);
    if (item.type === "component") result.push(`${item.value} 渲染逻辑`);
    if (item.type === "target_file") result.push(`${path.basename(item.value)} 中的目标行为`);
  }
  if (result.length) return unique(result).slice(0, 4);
  return {
    automated_test: ["目标流程", "关键断言", "测试运行约定"],
    implementation_plan: ["页面结构", "数据流", "交互边界"],
    figma_analysis_document: ["页面结构", "交互状态", "组件边界"],
    live_page_findings: ["目标页面行为", "交互状态", "响应式表现"],
    code_changes: ["目标行为", "数据流", "渲染状态"],
  }[intent.desired_output] || [];
}

export function classifyRequest(query, evidenceTypes = [], evidenceEntries = []) {
  const original = String(query || "").replace(/^\s*\$ai-talk(?::ai-talk)?\s*/i, "").trim();
  const intent = classifyIntent(original);
  const evidence = inferEvidence(original, suppliedEvidence(evidenceTypes));
  const page = targetPageFor(original);
  if (page) evidence.push({ type: "target_page", value: page, source: "user_request" });
  const normalizedEvidence = unique(evidence, (item) => `${item.type}:${item.value}`);
  const taskType = taskTypeFor(original, normalizedEvidence);
  const typedEvidence = normalizeTypedEvidence(evidenceEntries);
  const executionMode = executionModeFor(intent, intent.flags);
  const attachmentCount = typedEvidence.filter((item) => item.kind === "attachment_reference").length;
  const figureCount = new Set([...original.matchAll(/图\s*([1-9]\d*)/gu)].map((match) => match[1])).size;
  const multiImageUi = intent.desired_output === "code_changes"
    && (attachmentCount >= 2 || figureCount >= 2);

  return {
    originalRequest: original,
    intent: { action: intent.action, target: intent.target, desired_output: intent.desired_output },
    evidence: normalizedEvidence,
    typedEvidence,
    flags: intent.flags,
    executionMode,
    multiImageUi,
    taskType,
    taskGoal: intent.desired_output === "unknown" ? null : original,
    requiredKnowledge: requiredKnowledgeFor(taskType, normalizedEvidence, typedEvidence, intent),
  };
}

export function buildRetrievalRequest(understanding) {
  return Object.freeze({
    originalRequest: understanding.originalRequest,
    intent: structuredClone(understanding.intent),
    evidence: structuredClone(understanding.evidence),
    typedEvidence: structuredClone(understanding.typedEvidence),
    flags: structuredClone(understanding.flags),
    executionMode: understanding.executionMode,
    multiImageUi: understanding.multiImageUi,
    taskType: understanding.taskType,
    requiredKnowledge: [...understanding.requiredKnowledge],
  });
}

export function explicitTargetFiles(classification) {
  return classification.evidence
    .filter((item) => item.type === "target_file")
    .map((item) => item.value.replace(/^\.\//, "").split(path.sep).join("/"));
}
