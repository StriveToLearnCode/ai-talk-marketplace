const TASK_TYPES = {
  live_ui_findings: "🔍 页面检查",
  midscene_test_file: "🧪 自动化测试",
  frontend_plan_files: "📋 实施方案",
  frontend_code_changes: "🆕 功能开发",
  figma_analysis_docs: "🎨 原型分析",
  figma_ui_meta: "🧩 设计稿转换",
  page_center_config: "⚙️ 配置交付",
  activity_block_component: "🧱 活动积木开发",
  service_files: "🔌 接口服务生成",
};

const SKILL_RESPONSIBILITIES = {
  "ui-self-check": "负责浏览器检查",
  "ai-test": "负责自动化测试",
  "gen-frontend-plan": "负责实施方案设计",
  "gen-code": "负责代码开发",
  "figma-analyze": "负责原型分析",
  "figma-to-ui-meta": "负责设计稿转换",
  "gen-page-center-config": "负责 PageCenter 配置",
  "custom-components-skill": "负责活动积木开发",
  "ui2-upgrade-guide": "负责组件升级",
  "gen-service": "负责接口服务生成",
};

const ALTERNATIVE_LABELS = {
  "ui-self-check": "浏览器检查",
  "ai-test": "自动化测试",
  "gen-frontend-plan": "方案模式",
  "gen-code": "代码开发",
  "figma-analyze": "原型分析",
  "figma-to-ui-meta": "设计稿转换",
  "gen-page-center-config": "PageCenter 配置",
  "custom-components-skill": "活动积木开发",
  "ui2-upgrade-guide": "组件升级",
};

const BUG_PATTERN = /bug|异常|不对|有问题|为什么.*(?:没有|没|不)|定位.*修复|修一下|报错|错误|不生效|失效/i;

function cleanedLines(values, limit) {
  return [...new Set((values || []).filter((value) => typeof value === "string" && value.trim()))]
    .slice(0, limit)
    .map((value) => value.replace(/\s+/g, " ").trim());
}

function cleanGoal(value) {
  return String(value || "")
    .replace(/^\s*\$ai-talk(?::ai-talk)?\s*/i, "")
    .replace(/^\s*(?:请|麻烦|请你|帮我|帮忙|需要你)\s*/, "")
    .replace(/[。！？!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function understandingFor(output, originalGoal) {
  const goal = cleanGoal(originalGoal);
  const bug = output === "frontend_code_changes" && BUG_PATTERN.test(goal);
  const type = bug ? "🐞 Bug 修复" : TASK_TYPES[output] || "🧭 任务确认";
  if (!goal) return { type, summary: "当前任务还缺少可确认的目标。" };
  if (bug) {
    const issue = goal
      .replace(/^为什么/, "")
      .replace(/^(?:分析原因并|定位并|排查并)?修复/, "")
      .replace(/[，,]?(?:请)?(?:定位并|排查并)?修复(?:这个)?(?:问题|异常)?$/, "")
      .replace(/[，,]?修一下$/, "")
      .replace(/有问题$/, "")
      .replace(/不对$/, "异常")
      .replace(/，?却/g, "但")
      .replace(/^(?:这个|当前)/, "当前");
    const suffix = /(?:异常|报错|错误)$/.test(issue) ? "。" : "的问题。";
    return { type, summary: `定位并修复${issue || "当前实现"}${suffix}` };
  }
  return { type, summary: `${goal}。` };
}

function responsibilityFor(recommendation) {
  const known = SKILL_RESPONSIBILITIES[recommendation?.name];
  if (known) return known;
  const description = String(recommendation?.description || "")
    .replace(/\s+/g, " ")
    .split(/[。；;]/, 1)[0]
    .replace(/^(?:负责|用于)/, "")
    .trim()
    .slice(0, 36);
  return description ? `负责${description}` : "负责处理当前任务";
}

export function formatUserOutput(result) {
  const recommendation = result?.recommendation;
  const understanding = understandingFor(result?.retrieval_profile?.desired_output, result?.original_goal);
  const reasons = cleanedLines(result?.recommendation_basis, 4);
  const contexts = cleanedLines(result?.execution_contexts, 6);
  const lines = [
    "💡 AI 理解",
    understanding.type,
    understanding.summary,
  ];

  if (reasons.length) {
    lines.push("", "🤔 为什么这样决定？", ...reasons.map((reason) => `✓ ${reason}`));
  }

  lines.push("", "🚀 AI 将利用");
  if (contexts.length) lines.push(...contexts);
  else lines.push("本轮没有可确认的额外上下文");

  lines.push("", "🛠 AI 已决定");
  if (recommendation?.name) {
    lines.push(recommendation.name, responsibilityFor(recommendation));
  } else {
    lines.push("暂不进入执行", "当前没有可用的匹配 Skill");
  }

  const excluded = result?.excluded_similar_skills?.[0];
  if (excluded?.name && excluded?.reason) {
    const label = ALTERNATIVE_LABELS[excluded.name] || excluded.name;
    lines.push("", `为什么不用${label}？`, excluded.reason.replace(/\s+/g, " ").trim());
  }
  if (result?.blocking_unknown) {
    lines.push("", `执行前需确认：${String(result.blocking_unknown).replace(/\s+/g, " ").trim()}`);
  }
  return lines.join("\n");
}
