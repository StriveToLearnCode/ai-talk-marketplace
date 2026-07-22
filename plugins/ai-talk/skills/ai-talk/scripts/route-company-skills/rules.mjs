export const MAX_FILE_BYTES = 128 * 1024;
export const MAX_CONTEXT_FILES_READ = 4;
export const MAX_INDEXED_FILES = 240;
export const MAX_SIMILAR_IMPLEMENTATIONS = 3;
export const MAX_RETRIEVAL_ENTRIES = 3;
export const EARLY_STOP_RETRIEVAL_ENTRIES = 3;
export const MAX_SKILL_METADATA_BYTES = 16 * 1024;
export const MAX_SEARCH_EXPANSIONS = 2;
export const TARGET_PROCESSING_MS = 45_000;

export const SKILL_ROUTES = {
  "ui-self-check": {
    desiredOutput: "live_page_findings",
    action: "inspect",
    target: "page",
    terms: ["打开页面", "浏览器检查", "视觉", "交互", "响应式", "控制台", "网络请求"],
  },
  "ai-test": {
    desiredOutput: "automated_test",
    action: "test",
    target: "test",
    terms: ["midscene", "自动化测试", "测试文件", "生成测试", "运行测试"],
  },
  "gen-code": {
    desiredOutput: "code_changes",
    action: "modify",
    target: "code",
    terms: ["实现", "开发", "修改", "修复", "写代码", "生成代码"],
  },
  "gen-frontend-plan": {
    desiredOutput: "implementation_plan",
    action: "plan",
    target: "frontend",
    terms: ["实施方案", "实施计划", "前端方案", "只出方案", "docs/plan"],
  },
  "figma-analyze": {
    desiredOutput: "figma_analysis_document",
    action: "analyze",
    target: "figma",
    terms: ["figma", "分析文档", "原型分析", "交互文档"],
  },
};

export const KEYWORDS = {
  analysisOnly: ["只分析", "仅分析", "只定位", "只排查", "只检查", "只报告", "不修改", "不要修改", "不要改代码", "不修复"],
  diagnostic: ["排查", "为什么", "分析", "定位原因", "只看看", "只看一下"],
  automatedTest: ["midscene", "自动化测试", "测试文件", "生成测试", "写测试", "运行测试", "跑测试"],
  plan: ["实施方案", "实施计划", "前端方案", "前端计划", "只出方案", "docs/plan"],
  noCode: ["不修改代码", "不要修改代码", "不要改代码", "不生成代码", "只出方案"],
  code: ["实现", "开发", "修改", "修复", "直接改", "改一下", "改成", "修一下", "接入", "写代码", "生成代码", "生成页面代码", "改造", "新增", "增加", "做出来", "做页面", "做组件"],
  bug: ["有问题", "异常", "报错", "错误", "冲突", "不一致", "缺失", "未注册", "不生效", "没变化", "没有变化", "无变化", "未变化", "没显示", "没有显示", "不显示", "未切换", "不切换", "没有更新", "未更新", "不更新", "时有时无", "一会展示、一会不展示", "一会显示、一会不显示", "定位并修复"],
  inspect: ["打开页面", "看看页面", "浏览器", "控制台", "网络请求", "截图对比"],
  figma: ["figma"],
  analyze: ["分析", "梳理", "检查", "看一下"],
  document: ["分析文档", "markdown", "文档", "报告"],
  screenshotEvidence: ["见截图", "参考截图", "截图如下", "根据这张图", "这张截图"],
  designEvidence: ["设计稿", "视觉稿", "原型链接"],
  apiEvidence: ["openapi", "接口文档", "接口信息", "api 文档"],
};

export const EVIDENCE_TYPE_ALIASES = {
  screenshot: "screenshot",
  image: "screenshot",
  visual: "design",
  visual_design: "design",
  design: "design",
  mockup: "design",
  figma: "figma",
  api: "api",
  interface: "api",
  openapi: "api",
  api_document: "api",
  selected_code: "selected_code",
  code_selection: "selected_code",
};

export const EVIDENCE_LABELS = {
  screenshot: "用户提供的截图",
  design: "用户提供的设计稿",
  figma: "用户提供的 Figma",
  api: "用户提供的接口资料",
  selected_code: "用户选中的代码",
};

export const CONFUSION_GROUPS = [
  ["ui-self-check", "ai-test"],
  ["gen-code", "gen-frontend-plan"],
  ["figma-analyze", "gen-code"],
];

export const EXECUTION_REQUESTS = new Set([
  "执行",
  "开始执行",
  "直接修改",
  "确认执行",
  "确认修改",
]);
