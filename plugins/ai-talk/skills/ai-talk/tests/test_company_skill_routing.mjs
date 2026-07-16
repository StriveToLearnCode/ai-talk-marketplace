import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, "../scripts/route-company-skills.mjs");
const CASES = path.resolve(import.meta.dirname, "company-skill-routing-cases.json");
const COMPARE = path.resolve(import.meta.dirname, "../../../docs/skills");
const REPOSITORY = path.resolve(import.meta.dirname, "../../../../../..");
const LEAKED_TERMS = [
  "task_action", "target_category", "desired_output", "execution_mode", "evidence_types",
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

function values(payload, type) {
  return payload.entities[type].map((item) => item.value);
}

function assertCategorizedQueries(payload) {
  assert.equal(payload.schema_version, 4);
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
  assert.equal(real.execution_skill, "ui-self-check");
  assert.equal(company.routing.index.stats.by_scope.project.unique_names, 9);
  assert.equal(company.routing.index.stats.by_scope.companion.unique_names, 1);
  assert.equal(company.execution_skill, "gen-frontend-plan");
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
  assert.equal(payload.execution_skill, "allowed-router");
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
    assert.equal(payload.execution_skill, "ui-self-check", prompt);
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
    assert.equal(payload.execution_skill, "gen-code", prompt);
    assert.equal(payload.routing.retrieval_profile.desired_output, "frontend_code_changes", prompt);
    assert.deepEqual(payload.unknowns, [], prompt);
  }
  const analysis = await routeDebug(root, "这个已有页面显示异常，只分析原因，不修改代码");
  assert.equal(analysis.execution_skill, "ui-self-check");
  assert.equal(analysis.routing.retrieval_profile.desired_output, "live_ui_findings");
});

test("multiple image attachments keep visual, interaction, and API roles with sources", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prompt = "开发 recharge/components/dialogs 下的礼物连爆弹窗";
  const evidence = ["visual=弹窗视觉稿", "interaction=交互流程", "api=连爆次数接口信息"];
  const payload = await routeDebug(root, prompt, evidence);
  const output = await routeUser(root, prompt, evidence);

  assert.equal(payload.execution_skill, "gen-code");
  assert.deepEqual(payload.confirmed_context.slice(0, 3).map((item) => item.type), [
    "visual_design", "interaction_flow", "api_document",
  ]);
  assert.deepEqual(payload.confirmed_context.slice(0, 3).map((item) => item.source), [
    "attachment:1", "attachment:2", "attachment:3",
  ]);
  assert.equal(payload.intent, "feature_create");
  assert.ok(values(payload, "ui_component").includes("dialog"));
  assert.ok(values(payload, "target_scope").includes("recharge/components/dialogs"));
  assert.deepEqual(payload.retrieval_query_groups.components, ["dialog", "modal", "popup"]);
  assertCategorizedQueries(payload);
  for (const text of ["第一张图：弹窗视觉稿", "第二张图：交互流程", "第三张图：连爆次数接口信息", "执行能力：gen-code"]) {
    assert.ok(output.includes(text), output);
  }
});

test("an explicit file bug stays compact and captures only the target and symptom", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prompt = "修复 src/components/reward-card.vue 中图片没有显示的问题";
  const payload = await routeDebug(root, prompt);
  const output = await routeUser(root, prompt);

  assert.equal(payload.execution_skill, "gen-code");
  assert.deepEqual(payload.confirmed_context, [{
    type: "target_file",
    value: "目标文件：src/components/reward-card.vue",
    source: "user_text:path",
  }]);
  assert.ok(values(payload, "issue_symptom").includes("image-not-updated"));
  assert.ok(payload.retrieval_query_groups.code.some((query) => query.includes("src/components/reward-card.vue")));
  assert.deepEqual(payload.unknowns, []);
  assert.ok(output.includes(prompt));
  assert.ok(!output.includes("AGENTS.md"));
  assert.ok(!output.includes("ESLint"));
  assert.ok(!output.includes("Prettier"));
});

test("a generic dialog request expands retrieval vocabulary without inventing requirements", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root, "开发一个弹窗");
  const output = await routeUser(root, "开发一个弹窗");

  assert.equal(payload.execution_skill, "gen-code");
  assert.equal(payload.intent, "feature_create");
  assert.deepEqual(payload.retrieval_query_groups.components, ["dialog", "modal", "popup"]);
  for (const invented of ["确认按钮", "奖励列表", "props", "事件"]) {
    assert.ok(!JSON.stringify(payload).includes(invented), JSON.stringify(payload));
    assert.ok(!output.includes(invented), output);
  }
  assert.deepEqual(payload.confirmed_context, []);
  assert.deepEqual(payload.unknowns, ["弹窗所属页面或目标目录尚未明确。"]);
});

test("image words without attachments never become screenshot context", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root, "图片没有显示，修一下");
  const output = await routeUser(root, "图片没有显示，修一下");

  assert.equal(payload.execution_skill, "gen-code");
  assert.ok(!payload.routing.retrieval_profile.evidence_types.includes("screenshot"));
  assert.ok(!payload.confirmed_context.some((item) => item.type.includes("screenshot")));
  assert.ok(!output.includes("截图"), output);
});

test("coding tasks keep gen-code internal while output centers context and retrieval", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const prompt of ["开发一个弹窗", "新增活动页礼物列表", "这里不对，修一下"]) {
    const payload = await routeDebug(root, prompt);
    const output = await routeUser(root, prompt);
    assert.equal(payload.execution_skill, "gen-code", prompt);
    assert.match(output, /^用户目标：/);
    assert.ok(output.includes("已确认上下文："), output);
    assert.ok(!output.includes("建议检索："), output);
    assert.ok(!output.includes(JSON.stringify(payload.retrieval_queries)), output);
    assert.ok(output.includes("任务边界与未知项："), output);
    assert.match(output, /\n执行能力：gen-code$/);
    assert.ok(!output.includes("AI 已决定"), output);
    assert.ok(!output.includes("为什么选择"), output);
    assert.ok(!output.includes("未选择"), output);
    assertNoLeaks(output);
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
  assert.equal(payload.execution_skill, "gen-code");
  for (const [type, expected] of [
    ["ui_component", "progress-track"], ["business_object", "reward-stage"], ["state", "claimed"],
    ["layout_scene", "RTL"], ["issue_symptom", "progress-display-mismatch"],
  ]) assert.ok(values(payload, type).includes(expected), `${type}: ${JSON.stringify(payload.entities[type])}`);
  assertCategorizedQueries(payload);
  for (const suffix of ["公司 Docs", "Skill", "当前项目已有实现"]) {
    assert.ok(!payload.retrieval_queries.includes(`${prompt} ${suffix}`), JSON.stringify(payload.retrieval_queries));
  }
  for (const text of ["研发概念：", "组件：奖励进度条", "场景：RTL", "状态：已领取", "问题：进度展示异常", "检索方向："]) {
    assert.ok(output.includes(text), output);
  }
  assertNoLeaks(output);
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
  assert.ok(output.includes("当前项目已领取图片状态映射"), output);
  assertCategorizedQueries(payload);
});

test("live visual and interaction inspection uses inspection intent and skill query", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root, "打开页面看看视觉和交互有没有问题");

  assert.equal(payload.intent, "ui_inspection");
  assert.equal(payload.execution_skill, "ui-self-check");
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
  for (const expected of ["任务：UI 修改", "业务：奖励项", "状态：已领取", "视觉效果：蒙层", "资源：icon/mask"]) {
    assert.ok(output.includes(expected), output);
  }
  for (const forbidden of ["目标目录：icon/mask", "范围：icon/mask", "期望交付物尚未明确"]) {
    assert.ok(!output.includes(forbidden), output);
  }
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
    assert.equal(payload.execution_skill, skill, prompt);
    assertCategorizedQueries(payload);
  }
});

test("skill choice is explained only for a real overlapping deliverable", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const plain = await routeUser(root, "开发一个弹窗");
  const ambiguous = await routeUser(root, "先输出前端方案并开发页面");
  assert.ok(!plain.includes("选型说明："), plain);
  assert.ok(ambiguous.includes("选型说明：任务同时提到方案与代码实施"), ambiguous);
  assert.match(ambiguous, /\n执行能力：gen-code$/);
});

test("profile-json legacy protocol is disabled and default output is formatted text", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    execFileAsync(process.execPath, [SCRIPT, "--root", root, "--profile-json", "{}"], { encoding: "utf8" }),
    (error) => error.code === 2 && error.stderr.includes("Unknown argument: --profile-json"),
  );
  const output = await routeUser(root, "帮我生成一份前端实施计划");
  assert.match(output, /^用户目标：/);
  assertNoLeaks(output);
});
