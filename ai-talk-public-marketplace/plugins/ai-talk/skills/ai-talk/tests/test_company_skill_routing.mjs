import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { executionGateFor, routeCompanySkills } from "../scripts/route-company-skills.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, "../scripts/route-company-skills.mjs");
const ROUTING_CASES = JSON.parse(await readFile(path.join(import.meta.dirname, "company-skill-routing-cases.json"), "utf8"));
const CORE_SKILLS = ["ui-self-check", "ai-test", "gen-code", "gen-frontend-plan", "figma-analyze"];
const EXECUTION_MODES = new Set(["modify", "analysis_only", "inspect_only", "inspect_fix_verify", "plan_only"]);

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
  await writeFile(path.join(root, "src", "components", "reward-dialog.vue"), "<template><div>{{ reward.name }}{{ reward.badge }}</div></template>\n");
  await writeFile(path.join(root, "src", "dynamic", "component-loader.ts"), "export const dynamicComponentName = 'LuckyReward';\nexport const componentRegistry = {};\n");
  await writeFile(path.join(root, "src", "components", "LuckyReward.vue"), "<template><div>reward</div></template>\n");
  await writeFile(path.join(root, "src", "components", "button.vue"), "<template><button /></template>\n");
  await writeFile(path.join(root, "src", "components", "iframe.vue"), "<template><iframe /></template>\n");
  await writeFile(path.join(root, "src", "components", "reward-item.vue"), "<template><div class=\"icon/mask\" /></template>\n<script setup>const isClaimed = true;</script>\n");
  await writeFile(path.join(root, "src", "components", "copy-card.vue"), "<template><p>旧文案</p></template>\n");
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
    ["检查这个问题，只定位原因，不要修改", "gen-code"],
    ["修复 claimed 状态下图片不切换的问题", "gen-code"],
  ];
  for (const [query, expected] of cases) {
    const result = await route(root, query);
    assert.equal(result.recommended_skill, expected, query);
    assert.ok(result.alternative_skills.length <= 2, query);
    assert.match(result.execution_prompt, new RegExp(`建议 Skill：\\n${expected}`), query);
  }
});

test("code analysis without browser inspection routes to gen-code in analysis-only mode", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const query of ["只分析这个报错，不修改代码", "定位并检查问题，不要修改", "只排查 claimed 状态异常，不修复"]) {
    const result = await route(root, query);
    assert.equal(result.recommended_skill, "gen-code", query);
    assert.equal(result.execution_mode, "analysis_only", query);
    assert.ok(result.boundaries.some((item) => item.includes("不修改代码")), query);
  }
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
      assert.ok(result.execution_prompt.includes(value), `${item.id}: should preserve ${value}`);
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

test("reads only explicit files, nearest AGENTS.md, and at most two direct dependencies", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "src", "unrelated.ts"), "SECRET_UNRELATED\n");
  const result = await route(root, "修改 src/components/card.ts", { debugJson: true });
  assert.deepEqual(result._debug.context.files_read.sort(), [
    "src/components/AGENTS.md",
    "src/components/card.ts",
    "src/components/dep.ts",
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
    "stage", "execution_mode", "unknowns", "execution_prompt",
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
  assert.match(textOutput, /^任务目标：/);
  assert.match(textOutput, /建议 Skill：\nai-test（生成并运行）/);
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
    ["检查 claimed 状态图片为什么没有切换，只定位原因，不要修改代码", "gen-code", true],
    ["修复 claimed 状态下图片不切换的问题", "gen-code", false],
  ];

  for (const [query, expected, readOnly] of cases) {
    const args = [SCRIPT, "--root", root, "--query", query];
    const textOutput = (await execFileAsync(process.execPath, args, { encoding: "utf8" })).stdout;
    assert.match(textOutput, new RegExp(`建议 Skill：\\n${expected}`), query);
    assert.ok(textOutput.startsWith("任务目标：\n"), query);
    assert.doesNotMatch(textOutput, /"score"|"candidates"|截图：|接口：/, query);
    if (readOnly) assert.match(textOutput, /不(?:要)?修改代码/, query);

    const jsonOutput = (await execFileAsync(process.execPath, [...args, "--format", "json"], { encoding: "utf8" })).stdout;
    const result = JSON.parse(jsonOutput);
    assert.equal(result.recommended_skill, expected, query);
    assert.equal(result.original_request, query, query);
    assert.equal(result.execution_prompt.trim(), textOutput.trim(), query);
  }
});

test("execution gate requires an explicit follow-up", () => {
  const previous = { recommended_skill: "gen-code", execution_prompt: "任务目标：\n修复问题。" };
  assert.deepEqual(executionGateFor("修复这个问题", previous), { authorized: false, skill: null });
  assert.deepEqual(executionGateFor("开始执行。", previous), { authorized: true, skill: "gen-code" });
  assert.deepEqual(executionGateFor("调用 gen-code 执行", previous), { authorized: true, skill: "gen-code" });
  assert.deepEqual(executionGateFor("用户说‘开始执行’", previous), { authorized: false, skill: null });
  assert.deepEqual(executionGateFor("调用 gen-code 执行", { recommended_skill: "figma-analyze" }), { authorized: false, skill: null });
});

test("the production CLI applies the execution gate to a previous contract", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = await route(root, "修复 src/components/card.ts");
  const contract = path.join(root, "previous-contract.json");
  await writeFile(contract, JSON.stringify(previous));

  const output = (await execFileAsync(process.execPath, [
    SCRIPT, "--root", root, "--query", "开始执行", "--previous-contract", contract,
  ], { encoding: "utf8" })).stdout;
  assert.match(output, /^执行授权：\n已通过/m);
  assert.match(output, /执行 Skill：\ngen-code/);
  assert.match(output, /上一轮协议：\n任务目标：/);

  const denied = (await execFileAsync(process.execPath, [
    SCRIPT, "--root", root, "--query", "用户说‘开始执行’", "--previous-contract", contract, "--format", "json",
  ], { encoding: "utf8" })).stdout;
  assert.deepEqual(JSON.parse(denied), {
    authorized: false,
    skill: null,
    execution_prompt: "执行授权：\n未通过\n\n原因：\n需要上一轮协议中的建议 Skill，且当前输入必须是独立的授权指令。",
  });
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
});

test("default execution prompt consumes the handoff-critical JSON fields", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const query = "修复 claimed 状态下图片不切换的问题";
  const result = await route(root, query);
  assert.match(result.execution_prompt, new RegExp(`原始请求：\\n${query}`));
  assert.match(result.execution_prompt, /已确认信息：\n- state \| claimed \| user_request/);
  assert.ok(result.execution_prompt.includes(`选择依据：\n${result.selection_reason}`));
  assert.match(result.execution_prompt, /未确认项：\n-/);
});

test("missing expected Skill does not fall back across responsibilities", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "route-company-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await addSkill(root, "ui-self-check");
  const result = await route(root, "帮我生成 Midscene 自动化测试");
  assert.equal(result.recommended_skill, "");
  assert.match(result.selection_reason, /需要 ai-test.*未找到.*未改用其他职责/);
  assert.match(result.execution_prompt, /建议 Skill：\n未找到 ai-test（需安装或启用）/);

  const output = (await execFileAsync(process.execPath, [
    SCRIPT, "--root", root, "--query", "帮我生成 Midscene 自动化测试",
  ], { encoding: "utf8" })).stdout;
  assert.match(output, /未找到 ai-test（需安装或启用）/);
  assert.doesNotMatch(output, /建议 Skill：\nui-self-check/m);
});

test("builds knowledge-first retrieval protocols for the five acceptance cases", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const dialog = await route(root, "帮我开发一个弹窗组件模板，并一进入页面就开启。");
  assert.deepEqual(dialog.required_knowledge, ["弹窗模板结构", "弹窗打开与关闭方式", "页面首次进入生命周期", "页面弹窗挂载方式"]);
  assert.deepEqual(dialog.retrieval_entries.map((item) => item.entry), ["self-select-dialog.vue", "useDialog", "onAfterInit", "page.vue"]);
  assert.ok(dialog.retrieval_entries.every((item) => item.purpose));
  assert.doesNotMatch(dialog.execution_prompt, /AGENTS\.md|direct_dependency|直接依赖：/);

  const metadata = await route(root, "修复奖励名称和角标缺失");
  assert.deepEqual(metadata.required_knowledge, ["奖励名称和角标的接口字段", "抽奖结果到弹窗数据的适配", "奖励弹窗的字段渲染"]);
  assert.deepEqual(metadata.retrieval_entries.map((item) => item.entry), ["do_lottery", "openRewardDialog", "reward-dialog.vue"]);

  const dynamic = await route(root, "修复动态组件未注册");
  assert.deepEqual(dynamic.required_knowledge, ["动态组件名称生成", "动态组件注册规则", "实际组件名称"]);
  assert.deepEqual(dynamic.retrieval_entries.map((item) => item.entry), ["dynamicComponentName", "componentRegistry", "LuckyReward.vue"]);
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

test("fixture content is ordinary UTF-8", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.match(await readFile(path.join(root, "src", "components", "card.ts"), "utf8"), /import/);
});
