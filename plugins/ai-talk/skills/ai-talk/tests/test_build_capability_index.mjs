import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const script = path.resolve(import.meta.dirname, "../scripts/build-capability-index.mjs");

test("compatibility command preserves text output and supports explicit JSON", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-entry-"));
  const directory = path.join(root, ".agents", "skills", "fe-gen-code");
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), "---\nname: gen-code\ndescription: 生成页面代码和业务逻辑。\n---\n");
  const args = [script, "--root", root, "--query", "把这个页面做出来并修改代码"];
  const output = (await run(process.execPath, args, { encoding: "utf8" })).stdout;
  assert.match(output, /^🎯 任务目标\n/);
  assert.match(output, /建议 Skill：gen-code/);

  const jsonOutput = (await run(process.execPath, [...args, "--format", "json"], { encoding: "utf8" })).stdout;
  const result = JSON.parse(jsonOutput);
  assert.equal(result.original_request, "把这个页面做出来并修改代码");
  assert.equal(result.recommended_skill, "gen-code");
  assert.match(result.execution_prompt, /^🎯 任务目标\n/);
  assert.ok(!Object.hasOwn(result, "_debug"));
});
