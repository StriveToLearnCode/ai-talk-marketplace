import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { routeCompanySkills } from "../scripts/route-company-skills.mjs";
import { buildExecutionPrompt } from "../scripts/route-company-skills/build-execution-prompt.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, "../scripts/route-company-skills.mjs");
const CURRENT_CASE = JSON.parse(await readFile(path.join(import.meta.dirname, "screenshot-development-case.json"), "utf8"));
const CURRENT_EXPECTED = JSON.parse(await readFile(path.join(import.meta.dirname, "screenshot-development-expected.json"), "utf8"));

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-screenshot-"));
  const skill = path.join(root, ".agents", "skills", "gen-code");
  await mkdir(skill, { recursive: true });
  await writeFile(path.join(skill, "SKILL.md"), "---\nname: gen-code\ndescription: 生成页面代码和业务逻辑。\n---\n");
  const components = path.join(root, "src", "components");
  await mkdir(components, { recursive: true });
  await writeFile(path.join(components, "level-progress.vue"), [
    "<template><div class=\"progress\"><RewardNode v-for=\"reward in rewards\" /></div></template>",
    "<script setup>const RewardNode = {}; const points = 0; const stage = 0;</script>",
    "",
  ].join("\n"));
  await writeFile(path.join(components, "activity-banner.vue"), [
    "<template><section dir=\"rtl\" class=\"guardian-area\"><LevelProgress /></section></template>",
    "<script setup>import LevelProgress from './level-progress.vue'; const openH5 = () => {};</script>",
    "<style>.guardian-area { direction: rtl; }</style>",
    "",
  ].join("\n"));
  await writeFile(path.join(components, "mod4.vue"), [
    "<template><button v-for=\"reward in rewards\" @click=\"selectReward(reward)\">{{ reward.name }}</button></template>",
    "<script setup>const rewards = []; const selectReward = (reward) => reward;</script>",
    "",
  ].join("\n"));
  await writeFile(path.join(components, "AGENTS.md"), "component rules\n");
  return root;
}

function currentCaseEvidence() {
  return structuredClone(CURRENT_CASE.evidence_entries);
}

async function route(root, evidenceEntries = currentCaseEvidence(), query = CURRENT_CASE.query, extra = {}) {
  return routeCompanySkills({
    root,
    query,
    sourceRoots: [],
    excludeRoots: [],
    evidenceTypes: [],
    evidenceEntries,
    limit: 3,
    debugJson: false,
    ...extra,
  });
}

test("builds the complete screenshot development protocol", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, currentCaseEvidence(), CURRENT_CASE.query, { debugJson: true });
  const plan = result.execution_plan;

  assert.deepEqual(Object.keys(plan), [
    "schema_version", "route", "workspace", "workflow", "task", "knowledge_requirements", "retrieval", "target_scope",
    "source_facts", "constraints", "blockers", "verification",
  ]);
  assert.equal(plan.schema_version, "1.1");
  assert.deepEqual(plan.route, { skill: "gen-code", authorization: "inspect_only" });
  assert.equal(plan.task.deliverable, "以图 3 为目标，实现积分奖励阶段 UI；图 1、2、4 仅作参考。");
  assert.equal(plan.task.reasoning, "这是现有奖励横幅的积分阶段扩展。优先复用进度、奖励展示和跳转能力；新增重点是图 3 的守护者区域及 RTL 布局。");
  assert.deepEqual(plan.knowledge_requirements, ["积分阶段", "奖励展示", "页面资源", "半屏 H5"]);
  assert.deepEqual(plan.retrieval.map((item) => item.entry), ["图 4 的 Page Center 配置"]);
  assert.deepEqual(plan.retrieval.map((item) => item.evidence), ["user_specified"]);
  assert.deepEqual(
    plan.source_facts.filter((item) => item.kind === "attachment_reference").map((item) => item.role),
    ["comparison", "reference", "target", "reference"],
  );
  assert.ok(plan.source_facts.some((item) => item.kind === "interaction" && item.effect.includes("openH5")));
  assert.ok(plan.source_facts.some((item) => item.kind === "progress_semantics" && item.meaning.includes("下一奖励阶段")));
  assert.deepEqual(
    plan.source_facts.filter((item) => item.kind === "resource_reference").map((item) => [item.resource, item.provider]),
    [["Banner", "Page Center"], ["Playground", "Page Center"]],
  );
  assert.equal(plan.source_facts.filter((item) => item.status === "inference").length, 0);
  assert.equal(plan.blockers.length, 5);
  assert.ok(plan.blockers.every((item) => item.status === "unknown"));
  assert.ok(plan.blockers.every((item) => item.resolution === "search_resolvable" && item.blocking === false));
  assert.deepEqual(plan.constraints, [
    "不根据截图猜接口字段",
    "不根据视觉状态猜业务枚举",
    "优先复用已有 Page Center 资源",
    "不在未确认页面和组件前扩大修改范围",
  ]);
  assert.deepEqual(plan.verification.map((item) => item.kind), [
    "ui_assertion", "interaction_assertion", "state_assertion", "resource_assertion",
  ]);
  assert.equal(result.execution_prompt, buildExecutionPrompt(plan));
  assert.match(result.execution_prompt, /^🎯 任务目标\n/);
  assert.match(result.execution_prompt, /🧠 AI 判断/);
  assert.match(result.execution_prompt, /🎨 页面资源\n→ 图 4 的 Page Center 配置（确认目标模块资源）/);
  assert.doesNotMatch(result.execution_prompt, /需要理解|dialog-reward|reward-dialog/);
  assert.doesNotMatch(result.execution_prompt, /截图理解|UI 结构|当前积分来源未定位|约束|验收目标|执行授权/);
  assert.ok(result.execution_prompt.length <= CURRENT_EXPECTED.execution_prompt.length * 0.4);

  assert.deepEqual(result._debug.context.files_read, []);
  assert.equal(result._debug.context.similar_implementations_read.length, 0);
  assert.equal(result._debug.performance.skill_body_files_read, 0);
  assert.equal(result._debug.skill_index.index_files_read, 1);
  assert.equal(result._debug.performance.search_expansions, 0);
  assert.equal(result._debug.performance.early_stop_reason, "multi_image_evidence_resolved");
  assert.ok(result._debug.performance.total_processing_ms <= 60_000);
});

test("uses the frozen multi-image fast path for a selected target file", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const evidence = [
    { kind: "attachment_reference", attachment: "attachment_1", label: "图1", role: "reference", source: "user", status: "fact" },
    { kind: "attachment_reference", attachment: "attachment_2", label: "图2", role: "target", source: "user", status: "fact" },
    { kind: "ui_structure", name: "奖励展示与选择交互", source: "attachment_2", status: "fact" },
    { kind: "resource_reference", resource: "模块资源", provider: "Page Center", attachment: "attachment_1", source: "attachment_1", reusable: true, status: "fact" },
  ];
  const result = await route(
    root,
    evidence,
    "请以图 2 为目标，实现龙临天域二选一送礼模块，修改 src/components/mod4.vue",
    { debugJson: true },
  );

  assert.equal(result.execution_prompt, [
    "🎯 任务目标",
    "以图 2 为目标，实现龙临天域二选一送礼模块。",
    "",
    "🧠 AI 判断",
    "这是现有页面能力的补充开发。复用 mod4.vue 的奖励展示与选择交互，补齐目标图要求的结构、状态和资源。",
    "",
    "🔍 优先检索",
    "🎁 奖励展示",
    "→ mod4.vue（复用现有展示结构）",
    "🎨 页面资源",
    "→ 图 1 的 Page Center 配置（确认目标模块资源）",
    "",
    "▶ 下一步",
    "当前阶段：修改代码",
    "建议 Skill：gen-code",
  ].join("\n"));
  assert.deepEqual(result._debug.context.files_read.sort(), [
    "src/components/AGENTS.md",
    "src/components/mod4.vue",
  ]);
  assert.equal(result._debug.performance.files_read, 2);
  assert.equal(result._debug.performance.skill_body_files_read, 0);
  assert.equal(result._debug.skill_index.index_files_read, 1);
  assert.equal(result._debug.performance.search_expansions, 0);
  assert.equal(result._debug.performance.early_stop_reason, "fast_path_retrieval_resolved");
  assert.ok(result._debug.performance.total_processing_ms <= 60_000);
});

test("keeps inference out of fact sections and unknowns out of confirmed output", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const evidence = [
    { kind: "attachment_reference", attachment: "attachment_3", role: "target", source: "user", status: "fact" },
    { kind: "resource_reuse_candidate", resource: "活动 Banner", provider: "Page Center", source: "attachment_4", status: "inference", confidence: "high" },
    { kind: "data_requirement", name: "当前积分", source: "derived", status: "unknown" },
  ];
  const result = await route(root, evidence);
  const inferred = result.execution_plan.source_facts.find((item) => item.status === "inference");
  assert.equal(inferred.resource, "活动 Banner");
  assert.doesNotMatch(result.execution_prompt, /活动 Banner|当前积分来源未定位|⚠️ 待确认/);
});

test("renders only the fixed handoff modules and shows at most two hard blockers", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root);
  const headings = result.execution_prompt.split("\n").filter((line) =>
    /^(?:🎯 任务目标|🧠 AI 判断|🔍 优先检索|⚠️ 待确认|▶ 下一步)$/.test(line));
  assert.deepEqual(headings, ["🎯 任务目标", "🧠 AI 判断", "🔍 优先检索", "▶ 下一步"]);

  const blocked = await route(root, [], "修改 missing-one.ts 和 missing-two.ts");
  assert.match(blocked.execution_prompt, /⚠️ 待确认/);
  const section = blocked.execution_prompt.split("⚠️ 待确认\n")[1].split("\n\n▶ 下一步")[0];
  assert.ok(section.split("\n").length <= 2);
});

test("omits screenshot-only sections for non-screenshot requests", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, [], "修复 src/card.ts 中的文案问题");
  assert.doesNotMatch(result.execution_prompt, /截图理解|UI 结构|数据需求|可复用资源|推断（inference）/);
});

test("validates structured evidence and keeps legacy evidence input", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    route(root, [{ kind: "ui_element", name: "积分入口", status: "fact" }]),
    /requires non-empty source/,
  );
  await assert.rejects(
    route(root, [{ kind: "ui_element", name: "积分入口", source: "attachment_3", status: "unknown" }]),
    /must route unknown information through a blocker kind/,
  );
  await assert.rejects(
    route(root, [{ kind: "resource_reuse_candidate", resource: "Banner", source: "attachment_4", status: "inference" }]),
    /requires non-empty confidence/,
  );

  const legacy = await routeCompanySkills({
    root,
    query: "按这张截图开发页面",
    sourceRoots: [],
    excludeRoots: [],
    evidenceTypes: ["screenshot=旧截图摘要"],
    evidenceEntries: [],
    limit: 3,
  });
  assert.ok(legacy.execution_plan.source_facts.some((item) =>
    item.kind === "screenshot" && item.value === "旧截图摘要" && item.status === "fact"));

  await assert.rejects(
    execFileAsync(process.execPath, [SCRIPT, "--root", root, "--query", "开发页面", "--evidence-json", "{bad"], { encoding: "utf8" }),
    /--evidence-json must be a valid JSON object/,
  );
});
