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
  "routing details", "AI 将执行", "原因：", "推荐执行", "使用：",
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

test("real repository index and company fixture index are reported separately", async (t) => {
  const companyRoot = await fixture();
  t.after(() => rm(companyRoot, { recursive: true, force: true }));
  const real = await routeDebug(REPOSITORY, "打开页面看看视觉和交互有没有问题");
  const company = await routeDebug(companyRoot, "帮我生成一份前端实施计划");
  assert.deepEqual(real.index.stats.by_scope, { companion: { files: 1, unique_names: 1 } });
  assert.equal(real.recommendation.name, "ui-self-check");
  assert.equal(company.index.stats.by_scope.project.unique_names, 9);
  assert.equal(company.index.stats.by_scope.companion.unique_names, 1);
  assert.equal(company.recommendation.name, "gen-frontend-plan");
});

test("real index reports duplicate names and excludes comparison copies", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const payload = await routeDebug(root, "分析 Figma 原型并输出 Markdown 文档", [], "--source-root", `comparison=${COMPARE}`);
  assert.equal(payload.index.stats.by_scope.project.unique_names, 9);
  assert.deepEqual(payload.index.duplicate_name_conflicts.map((item) => item.name), ["figma-analyze"]);
  assert.ok(payload.index.warnings.some((warning) => warning.includes("Excluded non-runtime")));
  for (const item of [payload.recommendation, ...payload.alternatives].filter(Boolean)) {
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
  assert.equal(payload.recommendation.name, "allowed-router");
  assert.ok(![payload.recommendation, ...payload.alternatives].filter(Boolean).some((item) => item.name === "ignored-router"));
});

test("benchmark prints confusion matrix and meets thresholds", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = JSON.parse(await readFile(CASES, "utf8"));
  const results = await Promise.all(cases.map(async (item) => {
    const payload = await routeDebug(root, item.prompt, item.evidence_types || []);
    const top3 = [payload.recommendation, ...payload.alternatives].filter(Boolean).map((candidate) => candidate.name);
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
    assert.equal(payload.recommendation.name, "ui-self-check", prompt);
    assert.equal(payload.retrieval_profile.desired_output, "live_ui_findings", prompt);
  }
});

test("screenshot evidence requires an attachment flag or an explicit reference phrase", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const prompt of ["为什么没有显示已领取图片", "检查图标和背景图", "替换奖励图片"]) {
    const payload = await routeDebug(root, prompt);
    assert.ok(!payload.retrieval_profile.evidence_types.includes("screenshot"), prompt);
    assert.ok(!payload.recommendation_basis.some((reason) => reason.includes("提供了截图")), prompt);
  }
  for (const prompt of ["见截图，奖励状态异常", "参考截图修改页面", "截图如下，请检查页面", "根据这张图实现页面"]) {
    const payload = await routeDebug(root, prompt);
    assert.ok(payload.retrieval_profile.evidence_types.includes("screenshot"), prompt);
  }
  const attachment = await routeDebug(root, "检查奖励状态", ["screenshot"]);
  assert.ok(attachment.retrieval_profile.evidence_types.includes("screenshot"));
});

test("existing UI bugs default to code fixes unless explicitly analysis-only", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const prompt of ["为什么奖励状态没有显示", "这里不对，修一下", "已有页面奖励状态显示异常，见截图", "这个页面有问题，定位并修复", "分析原因并修复这个页面异常"]) {
    const payload = await routeDebug(root, prompt);
    assert.equal(payload.recommendation.name, "gen-code", prompt);
    assert.equal(payload.retrieval_profile.desired_output, "frontend_code_changes", prompt);
    assert.equal(payload.blocking_unknown, null, prompt);
  }
  const analysis = await routeDebug(root, "这个已有页面显示异常，只分析原因，不修改代码");
  assert.equal(analysis.recommendation.name, "ui-self-check");
  assert.equal(analysis.retrieval_profile.desired_output, "live_ui_findings");
});

test("four reviewed cases pass route-to-formatter end to end", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = [
    {
      prompt: "为什么第三个奖励已经领取，却没有显示已领取图片",
      expected: "gen-code",
      present: ["Bug 修复", "负责代码开发", "📁 当前页面代码"],
      absent: ["用户明确提供了截图", "只分析还是修改", "执行前需确认："],
    },
    {
      prompt: "帮我生成一份前端实施计划",
      expected: "gen-frontend-plan",
      present: ["负责实施方案设计", "为什么不用代码开发？"],
    },
    {
      prompt: "打开页面看看视觉和交互有没有问题",
      expected: "ui-self-check",
      present: ["负责浏览器检查", "🌐 当前页面"],
      absent: ["gen-code"],
    },
    {
      prompt: "生成并运行 Midscene 测试",
      expected: "ai-test",
      present: ["负责自动化测试", "为什么不用浏览器检查？"],
    },
  ];
  for (const item of cases) {
    const debug = await routeDebug(root, item.prompt);
    const output = await routeUser(root, item.prompt);
    assert.equal(debug.recommendation.name, item.expected, item.prompt);
    assert.ok(output.includes(`🛠 AI 已决定\n${item.expected}\n`), output);
    for (const text of item.present || []) assert.ok(output.includes(text), output);
    for (const text of item.absent || []) assert.ok(!output.includes(text), output);
    assertNoLeaks(output);
    assert.ok((output.match(/^✓ /gm) || []).length <= 4, output);
    assert.ok((output.match(/^为什么不用/gm) || []).length <= 1, output);
  }
});

test("execution brief exposes only real contexts selected for this turn", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prompt = "参考设计稿和接口文档，根据截图直接实现页面，复用已有组件";
  const output = await routeUser(root, prompt, ["screenshot"]);
  for (const context of [
    "📁 当前页面代码", "📐 当前设计稿", "🔌 当前接口", "🖼 用户截图", "🧩 当前项目已有组件",
  ]) assert.ok(output.includes(context), output);
  assert.ok(!output.includes("AGENTS.md"), output);

  await writeFile(path.join(root, "AGENTS.md"), "# Project instructions\n");
  const withInstructions = await routeUser(root, prompt, ["screenshot"]);
  assert.ok(withInstructions.includes("📖 AGENTS.md"), withInstructions);

  const withoutEvidence = await routeUser(root, "直接实现这个页面");
  for (const absent of ["当前设计稿", "当前接口", "用户截图", "当前项目已有组件"]) {
    assert.ok(!withoutEvidence.includes(absent), withoutEvidence);
  }

  const explicitAbsence = await routeUser(root, "没有设计稿，也没有接口文档，直接实现这个页面");
  assert.ok(!explicitAbsence.includes("当前设计稿"), explicitAbsence);
  assert.ok(!explicitAbsence.includes("当前接口"), explicitAbsence);
  assert.ok(!explicitAbsence.includes("已提供设计稿"), explicitAbsence);
  assert.ok(!explicitAbsence.includes("已提供接口信息"), explicitAbsence);
});

test("execution brief keeps the four product questions scannable and hides routing internals", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = await routeUser(root, "见截图，这个页面显示异常，定位并修复", ["screenshot"]);
  const headings = ["💡 AI 理解", "🤔 为什么这样决定？", "🚀 AI 将利用", "🛠 AI 已决定"];
  let previous = -1;
  for (const heading of headings) {
    const current = output.indexOf(heading);
    assert.ok(current > previous, output);
    previous = current;
  }
  assertNoLeaks(output);
  assert.ok(!output.includes("读取规范"), output);
  assert.ok(!output.includes("格式化代码"), output);
  assert.ok(!output.includes("验证代码"), output);
});

test("profile-json legacy protocol is disabled and default output is formatted text", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    execFileAsync(process.execPath, [SCRIPT, "--root", root, "--profile-json", "{}"], { encoding: "utf8" }),
    (error) => error.code === 2 && error.stderr.includes("Unknown argument: --profile-json"),
  );
  const output = await routeUser(root, "帮我生成一份前端实施计划");
  assert.match(output, /^💡 AI 理解/);
  assertNoLeaks(output);
});
