function cleanedStrings(values, limit) {
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

export function formatUserOutput(result) {
  const contexts = (result?.confirmed_context || [])
    .filter((item) => item && typeof item.value === "string" && item.value.trim())
    .slice(0, 8);
  const conceptLabels = [
    ["task", "任务"],
    ["ui_component", "组件"],
    ["component", "组件"],
    ["business_object", "业务"],
    ["state", "状态"],
    ["visual_effect", "视觉效果"],
    ["asset_resource", "资源"],
    ["api", "接口"],
    ["layout_scene", "场景"],
    ["config_or_symbol", "符号"],
    ["issue_symptom", "问题"],
    ["target_scope", "范围"],
  ];
  const conceptsByHeading = new Map();
  for (const [type, heading] of conceptLabels) {
    const labels = cleanedStrings((result?.entities?.[type] || []).map((item) => item?.label), 6);
    if (!labels.length) continue;
    conceptsByHeading.set(heading, cleanedStrings([...(conceptsByHeading.get(heading) || []), ...labels], 6));
  }
  const concepts = [...conceptsByHeading].map(([heading, labels]) => `${heading}：${labels.join("、")}`);
  const directions = cleanedStrings(result?.retrieval_directions, 6);
  const boundaries = cleanedStrings(result?.boundaries, 6);
  const unknowns = cleanedStrings(result?.unknowns, 1);
  const lines = [
    "用户目标：",
    cleanGoal(result?.original_goal) || "尚未提供明确目标。",
    "",
    "已确认上下文：",
  ];

  if (contexts.length) lines.push(...contexts.map((item) => `- ${item.value}`));
  else lines.push("- 未提供可确认的额外上下文");

  if (concepts.length) lines.push("", "研发概念：", ...concepts.map((concept) => `- ${concept}`));
  if (directions.length) lines.push("", "检索方向：", ...directions.map((direction) => `- ${direction}`));

  lines.push("", "任务边界与未知项：");
  if (boundaries.length) lines.push(...boundaries.map((boundary) => `- 边界：${boundary}`));
  if (unknowns.length) lines.push(...unknowns.map((unknown) => `- 尚未确认：${unknown}`));
  if (!boundaries.length && !unknowns.length) lines.push("- 当前没有需要额外补充的边界或阻塞项");

  if (result?.selection_explanation) {
    lines.push("", `选型说明：${String(result.selection_explanation).replace(/\s+/g, " ").trim()}`);
  }
  lines.push("", `执行能力：${result?.execution_skill || "待确定"}`);
  return lines.join("\n");
}
