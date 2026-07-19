import { CONFUSION_GROUPS, SKILL_ROUTES } from "./rules.mjs";

const OUTPUT_TO_SKILL = Object.fromEntries(Object.entries(SKILL_ROUTES).map(([name, rule]) => [rule.desiredOutput, name]));

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[_/.-]+/g, " ").replace(/\s+/g, " ").trim();
}

function lexicalScore(skill, query) {
  const haystack = normalize(`${skill.name} ${skill.description}`);
  const terms = normalize(query).match(/[a-z0-9]+|[\u3400-\u9fff]{2,}/g) || [];
  return Math.min(30, terms.filter((term) => haystack.includes(term)).length * 5);
}

function selectionReason(skill, classification, expected) {
  const { desired_output: output } = classification.intent;
  if (!skill && expected) return `目标产物需要 ${expected}，但当前 Skill 索引中未找到它；未改用其他职责的 Skill。`;
  if (!skill) return "没有发现与目标产物足够匹配的 Skill；未改用其他职责的 Skill。";
  if (output === "live_page_findings") return "用户明确要求浏览器现场检查页面视觉、交互或运行状态，不是代码静态定位或自动化测试文件。";
  if (output === "automated_test") return "用户明确要求 Midscene、自动化测试、测试文件或运行测试。";
  if (output === "implementation_plan") return "最终产物是实施方案或计划，不进入代码修改。";
  if (output === "code_changes" && classification.executionMode === "analysis_only") {
    return "用户要求定位代码问题但明确不修改代码，因此由 gen-code 按只分析模式执行。";
  }
  if (output === "code_changes") return classification.flags.figma
    ? "Figma 是实现上下文，最终产物仍是代码修改。"
    : "用户最终要求实现、开发、修改或修复代码。";
  if (output === "figma_analysis_document") return "最终产物是 Figma 分析文档，而不是代码实现。";
  return `该 Skill 的名称和描述与用户原话最接近。`;
}

export function rankSkills(skills, classification, limit = 3) {
  const expected = OUTPUT_TO_SKILL[classification.intent.desired_output];
  const ranked = skills.map((skill) => {
    const route = SKILL_ROUTES[skill.name.toLowerCase()];
    const exactOutput = route?.desiredOutput === classification.intent.desired_output;
    const score = (skill.name.toLowerCase() === expected ? 100 : exactOutput ? 80 : 0) + lexicalScore(skill, classification.originalRequest);
    return { skill, score, exact_output: exactOutput };
  }).sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));

  const primary = expected
    ? ranked.find((item) => item.skill.name.toLowerCase() === expected) || null
    : ranked.find((item) => item.score > 0) || null;
  const group = CONFUSION_GROUPS.find((items) => items.includes(primary?.skill.name.toLowerCase()));
  const alternatives = ranked
    .filter((item) => item !== primary && item.score > 0)
    .filter((item) => !group || group.includes(item.skill.name.toLowerCase()) || item.score >= 15)
    .slice(0, Math.min(2, Math.max(0, limit - 1)))
    .map((item) => item.skill.name);

  return {
    recommendedSkill: primary?.skill.name || "",
    expectedSkill: expected || "",
    alternatives,
    reason: selectionReason(primary?.skill, classification, expected),
    debug: ranked.map((item) => ({
      name: item.skill.name,
      score: item.score,
      scope: item.skill.scope,
      path: item.skill.path,
      exact_output: item.exact_output,
    })),
  };
}
