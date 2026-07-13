import { readFile } from "node:fs/promises";
import process from "node:process";
import readline from "node:readline";

import { createTaskCardStore } from "./task-card.mjs";

const WIDGET_URI = "ui://ai-talk/task-confirmation-v1.html";
const WIDGET_MIME_TYPE = "text/html;profile=mcp-app";
const widgetHtml = await readFile(new URL("./task-card.html", import.meta.url), "utf8");
const store = createTaskCardStore();

const tools = [
  {
    name: "show_ai_talk_task",
    title: "Show AI Talk task confirmation",
    description:
      "Render a prepared AI Talk task as a lightweight confirmation card. Do not call this for confirmation.presentation=bypass.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["confirmation"],
      properties: {
        confirmation: {
          type: "object",
          description: "The task_context.confirmation object returned by AI Talk.",
        },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false },
    _meta: {
      ui: { resourceUri: WIDGET_URI },
      "openai/outputTemplate": WIDGET_URI,
      "openai/toolInvocation/invoking": "正在准备任务确认卡",
      "openai/toolInvocation/invoked": "任务确认卡已准备",
    },
  },
  {
    name: "adjust_ai_talk_task",
    title: "Adjust AI Talk task confirmation",
    description:
      "Update only execution mode, task scope, and matched capability usage for an existing AI Talk task card.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["card_id"],
      properties: {
        card_id: { type: "string" },
        execution_mode: {
          type: "string",
          enum: ["analyze", "plan", "modify_and_verify", "review"],
        },
        scope: { type: "array", items: { type: "string" }, maxItems: 8 },
        use_capabilities: { type: "boolean" },
        capability_preferences: {
          type: "object",
          additionalProperties: {
            type: "string",
            enum: ["prefer_reuse", "prefer_reference", "excluded"],
          },
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    _meta: {
      ui: { resourceUri: WIDGET_URI },
      "openai/outputTemplate": WIDGET_URI,
      "openai/toolInvocation/invoking": "正在更新任务",
      "openai/toolInvocation/invoked": "任务已更新",
    },
  },
];

function toolResult(card, message) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: card,
    _meta: { "openai/outputTemplate": WIDGET_URI },
  };
}

function errorResult(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

async function handleRequest(message) {
  const { id, method, params = {} } = message;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params.protocolVersion ?? "2026-01-26",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "ai-talk", version: "0.2.0" },
      },
    };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools } };
  }
  if (method === "resources/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        resources: [
          {
            uri: WIDGET_URI,
            name: "AI Talk task confirmation",
            description: "Lightweight task confirmation card for AI Talk.",
            mimeType: WIDGET_MIME_TYPE,
          },
        ],
      },
    };
  }
  if (method === "resources/read") {
    if (params.uri !== WIDGET_URI) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32002, message: "Resource not found" },
      };
    }
    return {
      jsonrpc: "2.0",
      id,
      result: {
        contents: [
          {
            uri: WIDGET_URI,
            mimeType: WIDGET_MIME_TYPE,
            text: widgetHtml,
            _meta: {
              ui: {
                prefersBorder: true,
                csp: { connectDomains: [], resourceDomains: [] },
              },
              "openai/widgetDescription":
                "AI Talk task confirmation with bounded adjustments and explicit execution.",
            },
          },
        ],
      },
    };
  }
  if (method === "tools/call") {
    try {
      if (params.name === "show_ai_talk_task") {
        const card = store.create(params.arguments?.confirmation);
        return {
          jsonrpc: "2.0",
          id,
          result: toolResult(card, "AI Talk 任务确认卡已生成。"),
        };
      }
      if (params.name === "adjust_ai_talk_task") {
        const { card_id, ...adjustments } = params.arguments ?? {};
        const card = store.adjust(card_id, adjustments);
        return {
          jsonrpc: "2.0",
          id,
          result: toolResult(card, "AI Talk 任务调整已保存。"),
        };
      }
      return { jsonrpc: "2.0", id, result: errorResult("Unknown AI Talk tool.") };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        result: errorResult(error instanceof Error ? error.message : String(error)),
      };
    }
  }

  if (id === undefined) return null;
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  try {
    const message = JSON.parse(line);
    const response = await handleRequest(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: error instanceof Error ? error.message : "Invalid JSON",
        },
      })}\n`,
    );
  }
}
