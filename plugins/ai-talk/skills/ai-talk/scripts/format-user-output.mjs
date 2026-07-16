const UNDERSTANDING = {
  live_ui_findings: "这是即时 UI 检查任务，需要打开现有页面核对视觉、交互或运行状态。",
  midscene_test_file: "这是 Midscene 自动化测试任务，需要生成、维护或运行测试。",
  frontend_plan_files: "这是前端实施计划编制任务，目标是产出可执行的方案文档。",
  frontend_code_changes: "这是现有前端实现任务，需要定位问题或完成代码改动并验证。",
  figma_analysis_docs: "这是 Figma 原型分析任务，目标是输出独立分析文档。",
  figma_ui_meta: "这是 Figma 转换任务，目标是生成 UI Meta 配置。",
  page_center_config: "这是 PageCenter 配置任务，目标是生成或推送配置。",
  activity_block_component: "这是活动积木开发任务，需要实现可配置玩法组件。",
  service_files: "这是接口服务生成任务，需要从 OpenAPI 产出服务文件。",
};

const BUG_PATTERN = /bug|异常|不对|有问题|为什么.*(?:没有|不)|定位.*修复|修一下/i;

const EXECUTION = {
  "ui-self-check": ["打开现有页面", "核对视觉、交互与响应式", "检查控制台与网络", "记录并复验问题"],
  "ai-test": ["读取测试目标", "生成或维护 Midscene 用例", "运行测试", "验证并报告结果"],
  "gen-frontend-plan": ["整理现有资料", "读取项目规范", "梳理实施路径", "生成前端实施计划"],
  "gen-code": ["定位相关实现", "读取项目规范与相关代码", "完成代码修改", "验证修改结果"],
  "figma-analyze": ["读取 Figma 原型", "梳理页面结构", "分析交互状态", "输出分析文档"],
  "figma-to-ui-meta": ["读取 Figma 输入", "执行 Mercury 转换", "生成 figma-ui-meta.json", "校验转换产物"],
  "gen-page-center-config": ["读取配置需求", "生成 PageCenter 配置", "校验配置内容", "按要求推送"],
  "custom-components-skill": ["读取 uiMeta 约定", "实现活动积木组件", "接入配置数据", "验证玩法状态"],
  "ui2-upgrade-guide": ["定位待迁移组件", "读取 ui2 规范", "完成组件迁移", "验证兼容性"],
  "gen-service": ["读取 OpenAPI 定义", "生成 TypeScript 服务", "生成类型文件", "校验生成产物"],
};

function cleanedLines(values, limit) {
  return [...new Set((values || []).filter((value) => typeof value === "string" && value.trim()))]
    .slice(0, limit)
    .map((value) => value.replace(/\s+/g, " ").trim());
}

export function formatUserOutput(result) {
  const skill = result?.recommendation?.name;
  const output = result?.retrieval_profile?.desired_output;
  const originalGoal = String(result?.original_goal || "");
  const understanding = output === "frontend_code_changes" && BUG_PATTERN.test(originalGoal)
    ? "这是已有页面的 Bug 修复，需要定位异常并完成代码修改与验证。"
    : UNDERSTANDING[output] || "当前任务目标还不足以确定唯一的执行类型。";
  const lines = [
    "💡 AI 理解",
    understanding,
    "",
    "✅ AI 已决定",
    skill ? `使用：${skill}` : "暂不进入执行：当前项目未检索到匹配的公司 Skill",
  ];
  const reasons = cleanedLines(result?.recommendation_basis, 4);
  if (reasons.length) lines.push("", "原因：", ...reasons.map((reason) => `✓ ${reason}`));
  const excluded = result?.excluded_similar_skills?.[0];
  if (excluded?.name && excluded?.reason) {
    lines.push("", `为什么不用 ${excluded.name}？`, excluded.reason.replace(/\s+/g, " ").trim());
  }
  if (result?.blocking_unknown) {
    lines.push("", `执行前需确认：${String(result.blocking_unknown).replace(/\s+/g, " ").trim()}`);
  }
  const actions = cleanedLines(EXECUTION[skill] || ["等待可用的公司 Skill", "路由明确后继续执行"], 4);
  lines.push("", "🚀 AI 将执行", ...actions.map((action) => `✓ ${action}`));
  return lines.join("\n");
}
