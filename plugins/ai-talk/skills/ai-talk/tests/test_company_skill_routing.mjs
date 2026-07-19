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
const CORE_SKILLS = ["ui-self-check", "ai-test", "gen-code", "gen-frontend-plan", "figma-analyze"];

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
    ["检查这个问题，只定位原因，不要修改", "ui-self-check"],
    ["修复 claimed 状态下图片不切换的问题", "gen-code"],
  ];
  for (const [query, expected] of cases) {
    const result = await route(root, query);
    assert.equal(result.recommended_skill, expected, query);
    assert.ok(result.alternative_skills.length <= 2, query);
    assert.match(result.execution_prompt, new RegExp(`使用 Skill：${expected}`), query);
  }
});

test("analysis-only requests never route to gen-code", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const query of ["只分析这个报错，不修改代码", "定位并检查问题，不要修改", "只排查 claimed 状态异常，不修复"]) {
    const result = await route(root, query);
    assert.notEqual(result.recommended_skill, "gen-code", query);
    assert.ok(result.boundaries.some((item) => item.includes("不修改代码")), query);
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
    "original_request", "intent", "evidence", "recommended_skill", "alternative_skills",
    "selection_reason", "boundaries", "unknowns", "execution_prompt",
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
  assert.match(textOutput, /^使用 Skill：ai-test/);
  assert.match(textOutput, /用户原始目标：\n生成 Midscene 测试文件/);
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
    ["检查 claimed 状态图片为什么没有切换，只定位原因，不要修改代码", "ui-self-check", true],
    ["修复 claimed 状态下图片不切换的问题", "gen-code", false],
  ];

  for (const [query, expected, readOnly] of cases) {
    const args = [SCRIPT, "--root", root, "--query", query];
    const textOutput = (await execFileAsync(process.execPath, args, { encoding: "utf8" })).stdout;
    assert.match(textOutput, new RegExp(`^使用 Skill：${expected}`), query);
    assert.ok(textOutput.includes(`用户原始目标：\n${query}`), query);
    assert.doesNotMatch(textOutput, /"score"|"candidates"|截图：|接口：/, query);
    if (readOnly) assert.match(textOutput, /不修改代码/, query);

    const jsonOutput = (await execFileAsync(process.execPath, [...args, "--format", "json"], { encoding: "utf8" })).stdout;
    const result = JSON.parse(jsonOutput);
    assert.equal(result.recommended_skill, expected, query);
    assert.equal(result.original_request, query, query);
    assert.equal(result.execution_prompt.trim(), textOutput.trim(), query);
  }
});

test("execution gate requires an explicit follow-up", () => {
  const previous = { recommended_skill: "gen-code" };
  assert.deepEqual(executionGateFor("修复这个问题", previous), { authorized: false, skill: null });
  assert.deepEqual(executionGateFor("开始执行。", previous), { authorized: true, skill: "gen-code" });
  assert.deepEqual(executionGateFor("调用 gen-code 执行", previous), { authorized: true, skill: "gen-code" });
});

test("missing expected Skill does not fall back across responsibilities", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "route-company-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await addSkill(root, "ui-self-check");
  const result = await route(root, "帮我生成 Midscene 自动化测试");
  assert.equal(result.recommended_skill, "");
  assert.match(result.selection_reason, /需要 ai-test.*未找到.*未改用其他职责/);
  assert.match(result.execution_prompt, /使用 Skill：未找到（需要 ai-test）/);
  assert.match(result.execution_prompt, /安装或启用 ai-test/);

  const output = (await execFileAsync(process.execPath, [
    SCRIPT, "--root", root, "--query", "帮我生成 Midscene 自动化测试",
  ], { encoding: "utf8" })).stdout;
  assert.match(output, /未找到（需要 ai-test）/);
  assert.match(output, /--source-root <label=path>/);
  assert.doesNotMatch(output, /^使用 Skill：ui-self-check/m);
});

test("fixture content is ordinary UTF-8", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.match(await readFile(path.join(root, "src", "components", "card.ts"), "utf8"), /import/);
});
