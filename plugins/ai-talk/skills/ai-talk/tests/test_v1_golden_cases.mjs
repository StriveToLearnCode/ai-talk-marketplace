import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { routeCompanySkills } from "../scripts/route-company-skills.mjs";
import {
  TASK_HANDOFF_KEYS,
  buildExecutionPrompt,
  normalizeTaskHandoff,
  validateTaskHandoff,
} from "../scripts/route-company-skills/build-execution-prompt.mjs";
import { MAX_CONTEXT_FILES_READ } from "../scripts/route-company-skills/rules.mjs";

const GOLDEN_CASES = JSON.parse(await readFile(
  path.join(import.meta.dirname, "v1-golden-cases.json"),
  "utf8",
));
const CORE_SKILLS = ["ui-self-check", "ai-test", "gen-code", "gen-frontend-plan", "figma-analyze"];

async function addFile(root, relative, content) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-v1-golden-"));
  for (const name of CORE_SKILLS) {
    await addFile(root, `.agents/skills/${name}/SKILL.md`, [
      "---",
      `name: ${name}`,
      `description: ${name} V1 routing fixture`,
      "---",
      "BODY_MUST_NOT_BE_READ",
      "",
    ].join("\n"));
  }
  const files = {
    "src/dialogs/self-select-dialog.vue": "<template><BaseDialog /></template>\n",
    "src/composables/use-dialog.ts": "export function useDialog() { return {}; }\n",
    "src/pages/page.vue": "<template><SelfSelectDialog /></template>\n<script setup>onAfterInit(() => {});</script>\n",
    "src/api/lottery.ts": "export async function do_lottery() { return {}; }\n",
    "src/stores/reward.ts": "export function openRewardDialog(payload) { return payload; }\n",
    "src/components/reward-dialog.vue": "<template><div>{{ reward.name }}{{ reward.badge }}</div></template>\n",
    "src/dynamic/component-loader.ts": "export const dynamicComponentName = 'LuckyReward';\nexport const componentRegistry = {};\n",
    "src/components/LuckyReward.vue": "<template><div>reward</div></template>\n",
    "src/components/reward-item.vue": "<template><div class=\"icon/mask\" /></template>\n<script setup>const isClaimed = true;</script>\n",
    "src/components/copy-card.vue": "<template><p>旧文案</p></template>\n",
    "src/components/AGENTS.md": "nearest rule\n",
  };
  for (const [relative, content] of Object.entries(files)) await addFile(root, relative, content);
  return root;
}

async function workspaceSnapshot(root) {
  const paths = [];
  async function visit(relative = "") {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) paths.push(child.split(path.sep).join("/"));
    }
  }
  await visit();
  return paths;
}

async function route(root, query) {
  return routeCompanySkills({
    root,
    query,
    sourceRoots: [],
    excludeRoots: [],
    evidenceTypes: [],
    evidenceEntries: [],
    limit: 3,
    debugJson: true,
  });
}

test("V1 freezes exactly eight golden TaskHandoff and Formatter results", async (t) => {
  assert.equal(GOLDEN_CASES.length, 8);
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const before = await workspaceSnapshot(root);

  for (const golden of GOLDEN_CASES) {
    const started = performance.now();
    const result = await route(root, golden.query);
    const durationMs = performance.now() - started;
    const actual = {
      task_goal: result.task_goal,
      engineering_judgment: result.engineering_judgment,
      retrieval_entries: result.retrieval_entries.map(({ knowledge, entry, purpose }) => ({ knowledge, entry, purpose })),
      recommended_skill: result.recommended_skill,
      stage: result.stage,
      execution_prompt: result.execution_prompt,
    };

    assert.deepEqual(actual, golden.expected, golden.id);
    assert.deepEqual(Object.keys(result.execution_plan), TASK_HANDOFF_KEYS, `${golden.id}: TaskHandoff keys`);
    assert.equal(validateTaskHandoff(result.execution_plan), result.execution_plan, `${golden.id}: TaskHandoff validation`);
    assert.equal(result.execution_plan.route.authorization, "inspect_only", `${golden.id}: authorization`);
    assert.equal(buildExecutionPrompt(result.execution_plan), result.execution_prompt, `${golden.id}: Formatter projection`);
    assert.ok(result._debug.context.files_read.length <= MAX_CONTEXT_FILES_READ, `${golden.id}: file budget`);
    const budgetMs = result._debug.performance.case_type === "simple" ? 15_000 : 45_000;
    assert.ok(durationMs <= budgetMs, `${golden.id}: time budget`);
    assert.equal(result._debug.performance.skill_body_files_read, 0, `${golden.id}: Skill body budget`);
    assert.equal(result._debug.performance.files_read, result._debug.context.files_read.length, `${golden.id}: file metric`);
    assert.equal(result._debug.performance.search_expansions, result._debug.context.search_expansions, `${golden.id}: expansion metric`);
    assert.equal(result._debug.performance.early_stop_reason, result._debug.context.stop_reason, `${golden.id}: stop metric`);
    if (golden.expected_stop_reason) {
      assert.equal(result._debug.context.stop_reason, golden.expected_stop_reason, `${golden.id}: early stop`);
    }
    t.diagnostic([
      `${golden.id}: ${durationMs.toFixed(3)} ms`,
      `${result._debug.performance.files_read} files`,
      `${result._debug.performance.skill_body_files_read} Skill bodies`,
      `${result._debug.performance.search_expansions} expansions`,
      `stop=${result._debug.performance.early_stop_reason}`,
    ].join(", "));
  }

  assert.deepEqual(await workspaceSnapshot(root), before, "routing must not modify the project or execute a downstream Skill");
});

test("V1 normalizes legacy plans into the fixed TaskHandoff model", () => {
  const handoff = normalizeTaskHandoff({
    schema_version: "1.0",
    route: { skill: "gen-code", authorization: "inspect_only" },
    task: { source_request: "修复问题" },
    experimental_field: true,
  });
  assert.deepEqual(Object.keys(handoff), TASK_HANDOFF_KEYS);
  assert.equal(handoff.schema_version, "1.1");
  assert.ok(!Object.hasOwn(handoff, "experimental_field"));
  assert.equal(validateTaskHandoff(handoff), handoff);
  assert.throws(() => buildExecutionPrompt({ ...handoff, experimental_field: true }), /invalid V1 top-level structure/);
});

test("V1 stops reading explicit context at the four-file limit", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ["one", "two", "three"]) {
    await addFile(root, `targets/${name}/target.ts`, `export const ${name} = true;\n`);
    await addFile(root, `targets/${name}/AGENTS.md`, `${name} rule\n`);
  }
  const result = await route(root, "修改 targets/one/target.ts targets/two/target.ts targets/three/target.ts");
  assert.equal(result._debug.context.files_read.length, MAX_CONTEXT_FILES_READ);
  assert.equal(result._debug.context.stop_reason, "context_file_limit");
  assert.ok(result.execution_plan.blockers.some((item) => item.description.includes("上下文读取已达到 4 个文件上限")));
});

test("V1 stops before indexing when supplied evidence resolves all knowledge", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await route(root, "修复 state=0 显示问题");
  assert.deepEqual(result._debug.context.files_read, []);
  assert.equal(result._debug.context.indexed_files, 0);
  assert.equal(result._debug.context.stop_reason, "all_knowledge_resolved");
  assert.deepEqual(result.retrieval_entries.map((item) => item.entry), ["state=0"]);
});
