import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = path.resolve(
  import.meta.dirname,
  "../scripts/build-capability-index.mjs",
);

async function makeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-capabilities-"));
  await mkdir(path.join(root, ".agents/skills/api-integration"), { recursive: true });
  await mkdir(path.join(root, "prompts"), { recursive: true });
  await mkdir(path.join(root, "src/components"), { recursive: true });
  await mkdir(path.join(root, "src/utils"), { recursive: true });
  await mkdir(path.join(root, "src/pages"), { recursive: true });
  await mkdir(path.join(root, "node_modules/ignored/components"), { recursive: true });

  await writeFile(
    path.join(root, ".agents/skills/api-integration/SKILL.md"),
    `---
name: api-integration
description: 联调奖励接口，核对请求参数、响应映射和异常状态。
---

# API Integration
`,
  );
  await writeFile(
    path.join(root, "prompts/api-review.md"),
    "# 奖励接口联调 Prompt\n\n复用现有请求封装并验证真实响应。\n",
  );
  await writeFile(
    path.join(root, "src/components/RewardCard.vue"),
    "<template><article>Reward</article></template>\n",
  );
  await writeFile(
    path.join(root, "src/utils/request.ts"),
    "export function requestReward() { return null; }\n",
  );
  await writeFile(
    path.join(root, "src/pages/rewards.vue"),
    "<template><RewardCard /></template>\n",
  );
  await writeFile(path.join(root, "AGENTS.md"), "# Project Rules\n\nPrefer existing components.\n");
  await writeFile(
    path.join(root, "node_modules/ignored/components/Hidden.vue"),
    "<template>Hidden</template>\n",
  );
  return root;
}

async function runIndex(root, ...args) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [SCRIPT_PATH, "--root", root, ...args],
    { encoding: "utf8" },
  );
  return JSON.parse(stdout);
}

test("indexes project skills, prompts, standards, components, utilities and implementations", async (t) => {
  const root = await makeFixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const payload = await runIndex(root);

  assert.equal(payload.schema_version, 4);
  assert.equal(payload.stats.by_kind.skill, 1);
  assert.equal(payload.stats.by_kind.prompt, 1);
  assert.equal(payload.stats.by_kind.standard, 1);
  assert.equal(payload.stats.by_kind.component, 1);
  assert.equal(payload.stats.by_kind.utility, 1);
  assert.equal(payload.stats.by_kind.implementation, 1);
  assert.ok(payload.capabilities.every((item) => !item.path.includes("node_modules")));
});

test("selects a main capability, complementary helpers, and automatic supplements", async (t) => {
  const root = await makeFixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const payload = await runIndex(root, "--query", "联调奖励接口并复用 RewardCard 组件");

  assert.ok(payload.selected.length >= 1 && payload.selected.length <= 6);
  assert.equal(payload.selected[0].role, "main");
  assert.ok(payload.selected.slice(1).every((item) => item.role === "auxiliary"));
  assert.ok(payload.selected.some((item) => ["prompt", "component"].includes(item.kind)));
  assert.ok(payload.selected.every((item) => item.kind !== "skill"));
  assert.ok(payload.capabilities.every((item) => item.score > 0));
  assert.deepEqual(payload.lifecycle.user_choice_states, ["prefer_reuse", "prefer_reference", "excluded"]);
  assert.deepEqual(payload.lifecycle.selection_states, ["auto_selected", "choice_required", "low_relevance"]);
  assert.deepEqual(payload.lifecycle.skill_candidate_states, ["candidate"]);
  assert.deepEqual(payload.lifecycle.skill_invocation_states, ["not_invoked", "invoked", "failed", "empty"]);
  assert.deepEqual(payload.lifecycle.execution_validation_states, [
    "confirmed_reuse",
    "partial_reuse",
    "incompatible",
    "reference_only",
  ]);
  for (const candidate of payload.selected) {
    assert.ok(["skill", "component", "utility", "example", "project_rule", "prompt"].includes(candidate.type));
    assert.ok(["candidate_reuse", "candidate_reference", "low_relevance"].includes(candidate.discovery_status));
    assert.equal(candidate.user_choice, null);
    assert.equal(candidate.execution_validation, null);
    assert.ok(candidate.match_reason.length > 0);
    assert.ok(candidate.pending_validation.length > 0);
    assert.ok(candidate.potential_risks.length > 0);
    assert.ok(candidate.pending_validation.every((item) => !item.includes("data shape")));
    assert.ok(candidate.potential_risks.some((item) => item.includes("not automatically a user requirement")));
  }
  assert.ok(payload.skill_candidates.some((item) => item.kind === "skill"));
  assert.ok(payload.skill_candidates.every((item) => item.invocation_status === "not_invoked"));
  assert.deepEqual(payload.choice_required, []);
});

test("automatically selects a unique project component", async (t) => {
  const root = await makeFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, "AGENTS.md"),
    "# Project Rules\n\nReward workflows must prefer existing components.\n",
  );

  const payload = await runIndex(root, "--query", "RewardCard reward component");
  const projectComponent = payload.automatic.find((item) => item.kind === "component");

  assert.ok(projectComponent);
  assert.equal(projectComponent.selection_status, "auto_selected");
  assert.equal(projectComponent.usage_preference, "prefer_reuse");
  assert.equal(projectComponent.selection_source, "ai_talk");
  assert.ok(payload.automatic.some((item) => item.type === "project_rule"));
  assert.deepEqual(payload.choice_required, []);
});

test("accepts an explicit company source without assuming a fixed company path", async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-project-"));
  const companyRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-company-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  t.after(() => rm(companyRoot, { recursive: true, force: true }));

  await mkdir(path.join(companyRoot, "skills/debug-before-change"), { recursive: true });
  await writeFile(
    path.join(companyRoot, "skills/debug-before-change/SKILL.md"),
    `---
name: debug-before-change
description: 前端 Bug 必须先定位根因和运行证据，再决定最小修改。
---
`,
  );

  const payload = await runIndex(
    projectRoot,
    "--source-root",
    `frontend-platform=${companyRoot}`,
    "--query",
    "前端 Bug 先定位根因",
  );

  assert.equal(payload.selected.length, 0);
  assert.equal(payload.skill_candidates[0].source, "frontend-platform");
  assert.equal(payload.skill_candidates[0].scope, "company");
  assert.equal(payload.skill_candidates[0].selection_status, "candidate");
  assert.equal(payload.skill_candidates[0].invocation_status, "not_invoked");
  assert.equal(payload.skill_candidates[0].usage_preference, null);
  assert.ok(payload.roots.some((item) => item.label === "frontend-platform"));
});

test("requires user choice for a shared component outside the project", async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-project-"));
  const companyRoot = await mkdtemp(path.join(os.tmpdir(), "ai-talk-company-component-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  t.after(() => rm(companyRoot, { recursive: true, force: true }));
  await mkdir(path.join(companyRoot, "components"), { recursive: true });
  await writeFile(
    path.join(companyRoot, "components/SharedRewardDialog.vue"),
    "<template><dialog>Shared reward</dialog></template>\n",
  );

  const payload = await runIndex(
    projectRoot,
    "--source-root",
    `frontend-platform=${companyRoot}`,
    "--query",
    "SharedRewardDialog component",
  );

  assert.equal(payload.choice_required.length, 1);
  assert.equal(payload.choice_required[0].kind, "component");
  assert.equal(payload.choice_required[0].selection_status, "choice_required");
  assert.equal(payload.choice_required[0].usage_preference, null);
  assert.equal(payload.choice_required[0].selection_source, null);
});

test("requires user choice when multiple project components are selected", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-component-choice-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src/components"), { recursive: true });
  await writeFile(path.join(root, "src/components/reward-card.vue"), "<template>Reward card</template>\n");
  await writeFile(path.join(root, "src/components/reward-panel.vue"), "<template>Reward panel</template>\n");

  const payload = await runIndex(root, "--query", "reward");

  assert.equal(payload.choice_required.length, 2);
  assert.ok(payload.choice_required.every((item) => item.scope === "project"));
  assert.ok(payload.choice_required.every((item) => item.selection_status === "choice_required"));
});

test("automatically keeps complementary project utilities in one reuse chain", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-project-chain-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src/utils"), { recursive: true });
  await writeFile(
    path.join(root, "src/utils/use-store.ts"),
    "export function useStore() { return null; }\n",
  );
  await writeFile(
    path.join(root, "src/utils/chain-gift-adapter.ts"),
    "export function chainGiftAdapter() { return null; }\n",
  );

  const payload = await runIndex(root, "--query", "useStore chainGiftAdapter");

  assert.equal(payload.automatic.filter((item) => item.kind === "utility").length, 2);
  assert.deepEqual(payload.choice_required, []);
});

test("returns no forced selection when the task has no relevant match", async (t) => {
  const root = await makeFixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const payload = await runIndex(root, "--query", "量子光谱校准");

  assert.deepEqual(payload.selected, []);
  assert.deepEqual(payload.capabilities, []);
});

test("does not promote README examples or generic query words into project constraints", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-readme-fact-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, "README.md"),
    "# Examples\n\n开发一个普通弹窗只是文档示例，不是项目约束。\n",
  );

  const payload = await runIndex(root, "--query", "开发一个普通弹窗");

  assert.deepEqual(payload.selected, []);
  assert.deepEqual(payload.automatic, []);
  assert.deepEqual(payload.choice_required, []);
});

test("keeps overlapping skills as invocation candidates instead of auto-selecting them", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-overlap-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".agents/skills/debug-one"), { recursive: true });
  await mkdir(path.join(root, ".agents/skills/debug-two"), { recursive: true });
  const frontmatter = (name) => `---
name: ${name}
description: 前端 Bug 先定位根因并收集调试证据。
---
`;
  await writeFile(path.join(root, ".agents/skills/debug-one/SKILL.md"), frontmatter("debug-one"));
  await writeFile(path.join(root, ".agents/skills/debug-two/SKILL.md"), frontmatter("debug-two"));

  const payload = await runIndex(root, "--query", "前端 Bug 先定位根因");

  assert.equal(payload.selected.length, 0);
  assert.equal(payload.skill_candidates.length, 2);
  assert.ok(payload.skill_candidates.every((item) => item.selection_status === "candidate"));
});

test("does not let a generic frontend skill override a specialized component search skill", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-skill-specificity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".agents/skills/frontend-dev-coach"), { recursive: true });
  await mkdir(path.join(root, ".agents/skills/company-component-search"), { recursive: true });
  await writeFile(
    path.join(root, ".agents/skills/frontend-dev-coach/SKILL.md"),
    `---
name: frontend-dev-coach
description: 通用前端开发、修改、验证和教学指导。
---
`,
  );
  await writeFile(
    path.join(root, ".agents/skills/company-component-search/SKILL.md"),
    `---
name: company-component-search
description: 查询公司封装的 Vue 弹窗组件、组件文档、props 和事件。
---
`,
  );

  const payload = await runIndex(root, "--query", "开发 Vue 弹窗并查找公司封装组件");

  assert.equal(payload.selected.length, 0);
  assert.ok(payload.skill_candidates.some((item) => item.name === "company-component-search"));
  assert.ok(payload.skill_candidates.some((item) => item.name === "frontend-dev-coach"));
  assert.ok(payload.skill_candidates.every((item) => item.invocation_status === "not_invoked"));
  assert.deepEqual(payload.roots, [{ label: "project", root, scope: "project" }]);
});

test("ranks project code generation Skill independently from ordinary capability limits", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-project-skill-routing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".agents/skills/fe-gen-code"), { recursive: true });
  await mkdir(path.join(root, ".agents/skills/fe-gen-frontend-plan"), { recursive: true });
  await mkdir(path.join(root, ".agents/skills/fe-custom-components-skill"), { recursive: true });
  await mkdir(path.join(root, ".agents/skills/fe-vue-best-practices"), { recursive: true });
  await mkdir(path.join(root, "src/components"), { recursive: true });

  await writeFile(
    path.join(root, ".agents/skills/fe-gen-code/SKILL.md"),
    `---
name: gen-code
description: 从局部玩法、API 或 UI 输入生成代码。用户要求局部生成、加逻辑时使用。
---
`,
  );
  await writeFile(
    path.join(root, ".agents/skills/fe-gen-frontend-plan/SKILL.md"),
    `---
name: gen-frontend-plan
description: 生成前端方案、前端计划和方案文档，不生成代码。
---
`,
  );
  await writeFile(
    path.join(root, ".agents/skills/fe-custom-components-skill/SKILL.md"),
    `---
name: custom-components-skill
description: 新建和维护活动积木组件。
---
`,
  );
  await writeFile(
    path.join(root, ".agents/skills/fe-vue-best-practices/SKILL.md"),
    `---
name: vue-best-practices
description: 通用 Vue 开发规范和最佳实践。
---
`,
  );
  for (let index = 0; index < 300; index += 1) {
    await writeFile(
      path.join(root, `src/components/RewardPreview${index}.vue`),
      `<template><div>reward preview ${index}</div></template>\n`,
    );
  }
  for (let index = 0; index < 21; index += 1) {
    const directory = path.join(root, `.agents/skills/other-skill-${index}`);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "SKILL.md"),
      `---\nname: other-skill-${index}\ndescription: 处理其他独立研发流程。\n---\n`,
    );
  }

  const payload = await runIndex(
    root,
    "--query",
    "RewardPreview0 这部分需要奖励预览",
    "--intent",
    "modify_and_verify",
    "--limit",
    "1",
    "--skill-limit",
    "10",
  );

  assert.equal(payload.capabilities.length, 1);
  assert.equal(payload.skill_candidates[0].name, "gen-code");
  assert.ok(payload.skill_candidates[0].path.includes("/.agents/skills/fe-gen-code/SKILL.md"));
  assert.notEqual(payload.skill_candidates[0].name, "gen-frontend-plan");
  assert.notEqual(payload.skill_candidates[0].name, "custom-components-skill");
  assert.notEqual(payload.skill_candidates[0].name, "vue-best-practices");
  assert.equal(payload.stats.returned, 1);
  assert.equal(payload.stats.skill_returned, 1);
});

test("skills-only scans .agents/skills and returns no ordinary capabilities", async (t) => {
  const root = await makeFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".claude/skills/legacy-code"), { recursive: true });
  await writeFile(
    path.join(root, ".claude/skills/legacy-code/SKILL.md"),
    "---\nname: legacy-code\ndescription: 生成代码、局部生成、加逻辑。\n---\n",
  );

  const payload = await runIndex(
    root,
    "--skills-only",
    "--intent",
    "modify_and_verify",
    "--query",
    "奖励接口加逻辑",
  );

  assert.equal(payload.skills_only, true);
  assert.equal(payload.intent, "modify_and_verify");
  assert.deepEqual(payload.selected, []);
  assert.deepEqual(payload.automatic, []);
  assert.deepEqual(payload.choice_required, []);
  assert.deepEqual(payload.capabilities, []);
  assert.equal(payload.stats.returned, 0);
  assert.ok(payload.skill_candidates.every((item) => item.path.includes("/.agents/skills/")));
  assert.ok(payload.skill_candidates.every((item) => item.name !== "legacy-code"));
});

test("plan intent favors the plan Skill instead of the code generation Skill", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-plan-intent-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".agents/skills/gen-code"), { recursive: true });
  await mkdir(path.join(root, ".agents/skills/gen-plan"), { recursive: true });
  await writeFile(
    path.join(root, ".agents/skills/gen-code/SKILL.md"),
    "---\nname: gen-code\ndescription: 生成代码、局部生成、加逻辑。\n---\n",
  );
  await writeFile(
    path.join(root, ".agents/skills/gen-plan/SKILL.md"),
    "---\nname: gen-frontend-plan\ndescription: 生成前端方案、生成前端计划和方案文档。\n---\n",
  );

  const payload = await runIndex(
    root,
    "--skills-only",
    "--intent",
    "plan",
    "--query",
    "先给奖励预览实现方案",
  );

  assert.equal(payload.skill_candidates[0].name, "gen-frontend-plan");
});

test("rejects invalid intent and Skill limit values", async (t) => {
  const root = await makeFixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    execFileAsync(process.execPath, [SCRIPT_PATH, "--root", root, "--intent", "execute"]),
    /--intent must be one of/,
  );
  await assert.rejects(
    execFileAsync(process.execPath, [SCRIPT_PATH, "--root", root, "--skill-limit", "0"]),
    /--skill-limit must be an integer between 1 and 100/,
  );
});
