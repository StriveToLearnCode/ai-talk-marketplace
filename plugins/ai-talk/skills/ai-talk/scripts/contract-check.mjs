#!/usr/bin/env node

import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CHECK_VERSION = "1.1";
const CONTRACT_VERSION = "1.4";
const CONTRACT_KEYS = [
  "schema_version",
  "result",
  "mode",
  "authorization",
  "source_request",
  "next_skill",
  "entry_point",
  "target_refs",
  "control_point",
  "write_scope",
  "external_write_scope",
  "excluded_scope",
  "scope_policy",
  "behavior",
  "evidence",
  "verification",
  "open_questions",
];
const RESULTS = new Set(["skip", "handoff", "clarify"]);
const MODES = new Set(["modify_and_verify", "inspect_only", "plan_only", "plan_then_execute"]);
const AUTHORIZATIONS = new Set(["authorized", "inspect_only"]);
const SCOPE_POLICIES = new Set(["discover", "bounded"]);
const TARGET_SOURCES = new Set(["screenshot_annotation", "dom_selection", "browser_context"]);
const TARGET_KEYS = ["id", "label", "source", "attachment", "browser", "dom"];
const BROWSER_KEYS = ["url", "route", "viewport", "page_state", "frame_path", "captured_at"];
const DOM_KEYS = ["selector", "match_ordinal", "strategy", "fingerprint"];
const FINGERPRINT_KEYS = ["tag_name", "role", "accessible_name", "stable_attributes"];
const DOM_STRATEGIES = new Set(["test_id", "data_attribute", "id", "accessible", "semantic", "css_fallback"]);
const EXTERNAL_WRITE_KEYS = ["system", "operation", "target", "authorization_quote"];
const SENSITIVE_URL_KEY = /(?:auth|token|session|signature|password|secret|api[_-]?key)/i;
const PRIMARY_DIAGNOSTIC_REQUEST = /^(?:\s*(?:请|麻烦)?\s*(?:帮我)?\s*(?:先)?\s*)?(?:找到|找出|定位|查找|查明|排查|分析|解释|为什么|哪里|where\b|why\b|find\b|locate\b|diagnose\b|investigate\b)/iu;
const DIAGNOSIS_THEN_IMPLEMENT = /(?:并|然后|再|之后|后)\s*(?:帮我)?\s*(?:修复|修改|更改|改成|改掉|更新|替换|发布|上传|删除|创建|新增|提交|合并|设置|配置|执行|fix\b|change\b|update\b|publish\b|upload\b|delete\b|create\b|submit\b|merge\b|set\b)/iu;
const EXPLICIT_EXTERNAL_WRITE = /(?:^(?:\s*(?:please\s+)?)?(?:修复|修改|更改|改成|改掉|更新|发布|上传|删除|创建|新增|写入|提交|合并|关闭|重跑|回滚|替换|设置|配置|fix\b|change\b|update\b|publish\b|upload\b|delete\b|create\b|write\b|submit\b|merge\b|close\b|rerun\b|rollback\b|replace\b|set\b|configure\b)|(?:请|帮我|麻烦|把|将|允许|同意|授权|开始|执行|直接|please\b|allow\b|authorize\b|approve\b).{0,120}(?:修复|修改|更改|改成|改掉|更新|发布|上传|删除|创建|新增|写入|提交|合并|关闭|重跑|回滚|替换|设置|配置|fix\b|change\b|update\b|publish\b|upload\b|delete\b|create\b|write\b|submit\b|merge\b|close\b|rerun\b|rollback\b|replace\b|set\b|configure\b))/iu;
const CONTEXTUAL_EXTERNAL_AUTHORIZATION = /^(?:是的?|对(?:的)?|好(?:的)?|可以|行|确认|同意|批准|开始|执行|继续|就这样|按(?:这个|上述|上面(?:的)?)(?:做|执行)|yes|yep|yeah|ok(?:ay)?|confirm(?:ed)?|approve(?:d)?|proceed|go\s+ahead)[\s。.!！]*$/iu;
const EXTERNAL_EVIDENCE_PREFIXES = [
  "attachment:",
  "browser:",
  "dom:",
  "screenshot:",
  "user_request",
  "http://",
  "https://",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addFinding(collection, code, field, message) {
  collection.push({ code, field, message });
}

function hasExactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return actual.length === expectedKeys.length
    && actual.every((key, index) => key === expectedKeys[index]);
}

function normalizeRepoPattern(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (
    !normalized
    || normalized.includes("\0")
    || path.posix.isAbsolute(normalized)
    || normalized.split("/").some((segment) => segment === "" || segment === "..")
  ) return null;
  return normalized;
}

function hasGlob(value) {
  return /[*?[]/.test(value);
}

function segmentMatches(value, pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", "[^/]*")
    .replaceAll("?", "[^/]");
  return new RegExp(`^${escaped}$`).test(value);
}

function pathMatches(value, pattern) {
  const pathSegments = value.split("/");
  const patternSegments = pattern.split("/");
  const visit = (pathIndex, patternIndex) => {
    if (patternIndex === patternSegments.length) return pathIndex === pathSegments.length;
    if (patternSegments[patternIndex] === "**") {
      return visit(pathIndex, patternIndex + 1)
        || (pathIndex < pathSegments.length && visit(pathIndex + 1, patternIndex));
    }
    return pathIndex < pathSegments.length
      && segmentMatches(pathSegments[pathIndex], patternSegments[patternIndex])
      && visit(pathIndex + 1, patternIndex + 1);
  };
  return visit(0, 0);
}

async function projectFile(projectRoot, relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  const stats = await lstat(absolutePath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!stats) return { exists: false, file: false, inside: true, absolutePath };
  const resolved = await realpath(absolutePath);
  const inside = resolved === projectRoot || resolved.startsWith(`${projectRoot}${path.sep}`);
  return { exists: true, file: stats.isFile(), inside, absolutePath: resolved };
}

async function verifyLine(filePath, line) {
  if (line === null || line === undefined) return { valid: true, lineCount: null };
  if (!Number.isInteger(line) || line < 1) return { valid: false, lineCount: null };
  const content = await readFile(filePath, "utf8");
  const lines = content === "" ? [] : content.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const lineCount = lines.length;
  return { valid: line <= lineCount, lineCount };
}

function localEvidenceSource(source) {
  if (EXTERNAL_EVIDENCE_PREFIXES.some((prefix) => source.startsWith(prefix))) return null;
  const match = source.match(/^(.+?):(\d+)(?::\d+)?$/);
  if (match) return { path: match[1], line: Number(match[2]) };
  if (source.includes("/") && !source.includes(" ")) return { path: source, line: null };
  return null;
}

async function verifyReference({ projectRoot, field, relativePath, line, errors, verifiedFiles }) {
  const normalized = normalizeRepoPattern(relativePath);
  if (!normalized || hasGlob(normalized)) {
    addFinding(errors, "reference.invalid_path", field, `Expected a safe repository file path, received: ${relativePath}`);
    return;
  }
  const file = await projectFile(projectRoot, normalized);
  if (!file.inside) {
    addFinding(errors, "reference.outside_project", field, `Path resolves outside the project: ${normalized}`);
    return;
  }
  if (!file.exists || !file.file) {
    addFinding(errors, "reference.missing_file", field, `Referenced file does not exist: ${normalized}`);
    return;
  }
  const lineResult = await verifyLine(file.absolutePath, line);
  if (!lineResult.valid) {
    addFinding(
      errors,
      "reference.invalid_line",
      field,
      `Line ${line} is outside ${normalized} (${lineResult.lineCount ?? 0} lines).`,
    );
    return;
  }
  verifiedFiles.push({ field, path: normalized, line: line ?? null });
}

async function verifyWritePath({ projectRoot, field, relativePath, errors, warnings, verifiedFiles }) {
  const file = await projectFile(projectRoot, relativePath);
  if (!file.inside) {
    addFinding(errors, "scope.outside_project", field, `Writable path resolves outside the project: ${relativePath}`);
    return;
  }
  if (!file.exists) {
    addFinding(warnings, "scope.new_path", field, `Writable path does not exist yet; confirm file creation is intended: ${relativePath}`);
    return;
  }
  if (!file.file) {
    addFinding(errors, "scope.not_file", field, `Writable scope must name a file or glob, not a directory: ${relativePath}`);
    return;
  }
  verifiedFiles.push({ field, path: relativePath, line: null });
}

function verifyStringList(contract, field, errors, { nonEmpty = false } = {}) {
  const value = contract[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    addFinding(errors, "schema.invalid_string_list", field, `${field} must be a list of non-empty strings.`);
    return false;
  }
  if (nonEmpty && value.length === 0) {
    addFinding(errors, "schema.empty_list", field, `${field} must not be empty.`);
    return false;
  }
  return true;
}

function verifyPointShape(contract, field, errors) {
  const point = contract[field];
  if (point === null) return true;
  if (!isObject(point)) {
    addFinding(errors, "schema.invalid_point", field, `${field} must be null or an object.`);
    return false;
  }
  if (!hasExactKeys(point, ["path", "line", "symbol"])) {
    addFinding(errors, "schema.invalid_point_keys", field, `${field} must contain only path, line, and symbol.`);
    return false;
  }
  if (typeof point.path !== "string" || !point.path.trim()) {
    addFinding(errors, "schema.invalid_point_path", `${field}.path`, `${field}.path must be a non-empty string.`);
    return false;
  }
  if (point.line !== null && (!Number.isInteger(point.line) || point.line < 1)) {
    addFinding(errors, "schema.invalid_point_line", `${field}.line`, `${field}.line must be null or a positive integer.`);
    return false;
  }
  if (point.symbol !== null && (typeof point.symbol !== "string" || !point.symbol.trim())) {
    addFinding(errors, "schema.invalid_point_symbol", `${field}.symbol`, `${field}.symbol must be null or a non-empty string.`);
    return false;
  }
  return true;
}

function verifyTargetRefs(contract, errors) {
  if (!Array.isArray(contract.target_refs)) {
    addFinding(errors, "schema.invalid_target_refs", "target_refs", "target_refs must be a list.");
    return;
  }
  const ids = new Set();
  contract.target_refs.forEach((target, index) => {
    const field = `target_refs[${index}]`;
    if (!hasExactKeys(target, TARGET_KEYS)) {
      addFinding(errors, "schema.invalid_target_ref", field, `Target references must use: ${TARGET_KEYS.join(", ")}.`);
      return;
    }
    if (typeof target.id !== "string" || !/^target_[1-9]\d*$/.test(target.id)) {
      addFinding(errors, "target.invalid_id", `${field}.id`, "Target id must use target_1, target_2, and so on.");
    } else if (ids.has(target.id)) {
      addFinding(errors, "target.duplicate_id", `${field}.id`, `Duplicate target id: ${target.id}`);
    } else ids.add(target.id);
    if (typeof target.label !== "string" || !target.label.trim()) {
      addFinding(errors, "target.invalid_label", `${field}.label`, "Target label must be a non-empty string.");
    }
    if (!TARGET_SOURCES.has(target.source)) {
      addFinding(errors, "target.invalid_source", `${field}.source`, `Unknown target source: ${target.source}`);
    }
    if (target.source === "screenshot_annotation") verifyScreenshotTarget(target, field, errors);
    if (target.source === "dom_selection") verifyDomTarget(target, field, errors);
    if (target.source === "browser_context") verifyBrowserTarget(target, field, errors);
  });
  [...ids].forEach((id, index) => {
    if (id !== `target_${index + 1}`) {
      addFinding(errors, "target.non_sequential_id", "target_refs", "Target ids must be sequential and preserve conversation order.");
    }
  });
}

function verifyScreenshotTarget(target, field, errors) {
  if (!isObject(target.attachment)) {
    addFinding(errors, "target.missing_attachment", `${field}.attachment`, "Screenshot annotations require attachment evidence.");
    return;
  }
  if (!hasExactKeys(target.attachment, ["attachment_id", "annotation_id", "bounds", "image_size"])) {
    addFinding(errors, "target.invalid_attachment_shape", `${field}.attachment`, "Screenshot attachment evidence has unexpected fields.");
  }
  const { attachment_id: attachmentId, annotation_id: annotationId, bounds, image_size: imageSize } = target.attachment;
  if (typeof attachmentId !== "string" || !attachmentId || typeof annotationId !== "string" || !annotationId) {
    addFinding(errors, "target.invalid_attachment_id", `${field}.attachment`, "Attachment and annotation ids must be non-empty.");
  }
  if (!hasExactKeys(bounds, ["x", "y", "width", "height", "unit"]) || bounds.unit !== "ratio") {
    addFinding(errors, "target.invalid_bounds", `${field}.attachment.bounds`, "Screenshot bounds must use normalized ratios.");
  } else {
    const values = [bounds.x, bounds.y, bounds.width, bounds.height];
    if (values.some((value) => typeof value !== "number" || value < 0 || value > 1)) {
      addFinding(errors, "target.invalid_bounds", `${field}.attachment.bounds`, "Every screenshot bound must be between 0 and 1.");
    } else if (bounds.width === 0 || bounds.height === 0 || bounds.x + bounds.width > 1 || bounds.y + bounds.height > 1) {
      addFinding(errors, "target.invalid_bounds", `${field}.attachment.bounds`, "Screenshot bounds must describe a non-empty region inside the image.");
    }
  }
  if (
    !hasExactKeys(imageSize, ["width", "height"])
    || !Number.isInteger(imageSize.width)
    || imageSize.width < 1
    || !Number.isInteger(imageSize.height)
    || imageSize.height < 1
  ) {
    addFinding(errors, "target.invalid_image_size", `${field}.attachment.image_size`, "Image size requires positive integer width and height.");
  }
  if (target.browser !== null || target.dom !== null) {
    addFinding(errors, "target.cross_source_binding", field, "Screenshot evidence cannot invent browser or DOM bindings.");
  }
}

function verifyBrowserEvidence(browser, field, errors) {
  if (!isObject(browser)) {
    addFinding(errors, "target.missing_browser", field, "Browser-backed targets require browser evidence.");
    return;
  }
  if (!hasExactKeys(browser, BROWSER_KEYS)) {
    addFinding(errors, "target.invalid_browser_shape", field, "Browser evidence has unexpected or missing fields.");
  }
  if (typeof browser.url !== "string" || !browser.url || typeof browser.route !== "string") {
    addFinding(errors, "target.invalid_browser_location", field, "Browser evidence requires a sanitized URL and route.");
  } else {
    try {
      const url = new URL(browser.url);
      const fragmentParams = url.hash.includes("=")
        ? new URLSearchParams(url.hash.slice(url.hash.indexOf("?") + 1).replace(/^#/, ""))
        : new URLSearchParams();
      if (
        [...url.searchParams.keys(), ...fragmentParams.keys()].some((key) => SENSITIVE_URL_KEY.test(key))
      ) {
        addFinding(errors, "target.sensitive_url", `${field}.url`, "Browser URL still contains a sensitive parameter or fragment.");
      }
    } catch {
      addFinding(errors, "target.invalid_browser_url", `${field}.url`, "Browser URL must be absolute and parseable.");
    }
  }
  if (
    !hasExactKeys(browser.viewport, ["width", "height"])
    || !Number.isInteger(browser.viewport.width)
    || browser.viewport.width < 1
    || !Number.isInteger(browser.viewport.height)
    || browser.viewport.height < 1
  ) {
    addFinding(errors, "target.invalid_viewport", `${field}.viewport`, "Viewport requires positive integer width and height.");
  }
  if (
    !Array.isArray(browser.page_state)
    || browser.page_state.some((item) => typeof item !== "string")
    || !Array.isArray(browser.frame_path)
    || browser.frame_path.some((item) => typeof item !== "string")
  ) {
    addFinding(errors, "target.invalid_browser_state", field, "Browser page_state and frame_path must be lists.");
  }
  if (typeof browser.captured_at !== "string" || Number.isNaN(Date.parse(browser.captured_at))) {
    addFinding(errors, "target.invalid_capture_time", `${field}.captured_at`, "captured_at must be an ISO-compatible timestamp.");
  }
}

function verifyDomTarget(target, field, errors) {
  verifyBrowserEvidence(target.browser, `${field}.browser`, errors);
  if (!isObject(target.dom)) {
    addFinding(errors, "target.missing_dom", `${field}.dom`, "DOM selections require DOM evidence.");
  } else {
    if (!hasExactKeys(target.dom, DOM_KEYS)) {
      addFinding(errors, "target.invalid_dom_shape", `${field}.dom`, "DOM evidence has unexpected or missing fields.");
    }
    if (target.dom.selector !== null && (typeof target.dom.selector !== "string" || !target.dom.selector.trim())) {
      addFinding(errors, "target.invalid_selector", `${field}.dom.selector`, "DOM selector must be null or non-empty.");
    } else if (typeof target.dom.selector === "string" && (/nth-child/i.test(target.dom.selector) || target.dom.selector.startsWith("/"))) {
      addFinding(errors, "target.brittle_selector", `${field}.dom.selector`, "DOM selector cannot use nth-child or an absolute XPath.");
    }
    if (!Number.isInteger(target.dom.match_ordinal) || target.dom.match_ordinal < 1) {
      addFinding(errors, "target.invalid_ordinal", `${field}.dom.match_ordinal`, "DOM match_ordinal must be 1-based.");
    }
    if (!hasExactKeys(target.dom.fingerprint, FINGERPRINT_KEYS)) {
      addFinding(errors, "target.missing_fingerprint", `${field}.dom.fingerprint`, "DOM selections require a fingerprint.");
    } else if (
      typeof target.dom.fingerprint.tag_name !== "string"
      || (target.dom.fingerprint.role !== null && typeof target.dom.fingerprint.role !== "string")
      || (target.dom.fingerprint.accessible_name !== null && typeof target.dom.fingerprint.accessible_name !== "string")
      || !isObject(target.dom.fingerprint.stable_attributes)
      || Object.values(target.dom.fingerprint.stable_attributes).some((value) => typeof value !== "string")
    ) {
      addFinding(errors, "target.invalid_fingerprint", `${field}.dom.fingerprint`, "DOM fingerprint values must be stable strings or null where allowed.");
    }
    if (!DOM_STRATEGIES.has(target.dom.strategy)) {
      addFinding(errors, "target.invalid_strategy", `${field}.dom.strategy`, `Unknown selector strategy: ${target.dom.strategy}`);
    }
  }
  if (target.attachment !== null) {
    addFinding(errors, "target.cross_source_binding", field, "DOM selection cannot invent screenshot attachment evidence.");
  }
}

function verifyBrowserTarget(target, field, errors) {
  verifyBrowserEvidence(target.browser, `${field}.browser`, errors);
  if (target.attachment !== null || target.dom !== null) {
    addFinding(errors, "target.cross_source_binding", field, "Browser context cannot invent screenshot or DOM evidence.");
  }
}

function verifyEvidenceShape(contract, errors) {
  if (!Array.isArray(contract.evidence)) {
    addFinding(errors, "schema.invalid_evidence", "evidence", "evidence must be a list.");
    return false;
  }
  contract.evidence.forEach((item, index) => {
    const field = `evidence[${index}]`;
    if (!hasExactKeys(item, ["type", "summary", "source"])) {
      addFinding(errors, "schema.invalid_evidence_item", field, "Evidence must contain only type, summary, and source.");
      return;
    }
    for (const key of ["type", "summary", "source"]) {
      if (typeof item[key] !== "string" || !item[key].trim()) {
        addFinding(errors, "schema.invalid_evidence_value", `${field}.${key}`, `${field}.${key} must be non-empty.`);
      }
    }
  });
  return true;
}

function verifyExternalWriteScope(contract, errors) {
  if (!Array.isArray(contract.external_write_scope)) {
    addFinding(errors, "schema.invalid_external_write_scope", "external_write_scope", "external_write_scope must be a list.");
    return false;
  }
  contract.external_write_scope.forEach((item, index) => {
    const field = `external_write_scope[${index}]`;
    if (!hasExactKeys(item, EXTERNAL_WRITE_KEYS)) {
      addFinding(errors, "external.invalid_shape", field, `External write entries must use: ${EXTERNAL_WRITE_KEYS.join(", ")}.`);
      return;
    }
    for (const key of EXTERNAL_WRITE_KEYS) {
      if (typeof item[key] !== "string" || !item[key].trim()) {
        addFinding(errors, "external.empty_value", `${field}.${key}`, `${field}.${key} must be non-empty.`);
      }
    }
    if (typeof item.authorization_quote === "string" && item.authorization_quote.trim()) {
      if (
        !EXPLICIT_EXTERNAL_WRITE.test(item.authorization_quote.trim())
        && !CONTEXTUAL_EXTERNAL_AUTHORIZATION.test(item.authorization_quote.trim())
      ) {
        addFinding(errors, "external.missing_explicit_authorization", `${field}.authorization_quote`, "External writes require a verbatim current-turn mutation command or a short affirmative reply to the immediately preceding exact proposal.");
      }
      if (
        PRIMARY_DIAGNOSTIC_REQUEST.test(item.authorization_quote.trim())
        && !DIAGNOSIS_THEN_IMPLEMENT.test(item.authorization_quote.trim())
      ) {
        addFinding(errors, "external.diagnostic_quote_is_not_authorization", `${field}.authorization_quote`, "A diagnostic request does not authorize an external write.");
      }
    }
  });
  return true;
}

export async function inspectContract(contract, project) {
  const errors = [];
  const warnings = [];
  const verifiedFiles = [];
  const projectRoot = await realpath(path.resolve(project));

  if (!isObject(contract)) {
    addFinding(errors, "schema.not_object", "$", "Contract must be a JSON object.");
    return buildOutput(projectRoot, errors, warnings, verifiedFiles, []);
  }

  const actualKeys = Object.keys(contract);
  if (actualKeys.join("|") !== CONTRACT_KEYS.join("|")) {
    addFinding(
      errors,
      "schema.invalid_keys",
      "$",
      `Contract must use the exact ordered keys: ${CONTRACT_KEYS.join(", ")}.`,
    );
  }
  if (contract.schema_version !== CONTRACT_VERSION) {
    addFinding(errors, "schema.unsupported_version", "schema_version", `Expected ${CONTRACT_VERSION}.`);
  }
  if (!RESULTS.has(contract.result)) addFinding(errors, "schema.invalid_result", "result", `Unknown result: ${contract.result}`);
  if (!MODES.has(contract.mode)) addFinding(errors, "schema.invalid_mode", "mode", `Unknown mode: ${contract.mode}`);
  if (!AUTHORIZATIONS.has(contract.authorization)) {
    addFinding(errors, "schema.invalid_authorization", "authorization", `Unknown authorization: ${contract.authorization}`);
  }
  if (!SCOPE_POLICIES.has(contract.scope_policy)) {
    addFinding(errors, "schema.invalid_scope_policy", "scope_policy", `Unknown scope policy: ${contract.scope_policy}`);
  }
  if (typeof contract.source_request !== "string" || !contract.source_request.trim()) {
    addFinding(errors, "schema.empty_source_request", "source_request", "source_request must preserve a non-empty request.");
  }
  if (contract.next_skill !== null && (typeof contract.next_skill !== "string" || !contract.next_skill.trim())) {
    addFinding(errors, "schema.invalid_next_skill", "next_skill", "next_skill must be null or a non-empty string.");
  }

  const entryValid = verifyPointShape(contract, "entry_point", errors);
  const controlValid = verifyPointShape(contract, "control_point", errors);
  verifyTargetRefs(contract, errors);
  const writeScopeValid = verifyStringList(contract, "write_scope", errors);
  const externalWriteScopeValid = verifyExternalWriteScope(contract, errors);
  const excludedScopeValid = verifyStringList(contract, "excluded_scope", errors);
  verifyStringList(contract, "behavior", errors, { nonEmpty: contract.mode === "modify_and_verify" });
  const evidenceValid = verifyEvidenceShape(contract, errors);
  verifyStringList(contract, "verification", errors, { nonEmpty: contract.mode === "modify_and_verify" });
  const questionsValid = verifyStringList(contract, "open_questions", errors);

  if (contract.mode === "modify_and_verify" && contract.authorization !== "authorized") {
    addFinding(errors, "semantics.modification_not_authorized", "authorization", "modify_and_verify requires authorized.");
  }
  if (["inspect_only", "plan_only", "plan_then_execute"].includes(contract.mode) && contract.authorization !== "inspect_only") {
    addFinding(errors, "semantics.read_only_authorization", "authorization", `${contract.mode} requires inspect_only.`);
  }
  if (
    contract.mode === "modify_and_verify"
    && typeof contract.source_request === "string"
    && PRIMARY_DIAGNOSTIC_REQUEST.test(contract.source_request.trim())
    && !DIAGNOSIS_THEN_IMPLEMENT.test(contract.source_request.trim())
  ) {
    addFinding(errors, "semantics.diagnostic_request_is_read_only", "mode", "A primary diagnostic request remains inspect_only even when followed by defect details.");
  }
  if (
    externalWriteScopeValid
    && contract.external_write_scope.length > 0
    && (contract.mode !== "modify_and_verify" || contract.authorization !== "authorized")
  ) {
    addFinding(errors, "external.read_only_contract_has_writes", "external_write_scope", "Read-only and planning contracts cannot carry authorized external writes.");
  }
  if (questionsValid) {
    if (contract.result === "clarify" && contract.open_questions.length !== 1) {
      addFinding(errors, "semantics.clarify_question_count", "open_questions", "clarify requires exactly one decisive question.");
    }
    if (contract.result !== "clarify" && contract.open_questions.length !== 0) {
      addFinding(errors, "semantics.release_has_questions", "open_questions", "Released contracts cannot keep open questions.");
    }
  }
  if (contract.scope_policy === "bounded" && writeScopeValid && contract.write_scope.length === 0) {
    addFinding(errors, "scope.empty_bounded_scope", "write_scope", "bounded scope requires at least one allowed path.");
  }

  if (entryValid && contract.entry_point) {
    await verifyReference({
      projectRoot,
      field: "entry_point",
      relativePath: contract.entry_point.path,
      line: contract.entry_point.line,
      errors,
      verifiedFiles,
    });
  }
  if (controlValid && contract.control_point) {
    await verifyReference({
      projectRoot,
      field: "control_point",
      relativePath: contract.control_point.path,
      line: contract.control_point.line,
      errors,
      verifiedFiles,
    });
  }

  const normalizedWrites = [];
  if (writeScopeValid) {
    for (const [index, scopePath] of contract.write_scope.entries()) {
      const normalized = normalizeRepoPattern(scopePath);
      if (!normalized) {
        addFinding(errors, "scope.invalid_write_path", `write_scope[${index}]`, `Invalid repository scope: ${scopePath}`);
        continue;
      }
      normalizedWrites.push(normalized);
      if (!hasGlob(normalized)) {
        await verifyWritePath({
          projectRoot,
          field: `write_scope[${index}]`,
          relativePath: normalized,
          errors,
          warnings,
          verifiedFiles,
        });
      }
    }
  }

  const normalizedExclusions = [];
  if (excludedScopeValid) {
    contract.excluded_scope.forEach((scopePath, index) => {
      const normalized = normalizeRepoPattern(scopePath);
      if (!normalized) addFinding(errors, "scope.invalid_exclusion", `excluded_scope[${index}]`, `Invalid exclusion: ${scopePath}`);
      else normalizedExclusions.push(normalized);
    });
  }
  normalizedWrites.filter((item) => !hasGlob(item)).forEach((writePath) => {
    if (normalizedExclusions.some((pattern) => pathMatches(writePath, pattern))) {
      addFinding(errors, "scope.write_is_excluded", "write_scope", `Writable path is excluded: ${writePath}`);
    }
  });

  if (evidenceValid) {
    for (const [index, item] of contract.evidence.entries()) {
      if (typeof item?.source !== "string") continue;
      const local = localEvidenceSource(item.source);
      if (!local) continue;
      await verifyReference({
        projectRoot,
        field: `evidence[${index}].source`,
        relativePath: local.path,
        line: local.line,
        errors,
        verifiedFiles,
      });
    }
  }

  if (
    entryValid
    && controlValid
    && contract.entry_point
    && contract.control_point
    && JSON.stringify(contract.entry_point) === JSON.stringify(contract.control_point)
  ) {
    addFinding(
      warnings,
      "control.same_as_entry",
      "control_point",
      "entry_point and control_point are identical; confirm this is proven rather than copied as a fallback.",
    );
  }
  if (
    controlValid
    && contract.control_point
    && normalizedWrites.length
    && normalizeRepoPattern(contract.control_point.path)
    && !normalizedWrites.some((pattern) => pathMatches(normalizeRepoPattern(contract.control_point.path), pattern))
  ) {
    addFinding(
      warnings,
      "scope.control_point_not_writable",
      "control_point.path",
      "The control point is outside write_scope; confirm that implementation does not need to modify it.",
    );
  }

  return buildOutput(projectRoot, errors, warnings, verifiedFiles, normalizedWrites, contract.external_write_scope ?? []);
}

function buildOutput(projectRoot, errors, warnings, verifiedFiles, normalizedWrites, externalWrites = []) {
  const uniqueFiles = [...new Map(verifiedFiles.map((item) => [`${item.field}:${item.path}:${item.line}`, item])).values()];
  return {
    contract_check_version: CHECK_VERSION,
    status: errors.length ? "invalid" : "valid",
    project: projectRoot,
    checks: {
      schema: !errors.some((item) => item.code.startsWith("schema.")),
      semantics: !errors.some((item) => item.code.startsWith("semantics.")),
      targets: !errors.some((item) => item.code.startsWith("target.")),
      references: !errors.some((item) => item.code.startsWith("reference.")),
      scope: !errors.some((item) => item.code.startsWith("scope.")),
      external_writes: !errors.some((item) => item.code.startsWith("external.")),
    },
    verified: {
      files: uniqueFiles,
      write_scope: normalizedWrites,
      external_write_scope: externalWrites,
    },
    errors,
    warnings,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function parseArgs(argv) {
  const command = argv[0];
  if (!new Set(["inspect", "validate"]).has(command)) {
    throw new Error("Usage: contract-check.mjs <inspect|validate> --project <path> [--contract <json-file>] ");
  }
  let project = process.cwd();
  let contractPath = null;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!new Set(["--project", "--contract"]).has(argument)) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${argument} requires a value.`);
    if (argument === "--project") project = value;
    else contractPath = value;
    index += 1;
  }
  return { command, project, contractPath };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const input = options.contractPath
    ? await readFile(path.resolve(options.contractPath), "utf8")
    : await readStdin();
  if (!input.trim()) throw new Error("Contract JSON is required via stdin or --contract.");
  const contract = JSON.parse(input);
  const output = await inspectContract(contract, options.project);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (options.command === "validate" && output.status !== "valid") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
