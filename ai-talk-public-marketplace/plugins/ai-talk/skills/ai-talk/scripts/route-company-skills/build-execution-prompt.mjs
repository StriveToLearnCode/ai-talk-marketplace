function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).replace(/\s+/g, " ").trim()))];
}

function requestBoundaries(classification, context) {
  const boundaries = [];
  const add = (value) => {
    if (value && !boundaries.includes(value)) boundaries.push(value);
  };
  const output = classification.intent.desired_output;
  if (classification.flags.analysisOnly) add("只分析和定位原因，不修改代码。");
  if (output === "live_page_findings") add("不生成自动化测试文件。");
  if (output === "implementation_plan") add("只输出实施方案，不修改代码。");
  const targets = context.items.filter((item) => item.type === "target_file").map((item) => item.value);
  if (targets.length) add(`范围限于 ${targets.join("、")} 及必要的直接依赖。`);
  for (const match of classification.originalRequest.matchAll(/(?:不要|不需要|无需|禁止|仅|只)([^，。；;\n]{1,36})/g)) add(`${match[0]}。`);
  return boundaries.slice(0, 5);
}

function unknownsFor(classification, context, ranking) {
  const unknowns = [...context.unresolved];
  const output = classification.intent.desired_output;
  const hasTarget = classification.evidence.some((item) => ["target_file", "target_page", "component"].includes(item.type));
  if (output === "unknown") unknowns.push("期望交付物尚未明确。");
  if (["code_changes", "automated_test", "live_page_findings"].includes(output) && !hasTarget) unknowns.push("目标页面、组件或文件尚未明确；若可从当前会话确定，则无需追问。");
  if (!ranking.recommendedSkill && ranking.expectedSkill) {
    unknowns.push(`请先安装或启用 ${ranking.expectedSkill}，或通过 --source-root <label=path> 提供包含该 Skill 的目录。`);
  }
  return uniqueStrings(unknowns).slice(0, 5);
}

function requirementsFor(skill, expectedSkill, searchSuggestions) {
  if (!skill && expectedSkill) {
    return [
      `当前索引未发现完成该目标所需的 ${expectedSkill}；不要改用其他职责的 Skill。`,
      `先安装或启用 ${expectedSkill}，或通过 --source-root <label=path> 提供包含该 Skill 的目录，再重新运行路由。`,
    ];
  }
  const requirements = {
    "ui-self-check": ["打开目标页面，检查视觉、交互、响应式、控制台和网络请求。", "输出可复现的问题与检查结论，不创建自动化测试文件。"],
    "ai-test": ["按项目现有约定生成或运行 Midscene 自动化测试。", "覆盖用户要求的关键路径，并报告运行结果。"],
    "gen-code": ["先确认目标代码和根因，再做最小范围实现或修复。", "遵守最近的 AGENTS.md，并运行与改动直接相关的验证。"],
    "gen-frontend-plan": ["基于真实项目上下文输出可执行的实施步骤。", "明确涉及文件、数据流和验证方式，但不修改代码。"],
    "figma-analyze": ["分析 Figma 的页面结构、组件、状态和交互。", "输出分析文档，不进入代码实现。"],
  }[skill] || ["先确认目标产物，再选择并执行匹配的 Skill。"];
  if (searchSuggestions.length) requirements.push(`优先检索：${searchSuggestions.join("；")}。`);
  return requirements;
}

function contextLines(classification, context) {
  const lines = classification.evidence.map((item) => `${item.type}：${item.value}`);
  for (const item of context.items) lines.push(`${item.type}：${item.value}`);
  return uniqueStrings(lines);
}

export function buildExecutionPrompt({ classification, ranking, context, searchSuggestions, boundaries, unknowns }) {
  const confirmed = contextLines(classification, context);
  const requirements = requirementsFor(ranking.recommendedSkill, ranking.expectedSkill, searchSuggestions);
  const skill = ranking.recommendedSkill || (ranking.expectedSkill ? `未找到（需要 ${ranking.expectedSkill}）` : "待确认");
  return [
    `使用 Skill：${skill}`,
    "",
    "用户原始目标：",
    classification.originalRequest,
    "",
    "已确认上下文：",
    ...(confirmed.length ? confirmed.map((item) => `- ${item}`) : ["- 暂无明确文件或证据。"]),
    "",
    "执行要求：",
    ...requirements.map((item) => `- ${item}`),
    "",
    "限制：",
    ...(boundaries.length ? boundaries.map((item) => `- ${item}`) : ["- 不补充用户未确认的业务规则。"]),
    "",
    "未确认项：",
    ...(unknowns.length ? unknowns.map((item) => `- ${item}`) : ["- 无。"]),
  ].join("\n");
}

export function buildResult(classification, ranking, context, searchSuggestions, debug = null) {
  const boundaries = requestBoundaries(classification, context);
  const unknowns = unknownsFor(classification, context, ranking);
  const result = {
    original_request: classification.originalRequest,
    intent: classification.intent,
    evidence: classification.evidence,
    recommended_skill: ranking.recommendedSkill,
    alternative_skills: ranking.alternatives.slice(0, 2),
    selection_reason: ranking.reason,
    boundaries,
    unknowns,
    execution_prompt: "",
  };
  result.execution_prompt = buildExecutionPrompt({ classification, ranking, context, searchSuggestions, boundaries, unknowns });
  if (debug) result._debug = debug;
  return result;
}
