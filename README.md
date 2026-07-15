# AI Talk

AI Talk 是一个基于证据理解研发需求、建立截图或附件与任务指令对应关系的 Codex 插件。它生成可复制的任务提示词，但不会执行提示词中的任务。

AI Talk 可以结合用户原话、截图和最多 3 个明确本地目标文件，把直接证据、AI 语义判断、建议与待确认信息分层，并建立“图片位置或模块 → 可见内容 → 对应需求 → 任务指令”的映射。新增交互、业务逻辑或测试任务时，最多再运行一次 `.agents/skills` frontmatter 索引。它不扫描项目、不读取依赖或下游 Skill 正文，也不访问 Figma、飞书或浏览器，不修改代码和运行测试。

```text
用户自然语言
→ 有明确文件：有界读取最多 3 个目标文件
→ 有截图或多模块：建立证据与需求的对应关系
→ direct：不扫描项目，直接整理
→ discovery：一次 frontmatter-only Skill 索引
→ 把紧凑任务、$skill-name 和执行顺序写入一个自包含的 text 代码块
→ 输出提示词并立即停止
```

## 安装

面向其他用户的完整安装、调用、更新和常见问题说明见 [USAGE.md](USAGE.md)。

```bash
codex plugin marketplace add StriveToLearnCode/ai-talk-marketplace --ref master
codex plugin add ai-talk@personal
```

安装或更新后新建 Codex 对话，让新线程加载最新 Skill。

本地开发安装：

```bash
codex plugin marketplace add "$PWD"
codex plugin add ai-talk@personal
```

## 使用

安装后，AI Talk 只在显式调用时启用：

```text
$ai-talk <自然语言研发需求>
```

```text
$ai-talk 修改 src/page.vue 中的错误语法，保留业务逻辑
$ai-talk 这部分需要奖励预览，完成后补目标范围测试
$ai-talk 审查 src/utils/reward.ts，只审查不要修改
```

## 有界提示词模式

- 本地附件和精确路径可以读取；最多 3 个文件，每个最多读取一次、最多 64KB。
- 截图只整理任务相关区域，不机械抄录全部文字；AI 语义判断必须能回指直接证据。
- 推测性内容放在“建议（非需求）”或“待确认信息”，未经确认不得写成硬性实现要求。
- 不跟踪 imports，不读取同目录文件、`AGENTS.md`、项目配置、Git 状态或其他依赖。
- 第 4 个及之后的文件不读取，写入提示词交给后续 Codex。
- `discovery` 只运行一次 `build-capability-index.mjs --skills-only`。
- 索引只使用 `.agents/skills/**/SKILL.md` 的 `name` 和 `description` frontmatter，不读取正文。
- 不运行 `collect_context.py`，不搜索组件、模板、历史实现或项目规则。
- 不调用 `$gen-code`、`$ai-test` 或其他 Skill；这些名称只出现在 fenced `text` 代码块中。
- Figma、飞书等 URL 不打开；本地 `openapi.yaml` 等明确附件可以有界读取。
- 接口任务要求后续 Codex 以 OpenAPI YAML 和生成类型为权威契约，不把已类型化响应字段降级为 `unknown`，不添加无依据的 normalize、业务校验或静默 fallback。
- 输出“任务话术已生成，当前尚未执行代码修改”后立即停止。

最终先展示最多 4 行的“需求理解”摘要，再给出一个无需依赖摘要、可直接复制给后续 Codex 的 `text` 代码块。普通任务默认限制为 20 行、约 900 个中文字符；复杂任务最多 30 行、约 1400 个中文字符。相同事实只写一次，不再输出重复的证据段和通用“工程实现约束”清单。

功能开发与测试同时存在时，提示词安排后续 Codex 先执行代码 Skill，再执行测试 Skill。例如候选为 `gen-code` 和 `ai-test` 时：

```text
1. 使用 $gen-code，以 local-patch + incremental 模式完成目标范围功能并验证。
2. 功能完成后使用 $ai-test，仅生成或执行目标范围测试。
```

普通 UI 开发默认不追加浏览器自测。只有用户明确要求 UI 自测、浏览器检查、Playwright 验证或页面截图对比时，AI Talk 才在功能和目标测试后安排 `$ai-talk:ui-self-check`；也可以在开发完成后单独调用：

```text
$ai-talk:ui-self-check 检查 recharge tab2 的移动端布局和交互
$ai-talk:ui-self-check 只检查不修改
```

该 Skill 会实际使用 Playwright MCP 或等价浏览器能力检查页面，默认修复本次范围内问题并复验；“只检查”模式只报告。普通 UI、Figma、截图或 Vue 关键词本身不会触发它。

所有会修改代码的提示词还会要求后续 Codex 在收尾时闭环 PageCenter 依赖。具备 Skill、MCP、项目脚本、账号和权限时必须实际配置并验证；无法代操作或写入失败时，必须在“外部操作：PageCenter”中标记“需要用户手动操作”，说明原因，并按 `text`、`json`、`assets`、`components`、`props` tab 给出可直接照做的 key、填写值或结构示例、目标环境、用途、代码消费位置、操作步骤和未配置影响，不能让用户自行搜索。未完成配置时不得声称任务全部完成。无需配置时必须明确说明“本次不需要新增或修改 PageCenter 配置”。AI Talk 当前轮不会自行检查依赖、生成具体配置项或推送 PageCenter。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s plugins/ai-talk/skills/ai-talk/tests -v
node --test plugins/ai-talk/skills/ai-talk/tests/test_build_capability_index.mjs
```

人工验收用例见 [acceptance-cases.md](plugins/ai-talk/tests/acceptance-cases.md)。
