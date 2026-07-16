import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const script = path.resolve(import.meta.dirname, "../scripts/build-capability-index.mjs");

test("legacy command name uses the Context Gap Task Contract flow", async () => {
  const output = (await run(process.execPath, [script, "--query", "打开这个 URL 检查视觉和交互"], { encoding: "utf8" })).stdout;
  assert.match(output, /^用户目标：/);
  assert.match(output, /关系与冲突：/);
  assert.match(output, /验收标准：/);
  assert.doesNotMatch(output, /检索方向：|执行能力：|上下文缺口：/);
});
