import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { executionGateFor } from "../scripts/route-company-skills.mjs";
import { buildExecutionProtocol, formatUserOutput } from "../scripts/format-user-output.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, "../scripts/route-company-skills.mjs");
const CASES = path.resolve(import.meta.dirname, "company-skill-routing-cases.json");
const COMPARE = path.resolve(import.meta.dirname, "../../../docs/skills");
const REPOSITORY = path.resolve(import.meta.dirname, "../../../../../..");
const LEAKED_TERMS = [
  "task_action", "target_category", "desired_output", "contract_mode", "evidence_types",
  "query_terms", "matched_fields", "matched_terms", "/Users/", "score", "index_conflicts",
  "routing details", "AI 将执行", "原因：", "推荐执行", "使用：", "retrieval_query_groups",
  "ui_component", "business_object", "issue_symptom", "config_or_symbol", "feature_create", "bug_fix",
];

const SKILLS = [
  ["fe-ai-test", "ai-test", "生成 Midscene 测试文件 midscene-test.ts、自动化测试用例和报告。"],
  ["fe-gen-frontend-plan", "gen-frontend-plan", "从原型、OpenAPI、PageCenter 和 Figma UI Meta 生成 docs/plan 前端方案。"],
  ["fe-gen-code", "gen-code", "生成活动前端页面、组件和业务逻辑代码。"],
  ["fe-figma-analyze", "figma-analyze", "分析 Figma 原型并输出交互 Markdown 方案。"],
  ["figma-analyze", "figma-analyze", "分析 Figma 原型并输出交互 Markdown 方案。"],
  ["fe-figma-to-ui-meta", "figma-to-ui-meta", "调用 Mercury 将 Figma 转成 figma-ui-meta.json。"],
  ["fe-gen-page-center-config", "gen-page-center-config", "生成 page-center-config.json 并推送配置。"],
  ["fe-custom-components-skill", "custom-components-skill", "生成根据 uiMeta 渲染的活动积木组件。"],
  ["fe-ui2-upgrade-guide", "ui2-upgrade-guide", "将 ui-components 升级到 ui2-components。"],
  ["fe-gen-service", "gen-service", "从 OpenAPI 生成 TypeScript service。"],
];

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-company-fixture-"));
  for (const [directory, name, description] of SKILLS) {
    const target = path.join(root, ".agents", "skills", directory);
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "SKILL.md"), `---\nname: ${name}\ndescription: '${description}'\n---\nBODY_MUST_NOT_BE_READ\n`);
  }
  await mkdir(path.join(root, "src", "components"), { recursive: true });
  await writeFile(path.join(root, "src", "index.ts"), "export {};\n");
  return root;
}

async function routeDebug(root, prompt, evidenceTypes = [], ...extra) {
  const args = [SCRIPT, "--root", root, "--query", prompt, "--debug-json"];
  for (const evidence of evidenceTypes) args.push("--evidence-type", evidence);
  args.push(...extra);
  return JSON.parse((await execFileAsync(process.execPath, args, { encoding: "utf8" })).stdout);
}

async function routeUser(root, prompt, evidenceTypes = []) {
  const args = [SCRIPT, "--root", root, "--query", prompt];
  for (const evidence of evidenceTypes) args.push("--evidence-type", evidence);
  return (await execFileAsync(process.execPath, args, { encoding: "utf8" })).stdout.trim();
}

function matrix(results) {
  const value = {};
  for (const result of results) {
    value[result.expected] ||= {};
    value[result.expected][result.predicted || "NONE"] = (value[result.expected][result.predicted || "NONE"] || 0) + 1;
  }
  return value;
}

function assertNoLeaks(output) {
  for (const term of LEAKED_TERMS) assert.ok(!output.includes(term), `leaked ${term}:\n${output}`);
}

function chineseCharacterCount(value) {
  return [...value.matchAll(/\p{Script=Han}/gu)].length;
}

function assertCompactProtocol(output, { minChineseCharacters = 0 } = {}) {
  const chineseHeadings = new Set([
    "用户目标：", "任务定位：", "项目上下文：", "建议检索：", "实现边界：", "建议 Skill：",
  ]);
  const englishHeadings = new Set(["Goal", "Context", "Need Knowledge", "Assumptions", "Constraints", "Next Skill"]);
  const lines = output.split("\n").filter(Boolean);
  const chineseCharacters = chineseCharacterCount(output);
  assert.ok(chineseCharacters >= minChineseCharacters, `protocol too short (${chineseCharacters} Chinese characters):\n${output}`);
  assert.ok(lines.length <= 45, `protocol exceeds one screen (${lines.length} lines):\n${output}`);
  const chinese = lines[0] === "用户目标：";
  assert.equal(lines[0], chinese ? "用户目标：" : "Goal", output);
  if (chinese) {
    const reasoningIndex = lines.indexOf("任务定位：");
    if (reasoningIndex >= 0) {
      assert.ok(chineseCharacterCount(lines[reasoningIndex + 1] || "") <= 100, `reasoning exceeds 100 Chinese characters:\n${output}`);
    }
    const retrievalIndex = lines.indexOf("建议检索：");
    const retrievalNextHeading = lines.findIndex((line, index) => index > retrievalIndex && chineseHeadings.has(line));
    const retrievalEnd = retrievalNextHeading >= 0 ? retrievalNextHeading : lines.length;
    const retrievalLines = retrievalIndex >= 0 ? lines.slice(retrievalIndex + 1, retrievalEnd) : [];
    assert.ok(retrievalLines.length <= 5, `too many retrieval targets:\n${output}`);
    const constraintIndex = lines.indexOf("实现边界：");
    const nextHeadingIndex = lines.findIndex((line, index) => index > constraintIndex && chineseHeadings.has(line));
    const constraintEnd = nextHeadingIndex >= 0 ? nextHeadingIndex : lines.length;
    const constraintLines = constraintIndex >= 0 ? lines.slice(constraintIndex + 1, constraintEnd) : [];
    assert.ok(constraintLines.length <= 2, `too many constraints:\n${output}`);
  }
  for (const old of ["研发语义", "研发默认规则", "执行目标：", "Skill Handoff：", "Semantic Context", "\nObject\n", "\nRelation\n", "Development Report", "OCR 总结", "建议执行", "分析过程", "评分", "Prompt", "AI 推导"]) {
    assert.ok(!output.includes(old), output);
  }
  const allowedHeadings = chinese ? chineseHeadings : englishHeadings;
  const headings = lines.filter((line) => allowedHeadings.has(line));
  assert.equal(new Set(headings).size, headings.length, output);
  if (chinese) {
    const plainValues = new Set([lines[1], lines[lines.indexOf("任务定位：") + 1], lines[lines.indexOf("建议 Skill：") + 1]]);
    assert.ok(lines.every((line) => plainValues.has(line) || chineseHeadings.has(line) || line.startsWith("- ")), output);
    for (const leaked of ["reward-state", "reward-render", "claimed-state", "progress-rule", "similar-implementation"]) {
      assert.ok(!output.includes(leaked), output);
    }
  } else {
    assert.ok(!output.includes("- "), output);
  }
  assertNoLeaks(output);
}

function values(payload, type) {
  return payload.entities[type].map((item) => item.value);
}

function assertCategorizedQueries(payload) {
  assert.equal(payload.schema_version, 6);
  assert.deepEqual(Object.keys(payload.retrieval_query_groups), ["docs", "skills", "components", "code"]);
  for (const queries of Object.values(payload.retrieval_query_groups)) {
    assert.ok(queries.length <= 3, JSON.stringify(payload.retrieval_query_groups));
    assert.equal(new Set(queries).size, queries.length);
    assert.ok(queries.every((query) => typeof query === "string" && query.trim()), JSON.stringify(queries));
  }
  assert.deepEqual(payload.retrieval_queries, Object.values(payload.retrieval_query_groups).flat());
}

test("real repository index and company fixture index are reported separately", async (t) => {
  const companyRoot = await fixture();
  t.after(() => rm(companyRoot, { recursive: true, force: true }));
  const real = await routeDebug(REPOSITORY, "打开页面看看视觉和交互有没有问题");
  const company = await routeDebug(companyRoot, "帮我生成一份前端实施计划");
  assert.deepEqual(real.routing.index.stats.by_scope, { companion: { files: 1, unique_names: 1 } });
  assert.equal(real.recommended_skill, "ui-self-check");
  assert.equal(company.routing.index.stats.by_scope.project.unique_names, 9);
  assert.equal(company.routing.index.stats.by_scope.companion.unique_names, 1);
  assert.equal(company.recommended_skill, "gen-frontend-plan");
});

test("real index reports duplicate names and excludes comparison copies", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root, "分析 Figma 原型并输出 Markdown 文档", [], "--source-root", `comparison=${COMPARE}`);
  assert.equal(payload.routing.index.stats.by_scope.project.unique_names, 9);
  assert.deepEqual(payload.routing.index.duplicate_name_conflicts.map((item) => item.name), ["figma-analyze"]);
  assert.ok(payload.routing.index.warnings.some((warning) => warning.includes("Excluded non-runtime")));
  for (const item of [payload.routing.recommendation, ...payload.routing.alternatives].filter(Boolean)) {
    await access(item.path);
    assert.ok(!item.path.startsWith(COMPARE));
  }
});

test("indexes explicit applicability sections but ignores ordinary body", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-applicability-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const allowed = path.join(root, ".agents", "skills", "allowed");
  const ignored = path.join(root, ".agents", "skills", "ignored");
  await mkdir(allowed, { recursive: true });
  await mkdir(ignored, { recursive: true });
  await writeFile(path.join(allowed, "SKILL.md"), "---\nname: allowed-router\ndescription: 公司发布辅助。\n---\n## 适用场景\n星河\n");
  await writeFile(path.join(ignored, "SKILL.md"), "---\nname: ignored-router\ndescription: 通用辅助。\n---\n普通正文包含星河，但不得索引。\n");
  const payload = await routeDebug(root, "星河");
  assert.equal(payload.recommended_skill, "allowed-router");
  assert.ok(![payload.routing.recommendation, ...payload.routing.alternatives].filter(Boolean).some((item) => item.name === "ignored-router"));
});

test("benchmark prints confusion matrix and meets thresholds", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = JSON.parse(await readFile(CASES, "utf8"));
  const results = await Promise.all(cases.map(async (item) => {
    const payload = await routeDebug(root, item.prompt, item.evidence_types || []);
    const top3 = [payload.routing.recommendation, ...payload.routing.alternatives].filter(Boolean).map((candidate) => candidate.name);
    return { id: item.id, clarity: item.clarity, expected: item.expected_skill, predicted: top3[0] || null, top3 };
  }));
  const clear = results.filter((item) => item.clarity === "clear");
  const ambiguous = results.filter((item) => item.clarity === "ambiguous");
  const top1 = clear.filter((item) => item.predicted === item.expected).length / clear.length;
  const top3 = ambiguous.filter((item) => item.top3.includes(item.expected)).length / ambiguous.length;
  const errors = results.filter((item) => item.clarity === "clear" ? item.predicted !== item.expected : !item.top3.includes(item.expected));
  process.stdout.write(`${JSON.stringify({
    benchmark: { total: results.length, clear_top1_accuracy: top1, ambiguous_top3_recall: top3 },
    confusion_matrix: matrix(results),
    errors,
  }, null, 2)}\n`);
  assert.ok(cases.length >= 20);
  assert.ok(top1 >= 0.9, `Top1 ${top1}`);
  assert.ok(top3 >= 0.9, `Top3 ${top3}`);
});

test("explicit live UI inspection wins over generic problem words", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prompts = [
    "打开页面看看视觉和交互有没有问题",
    "帮我检查页面视觉、交互、响应式",
    "用浏览器看一下控制台和网络",
    "对照截图检查页面效果",
  ];
  for (const prompt of prompts) {
    const payload = await routeDebug(root, prompt);
    assert.equal(payload.recommended_skill, "ui-self-check", prompt);
    assert.equal(payload.routing.retrieval_profile.desired_output, "live_ui_findings", prompt);
  }
});

test("screenshot evidence requires an attachment flag or an explicit reference phrase", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const prompt of ["为什么没有显示已领取图片", "检查图标和背景图", "替换奖励图片"]) {
    const payload = await routeDebug(root, prompt);
    assert.ok(!payload.routing.retrieval_profile.evidence_types.includes("screenshot"), prompt);
    assert.ok(!payload.confirmed_context.some((item) => item.type.includes("screenshot")), prompt);
  }
  for (const prompt of ["见截图，奖励状态异常", "参考截图修改页面", "截图如下，请检查页面", "根据这张图实现页面"]) {
    const payload = await routeDebug(root, prompt);
    assert.ok(payload.routing.retrieval_profile.evidence_types.includes("screenshot"), prompt);
  }
  const attachment = await routeDebug(root, "检查奖励状态", ["screenshot"]);
  assert.ok(attachment.routing.retrieval_profile.evidence_types.includes("screenshot"));
});

test("existing UI bugs default to code fixes unless explicitly analysis-only", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const prompt of ["为什么奖励状态没有显示", "这里不对，修一下", "已有页面奖励状态显示异常，见截图", "这个页面有问题，定位并修复", "分析原因并修复这个页面异常"]) {
    const payload = await routeDebug(root, prompt);
    assert.equal(payload.recommended_skill, "gen-code", prompt);
    assert.equal(payload.routing.retrieval_profile.desired_output, "frontend_code_changes", prompt);
    assert.deepEqual(payload.unknowns, [], prompt);
  }
  const analysis = await routeDebug(root, "这个已有页面显示异常，只分析原因，不修改代码");
  assert.equal(analysis.recommended_skill, "ui-self-check");
  assert.equal(analysis.routing.retrieval_profile.desired_output, "live_ui_findings");
});

test("multiple image attachments keep visual, interaction, and API roles with sources", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prompt = "开发 recharge/components/dialogs 下的礼物连爆弹窗";
  const evidence = ["visual=弹窗视觉稿", "interaction=交互流程", "api=连爆次数接口信息"];
  const payload = await routeDebug(root, prompt, evidence);
  const output = await routeUser(root, prompt, evidence);

  assert.equal(payload.recommended_skill, "gen-code");
  assert.deepEqual(payload.confirmed_context.slice(0, 3).map((item) => item.type), [
    "visual_design", "interaction_flow", "api_document",
  ]);
  assert.deepEqual(payload.confirmed_context.slice(0, 3).map((item) => item.source), [
    "attachment:1", "attachment:2", "attachment:3",
  ]);
  assert.equal(payload.intent, "feature_create");
  assert.ok(values(payload, "ui_component").includes("dialog"));
  assert.ok(values(payload, "target_scope").includes("recharge/components/dialogs"));
  assert.deepEqual(payload.retrieval_query_groups.components, ["弹窗组件", "弹窗触发逻辑", "弹窗交互逻辑"]);
  assertCategorizedQueries(payload);
  for (const text of ["用户目标：", "礼物连爆弹窗", "项目上下文：", "目标目录：recharge/components/dialogs", "建议 Skill：\ngen-code"]) assert.ok(output.includes(text), output);
  for (const evidence of ["视觉稿：已提供（attachment:1）", "交互流程：已提供（attachment:2）", "接口资料：连爆次数接口信息"]) assert.ok(output.includes(evidence), output);
  assertCompactProtocol(output);
});

test("an explicit file bug stays compact and captures only the target and symptom", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prompt = "修复 src/components/reward-card.vue 中图片没有显示的问题";
  const payload = await routeDebug(root, prompt);
  const output = await routeUser(root, prompt);

  assert.equal(payload.recommended_skill, "gen-code");
  assert.deepEqual(payload.confirmed_context, [{
    type: "target_file",
    value: "目标文件：src/components/reward-card.vue",
    source: "user_text:path",
  }]);
  assert.ok(values(payload, "issue_symptom").includes("image-not-updated"));
  assert.ok(payload.retrieval_query_groups.code.some((query) => query.includes("src/components/reward-card.vue")));
  assert.ok(payload.unknowns.some((item) => item.includes("src/components/reward-card.vue")));
  assert.ok(output.includes("项目上下文：\n- 目标文件：src/components/reward-card.vue"), output);
  assert.deepEqual(payload.skill_handoff.retrieval_semantics, ["图片资源绑定", "图片展示条件", "当前项目同类实现"]);
  assert.ok(output.split("src/components/reward-card.vue").length - 1 <= 3, output);
  assert.ok(!output.includes("AGENTS.md"));
  assert.ok(!output.includes("ESLint"));
  assert.ok(!output.includes("Prettier"));
  assertCompactProtocol(output);
});

test("a generic dialog request expands retrieval vocabulary without inventing requirements", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root, "开发一个弹窗");
  const output = await routeUser(root, "开发一个弹窗");

  assert.equal(payload.recommended_skill, "gen-code");
  assert.equal(payload.intent, "feature_create");
  assert.deepEqual(payload.retrieval_query_groups.components, ["弹窗组件", "弹窗触发逻辑", "弹窗交互逻辑"]);
  for (const invented of ["确认按钮", "奖励列表"]) {
    assert.ok(!JSON.stringify(payload).includes(invented), JSON.stringify(payload));
    assert.ok(!output.includes(invented), output);
  }
  assert.ok(output.includes("任务定位：\n这是新增 UI 需求"), output);
  assert.deepEqual(payload.skill_handoff.retrieval_semantics, ["现有弹窗组件", "弹窗同类实现"]);
  assert.deepEqual(payload.confirmed_context, []);
  assert.deepEqual(payload.unknowns, ["弹窗所属页面或目标目录尚未明确。"]);
  assertCompactProtocol(output);
});

test("image words without attachments never become screenshot context", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root, "图片没有显示，修一下");
  const output = await routeUser(root, "图片没有显示，修一下");

  assert.equal(payload.recommended_skill, "gen-code");
  assert.ok(!payload.routing.retrieval_profile.evidence_types.includes("screenshot"));
  assert.ok(!payload.confirmed_context.some((item) => item.type.includes("screenshot")));
  assert.ok(!output.includes("截图"), output);
});

test("coding tasks expose only the short protocol and matched Skill", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const prompt of ["开发一个弹窗", "新增活动页礼物列表", "修复页面显示问题"]) {
    const payload = await routeDebug(root, prompt);
    const output = await routeUser(root, prompt);
    assert.equal(payload.recommended_skill, "gen-code", prompt);
    assert.match(output, /^用户目标：\n/);
    assert.ok(!output.includes(JSON.stringify(payload.retrieval_queries)), output);
    assert.match(output, /\n建议 Skill：\ngen-code$/);
    for (const old of ["用户原意：", "AI 推导（Task Reasoning）：", "已确认上下文：", "研发概念：", "建议优先检索：", "关系与冲突："]) {
      assert.ok(!output.includes(old), output);
    }
    for (const optional of ["建议验证：", "验收标准："]) assert.ok(!output.includes(optional), output);
    for (const vague of ["页面正常展示", "按用户目标完成", "实现结果可按摘要逐项核对"]) assert.ok(!output.includes(vague), output);
    assert.ok(!output.includes("AI 已决定"), output);
    assert.ok(!output.includes("为什么选择"), output);
    assert.ok(!output.includes("未选择"), output);
    assertCompactProtocol(output);
  }
});

test("RTL reward progress screenshot produces source-backed concepts and categorized queries", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prompt = "为什么这个进度条不对";
  const evidence = ["screenshot=RTL 页面奖励阶段进度条，已领取状态显示异常"];
  const payload = await routeDebug(root, prompt, evidence);
  const output = await routeUser(root, prompt, evidence);

  assert.equal(payload.intent, "bug_fix");
  assert.equal(payload.recommended_skill, "gen-code");
  for (const [type, expected] of [
    ["ui_component", "progress-track"], ["business_object", "reward-stage"], ["state", "claimed"],
    ["layout_scene", "RTL"], ["issue_symptom", "progress-display-mismatch"],
  ]) assert.ok(values(payload, type).includes(expected), `${type}: ${JSON.stringify(payload.entities[type])}`);
  assertCategorizedQueries(payload);
  for (const suffix of ["公司 Docs", "Skill", "当前项目已有实现"]) {
    assert.ok(!payload.retrieval_queries.includes(`${prompt} ${suffix}`), JSON.stringify(payload.retrieval_queries));
  }
  assert.ok(output.includes("截图：已提供（attachment:1）"), output);
  assert.ok(payload.skill_handoff.retrieval_semantics.includes("奖励状态映射"));
  assert.ok(payload.skill_handoff.retrieval_semantics.includes("奖励展示条件"));
  assert.ok(!output.includes("RTL 页面奖励阶段进度条，已领取状态显示异常"), output);
  assertCompactProtocol(output);
});

test("claimed image symptom without an attachment never invents screenshot evidence", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root, "已领取图片没有显示");
  const output = await routeUser(root, "已领取图片没有显示");

  assert.equal(payload.intent, "bug_fix");
  assert.ok(values(payload, "state").includes("claimed"));
  assert.ok(values(payload, "issue_symptom").includes("image-not-updated"));
  assert.ok(!payload.confirmed_context.some((item) => item.type.includes("screenshot")));
  assert.ok(!payload.routing.retrieval_profile.evidence_types.includes("screenshot"));
  assert.ok(!output.includes("截图"), output);
  assert.deepEqual(payload.skill_handoff.retrieval_semantics, ["图片资源绑定", "图片展示条件", "当前项目同类实现"]);
  assertCategorizedQueries(payload);
  assertCompactProtocol(output);
});

test("live visual and interaction inspection uses inspection intent and skill query", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root, "打开页面看看视觉和交互有没有问题");

  assert.equal(payload.intent, "ui_inspection");
  assert.equal(payload.recommended_skill, "ui-self-check");
  assert.deepEqual(payload.retrieval_query_groups.skills, ["浏览器即时视觉与交互检查"]);
  assert.ok(payload.retrieval_query_groups.skills.every((query) => !query.includes("Bug") && !query.includes("修复")));
  assertCategorizedQueries(payload);
});

test("exact code symbols are queried only when they appear in real input", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const absent = await routeDebug(root, "排查奖励进度配置状态错误");
  const present = await routeDebug(root, "排查 progressRewardConfig 状态错误");

  assert.ok(!values(absent, "config_or_symbol").includes("progressRewardConfig"));
  assert.ok(!absent.retrieval_queries.some((query) => query.includes("progressRewardConfig")));
  assert.ok(values(present, "config_or_symbol").includes("progressRewardConfig"));
  assert.ok(present.retrieval_query_groups.code.includes("progressRewardConfig"));
  assertCategorizedQueries(absent);
  assertCategorizedQueries(present);
});

test("reward mask request extracts UI semantics without treating the asset as a directory", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prompt = "奖励获取到的时候需要加蒙层，蒙层图片：icon/mask";
  const payload = await routeDebug(root, prompt);
  const output = await routeUser(root, prompt);

  assert.equal(payload.intent, "feature_modify");
  for (const [type, expected] of [
    ["task", "ui-modification"], ["business_object", "reward-item"], ["state", "claimed"],
    ["visual_effect", "mask"], ["asset_resource", "icon/mask"],
  ]) assert.ok(values(payload, type).includes(expected), `${type}: ${JSON.stringify(payload.entities[type])}`);
  assert.ok(!payload.confirmed_context.some((item) => ["target_file", "target_directory"].includes(item.type)));
  assert.ok(!values(payload, "target_scope").includes("icon/mask"));
  assert.ok(!payload.unknowns.includes("期望交付物尚未明确。"));
  for (const expected of [
    "用户目标：\n为已有奖励节点增加领取后的 icon/mask 视觉效果。",
    "任务定位：\n这是已有奖励节点领取态的视觉修改",
    "重点确认领取状态判断、icon/mask 引用和项目内同类实现",
    "项目上下文：\n- 资源：icon/mask", "建议检索：", "实现边界：",
  ]) {
    assert.ok(output.includes(expected), output);
  }
  for (const forbidden of ["目标目录：icon/mask", "范围：icon/mask", "期望交付物尚未明确"]) {
    assert.ok(!output.includes(forbidden), output);
  }
  assertCompactProtocol(output);
});

test("slash-delimited image identifiers are assets rather than directories", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const resource of ["icon/mask", "progress/bg-not-reached-1", "icon/close"]) {
    const payload = await routeDebug(root, `替换图片资源：${resource}`);
    assert.deepEqual(values(payload, "asset_resource"), [resource], resource);
    assert.ok(!payload.confirmed_context.some((item) => ["target_file", "target_directory"].includes(item.type)), resource);
    assert.deepEqual(values(payload, "target_scope"), [], resource);
    assert.deepEqual(values(payload, "ui_component"), [], resource);
    assert.deepEqual(values(payload, "visual_effect"), [], resource);
  }
});

test("technical identifiers are categorized by semantics instead of punctuation", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root,
    "修改项目目录 apps/short/demo/ 和文件目录 components/dialogs/ 下的文件 round-reward-track.vue，组件名 ui-dialog、reward-item，配置变量 progressRewardConfig，接口名 getReward，接口路径 /api/reward/claim");

  assert.deepEqual(payload.confirmed_context.map((item) => [item.type, item.value]), [
    ["target_directory", "目标目录：apps/short/demo/"],
    ["target_directory", "目标目录：components/dialogs/"],
    ["target_file", "目标文件：round-reward-track.vue"],
  ]);
  assert.deepEqual(values(payload, "component"), ["ui-dialog", "reward-item"]);
  assert.ok(values(payload, "config_or_symbol").includes("progressRewardConfig"));
  assert.ok(!values(payload, "config_or_symbol").includes("getReward"));
  assert.deepEqual(values(payload, "api"), ["/api/reward/claim", "getReward"]);
  assert.ok(!values(payload, "target_scope").includes("/api/reward/claim"));
  assert.deepEqual(values(payload, "asset_resource"), []);
  assert.deepEqual(values(payload, "ui_component"), []);
  assert.deepEqual(values(payload, "business_object"), []);
});

test("explicit project context reads only applicable rules and one-hop local dependencies", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src", "feature"), { recursive: true });
  await writeFile(path.join(root, "AGENTS.md"), "# Root rules\n- use project conventions\n");
  await writeFile(path.join(root, "src", "AGENTS.md"), "# Source rules\n- keep types strict\n");
  await writeFile(path.join(root, "src", "feature", "target.ts"), "import { dep } from './dep';\nexport const value = dep;\n");
  await writeFile(path.join(root, "src", "feature", "dep.ts"), "export const dep = 1;\n");
  await writeFile(path.join(root, "src", "feature", "unrelated.ts"), "SECRET_UNRELATED\n");

  const payload = await routeDebug(root, "修复 src/feature/target.ts 中的显示问题");
  const pairs = payload.project_context.map((item) => [item.type, item.value]);
  assert.ok(pairs.some(([type, value]) => type === "target_file" && value === "src/feature/target.ts"));
  assert.ok(pairs.some(([type, value]) => type === "project_rule" && value === "AGENTS.md"));
  assert.ok(pairs.some(([type, value]) => type === "project_rule" && value === "src/AGENTS.md"));
  assert.ok(pairs.some(([type, value]) => type === "direct_dependency" && value === "src/feature/dep.ts"));
  assert.ok(!JSON.stringify(payload.project_context).includes("unrelated.ts"));
  assert.ok(payload.default_rules.some((item) => item.source === "project" && item.evidence === "AGENTS.md"));
  assert.ok(payload.default_rules.length <= 5);
});

test("bounded project reads reject escapes, node_modules, and oversized targets", async (t) => {
  const root = await fixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "ai-talk-outside-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, "secret.ts"), "export const secret = true;\n");
  await symlink(path.join(outside, "secret.ts"), path.join(root, "src", "escape.ts"));
  await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
  await writeFile(path.join(root, "node_modules", "pkg", "index.ts"), "export const hidden = true;\n");
  await writeFile(path.join(root, "src", "oversized.ts"), "x".repeat(128 * 1024 + 1));

  const escaped = await routeDebug(root, "修复 src/escape.ts");
  const dependency = await routeDebug(root, "修复 node_modules/pkg/index.ts");
  const oversized = await routeDebug(root, "修复 src/oversized.ts");
  assert.ok(escaped.unknowns.some((item) => item.includes("超出项目根目录")));
  assert.ok(dependency.unknowns.some((item) => item.includes("node_modules/pkg/index.ts")));
  assert.ok(oversized.unknowns.some((item) => item.includes("超过 128 KiB")));
  assert.ok(!escaped.project_context.some((item) => item.type === "direct_dependency"));
});

test("explicit user constraints suppress conflicting default rules without changing the original", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prompt = "$ai-talk 修改 src/index.ts，重写实现，不要复用现有模式，可以全局重构";
  const payload = await routeDebug(root, prompt);
  const output = await routeUser(root, prompt);
  assert.ok(!payload.default_rules.some((item) => /复用|沿用/.test(item.value)));
  assert.ok(!payload.default_rules.some((item) => item.value === "修改范围限于当前任务相关模块"));
  assert.ok(output.startsWith("用户目标：\n"), output);
  assert.ok(output.includes("实现边界："), output);
  assert.ok(!output.includes("任务定位："), output);
});

test("query builder supports all six declared development intents", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = [
    ["为什么按钮不对", "bug_fix", "gen-code"],
    ["开发一个弹窗", "feature_create", "gen-code"],
    ["改造已有弹窗", "feature_modify", "gen-code"],
    ["打开页面看看视觉和交互有没有问题", "ui_inspection", "ui-self-check"],
    ["生成一份前端实施计划", "planning", "gen-frontend-plan"],
    ["生成自动化测试文件", "automated_test", "ai-test"],
  ];
  for (const [prompt, intent, skill] of cases) {
    const payload = await routeDebug(root, prompt);
    assert.equal(payload.intent, intent, prompt);
    assert.equal(payload.recommended_skill, skill, prompt);
    assertCategorizedQueries(payload);
  }
});

test("reviewed Chinese protocol cases separate semantics, constraints, and routing", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const rewardPayload = await routeDebug(root, "为什么第三个奖励没显示");
  const rewardProtocol = buildExecutionProtocol(rewardPayload);
  assert.equal(rewardProtocol.goal, "定位第 3 个奖励展示异常。");
  assert.deepEqual(rewardProtocol.developmentObjects, ["奖励", "第 3 个奖励"]);
  assert.deepEqual(rewardProtocol.states, []);
  assert.deepEqual(rewardProtocol.retrievalSemantics, ["第 3 个奖励节点数据", "奖励状态判断", "奖励渲染条件", "当前项目同类实现"]);

  const taskPayload = await routeDebug(root, "积分阶段 PROGRESS_TASK_ID：7，然后一样展示进度和奖励");
  const taskProtocol = buildExecutionProtocol(taskPayload);
  assert.equal(taskProtocol.goal, "积分阶段接入任务 7，复用现有方式展示进度和奖励。");
  assert.deepEqual(taskProtocol.developmentObjects, ["PROGRESS_TASK_ID=7", "积分阶段"]);
  assert.deepEqual(taskProtocol.relations, ["任务 7 数据 → 积分阶段进度与奖励展示"]);
  assert.deepEqual(taskProtocol.retrievalSemantics, ["积分阶段任务关联", "进度展示逻辑", "奖励展示逻辑"]);
  assert.deepEqual(taskProtocol.constraints, ["复用现有展示方式", "不影响其他阶段"]);
  assert.equal(taskProtocol.nextSkill, "gen-code");

  const vague = await routeUser(root, "这个好像有点不太对");
  assert.ok(vague.includes("用户目标：\n这个好像有点不太对。"), vague);
  assert.ok(!vague.includes("任务定位："), vague);
  for (const output of [formatUserOutput(rewardPayload), formatUserOutput(taskPayload), vague]) assertCompactProtocol(output);
});

test("English input uses the same execution protocol headings", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root, "Why is the reward not displayed?");
  const output = await routeUser(root, "Why is the reward not displayed?");

  assert.equal(payload.schema_version, 6);
  assert.equal(payload.skill_handoff.execution_focus, "Why is the reward not displayed?");
  assert.match(output, /^Goal\nWhy is the reward not displayed\?/);
  for (const old of ["Task Goal:", "Object", "Relation", "Semantic Context"]) assert.ok(!output.includes(old), output);
  assertCompactProtocol(output);
});

test("formatter exposes short retrieval targets without internal query structures or ontology", () => {
  const payload = {
    original_goal: "检查奖励进度渲染",
    confirmed_context: [],
    intent: "ui_inspection",
    entities: {
      business_object: [{ value: "reward-stage", label: "奖励阶段", source: "user_text" }],
      ui_component: [{ value: "progress-track", label: "奖励进度条", source: "user_text" }],
    },
    retrieval_query_groups: { docs: [], skills: [], components: [], code: ["奖励进度渲染"] },
    recommended_skill: null,
  };
  const protocol = buildExecutionProtocol(payload);
  const output = formatUserOutput(payload);

  assert.deepEqual(protocol.retrievalSemantics, ["奖励状态映射", "奖励展示条件", "当前项目同类实现"]);
  for (const semantic of ["奖励状态映射", "奖励展示条件", "当前项目同类实现"]) assert.ok(output.includes(`- ${semantic}`), output);
  for (const leaked of ["Semantic Context", "\nObject\n", "\nRelation\n", "reward-progress", "reward-progress-render", "retrieval_query_groups"]) {
    assert.ok(!output.includes(leaked), output);
  }
  assertCompactProtocol(output);
});

test("an unmatched query omits the Skill section instead of inventing a placeholder", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root, "星河词条归档");
  const output = await routeUser(root, "星河词条归档");

  assert.equal(payload.recommended_skill, null);
  assert.ok(!output.includes("建议 Skill"), output);
  assert.ok(!output.includes("待根据"), output);
  assertCompactProtocol(output);
});

test("skill choice stays concise and exposes only user-facing retrieval targets", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const plain = await routeUser(root, "开发一个弹窗");
  const ambiguous = await routeUser(root, "先输出前端方案并开发页面");
  const ambiguousDialog = await routeUser(root, "先输出前端方案并开发一个弹窗");
  assert.ok(!plain.includes("冲突："), plain);
  assert.ok(!ambiguous.includes("冲突："), ambiguous);
  assert.ok(ambiguousDialog.includes("建议检索："), ambiguousDialog);
  assert.ok(!ambiguousDialog.includes("冲突："), ambiguousDialog);
  assert.match(ambiguous, /\n建议 Skill：\ngen-code$/);
  assertCompactProtocol(ambiguous);
  assertCompactProtocol(ambiguousDialog);
});

test("UI-first evidence produces a bounded understanding and semantic retrieval concepts", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = await routeUser(root, "先开发 UI，新增 Banner Spin 页面", [
    "visual=Banner Spin 默认视觉和完成态",
    "interaction=定义整体页面布局和交互流程",
    "screenshot=Reward Stage Completed，RTL 页面奖励进度条",
    "visual=资源 banner/progress 和 banner/banner01",
  ]);

  for (const text of ["用户目标：", "任务定位：", "视觉稿：已提供（attachment:1）", "交互流程：已提供（attachment:2）", "截图：已提供（attachment:3）"]) assert.ok(output.includes(text), output);
  for (const screenshotDetail of ["Banner Spin 默认视觉和完成态", "定义整体页面布局和交互流程", "Reward Stage Completed，RTL 页面奖励进度条"]) {
    assert.ok(!output.includes(screenshotDetail), output);
  }
  assertCompactProtocol(output);
});

test("API and page state mismatch yields facts and knowledge gaps without a guessed answer", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = await routeUser(root, "调整奖励页面 UI", ["api=state=0", "screenshot=页面显示已领取"]);

  for (const text of ["接口资料：state=0", "任务定位：", "状态证据与页面领取表现不一致", "重点确认状态证据、领取态展示条件和项目内同类映射"]) {
    assert.ok(output.includes(text), output);
  }
  assert.ok(!output.includes("页面显示已领取"), output);
  for (const verdict of ["接口错误", "设计稿错误", "state=0 就是已领取"]) assert.ok(!output.includes(verdict), output);
  assertCompactProtocol(output);
});

test("ordinal reward issue becomes business context and explicit knowledge gaps", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = await routeUser(root, "为什么第三个奖励没显示？");

  for (const text of [
    "用户目标：\n定位第 3 个奖励展示异常。", "任务定位：",
    "单个奖励节点的展示异常", "重点确认该节点数据、状态和渲染条件",
  ]) assert.ok(output.includes(text), output);
  for (const leaked of ["stage3", "reward-render", "reward-index-mapping", "claimed-state", "领取状态"]) assert.ok(!output.includes(leaked), output);
  assertCompactProtocol(output);
});

test("execution contexts cover round rewards, state conflicts, assets, and dialogs", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const roundPayload = await routeDebug(root, "为什么没有展示轮次奖励");
  const roundOutput = await routeUser(root, "为什么没有展示轮次奖励");
  assert.equal(roundPayload.intent, "bug_fix");
  assert.equal(roundPayload.recommended_skill, "gen-code");
  assert.ok(values(roundPayload, "business_object").includes("round-reward"));
  assert.equal(roundPayload.skill_handoff.execution_focus, "轮次奖励数据 → 轮次奖励展示");
  assert.deepEqual(roundPayload.skill_handoff.retrieval_semantics, ["轮次奖励展示条件", "奖励状态映射", "当前项目同类实现"]);

  const statePayload = await routeDebug(root, "state=0 页面却已领取");
  const stateOutput = await routeUser(root, "state=0 页面却已领取");
  assert.equal(statePayload.intent, "bug_fix");
  assert.ok(values(statePayload, "issue_symptom").includes("state-display-mismatch"));
  for (const text of ["state=0", "任务定位：", "状态证据与页面领取表现不一致"]) {
    assert.ok(stateOutput.includes(text), stateOutput);
  }
  for (const verdict of ["state=0 就是已领取", "state=0 就是未领取", "一定是接口问题"]) {
    assert.ok(!stateOutput.includes(verdict), stateOutput);
  }

  const assetPayload = await routeDebug(root, "奖励获取后增加 icon/mask");
  const assetOutput = await routeUser(root, "奖励获取后增加 icon/mask");
  assert.equal(assetPayload.intent, "feature_modify");
  assert.deepEqual(values(assetPayload, "asset_resource"), ["icon/mask"]);
  assert.ok(!assetPayload.confirmed_context.some((item) => item.type === "target_directory"));
  assert.ok(assetOutput.includes("项目上下文：\n- 资源：icon/mask"), assetOutput);
  assert.ok(assetOutput.includes("任务定位："), assetOutput);

  const dialogOutput = await routeUser(root, "开发一个弹窗");
  for (const text of ["任务定位：", "新增 UI 需求", "重点确认项目已有弹窗组件和同类实现"]) {
    assert.ok(dialogOutput.includes(text), dialogOutput);
  }
  for (const output of [roundOutput, stateOutput, assetOutput, dialogOutput]) assertCompactProtocol(output);
});

test("task positioning and retrieval targets cover the five boundary acceptance cases", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const h5Prompt = "调整 banner-spin.vue 中点击跳转活动半屏 H5，url 为活动 H5 链接，需要完整链接。";
  const h5Code = "const openActivity = () => { const url = new URL(path); ins.$we('openH5', { url, height: 550 }); };";
  const h5 = await routeUser(root, h5Prompt, [`selected_code=${h5Code}`]);
  for (const text of [
    "用户目标：\n调整 banner-spin.vue 中的活动半屏 H5 跳转，确保传给 openH5 的是完整活动链接。",
    "任务定位：\n这是已有跳转逻辑调整，不是新增跳转能力",
    "目标节点：openActivity", "调用：ins.$we('openH5', ...)", "半屏高度：550",
    "openH5 调用方式", "openActivity 同类实现", "活动 H5 完整 URL 构建", "半屏 H5 跳转规范",
    "建议 Skill：\ngen-code",
  ]) assert.ok(h5.includes(text), h5);
  assert.ok(!h5.includes("使用 new URL()"), h5);
  const inlineH5 = await routeUser(root, `${h5Prompt} 当前代码：${h5Code}`);
  for (const text of ["目标节点：openActivity", "调用：ins.$we('openH5', ...)", "半屏高度：550"]) {
    assert.ok(inlineH5.includes(text), inlineH5);
  }
  for (const falseParameter of ["明确参数：context=const", "明确参数：url=new", "明确参数：height=550"]) {
    assert.ok(!inlineH5.includes(falseParameter), inlineH5);
  }

  const mask = await routeUser(root, "奖励领取后增加 icon/mask");
  for (const text of ["任务定位：", "已有奖励节点领取态的视觉修改", "奖励领取状态判断", "icon/mask 引用方式", "当前项目同类实现"]) {
    assert.ok(mask.includes(text), mask);
  }
  for (const forbidden of ["state=", "status=", "claimed=", "一定", "必然"]) assert.ok(!mask.includes(forbidden), mask);

  const ordinal = await routeUser(root, "为什么第三个奖励没显示？");
  for (const text of ["单个奖励节点的展示异常", "第 3 个奖励节点数据", "奖励状态判断", "奖励渲染条件"]) {
    assert.ok(ordinal.includes(text), ordinal);
  }
  assert.ok(!ordinal.includes("rewardList[2]"), ordinal);

  const dialog = await routeUser(root, "开发一个弹窗");
  for (const text of ["这是新增 UI 需求", "现有弹窗组件", "弹窗同类实现"]) {
    assert.ok(dialog.includes(text), dialog);
  }
  for (const invented of ["按钮", "props", "事件"]) assert.ok(!dialog.includes(invented), dialog);

  const explicit = await routeUser(root, "调整 banner-spin.vue 的半屏 H5 完整链接，明确使用 new URL()。");
  assert.ok(explicit.includes("实现边界：\n- 使用 new URL()"), explicit);

  for (const output of [h5, inlineH5, mask, ordinal, dialog, explicit]) assertCompactProtocol(output);
});

test("AI Talk emits a typed retrieval context and unlocks only on explicit follow-up", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prompt = "在 banner-spin.vue 中，积分阶段 PROGRESS_TASK_ID: 7，然后一样展示进度和奖励。";
  const target = path.join(root, "src", "index.ts");
  const before = await readFile(target, "utf8");
  const payload = await routeDebug(root, prompt);
  const output = await routeUser(root, prompt);

  assert.equal(payload.recommended_skill, "gen-code");
  assert.deepEqual(executionGateFor(prompt, payload), { authorized: false, skill: null });
  assert.deepEqual(executionGateFor("开始执行", null), { authorized: false, skill: null });
  for (const heading of ["用户目标：", "项目上下文：", "建议检索：", "实现边界：", "建议 Skill："]) {
    assert.ok(output.includes(heading), output);
  }
  assert.ok(output.includes("建议 Skill：\ngen-code"), output);
  assert.ok(output.includes("项目上下文：\n- 目标文件：banner-spin.vue"), output);
  assert.equal(payload.skill_handoff.execution_focus, "任务 7 数据 → 积分阶段进度与奖励展示");
  assert.deepEqual(payload.skill_handoff.retrieval_semantics, ["积分阶段任务关联", "进度展示逻辑", "奖励展示逻辑"]);
  assert.equal(output.split("PROGRESS_TASK_ID: 7").length - 1, 0, output);
  assert.ok(!output.includes("关键配置"), output);
  assertCompactProtocol(output);

  const unrelatedCode = await routeUser(root, prompt, ["selected_code=const enabled = true"]);
  const fieldEvidence = await routeUser(root, prompt, ["api=progressValue 与 rewardList 字段映射"]);
  assertCompactProtocol(unrelatedCode);
  assert.ok(fieldEvidence.includes("progressValue"), fieldEvidence);
  assert.ok(fieldEvidence.includes("rewardList"), fieldEvidence);
  for (const old of ["用户原意：", "AI 推导", "已确认上下文：", "研发概念：", "建议优先检索：", "关系与冲突：", "任务协议已生成"]) assert.ok(!output.includes(old), output);
  for (const forbidden of ["已改为", "验证通过", "核心实现见"]) assert.ok(!output.includes(forbidden), output);
  assert.equal(await readFile(target, "utf8"), before);

  assert.deepEqual(executionGateFor("开始执行。", payload), { authorized: true, skill: "gen-code" });
  assert.deepEqual(executionGateFor("用户列举：开始执行", payload), { authorized: false, skill: null });
});

test("real task protocols stay compact without padding", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = [
    ["在 banner-spin.vue 中，积分阶段 PROGRESS_TASK_ID: 7，然后一样展示进度和奖励。", []],
    ["为什么没有展示轮次奖励", []],
    ["state=0 页面却已领取", []],
    ["奖励获取到的时候需要加蒙层，蒙层图片：icon/mask", []],
    ["修复 src/components/reward-card.vue 中 rewardImage 图片没有显示的问题", []],
  ];

  for (const [prompt, evidence] of cases) {
    const output = await routeUser(root, prompt, evidence);
    assertCompactProtocol(output);
  }
});

test("explicit result text does not create an analysis-style acceptance section", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const plain = await routeUser(root, "开发一个弹窗");
  const explicit = await routeUser(root, "开发一个活动弹窗，验收标准：支持关闭；提交成功后展示成功态；兼容旧浏览器");
  const bug = await routeUser(root, "修复弹窗无法关闭，验收标准：可以正常关闭");

  assert.ok(!plain.includes("验收标准："), plain);
  assert.ok(explicit.startsWith("用户目标：\n"), explicit);
  assert.ok(!explicit.includes("\n验收标准：\n"), explicit);
  assert.ok(!explicit.includes("检索语义："), explicit);
  assert.ok(!bug.includes("\n验收标准：\n"), bug);
  assertCompactProtocol(explicit);
});

test("profile-json legacy protocol is disabled and default output is formatted text", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    execFileAsync(process.execPath, [SCRIPT, "--root", root, "--profile-json", "{}"], { encoding: "utf8" }),
    (error) => error.code === 2 && error.stderr.includes("Unknown argument: --profile-json"),
  );
  const output = await routeUser(root, "帮我生成一份前端实施计划");
  assert.match(output, /^用户目标：\n/);
  assertCompactProtocol(output);
});
