import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { executionGateFor, executionHandoffFor, routeCompanySkills } from "../scripts/route-company-skills.mjs";
import { buildExecutionPrompt } from "../scripts/route-company-skills/build-execution-prompt.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, "../scripts/route-company-skills.mjs");
const ROUTING_CASES = JSON.parse(await readFile(path.join(import.meta.dirname, "company-skill-routing-cases.json"), "utf8"));
const CORE_SKILLS = ["ui-self-check", "ai-test", "gen-code", "gen-frontend-plan", "figma-analyze"];
const EXECUTION_MODES = new Set(["modify_and_verify", "inspect_only", "plan_then_execute", "plan_only"]);

async function addSkill(root, name, description = `${name} description`) {
  const directory = path.join(root, ".agents", "skills", name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: '${description}'\n---\nBODY_MUST_NOT_BE_READ\n`);
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "route-company-skills-"));
  for (const name of CORE_SKILLS) await addSkill(root, name);
  await mkdir(path.join(root, "src", "components"), { recursive: true });
  await writeFile(path.join(root, "AGENTS.md"), "root rule\n");
  await writeFile(path.join(root, "src", "components", "AGENTS.md"), "nearest rule\n");
  await writeFile(path.join(root, "src", "components", "dep.ts"), "export const dep = true;\n");
  await writeFile(path.join(root, "src", "components", "card.ts"), "import { dep } from './dep';\nexport { dep };\n");
  await mkdir(path.join(root, "src", "dialogs"), { recursive: true });
  await mkdir(path.join(root, "src", "composables"), { recursive: true });
  await mkdir(path.join(root, "src", "pages"), { recursive: true });
  await mkdir(path.join(root, "src", "api"), { recursive: true });
  await mkdir(path.join(root, "src", "stores"), { recursive: true });
  await mkdir(path.join(root, "src", "dynamic"), { recursive: true });
  await writeFile(path.join(root, "src", "dialogs", "self-select-dialog.vue"), "<template><BaseDialog /></template>\n");
  await writeFile(path.join(root, "src", "composables", "use-dialog.ts"), "export function useDialog() { return {}; }\n");
  await writeFile(path.join(root, "src", "pages", "page.vue"), "<template><SelfSelectDialog /></template>\n<script setup>onAfterInit(() => {});</script>\n");
  await writeFile(path.join(root, "src", "api", "lottery.ts"), "export async function do_lottery() { return {}; }\n");
  await writeFile(path.join(root, "src", "stores", "reward.ts"), "export function openRewardDialog(payload) { return payload; }\n");
  await writeFile(path.join(root, "src", "stores", "wish.ts"), [
    "export function useStore() {",
    "  const requestLock = false;",
    "  async function chooseWishReward() { return { wish_rewards: [] }; }",
    "  return { requestLock, chooseWishReward, wishRewards: [] };",
    "}",
  ].join("\n"));
  await writeFile(path.join(root, "src", "pages", "wish.vue"), [
    "<template><div>{{ wishRewards }}</div></template>",
    "<script setup>",
    "import { useStore } from '../stores/wish';",
    "const { wishRewards, chooseWishReward } = useStore();",
    "async function handleConfirm() { await chooseWishReward(); closeDialog(); }",
    "</script>",
  ].join("\n"));
  await writeFile(path.join(root, "src", "components", "reward-dialog.vue"), "<template><div>{{ reward.name }}{{ reward.badge }}</div></template>\n");
  await writeFile(path.join(root, "src", "dynamic", "component-loader.ts"), "export const dynamicComponentName = 'LuckyReward';\nexport const componentRegistry = {};\n");
  await writeFile(path.join(root, "src", "components", "LuckyReward.vue"), "<template><div>reward</div></template>\n");
  await writeFile(path.join(root, "src", "components", "button.vue"), "<template><button /></template>\n");
  await writeFile(path.join(root, "src", "components", "iframe.vue"), "<template><iframe /></template>\n");
  await writeFile(path.join(root, "src", "components", "reward-item.vue"), "<template><div class=\"icon/mask\" /></template>\n<script setup>const isClaimed = true;</script>\n");
  await writeFile(path.join(root, "src", "components", "copy-card.vue"), "<template><p>旧文案</p></template>\n");
  await writeFile(path.join(root, "src", "pages", "mod3.vue"), [
    "<template><img :src=\"PageCenter.medalImage\" /></template>",
    "<script setup>",
    "const medalRewards = [];",
    "const Rewards = medalRewards;",
    "function getNodeDisplayReward(index) { return medalRewards[index]; }",
    "</script>",
  ].join("\n"));
  return root;
}

async function route(root, query, extra = {}) {
  return routeCompanySkills({
    root,
    query,
    sourceRoots: [],
    excludeRoots: [],
    evidenceTypes: [],
    limit: 3,
    debugJson: false,
    ...extra,
  });
}

test("routes the seven required MVP scenarios", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = [
    ["打开页面看看视觉和交互", "ui-self-check"],
    ["帮我生成 Midscene 自动化测试", "ai-test"],
    ["先出实施方案，不要修改代码", "gen-frontend-plan"],
    ["根据 Figma 修改这个弹窗", "gen-code"],
    ["分析这个 Figma 页面并输出分析文档", "figma-analyze"],
    ["检查这个问题，只定位原因，不要修改", ""],
    ["修复 claimed 状态下图片不切换的问题", "gen-code"],
  ];
  for (const [query, expected] of cases) {
    const result = await route(root, query);
    assert.equal(result.recommended_skill, expected, query);
    assert.ok(result.alternative_skills.length <= 2, query);
    assert.match(result.execution_prompt, new RegExp(`建议 Skill：${expected}`), query);
  }
});

test("code analysis stays inspect-only without routing to a code generation skill", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const query of ["只分析这个报错，不修改代码", "定位并检查问题，不要修改", "只排查 claimed 状态异常，不修复"]) {
    const result = await route(root, query);
    assert.equal(result.recommended_skill, "", query);
    assert.equal(result.execution_mode, "inspect_only", query);
    assert.ok(result.boundaries.some((item) => item.includes("不修改代码")), query);
    assert.match(result.execution_prompt, /建议 Skill：暂不建议 Skill/, query);
    assert.doesNotMatch(result.execution_prompt, /缺少 gen-code|需安装或启用/, query);
  }
});

test("classifies post-action state not updated as a bug without guessing frontend or backend", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "为什么选择奖励后还是没变化是前端问题还是后端", { debugJson: true });

  assert.equal(result._debug.flags.bug, true);
  assert.equal(result.execution_mode, "inspect_only");
  assert.equal(result.recommended_skill, "");
  assert.deepEqual(result.required_knowledge, [
    "控制层：点击、确认与失败处理",
    "数据层：接口调用、状态回写与请求锁",
    "渲染层：页面最终消费字段",
  ]);
  assert.match(result.engineering_judgment, /不能直接归为前端或后端/);
  assert.deepEqual(result.execution_plan.verification.map((item) => item.owner), [
    "前端错误处理",
    "前端状态同步",
    "后端状态持久化或查询",
  ]);
  assert.match(result.execution_prompt, /操作接口返回新值，页面仍显示旧值 → 前端状态同步/);
  assert.doesNotMatch(result.execution_prompt, /新增页面功能|gen-code/);

  const ownershipOnly = await route(root, "前端还是后端");
  assert.equal(ownershipOnly.execution_mode, "inspect_only");
  assert.equal(ownershipOnly.recommended_skill, "");
  assert.deepEqual(ownershipOnly.required_knowledge, result.required_knowledge);
});

test("preserves diagnostic evidence, target line, and responsibility conditions in the handoff", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const evidenceEntries = [
    {
      kind: "diagnostic_fact",
      source: "src/pages/wish.vue:5",
      status: "fact",
      layer: "data",
      signal: "operation_response_contains_latest_state",
      description: "choose_wish_reward 返回最新 wish_rewards",
    },
    {
      kind: "diagnostic_fact",
      source: "src/pages/wish.vue:5",
      status: "fact",
      layer: "data",
      signal: "operation_response_discarded",
      description: "前端丢弃该响应",
    },
    {
      kind: "diagnostic_fact",
      source: "src/stores/wish.ts:2",
      status: "fact",
      layer: "data",
      signal: "refresh_may_be_skipped_by_request_lock",
      description: "二次刷新可能被 useStore 请求锁跳过",
    },
    {
      kind: "diagnostic_fact",
      source: "src/pages/wish.vue:1",
      status: "fact",
      layer: "render",
      signal: "render_reads_field",
      description: "页面渲染只读取 wishRewards",
    },
  ];
  const result = await route(
    root,
    "为什么 src/pages/wish.vue:5 选择奖励后没变化，是前端还是后端",
    { evidenceEntries },
  );

  assert.equal(result.execution_mode, "inspect_only");
  assert.equal(result.recommended_skill, "");
  assert.ok(result.execution_plan.target_scope.some((item) =>
    item.value === "src/pages/wish.vue" && item.line === 5));
  assert.deepEqual(result.execution_plan.retrieval.map((item) => item.knowledge), [
    "控制层：点击、确认与失败处理",
    "数据层：接口调用、状态回写与请求锁",
    "渲染层：页面最终消费字段",
  ]);
  assert.deepEqual(
    result.execution_plan.source_facts.filter((item) => item.kind === "diagnostic_fact").map((item) => item.description),
    evidenceEntries.map((item) => item.description),
  );
  assert.equal(result.execution_plan.verification.filter((item) => item.kind === "responsibility_condition").length, 3);
  assert.equal(
    result.engineering_judgment,
    "当前代码存在明确的前端状态同步风险：选择接口返回的新状态未被消费，后续查询又可能被请求锁跳过。应先验证接口响应；若响应已包含新奖励 ID，可直接判定为前端问题。",
  );
});

test("continues an inspect-only diagnosis without rerouting, rescanning, or losing evidence", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = await route(root, "为什么 src/pages/wish.vue:5 选择奖励后没变化，是前端还是后端", {
    evidenceEntries: [{
      kind: "diagnostic_fact",
      source: "src/pages/wish.vue:5",
      status: "fact",
      layer: "data",
      signal: "operation_response_contains_latest_state",
      description: "choose_wish_reward 返回最新 wish_rewards",
    }],
  });

  const handoff = await routeCompanySkills({
    root: path.join(root, "does-not-exist"),
    query: "执行",
    previousContract: previous,
  });

  assert.equal(handoff.continued, true);
  assert.equal(handoff.authorized, false);
  assert.equal(handoff.skill, null);
  assert.equal(handoff.execution_mode, "inspect_only");
  assert.deepEqual(handoff.execution_plan.source_facts, previous.execution_plan.source_facts);
  assert.deepEqual(handoff.execution_plan.verification, previous.execution_plan.verification);
  assert.deepEqual(handoff.execution_plan.retrieval, previous.execution_plan.retrieval);
  assert.ok(!handoff.execution_plan.blockers.some((item) =>
    (typeof item === "string" ? item : item.description).includes("执行确认")));
});

test("turns a state-driven image bug into an executable diagnostic chain", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "定位 claimed 状态下图片不切换的代码原因，只分析，不修改代码");
  assert.equal(result.task_goal, "定位 claimed 状态下图片不切换的代码原因，只分析，不修改代码");
  assert.equal(result.engineering_judgment, "这是状态图片异常定位。复用现有状态来源和转换逻辑；需要调整图片渲染分支。");
  assert.deepEqual(result.required_knowledge, ["状态来源", "状态转换", "图片渲染分支"]);
  assert.deepEqual(result.retrieval_entries.slice(0, 2).map((item) => item.entry), ["claimed", "isClaimed"]);
});

test("derives modification permission from the original request without a second gate", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = [
    ["开发这个模块", "modify_and_verify", "authorized", "修改代码"],
    ["帮我修复这个问题", "modify_and_verify", "authorized", "修改代码"],
    ["为什么这里不显示", "inspect_only", "inspect_only", "定位问题"],
    ["先分析原因，确认后再改", "plan_then_execute", "inspect_only", "定位问题"],
    ["只分析，不要修改代码", "inspect_only", "inspect_only", "定位问题"],
  ];

  for (const [query, mode, authorization, stage] of cases) {
    const result = await route(root, query);
    assert.equal(result.execution_mode, mode, query);
    assert.equal(result.execution_plan.workflow.execution_mode, mode, query);
    assert.equal(result.execution_plan.route.authorization, authorization, query);
    assert.equal(result.stage, stage, query);
    assert.doesNotMatch(result.execution_prompt, /⚠️ 需要确认|回复直接修改|调用 gen-code 执行|执行授权门禁/, query);
    assert.equal([...result.execution_prompt.matchAll(/▶ 下一步/g)].length, 1, query);
    if (mode === "modify_and_verify") {
      assert.equal(result.recommended_skill, "gen-code", query);
      assert.match(result.execution_prompt, /当前阶段：修改代码\n建议 Skill：gen-code（修改并验证）/, query);
    }
  }

  const ambiguous = await route(root, "帮我看看");
  const blockers = ambiguous.execution_plan.blockers.filter((item) => item.blocking === true);
  assert.equal(ambiguous.execution_mode, "inspect_only");
  assert.equal(blockers.length, 1);
  assert.match(ambiguous.execution_prompt, /⚠️ 需要确认\n- 你希望只定位问题，还是允许修改并验证？/);
});

test("treats event-and-effect requests as code changes without requiring an explicit modify verb", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await addSkill(root, "create-component-document", "为组件生成文档，记录点击交互和 audio 资源");
  const requests = [
    "ai talk点击tab的时候 播放 audio/btn",
    "四个 tab 点击时都播放 audio/btn，第三个 tab 原有跳转保持不变",
    "进入页面后自动打开活动弹窗",
  ];

  for (const query of requests) {
    const result = await route(root, query);
    assert.equal(result.recommended_skill, "gen-code", query);
    assert.equal(result.execution_mode, "modify_and_verify", query);
    assert.equal(result.execution_plan.route.authorization, "authorized", query);
    assert.doesNotMatch(result.execution_prompt, /⚠️ 需要确认/, query);
  }

  const audioRequest = await route(root, requests[0]);
  assert.ok(audioRequest.evidence.some((item) => item.type === "resource" && item.value === "audio/btn"));

  for (const query of [
    "为什么点击 tab 的时候不播放 audio/btn",
    "只排查点击 tab 时没有播放 audio/btn 的原因，不修改代码",
  ]) {
    const result = await route(root, query);
    assert.equal(result.recommended_skill, "", query);
    assert.equal(result.execution_mode, "inspect_only", query);
    assert.equal(result.execution_plan.route.authorization, "inspect_only", query);
  }
});

test("treats how-to questions as plan requests and requires existing component evidence", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "这个弹窗的奖励需要动效怎么办");

  assert.equal(result.recommended_skill, "gen-frontend-plan");
  assert.equal(result.execution_mode, "plan_only");
  assert.deepEqual(result.required_knowledge, ["奖励弹窗渲染入口", "既有奖励动效组件", "动效降级行为"]);
  assert.ok(result.boundaries.some((item) => item.includes("先核对现有奖励渲染组件及组件文档")));
  assert.match(result.engineering_judgment, /已有奖励组件的动效能力和静态降级/);
  assert.doesNotMatch(result.execution_prompt, /⚠️ 需要确认|修改并验证/);

  const diagnostic = await route(root, "奖励弹窗动效不显示怎么办");
  assert.equal(diagnostic.execution_mode, "inspect_only");
  assert.equal(diagnostic.recommended_skill, "");
});

test("structured routing cases assert mode, preserved semantics, boundaries, exclusions, and unknowns", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = ROUTING_CASES.filter((item) => item.expected_mode);
  assert.ok(cases.length >= 8, "expected a meaningful set of mode-aware routing cases");

  for (const item of cases) {
    assert.ok(EXECUTION_MODES.has(item.expected_mode), `${item.id}: invalid expected_mode`);
    for (const field of ["must_preserve", "must_include_boundaries", "must_not_include", "expected_unknowns"]) {
      if (Object.hasOwn(item, field)) assert.ok(Array.isArray(item[field]), `${item.id}: ${field} must be an array`);
    }

    const result = await route(root, item.prompt, { evidenceTypes: item.evidence_types || [] });
    assert.equal(result.recommended_skill, item.expected_skill, `${item.id}: skill`);
    assert.equal(result.execution_mode, item.expected_mode, `${item.id}: mode`);
    for (const value of item.must_preserve || []) {
      assert.ok(JSON.stringify(result.execution_plan).includes(value), `${item.id}: should preserve ${value}`);
    }
    for (const value of item.must_include_boundaries || []) {
      assert.ok(result.boundaries.some((boundary) => boundary.includes(value)), `${item.id}: boundary ${value}`);
    }
    for (const value of item.must_not_include || []) {
      assert.ok(!result.execution_prompt.includes(value), `${item.id}: should not include ${value}`);
    }
    for (const value of item.expected_unknowns || []) {
      assert.ok(result.unknowns.some((unknown) => unknown.includes(value)), `${item.id}: unknown ${value}`);
    }
    if (Object.hasOwn(item, "expected_unknowns") && item.expected_unknowns.length === 0) {
      assert.deepEqual(result.unknowns, [], `${item.id}: unexpected unknowns`);
    }
  }
});

test("Figma is evidence for code work and the target for analysis documents", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const code = await route(root, "参考 Figma 修复 RewardDialog");
  const document = await route(root, "分析 Figma 并输出 Markdown 分析文档");
  assert.equal(code.recommended_skill, "gen-code");
  assert.ok(code.evidence.some((item) => item.type === "figma"));
  assert.equal(document.recommended_skill, "figma-analyze");
});

test("keeps screenshot, design, API, selected code, and file evidence distinct", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "见截图，根据 Figma 和接口文档修改 src/components/card.ts", {
    evidenceTypes: ["visual=弹窗视觉稿", "api=getReward", "selected_code=renderReward()"],
  });
  const types = new Set(result.evidence.map((item) => item.type));
  for (const type of ["screenshot", "figma", "design", "api", "selected_code", "target_file"]) assert.ok(types.has(type), type);
});

test("extracts only the retained named entities", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "修复充值页 RewardDialog 调用 getReward 接口后 state=claimed 图片不切换");
  const entries = result.evidence.map((item) => `${item.type}:${item.value}`);
  assert.ok(entries.includes("target_page:充值"));
  assert.ok(entries.includes("component:RewardDialog"));
  assert.ok(entries.includes("api_name:getReward"));
  assert.ok(entries.includes("state:state=claimed"));
});

test("reads only the explicit file and its nearest AGENTS.md", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "src", "unrelated.ts"), "SECRET_UNRELATED\n");
  const result = await route(root, "修改 src/components/card.ts", { debugJson: true });
  assert.deepEqual(result._debug.context.files_read.sort(), [
    "src/components/AGENTS.md",
    "src/components/card.ts",
  ]);
  assert.ok(!JSON.stringify(result).includes("SECRET_UNRELATED"));
});

test("rejects target escapes, node_modules, and symlinks outside the project", async (t) => {
  const root = await fixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "route-company-outside-"));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  await writeFile(path.join(outside, "outside.ts"), "outside\n");
  await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
  await writeFile(path.join(root, "node_modules", "pkg", "index.ts"), "dependency\n");
  await symlink(path.join(outside, "outside.ts"), path.join(root, "src", "linked.ts"));

  for (const target of ["../outside.ts", "node_modules/pkg/index.ts", "src/linked.ts"]) {
    const result = await route(root, `修改 ${target}`, { debugJson: true });
    assert.deepEqual(result._debug.context.files_read, [], target);
    assert.ok(result.unknowns.some((item) => item.includes("无法在项目根目录内读取")), target);
  }
});

test("project Skill wins over plugin and company copies while conflicts remain visible", async (t) => {
  const root = await fixture();
  const company = await mkdtemp(path.join(os.tmpdir(), "route-company-source-"));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(company, { recursive: true, force: true })]));
  await addSkill(company, "gen-code", "company gen-code");
  const result = await route(root, "修复页面代码", {
    sourceRoots: [`company=${path.join(company, ".agents", "skills")}`],
    debugJson: true,
  });
  const selected = result._debug.candidates.find((item) => item.name === "gen-code");
  assert.equal(selected.scope, "project");
  assert.ok(result._debug.skill_index.duplicate_name_conflicts.some((item) => item.name === "gen-code"));
});

test("default output is minimal and scores only appear in debug mode", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const plain = await route(root, "修复 claimed 状态下图片不切换的问题");
  assert.deepEqual(Object.keys(plain), [
    "original_request", "task_goal", "engineering_judgment", "required_knowledge", "retrieval_entries",
    "intent", "evidence", "recommended_skill", "alternative_skills", "selection_reason", "boundaries",
    "stage", "execution_mode", "unknowns", "added_context", "skipEnhancement", "execution_plan", "execution_prompt",
  ]);
  assert.ok(!JSON.stringify(plain).includes('"score"'));
  const debug = await route(root, "修复 claimed 状态下图片不切换的问题", { debugJson: true });
  assert.ok(debug._debug.candidates.every((item) => Number.isFinite(item.score)));
});

test("CLI defaults to text and exposes JSON only through explicit flags", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseArgs = [
    SCRIPT, "--root", root, "--query", "生成 Midscene 测试文件", "--top-k", "5", "--evidence-type", "screenshot",
  ];
  const textOutput = (await execFileAsync(process.execPath, baseArgs, { encoding: "utf8" })).stdout;
  assert.match(textOutput, /^(?:当前需求已经明确，无需额外增强。|🧩 已补充上下文|🔍 公司检索入口|⚠️ 需要确认)/);
  assert.doesNotMatch(textOutput, /🎯 任务目标|🧠 AI 判断|🔍 优先检索/);
  assert.match(textOutput, /建议 Skill：ai-test/);
  assert.doesNotMatch(textOutput, /"score"|"candidates"/);

  const jsonOutput = (await execFileAsync(process.execPath, [...baseArgs, "--format", "json"], { encoding: "utf8" })).stdout;
  const result = JSON.parse(jsonOutput);
  assert.equal(result.recommended_skill, "ai-test");
  assert.ok(!Object.hasOwn(result, "_debug"));

  const debugOutput = (await execFileAsync(process.execPath, [...baseArgs, "--debug-json"], { encoding: "utf8" })).stdout;
  assert.ok(Object.hasOwn(JSON.parse(debugOutput), "_debug"));
});

test("the seven release scenarios pass through the real CLI", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = [
    ["打开页面看看视觉和交互", "ui-self-check", false],
    ["帮我生成 Midscene 自动化测试", "ai-test", false],
    ["先输出实施方案，不要修改代码", "gen-frontend-plan", true],
    ["根据 Figma 修改这个弹窗", "gen-code", false],
    ["分析这个 Figma 页面，不修改代码", "figma-analyze", true],
    ["检查 claimed 状态图片为什么没有切换，只定位原因，不要修改代码", "", true],
    ["修复 claimed 状态下图片不切换的问题", "gen-code", false],
  ];

  for (const [query, expected, readOnly] of cases) {
    const args = [SCRIPT, "--root", root, "--query", query];
    const textOutput = (await execFileAsync(process.execPath, args, { encoding: "utf8" })).stdout;
    assert.match(textOutput, new RegExp(`建议 Skill：${expected}`), query);
    assert.doesNotMatch(textOutput, /🎯 任务目标|🔍 优先检索/, query);
    assert.doesNotMatch(textOutput, /"score"|"candidates"|截图：|接口：/, query);

    const jsonOutput = (await execFileAsync(process.execPath, [...args, "--format", "json"], { encoding: "utf8" })).stdout;
    const result = JSON.parse(jsonOutput);
    assert.equal(result.recommended_skill, expected, query);
    assert.equal(result.original_request, query, query);
    assert.equal(result.execution_prompt.trim(), textOutput.trim(), query);
    if (readOnly) assert.ok(result.boundaries.some((item) => /不(?:要)?修改|只出方案/.test(item)), query);
  }
});

test("follow-up execution confirmation is reserved for plan-then-execute", () => {
  const previous = { recommended_skill: "gen-code", execution_prompt: "任务目标：\n修复问题。" };
  assert.deepEqual(executionGateFor("修复这个问题", previous), { authorized: false, skill: null });
  assert.deepEqual(executionGateFor("开始执行。", previous), { authorized: true, skill: "gen-code" });
  assert.deepEqual(executionGateFor("确认修改", previous), { authorized: true, skill: "gen-code" });
  assert.deepEqual(executionGateFor("用户说‘开始执行’", previous), { authorized: false, skill: null });
});

test("plan-then-execute hands off from the planning Skill to gen-code", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const plan = await route(root, "先给方案，确认后再改");

  assert.equal(plan.execution_mode, "plan_then_execute");
  assert.equal(plan.recommended_skill, "gen-frontend-plan");
  assert.equal(plan.execution_plan.workflow.next_skill, "gen-code");
  assert.equal(plan.execution_plan.route.authorization, "inspect_only");

  const handoff = executionHandoffFor("确认执行", plan);
  assert.equal(handoff.execution_mode, "modify_and_verify");
  assert.equal(handoff.skill, "gen-code");
  assert.equal(handoff.execution_plan.route.skill, "gen-code");
  assert.equal(handoff.execution_plan.workflow.next_skill, null);
  assert.match(handoff.execution_prompt, /当前阶段：修改代码\n建议 Skill：gen-code（修改并验证）/);
});

test("authorized handoff carries the plan and updates only its authorization", () => {
  const previous = {
    recommended_skill: "stale-skill",
    execution_plan: {
      schema_version: "1.0",
      route: { skill: "gen-code", authorization: "inspect_only" },
      workspace: { project_root: "/repo", workdir: null },
      workflow: { stage: { value: null, source: "unavailable", status: "unavailable" } },
      task: { source_request: "修复问题", deliverable: null },
      target_scope: [],
      source_facts: [],
      constraints: ["只定位问题，不修改代码"],
      blockers: [
        "方案完成后需要一次执行确认。",
        "业务字段未确认。",
      ],
      verification: [],
    },
  };
  const handoff = executionHandoffFor("开始执行", previous);
  assert.equal(handoff.authorized, true);
  assert.equal(handoff.skill, "gen-code");
  assert.equal(handoff.execution_plan.route.authorization, "authorized");
  assert.equal(previous.execution_plan.route.authorization, "inspect_only");
  assert.deepEqual(handoff.execution_plan.constraints, ["只定位问题，不修改代码"]);
  assert.deepEqual(handoff.execution_plan.blockers, ["业务字段未确认。"]);
  assert.equal(handoff.execution_prompt, buildExecutionPrompt(handoff.execution_plan));
});

test("denied handoff adds the authorization blocker only once", () => {
  const previous = {
    recommended_skill: "gen-code",
    original_request: "修复问题",
    execution_plan: {
      schema_version: "1.1",
      route: { skill: "gen-frontend-plan", authorization: "inspect_only" },
      workspace: { project_root: "/repo", workdir: null },
      workflow: {
        execution_mode: "plan_then_execute",
        next_skill: "gen-code",
        stage: { value: "方案设计", source: "derived", status: "available" },
      },
      task: { source_request: "先给方案，确认后再改", deliverable: "方案", reasoning: null },
      knowledge_requirements: [],
      retrieval: [],
      target_scope: [],
      source_facts: [],
      constraints: [],
      blockers: [],
      verification: [],
    },
  };
  const first = executionHandoffFor("修复这个问题", previous);
  const second = executionHandoffFor("修复这个问题", first);
  const blockers = second.execution_plan.blockers.filter((item) =>
    (typeof item === "string" ? item : item.description).includes("一次执行确认"),
  );
  assert.equal(blockers.length, 1);
});

test("the production CLI applies the execution gate to a previous contract", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = await route(root, "先分析原因，确认后再改 src/components/card.ts");
  const contract = path.join(root, "previous-contract.json");
  await writeFile(contract, JSON.stringify(previous));

  const output = (await execFileAsync(process.execPath, [
    SCRIPT, "--root", root, "--query", "开始执行", "--previous-contract", contract, "--format", "json",
  ], { encoding: "utf8" })).stdout;
  const authorizedResult = JSON.parse(output);
  assert.equal(authorizedResult.execution_plan.route.authorization, "authorized");
  assert.equal(authorizedResult.execution_mode, "modify_and_verify");
  assert.match(authorizedResult.execution_prompt, /建议 Skill：gen-code/);

  const denied = (await execFileAsync(process.execPath, [
    SCRIPT, "--root", root, "--query", "用户说‘开始执行’", "--previous-contract", contract, "--format", "json",
  ], { encoding: "utf8" })).stdout;
  const deniedResult = JSON.parse(denied);
  assert.equal(deniedResult.authorized, false);
  assert.equal(deniedResult.skill, null);
  assert.equal(deniedResult.execution_plan.route.authorization, "inspect_only");
  assert.ok(deniedResult.execution_plan.blockers.some((item) =>
    (typeof item === "string" ? item : item.description).includes("一次执行确认")));
  assert.equal(deniedResult.execution_prompt, buildExecutionPrompt(deniedResult.execution_plan));
});

test("does not treat a metalinguistic Figma example as evidence or a task target", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "修复审查误判：示例词 Figma 被错误当成真实证据和任务目标");
  assert.equal(result.intent.target, "code");
  assert.ok(!result.evidence.some((item) => item.type === "figma"));
});

test("extracts a target file after a Chinese colon", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "修改目标文件：src/components/card.ts", { debugJson: true });
  assert.ok(result.evidence.some((item) => item.type === "target_file" && item.value === "src/components/card.ts"));
  assert.ok(result._debug.context.files_read.includes("src/components/card.ts"));

  const withLine = await route(root, "为什么 src/components/card.ts 第 20 行选择后没变化");
  assert.ok(withLine.execution_plan.target_scope.some((item) =>
    item.value === "src/components/card.ts" && item.line === 20));
});

test("execution plan is the source of the compatibility prompt", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const query = "修复 claimed 状态下图片不切换的问题";
  const result = await route(root, query);
  assert.equal(result.execution_plan.schema_version, "1.1");
  assert.deepEqual(Object.keys(result.execution_plan), [
    "schema_version", "route", "workspace", "workflow", "task", "knowledge_requirements", "retrieval", "target_scope",
    "source_facts", "constraints", "blockers", "verification",
  ]);
  assert.deepEqual(result.execution_plan.route, { skill: "gen-code", authorization: "authorized" });
  assert.equal(result.execution_plan.workflow.execution_mode, "modify_and_verify");
  assert.equal(result.execution_plan.workspace.project_root, await realpath(root));
  assert.equal(result.execution_plan.workspace.workdir, null);
  assert.equal(result.execution_plan.task.source_request, query);
  assert.equal(result.execution_plan.task.deliverable, result.task_goal);
  assert.ok(result.execution_plan.source_facts.some((item) =>
    item.kind === "state" && item.type === "state" && item.value === "claimed" && item.status === "fact"));
  assert.equal(result.execution_prompt, buildExecutionPrompt(result.execution_plan));
});

test("missing expected Skill does not fall back across responsibilities", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "route-company-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await addSkill(root, "ui-self-check");
  const result = await route(root, "帮我生成 Midscene 自动化测试");
  assert.equal(result.recommended_skill, "");
  assert.match(result.selection_reason, /需要 ai-test.*未找到.*未改用其他职责/);
  assert.equal(result.execution_plan.route.skill, null);
  assert.ok(result.execution_plan.blockers.some((item) => item.description.includes("安装或启用 ai-test")));

  const output = (await execFileAsync(process.execPath, [
    SCRIPT, "--root", root, "--query", "帮我生成 Midscene 自动化测试",
  ], { encoding: "utf8" })).stdout;
  assert.match(output, /缺少 ai-test Skill/);
  assert.doesNotMatch(output, /建议 Skill：ui-self-check/);
});

test("builds knowledge-first retrieval protocols for the five acceptance cases", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const dialog = await route(root, "帮我开发一个弹窗组件模板，并一进入页面就开启。");
  assert.deepEqual(dialog.required_knowledge, ["弹窗模板结构", "弹窗打开与关闭方式", "页面首次进入生命周期", "页面弹窗挂载方式"]);
  assert.deepEqual(dialog.retrieval_entries.map((item) => item.entry), ["self-select-dialog.vue"]);
  assert.ok(dialog.retrieval_entries.every((item) => item.purpose));
  assert.ok(dialog.retrieval_entries.every((item) => item.source));
  assert.doesNotMatch(dialog.execution_prompt, /AGENTS\.md|direct_dependency|直接依赖：/);

  const metadata = await route(root, "修复奖励名称和角标缺失");
  assert.deepEqual(metadata.required_knowledge, ["奖励名称和角标的接口字段", "抽奖结果到弹窗数据的适配", "奖励弹窗的字段渲染"]);
  assert.deepEqual(metadata.retrieval_entries.map((item) => item.entry), ["do_lottery", "openRewardDialog"]);
  assert.deepEqual(metadata.retrieval_entries.map((item) => item.source), [
    "src/api/lottery.ts",
    "src/stores/reward.ts",
  ]);
  assert.doesNotMatch(metadata.execution_prompt, /reward-dialog\.vue/);

  const dynamic = await route(root, "修复动态组件未注册");
  assert.deepEqual(dynamic.required_knowledge, ["动态组件名称生成", "动态组件注册规则", "实际组件名称"]);
  assert.deepEqual(dynamic.retrieval_entries.map((item) => item.entry), ["dynamicComponentName", "componentRegistry"]);
  assert.doesNotMatch(dynamic.execution_prompt, /button\.vue|iframe\.vue/);

  const claimed = await route(root, "奖励领取后增加 icon/mask");
  assert.deepEqual(claimed.required_knowledge, ["奖励领取状态判断", "icon/mask 资源引用", "奖励节点渲染"]);
  assert.deepEqual(claimed.retrieval_entries.map((item) => item.entry), ["isClaimed", "icon/mask", "reward-item.vue"]);
  assert.ok(claimed.evidence.some((item) => item.type === "resource" && item.value === "icon/mask"));

  const copy = await route(root, "修改 src/components/copy-card.vue 的文案为领取成功");
  assert.deepEqual(copy.required_knowledge, ["目标文案位置"]);
  assert.deepEqual(copy.retrieval_entries.map((item) => item.entry), ["src/components/copy-card.vue"]);
  assert.ok(copy.boundaries.length <= 2);
});

test("clear intermittent reward bug keeps the original request without synthesizing facts", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const query = "最后一个奖励会一会展示、一会不展示。";
  const result = await route(root, query, { debugJson: true });

  assert.equal(result.original_request, query);
  assert.equal(result.skipEnhancement, false);
  assert.deepEqual(result.added_context, []);
  assert.deepEqual(result.retrieval_entries.map((item) => [item.knowledge, item.entry]), [
    ["轮播切换", "mod3.vue / getNodeDisplayReward"],
    ["奖励数据", "medalRewards / Rewards"],
    ["图片配置", "mod3.vue / PageCenter"],
  ]);
  assert.match(result.execution_prompt, /^🧠 AI 判断\n/);
  assert.match(result.execution_prompt, /尚不能确认是否与轮播周期同步/);
  assert.match(result.execution_prompt, /🔍 公司检索入口/);
  assert.match(result.execution_prompt, /🔄 轮播切换\n→ mod3\.vue \/ getNodeDisplayReward（确认末项切换时的索引与取值）/);
  assert.match(result.execution_prompt, /🎁 奖励数据\n→ medalRewards \/ Rewards（确认末项奖励字段是否完整）/);
  assert.match(result.execution_prompt, /🖼️ 图片配置\n→ mod3\.vue \/ PageCenter（确认末项图片资源是否存在）/);
  assert.match(result.execution_prompt, /当前阶段：定位问题\n建议 Skill：暂不建议 Skill/);
  assert.doesNotMatch(result.execution_prompt, /定位末项奖励|🎯 任务目标|重点对象/);
  assert.doesNotMatch(result.execution_prompt, /根因(?:是|为)|可以确定/);
  assert.ok(result.execution_prompt.length < 1_000);
  assert.ok(result._debug.performance.total_processing_ms < 45_000);
  assert.ok(result._debug.context.files_read.length <= 4);
  assert.ok(result._debug.context.search_expansions <= 2);
});

test("standard bug continues past one generic entry until two layers are covered", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "src", "pages", "mod3.vue"), "export const Rewards = [];\n");
  await writeFile(path.join(root, "src", "pages", "pagecenter-reward.ts"), "export const PageCenter = { rewardImage: 'asset' };\n");

  const result = await route(root, "最后一个奖励会一会展示、一会不展示。", { debugJson: true });
  assert.deepEqual(result.retrieval_entries.map((item) => item.knowledge), ["奖励数据", "图片配置"]);
  assert.ok(result._debug.context.files_read.length >= 2);
  assert.equal(result._debug.context.stop_reason, "reliable_entry_threshold");
});

test("explicit bug target follows bounded references until two layers are covered", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "src", "pages", "bug-reward.ts"), [
    "import './reward-data';",
    "import './reward-image';",
  ].join("\n"));
  await writeFile(path.join(root, "src", "pages", "reward-data.ts"), "export const Rewards = [];\n");
  await writeFile(path.join(root, "src", "pages", "reward-image.ts"), "export const PageCenter = { rewardImage: 'asset' };\n");

  const result = await route(root, "最后一个奖励一会显示、一会不显示，定位 src/pages/bug-reward.ts", { debugJson: true });
  assert.deepEqual(result.retrieval_entries.slice(0, 2).map((item) => item.knowledge), ["奖励数据", "图片配置"]);
  assert.doesNotMatch(result.execution_prompt, /bug-reward\.ts（定位轮播切换/);
  assert.equal(result._debug.context.files_read.length, 4);
  assert.equal(result._debug.context.stop_reason, "fast_path_retrieval_resolved");
});

test("explicit copy change skips enhancement", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "修改 src/components/copy-card.vue 的文案为领取成功");
  assert.equal(result.skipEnhancement, true);
  assert.deepEqual(result.added_context, []);
  assert.match(result.execution_prompt, /^当前需求已经明确，无需额外增强。\n\n▶ 下一步/);
  assert.doesNotMatch(result.execution_prompt, /已补充上下文|公司检索入口|任务目标/);
});

test("multi-image task only adds the target and reference relationship", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "根据图3实现奖励区域，图1和图4作为参考。", {
    evidenceEntries: [
      { kind: "attachment_reference", attachment: "attachment_1", label: "图1", role: "reference", source: "user", status: "fact" },
      { kind: "attachment_reference", attachment: "attachment_3", label: "图3", role: "target", source: "user", status: "fact" },
      { kind: "attachment_reference", attachment: "attachment_4", label: "图4", role: "reference", source: "user", status: "fact" },
    ],
  });
  assert.deepEqual(result.added_context, ["图片关系：图 3为目标图；图 1、图 4为参考图"]);
  assert.doesNotMatch(result.execution_prompt, /截图理解|UI 结构|验收标准|完整描述/);
});

test("API and page mismatch adds only the conflict relationship", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "接口返回已领取，但页面显示未领取");
  assert.deepEqual(result.added_context, ["冲突关系：接口返回与页面展示不一致"]);
  assert.match(result.execution_prompt, /🧩 已补充上下文\n- 冲突关系：接口返回与页面展示不一致/);
  assert.match(result.execution_prompt, /当前阶段：定位问题\n建议 Skill：暂不建议 Skill/);
  assert.doesNotMatch(result.execution_prompt, /需要确认/);
  assert.doesNotMatch(result.execution_prompt, /任务目标/);
});

test("ambiguous request asks exactly one question", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "帮我看看");
  const section = result.execution_prompt.split("⚠️ 需要确认\n")[1].split("\n\n▶ 下一步")[0];
  assert.equal(result.skipEnhancement, false);
  assert.equal(section.split("\n").length, 1);
  assert.equal(section, "- 你希望只定位问题，还是允许修改并验证？");
});

test("fixture content is ordinary UTF-8", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.match(await readFile(path.join(root, "src", "components", "card.ts"), "utf8"), /import/);
});
