#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { buildResult } from "./route-company-skills/build-execution-prompt.mjs";
import { classifyRequest } from "./route-company-skills/classify-request.mjs";
import { buildSearchSuggestions, collectContext } from "./route-company-skills/collect-context.mjs";
import { discoverSkills } from "./route-company-skills/discover-skills.mjs";
import { HELP, parseArgs } from "./route-company-skills/parse-args.mjs";
import { rankSkills } from "./route-company-skills/rank-skills.mjs";
import { EXECUTION_REQUESTS } from "./route-company-skills/rules.mjs";

const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const PLUGIN_SKILLS_ROOT = path.join(PLUGIN_ROOT, "skills");
const COMPARISON_ROOT = path.join(PLUGIN_ROOT, "docs", "skills");

function normalizeExecutionRequest(value) {
  return String(value || "")
    .replace(/^\s*\$ai-talk(?::ai-talk)?\s*/i, "")
    .trim()
    .replace(/[。！!]+$/g, "")
    .trim();
}

export function executionGateFor(currentInput, previousContract) {
  const request = normalizeExecutionRequest(currentInput);
  const previousSkill = previousContract?.recommended_skill || null;
  const authorized = Boolean(previousSkill && EXECUTION_REQUESTS.has(request));
  const skill = authorized && request === "调用 gen-code 执行" ? "gen-code" : authorized ? previousSkill : null;
  return { authorized, skill };
}

export async function routeCompanySkills(args) {
  const classification = classifyRequest(args.query, args.evidenceTypes || []);
  const discovery = await discoverSkills({
    root: args.root,
    pluginSkillsRoot: PLUGIN_SKILLS_ROOT,
    comparisonRoot: COMPARISON_ROOT,
    sourceRoots: args.sourceRoots || [],
    excludeRoots: args.excludeRoots || [],
  });
  const ranking = rankSkills(discovery.skills, classification, args.limit || 3);
  const context = await collectContext(discovery.root, classification);
  const searchSuggestions = buildSearchSuggestions(classification);
  const debug = args.debugJson ? {
    candidates: ranking.debug,
    skill_index: {
      roots: discovery.roots,
      files: discovery.discovered.length,
      unique_names: discovery.skills.length,
      duplicate_name_conflicts: discovery.conflicts,
    },
    context: { ...context, search_suggestions: searchSuggestions },
    flags: classification.flags,
  } : null;
  return buildResult(classification, ranking, context, searchSuggestions, debug);
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      process.stdout.write(`${HELP}\n`);
      return;
    }
    const result = await routeCompanySkills(args);
    const output = args.format === "json" ? JSON.stringify(result, null, 2) : result.execution_prompt;
    process.stdout.write(`${output}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
