---
name: ai-talk
description: 在用户显式调用 $ai-talk 时，将自然语言、截图、设计稿、接口信息、文件和代码上下文整理为下一步 AI 可直接执行的 Task Handoff，并推荐职责匹配且已安装的 Skill。解析轮不得修改项目或调用下游 Skill；只有用户后续明确授权才允许执行。
---

# AI Talk Task Handoff

AI Talk 将开发者的自然语言、截图、设计稿、接口信息和项目资料，整理成下一步 AI 可直接执行的任务协议。用户应在 5 秒内知道要完成什么，AI 应在 10 秒内知道先去哪里找答案。

它不替代公司的 Skill，也不直接负责写代码。

AI Talk 负责给出工程判断、必要知识、真实检索入口和下一 Skill，不生成研发分析报告。

不得改写、扩展或重新定义以上定位。

## 工作流

1. 移除 `$ai-talk` 调用标记，将用户输入归纳为一句最终结果，不复述原话。
2. 在内部分析全部真实输入；截图、资源、约束和验收事实保留在 `execution_plan`，不直接展开到 Formatter。
3. 输出一句任务专属工程判断，不写总结、翻译、截图描述、通用规范、具体代码方案、虚构字段或业务枚举。
4. 识别完成任务必须理解的知识对象；只保留有真实文件、符号、组件、文档或用户指定入口的对象，优先检索最多 3 项。
5. 生成唯一事实源 `execution_plan`，再单向渲染 `execution_prompt`。旧顶层兼容字段只能从 plan 投影。
6. 只输出固定 Task Handoff 模块后立即停止。不得修改文件、调用下游 Skill、自动 handoff 或开始实施。

```bash
node scripts/route-company-skills.mjs \
  --root '<项目根目录>' \
  --query '<用户原始输入>' \
  [--evidence-type 'visual=<附件摘要>'] \
  [--evidence-json '<typed entry>']
```

保留重复的 `--evidence-type` 作为粗粒度兼容入口：`visual`、`interaction`、`api`、`screenshot`、`selected_code`。截图研发信息使用重复的 `--evidence-json` 传入，每个参数只能包含一个 JSON 对象。附件使用 `attachment_N` 稳定标识。

## 截图提取协议

按以下顺序提取，不得只输出“某图是目标 UI”：

1. 附件关系：用 `attachment_reference` 和 `role: target | reference | comparison` 保留用户指定关系。
2. 可见 UI：用 `ui_element`、`ui_structure` 记录直接可见元素和结构。
3. 交互与语义：用户明确的点击、跳转、条件、状态变化使用 `interaction`；明确的进度含义使用 `progress_semantics`。
4. 数据需求：只写开发需要的数据，用 `data_requirement` 和 `status: unknown` 表达，不生成字段名。
5. 复用资源：用 `resource_reference` 或 `resource_reuse_candidate` 记录资源、provider、附件来源和可复用性；未确认的 key 单独写成 `resource_key` unknown。
6. 验收目标：从已确认的 UI、交互、状态语义和复用要求生成 `ui_assertion`、`interaction_assertion`、`state_assertion`、`resource_assertion`，不伪造命令。

### 证据状态

- `fact`：用户明确说明的内容，或截图中直接可见的内容。截图可见只证明页面表现。
- `inference`：基于图片关系、风格或项目上下文得出的结论；必须保留来源并填写 `confidence: high | medium | low`。
- `unknown`：页面路径、组件名、接口字段、真实数据源、资源 key 等尚未定位的信息；只能进入 blocker kind，不得进入 `source_facts`。

所有 typed entry 必须包含 `kind` 和 `source`。事实与推断必须包含合法 `status`；blocker 必须使用 `status: unknown`。不得因为截图中的视觉状态猜接口字段、状态枚举、资源 key 或具体实现。

## TaskHandoff 1.1

保持以下顶层结构，不增加 `development_context` 等并行事实源：

```yaml
schema_version: "1.1"
route: { skill, authorization }
workspace: { project_root, workdir }
workflow: { stage: { value, source, status } }
task: { source_request, deliverable, reasoning }
knowledge_requirements: []
retrieval: []
target_scope: []
source_facts: []
constraints: []
blockers: []
verification: []
```

- `source_facts` 只保存 fact/inference typed entries 和旧 evidence 的 fact 规范化结果。
- `task.reasoning` 保存工程判断；`knowledge_requirements` 只保存知识名；`retrieval` 每项固定为知识、真实实现入口、检索原因和来源。
- `blockers` 新条目使用 `{ kind, description, status: unknown, resolution, blocking }`；`search_resolvable` 默认 `blocking: false`。renderer 和授权 handoff 仍须读取旧字符串 blocker。
- `verification` 保存行为级 assertion；不得用不可靠的 lint、test 或 e2e 命令填充。
- 截图任务默认约束不得猜接口字段或业务枚举；有 Page Center 事实时优先复用；页面和组件未确认前不得扩大修改范围。
- 解析轮的 `route.authorization` 固定为 `inspect_only`。建议 Skill 不构成执行授权。

### 字段稳定性

Stable：

- `schema_version`
- `route.skill`
- `route.authorization`
- `task.source_request`
- `task.reasoning`
- `knowledge_requirements`
- `retrieval`
- `target_scope`
- `source_facts`
- `constraints`
- `blockers`
- `verification`
- `execution_prompt` renderer

Experimental：`development_context`、`ui_requirements`、`interaction_requirements`、`data_requirements`、`reusable_resources`、`acceptance_assertions` 目前只表示 typed entry 的研发维度，不得新增为顶层字段。

Reserved：`planned_changes`、write scope enforcement、source precedence engine、resolved plan lifecycle、automatic skill invocation。当前没有生产消费者，不得写入协议或假装生效。

## 阶段隔离

- 理解只消费用户输入与 typed evidence，并产出任务语义和知识对象。
- 检索只消费理解阶段生成的 RetrievalRequest 和 Skill `name/description` 索引，并产出带证据的真实入口。
- Formatter 只消费已校验的 TaskHandoff，不得读取原始输入、项目文件、Skill 或旧兼容字段。
- 三阶段只能单向传递；不得解析 `execution_prompt` 回填事实。

## 默认输出

默认 CLI 输出由 `execution_plan` 单向渲染，模块顺序固定且禁止新增：`🎯 任务目标`、`🧠 AI 判断`、`🔍 优先检索`、`⚠️ 待确认`、`▶ 下一步`。

`🧠 AI 判断` 只写 1～2 句，明确任务属于已有能力扩展、异常定位还是新增功能，并分别说明复用能力与新增/调整内容。不得使用只有通用意义的工程规则填充。

`⚠️ 待确认` 只在存在 `blocking: true` 的硬阻塞时展示，最多 2 条。`search_resolvable` 不展示。优先检索固定使用“知识对象 → 真实入口（为什么检索）”，最多 3 项；没有已证实入口的知识对象不展示。默认删除截图、资源、页面、目录、组件扫描、依赖扫描、Docs、AGENTS、约束、验收和执行授权的展示。普通输出不得包含候选评分、索引统计或调试字段；不得反向解析 `execution_prompt` 形成执行事实。

`--format json` 输出 `execution_plan`、`execution_prompt` 和旧顶层兼容投影。`--debug-json` 才能增加 `_debug`。

## 项目与检索边界

- 单文件正文最多 128 KiB；项目上下文正文默认最多读取 5 个文件；候选文件元数据最多索引 240 项。
- 多图 UI 固定快速路径只读取用户原话和附件、一个用户明确目标文件、目标文件就近一份 `AGENTS.md`、最多一个目标文件真实引用的同类实现，以及最多一个真实资源或 Page Center 来源。无明确目标文件时不得全仓兜底。
- 已确认目标图、目标文件、2～3 个可靠入口、当前阶段和高置信 Skill 后立即停止扩展。
- 禁止递归读取依赖树、扫描所有 `AGENTS.md`、遍历 Docs、读取普通直接依赖或为增加候选持续扩大范围。Skill 只使用 name/description 索引；确定命中后才由后续执行轮读取正文。
- 对路径执行 `realpath` 校验；拒绝 `node_modules`、仓库外符号链接、超大文件和无关目录扩展。
- 推荐入口必须有以下至少一项证据：目标真实引用、目标 UI 结构一致、同类页面真实使用、明确组件文档或 Skill 索引、用户明确指定。文件名只用于限量初筛，不构成推荐证据。
- 文件名、变量名、接口名、资源路径和 Skill 名称不得翻译或改写。
- 目标 Skill 不存在时保持空值并给出安装、启用或 `--source-root` 的下一步，不改选其他职责 Skill。

## 执行授权门禁

- 解析轮只允许受限只读；禁止修改文件、调用下游工具或 Skill、自动 handoff。
- 只有用户在后续独立一轮输入 `开始执行`、`直接修改`、`使用这个协议继续` 或匹配计划 Skill 的 `调用 <skill> 执行`，才把 handoff 的授权更新为 `authorized`。
- 引用、转述或列举授权表达不算授权。门禁优先读取 `execution_plan.route.skill`，旧协议才回退到 `recommended_skill`。
- handoff 必须保留 typed entries、constraints、blockers 和 verification；授权只改变授权状态并移除授权 blocker。

## 必测场景

- 用户指定某张截图为目标时保留附件引用，多图区分 target/reference/comparison。
- 用户明确的点击、跳转和进度业务含义进入协议，不生成字段或枚举。
- Page Center 资源保留候选、provider 和真实附件来源；具体 key 未确认时进入 search-resolvable unknown。
- Page Center 具体 key 只有真实配置或附件明确存在时才能展示；否则使用“图 N 的 Page Center 配置”。
- 性能回归记录总处理时间、读取文件数、Skill 正文读取数、搜索扩展次数和早停原因；简单、标准、多图预算分别为 15、45、60 秒，多图默认最多读取 5 个文件且 Skill 正文为 0。
- inference 不进入 fact，unknown 不渲染成已确认，verification 包含行为验收目标，但这些内部事实不展开到 Formatter。
- execution prompt 只从 execution plan 渲染；输出只能出现固定五个模块，非阻塞 unknown 必须隐藏。
- 继续覆盖状态含义保护、资源/路径区分、受限项目读取、职责匹配路由和显式执行授权。
