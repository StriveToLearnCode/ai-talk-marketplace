# AI Talk Plugin

AI Talk 基于用户原话、截图和明确目标文件理解研发需求，建立证据与任务之间的对应关系，并生成可复制执行的提示词；它不执行最终开发任务。

## 工作流

```text
理解用户目标并区分直接证据、AI 语义判断、建议和待确认信息
→ 有界读取最多 3 个明确目标文件
→ 简单任务零命令生成
→ 需要项目 Skill 时只扫描 .agents/skills frontmatter
→ 将截图或附件区域与需求、任务指令逐项对应
→ 首屏只显示目标、事实和执行时自动补充
→ 将紧凑任务和 Skill 执行顺序写入默认折叠的自包含 text 代码块
→ 立即停止
```

## 运行边界

- 本地附件或精确路径最多读取 3 个，每个最多一次、最多 64KB。
- 截图和附件只提取任务相关证据，不输出完整 OCR 清单；存在多个模块或需求时，按“来源或位置 → 直接可见内容 → 对应需求 → 任务指令”建立映射。
- AI 可以基于证据归纳、合并和改写任务目标，但必须把直接证据、AI 语义判断、建议（非需求）和待确认信息分开。
- 未经确认的建议不得变成必须实现的产品行为、验收标准或技术方案。
- 不读取 imports、同目录文件、`AGENTS.md`、项目配置、Git 状态或其他依赖。
- 项目命令最多 1 次，只允许 `build-capability-index.mjs --skills-only`。
- 不读取候选 Skill 正文、reference、脚本或资源。
- 不调用 Skill、Agent、MCP、Figma、飞书、Chrome、浏览器或网络工具。
- Figma、飞书等 URL 不打开；明确附带的本地 `openapi.yaml` 可以读取。
- 不运行 `collect_context.py`、完整项目索引、formatter、lint、测试或构建。
- `$gen-code`、`$ai-test` 等调用语法只作为折叠 fenced `text` 代码块中的待执行提示词；首屏使用不带 `$` 的人类可读名称。
- 接口任务以项目 OpenAPI YAML、真实请求封装和生成类型为权威契约。已类型化响应字段不得降级为 `unknown`，不得增加无依据的转换、normalize helper、业务校验或静默 fallback；一次性响应优先依赖生成类型和调用链推断。

## Skill 路由

```bash
node skills/ai-talk/scripts/build-capability-index.mjs \
  --root /path/to/project \
  --skills-only \
  --intent modify_and_verify \
  --skill-limit 10 \
  --query '这部分需要奖励预览并补测试'
```

索引仅解析 `.agents/skills/**/SKILL.md` frontmatter 的 `name` 和 `description`。功能与测试同时存在时，最终提示词先安排代码 Skill 的 `local-patch + incremental`，再安排测试 Skill 处理目标范围测试；AI Talk 当前轮不会执行两者。

普通 UI 开发默认不追加浏览器自测。只有用户明确要求 UI 自测、浏览器检查、Playwright 验证或页面截图对比时，AI Talk 才在功能和目标测试后安排 `$ai-talk:ui-self-check`。该 Skill 也可以单独调用，默认实际检查、修复本次范围内问题并复验；输入“只检查不修改”时只报告。普通 UI、Figma、截图或 Vue 关键词本身不会触发它。

对会修改代码的任务，最终提示词还要求后续 Codex 完成代码和验证后闭环 PageCenter 依赖。具备 Skill、MCP、项目脚本、账号和权限时必须实际配置并验证；无法代操作或写入失败时，必须在“外部操作：PageCenter”中标记“需要用户手动操作”，说明原因，并按 `text`、`json`、`assets`、`components`、`props` tab 给出可直接照做的 key、填写值或结构示例、目标环境、用途、代码消费位置、操作步骤和未配置影响，不能让用户自行搜索。未完成配置时不得声称任务全部完成。无需配置时明确说明“本次不需要新增或修改 PageCenter 配置”。AI Talk 本轮不会检查具体依赖、生成配置项或推送 PageCenter。

## 输出

AI Talk 首屏输出“目标”“事实”“自动补充”三组短摘要；事实最多 3 条且只来自直接证据，自动补充最多 3 条且统一使用“执行时……”表述。唯一的自包含 `text` Prompt 放在默认关闭的“查看完整 Prompt”区域内，展开后可直接复制。最后输出：

```text
任务话术已生成，当前尚未执行代码修改。
```

输出后不得继续读取或调用工具。简单任务和 Skill 路由任务总耗时目标均为 15 秒内。

普通任务的完整 Prompt 默认不超过 12 行、约 500 个中文字符；复杂任务最多 18 行、约 800 个中文字符。同一事实只出现一次，不输出固定的执行、交付或通用约束段落。

## 验证

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s skills/ai-talk/tests -v
node --test skills/ai-talk/tests/test_build_capability_index.mjs
```

人工新线程验收见 `tests/acceptance-cases.md`。
