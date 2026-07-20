import { open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { explicitTargetFiles } from "./classify-request.mjs";
import {
  EARLY_STOP_RETRIEVAL_ENTRIES,
  MAX_CONTEXT_FILES_READ,
  MAX_FILE_BYTES,
  MAX_INDEXED_FILES,
  MAX_RETRIEVAL_ENTRIES,
  MAX_SIMILAR_IMPLEMENTATIONS,
} from "./rules.mjs";

const SEARCH_EXTENSIONS = new Set([".vue", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md"]);
const IMPORT_EXTENSIONS = ["", ".vue", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const SEARCH_EXCLUDED = new Set([
  ".git", ".agents", ".codex", "node_modules", "dist", "build", "coverage", "docs", "documentation", "__pycache__",
]);

function within(candidate, root) {
  const relativePath = path.relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function hasForbiddenSegment(candidate, root) {
  return path.relative(root, candidate).split(path.sep).includes("node_modules");
}

async function readBounded(file) {
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_FILE_BYTES) return null;
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(info.size);
    await handle.read(buffer, 0, buffer.length, 0);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

async function safeFile(root, value) {
  const candidate = path.resolve(root, value);
  if (!within(candidate, root) || hasForbiddenSegment(candidate, root)) return null;
  try {
    const resolved = await realpath(candidate);
    if (!within(resolved, root) || hasForbiddenSegment(resolved, root)) return null;
    return (await stat(resolved)).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

async function nearestAgentsFile(root, target) {
  let directory = path.dirname(target);
  while (within(directory, root)) {
    const candidate = await safeFile(root, path.relative(root, path.join(directory, "AGENTS.md")));
    if (candidate) return candidate;
    if (directory === root) break;
    directory = path.dirname(directory);
  }
  return null;
}

function relative(root, candidate) {
  return path.relative(root, candidate).split(path.sep).join("/");
}

function localImports(content) {
  const values = [];
  const patterns = [
    /(?:import|export)\s+(?:[^'\"]+?\s+from\s+)?["'](\.[^"']+)["']/g,
    /(?:require|import)\(\s*["'](\.[^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (!values.includes(match[1])) values.push(match[1]);
    }
  }
  return values;
}

async function resolveLocalImport(root, importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);
  for (const extension of IMPORT_EXTENSIONS) {
    const direct = await safeFile(root, path.relative(root, `${base}${extension}`));
    if (direct) return direct;
    const index = await safeFile(root, path.relative(root, path.join(base, `index${extension}`)));
    if (index) return index;
  }
  return null;
}

function recordFor(root, file, content, relation) {
  return {
    path: relative(root, file),
    basename: path.basename(file),
    content,
    relation,
  };
}

export async function collectContext(rootInput, classification) {
  const root = await realpath(path.resolve(rootInput));
  const items = [];
  const unresolved = [];
  const readFiles = new Set();
  const records = [];
  let stopReason = null;
  const add = (type, file, source) => {
    const value = relative(root, file);
    if (!items.some((item) => item.type === type && item.value === value)) items.push({ type, value, source });
  };

  const explicitTargets = explicitTargetFiles(classification);
  const selectedTargets = classification.multiImageUi ? explicitTargets.slice(0, 1) : explicitTargets;
  for (const value of selectedTargets) {
    if (readFiles.size >= MAX_CONTEXT_FILES_READ) {
      unresolved.push(`上下文读取已达到 ${MAX_CONTEXT_FILES_READ} 个文件上限，未读取：${value}`);
      stopReason = "context_file_limit";
      continue;
    }
    const target = await safeFile(root, value);
    if (!target) {
      unresolved.push(`目标文件无法在项目根目录内读取：${value}`);
      continue;
    }
    const content = await readBounded(target);
    if (content === null) {
      unresolved.push(`目标文件超过 ${MAX_FILE_BYTES / 1024} KiB 或不是普通文件：${value}`);
      continue;
    }
    readFiles.add(target);
    records.push(recordFor(root, target, content, "user_specified"));
    add("target_file", target, "user_request");

    const agents = await nearestAgentsFile(root, target);
    if (agents) {
      if (readFiles.has(agents)) {
        add("project_rule", agents, `nearest:${relative(root, target)}`);
      } else if (readFiles.size < MAX_CONTEXT_FILES_READ && await readBounded(agents) !== null) {
        readFiles.add(agents);
        add("project_rule", agents, `nearest:${relative(root, target)}`);
      } else if (readFiles.size >= MAX_CONTEXT_FILES_READ) {
        stopReason = "context_file_limit";
        unresolved.push(`上下文读取已达到 ${MAX_CONTEXT_FILES_READ} 个文件上限，未读取：${relative(root, agents)}`);
      }
    }
  }

  return {
    items,
    unresolved,
    files_read: [...readFiles].map((file) => relative(root, file)),
    similar_implementations_read: [],
    indexed_files: 0,
    search_expansions: 0,
    stop_reason: stopReason,
    _records: records,
    _read_files: readFiles,
  };
}

async function searchableFiles(root, relativePath = "", result = []) {
  if (result.length >= MAX_INDEXED_FILES) return result;
  let entries;
  try {
    entries = await readdir(path.join(root, relativePath), { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (result.length >= MAX_INDEXED_FILES || entry.isSymbolicLink() || SEARCH_EXCLUDED.has(entry.name)
      || (entry.isDirectory() && entry.name.startsWith("."))) continue;
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) await searchableFiles(root, child, result);
    else if (entry.isFile() && SEARCH_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) result.push(child);
  }
  return result;
}

function screeningTerms(classification) {
  const knowledge = classification.requiredKnowledge.join(" ");
  const terms = [];
  const add = (...values) => terms.push(...values);
  if (/弹窗/u.test(knowledge)) add("dialog", "modal", "popup", "page", "index");
  if (/(?:积分|进度|阶段)/u.test(knowledge)) add("level", "point", "score", "progress", "stage");
  if (/(?:奖励|奖品)/u.test(knowledge)) add("reward", "prize", "lottery", "banner");
  if (/(?:状态|图片)/u.test(knowledge)) add("state", "status", "reward", "item", "node");
  if (/(?:动态组件|组件名称|注册规则)/u.test(knowledge)) add("dynamic", "component", "loader", "registry");
  if (/(?:h5|跳转)/iu.test(knowledge)) add("h5", "banner", "activity");
  if (/rtl/iu.test(knowledge)) add("rtl", "banner", "activity");
  if (classification.evidence.some((item) => item.type === "target_file")) add("page", "index");
  return [...new Set(terms)];
}

function screenScore(value, classification, terms, targetRecords) {
  const normalized = value.toLowerCase();
  const basename = path.basename(normalized);
  const stem = path.basename(basename, path.extname(basename));
  let score = terms.reduce((total, term) => total + (basename.includes(term) ? 30 : 0), 0);
  if (classification.originalRequest.toLowerCase().includes(stem)) score += 180;
  if (targetRecords.some((record) => record.content.includes(basename) || record.content.includes(stem))) score += 220;
  if (/^(?:page|index)\.(?:vue|tsx?|jsx?)$/i.test(basename)) score += 15;
  if (/self[-_]select[-_](?:dialog|modal|popup)/i.test(basename)) score += 20;
  if (classification.taskType === "reward_metadata_missing" && /(?:^|\/)api(?:\/|$)/i.test(normalized)) score += 40;
  if (classification.taskType === "reward_metadata_missing" && /(?:^|\/)(?:store|stores)(?:\/|$)/i.test(normalized)) score += 35;
  if (classification.taskType !== "dialog_change" && classification.taskType !== "dialog_auto_open"
    && /(?:dialog|modal|popup)/i.test(basename)) score -= 100;
  if (["dialog_change", "dialog_auto_open"].includes(classification.taskType)
    && !/(?:奖励|reward|奖品|lottery)/iu.test(classification.originalRequest)
    && /(?:reward|prize|lottery)/i.test(basename)) score -= 80;
  return score;
}

async function similarRecords(root, classification, context) {
  if (context.stop_reason === "context_file_limit") return [];
  const reliableTarget = Math.min(
    classification.multiImageUi ? 2 : EARLY_STOP_RETRIEVAL_ENTRIES,
    classification.requiredKnowledge.length,
  );
  const resourceEntries = classification.typedEvidence.some((item) =>
    ["resource_reference", "resource_reuse_candidate"].includes(item.kind)
    && item.status === "fact");
  const reliableCount = (records) => selectCandidates(
    classification.requiredKnowledge,
    codeCandidates(classification, records),
  ).length + (resourceEntries ? 1 : 0);

  if (classification.evidence.some((item) => item.type === "target_file")) {
    context.indexed_files = 0;
    if (reliableTarget > 0 && reliableCount(context._records) >= reliableTarget) {
      context.stop_reason = "fast_path_retrieval_resolved";
      return [];
    }

    const target = context._records.find((record) => record.relation === "user_specified");
    const targetFile = target && await safeFile(root, target.path);
    const references = [];
    if (target && targetFile) {
      for (const specifier of localImports(target.content)) {
        const file = await resolveLocalImport(root, targetFile, specifier);
        if (!file || context._read_files.has(file)) continue;
        references.push({
          file,
          score: screenScore(relative(root, file), classification, screeningTerms(classification), [target]),
        });
      }
    }
    references.sort((a, b) => b.score - a.score || relative(root, a.file).localeCompare(relative(root, b.file)));
    for (const reference of references.slice(0, MAX_SIMILAR_IMPLEMENTATIONS)) {
      const content = await readBounded(reference.file);
      if (content === null) continue;
      const record = recordFor(root, reference.file, content, "target_reference");
      context._read_files.add(reference.file);
      context.similar_implementations_read.push(record.path);
      context.files_read = [...context._read_files].map((file) => relative(root, file));
      context.stop_reason = reliableTarget > 0
        && reliableCount([...context._records, record]) >= reliableTarget
        ? "fast_path_retrieval_resolved"
        : "target_reference_limit";
      return [record];
    }
    context.stop_reason = "explicit_target_only";
    return [];
  }

  if (classification.multiImageUi) {
    context.indexed_files = 0;
    context.stop_reason = resourceEntries
      ? "multi_image_evidence_resolved"
      : "multi_image_no_target_file";
    return [];
  }
  const hasRetrievableEvidence = classification.typedEvidence.length > 0
    || classification.evidence.some((item) => ["api_name", "state", "component"].includes(item.type));
  if (classification.taskType === "generic" && !hasRetrievableEvidence) {
    context.indexed_files = 0;
    context.stop_reason = "no_evidence_backed_retrieval";
    return [];
  }
  const initialReliableEntries = selectCandidates(
    classification.requiredKnowledge,
    codeCandidates(classification, context._records),
  ).length;
  if (reliableTarget > 0 && initialReliableEntries >= reliableTarget) {
    context.indexed_files = 0;
    context.stop_reason = initialReliableEntries >= classification.requiredKnowledge.length
      ? "all_knowledge_resolved"
      : "reliable_entry_threshold";
    return [];
  }
  context.search_expansions += 1;
  const indexed = await searchableFiles(root);
  context.indexed_files = indexed.length;
  const existing = new Set(context._records.map((record) => record.path));
  const terms = screeningTerms(classification);
  const pending = indexed
    .filter((value) => !existing.has(value) && path.basename(value).toLowerCase() !== "agents.md")
    .map((value) => ({ value, score: screenScore(value, classification, terms, context._records) }));
  const records = [];
  const totalScore = (item) => {
    const basename = path.basename(item.value);
    const stem = path.basename(basename, path.extname(basename));
    const referenced = records.some((record) => record.content.includes(basename) || record.content.includes(stem)) ? 220 : 0;
    return item.score + referenced;
  };
  while (records.length < MAX_SIMILAR_IMPLEMENTATIONS
    && context._read_files.size < MAX_CONTEXT_FILES_READ
    && pending.length) {
    pending.sort((a, b) => totalScore(b) - totalScore(a) || a.value.localeCompare(b.value));
    if (totalScore(pending[0]) <= 0) break;
    const item = pending.shift();
    const file = await safeFile(root, item.value);
    if (!file) continue;
    const content = await readBounded(file);
    if (content === null) continue;
    const record = recordFor(root, file, content, "ui_structure");
    records.push(record);
    context._read_files.add(file);
    context.similar_implementations_read.push(record.path);
    const reliableEntries = selectCandidates(
      classification.requiredKnowledge,
      codeCandidates(classification, [...context._records, ...records]),
    ).length;
    if (reliableTarget > 0 && reliableEntries >= reliableTarget) {
      context.stop_reason = reliableEntries >= classification.requiredKnowledge.length
        ? "all_knowledge_resolved"
        : "reliable_entry_threshold";
      break;
    }
  }
  if (!context.stop_reason && context._read_files.size >= MAX_CONTEXT_FILES_READ) {
    context.stop_reason = "context_file_limit";
  }
  if (!context.stop_reason) context.stop_reason = "similar_implementation_limit";
  context.files_read = [...context._read_files].map((file) => relative(root, file));
  return records;
}

function symbols(record, patterns) {
  const found = [];
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    for (const match of record.content.matchAll(new RegExp(pattern.source, flags))) {
      const value = match[1] || match[0];
      if (value && !found.includes(value)) found.push(value);
    }
  }
  return found;
}

function candidate(knowledge, entry, purpose, priority, score, record, evidence = record?.relation || "user_specified") {
  return {
    knowledge,
    entry,
    purpose,
    priority,
    score,
    source: record?.path || "user_request",
    evidence,
  };
}

function codeCandidates(classification, records) {
  const result = [];
  const dynamicSource = records
    .filter((record) => /componentRegistry|componentMap|dynamicComponentName|resolveComponent/.test(record.content))
    .map((record) => record.content)
    .join("\n");
  const addFiles = (knowledge, purpose, matcher, scoreFor, priority = 1) => {
    for (const record of records.filter(matcher)) {
      result.push(candidate(knowledge, record.basename, purpose, priority, scoreFor(record), record));
    }
  };
  const addSymbols = (knowledge, purpose, patterns, scoreFor, filter = () => true, priority = 1) => {
    for (const record of records.filter(filter)) {
      for (const symbol of symbols(record, patterns)) {
        result.push(candidate(knowledge, symbol, purpose, priority, scoreFor(symbol, record), record));
      }
    }
  };

  addFiles("弹窗模板结构", "复用弹窗结构",
    (record) => /\.vue$/i.test(record.basename) && /<(?:Base)?(?:Dialog|Modal|Popup)\b|role=["']dialog/i.test(record.content),
    (record) => /self[-_]select/i.test(record.basename) ? 140 : 100);
  addSymbols("弹窗打开与关闭方式", "复用弹窗状态和打开方式",
    [/\b(useDialog)\b/, /\b(use[A-Z]\w*(?:Dialog|Modal|Popup))\b/, /\b(open[A-Z]\w*(?:Dialog|Modal|Popup))\b/],
    (symbol) => symbol === "useDialog" ? 140 : /^use/.test(symbol) ? 110 : 90, () => true, 2);
  addSymbols("页面首次进入生命周期", "复用首次进入的触发时机",
    [/\b(onAfterInit)\b/, /\b(onMounted)\b/, /\b(onLoad)\b/, /\b(onReady)\b/],
    (symbol) => symbol === "onAfterInit" ? 140 : 90, () => true, 3);
  addFiles("页面弹窗挂载方式", "复用页面内弹窗挂载方式",
    (record) => /\.vue$/i.test(record.basename) && /<(?:\w+)?(?:Dialog|Modal|Popup)\b/i.test(record.content),
    () => 120, 3);
  addFiles("目标页面弹窗挂载方式", "复用目标页面的弹窗挂载方式",
    (record) => /\.vue$/i.test(record.basename) && /<(?:\w+)?(?:Dialog|Modal|Popup)\b/i.test(record.content),
    () => 120, 3);

  addSymbols("奖励名称和角标的接口字段", "定位奖励名称和角标字段",
    [/\b(do_lottery)\b/, /\b(doLottery)\b/, /\b((?:fetch|get|post|request)\w*(?:Lottery|Reward)\w*)\b/i],
    (symbol) => symbol === "do_lottery" ? 150 : 100);
  addSymbols("抽奖结果到弹窗数据的适配", "复用抽奖结果的数据适配",
    [/\b(openRewardDialog)\b/, /\b((?:map|adapt|normalize|format)\w*Reward\w*)\b/i],
    (symbol) => symbol === "openRewardDialog" ? 150 : 100);
  addFiles("奖励弹窗的字段渲染", "定位奖励名称和角标的渲染位置",
    (record) => /\.vue$/i.test(record.basename)
      && /reward/i.test(record.content)
      && /(?:name|title)/i.test(record.content)
      && /(?:badge|tag|角标)/i.test(record.content),
    () => 130);

  addSymbols("动态组件名称生成", "复用动态组件名称生成方式",
    [/\b(dynamicComponentName)\b/, /\b(getDynamicComponentName)\b/, /\b(getComponentName)\b/, /\b((?:build|create|resolve)\w*ComponentName)\b/i],
    (symbol) => /dynamicComponentName|getDynamicComponentName/.test(symbol) ? 140 : 100);
  addSymbols("动态组件注册规则", "复用动态组件注册规则",
    [/\b(componentRegistry)\b/, /\b(componentMap)\b/, /\b(resolveComponent)\b/, /\b(defineAsyncComponent)\b/, /\b(registerComponent)\b/],
    (symbol) => /Registry|Map/.test(symbol) ? 130 : 100);
  addFiles("实际组件名称", "核对动态名称对应的真实组件",
    (record) => {
      const stem = path.basename(record.basename, path.extname(record.basename));
      return record.basename.endsWith(".vue")
        && (classification.originalRequest.toLowerCase().includes(stem.toLowerCase()) || dynamicSource.includes(stem));
    },
    () => 150);

  const stateEvidence = classification.evidence.filter((item) => item.type === "state").map((item) => item.value);
  for (const value of stateEvidence) result.push(candidate("奖励领取状态判断", value, "追踪领取状态的真实来源", 1, 150, null));
  for (const value of stateEvidence) result.push(candidate("状态来源", value, "从状态标识追踪数据来源", 1, 150, null));
  addSymbols("奖励领取状态判断", "复用奖励领取态判断",
    [/\b(isClaimed)\b/i, /\b(hasClaimed)\b/i, /\b(claimed)\b/i, /\b(rewardStatus)\b/i],
    (symbol) => /^isClaimed$/i.test(symbol) ? 140 : 90);
  for (const item of classification.evidence.filter((entry) => entry.type === "resource")) {
    result.push(candidate("icon/mask 资源引用", item.value, "复用用户指定的领取态资源", 1, 160, null));
  }
  addFiles("奖励节点渲染", "复用奖励节点的领取态挂载位置",
    (record) => /\.vue$/i.test(record.basename)
      && /(?:claimed|rewardStatus|isClaimed)/i.test(record.content)
      && /(?:img|image|icon|mask)/i.test(record.content),
    () => 130);
  addSymbols("状态转换", "复用接口状态到视图状态的转换",
    [/\b((?:map|adapt|normalize|format)\w*(?:State|Status)\w*)\b/i, /\b(rewardStatus)\b/i, /\b(isClaimed)\b/i],
    (symbol) => /^(?:rewardStatus|isClaimed)$/i.test(symbol) ? 130 : 100);
  addFiles("图片渲染分支", "定位状态对应的图片渲染条件",
    (record) => /\.vue$/i.test(record.basename)
      && /(?:claimed|rewardStatus|isClaimed)/i.test(record.content)
      && /(?:img|image|icon|mask)/i.test(record.content),
    () => 120);

  addFiles("积分阶段", "复用进度与阶段状态",
    (record) => /\.vue$/i.test(record.basename)
      && /(?:progress|进度)/i.test(record.content)
      && /(?:积分|score|point|stage|阶段|reward)/i.test(record.content),
    () => 140);
  addFiles("奖励展示", "复用展示结构",
    (record) => /\.vue$/i.test(record.basename)
      && /<template\b/i.test(record.content)
      && /(?:reward|prize|奖励|奖品)/i.test(record.content)
      && (!/(?:dialog|modal|popup)/i.test(`${record.basename}\n${record.content}`)
        || ["dialog_change", "dialog_auto_open", "reward_metadata_missing"].includes(classification.taskType)),
    () => 130);
  addSymbols("奖励展示", "复用展示结构",
    [/\b(Reward(?:Item|Node|Card|List|Stage)\w*)\b/],
    () => 140,
    (record) => /<template\b/i.test(record.content)
      && /(?:reward|prize|奖励|奖品)/i.test(record.content)
      && !/(?:dialog|modal|popup)/i.test(`${record.basename}\n${record.content}`));
  addSymbols("奖励状态", "复用奖励状态判断和展示分支",
    [/\b(isClaimed)\b/i, /\b(hasClaimed)\b/i, /\b(rewardStatus)\b/i, /\b(claimed)\b/i],
    (symbol) => /^isClaimed$/i.test(symbol) ? 140 : 100);
  addSymbols("半屏 H5", "复用跳转方式",
    [/\b(openH5)\b/, /\b(openHalfScreen\w*)\b/i, /\b(buildH5Url)\b/i],
    (symbol) => symbol === "openH5" ? 150 : 110);
  addFiles("RTL 布局", "复用布局规则",
    (record) => /(?:dir=["']rtl|direction:\s*rtl)/i.test(record.content),
    () => 130);
  addSymbols("页面交互", "复用页面交互调用",
    [/\b(openH5)\b/, /\b(openRewardDialog)\b/, /\b(handle[A-Z]\w+)\b/],
    (symbol) => /^open/.test(symbol) ? 130 : 90, () => true, 2);

  for (const item of classification.evidence.filter((entry) => entry.type === "target_file")) {
    const record = records.find((entry) => entry.path === item.value.replace(/^\.\//, ""));
    if (record) result.push(candidate("目标文案位置", item.value, "定位目标文案", 1, 180, record, "user_specified"));
  }

  if (classification.taskType === "generic") {
    for (const item of classification.evidence) {
      if (item.type === "target_file") {
        const record = records.find((entry) => entry.path === item.value.replace(/^\.\//, ""));
        if (record) result.push(candidate(`${path.basename(item.value)} 中的目标行为`, item.value, "定位目标行为和修改位置", 1, 180, record, "user_specified"));
      }
      if (item.type === "api_name") {
        const record = records.find((entry) => entry.content.includes(item.value));
        if (record) result.push(candidate(`${item.value} 接口响应`, item.value, "定位接口调用和响应映射", 1, 160, record));
      }
      if (item.type === "state") result.push(candidate(`${item.value} 状态判断`, item.value, "追踪该状态的判断和渲染分支", 1, 150, null));
      if (item.type === "component") {
        const record = records.find((entry) => path.basename(entry.basename, path.extname(entry.basename)).toLowerCase() === item.value.toLowerCase()
          || entry.content.includes(item.value));
        if (record) result.push(candidate(`${item.value} 渲染逻辑`, record.basename, `定位 ${item.value} 的定义和渲染位置`, 1, 160, record));
      }
    }
  }
  for (const item of result) {
    if (item.knowledge === "奖励展示" && item.evidence === "user_specified") {
      item.purpose = "复用现有展示结构";
    }
  }
  return result;
}

function selectCandidates(requiredKnowledge, candidates) {
  const selected = [];
  const seenEntries = new Set();
  const byKnowledge = new Map(requiredKnowledge.map((knowledge) => [knowledge, []]));
  for (const item of candidates) {
    if (!byKnowledge.has(item.knowledge)) continue;
    byKnowledge.get(item.knowledge).push(item);
  }
  for (const items of byKnowledge.values()) {
    items.sort((a, b) => a.priority - b.priority || b.score - a.score || a.entry.localeCompare(b.entry));
  }
  for (const knowledge of requiredKnowledge) {
    const item = byKnowledge.get(knowledge)?.find((entry) => !seenEntries.has(entry.entry));
    if (!item || selected.length >= MAX_RETRIEVAL_ENTRIES) continue;
    selected.push(item);
    seenEntries.add(item.entry);
  }
  return selected;
}

export async function buildSearchSuggestions(root, classification, skills = [], context = null) {
  const activeContext = context || await collectContext(root, classification);
  const records = [...activeContext._records, ...await similarRecords(root, classification, activeContext)];
  const candidates = codeCandidates(classification, records);
  for (const skill of skills) {
    for (const knowledge of classification.requiredKnowledge) {
      if (!skill.description.includes(knowledge)) continue;
      candidates.push(candidate(knowledge, skill.name, `查阅描述“${knowledge}”的 Skill 索引`, 4, 50, { path: skill.path }, "skill_index"));
    }
  }
  return selectCandidates(classification.requiredKnowledge, candidates);
}
