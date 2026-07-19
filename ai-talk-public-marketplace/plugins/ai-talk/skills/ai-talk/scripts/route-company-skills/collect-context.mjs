import { open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { explicitTargetFiles } from "./classify-request.mjs";
import { MAX_DIRECT_DEPENDENCIES, MAX_FILE_BYTES } from "./rules.mjs";

const IMPORT_EXTENSIONS = ["", ".vue", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".less"];
const SEARCH_EXTENSIONS = new Set([".vue", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md"]);
const SEARCH_EXCLUDED = new Set([".git", ".agents", "node_modules", "dist", "build", "coverage", "__pycache__"]);
const MAX_SEARCH_FILES = 600;
const MAX_SEARCH_BYTES = 4 * 1024 * 1024;

function within(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

function localImports(content) {
  const values = [];
  const patterns = [
    /(?:import|export)\s+(?:[^'\"]+?\s+from\s+)?["'](\.[^"']+)["']/g,
    /(?:require|import)\(\s*["'](\.[^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) if (!values.includes(match[1])) values.push(match[1]);
  }
  return values;
}

async function resolveImport(root, importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);
  for (const extension of IMPORT_EXTENSIONS) {
    const direct = await safeFile(root, path.relative(root, `${base}${extension}`));
    if (direct) return direct;
    const index = await safeFile(root, path.relative(root, path.join(base, `index${extension}`)));
    if (index) return index;
  }
  return null;
}

function relative(root, candidate) {
  return path.relative(root, candidate).split(path.sep).join("/");
}

export async function collectContext(rootInput, classification) {
  const root = await realpath(path.resolve(rootInput));
  const items = [];
  const unresolved = [];
  const readFiles = new Set();
  let dependencyCount = 0;
  const add = (type, file, source) => {
    const value = relative(root, file);
    if (!items.some((item) => item.type === type && item.value === value)) items.push({ type, value, source });
  };

  for (const value of explicitTargetFiles(classification)) {
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
    add("target_file", target, "user_request");

    const agents = await nearestAgentsFile(root, target);
    if (agents && await readBounded(agents) !== null) {
      readFiles.add(agents);
      add("project_rule", agents, `nearest:${relative(root, target)}`);
    }

    for (const specifier of localImports(content)) {
      if (dependencyCount >= MAX_DIRECT_DEPENDENCIES) break;
      const dependency = await resolveImport(root, target, specifier);
      if (!dependency || readFiles.has(dependency) || await readBounded(dependency) === null) continue;
      readFiles.add(dependency);
      add("direct_dependency", dependency, `import:${relative(root, target)}`);
      dependencyCount += 1;
    }
  }

  return { items, unresolved, files_read: [...readFiles].map((file) => relative(root, file)) };
}

async function searchableFiles(root, relativePath = "", result = []) {
  if (result.length >= MAX_SEARCH_FILES) return result;
  let entries;
  try {
    entries = await readdir(path.join(root, relativePath), { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (result.length >= MAX_SEARCH_FILES || entry.isSymbolicLink() || SEARCH_EXCLUDED.has(entry.name)
      || (entry.isDirectory() && entry.name.startsWith("."))) continue;
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) await searchableFiles(root, child, result);
    else if (entry.isFile() && SEARCH_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) result.push(child);
  }
  return result;
}

async function searchRecords(root) {
  const records = [];
  let bytes = 0;
  for (const value of await searchableFiles(root)) {
    const file = await safeFile(root, value);
    if (!file) continue;
    const info = await stat(file);
    if (info.size > MAX_FILE_BYTES || bytes + info.size > MAX_SEARCH_BYTES) continue;
    const content = await readBounded(file);
    if (content === null) continue;
    bytes += Buffer.byteLength(content);
    records.push({ path: relative(root, file), basename: path.basename(file), content });
  }
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

function candidate(knowledge, entry, purpose, priority, score, source) {
  return { knowledge, entry, purpose, priority, score, source };
}

function codeCandidates(classification, records) {
  const result = [];
  const dynamicSource = records
    .filter((record) => /componentRegistry|componentMap|dynamicComponentName|resolveComponent/.test(record.content))
    .map((record) => record.content)
    .join("\n");
  const addFiles = (knowledge, purpose, matcher, scoreFor, priority = 1) => {
    for (const record of records.filter(matcher)) {
      result.push(candidate(knowledge, record.basename, purpose, priority, scoreFor(record), record.path));
    }
  };
  const addSymbols = (knowledge, purpose, patterns, scoreFor, filter = () => true, priority = 1) => {
    for (const record of records.filter(filter)) {
      for (const symbol of symbols(record, patterns)) {
        result.push(candidate(knowledge, symbol, purpose, priority, scoreFor(symbol, record), record.path));
      }
    }
  };

  addFiles("弹窗模板结构", "参考标准弹窗结构",
    (record) => /(?:dialog|modal|popup).*\.vue$/i.test(record.basename),
    (record) => /self[-_]select[-_]dialog/i.test(record.basename) ? 140 : 80);
  addSymbols("弹窗打开与关闭方式", "确认弹窗状态管理和打开方式",
    [/\b(useDialog)\b/, /\b(use[A-Z]\w*(?:Dialog|Modal|Popup))\b/, /\b(open[A-Z]\w*(?:Dialog|Modal|Popup))\b/],
    (symbol) => symbol === "useDialog" ? 140 : /^use/.test(symbol) ? 110 : 90, () => true, 2);
  addSymbols("页面首次进入生命周期", "确认首次进入页面的触发时机",
    [/\b(onAfterInit)\b/, /\b(onMounted)\b/, /\b(onLoad)\b/, /\b(onReady)\b/],
    (symbol) => symbol === "onAfterInit" ? 140 : 90, () => true, 3);
  addFiles("页面弹窗挂载方式", "确认弹窗挂载方式",
    (record) => /^(?:page|index)\.vue$/i.test(record.basename) && /dialog|modal|popup/i.test(record.content),
    (record) => /^page\.vue$/i.test(record.basename) ? 130 : 100, 3);
  addFiles("目标页面弹窗挂载方式", "确认目标页面的弹窗挂载方式",
    (record) => /^(?:page|index)\.vue$/i.test(record.basename) && /dialog|modal|popup/i.test(record.content),
    (record) => /^page\.vue$/i.test(record.basename) ? 130 : 100, 3);

  addSymbols("奖励名称和角标的接口字段", "确认奖励名称和角标对应的接口字段",
    [/\b(do_lottery)\b/, /\b(doLottery)\b/, /\b((?:fetch|get|post|request)\w*(?:Lottery|Reward)\w*)\b/i],
    (symbol) => symbol === "do_lottery" ? 150 : 100);
  addSymbols("抽奖结果到弹窗数据的适配", "确认抽奖结果到奖励弹窗数据的适配方式",
    [/\b(openRewardDialog)\b/, /\b((?:map|adapt|normalize|format)\w*Reward\w*)\b/i],
    (symbol) => symbol === "openRewardDialog" ? 150 : 100);
  addFiles("奖励弹窗的字段渲染", "确认奖励名称和角标的渲染位置",
    (record) => /reward.*(?:dialog|modal|popup).*\.vue$|(?:dialog|modal|popup).*reward.*\.vue$/i.test(record.basename),
    () => 130);

  addSymbols("动态组件名称生成", "确认动态组件名称的生成方式",
    [/\b(dynamicComponentName)\b/, /\b(getDynamicComponentName)\b/, /\b(getComponentName)\b/, /\b((?:build|create|resolve)\w*ComponentName)\b/i],
    (symbol) => /dynamicComponentName|getDynamicComponentName/.test(symbol) ? 140 : 100);
  addSymbols("动态组件注册规则", "确认动态组件的注册或解析规则",
    [/\b(componentRegistry)\b/, /\b(componentMap)\b/, /\b(resolveComponent)\b/, /\b(defineAsyncComponent)\b/, /\b(registerComponent)\b/],
    (symbol) => /Registry|Map/.test(symbol) ? 130 : 100);
  addFiles("实际组件名称", "核对动态名称对应的实际组件名称",
    (record) => record.basename.endsWith(".vue")
      && !/^(?:page|index)\.vue$/i.test(record.basename)
      && !/(?:button|iframe)/i.test(record.basename),
    (record) => {
      const stem = path.basename(record.basename, path.extname(record.basename));
      if (classification.originalRequest.toLowerCase().includes(stem.toLowerCase())) return 200;
      if (dynamicSource.includes(stem)) return 170;
      return /dynamic|reward|dialog|modal|popup/i.test(record.basename) ? 110 : 60;
    });

  const stateEvidence = classification.evidence.filter((item) => item.type === "state").map((item) => item.value);
  for (const value of stateEvidence) result.push(candidate("奖励领取状态判断", value, "确认奖励领取态的判断依据", 1, 150, "user_request"));
  addSymbols("奖励领取状态判断", "确认奖励领取态的判断依据",
    [/\b(isClaimed)\b/i, /\b(hasClaimed)\b/i, /\b(claimed)\b/i, /\b(rewardStatus)\b/i],
    (symbol) => /^isClaimed$/i.test(symbol) ? 140 : 90);
  for (const item of classification.evidence.filter((entry) => entry.type === "resource")) {
    result.push(candidate("icon/mask 资源引用", item.value, "确认领取态蒙层资源及其引用方式", 1, 160, item.source));
  }
  addFiles("奖励节点渲染", "确认领取态 icon/mask 的挂载位置",
    (record) => /reward.*(?:item|node|card|list).*\.vue$|(?:item|node|card|list).*reward.*\.vue$/i.test(record.basename),
    () => 130);

  for (const item of classification.evidence.filter((entry) => entry.type === "target_file")) {
    if (records.some((record) => record.path === item.value.replace(/^\.\//, ""))) {
      result.push(candidate("目标文案位置", item.value, "定位需要修改的文案", 1, 180, item.source));
    }
  }

  if (classification.taskType === "generic") {
    for (const item of classification.evidence) {
      if (item.type === "target_file" && records.some((record) => record.path === item.value.replace(/^\.\//, ""))) {
        result.push(candidate(`${path.basename(item.value)} 中的目标行为`, item.value, "定位目标行为和修改位置", 1, 180, item.source));
      }
      if (item.type === "api_name" && records.some((record) => record.content.includes(item.value))) {
        result.push(candidate(`${item.value} 接口响应`, item.value, "确认接口调用和响应映射", 1, 160, item.source));
      }
      if (item.type === "state") {
        result.push(candidate(`${item.value} 状态判断`, item.value, "确认该状态的判断和渲染分支", 1, 150, item.source));
      }
      if (item.type === "component") {
        const componentFile = records.find((record) => path.basename(record.basename, path.extname(record.basename)).toLowerCase() === item.value.toLowerCase());
        const entry = componentFile?.basename || (records.some((record) => record.content.includes(item.value)) ? item.value : null);
        if (entry) result.push(candidate(`${item.value} 渲染逻辑`, entry, `确认 ${item.value} 的定义和渲染位置`, 1, 160, componentFile?.path || item.source));
      }
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
    if (!item || selected.length >= 5) continue;
    selected.push(item);
    seenEntries.add(item.entry);
  }
  return selected;
}

export async function buildSearchSuggestions(root, classification, skills = []) {
  const records = await searchRecords(root);
  const candidates = codeCandidates(classification, records);
  for (const skill of skills) {
    for (const knowledge of classification.requiredKnowledge) {
      if (!skill.description.includes(knowledge)) continue;
      candidates.push(candidate(knowledge, skill.name, `查阅专门描述“${knowledge}”的 Skill`, 4, 50, skill.path));
    }
  }
  return selectCandidates(classification.requiredKnowledge, candidates);
}
