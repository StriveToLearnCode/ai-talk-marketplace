import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const script = path.resolve(import.meta.dirname, "../scripts/build-capability-index.mjs");

test("compatibility command uses the formatter-isolated default flow", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-entry-"));
  const directory = path.join(root, ".agents", "skills", "fe-gen-code");
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), "---\nname: gen-code\ndescription: 生成页面代码和业务逻辑。\n---\n");
  const output = (await run(process.execPath, [script, "--root", root, "--query", "把这个页面做出来并修改代码"], { encoding: "utf8" })).stdout;
  assert.match(output, /^💡 AI 理解/);
  assert.match(output, /🛠 AI 已决定\ngen-code\n负责代码开发/);
  assert.ok(!output.includes("AI 将执行"));
  assert.ok(!output.includes("原因："));
  assert.ok(!output.includes("task_action"));
  assert.ok(!output.includes("/Users/"));
});
