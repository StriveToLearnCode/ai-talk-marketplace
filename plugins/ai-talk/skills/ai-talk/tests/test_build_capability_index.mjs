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
    [SCRIPT_PATH, "--root", root, "--no-user-sources", ...args],
    { encoding: "utf8" },
  );
  return JSON.parse(stdout);
}

test("indexes project skills, prompts, standards, components, utilities and implementations", async (t) => {
  const root = await makeFixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const payload = await runIndex(root);

  assert.equal(payload.schema_version, 1);
  assert.equal(payload.stats.by_kind.skill, 1);
  assert.equal(payload.stats.by_kind.prompt, 1);
  assert.equal(payload.stats.by_kind.standard, 1);
  assert.equal(payload.stats.by_kind.component, 1);
  assert.equal(payload.stats.by_kind.utility, 1);
  assert.equal(payload.stats.by_kind.implementation, 1);
  assert.ok(payload.capabilities.every((item) => !item.path.includes("node_modules")));
});

test("selects one main capability and no more than two complementary helpers", async (t) => {
  const root = await makeFixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const payload = await runIndex(root, "--query", "联调奖励接口并复用 RewardCard 组件");

  assert.ok(payload.selected.length >= 1 && payload.selected.length <= 3);
  assert.equal(payload.selected[0].role, "main");
  assert.ok(payload.selected.slice(1).every((item) => item.role === "auxiliary"));
  assert.ok(payload.selected.some((item) => ["skill", "prompt", "component"].includes(item.kind)));
  assert.ok(payload.capabilities.every((item) => item.score > 0));
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

  assert.equal(payload.selected[0].source, "frontend-platform");
  assert.equal(payload.selected[0].scope, "company");
  assert.ok(payload.roots.some((item) => item.label === "frontend-platform"));
});

test("returns no forced selection when the task has no relevant match", async (t) => {
  const root = await makeFixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const payload = await runIndex(root, "--query", "量子光谱校准");

  assert.deepEqual(payload.selected, []);
  assert.deepEqual(payload.capabilities, []);
});

test("does not fill helper slots with overlapping capabilities", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-overlap-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "skills/debug-one"), { recursive: true });
  await mkdir(path.join(root, "skills/debug-two"), { recursive: true });
  const frontmatter = (name) => `---
name: ${name}
description: 前端 Bug 先定位根因并收集调试证据。
---
`;
  await writeFile(path.join(root, "skills/debug-one/SKILL.md"), frontmatter("debug-one"));
  await writeFile(path.join(root, "skills/debug-two/SKILL.md"), frontmatter("debug-two"));

  const payload = await runIndex(root, "--query", "前端 Bug 先定位根因");

  assert.equal(payload.selected.length, 1);
  assert.equal(payload.selected[0].role, "main");
});
