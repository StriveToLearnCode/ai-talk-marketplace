#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  FEEDBACK_MARKER_ASKED,
  FEEDBACK_MARKER_ELIGIBLE,
  FEEDBACK_QUESTION,
  isExplicitToolError,
  readFeedbackPreference,
  safeToolName,
  shouldAskFeedback,
  submitFeedback,
} from "./feedback-core.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function pluginVersion() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  try {
    const manifest = JSON.parse(await readFile(path.join(scriptDir, "../.codex-plugin/plugin.json"), "utf8"));
    return manifest.version || "unknown";
  } catch {
    return "unknown";
  }
}

function eventName(input) {
  return String(input.hook_event_name ?? input.event_name ?? input.eventName ?? "").toLowerCase();
}

function routedTaskId(input) {
  const value = input.ai_talk_task_id ?? input.aiTalkTaskId ?? input.context?.ai_talk_task_id;
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 128);
  return normalized || null;
}

function routeKind(input) {
  const value = input.ai_talk_route ?? input.aiTalkRoute ?? input.context?.ai_talk_route;
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function terminalOutcome(input) {
  const value = input.ai_talk_outcome ?? input.aiTalkOutcome ?? input.context?.ai_talk_outcome;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : null;
  return ["completed", "partial", "failed", "blocked"].includes(normalized) ? normalized : null;
}

async function handlePostToolUse(input) {
  if (!isExplicitToolError(input)) return;
  if (!routedTaskId(input)) return;
  if (!(await shouldAskFeedback("failed")).ask) return;
  const toolName = safeToolName(input);
  await submitFeedback({
    plugin_version: await pluginVersion(),
    source: "technical_error",
    outcome: "failed",
    categories: ["technical_error"],
    error_codes: [`tool_error:${toolName}`],
    sanitized_context: `Tool ${toolName} reported an explicit error.`,
  });
}

async function handleStop(input) {
  const message = String(input.last_assistant_message ?? input.lastAssistantMessage ?? "");
  if (message.includes(FEEDBACK_MARKER_ASKED)) return;

  let eligible = message.includes(FEEDBACK_MARKER_ELIGIBLE);
  if (!eligible) {
    if (!routedTaskId(input) || routeKind(input) !== "contract") return;
    const outcome = terminalOutcome(input);
    if (!outcome) return;
    eligible = (await shouldAskFeedback(outcome)).ask;
  } else {
    const { prompt_enabled: promptEnabled } = await readFeedbackPreference();
    eligible = promptEnabled;
  }
  if (!eligible) return;

  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: `保留已有最终答复，并在末尾只追加一次：“${FEEDBACK_QUESTION} ${FEEDBACK_MARKER_ASKED}”。不要重复总结任务，也不要调用 reporter。`,
  }));
}

const input = await readStdin();
const event = eventName(input);
try {
  if (event === "posttooluse" || event === "post_tool_use" || event === "post-tool-use") {
    await handlePostToolUse(input);
  } else if (event === "stop") {
    await handleStop(input);
  }
} catch {
  // Feedback collection must never break or delay the user's primary task.
}
