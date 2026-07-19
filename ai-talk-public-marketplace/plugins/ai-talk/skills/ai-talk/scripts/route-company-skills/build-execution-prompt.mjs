function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).replace(/\s+/g, " ").trim()))];
}

function requestBoundaries(classification, context) {
  const explicit = [...classification.originalRequest.matchAll(/(?:不要|不需要|无需|禁止|仅|只|不(?=修改|修复|生成|改))([^，。；;\n]{1,36})/g)]
    .map((match) => match[0].replace(/[。；;]+$/g, ""));
  if (classification.executionMode === "analysis_only") return uniqueStrings(["只定位问题，不修改代码", ...explicit]).slice(0, 2);
  if (explicit.length) return uniqueStrings(explicit).slice(0, 2);

  const targets = context.items.filter((item) => item.type === "target_file").map((item) => item.value);
  if (classification.intent.desired_output === "implementation_plan") return ["只输出方案，不修改代码"];
  if (classification.executionMode === "inspect_fix_verify") return ["按浏览器检查、修复、复验三个阶段执行"];
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

function unknownsFor(classification, context, ranking) {
  const unknowns = [...context.unresolved];
  const output = classification.intent.desired_output;
  const hasTarget = classification.evidence.some((item) => ["target_file", "target_page", "component"].includes(item.type));
  if (output === "unknown") unknowns.push("期望交付物尚未明确。");
  if (["code_changes", "automated_test", "live_page_findings"].includes(output) && !hasTarget) {
    unknowns.push("目标页面、组件或文件尚未明确；若可从当前会话确定，则无需追问。");
  }
  if (!ranking.recommendedSkill && ranking.expectedSkill) {
    unknowns.push(`请先安装或启用 ${ranking.expectedSkill}，或通过 --source-root <label=path> 提供包含该 Skill 的目录。`);
  }
  return uniqueStrings(unknowns).slice(0, 5);
}

function engineeringJudgment(classification, retrievalEntries) {
  const hasDialogSystem = retrievalEntries.some((item) => ["弹窗模板结构", "弹窗打开与关闭方式"].includes(item.knowledge));
  const judgments = {
    dialog_auto_open: hasDialogSystem
      ? "这是新增 UI，但项目已有弹窗体系，应优先复用现有弹窗结构、状态管理和页面初始化方式，不重新设计新的弹窗机制。"
      : "这是新增 UI 并要求首次进入页面时打开，应先确认项目的弹窗结构、状态管理和页面初始化约定，再进入修改。",
    dialog_change: hasDialogSystem
      ? "这是弹窗 UI 变更，项目已有可检索的弹窗体系，应先沿现有结构和调用方式确认接入点。"
      : "这是弹窗 UI 变更，需要先确认项目现有的弹窗结构和页面接入方式。",
    reward_metadata_missing: "奖励名称和角标同时缺失，问题跨越抽奖接口、数据适配和弹窗渲染三层，应沿现有数据链定位，不先假定字段含义。",
    dynamic_component_registration: "这是动态组件注册链路异常，应依次核对动态名称生成、注册映射和真实组件名称，避免被无关组件依赖干扰。",
    reward_claim_visual: "这是奖励领取态的视觉增强，需要先确认现有领取状态判断、icon/mask 资源和奖励节点渲染位置，不猜测状态字段含义。",
    copy_change: "这是明确文件内的文案修改，目标和范围已确定，无需扩展到组件依赖或通用规范。",
  };
  if (judgments[classification.taskType]) return judgments[classification.taskType];
  const target = classification.evidence.find((item) => item.type === "target_file")?.value;
  if (target) return `任务已明确指向 ${target}，应围绕该文件的目标行为确认必要知识，不扩展为仓库级扫描。`;
  return `当前任务要求“${classification.taskGoal.replace(/。$/, "")}”，应先确认与该目标直接相关的行为入口，再决定执行范围。`;
}

function stageFor(classification) {
  const output = classification.intent.desired_output;
  if (output === "automated_test") return "自动化测试";
  if (output === "implementation_plan" || output === "figma_analysis_document") return "方案设计";
  if (output === "live_page_findings") return classification.executionMode === "inspect_fix_verify" ? "页面检查 -> 修复 -> 复验" : "页面检查";
  if (output === "code_changes") return classification.executionMode === "analysis_only" ? "定位问题" : "修改代码";
  return classification.flags.bug ? "定位问题" : "方案设计";
}

function skillLine(ranking, classification) {
  if (!ranking.recommendedSkill) return ranking.expectedSkill
    ? `未找到 ${ranking.expectedSkill}（需安装或启用）`
    : "暂不建议 Skill";
  const mode = {
    "gen-code": classification.executionMode === "analysis_only" ? "分析定位，不修改" : "修改并验证",
    "ui-self-check": classification.executionMode === "inspect_fix_verify" ? "检查、修复并复验" : "只检查并报告",
    "ai-test": "生成并运行",
    "gen-frontend-plan": "设计方案",
    "figma-analyze": "分析并输出文档",
  }[ranking.recommendedSkill] || "按职责执行";
  return `${ranking.recommendedSkill}（${mode}）`;
}

export function buildExecutionPrompt({ classification, ranking, searchSuggestions, boundaries, unknowns }) {
  const judgment = engineeringJudgment(classification, searchSuggestions);
  const knowledge = classification.requiredKnowledge.slice(0, 4);
  const evidence = classification.evidence.map((item) => `${item.type} | ${item.value} | ${item.source}`);
  return [
    "任务目标：",
    classification.taskGoal,
    "",
    "原始请求：",
    classification.originalRequest,
    "",
    "AI 判断：",
    judgment,
    "",
    "已确认信息：",
    ...(evidence.length ? evidence.map((item) => `- ${item}`) : ["- 暂无用户提供的事实项"]),
    "",
    "所需知识：",
    ...(knowledge.length ? knowledge.map((item) => `- ${item}`) : ["- 暂无需要扩展的知识项"]),
    "",
    "推荐检索：",
    ...(searchSuggestions.length
      ? searchSuggestions.slice(0, 5).map((item) => `- ${item.entry}：${item.purpose}`)
      : ["- 暂无已确认的真实检索入口"]),
    "",
    "边界：",
    ...boundaries.slice(0, 2).map((item) => `- ${item}`),
    "",
    "当前阶段：",
    stageFor(classification),
    "",
    "执行模式：",
    classification.executionMode,
    "",
    "建议 Skill：",
    skillLine(ranking, classification),
    "",
    "选择依据：",
    ranking.reason,
    "",
    "未确认项：",
    ...(unknowns.length ? unknowns.map((item) => `- ${item}`) : ["- 无"]),
  ].join("\n");
}

export function buildResult(classification, ranking, context, searchSuggestions, debug = null) {
  const boundaries = requestBoundaries(classification, context);
  const unknowns = unknownsFor(classification, context, ranking);
  const result = {
    original_request: classification.originalRequest,
    task_goal: classification.taskGoal,
    engineering_judgment: engineeringJudgment(classification, searchSuggestions),
    required_knowledge: classification.requiredKnowledge.slice(0, 4),
    retrieval_entries: searchSuggestions.slice(0, 5).map(({ knowledge, entry, purpose }) => ({ knowledge, entry, purpose })),
    intent: classification.intent,
    evidence: classification.evidence,
    recommended_skill: ranking.recommendedSkill,
    alternative_skills: ranking.alternatives.slice(0, 2),
    selection_reason: ranking.reason,
    boundaries,
    stage: stageFor(classification),
    execution_mode: classification.executionMode,
    unknowns,
    execution_prompt: "",
  };
  result.execution_prompt = buildExecutionPrompt({ classification, ranking, searchSuggestions, boundaries, unknowns });
  if (debug) result._debug = debug;
  return result;
}
