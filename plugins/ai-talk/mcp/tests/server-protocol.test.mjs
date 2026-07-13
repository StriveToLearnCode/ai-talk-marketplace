import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import readline from "node:readline";
import test from "node:test";

function sampleConfirmation() {
  return {
    state: "ready",
    presentation: "card",
    task_type: { id: "feature_development", label: "功能开发", all: ["feature_development"] },
    execution: { mode: "modify_and_verify", label: "修改并验证" },
    goal: "实现任务确认卡",
    scope: ["plugins/ai-talk"],
    internal_skills: [{ id: "ai-talk", name: "ai-talk", type: "skill" }],
    reusable_capabilities: [],
    automatic_capabilities: [],
    choice_required: [],
    constraints: ["保持最小修改。"],
    risks: [],
    unconfirmed: [],
    blocking_question: null,
    decision_requirements: {
      capability_choice_ids: [],
      rule_conflict: false,
      scope_risk: false,
    },
    adjustable: {
      execution_mode: "modify_and_verify",
      scope: ["plugins/ai-talk"],
      use_capabilities: true,
      capability_preferences: {},
    },
    actions: {
      adjust: { enabled: true },
      insert_into_composer: { enabled: true, auto_send: false },
      start_execution: { enabled: true },
    },
  };
}

test("stdio MCP server exposes the widget resource and task tools", async (t) => {
  const server = spawn(process.execPath, [new URL("../server.mjs", import.meta.url).pathname], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => server.kill());

  const lines = readline.createInterface({ input: server.stdout, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  const call = async (message) => {
    server.stdin.write(`${JSON.stringify(message)}\n`);
    const { value } = await iterator.next();
    return JSON.parse(value);
  };

  const initialized = await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2026-01-26" },
  });
  assert.equal(initialized.result.serverInfo.name, "ai-talk");

  const listed = await call({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(
    listed.result.tools.map((tool) => tool.name),
    ["show_ai_talk_task", "adjust_ai_talk_task"],
  );
  assert.equal(
    listed.result.tools[0]._meta.ui.resourceUri,
    "ui://ai-talk/task-confirmation-v1.html",
  );

  const resource = await call({
    jsonrpc: "2.0",
    id: 3,
    method: "resources/read",
    params: { uri: "ui://ai-talk/task-confirmation-v1.html" },
  });
  assert.equal(resource.result.contents[0].mimeType, "text/html;profile=mcp-app");
  assert.match(resource.result.contents[0].text, /AI Talk 任务确认/);

  const shown = await call({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "show_ai_talk_task",
      arguments: { confirmation: sampleConfirmation() },
    },
  });
  assert.equal(shown.result.structuredContent.state, "ready");
  assert.equal(shown.result.structuredContent.actions.insert_into_composer.auto_send, false);
  assert.ok(shown.result.structuredContent.card_id);
  assert.match(shown.result.content[0].text, /任务目标：实现任务确认卡/);
  assert.match(shown.result.content[0].text, /可选操作：调整 \/ 插入输入框 \/ 开始执行/);
  assert.doesNotMatch(shown.result.content[0].text, /任务卡已生成|请在卡片中点击/);
});
