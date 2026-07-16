import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

<<<<<<< HEAD
const run = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, "../scripts/route-company-skills.mjs");
=======
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
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)

async function debug(prompt, evidence = [], extra = []) {
  const args = [SCRIPT, "--query", prompt, "--debug-json", ...extra];
  for (const item of evidence) args.push("--evidence-type", item);
  return JSON.parse((await run(process.execPath, args, { encoding: "utf8" })).stdout);
}

async function output(prompt, evidence = [], extra = []) {
  const args = [SCRIPT, "--query", prompt, ...extra];
  for (const item of evidence) args.push("--evidence-type", item);
  return (await run(process.execPath, args, { encoding: "utf8" })).stdout.trim();
}

function chineseCharacterCount(value) {
  return [...value.matchAll(/\p{Script=Han}/gu)].length;
}

function assertCompactProtocol(output, { minChineseCharacters = 0 } = {}) {
  const chineseHeadings = new Set([
    "任务目标：", "研发对象：", "状态：", "视觉效果：", "资源：", "配置变量：", "接口字段：",
    "关键关系：", "检索语义：", "实现约束：", "建议 Skill：",
  ]);
  const englishHeadings = new Set(["Goal", "Context", "Need Knowledge", "Assumptions", "Constraints", "Next Skill"]);
  const lines = output.split("\n").filter(Boolean);
  const chineseCharacters = chineseCharacterCount(output);
  assert.ok(chineseCharacters >= minChineseCharacters, `protocol too short (${chineseCharacters} Chinese characters):\n${output}`);
  assert.ok(lines.length <= 40, `protocol exceeds one screen (${lines.length} lines):\n${output}`);
  const chinese = lines[0] === "任务目标：";
  assert.equal(lines[0], chinese ? "任务目标：" : "Goal", output);
  assert.ok(chineseCharacterCount(lines[1] || "") <= 50, `goal exceeds 50 Chinese characters:\n${output}`);
  for (const old of ["研发语义", "Semantic Context", "\nObject\n", "\nRelation\n", "Development Report", "OCR 总结", "建议执行", "验收标准", "分析过程", "评分", "Prompt", "AI 推导"]) {
    assert.ok(!output.includes(old), output);
  }
  const allowedHeadings = chinese ? chineseHeadings : englishHeadings;
  const headings = lines.filter((line) => allowedHeadings.has(line));
  assert.equal(new Set(headings).size, headings.length, output);
  if (chinese) {
    assert.ok(lines.every((line, index) => index < 2 || chineseHeadings.has(line) || line.startsWith("- ")), output);
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

<<<<<<< HEAD
function gap(payload, type) {
  return payload.unknowns.find((item) => item.type === type);
}

function assertGapShape(item) {
  assert.ok(item);
  assert.ok(["project", "docs", "skill", "user", undefined].includes(item.suggested_source));
  assert.ok(Object.keys(item).every((key) => ["type", "reason", "blocking", "suggested_source"].includes(key)));
  assert.equal(typeof item.type, "string");
  assert.equal(typeof item.reason, "string");
  assert.equal(typeof item.blocking, "boolean");
}

test("reward mask classifies slash identifier as an asset and leaves state lookup non-blocking", async () => {
  const payload = await debug("奖励获取后增加蒙层，资源 icon/mask");
  const text = await output("奖励获取后增加蒙层，资源 icon/mask");

  assert.equal(payload.intent, "ui_modify");
  assert.deepEqual(values(payload, "asset_resource"), ["icon/mask"]);
  assert.ok(!values(payload, "target_scope").includes("icon/mask"));
  assert.ok(!payload.confirmed_context.some((item) => item.type === "target_directory"));
  assertGapShape(gap(payload, "state_condition"));
  assert.equal(gap(payload, "state_condition").blocking, false);
  assert.equal(payload.unknowns.filter((item) => item.blocking).length, 0);
  assert.match(text, /建议来源：当前项目代码。/);
  assert.match(text, /非阻塞，执行阶段先验证。/);
  assert.doesNotMatch(text, /阻塞，需要先确认。/);
=======
function assertCategorizedQueries(payload) {
  assert.equal(payload.schema_version, 5);
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
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
});

test("asset-like slash identifiers never become directories", async () => {
  for (const resource of ["icon/mask", "icon/close", "progress/bg-1"]) {
    const payload = await debug(`替换图片资源：${resource}`);
    assert.deepEqual(values(payload, "asset_resource"), [resource]);
    assert.ok(!payload.confirmed_context.some((item) => item.type === "target_directory"));
    assert.ok(!values(payload, "target_scope").includes(resource));
  }
});

<<<<<<< HEAD
test("state data and claimed UI are a pending mapping conflict, not a business inference", async () => {
  const payload = await debug("这里 state=0，但页面显示已领取");
  const text = await output("这里 state=0，但页面显示已领取");

  assert.equal(payload.intent, "bug_fix");
  assert.match(payload.relationships_and_conflicts[0], /state=0.*显示“已领取”.*待验证/);
  assertGapShape(gap(payload, "state_mapping"));
  assert.equal(gap(payload, "state_mapping").blocking, false);
  assert.ok(payload.boundaries.includes("不直接假定 state=0 的业务含义。"));
  assert.doesNotMatch(text, /state=0 表示|期望交付物尚未明确|交付物不明确/);
=======
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
  for (const text of ["任务目标：", "礼物连爆弹窗", "研发对象：", "recharge/components/dialogs", "弹窗", "建议 Skill：\n- gen-code"]) assert.ok(output.includes(text), output);
  for (const screenshotDetail of ["弹窗视觉稿", "交互流程", "连爆次数接口信息"]) assert.ok(!output.includes(screenshotDetail), output);
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
  assert.deepEqual(payload.unknowns, []);
  assert.ok(output.includes("研发对象：\n- src/components/reward-card.vue"), output);
  assert.ok(output.includes("检索语义：\n- 图片资源绑定\n- 图片展示条件\n- 当前项目同类实现"), output);
  assert.equal(output.split("src/components/reward-card.vue").length - 1, 2, output);
  assert.ok(output.includes("修复目标图片未显示问题。"), output);
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
  assert.ok(output.includes("研发对象：\n- 弹窗"), output);
  assert.ok(output.includes("检索语义：\n- 弹窗组件复用\n- 弹窗触发逻辑\n- 弹窗交互逻辑"), output);
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
    assert.match(output, /^任务目标：\n/);
    assert.ok(!output.includes(JSON.stringify(payload.retrieval_queries)), output);
    assert.match(output, /\n建议 Skill：\n- gen-code$/);
    for (const old of ["用户目标：", "AI 推导（Task Reasoning）：", "已确认上下文：", "研发概念：", "建议优先检索：", "关系与冲突："]) {
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
  for (const text of ["研发对象：", "奖励进度条", "状态：\n- 已领取状态", "检索语义："]) assert.ok(output.includes(text), output);
  assert.ok(!output.includes("RTL 页面奖励阶段进度条，已领取状态显示异常"), output);
  assertCompactProtocol(output);
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
});

test("a generic dialog request invents no controls and asks only for a genuinely blocking scope", async () => {
  const payload = await debug("开发一个弹窗");
  const text = await output("开发一个弹窗");

<<<<<<< HEAD
  assert.equal(payload.intent, "feature_create");
  assert.deepEqual(payload.unknowns.map((item) => item.type), ["target_scope"]);
  assert.equal(payload.unknowns[0].blocking, true);
  const userFacts = JSON.stringify({
    confirmed_context: payload.confirmed_context,
    entities: payload.entities,
    acceptance_criteria: payload.acceptance_criteria,
  });
  for (const invented of ["确认按钮", "props", "事件", "颜色", "尺寸"]) {
    assert.ok(!userFacts.includes(invented));
  }
  assert.match(text, /不补充用户未确认的按钮、属性、事件或样式/);
  assert.doesNotMatch(text, /expected_behavior|target_scope|feature_create/);
=======
  assert.equal(payload.intent, "bug_fix");
  assert.ok(values(payload, "state").includes("claimed"));
  assert.ok(values(payload, "issue_symptom").includes("image-not-updated"));
  assert.ok(!payload.confirmed_context.some((item) => item.type.includes("screenshot")));
  assert.ok(!payload.routing.retrieval_profile.evidence_types.includes("screenshot"));
  assert.ok(!output.includes("截图"), output);
  assert.ok(output.includes("检索语义：\n- 图片资源绑定\n- 图片展示条件\n- 当前项目同类实现"), output);
  assertCategorizedQueries(payload);
  assertCompactProtocol(output);
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
});

test("URL inspection has page entry and goal without unrelated requirements", async () => {
  const payload = await debug("打开这个 URL 检查视觉和交互");
  const text = await output("打开这个 URL 检查视觉和交互");

  assert.equal(payload.intent, "ui_inspection");
<<<<<<< HEAD
  assert.deepEqual(values(payload, "page_entry"), ["provided-url"]);
  assert.deepEqual(values(payload, "inspection_goal"), ["视觉", "交互"]);
  assert.deepEqual(payload.unknowns, []);
  assert.doesNotMatch(text, /上下文缺口：|目标文件|接口|设计稿|上下文已足够/);
=======
  assert.equal(payload.recommended_skill, "ui-self-check");
  assert.deepEqual(payload.retrieval_query_groups.skills, ["浏览器即时视觉与交互检查"]);
  assert.ok(payload.retrieval_query_groups.skills.every((query) => !query.includes("Bug") && !query.includes("修复")));
  assertCategorizedQueries(payload);
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
});

test("an explicit-file copy change produces a compact gap-free contract", async () => {
  const prompt = "修改 src/components/title.vue 的文案为“立即领取”";
  const payload = await debug(prompt);
  const text = await output(prompt);

  assert.equal(payload.intent, "ui_modify");
  assert.deepEqual(payload.unknowns, []);
  assert.deepEqual(payload.confirmed_context, [{
    type: "target_file",
    value: "目标文件：src/components/title.vue",
    source: "user_text:path",
  }]);
  assert.equal(payload.entities.visual_change[0].label, "文案改为“立即领取”");
  assert.doesNotMatch(text, /上下文缺口：|接口|设计稿|测试|期望交付物/);
  assert.match(text, /文案改为“立即领取”/);
});

<<<<<<< HEAD
test("screenshots remain presentation evidence and never become API or code facts", async () => {
  const payload = await debug("按截图检查奖励状态", ["screenshot=页面显示奖励已领取"]);
  assert.ok(payload.relationships_and_conflicts.includes("截图只确认页面表现，不直接证明接口数据或代码实现。"));
  assert.ok(payload.boundaries.includes("不将截图表现当作接口或代码事实。"));
  assert.ok(!payload.confirmed_context.some((item) => ["api_document", "selected_code"].includes(item.type)));
=======
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
    "任务目标：\n已领取状态增加 icon/mask 蒙层。", "研发对象：\n- 奖励", "状态：\n- 已领取状态",
    "视觉效果：\n- 蒙层", "资源：\n- icon/mask", "检索语义：\n- 奖励状态映射\n- 蒙层展示逻辑",
  ]) {
    assert.ok(output.includes(expected), output);
  }
  for (const forbidden of ["目标目录：icon/mask", "范围：icon/mask", "期望交付物尚未明确"]) {
    assert.ok(!output.includes(forbidden), output);
  }
  assertCompactProtocol(output);
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
});

test("only five supported task types are emitted", async () => {
  const cases = [
    ["在奖励页开发领取功能", "feature_create"],
    ["这里显示异常，修一下", "bug_fix"],
    ["修改 src/title.vue 的文案", "ui_modify"],
    ["打开当前页面检查视觉", "ui_inspection"],
    ["制定奖励页改造计划", "planning"],
  ];
<<<<<<< HEAD
  for (const [prompt, expected] of cases) assert.equal((await debug(prompt)).intent, expected, prompt);
});

test("optional gaps appear only when the request actually depends on them", async () => {
  const scoped = await debug("在首页开发一个弹窗");
  assert.deepEqual(values(scoped, "target_scope"), ["首页"]);
  assert.equal(gap(scoped, "expected_behavior").blocking, true);

  const data = await debug("在首页开发显示接口数据的列表");
  assert.equal(gap(data, "data_source").blocking, false);
  assert.ok(!gap(data, "visual_reference"));

  const asset = await debug("在 src/title.vue 替换图标");
  assert.equal(gap(asset, "asset_resource").blocking, true);
});

test("default Task Contract contains no internal protocol or retrieval plan", async () => {
  const text = await output("奖励获取后增加蒙层，资源 icon/mask", [], ["--root", "/path/that/must/not/be/read"]);
  for (const heading of ["用户目标：", "已确认上下文：", "研发概念：", "关系与冲突：", "上下文缺口：", "任务边界：", "验收标准："]) {
    assert.ok(text.includes(heading), heading);
  }
  for (const forbidden of [
    "intent", "unknowns", "suggested_source", "retrieval", "检索方向", "检索步骤", "执行能力", "score", "/Users/", "期望交付物尚未明确",
  ]) assert.ok(!text.includes(forbidden), forbidden);
});

test("absolute paths are hidden from the default Task Contract", async () => {
  const text = await output("修改 /Users/example/project/src/title.vue 的文案为“领取”");
  assert.doesNotMatch(text, /\/Users\/example\/project/);
  assert.match(text, /title.vue/);
});

test("at most one blocking gap is emitted", async () => {
  for (const prompt of ["开发一个弹窗", "这里有问题，修一下", "制定一个计划"]) {
    const payload = await debug(prompt);
    assert.ok(payload.unknowns.filter((item) => item.blocking).length <= 1, prompt);
    for (const item of payload.unknowns) assertGapShape(item);
  }
});

test("legacy profile protocol stays disabled", async () => {
=======
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
  assert.deepEqual(rewardProtocol.retrievalSemantics, ["奖励状态映射", "奖励展示条件", "当前项目同类实现"]);

  const taskPayload = await routeDebug(root, "积分阶段 PROGRESS_TASK_ID：7，然后一样展示进度和奖励");
  const taskProtocol = buildExecutionProtocol(taskPayload);
  assert.equal(taskProtocol.goal, "积分阶段接入任务 7，复用现有方式展示进度和奖励。");
  assert.deepEqual(taskProtocol.developmentObjects, ["PROGRESS_TASK_ID=7", "积分阶段"]);
  assert.deepEqual(taskProtocol.relations, ["任务 7 数据 → 积分阶段进度与奖励展示"]);
  assert.deepEqual(taskProtocol.retrievalSemantics, ["积分阶段任务关联", "进度展示逻辑", "奖励展示逻辑"]);
  assert.deepEqual(taskProtocol.constraints, ["复用现有展示方式", "不影响其他阶段"]);
  assert.equal(taskProtocol.nextSkill, "gen-code");

  const vague = await routeUser(root, "这个好像有点不太对");
  assert.equal(vague, "任务目标：\n这个好像有点不太对。");
  for (const output of [formatUserOutput(rewardPayload), formatUserOutput(taskPayload), vague]) assertCompactProtocol(output);
});

test("English input uses the same execution protocol headings", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = await routeUser(root, "Why is the reward not displayed?");

  assert.match(output, /^Goal\nWhy is the reward not displayed\?/);
  for (const old of ["Task Goal:", "Object", "Relation", "Semantic Context"]) assert.ok(!output.includes(old), output);
  assertCompactProtocol(output);
});

test("formatter does not expose retrieval queries or canonical ontology", () => {
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
  assert.ok(output.includes("检索语义：\n- 奖励状态映射\n- 奖励展示条件\n- 当前项目同类实现"), output);
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

test("skill choice is explained only for a real overlapping deliverable", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const plain = await routeUser(root, "开发一个弹窗");
  const ambiguous = await routeUser(root, "先输出前端方案并开发页面");
  const ambiguousDialog = await routeUser(root, "先输出前端方案并开发一个弹窗");
  assert.ok(!plain.includes("冲突："), plain);
  assert.ok(!ambiguous.includes("冲突："), ambiguous);
  assert.ok(ambiguousDialog.includes("弹窗组件复用"), ambiguousDialog);
  assert.ok(!ambiguousDialog.includes("冲突："), ambiguousDialog);
  assert.match(ambiguous, /\n建议 Skill：\n- gen-code$/);
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

  for (const text of ["任务目标：", "研发对象：", "奖励进度条", "状态：\n- 已完成状态", "资源：\n- banner/progress"]) assert.ok(output.includes(text), output);
  for (const screenshotDetail of ["Banner Spin 默认视觉和完成态", "定义整体页面布局和交互流程", "Reward Stage Completed，RTL 页面奖励进度条"]) {
    assert.ok(!output.includes(screenshotDetail), output);
  }
  assertCompactProtocol(output);
});

test("API and page state mismatch yields facts and knowledge gaps without a guessed answer", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = await routeUser(root, "调整奖励页面 UI", ["api=state=0", "screenshot=页面显示已领取"]);

  for (const text of ["接口字段：\n- state=0", "状态：\n- 已领取状态", "奖励状态映射", "奖励展示条件"]) {
    assert.ok(output.includes(text), output);
  }
  assert.ok(output.includes("关键关系：\n- state=0 → 页面领取状态展示"), output);
  assert.ok(!output.includes("页面显示已领取"), output);
  for (const verdict of ["接口错误", "设计稿错误", "state=0 就是已领取"]) assert.ok(!output.includes(verdict), output);
  assertCompactProtocol(output);
});

test("ordinal reward issue becomes business context and explicit knowledge gaps", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = await routeUser(root, "为什么第三个奖励没显示？");

  for (const text of [
    "任务目标：\n定位第 3 个奖励展示异常。", "研发对象：\n- 奖励\n- 第 3 个奖励",
    "检索语义：\n- 奖励状态映射\n- 奖励展示条件\n- 当前项目同类实现",
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
  for (const text of ["研发对象：\n- 轮次奖励", "轮次奖励展示条件", "奖励状态映射"]) {
    assert.ok(roundOutput.includes(text), roundOutput);
  }

  const statePayload = await routeDebug(root, "state=0 页面却已领取");
  const stateOutput = await routeUser(root, "state=0 页面却已领取");
  assert.equal(statePayload.intent, "bug_fix");
  assert.ok(values(statePayload, "issue_symptom").includes("state-display-mismatch"));
  for (const text of ["state=0", "状态：\n- 已领取状态", "状态映射", "展示条件"]) {
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
  for (const text of ["研发对象：\n- 奖励", "资源：\n- icon/mask"]) assert.ok(assetOutput.includes(text), assetOutput);
  for (const invented of ["状态：", "视觉效果："]) assert.ok(!assetOutput.includes(invented), assetOutput);

  const dialogOutput = await routeUser(root, "开发一个弹窗");
  for (const text of ["研发对象：\n- 弹窗", "弹窗组件复用"]) {
    assert.ok(dialogOutput.includes(text), dialogOutput);
  }
  for (const output of [roundOutput, stateOutput, assetOutput, dialogOutput]) assertCompactProtocol(output);
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
  assert.equal(output, [
    "任务目标：",
    "积分阶段接入任务 7，复用现有方式展示进度和奖励。",
    "",
    "研发对象：",
    "- banner-spin.vue",
    "- PROGRESS_TASK_ID=7",
    "- 积分阶段",
    "",
    "关键关系：",
    "- 任务 7 数据 → 积分阶段进度与奖励展示",
    "",
    "检索语义：",
    "- 积分阶段任务关联",
    "- 进度展示逻辑",
    "- 奖励展示逻辑",
    "",
    "实现约束：",
    "- 复用现有展示方式",
    "- 不影响其他阶段",
    "",
    "建议 Skill：",
    "- gen-code",
  ].join("\n"));
  for (const heading of ["任务目标：", "研发对象：", "关键关系：", "检索语义：", "实现约束："]) {
    assert.ok(output.includes(heading), output);
  }
  assert.ok(output.includes("建议 Skill：\n- gen-code"), output);
  assert.ok(output.includes("研发对象：\n- banner-spin.vue\n- PROGRESS_TASK_ID=7\n- 积分阶段"), output);
  assert.ok(output.includes("关键关系：\n- 任务 7 数据 → 积分阶段进度与奖励展示"), output);
  assert.ok(output.includes("检索语义：\n- 积分阶段任务关联\n- 进度展示逻辑\n- 奖励展示逻辑"), output);
  assert.equal(output.split("PROGRESS_TASK_ID=7").length - 1, 1, output);
  assert.ok(!output.includes("关键配置"), output);
  assertCompactProtocol(output);

  const unrelatedCode = await routeUser(root, prompt, ["selected_code=const enabled = true"]);
  const fieldEvidence = await routeUser(root, prompt, ["api=progressValue 与 rewardList 字段映射"]);
  assertCompactProtocol(unrelatedCode);
  assert.ok(fieldEvidence.includes("progressValue"), fieldEvidence);
  assert.ok(fieldEvidence.includes("rewardList"), fieldEvidence);
  for (const old of ["用户目标：", "AI 推导", "已确认上下文：", "研发概念：", "建议优先检索：", "关系与冲突：", "任务协议已生成"]) assert.ok(!output.includes(old), output);
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
  assert.ok(!explicit.includes("验收标准："), explicit);
  assert.ok(explicit.includes("检索语义："), explicit);
  assert.ok(!bug.includes("验收标准："), bug);
  assertCompactProtocol(explicit);
});

test("profile-json legacy protocol is disabled and default output is formatted text", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
  await assert.rejects(
    run(process.execPath, [SCRIPT, "--query", "开发弹窗", "--profile-json", "{}"], { encoding: "utf8" }),
    (error) => error.code === 2 && error.stderr.includes("Unknown argument: --profile-json"),
  );
<<<<<<< HEAD
=======
  const output = await routeUser(root, "帮我生成一份前端实施计划");
  assert.match(output, /^任务目标：\n/);
  assertCompactProtocol(output);
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
});
