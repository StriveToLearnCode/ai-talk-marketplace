import path from "node:path";

import { EVIDENCE_LABELS, EVIDENCE_TYPE_ALIASES, KEYWORDS } from "./rules.mjs";

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function unique(items, key = (item) => item) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function suppliedEvidence(values) {
  return values.map((raw, index) => {
    const match = String(raw).match(/^([^:=]+)[:=](.+)$/);
    const alias = (match?.[1] || raw).trim().toLowerCase();
    const type = EVIDENCE_TYPE_ALIASES[alias] || alias;
    return {
      type,
      value: (match?.[2] || EVIDENCE_LABELS[type] || alias).trim(),
      source: `argument:${index + 1}`,
    };
  });
}

function extractPaths(query) {
  const extension = "vue|tsx?|jsx?|mjs|cjs|json|css|scss|less|md|py|go|java|kt|swift";
  const pattern = new RegExp(`(?:^|[\\s\\x60'\"（(])((?:\\.{0,2}/)?(?:[\\w@.-]+/)*[\\w@.-]+\\.(?:${extension}))(?=$|[\\s\\x60'\"，。；;）)])`, "giu");
  return [...query.matchAll(pattern)].map((match) => match[1]).filter((value) => !value.startsWith("http"));
}

function extractApiNames(query) {
  const names = [];
  for (const match of query.matchAll(/\b(?:GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s，。；;]+)/gi)) names.push(match[1]);
  for (const match of query.matchAll(/\b(?:get|post|fetch|update|create|delete)[A-Z][A-Za-z0-9_$]*/g)) names.push(match[0]);
  for (const match of query.matchAll(/([\w.$/-]{2,50})\s*(?:接口|API)\b/giu)) names.push(match[1]);
  return unique(names);
}

function extractComponents(query) {
  const names = [...query.matchAll(/\b[A-Z][A-Za-z0-9_$]*(?:Dialog|Modal|Popup|Page|View|Panel|Card|List|Button|Component)\b/g)]
    .map((match) => match[0]);
  for (const match of query.matchAll(/([\p{Script=Han}A-Za-z0-9_-]{2,24})(?:弹窗|组件)/gu)) names.push(`${match[1]}${match[0].endsWith("弹窗") ? "弹窗" : "组件"}`);
  return unique(names);
}

function extractStates(query) {
  const values = [];
  for (const match of query.matchAll(/\b(?:state|status)\s*[:=：]\s*([A-Za-z0-9_.-]+)/gi)) values.push(`${match[0].split(/[:=：]/)[0].trim()}=${match[1]}`);
  for (const match of query.matchAll(/\b(claimed|unclaimed|completed|incomplete|locked|disabled|loading|success|failed)\b/gi)) values.push(match[1]);
  return unique(values.map((value) => value.toLowerCase()));
}

function inferEvidence(query, provided) {
  const text = query.toLowerCase();
  const evidence = [...provided];
  const add = (type, value) => evidence.push({ type, value, source: "user_request" });
  if (includesAny(text, KEYWORDS.screenshotEvidence)) add("screenshot", "用户在原话中明确引用的截图");
  if (text.includes("figma")) add("figma", "用户在原话中明确提供或引用的 Figma");
  if (includesAny(text, KEYWORDS.designEvidence)) add("design", "用户在原话中明确提供或引用的设计稿");
  if (includesAny(text, KEYWORDS.apiEvidence)) add("api", "用户在原话中明确提供或引用的接口资料");
  for (const value of extractPaths(query)) add("target_file", value);
  for (const value of extractApiNames(query)) add("api_name", value);
  for (const value of extractComponents(query)) add("component", value);
  for (const value of extractStates(query)) add("state", value);
  return unique(evidence, (item) => `${item.type}:${item.value}`);
}

function classifyIntent(query) {
  const text = query.toLowerCase();
  const flags = {
    analysisOnly: includesAny(text, KEYWORDS.analysisOnly),
    automatedTest: includesAny(text, KEYWORDS.automatedTest),
    plan: includesAny(text, KEYWORDS.plan),
    noCode: includesAny(text, KEYWORDS.noCode),
    code: includesAny(text, KEYWORDS.code),
    bug: includesAny(text, KEYWORDS.bug),
    inspect: includesAny(text, KEYWORDS.inspect),
    figma: includesAny(text, KEYWORDS.figma),
    analyze: includesAny(text, KEYWORDS.analyze),
    document: includesAny(text, KEYWORDS.document),
  };

  if (flags.automatedTest) return { action: "test", target: "test", desired_output: "automated_test", flags };
  if (flags.plan && (flags.noCode || !flags.code)) return { action: "plan", target: "frontend", desired_output: "implementation_plan", flags };
  if (!flags.analysisOnly && (flags.code || flags.bug)) return { action: "modify", target: "code", desired_output: "code_changes", flags };
  if (flags.figma && flags.analyze && (flags.document || !flags.inspect)) {
    return { action: "analyze", target: "figma", desired_output: "figma_analysis_document", flags };
  }
  if (flags.inspect || flags.analysisOnly) return { action: "inspect", target: "page_or_problem", desired_output: "live_page_findings", flags };
  if (flags.figma) return { action: "analyze", target: "figma", desired_output: "figma_analysis_document", flags };
  return { action: "clarify", target: "unknown", desired_output: "unknown", flags };
}

function targetPageFor(query) {
  const match = query.match(/([\p{Script=Han}A-Za-z0-9_-]{2,40})\s*(?:页面|页)(?=$|[\s，。；;])/u)
    || query.match(/([A-Za-z0-9_-]{2,40})\s*tab\b/i);
  const value = match?.[1]?.replace(/^(?:(?:请|帮我|修复|修改|开发|实现|检查|打开|看看|分析|根据|这个|目标|当前|已有))+/, "") || null;
  return ["打开", "看看", "检查", "这个", "目标", "当前", "已有"].includes(value) ? null : value;
}

export function classifyRequest(query, evidenceTypes = []) {
  const original = String(query || "").replace(/^\s*\$ai-talk(?::ai-talk)?\s*/i, "").trim();
  const intent = classifyIntent(original);
  const evidence = inferEvidence(original, suppliedEvidence(evidenceTypes));
  const page = targetPageFor(original);
  if (page) evidence.push({ type: "target_page", value: page, source: "user_request" });

  return {
    originalRequest: original,
    intent: { action: intent.action, target: intent.target, desired_output: intent.desired_output },
    evidence: unique(evidence, (item) => `${item.type}:${item.value}`),
    flags: intent.flags,
  };
}

export function explicitTargetFiles(classification) {
  return classification.evidence
    .filter((item) => item.type === "target_file")
    .map((item) => item.value.replace(/^\.\//, "").split(path.sep).join("/"));
}
