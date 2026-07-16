import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const script = path.resolve(import.meta.dirname, "../scripts/build-capability-index.mjs");

<<<<<<< HEAD
test("legacy command name uses the Context Gap Task Contract flow", async () => {
  const output = (await run(process.execPath, [script, "--query", "打开这个 URL 检查视觉和交互"], { encoding: "utf8" })).stdout;
  assert.match(output, /^用户目标：/);
  assert.match(output, /关系与冲突：/);
  assert.match(output, /验收标准：/);
  assert.doesNotMatch(output, /检索方向：|执行能力：|上下文缺口：/);
=======
test("compatibility command uses the context-enhancer default flow", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-talk-entry-"));
  const directory = path.join(root, ".agents", "skills", "fe-gen-code");
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), "---\nname: gen-code\ndescription: 生成页面代码和业务逻辑。\n---\n");
  const output = (await run(process.execPath, [script, "--root", root, "--query", "把这个页面做出来并修改代码"], { encoding: "utf8" })).stdout;
  assert.match(output, /^任务目标：\n/);
  assert.match(output, /建议 Skill：\n- gen-code/);
  assert.ok([...output.matchAll(/\p{Script=Han}/gu)].length <= 140, output);
  assert.doesNotMatch(output, /重点|执行 Skill|建议验证|待验证|验收标准/);
  assert.doesNotMatch(output, /用户目标：|AI 推导|研发概念：|建议优先检索：|任务协议已生成/);
  assert.ok(!output.includes("AI 已决定"));
  assert.ok(!output.includes("AI 将执行"));
  assert.ok(!output.includes("原因："));
  assert.ok(!output.includes("task_action"));
  assert.ok(!output.includes("/Users/"));
>>>>>>> 6ab4b54 (Refactor AI Talk tests and acceptance cases to enhance clarity and align with updated skill routing and output structures)
});
