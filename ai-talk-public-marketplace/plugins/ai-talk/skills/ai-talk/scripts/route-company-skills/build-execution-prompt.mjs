function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).replace(/\s+/g, " ").trim()))];
}

function uniqueEntries(values, key) {
  const seen = new Set();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export const TASK_HANDOFF_SCHEMA_VERSION = "1.1";
export const TASK_EXECUTION_MODES = Object.freeze([
  "modify_and_verify",
  "inspect_only",
  "plan_then_execute",
  "plan_only",
]);
export const TASK_HANDOFF_KEYS = Object.freeze([
  "schema_version",
  "route",
  "workspace",
  "workflow",
  "task",
  "knowledge_requirements",
  "retrieval",
  "target_scope",
  "source_facts",
  "constraints",
  "blockers",
  "verification",
]);

function array(value) {
  return Array.isArray(value) ? structuredClone(value) : [];
}

export function normalizeTaskHandoff(value = {}) {
  const stage = value.workflow?.stage || {};
  const authorization = value.route?.authorization === "authorized" ? "authorized" : "inspect_only";
  const requestedMode = value.workflow?.execution_mode
    || (authorization === "authorized" ? "modify_and_verify" : "inspect_only");
  const executionMode = TASK_EXECUTION_MODES.includes(requestedMode) ? requestedMode : "inspect_only";
  return {
    schema_version: TASK_HANDOFF_SCHEMA_VERSION,
    route: {
      skill: value.route?.skill || null,
      authorization,
    },
    workspace: {
      project_root: value.workspace?.project_root || null,
      workdir: value.workspace?.workdir || null,
    },
    workflow: {
      execution_mode: executionMode,
      next_skill: value.workflow?.next_skill || null,
      stage: {
        value: stage.value || null,
        source: stage.source || "unavailable",
        status: stage.status || "unavailable",
      },
    },
    task: {
      source_request: value.task?.source_request || "",
      deliverable: value.task?.deliverable || null,
      reasoning: value.task?.reasoning || null,
    },
    knowledge_requirements: array(value.knowledge_requirements).slice(0, 4),
    retrieval: array(value.retrieval).slice(0, 3),
    target_scope: array(value.target_scope),
    source_facts: array(value.source_facts),
    constraints: array(value.constraints),
    blockers: array(value.blockers),
    verification: array(value.verification),
  };
}

export function validateTaskHandoff(value) {
  if (!value || typeof value !== "object") throw new Error("TaskHandoff must be an object.");
  const keys = Object.keys(value);
  if (keys.length !== TASK_HANDOFF_KEYS.length
    || keys.some((key, index) => key !== TASK_HANDOFF_KEYS[index])) {
    throw new Error("TaskHandoff has an invalid V1 top-level structure.");
  }
  if (value.schema_version !== TASK_HANDOFF_SCHEMA_VERSION) {
    throw new Error(`TaskHandoff schema_version must be ${TASK_HANDOFF_SCHEMA_VERSION}.`);
  }
  if (!["inspect_only", "authorized"].includes(value.route?.authorization)) {
    throw new Error("TaskHandoff route.authorization is invalid.");
  }
  if (!TASK_EXECUTION_MODES.includes(value.workflow?.execution_mode)) {
    throw new Error("TaskHandoff workflow.execution_mode is invalid.");
  }
  for (const field of TASK_HANDOFF_KEYS.slice(5)) {
    if (!Array.isArray(value[field])) throw new Error(`TaskHandoff ${field} must be an array.`);
  }
  if (value.knowledge_requirements.length > 4 || value.retrieval.length > 3) {
    throw new Error("TaskHandoff exceeds the V1 knowledge or retrieval limit.");
  }
  return value;
}

const TARGET_TYPES = new Set(["target_file", "target_page", "target_url", "component"]);
const SOURCE_FACT_KINDS = new Set([
  "attachment_reference",
  "ui_element",
  "ui_structure",
  "interaction",
  "progress_semantics",
  "resource_reference",
  "resource_reuse_candidate",
]);
const ASSERTION_KINDS = new Set([
  "ui_assertion",
  "interaction_assertion",
  "state_assertion",
  "resource_assertion",
]);

function hasScreenshotProtocol(classification) {
  return classification.typedEvidence.some((item) => SOURCE_FACT_KINDS.has(item.kind));
}

function requestBoundaries(classification, context) {
  const explicit = [...classification.originalRequest.matchAll(/(?:不要|不需要|无需|禁止|仅|只|不(?=修改|修复|生成|改))([^，。；;\n]{1,36})/g)]
    .map((match) => match[0].replace(/[。；;]+$/g, ""));
  if (hasScreenshotProtocol(classification)) {
    const hasPageCenter = classification.typedEvidence.some((item) =>
      ["resource_reference", "resource_reuse_candidate"].includes(item.kind)
      && item.provider === "Page Center"
      && item.status === "fact");
    return uniqueStrings([
      ...explicit,
      "不根据截图猜接口字段",
      "不根据视觉状态猜业务枚举",
      hasPageCenter ? "优先复用已有 Page Center 资源" : null,
      "不在未确认页面和组件前扩大修改范围",
    ]).slice(0, 6);
  }
  if (classification.executionMode === "inspect_only" && classification.intent.desired_output === "code_changes") {
    return uniqueStrings(["只定位问题，不修改代码", ...explicit]).slice(0, 2);
  }
  if (explicit.length) return uniqueStrings(explicit).slice(0, 2);

  const targets = context.items.filter((item) => item.type === "target_file").map((item) => item.value);
  if (classification.intent.desired_output === "implementation_plan") return ["只输出方案，不修改代码"];
  if (classification.executionMode === "modify_and_verify" && classification.intent.desired_output === "live_page_findings") {
    return ["按浏览器检查、修复、复验三个阶段执行"];
  }
  if (classification.executionMode === "inspect_only") return ["只做浏览器现场检查，不修改代码或生成自动化测试"];

  const defaults = {
    dialog_auto_open: ["优先复用现有弹窗体系", "仅修改当前活动及必要直接依赖"],
    dialog_change: ["优先复用现有弹窗体系", "不补充未确认的弹窗业务能力"],
    reward_metadata_missing: ["不猜测未确认的奖励字段含义", "仅调整奖励数据链及对应展示"],
    dynamic_component_registration: ["仅处理目标动态组件的名称与注册链路", "不扩展无关组件依赖"],
    reward_claim_visual: ["不猜测未确认的领取状态含义", "仅调整奖励节点及所需资源引用"],
    copy_change: targets.length ? [`仅修改 ${targets.join("、")} 中的目标文案`] : ["仅修改明确指定的文案"],
  }[classification.taskType];
  if (defaults) return defaults.slice(0, 2);
  return targets.length ? [`仅修改 ${targets.join("、")} 及必要直接依赖`] : ["不补充用户未确认的业务规则"];
}

function blocker(kind, description, resolution = "search_resolvable", blocking = false, extra = {}) {
  return { kind, description, source: "derived", status: "unknown", resolution, blocking, ...extra };
}

export function blockerDescription(item) {
  return typeof item === "string" ? item : item?.description || item?.name || "";
}

function normalizeTypedBlocker(item) {
  const description = item.description || (item.kind === "data_requirement"
    ? `${item.name || "所需数据"}来源未定位`
    : `${item.name || item.resource || "目标"}未定位`);
  return {
    ...item,
    description,
    status: "unknown",
    resolution: item.resolution || "search_resolvable",
    blocking: item.blocking === true,
  };
}

function blockersFor(classification, context, ranking) {
  const result = [];
  for (const description of context.unresolved) {
    result.push(blocker("context_unknown", description, "user_action_required", true));
  }

  const output = classification.intent.desired_output;
  const hasTarget = classification.evidence.some((item) => TARGET_TYPES.has(item.type));
  if (output === "unknown") {
    result.push(blocker("deliverable", "期望交付物尚未明确。", "user_action_required", true));
  }
  if (["code_changes", "automated_test", "live_page_findings"].includes(output) && !hasTarget) {
    if (output === "live_page_findings" && /(?:url|链接)/iu.test(classification.originalRequest)) {
      result.push(blocker("target_url", "请提供要检查的完整 URL。", "user_action_required", true));
    } else if (hasScreenshotProtocol(classification)) {
      result.push(blocker("target_locator", "目标页面未定位"));
      result.push(blocker("component_locator", "目标组件未定位"));
    } else {
      result.push(blocker("target_locator", "目标页面、组件或文件尚未明确；若可从当前会话确定，则无需追问。"));
    }
  }
  result.push(...classification.typedEvidence
    .filter((item) => item.status === "unknown")
    .map(normalizeTypedBlocker));
  if (!ranking.recommendedSkill && ranking.expectedSkill) {
    result.push(blocker(
      "skill_availability",
      `请先安装或启用 ${ranking.expectedSkill}，或通过 --source-root <label=path> 提供包含该 Skill 的目录。`,
      "user_action_required",
      true,
      { skill: ranking.expectedSkill },
    ));
  }
  return uniqueEntries(result, (item) => blockerDescription(item));
}

function engineeringJudgment(classification, retrievalEntries) {
  if (classification.intent.desired_output === "unknown") return null;
  const hasDialogSystem = retrievalEntries.some((item) => ["弹窗模板结构", "弹窗打开与关闭方式"].includes(item.knowledge));
  const judgments = {
    dialog_auto_open: hasDialogSystem
      ? "这是新增弹窗功能。复用现有弹窗结构和打开能力；新增内容是首次进入时的触发与页面挂载。"
      : "这是新增弹窗功能。需要新增弹窗 UI，并调整首次进入时的触发与页面挂载。",
    dialog_change: hasDialogSystem
      ? "这是现有弹窗能力扩展。复用弹窗结构和打开方式；调整重点是目标页面的 UI 与挂载位置。"
      : "这是现有弹窗能力扩展。需要调整弹窗 UI，并补齐目标页面的接入位置。",
    reward_metadata_missing: "这是奖励展示异常定位。复用现有抽奖接口和奖励数据适配；需要调整名称、角标到渲染层的字段链路。",
    dynamic_component_registration: "该报错指向动态组件解析链。应先核对名称生成、注册映射和实际组件名，不能仅凭报错认定组件文件缺失。",
    reward_claim_visual: "这是现有奖励展示的领取态扩展。复用领取状态判断和奖励节点；新增内容是 icon/mask 蒙层及其状态分支。",
    state_visual_mismatch: "这是状态图片异常定位。复用现有状态来源和转换逻辑；需要调整图片渲染分支。",
    intermittent_reward_display: "现象只说明末项奖励展示不稳定，尚不能确认是否与轮播周期同步。应优先核对末项取值、奖励数据和图片配置。",
    api_page_conflict: "接口返回与页面展示冲突，排查应集中在响应适配、视图状态转换和渲染分支，但不能据此判断接口或页面单侧有误。应先对照同一请求下的原始响应与页面消费值。",
    copy_change: "这是现有页面文案调整。复用目标文件的渲染位置；只需新增或替换指定文案。",
    image_tab_navigation: "用户已明确点击来源和跳转目标。应先定位点击处理与 tab3 激活入口，不猜测页面路径或状态字段。",
  };
  if (judgments[classification.taskType]) return judgments[classification.taskType];
  if (hasScreenshotProtocol(classification)) {
    const targetFile = classification.evidence.find((item) => item.type === "target_file")?.value;
    if (classification.multiImageUi && targetFile
      && classification.requiredKnowledge.some((item) => /(?:奖励|奖品)/u.test(item))) {
      return `这是现有页面能力的补充开发。复用 ${targetFile.split("/").pop()} 的奖励展示与选择交互，补齐目标图要求的结构、状态和资源。`;
    }
    const text = classification.typedEvidence.map((item) => [
      item.name, item.description, item.subject, item.meaning, item.trigger, item.effect,
    ].filter(Boolean).join(" ")).join(" ");
    if (/(?:积分|进度|阶段)/u.test(text) && /(?:奖励|奖品)/u.test(text)) {
      const target = classification.typedEvidence.find((item) => item.kind === "attachment_reference" && item.role === "target");
      const targetLabel = target?.label ? target.label.replace(/图\s*/u, "图 ") : "目标图";
      const hasGuardian = /守护者/u.test(text);
      const hasRtl = /(?:rtl|从右到左)/iu.test(text);
      const region = hasGuardian ? `${targetLabel} 的守护者区域` : "目标图的新增区域";
      const layout = hasRtl ? "RTL 布局" : "目标布局";
      return `这是现有奖励横幅的积分阶段扩展。优先复用进度、奖励展示和跳转能力；新增重点是${region}及 ${layout}。`;
    }
    return "这是新增页面功能。复用已定位的同类 UI 和交互能力；新增内容以目标图中的结构与状态为准。";
  }
  const target = classification.evidence.find((item) => item.type === "target_file")?.value;
  if (target) return `这是现有文件能力调整。复用 ${target} 已有行为；新增或调整内容以用户指定目标为准。`;
  const judgmentsByOutput = {
    automated_test: "这是现有页面能力的自动化扩展。复用项目测试运行方式；新增关键路径和稳定断言。",
    implementation_plan: "这是新增功能的方案设计。复用已定位的页面结构和数据流；新增内容是目标交互的实施步骤。",
    figma_analysis_document: "这是新增功能的设计分析。复用现有组件边界；新增内容是目标页面的结构与交互说明。",
    live_page_findings: "这是页面现场检查任务。获得目标页面后，应从视觉、交互和响应式表现记录可复现证据。",
    code_changes: classification.flags.bug
      ? "这是现有能力异常定位。复用已定位的行为入口和数据流；需要调整导致异常的渲染或状态逻辑。"
      : "这是新增页面功能。复用已定位的同类实现；新增内容以用户目标中的 UI 和交互为准。",
  };
  return judgmentsByOutput[classification.intent.desired_output]
    || "这是新增功能需求。当前没有可复用入口证据，需要先明确实际交付物。";
}

function stageFor(classification) {
  const output = classification.intent.desired_output;
  if (output === "automated_test") return "自动化测试";
  if (output === "implementation_plan" || output === "figma_analysis_document") return "方案设计";
  if (output === "live_page_findings") return classification.executionMode === "modify_and_verify" ? "修改代码" : "页面检查";
  if (output === "code_changes") return classification.executionMode === "modify_and_verify" ? "修改代码" : "定位问题";
  return classification.flags.bug ? "定位问题" : "方案设计";
}

function normalizeLegacyFact(item) {
  return {
    kind: item.kind || item.type || "evidence",
    ...item,
    status: item.status === "inference" ? "inference" : "fact",
  };
}

function sourceFactsFor(classification) {
  const legacy = classification.evidence
    .filter((item) => !TARGET_TYPES.has(item.type))
    .map(normalizeLegacyFact);
  const typed = classification.typedEvidence.filter((item) => SOURCE_FACT_KINDS.has(item.kind));
  return uniqueEntries([...legacy, ...typed], (item) => JSON.stringify(item));
}

function targetScopeFor(classification) {
  return classification.evidence
    .filter((item) => TARGET_TYPES.has(item.type))
    .map(normalizeLegacyFact);
}

function deliverableFor(classification) {
  return classification.intent.desired_output === "unknown" ? null : classification.originalRequest;
}

function pageCenterEntry(classification, resource) {
  if (resource.key) return resource.key;
  const attachmentId = resource.attachment
    || (/^attachment_[1-9]\d*$/.test(resource.source || "") ? resource.source : null);
  const attachment = classification.typedEvidence.find((item) =>
    item.kind === "attachment_reference" && item.attachment === attachmentId);
  const label = attachment?.label || attachmentId;
  if (label) return `${String(label).replace(/^图\s*/u, "图 ")} 的 Page Center 配置`;
  return "Page Center 配置";
}

function retrievalFor(classification, searchSuggestions) {
  const result = searchSuggestions
    .filter((item) => item.evidence !== "skill_index")
    .slice(0, 3)
    .map(({ knowledge, entry, purpose, source, evidence }) => ({
    knowledge, entry, purpose, source, evidence,
  }));
  const seenKnowledge = new Set(result.map((item) => item.knowledge));
  const seenEntries = new Set(result.map((item) => item.entry));
  const target = classification.evidence.find((item) => item.type === "target_file");
  const resourceKnowledge = classification.requiredKnowledge.find((item) => /资源/u.test(item));
  let resourceAdded = false;
  for (const knowledge of classification.requiredKnowledge) {
    if (result.length >= 3 || seenKnowledge.has(knowledge)) continue;
    const resource = classification.typedEvidence.find((item) =>
      ["resource_reference", "resource_reuse_candidate"].includes(item.kind)
      && item.status === "fact"
      && !resourceAdded
      && (!resourceKnowledge || knowledge === resourceKnowledge));
    const entry = resource
      ? (resource.provider === "Page Center"
        ? pageCenterEntry(classification, resource)
        : `${resource.provider ? `${resource.provider} ` : ""}${resource.resource}`)
      : target?.value;
    if (!entry || seenEntries.has(entry)) continue;
    result.push({
      knowledge,
      entry,
      purpose: resource?.provider === "Page Center"
        ? "确认目标模块资源"
        : resource ? `复用与${knowledge}相关的已有资源` : `定位${knowledge}的现有实现`,
      source: resource?.source || target?.source,
      evidence: "user_specified",
    });
    seenKnowledge.add(knowledge);
    seenEntries.add(entry);
    if (resource) resourceAdded = true;
  }
  for (const item of searchSuggestions.filter((entry) => entry.evidence === "skill_index")) {
    if (result.length >= 3 || seenKnowledge.has(item.knowledge) || seenEntries.has(item.entry)) continue;
    result.push({
      knowledge: item.knowledge,
      entry: item.entry,
      purpose: item.purpose,
      source: item.source,
      evidence: item.evidence,
    });
    seenKnowledge.add(item.knowledge);
    seenEntries.add(item.entry);
  }
  return result;
}

function verificationFor(classification) {
  const explicit = classification.typedEvidence
    .filter((item) => ASSERTION_KINDS.has(item.kind))
    .map(({ kind, description, source }) => ({ kind, description, source }));
  const hasKind = (kind) => explicit.some((item) => item.kind === kind);
  const facts = classification.typedEvidence.filter((item) => item.status === "fact");
  const generated = [];

  if (!hasKind("ui_assertion")) {
    const target = facts.find((item) => item.kind === "attachment_reference" && item.role === "target");
    const structures = facts.filter((item) => item.kind === "ui_structure").map((item) => item.name).filter(Boolean);
    if (target && structures.length) {
      generated.push({
        kind: "ui_assertion",
        description: `${target.label || target.attachment}目标 UI 的${structures.join("、")}被实现`,
        source: "derived_from_facts",
      });
    }
  }
  if (!hasKind("interaction_assertion")) {
    const interaction = facts.find((item) => item.kind === "interaction" && item.trigger && item.effect);
    if (interaction) generated.push({
      kind: "interaction_assertion",
      description: `${interaction.trigger}后${interaction.effect}`,
      source: "derived_from_facts",
    });
  }
  if (!hasKind("state_assertion")) {
    const progress = facts.find((item) => item.kind === "progress_semantics" && item.subject && item.meaning);
    if (progress) generated.push({
      kind: "state_assertion",
      description: `${progress.subject}能反映${progress.meaning}`,
      source: "derived_from_facts",
    });
  }
  if (!hasKind("resource_assertion")) {
    const resources = facts.filter((item) =>
      ["resource_reference", "resource_reuse_candidate"].includes(item.kind)
      && item.resource
      && item.provider
      && item.reusable !== false);
    const byProvider = new Map();
    for (const item of resources) {
      if (!byProvider.has(item.provider)) byProvider.set(item.provider, []);
      if (!byProvider.get(item.provider).includes(item.resource)) byProvider.get(item.provider).push(item.resource);
    }
    for (const [provider, names] of byProvider) generated.push({
      kind: "resource_assertion",
      description: `${names.join(" 和 ")}优先复用现有 ${provider} 资源`,
      source: "derived_from_facts",
    });
  }
  return uniqueEntries([...explicit, ...generated], (item) => `${item.kind}:${item.description}`);
}

export function buildTaskHandoff({ classification, ranking, boundaries, blockers, searchSuggestions = [], projectRoot = null }) {
  const stage = stageFor(classification);
  const judgment = engineeringJudgment(classification, searchSuggestions);
  return validateTaskHandoff({
    schema_version: TASK_HANDOFF_SCHEMA_VERSION,
    route: {
      skill: ranking.recommendedSkill || null,
      authorization: classification.executionMode === "modify_and_verify" ? "authorized" : "inspect_only",
    },
    workspace: {
      project_root: projectRoot,
      workdir: null,
    },
    workflow: {
      execution_mode: classification.executionMode,
      next_skill: classification.executionMode === "plan_then_execute"
        ? ranking.executionSkill || ranking.recommendedSkill || null
        : null,
      stage: {
        value: stage,
        source: "derived",
        status: "available",
      },
    },
    task: {
      source_request: classification.originalRequest,
      deliverable: deliverableFor(classification),
      reasoning: judgment,
    },
    knowledge_requirements: classification.requiredKnowledge.slice(0, 4),
    retrieval: retrievalFor(classification, searchSuggestions),
    target_scope: targetScopeFor(classification),
    source_facts: sourceFactsFor(classification),
    constraints: [...boundaries],
    blockers: [...blockers],
    verification: verificationFor(classification),
  });
}

export const buildExecutionPlan = buildTaskHandoff;

function addSection(lines, title, items, format = (item) => String(item)) {
  if (!items.length) return;
  if (lines.length) lines.push("");
  lines.push(title, ...items.map((item) => `- ${format(item)}`));
}

function knowledgeLabel(knowledge) {
  const label = knowledge === "积分阶段" ? "积分进度" : knowledge;
  if (/(?:轮播|切换|控制|行为)/u.test(label)) return `🔄 ${label}`;
  if (/(?:奖励|奖品|数据|状态)/u.test(label)) return `🎁 ${label}`;
  if (/(?:图片|资源|配置|渲染)/u.test(label)) return `🖼️ ${label}`;
  return label;
}

function blockingLine(item) {
  if (item?.kind === "skill_availability" && item.skill) return `缺少 ${item.skill} Skill，需先安装或启用`;
  if (item?.kind === "deliverable") return "你希望只定位问题，还是允许修改并验证？";
  return blockerDescription(item);
}

function attachmentLabel(item) {
  return String(item?.label || item?.attachment || "").replace(/^图\s*/u, "图 ");
}

export function addedContextFor(executionPlan) {
  const source = executionPlan.task?.source_request || "";
  const result = [];
  const attachments = (executionPlan.source_facts || [])
    .filter((item) => item.kind === "attachment_reference" && item.status === "fact");
  const targets = attachments.filter((item) => item.role === "target").map(attachmentLabel).filter(Boolean);
  const references = attachments.filter((item) => ["reference", "comparison"].includes(item.role))
    .map(attachmentLabel).filter(Boolean);
  if (targets.length) {
    const relation = [`${targets.join("、")}为目标图`];
    if (references.length) relation.push(`${references.join("、")}为参考图`);
    result.push(`图片关系：${relation.join("；")}`);
  }

  if (/(?:接口|api)/iu.test(source)
    && /(?:页面|界面|ui|展示|显示)/iu.test(source)
    && /(?:冲突|不一致|但|却)/u.test(source)) {
    result.push("冲突关系：接口返回与页面展示不一致");
  }
  return uniqueStrings(result).slice(0, 2);
}

function visibleRetrievalFor(executionPlan) {
  const targets = new Set((executionPlan.target_scope || []).map((item) => item.value).filter(Boolean));
  return (executionPlan.retrieval || []).filter((item) => {
    if (!item?.entry) return false;
    if (item.evidence === "user_specified" && (targets.has(item.entry) || item.source === "user_request")) return false;
    return true;
  }).slice(0, 3);
}

export function skipEnhancementFor(executionPlan) {
  const blocking = (executionPlan.blockers || []).some((item) => item?.blocking === true);
  const diagnosticJudgment = executionPlan.workflow?.stage?.value === "定位问题" && executionPlan.task?.reasoning;
  return !blocking && !diagnosticJudgment
    && addedContextFor(executionPlan).length === 0 && visibleRetrievalFor(executionPlan).length === 0;
}

export function buildExecutionPrompt(executionPlan) {
  validateTaskHandoff(executionPlan);
  const addedContext = addedContextFor(executionPlan);
  const retrieval = visibleRetrievalFor(executionPlan);
  const blocking = (executionPlan.blockers || []).filter((item) => item?.blocking === true).slice(0, 1);
  const stage = executionPlan.workflow?.stage;
  const executionMode = executionPlan.workflow?.execution_mode || "inspect_only";
  const lines = [];
  if (skipEnhancementFor(executionPlan)) {
    lines.push("当前需求已经明确，无需额外增强。");
  } else {
    addSection(lines, "🧩 已补充上下文", addedContext);
    if (executionPlan.task?.reasoning) {
      if (lines.length) lines.push("");
      lines.push("🧠 AI 判断", executionPlan.task.reasoning);
    }
  }
  if (retrieval.length) {
    lines.push(lines.length ? "" : null, "🔍 公司检索入口");
    for (const item of retrieval) {
      lines.push(`${knowledgeLabel(item.knowledge)}`);
      lines.push(`→ ${item.entry}（${item.purpose}）`);
    }
  }
  addSection(lines, "⚠️ 需要确认", blocking, blockingLine);
  const unavailableSkill = blocking.find((item) => item?.kind === "skill_availability")?.skill;
  lines.push(
    "",
    "▶ 下一步",
    `当前阶段：${stage?.status === "available" && stage.value ? stage.value : "方案设计"}`,
    `建议 Skill：${executionPlan.route?.skill
      ? `${executionPlan.route.skill}${executionMode === "modify_and_verify"
        ? "（修改并验证）"
        : executionMode === "plan_then_execute" ? "（方案完成后确认执行）"
          : stage?.value === "定位问题" ? "（只分析，不修改）" : ""}`
      : (unavailableSkill ? `${unavailableSkill}（需安装或启用）` : "暂不建议 Skill")}`,
  );
  return lines.filter((line) => line !== null).join("\n");
}

export function buildResult(classification, ranking, context, searchSuggestions, debug = null, projectRoot = null) {
  const boundaries = requestBoundaries(classification, context);
  const blockers = blockersFor(classification, context, ranking);
  const executionPlan = buildTaskHandoff({ classification, ranking, boundaries, blockers, searchSuggestions, projectRoot });
  const result = {
    original_request: executionPlan.task.source_request,
    task_goal: executionPlan.task.deliverable,
    engineering_judgment: executionPlan.task.reasoning,
    required_knowledge: classification.requiredKnowledge.slice(0, 4),
    retrieval_entries: [...executionPlan.retrieval],
    intent: classification.intent,
    evidence: [...executionPlan.target_scope, ...executionPlan.source_facts],
    recommended_skill: executionPlan.route.skill || "",
    alternative_skills: ranking.alternatives.slice(0, 2),
    selection_reason: ranking.reason,
    boundaries: [...executionPlan.constraints],
    stage: executionPlan.workflow.stage.value,
    execution_mode: classification.executionMode,
    unknowns: executionPlan.blockers.map(blockerDescription),
    added_context: addedContextFor(executionPlan),
    skipEnhancement: skipEnhancementFor(executionPlan),
    execution_plan: executionPlan,
    execution_prompt: "",
  };
  result.execution_prompt = buildExecutionPrompt(executionPlan);
  if (debug) result._debug = debug;
  return result;
}
