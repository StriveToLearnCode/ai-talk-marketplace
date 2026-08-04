import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(TEST_ROOT, "../scripts/contract-check.mjs");

async function fixture() {
  const project = await mkdtemp(path.join(tmpdir(), "ai-talk-contract-check-"));
  await mkdir(path.join(project, "src", "core"), { recursive: true });
  await writeFile(path.join(project, "src", "feature.js"), "export function run() {\n  return true;\n}\n");
  await writeFile(path.join(project, "src", "core", "shared.js"), "export const shared = true;\n");
  return project;
}

function contract(overrides = {}) {
  return {
    schema_version: "1.5",
    result: "handoff",
    mode: "modify_and_verify",
    authorization: "authorized",
    source_request: "修改并验证 feature",
    next_skill: null,
    entry_point: { path: "src/feature.js", line: 1, symbol: "run" },
    target_refs: [],
    control_point: { path: "src/feature.js", line: 2, symbol: "run" },
    write_scope: ["src/feature.js"],
    external_write_scope: [],
    excluded_scope: ["src/core/**"],
    scope_policy: "bounded",
    behavior: ["run feature", "return updated result"],
    evidence: [{ type: "control_point", summary: "run returns the result", source: "src/feature.js:2" }],
    verification: ["feature returns the updated result"],
    open_questions: [],
    ...overrides,
  };
}

function run(command, project, value) {
  return spawnSync(process.execPath, [SCRIPT, command, "--project", project], {
    input: JSON.stringify(value),
    encoding: "utf8",
  });
}

test("validate accepts an evidence-backed contract and reports verified files", async () => {
  const project = await fixture();
  const result = run("validate", project, contract());
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "valid");
  assert.deepEqual(output.checks, {
    schema: true,
    semantics: true,
    targets: true,
    references: true,
    scope: true,
    external_writes: true,
  });
  assert.deepEqual(output.verified.write_scope, ["src/feature.js"]);
  assert.deepEqual(output.verified.external_write_scope, []);
  assert.ok(output.verified.files.some((item) => item.field === "evidence[0].source"));
});

test("inspect returns findings without failing the process", async () => {
  const project = await fixture();
  const invalid = contract({
    control_point: { path: "src/missing.js", line: 99, symbol: "missing" },
    write_scope: ["src/core/shared.js"],
  });
  const result = run("inspect", project, invalid);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "invalid");
  assert.ok(output.errors.some((item) => item.code === "reference.missing_file"));
  assert.ok(output.errors.some((item) => item.code === "scope.write_is_excluded"));
});

test("validate blocks invalid authorization, questions, and line evidence", async () => {
  const project = await fixture();
  const invalid = contract({
    authorization: "inspect_only",
    result: "clarify",
    evidence: [{ type: "control_point", summary: "invalid line", source: "src/feature.js:40" }],
    open_questions: [],
  });
  const result = run("validate", project, invalid);
  assert.equal(result.status, 1, result.stderr);
  const codes = new Set(JSON.parse(result.stdout).errors.map((item) => item.code));
  assert.ok(codes.has("semantics.modification_not_authorized"));
  assert.ok(codes.has("semantics.clarify_question_count"));
  assert.ok(codes.has("reference.invalid_line"));
});

test("validate accepts --contract files", async () => {
  const project = await fixture();
  const contractPath = path.join(project, "contract.json");
  await writeFile(contractPath, JSON.stringify(contract()));
  const output = execFileSync(process.execPath, [SCRIPT, "validate", "--project", project, "--contract", contractPath], {
    encoding: "utf8",
  });
  assert.equal(JSON.parse(output).status, "valid");
});

test("validate checks source-specific visual evidence", async () => {
  const project = await fixture();
  const invalidTarget = {
    id: "target_1",
    label: "第二个头像",
    source: "screenshot_annotation",
    attachment: {
      attachment_id: "attachment_1",
      annotation_id: "annotation_1",
      bounds: { x: 0.9, y: 0.1, width: 0.2, height: 0.2, unit: "ratio" },
      image_size: { width: 1170, height: 2532 },
    },
    browser: null,
    dom: null,
  };
  const result = run("validate", project, contract({ target_refs: [invalidTarget] }));
  assert.equal(result.status, 1, result.stderr);
  assert.ok(JSON.parse(result.stdout).errors.some((item) => item.code === "target.invalid_bounds"));
});

test("validate allows an intentional new write path with a warning", async () => {
  const project = await fixture();
  const result = run("validate", project, contract({ write_scope: ["src/new-feature.js"] }));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "valid");
  assert.ok(output.warnings.some((item) => item.code === "scope.new_path"));
});

test("validate accepts complete DOM evidence and rejects sensitive browser URLs", async () => {
  const project = await fixture();
  const domTarget = {
    id: "target_1",
    label: "voice 区第二个用户头像",
    source: "dom_selection",
    attachment: null,
    browser: {
      url: "https://example.test/activity?tab=voice",
      route: "/activity",
      viewport: { width: 390, height: 844 },
      page_state: ["voice tab active"],
      frame_path: [],
      captured_at: "2026-07-22T09:00:00+08:00",
    },
    dom: {
      selector: "[data-role=\"user-avatar\"]",
      match_ordinal: 2,
      strategy: "data_attribute",
      fingerprint: {
        tag_name: "img",
        role: "img",
        accessible_name: "用户头像",
        stable_attributes: { "data-role": "user-avatar" },
      },
    },
  };
  const valid = run("validate", project, contract({ target_refs: [domTarget] }));
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);

  domTarget.browser.url = "https://example.test/activity?session_token=secret";
  const invalid = run("validate", project, contract({ target_refs: [domTarget] }));
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.ok(JSON.parse(invalid.stdout).errors.some((item) => item.code === "target.sensitive_url"));
});

test("validate checks structured authorization provenance without reclassifying user wording", async () => {
  const project = await fixture();
  const external = {
    system: "Pagecenter",
    operation: "save regional configuration",
    target: "region pages derived from repository routes",
    risk_level: "medium",
    authorization_source: "current_user_message",
    authorization_quote: "根据各区服调整并放到 PageCenter",
  };
  const valid = run("validate", project, contract({ external_write_scope: [external] }));
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  assert.deepEqual(JSON.parse(valid.stdout).verified.external_write_scope, [external]);

  const affirmed = run("validate", project, contract({
    source_request: "是的",
    external_write_scope: [{
      ...external,
      authorization_source: "adjacent_exact_confirmation",
      authorization_quote: "是的",
    }],
  }));
  assert.equal(affirmed.status, 0, affirmed.stderr || affirmed.stdout);
  assert.equal(
    JSON.parse(affirmed.stdout).verified.external_write_scope[0].authorization_quote,
    "是的",
  );

  const invalidRisk = run("validate", project, contract({
    external_write_scope: [{ ...external, risk_level: "low" }],
  }));
  assert.equal(invalidRisk.status, 1, invalidRisk.stderr);
  assert.ok(JSON.parse(invalidRisk.stdout).errors.some((item) => item.code === "external.invalid_risk_level"));

  const invalidSource = run("validate", project, contract({
    external_write_scope: [{ ...external, authorization_source: "inferred_from_keywords" }],
  }));
  assert.equal(invalidSource.status, 1, invalidSource.stderr);
  assert.ok(
    JSON.parse(invalidSource.stdout).errors
      .some((item) => item.code === "external.invalid_authorization_source"),
  );
});

test("validate requires adjacent confirmation for structurally high-risk external writes", async () => {
  const project = await fixture();
  const highRisk = {
    system: "Pagecenter",
    operation: "publish production configuration",
    target: "activity 123 production",
    risk_level: "high",
    authorization_source: "current_user_message",
    authorization_quote: "发布正式",
  };
  const unconfirmed = run("validate", project, contract({ external_write_scope: [highRisk] }));
  assert.equal(unconfirmed.status, 1, unconfirmed.stderr);
  assert.ok(
    JSON.parse(unconfirmed.stdout).errors
      .some((item) => item.code === "external.high_risk_requires_confirmation"),
  );

  const confirmed = run("validate", project, contract({
    source_request: "确认",
    external_write_scope: [{
      ...highRisk,
      authorization_source: "adjacent_exact_confirmation",
      authorization_quote: "确认",
    }],
  }));
  assert.equal(confirmed.status, 0, confirmed.stderr || confirmed.stdout);
});

test("validate keeps diagnostic requests and read-only contracts from carrying writes", async () => {
  const project = await fixture();
  const diagnostic = run("validate", project, contract({
    source_request: "帮我找到背景图为什么不对",
  }));
  assert.equal(diagnostic.status, 1, diagnostic.stderr);
  assert.ok(JSON.parse(diagnostic.stdout).errors.some((item) => item.code === "semantics.diagnostic_request_is_read_only"));

  const readOnlyExternal = run("validate", project, contract({
    mode: "inspect_only",
    authorization: "inspect_only",
    behavior: [],
    verification: [],
    external_write_scope: [{
      system: "Pagecenter",
      operation: "update asset",
      target: "activity 123 background",
      risk_level: "medium",
      authorization_source: "current_user_message",
      authorization_quote: "把 Pagecenter 的活动 123 背景图更新为 bg-v2.png",
    }],
  }));
  assert.equal(readOnlyExternal.status, 1, readOnlyExternal.stderr);
  assert.ok(JSON.parse(readOnlyExternal.stdout).errors.some((item) => item.code === "external.read_only_contract_has_writes"));
});
