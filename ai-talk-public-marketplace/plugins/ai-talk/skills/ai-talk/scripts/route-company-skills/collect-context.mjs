import { open, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { explicitTargetFiles } from "./classify-request.mjs";
import { MAX_DIRECT_DEPENDENCIES, MAX_FILE_BYTES } from "./rules.mjs";

const IMPORT_EXTENSIONS = ["", ".vue", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".less"];

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

export function buildSearchSuggestions(classification) {
  const evidence = classification.evidence;
  const result = [];
  const add = (value) => {
    if (value && !result.includes(value)) result.push(value);
  };
  for (const item of evidence.filter((entry) => entry.type === "target_file")) add(`定位 ${item.value} 的直接引用与状态分支`);
  for (const item of evidence.filter((entry) => entry.type === "component")) add(`检索 ${item.value} 的定义与调用处`);
  for (const item of evidence.filter((entry) => entry.type === "api_name")) add(`检索接口 ${item.value} 的调用与响应映射`);
  for (const item of evidence.filter((entry) => entry.type === "state")) add(`检索状态 ${item.value} 的判断与渲染分支`);
  for (const item of evidence.filter((entry) => entry.type === "target_page")) add(`定位 ${item.value} 页面入口和直接组件`);

  if (classification.intent.desired_output === "code_changes") {
    add("在目标模块内检索问题文案、状态值或资源名");
    add("查找目标组件的直接调用和相邻测试");
    add("确认目标模块现有测试或最小验证命令");
  } else if (classification.intent.desired_output === "live_page_findings") {
    add("确认目标页面入口或本地访问地址");
    add("检查页面控制台错误与失败网络请求");
    add("复核主要交互和响应式断点");
  } else if (classification.intent.desired_output === "automated_test") {
    add("定位现有 Midscene 测试与运行命令");
    add("定位目标页面入口和稳定断言点");
    add("检索同目录测试约定与夹具");
  } else if (classification.intent.desired_output === "implementation_plan") {
    add("定位目标页面入口和关键组件");
    add("确认相关接口与状态映射");
    add("查找可复用的同类实现");
  } else if (classification.intent.desired_output === "figma_analysis_document") {
    add("确认 Figma 页面层级和核心组件");
    add("梳理页面状态与交互流转");
    add("确认分析文档的目标路径或格式");
  }
  return result.slice(0, 5);
}
