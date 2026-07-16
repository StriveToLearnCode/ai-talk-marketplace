function cleanedStrings(values, limit = 8) {
  return [...new Set((values || [])
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.replace(/\s+/g, " ").trim()))]
    .slice(0, limit);
}

function cleanGoal(value) {
  return String(value || "").replace(/^\s*\$ai-talk(?::ai-talk)?\s*/i, "").trim();
}

function safeDisplay(value) {
  return String(value || "").replace(/(^|\s)(\/(?:Users|home|private|var|tmp)\/\S+)/g, (_, prefix, absolute) => {
    const parts = absolute.replace(/\/$/, "").split("/");
    return `${prefix}${parts.at(-1) || "目标位置"}`;
  });
}

const SOURCE_LABELS = {
  project: "当前项目代码",
  docs: "公司文档",
  skill: "相关 Skill",
  user: "用户确认",
};

export function formatUserOutput(result) {
  const contexts = cleanedStrings((result?.confirmed_context || []).map((item) => safeDisplay(item?.value)), 10);
  const conceptLabels = [
    ["task", "任务"],
    ["ui_component", "组件"],
    ["business_object", "业务对象"],
    ["state", "状态"],
    ["visual_change", "视觉修改"],
    ["asset_resource", "资源"],
    ["issue_symptom", "问题表现"],
    ["target_scope", "目标范围"],
    ["page_entry", "页面入口"],
    ["inspection_goal", "检查目标"],
    ["goal", "目标"],
    ["scope", "范围"],
  ];
  const concepts = [];
  for (const [type, heading] of conceptLabels) {
    const labels = cleanedStrings((result?.entities?.[type] || []).map((item) => safeDisplay(item?.label)), 6);
    if (labels.length) concepts.push(`${heading}：${labels.join("、")}`);
  }
  const relationships = cleanedStrings(result?.relationships_and_conflicts, 6);
  const boundaries = cleanedStrings(result?.boundaries, 6);
  const acceptance = cleanedStrings(result?.acceptance_criteria, 6);
  const gaps = (result?.unknowns || []).filter((item) => item && item.type && item.reason && typeof item.blocking === "boolean");

  const lines = [
    "用户目标：",
    safeDisplay(cleanGoal(result?.original_goal)),
    "",
    "已确认上下文：",
    ...contexts.map((context) => `- ${context}`),
  ];

  if (concepts.length) lines.push("", "研发概念：", ...concepts.map((concept) => `- ${concept}`));

  lines.push("", "关系与冲突：");
  if (relationships.length) lines.push(...relationships.map((item) => `- ${item}`));
  else lines.push("- 已确认信息之间没有显式冲突。");

  if (gaps.length) {
    lines.push("", "上下文缺口：");
    for (const item of gaps) {
      lines.push(`- ${safeDisplay(item.reason)}`);
      if (item.suggested_source) lines.push(`  建议来源：${SOURCE_LABELS[item.suggested_source] || item.suggested_source}。`);
      lines.push(item.blocking ? "  阻塞，需要先确认。" : "  非阻塞，执行阶段先验证。");
    }
  }

  lines.push("", "任务边界：", ...boundaries.map((item) => `- ${safeDisplay(item)}`));
  lines.push("", "验收标准：", ...acceptance.map((item) => `- ${safeDisplay(item)}`));
  return lines.join("\n");
}
