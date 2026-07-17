const MAX_CONTEXT_ITEMS = 8;
const MAX_NEED_KNOWLEDGE_ITEMS = 4;
const MAX_ASSUMPTIONS = 2;
const MAX_CONSTRAINTS = 5;
const MAX_OUTPUT_CONSTRAINTS = 2;
const MAX_REASONING_CHINESE_CHARACTERS = 100;
const MAX_GOAL_CHINESE_CHARACTERS = 50;
const MIN_SKILL_SCORE = 70;
const MIN_SKILL_MARGIN = 15;

function cleanedStrings(values, limit = Number.POSITIVE_INFINITY) {
  return [...new Set((values || [])
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.replace(/\s+/g, " ").trim()))]
    .slice(0, limit);
}

function cleanGoal(value) {
  return String(value || "")
    .replace(/^\s*\$ai-talk(?::ai-talk)?\s*/i, "")
    .trim();
}

function isChinese(result) {
  return /\p{Script=Han}/u.test(cleanGoal(result?.original_goal));
}

function truncateChinese(value, limit) {
  let count = 0;
  let output = "";
  for (const character of String(value || "")) {
    if (/\p{Script=Han}/u.test(character)) {
      if (count >= limit) break;
      count += 1;
    }
    output += character;
  }
  return output.trim();
}

function evidenceDetail(context) {
  return String(context?.value || "")
    .replace(/^(?:第[^：]{0,12}张图|第\s*\d+张图)：/, "")
    .replace(/^目标(?:文件|目录)：/, "")
    .trim();
}

function publicPath(value) {
  return String(value || "").trim();
}

function entityItems(result, type) {
  return (result?.entities?.[type] || []).filter((item) => item?.value && item?.source);
}

function entityValues(result, type) {
  return cleanedStrings(entityItems(result, type).map((item) => item.value), 12);
}

function entityLabels(result, type) {
  return cleanedStrings(entityItems(result, type).map((item) => item.label || item.value), 12);
}

function assignmentsFor(result) {
  const assignments = [];
  const addFrom = (value, source, kind = "config") => {
    const pattern = /\b([A-Za-z_$][\w$]*)\s*[:=：]\s*([A-Za-z0-9_.-]+)/g;
    for (const match of String(value || "").matchAll(pattern)) {
      assignments.push({ name: match[1], value: `${match[1]}=${match[2]}`, source, kind });
    }
  };
  addFrom(cleanGoal(result?.original_goal), "user_text");
  for (const context of result?.confirmed_context || []) {
    if (context?.type === "api_document") addFrom(context.value, context.source || "attachment", "api");
  }
  return assignments.filter((item, index) => assignments.findIndex((other) => other.value === item.value) === index);
}

function chineseInteger(value) {
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  const digits = { "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  let total = 0;
  let current = 0;
  for (const character of value) {
    if (character === "十") {
      total += (current || 1) * 10;
      current = 0;
    } else if (character === "百") {
      total += (current || 1) * 100;
      current = 0;
    } else if (Object.hasOwn(digits, character)) {
      current = digits[character];
    } else {
      return null;
    }
  }
  return total + current || null;
}

function rewardIndexFor(result) {
  const match = cleanGoal(result?.original_goal).match(/第([零一二两三四五六七八九十百\d]+)(?:个)?奖励/);
  return match ? chineseInteger(match[1]) : null;
}

function hasStateDisplayMismatch(result) {
  if (entityValues(result, "issue_symptom").includes("state-display-mismatch")) return true;
  const contexts = result?.confirmed_context || [];
  const hasApiState = contexts.some((item) => item?.type === "api_document" && /\b(?:state|status)\s*[:=]/i.test(item.value));
  const hasPageState = contexts.some((item) => ["screenshot", "visual_design"].includes(item?.type)
    && /已领取|未领取|claimed|unclaimed/i.test(item.value));
  return hasApiState && hasPageState;
}

function goalFor(result) {
  const original = cleanGoal(result?.original_goal).replace(/\s+/g, " ").trim();
  const chinese = isChinese(result);
  if (!original) return chinese ? "明确并完成本次任务。" : "Define and complete the task.";

  if (chinese) {
    const progressTask = assignmentsFor(result).find((item) => item.name === "PROGRESS_TASK_ID");
    if (progressTask && /积分阶段/.test(original) && /进度/.test(original) && /奖励/.test(original)) {
      const taskId = progressTask.value.split("=")[1];
      return `积分阶段接入任务 ${taskId}，复用现有方式展示进度和奖励。`;
    }
    const resource = entityItems(result, "asset_resource")[0]?.value;
    if (/(?:领奖后|奖励[^，。；;\n]{0,12}(?:领取|获取)(?:到)?(?:以后|后|时|的时候)|(?:领取|获取)(?:到)?奖励后)/.test(original) && /蒙层/.test(original)) {
      return `已领取状态增加${resource ? ` ${publicPath(resource)}` : ""} 蒙层。`;
    }
    const rewardIndex = rewardIndexFor(result);
    if (rewardIndex && /(?:没|未|没有|不)(?:显示|展示)/.test(original)) {
      const action = /修复|解决|改好/.test(original) ? "修复" : "定位";
      return `${action}第 ${rewardIndex} 个奖励展示异常。`;
    }
    if (hasStateDisplayMismatch(result)) {
      return "修复领取状态与页面表现不一致问题。";
    }
    if (entityValues(result, "business_object").includes("round-reward")
      && /(?:没|未|没有|不)(?:显示|展示)/.test(original)) {
      return "修复轮次奖励未显示问题。";
    }
    if (entityValues(result, "issue_symptom").includes("image-not-updated")) {
      return "修复目标图片未显示问题。";
    }
    if (result?.intent === "ui_inspection") return "检查页面视觉、交互与运行表现。";
    if (result?.intent === "automated_test") return "生成并运行目标页面自动化测试。";
    if (result?.intent === "planning") return "生成前端实施方案。";
    if (/^(?:开发|新增|创建|实现)(?:一个|一个新的|新的)?弹窗[。.!！]?$/.test(original)) return "开发弹窗。";
    if (/^为什么/.test(original)) {
      const problem = original.replace(/^为什么\s*/, "").replace(/没有显示|没显示/g, "未显示")
        .replace(/[？?。！!]+$/g, "").replace(/问题$/g, "");
      return `${result?.intent === "bug_fix" ? "修复" : "定位"}${problem}问题。`;
    }
    const sentences = original.match(/[^。！？!?]+[。！？!?]?/g)?.slice(0, 2).join("") || original;
    const bounded = truncateChinese(sentences.replace(/验收标准\s*[:：]\s*/g, ""), MAX_GOAL_CHINESE_CHARACTERS);
    return /[。！？]$/.test(bounded) ? bounded : `${bounded}。`;
  }

  const bounded = original.slice(0, 240).trim();
  return /[.!?]$/.test(bounded) ? bounded : `${bounded}.`;
}

const ENGLISH_VALUES = {
  dialog: "Dialog",
  button: "Button",
  "rank-list": "Rank list",
  "progress-track": "Progress display",
  reward: "Reward display",
  "reward-item": "Reward display",
  "reward-stage": "Reward stage",
  "round-reward": "Round reward display",
  claimed: "Claimed state",
  unclaimed: "Unclaimed state",
  completed: "Completed state",
  incomplete: "Incomplete state",
  locked: "Locked state",
  mask: "Overlay mask",
};

function contextItemsFor(result) {
  const chinese = isChinese(result);
  const goal = cleanGoal(result?.original_goal);
  const items = [];
  const add = (type, value, source) => {
    const cleaned = String(value || "").replace(/\s+/g, " ").trim();
    if (!cleaned || items.some((item) => item.type === type && item.value === cleaned)) return;
    items.push({ type, value: cleaned, source });
  };

  for (const context of result?.confirmed_context || []) {
    if (context?.type === "target_file") add("File", publicPath(evidenceDetail(context)), context.source);
    if (context?.type === "target_directory") add("File", evidenceDetail(context).replace(/^\.\//, ""), context.source);
  }
  for (const assignment of assignmentsFor(result)) {
    const type = /^[A-Z][A-Z0-9_]*$/.test(assignment.name) || /(?:ID|CONFIG|KEY)$/.test(assignment.name)
      ? "Config" : "Variable";
    add(type, assignment.value, assignment.source);
  }
  for (const item of entityItems(result, "api")) add("API", item.label || item.value, item.source);
  for (const item of [...entityItems(result, "component"), ...entityItems(result, "ui_component")]) {
    add("Component", chinese ? (item.label || item.value) : (ENGLISH_VALUES[item.value] || item.value), item.source);
  }
  for (const item of entityItems(result, "asset_resource")) add("Resource", publicPath(item.value), item.source);
  for (const item of entityItems(result, "config_or_symbol")) {
    if (!assignmentsFor(result).some((assignment) => assignment.name === item.value)) {
      add("Code Symbol", item.value, item.source);
    }
  }

  const businessObjects = entityValues(result, "business_object");
  const states = entityValues(result, "state");
  const hasReward = businessObjects.some((value) => ["reward", "reward-item", "reward-stage", "round-reward"].includes(value))
    || Boolean(rewardIndexFor(result));
  const progress = entityValues(result, "ui_component").includes("progress-track") || /进度|progress/i.test(goal);
  if (businessObjects.includes("reward-stage")) add("Business", chinese && /积分/.test(goal) ? "积分阶段" : (chinese ? "奖励阶段" : "Reward stage"), "semantic:business");
  if (businessObjects.includes("round-reward")) add("Business", chinese ? "轮次奖励" : "Round reward", "semantic:business");
  if (hasReward && progress) add("Business", chinese ? "进度与奖励展示" : "Progress and reward display", "semantic:business");
  else {
    if (hasReward) add("Business", chinese ? "奖励展示" : "Reward display", "semantic:business");
    if (progress) add("Business", chinese ? "进度展示" : "Progress display", "semantic:business");
  }
  if (rewardIndexFor(result)) {
    add("Business", chinese ? "奖励节点" : "Reward node", "semantic:ordinal");
  }
  if (states.some((value) => ["claimed", "unclaimed"].includes(value))) add("Business", chinese ? "领取状态" : "Claim state", "semantic:state");
  if (states.some((value) => ["completed", "incomplete"].includes(value))) add("Business", chinese ? "完成状态" : "Completion state", "semantic:state");
  if (businessObjects.includes("lottery")) add("Business", chinese ? "抽奖" : "Lottery", "semantic:business");
  if (businessObjects.includes("task")) add("Business", chinese ? "任务" : "Task", "semantic:business");
  if (entityValues(result, "visual_effect").includes("mask")) add("Component", chinese ? "蒙层" : "Overlay mask", "semantic:visual");

  return items.slice(0, MAX_CONTEXT_ITEMS);
}

function needKnowledgeFor(result) {
  const chinese = isChinese(result);
  const goal = cleanGoal(result?.original_goal);
  const needs = [];
  const add = (zh, en) => {
    const value = chinese ? zh : en;
    if (value && !needs.includes(value)) needs.push(value);
  };
  const objects = entityValues(result, "business_object");
  const components = entityValues(result, "ui_component");
  const symptoms = entityValues(result, "issue_symptom");
  const states = entityValues(result, "state");
  const hasReward = objects.some((value) => ["reward", "reward-item", "reward-stage", "round-reward"].includes(value))
    || Boolean(rewardIndexFor(result));
  const progressTask = assignmentsFor(result).find((item) => item.name === "PROGRESS_TASK_ID");

  if (progressTask) {
    const id = progressTask.value.split("=")[1];
    add(`确认任务 ${id} 的数据来源`, `Confirm the data source for task ${id}`);
    add("确认进度与奖励的渲染链路", "Confirm the progress and reward rendering flow");
    add("确认是否已有积分阶段实现", "Confirm whether a points-stage implementation already exists");
    add("确认进度与奖励的状态映射", "Confirm the progress and reward state mapping");
  } else if (rewardIndexFor(result)) {
    add("确认奖励数据来源", "Confirm the reward data source");
    add("确认奖励渲染链路", "Confirm the reward rendering flow");
    add("确认奖励节点与状态的映射", "Confirm the mapping between reward nodes and states");
    add("确认是否已有同类奖励实现", "Confirm whether a similar reward implementation exists");
  } else if (hasStateDisplayMismatch(result)) {
    const variable = assignmentsFor(result).find((item) => /^(?:state|status)$/i.test(item.name));
    add(`确认${variable ? variable.value : "状态值"}的业务定义`, `Confirm the business meaning of ${variable ? variable.value : "the state value"}`);
    add("确认状态到页面表现的映射", "Confirm the mapping from state to UI presentation");
    add("确认领取状态渲染链路", "Confirm the claimed state rendering flow");
  } else if (objects.includes("round-reward")) {
    add("确认轮次奖励的数据来源", "Confirm the round reward data source");
    add("确认轮次奖励的渲染链路", "Confirm the round reward rendering flow");
    add("确认轮次奖励的展示条件", "Confirm the round reward display conditions");
    add("确认是否已有同类奖励实现", "Confirm whether a similar reward implementation exists");
  } else if (hasReward && entityValues(result, "visual_effect").includes("mask")) {
    add("确认奖励领取状态的判断来源", "Confirm how the claimed state is determined");
    add("确认蒙层资源的引用方式", "Confirm how the overlay resource is referenced");
    add("确认奖励蒙层的渲染组件", "Confirm which component renders the reward overlay");
    add("确认是否已有同类蒙层实现", "Confirm whether a similar overlay implementation exists");
  } else if (components.includes("dialog")) {
    add("确认是否已有可复用弹窗组件", "Confirm whether a reusable dialog component exists");
    add("确认弹窗所属页面与触发入口", "Confirm the owning page and trigger entry");
    add("确认弹窗所需业务数据与交互", "Confirm the required business data and interaction");
  } else if (symptoms.includes("image-not-updated")) {
    add("确认图片数据来源", "Confirm the image data source");
    add("确认图片资源绑定与渲染条件", "Confirm the image binding and rendering conditions");
  } else if (hasReward) {
    add("确认奖励数据来源", "Confirm the reward data source");
    add("确认奖励渲染链路", "Confirm the reward rendering flow");
    if (states.length) add("确认奖励状态映射", "Confirm the reward state mapping");
  }

  for (const unknown of result?.unknowns || []) {
    if (/目标页面、目录或文件/.test(unknown)) add("确认目标页面、目录或文件", "Confirm the target page, directory, or file");
    if (/弹窗所属页面|弹窗触发入口/.test(unknown)) add("确认弹窗所属页面与触发入口", "Confirm the owning page and trigger entry");
    if (/期望交付物/.test(unknown)) add("确认最终交付物", "Confirm the final deliverable");
  }
  if (!needs.length && entityLabels(result, "component").length) {
    add("确认组件的数据输入与现有实现", "Confirm the component data inputs and existing implementation");
  }
  if (!needs.length && /(?:实现|开发|修改|修复|新增)/.test(goal)) {
    add("确认目标范围内的现有实现", "Confirm the existing implementation in the target scope");
  }
  return needs.slice(0, MAX_NEED_KNOWLEDGE_ITEMS);
}

function assumptionsFor(result) {
  const chinese = isChinese(result);
  const assumptions = [];
  const progressTask = assignmentsFor(result).find((item) => item.name === "PROGRESS_TASK_ID");
  if (progressTask && /一样|同样|复用|沿用|照(?:着|现有)/.test(cleanGoal(result?.original_goal))) {
    const id = progressTask.value.split("=")[1];
    assumptions.push(chinese ? `任务 ${id} 的对应关系以当前代码为准` : `Use the current code as the source of truth for task ${id} mappings`);
  }
  return assumptions.slice(0, MAX_ASSUMPTIONS);
}

function constraintsFor(result) {
  const chinese = isChinese(result);
  const constraints = [];
  const add = (zh, en = zh) => {
    const value = chinese ? zh : en;
    if (value && !constraints.includes(value)) constraints.push(value);
  };
  const reuse = /一样|同样|复用|沿用|照(?:着|现有)/.test(cleanGoal(result?.original_goal));
  const progressTask = assignmentsFor(result).some((item) => item.name === "PROGRESS_TASK_ID");
  if (reuse) add("优先复用已有实现", "Prefer the existing implementation");
  if (progressTask) add("保持其它阶段行为一致", "Keep other stage behavior unchanged");
  else if (["feature_modify", "bug_fix"].includes(result?.intent)) add("保持其它相关行为一致", "Keep other related behavior unchanged");
  if (reuse) add("不要新增数据结构", "Do not add a new data structure");

  const implementation = ["feature_create", "feature_modify", "bug_fix", "automated_test"].includes(result?.intent);
  if (implementation) add("不要修改无关模块", "Do not modify unrelated modules");

  for (const boundary of result?.boundaries || []) {
    if (/基于检索到的真实公司资料实施/.test(boundary)) add("以当前代码和真实公司资料为准", "Use current code and verified company sources as the source of truth");
    else if (/优先复用项目已有实现和组件/.test(boundary)) add("优先复用已有实现和组件", "Prefer existing implementations and components");
    else if (/不补充用户未确认的业务逻辑/.test(boundary)) add("不要引入用户未确认的业务逻辑", "Do not introduce unconfirmed business logic");
    else if (/修改范围限于/.test(boundary)) add(boundary.replace(/^修改范围限于/, "修改范围限于"), boundary);
    else add(boundary, boundary);
  }

  return constraints.slice(0, MAX_CONSTRAINTS);
}

const CHINESE_TERMS = Object.freeze({
  originalIntent: "用户原意",
  taskReasoning: "AI 推断",
  projectContext: "项目上下文",
  implementationConstraint: "实现约束",
  recommendedSkill: "建议 Skill",
});

const CHINESE_TASK_TYPES = {
  bug_fix: "问题修复",
  feature_create: "功能新增",
  feature_modify: "功能修改",
  ui_inspection: "页面检查",
  planning: "方案设计",
  automated_test: "自动化测试",
};

const CHINESE_BUSINESS_OBJECTS = {
  reward: "奖励",
  "reward-item": "奖励",
  "reward-stage": "奖励阶段",
  "round-reward": "轮次奖励",
  stage: "阶段",
  lottery: "抽奖",
  task: "任务",
};

const CHINESE_STATES = {
  claimed: "已领取状态",
  unclaimed: "未领取状态",
  completed: "已完成状态",
  incomplete: "未完成状态",
  locked: "锁定状态",
};

function pushUnique(items, value) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (cleaned && !items.includes(cleaned)) items.push(cleaned);
}

function chineseDevelopmentObjectsFor(result) {
  const objects = [];
  const goal = cleanGoal(result?.original_goal);
  for (const context of result?.confirmed_context || []) {
    if (["target_file", "target_directory"].includes(context?.type)) {
      pushUnique(objects, evidenceDetail(context));
    }
  }
  for (const item of entityItems(result, "component")) pushUnique(objects, item.value);
  const progressStage = entityValues(result, "business_object").includes("reward-stage") && /积分阶段/.test(goal);
  for (const item of entityItems(result, "ui_component")) {
    if (!(progressStage && item.value === "progress-track")) pushUnique(objects, item.label || item.value);
  }
  for (const assignment of assignmentsFor(result).filter((item) => item.kind === "config")) {
    pushUnique(objects, assignment.value);
  }
  const assignedNames = new Set(assignmentsFor(result).map((item) => item.name));
  for (const item of entityItems(result, "config_or_symbol")) {
    if (!assignedNames.has(item.value)) pushUnique(objects, item.value);
  }
  for (const item of entityItems(result, "api")) pushUnique(objects, item.value);
  for (const value of entityValues(result, "business_object")) {
    if (value === "reward-stage" && progressStage) pushUnique(objects, "积分阶段");
    else pushUnique(objects, CHINESE_BUSINESS_OBJECTS[value]);
  }
  const rewardIndex = rewardIndexFor(result);
  if (rewardIndex) pushUnique(objects, `第 ${rewardIndex} 个奖励`);
  return objects.slice(0, MAX_CONTEXT_ITEMS);
}

function chineseStatesFor(result) {
  return cleanedStrings(entityValues(result, "state").map((value) => CHINESE_STATES[value]), 4);
}

function chineseVisualEffectsFor(result) {
  const effects = [];
  if (entityValues(result, "visual_effect").includes("mask")) pushUnique(effects, "蒙层");
  return effects;
}

function chineseResourcesFor(result) {
  return cleanedStrings(entityItems(result, "asset_resource").map((item) => publicPath(item.value)), 4);
}

function chineseApiFieldsFor(result) {
  return cleanedStrings(assignmentsFor(result).filter((item) => item.kind === "api").map((item) => item.value), 4);
}

function chineseRelationsFor(result) {
  const relations = [];
  const objects = entityValues(result, "business_object");
  const symptoms = entityValues(result, "issue_symptom");
  const progressTask = assignmentsFor(result).find((item) => item.name === "PROGRESS_TASK_ID");
  const resource = chineseResourcesFor(result)[0];
  if (progressTask && /积分阶段/.test(cleanGoal(result?.original_goal))) {
    pushUnique(relations, `任务 ${progressTask.value.split("=")[1]} 数据 → 积分阶段进度与奖励展示`);
  } else if (entityValues(result, "visual_effect").includes("mask")) {
    pushUnique(relations, `已领取状态 → 奖励${resource ? `使用 ${resource} ` : ""}展示蒙层`);
  } else if (hasStateDisplayMismatch(result)) {
    const field = assignmentsFor(result).find((item) => /^(?:state|status)$/i.test(item.name));
    pushUnique(relations, `${field?.value || "奖励状态"} → 页面领取状态展示`);
  } else if (rewardIndexFor(result)) {
    pushUnique(relations, `第 ${rewardIndexFor(result)} 个奖励数据 → 奖励展示`);
  } else if (objects.includes("round-reward")) {
    pushUnique(relations, "轮次奖励数据 → 轮次奖励展示");
  } else if (symptoms.includes("image-not-updated")) {
    const symbol = entityValues(result, "config_or_symbol")[0];
    pushUnique(relations, `${symbol || "图片数据"} → 图片展示`);
  }
  return relations.slice(0, 3);
}

function chineseRetrievalSemanticsFor(result) {
  const semantics = [];
  const objects = entityValues(result, "business_object");
  const components = entityValues(result, "ui_component");
  const symptoms = entityValues(result, "issue_symptom");
  const states = entityValues(result, "state");
  const progressTask = assignmentsFor(result).some((item) => item.name === "PROGRESS_TASK_ID");
  const hasReward = objects.some((value) => ["reward", "reward-item", "reward-stage", "round-reward"].includes(value))
    || Boolean(rewardIndexFor(result));

  if (progressTask && /积分阶段/.test(cleanGoal(result?.original_goal))) {
    pushUnique(semantics, "积分阶段任务关联");
    pushUnique(semantics, "进度展示逻辑");
    pushUnique(semantics, "奖励展示逻辑");
  } else if (objects.includes("round-reward")) {
    pushUnique(semantics, "轮次奖励展示条件");
    pushUnique(semantics, "奖励状态映射");
    pushUnique(semantics, "当前项目同类实现");
  } else if (hasStateDisplayMismatch(result)) {
    pushUnique(semantics, "奖励状态映射");
    pushUnique(semantics, "奖励展示条件");
    pushUnique(semantics, "当前项目同类实现");
  } else if (hasReward && entityValues(result, "visual_effect").includes("mask")) {
    pushUnique(semantics, "奖励状态映射");
    pushUnique(semantics, "蒙层展示逻辑");
    pushUnique(semantics, "当前项目同类实现");
  } else if (hasReward) {
    pushUnique(semantics, "奖励状态映射");
    pushUnique(semantics, "奖励展示条件");
    pushUnique(semantics, "当前项目同类实现");
  } else if (components.includes("progress-track")) {
    pushUnique(semantics, "进度展示逻辑");
    pushUnique(semantics, "进度状态映射");
    pushUnique(semantics, "当前项目同类实现");
  } else if (components.includes("dialog")) {
    pushUnique(semantics, "弹窗组件复用");
    pushUnique(semantics, "弹窗触发逻辑");
    pushUnique(semantics, "弹窗交互逻辑");
  } else if (symptoms.includes("image-not-updated")) {
    pushUnique(semantics, "图片资源绑定");
    pushUnique(semantics, "图片展示条件");
    pushUnique(semantics, "当前项目同类实现");
  } else if (states.length) {
    pushUnique(semantics, "状态映射");
    pushUnique(semantics, "展示条件");
    pushUnique(semantics, "当前项目同类实现");
  }
  return semantics.slice(0, 3);
}

function chineseConstraintsFor(result) {
  const constraints = [];
  const goal = cleanGoal(result?.original_goal);
  const progressTask = assignmentsFor(result).some((item) => item.name === "PROGRESS_TASK_ID");
  if (progressTask && /积分阶段/.test(goal)) {
    pushUnique(constraints, "复用现有展示方式");
    pushUnique(constraints, "不影响其他阶段");
  } else {
    if (/一样|同样|复用|沿用|照(?:着|现有)/.test(goal)) pushUnique(constraints, "复用现有实现");
    if (["feature_modify", "bug_fix"].includes(result?.intent)) pushUnique(constraints, "不影响其他相关功能");
    if (entityValues(result, "visual_effect").includes("mask")) pushUnique(constraints, "不影响未领取状态");
  }
  const targetBoundary = (result?.boundaries || []).find((item) => /修改范围限于/.test(item));
  if (targetBoundary && !(progressTask && /积分阶段/.test(goal))) pushUnique(constraints, targetBoundary);
  if (!constraints.length && ["feature_create", "feature_modify", "bug_fix", "automated_test"].includes(result?.intent)) {
    pushUnique(constraints, "不修改无关模块");
  }
  return constraints.slice(0, 3);
}

const DEFAULT_RULE_SOURCE_LABELS = {
  universal: "通用",
  intent: "任务",
  project: "项目",
};

const PROJECT_CONTEXT_LABELS = {
  target_file: "目标文件",
  target_directory: "目标目录",
  project_rule: "项目规则",
  direct_dependency: "直接依赖",
  asset_resource: "资源",
  api: "接口",
  api_document: "接口资料",
  screenshot: "截图",
  visual_design: "视觉稿",
  interaction_flow: "交互流程",
  selected_code: "选中代码",
};

function fallbackDefaultRulesFor(result) {
  const rules = [];
  const add = (value, source) => {
    if (value && !rules.some((item) => item.value === value)) rules.push({ value, source });
  };
  add("不引入用户未确认的业务逻辑", "universal");
  if (["feature_create", "feature_modify", "bug_fix", "automated_test"].includes(result?.intent)) {
    add("修改范围限于当前任务相关模块", "universal");
  }
  const intentRule = {
    feature_create: "优先复用项目已有实现和组件",
    feature_modify: "保持未涉及功能的现有行为不变",
    bug_fix: "先确认根因，再进行最小范围修复",
    ui_inspection: "保持只读，只报告实际页面证据支持的问题",
    planning: "基于真实项目上下文说明关键假设",
    automated_test: "测试应可重复运行且不改变生产行为",
  }[result?.intent];
  if (intentRule) add(intentRule, "intent");
  return rules;
}

function defaultRulesFor(result) {
  const rules = Array.isArray(result?.default_rules) && result.default_rules.length
    ? result.default_rules : fallbackDefaultRulesFor(result);
  return rules.filter((item) => item?.value && DEFAULT_RULE_SOURCE_LABELS[item.source]).slice(0, 5);
}

function taskSpecificReasoningFor(result) {
  if (!isChinese(result)) return "";

  const goal = cleanGoal(result?.original_goal);
  const objects = entityValues(result, "business_object");
  const states = entityValues(result, "state");
  const components = entityValues(result, "ui_component");
  const hasReward = objects.some((value) => ["reward", "reward-item", "reward-stage", "round-reward"].includes(value))
    || Boolean(rewardIndexFor(result));
  let reasoning = "";

  const resource = entityItems(result, "asset_resource")[0]?.value;
  if (hasReward
    && states.includes("claimed")
    && entityValues(result, "visual_effect").includes("mask")
    && resource) {
    reasoning = `用户描述了奖励领取后的蒙层变化并提供 ${publicPath(resource)}，因此本次更可能是已有奖励节点的领取态视觉扩展，而不是新增奖励组件。优先确认领取状态判断与 ${publicPath(resource)} 的引用方式。`;
  } else if (rewardIndexFor(result) && /(?:没|未|没有|不)(?:显示|展示)/.test(goal)) {
    const index = rewardIndexFor(result);
    reasoning = `仅第 ${index} 个奖励未显示，更可能是单个节点的数据、状态或渲染条件异常，而不是整个奖励模块失效。优先确认该节点的数据、状态和渲染条件。`;
  } else if (hasStateDisplayMismatch(result)) {
    const assignment = assignmentsFor(result).find((item) => /^(?:state|status)$/i.test(item.name));
    const stateEvidence = assignment?.value || "状态值";
    reasoning = `${stateEvidence} 与页面领取表现冲突，应优先确认 ${assignment?.name || "状态"} 到领取样式的映射；当前证据不足以判断哪一方语义正确。`;
  } else if (components.includes("dialog")
    && result?.intent === "feature_create"
    && /^(?:开发|新增|创建|实现)(?:一个|一个新的|新的)?弹窗[。.!！]?$/.test(goal)) {
    reasoning = "用户只明确要开发弹窗，这是新增 UI 需求，但具体业务和交互尚不明确；应优先查找项目已有弹窗实现，再决定是否新增局部组件。";
  } else {
    const contexts = projectContextFor(result);
    const hasVisualEvidence = contexts.some((item) => ["screenshot", "visual_design"].includes(item?.type));
    const hasApiEvidence = contexts.some((item) => item?.type === "api_document");
    if (hasVisualEvidence && !hasApiEvidence && /(?:先|仅|只).{0,6}(?:开发|完成|实现|还原).{0,4}(?:静态)?\s*UI/i.test(goal)) {
      reasoning = "当前资料以视觉信息为主且目标是先完成 UI，因此更可能是静态界面实现。优先确认现有页面结构与资源引用，数据接入需从现有代码确认。";
    }
  }

  return [...reasoning.matchAll(/\p{Script=Han}/gu)].length <= MAX_REASONING_CHINESE_CHARACTERS ? reasoning : "";
}

function implementationConstraintsFor(result) {
  const constraints = [];
  const add = (value) => pushUnique(constraints, value);
  const exactScope = (result?.boundaries || []).find((item) => /修改范围限于/.test(item));
  if (exactScope) add(exactScope);

  const rules = defaultRulesFor(result);
  for (const rule of rules.filter((item) => item.source === "project")) add(rule.value);
  for (const rule of rules.filter((item) => item.source === "universal")) add(rule.value);
  for (const rule of rules.filter((item) => item.source === "intent")) add(rule.value);
  return constraints.slice(0, MAX_OUTPUT_CONSTRAINTS);
}

function fallbackProjectContextFor(result) {
  const contexts = [];
  const add = (type, value, source) => {
    const cleaned = evidenceDetail({ value });
    if (cleaned && !contexts.some((item) => item.type === type && item.value === cleaned)) contexts.push({ type, value: cleaned, source });
  };
  for (const item of result?.confirmed_context || []) {
    if (PROJECT_CONTEXT_LABELS[item?.type]) add(item.type, item.value, item.source);
  }
  for (const item of entityItems(result, "asset_resource")) add("asset_resource", item.value, item.source);
  for (const item of entityItems(result, "api")) add("api", item.value, item.source);
  return contexts.slice(0, 16);
}

function projectContextFor(result) {
  return Array.isArray(result?.project_context) && result.project_context.length
    ? result.project_context : fallbackProjectContextFor(result);
}

function displayProjectContext(item) {
  const label = PROJECT_CONTEXT_LABELS[item?.type];
  if (!label) return "";
  if (["screenshot", "visual_design", "interaction_flow", "selected_code"].includes(item.type)) {
    return `${label}：已提供（${item.source}）`;
  }
  return `${label}：${item.value}`;
}

function skillHandoffFor(result, chineseProtocol, nextSkill) {
  const unresolved = cleanedStrings((result?.unknowns || []).map((item) => typeof item === "string" ? item : item?.reason), 4);
  return {
    execution_focus: chineseProtocol.relations[0] || chineseProtocol.executionGoal.replace(/[。.!！]+$/g, ""),
    unresolved,
    retrieval_semantics: chineseProtocol.retrievalSemantics,
    recommended_skill: nextSkill,
  };
}

function buildChineseProtocol(result, nextSkill) {
  const protocol = {
    taskType: CHINESE_TASK_TYPES[result?.intent] || "",
    originalIntent: cleanGoal(result?.original_goal),
    executionGoal: result?.execution_goal || goalFor(result),
    goal: result?.execution_goal || goalFor(result),
    developmentObjects: chineseDevelopmentObjectsFor(result),
    states: chineseStatesFor(result),
    visualEffects: chineseVisualEffectsFor(result),
    resources: chineseResourcesFor(result),
    configVariables: assignmentsFor(result).filter((item) => item.kind === "config").map((item) => item.value),
    apiFields: chineseApiFieldsFor(result),
    relations: chineseRelationsFor(result),
    retrievalSemantics: chineseRetrievalSemanticsFor(result),
    constraints: chineseConstraintsFor(result),
    defaultRules: defaultRulesFor(result),
    taskReasoning: taskSpecificReasoningFor(result),
    implementationConstraints: implementationConstraintsFor(result),
    projectContext: projectContextFor(result),
    nextSkill,
  };
  protocol.skillHandoff = skillHandoffFor(result, protocol, nextSkill);
  return protocol;
}

function hasExplicitSkillMode(skill, goal) {
  const text = goal.toLowerCase();
  if (skill === "ui-self-check") {
    return /(?:打开|检查|查看|看看|自测|巡检|验证)[^，。；;\n]{0,16}(?:页面|浏览器|视觉|交互|响应式|控制台|网络)|(?:页面|浏览器|视觉|交互)[^，。；;\n]{0,16}(?:检查|自测|巡检|验证)/i.test(text);
  }
  if (skill === "ai-test") return /midscene|自动化测试|测试用例|测试文件|(?:生成|编写|写|运行|执行|跑).{0,8}测试/i.test(text);
  if (skill === "gen-frontend-plan") return /(?:生成|编写|输出|制定|给出).{0,10}(?:前端)?(?:方案|计划)|docs\/plan/i.test(text);
  if (skill === "gen-code") return /生成代码|修改代码|直接实现|PROGRESS_TASK_ID\s*[:=：]\s*\d+[^。\n]{0,48}(?:展示|显示)(?:进度|奖励)|(?:开发|实现|修改|修复|新增|改造|调整|编写).{0,64}(?:页面|活动页|组件|弹窗|列表|代码|逻辑|功能|蒙层|ui)|(?:页面|活动页|组件|弹窗|列表|代码|逻辑|功能|ui).{0,24}(?:开发|实现|修改|修复|新增|改造|调整)/i.test(text);
  if (skill === "figma-analyze") return /(?:分析|梳理).{0,12}figma|figma.{0,12}(?:分析|文档)/i.test(text);
  if (skill === "figma-to-ui-meta") return /figma.{0,16}(?:ui-meta|mercury|转换)|(?:ui-meta|mercury).{0,16}figma/i.test(text);
  if (skill === "gen-page-center-config") return /page-?center.{0,16}(?:配置|推送)|(?:生成|修改|推送).{0,12}配置/i.test(text);
  if (skill === "custom-components-skill") return /(?:开发|生成|新增|实现).{0,12}(?:活动积木|积木组件)|ui.?meta.{0,12}(?:积木|组件)/i.test(text);
  if (skill === "ui2-upgrade-guide") return /ui2.{0,12}(?:升级|迁移)|(?:升级|迁移).{0,12}ui2/i.test(text);
  if (skill === "gen-service") return /(?:生成|新增|实现).{0,12}(?:service|接口服务)|openapi.{0,12}service/i.test(text);
  return text.includes(`$${skill.toLowerCase()}`) || text.includes(`调用 ${skill.toLowerCase()}`);
}

function nextSkillFor(result) {
  const recommendation = result?.routing?.recommendation;
  if (!recommendation || recommendation.name !== result?.recommended_skill) return null;
  if (!Number.isFinite(recommendation.score) || recommendation.score < MIN_SKILL_SCORE) return null;
  if (result?.routing?.retrieval_profile?.desired_output === "unknown") return null;
  const nextScore = Math.max(0, ...(result?.routing?.alternatives || []).map((item) => item?.score || 0));
  if (recommendation.score - nextScore < MIN_SKILL_MARGIN) return null;
  if (!hasExplicitSkillMode(recommendation.name, cleanGoal(result?.original_goal))) return null;
  return recommendation.name;
}

export function buildExecutionProtocol(result) {
  const protocol = {
    goal: goalFor(result),
    context: contextItemsFor(result),
    needKnowledge: needKnowledgeFor(result),
    assumptions: assumptionsFor(result),
    constraints: constraintsFor(result),
    nextSkill: nextSkillFor(result),
  };
  if (!isChinese(result)) {
    return {
      ...protocol,
      executionGoal: protocol.goal,
      skillHandoff: {
        execution_focus: protocol.goal.replace(/[.!]+$/g, ""),
        unresolved: cleanedStrings((result?.unknowns || []).map((item) => typeof item === "string" ? item : item?.reason), 4),
        retrieval_semantics: [],
        recommended_skill: protocol.nextSkill,
      },
    };
  }
  const chinese = buildChineseProtocol(result, protocol.nextSkill);
  return { ...protocol, ...chinese, executionGoal: chinese.executionGoal };
}

function section(heading, items) {
  return items.length ? `${heading}\n${items.join("\n")}` : "";
}

function render(protocol) {
  const context = protocol.context.flatMap((item) => [item.type, item.value]);
  return [
    section("Goal", [protocol.goal]),
    section("Context", context),
    section("Need Knowledge", protocol.needKnowledge),
    section("Assumptions", protocol.assumptions),
    section("Constraints", protocol.constraints),
    protocol.nextSkill ? section("Next Skill", [protocol.nextSkill]) : "",
  ].filter(Boolean).join("\n\n");
}

function chineseSection(heading, items, { bullets = true } = {}) {
  const values = cleanedStrings(items);
  if (!values.length) return "";
  return `${heading}：\n${values.map((item) => bullets ? `- ${item}` : item).join("\n")}`;
}

function renderChinese(protocol) {
  const context = protocol.projectContext.map(displayProjectContext).filter(Boolean);
  return [
    chineseSection(CHINESE_TERMS.originalIntent, [protocol.originalIntent], { bullets: false }),
    chineseSection(CHINESE_TERMS.taskReasoning, [protocol.taskReasoning], { bullets: false }),
    chineseSection(CHINESE_TERMS.projectContext, context),
    chineseSection(CHINESE_TERMS.implementationConstraint, protocol.implementationConstraints),
    protocol.skillHandoff.recommended_skill
      ? chineseSection(CHINESE_TERMS.recommendedSkill, [protocol.skillHandoff.recommended_skill], { bullets: false })
      : "",
  ].filter(Boolean).join("\n\n");
}

export function formatUserOutput(result) {
  const protocol = buildExecutionProtocol(result);
  return isChinese(result) ? renderChinese(protocol) : render(protocol);
}
