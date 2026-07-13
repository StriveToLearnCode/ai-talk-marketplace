import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyTaskCardAdjustments,
  createTaskCardStore,
  normalizeTaskCard,
} from "../task-card.mjs";

function sampleCard(overrides = {}) {
  return {
    schema_version: 1,
    state: "needs_confirmation",
    presentation: "card",
    task_type: { id: "feature_development", label: "功能开发", all: ["feature_development"] },
    execution: { mode: "modify_and_verify", label: "修改并验证" },
    goal: "实现榜单页面",
    scope: ["src/pages/rank"],
    internal_skills: [{ id: "skill", name: "feature-development", type: "skill" }],
    reusable_capabilities: [
      { id: "rank-a", name: "RankA", type: "component", source: "project" },
    ],
    automatic_capabilities: [],
    choice_required: [
      { id: "rank-a", name: "RankA", type: "component", source: "project" },
    ],
    constraints: ["保持最小修改。"],
    risks: ["RankA 的复用方式尚未确认。"],
    unconfirmed: ["RankA 的复用方式尚未确认。"],
    blocking_question: null,
    decision_requirements: {
      capability_choice_ids: ["rank-a"],
      rule_conflict: false,
      scope_risk: false,
    },
    adjustable: {
      execution_mode: "modify_and_verify",
      scope: ["src/pages/rank"],
      use_capabilities: true,
      capability_preferences: { "rank-a": null },
    },
    actions: {
      adjust: { enabled: true },
      insert_into_composer: { enabled: true, auto_send: false },
      start_execution: { enabled: false },
    },
    ...overrides,
  };
}

test("normalizes the confirmation card and keeps composer insertion non-sending", () => {
  const card = normalizeTaskCard(sampleCard());
  assert.equal(card.state, "needs_confirmation");
  assert.equal(card.actions.insert_into_composer.auto_send, false);
  assert.match(card.task_prompt, /任务目标：实现榜单页面/);
});

test("adjustment changes only mode, scope, and capability usage", () => {
  const original = sampleCard();
  const adjusted = applyTaskCardAdjustments(original, {
    execution_mode: "analyze",
    scope: ["src/pages/rank/index.vue"],
    use_capabilities: false,
    capability_preferences: { "rank-a": "excluded" },
    goal: "不允许修改这个目标",
  });

  assert.equal(adjusted.goal, original.goal);
  assert.equal(adjusted.execution.mode, "analyze");
  assert.deepEqual(adjusted.scope, ["src/pages/rank/index.vue"]);
  assert.equal(adjusted.adjustable.use_capabilities, false);
  assert.equal(adjusted.adjustable.capability_preferences["rank-a"], "excluded");
  assert.equal(adjusted.state, "ready");
  assert.equal(adjusted.actions.start_execution.enabled, true);
});

test("task card store rejects unknown sessions and increments state version", () => {
  const store = createTaskCardStore();
  const created = store.create(sampleCard());
  const adjusted = store.adjust(created.card_id, {
    capability_preferences: { "rank-a": "prefer_reference" },
  });

  assert.equal(created.state_version, 1);
  assert.equal(adjusted.state_version, 2);
  assert.equal(adjusted.state, "ready");
  assert.throws(() => store.adjust("missing", {}), /not found or has expired/);
});

test("disabling matched capabilities resolves capability choices without per-item input", () => {
  const adjusted = applyTaskCardAdjustments(sampleCard(), {
    use_capabilities: false,
  });

  assert.equal(adjusted.state, "ready");
  assert.equal(adjusted.actions.start_execution.enabled, true);
  assert.doesNotMatch(adjusted.task_prompt, /可复用能力/);
});

test("scope-risk confirmation becomes ready only after an explicit scope adjustment", () => {
  const card = sampleCard({
    choice_required: [],
    reusable_capabilities: [],
    risks: ["任务涉及公共能力或范围扩大，执行前需要确认影响面。"],
    decision_requirements: {
      capability_choice_ids: [],
      rule_conflict: false,
      scope_risk: true,
    },
    adjustable: {
      execution_mode: "modify_and_verify",
      scope: ["当前项目"],
      use_capabilities: true,
      capability_preferences: {},
    },
  });

  assert.equal(applyTaskCardAdjustments(card, { use_capabilities: true }).state, "needs_confirmation");
  assert.equal(applyTaskCardAdjustments(card, { scope: ["src/pages"] }).state, "ready");
});

test("widget sends ui/message only from the start action and copies on insert", async () => {
  const html = await readFile(new URL("../task-card.html", import.meta.url), "utf8");
  const insertHandler = html.slice(
    html.indexOf('$("#insert").addEventListener'),
    html.indexOf('$("#save-adjust").addEventListener'),
  );
  const startHandler = html.slice(html.indexOf('$("#start").addEventListener'));

  assert.match(insertHandler, /copyPrompt/);
  assert.doesNotMatch(insertHandler, /ui\/message/);
  assert.match(startHandler, /ui\/message/);
  assert.match(html, /未自动发送/);
});
