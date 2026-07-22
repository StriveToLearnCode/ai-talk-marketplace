# AI Talk V1 冻结规范

> 本文是 `route-company-skills.mjs` 的 legacy CLI 兼容规范。当前 `$ai-talk` 对话行为以 `plugins/ai-talk/skills/ai-talk/SKILL.md` 为准：普通需求只做澄清和风险提醒；诊断请求可执行必要的只读代码检查，UI 异常可直接执行浏览器运行态取证；始终不推荐下游 Skill、不介入编码。

状态：Frozen  
版本：V1 / TaskHandoff 1.1  
生效日期：2026-07-20

本文档是 legacy CLI 路由器的冻结实现标准。正常 `$ai-talk` 对话不得据此扩大职责；对话行为以当前 `SKILL.md` 为准。

## 1. 产品边界

AI Talk 仅负责保持用户原话，并补充公司 Skill、组件、Docs 和仓库检索所需的增量上下文，同时推荐职责匹配且已安装的 Skill。

路由脚本保持只读，但必须从用户原话直接确定 execution mode。明确修改意图使用 `modify_and_verify` 并将 `route.authorization` 设为 `authorized`；明确诊断意图使用 `inspect_only`；明确要求先分析或给方案、确认后再改时使用 `plan_then_execute`。只有真正无法判断是否允许修改时才询问一次。

V1 不包含 `planned_changes`、写范围强制、来源优先级引擎、resolved lifecycle、自动 Skill 调用，以及任何新的顶层研发事实源。

## 2. 固定输出

默认文本输出只能按以下顺序按需包含六个模块，不得增加、改名或重排：

1. `🧩 已补充上下文`，最多 2 条高价值事实
2. `🧠 AI 判断`，1～2 句任务专属工程判断
3. `🔍 公司检索入口`，最多 3 项真实命中
4. `⚠️ 需要确认`，仅有硬阻塞时出现，最多 1 条
5. `🧪 定责条件`，仅故障归属诊断时出现
6. `▶ 下一步`

已补充上下文只包含附件、代码或原话支持的高价值新增事实，不输出泛化关键词清单。AI 判断必须根据现象缩小范围、说明优先排查层，并保留不确定性。公司检索入口使用“知识对象 → 真实入口（用途）”；标准 Bug 应在预算内覆盖至少两个不同排查层，不得找到一个入口即早停。普通输出不得展示改写后的任务目标、截图完整描述、扫描信息、通用边界、验收标准、AGENTS、README、普通依赖、非阻塞 unknown 或调试字段。无需新增上下文、工程判断和真实入口时设置 `skipEnhancement: true`，输出“当前需求已经明确，无需额外增强。”后直接显示下一步。

`--format json` 保留现有 V1 兼容输出结构；`--debug-json` 才能增加 `_debug`。`execution_prompt` 必须且只能由 TaskHandoff 单向渲染，不得反向解析文本形成执行事实。

## 3. TaskHandoff 1.1

内部唯一事实源固定为以下结构，字段顺序与顶层字段集合均为协议的一部分：

```yaml
schema_version: "1.1"
route: { skill, authorization }
workspace: { project_root, workdir }
workflow: { execution_mode, next_skill, stage: { value, source, status } }
task: { source_request, deliverable, reasoning }
knowledge_requirements: []
retrieval: []
target_scope: []
source_facts: []
constraints: []
blockers: []
verification: []
```

约束：

- `route.authorization` 只能是 `inspect_only` 或 `authorized`。
- `workflow.execution_mode` 使用 `modify_and_verify`、`inspect_only`、`plan_then_execute`；兼容的纯方案任务可保留 `plan_only`。
- `workflow.next_skill` 仅供 `plan_then_execute` 保存已安装的实施 Skill；确认后将其移动到 `route.skill` 并清空。
- `knowledge_requirements` 最多 4 项，`retrieval` 最多 3 项。
- `source_facts` 只保存 `fact` 或带置信度的 `inference`；`unknown` 必须进入 `blockers`。
- 代码诊断事实使用 `diagnostic_fact`，保留 `control | data | render` 层次、稳定 `signal`、原始描述和源码来源；用户指定的 `文件:行号` 必须进入 `target_scope.line`。
- 新 blocker 固定包含 `kind`、`description`、`status: unknown`、`resolution` 和 `blocking`；必须继续读取旧字符串 blocker。
- `verification` 保存行为级 assertion；故障归属诊断使用 `responsibility_condition` 保存可观察条件和责任层，不伪造 lint、test 或 e2e 命令。
- 旧顶层兼容字段只能从 TaskHandoff 投影，不得形成平行事实源。
- `development_context`、`ui_requirements`、`interaction_requirements`、`data_requirements`、`reusable_resources`、`acceptance_assertions` 不得成为顶层字段。

## 4. 三阶段边界

处理链固定为单向三阶段：

1. 理解：只消费用户输入与 typed evidence，产出任务意图、目标、事实、知识对象和边界所需信号。
2. 检索：只消费理解阶段生成的 RetrievalRequest 和允许的 Skill `name/description` 索引，产出有来源证据的上下文与入口。
3. Formatter：只消费已校验的 TaskHandoff，输出固定文本；不得读取原始输入、项目文件、Skill 或旧兼容字段。

任何阶段不得通过解析 Formatter 文本向前一阶段回填事实。

## 5. 上下文预算与早停

- 单个文件正文上限：128 KiB；超限不得读取。
- 项目上下文正文默认上限：5 个文件；多图 UI 任务不得超过 5 个。
- 多图 UI 默认只读取用户原话与附件、一个用户明确目标文件、该文件就近一份 `AGENTS.md`、最多一个目标文件真实引用的同类实现，以及最多一个真实资源或 Page Center 来源。
- 没有显式目标文件的多图 UI 任务不得触发全仓兜底搜索；其他任务的同类实现正文最多读取 1 个。
- 候选文件只做元数据初筛，最多 240 项；跳过 `.git`、`.agents`、`.codex`、`node_modules`、`dist`、`build`、`coverage`、Docs、隐藏目录和符号链接。
- 项目外路径、仓库外符号链接、`node_modules`、缺失或不可读目标必须拒绝；缺失显式目标不得触发全仓兜底搜索。
- Skill 发现只读取配置范围内 `SKILL.md` 的 frontmatter `name/description`，不读取正文用于路由。
- 公开检索入口最多 3 项；当目标图、目标文件、2～3 个可靠入口、当前阶段与高置信 Skill 已确认时立即停止扩展。
- 推荐入口必须有用户明确指定、目标真实引用、内容结构匹配、同类实现真实使用、明确组件文档或 Skill 索引中的至少一种证据。文件名只能用于限量初筛。

## 6. 证据与截图

typed evidence 必须包含 `kind` 和 `source`。事实与推断必须包含合法 `status`；推断必须包含 `confidence: high | medium | low`；blocker kind 必须使用 `status: unknown`。

附件使用稳定的 `attachment_N`，并保留 `target | reference | comparison` 角色。截图只证明直接可见表现，不得据此猜接口字段、业务枚举、资源 key、页面路径或组件名。用户明确的交互和进度语义可作为 fact；未定位的数据、页面、组件和资源 key 进入非阻塞的 search-resolvable blocker。Page Center 资源只在有事实时保留 provider、附件来源和复用关系。

## 7. Skill 路由与执行

Skill 推荐只基于已安装索引中的职责匹配。目标 Skill 不存在时保持空值，并生成安装、启用或 `--source-root` 的硬阻塞；不得改选其他职责 Skill。

`inspect_only` 的代码诊断不以代码修改为目标，因此不推荐 `gen-code`，也不生成 Skill 缺失阻塞。操作后“没变化、未更新、不生效”等状态未同步现象必须归类为 Bug；在缺少请求证据时不得直接判定为前端或后端，更不得描述为新增页面功能。

状态未同步与“前端还是后端”诊断固定沿三层故障链检索：控制层检查点击、确认和失败关闭；数据层检查接口响应、状态回写和请求锁；渲染层检查页面最终消费字段。定责条件至少包含：操作失败但页面仍关闭属于前端错误处理；响应已有新值但页面仍显示旧值属于前端状态同步；操作成功且重新查询仍返回旧值属于后端持久化或查询。

明确修改动作在首轮完成授权，并直接 handoff 到 `execution_plan.route.skill`。宿主支持下游调用时同轮继续；不支持时 Formatter 只显示一个建议 Skill 入口，不输出授权口令或重复按钮。`plan_then_execute` 完成方案后只确认一次，确认只更新 mode、阶段和授权状态。

`inspect_only` 诊断收到“执行”“开始执行”等续接词时，仍保持 `inspect_only` 和空 Skill；直接复用上一轮的 `retrieval`、`source_facts`、`verification`、约束与阻塞继续抓包或代码检查，不重新分类、不重新扫描，也不添加修改授权阻塞。

## 8. V1 黄金用例

V1 固定 8 个黄金用例，覆盖：新增弹窗首次进入打开、奖励元数据缺失、动态组件未注册、奖励领取态蒙层、状态图片异常、明确文件文案修改、浏览器只读检查、只输出实施方案。

黄金回归必须走真实路由链，逐项校验 TaskHandoff 顶层结构、最终 Formatter 文本、建议 Skill，并记录总处理时间、读取文件数、Skill 正文读取数、搜索扩展次数和早停原因。简单任务不超过 15 秒，标准任务不超过 45 秒，多图任务不超过 60 秒；多图任务默认读取文件不超过 5 个，Skill 正文默认读取 0 个。CLI 路由测试不得修改被分析项目。
