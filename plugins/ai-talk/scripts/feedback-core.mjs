import { chmod, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const FEEDBACK_VERSION = "1.0";
export const FEEDBACK_MARKER_ELIGIBLE = "<!-- ai-talk-feedback:eligible -->";
export const FEEDBACK_MARKER_ASKED = "<!-- ai-talk-feedback:asked -->";
export const FEEDBACK_QUESTION =
  "AI Talk 对这次需求理解和执行交接有帮助吗？回复“有帮助 / 一般 / 没帮助”，可补充原因。";

const CONTRACT_RESULTS = new Set(["skip", "handoff", "clarify"]);
const MODES = new Set([
  "modify_and_verify",
  "inspect_only",
  "plan_only",
  "plan_then_execute",
]);
const OUTCOMES = new Set(["completed", "partial", "failed", "blocked"]);
const RATINGS = new Set(["helpful", "neutral", "unhelpful"]);
const SOURCES = new Set(["user_feedback", "technical_error"]);
const CATEGORIES = new Set([
  "helpful",
  "unclassified",
  "misclassified_intent",
  "unnecessary_clarification",
  "wrong_target_binding",
  "insufficient_evidence",
  "failed_handoff",
  "repeated_work",
  "technical_error",
]);
const DEFAULT_COMPLETED_SAMPLE_RATE = 0.2;
const DEFAULT_STALE_CLAIM_MS = 5 * 60 * 1000;

function optionalEnum(value, values) {
  return values.has(value) ? value : null;
}

function redactText(value, maxLength = 2000) {
  if (typeof value !== "string") return null;
  const redacted = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_API_KEY]")
    .replace(
      /\b(token|access_token|refresh_token|session|session_id|signature|sig|password|passwd|secret|api[_-]?key)\b(\s*[:=]\s*)([^\s,;&]+)/gi,
      "$1$2[REDACTED]",
    )
    .replace(
      /([?&](?:token|access_token|refresh_token|session|session_id|signature|sig|password|secret|api[_-]?key)=)[^&#\s]*/gi,
      "$1[REDACTED]",
    )
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .trim();
  return redacted ? redacted.slice(0, maxLength) : null;
}

function stringList(value, { allowed, maxItems = 8, maxLength = 80 } = {}) {
  if (!Array.isArray(value)) return [];
  const unique = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim().slice(0, maxLength);
    if (!normalized || (allowed && !allowed.has(normalized)) || unique.includes(normalized)) {
      continue;
    }
    unique.push(normalized);
    if (unique.length >= maxItems) break;
  }
  return unique;
}

export function normalizeFeedback(input, defaults = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Feedback input must be an object.");
  }

  const source = optionalEnum(input.source, SOURCES) ?? defaults.source ?? "user_feedback";
  const rating = optionalEnum(input.rating, RATINGS);
  const categories = stringList(input.categories, { allowed: CATEGORIES });
  if (!categories.length) {
    categories.push(source === "technical_error" ? "technical_error" : rating === "helpful" ? "helpful" : "unclassified");
  }

  return {
    feedback_version: FEEDBACK_VERSION,
    feedback_id: typeof input.feedback_id === "string" && input.feedback_id.trim()
      ? input.feedback_id.trim().slice(0, 128)
      : randomUUID(),
    created_at: typeof input.created_at === "string" && !Number.isNaN(Date.parse(input.created_at))
      ? new Date(input.created_at).toISOString()
      : new Date().toISOString(),
    plugin_version: redactText(input.plugin_version ?? defaults.plugin_version, 80) ?? "unknown",
    source,
    contract_result: optionalEnum(input.contract_result, CONTRACT_RESULTS),
    mode: optionalEnum(input.mode, MODES),
    outcome: optionalEnum(input.outcome, OUTCOMES) ?? (source === "technical_error" ? "failed" : "completed"),
    rating,
    categories,
    user_comment: redactText(input.user_comment),
    error_codes: stringList(input.error_codes, { maxItems: 8, maxLength: 120 })
      .map((code) => code.replace(/[^A-Za-z0-9_.:-]/g, "_")),
    sanitized_context: redactText(input.sanitized_context),
  };
}

export function feedbackDataDir(env = process.env) {
  return env.AI_TALK_FEEDBACK_DIR
    || env.PLUGIN_DATA
    || env.CLAUDE_PLUGIN_DATA
    || path.join(homedir(), ".codex", "plugin-data", "ai-talk");
}

export function feedbackSpoolPaths(env = process.env) {
  const root = path.join(feedbackDataDir(env), "feedback-spool");
  return {
    root,
    pending: path.join(root, "pending"),
    sending: path.join(root, "sending"),
    invalid: path.join(root, "invalid"),
  };
}

export function feedbackPreferencePath(env = process.env) {
  return path.join(feedbackDataDir(env), "feedback-preferences.json");
}

async function ensurePrivateDir(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => {});
}

async function ensureSpool(env) {
  const spool = feedbackSpoolPaths(env);
  await Promise.all(Object.values(spool).map((directory) => ensurePrivateDir(directory)));
  return spool;
}

function feedbackFileName(feedbackId) {
  const digest = createHash("sha256").update(String(feedbackId)).digest("hex");
  return `${digest}.json`;
}

export async function queueFeedback(envelope, env = process.env) {
  const spool = await ensureSpool(env);
  const fileName = feedbackFileName(envelope.feedback_id);
  const queuePath = path.join(spool.pending, fileName);
  const temporaryPath = path.join(spool.pending, `.${fileName}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(envelope)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, queuePath);
  await chmod(queuePath, 0o600).catch(() => {});
  return queuePath;
}

export function remoteFeedbackConfig(env = process.env) {
  const endpoint = env.AI_TALK_FEEDBACK_ENDPOINT?.trim() || null;
  const consent = env.AI_TALK_FEEDBACK_CONSENT === "1";
  if (!endpoint) return { endpoint: null, consent, token: null };

  const url = new URL(endpoint);
  const localHttp = url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("AI_TALK_FEEDBACK_ENDPOINT must use HTTPS, except for localhost development.");
  }
  return {
    endpoint: url.toString(),
    consent,
    token: env.AI_TALK_FEEDBACK_TOKEN?.trim() || null,
  };
}

async function postFeedback(envelope, config, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("No fetch implementation is available.");
  const headers = { "content-type": "application/json" };
  if (config.token) headers.authorization = `Bearer ${config.token}`;
  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Feedback endpoint returned HTTP ${response.status}.`);
}

export async function submitFeedback(input, options = {}) {
  const env = options.env ?? process.env;
  const envelope = normalizeFeedback(input, options.defaults);
  let config;
  try {
    config = remoteFeedbackConfig(env);
  } catch (error) {
    const queuePath = await queueFeedback(envelope, env);
    return { status: "queued_local", reason: "invalid_endpoint", queue_path: queuePath, envelope };
  }

  if (!config.endpoint || !config.consent) {
    const queuePath = await queueFeedback(envelope, env);
    return {
      status: "queued_local",
      reason: config.endpoint ? "consent_required" : "endpoint_not_configured",
      queue_path: queuePath,
      envelope,
    };
  }

  try {
    await postFeedback(envelope, config, options.fetchImpl);
    return { status: "uploaded", envelope };
  } catch (error) {
    const queuePath = await queueFeedback(envelope, env);
    return { status: "queued_local", reason: "delivery_failed", queue_path: queuePath, envelope };
  }
}

async function jsonFiles(directory) {
  try {
    return (await readdir(directory)).filter((fileName) => fileName.endsWith(".json")).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function recoverStaleClaims(spool, options = {}) {
  const now = options.now ?? Date.now();
  const staleClaimMs = options.staleClaimMs ?? DEFAULT_STALE_CLAIM_MS;
  for (const fileName of await jsonFiles(spool.sending)) {
    const claimedPath = path.join(spool.sending, fileName);
    try {
      const claimed = await stat(claimedPath);
      if (now - claimed.mtimeMs < staleClaimMs) continue;
      await rename(claimedPath, path.join(spool.pending, fileName));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

async function releaseClaim(claimedPath, pendingPath) {
  try {
    await rename(claimedPath, pendingPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export async function flushFeedbackQueue(options = {}) {
  const env = options.env ?? process.env;
  const config = remoteFeedbackConfig(env);
  if (!config.endpoint || !config.consent) {
    return { status: "skipped", reason: config.endpoint ? "consent_required" : "endpoint_not_configured" };
  }

  const spool = await ensureSpool(env);
  await recoverStaleClaims(spool, options);
  const pending = await jsonFiles(spool.pending);
  if (!pending.length) return { status: "empty", uploaded: 0, remaining: 0, invalid: 0 };

  let uploaded = 0;
  let invalid = 0;
  for (const fileName of pending) {
    const pendingPath = path.join(spool.pending, fileName);
    const claimedPath = path.join(spool.sending, fileName);
    try {
      await rename(pendingPath, claimedPath);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }

    let envelope;
    try {
      envelope = normalizeFeedback(JSON.parse(await readFile(claimedPath, "utf8")));
    } catch {
      await rename(claimedPath, path.join(spool.invalid, fileName)).catch(() => {});
      invalid += 1;
      continue;
    }

    try {
      await postFeedback(envelope, config, options.fetchImpl);
      await unlink(claimedPath);
      uploaded += 1;
    } catch {
      await releaseClaim(claimedPath, pendingPath);
    }
  }

  return {
    status: "flushed",
    uploaded,
    remaining: (await jsonFiles(spool.pending)).length,
    invalid,
  };
}

export async function readFeedbackPreference(env = process.env) {
  if (env.AI_TALK_FEEDBACK_PROMPT === "0") return { prompt_enabled: false, local_only: false };
  if (env.AI_TALK_FEEDBACK_PROMPT === "1") return { prompt_enabled: true, local_only: true };
  try {
    const value = JSON.parse(await readFile(feedbackPreferencePath(env), "utf8"));
    return {
      prompt_enabled: value.prompt_enabled !== false,
      local_only: value.local_only === true,
    };
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) {
      return { prompt_enabled: true, local_only: false };
    }
    throw error;
  }
}

export async function writeFeedbackPreference(promptEnabled, env = process.env) {
  const preferencePath = feedbackPreferencePath(env);
  await ensurePrivateDir(path.dirname(preferencePath));
  await writeFile(preferencePath, `${JSON.stringify({
    prompt_enabled: Boolean(promptEnabled),
    local_only: Boolean(promptEnabled),
  }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return preferencePath;
}

function completedSampleRate(env) {
  const configured = Number(env.AI_TALK_FEEDBACK_SAMPLE_RATE);
  if (!Number.isFinite(configured)) return DEFAULT_COMPLETED_SAMPLE_RATE;
  return Math.min(1, Math.max(0, configured));
}

export async function shouldAskFeedback(outcome, options = {}) {
  if (!OUTCOMES.has(outcome)) return { ask: false, reason: "invalid_outcome" };
  const env = options.env ?? process.env;
  const { prompt_enabled: promptEnabled, local_only: localOnly } = await readFeedbackPreference(env);
  if (!promptEnabled) return { ask: false, reason: "prompt_disabled" };

  const forceLocal = localOnly;
  if (!forceLocal) {
    let config;
    try {
      config = remoteFeedbackConfig(env);
    } catch {
      return { ask: false, reason: "invalid_endpoint" };
    }
    if (!config.endpoint) return { ask: false, reason: "endpoint_not_configured" };
    if (!config.consent) return { ask: false, reason: "consent_required" };
  }

  if (outcome !== "completed") return { ask: true, reason: "non_success_terminal" };
  const sampleRate = completedSampleRate(env);
  const random = options.random ?? Math.random;
  return {
    ask: random() < sampleRate,
    reason: "completed_sample",
    sample_rate: sampleRate,
  };
}

export function isExplicitToolError(input) {
  if (!input || typeof input !== "object") return false;
  const candidates = [input, input.tool_response, input.tool_result, input.result];
  return candidates.some((candidate) => candidate && typeof candidate === "object" && (
    candidate.is_error === true
    || candidate.isError === true
    || candidate.success === false
    || candidate.status === "failed"
  ));
}

export function safeToolName(input) {
  const value = input?.tool_name ?? input?.toolName ?? input?.tool?.name ?? "unknown_tool";
  return String(value).slice(0, 80).replace(/[^A-Za-z0-9_.:-]/g, "_") || "unknown_tool";
}
