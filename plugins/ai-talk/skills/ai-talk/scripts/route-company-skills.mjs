#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  addedContextFor,
  buildExecutionPrompt,
  buildResult,
  normalizeTaskHandoff,
  skipEnhancementFor,
} from "./route-company-skills/build-execution-prompt.mjs";
import {
  buildRetrievalRequest,
  classifyRequest,
} from "./route-company-skills/classify-request.mjs";
import {
  buildSearchSuggestions,
  collectContext,
} from "./route-company-skills/collect-context.mjs";
import { discoverSkills } from "./route-company-skills/discover-skills.mjs";
import { HELP, parseArgs } from "./route-company-skills/parse-args.mjs";
import { expectedSkillFor, rankSkills } from "./route-company-skills/rank-skills.mjs";
import {
  EXECUTION_REQUESTS,
  MAX_CONTEXT_FILES_READ,
  MAX_FILE_BYTES,
  MAX_INDEXED_FILES,
  MAX_RETRIEVAL_ENTRIES,
  MAX_SEARCH_EXPANSIONS,
  MAX_SIMILAR_IMPLEMENTATIONS,
  TARGET_PROCESSING_MS,
} from "./route-company-skills/rules.mjs";

const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const PLUGIN_SKILLS_ROOT = path.join(PLUGIN_ROOT, "skills");
const COMPARISON_ROOT = path.join(PLUGIN_ROOT, "docs", "skills");
const AUTHORIZATION_BLOCKER =
  "方案完成后需要一次执行确认。";

function blockerDescription(blocker) {
  return typeof blocker === "string" ? blocker : blocker?.description || blocker?.name || "";
}

function authorizationBlocker() {
  return {
    kind: "authorization",
    description: AUTHORIZATION_BLOCKER,
    status: "unknown",
    resolution: "user_action_required",
    blocking: true,
  };
}

function normalizeExecutionRequest(value) {
  return String(value || "")
    .replace(/^\s*\$ai-talk(?::ai-talk)?\s*/i, "")
    .trim()
    .replace(/[。！!]+$/g, "")
    .trim();
}

export function executionGateFor(currentInput, previousContract) {
  const request = normalizeExecutionRequest(currentInput);
  const previousSkill = previousContract?.execution_plan
    ? previousContract.execution_plan.route?.skill || null
    : previousContract?.recommended_skill || null;
  const requestedSkill =
    request.match(/^调用 ([a-z0-9-]+) 执行$/i)?.[1] || null;
  const authorized = Boolean(
    previousSkill &&
    EXECUTION_REQUESTS.has(request) &&
    (!requestedSkill || requestedSkill === previousSkill),
  );
  const skill = authorized ? previousSkill : null;
  return { authorized, skill };
}

function executionPlanFrom(previousContract) {
  if (previousContract?.execution_plan)
    return normalizeTaskHandoff(previousContract.execution_plan);
  const stage = previousContract?.stage || null;
  return normalizeTaskHandoff({
    schema_version: "1.1",
    route: {
      skill: previousContract?.recommended_skill || null,
      authorization: previousContract?.execution_mode === "modify_and_verify" ? "authorized" : "inspect_only",
    },
    workspace: {
      project_root: null,
      workdir: null,
    },
    workflow: {
      execution_mode: previousContract?.execution_mode || "inspect_only",
      next_skill: null,
      stage: {
        value: stage,
        source: stage ? "legacy_contract" : "unavailable",
        status: stage ? "available" : "unavailable",
      },
    },
    task: {
      source_request: previousContract?.original_request || "",
      deliverable: previousContract?.task_goal || null,
      reasoning: previousContract?.engineering_judgment || null,
    },
    knowledge_requirements: [...(previousContract?.required_knowledge || [])],
    retrieval: [...(previousContract?.retrieval_entries || [])],
    target_scope: [],
    source_facts: [...(previousContract?.evidence || [])],
    constraints: [...(previousContract?.boundaries || [])],
    blockers: [...(previousContract?.unknowns || [])],
    verification: [],
  });
}

export function executionHandoffFor(currentInput, previousContract) {
  const gate = executionGateFor(currentInput, previousContract);
  const executionPlan = executionPlanFrom(previousContract);
  const continuationRequested = EXECUTION_REQUESTS.has(normalizeExecutionRequest(currentInput));
  const diagnosticContinuation = continuationRequested
    && executionPlan.workflow.execution_mode === "inspect_only"
    && executionPlan.workflow.stage?.value === "定位问题";
  const authorized = executionPlan.route.authorization === "authorized" || gate.authorized;
  executionPlan.route.authorization = authorized ? "authorized" : "inspect_only";
  if (authorized) {
    if (executionPlan.workflow.next_skill) executionPlan.route.skill = executionPlan.workflow.next_skill;
    executionPlan.workflow.execution_mode = "modify_and_verify";
    executionPlan.workflow.next_skill = null;
    executionPlan.workflow.stage = { value: "修改代码", source: "derived", status: "available" };
    executionPlan.blockers = executionPlan.blockers.filter(
      (blocker) => blockerDescription(blocker) !== AUTHORIZATION_BLOCKER,
    );
  } else if (!diagnosticContinuation
    && executionPlan.workflow.execution_mode === "plan_then_execute"
    && !executionPlan.blockers.some((blocker) => blockerDescription(blocker) === AUTHORIZATION_BLOCKER)) {
    executionPlan.blockers = [
      ...executionPlan.blockers,
      authorizationBlocker(),
    ];
  }
  return {
    authorized,
    continued: diagnosticContinuation,
    skill: authorized ? executionPlan.route.skill : null,
    execution_mode: executionPlan.workflow.execution_mode,
    added_context: addedContextFor(executionPlan),
    skipEnhancement: skipEnhancementFor(executionPlan),
    execution_plan: executionPlan,
    execution_prompt: buildExecutionPrompt(executionPlan),
  };
}

export async function routeCompanySkills(args) {
  const startedAt = performance.now();
  if (args.previousContract)
    return executionHandoffFor(args.query, args.previousContract);
  const understanding = classifyRequest(
    args.query,
    args.evidenceTypes || [],
    args.evidenceEntries || [],
  );
  const discovery = await discoverSkills({
    root: args.root,
    pluginSkillsRoot: PLUGIN_SKILLS_ROOT,
    comparisonRoot: COMPARISON_ROOT,
    sourceRoots: args.sourceRoots || [],
    excludeRoots: args.excludeRoots || [],
    preferredSkill: understanding.multiImageUi ? expectedSkillFor(understanding) : null,
  });
  const ranking = rankSkills(discovery.skills, understanding, args.limit || 3);
  const retrievalRequest = buildRetrievalRequest(understanding);
  const context = await collectContext(discovery.root, retrievalRequest);
  const searchSuggestions = await buildSearchSuggestions(
    discovery.root,
    retrievalRequest,
    discovery.skills,
    context,
  );
  const debug = args.debugJson
    ? {
        candidates: ranking.debug,
        skill_index: {
          roots: discovery.roots,
          files: discovery.discovered.length,
          unique_names: discovery.skills.length,
          duplicate_name_conflicts: discovery.conflicts,
          index_files_read: discovery.index_files_read,
          body_files_read: discovery.body_files_read,
        },
        context: {
          items: context.items,
          unresolved: context.unresolved,
          files_read: context.files_read,
          similar_implementations_read: context.similar_implementations_read,
          indexed_files: context.indexed_files,
          skill_body_files_read: discovery.body_files_read,
          search_expansions: context.search_expansions,
          stop_reason: context.stop_reason,
          limits: {
            max_file_bytes: MAX_FILE_BYTES,
            max_context_files_read: MAX_CONTEXT_FILES_READ,
            max_similar_implementations: MAX_SIMILAR_IMPLEMENTATIONS,
            max_indexed_files: MAX_INDEXED_FILES,
            max_retrieval_entries: MAX_RETRIEVAL_ENTRIES,
            max_search_expansions: MAX_SEARCH_EXPANSIONS,
            target_processing_ms: TARGET_PROCESSING_MS,
          },
          search_suggestions: searchSuggestions,
        },
        flags: understanding.flags,
        performance: {
          case_type: understanding.multiImageUi
            ? "multi_image"
            : understanding.evidence.length || understanding.typedEvidence.length ? "standard" : "simple",
          total_processing_ms: 0,
          files_read: context.files_read.length,
          skill_body_files_read: discovery.body_files_read,
          search_expansions: context.search_expansions,
          early_stop_reason: context.stop_reason,
        },
      }
    : null;
  const result = buildResult(
    understanding,
    ranking,
    context,
    searchSuggestions,
    debug,
    discovery.root,
  );
  if (result._debug) result._debug.performance.total_processing_ms = performance.now() - startedAt;
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      process.stdout.write(`${HELP}\n`);
      return;
    }
    if (args.previousContractPath) {
      const source = await readFile(
        path.resolve(args.previousContractPath),
        "utf8",
      );
      args.previousContract = JSON.parse(source);
    }
    const result = await routeCompanySkills(args);
    const output =
      args.format === "json"
        ? JSON.stringify(result, null, 2)
        : result.execution_prompt;
    process.stdout.write(`${output}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
