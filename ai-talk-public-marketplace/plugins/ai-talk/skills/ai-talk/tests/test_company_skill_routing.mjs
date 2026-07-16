import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, "../scripts/route-company-skills.mjs");

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

function values(payload, type) {
  return payload.entities[type].map((item) => item.value);
}

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
});

test("asset-like slash identifiers never become directories", async () => {
  for (const resource of ["icon/mask", "icon/close", "progress/bg-1"]) {
    const payload = await debug(`替换图片资源：${resource}`);
    assert.deepEqual(values(payload, "asset_resource"), [resource]);
    assert.ok(!payload.confirmed_context.some((item) => item.type === "target_directory"));
    assert.ok(!values(payload, "target_scope").includes(resource));
  }
});

test("state data and claimed UI are a pending mapping conflict, not a business inference", async () => {
  const payload = await debug("这里 state=0，但页面显示已领取");
  const text = await output("这里 state=0，但页面显示已领取");

  assert.equal(payload.intent, "bug_fix");
  assert.match(payload.relationships_and_conflicts[0], /state=0.*显示“已领取”.*待验证/);
  assertGapShape(gap(payload, "state_mapping"));
  assert.equal(gap(payload, "state_mapping").blocking, false);
  assert.ok(payload.boundaries.includes("不直接假定 state=0 的业务含义。"));
  assert.doesNotMatch(text, /state=0 表示|期望交付物尚未明确|交付物不明确/);
});

test("a generic dialog request invents no controls and asks only for a genuinely blocking scope", async () => {
  const payload = await debug("开发一个弹窗");
  const text = await output("开发一个弹窗");

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
});

test("URL inspection has page entry and goal without unrelated requirements", async () => {
  const payload = await debug("打开这个 URL 检查视觉和交互");
  const text = await output("打开这个 URL 检查视觉和交互");

  assert.equal(payload.intent, "ui_inspection");
  assert.deepEqual(values(payload, "page_entry"), ["provided-url"]);
  assert.deepEqual(values(payload, "inspection_goal"), ["视觉", "交互"]);
  assert.deepEqual(payload.unknowns, []);
  assert.doesNotMatch(text, /上下文缺口：|目标文件|接口|设计稿|上下文已足够/);
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

test("screenshots remain presentation evidence and never become API or code facts", async () => {
  const payload = await debug("按截图检查奖励状态", ["screenshot=页面显示奖励已领取"]);
  assert.ok(payload.relationships_and_conflicts.includes("截图只确认页面表现，不直接证明接口数据或代码实现。"));
  assert.ok(payload.boundaries.includes("不将截图表现当作接口或代码事实。"));
  assert.ok(!payload.confirmed_context.some((item) => ["api_document", "selected_code"].includes(item.type)));
});

test("only five supported task types are emitted", async () => {
  const cases = [
    ["在奖励页开发领取功能", "feature_create"],
    ["这里显示异常，修一下", "bug_fix"],
    ["修改 src/title.vue 的文案", "ui_modify"],
    ["打开当前页面检查视觉", "ui_inspection"],
    ["制定奖励页改造计划", "planning"],
  ];
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
  await assert.rejects(
    run(process.execPath, [SCRIPT, "--query", "开发弹窗", "--profile-json", "{}"], { encoding: "utf8" }),
    (error) => error.code === 2 && error.stderr.includes("Unknown argument: --profile-json"),
  );
});
