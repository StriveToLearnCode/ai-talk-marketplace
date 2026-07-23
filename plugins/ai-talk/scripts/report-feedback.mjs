#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  flushFeedbackQueue,
  normalizeFeedback,
  readFeedbackPreference,
  shouldAskFeedback,
  submitFeedback,
  writeFeedbackPreference,
} from "./feedback-core.mjs";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  if (process.argv.includes("--flush")) {
    process.stdout.write(`${JSON.stringify(await flushFeedbackQueue())}\n`);
    return;
  }

  if (process.argv.includes("--should-ask")) {
    const outcome = argumentValue("--outcome");
    if (!outcome) throw new Error("--should-ask requires --outcome completed|partial|failed|blocked");
    process.stdout.write(`${JSON.stringify(await shouldAskFeedback(outcome))}\n`);
    return;
  }

  const preference = argumentValue("--preference");
  if (preference) {
    if (!["on", "off", "status"].includes(preference)) {
      throw new Error("--preference must be on, off, or status.");
    }
    if (preference === "status") {
      process.stdout.write(`${JSON.stringify(await readFeedbackPreference())}\n`);
      return;
    }
    const preferencePath = await writeFeedbackPreference(preference === "on");
    process.stdout.write(`${JSON.stringify({
      status: "updated",
      prompt_enabled: preference === "on",
      local_only: preference === "on",
      preference_path: preferencePath,
    })}\n`);
    return;
  }

  const inputPath = argumentValue("--input");
  if (!inputPath) {
    throw new Error("Usage: report-feedback.mjs --input <feedback.json> | --flush | --should-ask --outcome <outcome> | --preference on|off|status");
  }
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  if (process.argv.includes("--dry-run")) {
    process.stdout.write(`${JSON.stringify({ status: "dry_run", envelope: normalizeFeedback(input) })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await submitFeedback(input))}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
