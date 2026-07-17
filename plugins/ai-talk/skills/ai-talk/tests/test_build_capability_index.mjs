import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const script = path.resolve(import.meta.dirname, "../scripts/build-capability-index.mjs");

test("compatibility command uses the context-enhancer default flow", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-entry-"));
  const directory = path.join(root, ".agents", "skills", "fe-gen-code");
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), "---\nname: gen-code\ndescription: 生成页面代码和业务逻辑。\n---\n");
  const output = (await run(process.execPath, [script, "--root", root, "--query", "把这个页面做出来并修改代码"], { encoding: "utf8" })).stdout;
  assert.match(output, /^用户目标：\n把这个页面做出来并修改代码。\n\n实现边界：\n/);
  assert.match(output, /建议 Skill：\ngen-code/);
  assert.ok([...output.matchAll(/\p{Script=Han}/gu)].length <= 200, output);
  assert.doesNotMatch(output, /执行 Skill|建议验证|待验证|验收标准/);
  assert.doesNotMatch(output, /用户原意：|AI 推导|研发概念：|建议优先检索：|任务协议已生成/);
  assert.ok(!output.includes("AI 已决定"));
  assert.ok(!output.includes("AI 将执行"));
  assert.ok(!output.includes("原因："));
  assert.ok(!output.includes("task_action"));
  assert.ok(!output.includes("/Users/"));
});
