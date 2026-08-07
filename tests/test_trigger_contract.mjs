import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

test("separates loading, persistence, and visible output", async () => {
  const fixture = await readJson("tests/trigger-cases.json");
  assert.equal(fixture.policy, "every_development_request");
  assert.deepEqual(fixture.dimensions, ["load_skill", "persist_state", "visible_output"]);
  assert.deepEqual(fixture.visible_output_contract, {
    prefix: "AI Talk 分析结果：",
    timing: "immediately_after_ai_talk_processing",
    must_precede: ["业务目录定位", "源码检索", "实现", "验证"],
    final_summary_is_too_late: true,
  });

  const cases = new Map(fixture.cases.map((entry) => [entry.id, entry]));
  assert.equal(cases.size, fixture.cases.length);
  const lightweightLoad = { load_skill: true, persist_state: false, visible_output: true };
  const persistentLoad = { load_skill: true, persist_state: true, visible_output: true };
  const noLoad = { load_skill: false, persist_state: false, visible_output: false };

  for (const id of ["single-local-edit", "single-local-diagnosis", "code-review", "short-continuation"]) {
    assert.deepEqual(cases.get(id)?.expected, lightweightLoad, id);
  }
  for (const id of ["confirmed-result", "explicit-boundary", "context-handoff", "ai-talk-implementation"]) {
    assert.deepEqual(cases.get(id)?.expected, persistentLoad, id);
  }
  for (const id of ["non-development", "ordinary-status", "preference-feedback", "meta-without-change", "quoted-context-only"]) {
    assert.deepEqual(cases.get(id)?.expected, noLoad, id);
  }
});

test("real Codex benchmark covers recall, escalation, and precision", async () => {
  const config = await readJson(".plugin-eval/benchmark.json");
  assert.equal(config.kind, "plugin-eval-benchmark");
  assert.equal(config.schemaVersion, 2);
  assert.equal(config.runner.type, "codex-cli");
  assert.equal(config.workspace.sourcePath, ".");
  assert.equal(config.targetProvisioning.mode, "isolated-skill-home");

  const scenarios = new Map(config.scenarios.map((entry) => [entry.id, entry]));
  assert.deepEqual(
    new Set(scenarios.keys()),
    new Set(["single-turn-development", "correction-persists", "non-development-boundary"]),
  );
  assert.match(scenarios.get("single-turn-development").successChecklist.join(" "), /read exactly once/);
  const singleTurnChecklist = scenarios.get("single-turn-development").successChecklist.join(" ");
  assert.match(singleTurnChecklist, /Immediately after AI Talk processing/);
  assert.match(singleTurnChecklist, /AI Talk 分析结果：/);
  assert.match(singleTurnChecklist, /not deferred to the final summary/);
  assert.match(scenarios.get("non-development-boundary").successChecklist.join(" "), /does not show/);
});
